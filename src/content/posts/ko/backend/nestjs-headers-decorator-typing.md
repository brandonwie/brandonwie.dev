---
title: NestJS @Headers decorator는 string | undefined를 리턴해요
description: >-
  NestJS `@Headers('key')`는 `string[]`가 아니라 `string | undefined`를 리턴해요.
  Express가 중복된 custom header를 쉼표로 합쳐 주거든요.
date: 2026-04-08T00:00:00.000Z
updated: '2026-04-11'
tags:
  - backend
  - nestjs
  - express
  - http-headers
  - typescript
category: backend
draft: false
lang: ko
source_lang: en
source_slug: nestjs-headers-decorator-typing
source_updated: 2026-04-11T00:00:00.000Z
translation_date: '2026-04-11'
---

NestJS 컨트롤러에서 `@Headers('x-client-type') clientType?: string`이라고 쓸 때, `clientType`의 실제 타입은 뭐가 맞을까요? Node.js의 `IncomingHttpHeaders` 타입을 찾아보면 `{ [key: string]: string | string[] | undefined }`로 정의돼 있어요. 이걸 보면 어떤 header든 배열이 될 수 있어 보여요. 그러니 parameter를 `string | string[] | undefined`로 annotation하고, 값을 쓰기 전에 배열을 normalize해야 할 것 같죠.

그럴 필요 없어요. NestJS의 `@Headers('specific-key')`는 모든 custom header에 대해 `string | undefined`를 리턴해요. 유일한 예외는 `set-cookie`뿐이에요. 이것만 여전히 `string[]`로 남아 있어요.

이 글을 쓰게 된 계기는, 제 PR 중 하나에서 Copilot review가 `clientTypeHeader?: string`이 잘못됐다고 flag를 걸었기 때문이에요. Express의 raw type signature를 근거로 들더라고요. false positive였는데 논리가 그럴싸해서 확인 차 Node.js HTTP source까지 파봤어요. 그런데 답은 `IncomingHttpHeaders` 타입이 알려주는 것보다 훨씬 구체적이었어요.

## 왜 타입이 `string | string[]`보다 좁은지

NestJS 기본 adapter 밑에서 돌아가는 HTTP framework인 Express는 중복된 custom header를 handler에 도달하기 전에 normalize해요. 클라이언트가 `X-Forwarded-For` header를 두 번 보내면 Express가 `, `(쉼표 + 공백)로 합쳐서 단일 문자열로 만들어요. handler가 보는 건 배열 두 개가 아니라 문자열 하나예요.

`set-cookie` header가 유일한 예외예요. Node.js HTTP는 `set-cookie`를 배열로 보존해요. 쿠키는 안전하게 합칠 수 없거든요. 각 값이 자기만의 expiry, path, flag 의미를 가진 독립된 header line이라서, 쉼표로 합치면 쿠키가 깨져 버려요. 그래서 `req.headers['set-cookie']`는 진짜로 `string[]`을 리턴해요. `IncomingHttpHeaders`의 index signature가 배열 형태를 포함할 수밖에 없는 이유가 바로 이거예요.

나머지 header는 전부 `req.headers[key]`가 `string | undefined`를 리턴해요. NestJS `@Headers('key')`가 runtime에서 반영하는 것도 이거예요.

## 컨트롤러에선 어떻게 쓰면 되는지

배열 normalize 없이 더 좁은 타입을 바로 쓰면 돼요.

```typescript
// 올바른 예 — 배열 처리가 필요 없어요
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

혹시 framework가 나중에 바뀔 가능성을 방어하고 싶다면 inference에 맡기지 말고 `string | undefined`로 명시적 annotation을 해도 돼요. 하지만 custom header에 `string | string[] | undefined`를 쓸 일은 절대 없어요.

## 넓은 타입이 진짜로 필요한 순간

- **`set-cookie` 처리.** `@Headers('set-cookie')`로 `set-cookie`를 잡을 땐 `string[]`로 다뤄 주세요. 이건 진짜 예외예요. 근데 실전에서 inbound 쪽에서 `set-cookie`를 건드리는 handler는 거의 없어요. 쿠키는 보통 별개의 `Cookie` header나 cookie parser middleware로 읽거든요.
- **Raw `req.headers` 접근.** NestJS decorator를 우회해서 `req.headers[key]`를 직접 읽는다면 그땐 Node.js의 넓은 타입을 보게 되니까, annotation이 양쪽 변형을 다 커버해야 해요.

## 정리

NestJS 컨트롤러의 `@Headers('key')`는 모든 custom header에 대해 `string | undefined`를 리턴해요. Express가 중복 header를 쉼표로 합쳐 주기 때문에 이게 안전해요. 사람을 헷갈리게 하는 건 `IncomingHttpHeaders` 타입 signature예요. 오직 `set-cookie`를 수용하기 위해서 index signature에 `string[]`이 들어가 있어요. 여기에 속아서 필요도 없는 배열 처리 코드를 쓰지 마세요.

AI reviewer가 좁은 annotation을 잘못됐다고 flag한다면, 그 review는 거의 틀림없이 Express의 raw 타입만 따로 보고 있는 거예요. NestJS decorator가 실제로 뭘 리턴하는지는 따라가지 않은 거죠. 이 실패 유형, 그리고 AI code review tool이 framework 동작을 잘못 이해하는 세 가지 다른 방식에 대한 더 넓은 분석은 [AI code review confusion patterns](/posts/ai-code-review-confusion-patterns)에서 볼 수 있어요. 이 case가 제가 Cross-File Blindness라고 부르는 패턴의 대표 예시예요. 한 파일의 타입 signature만 분석하고, 그걸 소비하는 decorator는 확인하지 않는 유형이에요.
