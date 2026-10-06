---
title: '한글 조사 앞에서 `_emphasis_`는 닫히지 않아요'
description: >-
  닫는 `_` 양쪽에 한글이 있으면 CommonMark는 emphasis를 닫지 않아요. `_`는 문자
  그대로 남아요. `*`에는 intraword 제한이 없어서 그대로 닫혀요.
date: 2026-08-12T00:00:00.000Z
updated: '2026-10-06'
tags:
  - frontend
  - markdown
  - i18n
  - korean
  - rendering
  - transferable
category: frontend
draft: false
lang: ko
source_lang: en
source_slug: intraword-emphasis-fails-before-hangul
source_updated: 2026-10-06T00:00:00.000Z
translation_date: '2026-10-06'
references:
  - url: 'https://spec.commonmark.org/0.31.2/#emphasis-and-strong-emphasis'
    title: CommonMark Spec 0.31.2 - Emphasis and strong emphasis
    type: official
---

2026-08-12에 brandonwie.dev를 올리다가 이걸 만났어요. 한국어 한 줄이 에디터와 diff에서는 맞아 보였는데 render되고 나니 emphasis 기호가 문장 안에 그대로 남았어요. 그때 한국어 번역은 micromark 4.0.2 위의 mdsvex를 거쳤어요.

```markdown
훑어서 _새 파일_이 있는지 확인해요.
```

이 줄은 `_`가 문자 그대로 나왔어요.

```html
<p>훑어서 _새 파일_이 있는지 확인해요.</p>
```

원래 영어 문장은 이렇게 되지 않았어요. `scans for _new_ files`는 `<em>new</em>`로 나왔고 닫는 delimiter 뒤에 공백이 있었어요.

소스만 보면 깨진 곳이 없어요. diff review는 통과하고 남아버린 `_`는 render 뒤에야 보여요.

한국어는 명사에 조사를 공백 없이 붙여요. emphasis를 준 명사에 조사가 붙으면 같은 방식으로 실패해요. 이 붙임은 일본어에도 있고 조사를 공백 없이 붙이는 다른 문자 체계에도 있어요.

이 사이트는 이제 post를 mdsvex로 render하지 않아요. 앱은 지금 Next.js에 remark예요. 이 줄을 그 pipeline에서 다시 돌려보지는 않았어요.

지금 renderer가 무엇을 출력하는지는 이 글의 주장이 아니에요. 여기서 유지되는 건 예전 render가 부딪힌 CommonMark 규칙이에요. CommonMark spec 0.31.2의 emphasis와 strong emphasis 절에 그 규칙이 적혀 있어요.

## 닫는 `_`가 닫히지 않는 이유

CommonMark는 단어 안에서 emphasis가 생기지 않도록 `_`를 제한해요. 그래서 `snake_case_names`가 기울임으로 바뀌지 않아요. 닫는 `_`는 delimiter run이 right-flanking일 때만 허용돼요. underscore라면 left-flanking이 아니거나 앞에 punctuation이 있어야 해요.

한글은 공백도 아니고 punctuation도 아니에요. 라틴 문자와 같은 일반 텍스트예요. `_새 파일_이`에서 닫는 `_`는 `일`과 `이` 사이에 있어요.

양쪽에 글자가 있으면 그 run은 left-flanking이면서 right-flanking이에요. `_` 규칙에서는 닫히지 않아요. 두 delimiter가 모두 문자 그대로 나와요.

영어에서는 잘 안 걸려요. emphasis를 준 단어 뒤에는 보통 공백이나 punctuation이 오니까요. 한국어는 명사에 조사를 붙여 써요. 이, 가, 은, 는, 을, 를, 에, 의처럼요.

emphasis를 준 한국어 명사에 이 조사 중 하나가 붙으면 실패해요. 양쪽 이웃이 모두 단어 문자일 때만 걸려요. 뒤에 붙는 한글 조사도 단어 문자예요.

## `*`는 닫히고 `_`는 닫히지 않는 자리

`*`에는 intraword 제한이 없어요. 조사를 붙인 채로 두어도 emphasis는 닫혀요.

```markdown
훑어서 *새 파일*이 있는지 확인해요.
```

조사가 공백 없이 붙을 때 내가 고른 수정이 이거예요. underscore 형태는 micromark 4.0.2가 문자 그대로 render한 쪽이에요. 지금 remark pipeline에서 `*`를 새로 render해 본 결과를 적는 건 아니에요.

`*`는 단어 안에서도 허용되고 `_`는 허용되지 않아요. 그래서 asterisk가 수정이에요.

## 이미 써 둔 것을 찾기

남은 `_`는 소스 review에서 안 보여요. 파일을 render한 뒤에야 나타나요. 그래서 찾아봤어요.

패턴은 닫는 delimiter 바로 뒤에 한글 음절이 오는 emphasis run과 맞아요. fenced code는 건너뛰었어요. 그 안의 `_`는 emphasis를 시도한 게 아니라 소스 텍스트예요.

```js
const broken = /_[^_\s][^_]*_[가-힣]/;
```

검색에서 한국어 글의 실제 사례가 13건 나왔어요. 모양만 같은 가짜도 있어요. `redirect_uri`나 `sync_uri` 같은 identifier는 emphasis 시도가 아닌데도 맞아요. 깨진 emphasis로 보기 전에 그런 일치는 걸러냈어요.

## 기호를 고를 때

뒤에 공백 없이 무언가 붙을 수 있으면 `*`를 써요. 한국어에서는 그게 조사예요. 조사를 바로 붙이는 일본어와 다른 문자 체계도 같은 경우예요.

단어 뒤에 공백이나 punctuation이 오면 `_`도 맞아요. 그래서 영어 문장은 `<em>new</em>`가 됐어요. identifier 안에서는 `_`를 유지해서 `snake_case_names`가 일반 텍스트로 남아요.

spec을 읽고 나니 닫는 `_`가 왜 문자 그대로 남는지 보였어요. 13줄은 거기서 나오지 않았어요. render한 다음 검색해서야 보였어요. 소스가 의도한 것처럼 보이니까 parser가 delimiter 닫기를 거부하기 전에는 diff review가 놓쳐요.

그때 잡아 준 검사는 당시 프로젝트 parser였어요. mdsvex 아래의 micromark 4.0.2예요.

한글 음절이 닫는 `_`에 닿으면 그 run은 emphasis가 되지 않아요. 그 자리에서도 `*`는 닫혀요.

## 참고

- [CommonMark Spec 0.31.2 - Emphasis and strong emphasis](https://spec.commonmark.org/0.31.2/#emphasis-and-strong-emphasis)
