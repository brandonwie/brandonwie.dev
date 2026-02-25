---
title: Svelte 5 $effect Rune
description: >-
  In Svelte 5, the reactive statement syntax (`$: { }`) from Svelte 4 is
  replaced
date: 2026-01-28T00:00:00.000Z
updated: 2026-01-28T00:00:00.000Z
tags:
  - frontend
  - svelte
  - svelte5
  - reactivity
category: frontend
draft: false
lang: en
references:
  - url: 'https://svelte.dev/docs/svelte/$effect'
    title: Svelte 5 $effect Rune
    type: official
  - url: 'https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView'
    title: Element.scrollIntoView() - MDN
    type: official
---

by runes. When building a FuzzyFinder component that needed to auto-scroll to
the selected item whenever the selection index changed, I needed to understand
how `$effect` works -- specifically how it tracks dependencies automatically and
how to handle cleanup.

---

## Difficulties Encountered

- **Mental model shift from React** -- Coming from React's `useEffect` with
  explicit dependency arrays, it was initially unclear how Svelte's automatic
  dependency tracking decides what to re-run. Reading a reactive variable
  anywhere inside the effect body registers it as a dependency, which is
  powerful but can cause unexpected re-runs if you access state you did not
  intend to track.
- **Distinguishing `$effect` from `$derived`** -- Both react to state changes,
  but choosing the wrong one leads to subtle bugs. Using `$effect` for computed
  values (instead of `$derived`) causes unnecessary DOM updates; using
  `$derived` for side effects does not work at all.
- **Cleanup timing** -- The cleanup function runs before the next execution of
  the effect AND on component unmount, which differs from React where cleanup
  only runs on unmount or before re-run depending on deps. Getting
  interval/timer cleanup right required testing the exact timing.
- **Svelte 4 migration confusion** -- Existing Svelte 4 examples online still
  use `$: { }` syntax; distinguishing which patterns translate to `$effect` vs
  `$derived` vs staying as `$:` (for non-rune mode) was not immediately obvious.

---

## Syntax

```svelte
<script>
  let count = $state(0);

  // Runs whenever count changes
  $effect(() => {
    console.log('Count is now:', count);
  });
</script>
```

## Automatic Dependency Tracking

Unlike React's `useEffect`, you don't specify dependencies manually. Svelte
automatically tracks any reactive state (`$state`, `$derived`, `$props`) read
inside the effect:

```svelte
<script>
  let a = $state(1);
  let b = $state(2);

  // Re-runs when EITHER a OR b changes
  $effect(() => {
    console.log('Sum:', a + b);
  });
</script>
```

## Comparison with Svelte 4

| Svelte 4               | Svelte 5                          |
| ---------------------- | --------------------------------- |
| `$: { sideEffect() }`  | `$effect(() => { sideEffect() })` |
| Implicit, less control | Explicit, clearer intent          |
| No cleanup support     | Return cleanup function           |

## Real Example: Auto-Scroll

Used in FuzzyFinder to scroll selected item into view:

```svelte
<script>
  let selectedIndex = $state(0);
  let results = $state([]);
  let containerRef: HTMLDivElement;

  // Runs when selectedIndex or results.length changes
  $effect(() => {
    if (containerRef && results.length > 0) {
      const selectedElement = containerRef.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({
          block: 'nearest',    // Only scroll if out of view
          behavior: 'smooth'   // Animate the scroll
        });
      }
    }
  });
</script>
```

## scrollIntoView Options

| Option                | Behavior                                        |
| --------------------- | ----------------------------------------------- |
| `block: 'nearest'`    | Only scrolls if element is outside visible area |
| `block: 'start'`      | Aligns element to top of container              |
| `block: 'end'`        | Aligns element to bottom of container           |
| `behavior: 'smooth'`  | Animates the scroll                             |
| `behavior: 'instant'` | Jumps immediately                               |

## Cleanup

Return a function to run cleanup when effect re-runs or component unmounts:

```svelte
$effect(() => {
  const interval = setInterval(() => {
    console.log('tick');
  }, 1000);

  // Cleanup: clear interval
  return () => clearInterval(interval);
});
```

## When to Use

| Use Case                         | Tool         |
| -------------------------------- | ------------ |
| Derived/computed values          | `$derived()` |
| Side effects (DOM, logging, API) | `$effect()`  |
| One-time setup                   | `onMount()`  |

## When NOT to Use

- **Computing derived values** -- If the result is a pure transformation of
  state (no side effects), use `$derived()` instead. Using `$effect` to set
  another state variable creates unnecessary re-render cycles.
- **One-time initialization** -- For setup that runs once on mount (event
  listeners on `window`, fetching initial data), use `onMount()`. `$effect` runs
  after every relevant state change, not just once.
- **Synchronous state updates in response to other state** -- This creates
  cascading reactivity. If `$effect` updates state A which triggers another
  `$effect` that updates state B, you get hard-to-debug update chains.
  Restructure with `$derived` or consolidate logic.
- **Heavy computations on every state change** -- `$effect` runs synchronously
  after render; expensive operations (network requests, large DOM mutations)
  should be debounced or moved to `$effect` with explicit guards to avoid
  performance issues.

---

## Key Points

- **Automatic tracking**: No dependency array needed
- **Runs after render**: DOM is available inside effect
- **Cleanup support**: Return function for teardown
- **Replaces reactive statements**: `$: { }` → `$effect(() => { })`
