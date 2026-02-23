'use strict';
/**
 * One-time targeted scraper for Category:Clothing.
 * Merges results into existing act1/act2/act3.json without re-scraping everything.
 *
 * Usage: node scraper/scrape-clothing.js
 */

const fs      = require('fs');
const path    = require('path');
const https   = require('https');
const cheerio = require('cheerio');

const DATA_DIR  = path.join(__dirname, '..', 'data');
const GEAR_DIR  = path.join(DATA_DIR, 'gear');
const locations = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'locations.json'), 'utf8'));

const RARITY_ORDER = { legendary: 0, very_rare: 1, rare: 2, uncommon: 3, common: 4 };

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function slugify(name) {
  return name.toLowerCase().replace(/['']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function inferAct(text) {
  const lower = (text || '').toLowerCase();
  for (const [actKey, areas] of Object.entries(locations)) {
    const actNum = parseInt(actKey.replace('act', ''), 10);
    for (const area of areas) {
      if (lower.includes(area.toLowerCase())) return actNum;
    }
  }
  return 0;
}

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Tav/1.0 BG3 companion tool (educational)' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(fetchPage(res.headers.location));
        return;
      }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

async function scrapeCategory(url) {
  const html = await fetchPage(url);
  const $    = cheerio.load(html);
  const urls = [];
  $('.mw-category-columns .mw-category-group a').each((_, el) => {
    const href = $(el).attr('href');
    if (href) urls.push('https://bg3.wiki' + href);
  });
  let nextLink = null;
  $('#mw-pages a').each((_, el) => {
    if ($(el).text().trim() === 'next page') nextLink = 'https://bg3.wiki' + $(el).attr('href');
  });
  if (nextLink) {
    await delay(1500);
    urls.push(...await scrapeCategory(nextLink));
  }
  return urls;
}

function parsePropertyList($) {
  let rarity = '';
  let armour_class = null;

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

function parseEffects($) {
  const specialEl = $('#Special');
  if (!specialEl.length) return [];
  const effects = [];
  let node = specialEl.closest('h3').next();
  while (node.length && !node.is('h2')) {
    if (node.is('ul')) {
      node.find('li').each((_, li) => { const t = $(li).text().trim(); if (t) effects.push(t); });
    } else if (node.is('dl')) {
      node.find('dt').each((_, dt) => {
        const term = $(dt).text().trim();
        const def  = $(dt).next('dd').text().trim();
        if (term) effects.push(def ? `${term}: ${def}` : term);
      });
    }
    node = node.next();
  }
  return effects;
}

function parseLocation($) {
  const whereEl = $('#Where_to_find');
  if (!whereEl.length) return { description: '', area: '', act: 0 };
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
  const area        = firstLi.find('a').first().text().trim();
  const description = firstLi.text().replace(/\s+/g, ' ').trim();
  return { description, area, act: inferAct(description) };
}

async function scrapeItem(url) {
  try {
    const html = await fetchPage(url);
    const $    = cheerio.load(html);
    const name = $('h1.firstHeading .mw-page-title-main').text().trim();
    if (!name) return null;
    const { rarity, armour_class } = parsePropertyList($);
    if (!rarity || rarity === 'common') return null;
    const effects = parseEffects($);
    if (!effects.length) return null;
    const location = parseLocation($);
    return { id: slugify(name), name, slot: 'armour', rarity, armour_class, effects, stats: {}, location, build_tags: [], wiki_url: url };
  } catch (err) {
    console.warn(`  [skip] ${url} — ${err.message}`);
    return null;
  }
}

async function main() {
  console.log('Scraping Category:Clothing...');
  const urls = await scrapeCategory('https://bg3.wiki/wiki/Category:Clothing');
  console.log(`  ${urls.length} items found`);

  const items = [];
  for (let i = 0; i < urls.length; i++) {
    await delay(1500);
    const item = await scrapeItem(urls[i]);
    if (item) items.push(item);
    if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${urls.length}... (${items.length} kept)`);
  }

  console.log(`\n  ${items.length} clothing items with effects`);

  // Merge into existing act files
  const byAct = { 1: [], 2: [], 3: [], 0: [] };
  for (const item of items) (byAct[item.location.act] || byAct[0]).push(item);

  for (const act of [1, 2, 3]) {
    const file     = path.join(GEAR_DIR, `act${act}.json`);
    const existing = JSON.parse(fs.readFileSync(file, 'utf8'));
    const ids      = new Set(existing.map(i => i.id));
    const toAdd    = byAct[act].filter(i => !ids.has(i.id));
    fs.writeFileSync(file, JSON.stringify([...existing, ...toAdd], null, 2));
    console.log(`  Act ${act}: +${toAdd.length} → ${existing.length + toAdd.length} total`);
  }

  if (byAct[0].length) {
    const file     = path.join(GEAR_DIR, 'unknown.json');
    const existing = JSON.parse(fs.readFileSync(file, 'utf8'));
    const ids      = new Set(existing.map(i => i.id));
    const toAdd    = byAct[0].filter(i => !ids.has(i.id));
    fs.writeFileSync(file, JSON.stringify([...existing, ...toAdd], null, 2));
    console.log(`  Unknown: +${toAdd.length}`);
  }

  console.log('Done.');
}

main().catch(err => { console.error(err.message); process.exit(1); });
