---
title: Rust async channels with tokio
description: Choosing between tokio's mpsc, unbounded mpsc, and oneshot channels is a stream-vs-handoff decision, not a performance one.
date: 2026-05-13T00:00:00.000Z
updated: 2026-06-09T00:00:00.000Z
tags:
  - rust
  - tokio
  - async
  - concurrency
  - backend
category: backend
draft: false
lang: en
expanded: true
references:
  - url: 'https://tokio.rs/tokio/tutorial/channels'
    title: 'Tokio Tutorial: Channels'
    type: official
  - url: 'https://docs.rs/tokio/latest/tokio/sync/index.html'
    title: 'tokio::sync module documentation'
    type: official
source_content_hash: d9b73d8a1a52fd636c50b0e34968243b63239dea5ecfc4ddd4490c435ef1bda0
---

Coordinating work between async tasks in Rust means passing typed messages between them. The standard library gives you `std::sync::mpsc`, but it is synchronous and blocking — there is no async equivalent. Tokio's `tokio::sync` module fills that gap, and it offers three channel types that look interchangeable at first glance: bounded `mpsc`, unbounded `mpsc`, and `oneshot`.

The recurring question is which one to reach for. I found that picking the wrong one does not fail loudly — it surfaces later as unbounded memory growth, missing backpressure, or a pile of boilerplate. The whole decision comes down to one question: is this a stream of messages, or a single handoff?

## Why the choice is easy to get wrong

Each variant encodes a different contract, and the failure modes only show up under load or during shutdown — not in the happy-path test you write first. That is what makes the choice deceptive: every option compiles and works in a quick demo, so the cost of the wrong one is deferred rather than avoided.

What follows is the decision rule I settled on, along with the dead ends and misleading signals that pushed me toward it. The code is Tokio, but the stream-vs-handoff framing carries over to channel selection in most async runtimes.

## The dead ends that shaped the rule

A few things tripped me up before the rule clicked.

The first was using a second `mpsc::channel(1)` for request/response pairs. It works — send the request, the worker sends one value back, done. But it bloats every call site: each caller spawns a fresh channel only to push a single value through it. That is exactly the job `oneshot` exists for.

The second was trusting the name `unbounded_channel`. It reads as "no backpressure problems to worry about," which holds right up until producers outpace consumers — then the queue grows without limit and you have a memory leak. The "unbounded" label hides the failure mode rather than removing it.

A smaller gotcha: `tokio::select!` over multiple receivers needs `&mut rx` in each branch. Move the receiver into the macro and the next loop iteration fails to compile with "use of moved value."

And the one that cost the most time: treating `SendError` as a bug. When `tx.send(...)` returns `SendError` after the receiver was dropped, that is usually a clean shutdown signal — the consumer went away on purpose — not something to debug.

## The decision rule

The question that resolves it is whether a stream of values flows or a single value flows back:

| Channel                    | Use for                          | Backpressure                     |
| -------------------------- | -------------------------------- | -------------------------------- |
| `oneshot::channel`         | One request → one response       | N/A — a single value flows       |
| `mpsc::channel(N)`         | A stream or queue of messages    | Yes — the sender awaits when full |
| `mpsc::unbounded_channel`  | Fire-and-forget telemetry only   | None — can grow without limit    |

In practice that means:

- **One-to-one handoff (a request and its single response):** `oneshot::channel`. The send is non-blocking, and the channel drops itself once the value is delivered.
- **A stream or queue (many messages over time):** `mpsc::channel(N)`, with `N` sized for the backpressure you want. It is bounded by default, so the sender awaits when the buffer is full — that waiting is the feature, not a limitation.
- **Fire-and-forget telemetry, and only that:** `mpsc::unbounded_channel`. If you use it, leave a comment explaining why, so the next reader does not "fix" it back to bounded for safety and reintroduce blocking where you wanted none.

Here is each pattern in code:

```rust
use tokio::sync::{mpsc, oneshot};

// Request / response — 1-to-1
async fn fetch(req: Request) -> Response {
    let (tx, rx) = oneshot::channel();
    spawn_worker(req, tx);
    rx.await.expect("worker dropped before sending")
}

// Stream of work — many-to-1
async fn run_pipeline() {
    let (tx, mut rx) = mpsc::channel::<Event>(64);
    for _ in 0..4 {
        let tx = tx.clone();
        tokio::spawn(produce_events(tx));
    }
    drop(tx); // Last clone — receiver loop exits when all producers done
    while let Some(event) = rx.recv().await {
        handle(event).await;
    }
}

// Select over multiple receivers — &mut required
async fn merge(mut rx_a: mpsc::Receiver<A>, mut rx_b: mpsc::Receiver<B>) {
    loop {
        tokio::select! {
            Some(a) = rx_a.recv() => handle_a(a).await,
            Some(b) = rx_b.recv() => handle_b(b).await,
            else => break,
        }
    }
}
```

Two details in that last block are worth pausing on. `tokio::select!` borrows `&mut rx_a` and `&mut rx_b` rather than taking the receivers by value — otherwise the loop only compiles for its first iteration. And the `else => break` arm is what gives you a clean exit: once every sender has dropped, both `recv()` calls return `None`, the branch guards fail, and the loop ends on its own.

The `drop(tx)` in `run_pipeline` is the same idea from the sending side. After cloning a sender for each producer, the original handle has to be dropped, or the receiver loop waits forever for a sender that never sends. And `SendError` after the receiver drops is, again, the shutdown signal — match it explicitly instead of propagating it with `?`, unless the caller genuinely treats a gone-away consumer as a failure.

## Why bounded is the default that matters

The thread tying all of this together is backpressure. A bounded `mpsc` makes the sender wait when the consumer falls behind, which keeps memory flat and turns overload into latency you can measure rather than a leak you discover in production. `oneshot` sidesteps the question entirely because exactly one value ever flows. Unbounded channels remove the backpressure signal, which is why they belong only where the volume is naturally self-limiting — telemetry you would rather drop than block on.

If you need the exact guarantees of each type, the Tokio tutorial's channels chapter and the `tokio::sync` module docs are the canonical reference.

## When to reach for these — and when not to

Reach for `tokio::sync` channels when:

- You are coordinating async tasks that exchange typed messages.
- You want bounded backpressure between a producer and a consumer.
- You need a request/response handoff where exactly one value flows back.
- You have a multi-producer pipeline that should shut down cleanly once every producer finishes.

Reach for something else when:

- The code is synchronous — use `std::sync::mpsc` or `crossbeam`.
- You need pub/sub fanout to multiple consumers — `mpsc` is single-consumer, so use `tokio::sync::broadcast`.
- You only care about the latest value — use `tokio::sync::watch`, which keeps one value instead of buffering all of them.
- You are crossing process boundaries — these are in-process primitives; reach for a real message bus like NATS or Redis.

The one-sentence version: if a single value flows back, use `oneshot`; if a stream flows, use a bounded `mpsc` and let backpressure do its job.

## References

- [Tokio Tutorial: Channels](https://tokio.rs/tokio/tutorial/channels)
- [tokio::sync module documentation](https://docs.rs/tokio/latest/tokio/sync/index.html)
