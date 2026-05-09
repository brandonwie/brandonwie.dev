---
title: Anthropic Prompt Cache TTL과 비용 메커니즘
description: >-
  Anthropic이 2026년 3월 초쯤 Claude Code의 prompt cache TTL을 1시간에서 5분으로 조용히 줄였어요. 이걸
  모르면 메시지 사이에 5분 이상 비는 순간 cache가 날아가고, 다음 메시지에 전체 conversation prefix를 처음부터 다시
  써야 해요. 기본 입력 단가의 1.25배짜리 비용으로요.
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
translation_date: '2026-05-10'
---

점심 먹고 돌아와서 이어서 질문을 던졌더니, `/usage`의 cache hit 비율이 갑자기 떨어져 있었어요. 별 고민 없이 켜둔 줄 알았는데 그 사이에 cache가 통째로 날아가 있었던 거예요. 알고 보니 Anthropic이 2026년 3월 초쯤 Claude Code의 prompt cache TTL을 1시간에서 5분으로 조용히 줄여뒀어요([issue #46829](https://github.com/anthropics/claude-code/issues/46829)). 이걸 모르고 있으면, 메시지 사이에 5분 이상 비는 순간 cache가 증발하고, 다음 메시지에 **전체 conversation prefix**(system prompt + tools + CLAUDE.md + 이전 turn 전부)를 처음부터 다시 써야 해요. 기본 입력 단가의 1.25배짜리 비용으로요. 200K 토큰짜리 Opus 세션이라면 한 번 이어붙일 때 약 $1.25씩 들어요. 하루 일하다 보면 세션당 비용이 30~60% 더 붙어요.

regression 이전엔 메시지 사이가 1시간 넘게 떠도 세션이 따뜻하게 유지됐어요. 이후엔 자리 비우는 패턴(점심, 미팅, 집중 시간)이 진짜 돈으로 청구돼요. 공지도, release note 한 줄도, 배너도 없었어서 모르고 지나간 사람이 많았어요.

## 검증된 cache 메커니즘

### TTL 옵션

| TTL   | 기본?                                                | 갱신 동작                                                                        |
| ----- | ---------------------------------------------------- | -------------------------------------------------------------------------------- |
| 5분   | 예 (2026-03 regression 이후)                         | cache hit이 일어날 때마다 타이머 재설정(sliding window). 활성 세션은 영원히 따뜻해요. |
| 1시간 | API 요청에 `cache_control: { ttl: "1h" }`로 opt-in 가능 | 같은 sliding window 동작이지만 빈 시간 한도가 더 길어요. Claude Code에서는 직접 못 골라요. |

### 가격 배수 (기본 입력 대비)

| 동작                                | 기본 입력 대비 배수 |
| ----------------------------------- | ------------------- |
| Cache **read** (hit)                | **0.10×** (10%)     |
| hit 시 Cache **refresh**            | 0.10× (read와 같음) |
| 5분 cache **write** (cold/miss)     | **1.25×**           |
| 1시간 cache **write** (cold/miss)   | **2.00×**           |

Claude Opus 4.7 기준 숫자예요. 기본 입력은 백만 토큰당 \$5, 5분 write는 \$6.25, 1시간 write는 \$10, read와 refresh는 \$0.50, 출력은 \$25예요.

### "5분이 1시간보다 2배 비싸다"는 말의 진짜 뜻

커뮤니티에 도는 "2×"는 1시간 cache **write**를 **cache 없는 기본 입력**과 비교한 거예요(2.0× 대 1.0×). 1시간 write 대 5분 write 비율은 1.6×예요(2.0 / 1.25). 어느 쪽이든 비교 기준에 따라 맞는 말이에요. "2×"가 와닿는 건 cache 없는 경우랑 비교할 때뿐이에요.

## cache를 무효화하는 것

cache key는 prefix 전체를 순서대로 해시한 값이에요. system prompt + 도구 정의 + CLAUDE.md + 대화 기록이 그 prefix예요. 어디든 한 군데가 바뀌면 그 지점부터 끝까지 전부 무효화돼요.

| 변경                                          | 효과                                                                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 세션 중간에 `CLAUDE.md` 편집                  | prefix 변경 → cache 전부 사망 → 이후 모든 메시지를 다시 처리                                                                         |
| 세션 중간에 MCP server 추가/제거               | 도구 정의 변경 → 전부 무효화. **Claude Code는 시작 때 도구 목록을 잠가서** 이걸 막아요.                                              |
| 모델 전환 (Opus ↔ Sonnet)                     | 다른 모델 = 다른 cache. `tool_choice` 변경도 무효화.                                                                                  |
| system prompt에 timestamp나 동적 콘텐츠       | 매 turn마다 prefix가 달라져요 → 절대 hit 안 해요                                                                                       |
| `/compact`                                    | **안전해요.** Claude Code가 같은 cache prefix(system + tools + CLAUDE.md) 뒤에 대화 요약을 다시 만들어요. prefix 재사용은 의도된 동작이에요. |
| `/clear`                                      | 세션을 통째로 비워요. 다음 메시지는 cold.                                                                                              |

## Claude Code 디자인이 cache에 강하게 기대는 이유

Claude Code 엔지니어인 Thariq Shihipar의 말로는, prompt caching이 제품 설계의 중심축이에요. cache hit 비율이 떨어지면 SEV를 띄울 정도로요. cache 때문에 일부러 그렇게 만든 설계 결정 몇 개를 보면 이해가 빨라요.

1. **세션 시작 때 도구 목록을 잠가둬요.** 세션 중간에 MCP 도구를 추가하면 prefix가 바뀌면서 전부 무효화돼요. 그래서 Claude Code는 시작 이후엔 새 도구 등록을 거부해요.
2. **plan mode는 도구를 갈아끼우지 않고 더해요.** plan mode를 만들 때 가장 자연스러운 디자인은 "읽기 전용 도구로 교체"였어요. cache를 의식한 디자인은 달랐어요. 도구는 항상 prompt에 다 두고, `EnterPlanMode`와 `ExitPlanMode`를 추가 도구로만 더하고, 모드 전환은 사용자 메시지로 보내요. 그래서 plan mode와 일반 모드 사이에 도구 정의가 바뀌지 않아요.
3. **compaction은 다시 만드는 게 아니라 갈래를 치는 거예요.** compaction 요청은 지금 대화와 똑같은 prefix(같은 system prompt, 도구, CLAUDE.md)를 써요. 메시지 부분만 요약돼요. prefix의 KV cache는 그대로 재활용돼요.

prompt caching이 없으면 100 turn짜리 Opus 코딩 세션이 입력 토큰만 \$50~\$100 들 수 있어요. hit 비율이 90%면 \$10~\$19로 떨어져요. 이 경제성이 Claude Code Pro(\$20/월)를 굴러가게 만드는 핵심이에요.

## Opus 4.7 200K 토큰 prefix 비용 계산

| 시나리오                                | 비용                                              |
| --------------------------------------- | ------------------------------------------------- |
| 5분 idle 후 다시 시작 시 cold write     | 200K × \$6.25/MTok = **\$1.25**                   |
| 같은 윈도 안에서 후속 메시지            | 200K × \$0.50/MTok = \$0.10                       |
| 시간당 ping 12번 (cache keepalive idle) | 12 × 약 \$0.10 = 시간당 \$1.20 (keepalive 쓸 때)  |
| keepalive 없이 하루 10번 다시 시작      | 약 \$12.50, 그냥 cold write 세금으로                |
| cache keepalive 같이 쓰는 같은 세션      | 하루 약 \$5 (계속 따뜻하게)                       |

Pro/Max 구독자는 cache miss로 \$가 청구되진 않아요(정액 요금). 대신 rate limit(5시간 / 주간 Opus 쿼터)을 먹어요. cache miss 비율이 높으면 쿼터가 더 빨리 타요.

## Claude Code에서 직접 만질 수 있는 비용 레버

| 레버                                     | 행동                                                                                                                              |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 세션을 활성으로 유지                      | 작업 도중 cache가 만료되지 않게 해요. 자리 비우기 전에 한 turn 채우고 가거나, cache keepalive를 깔아요(관련 글 참고).             |
| CLAUDE.md를 가볍게                        | 세션 시작 때 한 번 로드돼서 cache prefix에 영원히 박혀요. 세부 워크플로는 호출 시점에 lazy load되는 **skill**로 옮겨요.            |
| MCP server는 처음부터 잠가서              | 세션 도중에 server를 켰다 껐다 하지 말아요. `.mcp.json`을 한 번만 설정해요.                                                       |
| 한 세션 안에서 모델 고정                  | 한 작업 안에서 Opus ↔ Sonnet을 갈아끼우지 않아요.                                                                                  |
| 길이가 큰 작업엔 subagent                  | 무거운 파일 읽기, 로그 덤프 같은 건 subagent로 빼요. 길이가 큰 토큰은 subagent 컨텍스트에 머물고, 요약만 돌아와요.                |
| `/compact`은 써도 돼요                    | cache를 의식해서 만들어졌어요. 컨텍스트가 차오르면 부담 없이 써요.                                                                |
| `/usage` 모니터링                         | cache hit 비율이 90% 미만이면 prefix 어딘가가 무효화되고 있다는 뜻이에요. 원인을 찾아요.                                          |
| 꼭 필요할 때만 agent team                  | solo 세션 대비 약 7배 토큰을 써요(팀원마다 자기 컨텍스트가 따로 있어요).                                                          |
| 무관한 작업은 새 세션에서                  | 묵혀둔 대화는 hit 비율 90%여도 매 turn cache write가 더 커져요.                                                                    |

## API 단에서 TTL 섞기

1시간과 5분은 한 API 요청 안에서 같이 쓸 수 있어요. 제약은 하나예요. **1시간 cache 항목이 5분 항목보다 prefix에서 앞서야 해요.** 청구는 세 위치로 나뉘어요. `A`(가장 위쪽 cache hit), `B`(A 뒤의 가장 위쪽 1시간 breakpoint), `C`(마지막 cache breakpoint). `A`엔 read 요금, `(B - A)`엔 1시간 write, `(C - B)`엔 5분 write가 청구돼요.

Claude Code 사용자에겐 의미가 없는 얘기예요. Anthropic이 5분을 기본으로 골랐고 TTL을 바꿀 플래그를 노출 안 했거든요. API 사용자라면 breakpoint마다 `ttl: "1h"`을 직접 설정할 수 있어요.

## cache를 의식할 필요가 없는 경우

- 짧은 일회성 세션(30K 토큰 미만, 메시지 한두 번 주고받는 정도).
- prefix 무효화를 어쩔 수 없이 자주 일으키는 세션(CLAUDE.md를 빠르게 고치며 반복하는 작업, MCP 디버깅).
- rate limit에 결코 닿지 않는 Pro/Max 구독자. cache miss는 rate limit만 갉아먹지 \$로 청구되진 않아요.

## 실용적인 정리

cache TTL regression은 조용해요. 대신 비용은 진짜로 들어요. 200K 토큰 Opus 세션에서 cold write 한 번에 \$1.25, 그리고 5분을 넘기는 idle 구간 수만큼 곱해서요. 직접 만질 수 있는 레버는 이거예요. 세션을 활성으로 유지(filler turn이나 keepalive), CLAUDE.md를 가볍게 유지(세부 워크플로는 lazy load되는 skill로), MCP server를 처음부터 잠그기, 한 세션 안에서 모델 고정, 길이 큰 작업은 subagent로 빼서 무거운 토큰이 cache prefix에 안 들어오게 하기. `/compact`은 cache 친화적으로 디자인됐어요. 그냥 써요. `/usage`에서 cache hit 비율이 90% 아래로 떨어지면 그게 신호예요. 어디선가 prefix가 무효화되고 있다는 뜻이에요.

## References

- [Prompt caching — Claude API Docs](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
- [Manage costs effectively — Claude Code Docs](https://docs.claude.com/en/docs/claude-code/costs)
- [Cache TTL silently regressed from 1h to 5m around early March 2026 (issue #46829)](https://github.com/anthropics/claude-code/issues/46829)
- [Anthropic: Claude quota drain not caused by cache tweaks (The Register)](https://www.theregister.com/2026/04/13/claude_code_cache_confusion/)
- [How Prompt Caching Actually Works in Claude Code (Abhishek Ray)](https://www.claudecodecamp.com/p/how-prompt-caching-actually-works-in-claude-code)
