/* The stereo (dissecting) microscope view for sorting anesthetized flies: a full-window view over
 * the bench, sibling to microscope.js. Top-lit by a ring light, low power, real perspective.
 * The view owns the pad, the flies' layout, the brush, the piles and its own state; the lab
 * passes the flies and what each pile accepts.
 *
 *   const scope = createStereoView({ title, words: T.scope })
 *   scope.open({
 *     flies: [{ id, sex, eye }],              // laid out on the pad by the view, seeded by id
 *     piles: [{ key, label, color, fits(fly), cap, hint(fly) }],   // up to 4, keys 1 to 4
 *     sorted,                                 // { [pileKey]: [ids] } to resume, or {}
 *     autoAfter,                              // after this many sorted, offer "Sort the rest"
 *     onChange(sorted), onDone(sorted), onClose(),
 *   })
 *   scope.close()  scope.isOpen  scope.sorted  scope.root  scope.debug
 *
 * Units on the pad are cm, y up, -z at the top of the eyepiece. Its own renderer and rAF loop
 * run only while open. Styles: lab.css's "Microscope view" plus stereo.css beside this file,
 * which the view links itself. Words: T.scope in text.js. */
import * as THREE from 'three';
import { T, fmt, createMaterials, toLinear, makeBrush, disposeTree, srgbOut, LIGHT, seeded, clamp, lerp, smooth, themeColor } from '../lab.js';
import { makeFly } from '../props/fly.js';

const FIELD_MAX = 6, FIELD_MIN = 0.4;          // cm across the eyepiece: the whole pad, one fly
const FOV = 24, TILT = 7 * Math.PI / 180;      // vertical fov (deg), and the camera leans toward the student
const PAD = { w: 9, d: 6.5 };
const PILE_AT = [[-1.62, -1.5], [1.62, -1.5], [-1.62, 1.5], [1.62, 1.5]];
const PILE_R = 0.62;

const hash = (id) => {
  let h = 2166136261;
  for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
};
const angLerp = (a, b, t) => a + ((((b - a) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI) * t;
const backOut = (t) => { const c = 1.6; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };

function ensureCss() {
  if (document.querySelector('link[data-stereo-css]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = new URL('./stereo.css', import.meta.url).href; l.dataset.stereoCss = '';
  document.head.appendChild(l);
}

/* ---------- the pad, the light, the shadows ---------- */

/** Sintered polyethylene: beads ~0.1 mm with dark pores between. One tile is 1 cm. */
function padTextures() {
  const S = 1024, R = seeded(77);
  const c = document.createElement('canvas'), b = document.createElement('canvas');
  c.width = c.height = b.width = b.height = S;
  const g = c.getContext('2d'), h = b.getContext('2d');
  g.fillStyle = '#e9e7e1'; g.fillRect(0, 0, S, S);
  h.fillStyle = '#202020'; h.fillRect(0, 0, S, S);
  const wrap = (fn, x, y, r) => { for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) if (Math.abs(x + dx - S / 2) < S / 2 + r && Math.abs(y + dy - S / 2) < S / 2 + r) fn(x + dx, y + dy); };
  for (let i = 0; i < 5200; i++) {
    const x = R() * S, y = R() * S, r = 6 + R() * 9;
    wrap((px, py) => {
      const gr = g.createRadialGradient(px - r * 0.3, py - r * 0.3, 0, px, py, r);
      gr.addColorStop(0, 'rgba(255,255,253,0.95)'); gr.addColorStop(0.7, 'rgba(246,245,241,0.8)'); gr.addColorStop(1, 'rgba(232,230,224,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(px, py, r, 0, 7); g.fill();
      const hb = h.createRadialGradient(px, py, 0, px, py, r);
      hb.addColorStop(0, 'rgba(255,255,255,0.9)'); hb.addColorStop(1, 'rgba(255,255,255,0)');
      h.fillStyle = hb; h.beginPath(); h.arc(px, py, r, 0, 7); h.fill();
    }, x, y, r);
  }
  for (let i = 0; i < 2600; i++) {
    const x = R() * S, y = R() * S, r = 0.8 + R() * 2.2;
    g.fillStyle = `rgba(150,146,136,${0.25 + R() * 0.35})`; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    h.fillStyle = 'rgba(0,0,0,0.8)'; h.beginPath(); h.arc(x, y, r, 0, 7); h.fill();
  }
  const mk = (cv, srgb) => {
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(PAD.w, PAD.d); t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: mk(c, true), bump: mk(b, false) };
}
/** A soft dark ellipse for each fly's contact shadow under the ring light. */
function blobTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(40,34,26,0.42)'); gr.addColorStop(0.5, 'rgba(40,34,26,0.2)'); gr.addColorStop(1, 'rgba(40,34,26,0)');
  g.setTransform(2, 0, 0, 1, 0, 0); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
/** Reflections: a dim room with the ring light overhead, so eyes and wings catch a ring. */
function ringEnv(renderer) {
  const pm = new THREE.PMREMGenerator(renderer), s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.SphereGeometry(50, 16, 8), new THREE.MeshBasicMaterial({ color: 0x777777, side: THREE.BackSide })));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(10, 1.6, 8, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 6, 6) }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 16; s.add(ring);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.9, 0.9) }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -2; s.add(floor);
  const tex = pm.fromScene(s, 0.02).texture;
  pm.dispose();
  return tex;
}

export function createStereoView({ title, words } = {}) {
  const W = Object.assign({}, T.scope, words || {});
  let root, eyeEl, canvas, renderer, camera, scene, mat, inited = false, isOpen = false, raf = 0, last = 0;
  let F = FIELD_MAX, Ft = FIELD_MAX, cx = 0, cz = 0, cxT = 0, czT = 0;
  let flies = [], piles = [], sorted = {}, opts = {}, sel = null, hover = null, busy = false, doneFired = false;
  let brush, brushPivot, brushMats, selRing, hoverRing, flyRoot, pileRoot, blobMat, flashUntil = 0, callout = null;
  const anims = new Set();
  const $ = (q) => root.querySelector(q);

  /* ---------- DOM ---------- */
  function buildDom() {
    ensureCss();
    root = document.createElement('section');
    root.className = 'scope stereo';
    root.hidden = true;
    root.innerHTML = `
      <header class="scope-top">
        <button class="btn scope-back" data-act="back"><i class="ph-bold ph-arrow-left"></i>${W.back}</button>
        <div class="scope-title"><b>${title || W.title}</b><span class="scope-sub"></span></div>
      </header>
      <div class="scope-grid no-left">
        <main class="eye-col">
          <div class="eyepiece stereo-eye">
            <canvas></canvas>
            <div class="vignette stereo-vignette"></div>
            <div class="stereo-chips"></div>
            <div class="stereo-callout" hidden><div class="stereo-callout-body"></div></div>
            <div class="eye-hint"></div>
            <div class="scalebar"><i></i><b></b></div>
          </div>
          <div class="panel scope-controls stereo-controls">
            <label class="slider-row stereo-zoom"><span>${W.zoom}</span><input type="range" class="stereo-zoom-in" min="0" max="1000" value="0"><span class="kbd">${W.scroll}</span></label>
          </div>
        </main>
        <aside class="panel stereo-side">
          <div class="stereo-progress"><b></b><div class="stereo-bar"><i></i></div></div>
          <div class="stereo-piles-h">${W.piles}</div>
          <div class="stereo-piles"></div>
          <div class="stereo-auto" hidden><p>${W.sortRestNote}</p><button class="btn stereo-auto-btn"><i class="ph-bold ph-paint-brush"></i>${W.sortRest}</button></div>
        </aside>
      </div>`;
    (document.getElementById('app') || document.body).appendChild(root);
    eyeEl = $('.stereo-eye');
    canvas = eyeEl.querySelector('canvas');
  }

  function bindUI() {
    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="back"]')) close();
      const pb = e.target.closest('[data-pile]');
      if (pb) send(+pb.dataset.pile);
      if (e.target.closest('.stereo-auto-btn')) sortRest();
    });
    const zi = $('.stereo-zoom-in');
    zi.addEventListener('input', () => { Ft = FIELD_MAX * Math.pow(FIELD_MIN / FIELD_MAX, zi.value / 1000); clampPan(); });

    let drag = null;
    eyeEl.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.stereo-chip')) return;
      eyeEl.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, cx: cxT, cz: czT, moved: 0 };
    });
    eyeEl.addEventListener('pointermove', (e) => {
      const rect = eyeEl.getBoundingClientRect();
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y, k = F / rect.width;
        drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
        if (drag.moved > 4) {
          eyeEl.classList.add('dragging');
          cxT = drag.cx - dx * k; czT = drag.cz - dy * k; clampPan();
          cx = cxT; cz = czT;
        }
      }
      if (!(drag && drag.moved > 4)) { hover = busy ? null : flyAt(e.clientX, e.clientY, rect); eyeEl.classList.toggle('can-pick', !!hover || (!!sel && pileAt(e, rect) >= 0)); }
    });
    const end = (e) => {
      if (!drag) return;
      const click = drag.moved <= 4;
      drag = null;
      eyeEl.classList.remove('dragging');
      if (click) clickAt(e);
    };
    eyeEl.addEventListener('pointerup', end);
    eyeEl.addEventListener('pointercancel', () => { drag = null; eyeEl.classList.remove('dragging'); });
    eyeEl.addEventListener('pointerleave', () => { if (!drag) hover = null; });
    eyeEl.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = eyeEl.getBoundingClientRect();
      zoomAt(Ft * Math.exp(e.deltaY * 0.0016), (e.clientX - rect.left) / rect.width - 0.5, (e.clientY - rect.top) / rect.height - 0.5);
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (!isOpen || e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
      const k = e.key.toLowerCase();
      if (k >= '1' && k <= String(piles.length)) { send(+k - 1); e.preventDefault(); }
      else if (k === 'escape') close();
      else if (k === '+' || k === '=') zoomAt(Ft / 1.25, 0, 0);
      else if (k === '-' || k === '_') zoomAt(Ft * 1.25, 0, 0);
      else if (k.startsWith('arrow')) {
        const st = F * 0.1;
        if (k === 'arrowleft') cxT -= st; if (k === 'arrowright') cxT += st;
        if (k === 'arrowup') czT -= st; if (k === 'arrowdown') czT += st;
        clampPan(); e.preventDefault();
      }
      if (k === ' ') e.stopPropagation();
    }, true);
    new ResizeObserver(resize).observe(eyeEl);
  }

  /* ---------- camera ---------- */
  function zoomAt(f, ox, oy) {
    const f2 = clamp(f, FIELD_MIN, FIELD_MAX);
    cxT += ox * (Ft - f2); czT += oy * (Ft - f2);
    Ft = f2; clampPan();
    const zi = $('.stereo-zoom-in');
    zi.value = Math.round(1000 * Math.log(Ft / FIELD_MAX) / Math.log(FIELD_MIN / FIELD_MAX));
    zi.style.setProperty('--p', zi.value / 10 + '%');
  }
  function clampPan() {
    const mx = Math.max(0, PAD.w / 2 - Ft / 2 - 0.1), mz = Math.max(0, PAD.d / 2 - Ft / 2 - 0.1);
    cxT = clamp(cxT, -mx, mx); czT = clamp(czT, -mz, mz);
    $('.stereo-zoom-in').style.setProperty('--p', $('.stereo-zoom-in').value / 10 + '%');
  }
  function placeCamera() {
    const d = F / 2 / Math.tan((FOV / 2) * Math.PI / 180);
    camera.position.set(cx, d * Math.cos(TILT), cz + d * Math.sin(TILT));
    camera.up.set(0, 0, -1);
    camera.lookAt(cx, 0, cz);
    camera.near = d * 0.03; camera.far = d * 4 + 30;
    camera.updateProjectionMatrix();
  }
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), ndc = new THREE.Vector2(), hit = new THREE.Vector3();
  function padPoint(clientX, clientY, rect) {
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(plane, hit) ? hit.clone() : null;
  }
  const pv = new THREE.Vector3();
  /** World point → px in the eyepiece. */
  function toPx(x, y, z, rect) {
    pv.set(x, y, z).project(camera);
    return { x: (pv.x * 0.5 + 0.5) * rect.width, y: (-pv.y * 0.5 + 0.5) * rect.height };
  }

  /* ---------- picking ---------- */
  function flyAt(clientX, clientY, rect) {
    const px = clientX - rect.left, py = clientY - rect.top;
    const lenPx = (0.25 / F) * rect.width;
    let best = null, bd = Math.max(16, lenPx * 0.6);
    for (const f of flies) {
      if (f.state !== 'pad') continue;
      const c = flyCenter(f), p = toPx(c.x, c.y, c.z, rect), d = Math.hypot(p.x - px, p.y - py);
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }
  function pileAt(e, rect) {
    const p = padPoint(e.clientX, e.clientY, rect);
    if (!p) return -1;
    return piles.findIndex((pl) => Math.hypot(p.x - pl.at[0], p.z - pl.at[1]) < PILE_R * 1.1);
  }
  function clickAt(e) {
    if (busy) return;
    const rect = eyeEl.getBoundingClientRect();
    if (sel) { const i = pileAt(e, rect); if (i >= 0) { send(i); return; } }
    const f = flyAt(e.clientX, e.clientY, rect);
    select(f && f !== sel ? f : null);
  }
  function select(f) {
    sel = f;
    hideCallout();
    if (f) flash(fmt(W.picked, { n: piles.length }), 3600);
    root.querySelectorAll('.stereo-pile').forEach((b) => b.classList.toggle('armed', !!f));
  }
  const fc = new THREE.Vector3();
  /** The middle of a lying fly's body, a little behind its thorax. */
  function flyCenter(f) {
    const g = f.prop.group;
    return fc.set(-0.035, 0, 0).applyAxisAngle(THREE.Object3D.DEFAULT_UP, g.rotation.y).add(g.position);
  }

  /* ---------- animation ---------- */
  function anim(dur, fn) {
    return new Promise((resolve) => anims.add({ t0: performance.now(), dur: dur * 1000, fn, resolve }));
  }
  function tick(now) {
    for (const a of [...anims]) {
      const k = clamp((now - a.t0) / a.dur);
      a.fn(k);
      if (k >= 1) { anims.delete(a); a.resolve(); }
    }
  }
  function finishAll() { while (anims.size) tick(Infinity); }

  function setBrush(tip, dir, lift) {
    brushPivot.visible = true;
    brushPivot.position.copy(tip);
    brushPivot.rotation.set(0.5 + lift * 0.3, Math.atan2(dir.x, dir.z), 0, 'YXZ');
    // a brush lifted above the focal plane would blur away; fading stands in for that
    const o = 1 - smooth(clamp(lift * 1.4)) * 0.92;
    brushMats.forEach((m) => { m.opacity = m.userData.o0 == null ? (m.userData.o0 = m.opacity) * o : m.userData.o0 * o; m.depthWrite = o > 0.95; });
  }
  function placeFly(f, x, y, z, yaw) {
    f.prop.group.position.set(x, y, z);
    f.prop.group.rotation.y = yaw;
    f.shadow.visible = y < 0.01;
  }

  /** One brush stroke: items [{ f, a, b }] slide from a to b ({ x, y, z, yaw }) together.
   *  bounce: they are pushed only to b, then spring back to a. */
  async function stroke(items, T, bounce = false) {
    const c = (key) => items.reduce((s, it) => s.add(new THREE.Vector3(it[key].x, 0, it[key].z)), new THREE.Vector3()).divideScalar(items.length);
    const c0 = c('a'), c1 = c('b'), dir = c1.clone().sub(c0);
    const len = dir.length() || 1; dir.divideScalar(len);
    const spread = items.reduce((m, it) => Math.max(m, -(it.a.x - c0.x) * dir.x - (it.a.z - c0.z) * dir.z), 0);
    const behind = 0.15 + spread, tA = 0.24, tB = bounce ? 0.55 : 0.82, tip = new THREE.Vector3();
    const wob = items.map(() => (Math.random() - 0.5) * 0.9);
    items.forEach((it) => { it.f.state = 'moving'; });
    await anim(T, (k) => {
      let e, lift;
      if (k < tA) { e = 0; lift = 1 - smooth(k / tA); }
      else if (k < tB) { e = smooth((k - tA) / (tB - tA)); lift = 0; }
      else { e = 1; lift = smooth((k - tB) / (1 - tB)); }
      tip.copy(c0).lerp(c1, e).addScaledVector(dir, -behind + (k > tB ? lift * 0.35 : -(k < tA ? lift * 0.5 : 0)));
      tip.y = 0.012 + lift * 1.1;
      setBrush(tip, dir, lift);
      items.forEach((it, i) => {
        let m = e, from = it.a, to = it.b;
        if (bounce && k > tB) { m = 1 - backOut(smooth((k - tB) / (1 - tB))); }
        const climb = smooth(clamp((m - 0.7) / 0.3));
        placeFly(it.f, lerp(from.x, to.x, m), lerp(from.y, to.y, climb), lerp(from.z, to.z, m),
          angLerp(from.yaw, to.yaw, bounce ? 0 : smooth(m)) + Math.sin(m * Math.PI) * wob[i]);
      });
    });
    brushPivot.visible = false;
  }

  /* ---------- piles ---------- */
  const count = (p) => (sorted[p.key] || []).length;
  const hasRoom = (p) => p.cap == null || count(p) < p.cap;
  /* a layer of 3 rows × 4 flies, filled from the middle out; the next layer sits on top, offset */
  const SLOTS = [...Array(12)].map((_, j) => [Math.floor(j / 4), j % 4]).sort((a, b) => Math.hypot((a[0] - 1) * 2.2, a[1] - 1.5) - Math.hypot((b[0] - 1) * 2.2, b[1] - 1.5));
  function slot(p, i) {
    const layer = Math.floor(i / 12), [row, col] = SLOTS[i % 12];
    return { x: p.at[0] + (row - 1) * 0.31 + 0.035, y: layer * 0.072, z: p.at[1] + (col - 1.5) * 0.14 + (layer % 2) * 0.07, yaw: 0 };
  }

  async function send(i) {
    const p = piles[i];
    if (busy || !p) return;
    if (!sel) { flash(W.pickFirst); return; }
    const f = sel, full = !hasRoom(p), ok = !full && p.fits(f.data);
    busy = true; select(null); flashUntil = 0;
    const a = { x: f.home.x, y: 0, z: f.home.z, yaw: f.home.yaw };
    if (ok) {
      const b = slot(p, count(p));
      (sorted[p.key] = sorted[p.key] || []).push(f.id);
      await stroke([{ f, a, b }], 1.25);
      f.state = 'pile';
      afterSort();
    } else {
      const b = { x: lerp(a.x, p.at[0], 0.3), y: 0, z: lerp(a.z, p.at[1], 0.3), yaw: a.yaw };
      const hint = full ? W.full : (p.hint ? p.hint(f.data) : '');
      const done = stroke([{ f, a, b }], 1.45, true);
      setTimeout(() => showCallout(f, hint, p), 560);
      await done;
      f.state = 'pad';
      select(f);
      hover = null;
    }
    busy = false;
  }

  /** Sort every remaining fly the first pile that fits it and has room takes, a few per stroke. */
  async function sortRest() {
    if (busy) return;
    busy = true; select(null);
    const plan = new Map(piles.map((p) => [p, []])), left = flies.filter((f) => f.state === 'pad');
    const room = new Map(piles.map((p) => [p, p.cap == null ? Infinity : p.cap - count(p)]));
    for (const f of left) {
      const p = piles.find((q) => room.get(q) > 0 && q.fits(f.data));
      if (p) { plan.get(p).push(f); room.set(p, room.get(p) - 1); }
    }
    const total = [...plan.values()].reduce((s, l) => s + l.length, 0);
    const per = clamp(Math.ceil(total / 7), 1, 10);
    $('.stereo-auto-btn').disabled = true;
    flash(W.sorting, 99999);
    for (const [p, list] of plan) {
      list.sort((u, v) => Math.hypot(v.home.x - p.at[0], v.home.z - p.at[1]) - Math.hypot(u.home.x - p.at[0], u.home.z - p.at[1]));
      for (let i = 0; i < list.length; i += per) {
        const items = list.slice(i, i + per).map((f) => {
          const b = slot(p, count(p));
          (sorted[p.key] = sorted[p.key] || []).push(f.id);
          return { f, a: { x: f.home.x, y: 0, z: f.home.z, yaw: f.home.yaw }, b };
        });
        await stroke(items, 0.75);
        items.forEach((it) => { it.f.state = 'pile'; });
        afterSort();
        if (!isOpen) return;
      }
    }
    flashUntil = 0;
    busy = false;
  }

  function isDone() {
    if (!flies.some((f) => f.state === 'pad')) return true;
    return piles.length > 0 && piles.every((p) => p.cap != null && count(p) >= p.cap);
  }
  function snapshot() { const o = {}; for (const k in sorted) o[k] = sorted[k].slice(); return o; }
  function afterSort() {
    updateUI();
    if (opts.onChange) opts.onChange(snapshot());
    if (!doneFired && isDone()) {
      doneFired = true;
      const capped = flies.some((f) => f.state === 'pad');
      flash(capped ? W.doneCap : W.done, 4000);
      if (opts.onDone) opts.onDone(snapshot());
    }
  }
  function updateUI() {
    const capped = piles.length && piles.every((p) => p.cap != null);
    const total = capped ? Math.min(flies.length, piles.reduce((s, p) => s + p.cap, 0)) : flies.length;
    const done = Object.values(sorted).reduce((s, l) => s + l.length, 0);
    $('.stereo-progress b').textContent = fmt(W.progress, { n: done, total });
    $('.stereo-bar i').style.width = (100 * Math.min(1, done / Math.max(1, total))) + '%';
    root.querySelectorAll('.stereo-pile').forEach((b, i) => {
      const p = piles[i];
      b.querySelector('b').textContent = p.cap != null ? `${count(p)}/${p.cap}` : count(p);
      b.classList.toggle('full', !hasRoom(p));
    });
    chips.forEach((c, i) => { c.querySelector('b').textContent = piles[i].cap != null ? `${count(piles[i])}/${piles[i].cap}` : count(piles[i]); });
    const fitsSome = flies.some((f) => f.state === 'pad' && piles.some((p) => hasRoom(p) && p.fits(f.data)));
    const show = opts.autoAfter != null && done >= opts.autoAfter && fitsSome && !isDone();
    $('.stereo-auto').hidden = !show;
    $('.stereo-auto-btn').disabled = busy;
  }

  /* ---------- labels and callout ---------- */
  let chips = [];
  function buildPiles() {
    pileRoot.clear();
    $('.stereo-piles').innerHTML = piles.map((p, i) => `
      <button class="stereo-pile" data-pile="${i}" style="--c:${p.color}"><i></i><span>${p.label}</span><b></b><kbd>${i + 1}</kbd></button>`).join('');
    const box = $('.stereo-chips');
    box.innerHTML = piles.map((p, i) => `<button class="stereo-chip" data-pile="${i}" style="--c:${p.color}"><i class="ph-bold ph-arrow-up"></i><span>${p.label}</span><b></b></button>`).join('');
    chips = [...box.children];
    piles.forEach((p) => {
      const c = new THREE.Color(toLinear(p.color));
      const ring = new THREE.Mesh(new THREE.RingGeometry(PILE_R - 0.025, PILE_R, 64), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.7, depthWrite: false }));
      const disc = new THREE.Mesh(new THREE.CircleGeometry(PILE_R, 64), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.07, depthWrite: false }));
      [ring, disc].forEach((m) => { m.rotation.x = -Math.PI / 2; m.position.set(p.at[0], 0.001, p.at[1]); m.renderOrder = -1; pileRoot.add(m); });
    });
  }
  function placeLabels(rect) {
    const R = rect.width / 2;
    piles.forEach((p, i) => {
      const lx = p.at[0], lz = p.at[1] + Math.sign(p.at[1]) * (PILE_R - 0.17);   // inside the ring, on its outer side
      let { x, y } = toPx(lx, 0, lz, rect);
      const c = chips[i], dx = x - R, dy = y - R, d = Math.hypot(dx, dy);
      const lim = R * 0.86, edge = d > lim;
      if (edge) {   // to the rim, clear of the hint and scale bar at top and bottom, far enough in to show whole
        let th = Math.atan2(dy, dx);
        for (const v of [-Math.PI / 2, Math.PI / 2]) if (Math.abs(th - v) < 0.49) th = v + Math.sign(th - v || 1) * 0.49;
        const ux = Math.cos(th), uy = Math.sin(th);
        const half = Math.abs(ux) * c.offsetWidth / 2 + Math.abs(uy) * c.offsetHeight / 2;
        const r = Math.min(lim, R - half - 10);
        x = R + ux * r; y = R + uy * r;
      }
      c.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      if (c.classList.contains('edge') !== edge) { c.classList.toggle('edge', edge); c.title = edge ? W.offscreen : ''; }
      if (edge) c.querySelector('i').style.transform = `rotate(${(Math.atan2(dy, dx) * 180 / Math.PI + 90).toFixed(0)}deg)`;
    });
    if (callout) {
      const el = $('.stereo-callout'), c = flyCenter(callout.f);
      let { x, y } = toPx(c.x, 0.03, c.z, rect);
      const w = el.firstElementChild.offsetWidth / 2 + R * 0.12;
      x = clamp(x, w, 2 * R - w); y = clamp(y, R * 0.45, R * 1.75);
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      if (performance.now() > callout.until) hideCallout();
    }
  }
  function showCallout(f, html, p) {
    if (!html || !isOpen) return;
    callout = { f, until: performance.now() + 7000 };
    const el = $('.stereo-callout');
    el.style.setProperty('--c', p.color);
    el.querySelector('.stereo-callout-body').innerHTML = html;
    el.hidden = false;
  }
  function hideCallout() { callout = null; if (root) $('.stereo-callout').hidden = true; }
  function flash(msg, ms = 2800) { $('.eye-hint').innerHTML = msg; flashUntil = performance.now() + ms; }

  /* ---------- scene ---------- */
  function init() {
    buildDom();
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    srgbOut(renderer);
    renderer.toneMapping = THREE.NeutralToneMapping || THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(toLinear('#ecebe6'));
    scene.environment = ringEnv(renderer);
    camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 100);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d4cc, 0.3 * LIGHT));
    for (let i = 0; i < 8; i++) {
      const l = new THREE.DirectionalLight(0xfffaf2, 0.2 * LIGHT), a = (i / 8) * Math.PI * 2;
      l.position.set(Math.cos(a) * 6, 10, Math.sin(a) * 6);
      scene.add(l);
    }
    mat = createMaterials(null);
    const tx = padTextures();
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(PAD.w, PAD.d), mat.make.standard({ color: toLinear('#f6f5f1'), map: tx.map, bumpMap: tx.bump, bumpScale: 0.8, roughness: 0.92 }));
    pad.rotation.x = -Math.PI / 2;
    scene.add(pad);
    flyRoot = new THREE.Group(); pileRoot = new THREE.Group();
    scene.add(flyRoot, pileRoot);
    blobMat = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, toneMapped: false });
    blobMat.userData.shared = true;
    const accent = new THREE.Color(toLinear(themeColor('--accent') || '#16a34a'));
    const ringMat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, toneMapped: false });
    selRing = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.225, 64), ringMat(accent, 0.95));
    hoverRing = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.21, 64), ringMat(new THREE.Color(0.08, 0.08, 0.09), 0.35));
    [selRing, hoverRing].forEach((m) => { m.rotation.x = -Math.PI / 2; m.renderOrder = 10; m.visible = false; scene.add(m); });
    brush = makeBrush(mat);
    brushPivot = new THREE.Group();
    brush.group.position.copy(brush.anchors.tip).negate();
    brushPivot.add(brush.group);
    brushPivot.scale.setScalar(0.55);
    brushMats = [];
    brush.group.traverse((o) => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.userData.shared = false; brushMats.push(o.material); } });
    brushPivot.visible = false;
    scene.add(brushPivot);
    bindUI();
    inited = true;
  }

  function layout(list) {
    const placed = [], N = list.length;
    let Rs = Math.max(1.0, Math.sqrt(N) * 0.2);
    const order = list.slice().sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
    const homes = new Map();
    for (const d of order) {
      const R = seeded(hash(d.id) || 1);
      let p = null;
      for (let t = 0; t < 600 && !p; t++) {
        const grow = 1 + Math.floor(t / 100) * 0.08, r = Rs * grow * Math.sqrt(R()), a = R() * Math.PI * 2;
        const x = r * Math.cos(a) * 1.15, z = r * Math.sin(a) * 0.9;
        if (PILE_AT.slice(0, Math.max(piles.length, 4)).some(([px, pz]) => Math.hypot(x - px, z - pz) < PILE_R + 0.32)) continue;
        if (placed.some((q) => Math.hypot(q.x - x, q.z - z) < 0.34)) continue;
        p = { x, z, yaw: R() * Math.PI * 2 };
      }
      if (!p) p = { x: (placed.length % 10) * 0.35 - 1.6, z: 2.6, yaw: 0 };
      placed.push(p); homes.set(d.id, p);
    }
    return homes;
  }

  function populate(list) {
    flies.forEach((f) => { flyRoot.remove(f.prop.group); disposeTree(f.prop.group); });
    const homes = layout(list);
    flies = list.map((d) => {
      const prop = makeFly(mat, { sex: d.sex, eye: d.eye, seed: hash(d.id), detail: list.length > 120 ? 0.5 : 1 });
      prop.setPose(1);
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(d.sex === 'f' ? 0.32 : 0.26, 0.13), blobMat);
      shadow.rotation.x = -Math.PI / 2; shadow.position.set(-0.035, 0.002, 0); shadow.renderOrder = 1;
      prop.group.add(shadow);
      flyRoot.add(prop.group);
      const f = { id: d.id, data: d, prop, shadow, home: homes.get(d.id), state: 'pad' };
      placeFly(f, f.home.x, 0, f.home.z, f.home.yaw);
      return f;
    });
  }

  /* ---------- loop ---------- */
  function frame(now) {
    if (!isOpen) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const k = 1 - Math.exp(-dt * 12);
    F += (Ft - F) * k; cx += (cxT - cx) * k; cz += (czT - cz) * k;
    if (Math.abs(F - Ft) < Ft * 0.001) F = Ft;
    placeCamera();
    tick(now);
    const t = now / 1000;
    for (const f of flies) if (f.state === 'pad') f.prop.setTwitch(t + f.home.yaw * 10);
    const pulse = 1 + Math.sin(t * 5) * 0.05;
    selRing.visible = !!sel;
    if (sel) { const c = flyCenter(sel); selRing.position.set(c.x, 0.02, c.z); selRing.scale.setScalar(pulse); }
    hoverRing.visible = !!hover && hover !== sel && !busy;
    if (hoverRing.visible) { const c = flyCenter(hover); hoverRing.position.set(c.x, 0.02, c.z); }
    const rect = eyeEl.getBoundingClientRect();
    placeLabels(rect);
    if (now > flashUntil) {
      const msg = sel ? fmt(W.picked, { n: piles.length }) : '';
      const eh = $('.eye-hint');
      if (eh.innerHTML !== msg) eh.innerHTML = msg;
    }
    const target = F * 10 * 0.22;   // mm
    const nice = [0.2, 0.5, 1, 2, 5, 10, 20].reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
    $('.scalebar i').style.width = ((nice / 10 / F) * rect.width).toFixed(1) + 'px';
    $('.scalebar b').textContent = nice >= 10 ? nice / 10 + ' cm' : nice + ' mm';
    renderer.render(scene, camera);
  }
  function resize() {
    if (!renderer) return;
    const r = eyeEl.getBoundingClientRect();
    if (r.width < 10) return;
    renderer.setSize(r.width, r.height, false);
  }

  /* ---------- open / close ---------- */
  function open(o = {}) {
    if (!inited) init();
    finishAll();
    opts = o;
    piles = (o.piles || []).slice(0, PILE_AT.length).map((p, i) => Object.assign({}, p, { at: PILE_AT[i] }));
    sorted = {};
    const given = o.sorted || {};
    piles.forEach((p) => { if (given[p.key]) sorted[p.key] = given[p.key].slice(); });
    buildPiles();
    populate(o.flies || []);
    const byId = new Map(flies.map((f) => [f.id, f]));
    piles.forEach((p) => (sorted[p.key] || []).forEach((id, i) => {
      const f = byId.get(id);
      if (!f) return;
      const s = slot(p, i);
      placeFly(f, s.x, s.y, s.z, s.yaw);
      f.state = 'pile';
    }));
    sel = null; hover = null; busy = false; hideCallout();
    doneFired = isDone();
    $('.scope-sub').innerHTML = fmt(W.sub, { n: flies.length });
    zoomAt(Ft, 0, 0);
    $('.stereo-auto-btn').disabled = false;
    updateUI();
    root.hidden = false;
    document.body.classList.add('scope-open');
    isOpen = true;
    resize();
    flash(doneFired ? W.done : W.start, 4000);
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }
  function close() {
    if (!isOpen) return;
    finishAll();
    flies.forEach((f) => { if (f.state === 'moving') f.state = 'pile'; });
    isOpen = false;
    busy = false;
    cancelAnimationFrame(raf);
    brushPivot.visible = false;
    root.hidden = true;
    document.body.classList.remove('scope-open');
    if (opts.onClose) opts.onClose();
  }

  return {
    open, close,
    get isOpen() { return isOpen; },
    get sorted() { return snapshot(); },
    get root() { if (!inited) init(); return root; },
    debug: {
      get flies() { return flies; },
      pick: (id) => select(flies.find((f) => f.id === id) || null),
      send, sortRest,
      view: (field, x = 0, z = 0) => { Ft = F = clamp(field, FIELD_MIN, FIELD_MAX); cxT = cx = x; czT = cz = z; zoomAt(Ft, 0, 0); cx = cxT; cz = czT; },
    },
  };
}
