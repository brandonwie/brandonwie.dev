---
title: React Demo Pipeline Pattern
description: >-
  Pattern for building a fully functional demo mode in a React dashboard when
  the
date: 2026-02-04T00:00:00.000Z
updated: 2026-03-09T00:00:00.000Z
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
  - url: 'https://react.dev/reference/react/useContext'
    title: React useContext API Reference
    type: official
  - url: 'https://react.dev/learn/reusing-logic-with-custom-hooks'
    title: React Custom Hooks Documentation
    type: official
---

backend is unavailable. Users interact with the UI normally, and all processing
is simulated locally.

## Key Points

- **Auto-detect mode:** Poll `/api/v1/health` on mount and at intervals (30s).
  If API is unreachable, auto-switch to demo mode. Manual toggle in UI for
  override.
- **Smart input matching:** Analyze user input to select the appropriate demo
  scenario (regex for PII patterns, injection keywords, URLs, text length
  thresholds).
- **Staged simulation:** Use `setTimeout` chains to simulate pipeline stages
  with realistic delays. Each stage transition emits events to the event stream.
- **Data generators:** Factory functions produce randomized but realistic mock
  data (metrics, events, health stats, security stats) that refresh
  periodically.

## Architecture

```text
DataModeProvider (context)
  ├── mode: 'live' | 'demo'
  ├── auto-detect: poll /api/v1/health
  └── manual toggle in TopNav

useDemoPipeline (hook)
  ├── analyzeInput(text) → scenario selection
  ├── startPipeline(text) → staged setTimeout
  ├── pipelineState → stage status map
  └── events[] → real-time event stream

DashboardPage
  ├── PipelineWidget (shows stage progression)
  ├── EventStreamWidget (scrolling log)
  ├── MetricsWidget (Recharts time-series)
  ├── IntentDistWidget (bar chart)
  ├── SecurityWidget (pass rates)
  └── SystemHealthWidget (gauges)
```

## Smart Input Matching

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

## Staged Pipeline Simulation

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

## When to Use

- Portfolio projects that need to work without infrastructure
- Demo environments for stakeholder presentations
- Development mode when backend services are down
- Trade shows or conference demos on unreliable networks

## Key Design Decisions

| Decision                              | Rationale                                    |
| ------------------------------------- | -------------------------------------------- |
| Auto-detect over manual-only          | Portfolio visitors see demo automatically    |
| Smart matching over random            | User input feels like it's being "processed" |
| setTimeout over requestAnimationFrame | Simulates server latency realistically       |
| Periodic data refresh (10s)           | Dashboard feels alive without overwhelming   |
