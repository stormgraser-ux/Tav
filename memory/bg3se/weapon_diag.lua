-- ============================================================
-- weapon_diag.lua — Tav Weapon Slot Diagnostic
-- Paste into BG3SE console (F11) while in-game.
-- Goal: figure out which API/component gives us equipped weapons.
-- ============================================================

local function getHostEntity()
  local players = Osi.DB_Players:Get(nil)
  if not players or #players == 0 then return nil, nil end
  local uuid = players[1][1]
  local ok, entity = pcall(Ext.Entity.Get, uuid)
  if ok and entity then return entity, uuid end
  return nil, nil
end

local entity, uuid = getHostEntity()
if not entity then _P("ERROR: could not get host entity") return end
_P("Host UUID: " .. uuid)

-- ── A1: Osi.GetEquippedItem slot name sweep ───────────────────────
_P("\n=== A1: Osi.GetEquippedItem variants ===")
local slotNames = {
  "MeleeMainHand", "MeleeOffHand", "RangedMainHand", "RangedOffHand",
  "Melee Main Hand", "Melee Off Hand", "Ranged Main Hand", "Ranged Off Hand",
  "MeleeMainHand2", "MeleeOffHand2", "Weapon", "OffHand", "MainHand",
  "WeaponSet1Main", "WeaponSet2Main",
}
for _, slot in ipairs(slotNames) do
  local ok, item = pcall(Osi.GetEquippedItem, uuid, slot)
  local tag = ok and (item and ("HIT:" .. tostring(item)) or "nil") or "ERR"
  if ok and item then
    _P("  [HIT] '" .. slot .. "' → " .. tostring(item))
  end
end
_P("  (only HITs shown above)")

-- ── A2: Equipment component structure dump ────────────────────────
_P("\n=== A2: entity.Equipment ===")
local okEq, eq = pcall(function() return entity.Equipment end)
if not okEq or not eq then
  _P("  MISSING")
else
  _P("  FOUND — keys:")
  pcall(function()
    for k, v in pairs(eq) do
      local vStr = type(v) == "table" and "table" or tostring(v)
      _P("    ." .. tostring(k) .. " = " .. vStr)
    end
  end)
  -- Try Slots array
  local okSl, slots = pcall(function() return eq.Slots end)
  if okSl and slots then
    _P("  .Slots found — entries:")
    for i, v in pairs(slots) do
      if v then _P("    [" .. tostring(i) .. "] = " .. tostring(v)) end
    end
  end
end

-- ── A3: InventoryOwner → items → InventoryWielded ─────────────────
_P("\n=== A3: InventoryOwner → InventoryWielded ===")
local okIO, io = pcall(function() return entity.InventoryOwner end)
if not okIO or not io then
  _P("  InventoryOwner: MISSING")
else
  -- Dump top-level keys
  local ioKeys = {}
  pcall(function()
    for k, v in pairs(io) do
      table.insert(ioKeys, tostring(k) .. "=" .. type(v))
    end
  end)
  _P("  keys: " .. table.concat(ioKeys, ", "))

  local okInvs, invs = pcall(function() return io.Inventories end)
  if okInvs and invs then
    _P("  .Inventories count: " .. #invs)
    for idx, invRef in ipairs(invs) do
      _P("  Inventory[" .. idx .. "] = " .. tostring(invRef))
      -- Get the inventory entity and iterate its items
      local okIE, invEntity = pcall(Ext.Entity.Get, invRef)
      if okIE and invEntity then
        local okInv, invComp = pcall(function() return invEntity.Inventory end)
        if okInv and invComp then
          local okItems, items = pcall(function() return invComp.Items end)
          if okItems and items then
            _P("    Items count: " .. #items)
            for _, itemRef in ipairs(items) do
              local itemUUID = type(itemRef) == "string" and itemRef or tostring(itemRef)
              local okIItem, itemEntity = pcall(Ext.Entity.Get, itemUUID)
              if okIItem and itemEntity then
                -- Check InventoryWielded
                local okW, wield = pcall(function() return itemEntity.InventoryWielded end)
                if okW and wield then
                  -- This item is wielded — get its name and slot
                  local name = ""
                  pcall(function() name = itemEntity.DisplayName.Name:Get() end)
                  local slot = ""
                  pcall(function() slot = tostring(itemEntity.Equipable.Slot) end)
                  _P("    [WIELDED] " .. name .. " slot=" .. slot .. " uuid=" .. itemUUID)
                end
              end
            end
          else
            _P("    Inventory.Items: not accessible")
          end
        end
      end
    end
  end
end

-- ── A4: Try GetAllComponentNames on entity for equipment clues ────
_P("\n=== A4: Entity component names containing 'Equip' or 'Wield' or 'Weapon' ===")
local okAC, allComps = pcall(function() return entity:GetAllComponentNames() end)
if okAC and allComps then
  for _, name in ipairs(allComps) do
    local n = tostring(name):lower()
    if n:find("equip") or n:find("wield") or n:find("weapon") or n:find("slot") then
      _P("  " .. tostring(name))
    end
  end
else
  _P("  GetAllComponentNames not available")
end

_P("\n=== DONE ===")
