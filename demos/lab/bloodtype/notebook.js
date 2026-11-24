/* The notebook: the data table (step 4) and the genetics tab (step 5), in one panel on the
 * right. Its state is the student's reading, not bench state, so a timeline rebuild leaves
 * it alone; restart and a new case clear it. Every type it checks against comes from model.js.
 *
 *   const nb = createNotebook({ getCase, ready(pid, well), onFocus(pid, well?), onChange });
 *   nb.open('data' | 'genetics') · close() · reset() · render()
 *   nb.checked() · nb.solved() · nb.progress() · nb.isOpen · nb.el
 *   nb.answer('man1') · nb.guess        the case's answer, asked on the step card */
import { T, fmt } from '../lab.js';
import { WELLS, TYPES, hasAntigen, typeLabel, genotypes, punnett, canParent, aboOf, rhOf } from './model.js';
import { PATIENTS, SERA } from './bench.js';

const N = T.notebook;
const name = (pid) => T.props.people[pid];
const dot = (c) => `<span class="nb-dot" style="background:${c}"></span>`;
const color = Object.fromEntries(PATIENTS.map((p) => [p.id, p.color]));
const serumColor = Object.fromEntries(SERA.map((s) => [s.id, s.cap]));
const allele = (a) => (a === 'A' ? 'I<sup>A</sup>' : a === 'B' ? 'I<sup>B</sup>' : '<i>i</i>');
const genoTxt = (g) => { const [a, r] = g.split('|'); return `${[...a].map((x) => (x === 'A' ? 'Iᴬ' : x === 'B' ? 'Iᴮ' : 'i')).join('')} ${r}`; };
const sign = (v) => (v === true ? '+' : v === false ? '−' : '');

export function createNotebook({ getCase, ready, onFocus = () => {}, onChange = () => {} }) {
  const el = document.createElement('section');
  el.className = 'panel nb-panel';
  el.hidden = true;
  el.innerHTML = `
    <div class="nb-tabs">
      <button data-tab="data"><i class="ph ph-table"></i>${N.tabData}</button>
      <button data-tab="genetics"><i class="ph ph-dna"></i>${N.tabGenetics}<i class="ph ph-lock-simple nb-lock"></i></button>
    </div>
    <div class="nb-body"></div>`;
  (document.getElementById('app') || document.body).appendChild(el);
  const body = el.querySelector('.nb-body');

  let st, tab = 'data';
  function reset() {
    st = {
      record: Object.fromEntries(PATIENTS.map((p) => [p.id, { A: null, B: null, Rh: null, type: '' }])),
      fb: null, msg: '', checked: false,
      man: 'man1', mom: null, manG: null, guess: null,
    };
    tab = 'data';
    render();
  }
  const types = () => getCase().types;
  const recorded = () => PATIENTS.reduce((n, p) => n + WELLS.filter((k) => st.record[p.id][k] !== null).length + (st.record[p.id].type ? 1 : 0), 0);
  const TOTAL = PATIENTS.length * (WELLS.length + 1);

  /* ---------- data table ---------- */
  function dataTab() {
    const fb = st.fb;
    const rows = PATIENTS.map((p) => {
      const r = st.record[p.id];
      const cells = WELLS.map((k) => {
        const v = r[k], ok = ready(p.id, k);
        const cls = ['nb-obs', v === true ? 'pos' : v === false ? 'neg' : ok ? 'ready' : ''];
        if (fb) cls.push(fb[p.id][k] ? 'right' : 'wrong');
        return `<td><button class="${cls.join(' ')}" data-p="${p.id}" data-k="${k}" ${ok && !st.checked ? '' : 'disabled'}>${sign(v) || (ok ? '?' : '·')}</button></td>`;
      }).join('');
      const opts = ['', ...TYPES].map((o) => `<option value="${o}" ${r.type === o ? 'selected' : ''}>${o || '·'}</option>`).join('');
      const scls = fb ? (fb[p.id].type ? 'right' : 'wrong') : '';
      return `<tr data-p="${p.id}"><th>${dot(p.color)}${name(p.id)}</th>${cells}<td><select class="${scls}" data-p="${p.id}" ${st.checked ? 'disabled' : ''} aria-label="${fmt(N.typeOf, { name: name(p.id) })}">${opts}</select></td></tr>`;
    }).join('');
    const head = WELLS.map((k) => `<th>${dot(serumColor[k])}${T.props.sera[k]}</th>`).join('');
    return `
      <p class="nb-lead">${st.checked ? N.doneLead : N.lead}</p>
      <table class="nb-data"><thead><tr><th>${N.sample}</th>${head}<th>${N.type}</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="nb-legend"><span><b class="nb-mini pos">+</b>${N.pos}</span><span><b class="nb-mini neg">−</b>${N.neg}</span></div>
      <div class="nb-key"><div class="nb-key-title"><i class="ph ph-info"></i>${N.keyTitle}</div>${keyBody()}</div>
      ${st.checked ? '' : `<button class="btn nb-check">${N.check}</button>`}
      <p class="nb-msg ${st.checked ? 'ok' : st.msg ? 'no' : ''}">${st.checked ? N.allRight : st.msg}</p>`;
  }
  function keyBody() {
    const row = (a, b, t) => `<tr><td><b class="nb-mini ${a ? 'pos' : 'neg'}">${a ? '+' : '−'}</b></td><td><b class="nb-mini ${b ? 'pos' : 'neg'}">${b ? '+' : '−'}</b></td><td>→</td><td><b>${t}</b></td></tr>`;
    return `<div class="nb-keys">
      <table><thead><tr><th>${T.props.sera.A}</th><th>${T.props.sera.B}</th><th></th><th>ABO</th></tr></thead>
        <tbody>${row(1, 0, 'A')}${row(0, 1, 'B')}${row(1, 1, 'AB')}${row(0, 0, 'O')}</tbody></table>
      <p>${N.keyRh}</p></div>`;
  }
  function check() {
    const missing = PATIENTS.some((p) => WELLS.some((k) => !ready(p.id, k)));
    if (missing) { st.msg = N.notStirred; return; }
    if (recorded() < TOTAL) { st.msg = N.fillAll; return; }
    let wrongObs = 0, wrongType = 0;
    st.fb = Object.fromEntries(PATIENTS.map((p) => {
      const t = types()[p.id], r = st.record[p.id], f = {};
      WELLS.forEach((k) => { f[k] = r[k] === hasAntigen(t, k); if (!f[k]) wrongObs++; });
      f.type = r.type === typeLabel(t);
      if (!f.type) wrongType++;
      return [p.id, f];
    }));
    if (!wrongObs && !wrongType) {
      st.checked = true; st.msg = '';
      st.mom = genotypes(types().mother)[0];
      st.manG = genotypes(types()[st.man])[0];
      return;
    }
    st.msg = [wrongObs ? fmt(wrongObs > 1 ? N.wrongObsN : N.wrongObs1, { n: wrongObs }) : '',
      wrongType ? fmt(wrongType > 1 ? N.wrongTypeN : N.wrongType1, { n: wrongType }) : ''].filter(Boolean).join(' ');
  }

  /* ---------- genetics ---------- */
  function geneticsTab() {
    if (!st.checked) return `<p class="nb-locked"><i class="ph ph-lock-simple"></i>${N.locked}</p>`;
    const ty = types(), baby = typeLabel(ty.baby), manT = ty[st.man];
    const chips = PATIENTS.map((p) => `<span class="nb-chip">${dot(p.color)}${name(p.id)} <b>${typeLabel(ty[p.id])}</b></span>`).join('');
    const opt = (list, v) => list.map((g) => `<option value="${g}" ${g === v ? 'selected' : ''}>${genoTxt(g)}</option>`).join('');
    const pq = punnett(st.mom, st.manG);
    const square = (cap, top, side, cells, label, match) => `<div><div class="nb-pq-cap">${cap}</div><table class="nb-pq">
      <tr><th></th>${[...top].map((a) => `<th>${label(a)}</th>`).join('')}</tr>
      ${[...side].map((m, i) => `<tr><th>${label(m)}</th>${cells[i].map((g) => `<td class="${match(g) ? 'match' : ''}"><b>${[...g].map(label).join('')}</b></td>`).join('')}</tr>`).join('')}
    </table></div>`;
    const outs = TYPES.filter((o) => pq.tally[o]).map((o) => `<span class="nb-out ${o === baby ? 'match' : ''}">${o}<small>${Math.round(pq.tally[o] * 100)}%</small></span>`).join('');
    const p = pq.tally[baby] || 0;
    const verdict = p > 0 ? fmt(N.can, { man: name(st.man), baby, pct: Math.round(p * 100) })
      : fmt(N.cannot, { man: name(st.man), baby }) + (genotypes(ty.mother).length * genotypes(manT).length > 1 ? ` ${N.tryOther}` : '');
    return `
      <div class="nb-chips">${chips}</div>
      <p class="nb-rule">${N.rule}</p>
      <div class="nb-seg">${['man1', 'man2'].map((m) => `<button data-man="${m}" class="${st.man === m ? 'on' : ''}">${fmt(N.cross, { man: name(m) })}</button>`).join('')}</div>
      <div class="nb-pick">
        <label>${fmt(N.genoOf, { name: name('mother'), type: typeLabel(ty.mother) })}<select data-g="mom">${opt(genotypes(ty.mother), st.mom)}</select></label>
        <label>${fmt(N.genoOf, { name: name(st.man), type: typeLabel(manT) })}<select data-g="man">${opt(genotypes(manT), st.manG)}</select></label>
      </div>
      <div class="nb-pqs">
        ${square(N.aboGene, pq.da, pq.ma, pq.abo, allele, (g) => aboOf(g) === ty.baby.abo)}
        ${square(N.rhGene, pq.dr, pq.mr, pq.rh, (a) => `<i>${a}</i>`, (g) => rhOf(g) === ty.baby.rh)}
      </div>
      <div class="nb-outs">${outs}</div>
      <p class="nb-verdict ${p > 0 ? 'yes' : 'no'}">${verdict}</p>
      ${api.solved() ? `<div class="nb-explain">${explanation()}</div>` : ''}`;
  }
  /** Why each man is in or out, from canParent over every genotype. */
  function explanation() {
    const ty = types(), mo = ty.mother, ba = ty.baby, out = [];
    const momAlleles = new Set(genotypes(mo).flatMap((g) => [...g.split('|')[0]]));
    if (ba.abo === 'O') out.push(N.needO);
    else {
      const missing = (ba.abo === 'AB' ? ['A', 'B'] : [ba.abo]).filter((a) => !momAlleles.has(a));
      if (missing.length) out.push(fmt(N.needAllele, { mom: mo.abo, alleles: missing.map(allele).join(', ') }));
    }
    if (ba.rh === '+' && mo.rh === '-') out.push(N.needD);
    ['man1', 'man2'].forEach((m) => {
      const r = canParent(mo, ty[m], ba), L = typeLabel(ty[m]);
      if (r.ok) out.push(fmt(N.could, { man: name(m), type: L, baby: typeLabel(ba) }));
      else {
        const why = [];
        if (!r.aboOk) why.push(fmt(N.whyAbo, { mom: mo.abo, man: ty[m].abo, baby: ba.abo }));
        if (!r.rhOk) why.push(fmt(N.whyRh, { man: name(m) }));
        out.push(fmt(N.excluded, { man: name(m), type: L, why: why.join('; ') }));
      }
    });
    out.push(`<span class="nb-muted">${N.dnaNote}</span>`);
    return out.map((s) => `<p>${s}</p>`).join('');
  }

  /* ---------- render and events ---------- */
  function render() {
    if (!st) return;
    el.querySelectorAll('.nb-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    el.querySelector('.nb-lock').hidden = st.checked;
    body.innerHTML = tab === 'data' ? dataTab() : geneticsTab();
  }
  const changed = () => { render(); onChange(); };

  el.querySelector('.nb-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (b) { tab = b.dataset.tab; changed(); }
  });
  body.addEventListener('click', (e) => {
    const obs = e.target.closest('button.nb-obs');
    if (obs && !obs.disabled) {
      const r = st.record[obs.dataset.p], k = obs.dataset.k;
      r[k] = r[k] === null ? true : !r[k];
      st.fb = null; st.msg = '';
      onFocus(obs.dataset.p, k);
      return changed();
    }
    if (e.target.closest('.nb-check')) { check(); if (st.checked) tab = 'genetics'; return changed(); }
    const man = e.target.closest('button[data-man]');
    if (man) { st.man = man.dataset.man; st.manG = genotypes(types()[st.man])[0]; return changed(); }
  });
  body.addEventListener('change', (e) => {
    const s = e.target.closest('select');
    if (!s) return;
    if (s.dataset.g === 'mom') st.mom = s.value;
    else if (s.dataset.g === 'man') st.manG = s.value;
    else { st.record[s.dataset.p].type = s.value; st.fb = null; st.msg = ''; }
    changed();
  });
  body.addEventListener('mouseover', (e) => {
    const c = e.target.closest('[data-p]');
    if (c) onFocus(c.dataset.p, c.dataset.k);
  });

  const api = {
    el,
    get isOpen() { return !el.hidden; },
    get tab() { return tab; },
    open(t) { if (t) tab = t; const was = el.hidden; el.hidden = false; render(); if (was) onChange(); },
    close() { if (el.hidden) return; el.hidden = true; onChange(); },
    reset, render,
    checked: () => st.checked,
    solved: () => st.guess != null && st.guess === getCase().father,
    /** The student's answer to the case (asked on the step card, not here). */
    get guess() { return st.guess; },
    answer(m) { st.guess = m; changed(); },
    progress: () => recorded() / TOTAL,
  };
  reset();
  return api;
}
