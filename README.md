# brandonwie.dev

Personal blog built with Next.js (App Router static export), featuring a
Cmd/Ctrl+K command palette.

## Features

- Command palette (Cmd/Ctrl+K, with Cmd/Ctrl+P alias) for navigation and actions
- Fuzzy post search (Fuse.js), available from the palette
- Bilingual support (English/Korean)
- RSS feeds per language
- Static site generation (SSG)

## Tech Stack

| Component | Choice                          |
| --------- | ------------------------------- |
| Framework | Next.js 16 (`output: 'export'`) |
| Styling   | Tailwind CSS v4                 |
| i18n      | Paraglide-JS                    |
| Markdown  | remark/rehype pipeline + Shiki  |
| Search    | Fuse.js (palette), Pagefind     |
| Hosting   | Cloudflare Pages (`next/build`) |

## Development

This project uses [pnpm](https://pnpm.io/) as its package manager.
The exact version is pinned via `"packageManager"` in `package.json`
(Node 16.10+ picks it up automatically through corepack).

```bash
# Install dependencies
pnpm install

# Start the Next dev server (http://localhost:5173)
pnpm dev

# Build for production (next/build, then the Pagefind index)
pnpm build

# Serve the production build (http://localhost:4173)
pnpm preview
```

## Content Management

### Syncing Posts from 3B

English posts are synced from the 3B knowledge base:

```bash
pnpm sync
```

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

| Route              | Description                                           |
| ------------------ | ----------------------------------------------------- |
| `/`                | English home                                          |
| `/posts`           | English posts list                                    |
| `/posts/{slug}`    | English post                                          |
| `/ko`              | Korean home                                           |
| `/ko/posts`        | Korean posts list                                     |
| `/ko/posts/{slug}` | Korean post (falls back to English if not translated) |
| `/rss.xml`         | English RSS feed                                      |
| `/ko/rss.xml`      | Korean RSS feed                                       |

## Project Structure

```text
next/                # Next.js app (builds to next/build)
├── app/             # Routes: (en)/ and (ko)/ko/
└── src/             # Components, markdown pipeline, palette, SEO
src/
├── content/posts/
│   ├── en/          # English posts
│   └── ko/          # Korean translations
├── app.css          # Design tokens (imported by next/app/globals.css)
└── lib/             # Shared data, SEO helpers, remark TOC plugin used by next/
public/              # Static assets (next/public entries link here)
messages/
├── en.json          # English UI strings
└── ko.json          # Korean UI strings
scripts/
├── sync-from-3b.ts  # Content sync script
├── translation-status.ts
└── translation-create.ts
```

## License

MIT
