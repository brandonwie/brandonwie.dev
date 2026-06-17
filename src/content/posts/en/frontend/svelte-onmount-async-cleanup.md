---
title: 'Svelte: an async `onMount` return is NOT cleanup'
description: Svelte runs the value returned from `onMount` as cleanup on unmount — but only when it is a function. An `async` callback returns a Promise, so the cleanup is silently ignored.
date: 2026-06-04T00:00:00.000Z
updated: '2026-06-05'
tags:
  - frontend
  - svelte
  - svelte5
  - lifecycle
  - gotcha
category: frontend
draft: false
lang: en
references:
  - url: 'https://svelte.dev/docs/svelte/lifecycle-hooks#onMount'
    title: Svelte lifecycle hooks — onMount
    type: official
  - url: 'https://svelte.dev/docs/svelte/lifecycle-hooks#onDestroy'
    title: Svelte lifecycle hooks — onDestroy
    type: official
source_content_hash: 62199619b9166a8b73af27d88da695f07bcf0d90dbb9cae35f5f347388bdd68c
expanded: true
---

Svelte turns the value you return from `onMount` into the component's cleanup
function. It runs on unmount — but **only when that value is a function**. An
`async` callback always returns a `Promise`, not a function, so Svelte quietly
ignores it and the cleanup never runs. No error, no warning. I ran into this
while adding a focus trap to a modal, and the way it fails is worth sharing
because nothing in the toolchain points at it.

## The setup that surfaced it

I was adding an accessibility focus trap to the command-palette modal
(`FuzzyFinder.svelte`) on this site. When the palette opens it moves focus into
the search input; when it closes it should **restore focus** to whatever was
focused before it opened. Restoring focus on teardown is exactly what an
`onMount` cleanup return is for, so the first version looked like this:

```ts
// Svelte's contract: the RETURN VALUE of onMount is the destroy callback,
// IF it is a function. An async function returns Promise<fn>, not fn.
onMount(async () => {
  previouslyFocused = document.activeElement as HTMLElement | null;
  await tick();
  inputRef?.focus();
  return () => previouslyFocused?.focus?.(); // ⟵ wrapped in a Promise → ignored
});
```

One detail broke it: that `onMount` was already `async`, because it `await`s
`tick()` before focusing the input. The moment a callback is `async`, its return
value is a `Promise<() => void>` — not the `() => void` Svelte is looking for. So
the restore function got wrapped in a Promise, Svelte saw a non-function return,
and the teardown silently never happened. Focus stayed trapped after the palette
closed.

## Why it fails silently

This is the part I think is worth internalizing. Svelte's contract for `onMount`
is narrow: _if the callback returns a function, run it on destroy._ A `Promise`
is not a function, so it falls outside the contract and is dropped without
complaint. The component still mounts and focuses correctly — only the teardown
is missing. In practice that shows up as leaked event listeners, focus that is
never restored, and timers that are never cleared: the class of bug that doesn't
surface until much later.

## The fix: move teardown to `onDestroy`

`onDestroy` has no return-value contract. It just runs when the component is
destroyed, so it does not care whether the mount logic is sync or async. Keep the
async setup in `onMount` and move the teardown to `onDestroy`:

```ts
import { onMount, onDestroy, tick } from "svelte";

let previouslyFocused: HTMLElement | null = null;

onMount(async () => {
  previouslyFocused = document.activeElement as HTMLElement | null;
  await tick();
  inputRef?.focus();
});

// Runs on unmount regardless of onMount being async.
onDestroy(() => previouslyFocused?.focus?.());
```

If the setup is **synchronous**, returning the cleanup from `onMount` is fine —
the trap is specifically the `async` keyword turning the return into a Promise.
But `onDestroy` is unconditionally correct, which makes it the safer default
whenever there is any chance the mount logic awaits something.

## The asymmetry that's easy to mix up

The confusing part is that `$effect` does the opposite of an async `onMount`: a
function returned from `$effect` **is** run as cleanup, before each re-run and on
destroy. So "return a function to clean up" holds for `$effect` and for a
_synchronous_ `onMount`, but not for an _async_ `onMount`. Mapping the four cases
side by side made it stick for me:

| Lifecycle call             | Returned function runs as cleanup?      |
| -------------------------- | --------------------------------------- |
| `onMount(() => fn)` (sync) | Yes                                     |
| `onMount(async () => fn)`  | **No** — returns a `Promise`, ignored   |
| `onDestroy(fn)`            | N/A — `fn` itself _is_ the teardown     |
| `$effect(() => fn)`        | Yes — before each re-run and on destroy |

## What made it hard to catch

The type checker and the build are both happy with the broken version. An async
function that returns a function is valid TypeScript, so `svelte-check` stays
green. I only caught it because the focus trap was exercised in a real browser
and focus visibly stayed stuck after closing the palette. A passing type check is
not evidence that your cleanup actually runs.

## Takeaway

- `onMount(fn)` cleanup works only when `fn` **synchronously returns a
  function**.
- `async () => { …; return cleanup }` returns `Promise<cleanup>`, which Svelte
  ignores — and it does so without an error.
- Reach for `onDestroy` whenever the mount logic must be `async` (awaiting
  `tick()`, a dynamic `import()`, a fetch, and so on).
- Don't let a green `svelte-check` convince you teardown happens — confirm
  cleanup behavior in the browser.

## References

- [Svelte lifecycle hooks — onMount](https://svelte.dev/docs/svelte/lifecycle-hooks#onMount)
- [Svelte lifecycle hooks — onDestroy](https://svelte.dev/docs/svelte/lifecycle-hooks#onDestroy)
