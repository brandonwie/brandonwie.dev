---
title: 모바일 Input UX
description: 커스텀 스타일 input이 모바일 브라우저에서 제대로 동작하도록 만드는 기법을 알아봅니다.
date: 2026-01-27T00:00:00.000Z
updated: '2026-03-22'
tags:
  - frontend
  - mobile
  - css
category: frontend
draft: false
lang: ko
source_lang: en
source_slug: mobile-input-ux
source_updated: '2026-03-22'
translation_date: '2026-02-20'
references:
  - url: 'https://bugs.webkit.org/show_bug.cgi?id=159357'
    title: WebKit Bug 159357 - 숨겨진 Input의 터치 이벤트
    type: verified
  - url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action'
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

이건 발견하는 데 오후 내내 걸린 다섯 가지 CSS 함정에 대한 이야기예요.

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

### 1. 데스크톱 테스트만 했던 맹점

Chrome DevTools에는 모바일 화면 크기를 시뮬레이션하는 반응형 모드가 있어요.
거기서 테스트하면 잘 동작합니다. 그리고 실제 폰을 들었죠.

터치 이벤트 문제는 DevTools에서 재현되지 않아요. 실제 기기에서 진짜 Safari를
써야 발견할 수 있습니다. 잘 동작하는 것처럼 보이는 코드를 멍하니 바라보는 데
30분을 썼어요.

### 2. `pointer-events: none`만으로는 부족했어요

오버레이 div에 `pointer-events: none`이 있어서 터치가 아래 input으로 통과해야
합니다. 데스크톱에서는 그렇게 동작해요. 모바일 Safari에서는 이것만으로는
부족합니다.

숨겨진 input에 명시적인 `z-index`가 없으면 모바일 Safari는 그 input이
인터랙티브한 요소인지 모릅니다. 터치 이벤트가 오버레이에 도달하고, 통과하고,
그리고... 아무 일도 일어나지 않아요. input은 존재하지만 Safari가 비활성 요소로
취급합니다.

수정은 input에 `z-10`을 추가하는 것입니다. 이 요소가 stacking context에
실제로 참여하는 요소임을 브라우저에 알려줘야 터치 이벤트가 제대로 전달돼요.

### 3. iOS 줌 트리거가 예상 밖이었어요

input에 포커스가 생기자 페이지가 줌인됐습니다. Safari가 작은 input에 적용하는
그 거슬리는 자동 줌이었어요. viewport meta 태그 문제인가 싶었고, `touch-action`
문제인가도 싶었습니다. 둘 다 아니었어요.

트리거는 input 요소의 `font-size`였습니다. 16px 미만이면 Safari가 줌합니다.
텍스트가 완전히 투명해서 아무도 볼 수 없어도 상관없어요. 브라우저는 font-size를
확인하고 줌 여부를 결정합니다.

수정은 간단해요: input에 항상 `font-size: 16px`을 사용하세요.

### 4. WebKit 특유의 투명도 처리

`color: transparent`는 대부분의 브라우저에서 텍스트를 숨겨요. WebKit에서는
텍스트는 숨기지만 텍스트 커서나 선택 하이라이트는 숨기지 못합니다. 일부 Safari
버전에서는 "보이지 않는" input 안에서 깜빡이는 커서가 오버레이 뒤에 유령처럼
보이기도 했어요.

수정하려면 표준 속성과 함께 vendor prefix 속성도 추가해야 합니다:

```css
color: transparent;
-webkit-text-fill-color: transparent;
```

이 조합으로 WebKit에서 커서와 선택 렌더링을 완전히 억제할 수 있어요. 대부분의
튜토리얼에는 나오지 않고, 이미 찾고 있지 않으면 MDN 문서에서도 바로 보이지
않습니다.

### 5. 치수는 맞는데 커서 오버레이가 보이지 않았어요

이게 가장 이상했어요. 블록 커서 요소의 computed 치수는 올바른 상태였습니다 --
inspector에서 10x19px을 확인했어요. 그런데 보이질 않았습니다.

CSS가 잘못됐나 싶었고, 애니메이션 문제인가도 싶었고, 색상 변수가 문제인가도
의심했어요. Playwright MCP로 라이브 페이지를 직접 살펴봤습니다. 같은 위치에
`z-index: 9999`인 50x50 빨간 사각형을 삽입했더니 바로 보였어요. 그리고
z-index 없는 커서 요소를 봤더니 -- 보이지 않았습니다.

숨겨진 input에 `z-10`이 있었는데, 이게 stacking context를 만들어요. 오버레이
div는 DOM 순서상 input 다음에 렌더링되지만, 자체 `z-index`가 없으면 같은
방식으로 stacking context에 참여하지 못합니다. 투명하지만 존재하는 input 레이어가
커서 요소 위에 그려져서, 눈에 보이는 건 없는데도 커서를 시각적으로 가리고
있었어요.

수정: 오버레이 div에 `relative z-20`을 추가하고, 클릭이 여전히 input으로
통과하도록 `pointer-events-none`도 함께 사용합니다.

### 6. `inline-block`의 CSS 높이 붕괴

블록 커서는 `display: inline-block`인 `<span>`입니다. 내용은 공백 문자 하나 --
커서가 빈 문자열 끝에 있을 때 너비를 주기 위한 최소한의 내용이에요.

`inline-block` span 안의 공백 문자는 `height: 0`으로 계산됩니다. 요소는
존재하고, 너비도 맞는데, 높이가 없어요. 보이질 않습니다.

수정은 줄 높이에 맞는 명시적 높이를 주는 것입니다:

```css
height: 1.2em;
vertical-align: text-bottom;
```

`vertical-align: text-bottom`은 커서 블록을 텍스트 줄 하단에 맞춰 옆 문자들과
자연스럽게 이어지게 합니다.

## 해결법

모든 수정이 적용된 전체 마크업입니다:

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
  <!-- Overlay: z-20 paints above the z-10 input's stacking context -->
  <div class="pointer-events-none relative z-20">
    {text}<span class="cursor-block">{currentChar}</span>
  </div>
</div>
```

### 커서 CSS

```css
.cursor-block {
  display: inline-block;
  min-width: 1ch;
  height: 1.2em;
  vertical-align: text-bottom;
  background-color: var(--accent-orange);
  color: var(--bg-primary);
  animation: blink 1s step-end infinite;
}
```

## 핵심 CSS 속성 정리

| 속성                      | 목적                                            |
| ------------------------- | ----------------------------------------------- |
| `z-10`                    | 터치 이벤트를 받기 위해 input을 최상단에 배치   |
| `relative z-20`           | 오버레이가 input의 stacking context 위에 그려짐 |
| `pointer-events-none`     | 클릭이 오버레이를 통과해 숨겨진 input에 전달    |
| `h-full`                  | 컨테이너를 채우는 명시적 높이                   |
| `height: 1.2em`           | inline-block 높이 붕괴 방지                     |
| `font-size: 16px`         | iOS Safari 포커스 시 줌 방지                    |
| `-webkit-text-fill-color` | WebKit 브라우저에서 텍스트 커서 표시 억제       |

## `font-size: 16px`가 중요한 이유

Safari는 font-size가 16px 미만인 input 필드에 자동으로 줌합니다. Apple은 이것을
작은 화면에서 가독성을 향상시키는 기능으로 봅니다. 텍스트가 투명한지는 상관
없어요. input이 숨겨져 있어도 상관없어요. 계산된 font-size가 14px이면 Safari가
줌합니다.

수정은 간단해요: 텍스트가 보이지 않더라도 input에는 항상 `font-size: 16px`
이상을 사용하세요. 이 속성 하나로 커스텀 모바일 input에서 가장 흔한 불만을
제거할 수 있습니다.

## `z-index`가 터치 이벤트를 고치는 이유

이건 브라우저 동작의 특이점이지, 명확한 설계 결정이 아니에요.

모바일 Safari에서 터치 이벤트는 stacking context를 따릅니다. 명시적인
`z-index`가 없는 요소는 다른 요소가 시각적으로 가리지 않아도 터치 hit-test
대상에서 제외될 수 있어요. `pointer-events: none`인 투명 오버레이는 이벤트를
통과시키지만, 받는 요소도 stacking context에 실제로 참여하는 요소여야 합니다.

input에 `z-10`을 추가하면 stacking context 참여자가 돼요. 그러면 Safari가
터치 이벤트를 올바르게 라우팅합니다. 이건
[WebKit에 문서화된 동작](https://bugs.webkit.org/show_bug.cgi?id=159357)이에요.

같은 논리가 `z-20`인 오버레이에도 적용됩니다. input이 `z-10`, 오버레이가
`z-20`이지만, 오버레이에 `pointer-events-none`이 있어서 터치 이벤트는
통과합니다. 더 높은 z-index는 커서가 투명하지만 존재하는 input 레이어 위에
시각적으로 렌더링되도록 하기 위해서만 필요해요.

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

숨겨진 input에 시각적 오버레이를 사용한다면, 모바일에서 제대로 동작하려면
다섯 가지 속성이 함께 맞아야 해요:

1. input에 `z-10` (터치 이벤트)
2. 오버레이에 `relative z-20` (stacking context)
3. input에 `font-size: 16px` (iOS 줌 방지)
4. `-webkit-text-fill-color: transparent` (WebKit 커서 표시)
5. 커서 요소에 `height: 1.2em` (inline-block 높이 붕괴)

하나라도 빠지면 모바일에서 뭔가 깨집니다. 데스크톱 테스트는 전부 통과해요.
실제 폰을 들어봐야 알 수 있습니다.

## 참고 자료

- [WebKit Bug Tracker: Input 줌 동작](https://bugs.webkit.org/show_bug.cgi?id=159357)
- [MDN: touch-action CSS 속성](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action)
- [MDN: Input inputmode 속성](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input#attr-inputmode)
