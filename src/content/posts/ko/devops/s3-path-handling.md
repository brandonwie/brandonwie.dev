---
title: S3 경로 정규화 패턴
description: S3 key prefix에 일관된 trailing slash를 보장하는 정규화 패턴
date: 2026-01-27T00:00:00.000Z
updated: '2026-03-22'
tags:
  - devops
  - aws
  - s3
  - python
  - path-handling
category: devops
draft: false
lang: ko
source_lang: en
source_slug: s3-path-handling
source_updated: '2026-03-22'
translation_date: '2026-02-12'
references:
  - url: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingObjects.html'
    title: UsingObjects.html
    type: official
---

ETL 파이프라인이 파일을 잘못된 S3 경로에 업로드하는 원인을 찾는 데 한 시간을
썼어요. 로그에는 에러가 없었어요. boto3 호출도 성공을 반환했죠. 하지만 파일이
완전히 다른 위치에 저장되고 있었어요. 원인은 S3 prefix에 빠진 trailing
slash였어요.

## 왜 중요한가

S3에는 실제 디렉토리가 없어요. 폴더 구조처럼 보이는
것(`bucket/prefix/file.json`)은 사실 `/`를 관례적 구분자로 사용하는 평면 key
네임스페이스예요. 즉, S3는 prefix가 슬래시로 끝나든 안 끝나든 상관하지 않아요.
둘 다 유효한 key prefix로 취급하죠. 바로 이게 문제예요.

prefix와 파일명을 f-string으로 연결해서 object key를 만들 때, trailing slash가
빠지면 조용히 잘못된 key가 생성돼요:

```python
# 사용자 입력: s3://bucket/714756 (trailing slash 없음)
prefix = "714756"
file_key = f"{prefix}714756_2026-01-27_10#0.json.gz"
# 결과: "714756714756_2026-01-27_10#0.json.gz"  -- 잘못됨
# 기대값: "714756/714756_2026-01-27_10#0.json.gz"
```

예외도 없고 경고도 없어요. 잘못된 key로 객체가 성공적으로 업로드돼요.

## 겪었던 어려움

**조용한 데이터 손상**이 가장 심각했어요. trailing slash가 빠져도 유효해
보이지만 잘못된 S3 key가 만들어져요. 객체가 잘못된 경로에 업로드되는데 예외는
발생하지 않아요. 다운스트림 소비자가 데이터를 찾지 못할 때야 비로소 문제를
발견하게 돼요.

**일관되지 않은 사용자 입력**이 문제를 악화시켰어요. 어떤 호출자는
`s3://bucket/prefix`를 전달하고, 다른 호출자는 `s3://bucket/prefix/`를 전달해요.
정규화 없이는 key를 만드는 모든 코드에서 두 형태를 모두 처리해야 해서, 코드베이스
전체에 임시 수정이 흩어져 있었어요.

**`list_objects_v2`가 false negative를 반환했어요.** prefix가 잘못되면 S3
리스팅이 에러 대신 빈 결과를 반환해요. "데이터가 없다"처럼 보이지 "prefix가
잘못됐다"처럼 보이지 않아서, 디버깅 시간이 낭비됐어요.

**`os.path.join`은 플랫폼 함정이었어요.** S3 경로에 `os.path.join`을 사용하면
깔끔해 보이지만, Windows에서는 백슬래시를 생성해요. S3는 백슬래시를 경로
구분자가 아닌 key 이름의 리터럴 문자로 취급해요.

## 해결책

파싱 경계에서 prefix를 한 번 정규화하면 돼요. 이후의 모든 함수는 prefix가
`/`로 끝난다고 가정할 수 있어요:

```python
from urllib.parse import urlparse

def parse_s3_path(s3_path: str) -> tuple[str, str]:
    """S3 URI를 파싱하고 prefix를 정규화합니다.

    Args:
        s3_path: s3://bucket/prefix 또는 s3://bucket/prefix/ 형태의 S3 URI

    Returns:
        (bucket, prefix) 여기서 prefix는 비어있지 않으면 /로 끝남
    """
    parsed = urlparse(s3_path)
    bucket = parsed.netloc
    prefix = parsed.path.lstrip("/")

    # 비어있지 않을 때 prefix가 "/"로 끝나도록 보장
    # s3://bucket/prefix와 s3://bucket/prefix/ 모두 동작하게 함
    if prefix and not prefix.endswith("/"):
        prefix = prefix + "/"

    return bucket, prefix
```

이 함수는 표준 라이브러리의 `urlparse`를 사용해요. path 컴포넌트에서 앞의
슬래시를 제거하고(`urlparse`가 포함시키므로), prefix가 비어있지 않고 trailing
slash가 없으면 추가해요.

## 실제 사용 예시

```python
# 두 형태 모두 올바르게 동작
bucket, prefix = parse_s3_path("s3://my-bucket/714756")
# prefix = "714756/"

bucket, prefix = parse_s3_path("s3://my-bucket/714756/")
# prefix = "714756/"

# 파일 key를 올바르게 구성
data_key = f"{prefix}714756_2026-01-27_10#0.json.gz"
# 결과: "714756/714756_2026-01-27_10#0.json.gz"

complete_key = f"{prefix}714756_2026-01-27_10_complete"
# 결과: "714756/714756_2026-01-27_10_complete"
```

## 정규화 전후 비교

### 정규화 전

```python
# 사용자 입력: s3://bucket/714756
prefix = "714756"  # trailing slash 없음

# list_objects_v2 검색
search_prefix = f"{prefix}714756_2026-01-27"
# 결과: "714756714756_2026-01-27"  -- 잘못됨
# "714756/" 아래의 객체와 매칭 안 됨

# 파일 key 구성
file_key = f"{prefix}/{prefix}_2026-01-27_10#0.json.gz"
# 결과: "714756/714756_2026-01-27_10#0.json.gz"
# 하지만 검색 prefix는 여전히 잘못됨!
```

파일 key 구성에서 슬래시를 기억하더라도, 검색 prefix는 여전히 깨져 있었어요.
이 불일치가 이 버그를 그토록 교활하게 만드는 거예요.

### 정규화 후

```python
# 사용자 입력: s3://bucket/714756
prefix = "714756/"  # 정규화됨

# list_objects_v2 검색
search_prefix = f"{prefix}714756_2026-01-27"
# 결과: "714756/714756_2026-01-27"  -- 올바름

# 파일 key 구성
file_key = f"{prefix}{prefix.rstrip('/')}_2026-01-27_10#0.json.gz"
# 결과: "714756/714756_2026-01-27_10#0.json.gz"  -- 올바름
```

prefix를 경계에서 한 번 정규화했기 때문에 검색과 파일 key 모두 일관적이에요.

## 자주 사용하는 패턴

### 패턴 1: Prefix 기반 검색

```python
bucket, prefix = parse_s3_path(source_path)
# prefix = "714756/" (정규화됨)

# 패턴에 맞는 파일 검색
search_prefix = f"{prefix}714756_{date_prefix}"
# 결과: "714756/714756_2026-01-27"

paginator = s3_client.get_paginator("list_objects_v2")
for page in paginator.paginate(Bucket=bucket, Prefix=search_prefix):
    # 714756/ 아래에서 패턴에 매칭되는 모든 객체를 찾음
    pass
```

### 패턴 2: 파일 Key 구성

```python
bucket, prefix = parse_s3_path(source_path)
# prefix = "714756/" (정규화됨)

# 파일 이름 구성 시 trailing slash 제거
base_name = prefix.rstrip("/")  # "714756"
file_key = f"{prefix}{base_name}_{date}_{hour}#0.json.gz"
# 결과: "714756/714756_2026-01-27_10#0.json.gz"
```

prefix 이름을 파일명의 일부로 포함하는 경우처럼 슬래시 없는 prefix가 필요하면,
`rstrip("/")`을 사용하세요. 정규화된 prefix에서 두 가지 옵션을 깔끔하게
얻을 수 있어요.

## 엣지 케이스

| 입력                  | 정규화된 Prefix | 비고        |
| --------------------- | --------------- | ----------- |
| `s3://bucket/`        | `""` (빈 값)    | 루트 레벨   |
| `s3://bucket`         | `""` (빈 값)    | 루트 레벨   |
| `s3://bucket/prefix`  | `"prefix/"`     | 슬래시 추가 |
| `s3://bucket/prefix/` | `"prefix/"`     | 이미 올바름 |
| `s3://bucket/a/b/c`   | `"a/b/c/"`      | 다단계      |

빈 prefix 케이스는 루트 레벨 작업을 올바르게 처리해요. prefix가 비어있으면
f-string 보간이 파일명만 생성하는데, 이게 올바른 동작이에요.

## os.path.join이 답이 아닌 이유

깔끔해 보이지만 함정이에요:

```python
import os

prefix = "714756"
date = "2026-01-27"
hour = 10

# os.path.join으로 깔끔한 경로 구성
file_key = os.path.join(prefix, f"{prefix}_{date}_{hour}#0.json.gz")
# 결과: "714756/714756_2026-01-27_10#0.json.gz"  -- Unix에서는 동작
```

macOS와 Linux에서는 동작해요. 하지만 Windows에서 `os.path.join`은
`714756\714756_2026-01-27_10#0.json.gz`를 생성해요. S3는 백슬래시를 구분자가
아닌 리터럴 문자로 취급해요. CI는 Linux에서 돌아갈 수 있지만, 개발자가
Windows에서 테스트를 실행하면 key가 잘못돼요.

S3 경로에는 항상 명시적 `/` 연결이나 위의 정규화 패턴을 사용하세요.

## 실전 팁

**이 패턴을 사용하면 좋은 경우:** 사용자 입력으로 받은 S3 URI에서 object key를
만드는 모든 코드예요. ETL 파이프라인, 공유 boto3 래퍼, S3 경로를 인자로 받는
CLI 도구 모두 entry point에서 prefix를 한 번 정규화하면 이점을 얻어요.

**넘어가도 되는 경우:** 하드코딩된 S3 경로(상수에 슬래시를 포함시키면 됨),
non-S3 파일 시스템(GCS는 경로 의미가 다름), 이미 S3 URI 파서를 제공하는
SDK(JavaScript용 AWS SDK v3 같은)를 사용할 때예요.

핵심 교훈: 경계에서 정규화하고, 그 외 모든 곳에서 불변 조건을 가정하세요.
`parse_s3_path` 호출 한 번으로 버그의 한 카테고리 전체를 제거할 수 있어요.
