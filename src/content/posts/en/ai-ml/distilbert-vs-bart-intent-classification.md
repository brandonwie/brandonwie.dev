---
title: 'Phase A→B Classifier Deployment: Zero-Shot to Fine-Tuned'
description: >-
  How to ship a working intent classifier on day one with zero labeled data, then
  graduate to a domain-specific model as you collect examples.
date: 2026-03-26T00:00:00.000Z
updated: "2026-04-18"
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
source_content_hash: 2bf0b335c371d23388ffe3583cf1113a119b03e93cf50f35c4382db3b265b263
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

## Production Gotcha: HuggingFace Pipelines Don't Auto-Truncate

A deterministic "classify hangs on link content" bug cost me a meaningful
chunk of debugging time before I traced it to this. Both BART (1024-token
context) and DistilBERT (512-token context) have fixed context windows. The
HuggingFace `transformers` pipeline does _not_ auto-truncate input by default
— it logs a warning and tries to process the oversize input anyway. For
zero-shot-classification, that means N forward passes, each running on
oversize input. A 20KB article (~5000 tokens) can push total latency past
30–60 seconds on CPU versus the ~200ms you'd expect on a normal 100-token
input.

The fix is always passing `truncation=True` and `max_length=<context_window>`
explicitly:

```python
# CORRECT — explicit truncation
_CLASSIFIER_MAX_TOKENS = 1024  # BART; use 512 for DistilBERT

result = self._pipeline(
    text,
    candidate_labels=candidate_labels,
    multi_label=multi_label,
    truncation=True,                     # ← mandatory
    max_length=_CLASSIFIER_MAX_TOKENS,   # ← mandatory
)
```

**Why zero-shot makes this worse.** Zero-shot runs one forward pass per
candidate label. With five labels and oversize input, you pay the slowdown
penalty five times. Single-label classifiers (regression, binary) only pay
it once.

**Why this matters for RAG and content-extraction pipelines.** When
classifier inputs come from scraped or LLM-extracted text — articles, PDFs,
web content — input size is highly variable, from hundreds of tokens to
hundreds of thousands. Assume adversarial size input. Explicit truncation is
defense-in-depth.

**Why the tail usually doesn't matter for intent classification.** Intent
("summarize this", "extract data", "just save this") is typically
determinable from the opening 500–1000 tokens of a document. Losing the tail
is fine for classification. PII scanning and content summarization should
still see the full text — run those separately on the un-truncated input.

**Name the constant model-agnostically.** `_BART_CONTEXT_WINDOW` becomes
misleading the moment you swap to DistilBERT (512). Name it
`_CLASSIFIER_MAX_TOKENS` and let a comment document the current model. The
Phase B swap then only requires updating the value, not every call site.

### A Factual Correction Worth Calling Out

While writing this up, I realized I had been casually describing the Phase
A→B transition as "swapping to a different BART variant". That's wrong.
DistilBERT is an encoder-only BERT distillation (Sanh et al., 2019). BART is
an encoder-decoder seq2seq model (Lewis et al., 2019). They are different
model families. The MNLI zero-shot wrapper works with either architecture
given appropriate fine-tuning, but conflating them in code comments is a
correctness error worth avoiding.

## Key Takeaway

Do not wait for perfect data to ship a classifier. Start with zero-shot (BART-MNLI), collect data through user interactions, and graduate to a fine-tuned model (DistilBERT) when you have enough examples. The two-phase pattern lets you ship on day one and improve continuously.
