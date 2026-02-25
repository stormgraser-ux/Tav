-- ============================================================
-- party_dump.lua — Tav Party Sync
-- Paste into BG3SE console (F11), run after loading a save.
-- Uses Osi.GetEquippedItem + DisplayName:Get() — works in BG3SE v30+
-- ============================================================

-- Osiris slot name → Tav GEAR_SLOTS key (armor/accessories only — weapons use InventoryContainer)
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
-- Instead we read from InventoryContainer → Equipable.Slot on each item.
local WEAPON_SLOT_MAP = {
  MeleeMainHand  = "weapon",
  MeleeOffHand   = "offhand",
  RangedMainHand = "ranged",
  RangedOffHand  = "rangedoh",
}

-- Get the real in-game display name for an item UUID
local function getItemName(itemUUID)
  local ie = Ext.Entity.Get(itemUUID)
  if not ie then return "" end
  -- Primary: DisplayName.Name:Get() — actual localized name
  local ok, dn = pcall(function() return ie.DisplayName.Name end)
  if ok and dn then
    local ok2, val = pcall(function() return dn:Get() end)
    if ok2 and val and val ~= "" then return val end
  end
  -- Fallback: parse Template.Name (e.g. "MAG_Bard_HealingBardicInspiration_Hat")
  local ok3, tname = pcall(function() return ie.ServerItem.Template.Name end)
  if ok3 and tname and tname ~= "" then
    local name = tname:match("^[A-Z0-9]+_(.+)") or tname
    return name:gsub("_", " ")
  end
  return ""
end

-- Get a readable character name
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

-- Look up a class name string from a class UUID via StaticData
local function classNameFromUUID(uuid)
  if not uuid then return nil end
  local ok, data = pcall(Ext.StaticData.Get, uuid, "ClassDescription")
  if not ok or not data then return nil end
  -- Try localized DisplayName first ("College of Lore", "Bard", etc.)
  local ok2, dn = pcall(function() return data.DisplayName end)
  if ok2 and dn then
    local ok3, val = pcall(function() return dn:Get() end)
    if ok3 and val and val ~= "" then return val end
  end
  -- Fallback to internal Name ("Bard", "CollegeOfLore", etc.)
  local ok4, name = pcall(function() return data.Name end)
  if ok4 and name and name ~= "" then return name end
  return nil
end

-- Get all class entries for a character with per-class levels.
-- Returns: classes (array of {name, level}), totalLevel (int), primaryClass (string)
local function getClassLevels(entity)
  local classes    = {}
  local totalLevel = 0

  local ok, clsList = pcall(function() return entity.Classes.Classes end)
  if not ok or not clsList then
    -- Fallback: single class, unknown level
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
        -- Level of this class specifically
        local level = 0
        local okL, lvl = pcall(function() return entry.Level end)
        if okL and type(lvl) == "number" then level = lvl end
        -- Subclass (e.g. "College of Lore", "Berserker")
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

  -- If we couldn't get per-class levels, try total level from EocLevel
  if totalLevel == 0 then
    local okE, el = pcall(function() return entity.EocLevel.Level end)
    if okE and type(el) == "number" then totalLevel = el end
  end

  return classes, totalLevel
end

-- Get the display name directly from an entity handle (for InventoryContainer items)
local function getItemNameFromEntity(itemEntity)
  if not itemEntity then return "" end
  local ok, dn = pcall(function() return itemEntity.DisplayName.Name end)
  if ok and dn then
    local ok2, val = pcall(function() return dn:Get() end)
    if ok2 and val and val ~= "" then return val end
  end
  -- Fallback: Template.Name
  local ok3, tname = pcall(function() return itemEntity.ServerItem.Template.Name end)
  if ok3 and tname and tname ~= "" then
    local name = tname:match("^[A-Z0-9]+_(.+)") or tname
    return name:gsub("_", " ")
  end
  return ""
end

-- Get all equipped gear for a character UUID
local function getEquipment(uuid)
  local gear = {}

  -- Armor/accessories: Osi.GetEquippedItem works for these
  for slot, tavSlot in pairs(SLOT_MAP) do
    local ok, itemUUID = pcall(Osi.GetEquippedItem, uuid, slot)
    if ok and itemUUID then
      local name = getItemName(itemUUID)
      if name ~= "" then gear[tavSlot] = name end
    end
  end

  -- Weapons: GetEquippedItem returns nil — read from InventoryContainer instead
  local ok, entity = pcall(Ext.Entity.Get, uuid)
  if ok and entity then
    pcall(function()
      for _, inv in ipairs(entity.InventoryOwner.Inventories) do
        local okItems, items = pcall(function() return inv.InventoryContainer.Items end)
        if okItems and items then
          for _, slotData in pairs(items) do
            pcall(function()
              local slot = tostring(slotData.Item.Equipable.Slot)
              local tavSlot = WEAPON_SLOT_MAP[slot]
              if tavSlot and not gear[tavSlot] then
                local name = getItemNameFromEntity(slotData.Item)
                if name ~= "" then gear[tavSlot] = name end
              end
            end)
          end
        end
      end
    end)
  end

  return gear
end

-- ── Collect party members ──────────────────────────────────────────

local members = {}
local seen    = {}

-- Player character(s)
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

-- Companions in active party
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

-- ── Write JSON ─────────────────────────────────────────────────────

local result = {
  members = members,
  version = 3,
}

Ext.IO.SaveFile("party_sync.json", Ext.Json.Stringify(result))

_P("✓ Tav sync: " .. #members .. " party members dumped to party_sync.json")
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
