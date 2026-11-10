---
version: alpha
name: brandonwie.dev
description: 'A dark-only terminal blog: Rosé Pine inks on a near-black page, monospace body, one foam accent.'
colors:
  primary: '#9CCFD8'
  on-primary: '#13111C'
  primary-strong: '#B8E8EF'
  background: '#13111C'
  surface: '#1F1D2E'
  surface-2: '#26233A'
  line: '#26233A'
  line2: '#322F47'
  ink: '#E0DEF4'
  muted: '#908CAA'
  faint: '#6E6A86'
  gold: '#F6C177'
  love: '#EB6F92'
  iris: '#C4A7E7'
  crt-glass: '#0D0B13'
  crt-hi: '#ECE6D6'
  crt-worn: '#D6CFBF'
  crt-amber: '#E0A35C'
  crt-green: '#9FD6A7'
  crt-faint: '#857F72'
  crt-line: '#4A4437'
  crt-off: '#3D372C'
typography:
  body-md:
    fontFamily: JetBrains Mono
    fontSize: 0.875rem
    lineHeight: 1.25rem
  body-sm:
    fontFamily: JetBrains Mono
    fontSize: 0.75rem
  display:
    fontFamily: Space Grotesk
    fontSize: 1.125rem
    fontWeight: 600
rounded:
  none: 0px
  crt-inner: 12px
  crt: 14px
spacing:
  sm: 0.5rem
  md: 0.75rem
  lg: 1rem
  grid: 46px
components:
  page:
    backgroundColor: '{colors.background}'
    textColor: '{colors.ink}'
    typography: '{typography.body-md}'
  heading:
    backgroundColor: '{colors.background}'
    textColor: '{colors.ink}'
    typography: '{typography.display}'
  link:
    backgroundColor: '{colors.background}'
    textColor: '{colors.primary}'
  link-glow:
    backgroundColor: '{colors.background}'
    textColor: '{colors.primary-strong}'
  cursor-block:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.on-primary}'
  secondary-text:
    backgroundColor: '{colors.background}'
    textColor: '{colors.muted}'
  meta-text:
    backgroundColor: '{colors.background}'
    textColor: '{colors.faint}'
    typography: '{typography.body-sm}'
  prompt-path:
    backgroundColor: '{colors.background}'
    textColor: '{colors.gold}'
  output-error:
    backgroundColor: '{colors.background}'
    textColor: '{colors.love}'
  legacy-violet:
    backgroundColor: '{colors.background}'
    textColor: '{colors.iris}'
  study-btn:
    backgroundColor: '{colors.background}'
    textColor: '{colors.muted}'
    rounded: '{rounded.none}'
    padding: 0.5rem
  study-card:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.none}'
  row-hover:
    backgroundColor: '{colors.surface-2}'
    textColor: '{colors.ink}'
  divider:
    backgroundColor: '{colors.line}'
  divider-strong:
    backgroundColor: '{colors.line2}'
  crt-panel:
    backgroundColor: '{colors.crt-glass}'
    textColor: '{colors.crt-hi}'
    rounded: '{rounded.crt}'
  crt-text-worn:
    backgroundColor: '{colors.crt-glass}'
    textColor: '{colors.crt-worn}'
  crt-status-amber:
    backgroundColor: '{colors.crt-glass}'
    textColor: '{colors.crt-amber}'
  crt-status-green:
    backgroundColor: '{colors.crt-glass}'
    textColor: '{colors.crt-green}'
  crt-text-faint:
    backgroundColor: '{colors.crt-glass}'
    textColor: '{colors.crt-faint}'
  crt-frame:
    backgroundColor: '{colors.crt-line}'
  crt-meter-off:
    backgroundColor: '{colors.crt-off}'
---

## Overview

brandonwie.dev is a personal blog that looks like a terminal. The site is
dark-only. Rosé Pine inks sit on a custom near-black page with a faint iris
grid. The body and the interface use a monospace face. Foam is the one accent.

The source of the values is `src/app.css` (`:root` and `@theme`). Check this
file with `npx --yes @google/design.md@0.4.0 lint DESIGN.md`.

## Colors

- **Primary (`#9CCFD8`, `--foam`, `--accent`, `--ok`):** links, the cursor, the
  prompt, focus outlines and success output.
- **Primary strong (`#B8E8EF`, `--accent-strong`):** glow on the accent.
- **Background (`#13111C`, `--bg`):** the page.
- **Surface (`#1F1D2E`, `--surface`, `--panel`):** cards and code blocks.
- **Surface 2 (`#26233A`, `--surface-2`, `--overlay`):** hover rows and
  overlays.
- **Line (`#26233A`, `--line`) and line 2 (`#322F47`, `--line2`):** 1px borders.
- **Ink (`#E0DEF4`, `--ink`):** body text and headings.
- **Muted (`#908CAA`, `--muted`):** secondary text.
- **Faint (`#6E6A86`, `--faint`):** metadata. Its contrast on the page is below
  4.5:1, so do not use it for text that a reader must read.
- **Gold (`#F6C177`, `--gold`, `--warn`):** paths, directories and warnings.
- **Love (`#EB6F92`, `--love`, `--crit`):** errors.
- **Iris (`#C4A7E7`, `--iris`):** the page grid at 3% and the legacy violet
  accents.

The Phosphor Fade panel (`crt-*`) has its own inks on `--crt-glass`
(`#0D0B13`): hi `#ECE6D6`, worn `#D6CFBF`, amber `#E0A35C`, green `#9FD6A7` and
faint `#857F72`. `--crt-line` and `--crt-off` are for frames and unlit meter
cells, not for text.

More Rosé Pine roles are in `src/app.css` and have no component here: rose
`#EBBCBA`, pine `#31748F` and the three highlight steps. The `terminal-*` names
are aliases of the tokens above. Do not add a new use of an alias.

## Typography

JetBrains Mono (`--font-mono`) is the default for the body and the interface.
Space Grotesk (`--font-sans`) is for display and prose headings only. Korean
text falls through to a system face, because JetBrains Mono has no Hangul.
Sizes come from the Tailwind scale: `text-sm` (0.875rem) for the body and
`text-xs` (0.75rem) for metadata.

## Layout

One centered column. The post list has a 192px category sidebar at the `lg`
breakpoint and a horizontal pill bar below it. The page grid is 46px.

## Elevation & Depth

Surfaces are flat and use 1px lines. Glow replaces shadow: the cursor, the
focus outline and the Phosphor Fade bezel use a soft colored bloom.

## Shapes

Corners are square. Only the Phosphor Fade panel is rounded: 14px outside and
12px inside (10px and 8px below 64rem).

## Components

- **cursor-block:** the blinking terminal cursor. The blink stops when the user
  asks for reduced motion.
- **study-btn:** a bordered button. The border and the text change to the accent
  on hover.
- **study-card:** a bordered surface for study content.
- **crt-panel:** the Phosphor Fade enclosure with scanlines and a vignette.
- **link:** accent text. Focus shows a 2px accent outline with a glow
  (`focus-terminal`).

## Do's and Don'ts

- Do use the semantic tokens (`bg-bg`, `text-ink`, `border-line`,
  `text-accent`).
- Do keep the monospace face for the interface.
- Don't add a light theme. The redesign removed it.
- Don't round corners outside the Phosphor Fade panel.
- Don't use faint text for content.
