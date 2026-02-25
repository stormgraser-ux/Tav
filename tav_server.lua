-- ============================================================
-- tav_server.lua — Tav Party Sync (server side)
-- Registers net listener for F6 hotkey + runs dump once.
-- Usage: load(Ext.IO.LoadFile("tav_server.lua"))()
-- ============================================================

if TavSync then
  _P("[TavSync] Already loaded — F6 ready. Running dump...")
  TavSync.dump()
  return
end

TavSync = {}

local SLOT_MAP = {
  Helmet         = "head",
  BreastPlate    = "chest",
  Gloves         = "hands",
  Boots          = "feet",
  Amulet         = "neck",
  Ring           = "ring1",
  Ring2          = "ring2",
  Cloak          = "cloak",
  MeleeMainHand  = "weapon",
  MeleeOffHand   = "offhand",
  RangedMainHand = "ranged",
  RangedOffHand  = "rangedoh",
}

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
  for slot, tavSlot in pairs(SLOT_MAP) do
    local ok, itemUUID = pcall(Osi.GetEquippedItem, uuid, slot)
    if ok and itemUUID then
      local name = getItemName(itemUUID)
      if name ~= "" then gear[tavSlot] = name end
    end
  end
  return gear
end

function TavSync.dump()
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

  Ext.IO.SaveFile("party_sync.json", Ext.Json.Stringify({
    members = members,
    version = 3,
  }))

  _P("[TavSync] Dumped " .. #members .. " party members")
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
    _P("  [" .. i .. "] " .. m.name .. " (Lvl " .. m.totalLevel .. " — " .. clsStr .. ") — " .. gearCount .. " gear slots")
  end

  Ext.Net.BroadcastMessage("TavSync_Status", "Synced " .. #members .. " party members")
end

-- Listen for F6 hotkey trigger from client
Ext.RegisterNetListener("TavSync_Dump", function(channel, payload, userId)
  _P("[TavSync] Dump triggered via F6")
  TavSync.dump()
end)

-- Run dump immediately on first load
TavSync.dump()
_P("[TavSync] Server ready — press F6 to sync anytime")
