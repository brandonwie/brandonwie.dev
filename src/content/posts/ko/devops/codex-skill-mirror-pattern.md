---
title: Codex Skill Mirror 패턴
description: >-
  `.agents/skills/`를 정식 skill 출처로 두는 repo에서 Codex를 깔끔하게 붙이는 방법은 통째로 교체하거나 통째로
  심볼릭링크하는 게 아니에요. 정식 출처는 그대로 두고, 필요한 skill에만 어댑터를 다는 mirror 레이어가 답이에요.
date: 2026-04-18T00:00:00.000Z
updated: "2026-07-13"
tags:
  - devops
  - codex
  - claude-code
  - skills
  - interoperability
category: devops
draft: false
lang: ko
source_lang: en
source_slug: codex-skill-mirror-pattern
source_updated: "2026-07-13"
translation_date: "2026-07-13"
---

3B repo에서 Codex CLI를 붙이려고 하다가 `.agents/skills/`를 그대로 `~/.codex/skills/`로 심볼릭링크해 봤어요. discover는 됐는데 막상 `task-starter`를 돌리니까 조용히 어긋나기 시작했어요. Claude 전용 tool을 가정하고 쓴 instruction이 Codex에서는 다르게 해석돼서 작동하는 척만 하고 실제로는 misbehave했어요. 두 지름길 다 install 직후에는 멀쩡해 보이다가 나중에야 문제가 드러나요.

`.agents/skills/`를 이미 정식 skill 출처로 두고 있다면, 통째로 `.codex/skills/`로 바꾸거나 폴더 전체를 심볼릭링크하는 건 둘 다 함정이에요. 안정적으로 굴러가는 패턴은 6단계예요.

1. `.agents/skills/`를 정식 skill 출처로 유지해요.
2. repo 안에 `.codex/skills/` mirror를 따로 둬요.
3. 이식 가능한 skill은 심볼릭링크로 mirror해요.
4. runtime 가정이 깨끗하게 옮겨가지 않는 skill만 진짜 Codex 어댑터로 작성해요.
5. repo-local mirror를 한 번에 하나씩 `~/.codex/skills/`로 sync해요.
6. 같은 이름의 진짜 Codex 어댑터가 있으면 Codex config에서 Claude 쪽 `.agents/skills/{name}/SKILL.md`만 끄세요.

## 직접 심볼릭링크가 부족한 이유

Claude 쪽 skill은 Codex에 같은 이름이나 의미로는 없는 runtime 기능을 가정하는 경우가 많아요. `AskUserQuestion`, `TodoWrite`, slash skill 체이닝, `WebSearch`/`WebFetch` 같은 Claude 전용 tool이 그래요.

`.agents/skills/`를 `~/.codex/skills/`로 그대로 심볼릭링크하면 discover는 되지만 매끄럽게 돌아가지는 **않아요**. 결과는 어중간한 실패 모드예요.

- markdown만 있는 이식 가능한 skill은 잘 도는 것처럼 보여요.
- workflow 의존도가 높은 skill은 discover는 되지만 실제로는 오해를 부르는 동작을 해요.
- Codex 쪽에서 in-place로 고치면 Claude의 정식 skill에서 drift해요.

## mirror-with-adapters 레이아웃

타겟 runtime이 직접 소유하는 **mirror-with-adapters** 레이어를 두는 게 핵심이에요.

```text
.agents/skills/                  # canonical Claude source
  ├── sync-symlink-rectify/
  ├── task-starter/
  └── wrap/

.codex/skills/                   # repo-local Codex mirror
  ├── sync-symlink-rectify -> ../../.agents/skills/sync-symlink-rectify
  ├── task-starter/              # real Codex adapter
  └── wrap/                      # real Codex adapter

~/.codex/skills/                 # global Codex runtime home
  ├── sync-symlink-rectify -> 3b/.codex/skills/sync-symlink-rectify
  ├── task-starter -> 3b/.codex/skills/task-starter
  └── wrap -> 3b/.codex/skills/wrap
```

### 어댑터로 바꾸는 경계

mirror된 Codex skill 경로가 아직 `.agents/skills/`로의 심볼릭링크 상태라면, Codex 쪽 경로의 `SKILL.md`를 고치는 순간 Claude 정식 출처도 같이 바뀌어요. 그래서 "이식용 mirror"에서 "진짜 Codex 어댑터"로 넘어갈 때는 첫 단계가 명시적이어야 해요.

1. `.codex/skills/{name}`의 mirror된 심볼릭링크를 지우거나 교체해요.
2. 그 경로에 진짜 디렉토리를 만들어요.
3. Codex가 소유하는 `SKILL.md`를 거기 작성해요.

git에서 이 마이그레이션은 **기존 심볼릭링크 삭제 + 같은 경로에 진짜 파일 추가**로 보여요. 변경의 정확한 모양이 그래요. mirror가 깨졌다는 신호가 아니에요.

### 진짜 어댑터를 쓸지 말지

원래 skill이 runtime에 종속된 동작을 쓸 때만 진짜 어댑터를 만들어요. 3B에서 실제로 쪼갠 사례를 보면 이래요.

- `task-starter`는 `AskUserQuestion`, `EnterPlanMode`/`ExitPlanMode`, inline slash skill 호출에 Codex 쪽 변환이 필요했어요.
- `wrap`은 `TodoWrite`, `AskUserQuestion`, 중첩 slash skill 체이닝에 변환이 필요했어요.
- 단순한 instruction 위주 skill은 직접 심볼릭링크 그대로 뒀어요.

### 어댑터 sync 규율

skill이 진짜 Codex 어댑터가 되면 일부러 작게 유지해요.

1. upstream Claude `metadata.version`에 sync해요.
2. 실행 의미를 바꾸는 Codex runtime 변환만 보존해요.
3. contract parity에 필요한 결정적 upstream delta만 옮겨요.
4. 타겟 runtime이 진짜로 fork가 필요한 게 아니라면, Claude skill 본문 전체를 복사하지 말아요.

어댑터가 성숙해지면서 이 규율을 넓히는 후속 개선이 세 가지 나왔어요.

진짜 어댑터는 environment에서 runtime을 읽어오는 대신, 자기가 선택됐다는 사실만으로 자기 runtime을 알 수 있어요. Codex가 `CODEX_HOME`과 `CODEX_PROFILE`을 노출하긴 하지만 둘 다 반드시 있다는 보장은 없어요. 명시적인 argument와 미리 export된 유효한 agent 값이 갖춰졌다면, 어댑터가 선택됐다는 사실 자체를 runtime 출처 신호로 삼으면 돼요. environment 변수는 유용한 힌트일 뿐, 어댑터가 기대고 갈 전제조건은 아니에요.

projection sync는 정식 checkout에서 돌아가요. linked worktree를 거부하는 canonical-only 가드는 우회할 버그가 아니라 소유권 경계예요. task worktree 안에서 가드가 걸리면, 출처 어댑터와 task branch projection을 한 commit에 같이 담고, parity를 확인한 뒤 merge 후에 설치된 plugin을 새로 고치면 돼요. 가드를 우회하면 깔끔한 소유권 규칙을 조용한 drift와 맞바꾸는 셈이에요.

로컬 marketplace 소스 바이트는 version이 안 올라가도 바뀔 수 있어요. 그러면 version 번호는 그대로인데 설치된 cache가 낡은 내용을 가리키게 돼요. `codex plugin add <plugin>@<marketplace> --json`으로 cache를 멱등하게 새로 고친 뒤, 변경을 마무리하기 전에 cache에 저장된 skill 해시를 marketplace 소스와 repo 어댑터 양쪽에 견줘 봐요.

### 이식 가능한 plugin으로 승격

workflow에 재사용 가능한 도메인 로직이 들어가면(state model, scorer, prompt asset, provider protocol 같은 거), 어댑터만으로는 너무 얇아져요. 추출한 시스템을 이렇게 승격해요.

1. runtime에 종속되지 않는 코어 패키지로 빼요.
2. 얇은 runtime/plugin wrapper를 둬요.
3. 추출한 패키지를 직접 import하는 test를 둬요.

이렇게 하면 cross-agent 로직은 재사용 가능한 상태로 유지하면서, runtime에 종속된 boot 단계, update flow, downstream pipeline 결합은 wrapper 레이어 안에 가둘 수 있어요.

prompt asset은 추출한 코어에 함께 묶어서 패키지가 원래 runtime으로 다시 손을 뻗지 않고 스스로 완결되게 해요. import와 test는 host 인터프리터 대신 runtime 로컬 environment(`uv run`이나 그에 준하는 virtualenv) 안에서 검증해요. 그래야 패키지가 자기 힘으로 도는 걸 증명할 수 있어요.

이식 가능한 wrapper의 이름을 바꾸는 건 폴더 하나로 끝나지 않아요. 바깥에 드러나는 identity 묶음을 한꺼번에 맞춰야 해요. 폴더 이름, manifest나 배포 이름, environment 변수, 사용자에게 보이는 상태 경로가 하나로 같이 움직여야 대외적인 이름이 어긋나지 않아요. 내부 module 이름은 별개 문제예요. API 이름을 바꿔서 그만한 변경 비용을 감당할 이유가 생기지 않는 한 그대로 두는 게 좋아요. wrapper 이름을 바꿨다고 그것만으로 import 경로까지 다시 쓸 이유는 안 되니까요.

글로벌로 link된 어댑터라도, workflow가 다른 repository에 강하게 묶여 있으면 고정된 프로젝트 실행 루트를 지정할 수 있어요. 글로벌 discovery와 실행 위치는 별개 관심사예요. 어댑터는 어디서나 보이지만 명령은 특정 repo 한 곳에서만 돌게 하는 거죠.

## 이 레이어링이 작동하는 이유

### 정식 출처가 하나로 유지돼요

Claude 중심 workflow 로직이 `.agents/skills/`에 그대로 있어서 기존 3B 생태계와 연결된 repo는 바꿀 필요가 없어요.

### 타겟 runtime이 자기 호환 레이어를 직접 소유해요

Codex 전용 적응은 `.codex/skills/` 아래에 살고, 거기서 진화해요. tool 종속 분기로 Claude 출처를 오염시키지 않아요.

### Discovery와 실행이 깔끔하게 분리돼요

repo-local mirror는 **Codex가 뭘 discover할 수 있는지**를 풀어요. 어댑터는 **Codex가 뭘 깔끔하게 실행할 수 있는지**를 풀어요. 두 문제를 따로 다루면 과도한 중복도, 매끄러움을 가장하는 일도 피할 수 있어요.

Codex는 repo의 `.agents/skills/`도 직접 discover할 수 있어요. 이식 가능한 pass-through skill에는 도움이 되지만 `.codex/skills/`에 같은 이름의 진짜 어댑터가 있으면 헷갈려요. 그럴 땐 `~/.codex/config.toml`의 `[[skills.config]]`로 Claude 쪽 `SKILL.md`만 disable하세요. `.codex/skills/` 어댑터는 켜둔 채로요.

### 글로벌 install이 되돌리기 쉬워요

repo-local skill을 한 번에 하나씩 `~/.codex/skills/`로 link하는 sync script가 글로벌 Codex home을 추가식으로 유지해줘요. 빌트인 skill을 덮어쓰지도 않고, 글로벌 skills 디렉토리 전체를 repo가 소유하는 트리로 바꿔치지도 않아요.

## 이 패턴이 맞는 경우

이런 상황에 잘 맞아요.

- repo가 이미 다른 agent 포맷으로 성숙한 skill 시스템을 가지고 있을 때.
- 출처 skill 트리가 정식이고, 정식인 채로 유지돼야 할 때.
- 일부 skill은 tool에 무관하지만 가치가 큰 workflow 몇 개는 그렇지 않을 때.
- skill 라이브러리 전체를 처음부터 다시 쓰지 않고도 Codex discovery를 native하게 느끼게 하고 싶을 때.

반대로 타겟 runtime이 즉시 새로운 정식 출처가 돼야 할 때, 모든 skill이 깊게 runtime에 종속돼서 mirror가 거의 wrapper로 바뀌는 경우, 또는 hub repo만이 아니라 외부 연결 repo 전체에 cross-agent parity가 필요할 때는 안 맞아요.

## 실용적 정리

discovery 호환성과 실행 호환성은 다른 문제예요. 이식 가능한 skill은 심볼릭링크로 mirror하고 runtime 미스매치가 진짜인 것에만 어댑터를 다세요. mirror된 skill은 고치기 **전에** 진짜 어댑터로 승격해요. 안 그러면 그 수정이 Claude 정식 출처로 들어가요. 어댑터는 작게 유지하고 upstream `metadata.version`과 결정적 delta만으로 sync하세요. 통째로 복제하는 거 아니에요. 어댑터 변환만으로 부족해지면, 재사용 가능한 로직을 이식 가능한 코어 패키지로 분리하고 runtime/plugin 레이어는 얇게 두세요.

## References

- [OpenAI Codex CLI — official repository](https://github.com/openai/codex)
- [OpenAI Codex Skills](https://developers.openai.com/codex/skills)
