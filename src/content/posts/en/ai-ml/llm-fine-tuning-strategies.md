---
title: LLM Fine-Tuning Strategies
description: >-
  A practical decision framework for choosing between prompt engineering, RAG,
  and LoRA fine-tuning when building LLM-powered applications.
date: 2026-03-29T00:00:00.000Z
updated: "2026-04-06"
tags:
  - ai-ml
  - fine-tuning
  - llm
category: ai-ml
draft: false
lang: en
expanded: true
references:
  - url: 'https://arxiv.org/abs/2305.18290'
    title: >-
      Direct Preference Optimization: Your Language Model is Secretly a Reward
      Model
    type: authoritative
  - url: 'https://huggingface.co/docs/peft/conceptual_guides/lora'
    title: 'LoRA: Low-Rank Adaptation of Large Language Models'
    type: official
  - url: 'https://arxiv.org/abs/2306.01708'
    title: 'TIES-Merging: Resolving Interference When Merging Models'
    type: authoritative
  - url: 'https://github.com/arcee-ai/mergekit'
    title: mergekit — Tools for merging pretrained language models
    type: official
source_content_hash: 35a4ee9a4e640af14c2f0742a83900730e6228781db6a3b995569da0e6e79102
---

The instinct when building an LLM-powered feature is to jump straight to fine-tuning. More often than not, that is premature. This post walks through a three-layer progression — from prompt engineering through RAG to LoRA fine-tuning �� and explains when each layer is worth the investment.

## The Three-Layer Architecture

Think of LLM customization as three layers, where each builds on the previous. The rule is: do not jump to Layer 3 until Layers 1 and 2 are exhausted.

**Layer 1 — Prompt Engineering:** Zero-cost, zero-infra. System prompts, few-shot examples, chain-of-thought reasoning. This is your baseline and often gets you further than expected.

**Layer 2 — RAG Context Injection:** Retrieve relevant context (documents, user history, golden examples) and inject it into the prompt. Still zero training cost — you are enhancing the prompt dynamically at inference time.

**Layer 3 — LoRA Fine-Tuning:** Train task-specific adapters that modify the model's weights. This is where you need labeled data, training infrastructure, and a clear evaluation pipeline.

## Choosing a Fine-Tuning Approach

When you do reach Layer 3, the choice of method depends on your data and team size:

| Approach                                 | Data Needed                              | Compute               | When to Use                               |
| ---------------------------------------- | ---------------------------------------- | --------------------- | ----------------------------------------- |
| **SFT** (Supervised Fine-Tuning)         | (input, target) pairs                    | Low                   | When you have gold-standard outputs       |
| **DPO** (Direct Preference Optimization) | (input, preferred, rejected) triplets    | Medium                | When you have user corrections or ratings |
| **RLHF** (PPO)                           | Ratings → reward model → policy gradient | High                  | At scale with 1000+ rated examples        |
| **Few-shot** (in-context)                | 2-5 examples in prompt                   | Zero (inference only) | Quick wins before any training            |

For solo developers and small teams, **DPO beats RLHF**. DPO uses preference pairs directly — "this output is better than that output" — without training a separate reward model. RLHF requires a full reward model plus PPO policy gradient optimization. The compute and data requirements are significantly higher for marginal gains at small scale.

## Where Training Signals Come From

For a system with user reviews (edit corrections) and user ratings (0-N scale), the data maps cleanly to fine-tuning methods:

- **Review diffs → SFT or DPO:** User edits provide (input, corrected_output) pairs for SFT. Combined with the original LLM output, they also provide (input, preferred=user_edit, rejected=llm_output) triplets for DPO.
- **Ratings → DPO preference pairs:** For the same input context, a rating-3 output is preferred over a rating-0 output. You need roughly 200+ pairs for DPO to show improvement.
- **Golden set promotion:** High-rated outputs (rating 3/3) can be promoted to a golden set for SFT or for Layer 2 few-shot prompting.

## LoRA Multi-Task Architecture

Instead of deploying N separate fine-tuned models, use one base model with task-specific LoRA adapters:

```text
Base Model (frozen, shared)
    ├── LoRA Adapter A: Summarization (trained on review corrections)
    ├── LoRA Adapter B: Recommendations (trained on rating preference pairs)
    └── LoRA Adapter C: Intent Classification (trained on intent corrections)

Same GPU memory as 1 model. Hot-swap adapters per request.
```

This is how companies like Anyscale and Predibase serve hundreds of fine-tuned models on shared GPU infrastructure. LoRA trains only ~1-5% of parameters, so adapters are small and fast to swap.

## TIES-Merging: Per-Task Training, Single-Adapter Serving

When your runtime can only load one adapter — Ollama supports one LoRA per Modelfile, and a NAS has limited RAM for multiple model instances — you can merge task-specific adapters into one:

```text
TRAINING (isolated, per-task):
  LoRA A: Classification  ─┐
  LoRA B: Summarization   ─┤─→ TIES-Merge ─→ Single merged LoRA
  LoRA C: Recommendation  ─┘

SERVING (single process):
  Ollama base model + merged LoRA = one process, ~5 GB
```

Per-task training is industry standard (OpenAI, Google Vertex AI, HuggingFace PEFT all recommend it) because data distributions differ per task, optimal hyperparameters differ, and you want independent evaluation and rollback for each task.

**TIES-Merging** (Yadav et al., 2023) resolves parameter conflicts when combining adapters by trimming redundant parameters, resolving sign conflicts, and merging only the agreed-upon directions. HuggingFace's `mergekit` implements TIES, DARE, and linear merge methods. If the merged adapter regresses more than 5% on any eval metric, revert to the previous merge and retrain the offending task's LoRA.

## Layer 2: Closing the Feedback Loop Before Fine-Tuning

Most ML systems have an open feedback loop: user ratings are captured and measured, but never fed back into the model. Layer 2 closes this gap using prompt engineering alone — no training infrastructure needed.

The pattern is **few-shot from golden set**:

1. Capture user feedback (ratings 0-3, corrections)
2. Promote excellent examples (rating 3) to a golden set
3. At inference, query the golden set for examples matching the current input's context
4. Inject those examples as few-shot demonstrations in the prompt
5. Skip input-intent combinations that users consistently rate poorly

This is retrieval-augmented generation applied to the prompt itself — using your own users' validated feedback as in-context learning examples. Layer 2 often provides significant quality gains on its own and ships independently of Layer 3.

## Cascade vs. Multimodal

One important architectural distinction: if you convert audio, images, or links to text before processing with an LLM, you have a **cascade architecture**, not a multimodal one.

```text
CASCADE (what most projects actually need):
  Audio → STT model (Whisper) ─┐
  Image → OCR model (Tesseract) ├→ Text → LLM (text-only) → Output
  Link  → HTTP fetch + extract  ─┘
  Fine-tuning: standard text-to-text SFT/DPO

MULTIMODAL (when you genuinely need it):
  Audio ─┐
  Image  ├→ Multimodal LLM (GPT-4V, Gemini Vision) → Output
  Text   ─┘
  Fine-tuning: requires multimodal training data, vision/audio encoders
```

Most resource-constrained projects should use the cascade approach. You get multimodal capability without multimodal training cost.

## A Critical Caveat: Fine-Tuning Is Model-Locked

LoRA adapters only work on the exact foundation model they were trained on. The tokenizer (token IDs differ between models), weight dimensions, and layer architecture are all model-specific. If you switch base models, every adapter must be retrained from scratch.

This is why the three-layer approach matters: Layers 1 and 2 (prompt engineering and RAG) are model-portable. Layer 3 (LoRA) is model-locked. Your training data (ChatML JSONL format) survives model changes even if the adapters do not.

## Key Takeaway

Do not jump to fine-tuning. Exhaust prompt engineering and RAG first — they are cheaper, faster to iterate, and portable across models. When you do fine-tune, use LoRA for parameter efficiency, DPO over RLHF for small teams, and TIES-Merging when your runtime can only serve one adapter. The investment in Layer 3 should be justified by clear evidence that Layers 1 and 2 are not sufficient.
