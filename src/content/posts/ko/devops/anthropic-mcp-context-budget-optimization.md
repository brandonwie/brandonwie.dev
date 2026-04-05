---
title: "Anthropic MCP 컨텍스트 예산 최적화"
description: >-
  Anthropic 호스팅 MCP 통합이 세션 시작 시 컨텍스트 윈도우에서 ~71K 토큰을 소비해요 —
  호출하지 않아도요. 이 예산을 되찾는 방법을 알아보세요.
date: 2026-03-25T00:00:00.000Z
updated: "2026-04-06"
tags:
  - devops
  - claude-code
  - ai-ml
category: devops
draft: false
lang: ko
source_lang: en
source_slug: anthropic-mcp-context-budget-optimization
source_updated: "2026-04-06"
translation_date: "2026-04-06"
references:
  - url: 'https://code.claude.com/docs/en/best-practices'
    title: Claude Code Best Practices
    type: official
---

복잡한 리팩토링 세션 중간에 Claude가 방금 읽은 파일을 추적하지 못하기 시작했어요. 컨텍스트 윈도우가 부족한 건데 이유를 모르겠더라고요 — `/doctor`를 실행하고 숫자를 보고 나서야 알게 됐어요.

## MCP 통합의 숨겨진 비용

Claude Code의 Anthropic 호스팅 MCP 통합 — Gmail, Google Calendar, Notion, Sentry, Slack — 은 세션이 시작되는 순간 전체 도구 스키마를 컨텍스트 윈도우에 로드해요. 모든 도구 정의, 모든 파라미터 설명, 모든 타입 어노테이션이 토큰으로 직렬화돼요. 그 도구를 호출하든 안 하든 공간은 소비돼요.

측정해 보니 이런 결과가 나왔어요:

```text
Sentry:           ~15K 토큰
Notion:           ~15K 토큰
Calendar:         ~13K 토큰
Slack:            ~8K 토큰
Chrome-in-Chrome: ~6K 토큰
────────────────────────────
합계:            ~57K 토큰 (정리 전)
```

1M 컨텍스트 윈도우의 약 7%를 도구 정의에만 쓰고 있었어요. 더 짧은 세션이나 윈도우가 작은 모델에서는 이 오버헤드가 더 심각해요.

## 해결책: 기본 연결 해제, 필요 시 활성화

해결 방법은 간단해요 — 적극적으로 사용하지 않는 Anthropic 호스팅 통합을 모두 연결 해제하고, 필요할 때만 다시 활성화하면 돼요:

1. Claude Code에서 `/mcp` 실행
2. 이번 세션에서 안 쓸 통합 연결 해제
3. Sentry로 디버깅해야 할 때: `/mcp` → Sentry 활성화 → 사용
4. 끝나면: 선택적으로 다시 연결 해제해서 컨텍스트 확보

재활성화는 즉각적이에요. OAuth가 투명하게 재연결되어서 재인증이 필요 없어요.

### Before와 After

```text
Before: ~71,834 토큰 (MCP 도구에 소비)
After:  ~14,000 토큰 (context7, playwright, chrome-devtools만 남김)
절약:  ~57,000 토큰 (~5.7% of 1M 컨텍스트 윈도우)
```

## 언제 중요한가

이 최적화는 다음 상황에서 가장 가치가 있어요:

- **긴 개발 세션** — 대용량 파일을 읽으며 컨텍스트가 쌓이는 경우
- **큰 코드베이스** — 파일 읽기만으로 이미 상당한 컨텍스트를 소비하는 경우
- **복잡한 멀티 스텝 작업** — Claude가 많은 세부 사항을 기억해야 하는 경우

빠른 세션이나 Sentry 트리아지, Slack 중심 커뮤니케이션 워크플로우에서는 덜 중요해요. 통합을 자주 켜고 끄는 경우에는 재연결 마찰이 절약분보다 클 수 있어요.

## 핵심 교훈

컨텍스트 윈도우 공간은 유한한 자원이에요. 도구 스키마는 지연 로딩이 아니라 즉시 로딩돼요 — 사용 여부와 관계없이 토큰을 소비해요. `/doctor`나 `/mcp`로 MCP 통합을 점검하고, 현재 세션에 필요 없는 것은 연결 해제해서 실제 작업을 위한 예산을 확보하세요.
