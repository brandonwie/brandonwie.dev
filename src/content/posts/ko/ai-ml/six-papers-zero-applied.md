---
title: "논문 6편, 적용 0개 — 훈련된 읽기로 보낸 한 주"
description: >-
  DAIR.AI 4월 6-12일 배치에서 논문 6편을 읽고 3가지 공통 theme을 뽑았지만,
  3B에는 한 줄도 적용하지 않았어요. Pattern A(theme saturation before action)가
  실제로 어떻게 동작하는지 보여주는 weekly synthesis예요.
date: 2026-04-17T00:00:00.000Z
updated: 2026-04-17T00:00:00.000Z
tags:
  - forge
  - ai-ml
  - weekly-synthesis
  - pattern-a
  - llm-agents
category: ai-ml
draft: false
lang: ko
source_lang: en
source_slug: six-papers-zero-applied
source_updated: "2026-04-17"
translation_date: "2026-04-17"
references:
  - url: "https://arxiv.org/abs/2604.02460"
    title: "Single-Agent LLMs Outperform Multi-Agent Systems on Multi-Hop Reasoning Under Equal Thinking Token Budgets"
    type: authoritative
  - url: "https://arxiv.org/abs/2604.04323"
    title: "How Well Do Agentic Skills Work in the Wild"
    type: authoritative
  - url: "https://arxiv.org/abs/2604.06240"
    title: "The Art of Building Verifiers for Computer Use Agents"
    type: authoritative
  - url: "https://github.com/microsoft/memento"
    title: "MEMENTO: Teaching LLMs to Manage Their Own Context"
    type: authoritative
  - url: "https://arxiv.org/abs/2604.04503"
    title: "Memory Intelligence Agent (MIA)"
    type: authoritative
  - url: "https://arxiv.org/abs/2604.05013"
    title: "Scaling Coding Agents via Atomic Skills"
    type: authoritative
---

# 논문 6편, 적용 0개 — 훈련된 읽기로 보낸 한 주

DAIR.AI의 4월 6-12일 배치에서 논문 6편을 읽었어요. 논문 분석 6개를 작성했고,
knowledge entry 6개를 graph에 추출했어요. 그리고 이번 주 3B 인프라에 적용된
변경은 0건이에요.

이건 backlog가 아니에요. Pattern A — theme saturation before action이에요.
Pattern A에서는 단일 논문의 주장을 기록하고, index하고, shelf에 올려둘 뿐
구현하지 않아요. 다음 weekly cycle에서 다른 독립적인 source가 같은 theme을
보강하거나, 3B 자체에서 관찰된 friction이 주장을 검증했을 때 비로소 졸업해요.
두 개의 신호 혹은 하나의 현실, 둘 중 하나가 주장을 승격시켜요. 신호 하나만으로는
부족해요.

이 포스트는 그 검증이에요. 논문 6편, 공통 theme 3가지, 그리고 하나의 정책 응답.
Theme은 **scale-awareness**(agent와 skill 개수가 임계치를 넘을 때 무엇이
달라지는가), **bidirectional flow**(one-directional 아키텍처가 왜 한계에
부딪히는가), **atomic granularity**(compose와 generalize 가능한 단위로 capability를
어떻게 잘라낼 것인가)예요. 이 세 가지는 이 포스트의 끝에서 모두 shelf에 올라가요.
하나도 구현되지 않아요. 그게 버그가 아니라 feature예요.

---

## Theme 1 — Scale-Awareness

3B는 대략 20개의 skill과 single-agent 기본값을 전제로 설계되었어요. 지금은
46개 이상의 skill이 돌아가고, parallel-task advisor의 signal score가 임계치를
넘으면 agent team이 자동으로 spawn돼요. 이번 배치의 두 논문이 그 원래 설계
전제가 실제로 어디서 깨지는지를 정량적으로 보여줘요.

**Tran과 Kiela의 _[Single-Agent LLMs Outperform Multi-Agent Systems](https://arxiv.org/abs/2604.02460)_**
(Stanford)는 multi-agent 조율을 Data Processing Inequality(DPI)의 관점에서
풀어내요. 공식적인 주장은 깔끔해요. _answer ↔ full context ↔ inter-agent
messages_ 순의 Markov chain에 대해 I(Y; C) ≥ I(Y; M)이 성립해요. Compressed
message 위에서 동작하는 어떤 estimator든, full context 위에서 동작하는
estimator로 같거나 더 나은 정확도로 시뮬레이션할 수 있어요. 즉 multi-agent
조율은 **정보 손실이에요** — 모든 inter-agent message는 각 agent가 쥐고 있던
full context의 lossy compression이에요.

3가지 모델 계열(Qwen3, DeepSeek-R1-Distill-Llama, Gemini 2.5), 5가지 multi-agent
아키텍처, 2가지 benchmark에서 결과는 일관돼요. 동일한 compute budget에서는
single-agent가 multi-agent와 대등하거나 더 나아요. MAS 문헌에서 보고된 향상은
계산되지 않은 compute — 더 많은 총 token — 때문이지, 아키텍처의 우위 때문이
아니에요. 성능은 1000-2000 thinking token 부근에서 saturate되고, agent 수든
token 수든 그 이상 과하게 할당하면 diminishing return이 나와요.

예외는 좁지만 실재해요. Single-agent의 context utilization이 훼손된 경우 —
substitution noise α ≥ 0.7, 대략 70% token 훼손 — multi-agent의 decomposition
구조가 single-agent가 복구하지 못하는 정보를 recover하기 시작해요. 그 regime은
존재해요. 다만 가정이 아니라 근거가 필요해요.

어떤 orchestration layer든 함의는 같아요. 입증 책임이 뒤집혀요. Multi-agent는
이제 구체적인 정당화가 필요해요. 진짜로 독립된 subtask, 심하게 훼손된 context,
구체적인 information-recovery 주장 같은 것들이요. "task가 어렵다"는 정당화가
아니에요. 그건 그냥 compute를 더 쓰자는 논거이고, single-agent가 그걸 직접
흡수할 수 있어요.

**Liu et al.'s _[How Well Do Agentic Skills Work in the Wild](https://arxiv.org/abs/2604.04323)_**
(UCSB + MIT CSAIL)는 scale-awareness를 다른 각도에서 공격해요. Skill pool이
커지면 어떻게 되는가? 답은 skill **selection**이 bottleneck이 되고, 실행이
아니라는 거예요. Claude Opus 4.6을 SKILLSBENCH에서 돌린 수치:

| Challenge | 성능 비용 |
| --- | --- |
| Skill selection (agent가 load 여부를 선택) | −4.2pp |
| Distractor noise (관련 없는 skill 5개 섞임) | −7.7pp |
| 34K-skill pool에서의 retrieval | −11.1pp |
| Adaptation (curated skill이 없음) | −12.8pp |

Punchline은 distractor 결과예요. 올바른 skill 옆에 관련 없는 skill 5개가
놓이는 것만으로 상대 성능이 15% 떨어져요. 논문의 test set에서 더 약한
모델들 — Kimi K2.5, Qwen3.5 — 은 retrieved skill을 줬을 때 no-skill
baseline보다 **더 낮은** 성능을 냈어요. 관련 없는 skill이 오히려 모델을
오도한 거예요. Claude조차도 사용 가능한 curated skill을 전부 load하는
비율은 49%에 불과해요.

Retrieval quality가 지배적인 메커니즘이에요. Agentic hybrid search(iterative
query formulation + RRF 기반 BM25/dense hybrid)는 direct embedding lookup을
18.7 point 앞서요. Name과 description만이 아니라 SKILL.md 본문 전체를 indexing
하면 Recall@5에서 2 point가 붙어요. Query-specific refinement는 TERMINAL-BENCH
2.0에서 7.8pp를 recover해요 — 단, 초기 skill quality가 괜찮을 때만
(LLM-judge coverage score ≥ 3.83/5). Refinement는 multiplier지 generator가
아니에요. 없는 skill을 메워주지는 못해요.

두 논문이 공유하는 구조적 주장은 이거예요. 작은 규모에서 설계된 시스템에는
숨은 임계치가 있어요. Compute-equivalence 체크 없이 agent를 추가하면 정보가
늘어나는 게 아니라 latency만 늘어요. Retrieval-quality layer 없이 skill을
추가하면 capability가 아니라 noise만 늘어요. 20개 skill에서는 공짜였던 설계
선택이 46개에서는 더 이상 공짜가 아니에요.

가장 저렴한 countermove는 재구성이 아니에요. 측정이에요. 임계치가 이미 넘어섰는지
드러낼 quantity들을 tracking하기 시작해야 해요 — loading rate, wrong-skill-selection
count, per-team compute accounting 같은 것들이요. 이름 붙이지 않은 것은 shelf에
올릴 수도 없어요.

---

## Theme 2 — Bidirectional Flow

3B의 아키텍처는 대체로 한 방향을 가리켜요. Compaction은 일어나지만 decompression은
일어나지 않아요. Memory는 buffer에서 knowledge로 승격되지만 demote되지 않아요.
Verification은 outcome을 보고하지만 process는 따로 보고하지 않아요. 이번 배치의
세 논문이 말하는 건 반대 방향 — 거꾸로 그은 화살표 — 가 leverage가 있는
지점이라는 거예요.

**Rosset et al.'s _[The Art of Building Verifiers for Computer Use Agents](https://arxiv.org/abs/2604.06240)_**
(Microsoft Research)는 셋 중 가장 강력해요. 두 가지 baseline verifier — WebVoyager와
WebJudge — 의 false-positive rate는 각각 45%, 22%예요. 사람이라면 실패로 표시했을
상황에서 agent에게 성공 크레딧을 주는 비율이 대략 절반, 또는 4분의 1 정도라는
뜻이에요. 직관적인 수정 — 더 강한 LLM을 쓰자 — 은 경험적으로 틀렸어요.
WebVoyager의 backbone을 GPT-4o에서 GPT-5.2(Microsoft의 Universal Verifier를
구동하는 같은 모델)로 업그레이드하면 FPR은 45%에서 10%로 떨어지지만 FNR은
24%에서 44%로 올라가요. Cohen's κ는 0.31에서 0.44로 소폭 개선돼요. 같은 backbone
위의 Universal Verifier는 0.64를 찍어요. **차이는 아키텍처지, 모델 power가
아니에요.**

아키텍처는 4가지 설계 원칙이에요. Non-overlapping rubric criteria — 그리고
점수를 매기는 trajectory와 독립적으로 생성돼야 해요. 그렇지 않으면 scorer가
agent의 행동에 맞춰 criteria를 맞추게 되고 metric이 의미를 잃어요. Process와
outcome reward의 분리. Cascading-error-free 전략과 결합된 controllable vs.
uncontrollable 실패 귀인 — 그래서 초반의 통제 불가능한 stumble(CAPTCHA, 사이트
outage 등)이 전체 trajectory를 0점으로 만들지 않아요. Divide-and-conquer evidence
scoping — 각 criterion은 전체 trajectory를 한 번에 받는 게 아니라 가장 관련
있는 top-k evidence unit만 받아요.

반대 방향을 가장 명시적으로 지목하는 건 Principle 2예요. "agent가 올바른
step을 밟았는가"를 "agent가 목표를 달성했는가"와 독립적으로 점수 매겨요.
둘은 실제 상황에서 분기돼요 — 환경 때문에 막힌 옳은 step, 운 좋게 성공한
틀린 step, 예상치 못한 경로로 성공한 옳은 step. 둘을 섞으면 너무 관대하거나
(빈손의 노력에 크레딧) 너무 가혹한(환경 탓을 agent에게 돌림) signal이
나와요. Process와 outcome은 이론적으로도 실무적으로도 orthogonal해요.

**Kontonis et al.'s _[Memento](https://github.com/microsoft/memento)_**
(Microsoft Research)는 반대 방향 주장을 compression 쪽으로 옮겨요. 중요한
ablation은 §6.2.1에 있어요. 두 가지 inference mode가 같은 trained model을
쓰고, 동일한 memento text를 생성하고, 오직 원본 block이 visible할 때 계산된
KV cache entry를 유지하느냐 폐기하느냐에서만 차이가 나요. KV-discarding mode는
**AIME'24에서 15 percentage point를 잃어요(66.1% → 50.8%)**. 같은 요약 text,
같은 모델, 다른 residual signal.

여기서 일반화되는 설계 규칙은 이거예요. 나중에 참조하려고 compress할 때는,
요약이 포착하지 못하는 residual signal을 실어 나르는 parallel channel을 함께
유지하거나, 아니면 정확도 delta를 명시적으로 측정하고 compression ratio를
눈 뜨고 골라야 해요. 실패 모드는 _invisible loss_ — 측정 없이 compress하고
요약이 읽기 좋아 보였다는 이유만으로 충분히 좋았다고 가정하는 거예요.

**Qiao et al.'s _[Memory Intelligence Agent](https://arxiv.org/abs/2604.04503)_**
(ECNU + HIT)는 반대 방향 명제를 memory 자체로 확장해요. 중심 아키텍처는
Manager-Planner-Executor이고, parametric memory와 non-parametric memory가
동시에 업데이트돼요. §4.6의 ablation이 knowledge-base 설계자라면 누구나
불편해야 할 데이터 포인트를 하나 떨어뜨려요. Non-parametric memory를 Executor에
직접 물리면 memory 없을 때보다 **오히려** 정확도가 떨어져요(42.35% → 41.95%,
−0.4pp). 같은 memory를 전용 Planner를 거쳐 라우팅하면 +3.5pp가 회복돼요.
같은 memory, 다른 consumer예요.

어떤 retrieval layer에든 중요한 건 Qiao의 scoring 공식이에요.
Score(mᵢ) = 0.7 · similarity + 0.3 · value reward + 0.3 · **frequency reward**,
여기서 frequency reward는 명시적으로 1/(uᵢ+1)이에요. 이 항은 **낮은** 사용량을
보상해서, 오래된 long-tail entry가 surface될 수 있도록 유지해줘요. 이 항이 없으면
high-usage memory가 similarity hit과 value-reward weight를 모두 누적해서
rare-but-valuable entry를 익사시켜요. 시간이 지나면 시스템은 canonical memory
몇 개로 최적화되고, 나머지는 찾을 수 없게 돼요.

세 논문이 공유하는 구조적 주장은 one-directional 아키텍처가 reverse arrow를
하나 얹으면 사라질 ceiling에 부딪힌다는 거예요. Outcome-only verification은
모델의 stochastic variance를 상속해요 — process channel을 추가하면 독립적인
signal이 붙어요. Summarize-and-discard compression은 요약의 faithfulness를
상속해요 — retention channel을 추가하면 residual signal이 붙어요. Graduation-only
memory는 popularity bias를 상속해요 — demotion-or-diversity channel을 추가하면
long-tail의 discoverability가 붙어요.

공유하지 않는 건 구현 방식이에요. Rosset의 Universal Verifier는 Python 3,000줄에
prompt 2,000줄이고 multi-second latency로 offline에서 돌아가요. Kontonis의 Memento는
228K trace로 2단계 SFT 학습된 custom vLLM fork예요. Qiao의 MIA는 GRPO로 학습된
policy network로, inference 중에 test-time learning까지 해요. 그 machine 중 어느
것도 결정론적인 sub-100ms Python hook으로 돌아가는 file-based Zettelkasten에
직접 옮겨지지 않아요.

원칙은 옮겨져요.

---

## Theme 3 — Atomic Granularity

3B의 `skill-design-patterns.md`는 Pattern 2와 Pattern 3 자리를 비워둬요.
이번 배치의 한 논문이 Pattern 2가 무엇이 되어야 하는지를 제안해요.

**Ma et al.'s _[Scaling Coding Agents via Atomic Skills](https://arxiv.org/abs/2604.05013)_**
(HKUST + NUS)는 atomic skill을 3가지 all-or-nothing 속성을 만족하는 capability로
formalize해요. 첫째, 정확한 I/O 스펙 — skill의 type signature를 한 줄로 쓸 수
있어야 해요. 둘째, minimal ambiguity 하에서의 독립적 평가 가능성 — 출력이
정확한지 deterministic하게 자동 체크할 수 있어야 해요. TDD 호환성이 그
테스트예요. 셋째, building block으로 재사용 가능 — 같은 입출력 contract로 이
skill이 invoke될 distinct한 workflow를 최소 2개 이름 댈 수 있어야 해요. 셋 중
하나라도 빠지면 그 capability는 더 분해해야 할 후보이거나, 더 큰 skill
내부에 hard-code된 step으로 들어가야 할 대상이에요.

실험은 5가지 atomic coding-agent skill — code localization, code editing,
unit-test generation, issue reproduction, code review — 을 공유 trajectory
buffer에서 GRPO로 jointly 학습시키는 구조예요. 중요한 결과는 두 가지.

1. **Atomic skill 5개 + composite task 5개로 구성된 평가 set에서 joint RL은
   per-skill training 대비 18.7% 향상돼요.**
2. **Atomic-skill-trained 모델이 _unseen_ composite task(bug fixing, code
   refactoring, ML engineering, code security)로 더 잘 일반화돼요 — 그 composite
   task로 직접 학습된 모델보다.**

직관을 흔드는 건 두 번째 일반화 결과예요. Training을 deployment에 맞추는 게
기본 동작이에요 — bug fixing을 배포할 거면 bug fixing으로 학습시키자. Ma의
데이터는 그 직관이 틀렸다고 말해요. Atomic primitive는 전이되고, composite
training은 overfit돼요. Unseen composite로 일반화하는 길은 decomposition을
지나가지, 직접 imitation을 지나가지 않아요.

"Atomic"이 _아닌_ 조건이 무엇인지도 원칙 자체만큼이나 중요해요. Line count —
진짜로 atomic한 skill이 10줄일 수도, 진짜로 atomic한 workflow가 500줄일 수도
있어요. Surface area는 개념적 atomicity가 아니에요. Invocation 빈도 — 새
skill이나 rare specialist는 이 기준으로는 절대 qualify하지 못해요. Atomicity는
구조적이지 경험적이지 않아요. 팀 ownership — Conway's law 분해는 팀 재편과
함께 drift해요. 원칙은 의도적으로 외부에 있어요. Capability가 구조적 속성을
만족하는지를 묻지, 어떻게 느껴지는지를 묻지 않아요.

Minimal-tool corollary가 있어요. Ma는 RL agent의 action space를 `bash`와
`str_replace`로만 제한해요. 논거는 richer tool abstraction이 action space를
키우고 학습을 destabilize하며 "brittle or overlapping tool abstraction"을
도입한다는 거예요. 3B의 toolchain은 이 측정 기준에선 이미 minimal이에요.
Read, Write, Edit, Bash, Grep, Glob이 primitive이고, skill은 이것들을 DSL
수준 helper로 wrap하지 않고 compose해요. Ma의 결과는 3B가 감각으로 내렸던
설계 선택을 실증적으로 validate해요. 앞으로 skill을 작성할 때의 corollary는
이거예요. Helper 자체가 3가지 원칙을 통과하지 않는 한 skill-specific helper를
도입하지 말아요.

모든 skill이 atomic이어야 하는 건 아니에요. Exploratory skill — `/investigate`,
`/clarify`, `/storm` — 은 Principle 2를 의도적으로 위반해요. 그 skill의
가치가 모호한 narrative 출력 자체에 있기 때문이에요. 3B 라이브러리를 세
원칙으로 빠르게 감사해보면 대략 세 종류로 갈려요. Utility skill(`/commit`,
`/init-3b`, `/review-pr`)은 깔끔하게 atomic. Workflow skill(`/wrap`,
`/research-paper`)은 hybrid — 일부 sub-step은 별도의 atomic skill로 분리될
만해요. Exploratory skill은 설계상 non-atomic. 이 litmus test는 exploratory
class를 _나쁜_ 게 아니라 _다른_ 것으로 식별해줘요.

Atomic decomposition의 가시적인 pilot은 `/review-pr`이에요. 이미 7개
category — security, code quality, performance, architecture, test quality,
maintainability, deployment safety — 에 걸쳐 병렬 review agent 3개를 spawn
해요. 각 category가 primitive처럼 생겼어요. Joint-RL은 Claude처럼 frozen-weight
모델에는 적용되지 않지만, prompt 수준의 아날로그는 적용돼요. Category별
SKILL.md 분리에 composition orchestrator를 얹는 게 분명한 refactor예요. 그
refactor는 _이번 주에 일어나지 않아요_. Shelf에 올려요.

---

## 이번 배치가 드러낸 3B의 gap

각 theme은 3B의 구체적인 메커니즘에 대응돼요. 아래는 to-do list가 아니라
정직한 audit이에요. To-do list는 Pattern A가 만드는 거지, 이 포스트가 만드는
게 아니에요.

**Scale-Awareness gap.** `parallel-task-advisor.py`는 5가지 signal에 점수를
매기고, 총점이 5 임계치를 넘으면 team spawn을 권장해요. Compute-equivalence
gate가 없어요. Focused context를 가진 single agent로도 똑같이 효과를 볼 task가
순전히 signal density 때문에 multi-agent로 라우팅돼요. Tran의 DPI 논거로 보면
그건 category error예요 — agent를 추가해도 정보가 늘지 않고 coordination
overhead만 늘어요. Skill 쪽을 보면, 3B는 CLAUDE.md의 21 행짜리 수동 테이블로
라우팅해요. 46개 skill 규모에서 description만으로 매칭하는 방식이에요. Storm
(3B의 BM25+FTS5 search)은 knowledge entry만 index하고 skill은 index에 없어요.
`track-skill-usage.py`는 invocation count는 세지만 loading rate는 세지
않아요 — "이 prompt에서 올바른 skill이 load됐는가"에 대한 측정 자체가 없어요.
그 측정 없이는 Liu 스타일의 degradation이 일어나도 조용히 묻힐 거예요.

**Bidirectional Flow gap.** 3B는 3가지 verification surface를 돌려요 —
`stop-verification-hook.py`(binary), `post-implementation-review-hook.py`
(12개 category에서 ≥8 scoring), `verification-before-completion` skill
(instruction-based). 어느 것도 process와 outcome을 분리하지 않아요. 어느
것도 false-positive rate를 tracking하지 않아요. Post-implementation hook의
12개 scoring category는 overlap 여부가 감사된 적이 없는데, 겉보기에도
overlap이 보여요. "code quality"와 "maintainability"; "tests added"와
"test coverage"; "error handling"과 "edge cases". Rosset의 Principle 1 —
non-overlapping criteria와 독립적 생성 — 이 만족되지 않아요.

3B의 context compression은 전적으로 passive해요. `PreCompact` hook 이벤트는
존재하지만 사용되지 않아요. `reference/context-tiering-model.md`의 tiering
모델은 static해요. 파일은 tier 간을 수동으로 migrate돼요. Self-directed
compression 메커니즘이 없고, Kontonis의 Rule 1 기준으로 parallel retention
channel도 없어요 — tier는 destructive move이지 dual-channel이 아니에요.
기존의 passive compaction이 주는 accuracy delta도 측정된 적이 없어요.
Kontonis의 경고로 보면 이건 정의상 invisible-loss regime이에요.

Auto-memory는 한 방향으로만 승격돼요. buffer → memory → knowledge → rule.
`knowledge-staleness-hook.py`는 90일이라는 고정 임계치를 써요. 첫 batch가
4월 23일 즈음에 걸려요. Retrieval signal이 어떤 entry가 더 이상 제 몫을
못한다고 말해줘도 demote할 경로가 없어요. Retrieval scoring은 사실상 similarity
더하기 recency예요 — diversity 항도 없고, anti-popularity 메커니즘도 없어요.
Qiao의 cold-start 취약성(새로 만든 고비용 entry가 첫 사용 전까지 value reward
0점) 이 3B에도 있고, 완화되지 않았어요.

**Atomic Granularity gap.** `skill-design-patterns.md`는 Pattern 1(Phase 0
checklist)만 ship된 상태이고 Pattern 2, 3은 예약되어 있어요. 공식 decomposition
기준이 없어요. Skill quality는 저자의 감각으로 판단돼요. `/review-pr`의
decomposition 기회는 눈에 보이지만 실행되지 않은 상태예요. Minimal-tool
원칙은 우연히 이미 만족돼요(3B가 DSL helper를 추가하지 않았기 때문에).
다만 설계 commitment로 문서화되진 않았어요.

이 audit의 모양 자체가 signal이에요. 대부분의 gap은 _측정의 부재_ 지, 구현의
부재가 아니에요. 측정되지 않은 것은 고칠 수 없어요. 이 theme들이 recur할 때의
가장 저렴한 Pattern A countermove는 구현이 아니라 측정을 붙이는 일일
거예요.

---

## 왜 3B는 이번 주에 아무것도 적용하지 않는가

논문 6편을 읽고 그중 0편도 적용하지 않은 건 누락이 아니라 선택이에요.
Pattern A — theme saturation — 은 단일 논문의 주장을 mandate가 아니라
hypothesis로 대해요. Hypothesis는 둘 중 하나가 일어날 때 졸업해요. 다음
weekly cycle에서 다른 독립적인 source가 같은 theme을 보강하거나(convergence),
3B 자체에서 관찰된 friction이 그걸 validate하거나(경험적 보강). Signal 하나만
가지고는 계속 shelf에 있어요.

이 reasoning은 두 가지 실패 모드에 대한 방어예요. 첫째는 **hype absorption** —
모든 논문의 주장을 구현하면, 자기 자신의 제약이 아니라 publication schedule에
맞춰진 시스템이 만들어져요. 동시에 출판되는 논문들은 유행 topic에 cluster
돼요. 그걸 전부 구현하는 시스템은 그 clustering을 상속하고, 시간이 지나면
coherence를 잃어요. 둘째는 **sunk-cost inflation** — 성급하게 commit된 구현은
되돌리기 비싸져요. 3B는 300 session이 넘는 friction-log 근거로, 문제가 recur
하기 전에 commit된 아키텍처 변경은 의도치 않은 이유로 load-bearing이 되곤
한다는 걸 알고 있어요. Rollback이 원래 commit보다 더 어려워져요.

Pattern A는 filter예요. Skill-retrieval degradation을 주장하는 논문 하나는
data point예요. 다른 팀이 다른 도메인에서 같은 curve를 확인하는 두 번째 논문은
signal이에요. 실제 session에서 관찰된 friction — Claude가 실제 task에서 맞는
skill을 load하지 못하고 friction log에 잡히는 것 — 은 validation이에요. 그
둘 중 어느 조합이든 주장이 shelf에서 implementation queue로 졸업해요.

운영 discipline은 기계적이에요. 논문이 theme을 제시하면 shelf에 source, 근거
강도, shelved upgrade target, 졸업 기준과 함께 로그해요. 계속 읽어요. 다음
weekly cycle에서 돌아와요. Theme이 recur하면 승격. 아니면 shelf에 두고
6개월 cadence로 회의적으로 다시 읽어요 — hype cycle이 지났다면 그것 자체가
유용한 signal이에요.

이 discipline의 비용은 3B가 paper feed보다 느리게 움직인다는 거예요. 이익은
3B에서 실제로 바뀌는 부분이 novelty가 아니라 근거를 싣고 있다는 거예요.
논문 6편, 적용 0개는 feed가 뜨거운 주에 discipline이 어떻게 생겼는지 보여주는
거예요.

---

## 3B가 shelf에 올리고 지켜볼 것

각 theme은 `projects/3b/reference/forge-shelf-log.md`에 source paper, 근거
강도, shelved upgrade target, 졸업 기준을 담은 entry로 들어가요. 미리 보기:

| Shelf theme | Source | 근거 | Key shelved target |
| --- | --- | --- | --- |
| Scale-Awareness | Tran + Liu | Medium | `parallel-task-advisor.py`의 compute-equivalence gate; skill 라우팅의 retrieval-quality layer |
| Unified Verification | Rosset | Strong | Process/outcome-split verification을 위한 ADR-009 후보; hook 전반의 false-positive tracking |
| Context Compression | Kontonis | Soft | PreCompact hook 설계; compression-aware tiering; 기존 passive compaction의 측정된 accuracy delta |
| Memory Demotion | Qiao | Soft | Auto-memory의 bidirectional flow; retrieval scoring의 diversity 항; cold-start 보호 |
| Atomic Granularity | Ma | Medium | `skill-design-patterns.md`의 Pattern 2; `/review-pr` decomposition pilot |

근거 강도는 theme이 recur할 가능성에 대한 calibration이에요. **Strong**은 그
논문이 같은 주장을 하는 세 번째 또는 네 번째 독립 source라는 뜻이에요 —
Rosset의 process/outcome 분리는 기존 verification 문헌과 충분히 가까워서
이미 작은 convergence로 집계돼요. **Medium**은 논문이 강한 empirics를 가진
새로운 구조적 주장을 하지만, 3B의 reading list에서 theme이 아직 recur하지
않았다는 뜻이에요. **Soft**는 그 형태의 theme을 다루는 첫 실질적 source라는
뜻이에요. 하나의 독립 source가 더 생기면 medium으로 승격돼요.

**공유되는 졸업 기준:** shelved target은 (a) 다음 weekly cycle에서 같은 theme을
일관된 방향으로 보강하는 논문이 등장하거나, OR (b) 3B에서 실제로 관찰된
friction이 그걸 보강할 때 구현돼요. 논문 하나만으로는 구현되지 않아요.

**반대 기준:** 이 theme 중 어느 것도 v1.8까지 — 지금부터 대략 4 weekly
cycle — recur하지 않으면 회의적으로 다시 읽어요. 어쩌면 hype cycle이
지났을 수 있어요. 어쩌면 그 thesis가 논문 고유 도메인에만 좁게 적용되었던
것일 수 있어요. Shelf log는 lease지 영구 저장소가 아니에요.

v1.5 cycle은 shelf가 작성되고, 3B 파일은 아무것도 재구조화되지 않은 상태로
닫혀요. 다음 weekly cycle(v1.6)은 월요일에 새 DAIR.AI 배치로 시작해요.
논문 6편 읽음, 적용 0개, 정책 응답 1개, shelf 1개 populated, 전이 가능한
concept 6개가 graph에 추출됨. 앞으로 측정해야 할 건 세 cycle 뒤에도 Pattern A가
깔끔하게 돌고 있는지예요 — shelved theme이 근거 위에서 졸업하고 있는지,
아니면 다른 누구도 그 주제로 글을 쓰지 않아서 조용히 노화되고 있는지.
