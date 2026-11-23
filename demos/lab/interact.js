/* Clickable objects: picking, hover highlight and lift, floating target markers and
 * the hover label.
 *
 *   const ix = createInteraction(stage, {
 *     targets: () => ['beakerA'],          // keys to highlight + mark right now
 *     busy:    () => false,                // true while an action animates
 *     onClick: (key) => { ... },           // key is null for empty space
 *     status:  (key, isTarget) => ({ text: 'Click to stir', kind: 'ok' }),   // optional
 *     markerStyle: 'circle',               // how targets are marked (below)
 *     hoverLift: 0.8,                      // cm a clickable object rises on hover (0 = off)
 *     enabled: () => true,                 // false = no picking, hover or markers (e.g. while
 *                                          // the sim shows another view, like a zoom level)
 *   });
 *   ix.register('beakerA', beaker.group, { name, short, desc, anchor: V3(0, 11, 0) });
 *   // thin objects (a skewer, a leaf) get an invisible hit box at least minHit cm thick
 *   // in every direction (default 2.4; 0 = off), so they are easy to click
 *   // ringAround: size the 'circle' ring from another group, e.g. the ice bath a bottle stands in
 *   ix.register('bottle', bottle.group, { name, ringAround: iceBath.group });
 *
 * The label (from Photosynthesis + BloodType): name, description, then a
 * status line that says what a click will do right now — ok (green),
 * warn (amber, e.g. "Already done") or muted (grey).
 *
 * Marker styles (swap with markerStyle, or ix.setMarkerStyle()). Both label the
 * target with its name; what to do with it is the instruction card's job.
 *   'dot'    white pill, a stem and a dot (the first Lab look)
 *   'circle' dark pill with a pulsing dot, pointing at the object, plus a pulsing
 *            ring on the bench around it (from OnionRoot)
 */
import * as THREE from 'three';
import { V3, worldOf } from './core/math.js';
import { ensureEl, themeColor, getThemeVersion } from './ui.js';
import { UI } from './text.js';

const STATUS_ICON = { ok: 'ph-bold ph-hand-tap', warn: 'ph-bold ph-warning', muted: 'ph-bold ph-clock' };

export function createInteraction(stage, { targets = () => [], busy = () => false, onClick = () => {}, status, markerStyle = 'dot', hoverLift = 0.8, enabled = () => true } = {}) {
  const { camera, canvas, controls } = stage;
  let objects = {};
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const tooltip = ensureEl('lab-tooltip', 'lab-tooltip');
  const markerLayer = ensureEl('lab-markers', 'lab-markers');
  const markerEls = {};
  const rings = {}; // key -> ring mesh on the bench ('circle' style)
  const ringGeo = new THREE.RingGeometry(0.84, 1, 72);
  // theme colours for the 3D bits, re-read when the theme changes
  let themeV = -1;
  const C3 = { accent: new THREE.Color(), glow: new THREE.Color() };
  function readTheme() {
    if (themeV === getThemeVersion()) return;
    themeV = getThemeVersion();
    C3.accent.set(themeColor('--accent') || '#16a34a');
    C3.glow.set(themeColor('--accent-2') || '#22c55e');
    Object.values(rings).forEach((r) => r.material.color.copy(C3.accent));
  }
  let style = markerStyle;
  let hoverKey = null;

  /* Hover lift: a clickable object rises a little under the pointer. Applied as
   * an offset on top of wherever step code has put it, and dropped instantly
   * before a click runs, so it never fights moveTo() or a replay. */
  const lifts = {}; // key -> current offset (cm)
  let liftT = performance.now();
  function setLift(k, v) {
    const d = v - (lifts[k] || 0);
    if (d && objects[k]) objects[k].groups.forEach((g) => { g.position.y += d; });
    if (v) lifts[k] = v; else delete lifts[k];
  }
  const dropLifts = () => Object.keys(lifts).forEach((k) => setLift(k, 0));
  function updateLift() {
    const now = performance.now(), dt = Math.min(0.05, (now - liftT) / 1000);
    liftT = now;
    if (busy()) { dropLifts(); return; }
    const keys = new Set(Object.keys(lifts));
    if (hoverKey && hoverLift) keys.add(hoverKey);
    const k = 1 - Math.exp(-14 * dt);
    keys.forEach((key) => {
      const goal = key === hoverKey ? hoverLift : 0;
      const cur = lifts[key] || 0;
      let v = cur + (goal - cur) * k;
      if (Math.abs(goal - v) < 0.01) v = goal;
      setLift(key, v);
    });
  }
  let down = null;
  let lastMove = null;
  let wasEnabled = true;

  function register(key, group, info = {}) {
    group.userData.key = key;
    // own copies of materials so highlighting one object doesn't light up its twins
    group.traverse((m) => {
      if (m.isMesh && m.material && !m.userData.noHL && m.material.emissive) {
        const c = m.material.clone();
        c.userData = Object.assign({}, m.material.userData, { shared: false });
        if (m.material.onBeforeCompile) { c.onBeforeCompile = m.material.onBeforeCompile; c.customProgramCacheKey = m.material.customProgramCacheKey; }
        m.material = c;
      }
    });
    objects[key] = Object.assign({ group, groups: [group], short: info.name }, info);
    padHits(group, info.minHit);
    return objects[key];
  }
  function addGroup(key, group) { group.userData.key = key; objects[key].groups.push(group); padHits(group, objects[key].minHit); }

  /* Hit box: an invisible box (never drawn, still raycast) in the group's own space,
   * widened to min cm along any thin axis. It moves and rotates with the group. */
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const hb = new THREE.Box3(), hbTmp = new THREE.Box3(), toLocal = new THREE.Matrix4();
  function padHits(group, min = 2.4) {
    if (!min) return;
    group.updateWorldMatrix(true, true);
    toLocal.copy(group.matrixWorld).invert();
    hb.makeEmpty();
    group.traverseVisible((m) => {
      if (!m.isMesh || m.isInstancedMesh || !m.geometry || m.userData.hitProxy) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      hb.union(hbTmp.copy(m.geometry.boundingBox).applyMatrix4(new THREE.Matrix4().multiplyMatrices(toLocal, m.matrixWorld)));
    });
    if (hb.isEmpty()) return;
    const size = hb.getSize(new THREE.Vector3());
    if (Math.min(size.x, size.y, size.z) >= min) return;
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(Math.max(size.x, min), Math.max(size.y, min), Math.max(size.z, min)), hitMat);
    hb.getCenter(proxy.position);
    proxy.userData.hitProxy = true; proxy.userData.noHL = true;
    proxy.castShadow = proxy.receiveShadow = false;
    group.add(proxy);
  }

  function clear() {
    Object.keys(lifts).forEach((k) => delete lifts[k]); // the old groups are being thrown away
    objects = {};
    hoverKey = null;
    Object.keys(markerEls).forEach((k) => { markerEls[k].remove(); delete markerEls[k]; });
    Object.keys(rings).forEach(dropRing);
    tooltip.classList.remove('show');
  }

  function highlight(key, on) {
    const o = objects[key]; if (!o) return;
    o.groups.forEach((grp) => grp.traverse((m) => {
      if (!m.isMesh || m.userData.noHL) return;
      const mat = m.material; if (!mat || !mat.emissive || mat.userData.shared) return;
      if (on) {
        if (m.userData.em === undefined) { m.userData.em = mat.emissive.getHex(); m.userData.ei = mat.emissiveIntensity; }
        readTheme(); mat.emissive.copy(C3.glow); mat.emissiveIntensity = 0.16;
      } else if (m.userData.em !== undefined) {
        mat.emissive.setHex(m.userData.em); mat.emissiveIntensity = m.userData.ei;
        delete m.userData.em;
      }
    }));
  }

  const isShown = (o) => { while (o) { if (!o.visible) return false; o = o.parent; } return true; };
  const keyOf = (o) => { while (o) { if (o.userData && o.userData.key) return o.userData.key; o = o.parent; } return null; };

  function pick(x, y) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const list = [];
    Object.values(objects).forEach((o) => o.groups.forEach((g) => list.push(g)));
    for (const h of raycaster.intersectObjects(list, true)) {
      if (!isShown(h.object)) continue;
      const k = keyOf(h.object);
      if (k) return k;
    }
    return null;
  }

  const isTarget = (k) => !!k && !busy() && targets().includes(k);

  function showTooltip(key, x, y) {
    const o = objects[key];
    if (!o) { tooltip.classList.remove('show'); return; }
    const t = isTarget(key);
    let st = status ? status(key, t) : null;
    if (st === undefined || (st === null && t)) st = t ? { text: UI.clickToUse, kind: 'ok' } : null;
    tooltip.innerHTML = `<div class="tt-name">${o.name}</div>${o.desc ? `<div class="tt-desc">${o.desc}</div>` : ''}`
      + (st ? `<div class="tt-status ${st.kind || 'muted'}"><i class="${STATUS_ICON[st.kind] || STATUS_ICON.muted}"></i><span>${st.text}</span></div>` : '');
    tooltip.classList.add('show');
    const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
    let tx = x + 16, ty = y + 18;
    if (tx + tw > window.innerWidth - 10) tx = x - tw - 12;
    if (ty + th > window.innerHeight - 10) ty = y - th - 12;
    tooltip.style.transform = `translate(${tx}px, ${ty}px)`;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!enabled()) return;
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
    // don't start an orbit when the press lands on something clickable (from BloodType)
    if (e.button === 0 && isTarget(pick(e.clientX, e.clientY))) controls.enabled = false;
  });
  canvas.addEventListener('pointermove', (e) => { lastMove = { x: e.clientX, y: e.clientY, type: e.pointerType }; });
  canvas.addEventListener('pointerleave', () => {
    lastMove = null; tooltip.classList.remove('show');
    if (hoverKey) highlight(hoverKey, false);
    hoverKey = null;
  });
  window.addEventListener('pointerup', (e) => {
    if (!down) return;
    controls.enabled = true;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const dt = performance.now() - down.t;
    down = null;
    if (moved > 6 || dt > 600 || e.target !== canvas) return;
    dropLifts(); // put the object back down before the step animates it
    onClick(pick(e.clientX, e.clientY));
  });

  function updateHover() {
    if (!lastMove || lastMove.type === 'touch' || down) return;
    const k = pick(lastMove.x, lastMove.y);
    const t = isTarget(k);
    const hk = t ? k : null;
    if (hk !== hoverKey) {
      if (hoverKey) highlight(hoverKey, false);
      if (hk) highlight(hk, true);
      hoverKey = hk;
    }
    canvas.classList.toggle('pointer', t);
    if (k && !busy()) showTooltip(k, lastMove.x, lastMove.y);
    else tooltip.classList.remove('show');
  }

  function markerHTML(k, o) {
    if (style === 'circle') return `<div class="pill"><span class="pulse"></span>${o.short}</div>`;
    return `<div class="pill"><i class="ph-fill ph-hand-tap"></i>${o.short}</div><div class="stem"></div><div class="ring"></div>`;
  }

  /* 'circle': a flat ring on whatever the object stands on, sized to its footprint */
  const box = new THREE.Box3(), tmpBox = new THREE.Box3(), size = new THREE.Vector3(), centre = new THREE.Vector3();
  function placeRing(k, o, t) {
    let r = rings[k];
    if (!r) {
      r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: C3.accent.clone(), transparent: true, opacity: 0.4, depthWrite: false }));
      r.userData.noSketch = true;
      r.rotation.x = -Math.PI / 2;
      r.renderOrder = 1;
      r.userData.noHL = true;
      stage.scene.add(r);
      rings[k] = r;
    }
    // the main group only (a jar's lid lying beside it shouldn't widen the ring), visible meshes only
    box.makeEmpty();
    const around = o.ringAround || o.group;
    around.updateWorldMatrix(true, true);
    around.traverseVisible((m) => {
      if (!m.isMesh || !m.geometry || m.userData.hitProxy) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      box.union(tmpBox.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld));
    });
    if (box.isEmpty()) { r.visible = false; return; }
    box.getSize(size); box.getCenter(centre);
    const rad = Math.max(size.x, size.z) / 2 * 1.2 + 2;
    const pulse = 1 + 0.06 * Math.sin(t * 3.2);
    r.visible = true;
    r.position.set(centre.x, box.min.y - (o.ringAround ? 0 : lifts[k] || 0) + 0.05, centre.z); // the ring stays on the bench
    r.scale.setScalar(rad * pulse);
    r.material.opacity = 0.6 + 0.2 * Math.sin(t * 3.2);
  }
  function dropRing(k) {
    const r = rings[k]; if (!r) return;
    stage.scene.remove(r); r.material.dispose(); delete rings[k];
  }

  function updateMarkers() {
    readTheme();
    const keys = busy() ? [] : targets();
    Object.keys(markerEls).forEach((k) => { if (!keys.includes(k)) { markerEls[k].remove(); delete markerEls[k]; } });
    Object.keys(rings).forEach((k) => { if (!keys.includes(k) || style !== 'circle') dropRing(k); });
    markerLayer.dataset.style = style;
    const r = canvas.getBoundingClientRect();
    const t = performance.now() / 1000;
    keys.forEach((k) => {
      const o = objects[k]; if (!o) return;
      let el = markerEls[k];
      if (!el || el.dataset.style !== style) {
        if (el) el.remove();
        el = document.createElement('div');
        el.className = 'lab-marker ' + style;
        el.dataset.style = style;
        el.innerHTML = markerHTML(k, o);
        markerLayer.appendChild(el);
        markerEls[k] = el;
      }
      if (style === 'circle') {
        el.classList.toggle('hot', hoverKey === k);
        placeRing(k, o, t);
      }
      const w = worldOf(o.group, o.anchor || V3()).project(camera);
      const visible = w.z < 1 && Math.abs(w.x) < 1.1 && Math.abs(w.y) < 1.1;
      el.style.opacity = visible ? 1 : 0;
      el.style.transform = `translate(${((w.x + 1) / 2) * r.width}px, ${((1 - w.y) / 2) * r.height}px) translate(-50%, -100%)`;
    });
  }

  function clearHover() {
    if (hoverKey) highlight(hoverKey, false);
    hoverKey = null;
    tooltip.classList.remove('show');
  }

  return {
    register, addGroup, clear, highlight, pick, clearHover,
    get markerStyle() { return style; },
    setMarkerStyle(s) { style = s === 'circle' ? 'circle' : 'dot'; },
    get objects() { return objects; },
    update() {
      if (!enabled()) {
        if (wasEnabled) { wasEnabled = false; clearHover(); dropLifts(); canvas.classList.remove('pointer'); }
        Object.keys(markerEls).forEach((k) => { markerEls[k].remove(); delete markerEls[k]; });
        Object.keys(rings).forEach(dropRing);
        return;
      }
      wasEnabled = true;
      updateHover(); updateLift(); updateMarkers();
    },
  };
}
