---
title: tokio로 다루는 Rust async 채널
description: tokio의 mpsc, unbounded mpsc, oneshot 채널 중 무엇을 고를지는 성능 문제가 아니라 스트림이냐 핸드오프냐의 문제예요.
date: 2026-05-13T00:00:00.000Z
updated: '2026-06-09'
tags:
  - rust
  - tokio
  - async
  - concurrency
  - backend
category: backend
draft: false
lang: ko
source_lang: en
source_slug: rust-async-channels
source_updated: 2026-06-09T00:00:00.000Z
translation_date: '2026-06-14'
---

채널을 잘못 골랐을 때 가장 곤란한 건, 그게 곧바로 티가 안 난다는 점이에요. 한참 뒤에야 끝없이 늘어나는 메모리, 사라진 backpressure, 잔뜩 쌓인 boilerplate로 드러나거든요. Rust에서 async 태스크끼리 작업을 조율하려면 타입이 있는 메시지를 주고받아야 하는데, 표준 라이브러리의 `std::sync::mpsc`는 동기(synchronous)·블로킹 방식이라 async 버전이 없어요. 그 빈자리를 Tokio의 `tokio::sync` 모듈이 채워주죠. 언뜻 보면 서로 바꿔 써도 될 것 같은 채널 타입을 셋 제공하는데, bounded `mpsc`, unbounded `mpsc`, `oneshot`이에요.

그래서 늘 "어느 걸 써야 하지?"라는 질문이 따라와요. 그런데 결정은 의외로 한 가지로 좁혀지더라고요. 이건 메시지 스트림인가요, 아니면 한 번의 핸드오프인가요?

## 왜 틀리기 쉬운가요

각 변형(variant)은 저마다 다른 계약(contract)을 담고 있고, 그 실패 양상은 부하가 걸리거나 종료(shutdown)될 때만 드러나요. 처음 작성하는 happy-path 테스트에서는 안 보이죠. 그래서 이 선택이 까다로워요. 어떤 옵션이든 일단 컴파일되고 간단한 데모에서는 잘 돌아가니까, 잘못된 선택의 비용이 사라지는 게 아니라 뒤로 미뤄질 뿐이에요.

이어지는 내용은 제가 정착한 결정 규칙이에요. 거기에 다다르게 만든 막다른 길과 헷갈렸던 신호들도 같이 적어요. 코드는 Tokio지만, "스트림이냐 핸드오프냐"라는 프레임은 대부분의 async 런타임에서 채널을 고를 때 그대로 적용돼요.

## 규칙을 만들어준 막다른 길들

규칙이 손에 잡히기까지 몇 번 헤맸어요.

첫 번째는 요청/응답 쌍에 `mpsc::channel(1)`을 하나 더 쓰는 방식이었어요. 동작은 해요. 요청을 보내고, 워커가 값 하나를 돌려주면 끝이죠. 하지만 모든 호출 지점이 무거워져요. 호출하는 쪽마다 채널을 새로 만들어서 값 하나만 흘려보내거든요. 그건 정확히 `oneshot`이 존재하는 이유예요.

두 번째는 `unbounded_channel`이라는 이름을 믿은 거예요. "backpressure 걱정할 일 없음"처럼 읽히는데, producer가 consumer를 앞지르기 전까지만 맞는 말이에요. 그 순간부터 큐가 한도 없이 자라서 메모리 누수가 돼요. "unbounded"라는 라벨은 실패 양상을 없애는 게 아니라 가려요.

좀 더 사소한 함정: 여러 receiver에 대한 `tokio::select!`는 각 브랜치에서 `&mut rx`가 필요해요. receiver를 매크로 안으로 이동(move)시키면 다음 루프 반복에서 "use of moved value"로 컴파일이 안 돼요.

그리고 시간을 가장 많이 잡아먹은 건 `SendError`를 버그로 취급한 거예요. receiver가 드롭된 뒤 `tx.send(...)`가 `SendError`를 반환하면, 그건 보통 consumer가 일부러 떠난 깨끗한 종료 신호예요. 디버깅할 대상이 아니에요.

## 결정 규칙

이걸 풀어주는 질문은 "값의 스트림이 흐르는가, 아니면 값 하나가 되돌아오는가"예요:

| 채널                      | 용도                            | Backpressure                     |
| ------------------------- | ------------------------------- | -------------------------------- |
| `oneshot::channel`        | 요청 하나 → 응답 하나           | 해당 없음 — 값 하나만 흐름       |
| `mpsc::channel(N)`        | 메시지 스트림이나 큐            | 있음 — 버퍼가 차면 sender가 대기 |
| `mpsc::unbounded_channel` | fire-and-forget 텔레메트리 전용 | 없음 — 한도 없이 자랄 수 있음    |

실전에서는 이렇게 정리돼요:

- **1대1 핸드오프(요청과 그 단일 응답):** `oneshot::channel`. send는 논블로킹이고, 값이 전달되면 채널이 스스로 드롭돼요.
- **스트림이나 큐(시간에 걸쳐 여러 메시지):** `mpsc::channel(N)`, 원하는 backpressure에 맞춰 `N`을 잡으세요. 기본이 bounded라 버퍼가 차면 sender가 대기해요. 이 "기다림"이 제약이 아니라 기능이에요.
- **fire-and-forget 텔레메트리, 딱 그것만:** `mpsc::unbounded_channel`. 쓴다면 이유를 주석으로 남겨두세요. 그래야 다음 사람이 "안전을 위해" bounded로 되돌려서 원치 않던 블로킹을 다시 끌어들이지 않아요.

각 패턴을 코드로 보면:

```rust
use tokio::sync::{mpsc, oneshot};

// 요청 / 응답 — 1대1
async fn fetch(req: Request) -> Response {
    let (tx, rx) = oneshot::channel();
    spawn_worker(req, tx);
    rx.await.expect("worker dropped before sending")
}

// 작업 스트림 — 다대1
async fn run_pipeline() {
    let (tx, mut rx) = mpsc::channel::<Event>(64);
    for _ in 0..4 {
        let tx = tx.clone();
        tokio::spawn(produce_events(tx));
    }
    drop(tx); // 마지막 클론 — 모든 producer가 끝나면 receiver 루프 종료
    while let Some(event) = rx.recv().await {
        handle(event).await;
    }
}

// 여러 receiver를 select — &mut 필요
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

마지막 블록에서 짚고 넘어갈 부분이 두 가지 있어요. `tokio::select!`는 receiver를 값으로 가져가는 대신 `&mut rx_a`, `&mut rx_b`로 빌려요. 안 그러면 루프가 첫 반복에서만 컴파일되거든요. 그리고 `else => break` 브랜치가 깨끗한 종료를 만들어줘요. 모든 sender가 드롭되면 두 `recv()`가 `None`을 반환하고, 브랜치 가드가 실패하면서 루프가 스스로 끝나요.

`run_pipeline`의 `drop(tx)`도 sender 쪽에서 같은 얘기예요. producer마다 sender를 클론한 뒤에는 원래 핸들을 드롭해야 해요. 안 그러면 receiver 루프가 영영 오지 않을 sender를 기다려요. 그리고 receiver가 드롭된 뒤의 `SendError`도 역시 종료 신호예요. caller가 사라진 consumer를 진짜 실패로 취급하는 경우가 아니라면, `?`로 전파하지 말고 명시적으로 매칭하세요.

## bounded가 기본값인 게 중요한 이유

이 모든 걸 묶는 실은 backpressure예요. bounded `mpsc`는 consumer가 뒤처지면 sender를 기다리게 해서 메모리를 평평하게 유지하고, 과부하를 프로덕션에서 발견하는 누수가 아니라 측정 가능한 지연으로 바꿔줘요. `oneshot`은 값이 정확히 하나만 흐르니 이 질문을 아예 비켜가요. unbounded 채널은 backpressure 신호를 없애버리는데, 그래서 양이 자연히 제한되는 곳에만 어울려요. 블로킹하느니 차라리 버리는 게 나은 텔레메트리 같은 데요.

각 타입의 정확한 보장(guarantee)이 필요하면 Tokio 튜토리얼의 채널 챕터와 `tokio::sync` 모듈 문서가 정본 레퍼런스예요.

## 언제 쓰고, 언제 쓰지 말까

`tokio::sync` 채널은 이럴 때 쓰세요:

- 타입 있는 메시지를 주고받는 async 태스크를 조율할 때.
- producer와 consumer 사이에 bounded backpressure를 원할 때.
- 값 하나가 정확히 되돌아오는 요청/응답 핸드오프가 필요할 때.
- 모든 producer가 끝나면 깨끗하게 종료돼야 하는 다중 producer 파이프라인일 때.

이럴 때는 다른 걸 쓰세요:

- 동기 코드 — `std::sync::mpsc`나 `crossbeam`을 쓰세요.
- 여러 consumer로의 pub/sub 팬아웃 — `mpsc`는 단일 consumer라서, `tokio::sync::broadcast`를 쓰세요.
- 최신 값만 중요할 때 — 전부 버퍼링하지 않고 값 하나만 유지하는 `tokio::sync::watch`를 쓰세요.
- 프로세스 경계를 넘을 때 — 이건 프로세스 내(in-process) 프리미티브예요. NATS나 Redis 같은 진짜 메시지 버스를 쓰세요.

한 문장 요약: 값 하나가 되돌아오면 `oneshot`, 스트림이 흐르면 bounded `mpsc`를 쓰고 backpressure가 일하게 두세요.

## 참고 자료

- [Tokio Tutorial: Channels](https://tokio.rs/tokio/tutorial/channels)
- [tokio::sync module documentation](https://docs.rs/tokio/latest/tokio/sync/index.html)
