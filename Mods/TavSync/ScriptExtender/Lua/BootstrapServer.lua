-- ============================================================
-- TavSync — BootstrapServer.lua
-- Server-side: listens for F6 net message, dumps party to JSON.
-- ============================================================

-- Osiris slot name → Tav GEAR_SLOTS key (armor/accessories only)
local SLOT_MAP = {
  Helmet         = "head",
  BreastPlate    = "chest",
  Gloves         = "hands",
  Boots          = "feet",
  Amulet         = "neck",
  Ring           = "ring1",
  Ring2          = "ring2",
  Cloak          = "cloak",
}

-- Weapon slots: Osi.GetEquippedItem returns nil for these.
-- Read from InventoryContainer → Equipable.Slot instead.
local WEAPON_SLOT_MAP = {
  MeleeMainHand  = "weapon",
  MeleeOffHand   = "offhand",
  RangedMainHand = "ranged",
  RangedOffHand  = "rangedoh",
}

-- Equipment container key → Tav slot (only active weapon slots)
local EQUIP_KEY_MAP = { [3] = "weapon", [4] = "offhand", [5] = "ranged", [6] = "rangedoh" }

local function getItemName(itemUUID)
  local ie = Ext.Entity.Get(itemUUID)
  if not ie then return "" end
  local ok, dn = pcall(function() return ie.DisplayName.Name end)
  if ok and dn then
    local ok2, val = pcall(function() return dn:Get() end)
    if ok2 and val and val ~= "" then return val end
  end
  local ok3, tname = pcall(function() return ie.ServerItem.Template.Name end)
  if ok3 and tname and tname ~= "" then
    local name = tname:match("^[A-Z0-9]+_(.+)") or tname
    return name:gsub("_", " ")
  end
  return ""
end

local function getItemNameFromEntity(itemEntity)
  if not itemEntity then return "" end
  local ok, dn = pcall(function() return itemEntity.DisplayName.Name end)
  if ok and dn then
    local ok2, val = pcall(function() return dn:Get() end)
    if ok2 and val and val ~= "" then return val end
  end
  local ok3, tname = pcall(function() return itemEntity.ServerItem.Template.Name end)
  if ok3 and tname and tname ~= "" then
    local name = tname:match("^[A-Z0-9]+_(.+)") or tname
    return name:gsub("_", " ")
  end
  return ""
end

local function getCharName(entity)
  local paths = {
    function() return entity.ServerCharacter.PlayerData.Name end,
    function() return entity.DisplayName.Name:Get() end,
    function() return entity.ServerCharacter.Template.Name end,
  }
  for _, fn in ipairs(paths) do
    local ok, val = pcall(fn)
    if ok and val and val ~= "" then return val end
  end
  return "Character"
end

local function classNameFromUUID(uuid)
  if not uuid then return nil end
  local ok, data = pcall(Ext.StaticData.Get, uuid, "ClassDescription")
  if not ok or not data then return nil end
  local ok2, dn = pcall(function() return data.DisplayName end)
  if ok2 and dn then
    local ok3, val = pcall(function() return dn:Get() end)
    if ok3 and val and val ~= "" then return val end
  end
  local ok4, name = pcall(function() return data.Name end)
  if ok4 and name and name ~= "" then return name end
  return nil
end

local function getClassLevels(entity)
  local classes    = {}
  local totalLevel = 0
  local ok, clsList = pcall(function() return entity.Classes.Classes end)
  if not ok or not clsList then
    local cls = classNameFromUUID(
      (pcall(function() return entity.Classes.Classes[1].ClassUUID end)) and
      entity.Classes.Classes[1].ClassUUID or nil
    )
    return cls and {{ name = cls, level = 0 }} or {}, 0
  end
  for _, entry in ipairs(clsList) do
    local okU, uuid = pcall(function() return entry.ClassUUID end)
    if okU and uuid then
      local name = classNameFromUUID(uuid)
      if name then
        local level = 0
        local okL, lvl = pcall(function() return entry.Level end)
        if okL and type(lvl) == "number" then level = lvl end
        local subClass = nil
        local okS, subUUID = pcall(function() return entry.SubClassUUID end)
        if okS and subUUID and tostring(subUUID) ~= "" then
          subClass = classNameFromUUID(tostring(subUUID))
        end
        table.insert(classes, { name = name, level = level, subClass = subClass })
        totalLevel = totalLevel + level
      end
    end
  end
  if totalLevel == 0 then
    local okE, el = pcall(function() return entity.EocLevel.Level end)
    if okE and type(el) == "number" then totalLevel = el end
  end
  return classes, totalLevel
end

local function getEquipment(uuid)
  local gear = {}

  -- Armor/accessories via Osiris
  for slot, tavSlot in pairs(SLOT_MAP) do
    local ok, itemUUID = pcall(Osi.GetEquippedItem, uuid, slot)
    if ok and itemUUID then
      local name = getItemName(itemUUID)
      if name ~= "" then gear[tavSlot] = name end
    end
  end

  -- Weapons via InventoryContainer at fixed equipment slot keys
  local ok, entity = pcall(Ext.Entity.Get, uuid)
  if ok and entity then
    pcall(function()
      for _, inv in ipairs(entity.InventoryOwner.Inventories) do
        local okItems, items = pcall(function() return inv.InventoryContainer.Items end)
        if okItems and items then
          for key, slotData in pairs(items) do
            local tavSlot = EQUIP_KEY_MAP[key]
            if tavSlot and not gear[tavSlot] then
              pcall(function()
                local slot = tostring(slotData.Item.Equipable.Slot)
                if WEAPON_SLOT_MAP[slot] then
                  local name = getItemNameFromEntity(slotData.Item)
                  if name ~= "" then gear[tavSlot] = name end
                end
              end)
            end
          end
        end
      end
    end)
  end

  return gear
end

-- ── Main dump function ────────────────────────────────────────────

local function dumpParty()
  local members = {}
  local seen    = {}

  for _, row in ipairs(Osi.DB_Players:Get(nil)) do
    local uuid = row[1]
    if not seen[uuid] then
      seen[uuid] = true
      local ok, entity = pcall(Ext.Entity.Get, uuid)
      if ok and entity then
        local classes, totalLevel = getClassLevels(entity)
        local primaryClass    = (#classes > 0) and classes[1].name or nil
        local primarySubClass = (#classes > 0) and classes[1].subClass or nil
        table.insert(members, {
          name        = getCharName(entity),
          className   = primaryClass,
          subClass    = primarySubClass,
          classes     = classes,
          totalLevel  = totalLevel,
          gear        = getEquipment(uuid),
        })
      end
    end
  end

  for _, dbName in ipairs({ "DB_InTheParty", "DB_IsInCurrentParty", "DB_PartyMembers" }) do
    local ok, rows = pcall(function() return Osi[dbName]:Get(nil) end)
    if ok and rows then
      for _, row in ipairs(rows) do
        local uuid = row[1]
        if not seen[uuid] then
          seen[uuid] = true
          local ok2, entity = pcall(Ext.Entity.Get, uuid)
          if ok2 and entity then
            local classes, totalLevel = getClassLevels(entity)
            local primaryClass = (#classes > 0) and classes[1].name or nil
            table.insert(members, {
              name        = getCharName(entity),
              className   = primaryClass,
              classes     = classes,
              totalLevel  = totalLevel,
              gear        = getEquipment(uuid),
            })
          end
        end
      end
      if #members >= 4 then break end
    end
  end

  while #members > 4 do table.remove(members) end

  local result = { members = members, version = 3 }
  Ext.IO.SaveFile("party_sync.json", Ext.Json.Stringify(result))

  _P("[TavSync] " .. #members .. " party members synced")
  for i, m in ipairs(members) do
    local gearCount = 0
    for _ in pairs(m.gear) do gearCount = gearCount + 1 end
    local clsStr = ""
    if m.classes and #m.classes > 0 then
      local parts = {}
      for _, c in ipairs(m.classes) do
        table.insert(parts, c.name .. (c.level > 0 and " " .. c.level or ""))
      end
      clsStr = table.concat(parts, " / ")
    else
      clsStr = m.className or "?"
    end
    _P("  [" .. i .. "] " .. m.name .. " (" .. clsStr .. ") — " .. gearCount .. " slots")
  end
end

-- ── Listen for F6 from client ─────────────────────────────────────

Ext.RegisterNetListener("TavSync_DumpParty", function(channel, payload, user)
  dumpParty()
end)

_P("[TavSync] Server loaded — F6 to sync")

-- ── Console Relay ─────────────────────────────────────────────────
-- Polls tav_cmd.json for Lua commands from the bridge server,
-- executes them, and writes results to tav_result.json.

local lastRelayCheck = 0
local RELAY_INTERVAL = 500 -- ms

Ext.Events.Tick:Subscribe(function()
  local now = Ext.Utils.MonotonicTime()
  if now - lastRelayCheck < RELAY_INTERVAL then return end
  lastRelayCheck = now

  local ok, raw = pcall(Ext.IO.LoadFile, "tav_cmd.json")
  if not ok or not raw or raw == "" then return end

  -- Clear command file immediately to prevent re-execution
  pcall(Ext.IO.SaveFile, "tav_cmd.json", "")

  local cmdOk, cmd = pcall(Ext.Json.Parse, raw)
  if not cmdOk or not cmd or not cmd.id or not cmd.lua then
    pcall(Ext.IO.SaveFile, "tav_result.json", Ext.Json.Stringify({
      id = (cmd and cmd.id) or "unknown",
      ok = false,
      result = Ext.Json.Null,
      output = {},
      error = "Invalid command JSON"
    }))
    return
  end

  -- Capture _P output during execution
  local captured = {}
  local origP = _P
  _P = function(...)
    local parts = {}
    for i = 1, select("#", ...) do
      parts[#parts + 1] = tostring(select(i, ...))
    end
    captured[#captured + 1] = table.concat(parts, "\t")
    origP(...)
  end

  local result = {
    id = cmd.id,
    ok = true,
    result = Ext.Json.Null,
    output = {},
    error = Ext.Json.Null,
  }

  local fn, loadErr = load(cmd.lua)
  if not fn then
    result.ok = false
    result.error = loadErr
  else
    local execOk, execResult = pcall(fn)
    if not execOk then
      result.ok = false
      result.error = tostring(execResult)
    elseif execResult ~= nil then
      result.result = tostring(execResult)
    end
  end

  -- Restore _P and collect output
  _P = origP
  result.output = captured

  pcall(Ext.IO.SaveFile, "tav_result.json", Ext.Json.Stringify(result))
  _P("[TavSync] Executed command " .. cmd.id .. (result.ok and " OK" or " FAIL"))
end)

_P("[TavSync] Console relay active")
