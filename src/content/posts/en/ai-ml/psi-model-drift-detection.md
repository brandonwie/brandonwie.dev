---
title: Population Stability Index (PSI) for Model Drift Detection
description: >-
  How to detect when your deployed classifier's input distribution shifts away
  from training data — before accuracy degrades — using a lightweight statistical metric.
date: 2026-03-26T00:00:00.000Z
updated: "2026-04-06"
tags:
  - ai-ml
  - mlops
  - drift-detection
  - monitoring
  - statistics
category: ai-ml
draft: false
lang: en
expanded: true
references:
  - url: 'https://scholarlycommons.pacific.edu/uop_etds/3617/'
    title: Population Stability Index original paper
    type: authoritative
  - url: 'https://www.listendata.com/2015/05/population-stability-index.html'
    title: PSI explained with examples
    type: tutorial
source_content_hash: 067788a3f80a293214d149ac61f3b317dccb5d3bacbf525a2c2e4615a7f968a9
---

After deploying a classification model, how do you know when the incoming data has shifted away from what the model was trained on? If you wait for accuracy to drop, the damage is already done. You need a leading indicator — something that detects distribution drift before it affects predictions.

## Why PSI

Population Stability Index (PSI) is a statistical metric originally developed for credit scoring at financial institutions like Capital One and Goldman Sachs. It compares two probability distributions — the training distribution and the production distribution — and produces a single number that tells you how much they have diverged.

The formula is straightforward:

```
PSI = SUM((actual_% - expected_%) * ln(actual_% / expected_%))
```

For each category in your classification task, you compare the proportion of requests in production (actual) against the proportion in the training set (expected). The result maps to clear thresholds:

| PSI Value | Interpretation                      | Action                   |
| --------- | ----------------------------------- | ------------------------ |
| &lt; 0.1     | Stable — distributions are aligned  | No action                |
| 0.1 - 0.2 | Moderate shift — worth investigating | Monitor closely          |
| &gt; 0.2     | Significant drift detected          | Retraining recommended   |

## Implementation

PSI works on categorical distributions, which makes it ideal for intent classification. If your model classifies queries into intents like SUMMARIZE, EXTRACT, REASON, SIMPLE_NOTE, and SEARCH_ONLY, PSI compares the distribution of those intents between training and production.

```python
def compute_psi(expected: dict, actual: dict, epsilon: float = 1e-4) -> float:
    psi = 0.0
    for label in set(list(expected) + list(actual)):
        e = expected.get(label, 0.0) + epsilon
        a = actual.get(label, 0.0) + epsilon
        psi += (a - e) * math.log(a / e)
    return psi
```

The epsilon (1e-4) added to both distributions prevents `log(0)` when a category has zero occurrences in either distribution. This is critical — a new intent category appearing in production that did not exist in training would otherwise crash the calculation.

### Running It in Production

Run PSI as a weekly Celery beat task. Query Prometheus for 7-day classification counts using the `guardrails_classification_requests_total` metric by intent, then compare against the training distribution metadata stored at train time.

The beauty of PSI is that it needs only counters — no model inference required. You are comparing distributions of labels, not re-running predictions. This makes it lightweight enough to run on any infrastructure.

## What PSI Can and Cannot Detect

PSI detects **data drift** — when the distribution of incoming data shifts. If your training set had 40% SUMMARIZE queries and production suddenly shows 70% SUMMARIZE, PSI will flag it.

PSI does **not** detect **concept drift** — when the correct labels for the same input distribution change. If users start using "summarize" to mean something different than what the training data captured, PSI will show stable distributions while accuracy degrades. For concept drift, you need direct accuracy monitoring against a continuously updated golden set.

## When to Use PSI

- Any deployed classifier where input distribution may shift over time
- Lightweight monitoring complement to A/B testing
- When you cannot run shadow inference (PSI needs only counters, not predictions)

## When Not To

- Regression models — use the Kolmogorov-Smirnov test or Wasserstein distance instead
- Real-time detection — PSI works on aggregated time windows (7-day, 30-day), not per-request
- When concept drift is the primary concern — PSI cannot help there

## Key Takeaway

PSI gives you a single number that answers "has my model's input distribution changed?" It is cheap to compute, easy to understand, and catches data drift before accuracy drops. Add epsilon to avoid log(0), run it weekly on Prometheus counters, and set alerts at PSI > 0.2.
