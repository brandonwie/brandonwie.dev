---
title: class-validator @IsHexColor Accepts Alpha-Hex Forms
description: >-
  `@IsHexColor()` (class-validator, backed by validator.js `isHexColor`) accepts
  3, 4, 6, and 8-digit hex strings, including alpha forms `#RGBA` and...
date: 2026-07-22T00:00:00.000Z
updated: 2026-07-23T00:00:00.000Z
tags:
  - backend
  - knowledge
  - transferable
category: backend
draft: false
lang: en
expanded: true
references:
  - url: >-
      https://github.com/typestack/class-validator/blob/develop/src/decorator/string/IsHexColor.ts
    title: class-validator IsHexColor decorator source
    type: official
  - url: >-
      https://github.com/validatorjs/validator.js/blob/master/src/lib/isHexColor.js
    title: validator.js isHexColor source
    type: official
source_content_hash: 4e898408d5651b77b66fa29518451ed918a87b847fbfa21d5554230c50dd6c16
---

A DTO accepted a color that the corresponding normalizer did not understand.
Both pieces looked reasonable alone: `@IsHexColor()` validated the input, and
the normalizer handled the familiar three- and six-digit forms. Together they
allowed a value that violated the storage invariant.

The hidden detail is in the dependency chain. class-validator delegates
`@IsHexColor()` to validator.js, whose current regular expression accepts three,
four, six, and eight hexadecimal digits, with an optional `#`.

## Compare the accepted grammars

The validator's effective grammar is:

```typescript
const hexColor = /^#?([0-9A-F]{3}|[0-9A-F]{4}|[0-9A-F]{6}|[0-9A-F]{8})$/i;
```

A normalizer that only expands `#RGB` and lowercases `#RRGGBB` leaves `#RGBA`
and `#RRGGBBAA` outside its contract. Those values still pass validation.

Downstream lookups then see a valid but noncanonical value. A palette `Map`, cache,
or search index can miss the value and choose the wrong classification even
though the request passed its DTO.

## Choose one contract at the boundary

If the product only supports opaque RGB, narrow validation to the forms the
normalizer can represent:

```typescript
import { Matches } from 'class-validator';

class ColorInput {
  @Matches(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  color!: string;
}
```

Then normalize both accepted branches into a single six-digit lowercase form:

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

If alpha is part of the product contract, take the opposite approach: retain
`@IsHexColor()`, define a canonical eight-digit representation, and normalize
all four accepted lengths deliberately. Silently passing alpha forms through is
the dangerous middle state.

## Practical takeaway

Validation breadth and normalization breadth must match. When reviewing a
normalizer, start from the validator's implementation rather than its friendly
decorator name, enumerate every accepted branch, and test each one through the
full storage and lookup path.

This issue does not apply when alpha is a first-class value and the system
already stores it canonically. In that case, rejecting four- and eight-digit
forms would narrow a valid product feature.
