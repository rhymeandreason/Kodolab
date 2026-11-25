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
 *   // ringRadius: a fixed circle (cm) round the group's origin, overriding the measured base
 *   ix.addGroup('box', gel.group);   // gel.group now hovers, lifts and clicks as 'box'
 *
 * What rests on an object hovers and clicks with it. When a step sets a prop on, in or over
 * another clickable prop (a gel in its box, a lid on the box, a tube in a rack), the action
 * that puts it there calls ix.addGroup(hostKey, prop.group), and the action that takes it off
 * calls ix.addGroup(ownKey, prop.group). Skip it and two bugs ship: the host lifts on hover
 * and leaves the prop behind, sunk into it, and the prop on top swallows clicks meant for the
 * host. A group answers to one key, so each hand-off is one call. Anything joined to the prop
 * (leads plugged into a lid) re-poses whenever the prop moves, hover lift included.
 *
 * The label (from Photosynthesis + BloodType): name, description, then a
 * status line that says what a click will do right now — ok (green),
 * warn (amber, e.g. "Already done") or muted (grey).
 *
 * Marker styles (swap with markerStyle, or ix.setMarkerStyle()). Both label the
 * target with its name; what to do with it is the instruction card's job.
 *   'dot'    white pill, a stem and a dot (the first Lab look)
 *   'circle' dark pill with a pulsing dot, pointing at the object, plus a pulsing
 *            band on the bench hugging its base: a circle for a round base, a rounded
 *            rectangle for a square one (from OnionRoot)
 */
import * as THREE from 'three';
import { V3, worldOf } from './core/math.js';
import { ensureEl, themeColor, getThemeVersion } from './ui.js';
import { UI } from './text.js';

const STATUS_ICON = { ok: 'ph-bold ph-hand-tap', warn: 'ph-bold ph-warning', muted: 'ph-bold ph-clock' };

export function createInteraction(stage, { targets = () => [], busy = () => false, onClick = () => {}, status, markerStyle = 'dot', hoverLift = 0.8, enabled = () => true, zoom = null } = {}) {
  if (zoom) {   // with zoom levels, the bench is clickable only in the Lab view, and not mid-transition
    const bench = () => zoom.scale === 'lab' && !zoom.transitioning;
    const t0 = targets, c0 = onClick, e0 = enabled;
    targets = () => (bench() ? t0() : []);
    onClick = (k) => (bench() ? c0(k) : undefined);
    enabled = () => bench() && e0();
  }
  const { camera, canvas, controls } = stage;
  let objects = {};
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const tooltip = ensureEl('lab-tooltip', 'lab-tooltip');
  const markerLayer = ensureEl('lab-markers', 'lab-markers');
  const markerEls = {};
  const rings = {}; // key -> ring mesh on the bench ('circle' style)
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
  /** Adds a group to `key`'s hover and pick, taking it from any key it had: a group answers to one key. */
  function addGroup(key, group) {
    const was = objects[group.userData.key];
    if (was) was.groups = was.groups.filter((g) => g !== group);
    group.userData.key = key; objects[key].groups.push(group); padHits(group, objects[key].minHit);
  }

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

  /* 'circle': a flat band on whatever the object stands on, hugging its base. The base is
   * the vertices in the bottom slab of the object, measured in a frame that turns with the
   * group, so a box gets a rounded rectangle along its sides and a pot gets a circle. */
  const tmpBox = new THREE.Box3(), v = new THREE.Vector3(), P = new THREE.Vector3(), X = new THREE.Vector3(), Qw = new THREE.Quaternion();
  const yawOf = (g) => { X.set(1, 0, 0).applyQuaternion(g.getWorldQuaternion(Qw)); return Math.atan2(-X.z, X.x); };
  function footprint(o) {
    const g = o.ringAround || o.group;
    g.updateWorldMatrix(true, true);
    const meshes = [];
    let y0 = Infinity, y1 = -Infinity;
    // the main group only (a jar's lid lying beside it shouldn't widen the ring), visible meshes only
    g.traverseVisible((m) => {
      if (!m.isMesh || !m.geometry?.attributes.position || m.userData.hitProxy) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      tmpBox.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld);
      if (tmpBox.max.y - tmpBox.min.y < 0.02) return;   // a flat decal (a name card on the bench) isn't base
      meshes.push([m, tmpBox.min.y]);
      y0 = Math.min(y0, tmpBox.min.y); y1 = Math.max(y1, tmpBox.max.y);
    });
    if (!meshes.length) return null;
    const top = y1 - y0 <= 6 ? y1 : y0 + 3;   // a short object (a berry on its side) by its whole outline
    g.getWorldPosition(P);
    const yaw = yawOf(g), c = Math.cos(yaw), s = Math.sin(yaw);
    const pts = [];
    meshes.forEach(([m, lo]) => {
      if (lo > top) return;
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        if (v.y > top) continue;
        const dx = v.x - P.x, dz = v.z - P.z;
        pts.push(dx * c - dz * s, dx * s + dz * c);
      }
    });
    if (!pts.length) return null;
    // the group's own axes, or the base's principal axis if that boxes it tighter (a berry lying askew)
    let mx = 0, mz = 0, sxx = 0, szz = 0, sxz = 0;
    const n = pts.length / 2;
    for (let i = 0; i < pts.length; i += 2) { mx += pts[i] / n; mz += pts[i + 1] / n; }
    for (let i = 0; i < pts.length; i += 2) { const x = pts[i] - mx, z = pts[i + 1] - mz; sxx += x * x; szz += z * z; sxz += x * z; }
    const th = 0.5 * Math.atan2(2 * sxz, sxx - szz);
    let best = null;
    [0, th, -th].forEach((a) => {
      const ca = Math.cos(a), sa = Math.sin(a);
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let i = 0; i < pts.length; i += 2) {
        const x = pts[i] * ca - pts[i + 1] * sa, z = pts[i] * sa + pts[i + 1] * ca;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
      }
      const area = (x1 - x0) * (z1 - z0);
      if (!best || area < best.area * 0.97) best = { a, ca, sa, area, x0, x1, z0, z1 };
    });
    const { a, ca, sa, x0, x1, z0, z1 } = best;
    const qx = (x0 + x1) / 2, qz = (z0 + z1) / 2, hx = Math.max(0.3, (x1 - x0) / 2), hz = Math.max(0.3, (z1 - z0) / 2);
    // how far into the box's corners the base reaches: 1 for a circle, 2 for a box
    let corner = 0;
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i] * ca - pts[i + 1] * sa, z = pts[i] * sa + pts[i + 1] * ca;
      corner = Math.max(corner, ((x - qx) / hx) ** 2 + ((z - qz) / hz) ** 2);
    }
    return { g, a, cx: qx * ca + qz * sa, cz: -qx * sa + qz * ca, hx, hz, round: corner < 1.7, y: y0 - P.y };
  }
  function rrect(path, hx, hz, rc) {
    path.moveTo(hx, hz - rc);
    path.absarc(hx - rc, hz - rc, rc, 0, Math.PI / 2);
    path.absarc(-hx + rc, hz - rc, rc, Math.PI / 2, Math.PI);
    path.absarc(-hx + rc, -hz + rc, rc, Math.PI, Math.PI * 1.5);
    path.absarc(hx - rc, -hz + rc, rc, Math.PI * 1.5, Math.PI * 2);
    return path;
  }
  function bandGeo({ hx, hz, round }) {
    const gap = 0.3, band = Math.min(1.2, Math.max(0.5, 0.15 * Math.min(hx, hz)));
    const rIn = round ? Math.min(hx, hz) + gap : Math.min(0.2 * Math.min(hx, hz), 1.5) + gap;
    const shape = rrect(new THREE.Shape(), hx + gap + band, hz + gap + band, rIn + band);
    shape.holes.push(rrect(new THREE.Path(), hx + gap, hz + gap, rIn));
    return new THREE.ShapeGeometry(shape, 24).rotateX(-Math.PI / 2);
  }
  function placeRing(k, o, t) {
    let r = rings[k];
    if (!r) {
      r = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: C3.accent.clone(), transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
      r.userData.noSketch = true;
      r.renderOrder = 1;
      r.userData.noHL = true;
      stage.scene.add(r);
      rings[k] = r;
    }
    if (!r.userData.fp || t - r.userData.at > 0.3) {   // re-measure a few times a second: props change shape
      let fp;
      if (o.ringRadius) { o.group.updateWorldMatrix(true, false); fp = { g: o.group, a: 0, cx: 0, cz: 0, hx: o.ringRadius, hz: o.ringRadius, round: true, y: 0 }; }
      else fp = footprint(o);
      r.userData.at = t;
      if (!fp) { r.visible = false; return; }
      const old = r.userData.fp;
      if (!old || old.round !== fp.round || Math.abs(old.a - fp.a) > 0.02 || Math.abs(old.hx - fp.hx) > 0.05 || Math.abs(old.hz - fp.hz) > 0.05) {
        r.geometry.dispose(); r.geometry = bandGeo(fp);
      } else { fp.hx = old.hx; fp.hz = old.hz; }
      r.userData.fp = fp;
    }
    const fp = r.userData.fp, yaw = yawOf(fp.g), c = Math.cos(yaw), s = Math.sin(yaw);
    fp.g.getWorldPosition(P);
    r.visible = true;
    r.position.set(P.x + fp.cx * c + fp.cz * s, P.y + fp.y - (o.ringAround ? 0 : lifts[k] || 0) + 0.1, P.z - fp.cx * s + fp.cz * c); // the ring stays on the bench
    r.rotation.set(0, yaw + fp.a, 0);
    r.material.opacity = 0.6 + 0.2 * Math.sin(t * 3.2);
  }
  function dropRing(k) {
    const r = rings[k]; if (!r) return;
    stage.scene.remove(r); r.geometry.dispose(); r.material.dispose(); delete rings[k];
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
