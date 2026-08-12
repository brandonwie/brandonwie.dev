---
title: 크로스 클라우드 이벤트 흐름을 위한 대칭형 Redis ↔ Kafka 브리지 페어
description: >-
  Cloud Run에서는 내부 Kafka 브로커에 닿지 못해요. `advertised.listeners`가 늘 발목을 잡거든요.
  Redis를 거치는 단방향 브리지 한 쌍이면 지켜야 할 조건을 전부 지킬 수 있어요.
date: 2026-04-29T00:00:00.000Z
updated: '2026-08-12'
tags:
  - backend
  - distributed-systems
  - event-streaming
  - cross-cloud
category: backend
draft: false
lang: ko
source_lang: en
source_slug: symmetric-redis-kafka-bridge-pair
source_updated: '2026-08-12'
translation_date: '2026-08-12'
references:
  - url: 'https://www.linkedin.com/blog/engineering/open-source/kafka-ecosystem-at-linkedin'
    title: LinkedIn Engineering — Kafka Ecosystem at LinkedIn
    type: official
  - url: 'https://slack.engineering/scaling-slacks-job-queue/'
    title: Slack Engineering — Scaling Slack's Job Queue
    type: official
  - url: 'https://discord.com/blog/how-discord-stores-trillions-of-messages'
    title: Discord Engineering — How Discord Stores Trillions of Messages
    type: official
---

> 내구성 있는 내부 이벤트 버스(Kafka)와 휘발성 edge 버스(Redis pub/sub)가 서로
> 다른 네트워크 구간에 있을 때는 방향마다 하나씩 둔 단방향 브리지 두 개가
> 터널링이나 양방향 브로커 규칙 하나보다 나아요. 브리지는 각자 받은 걸 그대로
> 넘기기만 하고요. publish하는 쪽 트래픽을 출신 계층과 상관없이 전부 내구성
> 버스로 보내니까 감사 기록에도 빠짐이 없어요.

API는 Cloud Run에서 돌고 Kafka는 NAS에 있어요. TCP 터널로 첫 연결은 되는데 두
번째가 안 돼요. 브로커가 클라이언트한테 "다시 연결할 땐 `kafka:9092`로
연결해"라고 알려주거든요. Cloud Run 쪽에서는 풀 수 없는 Docker 호스트명이에요. 바로 떠오르는
우회 세 가지는 각각 지켜야 할 조건을 하나씩 깨뜨려요. 네 번째, 그러니까 Redis를
거치는 브리지 한 쌍은 그 조건을 전부 살려두면서 CF Tunnel TCP 규칙 2개와
dual-listener Kafka 설정, sidecar cold-start까지 한꺼번에 걷어내요.

## advertised.listeners 함정

edge 계층은 GCP든 AWS든 사정이 같아요. Cloud Run도 NAS 안쪽 Kafka 브로커에 바로
닿지 못해요. Kafka의 broker-discovery 프로토콜이 metadata 응답마다 브로커의
`advertised.listeners` 값을 돌려주기 때문이에요. 그 값은 보통 Docker DNS
이름(`kafka:9092`)이고 클라우드 쪽 클라이언트는 이 이름을 풀지 못해요. 9092
포트로 TCP 터널을 뚫어도 첫 연결만 성공하고 두 번째는 실패해요. 브로커가
"다음에는 kafka:9092로 연결해"라고 알려주는데 클라이언트가 그러질 못하거든요.

바로 떠오르는 선택지는 저마다 다른 조건을 깨뜨려요.

| 선택지                                                                    | 깨지는 것                                                                                       |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| CF Tunnel + Kafka EXTERNAL listener + Cloud Run에 cloudflared sidecar 추가 | 컨테이너를 여러 개 띄워야 하고 auth 갱신이 불안정하며 브로커를 올릴 때마다 listener 설정이 어긋남 |
| Kafka public + SASL/SSL                                                   | 보안 태세 후퇴. stateful 브로커를 인터넷에 그대로 노출함                                          |
| edge 계층에서 Kafka를 아예 빼고 Redis pub/sub만 사용                       | 감사 기록의 완전성. 내구성 hash-chain 로그가 edge에서 생긴 이벤트를 전부 놓침                     |
| publish를 worker로 옮김 (Celery 한 단계 추가)                             | API 응답 시간이 브로커 왕복에 묶임. "Cloud Run은 stateless" 보장도 약해짐                         |

## 단방향 브리지 두 개라는 해법

NAS 안쪽 네트워크에서 도는 자그마한 Go 서비스 두 개예요. 둘이 같이 돌면 Kafka는
내구성 백본으로 남고 클라우드를 넘나드는 edge 트래픽은 Redis가 실어 날라요.

```text
[NAS Worker, Guardrails, Keycloak] ──► [Kafka] ──► [audit-service] ──► hash-chain log
                                          ▲   │
                                          │   ├─► [forward sse-bridge] ──► [Redis pub/sub] ──► [Cloud Run API SSE] ──► Browser
                                          │                                  ▲
                                          │                                  │
                                          └─◄ [reverse sse-revbridge] ◄──────┘
                                                                             ▲
                                                                             │
                                                              [Cloud Run API publishers]
```

- **정방향 브리지**(`Kafka → Redis`)는 consumer group으로 SSE 관련 Kafka 토픽을
  전부 구독한 뒤 들어온 메시지를 그대로 Redis pub/sub 채널로 흘려보내요. 채널
  이름에는 미리 정해둔 접두사를 붙여요(`sse:{topic}`). Cloud Run API는 SSE
  fan-out을 하려고 그 Redis 채널만 구독하면 되고 edge 쪽에 Kafka 클라이언트를 둘
  일이 없어요.
- **역방향 브리지**(`Redis → Kafka`)는 같은 `sse:*` 채널을 PSubscribe로 구독한
  다음 접두사를 떼고 짝이 맞는 Kafka 토픽으로 되돌려 보내요. 감사 기록의
  내구성을 지키려고 `RequiredAcks=All`로 묶어서 보내고요.

publish하는 쪽은 환경에 따라 방향이 갈려요. NAS 안쪽 서비스는 Kafka로 바로
보내요(`EVENT_BUS_BACKEND=kafka`). Cloud Run 쪽은 Redis를 거치고요
(`EVENT_BUS_BACKEND=redis`, 기본값). 이렇게 보낸 이벤트도 역방향 브리지가
hash-chain 감사 로그까지 실어다 놓아요.

## 이 구조가 통하는 이유

| 속성                     | 어떻게 되는가                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **클라우드 간 도달성**   | Redis Cloud는 NAS에서도 Cloud Run에서도 TLS URL 하나로 서로 닿음. 터널도, broker-discovery와 씨름할 일도 없음 |
| **감사 기록의 완전성**   | 역방향 브리지가 `source: cloud-run-api` 표시를 찍어 Kafka로 다시 보냄. audit-service consumer는 그대로 둬도 됨 |
| **edge에 stateful 클라이언트 없음** | Cloud Run이 Kafka 연결을 오래 붙들고 있을 일이 없음. Redis pub/sub이 scale-to-zero 수명 주기와 잘 맞음 |
| **장애 영역 분리**       | 브리지마다 consumer group과 오류 카운터, 재시작 정책을 따로 가짐. Redis가 죽어도 Kafka는 멀쩡하고 반대도 같음 |
| **터널 비용 없음**       | 브리지 두 개로 CF Tunnel TCP 규칙 2개와 dual-listener Kafka 설정, sidecar cold-start를 한꺼번에 걷어냄        |

## 핵심 포인트

- **미리 정한 채널 접두사를 하나 둬요**(여기선 `sse:`). 두 브리지와 모든
  publisher가 여기에 동의해야 해요. 붙이는 쪽과 떼는 쪽이 어긋나면 이벤트가
  존재하지도 않는 채널로 조용히 흘러가서 알람도 없이 사라져요.
- **역방향 브리지에는 SUBSCRIBE 대신 PSubscribe를 써요.** 토픽 목록을 명시하지
  않으니 registry에 토픽이 새로 생겨도 revbridge를 다시 배포할 일이 없어요. 대신
  `sse:*`에 다른 writer가 끼어들면 그것까지 넘어가요. 접두사는 어디까지나
  관습으로 예약해둔 거니까요.
- **방향마다 출처를 찍어요.** 역방향 브리지가 다시 보낸 이벤트에는
  `source: cloud-run-api`가 붙고 NAS에서 바로 보낸 이벤트에는
  `source: nas-worker`가 붙어요. 그래야 audit-service 쿼리가 Kafka 헤더를
  파싱하지 않고도 출처로 걸러내요.
- **역방향 브리지는 `Acks=all`로 둬요.** 정방향은 내구성 ack이 필요 없지만요.
  감사 기록의 완전성이 5ms 남짓한 지연보다 중요하거든요.
- **방향마다 metrics 카운터를 따로 둬야 해요.**
  `bridge_messages_forwarded_total`과 `revbridge_messages_forwarded_total`이
  구분돼야 Grafana 대시보드에서 양쪽 처리량을 나란히 놓고 볼 수 있어요.

## 짝 브리지 사이에서 어긋나는 주석

sse-bridge를 그대로 본떠 sse-revbridge를 만들다 보면 "consumer started" 같은 로그
문구가 정작 producer인 서비스에 그대로 따라붙기 쉬워요. 로그를 들여다봐야 겨우
잡히고요. 손 쓸 방법은 단순해요. 짝을 이루는 서비스가 구조를 거의 공유한다면
주석도 계약의 일부로 보고 metric 이름을 볼 때와 같은 눈으로 리뷰하면 돼요.

## 양쪽에서 뜻이 다른 /healthz

두 브리지 다 뜰 때 Redis로 ping을 한 번 던져요. 정방향에는 출력 쪽이고 역방향에는
입력 쪽이죠. 그런데 publish하는 쪽 Kafka는 사정이 달라요. `kafka-go.Writer`는
게으르게 만들어져서 실제 연결은 첫 `WriteMessages` 호출에서야 일어나거든요. 그래서
`/healthz`가 정상이라고 해도 Kafka에 닿는다는 보장은 **없어요**. 잘못 넣은 broker
URL이 다음 배포 전에 드러나게 하려면 publish 쪽 브리지 알람에
`errors_total{type="kafka"}`를 꼭 같이 걸어둬야 해요.

## NAS 배포 중에 생기는 감사 기록 공백

sse-revbridge가 재시작하는 동안 Cloud Run에서 나온 이벤트는 Redis로 publish되지만
받아줄 구독자가 없어요. Redis pub/sub은 끊긴 구독자를 위해 따로 버퍼를 두지
않거든요. 배포하는 잠깐이라면 감수할 만한 손실이에요. 다만 감사 기록을 한 건도
잃으면 안 되는 환경이라면 역방향 브리지를 PSubscribe 대신 consumer-group offset이
남는 Redis Stream으로 바꿔야 해요. 그래야 놓친 메시지를 다시 흘려보내죠.

## 진짜 위험한 건 JSON 파싱 실패

정방향 브리지는 바이트만 그대로 흘려보내도 돼요. Redis가 받은 그대로 다시
내보내니까요. 역방향은 사정이 달라요. payload에서 partition key를 뽑으려면
**반드시** 파싱을 해야 하거든요. 깨진 JSON을 그냥 두면 빈 키로 Kafka에 다시
올라가고, 그러면 다운스트림 consumer가 망가질 수 있어요. 그래서
`errors_total{type="json-decode"}`와 `errors_total{type="missing-key"}`를 따로
세어두는 편이 나아요. 둘이 갈라져 있어야 어떤 계약이 깨졌는지 운영자가 바로
알아보거든요.

## 쓰면 좋은 상황

- 내구성 이벤트 버스가 사설망(NAS, on-prem, VPC) 안에 자리 잡고 있어요.
- 서버리스 edge 계층(Cloud Run, Lambda, Vercel)이 같은 이벤트 흐름에 끼어야
  하는데 내구성 버스에 상시 연결을 유지할 수 없어요.
- 감사 추적에 빈틈이 생기면 안 되는 환경이에요. 컴플라이언스나 보안 태세, 변조
  방지 로그가 걸려 있는 경우요.
- 양쪽에서 다 닿는 휘발성 edge 버스(Redis pub/sub, NATS, MQTT)가 이미 깔려 있어요.

## 쓰지 말아야 할 상황

- 내구성 버스에 edge에서 그대로 닿을 때요. 공개 엔드포인트가 있는 managed
  Kafka나 Confluent Cloud, MSK Public이라면 직접 연결하는 편이 나아요.
- 감사 기록의 완전성이 필요 없을 때요. edge에서 Redis만 쓰고 약간의 누락을
  감수하는 쪽이 훨씬 싸요.
- 이벤트 양이 너무 많아서 hop이 두 번 늘어나는 비용(한 번에 5~10ms쯤)이 지연
  예산을 깨뜨릴 때요. 이럴 땐 VPC peering으로 직접 잇는 편이 복잡해지는 만큼의
  값은 해요.
- 브리지 두 개가 먹는 메모리가 여유분을 넘길 때요. 내구성 버스 쪽에서 각각
  30~100MB쯤 잡아먹어요.

## 비슷한 패턴을 쓰는 곳

새로운 구조는 아니에요. 규모가 큰 시스템일수록 내구성 로그와 실제로 메시지를
옮기는 계층을 따로 두는 쪽으로 계속 수렴하더라고요.

- **LinkedIn**은 Kafka를
  [central data pipeline](https://www.linkedin.com/blog/engineering/open-source/kafka-ecosystem-at-linkedin)이라고
  부를 정도예요. Espresso의 replication도 MySQL replication에서 Kafka로
  옮겼어요. Venice나 차세대 Databus 같은 파생 데이터 플랫폼도 같은 로그 위에
  얹혀 있고요. 내구성 로그가 아래에 깔리고 조회용 저장소와 파생 저장소는 각자
  자기 계층으로 따로 있어요.
- **Slack**은 비동기 job queue에서 Redis를 걷어내는 대신
  [Kafka를 Redis 앞에](https://slack.engineering/scaling-slacks-job-queue/)
  뒀어요. Kafka는 메모리 고갈과 job 유실을 막아주는 내구성 버퍼를 맡아요.
  dequeue와 중복 제거, in-flight 추적, 재시도는 그대로 Redis 몫이에요. 네트워크
  경계만 없을 뿐 브리지 한 쌍과 역할 분담이 같아요. 다만 범위는 정확히 짚고
  갈게요. 이 글은 job queue 얘기지 채팅 전달 얘기가 아니에요. 메시지가
  클라이언트까지 닿는 경로는 여기서 다루지 않아요.
- **Discord**는
  [수조 개의 메시지](https://discord.com/blog/how-discord-stores-trillions-of-messages)를
  Cassandra에서 ScyllaDB로 옮겼는데 그 근거를 전부 저장 엔진 얘기로 풀어요.
  repair 속도나 shard-per-core 워크로드 격리, GC 정지가 없다는 점이요. 메시지가
  클라이언트까지 어떻게 가는지는 글에 아예 안 나와요. 그래서 이 사례는 분리
  자체의 근거는 못 되고 한 칸 옆의 약한 버전이에요. 내구성 계층이 독립하고 나면
  그 계층만의 기준으로 튜닝할 수 있다는 정도를 보여줘요.

## 안티패턴

| 안티패턴                            | 문제점                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------- |
| 터널 하나에 양방향 브로커 규칙 하나 | `advertised.listeners`가 무력화함. 깨지기 쉽고 구성 요소도 많음          |
| stateful 브로커를 인터넷에 노출     | 보안 태세 후퇴                                                          |
| 감사 기록에서 edge 이벤트를 버림    | Zero Trust 위반. 나중에 컴플라이언스 감사가 오면 소급해서 재구성해야 함  |
| publish를 전부 worker로 옮김(Celery hop) | API 쓰기마다 지연이 붙음. stateless 보장도 약해짐                    |
| 한 방향만 잇는 브리지 하나          | 클라우드 계층의 consumer나 producer 중 한쪽이 연결되지 않은 채 남음      |

## 정리

가장 먼저 떠오르는 우회가 "브로커를 어떻게든 닿게 만들자"이고 그 변형이 하나같이
뭔가를 깨뜨린다면, 그러니까 보안 태세든 감사 기록의 완전성이든 edge 계층의
stateless 보장이든 하나씩 내줘야 한다면, 답은 대개 브로커에 닿으려는 시도를
그만두는 쪽이에요. 대신 양쪽이 이미 보고 있는 transport로 메시지를 옮기면 돼요.
받은 걸 그대로 넘기기만 하는 브리지 한 쌍이 영리한 양방향 규칙 하나보다 만들기도,
굴리기도, 디버깅하기도 싸게 먹혀요.
