---
title: class-validator의 @IsHexColor는 alpha hex도 허용해요
description: >-
  @IsHexColor()가 허용하는 3, 4, 6, 8자리 형식과 normalizer의 범위가
  어긋날 때 생기는 문제를 정리했어요.
date: 2026-07-22T00:00:00.000Z
updated: 2026-07-23T00:00:00.000Z
tags:
  - backend
  - knowledge
  - transferable
category: backend
draft: false
lang: ko
source_lang: en
source_slug: class-validator-ishexcolor-alpha-forms
source_updated: 2026-07-23T00:00:00.000Z
translation_date: 2026-07-23
references:
  - url: >-
      https://github.com/typestack/class-validator/blob/develop/src/decorator/string/IsHexColor.ts
    title: class-validator IsHexColor decorator source
    type: official
  - url: >-
      https://github.com/validatorjs/validator.js/blob/master/src/lib/isHexColor.js
    title: validator.js isHexColor source
    type: official
---

DTO가 통과시킨 색상을 normalizer가 처리하지 못하는 문제를 만났어요. 각각만 보면
자연스러웠어요. `@IsHexColor()`로 입력을 검사했고, normalizer는 익숙한 3자리와
6자리 형식을 다뤘거든요. 하지만 두 범위를 합치니 저장 규칙에 맞지 않는 값이
들어올 수 있었어요.

원인은 dependency chain에 있었어요. class-validator의 `@IsHexColor()`는
validator.js에 위임하며, 현재 정규식은 선택적인 `#` 뒤에 3, 4, 6, 8개의
16진수를 모두 허용해요.

## 허용하는 문법부터 비교해요

validator가 실제로 쓰는 문법은 다음과 같아요.

```typescript
const hexColor = /^#?([0-9A-F]{3}|[0-9A-F]{4}|[0-9A-F]{6}|[0-9A-F]{8})$/i;
```

`#RGB`만 확장하고 `#RRGGBB`를 소문자로 바꾸는 normalizer라면 `#RGBA`와
`#RRGGBBAA`는 범위 밖이에요. 그래도 validation은 통과해요.

그 결과 뒤쪽 lookup에는 유효하지만 정규화되지 않은 값이 들어가요. palette
`Map`, cache, search index가 같은 색을 찾지 못해 잘못 분류할 수 있어요.

## boundary에서 한 가지 contract를 골라요

제품이 불투명한 RGB만 지원한다면 normalizer가 표현할 수 있는 형식으로
validation을 좁혀요.

```typescript
import { Matches } from 'class-validator';

class ColorInput {
  @Matches(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  color!: string;
}
```

그다음 두 입력을 모두 소문자 6자리 형식으로 맞춰요.

```typescript
function normalizeOpaqueHex(input: string): string {
  const value = input.replace(/^#/, '').toLowerCase();
  const expanded =
    value.length === 3
      ? value
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : value;

  return `#${expanded}`;
}
```

alpha가 제품 contract에 들어간다면 반대로 처리해요. `@IsHexColor()`는 그대로
두고 8자리 canonical 형식을 정한 뒤 네 가지 길이를 모두 의도적으로
정규화해요. alpha를 검증만 통과시키고 뒤로 흘려보내는 중간 상태가 가장
위험해요.

## 확인할 기준

validation 범위와 normalization 범위는 같아야 해요. normalizer를 review할
때는 decorator의 친근한 이름만 보지 말고 실제 구현에서 허용하는 branch를
전부 나열해요. 각 형식을 저장과 lookup까지 통과시키는 test도 필요해요.

alpha를 처음부터 1급 값으로 다루고 canonical하게 저장하는 시스템이라면 이
문제는 적용되지 않아요. 그런 경우 4자리와 8자리 형식을 거부하면 오히려
정상적인 기능을 줄이게 돼요.
