---
title: Gemini Asymmetric Embeddings
description: >-
  Gemini's embedding API exposes a task_type parameter that encodes queries and documents differently, which lifts retrieval quality over symmetric embeddings.
date: 2026-03-23T00:00:00.000Z
updated: '2026-08-02'
tags:
  - ai-ml
  - embeddings
  - google
category: ai-ml
draft: false
lang: en
expanded: true
references:
  - url: 'https://cloud.google.com/vertex-ai/generative-ai/docs/embeddings/task-types'
    title: Choose an embeddings task type
    type: official
  - url: 'https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/text-embeddings'
    title: Text embeddings API reference
    type: official
  - url: 'https://cloud.google.com/vertex-ai/generative-ai/docs/embeddings/get-text-embeddings'
    title: Get text embeddings — dimensions and request limits
    type: official
  - url: 'https://huggingface.co/nomic-ai/nomic-embed-text-v1.5'
    title: nomic-embed-text-v1.5 model card
    type: authoritative
source_content_hash: 4382b37c4535c74008abd96bc30d40f49e1ee79a19494fa1b86ba0c1c36f61f5
---

I was building a RAG pipeline and my retrieval quality was mediocre. Queries like "how do I handle database migrations" would return tangentially related documents instead of the ones that directly answered the question. I was using symmetric embeddings — the same encoding for both queries and documents — and it turned out that was the bottleneck.

Switching to Gemini's task-type-aware embeddings fixed it. I first wired this up with `text-embedding-004`, which Google has since retired; `gemini-embedding-001` carries the same `task_type` mechanism, so that is the model in the code below. Here is how and why it works.

## Symmetric vs. Asymmetric Embeddings

Most embedding models are **symmetric**: they produce the same vector regardless of whether the input is a short query or a long document. The model treats "how to handle migrations" and a 500-word guide about Alembic migrations as the same kind of text. Both get encoded into the same vector space with the same optimization.

**Asymmetric embeddings** break that assumption. They recognize that queries and documents are fundamentally different — a query is a short question expressing an information need, while a document is a longer passage containing the answer. The model encodes each one differently so that queries naturally "point toward" matching documents in the vector space.

Google's own task-type documentation makes the problem concrete: "Why is the sky blue?" and "The scattering of sunlight causes the blue color" are not semantically similar *as statements*, so a plain similarity search does not automatically connect them. Task types pull the question and its answer into a shared space instead of forcing you to fine-tune a model or bolt on query expansion.

Gemini implements this through a `task_type` parameter:

| task_type            | Purpose                                | Optimized For         |
| -------------------- | -------------------------------------- | --------------------- |
| `RETRIEVAL_QUERY`    | Encode a search query                  | Short text, questions |
| `RETRIEVAL_DOCUMENT` | Encode a document for the search index | Long text, passages   |

The same text embedded with `RETRIEVAL_QUERY` vs. `RETRIEVAL_DOCUMENT` produces **different vectors**. This is intentional — each side of the retrieval problem gets its own optimized representation. If you leave `task_type` blank, the API defaults to `RETRIEVAL_QUERY`, which is the wrong side of the pair for your corpus, so the indexing call is the one you must not forget.

## How to Use It

At indexing time, embed all your documents with `RETRIEVAL_DOCUMENT`. At query time, embed the user's question with `RETRIEVAL_QUERY`. The API handles the rest.

```python
from google import genai
from google.genai import types

client = genai.Client()

# Indexing: embed documents
doc_result = client.models.embed_content(
    model="gemini-embedding-001",
    contents=["Your document text here", "Another document"],
    config=types.EmbedContentConfig(task_type="RETRIEVAL_DOCUMENT"),
)

# Querying: embed the user's question
query_result = client.models.embed_content(
    model="gemini-embedding-001",
    contents="how to handle database migrations",
    config=types.EmbedContentConfig(task_type="RETRIEVAL_QUERY"),
)
```

Two limits are worth knowing before you write the indexing loop. On Vertex AI, a `gemini-embedding-001` request takes a single input text, so the batching you can do depends on which surface you call. And each input text is capped at 2,048 tokens with silent truncation on by default — if you would rather a too-long chunk fail loudly than get quietly cut, set `autoTruncate` to `false`.

One more thing to check before you build on `task_type`: Google's task-type page lists exactly which models support it. Newer embedding models are moving away from the parameter and expect the task to be written into the text as a prefix instead, so the list is worth re-reading whenever you pick a model.

## Why Not Symmetric?

Symmetric models work well for **document-to-document** similarity — finding articles similar to another article, clustering, or deduplication. When both sides of the comparison are the same type of content, symmetric encoding makes sense. Gemini has a `SEMANTIC_SIMILARITY` task type for exactly that, and the docs are blunt that it is not meant for retrieval.

But retrieval is inherently asymmetric. A three-word query and a three-paragraph answer serve different roles. Encoding them identically forces the model to compromise between two objectives. Asymmetric embeddings eliminate that compromise.

## Switching From Ollama (or Other Symmetric Models)

If you started with a local model like Ollama's **nomic-embed-text** and want to switch to Gemini, the dimensions are the first thing to check. nomic-embed-text produces **768-dimensional vectors**. `gemini-embedding-001` returns **3,072 dimensions** by default, but the `output_dimensionality` parameter lets you ask for a smaller vector — so you can keep an existing 768-wide column and its index instead of migrating the schema.

You still have to **re-embed every document**. Vectors from different models are not comparable even when they share a width. The numbers occupy different regions of the vector space, and cosine similarity across the two is meaningless.

That makes the switch mostly mechanical: swap the embedding call, pick a dimensionality that matches your storage, re-embed the corpus, and leave the rest — pgvector tables, HNSW indexes, retrieval logic — alone.

## When to Reach for This

Use asymmetric embeddings when you are building a **search or RAG system** where retrieval quality matters and an API round-trip per chunk is acceptable.

Stick with a symmetric local model like nomic-embed-text via Ollama when you need **offline operation**, document-to-document similarity, or an air-gapped environment where calling an external API is not an option.
