#!/usr/bin/env node
/* =====================================================================
 *  bake-stills.js — proteins/tools/stills.html, driven headless.
 *
 *  Run:  node tools/bake-stills.js catalase cytc     (named keys)
 *        node tools/bake-stills.js                   (every entry)
 *        --port 8819 for a dev server other than 8817
 *
 *  The page does the drawing and the save (POST /api/stills); this only
 *  opens it, waits for the entry to load, and clicks "Bake selected". So
 *  a still baked here and one baked by hand are the same code path.
 *
 *  WHY HEADLESS. A hidden tab gets no requestAnimationFrame, and the box
 *  builds one chain per frame, so the built-in browser's pane had to be
 *  showing or the bake wrote a half-built ribbon. A headless page is never
 *  hidden.
 *
 *  The system Chrome, through playwright-core (a dev dependency at the repo
 *  root): no browser download, and Chrome has the WebP encoder the page
 *  insists on. deviceScaleFactor 2 because the page's 660x460 mount is
 *  meant to bake at 2x, 1320x920, the size every committed still is.
 * ===================================================================== */
'use strict';

const { chromium } = require('playwright-core');

const args = process.argv.slice(2);
const at = args.indexOf('--port');
const port = at >= 0 ? +args.splice(at, 2)[1] : 8817;
const ORIGIN = `http://localhost:${port}`;
const PAGE = `${ORIGIN}/demos/proteins/tools/stills.html`;

async function main() {
  try { await fetch(PAGE, { method: 'HEAD' }); }
  catch { throw new Error(`no dev server on ${port}: node tools/dev-server.js ${port}`); }

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  let failed = 0;
  try {
    await page.goto(PAGE);
    const all = await page.evaluate(() => ENTRIES.map(p => p.key));
    const keys = args.length ? args : all;
    for (const k of keys) if (!all.includes(k)) throw new Error(`no entry '${k}' in either registry`);

    for (const key of keys) {
      await page.goto(`${PAGE}?key=${encodeURIComponent(key)}`);
      await page.waitForFunction(k => document.body.dataset.live === k, key, { timeout: 60000 });
      await page.click('#one');
      await page.waitForFunction(() => /done\.$/.test(document.getElementById('log').textContent.trim()),
                                 null, { timeout: 60000 });
      const lines = await page.$$eval('#log div', ds => ds.map(d => ({ t: d.textContent, bad: d.className === 'bad' })));
      for (const l of lines) if (l.t !== 'done.') {
        console.log((l.bad ? 'FAIL ' : 'ok   ') + l.t);
        if (l.bad) failed++;
      }
    }
  } finally {
    await browser.close();
  }
  for (const e of errors) console.log('page error: ' + e);
  if (failed || errors.length) process.exit(1);
}

main().catch(e => { console.error(e.message); process.exit(1); });
