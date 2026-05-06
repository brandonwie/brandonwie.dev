---
title: Anthropic Prompt Cache TTL + 비용 메커니즘
description: 'Anthropic이 2026년 3월 초경 Claude Code의 prompt-cache TTL을 1시간에서 5분으로 silently 떨어뜨렸어요. explicit awareness 없이는, message 사이의 ≥5분 idle gap이 cache를 evaporate시키고 다음 message에 full cold cache-write를 강제해요 — entire conversation prefix에 대해 base input의 1.25× 요금.'
date: 2026-05-03T00:00:00.000Z
updated: '2026-05-06'
tags:
  - knowledge
  - devops
  - ai-ml
  - claude-code
category: devops
draft: false
lang: ko
source_lang: en
source_slug: anthropic-prompt-cache-ttl
source_updated: 2026-05-06T00:00:00.000Z
translation_date: '2026-05-06'
---

Anthropic이 2026년 3월 초경 Claude Code의 prompt-cache TTL을 1시간에서 5분으로 silently 떨어뜨렸어요([issue #46829](https://github.com/anthropics/claude-code/issues/46829)). explicit awareness 없이는, message 사이의 ≥5분 idle gap이 cache를 evaporate시키고 다음 message에 full cold cache-write를 강제해요 — **entire conversation prefix**(system prompt + tools + CLAUDE.md + 모든 prior turn)에 base input의 1.25× 요금. 200K-token Opus session에서는 resume당 ~$1.25; working day 전체에서 per-session 비용을 30–60% 올릴 수 있어요.

regression 전에는 message 사이 1h+ session도 warm 유지됐어요. regression 후에는, walking-away 패턴(점심, 미팅, focus block)이 진짜 돈이 들어요 — 그리고 announcement도, release-note line도, banner도 없어서 많은 user가 알아채지 못했어요.

## Cache 메커니즘, 검증된 것

### TTL options

| TTL   | Default?                                                  | Refresh behavior                                                                           |
| ----- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 5 min | YES (post-2026-03 regression)                             | 매 cache hit이 timer reset(sliding window). active session은 영원히 warm 유지.            |
| 1 h   | API request에 `cache_control: { ttl: "1h" }`로 opt-in     | 같은 sliding-window behavior, 더 긴 dead-clock. Claude Code에서 user-selectable 안 함.    |

### Pricing multiplier (vs base input)

| Operation                      | base input 대비 multiplier |
| ------------------------------ | -------------------------- |
| Cache **read** (hit)           | **0.10×** (10%)            |
| hit 시 Cache **refresh**       | 0.10× (read와 동일)        |
| 5m cache **write** (cold/miss) | **1.25×**                  |
| 1h cache **write** (cold/miss) | **2.00×**                  |

Claude Opus 4.7 숫자: base input \$5/MTok, 5m write \$6.25, 1h write \$10, read/refresh \$0.50, output \$25.

### "5m vs 1h가 2x 비싸다"가 실제로 의미하는 것

user discussion에서 도는 "2×" 주장은 1h cache **write**를 **uncached base input**과 비교한 거예요(2.0× vs 1.0×). 1h write 대 5m write 비율은 1.6×(2.0 / 1.25)예요. 둘 다 비교 frame에 따라 옳아요. "2×" framing은 uncached와 비교할 때만 의미 있어요.

## cache를 invalidate시키는 것

cache key는 full prefix의 in-order hash예요: system prompt + tool definition + CLAUDE.md + conversation history. 어느 부분이든 변경하면 그 지점부터 끝까지 invalidate해요.

| Change                                       | Effect                                                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CLAUDE.md`를 mid-session에 edit             | Prefix 변경 → 모든 cache 죽음 → 모든 후속 message reprocess                                                                                       |
| MCP server를 mid-session에 add/remove         | Tool def 변경 → full invalidation. **Claude Code 디자인이 startup에 tool list lock**으로 방지.                                                    |
| Model 전환 (Opus ↔ Sonnet)                   | Different model = different cache. `tool_choice` 변경도 invalidate.                                                                              |
| System prompt에 timestamp / dynamic content   | 매 turn마다 prefix 다름 → 절대 hit 안 함                                                                                                          |
| `/compact`                                   | **Safe** — Claude Code가 same cached prefix(system + tools + CLAUDE.md) 후에 conversation summary를 rebuild. Prefix reuse는 의도적.              |
| `/clear`                                     | session wipe, 다음 message는 cold                                                                                                                 |

## Claude Code 디자인이 cache에 강하게 의존하는 이유

Thariq Shihipar(Claude Code 엔지니어)에 따르면 — prompt caching이 product가 빌드된 architectural constraint예요. cache hit rate가 떨어지면 SEV declare해요. cache 이유로 존재하는 구체적 디자인 선택:

1. **Tool list가 session start에 locked.** Mid-session에 MCP tool 추가는 prefix 변경 → 모든 것 invalidate. Claude Code는 startup 후 새 tool register 거부.
2. **Plan mode가 swap 대신 add.** Plan mode가 빌드될 때, obvious 디자인은 "read-only tool로 swap"이었어요. Cache-aware 디자인: 모든 tool을 prompt에 항상 keep; `EnterPlanMode`와 `ExitPlanMode`를 추가 tool로 add; mode change를 user message로 send. Plan mode와 normal mode 간 tool def가 절대 안 바뀜.
3. **Compaction이 rebuild가 아니라 fork.** Compaction request가 현재 conversation과 동일한 prefix(같은 system prompt, tools, CLAUDE.md) 사용. messages portion만 summarize. Prefix KV cache 재사용.

prompt caching 없으면 100-turn Opus coding session이 input token에 \$50–\$100 들 수 있어요. 90% hit rate면 ~\$10–\$19. 이 economics가 Claude Code Pro(\$20/mo)를 viable하게 만드는 이유예요.

## Opus 4.7 200K-token prefix에 대한 비용 계산

| Scenario                                | Cost                                              |
| --------------------------------------- | ------------------------------------------------- |
| 5min idle 후 resume 시 cold write       | 200K × \$6.25/MTok = **\$1.25**                   |
| 후속 in-window message                   | 200K × \$0.50/MTok = \$0.10                       |
| 12 ping/hr (cache-keepalive idle)       | 12 × ~\$0.10 = \$1.20/hr (keepalive 사용 시)      |
| keepalive 없는 10-resume day             | ~\$12.50 그냥 cold-write tax로                    |
| cache-keepalive 사용 같은 session        | ~\$5/day (continuous warm)                        |

Pro/Max subscriber: cache miss는 \$를 청구하지 않지만(flat fee), rate-limit(5hr / weekly Opus quota) 소비. 높은 cache miss rate가 quota를 더 빨리 태워요.

## Claude Code에서 user가 control할 수 있는 비용 lever

| Lever                                  | Action                                                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Session active 유지                     | Mid-task에 cache expire 안 시킴. 알려진 break 전에 filler turn 입력하거나 cache-keepalive 설치(related 참고).                 |
| Slim CLAUDE.md                         | session start에 load → cached prefix에 영원히 sit. Workflow detail을 invoke 시 lazy-load되는 **skill**로 이동.                |
| MCP server를 up front lock              | Mid-session에 server toggle 안 함. `.mcp.json`을 한 번 configure.                                                              |
| Per-session model pin                   | 한 task 안에서 Opus ↔ Sonnet switch 안 함.                                                                                     |
| Verbose op에 subagent                   | Heavy file read / log dump → subagent. Verbose token이 subagent context에 머물고, summary만 return.                          |
| `/compact`은 fine                       | Cache-aware로 디자인됨. Context 채워지면 자유롭게 사용.                                                                        |
| `/usage` 모니터                         | Cache hit ratio가 90% 미만 = 뭔가 prefix invalidate. 조사.                                                                    |
| 필요 없으면 agent team 회피              | Solo session 대비 ~7× token (각 teammate가 own context).                                                                      |
| 무관한 task에 새 session 시작            | Stale conversation = 90% hit에서도 매 turn 더 큰 cache write.                                                                  |

## API layer에서 TTL 섞기

1h와 5m이 single API request에서 공존 가능. 제약: **1h cache entry가 5m entry보다 prefix에서 앞서야 함**. Billing은 세 위치로 partition: `A`(highest cache hit), `B`(A 후 highest 1h breakpoint), `C`(last cache breakpoint). 청구: `A`에 read, `(B - A)`에 1h write, `(C - B)`에 5m write.

Claude Code user에겐 moot — Anthropic이 5m default를 선택했고 TTL flip 플래그를 노출 안 함. API user는 breakpoint별 `ttl: "1h"` 설정 가능.

## Cache awareness가 중요하지 않은 상황

- One-off short session(30K token 미만, single message exchange).
- Prefix invalidation이 unavoidable한 session(rapid CLAUDE.md iteration, MCP debugging).
- Rate limit에 절대 다가가지 않는 Pro/Max subscriber — cache miss는 rate-limit만 비용, \$ 아님.

## 실용적인 takeaway

Cache TTL regression은 silent하고 비용은 진짜예요 — 200K-token Opus session에서 cold-write당 \$1.25, 그리고 5분을 넘기는 idle gap 수만큼 곱해요. user-controllable lever: session active 유지(filler turn이나 keepalive), CLAUDE.md slim(workflow detail을 lazy-loaded skill로 이동), MCP server up front lock, per-session model pin, verbose op에 subagent 사용해서 heavy token이 cached prefix에 절대 안 들어가게. `/compact`은 디자인상 cache-safe — 사용. `/usage`에서 90% 미만 cache hit ratio 감시; setup의 뭔가가 prefix를 invalidate하고 있다는 signal이에요.

## References

- [Prompt caching — Claude API Docs](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
- [Manage costs effectively — Claude Code Docs](https://docs.claude.com/en/docs/claude-code/costs)
- [Cache TTL silently regressed from 1h to 5m around early March 2026 (issue #46829)](https://github.com/anthropics/claude-code/issues/46829)
- [Anthropic: Claude quota drain not caused by cache tweaks (The Register)](https://www.theregister.com/2026/04/13/claude_code_cache_confusion/)
- [How Prompt Caching Actually Works in Claude Code (Abhishek Ray)](https://www.claudecodecamp.com/p/how-prompt-caching-actually-works-in-claude-code)
