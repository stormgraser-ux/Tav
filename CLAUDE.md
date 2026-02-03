# BG3Autopilot

Automation assistant for Baldur's Gate 3 co-op sessions, allowing the user to focus on coding while playing with their partner.

## Project Goal

Create automation scripts that can handle routine gameplay tasks in BG3 so the user can multitask during co-op sessions.

## Potential Automation Targets

- **Combat autopilot** - Handle turn-based combat with simple attack patterns
- **Inventory management** - Auto-loot, sort, sell junk
- **Movement/following** - Keep character following the party
- **Dialogue skipping** - Auto-advance through already-seen dialogue
- **Buff management** - Maintain buffs/rest when needed

## Technical Approach

This is a Windows game, so automation will likely involve:

- **Screen capture** - PIL/mss for screenshots
- **Image recognition** - Find UI elements, health bars, buttons
- **Mouse/keyboard** - pyautogui or pydirectinput for input
- **OCR** - Tesseract for reading text on screen
- **State machine** - Track game state (combat, exploration, dialogue)

## Key Considerations

- BG3 is turn-based, which makes automation easier than real-time games
- Co-op means partner handles story decisions - autopilot just needs to "not be useless"
- Should have easy toggle on/off (hotkey) for when user wants manual control
- Must not interfere with partner's gameplay experience

## File Structure (Planned)

```
BG3Autopilot/
├── autopilot.py       # Main script
├── combat.py          # Combat automation
├── vision.py          # Screen reading utilities
├── input.py           # Mouse/keyboard control
├── config.py          # Hotkeys, settings
└── assets/            # Reference images for matching
```

## Running on WSL

Since BG3 runs on Windows, the automation needs to:
1. Run on Windows side (not WSL) for input to work, OR
2. Use WSL but send inputs via Windows interop

Recommend: Python script runs natively on Windows, Claude helps develop it from WSL.

## User Context

- User is experienced developer
- Playing co-op with partner (Chyoko?)
- Wants to code on the side during sessions
- Has RTX 3080 Ti, i9-12900K - plenty of power for background automation
