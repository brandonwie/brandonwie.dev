---
title: '충돌 없이 agent 병렬로 굴리기: Task, Worktree, Lock'
description: >-
  agent 병렬 작업은 보통 Git 문제처럼 보여요. 두 session이 같은 repo를 건드리는
  상황이죠.
date: 2026-06-15T00:00:00.000Z
updated: 2026-06-15T00:00:00.000Z
tags:
  - 3b
  - devops
  - architecture
category: devops
draft: false
lang: ko
source_lang: en
source_slug: parallel-agents-no-collisions
source_updated: 2026-06-15T00:00:00.000Z
translation_date: '2026-06-17'
references:
  - url: 'https://git-scm.com/docs/git-worktree'
    title: git-worktree documentation
    type: official
source_content_hash: bedab54b9abc1be02baaa311ca81c21010f975cc6a9a20451f47f68a845de635
---

두 session이 같은 repo를 건드려요. 하나가 먼저 들어가고, 나머지 하나는 conflict를
만나죠. 그러면 다들 "시작하기 전에 branch부터 확인하자"라는 교훈을 얻어요. agent를
병렬로 굴리면 보통 이런 Git 문제처럼 보여요.

그런데 이 조언은 진짜 실패 지점을 다루기엔 너무 작아요.

더 어려운 문제는 Git이 파일을 merge할 수 있느냐가 아니에요. 그건 Git이 잘해요. 진짜
어려운 건, agent session이 어떤 작업이 이미 누군가에게 할당됐는지, 어떤 파일이
handoff 상태인지, 자기가 어느 branch에 있어야 하는지, 다른 session이 같은 task
문서를 아직 쓰고 있는지를 모를 때가 많다는 거예요. 이런 상태 정보가 없으면 병렬
작업은 그냥 사회적 약속이 돼요. 다음 session이 그 약속을 까먹기 전까지만 굴러가죠.

3B의 답은 task 소유권을 파일과 게이트로 바꾸는 거예요.

## task 상태를 먼저 명시적으로 만들기

3B의 task는 "branch 만들고 코드부터 짜자"로 시작하지 않아요. `task-starter`를 거쳐서
시작해요.

이게 중요한 이유는 task의 첫 몇 분이 충돌이 자주 끼어드는 구간이기 때문이에요.
context 로딩을 건너뛰면 이미 끝난 task를 다시 열 수도 있어요. task 분류를 건너뛰면
버그를 재현하기도 전에, 또는 refactor의 회귀 baseline을 잡기도 전에 코드를 짤 수
있고요. branch 설정을 건너뛰면 자기 변경 사항을 다른 session의 추적되지 않은 파일과
섞어버릴 수도 있어요. handoff 문서를 건너뛰면 다음 agent가 어디서부터 이어가야 할지
알 수 없게 되죠.

설정 순서는 일부러 지루하게 짜여 있어요.

- 프로젝트 context와 최근 active 상태를 불러와요.
- task 종류를 분류해요.
- 종류별 게이트를 돌려요. fix라면 재현 먼저, 성능 작업이라면 baseline 캡처 같은 식으로요.
- 넓게 codebase를 읽기 전에 forced retrieval부터 해요.
- 이슈와 branch가 필요한지 결정해요.
- 정규 worktree를 만들어요.
- task의 `progress.md`와 `todos.md` 표면을 새로 쓰거나 그대로 보존해요.

중요한 건 정확한 단계 번호가 아니에요. 핵심은 구현이 명시적인 상태 전환의
하류(downstream)에 있다는 점이에요. 이제 task에는 폴더, 체크리스트, 진행 기록,
branch 결정, 그리고 어디서 다시 시작할지가 다 들어 있어요.

이게 바로 "agent가 어딘가에서 일하고 있다"와 "이 task는 여기서 소유되고 있다"의
차이예요.

## worktree는 편집을 격리하지만 소유자를 알려주진 않아요

3B가 Git worktree를 쓰는 이유는 간단한 기계적 문제를 풀기 때문이에요. 서로 다른 두
작업이 하나의 checkout을 공유하지 않아도 되거든요.

정규 헬퍼는 이런 경로 아래에 worktree를 만들어요.

```text
<repo>/.worktrees/<branch-folder>/
```

예를 들어 `docs/3b-architecture-blog-series-post-07`이라는 branch는
`.worktrees/docs-3b-architecture-blog-series-post-07`이라는 평평한 폴더가 돼요.

이 평평한 형태는 의도된 거예요. 예전 3B는 agent 이름을 넣은 형태,
대략 `.worktrees/<agent>/<branch>` 같은 걸 썼어요. 경로 자체가 Claude인지 Codex인지,
아니면 다른 runtime이 만든 checkout인지 말해주니까 쓸모 있어 보였죠. 그런데 그 추가
경로 조각이 충분한 가치를 못 줬어요. Git은 이미 branch당 worktree 하나를 강제하고,
agent 디렉터리 층이 필요할 만한 실제 공유 branch 시나리오도 나타나지 않았거든요.

그래서 ADR-035가 경로를 평평하게 만들었어요.

덕분에 탐색과 도구 사용이 단순해졌지만 편리했던 우연 하나가 사라졌어요. 소유권이
더 이상 경로에서 보이지 않게 된 거예요. 이제 worktree 경로는 checkout이 어디 있는지만
알려줘요. 누가 그 session을 소유하는지는 말해주지 않고요.

여기가 핵심 설계 전환점이에요. 3B는 파일 시스템 경로를 소유권 신호로 다루길 그만두고,
소유권을 명시적인 메타데이터로 옮겼어요.

## 소유권은 frontmatter로 옮겨갔어요

task session의 진짜 소유자는 `agent_origin`이에요.

이건 `progress.md`의 frontmatter와 lock manifest 안에 들어 있어요. task는 이렇게
말할 수 있어요.

```yaml
agent_origin: codex
worktree_path: .worktrees/docs-3b-architecture-blog-series-post-07
```

이 작은 필드 하나가 많은 일을 해요. 나중에 들어온 session이 "이 task는 같은 agent
레인이 소유한 거다"와 "이 task는 살아 있는 다른 session 거다"를 구분하게 해주거든요.
또 task가 메인 checkout에서 돌든, 평평한 worktree에서 돌든, 같은 계약을 쓰는 미래의
runtime에서 돌든 소유권이 똑같이 동작한다는 뜻이기도 해요.

이건 더 넓은 3B 패턴의 좋은 예예요. 암묵적인 runtime 사실을 오래 남고 들여다볼 수
있는 파일로 옮기는 거죠.

경로도 여전히 쓸모 있어요. checkout 위치를 짚어주니까요. 다만 이제 정체성까지 짊어질
필요가 없을 뿐이에요.

## lock은 공유 handoff 표면을 보호해요

worktree는 소스 편집을 격리하지만 공유 파일을 전부 자동으로 보호하진 않아요.

3B에서 충돌이 가장 잦은 파일은 보통 초안 파일 자체가 아니에요. agent가 서로 맞추려고
쓰는 handoff 파일이에요.

- `progress.md`
- `todos.md`
- `.agents/buffer.md`
- `ACTIVE-STATUS.md`

이 파일들은 작고, 중심에 있고, 자주 바뀌어요. 병렬 session이 현재 재시작 지점을 실수로
덮어쓰거나 엉뚱한 체크리스트 항목을 완료로 표시하기 딱 좋은 곳이죠.

3B는 그 표면을 `.agents/locks/` 아래의 advisory lock 디렉터리로 보호해요. lock 경로는
대상 경로를 그대로 따라가요. 이런 파일에 대한 lock은

```text
projects/3b/actives/example/progress.md
```

대응하는 `.agents/locks/.../progress.md.lock/` 디렉터리 아래에 살아요. 그 안에는 agent,
session, 타임스탬프, 대상 경로, 프로세스 id, worktree 경로를 기록한 manifest가 들어
있고요.

방식은 일부러 단순하게 짰어요. `mkdir`이 원자적 연산이에요. 디렉터리가 이미 있으면
lock이 잡혀 있는 거예요. 그러면 agent는 같은 handoff 문서를 무리하게 편집하지 않고
멈춰요.

이건 Git을 대체하는 게 아니에요. "나중에 merge하면 되지"가 틀린 답인 파일들을 위한,
Git 이전 단계의 조율 계층이에요. 오래된 `Resume Here` 블록은 merge 충돌보다 더 큰
대가를 치를 수 있어요. 다음 session을 엉뚱한 작업으로 안내해 버리니까요.

## 모든 worktree가 같은 lock 공간을 봐야 해요

여기 미묘한 worktree 문제가 하나 있어요. Git worktree는 각자 추적되는 파일의
checkout 사본을 따로 가져요. `.agents/`는 추적되는 내용이지 `.git/` 상태가 아니에요.
worktree마다 별도의 `.agents/locks/` 디렉터리를 둔다면, 각 worktree는 lock 공간을
자기 혼자 차지한다고 착각하게 돼요.

그러면 lock 프로토콜이 장식으로 전락하죠.

worktree 헬퍼는 각 worktree의 `.agents/locks/`를 메인 checkout의 `.agents/locks/`로
다시 연결해서 이걸 해결해요. checkout은 격리되지만 lock 공간은 공유되는 거예요.

이건 agent 시스템에서 진짜 중요한 종류의 디테일이에요. 눈에 보이는 설계는 "worktree를
써라"예요. 진짜 설계는 "worktree를 쓰되, 동시성 표면은 하나의 공유 lock 디렉터리로
보내고, 끊어진 symlink는 없는 경로로 착각하지 말고 `lstat`으로 잡아내라"예요.

이 마지막 단계가 없으면 시스템은 멀쩡해 보이면서 각 session에 사적인 lock 우주를
하나씩 쥐여줄 수 있어요.

## 프로토콜은 일부러 범위를 좁혔어요

3B는 모든 markdown 파일을 잠그지 않아요.

그러면 시끄럽고, 평범한 초안 작성이 분산 데이터베이스처럼 느껴질 거예요. 대부분의
파일은 branch 격리와 Git review로 충분히 다룰 수 있어요. lock 규칙은 session 사이의
상태를 짊어진 작은 파일 집합에만 적용돼요.

그 범위 자체가 설계예요.

- worktree는 구현과 초안 작성을 격리해요.
- `agent_origin`은 누가 task 레인을 소유하는지 선언해요.
- lock 디렉터리는 공유 handoff 문서를 보호해요.
- `progress.md`의 `## Resume Here`는 다음 session에게 뭘 먼저 할지 알려줘요.
- `ACTIVE-STATUS.md`는 triage용으로 task 상태를 투영해요.

각 계층은 좁은 역할 하나만 맡아요. 어느 것도 조율 시스템 전체가 될 필요가 없어요.

## 내가 가져갈 부분

재사용할 만한 아이디어는 "정확히 이 스크립트를 써라"가 아니에요.

재사용할 아이디어는 자주 하나로 뭉뚱그려지는 세 가지 질문을 분리하는 거예요.

1. checkout은 어디 있는가?
2. 이 task session은 누가 소유하는가?
3. 어떤 공유 파일이 충돌 보호를 필요로 하는가?

checkout 경로가 이 셋을 다 답하려 들면, 시스템은 결국 자기 자신과 싸우게 돼요. 경로는
편리하지만 약한 메타데이터예요. 도구가 단순해지면 같이 바뀌고, agent 사이를 넘나들며
조회하기 어렵고, migration 뒤에는 잘못 읽기도 쉬워요.

3B의 평평한 worktree 변경이 더 깔끔한 모델을 강제했어요. checkout 경로는 위치
지시자가 됐고, `agent_origin`은 소유자 신호가 됐고, lock은 handoff 상태를 위한
범위 좁은 조율 장치가 됐죠.

여기서 agent 병렬 작업이 현실적으로 굴러가는 이유가 이거예요. 충돌이 불가능해서가
아니라, 충돌이 일어나기 전에 시스템이 소유권을 표현할 자리를 갖고 있어서예요.
