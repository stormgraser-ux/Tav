'use strict';

/**
 * Tav Party Sync Server
 *
 * Watches the BG3SE output file and serves its contents over HTTP so
 * the Tav browser app can fetch them via "Sync from Game."
 *
 * Usage: npm run sync
 * Then in-game: paste memory/bg3se/party_dump.lua into the BG3SE console (F11)
 * Then in Tav:  click "Sync from Game" on the Party tab
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

// Where BG3SE writes files on Windows (accessible via WSL /mnt/c/)
// Adjust if your Windows username differs from "Owner"
const SE_DIR = '/mnt/c/Users/Owner/AppData/Local/Larian Studios/' +
               "Baldur's Gate 3/Script Extender";

const SYNC_FILE   = path.join(SE_DIR, 'party_sync.json');
const CMD_FILE    = path.join(SE_DIR, 'tav_cmd.json');
const RESULT_FILE = path.join(SE_DIR, 'tav_result.json');

const PORT = 3457;

let partyData    = null;
let lastModified = null;

function pollFile() {
  try {
    const stat = fs.statSync(SYNC_FILE);
    if (!lastModified || stat.mtimeMs !== lastModified) {
      lastModified = stat.mtimeMs;
      const raw = fs.readFileSync(SYNC_FILE, 'utf8');
      partyData = JSON.parse(raw);
      const count = partyData?.members?.length ?? 0;
      console.log(`[${new Date().toLocaleTimeString()}] Sync file updated — ${count} member(s)`);
    }
  } catch {
    // File not yet written — normal before first in-game dump
  }
}

// Poll every 2 seconds (fs.watch is unreliable on WSL /mnt/c paths)
setInterval(pollFile, 2000);
pollFile();

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') { res.end(); return; }

  if (req.url === '/party-sync') {
    if (partyData) {
      res.end(JSON.stringify(partyData));
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({
        error: 'No party data yet — paste party_dump.lua into the BG3SE console (F11) and run it.'
      }));
    }
    return;
  }

  if (req.url === '/health') {
    res.end(JSON.stringify({ ok: true, hasData: !!partyData }));
    return;
  }

  res.statusCode = 404;
  res.end('{}');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\nTav sync server running on http://localhost:${PORT}`);
  console.log(`Watching: ${SYNC_FILE}\n`);
  console.log('Steps:');
  console.log('  1. Launch BG3 with Script Extender installed');
  console.log('  2. Load your save and assemble your party');
  console.log('  3. Open BG3SE console (F11)');
  console.log('  4. Paste the contents of memory/bg3se/party_dump.lua and press Enter');
  console.log('  5. Click "Sync from Game" in Tav\n');
});
