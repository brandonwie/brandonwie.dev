# brandonwie.dev - Todos

## Context for Next Session

**Project Status:** Core build complete, ready for deployment.

**Last Session (2026-01-26):** Built entire terminal blog from scratch:

- SvelteKit + Tailwind + mdsvex
- Interactive CLI with Claude Code theme
- Fuzzy finder, all commands working
- Build verified: `npm run build` succeeds
- 3B integration complete

**What's Blocking:** Nothing - just needs deployment.

---

## Immediate Next (Deploy to Production)

### 1. Create GitHub Repository

```bash
cd ~/dev/personal/brandonwie.dev
gh repo create brandonwie/brandonwie.dev --public --source=. --push
```

### 2. Connect to Cloudflare Pages

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → Pages
2. Create new project → Connect to Git
3. Select `brandonwie/brandonwie.dev`
4. Build settings:
   - Build command: `npm run build`
   - Build output directory: `build`
   - Root directory: `/`
5. Deploy

### 3. Set Custom Domain

1. In Cloudflare Pages project → Custom domains
2. Add `brandonwie.dev`
3. DNS should auto-configure (domain already in Cloudflare)
4. Verify HTTPS works

### 4. Add Favicon

- [ ] Create favicon.ico (terminal/code themed)
- [ ] Place in `static/favicon.ico`
- [ ] Commit and push (auto-deploys)

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
- [x] Neon purple BRANDON ASCII art
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
```
