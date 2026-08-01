---
title: 'Empirical Close: 자연스러운 trigger에 skill-side test를 맡기기'
description: >-
  어떤 verification test는 fixture로 충실히 재현되지 않는 진짜 trigger가 필요해요 — 대화형 prompt, 대화
  파싱, AskUserQuestion flow. test를 [~] empirical-close-pending으로 표시하고 다음 자연스러운
  trigger가 verify해 주리라 믿는 건, friction-log reopen과 짝지을 때 위생적인 선택이에요.
date: 2026-04-30T00:00:00.000Z
updated: '2026-08-02'
tags:
  - general
  - process
  - task-management
  - verification
category: general
draft: false
lang: ko
source_lang: en
source_slug: empirical-close-pattern
source_updated: '2026-08-02'
translation_date: '2026-05-10'
---

`wrap-followup-persistence-fix` 작업을 닫으려는데 test 두 개가 끝까지 안
풀렸어요. 19개 중 17개는 통과, 두 개는 fixture로 재현이 안 되는 종류였어요.
진짜 대화 안에서 "next session: do X" 같은 follow-up이 발생해야 검증되는
skill-side 동작이었거든요. 어떻게든 close해야 하는데, 거짓 trigger를
짜내자니 session state가 오염되고, 그렇다고 task를 열어두자니 7일 뒤 stale
경고로 dashboard만 어지럽혀요. 결국 세 번째 길로 갔어요.

세 번째 길이 이 글이 정리하려는 패턴이에요.

## 닫는 방법은 셋, 결과는 다 달라요

단위 mock으로는 못 잡는 검증 test의 경우, 닫는 경로가 세 갈래로 갈려요.

1. **Force staging** — 가짜 trigger를 끼워 넣어 지금 당장 돌려요. 진짜
   session 상태를 오염시키고, 억지로 만든 fixture는 실제 입력 모양과
   어긋나기 일쑤예요.
2. **Defer + leave open** — task folder를 `actives/`에 그대로 두고 7일
   뒤 stale 경고를 받아요. 잊혀진 task가 쌓이고 dashboard에 잡음만
   늘어요.
3. **Empirical close** — test를 `[~] empirical-close-pending`으로 표시한
   다음, task는 그대로 archive해요. 다음에 자연스럽게 그 trigger가
   일어날 때 검증되리라 믿고, 이상이 보이면 friction log로 다시 열어요.

3번에 대한 명시적 패턴이 없으면, mock이 안 되는 test가 끼어 있는 task는
영원히 반쯤 닫힌 채 앉아 있거나, 충실하지 않은 fixture로 억지로 staging
당해요.

## 세 옵션, 나란히

| 옵션                 | 장점                                    | 단점                                                   |
| -------------------- | --------------------------------------- | ------------------------------------------------------ |
| Force staging now    | close 시점에 test green; 명시적 검증    | session state 오염; fixture ≠ 현실; 복원 비용         |
| Defer + leave open   | 인위적 trick 없음                       | 7일 stale 경고; dashboard noise; 잊혀진 task 위험      |
| **Empirical close**  | trick 없음 + folder 닫힘 + 신호 보존    | 신뢰 필요; reopen 메커니즘 필요                        |

trigger가 본래 자연 발생만 가능한 종류라면(예: 진짜 대화에서 나온 "next
session: do X" — 어떤 fixture로도 충실히 재현이 안 되는) 그리고
friction-log reopen이 뒤를 받쳐 주면, empirical close가 제일 깔끔해요. 비용은
신뢰 보정이고, 얻는 건 충실하지 못한 test 없이도 task가 위생적으로
닫힌다는 점이에요.

## 패턴이 명시되기 전엔 어디서 어긋났나

이름이 없을 때 지저분해진 지점이 네 군데 있었어요.

- **"skip"과의 구별.** `[-]` skipped는 "test 안 하기로 결정",
  `[~]` empirical-close-pending은 "자연 발생 trigger에 미룸"이에요. 구별이
  없으면 archive가 그냥 포기처럼 보여요.
- **reopen 메커니즘이 명시되지 않아요.** 미뤄둔 test의 failure mode와
  맞물리는 regression을 잡도록 friction log를 미리 엮어두지 않으면,
  empirical close는 결국 "지우고 기도하기"로 변해요.
- **신뢰 보정.** 어떤 경로의 첫 instance에는 명시적 검증이 필요해요.
  empirical은 design이 한 번 검증된 뒤의 후속 iteration에 적용하는
  거예요. 처음 만드는 경로에 empirical을 잘못 끼우면 기반 점검을
  통째로 건너뛰게 돼요.
- **도구 표류.** /wrap과 /archive-task는 처음에 `[~]` close 상태를 몰라서
  에러를 내거나 blocking으로 처리했어요. 패턴이 의도를 전달하려면
  frontmatter에 `close_mode: empirical`과 `close_notes:`가 같이 와야 해요.

## 4단계 패턴

1. **task의 `todos.md`에 test를 표시:**

   ```markdown
   - [~] **Test N — {name}**: empirical close pending (YYYY-MM-DD). {Why no unit
     coverage}. Will exercise on next natural {trigger}. Reopen via friction log
     if {failure mode} occurs.
   ```

2. **task frontmatter 설정:**

   ```yaml
   status: completed
   close_mode: empirical
   close_notes: |
     {N/total} done; {M} empirical close pending (Tests X+Y).
     Reopen if {regression signal}.
   ```

3. **`/archive-task`로 평소처럼 archive.** empirical 신호를 기다린다고
   folder를 열어두지 마세요. 그건 그냥 stale folder예요.

4. **reopen 메커니즘을 미리 엮어두기:** archive 후에 regression 신호가
   나타나면 fire되는 friction-log 패턴이나 /wrap 경고를 추가해 둬요.

제 개인 tooling repo에 있는 `wrap-followup-persistence-fix` close-out
(2026-04-30)의 실제 예시예요. `/wrap` skill이 session 사이로 follow-up을
넘겨받게 만든 작업이고, Test 4와 5는 deferred 상태로 나갔어요.

```markdown
- [~] **Test 4 — Conversation extraction**: empirical close pending
  (2026-04-30). Skill-side (Step 5.65), no unit coverage. Will exercise on next
  natural /wrap that has a conversation-only follow-up. Reopen via friction log
  if Step 5.65 fails to persist a real candidate.
- [~] **Test 5 — Loss audit**: empirical close pending (2026-04-30). Skill-side
  (Step 9). Pair with Test 4 — first time user chooses "Skip" on a real Step
  5.65 candidate, verify Step 9 lists it under "potentially-lost".
```

같이 들어간 frontmatter:

```yaml
status: completed
close_mode: empirical
close_notes: |
  17/19 done; 2 [~] empirical-close pending (Tests 4+5). Reopen via
  friction log if Step 5.65 fails on a real conversation-only follow-up.
```

## 어떤 상황에 맞나

empirical close가 어울리는 자리는 이런 경우예요.

- 대화 맥락이 있어야 하는 **skill-side 동작 test** — 예를 들어 wrap의
  Step 5.65 대화 추출은 채팅 도중에 진짜로 "next session: do X"가
  나와야 발동해요.
- **AskUserQuestion flow** — prompt를 인위적으로 띄우고 답을 강제로 채워
  넣는 방식으로는 실제 UX가 검증되지 않아요.
- 부수효과를 되돌리는 비용이 production에서 regression을 잡는 비용보다
  더 큰 **side-effect test**.
- **post-merge close** — PR이 merge되고 branch가 사라졌으면 마지막 smoke가
  돌았든 안 돌았든 task는 끝난 거예요(2026-04-30 embed-interview close에서
  뽑힌 휴리스틱).

반대로 이런 경우에는 쓰지 않아요. regression-critical 경로(payment, auth,
data integrity — 이건 무조건 test를 강제), 보안 test(여기서는 empirical
신호를 절대 신뢰하지 않아요), unit-mock이 가능한 test(mock이 가능하면 unit
test를 그냥 작성하는 게 답이에요. empirical close는 mock 자체가 불가능한
영역의 fallback이에요), 그리고 어떤 경로를 처음 만드는 시점(첫 instance에는
명시적 검증이 필요해요. design이 검증된 뒤에야 empirical을 후속 iteration에
적용해요).

## 실용적인 takeaway

Empirical close는 task 위생이지 test 게으름이 아니에요. test는 그대로
존재해요. 다만 fixture가 아니라 production에서 실행될 뿐이에요. test를 안 돌리는
대안은 task의 존재 자체를 잊는 거고요. 모든 empirical close는 friction-log
reopen 패턴과 짝지어 두세요. 그게 빠지면 empirical close는 "지우고 기도하기"가
돼요. post-merge 변형(PR-merged + branch-gone = task done)은 같은 패턴을
test 상태가 아니라 merge 상태에 적용한 거예요. 둘 다 결국, 그 자리의
확신보다 더 오래 가는 신호를 믿는 쪽으로 무게를 옮긴 셈이에요.

## References

- [The Practical Test Pyramid (Ham Vocke / Martin Fowler)](https://martinfowler.com/articles/practical-test-pyramid.html)
