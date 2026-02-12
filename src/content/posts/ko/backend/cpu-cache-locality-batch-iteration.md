---
title: CPU Cache Locality를 활용한 배치 필드 추출 최적화
description: >-
  같은 배열에 대해 여러 번 `.map()`을 호출하면 CPU가 매번 객체를 메모리에서
  다시 불러와야 합니다
date: 2026-02-11T00:00:00.000Z
updated: 2026-02-11T00:00:00.000Z
tags:
  - backend
  - performance
  - optimization
category: backend
draft: false
lang: ko
source_lang: en
source_slug: cpu-cache-locality-batch-iteration
source_updated: "2026-02-11"
translation_date: "2026-02-12"
references:
  - url: "https://en.wikipedia.org/wiki/Locality_of_reference"
    title: Locality of reference - Wikipedia
    type: official
---

100개 이상의 객체 배열에서 18개 필드를 `.map()` 체이닝으로 추출하는 함수가
있었어요. 코드는 깔끔해 보였고 린팅도 통과했어요. 그런데 뒤에서는 수천 번의
불필요한 cache miss가 발생하고 있었어요.

이 코드는 Google Calendar에서 블록을 동기화하는 bulk insert/update 경로의
일부였어요. 각 블록에는 18개 이상의 프로퍼티가 있었고, 원래 패턴은 각 필드를
별도의 `.map()` 패스로 배열에 담았어요. 코드상으로는 관용적인 JavaScript였지만,
실제로는 CPU와 싸우고 있었어요.

## 이게 왜 중요한가

현대 CPU는 메모리에서 개별 바이트를 가져오지 않아요. **cache line** 단위로
데이터를 로드하는데, x86 아키텍처에서는 64바이트예요. Block 객체에 접근하면
CPU가 객체 전체(또는 상당 부분)를 L1 cache에 로드해요. 같은 객체의 다른
프로퍼티에 접근하는 건 거의 공짜예요. L1 cache hit은 약 1나노초, L3 cache
miss는 약 40나노초가 걸려요.

`.map()` 패턴은 이 모델을 깨뜨려요. 각 패스가 전체 배열을 순회하면서 하나의
필드만 읽고 넘어가요. 다음 `.map()`이 실행될 때쯤이면 이전 객체들은 L1에서
이미 쫓겨난 상태예요. CPU는 더 느린 cache 레벨이나 메인 메모리에서 다시
불러와야 해요.

여러 `.map()` 호출 시:

1. 패스 1: Block이 L1에 로드됨, `.id` 읽음, Block 쫓겨남
2. 패스 2: Block이 L1에 다시 로드됨, `.title` 읽음, Block 쫓겨남
3. 각 필드마다 반복

단일 `for...of` 사용 시:

1. Block이 L1에 한 번 로드됨
2. `.id`, `.title`, `.start`, ... 모두 읽음 (전부 L1 hit)
3. 다음 Block으로 이동

## 코드로 보는 문제

```typescript
// BAD: k separate iterations over n items = O(k*n)
const ids = blocks.map((b) => b.id); // pass 1: block accessed
const titles = blocks.map((b) => b.title); // pass 2: same block re-accessed
const starts = blocks.map((b) => b.start); // pass 3: same block re-accessed
// ... 18 more fields
```

각 `.map()`이 전체 배열을 순회해요. 18개 필드, 100개 아이템이면:
`18 * 100 = 1,800`번의 프로퍼티 접근이 18번의 패스에 걸쳐 발생해요.

## 발견하기 어려운 이유

이런 종류의 비효율은 잘 숨어요.

**JavaScript 프로파일러는 cache miss 비율을 보여주지 않아요.** 함수별 소요
시간만 보여줘요. `.map()` 패턴은 각 개별 호출이 빠르기 때문에 flamegraph에서
깔끔해 보여요. 병목이 모든 호출에 분산되어 있거든요.

**함수형 스타일이 올바르게 느껴져요.** 필드당 `.map()` 하나는 관용적인 JS/TS
코드예요. 린팅도 통과하고요. 명령형 `for...of` 대안은 장황해 보여서 "덜
깔끔하다"고 무시하기 쉬워요.

**작은 규모의 테스트에서는 아무것도 안 보여요.** 100개 미만의 아이템에서는
접근 패턴과 무관하게 전체 배열이 L1 cache에 들어가요. 문제는 규모가 커져야
나타나요 -- 큰 객체가 1,000개 이상일 때요.

**V8 최적화가 비용을 감춰요.** V8의 hidden class와 inline caching이 페널티를
부분적으로 완화해요. C/C++보다는 성능 저하가 덜 극적이지만, 규모가 크면 여전히
측정 가능해요.

## 해결책: 단일 패스 추출

```typescript
// GOOD: 1 iteration over n items = O(n)
const ids: number[] = [];
const titles: (string | null)[] = [];
const starts: (string | null)[] = [];

for (const block of blocks) {
  // Block is hot in L1 cache — all reads are cache hits
  ids.push(block.id);
  titles.push(block.title);
  starts.push(block.startDateTime);
}
```

루프 하나. 패스 하나. 각 블록이 cache에 한 번 로드되고, 데이터가 아직 hot한
상태에서 18개 필드를 전부 읽어요. CPU가 같은 객체를 다시 불러올 일이 없어요.

## 이게 왜 효과적인가

이 최적화는 반복 횟수를 O(k\*n)에서 O(n)으로 줄이는 것만이 아니에요. 더 큰
이득은 **temporal locality(시간적 지역성)** 에 있어요. 객체가 L1 cache에 아직
있는 동안 모든 필드에 접근하는 거예요. L2, L3, 메인 메모리에서 k번 다시
가져오는 대신요.

## 실제 성능 차이

| 지표                      | Multi-map (18x)  | 단일 for...of           | 개선                 |
| ------------------------- | ---------------- | ----------------------- | -------------------- |
| 반복 횟수 (100개 아이템)  | 1,800            | 100                     | 18배 감소            |
| 반복 횟수 (100K개 아이템) | 1,800,000        | 100,000                 | 18배 감소            |
| Cache 동작                | 매 패스마다 cold | Hot (temporal locality) | 규모가 클수록 유의미 |

## 실전 가이드

임계값이 중요해요. 여러 `.map()` 호출에서 단일 루프로 전환을 고려해야 하는
시점은 이렇게 정리할 수 있어요:

| 데이터 크기 | 다중 .map() 괜찮은가?    | 이유                          |
| ----------- | ------------------------ | ----------------------------- |
| 100개 미만  | 예                       | 어차피 전부 L1 cache에 들어감 |
| 100-1,000   | 애매함                   | 객체 크기에 따라 다름         |
| 1,000 이상  | 아니오 -- 단일 패스 사용 | 패스 간 cache 축출 발생       |
| 10,000 이상 | 절대 아니오              | O(k\*n)이 측정 가능해짐       |

**`.map()`을 유지해도 되는 경우:**

- **작은 배열 (100개 미만)**: 접근 패턴과 관계없이 전체 데이터셋이 L1 cache에
  들어가요. `.map()` 방식이 더 읽기 쉽고 함수형에 가까워요.
- **단일 필드 추출**: 필드 하나만 필요하면 `.map()` 하나가 이미 최적이에요
  (패스 1회, 필드 1개).
- **가독성이 중요한 코드 경로**: 나노초보다 명확성이 중요한 non-hot 코드
  경로에서는 함수형 스타일이 리뷰와 유지보수에 더 좋아요.
- **벡터화/bulk API를 사용할 때**: 다운스트림 소비자가 전체 객체 배열을
  받는다면 (별도 필드 배열이 아니라), 병렬 배열로 재구성하면 이점 없이
  복잡성만 늘어나요.

핵심 인사이트: 큰 배열에서 여러 필드를 추출하는 hot loop에서는 "깔끔한"
체이닝 `.map()` 호출을 쓰고 싶은 충동을 참으세요. 데이터가 cache에 있는 동안
전부 읽는 루프 하나가 항상 이겨요.
