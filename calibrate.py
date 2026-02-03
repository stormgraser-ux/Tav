"""
Calibration helper - shows current mouse position.

Run this, then hover over the portrait and note the X,Y coordinates.
Press Ctrl+C to quit.
"""

import pyautogui
import time

print("=" * 50)
print("BG3 Autopilot Calibration")
print("=" * 50)
print("Hover your mouse over your partner's portrait")
print("Note the X,Y coordinates shown below")
print("Press Ctrl+C to quit")
print("=" * 50)
print()

try:
    while True:
        x, y = pyautogui.position()
        print(f"\rMouse position: X={x:4d}  Y={y:4d}", end="", flush=True)
        time.sleep(0.1)
except KeyboardInterrupt:
    print("\n\nDone! Update config.py with your coordinates:")
    print("  PORTRAIT_X = <your X value>")
    print("  PORTRAIT_Y = <your Y value>")
