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

FastAPI의 lifespan code는 application이 request를 받기 전에 실행돼요. startup이 Kafka 같은 optional dependency를 await하면, API가 그 dependency 없이도 안전하게 route를 serve할 수 있는데도 Cloud Run cold start에서 user-facing health check + E2E probe가 실패할 수 있어요. 헷갈리는 signal: Kafka producer 실패가 service startup 실패처럼 보이는데, 실제 contract는 더 좁았어요 — note creation은 event가 best-effort observability일 때 Kafka를 기다리면 안 돼요.

이전 가능한 교훈은 correctness를 게이팅하는 dependency(database, auth)와 observability를 게이팅하는 dependency(event bus, audit fan-out, cache warmer)의 구분이에요. 첫 번째는 startup을 막아야 해요. 두 번째는 절대 막으면 안 되고요.

## producer는 background, request는 foreground

optional producer는 lifespan 동안 background task로 시작하고, shutdown cleanup을 위해 task handle을 `app.state`에 두세요. request path는 event publishing을 fire-and-forget으로 다루고, 실패는 business operation을 실패시키지 않으면서 log해요.

```python
app.state.kafka_init_task = asyncio.create_task(start_kafka_producer())

with suppress(asyncio.CancelledError):
    app.state.kafka_init_task.cancel()
    await app.state.kafka_init_task
await stop_kafka_producer()
```

이게 동작하는 이유는 두 가지예요. 첫째, `asyncio.create_task`가 producer 초기화를 lifespan continuation을 막지 않고 schedule해요 — producer가 background에서 connect하는 동안 app은 올라오는 걸 끝내요. 둘째, cancel-then-await shutdown 시퀀스가 필요한 이유는 `stop_kafka_producer()`도 깔끔하게 실행돼야 할 수 있고, shutdown이 fire될 때 init이 아직 진행 중인 케이스를 다뤄야 하기 때문이에요.

## connectivity가 아니라 latency로 test하세요

직접 socket 기반 test는 flaky해요 — Kafka availability가 CI 환경마다 다르고, connection-refused error가 원래 startup-stall 증상을 안정적으로 재현하지 않거든요. 실제로 버그를 잡는 regression check는 latency 기반이에요: slow `start_kafka_producer()` stub이 lifespan 완료를 service startup budget 너머로 늦추면 안 돼요.

이 모양의 test가 "우리가 실수로 다시 blocking으로 만들지 않았나"에 일반적으로 더 robust해요. 실제 failure mode는 "lifespan이 event loop를 너무 오래 잡았다"이지 "dependency가 실패했다"가 아니에요 — 그래서 test는 loop-holding behavior를 타겟해야 해요.

## 이게 맞는 상황

이 패턴은 dependency가 telemetry, audit fan-out, cache warming, event propagation에 유용하지만 API가 핵심 트래픽을 받는 데 필수가 아닐 때 써요. safety invariant: dependency가 필요 없는 request path가 그게 다운돼서 막히면 안 돼요.

correctness, persistence, authorization에 필수인 dependency를 background에 두지 마세요. 앱이 그것 없이 안전하게 serve할 수 없다면, startup을 큰 소리로 실패시키고 platform이 restart하거나 page하게 두세요. correctness-critical dependency를 background에 두면 startup-time 실패를 진단하기 더 어려운 runtime 실패로 바꾸는 건데, 그건 엄격히 더 나빠요.

## 실용적인 takeaway

optional dependency는 lifespan 중 `asyncio.create_task`에 들어가고, task handle은 shutdown을 위해 `app.state`에 stash해요. slow stub으로 test하세요 — 신경 쓰는 failure mode는 "event loop를 너무 오래 막는다"이고, latency-bounded assertion이 connectivity check보다 그걸 더 안정적으로 잡아요. "이걸 block한다" vs "이걸 background한다"의 경계선은 request path가 그것 없이 안전하게 return할 수 있는지예요.

## References

- [FastAPI Lifespan Events](https://fastapi.tiangolo.com/advanced/events/)
- [Python asyncio Coroutines and Tasks](https://docs.python.org/3/library/asyncio-task.html)
