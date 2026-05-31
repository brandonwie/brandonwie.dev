---
title: Ruff 3중 게이트 프리플라이트
description: >-
  한 번의 push가 CI 사이클 세 번으로 늘어나면서 깨달은 사실 — CI에서 Ruff는 독립적인 게이트 세 개예요. 4줄짜리 셸 함수면 이
  루프를 막을 수 있어요.
date: 2026-04-29T00:00:00.000Z
updated: '2026-04-29'
tags:
  - devops
  - python
  - ci-cd
  - ruff
  - pre-flight
category: devops
draft: false
lang: ko
source_lang: en
source_slug: ruff-three-gate-preflight
source_updated: 2026-04-29T00:00:00.000Z
translation_date: '2026-05-10'
---

> CI에서 Ruff는 보통 검사 세 개를 따로 돌려요. `ruff check`(린트), `ruff format --check`(포매터 드라이런), 그리고 lockfile/의존성 무결성 검사예요.
> 게이트마다 따로 실패할 수 있어요. 로컬에서 `ruff check`만 통과해도 포맷 실패는 그대로 빠져나가서, 놓친 게이트마다 CI 사이클 한 번씩 더 쓰게 돼요.

PR #134에 처음 push했더니 CI가 `ruff check`에서 빨갛게 떴어요. `I001` import 정렬 위반이었어요. 쉬운 수정이라 다시 push. 두 번째 사이클에서는 `ruff check`는 초록인데 같은 파일이 `ruff format --check`에 걸렸어요. 포맷을 고치고 다시 push. 세 번째 사이클에는 또 포맷이 빨갛게 떴는데, 이번엔 이 PR에서 건드린 적도 없는 `ml/` 디렉토리였어요. CI를 세 번 돌리고서야 알았어요. CI에서 "ruff"는 사실 게이트 세 개고, 로컬 프리플라이트도 그 셋을 다 비춰야 한다는 걸요.

## 게이트 세 개

흔한 Ruff CI 설정은 비슷해 보이지만 따로 게이팅하는 단계 세 개를 돌려요.

| 단계        | 명령어                                          | 잡아내는 것                                                      |
| ----------- | ----------------------------------------------- | --------------------------------------------------------------- |
| Lint        | `ruff check {paths}`                            | I001 import 정렬, F401 사용 안 한 import, B-rules 등             |
| Format      | `ruff format --check {paths}`                   | 공백, 줄 길이, 인자 리스트 줄바꿈                                |
| Lock-check  | `uv lock --check` (또는 pip-tools/poetry 동등물)| `pyproject.toml`과 lockfile 어긋남                               |

로컬에서 `ruff check`를 돌려서 "All checks passed!"가 뜨면 CI도 초록일 것 같아요. 사실은 아니에요. 포맷 검사는 별도 명령어고, lockfile 검사는 다른 도구예요. CI는 셋을 다 돌리는데, 로컬 한 번 패스는 그중 하나만 건드린 거예요.

## 실패 사이클이 펼쳐지는 방식

놓친 게이트마다 CI 사이클이 하나씩 들어가요.

1. 커밋 push. CI가 `ruff check` 돌림. 빨강. → 수정.
2. 수정 push. CI가 `ruff check`(이제 초록)와 `ruff format --check`를 돌림. 포맷 빨강. → 수정.
3. 수정 push. CI가 셋 다 돌림. lock-check가 빨강이거나, 건드린 적 없는 다른 디렉토리에서 포맷이 빨강. → 수정.

사이클마다 CI 시간(minutes)과 실제 시간이 빠져요. 쿼터가 빡빡한 러너에서는 실패 사이클 세 번이면 다른 배포가 큐에서 막힐 만큼의 분량을 태울 수 있어요.

## 프리플라이트 패턴

push 직전에 로컬에서 **세 게이트를 모두** 돌려요.

```bash
# 디렉토리별 프리플라이트 (CI 스위트가 건드리는 Python 트리마다 실행)
ruff check {dir}                 # Gate 1: lint
ruff format --check {dir}        # Gate 2: format dry-run

# 레포 전체 프리플라이트 (suite=all로 잡히는 게이트들)
ruff check . --quiet
ruff format --check .
```

게이트 중 빨강이 있으면 고치고 다시 돌려요. 모든 게이트가 초록일 때만 push해요.

레포 전체 패스가 중요한 이유가 있어요. CI `suite=all`은 보통 레포 전체로 검사 범위를 잡는데, 로컬 직관은 "방금 편집한 파일들"로 좁혀져 있거든요. 관련 없는 디렉토리에서의 어긋남 — 예를 들면 Markdown 린터가 수정과 CI 사이에 `.agents/rules/*.md`를 자동으로 다시 줄바꿈하는 경우 — 은 `git diff`가 깨끗해 보여도 CI에서 실패해요.

## 재사용 가능한 프리플라이트 스크립트

디렉토리들을 순회하는 셸 함수예요.

```bash
ruff_preflight() {
  local dirs=("$@")
  if [[ ${#dirs[@]} -eq 0 ]]; then
    dirs=(".")
  fi
  for d in "${dirs[@]}"; do
    echo "=== $d: lint ==="
    ruff check "$d" || return 1
    echo "=== $d: format ==="
    ruff format --check "$d" || return 1
  done
  echo "All ruff gates green."
}

# 사용법
ruff_preflight apps/api ml
```

`Makefile` 타겟으로 두는 방법도 있어요.

```text
.PHONY: preflight
preflight:
	ruff check .
	ruff format --check .
	@echo "preflight ok"
```

어느 형태든 로컬에서 몇 초 안에 돌아요. CI 사이클 한 번보다 훨씬 싸요.

## 핵심 포인트

- **Ruff의 세 게이트는 직교해요.** Lint와 format은 서로 다른 diff 셋을 만들어요. Lint는 사용 안 한 import를 잡고, format은 줄바꿈을 잡아요. 겹치지 않으니까 한쪽 통과가 다른 쪽 통과를 의미하지 않아요.
- **자동 수정 플래그가 달라요.** Lint는 `ruff check --fix`(그리고 `--unsafe-fixes`). Format은 `ruff format`(`--fix` 플래그 없음 — 포매터 자체가 수정이에요). 헷갈리면 시간 낭비예요.
- **CI 범위 ≠ git diff 범위.** `apps/api/`만 건드린 리베이스가 `ml/`에서 포맷 실패를 일으킬 수 있어요. 스위트 전체 포맷 검사는 어떤 파일을 바꿨는지 신경 안 써요. 그래서 레포 전체로 프리플라이트해요.
- **Lockfile 게이트는 format이 통과하기 전엔 숨어 있어요.** 대부분의 CI 설정에서 Lint 실패가 format을 막고, format이 lock-check를 막아요(순차 잡 의존성). 앞 게이트들이 통과해야 lockfile 실패가 보여요.
- **Format은 협상 불가.** Ruff의 포매터는 의견이 강하고 안정적이에요. 로컬에서 손으로 포매팅하면 `ruff format`과 어긋나요. 저장할 때마다 포매터를 돌리는 에디터 통합을 깔고 거기 맞춰가는 게 편해요.

## 각 게이트의 자동 수정이 실제로 하는 것

미묘한 점 하나. `ruff check --fix`는 `ruff format`을 트리거하지 **않아요**. 별도 명령어예요. `--fix` 돌리고 format이 따라오겠거니 가정하는 게 가장 흔한 3-사이클 루프 버전이에요. 수정 플래그 표예요.

| 게이트 | 수정 명령어            | 영향 범위                                  |
| ------ | ---------------------- | ------------------------------------------ |
| Lint   | `ruff check --fix`     | 자동 수정 가능한 lint 위반만               |
| Lint   | `--unsafe-fixes`       | Ruff가 동작 보존을 확신하지 못하는 규칙 추가 |
| Format | `ruff format`          | 공백, 줄바꿈, 따옴표 스타일                |

`--unsafe-fixes`는 Ruff가 동작 보존을 확신하지 못하는 규칙들의 수정까지 적용해요. 직접 쓴 코드라면 unsafe fixes도 보통 괜찮아요. 외부에서 들여온 third-party 파일이라면 unsafe fixes를 받기 전에 diff를 한 번 보는 게 안전해요.

## main이 미리 깨져 있을 때 겹치는 문제

`main`이 이미 Ruff 게이트에서 빨갛게 떠 있으면, 브랜치 diff가 깨끗해도 CI 시점에 하드 블록이 걸려요. 게이트는 작업 delta가 아니라 레포 전체 상태에 대해 돌거든요. 두 가지 길이 있어요.

- **같은 PR 안에서 처리.** 명시적인 scope-creep 커밋(`fix(ml): ruff format pre-existing files`)으로 미리 깨진 부분을 PR 안에서 같이 고쳐요. 어디까지가 본 작업이고 어디까지가 청소인지 리뷰어가 구분할 수 있어요.
- **별도 hotfix.** 청소 작업을 작은 독립 PR로 먼저 머지하고, 그 후에 피처 브랜치를 리베이스해요.

PR 크기와 리뷰 긴급도에 따라 고르면 돼요. 절대 안 되는 선택지는 "게이트 스킵"이에요. `pyproject.toml`에서 Ruff를 비활성화하면 안전망 자체가 사라지고, 그 디렉토리는 어긋남이 누적되는 자리가 돼요.

## 언제 쓰면 좋을까

- Python 변경이 있는 PR에 push할 때마다.
- `main`에 리베이스한 직후. (CI 범위는 전체 레포, 작업 diff는 부분.)
- 프로젝트에서 처음으로 CI 출력에 "ruff"가 보일 때.

## 안 써도 되는 경우

- 순수 문서나 Python 외 변경 — 게이트가 발동 안 해요.
- 단일 파일에서 핫 디버깅 루프 안에 있을 때 — 매 저장마다 레포 전체 프리플라이트는 과해요. 에디터 통합에 맡겨요.

## 안티패턴

| 안티패턴                                                   | 왜 잘못인가                                                       |
| ---------------------------------------------------------- | ----------------------------------------------------------------- |
| `ruff check --fix && git push`                             | format 게이트 스킵; CI 사이클 한 번 낭비                          |
| 변경된 파일만 ruff 돌리기                                  | 스위트 전체 검사 놓침; 리베이스가 관련 없는 디렉토리에 어긋남 발생 |
| `ruff`와 `ruff format`을 한 명령으로 취급                  | 직교함 — 다른 diff 셋, 다른 플래그                                |
| 실패하는 pre-commit을 `--no-verify`로 우회                 | 로컬에서 게이트 숨김; CI가 잡음; 피드백 루프 길어짐                |
| `pyproject.toml`에서 `ruff` 비활성화로 "실패 스킵"         | 안전망 비활성화; 파일이 어긋남 누적 자리가 됨                      |

## 정리

CI가 Ruff를 돌린다면, 프리플라이트도 Ruff의 모든 게이트를 돌려야 해요 — 오류 메시지가 기억나는 하나만이 아니라요. 3줄짜리 셸 함수가 3-사이클 루프를 막아줘요. 비용은 push당 몇 초, 절약은 CI 시간과 빨간 빌드를 기다리는 컨텍스트 스위치 비용이에요.
