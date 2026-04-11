---
title: JSONL transcript로 Claude Code turn latency 측정하기
description: >-
  이미 disk에 쌓여 있는 JSONL transcript를 파싱해서 Claude Code session의
  per-turn latency를 ground-truth로 측정한 이야기. 그 과정에서 스스로 잡아낸 세
  가지 측정 trap도 같이 정리했어요.
date: 2026-04-08T00:00:00.000Z
updated: '2026-04-11'
tags:
  - claude-code
  - latency
  - measurement
  - debugging
  - jsonl
  - transcripts
  - devops
category: devops
draft: false
lang: ko
source_lang: en
source_slug: claude-code-turn-latency-measurement
source_updated: 2026-04-11T00:00:00.000Z
translation_date: '2026-04-11'
---

최근 release 이후 Claude Code session이 5배 느려졌다는 보고가 있었어요. config를 만지기 전에 이게 진짜인지부터 확인해야 했어요. perception은 믿을 만하지 않아요 — 사람은 고통스러웠던 case를 평범한 것보다 더 잘 기억하고, 보고된 규모는 양방향으로 2배씩 틀릴 수 있어요. 뭘 investigate할지 정하기 전에 객관적인 숫자가 필요했어요.

다행히 Claude Code는 이미 모든 session transcript를 `~/.claude/projects/{project_slug}/*.jsonl`에 자동으로 써요. 줄마다 하나의 message가 있고, 각 줄마다 밀리초 단위의 `timestamp` 필드가 달려 있어요. 모든 과거 session이 ground truth로 측정 가능해요. 추가 instrumentation도 필요 없어요. data는 이미 disk에 있어요.

안 좋은 소식은 JSONL 포맷에 quirk가 있어서 측정 tool을 만들면서 세 번이나 걸렸다는 점이에요. 두 개는 스스로 고쳐야 했던 analysis error였고, 하나는 experimental control을 오염시킨 process trap이었어요. 이 글에서는 접근 방식, 세 가지 trap, baseline에서 나온 reference output, 그리고 다른 옵션 대신 retroactive transcript parsing을 고른 이유를 정리할게요.

## 왜 after-the-fact 측정이 여기 맞는 tool인지

이런 investigation을 어렵게 만드는 세 가지 요인이 있고, 이것들이 합쳐져서 하나의 구체적인 제약을 만들어요.

1. **사후 instrumentation은 도움이 안 돼요.** 느려졌다는 보고가 올라올 때쯤이면 측정하고 싶은 session은 이미 끝나 있어요. 오늘 timing probe를 추가해도 post-probe data만 쌓이고, 정작 비교가 필요한 pre-slowdown baseline은 존재하지 않아요.
2. **Perception bias는 실제로 있고 양방향으로 작동해요.** 사용자가 느낀 slowdown의 규모는 양쪽으로 2배씩 틀릴 수 있어요. 조율하려면 객관적인 숫자가 필요해요.
3. **Claude Code 자체의 logging은 opaque해요.** "지난주 P90 latency를 보여줘" 같은 built-in flag는 없어요. data를 어디선가 직접 파내야 해요.

이 상황을 구해 주는 게 JSONL transcript예요. plain-text, append-only, 한 줄에 한 message씩, Claude Code가 자동으로 `~/.claude/projects/{slug}/`에 써 주는 log예요. 각 줄은 밀리초 단위 `timestamp`가 붙은 JSON 객체예요. 즉, 측정 tool이 transcript를 retroactive하게 walk해서 임의의 과거 구간에 대해 per-turn latency 분포를 뽑을 수 있어요. quirk를 어떻게 다뤄야 하는지 알기만 한다면요.

## 세 가지 trap

첫 버전의 tool을 직관으로 만들었는데 자신 있게 틀린 숫자를 두 번 연속으로 뱉었어요. trap마다 이름을 붙일 만한 가치가 있어요. 각각이 tool을 동작하는 것처럼 보이게 만들면서도 조용히 답을 속이고 있었거든요.

### Trap 1 — grep으로 tool invocation 세기

**뭐가 잘못됐는지.** 특정 tool(`storm.py`)이 각 session에서 몇 번 호출됐는지 세고 싶어서 `grep -c 'storm.py' session.jsonl`을 돌렸어요. 어느 session에서 111이 나왔어요. storm이 slowdown contributor라는 초기 가설을 확증해 주는 damning한 숫자였어요.

**왜 틀렸는지.** Claude Code transcript는 tool invocation 뿐만 아니라 session이 건드린 모든 파일의 Read 내용, documentation quote, ADR body, buffer entry까지 담고 있어요. Claude가 `storm.py`를 언급하는 README를 읽으면 그 README 본문이 transcript 안에 들어가요. grep은 "Claude가 이 command를 실행했다"와 "Claude가 이 command를 prose로 언급하는 파일을 읽었다"를 구분하지 못해요.

**올바른 방법.** JSONL을 구조적으로 parse해서 input이 매치되는 `tool_use` block만 세는 거예요.

```python
for msg in iter_messages(jsonl_path):
    if msg.get("type") != "assistant":
        continue
    for block in (msg.get("message", {}).get("content") or []):
        if not isinstance(block, dict):
            continue
        if block.get("type") == "tool_use" and block.get("name") == "Bash":
            cmd = (block.get("input") or {}).get("command", "")
            if "storm.py" in cmd:
                # 실제 호출
                ...
```

"111번 호출"로 나왔던 session의 올바른 숫자는 14였어요. grep이 8배 정도 부풀려서, storm이 상시 돌아가고 있는 것처럼 investigation을 오도하고 있었어요. 실제로는 합리적인 cadence로 동작하고 있었던 거죠.

### Trap 2 — Claude Code JSONL의 `role: "user"`가 overload돼 있어요

**뭐가 잘못됐는지.** tool counting을 고친 뒤 실제 latency 측정으로 넘어갔어요. state machine을 만들어서 JSONL을 walk하면서, `role: "user"` message를 전부 turn-start로 다루고 다음 `role: "assistant"` message까지의 delta를 쟀어요. session 당 "turn count"가 실제 user message 수보다 ~4배 높게 나왔고, 가장 느린 "turn"은 user text가 0인데 latency가 120초 넘게 찍혔어요.

**왜 틀렸는지.** Claude Code는 두 가지 다른 것을 `role: "user"`로 인코딩해요.

- **(a)** 진짜 human input — 사용자가 타이핑한 message.
- **(b)** tool result가 model로 돌려보내지는 message — Bash나 Read tool이 끝나면 그 output이 `role: "user"` message로 감싸져서 `tool_result` block을 담아요.

(b)를 "turn start"로 세면 tool-cycle time이 user-perceived latency처럼 보여요. 120초짜리 "turn"은 사실 Read가 거대한 파일을 돌려주고 Claude가 다음 thinking step을 돈 것일 수 있어요. 사용자 입장에서는 이게 *하나의* 연속된 응답이지, 별개의 turn이 아니에요.

**올바른 방법.** user message를 non-empty text content가 있는 것만 filter하는 거예요.

```python
def is_real_user_input(msg: dict) -> bool:
    content = message_content(msg)
    for block in content:
        if not isinstance(block, dict):
            continue
        if block.get("type") == "text" and block.get("text", "").strip():
            return True
    return False
```

filter 후 한 session의 turn count가 733에서 65로 떨어졌고, median latency는 4.93초(fast tool cycle에 희석된 unfiltered 측정치)에서 16.80초(진짜 user-perceived latency)로 뛰었어요. 질적인 이야기 자체가 뒤집혔어요 — "tail만 blow-up"에서 "균일한 slowdown + tail amplification"으로요. 이 경험 덕분에 항상 요약 통계 옆에 diagnostic column을 같이 출력하는 습관이 생겼어요. `u_chars=0` per-turn diagnostic이 애초에 Trap 2를 발견하게 해 준 유일한 신호였거든요.

### Trap 3 — 병렬 session의 실험적 오염

**뭐가 잘못됐는지.** 측정이 한 Claude Code session에서 돌고 있는 동안, 제 parallel session 중 하나가 바로 제가 "Phase 2 전엔 적용하지 말 것"이라고 방금 flag한 fix를 적용해 버렸어요. baseline을 찍고 commit하는 사이에 두 개의 parallel commit이 landing됐어요. hooks fix 하나와 storm refactor 하나였어요. storm refactor는 제가 slowdown contributor로 의심하면서 들여다보던 섹션을 통째로 제거했어요.

**왜 이런 일이 생겼는지.** Claude Code session끼리는 공유 config에 대한 write를 조율하지 않아요. 같은 repo의 두 session이 독립적으로 같은 변경을 decide할 수 있어요. "Y가 끝나기 전까지 X는 건드리지 말 것"은 사회적 규칙이지 기술적인 것이 아니에요. parallel actor에 의해 쉽게 깨져요.

**올바른 방법.** baseline 숫자 옆에 **baseline commit hash**를 같이 기록해 두세요. investigation 문서에 적어 두면 Phase 2에서는 이렇게 돌릴 수 있어요.

```bash
git log {baseline_hash}..HEAD --oneline -- .claude/ path/to/project/
```

baseline과 re-measurement 사이에 landing된 모든 변경을 볼 수 있어요. 실험이 여전히 부분적으로 오염됐을 수는 있지만, 오염이 invisible 대신 detectable하고 attributable해져요.

## tool

trap을 이해한 뒤, tool 자체는 ~400줄 pure-stdlib Python script예요. 하는 일은 이래요.

1. `~/.claude/projects/{slug}/*.jsonl`을 scan해요.
2. 각 파일을 state machine으로 walk하면서 *user text* message만 turn-start로 다뤄요. tool result는 제외해요.
3. 첫 assistant reply까지의 delta를 measure해요 (user-perceived "first byte" latency).
4. 600초 넘는 gap은 filter해요. 이건 사용자가 자리를 뜬 거지 tool이 hang된 게 아니에요.
5. session을 cutoff date로 split해서 era 별로 P50, P90, P99, mean, max를 계산해요.
6. 선택적인 `--slow` flag는 threshold를 넘는 turn에 대해 per-turn diagnostic column(`u_chars`, `a_chars`, tool count)을 덤프해요.

design choice는 하나씩 설명할 가치가 있어요. 각각이 빌드 중에 실제로 겪은 뭔가에 의해 결정됐거든요.

| 선택                                   | 이유                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| user → **첫 번째** assistant reply     | 전체 task 완료 시간이 아니라 user가 체감하는 first-byte latency를 측정해요     |
| 600초 idle filter                      | 10분 넘는 gap은 latency가 아니라 사용자가 자리를 뜬 거예요                     |
| file mtime 기준 era split              | 거칠지만 간단해요. 대부분의 session은 24시간 미만이라 잘못 분류될 일이 드물어요  |
| diagnostic column은 항상 on            | state machine bug를 잡는 방법이에요 — Trap 2를 참고하세요                       |
| pure stdlib (pip 없음)                 | 지속성 — python만 있으면 어떤 machine에서도 돌아가요. dependency rot도 없어요    |

"pure stdlib" 선택은 특별히 방어할 가치가 있어요. 측정 tool은 6개월 된 dependency 버전 충돌로 깨진 걸 발견하고 싶은 마지막 대상이에요. `sqlite3`, `argparse`, `datetime`, `json`만 쓰면 Python 3.11+이 깔린 어떤 환경에서도 영원히 돌아가요.

## Reference output

2026-04-08에 제가 Claude Code를 많이 쓰는 개인 프로젝트에서 찍은 baseline의 수정된 측정 결과예요.

```text
=== Corrected measurement, n=30 sessions ===
session    mtime            era    turns       p50       p90       p99
c7b43606   04-08 14:57      POST     14     27.76s    74.93s   119.23s
5e441a50   04-08 10:01      POST     22     34.65s    98.35s   111.24s
71e328b7   04-08 16:13      POST      9      7.97s    39.32s    39.32s
ab982012   04-07 19:33      PRE       4      8.34s    46.01s    46.01s
82a4ffec   04-07 00:39      PRE      25      6.31s    18.95s    22.00s
...

Aggregated pre/post cutoff (2026-04-08 09:28):
  PRE   n= 251  mean= 11.94s  p50=  8.34s  p90= 22.52s  p99=  48.47s
  POST  n=  65  mean= 30.58s  p50= 16.80s  p90= 90.55s  p99= 119.23s

  p50    8.34s →  16.80s   2.01x
  p90   22.52s →  90.55s   4.02x
```

핵심 숫자: release 후 P50이 두 배, P90이 네 배가 됐어요. 이건 진짜 slowdown이에요, perception이 아니라. 흥미로운 건, 첫 pass 분석 — *망가진* Trap 2 측정 — 이 자신 있게 "tail-only blow-up, 2.4x"를 reporter에게 거의 다시 전달할 뻔했어요. 수정된 측정(P90 4.02x)이 원래 보고된 "5x"에 훨씬 가까웠고, 사용자 추정을 다시 정상화해 줬어요. 배운 점: 멀쩡한 정신의 사용자 보고가 내 측정과 ~2배 넘게 disagree한다면, perception보다 측정을 먼저 의심하세요.

## 고려한 옵션들

tool을 만들기 전에 네 가지 접근을 평가했어요.

| 옵션                               | 장점                                                       | 단점                                                                     |
| ---------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| **JSONL transcript 파싱**          | 추가 instrumentation 없음, retroactive, 무료, stdlib       | transcript가 담는 것만 측정됨, server timing은 못 봐요                  |
| Claude Code에 timing probe 추가    | 가장 정밀함, 모든 layer 포착 가능                           | 코드 변경 필요, post-probe data만 측정됨                                 |
| 외부 wall-clock timer              | 간단하고 언어 독립적                                       | first-byte가 아닌 전체 task 시간, 사용자가 직접 돌려야 해요              |
| Anthropic API dashboard            | server-side authoritative                                  | Claude Code 사용자에겐 노출 안 됨, 집계된 형태만 존재                    |

JSONL transcript parsing이 이긴 이유는 **retroactive 측정이 결정적인 요구사항**이었기 때문이에요. slowdown은 이미 일어난 일이었어요. 오늘 추가한 timing probe는 비교할 pre-slowdown baseline이 없으니까 정작 필요한 질문에 답할 수 없어요. transcript는 이미 disk에 밀리초 timestamp와 함께 있으니 PRE와 POST 데이터가 모두 공짜로 있는 거예요. 드는 비용은 Python script 작성하는 하루 오후였어요 (스스로 잡은 trap들 debugging까지 포함해서요).

감수한 trade-off: transcript 기반 측정은 client-side와 server-side latency를 분리할 수 없어요. slowdown이 Anthropic API 쪽이라면 이 tool은 "wall-clock time이 늘어났다"는 건 확인해 주지만 "API가 느려졌다"는 건 증명할 수 없어요. 지금 던지는 investigation 질문("investigate할 만한 진짜 slowdown이 있는가?")엔 충분하지만, SLA-grade 측정에는 부족해요.

## 언제 이 방법을 써야 할까요

이 접근은 이런 상황에 맞는 tool이에요.

- 사용자(혹은 당신 본인)가 "Claude Code가 느려진 것 같아요"라고 보고했는데, config를 건드리기 전에 그게 진짜인지 판단해야 할 때.
- config 변경(예: "MEMORY.md 다이어트가 도움이 됐나?")을 objective per-turn data로 A/B test하고 싶을 때.
- 시간에 따른 drift를 탐지하기 위해 주기적인 latency baseline을 원할 때.
- 새로운 skill, hook, MCP server가 ship됐는데 뭔가 regress시키진 않았는지 검증하고 싶을 때.
- 간헐적인 slowness 불평을 debugging하는데, tail behavior(P90, P99)를 봐야 할지 median(P50)을 봐야 할지 판단이 필요할 때.

반대로 이런 경우엔 *맞지 않아요*.

- server-side(Anthropic API) latency가 필요할 때 — transcript는 round-trip wall time만 볼 수 있어요.
- token-count-weighted latency가 필요할 때 — 이 tool은 wall time만 재요.
- population이 아니라 single-turn 이상을 측정할 때 — JSONL timestamp는 aggregate에서 신뢰할 만하지만, 개별 turn은 clock skew나 client-side delay가 있을 수 있어요.
- 서브 100ms 정밀도가 필요할 때 — Claude Code는 밀리초 timestamp를 쓰지만 네트워크 너머의 측정은 그 단위에서 noisy해요.

## 정리

- **diagnostic column이 당신 스스로의 bug를 잡아 줘요.** 요약 통계만 필요할 것 같아도, 측정 tool엔 항상 per-turn metadata를 포함시키세요. `u_chars=0` diagnostic이 Trap 2로 이어 준 유일한 신호였어요.
- **가설부터 진술하세요.** 요약 숫자를 신뢰하기 전에 측정이 어떤 assumption을 하고 있는지 나열하고, 그걸 부정할 수 있는 증거를 찾아보세요. 제 첫 pass 분석은 "tail-only blow-up, 2.4x"를 자신 있게 보고했지만, tool 자체의 diagnostic output이 요약 숫자와 모순된 덕분에 "uniform 2x + tail 4x"로 수정됐어요.
- **perception보다 측정을 먼저 의심하세요.** 멀쩡한 정신의 사용자 보고가 내 측정과 ~2배 넘게 disagree한다면 tool 어딘가에 문제가 있을 가능성이 높아요. Trap 2가 정확히 이 error를 반대 방향으로 만들었어요 — tool이 tool cycle을 user turn으로 세면서 slowdown을 과소평가했어요.
- **baseline commit hash는 싼 보험이에요.** 모든 before/after 측정에서 baseline 숫자 옆에 commit hash를 기록하세요. parallel-session 오염이 invisible 대신 detectable해져요.
- **data가 이미 disk에 있다면, retroactive 측정이 "probe를 추가"보다 나아요.** JSONL transcript는 이미 거기 있어요. instrument하지 말고 parse하세요.

tool 자체는 짧아요 — ~400줄 — 그리고 investigation 전체는 하루 오후면 끝났어요. 가치는 tool의 sophistication이 아니었어요. 첫 번째 그럴듯한 숫자를 신뢰하는 대신, 스스로 측정 error를 잡고 tool을 두 번이나 다시 만들 의지였어요.
