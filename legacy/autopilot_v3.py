"""
BG3 Autopilot v3 - Quick clicks with cursor restore

Does clicks with pyautogui but saves and restores cursor position.
Only runs when BG3 is NOT focused (so it won't interfere when you're playing).

Press 0 to toggle autopilot on/off
Press Ctrl+C in terminal to quit
"""

import time
import pyautogui
import win32gui
from pynput import keyboard
import config

# Disable pyautogui's failsafe and set it to be fast
pyautogui.FAILSAFE = False
pyautogui.PAUSE = 0  # No delay between pyautogui calls

# State
autopilot_enabled = False


def is_bg3_focused():
    """Check if BG3 is the currently focused window."""
    try:
        hwnd = win32gui.GetForegroundWindow()
        title = win32gui.GetWindowText(hwnd)
        return "Baldur's Gate 3" in title
    except:
        return False


def double_click_portrait():
    """Double-click partner's portrait to center camera on them."""
    pyautogui.click(config.PORTRAIT_X, config.PORTRAIT_Y)
    time.sleep(config.DOUBLE_CLICK_DELAY)
    pyautogui.click(config.PORTRAIT_X, config.PORTRAIT_Y)


def click_to_follow():
    """Click near center of screen to follow partner."""
    pyautogui.click(config.FOLLOW_CLICK_X, config.FOLLOW_CLICK_Y)


def follow_partner():
    """Full follow sequence with cursor save/restore."""
    # Save current cursor position
    original_pos = pyautogui.position()

    # Do the clicks
    double_click_portrait()
    time.sleep(config.CAMERA_PAN_DELAY)
    click_to_follow()

    # Restore cursor position
    pyautogui.moveTo(original_pos[0], original_pos[1])


def on_press(key):
    """Handle hotkey press."""
    global autopilot_enabled

    try:
        if key.char == config.TOGGLE_KEY:
            autopilot_enabled = not autopilot_enabled
            status = "ON" if autopilot_enabled else "OFF"
            print(f"[Autopilot {status}]")
    except AttributeError:
        pass


def main():
    global autopilot_enabled

    print("=" * 50)
    print("BG3 Autopilot v3 (Smart Mode)")
    print("=" * 50)
    print("Only runs when BG3 is NOT focused.")
    print("Tab out to code = autopilot runs")
    print("Tab into BG3 = autopilot pauses")
    print(f"Press '{config.TOGGLE_KEY}' to toggle auto-follow")
    print("Press Ctrl+C to quit")
    print("=" * 50)
    print()
    print("[Autopilot OFF] - Waiting...")

    # Start keyboard listener in background
    listener = keyboard.Listener(on_press=on_press)
    listener.start()

    was_paused = False
    try:
        while True:
            if autopilot_enabled:
                if is_bg3_focused():
                    # BG3 is focused, pause autopilot
                    if not was_paused:
                        print("[Paused - BG3 focused]")
                        was_paused = True
                    time.sleep(0.5)
                else:
                    # BG3 not focused, run autopilot
                    if was_paused:
                        print("[Resumed - BG3 not focused]")
                        was_paused = False
                    follow_partner()
                    time.sleep(config.FOLLOW_INTERVAL)
            else:
                was_paused = False
                time.sleep(0.1)
    except KeyboardInterrupt:
        print("\n[Autopilot stopped]")
        listener.stop()


if __name__ == "__main__":
    main()
