---
title: pgvector HNSW Index in PostgreSQL
description: You don't need a dedicated vector database for semantic search — pgvector with HNSW indexes handles under 100K vectors at over 95% recall, right inside PostgreSQL.
date: 2026-03-23T00:00:00.000Z
updated: 2026-03-24T00:00:00.000Z
tags:
  - backend
  - database
  - search
  - postgresql
category: backend
draft: false
lang: en
expanded: true
references:
  - url: 'https://github.com/pgvector/pgvector'
    title: pgvector - Vector similarity search for Postgres
    type: official
source_content_hash: e767390118af91ca90bd07c0817b75b09cb3ce6ee398b2ca4594218e98f7090d
---

I needed to add semantic search to a project already running on PostgreSQL. The obvious path was spinning up a dedicated vector database like Pinecone or Weaviate. But adding another service means another connection to manage, another bill to pay, and another thing that can go down at 2 AM. I wanted to know: could PostgreSQL handle this on its own?

It can. The answer is **pgvector** — a PostgreSQL extension that stores vector embeddings and performs similarity search using native SQL.

## What pgvector Gives You

pgvector adds a `vector` column type to PostgreSQL. You store embeddings (arrays of floats produced by models like OpenAI's `text-embedding-3-small`) alongside your existing data and query them with distance operators.

The extension supports three distance functions, but for most NLP tasks you want **cosine distance** via the `<=>` operator. One important gotcha: `<=>` returns *distance*, not similarity. Lower values mean more similar. To get a similarity score between 0 and 1, compute `1 - distance`.

```sql
-- Find the 5 most similar documents
SELECT id, 1 - (embedding <=> $1) AS similarity
FROM embeddings
WHERE 1 - (embedding <=> $1) > 0.7
ORDER BY embedding <=> $1
LIMIT 5;
```

Without an index, pgvector scans every row — fine for hundreds of vectors, painful for thousands. That is where HNSW comes in.

## HNSW: Fast Approximate Search

HNSW (Hierarchical Navigable Small World) is a graph-based index structure for approximate nearest neighbor search. Instead of checking every vector, it navigates a layered graph to find close matches in **O(log n)** time.

Creating one is a single statement:

```sql
CREATE INDEX ON embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

Two parameters control the trade-off between speed and accuracy:

| Parameter          | Default | What It Controls                        |
| ------------------ | ------- | --------------------------------------- |
| `m`                | 16      | Connections per node (higher = more accurate, more memory) |
| `ef_construction`  | 64      | Search width during build (higher = better recall, slower build) |

With these defaults, HNSW achieves **over 95% recall at under 100K vectors**. For most applications — internal tools, content search, recommendation features — that is more than enough. You do not need Pinecone for 50,000 embeddings.

One thing to know: HNSW index builds are **synchronous**. PostgreSQL blocks writes to the table until the index finishes. At under 100K vectors this completes in seconds. At millions, you would want to plan around it.

## Schema Design That Scales

Store embeddings in a **separate table** rather than adding a vector column to your main content table. A single 768-dimension embedding occupies `768 × 4 = 3,072 bytes`. If your `articles` table has 10 columns you query frequently, every `SELECT *` drags along 3KB of embedding data you rarely need.

```sql
CREATE TABLE article_embeddings (
  id          BIGINT PRIMARY KEY REFERENCES articles(id),
  embedding   vector(768) NOT NULL,
  content_hash TEXT NOT NULL  -- SHA256 of source content
);
```

The `content_hash` column stores a SHA256 hash of the source text. Before re-embedding, compare hashes — if the content has not changed, skip the API call. Embedding models charge per token, so deduplication saves real money over time.

The tradeoff: retrieval now requires a JOIN. In practice, this is a non-issue. You search the embeddings table, get matching IDs, then fetch the full content. The JOIN cost is negligible compared to the savings on every other query that touches the main table.

## When to Reach for pgvector

Use pgvector when your dataset is under 100K vectors and you already run PostgreSQL. You get vector search without adding infrastructure, your embeddings participate in transactions and backups, and you can JOIN results against relational data in a single query.

If you are on GCP, **Cloud SQL supports pgvector** out of the box — no self-managed extensions required.

Skip pgvector when you need to search millions of vectors with sub-millisecond latency, or when your workload is pure vector search with no relational component. At that scale, a purpose-built vector database earns its keep.

For everything else, the database you already have is the best one to use.
