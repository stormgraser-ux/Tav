const cheerio = require('cheerio');

(async () => {
  const urls = [
    'https://gamestegy.com/post/bg3/886/bardadin-bard-paladin-build',
    'https://gamestegy.com/post/bg3/881/sorcadin-sorcerer-paladin-build',
  ];
  for (const url of urls) {
    console.log('\n=== ' + url.split('/').pop() + ' ===');
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await res.text();
    const $ = cheerio.load(html);
    $('#post-body-text h2, #post-body-text h3').each((_, el) => {
      console.log('  ' + $(el).prop('tagName') + ': ' + $(el).text().trim());
    });
  }
})();
