---
title: '심볼릭 링크 감지: `test -L` vs `realpath`'
description: >-
  POSIX 함정. `test -L child/leaf`는 상위 디렉토리가 심볼릭 링크일 때 false를 반환해요. 체인 자체는
  건강한데도요. SoT 체인 검증에는 `realpath`를 써야 해요.
date: 2026-05-01T00:00:00.000Z
updated: "2026-06-14"
tags:
  - devops
  - shell
  - symlinks
  - posix
  - gotcha
  - transferable
category: devops
draft: false
lang: ko
source_lang: en
source_slug: test-L-vs-realpath-symlink-detection
source_updated: "2026-06-14"
translation_date: '2026-05-05'
---

3B 레포에서 심볼릭 링크 감사 스크립트가 멀쩡한 마운트에 대해 `rm <link> && ln -s`를
실행할 뻔했어요. "버그"라고 표시한 검사는 딱 한 줄 —
`test -L ~/.claude/skills/<skill>/SKILL.md` — 이게 false를 반환한 거였어요.
스크립트는 "renameSync 함정 감지, 복구 중"이라고 결론짓고 파괴적인 재빌드 경로를
준비하기 시작했어요. 다음 단계의 정상성 검사(파일 내용이 SoT와 일치)만이
`rm`을 막아 줬어요.

POSIX가 틀린 게 아니었어요. 스크립트가 POSIX의 약속이 뭔지 잘못 알고 있었던
거예요.

## 문제

`test -L child/leaf`는 `child/`가 심볼릭 링크일 때 false를 반환해요. 해석된
체인이 정확히 기대한 SoT를 가리키고 있어도요. 이 결과를 "깨진 심볼릭 링크"로
취급하면 심볼릭 링크 감사 스크립트에서 거짓 양성 진단이 나와요.

해결은 기계적이에요 — `realpath`로 바꾸고 기대 대상과 문자열 비교하면 끝이에요.
하지만 추론 과정이 더 중요해요. 같은 함정이 `[ -L X ]`와 `ls -la X`에서도
나타나거든요. 하나만 고치면 버그가 자리만 옮겨 가요.

## 컨텍스트

3B의 스킬은 디렉토리 레벨에서 심볼릭 링크 마운트를 해요:

```text
~/.claude/skills/                       # 심볼릭 링크 → 3b/.claude/skills/
~/.claude/skills/<skill>/SKILL.md       # leaf는 심볼릭 링크가 아님 — leaf는
                                        # SoT 디렉토리 안의 일반 파일
```

감사 스크립트는 `test -L ~/.claude/skills/<skill>/SKILL.md`를 실행하면서
"true = 건강한 심볼릭 링크 체인"이라고 기대했어요. false가 나왔어요. "renameSync
함정, 심볼릭 링크가 일반 파일로 교체됨"이라고 결론을 내렸어요. 잘못된 진단이었죠.

## 왜 이런 일이 일어나는가

POSIX `test -L file`은 모든 상위 컴포넌트를 해석하면서 경로를 따라가요. leaf를
검사할 시점에는 상위 심볼릭 링크가 이미 따라가진 상태예요. leaf는 **해석된**
엔트리예요 — 보통은 일반 파일이고, 그것을 가리키던 링크가 아니에요. 그래서
체인이 건강한데도 `test -L`은 false를 반환해요.

이건 올바른 POSIX 동작이에요 — 버그는 `test -L`이 "이 경로의 해석 체인에 있는
어떤 심볼릭 링크든 감지한다"고 가정한 데 있어요. `test -L`은 "이 정확한 이름이
심볼릭 링크인가"만 감지해요.

## 해결책

`realpath`(또는 `readlink -f`)를 쓰고 기대하는 SoT 경로와 비교해요:

```sh
RESOLVED=$(realpath ~/.claude/skills/<skill>/SKILL.md)
EXPECTED=/Users/.../3b/.agents/skills/<skill>/SKILL.md
[ "$RESOLVED" = "$EXPECTED" ] && echo "OK" || echo "BROKEN"
```

Python 등가물:

```python
import os
resolved = os.path.realpath(mount)
expected = "/Users/.../3b/.agents/skills/<skill>/SKILL.md"
print("OK" if resolved == expected else "BROKEN")
```

Node 헬퍼용:

```js
const fs = require("fs");
const realPath = fs.realpathSync(mount);
```

각 형태 모두 같은 일을 해요 — 전체 체인을 해석하고, 기대했던 곳에 도착했는지
문자열 비교로 확인하는 거예요.

## 어떤 도구를 언제 쓰나

질문이 다르면 도구도 달라져야 해요. 잘못된 도구를 골랐던 게 처음 거짓 양성을
만들어낸 원인이었어요:

| 목표                                          | 도구                              |
| --------------------------------------------- | --------------------------------- |
| "이 정확한 이름이 심볼릭 링크인가?"           | `test -L path`                    |
| "이 경로가 기대하는 SoT로 해석되는가?"        | `realpath` + 문자열 비교          |
| "각 컴포넌트를 따라 올라가며 검사할까?"       | 반복 + 상위마다 `test -L`         |

`test -L`은 좁은 질문에는 괜찮아요. 심볼릭 링크 감사처럼 — 체인이 올바른 곳에
도착하는지가 중요한 경우 — `realpath`가 답이에요.

## 부딪힌 어려움

- 거짓 양성이 진짜 버그처럼 가장해요. 스크립트 검사가 "renameSync 함정 감지,
  복구 중" 메시지를 만들어냈고, 파괴적인 `rm <link> && ln -s` 복구 경로를
  거의 발동시킬 뻔했어요. 감사 스크립트의 복구 사전 조건(파일 내용이 SoT와
  일치, 상위 디렉토리가 심볼릭 링크) 검증이 파괴 행위를 막아 줬어요.
- `ls -la <leaf>`는 상위 심볼릭 링크를 통해 해석된 leaf를 일반 파일로 보여줘요
  (`l` 접두사 없음). `ls` 출력에 의존해서 심볼릭 링크를 감지하면 잘못된 결론이
  강화돼요.

## 핵심 포인트

- POSIX 심볼릭 링크 해석은 leaf만이 아니라 전체 경로를 따라가요.
- `test -L`, `[ -L X ]`, `ls -la X` 모두 상위 해석 후의 leaf 자체 타입을
  설명해요 — 체인의 심볼릭 링크 상태가 아니에요.
- `realpath` (BSD + GNU + macOS coreutils)가 portable한 답이에요. 해석된 경로를
  기대하는 SoT와 비교해요.
- leaf 경로에 `test -L`을 쓰는 심볼릭 링크 감사 스크립트는 상위 어딘가가 실제
  심볼릭 링크일 때마다 거짓 양성을 만들어요. SoT 체인 검증에는 항상 `realpath`를
  써요.

## 마무리

감사 스크립트의 복구 경로가 파괴적이라면, 감지 검사는 단순한 true/false 답이
아니라 올바른 질문이어야 해요. `test -L`은 "이 정확한 이름이 심볼릭 링크인가"에
답해요 — 감사가 실제로 원하는 게 그건 아니죠. 감사가 원하는 건 "이 경로가
기대하는 곳으로 해석되는가"예요. 그 질문에 답하는 도구는 하나뿐이에요. 체인을
해석하고, 문자열을 비교하는 것.

이번에 배운 더 큰 교훈은 — POSIX 동작이 직관에 어긋나 보였던 게, `-L`을 "심볼릭
링크 검사"가 아니라 "이 정확한 이름이 심볼릭 링크인가"로 외워뒀어야 한다는
거였어요. 스펙을 꼼꼼히 읽었으면 거짓 양성도, 아슬아슬했던 `rm`도 막을 수
있었어요.

## 참고

- POSIX `test(1)` 스펙 — `-L`이 "the file"(단수)을 검사한다고 명시
- 3B `.agents/skills/sync-symlink-rectify/scripts/symlink-rectify.sh` — 같은 이유로
  `realpath`를 사용
