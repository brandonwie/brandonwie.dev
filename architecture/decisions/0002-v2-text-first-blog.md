---
tags: [architecture, adr, decision, redesign, design-system]
created: 2026-11-12
updated: 2026-11-12
status: completed
related:
  - ./0001-terminal-vs-command-palette.md
  - ../../DESIGN.md
  - ../../README.md
when_used: Read before any visual, navigation or image-related change to the site.
---

# ADR-0002 · V2: a text-first blog with one index, two themes and no images

**Status:** Accepted, 2026-11-12 **Decision owner:** Brandon **Issue:**
brandonwie.dev #81, "feat: V2 blog with simple navigation, readable type and no
images" **Supersedes:** the palette-first direction of
[ADR-0001](./0001-terminal-vs-command-palette.md) (Option B)

## Context

- **Who and when:** Brandon set the goal on 2026-11-12: reference
  <https://claude.dev>, make a V2 blog that is simple to use and to navigate,
  remove all images with their data and processes, and clean up what becomes
  unnecessary. He added one constraint: readability and visibility matter.
- **Where:** the whole site (`next/`, `src/app.css`, `public/`, `scripts/`).
- **What existed:** a dark-only "terminal" design. Every page drew shell
  prompts, ASCII frames and block meters around its content. Body text was
  14px monospace. Finding a post took one of four surfaces: the home page (10
  posts), `/posts` with a category sidebar, `/tags`, `/search`, or the
  Cmd/Ctrl+K palette.
- **Images:** no post had an image in its body. The repository still carried
  337 generated PNG files (a hero and a share card per post, 37 MB), 322 media
  source files, three generator scripts and two rendering dependencies.

## Decision drivers

- A post must be easy to read: a sans face at 17 to 19px, a 44rem measure, and
  text contrast of 7:1.
- A reader must find a post from one place, with or without a keyboard.
- The site must work in light and dark. A dark-only page is hard to read in
  daylight.
- Less to maintain: each surface, script and asset must earn its place.

## Options considered

| Option                                             | Pros                                              | Cons                                                                              | Chosen |
| -------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------- | :----: |
| A. Keep the terminal design, raise sizes           | Smallest change; keeps the signature look         | Decoration still competes with the text; four ways to find a post; no light theme |   ✗    |
| B. Text-first V2: one index, two themes, no images | Readable; one way to find a post; far fewer parts | Loses the terminal identity; every page needs new styles                          |   ✅   |
| C. B, but keep per-post share cards                | Distinct preview per post on social sites         | Keeps the generator, its fonts, two dependencies and 169 files to regenerate      |   ✗    |

## Decision

Option B.

1. **One index.** The home page lists every post in year groups. One search box
   filters titles, descriptions and tags at once and adds full-text hits from
   Pagefind. Category tabs and tag links filter the same list. The filter state
   lives in the address (`?q=`, `?category=`, `?tag=`). `/posts`, `/tags` and
   `/search` redirect to it.
2. **No command palette.** Single keys replace it: `/` search, `j` `k` rows,
   Enter open, `p` `s` `b` `a` sections, `l` language, `t` theme, `?` the list;
   on a post, Backspace, `[` and `]`. A control declares its key with
   `data-hotkey`, so the list is always what the page offers.
3. **Two themes, one token set.** Every colour token holds a light and a dark
   value through `light-dark()`. `scripts/check-contrast.mjs` fails `pnpm check`
   when a text token drops under its target.
4. **Reading type.** Inter for text and interface, JetBrains Mono for code and
   small labels, both self-hosted. Korean uses the system face.
5. **No images.** Per-post heroes and share cards, their sources, the generator
   scripts, the ASCII portrait and the rendering dependencies are removed. One
   static card, `public/og.png`, serves every page.
6. **Fewer pages.** About holds the former Projects and Contact pages as
   sections; their addresses redirect.
7. **Text for programs.** Each post is also written as Markdown at its address
   plus `.md`, with an `llms.txt` index (`scripts/build-markdown.mjs`).

## Consequences

- **Good:** one place to look for a post; body text passes 7:1 in both themes;
  the build has no image step; the global stylesheet no longer carries the talk
  deck's 2,700 lines (the deck loads its own on its route).
- **Cost:** a shared link shows the same card for every post. If distinct cards
  matter later, generate them at build time from the title; do not commit them.
- **Cost:** readers who used Cmd/Ctrl+K must learn `/`. The header shows each
  key beside its control.
- **Kept on purpose:** the talk deck stays a dark, animated presentation with
  its four demo videos; its root carries `data-scheme="dark"`, which pins the
  dark tokens in both site themes (`src/app.css`).
- **Documents:** `DESIGN.md` holds the tokens and rules. `architecture/README.md`
  and `structure.yaml` stay historical (SvelteKit era).
