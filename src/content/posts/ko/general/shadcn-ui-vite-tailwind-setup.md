---
title: shadcn/ui 수동 설정 (Vite + Tailwind)
description: >-
  Vite + React + TypeScript + Tailwind CSS 프로젝트에서 shadcn CLI 없이 shadcn/ui 컴포넌트
  프리미티브를 수동으로 설정하는 방법입니다.
date: 2026-02-04T00:00:00.000Z
updated: '2026-03-22'
tags:
  - general
  - react
  - shadcn-ui
  - tailwind
  - vite
  - frontend
category: general
draft: false
lang: ko
source_lang: en
source_slug: shadcn-ui-vite-tailwind-setup
source_updated: '2026-03-22'
translation_date: '2026-02-12'
references:
  - url: null
    title: Manual shadcn/ui setup in Vite + Tailwind project
    type: experience
  - url: 'https://ui.shadcn.com/docs/installation/vite'
    title: shadcn/ui Vite Installation Guide
    type: official
  - url: 'https://tailwindcss.com/docs/installation'
    title: Tailwind CSS Installation Documentation
    type: official
---

React 대시보드 프로젝트에 컴포넌트 라이브러리가 필요했어요. 요구사항이
구체적이었습니다: 처음부터 다크 테마, 스타일링에 대한 완전한 제어, 비대한
의존성 트리 없을 것. Material UI, Chakra, Ant Design을 살펴봤어요. 전부
원하지 않는 의견과 필요 없는 CSS-in-JS 오버헤드를 갖고 있었습니다.

그러다 shadcn/ui를 발견했어요. 전통적인 의미의 컴포넌트 라이브러리가 아니에요.
의존성으로 설치하는 게 아니라 컴포넌트를 프로젝트에 복사해서 완전히 소유하는
방식이에요. 접근성을 위해 Radix UI 프리미티브로 구축되고, 유연성을 위해
Tailwind CSS로 스타일링돼요. CLI를 건너뛰고 수동으로 설정해서 모든 조각을
이해했습니다.

## CLI 대신 수동 설정을 선택한 이유

shadcn/ui 문서는 `npx shadcn-ui init`을 실행하라고 권장해요. 작동하지만
블랙박스예요. `components.json` 설정 파일을 생성하고, 필요 없을 수 있는
의존성을 설치하고, 정해진 폴더 구조를 만들어요. 완전한 제어를 원하는
프로젝트에서는 수동 설정이 더 나은 선택이었습니다.

| 요소   | CLI (`npx shadcn-ui init`) | 수동           |
| ------ | -------------------------- | -------------- |
| 제어   | 정해진 구조                | 완전한 제어    |
| 의존성 | 전부 설치                  | 필요한 것만    |
| 설정   | `components.json` 생성     | 불필요         |
| 학습   | 블랙박스                   | 각 요소를 이해 |

수동 접근법은 더 적은 의존성을 설치하고 각 조각이 무슨 역할을 하는지 이해하도록
강제해요. 뭔가 깨지면 어디를 봐야 하는지 알 수 있습니다.

## shadcn/ui가 실제로 무엇인가

shadcn/ui는 Radix UI 프리미티브 위에 구축된 copy-paste 컴포넌트 모음이에요.
Radix가 어려운 접근성 작업을 처리합니다 -- 키보드 내비게이션, 포커스 관리,
ARIA 속성. shadcn/ui는 이 프리미티브를 Tailwind 스타일로 감싸고 일관된 API를
제공해요.

핵심 의존성은 작고 조합 가능해요:

| 패키지                     | 용도                               |
| -------------------------- | ---------------------------------- |
| `class-variance-authority` | 컴포넌트 variant 정의 (cva)        |
| `clsx`                     | 조건부 className 결합              |
| `tailwind-merge`           | 충돌하는 Tailwind 클래스 중복 제거 |
| `@radix-ui/react-slot`     | 다형성 `asChild` prop 지원         |
| `tailwindcss-animate`      | Tailwind용 애니메이션 유틸리티     |

## 단계별 설정

### 1. 의존성 설치

```bash
npm install class-variance-authority clsx tailwind-merge
npm install @radix-ui/react-slot
npm install tailwindcss-animate
```

명령어 세 개, 패키지 다섯 개. 시작하는 데 필요한 전부예요.

### 2. `cn()` 유틸리티 생성

모든 shadcn/ui 컴포넌트의 기반이에요. `clsx`(조건부 클래스 결합)와
`tailwind-merge`(클래스 중복 제거)를 결합합니다:

```typescript
// src/lib/utils.ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

두 라이브러리가 다 필요한 이유는? `clsx`는
`clsx('base', isActive && 'active')` 같은 조건부 클래스를 처리해요.
`tailwind-merge`는 `p-4 p-2` 같은 충돌을 `p-2`로 해소해요 (마지막이 승리).
둘을 합치면 className 조합이 예측 가능해집니다.

### 3. Tailwind 플러그인 추가

```javascript
// tailwind.config.js
plugins: [require("tailwindcss-animate")];
```

shadcn/ui 컴포넌트가 트랜지션에 사용하는 `animate-in`, `animate-out`,
`fade-in`, `slide-in-from-top` 같은 애니메이션 유틸리티를 추가해요.

### 4. Path Alias 설정

선택 사항이지만 강력히 권장해요. 없으면 import가 금방 장황해져요:

```typescript
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  }
}

// vite.config.ts
import path from 'path';
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') }
  }
});
```

이제 상대 경로를 탐색하는 대신 `import { cn } from '@/lib/utils'`로 쓸 수
있어요.

### 5. 테마용 CSS 변수 추가

shadcn/ui는 테마에 CSS 변수를 사용해요. 글로벌 스타일시트에 정의하세요:

```css
:root {
  --background: #1a1a1a;
  --foreground: #e5e5e5;
  --border: #404040;
  /* ... 디자인 토큰들 ... */
}
```

컴포넌트는 `bg-background`, `text-foreground`, `border-border` 같은
Tailwind 클래스를 통해 이 변수들을 참조해요.

## Variant로 컴포넌트 만들기

설정이 완료되면 variant 정의를 위해 `cva`(class variance authority)를
사용해서 컴포넌트를 만들어요:

```typescript
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        outline: "border border-border bg-transparent",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);
```

`cva` 함수는 기본 클래스 세트, variant 옵션, 기본값을 정의해요. 컴포넌트를
사용할 때 variant prop을 전달하면 `cva`가 최종 className을 계산해요. `cn()`
유틸리티가 모든 걸 병합하면서 충돌을 중복 제거합니다.

## 왜 이 방법이 효과적인가

수동 설정이 효과적인 이유는 shadcn/ui가 분해되도록 설계됐기 때문이에요.
숨겨진 런타임도 없고, 앱을 감싸야 하는 context provider도 없고, 기존
스타일과 충돌하는 글로벌 CSS도 없어요. 각 컴포넌트는 `cn()`과 Radix
프리미티브를 import하는 자기 완결적인 파일이에요. 필요한 걸 복사하고,
커스터마이징하고, 넘어가면 돼요.

`cn()` + `cva` 패턴은 Tailwind의 어려운 부분인 className 조합을 처리해줘요.
이게 없으면 조건부 클래스와 Tailwind 오버라이드를 결합하면 예측할 수 없는
결과가 나와요. 이게 있으면 마지막 클래스가 항상 이기고, 조건문이 깔끔합니다.

## 실전 팁

컴포넌트 라이브러리에 대한 완전한 제어를 원할 때 이 수동 설정을 사용하세요.
핵심 패키지 세 개(`class-variance-authority`, `clsx`, `tailwind-merge`)로
시작하고, `cn()` 유틸리티를 만들고, 컴포넌트별로 필요한 Radix 프리미티브를
추가하세요.

학습 프로젝트나 비표준 구조가 필요할 때는 CLI를 건너뛰세요. 기본 구조가
맞는 경우 빠른 프로토타이핑에는 CLI를 사용하세요.

핵심 인사이트: shadcn/ui는 의존하는 라이브러리가 아니에요. 소유하는 패턴의
모음이에요. `cn()` 유틸리티와 `cva` variant 시스템이 진짜 핵심 -- shadcn/ui의
구체적인 컴포넌트 없이도 사용할 수 있습니다.
