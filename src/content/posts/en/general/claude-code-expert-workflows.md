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
  - url: "https://x.com/bcherny/status/2007179832300581177"
    title: Boris Cherny's Claude Code setup
    type: authoritative
  - url: >-
      https://heidenstedt.org/posts/2026/
      how-to-effectively-write-quality-code-with-ai/
    title: How to effectively write quality code with AI
    type: authoritative
  - url: "https://github.com/ykdojo/claude-code-tips"
    title: "45 Claude Code Tips: From Basics to Advanced"
    type: authoritative
---

I was using Claude Code every day, but I knew I was leaving performance on the
table. My sessions ran long, context windows filled up, and I was not taking
advantage of parallelism. So I studied how three experts use Claude Code and
synthesized their approaches into a unified workflow.

The experts are Boris Cherny (the creator of Claude Code), Mia Heidenstedt (a
process discipline advocate), and YK Dojo (a power user with 4,100+ sessions
and 17.6 million tokens processed). Each optimizes a different layer of the
workflow, and the real value emerges when you combine all three.

## Why This Matters

Claude Code is powerful out of the box. But without structured workflows,
sessions become inefficient: context windows fill up with irrelevant history,
parallel work goes underutilized, and AI-generated code quality varies from
excellent to subtly broken.

Expert practitioners have developed patterns to maximize throughput and
reliability. The problem is that their advice is scattered across tweets, blog
posts, and GitHub repos. Worse, some advice appears contradictory until you
realize the experts are optimizing different layers.

## The Difficulties

**Contradictory advice across sources** was the first hurdle. Boris says "Opus
always" for less steering. Heidenstedt emphasizes manual control and human
review. These are not contradictory -- they are complementary. Boris optimizes
tool configuration, Heidenstedt optimizes the human process around any AI tool.

**Signal vs noise in tip collections** was another challenge. YK Dojo published
46 tips ranging from foundational (use voice input) to highly niche (exponential
backoff for monitoring). Extracting the universally applicable patterns required
careful triage.

**No single source covers the full workflow.** Each expert optimizes one layer.
You need all three to have a complete system.

## Boris Cherny -- Tool Configuration

Boris is the creator of Claude Code at Anthropic. His setup is "surprisingly
vanilla," which is itself an insight: the tool works well out of the box when
you know the right configuration patterns.

### Top Patterns

**Massive parallelism.** Boris runs 5 terminal sessions and 5-10 web sessions
simultaneously. He uses `&` to hand off tasks to web and `--teleport` to move
between them. This is the single biggest throughput multiplier.

**Opus always.** He uses the Opus model exclusively, even though it is slower
per token. Less steering means faster overall because you spend less time
correcting the model.

**Living CLAUDE.md.** Every time Claude makes a mistake, Boris adds a rule to
CLAUDE.md. His team contributes multiple times per week. The file is a living
document, not a one-time setup.

**Plan then auto-accept.** Switch to plan mode (shift+tab twice), iterate on
the plan until it is right, then switch to auto-accept for one-shot execution.
This separates thinking from doing.

**PostToolUse hooks.** Auto-format on every Write or Edit operation:

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

**Permissions allow-list.** Pre-allow safe commands via `/permissions` instead
of using skip-permissions. This gives you speed without sacrificing safety.

**Verification is the top priority.** "Give Claude a way to verify its work"
delivers 2-3x quality improvement. This means running tests, checking browser
output, or validating CLI results after each change.

### Key Config: Slack MCP

Boris checks this into `.mcp.json` for team-wide access:

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

## Heidenstedt -- Process Discipline

Mia Heidenstedt's core thesis: "Every decision in your project that you don't
take and document will be taken for you by the AI." Her tips apply to any AI
coding tool, not just Claude Code.

### Top Patterns

**AI cheats on tests.** This is the most important insight. AI will write mocks,
stubs, and hardcoded values to pass tests while the underlying code is broken.
The fix: write property-based tests yourself and keep them in a separate
session so the test-writing AI cannot learn the implementation bugs.

**Context isolation.** Write tests in a separate Claude Code session from the
implementation. If the same session wrote both the code and the tests, the AI
may unconsciously design tests that pass the buggy implementation.

**HIGH-RISK markers.** Tag risky code with `//HIGH-RISK-UNREVIEWED` and
`//HIGH-RISK-REVIEWED`. Set up automation to auto-reset the marker when AI
modifies the code. This creates a forced review checkpoint.

**Reduce complexity.** Every line of code eats context window. Simpler code
produces better AI output because the model has more room for reasoning.

**Prototype cheaply.** AI code is cheap to generate. Explore 2-3 approaches
before committing to one. This sounds wasteful but saves time because you avoid
backing out of a bad approach mid-implementation.

**Never generate blindly.** Break work into small units, verify each one, and
restart from a known-good state if you get lost. This is the opposite of
"generate the whole feature in one prompt."

## YK Dojo -- Practitioner Workflows

YK Dojo is a power user who has run 4,100+ Claude Code sessions. He created
the dx plugin, SafeClaw, cc-safe, and Super Voice Assistant. His tips are
practitioner-focused: daily workflow optimization and "automation of
automation."

### Top Patterns

**Voice input.** Local transcription for faster communication. Works even on
planes with earphones. Voice is faster than typing for explaining context.

**Context freshness.** "AI context is like milk" -- start fresh per topic and
use handoff documents for continuity. Do not try to stretch one session across
unrelated tasks.

**Cascade multitasking.** Open new tabs on the right, sweep left to right.
Keep 3-4 tasks maximum. This prevents context thrashing while maintaining
throughput.

**Write-test cycle.** Use a tmux pattern for testing interactive tools, and
prefer Playwright over Chrome native for browser automation.

**Exponential backoff.** For long-running jobs, use manually increasing check
intervals instead of polling in a tight loop. This is token-efficient.

**Automation of automation.** The progression is: manual process, then add it
to CLAUDE.md, then create a skill, then a script, then full automation. Each
step captures knowledge that the next step builds on.

**Half-clone conversations.** When context grows too large (auto-trigger at
85%), keep only the later half. This preserves recent context while freeing
space.

## How the Three Sources Complement Each Other

| Aspect    | Boris (Tool)          | Heidenstedt (Process)   | YK Dojo (Practice)  |
| --------- | --------------------- | ----------------------- | ------------------- |
| Focus     | Configure Claude Code | Work with any AI        | Daily workflow      |
| CLAUDE.md | Team sharing          | Content strategy        | Keep simple, review |
| Testing   | Verify via CLI        | AI-proof design         | Write-test cycle    |
| Quality   | PostToolUse hooks     | Review markers          | Self-check prompts  |
| Workflow  | Plan + auto-accept    | Prototype + incremental | Cascade + voice     |
| Context   | Web UI parallelism    | N/A                     | Fresh + handoff     |

All three are needed for a complete AI coding workflow. Boris tells you how to
configure the tool. Heidenstedt tells you how to structure the human process.
YK Dojo tells you how to optimize daily practice.

## Why This Works

The combined workflow addresses each failure mode:

- **Context windows filling up?** Use fresh sessions (YK Dojo) and half-clone
  when needed.
- **AI-generated code has bugs?** Use verification hooks (Boris) and AI-proof
  tests (Heidenstedt).
- **Throughput feels low?** Use massive parallelism (Boris) and cascade
  multitasking (YK Dojo).
- **Quality varies?** Use PostToolUse hooks (Boris), HIGH-RISK markers
  (Heidenstedt), and plan-then-execute (Boris).

## Practical Takeaway

Start with Boris's configuration: set up CLAUDE.md as a living document, add
PostToolUse hooks for formatting, and configure the permissions allow-list.
This takes 15 minutes and gives you immediate quality improvements.

Then layer Heidenstedt's discipline: separate test sessions from implementation
sessions, add HIGH-RISK markers, and break work into verifiable units.

Finally, adopt YK Dojo's daily practices as they fit your workflow: voice
input, cascade multitasking, and the automation progression.

**Do not adopt everything at once.** Pick one pattern per week, let it become
habit, then add the next. Trying to implement all of these simultaneously
creates cognitive overload that defeats the purpose.

**Skip this entirely** for trivial one-file fixes. The overhead of parallel
sessions and verification hooks is not worth it when you just need to change a
string constant.
