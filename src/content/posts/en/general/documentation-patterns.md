---
title: Documentation Patterns
description: The **Buffer Pattern** preserves important discoveries during AI-assisted
date: 2025-01-15T00:00:00.000Z
updated: 2026-01-26T00:00:00.000Z
tags:
  - general
  - documentation
  - 3b
  - patterns
category: general
draft: false
lang: en
references:
  - url: 'https://www.writethedocs.org/guide/index.html'
    title: Software documentation guide — Write the Docs
    type: authoritative
---

sessions. It solves a fundamental problem: valuable insights are lost when
sessions end or connections drop.

The pattern uses a single buffer file (`.claude/buffer.md`) where important
moments are captured immediately. At session end (`/wrap`), entries are
processed into journals and knowledge files.

---

## WHY does it exist?

### The Problem

```text
SCENARIO: Working session with Claude

- Make important decision (chose X over Y)
- Solve tricky problem (root cause was Z)
- Find useful pattern (this approach works well)

THEN:
- Session ends / connection drops / new session starts

RESULT: All context LOST
```

### The Solution

```text
DURING SESSION (as important things happen):
┌────────────────────────────────────────────────────────────────┐
│ Important moment occurs (decision, solution, discovery)        │
│         │                                                      │
│         ▼                                                      │
│ IMMEDIATELY write to .claude/buffer.md                         │
│ (brief entry with 5W1H context)                                │
│         │                                                      │
│         ▼                                                      │
│ Buffer PERSISTS even if session ends                           │
└────────────────────────────────────────────────────────────────┘

AT /wrap TIME:
┌────────────────────────────────────────────────────────────────┐
│ Read buffer entries                                            │
│         │                                                      │
│         ▼                                                      │
│ Process into journals/knowledge                                │
│         │                                                      │
│         ▼                                                      │
│ Clear buffer for next session                                  │
└────────────────────────────────────────────────────────────────┘

RESULT: Important moments PRESERVED
```

---

## HOW does it work?

### When to Write

| Trigger | Write immediately when... |
| ------- | ------------------------- |
| Decision made | You chose X over Y with clear rationale |
| Problem solved | Root cause was non-obvious |
| Pattern discovered | A technique/approach works well |
| Useful reference | Found official docs or verified source |

### Entry Format

```markdown
## YYYY-MM-DD HH:MM - {project}

**What:** {one line summary}
**Why it matters:** {why this is worth remembering}
**Details:**
{code, explanation, reference - include 5W1H context}
```

### Buffer Location

Single file: `~/dev/personal/3b/.claude/buffer.md`

---

## KEY TAKEAWAYS

1. **Write immediately** - Don't wait until session end
2. **Keep it brief** - One entry per important moment
3. **Include 5W1H** - Context is critical for future recall
4. **Single file** - No per-project complexity

---

## HISTORY

| Date | Change |
| ---- | ------ |
| 2025-01-15 | Initial design as `learning-queue.md` |
| 2026-01-23 | Evolved to per-project `session-buffer.md` |
| 2026-01-26 | Simplified to single `buffer.md` (current) |

The pattern evolved through three iterations:

1. **learning-queue.md** - Complex entry format, never used
2. **session-buffer.md** - Per-project files, 5 entry types, never used
3. **buffer.md** - Single file, simple format (current)

---

## REFERENCES

- `.claude/buffer.md` - The buffer file
- `.claude/skills/wrap/SKILL.md` - Processes buffer at session end
