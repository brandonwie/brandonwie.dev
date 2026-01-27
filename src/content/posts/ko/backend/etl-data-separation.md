---
title: 'ETL 데이터 분리 전략'
description: >-
  자동화된 ETL 데이터와 수동 백필 데이터를 같은 S3 경로에 섞어두면 추적, 처리, 디버깅이 어려워집니다. 경로를 분리해서 해결하는 방법을 알아봅니다.
date: 2026-01-27T00:00:00.000Z
updated: '2026-01-28'
tags:
  - backend
  - etl
  - data-engineering
  - s3
  - architecture
category: backend
draft: false
lang: ko
source_lang: en
source_slug: etl-data-separation
source_updated: 2026-01-27T00:00:00.000Z
translation_date: '2026-01-28'
references:
  - url: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-folders.html'
    title: Amazon S3 폴더 사용하기
    type: official
---

# ETL 데이터 분리 전략

## 문제

자동화된 ETL 데이터와 수동으로 복구한 백필 데이터를 같은 S3 경로에 섞어두면 여러 문제가 생깁니다:

1. **데이터 출처 추적 불가** - 자동화 데이터인지 수동 데이터인지 구분이 안 됨
2. **처리 제어 어려움** - 일일 ETL이 백필 데이터를 실수로 처리할 수 있음
3. **디버깅 곤란** - 어떤 데이터가 어디서 왔는지 추적하기 어려움
4. **라이프사이클 관리 불가** - 데이터별로 다른 보존 정책을 적용할 수 없음

## 해결책: 저장 경로 분리

데이터 소스별로 다른 S3 prefix를 사용하면 됩니다:

```text
s3://bucket/
├── raw-data/              # 자동화된 일반 ETL
│   └── data_2026-01-27.json
└── raw-data-backfill/     # 수동 백필 복구용
    └── data_2026-01-20.json
```

## Amplitude ETL 예시

### 분리 전

```text
s3://amplitude-raw-bucket/
└── {PROJECT_ID}/
    ├── {PROJECT_ID}_2026-01-27_10#0.json.gz  # 자동화
    ├── {PROJECT_ID}_2026-01-27_10_complete
    ├── {PROJECT_ID}_2026-01-20_19#0.json.gz  # 백필 - 섞여있음!
    └── {PROJECT_ID}_2026-01-20_19_complete
```

**문제점:**

- 어떤 파일이 백필된 건지 알 수 없음
- 일일 ETL이 둘 다 읽어서 중복 처리 가능성
- 관심사 분리가 안 됨

### 분리 후

```text
s3://amplitude-raw-bucket/
├── {PROJECT_ID}/                              # 자동화 전용
│   ├── {PROJECT_ID}_2026-01-27_10#0.json.gz
│   └── {PROJECT_ID}_2026-01-27_10_complete
└── {PROJECT_ID}-backfill/                     # 수동 백필 전용
    ├── {PROJECT_ID}-backfill_2026-01-20_19#0.json.gz
    └── {PROJECT_ID}-backfill_2026-01-20_19_complete
```

**장점:**

- 데이터 출처가 명확하게 추적됨
- 경로별로 별도 ETL 실행 가능
- 각각 다른 보존 정책 적용 가능
- 백필 데이터가 일일 자동화를 방해하지 않음

## 구현 패턴

### 설정

```python
# 일반 ETL은 자동화 경로에서 읽음
SOURCE_PATH_REGULAR = "s3://amplitude-raw-bucket/{PROJECT_ID}/"

# 백필은 별도 경로에 저장
SOURCE_PATH_BACKFILL = "s3://amplitude-raw-bucket/{PROJECT_ID}-backfill/"

# 처리 후에는 둘 다 같은 정제 경로에 저장
TARGET_PATH = "s3://amplitude-refined-bucket/event/"
```

### 백필 작업

```python
# jobs/amplitude/amplitude_backfill.py
RAW_PREFIX = "{PROJECT_ID}-backfill"  # 백필용 별도 prefix

def save_to_raw_bucket(data: bytes, date: str, hour: int):
    """백필 데이터를 별도 S3 경로에 저장."""
    base_key = f"{RAW_PREFIX}/{RAW_PREFIX}_{date}_{hour}"
    data_key = f"{base_key}#0.json.gz"
    # 저장 위치: s3://bucket/{PROJECT_ID}-backfill/{PROJECT_ID}-backfill_{date}_{hour}#0.json.gz
```

### 백필 데이터 처리

백필 데이터를 처리하려면 백필 경로로 ETL을 실행합니다:

```bash
# 일반 일일 ETL (자동화)
python cli.py amplitude-etl \
  --execution-date 2026-01-27 \
  --source-path s3://amplitude-raw-bucket/{PROJECT_ID}/

# 백필 데이터 처리 (수동)
python cli.py amplitude-etl \
  --execution-date 2026-01-20 \
  --source-path s3://amplitude-raw-bucket/{PROJECT_ID}-backfill/
```

## 데이터 흐름도

```mermaid
flowchart LR
    A[Amplitude Export] -->|자동 저장| B[s3://.../{PROJECT_ID}/]
    B -->|일일 ETL| C[s3://.../event/]

    D[Backfill API] -->|수동 저장| E[s3://.../{PROJECT_ID}-backfill/]
    E -->|수동 ETL| C

    C --> F[Analytics/BI 도구]
```

## 장점 정리

| 항목 | 장점 |
| ---- | ---- |
| **추적성** | 어떤 데이터가 백필된 건지 정확히 알 수 있음 |
| **제어** | 백필 데이터를 자동이 아닌 필요할 때만 처리 |
| **디버깅** | 특정 데이터 소스로 문제를 격리 가능 |
| **라이프사이클** | 다른 보존 정책 적용 가능 (예: 처리 후 백필 삭제) |
| **감사** | 백필 작업을 별도로 추적 가능 |
| **안전성** | 백필이 일일 파이프라인을 실수로 망가뜨릴 수 없음 |

## 이 패턴을 쓰면 좋은 경우

경로를 분리하면 좋은 경우:

- ✅ 데이터가 다른 소스에서 오는 경우 (자동화 vs 수동)
- ✅ 소스별로 처리 로직이 다를 수 있는 경우
- ✅ 명확한 데이터 계보 추적이 필요한 경우
- ✅ 실수로 재처리되는 걸 방지하고 싶은 경우
- ✅ 다른 보존/라이프사이클 정책이 필요한 경우

분리하지 않아도 되는 경우:

- ❌ 데이터 소스가 동일한 경우
- ❌ 처리 로직이 100% 같은 경우
- ❌ 데이터 출처를 구분할 필요가 없는 경우
- ❌ 불필요한 복잡성만 추가되는 경우

## 대안: 메타데이터 태깅

분리까지는 필요 없고 추적만 하고 싶다면 S3 object tag를 사용할 수 있습니다:

```python
s3_client.put_object(
    Bucket=bucket,
    Key=key,
    Body=data,
    Tagging="source=backfill&manual=true"  # 경로 분리 대신 태그 사용
)
```

**트레이드오프:** 태그는 읽으려면 추가 API 호출이 필요하지만, 데이터를 한 곳에 모아둘 수 있습니다.
