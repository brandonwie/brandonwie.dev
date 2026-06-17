---
title: 'Hybrid CI: Self-Hosted Jenkins + GitHub Actions'
description: >-
  Why use one CI system when you can use both? A split architecture that plays to
  each tool's strengths for polyglot portfolio projects.
date: 2026-03-26T00:00:00.000Z
updated: "2026-04-06"
tags:
  - devops
  - ci-cd
  - jenkins
  - github-actions
  - architecture-decision
category: devops
draft: false
lang: en
expanded: true
references:
  - url: 'https://www.jenkins.io/doc/book/pipeline/syntax/'
    title: Jenkins Pipeline Syntax
    type: official
  - url: 'https://docs.github.com/en/actions/writing-workflows'
    title: GitHub Actions Workflow Syntax
    type: official
source_content_hash: 992cbdea640004306cb6d1b7a8a0a7f9ae7631cae9619949c247f341e3d2252a
---

For a portfolio project with polyglot services — Python, Go, Rust, and TypeScript — which CI system should you use? The naive answer is "pick one." The better answer is: use both, each for what it was designed for.

## The Split Principle

Every tool has a sweet spot. GitHub Actions excels at lightweight, fast PR gates that run in hosted environments. Jenkins excels at compute-heavy jobs where you control the hardware. Forcing either tool to do the other's job creates friction.

Here is how the split works:

**Jenkins (self-hosted on NAS):** Integration tests with testcontainers, Docker image builds, WASM compilation, security scanning, and ML pipeline triggers. Free compute, no minute limits, and full hardware access.

**GitHub Actions (hosted):** Lint, typecheck, lock file checks, and Cloud Run deployments. Workload Identity Federation and OIDC for GCP require GitHub Actions' native integration. These jobs finish in under 2 minutes and are free for public repositories.

## Decision Matrix

| Dimension          | Jenkins (NAS)              | GitHub Actions                       |
| ------------------ | -------------------------- | ------------------------------------ |
| Compute            | Unlimited (NAS CPU)        | 6h job limit, minute quotas          |
| Docker             | Native DinD                | Requires setup-docker action         |
| Cost               | $0 (NAS hardware)          | Free for public, minutes for private |
| Integration tests  | testcontainers, real Kafka | Slow service containers              |
| Cloud deploy       | Manual SSH/compose         | Native WIF/OIDC for GCP              |
| Operational burden | Must maintain server       | Zero ops                             |

## Why This Matters for Portfolio Projects

The hybrid approach demonstrates something important for engineering interviews: **tool selection judgment**, not just tool proficiency. Saying "I chose Jenkins for heavy compute because it runs on my NAS with no minute limits, and GitHub Actions for PR gates because OIDC integration with GCP is native" is a Staff+ engineering signal.

Jenkins on a NAS also demonstrates self-hosted CI operations — server maintenance, plugin management, pipeline-as-code — something you cannot demonstrate with GitHub Actions alone. For a portfolio project, this breadth of experience is the point.

## When This Architecture Makes Sense

- Portfolio projects where you want to demonstrate both managed and self-hosted CI experience
- When you already use one CI tool daily at work (GitHub Actions) and want to fill the experience gap (Jenkins)
- Polyglot repositories where compute-heavy tests would exhaust GitHub Actions minutes

## When It Does Not

- If you genuinely only need lint and deploy — GitHub Actions alone is sufficient
- If your NAS has limited RAM (Jenkins controller needs 200-512MB)
- Work projects where the team standardizes on one tool — do not split for the sake of splitting

## Key Takeaway

CI tool selection is an architecture decision. The right answer is rarely "pick the most popular one." Match the tool to the workload: hosted runners for fast, lightweight gates; self-hosted for compute-heavy, long-running jobs. A hybrid setup costs more operational overhead but demonstrates broader engineering judgment.
