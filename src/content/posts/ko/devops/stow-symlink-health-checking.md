---
title: Stow Symlink 상태 점검
description: GNU Stow가 만든 symlink이 앱 업데이트로 깨지는 문제를 감지하고 복구하는 방법을 알아봐요.
date: 2026-02-09T00:00:00.000Z
updated: '2026-08-02'
tags:
  - devops
  - dotfiles
  - stow
  - symlinks
category: devops
draft: false
lang: ko
source_lang: en
source_slug: stow-symlink-health-checking
source_updated: '2026-08-02'
translation_date: '2026-08-02'
references:
  - url: 'https://manpages.debian.org/bookworm/stow/stow.8.en.html'
    title: 'stow(8) manual page (GNU Stow 2.3.1) — --adopt, --restow, and tree folding'
    type: official
  - url: 'https://github.com/aspiers/stow/blob/v2.4.1/doc/stow.texi#L590'
    title: 'GNU Stow 2.4.1 manual source (doc/stow.texi) — .stow-local-ignore ignore lists'
    type: authoritative
  - url: null
    title: stow-doctor.sh implementation
    type: experience
---

GNU Stow는 시스템 설정 경로에서 dotfiles 저장소로 symlink를 만들어서, 저장소를 SoT(단일 진실 원천)로 사용할 수 있게 해줘요. 그런데 `gh`나 Karabiner-Elements 같은 앱들이 업데이트할 때 이 symlink를 일반 파일로 조용히 덮어씌워요. 아무 경고 없이 SoT 모델이 깨지는 거죠.

## 조용히 깨지는 symlink

앱이 설정을 업데이트하면 보통 이런 일이 생겨요:

1. 기존 파일(symlink)을 삭제해요
2. 같은 위치에 새 일반 파일을 써요
3. dotfiles 저장소가 더 이상 그 설정을 관리하지 못해요

이건 일상적으로는 눈에 안 보여요. 설정 파일은 여전히 존재하고 잘 작동하지만, 저장소에서의 편집이 시스템에 반영되지 않아요. 새 머신을 셋업하거나 설정을 동기화하려고 할 때까지 알아채지 못하죠. 그쯤 되면 시스템 버전과 저장소 버전이 이미 크게 어긋나 있을 수 있어요.

## Symlink 깨짐 감지하기 (단순한 버전)

처음에 작성한 감지 로직은 stow가 관리해야 하는 각 파일을 확인하고 상태를 분류해요:

```bash
# symlink인지 확인
if [[ -L "$target" ]]; then
    # stow 패키지를 가리키는지 확인
    link_target="$(readlink "$target")"
    if [[ "$link_target" == *"dotfiles/$pkg/"* ]]; then
        # 정상: symlink 유지됨
    fi
elif [[ -e "$target" ]]; then
    # 덮어씌워짐: 일반 파일이 symlink를 대체함
else
    # 누락: 대상에 파일이 없음
fi
```

핵심은 `-L` 테스트(symlink인지)와 그 다음 symlink 대상이 dotfiles 저장소를 가리키는지 확인하는 거예요. 존재는 하는데 symlink가 아닌 파일은 앱 업데이트에 의해 덮어씌워진 거고요.

실제로 모든 Stow 패키지에 이걸 돌리면 이런 출력이 나와요:

```bash
# stow-doctor.sh 출력 - 문제 표시:
# gh
#   overwritten  .config/gh/config.yml
#   overwritten  .config/gh/hosts.yml
# karabiner
#   overwritten  .config/karabiner/karabiner.json
```

문제없어 보이죠. 미묘하게 잘못된 부분을 발견하기 전까지는요.

## 만들면서 빠진 세 가지 함정

`stow-doctor.sh`를 여러 세션에 걸쳐서 만들었는데, 30분짜리 스크립트가 며칠짜리 작업으로 늘어난 함정이 세 개 있었어요. 각각이 그럴듯하게 잘못된 결과를 만들어내기 때문에 자세히 적어둘 가치가 있어요.

### 함정 1: `stow --adopt`는 기존 디렉토리에 병합하지 못해요

처음으로 `~/.config/{pkg}` 디렉토리가 이미 실제 폴더(stow 패키지로의 symlink가 아닌)로 존재하는 패키지를 온보딩하려고 했을 때, `stow --adopt -R`이 이런 에러로 멈췄어요:

```text
existing target is not owned by stow: .config/{pkg}
```

저는 `--adopt`가 "지금 여기 있는 모든 걸 가져온다"는 일반적인 플래그라고 생각했는데, 그게 아니었어요. `--adopt`는 **개별 파일**을 패키지로 adopt하고 다시 링크하도록 설계되어 있어요. 미리 존재하는 디렉토리 트리 전체를 병합하는 전략은 없어요. 깔끔하게 복구하려면 기존 디렉토리(또는 symlink)를 먼저 제거하고, 그다음 plain `stow`로 디렉토리 수준의 symlink를 새로 만들면 돼요.

### 함정 2: Tree folding이 leaf-only 점검에서 오탐을 만들어요

이게 한 세션 내내 패키지가 손상됐다고 확신하게 만든 함정이에요. Stow는 기본적으로 **tree folding**을 사용해요: 전체 서브트리가 하나의 패키지에 속해 있으면, 파일별 symlink 대신 가능한 가장 높은 디렉토리 레벨에 단일 symlink를 만들어요. [stow(8) man page](https://manpages.debian.org/bookworm/stow/stow.8.en.html)에도 그대로 적혀 있어요 (이 페이지는 GNU Stow 2.3.1 기준이고, 2.4.1 페이지에도 같은 내용이 있어요) — "if Stow can create a single symlink that points to an entire subtree within the package tree, it will choose to do that rather than create a directory in the target tree and populate it with symlinks." 그래서 이런 모양 대신:

```text
~/.config/gh/config.yml → ~/dotfiles/gh/.config/gh/config.yml
~/.config/gh/hosts.yml  → ~/dotfiles/gh/.config/gh/hosts.yml
```

실제로는 이렇게 돼요:

```text
~/.config/gh → ~/dotfiles/gh/.config/gh
```

`~/.config/gh` 디렉토리 자체가 symlink이고, 그 안의 파일들은 (symlink의 대상 기준에서) 일반 파일이에요. 단순한 `[[ -L "$file" ]]` 점검은 leaf 경로를 stat해서 일반 파일을 보고 "덮어씌워짐"으로 보고해버려요. 패키지가 제대로 stow되어 있는데도요.

`stat`으로 확인해봤어요:

```bash
# Tree-folded 케이스 - 디렉토리가 symlink, 안의 파일은 일반 파일:
$ stat -f '%N: %HT' ~/.config/gh ~/.config/gh/config.yml
/Users/me/.config/gh: Symbolic Link
/Users/me/.config/gh/config.yml: Regular File

# inode 비교로 파일이 저장소 사본과 동일한지 확인:
$ stat -f '%i' ~/.config/gh/config.yml ~/dotfiles/gh/.config/gh/config.yml
120102543
120102543
```

올바른 감지는 조상 디렉토리부터 확인해야 해요. leaf를 stat하기 전에, 파일에서 `$TARGET_DIR` 방향으로 위로 거슬러 올라가요. 어떤 조상이라도 stow가 소유한 symlink라면, 그 파일은 tree folding을 통해 도달한 거고 정상으로 카운트해요:

```bash
check_file() {
    local pkg="$1"
    local rel="$2"
    local target="$TARGET_DIR/$rel"

    # Tree-folding 케이스: TARGET_DIR과 leaf 사이의 조상 중
    # 하나라도 stow-owned symlink라면, 파일은 folding을 통해 도달함.
    local ancestor
    ancestor="$(dirname "$target")"
    while [[ "$ancestor" != "$TARGET_DIR" && "$ancestor" != "/" ]]; do
        if [[ -L "$ancestor" ]]; then
            local atgt
            atgt="$(readlink "$ancestor")"
            if [[ "$atgt" == *"dotfiles/$pkg/"* ]]; then
                return 0  # folded ancestor 디렉토리를 통해 링크됨
            fi
            break  # ancestor가 symlink지만 stow-owned는 아님
        fi
        ancestor="$(dirname "$ancestor")"
    done

    # folded ancestor가 없으면 앞의 단순 per-file 점검으로 fallthrough
    if [[ -L "$target" ]]; then
        # ... 원래 leaf 점검
    elif [[ -e "$target" ]]; then
        return 1  # 덮어씌워짐
    else
        return 2  # 누락
    fi
}
```

이 수정에는 두 가지 중요한 속성이 있어요:

- **walk를 `$TARGET_DIR`에서 멈춰야 해요**, 안 그러면 파일시스템 더 위쪽의 무관한 symlink (예: 다른 곳을 가리키는 `$HOME/dev`)와 우연히 매치될 수 있어요.
- **수정은 엄격하게 추가적이에요.** 어떤 조상도 stow symlink가 아니면, 원래의 per-file 점검이 변경 없이 실행돼요. ancestor walk는 false-overwritten 보고를 다시 정상으로 뒤집을 수만 있고, 진짜 덮어씌움을 가릴 순 없어요.

### 함정 3: 레거시 경로 드리프트가 호환 shim 뒤에 숨어 있어요

dotfiles 저장소를 `~/dev/personal/dotfiles`에서 `~/dev/personal/3b/dotfiles`로 옮긴 후에도, 모든 stow symlink가 여전히 정상으로 나왔어요. 그러면 안 됐는데 — 옛날 위치를 가리키고 있었거든요. 무슨 일이 일어났냐면, 옛 경로의 호환 symlink (`~/dev/personal/dotfiles → ~/dev/personal/3b/dotfiles`)가 stow symlink를 두 단계 간접 참조로 해석되게 만들어서 모든 게 멀쩡해 보였던 거예요.

함정은 이 "정상" 상태가 호환 shim에 숨겨진 의존성을 갖는다는 거예요. shim이 제거되면, stow가 소유한 모든 설정이 동시에 조용히 깨져요. 해결책은 저장소 마이그레이션 중에 **canonical path로 다시 stow**하는 거예요. 그러면 symlink가 호환 hop 없이 새 위치를 직접 가리키게 돼요.

참고로 symlink에 `rm`을 쓰는 게 여기서 도움이 돼요 — link만 제거하고 대상은 안 건드려요. 그래서 새 canonical path에서 다시 stow하기 전에 레거시 symlink를 안전하게 해체할 수 있어요. 파일은 잃지 않고요.

## 깨진 symlink 복구하기

감지가 신뢰할 만해지면, GNU Stow의 `--adopt` 플래그로 복구할 수 있어요:

```bash
stow --adopt -R -t "$HOME" -d "$STOW_DIR" "$package"
```

이 명령은 두 가지를 해요:

1. **Adopt:** 시스템 파일을 저장소로 옮겨요 (저장소 버전을 덮어씌움)
2. **Restow(`-R`):** 시스템에서 저장소로의 symlink를 다시 생성해요

복구 후에는 항상 dotfiles 저장소에서 `git diff`를 확인하세요. adopt된 파일이 저장소 버전과 다를 수 있어요 — 앱이 업데이트하면서 새 설정을 추가하거나 값을 바꿨을 수 있거든요. 새 버전을 커밋하거나 (앱의 변경을 받아들임) `git checkout`으로 저장소 버전을 복원하면 돼요 (어느 쪽이든 symlink는 유지돼요).

`--adopt`는 파일 충돌만 처리한다는 걸 기억하세요. 디렉토리 충돌이라면 (함정 1), 기존 디렉토리를 먼저 제거하고 plain `stow`를 실행해야 해요.

## `.stow-local-ignore` 처리

Stow 패키지에는 설정이 아닌 파일(문서, 스크립트, README)이 포함될 수 있어요. `.stow-local-ignore` 파일에는 한 줄에 하나씩 Perl 정규식을 적고, 패키지 안에서 거기 매치되는 파일이나 디렉토리는 링킹할 때 건너뛰어요. 이 규칙은 manual source에 적혀 있어요 — [v2.4.1 태그의 `doc/stow.texi`](https://github.com/aspiers/stow/blob/v2.4.1/doc/stow.texi#L590)인데, 렌더링된 문서가 아니라 Texinfo 마크업이에요. symlink 상태를 점검할 때 이 패턴들도 똑같이 제외해야 해요 — 안 그러면 doctor 스크립트가 의도적으로 제외된 파일을 "누락"으로 보고해요.

## 언제 점검을 실행할까

symlink 상태 점검은 이럴 때 실행해요:

- `brew upgrade` 후 (앱이 설정을 다시 쓸 수 있어요)
- macOS 업데이트 후 (시스템 환경설정이 리셋될 수 있어요)
- 설정 파일을 수정하는 앱 업데이트 후
- dotfiles 저장소를 옮기거나 재구성한 후 (함정 3)
- 주기적으로 (주 단위 또는 월 단위) 안전망으로

## 핵심 포인트

- 앱은 업데이트할 때 아무 경고 없이 symlink를 덮어씌워요
- 감지: 조상 디렉토리부터 walk하고, 그다음 `[[ -L "$file" ]]`로 확인하고 symlink 대상 검증
- leaf만 점검하면 tree-folded 패키지에서 오탐이 나요 — `$TARGET_DIR`과 leaf 사이의 stow-owned 조상은 정상으로 카운트해요
- `stow --adopt`는 파일 충돌만 처리해요, 디렉토리 충돌은 안 돼요 — 기존 디렉토리를 먼저 제거하고 plain `stow` 실행
- symlink에 대한 `rm`은 link만 제거하고 대상은 안 건드려요 — 다시 stow하기 전에 레거시 symlink를 해체하는 안전한 방법
- 저장소 마이그레이션 후에는 canonical path에서 다시 stow해서 symlink가 숨겨진 호환 shim에 의존하지 않게 해요
- 복구: `stow --adopt -R` 후 `git diff` 검토
- `.stow-local-ignore` 패턴은 상태 점검에서 항상 제외

## 마무리

GNU Stow로 dotfiles를 관리한다면, 앱들이 업데이트하면서 symlink를 조용히 깨뜨릴 거고 — tree folding을 고려하지 않는 한 감지 스크립트도 어떤 패키지가 정상인지 조용히 거짓말을 할 거예요. leaf를 stat하기 전에 조상 디렉토리를 walk하고, stow-owned 조상을 링크 정상의 증거로 취급하고, 저장소 마이그레이션 후에는 canonical path에서 다시 stow하는 health check를 만드세요. 진짜 덮어씌움이 발생하면 `stow --adopt -R`로 복구할 수 있어요. 워크플로우는: 감지 → adopt → diff 검토 → 커밋하거나 복원. 주기적인 health check 없이 — 그리고 tree-folding 수정 없이 — dotfiles 저장소는 점차 실제 시스템 설정과 맞지 않는 픽션이 되고, 다음에 새 머신을 셋업할 때까지 알아채지 못해요.

## 참고 자료

- [stow(8) man page](https://manpages.debian.org/bookworm/stow/stow.8.en.html) —
  `--adopt`, `-R`/`--restow`, tree folding 규칙. 이 페이지는 GNU Stow 2.3.1 기준이에요.
- [GNU Stow manual source, v2.4.1의 `doc/stow.texi`](https://github.com/aspiers/stow/blob/v2.4.1/doc/stow.texi#L590)
  — `.stow-local-ignore` ignore list 규칙. Savannah 저장소를 미러링한 메인테이너의
  GitHub 저장소이고, 인용한 줄이 밀리지 않도록 릴리스 태그에 고정했어요.
