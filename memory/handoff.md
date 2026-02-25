# Tav Handoff

## Status: F6 Hotkey Working

Party sync, UI redesign, multiclass tracking, and F6 hotkey all working.

---

## F6 Hotkey Sync (current workflow)

After loading a save, open BG3SE console (F11) and paste:
```
client
load(Ext.IO.LoadFile("tav_hotkey.lua"))()
server
load(Ext.IO.LoadFile("tav_server.lua"))()
```
Press F6 anytime in-game to dump party → `party_sync.json` → Tav picks it up on Sync.

**Why not a pak mod?** BG3 Patch 7+ rewrites modsettings.lsx on launch and silently drops custom pak mods. The in-game mod manager doesn't detect local paks either. Console-loaded scripts bypass all of this.

**Fallback (old one-liner):** `load(Ext.IO.LoadFile("party_dump.lua"))()`
Still works for a one-shot dump without the hotkey.

---

## Previous Work

### UX Redesign (complete)
- 4-tab nav: Gear / Party / Build / Search
- Persistent party strip below nav: slot pills, global act selector (I/II/III), Sync button
- Single `state.act` replacing `gearAct`/`partyAct`/`buildAct`
- Build tab: side-by-side browse (left) + planner form (right)
- Progressive disclosure: optional Build fields behind `<details>`, Party notes collapsed
- Root `index.html` is the served file; `src/index.html` is the template

### Party Sync — Multiclass Level Tracking (complete)
- `party_dump.lua` (v3) exports `subClass`, `classes[]` (with per-class levels), `totalLevel`
- `applyGameSync()` sets class + subclass (with fuzzy matching for name format differences)
- Split/notes field auto-populated with level breakdown on sync: `Wizard 3 / Barbarian 1`
- `partyMemberLabel()` includes split as parenthetical in copied prompts
- `saveParty()` preserves `classes`/`totalLevel` metadata via `...prev` spread

---

## Key Paths

| Thing | Path |
|-------|------|
| tav_server.lua (BG3SE) | `C:\Users\Owner\AppData\Local\Larian Studios\Baldur's Gate 3\Script Extender\tav_server.lua` |
| tav_hotkey.lua (BG3SE) | `C:\Users\Owner\AppData\Local\Larian Studios\Baldur's Gate 3\Script Extender\tav_hotkey.lua` |
| party_dump.lua (BG3SE) | `C:\Users\Owner\AppData\Local\Larian Studios\Baldur's Gate 3\Script Extender\party_dump.lua` |
| party_dump.lua (source) | `memory/bg3se/party_dump.lua` — copy to BG3SE dir after edits |
| BG3 install | `C:\Program Files (x86)\Steam\steamapps\common\Baldurs Gate 3` |
| Root HTML (served) | `/home/redrumrogue/workspace/projects/Tav/index.html` |
| Source HTML (template) | `/home/redrumrogue/workspace/projects/Tav/src/index.html` |
| lslib Divine.exe | `C:\Users\Owner\AppData\Local\Temp\lslib\Divine.exe` |
