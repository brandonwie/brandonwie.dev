---
title: Amplitude Export API의 타임존 처리 방식
description: Amplitude Export API가 이벤트 데이터 내보내기에서 타임존과 시간 경계를 처리하는 방식
date: 2026-01-27T00:00:00.000Z
updated: '2026-07-13'
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
source_updated: '2026-07-13'
translation_date: '2026-07-13'
references:
  - url: 'https://amplitude.com/docs/apis/analytics/export'
    title: export
    type: verified
  - url: 'https://amplitude.com/docs/admin/account-management/manage-orgs-projects'
    title: Amplitude Manage Organizations and Projects (Timezone Settings)
    type: official
---

Amplitude ETL 파이프라인이 엉뚱한 날짜의 데이터를 가져오는 거 아니냐를 두고 팀이랑 오후 내내 논쟁했어요. 파이프라인은 01:00 KST에 돌았고 사용자는 한국에 있었는데, 누군가 합리적으로 물었어요. "KST 기준 시간을 가져와야 하는 거 아니에요?" 그럴듯한 질문이었어요. 그런데 답은 API 문서가 아니라 Amplitude 프로젝트 설정에 숨어 있었어요.

## 혼란의 원인

ETL 파이프라인은 매일 01:00 KST(16:00 UTC)에 Amplitude 이벤트 데이터를 가져왔어요. 사용자가 한국에 있으니 export도 KST 기준 시간을 가져와야 하지 않느냐는 게 팀의 물음이었어요. 타임존 가정이 틀렸다면 엉뚱한 24시간 구간을 가져와서 데이터가 빠지거나 중복될 위험이 있었어요.

Amplitude Export API 문서는 `start`/`end` 파라미터의 타임존 동작을 바로 알기 어렵게 되어 있어요. 그 틈 때문에 그동안 줄곧 잘못된 데이터를 당겨온 건 아닌지 팀 전체가 논의하게 됐어요.

## 생각보다 까다로웠던 이유

네 가지가 조사를 더디게 만들었어요.

**문서가 모호해요.** Amplitude 문서는 `start`/`end` 파라미터가 프로젝트 타임존을 따르는지 항상 UTC인지 명시하지 않아요. 내보낸 이벤트의 `server_upload_time` 접미사를 확인해서 직접 검증할 수밖에 없었어요.

**팀 논의에서 KST와 UTC가 뒤섞였어요.** 팀원들은 "영업일"이 KST 기준 하루라고 여겼지만, 프로젝트는 UTC로 설정돼 있었어요. 그걸 확인하려면 Amplitude Console 설정까지 들어가 봐야 했어요.

**가정에 불과한 KST 시나리오가 추론을 복잡하게 만들었어요.** 프로젝트가 KST로 설정돼 있다면 어떻게 되는지(두 개의 UTC 날짜에 걸쳐 가져와야 함)까지 짚어봐야, 지금의 UTC 설정이 더 단순하고 맞다는 걸 팀에 납득시킬 수 있었어요.

**타임존을 바꿔 시험할 환경이 없었어요.** Amplitude 프로젝트 타임존을 KST로 안전하게 바꿔서 동작을 볼 방법이 없었어요. 그래서 검증은 전부 기존 데이터 패턴을 읽어내는 방식이었어요.

## 정답은 프로젝트 타임존에 달려 있어요

질문은 이거였어요. "ETL이 01:00 KST(16:00 UTC)에 돌면서 전날 데이터를 가져오는데, 사용자가 한국에 있으니 KST 기준 시간을 가져와야 하지 않나요?"

답은 아니에요. 우리 Amplitude 프로젝트는 KST가 아니라 UTC 타임존을 썼어요. Export API는 `start`/`end` 파라미터를 언제나 UTC로 해석해요. 프로젝트 타임존 설정은 Amplitude가 대시보드에 데이터를 어떻게 보여줄지를 정할 뿐, API가 대신 변환해 주지는 않아요.

제가 확인한 내용이에요:

| 설정                            | 값                            | 영향                                         |
| ------------------------------- | ----------------------------- | -------------------------------------------- |
| **Amplitude 프로젝트 타임존**   | UTC                           | 모든 시간 경계가 UTC 기준                    |
| **Export API `start` 파라미터** | UTC 시간                      | `start=20260126T00` = UTC 0시 (KST 0시 아님) |
| **이벤트 타임스탬프**           | UTC                           | `server_upload_time` 필드에 `.000Z` 접미사   |
| **DAG 실행 시간**               | 16:00 UTC = 다음 날 01:00 KST | 전날 UTC 날짜를 처리                         |
| **가져오는 시간 범위**          | 0-23 UTC                      | UTC 기준 완전한 하루                         |

## Export API 요청이 동작하는 방식

요청 형식은 간단해요:

```text
start=YYYYMMDDTHH
end=YYYYMMDDTHH
```

타임존은 프로젝트 타임존 설정과 상관없이 항상 UTC예요.

양쪽 경계가 모두 포함(inclusive)이라는 점은 놓치기 쉬워요. `start`와 `end`가 각각 포함되는 시간을 가리키기 때문에, `start=20260126T00&end=20260126T01`은 0시 하나가 아니라 0시와 1시, 두 시간치를 돌려줘요. 딱 한 시간만 가져오려면 `start`와 `end`를 같은 값으로 두면 돼요. `start=20260126T00&end=20260126T00`처럼요.

우리 production fetcher 두 개(`packages/etl/jobs/amplitude/amplitude_common.py:94-95`와 `amplitude_backfill.py:112-113`)가 모두 이 double-fetch 결함을 안고 있었어요. 한 시간만 가져오려던 자리에서 매번 조용히 두 시간을 당겨오고 있었죠.

타임존은 프로젝트 설정과 무관하게 그대로 적용돼요. 프로젝트가 KST로 설정돼 있다고 쳐도, UTC 0시를 가리키는 요청은 여전히 UTC 0시를 가져와요. KST와 UTC 사이의 9시간 오프셋 탓에 원하는 것과 다른 데이터를 받게 되는 거예요.

## 전체 ETL 파이프라인 따라가기

전체 타임라인을 보면 논리가 딱 맞아떨어져요.

```text
DAG: amplitude_etl_dag
Schedule: 0 16 * * * (16:00 UTC = 다음 날 01:00 KST)
Processes: {{ yesterday_ds }} (UTC 날짜)
```

구체적인 예시예요:

| 시간 (UTC)       | 시간 (KST)       | 동작                                              |
| ---------------- | ---------------- | ------------------------------------------------- |
| 2026-01-26 00:00 | 2026-01-26 09:00 | 이벤트 발생 시작                                  |
| 2026-01-26 15:00 | 2026-01-27 00:00 | 이벤트 계속 (KST 자정 지남)                       |
| 2026-01-27 16:00 | 2026-01-28 01:00 | **DAG 실행**, 2026-01-26 UTC (24시간 전체) 가져옴 |

UTC 날짜 2026-01-26에 대해 0시부터 23시까지 가져와요:

```text
실행 날짜: 2026-01-26 (UTC)
가져오는 시간: 0-23 (UTC)

Hour 0:  2026-01-26 00:00-00:59 UTC = 2026-01-26 09:00-09:59 KST
Hour 1:  2026-01-26 01:00-01:59 UTC = 2026-01-26 10:00-10:59 KST
...
Hour 23: 2026-01-26 23:00-23:59 UTC = 2026-01-27 08:00-08:59 KST
```

결과는 UTC 기준 하루 전체, 24시간치 이벤트예요. KST로는 두 날짜에 걸쳐 있지만 UTC로는 완전한 영업일 하루에 해당해요. 빠지는 데이터도, 중복되는 데이터도 없어요.

## 직접 설정 확인하기

이걸 프로젝트에 믿고 적용하기 전에, Amplitude 프로젝트가 어떤 타임존을 쓰는지부터 확인하세요.

### Amplitude Console에서

1. Amplitude에 로그인
2. **Settings > Projects > [프로젝트] > General**로 이동
3. **"Timezone"** 설정 찾기
4. **"UTC"**로 표시되는지 확인(Asia/Seoul 같은 로컬 타임존이 아니라)

### API 응답에서

내보낸 이벤트의 `server_upload_time` 필드를 확인하세요:

```json
{
  "server_upload_time": "2026-01-26T00:00:00.000Z",
  ...
}
```

`.000Z` 접미사가 UTC 타임존임을 확인해줘요.

## 흔한 오해들

**"Export API는 프로젝트 타임존을 사용한다."** 아니에요. `start`/`end` 파라미터는 프로젝트 타임존 설정과 상관없이 항상 UTC예요.

**"시간을 KST로 변환해야 한다."** 프로젝트 타임존이 UTC라면 변환이 필요 없어요. UTC 0-23시를 가져오면 하루가 채워져요.

**"영업일은 KST 기준 하루다."** 프로젝트 타임존이 UTC일 때 영업일은 UTC 기준 하루예요. KST는 Amplitude 대시보드의 표시 설정일 뿐, API 계약이 아니에요.

**"예전 export 구간을 다시 돌리면 늦게 들어온 이벤트를 되찾는다."** 그렇지 않아요. export 구간은 `server_upload_time` 기준으로 걸러내는데, 늦게 업로드된 이벤트는 그만큼 늦은 upload time을 갖게 돼서 원래 구간이 아니라 이후 구간에 잡혀요. 원래 구간을 다시 가져오는 건 빠졌거나 일부만 전달된 export 전달(delivery)을 메우는 것뿐이지, 늦게 올라온 client 업로드까지 끌어오지는 못해요. 그래서 reconciliation을 다시 봐야 해요. 재실행은 전달 복구로만 여기고, 늦은 업로드는 앞단 ingestion 경로에서 처리하는 거예요. 늦게 들어온 이벤트는 더 오래된 `event_time` 파티션에 떨어지기 때문에, 다운스트림 집계는 재처리하는 그날 하루만이 아니라 영향받은 모든 파티션으로 퍼져나가야 해요.

## 프로젝트가 KST였다면

Amplitude 프로젝트가 KST 타임존으로 설정돼 있었다면 계산이 복잡해져요:

| UTC 시간               | KST 시간               | 가져올 내용   |
| ---------------------- | ---------------------- | ------------- |
| 2026-01-25 15:00-23:59 | 2026-01-26 00:00-08:59 | 전날, 15-23시 |
| 2026-01-26 00:00-14:59 | 2026-01-26 09:00-23:59 | 당일, 0-14시  |

KST 기준 영업일 하루를 맞추려면 두 개의 UTC 날짜에서 가져와야 해요. UTC로 설정된 우리 프로젝트는 이걸 통째로 피해가요. UTC 하루가 곧 영업일 하루, 깔끔한 1:1 매핑이에요.

## 코드: 타임존 변환이 필요 없어요

프로젝트가 UTC라서 fetch 코드가 깔끔하게 유지돼요:

```python
# amplitude_backfill.py
def fetch_hour_from_amplitude(date: str, hour: int, ...):
    # date: "2026-01-26" (UTC)
    # hour: 0-23 (UTC)

    date_compact = date.replace("-", "")  # "20260126"
    start_param = f"{date_compact}T{hour:02d}"  # "20260126T00"
    # 양쪽 경계가 포함이라, 한 시간만 가져오려면 end가 start와 같아야 해요.
    # 원래의 `(hour + 1) % 24`는 두 시간을 가져오는 조용한 double-fetch였어요.
    end_param = f"{date_compact}T{hour:02d}"  # "20260126T00"

    # 타임존 변환 불필요 - 파라미터가 그대로 UTC
    url = f"{AMPLITUDE_EXPORT_API_URL}?start={start_param}&end={end_param}"
```

검증 로직도 그만큼 간단해요:

```python
# amplitude_validate.py
def validate_data_completeness(execution_date: str, ...):
    # execution_date: "2026-01-26" (UTC)
    # 24시간(0-23 UTC) 기대

    expected_hours = set(range(24))
    # 간단한 체크 - 타임존 계산 불필요
```

변환 함수도, 오프셋 계산도, 월 경계 예외 처리도 없어요. UTC 프로젝트 타임존 덕분에 코드가 단순하게 유지돼요.

## 실무에서의 한계

fetch를 언제, 얼마나 크게 돌릴지는 몇 가지 운영 제약이 좌우해요.

내보낸 데이터는 한 시간이 닫히는 순간 바로 조회되지 않아요. 대략 두 시간쯤 지나야 쓸 수 있어요. 그 지연을 감안해서 스케줄을 잡지 않으면, 너무 이른 실행은 덜 찬 시간대를 가져와요.

요청에는 크기 상한이 있어요. 4GB를 넘으면 400이 떨어지고, 긴 시간 범위는 504로 타임아웃 날 수 있어요. 해법은 시간 단위로 쪼개는 건데, 그보다 잘게 나눌 방법은 없어요. 그래서 한 시간짜리인데도 용량이 넘치면 API에서는 더 나눌 수가 없어요. 이런 경우는 Amplitude의 S3나 수동 backfill 경로로 돌려야 해요.

Rate limit은 export 문서 페이지에 나와 있지 않아요. API 위에 재시도가 많은 reconciliation을 얹기 전에, 여유가 있으리라 넘겨짚지 말고 Amplitude 지원팀에 한계를 확인하세요.

## 정리

Export API의 타임존 동작은 문서에 또렷이 적혀 있지 않지만, 어디를 봐야 하는지만 알면 답은 예측 가능해요. Amplitude 프로젝트 타임존부터 확인하세요. 그게 전부를 좌우해요. 프로젝트가 UTC라면 어떤 UTC 날짜든 0-23시를 변환 없이 가져오면 돼요. KST 같은 로컬 타임존이라면 날짜를 넘나드는 fetch 로직이 필요한데, 이쪽이 더 불안정하고 디버깅하기 어려워요.

이건 Amplitude의 배치 Export API에만 해당해요. Mixpanel이나 GA4 같은 다른 분석 플랫폼은 저마다 타임존을 다르게 처리해요. Amplitude라도 실시간 API나 Cohort API를 쓴다면 타임스탬프 처리가 Export API와 다를 수 있어요.

기억에 남은 교훈이 있어요. 팀이 "로컬 시간으로 변환해야 하지 않나요?"라고 물을 때, 답은 보통 "소스 시스템이 어떤 타임존으로 설정돼 있죠?"에서 출발한다는 거예요.

## 참고 자료

- **Amplitude Export API 문서:** <https://amplitude.com/docs/apis/analytics/export>
- **Amplitude 타임존 설정:** Amplitude Console > Settings > Projects > General
- **구현:** `arch-etl/jobs/amplitude/amplitude_backfill.py`
- **ETL DAG:** `arch-airflow/dags/amplitude_etl_dag.py`
