---
title: RAG Hybrid Search Architecture
description: Why single-method retrieval fails and how fusing dense, sparse, fuzzy, and managed search with Reciprocal Rank Fusion builds a retrieval pipeline that handles both semantic understanding and keyword precision.
date: 2026-03-23T00:00:00.000Z
updated: '2026-08-02'
tags:
  - ai-ml
  - rag
  - search
  - architecture
category: ai-ml
draft: false
lang: en
expanded: true
references:
  - url: 'https://github.com/dorianbrown/rank_bm25/blob/master/rank_bm25.py'
    title: rank_bm25 source - BM25 index is built from the full corpus at construction
    type: official
  - url: 'https://github.com/pgvector/pgvector'
    title: pgvector - Open-source vector similarity search for Postgres
    type: official
  - url: 'https://www.elastic.co/docs/reference/elasticsearch/rest-apis/reciprocal-rank-fusion'
    title: Elasticsearch - Reciprocal Rank Fusion (formula and default rank constant)
    type: official
source_content_hash: 387c1d977abb69c1904812ea1e6229fdd556c14236e942744a35531d48479c42
---

I was building a RAG pipeline and kept running into the same frustrating pattern: vector search would find semantically related documents but miss the one that contained the exact keyword the user typed. Searching "kubernetes deployment YAML" returned articles about container orchestration concepts — relevant, but not the specific YAML reference the user wanted. Keyword search had the opposite problem. I needed both, and I needed them to work together.

## The Core Problem with Single-Method Retrieval

Vector search (dense retrieval) encodes text into high-dimensional embeddings and finds documents by cosine similarity. It understands that "dogs" and "puppies" are related. But it can fail on exact matches — "kubernetes" as a query might not surface a document containing "kubernetes" if the surrounding context pushes the vectors apart.

Keyword search (sparse retrieval) does the opposite. BM25 and similar algorithms excel at exact term matching. Search "kubernetes" and you get every document with that word, ranked by term frequency. But ask for "container orchestration platform" and it returns nothing if those exact words don't appear.

Neither method alone covers both cases. Hybrid search fuses their ranked results so documents that appear in multiple retrieval lists get boosted to the top.

## The Four Components

The architecture uses four retrieval methods, split by deployment environment:

| Component | Type | Where It Runs | Why |
|-----------|------|---------------|-----|
| **pgvector** | Dense (semantic) | PostgreSQL | Accessible from any service via SQL |
| **rank_bm25** | Sparse (keyword) | Python Worker | In-memory index needs persistent state |
| **Typesense Cloud** | Keyword + typo tolerance | SaaS API | Stateless, handles cold starts |
| **pg_trgm** | Fuzzy fallback | PostgreSQL | Catches typos when sparse returns fewer than 2 results |

The split between BM25 and Typesense isn't a preference — it's a deployment constraint. BM25 from the `rank_bm25` library builds an in-memory index that dies on every Cloud Run cold start. A long-running worker process can maintain that index. A stateless API endpoint cannot. Typesense Cloud, as a managed service, stays available regardless of container lifecycle.

## Two Read Paths, One Dense Core

Both paths start with pgvector for semantic search, then diverge on the sparse side:

**RAG path (Worker):** pgvector + BM25 results feed into RRF fusion, producing the top 3 documents for LLM context injection. The context injection is wrapped in try/except — if retrieval fails, the LLM still responds, it loses grounding but doesn't crash.

**User search path (API):** pgvector + Typesense results feed into RRF fusion, returning the top 10 results for the search UI. Typesense adds built-in typo tolerance that BM25 lacks, which matters more for user-facing search than RAG context.

## How RRF Fusion Works

Reciprocal Rank Fusion (RRF) merges ranked lists from different retrieval methods into a single ranking. The formula for each document is:

```
RRF_score = Σ (1 / (k + rank_i))
```

Where `k` is a constant (typically 60) and `rank_i` is the document's position in each retrieval list. A document ranked #1 in vector search and #3 in BM25 gets a combined score of `1/61 + 1/63 = 0.0323`. A document ranked #1 in only one list gets `1/61 = 0.0164`.

The key insight: documents appearing in multiple lists always score higher than documents appearing in only one. This naturally boosts results that satisfy both semantic and keyword criteria.

## The Write Path

When a note reaches COMPLETED status, three things happen:

1. **Embedding generation** — the content is embedded via the embedding API, but only if a SHA256 hash of the content differs from the stored hash. This prevents re-embedding unchanged documents.
2. **Search index sync** — the document is pushed to Typesense and the BM25 index is flagged for rebuild.
3. **tsvector trigger** — a PostgreSQL trigger updates the `tsvector` column for pg_trgm fuzzy matching.

The SHA256 dedup check matters more than it seems. Embedding API calls cost money and time. If you re-sync 500 documents and only 3 changed, you want to embed 3, not 500.

## Gotchas I Hit

**BM25 can't do incremental updates.** The `rank_bm25` library requires rebuilding the entire index from scratch when documents change. For a few hundred documents this takes milliseconds, but it means the worker needs a rebuild-on-change strategy rather than insert-in-place.

**pgvector returns distance, not similarity.** The cosine distance operator (`<=>`) returns values where 0 means identical and 2 means opposite. For RRF scoring, you need similarity (1 means identical), so the conversion is `1 - distance`. Getting this wrong inverts your rankings.

**Cold starts forced the architecture split.** My initial design used BM25 everywhere. The first Cloud Run cold start wiped the in-memory index mid-request, returning zero sparse results. That single failure mode drove the BM25/Typesense split — the most impactful architectural decision in the pipeline.

## When This Architecture Makes Sense

This level of complexity pays off when you have 1,000+ documents and need both semantic understanding and keyword precision. For RAG pipelines specifically, context quality directly impacts LLM response quality, so the retrieval layer deserves investment.

For smaller collections (under 1,000 documents), a single pgvector query with a keyword filter gets you 80% of the way there. For real-time search with sub-10ms latency requirements, RRF's overhead of running multiple retrievals and merging results adds too much. And if a managed service like Elasticsearch or Algolia already covers your needs, there's no reason to build this from scratch.

## Takeaway

Hybrid search isn't about picking the best retrieval method — it's about acknowledging that no single method covers every query type. Dense search handles semantics, sparse search handles keywords, fuzzy search handles typos, and RRF fuses them into a ranking that outperforms any individual component. The deployment environment dictates which sparse method you use (in-memory BM25 for stateful workers, managed Typesense for stateless APIs), but the fusion pattern stays the same.

