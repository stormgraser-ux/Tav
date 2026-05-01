# Tav

BG3 build advisor, gear finder, and party strategist. Wiki-scraped data. Vanilla HTML/JS/CSS + static JSON + Node.js scraper.

**Live:** https://stormgraser-ux.github.io/Tav/

## Commands

| Action | Command |
|--------|---------|
| Dev server | `npm run dev` (port 3456) |
| Rebuild data | `npm run scrape` |
| BG3SE bridge | `npm run sync` (port 3457) |

## Domain

Build advice, gear finder (BIS per slot/act), level-up planning, party composition, quest/location guidance. NOT a walkthrough, modding tool, or tabletop D&D reference — BG3 deviates in important ways.

## Key Patterns

- **Fun > meta.** Flag trap choices, never lecture.
- **Spoiler awareness.** Default to user's current act. Don't reveal later-act gear unless asked.
- **Data accuracy is everything.** Trust the wiki. If unsure, say so.
- **`milestones.json` has no consumers** — data without behavior. Check before assuming it works.
- **Scraper must be idempotent.** Re-run = fresh data, no duplicates.
