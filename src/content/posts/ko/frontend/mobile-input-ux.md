---
title: "모바일 Input UX"
description: >-
  커스텀 스타일 input이 모바일 브라우저에서 제대로 동작하도록 만드는 기법을 알아봅니다.
date: 2026-01-27T00:00:00.000Z
updated: 2026-01-27T00:00:00.000Z
tags:
  - frontend
  - mobile
  - css
category: frontend
draft: false
lang: ko
source_lang: en
source_slug: mobile-input-ux
source_updated: "2026-01-27"
translation_date: "2026-02-12"
references:
  - url: "https://bugs.webkit.org/show_bug.cgi?id=159357"
    title: WebKit Bug 159357 - 숨겨진 Input의 터치 이벤트
    type: verified
  - url: "https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action"
    title: MDN touch-action CSS 속성
    type: authoritative
  - url: >-
      https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input#attr-inputmode
    title: MDN HTML Input Element - inputmode 속성
    type: authoritative
---

터미널 스타일 블로그의 input이 데스크톱에서는 완벽하게 동작했어요. 그런데 실제
폰에서 테스트했더니, 탭해도 아무 반응이 없었습니다. 키보드도 안 뜨고, 커서도
안 뜨고, 반응이 전혀 없었어요. Chrome DevTools 반응형 모드에서는 문제 없어
보였던 숨겨진 input 패턴이 실제 모바일 Safari에서는 완전히 깨져 있었습니다.

이건 발견하는 데 오후 내내 걸린 CSS 속성 세 개에 대한 이야기예요.

## 숨겨진 Input 패턴

터미널 스타일 input을 커스텀 블록 커서와 함께 만들 때는 두 개의 레이어를
사용합니다:

1. 투명한 텍스트로 실제 키보드 입력을 받는 숨겨진 `<input>`
2. 스타일된 블록 커서가 있는 텍스트를 보여주는 보이는 `<div>` 오버레이
   (`pointer-events: none`)

데스크톱에서는 완벽하게 동작합니다. 오버레이가 클릭을 무시하고, 클릭이 input으로
전달되고, input이 키 입력을 캡처합니다. 하지만 모바일에서는 터치 이벤트가 다른
규칙을 따릅니다.

## 무엇이 잘못됐나

네 가지 문제가 겹쳐서 디버깅이 힘들었어요.

**터치 이벤트가 숨겨진 input에 도달하지 못했습니다.** 오버레이 div에
`pointer-events: none`이 있어서 터치가 통과해야 하는데, input 요소에 명시적인
`z-index`가 없으면 모바일 Safari가 input을 완전히 무시했어요. 데스크톱
브라우저에서는 이 문제가 없습니다.

**iOS Safari가 포커스 시 자동 줌을 했습니다.** 자동 줌이 viewport나 meta 태그
문제처럼 보였지만, 실제 원인은 input 요소의 `font-size < 16px`이었어요. 텍스트가
투명하고 보이지 않는데도 Safari는 여전히 "가독성 줌" 동작을 적용했습니다.

**일부 WebKit 브라우저에서 텍스트가 여전히 보였습니다.** `color: transparent`
만으로는 모든 WebKit 브라우저에서 텍스트 커서와 선택 하이라이트를 완전히 숨기지
못했어요. `-webkit-text-fill-color: transparent` 속성도 추가로 필요했습니다.

**Chrome DevTools 반응형 모드로는 이 문제들을 재현할 수 없었습니다.** 터치 이벤트
문제, 줌 동작, WebKit 투명도 차이 모두 실제 모바일 기기에서만 나타났어요. 반응형
모드는 화면 크기만 시뮬레이션하지, 터치 이벤트 처리나 WebKit 렌더링 특성은
시뮬레이션하지 않습니다.

## 해결법

모든 모바일 브라우저에서 동작하는 마크업입니다:

```html
<div class="relative">
  <!-- 숨겨진 input - 모바일에서 터치를 받으려면 z-index 필수 -->
  <input
    type="text"
    class="absolute inset-0 z-10 h-full w-full bg-transparent caret-transparent"
    style="color: transparent; -webkit-text-fill-color: transparent; font-size: 16px;"
    autocomplete="off"
    autocapitalize="off"
  />
  <!-- 보이는 오버레이 -->
  <div class="pointer-events-none">
    {text}<span class="cursor-block">{currentChar}</span>
  </div>
</div>
```

모든 속성에 이유가 있습니다:

| 속성                      | 목적                                          |
| ------------------------- | --------------------------------------------- |
| `z-10`                    | 터치 이벤트를 받기 위해 input을 최상단에 배치 |
| `h-full`                  | 컨테이너를 채우는 명시적 높이                 |
| `font-size: 16px`         | iOS Safari 포커스 시 줌 방지                  |
| `-webkit-text-fill-color` | WebKit 브라우저에서 더 나은 투명도 처리       |

## `font-size: 16px`가 중요한 이유

Safari는 font-size가 16px 미만인 input 필드에 자동으로 줌합니다. Apple은 이것을
작은 화면에서 가독성을 향상시키는 기능으로 봅니다. 텍스트가 투명한지는 상관
없어요. input이 숨겨져 있어도 상관없어요. 계산된 font-size가 14px이면 Safari가
줌합니다.

수정은 간단해요: 텍스트가 보이지 않더라도 input에는 항상 `font-size: 16px`
이상을 사용하세요. 이 속성 하나로 커스텀 모바일 input에서 가장 흔한 불만을
제거할 수 있습니다.

## `z-index`가 터치 이벤트를 고치는 이유

데스크톱 브라우저는 최상위 요소의 `pointer-events`를 확인하고 `none`이면 아래로
전달합니다. 모바일 Safari는 아래 요소에 명시적인 stacking context가 없으면 터치
이벤트에 대해 이 동작을 안정적으로 하지 않습니다.

숨겨진 input에 `z-10`(또는 명시적 `z-index`)을 추가하면 브라우저가 터치 이벤트
해석에 해당 요소를 포함하게 됩니다. 이것이 없으면 input은 DOM에는 존재하지만
터치 이벤트 시스템에는 보이지 않습니다.

## 이런 경우에 사용하세요

- 모바일에서 동작해야 하는 커스텀 스타일 텍스트 input (터미널 에뮬레이터, 코드
  에디터, 명령어 팔레트) 을 만들 때
- 보이는 오버레이가 스타일된 텍스트를 표시하는 숨겨진 input 패턴을 사용할 때
- iOS Safari 호환성이 필요할 때

## 이런 경우에는 사용하지 마세요

- **일반 폼 input** -- 보통의 `<input>`이나 `<textarea>`를 사용한다면 이런
  핵이 필요 없어요. 브라우저가 터치 이벤트를 알아서 처리합니다.
- **데스크톱 전용 애플리케이션** -- z-index와 font-size 우회법은 모바일 브라우저
  특유의 문제를 위한 것이라 데스크톱에서는 불필요한 복잡성을 추가합니다.
- **접근성이 최우선인 폼** -- 실제 input을 숨기고 시각적 오버레이를 보여주면
  스크린 리더가 혼란스러워할 수 있어요. 접근성이 최우선이면 네이티브 input에 CSS
  스타일링을 적용하세요.
- **ContentEditable 접근법** -- `contenteditable`을 사용한다면 터치 이벤트와
  z-index 문제가 해당되지 않습니다.

## 핵심 정리

커스텀 스타일 input을 만든다면 실제 모바일 기기에서 일찍 테스트하세요. Chrome
DevTools 반응형 모드로는 이 문제들을 잡을 수 없습니다. 세 가지 필수 속성은
터치 이벤트를 위한 `z-index`, iOS 줌 방지를 위한 `font-size: 16px`, 완전한
크로스 브라우저 투명도를 위한 `-webkit-text-fill-color: transparent`입니다.
모바일에서는 이것들이 선택이 아닌 필수예요.

## 참고 자료

- [WebKit Bug Tracker: Input 줌 동작](https://bugs.webkit.org/show_bug.cgi?id=159357)
- [MDN: touch-action CSS 속성](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action)
- [MDN: Input inputmode 속성](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input#attr-inputmode)
