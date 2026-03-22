---
title: React 데모 파이프라인 패턴
description: 백엔드 없이 완전히 작동하는 React 대시보드 데모 모드를 구축하는 패턴을 소개합니다.
date: 2026-02-04T00:00:00.000Z
updated: '2026-03-22'
tags:
  - general
  - react
  - demo-mode
  - frontend
  - pipeline
category: general
draft: false
lang: ko
source_lang: en
source_slug: react-demo-pipeline-pattern
source_updated: '2026-03-22'
translation_date: '2026-02-12'
references:
  - url: null
    title: Crucio demo-only dashboard implementation
    type: experience
  - url: 'https://react.dev/reference/react/useContext'
    title: React useContext API Reference
    type: official
  - url: 'https://react.dev/learn/reusing-logic-with-custom-hooks'
    title: React Custom Hooks Documentation
    type: official
---

포트폴리오용 보안 운영 대시보드를 만들었어요. 문제는 첫날부터 명확했습니다:
포트폴리오 방문자는 제 백엔드 인프라에 접근할 수 없어요. 페이지에 들어와서
로딩 스피너를 보고 그냥 나가버리는 거죠. 대시보드는 백엔드 없이도 실제처럼
느껴지면서 작동해야 했습니다.

해결책은 데모 파이프라인이었어요 -- API에 접근할 수 없을 때 자동으로 감지하고,
데모 모드로 전환해서, 전체 데이터 처리 파이프라인을 로컬에서 시뮬레이션하는
패턴이에요. 사용자는 UI를 정상적으로 사용해요. 입력을 타이핑하고, 스테이지
진행을 지켜보고, 메트릭이 업데이트되는 걸 확인해요. 전부 시뮬레이션이지만
실제와 구분할 수 없는 경험을 제공합니다.

## 이 패턴이 존재하는 이유

포트폴리오 프로젝트는 근본적인 긴장이 있어요: 백엔드 통합 기술을 보여주지만
방문자는 백엔드에 접근할 수 없다는 것. 정적 스크린샷은 지루하고, 하드코딩된
mock 데이터는 티가 나요. 데모 파이프라인 패턴은 프론트엔드를 자립적으로
만들어서 이 문제를 해결해요. 현실적인 데이터를 생성하고, 사용자 입력에
지능적으로 반응하고, 실제같은 타이밍으로 비동기 처리 스테이지를
시뮬레이션합니다.

이 패턴은 포트폴리오를 넘어서도 활용돼요. 이해관계자 프레젠테이션용 데모
환경, 백엔드 서비스가 다운됐을 때의 개발 모드, 불안정한 네트워크에서의 컨퍼런스
데모 모두 같은 접근 방식의 혜택을 받습니다.

## 아키텍처

패턴은 세 레이어로 구성돼요: 모드 감지를 관리하는 context provider,
시뮬레이션을 구동하는 custom hook, 시뮬레이션된 데이터를 소비하는 widget
컴포넌트.

```text
DataModeProvider (context)
  |- mode: 'live' | 'demo'
  |- auto-detect: poll /api/v1/health
  +- manual toggle in TopNav

useDemoPipeline (hook)
  |- analyzeInput(text) -> scenario selection
  |- startPipeline(text) -> staged setTimeout
  |- pipelineState -> stage status map
  +- events[] -> real-time event stream

DashboardPage
  |- PipelineWidget (stage progression 표시)
  |- EventStreamWidget (스크롤링 로그)
  |- MetricsWidget (Recharts 시계열)
  |- IntentDistWidget (바 차트)
  |- SecurityWidget (통과율)
  +- SystemHealthWidget (게이지)
```

`DataModeProvider`가 전체 앱을 감싸요. 마운트 시와 30초마다 `/api/v1/health`를
폴링합니다. API에 접근할 수 없으면 자동으로 데모 모드로 전환해요. 상단
내비게이션의 수동 토글로 이 동작을 오버라이드할 수 있습니다.

## 스마트 입력 매칭

데모를 실제처럼 느끼게 하는 가장 중요한 부분은 사용자 입력에 지능적으로
반응하는 거예요. 랜덤 응답은 가짜 느낌이 나요. `analyzeInput` 함수가 사용자가
입력한 내용을 분석해서 적절한 시나리오를 선택합니다:

```typescript
function analyzeInput(text: string): DemoScenario {
  const lower = text.toLowerCase();

  // Check for PII patterns
  if (
    /\b\d{3}-\d{2}-\d{4}\b/.test(text) ||
    /\b[A-Z][a-z]+ [A-Z][a-z]+\b/.test(text)
  ) {
    return scenarios["pii-detected"];
  }

  // Check for injection attempts
  if (lower.includes("ignore") && lower.includes("instruction")) {
    return scenarios["injection-blocked"];
  }

  // Check for URLs
  if (/https?:\/\//.test(text)) {
    return scenarios["link-extraction"];
  }

  // Long/complex text
  if (text.length > 200 || text.includes("analyze")) {
    return scenarios["full-pipeline"];
  }

  return scenarios["simple-note"];
}
```

Social Security Number 패턴을 입력하면 대시보드가 PII를 감지해요. 프롬프트
인젝션처럼 보이는 걸 붙여넣으면 차단돼요. URL을 넣으면 링크 추출 스테이지가
활성화됩니다. 시스템이 실제로 입력을 처리하는 것처럼 느껴지는 이유는 단순히
뭔가 제출됐다는 사실이 아니라 콘텐츠에 반응하기 때문이에요.

## 단계별 파이프라인 시뮬레이션

실제 백엔드 처리는 한 번에 일어나지 않아요. 가변적인 타이밍으로 스테이지를
거쳐 진행됩니다. 시뮬레이션은 중첩 `setTimeout` 호출로 이를 미러링해요:

```typescript
function startPipeline(text: string) {
  const scenario = analyzeInput(text);

  scenario.stages.forEach((stage) => {
    setTimeout(() => {
      updateStage(stage.name, "processing");

      setTimeout(() => {
        updateStage(stage.name, stage.result);
        emitEvent(stage.event);
      }, stage.duration);
    }, stage.startDelay);
  });
}
```

각 시나리오는 자체 스테이지를 시작 딜레이와 지속 시간과 함께 정의해요.
"processing" 상태가 먼저 나타나고 (스피너나 프로그레스 인디케이터 표시),
스테이지 지속 시간 후에 최종 결과가 나타나요. 이벤트가 실시간으로 이벤트
스트림 위젯에 전달되어 라이브 처리 출력처럼 보이는 스크롤링 로그를 만듭니다.

## 데이터 생성기

파이프라인 외에도 대시보드에는 실시간으로 업데이트되는 메트릭이 필요해요.
팩토리 함수가 랜덤하지만 현실적인 mock 데이터를 생성합니다:

- **Metrics** -- 10초마다 갱신되는 약간의 랜덤 변동이 있는 시계열 데이터
- **Events** -- 파이프라인 스테이지 완료가 공급하는 스크롤링 이벤트 스트림
- **Health stats** -- 현실적인 범위 내에서 변동하는 시스템 게이지
- **Security stats** -- 시간에 따라 현실적으로 트렌드를 보이는 통과/실패율

10초 갱신 간격은 지속적인 변경으로 사용자를 압도하지 않으면서 대시보드가
살아있는 느낌을 줘요.

## 핵심 설계 결정

| 결정                                  | 근거                                           |
| ------------------------------------- | ---------------------------------------------- |
| 수동 전용 대신 자동 감지              | 포트폴리오 방문자가 데모를 자동으로 볼 수 있음 |
| 랜덤 대신 스마트 매칭                 | 사용자 입력이 "처리"되는 느낌                  |
| requestAnimationFrame 대신 setTimeout | 서버 지연시간을 현실적으로 시뮬레이션          |
| 주기적 데이터 갱신 (10초)             | 압도하지 않으면서 살아있는 느낌                |

## 왜 이 방법이 효과적인가

이 패턴은 포트폴리오 프로젝트를 괴롭히는 "내 컴퓨터에서만 작동한다" 문제를
제거하기 때문에 성공해요. 방문자는 인프라 접근 없이 전체 UI를 경험해요.
스마트 입력 매칭이 실제 처리의 환상을 만들어내요. 가변 딜레이의 단계별
타이밍이 실제 백엔드 동작을 모방해요. 그리고 자동 감지 덕분에 라이브 모드와
데모 모드 사이의 전환이 매끄럽게 이뤄져요 -- 수동 설정이 필요 없습니다.

## 실전 팁

백엔드와 독립적으로 작동하는 프론트엔드가 필요할 때 이 패턴을 사용하세요.
핵심 재료 세 가지는: 자동 감지 (health endpoint 폴링), 스마트 입력 매칭
(이벤트가 아닌 콘텐츠에 반응), 단계별 시뮬레이션 (즉시 응답이 아닌 가변
타이밍)이에요.

이 패턴은 포트폴리오 프로젝트, 이해관계자 프레젠테이션용 데모 환경, 백엔드
서비스가 다운됐을 때의 개발 모드, 불안정한 네트워크에서의 트레이드쇼나
컨퍼런스 데모에 적합해요.

백엔드가 항상 사용 가능하고 사용자가 프론트엔드를 독립적으로 상호작용할 필요가
없다면 이 패턴을 건너뛰세요. 시뮬레이션은 복잡성을 추가하고, 데모 시나리오와
실제 백엔드 동작 사이의 동일성을 유지하려면 지속적인 노력이 필요합니다.
