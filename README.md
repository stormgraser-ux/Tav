# Tav — BG3 Companion Tool

A free web-based companion for Baldur's Gate 3. Plan builds, find gear, optimize your party.

**Live site:** [stormgraser-ux.github.io/Tav](https://stormgraser-ux.github.io/Tav)

## What It Does

- **Gear Finder** — Best-in-slot gear for your build, filtered by act. 522 items across all three acts.
- **Party Advisor** — Analyze your party composition, find role gaps, get recommendations.
- **Build Planner** — 76 curated builds with level-by-level paths, feat picks, and gear recommendations.
- **Global Search** — Search all items across all acts instantly.

## TavSync Mod (Optional)

TavSync is a companion BG3SE mod that auto-syncs your party data from the game:

- Party classes, subclasses, levels, multiclass splits
- All equipped gear (12 slots per character)
- Ability scores (STR/DEX/CON/INT/WIS/CHA)
- XP progress, current region, act, gold
- Recruited companions, story milestones, illithid powers

Install the mod, play normally, and every save writes your full party state to a JSON file that Tav reads.

**Requires:** [BG3 Script Extender](https://github.com/Norbyte/bg3se)

## Running Locally

```bash
# Serve the site
npx serve . -p 3456

# Optional: run sync server for TavSync mod integration
npm run sync
```

Open `http://localhost:3456` in your browser.

## Data Sources

- Game data scraped from [bg3.wiki](https://bg3.wiki)
- Build templates from [Gamestegy](https://gamestegy.com) and [AlcastHQ](https://alcasthq.com)

## License

Source code available under MIT. Game data belongs to Larian Studios.
