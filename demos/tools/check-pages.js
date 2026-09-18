#!/usr/bin/env node
/* =====================================================================
 *  check-pages.js — four audits of a page's own source.
 *
 *  Run:  node tools/check-pages.js       (exits non-zero on failure)
 *
 *    2. does every proton hop REMOVE THE ATOM IT MOVES?
 *    3. does every link on the ROOT index resolve to something served?
 *    4. does every publicly routed page load site.js, so it is counted?
 *    5. is every page that calls a local-only endpoint kept out of the deploy?
 *
 *  Audit 3 reaches OUTSIDE demos/, which nothing else here does. The root
 *  index.html is the front door and the only page a student is handed, yet it
 *  is the one page no checker walked: it links the short URLs, which are a
 *  vercel.json routing fact rather than a file on disk, so "does this href
 *  exist" needs the route table to answer. Renaming a rewrite and leaving the
 *  link behind takes the two flagship lessons off the front page and shows up
 *  nowhere until a student clicks.
 *
 *  It cannot check layout, framing or anything visual — TESTING.md covers why
 *  that stays a human job.
 * ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

let fails = 0;
const fail = m => { fails++; console.log(`  FAIL  ${m}`); };

// The lessons at the top level, plus the benches in tests/. attic/ is not
// walked: superseded and not deployed.
const html = d => fs.readdirSync(path.join(ROOT, d))
  .filter(f => f.endsWith('.html')).map(f => (d ? d + '/' : '') + f);
const ALL_PAGES = [...html(''), ...html('tests')].sort();
const PAGES = ALL_PAGES;

/* =====================================================================
 *  2. A PROTON HOP HAS TO TAKE THE ATOM WITH IT.
 *
 *  fx.js's protonHop draws a COURIER, not the hydrogen: a glow that flies to a
 *  target and fades. It does not touch the molecule. So a hop whose source atom
 *  is still drawn shows two hydrogens where the chemistry has one — a white H
 *  sitting on the bond it supposedly just left, while a second one sails away,
 *  and the honest question is where the extra one came from.
 *
 *  This is not hypothetical and not rare. The audit of 2026-08-17 found it at
 *  FOUR call sites across three steps of glycolysis-lab: steps 1 and 3 flew the
 *  hydroxyl proton for the whole phosphate flight with the H still on screen,
 *  step 6's whole-step route sent a hydride to NAD⁺ while the hydrogen it was
 *  supposedly made of stayed on the aldehyde, and step 2 had no shed at all.
 *  Every one of them was written beside a call site that DID shed correctly.
 *  The pattern: shedding is remembered when the hydrogen is the subject of the
 *  beat, and forgotten when it is a side effect of something else moving.
 *
 *  WHAT THIS CAN AND CANNOT SEE. It is a source-proximity check, not a proof:
 *  it asks whether a call that removes the source is written near the hop. It
 *  cannot tell that the removal names the SAME atom the hop starts from, or
 *  that it runs on the same branch. What it does catch is the whole observed
 *  failure mode — a hop with no removal anywhere near it.
 *
 *  ENUM: REMOVERS is the point of this check, not an implementation detail. A
 *  page may make the source stop being drawn any way it likes, but the way has
 *  to be listed here — and adding one is exactly the moment to ask whether it
 *  really removes the atom. Three idioms are in use today:
 *    · shed it       glycolysis-lab hides the mesh (GO.shed via shedAtoms)
 *    · morph it      molecule-lab swaps the whole acid for its ion, so the
 *                    hydrogen is gone by construction — no shed to find
 *    · fly it in     the source is not on a lane molecule at all: it arrives
 *                    as a travelling fragment and kit/leaving.js's `launch`
 *                    DROPS that fragment before running its onDone, so the
 *                    atom stops being drawn on the frame the hop starts.
 *                    glycolysis-lab's `flyPi` is the one wrapper of this shape
 *                    (step 6's HPO₄²⁻ arrives holding the proton it releases).
 *                    Listed by WRAPPER, not by `launch`: a bare `launch` near
 *                    a hop is common and proves nothing about that hop's
 *                    source, so matching it would wave through the very cases
 *                    this exists to catch.
 *    · @undrawn      there is no atom to remove, because the spec never drew
 *                    one. mol-krebs.js omits C–H on every backbone carbon
 *                    (its header note 1), so succinate — symmetric, with no
 *                    stereocentre to except — has none of the four hydrogens
 *                    succinate dehydrogenase strips. `dehydro` therefore hops
 *                    off the CARBONS, and a shed would be reaching for meshes
 *                    that do not exist. The tag is written at the call site
 *                    and must name which spec draws nothing, so it cannot be
 *                    used to wave through a molecule that does.
 * ===================================================================== */
const REMOVERS = /\b(shedAtoms|shed|removeAtoms|morphSolute|swapLane|flyFree)\s*\(|@undrawn\b/;
const BEFORE = 14, AFTER = 3;      // lines of context; widen only with a reason

/* WHERE THE HOPS LIVE, which is no longer only the pages. `reaction/` holds the
 * verb bodies glycolysis-lab used to write inline, so scanning .html alone made
 * this check report ONE hop on a page that has a dozen — a green tick over the
 * exact code the audit above was written about. Widen this list alongside any
 * module that gains a hop.
 */
const HOP_SOURCES = [...PAGES, 'reaction/reaction.js'];

/* THE CALL SITES, and `protonAway` is one. A departure to solution is written
 * as a wrapper now (same colour, same `away` profile, same '+'), and a wrapper
 * whose name the pattern does not know is a hop this check cannot see — which
 * is how the four call sites in the audit above would look today. Add a name
 * here whenever a page or module wraps protonHop. */
const HOP_CALL = /(?:\bprotonHop|\bprotonAway|\bhop)\s*\(/;

console.log('\n== 2. every proton hop removes the atom it moves');
let hops = 0;
for (const page of HOP_SOURCES) {
  const lines = fs.readFileSync(path.join(ROOT, page), 'utf8').split('\n');
  lines.forEach((raw, i) => {
    const line = raw.replace(/\/\/.*$/, '');       // a hop named in a comment is prose
    if (!HOP_CALL.test(line)) return;
    // The page's own hop wrappers are DEFINITIONS, not calls — they are where
    // the courier is configured, and the shed belongs at the call sites.
    //
    // ACROSS LINES, because they are written that way: `const piProtonGoes=at=>`
    // sits on the line above its protonHop, and a same-line test called that a
    // call site and demanded a shed inside a definition. Walk back to the last
    // line that ENDED a statement, and if a declaration is still open when the
    // call appears, this is that declaration.
    let head = line.slice(0, line.search(HOP_CALL));
    for (let k = i - 1; k >= 0 && k >= i - 3; k--) {
      const prev = lines[k].replace(/\/\/.*$/, '').trimEnd();
      head = prev + ' ' + head;
      if (/[;{}]$/.test(prev)) break;
    }
    if (/\b(const|let|var|function)\s+[\w$]+\s*=[^;]*$/.test(head)) return;
    hops++;
    const win = lines.slice(Math.max(0, i - BEFORE), i + 1 + AFTER)
                     .map(l => l.replace(/\/\/.*$/, '')).join('\n');
    if (!REMOVERS.test(win))
      fail(`${page}:${i + 1} — proton hop with no source removal within `
        + `${BEFORE} lines: the H flies off while the molecule keeps it. `
        + `Shed the source atom as the hop starts (or morph the molecule), `
        + `and reveal a real atom at the destination via protonHop's onArrive.`);
  });
}
if (!fails) console.log(`  ok    ${hops} proton hop(s), every one removes its source`);

/* ---- 3. the root index's links ------------------------------------------
 * A root-relative href resolves one of two ways: a rewrite in vercel.json, or a
 * file on disk. Both are checked here, against the same table the dev server
 * reads, so a link cannot pass this and 404 in production. */
console.log('');
console.log('== 3. every link on the root index resolves');
const REPO = path.join(ROOT, '..');
{
  let routes = null;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(REPO, 'vercel.json'), 'utf8'));
    routes = new Set((cfg.rewrites || []).map(r => r.source));
    // A redirect is a served URL too: /builder is retired but still answers.
    for (const r of cfg.redirects || []) if (!/[(*?[\\]/.test(r.source)) routes.add(r.source);
  } catch (e) {
    fail(`vercel.json would not parse, so no link on the index can be checked: ${e.message}`);
  }

  const index = path.join(REPO, 'index.html');
  if (routes && !fs.existsSync(index)) {
    fail('there is no index.html at the repo root — the site has no front door');
  } else if (routes) {
    const src = fs.readFileSync(index, 'utf8');
    const links = [...new Set([...src.matchAll(/href="(\/[^"#]*)"/g)].map(m => m[1]))];
    // The gallery builds its links at runtime from a literal key list
    // (`/proteins/${k}`), so a static read cannot resolve them. They are
    // printed rather than skipped silently: an unresolvable link nobody can
    // see is how a renamed route survives this check.
    const built = links.filter(h => h.includes('${'));
    for (const href of links.filter(h => !h.includes('${'))) {
      const clean = href.split('?')[0];
      if (routes.has(clean)) continue;
      if (fs.existsSync(path.join(REPO, clean === '/' ? 'index.html' : clean))) continue;
      fail(`index.html links ${href}, which is neither a vercel.json route nor a `
        + `file on disk. Renaming a rewrite means renaming the link with it.`);
    }
    if (!fails) console.log(`  ok    ${links.length - built.length} root-relative link(s), every one served`);
    for (const b of built) console.log(`  note  ${b} is built at runtime; check its key list by hand`);
  }
}

/* -------------------------------------------------------------------------
 *  4. is every publicly routed page counted?
 * -------------------------------------------------------------------------
 *  Analytics is one line — <script defer src="/demos/lib/site.js"> — and its
 *  absence is invisible from the page that lacks it: nothing renders wrong,
 *  no console line appears, the page simply never appears in the numbers. It
 *  was missing from /build and /app/:id for as long as they existed.
 *
 *  site.js does two jobs and only one of them shows. The foot is gated on
 *  body.kodo; the analytics above that check is not. So a full-window page
 *  with no footer still needs the script, which is exactly the page someone
 *  decides does not need "the footer script". That reasoning is the failure
 *  this audit exists to catch, so the gate is the ROUTE, not the shell.
 *
 *  Public = reachable from vercel.json, plus the two pages at the repo root.
 *  Derived from the route table rather than listed here, so adding a rewrite
 *  puts its destination under this check without anyone remembering to. */
console.log('');
console.log('== 4. every publicly routed page loads site.js');
{
  // admin.html is the live index of every page in the repo, for us, not for a
  // student. Counting our own navigation as traffic is the one way this audit
  // could make the numbers worse rather than better.
  const UNCOUNTED = new Set(['demos/admin.html']);

  let dests = null;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(REPO, 'vercel.json'), 'utf8'));
    dests = (cfg.rewrites || []).map(r => r.destination.split('?')[0].replace(/^\//, ''));
  } catch (e) {
    fail(`vercel.json would not parse, so no routed page can be checked: ${e.message}`);
  }

  if (dests) {
    const pages = [...new Set(['index.html', 'contribute.html', ...dests])]
      .filter(p => p.endsWith('.html') && !UNCOUNTED.has(p));
    let counted = 0;
    for (const p of pages) {
      const abs = path.join(REPO, p);
      if (!fs.existsSync(abs)) continue;          // audit 3 owns the dead route
      if (/<script[^>]+src="\/demos\/lib\/site\.js"/.test(fs.readFileSync(abs, 'utf8'))) { counted++; continue; }
      fail(`${p} is served publicly but does not load /demos/lib/site.js, so it `
        + `records no pageview. Add the tag; a page with no footer needs it too.`);
    }
    if (counted === pages.length) console.log(`  ok    ${counted} public page(s), every one counted`);
    for (const p of UNCOUNTED) console.log(`  note  ${p} is deliberately uncounted`);
  }
}

/* -------------------------------------------------------------------------
 *  5. is a page that calls a local-only endpoint kept out of the deploy?
 * -------------------------------------------------------------------------
 *  `api/log.js` is `.vercelignore`d and answers only from the machine it runs
 *  on, so the pages that read it — /beta, the tutor log — are ignored too. Two
 *  independent gates, which is the point: either one alone has failed before.
 *
 *  The pairing is what nothing checked. A route in vercel.json survives the
 *  ignore line being dropped, and the page then serves to the world with the
 *  endpoint's 403 as its only remaining gate. This asserts the pair instead:
 *  ignore an endpoint and every page that fetches it comes under the check
 *  without anyone remembering, which is also what makes it self-maintaining.
 *
 *  A fetch, not a mention: admin.html describes /api/log in a card and is
 *  deployed on purpose. */
console.log('');
console.log('== 5. a page that calls a local-only endpoint is not deployed');
{
  const lines = fs.readFileSync(path.join(REPO, '.vercelignore'), 'utf8')
    .split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'));
  // Entries are repo-relative, so a page matches one exactly or sits under a folder one names.
  const ignored = p => lines.some(l => l === p || (l.endsWith('/') && p.startsWith(l)));

  // The endpoints the ignore file itself withholds, named as a page calls them.
  const localOnly = lines.filter(l => /^api\/\w+\.js$/.test(l)).map(l => '/' + l.replace(/\.js$/, ''));

  const walk = d => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })
    .flatMap(e => e.name === 'node_modules' || e.name.startsWith('.') ? []
      : e.isDirectory() ? walk(path.join(d, e.name))
      : e.name.endsWith('.html') ? [path.join(d, e.name)] : []);

  let paired = 0;
  const before = fails;
  for (const rel of walk('')) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const ep of localOnly) {
      // `fetch('../../api/log' + q)` counts; a sentence naming it does not.
      if (!new RegExp('fetch\\(\\s*[\'"`][^\'"`]*' + ep.slice(1) + '\\b').test(src)) continue;
      const file = 'demos/' + rel;
      if (ignored(file)) { paired++; continue; }
      fail(`${file} fetches ${ep}, which .vercelignore keeps out of the deploy, `
        + `but the page itself is not ignored. Deployed, its only gate is that `
        + `endpoint's 403. Add it to .vercelignore or stop calling ${ep}.`);
    }
  }
  if (fails === before) console.log(`  ok    ${localOnly.length} local-only endpoint(s), ${paired} caller(s), every one withheld`);
}

console.log('');
if (fails) { console.log(`FAIL: ${fails} page claim(s) no longer true`); process.exit(1); }
console.log('PASS: every page loads every molecule it names, '
  + 'every proton hop removes its source, '
  + 'every link on the root index is served, '
  + 'every public page is counted, '
  + 'and every caller of a local-only endpoint is withheld');
