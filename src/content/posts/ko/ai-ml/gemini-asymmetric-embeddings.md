---
title: Gemini 비대칭 Embedding 활용하기
description: >-
  Gemini text-embedding-004는 task_type을 통해 query와 document를 다르게 인코딩하는 asymmetric embedding을 지원하며, symmetric 모델보다 훨씬 나은 검색 결과를 만들어줘요.
date: 2026-03-23T00:00:00.000Z
updated: '2026-03-24'
tags:
  - ai-ml
  - embeddings
  - google
category: ai-ml
draft: false
lang: ko
source_lang: en
source_slug: gemini-asymmetric-embeddings
source_updated: '2026-03-24'
translation_date: '2026-03-24'
source_content_hash: cdf388f2797e34254605b4ccfba94741e7b21aba28840caa8d4b748858ff1390
---

RAG 파이프라인을 만들고 있었는데 검색 품질이 영 별로였어요. "데이터베이스 마이그레이션 어떻게 처리하지?"라고 질문하면, 정확히 답이 되는 문서 대신 관련성이 애매한 문서들만 반환되더라고요. 원인을 찾아보니, query와 document 모두 같은 방식으로 인코딩하는 symmetric embedding을 쓰고 있었던 게 병목이었어요.

Gemini의 **text-embedding-004**에서 asymmetric task type을 적용하니까 문제가 해결됐어요. 어떻게, 그리고 왜 그런지 정리해볼게요.

## Symmetric vs. Asymmetric Embedding

대부분의 embedding 모델은 **symmetric** 방식이에요. 짧은 query든 긴 document든 상관없이 같은 방식으로 vector를 생성해요. 모델 입장에서는 "마이그레이션 처리 방법"이라는 짧은 질문이나 Alembic 마이그레이션에 대한 500단어짜리 가이드나 같은 종류의 텍스트로 취급하는 거예요. 둘 다 같은 vector space에 같은 최적화 방식으로 인코딩돼요.

**Asymmetric embedding**은 이런 전제를 깨요. Query와 document는 근본적으로 다르다는 걸 인식하는 거죠. Query는 정보를 찾기 위한 짧은 질문이고, document는 그 답을 담고 있는 긴 텍스트잖아요. 모델이 각각을 다르게 인코딩해서, query가 vector space에서 자연스럽게 매칭되는 document를 "가리키도록" 만들어줘요.

Gemini의 text-embedding-004는 이걸 `task_type` 파라미터로 구현해요:

| task_type            | Purpose                                   | Optimized For         |
| -------------------- | ----------------------------------------- | --------------------- |
| `RETRIEVAL_QUERY`    | Encode a search query                     | Short text, questions |
| `RETRIEVAL_DOCUMENT` | Encode a document for the search index    | Long text, passages   |

같은 텍스트를 `RETRIEVAL_QUERY`로 embedding했을 때와 `RETRIEVAL_DOCUMENT`로 embedding했을 때 **다른 vector**가 나와요. 이건 의도된 동작이에요. 검색 문제의 양쪽 면(질문 vs 답)이 각각 최적화된 표현을 갖게 되는 거죠.

## 사용 방법

인덱싱할 때는 모든 document를 `RETRIEVAL_DOCUMENT`로 embedding하고, 검색할 때는 사용자의 질문을 `RETRIEVAL_QUERY`로 embedding하면 돼요. 나머지는 API가 알아서 처리해줘요.

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

`embed_content` 호출 한 번에 **최대 100개 텍스트**를 배치로 처리할 수 있어서, 대량의 document를 인덱싱할 때 API 호출 횟수를 크게 줄일 수 있어요. 무료 티어에서 분당 1,500 요청까지 가능한데, 포트폴리오나 데모 수준의 워크로드에는 충분하고도 남아요.

## 왜 Symmetric으로는 부족한가

Symmetric 모델은 **document 간 유사도** 비교에 잘 맞아요. 비슷한 글 찾기, 클러스터링, 중복 제거처럼 비교 대상 양쪽이 같은 타입의 콘텐츠일 때 symmetric encoding이 합리적이에요.

하지만 검색은 본질적으로 asymmetric해요. 세 단어짜리 query와 세 문단짜리 답변은 완전히 다른 역할을 하거든요. 이 둘을 동일하게 인코딩하면 모델이 두 가지 목표 사이에서 타협할 수밖에 없어요. Asymmetric embedding은 그 타협 자체를 없애버려요.

## Ollama(또는 다른 Symmetric 모델)에서 전환하기

Ollama의 **nomic-embed-text** 같은 로컬 모델을 쓰다가 Gemini로 전환하려는 경우, 마이그레이션이 간단해요. 둘 다 **768차원 vector**를 생성하기 때문에 vector store의 스키마와 인덱스를 바꿀 필요가 없어요. 스토리지 구조의 재인덱싱이 필요 없다는 뜻이에요.

다만, 새 모델로 **모든 document를 다시 embedding**해야 해요. 차원이 같더라도 다른 모델에서 생성한 vector끼리는 비교할 수 없어요. 숫자들이 vector space의 다른 영역을 차지하기 때문이에요.

그래서 Gemini는 깔끔한 업그레이드 경로가 돼요. Embedding 호출만 바꾸고 corpus를 다시 embedding하면 되고, 나머지 — pgvector 테이블, HNSW 인덱스, 검색 로직 — 는 그대로 유지할 수 있어요.

## 언제 쓰면 좋을까

검색 품질이 중요한 **search나 RAG 시스템**을 구축할 때 Gemini asymmetric embedding을 쓰면 좋아요. 무료 티어로 대부분의 사이드 프로젝트와 데모를 비용 없이 커버할 수 있어요.

**오프라인 환경**이 필요하거나, document 간 유사도 비교가 목적이거나, 외부 API 호출이 불가능한 폐쇄망 환경이라면 nomic-embed-text via Ollama 같은 symmetric embedding을 유지하는 게 맞아요.
