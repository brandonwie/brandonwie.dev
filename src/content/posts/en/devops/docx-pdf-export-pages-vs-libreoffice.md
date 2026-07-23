---
title: A Reproducible DOCX-to-PDF Resume Export with LibreOffice Headless
description: >-
  Export a Word-list-formatted `.docx` (resume) to a submission-ready PDF on
  macOS. Apple Pages is the obvious built-in path (`open` + AppleScript export),
  but...
date: 2026-07-22T00:00:00.000Z
updated: 2026-07-23T00:00:00.000Z
tags:
  - devops
  - tooling
category: devops
draft: false
lang: en
expanded: true
references:
  - url: >-
      https://support.apple.com/guide/pages/export-to-word-pdf-or-another-file-format-tan3b922d4ad/mac
    title: Apple Pages export guide
    type: official
  - url: >-
      https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html
    title: LibreOffice command-line parameters
    type: official
source_content_hash: 1232be4ac30152a61b91095e70cb68ebff74783aec211385735f2ff68ebdd05f
---

I needed a stable PDF from a Word-list-formatted resume on macOS. The obvious
path was to open the DOCX in Pages and export it, but the resulting artifact
failed two checks that mattered for this submission: repeatable layout and an
intact searchable text layer.

This is one document and toolchain, not a universal renderer comparison. The
useful part is the verification pipeline: it turns a visual export into an
artifact I can check before sending.

## What failed in the Pages path

Two fresh imports of the same committed DOCX produced different page-two
layouts. One looked correct; the other displaced list markers to the end of a
previous bullet.

The searchable text also changed. `pdftotext` split terms such as `Airflow` into
`Air ow` and `Actions` into `Ac ons`, with a large token-count difference from
the source mirror. A human could still infer the words visually, but a parser
would receive different text.

One OOXML detail contributed to the layout behavior. In this file,
`paragraph_format.keep_with_next = False` produced
`<w:keepNext w:val="0"/>`, while removing the element with `None` avoided the
problem in Pages. That observation is version- and document-specific, so I kept
it in the test case rather than treating it as a general OOXML rule.

## Export with LibreOffice headless

For this document, LibreOffice headless produced repeatable layout and intact
searchable text:

```bash
brew install --cask libreoffice
/Applications/LibreOffice.app/Contents/MacOS/soffice --headless \
  --convert-to pdf --outdir "$OUT_DIR" resume.docx
```

LibreOffice documents `--headless`, `--convert-to`, and `--outdir`, which makes
the renderer suitable for a scripted export. The command alone is not the gate,
though. I still verified the resulting file.

## Verify the artifact, not the command

The check had four parts:

1. **Repeatability:** convert twice; compare per-page raster hashes (PyMuPDF
   `page.get_pixmap(dpi=140).samples` md5).
2. **Dual-renderer visual check:** rasterize with PyMuPDF and Poppler
   (`pdftoppm`), then inspect every page.
3. **Text-layer regression scan:**
   `pdftotext file.pdf - | grep -cE "Air ow|Ac ons|real- me"` must be 0;
   spot-check that important terms survived intact.
4. **Token parity:** normalized word-token count of `pdftotext` output must
   match the source text mirror, with reviewed exceptions for line-break
   hyphenation.

Hash equality across two conversions is useful evidence of repeatability, but it
does not prove visual correctness. That is why the visual and text-layer checks
remain separate.

## Practical takeaway

This workflow fits automated DOCX-to-PDF exports where both layout and
searchable text matter. Keep the DOCX as the editable source and the verified
PDF as a frozen submission artifact; any source edit invalidates the PDF and
restarts the checks.

For a document that only humans will read, the four-part gate may be more than
you need. For a new template, font set, or application version, rerun the
comparison instead of assuming this result still holds.
