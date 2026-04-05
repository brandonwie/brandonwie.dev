---
title: 'Phase A→B Classifier Deployment: Zero-Shot to Fine-Tuned'
description: >-
  How to ship a working intent classifier on day one with zero labeled data, then
  graduate to a domain-specific model as you collect examples.
date: 2026-03-26T00:00:00.000Z
updated: "2026-04-06"
tags:
  - ai-ml
  - nlp
  - intent-classification
  - distilbert
  - bart
  - model-selection
category: ai-ml
draft: false
lang: en
expanded: true
references:
  - url: 'https://huggingface.co/distilbert-base-uncased'
    title: DistilBERT model card
    type: official
  - url: 'https://huggingface.co/facebook/bart-large-mnli'
    title: BART-MNLI zero-shot classification model
    type: official
source_content_hash: e65cd0502aaf9a5054ef40bab6380433ce790308afc9302ae8a60cf0831f80e2
---

When building an intent classifier for a new domain, you have no labeled data on day one. How do you ship a working classifier immediately while building toward a domain-specific model? The answer is a two-phase deployment pattern that the industry has converged on.

## The Cold Start Problem

You need to classify user queries into intents — SUMMARIZE, EXTRACT, REASON, SEARCH_ONLY — but you have no training data. Collecting and labeling 500+ examples per category takes weeks. Meanwhile, users need the feature now.

This is the classic ML cold start: you need a model to serve users, but you need user data to train a model. The two-phase approach breaks this chicken-and-egg cycle.

## Phase A: Zero-Shot with BART-MNLI

Start with BART-MNLI (~400MB), a zero-shot classification model that requires no training data. It frames classification as natural language inference: "Does this text entail 'this is a summarization request'?" This NLI framing works with any label set — you define intents as plain English descriptions, not numeric classes.

Phase A ships immediately. Accuracy is good (~85%) but not domain-specific. The real value is that it starts collecting labeled data through user corrections and feedback. Every time a user corrects a misclassification, you get a free training example.

## Phase B: Fine-Tuned DistilBERT

After collecting ~500+ labeled examples per category (via user corrections, golden set curation, and augmentation), fine-tune DistilBERT (~250MB). It is 4x faster at inference (~12ms vs ~50ms), 40% smaller, and achieves higher domain-specific accuracy (~95% vs ~85%).

The transition pipeline looks like this:

```text
collect labeled data (corrections, golden sets)
  → augment (templates, synonyms) to reach 500+/class
  → fine-tune DistilBERT with HF Trainer + early stopping
  → assess against golden set (accuracy >= 0.90, f1 >= 0.88)
  → shadow comparison (run both models, compare metrics)
  → manual promotion (Staging → Production in MLflow)
```

## Model Comparison

| Dimension            | BART-MNLI (Phase A)      | DistilBERT (Phase B) |
| -------------------- | ------------------------ | -------------------- |
| Model size           | ~400MB                   | ~250MB               |
| Inference speed      | ~50ms/sample             | ~12ms/sample         |
| Training data needed | 0                        | 500+ per class       |
| Accuracy (domain)    | Good (~85%)              | Better (~95%)        |
| Flexibility          | Any labels               | Fixed label set      |
| Architecture         | 12-layer encoder-decoder | 6-layer encoder      |

## Why This Pattern Is Industry Standard

This two-phase approach is not novel. Google uses it (start generic, collect data, specialize), Spotify applies it to content tagging (zero-shot → fine-tuned), and most enterprise ML teams follow the same progression. The pattern works because it decouples shipping from data collection — you deliver value immediately while building toward a better model in parallel.

## When to Use This Pattern

- New classification tasks where labeled data does not exist yet
- Products where user corrections provide a continuous labeling signal
- Resource-constrained environments (NAS, edge) where model size matters after the transition

## When Not To

- If you already have abundant labeled data — skip Phase A entirely
- If categories change frequently — zero-shot's flexibility may be a permanent advantage over fine-tuning
- If the classification task is too nuanced for NLI framing (e.g., subtle sentiment distinctions)

## Key Takeaway

Do not wait for perfect data to ship a classifier. Start with zero-shot (BART-MNLI), collect data through user interactions, and graduate to a fine-tuned model (DistilBERT) when you have enough examples. The two-phase pattern lets you ship on day one and improve continuously.
