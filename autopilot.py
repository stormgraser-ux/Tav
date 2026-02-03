"""
BG3 Autopilot - Auto-follow your co-op partner

Press 0 to toggle autopilot on/off
Press Ctrl+C in terminal to quit
"""

import time
import pyautogui
from pynput import keyboard
import config

# Disable pyautogui's failsafe (moving mouse to corner won't abort)
# We have our own toggle instead
pyautogui.FAILSAFE = False

# State
autopilot_enabled = False


def double_click_portrait():
    """Double-click partner's portrait to center camera on them."""
    pyautogui.click(config.PORTRAIT_X, config.PORTRAIT_Y)
    time.sleep(config.DOUBLE_CLICK_DELAY)
    pyautogui.click(config.PORTRAIT_X, config.PORTRAIT_Y)


def click_to_follow():
    """Click near center of screen to follow partner."""
    pyautogui.click(config.FOLLOW_CLICK_X, config.FOLLOW_CLICK_Y)


def follow_partner():
    """Full follow sequence: center camera, then click to move."""
    double_click_portrait()
    time.sleep(config.CAMERA_PAN_DELAY)
    click_to_follow()


def on_press(key):
    """Handle hotkey press."""
    global autopilot_enabled

    try:
        if key.char == config.TOGGLE_KEY:
            autopilot_enabled = not autopilot_enabled
            status = "ON" if autopilot_enabled else "OFF"
            print(f"[Autopilot {status}]")
    except AttributeError:
        # Special key (not a character)
        pass


def main():
    global autopilot_enabled

    print("=" * 40)
    print("BG3 Autopilot")
    print("=" * 40)
    print(f"Press '{config.TOGGLE_KEY}' to toggle auto-follow")
    print("Press Ctrl+C to quit")
    print("=" * 40)
    print()
    print("[Autopilot OFF] - Waiting...")

    # Start keyboard listener in background
    listener = keyboard.Listener(on_press=on_press)
    listener.start()

    try:
        while True:
            if autopilot_enabled:
                follow_partner()
                time.sleep(config.FOLLOW_INTERVAL)
            else:
                # Idle polling - check less frequently when disabled
                time.sleep(0.1)
    except KeyboardInterrupt:
        print("\n[Autopilot stopped]")
        listener.stop()


if __name__ == "__main__":
    main()
