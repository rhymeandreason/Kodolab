#!/usr/bin/env node
/* =====================================================================
 *  seo.js — what a search engine reads: robots.txt, sitemap.xml, and the
 *  description / canonical / share-card block in each public page's head.
 *
 *  Run:  node tools/seo.js           writes all three
 *        node tools/seo.js --check   exits non-zero if any is stale
 *
 *  The route table is vercel.json's rewrites. Every rewrite must be in PAGES,
 *  a /proteins/<key> the registries describe, or HIDDEN, so adding a route
 *  fails the check until someone decides whether search should see it.
 *
 *  Protein descriptions are the registry's `blurb`, read at write time, so a
 *  blurb edit makes the page head stale and the hook says so.
 *
 *  The block is written into the HTML, not injected by site.js: crawlers and
 *  link unfurlers mostly do not run scripts.
 * ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const DEMOS = path.join(__dirname, '..');
const REPO = path.join(DEMOS, '..');
const SITE = 'https://www.kodolab.org';
const CHECK = process.argv.includes('--check');

// Share images are 1200x630 crops of media/screenshots/.
const PAGES = {
  '/': { file: 'index.html', image: 'water',
    description: 'Interactive 3D biology lessons for college Bio 101: water, bonding, proteins, membranes, glycolysis and DNA, drawn from real molecular structures.' },
  '/water': { image: 'water',
    description: 'The structure of water in 3D: hydrogen bonds, why ice floats, what temperature does to the liquid, and why salt dissolves in it.' },
  '/molecular-bonds': { image: 'bonds',
    description: 'Build covalent and ionic bonds by hand. Drag atoms together and see how valence, geometry and charge decide which molecule you get.' },
  '/protein': {
    description: 'The levels of protein structure on one real molecule: watch a hemoglobin chain fold, heme settle into its pocket, and the chains assemble.' },
  '/glycolysis': { image: 'glycolysis',
    description: 'Glycolysis step by step in 3D. Every intermediate is drawn as the real molecule, with the energy curve and a running ATP and NADH ledger.' },
  '/membrane': { image: 'membrane',
    description: 'The cell membrane in 3D: the phospholipid bilayer, simple diffusion, selective channels, the sodium-potassium pump, and active versus passive transport.' },
  '/dna': {
    description: 'The DNA double helix in 3D, built from real coordinates and taken apart piece by piece: the backbone, the bases, and how they pair.' },
  '/nodes': {
    description: 'All of Bio 101 as one interactive map: how the concepts connect, from molecules to cells to organisms and ecosystems.' },
  '/library': {
    description: "Everything in Kodolab's open library: the 3D components a generated app can mount, every protein, and every molecule." },
  '/molecules': {
    description: "Every molecule in Kodolab's lessons, in 3D and as a diagram. Open one to turn it and show its hydrogens and lone pairs." },
  '/proteins': {
    description: "Real protein structures in 3D, from deposited PDB data. See how a protein's shape does its job, from hemoglobin and collagen to ATP synthase." },
  '/proteins/reactions': {
    description: 'Biochemical reactions mapped by what happens to the bonds and what pays for it, including the ones that need no enzyme.' },
  '/contribute': {
    description: 'Kodolab is open source. Teach an idea in 3D with a library of biology components, built in plain HTML and JavaScript and reviewed by humans.' },
  '/privacy': {
    description: 'How Kodolab handles your data: cookieless analytics, no ads, and what the AI features log.' },
};

// Routes search should not see: accounts, student work, our own index, a bench.
const HIDDEN = ['/build', '/apps', '/app/:id', '/teach', '/login', '/join', '/join/:code',
                '/admin', '/proteins/myoglobin/bench'];
// Paths no route names that are still reachable by file.
const DISALLOW_FILES = ['/api/', '/demos/admin.html', '/demos/attic/', '/demos/build/', '/demos/tests/'];

const esc = s => s.replace(/&(?![a-z#0-9]+;)/gi, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// A blurb can run to a paragraph; keep whole sentences up to ~200 characters.
function clip(text) {
  let out = '';
  for (const s of text.split(/(?<=[.!?])\s+/)) {
    // A lone short sentence reads as a stub in a result; cut into the next one instead.
    if (out.length >= 110 && (out + ' ' + s).length > 200) break;
    out = out ? out + ' ' + s : s;
  }
  return out.length > 200 ? out.slice(0, out.lastIndexOf(' ', 197)).replace(/[\s,;:—–-]+$/, '') + '…' : out;
}

function registryBlurb(key) {
  const ProteinLib = require(path.join(DEMOS, 'proteins', 'proteins.js'));
  const Nucleic = require(path.join(DEMOS, 'proteins', 'nucleic-acids.js'));
  const p = ProteinLib.PROTEINS.find(e => e.key === key) || Nucleic.STRUCTURES.find(e => e.key === key);
  return p && p.blurb;
}

let fails = 0;
const fail = m => { fails++; console.log(`  FAIL  ${m}`); };

const cfg = JSON.parse(fs.readFileSync(path.join(REPO, 'vercel.json'), 'utf8'));
const routes = new Map([['/', 'index.html']]);
for (const r of cfg.rewrites) routes.set(r.source, r.destination.split('?')[0].replace(/^\//, ''));

const indexed = [];
for (const [url, dest] of routes) {
  if (HIDDEN.includes(url)) continue;
  let entry = PAGES[url];
  const m = url.match(/^\/proteins\/([a-z0-9-]+)$/);
  if (!entry && m) {
    const blurb = registryBlurb(m[1]);
    if (blurb) entry = { description: clip(blurb) };
  }
  if (!entry) {
    fail(`${url} is routed in vercel.json but is in neither PAGES nor HIDDEN. Decide whether search should see it.`);
    continue;
  }
  const file = entry.file || dest;
  if (!fs.existsSync(path.join(REPO, file))) { fail(`${url} routes to ${file}, which does not exist`); continue; }
  indexed.push({ url, file, ...entry });
}
for (const url of Object.keys(PAGES)) if (!routes.has(url)) fail(`PAGES names ${url}, which vercel.json no longer routes`);

function block({ url, file, description, image }) {
  const html = fs.readFileSync(path.join(REPO, file), 'utf8');
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1];
  if (!title) fail(`${file} has no <title>`);
  const href = SITE + url;
  const lines = [
    '<!-- seo: written by demos/tools/seo.js; edit its PAGES table, not these lines -->',
    `<meta name="description" content="${esc(description)}">`,
    `<link rel="canonical" href="${href}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="Kodolab">',
    `<meta property="og:url" content="${href}">`,
    `<meta property="og:title" content="${esc(title || '')}">`,
    `<meta property="og:description" content="${esc(description)}">`,
  ];
  if (image) {
    if (!fs.existsSync(path.join(DEMOS, 'media', 'og', image + '.jpg'))) fail(`${url} names image ${image}, but demos/media/og/${image}.jpg is missing`);
    lines.push(`<meta property="og:image" content="${SITE}/demos/media/og/${image}.jpg">`,
               '<meta property="og:image:width" content="1200">',
               '<meta property="og:image:height" content="630">');
  }
  lines.push(`<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`,
             '<!-- /seo -->');
  return lines.join('\n');
}

const BLOCK = /<!-- seo: [\s\S]*?<!-- \/seo -->\n?/;

function stamp(page) {
  const abs = path.join(REPO, page.file);
  const html = fs.readFileSync(abs, 'utf8');
  const want = block(page) + '\n';
  let next;
  if (BLOCK.test(html)) next = html.replace(BLOCK, want);
  else {
    next = html.replace(/<meta name="description"[^>]*>\n?/, '');
    next = next.replace(/(<\/title>\n?)/, `$1${want}`);
    if (next === html) { fail(`${page.file}: nowhere to put the block (no </title>)`); return; }
  }
  if ((next.match(/<meta name="description"/g) || []).length !== 1)
    fail(`${page.file} carries a meta description outside the seo block`);
  write(page.file, html, next);
}

function write(rel, before, after) {
  if (before === after) return;
  if (CHECK) fail(`${rel} is stale. Run: node tools/seo.js`);
  else { fs.writeFileSync(path.join(REPO, rel), after); console.log(`  wrote ${rel}`); }
}

const read = rel => { try { return fs.readFileSync(path.join(REPO, rel), 'utf8'); } catch { return ''; } };

const files = new Map();
for (const p of indexed) {
  if (files.has(p.file)) fail(`${p.url} and ${files.get(p.file)} are one file; a page has one canonical URL`);
  files.set(p.file, p.url);
}
if (!fails) for (const p of indexed) stamp(p);

const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n'
  + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
  + indexed.map(p => `  <url><loc>${SITE}${p.url}</loc></url>`).join('\n')
  + '\n</urlset>\n';
write('sitemap.xml', read('sitemap.xml'), sitemap);

// A route with a parameter is disallowed by its prefix; a prefix another one covers is dropped.
const prefixes = [...HIDDEN.map(u => u.split(':')[0]), ...DISALLOW_FILES].sort();
const disallow = prefixes.filter((p, i) => !prefixes.some((q, j) => j !== i && q !== p && p.startsWith(q)))
  .filter((p, i, a) => a.indexOf(p) === i);
const robots = '# Written by demos/tools/seo.js.\nUser-agent: *\n'
  + disallow.map(p => `Disallow: ${p}`).join('\n')
  + `\n\nSitemap: ${SITE}/sitemap.xml\n`;
write('robots.txt', read('robots.txt'), robots);

if (fails) { console.log(`FAIL: ${fails} search claim(s) out of date`); process.exit(1); }
console.log(`${CHECK ? 'PASS' : 'done'}: ${indexed.length} indexed page(s), ${HIDDEN.length} hidden route(s)`);
