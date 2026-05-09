---
title: macOS VSCode 터미널 locale fallback 문제
description: >-
  macOS에서 VSCode integrated terminal이 조용히 비영어 locale로 바뀔 수 있어요.
  `git status`가 갑자기 한국어로 말하는 이유, 그리고 `settings.json`에 `LANG`을
  고정하는 방법이에요.
date: 2026-04-11T00:00:00.000Z
updated: '2026-05-10'
tags:
  - devops
  - macos
  - vscode
  - locale
  - i18n
  - gotcha
category: devops
draft: false
lang: ko
source_lang: en
source_slug: macos-vscode-terminal-locale-fallback
source_updated: 2026-04-11T00:00:00.000Z
translation_date: '2026-05-10'
---

오늘 VSCode를 열고 변경사항이 있는 repo에서 `git status`를 돌렸는데, 출력이 한국어로 나왔어요. login shell은 여전히 영어였어요. 다른 건 전혀 이상하지 않았어요 — Terminal.app, iTerm2, tmux, 열려 있던 다른 모든 shell은 전부 표준 `en_US.UTF-8` 출력을 보여 주고 있었어요. 오직 VSCode의 integrated terminal만 git이 한국어로 말해야 한다고 결정한 거예요.

원인은 존재하는지도 몰랐던 macOS locale 설정과, documentation을 한 번도 제대로 읽어본 적 없던 VSCode 설정의 조합이었어요. 이 글에서는 실제로 무슨 일이 일어나고 있었는지, debugging을 늦춘 misleading한 신호들, 제가 적용한 fix, 그리고 고려했다가 버린 세 가지 대안 fix를 차례로 정리할게요.

## 트리거: POSIX 대응이 없는 `AppleLocale`

macOS는 System Settings → General → Language & Region에서 Language와 Region을 독립적으로 쪼갤 수 있어요. 제 설정은 이랬어요.

- **Language:** English
- **Region:** Korea

이 조합은 완전히 합리적으로 느껴져요. "OS는 영어로 쓰고 싶은데, 날짜는 한국식, 달력은 한국식, 통화는 원화로 보고 싶어요" 같은 거예요. 이게 내부적으로 만들어 내는 `defaults` 값은 이래요.

```bash
$ defaults read -g AppleLocale
en_KR
$ defaults read -g AppleLanguages
(
    "en-KR",
    "ko-KR"
)
```

문제는 `en_KR`이 실제 POSIX locale이 아니라는 점이에요. macOS는 영어 locale로 `en_US.*`, `en_GB.*`, `en_AU.*`, `en_CA.*`, `en_IE.*`, `en_NZ.*`만 ship해요. `en_KR.UTF-8`은 존재하지 않아요. 직접 확인할 수 있어요.

```bash
$ locale -a | grep -i '^en_KR'
# (비어 있음)
```

POSIX locale은 시스템이 명시적으로 생성해야 하는 `{language}_{region}` 쌍이에요. macOS(그리고 대부분의 Linux 배포판)는 `en_KR`을 아무도 요청하지 않기 때문에 생성하지 않아요. 그래서 `AppleLocale`을 쓸 수 있는 `LANG` 값으로 번역하려는 dev tool은 primary entry에서 막다른 길에 부딪혀요.

대부분의 tool은 이 상황을 우아하게 처리해요 — shell이 말해 주는 `LANG`으로 fallback하거든요. 그런데 VSCode는 좀 더 야심차게 움직여요.

## `detectLocale: "auto"`가 하는 일

VSCode integrated terminal에는 `terminal.integrated.detectLocale`이라는 설정이 있고, 기본값은 `"auto"`예요. macOS에서 auto-detection은 이렇게 동작해요.

1. `defaults read -g AppleLocale`을 질의해서 결과를 POSIX locale로 매핑해 보려 해요.
2. primary entry가 실패하면(`en_KR`이 그렇죠), `AppleLanguages` 배열을 walk하면서 매핑 가능한 걸 찾아요.
3. `en-KR` → 또 실패해요. 이유는 같아요.
4. `ko-KR` → 성공해요. `ko_KR.UTF-8`은 macOS에 존재하니까, VSCode가 `LANG=ko_KR.UTF-8`을 integrated terminal의 환경에 주입해요.
5. git의 `gettext`가 process start 시점에 `LANG`을 읽고 한국어 message catalog를 load해요.
6. `git status`, `git log`, `git diff`, `git commit` — 전부 한국어로 말해요.

반면 login shell(Terminal.app, iTerm2, 그 안의 tmux)은 `.zshrc`/`.zprofile` 또는 시스템 기본값에서 `LANG`을 읽는데, 보통은 `en_US.UTF-8`이에요. 그래서 한국어 출력은 VSCode에서만 보여요. VSCode만 체인에서 `AppleLocale`을 직접 consult하는 process거든요.

## 헷갈리게 만드는 신호들

이 원인을 찾는 데 필요 이상으로 오래 걸린 이유는, debugging 신호들이 전부 다른 방향을 가리키고 있었기 때문이에요.

**VSCode terminal 안에서 `locale`을 돌리면 여전히 `en_US.UTF-8`을 보여 줘요.** `locale` 명령은 *현재 shell의* 환경을 보여 주는데, VSCode가 `ko_KR.UTF-8`을 주입한 뒤 shell rc가 다시 `en_US.UTF-8`로 되돌렸을 수 있어요. 한국어 git 출력은 gettext가 git process start 시점에 환경을 읽은 결과고, 이건 shell rc가 뭔가 되돌리기 전에 일어나요. 그래서 shell의 `locale` 리포트와 git의 행동은 서로 다른 시점을 보고 있고, 서로 의견이 안 맞아요. shell은 자기 현재 상태에 대해 진실을 말하고 있지만, 그 진실에는 process lifecycle 앞쪽에서 일어난 일이 포함돼 있지 않은 거예요.

**`grep -i locale`을 shell rc에 돌리면 아무것도 안 나와요.** 그러면 엉뚱한 곳에서 process-level 주입을 찾게 돼요. shell startup 파일, tmux config, dotfiles repo, `/etc/profile` 같은 곳이요. 정작 범인은 editor 자체의 `settings.json`이에요. locale 문제를 풀 때 보통 grep할 대상이 아니죠.

**기존에 거의 비어 있는 `terminal.integrated.env.osx` block은 도움이 안 돼요.** 저는 이미 다른 이유로 `{"TERM": "xterm-256color"}`를 설정해 둔 상태였는데, 이게 VSCode의 auto-detection을 막아 줄 것 같은 기분이 들었어요. 안 막아 줘요. `terminal.integrated.env.osx`는 auto-detect된 값과 *merge*해요. 교체하지 않아요. 부분 block은 auto-detection을 off하지 않아요. override하고 싶은 env var를 명시적으로 설정해야 해요.

**`LANG` 하나만으로는 부족해요.** 아래쪽에서 누군가 `LC_MESSAGES`나 `LC_ALL`을 설정하면 `LANG`은 져요. `LC_ALL`은 nuclear override예요 — `LANG`을 포함해 모든 걸 이겨요. 방어적으로 가려면 `LANG`과 `LC_ALL`을 둘 다 설정하는 게 맞아요.

## 수정 방법

VSCode의 `terminal.integrated.env.osx`에 `LANG`과 `LC_ALL`을 명시적으로 고정하세요. 명시적 env var가 VSCode의 locale auto-detection을 override해요. `detectLocale`을 따로 끌 필요는 없어요.

```json
// settings.json
"terminal.integrated.env.osx": {
    "TERM": "xterm-256color",
    "LANG": "en_US.UTF-8",
    "LC_ALL": "en_US.UTF-8"
}
```

VSCode를 reload하거나 새 terminal tab을 열어야 해요. 기존 탭은 닫았다 다시 열기 전까진 예전 환경을 유지해요. 변경사항이 있는 repo에서 `git status`를 돌려 확인해 보세요. 출력이 다시 영어로 돌아와 있어야 해요.

## 고려했다가 버린 옵션들

| 옵션                                                      | 장점                                                                                             | 단점                                                                             |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| **A. `terminal.integrated.env.osx`에 `LANG`/`LC_ALL` 고정** | VSCode 범위에 한정, shell rc 실패에도 안전, settings.json diff에서 명시적으로 review 가능        | VSCode task나 debug process엔 영향 없음 — integrated terminal만 커버            |
| B. `terminal.integrated.detectLocale: "off"`              | 설정이 더 작음, shell rc를 single source of truth로 삼음                                         | shell rc가 `LANG`을 안 주면 조용히 깨짐 (minimal container, remote SSH 등)       |
| C. System Settings에서 `AppleLocale` 바꾸기               | 모든 tool에 system-wide로 적용되는 root-root fix                                                 | Korean-region 기본값을 잃음 (달력, 통화, 전화번호 포맷)                         |
| D. `~/.zshrc` 또는 `~/.zprofile`에 `LANG` 설정            | 한 줄짜리 shell 레벨 fix                                                                          | VSCode가 주입한 env를 override하지 못함 — gettext가 shell rc보다 먼저 읽음       |

저는 **Option A**를 골랐어요. 범위가 좁고, review 가능하고, 장애에 강해요. shell rc가 깨지는 상황(Option B의 약점)에서도 살아남고, macOS regional 포맷을 망가뜨리지 않고(Option C의 비용), 실제로 동작해요(Option D는 gettext와의 race에서 져요). `LANG`과 `LC_ALL`을 둘 다 설정하면 다른 process가 나중에 `LC_MESSAGES`를 주입할 경우에도 `LC_ALL`이 nuclear override로 safety net이 돼 줘요.

Option C가 정당한 선택이 되는 경우가 하나 있긴 해요. Finder, Messages, Mail 같은 다른 macOS 앱에서도 예상 밖의 localization이 보인다면, 문제는 OS 레벨이고 소스에서 고쳐야 해요. 제 경우엔 VSCode만 영향을 받았으니까 VSCode-scoped fix로 충분했어요.

## 대안: `detectLocale`을 완전히 끄기

shell rc가 `LANG`을 확실히 설정한다고 신뢰하고 설정 layer를 하나 줄이고 싶다면 이렇게도 할 수 있어요.

```json
"terminal.integrated.detectLocale": "off"
```

이러면 VSCode가 locale var를 아예 주입하지 않고, shell과 시스템이 주는 값에 전적으로 의존해요. 앞의 명시적 env 방식이 더 안전한 이유는 shell rc 지원이 없는 환경에서도 동작하기 때문이에요 — minimal container, SSH remote host, 빈약한 shell을 가진 dev container 같은 곳이요. 하지만 shell을 잘 설정해 둔 사용자에겐 `detectLocale: "off"`도 최소 설정으로 타당한 대안이에요.

## Debugging 체크리스트

비슷한 문제를 겪게 된다면 다음번엔 저는 이 순서로 확인할 거예요.

1. `locale` — login shell은 뭘 보고해요?
2. `defaults read -g AppleLocale` — macOS가 뭘 advertise하고 있어요?
3. `defaults read -g AppleLanguages` — fallback list는 뭐예요?
4. `locale -a | grep -i '^en_'` — 시스템에 실제로 있는 영어 locale은 뭐예요?
5. VSCode integrated terminal을 열고 `echo $LANG $LC_ALL $LC_MESSAGES` — VSCode가 뭘 주입했어요?
6. 5단계 결과를 1단계 결과와 비교하세요. 다르다면 VSCode가 locale override의 출처예요.

## 정리

- macOS는 POSIX 대응이 없는 `AppleLocale`(예: `en_KR`)을 설정할 수 있어요. OS 레벨에서는 valid하지만, 이걸 `LANG`으로 매핑하려는 tool은 `AppleLanguages`의 보조 entry로 fall through해요.
- VSCode의 `terminal.integrated.detectLocale: "auto"`는 macOS에서 primary lookup이 실패하면 `AppleLanguages`를 walk하면서, `LANG=ko_KR.UTF-8`(또는 `ja_JP.UTF-8` 등 보조 언어가 무엇이든)을 얌전히 주입해 버려요.
- `terminal.integrated.env.osx`는 auto-detect된 값과 *merge*해요. 부분 block은 auto-detection을 끄지 못해요.
- `LC_ALL`은 nuclear override예요. 어떤 다른 process가 뭘 주입하든 특정 locale을 보장해야 할 땐 `LANG`과 `LC_ALL`을 둘 다 설정하세요.
- macOS에서 Language: English + Region: 비영어권 조합으로 쓰고 있다면 이 trap이 기다리고 있어요. fix는 `settings.json`에 세 줄이면 돼요.
