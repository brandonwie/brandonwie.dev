---
title: LibreOffice headless로 DOCX 이력서를 PDF로 안정적으로 내보내기
description: >-
  macOS Pages에서 흔들린 layout과 text layer를 LibreOffice headless와
  네 단계 artifact 검증으로 확인한 사례예요.
date: 2026-07-22T00:00:00.000Z
updated: 2026-07-23T00:00:00.000Z
tags:
  - devops
  - tooling
category: devops
draft: false
lang: ko
source_lang: en
source_slug: docx-pdf-export-pages-vs-libreoffice
source_updated: 2026-07-23T00:00:00.000Z
translation_date: 2026-07-23
references:
  - url: >-
      https://support.apple.com/guide/pages/export-to-word-pdf-or-another-file-format-tan3b922d4ad/mac
    title: Apple Pages export guide
    type: official
  - url: >-
      https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html
    title: LibreOffice command-line parameters
    type: official
---

macOS에서 Word list 형식의 이력서를 안정적인 PDF로 만들어야 했어요. DOCX를
Pages로 열어 내보내는 경로가 가장 먼저 떠올랐지만, 결과는 이번 제출에서
중요했던 두 검사를 통과하지 못했어요. layout이 반복할 때마다 같지 않았고
검색 가능한 text layer도 손상됐어요.

이 글은 모든 renderer를 비교한 결과가 아니에요. 특정 문서와 toolchain에서
내보낸 artifact를 제출 전에 검증한 기록이에요.

## Pages 경로에서 실패한 것

같은 commit의 DOCX를 두 번 새로 import했는데 두 번째 page의 layout이 달랐어요.
한 번은 정상이고, 다른 한 번은 list marker가 이전 bullet 끝으로 밀렸어요.

검색 가능한 text도 달라졌어요. `pdftotext` 결과에서 `Airflow`가 `Air ow`로,
`Actions`가 `Ac ons`로 갈라졌고 source mirror와 token 수도 크게 달랐어요.
사람은 화면에서 단어를 짐작할 수 있지만 parser가 받는 text는 달라져요.

이 문서에서는 OOXML 요소 하나도 영향을 줬어요.
`paragraph_format.keep_with_next = False`가 `<w:keepNext w:val="0"/>`을
만들었고, `None`으로 요소 자체를 없애니 Pages 문제가 사라졌어요. version과
문서에 묶인 관찰이라 일반 규칙으로 확대하지 않고 test case에 남겼어요.

## LibreOffice headless로 내보내요

이 문서에서는 LibreOffice를 화면 없이 실행했더니 page 배치가 매번 같았고
검색 가능한 text도 온전했어요.

```bash
brew install --cask libreoffice
/Applications/LibreOffice.app/Contents/MacOS/soffice --headless \
  --convert-to pdf --outdir "$OUT_DIR" resume.docx
```

LibreOffice는 `--headless`, `--convert-to`, `--outdir`를 공식 문서에
설명하고 있어서 scripted export에 쓰기 좋아요. 그래도 command 성공만으로는
충분하지 않아서 결과 file을 따로 검증했어요.

## command가 아니라 artifact를 검증해요

검사는 네 부분으로 나눴어요.

1. **반복성:** 두 번 변환한 뒤 page별 raster hash를 비교해요. PyMuPDF의
   `page.get_pixmap(dpi=140).samples`에 md5를 적용했어요.
2. **두 renderer로 화면 확인:** PyMuPDF와 Poppler(`pdftoppm`)로 각각
   rasterize한 뒤 모든 page를 확인해요.
3. **Text layer 회귀 검사:**
   `pdftotext file.pdf - | grep -cE "Air ow|Ac ons|real- me"` 결과가
   0인지 보고, 중요한 용어도 직접 확인해요.
4. **Token 일치:** `pdftotext` 결과를 정규화한 word token 수가 source text
   mirror와 같은지 비교해요. 줄바꿈 hyphenation처럼 검토한 예외만 허용해요.

두 변환의 hash가 같으면 반복성에 대한 증거는 되지만 화면이 올바르다는 뜻은
아니에요. 그래서 화면과 text layer 검사를 따로 유지해요.

## 이 workflow를 쓰는 범위

layout과 검색 가능한 text가 모두 중요한 DOCX-to-PDF 자동화에 맞아요. DOCX는
편집 가능한 source로 두고 검증한 PDF는 고정된 제출 artifact로 보관해요.
source를 고치면 PDF 검증도 처음부터 다시 해야 해요.

사람만 읽는 문서에는 네 단계가 과할 수 있어요. 새로운 template, font,
application version을 쓴다면 이전 결과를 믿지 말고 비교를 다시 실행하는 편이
안전해요.
