---
title: CSS Inline-Replaced Element Gap
description: 'Elements like `<textarea>`, `<img>`, `<input>`, and `<video>` are'
date: 2026-02-13T00:00:00.000Z
updated: 2026-02-13T00:00:00.000Z
tags:
  - general
  - css
  - frontend
category: general
draft: false
lang: en
references:
  - url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/vertical-align'
    title: vertical-align — MDN Web Docs
    type: authoritative
  - url: 'https://developer.mozilla.org/en-US/docs/Glossary/Replaced_elements'
    title: Replaced elements — MDN Glossary
    type: authoritative
---

"inline-replaced" elements in CSS. By default, they sit on the text baseline,
and their parent container reserves space below them for text descenders (the
tails of letters like g, y, p, q). This creates a mysterious gap between the
element's bottom edge and its parent's bottom edge.

## Key Points

- The gap size depends on the parent's `font-size` and `line-height` (typically
  3-7px)
- The gap appears even when there is no text content in the parent
- It is NOT caused by margin, padding, or border — inspecting the box model
  shows nothing
- This is one of the most common CSS "gotchas" and affects any inline-replaced
  element inside a block container

## The Problem

```html
<div class="relative">
  <!-- textarea is 50px tall, but parent div becomes 56.5px -->
  <textarea rows="2" />
  <!-- Absolutely positioned button centers to 56.5px, not 50px -->
  <button class="absolute top-1/2 -translate-y-1/2">Mic</button>
</div>
```

The mic button's `top-1/2` calculates 50% of 56.5px (28.25px), not 50% of the
textarea's 50px (25px), causing a 3.25px misalignment.

## The Fix

Three approaches, in order of preference:

```css
/* 1. Make parent a flex container (best — eliminates baseline) */
.parent {
  display: flex;
}

/* 2. Make the element block-level */
textarea {
  display: block;
}

/* 3. Remove line-height from parent */
.parent {
  line-height: 0;
}
```

In Tailwind CSS:

```html
<!-- Add "flex" to the parent div -->
<div class="relative flex-1 flex">
  <textarea class="w-full" rows="2" />
  <button class="absolute top-1/2 -translate-y-1/2 right-1.5">Mic</button>
</div>
```

## When to Watch For This

- Overlaying buttons on textarea/input (chat UIs, search bars)
- Image galleries where `<img>` elements have bottom gaps
- Any layout where an inline-replaced element is inside a div and you need
  pixel-perfect vertical alignment
- Flex containers with textarea/img children where `align-items: stretch` makes
  the parent taller than expected

## Verification Method

Use browser DevTools or Playwright to compare computed heights:

```javascript
const parent = element.parentElement;
const parentRect = parent.getBoundingClientRect();
const childRect = element.getBoundingClientRect();
console.log("Gap:", parentRect.height - childRect.height);
// If gap > 0 and there's no padding/border, it's the
// inline-replaced baseline gap
```

## Difficulties Encountered

- The gap is invisible in DevTools box model inspector (no margin/padding shown)
- `align-items: center` on the outer flex row doesn't fix it because the inner
  relative div still has the gap
- Measured with Playwright: parent 56.5px, textarea 50px, delta 6.5px — all from
  descender space
