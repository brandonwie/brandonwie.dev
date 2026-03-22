---
title: uv.lock 모범 사례
description: uv.lock을 버전 관리에 커밋해야 하는지에 대한 가이드
date: 2026-01-28T00:00:00.000Z
updated: 2026-02-02T00:00:00.000Z
tags:
  - devops
  - python
  - uv
category: devops
draft: false
lang: ko
source_lang: en
source_slug: uv-lock-best-practice
source_updated: '2026-03-22'
translation_date: '2026-02-12'
references:
  - url: 'https://docs.astral.sh/uv/concepts/projects/sync/'
    title: sync
    type: official
  - url: 'https://github.com/astral-sh/uv/issues/9797'
    title: '9797'
    type: official
---

새 프로젝트에 uv를 설정하자마자 팀에서 토론이 벌어졌어요. `uv.lock`을 커밋해야
할까, `.gitignore`에 추가해야 할까? 한 개발자는 `.venv`처럼 무시해야 한다고
했고, 다른 개발자는 `package-lock.json`처럼 커밋해야 한다고 했어요. 공식 문서를
확인하기 전까지 30분을 논쟁에 썼죠.

답은 명확해요: 커밋하세요.

## 왜 중요한가

lockfile 결정을 잘못하면 실제 결과가 따라와요. `uv.lock`을 gitignore하면 CI의
모든 `uv sync`가 의존성을 새로 해결해요. 몇 주간은 빌드가 통과하다가, 간접
의존성이 breaking change를 릴리스하면 레포에 코드 변경 없이 CI가 실패해요.
원인을 모르는 팬텀 이슈를 디버깅하게 되죠.

커밋하더라도 팀이 이유를 이해하지 못하면, 개발자들이 불필요하게 lockfile을
재생성하면서 노이즈 가득한 diff를 만들고, 리뷰어들은 lockfile이 그저 쓸모없는
것이라고 생각하게 돼요.

혼란은 생태계마다 관례가 다르기 때문에 증폭돼요. Node.js에서 `node_modules`는
무시하지만 `package-lock.json`은 커밋하죠. Python에서 `.venv`는 무시해요.
`uv.lock`은 어디에 해당할까요?

## 겪었던 어려움

**.venv 비유가 오해를 불러왔어요.** Python에 익숙한 개발자들이 `uv.lock`을
`.venv/`(gitignore하는)와 동일시하는 경향이 있어요. 그래서 반사적으로
`uv.lock`을 `.gitignore`에 추가하게 되는데, 이건 잘못된 거예요.

**초기 lockfile diff가 위압적이었어요.** 간접 의존성이 많은 프로젝트의 첫
`uv.lock`은 수백 줄이 될 수 있어요. lockfile을 추가하는 PR이 커 보여서
lockfile을 처음 보는 리뷰어들의 반발을 일으켰어요.

**CI 발산이 조용했어요.** 커밋된 lockfile 없이 CI는 매 실행마다 의존성을 새로
해결해요. 이게 잘 되다가 어느 날 갑자기 안 되는 거예요. 간접 의존성이 몇 달 뒤
깨지는데, 비난할 코드 변경이 없어요.

**라이브러리 vs 애플리케이션 혼동이 노이즈를 더했어요.** 라이브러리의 경우
lockfile 커밋은 진짜 논란의 여지가 있어요. 이것 때문에 팀이 애플리케이션에서도
논란이 있다고 생각하게 되는데, 애플리케이션에서는 논란의 여지가 없어요.

## 검토한 옵션

| 옵션                    | 장점                                         | 단점                                                   |
| ----------------------- | -------------------------------------------- | ------------------------------------------------------ |
| **`uv.lock` 커밋**      | 재현 가능한 빌드, drift 감지, 감사 추적      | 의존성 업데이트 시 큰 diff, 가끔 merge conflict        |
| **`uv.lock` gitignore** | 깔끔한 diff, lock에 대한 merge conflict 없음 | 재현 불가능한 빌드, 조용한 의존성 drift, CI 서프라이즈 |

merge conflict 우려는 실제보다 나쁘게 들려요. 두 개발자가 다른 브랜치에서
의존성을 업데이트하면 lockfile이 충돌해요. 하지만 해결 방법은 항상 같아요:
`uv lock`을 다시 실행하고 결과를 커밋하면 돼요. 몇 초면 끝나요.

## 규칙: 커밋하세요

[uv 공식 문서](https://docs.astral.sh/uv/concepts/projects/sync/)가 명시적으로
말하고 있어요:

> "The lockfile should be checked into version control, allowing for consistent
> and reproducible installations across machines."
>
> "lockfile은 버전 관리에 체크인되어야 하며, 머신 간 일관되고 재현 가능한
> 설치를 가능하게 합니다."

이건 권장 사항이 아니에요. 의도된 워크플로우예요.

## 커밋해야 하는 이유

| 이점             | 설명                                                     |
| ---------------- | -------------------------------------------------------- |
| **재현성**       | 모든 머신에서 동일한 의존성 버전                         |
| **CI/CD 안전성** | lockfile이 pyproject.toml과 맞지 않으면 `uv sync`가 에러 |
| **Drift 감지**   | 의도하지 않은 의존성 변경을 포착                         |
| **감사 추적**    | Git 이력이 의존성 변경 시점을 보여줌                     |

CI/CD 안전성 포인트가 특히 가치 있어요. lockfile이 커밋되면, 누군가
`pyproject.toml`에 의존성을 추가하고 `uv lock`을 실행하지 않았을 때
`uv sync`가 에러를 내요. 프로덕션이 아닌 PR 단계에서 실수를 잡을 수 있어요.

## 논란의 여지가 있는 경우

| 프로젝트 타입    | 권장 사항                                |
| ---------------- | ---------------------------------------- |
| **애플리케이션** | 항상 커밋                                |
| **라이브러리**   | 논란 있음 -- 소비자가 자체 lockfile 생성 |

애플리케이션(API, CLI, ETL 파이프라인, Airflow DAG)에서는 토론의 여지가
없어요. lockfile을 커밋하세요.

라이브러리의 경우는 상황이 달라요. 라이브러리의 소비자가 자체 lockfile을
생성하므로, 라이브러리의 lockfile을 커밋해도 다운스트림 빌드에 영향을
주지 않아요. 일부 라이브러리 저자는 재현 가능한 개발 환경을 위해 여전히
커밋하지만, 이건 모범 사례라기보다 팀 선호도예요.

## 흔한 오해

가장 흔한 실수는 `uv.lock`이 `node_modules`나 `.venv`와 같다고 생각하는
거예요. 아니에요. 그것들은 실제 설치된 패키지를 담고 있는 생성된 아티팩트예요.
`uv.lock`은 `package-lock.json`이나 `poetry.lock`과 같아요. 설치할 정확한
버전을 기록하는 해결 매니페스트(resolution manifest)죠.

비유 테이블:

| 파일                | 타입            | 커밋?  |
| ------------------- | --------------- | ------ |
| `.venv/`            | 설치된 패키지   | 아니요 |
| `node_modules/`     | 설치된 패키지   | 아니요 |
| `uv.lock`           | 해결 매니페스트 | 예     |
| `package-lock.json` | 해결 매니페스트 | 예     |
| `poetry.lock`       | 해결 매니페스트 | 예     |

## 왜 이 방식이 효과적인가

lockfile을 커밋하면 의존성 워크플로우가 예측 가능해져요:

1. 개발자가 패키지 추가: `uv add pandas`
2. uv가 `pyproject.toml`과 `uv.lock` 모두 업데이트
3. PR이 새 의존성과 해결된 버전을 보여줌
4. 리뷰어가 정확히 무엇이 변경됐는지 검사 가능
5. CI가 정확히 같은 버전으로 `uv sync` 실행
6. 프로덕션이 정확히 같은 버전으로 배포

서프라이즈 없이. "어제는 됐는데" 디버깅 세션 없이.

## 실전 팁

모든 애플리케이션 프로젝트에서 **`uv.lock`을 커밋하세요.** 팀에게 이것이
`.venv`가 아니라 `package-lock.json`과 같다고 알려주세요. lockfile에 merge
conflict가 발생하면 `uv lock`을 실행하고 결과를 커밋하면 해결돼요.

**커밋을 건너뛰는 경우:** pip 설치 가능한 라이브러리(소비자가 자체 lock을
생성), 일회성 스크립트, uv를 사용하지 않는 프로젝트뿐이에요.

팀과 30분간 벌인 토론은 공식 문서의 한 문장을 읽었으면 피할 수 있었어요. 이제는
프로젝트 설정 체크리스트의 일부가 됐어요: 프로젝트 초기화, `uv lock` 실행,
`uv.lock` 커밋, 다음 단계로.

---

## 참고 자료

- [uv Locking and Syncing](https://docs.astral.sh/uv/concepts/projects/sync/)
- [GitHub Discussion](https://github.com/astral-sh/uv/issues/9797)
