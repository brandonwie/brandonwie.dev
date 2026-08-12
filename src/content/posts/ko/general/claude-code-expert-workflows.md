---
title: Claude Code 전문가 워크플로우
description: >-
  세 명의 전문가 소스에서 합성한 Claude Code 활용 패턴: Boris Cherny(도구 설정), Mia Heidenstedt(프로세스
  규율), YK Dojo(실무 워크플로우)
date: 2026-02-09T00:00:00.000Z
updated: '2026-08-12'
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
source_updated: '2026-08-12'
translation_date: '2026-08-12'
references:
  - url: 'https://x.com/bcherny/status/2007179832300581177'
    title: Boris Cherny's Claude Code setup
    type: authoritative
  - url: 'https://heidenstedt.org/posts/2026/how-to-effectively-write-quality-code-with-ai/'
    title: How to effectively write quality code with AI
    type: authoritative
  - url: 'https://github.com/ykdojo/claude-code-tips'
    title: '40+ Claude Code Tips: From Basics to Advanced'
    type: authoritative
  - url: 'https://code.claude.com/docs/en/hooks'
    title: Claude Code hooks reference
    type: official
  - url: 'https://code.claude.com/docs/en/mcp'
    title: Connect Claude Code to tools via MCP
    type: official
---

Claude Code는 기본 설정만으로도 잘 동작해요. 하지만 구조화된 워크플로우가 없으면 세션이 흐트러져요. context window가 더 이상 상관없는 이력으로 차고, 병렬 작업은 활용되지 않고, 생성된 코드의 품질이 괜찮은 것과 미묘하게 깨진 것 사이를 오가요.

숙련된 실무자들이 이 문제에 대한 패턴을 만들어 뒀어요. 문제는 그 조언이 트윗, 블로그 포스트, GitHub 레포에 흩어져 있다는 거예요. 게다가 일부는 서로 모순되는 것처럼 보여요 — 각자가 다른 레이어를 최적화하고 있다는 걸 알아채기 전까지는요.

세 개의 소스를 훑어보고 하나의 워크플로우로 정리해 봤어요. Boris Cherny는 Anthropic에서 Claude Code를 만든 사람이고, 2026년 1월 스레드에 자기 설정을 공개했어요. Mia Heidenstedt는 AI 보조 코딩의 프로세스 규율에 대해 썼어요. YK Dojo는 4.1k 세션, 1,760만 토큰의 사용 경험에서 나온 40개 이상의 팁을 레포로 관리하고 있어요. 아래는 그 합성 결과인데, 원본 소스와 대조해서 확인할 수 있었던 내용만 담았어요.

## 왜 세 개의 소스인가

가장 먼저 걸림돌이 된 건 서로 충돌하는 것처럼 보이는 조언이었어요. Boris는 가장 큰 모델을 쓰고 덜 조종해요. Heidenstedt는 수동 제어와 꼼꼼한 검증을 강조해요. 나란히 놓고 보면 반대되는 얘기처럼 들려요. 그런데 사실은 서로 다른 레이어에서 동작하는 얘기예요.

Boris는 **도구 레이어**를 최적화해요. Claude Code 자체를 어떻게 설정할 것인가죠. Heidenstedt는 **프로세스 레이어**를 최적화해요. 어떤 AI 도구를 쓰든 작업을 어떻게 구조화할 것인가예요. YK Dojo는 **실무 레이어**를 최적화해요. 처리량을 위한 일상 워크플로우 습관이에요.

한 소스만으로는 전체 그림이 안 나와요. Boris는 테스트 설계를 다루지 않아요. Heidenstedt는 Claude Code 고유의 설정을 다루지 않아요. YK Dojo는 팀 워크플로우를 다루지 않아요.

## Boris Cherny -- 도구 설정

Boris는 스레드를 자기 설정이 "놀라울 정도로 평범(surprisingly vanilla)"하다는 말로 시작해요. 도구가 기본 상태에서 잘 동작하기 때문에 많이 커스터마이즈하지 않는다는 거예요. 아래는 전부 그 스레드 기준이라, 현재 동작이 아니라 2026년 초의 스냅샷으로 보는 게 맞아요. 플래그와 기본값은 계속 바뀌니까요.

### 대규모 병렬 처리

Boris는 터미널에서 5개의 Claude 세션을 1-5번으로 번호를 붙여 실행하고, 어느 세션이 입력을 기다리는지 시스템 알림으로 파악해요. 여기에 더해 웹에서 5-10개 세션을 돌려요. 로컬 세션은 `&`로 웹에 넘기고, `--teleport`로 양쪽을 오가요.

멀티태스킹 자체가 목적은 아니에요. 한 세션이 긴 작업을 갈아 넣는 동안 다른 일을 계속 굴리는 게 핵심이에요.

### 언제나 가장 큰 모델

2026년 1월 그 스레드에서 그는 작은 작업이라고 작은 모델로 내려가지 않고, thinking을 켠 Opus 4.5를 전부에 썼어요. 큰 모델은 토큰당 속도는 느리지만 전체로 보면 더 빠르다는 게 그의 설명이에요. 조종할 일이 적고 도구를 더 잘 쓰니까, 굳이 안 해도 되는 교정 턴이 늘어난 생성 시간을 상쇄하고도 남는다는 거죠.

모델 이름은 금방 바뀌니까 특정 버전을 콕 집은 부분은 빨리 낡아요. 남는 건 그가 무엇을 재고 있느냐예요. 초당 토큰 수가 아니라 결과가 돌아가기까지 걸린 시간이죠.

### 살아있는 CLAUDE.md

그의 팀은 Claude Code 레포용 `CLAUDE.md` 하나를 공유하고, git에 체크인하고, 매주 여러 번 기여해요. Claude가 뭔가 잘못하는 걸 볼 때마다 규칙을 추가해서 반복되지 않게 해요.

한 번 쓰고 끝나는 문서가 아니라, 실제 실수로 다듬어진 가드레일 모음이 자라는 거예요.

### 계획 후 자동 승인

대부분의 세션은 plan 모드(Shift+Tab 두 번)로 시작해요. 계획이 마음에 들 때까지 Claude와 주고받은 다음, auto-accept edits로 전환하면 보통 한 번에 끝나요. 사고 단계와 실행 단계를 분리하는 방식이에요.

### PostToolUse hook

그의 팀은 Claude가 쓴 코드를 포매팅하기 위해 `PostToolUse` hook을 사용해요. 표현이 겸손한 게 눈에 띄어요. Claude는 대체로 이미 잘 포맷된 코드를 만들고, hook은 나중에 CI에서 포매팅 에러가 나지 않도록 마지막 10%를 처리한다는 거예요.

[hooks 레퍼런스](https://code.claude.com/docs/en/hooks)에 따르면 이 이벤트는 `settings.json`의 최상위 `hooks` 키 아래에 위치해요:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "npm run format || true"
          }
        ]
      }
    ]
  }
}
```

`|| true`는 포매팅 실패가 hook 에러로 튀어나오지 않게 해줘요. `PostToolUse`는 도구 호출이 이미 성공한 뒤에 실행되기 때문에 어차피 편집을 막을 수는 없어요. 게이트가 아니라 side effect 슬롯이에요.

### 검증이 최우선

마지막 팁이 가장 강한 주장이에요. Claude에게 자기 작업을 검증할 방법을 주라는 거예요. 수치도 구체적이에요. 그 피드백 루프가 있으면 "최종 결과물의 품질이 2-3배가 된다"고 해요. 없으면 Claude는 그럴듯해 보이지만 돌아갈지 아닐지 모르는 코드를 내놔요.

### 권한 허용 목록

그는 `--dangerously-skip-permissions`를 쓰지 않아요. 대신 자기 환경에서 안전하다고 아는 bash 명령을 `/permissions`로 미리 허용하고, 대부분을 `.claude/settings.json`에 체크인해서 팀과 공유해요. 전부를 넘겨주지 않으면서 마찰만 줄이는 거예요.

### 레포에 체크인하는 MCP

Boris는 Claude가 팀 도구를 직접 쓰게 해요. MCP 서버로 Slack을 검색하고 글을 올리고, 분석 쿼리를 돌리고, 에러 로그를 가져와요. Slack MCP 설정은 개인마다 따로 잡는 게 아니라 팀의 `.mcp.json`에 체크인돼 있어요.

스레드에는 파일을 체크인한다는 얘기만 있고 endpoint가 뭔지는 안 나와요. 그래서 아래 URL은 그의 설정이 아니라 공식 문서에 있는 주소예요. [MCP 문서](https://code.claude.com/docs/en/mcp)는 이걸 project scope라고 부르고, 팀 전체가 같은 서버를 쓰도록 `.mcp.json`을 버전 관리에 체크인하라고 권해요:

```json
{
  "mcpServers": {
    "slack": {
      "type": "http",
      "url": "https://mcp.slack.com/mcp"
    }
  }
}
```

체크인된 `.mcp.json`의 project scope 서버를 쓰기 전에 Claude Code가 승인을 요청하기 때문에, 파일을 공유한다고 해서 접근 권한이 조용히 열리지는 않아요.

## Heidenstedt -- 프로세스 규율

Heidenstedt의 핵심 논지는 한 문장이에요. "프로젝트에서 직접 내리고 문서화하지 않은 모든 결정은 AI가 대신 내리게 됩니다."

### AI는 테스트에서 부정행위를 해요

그의 글에서 가장 날카로운 주장이고, 표현을 전혀 완화하지 않아요. "AI는 결국 부정행위를 하고 지름길을 씁니다. 코드 자체는 동작하지 않는데도 테스트를 통과시키려고 mock, stub, 하드코딩된 값을 씁니다."

해법은 property-based 상위 수준 명세 테스트를 직접 작성하는 거예요. 구조상 통과할 수밖에 없는 테스트가 아니라, 실제 동작을 검증하는 테스트를 설계하라는 얘기예요.

### Context 격리

AI가 테스트를 쓰게 된다면, 구현을 최대한 적게 보여줘야 해요. 코드가 아니라 명세를 기준으로 기대 동작에 대한 property-based interface 테스트를 쓰게 하는 거죠. 테스트 세션에는 인터페이스만 주고 소스는 주지 않아요.

### HIGH-RISK 마커

보안 위험이 실제로 있는 함수에는 `//HIGH-RISK-UNREVIEWED`와 `//HIGH-RISK-REVIEWED` 같은 주석을 코드에 직접 달아요. 이걸 작동하게 만드는 건 함께 붙는 지시사항이에요. AI가 그 함수에서 한 글자라도 바꾸면 즉시 리뷰 상태를 바꾸도록 지시하는 거죠.

그러면 실제로 피해를 낼 수 있는 코드 — 결제 처리, 데이터 삭제, 인증 — 에 감사 추적이 생겨요.

### 복잡도를 줄이세요

"코드의 모든 줄이 context window를 잡아먹고 AI를 더 힘들게 만듭니다." 그는 코드 단순화를 미적 취향이 아니라 출력 품질에 직접 들어가는 입력으로 다뤄요.

### 저렴하게 프로토타입하세요

AI가 쓴 코드는 싸니까 그걸 활용하라는 거예요. 처음 떠오른 해법에 확정하지 말고 여러 해법을 탐색하세요. 낭비처럼 들리지만, 잘못된 선택을 중간에 되돌리는 것보다 대체로 저렴해요.

## Boris와 Heidenstedt는 어떻게 보완하는가

얼핏 보면 둘은 반대되는 얘기를 해요. Boris는 모델에 기대고 덜 조종하고, Heidenstedt는 프로세스를 통제하고 아무것도 믿지 않아요. 실제로는 서로 다른 층위에서 동작해요:

| 측면      | Boris (도구)              | Heidenstedt (프로세스) |
| --------- | ------------------------- | ---------------------- |
| 초점      | Claude Code 설정          | 모든 AI 코더에 적용    |
| CLAUDE.md | 팀 공유, 지속 업데이트    | 콘텐츠 전략            |
| 테스트    | 브라우저/CLI로 검증       | AI 방지 테스트 설계    |
| 품질      | PostToolUse hooks         | 리뷰 마커              |
| 워크플로우 | 계획 + 자동 승인         | 프로토타입 + 점진적    |
| 보안      | 권한 허용 목록            | HIGH-RISK 마커         |

Boris는 Claude에 올바른 제약을 줘서 더 나은 출력이 나오게 해요. Heidenstedt는 나쁜 출력이 걸러지도록 워크플로우를 설계해요. 입력 쪽의 제약과 출력 쪽의 검증이에요.

## YK Dojo -- 실무 워크플로우

Boris와 Heidenstedt가 프레임워크를 준다면, YK Dojo의 레포는 헤비 유저의 일상 습관 더미에 가까워요.

### 음성 입력

로컬 전사(transcription)를 쓰는데, 손으로 타이핑하는 것보다 말하는 게 빠르다는 전제예요. 로컬 모델도 정확도가 충분하다고 해요 — Claude가 문맥으로 오전사를 알아서 복구하거든요. 이어폰에 대고 속삭이면 비행기에서도 된다고 해요.

### Context 신선도

그의 비유는 이래요. AI context는 우유 같아서 신선할 때가 제일 좋아요. 새 대화는 앞부분 맥락을 끌고 다니지 않아서 더 잘 동작하니까, 주제마다 새로 시작하거나 품질이 떨어지기 시작하면 새로 시작하세요.

연속성이 필요할 때는 먼저 Claude에게 핸드오프 문서를 쓰게 하세요. 뭘 시도했고, 뭐가 됐고, 뭐가 안 됐는지를 적어두면 다음 세션이 그 파일 하나만 읽고 이어갈 수 있어요.

### 캐스케이드 멀티태스킹

새 작업마다 오른쪽에 새 탭을 열고, 왼쪽에서 오른쪽으로 오래된 것부터 최신 순으로 쓸어가요. 동시에 최대 서너 개를 권해요. 특정 기술적 세팅보다 정리된 상태를 유지하는 게 더 중요하다는 얘기예요.

### 자동화 진행

가장 오래 남는 패턴은 수동 작업에서 자동화로 단계적으로 옮겨가는 거예요:

```text
manual → CLAUDE.md rule → skill → script → full automation
```

같은 일을 반복하고 있다는 걸 알아채면 `CLAUDE.md`에 넣어요. 그게 복잡해지면 skill이 돼요. skill이 안정되면 script가 돼요. 각 단계는 앞 단계가 스스로를 증명한 뒤에만 넘어가요.

### 반절 클론 대화

대화가 너무 길어지면 반절 클론으로 나중 절반만 남기고 이어가요. 최근 맥락은 보존하고 오래된 건 버리는 거죠. 매 응답 후 context 사용량을 확인하는 hook에 연결해서 85%를 넘으면 클론을 제안하게 해뒀어요.

auto-compact 대비 장점으로 결정론성을 들어요. 반절 클론은 요약하지 않고 실제 메시지를 그대로 남기니까요.

## 세 레이어로 본 그림

| 측면      | Boris (도구)       | Heidenstedt (프로세스) | YK Dojo (실무)       |
| --------- | ------------------ | ---------------------- | -------------------- |
| 초점      | Claude Code 설정   | AI 도구 전반           | 일상 워크플로우      |
| CLAUDE.md | 팀 공유            | 콘텐츠 전략            | 단순 유지, 리뷰      |
| 테스트    | CLI로 검증         | AI 방지 설계           | Write-test 사이클    |
| 품질      | PostToolUse hooks  | 리뷰 마커              | 자가 점검 프롬프트   |
| 워크플로우 | 계획 + 자동 승인  | 프로토타입 + 점진적    | 캐스케이드 + 음성    |
| Context   | Web UI 병렬 처리   | N/A                    | 신선 유지 + 핸드오프 |

## 어디서부터 시작할까

이걸 한꺼번에 도입하면 막으려던 인지 과부하가 그대로 생겨요. 비용이 싼 것부터 순서를 잡으면 이래요.

**Boris의 기초.** `CLAUDE.md`를 만들고 Claude가 뭔가 틀릴 때마다 규칙을 추가하세요. 포매팅 hook을 설정하세요. auto-accept 전에 plan 모드를 쓰세요.

**Heidenstedt의 규율.** Claude에게 맡기지 말고 상위 수준 테스트를 직접 쓰세요. 진짜 위험한 함수에 마커를 다세요. 확정 전에 프로토타입을 만드세요.

**YK Dojo의 효율.** 두세 개 세션으로 캐스케이드 멀티태스킹을 해보세요. 긴 프롬프트에 음성 입력을 써보세요. 주제마다 새 세션을 시작하고 연속성은 핸드오프 문서로 유지하세요.

그다음은 자동화 진행이 알아서 흘러가게 두세요. 한 줄짜리 수정이라면 이걸 전부 건너뛰는 것도 충분히 합리적이에요. 문자열 상수 하나 바꾸는데 병렬 세션과 검증 hook의 오버헤드는 값을 못 해요.

## 정리

이 워크플로우들은 세 레이어에 걸쳐 있어요. 도구 설정, 프로세스 규율, 일상 실무예요. "덜 조종하라"와 "전부 통제하라" 사이의 모순은 서로 다른 레이어를 겨냥한다는 걸 보는 순간 사라져요. Boris는 조종이 덜 필요하도록 도구를 설정해요. Heidenstedt는 나쁜 출력이 걸러지도록 프로세스를 설계해요. YK Dojo는 일상 루프를 최적화해요.

각 소스에서 하나씩만 가져간다면 이거예요. `CLAUDE.md`를 살아있는 문서로 만들 것, 테스트는 직접 쓸 것, context는 우유처럼 다룰 것.
