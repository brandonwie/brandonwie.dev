---
title: 'CLAUDE.md가 자꾸 넘칠 땐, budget을 generator로 옮기세요'
description: >-
  trim할 때마다 몇 주 뒤면 "Large CLAUDE.md will impact performance" 경고가 돌아왔어요.
  byte budget을 author discipline에서 파일을 조립하는 generator로 옮기고 나서야 — per-rule
  warning, total hard-fail, rendered-file ceiling으로 — 완전히 멈췄어요.
date: 2026-05-13T00:00:00.000Z
updated: '2026-08-02'
tags:
  - devops
  - claude-code
  - transferable
category: devops
draft: false
lang: ko
source_lang: en
source_slug: claude-md-byte-budget-generator-gate
source_updated: '2026-08-02'
translation_date: '2026-06-14'
---

CLAUDE.md 같은 always-on 컨텍스트 파일은 trim해도 시간이 지나면 다시 부풀어 올라요. 한 번 줄여서 경고가 사라져도, 몇 주 뒤면 어김없이 돌아왔어요. 두 번째로 같은 일을 겪고 나서야 trim을 멈추고, 방금 줄인 파일이 왜 자꾸 선을 넘어 다시 자라는지 찾아 나섰어요.

always-on 컨텍스트 파일을 로드하는 agent 도구들 — Claude Code의 `CLAUDE.md`, Codex의 `AGENTS.md`, Gemini의 `GEMINI.md` — 은 그 파일을 [모든 세션의 컨텍스트 윈도우](https://code.claude.com/docs/en/memory)에 넣어요. 그게 이 파일의 핵심이고, 동시에 유한한 budget이에요. Claude Code는 파일이 커지면 세션 시작 때 성능 경고를 띄워요. 제 셋업에선 4만 자 근처에서 "Large CLAUDE.md will impact performance"를 보기 시작했어요.

## 손으로 관리하는 걸로는 부족했던 이유

제 `CLAUDE.md`는 손으로 쓴 게 아니에요. generator가 여러 rule 파일에서 조립하는데, always-on으로 표시한 것들을 auto-generated 블록에 inline해요. 바로 그 구조가 손으로 관리하는 방식이 실패한 이유예요. always-on rule을 편집할 때마다 total이 조금씩 밀리고, 어떤 한 편집도 문제처럼 보이지 않고, rule 하나를 편집하는 동안 누구도 누적 크기를 못 봐요. 유일한 피드백은 성능 경고인데 — 그건 _세션 시작_ 때, 보통 밀어 넘긴 편집 며칠 _후에_ 떠요. 한 번의 trim은 여유를 벌었지만, "이 rule도 always-on으로 하자"는 다음 물결이 그 여유를 조용히 깎아먹었고, 경고는 2주 뒤에 어김없이 다시 나타났어요.

그래서 진짜 문제는 "파일이 지금 너무 크다"가 아니었어요. "회귀가 도입되는 순간이 아니라 세션 시작에 잡힌다"였죠. 저는 budget이 들어오는 시점에 — rule이 추가되거나 자랄 때 — 강제되길 원했지, 다음 재시작 후가 아니라요.

## 막다른 길들

뻔한 fix는 rule 하나당 크기 상한을 두는 거예요. N 바이트 넘는 always-on rule 하나를 거부하는 거죠. 현실과 부딪치면 못 버텨요. 제 가장 큰 정당한 always-on rule이 7.3 KB쯤인데 제가 재구조화할 수 없는 off-limits 경계 뒤에 잠겨 있어서, 5 KB 상한은 정작 그 rule에서 먼저 걸려요 — gate가 고칠 수 없는 rule을 막아 세우는 셈이죠. 그리고 작동하는 상한조차 실제 실패 모드를 놓쳐요. 그건 _누적_이거든요. 상한 아래로 편안한 rule 열 개도 합치면 over-budget 파일이 돼요.

한참을 헤매게 만든 신호도 하나 있었어요. 제 pre-commit hook이 generator _후에_ formatter를 돌려서, generator가 깨끗한 출력을 내면 formatter가 그걸 다시 줄바꿈하고, 다음 실행이 그 차이를 "drift"라며 불평했어요. budget을 손보는 일이 그 순서를 먼저 고치는 일과 엉켜 있었죠.

## gate가 셋인 이유, 회귀가 들어오는 길이 셋이라서

실제로 버틴 건 budget을 세 개의 별도 체크로 취급하는 거였어요. 각각 파일이 자라는 다른 방식을 잡아요.

- **rule별 권고 경고** — 너무 큰 rule이 커밋을 막지 않으면서 스스로 티를 내게 하고,
- always-on body 합계에 대한 **전체 hard-fail** — rule별 체크가 못 보는 누적 재성장을 잡고,
- 최종 출력에 대한 **렌더링 파일 상한** — 생성 블록 _바깥_ header나 tail을 손으로 고쳐 커진 부분을 잡아요. 앞의 둘은 이걸 못 봐요.

셋 다 **쓰기 전에** 돌아서, 잘못된 state가 애초에 디스크에 안 닿아요. 제 generator에선 상수 셋이랑 검증 블록 둘이에요.

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

숫자는 제 거지 보편적인 게 아니에요. 전체 상한은 제가 실제로 들고 다니는 always-on body 합계에 맞췄고, 렌더링 상한은 wrapper 텍스트 여유를 위해 경고 임계값보다 몇 KB 아래에 잡았어요. 핵심은 상수가 아니라 — 여기서 `throw` 한 줄이면 충분하다는 거예요. 제 pre-commit hook이 이미 generator를 돌리고 0이 아닌 종료 코드를 막힌 커밋으로 그대로 전달하거든요. hook을 새로 깔 일은 없어요. generator가 실패하는 게 _곧_ gate예요.

직접 만든다면 빠지기 쉬운 함정이 둘 있어요. rule별 WARN은 반드시 권고(exit 0)여야 해요. 안 그러면 조금 크지만 정당한 rule마다 커밋이 막히고, bypass 플래그에 손이 가서 전체 취지가 무너져요. 그리고 크기를 합칠 때 속성 이름을 조심하세요 — rule 객체에서 잘못된 속성을 읽어서 `Buffer.byteLength(undefined)`로 한참을 날렸고, 에러가 너무 뭉뚱그려져 있어서 엉뚱한 방향만 쫓았거든요.

## 그래서 얻은 것

이렇게 붙여 두고 나니, 제 always-on 파일이 35 KB쯤에 안착했어요 — 경고 임계값보다 대략 5 KB 아래로요. 넘쳤던 부분은 always-on이지만 그럴 필요 없던 rule 셋에서 왔어요. 그 셋을 lazy-load(inline 대신 필요할 때 불러오기)로 바꾸고, budget이 한계에 닿지 않은 _다른_ agent들엔 그대로 always-on으로 뒀어요. 각 도구의 budget은 독립적이거든요. 경고는 다시 안 왔어요. 다음에 뭔가 total을 넘기면, 사흘 뒤 세션이 아니라 그걸 도입하는 커밋이 바로 실패하니까요.

## 언제 가치 있나(그리고 아닐 때)

크기를 서로 맞추지 않는 여러 사람이 여러 조각을 모아 always-on 컨텍스트를 만들고, 줄였다 다시 부푸는 사이클을 적어도 한 번 봤다면 값을 해요. 반대로 파일을 한 사람이 손으로 쓰고 매 편집마다 전체를 본다면, 그 시각적 피드백이 이미 gate예요. 그리고 rule이 always inline이 아니라 lazy-load라면, budget은 per-fetch지 누적이 아니라서, 합칠 게 없어요. 피해야 할 단 하나의 조합은 항목별 체크 하나만 두는 거예요 — 전체 gate나 렌더링 상한 없이는, 누적과 블록 바깥 성장 둘 다 그냥 통과해 버리거든요.

## 정리하면

생성된 always-on 파일이 자꾸 넘치면, fix는 보통 또 한 번의 trim이 아니라 — budget을 손에 맡기는 대신 generator로 옮기고, 쓰기 전에 강제해서 회귀가 다음 세션 시작이 아니라 들어오는 그 순간에 실패하게 하는 거예요. 항목별 신호를 전체 gate랑 짝지으세요. 정작 발목을 잡는 실패는 어떤 단일 편집도 자기 탓처럼 보이지 않는 바로 그거니까요.

## References

- [Claude Code memory — how CLAUDE.md loads into every session's context](https://code.claude.com/docs/en/memory)
