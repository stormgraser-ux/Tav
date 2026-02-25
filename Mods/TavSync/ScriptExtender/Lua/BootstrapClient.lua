-- TavSync — Client-side: F6 hotkey → triggers server-side party dump
-- BG3SE KeyInput does NOT suppress game key bindings — F6 is unbound in BG3.

Ext.Events.KeyInput:Subscribe(function(e)
    if e.Event == "KeyDown" and e.Key == "F6" then
        Ext.Net.PostMessageToServer("TavSync_DumpParty", "")
    end
end)

_P("[TavSync] Client loaded — press F6 to sync party gear to Tav")
