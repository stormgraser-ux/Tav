# Tav Handoff

## Status: Working Well — F8 Hotkey Still Pending

Party sync, UI redesign, and multiclass tracking all working.
Console one-liner is the reliable daily workflow for now.

---

## What Got Done This Session

### UX Redesign (complete)
- 4-tab nav: Gear / Party / Build / Search
- Persistent party strip below nav: slot pills, global act selector (I/II/III), ↻ Sync button
- Single `state.act` replacing `gearAct`/`partyAct`/`buildAct`
- Build tab: side-by-side browse (left) + planner form (right)
- Progressive disclosure: optional Build fields behind `<details>`, Party notes collapsed
- Root `index.html` is the served file; `src/index.html` is the template

### Party Sync — Multiclass Level Tracking (complete)
- `party_dump.lua` (v3) now exports `subClass`, `classes[]` (with per-class levels), `totalLevel`
- `applyGameSync()` sets class + subclass (with fuzzy matching for name format differences)
- Split/notes field auto-populated with level breakdown on sync: `Wizard 3 / Barbarian 1`
- `partyMemberLabel()` includes split as parenthetical → appears in copied prompts
- `saveParty()` preserves `classes`/`totalLevel` metadata via `...prev` spread
- `party_dump.lua` is copied to BG3SE Script Extender dir for file-based loading

### Console Sync Workflow (daily driver)
```
load(Ext.IO.LoadFile("party_dump.lua"))()
```
Paste into BG3SE F11 console after loading a save. Dumps to party_sync.json → Tav picks it up on ↻ Sync.

---

## F8 Hotkey — Still Pending

TavSync.pak mod is built but BG3 keeps resetting modsettings.lsx. Resume when ready:

1. Open BG3MM, verify TavSync is in Active Mods
2. Export Load Order to Game
3. Lock modsettings.lsx read-only:
   ```bash
   chmod 444 "/mnt/c/Users/Owner/AppData/Local/Larian Studios/Baldur's Gate 3/PlayerProfiles/Public/modsettings.lsx"
   ```
4. Launch BG3 — dismiss the file error popup (harmless)
5. In BG3SE console: `_D(Ext.Mod.GetLoadOrder())` — verify TavSync UUID `7a4de82a-9c3f-4e91-b506-f1e23a79d4c5`
6. Press F8 in-game

---

## Key Paths

| Thing | Path |
|-------|------|
| TavSync.pak | `C:\Users\Owner\AppData\Local\Larian Studios\Baldur's Gate 3\Mods\TavSync.pak` |
| modsettings.lsx | `C:\Users\Owner\AppData\Local\Larian Studios\Baldur's Gate 3\PlayerProfiles\Public\modsettings.lsx` |
| party_dump.lua (BG3SE) | `C:\Users\Owner\AppData\Local\Larian Studios\Baldur's Gate 3\Script Extender\party_dump.lua` |
| party_dump.lua (source) | `memory/bg3se/party_dump.lua` — copy to BG3SE dir after edits |
| TavSync source | `C:\Users\Owner\AppData\Local\Temp\TavSyncPkg\` |
| BG3MM | `C:\Users\Owner\AppData\Local\BG3ModManager\BG3ModManager.exe` |
| Root HTML (served) | `/home/redrumrogue/workspace/projects/Tav/index.html` |
| Source HTML (template) | `/home/redrumrogue/workspace/projects/Tav/src/index.html` |
