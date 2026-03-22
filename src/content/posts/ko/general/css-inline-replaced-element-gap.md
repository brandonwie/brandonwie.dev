---
title: CSS Inline-Replaced 요소의 하단 갭
description: >-
  `<textarea>`, `<img>`, `<input>`, `<video>` 같은 요소는 CSS에서 inline-replaced 요소예요.
  기본적으로 텍스트 baseline 위에 놓여서 신비한 하단 갭이 생겨요.
date: 2026-02-13T00:00:00.000Z
updated: 2026-02-13T00:00:00.000Z
tags:
  - general
  - css
  - frontend
category: general
draft: false
lang: ko
source_lang: en
source_slug: css-inline-replaced-element-gap
source_updated: '2026-03-22'
translation_date: '2026-03-04'
references:
  - url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/vertical-align'
    title: vertical-align — MDN Web Docs
    type: authoritative
  - url: 'https://developer.mozilla.org/en-US/docs/Glossary/Replaced_elements'
    title: Replaced elements — MDN Glossary
    type: authoritative
---

기본적으로 이 요소들은 텍스트 baseline 위에 놓이고, 부모 컨테이너는 텍스트 descender(g, y, p, q 같은 글자의 꼬리 부분)를 위한 공간을 아래에 남겨둬요. 이로 인해 요소의 하단과 부모의 하단 사이에 알 수 없는 갭이 생기죠.

## 핵심 포인트

- 갭 크기는 부모의 `font-size`와 `line-height`에 따라 달라져요(보통 3-7px)
- 부모에 텍스트 콘텐츠가 없어도 갭이 나타나요
- margin, padding, border 때문이 아니에요 — box model을 검사해도 아무것도 안 보여요
- CSS에서 가장 흔한 "gotcha" 중 하나로, block 컨테이너 안에 있는 모든 inline-replaced 요소에 영향을 줘요

## 문제

```html
<div class="relative">
  <!-- textarea는 50px인데, 부모 div는 56.5px -->
  <textarea rows="2" />
  <!-- 절대 위치 버튼이 50px가 아닌 56.5px 기준으로 중앙 정렬 -->
  <button class="absolute top-1/2 -translate-y-1/2">Mic</button>
</div>
```

마이크 버튼의 `top-1/2`가 textarea의 50px(25px)이 아니라 56.5px의 50%(28.25px)로 계산돼서, 3.25px의 정렬 오차가 생겨요.

## 수정 방법

세 가지 접근법(선호 순서):

```css
/* 1. 부모를 flex 컨테이너로 만들기 (최선 — baseline 제거) */
.parent {
  display: flex;
}

/* 2. 요소를 block-level로 만들기 */
textarea {
  display: block;
}

/* 3. 부모의 line-height 제거 */
.parent {
  line-height: 0;
}
```

Tailwind CSS에서:

```html
<!-- 부모 div에 "flex" 추가 -->
<div class="relative flex-1 flex">
  <textarea class="w-full" rows="2" />
  <button class="absolute top-1/2 -translate-y-1/2 right-1.5">Mic</button>
</div>
```

## 주의해야 할 상황

- textarea/input 위에 버튼을 겹치는 경우 (채팅 UI, 검색바)
- `<img>` 요소에 하단 갭이 생기는 이미지 갤러리
- inline-replaced 요소가 div 안에 있고 픽셀 단위 수직 정렬이 필요한 레이아웃
- textarea/img 자식이 있는 flex 컨테이너에서 `align-items: stretch`가 부모를 예상보다 높게 만드는 경우

## 검증 방법

브라우저 DevTools나 Playwright로 computed height를 비교하세요:

```javascript
const parent = element.parentElement;
const parentRect = parent.getBoundingClientRect();
const childRect = element.getBoundingClientRect();
console.log("Gap:", parentRect.height - childRect.height);
// gap > 0이고 padding/border가 없다면,
// inline-replaced baseline 갭이에요
```

## 겪었던 어려움

- DevTools box model inspector에서 갭이 보이지 않아요(margin/padding 표시 없음)
- 외부 flex row의 `align-items: center`로는 해결이 안 돼요. 내부 relative div에 여전히 갭이 있으니까요
- Playwright로 측정: 부모 56.5px, textarea 50px, 차이 6.5px — 전부 descender 공간이었어요
