---
title: macOS Keychain Multi-Account Behavior
description: >-
  macOS Keychain allows multiple entries with the same service name but
  different
date: 2026-02-04T00:00:00.000Z
updated: 2026-02-04T00:00:00.000Z
tags:
  - general
  - macos
  - keychain
  - security
  - multi-account
category: general
draft: false
lang: en
references:
  - url: 'https://ss64.com/mac/security.html'
    title: macOS security command reference
    type: official
  - url: 'https://developer.apple.com/documentation/security/keychain_services'
    title: Apple Keychain Services Documentation
    type: official
  - url: >-
      https://support.apple.com/guide/keychain-access/what-is-keychain-access-kyca1083/mac
    title: Apple Keychain Access Guide
    type: official
source_content_hash: e70627091aab9490cdf8becca0023cfee4096c8545b78e4fcab6d6d248509ce9
---

`acct` (account) attributes. This causes subtle bugs when applications assume
one entry per service.

---

## The Problem

When debugging why Claude Code's HUD plugin showed the wrong account's usage,
the root cause traced back to macOS Keychain behavior: multiple entries existed
for the same service name with different account attributes. The
`security find-generic-password` command silently returns the first match with
no warning about duplicates, causing applications to read credentials from the
wrong entry unpredictably.

---

## Difficulties Encountered

- **No error on duplicate reads:** `security find-generic-password` succeeds
  even when duplicates exist, returning whichever entry it finds first. No
  warning, no error code -- just silently wrong data.
- **`delete-generic-password` only removes one:** Each call deletes a single
  entry, so you must loop until it errors to clean up all duplicates. This is
  not documented clearly.
- **Keychain Access GUI hides the problem:** The Keychain Access app shows
  entries but does not highlight duplicates or make the account/service
  relationship obvious at a glance.
- **Token sync scripts made things worse:** Attempted to "fix" the issue by
  syncing tokens between entries, which overwrote valid auto-refreshed tokens
  with stale ones. The real fix was to stop syncing entirely.

---

## Key Points

- `security find-generic-password -s "ServiceName"` returns the **first match**
  — behavior is unpredictable when duplicates exist
- Applications may create entries with different `acct` values for the same `-s`
  service name
- `security delete-generic-password -s "ServiceName"` only deletes the **first
  match** — must run repeatedly to remove all duplicates
- Keychain entries are system-wide — `HOME` directory changes don't affect which
  entries are visible

## Detecting Duplicates

```bash
# List all entries for a service
security dump-keychain 2>/dev/null | \
  grep -E "(svce.*ServiceName|acct)" | head -20

# Count duplicates (any count > 1 is a problem)
security dump-keychain 2>/dev/null | \
  grep "svce.*ServiceName" | sort | uniq -c
```

## Cleaning Up Duplicates

```bash
# Delete all instances (run until error — each call removes one)
while security delete-generic-password -s "ServiceName" \
  >/dev/null 2>&1; do :; done
```

## Application Pattern: Suffixed Service Names

Some applications (e.g., Claude Code) create separate keychain entries per
installation using a suffixed service name:

```text
ServiceName              ← base entry
ServiceName-7195fd18     ← installation A
ServiceName-0e3ff1b1     ← installation B
```

The suffix is typically a hash of the config/install path. This allows multiple
instances to coexist without collisions, but tools that read from the base entry
will get the wrong credentials.

## Lesson Learned

Never write sync scripts that copy between keychain entries. If an application
manages its own entries natively (auto-creates and auto-refreshes), manual
syncing will overwrite correct values with stale or wrong-account data.

---

## When to Use

- Debugging authentication failures in macOS applications that use Keychain for
  credential storage
- Running multiple instances or accounts of the same application (e.g.,
  personal + work profiles)
- Investigating why an app reads stale or wrong credentials despite a successful
  login
- Cleaning up Keychain after uninstalling/reinstalling applications

## When NOT to Use

- Linux or Windows environments: Keychain is macOS-specific. Equivalent concepts
  exist (e.g., `libsecret` on Linux, Credential Manager on Windows) but the
  commands and behavior differ entirely.
- When the application provides its own credential management UI: use the app's
  built-in tools rather than manipulating Keychain directly.
- For iCloud Keychain sync issues: this knowledge covers local Keychain
  behavior, not iCloud sync problems.
