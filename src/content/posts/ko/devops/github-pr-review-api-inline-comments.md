---
title: GitHub PR Review API - 인라인 코멘트
description: GitHub API와 gh CLI로 PR 리뷰에 인라인 코멘트를 다는 방법
date: 2026-02-04T00:00:00.000Z
updated: 2026-02-04T00:00:00.000Z
tags:
  - devops
  - github
  - api
  - pr-review
category: devops
draft: false
lang: ko
source_lang: en
source_slug: github-pr-review-api-inline-comments
source_updated: "2026-02-04"
translation_date: "2026-02-12"
references:
  - url: >-
      https://docs.github.com/en/rest/pulls/reviews#create-a-review-for-a-pull-request
    title: GitHub REST API - Create a review for a pull request
    type: official
---

`gh` CLI로 PR에 셀프 리뷰 인라인 코멘트를 달고 싶었어요. 가장 먼저
떠오르는 방법 -- `gh api`에 `-f` 플래그와 배열용 대괄호 표기법 -- 을 쓰니
422 에러가 났어요. `-f` 플래그가 배열 대신 객체를 조용히 만든다는 걸
깨닫는 데 생각보다 오래 걸렸어요.

## 왜 중요한가

특정 코드 라인에 고정된 인라인 PR 코멘트는 긴 텍스트의 PR 설명보다 훨씬
유용해요. 리뷰어(그리고 미래의 나)가 왜 그 라인이 그렇게 작성됐는지 이해할
수 있게 해줘요. 셀프 리뷰, CI lint 결과, 보안 발견 사항을 자동화한다면
GitHub PR Review API로 프로그래밍 방식으로 게시해야 해요.

---

## 겪었던 어려움

- **`-f` 플래그의 오해를 부르는 동작** -- `gh api -f` 플래그가 중첩 객체에
  대괄호 표기법을 지원하기 때문에 `comments[0][path]`가 올바르게 보여요.
  하지만 실제로는 JSON 배열 대신
  `{"comments": {"0": {"path": ...}}}`를 조용히 만들어요. 경고가 없어요.
- **422 에러가 도움이 안 됨** -- GitHub API가 "is not an array"라고
  반환하지만 실제로 잘못된 페이로드가 어떻게 생겼는지 보여주지 않아요.
  직접 직렬화된 JSON을 검사하지 않으면 근본 원인을 알 수 없어요.
- **라인 번호 유효성 검사** -- JSON 형식을 고친 후에도, `line` 번호가 PR
  diff에 없으면 코멘트가 조용히 실패해요. diff 출력을 교차 확인해서 유효한
  라인 번호를 찾아야 해요.
- **Heredoc 따옴표의 미묘함** -- 따옴표 없는 heredoc 구분자를 사용하면
  JSON 본문 내의 백틱과 `$variables`에 쉘 확장이 적용돼요. 코멘트 텍스트에
  코드 스니펫이 있으면 내용이 깨져요.

---

## 잘못된 방법

```bash
# 틀림 - HTTP 422 에러 발생
gh api repos/{owner}/{repo}/pulls/{PR}/reviews -X POST \
  -f event="COMMENT" \
  -f body="Review body" \
  -f "comments[0][path]=file.ts" \
  -f "comments[0][line]=123" \
  -f "comments[0][body]=Comment text"

# Error: "For 'properties/comments', {...} is not an array. (HTTP 422)"
```

`-f "comments[0][path]=..."` 문법은 제대로 된 JSON 배열을 만들지 않아요.
`{"comments": {"0": {"path": ...}}}` -- 문자열 키 `"0"`을 가진 객체를
만들어요. GitHub은 `comments`가 실제 JSON 배열이어야 해요.

---

## 해결책: Heredoc과 `--input -`

Heredoc으로 올바르게 형식화된 JSON을 직접 파이프해요:

```bash
cat << 'REVIEW_JSON' | gh api repos/{owner}/{repo}/pulls/{PR}/reviews -X POST --input -
{
  "event": "COMMENT",
  "body": "## Self Review\n\nKey implementation points explained below.",
  "comments": [
    {
      "path": "src/utils/calendar.ts",
      "line": 244,
      "side": "RIGHT",
      "body": "### TZID Normalization\n\nExplanation here..."
    },
    {
      "path": "src/utils/calendar.ts",
      "line": 307,
      "side": "RIGHT",
      "body": "### DST Gap Detection\n\nExplanation here..."
    }
  ]
}
REVIEW_JSON
```

작은따옴표로 감싼 heredoc 구분자(`'REVIEW_JSON'`)가 JSON 본문 내의 백틱과
`$variables`에 대한 쉘 확장을 방지해요. 코멘트 텍스트에 코드 스니펫이 있을
때 필수적이에요.

---

## 주요 레퍼런스

### 코멘트 구조

| 필드   | 필수 | 설명                                  |
| ------ | ---- | ------------------------------------- |
| `path` | 예   | repo 루트 기준 파일 경로              |
| `line` | 예   | 파일 NEW 버전의 라인 번호             |
| `side` | 예   | `"RIGHT"` 새 코드, `"LEFT"` 삭제 코드 |
| `body` | 예   | 코멘트 내용 (Markdown 지원)           |

### 라인 번호 요구사항

`line`은 PR diff에 나타나는 라인이어야 해요. 이게 가장 흔한 조용한 실패
원인이에요.

- `+` 접두사가 있는 라인(추가된 라인)은 `side: "RIGHT"` 사용
- 삭제된 라인(`-` 접두사)은 `side: "LEFT"` 사용
- 컨텍스트 라인(접두사 없음)은 코멘트가 가능할 수도 있고 아닐 수도 있음

유효한 라인 번호를 찾으려면:

```bash
# PR diff를 확인해서 실제로 변경된 라인 확인
gh pr diff {PR_NUMBER} -- {file_path}
```

### JSON 이스케이핑

| 문자     | 이스케이프                   |
| -------- | ---------------------------- |
| 큰따옴표 | `\"`                         |
| 줄바꿈   | `\n`                         |
| 역슬래시 | `\\`                         |
| 탭       | `\t` (피하고, 스페이스 사용) |

### 이벤트 유형

| 이벤트            | 설명                         |
| ----------------- | ---------------------------- |
| `COMMENT`         | 일반 코멘트 (승인 상태 없음) |
| `APPROVE`         | PR 승인                      |
| `REQUEST_CHANGES` | 머지 전 변경 요청            |

---

## 완전한 작동 예제

```bash
PR_NUMBER=644
OWNER=example-org
REPO=backend-v2

cat << 'REVIEW_JSON' | gh api repos/${OWNER}/${REPO}/pulls/${PR_NUMBER}/reviews -X POST --input -
{
  "event": "COMMENT",
  "body": "## Self Review\n\nKey implementation points explained below.",
  "comments": [
    {
      "path": "src/common/utils/calendar/calendar-normalization.util.ts",
      "line": 244,
      "side": "RIGHT",
      "body": "### TZID Normalization\n\n**Why this implementation:**\n\nConverts non-standard TZID to IANA format."
    },
    {
      "path": "src/common/utils/calendar/calendar-normalization.util.ts",
      "line": 307,
      "side": "RIGHT",
      "body": "### DST Gap Detection\n\n**Problem:**\n\nDuring DST transition, dayjs adjusts non-existent times."
    }
  ]
}
REVIEW_JSON
```

성공 시 API가 생성된 리뷰 객체를 반환해요:

```json
{
  "id": 3751032477,
  "html_url": "https://github.com/org/repo/pull/644#pullrequestreview-3751032477",
  "state": "COMMENTED",
  "submitted_at": "2026-02-04T13:19:25Z"
}
```

---

## 왜 이 방식이 효과적인가

Heredoc 방식은 `gh api -f` 플래그를 완전히 우회해요. 원하는 정확한 JSON
페이로드를 직접 작성하면 돼요 -- 제대로 된 배열, 제대로 된 이스케이핑,
쉘 직렬화의 예상치 못한 동작 없이. 작은따옴표 구분자가 쉘 확장을
방지해서 코멘트 본문의 백틱과 달러 기호가 그대로 유지돼요.

---

## 실전 팁

요청 본문에 배열이 필요한 모든 `gh api` 호출에 heredoc 방식을 사용하세요.
`-f` 플래그는 평면 키-값 쌍에는 잘 작동하지만 배열을 만들 수 없어요.
다음 주의사항을 기억하세요:

- 코멘트 게시 전에 항상 `gh pr diff`로 라인 번호를 확인하세요
- JSON에 코드가 포함될 때 항상 작은따옴표 heredoc 구분자를 사용하세요
- API rate limit이 적용돼요; 코멘트를 하나의 리뷰 호출로 묶으세요

### 사용하기 좋은 경우

- 자기 PR에 셀프 리뷰 코멘트 자동화
- CI/CD 파이프라인에서 인라인 리뷰 코멘트 게시 (lint, 커버리지, 보안)
- 여러 파일/라인에 한 번의 API 호출로 일괄 코멘트

### 사용하면 안 되는 경우

- **단순한 PR 설명** -- PR 본문이나 단일 최상위 코멘트를 사용하세요
- **diff에 없는 라인** -- API는 diff에 있는 라인만 받아들여요
- **고빈도 자동화** -- GitHub이 API 호출을 rate-limit해요; 매 커밋마다
  게시하면 빠르게 한도에 도달해요
- **다시 작성할 Draft PR** -- 인라인 코멘트는 특정 diff 라인 번호에
  묶여 있어서 force-push하면 참조가 끊긴 상태가 돼요

### 흔한 에러

| 에러                        | 원인                       | 수정                  |
| --------------------------- | -------------------------- | --------------------- |
| HTTP 422 "not an array"     | `-f comments[0][...]` 사용 | Heredoc JSON 사용     |
| HTTP 422 "line not in diff" | 잘못된 라인 번호           | PR diff에서 라인 확인 |
| HTTP 404                    | 잘못된 PR 번호 또는 repo   | PR 존재 여부 확인     |
| HTTP 403                    | 쓰기 권한 없음             | 권한 확인             |
