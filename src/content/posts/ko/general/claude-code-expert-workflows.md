---
title: Claude Code 전문가 워크플로우
description: >-
  세 명의 전문가 소스에서 합성한 Claude Code 활용 패턴: Boris Cherny(도구 설정), Mia Heidenstedt(프로세스
  규율), YK Dojo(실무 워크플로우)
date: 2026-02-09T00:00:00.000Z
updated: 2026-02-09T00:00:00.000Z
tags:
  - general
  - claude-code
  - workflows
  - best-practices
category: general
draft: false
lang: ko
source_lang: en
source_slug: claude-code-expert-workflows
source_updated: '2026-03-22'
translation_date: '2026-02-12'
references:
  - url: 'https://x.com/bcherny/status/2007179832300581177'
    title: Boris Cherny's Claude Code setup
    type: authoritative
  - url: >-
      https://heidenstedt.org/posts/2026/
      how-to-effectively-write-quality-code-with-ai/
    title: How to effectively write quality code with AI
    type: authoritative
  - url: 'https://github.com/ykdojo/claude-code-tips'
    title: '45 Claude Code Tips: From Basics to Advanced'
    type: authoritative
---

매일 Claude Code를 사용하고 있었지만, 제대로 활용하지 못하고 있다는 걸 알고
있었어요. 세션이 길어지고, context window가 차버리고, 병렬 처리를 활용하지
못하고 있었죠. 그래서 세 명의 전문가가 Claude Code를 어떻게 사용하는지
연구하고, 그들의 접근 방식을 하나의 통합 워크플로우로 합성했어요.

전문가는 Boris Cherny(Claude Code 제작자), Mia Heidenstedt(프로세스 규율
옹호자), YK Dojo(4,100+ 세션, 1,760만 토큰을 처리한 파워 유저)예요. 각각
워크플로우의 다른 레이어를 최적화하고 있고, 세 가지를 결합할 때 진정한 가치가
나타나요.

## 왜 중요한가

Claude Code는 기본 설정만으로도 강력해요. 하지만 구조화된 워크플로우 없이는
세션이 비효율적이 돼요. context window가 관련 없는 이력으로 차고, 병렬 작업이
활용되지 않고, AI 생성 코드의 품질이 훌륭한 것부터 미묘하게 깨진 것까지 들쭉날쭉
해요.

전문가 실무자들이 처리량과 신뢰성을 극대화하는 패턴을 개발했어요. 문제는
그들의 조언이 트윗, 블로그 포스트, GitHub 레포에 흩어져 있다는 거예요.
더 나쁜 건, 일부 조언이 서로 모순되는 것처럼 보여요. 전문가들이 다른 레이어를
최적화하고 있다는 걸 깨닫기 전까지는요.

## 겪었던 어려움

**소스 간 모순된 조언**이 첫 번째 장벽이었어요. Boris는 덜 조종하기 위해
"항상 Opus"를 말하고, Heidenstedt는 수동 제어와 사람의 리뷰를 강조해요.
이것들은 모순이 아니라 보완적이에요. Boris는 도구 설정을 최적화하고,
Heidenstedt는 AI 도구를 둘러싼 사람의 프로세스를 최적화해요.

**팁 모음에서 신호 대 노이즈**가 또 다른 과제였어요. YK Dojo가 발표한 46개의
팁은 기본적인 것(음성 입력 사용)부터 매우 니치한 것(모니터링용 exponential
backoff)까지 다양했어요. 보편적으로 적용 가능한 패턴을 추출하려면 신중한
선별이 필요했어요.

**하나의 소스가 전체 워크플로우를 다루지 않아요.** 각 전문가가 하나의
레이어를 최적화해요. 완전한 시스템을 갖추려면 세 가지 모두가 필요해요.

## Boris Cherny -- 도구 설정

Boris는 Anthropic에서 Claude Code의 제작자예요. 그의 설정은 "놀라울 정도로
평범"한데, 이 자체가 인사이트예요. 올바른 설정 패턴을 알면 도구가 기본
상태에서 잘 동작해요.

### 핵심 패턴

**대규모 병렬 처리.** Boris는 5개의 터미널 세션과 5-10개의 웹 세션을 동시에
실행해요. `&`로 웹에 작업을 넘기고 `--teleport`로 세션 간 이동해요. 이것이
처리량을 가장 크게 높이는 단일 요소예요.

**항상 Opus.** 토큰당 느리더라도 Opus 모델만 사용해요. 조종이 덜 필요하면
모델 수정에 시간을 덜 쓰기 때문에 전체적으로 더 빨라요.

**살아있는 CLAUDE.md.** Claude가 실수할 때마다 CLAUDE.md에 규칙을 추가해요.
팀이 매주 여러 번 기여해요. 이 파일은 한 번 설정하고 끝나는 게 아니라
살아있는 문서예요.

**계획 후 자동 승인.** plan 모드(shift+tab 두 번)로 전환하고, 계획이 맞을
때까지 반복한 다음, 자동 승인으로 전환해서 한 번에 실행해요. 사고와 실행을
분리하는 거예요.

**PostToolUse hooks.** 모든 Write나 Edit 작업 후 자동 포매팅:

```json
{
  "PostToolUse": [
    {
      "matcher": "Write|Edit",
      "hooks": [
        {
          "type": "command",
          "command": "bun run format || true"
        }
      ]
    }
  ]
}
```

**권한 허용 목록.** skip-permissions 대신 `/permissions`를 통해 안전한 명령을
미리 허용해요. 안전성을 포기하지 않으면서 속도를 얻을 수 있어요.

**검증이 최우선.** "Claude에게 자기 작업을 검증할 방법을 주세요" -- 이것만으로
2-3배 품질 향상을 얻어요. 변경 후 테스트 실행, 브라우저 출력 확인, CLI 결과
검증을 의미해요.

### 핵심 설정: Slack MCP

Boris는 팀 전체가 사용할 수 있도록 `.mcp.json`에 체크인해요:

```json
{
  "mcpServers": {
    "slack": {
      "type": "http",
      "url": "https://slack.mcp.anthropic.com/mcp"
    }
  }
}
```

## Heidenstedt -- 프로세스 규율

Mia Heidenstedt의 핵심 논지: "프로젝트에서 직접 내리고 문서화하지 않은 모든
결정은 AI가 대신 내리게 됩니다." 이 팁들은 Claude Code뿐 아니라 모든 AI
코딩 도구에 적용돼요.

### 핵심 패턴

**AI는 테스트에서 부정행위를 해요.** 이것이 가장 중요한 인사이트예요. AI는
기본 코드가 깨져 있는데도 테스트를 통과하기 위해 mock, stub, 하드코딩된 값을
작성해요. 해결책: property-based 테스트를 직접 작성하고, 테스트 작성 AI가
구현 버그를 학습하지 못하도록 별도의 세션에서 유지하세요.

**Context 격리.** 구현과 별도의 Claude Code 세션에서 테스트를 작성하세요.
같은 세션이 코드와 테스트를 모두 작성하면, AI가 무의식적으로 버그 있는 구현을
통과하는 테스트를 설계할 수 있어요.

**HIGH-RISK 마커.** 위험한 코드에 `//HIGH-RISK-UNREVIEWED`와
`//HIGH-RISK-REVIEWED`를 태그하세요. AI가 코드를 수정하면 마커가 자동으로
리셋되도록 자동화를 설정하세요. 강제 리뷰 체크포인트가 생겨요.

**복잡도를 줄이세요.** 코드의 모든 줄이 context window를 소비해요. 더 단순한
코드가 더 나은 AI 출력을 만들어요. 모델이 추론할 여유 공간이 더 생기니까요.

**저렴하게 프로토타입하세요.** AI 코드는 생성 비용이 저렴해요. 하나에
확정하기 전에 2-3개의 접근 방식을 탐색하세요. 낭비처럼 들리지만, 잘못된
접근을 구현 중간에 되돌리는 것을 피할 수 있어서 시간을 절약해요.

**맹목적으로 생성하지 마세요.** 작업을 작은 단위로 나누고, 각각을 검증하고,
길을 잃으면 알려진 정상 상태에서 다시 시작하세요. "한 번의 프롬프트로 전체
기능 생성"의 반대예요.

## YK Dojo -- 실무 워크플로우

YK Dojo는 4,100+ Claude Code 세션을 실행한 파워 유저예요. dx 플러그인,
SafeClaw, cc-safe, Super Voice Assistant를 만들었어요. 일상 워크플로우
최적화와 "자동화의 자동화"에 초점을 맞추고 있어요.

### 핵심 패턴

**음성 입력.** 로컬 전사(transcription)로 더 빠른 커뮤니케이션. 이어폰만 있으면
비행기에서도 동작해요. 컨텍스트를 설명할 때 음성이 타이핑보다 빨라요.

**Context 신선도.** "AI context는 우유와 같아요" -- 주제별로 새로 시작하고
연속성을 위해 핸드오프 문서를 사용하세요. 관련 없는 작업들을 하나의 세션에서
억지로 이어가지 마세요.

**캐스케이드 멀티태스킹.** 오른쪽에 새 탭을 열고, 왼쪽에서 오른쪽으로
쓸어가세요. 최대 3-4개 작업. context 전환 비용을 줄이면서 처리량을 유지해요.

**Write-test 사이클.** 인터랙티브 도구 테스트를 위한 tmux 패턴을 사용하고,
브라우저 자동화는 Chrome 네이티브보다 Playwright를 선호하세요.

**Exponential backoff.** 오래 걸리는 작업에는 빡빡한 루프 대신 수동으로
간격을 늘려가며 확인하세요. 토큰 효율적이에요.

**자동화의 자동화.** 진행 순서: 수동 프로세스, CLAUDE.md에 추가, skill 생성,
스크립트 생성, 완전 자동화. 각 단계가 다음 단계가 구축할 지식을 포착해요.

**반절 클론 대화.** context가 너무 커지면(85%에서 자동 트리거) 나중 반절만
유지하세요. 최근 컨텍스트를 보존하면서 공간을 확보해요.

## 세 소스가 어떻게 보완하는가

| 측면       | Boris (도구)      | Heidenstedt (프로세스) | YK Dojo (실무)       |
| ---------- | ----------------- | ---------------------- | -------------------- |
| 초점       | Claude Code 설정  | AI 도구 전반           | 일상 워크플로우      |
| CLAUDE.md  | 팀 공유           | 콘텐츠 전략            | 단순 유지, 리뷰      |
| 테스트     | CLI로 검증        | AI 방지 설계           | Write-test 사이클    |
| 품질       | PostToolUse hooks | 리뷰 마커              | 자가 점검 프롬프트   |
| 워크플로우 | 계획 + 자동 승인  | 프로토타입 + 점진적    | 캐스케이드 + 음성    |
| Context    | Web UI 병렬 처리  | N/A                    | 신선 유지 + 핸드오프 |

완전한 AI 코딩 워크플로우를 위해서는 세 가지 모두가 필요해요. Boris는 도구
설정 방법을 알려주고, Heidenstedt는 사람의 프로세스 구조화 방법을 알려주고,
YK Dojo는 일상 실무 최적화 방법을 알려줘요.

## 왜 이 방식이 효과적인가

통합 워크플로우가 각 실패 모드를 해결해요:

- **Context window가 차나요?** 신선한 세션을 사용하고(YK Dojo), 필요하면 반절
  클론하세요.
- **AI 생성 코드에 버그가 있나요?** 검증 hooks(Boris)와 AI 방지
  테스트(Heidenstedt)를 사용하세요.
- **처리량이 낮게 느껴지나요?** 대규모 병렬 처리(Boris)와 캐스케이드
  멀티태스킹(YK Dojo)을 사용하세요.
- **품질이 들쭉날쭉하나요?** PostToolUse hooks(Boris), HIGH-RISK
  마커(Heidenstedt), 계획 후 실행(Boris)을 사용하세요.

## 실전 팁

Boris의 설정부터 시작하세요: CLAUDE.md를 살아있는 문서로 설정하고,
포매팅을 위한 PostToolUse hooks를 추가하고, 권한 허용 목록을 구성하세요.
15분이면 되고 즉각적인 품질 향상을 얻어요.

그 다음 Heidenstedt의 규율을 레이어링하세요: 테스트 세션을 구현 세션과
분리하고, HIGH-RISK 마커를 추가하고, 작업을 검증 가능한 단위로 나누세요.

마지막으로, 워크플로우에 맞는 YK Dojo의 일상 실천을 도입하세요: 음성 입력,
캐스케이드 멀티태스킹, 자동화 진행.

**모든 것을 한 번에 도입하지 마세요.** 주당 하나의 패턴을 선택하고, 습관이
되게 한 다음, 다음 것을 추가하세요. 동시에 모든 것을 구현하려 하면 인지
과부하가 생겨서 목적이 무산돼요.

**사소한 단일 파일 수정에는 건너뛰세요.** 병렬 세션과 검증 hooks의 오버헤드는
문자열 상수 하나를 변경할 때는 그만한 가치가 없어요.
