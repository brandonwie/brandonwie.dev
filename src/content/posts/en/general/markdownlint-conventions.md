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
  - url: "https://github.com/DavidAnson/markdownlint"
    title: markdownlint
    type: official
  - url: "https://github.com/DavidAnson/markdownlint/blob/main/doc/Rules.md"
    title: Rules.md
    type: official
  - url: >-
      https://marketplace.visualstudio.com/items?itemName=DavidAnson.vscode-markdownlint
    title: items
    type: verified
---

I ran `markdownlint` on my knowledge base for the first time and got back 7,500
errors. Not typos or broken links -- formatting inconsistencies. Missing blank
lines around lists, code blocks without language specifiers, duplicate headings,
tables with no spacing. Every file had its own style, and none of them agreed.

The problem was not that any single rule was hard to follow. The problem was
that without an enforced convention, entropy wins. Every file you touch
accumulates a slightly different formatting style, and over time the codebase
becomes a patchwork of conflicting conventions that generates noisy diffs and
confuses rendering on GitHub.

## Why Markdownlint Matters

Markdown is deceptively simple. You write it, it renders, and you move on. But
when you maintain hundreds of markdown files across a knowledge base,
inconsistency compounds. GitHub renders tables differently depending on spacing.
Code blocks without language tags get no syntax highlighting. Lists without
surrounding blank lines can merge with adjacent paragraphs in some renderers.

Markdownlint catches these issues before they reach production. It is a Node.js
style checker that enforces consistent formatting rules across all your markdown
files.

## The Difficulties I Faced

**Sheer volume of errors (7,500+).** I could not fix these manually. I needed to
understand which rules were most impactful to prioritize fixes and which could be
configured away.

**MD060 dominated the error count (3,600+).** Table spacing errors were
pervasive but mechanical. I had to decide between auto-fixing and establishing
the convention first. I chose to establish the convention, then fix.

**Rule conflicts.** Some rules like MD013 (line length) conflict with table
readability. Long table rows that wrap at 80 characters become unreadable. This
required per-rule configuration decisions rather than blanket enforcement.

**Existing files used varied conventions.** Some files used compact table syntax,
others padded. Normalizing required picking a single canonical style before
applying fixes across the board.

## The Rules That Matter Most

Here are the rules I enforce, ranked by how often they caused real problems.

### MD032 -- Blanks Around Lists

Lists require blank lines before and after them. Without them, some renderers
merge list items with surrounding paragraphs.

```markdown
<!-- Bad -->

Some text before

- Item 1
- Item 2
  More text after

<!-- Good -->

Some text before

- Item 1
- Item 2

More text after
```

This also applies to bold text followed by a list (`**Header:**` needs a blank
line before the list), numbered lists, and nested lists.

### MD040 -- Fenced Code Block Language

All fenced code blocks must specify a language. Without a language tag, you get
no syntax highlighting.

````markdown
<!-- Bad -->

```
some code here
```

<!-- Good -->

```bash
some code here
```
````

Common language tags: `bash`, `yaml`, `json`, `javascript`, `typescript`,
`python`, `text`, `markdown`.

### MD060 -- Table Column Style

Tables should use consistent spacing. I chose `leading_and_trailing` because it
is the most readable:

```markdown
| Header 1 | Header 2 |
| -------- | -------- |
| Cell 1   | Cell 2   |
```

This single rule accounted for 3,600+ of my 7,500 errors. Fixing it was
mechanical but the convention had to come first.

### MD024 -- No Duplicate Headings

Heading text should be unique within a document. Two sections both called
"Overview" confuse navigation and anchor links.

```markdown
<!-- Bad -->

## Overview

...

## Overview

<!-- Good -->

## Overview

...

## Session 2 Overview
```

MD024 can be configured with `siblings_only: true` to allow duplicates under
different parent headings.

### MD031 -- Blanks Around Fences

Fenced code blocks need blank lines before and after them. Without these, some
renderers fail to detect the code block boundaries.

### MD009 -- No Trailing Spaces

Lines should not have trailing whitespace. Configure your editor to trim on
save.

### MD010 -- No Hard Tabs

Use spaces instead of tabs. Standard is 2 spaces for markdown, 4 spaces for
code blocks.

### MD013 -- Line Length

Lines should not exceed 80 characters by default. I disable this for prose
since hard-wrapping paragraphs creates worse diffs than long lines. Tables get
an exception too.

## Configuration

Create a `.markdownlint.json` in your project root:

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

| Rule  | Setting               | Reason                                         |
| ----- | --------------------- | ---------------------------------------------- |
| MD013 | `false`               | Allow long prose lines                         |
| MD024 | `siblings_only: true` | Allow duplicate headings in different sections |
| MD033 | `false`               | Allow inline HTML (for badges, details)        |
| MD041 | `false`               | Allow documents without top-level heading      |

## VS Code Integration

Install the markdownlint extension (`DavidAnson.vscode-markdownlint`) and add
these settings:

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

This gives you real-time linting in the editor. Errors show as yellow squiggles,
and you can fix most of them with a single keypress.

## Quick Reference

| Issue                      | Rule  | Fix                               |
| -------------------------- | ----- | --------------------------------- |
| List missing blank line    | MD032 | Add blank line before/after list  |
| Code block no language     | MD040 | Add language after opening fence  |
| Duplicate heading          | MD024 | Make heading text unique          |
| Inconsistent table spacing | MD060 | Use `\| text \|` consistently     |
| No blank around code       | MD031 | Add blank line before/after fence |
| Trailing spaces            | MD009 | Configure editor to trim          |
| Hard tabs                  | MD010 | Use spaces (2 for md, 4 for code) |

## Why This Works

Markdownlint turns implicit formatting expectations into explicit, enforceable
rules. Once the convention exists in a config file, every contributor follows
the same standard. Diffs become cleaner because formatting changes stop
polluting content changes. GitHub renders tables and code blocks consistently
because the source formatting is consistent.

## Practical Takeaway

Start by running `markdownlint` on your existing files. Do not try to fix
everything at once. Identify which rules generate the most errors, establish the
convention for those first, then fix in bulk. Configure away rules that conflict
with your project's needs (like MD013 for prose-heavy repos).

Use markdownlint in these contexts:

- All documentation files in any repository
- README files
- Knowledge base entries
- Journal entries and technical guides

Skip it for markdown in code comments or markdown embedded in other formats
where the host format has its own constraints.

## Resources

- [markdownlint GitHub](https://github.com/DavidAnson/markdownlint)
- [markdownlint Rules](https://github.com/DavidAnson/markdownlint/blob/main/doc/Rules.md)
- [VS Code Extension](https://marketplace.visualstudio.com/items?itemName=DavidAnson.vscode-markdownlint)
