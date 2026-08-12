---
title: Gemini Asymmetric Embeddings
description: >-
  Retrieval gets better when queries and documents are encoded differently. Gemini expressed that with a task_type parameter, and its newer model moved the same idea into the prompt.
date: 2026-03-23T00:00:00.000Z
updated: "2026-08-12"
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
    title: >-
      Gemini API embeddings guide — task_type on gemini-embedding-001, prompt
      task prefixes on gemini-embedding-2
    type: official
  - url: 'https://ai.google.dev/gemini-api/docs/deprecations'
    title: Gemini API model deprecations — shutdown dates per model
    type: official
  - url: 'https://cloud.google.com/vertex-ai/generative-ai/docs/embeddings/task-types'
    title: Choose an embeddings task type — asymmetric and symmetric formats
    type: official
  - url: 'https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/text-embeddings'
    title: Text embeddings API reference — task_type default and autoTruncate
    type: official
  - url: 'https://cloud.google.com/vertex-ai/generative-ai/docs/embeddings/get-text-embeddings'
    title: Get text embeddings — dimensions and request limits
    type: official
  - url: 'https://cloud.google.com/vertex-ai/generative-ai/docs/embeddings/get-multimodal-embeddings'
    title: Get multimodal embeddings — gemini-embedding-2 task instructions
    type: official
  - url: 'https://cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/embedding-2'
    title: Gemini Embedding 2 model page — release date and limits
    type: official
  - url: 'https://cloud.google.com/vertex-ai/generative-ai/docs/learn/model-versions'
    title: Model versions and lifecycle — embedding model retirement dates
    type: official
  - url: 'https://huggingface.co/nomic-ai/nomic-embed-text-v1.5'
    title: nomic-embed-text-v1.5 model card
    type: authoritative
source_content_hash: 638396d439f2463c92c063bbbf5f2ce514f144f5832dad58766e743988d044e4
---

I was building a RAG pipeline and my retrieval quality was mediocre. Queries like "how do I handle database migrations" would come back with tangentially related documents instead of the ones that actually answered the question. I was embedding both sides the same way, one call with no distinction between a question and a passage, and that was the bottleneck.

Encoding the two sides differently fixed it. Here is how that works, and a correction to what I first wrote about it.

Start with the models, because they moved. I wired this up with `text-embedding-004`, which is on its way out on both of Google's surfaces. The Gemini API [shut it down in January 2026](https://ai.google.dev/gemini-api/docs/deprecations), and Vertex AI lists it for retirement on 2027-04-01. So the code below uses `gemini-embedding-001`, which carries the same `task_type` mechanism and a Vertex retirement date of "No sooner than May 20, 2028." The two surfaces keep separate calendars, though: the Gemini API lists that same model for shutdown on 2028-05-14. Read the date for the surface you actually call, not the one you happened to find first.

The current model is `gemini-embedding-2`, GA since 2026-04-22, and it does not accept `task_type` at all. The task instruction moved into the prompt instead. Both mechanisms are below, but check the lifecycle page before you commit to either. This area moves faster than blog posts do.

## Symmetric vs. Asymmetric Encoding

Symmetric encoding produces the same vector for a piece of text regardless of the role it plays. The model treats "how to handle migrations" and a 500-word guide about Alembic migrations as the same kind of input, in the same space, under the same optimization.

Asymmetric encoding breaks that assumption. A query is a short question expressing an information need; a document is a longer passage that contains the answer. Encode each one for its role and queries naturally point toward matching documents in the vector space.

Google's task-type documentation makes the problem concrete: "Why is the sky blue?" and "The scattering of sunlight causes the blue color" "have distinctly different meanings as statements," so a plain similarity search does not automatically recognize their relationship. The same page splits use cases into an **asymmetric format** — search, question answering, fact checking, code retrieval — and a **symmetric format** — classification, clustering, semantic similarity. That split belongs to the use case, not to a vendor.

## The task_type Parameter

On `gemini-embedding-001` the split is an API field:

| task_type            | Purpose                                | Optimized For         |
| -------------------- | -------------------------------------- | --------------------- |
| `RETRIEVAL_QUERY`    | Encode a search query                  | Short text, questions |
| `RETRIEVAL_DOCUMENT` | Encode a document for the search index | Long text, passages   |

The same text embedded with `RETRIEVAL_QUERY` vs. `RETRIEVAL_DOCUMENT` produces **different vectors**. That is the point — each side of the retrieval problem gets its own representation. The Vertex API reference is explicit that when `task_type` is "left blank, the default used is `RETRIEVAL_QUERY`," which is the wrong side of the pair for your corpus. The indexing call is the one you must not forget.

At indexing time, embed documents with `RETRIEVAL_DOCUMENT`. At query time, embed the user's question with `RETRIEVAL_QUERY`.

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

Three limits are worth knowing before you write the indexing loop. On Vertex AI a `gemini-embedding-001` request "can only include a single input text," so how much you can batch depends on which surface you call. Each input text is capped at 2,048 tokens, and `autoTruncate` defaults to `true` — set it to `false` if you would rather an over-long chunk fail loudly than get quietly cut. And if you shrink the vector with `output_dimensionality`, you have to normalize the result yourself: only the full 3,072-dimension output comes back normalized on this model.

## What the Newer Model Changed

`gemini-embedding-2` keeps the asymmetry and drops the parameter. The docs put it plainly: "You cannot use the `task_type` field to specify an embedding task for the `gemini-embedding-2` model. Instead, include the task as an instruction in your prompt." The documented retrieval format is a prefix on each side:

```python
# gemini-embedding-2: the task lives in the text
def prepare_query(query):
    return f"task: search result | query: {query}"

def prepare_document(content, title="none"):
    return f"title: {title} | text: {content}"
```

Same asymmetry, different surface. The newer model also raises the input limit to 8,192 tokens and takes multimodal input rather than text alone. Its output is "already L2 normalized for non-default dimensions (unlike `gemini-embedding-001`)," so the manual normalization step above goes away. If you are starting a pipeline today, that is the path; `task_type` is what you keep for an index you already built on `gemini-embedding-001`.

One batching difference is worth a note before you port an indexing loop over. On the Gemini API, [the embeddings guide](https://ai.google.dev/gemini-api/docs/embeddings) says `gemini-embedding-001` gives you individual embeddings for a list of strings while `gemini-embedding-2` "produces a single aggregated embedding for multiple inputs," and points you at the Batch API when you want many embeddings at once. A loop that passed a list and got a list back would quietly collapse a whole batch into one vector.

The lesson that survives both APIs: pick a convention and use it consistently. The docs are explicit that the task has to be applied the same way on both sides. If your documents were embedded under one task format, your queries have to follow it too. Mixing conventions across the index and the query side puts you back in the mismatch this whole mechanism exists to remove.

## Where Symmetric Formatting Still Applies

Symmetric formatting is for single-input use cases — classification, clustering, deduplication, and text-similarity scoring, where both sides of the comparison are the same kind of content. Google's own page marks `SEMANTIC_SIMILARITY` as "not intended for retrieval use cases," and the `gemini-embedding-2` table repeats the warning for the equivalent `task: sentence similarity` prefix.

Retrieval is the asymmetric case. A three-word query and a three-paragraph answer serve different roles, and encoding them identically forces the model to compromise between two objectives.

## A Correction: nomic-embed-text Is Not Symmetric

When I first wrote this up, I filed Ollama's **nomic-embed-text** under "symmetric" and treated asymmetry as the thing Gemini added. That was wrong, and the model card says so directly.

The `nomic-embed-text-v1.5` card states that "the text prompt _must_ include a _task instruction prefix_, instructing the model which task is being performed" — `search_query:` for questions, `search_document:` for corpus text. That is the identical query/document split, expressed as a text prefix instead of an API field — which is exactly where Gemini's newer model ended up.

So "symmetric model, needs an asymmetric API" was the wrong shape for the problem. A model can be asymmetric and still be used symmetrically — no prefixes, both sides encoded the same — and that produces precisely the mediocre retrieval I started with. Reading the model card is cheaper than switching providers. If your retrieval is weak, check what your current model expects of you before you conclude the API is the thing holding it back.

## Switching Between Models

Dimensions come first. `nomic-embed-text-v1.5` produces **768-dimensional vectors** and supports Matryoshka truncation down to 512, 256, 128, or 64. `gemini-embedding-001` returns **3,072 dimensions** by default, and `output_dimensionality` lets you ask for a smaller vector — so you can keep an existing 768-wide column and its index instead of migrating the schema, as long as you normalize what comes back.

You still have to **re-embed every document**. Vectors from different models are not comparable even when they share a width; the numbers occupy different regions of the space, and cosine similarity across the two is meaningless. The same is true across `gemini-embedding-001` and `gemini-embedding-2`.

That makes the switch mostly mechanical: swap the embedding call, carry over the query/document convention in whichever form the new model wants it, pick a dimensionality that matches your storage, re-embed the corpus, and leave the rest — pgvector tables, HNSW indexes, retrieval logic — alone.

## When to Reach for the Hosted API

Use a hosted embedding API when you want someone else to own model upgrades and you can afford a network round-trip per chunk.

Run a local model when you need **offline operation** or an air-gapped environment where calling an external API is not an option. That decision is about where the compute lives and who pays for it — not about symmetric versus asymmetric. Both sides of that choice can give you the asymmetric split. The part you have to get right is using it.
