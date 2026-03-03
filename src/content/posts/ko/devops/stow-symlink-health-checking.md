---
title: "Stow Symlink 상태 점검"
description: "GNU Stow가 만든 symlink이 앱 업데이트로 깨지는 문제를 감지하고 복구하는 방법을 알아봐요."
date: 2026-02-09T00:00:00.000Z
updated: 2026-02-09T00:00:00.000Z
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
source_updated: "2026-02-09"
translation_date: "2026-03-04"
references:
  - url: "https://www.gnu.org/software/stow/manual/"
    title: GNU Stow Manual
    type: official
  - url: null
    title: stow-doctor.sh implementation
    type: experience
---

GNU Stow는 시스템 설정 경로에서 dotfiles 저장소로 symlink를 만들어서, 저장소를 SoT(단일 진실 원천)로 사용할 수 있게 해줘요. 그런데 `gh`나 Karabiner-Elements 같은 앱들이 업데이트할 때 이 symlink를 일반 파일로 조용히 덮어씌워요. 아무 경고 없이 SoT 모델이 깨지는 거죠.

## 문제

앱이 업데이트되면 보통 이런 일이 생겨요:

1. 기존 파일(symlink)을 삭제해요
2. 같은 위치에 새 일반 파일을 써요
3. dotfiles 저장소가 더 이상 그 설정을 관리하지 못해요

이건 눈에 안 보여요. 설정 파일은 여전히 존재하고 잘 작동하지만, 저장소에서의 편집이 시스템에 반영되지 않아요.

## 감지 패턴

stow가 관리해야 하는 각 파일을 확인하세요:

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

## 복구 패턴

GNU Stow의 `--adopt` 플래그로 복구할 수 있어요:

```bash
stow --adopt -R -t "$HOME" -d "$STOW_DIR" "$package"
```

이 명령은 두 가지를 해요:

1. **Adopt:** 시스템 파일을 저장소로 옮겨요(저장소 버전을 덮어씌움)
2. **Restow(`-R`):** 시스템에서 저장소로의 symlink를 다시 생성해요

복구 후에는 항상 `git diff`를 확인하세요. adopt된 파일이 저장소 버전과 다를 수 있어요. 새 버전을 커밋하거나 `git checkout`으로 저장소 버전을 복원하면 돼요(symlink는 유지돼요).

## `.stow-local-ignore` 처리

Stow 패키지에는 설정이 아닌 파일(문서, 스크립트)이 포함될 수 있어요. `.stow-local-ignore` 파일에는 stow가 건너뛸 파일의 Perl 정규식 패턴이 들어있어요. symlink 상태를 점검할 때 이 파일들도 제외해야 해요.

## 핵심 포인트

- 앱은 업데이트할 때 아무 경고 없이 symlink를 덮어씌워요
- 감지: `[[ -L "$file" ]]`로 확인하고 symlink 대상 검증
- 복구: `stow --adopt -R` 후 `git diff` 검토
- `.stow-local-ignore` 패턴은 상태 점검에서 항상 제외
- `brew upgrade`, 앱 업데이트, macOS 업데이트 후에 점검 실행

## 예시

```bash
# stow-doctor.sh 출력 - 문제 표시:
# gh
#   overwritten  .config/gh/config.yml
#   overwritten  .config/gh/hosts.yml
# karabiner
#   overwritten  .config/karabiner/karabiner.json
```
