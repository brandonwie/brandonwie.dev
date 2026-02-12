---
title: Mobile Input UX
description: Techniques for making custom-styled inputs work properly on mobile browsers.
date: 2026-01-27T00:00:00.000Z
updated: 2026-01-27T00:00:00.000Z
tags:
  - frontend
  - mobile
  - css
category: frontend
draft: false
lang: en
references:
  - url: "https://bugs.webkit.org/show_bug.cgi?id=159357"
    title: WebKit Bug 159357 - Touch Events on Hidden Inputs
    type: verified
  - url: "https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action"
    title: MDN touch-action CSS Property
    type: authoritative
  - url: >-
      https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input#attr-inputmode
    title: MDN HTML Input Element - inputmode Attribute
    type: authoritative
---

My terminal-style blog input worked perfectly on desktop. Then I tested on an
actual phone. Tapping the input area did nothing. No keyboard, no cursor, no
response. The hidden input pattern that looked flawless in Chrome DevTools
responsive mode was completely broken on real mobile Safari.

This is the story of three CSS properties that took an entire afternoon to
discover.

## The Hidden Input Pattern

When you build a terminal-style input with a custom block cursor, you use a
two-layer approach:

1. A hidden `<input>` with transparent text that receives actual keyboard input
2. A visible `<div>` overlay showing the text with a styled block cursor
   (`pointer-events: none`)

On desktop, this works perfectly. The overlay ignores clicks, clicks pass
through to the input, and the input captures keystrokes. On mobile, touch events
follow different rules.

## What Went Wrong

Four separate issues combined to make this a frustrating debugging session.

**Touch events did not reach the hidden input.** The overlay div had
`pointer-events: none`, which should let touches pass through. But without an
explicit `z-index` on the input element, mobile Safari ignored the input
entirely. Desktop browsers do not have this problem.

**iOS Safari zoomed into the input on focus.** The auto-zoom looked like a
viewport or meta-tag problem, but the actual trigger was `font-size < 16px` on
the input element. Even though the text was transparent and invisible, Safari
still applied its "readability zoom" behavior.

**Text was still visible on some WebKit browsers.** `color: transparent` alone
did not fully hide the text cursor and selection highlight. WebKit browsers
needed the additional `-webkit-text-fill-color: transparent` property.

**Chrome DevTools responsive mode did not reproduce any of this.** The touch
event issue, the zoom behavior, and the WebKit transparency gap only surfaced on
actual mobile devices. Responsive mode simulates screen size, not touch event
handling or WebKit rendering quirks.

## The Solution

Here is the markup that works across all mobile browsers:

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
  <!-- Visible overlay -->
  <div class="pointer-events-none">
    {text}<span class="cursor-block">{currentChar}</span>
  </div>
</div>
```

Every property is there for a reason:

| Property                  | Purpose                                  |
| ------------------------- | ---------------------------------------- |
| `z-10`                    | Ensures input is on top for touch events |
| `h-full`                  | Explicit height to fill container        |
| `font-size: 16px`         | Prevents iOS Safari zoom on focus        |
| `-webkit-text-fill-color` | Better transparency on WebKit browsers   |

## Why `font-size: 16px` Matters

Safari automatically zooms into input fields with font-size below 16px. Apple
considers this a feature to improve readability on small screens. It does not
care that your text is transparent. It does not care that the input is hidden.
If the computed font-size is 14px, Safari zooms.

The fix is dead simple: always use `font-size: 16px` or larger on inputs, even
if the text is invisible. This one property eliminates the single most common
complaint about custom mobile inputs.

## Why `z-index` Fixes Touch Events

Desktop browsers resolve click targets by checking `pointer-events` on the
topmost element and passing through if it is set to `none`. Mobile Safari does
not reliably do this for touch events when the underlying element lacks an
explicit stacking context.

Adding `z-10` (or any explicit `z-index`) to the hidden input forces the
browser to include it in touch event resolution. Without it, the input exists in
the DOM but is invisible to the touch event system.

## When to Use These Techniques

- Building custom-styled text inputs (terminal emulators, code editors, command
  palettes) that must work on mobile
- Any hidden input pattern where a visible overlay presents styled text
- iOS Safari compatibility is a requirement

## When NOT to Use These Techniques

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

## Practical Takeaway

If you build custom-styled inputs, test on real mobile devices early. Chrome
DevTools responsive mode will not catch these issues. The three critical
properties are `z-index` for touch events, `font-size: 16px` for preventing iOS
zoom, and `-webkit-text-fill-color: transparent` for full cross-browser
transparency. These are not optional on mobile.

## References

- [WebKit Bug Tracker: Input zoom behavior](https://bugs.webkit.org/show_bug.cgi?id=159357)
- [MDN: touch-action CSS Property](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action)
- [MDN: Input inputmode Attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input#attr-inputmode)
