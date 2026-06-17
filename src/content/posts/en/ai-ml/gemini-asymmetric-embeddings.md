---
title: Gemini Asymmetric Embeddings
description: >-
  Gemini's text-embedding-004 uses asymmetric embedding with task_type to encode queries and documents differently, producing better retrieval results than symmetric models.
date: 2026-03-23T00:00:00.000Z
updated: 2026-03-24T00:00:00.000Z
tags:
  - ai-ml
  - embeddings
  - google
category: ai-ml
draft: false
lang: en
expanded: true
references:
  - url: 'https://ai.google.dev/gemini-api/docs/embeddings'
    title: Gemini API Embeddings Guide
    type: official
source_content_hash: 4382b37c4535c74008abd96bc30d40f49e1ee79a19494fa1b86ba0c1c36f61f5
---

I was building a RAG pipeline and my retrieval quality was mediocre. Queries like "how do I handle database migrations" would return tangentially related documents instead of the ones that directly answered the question. I was using symmetric embeddings — the same encoding for both queries and documents — and it turned out that was the bottleneck.

Switching to Gemini's **text-embedding-004** with asymmetric task types fixed it. Here is how and why.

## Symmetric vs. Asymmetric Embeddings

Most embedding models are **symmetric**: they produce the same vector regardless of whether the input is a short query or a long document. The model treats "how to handle migrations" and a 500-word guide about Alembic migrations as the same kind of text. Both get encoded into the same vector space with the same optimization.

**Asymmetric embeddings** break that assumption. They recognize that queries and documents are fundamentally different — a query is a short question expressing an information need, while a document is a longer passage containing the answer. The model encodes each one differently so that queries naturally "point toward" matching documents in the vector space.

Gemini's text-embedding-004 implements this through a `task_type` parameter:

| task_type            | Purpose                                   | Optimized For         |
| -------------------- | ----------------------------------------- | --------------------- |
| `RETRIEVAL_QUERY`    | Encode a search query                     | Short text, questions |
| `RETRIEVAL_DOCUMENT` | Encode a document for the search index    | Long text, passages   |

The same text embedded with `RETRIEVAL_QUERY` vs. `RETRIEVAL_DOCUMENT` produces **different vectors**. This is intentional — each side of the retrieval problem gets its own optimized representation.

## How to Use It

At indexing time, embed all your documents with `RETRIEVAL_DOCUMENT`. At query time, embed the user's question with `RETRIEVAL_QUERY`. The API handles the rest.

```python
import google.generativeai as genai

# Indexing: embed documents
doc_result = genai.embed_content(
    model="models/text-embedding-004",
    content=["Your document text here", "Another document"],
    task_type="RETRIEVAL_DOCUMENT",
)

# Querying: embed the user's question
query_result = genai.embed_content(
    model="models/text-embedding-004",
    content="how to handle database migrations",
    task_type="RETRIEVAL_QUERY",
)
```

The `embed_content` call accepts up to **100 texts per batch**, which cuts API round-trips when indexing large document sets. The free tier gives you 1,500 requests per minute — generous enough for most portfolio and demo workloads.

## Why Not Symmetric?

Symmetric models work well for **document-to-document** similarity — finding articles similar to another article, clustering, or deduplication. When both sides of the comparison are the same type of content, symmetric encoding makes sense.

But retrieval is inherently asymmetric. A three-word query and a three-paragraph answer serve different roles. Encoding them identically forces the model to compromise between two objectives. Asymmetric embeddings eliminate that compromise.

## Switching From Ollama (or Other Symmetric Models)

If you started with a local model like Ollama's **nomic-embed-text** and want to switch to Gemini, the migration is straightforward. Both produce **768-dimensional vectors**, so your vector store schema and indexes stay the same — no reindexing of the storage structure needed.

You do need to **re-embed all your documents** with the new model, though. Vectors from different models are not comparable even if they share the same dimensionality. The numbers occupy different regions of the vector space.

This makes Gemini a clean upgrade path: swap the embedding call, re-embed your corpus, and keep everything else — your pgvector tables, HNSW indexes, and retrieval logic — unchanged.

## When to Reach for This

Use Gemini asymmetric embeddings when you are building a **search or RAG system** where retrieval quality matters. The free tier handles most side projects and demos without cost.

Stick with symmetric embeddings (like nomic-embed-text via Ollama) when you need **offline operation**, document-to-document similarity, or an air-gapped environment where calling an external API is not an option.
