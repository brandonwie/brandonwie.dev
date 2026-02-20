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

My terminal-style blog input worked perfectly on desktop. Then I tested on
an actual phone. Tapping the input area did nothing -- no keyboard, no
cursor, no response. The hidden input pattern that looked flawless in Chrome
DevTools responsive mode was completely broken on real mobile Safari.

This is the story of five CSS gotchas that took an entire afternoon to
discover.

## The Hidden Input Pattern

The terminal aesthetic requires a blinking block cursor. Browsers give you a
thin text cursor, not a block. To work around this, I used a two-layer
approach:

1. A hidden `<input>` that receives actual keyboard input (text is
   transparent so you cannot see it)
2. A visible overlay `<div>` that mirrors what the user types, complete with
   a styled block cursor element

The overlay sits on top of the input visually, but `pointer-events: none`
lets clicks pass through to the real input underneath.

On desktop, this is elegant. The input gets focus, the overlay shows the
styled text, and the whole thing feels native. On mobile, it silently
breaks.

## What Went Wrong

### 1. Desktop-only testing blind spot

Chrome DevTools has a responsive mode that simulates mobile screen sizes.
I tested there and everything worked. Then I picked up my phone.

The touch event issue does not reproduce in DevTools. You need a real device
running real Safari to find it. That cost me about thirty minutes of
confused staring at what looked like working code.

### 2. `pointer-events: none` was not enough

The overlay div had `pointer-events: none`, which should let touch events
pass through to the input underneath. That works on desktop. On mobile
Safari, it is not enough by itself.

Without an explicit `z-index` on the hidden input, mobile Safari does not
know the input is interactive. The touch event reaches the overlay, passes
through, and then... nothing happens. The input is there, but Safari treats
it as inert.

The fix is `z-10` on the input. That tells the browser this element is a
real participant in the stacking context and touch events should reach it.

### 3. iOS zoom trigger was non-obvious

When the input finally got focus, the page zoomed in. Not the pleasant
zoom-to-selection behavior -- the jarring auto-zoom that Safari applies to
small inputs.

My first guess was a missing viewport meta tag. My second guess was a
`touch-action` issue. Both wrong.

The trigger is `font-size` on the input element. If it is below 16px, Safari
zooms. It does not matter that the text is completely transparent and the
user never sees it. The browser checks the font size and zooms regardless.

Fix: `font-size: 16px` on the input, always.

### 4. WebKit-specific transparency

`color: transparent` hides text in most browsers. In WebKit, it hides the
text but not the text cursor or selection highlight. On some versions of
Safari, you could still see the blinking cursor inside the "invisible"
input, which looked like a ghost behind the overlay.

The fix requires a vendor-prefixed property alongside the standard one:

```css
color: transparent;
-webkit-text-fill-color: transparent;
```

This combination suppresses the cursor and selection rendering in WebKit.
It is not in most tutorials, and it is not obvious from the MDN docs unless
you are already searching for it.

### 5. Cursor overlay invisible despite correct dimensions

This one was the strangest. The block cursor element had correct computed
dimensions -- I confirmed 10x19px in the inspector. But it was invisible.

I suspected the CSS was wrong, then suspected the animation, then suspected
the color variable. I used Playwright MCP to inspect the live page. I
inserted a 50x50 red square with `z-index: 9999` in the same position --
visible immediately. Then I looked at the cursor element without a z-index
-- invisible.

The hidden input had `z-10`. That creates a stacking context. The overlay
div was rendered in document order after the input, but without its own
`z-index`, it did not participate in the stacking context the same way.
The transparent input layer was painting on top of the cursor element,
blocking it visually even though nothing visible was there.

Fix: `relative z-20` on the overlay div, plus `pointer-events-none` so
clicks still pass through to the input.

### 6. CSS height collapse with `inline-block`

The block cursor is a `<span>` with `display: inline-block`. Its content
is a single space character -- just enough to give it width when the cursor
is at the end of an empty string.

A space character inside an `inline-block` span computes to `height: 0`.
The element is there, it has the right width, but it has no height. You
cannot see it.

The fix is an explicit height that matches the line height:

```css
height: 1.2em;
vertical-align: text-bottom;
```

`vertical-align: text-bottom` aligns the cursor block to the bottom of the
text line so it sits flush with the characters beside it.

## The Solution

Here is the complete markup with all fixes applied:

```html
<div class="relative">
  <!-- Hidden input: z-10 required for touch events on mobile -->
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
| `z-10`                    | Ensures input receives touch events on mobile |
| `relative z-20`           | Overlay paints above input's stacking context |
| `pointer-events-none`     | Clicks pass through overlay to hidden input   |
| `h-full`                  | Explicit height fills the container           |
| `height: 1.2em`           | Prevents inline-block height collapse         |
| `font-size: 16px`         | Prevents iOS Safari auto-zoom on focus        |
| `-webkit-text-fill-color` | Suppresses text cursor visibility on WebKit   |

## Why `font-size: 16px` Matters

Safari applies an automatic zoom when an input receives focus and its
`font-size` is below 16px. The intent is accessibility -- zooming in makes
small text readable. The effect in a custom UI is that the page zooms to an
unexpected state.

The zoom happens even when the text is completely invisible. Safari reads
the computed `font-size` from the element, checks whether it is below the
threshold, and zooms accordingly. Your intent does not factor in.

Setting `font-size: 16px` on the hidden input disables this behavior. The
visual presentation is unaffected because the text is transparent anyway.

## Why `z-index` Fixes Touch Events

This one is a browser behavior quirk, not an obvious design decision.

On mobile Safari, touch events follow the stacking context. An element
without an explicit `z-index` can be below the touch hit-test threshold
even when no other element is visually blocking it. The transparent overlay
with `pointer-events: none` does let the event through, but the receiving
element needs to be a real participant in the stacking context.

Adding `z-10` to the input makes it a stacking context participant. Safari
then correctly routes touch events to it. This is a
[documented WebKit behavior](https://bugs.webkit.org/show_bug.cgi?id=159357).

The same logic applies to the overlay at `z-20`. Even though the input is
at `z-10` and the overlay is at `z-20`, `pointer-events-none` on the
overlay means touch events pass through. The higher z-index is only needed
so the cursor visually renders above the transparent-but-present input
layer.

## When to Use

- Building custom-styled text inputs (terminal emulators, code editors,
  command palettes) that must work on mobile
- Any hidden input pattern where a visible overlay presents styled text
- iOS Safari compatibility is a requirement

## When NOT to Use

- **Standard form inputs** -- If you are using normal visible `<input>` or
  `<textarea>` elements, none of these workarounds are needed. The browser
  handles touch events natively.
- **Desktop-only applications** -- The z-index and font-size fixes are for
  mobile browser quirks. On desktop they add unnecessary complexity.
- **Accessibility-critical forms** -- Hiding the real input behind an
  overlay can confuse screen readers. Prefer native inputs with CSS styling
  when accessibility is the top priority.
- **`contenteditable` approach** -- If using `contenteditable` instead of
  a hidden input, the touch event and z-index issues do not apply.

## Practical Takeaway

If you are building a hidden input with a visual overlay, you need five
properties working together before mobile will behave:

1. `z-10` on the input (touch events)
2. `relative z-20` on the overlay (stacking context)
3. `font-size: 16px` on the input (no iOS zoom)
4. `-webkit-text-fill-color: transparent` (WebKit cursor visibility)
5. `height: 1.2em` on the cursor element (inline-block collapse)

Miss any one of them and something breaks on mobile. The desktop tests will
all pass. You will only find out when you pick up a real phone.

## References

- [WebKit Bug 159357 -- Touch Events on Hidden Inputs](https://bugs.webkit.org/show_bug.cgi?id=159357)
- [MDN: touch-action CSS Property](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action)
- [MDN: HTML Input Element -- inputmode Attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input#attr-inputmode)
