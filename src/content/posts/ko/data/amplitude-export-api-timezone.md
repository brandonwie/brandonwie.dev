---
title: Amplitude Export API의 타임존 처리 방식
description: Amplitude Export API가 이벤트 데이터 내보내기에서 타임존과 시간 경계를 처리하는 방식
date: 2026-01-27T00:00:00.000Z
updated: 2026-01-27T00:00:00.000Z
tags:
  - data
  - amplitude
  - timezone
  - api
category: data
draft: false
lang: ko
source_lang: en
source_slug: amplitude-export-api-timezone
source_updated: "2026-01-27"
translation_date: "2026-02-12"
references:
  - url: "https://amplitude.com/docs/apis/analytics/export"
    title: export
    type: verified
  - url: "https://amplitude.com/docs/admin/account-management/manage-orgs-projects"
    title: Amplitude Manage Organizations and Projects (Timezone Settings)
    type: official
---

ETL 파이프라인이 매일 KST 01:00에 Amplitude 이벤트 데이터를 가져오고 있었어요. 팀원이 "사용자가 한국에 있으니까 KST 기준으로 시간을 가져와야 하는 거 아닌가요?"라고 물었고, 합리적인 질문이었어요. 답을 잘못 내리면 하루치 이벤트를 통째로 놓치거나 중복으로 가져오는 상황이 발생할 수 있었죠.

## 왜 중요한가

데이터 파이프라인에서 타임존 불일치는 조용한 살인자예요. 파이프라인이 돌아가고, 데이터가 웨어하우스에 적재되고, 모든 게 정상처럼 보여요. 하지만 분석가가 "영업일" 기준 이벤트 수가 9시간만큼 어긋나 있다는 걸 발견할 때까지 말이에요. 누군가 발견할 즈음에는 이미 몇 주치 리포트가 틀어져 있을 수 있어요.

Amplitude Export API 문서는 `start`와 `end` 파라미터가 타임존을 어떻게 처리하는지 바로 알기 어렵게 되어 있어요. 내보낸 이벤트의 `server_upload_time` 접미사를 확인해서 직접 검증해야 했어요.

## 혼란의 원인

팀의 멘탈 모델은 이랬어요: "사용자가 한국에 있으니까 '영업일'은 KST 기준 하루를 의미한다." 하지만 Amplitude 프로젝트는 KST가 아닌 **UTC**로 설정되어 있었어요. 이 차이가 며칠간의 논쟁으로 이어졌어요.

제가 확인한 핵심 사실들이에요:

| 설정                            | 값                            | 영향                                         |
| ------------------------------- | ----------------------------- | -------------------------------------------- |
| **Amplitude 프로젝트 타임존**   | UTC                           | 모든 시간 경계가 UTC 기준                    |
| **Export API `start` 파라미터** | UTC 시간                      | `start=20260126T00` = UTC 0시 (KST 0시 아님) |
| **이벤트 타임스탬프**           | UTC                           | `server_upload_time` 필드에 `.000Z` 접미사   |
| **DAG 실행 시간**               | 16:00 UTC = 다음 날 01:00 KST | 전날 UTC 날짜를 처리                         |
| **가져오는 시간 범위**          | 0-23 UTC                      | UTC 기준 완전한 하루                         |

## 어려웠던 점들

네 가지가 필요 이상으로 일을 어렵게 만들었어요.

**문서의 모호함.** Amplitude 문서는 `start`/`end` 파라미터가 프로젝트 타임존을 따르는지 항상 UTC인지 명시하지 않아요. 내보낸 이벤트의 `server_upload_time` 접미사를 확인해서 직접 검증해야 했어요.

**팀 내 KST vs UTC 혼란.** 팀원들은 "영업일"이 KST 기준 하루라고 가정했지만, 프로젝트는 UTC로 설정되어 있었어요. Amplitude Console 설정을 확인해서야 확인할 수 있었어요.

**가정적 KST 시나리오가 추론을 복잡하게 만듦.** 프로젝트가 KST로 설정되어 있다면 어떤 일이 벌어지는지(두 개의 UTC 날짜에 걸쳐 fetch 해야 함) 설명해야 현재 UTC 설정이 더 단순하고 맞다는 걸 납득시킬 수 있었어요.

**타임존 변경을 위한 테스트 환경 부재.** Amplitude 프로젝트 타임존을 KST로 바꿔서 동작을 테스트할 수가 없었어요. 모든 검증은 기존 데이터 패턴을 읽는 방식으로 했어요.

## Export API의 실제 동작 방식

요청 형식은 간단해요:

```text
start=YYYYMMDDTHH
end=YYYYMMDDTHH
```

타임존은 프로젝트 타임존 설정에 관계없이 **항상 UTC**예요.

DAG가 16:00 UTC에 실행되어 `start=20260126T00&end=20260126T01`을 요청하면, UTC 2026-01-26 00:00:00부터 00:59:59까지의 이벤트를 가져와요. 프로젝트가 KST로 설정되어 있어도 같은 요청은 여전히 UTC 0시를 가져오게 되어, 대시보드 숫자가 이상해질 때까지 아무도 알아차리지 못할 9시간 오프셋이 발생해요.

## ETL 파이프라인 흐름

일일 스케줄은 이렇게 동작해요:

```text
DAG: amplitude_etl_dag
Schedule: 0 16 * * * (16:00 UTC = 다음 날 01:00 KST)
Processes: {{ yesterday_ds }} (UTC 날짜)
```

실제로 어떤 일이 일어나는지 타임라인으로 보면:

| 시간 (UTC)       | 시간 (KST)       | 동작                                              |
| ---------------- | ---------------- | ------------------------------------------------- |
| 2026-01-26 00:00 | 2026-01-26 09:00 | 이벤트 발생 시작                                  |
| 2026-01-26 15:00 | 2026-01-27 00:00 | 이벤트 계속 (KST 자정 지남)                       |
| 2026-01-27 16:00 | 2026-01-28 01:00 | **DAG 실행**, 2026-01-26 UTC (24시간 전체) 가져옴 |

실제로 가져오는 내용:

```text
실행 날짜: 2026-01-26 (UTC)
가져오는 시간: 0-23 (UTC)

Hour 0:  2026-01-26 00:00-00:59 UTC = 2026-01-26 09:00-09:59 KST
Hour 1:  2026-01-26 01:00-01:59 UTC = 2026-01-26 10:00-10:59 KST
...
Hour 23: 2026-01-26 23:00-23:59 UTC = 2026-01-27 08:00-08:59 KST
```

UTC 기준 하루를 전부 커버해요. 24시간의 이벤트가 KST로는 2일에 걸쳐 있지만, UTC 기준으로는 완전한 하루에 해당해요.

## 검증: 프로젝트 타임존 확인하기

이 모든 것을 신뢰하기 전에, 먼저 프로젝트 설정을 직접 확인하세요.

**Amplitude Console**에서:

1. Amplitude에 로그인
2. **Settings -> Projects -> [프로젝트] -> General** 이동
3. **"Timezone"** 설정 확인
4. **"UTC"**(Asia/Seoul이 아님)로 표시되는지 확인

**Export API 응답**에서 `server_upload_time` 필드를 확인하는 방법도 있어요:

```json
{
  "server_upload_time": "2026-01-26T00:00:00.000Z",
  ...
}
```

`.000Z` 접미사가 UTC 타임존임을 확인해줘요.

## 흔한 오해들

**"Export API는 프로젝트 타임존을 사용한다."** 그렇지 않아요. `start`/`end` 파라미터는 프로젝트 타임존 설정에 관계없이 항상 UTC예요.

**"시간을 KST로 변환해야 한다."** 프로젝트 타임존이 UTC라면 변환이 필요 없어요. UTC 0-23시를 가져오면 돼요.

**"영업일 = KST 기준 하루."** 프로젝트 타임존이 UTC일 때 영업일은 UTC 기준 하루예요. KST는 단지 표시 설정일 뿐이에요.

## 프로젝트가 KST였다면

Amplitude 프로젝트가 KST 타임존으로 설정되어 있다면 계산이 복잡해져요:

| UTC 시간               | KST 시간               | 가져올 내용   |
| ---------------------- | ---------------------- | ------------- |
| 2026-01-25 15:00-23:59 | 2026-01-26 00:00-08:59 | 전날, 15-23시 |
| 2026-01-26 00:00-14:59 | 2026-01-26 09:00-23:59 | 당일, 0-14시  |

KST 기준 하루를 얻으려면 **두 개의 UTC 날짜**에서 가져와야 해요. 우리 프로젝트는 UTC이기 때문에 단순한 1:1 매핑이에요 -- UTC 하루가 곧 영업일 하루예요.

## 코드에 미치는 영향

프로젝트가 UTC이기 때문에 fetch 코드에 타임존 변환이 필요 없어요:

```python
# amplitude_backfill.py
def fetch_hour_from_amplitude(date: str, hour: int, ...):
    # date: "2026-01-26" (UTC)
    # hour: 0-23 (UTC)

    date_compact = date.replace("-", "")  # "20260126"
    start_param = f"{date_compact}T{hour:02d}"  # "20260126T00"
    end_param = f"{date_compact}T{(hour + 1) % 24:02d}"  # "20260126T01"

    # 타임존 변환 불필요 - 파라미터가 이미 UTC
    url = f"{AMPLITUDE_EXPORT_API_URL}?start={start_param}&end={end_param}"
```

검증 로직도 마찬가지로 간단해요:

```python
# amplitude_validate.py
def validate_data_completeness(execution_date: str, ...):
    # execution_date: "2026-01-26" (UTC)
    # 24시간(0-23 UTC) 기대

    expected_hours = set(range(24))
    # 간단한 체크 - 타임존 계산 불필요
```

## 이 방식이 동작하는 이유

전체 파이프라인이 단순하게 유지되는 이유는 모든 것을 UTC에 맞추기 때문이에요. Amplitude 프로젝트가 UTC이고, Export API 파라미터가 UTC이고, Airflow 스케줄이 UTC 시간에 실행돼요. 변환 레이어도 없고, 날짜를 넘나드는 fetch 로직도 없고, 타임존 관련 off-by-one 버그가 발생할 여지도 없어요.

## 실무 팁

Amplitude에서 데이터를 내보내는 ETL 파이프라인을 구축하거나 디버깅할 때, 또는 기존 export 코드의 타임존 로직에 의문을 가지는 신규 팀원을 온보딩할 때 이 접근법을 사용하세요.

이 동작이 다른 분석 플랫폼에도 적용된다고 가정하면 안 돼요. Mixpanel, GA4 등은 각각 타임존을 다르게 처리해요. 또한 Amplitude 프로젝트가 로컬 타임존(예: KST)으로 설정되어 있다면, "변환 불필요"라는 결론이 적용되지 않아요. 위의 KST 섹션에서 설명한 대로 날짜를 넘나드는 fetch가 필요해요.

이 지식은 배치 Export API에만 해당해요. Amplitude의 실시간 API나 Cohort API는 타임스탬프를 다르게 처리할 수 있어요.
