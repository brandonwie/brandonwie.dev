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
  - url: "https://ss64.com/mac/security.html"
    title: macOS security command reference
    type: official
  - url: "https://developer.apple.com/documentation/security/keychain_services"
    title: Apple Keychain Services Documentation
    type: official
  - url: >-
      https://support.apple.com/guide/keychain-access/what-is-keychain-access-kyca1083/mac
    title: Apple Keychain Access Guide
    type: official
---

I spent hours debugging why a Claude Code HUD plugin was showing the wrong
account's API usage. The authentication flow was correct, the tokens were valid,
and the UI rendered fine. The problem was invisible -- buried inside macOS
Keychain.

Keychain quietly allows multiple entries with the same service name as long as
their `acct` (account) attribute differs. When an application reads credentials
using `security find-generic-password -s "ServiceName"`, it gets the first match
back. No warning, no error, just whichever entry Keychain feels like returning.
If you have two accounts registered under the same service name, your app reads
the wrong one about half the time.

## Why This Matters

Most macOS applications store credentials in Keychain. If you run multiple
accounts for the same service -- personal and work GitHub accounts, two AWS
profiles, or parallel installations of the same tool -- you are one duplicate
entry away from silent authentication failures. The worst part is that
everything appears to work. You get a valid token back. It just belongs to the
wrong account.

## The Difficulties I Ran Into

The debugging process was painful because every tool hid the real problem.

**No error on duplicate reads.** The `security find-generic-password` command
succeeds even when duplicates exist. It returns whichever entry it finds first.
No warning, no error code -- just silently wrong data.

**`delete-generic-password` only removes one entry.** Each call deletes a single
match, so you need to loop until it errors out to clean up all duplicates. Apple
does not document this clearly.

**Keychain Access GUI hides the problem.** The Keychain Access app shows entries
but does not highlight duplicates or make the account/service relationship
obvious at a glance. You have to manually inspect each entry to spot the issue.

**Token sync scripts made things worse.** My first instinct was to write a sync
script that copied tokens between Keychain entries. This overwrote valid
auto-refreshed tokens with stale ones. The real fix was to stop syncing
entirely and let each installation manage its own credentials.

## How Keychain Stores Entries

The key thing to understand is that Keychain uses the combination of service
name (`svce`) and account name (`acct`) as a composite key. Two entries can
share the same service name as long as their account attributes differ.

Here is what matters:

- `security find-generic-password -s "ServiceName"` returns the **first match**
  -- behavior is unpredictable when duplicates exist
- Applications may create entries with different `acct` values for the same `-s`
  service name
- `security delete-generic-password -s "ServiceName"` only deletes the **first
  match** -- you must run it repeatedly to remove all duplicates
- Keychain entries are system-wide -- changing your `HOME` directory does not
  affect which entries are visible

## Detecting Duplicates

Before fixing anything, confirm duplicates actually exist. Dump the keychain and
filter for your service name:

```bash
# List all entries for a service
security dump-keychain 2>/dev/null | \
  grep -E "(svce.*ServiceName|acct)" | head -20

# Count duplicates (any count > 1 is a problem)
security dump-keychain 2>/dev/null | \
  grep "svce.*ServiceName" | sort | uniq -c
```

If you see multiple entries with the same `svce` value but different `acct`
values, that is your problem.

## Cleaning Up Duplicates

The cleanup is a one-liner, but it needs to loop because each
`delete-generic-password` call only removes one entry:

```bash
# Delete all instances (run until error -- each call removes one)
while security delete-generic-password -s "ServiceName" \
  >/dev/null 2>&1; do :; done
```

After cleanup, let the application re-create its entry naturally. Do not
manually add entries back.

## The Suffixed Service Name Pattern

Some applications handle multi-instance scenarios by appending a unique suffix
to the service name. Claude Code does this:

```text
ServiceName              <- base entry
ServiceName-7195fd18     <- installation A
ServiceName-0e3ff1b1     <- installation B
```

The suffix is typically a hash of the config or install path. This allows
multiple installations to coexist without collisions. The catch is that tools
reading from the base entry (without a suffix) will get the wrong credentials.

## Why This Works

Understanding the composite key model (`svce` + `acct`) explains the entire
problem. Once you know that Keychain treats these as separate entries rather
than conflicting ones, the fix becomes obvious: remove the duplicates, stop
syncing between entries, and let each application manage its own credentials.

## Practical Takeaway

**Use this knowledge when:**

- Debugging authentication failures in macOS applications that use Keychain
- Running multiple instances or accounts of the same application (personal +
  work profiles)
- Investigating why an app reads stale or wrong credentials despite a successful
  login
- Cleaning up Keychain after uninstalling/reinstalling applications

**Avoid applying this when:**

- You are on Linux or Windows -- Keychain is macOS-specific. Equivalent concepts
  exist (`libsecret` on Linux, Credential Manager on Windows) but the commands
  and behavior differ entirely.
- The application provides its own credential management UI -- use the app's
  built-in tools instead.
- You are dealing with iCloud Keychain sync issues -- this covers local Keychain
  behavior only.

The biggest lesson: never write sync scripts that copy between Keychain entries.
If an application manages its own credentials natively -- auto-creates and
auto-refreshes them -- manual syncing will overwrite correct values with stale
or wrong-account data. Let the app do its job.
