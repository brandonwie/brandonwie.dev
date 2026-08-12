---
title: BeautifulSoup + lxml memory overhead — why scrapers need size caps
description: >-
  A scraper that fetches a page with httpx and hands the body to BeautifulSoup
  is an OOM vector, because the parsed tree costs many times the raw HTML size.
  Streaming plus a two-layer size reject is what I ended up with.
date: 2026-04-15T00:00:00.000Z
updated: '2026-08-12'
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
lang: en
expanded: true
references:
  - url: 'https://www.python-httpx.org/quickstart/#streaming-responses'
    title: 'Streaming Responses — HTTPX quickstart'
    type: official
  - url: 'https://www.python-httpx.org/async/#streaming-responses'
    title: 'Streaming responses (async) — HTTPX'
    type: official
  - url: 'https://www.crummy.com/software/BeautifulSoup/bs4/doc/#installing-a-parser'
    title: 'Installing a parser — Beautiful Soup documentation'
    type: official
  - url: 'https://lxml.de/performance.html'
    title: 'Benchmarks and Speed — lxml'
    type: official
  - url: 'https://www.rfc-editor.org/rfc/rfc9110#field.content-length'
    title: 'RFC 9110 §8.6 — Content-Length'
    type: official
  - url: 'https://www.rfc-editor.org/rfc/rfc9112#name-message-body-length'
    title: 'RFC 9112 §6.3 — Message Body Length'
    type: official
source_content_hash: e4266e1fcc448b0230cf02e9e5f84d805c99ced7b59963c26685a27b6e5ff1e6
---

The scraper in crucio, my own side project, started out looking like every
tutorial I had read:

```python
with httpx.Client(timeout=30, follow_redirects=True) as client:
    response = client.get(url, headers={...})
    response.raise_for_status()

soup = BeautifulSoup(response.text, "lxml")
# ... extract content ...
```

Four lines, and correct in the sense that it does what it says. It is also an OOM
vector. I did not think of it that way until memory pressure in that stack turned
into an actual incident, and the process that died was not the one doing the
parsing. That misattribution turned out to be the most useful part of the whole
thing, so it gets its own section further down.

## Byte size is not memory size

The thing I had wrong was treating the HTML byte count as a proxy for the memory
the parse would cost. It isn't close. In this stack the parsed representation ran
roughly 20-50x the raw HTML size, so a 5 MB page landed as something like
100-250 MB of Python heap, and a 20 MB page (a JS-heavy single-page app dump,
say) could plausibly reach 500 MB to 1 GB.

That falls out of how the parser works. lxml builds a full DOM tree, so every
element becomes an object with its own header, string storage gets duplicated for
text nodes, and attribute dictionaries add their own per-element cost. None of
that is visible in the byte count of the response.

I read 20-50x as an order of magnitude, not a constant. It is specific to the
parser, the document shape, and the Python version, and lxml publishes its own
benchmark figures, including memory usage per parser, which are worth reading
before adopting anyone's multiplier, mine included. If the number matters to your
budget, measure it on documents that look like yours.

## Two facts that turn overhead into an outage

Overhead alone is survivable. Two other properties are what make it dangerous.

**Default HTTP clients materialize the body eagerly.** `requests.get(url)`,
`httpx.Client().get(url)`, and `aiohttp.ClientSession().get(url)` all download
the complete body before handing back a response object. By the time you hold
something you could measure, you have already paid for it. Streaming exists in
these libraries precisely because the default is not streaming, and the HTTPX
quickstart introduces it as the way to avoid loading an entire response body into
memory at once.

**Content-Length is not a size guarantee.** RFC 9110 defines it as the length of
the representation's data, but a response is not required to carry it: with
chunked transfer coding the framing comes from the chunks themselves and no
Content-Length appears at all, which RFC 9112's message-body-length rules spell
out. Servers can also send `0`, and a hostile server can advertise a small value
and then deliver gigabytes. A check built only on the header is one a misbehaving
server can opt out of.

Put those together with a memory-constrained worker (Celery with
`mem_limit: 512m`, a Cloud Run service at 512 MB, a Kubernetes pod with a request
limit) and one large page is enough to kill the process. The page does not even
have to be malicious. A PDF URL that got categorized as an article, or a site
that dumps its entire catalog into one document, does the same thing.

## Where the cap can live

Once I accepted that a limit was necessary, the question became where to put it,
and the candidates are not interchangeable.

| Where the limit lives         | Catches                                             | Misses                                                             |
| ----------------------------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| Content-Length header check   | Oversize bodies from honest servers, before any read | Chunked responses with no header; servers that understate the size |
| Size check after download     | Nothing that matters                                 | The entire point. The memory was already allocated                 |
| Byte counting while streaming | Every oversize body, regardless of what headers say  | Nothing on correctness; costs a rewrite into streaming mode        |
| Process memory limit          | The absolute worst case, as a backstop               | It enforces by dying, which is the outcome you were preventing     |

The header check is close to free and it is the only layer that can abort before
a single byte of body arrives, but it is only as honest as the server. Byte
counting is complete, and it only starts protecting you after the first chunk has
landed. The two cover each other's gaps, which is why the version I shipped uses
both. A process-level limit still belongs in the deployment as a last line,
though the way it enforces the cap is by killing the worker, which is the outcome
I was trying to avoid in the first place.

The HTTPX docs actually sketch the first layer themselves: their streaming
section shows opening a stream, comparing `Content-Length` against a threshold,
and only calling `read()` when it fits. What that snippet does not address is the
case where the header is missing or wrong, which is the case that motivated all
of this.

## The fix: stream first, reject twice

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
        # Stream the response so oversize bodies can be rejected BEFORE
        # the whole payload lands in memory.
        with httpx.stream(
            "GET",
            url,
            timeout=self.timeout,
            follow_redirects=True,
            headers={"User-Agent": "..."},
        ) as response:
            response.raise_for_status()

            # Fast-path reject — Content-Length header (abort before any bytes)
            content_length_hdr = response.headers.get("content-length")
            if (
                content_length_hdr is not None
                and content_length_hdr.isdigit()
                and int(content_length_hdr) > self.max_response_bytes
            ):
                return self._oversize_response(url, int(content_length_hdr))

            # Slow-path reject — byte accumulation (header missing/lied)
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

Four things in there are doing the work.

`httpx.stream()` replaces `httpx.Client().get()`, which defers the body download
so that nothing is fetched until chunks are iterated. This is the change that
makes every other check possible, and it is also the change with the largest
blast radius on existing code, because `response.text` and `response.content` are
unavailable inside a stream context.

The reject is two-layered. The header check handles servers that tell the truth,
and the accumulator handles servers that do not. Neither alone is enough, and
running both costs one dictionary lookup on the common path.

Oversize returns empty content instead of raising. The caller already knows how
to handle "extraction produced nothing," so rejection reuses that path instead of
introducing an exception type that every call site would have to learn. That was
a deliberate trade: it keeps the happy path clean, at the cost of making
rejection quieter than a raise would be.

The rejection also logs a warning, which is how you find out that the quiet path
is being taken. Without the log line, a cap that starts rejecting legitimate
pages after a site redesign looks the same as a scraper that finds nothing
interesting.

## Why 5 MB

The number is empirical, not principled. Legitimate web pages are overwhelmingly
under 1 MB of HTML, so 5 MB leaves a wide margin for the honest edge cases:
image-heavy articles, single-page apps, long-form posts, Wikipedia featured
articles. Above that threshold, the realistic explanations are a deliberately
oversized page, a file download that got mistaken for an article, or a binary
blob with no extractable text, and the scraper wants none of those anyway.

The other half of the reasoning is the budget on the other side. A 5 MB document
parsing into roughly 100-250 MB of heap still fits inside a 768 MB worker with
room for everything else the process is doing. If you are extracting from sources
that are legitimately large, like scientific papers or government documents, the
cap should move, and the new number should come from a measurement.

## A detail my original note skipped

`iter_bytes()` yields content after HTTP content decoding, while `iter_raw()`
yields the bytes as they arrived. Content-Length describes the encoded body. So
the two layers in that code are not measuring the same quantity: the fast path
compares against compressed wire size, and the slow path counts decompressed
bytes.

That asymmetry happens to work in the cap's favor. A small gzip payload that
expands enormously sails past the header check and gets stopped by the
accumulator, which is exactly where you would want it stopped. But if what you
actually mean to limit is bandwidth instead of memory, `iter_raw()` is the
iterator that matches the header, and the decode has to move after the check.
I did not reason about this at the time; it is only obvious reading the docs
carefully afterward.

## The symptom showed up in the wrong place

The part that stayed with me is that the OOM kill did not land on the worker
doing the parsing. It landed on Prometheus, because the worker's memory pressure,
combined with metric emission, pushed Prometheus past its own tight limit first.
The component that died was simply the one with the least headroom.

That generalizes further than I expected. Memory is a shared resource with a
single global pressure signal, so the crash site tells you who was closest to
their ceiling, not who caused it. When an OOM shows up somewhere that has no
plausible reason to allocate, it is worth asking which neighbor got hungry before
reaching for the victim's limit.

## When this is worth it, and when it isn't

I would reach for this in a production scraper that ingests arbitrary
user-supplied URLs, in any memory-constrained worker, and anywhere a scraper OOM
would take down a shared parent, like a multiprocess worker pool or a queue
consumer.

I would skip it when the URL set is fixed and well-behaved with predictable
sizes, when the scrape runs in a dedicated process with generous memory (a 4 GB
VM doing one job at a time absorbs this without noticing), or when the caller
already caps the input. A validator that rejects binary endpoints before the
scraper ever sees them is enforcing the same policy earlier, and doing it twice
buys little.

## Practical takeaway

If a scraper accepts URLs it does not control, the size limit has to be enforced
during the read. The header check is worth keeping as a cheap fast path, but the
byte counter is the part that actually holds, because it is the only layer that
does not depend on the server being honest. And when the memory does blow up, the
crash site is evidence about headroom before it is evidence about fault.

## References

- [Streaming Responses — HTTPX quickstart](https://www.python-httpx.org/quickstart/#streaming-responses)
  — `httpx.stream()`, `iter_bytes()` vs `iter_raw()`, and the Content-Length
  conditional-load pattern
- [Streaming responses (async) — HTTPX](https://www.python-httpx.org/async/#streaming-responses)
  — the same mechanics for an async client
- [Installing a parser — Beautiful Soup documentation](https://www.crummy.com/software/BeautifulSoup/bs4/doc/#installing-a-parser)
  — what choosing `"lxml"` actually selects underneath BeautifulSoup
- [Benchmarks and Speed — lxml](https://lxml.de/performance.html) — lxml's own
  parser benchmarks, including per-parser memory usage figures
- [RFC 9110 §8.6 — Content-Length](https://www.rfc-editor.org/rfc/rfc9110#field.content-length)
  — what the header means and when a sender is expected to include it
- [RFC 9112 §6.3 — Message Body Length](https://www.rfc-editor.org/rfc/rfc9112#name-message-body-length)
  — the framing rules under which a response carries no Content-Length at all
