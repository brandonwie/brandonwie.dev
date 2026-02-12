---
title: "Giscus SvelteKit 통합하기"
description: >-
  데이터베이스나 인증 백엔드 없이 정적 생성 SvelteKit 블로그에 댓글 시스템을 추가하는 방법을 알아봅니다.
date: 2026-01-28T00:00:00.000Z
updated: 2026-01-28T00:00:00.000Z
tags:
  - frontend
  - svelte
  - comments
category: frontend
draft: false
lang: ko
source_lang: en
source_slug: giscus-sveltekit-integration
source_updated: "2026-01-28"
translation_date: "2026-02-12"
references:
  - url: "https://giscus.app"
    title: giscus - GitHub Discussions 기반 댓글 시스템
    type: official
  - url: "https://github.com/giscus/giscus"
    title: giscus GitHub 저장소
    type: official
---

블로그에 댓글 기능이 필요했어요. 데이터베이스도, 인증 백엔드도, SaaS 월 구독료도
원하지 않았습니다. 독자가 개발자이고 이미 GitHub 계정이 있으니까, 답은 바로 거기
있었어요. GitHub Discussions를 댓글 백엔드로 쓰는 것이죠.

Giscus가 바로 이걸 해줍니다. GitHub Discussions를 script 태그 하나로 삽입할 수
있는 댓글 위젯으로 바꿔주는 도구예요. 서버도, 데이터베이스도, 트래킹도 없습니다.
다만 다국어 SvelteKit 정적 사이트에 연결하는 과정에서 문서에 나오지 않는 몇 가지
문제가 있었습니다.

## 왜 Giscus를 선택했나

네 가지 옵션을 비교했습니다.

| 옵션                        | 장점                                               | 단점                                          |
| --------------------------- | -------------------------------------------------- | --------------------------------------------- |
| Giscus (GitHub Discussions) | 무료, DB 불필요, GitHub 인증, 프라이버시, 오픈소스 | 댓글 작성에 GitHub 계정 필요                  |
| Disqus                      | 널리 사용됨, 쉬운 설정                             | 광고, 트래킹, 무거운 JS 번들, 프라이버시 문제 |
| Utterances (GitHub Issues)  | Giscus와 유사, 간단                                | Issues 사용 (댓글용이 아님), 리액션 없음      |
| Self-hosted (예: Commento)  | 완전한 제어, 서드파티 없음                         | 서버, 데이터베이스, 유지보수 필요             |

Disqus는 바로 탈락이었어요. 개인 블로그에 광고와 트래킹 스크립트를 심을 생각은
없었습니다. Utterances는 비슷했지만 GitHub Issues를 원래 용도가 아닌 곳에
사용하고, 리액션 기능도 없었어요. Self-hosted는 관리하고 싶지 않은 인프라를
뜻했습니다.

Giscus가 이긴 이유는 독자가 개발자(이미 GitHub 계정 보유)이고, 인프라가 전혀
필요 없고, 사용자 프라이버시를 존중하며(트래킹 없음, GDPR 준수), 대화용으로
설계된 Discussions를 사용하기 때문입니다.

| 기능                | 장점                                 |
| ------------------- | ------------------------------------ |
| GitHub 인증         | 독자가 이미 계정 보유                |
| 데이터베이스 불필요 | GitHub Discussions에 댓글 저장       |
| 프라이버시 중심     | 트래킹 없음, GDPR 준수               |
| 무료                | 오픈소스, 비용 없음                  |
| 테마 지원           | 사이트 테마에 맞게 커스터마이징 가능 |

## 설정 방법

### 1. GitHub Discussions 활성화

1. 저장소 Settings에서 Features로 이동
2. "Discussions" 체크
3. 카테고리 생성 (예: "Blog Comments") - Announcements 타입

### 2. giscus.app에서 설정

[giscus.app](https://giscus.app)에서 설정합니다:

- **Repository:** `owner/repo`
- **Mapping:** "Discussion title contains a specific term" (스레드 공유용)
- **Category:** 생성한 카테고리 선택
- **Features:** 리액션, lazy loading 활성화
- **Theme:** 다크 사이트는 `dark_dimmed`

생성된 `data-repo-id`와 `data-category-id`를 복사합니다.

### 3. Svelte 컴포넌트 만들기

마운트 시 Giscus 스크립트를 동적으로 주입하는 컴포넌트입니다:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    slug: string;
    lang?: 'en' | 'ko';
  }

  let { slug, lang = 'en' }: Props = $props();
  let containerRef: HTMLDivElement;

  onMount(() => {
    const script = document.createElement('script');
    script.src = 'https://giscus.app/client.js';
    script.async = true;
    script.crossOrigin = 'anonymous';

    // giscus.app에서 가져온 설정값
    script.dataset.repo = 'owner/repo';
    script.dataset.repoId = 'R_xxxxx';
    script.dataset.category = 'Blog Comments';
    script.dataset.categoryId = 'DIC_xxxxx';
    script.dataset.mapping = 'specific';
    script.dataset.term = slug;  // EN/KO 스레드 공유를 위해 slug 사용
    script.dataset.strict = '0';
    script.dataset.reactionsEnabled = '1';
    script.dataset.emitMetadata = '0';
    script.dataset.inputPosition = 'top';
    script.dataset.theme = 'dark_dimmed';
    script.dataset.lang = lang;
    script.dataset.loading = 'lazy';

    containerRef.appendChild(script);
  });
</script>

<section class="comments-section">
  <h2>Comments</h2>
  <div bind:this={containerRef}></div>
</section>
```

핵심은 `script.dataset.term = slug` 라인이에요. 이것이 다국어 댓글 공유를
가능하게 해주는데, 다음에 자세히 설명하겠습니다.

## 다국어 댓글 공유 문제 (그리고 해결법)

이 블로그는 같은 글에 대해 영어와 한국어 버전이 다른 경로에 있어요:
`/posts/my-post`와 `/ko/posts/my-post`. 설정을 잘못하면 Giscus가 같은 콘텐츠에
대해 두 개의 별도 Discussion 스레드를 만들게 됩니다.

해결법은 전체 경로 대신 포스트의 slug만 Discussion term으로 사용하는 거예요:

```javascript
script.dataset.term = slug; // "/ko/posts/my-post"가 아닌 "my-post"
```

이렇게 하면 `/posts/my-post`와 `/ko/posts/my-post`가 같은 댓글 스레드를
공유합니다. 영어와 한국어 독자가 같은 대화를 봐요.

## Localhost 댓글이 프로덕션에 나타나는 문제

이건 놀라웠어요. 로컬 개발 중에 작성한 댓글이 라이브 사이트에 나타났습니다.
Giscus는 도메인이 아닌 slug로 매핑하기 때문에 `localhost:5173/posts/my-post`와
`brandonwie.dev/posts/my-post`가 같은 Discussion 스레드를 사용합니다.

문제가 되면 두 가지 방법이 있어요:

1. GitHub Discussions에서 테스트 댓글을 수동 삭제
2. 환경별 term prefix 사용:

```javascript
const isDev = import.meta.env.DEV;
script.dataset.term = isDev ? `dev-${slug}` : slug;
```

저는 로컬에서 댓글을 거의 테스트하지 않아서 1번을 택했지만, 자주 테스트한다면
2번이 더 깔끔합니다.

## 주의: Svelte 중괄호 파싱

Svelte는 HTML 주석 안에서도 `{anything}`을 표현식으로 해석합니다. `.svelte`
파일에서 이렇게 쓰면:

```svelte
<!-- BAD: "variable is not defined" 에러 발생 -->
<!-- Note: {variable} will be interpreted -->

<!-- GOOD: 주석에서 중괄호 사용하지 않기 -->
<!-- Note: curly braces will be interpreted -->
```

Giscus 설정값을 코드 주석에 문서화할 때 이 문제로 이해하기 어려운 빌드 에러가
발생했어요. 해결법은 Svelte HTML 주석에서 중괄호를 완전히 피하는 것입니다.
백틱 코드 블록을 사용하거나 문서를 템플릿 밖으로 옮기세요.

## 테마 동기화

Giscus iframe을 다크 터미널 테마에 맞추는 데 시행착오가 있었어요. 테마 이름
문자열이 직관적이지 않습니다: `dark_dimmed`는 `dark`나 `transparent_dark`와
다릅니다. 이 사이트의 `#1a1a1a` 배경에 가장 잘 어울리는 `dark_dimmed`를
최종적으로 선택했어요.

## 이런 경우에 사용하세요

- 독자가 GitHub 계정을 가진 개발자인 블로그나 문서 사이트
- 댓글 백엔드를 실행할 수 없는 정적 사이트 (SSG)
- 비용 없이, 유지보수 없이 댓글 기능이 필요한 프로젝트
- 프라이버시와 트래킹 없음이 중요한 사이트

## 이런 경우에는 사용하지 마세요

- **개발자가 아닌 독자** -- GitHub 계정이 필요하므로 일반 독자 대부분이 댓글을
  달 수 없게 됩니다
- **댓글이 많은 사이트** -- GitHub Discussions API에 rate limit가 있어서 포스트당
  수천 개의 댓글이 예상되면 전용 시스템이 필요합니다
- **오프라인 우선 또는 자체 호스팅 요구사항** -- Giscus는 GitHub 인프라에
  의존하므로 GitHub이 다운되면 댓글을 사용할 수 없습니다
- **모더레이션 도구 필요** -- GitHub Discussions 모더레이션은 Disqus나 커스텀
  솔루션에 비해 기본적입니다 (스팸 필터, 키워드 차단 없음)
- **비공개 저장소** -- Giscus는 Discussions 백엔드로 공개 저장소가 필요합니다

## 핵심 정리

Giscus는 개발자 블로그에 댓글을 추가하는 가장 간단한 방법이에요. 설정은 약
15분이면 돼요: Discussions 활성화, giscus.app에서 설정, Svelte 컴포넌트 추가.
기억해야 할 두 가지 주의점은 다국어 댓글 공유를 위해 전체 경로가 아닌 slug를
사용하는 것과, term에 prefix를 추가하지 않으면 localhost 댓글이 프로덕션에
나타난다는 것입니다.
