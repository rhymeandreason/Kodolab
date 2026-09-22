#!/usr/bin/env node
/* =====================================================================
 *  resolve-catalog.js — turn the molecule catalog's NAMES into CIDs.
 *
 *  Run:  node tools/resolve-catalog.js            # resolve, write the CSV
 *        node tools/resolve-catalog.js --dry-run  # resolve, write nothing
 *        node tools/resolve-catalog.js --limit 20 # first 20 unresolved rows
 *        node tools/resolve-catalog.js --recheck  # ignore CIDs already found
 *        node tools/resolve-catalog.js --verify   # OFFLINE: cross-check the CSV
 *                                                 # against our committed src.cid
 *
 *  Needs the network. Nothing else here does except check-handedness.js, and
 *  for the same reason: an ABSOLUTE reference has to come from outside.
 *
 *  WHY. Every PubChem row in the catalog is identified by a name, and its
 *  Fetch URL column bakes in `/compound/name/<name>/`. tools/sdf/README.md
 *  already carries the case where that went wrong: **a bare name pins neither
 *  a stereocentre nor a charge state.** Ask PubChem for "glucose" and you get
 *  CID 5793, whose anomeric centre is undefined — which renders beautifully and
 *  is not the molecule any lesson here means. 28 of the 65 Core PubChem rows
 *  carry stereocentres, so resolving names one at a time, during a build, is
 *  how a wrong anomer gets into a spec at machine speed.
 *
 *  A CID pins exactly one compound. Resolving all of them ONCE, committing the
 *  result, and reading CIDs from then on turns that risk into a fact on disk.
 *
 *  WHAT IT WILL NOT DO: pick. If a name resolves to more than one CID the row
 *  is marked `Ambiguous` and every candidate is written to the report, because
 *  choosing between two stereoisomers is a chemistry judgement and this file
 *  has no basis for making it. Same for a name that resolves to nothing.
 *
 *  A CID IS NOT AUTOMATICALLY A PINNED STEREOISOMER, which is the trap this
 *  tool exists for and very nearly walked into itself. "glucose" resolves
 *  cleanly to CID 5793 — one CID, no ambiguity, a tidy `Verified` — and that
 *  record has UndefinedAtomStereoCount 1: the anomeric centre is not specified.
 *  It is the exact CID check-handedness.js calls out as proving nothing. So
 *  every resolved row also records PubChem's own stereo counts, and any record
 *  with an undefined centre is reported rather than counted as done.
 *
 *  IT ALSO ASKS WHETHER A 3D CONFORMER EXISTS. `record_type=3d` has none for
 *  many charged species (tools/README.md's caveat — bicarbonate, pyruvate,
 *  HPO4(2-)), and those have to be hand-written or Skel-built instead. That is
 *  a planning fact, and it is much cheaper to learn for thirty rows at once
 *  than to discover one at a time halfway through building a lesson.
 *
 *  SELF-TEST — `--verify`, and it is OFFLINE and re-runnable. Ten specs in this
 *  library already carry a committed `src.cid` (glycine 750, atp 5461108,
 *  nadh 439153 …), fetched and checked long before this catalog existed. Every
 *  one of them that the catalog also lists is a place the resolver's answer can
 *  be compared against something other than its own output.
 *
 *  It began as a check inside the resolving loop and that was too weak: it
 *  matched on the Identifier column alone, so it fired on two rows out of ten —
 *  `atp` is "adenosine triphosphate" in the catalog, and never met its spec.
 *  Matching a spec's key, short name and full name as well finds the rest, and
 *  making it a separate offline mode means it can be re-run after any hand-edit
 *  to the CID column rather than only during a five-minute network pass.
 *
 *  POLITENESS. PubChem asks for no more than 5 requests/second. This runs at
 *  3/s, backs off on 429/503, and skips rows that already have a CID so a
 *  re-run costs nothing. Be a good citizen: it is a public service.
 * ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

// TRACKED, and that is the point. This lived in the repo's `resources/` while
// it was being resolved, which is .gitignored — so 147 verified CIDs existed in
// one working tree and nowhere else, and the docs pointed at a path the repo
// did not contain. Same reasoning as tools/sdf/: a build-time input that cannot
// be cheaply re-derived gets committed. Re-deriving this one means 400 network
// requests and a human ruling on 21 rows.
//
// `resources/` stays the drop zone for a fresh export from the spreadsheet.
// Copy one in over this file, re-run, and `--verify` afterwards.
const CSV = path.join(__dirname, 'catalog', 'molecule-catalog.csv');
const REPORT = path.join(__dirname, 'catalog', 'resolution-report.txt');
const PUG = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound';

const DRY     = process.argv.includes('--dry-run');
const RECHECK = process.argv.includes('--recheck');
const LIMIT   = (() => { const i = process.argv.indexOf('--limit');
  return i > 0 ? Number(process.argv[i + 1]) : Infinity; })();

/* ---- CSV, RFC4180 enough for this file ---------------------------------- */
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || r[0] !== '');
}
const esc = v => /[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v;
const toCSV = rows => rows.map(r => r.map(esc).join(',')).join('\n') + '\n';

/* ---- the network, slowly ------------------------------------------------ */
const sleep = ms => new Promise(r => setTimeout(r, ms));
let last = 0;
async function get(url, tries = 4) {
  for (let n = 0; n < tries; n++) {
    const wait = 334 - (Date.now() - last);          // ~3 requests/second
    if (wait > 0) await sleep(wait);
    last = Date.now();
    let res;
    try { res = await fetch(url, { headers: { 'User-Agent': 'Kodolab/catalog-resolver' } }); }
    catch (e) { if (n === tries - 1) return { status: 0, body: e.message }; await sleep(1500 * (n + 1)); continue; }
    if (res.status === 429 || res.status === 503) { await sleep(2000 * (n + 1)); continue; }
    return { status: res.status, body: await res.text() };
  }
  return { status: 0, body: 'gave up after retries' };
}

const json = s => { try { return JSON.parse(s); } catch { return null; } };

async function cidsFor(name) {
  const r = await get(`${PUG}/name/${encodeURIComponent(name)}/cids/JSON`);
  if (r.status === 404) return [];
  if (r.status !== 200) return null;                 // network trouble, not "absent"
  const j = json(r.body);
  return (j && j.IdentifierList && j.IdentifierList.CID) || [];
}

async function propsFor(cid) {
  const r = await get(`${PUG}/cid/${cid}/property/MolecularFormula,Charge,Title,`
    + `DefinedAtomStereoCount,UndefinedAtomStereoCount/JSON`);
  const j = r.status === 200 ? json(r.body) : null;
  return (j && j.PropertyTable && j.PropertyTable.Properties &&
          j.PropertyTable.Properties[0]) || null;
}

// Does the 3D record exist? Ask for the conformer list rather than the whole
// SDF — same answer, a fraction of the bytes.
async function has3D(cid) {
  const r = await get(`${PUG}/cid/${cid}/conformers/JSON`);
  if (r.status === 404) return false;
  if (r.status !== 200) return null;
  const j = json(r.body);
  return !!(j && j.InformationList && j.InformationList.Information &&
            j.InformationList.Information[0] &&
            (j.InformationList.Information[0].ConformerID || []).length);
}

/* ---- what this library already knows, to check the tool against ---------- */
function committed() {
  const { MOLECULES } = require(path.join(__dirname, '..', 'lib', 'lib-node.js'));
  const byQuery = new Map();
  for (const k of Object.keys(MOLECULES)) {
    const s = MOLECULES[k].src;
    if (s && s.cid) byQuery.set((s.query || k).toLowerCase(), { key: k, cid: String(s.cid) });
  }
  return byQuery;
}

/* PubChem's own count of unspecified stereocentres. `pinned` means the record
 * IS one stereoisomer; anything else means the name landed on a parent record
 * that stands for several, and a spec built from it would be a molecule nobody
 * chose. Returns false when it needs a human. */
function stereoVerdict(row, p, iStereo, report) {
  if (!p) { row[iStereo] = '?'; return true; }
  const un = p.UndefinedAtomStereoCount, def = p.DefinedAtomStereoCount;
  if (un == null) { row[iStereo] = '?'; return true; }
  if (un === 0) { row[iStereo] = def ? `pinned (${def})` : 'pinned (achiral)'; return true; }
  row[iStereo] = `${un} UNDEFINED`;
  report.push(`UNDEFINED STEREO  ${row[0] !== undefined ? '' : ''}CID ${p.CID} `
    + `"${p.Title || ''}" — ${un} unspecified stereocentre(s), ${def} defined. `
    + `The name landed on a record that stands for several isomers; name the one `
    + `you mean (e.g. "beta-D-glucose" 64689, not "glucose" 5793)`);
  return false;
}

/* ---- --verify: the CSV against what this library already committed -------- */
function verifyAgainstSpecs() {
  const rows = parseCSV(fs.readFileSync(CSV, 'utf8'));
  const head = rows[0], col = n => head.indexOf(n);
  const iMol = col('Molecule'), iId = col('Identifier'), iCid = col('CID');
  if (iCid < 0) { console.log('  no CID column yet — run the resolver first'); return 1; }
  const { MOLECULES } = require(path.join(__dirname, '..', 'lib', 'lib-node.js'));
  // Index the catalog by every string that might name a molecule.
  const byName = new Map();
  for (let r = 1; r < rows.length; r++) {
    const cid = (rows[r][iCid] || '').trim();
    if (!cid) continue;
    for (const s of [rows[r][iMol], rows[r][iId]])
      if (s) byName.set(s.trim().toLowerCase(), { cid, row: rows[r][iMol] });
  }
  let checked = 0, bad = 0, unlisted = 0;
  for (const key of Object.keys(MOLECULES)) {
    const m = MOLECULES[key];
    if (!m.src || !m.src.cid) continue;
    const names = [m.src.query, key, m.short, m.name]
      .filter(Boolean).map(x => String(x).toLowerCase());
    const hit = names.map(n => byName.get(n)).find(Boolean);
    if (!hit) { unlisted++; console.log(`  --    ${key.padEnd(12)} not in the catalog`); continue; }
    checked++;
    if (String(m.src.cid) !== hit.cid) {
      bad++;
      console.log(`  FAIL  ${key.padEnd(12)} spec ships src.cid ${m.src.cid}, `
        + `catalog row "${hit.row}" says ${hit.cid}`);
    } else console.log(`  ok    ${key.padEnd(12)} ${hit.cid} agrees with "${hit.row}"`);
  }
  console.log(`\n  ${checked} compared, ${bad} disagree, ${unlisted} not listed in the catalog`);
  return bad ? 1 : 0;
}

if (process.argv.includes('--verify')) {
  console.log('\n== committed src.cid vs the catalog\n');
  process.exit(verifyAgainstSpecs());
}

(async () => {
  const rows = parseCSV(fs.readFileSync(CSV, 'utf8'));
  const head = rows[0];
  const col = n => head.indexOf(n);
  // Add the two columns this tool owns, once.
  for (const c of ['CID', 'Has 3D', 'Stereo']) if (col(c) < 0) head.push(c);
  const iSrc = col('Source'), iId = col('Identifier'), iMol = col('Molecule'),
        iConf = col('ID Confidence'), iCid = col('CID'), i3D = col('Has 3D'),
        iStereo = col('Stereo');
  const width = head.length;
  for (let r = 1; r < rows.length; r++)
    while (rows[r].length < width) rows[r].push('');

  const known = committed();
  const report = [], counts = {};
  const bump = k => counts[k] = (counts[k] || 0) + 1;
  let done = 0, selfTested = 0, selfFailed = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row[iSrc].trim() !== 'PubChem') continue;
    if (row[iCid] && row[iStereo] && !RECHECK) { bump('already resolved'); continue; }
    if (done >= LIMIT) break;
    done++;

    const name = row[iId].trim();

    // A row resolved by an earlier run, before the stereo audit existed: it has
    // its CID already, so skip the name lookup and the conformer probe and just
    // ask the one question that is missing. One request instead of three.
    if (row[iCid] && !RECHECK) {
      const p0 = await propsFor(row[iCid]);
      stereoVerdict(row, p0, iStereo, report);
      process.stdout.write(`  ${String(done).padStart(3)}  ${row[iMol].padEnd(30)} `
        + `CID ${row[iCid].padEnd(10)} ${row[iStereo]}\n`);
      bump(row[iStereo].startsWith('pinned') ? 'resolved' : 'undefined stereocentre');
      continue;
    }
    const cids = await cidsFor(name);
    if (cids === null) {
      row[iConf] = 'Network error'; bump('network error');
      report.push(`NETWORK  ${row[iMol]} (${name})`);
      continue;
    }
    if (!cids.length) {
      row[iConf] = 'Not found'; bump('not found');
      report.push(`NOT FOUND  ${row[iMol]}  — name "${name}" resolves to nothing; `
                + `find the CID by hand and fill the CID column`);
      continue;
    }
    if (cids.length > 1) {
      row[iConf] = 'Ambiguous'; bump('ambiguous');
      report.push(`AMBIGUOUS  ${row[iMol]}  — "${name}" -> ${cids.length} CIDs: `
                + `${cids.slice(0, 8).join(', ')}${cids.length > 8 ? ' …' : ''}\n`
                + `           pick one BY STEREOCHEMISTRY and write it into the CID column`);
      continue;
    }

    const cid = String(cids[0]);
    const p = await propsFor(cid);
    const three = await has3D(cid);
    row[iCid] = cid;
    row[i3D] = three === null ? '?' : three ? 'yes' : 'no';
    row[iConf] = three ? 'Verified' : 'Verified (no 3D)';
    if (!three) {
      bump('no 3D conformer');
      report.push(`NO 3D    ${row[iMol]}  CID ${cid} — record_type=3d has no conformer; `
                + `hand-write or Skel-build it (tools/README.md's caveat)`);
    } else bump('resolved');

    // the self-test: does the tool agree with a CID this library already ships?
    const k = known.get(name.toLowerCase());
    if (k) {
      selfTested++;
      if (k.cid !== cid) {
        selfFailed++;
        report.push(`SELF-TEST FAIL  ${name}: resolver says ${cid}, `
                  + `but spec \`${k.key}\` ships src.cid ${k.cid}`);
      }
    }
    if (p && p.MolecularFormula) row[iConf] += ` · ${p.MolecularFormula}`;
    if (stereoVerdict(row, p, iStereo, report) === false) bump('undefined stereocentre');
    process.stdout.write(`  ${String(done).padStart(3)}  ${row[iMol].padEnd(30)} `
      + `CID ${cid.padEnd(10)} ${three ? '3D' : 'no 3D'}\n`);
  }

  console.log('\n---- summary');
  for (const k of Object.keys(counts).sort()) console.log(`  ${String(counts[k]).padStart(4)}  ${k}`);
  console.log(`  ${String(selfTested).padStart(4)}  checked against a committed src.cid`
    + (selfFailed ? ` — ${selfFailed} DISAGREE` : ' — all agree'));

  if (report.length) {
    if (!DRY) fs.writeFileSync(REPORT, report.join('\n') + '\n');
    console.log(`\n  ${report.length} row(s) need a human — see `
      + `${DRY ? '(dry run, not written)' : path.basename(REPORT)}`);
  }
  if (!DRY) { fs.writeFileSync(CSV, toCSV(rows)); console.log(`\n  wrote ${path.basename(CSV)}`); }
  else console.log('\n  --dry-run: nothing written');

  // A resolver that disagrees with a CID we already committed is not one whose
  // 154 new answers should be trusted.
  if (selfFailed) process.exit(1);
})();
