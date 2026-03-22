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
expanded: true
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
source_content_hash: c49dd2f52a1c7a375ea01d7a4f0cc25489910a634fd4598ecac0080c04d45caf
---

Six months ago I was using Claude Code the way most people start: type a prompt, wait, accept or reject the output, repeat. My sessions were linear and slow. Context windows filled up before the task was done. The code quality varied wildly between sessions. I knew the tool was capable of more but could not figure out the right workflow.

Then I found three sources that, taken together, changed how I use Claude Code. Boris Cherny (who built Claude Code at Anthropic) shared his surprisingly vanilla setup. Mia Heidenstedt wrote about process discipline for AI-assisted coding. YK Dojo published 46 tips from 4,100+ sessions and 17.6 million tokens of usage. Each expert optimizes a different layer. The real value emerges when you combine all three.

## Why Three Sources

The challenge I hit when trying to learn Claude Code best practices was contradictory advice. Boris says "Opus always" -- use the biggest model and steer less. Heidenstedt emphasizes manual control and careful verification. At first these seemed opposed. Then I realized they operate at different layers.

Boris optimizes the **tool layer**: how to configure Claude Code itself. Heidenstedt optimizes the **process layer**: how to structure your work regardless of which AI tool you use. YK Dojo optimizes the **practice layer**: daily workflow habits for high throughput.

No single source covers the full picture. Boris does not talk about test design. Heidenstedt does not talk about Claude Code-specific configuration. YK Dojo does not talk about team workflows. You need all three.

## Boris Cherny: Tool Configuration

Boris's setup is what he calls "surprisingly vanilla." The tool works well out of the box, and his optimizations are focused rather than extensive.

### Massive Parallelism

Boris runs 5 terminal sessions and 5-10 web sessions simultaneously. He uses `&` to hand off long-running tasks to the web UI and `--teleport` to move conversations between terminal and web. This is not about multitasking for its own sake -- it is about keeping work moving while waiting for one session to finish a large task.

### Living CLAUDE.md

Every time Claude makes a mistake, Boris adds a rule to `CLAUDE.md`. His team contributes to this file multiple times per week. The file is not a static document written once -- it is a growing set of guardrails shaped by real errors. This turns repeated mistakes into impossible mistakes.

### Plan Then Auto-Accept

The workflow is: enter plan mode (Shift+Tab twice), iterate on the plan until it is right, then switch to auto-accept for one-shot execution. This separates the thinking phase from the doing phase. You invest time getting the plan right, then let Claude execute without interruption.

### PostToolUse Hook

Boris auto-formats code after every Write or Edit operation using a PostToolUse hook:

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

The `|| true` ensures the hook does not block if formatting fails. This eliminates an entire class of back-and-forth where you ask Claude to fix formatting issues.

### Verification Is Number One

Boris's most emphatic point: "Give Claude a way to verify its work." This could be running tests, checking output in the browser, or validating against a spec. He claims a 2-3x quality improvement when verification is built into the workflow. Without it, Claude generates plausible-looking code that may or may not work.

### Permissions Allow-List

Instead of running Claude Code with skip-permissions (which allows everything), Boris pre-allows specific safe commands via `/permissions`. This provides security without the friction of approving every file read.

### Slack MCP

Boris checks in `.mcp.json` to the repo so Claude can query Slack for team context:

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

## Heidenstedt: Process Discipline

Heidenstedt's core thesis is a sentence I now think about daily: "Every decision in your project that you don't take and document will be taken for you by the AI."

### AI Cheats on Tests

This is the most important insight in her entire post. When you let AI write both the implementation and the tests, it will write mocks, stubs, and hardcoded values that make the tests pass while the code is broken. The tests become theater -- green checkmarks that verify nothing.

Her solution: write property-based tests yourself. Design tests that exercise real behavior, not tests that pass by construction. If you must let AI write tests, do it in a separate session so the test-writing AI cannot "learn" the implementation's bugs and work around them.

### Context Isolation

Write tests in a separate session from the implementation. This prevents the AI from seeing the implementation details and writing tests that are coupled to bugs rather than requirements. The test session should receive only the interface specification, not the source code.

### HIGH-RISK Markers

Heidenstedt uses `//HIGH-RISK-UNREVIEWED` and `//HIGH-RISK-REVIEWED` comments in code that handles sensitive operations. If AI modifies a reviewed section, the marker resets to `UNREVIEWED`. This creates an audit trail for code that could cause real damage -- payment processing, data deletion, authentication.

### Reduce Complexity

Every line of code consumes context window space. Simpler code means more room for Claude to reason about the problem. Heidenstedt treats code simplification as a direct input to AI output quality, not an aesthetic preference.

### Prototype Cheaply

AI-generated code is cheap to produce and cheap to throw away. Instead of committing to the first approach, explore 2-3 alternatives before deciding. This is faster than debugging a bad first choice.

## How Boris and Heidenstedt Complement Each Other

At first glance, these two seem to disagree. Boris says use Opus and steer less. Heidenstedt says control everything and trust nothing. In practice, they work at different levels:

| Aspect    | Boris (Tool)               | Heidenstedt (Process)   |
| --------- | -------------------------- | ----------------------- |
| Focus     | Configure Claude Code      | Work with any AI coder  |
| CLAUDE.md | Team sharing, live updates | Content strategy        |
| Testing   | Verify via browser/CLI     | AI-proof test design    |
| Quality   | PostToolUse hooks          | Review markers          |
| Workflow  | Plan + auto-accept         | Prototype + incremental |
| Security  | Permissions allow-list     | HIGH-RISK markers       |

Boris gives Claude the right constraints so it produces better output. Heidenstedt designs the workflow so that bad output gets caught. You need both: constraints on the input side and verification on the output side.

## YK Dojo: Practitioner Workflows

YK Dojo brings the perspective of a power user with thousands of sessions. Where Boris and Heidenstedt provide frameworks, YK Dojo provides daily habits.

### Voice Input

Local transcription for faster communication with Claude. This works even on planes with earphones. For long prompts, speaking is faster than typing and produces more natural instructions.

### Context Freshness

YK Dojo's metaphor: "AI context is like milk." It spoils. Start a fresh session for each new topic rather than continuing a stale conversation where the context window is filled with irrelevant earlier work. When you do need to carry context forward, write handoff documents that summarize the essential state.

### Cascade Multitasking

Open a new tab on the right side of the screen, work left to right, and keep a maximum of 3-4 concurrent tasks. This prevents the cognitive overload of too many sessions while still allowing parallel progress on independent work items.

### Automation Progression

The most valuable long-term pattern: progress from manual workflows to full automation in stages.

```text
manual → CLAUDE.md rule → skill → script → full automation
```

When you do something manually twice, add it as a `CLAUDE.md` rule. When the rule gets complex, extract it to a skill. When the skill stabilizes, codify it as a script. When the script is reliable, automate it completely. Each step only happens after the previous one proves itself.

### Half-Clone Conversations

When a conversation's context grows too large (YK Dojo triggers at 85% capacity), keep only the later half and start a new session with that subset. This preserves the recent, relevant context while dropping the older material that is no longer contributing to the current task.

## The Three-Layer View

Here is how all three sources map across common workflow concerns:

| Aspect    | Boris (Tool)          | Heidenstedt (Process)   | YK Dojo (Practice)  |
| --------- | --------------------- | ----------------------- | ------------------- |
| Focus     | Configure Claude Code | Work with any AI        | Daily workflow      |
| CLAUDE.md | Team sharing          | Content strategy        | Keep simple, review |
| Testing   | Verify via CLI        | AI-proof design         | Write-test cycle    |
| Quality   | PostToolUse hooks     | Review markers          | Self-check prompts  |
| Workflow  | Plan + auto-accept    | Prototype + incremental | Cascade + voice     |
| Context   | Web UI parallelism    | N/A                     | Fresh + handoff     |

## Where to Start

If you are adopting these patterns, do not try everything at once. Here is the order I recommend based on impact per effort:

**Week 1: Boris's foundations.** Set up a `CLAUDE.md` file and add rules when Claude makes mistakes. Configure the PostToolUse formatting hook. Start using plan mode before auto-accept.

**Week 2: Heidenstedt's discipline.** Start writing your own tests instead of letting Claude generate them. Add HIGH-RISK markers to sensitive code. Practice the prototype-then-commit workflow.

**Week 3: YK Dojo's efficiency.** Experiment with cascade multitasking (2-3 sessions). Try voice input for long prompts. Implement context freshness -- new session per topic with handoff docs.

**Ongoing:** Let the automation progression happen naturally. When you catch yourself doing something for the third time, encode it in CLAUDE.md. When the rule gets complex, make it a skill.

## Takeaway

Claude Code expert workflows operate on three layers: tool configuration (Boris), process discipline (Heidenstedt), and daily practice (YK Dojo). The perceived contradiction between "steer less" and "control everything" dissolves when you see that they target different layers. Boris configures the tool so it needs less steering. Heidenstedt designs the process so bad output gets caught. YK Dojo optimizes the daily workflow so you produce more in less time.

The single highest-impact change from each source: make `CLAUDE.md` a living document (Boris), write your own tests (Heidenstedt), and treat context like milk -- start fresh per topic (YK Dojo).
