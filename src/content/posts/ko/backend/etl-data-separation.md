---
title: ETL 데이터 분리 전략
description: >-
  자동화된 ETL 데이터와 수동 백필 데이터를 같은 S3 경로에 섞어두면 추적, 처리,
  디버깅이 어려워집니다
date: 2026-01-27T00:00:00.000Z
updated: 2026-02-06T00:00:00.000Z
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
source_updated: "2026-02-06"
translation_date: "2026-02-12"
references:
  - url: "https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-folders.html"
    title: Amazon S3 폴더 사용하기
    type: official
---

<script>
import Mermaid from '$lib/components/Mermaid.svelte';
</script>

Amplitude ETL 파이프라인에 데이터 공백이 생겼어요. 몇 시간분의 이벤트
데이터가 S3에서 빠져 있어서 Export API로 수동 백필을 실행했어요. 복구한
파일들이 자동화 export와 같은 S3 prefix에 저장됐어요. 하루 만에 일일 ETL이
백필 데이터를 조용히 재처리해서 정제 레이어에 중복 레코드가 생겼어요.

근본 원인은 백필 자체가 아니었어요. 같은 prefix를 공유하면 백필 파일과 자동화
파일을 구분할 방법이 없다는 게 문제였어요.

## 이게 왜 중요한가

정기 ETL 데이터와 수동 복구 백필 데이터를 같은 S3 경로에 섞으면 네 가지
문제가 생겨요:

1. **소스 추적 불가** -- 자동화 데이터인지 수동 데이터인지 구분할 수 없음
2. **처리 제어 불가** -- 일일 ETL이 백필 데이터를 실수로 처리할 수 있음
3. **디버깅 곤란** -- 어떤 데이터가 어디서 왔는지 추적하기 어려움
4. **라이프사이클 관리 불가** -- 데이터별로 다른 보존 정책을 적용할 수 없음

이런 문제들은 시간이 지나면서 복합적으로 커져요. 한 번의 실수 재처리가 눈에
보이는 걸 깨뜨리지 않을 수도 있어요. 하지만 다운스트림 대시보드에 숫자가
부풀려져 나오고 어떤 데이터가 두 번 집계됐는지 아무도 특정할 수 없을 때,
디버깅 비용은 빠르게 늘어나요.

## 검토한 방법들

세 가지 접근법을 검토했어요:

| 방법                   | 장점                                                          | 단점                                                 |
| ---------------------- | ------------------------------------------------------------- | ---------------------------------------------------- |
| **S3 prefix 분리**     | `ListObjects`에서 명확, 추가 API 호출 불필요, 기존 ETL과 호환 | prefix 2개 관리, 네이밍 조율 필요                    |
| **S3 object tag**      | 데이터가 한 곳에, prefix 구조 단순                            | `ListObjects`에서 안 보임, 객체당 추가 API 호출 필요 |
| **DB metadata 테이블** | 풍부한 쿼리 가능, 유연한 스키마                               | DB 필요, 업로드마다 추가 write, S3와 불일치 가능     |

S3 object tag가 처음엔 매력적으로 보였어요 -- 모든 걸 한 prefix에 두고 백필
파일에 태그를 달면 되니까요. 하지만 태그는 `ListObjects` 응답에 나타나지
않아요. 태그로 필터링하려면 객체마다 별도의 `GetObjectTagging` 호출이
필요한데, 객체 수에 비례해서 지연과 API 비용이 늘어나요.

DB metadata 테이블은 가장 풍부한 쿼리 기능을 제공하지만, S3 실제 상태와
불일치할 수 있는 두 번째 정보 소스가 생겨요. 업로드마다 추가 write가
필요하고, 테이블 자체도 유지보수가 필요해요.

## 해결책: 저장 경로 분리

S3 prefix 분리를 선택한 이유는 핵심 요구사항이 일일 ETL이 백필 데이터를
실수로 처리하는 걸 방지하는 거였기 때문이에요. Prefix 기반 분리는 ETL 리더에
코드 변경 없이 이걸 달성해요 -- 다른 prefix를 가리키기만 하면 돼요.

```text
s3://bucket/
├── raw-data/              # 정기 자동화 ETL
│   └── data_2026-01-27.json
└── raw-data-backfill/     # 수동 백필 복구
    └── data_2026-01-20.json
```

### Amplitude ETL: 분리 전후

**분리 전** -- 백필 파일이 자동화 export와 섞여 있는 상태:

```text
s3://amplitude-raw-bucket/
└── {PROJECT_ID}/
    ├── {PROJECT_ID}_2026-01-27_10#0.json.gz  # 자동화
    ├── {PROJECT_ID}_2026-01-27_10_complete
    ├── {PROJECT_ID}_2026-01-20_19#0.json.gz  # 백필 - 섞여있음!
    └── {PROJECT_ID}_2026-01-20_19_complete
```

**분리 후** -- 각 소스가 자체 prefix를 가짐:

```text
s3://amplitude-raw-bucket/
├── {PROJECT_ID}/                              # 자동화 전용
│   ├── {PROJECT_ID}_2026-01-27_10#0.json.gz
│   └── {PROJECT_ID}_2026-01-27_10_complete
└── {PROJECT_ID}-backfill/                     # 수동 백필 전용
    ├── {PROJECT_ID}-backfill_2026-01-20_19#0.json.gz
    └── {PROJECT_ID}-backfill_2026-01-20_19_complete
```

## 구현

### 설정

```python
# 정기 ETL은 자동화 경로에서 읽음
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
    """Save backfill data to separate S3 path."""
    base_key = f"{RAW_PREFIX}/{RAW_PREFIX}_{date}_{hour}"
    data_key = f"{base_key}#0.json.gz"
    # Saves to: s3://bucket/{PROJECT_ID}-backfill/{PROJECT_ID}-backfill_{date}_{hour}#0.json.gz
```

### 백필 데이터 처리

백필 데이터를 처리하려면 백필 경로로 ETL을 실행하면 돼요:

```bash
# 정기 일일 ETL (자동화)
python cli.py amplitude-etl \
  --execution-date 2026-01-27 \
  --source-path s3://amplitude-raw-bucket/{PROJECT_ID}/

# 백필 데이터 처리 (수동)
python cli.py amplitude-etl \
  --execution-date 2026-01-20 \
  --source-path s3://amplitude-raw-bucket/{PROJECT_ID}-backfill/
```

### 데이터 흐름

<Mermaid code={`flowchart LR
    A[Amplitude Export] -->|자동 저장| B[s3://.../{PROJECT_ID}/]
    B -->|일일 ETL| C[s3://.../event/]
    D[Backfill API] -->|수동 저장| E[s3://.../{PROJECT_ID}-backfill/]
    E -->|수동 ETL| C
    C --> F[Analytics/BI 도구]`} />

## 이게 왜 효과적인가

일일 ETL은 백필 파일을 아예 볼 수 없어요. 다른 prefix에 있으니까요. 필터링
로직도 필요 없고, 태그를 확인할 필요도 없고, metadata 테이블을 쿼리할 필요도
없어요. ETL 코드는 전혀 바뀌지 않아요 -- 분리가 스토리지 레이어에서 이뤄져요.

두 경로 모두 처리 후 같은 정제 버킷에 기록하기 때문에, 다운스트림 소비자는
분리를 알 필요 없이 통합된 뷰를 받아요.

| 항목             | 장점                                             |
| ---------------- | ------------------------------------------------ |
| **추적성**       | 어떤 데이터가 백필된 건지 정확히 알 수 있음      |
| **제어**         | 백필 데이터를 자동이 아닌 필요할 때만 처리       |
| **디버깅**       | 특정 데이터 소스로 문제를 격리 가능              |
| **라이프사이클** | 다른 보존 정책 적용 가능 (예: 처리 후 백필 삭제) |
| **감사**         | 백필 작업을 별도로 추적 가능                     |
| **안전성**       | 백필이 일일 파이프라인을 실수로 망가뜨릴 수 없음 |

## 실전 가이드

**경로를 분리하면 좋은 경우:**

- 데이터가 다른 소스에서 오는 경우 (자동화 vs 수동)
- 소스별로 처리 로직이 다를 수 있는 경우
- 명확한 데이터 계보 추적이 필요한 경우
- 실수로 재처리되는 걸 방지하고 싶은 경우
- 다른 보존/라이프사이클 정책이 필요한 경우

**단일 경로를 유지해도 되는 경우:**

- 모든 데이터가 같은 자동화 파이프라인에서 같은 형식으로 오는 경우 -- 분리는
  불필요한 prefix 관리 오버헤드만 추가해요.
- 정기와 백필 데이터가 구분 없이 완전히 같은 ETL을 거치는 경우 -- 별도
  경로는 한 번 대신 두 번 실행한다는 뜻이에요.
- 데이터 출처를 추적할 필요가 없는 경우 (예: 일회성 분석) -- 복잡성이
  정당화되지 않아요.
- 백필이 지속적으로 발생하고 크기가 작은 경우 -- metadata 태깅을 대신
  고려하세요.

경로 분리까지는 필요 없지만 추적은 하고 싶다면, S3 object tag가 더 가벼운
대안이에요:

```python
s3_client.put_object(
    Bucket=bucket,
    Key=key,
    Body=data,
    Tagging="source=backfill&manual=true"  # 경로 분리 대신 태그 사용
)
```

트레이드오프: 태그는 읽으려면 추가 API 호출이 필요하지만, 데이터를 한 곳에
모아둘 수 있어요.
