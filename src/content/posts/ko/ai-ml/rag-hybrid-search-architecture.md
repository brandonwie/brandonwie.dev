---
title: RAG Hybrid Search 아키텍처
description: 단일 검색 방식이 왜 실패하는지, 그리고 dense, sparse, fuzzy, managed search를 Reciprocal Rank Fusion으로 결합해서 시맨틱 이해와 키워드 정확도를 모두 잡는 검색 파이프라인을 만드는 방법.
date: 2026-03-23T00:00:00.000Z
updated: '2026-08-02'
tags:
  - ai-ml
  - rag
  - search
  - architecture
category: ai-ml
draft: false
lang: ko
source_lang: en
source_slug: rag-hybrid-search-architecture
source_updated: '2026-08-02'
translation_date: '2026-03-24'
source_content_hash: b810baeb1c6d126cff7c1759ae3585731cd67162eeabfb6fec97e6d33572a503
---

RAG 파이프라인을 만들면서 계속 같은 문제에 부딪혔어요. Vector search가 의미적으로 관련된 문서는 찾아내는데, 사용자가 입력한 정확한 키워드가 포함된 문서는 놓치는 거예요. "kubernetes deployment YAML"을 검색하면 컨테이너 오케스트레이션 개념에 대한 글이 나오는데 — 관련은 있지만, 사용자가 원하는 건 그 특정 YAML 레퍼런스였거든요. Keyword search는 반대 문제를 가지고 있었고요. 둘 다 필요했고, 이 둘이 함께 동작해야 했어요.

## 단일 검색 방식의 근본적인 문제

Vector search (dense retrieval)는 텍스트를 고차원 embedding으로 인코딩하고 cosine similarity로 문서를 찾아요. "dogs"와 "puppies"가 관련 있다는 걸 이해하죠. 하지만 정확한 매칭에서는 실패할 수 있어요 — "kubernetes"로 쿼리해도 주변 컨텍스트가 벡터를 밀어내면 "kubernetes"가 포함된 문서가 상위에 안 나올 수 있거든요.

Keyword search (sparse retrieval)는 정반대예요. BM25 같은 알고리즘은 정확한 용어 매칭에 강해요. "kubernetes"를 검색하면 그 단어가 포함된 모든 문서가 나오고, term frequency로 랭킹돼요. 하지만 "container orchestration platform"으로 검색하면 그 정확한 단어가 없는 이상 아무것도 안 나와요.

어느 한 방식만으로는 두 케이스를 다 커버할 수 없어요. Hybrid search는 각 방식의 랭킹 결과를 결합해서, 여러 검색 리스트에 동시에 등장하는 문서를 상위로 올려줘요.

## 4개의 컴포넌트

이 아키텍처는 배포 환경에 따라 나뉜 4개의 검색 방식을 사용해요:

| Component | Type | Where It Runs | Why |
|-----------|------|---------------|-----|
| **pgvector** | Dense (semantic) | PostgreSQL | Accessible from any service via SQL |
| **rank_bm25** | Sparse (keyword) | Python Worker | In-memory index needs persistent state |
| **Typesense Cloud** | Keyword + typo tolerance | SaaS API | Stateless, handles cold starts |
| **pg_trgm** | Fuzzy fallback | PostgreSQL | Catches typos when sparse returns fewer than 2 results |

BM25와 Typesense를 나눈 건 선호의 문제가 아니라 배포 환경의 제약 때문이에요. `rank_bm25` 라이브러리의 BM25는 in-memory 인덱스를 만드는데, Cloud Run이 cold start할 때마다 이 인덱스가 날아가요. 오래 실행되는 worker 프로세스는 이 인덱스를 유지할 수 있지만, stateless API 엔드포인트는 불가능하죠. Typesense Cloud는 managed 서비스라서 컨테이너 수명 주기와 상관없이 항상 사용 가능해요.

## 두 개의 Read 경로, 하나의 Dense 코어

두 경로 모두 pgvector로 semantic search를 시작하고, sparse 쪽에서 갈라져요:

**RAG 경로 (Worker):** pgvector + BM25 결과를 RRF fusion에 넣어서 LLM context injection용 상위 3개 문서를 뽑아요. Context injection은 try/except로 감싸져 있어서 — 검색이 실패해도 LLM은 여전히 응답해요. 근거가 없어질 뿐 크래시하지는 않아요.

**사용자 검색 경로 (API):** pgvector + Typesense 결과를 RRF fusion에 넣어서 검색 UI에 상위 10개 결과를 반환해요. Typesense는 BM25에 없는 내장 typo tolerance를 제공하는데, 이건 RAG 컨텍스트보다 사용자 대면 검색에서 더 중요해요.

## RRF Fusion의 동작 원리

Reciprocal Rank Fusion (RRF)은 서로 다른 검색 방식에서 나온 랭킹 리스트를 하나의 랭킹으로 합쳐요. 각 문서에 대한 공식은 이래요:

```
RRF_score = Σ (1 / (k + rank_i))
```

여기서 `k`는 상수(보통 60)이고 `rank_i`는 각 검색 리스트에서 해당 문서의 순위예요. Vector search에서 1위이고 BM25에서 3위인 문서의 결합 점수는 `1/61 + 1/63 = 0.0323`이에요. 한 리스트에서만 1위인 문서는 `1/61 = 0.0164`가 되고요.

핵심 인사이트는 이거예요: 여러 리스트에 동시에 등장하는 문서가 한 리스트에만 있는 문서보다 항상 높은 점수를 받아요. 이렇게 시맨틱과 키워드 기준을 동시에 만족하는 결과가 자연스럽게 상위로 올라가요.

## Write 경로

노트가 COMPLETED 상태에 도달하면 세 가지가 일어나요:

1. **Embedding 생성** — embedding API를 통해 콘텐츠를 임베딩하는데, 콘텐츠의 SHA256 해시가 저장된 해시와 다를 때만 실행돼요. 변경되지 않은 문서를 다시 임베딩하는 걸 방지하는 거죠.
2. **Search index 동기화** — 문서를 Typesense에 푸시하고 BM25 인덱스를 리빌드 대상으로 표시해요.
3. **tsvector 트리거** — PostgreSQL 트리거가 pg_trgm fuzzy matching용 `tsvector` 컬럼을 업데이트해요.

SHA256 중복 체크는 보기보다 중요해요. Embedding API 호출은 비용과 시간이 들거든요. 500개 문서를 다시 동기화하는데 3개만 변경됐다면, 500개가 아니라 3개만 임베딩하고 싶잖아요.

## 겪었던 함정들

**BM25는 점진적 업데이트가 안 돼요.** `rank_bm25` 라이브러리는 문서가 변경되면 전체 인덱스를 처음부터 다시 만들어야 해요. 몇백 개 문서 정도는 밀리초 단위로 끝나지만, worker가 변경 시 리빌드 전략을 써야 한다는 뜻이에요. insert-in-place는 안 돼요.

**pgvector는 similarity가 아니라 distance를 반환해요.** Cosine distance 연산자(`<=>`)는 0이 동일, 2가 반대를 의미하는 값을 반환해요. RRF 스코어링에는 similarity(1이 동일)가 필요하므로 `1 - distance`로 변환해야 해요. 이걸 틀리면 랭킹이 뒤집혀요.

**Cold start가 아키텍처 분리를 강제했어요.** 처음 설계에서는 BM25를 전부 썼었어요. 첫 Cloud Run cold start에서 요청 중간에 in-memory 인덱스가 날아가면서 sparse 결과가 0개 나왔어요. 그 단일 장애 모드가 BM25/Typesense 분리를 이끌었고, 이게 파이프라인에서 가장 영향력 있는 아키텍처 결정이었어요.

## 이 아키텍처가 적합한 경우

이 수준의 복잡도가 정당화되려면 1,000개 이상의 문서가 있고 시맨틱 이해와 키워드 정확도가 모두 필요한 상황이어야 해요. RAG 파이프라인의 경우 특히 컨텍스트 품질이 LLM 응답 품질에 직접 영향을 미치기 때문에, 검색 레이어에 투자할 가치가 있어요.

소규모 컬렉션(1,000개 미만)이라면 pgvector 쿼리 하나에 키워드 필터만 달아도 80%는 커버돼요. 10ms 미만 지연시간이 필요한 실시간 검색에서는 RRF가 여러 검색을 실행하고 결과를 합치는 오버헤드가 너무 커요. 그리고 Elasticsearch나 Algolia 같은 managed 서비스가 이미 필요를 충족한다면, 굳이 이걸 직접 만들 이유가 없어요.

## 핵심 정리

Hybrid search는 최고의 검색 방식을 고르는 게 아니에요 — 어떤 단일 방식도 모든 쿼리 유형을 커버하지 못한다는 걸 인정하는 거예요. Dense search는 시맨틱을, sparse search는 키워드를, fuzzy search는 오타를 처리하고, RRF가 이것들을 개별 컴포넌트보다 뛰어난 하나의 랭킹으로 합쳐줘요. 배포 환경이 어떤 sparse 방식을 쓸지 결정하지만(stateful worker에서는 in-memory BM25, stateless API에서는 managed Typesense), fusion 패턴 자체는 동일해요.
