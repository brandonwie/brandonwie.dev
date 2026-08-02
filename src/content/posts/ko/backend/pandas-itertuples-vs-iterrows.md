---
title: pandas itertuples() vs iterrows()
description: '`iterrows()`는 DataFrame 행을 순회하는 가장 흔한 방법이지만, 매 행마다 pd.Series 객체를 생성해서 느립니다'
date: 2026-02-06T00:00:00.000Z
updated: '2026-08-02'
tags:
  - backend
  - python
  - pandas
  - performance
category: backend
draft: false
lang: ko
source_lang: en
source_slug: pandas-itertuples-vs-iterrows
source_updated: '2026-08-02'
translation_date: '2026-02-12'
references:
  - url: >-
      https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.itertuples.html
    title: pandas.DataFrame.itertuples
    type: official
  - url: >-
      https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.iterrows.html
    title: pandas.DataFrame.iterrows
    type: official
---

시간별로 실행되는 ETL 집계 작업이 10,000행을 처리하는 데 2초가 걸렸어요.
병목은 `iterrows()`였어요. `itertuples()`로 전환하니 20밀리초로 떨어졌어요 --
루프 시그니처 한 줄 바꾼 것치고 100배 개선이에요.

답답한 건 `iterrows()`가 모든 튜토리얼이 가르치는 방식이라는 거예요. Stack
Overflow 답변들도 기본으로 이걸 사용해요. 심지어 일부 pandas 문서조차
기본 순회 패턴으로 이걸 쓰고 있어요. 극적으로 더 빠른 대안이 있다는 걸
발견하려면 의도적인 탐색이 필요했어요.

## iterrows()가 느린 이유

`iterrows()`는 매 행마다 `pd.Series` 객체를 생성해요. Series 생성에는 타입
추론, 인덱스 생성, 메모리 할당이 들어가요. 값을 읽기만 하면 되는 상황에서
이 모든 작업이 낭비예요.

게다가 `iterrows()`는 dtype을 보존하지 않아요. 각 행을 공통 타입으로
캐스팅하는데, 정수가 실수가 되거나 타임스탬프가 object가 될 수 있어요.
사소한 불편함이 아니에요 -- 다운스트림 로직에서 미묘한 버그를 일으킬 수
있어요.

## 해결책

대신 `itertuples(index=False)`를 사용하세요. 행당 오버헤드가 거의 없는
가벼운 namedtuple을 반환해요.

```python
# BEFORE (iterrows)
for _, row in df.iterrows():
    val = row["column_name"]
    safe = row.get("column_name", default)

# AFTER (itertuples)
for row in df.itertuples(index=False):
    val = row.column_name
    safe = getattr(row, "column_name", default)
```

## 검토한 방법들

네 가지 접근법을 살펴봤어요:

| 방법             | 장점                                  | 단점                                   |
| ---------------- | ------------------------------------- | -------------------------------------- |
| **itertuples()** | ~100배 빠름, 적은 메모리, 타입 보존   | attribute 접근만 가능, 불변 행         |
| **iterrows()**   | dict 스타일 접근, 가변 Series, 익숙함 | ~100배 느림, 많은 메모리, 타입 손실    |
| **apply()**      | 준벡터화, 유연함                      | itertuples보다 느림(미측정), 모호한 의미 |
| **벡터화 연산**  | 가장 빠름, pandas답움                 | 복잡한 행 로직에는 항상 가능하지 않음  |

벡터화 연산이 이상적이지만, 집계 로직에 열 단위 연산으로 표현할 수 없는
조건 분기가 있었어요. 행별 순회가 불가피했고, `iterrows()`와 `itertuples()`
사이의 선택이 결정적 요인이었어요.

`apply()`는 중간에 위치해요. `iterrows()`보다는 빠르지만 `itertuples()`보다는
느려요. 다만 그 차이를 직접 재보진 않아서 배수로 말하긴 어려워요. 그리고
의미가 혼란스러울 수 있어요 -- `axis` 파라미터에 따라 행 단위로 동작하기도
하고 열 단위로 동작하기도 해요.

## 주요 차이점

| 항목        | `iterrows()`                  | `itertuples()`                 |
| ----------- | ----------------------------- | ------------------------------ |
| 반환값      | `(index, Series)`             | namedtuple                     |
| 속도        | 느림 (~1x)                    | 빠름 (~100x)                   |
| 메모리      | 높음 (행마다 Series)          | 낮음 (namedtuple)              |
| 접근 방식   | `row["col"]` 또는 `row.col`   | `row.col`만 가능               |
| 기본값 처리 | `row.get("col", default)`     | `getattr(row, "col", default)` |
| 타입 보존   | 아니오 (공통 타입으로 캐스팅) | 예                             |

## 마이그레이션 시 주의점

전환이 완전한 드롭인 교체는 아니에요. 세 가지가 걸렸어요:

**접근 패턴이 바뀌어요.** `row["col"]`은 namedtuple에서 동작하지 않아요.
모든 접근을 `row.col` 또는 `getattr(row, "col")`로 바꿔야 해요. 필드 접근이
수십 개인 큰 함수에서는 번거롭지만 기계적인 작업이에요.

**`.get()`에 직접적인 대응이 없어요.** Series의 `row.get("col", default)`는
namedtuple에서 `getattr(row, "col", default)`가 돼요. 같은 방식으로
동작하지만 다르게 읽히고 발견하기가 덜 쉬워요.

**특수 문자가 포함된 컬럼명이 깨져요.** DataFrame에 `"event properties"`
(공백 포함) 같은 컬럼이 있으면 namedtuple attribute 접근이 실패해요.
먼저 컬럼명을 변경하거나 해당 경우에는 `iterrows()`로 대체해야 해요.

## 이게 왜 효과적인가

성능 차이는 객체 생성 비용에서 나와요. `pd.Series`는 인덱스, dtype 추론,
메모리 할당이 있는 무거운 객체예요. namedtuple은 가벼운 C 레벨 구조체예요.
10,000행을 순회할 때 Series 객체 10,000개를 만드는 것과 namedtuple 10,000개를
만드는 것의 차이가 2초와 20밀리초의 차이예요.

## 실제 예시

```python
# Aggregation step over ~10K daily events

# BEFORE: ~2s for 10K rows
for _, row in filtered.iterrows():
    event_props = row.get("event_properties", {})
    platform = row.get("platform")

# AFTER: ~20ms for 10K rows
for row in filtered.itertuples(index=False):
    event_props = getattr(row, "event_properties", {})
    platform = getattr(row, "platform", None)
```

참고로 대략적인 성능 순위는 이래요:

```text
vectorized ops  >>  itertuples()  >>  apply()  >>  iterrows()
```

직접 측정한 건 양 끝의 차이 하나예요. ~10,000행 단계에서 `iterrows()`와
`itertuples()` 사이가 약 100배였어요. `apply()`는 행마다 Series를 만들지
않으니 중간 어딘가에 있지만 벤치마크를 돌려보진 않았어요. 그러니 숫자가
아니라 순서로만 읽어주세요. 정확한 차이가 중요하다면 각자의 DataFrame에서
측정해 보는 게 좋아요 -- 행 수, 컬럼 수, dtype에 따라 비율이 달라져요.

## 실전 가이드

**`itertuples()`를 사용하면 좋은 경우:**

- 행별 순회가 불가피한 경우 (벡터화할 수 없는 복잡한 로직)
- 행 값에 대한 읽기 전용 접근이면 충분한 경우
- 컬럼명이 유효한 Python 식별자인 경우 (공백이나 특수 문자 없음)
- 성능이 중요한 경우 (1,000행 이상에서 `iterrows()`가 눈에 띄게 느려짐)

**`iterrows()`를 유지해도 되는 경우:**

- **컬럼명에 공백이나 특수 문자가 있는 경우**: namedtuple attribute 접근은
  유효한 Python 식별자가 필요해요. 먼저 컬럼을 이름 변경하거나
  `iterrows()`로 대체하세요.
- **행 값을 수정해야 하는 경우**: namedtuple은 불변이에요. 제자리 변경이
  필요하면 `iterrows()` 또는 벡터화 할당을 사용하세요.
- **벡터화 연산이 가능한 경우**: 로직을 열 단위 연산(`.apply()`, boolean
  indexing, `.str` accessor)으로 표현할 수 있다면 순회를 아예 건너뛰세요 --
  어느 방법보다도 크기 차이로 빨라요.

어떤 순회 방법이든 손을 뻗기 전에, 로직을 벡터화할 수 있는지 먼저
물어보세요. 가능하다면 루프를 건너뛰세요. 불가능하다면 `itertuples()`를
사용하세요.
