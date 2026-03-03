---
title: Mobile Input UX
description: Techniques for making custom-styled inputs work properly on mobile browsers.
date: 2026-01-27T00:00:00.000Z
updated: 2026-02-19T00:00:00.000Z
tags:
  - frontend
  - mobile
  - css
category: frontend
draft: false
lang: en
references:
  - url: 'https://bugs.webkit.org/show_bug.cgi?id=159357'
    title: WebKit Bug 159357 - Touch Events on Hidden Inputs
    type: verified
  - url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action'
    title: MDN touch-action CSS Property
    type: authoritative
  - url: >-
      https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input#attr-inputmode
    title: MDN HTML Input Element - inputmode Attribute
    type: authoritative
---

## Key Points

- Hidden inputs (transparent text for custom cursor styling) need explicit
  `z-index` to receive touch events on mobile
- iOS Safari zooms into inputs with `font-size` less than 16px - always use
  16px+
- Use `-webkit-text-fill-color: transparent` alongside `color: transparent` for
  better cross-browser support
- `autofocus` attribute helps with initial focus on page load
- The visible cursor overlay div needs `relative z-20` to paint above the `z-10`
  hidden input — even transparent elements occupy stacking context
- CSS `display: inline-block` with space-only content can collapse to
  `height: 0`; explicit `height: 1.2em` and `vertical-align: text-bottom` are
  needed for the block cursor

---

## The Problem

When creating a terminal-style input with a custom block cursor, the pattern is:

1. Hidden `<input>` with transparent text (receives actual input)
2. Visible `<div>` overlay showing text with block cursor (pointer-events: none)

On mobile, touch events may not reach the hidden input even with
`pointer-events: none` on the overlay.

---

## Difficulties Encountered

- **Desktop-only testing blind spot** -- The hidden input worked perfectly on
  desktop browsers; the touch event issue only surfaced on actual mobile
  devices, not in Chrome DevTools responsive mode.
- **`pointer-events: none` was insufficient alone** -- The overlay div had
  `pointer-events: none` which should let touches pass through, but without an
  explicit `z-index` on the input, mobile Safari ignored it entirely.
- **iOS zoom trigger was non-obvious** -- The auto-zoom on focus seemed like a
  viewport or meta-tag problem, but the actual trigger was `font-size` under `16px` on
  the input element (even when the text was transparent and invisible).
- **WebKit-specific transparency** -- `color: transparent` alone did not hide
  the text cursor/selection on all WebKit browsers; discovering that
  `-webkit-text-fill-color: transparent` was also needed required searching
  through vendor-prefix documentation.
- **Cursor overlay invisible despite correct dimensions** -- The block cursor
  `.cursor-block` had correct computed dimensions (10x19px) but was invisible.
  The hidden input's `z-10` painted a transparent layer on top of the cursor
  overlay, blocking it visually. Confirmed via Playwright MCP by inserting a
  50x50 red square with `z-index: 9999` (visible) vs the cursor without z-index
  (invisible). Fix: `relative z-20` on the overlay div plus
  `pointer-events-none` to let clicks pass through.
- **CSS height collapse with inline-block** -- The `.cursor-block` span with
  `display: inline-block` and only a space character as content computed to
  `height: 0`. Required explicit `height: 1.2em` to match line height.

---

## The Solution

```html
<div class="relative">
  <!-- Hidden input - must have z-index to receive touch on mobile -->
  <input
    type="text"
    class="absolute inset-0 z-10 h-full w-full bg-transparent caret-transparent"
    style="color: transparent; -webkit-text-fill-color: transparent; font-size: 16px;"
    autocomplete="off"
    autocapitalize="off"
  />
  <!-- Visible overlay - needs z-20 to paint above z-10 input -->
  <div class="pointer-events-none relative z-20">
    {text}<span class="cursor-block">{currentChar}</span>
  </div>
</div>
```

### Cursor CSS

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

## Critical CSS Properties

| Property                  | Purpose                                       |
| ------------------------- | --------------------------------------------- |
| `z-10`                    | Ensures input is on top for touch events      |
| `relative z-20`           | Overlay paints above input's stacking context |
| `pointer-events-none`     | Clicks pass through overlay to hidden input   |
| `h-full`                  | Explicit height to fill container             |
| `height: 1.2em`           | Prevents inline-block height collapse         |
| `font-size: 16px`         | Prevents iOS Safari zoom on focus             |
| `-webkit-text-fill-color` | Better transparency on WebKit browsers        |

## iOS Safari Specifics

Safari automatically zooms into input fields with font-size below 16px. This is
a "feature" to improve readability, but it breaks custom UIs. The fix is simple:
always use `font-size: 16px` or larger on inputs, even if the text is
transparent.

---

## When to Use

- Building custom-styled text inputs (terminal emulators, code editors, command
  palettes) that must work on mobile
- Any hidden input pattern where a visible overlay presents styled text
- iOS Safari compatibility is a requirement

## When NOT to Use

- **Standard form inputs** -- If you are using normal visible `<input>` or
  `<textarea>` elements, none of these hacks are needed; the browser handles
  touch events natively.
- **Desktop-only applications** -- The z-index and font-size workarounds are
  specifically for mobile browser quirks; on desktop they add unnecessary
  complexity.
- **Accessibility-critical forms** -- Hiding the real input and showing a visual
  overlay can confuse screen readers; prefer native inputs with CSS styling when
  accessibility is the top priority.
- **ContentEditable approach** -- If using `contenteditable` instead of a hidden
  input, the touch event and z-index issues do not apply.

---

## References

- [WebKit Bug Tracker: Input zoom behavior](https://bugs.webkit.org/show_bug.cgi?id=159357)
- Stack Overflow: "Disable auto zoom on input focus in iOS Safari"
