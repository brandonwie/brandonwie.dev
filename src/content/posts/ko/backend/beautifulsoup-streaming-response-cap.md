---
title: "BeautifulSoup + lxml memory overhead: scraper에 크기 제한이 필요한 이유"
description: httpx로 페이지를 받아 BeautifulSoup에 넘기는 scraper는 OOM 위험을 안고 있어요. 파싱한 DOM tree가 원본 HTML보다 훨씬 많은 메모리를 쓰기 때문이에요. streaming과 두 겹의 크기 거부로 정리한 과정이에요.
date: 2026-04-15T00:00:00.000Z
updated: "2026-08-12"
tags:
  - backend
  - python
  - scraping
  - beautifulsoup
  - lxml
  - httpx
  - memory
  - streaming
category: backend
draft: false
lang: ko
source_lang: en
source_slug: beautifulsoup-streaming-response-cap
source_updated: "2026-08-12"
translation_date: "2026-08-12"
references:
  - url: "https://www.python-httpx.org/quickstart/#streaming-responses"
    title: "Streaming Responses — HTTPX quickstart"
    type: official
  - url: "https://www.python-httpx.org/async/#streaming-responses"
    title: "Streaming responses (async) — HTTPX"
    type: official
  - url: "https://www.crummy.com/software/BeautifulSoup/bs4/doc/#installing-a-parser"
    title: "Installing a parser — Beautiful Soup documentation"
    type: official
  - url: "https://lxml.de/performance.html"
    title: "Benchmarks and Speed — lxml"
    type: official
  - url: "https://www.rfc-editor.org/rfc/rfc9110#field.content-length"
    title: "RFC 9110 §8.6 — Content-Length"
    type: official
  - url: "https://www.rfc-editor.org/rfc/rfc9112#name-message-body-length"
    title: "RFC 9112 §6.3 — Message Body Length"
    type: official
---

제 사이드 프로젝트 crucio의 scraper는 처음에 제가 읽은 tutorial들과 똑같은
모양이었어요.

```python
with httpx.Client(timeout=30, follow_redirects=True) as client:
    response = client.get(url, headers={...})
    response.raise_for_status()

soup = BeautifulSoup(response.text, "lxml")
# ... extract content ...
```

네 줄이고, 하는 일만 놓고 보면 맞는 코드예요. 동시에 OOM이 터질 수 있는
구조이기도 하고요. 저도 그렇게 보지 못하다가 이 환경의 메모리 압박이 실제 장애로
이어지고 나서야 알았어요. 게다가 죽은 프로세스는 파싱을 하던 쪽이 아니었어요.
엉뚱한 곳을 범인으로 지목했던 그 부분이 이번 일에서 제일 쓸모 있었는데, 아래에
따로 적어뒀어요.

## 바이트 크기는 메모리 크기가 아니에요

제가 잘못 알고 있던 건 HTML의 byte 수를 파싱에 드는 메모리의 대략적인 지표로 본
거예요. 전혀 비슷하지 않아요. 이 환경에서는 파싱된 결과물이 원본 HTML의 20~50배
정도였어요. 5 MB짜리 페이지가 Python heap에서 100~250 MB가 됐고, 20 MB짜리
페이지라면(JS가 무거운 single-page app을 통째로 뽑은 경우요) 500 MB에서 1 GB까지
갈 수도 있어요.

parser가 동작하는 방식에서 그냥 따라 나오는 결과예요. lxml은 전체 DOM tree를
만들기 때문에 모든 element가 자기 헤더를 가진 객체가 되고, text node마다 문자열
저장 공간이 중복되고, attribute dictionary도 element마다 비용을 더해요. 이 중
어느 것도 응답의 byte 수에는 드러나지 않아요.

저는 20~50배를 상수가 아니라 자릿수 감각으로 봐요. parser와 문서 모양, Python
버전에 따라 달라지거든요. lxml은 parser별 메모리 사용량까지 담은 자체 benchmark
수치를 공개하고 있으니, 저를 포함해서 누군가의 배수를 그대로 가져다 쓰기 전에 한
번 읽어볼 만해요. 이 숫자가 예산에 중요하다면 실제로 다루는 문서로 직접 재보는 게
맞고요.

## overhead를 장애로 만드는 두 가지 사실

overhead 자체는 버틸 만해요. 위험해지는 건 다른 두 가지 성질 때문이에요.

**기본 HTTP client는 body를 즉시 통째로 받아와요.** `requests.get(url)`,
`httpx.Client().get(url)`, `aiohttp.ClientSession().get(url)` 전부 응답
객체를 돌려주기 전에 body를 끝까지 다운로드해요. 크기를 잴 수 있는 무언가를 손에
쥐었을 때는 이미 비용을 다 치른 뒤예요. 이 라이브러리들에 streaming이 따로 있는
이유가 기본 동작이 streaming이 아니기 때문이고, HTTPX quickstart도 응답 body
전체를 한 번에 메모리에 올리지 않는 방법으로 streaming을 소개해요.

**`Content-Length`는 크기를 보장해주지 않아요.** RFC 9110은 이걸 representation
데이터의 길이로 정의하지만, 응답이 반드시 이 헤더를 실어야 하는 건 아니에요.
chunked transfer coding에서는 framing을 chunk 자체가 담당해서 `Content-Length`가
아예 없고, RFC 9112의 message body length 규칙이 그 경우를 정리하고 있어요.
서버가 `0`을 보낼 수도 있고, 악의를 가진 서버라면 작은 값을 알려주고 실제로는
기가바이트를 흘려보낼 수도 있어요. 헤더만 보고 만든 검사는 서버가 마음먹으면 그냥
빠져나갈 수 있는 검사예요.

여기에 메모리가 빠듯한 worker를 얹으면 큰 페이지 하나로 프로세스가 죽어요.
`mem_limit: 512m`을 건 Celery, 512 MB짜리 Cloud Run 서비스, request limit이 걸린
Kubernetes pod 같은 환경이요. 페이지가 악의적일 필요도 없어요. 기사로 분류된 PDF
URL이나, 카탈로그 전체를 문서 하나에 쏟아내는 사이트도 똑같은 결과를 만들어요.

## 크기 제한을 어디에 둘까

제한이 필요하다는 걸 받아들이고 나니 어디에 둘지가 문제가 됐어요. 후보들이 서로
바꿔 쓸 수 있는 게 아니더라고요.

| 제한을 두는 위치         | 잡아내는 것                                | 놓치는 것                                            |
| ------------------------ | ------------------------------------------ | ---------------------------------------------------- |
| `Content-Length` 헤더 검사 | 정직한 서버가 보내는 초과 body를 읽기 전에 | 헤더가 없는 chunked 응답, 크기를 줄여 말하는 서버    |
| 다운로드 후 크기 검사    | 의미 있는 건 없음                          | 핵심 전부. 메모리는 이미 할당된 뒤                   |
| streaming 중 byte 세기   | 헤더가 뭐라고 하든 모든 초과 body          | 정확성 쪽으로는 없음. streaming으로 재작성하는 비용  |
| 프로세스 메모리 제한     | 최악의 경우만, 마지막 안전망으로           | 죽는 방식으로 막음. 그게 원래 막으려던 결과          |

헤더 검사는 거의 공짜고, body가 한 byte라도 도착하기 전에 중단할 수 있는 유일한
층이에요. 대신 서버가 정직한 만큼만 믿을 수 있어요. byte 세기는 빠짐이 없지만 첫
chunk가 도착한 다음부터 지켜주기 시작하고요. 둘이 서로의 빈틈을 메워주기 때문에
제가 실제로 넣은 버전은 둘 다 써요. 프로세스 레벨 제한도 마지막 방어선으로 배포
설정에 남겨두긴 하는데, 이 층이 제한을 지키는 방법은 결국 worker를 죽이는
거예요. 애초에 피하려던 결과죠.

HTTPX 문서가 첫 번째 층을 직접 스케치해두기도 했어요. streaming 섹션에서 stream을
열고, `Content-Length`를 임계값과 비교하고, 들어맞을 때만 `read()`를 호출하는
예제를 보여줘요. 그 예제가 다루지 않는 건 헤더가 없거나 틀린 경우인데, 이번 일의
출발점이 정확히 그 경우였어요.

## 해결: 먼저 streaming, 거부는 두 번

```python
import logging
import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024  # 5 MB

class BeautifulSoupScraper:
    def __init__(
        self,
        timeout: int = 30,
        max_response_bytes: int = DEFAULT_MAX_RESPONSE_BYTES,
    ) -> None:
        self.timeout = timeout
        self.max_response_bytes = max_response_bytes

    def fetch_content(self, url: str) -> dict:
        # 초과 body가 메모리에 전부 올라오기 전에 거부할 수 있도록
        # 응답을 streaming으로 받아요.
        with httpx.stream(
            "GET",
            url,
            timeout=self.timeout,
            follow_redirects=True,
            headers={"User-Agent": "..."},
        ) as response:
            response.raise_for_status()

            # 빠른 경로 거부: Content-Length 헤더 (byte가 오기 전에 중단)
            content_length_hdr = response.headers.get("content-length")
            if (
                content_length_hdr is not None
                and content_length_hdr.isdigit()
                and int(content_length_hdr) > self.max_response_bytes
            ):
                return self._oversize_response(url, int(content_length_hdr))

            # 느린 경로 거부: byte 누적 (헤더가 없거나 거짓일 때)
            chunks: list[bytes] = []
            bytes_read = 0
            for chunk in response.iter_bytes():
                bytes_read += len(chunk)
                if bytes_read > self.max_response_bytes:
                    return self._oversize_response(url, bytes_read)
                chunks.append(chunk)

            body_bytes = b"".join(chunks)
            body_text = body_bytes.decode(
                response.encoding or "utf-8", errors="replace"
            )

        soup = BeautifulSoup(body_text, "lxml")
        # ... extract as usual ...

    def _oversize_response(self, url: str, observed_bytes: int) -> dict:
        logger.warning(
            "Rejecting oversize response from %s (observed=%d, cap=%d)",
            url, observed_bytes, self.max_response_bytes,
        )
        return {"url": url, "title": "", "content": "", "content_length": 0}
```

여기서 일하는 건 네 가지예요.

`httpx.stream()`이 `httpx.Client().get()`을 대신해요. body 다운로드를 미뤄서
chunk를 순회하기 전까지는 아무것도 받아오지 않아요. 나머지 검사가 가능해지는 게 이
변경 덕분인데, 기존 코드에 미치는 여파도 제일 커요. stream context 안에서는
`response.text`와 `response.content`를 쓸 수 없거든요.

거부는 두 겹이에요. 헤더 검사는 사실대로 말하는 서버를 담당하고, 누적 카운터는
그렇지 않은 서버를 담당해요. 하나만으로는 부족하고, 둘 다 돌려도 일반적인 경로에서
드는 비용은 dictionary 조회 한 번이에요.

크기를 넘기면 예외를 던지는 대신 빈 content를 돌려줘요. 호출하는 쪽은 "추출된 게
없다"를 이미 처리할 줄 알아서, 거부도 그 경로를 그대로 재사용해요. 모든 호출
지점이 새로 배워야 하는 예외 타입을 만들지 않아도 되고요. 의도한 trade-off였어요.
정상 경로는 깔끔하게 유지되는 대신, 거부가 예외를 던질 때보다 조용해져요.

거부할 때 warning을 남겨요. 조용한 경로를 타고 있다는 걸 알아채는 방법이
이것뿐이거든요. 이 로그가 없으면 사이트 개편 이후에 멀쩡한 페이지를 거부하기
시작한 제한이나 볼 게 없어서 아무것도 못 찾는 scraper나 겉보기엔 똑같아요.

## 왜 5 MB일까

이 숫자는 원칙에서 나온 게 아니라 경험에서 나왔어요. 정상적인 웹 페이지는
압도적으로 HTML 1 MB 아래라서, 5 MB면 정직한 예외 상황까지 넉넉히 담아요. 이미지가
많은 기사, single-page app, 긴 글, Wikipedia 우수 문서 같은 것들이요. 그 위로
올라가면 현실적인 설명은 일부러 크게 만든 페이지, 기사로 잘못 분류된 파일
다운로드, 뽑아낼 텍스트가 없는 바이너리 덩어리 정도인데 scraper 입장에선 어차피
하나도 필요 없어요.

나머지 절반의 근거는 반대쪽 예산이에요. 5 MB 문서가 100~250 MB 정도의 heap으로
파싱되어도, 768 MB worker 안에서 프로세스가 하는 나머지 일까지 감당할 여유가
남아요. 논문이나 정부 문서처럼 원래 큰 문서를 다룬다면 제한은 올라가야 하고, 새
숫자는 측정에서 나와야 해요.

## 처음 메모에서 빠뜨린 부분

`iter_bytes()`는 HTTP content decoding을 거친 뒤의 내용을 내주고, `iter_raw()`는
도착한 그대로의 byte를 내줘요. 그리고 `Content-Length`는 인코딩된 body를 기준으로
하고요. 그래서 위 코드의 두 층은 같은 값을 재고 있는 게 아니에요. 빠른 경로는
압축된 전송 크기와 비교하고, 느린 경로는 압축을 푼 byte를 세요.

이 어긋남은 마침 제한에 유리하게 작동해요. 작게 들어와서 엄청나게 부풀어 오르는
gzip payload는 헤더 검사를 그냥 통과하고 누적 카운터에서 걸리는데, 딱 거기서
걸리는 게 맞아요. 다만 정말로 제한하고 싶은 게 메모리가 아니라 대역폭이라면
헤더와 짝이 맞는 iterator는 `iter_raw()`고, 디코딩은 검사 뒤로 옮겨야 해요.
당시엔 여기까지 생각하지 못했어요. 문서를 나중에 찬찬히 읽고 나서야 눈에
들어왔어요.

## 증상은 엉뚱한 곳에서 나타났어요

기억에 남은 건 OOM kill이 파싱을 하던 worker에서 나지 않았다는 점이에요.
Prometheus가 죽었어요. worker의 메모리 압박에 metric 전송이 겹치면서 Prometheus가
자기 쪽의 빠듯한 제한을 먼저 넘겼거든요. 죽은 건 그냥 여유가 제일 없던
component였어요.

이건 생각보다 넓게 적용되더라고요. 메모리는 전역 압박 신호 하나를 공유하는
자원이라서, 죽은 자리는 누가 원인인지가 아니라 누가 자기 천장에 제일 가까웠는지를
알려줘요. 메모리를 쓸 이유가 딱히 없는 곳에서 OOM이 뜨면, 죽은 쪽의 제한을 올리기
전에 어느 이웃이 배가 고파졌는지 먼저 물어보는 게 좋아요.

## 언제 쓸 만하고, 언제 아닐까

저라면 임의의 사용자 URL을 받아들이는 production scraper, 메모리가 빠듯한 worker,
그리고 scraper의 OOM이 공유 부모까지 같이 끌고 내려가는 곳에 이걸 넣겠어요.
multiprocess worker pool이나 queue consumer 같은 자리요.

반대로 URL 집합이 고정되어 있고 크기도 예측 가능하게 얌전한 경우, 메모리가 넉넉한
전용 프로세스에서 도는 경우(4 GB VM이 한 번에 한 작업만 하면 이 정도는 티도 안
나요), 호출하는 쪽에서 이미 입력을 제한하는 경우라면 건너뛰겠어요. 바이너리
endpoint를 scraper가 보기도 전에 걸러내는 validator가 있다면 같은 정책을 더
앞에서 이미 집행하고 있는 거라, 두 번 해도 얻는 게 별로 없어요.

## 정리

scraper가 통제할 수 없는 URL을 받는다면, 크기 제한은 읽는 도중에 걸려야 해요.
헤더 검사는 값싼 빠른 경로로 남겨둘 만하지만, 실제로 버텨주는 쪽은 byte
카운터예요. 서버가 정직한지에 기대지 않는 유일한 층이니까요. 그리고 메모리가
실제로 터졌다면, 죽은 자리가 알려주는 건 누구 잘못인지가 아니라 어디에 여유가
없었는지예요.

## 참고 자료

- [Streaming Responses — HTTPX quickstart](https://www.python-httpx.org/quickstart/#streaming-responses):
  `httpx.stream()`, `iter_bytes()`와 `iter_raw()`의 차이, 그리고
  `Content-Length` 조건부 로딩 패턴
- [Streaming responses (async) — HTTPX](https://www.python-httpx.org/async/#streaming-responses):
  async client에서의 같은 동작
- [Installing a parser — Beautiful Soup documentation](https://www.crummy.com/software/BeautifulSoup/bs4/doc/#installing-a-parser):
  `"lxml"`을 고르면 BeautifulSoup 밑에서 실제로 뭐가 선택되는지
- [Benchmarks and Speed — lxml](https://lxml.de/performance.html): parser별 메모리
  사용량을 포함한 lxml 자체 benchmark
- [RFC 9110 §8.6 — Content-Length](https://www.rfc-editor.org/rfc/rfc9110#field.content-length):
  이 헤더의 의미와, 보내는 쪽이 언제 포함해야 하는지
- [RFC 9112 §6.3 — Message Body Length](https://www.rfc-editor.org/rfc/rfc9112#name-message-body-length):
  응답에 `Content-Length`가 아예 없게 되는 framing 규칙
