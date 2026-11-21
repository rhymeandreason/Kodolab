/* =============================================================================
 *  api/_select.js — which components a request is about, by embedding
 * =============================================================================
 *  select(request) → { uses, confident, shortlist, scores }
 *
 *  A layer of its own, beside the model that writes: it ranks the library's
 *  components against a request, and each route decides what to do with the
 *  ranking. The compose route takes `uses` outright when `confident`, and
 *  otherwise asks its model to choose from `shortlist` rather than from the
 *  whole catalog.
 *
 *  ROWS, NOT ONE VECTOR PER COMPONENT. A component's "Good for" line is a
 *  list of unrelated subjects (BloodCell: the biconcave shape · sickle-cell
 *  disease · the malaria parasite), and one vector of the whole line is the
 *  average of them, near none. So each item is its own row, and a component
 *  scores its best row. The kinds:
 *    head  the section's heading: what the component IS
 *    good  one "Good for" item
 *    reach a bold "Reach for this when..." sentence from the section
 *    not   one "Not for" item; a request nearer a component's not-row than
 *          its best good-row is pushed down by the difference (the reference's
 *          own warning: "what is in a cell" is AnimalCell, not BloodCell)
 *    pair  a lesson that is two components by rule: PAIRS below, from the
 *          reference's Scale section ("when a question asks why something
 *          MATTERS, reach for the pair"). Similarity cannot count, so the
 *          two-box answers are rows of their own
 *    past  a request in tests/gen-*.html, labelled with what was built
 *
 *  Rows are built here and embedded by tools/bake-select.js into
 *  _select-vectors.json, with each row's hash so a reworded section re-bakes
 *  that row only. A file baked by a different embedder is refused, not read.
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const embedders = require('./_embed.js');

const VECTORS = path.join(__dirname, '_select-vectors.json');
const TESTS = path.join(__dirname, '..', 'demos', 'tests');

/* The two-component lessons the reference prescribes, in its words where it
 * has them. Each is a request a teacher might type, not a label. */
const PAIRS = [
  [['Membrane', 'BloodCell'], 'why osmosis matters for a red blood cell: water crossing the membrane, and the cell bursting'],
  [['Membrane', 'PlantCell'], 'why osmosis matters for a plant: water crossing the membrane, and the plant wilting'],
  [['BloodCell', 'PlantCell'], 'why a red blood cell bursts in pure water but a plant cell only gets firm: what the cell wall does'],
  [['Mitochondrion', 'ElectronTransport'], 'how chemiosmosis works in a mitochondrion: where the protons go and how much ATP they buy'],
  [['Chloroplast', 'LightReactions'], 'how a chloroplast turns light into ATP and NADPH: the thylakoid and its proton gradient'],
  [['AnimalCell', 'Mitochondrion'], 'where in the cell respiration happens, from the whole cell down to one mitochondrion'],
  [['PlantCell', 'Chloroplast'], 'where in a plant cell photosynthesis happens, from the cell down to one chloroplast'],
  [['AnimalCell', 'PlantCell'], 'how plant and animal cells differ'],
  [['HbCrowd', 'BloodCell'], 'how one amino acid change in haemoglobin sickles a red blood cell'],
  [['BloodCell', 'BloodFlow'], 'how sickled red blood cells block capillaries'],
];

const clean = s => String(s).replace(/\*\*/g, '').replace(/`/g, '').replace(/\s*\([^)]*\)/g, '').trim();
/* A "Good for" list: commas outside parentheses, a leading "and" dropped. */
function items(line) {
  const out = []; let depth = 0, cur = '';
  for (const ch of String(line)) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map(x => clean(x).replace(/^(and|or)\s+/i, '').replace(/[.;:]+$/, '').trim()).filter(x => x.length > 3);
}

/* Every row, without vectors. `d` is _compose.js's docs(). */
function rows(d) {
  const out = [];
  const add = (kind, comps, text) => out.push({ kind, comps, text,
    hash: crypto.createHash('sha256').update(kind + '\n' + text).digest('hex').slice(0, 16) });
  for (const n of d.names) {
    const s = d.sections[n];
    add('head', [n], clean(s.split('\n')[0].slice(3).replace(' — ', ': ')));
    const gf = /^\**Good for\**:?\s*(.*?)(?:\s*\**Not for\b|$)/m.exec(s);
    if (gf) for (const t of items(gf[1])) add('good', [n], t);
    const nf = /\**Not for\b[^:]*\**:?\s*(.*)$/m.exec(s);
    if (nf) for (const t of items(nf[1])) add('not', [n], t);
    for (const m of s.matchAll(/\*\*(Reach for this[^*]*)\*\*/g)) add('reach', [n], clean(m[1]));
  }
  for (const [comps, text] of PAIRS) if (comps.every(c => d.names.includes(c))) add('pair', comps, text);
  for (const [comps, text] of past(d)) add('past', comps, text);
  return out;
}

/* Requests the eval set was built from, with the components each page used. */
function past(d) {
  const out = [];
  if (!fs.existsSync(TESTS)) return out;
  for (const f of fs.readdirSync(TESTS).filter(f => /^gen-.*\.html$/.test(f))) {
    const html = fs.readFileSync(path.join(TESTS, f), 'utf8');
    const req = /<!--\s*requests\n\s*1\.\s*(.+)/.exec(html);
    if (!req) continue;
    const use = /data-use="([^"]*)"/.exec(html);
    const comps = [...new Set((use ? use[1] : '').split(',').map(x => x.trim()))].filter(n => d.names.includes(n));
    if (comps.length) out.push([comps, req[1].trim()]);
  }
  /* One row per distinct request: the same one built five times is one fact. */
  const seen = new Map();
  for (const [c, t] of out) if (!seen.has(t)) seen.set(t, c);
  return [...seen].map(([t, c]) => [c, t]);
}

let cache = null;
function load(e) {
  if (cache && cache.stamp === e.stamp) return cache;
  if (!fs.existsSync(VECTORS)) throw new Error('no _select-vectors.json: run node demos/tools/bake-select.js');
  const file = JSON.parse(fs.readFileSync(VECTORS, 'utf8'));
  if (file.stamp !== e.stamp) throw new Error(`_select-vectors.json was baked with ${file.stamp}, and the embedder is ${e.stamp}: re-bake`);
  cache = file;
  return cache;
}

/* Thresholds, set from tools/eval-select.js's numbers and nothing else. */
const FLOOR  = 0.80;   // a component below this is not about the request at all
const MARGIN = 0.03;   // the top one has to clear the next by this to be taken alone
const SECOND = 0.01;   // a second component this close to the first is also on stage

/* Scores a request vector against the rows. `skip` drops rows by text, so an
 * eval can leave a request's own past row out. */
function score(v, file, skip) {
  const best = {}, not = {}, pairs = [];
  for (const r of file.rows) {
    if (skip && skip.has(r.text)) continue;
    const s = embedders.dot(v, r.v);
    if (r.kind === 'pair' || (r.kind === 'past' && r.comps.length > 1)) { pairs.push({ comps: r.comps.slice(0, 2), s, kind: r.kind, text: r.text }); continue; }   // a lesson has two boxes at most
    const n = r.comps[0];
    if (r.kind === 'not') not[n] = Math.max(not[n] || -1, s);
    else best[n] = Math.max(best[n] || -1, s);
  }
  const comps = Object.keys(best).map(n => {
    const push = Math.max(0, (not[n] || -1) - best[n]);
    return { name: n, s: best[n] - push, raw: best[n], not: not[n] };
  }).sort((a, b) => b.s - a.s);
  pairs.sort((a, b) => b.s - a.s);
  return { comps, pairs };
}

function decide({ comps, pairs }, o = {}) {
  const FLOOR_ = o.floor ?? FLOOR, MARGIN_ = o.margin ?? MARGIN, SECOND_ = o.second ?? SECOND;
  const [a, b] = comps;
  const pair = pairs[0];
  const shortlist = [...new Set([...(pair && pair.s >= a.s ? pair.comps : []), ...comps.slice(0, 5).map(c => c.name)])].slice(0, 5);
  /* A pair row beating both its members alone is the two-box lesson. */
  if (pair && pair.s >= a.s && pair.s >= FLOOR_) {
    const runner = Math.max(pairs[1] ? pairs[1].s : -1, ...comps.filter(c => !pair.comps.includes(c.name)).slice(0, 1).map(c => c.s));
    return { uses: pair.comps, confident: pair.s - runner >= MARGIN_, shortlist, via: pair.kind };
  }
  if (!a || a.s < FLOOR_) return { uses: a ? [a.name] : [], confident: false, shortlist, via: 'floor' };
  const uses = b && a.s - b.s <= SECOND_ ? [a.name, b.name] : [a.name];
  const next = comps[uses.length];
  return { uses, confident: !next || (comps[uses.length - 1].s - next.s >= MARGIN_), shortlist, via: 'single' };
}

async function select(request, opts = {}) {
  const e = embedders.pick();
  const file = load(e);
  const [v] = await e.embed([String(request).slice(0, 2000)]);
  const sc = score(v, file, opts.skip);
  return { ...decide(sc), scores: sc.comps.slice(0, 6).map(c => ({ name: c.name, s: +c.s.toFixed(3) })),
           pair: sc.pairs[0] ? { comps: sc.pairs[0].comps, s: +sc.pairs[0].s.toFixed(3) } : null };
}

module.exports = { select, rows, score, decide, load, VECTORS, PAIRS, FLOOR, MARGIN, SECOND };
