---
title: "Keyword-Only 파라미터로 중복 함수 통합하기"
description: >-
  두 모듈에 거의 동일한 함수가 존재할 때, Python의 keyword-only 파라미터로
  하나로 통합하는 패턴을 소개합니다.
date: 2026-02-06T00:00:00.000Z
updated: 2026-02-06T00:00:00.000Z
tags:
  - backend
  - python
  - refactoring
  - api-design
category: backend
draft: false
lang: ko
source_lang: en
source_slug: python-function-dedup-keyword-params
source_updated: "2026-02-06"
translation_date: "2026-02-12"
references:
  - url: "https://docs.python.org/3/tutorial/controlflow.html#keyword-only-arguments"
    title: Python Keyword-Only Arguments
    type: official
  - url: null
    title: Applied in etl-project deduplication
    type: experience
---

두 개의 파일에 있는 두 함수가 같은 일을 하고 있었는데, 한쪽에만 버그 수정을
적용하고 나서야 중복을 알아챘어요. 전형적인 복사-붙여넣기 함정이죠. 별도
모듈에 들어있으면 아무도 확인하지 않거든요.

ETL 코드베이스에서 이런 일은 흔해요. "일반" 파이프라인 경로와 "백필" 경로가
있고, 둘 다 약간 다른 설정으로 같은 핵심 작업을 수행해요. 시간이 지나면서
구현이 달라지고, 버그 수정은 한쪽에만 적용되고, 결국 프로덕션에서 문제가
터지게 돼요.

## 이런 상황이 발생하는 이유

두 함수가 별도 모듈(`amplitude_common`과 `amplitude_backfill`)에 있어서,
거의 동일한 로직이 있다는 사실이 눈에 띄지 않았어요. 같은 버그 수정을 양쪽에
적용해야 하는 시점이 되어서야 중복을 발견했죠.

두 함수를 줄 단위로 비교해보니 차이점은 S3 prefix와 zip 아카이브 추출 여부
뿐이었어요. 숨겨진 조건 로직도 없고, 구조적 차이도 없었어요. 딱 두 개의
플래그 차이였죠.

## 검토한 옵션들

네 가지 접근법을 검토한 후 하나를 선택했어요.

| 옵션                      | 장점                                                  | 단점                                                      |
| ------------------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| Keyword-only params (`*`) | 호출자가 플래그를 명시해야 함; 기본값으로 호환성 유지 | 플래그마다 시그니처가 커짐                                |
| `mode: str` enum 파라미터 | 여러 플래그 대신 단일 파라미터                        | 문자열 타입; 자동완성 없음; 잘못된 값 가능                |
| Config dict / dataclass   | 동작 설정을 하나로 묶음                               | 1-3개 플래그에는 과도한 설계; 호출자가 객체를 만들어야 함 |
| 별도 함수 유지            | 리팩토링 불필요; 독립적                               | 버그 수정을 두 번 해야 함; 구현이 달라짐                  |

`mode: str` 파라미터는 시그니처가 작아져서 매력적이었어요. 하지만 자동완성이
안 되고 컴파일 타임 안전성도 없는 문자열 타입 API가 만들어져요. 결국
내부에서 `if mode == "backfill"` 같은 분기 로직을 써야 하는데, 그게 더
지저분하죠. Config dataclass는 깔끔하게 묶어주지만, 동작 차이가 딱 두 개의
플래그일 때는 과도한 설계예요.

## 해결 방법

Python의 `*` 구분자를 사용해서 하나의 함수로 통합하고, 동작 차이를
keyword-only 파라미터로 처리했어요.

변경 전 코드는 이렇게 생겼어요:

```python
# BEFORE: Two separate functions in two files

# module_a.py
def save_data(data, date, hour):
    # extracts from zip, saves to prefix "regular"
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        gzip_data = zf.read(zf.namelist()[0])
    key = f"regular/regular_{date}_{hour}"
    s3.put_object(Body=gzip_data, Key=key)

# module_b.py
def save_data(data, date, hour):
    # saves raw bytes to prefix "backfill"
    key = f"backfill/backfill_{date}_{hour}"
    s3.put_object(Body=data, Key=key)
```

통합된 버전은 이렇게 돼요:

```python
# AFTER: Single function with keyword-only params

# common.py
DEFAULT_PREFIX = "regular"

def save_data(
    data: bytes,
    date: str,
    hour: int,
    *,                          # Everything after * is keyword-only
    prefix: str = DEFAULT_PREFIX,
    extract_zip: bool = True,
) -> str | None:
    if extract_zip:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            upload_data = zf.read(zf.namelist()[0])
    else:
        upload_data = data

    key = f"{prefix}/{prefix}_{date}_{hour}"
    s3.put_object(Body=upload_data, Key=key)
```

핵심은 `*` 구분자예요. 그 뒤에 오는 모든 파라미터는 반드시 이름을 지정해서
전달해야 해요.

## 이것이 효과적인 이유

`*`는 호출자가 파라미터를 명시적으로 이름 붙여 전달하도록 강제해요:

```python
# Existing callers work unchanged (use defaults)
save_data(data, date, hour)

# New callers must be explicit about behavior
save_data(data, date, hour, prefix="backfill", extract_zip=False)
```

`*`가 없으면 누군가 실수로 위치 인자로 전달할 수 있어요:

```python
save_data(data, date, hour, "backfill", False)  # Unclear intent
```

이 호출은 컴파일이 되지만, 6개월 후에 읽으면 `"backfill"`과 `False`가 뭘
의미하는지 함수 시그니처를 확인하기 전까지 아무도 모르죠. Keyword 인자는
의도를 자체 문서화해줘요.

기본값은 기존 동작을 보존해요. "일반" 경로의 모든 기존 호출자는 변경 없이
그대로 동작해요. 백필 호출자만 두 개의 새로운 keyword 인자를 전달하면 돼요.

## 실전 가이드

이 패턴은 함수가 80% 이상 동일하고 동작 차이가 1-3개의 플래그일 때
사용하세요. 그 이상이면 서로 다른 추상화를 하나의 함수에 억지로 넣는
셈이에요.

| 조건                     | 조치                              |
| ------------------------ | --------------------------------- |
| 함수가 80% 이상 동일     | 파라미터로 통합                   |
| 동작 차이가 1-3개 플래그 | Keyword-only params 사용          |
| 동작 차이가 구조적       | 별도 유지 (다른 추상화)           |
| 같은 모듈의 함수         | 이미 하나여야 할 가능성 높음      |
| 다른 모듈의 함수         | 공유 모듈로 이동, 양쪽에서 import |

두 함수가 로직의 80% 미만을 공유할 때는 사용하지 마세요. 통합하면 조건
분기로 가득한 함수가 되어 두 개의 별도 함수보다 읽기 어려워져요. 또한 동작
플래그가 3개를 넘으면 피하세요. 너무 많은 keyword-only params는 서로 다른
추상화라는 신호예요. Strategy 패턴이나 별도 클래스를 고려하세요.

한 가지 더: 한쪽 경로가 일시적이라면 (한 번 실행하고 삭제할 백필 같은 경우),
통합하는 노력이 낭비예요. 단순하게 유지하고 작업이 끝나면 코드를 삭제하세요.
