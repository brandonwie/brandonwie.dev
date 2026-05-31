---
title: Symmetric Redis ↔ Kafka Bridge Pair for Cross-Cloud Event Flow
description: Cloud Run can't reach an internal Kafka broker — `advertised.listeners` always wins. A pair of unidirectional bridges through Redis keeps every invariant intact.
date: 2026-04-29T00:00:00.000Z
updated: 2026-04-29T00:00:00.000Z
tags:
  - backend
  - distributed-systems
  - event-streaming
  - cross-cloud
category: backend
draft: false
lang: en
expanded: true
references:
  - url: 'https://engineering.linkedin.com/blog/topic/event-streaming'
    title: LinkedIn Engineering — Hybrid storage solutions
    type: official
  - url: 'https://slack.engineering/real-time-messaging/'
    title: Slack Engineering — Real-time messaging architecture
    type: official
source_content_hash: 1d9406fcdc1667e07d321c5b59744ee9d04d9ace37eaf065c848027319bbb41e
---

> When a durable internal event bus (Kafka) and an ephemeral edge bus
> (Redis pub/sub) live on different network segments, a **pair** of
> unidirectional bridges — one per direction — beats a single
> bidirectional broker rule with tunneling. Each bridge is a dumb
> forwarder. Audit completeness is preserved by routing _all_
> producer-side traffic through the durable bus regardless of which
> compute tier originated the event.

Cloud Run runs the API. NAS hosts Kafka. The first connection through a
TCP tunnel works; the second fails because the broker tells the client
"reconnect to me at `kafka:9092`" — a Docker hostname Cloud Run can't
resolve. Three obvious workarounds each break a different invariant.
The fourth — a pair of bridges through Redis — keeps every invariant
intact and replaces what would otherwise need 2× CF Tunnel TCP rules
plus a dual-listener Kafka config plus sidecar cold-starts.

## The advertised.listeners Trap

Cloud Run (or any GCP/AWS edge tier) cannot reach a NAS-internal Kafka
broker directly. Kafka's broker-discovery protocol returns the broker's
`advertised.listeners` value on every metadata response — typically the
Docker DNS name (`kafka:9092`) — which the cloud client cannot resolve.
Even with a TCP tunnel to port 9092, the first connection succeeds but
the second fails: the broker tells the client "next time, connect to
me at kafka:9092" and the client cannot.

The naive options each break a different invariant:

| Option                                                                       | Breaks                                                                                    |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Add a CF Tunnel + Kafka EXTERNAL listener + cloudflared sidecar on Cloud Run | Multi-container Cloud Run, fragile auth refresh, listener drift on broker upgrades        |
| Make Kafka public + SASL/SSL                                                 | Security posture regression — exposes a stateful broker to the internet                   |
| Skip Kafka entirely on the edge tier; use only Redis pub/sub                 | Audit completeness — the durable hash-chained log loses every edge-originated event       |
| Move publishing to the worker (Celery hop)                                   | API HTTP latency couples to broker round-trip; weakens "stateless on Cloud Run" guarantee |

## The Pattern: Two Unidirectional Bridges

Two small Go services, each running on the NAS-internal network. Together
they make Kafka the durable backbone while Redis carries cross-cloud
edge traffic.

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

- **Forward bridge** (`Kafka → Redis`): consumer groups subscribe to all
  SSE-relevant Kafka topics, republish each message verbatim to a
  reserved-prefix Redis pub/sub channel (`sse:{topic}`). Cloud Run API
  subscribes to those Redis channels for SSE fan-out — no Kafka client
  at the edge.
- **Reverse bridge** (`Redis → Kafka`): subscribes to the same `sse:*`
  channels via PSubscribe, strips the prefix, republishes each message
  to the matching Kafka topic with `RequiredAcks=All` for audit
  durability.

The producer side flips by environment. NAS-internal services keep
direct Kafka publishing (`EVENT_BUS_BACKEND=kafka`). Cloud Run
publishers route through Redis (`EVENT_BUS_BACKEND=redis`, default),
and the reverse bridge ensures their events still land in the
hash-chained audit log.

## Why This Works

| Property                        | Mechanism                                                                                                                        |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Cross-cloud reachability**    | Redis Cloud is mutually reachable from both NAS and Cloud Run via TLS URL — no tunnel, no broker-discovery fight                 |
| **Audit completeness**          | Reverse bridge stamps a `source: cloud-run-api` provenance marker and republishes to Kafka; audit-service consumer is unchanged  |
| **No edge stateful client**     | Cloud Run never holds a long-lived Kafka connection; Redis pub/sub matches its scale-to-zero lifecycle                           |
| **Independent failure domains** | Each bridge has its own consumer group, error counter, and restart policy; Redis outage doesn't take Kafka down (and vice versa) |
| **Zero-tunnel cost**            | The two bridges replace what would otherwise need 2× CF Tunnel TCP rules + dual-listener Kafka config + sidecar cold-starts      |

## Key Points

- **Pick a reserved channel prefix** (`sse:` here). Both bridges and
  any producer must agree on it. Drift between encode-side and
  decode-side silently routes events to non-existent channels,
  dropping them with no alarm.
- **Use PSubscribe in the reverse bridge**, not SUBSCRIBE with an
  explicit topic list. New topics added to the registry don't require
  a revbridge redeploy. Trade-off: any other writer to `sse:*` would
  also be forwarded — the prefix is reserved by convention.
- **Stamp provenance per direction.** Reverse-bridge republished
  events get `source: cloud-run-api`; direct NAS publishers get
  `source: nas-worker`. audit-service queries can then filter by
  origin without parsing Kafka headers.
- **Acks=all on the reverse bridge**, even though the forward bridge
  doesn't need durability acks. Audit completeness > the ~5ms latency
  tax.
- **Each direction needs its own metrics counter set.**
  `bridge_messages_forwarded_total` and
  `revbridge_messages_forwarded_total` must be distinguishable so a
  Grafana dashboard can graph both rates side-by-side.

## Comment Drift Between Paired Bridges

When you mirror sse-bridge to build sse-revbridge, it's easy to copy
"consumer started" log strings into a service that's actually a
producer. Caught only on log inspection. The mitigation is mechanical:
when paired services share most of their structure, treat the comments
as part of the contract and review them with the same care as the
metric names.

## /healthz Semantics Asymmetry

sse-bridge pings Redis at startup (the output side); sse-revbridge
pings Redis at startup (the input side). Kafka on the producer side
is lazy in `kafka-go.Writer` — the connection happens on first
`WriteMessages`. A green `/healthz` does NOT mean Kafka is reachable.
Operator alerts must include `errors_total{type="kafka"}` for the
producer-side bridge so a misconfigured broker URL surfaces before
the next deploy.

## Audit-Loss Window During NAS Deploys

When sse-revbridge restarts, Cloud-Run-originated events publish to
Redis with no subscriber receiving them — Redis pub/sub doesn't
buffer for offline subscribers. Acceptable during deploys; if
zero-loss audit becomes a hard requirement, switch the reverse bridge
from PSubscribe to a Redis Stream with consumer-group offsets so
missed messages can replay.

## JSON Parse Failure as a Real Risk

The forward bridge can be a dumb byte-forwarder (Kafka → Redis) since
Redis just relays bytes. The reverse bridge MUST parse to extract the
partition key from the payload — malformed JSON would otherwise be
republished to Kafka with an empty key, potentially corrupting
downstream consumers. Classify
`errors_total{type="json-decode"}` separately from
`errors_total{type="missing-key"}` so the operator can tell which
contract was violated.

## When to Use

- A durable event bus exists on a private network (NAS, on-prem, VPC).
- A serverless edge tier (Cloud Run, Lambda, Vercel) needs to
  participate in the same event flow but cannot establish persistent
  connections to the durable bus.
- Audit-trail completeness is a hard requirement (compliance,
  security posture, tamper-proof log).
- An ephemeral edge bus (Redis pub/sub, NATS, MQTT) is already
  available and reachable from both sides.

## When NOT to Use

- If the durable bus IS reachable from the edge tier (managed Kafka
  with public endpoint, Confluent Cloud, MSK Public). Direct
  connection wins.
- If audit completeness isn't required — accept-gap with Redis-only
  on the edge is much cheaper.
- If event volume is high enough that two extra hops (~5-10ms each)
  blow the latency budget — direct VPC peering becomes worth the
  complexity cost.
- If the two bridges' RAM cost exceeds your headroom (each ~30-100MB
  on the durable-bus side).

## Pattern Precedents

- **LinkedIn** — hybrid storage solutions; Kafka as durable backbone
  with edge-friendly transport (Espresso, Voldemort) for fan-out.
- **Slack** — real-time messaging; Kafka beneath, edge transport
  above.
- **Discord** — billions of messages stored on Cassandra/ScyllaDB
  with ephemeral pub/sub at the edge.
- **Stripe** — audit pipeline routes all writes through a durable
  bus regardless of origin tier.

## Anti-Patterns

| Anti-Pattern                                 | Why Wrong                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| Single bidirectional broker rule with tunnel | Defeats `advertised.listeners`, fragile, multi-component                 |
| Make stateful broker public-facing           | Security posture regression                                              |
| Drop edge events from audit                  | Zero Trust violation; future compliance audit forces retroactive rebuild |
| Move all publishing to worker (Celery hop)   | Latency tax on every API write; weakens stateless guarantee              |
| Single bridge in one direction only          | Either consumers or producers from the cloud tier remain unwired         |

## Takeaway

When the obvious workaround is "make the broker reachable" and every
variation breaks something — security posture, audit completeness,
edge-tier statelessness — the answer is usually to stop trying to
reach the broker and start moving messages through a transport both
sides can already see. A pair of dumb forwarders is cheaper to build,
cheaper to operate, and cheaper to debug than one clever bidirectional
rule.
