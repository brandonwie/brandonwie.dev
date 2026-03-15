---
title: WebSocket Architecture in AWS ECS/ALB
description: 'How WebSocket connections work with ALB, ECS, and Redis Pub/Sub for real-time notifications in containerized environments.'
date: 2025-11-25T00:00:00.000Z
updated: 2026-03-15T00:00:00.000Z
expanded: true
tags:
  - backend
  - websocket
  - socket.io
  - redis
  - aws
  - ecs
  - alb
category: backend
draft: false
lang: en
references:
  - url: 'https://socket.io/docs/v4/'
    title: v4
    type: verified
  - url: >-
      https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-websockets.html
    title: load balancer websockets.html
    type: official
  - url: 'https://redis.io/docs/interact/pubsub/'
    title: pubsub
    type: official
source_content_hash: e438c936065918f3e9eeb50c17c00d7302df6bb1b0d785e3b48220a4b6dd8d84
---

Our users kept refreshing the page to check if their calendar sync was done. We needed the server to push a "sync complete" notification in real time — but our NestJS backend ran on multiple ECS containers behind an ALB. That raised a fundamental question: if a background job finishes on Container 2, how does User A (connected to Container 1) find out?

This post traces the full architecture of WebSocket connections in a containerized AWS environment: how ALB handles the HTTP upgrade, how Redis Pub/Sub bridges multiple containers, and what happens when connections inevitably drop.

---

## The Problem

A NestJS backend running on AWS ECS needs to push real-time notifications to browser clients (e.g., "sync complete" after a background job finishes). HTTP polling wastes resources and adds latency. WebSockets solve this, but introducing them in a containerized, load-balanced environment raises questions: How does ALB handle the HTTP-to-WebSocket upgrade? How do multiple containers broadcast to clients connected to different instances? What happens when connections drop?

---

## Difficulties Encountered

- **Misunderstanding ALB's role** — Initial assumption was that ALB actively
  manages WebSocket state; in reality ALB is just a TCP tunnel after the HTTP
  upgrade handshake. This confusion led to unnecessary ALB configuration
  attempts
- **Cross-container broadcasting** — When User A connects to Container 1 but a
  sync job completes on Container 2, Container 2 cannot directly notify User A.
  Took time to understand that Redis Pub/Sub solves this via persistent TCP
  subscriptions, not HTTP callbacks
- **Connection lifecycle edge cases** — Browser tab close sends a TCP FIN (not a
  WebSocket close frame), network drops send nothing (relies on ping/pong
  timeout), and ALB has its own idle timeout. Each scenario requires different
  handling, which was not obvious from Socket.io docs alone
- **Sticky sessions confusion** — Thought sticky sessions were mandatory for
  Socket.io, but they are only needed for HTTP polling fallback. With WebSocket
  transport only, any container can handle the connection after the initial
  upgrade

---

## Architecture Overview

```mermaid
flowchart LR
    Client["Client(Browser)"] --> ALB["ALB(Layer 7)"]
    ALB --> Container["ECS Container(NestJS + Socket.io)"]
    Container --> Redis["Redis"]
```

### Connection Flow

1. **Client** sends HTTP request with `Upgrade: websocket` header
2. **ALB** receives request, routes to a container
3. **Container** accepts upgrade, establishes WebSocket
4. **ALB** keeps TCP tunnel open (passes through data)
5. **Socket.io** manages the connection from here

Let's break down what each component in this architecture is actually responsible for.

---

## Component Responsibilities

| Component            | Role                                                             |
| -------------------- | ---------------------------------------------------------------- |
| **ALB**              | Routes initial HTTP upgrade, then passes through TCP (tunnel)    |
| **Socket.io Server** | Manages WebSocket connection, tracks clients, handles heartbeats |
| **NestJS Gateway**   | Application logic - auth, message handling, room management      |
| **Redis Adapter**    | Broadcasts messages across multiple containers                   |

**Key insight:** ALB is just a tunnel - Socket.io manages the actual connection.

A natural question arises: if Socket.io manages the connection, why do we need an ALB at all? The answer is about network topology, not protocol handling.

---

## Why We Need ALB

### Initial Connection Routing

```text
Without ALB:
  Client: "I want to connect to wss://api.example.com"
  Containers have private IPs:
  - 10.0.1.5:3000
  - 10.0.1.6:3000
  Client can't access private IPs directly!

With ALB:
  Client → api.example.com → ALB (public) → picks container → WebSocket established
```

ALB solves the "how do clients reach containers" problem. But there's a second, subtler problem: how do containers talk to each other?

---

## Redis for Multi-Container Broadcasting

### The Problem

With multiple ECS containers, User A might connect to Container 1, but the sync job runs on Container 2.

```text
Without Redis:
  User A ──────────────► Container 1 (User A's socket here)
  Sync Job ────────────► Container 2 (Sync completes here)
  Container 2 can't notify User A!
```

### The Solution: Redis Pub/Sub

```mermaid
flowchart LR
    C1["Container 1(User A here)"] <--> Redis["Redis Pub/Sub"]
    Redis <--> C2["Container 2(Sync runs here)"]
    C2 -->|PUBLISH| Redis
    Redis -->|message| C1
    C1 -->|emit| UA["User A"]
```

### How Pub/Sub Actually Works

A common misconception is that Redis sends HTTP requests to your application when a message is published. In reality, it works the other way around — your app maintains persistent TCP connections to Redis, and Redis writes data to those already-open connections:

```text
Step 1: STARTUP
  Container opens TCP connection to Redis (stays open!)
  → "SUBSCRIBE moba:socket.io"

Step 2: PUBLISH
  Container 2 sends message to Redis
  → "PUBLISH moba:socket.io {user:123, data:...}"

Step 3: PUSH
  Redis writes to the ALREADY OPEN TCP connection

Step 4: RECEIVE
  Node.js event loop picks up data from socket
  Socket.io adapter handles it → delivers to user's WebSocket
```

### Code Reference

In the Socket.io Redis adapter setup, notice the two separate Redis clients — one for publishing messages, one for subscribing to receive them. The subscriber maintains a persistent TCP connection that Redis writes to whenever a message is published on the channel:

```typescript
// pubClient: for PUBLISHING messages
// subClient: for SUBSCRIBING (maintains open TCP connection)
const pubClient = createClient({ url: redisUrl });
const subClient = pubClient.duplicate();

await Promise.all([pubClient.connect(), subClient.connect()]);

this.adapterConstructor = createAdapter(pubClient, subClient, {
  key: `${redisConfig.prefix}:socket.io`
});
```

With the broadcasting mechanism understood, the next important topic is what happens when connections end — either normally or unexpectedly.

---

## Connection Lifecycle

### Scenario A: Client Closes App/Tab (Normal)

```text
Client closes browser
    ↓
Browser's TCP stack sends FIN packet (not Socket.io!)
    ↓
TCP FIN packet ──► ALB ──► Container
    ↓
Socket.io detects TCP connection closed
    ↓
handleDisconnect() called (auto room cleanup)
```

**Why TCP FIN, not WebSocket message?**

- Browser is closing, no time for graceful WebSocket close
- TCP FIN is faster and handled by OS, not JavaScript
- Works even if JavaScript is frozen/crashed

### Scenario B: Network Interruption

```text
Network drops (no FIN packet)
    ↓
Socket.io ping/pong timeout (~25s)
    ↓
Server marks client as disconnected
    ↓
handleDisconnect() called
```

### Scenario C: ALB Idle Timeout

```text
No activity for 60 seconds (ALB default)
    ↓
ALB closes the TCP connection
    ↓
Both client and server detect disconnect
```

**Note:** This rarely happens because Socket.io sends heartbeat every 25s.

### Summary Table

| Initiator              | Mechanism             | Detection                |
| ---------------------- | --------------------- | ------------------------ |
| Client (normal close)  | TCP FIN               | Immediate                |
| Client (crash/network) | No FIN                | Ping/pong timeout (~25s) |
| ALB                    | Idle timeout (60s)    | TCP RST                  |
| Server                 | `client.disconnect()` | Immediate                |

---

## ALB Idle Timeout (Why No Change Needed)

| Setting                | Default Value | What it does                         |
| ---------------------- | ------------- | ------------------------------------ |
| ALB idle timeout       | 60 seconds    | Closes connection if no data for 60s |
| Socket.io pingInterval | 25 seconds    | Sends ping every 25s                 |
| Socket.io pingTimeout  | 20 seconds    | Waits 20s for pong response          |

Socket.io's heartbeat keeps the connection alive:

```text
Timeline:
0s   ─── Connection established
25s  ─── Socket.io sends PING → ALB resets idle timer
50s  ─── Socket.io sends PING → ALB resets idle timer
75s  ─── Socket.io sends PING → ALB resets idle timer
...

ALB idle timeout (60s) is NEVER reached because Socket.io
sends heartbeat every 25s. No config change needed!
```

---

## Single Container Setup (Simplified)

For single-container deployments:

| Component           | Needed? | Why                                              |
| ------------------- | ------- | ------------------------------------------------ |
| ALB                 | Yes     | Routes public traffic to private container       |
| Redis Adapter       | Yes     | Future-proofs for multi-container                |
| Sticky Sessions     | No      | Single container = all connections go same place |
| Multiple containers | No      | Not needed until scale requires it               |

---

## Multi-Container Considerations

When scaling to multiple containers:

### Sticky Sessions

Ensures reconnections go to the same container:

- Faster reconnection (previous state available)
- Less Redis overhead
- Required for Socket.io HTTP polling fallback

---

## When to Use

- **Real-time notifications to browser clients** — When the server needs to push
  updates (sync status, live collaboration, chat) without client polling
- **Containerized deployments behind a load balancer** — When multiple ECS tasks
  or Kubernetes pods serve the same application and clients may connect to any
  instance
- **Background job completion alerts** — When async workers finish tasks and
  users need immediate feedback without refreshing

---

## When NOT to Use

- **Simple request-response APIs** — If the client only needs data when it
  explicitly asks, REST or GraphQL is simpler and has no persistent connection
  overhead
- **Server-sent events (SSE) suffice** — If communication is one-directional
  (server to client only), SSE is simpler than WebSocket and works through more
  proxies without special config
- **Low-frequency updates** — If updates happen less than once per minute,
  long-polling or periodic fetch is cheaper than maintaining persistent
  WebSocket connections
- **Serverless / Lambda** — WebSockets require persistent connections; Lambda
  functions are ephemeral. Use API Gateway WebSocket APIs instead of Socket.io
  in serverless environments

---

## Options Considered

| Option                     | Pros                                                                            | Cons                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Socket.io + Redis Adapter  | Auto-reconnect, room management, fallback to polling, cross-container broadcast | Extra dependency (Redis); Socket.io adds protocol overhead                                     |
| Raw WebSocket (ws library) | Minimal overhead; no abstraction layer                                          | No auto-reconnect; manual room management; no cross-container broadcast without custom pub/sub |
| Server-Sent Events (SSE)   | Simple; works through most proxies; no upgrade needed                           | Unidirectional (server to client only); no binary support                                      |
| Long Polling               | Works everywhere; no special infra                                              | High latency; wastes server resources; complex client logic                                    |
| AWS API Gateway WebSockets | Serverless; managed scaling                                                     | Vendor lock-in; different programming model; no Socket.io compatibility                        |

## Why This Approach

Chose Socket.io with Redis Adapter because the application needs bidirectional
communication (client sends actions, server pushes notifications), automatic
reconnection handling, and cross-container message broadcast. Raw WebSocket
would require reimplementing all of Socket.io's room management, heartbeat, and
reconnection logic. SSE is unidirectional. The Redis Adapter was chosen over
custom pub/sub because Socket.io's adapter pattern handles serialization,
namespaces, and room-scoped broadcasting out of the box.

---

## Key Points

1. **ALB is just a tunnel** - Routes initial connection, then passes through TCP
2. **Socket.io manages lifecycle** - Ping/pong, timeouts, rooms, cleanup are
   automatic
3. **Redis enables multi-container** - Uses persistent TCP connections, not HTTP
4. **Pub/Sub pattern** - Subscribe once, receive messages as they're published
5. **Single container simplifies** - No sticky sessions needed; Redis useful for
   future scaling

---

## Practical Takeaways

WebSocket architecture in a containerized environment looks complex on paper, but the mental model is straightforward once you understand each component's role:

1. **ALB is just a tunnel.** After the initial HTTP upgrade handshake, ALB does nothing but pass TCP bytes through. Socket.io manages the actual connection lifecycle — heartbeats, timeouts, rooms, cleanup. Don't over-configure the ALB; the defaults work because Socket.io's 25-second heartbeat keeps connections alive well within ALB's 60-second idle timeout.

2. **Redis Pub/Sub solves the multi-container broadcast problem.** Each container maintains a persistent TCP connection to Redis. When Container 2 publishes a message, Redis writes it to Container 1's already-open connection — no HTTP callbacks, no polling. The Socket.io Redis adapter handles serialization and room-scoped delivery out of the box.

3. **Start with the Redis adapter even on a single container.** It adds negligible overhead and means you can scale to multiple containers without changing your WebSocket code. Going from one container to three becomes a Terraform change, not an application architecture change.

4. **Know the three disconnect scenarios.** Normal tab close sends a TCP FIN (instant detection). Network drops send nothing (detected by ping/pong timeout in ~25 seconds). ALB idle timeout (60 seconds) rarely triggers thanks to heartbeats. Each scenario is handled automatically by Socket.io, but understanding them helps you debug connection issues in production.

If you're adding real-time features to a containerized backend, the Socket.io + Redis Adapter + ALB combination is battle-tested and avoids reinventing the wheel of connection management, reconnection, and cross-container messaging.

---

## References

- [Socket.io Documentation](https://socket.io/docs/v4/)
- [AWS ALB WebSocket Support](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-websockets.html)
- [Redis Pub/Sub](https://redis.io/docs/interact/pubsub/)
