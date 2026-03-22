---
title: Markdownlint Conventions
description: >-
  Markdown files across the 3B knowledge base had inconsistent formatting:
  missing
date: 2026-01-23T00:00:00.000Z
updated: '2026-03-22'
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
    title: Rules.md
    type: official
  - url: >-
      https://marketplace.visualstudio.com/items?itemName=DavidAnson.vscode-markdownlint
    title: items
    type: verified
source_content_hash: b18ff06056726d7eda3e61e5da1b3acf04c546bb252db8add1fb61c5bc51d2a2
---

I ran markdownlint on a knowledge base with about 200 markdown files and got back 7,500 errors. Seven thousand five hundred. The repository had accumulated formatting debt over months -- missing blank lines around lists, code blocks without language specifiers, duplicate headings, inconsistent table spacing. Every contributor applied their own conventions, and the result was a codebase where diffs were noisy, GitHub rendering was unpredictable, and no one could tell "correct" formatting from "works on my machine" formatting.

This post covers the rules that matter most, the configuration decisions I made, and how to set up markdownlint so the problem stays fixed.

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

This also applies to bold text followed by a list (`` **Header:** `` needs a blank line before the list), numbered lists, and nested lists. In my knowledge base, this was the second most common error because it is easy to forget the blank line when you are writing quickly.

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

In my repository, MD060 accounted for 3,600 of the 7,500 errors -- almost half. The violations were mechanical (inconsistent padding) and auto-fixable, but the sheer volume meant I had to decide on a canonical style before running any automated fixes.

### MD031: Blank Lines Around Code Fences

Fenced code blocks need blank lines before and after them, for the same rendering reasons as lists.

### MD009 and MD010: Trailing Spaces and Hard Tabs

Lines should not have trailing whitespace (MD009), and indentation should use spaces instead of tabs (MD010). The standard is 2 spaces for markdown and 4 spaces for code blocks. Both of these are best handled by editor configuration rather than manual effort -- set your editor to trim trailing whitespace on save and insert spaces instead of tabs.

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

| Rule  | Setting               | Reason                                         |
| ----- | --------------------- | ---------------------------------------------- |
| MD013 | `false`               | Allow long prose lines (line length limit hurts readability in prose) |
| MD024 | `siblings_only: true` | Allow duplicate headings in different sections |
| MD033 | `false`               | Allow inline HTML (needed for badges, details/summary) |
| MD041 | `false`               | Allow documents without a top-level heading (YAML frontmatter replaces it) |

MD013 (line length) deserves special mention. The default 80-character limit makes sense for code but fights against natural prose. When writing documentation, forcing line breaks mid-sentence creates awkward diffs and harder-to-read raw files. I disable it in every project.

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
| Code block no language     | MD040 | Add language after opening ``` |
| Duplicate heading          | MD024 | Make heading text unique          |
| Inconsistent table spacing | MD060 | Use `\| text \|` consistently    |
| No blank around code       | MD031 | Add blank line before/after fence |
| Trailing spaces            | MD009 | Configure editor to trim          |
| Hard tabs                  | MD010 | Use spaces (2 for md, 4 for code) |

## Takeaway

Markdownlint is not about making markdown pretty. It is about making markdown predictable -- consistent rendering across platforms, clean diffs in version control, and formatting conventions that scale across contributors. The initial investment is configuring the rules to match your project's needs and running a one-time cleanup. After that, the VS Code extension and CI integration keep the error count at zero. In my case, going from 7,500 errors to zero took one afternoon of automated fixes and one configuration file. The repository has stayed clean since.
