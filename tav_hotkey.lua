-- ============================================================
-- tav_hotkey.lua — Tav F6 Hotkey (client side)
-- Usage: switch to client console, then:
--   load(Ext.IO.LoadFile("tav_hotkey.lua"))()
-- ============================================================

if TavHotkey then
  _P("[TavSync] F6 hotkey already registered")
  return
end

TavHotkey = true

Ext.Events.KeyInput:Subscribe(function(e)
  if e.Key == "F6" and e.Pressed then
    _P("[TavSync] F6 pressed — syncing...")
    Ext.Net.PostMessageToServer("TavSync_Dump", "")
  end
end)

Ext.RegisterNetListener("TavSync_Status", function(channel, payload)
  _P("[TavSync] " .. tostring(payload))
end)

_P("[TavSync] F6 hotkey ready — press F6 anytime to sync party gear")
