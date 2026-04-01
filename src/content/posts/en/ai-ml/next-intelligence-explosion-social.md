---
title: "The Next Intelligence Explosion Is Social, Not Computational"
description: >-
  A Google paper argues every major intelligence explosion emerged from social
  organization, not individual cognition — and AI will follow the same pattern.
date: 2026-03-30T00:00:00.000Z
updated: 2026-04-01
tags:
  - ai-ml
  - ai-agents
  - research
  - society
category: ai-ml
draft: false
lang: en
expanded: true
references:
  - url: "https://arxiv.org/abs/2603.20639"
    title: "Agentic AI and the next intelligence explosion (Evans, Bratton, Agüera y Arcas)"
    type: authoritative
---

The singularity narrative has a clean arc: make one mind smarter, repeat until it rewrites reality. A new paper from Google's Paradigms of Intelligence team — James Evans, Benjamin Bratton, and Blaise Agüera y Arcas — challenges that story head-on. Their argument: every major intelligence explosion in history emerged not from upgrading individual cognitive hardware, but from new forms of social organization. AI will be no different.

The paper is called "Agentic AI and the next intelligence explosion," and reading it shifted how I think about what we're actually building when we build AI systems.

---

## What the Paper Argues

The core thesis is historical. Primate social groups, human language, writing, institutions — each of these was an intelligence explosion. None of them worked by making a single brain faster. They worked by creating new ways for many minds to coordinate, specialize, and build on each other's work.

The authors argue the current AI moment follows the same pattern. The next explosion won't look like one colossal superintelligence. It will look like a sprawling, specialized city — many agents with different capabilities, organized through protocols and institutions, producing collective intelligence that no individual agent could match.

## Reasoning Models Already Think Socially

This is the part that surprised me most. DeepSeek-R1 and QwQ-32B don't just "think longer" — they spontaneously generate internal debates between distinct cognitive perspectives. One part proposes a solution, another part pushes back, a third reconciles. A "society of thought" that nobody explicitly trained for.

When you optimize for reasoning accuracy, social cognition emerges on its own. The model doesn't get smarter by thinking harder in one voice. It gets smarter by simulating a room of people arguing. That's not a metaphor for what's happening — it's a description of what the attention patterns actually do.

This challenges the assumption that reasoning is fundamentally individual. If the most capable reasoning models achieve their results through internal social dynamics, then social organization isn't just how we *deploy* intelligence — it's how intelligence *works*.

## Centaurs, Not Oracles

The path forward isn't building one AI brain that answers all questions. It's composing hybrid human-AI systems — what the paper calls "centaur actors."

The chess world figured this out years ago. After Deep Blue beat Kasparov, the most interesting development wasn't stronger chess engines — it was centaur chess, where human-AI teams consistently outperformed both humans and engines playing alone. The human provided strategic intuition and creativity; the engine provided calculation depth.

The paper extends this to AI agents:

| Model | Structure | Strength | Weakness |
| --- | --- | --- | --- |
| **Oracle** | One AI answers questions | Simple interface | Bottlenecked by single model's limits |
| **Centaur** | Human + AI collaborate | Combines complementary strengths | Requires good collaboration design |
| **Multi-centaur** | Many humans + many AIs | Scales collective intelligence | Requires institutional coordination |

The key configurations: one human directing many agents, one AI serving many humans, or many of each collaborating in shifting arrangements. The bottleneck is never the individual intelligence — it's the quality of the collaboration protocol.

## Agent Institutions, Not Just Alignment

This is where the paper gets genuinely provocative. RLHF — the dominant approach to making AI behave well — is fundamentally a parent-child model. One authority (the human labeler) shapes one agent's behavior through reward signals. The authors argue this cannot scale to billions of agents interacting with each other and with humans.

Their alternative: institutional alignment. Instead of training each agent to be individually virtuous, build the courtrooms, markets, and governance protocols that make the system work even when individual agents aren't perfect.

Think about how human societies handle this. We don't rely on every person being individually aligned with the common good. We build institutions — legal systems, markets, democratic processes — where roles and norms constrain behavior and channel self-interest toward collective outcomes. The paper argues AI needs the same thing.

This is a fundamental shift from alignment-as-training to alignment-as-governance. And it implies that the most important AI safety work might not be happening in model labs — it might need to happen in organizational design, protocol engineering, and mechanism design.

## The Harness Design Connection

Reading this paper, I kept connecting it to something I see at the practitioner level. More and more people building with AI are talking about the importance of harness design — how you structure the collaboration between human and AI, how you configure the tools, how you design the feedback loops.

The paper is making the same argument at an institutional scale. The intelligence of the system isn't determined by how smart any single agent is. It's determined by how the collaboration is structured. Configuration files, prompt architectures, tool permissions, review protocols — these are the constitutional infrastructure of human-AI systems.

As Claude put it when I was working through this paper:

> "The real AI infrastructure challenge isn't compute — it's constitutional design."

Hard to argue with that.

---

The singularity story asks: how do we build a god? This paper asks a different question: how do we build a civilization? If the authors are right, the engineers who matter most in the next decade won't be the ones training the largest models. They'll be the ones designing the best institutions for human-AI collaboration.

Paper: [Agentic AI and the next intelligence explosion](https://arxiv.org/abs/2603.20639) — Evans, Bratton, Agüera y Arcas (2026)
