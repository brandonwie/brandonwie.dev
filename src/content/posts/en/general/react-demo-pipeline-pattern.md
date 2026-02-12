---
title: React Demo Pipeline Pattern
description: >-
  Pattern for building a fully functional demo mode in a React dashboard when
  the
date: 2026-02-04T00:00:00.000Z
updated: 2026-02-04T00:00:00.000Z
tags:
  - general
  - react
  - demo-mode
  - frontend
  - pipeline
category: general
draft: false
lang: en
references:
  - url: null
    title: Crucio demo-only dashboard implementation
    type: experience
  - url: "https://react.dev/reference/react/useContext"
    title: React useContext API Reference
    type: official
  - url: "https://react.dev/learn/reusing-logic-with-custom-hooks"
    title: React Custom Hooks Documentation
    type: official
---

I built a security operations dashboard for my portfolio. The problem was
obvious from day one: portfolio visitors do not have access to my backend
infrastructure. They would land on the page, see a loading spinner, and leave.
The dashboard needed to work without a backend while still feeling real.

The solution was a demo pipeline -- a pattern that auto-detects when the API is
unreachable, switches to demo mode, and simulates the entire data processing
pipeline locally. Users interact with the UI normally. They type input, watch
stages progress, and see metrics update. Everything is simulated, but the
experience is indistinguishable from the real thing.

## Why This Pattern Exists

Portfolio projects have a fundamental tension: they demonstrate backend
integration skills, but visitors cannot access the backend. Static screenshots
are boring. Hardcoded mock data is obvious. The demo pipeline pattern solves
this by making the frontend self-sufficient. It generates realistic data,
responds to user input intelligently, and simulates asynchronous processing
stages with realistic timing.

This pattern works beyond portfolios. Demo environments for stakeholder
presentations, development mode when backend services are down, and conference
demos on unreliable networks all benefit from the same approach.

## The Architecture

The pattern has three layers: a context provider that manages mode detection, a
custom hook that drives the simulation, and widget components that consume the
simulated data.

```text
DataModeProvider (context)
  |- mode: 'live' | 'demo'
  |- auto-detect: poll /api/v1/health
  +- manual toggle in TopNav

useDemoPipeline (hook)
  |- analyzeInput(text) -> scenario selection
  |- startPipeline(text) -> staged setTimeout
  |- pipelineState -> stage status map
  +- events[] -> real-time event stream

DashboardPage
  |- PipelineWidget (shows stage progression)
  |- EventStreamWidget (scrolling log)
  |- MetricsWidget (Recharts time-series)
  |- IntentDistWidget (bar chart)
  |- SecurityWidget (pass rates)
  +- SystemHealthWidget (gauges)
```

The `DataModeProvider` wraps the entire app. It polls `/api/v1/health` on mount
and every 30 seconds. If the API is unreachable, it automatically switches to
demo mode. A manual toggle in the top navigation lets users override this
behavior.

## Smart Input Matching

The most important part of making a demo feel real is responding to user input
intelligently. Random responses feel fake. The `analyzeInput` function examines
what the user typed and selects an appropriate scenario:

```typescript
function analyzeInput(text: string): DemoScenario {
  const lower = text.toLowerCase();

  // Check for PII patterns
  if (
    /\b\d{3}-\d{2}-\d{4}\b/.test(text) ||
    /\b[A-Z][a-z]+ [A-Z][a-z]+\b/.test(text)
  ) {
    return scenarios["pii-detected"];
  }

  // Check for injection attempts
  if (lower.includes("ignore") && lower.includes("instruction")) {
    return scenarios["injection-blocked"];
  }

  // Check for URLs
  if (/https?:\/\//.test(text)) {
    return scenarios["link-extraction"];
  }

  // Long/complex text
  if (text.length > 200 || text.includes("analyze")) {
    return scenarios["full-pipeline"];
  }

  return scenarios["simple-note"];
}
```

Type a Social Security number pattern and the dashboard flags PII. Paste
something that looks like a prompt injection and it gets blocked. Drop a URL and
the link extraction stage activates. The user feels like the system is actually
processing their input because it responds to the content, not just the fact
that something was submitted.

## Staged Pipeline Simulation

Real backend processing does not happen all at once. It progresses through
stages with variable timing. The simulation mirrors this with nested
`setTimeout` calls:

```typescript
function startPipeline(text: string) {
  const scenario = analyzeInput(text);

  scenario.stages.forEach((stage) => {
    setTimeout(() => {
      updateStage(stage.name, "processing");

      setTimeout(() => {
        updateStage(stage.name, stage.result);
        emitEvent(stage.event);
      }, stage.duration);
    }, stage.startDelay);
  });
}
```

Each scenario defines its own stages with start delays and durations. The
"processing" state appears first (showing a spinner or progress indicator), then
the final result appears after the stage duration. Events emit in real time to
the event stream widget, creating a scrolling log that looks like live
processing output.

## Data Generators

Beyond the pipeline, the dashboard needs live-updating metrics. Factory
functions generate randomized but realistic mock data:

- **Metrics** -- time-series data with slight random variations that refresh
  every 10 seconds
- **Events** -- the scrolling event stream fed by pipeline stage completions
- **Health stats** -- system gauges that fluctuate within realistic ranges
- **Security stats** -- pass/fail rates that trend realistically over time

The 10-second refresh interval makes the dashboard feel alive without
overwhelming the user with constant changes.

## Key Design Decisions

| Decision                              | Rationale                                    |
| ------------------------------------- | -------------------------------------------- |
| Auto-detect over manual-only          | Portfolio visitors see demo automatically    |
| Smart matching over random            | User input feels like it's being "processed" |
| setTimeout over requestAnimationFrame | Simulates server latency realistically       |
| Periodic data refresh (10s)           | Dashboard feels alive without overwhelming   |

## Why This Works

The pattern succeeds because it removes the "it only works on my machine"
problem that plagues portfolio projects. Visitors experience the full UI without
needing infrastructure access. Smart input matching creates the illusion of real
processing. Staged timing with variable delays mimics actual backend behavior.
And auto-detection means the transition between live and demo modes is seamless
-- no manual setup required.

## Practical Takeaway

Use this pattern when you need a frontend that works independently of its
backend. The three key ingredients are: auto-detection (poll a health endpoint),
smart input matching (respond to content, not just events), and staged simulation
(variable timing, not instant responses).

The pattern fits portfolio projects, demo environments for stakeholder
presentations, development mode when backend services are down, and trade shows
or conference demos on unreliable networks.

Skip this pattern if your backend is always available and your users never need
to interact with the frontend in isolation. The simulation adds complexity, and
maintaining parity between demo scenarios and real backend behavior requires
ongoing effort.
