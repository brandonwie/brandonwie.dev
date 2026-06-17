---
title: NestJS @Headers Decorator Returns string | undefined
description: >-
  NestJS `@Headers('key')` returns `string | undefined`, not `string[]` —
  Express normalizes duplicate custom headers by joining them with comma-space.
date: 2026-04-08T00:00:00.000Z
updated: 2026-04-11T00:00:00.000Z
tags:
  - backend
  - nestjs
  - express
  - http-headers
  - typescript
category: backend
draft: false
lang: en
expanded: true
source_content_hash: 96b189144346decb8c61404f27f610a62d16c8b7ee88cbd587731ad8a3c35e47
references:
  - url: 'https://docs.nestjs.com/controllers#headers'
    title: 'NestJS — Controllers: Request object and @Headers'
    type: official
---

In a NestJS controller, when you write `@Headers('x-client-type') clientType?: string`, what type should `clientType` actually be? If you look up Node.js's `IncomingHttpHeaders` type, it is defined as `{ [key: string]: string | string[] | undefined }`, which suggests any header value could be an array. That implies you should annotate the parameter as `string | string[] | undefined` and normalize the array before using the value.

You do not need to do that. NestJS's `@Headers('specific-key')` returns `string | undefined` for every custom header. The only exception is `set-cookie`, which remains `string[]`.

I am writing this post because a Copilot review flagged `clientTypeHeader?: string` as incorrect on one of my PRs, citing Express's raw type signature. The flag was a false positive, but it was articulate enough that I went into the Node.js HTTP source to confirm — and the answer is more specific than the `IncomingHttpHeaders` type suggests.

## Why the type is narrower than `string | string[]`

Express (the HTTP framework underneath NestJS's default adapter) normalizes duplicate custom headers before they reach your handler. If a client sends two `X-Forwarded-For` headers, Express joins them with `, ` (comma-space) into a single string value. Your handler sees one string, not an array of two.

The `set-cookie` header is the sole exception. Node.js HTTP preserves `set-cookie` as an array because cookies cannot be safely joined — each value is its own header line with independent expiry, path, and flag semantics. Joining them with commas would produce corrupted cookies. So `req.headers['set-cookie']` genuinely returns `string[]`, and that is why the `IncomingHttpHeaders` index signature has to include the array form at all.

For every other header, `req.headers[key]` returns `string | undefined`, which is what NestJS `@Headers('key')` reflects at runtime.

## What this means for your controllers

You can use the narrower type directly without any array normalization:

```typescript
// Correct — no array handling needed
@Get()
findAll(
  @Headers('x-client-type') clientType?: string,
) {
  if (clientType) {
    return this.handle(parseClientType(clientType));
  }
  return this.handle('unknown');
}
```

If you want to be extra-defensive against a hypothetical framework change, you can annotate as `string | undefined` explicitly instead of relying on inference, but you never need to write `string | string[] | undefined` for a custom header.

## When the broader type actually matters

- **`set-cookie` processing.** If you grab `set-cookie` via `@Headers('set-cookie')`, treat it as `string[]` — it is the real exception. In practice, most request handlers never touch `set-cookie` on the inbound side, since cookies are read via the separate `Cookie` header or a cookie parser middleware.
- **Raw `req.headers` access.** If you bypass NestJS decorators and read `req.headers[key]` directly, you are looking at the broader Node.js type and your annotation needs to cover both variants.

## Takeaway

`@Headers('key')` in NestJS controllers returns `string | undefined` for every custom header. Express's normalization (joining duplicates with comma-space) is what makes this safe. The misleading part is the `IncomingHttpHeaders` type signature, which includes `string[]` in its index signature purely to accommodate `set-cookie`. Do not let that trick you into writing array-handling code you do not need.

If an AI reviewer flags the narrow annotation as wrong, the review is almost certainly looking at Express's raw type in isolation instead of tracing what the NestJS decorator actually returns. For a broader look at that failure mode — and three other ways AI code review tools get framework behavior wrong — see [AI Code Review Confusion Patterns](/posts/ai-code-review-confusion-patterns). This exact case is the canonical example of what I call Cross-File Blindness: analyzing a type signature in one file without checking the decorator that consumes it.
