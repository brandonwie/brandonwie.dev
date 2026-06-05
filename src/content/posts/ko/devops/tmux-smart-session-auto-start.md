---
title: tmux 스마트 세션 자동 시작
description: 'iTerm2 Profile Command(`tmux-smart-attach`)로 tmux를 자동 시작해서, 새 터미널 창마다 독립된 tmux 세션을 갖고 닫힌 창의 세션은 재사용하는 방법이에요.'
date: 2026-02-25T00:00:00.000Z
updated: '2026-06-05'
tags:
  - devops
  - tmux
  - zsh
  - terminal
  - iterm2
category: devops
draft: false
lang: ko
source_lang: en
source_slug: tmux-smart-session-auto-start
source_updated: '2026-06-05'
translation_date: '2026-06-05'
references:
  - url: 'https://man7.org/linux/man-pages/man1/tmux.1.html'
    title: tmux(1) man page
    type: official
  - url: 'https://iterm2.com/documentation-tmux-integration.html'
    title: iTerm2 tmux Integration
    type: official
---

새 iTerm2 창(`Cmd+N`)마다 자체 tmux 세션으로 열리되, 닫힌 창의 detach된 세션은 재사용하고 싶었어요. 가장 뻔한 방법 — iTerm2의 "Send text at start"에 `tmux new -A -s main`을 넣는 것 — 은 항상 같은 `main` 세션에 다시 attach돼요. 그러면 모든 창이 독립된 작업 공간 대신 같은 pane과 내용을 보여주죠.

이 해결책은 모든 컨텍스트에서 안정적으로 동작하는 방법에 안착하기까지 세 번의 반복을 거쳤어요.

> **업데이트 (2026-06-05):** 제 환경에서는 이제 이 방식으로 tmux를 자동 시작하지 않아요 — 터미널 워크스페이스 매니저(Herdr)가 그 레이어를 맡게 되면서, 필요할 때만 tmux를 수동으로 띄워요. 아래 패턴은 독립형 iTerm2 스타일 창에서는 여전히 유효해서, 지금의 일상 설정이라기보다 참고용으로 남겨둬요.

## 뻔한 방법의 문제

iTerm2의 "Send text at start" 설정에 `tmux new -A -s main\n`을 넣으면 `-A` 플래그가 문제예요. `-A`는 "있으면 attach, 없으면 생성"이라는 뜻이거든요. 모든 창이 같은 명령을 실행하니까 전부 `main`에 attach돼요. 독립된 작업 공간이 아니라, 모든 창에 걸쳐 하나의 공유 세션이 생기는 거죠.

## 세 번의 반복

안착하기 전에 세 가지 방법을 시도했어요:

| 옵션                        | 장점                              | 단점                                                  |
| --------------------------- | --------------------------------- | ----------------------------------------------------- |
| iTerm2 "Send text at start" | 간단, 한 줄 설정                  | 조건 분기 없음, 모든 창이 같은 세션                   |
| .zshrc 자동 시작(폐기됨)    | 전체 셸 로직, 창별 세션           | 비터미널 zsh 컨텍스트가 깨짐 (VS Code, .zshrc 소싱 스크립트) |
| iTerm2 Profile Command(선택) | 셸 프로파일과 분리, 스킵 조건 불필요 | 빠른 닫기/열기 시 알려진 race condition               |

`.zshrc` 방식은 처음엔 괜찮아 보였어요 — 비iTerm2 컨텍스트를 건너뛰려고 guard 조건(`$TERM_PROGRAM`, `[[ -t 0 ]]`)을 넣었죠. 하지만 zsh 프로파일을 소싱하는 프로그램들(VS Code 통합 터미널, `zsh -l`을 쓰는 셸 스크립트)이 여전히 tmux 블록을 예상치 못하게 실행시킬 수 있었어요. 근본 문제는 이거예요: `.zshrc`는 너무 많은 컨텍스트에서 실행돼서 안전하게 게이트하기 어려워요.

## 해결 방법: iTerm2 Profile Command

tmux 시작을 iTerm2 Profile Command로 옮기면 컨텍스트 문제가 완전히 사라져요 — 스크립트는 iTerm2가 탭을 열 때만 실행되고, VS Code나 SSH, 스크립트 컨텍스트에서는 절대 실행되지 않아요.

**스크립트 위치:** `~/.local/bin/tmux-smart-attach`

```bash
#!/bin/zsh -l
# tmux-smart-attach — iTerm2 profile startup command
# 1. Attach to first detached session (lowest numbered)
# 2. Create new session named with lowest unused number

# Ensure tmux is found (login shell via -l loads PATH)
detached=$(tmux ls -F '#{session_name} #{session_attached}' 2>/dev/null \
  | awk '$2 == 0 {print $1; exit}')

if [ -n "$detached" ]; then
  exec tmux attach -t "$detached"
else
  # Find lowest unused session number (fills gaps: 0,3 → creates 1)
  taken=$(tmux ls -F '#{session_name}' 2>/dev/null | sort -n)
  n=0
  while echo "$taken" | grep -qx "$n"; do
    ((n++))
  done
  exec tmux new-session -s "$n"
fi
```

**iTerm2 설정:** Profiles → General → Command → "Custom Shell" 선택 → 절대 경로 지정: `/Users/<username>/.local/bin/tmux-smart-attach`

## 동작 방식

스크립트는 간단한 결정 트리를 따라요:

1. detach된 tmux 세션이 있는지 확인해요 (`#{session_attached}`가 0인 세션)
2. 있으면, 첫 번째 detached 세션(가장 낮은 번호)에 attach해요
3. 없으면, 가장 낮은 미사용 번호로 새 세션을 만들어요

### 세션 번호 매기기

| 세션 | 생성 시점                                |
| ---- | ---------------------------------------- |
| `0`  | 첫 번째 창, 세션 없음                    |
| `1`  | 두 번째 창, `0`이 attached 상태          |
| `2`  | 세 번째 창, `0`과 `1` 모두 attached 상태 |

창을 닫으면 세션이 kill이 아니라 detach돼요. 다음 `Cmd+N`은 새로 만드는 대신 첫 번째 detached 세션에 다시 연결돼요.

gap-filling 로직 덕분에, 세션 1을 kill하면(`tmux kill-session -t 1`) 세션 0과 2가 남아요. 다음 `Cmd+N`은 세션 3이 아니라 세션 1(빈자리)을 만들어요.

## 핵심 구현 디테일

**`#!/bin/zsh -l` (로그인 셸 shebang)** — `.zprofile`과 `.zshrc`를 로드해서 PATH에 Homebrew, asdf, 모든 도구가 포함돼요. "`.zshrc` 로딩이 깨진다"던 예전 우려는 틀렸어요 — `-l` 플래그가 tmux 안에서도 전체 셸 환경을 보장하거든요.

**스킵 조건 불필요** — `.zshrc` 방식과 달리, 이 스크립트는 iTerm2가 탭을 열 때만 실행돼요. VS Code 터미널, SSH 세션, 스크립트는 절대 호출하지 않아요.

**`exec tmux`가 스크립트 프로세스를 교체** — tmux를 나간 뒤 남는 셸이 없어요. tmux 세션을 종료하면 터미널 창이 깔끔하게 닫혀요.

**`#{session_attached}` 포맷 변수** — 클라이언트가 attached면 tmux가 `1`, detached면 `0`을 반환해요. "창에서 활성"인 세션과 "저장됐지만 창이 닫힌" 세션을 구분하는 방법이에요.

## 알려진 제한 사항

빠른 닫기/열기 시 race condition이 있어요: `Cmd+W` 직후 바로 `Cmd+N`을 하면 중복 세션이 생길 수 있어요. iTerm2가 창을 완전히 닫는 데 ~1초가 걸리거든요(애니메이션 + pty 정리). 그 사이 tmux 서버는 이전 세션을 여전히 attached로 봐요. `kill -0` PID 체크와 sleep-retry 방식을 시도했지만, iTerm2의 닫기 파이프라인이 non-blocking 해결책을 쓰기엔 너무 느려요. 실제로는 문제를 거의 일으키지 않아요 — 중복 세션은 다음번에 그냥 재사용되거든요.

## 언제 사용하면 좋을까

- 각 터미널 창마다 자체 tmux 세션을 원할 때
- detach된 세션 재사용이 필요할 때 (창 닫고, 다시 열면, 세션이 돌아와요)
- 여러 터미널 컨텍스트(iTerm2, VS Code, SSH)에서 서로 다른 tmux 동작이 필요할 때

## 언제 사용하지 않으면 좋을까

- 의도적으로 모든 창에서 같은 tmux 세션을 쓰고 싶을 때 (페어 프로그래밍, 공유 뷰)
- iTerm2의 `-CC` control mode를 쓸 때 (셸이 아니라 iTerm2가 라이프사이클을 관리해야 해요)
- SSH 연결 끊김 후에도 tmux 세션이 유지돼야 하는 서버에서 (다른 패턴 — `exec` 없이 `tmux attach || tmux new` 사용)
- 터미널 워크스페이스 매니저(Herdr 등)가 이미 최상위 워크스페이스 모델을 맡고 있을 때 — 그 아래에서 tmux를 자동 시작하면 중첩이 생기고, 터미널 레벨의 키·마우스 처리와 충돌할 수 있어요

## 마무리

`.zshrc`에서 tmux를 자동 시작하면 비터미널 zsh 컨텍스트가 깨져요. 로직을 iTerm2 Profile Command로 옮기면 완전히 분리돼요 — 스크립트가 iTerm2가 탭을 열 때만 실행되니까요. `#!/bin/zsh -l` shebang이 전체 셸 환경 로드를 보장하고, gap-filling을 쓰는 숫자 세션 이름이 창마다 자체 작업 공간을 주고, detached 세션 재사용 덕분에 창을 닫아도 작업을 잃지 않아요.

## 참고 자료

- [tmux(1) man page](https://man7.org/linux/man-pages/man1/tmux.1.html)
- [iTerm2 tmux Integration](https://iterm2.com/documentation-tmux-integration.html)
