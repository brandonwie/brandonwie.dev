# brandonwie.dev

A personal blog: text, code and diagrams, in English and Korean. Built with
Next.js (App Router, static export) and served by Cloudflare Pages.

## Features

- The home page is the whole post index: one search box (titles at once, full
  text through Pagefind), category tabs, tag filters, and the filter state in
  the address
- Light and dark themes from one token set; follows the system and has a switch
- Single-key shortcuts (`/` search, `j` `k` rows, `t` theme, `?` the full list)
- Post page with contents, reading progress, copy buttons, previous and next
- Every post also as Markdown at its address plus `.md`, and an `llms.txt` index
- English and Korean, an RSS feed per language, a multilingual sitemap
- No images: one share card (`public/og.png`) serves every page

## Tech Stack

| Component | Choice                                    |
| --------- | ----------------------------------------- |
| Framework | Next.js 16 (`output: 'export'`), React 19 |
| Styling   | Tailwind CSS v4, tokens in `src/app.css`  |
| Fonts     | Inter and JetBrains Mono, self-hosted     |
| i18n      | Paraglide-JS                              |
| Markdown  | remark/rehype pipeline, Shiki, Mermaid    |
| Search    | Pagefind                                  |
| Hosting   | Cloudflare Pages (`next/build`)           |

## Development

This project uses [pnpm](https://pnpm.io/) as its package manager. The exact
version is pinned via `"packageManager"` in `package.json` (corepack picks it
up).

```bash
# Install dependencies
pnpm install

# Start the Next dev server (http://localhost:5173)
pnpm dev

# Build for production: next/build, the Markdown files, then the Pagefind index
pnpm build

# Serve the production build (http://localhost:4173)
pnpm preview

# Token contrast check, Paraglide compile and type check
pnpm check
```

Full-text search needs the Pagefind index, so it works in `pnpm preview`, not in
`pnpm dev`.

## Content Management

### Syncing Posts from B3

English posts are synced from the B3 knowledge base:

```bash
pnpm sync        # copy new posts into src/content/posts
pnpm sync:check  # list expanded posts whose B3 source note changed since the sync
```

The sync is one-way: it reads the B3 checkout and never writes to it. This repo
holds the publish state. A post file means the note is published, and its
`source_content_hash` shows whether the source note changed. The sync refuses a
post path that is a symlink, or that resolves into the B3 checkout.

### Translation Workflow

```bash
# Check what needs translation
pnpm translation:status

# Create Korean translation template
pnpm translation:create -- --slug=<post-slug>

# Edit the generated file in src/content/posts/ko/
# Set draft: false when ready
```

See [docs/TRANSLATION.md](docs/TRANSLATION.md) for translation guidelines.

## URL Structure

| Route                 | Description                                           |
| --------------------- | ----------------------------------------------------- |
| `/`                   | English post index (`?q=`, `?category=`, `?tag=`)     |
| `/posts/{slug}`       | English post                                          |
| `/posts/{slug}.md`    | The same post as Markdown                             |
| `/ko`                 | Korean post index                                     |
| `/ko/posts/{slug}`    | Korean post (falls back to English if not translated) |
| `/ko/posts/{slug}.md` | The Korean post as Markdown                           |
| `/about`              | About, with the projects and contact sections         |
| `/study`, `/system`   | Study notes and the B3 system map                     |
| `/rss.xml`            | English RSS feed                                      |
| `/ko/rss.xml`         | Korean RSS feed                                       |
| `/llms.txt`           | Index of the Markdown files                           |

`public/_redirects` keeps the retired addresses working: `/posts`, `/tags`,
`/search`, `/projects` and `/contact`.

## Project Structure

```text
next/                # Next.js app (builds to next/build)
├── app/             # Routes: (en)/ and (ko)/ko/; styles/ holds page CSS
└── src/             # Components, content loading, markdown pipeline, shell, SEO
src/
├── content/posts/
│   ├── en/          # English posts
│   └── ko/          # Korean translations
├── app.css          # Design tokens and shared styles (see DESIGN.md)
└── lib/             # Shared data, site constants, remark TOC plugin
public/              # Static files (next/public entries link here)
messages/
├── en.json          # English UI strings
└── ko.json          # Korean UI strings
scripts/
├── sync-from-3b.ts      # Content sync
├── build-markdown.mjs   # Post .md files and llms.txt, run by `pnpm build`
├── check-contrast.mjs   # Token contrast gate, run by `pnpm check`
├── serve-build.mjs      # `pnpm preview`
├── translation-status.ts
└── translation-create.ts
```

## License

MIT
