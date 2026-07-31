---
title: LibreOffice headless로 DOCX 이력서를 PDF로 안정적으로 내보내기
description: >-
  macOS Pages에서 흔들린 layout과 text layer를 LibreOffice headless와
  네 단계 artifact 검증으로 확인한 사례예요.
date: 2026-07-22T00:00:00.000Z
updated: "2026-07-31"
tags:
  - devops
  - tooling
category: devops
draft: false
lang: ko
source_lang: en
source_slug: docx-pdf-export-pages-vs-libreoffice
source_updated: "2026-07-31"
translation_date: "2026-07-31"
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

renderer 전반을 비교한 글은 아니에요. 문서 하나, toolchain 하나에서 겪은
일이에요. renderer를 뭘 고르느냐보다 중요했던 건 검증 단계였어요. 덕분에
보내기 전에 눈대중으로 넘기지 않고 결과물을 확인할 수 있었어요.

## Pages 경로에서 실패한 것

같은 commit의 DOCX를 두 번 새로 import했는데 두 번째 page의 layout이 달랐어요.
한 번은 정상이고, 다른 한 번은 list marker가 이전 bullet 끝으로 밀렸어요.

검색 가능한 text도 달라졌어요. `pdftotext` 결과에서 `Airflow`가 `Air ow`로,
`Actions`가 `Ac ons`로 갈라졌고 source mirror와 token 수도 한참 어긋났어요.
갈라진 자리는 전부 ligature 짝이었어요. `Airflow`의 fl, `Actions`와
`real-time`의 ti가 그랬어요. 글자 모양은 그려졌는데 뽑아낸 문자는 빠진
거예요. 사람은 화면에서 단어를 짐작할 수 있지만 parser가 받는 text는 달라져요.

이 문서에서는 OOXML 요소 하나도 영향을 줬어요. python-docx에서
`paragraph_format.keep_with_next = False`로 두면 `<w:keepNext w:val="0"/>`가
만들어지고, `None`으로 요소 자체를 없애니 Pages 문제가 사라졌어요. Pages가
`val` 값은 보지 않고 요소가 있으면 켜진 것으로 처리한다는 뜻으로 읽혀요.
끄겠다고 적어둔 게 켜는 쪽으로 들어간 셈이에요. 다만 version과 문서에 묶인
관찰이라 일반 규칙으로 넓히지 않고 test case에 남겼어요.

## LibreOffice headless로 내보내요

이 문서에서는 LibreOffice를 화면 없이 실행했더니 page 배치가 매번 같았고
검색 가능한 text도 온전했어요.

```bash
brew install --cask libreoffice
/Applications/LibreOffice.app/Contents/MacOS/soffice --headless \
  --convert-to pdf --outdir "$OUT_DIR" resume.docx
```

LibreOffice는 `--headless`, `--convert-to`, `--outdir`를 공식 문서에
설명하고 있어서 script로 묶기 쉬워요. 아래 네 가지 검사는 그 문서에 없는
것들이고, 이번 실패를 겪으면서 나왔어요. command가 잘 돌아갔다는 것만으로는
믿기 어려웠어요. 그래서 그게 만들어낸 file을 따로 확인했어요.

## command가 아니라 artifact를 검증해요

검사는 네 부분으로 나눴어요.

1. **반복성:** 두 번 변환한 뒤 page별 raster hash를 비교해요. PyMuPDF의
   `page.get_pixmap(dpi=140).samples`에 md5를 적용해서 같은 결과가 다시
   나오는지 봐요.
2. **두 renderer로 화면 확인:** PyMuPDF와 Poppler(`pdftoppm`)로 각각
   rasterize한 뒤 모든 page를 확인해요. 한쪽이 뭉개고 넘어간 결함은 다른
   쪽에서 드러나는 편이에요.
3. **Text layer 회귀 검사:**
   `pdftotext file.pdf - | grep -cE "Air ow|Ac ons|real- me"` 결과가
   0이어야 하고, 중요한 용어는 직접 짚어보며 온전한지 확인해요.
4. **Token 일치:** `pdftotext` 결과를 정규화한 word token 수를 source text
   mirror와 맞춰봐요. 줄바꿈 hyphenation처럼 따져본 예외만 허용해요.
   `auto-scaling`이 `autoscaling`으로 붙는 정도가 받아들일 수 있는 유일한
   차이였어요.

hash 두 개가 같다는 건 변환 결과가 매번 같다는 뜻이에요. 화면이 실제로 제대로
나왔는지까지 말해주지는 않아서, 화면 검사와 text layer 검사는 따로 뒀어요.

## 이 workflow를 쓰는 범위

layout과 검색 가능한 text가 모두 중요하고 renderer version을 고정할 수 있는
DOCX-to-PDF 자동화에 맞아요. DOCX는 편집 가능한 source로 두고, 검증을 마친
PDF는 고정된 제출 artifact로 보관해요. source를 고치면 PDF는 무효가 되고
검사도 처음부터 다시 돌려야 해요.

사람만 읽는 문서라면 네 단계는 아마 과한 장치일 거예요. 그리고 template이나
font가 바뀌거나 두 application 중 하나라도 version이 달라지면, 이 결과가
그대로 간다고 믿기보다 비교를 다시 돌려보는 편이 나아요.
