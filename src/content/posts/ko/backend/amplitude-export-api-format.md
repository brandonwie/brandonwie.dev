---
title: Amplitude Export API 응답 형식
description: Amplitude Export API는 오해하기 쉬운 중첩 압축 형식으로 데이터를 반환해요
date: 2026-01-27T00:00:00.000Z
updated: '2026-08-02'
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
source_updated: '2026-08-02'
translation_date: '2026-02-12'
references:
  - url: 'https://www.docs.developers.amplitude.com/analytics/apis/export-api/'
    title: Amplitude Export API Documentation
    type: official
---

Amplitude export 파일에 `gzip.decompress()`를 호출했더니 알 수 없는
에러가 났어요. 파일 이름이 `*.json.gz`여서 당연히 gzip 압축된 JSON이라고
생각했는데, 아니었어요. 30분 디버깅 후에 첫 바이트를 hex-dump 해보니
`PK`가 나왔어요 -- GZIP이 아니라 ZIP 파일의 magic bytes였어요.

Amplitude Export API는 `.json.gz` 확장자를 가진 파일을 반환하는데, gzip
파일이 아니에요. 안에 gzip 파일을 포함하는 ZIP 아카이브예요. 이
이중 레이어 중첩은 문서에서 명확하지 않고, 오해를 유발하는 파일 확장자가
잘못된 디버깅 경로로 이끌어요.

## 오해를 유발하는 확장자

파일 이름은 `*.json.gz`이지만 실제 구조는 중첩되어 있어요:

```text
{PROJECT_ID}_{DATE}_{HOUR}#0.json.gz
└── Actually a ZIP file (magic: PK / 0x504B)
    └── Contains: {PROJECT_ID}/{PROJECT_ID}_{DATE}_{HOUR}#0.json.gz
        └── This inner file IS gzip (magic: 0x1F8B)
            └── Contains: Newline-delimited JSON events
```

바깥 레이어는 ZIP 아카이브예요. 그 ZIP 안에 gzip 압축된 파일이 있어요.
그 gzip 파일 안에 newline-delimited JSON이 있어요. 세 겹의 래핑인데,
파일 확장자는 중간 것만 설명해요.

## 형식 식별 방법

ZIP과 GZIP을 구분하는 확실한 방법은 파일 시작 부분의 magic bytes를
확인하는 거예요:

| 형식 | Magic Bytes | Hex      |
| ---- | ----------- | -------- |
| ZIP  | `PK`        | `0x504B` |
| GZIP | `\x1f\x8b`  | `0x1F8B` |

표준 gzip 도구와 Python의 `gzip.decompress()`는 ZIP 파일을 도움이 안 되는
에러 메시지와 함께 거부해요. Amplitude Export API 문서는 바깥 ZIP 래퍼를
명시하지 않고 "gzipped JSON"이라고만 언급해서 놓치기 쉬워요.

## Amplitude Export 파일 읽기

올바른 접근 방식은 이거예요 -- 바깥 레이어를 unzip하고, 안쪽 gzip을
decompress하고, newline-delimited JSON을 파싱해요:

```python
import zipfile
import gzip
import json
import io

def read_amplitude_export(raw_data: bytes) -> list[dict]:
    # Outer layer: ZIP
    with zipfile.ZipFile(io.BytesIO(raw_data)) as zf:
        inner_file = zf.namelist()[0]

        # Inner layer: GZIP
        with zf.open(inner_file) as f:
            json_data = gzip.decompress(f.read()).decode()

    # Content: Newline-delimited JSON
    events = [json.loads(line) for line in json_data.strip().split('\n')]
    return events
```

validation 고려사항도 있어요: 일부 hourly export는 빈 ZIP 파일이나 빈
namelist를 가진 파일을 반환해요. production 코드에서는 인덱싱 전에
`zf.namelist()`를 확인하고, extraction을 `BadZipFile` 에러에 대한
`try/except`로 감싸야 해요.

## 이벤트 구조

압축 해제된 출력의 각 줄은 하나의 이벤트를 나타내는 JSON 객체예요. 값은
placeholder로 채웠어요:

```json
{
  "event_type": "session_end",
  "event_time": "2026-01-26 04:23:35.379000",
  "user_id": "user@example.com",
  "device_id": "00000000-0000-4000-8000-000000000000",
  "platform": "Web",
  "country": "South Korea",
  "city": "Seoul",
  "event_properties": {},
  "user_properties": {
    "utm_source": "newsletter"
  }
}
```

`event_time` 필드는 사용자 기기에서 이벤트가 발생한 타임스탬프예요 --
파티셔닝에는 파일명의 날짜(Amplitude가 파일을 export한 시간)가 아니라
이걸 사용해야 해요.

## API 엔드포인트

```bash
# Export API URL
https://amplitude.com/api/2/export?start={YYYYMMDD}T{HH}&end={YYYYMMDD}T{HH}

# Example: Get hour 10 of 2026-01-26
curl -u "API_KEY:SECRET_KEY" \
  "https://amplitude.com/api/2/export?start=20260126T10&end=20260126T11"
```

API는 요청당 하나의 ZIP 파일을 반환해요. 각 요청은 시간 단위로 지정된
범위를 커버해요. 응답은 위에서 설명한 ZIP > GZIP > NDJSON 중첩 형식이에요.

## 에러 코드

| 코드 | 의미            | 조치                              |
| ---- | --------------- | --------------------------------- |
| 200  | 성공            | 데이터 처리                       |
| 400  | 데이터 > 4GB    | 건너뛰기 (더 작은 시간 범위 사용) |
| 404  | 데이터 없음     | 조용한 시간대에 정상              |
| 429  | Rate limit 초과 | exponential backoff로 재시도      |
| 504  | 서버 타임아웃   | 로그 남기고 건너뛰기              |

404는 에러가 아니에요 -- 해당 시간 동안 이벤트가 기록되지 않았다는
의미예요. 400은 응답이 4GB를 초과한다는 의미이므로, 시간 범위를 좁혀서
재시도하면 돼요.

## 이 지식을 사용할 때

이 형식은 Amplitude Export API 응답을 소비하는 모든 ETL이나 데이터
파이프라인을 구축할 때 적용돼요. Amplitude export 파일에서
`gzip.decompress()`가 실패하는 이유를 디버깅하거나, 저장 전 raw
Amplitude 데이터의 validation 로직(빈 ZIP 처리, `BadZipFile` 가드)을
작성할 때도 관련돼요.

## 적용되지 않는 경우

- **Amplitude Batch Event Upload API** -- upload API는 일반 JSON을
  받아요. 이 중첩 형식은 Export API 응답에만 적용돼요.
- **Amplitude SDK나 integration** -- Segment, mParticle, 또는
  Amplitude의 자체 warehouse sync를 사용한다면, 데이터는 해당
  integration의 형식으로 도착하지, 이 ZIP+GZIP 중첩이 아니에요.
- **다른 analytics 플랫폼** -- Mixpanel, Heap, PostHog 등은 각자의
  export 형식이 있어요. Amplitude의 중첩을 공유한다고 가정하면 안 돼요.

## 핵심 요약

`.json.gz` 확장자는 거짓말이에요. Amplitude export 파일은 gzip 파일을
포함하는 ZIP 아카이브이고, 그 gzip 안에 newline-delimited JSON이 있어요.
파일 확장자를 신뢰하는 대신 항상 magic bytes(`PK` = ZIP, `\x1f\x8b` =
GZIP)를 확인하세요. 두 레이어 모두 처리하는 extraction 파이프라인을
구축하고, 빈 파일이나 손상된 export에 대한 validation을 추가하세요.
