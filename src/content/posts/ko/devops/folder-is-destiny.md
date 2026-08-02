---
title: '폴더가 곧 운명이다: 6계층 정보 생애주기'
description: '3B는 폴더 위치만으로 검색 가능 여부, 공개 범위, 노화 정도를 결정해요. 물리적 위치와 의미가 어긋나는 경우에만 frontmatter로 예외를 둬요.'
date: 2026-06-15T00:00:00.000Z
updated: '2026-08-02'
tags:
  - 3b
  - devops
  - architecture
category: devops
draft: false
lang: ko
source_lang: en
source_slug: folder-is-destiny
source_updated: '2026-08-02'
translation_date: '2026-06-17'
references:
  - url: 'https://rubyonrails.org/doctrine'
    title: 'The Rails Doctrine — Convention over Configuration'
    type: authoritative
  - url: 'https://gohugo.io/content-management/front-matter/'
    title: Hugo front matter reference
    type: official
  - url: 'https://www.rfc-editor.org/rfc/rfc9309.html'
    title: 'RFC 9309 — Robots Exclusion Protocol'
    type: official
  - url: >-
      https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag
    title: Google Search Central — robots meta tag specifications
    type: official
---

파일을 어느 폴더에 두느냐가 그 파일의 거의 모든 걸 정해버린다면 어떨까요. 검색에 걸릴지, 기계가 읽어도 되는지, 얼마나 오래 묵혀도 되는지까지요. 3B에서는 폴더 위치 하나가 이 질문들에 먼저 답을 줘요. 물리적 위치와 의미가 어긋나는 5%만 frontmatter로 따로 표시하고요.

## 폴더는 정책이에요

대부분의 repository에서 폴더는 그냥 길 안내에 가까워요. `docs/`에는 문서가, `src/`에는 코드가, `tmp/`에는 다들 나중에 지우길 바라는 것들이 들어가요. 도구들이 이 폴더를 신경 쓰긴 하지만, 정작 정책은 다른 데 흩어져 있을 때가 많아요. script에는 allow-list가 하나 있고, crawler에는 또 다른 게 있고, 발행 단계에는 세 번째 규칙이 있고, 예외는 사람이 기억하죠.

3B는 폴더 위치 자체를 정책으로 봐요.

파일 경로는 그 파일이 어떤 종류의 정보인지, 기계가 index해도 되는지, 얼마나 묵혀도 되는지를 시스템에 알려줘요. 그렇다고 폴더가 항상 맞는 건 아니에요. information-layer 규칙은 파일의 95% 이상이 폴더 기본값을 따르고, 애매하게 남는 나머지만 frontmatter로 덮어쓴다고 분명히 못 박아 둬요.

여기에 균형이 있어요. 흔한 경우는 폴더 기본값으로, 예외는 frontmatter로 처리하는 거죠.

새로운 발상은 아니에요. Rails는 같은 거래를 convention over configuration이라고 부르고, Rails Doctrine은 이 거래가 어디서 한계를 만나는지도 솔직하게 적어 뒀어요. "만들 가치가 있는 애플리케이션은 대부분 어딘가 고유한 부분을 갖고 있다. 그게 5%나 1%밖에 안 되더라도 분명히 존재한다. 어려운 건 언제 convention에서 벗어날지를 아는 것이다." 폴더를 정책으로 쓰는 건 이 거래를 class 대신 메모에 적용한 거고, 어려운 부분도 그대로 물려받아요.

## 생애주기 경로

3B 아키텍처 모델은 생애주기를 이렇게 요약해요.

```text
tmp -> journal -> knowledge -> ADR -> blog
```

`subsystems.md`는 이걸 실제 운영 단위로 펼쳐 놔요. 임시 파일, journal, 진행 중인 task 폴더, 정제된 knowledge와 guide, 아키텍처와 결정 기록, 그리고 마지막으로 공개 blog 동기화까지요. 정확한 목록보다 중요한 건 흐름이에요. 콘텐츠는 날것이나 작업 중인 상태로 시작해서, 오래 쓸 knowledge로 다듬어지고, 아키텍처 권위가 필요할 때 결정이 되고, 한참 뒤에야 발행할 만한 글이 돼요.

이 생애주기 때문에 폴더 정책이 중요해져요. `tmp/`에 있는 메모를 완성된 knowledge 항목처럼 다루면 안 돼요. journal 항목을 공개 문서처럼 다뤄서도 안 되고요. 결정 기록이 평범한 작업 메모처럼 낡아버려도 안 돼요. 발행 직전의 글에는 내부 임시 파일과는 다른 관문이 필요해요.

폴더는 모든 도구에 첫 번째 답을 줘요.

## `source_type`: 이건 어느 계층에서 왔을까?

`source_type` 필드는 출처 계층의 이름을 붙여요. raw, working, distilled, decision, rule, task, friction, memory가 있고, 애매하게 떠 있는 경우에는 `distilled-pending`을 써요.

대부분의 파일은 이 필드를 적을 필요가 없어요. 폴더가 이미 출처를 암시하니까요. `tmp/**`는 기본이 raw예요. `projects/*/actives/**`는 working이고요. `knowledge/**`와 `guides/**`는 distilled가 기본이에요. 결정 폴더는 decision, agent 규칙과 skill은 rule, buffer와 friction log는 friction이 기본이고요.

이 약속 덕분에 검색 도구는 경로를 일일이 거꾸로 분석하지 않고도 출처 품질을 판단할 수 있어요. 정제된 메모는 임시 파일과는 다른 종류의 출처예요. 결정 기록은 task 초안과 권위가 다르고요. 경로가 기본값을 주고, 대부분은 그 기본값으로 충분해요.

재미있는 건 나머지 5%예요.

진행 중인 task 폴더 안에 추출해 둔 조각이 하나 있다고 해 봐요. 위치로 보면 `projects/*/actives/**` 아래라서 폴더 기본값은 working이라고 말해요. 그런데 의미로 보면 이미 distilled-pending일 수 있어요. knowledge가 될 만큼 다듬어졌는데, 아직 `/archive-task`로 옮겨지지 않은 상태죠. 바로 이때 frontmatter가 제 역할을 해요.

```yaml
source_type: distilled-pending
```

이 override는 두 번째 분류 체계가 아니에요. 폴더와 의미가 잠깐 어긋나는 경우를 위한 예외 장치일 뿐이에요.

static site generator들도 같은 모양에 도달했어요. Hugo에서는 page의 content type이 그 page가 놓인 최상위 section에서 유도되고, front matter의 `type` 필드는 "page가 놓인 최상위 section에서 유도된 값을 덮어쓰기 위해" 존재해요. 현재 Hugo front matter 문서에 그렇게 적혀 있어요. 똑같은 거래죠. 디렉터리가 먼저 정하고, 디렉터리가 틀렸을 때만 필드 하나가 뒤집어요.

## `privacy`: 기계가 이걸 index해도 될까?

privacy는 index 여부를 따지는 질문이에요.

`privacy:` 필드는 파일을 암호화하지 않고, 사람이 읽어도 되는지를 정하지도 않아요. graph builder, retrieval 계층, embedding 작업, 모델 기반 도구에게 콘텐츠를 가져가도 되는지를 알려줄 뿐이에요.

이 매트릭스는 경로를 기준으로 정리돼 있어요. `personal/**`, `journals/**`, `tmp/**`, `.agents/metrics/**`, 그리고 회사 일 관련 메모가 모이는 `knowledge/{work}/**` 하위 트리는 기본이 비공개예요. 일반 `knowledge/**`, `guides/**`, 그리고 3B 결정 기록은 기본이 공개고, 매트릭스가 허용하는 곳에선 항목별로 덮어쓸 수 있어요.

중요한 건 정확한 행 목록이 아니에요. 매트릭스가 하나뿐이라는 점이 핵심이에요.

`scripts/lib/privacy-matrix.js`는 `information-layer.md`에서 privacy 매트릭스를 읽어 와서, 그 결과를 다른 도구들이 가져다 쓸 수 있게 열어 줘요. Graphify의 privacy 관문, `.graphifyignore` 생성, wrap의 신선도 검사, 앞으로 들어올 vector index까지 전부 같은 출처를 읽도록 돼 있어요. "journal은 절대 업로드하지 마라" 같은 규칙을 도구 다섯 개가 각자 복사해서 들고 다니는 걸 원치 않거든요.

웹은 이 문제의 좁은 버전을 오래전에 풀었는데, 그 해법에는 경고도 같이 딸려 와요. `robots.txt` 규칙은 URL 경로에 매칭되고, RFC 9309는 가장 구체적으로 매칭된 규칙이 이긴다고 정해요. frontmatter override가 폴더 기본값을 이기는 것과 같은 우선순위죠. 그런데 Google의 robots meta tag 문서는 이 구조의 실패 지점을 짚어요. `robots.txt`에서 막힌 page는 크롤러가 애초에 가져가지 않으니, 그 page에 적어 둔 index 규칙은 "발견되지 않고 따라서 무시된다"는 거예요. 경로 규칙이 개별 page 규칙을 조용히 삼켜 버리는 셈이에요.

3B는 이 순서 문제를 겪지 않아요. 두 시스템이 런타임에 만나는 대신, loader 하나가 경로 기본값과 파일 자체의 override를 함께 풀어 주거든요. 다른 데로 가져갈 만한 부분은 이거예요. 계층으로 나눈 정책은 두 계층을 모두 읽는 무언가가 있을 때만 작동해요.

이렇게 해야 새 도구가 등장해도 비공개 폴더가 계속 비공개로 남아요.

## `blog.publishable`: 사람이 이걸 발행해도 될까?

`privacy:`와 `blog.publishable:`은 일부러 분리해 뒀어요.

privacy가 답하는 건 이거예요. 기계가 이 콘텐츠를 index하거나 업로드해도 될까?

blog 발행 가능 여부가 답하는 건 이거고요. 사람이 검토한 뒤에 공개 글로 써도 괜찮은 콘텐츠일까?

둘은 같은 질문이 아니에요. 어떤 파일은 `privacy: private`이면서도, 가리거나 일반화하거나 사람이 검토하고 나면 결국 발행할 수 있어요. 반대로 3B 안에서는 index할 수 있는 파일이라도, 참고 문헌이 없거나 회사 사례가 들어 있거나 아직 미완성이라서 공개 blog에는 못 올릴 수도 있고요.

blog 발행 규칙에는 별도의 결정 트리가 있어요. 회사 업무에 특화된 콘텐츠는 아예 제외돼요. 어디든 가져다 쓸 수 있는 개념인데 예시가 업무에 맞춰져 있다면 일반화가 필요해요. 경험만 적어 둔 메모에는 외부 참고 문헌이 필요할 수 있고요. 동기화할 준비가 된 knowledge는 privacy 관문만이 아니라 발행 관문도 통과해야 해요.

이렇게 나눠 두면 흔한 정책 버그를 막을 수 있어요. "검색해도 안전하다"를 "공개 발행해도 안전하다"로 착각하는 버그요. 3B는 이 두 축을 서로 독립으로 유지해요.

## `tier`: 이건 얼마나 오래 묵혀도 될까?

tier 모델은 얼마나 묵혀도 되는지, 즉 노화라는 축을 하나 더 더해요. 단계는 standard, nearline, coldline, archive 네 가지예요.

모든 곳에 적용되진 않아요. tier 규칙은 적용 대상과 강제 제외 대상을 따로 정의해요. ADR, journal, 보편 tier 규칙, 템플릿, `.me.md`를 비롯한 보호 계층은 평범한 knowledge나 skill 산출물과 같은 정책으로 함부로 강등되지 않아요.

노화가 계층마다 다르기 때문에 이게 중요해요. task 메모는 며칠이면 낡아요. 참고 자료는 한 해에 한 번 확인이 필요할 수 있고요. 결정 기록은 구현이 바뀌어도 역사적 권위로 계속 남아 있어야 해요. 모든 파일이 노화 사다리 하나를 같이 쓴다면, 그 사다리는 대부분의 파일에 안 맞을 거예요.

여기서도 폴더 위치가 기본값을 줘요. frontmatter는 tier 모델이 허용하는 곳에서만 명시적인 상태를 줘요.

## 5%의 예외

"폴더가 곧 운명"이라는 말이 쓸모 있는 건 대체로 맞기 때문이에요. 항상 맞다고 주장하면 오히려 위험해질 거고요.

설계가 실용적으로 빛나는 곳은 바로 예외예요.

- 작업 중인 task 산출물이 의미로는 이미 distilled-pending이에요.
- 대체로 공개인 knowledge 폴더에 비공개 override가 필요한 항목이 하나 섞여 있어요.
- 비공개 메모는 사람이 검토하고 일반화한 뒤에야 발행할 수 있어요.
- tier 적용 대상인 파일은 노화 사다리를 내려가지만, 강제 제외된 결정은 권위 있는 역사로 남아요.

이런 경우 때문에 frontmatter 필드가 있어요. 폴더 의미를 대체하는 게 아니라 다듬어 주는 거예요.

## 복사된 allow-list보다 공유 loader가 나아요

이 글에서 가장 중요한 구현 세부 사항은 필드 이름이 아니에요. 공유 loader예요.

모든 도구가 privacy 매트릭스를 복사해 간다면, repo에는 결국 privacy 정책이 여러 개 생길 거예요. 어떤 건 `journals/**`를 넣고, 어떤 건 `.agents/metrics/**`를 빠뜨리고, 또 어떤 건 업무용 하위 트리를 평범한 knowledge로 다루겠죠. 이 차이는 모델 기반 index가 엉뚱한 폴더를 업로드하고 나서야 드러날지도 몰라요.

3B는 규칙 본문을 출처로 삼고 loader를 접근 통로로 삼아서 이걸 피해요. 매트릭스는 `information-layer.md`에 살고, `privacy-matrix.js`가 그걸 파싱하고, 도구들은 파싱된 결과를 가져다 써요. 정책은 글이지만, 그냥 죽은 글이 아니에요. 관문에 공통으로 들어가는 입력이거든요.

여기에 더 깊은 패턴이 있어요. 모든 소비자에게 정책을 외우게 하지 마세요. 모든 소비자가 같은 정책을 읽게 하세요.

## 폴더가 기본값, frontmatter가 예외

폴더가 첫 번째 이야기를 들려줘요. `tmp/`는 날것이에요. `journals/`는 비공개 작업 기억이고요. `knowledge/`는 정제된 거예요. 결정은 권위 있는 기록이고요. blog 동기화는 마지막 발행 단계예요.

frontmatter는 예외의 이야기를 들려줘요. 이 작업 파일은 distilled-pending이에요. 폴더상 공개인 이 항목은 비공개고요. 이 메모는 검토 후에만 발행할 수 있어요. 이 산출물은 tier를 한 단계 내려갔어요.

이 시스템이 굴러가는 건, 모든 파일에 가능한 모든 metadata를 다 짊어지라고 요구하지 않기 때문이에요. 대부분의 파일에는 폴더로 운명을 정해 주고, 애매한 소수의 파일에만 왜 다른지를 직접 말하게 해요.

이 정도 구조면 모든 메모를 config 파일로 만들지 않고도 도구들이 일관되게 움직이기에 충분해요.
