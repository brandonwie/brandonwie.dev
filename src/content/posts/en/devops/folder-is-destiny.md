---
title: 'Folder Is Destiny: A Six-Layer Information Lifecycle'
description: >-
  3B lets folder placement decide retrieval, privacy, and staleness most of the
  time, then uses frontmatter overrides for the cases where physical location
  and semantic state disagree.
date: 2026-06-15T00:00:00.000Z
updated: '2026-08-02'
expanded: true
tags:
  - 3b
  - devops
  - architecture
category: devops
draft: false
lang: en
references:
  - url: 'https://rubyonrails.org/doctrine'
    title: 'The Rails Doctrine — Convention over Configuration'
    type: authoritative
  - url: 'https://gohugo.io/content-management/front-matter/'
    title: Hugo front matter reference
    type: official
  - url: 'https://www.rfc-editor.org/rfc/rfc9309.html'
    title: 'RFC 9309 — Robots Exclusion Protocol'
    type: official
  - url: >-
      https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag
    title: Google Search Central — robots meta tag specifications
    type: official
source_content_hash: 6c663c440be2b894eb7ef92949498f6ef46196b8ff3b3538cb1fee0726efd71b
---

## Folders are policy

In most repositories, folders are mostly navigation. `docs/` contains docs,
`src/` contains code, and `tmp/` contains things everyone hopes to delete later.
Tools may care about those folders, but the policy often lives elsewhere: a
script has one allow-list, a crawler has another, a publish step has a third,
and a human remembers the exceptions.

3B treats folder placement as policy.

A file's path tells the system what kind of information it probably is, whether
a machine may index it, and how stale it is allowed to become. That does not
mean the folder is always right. The information-layer rule is explicit that
95%+ of files inherit the folder default and the ambiguous remainder use
frontmatter overrides.

That is the balance: folder defaults for the common case, frontmatter for the
exception.

None of that is a new idea. Rails calls the same bargain convention over
configuration, and the Rails Doctrine is honest about where it runs out: "most
applications worth building have some elements that are unique in some way. It
may only be 5% or 1%, but it's there. The hard part is knowing when to stray
from convention." Folder-as-policy is that trade applied to notes instead of
classes, and it inherits the same hard part.

## The lifecycle path

The 3B architecture model summarizes the lifecycle as:

```text
tmp -> journal -> knowledge -> ADR -> blog
```

`subsystems.md` expands that into operational surfaces: scratch files, journals,
active task folders, distilled knowledge and guides, architecture and decision
records, and finally public blog sync. The exact list is less important than the
movement. Content starts raw or working, gets refined into durable knowledge,
becomes a decision when it needs architectural authority, and only later becomes
publishable writing.

That lifecycle is why folder policy matters. A note in `tmp/` should not be
treated like a completed knowledge entry. A journal entry should not be treated
like public documentation. A decision record should not decay like an ordinary
working note. A blog-ready article needs different gates than an internal
scratch file.

The folder gives every tool a first answer.

## `source_type`: what layer did this come from?

The `source_type` field names the layer-of-origin: raw, working, distilled,
decision, rule, task, friction, memory, with `distilled-pending` for ambiguous
in-flight cases.

Most files do not need to write that field because the folder already implies
it. `tmp/**` defaults to raw. `projects/*/actives/**` defaults to working.
`knowledge/**` and `guides/**` default to distilled. Decision folders default to
decision. Agent rules and skills default to rule. Buffers and friction logs
default to friction.

That convention lets retrieval tools reason about source quality without
reverse-engineering every path. A distilled note is a different kind of source
than a scratch file. A decision record has different authority than a task
draft. The path gives the default, and the default is enough most of the time.

The interesting case is the 5%.

Imagine an extracted snippet inside an active task folder. Physically, it lives
under `projects/*/actives/**`, so the folder default says working. But
semantically, it may already be distilled-pending: shaped enough to become
knowledge, not yet moved by `/archive-task`. That is when frontmatter earns its
place:

```yaml
source_type: distilled-pending
```

The override is not a second classification system. It is the exception
mechanism for the cases where folder and meaning temporarily diverge.

Static site generators landed on the same shape. In Hugo, a page's content type
is derived from the top-level section it sits in, and the front matter `type`
field exists to override "the value derived from the top-level section in which
the page resides" — that is the wording in Hugo's current front matter
reference. Same deal: the directory decides, and one field overrules it when the
directory is wrong.

## `privacy`: can a machine index this?

Privacy is an indexing question.

The `privacy:` field does not encrypt a file and does not decide whether a human
can read it. It tells graph builders, retrieval layers, embedding jobs, and
model-backed tools whether they are allowed to ingest the content.

The matrix is path-keyed. `personal/**`, `journals/**`, `tmp/**`,
`.agents/metrics/**`, and the work-scoped knowledge subtree
(`knowledge/{work}/**`, where `{work}` is the folder holding day-job notes) are
private by default. General `knowledge/**`, `guides/**`, and 3B decision records
are public by default, with per-entry overrides where the matrix allows them.

The important part is not the exact row list. The important part is that there
is one matrix.

`scripts/lib/privacy-matrix.js` reads the privacy matrix from
`information-layer.md` and exposes the lookup to consumers. Graphify privacy
gates, `.graphifyignore` generation, wrap freshness checks, and future vector
indexes are supposed to read the same source. The system does not want five
tools each carrying their own copy of "never upload journals."

The web solved a narrower version of this long ago, and its solution ships with
a warning. `robots.txt` rules are matched against the URL path, and RFC 9309
specifies that the most specific matching rule wins — the same precedence a
frontmatter override has over a folder default. But Google's robots meta tag
documentation names the failure mode: if a page is disallowed in `robots.txt`,
the crawler never fetches it, so any indexing rule written on that page "will
not be found and will therefore be ignored." The path rule silently swallows the
per-page rule.

3B does not hit that particular ordering bug, because one loader resolves the
path default and the file's own override together instead of two systems meeting
at runtime. That is the transferable part: layered policy only works when
something actually reads both layers.

That is how a private folder stays private when new tooling appears.

## `blog.publishable`: can a human publish this?

`privacy:` and `blog.publishable:` are deliberately separate.

Privacy answers: may a machine index or upload this content?

Blog publishability answers: is this content appropriate for public writing
after human review?

Those are not the same question. A file can be `privacy: private` and still
eventually be publishable after redaction, generalization, or manual review. A
file can be indexable inside 3B and still not ready for a public blog because it
lacks references, contains company examples, or is unfinished.

The blog-publishing rule has its own decision tree. Work-specific content is
excluded outright. Transferable concepts with work-shaped examples need
generalization. Experience-only notes may need outside references. Ready-to-sync
knowledge must pass publication gates, not just privacy gates.

This split prevents a common policy bug: treating "safe for retrieval" as "safe
for public publication." 3B keeps those axes orthogonal.

## `tier`: how stale is this allowed to get?

The tier model adds a staleness axis: standard, nearline, coldline, archive.

It does not apply everywhere. The tier rule defines eligible surfaces and hard
exclusions. ADRs, journals, universal-tier rules, templates, `.me.md`, and other
protected layers are not casually demoted by the same policy as ordinary
knowledge or skill artifacts.

This matters because staleness is layer-specific. A task note can go stale in
days. A reference may need annual verification. A decision record should remain
available as a historical authority even when the implementation changes. If
every file shared one staleness ladder, the ladder would be wrong for most of
them.

Again, folder placement supplies the default. Frontmatter supplies the explicit
state only where the tier model allows it.

## The 5% override

"Folder is destiny" is useful because it is mostly true. It would be dangerous
if it claimed to be always true.

The exceptions are where the design gets practical:

- A working task artifact can be semantically distilled-pending.
- A generally public knowledge folder can contain one entry that needs a private
  override.
- A private note can become publishable only after human review and
  generalization.
- A tier-eligible file can move down the staleness ladder while a hard-excluded
  decision stays authoritative history.

These cases are why the frontmatter fields exist. They do not replace folder
semantics. They refine them.

## Shared loaders beat copied allow-lists

The most important implementation detail in this post is not a field name. It is
the shared loader.

If every tool copied the privacy matrix, the repo would eventually have several
privacy policies. One would include `journals/**`. Another would forget
`.agents/metrics/**`. A third would treat the work-scoped subtree as ordinary
knowledge. The difference might not show up until a model-backed index uploaded
the wrong folder.

3B avoids that by making the rule body the source and the loader the access
path. The matrix lives in `information-layer.md`; `privacy-matrix.js` parses it;
tools consume the parsed result. The policy is text, but it is not inert text.
It is the shared input to the gates.

That is the deeper pattern: do not make every consumer know your policy. Make
every consumer read the same policy.

## Folder defaults, frontmatter exceptions

The folder tells the first story. `tmp/` is raw. `journals/` are private working
memory. `knowledge/` is distilled. Decisions are authoritative records. Blog
sync is terminal publication.

Frontmatter tells the exception story. This working file is distilled-pending.
This public-by-folder entry is private. This note is publishable only after
review. This artifact has moved down a tier.

The system works because it does not ask every file to carry every possible
piece of metadata. It gives most files a destiny by folder and lets the few
ambiguous files say why they are different.

That is enough structure for tools to behave consistently without turning every
note into a config file.
