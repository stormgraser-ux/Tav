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

-- ── Ability scores for a character ────────────────────────────────

local function getAbilities(uuid)
  local abilities = {}
  for _, stat in ipairs({"Strength","Dexterity","Constitution","Intelligence","Wisdom","Charisma"}) do
    local ok, val = pcall(Osi.GetAbility, uuid, stat)
    if ok and type(val) == "number" then abilities[stat] = val end
  end
  return abilities
end

-- ── Experience info ──────────────────────────────────────────────

local function getExperience(entity)
  local result = {}
  pcall(function()
    result.current = entity.Experience.CurrentLevelExperience
    result.nextLevel = entity.Experience.NextLevelExperience
    result.total = entity.Experience.TotalExperience
  end)
  return result
end

-- ── Game state snapshot ──────────────────────────────────────────

local MILESTONES = {
  -- Act 1
  { flag = "TUT_Helm_State_TutorialEnded_55073953-23b9-448c-bee8-4c44d3d67b6b",           label = "Nautiloid cleared" },
  { flag = "DEN_General_State_Entered_26b2dc6a-e5eb-4d99-a4bd-3ecaa3b86a9e",               label = "Druid's Grove entered" },
  { flag = "Hirelings_State_FeatureAvailable_66a34105-f02f-4c74-a3c8-085f1de12db8",        label = "Withers found (respec available)" },
  { flag = "GLO_GoblinCamp_EverEnteredBefore_7a0172dd-df95-448a-aa2e-a04acdf7eabe",        label = "Goblin Camp reached" },
  { flag = "GOB_General_State_Hostile_9816a6fb-54d7-4b9c-a5c7-bc6cda6bb276",               label = "Goblin Camp hostile" },
  { flag = "GLO_Halsin_Knows_IsFound_a0d83476-e2d0-4972-a76b-b23c39078cd7",                label = "Halsin found" },
  { flag = "GLO_Halsin_State_PermaDefeated_86bc3df1-08b4-fbc4-b542-6241bcd03df1",          label = "Halsin dead" },
  { flag = "HAG_Hag_State_IsDead_781391e2-7d33-642d-28c0-e9b06cde32bb",                    label = "Hag killed" },
  { flag = "HAG_Hag_State_HagDefeated_7a1acad0-589f-ae02-f712-f0d24080d720",               label = "Hag dealt with (alive)" },
  { flag = "FOR_Owlbear_State_PermaDefeated_a2cd3c0f-95be-7155-d67c-edbdb2ca1104",         label = "Owlbear defeated" },
  { flag = "FOR_Bottomless_SpiderQueen_State_PermaDefeated_b749271f-fbee-43ec-bbc7-b1199d0f794a", label = "Phase Spider Matriarch killed" },
  { flag = "UND_MyconidCircle_State_Visited_5c470f79-d252-49e0-af96-94cebd100359",         label = "Underdark reached" },
  { flag = "PLA_GithChokepoint_State_SceneDone_2fa4006f-12e5-4666-931b-e31dee737f2f",      label = "Githyanki Patrol dealt with" },
  { flag = "DEN_AttackOnDen_State_RaiderVictory_abe1bce8-c234-4afe-a490-76210d98a078",     label = "Raiders won at Grove" },
  { flag = "GLO_ForgingOfTheHeart_State_KarlachUpgraded_a818e2f5-9e0c-4ab3-8c1e-00765d3b892f", label = "Karlach engine upgraded" },
  { flag = "GLO_Tadpole_State_TreeUnlocked_f7691d3d-345b-4984-8eed-6f238a9f84be",          label = "Illithid skill tree unlocked" },
  { flag = "FOR_ThayanCellar_State_LabDiscovered_72e17f62-be19-4277-be42-01a6f62afbf3",    label = "Necromancy of Thay found" },
  { flag = "FOR_IncompleteMasterwork_State_PartyHasApprenticePlans_946dde0d-e7aa-4322-b514-129831007a91", label = "Masterwork weapon plans found" },
  -- Act 2 (flags verified when player reaches Act 2)
  { flag = "GLO_Nightsong_State_Freed",  label = "Nightsong freed" },
  { flag = "GLO_Nightsong_State_Killed", label = "Nightsong killed" },
  -- Act 3
  { flag = "GLO_SteelWatchers_State_Destroyed", label = "Steel Watch destroyed" },
}

local REGION_MAP = {
  TUT_Avernus_C = { name = "Nautiloid",            act = 1 },
  WLD_Main_A    = { name = "Wilderness",            act = 1 },
  CRE_Main_A    = { name = "Rosymorn Monastery",    act = 1 },
  SCL_Main_A    = { name = "Shadow-Cursed Lands",   act = 2 },
  INT_Main_A    = { name = "Moonrise Towers",       act = 2 },
  BGO_Main_A    = { name = "Rivington",             act = 3 },
  CTY_Main_A    = { name = "Lower City",            act = 3 },
  END_Main_A    = { name = "High Hall",             act = 3 },
}

local function getGameState()
  local state = {}

  -- Region and act
  local playerUUID = Osi.DB_Players:Get(nil)[1][1]
  local ok, region = pcall(Osi.GetRegion, playerUUID)
  if ok and region then
    state.regionId = region
    local mapped = REGION_MAP[region]
    if mapped then
      state.region = mapped.name
      state.act = mapped.act
    else
      state.region = region
    end
  end

  -- Gold
  pcall(function() state.gold = Osi.GetGold(playerUUID) end)

  -- Difficulty
  local flags = Osi.DB_GlobalFlag:Get(nil)
  local flagSet = {}
  for _, r in ipairs(flags) do flagSet[tostring(r[1])] = true end

  if flagSet["GLO_DifficultyMode_HonourMode_" .. ""] then
    state.difficulty = "Honour"
  elseif flagSet["GLO_DifficultyMode_Hard_" .. ""] then
    state.difficulty = "Tactician"
  else
    state.difficulty = "Balanced"
  end

  -- Milestones (only include flags that are SET)
  state.milestones = {}
  for _, m in ipairs(MILESTONES) do
    if flagSet[m.flag] then
      state.milestones[#state.milestones + 1] = m.label
    end
  end

  -- All recruited companions (not just active party)
  state.companions = {}
  local teamOk, teamRows = pcall(function() return Osi.DB_PartOfTheTeam:Get(nil) end)
  if teamOk and teamRows then
    for _, r in ipairs(teamRows) do
      local name = "?"
      pcall(function() name = Ext.Entity.Get(r[1]).DisplayName.Name:Get() end)
      state.companions[#state.companions + 1] = name
    end
  end

  -- Illithid powers
  state.tadpolePowers = {}
  pcall(function()
    local e = Ext.Entity.Get(playerUUID)
    for _, p in ipairs(e.TadpolePowers.Powers or {}) do
      state.tadpolePowers[#state.tadpolePowers + 1] = tostring(p)
    end
  end)

  return state
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
