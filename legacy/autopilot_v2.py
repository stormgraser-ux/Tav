"""
BG3 Autopilot v2 - Attempts to click without moving your mouse

Uses PostMessage to send clicks directly to BG3 window.
If this doesn't work, we'll fall back to monitor-based approach.

Press 0 to toggle autopilot on/off
Press Ctrl+C in terminal to quit
"""

import time
import win32gui
import win32con
import win32api
from pynput import keyboard
import config

# State
autopilot_enabled = False
bg3_window = None


def find_bg3_window():
    """Find the BG3 window handle."""
    def callback(hwnd, windows):
        title = win32gui.GetWindowText(hwnd)
        if "Baldur's Gate 3" in title:
            windows.append(hwnd)
        return True

    windows = []
    win32gui.EnumWindows(callback, windows)
    return windows[0] if windows else None


def make_lparam(x, y):
    """Create LPARAM from x,y coordinates."""
    return (y << 16) | (x & 0xFFFF)


def click_in_window(hwnd, x, y):
    """Send a click to the window at x,y (client coordinates)."""
    lparam = make_lparam(x, y)

    # Post mouse down and up messages
    win32gui.PostMessage(hwnd, win32con.WM_LBUTTONDOWN, win32con.MK_LBUTTON, lparam)
    time.sleep(0.05)
    win32gui.PostMessage(hwnd, win32con.WM_LBUTTONUP, 0, lparam)


def double_click_in_window(hwnd, x, y):
    """Send a double-click to the window."""
    lparam = make_lparam(x, y)

    win32gui.PostMessage(hwnd, win32con.WM_LBUTTONDOWN, win32con.MK_LBUTTON, lparam)
    time.sleep(0.02)
    win32gui.PostMessage(hwnd, win32con.WM_LBUTTONUP, 0, lparam)
    time.sleep(0.02)
    win32gui.PostMessage(hwnd, win32con.WM_LBUTTONDBLCLK, win32con.MK_LBUTTON, lparam)
    time.sleep(0.02)
    win32gui.PostMessage(hwnd, win32con.WM_LBUTTONUP, 0, lparam)


def screen_to_client(hwnd, x, y):
    """Convert screen coordinates to client (window-relative) coordinates."""
    # Get window's client area position on screen
    rect = win32gui.GetWindowRect(hwnd)
    client_x = x - rect[0]
    client_y = y - rect[1]
    return client_x, client_y


def follow_partner(hwnd):
    """Full follow sequence using window messages."""
    # Convert screen coords to client coords
    portrait_x, portrait_y = screen_to_client(hwnd, config.PORTRAIT_X, config.PORTRAIT_Y)
    follow_x, follow_y = screen_to_client(hwnd, config.FOLLOW_CLICK_X, config.FOLLOW_CLICK_Y)

    # Double-click portrait to center camera
    double_click_in_window(hwnd, portrait_x, portrait_y)
    time.sleep(config.CAMERA_PAN_DELAY)

    # Click ground to follow
    click_in_window(hwnd, follow_x, follow_y)


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
    global autopilot_enabled, bg3_window

    print("=" * 50)
    print("BG3 Autopilot v2 (Window Message Mode)")
    print("=" * 50)
    print("This version tries to click WITHOUT moving your mouse!")
    print(f"Press '{config.TOGGLE_KEY}' to toggle auto-follow")
    print("Press Ctrl+C to quit")
    print("=" * 50)
    print()

    # Find BG3 window
    print("Looking for Baldur's Gate 3 window...")
    bg3_window = find_bg3_window()

    if bg3_window:
        title = win32gui.GetWindowText(bg3_window)
        print(f"Found: {title}")
    else:
        print("BG3 window not found! Make sure the game is running.")
        print("Will keep checking...")

    print()
    print("[Autopilot OFF] - Waiting...")

    # Start keyboard listener
    listener = keyboard.Listener(on_press=on_press)
    listener.start()

    try:
        while True:
            if autopilot_enabled:
                # Re-check for window if we don't have it
                if not bg3_window or not win32gui.IsWindow(bg3_window):
                    bg3_window = find_bg3_window()

                if bg3_window:
                    follow_partner(bg3_window)
                else:
                    print("[Warning] BG3 window not found, waiting...")

                time.sleep(config.FOLLOW_INTERVAL)
            else:
                time.sleep(0.1)
    except KeyboardInterrupt:
        print("\n[Autopilot stopped]")
        listener.stop()


if __name__ == "__main__":
    main()
