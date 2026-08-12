---
title: 'gcloud Logging `--freshness=N`은 "지금 기준 N시간 전"이지 "그 사건 이후"가 아니에요'
description: >-
  `--freshness`는 명령을 실행한 순간부터 거꾸로 시간을 재요. 확인하려는 사건이 기준이 아니에요. 하루 뒤에 돌린 배포 후 검증
  gate 조회는 정작 봐야 할 구간의 앞부분을 조용히 건너뛸 수 있어요. `timestamp>=` / `timestamp<=`로 양끝을 못박는
  게 해법이에요.
date: 2026-05-13T00:00:00.000Z
updated: '2026-08-12'
tags:
  - devops
  - gcp
  - observability
  - transferable
category: devops
draft: false
lang: ko
source_lang: en
source_slug: gcloud-logging-freshness-flag-semantics
source_updated: '2026-08-12'
translation_date: '2026-08-12'
references:
  - url: 'https://cloud.google.com/sdk/gcloud/reference/logging/read'
    title: gcloud logging read — official reference
    type: official
  - url: 'https://cloud.google.com/sdk/gcloud/reference/topic/datetimes'
    title: gcloud topic datetimes — date/time and duration input formats
    type: official
  - url: 'https://cloud.google.com/logging/docs/view/logging-query-language'
    title: Logging query language — timestamp comparisons
    type: official
  - url: 'https://www.rfc-editor.org/rfc/rfc3339'
    title: 'RFC 3339 — Date and Time on the Internet: Timestamps'
    type: official
  - url: 'https://docs.aws.amazon.com/cli/latest/reference/logs/filter-log-events.html'
    title: aws logs filter-log-events — AWS CLI reference
    type: official
  - url: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_logs/'
    title: kubectl logs — Kubernetes reference
    type: official
---

crucio라는 제 개인 프로젝트에 24시간짜리 로그 관찰 gate를 걸어뒀어요. MinIO `stat_object` 호출에 재시도 helper를 붙여 배포하고, 하루 동안 운영 로그를 지켜본 다음에야 고쳐졌다고 인정하기로 한 거예요. 하루 뒤에 gate를 닫으러 와서는 `gcloud logging read`에 `--freshness=48h`를 붙였어요. 48이면 확인해야 할 24시간보다 넉넉하겠거니 했거든요.

결과는 깨끗했어요. 그런데 실제로 훑은 구간은 gate가 열린 시점보다 6시간 *뒤*에서 시작하고 있었어요.

출력 어디에도 그런 얘기는 없어요. 적어둘 만하다고 생각한 게 이 지점이에요. 엉뚱한 구간을 뒤진 로그 조회는, 맞는 구간을 뒤졌는데 아무것도 안 나온 경우와 겉보기에 똑같거든요.

gate 조회는 대체로 이런 모양이에요. 고친 코드가 남기는 anchor 문자열을 찾고, service 하나로 범위를 좁히고, freshness 구간으로 시간을 묶어요.

```bash
gcloud logging read 'resource.labels.service_name=foo AND
  jsonPayload.message=~"my-anchor"' \
  --limit 500 --freshness=24h
```

저는 마지막 flag를 "gate가 열린 24시간 전부터의 로그"라고 읽었어요. 그런 뜻이 아니에요.

## `--freshness`가 실제로 재는 값

`gcloud logging read` 공식 문서는 이 flag를 두 문장으로 설명해요. "Return entries that are not older than this value. Works only with DESC ordering and filters without a timestamp."

"이 값보다 오래되지 않은" 것, 그게 전부예요. 값은 `30m`이나 `24h` 같은 기간이고, gcloud는 명령이 실행된 그 순간에서 이만큼을 빼요. 기간 표기법은 `gcloud topic datetimes`에서 오는데, 그냥 `24h`라고 쓰면 자기 기준점이 없는 절대 기간이에요. 어느 사건에 구간을 매달지 알려주는 인자는 아예 없어요. 항상 지금에 매달려 있어서, 같은 명령을 다시 돌릴 때마다 구간이 앞으로 밀려요.

같은 문서에서 문제를 더 키우는 사실이 두 가지 나와요. 기본값이 `1d`라서, freshness flag 없이 `gcloud logging read 'some filter'`만 치면 전체 기간이 아니라 조용히 최근 하루에 대해 답하고 있는 거예요. 그리고 이 flag는 filter 자체에 timestamp가 없을 때만 먹혀요. 이 조건이 둘 사이의 관계를 바꿔놓는데, 아래에서 다시 볼게요.

## 계산을 직접 써보기

배포 시점을 `T0`라고 하면 gate는 `T0`부터 `T0+24h`까지 돌아요. 조합별로 실제 어디를 훑는지 적어보면 이래요.

| 실행 시점 | Flag              | 훑은 구간           | 결과                                     |
| --------- | ----------------- | ------------------- | ---------------------------------------- |
| `T0+30h`  | `--freshness=24h` | `T0+6h` → `T0+30h`  | gate 앞 6시간을 놓쳐요                   |
| `T0+30h`  | `--freshness=48h` | `T0-18h` → `T0+30h` | gate는 덮지만 배포 전 로그가 18시간 섞여요 |
| `T0+54h`  | `--freshness=48h` | `T0+6h` → `T0+54h`  | 또 앞 6시간을 놓쳐요                     |
| 아무 때나 | 절대 구간         | `T0` → `T0+24h`     | 언제 돌려도 같은 구간                    |

혼자 이걸 정리할 때는 두 실패를 "구간이 너무 좁다"는 한 항목으로 묶어놨었어요. 표를 그려보고 나서야 그게 틀렸다는 걸 알았어요. 증상이 다른 별개의 실패예요.

너무 늦게 시작하는 구간은 정작 중요한 시간대를 한 번도 보지 않은 채로 깨끗한 결과를 돌려줘요. 이쪽이 위험해요. 제가 보고 싶었던 게 딱 그 깨끗함이니까요. 너무 이르게 시작하는 구간은 시끄럽긴 해도 무해하지도 않아요. 고치기 전에 났던 오류가, 고쳐졌다는 걸 보여주려고 만든 조회 안에 섞여 들어오거든요. 그 결과를 정직하게 읽으면 "판단 불가"인데, 그 순간에는 "아직 안 고쳐졌네"로 읽혀요.

어느 쪽이든 구간이 엉뚱한 사건에 묶여 있는 거예요. 기간을 늘리는 걸로는 기준점 문제가 안 풀려요. 어느 쪽 끝이 새는지만 바뀌어요.

## 양끝을 사건에 못박기

지나간 일을 확인하는 용도라면, 요즘 쓰는 방식은 양쪽 경계를 filter 안에 직접 넣는 거예요.

```bash
gcloud logging read 'resource.labels.service_name=foo AND
  jsonPayload.message=~"my-anchor" AND
  timestamp>="2026-05-10T08:00:00Z" AND
  timestamp<="2026-05-11T10:00:00Z"' \
  --limit 500 \
  --format='value(timestamp,severity,jsonPayload.message)'
```

여기 쓰인 시각은 RFC 3339예요. ISO 8601을 인터넷용으로 다듬은 규격이고, `Z`가 UTC를 뜻해요. Logging query language 문서도 timestamp를 RFC 3339나 ISO 8601 형식의 문자열로 설명하면서 똑같은 `timestamp >= "..."` 비교를 보여줘요. 그래서 양쪽 경계를 `AND`로 이어 filter 문자열 안에 넣을 수 있어요.

제가 정작 원했던 성질은 이 조회가 시간이 지나도 같은 답을 낸다는 거예요. 내일 돌리든 다음 주에 돌리든 반년 뒤에 돌리든 같은 구간이 나와요. 구간을 시계가 아니라 사건으로 적어뒀으니까요.

`--freshness`와 어떻게 맞물리는지는 짚고 갈 만해요. 문서가 이 flag는 timestamp 없는 filter에서만 동작한다고 못을 박으니까요. 둘은 겹쳐 쌓는 층이 아니라 서로를 대신하는 선택지예요. filter에 timestamp 조건이 들어가는 순간 `--freshness`는 그림에서 빠져요. 둘을 같이 줬을 때 gcloud가 오류를 내는지 조용히 무시하는지는 확인해보지 않았어요. 그래서 아예 같이 안 쓰기로 했어요.

## 출력을 줄여서 받기

`--format='value(timestamp,severity,jsonPayload.message)'` 부분은 장식이 아니에요. 기본 출력은 항목 하나하나를 resource label, insert ID, trace 같은 큼직한 봉투로 감싸요. gate 판단을 할 때 제가 보는 건 세 칸이고, 하는 일은 패턴이 있나 훑는 게 전부예요. 500개를 터미널에서 눈으로 넘길 만하게 만들어주는 게 이 간결한 표 형태 출력이에요. 안 그러면 파일로 뽑아두고 결국 포기하게 돼요.

## 늦게 도착하는 로그를 위한 여유

구간의 끝은 gate가 끝나는 시각에 딱 맞추지 않고 조금 뒤로 넘겨 닫아요. 수집이 즉시 일어나지 않으니까요. 제가 돌려본 경우들에서는 사건이 난 뒤 수십 초 만에 들어온 항목도 있었어요. 1~2분 여유는 드는 비용이 없고, 마지막 한 줄이 위쪽 경계 바로 바깥으로 떨어지는 상황을 막아줘요.

그 숫자를 뒷받침할 만한 공식 수집 지연 보장은 찾지 못했어요. 그래서 측정값이라기보다 값싼 보험 정도로 보는 게 맞아요. Cloud Logging 앞단에 버퍼가 있는 구조라면 필요한 여유는 제 경우보다 클 거예요.

## 구간을 좁혀도 답할 수 없는 질문

기준점을 고치면 조회는 믿을 만해져요. 그렇다고 빈 결과에 의미가 생기지는 않아요. 제일 알려두고 싶은 함정이 이거예요.

일치하는 항목이 0개라는 건 최소 두 가지로 읽혀요. 버그가 고쳐져서 오류가 안 났거나, 그 구간에 요청이 없어서 해당 코드 경로가 아예 실행되지 않았거나요. 기준점을 제대로 잡은 조회는 세 번째 해석, 그러니까 항목은 있었는데 검색 범위 밖이었다는 가능성을 지워줘요. 그건 분명히 값어치가 있어요. 다만 앞의 두 가지는 그대로 남아요.

도움이 되는 습관은, 오류가 없다는 사실만으로 결론을 내리기 전에 같은 구간에서 그 경로의 평소 요청량을 한 번 확인해보는 거예요. 경로에 활동이 아예 없었다면 gate는 아직 아무것도 관찰하지 못한 거고, 깨끗한 결과는 시시한 의미로 비어 있는 셈이에요. 이 확인은 비용이 거의 없고, 덕분에 다행이었던 적이 여러 번 있어요.

## `date`와 씨름하지 않고 구간 만들기

셸에서 경계 값을 만들 때 호환성이 발목을 잡아요. `date -u '+%Y-%m-%dT%H:%M:%SZ'`는 macOS와 Linux에서 똑같이 동작하는데, `date -d '24 hours ago'`는 아니에요. macOS에 딸려 오는 BSD `date`는 `-d`를 GNU처럼 날짜 문자열을 읽는 옵션이 아니라 서머타임 flag로 해석해요. Linux runner에서는 되는데 노트북에서는 안 되는 gate 스크립트는, 하필 답이 급할 때 붙잡고 있기 짜증나는 물건이에요.

Python `datetime`을 쓰면 이 차이를 비켜갈 수 있어요.

```bash
START=$(python3 -c "from datetime import datetime, timezone, timedelta;
print(datetime(2026, 5, 10, 8, 0, tzinfo=timezone.utc).isoformat().replace('+00:00','Z'))")
END=$(python3 -c "from datetime import datetime, timezone;
print(datetime(2026, 5, 11, 10, 0, tzinfo=timezone.utc).isoformat().replace('+00:00','Z'))")

gcloud logging read "resource.labels.service_name=crucio-api AND
  jsonPayload.message=~\"#154 mitigation\" AND
  timestamp>=\"$START\" AND
  timestamp<=\"$END\"" \
  --limit 500 \
  --format='value(timestamp,severity,jsonPayload.message)'
```

`.replace('+00:00','Z')`가 붙은 이유는 `isoformat()`이 offset 형태로 뱉는데 filter 문자열에서는 `Z` 형태가 더 읽기 좋아서예요. 둘 다 RFC 3339로 유효해요. filter를 큰따옴표로 감싼 것도 눈여겨봐 주세요. 셸이 `$START`와 `$END`를 펼치게 하려고 바꾼 거라, 대신 안쪽 정규식의 따옴표를 escape해야 해요.

## 다른 로그 CLI에도 같은 구조가 있어요

이건 gcloud만의 별난 점이라기보다 대부분의 로그 CLI가 공유하는 기본값이에요. "최근 N분"이 흔한 경우니까요.

| 도구                          | 상대 시간(지금 기준) | 절대 시간(사건 기준)                                  |
| ----------------------------- | -------------------- | ----------------------------------------------------- |
| `gcloud logging read`         | `--freshness=24h`    | filter 안의 `timestamp>="..."` / `timestamp<="..."`   |
| `aws logs filter-log-events`  | 없음                 | `--start-time` / `--end-time`, epoch 밀리초           |
| `kubectl logs`                | `--since=1h`         | `--since-time=2024-08-30T06:00:00Z`                   |

AWS CLI 문서는 `--start-time`을 1970년 1월 1일 UTC 이후의 밀리초로 표현한 범위 시작점이라고 정의해요. 구조상 절대 시간이에요. 벽시계 시각을 epoch 밀리초로 바꾸는 게 유일한 번거로움이고요. `kubectl logs`는 두 형태를 다 제공하는데, `--since`와 `--since-time`의 차이가 지금까지 얘기한 차이 그대로예요.

## 상대 시간이 맞는 경우

과장하고 싶지는 않아요. 상대 구간은 원래 만들어진 용도에서는 맞는 기본값이고, 저도 `--freshness=5m`은 수시로 써요.

장애를 실시간으로 보고 있을 때는 정말로 "지금 무슨 일이 일어나고 있나"가 질문이에요. 여기에 고정된 시각을 박아두면 몇 분마다 명령을 고쳐야 해요. 배포 직후 확인도 마찬가지예요. 처음 몇 분 안에는 "지금에서 조금 전까지"와 "배포 이후"가 사실상 같은 구간이라 구분이 의미가 없어요.

차이가 중요해지는 건 답이 과거에 대한 판단이 되는 순간부터예요. 검증 gate를 닫거나, 몇 주 지난 장애 시간대를 다시 들여다보거나, 수정이 배포된 뒤로 그 로그 한 줄이 한 번이라도 찍혔는지 확인하는 경우요. 이런 조회는 다시 돌아가고, 그때 자리에 없었던 사람이 돌리는 일도 많아요. 상대 구간이면 돌릴 때마다 조금씩 다른 질문에 답하게 돼요.

## 남겨둘 것

결론은 짧아요. 질문이 특정 과거 구간에 대한 것이면 그 구간을 filter에 적어요. 지금에 대한 질문이면 그때 상대 구간을 쓰면 돼요.

flag 자체보다 이 실패 방식을 따로 새겨두는 편이 나아요. 도구가 바뀌어도 그대로 남거든요. 엉뚱한 사건에 묶인 조회는 요란하게 실패하지 않아요. 아무도 하지 않은 질문에 그럴듯한 답을 돌려줘요. 문법 오류보다 잡아내기 어려운 종류고, 제가 찾은 유일한 방어는 큰 숫자를 넣으면 더 넓게 덮이겠거니 믿는 대신 위 표처럼 구간 계산을 한 번 직접 써보는 거예요.

## 참고 자료

- [gcloud logging read — official reference](https://cloud.google.com/sdk/gcloud/reference/logging/read)
- [gcloud topic datetimes — date/time and duration input formats](https://cloud.google.com/sdk/gcloud/reference/topic/datetimes)
- [Logging query language — timestamp comparisons](https://cloud.google.com/logging/docs/view/logging-query-language)
- [RFC 3339 — Date and Time on the Internet: Timestamps](https://www.rfc-editor.org/rfc/rfc3339)
- [aws logs filter-log-events — AWS CLI reference](https://docs.aws.amazon.com/cli/latest/reference/logs/filter-log-events.html)
- [kubectl logs — Kubernetes reference](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_logs/)
