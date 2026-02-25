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
let lastBridgeResponse = 0; // timestamp of last successful relay response

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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function handleExec(req, res) {
  readBody(req).then(body => {
    let lua;
    try {
      lua = JSON.parse(body).lua;
    } catch {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      return;
    }
    if (!lua) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Missing "lua" field' }));
      return;
    }

    const id = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    fs.writeFileSync(CMD_FILE, JSON.stringify({ id, lua }));
    console.log(`[${new Date().toLocaleTimeString()}] Exec ${id}: ${lua.slice(0, 80)}${lua.length > 80 ? '...' : ''}`);

    const deadline = Date.now() + 10000;
    const poll = () => {
      try {
        const raw = fs.readFileSync(RESULT_FILE, 'utf8');
        if (raw && raw.trim()) {
          const result = JSON.parse(raw);
          if (result.id === id) {
            fs.writeFileSync(RESULT_FILE, '');
            lastBridgeResponse = Date.now();
            console.log(`[${new Date().toLocaleTimeString()}] Result ${id}: ${result.ok ? 'OK' : 'FAIL'}`);
            res.end(JSON.stringify(result));
            return;
          }
        }
      } catch {}

      if (Date.now() < deadline) {
        setTimeout(poll, 100);
      } else {
        res.statusCode = 504;
        res.end(JSON.stringify({
          error: 'Timeout — BG3SE did not respond within 10s. Is the game running with TavSync loaded?'
        }));
      }
    };
    poll();
  });
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') { res.end(); return; }

  if (req.method === 'POST' && req.url === '/exec') {
    handleExec(req, res);
    return;
  }

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

  if (req.url === '/bridge-status') {
    const connected = lastBridgeResponse > 0 && (Date.now() - lastBridgeResponse) < 60000;
    res.end(JSON.stringify({
      connected,
      lastResponse: lastBridgeResponse || null,
      age: lastBridgeResponse ? Math.round((Date.now() - lastBridgeResponse) / 1000) + 's ago' : null,
    }));
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
