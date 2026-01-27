---
title: 'Amplitude Export API 응답 포맷'
description: >-
  Amplitude Export API는 중첩 압축 형식으로 데이터를 반환합니다. 파일명은 .json.gz지만 실제로는 ZIP 안에 GZIP이 들어있어서 헷갈리기 쉽습니다.
date: 2026-01-27T00:00:00.000Z
updated: '2026-01-28'
tags:
  - backend
  - amplitude
  - api
  - data-format
category: backend
draft: false
lang: ko
source_lang: en
source_slug: amplitude-export-api-format
source_updated: 2026-01-27T00:00:00.000Z
translation_date: '2026-01-28'
references:
  - url: 'https://www.docs.developers.amplitude.com/analytics/apis/export-api/'
    title: Amplitude Export API 공식 문서
    type: official
---

# Amplitude Export API 응답 포맷

Amplitude Export API는 **중첩 압축 형식**으로 데이터를 반환하는데, 이게 좀 헷갈리기 쉽습니다.

## 헷갈리는 파일 확장자

파일명이 `*.json.gz`인데, 단순한 gzip 파일이 아닙니다:

```text
{PROJECT_ID}_{DATE}_{HOUR}#0.json.gz
└── 실제로는 ZIP 파일 (magic: PK / 0x504B)
    └── 내부 파일: {PROJECT_ID}/{PROJECT_ID}_{DATE}_{HOUR}#0.json.gz
        └── 이 내부 파일이 진짜 gzip (magic: 0x1F8B)
            └── 내용: 줄바꿈으로 구분된 JSON 이벤트들
```

## 파일 Magic Bytes

| 포맷 | Magic Bytes | Hex |
| ---- | ----------- | --- |
| ZIP | `PK` | `0x504B` |
| GZIP | `\x1f\x8b` | `0x1F8B` |

## 읽는 방법

```python
import zipfile
import gzip
import json
import io

def read_amplitude_export(raw_data: bytes) -> list[dict]:
    # 외부 레이어: ZIP
    with zipfile.ZipFile(io.BytesIO(raw_data)) as zf:
        inner_file = zf.namelist()[0]

        # 내부 레이어: GZIP
        with zf.open(inner_file) as f:
            json_data = gzip.decompress(f.read()).decode()

    # 내용: 줄바꿈으로 구분된 JSON
    events = [json.loads(line) for line in json_data.strip().split('\n')]
    return events
```

## 이벤트 구조

각 줄은 다음과 같은 필드를 가진 JSON 객체입니다:

```json
{
  "event_type": "session_end",
  "event_time": "2026-01-26 04:23:35.379000",
  "user_id": "user@example.com",
  "device_id": "6fd6899d-2b08-40e3-b723-e4ca1f848a43",
  "platform": "Web",
  "country": "South Korea",
  "city": "Suwon",
  "event_properties": {},
  "user_properties": {
    "utm_source": "longblack"
  }
}
```

## API 엔드포인트

```bash
# Export API URL
https://amplitude.com/api/2/export?start={YYYYMMDD}T{HH}&end={YYYYMMDD}T{HH}

# 예시: 2026-01-26 10시 데이터 가져오기
curl -u "API_KEY:SECRET_KEY" \
  "https://amplitude.com/api/2/export?start=20260126T10&end=20260126T11"
```

## 에러 코드

| 코드 | 의미 | 대응 방법 |
| ---- | ---- | --------- |
| 200 | 성공 | 데이터 처리 |
| 400 | 데이터가 4GB 초과 | 건너뛰기 (더 짧은 시간 범위 사용) |
| 404 | 데이터 없음 | 조용한 시간대에는 정상 |
| 429 | 요청 제한 | 지수 백오프로 재시도 |
| 504 | 서버 타임아웃 | 로그 남기고 건너뛰기 |

## 참고 자료

- [Amplitude Export API 공식 문서](https://www.docs.developers.amplitude.com/analytics/apis/export-api/)
