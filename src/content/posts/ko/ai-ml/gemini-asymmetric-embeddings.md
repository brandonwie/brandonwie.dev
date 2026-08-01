---
title: Gemini 비대칭 Embedding 활용하기
description: >-
  Gemini embedding API의 task_type은 query와 document를 다르게 인코딩해줘서, symmetric embedding보다 검색 품질이 확실히 좋아져요.
date: 2026-03-23T00:00:00.000Z
updated: '2026-08-02'
tags:
  - ai-ml
  - embeddings
  - google
category: ai-ml
draft: false
lang: ko
source_lang: en
source_slug: gemini-asymmetric-embeddings
source_updated: '2026-08-02'
translation_date: '2026-08-02'
source_content_hash: cdf388f2797e34254605b4ccfba94741e7b21aba28840caa8d4b748858ff1390
---

RAG 파이프라인을 만들고 있었는데 검색 품질이 영 별로였어요. "데이터베이스 마이그레이션 어떻게 처리하지?"라고 질문하면, 정확히 답이 되는 문서 대신 관련성이 애매한 문서들만 반환되더라고요. 원인을 찾아보니, query와 document 모두 같은 방식으로 인코딩하는 symmetric embedding을 쓰고 있었던 게 병목이었어요.

Gemini의 task type 기반 embedding으로 바꾸니까 해결됐어요. 처음엔 `text-embedding-004`로 붙였는데 그 모델은 이제 Google이 종료했고, 같은 `task_type` 메커니즘은 `gemini-embedding-001`이 이어받았어요. 아래 코드도 이 모델 기준이에요. 어떻게, 그리고 왜 그런지 정리해볼게요.

## Symmetric vs. Asymmetric Embedding

대부분의 embedding 모델은 **symmetric** 방식이에요. 짧은 query든 긴 document든 상관없이 같은 방식으로 vector를 생성해요. 모델 입장에서는 "마이그레이션 처리 방법"이라는 짧은 질문이나 Alembic 마이그레이션에 대한 500단어짜리 가이드나 같은 종류의 텍스트로 취급하는 거예요. 둘 다 같은 vector space에 같은 최적화 방식으로 인코딩돼요.

**Asymmetric embedding**은 이런 전제를 깨요. Query와 document는 근본적으로 다르다는 걸 인식하는 거죠. Query는 정보를 찾기 위한 짧은 질문이고, document는 그 답을 담고 있는 긴 텍스트잖아요. 모델이 각각을 다르게 인코딩해서, query가 vector space에서 자연스럽게 매칭되는 document를 "가리키도록" 만들어줘요.

Google의 task type 문서가 이 문제를 아주 구체적으로 설명해요. "Why is the sky blue?"와 "The scattering of sunlight causes the blue color"는 *문장 자체로는* 의미적으로 유사하지 않아요. 그래서 일반적인 similarity search로는 둘의 관계를 잡아내지 못해요. Task type은 모델을 따로 fine-tuning하거나 query expansion을 얹지 않고도 질문과 답을 같은 공간으로 끌어당겨줘요.

Gemini는 이걸 `task_type` 파라미터로 구현해요:

| task_type            | Purpose                                | Optimized For         |
| -------------------- | -------------------------------------- | --------------------- |
| `RETRIEVAL_QUERY`    | Encode a search query                  | Short text, questions |
| `RETRIEVAL_DOCUMENT` | Encode a document for the search index | Long text, passages   |

같은 텍스트를 `RETRIEVAL_QUERY`로 embedding했을 때와 `RETRIEVAL_DOCUMENT`로 embedding했을 때 **다른 vector**가 나와요. 이건 의도된 동작이에요. 검색 문제의 양쪽 면(질문 vs 답)이 각각 최적화된 표현을 갖게 되는 거죠. `task_type`을 비워두면 기본값이 `RETRIEVAL_QUERY`라서, corpus 쪽에는 반대편 값이 들어가버려요. 그래서 인덱싱 호출에서 절대 빼먹으면 안 돼요.

## 사용 방법

인덱싱할 때는 모든 document를 `RETRIEVAL_DOCUMENT`로 embedding하고, 검색할 때는 사용자의 질문을 `RETRIEVAL_QUERY`로 embedding하면 돼요. 나머지는 API가 알아서 처리해줘요.

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

인덱싱 루프를 짜기 전에 알아두면 좋은 제약이 두 가지 있어요. Vertex AI에서는 `gemini-embedding-001` 요청 하나에 입력 텍스트를 하나만 넣을 수 있어서, 배치 처리 가능 여부가 어떤 API surface를 쓰느냐에 따라 달라져요. 그리고 입력 텍스트 하나당 2,048 토큰 제한이 있고, 기본적으로 초과분은 조용히 잘려요. 너무 긴 chunk를 조용히 자르는 대신 에러로 알고 싶다면 `autoTruncate`를 `false`로 두면 돼요.

`task_type` 위에 뭔가를 쌓기 전에 하나만 더 확인하세요. Google task type 문서에 어떤 모델이 이 파라미터를 지원하는지 목록이 있어요. 최신 embedding 모델들은 파라미터 대신 텍스트 앞에 task를 접두어로 적는 방식으로 옮겨가고 있어서, 모델을 고를 때마다 목록을 다시 보는 게 좋아요.

## 왜 Symmetric으로는 부족한가

Symmetric 모델은 **document 간 유사도** 비교에 잘 맞아요. 비슷한 글 찾기, 클러스터링, 중복 제거처럼 비교 대상 양쪽이 같은 타입의 콘텐츠일 때 symmetric encoding이 합리적이에요. Gemini에도 딱 그 용도의 `SEMANTIC_SIMILARITY` task type이 있는데, 문서에서 검색용으로는 쓰지 말라고 분명하게 못 박아뒀어요.

하지만 검색은 본질적으로 asymmetric해요. 세 단어짜리 query와 세 문단짜리 답변은 완전히 다른 역할을 하거든요. 이 둘을 동일하게 인코딩하면 모델이 두 가지 목표 사이에서 타협할 수밖에 없어요. Asymmetric embedding은 그 타협 자체를 없애버려요.

## Ollama(또는 다른 Symmetric 모델)에서 전환하기

Ollama의 **nomic-embed-text** 같은 로컬 모델을 쓰다가 Gemini로 옮기려면 차원부터 확인해야 해요. nomic-embed-text는 **768차원 vector**를 만들고, `gemini-embedding-001`은 기본값이 **3,072차원**이에요. 대신 `output_dimensionality` 파라미터로 더 작은 vector를 요청할 수 있어서, 기존 768 컬럼과 인덱스를 그대로 두고 갈 수 있어요.

다만 **모든 document를 다시 embedding**하는 건 피할 수 없어요. 차원이 같더라도 다른 모델에서 생성한 vector끼리는 비교할 수 없어요. 숫자들이 vector space의 다른 영역을 차지해서, 둘 사이의 cosine similarity는 의미가 없어요.

그래서 전환 작업 자체는 대체로 기계적이에요. Embedding 호출을 바꾸고, 스토리지에 맞는 차원을 고르고, corpus를 다시 embedding하면 끝이에요. 나머지 — pgvector 테이블, HNSW 인덱스, 검색 로직 — 는 그대로 둬도 돼요.

## 언제 쓰면 좋을까

검색 품질이 중요하고 chunk마다 API 왕복 비용을 감수할 수 있는 **search나 RAG 시스템**을 만들 때 asymmetric embedding이 잘 맞아요.

**오프라인 환경**이 필요하거나, document 간 유사도 비교가 목적이거나, 외부 API 호출이 불가능한 폐쇄망 환경이라면 nomic-embed-text via Ollama 같은 symmetric 로컬 모델을 유지하는 게 맞아요.
