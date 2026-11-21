#!/usr/bin/env node
/* =====================================================================
 *  bake-select.js — the component selector's rows as vectors
 *
 *    node demos/tools/bake-select.js            # embed what changed
 *    node demos/tools/bake-select.js --check    # exit 1 if stale, embed nothing
 *    node demos/tools/bake-select.js --force    # re-embed every row
 *
 *  Reads Components.md and tests/gen-*.html through api/_select.js's rows(),
 *  writes api/_select-vectors.json. Run it after a component's section
 *  changes: a reworded "Good for" line with an old vector does not fail, it
 *  routes requests to the wrong component, confidently.
 * ===================================================================== */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const env = path.join(ROOT, '.env.local');
if (fs.existsSync(env)) for (const line of fs.readFileSync(env, 'utf8').split('\n')) {
  const m = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const CHECK = process.argv.includes('--check'), FORCE = process.argv.includes('--force');

const sel = require(path.join(ROOT, 'api/_select.js'));
const compose = require(path.join(ROOT, 'api/_compose.js'));
const e = require(path.join(ROOT, 'api/_embed.js')).pick();

(async () => {
  const rows = sel.rows(compose.docs());
  const old = fs.existsSync(sel.VECTORS) ? JSON.parse(fs.readFileSync(sel.VECTORS, 'utf8')) : { rows: [] };
  const same = old.stamp === e.stamp && !FORCE;
  const have = new Map(same ? old.rows.map(r => [r.hash, r.v]) : []);
  const stale = rows.filter(r => !have.has(r.hash));
  const gone = old.rows.filter(r => !rows.some(x => x.hash === r.hash)).length;
  const kinds = rows.reduce((o, r) => (o[r.kind] = (o[r.kind] || 0) + 1, o), {});
  console.log(`${rows.length} rows ${JSON.stringify(kinds)}; ${stale.length} to embed, ${gone} gone${same ? '' : ' (new embedder: all)'}`);
  if (CHECK) process.exit(stale.length || gone ? 1 : 0);
  if (!stale.length && !gone) return;
  const vs = stale.length ? await e.embed(stale.map(r => r.text)) : [];
  stale.forEach((r, i) => have.set(r.hash, vs[i]));
  const out = { stamp: e.stamp, rows: rows.map(r => ({ ...r, v: have.get(r.hash).map(x => +x.toFixed(5)) })) };
  fs.writeFileSync(sel.VECTORS, JSON.stringify(out));
  console.log(`wrote ${path.relative(ROOT, sel.VECTORS)} (${(fs.statSync(sel.VECTORS).size / 1e6).toFixed(1)} MB)`);
})().catch(err => { console.error(err.message); process.exit(1); });
