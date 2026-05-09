---
title: boto3 S3 put_object() Body 파라미터 인코딩
description: ETL 파이프라인에서 JSON 매니페스트 파일을 S3에 업로드할 때 발생하는 파라미터 검증 에러와 해결 방법이에요.
date: 2026-01-27T00:00:00.000Z
updated: '2026-03-22'
tags:
  - devops
  - aws
  - s3
  - boto3
  - python
category: devops
draft: false
lang: ko
source_lang: en
source_slug: boto3-s3-encoding
source_updated: '2026-03-22'
translation_date: '2026-05-10'
references:
  - url: >-
      https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/s3/client/put_object.html
    title: boto3 S3 Client put_object() 공식 문서
    type: official
---

ETL 파이프라인이 매번 실행 끝에 JSON 매니페스트 파일을 S3에 업로드하고
있었어요. 개발 환경에서는 S3를 mock으로 가려놨더니 통과했는데, 프로덕션에
나가니까 알 수 없는 파라미터 검증 에러로 떨어졌어요. 결국 `.encode("utf-8")`
한 줄을 더 붙이는 게 정답이었는데, 원인을 찾기까지가 길었어요.

## 왜 중요한가요

`json.dumps()`는 Python `str`을 돌려줘요(Python 3에서는 Unicode 텍스트예요).
반면에 `boto3.client('s3').put_object()`는 `Body` 파라미터로 `bytes`,
`bytearray`, 또는 file-like 객체를 받아요. 그러니까 `str`을 그대로 넘기면
런타임 파라미터 검증 에러가 떨어져요. S3 호출은 보통 mock으로 처리하니까
로컬 테스트는 쉽게 통과해 버리고, 프로덕션이나 통합 테스트에 가서야 드러나는
종류의 버그예요.

## 에러 내용

boto3가 이런 메시지를 뱉어요.

```text
Parameter validation failed:
Invalid type for parameter Body, value: <str>, type: <class 'str'>,
valid types: <class 'bytes'>, <class 'bytearray'>, file-like object
```

에러는 유효한 타입을 나열할 뿐, `.encode()`를 쓰라고 알려주지는 않아요.
`json.dumps()`가 `str`을 돌려준다는 사실(즉 `bytes`가 아니라는 사실)을
이미 머릿속에 갖고 있지 않으면, 둘이 이어지지 않아요.

## 잡기 어려웠던 이유

에러 메시지에 인코딩 얘기가 한 마디도 없어요. "Invalid type for parameter
Body" 하고는 유효한 타입만 늘어놓아요. `json.dumps()`가 `str`을 돌려주고,
`str`은 `bytes`가 아니니까 `.encode()`가 필요하다는 흐름을 스스로 이어
붙여야 해요.

Python 2 시절 감각이 남아 있으면 더 헷갈려요. Python 2에서는 `str`이
bytes였거든요. Python 3에서는 `str`이 Unicode 텍스트로 바뀌었어요.
"문자열"을 받는다는 API가 "문자열"(과거 의미의 bytes)을 거부하는 셈이라,
Python 2→3 전환에서 흔히 만나는 패턴이에요.

이 버그는 단위 테스트가 아니라 GitHub Copilot의 PR 리뷰에서 잡혔어요.
`put_object` 호출이 실제로 S3에 업로드할 때만 타는 코드 경로에 들어 있었고,
로컬 테스트에선 mock으로 가려져 있었어요. 온라인에 있는 S3 업로드 예제 중
적지 않은 수가 `.encode("utf-8")` 단계를 그냥 건너뛰니까, 예제를 가져다 쓸
때 이 버그가 조용히 따라붙어요.

## 해결 방법

S3에 업로드하기 전에 JSON 문자열을 항상 bytes로 인코딩해요.

```python
import json
import boto3

s3_client = boto3.client('s3')

# BAD - will fail parameter validation
manifest = {"key": "value"}
s3_client.put_object(
    Bucket="my-bucket",
    Key="manifest.json",
    Body=json.dumps(manifest, indent=2),  # ❌ Returns str
    ContentType="application/json",
)

# GOOD - encodes to bytes
s3_client.put_object(
    Bucket="my-bucket",
    Key="manifest.json",
    Body=json.dumps(manifest, indent=2).encode("utf-8"),  # ✅ Returns bytes
    ContentType="application/json",
)
```

읽기 좋게 변수에 한 번 받아 쓰는 방법도 있어요.

```python
# Write bytes directly without json.dumps()
import json

data_bytes = json.dumps(manifest, indent=2).encode("utf-8")
s3_client.put_object(
    Bucket="my-bucket",
    Key="manifest.json",
    Body=data_bytes,
    ContentType="application/json",
)
```

## 왜 UTF-8인가요

UTF-8은 RFC 8259 기준으로 JSON의 기본 인코딩이에요. AWS S3도 텍스트
콘텐츠는 UTF-8을 가정해요. Unicode 문자도 모두 깔끔하게 처리해 줘요.
S3로 보내는 JSON 데이터에 다른 인코딩을 굳이 쓸 이유는 없어요.

## 실전 팁

`s3.put_object()`로 텍스트 콘텐츠를 보낼 때마다 `.encode("utf-8")`를
같이 붙여요. JSON, CSV, 일반 텍스트, 직렬화한 문자열 데이터 전부 같은
규칙이에요. ETL 파이프라인의 출력 파일, 매니페스트 업로드, 메타데이터
파일, 설정 파일 모두 해당돼요.

이미 bytes인 바이너리 데이터(이미지, PDF, Parquet 파일)는 `.encode()`가
필요 없어요. `open(path, "rb")`로 연 file-like 객체를 그대로 넘기는
경우도 마찬가지고요. `s3.upload_file()`이나 `s3.upload_fileobj()`는
인코딩을 내부에서 알아서 처리해 줘요.

이 에러를 만났다면 ETL 파이프라인에서 다음 위치를 우선 살펴봐요.

1. 매니페스트 파일 업로드
2. 메타데이터/통계 파일 업로드
3. 설정 파일 업로드
4. S3 업로드 직전의 JSON 직렬화

규칙은 단순해요. `json.dumps()`로 만든 결과를 `put_object()`에 그대로
넘긴다면, 그 사이에 `.encode("utf-8")`를 한 번 끼워 넣어요.
