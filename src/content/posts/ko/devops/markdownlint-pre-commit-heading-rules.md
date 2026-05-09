---
title: 'Markdownlint Pre-Commit: MD041 + MD001 heading 함정'
description: 'YAML frontmatter가 있는 새 markdown 파일에 husky pre-commit을 반복적으로 막는 두 가지 markdownlint 규칙. 둘 다 조용히 fire되고, --fix로 자동 수정되지 않으며, 보통 같이 나타나요 — 하나를 고치면 다른 하나가 노출돼요.'
date: 2026-04-19T00:00:00.000Z
updated: '2026-05-10'
tags:
  - devops
  - markdown
  - tooling
  - pre-commit
category: devops
draft: false
lang: ko
source_lang: en
source_slug: markdownlint-pre-commit-heading-rules
source_updated: 2026-05-06T00:00:00.000Z
translation_date: '2026-05-10'
---

YAML frontmatter가 있는 새로 만든 markdown 파일에 husky pre-commit을 반복적으로 막는 두 가지 markdownlint 규칙이 있어요. 둘 다 조용히 fire돼요 — generator tool(예: `code-review-graph init`)이 valid해 보이는 markdown을 쓰지만, lint 규칙은 매우 specific한 heading 모양을 원해요. pre-commit hook은 staged된 모든 `*.md` 파일에 `markdownlint-cli2 --fix`를 실행하고, 특히 이 두 규칙이 대부분의 generator가 생산하는 걸 거부해요:

- **MD041 / first-line-heading / first-line-h1** — 첫 non-frontmatter 줄은 top-level `# Heading`이어야 해요. `## Heading`은 frontmatter에 `name:` 키가 있어도 거부돼요.
- **MD001 / heading-increment** — heading level은 한 번에 하나씩만 증가할 수 있어요. `# Title`에서 `### Subsection`으로 점프(`##` 건너뜀)하면 거부돼요.

generator는 보통 이 둘을 짝으로 만들어요: `## Title`을 h1 stand-in으로 쓰고, body에는 `### Steps`와 `### Tips`를 써요. 두 규칙, 두 commit 거부.

## 이게 끈적이는 이유

"안다"고 해도 반복적으로 맞는 세 가지:

1. **에러 메시지가 fix를 숨겨요.** MD041은 "First line in a file should be a top-level heading [Context: '## Debug Issue']"라고 말해요 — fix는 `##`을 `#`로 바꾸는 건데, 규칙 문서를 읽지 않으면 명확하지 않아요. 첫 반응은 보통 `##` 위에 `# Title`을 추가해서 중복 제목을 만드는 거예요.
2. **MD041 fix가 MD001을 노출해요.** `##`을 `#`로 promote하면 `###` subsection이 h1 → h3로 점프하면서 MD001을 trigger해요. 두 번째 실패한 commit이 첫 fix가 완전해 보였기 때문에 허를 찔러요.
3. **`--fix`가 어느 규칙도 자동 수정 안 해요.** MD041과 MD001은 보고만 되고, 다시 작성되지 않아요. 직접 고쳐야 해요. "왜 `--fix`가 fix 안 했지?"가 두 번째 낭비 사이클이에요.

## lint clean한 패턴

YAML frontmatter가 있는 generated markdown 파일은 이 모양을 타겟으로 해요:

```markdown
---
name: Debug Issue
description: Systematically debug issues
---

# Debug Issue

Use the knowledge graph to systematically trace issues.

## Steps

1. Use `semantic_search_nodes` to find code related to the issue. ...

## Tips

...
```

invariant:

- 첫 non-frontmatter 줄: 단일 `#` heading(`name:` 값을 중복해도 OK — markdownlint는 frontmatter와의 redundancy를 신경 쓰지 않아요).
- 모든 subsection: `##`. 절대 `#` 아래 직접 `###` 안 됨. 기존 `##` 아래에서만 더 깊이 nest(`###`, `####`).

모든 `###`을 `##`로 demote할 때 빠른 bulk fix: `Edit(replace_all=true, old="### ", new="## ")` — MD001은 increment만 신경 쓰고 같은 level의 중복은 신경 안 써서 안전해요.

## prettier × proseWrap 함정

별개의 함정이 또 있어요. 본문에서 GitHub issue나 PR을 `#NNN`로 참조하는 경우예요. prettier의 `proseWrap: always`는 문단을 ~80 컬럼에서 다시 줄바꿈해요. 그래서 `"Completed via #838 (PR #839) + follow-up #850 (PR #851)"` 같은 문장이 이렇게 쪼개져요:

```markdown
Completed via #838 (PR #839 merged 2026-04-17) + follow-up #850 (PR #851 merged
2026-04-21).
```

두 번째 줄이 `#850`으로 시작해 버려요. H1 heading과 똑같은 모양이에요. 그러면 markdownlint가 이렇게 잡아내요:

- **MD022** (blanks-around-headings)
- **MD025** (single-title/single-h1 — 여러 top-level heading)
- **MD001** (heading-increment — 진짜 heading이 뒤따르면 level jump fire)

세 가지가 전부 proseWrap이 만든 한 번의 줄바꿈에서 한꺼번에 터져요. 막상 렌더링해 보면 markdown은 의미상 멀쩡해요(대부분의 renderer는 `#NNN)`를 heading으로 보기 전에 `#` 뒤의 글자와 두 칸 들여쓰기를 요구하거든요). 그런데 markdownlint는 renderer보다 더 깐깐해요.

가장 깔끔한 해결책은, 줄 첫머리에 떨어질 수 있는 issue 번호를 backtick으로 감싸는 거예요:

```markdown
Completed via `#838` (PR `#839` merged 2026-04-17) + follow-up `#850` (PR `#851`
merged 2026-04-21).
```

앞에 inline code가 붙으면 markdownlint가 더 이상 heading으로 해석하지 않아요. 줄바꿈은 prettier가 그대로 처리하고요.

다른 방법들은 다 별로예요. `\#850`처럼 escape를 쓰면 동작은 하지만 원문 가독성이 떨어져요. `#NNN`을 피해서 다시 쓰는 방식은 깨지기 쉬워요. 나중에 한 줄만 고쳐도 충돌이 다시 생겨요. `<!-- prettier-ignore -->`로 막으면 문단 전체의 줄바꿈이 꺼지니까, 토큰 하나 때문에 쓰기엔 너무 광범위해요.

## 이게 중요한 상황

husky + markdownlint-cli2 pre-commit hook을 거쳐 들어가는 새 markdown 파일을 쓸 때, 그리고 generator 산출물(skill, steering 파일, MCP plugin 문서)을 이 lint stack이 깔린 repo에 옮길 때 이 규칙을 챙기세요. 최상위 heading으로 쓰인 `^##`과 `^###`을 훑어서 한 단계씩 내리면 돼요. 단, repo가 `markdownlint-cli2 --fix`를 돌리더라도 `.markdownlint.json`에서 MD041 / MD001을 꺼 둔 경우, 그리고 frontmatter 없는 README 섹션이나 블로그 초고처럼 글 위주의 markdown이면 굳이 신경 쓸 필요 없어요. MD041은 여전히 적용되지만 작성자가 자연스럽게 `#`로 시작하는 경우가 대부분이거든요.

## 실용적인 takeaway

MD041은 frontmatter 다음 첫 줄에 `#` 한 개짜리 heading을 원해요. MD001은 heading level이 한 단계씩만 올라가길 원하고요. `--fix`는 둘 다 안 고쳐 줘요. cli가 그냥 보고만 하고 끝이에요. repo가 prettier `proseWrap: always`까지 같이 쓰면 본문 안의 `#NNN` 참조를 backtick으로 감싸 두세요. 안 그러면 줄바꿈된 issue 번호가 첫머리에 떨어져서 markdownlint 눈에는 H1으로 보여요.

## References

- [MD041 — first-line-heading / first-line-h1](https://github.com/DavidAnson/markdownlint/blob/main/doc/md041.md)
- [MD001 — heading-increment](https://github.com/DavidAnson/markdownlint/blob/main/doc/md001.md)
