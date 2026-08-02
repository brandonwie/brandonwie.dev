---
title: 조기 종료 시 Backfill 통계 매니페스트
description: >-
  조기 종료 경로가 있는 작업에서는 그 경로에서도 status 매니페스트를 써야 해요. 안 그러면 다운스트림 알림이 보여줄 게 없어요.
date: 2026-01-27T00:00:00.000Z
updated: '2026-08-02'
tags:
  - backend
  - etl
  - slack
category: backend
draft: false
lang: ko
source_lang: en
source_slug: backfill-stats-manifest-early-exit
source_updated: '2026-08-02'
translation_date: '2026-05-10'
references:
  - url: >-
      https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/logging-monitoring/callbacks.html
    title: Callbacks — Airflow Documentation
    type: official
  - url: https://healthchecks.io/docs/
    title: Healthchecks.io Documentation
    type: official
---

예전에 다뤘던 스케줄 복구 작업은 알림 쪽과 단순한 약속을 하나 맺고 있었어요.
실행이 끝나면 작은 JSON stats 파일을 object storage에 쓰고, 작업이 끝난 뒤
콜백이 그 파일을 읽어서 Slack 메시지로 만들어 주는 구조였죠.

어느 날 알림이 빈 `0` 값으로만 가득 차서 왔어요. 작업 자체는 멀쩡히 success로
끝났고, 로그에도 누락된 시간이 없다고 분명히 찍혀 있었어요. 할 일은 제대로
했는데 아무한테도 말을 안 한 셈이었어요.

## 문제

이 작업에는 복구할 게 없을 때를 위한 깔끔한 조기 종료 경로가 있었어요. 그런데
매니페스트를 쓰는 코드는 실제로 데이터를 처리하는 경로 아래쪽에만 있었어요.

```python
def run(start, end):
    gaps = find_gaps(start, end)

    if not gaps:
        log.info("no gaps in range")
        return Result(status="success", processed=0)  # ← 조기 종료

    # ... gap 처리 ...

    save_run_stats(stats)  # ← 조기 종료 시 도달하지 않음
```

콜백은 그래도 실행돼요. success callback은 원래 그러라고 있는 거니까요. 예를
들어 Airflow 문서는 `on_success_callback`을 task가 성공했을 때 호출되는
콜백으로 설명하고, 콜백은 task가 끝난 뒤에 실행된다고 명시해요. 그래서 콜백은
애초에 쓰인 적 없는 매니페스트를 찾으러 갔다가, 맥락 없는 `0`으로 폴백한
거예요.

## 수정

모든 종료 경로에서 매니페스트를 쓰면 돼요. 심심한 경로도 포함해서요.

```python
def run(start, end):
    gaps = find_gaps(start, end)

    if not gaps:
        log.info("no gaps in range")
        save_run_stats({
            "schema": 1,
            "window_start": start,
            "window_end": end,
            "gaps_found": 0,
            "hours_recovered": 0,
            "still_missing": {},
            "finished_at": now_utc(),
            "message": "no gaps found in range",
        })
        return Result(status="success", processed=0)

    # ... gap 처리 ...
```

이제 알림에 `0`이 줄줄이 찍히는 대신 "1월 20-26일 범위에 gap 없음"이 나와요.
JSON 몇백 바이트 쓰는 비용은, 그게 없애 주는 혼란에 비하면 거의 0이에요.

## 매니페스트에 뭘 담을까

빠진 write를 채우는 건 쉬운 절반이에요. 진짜 가치는 그 파일이 무슨 말을 하게
할지 정하는 쪽에 있고, 제 기준으로는 세 가지가 자리값을 해요.

- **실행의 신원** — 어떤 window를 확인했는지, 언제 끝났는지, 그리고 schema
  버전. 버전이 있어야 나중에 consumer가 포맷을 바꿀 때 누가 쓴 파일인지
  추측하지 않아도 돼요.
- **0까지 명시적으로 적은 count.** 키가 없는 것과 값이 0인 것은 다른 사실인데,
  `.get(key, 0)`으로 읽는 consumer는 그 차이를 조용히 지워 버려요.
- **사람이 읽을 문장 하나.** 콜백이 카운터만 보고 문장을 조립하게 두지 않는 게
  좋아요. 숫자가 왜 그 모양인지 아는 쪽은 생산자니까요.

## "할 일 없음"과 "아예 안 돎"은 달라요

여기가 신경 쓸 만한 지점이에요. 조기 종료 경로가 매니페스트를 쓰기 시작하면,
0으로 채워진 매니페스트는 진짜 주장을 하나 하게 돼요. 이 window를 확인했고,
이미 다 채워져 있었다는 주장이요. 그리고 매니페스트가 없다는 건 이제 다른, 더
나쁜 뜻이 돼요. 작업이 아예 안 돌았거나, 보고하기 전에 죽었다는 뜻이죠.

이 구분은 consumer가 존재 여부가 아니라 신선도를 볼 때만 유지돼요. 지난주
매니페스트도 파싱은 멀쩡히 되거든요. 끝난 시각과 대상 window를 파일에 박아
두는 게, 읽는 쪽이 오래된 파일을 거부할 수 있게 해 주는 장치예요.

그렇다 해도 "돌긴 돌았나"는 매니페스트가 답할 질문은 아니에요. 시작조차 못 한
작업은 아무것도 안 쓰니까요. 그건 별도의 heartbeat 체크 몫이에요.
Healthchecks.io 같은 dead man's switch 서비스가 딱 이 모양을 위해 있어요. ping이
제때 오는 동안은 조용히 있다가, 하나라도 안 오면 바로 알림을 올려요.

## 재실행해도 안전하게 쓰기

실행이 여러 번 겹칠 수 있게 되면 매니페스트를 믿을 만하게 유지하는 습관이 두 개
필요해요.

하나는 대상 window로 키를 결정론적으로 잡는 거예요. `stats/{start}_{end}.json`
같은 식이면 재실행이 자기 기록을 덮어쓰지, 반쪽짜리 기록 두 개를 나란히 남기지
않아요.

다른 하나는 진행 중에 조금씩 쓰지 말고, 해당 경로 끝에서 한 번에 쓰는 거예요.
반만 쓰인 매니페스트는 없는 것보다 나빠요. consumer가 그걸 믿어 버리거든요.
파일시스템이면 temp 경로에 쓰고 rename 하는 방식이고, object storage면 put 한
번이 통째로 공개돼요.

## 더 넓은 원칙

이건 ETL을 넘어서도 통해요. 어떤 작업이든 조기 종료가 있으면, 그 출력의
다운스트림 소비자 — 콜백, 대시보드, alert rule, 그 채널을 읽는 사람 — 는 무슨
일이 있었는지 알아야 해요. "할 일 없음"도 의미 있는 정보예요. 시스템이 들여다
봤고 다 정상이었다는 확인이고, 그건 침묵과 전혀 다른 거예요.

success callback이 붙은 작업, 일 없이 일찍 끝날 수 있는 작업, validation이나
skip 로직이 있는 ETL 단계, 일이 있든 없든 타이머로 도는 스케줄 작업 —
어디서든 같은 모양으로 나타나요.

## 정리

종료 경로가 여러 개인 작업에서는 모든 경로에 상태를 남기세요. "할 일 없음"
경로도요. 어떤 window를 언제 확인했는지 적어 두면 읽는 쪽이 신선한 no-op과
오래된 파일을 구분할 수 있고, "돌긴 돌았나"는 매니페스트의 부재가 아니라
heartbeat에 맡기면 돼요. happy path만 덮는 관측성은, 정작 무슨 일이 있었는지
확인하고 싶은 순간에 조용해지는 관측성이에요.

## References

- [Callbacks — Airflow Documentation](https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/logging-monitoring/callbacks.html)
- [Healthchecks.io Documentation](https://healthchecks.io/docs/)
