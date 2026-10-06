---
title: '`_emphasis_` does not close against a Korean particle'
description: >-
  CommonMark will not close an underscore emphasis run when Hangul sits on both
  sides of the closing delimiter, so the underscores stay literal. Asterisks
  have no intraword restriction and still close.
date: 2026-08-12T00:00:00.000Z
updated: 2026-10-06T00:00:00.000Z
tags:
  - frontend
  - markdown
  - i18n
  - korean
  - rendering
  - transferable
category: frontend
draft: false
lang: en
expanded: true
references:
  - url: 'https://spec.commonmark.org/0.31.2/#emphasis-and-strong-emphasis'
    title: CommonMark Spec 0.31.2 - Emphasis and strong emphasis
    type: official
source_content_hash: 51bcf56d6d5406a6c94f057004634bb28c3fcae4660b6d5a3493510305fcc142
---

I found this on 2026-08-12 while publishing brandonwie.dev. A Korean line looked correct in the editor and in the diff, then rendered with the emphasis marks still in the sentence. Korean translations at the time went through mdsvex on micromark 4.0.2.

```markdown
훑어서 _새 파일_이 있는지 확인해요.
```

That line rendered as literal underscores:

```html
<p>훑어서 _새 파일_이 있는지 확인해요.</p>
```

The English line it came from did not do this. `scans for _new_ files` rendered as `<em>new</em>`, with a space after the closing delimiter.

Nothing in the source looks broken, so a diff review passes and the stray underscores show up after render. Korean attaches a particle to the noun with no space, so an emphasized noun that takes a particle fails the same way. The same attachment shows up in Japanese and in other scripts that suffix a particle without a space.

This site no longer renders posts through mdsvex. The app is Next.js with remark now. I have not re-run this line on that pipeline, so this is not a claim about what the current renderer prints. The part that still holds is the CommonMark rule the old render ran into. CommonMark spec 0.31.2 states it in the section on emphasis and strong emphasis.

## Why the closing underscore does not close

CommonMark restricts `_` so emphasis cannot occur inside a word. That rule is what keeps `snake_case_names` from turning into italics. A closing `_` is allowed only when its delimiter run is right-flanking and, for underscores, either not left-flanking or preceded by punctuation.

Hangul is neither whitespace nor punctuation. It is ordinary text, the same as a Latin letter. In `_새 파일_이`, the closing `_` sits between `일` and `이`. Text on both sides makes that run both left-flanking and right-flanking. Under the underscore rule it cannot close, and both delimiters are emitted as literal characters.

English rarely trips this, because a space or a punctuation mark usually follows the emphasized word. Korean writes the particle on the noun with no space: 이, 가, 은, 는, 을, 를, 에, 의. Every emphasized Korean noun that takes one of those particles is the failure case. Both neighbors have to be word characters, and a trailing Hangul particle is a word character.

## Asterisks close where underscores do not

`*` has no intraword restriction. The particle can stay attached, and the emphasis still closes:

```markdown
훑어서 *새 파일*이 있는지 확인해요.
```

That is the fix I landed on when the particle has no space. The underscore form is what micromark 4.0.2 rendered as literal text. I am not reporting a fresh asterisk render from the current remark pipeline. Asterisks are the fix because `*` is allowed inside a word and `_` is not.

## Finding the ones already written

Stray underscores do not show in a source review, and they show up once the file is rendered, so I scanned for them. The pattern matches an emphasis run whose closing delimiter is immediately followed by a Hangul syllable. I skipped fenced code, because underscores there are source text, not an emphasis attempt.

```js
const broken = /_[^_\s][^_]*_[가-힣]/;
```

That scan found 13 real instances in the Korean corpus. The shape has false friends. An identifier such as `redirect_uri` or `sync_uri` matches without being an emphasis attempt, so I filtered those out before treating a hit as broken emphasis.

## When I reach for each marker

I use `*` when the emphasized word may take a suffix with no space. That is the Korean particle case, and the same case in Japanese and other scripts that attach particles directly. `_` still fits when a space or punctuation follows the word, which is why the English line became `<em>new</em>`. Inside an identifier I keep `_`, so `snake_case_names` stays plain text.

Reading the spec explained why the closing `_` stayed literal, but it did not find the 13 lines. Those showed up only after a render, then a scan. The source looks intentional, so a diff review misses them until a parser refuses to close the delimiter. The check that caught them was the project's own parser at the time, micromark 4.0.2 under mdsvex.

If a Hangul syllable touches the closing `_`, that run does not become emphasis, and `*` still closes there.

## References

- [CommonMark Spec 0.31.2 - Emphasis and strong emphasis](https://spec.commonmark.org/0.31.2/#emphasis-and-strong-emphasis)
