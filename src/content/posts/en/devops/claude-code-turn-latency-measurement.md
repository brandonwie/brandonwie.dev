---
title: Measuring Claude Code Turn Latency from JSONL Transcripts
description: >-
  Ground-truth, retroactive per-turn latency for Claude Code sessions — parsed
  from the JSONL transcripts already on disk, with four measurement traps
  I had to self-correct.
date: 2026-04-08T00:00:00.000Z
updated: 2026-04-14T00:00:00.000Z
tags:
  - claude-code
  - latency
  - measurement
  - debugging
  - jsonl
  - transcripts
  - devops
category: devops
draft: false
lang: en
expanded: true
source_content_hash: 82749304bdc27bde1bdda840f6385eb64c858abb99e21154e2e9af41051bde4c
references:
  - url: 'https://docs.python.org/3/library/sqlite3.html'
    title: Python sqlite3 — DB-API 2.0 interface
    type: official
  - url: 'https://docs.python.org/3/library/argparse.html'
    title: Python argparse — command-line parsing
    type: official
  - url: >-
      https://docs.python.org/3/library/datetime.html#datetime.datetime.fromisoformat
    title: datetime.fromisoformat — handles ISO-8601 with Z suffix in Python 3.11+
    type: official
---

A reported 5x slowdown in Claude Code sessions after a recent release needed verification before I touched any config. Perception is unreliable — users remember painful cases more than routine ones, and reported magnitudes can be off by 2x in either direction. I needed an objective number before deciding what to investigate.

The good news: Claude Code already writes full session transcripts to `~/.claude/projects/{project_slug}/*.jsonl`, one line per message, each carrying a millisecond-precision `timestamp` field. Every past session is measurable from ground truth — no new instrumentation required. The data is already on disk.

The bad news: the JSONL format has quirks that caught me four separate times across two measurement efforts. Two were analysis errors I had to self-correct; two were contamination traps — one from a parallel session writing the same config, another from the measurement targets being silently disabled during the tracking window. This post covers the approach, all four traps, the reference output from the baseline I took, and why I chose retroactive transcript parsing over the other options.

## Why after-the-fact measurement is the right tool here

Three things make this kind of investigation hard, and they combine into a specific constraint:

1. **Instrumenting after the fact will not help.** By the time a slowdown is reported, the sessions you want to measure have already happened. Adding a timing probe today only captures post-probe data, which cannot be compared against the pre-slowdown baseline you actually care about.
2. **Perception bias is real and cuts both ways.** A user's reported magnitude of a slowdown might be 2x off in either direction. You need an objective number to reconcile.
3. **Claude Code's own logging is opaque.** There is no built-in "show me P90 latency for last week" flag. You have to dig the data out of somewhere.

What rescues this situation is the JSONL transcripts. They are plain-text, append-only, one-line-per-message logs of every session, written automatically by Claude Code to `~/.claude/projects/{slug}/`. Each line is a JSON object with a `timestamp` field accurate to the millisecond. That means a measurement tool can walk the transcripts retroactively and produce a per-turn latency distribution for any historical period — as long as the tool knows how to handle the quirks.

## Four traps I walked into

I built a first version of the tool on intuition and it produced confidently wrong numbers twice in a row. A third trap came from experimental contamination, and a fourth surfaced during a follow-up instrumentation effort months later. All four are worth naming because each one made the measurement look like it was working while quietly lying about the answer.

### Trap 1 — Grep-based tool-invocation counting

**What went wrong.** I wanted to count how many times a specific tool (`storm.py`) was invoked in each session, so I ran `grep -c 'storm.py' session.jsonl`. It returned 111 for one session — a damning number that would have confirmed my initial hypothesis that storm was the slowdown contributor.

**Why it was wrong.** Claude Code transcripts contain both tool invocations *and* the text of every file Claude reads, every documentation quote, every ADR body, and every buffer entry the session touches. When Claude reads a README that mentions `storm.py`, that README text lands in the transcript. Grep cannot distinguish "Claude ran this command" from "Claude read a file that mentioned this command in prose".

**How to do it right.** Parse the JSONL structurally and count only `tool_use` blocks where the input matches:

```python
for msg in iter_messages(jsonl_path):
    if msg.get("type") != "assistant":
        continue
    for block in (msg.get("message", {}).get("content") or []):
        if not isinstance(block, dict):
            continue
        if block.get("type") == "tool_use" and block.get("name") == "Bash":
            cmd = (block.get("input") or {}).get("command", "")
            if "storm.py" in cmd:
                # Actual invocation
                ...
```

The corrected count for the "111-call" session was 14. Grep had been inflating the number by an 8x factor — reading into the investigation as if storm was running constantly when it was actually running at a reasonable cadence.

### Trap 2 — `role: "user"` is overloaded in Claude Code JSONL

**What went wrong.** With the tool-counting fixed, I moved on to the actual latency measurement. I built a state machine that walked the JSONL, treated every `role: "user"` message as a turn-start, and measured the delta to the next `role: "assistant"` message. The resulting "turn count" per session was ~4x higher than the number of actual user messages, and the slowest "turns" had impossibly-long latencies (120+ seconds) with zero user text.

**Why it was wrong.** Claude Code encodes two different things as `role: "user"`:

- **(a)** Genuine human input — typed messages from the user.
- **(b)** Tool results being delivered back to the model — when a Bash or Read tool finishes, its output is wrapped in a `role: "user"` message containing `tool_result` blocks.

Counting (b) as "turn starts" makes tool-cycle time look like user-perceived latency. A 120-second "turn" might actually be a Read returning a huge file followed by Claude's next thinking step — which the user experiences as part of *one* continuous response, not a separate turn.

**How to do it right.** Filter user messages to only those with non-empty text content:

```python
def is_real_user_input(msg: dict) -> bool:
    content = message_content(msg)
    for block in content:
        if not isinstance(block, dict):
            continue
        if block.get("type") == "text" and block.get("text", "").strip():
            return True
    return False
```

After filtering, the turn count for one session dropped from 733 to 65, and the median latency jumped from 4.93s (the unfiltered measurement, diluted by fast tool cycles) to 16.80s (the real user-perceived latency). The qualitative story *inverted* — from "tail-only blow-up" to "uniform slowdown with tail amplification". This is the moment that taught me to always ship diagnostic columns alongside summary stats: the `u_chars=0` per-turn diagnostic was the only signal that led me to Trap 2 at all.

### Trap 3 — Parallel-session experimental contamination

**What went wrong.** While the measurement was running in one Claude Code session, a parallel session of mine applied one of the exact fixes I had just flagged as "do NOT apply before Phase 2". Between my baseline capture and my commit, two parallel commits landed: a hooks fix and a storm refactor. The storm refactor removed the sections I was investigating as potential slowdown contributors.

**Why it happened.** Claude Code sessions do not coordinate writes to shared config. Two sessions in the same repo can independently decide to make the same change. "Do not touch X until Y" is a social rule, not a technical one, and it is easily violated by parallel actors.

**How to do it right.** Capture a **baseline commit hash** alongside your baseline numbers. Record it in the investigation docs. Then Phase 2 can run:

```bash
git log {baseline_hash}..HEAD --oneline -- .claude/ path/to/project/
```

to see every change that landed between baseline and re-measurement. The experiment may still be partially contaminated, but the contamination becomes detectable and attributable instead of invisible.

### Trap 4 — Silent source-disable contamination

**What went wrong.** A second instrumentation effort — tracking per-plugin and per-MCP-server invocation counts — added four `PostToolUse` / `UserPromptSubmit` hooks to log usage data. The hooks shipped and began firing. Four days later the tracking data looked suspiciously sparse: one plugin skill event, eight MCP server events, nothing else. The natural interpretation was "plugins are idle, proceed to prune."

**Why it was wrong.** Claude Code has two profile configs (`~/.claude` and `~/.claude-work`) that share a `settings.json` via symlink, and the `enabledPlugins` map on disk can drift from the running state when the UI writes its own atomic-rename copies. On the day the hooks shipped, three plugins were enabled in the local runtime state but `false` in the canonical `settings.json`. A drift-repair session the next day detected the conflicts and flipped the canonical entries to `true`. The instrumented plugins were effectively off in the canonical config for the first day of the tracking window, even though the local runtime reflected them as enabled. Any "measurement" of those plugins during that first day was pointed at targets that were not really running under the canonical config — the window looked uncontaminated because the hooks themselves kept firing and writing their JSON files, just with nothing to count.

This is distinct from Trap 3 (parallel-session contamination). Trap 3 is about two actors racing on shared state. Trap 4 is about one actor measuring a target whose state is determined by a config that changed underneath the measurement. Both produce data that looks valid until you cross-reference the config change history.

**How to do it right.** Before trusting any instrumentation data, verify the target's config state across the full measurement window:

```bash
# Find config changes that could have affected the measured target
# during the tracking window
git log --since="2026-04-08" --until="2026-04-12" \
  -- .claude/global-claude-setup/settings.json

# Cross-reference against when the tracking JSON files were first written
stat -f "%Sm" ~/.claude/plugin-usage.json ~/.claude/mcp-usage.json
```

If a config change affected the target mid-window, treat the window as starting from the config change, not from the instrumentation start. In this case, the real measurement window started on 2026-04-09 (after the drift repair), not 2026-04-08 — which reduced "4 days of sparse data" to "3 days of clean data" and changed the conclusion from "prune aggressively" to "extend tracking by 1 week for a cleaner signal."

The durable fix is a pre-flight check at the start of any instrumentation project: capture a snapshot of every config variable that could affect what gets measured, compare against that snapshot during analysis, and annotate the tracking data with "window starts after config change X." This turns an invisible failure mode into an explicit precondition.

## The tool

With the traps understood, the tool itself is a ~400-line pure-stdlib Python script that does this:

1. Scans `~/.claude/projects/{slug}/*.jsonl`.
2. Walks each file with a state machine that treats *user text* messages as turn-starts — not tool results.
3. Measures the delta to the first assistant reply (user-perceived "first byte" latency).
4. Filters out gaps > 600s, which are the user walking away rather than the tool hanging.
5. Splits sessions by a cutoff date and computes P50, P90, P99, mean, and max per era.
6. An optional `--slow` flag dumps per-turn diagnostic columns (`u_chars`, `a_chars`, tool counts) for any turn above a threshold.

The design choices are worth calling out because each one was driven by something specific that happened during the build:

| Choice                           | Rationale                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------- |
| User → **first** assistant reply | Measures user-perceived first-byte latency, not total task completion time     |
| 600s idle filter                 | Gaps longer than 10 minutes are the user walking away, not latency             |
| Era split by file mtime          | Coarse but simple — most sessions last under 24h so they are rarely miscategorized |
| Diagnostic columns always on     | They are how you catch your own state machine bugs — see Trap 2                |
| Pure stdlib (no pip)             | Durability — the tool should work on any machine with Python, no dependency rot |

The "pure stdlib" choice deserves a specific defense: measurement tools are the last thing you want to discover are broken because of a six-month-old dependency version conflict. Using only `sqlite3`, `argparse`, `datetime`, and `json` means the script runs on any Python 3.11+ install forever.

## Reference output

Here is what the corrected measurement looked like for a baseline I took on 2026-04-08, for a personal Claude Code-heavy project:

```text
=== Corrected measurement, n=30 sessions ===
session    mtime            era    turns       p50       p90       p99
c7b43606   04-08 14:57      POST     14     27.76s    74.93s   119.23s
5e441a50   04-08 10:01      POST     22     34.65s    98.35s   111.24s
71e328b7   04-08 16:13      POST      9      7.97s    39.32s    39.32s
ab982012   04-07 19:33      PRE       4      8.34s    46.01s    46.01s
82a4ffec   04-07 00:39      PRE      25      6.31s    18.95s    22.00s
...

Aggregated pre/post cutoff (2026-04-08 09:28):
  PRE   n= 251  mean= 11.94s  p50=  8.34s  p90= 22.52s  p99=  48.47s
  POST  n=  65  mean= 30.58s  p50= 16.80s  p90= 90.55s  p99= 119.23s

  p50    8.34s →  16.80s   2.01x
  p90   22.52s →  90.55s   4.02x
```

The headline number: P50 doubled and P90 quadrupled after the release. That is a real slowdown, not perception. Interestingly, my first-pass analysis — from the *broken* Trap 2 measurement — confidently reported "tail-only blow-up, 2.4x" and I almost posted that conclusion back to the reporter. The corrected measurement (P90 4.02x) was much closer to the reported "5x" and rehabilitated the user's estimate. The lesson: when a clear-headed user report disagrees with your measurement by more than ~2x, suspect the measurement before the perception.

## Options I considered

Before building the tool I evaluated four approaches:

| Option                          | Pros                                              | Cons                                                       |
| ------------------------------- | ------------------------------------------------- | ---------------------------------------------------------- |
| **JSONL transcript parsing**    | No new instrumentation, retroactive, free, stdlib | Only measures what transcripts capture; no server timing   |
| Add timing probe to Claude Code | Highest precision, can capture all layers         | Requires code change, only captures post-probe data        |
| External wall-clock timer       | Simple, language-agnostic                         | Captures total task time not first-byte; needs user to run |
| Anthropic API dashboard         | Server-side authoritative                         | Not exposed for Claude Code users; aggregated only         |

JSONL transcript parsing won because **retroactive measurement was the critical requirement**. The slowdown had already happened. A timing probe added today would have no pre-slowdown baseline to compare against, so it could not answer the question I actually needed to answer. Transcripts are already on disk with millisecond timestamps, so PRE and POST data were both freely available. The only cost was an afternoon of Python (including debugging the two self-caught traps).

The trade-off I accepted: transcript-based measurement cannot separate client-side from server-side latency. If the slowdown turns out to be Anthropic API-side, the tool can confirm "the wall-clock time went up" but cannot prove "the API is slower". That is acceptable for the investigation question being asked ("is there a real slowdown to investigate?") but would not be sufficient for an SLA-grade measurement.

## When to reach for this

This approach is the right tool when:

- A user (or you) reports "Claude Code feels slow" and you need to decide whether it is real before touching any config.
- You want to A/B test a config change (for example, "did trimming MEMORY.md help?") with objective per-turn data.
- You want a periodic latency baseline to detect drift over time.
- A new skill, hook, or MCP server shipped and you want to verify it did not regress anything.
- You are debugging an intermittent slowness complaint and need to know whether to look at tail behavior (P90, P99) or median (P50).

It is *not* the right tool when:

- You need server-side (Anthropic API) latency — transcripts only see round-trip wall time.
- You need token-count-weighted latency — this tool measures wall time only.
- You are measuring a single-turn anomaly, not a population — JSONL timestamps are reliable in aggregate but individual turns can have clock skew or client-side delays.
- You need sub-100ms precision — Claude Code writes millisecond timestamps but any measurement over network is noisy at that granularity.

## Takeaways

- **Diagnostic columns catch your own bugs.** Always include per-turn metadata in measurement tools, even when you only think you need summary stats. The `u_chars=0` diagnostic was the only signal that led me to Trap 2.
- **State the hypothesis first.** Before trusting any summary number, list the assumptions the measurement makes and seek disconfirming evidence. My first-pass analysis confidently reported "tail-only blow-up, 2.4x" — corrected to "uniform 2x + tail 4x" only because the tool's own diagnostic output contradicted the summary numbers.
- **Suspect the measurement before the perception.** When a clear-headed user report disagrees with your measurement by more than ~2x, something is probably wrong in the tool. Trap 2 made this exact error in reverse — the tool undercounted the slowdown because it was counting tool cycles as user turns.
- **Baseline commit hashes are cheap insurance.** Record the commit hash alongside baseline numbers for any before/after measurement. That makes parallel-session contamination detectable instead of invisible.
- **"No data" is not automatically absence.** When instrumentation and the measured thing are both controlled by the same config file, sparse tracking data can mean "measurement was pointed at off targets" rather than "activity was low." Always cross-reference the tracking window's start against the config change history of the measured target — if a relevant flag flipped mid-window, the real window starts at the flip date, not the instrumentation start.
- **Retroactive measurement beats "add a probe" whenever the data already exists on disk.** JSONL transcripts are already there. Parse them, do not instrument around them.

The tool itself is short — ~400 lines — and the whole investigation took an afternoon. The value was not the tool's sophistication. It was the willingness to rebuild the tool twice after self-catching measurement errors, rather than trusting the first plausible number that came out.
