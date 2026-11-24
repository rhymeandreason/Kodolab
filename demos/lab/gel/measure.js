/* The gel image panel: the finished gel as a photo, read the way a student reads one.
 *   1. click each ladder band: its distance from the well goes on a semi-log plot
 *   2. click each crime-scene band: the ladder's line turns its distance into a size
 *   3. pick the suspect whose lane matches
 * The photo is drawn from model.js, the same lanes the bench gel paints, and every size and
 * distance the panel prints is read from there. Its state is the student's reading, not bench
 * state, so a timeline rebuild leaves it alone; restart clears it.
 *
 *   const measure = createMeasure({ onChange });
 *   measure.open() · close() · reset() · solved() · progress() · isOpen · el */
import { T, fmt } from '../lab.js';
import { SAMPLES, LADDER, MATCH, SUSPECTS, laneState } from './model.js';

const M = T.measure;
const MM_MAX = 80;                        // the photo shows the first 80 mm below the wells
const SNAP = 3;                           // mm: a click this close to a band picks it
const CS = SAMPLES.find((s) => s.key === 'cs');
const LANE = { ladder: 0, cs: SAMPLES.indexOf(CS) };
const num = (n) => n.toLocaleString('en-US');
const bandsMm = (sample) => laneState(sample, 1, 1, 1).bands.map((b) => b.d * 10);
const read = (mm) => Math.round(mm * 2) / 2;   // a ruler read to the half millimetre

export function createMeasure({ onChange = () => {} } = {}) {
  const el = document.createElement('section');
  el.className = 'panel gel-panel';
  el.hidden = true;
  el.innerHTML = `
    <div class="panel-head">
      <span class="panel-title"><i class="ph ph-ruler"></i><span>${M.title}</span></span>
      <button class="gp-close" aria-label="${M.close}"><i class="ph ph-x"></i></button>
    </div>
    <div class="gp-body">
      <div class="gp-photo"><canvas class="gp-img"></canvas></div>
      <div class="gp-side">
        <p class="gp-step"></p>
        <canvas class="gp-plot"></canvas>
        <div class="gp-table"></div>
        <div class="gp-pick"></div>
        <p class="gp-note"></p>
      </div>
    </div>`;
  (document.getElementById('app') || document.body).appendChild(el);
  const $ = (s) => el.querySelector(s);
  const img = $('.gp-img'), plot = $('.gp-plot');

  const ladderMm = bandsMm(SAMPLES[LANE.ladder]), csMm = bandsMm(CS);
  let st;
  function reset() { st = { ladder: LADDER.map(() => null), cs: CS.bands.map(() => null), pick: null, hover: null }; render(); }

  const phase = () => (st.ladder.some((v) => v === null) ? 'ladder' : st.cs.some((v) => v === null) ? 'cs' : 'pick');
  /** least-squares line through the measured ladder points, log10(bp) against mm */
  function fit() {
    const pts = LADDER.map((bp, i) => [st.ladder[i], Math.log10(bp)]).filter(([x]) => x !== null);
    if (pts.length < 2) return null;
    const n = pts.length, sx = pts.reduce((s, p) => s + p[0], 0), sy = pts.reduce((s, p) => s + p[1], 0);
    const sxx = pts.reduce((s, p) => s + p[0] * p[0], 0), sxy = pts.reduce((s, p) => s + p[0] * p[1], 0);
    const b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - b * sx) / n;
    return { a, b, at: (mm) => Math.pow(10, a + b * mm) };
  }
  const estimate = (mm, f) => Math.round(f.at(mm) / 10) * 10;

  /* ---------- the photo ---------- */
  const G = { top: 34, left: 34, laneW: 0, pxmm: 0 };
  function sizeCanvas(c) {
    const r = c.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.max(10, r.width * dpr); c.height = Math.max(10, r.height * dpr);
    const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [x, r.width, r.height];
  }
  function drawPhoto() {
    const [x, w, h] = sizeCanvas(img);
    G.laneW = (w - G.left - 8) / SAMPLES.length; G.pxmm = (h - G.top - 10) / MM_MAX;
    const yOf = (mm) => G.top + mm * G.pxmm, xOf = (i) => G.left + (i + 0.5) * G.laneW;
    x.fillStyle = '#17120a'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#0d0a05'; x.fillRect(G.left - 4, G.top - 8, w - G.left - 4, h - G.top + 8);
    // ruler
    x.strokeStyle = 'rgba(255,236,200,.35)'; x.fillStyle = 'rgba(255,236,200,.6)'; x.lineWidth = 1;
    x.font = '600 10px ui-monospace, monospace'; x.textAlign = 'right'; x.textBaseline = 'middle';
    for (let mm = 0; mm <= MM_MAX; mm += 5) {
      const y = yOf(mm), big = mm % 10 === 0;
      x.beginPath(); x.moveTo(G.left - 6 - (big ? 6 : 3), y); x.lineTo(G.left - 6, y); x.stroke();
      if (big) x.fillText(String(mm), G.left - 14, y);
    }
    x.textAlign = 'left'; x.fillText(M.ruler, 4, G.top - 18);
    // lanes: labels, wells, bands
    x.textAlign = 'center'; x.font = '700 11px system-ui, sans-serif';
    SAMPLES.forEach((s, i) => {
      const cx = xOf(i), bw = G.laneW * 0.66;
      const active = (phase() === 'ladder' && i === LANE.ladder) || (phase() === 'cs' && i === LANE.cs);
      x.fillStyle = active ? '#fde68a' : 'rgba(255,236,200,.7)';
      x.fillText(T.samples[s.key].label, cx, 12);
      x.fillStyle = 'rgba(255,236,200,.18)'; x.fillRect(cx - bw / 2, G.top - 6, bw, 4);
      laneState(s, 1, 1, 1).bands.forEach((b) => {
        const y = yOf(b.d * 10), bh = Math.max(3, b.w * 10 * G.pxmm);
        x.shadowColor = `rgba(220,255,120,${0.7 * b.a})`; x.shadowBlur = 8;
        x.fillStyle = `rgba(226,255,150,${0.35 + 0.65 * b.a})`;
        x.beginPath(); x.roundRect(cx - bw / 2, y - bh / 2, bw, bh, bh / 2); x.fill();
        x.shadowBlur = 0;
      });
    });
    // measured bands: a line to the ruler and the reading
    const mark = (lane, mm, color) => {
      const y = yOf(mm), cx = xOf(lane), bw = G.laneW * 0.66;
      x.strokeStyle = color; x.lineWidth = 1.5; x.setLineDash([3, 3]);
      x.beginPath(); x.moveTo(G.left - 6, y); x.lineTo(cx - bw / 2 - 3, y); x.stroke(); x.setLineDash([]);
      x.beginPath(); x.roundRect(cx - bw / 2 - 3, y - 6, bw + 6, 12, 6); x.stroke();
    };
    st.ladder.forEach((v, i) => v !== null && mark(LANE.ladder, ladderMm[i], '#93c5fd'));
    st.cs.forEach((v, i) => v !== null && mark(LANE.cs, csMm[i], '#fca5a5'));
    if (st.hover) {
      const { lane, i } = st.hover, mm = (lane === LANE.ladder ? ladderMm : csMm)[i];
      const cx = xOf(lane), bw = G.laneW * 0.66;
      x.strokeStyle = '#ffffff'; x.lineWidth = 2;
      x.beginPath(); x.roundRect(cx - bw / 2 - 4, yOf(mm) - 7, bw + 8, 14, 7); x.stroke();
    }
  }
  function bandAt(ev) {
    const r = img.getBoundingClientRect(), px = ev.clientX - r.left, py = ev.clientY - r.top;
    const lane = Math.floor((px - G.left) / G.laneW), mm = (py - G.top) / G.pxmm;
    const p = phase();
    const want = p === 'ladder' ? LANE.ladder : p === 'cs' ? LANE.cs : -1;
    if (lane !== want) return null;
    const list = lane === LANE.ladder ? ladderMm : csMm;
    let best = null;
    list.forEach((d, i) => { const e = Math.abs(d - mm); if (e < SNAP && (!best || e < best.e)) best = { lane, i, e }; });
    return best;
  }
  img.addEventListener('pointermove', (ev) => {
    const b = bandAt(ev), key = b ? `${b.lane}:${b.i}` : '', was = st.hover ? `${st.hover.lane}:${st.hover.i}` : '';
    img.style.cursor = b ? 'pointer' : 'default';
    if (key !== was) { st.hover = b; drawPhoto(); }
  });
  img.addEventListener('pointerleave', () => { st.hover = null; drawPhoto(); });
  img.addEventListener('click', (ev) => {
    const b = bandAt(ev);
    if (!b) return;
    if (b.lane === LANE.ladder) st.ladder[b.i] = read(ladderMm[b.i]);
    else st.cs[b.i] = read(csMm[b.i]);
    render();
    onChange();
  });

  /* ---------- the semi-log plot ---------- */
  function drawPlot() {
    const [x, w, h] = sizeCanvas(plot);
    const L = 44, R = 10, Tp = 10, Bm = 30;
    const lo = Math.log10(300), hi = Math.log10(10000);
    const X = (mm) => L + (mm / MM_MAX) * (w - L - R), Y = (lg) => Tp + (1 - (lg - lo) / (hi - lo)) * (h - Tp - Bm);
    x.clearRect(0, 0, w, h);
    x.strokeStyle = 'rgba(23,24,26,.1)'; x.fillStyle = '#66696f'; x.lineWidth = 1;
    x.font = '500 10px system-ui, sans-serif';
    [300, 500, 1000, 2000, 5000, 10000].forEach((bp) => {
      const y = Y(Math.log10(bp));
      x.beginPath(); x.moveTo(L, y); x.lineTo(w - R, y); x.stroke();
      x.textAlign = 'right'; x.textBaseline = 'middle'; x.fillText(num(bp), L - 5, y);
    });
    for (let mm = 0; mm <= MM_MAX; mm += 20) {
      const xx = X(mm);
      x.beginPath(); x.moveTo(xx, Tp); x.lineTo(xx, h - Bm); x.stroke();
      x.textAlign = 'center'; x.textBaseline = 'top'; x.fillText(String(mm), xx, h - Bm + 4);
    }
    x.fillStyle = '#55585e'; x.textAlign = 'center'; x.fillText(M.plotX, L + (w - L - R) / 2, h - 13);
    const f = fit();
    if (f) {
      x.strokeStyle = 'rgba(37,99,235,.55)'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(X(0), Y(f.a)); x.lineTo(X(MM_MAX), Y(f.a + f.b * MM_MAX)); x.stroke();
    }
    LADDER.forEach((bp, i) => {
      if (st.ladder[i] === null) return;
      x.fillStyle = '#1d4ed8'; x.beginPath(); x.arc(X(st.ladder[i]), Y(Math.log10(bp)), 4, 0, Math.PI * 2); x.fill();
    });
    if (f) st.cs.forEach((mm) => {
      if (mm === null) return;
      const lg = Math.log10(estimate(mm, f));
      x.strokeStyle = '#dc2626'; x.lineWidth = 2;
      x.setLineDash([3, 3]); x.beginPath(); x.moveTo(X(mm), h - Bm); x.lineTo(X(mm), Y(lg)); x.lineTo(L, Y(lg)); x.stroke(); x.setLineDash([]);
      x.fillStyle = '#fff'; x.beginPath(); x.arc(X(mm), Y(lg), 4.5, 0, Math.PI * 2); x.fill(); x.stroke();
    });
  }

  /* ---------- the words ---------- */
  function render() {
    if (!st) return;
    const p = phase(), f = fit();
    $('.gp-step').innerHTML = p === 'ladder' ? M.stepLadder : p === 'cs' ? M.stepCs : M.stepPick;
    const row = (a, b, on) => `<tr class="${on ? 'on' : ''}"><td>${a}</td><td>${b}</td></tr>`;
    const ladderRows = LADDER.map((bp, i) => row(fmt(M.bp, { n: num(bp) }), st.ladder[i] === null ? `<i>${M.notYet}</i>` : fmt(M.mm, { n: st.ladder[i] }), st.ladder[i] !== null)).join('');
    const csRows = CS.bands.map((_, i) => {
      const mm = st.cs[i];
      return row(mm === null ? `<i>${M.notYet}</i>` : fmt(M.mm, { n: mm }), mm === null || !f ? '·' : `≈ ${fmt(M.bp, { n: num(estimate(mm, f)) })}`, mm !== null);
    }).join('');
    $('.gp-table').innerHTML = `
      <table><thead><tr><th colspan="2">${M.ladderHead}</th></tr><tr><th>${M.sizeCol}</th><th>${M.distCol}</th></tr></thead><tbody>${ladderRows}</tbody></table>
      <table class="${p === 'ladder' ? 'dim' : ''}"><thead><tr><th colspan="2">${M.csHead}</th></tr><tr><th>${M.distCol}</th><th>${M.estCol}</th></tr></thead><tbody>${csRows}</tbody></table>`;
    const pick = $('.gp-pick');
    pick.hidden = p !== 'pick';
    pick.innerHTML = SUSPECTS.map((s) => `<button data-s="${s.key}" class="${st.pick === s.key ? (s.key === MATCH ? 'right' : 'wrong') : ''}">${fmt(M.pick, { short: T.samples[s.key].short })}</button>`).join('');
    $('.gp-note').innerHTML = p !== 'pick' ? (p === 'cs' ? M.curveNote : '') : verdict();
    drawPhoto();
    drawPlot();
  }
  function verdict() {
    if (!st.pick) return '';
    const s = SAMPLES.find((x) => x.key === st.pick), name = T.samples[s.key].short;
    if (s.key === MATCH) return fmt(M.right, { name });
    const extra = bandsMm(s).find((d) => csMm.every((c) => Math.abs(c - d) > 1.5));
    return fmt(M.wrong, { name, mm: read(extra) });
  }
  el.querySelector('.gp-pick').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-s]');
    if (!b) return;
    st.pick = b.dataset.s;
    render();
    onChange();
  });
  $('.gp-close').addEventListener('click', () => api.close());
  window.addEventListener('resize', () => { if (api.isOpen) render(); });

  const api = {
    el,
    get isOpen() { return !el.hidden; },
    open() { if (!el.hidden) return; el.hidden = false; requestAnimationFrame(render); onChange(); },
    close() { if (el.hidden) return; el.hidden = true; onChange(); },
    reset() { reset(); },
    solved: () => st.pick === MATCH,
    progress: () => {
      const n = st.ladder.filter((v) => v !== null).length + st.cs.filter((v) => v !== null).length + (st.pick === MATCH ? 1 : 0);
      return n / (LADDER.length + CS.bands.length + 1);
    },
  };
  reset();
  return api;
}
