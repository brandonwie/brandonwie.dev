---
title: 'NestJS Swagger: type is Silently Ignored When content is Provided'
description: >-
  When `@ApiResponse` sees both `type` and `content`, NestJS Swagger silently
  drops `type` — so your DTO stops appearing in the Swagger UI Models tab.
date: 2026-04-06T00:00:00.000Z
updated: 2026-04-11T00:00:00.000Z
tags:
  - backend
  - nestjs
  - swagger
  - openapi
category: backend
draft: false
lang: en
expanded: true
source_content_hash: 806cbcd02650576ebe53941ce0be0114ed2d15a465b6ceb14ae33d053f277ba7
references:
  - url: 'https://docs.nestjs.com/openapi/operations#responses'
    title: 'NestJS Swagger — Operations: Responses'
    type: official
---

If you use `@ApiResponse` with both `type` and `content` fields in NestJS Swagger, only `content` takes effect. The `type` field is silently dropped — no warning, no error, no log line. The immediate symptom is subtle: your custom DTO stops appearing in Swagger UI's Models tab, even though the endpoint still renders a valid example response. The OpenAPI spec just never generates the `$ref` that would link the endpoint to the model schema.

I hit this while building a unified error response helper for a NestJS backend. The goal was a single `apiErrorResponse()` factory that every controller could call to register a typed error schema with a concrete example payload. Passing `type: ErrorResponseDto` seemed like the natural way to register the type, and the example still rendered in Swagger UI, so it looked like it worked. But when a teammate opened the Models tab to see the error shape, `ErrorResponseDto` was nowhere in the list. Both Claude and Copilot AI reviewers independently flagged this on the PR, which is how the root cause surfaced.

## The gotcha

Here is the pattern that silently breaks:

```typescript
// BAD: `type` is ignored — ErrorResponseDto will not appear in Models
apiErrorResponse(): ApiResponseOptions {
  return {
    status: 404,
    type: ErrorResponseDto, // <-- dropped
    content: {
      'application/json': {
        example: { error: { code: 'ERR_NOT_FOUND', message: 'Not found' } },
      },
    },
  };
}
```

There is no compile-time warning. No runtime error. The factory returns a valid `ApiResponseOptions` object, the decorator accepts it, and the generated OpenAPI spec happily renders `example` in the response body — just without a schema reference. The DTO class exists, but the spec has no way to mention it.

## Why it happens

NestJS Swagger's response resolver treats `type` and `content` as mutually exclusive. When both are present, `content` wins. The resolver never falls back to `type`, and there is no warning because the decorator signature allows both fields simultaneously — the type system does not model the "pick one" constraint.

Functionally this is defensible: `content` is the more expressive field (it can describe multiple media types with different schemas), so it is natural for it to take precedence. The trap is that the decorator accepts the combined form without complaint, so you only notice the bug when someone actually opens the Models tab.

## The fix

Drop the `type` field entirely and register the DTO via `$ref` inside `content`:

```typescript
import { getSchemaPath } from '@nestjs/swagger';

apiErrorResponse(): ApiResponseOptions {
  return {
    status: 404,
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ErrorResponseDto) },
        example: { error: { code: 'ERR_NOT_FOUND', message: 'Not found' } },
      },
    },
  };
}
```

`getSchemaPath()` returns a JSON Pointer string in the form `#/components/schemas/ErrorResponseDto`. That is exactly what the OpenAPI spec expects for a schema reference. The rendered output now carries both the example and the schema link, so the Models tab populates correctly.

**Prerequisite:** Controllers must register the DTO at class level using `@ApiExtraModels(ErrorResponseDto)`. Without that, `getSchemaPath()` resolves to a path that NestJS Swagger never emits into the spec, so the reference ends up dangling. The `@ApiExtraModels` decorator tells the module "include this DTO in `components/schemas` even if no endpoint references it via `type`" — which is the whole point when you're routing everything through `$ref`.

```typescript
@Controller('users')
@ApiExtraModels(ErrorResponseDto)
export class UsersController {
  @Get(':id')
  @ApiResponse(apiErrorResponse())
  async findOne(@Param('id') id: string) {
    // ...
  }
}
```

## How to verify

After the change, start the app and open Swagger UI. Two places to check:

1. **Models tab:** `ErrorResponseDto` should appear in the list, with its schema rendered (fields, types, descriptions).
2. **Endpoint response section:** The 404 response should link to the DTO as a clickable reference.

If the Models tab is still empty, `@ApiExtraModels` is probably missing. If the endpoint shows the example but no schema link, `type` is still set somewhere — grep for `type:` in the helper file and make sure it is gone.

## Takeaway

- NestJS Swagger treats `type` and `content` as mutually exclusive on `@ApiResponse`. When both are set, `content` wins silently.
- Use `getSchemaPath()` inside `content` to build a `$ref` when you need both a schema link and a literal example payload.
- Always pair `$ref` with `@ApiExtraModels` on the controller, or the reference dangles.
- The bug has no type-level or runtime signal — the only reliable catch is opening Swagger UI and looking at the Models tab yourself.
