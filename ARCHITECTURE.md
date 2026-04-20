# Tav — Architecture

> Auto-referenced by Claude when exploring the codebase.
> For orientation and commands, see CLAUDE.md.

## Data Structure

`data/` contains flat JSON files — the app's knowledge base, scraped from bg3.wiki.

| File | Contents |
|------|----------|
| `builds.json` | Build templates (curated + scraped) |
| `community_builds.json` | 8 AlcastHQ builds, Community tier |
| `companions.json` | Companion data |
| `feats.json` | Feat prerequisites, effects, build affinity |
| `locations.json` | Act, area, access instructions |
| `milestones.json` | Exists but nothing reads it yet — data without behavior |
| `gear/act1.json` | Act 1 gear (name, stats, slot, location, build tags) |
| `gear/act2.json` | Act 2 gear |
| `gear/act3.json` | Act 3 gear |
| `gear/unknown.json` | Gear with unresolved act placement |

**Data is static JSON, not live fetches.** The app works offline once data is built. Update by re-running the scraper when patches drop.

**Primary source: bg3.wiki** — Community-maintained, comprehensive, accurate.

The scraper pulls structured data into JSON:
- Gear: name, stats, slot, act available, location, build affinity tags
- Classes: features per level, subclass options, multiclass requirements
- Feats: prerequisites, effects, which builds want them
- Locations: act, area, how to access

## Directory Layout

```
Tav/
├── data/                  # Static JSON knowledge base
│   ├── builds.json
│   ├── community_builds.json
│   ├── companions.json
│   ├── feats.json
│   ├── locations.json
│   ├── milestones.json
│   └── gear/
│       ├── act1.json
│       ├── act2.json
│       ├── act3.json
│       └── unknown.json
├── scraper/               # wiki-scraper.js (cheerio + fetch)
├── src/                   # Web UI (vanilla HTML/JS/CSS)
├── legacy/                # Archived autopilot code
├── Mods/                  # BG3SE mod artifacts (disabled)
├── tavsync_console.lua    # Primary active Lua artifact (478 lines)
├── tav_hotkey.lua
├── tav_server.lua
└── index.html
```

## Tech Stack

- **Vanilla HTML/JS/CSS** — No framework, fast and simple
- **JSON data files** — Static, scraped from bg3.wiki
- **Node.js** for the scraper (cheerio + fetch for wiki parsing)
- **Served locally** via `npm run dev` (port 3456)
- **GitHub Pages** auto-deploys from main: https://stormgraser-ux.github.io/Tav/

## Web UI Tabs

**Four tabs: Gear / Party / Build / Search.**

1. **Gear Finder** — Input: class tags + act. Output: BIS gear per slot available right now, where to find it. Pure JSON query, no LLM, fast.

2. **Party Advisor** — Input: 3 party members + act. Output: what role is missing, what class/subclass fills it best. Claude does gap analysis against party comp and act context.

3. **Build Planner** — Combines Character Creator, Build Planner, Wishlist, Feat Advisor, Act Checklist, and Level Tracker. Input: class + subclass + current gear + act. Output: 1-12 level path that plays to your gear situation. Claude reasons against build templates + gear data together. Respec-friendly — assumes you can start fresh at any point.

4. **Search** — Cross-data search across gear, feats, builds, and locations.

Build templates (from gamestegy.com or curated) serve as a library Claude remixes, not prescriptive paths. "Your gear leans cold damage — here's how to bend the Draconic Sorcerer template toward that."

**Design vibe:** Dark fantasy. Parchment/leather textures. Think character sheet, not spreadsheet.

## BG3SE Console Bridge

**Status:** The `.pak` mod is DISABLED for crossplay compatibility. The active workflow uses console paste.

**Active method:** Paste `load(Ext.IO.LoadFile("tavsync.lua"))()` into the BG3SE F11 console to load TavSync. Then use `!sync` in the BG3SE console to trigger a party sync. The active script is `tavsync_console.lua` (478 lines, project root).

When the sync server is up (`npm run sync` / auto-started by the `tav` launcher), you can also execute Lua directly in the BG3SE runtime via the Node bridge:

```bash
curl -s -X POST http://localhost:3457/exec -H 'Content-Type: application/json' -d '{"lua":"return 1+1"}'
```

Returns `{id, ok, result, output, error}`. The `output` array captures anything printed via `_P()`. Timeout is 10s.

**Endpoints:**
- `POST /exec` — execute Lua, get result
- `GET /bridge-status` — check if BG3 relay is alive (`connected: true` if a command succeeded in the last 60s)
- `GET /party-sync` — latest party sync data (written by TavSync after `!sync` or auto-save)

**Check bridge-status first** before sending commands — if BG3 isn't running or TavSync isn't loaded, exec will timeout after 10s.

## Product Philosophy

**This is not a min-max tool. It's a mid-playthrough companion.**

The player may be level 8, mid-Act 2, bored of their current build, and ready to respec via Withers. Respec is free and unrestricted — any class, any subclass, back to level 1. This means 1-12 build templates are always valid no matter where the player is.

The goal is situational advice: given *your* party, *your* act, *your* current gear — what's the smart move? Not "here's the S-tier meta." More like "here's what plays well with what you already have and what your party is missing."
