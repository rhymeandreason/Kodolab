#!/usr/bin/env node
/* deck-pdf.js — /deck.html as a PDF, one 16:9 page per slide.
 *
 *   node demos/tools/deck-pdf.js [out.pdf] [--base http://localhost:8817]
 *
 * Each page is a screenshot, taken once the slide's animation has settled, so
 * the PDF shows what the deck shows. Uses the installed Google Chrome. */
const { chromium } = require('playwright');
const path = require('path');

const args = process.argv.slice(2);
const baseAt = args.indexOf('--base');
const BASE = baseAt >= 0 ? args.splice(baseAt, 2)[1] : 'http://localhost:8817';
const OUT = path.resolve(args[0] || 'kodolab-deck.pdf');
const W = 1920, H = 1080;
// ms to let each slide settle: the intro's word takes ~5s to land, the build slide one question to type
const SETTLE = { 1: 6500, 4: 3500 };

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/deck.html#1`, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: '.dots { display: none !important; }' });   // navigation, not content
  const n = await page.$$eval('.slide', s => s.length);
  const shots = [];
  for (let i = 1; i <= n; i++) {
    await page.evaluate(k => { location.hash = '#' + k; }, i);
    await page.waitForTimeout(SETTLE[i] || 1800);
    shots.push((await page.screenshot({ type: 'png' })).toString('base64'));
    console.log(`slide ${i}/${n}`);
  }
  const html = `<!doctype html><style>@page{size:${W}px ${H}px;margin:0}body{margin:0}
    img{display:block;width:${W}px;height:${H}px;page-break-after:always}</style>` +
    shots.map(b => `<img src="data:image/png;base64,${b}">`).join('');
  const pdf = await browser.newPage();
  await pdf.setContent(html, { waitUntil: 'load' });
  await pdf.pdf({ path: OUT, width: `${W}px`, height: `${H}px`, printBackground: true });
  await browser.close();
  console.log(OUT);
})();
