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
source_content_hash: 845bfd1e764f2e5451d3ad740717177f9dbd6e3c6615a334f512299ccd73ea6d
expanded: true
---

I manage my dotfiles with GNU Stow — it creates symlinks from system config paths (like `~/.config/gh/config.yml`) back to a dotfiles repo, making the repo the single source of truth. The problem: applications like `gh` and Karabiner-Elements silently overwrite these symlinks with regular files during updates, breaking the source-of-truth model without any warning.

## The Silent Breakage

When an app updates its configuration, it typically:

1. Deletes the existing file (which happens to be a symlink)
2. Writes a new regular file in its place
3. The dotfiles repo no longer controls that config

This is invisible in day-to-day use. The config file still exists and works perfectly. But edits in the dotfiles repo no longer propagate to the system, and you won't notice until you set up a new machine or try to sync configs. By then, the system version may have diverged significantly from the repo version.

## Detecting Broken Symlinks

The detection logic checks each file that Stow should manage and categorizes its state:

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

The key is the `-L` test (is it a symlink?) followed by verifying the symlink target points back to the dotfiles repo. A file that exists but isn't a symlink has been overwritten by an application update.

In practice, running this across all Stow packages produces output like:

```bash
# stow-doctor.sh output showing the problem:
# gh
#   overwritten  .config/gh/config.yml
#   overwritten  .config/gh/hosts.yml
# karabiner
#   overwritten  .config/karabiner/karabiner.json
```

## Repairing Broken Symlinks

GNU Stow's `--adopt` flag handles the repair:

```bash
stow --adopt -R -t "$HOME" -d "$STOW_DIR" "$package"
```

This does two things:

1. **Adopt:** Moves the system file into the repo (overwriting the repo version)
2. **Restow (`-R`):** Re-creates the symlink from the system path to the repo

After repair, always check `git diff` in the dotfiles repo. The adopted file may differ from what was in the repo — the app may have added new settings or changed values during its update. You can either commit the new version (accepting the app's changes) or `git checkout` to restore the repo version (the symlink stays either way).

## Handling `.stow-local-ignore`

Stow packages often contain non-config files (documentation, scripts, READMEs). The `.stow-local-ignore` file lists Perl regex patterns for files that Stow should skip during linking. When running health checks, you need to exclude these same patterns — otherwise your doctor script reports "missing" files that were intentionally excluded.

## When to Run Health Checks

Run the symlink health check:

- After `brew upgrade` (apps may rewrite configs)
- After macOS updates (system preferences can reset)
- After any app update that modifies its config files
- Periodically (weekly or monthly) as a safety net

## Key Points

- Apps silently overwrite symlinks on update — no warning is given
- Detection: check `[[ -L "$file" ]]` and verify the symlink target
- Repair: `stow --adopt -R` then review `git diff`
- Always exclude `.stow-local-ignore` patterns from health checks
- Run checks after `brew upgrade`, app updates, or macOS updates

## Takeaway

If you manage dotfiles with GNU Stow, applications will silently break your symlinks during updates. Build a health check script that verifies each expected symlink is intact and points to the right place. When symlinks are broken, `stow --adopt -R` repairs them. The workflow is: detect → adopt → review diff → commit or restore. Without periodic health checks, your dotfiles repo gradually becomes a fiction that doesn't match your actual system configuration.

## References

- [GNU Stow Manual](https://www.gnu.org/software/stow/manual/)
