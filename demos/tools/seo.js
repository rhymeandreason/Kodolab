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
    description: 'The structure of water in 3D: hydrogen bonds, why ice floats, what temperature does to the liquid, and why salt dissolves in it.',
    about: {
      h1: 'The structure of water, and why it is such a good solvent',
      paras: [
        'A water molecule is bent, not straight. Oxygen pulls the shared electrons toward itself, so the oxygen end carries a partial negative charge and the two hydrogens a partial positive one. That polarity is the whole story: everything water does follows from it.',
        'The partial charges attract. The hydrogen of one molecule sits against the oxygen of the next in a hydrogen bond, weak on its own and constantly breaking and re-forming. Heating water spends energy on those bonds before the molecules speed up, which is why water has such a high specific heat. Cooling it locks the bonds into an open lattice, so ice takes more room than the liquid and floats.',
        'Drop salt in and the same charges pull the crystal apart. Water molecules turn their negative oxygen toward each sodium ion and their positive hydrogens toward each chloride, wrapping every ion in a hydration shell. Water dissolves ionic and polar substances because it is polar itself, and that is what makes it the solvent every cell runs in.',
      ],
      steps: ['A polar molecule', 'Hydrogen bonds', 'Specific heat', 'Why ice floats', 'The universal solvent'],
    } },
  '/molecular-bonds': { image: 'bonds',
    description: 'Build covalent and ionic bonds by hand. Drag atoms together and see how valence, geometry and charge decide which molecule you get.',
    about: {
      h1: 'Covalent and ionic bonds: build a molecule by hand',
      paras: [
        'Atoms bond to fill their outer electron shell. Two nonmetals get there by sharing: a covalent bond is a pair of electrons held between two nuclei, and each atom forms as many as it has room for. Hydrogen makes one, oxygen two, nitrogen three, carbon four. That valence is why water is H2O and methane is CH4, and it is what decides which molecules you can build here.',
        'Shared is rarely equal. Oxygen and nitrogen pull electrons harder than hydrogen or carbon, so their bonds are polar and the molecule can carry partial charges. Whether the whole molecule is polar depends on its shape: water is bent so its charges do not cancel, while carbon dioxide is straight so they do. Shape comes from electron pairs repelling each other, lone pairs included.',
        'A metal and a nonmetal do not share. Sodium gives its one outer electron to chlorine outright, leaving Na+ and Cl-, and the attraction between the two ions is the ionic bond. There is no molecule, only a lattice of ions, which is why salt is a crystal and dissolves into ions in water. Magnesium gives two electrons, so it takes two chlorides.',
      ],
      steps: ['Water, H2O', 'Methane, CH4', 'Ammonia, NH3', 'Carbon dioxide, CO2', 'Nitrogen gas, N2', 'Hydrogen chloride, HCl', 'Salt, NaCl', 'Potassium chloride, KCl', 'Magnesium chloride, MgCl2', 'Ammonium, NH4+', 'Hydrochloric acid, H3O+ and Cl-'],
    } },
  '/protein': {
    description: 'The levels of protein structure on one real molecule: watch a hemoglobin chain fold, heme settle into its pocket, and the chains assemble.' },
  '/glycolysis': { image: 'glycolysis',
    description: 'Glycolysis step by step in 3D. Every intermediate is drawn as the real molecule, with the energy curve and a running ATP and NADH ledger.',
    about: {
      h1: 'Glycolysis, step by step: the ten reactions that split glucose',
      paras: [
        'Glycolysis is the first stage of cellular respiration and the one every cell shares. It takes one six-carbon glucose and, in ten enzyme-catalysed steps in the cytosol, splits it into two three-carbon pyruvate molecules. No oxygen is needed, which is why it runs in a muscle cell out of breath and in a yeast cell making wine.',
        'The pathway spends before it earns. The first stage phosphorylates glucose twice, costing two ATP, which traps the sugar in the cell and destabilises it enough to break. Aldolase then splits the six-carbon sugar into two three-carbon halves. In the payoff stage each half is oxidised, handing electrons to NAD+ to make NADH, and gives up two phosphates to ADP by substrate-level phosphorylation.',
        'The ledger lands on a net gain of two ATP and two NADH per glucose, with two pyruvate left over. Most of the energy is still in the pyruvate, bound for the Krebs cycle if oxygen is present and for fermentation if not. Three steps are effectively irreversible, and one of them, phosphofructokinase, is where the cell decides how fast the whole pathway runs.',
      ],
      steps: ['Hexokinase traps glucose', 'Phosphoglucose isomerase', 'Phosphofructokinase-1, the committed step', 'Aldolase splits the sugar', 'Triose-phosphate isomerase', 'Glyceraldehyde-3-phosphate dehydrogenase makes NADH', 'Phosphoglycerate kinase, the first ATP', 'Phosphoglycerate mutase', 'Enolase', 'Pyruvate kinase, the second ATP'],
    } },
  '/respiration': {
    description: 'Cellular respiration as one flowchart: follow a glucose from glycolysis through the link step and Krebs cycle to the electron transport chain, and see where the ATP comes from.' },
  '/krebs': {
    description: 'The Krebs cycle in 3D: pyruvate oxidation, then eight steps round the ring drawn as the real molecules, and where each carbon goes.' },
  '/electron-transport': {
    description: 'The electron transport chain in 3D: NADH and FADH2 hand electrons to the complexes, protons are pumped, and the ledger counts what the gradient is worth.' },
  '/fermentation': {
    description: 'Fermentation in 3D: where pyruvate goes without oxygen, lactate or ethanol, and why the product is beside the point and NAD+ is not.' },
  '/sickle-cell': {
    description: 'Sickle cell in 3D: one letter changes in the haemoglobin gene, the protein sticks to itself, a red cell sickles, and a vessel jams.' },
  '/tree': {
    description: "Where a tree's mass comes from: Van Helmont's willow, photosynthesis as traffic in and out of the leaf, and the tree taken apart by origin." },
  '/lessons': {
    description: 'Every Kodolab lesson in teaching order: water, bonding, proteins, the membrane, cellular respiration stage by stage, plants and DNA, with embed codes for teachers.' },
  '/membrane': { image: 'membrane',
    description: 'The cell membrane in 3D: the phospholipid bilayer, simple diffusion, selective channels, the sodium-potassium pump, and active versus passive transport.',
    about: {
      h1: 'Cell membrane transport: what gets through, and what it costs',
      paras: [
        'A cell membrane is a phospholipid bilayer. Each lipid has a charged head that sits in water and two hydrocarbon tails that will not, so the sheet assembles itself with the tails hidden inside. The middle of every membrane is oil, and anything crossing has to get through it.',
        'That decides the traffic. Small nonpolar molecules like oxygen and carbon dioxide dissolve into the oil and cross on their own, down their concentration gradient. Ions and polar molecules cannot, however small they are. Water crosses slowly both ways, and osmosis is the net of that headcount. Charged solutes get through only by proteins: a channel picks one ion and lets it run downhill, which is passive transport and costs nothing.',
        'Moving a solute uphill costs ATP. The sodium-potassium pump spends one ATP to push three sodium ions out and pull two potassium ions in, against both gradients. That is active transport, and it is why a resting cell is negative inside. The gradients the pump builds are what channels, nerve impulses and secondary transport then spend.',
      ],
      steps: ['The bilayer', 'What gets through', 'Osmosis', 'A channel', 'The pump', 'A cell at rest'],
    } },
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
                '/admin', '/proteins/myoglobin/bench', '/proteins/prion/bench',
                '/proteins/atp-synthase/bench'];
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

// A component's bench is described by its own card on library.html.
function libraryCard(slug) {
  const html = fs.readFileSync(path.join(DEMOS, 'library.html'), 'utf8');
  const m = html.match(new RegExp(`<a class="card" href="/library/${slug}">[\\s\\S]*?<p class="blurb">([^<]*)</p><ul class="feats">([\\s\\S]*?)</ul>`));
  if (!m) return null;
  const feats = [...m[2].matchAll(/<li>([^<]*)/g)].map(x => x[1].replace(/ · /g, ', '));
  return `${m[1].replace(/\.$/, '')}: ${feats.join(', ')}.`;
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
  const lib = url.match(/^\/library\/([a-z0-9-]+)$/);
  if (!entry && lib) {
    const card = libraryCard(lib[1]);
    // Crawlable but noindex: search should send a student to a lesson, not a component bench.
    if (card) entry = { description: card, noindex: true };
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

function block({ url, file, description, image, about, noindex }) {
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
  if (noindex) lines.push('<meta name="robots" content="noindex">');
  if (image) {
    if (!fs.existsSync(path.join(DEMOS, 'media', 'og', image + '.jpg'))) fail(`${url} names image ${image}, but demos/media/og/${image}.jpg is missing`);
    lines.push(`<meta property="og:image" content="${SITE}/demos/media/og/${image}.jpg">`,
               '<meta property="og:image:width" content="1200">',
               '<meta property="og:image:height" content="630">');
  }
  lines.push(`<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`);
  if (about) lines.push('<script type="application/ld+json">' + JSON.stringify({
    '@context': 'https://schema.org', '@type': 'LearningResource',
    name: about.h1, description, url: href,
    learningResourceType: 'interactive simulation', educationalLevel: 'college',
    isAccessibleForFree: true, teaches: about.steps,
    provider: { '@type': 'Organization', name: 'Kodolab', url: SITE },
  }) + '</script>');
  lines.push('<!-- /seo -->');
  return lines.join('\n');
}

/* THE LESSON IN PROSE, in the body: an h1 and a few paragraphs a crawler can
 * read, since the lesson's own text is callouts a script draws. `hidden` in
 * the file; lib/site.js puts an About button in the bar that opens it, so it
 * is a panel a student can reach and not text only a crawler sees. */
function aboutBlock({ about }) {
  const p = t => `  <p>${esc(t)}</p>`;
  return ['<!-- seo-about: written by demos/tools/seo.js; edit its PAGES table, not these lines -->',
    '<section id="lesson-about" hidden>',
    `  <h1>${esc(about.h1)}</h1>`,
    ...about.paras.map(p),
    '  <h2>In this lesson</h2>',
    '  <ol>' + about.steps.map(t => `<li>${esc(t)}</li>`).join('') + '</ol>',
    '</section>',
    '<!-- /seo-about -->'].join('\n');
}
const ABOUT = /<!-- seo-about: [\s\S]*?<!-- \/seo-about -->\n?/;

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
  if (page.about) {
    const want = aboutBlock(page) + '\n';
    if (ABOUT.test(next)) next = next.replace(ABOUT, want);
    else if (/<\/nav>\n?/.test(next)) next = next.replace(/(<\/nav>\n?)/, `$1${want}`);
    else { fail(`${page.file}: nowhere to put the about block (no </nav>)`); return; }
    if ((next.match(/<h1[\s>]/g) || []).length !== 1) fail(`${page.file} has an <h1> outside the about block`);
  } else if (ABOUT.test(next)) next = next.replace(ABOUT, '');
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
  + indexed.filter(p => !p.noindex).map(p => `  <url><loc>${SITE}${p.url}</loc></url>`).join('\n')
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
