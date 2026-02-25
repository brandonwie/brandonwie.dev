---
title: Claude Code Expert Workflows
description: >-
  Synthesized patterns from three complementary expert sources: Boris Cherny
  (tool
date: 2026-02-09T00:00:00.000Z
updated: 2026-02-09T00:00:00.000Z
tags:
  - general
  - claude-code
  - workflows
  - best-practices
category: general
draft: false
lang: en
references:
  - url: 'https://x.com/bcherny/status/2007179832300581177'
    title: Boris Cherny's Claude Code setup
    type: authoritative
  - url: >-
      https://heidenstedt.org/posts/2026/
      how-to-effectively-write-quality-code-with-ai/
    title: How to effectively write quality code with AI
    type: authoritative
  - url: 'https://github.com/ykdojo/claude-code-tips'
    title: '45 Claude Code Tips: From Basics to Advanced'
    type: authoritative
---

configuration), Mia Heidenstedt (process discipline), and YK Dojo (practitioner
workflows).

---

## The Problem

Claude Code is powerful out of the box, but without structured workflows,
sessions become inefficient: context windows fill up, parallel work is
underutilized, and AI-generated code quality varies. Expert practitioners have
developed patterns to maximize throughput and reliability, but their advice is
scattered across tweets, blog posts, and GitHub repos with no unified synthesis.

---

## Difficulties Encountered

- **Contradictory advice across sources:** Boris says "Opus always" for less
  steering; Heidenstedt emphasizes manual control. Had to realize these are
  complementary, not contradictory (tool vs process).
- **Signal vs noise in tip collections:** YK Dojo's 46 tips included both
  foundational and niche patterns. Required careful triage to extract the
  universally applicable ones.
- **No single source covers the full workflow:** Each expert optimizes a
  different layer (config, process, daily practice). The real value only emerges
  when combining all three perspectives.
- **Verification difficulty:** Some tips reference experimental or undocumented
  features (e.g., `--teleport`) that required confirming availability before
  recommending.

---

## Boris Cherny - Tool Configuration (13 Tips)

Boris is the creator of Claude Code at Anthropic. His setup is "surprisingly
vanilla" - the tool works well out of the box.

### Top Patterns

1. **Massive parallelism:** 5 terminal + 5-10 web sessions, `&` to hand off to
   web, `--teleport` between them
2. **Opus always:** Less steering = faster overall despite bigger model
3. **Living CLAUDE.md:** Add rule every time Claude makes a mistake (team
   contributes multiple times/week)
4. **Plan then auto-accept:** Plan mode (shift+tab x2) -> iterate on plan ->
   auto-accept for one-shot execution
5. **PostToolUse hook:** Auto-format on Write|Edit with `bun run format || true`
6. **Permissions allow-list:** Pre-allow safe commands via `/permissions`
   instead of skip-permissions
7. **Verification is #1:** "Give Claude a way to verify its work" - 2-3x quality
   improvement

### Key Configs

PostToolUse formatter:

```json
{
  "PostToolUse": [
    {
      "matcher": "Write|Edit",
      "hooks": [
        {
          "type": "command",
          "command": "bun run format || true"
        }
      ]
    }
  ]
}
```

Slack MCP (checked into `.mcp.json`):

```json
{
  "mcpServers": {
    "slack": {
      "type": "http",
      "url": "https://slack.mcp.anthropic.com/mcp"
    }
  }
}
```

## Heidenstedt - Process Discipline (12 Tips)

Core thesis: "Every decision in your project that you don't take and document
will be taken for you by the AI."

### Top Patterns

1. **AI cheats on tests:** Will write mocks, stubs, and hardcoded values to pass
   tests while code is broken. Write property-based tests yourself.
2. **Context isolation:** Write tests in a separate session so test AI can't
   learn implementation bugs
3. **HIGH-RISK markers:** `//HIGH-RISK-UNREVIEWED` and `//HIGH-RISK-REVIEWED`
   with auto-reset on AI modification
4. **Reduce complexity:** Every line eats context window. Simpler code = better
   AI output.
5. **Prototype cheaply:** AI code is cheap - explore 2-3 approaches before
   committing
6. **Never generate blindly:** Break into small units, verify each, restart from
   known-good if lost

## Complementary Relationship

| Aspect    | Boris (Tool)               | Heidenstedt (Process)   |
| --------- | -------------------------- | ----------------------- |
| Focus     | Configure Claude Code      | Work with any AI coder  |
| CLAUDE.md | Team sharing, live updates | Content strategy        |
| Testing   | Verify via browser/CLI     | AI-proof test design    |
| Quality   | PostToolUse hooks          | Review markers          |
| Workflow  | Plan + auto-accept         | Prototype + incremental |
| Security  | Permissions allow-list     | HIGH-RISK markers       |

Both are needed for a complete AI coding workflow.

## YK Dojo - Practitioner Workflows (46 Tips)

YK Dojo is a power user with 4.1k sessions and 17.6M tokens. Created the dx
plugin, SafeClaw, cc-safe, and Super Voice Assistant. Practitioner-focused:
emphasizes workflow optimization and "automation of automation."

### Top Patterns

1. **Voice input:** Local transcription for faster communication (works even on
   planes with earphones)
2. **Context freshness:** "AI context is like milk" - start fresh per topic,
   handoff docs for continuity
3. **Cascade multitasking:** New tab on right, sweep left to right, 3-4 tasks
   max
4. **Write-test cycle:** tmux pattern for testing interactive tools + Playwright
   over Chrome native
5. **Exponential backoff:** Manual increasing intervals for long-running job
   monitoring (token-efficient)
6. **Automation of automation:** manual -> CLAUDE.md -> skills -> scripts ->
   full automation progression
7. **Half-clone conversations:** Keep later half only when context grows too
   large (auto-trigger at 85%)

### Complementary Relationship (3 Sources)

| Aspect    | Boris (Tool)          | Heidenstedt (Process)   | YK Dojo (Practice)  |
| --------- | --------------------- | ----------------------- | ------------------- |
| Focus     | Configure Claude Code | Work with any AI        | Daily workflow      |
| CLAUDE.md | Team sharing          | Content strategy        | Keep simple, review |
| Testing   | Verify via CLI        | AI-proof design         | Write-test cycle    |
| Quality   | PostToolUse hooks     | Review markers          | Self-check prompts  |
| Workflow  | Plan + auto-accept    | Prototype + incremental | Cascade + voice     |
| Context   | Web UI parallelism    | N/A                     | Fresh + handoff     |

---

## When to Use

- Setting up Claude Code for a new team or project
- Onboarding a developer who is new to AI-assisted coding
- Reviewing your own workflow for missed optimization opportunities
- Choosing which expert patterns to adopt first (start with Boris for config,
  then layer Heidenstedt for discipline)

## When NOT to Use

- As a rigid checklist: these are patterns to adopt incrementally, not all at
  once. Adopting everything simultaneously creates cognitive overload.
- For non-Claude AI tools: Boris's tips are Claude Code-specific. Heidenstedt's
  process tips transfer, but tool configs do not.
- When working on trivial tasks: the overhead of parallel sessions,
  plan-then-execute, and verification hooks is not worth it for quick one-file
  fixes.
- As a substitute for reading the original sources: this synthesis omits context
  and nuance. Refer to the extracted guides for full detail.
