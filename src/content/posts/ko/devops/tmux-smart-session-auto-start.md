---
title: "tmux 스마트 세션 자동 시작"
description: "숫자 세션 이름으로 .zshrc에서 tmux를 자동 시작해서, 새 터미널 창마다 독립된 tmux 세션을 사용하는 방법이에요."
date: 2026-02-25T00:00:00.000Z
updated: 2026-02-25T00:00:00.000Z
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
source_updated: "2026-02-25"
translation_date: "2026-03-04"
references:
  - url: "https://man7.org/linux/man-pages/man1/tmux.1.html"
    title: tmux(1) man page
    type: official
  - url: "https://iterm2.com/documentation-tmux-integration.html"
    title: iTerm2 tmux Integration
    type: official
---

새 터미널 창(`Cmd+N`)마다 독립된 tmux 세션을 갖고, 닫힌 창의 detach된 세션을 재사용하는 설정이에요.

---

## 문제

iTerm2의 "Send text at start" 설정에서 `tmux new -A -s main\n`을 쓰면 항상 같은 `main` 세션에 attach돼요. `-A` 플래그는 "있으면 attach, 없으면 생성"이라는 뜻이에요. `Cmd+N`으로 여는 모든 창이 같은 세션에 다시 연결돼서, 독립된 작업 공간 대신 여러 창에서 같은 pane과 내용이 보여요.

---

## 겪었던 어려움

- **iTerm2 설정의 한계**: "Send text at start"는 셸에 텍스트를 주입할 뿐이에요. 조건 분기가 없어서, 세션이 이미 다른 창에서 attach돼 있는지 감지할 수 없어요.
- **빠른 닫기/열기 시 race condition**: `Cmd+W` 직후 `Cmd+N`을 하면 중복 세션이 생겨요. iTerm2가 창을 완전히 닫는 데 ~1초 걸리거든요(애니메이션 + pty 정리). tmux 서버는 아직 이전 세션을 attached 상태로 봐요. `kill -0` PID 체크나 sleep-retry를 시도했지만, iTerm2의 닫기 파이프라인이 non-blocking 방식으로는 너무 느려요. 알려진 제한 사항으로 기록했어요.
- **비터미널 컨텍스트 보호**: VS Code 통합 터미널, SSH 세션, 비대화형 셸(스크립트)에서는 tmux가 자동 시작되면 안 돼요. 각각 다른 환경 변수로 감지해야 해요.

---

## 해결 방법

tmux 관리를 iTerm2에서 `.zshrc` Section 1a로 옮기세요. Homebrew PATH 설정 직후에 배치해서 `tmux` 바이너리를 찾을 수 있게 해요:

```bash
if [[ -z "$TMUX" ]] && [[ "$TERM_PROGRAM" != "vscode" ]] \
   && command -v tmux &>/dev/null && [[ -t 0 ]]; then
  _detached=$(tmux list-sessions -F '#{session_name} #{session_attached}' \
    2>/dev/null | awk '$1 ~ /^[0-9]+$/ && $2 == "0" { print $1; exit }')

  if [[ -n "$_detached" ]]; then
    exec tmux attach-session -t "$_detached"
  else
    _n=0
    while tmux has-session -t "$_n" 2>/dev/null; do
      ((_n++))
    done
    exec tmux new-session -s "$_n"
  fi
fi
```

## 핵심 포인트

- **숫자 이름(0, 1, 2, ...)** — tmux의 기본 컨벤션과 일치해요. 타이핑하기 쉽죠: `tmux kill-session -t 2`, `tmux attach -t 0`. 첫 번째 세션에 대한 특별 처리가 필요 없어요.
- **`exec tmux`로 셸 프로세스를 교체** — tmux 종료 후 남는 셸이 없어요. 터미널 창이 깔끔하게 닫혀요. `exec` 없이는 tmux를 나가면 빈 셸로 떨어져요.
- **`#{session_attached}`** — tmux 포맷 변수로, 클라이언트가 attached면 `1`, detached면 `0`을 반환해요. "활성 창"과 "저장됐지만 닫힌" 세션을 구분하는 방법이에요.
- **awk 정규식 필터 `$1 ~ /^[0-9]+$/`** — 숫자 세션만 관리해요. 커스텀 이름 세션(예: `dev`, `work`)은 자동 시작에 영향받지 않아요.
- **Homebrew 이후 배치** — tmux 바이너리가 `/opt/homebrew/bin/`에 있어요. PATH 설정 전에 이 블록을 실행하면 `command -v tmux`가 실패해요.
- **이중 소싱 라이프사이클** — `.zshrc`가 두 번 실행돼요: tmux 밖에서 한 번(`exec` 트리거), tmux 안에서 한 번(`$TMUX`가 설정돼 있어서 블록 스킵). 모든 플러그인, alias, 도구는 tmux 안에서의 두 번째 패스에서 로드돼요.

## 세션 네이밍

| 세션 | 생성 시점                                |
| ---- | ---------------------------------------- |
| `0`  | 첫 번째 창, 세션 없음                    |
| `1`  | 두 번째 창, `0`이 attached 상태          |
| `2`  | 세 번째 창, `0`과 `1` 모두 attached 상태 |

창을 닫으면 세션이 detach(kill 아님)돼요. 다음 `Cmd+N`은 새로 만들지 않고 첫 번째 detached 숫자 세션에 다시 연결돼요.

---

## 검토한 옵션

| 옵션                        | 장점                               | 단점                                |
| --------------------------- | ---------------------------------- | ----------------------------------- |
| iTerm2 "Send text at start" | 간단, 한 줄 설정                   | 조건 분기 없음, 모든 창이 같은 세션 |
| iTerm2 Profile Command      | 셸 초기화 전 실행                  | 로그인 셸 교체, .zshrc 로딩이 깨짐  |
| .zshrc 자동 시작(선택)      | 전체 셸 로직, 창별 세션, 스킵 조건 | 빠른 닫기/열기 시 race condition    |

## 이 방식을 선택한 이유

`.zshrc` 자동 시작은 조건 로직(attached 세션 감지, VS Code 스킵 등)을 사용하면서도 전체 셸 환경을 로드할 수 있는 유일한 옵션이에요. `exec` 패턴으로 깔끔하게 유지돼요. 포크 대신 셸 프로세스를 교체하니까 성능 오버헤드가 없어요.

---

## 언제 사용하면 좋을까

- 각 터미널 창마다 독립된 tmux 세션을 원할 때
- detached 세션 재사용이 필요할 때 (창 닫고, 다시 열면, 세션이 돌아와요)
- 여러 터미널 컨텍스트(iTerm2, VS Code, SSH)에서 다른 tmux 동작이 필요할 때

## 언제 사용하지 않으면 좋을까

- 의도적으로 모든 창에서 같은 tmux 세션을 쓰고 싶을 때 (페어 프로그래밍, 공유 뷰)
- iTerm2의 `-CC` control mode를 쓸 때 (셸이 아니라 iTerm2가 라이프사이클을 관리해야 해요)
- SSH 연결 끊김 후에도 tmux 세션이 유지돼야 하는 서버에서 (다른 패턴 — `exec` 없이, `tmux attach || tmux new` 사용)
