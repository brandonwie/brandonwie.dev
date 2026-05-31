---
title: PostgreSQL에서 pgvector HNSW 인덱스 활용하기
description: >-
  semantic search를 위해 별도의 vector database가 필요하지 않아요 — pgvector의
  HNSW 인덱스는 10만 건 이하의 vector에서 95% 이상의 recall을 PostgreSQL 안에서
  바로 제공해요.
date: 2026-03-23T00:00:00.000Z
updated: '2026-03-24'
tags:
  - backend
  - database
  - search
  - postgresql
category: backend
draft: false
lang: ko
source_lang: en
source_slug: pgvector-hnsw-postgresql
source_updated: '2026-03-24'
translation_date: '2026-05-10'
source_content_hash: e767390118af91ca90bd07c0817b75b09cb3ce6ee398b2ca4594218e98f7090d
---

PostgreSQL을 이미 쓰고 있는 프로젝트에 semantic search를 추가해야 했어요. 가장 먼저 떠오른 건 Pinecone이나 Weaviate 같은 전용 vector database를 붙이는 거였는데, 서비스를 하나 더 추가한다는 건 관리할 connection이 하나 더 늘고, 비용이 늘고, 새벽 2시에 장애날 수 있는 포인트가 하나 더 생긴다는 의미잖아요. 그래서 궁금했어요 — PostgreSQL만으로 가능할까?

가능해요. 답은 **pgvector**였어요. PostgreSQL 확장으로 붙여 쓰면 vector embedding을 저장하고, 익숙한 SQL 그대로 유사도 검색을 돌릴 수 있어요.

## pgvector가 제공하는 것

pgvector는 PostgreSQL에 `vector` column type을 추가해요. OpenAI의 `text-embedding-3-small` 같은 모델이 생성하는 embedding(float 배열)을 기존 데이터와 함께 저장하고, distance operator로 쿼리할 수 있어요.

extension이 지원하는 distance function은 세 가지인데, 대부분의 NLP 작업에서는 `<=>` operator를 통한 **cosine distance**를 쓰면 돼요. 여기서 주의할 점 하나: `<=>` 는 *distance*를 반환하지, similarity를 반환하는 게 아니에요. 값이 낮을수록 더 유사한 거예요. 0과 1 사이의 similarity score를 얻으려면 `1 - distance`로 계산하면 돼요.

```sql
-- Find the 5 most similar documents
SELECT id, 1 - (embedding <=> $1) AS similarity
FROM embeddings
WHERE 1 - (embedding <=> $1) > 0.7
ORDER BY embedding <=> $1
LIMIT 5;
```

인덱스 없이 pgvector는 모든 row를 scan해요 — 수백 건이면 괜찮지만, 수천 건이 되면 느려져요. 여기서 HNSW가 등장해요.

## HNSW: 빠른 근사 검색

HNSW(Hierarchical Navigable Small World)는 근사 최근접 이웃 검색을 위한 graph 기반 인덱스예요. 모든 vector를 하나씩 비교하는 대신, 계층 graph를 따라 내려가면서 가까운 결과를 **O(log n)** 안에 찾아내요.

생성하는 건 SQL 한 줄이면 돼요:

```sql
CREATE INDEX ON embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

두 가지 parameter가 속도와 정확도 사이의 trade-off를 조절해요:

| Parameter          | Default | What It Controls                        |
| ------------------ | ------- | --------------------------------------- |
| `m`                | 16      | Connections per node (higher = more accurate, more memory) |
| `ef_construction`  | 64      | Search width during build (higher = better recall, slower build) |

이 기본값으로 HNSW는 **10만 건 이하의 vector에서 95% 이상의 recall**을 달성해요. 대부분의 애플리케이션 — 사내 도구, 콘텐츠 검색, 추천 기능 — 에는 충분하고도 남아요. 50,000개 embedding 때문에 Pinecone을 도입할 필요는 없어요.

한 가지 알아둘 점: HNSW 인덱스 빌드는 **동기(synchronous)**로 동작해요. 인덱스 생성이 끝날 때까지 PostgreSQL이 해당 테이블에 대한 write를 차단해요. 10만 건 이하에서는 몇 초면 끝나요. 수백만 건이라면 빌드 타이밍을 계획해야 해요.

## 확장 가능한 Schema 설계

embedding은 메인 콘텐츠 테이블에 vector column을 추가하는 것보다 **별도의 테이블**에 저장하는 게 좋아요. 768차원 embedding 하나가 `768 x 4 = 3,072 bytes`를 차지해요. `articles` 테이블에 자주 쿼리하는 column이 10개 있다면, `SELECT *`를 할 때마다 거의 쓸 일 없는 3KB embedding 데이터를 함께 끌고 오게 돼요.

```sql
CREATE TABLE article_embeddings (
  id          BIGINT PRIMARY KEY REFERENCES articles(id),
  embedding   vector(768) NOT NULL,
  content_hash TEXT NOT NULL  -- SHA256 of source content
);
```

`content_hash` column은 원본 텍스트의 SHA256 hash를 저장해요. re-embedding 전에 hash를 비교해서 콘텐츠가 변경되지 않았으면 API 호출을 건너뛰는 거예요. embedding 모델은 token당 과금되니까, 중복 제거가 시간이 지날수록 실질적인 비용 절감이 돼요.

trade-off는 조회 시 JOIN이 필요하다는 거예요. 하지만 실제로는 문제가 안 돼요. embedding 테이블에서 검색하고, 매칭되는 ID를 가져온 다음, 전체 콘텐츠를 fetch하면 돼요. JOIN 비용은 메인 테이블을 건드리는 다른 모든 쿼리에서 아끼는 것에 비하면 무시할 수 있는 수준이에요.

## pgvector를 선택해야 할 때

데이터셋이 10만 건 이하이고 이미 PostgreSQL을 쓰고 있다면 pgvector를 선택하면 돼요. 인프라 추가 없이 vector search를 얻을 수 있고, embedding이 transaction과 backup에 함께 참여하며, 하나의 쿼리에서 relational data와 JOIN할 수 있어요.

GCP를 쓰고 있다면, **Cloud SQL이 pgvector를 기본 지원**해요 — 직접 extension을 관리할 필요가 없어요.

수백만 건의 vector를 sub-millisecond latency로 검색해야 하거나, relational 요소 없이 순수 vector search만 하는 워크로드라면 pgvector는 넘어가세요. 그 규모에서는 전용 vector database가 제 몫을 해요.

그 외 나머지 경우에는, 이미 가지고 있는 database가 가장 좋은 선택이에요.
