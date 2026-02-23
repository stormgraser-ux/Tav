const GENERIC = new Set(['Lacerate','Concussive Smash','Piercing Strike','Rush Attack','Topple','Cleave','Flourish','Pommel Strike','Hamstring Shot','Backbreaker','Weakening Strike','Tenacity','Piercing Shot','Maiming Strike','Prepare','Mobile Shot','Heartstopper']);
const isGeneric = fx => { const m = fx.match(/^([A-Z][^:()]{0,35}?)\s*\(\s*\)\s*:/); return m ? GENERIC.has(m[1].trim()) : false; };
const act1 = require('../data/gear/act1.json');
['Sword of Justice','Phalar Aluve','Disintegrating Night Walkers','Diadem of Arcane Synergy'].forEach(name => {
  const item = act1.find(i => i.name === name);
  if (!item) return;
  const kept = (item.effects||[]).filter(fx => !isGeneric(fx.replace(/[\u2060\u200b]/g,'').trim()));
  console.log('=== ' + name + ' (' + item.rarity + ') ===');
  kept.forEach(fx => console.log('  ' + fx.slice(0,90)));
  if (!kept.length) console.log('  (no item-specific effects)');
});
