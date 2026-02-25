# Tav — Handoff

## Current Status
Session 13 complete. Weapon slot sync fixed + TavSync .pak mod rebuilt and confirmed working.

### F6 Hotkey Sync (current workflow)
TavSync .pak mod auto-loads on game start. Press F6 in-game → dumps party to `party_sync.json`.
Console confirms: `[TavSync] Server loaded — F6 to sync`

**Fallback:** Paste `party_dump.lua` into BG3SE console (F11) for one-shot dump without mod.

| File | Purpose |
|------|---------|
| `Mods/TavSync/` | Source files for the .pak mod (versioned in project) |
| `memory/bg3se/party_dump.lua` | Console paste fallback (same logic as mod) |
| `00_INBOX/build_tavsync.bat` | Rebuilds .pak via Divine CLI |
| `00_INBOX/lslib-tools/` | Divine.exe + LSLib for pak creation |

### Pak Build Process
1. Edit source in `Mods/TavSync/ScriptExtender/Lua/`
2. Run `build_tavsync.bat` (close BG3 first — locks .pak)
3. Restart BG3 to load changes

### Recent Additions (Session 13)
- **Weapon slots FIXED**: `Osi.GetEquippedItem` returns nil for weapons — BG3 stores them in `InventoryContainer` at fixed keys (3=MeleeMainHand, 4=MeleeOffHand, 5=RangedMainHand, 6=RangedOffHand)
- TavSync .pak rebuilt with correct `Mods/TavSync/` path prefix (Divine CLI)
- Mod registered in modsettings.lsx, loads automatically on game start
- ScriptExtenderSettings.json: added `DeveloperMode: true`

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
12. ✅ **Phase 8** — Party Advisor overhaul:
13. ✅ **Phase 9** — Five QoL features:
    - Build-specific dropdown per party slot
    - Save Party → persisted in localStorage
    - Party banner in Build Planner — clickable chips
    - `rolesForBuild()` subclass-first logic
    - Suggestion sort: critical gaps first, per-role cap, role chip colors + legend
    - Global Search (5th tab): `/` shortcut, searches name + effects across all 3 acts
    - Feat Advisor: top picks per feat level (4/8/12) with frequency from matching builds
    - Level Tracker: 12 pill buttons, current level persists to localStorage
    - Act Transition Checklist: color-coded, checkboxes persist per act
    - Concentration Conflict Warning: scans build spells, Bless tip
14. ✅ **Phase 10** — Gear Wishlist:
    - Heart button on gear cards (♡/♥), disabled without active profile
    - Wishlist panel in Build Planner: collapsible, grouped by act
    - Acquired-from-wishlist sync (check turns gold, stays on list)
    - Per-profile localStorage (`tav_wishlist_{buildId}`)
    - Remove (×) syncs back to Gear Finder heart
15. ✅ **Phase 11** — BG3SE Party Sync + Weapon Fix:
    - TavSync mod built: `Mods/TavSync/` with BootstrapServer.lua + BootstrapClient.lua
    - Console paste fallback: `memory/bg3se/party_dump.lua`
    - Gear sync confirmed working — 4 party members, real item names from live game
    - Class detection added: `entity.Classes.Classes[1].ClassUUID` → `Ext.StaticData.Get` → class name
    - `applyGameSync()` now sets `.party-class` select + triggers subclass/build population
    - Hotkey changed F8 → **F6** (F8 is BG3 Quickload — caused accidental save rollback)
    - `party_sync.json` path: `%LOCALAPPDATA%\Larian Studios\Baldur's Gate 3\Script Extender\`
    - **Weapon slots FIXED**: `Osi.GetEquippedItem` returns nil for weapons — BG3 stores them in `InventoryContainer` at fixed keys (3=MeleeMainHand, 4=MeleeOffHand, 5=RangedMainHand, 6=RangedOffHand). Confirmed correct for all 4 party members.

## Data State
- `data/gear/act1.json` — 203 items, tagged
- `data/gear/act2.json` — 140 items, tagged
- `data/gear/act3.json` — 179 items, tagged
- `data/builds.json` — 68 gamestegy builds, tiers S+ through C, with gear_recs
- `data/community_builds.json` — 8 AlcastHQ builds, tier Community
- 276 total tagged items

## Next Session — Testing BG3SE Sync

### Step 1: Verify mod is loading (check BG3SE console on startup)
Look for: `[TavSync] Server loaded — F6 to sync` and `[TavSync] Client loaded — press F6 to sync party gear to Tav`
If NOT visible → mod isn't loading unpackaged. Fallback: use BG3 Mod Manager (free).

### Step 2: Test class sync via console paste (no restart needed)
1. Open BG3SE console (F11) while in-game
2. Paste contents of `memory/bg3se/party_dump.lua`
3. Expected output: `[1] Throkk (Bard) — 4 slots`, `[4] Karlach (Barbarian) — 2 slots`
4. Hit "Sync from Game" in Tav Party tab → class dropdowns should auto-fill
5. If class shows `(?)` → StaticData lookup failed for that UUID, investigate

### Step 3: F6 hotkey — ✅ CONFIRMED WORKING
F6 sync is functional. No further testing needed.

## Known Issues / Pending
- **Mod load verification** — Haven't confirmed TavSync loads as an unpackaged mod without BG3 Mod Manager. Need to test on next session startup.
- **TavSync .pak rebuild** — BootstrapServer.lua inside TavSync.pak still uses old GetEquippedItem for weapons (returns nil). Needs rebuild with the InventoryContainer fix from party_dump.lua.

## Memory
- `memory/MEMORY.md` — user preference: use WebSearch for BG3 content gaps, never punt to wiki
- `memory/insights/2026-02-22.md` — BG3SE API gotchas: GetClassName chain, weapon nil, KeyInput doesn't suppress BG3 defaults, F8 conflict, restart required for Lua changes

## Verify Before Playing

### ✅ HM build IDs — already confirmed
All 33 IDs in `HM_SAFE_BUILDS` match exactly what's in `builds.json`. No action needed.

### ✅ valour-bard HM classification
Already in `HM_SAFE_BUILDS`. Confirmed correct — medium armor + shield qualifies.

## Web UI
Serve from Tav root: `npx serve .`
Open: `http://localhost:PORT`

## Sync Server
Run: `npm run sync` (from Tav root)
Listens on port 3457. Reads `party_sync.json` from BG3SE Script Extender directory.
