---
version: alpha
name: brandonwie.dev
description: 'A text-first personal blog: one quiet token set for light and dark, a sans face for reading, mono for code and labels, one teal accent.'
colors:
  primary: '#1D6076'
  on-primary: '#FBFAF6'
  primary-strong: '#134A5C'
  background: '#FBFAF6'
  surface: '#F3F1EA'
  surface-2: '#E9E6DD'
  code-background: '#FFFFFF'
  line: '#DCD8CE'
  line-strong: '#8B877C'
  ink: '#1A1920'
  muted: '#494653'
  faint: '#676472'
  ok: '#256B3C'
  gold: '#8A5700'
  love: '#A23B5C'
  primary-dark: '#9CCFD8'
  on-primary-dark: '#141319'
  primary-strong-dark: '#C3E9EF'
  background-dark: '#141319'
  surface-dark: '#1C1B23'
  surface-2-dark: '#272530'
  code-background-dark: '#0F0E13'
  line-dark: '#302E3B'
  line-strong-dark: '#6A6779'
  ink-dark: '#EBE9F3'
  muted-dark: '#B9B5C9'
  faint-dark: '#938FA7'
  ok-dark: '#9FD6A7'
  gold-dark: '#F6C177'
  love-dark: '#F0839F'
typography:
  body:
    fontFamily: Inter
    fontSize: 1rem
    lineHeight: 1.6
  prose:
    fontFamily: Inter
    fontSize: 1.125rem
    lineHeight: 1.75
  title:
    fontFamily: Inter
    fontSize: 2.75rem
    fontWeight: 700
    lineHeight: 1.15
  heading:
    fontFamily: Inter
    fontSize: 1.5rem
    fontWeight: 650
    lineHeight: 1.25
  label:
    fontFamily: JetBrains Mono
    fontSize: 0.8125rem
    lineHeight: 1.4
  code:
    fontFamily: JetBrains Mono
    fontSize: 0.875rem
    lineHeight: 1.65
rounded:
  sm: 4px
  button: 6px
  md: 8px
  full: 999px
spacing:
  gutter-min: 1rem
  gutter-max: 2rem
  measure: 44rem
  page: 68rem
  header: 3.5rem
components:
  page:
    backgroundColor: '{colors.background}'
    textColor: '{colors.ink}'
    typography: '{typography.body}'
  page-dark:
    backgroundColor: '{colors.background-dark}'
    textColor: '{colors.ink-dark}'
    typography: '{typography.body}'
  prose:
    backgroundColor: '{colors.background}'
    textColor: '{colors.ink}'
    typography: '{typography.prose}'
  title:
    backgroundColor: '{colors.background}'
    textColor: '{colors.ink}'
    typography: '{typography.title}'
  heading:
    backgroundColor: '{colors.background}'
    textColor: '{colors.ink}'
    typography: '{typography.heading}'
  secondary-text:
    backgroundColor: '{colors.background}'
    textColor: '{colors.muted}'
  secondary-text-dark:
    backgroundColor: '{colors.background-dark}'
    textColor: '{colors.muted-dark}'
  eyebrow:
    backgroundColor: '{colors.background}'
    textColor: '{colors.muted}'
    typography: '{typography.label}'
  eyebrow-dark:
    backgroundColor: '{colors.background-dark}'
    textColor: '{colors.muted-dark}'
    typography: '{typography.label}'
  meta-text:
    backgroundColor: '{colors.background}'
    textColor: '{colors.faint}'
  meta-text-dark:
    backgroundColor: '{colors.background-dark}'
    textColor: '{colors.faint-dark}'
  text-link:
    backgroundColor: '{colors.background}'
    textColor: '{colors.primary}'
  text-link-hover:
    backgroundColor: '{colors.background}'
    textColor: '{colors.primary-strong}'
  text-link-dark:
    backgroundColor: '{colors.background-dark}'
    textColor: '{colors.primary-dark}'
  text-link-hover-dark:
    backgroundColor: '{colors.background-dark}'
    textColor: '{colors.primary-strong-dark}'
  button:
    backgroundColor: '{colors.background}'
    textColor: '{colors.ink}'
    rounded: '{rounded.button}'
    padding: 0.8rem
  button-dark:
    backgroundColor: '{colors.background-dark}'
    textColor: '{colors.ink-dark}'
    rounded: '{rounded.button}'
    padding: 0.8rem
  selection:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.on-primary}'
  selection-dark:
    backgroundColor: '{colors.primary-dark}'
    textColor: '{colors.on-primary-dark}'
  tag:
    backgroundColor: '{colors.background}'
    textColor: '{colors.muted}'
    typography: '{typography.label}'
    rounded: '{rounded.full}'
  tag-dark:
    backgroundColor: '{colors.background-dark}'
    textColor: '{colors.muted-dark}'
    typography: '{typography.label}'
    rounded: '{rounded.full}'
  kbd:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.muted}'
    typography: '{typography.label}'
    rounded: '{rounded.sm}'
  kbd-dark:
    backgroundColor: '{colors.surface-dark}'
    textColor: '{colors.muted-dark}'
    typography: '{typography.label}'
    rounded: '{rounded.sm}'
  panel:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.md}'
  panel-dark:
    backgroundColor: '{colors.surface-dark}'
    textColor: '{colors.ink-dark}'
    rounded: '{rounded.md}'
  row-hover:
    backgroundColor: '{colors.surface-2}'
    textColor: '{colors.ink}'
  row-hover-dark:
    backgroundColor: '{colors.surface-2-dark}'
    textColor: '{colors.ink-dark}'
  code-block:
    backgroundColor: '{colors.code-background}'
    textColor: '{colors.ink}'
    typography: '{typography.code}'
    rounded: '{rounded.md}'
  code-block-dark:
    backgroundColor: '{colors.code-background-dark}'
    textColor: '{colors.ink-dark}'
    typography: '{typography.code}'
    rounded: '{rounded.md}'
  status-ok:
    backgroundColor: '{colors.background}'
    textColor: '{colors.ok}'
  status-ok-dark:
    backgroundColor: '{colors.background-dark}'
    textColor: '{colors.ok-dark}'
  status-warn:
    backgroundColor: '{colors.background}'
    textColor: '{colors.gold}'
  status-warn-dark:
    backgroundColor: '{colors.background-dark}'
    textColor: '{colors.gold-dark}'
  status-crit:
    backgroundColor: '{colors.background}'
    textColor: '{colors.love}'
  status-crit-dark:
    backgroundColor: '{colors.background-dark}'
    textColor: '{colors.love-dark}'
  divider:
    backgroundColor: '{colors.line}'
  divider-dark:
    backgroundColor: '{colors.line-dark}'
  divider-strong:
    backgroundColor: '{colors.line-strong}'
  divider-strong-dark:
    backgroundColor: '{colors.line-strong-dark}'
---

## Overview

brandonwie.dev is a personal blog made of text, code and diagrams. It has no
photographs and no per-post artwork. The design has one job: make a long
technical post easy to read and the next post easy to find.

The site follows the reader's system theme and has a manual switch. Light and
dark are the same design: every colour token holds both values through the CSS
`light-dark()` function, so a component names a token once. A part of a page
that must keep one theme sets `data-scheme="dark"` or `data-scheme="light"` on
its root (the talk deck does); `color-scheme` alone does not re-resolve the
tokens after the build.

The source of the values is `src/app.css` (`:root` and `@theme`). Check this
file with `npx --yes @google/design.md@0.4.0 lint DESIGN.md`. The build checks
the contrast of the tokens themselves with `node scripts/check-contrast.mjs`
(part of `pnpm check`).

## Colors

Each role has a light value and a dark value. The names below are the CSS
custom properties.

| Role          | Token             | Light     | Dark      | Use                                   |
| ------------- | ----------------- | --------- | --------- | ------------------------------------- |
| Page          | `--bg`            | `#FBFAF6` | `#141319` | The page                              |
| Surface       | `--surface`       | `#F3F1EA` | `#1C1B23` | Panels, tags, table heads, code bars  |
| Surface 2     | `--surface-2`     | `#E9E6DD` | `#272530` | Hover and pressed rows                |
| Code          | `--code-bg`       | `#FFFFFF` | `#0F0E13` | Code blocks                           |
| Line          | `--line`          | `#DCD8CE` | `#302E3B` | 1px dividers                          |
| Line strong   | `--line-strong`   | `#8B877C` | `#6A6779` | An edge that is the only cue (inputs) |
| Ink           | `--ink`           | `#1A1920` | `#EBE9F3` | Body text and headings                |
| Muted         | `--muted`         | `#494653` | `#B9B5C9` | Secondary text                        |
| Faint         | `--faint`         | `#676472` | `#938FA7` | Small labels and metadata             |
| Accent        | `--accent`        | `#1D6076` | `#9CCFD8` | Links, focus, the active state        |
| Accent strong | `--accent-strong` | `#134A5C` | `#C3E9EF` | A link under the pointer              |
| OK            | `--ok`            | `#256B3C` | `#9FD6A7` | Success                               |
| Warn          | `--warn`          | `#8A5700` | `#F6C177` | Warnings (`--gold`)                   |
| Critical      | `--crit`          | `#A23B5C` | `#F0839F` | Errors (`--love`)                     |

Contrast rules, enforced by `scripts/check-contrast.mjs`:

- `--ink` and `--muted` reach 7:1 on the page, both surfaces and the code
  background.
- Every other text token reaches 4.5:1 on the same four backgrounds.
- `--line-strong` reaches 3:1 on the page.
- Text set on `--accent` (selected text) uses `--bg` and reaches 4.5:1.

`--rose`, `--pine`, `--foam` and `--iris` are extra hues for diagrams and study
visualizers. They follow the same 4.5:1 rule.

## Typography

Inter (`--font-sans`) sets everything a person reads: body, headings and the
interface. JetBrains Mono (`--font-mono`) sets code, keys and the small
uppercase labels (`.eyebrow`). Both are variable fonts, self-hosted through
`next/font/local`; no font request leaves the site.

Korean text uses the system Korean face, because neither font has Hangul. Korean
paragraphs break between words (`word-break: keep-all`).

- Interface text is 1rem. Nothing a reader must read is under 0.8125rem.
- Long-form text (`.prose`) is 1.0625rem to 1.1875rem with a 1.75 line height
  and a 44rem measure.
- Post and page titles are 1.875rem to 2.75rem, weight 700, balanced wrapping.

## Layout

One page column, 68rem wide at most, with a gutter that grows with the screen.
The sticky header is 3.5rem tall. Reading text keeps a 44rem measure inside the
column.

- The home page is the whole post index: one search box, category tabs, then
  every post in year groups.
- A post is one text column. From 68rem a sticky rail to its right holds the
  contents and the share actions. Below that the contents are a collapsed block
  above the text.
- Under 48rem the header becomes two rows and is no longer sticky.

## Elevation & Depth

Flat. Surfaces are separated by 1px lines and by the surface colours. Nothing
has a shadow or a glow. The sticky header blurs what scrolls under it.

## Shapes

Panels, inputs and code blocks have an 8px radius, buttons 6px. Small inline
pieces (inline code, keys) have 4px. Tags are pills.

## Components

- **text-link:** accent text with an underline. Every link in running text is
  underlined; colour is never the only cue.
- **eyebrow:** a small uppercase mono label above a group.
- **tag:** a bordered pill for a category or a tag. As a link it opens the
  filtered post index.
- **button:** bordered, on the page colour. The border and the text turn to the
  accent under the pointer. There is no filled variant.
- **kbd:** a key. The interface shows its single-key shortcuts next to the
  controls they trigger, and `?` lists them.
- **panel:** a bordered surface for a group that needs to stand apart.
- **code-block:** a figure with a bar (the language, a copy button) above the
  code. Syntax colours come from the GitHub light and dark themes.
- **study-btn, study-card, study-recall:** the controls of the study
  visualizers.

Focus is a 2px accent outline, offset by 2px, on every focusable element.

## Do's and Don'ts

- Do name tokens (`text-ink`, `bg-surface`, `border-line`, `var(--accent)`).
  Never write a hex colour in a component.
- Do check both themes. A token change must pass `pnpm check`.
- Do let a wide table, code block or diagram scroll inside its own box. The page
  never scrolls sideways.
- Don't add images to a post or to the chrome. The one image file is the share
  card, `public/og.png`.
- Don't use `--faint` for text that carries meaning, and never on `--surface-2`.
- Don't add decoration that imitates another medium (terminal prompts, meters,
  scanlines). The earlier design did; V2 removed it.
- Don't animate layout. Motion is limited to colour and opacity changes, and
  stops under `prefers-reduced-motion`. The talk deck (`/talks/my-career`) is
  the one exception: it is a dark, animated presentation with its own
  stylesheets, loaded only on its route.
