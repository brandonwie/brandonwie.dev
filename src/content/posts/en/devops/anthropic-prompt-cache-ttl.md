---
title: Anthropic Prompt Cache TTL + Cost Mechanics
description: 'Anthropic silently dropped Claude Code''s prompt-cache TTL from 1 hour to 5 minutes around early March 2026. Without explicit awareness, idle gaps ≥5 min between messages evaporate the cache and force a full cold cache-write on the next message — pricing it at 1.25× base input on the entire conversation prefix.'
date: 2026-05-03T00:00:00.000Z
updated: "2026-09-03"
tags:
  - knowledge
  - devops
  - ai-ml
  - claude-code
category: devops
draft: false
lang: en
expanded: true
references:
  - url: 'https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching'
    title: Prompt caching - Claude API Docs
    type: official
  - url: 'https://docs.claude.com/en/docs/claude-code/costs'
    title: Manage costs effectively - Claude Code Docs
    type: official
  - url: 'https://github.com/anthropics/claude-code/issues/46829'
    title: >-
      Cache TTL silently regressed from 1h to 5m around early March 2026 (issue
      #46829)
    type: verified
  - url: 'https://www.theregister.com/2026/04/13/claude_code_cache_confusion/'
    title: 'Anthropic: Claude quota drain not caused by cache tweaks'
    type: authoritative
  - url: >-
      https://www.claudecodecamp.com/p/how-prompt-caching-actually-works-in-claude-code
    title: How Prompt Caching Actually Works in Claude Code
    type: authoritative
source_content_hash: 46d679c571022036b622b25ed7b257d6e670ef39352355a7b84dad268a195f17
---

Anthropic silently dropped Claude Code's prompt-cache TTL from 1 hour to 5 minutes around early March 2026 ([issue #46829](https://github.com/anthropics/claude-code/issues/46829)). Without explicit awareness, idle gaps ≥5 min between messages evaporate the cache and force a full cold cache-write on the next message — pricing it at 1.25× base input on the **entire conversation prefix** (system prompt + tools + CLAUDE.md + every prior turn). On a 200K-token Opus session that's ~$1.25 per resume; across a working day this can raise per-session cost 30–60%.

Pre-regression, sessions running 1h+ between messages stayed warm. Post-regression, walking-away patterns (lunch, meetings, focus blocks) cost real money — and many users didn't notice because there was no announcement, no release-note line, no banner.

## Cache mechanics, verified

### TTL options

| TTL   | Default?                                                  | Refresh behavior                                                                           |
| ----- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 5 min | YES (post-2026-03 regression)                             | Each cache hit resets the timer (sliding window). Active sessions stay warm forever.       |
| 1 h   | Opt-in via `cache_control: { ttl: "1h" }` on API requests | Same sliding-window behavior, longer dead-clock. NOT user-selectable in Claude Code today. |

### Pricing multipliers (vs base input)

| Operation                      | Multiplier vs base input |
| ------------------------------ | ------------------------ |
| Cache **read** (hit)           | **0.10×** (10%)          |
| Cache **refresh** on hit       | 0.10× (same as read)     |
| 5m cache **write** (cold/miss) | **1.25×**                |
| 1h cache **write** (cold/miss) | **2.00×**                |

Claude Opus 4.7 numbers: base input \$5/MTok, 5m write \$6.25, 1h write \$10, read/refresh \$0.50, output \$25.

### What "5m vs 1h is 2x more expensive" actually means

The "2×" claim circulating in user discussions compares 1h cache **write** to **uncached base input** (2.0× vs 1.0×). The ratio of 1h write to 5m write is 1.6× (2.0 / 1.25). Both are correct depending on the comparison frame; the "2×" framing only makes sense vs uncached.

## What invalidates the cache

The cache key is a hash of the full prefix in order: system prompt + tool definitions + CLAUDE.md + conversation history. Changing any portion invalidates everything from that point onward.

| Change                                       | Effect                                                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Edit `CLAUDE.md` mid-session                 | Prefix changes → all cache dies → every subsequent message reprocessed                                                                           |
| Add/remove MCP server mid-session            | Tool defs change → full invalidation. **Claude Code's design locks tool list at startup** to prevent this.                                       |
| Switch model (Opus ↔ Sonnet)                 | Different model = different cache. `tool_choice` changes also invalidate.                                                                        |
| Timestamp / dynamic content in system prompt | Prefix differs every turn → never hits                                                                                                           |
| `/compact`                                   | **Safe** — Claude Code rebuilds the conversation summary AFTER the same cached prefix (system + tools + CLAUDE.md). Prefix reuse is intentional. |
| `/clear`                                     | Wipes session, next message cold                                                                                                                 |

## Why Claude Code's design leans so hard on cache

Per Thariq Shihipar (Claude Code engineer) — prompt caching is the architectural constraint around which the product is built. They declare SEVs when cache hit rates drop. Concrete design choices that exist for cache reasons:

1. **Tool list locked at session start.** Adding an MCP tool mid-session would change the prefix → invalidates everything. Claude Code refuses to register new tools after startup.
2. **Plan mode adds tools, never swaps.** When plan mode was built, the obvious design was "swap to read-only tools." Cache-aware design: keep ALL tools in the prompt always; add `EnterPlanMode` and `ExitPlanMode` as additional tools; send mode change as a user message. Tool defs never change between plan mode and normal mode.
3. **Compaction is a fork, not a rebuild.** Compaction request uses the identical prefix as your current conversation (same system prompt, tools, CLAUDE.md). Only the messages portion gets summarized. Prefix KV cache is reused.

Without prompt caching, a 100-turn Opus coding session can cost \$50–\$100 in input tokens. With 90% hit rate, ~\$10–\$19. This economics is why Claude Code Pro (\$20/mo) is viable.

The same inversion shows up outside Claude Code billing. Huang et al. (2026, p.11) report spending 14.18M input tokens against Codex's 8.23M and still paying less — \$6.89 vs \$10.28 — because 13.32M of those tokens were cache hits (~94%). What surprised me there: "load more context" is not the same thing as "costs more" until the hit rate is actually measured. I can't check that on my own setup yet — my usage log has no `cached_input_tokens` field at all, so I don't know my real hit rate, and until I do I shouldn't be treating heavier rule or knowledge loading as cheap.

## Cost math for an Opus 4.7 200K-token prefix

| Scenario                             | Cost                                             |
| ------------------------------------ | ------------------------------------------------ |
| Cold write on resume after 5min idle | 200K × \$6.25/MTok = **\$1.25**                  |
| Subsequent in-window message         | 200K × \$0.50/MTok = \$0.10                      |
| 12 pings/hr (cache-keepalive idle)   | 12 × ~\$0.10 = \$1.20/hr (if you used a keepalive) |
| 10-resume day without keepalive      | ~\$12.50 just in cold-write tax                  |
| Same session w/ cache-keepalive      | ~\$5/day (continuous warm)                       |

For Pro/Max subscribers: cache misses don't bill \$ (flat fee), but they consume rate-limit (5hr / weekly Opus quota). High cache miss rate burns your quota faster.

## Cost levers user-controllable in Claude Code

| Lever                                 | Action                                                                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Keep sessions active                  | Don't let cache expire mid-task. Type a filler turn before a known break. A keepalive pinger helps only on API/token billing; on Pro/Max it burns quota. |
| Slim CLAUDE.md                        | Loaded at session start → sits in cached prefix forever. Move workflow detail to **skills** which lazy-load on invoke. |
| Lock MCP servers up front             | Don't toggle servers mid-session. Configure `.mcp.json` once.                                                          |
| Pin model per session                 | Don't switch Opus ↔ Sonnet inside one task.                                                                            |
| Subagents for verbose ops             | Heavy file reads / log dumps → subagent. Verbose tokens stay in subagent context, only summary returns.                |
| `/compact` is fine                    | Designed cache-aware. Use freely when context fills.                                                                   |
| Monitor `/usage`                      | Cache hit ratio below 90% = something invalidating prefix. Investigate.                                                |
| Avoid agent teams unless needed       | ~7× tokens vs solo session (each teammate has own context).                                                            |
| Start new session for unrelated tasks | Stale conversation = bigger cache write each turn even at 90% hit.                                                     |

## Mixing TTLs at the API layer

Both 1h and 5m can coexist in a single API request. Constraint: **1h cache entries must appear before any 5m entries** in the prefix. Billing partitions into three positions: `A` (highest cache hit), `B` (highest 1h breakpoint after A), `C` (last cache breakpoint). Charged: read for `A`, 1h write for `(B - A)`, 5m write for `(C - B)`.

For Claude Code users this is moot — Anthropic chose 5m default and exposes no flag to flip TTL. API users can set `ttl: "1h"` per breakpoint.

## When cache awareness does not matter

- One-off short sessions (under 30K tokens, single message exchange).
- Sessions where prefix invalidation is unavoidable (rapid CLAUDE.md iteration, MCP debugging).
- Pro/Max subscribers who never approach rate limits — cache misses cost rate-limit only, not \$.

## Practical takeaway

The cache TTL regression is silent and the cost is real — \$1.25 per cold-write on a 200K-token Opus session, multiplied by however many idle gaps fall over 5 minutes. The user-controllable levers are: keep sessions active (a filler turn before a break; keepalive only when API/token billing is the right trade-off), slim CLAUDE.md (move workflow detail to lazy-loaded skills), lock MCP servers up front, pin the model per session, and use subagents for verbose ops so heavy tokens never enter the cached prefix. `/compact` is cache-safe by design — use it. Watch `/usage` for cache hit ratios below 90%; that's the signal that something in your setup is invalidating the prefix.

## References

- [Prompt caching — Claude API Docs](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
- [Manage costs effectively — Claude Code Docs](https://docs.claude.com/en/docs/claude-code/costs)
- [Cache TTL silently regressed from 1h to 5m around early March 2026 (issue #46829)](https://github.com/anthropics/claude-code/issues/46829)
- [Anthropic: Claude quota drain not caused by cache tweaks (The Register)](https://www.theregister.com/2026/04/13/claude_code_cache_confusion/)
- [How Prompt Caching Actually Works in Claude Code (Abhishek Ray)](https://www.claudecodecamp.com/p/how-prompt-caching-actually-works-in-claude-code)
