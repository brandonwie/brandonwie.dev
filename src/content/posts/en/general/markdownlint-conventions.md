---
title: Markdownlint Conventions
description: >-
  Markdown files across the 3B knowledge base had inconsistent formatting:
  missing
date: 2026-01-23T00:00:00.000Z
updated: 2026-01-23T00:00:00.000Z
tags:
  - general
  - documentation
  - markdown
  - linting
category: general
draft: false
lang: en
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
---

blank lines around lists, code blocks without language specifiers, duplicate
headings, and inconsistent table spacing. Over 7,500 markdownlint errors
accumulated across the repository, making files harder to read, causing
rendering issues on GitHub, and creating noisy diffs when different contributors
applied different formatting styles.

---

## Difficulties Encountered

- **Sheer volume of errors (7,500+):** Could not fix manually. Required
  understanding which rules were most impactful to prioritize fixes and which
  could be configured away.
- **MD060 dominated the error count (3,600+):** Table spacing errors were
  pervasive but mechanical. Had to decide between auto-fixing and establishing
  the convention first.
- **Rule conflicts:** Some rules (e.g., MD013 line length) conflict with table
  readability. Required per-rule configuration decisions rather than blanket
  enforcement.
- **Existing files used varied conventions:** Some files used compact table
  syntax, others padded. Normalizing required a single canonical style decision
  before applying fixes.

---

## Overview

Markdownlint is a Node.js style checker and lint tool for Markdown files.
Following these conventions ensures consistent, readable, and portable Markdown
across all documentation.

---

## Key Rules

### MD032 - Blanks Around Lists

Lists require blank lines before and after them.

**Bad:**

```markdown
Some text before

- Item 1
- Item 2 More text after
```

**Good:**

```markdown
Some text before

- Item 1
- Item 2

More text after
```

**Also applies to:**

- Bold text followed by list: `**Header:**` needs blank line before list
- Numbered lists (same rule)
- Nested lists (blank line before parent list)

---

### MD040 - Fenced Code Block Language

All fenced code blocks must specify a language.

**Bad:**

````markdown
```
some code here
```
````

**Good:**

````markdown
```bash
some code here
```
````

**Common languages:**

- `bash` / `sh` - Shell commands
- `yaml` / `yml` - YAML configuration
- `json` - JSON data
- `javascript` / `js` - JavaScript code
- `typescript` / `ts` - TypeScript code
- `python` - Python code
- `text` - Plain text (no syntax highlighting)
- `markdown` - Markdown examples

---

### MD024 - No Duplicate Headings

Heading text should be unique within a document.

**Bad:**

```markdown
## Overview

...

## Overview
```

**Good:**

```markdown
## Overview

...

## Session 2 Overview
```

**Note:** MD024 can be configured to allow duplicates under different parents
(e.g., multiple `### What I Did` under different `## Session` headings).

---

### MD060 - Table Column Style

Tables should have consistent spacing style.

**Styles:**

| Style                    | Example                          |
| ------------------------ | -------------------------------- |
| `leading_and_trailing`   | `\| text \|` (spaces both sides) |
| `leading_only`           | `\| text\|`                      |
| `trailing_only`          | `\|text \|`                      |
| `no_leading_or_trailing` | `\|text\|` (compact)             |

**Recommended:** Use `leading_and_trailing` for readability:

```markdown
| Header 1 | Header 2 |
| -------- | -------- |
| Cell 1   | Cell 2   |
```

---

### MD031 - Blanks Around Fences

Fenced code blocks need blank lines before and after.

**Bad:**

````markdown
Some text

```bash
code
```
````

More text

````text

**Good:**

```markdown
Some text

```bash
code
````

More text

````text

---

### MD009 - No Trailing Spaces

Lines should not have trailing whitespace.

**Note:** Configure editor to trim trailing whitespace on save.

---

### MD010 - No Hard Tabs

Use spaces instead of tabs for indentation.

**Standard:** 2 spaces for markdown, 4 spaces for code blocks.

---

### MD013 - Line Length

Lines should not exceed a maximum length (default: 80 characters).

**Note:** Often disabled for prose. Configure based on project needs.

---

## Configuration

Create `.markdownlint.json` or `.markdownlint.yaml` in project root:

```json
{
  "MD013": false,
  "MD024": {
    "siblings_only": true
  },
  "MD033": false,
  "MD041": false
}
````

**Common configurations:**

| Rule  | Setting               | Reason                                         |
| ----- | --------------------- | ---------------------------------------------- |
| MD013 | `false`               | Allow long prose lines                         |
| MD024 | `siblings_only: true` | Allow duplicate headings in different sections |
| MD033 | `false`               | Allow inline HTML (for badges, details)        |
| MD041 | `false`               | Allow documents without top-level heading      |

---

## VS Code Integration

Install "markdownlint" extension (`DavidAnson.vscode-markdownlint`).

**Settings (`settings.json`):**

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

---

## Quick Reference

| Issue                      | Rule  | Fix                               |
| -------------------------- | ----- | --------------------------------- |
| List missing blank line    | MD032 | Add blank line before/after list  |
| Code block no language     | MD040 | Add language after opening ```    |
| Duplicate heading          | MD024 | Make heading text unique          |
| Inconsistent table spacing | MD060 | Use `\| text \|` consistently     |
| No blank around code       | MD031 | Add blank line before/after fence |
| Trailing spaces            | MD009 | Configure editor to trim          |
| Hard tabs                  | MD010 | Use spaces (2 for md, 4 for code) |

---

## When to Use

- All documentation files in any repository
- README files
- Knowledge base entries
- Journal entries
- Technical guides

## When NOT to Use

- Markdown in code comments (different rules may apply)
- Markdown embedded in other formats (may have constraints)

---

## Resources

- [markdownlint GitHub](https://github.com/DavidAnson/markdownlint)
- [markdownlint Rules](https://github.com/DavidAnson/markdownlint/blob/main/doc/Rules.md)
- [VS Code Extension](https://marketplace.visualstudio.com/items?itemName=DavidAnson.vscode-markdownlint)
