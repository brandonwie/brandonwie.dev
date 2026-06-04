# brandonwie.dev

Personal blog built with SvelteKit, featuring a Cmd/Ctrl+K command palette.

## Features

- Interactive CLI experience (ls, cd, cat, grep, etc.)
- Fuzzy search with Ctrl+P/K
- Bilingual support (English/Korean)
- RSS feeds per language
- Static site generation (SSG)

## Tech Stack

| Component | Choice                     |
| --------- | -------------------------- |
| Framework | SvelteKit + adapter-static |
| Styling   | Tailwind CSS               |
| i18n      | Paraglide-JS               |
| Markdown  | mdsvex + Shiki             |
| Search    | Fuse.js                    |
| Hosting   | Cloudflare Pages           |

## Development

This project uses [pnpm](https://pnpm.io/) as its package manager.
The exact version is pinned via `"packageManager"` in `package.json`
(Node 16.10+ picks it up automatically through corepack).

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Build for production
pnpm build

# Preview production build
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
src/
├── content/posts/
│   ├── en/          # English posts
│   └── ko/          # Korean translations
├── lib/
│   ├── components/  # Svelte components
│   └── paraglide/   # Generated i18n runtime
├── routes/
│   ├── posts/       # English routes
│   └── ko/          # Korean routes
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
