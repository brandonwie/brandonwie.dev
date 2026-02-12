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
  - url: "https://svelte.dev/docs/svelte/$effect"
    title: Svelte 5 $effect Rune
    type: official
  - url: "https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView"
    title: Element.scrollIntoView() - MDN
    type: official
---

I was building a FuzzyFinder component for my terminal-style blog. The user
presses arrow keys to navigate search results, and the selected item needs to
auto-scroll into view. In Svelte 4, I would have used `$: { }` reactive
statements. In Svelte 5, that syntax is gone, replaced by runes. I needed to
figure out `$effect` -- how it tracks dependencies, when it runs, and how
cleanup works.

## Coming from React's useEffect

If you are used to React, the biggest mental shift is that Svelte's `$effect`
has no dependency array. There is no second argument. You do not tell Svelte what
to watch. It figures it out automatically by tracking which reactive values you
read inside the effect body.

```svelte
<script>
  let count = $state(0);

  // Runs whenever count changes
  $effect(() => {
    console.log('Count is now:', count);
  });
</script>
```

Any `$state`, `$derived`, or `$props` value read inside the function becomes a
dependency. This is powerful but can cause unexpected re-runs if you access state
you did not intend to track.

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

If you only wanted to react to `a` but accidentally read `b` inside the effect,
it re-runs for both. There is no way to opt out of a dependency once it is read.
Structure your effects carefully.

## How It Compares to Svelte 4

| Svelte 4               | Svelte 5                          |
| ---------------------- | --------------------------------- |
| `$: { sideEffect() }`  | `$effect(() => { sideEffect() })` |
| Implicit, less control | Explicit, clearer intent          |
| No cleanup support     | Return cleanup function           |

The Svelte 5 version is more explicit. You see exactly where effects start and
end. And cleanup is built in, which Svelte 4 reactive statements never
supported.

## Real Example: Auto-Scroll in FuzzyFinder

Here is the actual use case that made me learn `$effect`. The FuzzyFinder shows
search results in a scrollable list. When the user presses the up or down arrow,
`selectedIndex` changes, and the selected item needs to scroll into view:

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

The effect reads `results.length` and `selectedIndex`, so it re-runs when either
changes. If the user types a new query (changing results) or presses an arrow
key (changing the index), the selected item scrolls into view.

The `block: 'nearest'` option is important here. It means "only scroll if the
element is outside the visible area." Without it, every keystroke would jump the
scroll position even when the selected item is already visible.

| Option                | Value                                           | Behavior |
| --------------------- | ----------------------------------------------- | -------- |
| `block: 'nearest'`    | Only scrolls if element is outside visible area |          |
| `block: 'start'`      | Aligns element to top of container              |          |
| `block: 'end'`        | Aligns element to bottom of container           |          |
| `behavior: 'smooth'`  | Animates the scroll                             |          |
| `behavior: 'instant'` | Jumps immediately                               |          |

## Cleanup

Return a function from `$effect` to run cleanup when the effect re-runs or when
the component unmounts:

```svelte
$effect(() => {
  const interval = setInterval(() => {
    console.log('tick');
  }, 1000);

  // Cleanup: clear interval
  return () => clearInterval(interval);
});
```

The cleanup function runs in two situations: before the next execution of the
effect (when a dependency changes), and when the component is destroyed. This
differs slightly from React where cleanup behavior depends on the dependency
array.

## Choosing the Right Tool

Not everything should be an `$effect`. Here is the decision framework:

| Use Case                         | Tool         |
| -------------------------------- | ------------ |
| Derived/computed values          | `$derived()` |
| Side effects (DOM, logging, API) | `$effect()`  |
| One-time setup                   | `onMount()`  |

The most common mistake is using `$effect` to compute a derived value. If you
find yourself writing `$effect(() => { someVar = transform(otherVar) })`, stop.
Use `const someVar = $derived(transform(otherVar))` instead. The `$effect`
version creates an unnecessary re-render cycle.

## When NOT to Use $effect

- **Computing derived values** -- Use `$derived()` instead. Using `$effect` to
  set another state variable creates unnecessary re-render cycles.
- **One-time initialization** -- Use `onMount()` for setup that runs once (event
  listeners on `window`, fetching initial data). `$effect` runs after every
  relevant state change, not just once.
- **Synchronous state updates in response to other state** -- This creates
  cascading reactivity. If `$effect` updates state A which triggers another
  `$effect` that updates state B, you get hard-to-debug update chains.
  Restructure with `$derived` or consolidate logic.
- **Heavy computations on every state change** -- `$effect` runs synchronously
  after render. Expensive operations (network requests, large DOM mutations)
  should be debounced or moved to `$effect` with explicit guards.

## Practical Takeaway

`$effect` replaces Svelte 4 reactive statements with a clearer, more powerful
API. The key insight is automatic dependency tracking: every reactive value read
inside the effect becomes a dependency, so structure your effects to read only
what they need. Use `$derived` for computed values, `onMount` for one-time
setup, and `$effect` for genuine side effects that need to re-run when state
changes. The auto-scroll pattern shown here is a textbook `$effect` use case:
DOM manipulation that responds to state changes.
