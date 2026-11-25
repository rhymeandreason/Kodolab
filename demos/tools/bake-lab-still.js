#!/usr/bin/env node
/* =====================================================================
 *  bake-lab-still.js — a lab's /labs card image, from lab/still.html.
 *
 *  Run:  node tools/bake-lab-still.js egg            (a lab folder)
 *        node tools/bake-lab-still.js egg gel onion  (several)
 *        --port 8819 for a dev server other than 8817
 *
 *  The file it writes is the `still` of the lab's row in lib/lessons.js,
 *  so add the row first. The page draws the prop (see its header); this
 *  opens it at 2x, takes the frame it encodes, and POSTs it to /api/stills.
 *
 *  System Chrome through playwright-core, like bake-stills.js: it has the
 *  WebP encoder, and a headless page is never a hidden tab with no rAF.
 *  The page loads three.js from a CDN, so run it with network access.
 * ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const args = process.argv.slice(2);
const at = args.indexOf('--port');
const port = at >= 0 ? +args.splice(at, 2)[1] : 8817;
const ORIGIN = `http://localhost:${port}`;
if (!args.length) { console.error('usage: node tools/bake-lab-still.js <lab folder>…'); process.exit(1); }

const lessons = fs.readFileSync(path.join(__dirname, '../lib/lessons.js'), 'utf8');
function keyFor(lab) {
  const row = lessons.split('\n').find(l => l.includes(`file: '/demos/lab/${lab}/`));
  const m = row && /still: '\/demos\/media\/components\/([A-Za-z0-9-]+)\.webp'/.exec(row);
  if (!m) throw new Error(`${lab}: no lib/lessons.js row with a /demos/media/components/ still`);
  return m[1];
}

async function main() {
  const jobs = args.map(lab => ({ lab, key: keyFor(lab) }));
  try { await fetch(`${ORIGIN}/demos/lab/still.html`, { method: 'HEAD' }); }
  catch { throw new Error(`no dev server on ${port}: node tools/dev-server.js ${port}`); }

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  let failed = 0;
  try {
    for (const { lab, key } of jobs) {
      const page = await browser.newPage({ viewport: { width: 600, height: 400 }, deviceScaleFactor: 2 });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      try {
        await page.goto(`${ORIGIN}/demos/lab/still.html?lab=${lab}`);
        await page.waitForFunction(() => document.body.dataset.ready, null, { timeout: 60000 })
          .catch(() => { throw new Error(errors[0] || 'timed out'); });
        const webp = await page.evaluate(() => window.stillWebp);
        const r = await fetch(`${ORIGIN}/api/stills`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ set: 'components', key, webp }),
        });
        const out = await r.json();
        if (!r.ok) throw new Error(out.error || r.status);
        console.log(`ok   ${lab} → media/components/${key}.webp (${Math.round(out.bytes / 1024)} KB)`);
      } catch (e) {
        console.log(`FAIL ${lab}: ${e.message}`); failed++;
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
  if (failed) process.exit(1);
}

main().catch(e => { console.error(e.message); process.exit(1); });
