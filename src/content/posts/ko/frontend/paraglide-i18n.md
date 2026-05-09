---
title: SvelteKit용 Paraglide-JS i18n
description: 번들을 부풀리지 않고 런타임 오버헤드 없이 SvelteKit 정적 블로그에 한국어/영어 다국어 지원을 추가한 방법을 정리했어요.
date: 2026-01-28T00:00:00.000Z
updated: '2026-05-10'
tags:
  - frontend
  - i18n
  - svelte
  - sveltekit
category: frontend
draft: false
lang: ko
source_lang: en
source_slug: paraglide-i18n
source_updated: '2026-03-22'
translation_date: '2026-05-10'
references:
  - url: 'https://inlang.com/m/gerre34r/library-inlang-paraglideJs'
    title: Paraglide-JS 공식 문서
    type: official
  - url: 'https://svelte.dev/docs/kit/routing'
    title: SvelteKit Routing
    type: official
---

블로그에 한국어와 영어가 같이 필요했어요. SvelteKit의 adapter-static으로 정적
생성되는 사이트라서, i18n 솔루션이 빌드 타임에 번역을 해결해 줘야 했어요. 런타임
파서를 브라우저로 내려보내면 안 됐어요. 대부분의 i18n 라이브러리는 이 요구사항에서
바로 떨어져 나갔어요.

## 대부분의 i18n 라이브러리가 안 된 이유

네 가지 접근법을 비교했어요.

| 옵션                     | 장점                                                                                   | 단점                                                 |
| ------------------------ | -------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Paraglide-JS             | 작은 번들 (tree-shaking), 완전한 타입 안정성, 컴파일 타임, SvelteKit 네이티브 플러그인 | 신생 라이브러리, 작은 커뮤니티, 문서 미성숙          |
| svelte-i18n              | 검증된 Svelte 생태계, 런타임 유연성                                                    | 런타임 파싱 오버헤드, 중간 번들, 수동 SvelteKit 통합 |
| i18next + svelte adapter | 거대한 생태계, 복수형/포맷팅 플러그인                                                  | 큰 번들, 컴파일 타임 아님, 수동 SvelteKit 연결       |
| DIY JSON + store         | 의존성 없음, 완전한 제어                                                               | 타입 안정성 없음, 도구를 처음부터 구축               |

svelte-i18n과 i18next는 둘 다 런타임에 번역을 파싱해요. 파서, 로케일 파일
로더, 인터폴레이션 로직을 브라우저에 같이 보내야 한다는 뜻이에요. 번역 키가
30개쯤인 정적 블로그에는 너무 큰 오버헤드예요.

JSON 파일과 Svelte store로 직접 만드는 방법도 있지만, 타입 안정성이 없으면
키 이름을 일일이 외우게 되고 오타도 런타임에서 터져요.

Paraglide-JS가 이긴 이유는 빌드 타임에 번역을 평범한 JavaScript 함수로 컴파일해
주기 때문이에요. 결과물은 tree-shaking이 되고, 타입이 안전하고, 번들에 거의
아무것도 추가하지 않아요.

| 기능           | Paraglide           | svelte-i18n | i18next |
| -------------- | ------------------- | ----------- | ------- |
| 번들 크기      | 작음 (tree-shaking) | 중간        | 큼      |
| 타입 안정성    | 완전                | 부분적      | 부분적  |
| 컴파일 타임    | 예                  | 아니오      | 아니오  |
| SvelteKit 통합 | 네이티브            | 수동        | 수동    |

## 설정하기

```bash
npx @inlang/paraglide-js init
```

세 가지가 생겨요.

- `project.inlang/settings.json` - 설정 파일
- `messages/en.json` - 영어 메시지
- `src/lib/paraglide/` - 생성된 런타임 (편집하지 마세요)

## 메시지 파일 작성

메시지는 언어별 JSON 파일에 적어요.

```json
// messages/en.json
{
  "site_title": "Brandon Wie | Software Engineer",
  "welcome_message": "Welcome to my blog"
}

// messages/ko.json
{
  "site_title": "Brandon Wie | 소프트웨어 엔지니어",
  "welcome_message": "블로그에 오신 걸 환영해요"
}
```

## 컴포넌트에서 사용하기

생성된 메시지 함수를 import해서 호출해요.

```svelte
<script>
  import * as m from '$lib/paraglide/messages';
</script>

<h1>{m.site_title()}</h1>
<p>{m.welcome_message()}</p>
```

메시지가 문자열이 아니라 함수인 이유는 파라미터를 받을 수 있기 때문이에요.

```json
{
  "greeting": "Hello, {name}!"
}
```

```svelte
{m.greeting({ name: 'Brandon' })}
```

키를 잘못 입력하거나 파라미터를 빠뜨리면 TypeScript가 빌드 타임에 잡아줘요.
런타임 "missing translation" 에러가 안 떠요.

## 라우트 기반 로케일 감지

SSG에서는 쿠키나 브라우저 감지 대신 라우트 기반 로케일을 써요.

```text
/           → 영어 (기본값)
/posts      → 영어 포스트
/ko         → 한국어
/ko/posts   → 한국어 포스트
```

한국어 레이아웃에서 language tag를 설정해요.

```svelte
<!-- src/routes/ko/+layout.svelte -->
<script>
  import { setLanguageTag } from '$lib/paraglide/runtime';
  setLanguageTag('ko');
</script>

<slot />
```

`/ko/` 아래의 모든 페이지가 자동으로 한국어 번역을 받아요. 미들웨어도, 쿠키도,
클라이언트 사이드 감지도 필요 없어요. 정적 사이트 생성기가 빌드 타임에 양쪽
언어 버전을 모두 프리렌더링해 줘요.

## 언어 전환 컴포넌트 만들기

전환 컴포넌트는 현재 경로를 조작해서 다른 언어의 URL을 만들어요.

```svelte
<script lang="ts">
  import { page } from '$app/stores';
  import { languageTag } from '$lib/paraglide/runtime';

  const currentLang = languageTag();

  // 다른 언어 URL 생성
  $: currentPath = $page.url.pathname;
  $: alternateUrl = currentLang === 'en'
    ? `/ko${currentPath}`
    : currentPath.replace(/^\/ko/, '') || '/';
</script>

<a href={alternateUrl}>
  {currentLang === 'en' ? '한국어' : 'English'}
</a>
```

루트 경로가 엣지 케이스예요. `/ko`에서 `/ko`를 떼면 빈 문자열이 돼서
`|| '/'` 폴백이 꼭 필요해요.

## Vite 연결

Paraglide는 Vite 플러그인을 통해 SvelteKit과 통합돼요.

```typescript
// vite.config.ts
import { paraglideVitePlugin } from "@inlang/paraglide-js";

export default defineConfig({
  plugins: [
    paraglideVitePlugin({
      project: "./project.inlang",
      outdir: "./src/lib/paraglide",
    }),
  ],
});
```

플러그인이 메시지 파일을 지켜보다가 번역을 추가하거나 수정할 때마다 런타임
코드를 다시 생성해요. `src/lib/paraglide/` 안의 코드는 자동 생성물이라 직접
손대면 안 돼요.

## 까다로웠던 부분들

**SSG 호환성이 명확하지 않았어요.** 대부분의 Paraglide 예제가 로케일 감지에
서버사이드 미들웨어를 가정해요. 레이아웃에서 `setLanguageTag`를 호출하는
라우트 기반 감지가 SSG에 어울리는 접근이라는 걸 알아내는 데 시간이 걸렸어요.

**생성된 런타임이 불투명해요.** Paraglide는 손대면 안 되는 코드를
`src/lib/paraglide/`에 생성해요. `setLanguageTag`(로케일 설정)와
`languageTag`(현재 로케일 읽기)의 차이를 이해하려고 생성된 소스 코드를 직접
열어 봐야 했어요. 문서가 이 부분에선 좀 부족했거든요.

**언어 전환 URL 구성에 엣지 케이스가 있어요.** 루트 경로(`/ko`에서 `/`)와
중첩 경로(`/ko/posts/my-post`에서 `/posts/my-post`)는 경로명을 꼼꼼히
다듬어야 해요. 양쪽 다 테스트해 두세요.

## 이런 경우에 사용하세요

- 경량 i18n이 필요한 SvelteKit 프로젝트 (특히 SSG)
- 번역 키에 대한 타입 안정성이 중요한 프로젝트
- 소규모에서 중규모 번역 세트 (개인 사이트, 블로그, 포트폴리오)
- 번들 크기가 중요하고 런타임 오버헤드가 최소여야 할 때

## 이런 경우에는 사용하지 마세요

- **CMS/데이터베이스의 동적 번역** -- Paraglide는 빌드 타임에 메시지를
  컴파일하니까, 재배포 없이 번역이 자주 바뀌어야 한다면 i18next 같은 런타임
  라이브러리가 더 맞아요.
- **비기술 번역가가 있는 큰 팀** -- Paraglide는 코드베이스의 JSON 파일을
  쓰니까, 번역 관리 플랫폼(Crowdin, Lokalise)이 필요한 팀은 i18next 생태계가
  더 잘 맞아요.
- **복잡한 ICU 메시지 문법** -- 고급 복수형, 성별 일치, 중첩 선택이 필요하면
  i18next나 FormatJS가 더 성숙한 ICU 지원을 갖고 있어요.
- **SvelteKit이 아닌 프레임워크** -- Paraglide의 DX는 SvelteKit에 최적화돼
  있어서, React/Next.js나 Vue/Nuxt에서는 프레임워크 네이티브 i18n 솔루션을
  쓰는 게 좋아요.

## 핵심 정리

Paraglide-JS는 런타임 비용 없이 컴파일 타임 i18n과 완전한 타입 안정성을 원할 때
올바른 선택이에요. SvelteKit SSG에서의 설정은 간단해요. 라우트 기반 로케일,
language tag를 설정하는 레이아웃, JSON 메시지 파일이면 끝이에요. 트레이드오프는
i18next에 비해 작은 커뮤니티와 아직 성숙 중인 문서지만, 두 개 언어를 지원하는
개인 블로그에는 충분히 받아들일 만해요.
