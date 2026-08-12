---
title: Gemini 비대칭 Embedding 활용하기
description: >-
  Query와 document를 다르게 인코딩하면 검색 품질이 좋아져요. Gemini는 이걸 task_type 파라미터로 표현했고, 새 모델에서는 같은 아이디어가 prompt 안으로 옮겨갔어요.
date: 2026-03-23T00:00:00.000Z
updated: '2026-08-12'
tags:
  - ai-ml
  - embeddings
  - google
category: ai-ml
draft: false
lang: ko
source_lang: en
source_slug: gemini-asymmetric-embeddings
source_updated: '2026-08-12'
translation_date: '2026-08-12'
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
source_content_hash: cdf388f2797e34254605b4ccfba94741e7b21aba28840caa8d4b748858ff1390
---

RAG 파이프라인을 만들고 있었는데 검색 품질이 영 별로였어요. "데이터베이스 마이그레이션 어떻게 처리하지?"라고 물으면 정확히 답이 되는 document 대신 관련성이 애매한 것들만 돌아왔어요. Query든 document든 똑같은 방식으로 호출 한 번에 아무 구분 없이 embedding하고 있었는데 그게 병목이었어요.

양쪽을 다르게 인코딩하니까 해결됐어요. 어떻게 동작하는지, 그리고 제가 처음에 잘못 적었던 부분까지 같이 정리해볼게요.

먼저 모델 이야기부터요. 이 판이 꽤 바뀌었어요. 처음엔 `text-embedding-004`로 붙였는데 이 모델은 Google의 양쪽 surface 모두에서 정리되는 중이에요. Gemini API에서는 [2026년 1월에 종료됐고](https://ai.google.dev/gemini-api/docs/deprecations), Vertex AI 문서에는 2027-04-01 retirement로 올라가 있어요. 그래서 아래 코드는 같은 `task_type` 메커니즘을 이어받은 `gemini-embedding-001` 기준이에요. Vertex 기준 이 모델의 retirement 날짜는 "No sooner than May 20, 2028"이고요. 그런데 두 surface가 각자 다른 일정표를 써요. 같은 모델인데 Gemini API 쪽에는 2028-05-14 종료로 올라가 있어요. 그러니까 먼저 눈에 띈 날짜 말고, 실제로 호출하는 surface의 날짜를 확인하세요.

지금 최신 모델은 2026-04-22에 GA된 `gemini-embedding-2`인데 이 모델은 `task_type`을 아예 받지 않아요. Task 지시가 prompt 안으로 들어갔거든요. 두 방식 다 아래에서 다루지만 어느 쪽을 고르든 model lifecycle 문서를 먼저 확인하세요. 이 판은 블로그 글이 따라잡기 어려울 만큼 빨리 바뀌어요.

## Symmetric vs. Asymmetric 인코딩

Symmetric 인코딩은 텍스트가 어떤 역할을 하든 같은 vector를 만들어요. 모델 입장에서는 "마이그레이션 처리 방법"이라는 짧은 질문이나 Alembic 마이그레이션에 대한 500단어짜리 가이드나 같은 종류의 입력이고 같은 공간에서 같은 최적화를 받아요.

Asymmetric 인코딩은 그 전제를 깨요. Query는 정보를 찾기 위한 짧은 질문이고 document는 그 답을 담고 있는 긴 텍스트잖아요. 각각을 역할에 맞게 인코딩하면 query가 vector space에서 자연스럽게 매칭되는 document를 "가리키게" 돼요.

Google의 task type 문서가 이 문제를 구체적으로 설명해요. "Why is the sky blue?"와 "The scattering of sunlight causes the blue color"는 문장 자체로는 "distinctly different meanings as statements"라서 일반적인 similarity search로는 둘의 관계를 자동으로 잡아내지 못해요. 같은 페이지가 use case를 **asymmetric format**(search, question answering, fact checking, code retrieval)과 **symmetric format**(classification, clustering, semantic similarity)으로 나눠놨어요. 이 구분은 특정 벤더의 기능이 아니라 use case 자체의 성격이에요.

## task_type 파라미터

`gemini-embedding-001`에서는 이 구분이 API 필드예요.

| task_type            | Purpose                                | Optimized For         |
| -------------------- | -------------------------------------- | --------------------- |
| `RETRIEVAL_QUERY`    | Encode a search query                  | Short text, questions |
| `RETRIEVAL_DOCUMENT` | Encode a document for the search index | Long text, passages   |

같은 텍스트라도 `RETRIEVAL_QUERY`로 embedding할 때와 `RETRIEVAL_DOCUMENT`로 embedding할 때 **다른 vector**가 나와요. 그게 핵심이에요. 검색 문제의 양쪽이 각각 자기 표현을 갖는 거죠. Vertex API reference는 `task_type`을 "left blank"로 두면 "the default used is `RETRIEVAL_QUERY`"라고 분명히 적어놨는데 이건 corpus 입장에서는 반대편 값이에요. 그래서 인덱싱 호출에서 절대 빼먹으면 안 돼요.

인덱싱할 때는 document를 `RETRIEVAL_DOCUMENT`로, 검색할 때는 질문을 `RETRIEVAL_QUERY`로 embedding하면 돼요.

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

인덱싱 루프를 짜기 전에 알아둘 제약이 세 가지 있어요. Vertex AI에서 `gemini-embedding-001` 요청은 "can only include a single input text"라서 배치를 얼마나 묶을 수 있는지는 어떤 API surface를 쓰느냐에 달려 있어요. 입력 텍스트 하나당 2,048 토큰 제한이 있고 `autoTruncate` 기본값이 `true`라서 너무 긴 chunk를 조용히 자르는 대신 에러로 알고 싶다면 `false`로 두면 돼요. 그리고 `output_dimensionality`로 vector를 줄이면 정규화는 직접 해야 해요. 이 모델은 3,072차원 전체 출력만 normalized 상태로 돌아오거든요.

## 새 모델에서 바뀐 것

`gemini-embedding-2`는 asymmetric 성질은 그대로 두고 파라미터만 없앴어요. 문서가 명확해요. "You cannot use the `task_type` field to specify an embedding task for the `gemini-embedding-2` model. Instead, include the task as an instruction in your prompt." 문서에 나온 retrieval 포맷은 양쪽에 붙이는 prefix예요.

```python
# gemini-embedding-2: the task lives in the text
def prepare_query(query):
    return f"task: search result | query: {query}"

def prepare_document(content, title="none"):
    return f"title: {title} | text: {content}"
```

Asymmetric이라는 본질은 같고 표현 위치만 달라진 거예요. 새 모델은 입력 한도가 8,192 토큰으로 늘었고 텍스트만이 아니라 멀티모달 입력도 받아요. 출력도 "already L2 normalized for non-default dimensions (unlike `gemini-embedding-001`)"이라서 위에서 말한 수동 정규화 단계가 사라져요. 지금 새로 파이프라인을 시작한다면 이쪽이 맞고 `task_type`은 이미 `gemini-embedding-001`로 만들어둔 인덱스를 유지할 때 쓰는 방식이에요.

인덱싱 루프를 그대로 옮기기 전에 배치 동작 차이 하나는 꼭 확인하세요. Gemini API 쪽 [embeddings 가이드](https://ai.google.dev/gemini-api/docs/embeddings)를 보면 `gemini-embedding-001`은 문자열 리스트를 넣으면 각각의 embedding을 돌려주는데, `gemini-embedding-2`는 "produces a single aggregated embedding for multiple inputs"라서 여러 개를 한 번에 만들려면 Batch API를 쓰라고 안내해요. 리스트를 넣고 리스트를 받던 루프를 그대로 두면 배치 하나가 조용히 vector 하나로 뭉개져요.

두 API에 똑같이 적용되는 교훈은 하나예요. 규칙을 정했으면 일관되게 쓰세요. 문서도 task를 양쪽에 똑같이 적용해야 한다고 분명히 말해요. Document를 어떤 task 포맷으로 embedding했다면 query도 같은 포맷을 따라야 해요. 인덱스 쪽과 query 쪽 규칙이 어긋나면 이 메커니즘이 없애려던 그 불일치가 그대로 돌아와요.

## Symmetric 포맷이 여전히 맞는 곳

Symmetric 포맷은 입력이 한 종류인 use case용이에요. Classification과 clustering, 중복 제거, 텍스트 유사도 점수처럼 비교 대상 양쪽이 같은 성격의 콘텐츠일 때요. Google 문서는 `SEMANTIC_SIMILARITY`를 두고 "not intended for retrieval use cases"라고 못 박아뒀고 `gemini-embedding-2` 표에서도 대응되는 `task: sentence similarity` prefix에 같은 경고를 반복해요.

검색은 asymmetric 쪽이에요. 세 단어짜리 query와 세 문단짜리 답변은 역할이 다르고 둘을 동일하게 인코딩하면 모델이 두 목표 사이에서 타협할 수밖에 없어요.

## 정정: nomic-embed-text는 symmetric이 아니에요

처음 이 글을 쓸 때 저는 Ollama의 **nomic-embed-text**를 "symmetric"으로 분류하고 asymmetric은 Gemini가 더해준 기능인 것처럼 썼어요. 그건 틀렸어요. 모델 카드가 직접 반박해요.

`nomic-embed-text-v1.5` 카드는 "the text prompt _must_ include a _task instruction prefix_, instructing the model which task is being performed"라고 명시해요. 질문에는 `search_query:`, corpus 텍스트에는 `search_document:`를 붙이는 거죠. Gemini의 task_type과 완전히 같은 query/document 구분인데 API 필드 대신 텍스트 prefix로 표현했을 뿐이에요. 그리고 그건 Gemini 새 모델이 택한 방식과 정확히 같아요.

그러니까 "symmetric 모델이라서 asymmetric API가 필요하다"는 진단 자체가 문제를 잘못 짚은 거였어요. 모델이 asymmetric이어도 symmetric하게 쓸 수 있어요. Prefix 없이 양쪽을 똑같이 인코딩하면요. 그리고 그러면 제가 처음에 겪은 그 애매한 검색 품질이 그대로 나와요. 모델 카드를 읽는 쪽이 provider를 갈아타는 것보다 품이 훨씬 덜 들어요. 검색 품질이 안 나온다면, API가 발목을 잡는다고 결론 내리기 전에 지금 쓰는 모델이 무엇을 요구하는지부터 확인해보세요.

## 모델 간 전환

먼저 차원이에요. `nomic-embed-text-v1.5`는 **768차원 vector**를 만들고 Matryoshka 방식으로 512, 256, 128, 64까지 잘라 쓸 수 있어요. `gemini-embedding-001`은 기본이 **3,072차원**이고 `output_dimensionality`로 더 작은 vector를 요청할 수 있어서 기존 768 컬럼과 인덱스를 그대로 두고 갈 수 있어요. 대신 돌아온 값을 직접 정규화해야 해요.

그래도 **모든 document를 다시 embedding**하는 건 피할 수 없어요. 차원이 같아도 다른 모델에서 나온 vector끼리는 비교할 수 없어요. 숫자들이 공간의 다른 영역을 차지해서 둘 사이의 cosine similarity는 의미가 없거든요. `gemini-embedding-001`과 `gemini-embedding-2` 사이에서도 마찬가지예요.

그래서 전환 작업 자체는 대체로 기계적이에요. Embedding 호출을 바꾸고, query/document 구분을 새 모델이 원하는 형태로 옮기고, 스토리지에 맞는 차원을 고르고, corpus를 다시 embedding하면 끝이에요. 나머지(pgvector 테이블, HNSW 인덱스, 검색 로직)는 그대로 둬도 돼요.

## 호스팅 API는 언제 쓸까

모델 업그레이드를 남에게 맡기고 싶고 chunk마다 네트워크 왕복 비용을 감당할 수 있다면 호스팅 embedding API가 편해요.

**오프라인 환경**이 필요하거나 외부 API 호출이 불가능한 폐쇄망이라면 로컬 모델을 돌리는 게 맞고요. 이 선택은 연산을 어디서 돌리고 비용을 누가 내느냐의 문제지, symmetric이냐 asymmetric이냐의 문제가 아니에요. 양쪽 다 asymmetric 구분을 지원해요. 우리가 제대로 해야 하는 건 그걸 실제로 쓰는 일이에요.
