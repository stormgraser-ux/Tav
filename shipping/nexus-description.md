# TavSync — Live Party Sync for Tav BG3 Companion

## Short Description (Nexus summary field)
Syncs your party's gear, classes, abilities, and game progress to the Tav web companion tool. Auto-syncs on every save.

---

## Full Description (Nexus mod page body)

### What is TavSync?

TavSync is the companion mod for [Tav](https://stormgraser-ux.github.io/Tav), a free web-based BG3 companion tool that helps you plan builds, find gear, and optimize your party.

**Without TavSync:** You manually enter your party's classes, gear, and act into the Tav website.

**With TavSync:** Your party's data syncs automatically from the game. Every quicksave, autosave, or manual save writes your full party state to a JSON file that Tav reads instantly. No copy-paste, no manual entry.

### What Gets Synced

- **Party composition** — classes, subclasses, multiclass splits, character levels
- **All equipped gear** — weapons, armor, rings, amulets, cloaks (12 slots per character)
- **Ability scores** — STR/DEX/CON/INT/WIS/CHA for each party member
- **Experience** — current XP and progress to next level
- **Game progress** — current region, act, gold, recruited companions
- **Milestones** — key story flags like "Goblin Camp cleared," "Underdark reached," "Halsin found"
- **Illithid powers** — which tadpole abilities have been unlocked

### How It Works

1. Install the mod (drag TavSync.pak into your Mods folder)
2. Open [Tav](https://stormgraser-ux.github.io/Tav) in your browser
3. Play the game normally — every save auto-syncs your party data
4. Click "Sync" in Tav to pull in the latest data
5. Use the copy-to-Claude feature and your prompt automatically includes your real game state

You can also press **F6** in-game for a manual sync at any time.

### Requirements

- [BG3 Script Extender](https://github.com/Norbyte/bg3se) (required)
- Baldur's Gate 3 (any version supported by BG3SE)

### Installation

1. Install BG3 Script Extender if you haven't already
2. Download `TavSync.pak` from the Files tab
3. Copy it to: `%LOCALAPPDATA%\Larian Studios\Baldur's Gate 3\Mods\`
4. Add TavSync to your mod load order (BG3 Mod Manager recommended)
5. Launch the game — you should see `[TavSync] Server loaded` in the BG3SE console (F11)

### FAQ

**Q: Does this affect gameplay or save files?**
No. TavSync is read-only — it reads your party data and writes it to a separate JSON file outside of your saves. It never modifies game state.

**Q: Does this work with other mods?**
Yes. TavSync only reads entity data and Osiris databases. It doesn't modify anything and has no conflicts with other mods.

**Q: Where does the sync file go?**
`%LOCALAPPDATA%\Larian Studios\Baldur's Gate 3\Script Extender\party_sync.json`

**Q: Do I need to keep a terminal/server running?**
For the basic web tool, no — the sync file is written by the mod. The Tav web app reads it when you click Sync.

For power users running the local dev server (`npm run sync`), the server watches the file and serves it over HTTP for instant browser access.

**Q: Can I use Tav without TavSync?**
Absolutely. Tav works fully without the mod — you just enter your party info manually. TavSync is a convenience addon.

### Permissions

- You may include this mod in mod collections
- You may not upload this mod to other sites without permission
- Source code is available on [GitHub](https://github.com/stormgraser-ux/Tav)

### Credits

- Built by Stormgraser
- Powered by [BG3 Script Extender](https://github.com/Norbyte/bg3se) by Norbyte
- Game data sourced from [bg3.wiki](https://bg3.wiki)
