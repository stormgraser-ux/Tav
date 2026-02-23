const cheerio = require('cheerio');

(async () => {
  const res = await fetch('https://gamestegy.com/post/bg3/886/bardadin-bard-paladin-build', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const html = await res.text();
  const $ = cheerio.load(html);

  // Find the Equipment Recommendations H2 and grab everything until the next H2
  let inEquip = false;
  let currentAct = null;
  const gear = { act1: [], act2: [], act3: [] };

  $('#post-body-text').children().each((_, el) => {
    const tag = $(el).prop('tagName');
    const text = $(el).text().trim();

    if (tag === 'H2') {
      if (text.toLowerCase().includes('equipment')) { inEquip = true; return; }
      if (inEquip) { inEquip = false; return false; } // stop at next H2
    }
    if (!inEquip) return;

    if (tag === 'H3') {
      if (text.toLowerCase().includes('act 1') || text.toLowerCase().includes('act1')) currentAct = 'act1';
      else if (text.toLowerCase().includes('act 2') || text.toLowerCase().includes('mid')) currentAct = 'act2';
      else if (text.toLowerCase().includes('act 3') || text.toLowerCase().includes('final')) currentAct = 'act3';
      return;
    }

    if (currentAct && text) {
      console.log(`[${currentAct}] ${tag}: ${text.slice(0, 120)}`);
    }
  });
})();
