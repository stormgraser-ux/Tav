-- ============================================================
-- party_dump.lua — Tav Party Sync
-- Paste into BG3SE console (F11), run after loading a save.
-- Uses Osi.GetEquippedItem + DisplayName:Get() — works in BG3SE v30+
-- ============================================================

-- Osiris slot name → Tav GEAR_SLOTS key
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

-- Get class name (e.g. "Bard", "Barbarian") via StaticData
local function getClassName(entity)
  local ok, cls = pcall(function() return entity.Classes.Classes[1].ClassUUID end)
  if not ok or not cls then return nil end
  local ok2, data = pcall(Ext.StaticData.Get, cls, "ClassDescription")
  if not ok2 or not data then return nil end
  local ok3, name = pcall(function() return data.Name end)
  if ok3 and name and name ~= "" then return name end
  return nil
end

-- Get all equipped gear for a character UUID
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
      table.insert(members, { name = getCharName(entity), className = getClassName(entity), gear = getEquipment(uuid) })
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
          table.insert(members, { name = getCharName(entity), className = getClassName(entity), gear = getEquipment(uuid) })
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
  version = 1,
}

Ext.IO.SaveFile("party_sync.json", Ext.Json.Stringify(result))

_P("✓ Tav sync: " .. #members .. " party members dumped to party_sync.json")
for i, m in ipairs(members) do
  local count = 0
  for _ in pairs(m.gear) do count = count + 1 end
  local cls = m.className or "?"
  _P("  [" .. i .. "] " .. m.name .. " (" .. cls .. ") — " .. count .. " gear slots")
end
