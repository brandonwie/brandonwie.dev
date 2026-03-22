---
title: boto3 S3 put_object() Body 파라미터 인코딩
description: ETL 파이프라인에서 JSON 매니페스트 파일을 S3에 업로드할 때 발생하는 파라미터 검증 에러와 해결 방법입니다.
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
translation_date: '2026-02-12'
references:
  - url: >-
      https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/s3/client/put_object.html
    title: boto3 S3 Client put_object() 공식 문서
    type: official
---

ETL 파이프라인이 매번 실행 후 JSON 매니페스트 파일을 S3에 업로드하고
있었습니다. 개발 환경에서는 S3를 mock 처리해서 잘 동작했는데, 프로덕션에서
알 수 없는 파라미터 검증 에러로 실패했어요. 해결 방법은 `.encode("utf-8")`
한 줄 추가였지만, 원인을 찾는 데 생각보다 오래 걸렸습니다.

## 이게 왜 중요한가요

`json.dumps()`는 Python `str`(Python 3에서 Unicode 텍스트)을 반환합니다.
`boto3.client('s3').put_object()`는 `Body` 파라미터로 `bytes`, `bytearray`,
또는 파일 유사 객체를 기대합니다. `str`을 직접 전달하면 런타임 파라미터 검증
에러가 발생해요. S3 호출을 보통 mock 처리하기 때문에 로컬 테스트를 통과하고
프로덕션이나 통합 테스트에서만 발견되는 종류의 버그입니다.

## 에러 내용

boto3가 이런 에러를 발생시킵니다:

```text
Parameter validation failed:
Invalid type for parameter Body, value: <str>, type: <class 'str'>,
valid types: <class 'bytes'>, <class 'bytearray'>, file-like object
```

에러는 유효한 타입을 나열하지만 `.encode()`를 제안하지는 않습니다.
`json.dumps()`가 `str`을 반환한다는 걸(`bytes`가 아니라) 이미 알고 있지
않으면 연결고리가 바로 보이지 않습니다.

## 잡기 어려웠던 이유

에러 메시지에 인코딩 언급이 전혀 없습니다. "Invalid type for parameter Body"
라고만 하고 유효한 타입을 나열해요. `json.dumps()`가 `str`을 반환하고,
`str`은 `bytes`가 아니니까 `.encode()`가 필요하다는 걸 스스로 연결해야
합니다.

Python 2 경험이 있으면 특히 혼란스럽습니다. Python 2에서 `str`은 bytes였어요.
Python 3에서 `str`은 Unicode 텍스트입니다. "문자열"을 받는 API가
"문자열"(bytes 의미)을 거부하는 건 전형적인 Python 2에서 3으로의 전환
문제입니다.

이 버그는 단위 테스트가 아닌 GitHub Copilot의 PR 리뷰에서 발견되었습니다.
`put_object` 호출은 실제 S3 업로드 시에만 실행되는 코드 경로에 있었는데,
로컬 테스트에서는 mock 처리했거든요. 온라인의 많은 S3 업로드 예제가
`.encode("utf-8")` 단계를 생략하고 있어서, 예제 코드를 복사할 때 이 버그가
조용히 도입됩니다.

## 해결 방법

S3에 업로드하기 전에 항상 JSON 문자열을 bytes로 인코딩합니다:

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

명확하게 변수에 먼저 할당할 수도 있습니다:

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

UTF-8은 RFC 8259에 따른 JSON의 기본 인코딩입니다. AWS S3는 텍스트 콘텐츠에
UTF-8을 기대합니다. 모든 Unicode 문자를 올바르게 처리해요. S3로 보내는 JSON
데이터에 다른 인코딩을 사용할 이유가 없습니다.

## 실전 팁

`s3.put_object()`에 텍스트 콘텐츠를 전달할 때마다 `.encode("utf-8")`를
추가하세요. JSON, CSV, 일반 텍스트, 모든 직렬화된 문자열 데이터에
해당합니다. ETL 파이프라인의 출력 파일 기록, 매니페스트 업로드, 메타데이터
파일, 설정 파일 모두 마찬가지입니다.

바이너리 데이터(이미지, PDF, Parquet 파일)는 이미 bytes이므로
`.encode()`가 필요 없습니다. `open(path, "rb")`로 연 파일 유사 객체를
전달하는 경우도 마찬가지이고, `s3.upload_file()`이나
`s3.upload_fileobj()`는 내부적으로 인코딩을 처리합니다.

이 에러가 발생하면 ETL 파이프라인에서 다음 위치를 확인하세요:

1. 매니페스트 파일 업로드
2. 메타데이터/통계 파일 업로드
3. 설정 파일 업로드
4. S3 업로드 전 JSON 직렬화

규칙은 간단합니다: `json.dumps()`를 호출하고 그 결과를 `put_object()`에
전달한다면, 둘 사이에 `.encode("utf-8")`를 추가하세요.
