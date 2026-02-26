'use strict';

/* =================================================================
   TAV — BG3 Companion Tool
   Gear Finder / Party Advisor / Build Planner
   ================================================================= */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const state = {
  activeTab:     'gear',
  act:           1,    // single global act (replaces gearAct / partyAct / buildAct)
  stripActiveSlot: null, // index of strip slot whose popover is open
  creatorClass:  '',   // active class filter on Character Creator tab
  globalSearch:  '',   // search query for Global Search tab
  currentLevel:  1,    // active level in Level Tracker
  gear:          {},   // act (1|2|3) → GearItem[]
  builds:        [],   // Build[]
  companions:    [],   // Companion[]
  gameState:     null, // latest BG3SE game state snapshot (region, gold, milestones, etc.)
  filters: {
    slot:        '',
    search:      '',
    buildClass:  '',
    buildId:     '',
    hmOnly:      false,
  },
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RARITY_ORDER = { legendary: 0, very_rare: 1, rare: 2, uncommon: 3, common: 4 };

const SLOT_ORDER = [
  'helmet', 'armour', 'gloves', 'boots',
  'amulet', 'ring', 'weapon', 'ranged', 'shield', 'cloak',
];

const SLOT_ICONS = {
  helmet: '⛑',  armour: '🛡',  gloves: '🧤',
  boots:  '👢',  amulet: '📿',  ring:   '💍',
  weapon: '⚔',  ranged: '🏹',  shield: '🗡',  cloak:  '🪶',
};

const RARITY_LABELS = {
  common:    'Common',
  uncommon:  'Uncommon',
  rare:      'Rare',
  very_rare: 'Very Rare',
  legendary: 'Legendary',
};

const CLASS_KEYWORDS = {
  Barbarian: ['barbarian', 'berserker', 'wildheart', 'giant'],
  Bard:      ['bard', 'bardadin', 'bardlock', 'lorecerer', 'reverob', 'loredin'],
  Cleric:    ['cleric', 'blaster', 'radiating armored'],
  Druid:     ['druid', 'thundersnow', 'swarmkeeper'],
  Fighter:   ['fighter', 'eldritch knight', 'champion', 'battle master', '2hcb'],
  Monk:      ['monk', 'ninja'],
  Paladin:   ['paladin', 'lockadin', 'bardadin', 'sorcadin', 'loredin'],
  Ranger:    ['ranger', 'gloomstalker', 'beast master', 'selune', 'holy archer', 'arcane archer'],
  Rogue:     ['rogue', 'assassin', 'thief', 'arcane trickster', 'swashbuckler', 'gloom thief', 'jack sparrow'],
  Sorcerer:  ['sorcerer', 'sorcadin', 'sorlock', 'lorecerer', 'stormfrost', 'dragonling'],
  Warlock:   ['warlock', 'lockadin', 'hexblade', 'bladelock', 'bardlock', 'sorlock', 'hexknight', 'eldritch blast'],
  Wizard:    ['wizard', 'arcane defender', 'bladesinger', 'magic missile', 'necromancer'],
};

// Role each class naturally fills — used for party gap analysis
const CLASS_ROLES = {
  Barbarian: ['tank', 'striker'],
  Bard:      ['support', 'controller'],
  Cleric:    ['healer', 'support'],
  Druid:     ['healer', 'controller'],
  Fighter:   ['tank', 'striker'],
  Monk:      ['striker'],
  Paladin:   ['tank', 'striker'],
  Ranger:    ['striker'],
  Rogue:     ['striker'],
  Sorcerer:  ['blaster', 'controller'],
  Warlock:   ['blaster', 'striker'],
  Wizard:    ['blaster', 'controller'],
};

// Subclass-specific role overrides — nested under class to handle name collisions (e.g. Wild Magic)
// Falls back to CLASS_ROLES when subclass is not selected or not listed here
const SUBCLASS_ROLES = {
  Barbarian: {
    'Berserker':                ['tank', 'striker'],
    'Wildheart':                ['tank', 'striker'],
    'Wild Magic':               ['tank', 'striker', 'controller'],
    'Giant':                    ['tank', 'striker'],
  },
  Bard: {
    'College of Lore':          ['support', 'controller'],
    'College of Valour':        ['support', 'striker'],
    'College of Swords':        ['striker', 'support'],
  },
  Cleric: {
    'Life Domain':              ['healer', 'support'],
    'Light Domain':             ['healer', 'blaster'],
    'Trickery Domain':          ['support', 'controller'],
    'Knowledge Domain':         ['support'],
    'Nature Domain':            ['healer', 'controller'],
    'Tempest Domain':           ['blaster', 'healer'],
    'War Domain':               ['striker', 'support'],
    'Death Domain':             ['striker', 'blaster'],
  },
  Druid: {
    'Circle of the Land':       ['controller', 'support'],
    'Circle of the Moon':       ['tank', 'striker'],
    'Circle of Spores':         ['striker', 'controller'],
    'Circle of Stars':          ['healer', 'support'],
  },
  Fighter: {
    'Battle Master':            ['striker', 'controller'],
    'Champion':                 ['striker', 'tank'],
    'Eldritch Knight':          ['striker', 'tank'],
  },
  Monk: {
    'Way of the Open Hand':     ['striker'],
    'Way of Shadow':            ['striker', 'controller'],
    'Way of the Four Elements': ['striker', 'blaster'],
  },
  Paladin: {
    'Oath of Devotion':         ['tank', 'healer', 'support'],
    'Oath of the Ancients':     ['tank', 'healer', 'controller'],
    'Oath of Vengeance':        ['striker', 'tank'],
    'Oathbreaker':              ['striker', 'controller'],
    'Oath of the Crown':        ['tank', 'support'],
  },
  Ranger: {
    'Hunter':                   ['striker'],
    'Beast Master':             ['striker', 'support'],
    'Gloom Stalker':            ['striker'],
    'Swarmkeeper':              ['striker', 'controller'],
  },
  Rogue: {
    'Thief':                    ['striker'],
    'Arcane Trickster':         ['striker', 'controller'],
    'Assassin':                 ['striker'],
    'Swashbuckler':             ['striker'],
  },
  Sorcerer: {
    'Draconic Bloodline':       ['blaster'],
    'Wild Magic':               ['blaster', 'controller'],
    'Storm Sorcery':            ['blaster', 'controller'],
  },
  Warlock: {
    'The Fiend':                ['blaster', 'striker'],
    'The Great Old One':        ['controller', 'blaster'],
    'The Archfey':              ['controller', 'support'],
    'The Hexblade':             ['striker', 'controller'],
  },
  Wizard: {
    'Abjuration':               ['blaster', 'tank'],
    'Conjuration':              ['blaster', 'controller'],
    'Divination':               ['support', 'controller'],
    'Enchantment':              ['controller'],
    'Evocation':                ['blaster'],
    'Necromancy':               ['striker', 'controller'],
    'Transmutation':            ['support', 'controller'],
    'Bladesinging':             ['striker', 'blaster'],
  },
};

const TIER_ORDER = { 'S+': 0, S: 1, A: 2, B: 3, C: 4, Community: 5 };

const SUBCLASSES = {
  Barbarian: ['Berserker', 'Wildheart', 'Wild Magic', 'Giant'],
  Bard:      ['College of Lore', 'College of Valour', 'College of Swords'],
  Cleric:    ['Life Domain', 'Light Domain', 'Trickery Domain', 'Knowledge Domain', 'Nature Domain', 'Tempest Domain', 'War Domain', 'Death Domain'],
  Druid:     ['Circle of the Land', 'Circle of the Moon', 'Circle of Spores', 'Circle of Stars'],
  Fighter:   ['Battle Master', 'Champion', 'Eldritch Knight'],
  Monk:      ['Way of the Open Hand', 'Way of Shadow', 'Way of the Four Elements'],
  Paladin:   ['Oath of Devotion', 'Oath of the Ancients', 'Oath of Vengeance', 'Oathbreaker', 'Oath of the Crown'],
  Ranger:    ['Hunter', 'Beast Master', 'Gloom Stalker', 'Swarmkeeper'],
  Rogue:     ['Thief', 'Arcane Trickster', 'Assassin', 'Swashbuckler'],
  Sorcerer:  ['Draconic Bloodline', 'Wild Magic', 'Storm Sorcery'],
  Warlock:   ['The Fiend', 'The Great Old One', 'The Archfey', 'The Hexblade'],
  Wizard:    ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Necromancy', 'Transmutation', 'Bladesinging'],
};

const SUBCLASS_KEYWORDS = {
  'Berserker':                ['berserker'],
  'Wildheart':                ['wildheart'],
  'Wild Magic':               ['wild magic'],
  'Giant':                    ['giant'],
  'College of Lore':          ['lore bard', 'lorecerer', 'loredin', 'reverob'],
  'College of Valour':        ['valour', 'valor'],
  'College of Swords':        ['swords bard'],
  'Life Domain':              ['life'],
  'Light Domain':             ['light'],
  'Trickery Domain':          ['trickery'],
  'Knowledge Domain':         ['knowledge'],
  'Nature Domain':            ['nature'],
  'Tempest Domain':           ['tempest'],
  'War Domain':               ['war domain', 'war cleric'],
  'Death Domain':             ['death'],
  'Circle of the Land':       ['land druid'],
  'Circle of the Moon':       ['moon druid'],
  'Circle of Spores':         ['spore druid'],
  'Circle of Stars':          ['stars druid', 'stars-lore'],
  'Battle Master':            ['battle master'],
  'Champion':                 ['champion'],
  'Eldritch Knight':          ['eldritch knight'],
  'Way of the Open Hand':     ['open hand'],
  'Way of Shadow':            ['shadow monk'],
  'Way of the Four Elements': ['four elements'],
  'Oath of Devotion':         ['oath of devotion'],
  'Oath of the Ancients':     ['oath of ancients', 'ancients paladin'],
  'Oath of Vengeance':        ['oath of vengeance', 'vengeance paladin'],
  'Oathbreaker':              ['oathbreaker'],
  'Oath of the Crown':        ['crown paladin', 'oath of crown'],
  'Hunter':                   ['hunter ranger'],
  'Beast Master':             ['beast master'],
  'Gloom Stalker':            ['gloomstalker', 'gloom thief'],
  'Swarmkeeper':              ['swarmkeeper'],
  'Thief':                    ['thief'],
  'Arcane Trickster':         ['arcane trickster'],
  'Assassin':                 ['assassin', 'ninja'],
  'Swashbuckler':             ['swashbuckler', 'jack sparrow'],
  'Draconic Bloodline':       ['draconic', 'dragonling', 'stormfrost'],
  'Storm Sorcery':            ['storm sorcerer'],
  'The Fiend':                ['hexknight', 'bladelock', 'lockadin', 'sorlock', 'bardlock'],
  'The Great Old One':        ['great old one'],
  'The Archfey':              ['archfey'],
  'The Hexblade':             ['hexblade'],
  'Abjuration':               ['abjuration', 'arcane defender'],
  'Conjuration':              ['conjuration'],
  'Divination':               ['divination'],
  'Enchantment':              ['enchantment'],
  'Evocation':                ['evocation'],
  'Necromancy':               ['necromancer', 'necromancy'],
  'Transmutation':            ['transmutation'],
  'Bladesinging':             ['bladesinger', 'bladesinging'],
};

// ---------------------------------------------------------------------------
// Feature constants
// ---------------------------------------------------------------------------

const FEAT_LEVELS = [4, 8, 12];

const CONCENTRATION_SPELLS = new Set([
  'Bless', 'Bane', 'Command', 'Hex', "Hunter's Mark", 'Faerie Fire', 'Entangle',
  'Moonbeam', 'Silence', 'Blur', 'Invisibility', 'Darkness', 'Enhance Ability',
  'Hold Person', 'Hypnotic Pattern', 'Slow', 'Haste', 'Fear', 'Call Lightning',
  'Bestow Curse', 'Spirit Guardians', 'Hunger of Hadar', 'Greater Invisibility',
  'Banishment', 'Confusion', 'Polymorph', 'Hold Monster', 'Dominate Person',
  'Contagion', 'Cloudkill', 'Eyebite', 'Insect Plague',
]);

const ACT_CHECKLISTS = {
  1: [
    { id: 'rescue-halsin',   text: 'Rescue Halsin (unlocks Auntie Ethel event + camp healer)',                                          category: 'story' },
    { id: 'ethel-hair',      text: "Auntie Ethel's Hair — fight her to low HP in the lair, take her deal to spare her: +1 to any ability score (can exceed 20)", category: 'gear' },
    { id: 'loviatar',        text: "Loviatar's Love — Abdirak in Shattered Sanctum: submit to his ritual + pass the saves → +2 attack & Wisdom saves at ≤30% HP (lost on death)", category: 'gear' },
    { id: 'volos-eye',       text: "Volo's Ersatz Eye — rescue Volo from goblins (near Abdirak), let him operate at camp → permanent See Invisibility",           category: 'gear' },
    { id: 'omeluum',         text: "Survival Instinct — complete Omeluum's parasite quest in Underdark: drink his potion → psionic healing when you hit 0 HP",    category: 'quest' },
    { id: 'arcane-tower',    text: 'Arcane Tower — Guiding Light ring + basement loot',                                                                           category: 'gear' },
    { id: 'shadowheart',     text: 'Shadowheart approval: Sacred Idol choice (keep or destroy)',                                                                   category: 'companion' },
    { id: 'karlach',         text: "Karlach: don't kill the paladins, get her engine fixed",                                                                       category: 'companion' },
    { id: 'tiefling-party',  text: 'Tiefling party at camp (story lock — happens before Act 2)',                                                                   category: 'story' },
    { id: 'grym-forge',      text: 'Underdark: defeat Grym for Adamantine armour/shield',                                                                         category: 'gear' },
    { id: 'nere',            text: 'Grymforge: save the gnomes + kill True Soul Nere',                                                                            category: 'quest' },
    { id: 'gale-items',      text: 'Feed Gale magical items before leaving (he needs them regularly)',                                                             category: 'companion' },
    { id: 'owlbear',         text: 'Visit the Owlbear Nest — start the cub adoption chain',                                                                       category: 'story' },
    { id: 'necromancy',      text: "Find the Necromancy of Thay in the Apothecary's Cellar — read all 3 pages for Speak with Dead + +1 Wisdom saves",            category: 'gear' },
    { id: 'buy-supplies',    text: 'Stock up on scrolls, potions, and camp supplies before the pass',                                                             category: 'quest' },
  ],
  2: [
    { id: 'isobel',         text: 'Last Light Inn — save Isobel immediately (timed story lock)',            category: 'story' },
    { id: 'prisoners',      text: 'Moonrise Towers prison — save all prisoners before the assault',         category: 'story' },
    { id: 'gauntlet-shar',  text: 'Complete the Gauntlet of Shar before leaving Act 2',                    category: 'quest' },
    { id: 'jaheira-minsc',  text: 'Recruit Jaheira at Last Light; Minsc window opens later in Act 2',      category: 'companion' },
    { id: 'cloak-prot',     text: 'Cloak of Protection — merchant at Last Light Inn',                      category: 'gear' },
    { id: 'house-healing',  text: 'House of Healing — gear loot + complete quest',                         category: 'gear' },
    { id: 'nightsong',      text: "Decide Nightsong's fate at the end of Gauntlet of Shar",                category: 'story' },
    { id: 'balthazar',      text: "Balthazar's Lab in Moonrise — Enraptured Tadpole + gear",               category: 'gear' },
    { id: 'raphael',        text: "Raphael's deal at Last Light — weigh it carefully before refusing",      category: 'story' },
    { id: 'araj',           text: "Araj Oblodra's potion quest (Astarion approval gate)",                  category: 'companion' },
    { id: 'lathander-mace', text: 'Rosymorn Monastery: Dawnmaster Gish — Mace of Disruption',             category: 'gear' },
    { id: 'art-cullagh',    text: 'Save Art Cullagh at Last Light (opens Halsin content)',                  category: 'story' },
  ],
};

const CURRENT_LEVEL_KEY = 'tav_current_level';

// ---------------------------------------------------------------------------
// Character Profile (localStorage)
// ---------------------------------------------------------------------------

const PROFILE_KEY     = 'tav_profile';
const ACQUIRED_PREFIX  = 'tav_acquired_';
const WISHLIST_PREFIX  = 'tav_wishlist_';
const PARTY_KEY        = 'tav_party';

const SAVED_PARTIES_KEY = 'tav_saved_parties';
const GEAR_SLOTS = ['head','cloak','chest','hands','feet','neck','ring1','ring2','weapon','offhand','ranged','rangedoh'];
const GEAR_SLOT_LABELS = {
  head:'Head', cloak:'Cloak', chest:'Chest', hands:'Hands', feet:'Feet', neck:'Neck',
  ring1:'Ring 1', ring2:'Ring 2', weapon:'Weapon', offhand:'Offhand',
  ranged:'Ranged', rangedoh:'Ranged OH',
};

function saveProfile(build) {
  // Detect which subclass (within the saved class) matches this build
  const className = state.creatorClass || '';
  const subclasses = SUBCLASSES[className] || [];
  const buildKey = (build.id + ' ' + build.name).toLowerCase();
  const detectedSubclass = subclasses.find(sub => {
    const kws = SUBCLASS_KEYWORDS[sub] || [sub.toLowerCase()];
    return kws.some(kw => buildKey.includes(kw));
  }) || '';

  const profile = {
    buildId:   build.id,
    buildName: build.name,
    tier:      build.tier || '',
    className,
    subclass:  detectedSubclass,
    savedAt:   new Date().toISOString(),
  };
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  return profile;
}

function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function deleteProfile() {
  const profile = loadProfile();
  if (profile) {
    localStorage.removeItem(ACQUIRED_PREFIX + profile.buildId);
    localStorage.removeItem(WISHLIST_PREFIX + profile.buildId);
  }
  localStorage.removeItem(PROFILE_KEY);
}

function saveCurrentLevel(level) {
  localStorage.setItem(CURRENT_LEVEL_KEY, String(level));
}

function loadCurrentLevel() {
  const raw = localStorage.getItem(CURRENT_LEVEL_KEY);
  return raw ? parseInt(raw, 10) : 1;
}

function loadAcquired(buildId) {
  try {
    const raw = localStorage.getItem(ACQUIRED_PREFIX + buildId);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveAcquired(buildId, set) {
  localStorage.setItem(ACQUIRED_PREFIX + buildId, JSON.stringify([...set]));
}

function toggleAcquired(buildId, itemName) {
  const set = loadAcquired(buildId);
  if (set.has(itemName)) set.delete(itemName); else set.add(itemName);
  saveAcquired(buildId, set);
  return set;
}

function loadWishlist(buildId) {
  try {
    const raw = localStorage.getItem(WISHLIST_PREFIX + buildId);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveWishlist(buildId, set) {
  localStorage.setItem(WISHLIST_PREFIX + buildId, JSON.stringify([...set]));
}

function toggleWishlist(buildId, itemName) {
  const set = loadWishlist(buildId);
  if (set.has(itemName)) set.delete(itemName); else set.add(itemName);
  saveWishlist(buildId, set);
  return set;
}

// ---------------------------------------------------------------------------
// Party storage
// ---------------------------------------------------------------------------

function saveParty() {
  const existing = loadParty();
  const rows = [...document.querySelectorAll('.party-row')];
  const slots = rows.map((row, i) => {
    const prev    = existing?.slots?.[i] || {};
    const cls     = row.querySelector('.party-class')?.value || '';
    const sub     = row.querySelector('.party-subclass')?.value || '';
    const buildId = row.querySelector('.party-build')?.value || '';
    const build   = buildId ? state.builds.find(b => b.id === buildId) : null;
    const gear = {};
    GEAR_SLOTS.forEach(s => {
      gear[s] = row.querySelector(`.gear-input[data-slot="${s}"]`)?.value.trim() || '';
    });
    const split = row.querySelector('.gear-split-input')?.value.trim() || '';
    return { ...prev, className: cls, subclass: sub, buildId, buildName: build?.name || '', gear, split };
  });
  localStorage.setItem(PARTY_KEY, JSON.stringify({ slots }));
  renderPartyStrip();
}

function loadParty() {
  try {
    const raw = localStorage.getItem(PARTY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function deleteParty() {
  localStorage.removeItem(PARTY_KEY);
}

// ---------------------------------------------------------------------------
// Named saved parties
// ---------------------------------------------------------------------------

function loadSavedParties() {
  try {
    const raw = localStorage.getItem(SAVED_PARTIES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function snapshotPartyState() {
  const rows = [...document.querySelectorAll('.party-row')];
  const slots = rows.map(row => {
    const cls     = row.querySelector('.party-class')?.value || '';
    const sub     = row.querySelector('.party-subclass')?.value || '';
    const buildId = row.querySelector('.party-build')?.value || '';
    const build   = buildId ? state.builds.find(b => b.id === buildId) : null;
    const gear = {};
    GEAR_SLOTS.forEach(s => {
      gear[s] = row.querySelector(`.gear-input[data-slot="${s}"]`)?.value.trim() || '';
    });
    const split = row.querySelector('.gear-split-input')?.value.trim() || '';
    return { className: cls, subclass: sub, buildId, buildName: build?.name || '', gear, split };
  });
  return { slots, act: state.act, notes: document.getElementById('party-notes')?.value.trim() || '' };
}

function savePartyAs(name) {
  const parties = loadSavedParties();
  const snapshot = snapshotPartyState();
  parties.push({ id: Date.now().toString(), name: name || 'Party ' + (parties.length + 1), savedAt: new Date().toISOString(), ...snapshot });
  localStorage.setItem(SAVED_PARTIES_KEY, JSON.stringify(parties));
  renderSavedPartiesList();
}

function deleteSavedPartyById(id) {
  const parties = loadSavedParties().filter(p => p.id !== id);
  localStorage.setItem(SAVED_PARTIES_KEY, JSON.stringify(parties));
  renderSavedPartiesList();
}

function applyPartySnapshot(party) {
  const rows = [...document.querySelectorAll('.party-row')];
  if (party.act) { state.act = party.act; syncActButtons('strip', party.act); }
  const notesEl = document.getElementById('party-notes');
  if (notesEl && party.notes !== undefined) notesEl.value = party.notes;

  party.slots.forEach((slot, i) => {
    const row = rows[i];
    if (!row) return;
    const clsSel   = row.querySelector('.party-class');
    const subSel   = row.querySelector('.party-subclass');
    const buildSel = row.querySelector('.party-build');

    if (clsSel) clsSel.value = '';
    if (subSel) { while (subSel.options.length) subSel.remove(0); subSel.add(new Option('Subclass…', '')); subSel.disabled = true; }
    if (buildSel) { while (buildSel.options.length) buildSel.remove(0); buildSel.add(new Option('Build (optional)…', '')); buildSel.disabled = true; }

    if (slot.className && clsSel) {
      clsSel.value = slot.className;
      populateSubclassSelect(subSel, slot.className);
      if (slot.subclass) subSel.value = slot.subclass;
      populatePartyBuildSelect(buildSel, slot.className);
      if (slot.buildId) buildSel.value = slot.buildId;
    }
    if (slot.gear) {
      GEAR_SLOTS.forEach(s => {
        const inp = row.querySelector(`.gear-input[data-slot="${s}"]`);
        if (inp) inp.value = slot.gear[s] || '';
      });
    }
    const splitInp = row.querySelector('.gear-split-input');
    if (splitInp) splitInp.value = slot.split || '';
  });
  // Caller is responsible for calling saveParty() if the loaded snapshot should
  // become the active party in Build Planner — avoids silent overwrites.
}

function renderSavedPartiesList() {
  const list = document.getElementById('saved-parties-list');
  if (!list) return;
  while (list.firstChild) list.removeChild(list.firstChild);

  const parties = loadSavedParties();
  if (!parties.length) {
    const empty = document.createElement('p');
    empty.className = 'saved-parties-empty';
    empty.textContent = 'No saved parties yet.';
    list.appendChild(empty);
    return;
  }

  parties.forEach(p => {
    const dateStr = new Date(p.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const item    = document.createElement('div');
    item.className = 'saved-party-item';

    const nameEl  = document.createElement('span');
    nameEl.className = 'saved-party-name';
    nameEl.textContent = p.name;

    const dateEl  = document.createElement('span');
    dateEl.className = 'saved-party-date';
    dateEl.textContent = dateStr;

    const loadBtn = document.createElement('button');
    loadBtn.className = 'saved-party-load cta-btn cta-btn--secondary';
    loadBtn.textContent = 'Load';
    loadBtn.addEventListener('click', () => {
      const saved = loadSavedParties().find(s => s.id === p.id);
      if (saved) loadBuilds().then(() => { applyPartySnapshot(saved); saveParty(); });
    });

    const delBtn  = document.createElement('button');
    delBtn.className = 'saved-party-delete';
    delBtn.setAttribute('aria-label', 'Delete');
    delBtn.textContent = '×';
    delBtn.addEventListener('click', () => {
      if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
      deleteSavedPartyById(p.id);
    });

    item.appendChild(nameEl);
    item.appendChild(dateEl);
    item.appendChild(loadBtn);
    item.appendChild(delBtn);
    list.appendChild(item);
  });
}

// ---------------------------------------------------------------------------
// Populate a subclass <select> for the given class using safe DOM methods
function populateSubclassSelect(selectEl, className) {
  const subs = SUBCLASSES[className] || [];
  while (selectEl.options.length) selectEl.remove(0);
  selectEl.add(new Option('Any subclass', ''));
  subs.forEach(s => selectEl.add(new Option(s, s)));
  selectEl.disabled = false;
}

function populatePartyBuildSelect(buildSel, className) {
  while (buildSel.options.length) buildSel.remove(0);
  buildSel.add(new Option('Build (optional)…', ''));
  if (!className || !state.builds.length) { buildSel.disabled = true; return; }
  const builds = buildsForClass(className)
    .sort((a, b) => (TIER_ORDER[a.tier] ?? 99) - (TIER_ORDER[b.tier] ?? 99));
  builds.forEach(b => buildSel.add(new Option(`[${b.tier}] ${b.name}`, b.id)));
  buildSel.disabled = builds.length === 0;
}

// Infer which roles a build fills by matching its name against CLASS_KEYWORDS → SUBCLASS_ROLES (preferred) or CLASS_ROLES
function rolesForBuild(build) {
  const key = (build.id + ' ' + build.name).toLowerCase();
  const roles = new Set();
  for (const [cls, keywords] of Object.entries(CLASS_KEYWORDS)) {
    if (!keywords.some(kw => key.includes(kw))) continue;
    // Try to find a matching subclass — more specific than class-level
    const subclasses = SUBCLASSES[cls] || [];
    const matchedSub = subclasses.find(sub => {
      const kws = SUBCLASS_KEYWORDS[sub] || [sub.toLowerCase()];
      return kws.some(kw => key.includes(kw));
    });
    const subRoles = matchedSub ? (SUBCLASS_ROLES[cls]?.[matchedSub] || null) : null;
    (subRoles || CLASS_ROLES[cls] || []).forEach(r => roles.add(r));
  }
  return [...roles];
}

// Return class names that match a build's name (for overlap detection)
function classesForBuild(build) {
  const name = build.name.toLowerCase();
  return Object.entries(CLASS_KEYWORDS)
    .filter(([, keywords]) => keywords.some(kw => name.includes(kw)))
    .map(([cls]) => cls);
}

// Return class names that match a free-text party input
function classesForText(text) {
  const lower = text.toLowerCase();
  const matched = new Set();
  for (const [cls, keywords] of Object.entries(CLASS_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) matched.add(cls);
  }
  return [...matched];
}

// Builds survivable enough for Honor Mode.
// Criteria: d10+ HP class OR heavy/medium armor + shield OR built-in mitigation.
const HM_SAFE_BUILDS = new Set([
  'lockadin','bardadin','sorcadin','loredin','shadow-blade-bardadin',
  'oathbreaker-paladin','oath-of-devotion-paladin','oath-of-ancients-paladin',
  'oath-of-the-crown-paladin','oath-of-vengeance-paladin',
  'battle-master-fighter','champion-fighter','eldritch-knight-thrower','two-hander-eldritch-knight',
  'berserker-thrower','giant-barbarian','wildheart-tiger-barbarian',
  'blaster-cleric','light-domain-cleric','tempest-domain-cleric','stars-cleric',
  'life-domain-cleric','war-domain-cleric','knowledge-cleric','nature-cleric','death-cleric',
  'moon-druid','land-druid',
  'abjuration-arcane-defender',
  'hunter-ranger-archer',
  'swords-bard-archer','lore-bard','valour-bard',
  'radiating-armored-monk',
]);

// Story progression order for Act 1 areas (lower = earlier in playthrough)
const AREA_ORDER = {
  'Ravaged Beach': 1, 'Dank Crypt': 1, 'Chapel': 1, 'Roadside Cliffs': 1, 'Wilderness': 1,
  'The Risen Road': 1, "Waukeen's Rest": 1, 'Underground Passage': 1,
  'Emerald Grove': 2, 'Sacred Pool': 2, 'Forest': 2, 'The Hollow': 2, 'Tiefling Hideout': 2,
  'Owlbear Nest': 3, 'Abandoned Windmill': 3, 'Secluded Cove': 3,
  'Blighted Village': 4, 'Whispering Depths': 4, "Apothecary's Cellar": 4, 'Overgrown Tunnel': 4,
  'Goblin Camp': 5, 'Shattered Sanctum': 5, 'Defiled Temple': 5, 'Worg Pens': 5,
  'Sunlit Wetlands': 6, 'Putrid Bog': 6, 'Campsite (Act One)': 6, 'Jungle': 6,
  "Crèche Y'llek": 7, 'Githyanki Patrol': 7, 'Rosymorn Monastery': 7, 'Rosymorn Monastery Trail': 7,
  'Selûnite Outpost': 8, 'Underdark': 8,
  'Myconid Colony': 9, 'Ebonlake Grotto': 9,
  'Arcane Tower': 10, 'Decrepit Sanctuary': 10,
  'Grymforge': 11, 'Adamantine Forge': 11, 'Adamantine Forge (location)': 11, 'Inner Sanctum': 11,
  'Mountain Pass': 12, 'Abandoned Refuge': 12,
};

const ALL_ROLES = ['healer', 'tank', 'striker', 'blaster', 'controller', 'support'];

function buildsForClass(className) {
  const kws = CLASS_KEYWORDS[className] || [className.toLowerCase()];
  return state.builds.filter(b => kws.some(kw => b.name.toLowerCase().includes(kw)));
}

// ---------------------------------------------------------------------------
// Security: escape HTML before rendering scraped content
// ---------------------------------------------------------------------------

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ESC_MAP[c]);
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadActGear(act) {
  if (state.gear[act] !== undefined) return state.gear[act];
  try {
    const res = await fetch(`data/gear/act${act}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.gear[act] = await res.json();
  } catch (err) {
    console.warn(`Gear Act ${act}:`, err.message);
    state.gear[act] = [];
  }
  return state.gear[act];
}

async function loadBuilds() {
  if (state.builds.length) return state.builds;
  try {
    const [r1, r2] = await Promise.all([
      fetch('data/builds.json'),
      fetch('data/community_builds.json'),
    ]);
    const [gamestegy, community] = await Promise.all([r1.json(), r2.json()]);
    state.builds = [...gamestegy, ...community];
  } catch {
    state.builds = [];
  }
  return state.builds;
}

async function loadCompanions() {
  if (state.companions.length) return state.companions;
  try {
    const res = await fetch('data/companions.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.companions = await res.json();
  } catch {
    state.companions = [];
  }
  return state.companions;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

async function copyToClipboard(text, btn) {
  const original = btn.textContent;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for file:// or restricted contexts
    const ta = Object.assign(document.createElement('textarea'), {
      value: text,
      style: 'position:fixed;opacity:0',
    });
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
  btn.textContent = '✓ Copied!';
  btn.classList.add('copied');
  setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove('copied');
  }, 2000);
}

// ---------------------------------------------------------------------------
// Gear Finder — filter + render
// ---------------------------------------------------------------------------

function filterGear(items) {
  const { slot, search, buildClass, buildId } = state.filters;
  return items.filter(item => {
    if (slot && item.slot !== slot) return false;
    if (search) {
      const q = search.toLowerCase();
      const inName    = item.name.toLowerCase().includes(q);
      const inEffects = item.effects?.some(e => e.toLowerCase().includes(q));
      if (!inName && !inEffects) return false;
    }
    if (buildId) {
      if (!item.build_tags?.includes(buildId)) return false;
    } else if (buildClass && state.builds.length) {
      const ids = new Set(buildsForClass(buildClass).map(b => b.id));
      if (!item.build_tags?.some(t => ids.has(t))) return false;
    }
    return true;
  });
}

function populateGearBuildSelect(className) {
  const sel = document.getElementById('build-filter');
  if (!sel) return;
  while (sel.options.length) sel.remove(0);
  sel.add(new Option('All Builds', ''));
  if (!className || !state.builds.length) { sel.disabled = true; return; }
  const builds = buildsForClass(className)
    .sort((a, b) => (TIER_ORDER[a.tier] ?? 99) - (TIER_ORDER[b.tier] ?? 99));
  builds.forEach(b => sel.add(new Option(`[${b.tier}] ${b.name}`, b.id)));
  sel.disabled = builds.length === 0;
}

function groupBySlot(items) {
  const groups = {};
  for (const item of items) {
    (groups[item.slot] = groups[item.slot] || []).push(item);
  }
  for (const slot of Object.keys(groups)) {
    groups[slot].sort((a, b) =>
      (RARITY_ORDER[a.rarity] ?? 99) - (RARITY_ORDER[b.rarity] ?? 99)
    );
  }
  return groups;
}

function gearCardHTML(item, isAcquired = false, isWishlisted = false, hasProfile = false) {
  const rarity      = item.rarity || 'common';
  const rarityLabel = RARITY_LABELS[rarity] || capitalize(rarity);

  const effectsHTML = (item.effects || []).slice(0, 3)
    .map(e => `<li>${esc(e)}</li>`).join('');
  const moreHTML = item.effects?.length > 3
    ? `<li class="gear-effects__more">+${item.effects.length - 3} more</li>`
    : '';

  const locationHTML = item.location?.description
    ? `<p class="gear-location">⟡ ${esc(item.location.description)}</p>`
    : '';

  const tagsHTML = item.build_tags?.length
    ? `<div class="gear-tags">${item.build_tags.slice(0, 5).map(t =>
        `<span class="gear-tag">${esc(t)}</span>`).join('')}</div>`
    : '<div></div>';

  const wikiHTML = item.wiki_url
    ? `<a class="gear-wiki-link" href="${esc(item.wiki_url)}" target="_blank" rel="noopener noreferrer">wiki ↗</a>`
    : '';

  const acquiredClass    = isAcquired ? ' gear-card--acquired' : '';
  const acquiredBtnTxt   = isAcquired ? '✓' : '○';
  const acquiredBtnTitle = isAcquired ? 'Mark as needed' : 'Mark as acquired';

  const wishlistDisabled = hasProfile ? '' : ' disabled';
  const wishlistTitle    = hasProfile
    ? (isWishlisted ? 'Remove from wishlist' : 'Add to wishlist')
    : 'Set an active character first';
  const wishlistClass = isWishlisted ? ' wishlisted' : '';
  const heartHTML = `<button class="gear-wishlist-btn${wishlistClass}" data-name="${esc(item.name)}" title="${esc(wishlistTitle)}"${wishlistDisabled}>${isWishlisted ? '♥' : '♡'}</button>`;

  return `
    <article class="gear-card gear-card--${esc(rarity)}${acquiredClass}" data-item-name="${esc(item.name)}">
      <header class="gear-card__header">
        <span class="gear-card__name">${esc(item.name)}</span>
        <span class="gear-card__rarity rarity-${esc(rarity)}">${esc(rarityLabel)}</span>
        <button class="gear-acquired-btn" data-name="${esc(item.name)}" title="${acquiredBtnTitle}">${acquiredBtnTxt}</button>
      </header>
      <ul class="gear-effects">${effectsHTML}${moreHTML}</ul>
      ${locationHTML}
      <footer class="gear-card__footer">
        ${tagsHTML}
        ${wikiHTML}
        ${heartHTML}
      </footer>
    </article>`;
}

async function renderGearResults() {
  const container = document.getElementById('gear-results');
  container.innerHTML = '<div class="loading">Consulting the vaults…</div>';

  const [items] = await Promise.all([loadActGear(state.act), loadBuilds()]);
  const filtered = filterGear(items);

  if (!items.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__rune">⚔</div>
        <p class="empty-state__text">No gear data yet for Act ${state.act}</p>
        <p class="empty-state__hint">The scraper is still running — refresh in a few minutes.</p>
      </div>`;
    return;
  }

  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__rune">🔍</div>
        <p class="empty-state__text">Nothing matched those filters.</p>
        <p class="empty-state__hint">Try broadening your search.</p>
      </div>`;
    return;
  }

  const gProfile  = loadProfile();
  const gBuildId  = gProfile?.buildId || null;
  const gAcquired = gBuildId ? loadAcquired(gBuildId) : new Set();
  const gWishlist = gBuildId ? loadWishlist(gBuildId) : new Set();

  const groups = groupBySlot(filtered);
  const html = SLOT_ORDER
    .filter(slot => groups[slot]?.length)
    .map(slot => `
      <section class="slot-section">
        <h3 class="slot-title">
          <span class="slot-icon">${SLOT_ICONS[slot] || ''}</span>
          ${capitalize(slot)}
          <span class="slot-count">${groups[slot].length}</span>
        </h3>
        <div class="slot-cards">
          ${groups[slot].map(item => gearCardHTML(item, gAcquired.has(item.name), gWishlist.has(item.name), !!gBuildId)).join('')}
        </div>
      </section>`)
    .join('');

  container.innerHTML = html;

  // Wire acquired toggle buttons
  if (gBuildId) {
    container.querySelectorAll('.gear-acquired-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const name = btn.dataset.name;
        const newSet = toggleAcquired(gBuildId, name);
        const isNow = newSet.has(name);
        btn.textContent = isNow ? '✓' : '○';
        btn.title = isNow ? 'Mark as needed' : 'Mark as acquired';
        const card = btn.closest('.gear-card');
        if (card) card.classList.toggle('gear-card--acquired', isNow);
      });
    });

    // Wire wishlist heart buttons
    container.querySelectorAll('.gear-wishlist-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const name = btn.dataset.name;
        const newSet = toggleWishlist(gBuildId, name);
        const isNow = newSet.has(name);
        btn.textContent = isNow ? '\u2665' : '\u2661';
        btn.title = isNow ? 'Remove from wishlist' : 'Add to wishlist';
        btn.classList.toggle('wishlisted', isNow);
        renderWishlistPanel();
      });
    });
  }
}

// ---------------------------------------------------------------------------
// Party Advisor — role gap analysis + prompt generation
// ---------------------------------------------------------------------------

function parsePartyMember(text) {
  if (!text) return null;
  const lower = text.toLowerCase().trim();

  // Check companion keywords first
  for (const companion of state.companions) {
    if (companion.keywords.some(kw => lower.includes(kw))) {
      return { roles: companion.roles, companionId: companion.id, companionName: companion.name };
    }
  }

  // Check class keywords — union roles for multiclass inputs
  const matchedRoles = new Set();
  for (const [cls, keywords] of Object.entries(CLASS_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      (CLASS_ROLES[cls] || []).forEach(r => matchedRoles.add(r));
    }
  }

  if (matchedRoles.size > 0) {
    return { roles: [...matchedRoles] };
  }

  return null;
}

function partyMemberLabel(row) {
  const buildId = row.querySelector('.party-build')?.value || '';
  if (buildId) {
    const build = state.builds.find(b => b.id === buildId);
    if (build) return build.name;
  }
  const cls   = row.querySelector('.party-class')?.value.trim() ?? '';
  const sub   = row.querySelector('.party-subclass')?.value.trim() ?? '';
  const split = row.querySelector('.gear-split-input')?.value.trim() ?? '';
  const base  = cls ? (sub ? `${sub} ${cls}` : cls) : '';
  return base && split ? `${base} (${split})` : base;
}

function analyzeParty() {
  const rows = [...document.querySelectorAll('.party-row')];

  const members = rows.map(row => {
    const buildId = row.querySelector('.party-build')?.value || '';
    if (buildId) {
      const build = state.builds.find(b => b.id === buildId);
      if (build) return { roles: rolesForBuild(build) };
    }
    const cls = row.querySelector('.party-class')?.value.trim() ?? '';
    const sub = row.querySelector('.party-subclass')?.value.trim() ?? '';
    if (!cls) return null;
    const roles = SUBCLASS_ROLES[cls]?.[sub] || CLASS_ROLES[cls] || [];
    return roles.length ? { roles } : null;
  }).filter(Boolean);

  if (members.length === 0) return { empty: true };

  const coveredRoles    = new Set(members.flatMap(m => m.roles));
  const missingRoles    = ALL_ROLES.filter(r => !coveredRoles.has(r));
  const criticalMissing = missingRoles.filter(r => r === 'healer' || r === 'tank');

  // Read class names directly — no keyword parsing needed
  const partyClasses = new Set(
    rows.map(row => row.querySelector('.party-class')?.value.trim()).filter(Boolean)
  );

  const allCandidates = state.builds
    .map(b => ({
      ...b,
      buildRoles:    rolesForBuild(b),
      overlapsParty: classesForBuild(b).some(cls => partyClasses.has(cls)),
    }))
    .filter(b => b.buildRoles.some(r => missingRoles.includes(r)))
    .sort((a, b) => {
      // Critical gap fills (healer/tank) always rank above non-critical
      const aCrit = a.buildRoles.some(r => criticalMissing.includes(r));
      const bCrit = b.buildRoles.some(r => criticalMissing.includes(r));
      if (aCrit !== bCrit) return aCrit ? -1 : 1;
      // Then tier
      const tierDiff = (TIER_ORDER[a.tier] ?? 99) - (TIER_ORDER[b.tier] ?? 99);
      if (tierDiff !== 0) return tierDiff;
      // Within same tier: non-overlapping builds first
      return (a.overlapsParty ? 1 : 0) - (b.overlapsParty ? 1 : 0);
    });

  // Cap per gap role so one gap type doesn't flood the list (max 3 per role)
  const roleCounts = {};
  const buildSuggestions = allCandidates.filter(b => {
    const filledGaps = b.buildRoles.filter(r => missingRoles.includes(r));
    const primaryRole = filledGaps.find(r => criticalMissing.includes(r)) || filledGaps[0];
    roleCounts[primaryRole] = (roleCounts[primaryRole] || 0) + 1;
    return roleCounts[primaryRole] <= 3;
  }).slice(0, 9);

  return { members, coveredRoles, missingRoles, criticalMissing, buildSuggestions };
}

function renderPartyAnalysis(result) {
  const container = document.getElementById('party-analysis');

  if (result.empty) {
    container.innerHTML = '<p class="party-analysis__section-title">Enter at least one party member above.</p>';
    return;
  }

  const chipClass = role => {
    if (result.criticalMissing.includes(role)) return 'role-chip--critical';
    if (result.coveredRoles.has(role)) return 'role-chip--covered';
    return 'role-chip--missing';
  };

  const chipsHTML = ALL_ROLES.map(role =>
    `<span class="role-chip ${esc(chipClass(role))}">${esc(role)}</span>`
  ).join('');

  let gapHTML;
  if (result.missingRoles.length === 0) {
    gapHTML = '<p class="sidebar-hint">Party looks balanced!</p>';
  } else if (!result.buildSuggestions.length) {
    gapHTML = '<p class="sidebar-hint">No matching builds — make sure build data is loaded.</p>';
  } else {
    const note = '<p class="sidebar-hint respec-note">Any companion can fill these via free Withers respec.</p>';
    const buildLinks = result.buildSuggestions.map(b => {
      const tierClass = esc(b.tier?.replace('+', 'plus') ?? '');
      const url       = esc(b.source_url ?? '#');
      const tier      = esc(b.tier ?? '');
      const name      = esc(b.name ?? '');
      const fills     = b.buildRoles.filter(r => result.missingRoles.includes(r)).map(esc).join(', ');
      const overlap   = b.overlapsParty ? '<span class="build-template__overlap" title="Shares a class with your current party">class overlap</span>' : '';
      return `<a class="build-template" href="${url}" target="_blank" rel="noopener noreferrer"><span class="build-template__tier tier-${tierClass}">${tier}</span><span class="build-template__name">${name}</span><span class="build-template__fills">fills: ${fills}</span>${overlap}</a>`;
    }).join('');
    gapHTML = note + buildLinks;
  }

  const legend = `<p class="role-legend"><span class="role-legend__item role-legend__item--covered">covered</span><span class="role-legend__item role-legend__item--critical">critical gap</span><span class="role-legend__item role-legend__item--missing">minor gap</span></p>`;
  const html = `<p class="party-analysis__section-title">Role Coverage</p>${legend}<div class="role-grid">${chipsHTML}</div><div class="companion-suggestions"><p class="party-analysis__section-title">Fill the Gap</p>${gapHTML}</div>`;
  container.innerHTML = html;
}

// ---------------------------------------------------------------------------
// Game State block for copy prompts — compact summary of live game data
// ---------------------------------------------------------------------------

const REGION_LABELS = {
  TUT_Avernus_C: 'Nautiloid',    WLD_Main_A: 'Wilderness',
  CRE_Main_A: 'Rosymorn Monastery', SCL_Main_A: 'Shadow-Cursed Lands',
  INT_Main_A: 'Moonrise Towers', BGO_Main_A: 'Rivington',
  CTY_Main_A: 'Lower City',     END_Main_A: 'High Hall',
};

function gameStateBlock() {
  const gs = state.gameState;
  if (!gs) return '';

  const lines = [];

  // Region + Act + Gold
  const region = gs.region || REGION_LABELS[gs.regionId] || gs.regionId || '';
  const act = gs.act || state.act;
  const header = [`Act ${act}`];
  if (region) header.push(region);
  if (gs.gold != null) header.push(`${gs.gold}g`);
  lines.push(`Game state: ${header.join(' — ')}`);

  // Per-member stats from saved party data (abilities + XP)
  const saved = loadParty();
  if (saved?.slots) {
    const memberLines = saved.slots
      .filter(s => s?.className)
      .map(s => {
        const name = s.charName || '';
        const split = s.split || s.className;
        const parts = [name, split].filter(Boolean).join(', ');
        const ab = s.abilities;
        const abStr = ab ? ` [${ab.Strength}/${ab.Dexterity}/${ab.Constitution}/${ab.Intelligence}/${ab.Wisdom}/${ab.Charisma}]` : '';
        const xp = s.experience?.total;
        const xpStr = xp != null ? ` XP:${xp}` : '';
        return `  ${parts}${abStr}${xpStr}`;
      });
    if (memberLines.length) {
      lines.push('Party stats (STR/DEX/CON/INT/WIS/CHA):');
      lines.push(...memberLines);
    }
  }

  // Companions at camp
  if (gs.companions?.length) {
    lines.push(`Recruited: ${gs.companions.join(', ')}`);
  }

  // Milestones
  if (gs.milestones?.length) {
    lines.push(`Progress: ${gs.milestones.join(', ')}`);
  }

  // Illithid powers
  if (gs.tadpolePowers?.length) {
    lines.push(`Illithid powers: ${gs.tadpolePowers.join(', ')}`);
  }

  return lines.join('\n');
}

function generatePartyPrompt() {
  const rows          = [...document.querySelectorAll('.party-row')];
  const labels        = rows.map(partyMemberLabel);
  const [you, a1, a2, a3] = labels;
  const act           = state.act;
  const notes         = document.getElementById('party-notes').value.trim();

  const allyLines = [a1, a2, a3]
    .filter(Boolean)
    .map((a, i) => `- Ally ${i + 1}: ${a}`)
    .join('\n');

  const gsBlock = gameStateBlock();

  return [
    `I'm in Act ${act} of BG3 and need party composition advice.`,
    '',
    gsBlock || null,
    gsBlock ? '' : null,
    `My character: ${you || '[not specified — suggest something]'}`,
    allyLines ? `My party:\n${allyLines}` : 'Rest of party: not specified.',
    notes ? `\nContext: ${notes}` : '',
    '',
    `What roles is my party weak on? What class/subclass best fills the gap for Act ${act}?`,
    `Be specific about BG3 mechanics — cite spells, class features, and Act ${act} gear where relevant.`,
  ].filter(l => l !== null && l !== undefined).join('\n').trim();
}

// ---------------------------------------------------------------------------
// Gear Snapshot prompt
// ---------------------------------------------------------------------------

function generateGearPrompt() {
  const rows = [...document.querySelectorAll('.party-row')];
  const ROW_LABELS = ['You', 'Ally 1', 'Ally 2', 'Ally 3'];
  const act = state.act;
  const actLabel = act === 1 ? 'I' : act === 2 ? 'II' : 'III';

  const memberBlocks = rows.map((row, i) => {
    const cls     = row.querySelector('.party-class')?.value || '';
    const sub     = row.querySelector('.party-subclass')?.value || '';
    const buildId = row.querySelector('.party-build')?.value || '';
    const build   = buildId ? state.builds.find(b => b.id === buildId) : null;
    if (!cls) return null;

    const split  = row.querySelector('.gear-split-input')?.value.trim() || '';
    const identity = [build ? build.name : null, cls, sub ? `(${sub})` : null]
      .filter(Boolean).join(' ');
    const splitTag = split ? ` — currently ${split}` : '';

    const slotLines = GEAR_SLOTS.map(s => {
      const val = row.querySelector(`.gear-input[data-slot="${s}"]`)?.value.trim() || '';
      return `  ${GEAR_SLOT_LABELS[s]}: ${val || '(empty)'}`;
    }).join('\n');

    const open = GEAR_SLOTS
      .filter(s => !(row.querySelector(`.gear-input[data-slot="${s}"]`)?.value.trim()))
      .map(s => GEAR_SLOT_LABELS[s]);

    return `${ROW_LABELS[i]}: ${identity}${splitTag}\n${slotLines}${open.length ? `\n  Open: ${open.join(', ')}` : ''}`;
  }).filter(Boolean);

  if (!memberBlocks.length) return 'No party configured. Fill out the Party tab first.';

  const notes = document.getElementById('party-notes').value.trim();

  const gsBlock = gameStateBlock();

  return [
    `Party Gear Snapshot — Act ${actLabel}`,
    '',
    gsBlock || null,
    gsBlock ? '' : null,
    memberBlocks.join('\n\n'),
    notes ? `\nContext: ${notes}` : '',
    '',
    `Help me optimize gear distribution across my party for Act ${act}.`,
    `Flag open slots to prioritize, call out any swaps where a party member would benefit more from something someone else is wearing, and suggest Act ${act} upgrades I might be missing.`,
    `Stick to Act ${act} gear unless I ask otherwise.`,
  ].filter(l => l !== null && l !== undefined).join('\n').trim();
}

// ---------------------------------------------------------------------------
// Game Sync — fetch party gear from BG3SE sync server
// ---------------------------------------------------------------------------

// Maps BG3 internal slot names to our GEAR_SLOTS keys
const BG3_SLOT_MAP = {
  head: 'head', cloak: 'cloak', chest: 'chest', hands: 'hands',
  feet: 'feet', neck: 'neck', ring1: 'ring1', ring2: 'ring2',
  weapon: 'weapon', offhand: 'offhand', ranged: 'ranged', rangedoh: 'rangedoh',
};

function processSyncData(data, showSyncMsg) {
  if (!data.members || !data.members.length) {
    showSyncMsg('No party data in sync file — make sure TavSync mod is installed and you\'ve saved at least once.');
    return;
  }

  applyGameSync(data.members);

  // Store game state snapshot (v4+)
  if (data.gameState) {
    state.gameState = data.gameState;
    if (data.gameState.act) {
      state.act = data.gameState.act;
      syncActButtons('strip', data.gameState.act);
    }
  }

  renderPartyStrip();
  const gsInfo = data.gameState ? ` — ${data.gameState.region || 'unknown region'}, ${data.gameState.gold || 0}g` : '';
  showSyncMsg(`Synced ${data.members.length} party member(s)${gsInfo}`, 4000);
}

function loadSyncFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const showSyncMsg = makeSyncMsgFn();
      processSyncData(data, showSyncMsg);
    } catch {
      const showSyncMsg = makeSyncMsgFn();
      showSyncMsg('Could not read file — make sure you selected party_sync.json');
    }
  };
  input.click();
}

function makeSyncMsgFn() {
  const partyHint = document.getElementById('party-save-hint');
  const stripHint = document.getElementById('strip-sync-hint');
  return function showSyncMsg(msg, duration = 5000) {
    if (partyHint) { partyHint.textContent = msg; setTimeout(() => { partyHint.textContent = ''; }, duration); }
    if (stripHint) { stripHint.textContent = msg; setTimeout(() => { stripHint.textContent = ''; }, duration); }
  };
}

async function syncFromGame() {
  const showSyncMsg = makeSyncMsgFn();

  let data;
  try {
    const res = await fetch('http://localhost:3457/party-sync');
    data = await res.json();
    if (!res.ok || data.error) {
      showSyncMsg(data.error || 'Sync failed — is the sync server running? (npm run sync)');
      return;
    }
  } catch {
    const isHosted = location.hostname !== 'localhost' && location.hostname !== '127.0.0.1';
    if (isHosted) {
      showSyncMsg('Load your party_sync.json file — click the 📂 button or check the TavSync section below.', 8000);
      return;
    }
    showSyncMsg('Sync server unreachable — run: npm run sync in the project directory.');
    return;
  }

  processSyncData(data, showSyncMsg);
}

function applyGameSync(members) {
  const rows = [...document.querySelectorAll('.party-row')];

  members.slice(0, 4).forEach((member, i) => {
    const row = rows[i];
    if (!row) return;

    // Set class dropdown from synced class name
    if (member.className) {
      const clsSel   = row.querySelector('.party-class');
      const subSel   = row.querySelector('.party-subclass');
      const buildSel = row.querySelector('.party-build');
      if (clsSel) {
        clsSel.value = member.className;
        if (subSel) {
          populateSubclassSelect(subSel, member.className);
          // Set subclass — try exact match first, then fuzzy (handles "CollegeOfLore" → "College of Lore")
          if (member.subClass) {
            const norm = v => v.toLowerCase().replace(/\s+/g, '');
            const exact = [...subSel.options].find(o => o.value === member.subClass);
            if (exact) {
              subSel.value = member.subClass;
            } else {
              const fuzzy = [...subSel.options].find(o => norm(o.value) === norm(member.subClass));
              if (fuzzy) subSel.value = fuzzy.value;
            }
          }
        }
        if (buildSel) populatePartyBuildSelect(buildSel, member.className);
      }
    }

    // Fill gear slots
    GEAR_SLOTS.forEach(slot => {
      const inp = row.querySelector(`.gear-input[data-slot="${slot}"]`);
      if (inp && member.gear && member.gear[slot]) {
        inp.value = member.gear[slot];
      }
    });

    // Auto-expand the gear panel for any row that got data
    const hasGear = GEAR_SLOTS.some(s => member.gear?.[s]);
    if (hasGear) {
      const gearPanel = row.querySelector('.party-gear');
      const toggleBtn = row.querySelector('.gear-toggle');
      if (gearPanel?.hidden) {
        gearPanel.hidden = false;
        toggleBtn?.setAttribute('aria-expanded', 'true');
      }
    }

    // Fill split input with level breakdown so it appears in copied prompts
    const splitInp = row.querySelector('.gear-split-input');
    if (splitInp && member.classes?.length) {
      splitInp.value = member.classes.map(c => `${c.name} ${c.level}`).join(' / ');
    } else if (splitInp) {
      splitInp.value = '';
    }

  });

  saveParty();

  // Patch classes/totalLevel/abilities/xp back into saved slots — no DOM inputs for these fields
  const saved = loadParty();
  if (saved?.slots) {
    members.slice(0, 4).forEach((member, i) => {
      if (saved.slots[i]) {
        if (member.classes)    saved.slots[i].classes    = member.classes;
        if (member.totalLevel) saved.slots[i].totalLevel = member.totalLevel;
        if (member.abilities)  saved.slots[i].abilities  = member.abilities;
        if (member.experience) saved.slots[i].experience = member.experience;
        if (member.name)       saved.slots[i].charName   = member.name;
      }
    });
    localStorage.setItem(PARTY_KEY, JSON.stringify(saved));
  }
}

// ---------------------------------------------------------------------------
// Build Planner — prompt generation + sidebar
// ---------------------------------------------------------------------------

function generateBuildPrompt() {
  const cls   = document.getElementById('build-class').value;
  const sub   = document.getElementById('build-subclass').value.trim();
  const multi = document.getElementById('build-multiclass').value.trim();
  const act   = state.act;
  const gear  = document.getElementById('build-gear').value.trim();
  const notes = document.getElementById('build-notes').value.trim();

  const gsBlock = gameStateBlock();

  const lines = [
    'Plan a BG3 build for me.',
    '',
    gsBlock || null,
    gsBlock ? '' : null,
    `Class: ${cls || '[pick the strongest option for my situation]'}`,
    sub   ? `Subclass: ${sub}`              : null,
    multi ? `Multiclass: ${multi}`          : null,
    `Current act: ${act} (Withers respec available — treat this as a fresh level 1 build)`,
    gear  ? `Gear I have: ${gear}`          : null,
    notes ? `Goals / constraints: ${notes}` : null,
    '',
    'Give me a level-by-level plan from 1 to 12.',
    'At each key breakpoint explain what to pick and why — feats, subclass features, spell choices.',
    'If I listed gear, factor it in and bend the plan around it.',
  ].filter(l => l !== null);

  return lines.join('\n').trim();
}

function renderBuildSidebar() {
  const sidebar   = document.getElementById('build-templates');
  const className = document.getElementById('build-class').value;

  const hmChecked = state.filters.hmOnly ? ' checked' : '';
  const hmToggleHTML = `<label class="hm-toggle"><input type="checkbox" id="hm-filter"${hmChecked}><span>Honor Mode safe only</span></label>`;

  if (!className) {
    sidebar.innerHTML = `${hmToggleHTML}<h3 class="sidebar-title">Matching Builds</h3><p class="sidebar-hint">Select a class above to see curated templates.</p>`;
    rewireHmFilter();
    return;
  }

  const subclass = document.getElementById('build-subclass').value;
  const subKws   = subclass ? (SUBCLASS_KEYWORDS[subclass] || [subclass.toLowerCase()]) : null;

  let matches = buildsForClass(className)
    .sort((a, b) => (TIER_ORDER[a.tier] ?? 99) - (TIER_ORDER[b.tier] ?? 99));

  if (subKws) matches = matches.filter(b => subKws.some(kw => b.name.toLowerCase().includes(kw)));
  if (state.filters.hmOnly) matches = matches.filter(b => HM_SAFE_BUILDS.has(b.id));

  const subLabel = subclass ? ` (${esc(subclass)})` : '';
  let listHTML;
  if (!matches.length) {
    const msg = state.builds.length
      ? (state.filters.hmOnly
          ? `No HM-safe ${esc(className)}${subLabel} builds found.`
          : `No curated ${esc(className)}${subLabel} templates yet — this subclass may not have a dedicated guide.`)
      : 'Build data not populated — run <code>--builds</code> to populate.';
    listHTML = `<p class="sidebar-hint">${msg}</p>`;
  } else {
    // All content sanitized via esc() before insertion — XSS safe
    listHTML = matches.map(b => {
      const tierClass = esc(b.tier?.replace('+', 'plus') ?? '');
      const url       = esc(b.source_url ?? '#');
      const tier      = esc(b.tier ?? '');
      const name      = esc(b.name ?? '');
      return `<a class="build-template" href="${url}" target="_blank" rel="noopener noreferrer"><span class="build-template__tier tier-${tierClass}">${tier}</span><span class="build-template__name">${name}</span></a>`;
    }).join('');
  }

  sidebar.innerHTML = `${hmToggleHTML}<h3 class="sidebar-title">Matching Builds</h3>${listHTML}`;
  rewireHmFilter();
}

// ---------------------------------------------------------------------------
// Profile banner + Level-Up Plan
// ---------------------------------------------------------------------------

function renderProfileBanner() {
  const banner   = document.getElementById('profile-banner');
  const nameEl   = document.getElementById('profile-banner-name');
  const tierEl   = document.getElementById('profile-banner-tier');
  const removeBtn = document.getElementById('profile-banner-remove');
  if (!banner) return;

  const profile = loadProfile();
  if (!profile) {
    banner.hidden = true;
    renderLevelPlan(null);
    return;
  }

  nameEl.textContent = profile.buildName;
  const tierCls = (profile.tier || '').replace('+', 'plus');
  tierEl.textContent  = profile.tier;
  tierEl.className    = `profile-banner__tier tier-${esc(tierCls)}`;
  banner.hidden = false;

  removeBtn.onclick = () => {
    deleteProfile();
    renderProfileBanner();
  };

  // Auto-select class + subclass in Build Planner, then re-render sidebar + level plan
  loadBuilds().then(builds => {
    const build = builds.find(b => b.id === profile.buildId);

    let className = profile.className || '';
    let subclass  = profile.subclass  || '';

    // Stale profile (saved before className was recorded) — infer from build name
    if (!className && build) {
      className = Object.keys(SUBCLASSES).find(cls =>
        buildsForClass(cls).some(b => b.id === build.id)
      ) || '';
      if (className) {
        const buildKey = (build.id + ' ' + build.name).toLowerCase();
        subclass = (SUBCLASSES[className] || []).find(sub => {
          const kws = SUBCLASS_KEYWORDS[sub] || [sub.toLowerCase()];
          return kws.some(kw => buildKey.includes(kw));
        }) || '';
        // Patch the stored profile so we don't re-infer next time
        localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...profile, className, subclass }));
      }
    }

    const classEl = document.getElementById('build-class');
    const subSel  = document.getElementById('build-subclass');
    if (classEl && className) {
      classEl.value = className;
      populateSubclassSelect(subSel, className);
      if (subclass) subSel.value = subclass;
      renderBuildSidebar();
      renderActRoute(state.act, className);
      renderFeatAdvisor(className, subclass);
      renderChecklist(state.act);
    }

    renderLevelPlan(build || null);
    renderWishlistPanel();
  });
}

function restorePartyForm() {
  const party = loadParty();
  const rows  = [...document.querySelectorAll('.party-row')];
  // Auto-fill You from active profile first (if row is empty)
  const profile = loadProfile();
  if (profile?.className) {
    const youRow = rows[0];
    const clsSel   = youRow?.querySelector('.party-class');
    const subSel   = youRow?.querySelector('.party-subclass');
    const buildSel = youRow?.querySelector('.party-build');
    if (clsSel && !clsSel.value) {
      clsSel.value = profile.className;
      populateSubclassSelect(subSel, profile.className);
      if (profile.subclass) subSel.value = profile.subclass;
      populatePartyBuildSelect(buildSel, profile.className);
      if (profile.buildId) buildSel.value = profile.buildId;
    }
  }
  if (!party) return;
  party.slots.forEach((slot, i) => {
    const row = rows[i];
    if (!row || !slot.className) return;
    const clsSel   = row.querySelector('.party-class');
    const subSel   = row.querySelector('.party-subclass');
    const buildSel = row.querySelector('.party-build');
    if (clsSel && !clsSel.value) {  // don't overwrite already-set rows (e.g. You from profile)
      clsSel.value = slot.className;
      populateSubclassSelect(subSel, slot.className);
      if (slot.subclass) subSel.value = slot.subclass;
      populatePartyBuildSelect(buildSel, slot.className);
      if (slot.buildId) buildSel.value = slot.buildId;
    }
    if (slot.gear) {
      GEAR_SLOTS.forEach(s => {
        const inp = row.querySelector(`.gear-input[data-slot="${s}"]`);
        if (inp && slot.gear[s]) inp.value = slot.gear[s];
      });
    }
    if (slot.split) {
      const splitInp = row.querySelector('.gear-split-input');
      if (splitInp) splitInp.value = slot.split;
    }
  });
}

function renderPartyBanner() {
  const banner    = document.getElementById('party-banner');
  const membersEl = document.getElementById('party-banner-members');
  if (!banner || !membersEl) return;

  const party = loadParty();
  if (!party || !party.slots.some(s => s.className)) {
    banner.hidden = true;
    return;
  }

  banner.hidden = false;
  membersEl.innerHTML = '';

  const LABELS = ['You', 'Ally 1', 'Ally 2', 'Ally 3'];
  party.slots.forEach((slot, i) => {
    if (!slot.className) return;
    const btn = document.createElement('button');
    btn.className = 'party-member-btn';
    const display = slot.buildName || (slot.subclass ? `${slot.subclass} ${slot.className}` : slot.className);
    btn.textContent = `${LABELS[i]}: ${display}`;
    btn.title = 'Plan this build';
    btn.addEventListener('click', () => {
      const classEl = document.getElementById('build-class');
      const subSel  = document.getElementById('build-subclass');
      if (!classEl || !slot.className) return;
      classEl.value = slot.className;
      populateSubclassSelect(subSel, slot.className);
      if (slot.subclass) subSel.value = slot.subclass;
      renderBuildSidebar();
      renderActRoute(state.act, slot.className);
      renderFeatAdvisor(slot.className, slot.subclass || '');
    });
    membersEl.appendChild(btn);
  });

  const clearBtn = document.getElementById('party-banner-clear');
  if (clearBtn) {
    clearBtn.onclick = () => { deleteParty(); renderPartyBanner(); };
  }
}

function renderLevelPlan(build) {
  const container = document.getElementById('level-plan');
  const hint      = document.getElementById('level-plan-hint');
  const listEl    = document.getElementById('level-plan-list');
  const picker    = document.getElementById('level-picker');
  if (!container) return;

  if (!build || !build.level_plan || !build.level_plan.length) {
    container.hidden = true;
    if (picker) picker.hidden = true;
    renderConcentrationWarning(null);
    return;
  }

  hint.textContent = build.name;
  container.hidden = false;

  // Level tracker: load persisted level, render pill row
  state.currentLevel = loadCurrentLevel();
  if (picker) {
    picker.hidden = false;
    while (picker.firstChild) picker.removeChild(picker.firstChild);
    for (let lvl = 1; lvl <= 12; lvl++) {
      const pill = document.createElement('button');
      pill.className = 'level-pill' + (lvl === state.currentLevel ? ' level-pill--active' : '');
      pill.textContent = String(lvl);
      pill.title = 'Set current level to ' + lvl;
      pill.addEventListener('click', () => {
        state.currentLevel = lvl;
        saveCurrentLevel(lvl);
        renderLevelPlan(build);
        // Re-open outer accordion so changes are visible
        const lpBody   = document.getElementById('level-plan-body');
        const lpToggle = document.getElementById('level-plan-toggle');
        const lpArrow  = lpToggle?.querySelector('.level-plan__toggle-arrow');
        if (lpBody && lpBody.hidden) {
          lpBody.hidden = false;
          lpToggle?.setAttribute('aria-expanded', 'true');
          if (lpArrow) lpArrow.textContent = '▾';
        }
      });
      picker.appendChild(pill);
    }
  }

  // Concentration warning
  renderConcentrationWarning(build);

  // Build the accordion list with level state classes
  listEl.innerHTML = '';
  for (const entry of build.level_plan) {
    const lvl    = entry.level;
    const isDone = lvl < state.currentLevel;
    const isNext = lvl === state.currentLevel;

    const item = document.createElement('div');
    item.className = 'lp-item'
      + (isDone ? ' lp-item--done' : '')
      + (isNext ? ' lp-item--next' : '');

    const header = document.createElement('button');
    header.className = 'lp-item__header';
    header.setAttribute('aria-expanded', String(isNext));

    const labelEl = document.createElement('span');
    labelEl.className = 'lp-item__label';
    labelEl.textContent = 'Level ' + entry.level;

    if (isNext) {
      const badge = document.createElement('span');
      badge.className = 'lp-item__next-badge';
      badge.textContent = '▶ Current';
      labelEl.appendChild(badge);
    }

    const clsEl = document.createElement('span');
    clsEl.className = 'lp-item__cls';
    clsEl.textContent = entry.cls || '';

    const arrow = document.createElement('span');
    arrow.className = 'lp-item__arrow';
    arrow.textContent = isNext ? '▾' : '▸';

    header.appendChild(labelEl);
    header.appendChild(clsEl);
    header.appendChild(arrow);

    const body = document.createElement('div');
    body.className = 'lp-item__body';
    body.hidden = !isNext;

    if (entry.choices && entry.choices.length) {
      const ul = document.createElement('ul');
      ul.className = 'lp-choices';
      for (const choice of entry.choices) {
        const li = document.createElement('li');
        li.className = 'lp-choice';
        li.textContent = choice;
        ul.appendChild(li);
      }
      body.appendChild(ul);
    } else {
      const p = document.createElement('p');
      p.className = 'lp-empty';
      p.textContent = 'No special choices at this level.';
      body.appendChild(p);
    }

    header.addEventListener('click', () => {
      const open = !body.hidden;
      body.hidden = open;
      header.setAttribute('aria-expanded', String(!open));
      arrow.textContent = open ? '▸' : '▾';
    });

    item.appendChild(header);
    item.appendChild(body);
    listEl.appendChild(item);
  }
}

// ---------------------------------------------------------------------------
// Feature 5: Concentration conflict warnings
// ---------------------------------------------------------------------------

function findConcentrationSpells(build, maxLevel = 12) {
  const found = new Set();
  const matchSpells = text => {
    const lower = text.toLowerCase();
    for (const spell of CONCENTRATION_SPELLS) {
      if (lower.includes(spell.toLowerCase())) found.add(spell);
    }
  };
  if (build.level_plan) {
    for (const entry of build.level_plan) {
      if (entry.level > maxLevel) continue;
      for (const choice of (entry.choices || [])) matchSpells(choice);
    }
  }
  for (const spell of (build.char_create?.spells ?? [])) matchSpells(spell);
  return [...found];
}

function renderConcentrationWarning(build) {
  const el = document.getElementById('concentration-warning');
  if (!el) return;
  if (!build) { el.hidden = true; return; }

  const spells = findConcentrationSpells(build, state.currentLevel);
  if (spells.length < 2) { el.hidden = true; return; }

  const hasBless = spells.includes('Bless');
  const spellList = spells.map(s => '<span class="conc-spell">' + esc(s) + '</span>').join(', ');
  const blessNote = hasBless
    ? '<p class="conc-tip">Bless is the most impactful \u2014 prioritize it over damage concentration spells.</p>'
    : '';

  el.innerHTML =
    '<div class="conc-icon">\u26a0</div>' +
    '<div class="conc-body">' +
    '<p class="conc-text"><strong>Concentration conflict:</strong> ' + spellList + ' \u2014 only one can be active at a time.</p>' +
    blessNote +
    '</div>';
  el.hidden = false;
}

// ---------------------------------------------------------------------------
// Gear Wishlist Panel
// ---------------------------------------------------------------------------

async function renderWishlistPanel() {
  const panel = document.getElementById('wishlist-panel');
  if (!panel) return;

  const profile = loadProfile();
  const buildId = profile?.buildId || null;
  if (!buildId) { panel.hidden = true; return; }

  const wishlist = loadWishlist(buildId);
  if (!wishlist.size) { panel.hidden = true; return; }

  panel.hidden = false;
  const countEl = document.getElementById('wishlist-count');
  if (countEl) countEl.textContent = wishlist.size + ' item' + (wishlist.size !== 1 ? 's' : '');

  const [act1, act2, act3] = await Promise.all([loadActGear(1), loadActGear(2), loadActGear(3)]);
  const allItems = [
    ...act1.map(i => ({ ...i, _act: 1 })),
    ...act2.map(i => ({ ...i, _act: 2 })),
    ...act3.map(i => ({ ...i, _act: 3 })),
  ];

  const matched = [...wishlist].map(name => {
    const found = allItems.find(i => i.name === name);
    return found || { name, _act: 0, _stub: true };
  });

  const acquired = loadAcquired(buildId);

  const groups = { 1: [], 2: [], 3: [], 0: [] };
  for (const item of matched) {
    (groups[item._act] || groups[0]).push(item);
  }

  const listEl = document.getElementById('wishlist-list');
  if (!listEl) return;
  listEl.textContent = '';

  const ACT_LABELS = { 1: 'Act I', 2: 'Act II', 3: 'Act III', 0: 'Unknown' };
  const rarityShort = r => RARITY_LABELS[r]?.charAt(0) ?? 'C';

  for (const actKey of [1, 2, 3, 0]) {
    const items = groups[actKey];
    if (!items.length) continue;

    const band = document.createElement('div');
    band.className = 'wishlist-band';

    const bandLabel = document.createElement('div');
    bandLabel.className = 'wishlist-band__label';
    bandLabel.textContent = ACT_LABELS[actKey];
    band.appendChild(bandLabel);

    for (const item of items) {
      const isAcquired = acquired.has(item.name);

      const wrapper = document.createElement('div');
      wrapper.className = 'wishlist-item-wrap';

      const row = document.createElement('div');
      row.className = 'wishlist-item' + (isAcquired ? ' wishlist-item--acquired' : '');

      // Check button
      const checkBtn = document.createElement('button');
      checkBtn.className = 'wishlist-item__check';
      checkBtn.title = isAcquired ? 'Mark as needed' : 'Mark as acquired';
      checkBtn.textContent = isAcquired ? '\u2713' : '\u25cb';
      checkBtn.addEventListener('click', e => {
        e.stopPropagation();
        const newSet = toggleAcquired(buildId, item.name);
        const isNow = newSet.has(item.name);
        row.classList.toggle('wishlist-item--acquired', isNow);
        checkBtn.textContent = isNow ? '\u2713' : '\u25cb';
        checkBtn.title = isNow ? 'Mark as needed' : 'Mark as acquired';
        // Sync Gear Finder card if visible
        document.querySelectorAll('.gear-acquired-btn').forEach(btn => {
          if (btn.dataset.name === item.name) {
            btn.textContent = isNow ? '\u2713' : '\u25cb';
            btn.title = isNow ? 'Mark as needed' : 'Mark as acquired';
            btn.closest('.gear-card')?.classList.toggle('gear-card--acquired', isNow);
          }
        });
      });

      // Slot icon
      const slotEl = document.createElement('span');
      slotEl.className = 'wishlist-item__slot';
      slotEl.textContent = SLOT_ICONS[item.slot] || '\u00b7';

      // Name
      const nameEl = document.createElement('span');
      nameEl.className = 'wishlist-item__name';
      nameEl.textContent = item.name;

      // Rarity badge
      const rarityEl = document.createElement('span');
      rarityEl.className = 'wishlist-item__rarity rarity-' + (item.rarity || 'common');
      rarityEl.textContent = item._stub ? '' : rarityShort(item.rarity);

      // Remove button
      const removeBtn = document.createElement('button');
      removeBtn.className = 'wishlist-item__remove';
      removeBtn.title = 'Remove from wishlist';
      removeBtn.textContent = '\u00d7';
      removeBtn.addEventListener('click', e => {
        e.stopPropagation();
        toggleWishlist(buildId, item.name);
        // Sync Gear Finder heart if visible
        document.querySelectorAll('.gear-wishlist-btn').forEach(btn => {
          if (btn.dataset.name === item.name) {
            btn.textContent = '\u2661';
            btn.classList.remove('wishlisted');
            btn.title = 'Add to wishlist';
          }
        });
        renderWishlistPanel();
      });

      row.appendChild(checkBtn);
      row.appendChild(slotEl);
      row.appendChild(nameEl);
      row.appendChild(rarityEl);
      row.appendChild(removeBtn);
      wrapper.appendChild(row);

      // Location line
      if (item.location?.description) {
        const locEl = document.createElement('div');
        locEl.className = 'wishlist-item__location';
        locEl.textContent = '\u29c1 ' + item.location.description;
        wrapper.appendChild(locEl);
      }

      band.appendChild(wrapper);
    }

    listEl.appendChild(band);
  }
}

// ---------------------------------------------------------------------------
// Feature 4: Act transition checklist
// ---------------------------------------------------------------------------

function renderChecklist(act) {
  const el = document.getElementById('act-checklist');
  if (!el) return;
  const items = ACT_CHECKLISTS[act];
  if (!items) { el.hidden = true; return; }

  const storageKey = 'tav_check_act' + act;
  let checked;
  try { checked = new Set(JSON.parse(localStorage.getItem(storageKey) || '[]')); }
  catch { checked = new Set(); }

  const CATEGORY_COLORS = { story: '#c9943f', gear: '#5593e8', companion: '#c068f0', quest: '#3db85a' };
  const actLabel = act === 1 ? 'I' : 'II';

  while (el.firstChild) el.removeChild(el.firstChild);

  const header = document.createElement('div');
  header.className = 'checklist-header';

  const title = document.createElement('h3');
  title.className = 'checklist-title';
  title.textContent = 'Before leaving Act ' + actLabel;
  header.appendChild(title);

  const resetBtn = document.createElement('button');
  resetBtn.className = 'checklist-reset';
  resetBtn.textContent = 'Reset';
  resetBtn.addEventListener('click', () => { localStorage.removeItem(storageKey); renderChecklist(act); });
  header.appendChild(resetBtn);

  el.appendChild(header);

  const list = document.createElement('div');
  list.className = 'checklist-items';

  for (const item of items) {
    const label = document.createElement('label');
    label.className = 'checklist-item' + (checked.has(item.id) ? ' checklist-item--done' : '');

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'checklist-cb';
    cb.dataset.id = item.id;
    if (checked.has(item.id)) cb.checked = true;
    cb.addEventListener('change', e => {
      if (e.target.checked) checked.add(item.id); else checked.delete(item.id);
      localStorage.setItem(storageKey, JSON.stringify([...checked]));
      label.classList.toggle('checklist-item--done', e.target.checked);
    });

    const badge = document.createElement('span');
    badge.className = 'checklist-badge';
    badge.style.background = CATEGORY_COLORS[item.category] || '#8b7a5e';

    const text = document.createElement('span');
    text.className = 'checklist-text';
    text.textContent = item.text;

    label.appendChild(cb);
    label.appendChild(badge);
    label.appendChild(text);
    list.appendChild(label);
  }

  el.appendChild(list);
  el.hidden = false;
}

// ---------------------------------------------------------------------------
// Feature 2: Feat advisor
// ---------------------------------------------------------------------------

function extractFeatChoices(build, level) {
  const entry = build.level_plan?.find(e => e.level === level);
  if (!entry) return [];
  return (entry.choices || []).filter(c => {
    const lower = c.toLowerCase();
    return lower.startsWith('feat') || lower.startsWith('asi') ||
           lower.includes('ability score') || lower.includes('war caster') ||
           lower.includes('resilient');
  });
}

function renderFeatAdvisor(className, subclass) {
  const el = document.getElementById('feat-advisor');
  if (!el) return;
  if (!className || !state.builds.length) { el.hidden = true; return; }

  const subKws = subclass ? (SUBCLASS_KEYWORDS[subclass] || [subclass.toLowerCase()]) : null;
  let matches = buildsForClass(className);
  if (subKws) matches = matches.filter(b => subKws.some(kw => b.name.toLowerCase().includes(kw)));
  if (!matches.length) { el.hidden = true; return; }

  const total = matches.length;
  const levelBlocks = FEAT_LEVELS.map(level => {
    const tally = {};
    for (const build of matches) {
      for (const choice of extractFeatChoices(build, level)) {
        const norm = choice.replace(/\s+-\s+.*/, '').replace(/\s+or\s+.*/i, '').trim();
        tally[norm] = (tally[norm] || 0) + 1;
      }
    }
    const entries = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 2);
    return { level, entries };
  }).filter(b => b.entries.length);

  if (!levelBlocks.length) { el.hidden = true; return; }

  while (el.firstChild) el.removeChild(el.firstChild);

  const titleEl = document.createElement('h4');
  titleEl.className = 'feat-advisor-title';
  const subLabel = subclass ? ' (' + subclass + ')' : '';
  titleEl.textContent = 'Feat Choices \u2014 ' + className + subLabel;
  el.appendChild(titleEl);

  const blocksWrap = document.createElement('div');
  blocksWrap.className = 'feat-blocks';

  for (const { level, entries } of levelBlocks) {
    const block = document.createElement('div');
    block.className = 'feat-level-block';

    const lbl = document.createElement('span');
    lbl.className = 'feat-level-label';
    lbl.textContent = 'Level ' + level;
    block.appendChild(lbl);

    for (const [name, count] of entries) {
      const pick = document.createElement('div');
      pick.className = 'feat-pick';

      const nameEl = document.createElement('span');
      nameEl.className = 'feat-pick__name';
      nameEl.textContent = name;

      const countEl = document.createElement('span');
      countEl.className = 'feat-pick__count';
      countEl.textContent = count + '/' + total + ' builds';

      pick.appendChild(nameEl);
      pick.appendChild(countEl);
      block.appendChild(pick);
    }

    blocksWrap.appendChild(block);
  }

  el.appendChild(blocksWrap);
  el.hidden = false;
}

// ---------------------------------------------------------------------------
// Feature 1: Global search
// ---------------------------------------------------------------------------

async function renderGlobalSearch(query) {
  const container = document.getElementById('global-results');
  if (!container) return;

  if (!query || query.length < 2) {
    while (container.firstChild) container.removeChild(container.firstChild);
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<div class="empty-state__rune">\ud83d\udd0d</div><p class="empty-state__text">Type to search across all acts\u2026</p>';
    container.appendChild(empty);
    return;
  }

  while (container.firstChild) container.removeChild(container.firstChild);
  const loading = document.createElement('div');
  loading.className = 'loading';
  loading.textContent = 'Searching all vaults\u2026';
  container.appendChild(loading);

  const [act1, act2, act3] = await Promise.all([loadActGear(1), loadActGear(2), loadActGear(3)]);

  const q = query.toLowerCase();
  const searchItems = items => items.filter(item => {
    const inName    = item.name.toLowerCase().includes(q);
    const inEffects = item.effects?.some(e => e.toLowerCase().includes(q));
    return inName || inEffects;
  });

  const groups = [
    { label: 'Act I',   items: searchItems(act1) },
    { label: 'Act II',  items: searchItems(act2) },
    { label: 'Act III', items: searchItems(act3) },
  ].filter(g => g.items.length);

  while (container.firstChild) container.removeChild(container.firstChild);

  if (!groups.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const rune = document.createElement('div');
    rune.className = 'empty-state__rune';
    rune.textContent = '\ud83d\udd0d';
    const msg = document.createElement('p');
    msg.className = 'empty-state__text';
    msg.textContent = 'Nothing matched \u201c' + query + '\u201d across any act.';
    const hint = document.createElement('p');
    hint.className = 'empty-state__hint';
    hint.textContent = 'Try a different keyword \u2014 item names, effects, or locations.';
    empty.appendChild(rune);
    empty.appendChild(msg);
    empty.appendChild(hint);
    container.appendChild(empty);
    return;
  }

  for (const group of groups) {
    const section = document.createElement('section');
    section.className = 'search-act-group';

    const heading = document.createElement('h3');
    heading.className = 'search-act-label';
    heading.textContent = group.label + ' ';
    const countBadge = document.createElement('span');
    countBadge.className = 'slot-count';
    countBadge.textContent = String(group.items.length);
    heading.appendChild(countBadge);
    section.appendChild(heading);

    const cardsWrap = document.createElement('div');
    cardsWrap.className = 'slot-cards';
    cardsWrap.innerHTML = group.items.map(gearCardHTML).join('');
    section.appendChild(cardsWrap);

    container.appendChild(section);
  }
}

// Re-attach HM filter listener after sidebar re-render (checkbox is replaced each time)
function rewireHmFilter() {
  const cb = document.getElementById('hm-filter');
  if (cb) {
    cb.addEventListener('change', e => {
      state.filters.hmOnly = e.target.checked;
      renderBuildSidebar();
    });
  }
}

async function renderActRoute(act, className) {
  const section = document.getElementById('build-route');
  if (!className) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  const list = document.getElementById('build-route-list');
  list.innerHTML = '<div class="loading">Scouting the route…</div>';

  // Update heading dynamically
  const heading = section.querySelector('.build-route__heading');
  const actLabels = { 1: 'Act I', 2: 'Act II', 3: 'Act III' };
  if (heading) heading.textContent = `${actLabels[act] || `Act ${act}`} — Route Priorities`;

  const [actItems] = await Promise.all([loadActGear(act), loadBuilds()]);

  const subclass = document.getElementById('build-subclass').value;
  const subKws   = subclass ? (SUBCLASS_KEYWORDS[subclass] || [subclass.toLowerCase()]) : null;

  let classBuilds = buildsForClass(className);
  if (subKws) classBuilds = classBuilds.filter(b => subKws.some(kw => b.name.toLowerCase().includes(kw)));

  const ids = new Set(classBuilds.map(b => b.id));
  let relevant = actItems.filter(item =>
    item.build_tags?.some(t => ids.has(t)) && item.location?.area
  );

  const subLabel = subclass ? ` (${esc(subclass)})` : '';
  if (!relevant.length) {
    list.innerHTML = `<p class="sidebar-hint">No tagged gear found for ${esc(className)}${subLabel} in ${actLabels[act] || `Act ${act}`}.</p>`;
    return;
  }

  const rarityShort = r => RARITY_LABELS[r]?.charAt(0) ?? 'C';
  const normName = s => s.toLowerCase().replace(/[‘’ʼ]/g, "'");

  const profile  = loadProfile();
  const buildId  = profile?.buildId || null;
  const acquired = buildId ? loadAcquired(buildId) : new Set();

  const actKey = `act${act}`;
  let recNames = new Set();
  if (buildId) {
    const activeBuild = state.builds.find(b => b.id === buildId);
    const recs = activeBuild?.gear_recs?.[actKey] || [];
    recNames = new Set(recs.map(normName));
  }

  let bands;
  if (act === 1) {
    relevant.sort((a, b) =>
      (AREA_ORDER[a.location.area] ?? 99) - (AREA_ORDER[b.location.area] ?? 99)
    );
    bands = [
      { label: 'Early Game',       items: relevant.filter(i => (AREA_ORDER[i.location.area] ?? 99) <= 3) },
      { label: 'Mid Act I',        items: relevant.filter(i => { const o = AREA_ORDER[i.location.area] ?? 99; return o >= 4 && o <= 7; }) },
      { label: 'Late / Underdark', items: relevant.filter(i => { const o = AREA_ORDER[i.location.area] ?? 99; return o >= 8 && o <= 12; }) },
    ].filter(b => b.items.length);
  } else {
    // Group by slot for Acts II & III
    const slotMap = {};
    for (const item of relevant) {
      const s = item.slot || 'misc';
      if (!slotMap[s]) slotMap[s] = [];
      slotMap[s].push(item);
    }
    bands = SLOT_ORDER
      .filter(s => slotMap[s]?.length)
      .map(s => ({ label: GEAR_SLOT_LABELS[s] || capitalize(s), items: slotMap[s] }));
    if (slotMap['misc']?.length) bands.push({ label: 'Misc', items: slotMap['misc'] });
  }

  if (!bands.length) {
    list.innerHTML = '<p class="sidebar-hint">No route data available.</p>';
    return;
  }

  list.innerHTML = '';
  for (const band of bands) {
    const bandEl = document.createElement('div');
    bandEl.className = 'route-band';

    const labelEl = document.createElement('div');
    labelEl.className = 'route-band__label';
    labelEl.textContent = band.label;
    bandEl.appendChild(labelEl);

    for (const item of band.items) {
      const isAcquired    = acquired.has(item.name);
      const isRecommended = recNames.has(normName(item.name));
      const wrapper = document.createElement('div');
      wrapper.className = 'route-item-wrap'
        + (isAcquired    ? ' route-item--acquired'    : '')
        + (isRecommended ? ' route-item--recommended' : '');

      const row = document.createElement('div');
      row.className = 'route-item';

      const checkBtn = document.createElement('button');
      checkBtn.className = 'route-item__check';
      checkBtn.title = isAcquired ? 'Mark as needed' : 'Mark as acquired';
      checkBtn.textContent = isAcquired ? '✓' : '○';
      checkBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (!buildId) return;
        const newSet = toggleAcquired(buildId, item.name);
        const isNow = newSet.has(item.name);
        wrapper.classList.toggle('route-item--acquired', isNow);
        checkBtn.textContent = isNow ? '✓' : '○';
        checkBtn.title = isNow ? 'Mark as needed' : 'Mark as acquired';
      });

      const slotEl = document.createElement('span');
      slotEl.className = 'route-item__slot';
      slotEl.textContent = SLOT_ICONS[item.slot] || '·';

      const nameEl = document.createElement('span');
      nameEl.className = 'route-item__name';
      nameEl.textContent = item.name;

      const areaEl = document.createElement('span');
      areaEl.className = 'route-item__area';
      areaEl.textContent = item.location.area;

      const rEl = document.createElement('span');
      rEl.className = `route-item__rarity rarity-${item.rarity || 'common'}`;
      rEl.textContent = rarityShort(item.rarity);

      const arrowEl = document.createElement('span');
      arrowEl.className = 'route-item__expand-arrow';
      arrowEl.textContent = '▸';

      row.appendChild(checkBtn);
      row.appendChild(slotEl);
      row.appendChild(nameEl);
      if (isRecommended) {
        const badge = document.createElement('span');
        badge.className = 'route-item__rec-badge';
        badge.textContent = '★';
        badge.title = 'Recommended by your build guide';
        row.appendChild(badge);
      }
      row.appendChild(areaEl);
      row.appendChild(rEl);
      row.appendChild(arrowEl);

      const body = document.createElement('div');
      body.className = 'route-item__body';
      body.hidden = true;

      if (item.location?.description) {
        const desc = document.createElement('p');
        desc.className = 'route-item__desc';
        desc.textContent = item.location.description;
        body.appendChild(desc);
      }

      const wikiSlug = item.name.replace(/ /g, '_');
      const wikiLink = document.createElement('a');
      wikiLink.className = 'route-item__wiki';
      wikiLink.href = `https://bg3.wiki/wiki/${encodeURIComponent(wikiSlug)}`;
      wikiLink.target = '_blank';
      wikiLink.rel = 'noopener noreferrer';
      wikiLink.textContent = 'View on bg3.wiki →';
      body.appendChild(wikiLink);

      row.addEventListener('mouseenter', () => showGearTooltip(item, row));
      row.addEventListener('mouseleave', hideGearTooltip);

      row.style.cursor = 'pointer';
      row.addEventListener('click', () => {
        const open = !body.hidden;
        body.hidden = open;
        arrowEl.textContent = open ? '▸' : '▾';
      });

      wrapper.appendChild(row);
      wrapper.appendChild(body);
      bandEl.appendChild(wrapper);
    }

    list.appendChild(bandEl);
  }
}

// ---------------------------------------------------------------------------
// Character Creator — build browser + char create card
// ---------------------------------------------------------------------------

function renderCharCreatorBuilds(classFilter) {
  const listEl = document.getElementById('creator-build-list');
  if (!listEl) return;

  let builds = state.builds.filter(b => b.char_create);
  if (classFilter) {
    const kws = CLASS_KEYWORDS[classFilter] || [classFilter.toLowerCase()];
    builds = builds.filter(b => kws.some(kw => b.name.toLowerCase().includes(kw)));
  }
  builds.sort((a, b) => (TIER_ORDER[a.tier] ?? 99) - (TIER_ORDER[b.tier] ?? 99));

  while (listEl.firstChild) listEl.removeChild(listEl.firstChild);

  if (!builds.length) {
    const p = document.createElement('p');
    p.className = 'sidebar-hint';
    p.textContent = 'No builds found for this class.';
    listEl.appendChild(p);
    return;
  }

  for (const build of builds) {
    const btn = document.createElement('button');
    btn.className = 'creator-build-item';
    btn.dataset.id = build.id;

    const tierSpan = document.createElement('span');
    tierSpan.className = `build-template__tier tier-${(build.tier || '').replace('+', 'plus')}`;
    tierSpan.textContent = build.tier || '';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'creator-build-item__name';
    nameSpan.textContent = build.name;

    btn.appendChild(tierSpan);
    btn.appendChild(nameSpan);
    btn.addEventListener('click', () => {
      document.querySelectorAll('.creator-build-item').forEach(el => el.classList.remove('active'));
      btn.classList.add('active');
      renderCharCreateCard(build);

      // Populate Build Planner class + subclass from this build
      const buildClassName = Object.keys(SUBCLASSES).find(cls =>
        buildsForClass(cls).some(b => b.id === build.id)
      ) || '';
      const classEl = document.getElementById('build-class');
      const subSel  = document.getElementById('build-subclass');
      if (classEl && buildClassName) {
        classEl.value = buildClassName;
        populateSubclassSelect(subSel, buildClassName);
        const buildKey = (build.id + ' ' + build.name).toLowerCase();
        const detectedSub = (SUBCLASSES[buildClassName] || []).find(sub => {
          const kws = SUBCLASS_KEYWORDS[sub] || [sub.toLowerCase()];
          return kws.some(kw => buildKey.includes(kw));
        });
        if (detectedSub && subSel) subSel.value = detectedSub;
        renderBuildSidebar();
        renderActRoute(state.act, buildClassName);
        renderFeatAdvisor(buildClassName, detectedSub || '');
      }
    });

    listEl.appendChild(btn);
  }
}

function renderCharCreateCard(build) {
  const emptyEl = document.getElementById('creator-empty');
  const cardEl  = document.getElementById('creator-card');
  if (!cardEl || !emptyEl) return;

  emptyEl.hidden = true;
  cardEl.hidden  = false;

  const cc = build.char_create;
  if (!cc) {
    cardEl.innerHTML = '<p class="sidebar-hint">No character creation data available for this build.</p>';
    return;
  }

  const tierCls = (build.tier || '').replace('+', 'plus');
  const clean   = s => String(s).replace(/[\u200b\u200c\u200d\u2060\ufeff]/g, '').trim();

  // Ability scores
  const ABILITY_ORDER = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
  const scoreHTML = ABILITY_ORDER.map(stat => {
    const val = cc.ability_scores[stat];
    const highlight = typeof val === 'number' && val >= 16 ? ' cc-ability--high' : '';
    const dim       = typeof val === 'number' && val <= 10 ? ' cc-ability--low'  : '';
    return `<div class="cc-ability${highlight}${dim}"><span class="cc-ability-name">${esc(stat)}</span><span class="cc-ability-val">${esc(String(val ?? '—'))}</span></div>`;
  }).join('');

  // Races
  const racesHTML = cc.races.length
    ? `<ol class="cc-races">${cc.races.map(r => {
        const reason = clean(r.reason || '');
        return `<li class="cc-race"><strong>${esc(clean(r.name))}</strong>${reason ? ` — <span class="cc-race__reason">${esc(reason)}</span>` : ''}</li>`;
      }).join('')}</ol>`
    : '<p class="text-muted">—</p>';

  // Background
  const bgName = clean(cc.background || '');
  const bgSkills = cc.background_skills.length ? ` — ${esc(cc.background_skills.join(', '))}` : '';
  const bgHTML = bgName
    ? `<p><strong>${esc(bgName)}</strong>${bgSkills}</p>`
    : '<p class="text-muted">Any (role-play preference)</p>';

  // Skills
  const skillsHTML = cc.skills.length
    ? cc.skills.map(s => `<span class="cc-tag">${esc(clean(s))}</span>`).join('')
    : '<span class="text-muted">—</span>';

  // Cantrips / Spells toggle (combined section, only shown if at least one list is non-empty)
  const hasCantrips = cc.cantrips && cc.cantrips.length > 0;
  const hasSpells   = cc.spells && cc.spells.length > 0;

  let spellToggleHTML = '';
  if (hasCantrips || hasSpells) {
    const cantripList = hasCantrips
      ? cc.cantrips.map(c => `<span class="cc-tag cc-tag--spell">${esc(clean(c))}</span>`).join('')
      : '';
    const spellList = hasSpells
      ? cc.spells.map(s => `<span class="cc-tag cc-tag--spell">${esc(clean(s))}</span>`).join('')
      : '';

    if (hasCantrips && hasSpells) {
      spellToggleHTML = `
        <div class="cc-section cc-spell-section">
          <div class="cc-spell-header">
            <h4 class="cc-section-title">Starting Magic</h4>
            <div class="cc-spell-tabs">
              <button class="cc-spell-tab active" data-panel="cantrips">Cantrips</button>
              <button class="cc-spell-tab" data-panel="spells">Spells</button>
            </div>
          </div>
          <div class="cc-spell-panel" data-panel="cantrips"><div class="cc-tags">${cantripList}</div></div>
          <div class="cc-spell-panel" data-panel="spells" hidden><div class="cc-tags">${spellList}</div></div>
        </div>`;
    } else if (hasCantrips) {
      spellToggleHTML = `<div class="cc-section"><h4 class="cc-section-title">Starting Cantrips</h4><div class="cc-tags">${cantripList}</div></div>`;
    } else {
      spellToggleHTML = `<div class="cc-section"><h4 class="cc-section-title">Starting Spells</h4><div class="cc-tags">${spellList}</div></div>`;
    }
  }

  // Blurb (build overview)
  const blurbText = clean(build.blurb || '');
  const blurbHTML = blurbText
    ? `<p class="cc-blurb">${esc(blurbText)}</p>`
    : '';

  // All template content built from esc()-sanitized data — XSS safe
  cardEl.innerHTML = `
    <div class="cc-header">
      <span class="build-template__tier tier-${esc(tierCls)}">${esc(build.tier || '')}</span>
      <h2 class="cc-title">${esc(build.name)}</h2>
      <a href="${esc(build.source_url || '#')}" class="cc-guide-link" target="_blank" rel="noopener noreferrer">Full Guide →</a>
    </div>
    ${blurbHTML}
    <div class="cc-section">
      <h4 class="cc-section-title">Ability Scores</h4>
      <div class="cc-ability-grid">${scoreHTML}</div>
    </div>
    ${cc.races.length ? `<div class="cc-section"><h4 class="cc-section-title">Top Races</h4>${racesHTML}</div>` : ''}
    <div class="cc-section">
      <h4 class="cc-section-title">Background</h4>
      ${bgHTML}
    </div>
    ${cc.skills.length ? `<div class="cc-section"><h4 class="cc-section-title">Priority Skills</h4><div class="cc-tags">${skillsHTML}</div></div>` : ''}
    ${spellToggleHTML}
    <div class="cc-create-footer">
      <button class="cc-create-btn" id="cc-create-btn">Create Character</button>
      <span class="cc-create-hint" id="cc-create-hint"></span>
    </div>
  `;

  // Wire up the Cantrips/Spells toggle
  cardEl.querySelectorAll('.cc-spell-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.panel;
      tab.closest('.cc-spell-section').querySelectorAll('.cc-spell-tab').forEach(t => t.classList.toggle('active', t === tab));
      tab.closest('.cc-spell-section').querySelectorAll('.cc-spell-panel').forEach(p => { p.hidden = p.dataset.panel !== target; });
    });
  });

  // Set initial button label based on whether a profile already exists
  const createBtn  = document.getElementById('cc-create-btn');
  const createHint = document.getElementById('cc-create-hint');
  const existing   = loadProfile();
  if (existing && existing.buildId === build.id) {
    createBtn.textContent = 'Active character';
    createBtn.classList.add('cc-create-btn--active');
  }

  createBtn.addEventListener('click', () => {
    saveProfile(build);
    createBtn.textContent = 'Active character';
    createBtn.classList.add('cc-create-btn--active');
    createHint.textContent = 'Saved — visible in Build Planner.';
    setTimeout(() => { createHint.textContent = ''; }, 3000);
  });
}

// ---------------------------------------------------------------------------
// Tab switching
// ---------------------------------------------------------------------------

function switchTab(tabId) {
  state.activeTab = tabId;

  document.querySelectorAll('.tab-btn').forEach(btn => {
    const active = btn.dataset.tab === tabId;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active);
  });

  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `tab-${tabId}`);
  });

  if (tabId === 'gear')   renderGearResults();
  if (tabId === 'party')  loadBuilds().then(() => { restorePartyForm(); renderSavedPartiesList(); });
  if (tabId === 'build')  {
    loadBuilds().then(() => {
      renderBuildSidebar();
      renderCharCreatorBuilds(state.creatorClass);
    });
    renderProfileBanner();
    renderPartyBanner();
    renderChecklist(state.act);
    renderWishlistPanel();
  }
  if (tabId === 'search') renderGlobalSearch(state.globalSearch);
}

// ---------------------------------------------------------------------------
// Act button sync helper
// ---------------------------------------------------------------------------

function syncActButtons(group, act) {
  document.querySelectorAll(`.act-btn[data-group="${group}"]`).forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.act) === act);
  });
}

// ---------------------------------------------------------------------------
// Global act setter — updates state and triggers re-renders on active tab
// ---------------------------------------------------------------------------

function setAct(n) {
  state.act = n;
  syncActButtons('strip', n);
  if (state.activeTab === 'gear')   renderGearResults();
  if (state.activeTab === 'build')  {
    renderActRoute(n, document.getElementById('build-class')?.value || '');
    renderChecklist(n);
  }
}

// ---------------------------------------------------------------------------
// Party Strip — persistent bar showing party comp + act + sync
// ---------------------------------------------------------------------------

function slotPillLabel(slot) {
  if (!slot?.className) return '';
  // Multiclass: "Fighter 5 / Warlock 3"
  if (slot.classes?.length > 1) {
    return slot.classes.map(c => `${c.name} ${c.level}`).join(' / ');
  }
  // Single class with level: "Fighter 8"
  if (slot.classes?.length === 1 && slot.classes[0].level > 0) {
    return `${slot.classes[0].name} ${slot.classes[0].level}`;
  }
  // Fallback: build name, or subclass+class, or just class
  return slot.buildName || (slot.subclass ? `${slot.subclass} ${slot.className}` : slot.className);
}

function renderPartyStrip() {
  const slotsEl = document.getElementById('strip-slots');
  if (!slotsEl) return;

  const party = loadParty();
  const LABELS = ['You', 'Ally 1', 'Ally 2', 'Ally 3'];

  slotsEl.querySelectorAll('.party-slot').forEach((btn, i) => {
    const slot = party?.slots?.[i];
    const hasClass = slot?.className;
    const display = hasClass ? slotPillLabel(slot) : '';

    btn.textContent = hasClass ? display : LABELS[i];
    btn.classList.toggle('party-slot--empty', !hasClass);
    btn.classList.toggle('party-slot--active', false);
    if (hasClass) btn.title = `Edit ${display}`;
    else btn.title = `Set ${LABELS[i]}`;
  });
}

// ---------------------------------------------------------------------------
// Strip popover — edit a party slot inline
// ---------------------------------------------------------------------------

function openStripPopover(slotBtn, idx) {
  const popover = document.getElementById('strip-popover');
  if (!popover) return;

  // Toggle closed if already open for this slot
  if (state.stripActiveSlot === idx && !popover.hidden) {
    popover.hidden = true;
    state.stripActiveSlot = null;
    slotBtn.classList.remove('party-slot--active');
    return;
  }

  state.stripActiveSlot = idx;
  document.querySelectorAll('.party-slot').forEach(b => b.classList.remove('party-slot--active'));
  slotBtn.classList.add('party-slot--active');

  // Pre-fill from saved party
  const party = loadParty();
  const slot  = party?.slots?.[idx] || {};

  const clsSel = document.getElementById('strip-popover-class');
  const subSel = document.getElementById('strip-popover-subclass');

  clsSel.value = slot.className || '';
  if (slot.className) {
    populateSubclassSelect(subSel, slot.className);
    subSel.value = slot.subclass || '';
  } else {
    while (subSel.options.length) subSel.remove(0);
    subSel.add(new Option('Subclass…', ''));
    subSel.disabled = true;
  }

  // Wire class change → update subclass
  clsSel.onchange = () => {
    if (clsSel.value) {
      populateSubclassSelect(subSel, clsSel.value);
    } else {
      while (subSel.options.length) subSel.remove(0);
      subSel.add(new Option('Subclass…', ''));
      subSel.disabled = true;
    }
    applyStripSlotChange(idx, clsSel.value, subSel.value);
  };

  subSel.onchange = () => {
    applyStripSlotChange(idx, clsSel.value, subSel.value);
  };

  popover.hidden = false;
}

function applyStripSlotChange(idx, className, subclass) {
  // Update the corresponding party row's class/subclass selects
  const rows = [...document.querySelectorAll('.party-row')];
  const row  = rows[idx];
  if (row) {
    const clsSel   = row.querySelector('.party-class');
    const subSel   = row.querySelector('.party-subclass');
    const buildSel = row.querySelector('.party-build');
    if (clsSel) clsSel.value = className;
    if (className && subSel) {
      populateSubclassSelect(subSel, className);
      if (subclass) subSel.value = subclass;
    } else if (subSel) {
      while (subSel.options.length) subSel.remove(0);
      subSel.add(new Option('Subclass…', ''));
      subSel.disabled = true;
    }
    if (buildSel && className) {
      populatePartyBuildSelect(buildSel, className);
    } else if (buildSel) {
      while (buildSel.options.length) buildSel.remove(0);
      buildSel.add(new Option('Build (optional)…', ''));
      buildSel.disabled = true;
    }
  }
  saveParty();
  renderPartyStrip();
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

function initEventListeners() {

  // ── Tabs ──────────────────────────────────────────────────────────────────
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // ── Strip: act selector (single global act) ───────────────────────────────
  document.querySelectorAll('.act-btn[data-group="strip"]').forEach(btn => {
    btn.addEventListener('click', () => setAct(parseInt(btn.dataset.act)));
  });

  // ── Strip: sync + load buttons ─────────────────────────────────────────────
  const stripSyncBtn = document.getElementById('strip-sync-btn');
  if (stripSyncBtn) stripSyncBtn.addEventListener('click', syncFromGame);
  const stripLoadBtn = document.getElementById('strip-load-btn');
  if (stripLoadBtn) stripLoadBtn.addEventListener('click', loadSyncFile);

  // ── Strip: slot click → open popover ─────────────────────────────────────
  document.querySelectorAll('.party-slot').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.slot);
      openStripPopover(btn, idx);
    });
  });

  // Close popover on outside click
  document.addEventListener('click', e => {
    const popover = document.getElementById('strip-popover');
    if (!popover || popover.hidden) return;
    if (!popover.contains(e.target) && !e.target.classList.contains('party-slot')) {
      popover.hidden = true;
      state.stripActiveSlot = null;
      document.querySelectorAll('.party-slot').forEach(b => b.classList.remove('party-slot--active'));
    }
  });

  // ── Gear Finder ───────────────────────────────────────────────────────────

  document.getElementById('slot-filter').addEventListener('change', e => {
    state.filters.slot = e.target.value;
    renderGearResults();
  });

  document.getElementById('class-filter').addEventListener('change', e => {
    state.filters.buildClass = e.target.value;
    state.filters.buildId    = '';
    loadBuilds().then(() => populateGearBuildSelect(e.target.value));
    renderGearResults();
  });

  document.getElementById('build-filter').addEventListener('change', e => {
    state.filters.buildId = e.target.value;
    renderGearResults();
  });

  let searchTimer;
  document.getElementById('gear-search').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.filters.search = e.target.value.trim();
      renderGearResults();
    }, 300);
  });

  // ── Party Advisor ─────────────────────────────────────────────────────────
  // Party class dropdowns: populate subclass + build select when class is chosen
  document.querySelectorAll('.party-class').forEach(sel => {
    sel.addEventListener('change', e => {
      const selects  = e.target.closest('.party-selects');
      const subSel   = selects.querySelector('.party-subclass');
      const buildSel = selects.querySelector('.party-build');
      if (e.target.value) {
        populateSubclassSelect(subSel, e.target.value);
        populatePartyBuildSelect(buildSel, e.target.value);
      } else {
        while (subSel.options.length) subSel.remove(0);
        subSel.add(new Option('Subclass…', ''));
        subSel.disabled = true;
        while (buildSel.options.length) buildSel.remove(0);
        buildSel.add(new Option('Build (optional)…', ''));
        buildSel.disabled = true;
      }
      saveParty();
    });
  });

  // Party build dropdown: auto-detect subclass when a specific build is chosen
  document.querySelectorAll('.party-build').forEach(sel => {
    sel.addEventListener('change', e => {
      const buildId = e.target.value;
      if (!buildId) return;
      const build = state.builds.find(b => b.id === buildId);
      if (!build) return;
      const selects  = e.target.closest('.party-selects');
      const subSel   = selects?.querySelector('.party-subclass');
      const clsVal   = selects?.querySelector('.party-class')?.value || '';
      if (!subSel || !clsVal) return;
      const buildKey = (build.id + ' ' + build.name).toLowerCase();
      const detected = (SUBCLASSES[clsVal] || []).find(sub => {
        const kws = SUBCLASS_KEYWORDS[sub] || [sub.toLowerCase()];
        return kws.some(kw => buildKey.includes(kw));
      });
      if (detected) subSel.value = detected;
      saveParty();
    });
  });

  document.getElementById('party-analyze-btn').addEventListener('click', async () => {
    await Promise.all([loadCompanions(), loadBuilds()]);
    const result = analyzeParty();
    renderPartyAnalysis(result);
    document.getElementById('party-analysis').hidden = false;
  });

  document.getElementById('party-save-btn').addEventListener('click', function () {
    saveParty();
    const hint = document.getElementById('party-save-hint');
    const prev = hint.textContent;
    hint.textContent = 'Party saved — visible in Build Planner.';
    setTimeout(() => { hint.textContent = prev; }, 3000);
  });

  document.getElementById('party-saveas-btn').addEventListener('click', function () {
    const nameInput = document.getElementById('party-save-name');
    const name = nameInput.value.trim() || 'Party ' + (loadSavedParties().length + 1);
    savePartyAs(name);
    nameInput.value = '';
    const hint = document.getElementById('party-save-hint');
    const prev = hint.textContent;
    hint.textContent = `"${name}" saved.`;
    setTimeout(() => { hint.textContent = prev; }, 2500);
  });

  document.getElementById('party-copy-btn').addEventListener('click', function () {
    copyToClipboard(generatePartyPrompt(), this);
  });

  document.getElementById('party-gear-btn').addEventListener('click', function () {
    copyToClipboard(generateGearPrompt(), this);
  });

  document.getElementById('party-sync-btn').addEventListener('click', syncFromGame);
  document.getElementById('party-load-btn').addEventListener('click', loadSyncFile);

  document.querySelectorAll('.gear-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const gear     = btn.closest('.party-selects').querySelector('.party-gear');
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!expanded));
      gear.hidden = expanded;
    });
  });

  document.querySelectorAll('.gear-input, .gear-split-input').forEach(inp => {
    inp.addEventListener('change', saveParty);
  });

  // ── Build Planner ─────────────────────────────────────────────────────────
  document.getElementById('build-class').addEventListener('change', e => {
    const subSel = document.getElementById('build-subclass');
    if (e.target.value) {
      populateSubclassSelect(subSel, e.target.value);
    } else {
      while (subSel.options.length) subSel.remove(0);
      subSel.add(new Option('Select a class first…', ''));
      subSel.disabled = true;
    }
    loadBuilds().then(renderBuildSidebar);
    renderActRoute(state.act, e.target.value);
    loadBuilds().then(() => renderFeatAdvisor(e.target.value, document.getElementById('build-subclass').value));
  });

  document.getElementById('build-subclass').addEventListener('change', () => {
    renderBuildSidebar();
    renderActRoute(state.act, document.getElementById('build-class').value);
    renderFeatAdvisor(document.getElementById('build-class').value, document.getElementById('build-subclass').value);
  });

  document.getElementById('build-copy-btn').addEventListener('click', function () {
    copyToClipboard(generateBuildPrompt(), this);
  });

  // ── Global Search ────────────────────────────────────────────────────
  let globalSearchTimer;
  const globalSearchEl = document.getElementById('global-search');
  if (globalSearchEl) {
    globalSearchEl.addEventListener('input', e => {
      clearTimeout(globalSearchTimer);
      globalSearchTimer = setTimeout(() => {
        state.globalSearch = e.target.value.trim();
        renderGlobalSearch(state.globalSearch);
      }, 300);
    });
  }

  // '/' shortcut: jump to Search tab from anywhere
  document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
      e.preventDefault();
      switchTab('search');
      const input = document.getElementById('global-search');
      if (input) input.focus();
    }
  });

  // ── Wishlist Panel toggle ─────────────────────────────────────────────────
  const wishlistToggle = document.getElementById('wishlist-toggle');
  if (wishlistToggle) {
    wishlistToggle.addEventListener('click', () => {
      const body  = document.getElementById('wishlist-body');
      const arrow = wishlistToggle.querySelector('.wishlist-panel__arrow');
      if (!body) return;
      const isOpen = !body.hidden;
      body.hidden = isOpen;
      wishlistToggle.setAttribute('aria-expanded', String(!isOpen));
      if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(90deg)';
    });
  }

  // ── Character Creator ──────────────────────────────────────────────────────
  document.querySelectorAll('.class-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.class-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.creatorClass = pill.dataset.class || '';
      renderCharCreatorBuilds(state.creatorClass);
      // Clear card when switching filter
      const emptyEl = document.getElementById('creator-empty');
      const cardEl  = document.getElementById('creator-card');
      if (emptyEl) emptyEl.hidden = false;
      if (cardEl)  cardEl.hidden  = true;
    });
  });
}

// ---------------------------------------------------------------------------
// Gear tooltip
// ---------------------------------------------------------------------------

function getTooltipEl() {
  let tip = document.getElementById('gear-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'gear-tooltip';
    tip.className = 'gear-tooltip';
    tip.hidden = true;
    document.body.appendChild(tip);
  }
  return tip;
}

// Generic weapon type actions shared by all weapons of a given type —
// not meaningful as item-specific callouts, so omit from tooltip.
const GENERIC_WEAPON_ACTIONS = new Set([
  'Lacerate', 'Concussive Smash', 'Piercing Strike', 'Rush Attack',
  'Topple', 'Cleave', 'Flourish', 'Pommel Strike', 'Hamstring Shot',
  'Backbreaker', 'Weakening Strike', 'Tenacity', 'Piercing Shot',
  'Maiming Strike', 'Prepare', 'Mobile Shot', 'Heartstopper',
]);

function isGenericWeaponAction(fx) {
  const m = fx.match(/^([A-Z][^:()]{0,35}?)\s*\(\s*\)\s*:/);
  return m ? GENERIC_WEAPON_ACTIONS.has(m[1].trim()) : false;
}

function rarityClass(rarity) {
  // story_item has no CSS rule — treat as legendary
  if (rarity === 'story_item') return 'rarity-legendary';
  return `rarity-${rarity || 'common'}`;
}

function showGearTooltip(item, anchorEl) {
  const tip = getTooltipEl();

  const cleanFx = s => s
    .replace(/[\u2060\u200b\uFEFF\u200c\u200d]/g, '')  // zero-width joiners / BOM
    .replace(/\s+/g, ' ')
    .trim();

  const slotLabel = item.slot ? item.slot.charAt(0).toUpperCase() + item.slot.slice(1) : '';
  const rarityLabel = RARITY_LABELS[item.rarity] || '';

  // Build tooltip content with DOM methods to avoid XSS concerns
  tip.innerHTML = '';

  const nameEl = document.createElement('div');
  nameEl.className = `gtt-name ${rarityClass(item.rarity)}`;
  nameEl.textContent = item.name;
  tip.appendChild(nameEl);

  const typeEl = document.createElement('div');
  typeEl.className = 'gtt-type';
  typeEl.textContent = [slotLabel, rarityLabel].filter(Boolean).join(' · ');
  tip.appendChild(typeEl);

  if (item.armour_class) {
    const acEl = document.createElement('div');
    acEl.className = 'gtt-stat';
    acEl.textContent = `Armour Class: ${item.armour_class}`;
    tip.appendChild(acEl);
  }

  const effects = (item.effects || [])
    .map(cleanFx)
    .filter(s => s && !isGenericWeaponAction(s));
  if (effects.length) {
    const sep = document.createElement('div');
    sep.className = 'gtt-sep';
    tip.appendChild(sep);

    const ul = document.createElement('ul');
    ul.className = 'gtt-effects';
    for (const fx of effects) {
      const li = document.createElement('li');
      li.className = 'gtt-effect';
      li.textContent = fx;
      ul.appendChild(li);
    }
    tip.appendChild(ul);
  }

  tip.hidden = false;

  // Position: right of anchor, flip left if near viewport edge
  const rect = tip.getBoundingClientRect(); // measure after content is set
  const anchor = anchorEl.getBoundingClientRect();
  const gap = 10;
  const tipW = tip.offsetWidth || 300;
  const tipH = tip.offsetHeight;

  let left = anchor.right + gap;
  if (left + tipW > window.innerWidth - 12) left = anchor.left - tipW - gap;
  if (left < 8) left = 8;

  const vh = window.visualViewport?.height ?? window.innerHeight;
  let top = anchor.top;
  if (top + tipH > vh - 12) top = vh - tipH - 12;
  if (top < 8) top = 8;

  tip.style.left = `${left}px`;
  tip.style.top  = `${top}px`;
}

function hideGearTooltip() {
  const tip = document.getElementById('gear-tooltip');
  if (tip) tip.hidden = true;
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

function init() {
  initEventListeners();
  renderPartyStrip();  // populate strip from localStorage on load
  syncActButtons('strip', state.act); // sync strip act pills
  loadBuilds();        // pre-load builds so class filter is ready
  loadCompanions();    // pre-load companions for party advisor
  renderGearResults(); // kick off Act 1 load immediately

  // Level-plan outer toggle
  const lpToggle = document.getElementById('level-plan-toggle');
  const lpBody   = document.getElementById('level-plan-body');
  const lpArrow  = lpToggle?.querySelector('.level-plan__toggle-arrow');
  if (lpToggle && lpBody) {
    lpToggle.addEventListener('click', () => {
      const open = !lpBody.hidden;
      lpBody.hidden = open;
      lpToggle.setAttribute('aria-expanded', String(!open));
      if (lpArrow) lpArrow.textContent = open ? '▸' : '▾';
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
