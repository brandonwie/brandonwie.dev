---
title: FastAPI에서 startup dependency를 non-blocking으로 만들기
description: 'FastAPI의 lifespan code는 application이 request를 받기 전에 실행돼요. startup이 Kafka 같은 optional dependency를 await하면, 그 dependency 없이도 안전하게 route를 serve할 수 있는데도 Cloud Run cold start가 health check + E2E probe를 실패시킬 수 있어요.'
date: 2026-04-29T00:00:00.000Z
updated: '2026-05-06'
tags:
  - backend
  - python
  - fastapi
  - kafka
  - cloud-run
  - transferable
category: backend
draft: false
lang: ko
source_lang: en
source_slug: fastapi-nonblocking-startup-dependencies
source_updated: 2026-05-06T00:00:00.000Z
translation_date: '2026-05-06'
---

FastAPI의 lifespan은 앱이 요청을 받기 전에 실행돼요. 그래서 startup이 Kafka 같은 optional dependency를 await하면, 그 dependency 없이도 라우트를 안전하게 처리할 수 있는데도 Cloud Run cold start에서 health check와 E2E probe가 실패하기도 해요. 헷갈리는 부분은 신호 자체예요. Kafka producer 실패가 마치 서비스 startup 실패처럼 보이지만, 실제 계약은 더 좁아요 — 노트 생성은 이벤트가 best-effort 관측용일 뿐이라면 Kafka를 기다리면 안 돼요.

여기서 얻을 수 있는 교훈은 정합성을 좌우하는 dependency(database, auth)와 관측성을 좌우하는 dependency(event bus, audit fan-out, cache warmer)를 구분하는 거예요. 앞쪽은 startup을 막아야 해요. 뒤쪽은 절대 막으면 안 되고요.

## producer는 background, 요청은 foreground

optional producer는 lifespan 동안 background task로 띄우고, task handle은 shutdown 정리를 위해 `app.state`에 보관하세요. 요청 경로는 이벤트 발행을 fire-and-forget으로 처리하고, 실패는 비즈니스 작업을 실패시키지 않으면서 로그만 남겨요.

```python
app.state.kafka_init_task = asyncio.create_task(start_kafka_producer())

with suppress(asyncio.CancelledError):
    app.state.kafka_init_task.cancel()
    await app.state.kafka_init_task
await stop_kafka_producer()
```

이게 동작하는 이유는 두 가지예요. 첫째, `asyncio.create_task`는 producer 초기화를 예약만 하고 lifespan 진행을 막지 않아요 — producer가 백그라운드에서 연결되는 동안 앱은 올라오는 절차를 마저 끝내요. 둘째, cancel 후 await하는 shutdown 순서가 필요한 이유는 `stop_kafka_producer()`도 깔끔하게 돌아가야 할 수 있고, shutdown이 떨어질 때 초기화가 아직 진행 중인 경우도 다뤄야 하기 때문이에요.

## 연결 여부가 아니라 지연으로 test하세요

소켓 기반 test를 직접 거는 방식은 잘 깨져요 — Kafka 가용성이 CI 환경마다 다르고, connection-refused 에러가 원래 startup이 멈추던 증상을 안정적으로 재현하지 않거든요. 실제로 버그를 잡아주는 회귀 검사는 지연 시간 기반이에요. `start_kafka_producer()`를 느린 stub으로 바꿔서, lifespan 완료가 서비스 startup 예산을 넘어가지 않는지 확인하는 형태죠.

이런 모양의 test가 "실수로 다시 블로킹으로 돌아가지 않았나"를 잡는 데 일반적으로 더 단단해요. 실제 실패 양상은 "lifespan이 event loop를 너무 오래 잡고 있었다"이지 "dependency가 실패했다"가 아니에요 — 그래서 test도 event loop를 잡고 있는 동작을 겨냥해야 해요.

## 이게 맞는 상황

이 패턴은 dependency가 텔레메트리, audit fan-out, cache warming, 이벤트 전파에는 유용하지만 API가 핵심 트래픽을 받는 데 꼭 필요하지는 않을 때 써요. 지켜야 할 안전 불변식은 하나예요. 그 dependency가 필요 없는 요청 경로가, 그게 다운됐다는 이유로 막히면 안 돼요.

정합성, 영속성, 인가에 꼭 필요한 dependency는 백그라운드로 돌리지 마세요. 앱이 그것 없이 안전하게 응답할 수 없다면, startup을 시끄럽게 실패시키고 플랫폼이 재시작하거나 페이징하도록 두는 게 맞아요. 정합성에 결정적인 dependency를 백그라운드로 빼면 startup 시점의 실패가 진단하기 더 어려운 런타임 실패로 바뀌는 거라, 분명히 더 나쁜 선택이에요.

## 실용적인 정리

optional dependency는 lifespan 안에서 `asyncio.create_task`로 띄우고, task handle은 shutdown을 위해 `app.state`에 보관하세요. 느린 stub으로 test하면 돼요 — 신경 써야 할 실패 양상은 "event loop를 너무 오래 막는다"이고, 지연 시간을 기준으로 두는 단언이 단순한 연결 확인보다 이 양상을 더 안정적으로 잡아줘요. "이건 막는다" vs "이건 백그라운드로 돌린다"의 경계선은, 요청 경로가 그것 없이 안전하게 응답을 돌려줄 수 있느냐예요.

## References

- [FastAPI Lifespan Events](https://fastapi.tiangolo.com/advanced/events/)
- [Python asyncio Coroutines and Tasks](https://docs.python.org/3/library/asyncio-task.html)
