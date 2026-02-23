#!/usr/bin/env node
/**
 * Tav Wiki Scraper
 *
 * Pulls structured gear and build data into JSON files.
 *
 * Usage:
 *   node scraper/wiki-scraper.js --gear      # Phase 1: scrape bg3.wiki gear
 *   node scraper/wiki-scraper.js --builds    # Phase 2: scrape gamestegy builds
 *   node scraper/wiki-scraper.js --crossref  # Phase 3: cross-reference + tag gear
 *   node scraper/wiki-scraper.js --all       # Run all three phases in sequence
 *   node scraper/wiki-scraper.js --help      # Show this message
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

// cheerio loaded lazily — only needed in scraping phases
let cheerio;

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const DATA_DIR = path.join(__dirname, '..', 'data');
const GEAR_DIR = path.join(DATA_DIR, 'gear');
const LOCATIONS_FILE = path.join(DATA_DIR, 'locations.json');
const BUILDS_FILE = path.join(DATA_DIR, 'builds.json');
const COMMUNITY_BUILDS_FILE = path.join(DATA_DIR, 'community_builds.json');

// ---------------------------------------------------------------------------
// Schema constants (single source of truth)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} GearItem
 * @property {string}   id          - kebab-case slug derived from name
 * @property {string}   name        - Display name as on bg3.wiki
 * @property {string}   slot        - helmet|armour|gloves|boots|amulet|ring|weapon|shield|cloak
 * @property {string}   rarity      - common|uncommon|rare|very_rare|legendary
 * @property {number|null} armour_class
 * @property {string[]} effects     - Effect text strings from wiki infobox
 * @property {Object}   stats       - Numeric bonuses e.g. { strength: 2 }
 * @property {Object}   location
 * @property {string}   location.description - Human-readable location string
 * @property {string}   location.area        - Area name for act inference
 * @property {number}   location.act         - 1 | 2 | 3
 * @property {string[]} build_tags  - Build IDs that recommend this item (populated in Phase 3)
 * @property {string}   wiki_url    - Source URL
 */

const GEAR_SCHEMA = {
  id: '',
  name: '',
  slot: '',           // helmet|armour|gloves|boots|amulet|ring|weapon|shield|cloak
  rarity: '',         // common|uncommon|rare|very_rare|legendary
  armour_class: null,
  effects: [],
  stats: {},
  location: {
    description: '',
    area: '',
    act: 0,
  },
  build_tags: [],
  wiki_url: '',
};

/**
 * @typedef {Object} CharCreate
 * @property {Object}   ability_scores - { STR, DEX, CON, INT, WIS, CHA } base values before racial
 * @property {Array}    races          - [{ name, reason }] top 3 recommended races
 * @property {string}   background     - Recommended background name
 * @property {string[]} background_skills - Skills the background provides
 * @property {string[]} skills         - Priority skills for this build
 * @property {string[]} cantrips       - Starting cantrips (casters only)
 * @property {string[]} spells         - Starting spells (casters only)
 */

/**
 * @typedef {Object} Build
 * @property {string}     id          - kebab-case slug
 * @property {string}     name        - Display name
 * @property {string}     tier        - S+|S|A|B|C
 * @property {string}     source_url  - gamestegy.com URL
 * @property {Array}      classes     - Array of { class, subclass, levels }
 * @property {Object}     gear_by_act - { "1": [...names], "2": [...], "3": [...] }
 * @property {CharCreate} char_create - Character creation recommendations (Phase 4)
 */

const BUILD_SCHEMA = {
  id: '',
  name: '',
  tier: '',           // S+|S|A|B|C
  source_url: '',
  classes: [
    // { class: 'Paladin', subclass: 'Oath of the Ancients', levels: 5 }
  ],
  gear_by_act: {
    '1': [],
    '2': [],
    '3': [],
  },
  char_create: null,  // Populated by Phase 4 (--charCreate)
};

const VALID_SLOTS = ['helmet', 'armour', 'gloves', 'boots', 'amulet', 'ring', 'weapon', 'shield', 'cloak'];
const VALID_RARITIES = ['common', 'uncommon', 'rare', 'very_rare', 'legendary'];
const VALID_TIERS = ['S+', 'S', 'A', 'B', 'C'];

const CATEGORIES = [
  { slot: 'helmet', url: 'https://bg3.wiki/wiki/Category:Helmets' },
  // Wiki splits armour by weight class — no single Category:Armour exists
  { slot: 'armour', url: 'https://bg3.wiki/wiki/Category:Light_Armour' },
  { slot: 'armour', url: 'https://bg3.wiki/wiki/Category:Medium_Armour' },
  { slot: 'armour', url: 'https://bg3.wiki/wiki/Category:Heavy_Armour' },
  { slot: 'gloves', url: 'https://bg3.wiki/wiki/Category:Gloves' },
  { slot: 'boots',  url: 'https://bg3.wiki/wiki/Category:Boots' },
  { slot: 'amulet', url: 'https://bg3.wiki/wiki/Category:Amulets' },
  { slot: 'ring',   url: 'https://bg3.wiki/wiki/Category:Rings' },
  { slot: 'weapon', url: 'https://bg3.wiki/wiki/Category:Weapons' },
  { slot: 'shield', url: 'https://bg3.wiki/wiki/Category:Shields' },
  { slot: 'cloak',  url: 'https://bg3.wiki/wiki/Category:Cloaks' },
];

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Convert a display name to a kebab-case ID.
 * e.g. "Helmet of Arcane Acuity" → "helmet-of-arcane-acuity"
 * @param {string} name
 * @returns {string}
 */
function slugify(name) {
  // TODO: verify this handles edge cases like "8-sided" or apostrophes
  return name
    .toLowerCase()
    .replace(/['']/g, '')       // strip apostrophes
    .replace(/[^a-z0-9]+/g, '-') // non-alphanumeric → hyphen
    .replace(/^-|-$/g, '');      // trim leading/trailing hyphens
}

/**
 * Polite rate limiting — wait between requests so we don't hammer the wiki.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Infer which act (1|2|3) an item belongs to from its location text.
 * Reads locations.json and fuzzy-matches area names.
 * Returns 0 if no match found.
 *
 * @param {string} locationText - Location description from wiki
 * @param {Object} locations    - Parsed locations.json { act1: [...], act2: [...], act3: [...] }
 * @returns {number} 1 | 2 | 3 | 0
 */
function inferAct(locationText, locations) {
  // TODO: implement fuzzy matching
  // Strategy: iterate act1/act2/act3 arrays, check if locationText includes any area name
  // Return act number on first match. Fall back to 0 (unknown) if no match.
  const text = locationText.toLowerCase();
  for (const [actKey, areas] of Object.entries(locations)) {
    const actNum = parseInt(actKey.replace('act', ''), 10);
    for (const area of areas) {
      if (text.includes(area.toLowerCase())) {
        return actNum;
      }
    }
  }
  return 0;
}

/**
 * Minimal fetch wrapper using Node's built-in https.
 * Returns response body as a string.
 * @param {string} url
 * @returns {Promise<string>}
 */
function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
    https.get(url, { headers: { 'User-Agent': ua } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow single redirect
        resolve(fetchPage(res.headers.location));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Phase 1 — bg3.wiki gear scraper
// ---------------------------------------------------------------------------

/**
 * Scrape all item page URLs from a bg3.wiki category page.
 * Follows MediaWiki "next page" pagination automatically.
 *
 * @param {string} url - Category page URL
 * @returns {Promise<string[]>} Full item page URLs
 */
async function scrapeCategory(url) {
  const html = await fetchPage(url);
  const $ = cheerio.load(html);
  const urls = [];

  $('.mw-category-columns .mw-category-group a').each((_, el) => {
    const href = $(el).attr('href');
    if (href) urls.push('https://bg3.wiki' + href);
  });

  // Follow MediaWiki pagination if present
  let nextLink = null;
  $('#mw-pages a').each((_, el) => {
    if ($(el).text().trim() === 'next page') {
      nextLink = 'https://bg3.wiki' + $(el).attr('href');
    }
  });
  if (nextLink) {
    await delay(1500);
    const nextUrls = await scrapeCategory(nextLink);
    urls.push(...nextUrls);
  }

  return urls;
}

/**
 * Parse rarity and armour class from the bg3wiki property list.
 *
 * @param {Object} $ - Cheerio instance for the item page
 * @returns {{ rarity: string, armour_class: number|null }}
 */
function parsePropertyList($) {
  let rarity = '';
  let armour_class = null;

  // Standard infobox: helmets, armour, accessories (ul > li structure)
  $('.bg3wiki-property-list ul li').each((_, el) => {
    const text = $(el).text();
    if (text.includes('Rarity:')) {
      const raw = $(el).find('span[style*="color"]').first().text().trim();
      rarity = raw.toLowerCase().replace(/\s+/g, '_');
    }
    if (text.includes('Armour Class:')) {
      const match = text.match(/(\d+)/);
      if (match) armour_class = parseInt(match[1], 10);
    }
  });

  // Fallback: weapon infobox uses dl/dt/dd structure — rarity is in an img alt
  if (!rarity) {
    $('dt, dd').each((_, el) => {
      const text = $(el).text();
      if (text.includes('Rarity:')) {
        const imgAlt = $(el).find('img').first().attr('alt') || '';
        const match  = imgAlt.match(/Rarity:\s*(.+)/i);
        if (match) rarity = match[1].trim().toLowerCase().replace(/\s+/g, '_');
      }
    });
  }

  return { rarity, armour_class };
}

/**
 * Parse special effect strings from the #Special section.
 *
 * @param {Object} $ - Cheerio instance for the item page
 * @returns {string[]}
 */
function parseEffects($) {
  const specialEl = $('#Special');
  if (!specialEl.length) return [];

  const effects = [];
  let node = specialEl.closest('h3').next();

  while (node.length && !node.is('h2')) {
    if (node.is('ul')) {
      node.find('li').each((_, li) => {
        const text = $(li).text().trim();
        if (text) effects.push(text);
      });
    } else if (node.is('dl')) {
      node.find('dt').each((_, dt) => {
        const term = $(dt).text().trim();
        const def = $(dt).next('dd').text().trim();
        if (term) effects.push(def ? `${term}: ${def}` : term);
      });
    }
    // <p> nodes (intro text like "The wearer gains:") are skipped
    node = node.next();
  }

  return effects;
}

/**
 * Parse the "Where to find" section into a structured location object.
 *
 * @param {Object} $ - Cheerio instance for the item page
 * @param {Object} locations - Parsed locations.json
 * @returns {{ description: string, area: string, act: number }}
 */
function parseLocation($, locations) {
  const whereEl = $('#Where_to_find');
  if (!whereEl.length) return { description: '', area: '', act: 0 };

  // Walk forward from the h2 until we hit a tooltip box
  let node = whereEl.closest('h2').next();
  let tooltipBox = null;

  while (node.length && !node.is('h2')) {
    if (node.hasClass('bg3wiki-tooltip-box') || node.find('.bg3wiki-tooltip-box').length) {
      tooltipBox = node.hasClass('bg3wiki-tooltip-box') ? node : node.find('.bg3wiki-tooltip-box').first();
      break;
    }
    node = node.next();
  }

  if (!tooltipBox) return { description: '', area: '', act: 0 };

  const firstLi = tooltipBox.find('ul li').first();
  if (!firstLi.length) return { description: '', area: '', act: 0 };

  const area = firstLi.find('a').first().text().trim();
  const description = firstLi.text().replace(/\s+/g, ' ').trim();
  const act = inferAct(description, locations);

  return { description, area, act };
}

/**
 * Fetch and parse a single item page into a GearItem, or null if filtered.
 *
 * Filters applied:
 *   - rarity === 'common' or empty  → skip (vendor trash)
 *   - effects.length === 0          → skip (no enchantment)
 *
 * @param {string} url
 * @param {string} slot
 * @param {Object} locations
 * @returns {Promise<Object|null>}
 */
async function scrapeItemPage(url, slot, locations) {
  try {
    const html = await fetchPage(url);
    const $ = cheerio.load(html);

    const name = $('h1.firstHeading .mw-page-title-main').text().trim();
    if (!name) return null;

    const { rarity, armour_class } = parsePropertyList($);

    // Filter: skip common and unrecognised rarity items
    if (!rarity || rarity === 'common') return null;

    const effects = parseEffects($);

    // Filter: skip items with no special effects
    if (effects.length === 0) return null;

    const location = parseLocation($, locations);

    return {
      id: slugify(name),
      name,
      slot,
      rarity,
      armour_class,
      effects,
      stats: {},
      location,
      build_tags: [],
      wiki_url: url,
    };
  } catch (err) {
    console.warn(`    [skip] ${url} — ${err.message}`);
    return null;
  }
}

/**
 * Phase 1: Scrape all uncommon+ gear items from bg3.wiki that have effect text.
 *
 * Strategy:
 * 1. Fetch bg3.wiki category pages (by slot) to get item page URLs
 * 2. For each item page, parse the infobox for: name, slot, rarity, effects, location
 * 3. Use inferAct() to determine act from location text
 * 4. Write results to data/gear/act1.json, act2.json, act3.json
 *
 * Rate limit: 1.5s delay between requests.
 *
 * @param {Object} locations - Parsed locations.json
 * @returns {Promise<GearItem[]>} All scraped gear items (across all acts)
 */
/**
 * Flush allItems into act files. Called after each category so progress
 * is preserved if a later category errors.
 */
function flushGearFiles(allItems) {
  const byAct = { 1: [], 2: [], 3: [], 0: [] };
  for (const item of allItems) {
    const bucket = byAct[item.location.act] ?? byAct[0];
    bucket.push(item);
  }
  fs.writeFileSync(path.join(GEAR_DIR, 'act1.json'), JSON.stringify(byAct[1], null, 2));
  fs.writeFileSync(path.join(GEAR_DIR, 'act2.json'), JSON.stringify(byAct[2], null, 2));
  fs.writeFileSync(path.join(GEAR_DIR, 'act3.json'), JSON.stringify(byAct[3], null, 2));
  if (byAct[0].length) {
    fs.writeFileSync(path.join(GEAR_DIR, 'unknown.json'), JSON.stringify(byAct[0], null, 2));
  }
  return byAct;
}

async function scrapeWikiGear(locations) {
  cheerio = require('cheerio');
  const allItems = [];

  for (const cat of CATEGORIES) {
    console.log(`  Scraping ${cat.slot} (${cat.url})...`);
    let urls;
    try {
      urls = await scrapeCategory(cat.url);
    } catch (err) {
      console.warn(`  [skip category] ${cat.url} — ${err.message}`);
      continue;
    }
    console.log(`    ${urls.length} items found`);

    for (let i = 0; i < urls.length; i++) {
      await delay(1500);
      const item = await scrapeItemPage(urls[i], cat.slot, locations);
      if (item) allItems.push(item);
      if ((i + 1) % 10 === 0) console.log(`    ${i + 1}/${urls.length}...`);
    }

    // Flush after every category so progress survives a later failure
    const byAct = flushGearFiles(allItems);
    console.log(`    → saved (act1:${byAct[1].length} act2:${byAct[2].length} act3:${byAct[3].length} unknown:${byAct[0].length})`);
  }

  if (allItems.filter(i => i.location.act === 0).length) {
    console.log(`  Warning: some items had no act — check data/gear/unknown.json`);
  }

  return allItems;
}

// ---------------------------------------------------------------------------
// Phase 2 — gamestegy.com build scraper
// ---------------------------------------------------------------------------

// All 66 builds from gamestegy.com, organised by tier.
// Tier is hardcoded here as a fallback — the scraper also tries to read it from the page.
const BUILD_URLS = [
  // S+ Tier
  { tier: 'S+', name: 'Draconic Fire Sorcerer',        url: 'https://gamestegy.com/post/bg3/883/draconic-fire-sorcerer-build' },
  { tier: 'S+', name: 'Gloomstalker Assassin',          url: 'https://gamestegy.com/post/bg3/864/assassin-rogue-build-stalker' },
  { tier: 'S+', name: 'Abjuration Arcane Defender',     url: 'https://gamestegy.com/post/bg3/995/abjuration-wizard-build' },
  { tier: 'S+', name: 'Swords Bard Archer',             url: 'https://gamestegy.com/post/bg3/1543/swords-bard-build' },
  { tier: 'S+', name: 'Eldritch Hexknight',             url: 'https://gamestegy.com/post/bg3/1604/eldritch-hexknight-build' },
  { tier: 'S+', name: 'Lockadin',                       url: 'https://gamestegy.com/post/bg3/874/lockadin-paladin-warlock-build' },
  { tier: 'S+', name: 'Storm Sorcerer',                 url: 'https://gamestegy.com/post/bg3/882/best-storm-sorcerer-build' },
  // S Tier
  { tier: 'S',  name: 'Way of Open Hand Monk',          url: 'https://gamestegy.com/post/bg3/981/open-hand-monk-build' },
  { tier: 'S',  name: 'Berserker Thrower',              url: 'https://gamestegy.com/post/bg3/976/barbarian-berserker-thrower-build' },
  { tier: 'S',  name: 'Bardadin',                       url: 'https://gamestegy.com/post/bg3/886/bardadin-bard-paladin-build' },
  { tier: 'S',  name: 'Sorcadin',                       url: 'https://gamestegy.com/post/bg3/881/sorcadin-sorcerer-paladin-build' },
  { tier: 'S',  name: 'Eldritch Knight Thrower',        url: 'https://gamestegy.com/post/bg3/975/eldritch-knight-build-thrower' },
  { tier: 'S',  name: 'The Talos Dragonling',           url: 'https://gamestegy.com/post/bg3/1559/the-talos-dragonling-build' },
  { tier: 'S',  name: 'Stormfrost Sage',                url: 'https://gamestegy.com/post/bg3/1561/draconic-bloodline-sorcerer-build' },
  { tier: 'S',  name: 'Shadow Blade Bardadin',          url: 'https://gamestegy.com/post/bg3/1601/shadow-blade-bardadin-build' },
  { tier: 'S',  name: 'Two Hander Eldritch Knight',     url: 'https://gamestegy.com/post/bg3/1605/two-handed-eldritch-knight-build' },
  { tier: 'S',  name: 'Hunter Ranger Archer',           url: 'https://gamestegy.com/post/bg3/1607/hunter-ranger-archer-build' },
  { tier: 'S',  name: 'Stars Cleric',                   url: 'https://gamestegy.com/post/bg3/1616/stars-cleric-build' },
  { tier: 'S',  name: 'Lorecerer',                      url: 'https://gamestegy.com/post/bg3/984/sorcerer-bard-multiclass-build-lorecerer' },
  // A Tier
  { tier: 'A',  name: 'Shadow Monk',                    url: 'https://gamestegy.com/post/bg3/983/way-of-shadow-monk-build' },
  { tier: 'A',  name: 'Battle Master Fighter',          url: 'https://gamestegy.com/post/bg3/971/battle-master-build-tactical-fighter' },
  { tier: 'A',  name: 'Lore Bard',                      url: 'https://gamestegy.com/post/bg3/986/lore-bard-build' },
  { tier: 'A',  name: 'Sorlock',                        url: 'https://gamestegy.com/post/bg3/885/sorlock-sorcerer-warlock-build' },
  { tier: 'A',  name: 'Oathbreaker Paladin',            url: 'https://gamestegy.com/post/bg3/879/oathbreaker-paladin-build' },
  { tier: 'A',  name: 'Oath of Devotion Paladin',       url: 'https://gamestegy.com/post/bg3/878/oath-of-devotion-paladin-build' },
  { tier: 'A',  name: 'Oath of Ancients Paladin',       url: 'https://gamestegy.com/post/bg3/876/paladin-oath-of-ancients-build' },
  { tier: 'A',  name: 'Cold Sorcerer',                  url: 'https://gamestegy.com/post/bg3/998/cold-sorcerer-build' },
  { tier: 'A',  name: 'Bladelock',                      url: 'https://gamestegy.com/post/bg3/870/melee-warlock-build-bladelock' },
  { tier: 'A',  name: 'Light Domain Cleric',            url: 'https://gamestegy.com/post/bg3/872/light-domain-cleric-build' },
  { tier: 'A',  name: 'Tempest Domain Cleric',          url: 'https://gamestegy.com/post/bg3/871/tempest-domain-cleric-build' },
  { tier: 'A',  name: 'Blaster Cleric',                 url: 'https://gamestegy.com/post/bg3/1100/blaster-tempest-cleric-build' },
  { tier: 'A',  name: 'Bardlock',                       url: 'https://gamestegy.com/post/bg3/1003/bardlock-build' },
  { tier: 'A',  name: 'Loredin',                        url: 'https://gamestegy.com/post/bg3/1107/loredin-build' },
  { tier: 'A',  name: 'Nature Cleric',                  url: 'https://gamestegy.com/post/bg3/1544/nature-cleric-build' },
  { tier: 'A',  name: 'Arcane Archer',                  url: 'https://gamestegy.com/post/bg3/1587/arcane-archer-build' },
  { tier: 'A',  name: 'Hexblade',                       url: 'https://gamestegy.com/post/bg3/1586/hexblade-warlock-build' },
  { tier: 'A',  name: 'Bladesinger',                    url: 'https://gamestegy.com/post/bg3/1589/bladesinging-build' },
  { tier: 'A',  name: 'Oath of the Crown Paladin',      url: 'https://gamestegy.com/post/bg3/1600/oath-of-crown-paladin-build' },
  { tier: 'A',  name: 'Death Cleric',                   url: 'https://gamestegy.com/post/bg3/1613/death-cleric-build' },
  { tier: 'A',  name: 'Reverob Blender',                url: 'https://gamestegy.com/post/bg3/1617/stars-lore-bard-build' },
  { tier: 'A',  name: '2HCB Gloom Thief',               url: 'https://gamestegy.com/post/bg3/863/thief-sharpshooter-rogue-build' },
  { tier: 'A',  name: 'Giant Barbarian',                url: 'https://gamestegy.com/post/bg3/1618/giant-barbarian-build' },
  { tier: 'A',  name: 'Wildheart Tiger Barbarian',      url: 'https://gamestegy.com/post/bg3/1629/wildheart-tiger-barbarian' },
  { tier: 'A',  name: 'Moon Druid',                     url: 'https://gamestegy.com/post/bg3/1091/moon-druid-build' },
  // B Tier
  { tier: 'B',  name: 'Champion Fighter',               url: 'https://gamestegy.com/post/bg3/973/champion-build' },
  { tier: 'B',  name: 'Eldritch Blast Build',           url: 'https://gamestegy.com/post/bg3/967/eldritch-blast-build' },
  { tier: 'B',  name: 'Oath of Vengeance Paladin',      url: 'https://gamestegy.com/post/bg3/877/oath-of-vengeance-paladin-build' },
  { tier: 'B',  name: 'Magic Missile Build',            url: 'https://gamestegy.com/post/bg3/991/magic-missile-build' },
  { tier: 'B',  name: 'Life Domain Cleric',             url: 'https://gamestegy.com/post/bg3/873/life-domain-cleric-build' },
  { tier: 'B',  name: 'Beast Master',                   url: 'https://gamestegy.com/post/bg3/1008/ranger-beast-master-build' },
  { tier: 'B',  name: 'Land Druid',                     url: 'https://gamestegy.com/post/bg3/1085/land-druid-build' },
  { tier: 'B',  name: 'Ninja',                          url: 'https://gamestegy.com/post/bg3/1599/ninja-build' },
  { tier: 'B',  name: 'Knowledge Cleric',               url: 'https://gamestegy.com/post/bg3/1547/knowledge-cleric-build' },
  { tier: 'B',  name: 'Thundersnow Herald',             url: 'https://gamestegy.com/post/bg3/1095/thundersnow-druid-build' },
  { tier: 'B',  name: 'War Domain Cleric',              url: 'https://gamestegy.com/post/bg3/1563/war-domain-cleric-build' },
  { tier: 'B',  name: 'Radiating Armored Monk',         url: 'https://gamestegy.com/post/bg3/1564/radiating-armored-monk' },
  { tier: 'B',  name: "Selune's Holy Archer",           url: 'https://gamestegy.com/post/bg3/1588/selunes-holy-archer' },
  { tier: 'B',  name: 'Jack Sparrow',                   url: 'https://gamestegy.com/post/bg3/1594/jack-sparrow-build' },
  { tier: 'B',  name: 'Arcane Trickster',               url: 'https://gamestegy.com/post/bg3/860/arcane-trickster-build' },
  { tier: 'B',  name: 'Stars Druid',                    url: 'https://gamestegy.com/post/bg3/1630/stars-druid-build' },
  { tier: 'B',  name: 'Swarmkeeper Melee',              url: 'https://gamestegy.com/post/bg3/1638/swarmkeeper-sanctified-build' },
  { tier: 'B',  name: 'Wild Magic Sorcerer',            url: 'https://gamestegy.com/post/bg3/884/wild-magic-sorcerer-build' },
  { tier: 'B',  name: 'Necromancer',                    url: 'https://gamestegy.com/post/bg3/1645/necromancer-build' },
  // C Tier
  { tier: 'C',  name: 'Way of the Four Elements Monk',  url: 'https://gamestegy.com/post/bg3/982/four-elements-monk-build' },
  { tier: 'C',  name: 'Spore Druid',                    url: 'https://gamestegy.com/post/bg3/1093/spore-druid-build' },
  { tier: 'C',  name: 'Valour Bard',                    url: 'https://gamestegy.com/post/bg3/1566/valour-bard-build' },
  { tier: 'C',  name: 'Thief',                          url: 'https://gamestegy.com/post/bg3/1591/thief-build' },
  { tier: 'C',  name: 'Swashbuckler',                   url: 'https://gamestegy.com/post/bg3/1593/swashbuckler-build' },
];

// Whitelist of valid BG3 class names — used to filter table cells
const BG3_CLASSES = new Set([
  'Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk',
  'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard',
]);

// Keyword map for name-based fallback (mirrors app.js CLASS_KEYWORDS)
const CLASS_KEYWORDS_SCRAPER = {
  Barbarian: ['barbarian', 'berserker', 'wildheart', 'giant'],
  Bard:      ['bard', 'bardadin', 'bardlock', 'lorecerer', 'reverob', 'loredin'],
  Cleric:    ['cleric', 'blaster'],
  Druid:     ['druid', 'thundersnow', 'swarmkeeper'],
  Fighter:   ['fighter', 'eldritch knight', 'champion', 'battle master', '2hcb', 'hexknight'],
  Monk:      ['monk', 'ninja'],
  Paladin:   ['paladin', 'lockadin', 'bardadin', 'sorcadin', 'loredin'],
  Ranger:    ['ranger', 'gloomstalker', 'beast master', 'selune', 'holy archer', 'arcane archer'],
  Rogue:     ['rogue', 'assassin', 'thief', 'arcane trickster', 'swashbuckler', 'gloom thief'],
  Sorcerer:  ['sorcerer', 'sorcadin', 'sorlock', 'lorecerer', 'stormfrost', 'dragonling'],
  Warlock:   ['warlock', 'lockadin', 'hexblade', 'bladelock', 'bardlock', 'sorlock', 'hexknight'],
  Wizard:    ['wizard', 'arcane defender', 'bladesinger'],
};

/**
 * Extract class composition from a gamestegy build page.
 *
 * The gamestegy level-up table's first column contains feature choices
 * ("Spells", "Subclass", "Feat", etc.) — NOT class names. Multiclass builds
 * do emit a row with the class name when the level-up table changes class,
 * so we whitelist-filter against the 12 known BG3 class names to separate
 * signal from noise.
 *
 * Falls back to narrative format, then to keyword-matching against the build
 * name so pure-class builds don't come back empty.
 *
 * @param {Object} $ - Cheerio instance
 * @param {string} buildName - Build display name (used as final fallback)
 * @returns {Array<{class: string, subclass: string, levels: number}>}
 */
function extractClasses($, buildName) {
  const classCounts = {};

  // Primary: scan first column of level-up table, whitelist against BG3 class names.
  // Discards feature names ("Spells", "Subclass", "Feat") that polluted the old approach.
  const table = $('article table').first();
  if (table.length) {
    table.find('tbody tr').each((_, row) => {
      const cellText = $(row).find('td').first().text().trim();
      if (BG3_CLASSES.has(cellText)) {
        classCounts[cellText] = (classCounts[cellText] || 0) + 1;
      }
    });

    if (Object.keys(classCounts).length > 0) {
      return Object.entries(classCounts).map(([cls, levels]) => ({
        class: cls,
        subclass: '',
        levels,
      }));
    }
  }

  // Secondary: narrative format — <strong>9 Open Hand Monk</strong>
  const narrative = [];
  $('article strong').each((_, el) => {
    const text = $(el).text().trim();
    const match = text.match(/^(\d+)\s+(.+)$/);
    if (match) {
      narrative.push({
        class: match[2].trim(),
        subclass: '',
        levels: parseInt(match[1], 10),
      });
    }
  });
  if (narrative.length) return narrative;

  // Final fallback: derive from build name — reliable for pure-class builds
  // that have no class-name rows in their level-up table.
  const nameLower = buildName.toLowerCase();
  return Object.entries(CLASS_KEYWORDS_SCRAPER)
    .filter(([, kws]) => kws.some(kw => nameLower.includes(kw)))
    .map(([cls]) => ({ class: cls, subclass: '', levels: 0 }));
}

/**
 * Extract gear recommendations per act from a gamestegy build page.
 * Detects h2/h3 headings containing "Act 1", "Act 2", "Act 3" (and variants
 * like "mid-game" for Act 2 and "Final" for Act 3), then collects all text
 * from sibling nodes until the next heading.
 *
 * @param {Object} $ - Cheerio instance
 * @returns {{ '1': string[], '2': string[], '3': string[] }}
 */
function extractGearByAct($) {
  const gearByAct = { '1': [], '2': [], '3': [] };

  $('article h2, article h3').each((_, heading) => {
    const headingText = $(heading).text().toLowerCase();
    let actNum = null;

    if (/act\s*1/.test(headingText)) {
      actNum = 1;
    } else if (/act\s*2|mid.?game/.test(headingText)) {
      actNum = 2;
    } else if (/act\s*3|final/.test(headingText)) {
      actNum = 3;
    }

    if (!actNum) return;

    // Collect text from DOM siblings until the next heading
    const textParts = [];
    let node = $(heading).next();
    while (node.length) {
      const tag = node.prop('tagName')?.toLowerCase();
      if (tag === 'h2' || tag === 'h3') break;
      const text = node.text().trim();
      if (text) textParts.push(text);
      node = node.next();
    }

    if (textParts.length) {
      gearByAct[String(actNum)].push(textParts.join(' '));
    }
  });

  return gearByAct;
}

// ---------------------------------------------------------------------------
// Phase 4 — Character creation extraction
// ---------------------------------------------------------------------------

const ABILITY_NAMES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

const SKILL_NAMES = [
  'Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception',
  'History', 'Insight', 'Intimidation', 'Investigation', 'Medicine',
  'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion',
  'Sleight of Hand', 'Stealth', 'Survival',
];

/**
 * Parse "STR - 8, DEX - 16 (15+1), CON - 14..." into { STR:8, DEX:16, ... }.
 * Uses matchAll to avoid RegExp.exec (which triggers security linters).
 * @param {string} text
 * @returns {Object|null}
 */
function parseAbilityScores(text) {
  const scores = {};
  for (const m of text.matchAll(/(STR|DEX|CON|INT|WIS|CHA)\s*[-:]\s*(\d+)/gi)) {
    scores[m[1].toUpperCase()] = parseInt(m[2], 10);
  }
  return ABILITY_NAMES.every(a => scores[a]) ? scores : null;
}

/**
 * Strip icon tokens like "[Fire Bolt]" and split on commas/semicolons.
 * @param {string} text
 * @returns {string[]}
 */
function parseItemList(text) {
  return text
    .replace(/\[.*?\]/g, '')
    .split(/[,;]/)
    .map(s => s.trim())
    .filter(s => s.length > 1);
}

/**
 * Extract the level-up plan from the gamestegy "Leveling Overview" table.
 * Returns one entry per level. Multi-row levels (where gamestegy splits choices
 * across continuation rows) are consolidated into a `choices` array.
 *
 * Table format:
 *   Header row: Level | Class | Selection
 *   Level row (3 td):  [levelNum, className, primaryChoice]
 *   Continuation row (1 td): [additionalChoice]
 *
 * @param {Object} $ - Cheerio instance
 * @returns {Array<{level:number, cls:string, choices:string[]}>}
 */
function extractLevelPlan($) {
  // Locate the "Leveling Overview" H2
  let levelH2 = null;
  $('#post-body-text h2').each((_, el) => {
    if (/leveling/i.test($(el).text())) { levelH2 = $(el); return false; }
  });
  if (!levelH2) return [];

  // Walk to the first <table> after the H2
  let tbl = levelH2.next();
  while (tbl.length && tbl.prop('tagName')?.toLowerCase() !== 'table') tbl = tbl.next();
  if (!tbl.length) return [];

  const clean = s => s
    .replace(/[\u200b\u200c\u200d\u2060\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const levels = [];
  let current = null;

  tbl.find('tr').each((_, row) => {
    const cells = $(row).find('td')
      .map((_, c) => clean($(c).text()))
      .get()
      .filter(c => c.length > 0);

    if (cells.length === 0) return; // header <th> rows

    if (cells.length >= 2) {
      // New level row: cells = [levelNum, className, primaryChoice?]
      const levelNum = parseInt(cells[0], 10);
      if (isNaN(levelNum)) return;
      current = { level: levelNum, cls: cells[1], choices: [] };
      if (cells[2]) current.choices.push(cells[2]);
      levels.push(current);
    } else if (cells.length === 1 && current) {
      // Continuation row: additional choice for the current level
      current.choices.push(cells[0]);
    }
  });

  return levels;
}

/**
 * Extract the build intro blurb from a gamestegy page.
 * Grabs paragraph text before the first H2 in the article body.
 * Returns up to ~500 characters across 1-2 paragraphs.
 * @param {Object} $ - Cheerio instance
 * @returns {string} Blurb text, or empty string if none found
 */
function extractBlurb($) {
  // Gamestegy structure:
  //   div#post-body-text
  //     div.text-styles__introduction  ← short generic intro ("In this post...")
  //     div.mce-toc                    ← table of contents (skip)
  //     H2 (build section heading)     ← first real section
  //       P P UL P UL P               ← build overview content
  //     H2 "Leveling Overview"         ← stop here
  //
  // Strategy: collect P tags between the first H2 and second H2.
  // Those paragraphs are the actual build overview, which makes the best blurb.

  const contentEl = $('#post-body-text').first();
  if (!contentEl.length) return '';

  const cleanText = s => s
    .replace(/[\u200b\u200c\u200d\u2060\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Walk children to find the window between H2[0] and H2[1]
  let h2Count = 0;
  const parts = [];
  let charCount = 0;
  const MAX = 500;

  contentEl.children().each((_, el) => {
    const tag = $(el).prop('tagName')?.toLowerCase();

    if (tag === 'h2') {
      h2Count++;
      if (h2Count >= 2) return false; // stop after second H2
      return; // continue past first H2
    }

    if (h2Count === 1 && tag === 'p') {
      const text = cleanText($(el).text());
      if (text.length < 40) return;
      if (/your browser doesn'?t support/i.test(text)) return;
      parts.push(text);
      charCount += text.length;
      if (charCount >= MAX) return false;
    }
  });

  return parts.join(' ').trim();
}

/**
 * Extract up to 3 race recommendations from the Races section heading.
 * Handles both table format (image | features | description) and list format.
 * @param {Object} $
 * @param {Object} racesNode - Cheerio node of the "Races" heading
 * @returns {Array<{name: string, reason: string}>}
 */
function extractRaces($, racesNode) {
  const races = [];
  let node = racesNode.next();

  while (node.length && races.length === 0) {
    const tag = node.prop('tagName')?.toLowerCase();
    if (tag === 'h2') break;

    if (tag === 'table' || node.find('table').length) {
      const table = tag === 'table' ? node : node.find('table').first();
      table.find('tbody tr').each((_, row) => {
        const cells  = $(row).find('td');
        if (cells.length < 2) return;
        const name   = cells.first().find('a, strong').first().text().trim()
                     || cells.first().text().trim();
        const reason = cells.last().text().replace(/\s+/g, ' ').trim();
        if (name) races.push({ name, reason });
      });
    } else if (tag === 'ul' || tag === 'ol') {
      node.find('li').each((_, li) => {
        const bold   = $(li).find('strong').first().text().trim();
        const full   = $(li).text().replace(/\s+/g, ' ').trim();
        const reason = full.replace(bold, '').replace(/^[\s\u2014\u2013-]+/, '');
        if (bold) races.push({ name: bold, reason });
      });
    }

    node = node.next();
  }

  return races.slice(0, 3);
}

/**
 * Return all BG3 skill names present in a block of text.
 * @param {string} text
 * @returns {string[]}
 */
function extractSkillsFromText(text) {
  return SKILL_NAMES.filter(skill => text.includes(skill));
}

/**
 * Extract background name and skills from a "Background" heading section.
 * Handles paragraph, list, and table formats gamestegy uses.
 * @param {Object} $ - Cheerio instance
 * @param {Object} bgNode - Cheerio node of the background heading
 * @returns {{ background: string, background_skills: string[] }}
 */
function extractBackground($, bgNode) {
  let background = '';
  let background_skills = [];
  let paragraphFallback = '';
  let node = bgNode.next();

  while (node.length) {
    const tag = node.prop('tagName')?.toLowerCase();
    if (tag === 'h2' || tag === 'h3') break;

    if (tag === 'table') {
      // Table columns: Background | Skills | Description
      // First row is a <th> header row; first <td> row = primary recommendation
      node.find('tbody tr').each((_, row) => {
        if (background) return; // already found
        const cells = $(row).find('td');
        if (!cells.length) return; // skip header rows (<th>)
        const name  = cells.first().find('a, strong').first().text().trim()
                    || cells.first().text().replace(/\[.*?\]/g, '').trim();
        if (name) {
          background = name;
          background_skills = extractSkillsFromText(cells.eq(1).text());
        }
      });
      if (background) break;
    } else if ((tag === 'p' || tag === 'ul' || tag === 'ol') && !paragraphFallback) {
      const boldName = node.find('strong, b').first().text().trim();
      if (boldName) paragraphFallback = boldName;
    }

    node = node.next();
  }

  // Only use paragraph text if no table found
  if (!background && paragraphFallback) {
    background = paragraphFallback;
  }

  return { background, background_skills };
}

/**
 * Walk siblings from a heading until the next heading of equal or higher level,
 * returning the first sibling that matches a CSS selector.
 * @param {Object} $
 * @param {Object} headingEl - Cheerio element of the heading
 * @param {string} selector  - e.g. 'table', 'ul, ol'
 * @returns {Object|null} Cheerio node or null
 */
function firstSiblingOfType($, headingEl, selector) {
  let node = headingEl.next();
  while (node.length) {
    const tag = node.prop('tagName')?.toLowerCase();
    if (tag === 'h2' || tag === 'h3') break;
    if (node.is(selector)) return node;
    node = node.next();
  }
  return null;
}

/**
 * Extract text from the first column of the table that follows a heading.
 * Strips icon tokens like "[Fire Bolt]". Returns an array of strings.
 * @param {Object} $
 * @param {Object} headingEl
 * @returns {string[]}
 */
function extractTableFirstColumn($, headingEl) {
  const table = firstSiblingOfType($, headingEl, 'table');
  if (!table) return [];
  const items = [];
  table.find('tbody tr').each((_, row) => {
    const name = $(row).find('td').first().text().replace(/\[.*?\]/g, '').trim();
    if (name) items.push(name);
  });
  return items;
}

/**
 * Parse character creation data from a gamestegy build page.
 * Collects: ability_scores, races, background, skills, cantrips, spells.
 * @param {Object} $ - Cheerio instance
 * @returns {Object|null} CharCreate object, or null if no data found
 */
function extractCharCreate($) {
  const result = {
    ability_scores: {},
    races: [],
    background: '',
    background_skills: [],
    skills: [],
    cantrips: [],
    spells: [],
  };

  // ── Ability scores: gamestegy custom .bg3-ability-* component ─────────────
  const ABILITY_MAP = {
    Strength: 'STR', Dexterity: 'DEX', Constitution: 'CON',
    Intelligence: 'INT', Wisdom: 'WIS', Charisma: 'CHA',
  };
  $('.bg3-ability-row').each((_, row) => {
    const name = $(row).find('.bg3-ability-name').text().trim();
    const val  = parseInt($(row).find('.bg3-ability-value').text().trim(), 10);
    const abbr = ABILITY_MAP[name];
    if (abbr && !isNaN(val)) result.ability_scores[abbr] = val;
  });

  // ── H3 section scanner ─────────────────────────────────────────────────────
  // Gamestegy places each char-create field in its own H3 section.
  // Background H3 → paragraph + table (Background | Skills | Description)
  // Cantrips H3  → table (Cantrip | Description)
  // Spells H3    → table (Spell | Description)
  // Skills H3    → UL of skill names
  // Races H3     → table or list (handled by extractRaces)
  $('article h2, article h3').each((_, el) => {
    const heading = $(el).text().trim();
    const $h = $(el);

    if (/^races?$/i.test(heading) && !result.races.length) {
      result.races = extractRaces($, $h);
    }

    if (/^background$/i.test(heading) && !result.background) {
      const r = extractBackground($, $h);
      result.background        = r.background;
      result.background_skills = r.background_skills;
    }

    if (/^cantrips?$/i.test(heading) && !result.cantrips.length) {
      result.cantrips = extractTableFirstColumn($, $h);
    }

    if (/^spells?$/i.test(heading) && !result.spells.length) {
      result.spells = extractTableFirstColumn($, $h);
    }

    if (/^skills?/i.test(heading) && !result.skills.length) {
      const list = firstSiblingOfType($, $h, 'ul, ol');
      if (list) {
        list.find('li').each((_, li) => {
          const s = $(li).text().trim();
          if (s) result.skills.push(s);
        });
      }
    }

    // Older builds: H3 "Abilities" → (optional P / H4) → TABLE
    // Table columns: Ability Name | Value ("16 (14+2)" or "8") | Description
    if (/^abilities$/i.test(heading) && !Object.keys(result.ability_scores).length) {
      const FULL_TO_ABBR = {
        strength: 'STR', dexterity: 'DEX', constitution: 'CON',
        intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA',
      };
      const table = firstSiblingOfType($, $h, 'table');
      if (table) {
        table.find('tbody tr').each((_, row) => {
          const cells = $(row).find('td');
          if (cells.length < 2) return;
          const abbr = FULL_TO_ABBR[cells.first().text().trim().toLowerCase()];
          const val  = parseInt(cells.eq(1).text().trim(), 10); // "16 (14+2)" → 16
          if (abbr && !isNaN(val)) result.ability_scores[abbr] = val;
        });
      }
    }
  });

  // ── Fallback: text-based ability score parsing (STR - 8 format) ────────────
  if (!Object.keys(result.ability_scores).length) {
    const scores = parseAbilityScores($('article').text());
    if (scores) result.ability_scores = scores;
  }

  const hasData = Object.keys(result.ability_scores).length > 0
    || result.races.length > 0;

  return hasData ? result : null;
}

/**
 * Phase 5: Re-fetch all gamestegy build pages and extract intro blurb text.
 * Non-destructive — only adds/updates the `blurb_raw` field.
 * After running, hand-edit blurb_raw → blurb for each build.
 * @returns {Promise<void>}
 */
async function scrapeBlurbs() {
  cheerio = cheerio || require('cheerio');
  const builds = JSON.parse(fs.readFileSync(BUILDS_FILE, 'utf8'));
  let updated = 0;

  for (let i = 0; i < builds.length; i++) {
    const build = builds[i];
    const url   = BUILD_URLS.find(b => slugify(b.name) === build.id)?.url || build.source_url;

    console.log(`  [${i + 1}/${builds.length}] ${build.name}...`);
    try {
      await delay(2000);
      const html  = await fetchPage(url);
      const $     = cheerio.load(html);
      const blurb = extractBlurb($);
      if (blurb) {
        build.blurb_raw = blurb;
        updated++;
        console.log(`    → ${blurb.length} chars`);
      } else {
        console.log(`    → no intro found`);
      }
    } catch (err) {
      console.warn(`    [skip] ${build.name} — ${err.message}`);
    }
  }

  fs.writeFileSync(BUILDS_FILE, JSON.stringify(builds, null, 2));
  console.log(`  → builds.json updated (${updated} blurbs extracted)`);
}

// ---------------------------------------------------------------------------
// Gear Recs helpers
// ---------------------------------------------------------------------------

/**
 * Extract gamestegy Equipment Recommendations tables from a loaded page.
 * Returns { act1: string[], act2: string[], act3: string[] } — item names per act.
 */
function extractGearRecs($) {
  const recs = { act1: [], act2: [], act3: [] };
  let inEquip = false;
  let currentAct = null;

  function cleanName(raw) {
    return raw
      .replace(/\s*\(BiS\)\s*/gi, '')
      .replace(/\s*\(Best in Slot\)\s*/gi, '')
      .replace(/​/g, '')   // zero-width space
      .trim();
  }

  function parseTable(tableEl) {
    $(tableEl).find('tr').each((i, row) => {
      if (i === 0) return; // skip header
      const tds = $(row).find('td');
      let rawName = '';
      if      (tds.length >= 3) rawName = $(tds.get(1)).text().trim(); // Slot | Item | Desc
      else if (tds.length === 2) rawName = $(tds.get(0)).text().trim(); // Item | Desc
      else if (tds.length === 1) rawName = $(tds.get(0)).text().trim(); // Item only
      const name = cleanName(rawName);
      if (name && name.toLowerCase() !== 'item' && name.length > 2 && name.length < 80) {
        if (!recs[currentAct].includes(name)) recs[currentAct].push(name);
      }
    });
  }

  $('#post-body-text').children().each((_, el) => {
    const tag  = $(el).prop('tagName');
    const text = $(el).text().trim().toLowerCase();

    if (tag === 'H2') {
      if (text.includes('equipment')) { inEquip = true; return; }
      if (inEquip) return false; // reached next H2 — stop
    }
    if (!inEquip) return;

    if (tag === 'H3') {
      if      (text.includes('act 1') || text.includes('early'))           currentAct = 'act1';
      else if (text.includes('act 2') || text.includes('mid'))             currentAct = 'act2';
      else if (text.includes('act 3') || text.includes('final') || text.includes('late')) currentAct = 'act3';
      return;
    }

    if (!currentAct) return;

    if (tag === 'TABLE') {
      parseTable(el);
    } else {
      // Some pages wrap tables in a DIV
      $(el).find('table').each((_, t) => parseTable(t));
    }
  });

  return recs;
}

/**
 * Phase 7: Re-fetch all gamestegy build pages and extract gear recommendations
 * per act from the Equipment Recommendations section.
 * Skips community builds (no gamestegy URL).
 */
async function scrapeGearRecs() {
  cheerio = cheerio || require('cheerio');
  const builds = JSON.parse(fs.readFileSync(BUILDS_FILE, 'utf8'));
  let updated = 0;
  let empty   = 0;

  for (let i = 0; i < builds.length; i++) {
    const build = builds[i];
    const entry = BUILD_URLS.find(b => slugify(b.name) === build.id);
    if (!entry) { console.log(`  [${i + 1}/${builds.length}] ${build.name} — no URL, skipping`); continue; }

    console.log(`  [${i + 1}/${builds.length}] ${build.name}...`);
    try {
      await delay(1500);
      const html = await fetchPage(entry.url);
      const $    = cheerio.load(html);
      const recs = extractGearRecs($);
      const total = recs.act1.length + recs.act2.length + recs.act3.length;

      if (total > 0) {
        build.gear_recs = recs;
        updated++;
        console.log(`    → act1:${recs.act1.length}  act2:${recs.act2.length}  act3:${recs.act3.length}`);
      } else {
        console.log(`    → no equipment section found`);
        empty++;
      }
    } catch (err) {
      console.warn(`    [skip] ${build.name} — ${err.message}`);
    }
  }

  fs.writeFileSync(BUILDS_FILE, JSON.stringify(builds, null, 2));
  console.log(`  → builds.json updated (${updated} builds got gear_recs, ${empty} empty)`);
}

/**
 * Phase 6: Re-fetch all gamestegy build pages and extract level-up plan tables.
 * Non-destructive — only adds/updates the `level_plan` field.
 * @returns {Promise<void>}
 */
async function scrapeLevelPlans() {
  cheerio = cheerio || require('cheerio');
  const builds = JSON.parse(fs.readFileSync(BUILDS_FILE, 'utf8'));
  let updated = 0;

  for (let i = 0; i < builds.length; i++) {
    const build = builds[i];
    const url   = BUILD_URLS.find(b => slugify(b.name) === build.id)?.url || build.source_url;

    console.log(`  [${i + 1}/${builds.length}] ${build.name}...`);
    try {
      await delay(2000);
      const html  = await fetchPage(url);
      const $     = cheerio.load(html);
      const plan  = extractLevelPlan($);
      if (plan.length) {
        build.level_plan = plan;
        updated++;
        console.log(`    → ${plan.length} levels`);
      } else {
        console.log(`    → no leveling table found`);
      }
    } catch (err) {
      console.warn(`    [skip] ${build.name} — ${err.message}`);
    }
  }

  fs.writeFileSync(BUILDS_FILE, JSON.stringify(builds, null, 2));
  console.log(`  → builds.json updated (${updated} level plans extracted)`);
}

/**
 * Phase 4: Re-fetch all gamestegy build pages and merge char_create data
 * into existing builds.json. Non-destructive — only adds the char_create field.
 * @returns {Promise<void>}
 */
async function scrapeCharCreate() {
  cheerio = cheerio || require('cheerio');
  const builds = JSON.parse(fs.readFileSync(BUILDS_FILE, 'utf8'));
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < builds.length; i++) {
    const build = builds[i];
    const url   = BUILD_URLS.find(b => slugify(b.name) === build.id)?.url || build.source_url;

    console.log(`  [${i + 1}/${builds.length}] ${build.name}...`);
    try {
      await delay(2000);
      const html = await fetchPage(url);
      const $    = cheerio.load(html);
      const cc   = extractCharCreate($);
      if (cc) {
        build.char_create = cc;
        updated++;
        console.log(`    → races:${cc.races.length} scores:${Object.keys(cc.ability_scores).length} skills:${cc.skills.length} cantrips:${cc.cantrips.length}`);
      } else {
        console.log(`    → no char_create data found`);
        skipped++;
      }
    } catch (err) {
      console.warn(`    [skip] ${build.name} — ${err.message}`);
      skipped++;
    }
  }

  fs.writeFileSync(BUILDS_FILE, JSON.stringify(builds, null, 2));
  console.log(`  → builds.json updated (${updated} enriched, ${skipped} without data)`);
}

/**
 * Parse a fully-loaded gamestegy build page into a Build object.
 *
 * @param {Object} $ - Cheerio instance
 * @param {{ tier: string, name: string, url: string }} meta
 * @returns {Build}
 */
function parseBuildPage($, meta) {
  let { tier, name, url } = meta;

  // Try to read tier from on-page badge; fall back to hardcoded tier from BUILD_URLS
  const tierText = $('.post-tags__build-tier').first().text().trim();
  if (tierText) {
    const extracted = tierText.replace(/-?Tier/i, '').trim();
    if (VALID_TIERS.includes(extracted)) tier = extracted;
  }

  return {
    id: slugify(name),
    name,
    tier,
    source_url: url,
    classes: extractClasses($, name),
    gear_by_act: extractGearByAct($),
  };
}

/**
 * Phase 2: Scrape all build pages from gamestegy.com.
 *
 * Iterates BUILD_URLS with a 2-second delay between requests (~3-5 min total).
 * Failed pages are skipped with a warning — they won't break the run.
 * Writes data/builds.json on completion.
 *
 * @returns {Promise<Build[]>}
 */
async function scrapeGamestegyBuilds() {
  cheerio = cheerio || require('cheerio');
  const builds = [];

  for (let i = 0; i < BUILD_URLS.length; i++) {
    const meta = BUILD_URLS[i];
    console.log(`  [${i + 1}/${BUILD_URLS.length}] ${meta.name}...`);

    try {
      await delay(2000);
      const html = await fetchPage(meta.url);
      const $ = cheerio.load(html);
      const build = parseBuildPage($, meta);
      builds.push(build);
      const actSummary = Object.entries(build.gear_by_act)
        .map(([a, v]) => `act${a}:${v.length}`)
        .join(' ');
      console.log(`    → tier:${build.tier} classes:${build.classes.length} gear(${actSummary})`);
    } catch (err) {
      console.warn(`    [skip] ${meta.name} — ${err.message}`);
    }
  }

  fs.writeFileSync(BUILDS_FILE, JSON.stringify(builds, null, 2));
  console.log(`  → builds.json written (${builds.length} builds)`);
  return builds;
}

// ---------------------------------------------------------------------------
// Phase 3 — Cross-reference pass
// ---------------------------------------------------------------------------

/**
 * Phase 3: Tag gear items with build IDs based on name matches in build text.
 *
 * For each build → for each act's raw text blocks:
 *   - Exact substring match: if the gear item's full name appears in the text,
 *     add the build's ID to that item's build_tags array.
 *   - Logs capitalised multi-word sequences that don't match any known item
 *     (potential missing items — expected to include many false positives).
 *
 * Mutates gear items in place.
 *
 * @param {GearItem[]} gear   - All gear items (pre-loaded)
 * @param {Build[]}    builds - All builds (pre-loaded)
 * @returns {GearItem[]} Same array, with build_tags populated
 */
function crossReference(gear, builds) {
  const unmatchedCandidates = new Set();

  for (const build of builds) {
    for (const textBlocks of Object.values(build.gear_by_act)) {
      for (const textBlock of textBlocks) {
        const lower = textBlock.toLowerCase();

        // Tag any gear item whose full name appears in this text block
        for (const item of gear) {
          if (item.name.length <= 3) continue;
          if (lower.includes(item.name.toLowerCase())) {
            if (!item.build_tags.includes(build.id)) {
              item.build_tags.push(build.id);
            }
          }
        }

        // Collect capitalised multi-word sequences as candidates for unmatched items
        const candidates = textBlock.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4}/g) || [];
        for (const candidate of candidates) {
          if (candidate.length <= 6) continue;
          const known = gear.some(g => g.name.toLowerCase() === candidate.toLowerCase());
          if (!known) unmatchedCandidates.add(candidate);
        }
      }
    }
  }

  const tagged = gear.filter(g => g.build_tags.length > 0).length;
  console.log(`  Cross-referenced ${builds.length} builds against ${gear.length} gear items`);
  console.log(`  → ${tagged} gear items tagged`);

  if (unmatchedCandidates.size > 0) {
    const sample = [...unmatchedCandidates].slice(0, 20);
    console.log(`  Potential unmatched items (${unmatchedCandidates.size} candidates — includes false positives):`);
    for (const name of sample) console.log(`    - ${name}`);
    if (unmatchedCandidates.size > 20) console.log(`    ... and ${unmatchedCandidates.size - 20} more`);
  }

  return gear;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Tav Wiki Scraper

Usage:
  node scraper/wiki-scraper.js --gear        Phase 1: scrape bg3.wiki gear
  node scraper/wiki-scraper.js --builds      Phase 2: scrape gamestegy builds
  node scraper/wiki-scraper.js --crossref    Phase 3: cross-reference + tag gear
  node scraper/wiki-scraper.js --charCreate  Phase 4: add character creation data to builds
  node scraper/wiki-scraper.js --all         Run all four phases in sequence
  node scraper/wiki-scraper.js --help        Show this message

Output:
  data/gear/act1.json   Gear found in Act 1
  data/gear/act2.json   Gear found in Act 2
  data/gear/act3.json   Gear found in Act 3
  data/builds.json      Build definitions with class compositions, gear lists, char_create
`.trim());
    process.exit(0);
  }

  const runGear       = args.includes('--gear')       || args.includes('--all');
  const runBuilds     = args.includes('--builds')     || args.includes('--all');
  const runCrossref   = args.includes('--crossref')   || args.includes('--all');
  const runCharCreate = args.includes('--charCreate') || args.includes('--all');
  const runBlurbs     = args.includes('--blurbs');
  const runLevelPlan  = args.includes('--levelPlan');
  const runGearRecs   = args.includes('--gearRecs');

  const locations = JSON.parse(fs.readFileSync(LOCATIONS_FILE, 'utf8'));

  let allGear = [];

  if (runGear) {
    console.log('Phase 1: Scraping bg3.wiki gear...');
    cheerio = require('cheerio');
    allGear = await scrapeWikiGear(locations);
    console.log(`  → ${allGear.length} items scraped`);
  }

  if (runBuilds) {
    console.log('Phase 2: Scraping gamestegy builds...');
    cheerio = cheerio || require('cheerio');
    await scrapeGamestegyBuilds();
  }

  if (runCharCreate) {
    console.log('Phase 4: Scraping character creation data...');
    cheerio = cheerio || require('cheerio');
    await scrapeCharCreate();
  }

  if (runCrossref) {
    console.log('Phase 3: Cross-referencing gear + builds...');
    const act1 = JSON.parse(fs.readFileSync(path.join(GEAR_DIR, 'act1.json'), 'utf8'));
    const act2 = JSON.parse(fs.readFileSync(path.join(GEAR_DIR, 'act2.json'), 'utf8'));
    const act3 = JSON.parse(fs.readFileSync(path.join(GEAR_DIR, 'act3.json'), 'utf8'));
    const builds = JSON.parse(fs.readFileSync(BUILDS_FILE, 'utf8'));
    const communityBuilds = JSON.parse(fs.readFileSync(COMMUNITY_BUILDS_FILE, 'utf8'));
    const allBuilds = [...builds, ...communityBuilds];
    const gear = [...act1, ...act2, ...act3];
    const tagged = crossReference(gear, allBuilds);
    console.log(`  → cross-referencing ${builds.length} gamestegy + ${communityBuilds.length} community builds`);
    // Write back split by act
    const byAct = { 1: [], 2: [], 3: [] };
    for (const item of tagged) byAct[item.location.act]?.push(item);
    fs.writeFileSync(path.join(GEAR_DIR, 'act1.json'), JSON.stringify(byAct[1], null, 2));
    fs.writeFileSync(path.join(GEAR_DIR, 'act2.json'), JSON.stringify(byAct[2], null, 2));
    fs.writeFileSync(path.join(GEAR_DIR, 'act3.json'), JSON.stringify(byAct[3], null, 2));
    console.log('  → gear act files updated with build_tags');
  }

  if (runBlurbs) {
    console.log('Phase 5: Scraping build intro blurbs...');
    await scrapeBlurbs();
  }

  if (runLevelPlan) {
    console.log('Phase 6: Scraping level-up plans...');
    await scrapeLevelPlans();
  }

  if (runGearRecs) {
    console.log('Phase 7: Scraping gear recommendations...');
    await scrapeGearRecs();
  }

  console.log('Done.');
}

if (require.main === module) {
  main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}

// Export schemas and utilities for testing / reuse
module.exports = {
  GEAR_SCHEMA,
  BUILD_SCHEMA,
  BUILD_URLS,
  VALID_SLOTS,
  VALID_RARITIES,
  VALID_TIERS,
  slugify,
  delay,
  inferAct,
  extractClasses,
  extractGearByAct,
  extractCharCreate,
  crossReference,
};
