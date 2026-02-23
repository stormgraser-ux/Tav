const cheerio = require('cheerio');

(async () => {
  const res = await fetch('https://gamestegy.com/post/bg3/886/bardadin-bard-paladin-build', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const html = await res.text();
  const $ = cheerio.load(html);

  // Find Equipment section, grab first table, dump row/cell structure
  let inEquip = false;
  let printed = 0;

  $('#post-body-text').children().each((_, el) => {
    const tag = $(el).prop('tagName');
    if (tag === 'H2') {
      if ($(el).text().toLowerCase().includes('equipment')) { inEquip = true; return; }
      if (inEquip) return false;
    }
    if (!inEquip || printed > 0) return;
    if (tag !== 'TABLE') return;

    printed++;
    $(el).find('tr').each((i, row) => {
      const cells = $(row).find('td, th');
      console.log(`Row ${i} (${cells.length} cells):`);
      cells.each((j, cell) => {
        const colspan = $(cell).attr('colspan') || 1;
        console.log(`  [${j}] colspan=${colspan}: "${$(cell).text().trim().slice(0, 60)}"`);
      });
    });
  });
})();
