# brandonwie.dev - Todos

## Context for Next Session

**Project Status:** Live in production at [brandonwie.dev](https://brandonwie.dev)

**Last Session (2026-01-26):**

- Deployed to Cloudflare Pages
- Custom domain configured and working
- GitHub repo: [brandonwie/brandonwie.dev](https://github.com/brandonwie/brandonwie.dev)
- Added terminal-themed favicon (`>_`)
- Fixed fuzzy finder focus management
- Block cursor for terminal input (tracks actual position)
- Backspace navigation on post pages
- Clean slate terminal on return from posts
- Improved fuzzy finder selection visibility
- BRANDON ASCII art uses Claude Code orange

**What's Next:** Sync real content from 3B, verify all features in production.

---

## Immediate Next

### ~~1. Add Favicon~~ ✓

- [x] Created SVG favicon with `>_` prompt
- [x] Placed in `static/favicon.svg`
- [x] Committed and pushed (auto-deploying)

---

## After Deployment

### Sync Real Content from 3B

```bash
# Review what will sync
ls ~/dev/personal/3b/knowledge/

# Run sync script
npm run sync

# Check results
ls src/content/posts/

# Commit and push
git add src/content/posts/
git commit -m "content: sync posts from 3B"
git push
```

**Note:** Sync script filters for:

- `status: completed` only
- Excludes `moba/` category (company-specific)

### Verify Production

- [ ] Home page loads with terminal UI
- [ ] Commands work (ls, cd, cat, whoami, help)
- [ ] Ctrl+P opens fuzzy finder
- [ ] /posts/[slug] pages render correctly
- [ ] RSS feed at /rss.xml
- [ ] Sitemap at /sitemap.xml
- [ ] Mobile responsive

---

## Backlog (Future Enhancements)

| Priority | Task | Notes |
| -------- | ---- | ----- |
| Medium | Newsletter signup | ConvertKit or Buttondown |
| Medium | Comments | giscus (GitHub Discussions) |
| Low | Static search | Pagefind integration |
| Low | Analytics | Plausible or Umami (privacy-focused) |
| Low | Auto-sync | GitHub Action on 3B push |
| Low | Self-host | Migrate to k3s cluster |

---

## Completed

- [x] **Deployed to Cloudflare Pages** (2026-01-26)
- [x] **Custom domain configured** - brandonwie.dev
- [x] **GitHub repo created** - brandonwie/brandonwie.dev
- [x] **Favicon added** - SVG with `>_` terminal prompt
- [x] **Fuzzy finder focus fix** - proper focus management, ESC works, refocus on close
- [x] **Block cursor** - terminal-style cursor at actual typing position
- [x] **Backspace navigation** - press Backspace on post page to return
- [x] **Clean slate terminal** - fresh welcome on return from posts
- [x] **Fuzzy finder UX** - improved selection visibility with orange border
- [x] **BRANDON ASCII** - changed from purple to Claude Code orange
- [x] SvelteKit project setup with adapter-static
- [x] Tailwind CSS with Claude Code terminal theme
- [x] mdsvex for markdown with Shiki syntax highlighting
- [x] JetBrains Mono font
- [x] Terminal stores (history, cwd, output buffer)
- [x] Virtual filesystem abstraction
- [x] Command system with registry
- [x] Commands: ls, ll, cd, pwd, cat, read, grep, search, find
- [x] Commands: whoami, about, help, man, clear, history, open, echo
- [x] Tab autocomplete for commands
- [x] Fuzzy finder with Fuse.js (Ctrl+P/K)
- [x] Post routes (/posts, /posts/[slug])
- [x] SEO meta tags (Open Graph, Twitter)
- [x] RSS feed (/rss.xml)
- [x] Sitemap (/sitemap.xml)
- [x] Content sync script from 3B
- [x] Path aliases ($lib, $components, $stores, $commands, $content)
- [x] BRANDON ASCII art (Claude Code orange)
- [x] Production build verified
- [x] 3B integration (symlinks, PROJECT-CONFIG, CLAUDE.md)

---

## Technical Reference

### Commands

```bash
npm run dev      # Dev server at localhost:5173
npm run build    # Production build to build/
npm run preview  # Preview production build
npm run sync     # Sync content from 3B
```

### Key Files

| File | Purpose |
| ---- | ------- |
| `src/routes/+page.svelte` | Main terminal page |
| `src/lib/components/terminal/` | Terminal UI components |
| `src/lib/commands/` | Command implementations |
| `src/lib/stores/` | Svelte stores |
| `src/content/posts/` | Markdown posts |
| `scripts/sync-from-3b.ts` | Content sync script |

### Commits

```text
8811ecd feat: initialize SvelteKit project with Deno and Tailwind
8aeb926 feat: add terminal stores and virtual filesystem
e57c7b4 feat: implement terminal commands
7c683ab feat: add terminal UI components and main page
4ea2f07 feat: add content routes and SEO features
d565f6e fix: resolve build issues and add enhancements
2edb122 chore: add 3B integration
45fe29a docs: update todos with deployment instructions
7730e46 feat: add terminal-themed favicon
b6ba98f fix: improve fuzzy finder focus management
```
