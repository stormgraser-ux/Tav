# Tav — Handoff

## Current Status
Session 11 complete. BG3SE sync pipeline built + Gear Wishlist feature shipped.

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
15. ✅ **Phase 11** — BG3SE Party Sync:
    - TavSync mod built: `Mods/TavSync/` with BootstrapServer.lua + BootstrapClient.lua
    - Console paste fallback: `memory/bg3se/party_dump.lua`
    - Gear sync confirmed working — 4 party members, real item names from live game
    - Class detection added: `entity.Classes.Classes[1].ClassUUID` → `Ext.StaticData.Get` → class name
    - `applyGameSync()` now sets `.party-class` select + triggers subclass/build population
    - Hotkey changed F8 → **F6** (F8 is BG3 Quickload — caused accidental save rollback)
    - `party_sync.json` path: `%LOCALAPPDATA%\Larian Studios\Baldur's Gate 3\Script Extender\`

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

### Step 3: Test F6 hotkey (requires restart with mod changes)
1. Restart BG3 fully (not just reload save)
2. Confirm `[TavSync] Client loaded` in console
3. Press F6 in-game → `[TavSync] F6 pressed...` should appear
4. Hit "Sync from Game" → full party with classes

## Known Issues / Pending
- **Weapon slots** — `Osi.GetEquippedItem` returns nil for all weapon slot names even when weapons are visually equipped. Root cause unknown (weapon-set system?). Low priority — armor/accessory sync is the core value.
- **Mod load verification** — Haven't confirmed TavSync loads as an unpackaged mod without BG3 Mod Manager. Need to test on next session startup.

## Memory
- `memory/MEMORY.md` — user preference: use WebSearch for BG3 content gaps, never punt to wiki
- `memory/insights/2026-02-22.md` — BG3SE API gotchas: GetClassName chain, weapon nil, KeyInput doesn't suppress BG3 defaults, F8 conflict, restart required for Lua changes

## Verify Before Playing

### ✅ HM build IDs — already confirmed
All 33 IDs in `HM_SAFE_BUILDS` match exactly what's in `builds.json`. No action needed.

### 🔲 valour-bard HM classification
Currently excluded from HM_SAFE_BUILDS. Valour Bard gets medium armor + shield. Consider adding `'valour-bard'` to the set.

## Web UI
Serve from Tav root: `npx serve .`
Open: `http://localhost:PORT`

## Sync Server
Run: `npm run sync` (from Tav root)
Listens on port 3457. Reads `party_sync.json` from BG3SE Script Extender directory.
