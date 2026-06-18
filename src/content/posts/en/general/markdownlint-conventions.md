---
title: Markdownlint Conventions
description: 7,500 markdownlint errors across 200 markdown files. The rules that mattered, the configuration that stuck, two pre-commit traps that surface only in nested scopes, and the strict-preset migration that collapsed a 14-rule custom config into one extends + five carve-outs.
date: 2026-01-23T00:00:00.000Z
updated: 2026-05-06
tags:
  - general
  - documentation
  - markdown
  - linting
category: general
draft: false
lang: en
expanded: true
references:
  - url: 'https://github.com/DavidAnson/markdownlint'
    title: markdownlint
    type: official
  - url: 'https://github.com/DavidAnson/markdownlint/blob/main/doc/Rules.md'
    title: markdownlint Rules
    type: official
  - url: >-
      https://marketplace.visualstudio.com/items?itemName=DavidAnson.vscode-markdownlint
    title: VS Code markdownlint extension
    type: verified
  - url: 'https://github.com/DavidAnson/markdownlint/blob/main/style/all.json'
    title: 'markdownlint built-in style/all preset'
    type: official
  - url: 'https://www.joshuakgoldberg.com/blog/configuring-markdownlint-alongside-prettier/'
    title: 'Configuring Markdownlint Alongside Prettier (Joshua Goldberg)'
    type: authoritative
  - url: 'https://github.com/github/markdownlint-github'
    title: 'GitHub''s markdownlint preset (accessibility-focused)'
    type: official
source_content_hash: 825b1e4db8ec013c222bdef69255a781d388d636b2a641093fb56219d7e2efc9
---

I ran markdownlint on a knowledge base with about 200 markdown files and got back 7,500 errors. Seven thousand five hundred. The repository had accumulated formatting debt over months — missing blank lines around lists, code blocks without language specifiers, duplicate headings, inconsistent table spacing. Every contributor applied their own conventions, and the result was a codebase where diffs were noisy, GitHub rendering was unpredictable, and no one could tell "correct" formatting from "works on my machine" formatting.

This post covers the rules that matter most, the configuration decisions I made, two non-obvious traps that show up later in nested config scopes, and a follow-up migration that replaced a 14-rule custom config with a one-line `extends:` plus five documented carve-outs.

## Why Consistent Markdown Formatting Matters

Markdown's flexibility is a trap. The spec allows many ways to write the same thing, and renderers handle edge cases differently. A list without a blank line before it renders fine in VS Code's preview but breaks in GitHub's renderer. A code block without a language tag gets no syntax highlighting anywhere. Inconsistent table spacing produces noisy diffs where half the changes are whitespace.

These are not aesthetic complaints. They cause real problems: broken rendering on documentation sites, meaningless diffs that hide actual content changes, and cognitive overhead when reading files that follow different conventions on every page.

Markdownlint is a Node.js linter that enforces a configurable set of rules. It catches formatting issues at the source, before they reach version control.

## The Rules That Matter Most

Out of markdownlint's 50+ rules, six account for the vast majority of real-world issues. Here is what each one catches and how to fix it.

### MD032: Blank Lines Around Lists

Lists require blank lines before and after them. Without the blank lines, some renderers merge the list with surrounding text.

**Wrong:**

```markdown
Some text before
- Item 1
- Item 2
More text after
```

**Correct:**

```markdown
Some text before

- Item 1
- Item 2

More text after
```

This also applies to bold text followed by a list (`**Header:**` needs a blank line before the list), numbered lists, and nested lists. In my knowledge base, this was the second most common error because it is easy to forget the blank line when you are writing quickly.

### MD040: Code Block Language Specifier

Every fenced code block must specify a language. Without it, you get no syntax highlighting and no way for tools to identify the content type.

**Wrong:**

````markdown
```
some code here
```
````

**Correct:**

````markdown
```bash
some code here
```
````

Common language tags: `bash`/`sh` for shell commands, `yaml`/`yml` for configuration, `json` for data, `typescript`/`ts` for TypeScript, `python` for Python, `text` for plain text with no highlighting, `markdown` for markdown examples.

When in doubt, use `text`. It signals intent ("I know this has no syntax highlighting") rather than leaving the reader to wonder if you forgot.

### MD024: No Duplicate Headings

Heading text should be unique within a document. Duplicate headings break anchor links and make navigation confusing.

**Wrong:**

```markdown
## Overview
...
## Overview
```

**Correct:**

```markdown
## Overview
...
## Session 2 Overview
```

This rule can be configured with `siblings_only: true` to allow duplicate headings under different parent sections. For example, multiple `### What I Did` headings under different `## Session` headings would be allowed. This is the configuration I recommend for knowledge bases and journals where repeated section structures are common.

### MD060: Table Column Spacing

Tables should use consistent spacing. The four styles are:

| Style                    | Example                          |
| ------------------------ | -------------------------------- |
| `leading_and_trailing`   | `\| text \|` (spaces both sides) |
| `leading_only`           | `\| text\|`                      |
| `trailing_only`          | `\|text \|`                      |
| `no_leading_or_trailing` | `\|text\|` (compact)             |

Use `leading_and_trailing` for readability:

```markdown
| Header 1 | Header 2 |
| -------- | -------- |
| Cell 1   | Cell 2   |
```

In my repository, MD060 accounted for 3,600 of the 7,500 errors — almost half. The violations were mechanical (inconsistent padding) and auto-fixable, but the sheer volume meant I had to decide on a canonical style before running any automated fixes.

### MD031: Blank Lines Around Code Fences

Fenced code blocks need blank lines before and after them, for the same rendering reasons as lists.

### MD009 and MD010: Trailing Spaces and Hard Tabs

Lines should not have trailing whitespace (MD009), and indentation should use spaces instead of tabs (MD010). The standard is 2 spaces for markdown and 4 spaces for code blocks. Both of these are best handled by editor configuration rather than manual effort — set your editor to trim trailing whitespace on save and insert spaces instead of tabs.

## Configuring Markdownlint

Not every rule makes sense for every project. Create a `.markdownlint.json` in your project root to disable or customize rules:

```json
{
  "MD013": false,
  "MD024": {
    "siblings_only": true
  },
  "MD033": false,
  "MD041": false
}
```

Here is the reasoning behind common configuration choices:

| Rule  | Setting               | Reason                                                                |
| ----- | --------------------- | --------------------------------------------------------------------- |
| MD013 | `false`               | Allow long prose lines (line length limit hurts readability in prose) |
| MD024 | `siblings_only: true` | Allow duplicate headings in different sections                        |
| MD033 | `false`               | Allow inline HTML (needed for badges, details/summary)                |
| MD041 | `false`               | Allow documents without a top-level heading (frontmatter replaces it) |

MD013 (line length) deserves special mention. The default 80-character limit makes sense for code but fights against natural prose. When writing documentation, forcing line breaks mid-sentence creates awkward diffs and harder-to-read raw files. I disable it in every project.

## Adopting a Strict Preset (`style/all` + Carve-Outs)

A 14-rule custom config like the one above accumulates entries that are no-ops, redundant, or quietly broken. After living with mine for a few months I migrated to the upstream `style/all` preset plus a small number of documented carve-outs. The migration collapsed sprawling per-rule configs into one `extends:` plus a handful of explicit exceptions, and surfaced 36 MD040 errors that had been hiding behind ineffective overrides.

### The recipe

```json
{
  "config": {
    "extends": "markdownlint/style/all",

    // Carve-outs — each documented with reason
    "MD013": false, // prettier handles wrapping
    "MD024": { "siblings_only": true }, // sibling section repetition allowed
    "MD025": { "front_matter_title": "" }, // no H1 below frontmatter
    "MD036": false, // **Bold:** patterns intentional
    "MD060": false // table column style varies
  },
  "ignores": [
    /* ... */
  ]
}
```

### What `style/all` actually is

The upstream preset ([style/all.json](https://github.com/DavidAnson/markdownlint/blob/main/style/all.json)) is literally:

```json
{
  "comment": "All rules",
  "default": true
}
```

So `extends: "markdownlint/style/all"` is equivalent to `{"default": true}` — every rule on with default settings. Both are valid baselines; `extends:` is preferable because it documents intent (vs. anonymous `default: true`).

### Other built-in presets

The same `style/` directory ships three more options, all subtractive (designed to be extended, not used standalone with custom rules layered on top):

| Preset                    | Disables                                                                                                                   | Use case                                           |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `style/all.json`          | nothing — `{default: true}`                                                                                                | Strictest baseline, then carve out as needed       |
| `style/relaxed.json`      | line-length, ul-indent, no-inline-html, no-bare-urls, fenced-code-language, first-line-h1, whitespace                      | Permissive defaults for prose-heavy GitHub READMEs |
| `style/prettier.json`     | 23 formatting rules (blanks-around-fences, code-fence-style, hr-style, line-length, list-indent, no-trailing-spaces, etc.) | Coexist with prettier — Joshua Goldberg's recipe   |
| `style/cirosantilli.json` | personal style of Ciro Santilli                                                                                            | Reference only                                     |

### Run the proposed config first, then promise

When proposing a config simplification, run the proposed config FIRST against unmodified content. Don't extrapolate from current-config output — existing overrides may be silencing thousands of failures you'd inherit if you switched to "pure defaults." On a 3B test (2026-05-01):

| Config                                | Failures (reported)              |
| ------------------------------------- | -------------------------------- |
| Existing 14-rule custom               | 131                              |
| `extends: "markdownlint/style/all"`   | **11,398** (MD013 alone: 10,491) |
| `extends: "style/all"` + 5 carve-outs | 36 (MD040 only, sweepable)       |

The first two should be identical if the 14 customizations were "no-op against defaults." Instead the existing config silenced ~11,000 failures via MD013 false (line-length), MD024 siblings_only=true, and MD025 front_matter_title="" — meaning those overrides were load-bearing, not redundant.

The workflow: write a temp config file (must include the `markdownlint-cli2` prefix in the filename, e.g., `pure-default.markdownlint-cli2.jsonc` — the CLI rejects arbitrary names), invoke `npx markdownlint-cli2 --config <temp-file> '<glob>'`, group failures by `MD###/rule-name`, then decide which to carve out vs. fix.

### The config-theater trap

Custom rule values that LOOK valid but produce no effect because the value isn't recognized. markdownlint silently falls back to default behavior without warning. Hard to detect by reading the config alone. Examples seen in 3B's prior config:

| Override                  | Issue                                                                 | Fix                                               |
| ------------------------- | --------------------------------------------------------------------- | ------------------------------------------------- |
| `MD060: { style: "any" }` | `"any"` not a valid value (valid: `compact`, `aligned`, `consistent`) | Use `MD060: false` if the rule should be disabled |
| 11× `MD###: true` entries | Match defaults exactly — redundant noise                              | Drop them; rely on `default: true`                |

Diff-test rule: lint with vs. without the override. If failure count and distribution are identical, the override is broken or redundant. Fix or drop.

### Comparison with `@github/markdownlint-github`

This third-party preset (built on DavidAnson's lib) is opinionated for a different audience — accessible OSS docs with images. Composes `base.js` + `accessibility.js` + custom `GH001-003` rules:

- Forces `ul-style: { style: "asterisk" }` (every `-` bullet flagged)
- Forces `no-emphasis-as-heading: true`
- Forces `no-duplicate-heading` with `siblings_only: false`
- Adds GH001 (no-default-alt-text), GH002 (no-generic-link-text), GH003 (no-empty-alt-text)
- Requires `.markdownlint-cli2.mjs` (function-based config) + npm install of `@github/markdownlint-github` + `markdownlint-cli2-formatter-pretty`

Skip unless: publishing public OSS docs with images where accessibility enforcement matters. For prose-heavy private knowledge bases, the migration cost (estimated thousands of rewrite errors on 3B's content) outweighs the benefit.

## Scope Warning: Root Config Doesn't Always Win

A subtle one I learned later: disabling a rule at the project root does NOT propagate into nested config scopes. `.claude/skills/**`, `.codex/skills/**`, and other tool-managed directories are routinely linted under their own `.markdownlint.json` (or markdownlint-cli2 glob filter) and may keep MD033 enabled even when the repo root disables it.

The next two sections describe two specific traps that surface from this scoping behavior. Both ate commits before I understood why root-level "I disabled that rule" wasn't enough.

## MD033 Pitfall — CJK Text and Angle-Bracket Placeholders

`MD033/no-inline-html` flags `<word>` patterns as HTML elements. The trap is that markdownlint's HTML detector does not require the placeholder to be a real HTML element — any `<identifier>` anywhere in prose triggers the rule, including inside CJK text where the angle brackets are clearly being used as documentation placeholder syntax.

```markdown
<!-- Both flagged with MD033/no-inline-html [Element: id] / [Element: choice] -->

투표하고 싶다고 하면 node ~/.config/ainc/anc-hook.js vote <id> "<choice>"
node ~/.config/ainc/anc-hook.js profile edit <필드> "<값>"
node ~/.config/ainc/anc-hook.js suggest "<내용>"
```

**Fix:** wrap the CLI snippet in inline backticks so the angle brackets render as code, not HTML. The visual semantics — "this is a placeholder you replace" — survive the change.

```markdown
투표하고 싶다고 하면 `node ~/.config/ainc/anc-hook.js vote <id> "<choice>"`
`node ~/.config/ainc/anc-hook.js profile edit <필드> "<값>"`
`node ~/.config/ainc/anc-hook.js suggest "<내용>"`
```

Why this surprises:

- Korean (or any non-Latin script) sentences feel "obviously prose" to the reader, so the angle bracket placeholder visually looks safe.
- CJK characters inside the brackets (`<필드>`, `<내용>`) feel even less HTML-like than `<id>` does — but markdownlint's lexer treats both the same.
- The trap usually surfaces only in nested scopes (skills directories, plugin packages) where MD033 is still enabled, leading to the wrong mental model: "but I disabled MD033 globally."

## `*.me.md` Pre-Commit Trap on Folder Rename

Pre-commit lint sees folder renames as "newly added" files. If the renamed folder contains human-authored `.me.md` files (Notion exports, brain dumps, PRD seeds) with inline HTML (`<aside>`, `<details>`) or duplicate headings, markdownlint blocks the commit even though the content is unchanged from its prior path.

A reproduction from late April: renaming `projects/moba/actives/onboarding/` to `frontend-onboarding/` triggered pre-commit lint on `notion-requirements.me.md` (a Notion export with inline `<aside>` HTML and duplicate Korean headings). lint-staged saw the file as "newly added" even though its content was unchanged.

```bash
git add projects/moba/actives/onboarding/ projects/moba/actives/frontend-onboarding/
git commit
# → markdownlint-cli2 fails on notion-requirements.me.md:
#   MD041 first-line-heading
#   MD033 inline HTML [Element: aside]  (×3)
#   MD024 duplicate headings (×3)
```

**Fix:** add `**/*.me.md` to the `ignores` array in `.markdownlint-cli2.jsonc`. `.me.md` is a convention for human-authored seed files that AI/tooling must not modify. Lint must not gate commits on their content.

```json
"ignores": [
  // ...
  "**/*.me.md"
]
```

Why this surprises:

- The folder rename intuitively feels like a "no-content-change" operation; lint shouldn't have an opinion. lint-staged disagrees — it lints whatever is staged, including renamed paths.
- The `.me.md` extension already signals "do not modify" semantically, but markdownlint has no notion of that convention.
- A standalone `notion-requirements.me.md` file would have been blocked on initial commit too — the rename just exposed the latent miss.

## VS Code Integration

Install the [markdownlint extension](https://marketplace.visualstudio.com/items?itemName=DavidAnson.vscode-markdownlint) (`DavidAnson.vscode-markdownlint`) to see violations inline as you type.

Add this to your VS Code `settings.json`:

```json
{
  "markdownlint.config": {
    "MD013": false,
    "MD024": { "siblings_only": true }
  },
  "editor.formatOnSave": true,
  "[markdown]": {
    "editor.wordWrap": "on",
    "editor.quickSuggestions": false
  }
}
```

The `quickSuggestions: false` setting for markdown files prevents the autocomplete popup from appearing while you write prose, which is distracting. Word wrap keeps long lines visible without horizontal scrolling.

## Quick Reference

When you encounter a markdownlint error and need to fix it fast, this table maps common issues to their solutions:

| Issue                      | Rule  | Fix                               |
| -------------------------- | ----- | --------------------------------- |
| List missing blank line    | MD032 | Add blank line before/after list  |
| Code block no language     | MD040 | Add language after opening ```    |
| Duplicate heading          | MD024 | Make heading text unique          |
| Inconsistent table spacing | MD060 | Use `\| text \|` consistently     |
| No blank around code       | MD031 | Add blank line before/after fence |
| Trailing spaces            | MD009 | Configure editor to trim          |
| Hard tabs                  | MD010 | Use spaces (2 for md, 4 for code) |
| `<id>` flagged as HTML     | MD033 | Wrap in backticks: `` `<id>` ``    |
| `.me.md` blocking commits  | —     | Add `**/*.me.md` to ignores       |

## Takeaway

Markdownlint is not about making markdown pretty. It is about making markdown predictable — consistent rendering across platforms, clean diffs in version control, and formatting conventions that scale across contributors. The initial investment is configuring the rules to match your project's needs and running a one-time cleanup. After that, the VS Code extension and CI integration keep the error count at zero. In my case, going from 7,500 errors to zero took one afternoon of automated fixes and one configuration file. The follow-up `style/all` migration replaced a sprawling 14-rule custom config with one `extends:` line plus five documented carve-outs, and surfaced ~11,000 failures that the prior overrides had been silencing — load-bearing, not redundant. The repository has stayed clean since, with the caveat that nested config scopes follow their own rules, so the first commit into a new tool-managed directory is worth lint-checking explicitly.
