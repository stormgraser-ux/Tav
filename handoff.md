# Tav — Handoff

## Current Status
Session 14 complete. Console bridge, game state snapshot, auto-sync on save all implemented. Needs .pak rebuild + test.

### TavSync Mod (current workflow)
TavSync .pak mod auto-loads on game start:
- **F6** — manual party sync to `party_sync.json`
- **Auto-sync** — triggers on every save (quicksave/autosave/manual)
- **Console relay** — polls `tav_cmd.json` every 500ms for remote Lua execution

Console confirms: `[TavSync] Server loaded — F6 to sync, auto-sync on save` + `[TavSync] Console relay active`

**Fallback:** Paste `party_dump.lua` into BG3SE console (F11) for one-shot dump without mod.

| File | Purpose |
|------|---------|
| `Mods/TavSync/` | Source files for the .pak mod (versioned in project) |
| `memory/bg3se/party_dump.lua` | Console paste fallback (same logic as mod) |
| `00_INBOX/build_tavsync.bat` | Rebuilds .pak via Divine CLI |
| `00_INBOX/lslib-tools/` | Divine.exe + LSLib for pak creation |

### Pak Build Process
1. Edit source in `Mods/TavSync/ScriptExtender/Lua/`
2. Copy to pakroot: `TavSync_pakroot/` in BG3 Mods dir (create if missing, copy from `Mods/TavSync/`)
3. Run `build_tavsync.bat` (close BG3 first — locks .pak)
4. Restart BG3 to load changes

### Console Bridge Architecture
```
Claude Code ←HTTP→ Node.js Bridge ←Files→ BG3SE TavSync Mod
  (curl)        localhost:3457        tav_cmd.json     (polls every 500ms)
                                      tav_result.json  (writes results back)
```
- `POST /exec` — send `{lua: "..."}`, get back `{id, ok, result, output, error}`
- `GET /bridge-status` — check if BG3 relay is responding (last 60s)

## What's Done
1. ✅ Scaffold — `data/`, `scraper/`, `src/`
2. ✅ `wiki-scraper.js` — Phase 1: bg3.wiki gear facts (522 items)
3. ✅ Web UI — `src/index.html` + `styles.css` + `app.js` (dark fantasy theme, four tabs)
4. ✅ `locations.json` expanded (60+ areas)
5. ✅ Weapons parser bug fixed, rescrape complete
6. ✅ **Phase 2** — 68 builds in `data/builds.json` with gear text per act
7. ✅ **Phase 3** — 269/522 gear items tagged with build IDs in `build_tags`
8. ✅ **Phase 4** — Party Advisor role gap analysis, HM Filter toggle, Act 1 Route
9. ✅ **Phase 5** — Character Creator tab: scraped char_create from all 68 gamestegy builds
10. ✅ **Phase 6** — 8 community builds (AlcastHQ). Community badge (muted purple). Warlock 'The Undead' removed, 'The Hexblade' added.
11. ✅ **Phase 7** — Character Creator improvements: blurb, cantrips/spells toggle, race reasons untruncated.
12. ✅ **Phase 8** — Party Advisor overhaul
13. ✅ **Phase 9** — QoL: build dropdowns, save party, global search, feat advisor, level tracker, act checklist, concentration warnings
14. ✅ **Phase 10** — Gear Wishlist: heart button, per-profile localStorage, acquired sync
15. ✅ **Phase 11** — BG3SE Party Sync + Weapon Fix: TavSync mod, F6 hotkey, gear/class detection
16. ✅ **Phase 12** — Console Bridge: `POST /exec` for remote Lua, bridge-status endpoint
17. ✅ **Phase 13** — Game State Snapshot:
    - Ability scores (STR/DEX/CON/INT/WIS/CHA) per party member via `Osi.GetAbility()`
    - XP per party member
    - Region → act auto-detection
    - Gold
    - Recruited companions (full team, not just active party)
    - Curated milestones from `DB_GlobalFlag` (18 Act 1 flags, speculative Act 2/3)
    - Supersedes logic (e.g., "Hag killed" suppresses "Hag dealt with")
    - Illithid powers
    - `gameStateBlock()` in app.js injects snapshot into all 3 copy prompts
    - Auto-sync on save (`Ext.Events.AfterSave`)
    - `data/milestones.json` — curated flag→label config
    - Sync version bumped to 4

## Data State
- `data/gear/act1.json` — 203 items, tagged
- `data/gear/act2.json` — 140 items, tagged
- `data/gear/act3.json` — 179 items, tagged
- `data/builds.json` — 68 gamestegy builds, tiers S+ through C, with gear_recs
- `data/community_builds.json` — 8 AlcastHQ builds, tier Community
- `data/milestones.json` — curated game progress flags → labels
- 276 total tagged items

## Next Session — Rebuild .pak and Test Game State

### Step 1: Rebuild TavSync .pak
BootstrapServer.lua updated with game state snapshot + auto-sync on save. Pakroot already staged.
1. Close BG3 (locks .pak)
2. Run `build_tavsync.bat` from `00_INBOX/`
3. Restart BG3 → verify console shows both startup messages

### Step 2: Test game state sync
1. `npm run sync` (auto-started by `tav` launcher)
2. Quicksave in-game → sync server should log update
3. Click "Sync from Game" in Tav web UI → should show region + gold in status message
4. Click any Copy button → prompt should include game state block

### Step 3: Validate Act 2/3 milestones
- Load an Act 3 save
- Check which milestone flags exist: `curl POST /exec` with flag scan
- Update `milestones.json` and `MILESTONES` table in BootstrapServer.lua with verified flag names

### Step 4: Shipping prep
- Consider: hosted website + downloadable mod approach
- What needs to change for public distribution

## Known Issues / Pending
- **TavSync .pak rebuild needed** — pakroot staged, rebuild when BG3 closes
- **Act 2/3 milestone flags unverified** — flag names in milestones.json are speculative, need validation from a save in those acts
- **Mod load verification** — Haven't confirmed TavSync loads as an unpackaged mod without BG3 Mod Manager

## Memory
- `memory/MEMORY.md` — user preference: use WebSearch for BG3 content gaps, never punt to wiki
- `memory/insights/2026-02-22.md` — BG3SE API gotchas: GetClassName chain, weapon nil, KeyInput doesn't suppress BG3 defaults, F8 conflict, restart required for Lua changes

## Web UI
Serve from Tav root: `npx serve .` or `npm run dev` (port 3456)

## Sync Server
Run: `npm run sync` (from Tav root)
Listens on port 3457. Auto-started by `tav` launcher.
