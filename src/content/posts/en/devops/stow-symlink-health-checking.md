---
title: Stow Symlink Health Checking
description: 'GNU Stow creates symlinks from system config paths back to a dotfiles repo,'
date: 2026-02-09T00:00:00.000Z
updated: 2026-02-09T00:00:00.000Z
tags:
  - devops
  - dotfiles
  - stow
  - symlinks
category: devops
draft: false
lang: en
references:
  - url: 'https://www.gnu.org/software/stow/manual/'
    title: GNU Stow Manual
    type: official
  - url: null
    title: stow-doctor.sh implementation
    type: experience
---

making the repo the source of truth. However, apps like `gh` and
Karabiner-Elements silently overwrite these symlinks with regular files during
updates, breaking the SoT model without any warning.

## The Problem

When an app updates, it often:

1. Deletes the existing file (which is a symlink)
2. Writes a new regular file in its place
3. The dotfiles repo no longer controls that config

This is invisible — the config file still exists and works, but edits in the
repo no longer propagate to the system.

## Detection Pattern

Check each file that stow should manage:

```bash
# Is it a symlink?
if [[ -L "$target" ]]; then
    # Does it point back to the stow package?
    link_target="$(readlink "$target")"
    if [[ "$link_target" == *"dotfiles/$pkg/"* ]]; then
        # Healthy: symlink intact
    fi
elif [[ -e "$target" ]]; then
    # Overwritten: regular file replaced symlink
else
    # Missing: file doesn't exist at target
fi
```

## Repair Pattern

GNU Stow's `--adopt` flag handles the repair:

```bash
stow --adopt -R -t "$HOME" -d "$STOW_DIR" "$package"
```

This does two things:

1. **Adopt:** Moves the system file into the repo (overwriting the repo version)
2. **Restow (`-R`):** Re-creates the symlink from system to repo

After repair, always check `git diff` — the adopted file may differ from the
repo version. Either commit the new version or `git checkout` to restore the
repo version (symlink stays).

## `.stow-local-ignore` Handling

Stow packages may contain non-config files (docs, scripts). The
`.stow-local-ignore` file lists Perl regex patterns for files that stow should
skip. When checking symlink health, these files must also be excluded from the
check.

## Key Points

- Apps silently overwrite symlinks on update — no warning
- Detection: check `[[ -L "$file" ]]` and verify symlink target
- Repair: `stow --adopt -R` then review `git diff`
- Always exclude `.stow-local-ignore` patterns from health checks
- Run checks after `brew upgrade`, app updates, or macOS updates

## Example

```bash
# stow-doctor.sh output showing the problem:
# gh
#   overwritten  .config/gh/config.yml
#   overwritten  .config/gh/hosts.yml
# karabiner
#   overwritten  .config/karabiner/karabiner.json
```
