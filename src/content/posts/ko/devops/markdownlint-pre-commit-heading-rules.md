---
title: 'Markdownlint Pre-Commit: MD041 + MD001 heading 함정'
description: 'YAML frontmatter가 있는 새 markdown 파일에 husky pre-commit을 반복적으로 막는 두 가지 markdownlint 규칙. 둘 다 조용히 fire되고, --fix로 자동 수정되지 않으며, 보통 같이 나타나요 — 하나를 고치면 다른 하나가 노출돼요.'
date: 2026-04-19T00:00:00.000Z
updated: '2026-05-06'
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
translation_date: '2026-05-06'
---

YAML frontmatter가 있는 새로 만든 markdown 파일에 husky pre-commit을 반복적으로 막는 두 가지 markdownlint 규칙이 있어요. 둘 다 조용히 fire돼요 — generator tool(예: `code-review-graph init`)이 valid해 보이는 markdown을 쓰지만, lint 규칙은 매우 specific한 heading 모양을 원해요. pre-commit hook은 staged된 모든 `*.md` 파일에 `markdownlint-cli2 --fix`를 실행하고, 특히 이 두 규칙이 대부분의 generator가 생산하는 걸 거부해요:

- **MD041 / first-line-heading / first-line-h1** — 첫 non-frontmatter 줄은 top-level `# Heading`이어야 해요. `## Heading`은 frontmatter에 `name:` 키가 있어도 거부돼요.
- **MD001 / heading-increment** — heading level은 한 번에 하나씩만 증가할 수 있어요. `# Title`에서 `### Subsection`으로 점프(`##` 건너뜀)하면 거부돼요.

generator는 보통 이 둘을 짝으로 만들어요: `## Title`을 h1 stand-in으로 쓰고, body에는 `### Steps`와 `### Tips`를 써요. 두 규칙, 두 commit 거부.

## 이게 끈적이는 이유

"안다"고 해도 반복적으로 맞는 세 가지:

1. **에러 메시지가 fix를 숨겨요.** MD041은 "First line in a file should be a top-level heading [Context: '## Debug Issue']"라고 말해요 — fix는 `##`을 `#`로 바꾸는 건데, 규칙 문서를 읽지 않으면 명확하지 않아요. 첫 반응은 보통 `##` 위에 `# Title`을 추가해서 중복 제목을 만드는 거예요.
2. **MD041 fix가 MD001을 노출해요.** `##`을 `#`로 promote하면 `###` subsection이 h1 → h3로 점프하면서 MD001을 trigger해요. 두 번째 실패한 commit이 첫 fix가 완전해 보였기 때문에 허를 찔러요.
3. **`--fix`가 어느 규칙도 자동 수정 안 해요.** MD041과 MD001은 보고되지만 다시 작성되지 않아요 — lint tool이 당신에게 남겨둬요. "왜 `--fix`가 fix 안 했지?"가 두 번째 낭비 사이클이에요.

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

별개의 failure mode가 있어요. paragraph가 GitHub issue나 PR을 `#NNN`로 참조할 때예요. prettier의 `proseWrap: always`는 paragraph를 ~80 컬럼에서 다시 wrap해요. `"Completed via #838 (PR #839) + follow-up #850 (PR #851)"` 같은 paragraph가 이렇게 wrap될 수 있어요:

```markdown
Completed via #838 (PR #839 merged 2026-04-17) + follow-up #850 (PR #851 merged
2026-04-21).
```

두 번째 줄이 이제 `#850`로 시작해요 — H1 heading과 동일한 syntax. markdownlint가 보고해요:

- **MD022** (blanks-around-headings)
- **MD025** (single-title/single-h1 — 여러 top-level heading)
- **MD001** (heading-increment — 진짜 heading이 뒤따르면 level jump fire)

세 개 모두 한 proseWrap-induced 줄바꿈에서 fire해요. 렌더링하면 markdown은 의미적으로 fine이에요(대부분의 renderer는 `#NNN)`를 heading으로 다루기 전에 `#` 뒤의 텍스트와 두 개의 leading 공백을 요구함). 하지만 markdownlint는 renderer보다 엄격해요.

가장 깔끔한 fix는 line start에 land될 수 있는 issue 번호를 backtick으로 wrap하는 거예요:

```markdown
Completed via `#838` (PR `#839` merged 2026-04-17) + follow-up `#850` (PR `#851`
merged 2026-04-21).
```

inline code prefix가 heading interpretation을 막아요. prettier는 여전히 정상적으로 wrap해요.

다른 fix들은 더 안 좋아요: `\#850`(escape는 작동하지만 source의 prose 가독성을 해침), `#NNN` 회피 reword(brittle — 나중의 한 edit이 collision을 다시 도입할 수 있음), `<!-- prettier-ignore -->`(전체 paragraph의 wrap 비활성화; 단일 token에 over-broad).

## 이게 중요한 상황

husky + markdownlint-cli2 pre-commit hook을 통과해 commit될 새 markdown 파일을 쓰기 전에, 또는 generator output(skill, steering 파일, MCP plugin doc)을 이 lint stack이 있는 repo에 import할 때 규율을 적용하세요. top heading으로 `^##`과 `^###`을 sweep해서 한 level demote하세요. repo가 `markdownlint-cli2 --fix`를 실행하지만 `.markdownlint.json`을 통해 MD041 / MD001을 비활성화한다면, 또는 prose-first markdown(blog draft, frontmatter 없는 README 섹션)은 규율을 건너뛰세요. MD041은 여전히 적용되지만 대부분의 작성자가 자연스럽게 `#`로 시작해요.

## 실용적인 takeaway

MD041은 첫 non-frontmatter 줄로 단일 `#`를 원해요. MD001은 한 단계씩 level increment를 원해요. `--fix`는 어느 쪽도 수정하지 않아요 — cli가 보고하고 떠나요. repo도 prettier `proseWrap: always`를 실행한다면 inline `#NNN` 참조를 backtick으로 wrap하세요. 그렇지 않으면 wrap된 issue 번호가 line start에 land하고 markdownlint가 H1을 봐요.

## References

- [MD041 — first-line-heading / first-line-h1](https://github.com/DavidAnson/markdownlint/blob/main/doc/md041.md)
- [MD001 — heading-increment](https://github.com/DavidAnson/markdownlint/blob/main/doc/md001.md)
