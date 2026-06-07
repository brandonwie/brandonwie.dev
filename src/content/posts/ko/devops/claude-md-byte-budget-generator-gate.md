---
title: 'CLAUDE.md가 자꾸 넘칠 땐, budget을 generator로 옮기세요'
description: >-
  trim할 때마다 몇 주 뒤면 "Large CLAUDE.md will impact performance" 경고가 돌아왔어요.
  byte budget을 author discipline에서 파일을 조립하는 generator로 옮기고 나서야 — per-rule
  warning, total hard-fail, rendered-file ceiling으로 — 완전히 멈췄어요.
date: 2026-05-13T00:00:00.000Z
updated: '2026-06-07'
tags:
  - devops
  - claude-code
  - transferable
category: devops
draft: false
lang: ko
source_lang: en
source_slug: claude-md-byte-budget-generator-gate
source_updated: '2026-06-07'
translation_date: '2026-06-07'
---

always-on 컨텍스트 파일을 로드하는 agent 도구들 — Claude Code의 `CLAUDE.md`, Codex의 `AGENTS.md`, Gemini의 `GEMINI.md` — 은 그 파일을 [모든 세션의 컨텍스트 윈도우](https://docs.anthropic.com/en/docs/claude-code/memory)에 넣어요. 그게 이 파일의 핵심이고, 동시에 유한한 budget이에요. Claude Code는 파일이 커지면 session-start 성능 경고를 띄워요. 제 셋업에선 4만 자 근처에서 "Large CLAUDE.md will impact performance"를 보기 시작했어요.

파일을 trim했고, 경고가 사라졌고, 몇 주 뒤에 다시 나타났어요. 또 trim했죠. 같은 결과. 두 번째 라운드 후에 trim을 그만두고, 방금 줄인 파일이 왜 자꾸 선을 넘어 다시 자라는지 찾아 나섰어요.

## author discipline으로는 부족했던 이유

제 `CLAUDE.md`는 손으로 쓴 게 아니에요. generator가 여러 rule 파일에서 조립하는데, always-on으로 표시한 것들을 auto-generated 블록에 inline해요. 바로 그 구조가 discipline이 실패한 이유예요: always-on rule을 편집할 때마다 total이 조금씩 밀리고, 어떤 한 편집도 문제처럼 보이지 않고, rule 하나를 편집하는 동안 누구도 누적 크기를 못 봐요. 유일한 피드백은 성능 경고인데 — 그건 _세션 시작_ 때, 보통 밀어 넘긴 편집 며칠 _후에_ 떠요. 한 번의 trim은 여유를 벌었지만, 다음 "이 rule도 always-on으로 하자" 물결이 그 여유를 조용히 먹었고, 경고는 2주 뒤에 시계처럼 돌아왔어요.

그래서 진짜 문제는 "파일이 지금 너무 크다"가 아니었어요. "회귀가 도입되는 순간이 아니라 세션 시작에 잡힌다"였죠. 저는 budget이 admission time에 — rule이 추가되거나 자랄 때 — 강제되길 원했지, 다음 재시작 후가 아니라요.

## dead end들

뻔한 fix는 hard per-rule cap이에요: N 바이트 넘는 always-on rule 하나를 거부하는 거죠. 현실과 부딪치면 못 버텨요. 제 가장 큰 정당한 always-on rule이 7.3 KB쯤인데 제가 재구조화할 수 없는 off-limits 경계 뒤에 잠겨 있어서, 5 KB per-rule cap은 자기 자신을 막아버려요 — gate가 고칠 수 없는 rule에서 실패해요. 그리고 작동하는 per-rule cap조차 실제 실패 모드를 놓쳐요. 그건 _누적_이거든요: cap 아래로 편안한 rule 열 개도 합치면 over-budget 파일이 돼요.

debugging loop를 잡아먹은 오해의 신호도 있었어요: 제 pre-commit hook이 generator _후에_ formatter를 돌려서, generator가 깨끗한 출력을 내면 formatter가 그걸 reflow하고, 다음 실행이 "drift"를 보고 불평했어요. budget fix가 그 순서를 먼저 고치는 일이랑 엉켜 있었죠.

## 세 개의 gate, 회귀 vector가 셋이니까

실제로 버틴 건 budget을 세 개의 별도 체크로 취급하는 거였어요. 각각 파일이 자라는 다른 방식을 잡아요:

- **per-rule advisory warning** — 너무 큰 rule이 커밋을 막지 않으면서 스스로 알리게,
- always-on body 합계에 대한 **total hard-fail** — per-rule 체크가 못 보는 누적 재성장,
- 최종 출력에 대한 **rendered-file ceiling** — 생성 블록 _바깥_ header/tail의 손편집 성장으로, 나머지 둘에게 안 보이는 것.

셋 다 **pre-write**로 돌아서, 나쁜 state가 애초에 디스크에 안 닿아요. 제 generator에선 상수 셋이랑 검증 블록 둘이에요:

```js
const UNIVERSAL_RULE_WARN_BYTES = 5000; // per-rule advisory (stderr WARN, exit 0)
const UNIVERSAL_TOTAL_MAX_BYTES = 30000; // sum of always-on bodies — hard fail
const CLAUDE_TEMPLATE_MAX_BYTES = 38000; // rendered file — hard fail
```

```js
let totalBytes = 0;
const offenders = [];
for (const r of alwaysOnRules) {
  const size = Buffer.byteLength(r.body, "utf8");
  totalBytes += size;
  if (size > UNIVERSAL_RULE_WARN_BYTES) {
    process.stderr.write(
      `[gen] WARN ${r.file} body ${size}b > ${UNIVERSAL_RULE_WARN_BYTES} ` +
        `(advisory; consider splitting or making it lazy-load)\n`
    );
  }
  offenders.push({ file: r.file, size });
}
if (totalBytes > UNIVERSAL_TOTAL_MAX_BYTES) {
  offenders.sort((a, b) => b.size - a.size);
  const top3 = offenders.slice(0, 3).map((o) => `  - ${o.file}: ${o.size}b`).join("\n");
  throw new Error(
    `[gen] always-on total ${totalBytes}b > ${UNIVERSAL_TOTAL_MAX_BYTES} budget.\n` +
      `Top offenders:\n${top3}\nRemediate: make a rule lazy-load.`
  );
}
```

```js
// Before writing the rendered file:
const renderedBytes = Buffer.byteLength(rendered, "utf8");
if (renderedBytes > CLAUDE_TEMPLATE_MAX_BYTES) {
  throw new Error(
    `[gen] rendered ${renderedBytes}b > ${CLAUDE_TEMPLATE_MAX_BYTES} ceiling ` +
      `(tool warns around 40000). No write performed.`
  );
}
```

숫자는 제 거지 보편적인 게 아니에요: total cap은 제가 실제로 들고 다니는 always-on body 합계에 맞췄고, rendered ceiling은 wrapper 텍스트 여유를 위해 경고 임계값보다 몇 KB 아래에 앉혀요. 핵심은 상수가 아니라 — 여기서 `throw`면 충분하다는 거예요. 제 pre-commit hook이 이미 generator를 돌리고 non-zero exit을 막힌 커밋으로 전파하거든요. 새 hook 배관은 없어요. generator가 실패하는 게 _곧_ gate예요.

직접 만든다면 작은 함정 둘. per-rule WARN은 advisory(exit 0)여야 해요. 안 그러면 조금 크지만 정당한 rule마다 커밋이 막히고, bypass 플래그에 손이 가서 전체 취지가 무너져요. 그리고 크기를 합칠 때 field 이름을 조심하세요 — rule 객체에서 잘못된 property를 읽어서 `Buffer.byteLength(undefined)`에 진짜 시간을 썼고, 에러가 충분히 generic해서 엉뚱한 방향으로 쫓았어요.

## 얻은 것

배선한 뒤, 제 always-on 파일이 35 KB쯤에 안착했어요 — 경고 임계값보다 대략 5 KB 아래로, over-budget state는 always-on이지만 그럴 필요 없던 rule 셋에서 왔어요. 걔들을 lazy-load(inline 대신 on-demand fetch)로 바꾸고, budget이 절벽에 있지 않던 _다른_ agent들엔 always-on으로 뒀어요. 각 도구의 budget은 독립적이거든요. 경고는 다시 안 왔어요. 다음에 뭔가 total을 넘기면, 사흘 뒤 세션이 아니라 그걸 도입하는 커밋이 실패하니까요.

## 언제 가치 있나(그리고 아닐 때)

always-on 컨텍스트 표면이 크기를 조율하지 않는 여러 기여자에 의해 여러 조각에서 조립되고, trim-후-재성장 사이클을 적어도 한 번 봤다면 값을 해요. 파일을 한 사람이 손으로 쓰고 매 편집마다 전체를 본다면, 그 시각적 피드백이 이미 gate예요. 그리고 rule이 always inline이 아니라 lazy-load라면, budget은 per-fetch지 누적이 아니라서, 합칠 게 없어요. 피해야 할 단 하나의 조합은 per-item 체크 단독이에요 — total gate나 rendered ceiling 없이는, 누적과 out-of-band 성장 둘 다 그 옆을 그냥 지나가요.

## takeaway

생성된 always-on 파일이 자꾸 넘치면, fix는 보통 또 한 번의 trim이 아니라 — budget을 author discipline에서 generator로 옮기고, pre-write로 강제해서 회귀가 다음 세션 시작이 아니라 admission time에 실패하게 하는 거예요. per-item 신호를 total gate랑 짝지으세요. 실제로 무는 실패 모드는 어떤 단일 편집도 책임져 보이지 않는 바로 그거니까요.

## References

- [Claude Code memory — how CLAUDE.md loads into every session's context](https://docs.anthropic.com/en/docs/claude-code/memory)
