---
title: Google Calendar Sync Strategies
description: Full sync and incremental sync look interchangeable until you realize absence from a response means two opposite things.
date: 2026-01-23T00:00:00.000Z
updated: 2026-08-02T00:00:00.000Z
tags:
  - backend
  - google-api
  - sync
  - calendar
category: google
draft: false
lang: en
expanded: true
source_content_hash: aae51856c7826bd048c7f5a214fee986c1f5db5cc51add80d24e6e41e497a1f2
references:
  - url: "https://developers.google.com/workspace/calendar/api/guides/sync"
    title: Synchronize resources efficiently — Google Calendar
    type: official
  - url: "https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/list"
    title: CalendarList — list (Google Calendar API v3)
    type: official
---

Mirroring a user's Google calendars into your own database sounds like one
problem. It is actually two, and they disagree about the most important
question: what does it mean when a calendar you have stored does not appear in
the response?

## The rule everything else falls out of

Whatever the Google Calendar web UI shows, the integration shows — no more, no
less.

Users do not reason about your sync pipeline. They reason about the Google UI
they already have open in another tab. "Google shows it, your app doesn't" is
never received as a design difference; it is received as a bug. Once I accepted
that as the requirement, most of the decisions below stopped being judgement
calls.

## Two modes, one API

### Full sync — no token

This runs on the first sync, and again after a token dies.

```typescript
const params = {
  showDeleted: true, // deleted entries, so I can remove them locally too
  showHidden: true, // hidden calendars, including a hidden primary
  maxResults: 250, // the API ceiling; the default is only 100
};
```

A full sync returns every calendar on the account. The response is complete, so
it can be treated as authoritative: anything in my database that is *not* in the
response is genuinely gone.

### Incremental sync — with a stored token

```typescript
const params = {
  syncToken: storedToken,
  maxResults: 250,
};
```

This returns only what changed since the token was issued. Two consequences
follow, and the second one is the reason this post exists.

First, deletions still arrive. The `calendarList.list` reference is explicit
that when you pass a `syncToken`, "all entries deleted and hidden since the
previous list request will always be in the result set and it is not allowed to
set `showDeleted` neither `showHidden` to False." So in incremental mode you
simply do not send those flags — the behavior is already implied.

Second, absence means *unchanged*, not deleted. The sync guide phrases it from
the other side: "the result will always contain deleted entries, so that the
clients get the chance to remove them from storage." If a deletion would have
been reported explicitly, then a calendar missing from the response is a
calendar nobody touched.

That is the whole trap. A reconciliation routine that deletes local rows missing
from the response is correct against a full sync and catastrophic against an
incremental one — it will wipe every calendar the user did not happen to modify
that hour.

## API parameters

| Parameter     | Full sync | Incremental          | Note                                |
| ------------- | --------- | -------------------- | ----------------------------------- |
| `syncToken`   | omit      | required             | returned by the previous sync        |
| `showDeleted` | `true`    | do not send          | forced on when a token is present    |
| `showHidden`  | `true`    | do not send          | forced on when a token is present    |
| `maxResults`  | `250`     | `250`                | default is 100, 250 is the ceiling   |

For the events side, three parameters mattered more than I expected:

| Parameter               | Value   | Why                                            |
| ----------------------- | ------- | ---------------------------------------------- |
| `showHiddenInvitations` | `false` | declined invitations stay hidden, as in the UI  |
| `showDeleted`           | `true`  | deletions have to reach the local store         |
| `singleEvents`          | `false` | keep the recurrence structure instead of expanding it |

`showHiddenInvitations: false` is the sync-parity rule again: an event the user
declined is not on their Google calendar view, so it should not be on mine.

## Deciding what a response means

Rather than numbering the branches, it helped me to name them, because the names
carry the asymmetry that numbers hide.

| Behavior                | Trigger                       | Full sync              | Incremental          |
| ----------------------- | ----------------------------- | ---------------------- | -------------------- |
| Explicit deletion       | `deleted: true` in the payload | delete locally         | delete locally       |
| Present in the response | the entry is returned          | create or update       | create or update     |
| Absent from the response | the entry is not returned      | orphan → delete        | **skip** — unchanged |

Only the last row differs between the two modes, and that single cell is where
data loss lives.

## Protecting the primary calendar

Google guarantees every account exactly one primary calendar, and it cannot be
removed. That guarantee is useful precisely because it lets you treat its
violation as a signal.

If a payload claims the primary calendar was deleted, that is contradictory
data — the API is telling me something the API says is impossible. Acting on it
would destroy the user's main calendar, so the right move is to fail loudly
rather than proceed: raise, alert (Sentry, in my case), and roll the transaction
back so nothing partial lands.

The absent case is different and deserves a softer response. If the primary is
missing from a *full* sync response but exists in my database, orphan logic
would normally delete it. Here I skip the deletion, log at error level so the
gap is visible, and let the rest of the sync finish. A sync that repairs the
other 99% and leaves one anomaly for a human is better than a sync that aborts,
and far better than one that deletes.

## Two different meanings of "primary"

Google's primary calendar is the one bound to the account's email address, and
the user does not choose it. If your product *also* lets a user nominate a
default calendar — the one new items land in — you now have two unrelated
notions of "primary" sharing a word.

I keep them as separate fields: one flag mirrors what Google reported, the other
is user-settable and means nothing to Google. Conflating them is what makes the
delete path dangerous, because "the user's default was deleted" is a routine
event while "Google's primary was deleted" is an impossible one, and a single
field cannot tell them apart.

That separation also makes reassignment tractable. When the calendar a user
picked as their default disappears, I check first whether it was also the Google
primary (impossible — raise), then promote the Google primary in its place,
falling back to the stored copy if the response did not include it. If no
replacement exists at all, that is an error worth surfacing rather than leaving
the user with no default.

## When the token dies

```typescript
if (error.code === 410) {
  // Discard the stored sync token and re-run the same call with no token,
  // i.e. as a full sync.
}
```

The reference is direct about the contract: "If the `syncToken` expires, the
server will respond with a 410 GONE response code and the client should clear
its storage and perform a full synchronization without any `syncToken`."

The same guide names the causes, under "Full sync required by server":
"Sometimes sync tokens are invalidated by the server, for various reasons
including token expiration or changes in related ACLs." An ACL change is the one
worth internalizing — a permission edit on a calendar you are syncing can expire
your token with nothing else going wrong. So 410 is not an exceptional path
to be surprised by — it is a normal branch that has to exist from day one, and
the full sync it triggers is the one place your orphan detection is allowed to
run.

## Takeaways

Sync parity is the requirement, not a nice-to-have — match the Google UI and
most ambiguity resolves itself.

Full and incremental sync disagree about absence, and only about absence. Gate
your orphan detection on the mode.

Treat "the primary calendar was deleted" as corrupt input rather than an
instruction.

Handle 410 before you need to. It is the documented reset button, and code that
never expects one will silently stop syncing instead.
