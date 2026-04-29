---
title: 크로스 클라우드 이벤트 흐름을 위한 대칭형 Redis ↔ Kafka 브리지 페어
description: Cloud Run은 내부 Kafka 브로커에 못 닿아요 — `advertised.listeners`가 항상 이겨요. Redis를 통과하는 단방향 브리지 한 쌍이 모든 invariant를 지켜줘요.
date: 2026-04-29T00:00:00.000Z
updated: '2026-04-29'
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
source_updated: 2026-04-29T00:00:00.000Z
translation_date: '2026-04-29'
---

> 내구성 있는 내부 이벤트 버스(Kafka)와 ephemeral edge 버스(Redis pub/sub)가
> 서로 다른 네트워크 세그먼트에 살 때, 단방향 브리지의 **쌍** —
> 방향당 하나 — 이 터널링과 단일 양방향 브로커 룰을 이겨요. 각 브리지는
> dumb forwarder예요. Audit completeness는 origin compute tier에 관계없이
> _모든_ producer-side 트래픽을 내구성 버스로 라우팅해서 보존돼요.

Cloud Run이 API를 돌려요. NAS가 Kafka를 호스팅해요. TCP 터널을 통한 첫
연결은 작동하는데 두 번째는 실패해요. 브로커가 클라이언트한테 "다시 연결할
땐 `kafka:9092`로 연결해" 라고 말하거든요 — Cloud Run이 resolve할 수 없는
Docker hostname이에요. 명백한 우회 세 가지가 각각 다른 invariant를 깨요.
네 번째 — Redis를 통과하는 브리지 한 쌍 — 이 모든 invariant를 그대로
유지하면서, 그렇지 않으면 2× CF Tunnel TCP 룰 + dual-listener Kafka 설정 +
sidecar cold-start가 필요했을 걸 대체해요.

## advertised.listeners 함정

Cloud Run(또는 모든 GCP/AWS edge tier)은 NAS-내부 Kafka 브로커에 직접
도달할 수 없어요. Kafka의 broker-discovery 프로토콜은 모든 metadata
response에 broker의 `advertised.listeners` 값을 반환해요 — 보통 Docker DNS
이름(`kafka:9092`) — 클라우드 클라이언트가 resolve할 수 없는 거예요. 9092
포트로 TCP 터널을 만들어도, 첫 연결은 성공하지만 두 번째는 실패해요:
브로커가 클라이언트한테 "다음에는 kafka:9092로 연결해"라고 말하는데
클라이언트가 못해요.

순진한 옵션들이 각각 다른 invariant를 깨요:

| 옵션                                                                         | 깨는 것                                                                                  |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| CF Tunnel + Kafka EXTERNAL listener + Cloud Run의 cloudflared sidecar 추가     | Multi-container Cloud Run, fragile auth refresh, broker 업그레이드시 listener drift       |
| Kafka public + SASL/SSL                                                      | 보안 자세 회귀 — stateful 브로커를 인터넷에 노출                                          |
| Edge tier에서 Kafka 완전히 스킵; Redis pub/sub만                              | Audit completeness — 내구성 hash-chained 로그가 모든 edge-originated 이벤트를 잃음        |
| Worker로 publishing 옮김 (Celery hop)                                        | API HTTP 레이턴시가 broker round-trip에 결합; "Cloud Run에서 stateless" 보장 약화         |

## 패턴: 두 단방향 브리지

작은 Go 서비스 두 개, 각각 NAS-내부 네트워크에서 돌아요. 함께 Kafka를
내구성 backbone으로 만들면서 Redis가 cross-cloud edge 트래픽을 carry해요.

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

- **Forward bridge** (`Kafka → Redis`): consumer group이 모든 SSE-관련
  Kafka 토픽을 구독하고, 각 메시지를 reserved-prefix Redis pub/sub
  채널(`sse:{topic}`)로 verbatim하게 republish해요. Cloud Run API가 SSE
  fan-out을 위해 그 Redis 채널을 구독해요 — edge에 Kafka 클라이언트 없음.
- **Reverse bridge** (`Redis → Kafka`): 같은 `sse:*` 채널을 PSubscribe로
  구독하고, prefix를 떼고, audit 내구성을 위해 `RequiredAcks=All`로 매칭
  Kafka 토픽에 각 메시지를 republish해요.

Producer 측은 환경에 따라 뒤집혀요. NAS-내부 서비스는 직접 Kafka
publishing을 유지해요(`EVENT_BUS_BACKEND=kafka`). Cloud Run publisher는
Redis를 통과해요(`EVENT_BUS_BACKEND=redis`, 디폴트), 그리고 reverse
bridge가 그들의 이벤트도 hash-chained audit log에 떨어지도록 보장해요.

## 왜 작동하나

| 속성                            | 메커니즘                                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Cross-cloud reachability**    | Redis Cloud는 NAS와 Cloud Run 양쪽에서 TLS URL로 mutually 도달 가능 — 터널 없음, broker-discovery 싸움 없음                     |
| **Audit completeness**          | Reverse bridge가 `source: cloud-run-api` provenance marker를 stamp하고 Kafka에 republish; audit-service consumer 변경 없음     |
| **No edge stateful client**     | Cloud Run이 long-lived Kafka 연결을 절대 hold하지 않음; Redis pub/sub이 scale-to-zero 라이프사이클에 매칭                       |
| **Independent failure domains** | 각 브리지가 자기 consumer group, error counter, restart policy 가짐; Redis 장애가 Kafka를 down시키지 않음 (반대도 마찬가지)    |
| **Zero-tunnel cost**            | 두 브리지가 그렇지 않으면 필요했을 2× CF Tunnel TCP 룰 + dual-listener Kafka 설정 + sidecar cold-start를 대체                   |

## 핵심 포인트

- **Reserved 채널 prefix를 정해요** (여기선 `sse:`). 두 브리지와 모든
  producer가 그것에 동의해야 해요. Encode-side와 decode-side 사이의
  drift는 이벤트를 존재하지 않는 채널로 조용히 라우팅해서 알람 없이
  drop해요.
- **Reverse bridge에 PSubscribe를 쓰세요**, 명시적 토픽 리스트의 SUBSCRIBE가
  아니라요. Registry에 추가된 새 토픽이 revbridge 재배포를 요구하지 않아요.
  Trade-off: `sse:*`에 다른 writer가 있으면 그것도 forward돼요 — prefix는
  관습으로 reserved예요.
- **방향별로 provenance를 stamp해요.** Reverse-bridge republished 이벤트는
  `source: cloud-run-api`를 받고, 직접 NAS publisher는 `source:
  nas-worker`를 받아요. audit-service 쿼리가 Kafka 헤더를 파싱하지 않고
  origin으로 필터링할 수 있어요.
- **Reverse bridge에 Acks=all**, forward bridge는 내구성 ack 필요 없어도요.
  Audit completeness > ~5ms 레이턴시 세금.
- **방향마다 자기 metrics counter set이 필요해요.**
  `bridge_messages_forwarded_total`과
  `revbridge_messages_forwarded_total`이 distinguishable해야 Grafana
  대시보드에서 양쪽 rate를 side-by-side로 그래프할 수 있어요.

## 페어된 브리지 사이의 코멘트 drift

sse-bridge를 mirror해서 sse-revbridge를 만들 때, "consumer started" 로그
스트링을 producer인 서비스에 복사하기 쉬워요. 로그 검사로만 잡혀요. 완화책은
mechanical: 페어된 서비스가 구조 대부분을 공유할 때, 코멘트를 계약의 일부로
취급하고 metric 이름과 같은 주의로 리뷰해요.

## /healthz semantics asymmetry

sse-bridge는 시작시 Redis를 ping해요(output side); sse-revbridge도 시작시
Redis를 ping해요(input side). Producer side의 Kafka는 `kafka-go.Writer`
에서 lazy해요 — 연결은 첫 `WriteMessages`에 일어나요. 초록 `/healthz`는
Kafka가 도달 가능하다는 뜻이 **아니에요**. Operator alert는 producer-side
브리지에 대해 `errors_total{type="kafka"}`를 포함해야 잘못 설정된 broker
URL이 다음 배포 전에 표면화돼요.

## NAS 배포 동안의 audit-loss 윈도우

sse-revbridge가 재시작할 때, Cloud-Run-originated 이벤트가 Redis로
publish되는데 받는 subscriber가 없어요 — Redis pub/sub이 offline subscriber에
대해 buffer하지 않아요. 배포 동안은 acceptable; zero-loss audit이 hard
requirement가 되면, reverse bridge를 PSubscribe에서 consumer-group offset이
있는 Redis Stream으로 바꿔서 missed 메시지를 replay할 수 있게 해요.

## JSON parse 실패가 진짜 위험

Forward bridge는 dumb byte-forwarder일 수 있어요(Kafka → Redis), Redis가
그냥 byte를 relay하니까요. Reverse bridge는 페이로드에서 partition key를
추출하기 위해 parse를 **반드시** 해야 해요 — malformed JSON이 그렇지 않으면
empty key로 Kafka에 republish돼서 잠재적으로 다운스트림 consumer를 손상시켜요.
`errors_total{type="json-decode"}`와 `errors_total{type="missing-key"}`를
별도로 분류해서 operator가 어떤 계약이 위반됐는지 알 수 있게 해요.

## 언제 사용할까

- 내구성 이벤트 버스가 private 네트워크(NAS, on-prem, VPC)에 존재.
- 서버리스 edge tier(Cloud Run, Lambda, Vercel)가 같은 이벤트 흐름에
  참여해야 하지만 내구성 버스에 persistent 연결을 만들 수 없음.
- Audit-trail completeness가 hard requirement (compliance, security
  posture, tamper-proof log).
- Ephemeral edge 버스(Redis pub/sub, NATS, MQTT)가 이미 사용 가능하고
  양쪽에서 도달 가능.

## 언제 사용하지 말까

- 내구성 버스가 edge tier에서 도달 가능하면 (public endpoint 있는 managed
  Kafka, Confluent Cloud, MSK Public). 직접 연결이 이김.
- Audit completeness가 필요 없으면 — edge에서 Redis-only로 accept-gap이
  훨씬 저렴.
- 이벤트 볼륨이 두 추가 hop(~5-10ms 각각)이 레이턴시 예산을 폭발시킬 만큼
  높으면 — direct VPC peering이 복잡도 비용을 정당화함.
- 두 브리지의 RAM 비용이 헤드룸을 초과하면 (durable-bus side에서 각
  ~30-100MB).

## 패턴 선례

- **LinkedIn** — hybrid storage solutions; Kafka가 내구성 backbone, fan-out
  위한 edge-friendly transport (Espresso, Voldemort).
- **Slack** — real-time messaging; Kafka 아래, edge transport 위.
- **Discord** — Cassandra/ScyllaDB에 수십억 메시지 저장, edge에서 ephemeral
  pub/sub.
- **Stripe** — origin tier 관계없이 모든 쓰기를 내구성 버스로 라우팅하는
  audit pipeline.

## 안티패턴

| 안티패턴                                     | 왜 잘못인가                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| 터널과 함께 단일 양방향 브로커 룰            | `advertised.listeners` 무력화, fragile, multi-component                  |
| Stateful 브로커를 public-facing으로          | 보안 자세 회귀                                                            |
| Audit에서 edge 이벤트 drop                   | Zero Trust 위반; 미래 compliance 감사가 retroactive 재구축 강제          |
| 모든 publishing을 worker로 옮김 (Celery hop) | 모든 API 쓰기에 레이턴시 세금; stateless 보장 약화                       |
| 한 방향만의 단일 브리지                      | Cloud tier에서의 consumer 또는 producer 중 하나가 unwired로 남음          |

## 정리

명백한 우회가 "broker를 도달 가능하게 만들기"이고 모든 변형이 뭔가를 깰
때 — security posture, audit completeness, edge-tier statelessness — 답은
보통 broker에 도달하려는 시도를 멈추고, 양쪽이 이미 볼 수 있는 transport를
통해 메시지를 옮기기 시작하는 거예요. Dumb forwarder 한 쌍은 한 영리한
양방향 룰보다 만들기도 싸고, 운영도 싸고, 디버깅도 싸요.
