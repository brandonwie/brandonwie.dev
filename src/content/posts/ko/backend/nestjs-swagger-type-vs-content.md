---
title: 'NestJS Swagger: content가 있으면 type은 조용히 무시돼요'
description: >-
  `@ApiResponse`에 `type`과 `content`를 같이 넣으면 NestJS Swagger가 `type`을
  조용히 떨어뜨려요. 그래서 DTO가 Swagger UI Models 탭에 안 나타나요.
date: 2026-04-06T00:00:00.000Z
updated: '2026-04-11'
tags:
  - backend
  - nestjs
  - swagger
  - openapi
category: backend
draft: false
lang: ko
source_lang: en
source_slug: nestjs-swagger-type-vs-content
source_updated: 2026-04-11T00:00:00.000Z
translation_date: '2026-04-11'
---

NestJS Swagger에서 `@ApiResponse`에 `type`과 `content`를 같이 쓰면 `content`만 적용돼요. `type`은 조용히 사라져요 — 경고도, 에러도, 로그 한 줄도 없어요. 증상은 미묘해요. 엔드포인트는 여전히 example response를 멀쩡히 렌더링하는데, 정작 Swagger UI의 Models 탭에 DTO가 안 나타나요. OpenAPI spec이 엔드포인트와 모델 schema를 이어 줄 `$ref`를 아예 만들지 않거든요.

NestJS 백엔드에서 통일된 error response helper를 만들다가 이 문제에 부딪혔어요. 목표는 하나의 `apiErrorResponse()` factory였어요. 컨트롤러마다 이걸 호출하면 type이 있는 error schema와 구체적인 example payload를 같이 등록해 주는 구조였어요. `type: ErrorResponseDto`를 넣는 게 type을 등록하는 가장 자연스러운 방법처럼 보였고, Swagger UI에서 example도 멀쩡히 렌더링되니까 잘 동작하는 것처럼 보였어요. 그런데 팀원이 Models 탭을 열어서 error 구조를 확인했을 때 `ErrorResponseDto`가 어디에도 없었어요. Claude와 Copilot AI reviewer가 각각 독립적으로 PR에서 이 문제를 지적해 줘서 원인이 드러났어요.

## 문제 패턴

조용히 깨지는 코드는 이런 모양이에요.

```typescript
// BAD: type은 무시돼요 — ErrorResponseDto가 Models 탭에 안 나타나요
apiErrorResponse(): ApiResponseOptions {
  return {
    status: 404,
    type: ErrorResponseDto, // <-- 버려져요
    content: {
      'application/json': {
        example: { error: { code: 'ERR_NOT_FOUND', message: 'Not found' } },
      },
    },
  };
}
```

컴파일 타임 경고도 없고, runtime 에러도 없어요. factory는 정상적인 `ApiResponseOptions` 객체를 리턴하고, decorator도 그대로 받아들이고, 생성된 OpenAPI spec도 response body에 `example`을 잘 렌더링해요. 단지 schema reference만 빠져 있을 뿐이에요. DTO 클래스는 존재하는데 spec에서는 그걸 언급할 방법이 없는 거죠.

## 왜 이런 일이 생기는지

NestJS Swagger의 response resolver는 `type`과 `content`를 상호배타적으로 다뤄요. 둘 다 있으면 `content`가 이겨요. resolver는 `type`으로 fallback하지 않고, decorator signature가 두 필드를 동시에 허용하기 때문에 경고도 없어요. 타입 시스템이 "둘 중 하나만 고르라"는 제약을 표현하지 못하는 거예요.

기능적으로는 이해가 가요. `content`가 더 표현력이 풍부한 필드거든요 (여러 미디어 타입을 각기 다른 schema로 기술할 수 있어요). 그러니 `content`가 우선권을 가지는 건 자연스러워요. 함정은 decorator가 이 조합을 아무 불평 없이 받아들인다는 점이에요. 그래서 버그는 누군가 실제로 Models 탭을 열어 보기 전까지 드러나지 않아요.

## 해결 방법

`type` 필드는 아예 빼고, `content` 안에서 `$ref`로 DTO를 등록해요.

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

`getSchemaPath()`는 `#/components/schemas/ErrorResponseDto` 같은 JSON Pointer 문자열을 리턴해요. 이건 OpenAPI spec이 schema reference로 기대하는 정확한 형식이에요. 이렇게 하면 결과물이 example과 schema link를 둘 다 담고 있어서 Models 탭도 제대로 채워져요.

**전제 조건:** 컨트롤러는 클래스 레벨에서 `@ApiExtraModels(ErrorResponseDto)`로 DTO를 등록해 줘야 해요. 이게 없으면 `getSchemaPath()`가 리턴하는 경로가 NestJS Swagger가 spec에 방출하지 않는 경로가 되면서 reference가 허공에 뜨게 돼요. `@ApiExtraModels` decorator는 모듈에게 "어떤 엔드포인트도 `type`으로 참조하지 않아도 이 DTO를 `components/schemas`에 포함시켜 달라"고 말하는 역할이에요. `$ref`로 모든 걸 연결할 때 이게 꼭 필요해요.

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

## 확인하는 방법

수정한 뒤 앱을 띄우고 Swagger UI를 열어 보면 돼요. 두 군데를 확인해요.

1. **Models 탭:** `ErrorResponseDto`가 리스트에 나타나야 해요. 필드, 타입, 설명까지 schema가 렌더링되어야 해요.
2. **엔드포인트 response 섹션:** 404 response가 DTO를 클릭 가능한 reference로 연결하고 있어야 해요.

Models 탭이 여전히 비어 있다면 `@ApiExtraModels` 등록이 빠져 있을 가능성이 높아요. 엔드포인트에 example은 보이는데 schema link가 없다면 어딘가에 여전히 `type`이 남아 있는 거예요. helper 파일에서 `type:`을 grep해서 완전히 제거됐는지 확인해 보세요.

## 정리

- NestJS Swagger는 `@ApiResponse`의 `type`과 `content`를 상호배타적으로 다뤄요. 둘 다 설정하면 `content`가 조용히 이겨요.
- schema link와 구체적인 example payload를 동시에 원할 땐 `content` 안에서 `getSchemaPath()`로 `$ref`를 만들어 주세요.
- `$ref`를 쓸 땐 반드시 컨트롤러에 `@ApiExtraModels`를 같이 걸어야 해요. 안 그러면 reference가 허공에 떠요.
- 이 버그는 타입 레벨에서도, runtime에서도 신호를 주지 않아요. 믿을 수 있는 유일한 확인 방법은 직접 Swagger UI를 열고 Models 탭을 보는 거예요.
