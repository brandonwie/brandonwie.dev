---
title: 크로스 클라우드 이벤트 흐름을 위한 대칭형 Redis ↔ Kafka 브리지 페어
description: >-
  Cloud Run은 내부 Kafka 브로커에 못 닿아요 — `advertised.listeners`가 항상 이겨요. Redis를 통과하는
  단방향 브리지 한 쌍이 모든 invariant를 지켜줘요.
date: 2026-04-29T00:00:00.000Z
updated: '2026-08-02'
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
source_updated: '2026-08-02'
translation_date: '2026-05-10'
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

- **Forward 브리지** (`Kafka → Redis`): consumer group이 SSE 관련 Kafka
  토픽을 모두 구독하고, 들어온 메시지를 그대로 예약된 prefix를 붙인 Redis
  pub/sub 채널(`sse:{topic}`)로 다시 흘려요. Cloud Run API는 SSE fan-out을
  위해 그 Redis 채널만 구독하면 돼요. edge에는 Kafka 클라이언트를 둘 필요가
  없어요.
- **Reverse 브리지** (`Redis → Kafka`): 똑같은 `sse:*` 채널을 PSubscribe로
  구독한 다음, prefix를 떼고 짝이 맞는 Kafka 토픽으로 다시 보내요. audit
  내구성을 지키려고 `RequiredAcks=All`로 묶어서 보내요.

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

## /healthz 의미가 양쪽이 달라요

두 브리지 모두 시작할 때 Redis에 ping을 던져요. forward는 출력 쪽,
reverse는 입력 쪽이에요. 그런데 producer 쪽 Kafka는 다르게 동작해요 —
`kafka-go.Writer`는 lazy하게 잡혀서, 실제 연결은 첫 `WriteMessages`
호출 때 일어나요. 그러니까 `/healthz`가 초록이어도 Kafka가 닿는다는
보장은 **없어요**. 잘못 설정한 broker URL이 다음 배포 전에 드러나려면,
producer 쪽 브리지의 알람에 `errors_total{type="kafka"}`를 꼭 같이
넣어둬야 해요.

## NAS 배포 중 생기는 audit 손실 구간

sse-revbridge가 재시작하는 동안, Cloud Run에서 발생한 이벤트는 Redis로
publish되지만 받아주는 구독자가 없어요. Redis pub/sub은 끊긴 구독자를
위해 따로 버퍼를 두지 않거든요. 배포 잠깐 동안은 감수할 수 있는 손실인데,
zero-loss audit이 꼭 필요한 환경이라면 reverse 브리지를 PSubscribe 대신
consumer-group offset이 있는 Redis Stream으로 바꿔야 해요. 그러면 놓친
메시지를 다시 흘려보낼 수 있어요.

## JSON parse 실패가 진짜 위험해요

Forward 브리지는 그냥 바이트만 흘려보내도 돼요. Redis가 받은 그대로 다시
내보내니까요. 그런데 reverse 브리지는 다르게 가야 해요 — payload에서
partition key를 뽑으려면 **반드시** parse를 해야 하거든요. 깨진 JSON을
그대로 두면 빈 키로 Kafka에 republish되고, 그게 그대로 다운스트림 consumer를
망가뜨릴 수 있어요. 그래서 `errors_total{type="json-decode"}`와
`errors_total{type="missing-key"}`를 따로 잡아두는 게 좋아요. 둘이 분리돼
있어야 어떤 계약이 깨졌는지 운영자가 바로 보고 판단할 수 있어요.

## 언제 쓰면 좋아요

- 내구성 이벤트 버스가 사설망(NAS, on-prem, VPC)에 자리 잡고 있어요.
- 서버리스 edge tier(Cloud Run, Lambda, Vercel)가 같은 이벤트 흐름에
  참여해야 하는데, 내구성 버스에 상시 연결을 유지할 수 없어요.
- audit 추적의 빈틈이 허용되지 않는 환경이에요(컴플라이언스, 보안 자세,
  변조 방지 로그가 걸려 있는 경우).
- 양쪽에서 닿을 수 있는 휘발성 edge 버스(Redis pub/sub, NATS, MQTT)가
  이미 깔려 있어요.

## 언제 쓰지 말아야 해요

- 내구성 버스가 edge에서 그대로 닿을 때 — 공개 엔드포인트가 있는 managed
  Kafka나 Confluent Cloud, MSK Public이라면 직접 연결이 이겨요.
- audit 완전성이 필요 없을 때 — edge에서 Redis만 쓰고 약간의 누락을
  감수하는 쪽이 훨씬 싸요.
- 이벤트 볼륨이 너무 커서 hop이 두 번 추가되는 비용(~각 5-10ms)이 레이턴시
  예산을 깨뜨릴 때 — 이때는 VPC peering으로 직접 잇는 쪽이 복잡도 값을
  해요.
- 두 브리지의 메모리 비용이 헤드룸을 넘길 때 — 내구성 버스 쪽에서 각각
  대략 30-100MB가 들어요.

## 비슷한 패턴을 쓰는 곳

새로운 구조는 아니에요. 규모가 큰 시스템일수록 내구성 로그와 실제로
메시지를 옮기는 계층을 따로 두는 쪽으로 계속 수렴하더라고요.

- **LinkedIn**은 Kafka를
  [central data pipeline](https://www.linkedin.com/blog/engineering/open-source/kafka-ecosystem-at-linkedin)
  이라고 부를 정도예요. Espresso의 replication도 MySQL replication에서
  Kafka로 옮겼어요. 내구성 로그가 아래에 깔리고, serving store는 자기
  계층으로 따로 있어요.
- **Slack**은 job queue에서 Redis를 걷어내는 대신
  [Kafka를 Redis 앞에](https://slack.engineering/scaling-slacks-job-queue/)
  뒀어요. Kafka가 job 유실을 막는 내구성 버퍼를 맡고, Redis는 빠른
  in-flight 계층으로 남았어요. 네트워크 경계만 없을 뿐, 브리지 페어와
  역할 분담이 같아요.
- **Discord**는
  [수조 개의 메시지](https://discord.com/blog/how-discord-stores-trillions-of-messages)
  를 전용 내구성 저장소(Cassandra, 그다음 ScyllaDB)에 쌓아요. 전달
  계층에 맞추기보다 저장소 자체 기준으로 고른 선택이에요.

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
