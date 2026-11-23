/* Watch mode's camera director: calm, video-like camera moves.
 *
 *   const follow = createFollowCam(stage, ix, {
 *     acting: lesson.acting, watching: () => lesson.mode === 'watch',
 *     rig: { t: V3(0, 4, 0), p: V3(4, 25, 42) },   // the lab's default zoom and angle
 *     special: ['dna', 'spoolIn'],                 // named views allowed to zoom in
 *   });
 *   stage.onFrame((dt) => follow.update(dt));
 *
 * Rules (Watch mode only; Hands-on keeps every authored view as it is):
 *   1. One default zoom per lab (`rig`). Normal moves only pan left and right:
 *      the camera keeps the rig's height, depth and angle and slides along x.
 *   2. Only views named in `special` may zoom in (or change angle). They play as
 *      authored; the next normal view zooms back out to the rig, unless it is
 *      named in `keepClose` (a step between two close-ups).
 *   3. Move only when needed: a request whose subject is already well inside the
 *      free width (from the current view, rig or close-up) is dropped, and so is
 *      any pan shorter than `minShift` of the free width. Only horizontal position
 *      counts, since a pan can't fix something poking out above or below.
 *   4. At most `maxMoves` camera moves in any `windowSec` seconds, and at least
 *      `minGap` seconds between pans. A step view over budget waits and is
 *      re-checked before it moves. Zooming in or out of a close-up and keeping the
 *      action on screen when it has completely left it are exempt, so the story
 *      never gets lost.
 *   5. Moves are slow and eased; there is no continuous tracking. If the action
 *      (the clicked object, anything that moved since the click began, or a
 *      vessel a moving tool is over) pokes out of the free width, the camera makes
 *      one pan to bring it back in. An action wider than the free width is left alone,
 *      and a tool on its way back to its resting place no longer counts. Orbiting by hand switches this off until the next click.
 *
 * acting() returns { key, id } while Watch mode is about to click or is clicking
 * `key` (id changes with every click), else null. follow.hold() stops re-centring
 * for the current click (a step that set up its own view mid-click).
 */
import * as THREE from 'three';
import { clamp } from './core/math.js';
import { isInstant } from './core/tween.js';

export function createFollowCam(stage, ix, {
  acting = () => null,
  watching = () => true,
  rig = null,            // { t, p } in the same space as the stage's views; default: the first view
  special = [],          // names of views that may zoom in
  keepClose = [],        // normal views that don't pull the camera out of a close-up (the next shot is close too)
  maxMoves = 4,          // camera moves allowed ...
  windowSec = 30,        // ... in any window this long
  minGap = 3,            // seconds between pans
  margin = 36,           // px kept clear inside the free screen area
  topBar = 64,           // px under the top bar
  inner = 0.12,          // a step's subject this far (fraction of the free width) inside the edges needs no pan
  minShift = 0.15,       // never pan less than this fraction of the free width: small nudges are just motion
  slack = 0.08,          // the action may poke this far (fraction of the free width) past an edge
} = {}) {
  const { camera, controls } = stage;
  rig = rig || Object.values(stage.views)[0];
  const offset = rig.p.clone().sub(rig.t);
  const isSpecial = (name) => !!name && special.includes(name);

  let mode = null;        // 'rig' | 'special' | null (unknown: the next request always moves)
  let closeUp = null;     // the close-up's name while mode is 'special'
  let rigX = rig.t.x;     // where the rig is panned to
  let moves = [];         // times of recent moves (s)
  let lastPan = -Infinity;
  let pending = null;     // a step view's subject waiting for budget (a Vector3), re-checked before it moves
  let clock = 0;
  const history = [];     // every move: { t, kind, x, why } (for tuning)
  const log = (kind, x, why, detail) => { history.push({ t: +clock.toFixed(1), kind, x: +x.toFixed(1), why, ...(detail ? { detail } : {}) }); if (history.length > 80) history.shift(); };
  let id = null, suspended = null;
  let start = new Map();
  const involved = new Set(), moved = new Set();
  const peak = new Map(); // key -> furthest it has moved from its start this click (cm)
  const box = new THREE.Box3(), tmp = new THREE.Box3(), v = new THREE.Vector3();
  const corners = Array.from({ length: 8 }, () => new THREE.Vector3());

  controls.addEventListener('start', () => { suspended = id; pending = null; mode = null; });

  /* ---------------------------------------------------------- screen tests */
  function safeRect(shrink = 0) {
    const w = window.innerWidth, h = window.innerHeight, i = stage.insets();
    const r = { x0: (i.left || 0) + margin, x1: w - (i.right || 0) - margin, y0: Math.max(i.top || 0, topBar) + margin, y1: h - (i.bottom || 0) - margin, w, h };
    const dx = (r.x1 - r.x0) * shrink, dy = (r.y1 - r.y0) * shrink;
    return { ...r, x0: r.x0 + dx, x1: r.x1 - dx, y0: r.y0 + dy, y1: r.y1 - dy };
  }
  function boxCorners(b) {
    let k = 0;
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) corners[k++].set(x, y, z);
    return corners;
  }
  // Panning only moves things sideways, so only horizontal position counts.
  const screenX = (p) => { v.copy(p).project(camera); return v.z > 1 ? NaN : ((v.x + 1) / 2) * window.innerWidth; };
  function spanX(b) { // the box's left and right edge on screen (px)
    let lo = Infinity, hi = -Infinity;
    for (const c of boxCorners(b)) { const x = screenX(c); if (Number.isNaN(x)) continue; lo = Math.min(lo, x); hi = Math.max(hi, x); }
    return lo <= hi ? [lo, hi] : null;
  }
  // px on screen per cm of pan, at the rig's target
  function pxPerCm() {
    const a = screenX(controls.target), b = screenX(v.copy(controls.target).setX(controls.target.x + 1));
    return Math.abs(b - a) || 1;
  }

  /* ---------------------------------------------------------------- moves */
  const rigView = (x) => ({ t: new THREE.Vector3(x, rig.t.y, rig.t.z), p: new THREE.Vector3(x, rig.t.y, rig.t.z).add(offset) });
  const prune = () => { moves = moves.filter((t) => clock - t < windowSec); };
  const canPan = () => { prune(); return moves.length < maxMoves && clock - lastPan >= minGap; };
  function record(isPan) { moves.push(clock); if (isPan) lastPan = clock; }
  const panDur = (dx) => clamp(1.1 + Math.abs(dx) / 28, 1.3, 2.6);

  function pan(x, force = false, why = 'view', detail) {
    if (mode === 'rig' && !force) { // a small nudge is just motion: skip it
      const r = safeRect();
      if (Math.abs(x - rigX) * pxPerCm() < (r.x1 - r.x0) * minShift) { pending = null; return null; }
    }
    if (!force && mode === 'rig' && !canPan()) return null;
    pending = null;
    const zoomOut = mode !== 'rig';
    const dur = zoomOut ? 1.8 : panDur(x - rigX);
    mode = 'rig'; rigX = x;
    record(!zoomOut);
    closeUp = null;
    log(zoomOut ? 'zoom-out' : 'pan', x, why, detail);
    return { view: rigView(x), dur };
  }

  function wellInside(p) {
    const r = safeRect(), x = screenX(p), pad = (r.x1 - r.x0) * inner;
    return x >= r.x0 + pad && x <= r.x1 - pad;
  }

  /* Every stage.focus() in Watch mode comes through here. */
  stage.setFocusFilter((view, name, dur) => {
    if (!watching()) { mode = null; return { view, dur }; }
    if (isInstant()) return null; // replaying: the step's own focus after the jump decides
    camera.updateMatrixWorld();
    if (isSpecial(name)) {
      if (mode === 'special' && closeUp === name) return null; // already there
      pending = null; mode = 'special'; closeUp = name; record(false); log('zoom-in', view.t.x, name);
      return { view, dur: Math.max(dur, 1.6) };
    }
    if (mode === 'special' && keepClose.includes(name)) return null;
    // a normal view: only its subject (the view's target) matters, framed by panning the rig.
    // Already well inside the free width? Stay put. (A close-up always zooms back out.)
    if (mode === 'rig' && wellInside(view.t)) { pending = null; return null; }
    const m = pan(view.t.x, mode !== 'rig');
    if (!m && mode === 'rig' && !wellInside(view.t)) pending = view.t.clone(); // over budget: try again later
    if (m && dur === 0) m.dur = 0; // a cut stays a cut
    return m;
  });

  /* --------------------------------------------- keep the action on screen */
  const centreOf = (o, out) => o.group.getWorldPosition(out);
  function begin(a) {
    id = a.id; involved.clear(); moved.clear(); peak.clear(); involved.add(a.key);
    start = new Map();
    for (const [k, o] of Object.entries(ix.objects)) start.set(k, centreOf(o, new THREE.Vector3()));
  }
  function actionBox() {
    const returning = new Set();
    for (const [k, o] of Object.entries(ix.objects)) {
      const p0 = start.get(k);
      if (!p0) continue;
      const d = centreOf(o, v).distanceTo(p0);
      if (!moved.has(k) && d > 0.3) { moved.add(k); involved.add(k); }
      // a tool on its way back to where it started is done: following it home is just motion
      const pk = Math.max(peak.get(k) || 0, d);
      peak.set(k, pk);
      if (moved.has(k) && pk > 3 && d < pk * 0.85) returning.add(k);
    }
    // a vessel a moving tool is clearly above (the beaker being poured into) is part of the action
    const boxOf = (k) => { const bb = new THREE.Box3(); ix.objects[k].groups.forEach((g) => { if (g.visible) bb.union(tmp.setFromObject(g)); }); return bb; };
    // (the tool's centre must be over the vessel: a box just clipping a neighbour's corner doesn't count)
    const movers = [...moved].filter((k) => ix.objects[k] && !returning.has(k)).map((k) => { const bb = boxOf(k); return { bb, c: bb.getCenter(new THREE.Vector3()) }; });
    for (const k of Object.keys(ix.objects)) {
      if (involved.has(k)) continue;
      const bb = boxOf(k);
      if (bb.isEmpty()) continue;
      if (movers.some(({ bb: m, c }) => c.x > bb.min.x && c.x < bb.max.x && c.z > bb.min.z && c.z < bb.max.z && m.min.y > bb.min.y + 0.5)) involved.add(k);
    }
    box.makeEmpty();
    involved.forEach((k) => {
      const o = ix.objects[k]; if (!o || returning.has(k)) return;
      o.groups.forEach((g) => { if (g.visible) { tmp.setFromObject(g); if (!tmp.isEmpty()) box.union(tmp); } });
    });
    return box;
  }

  function update(dt) {
    if (!watching()) { pending = null; return; }
    clock += dt;
    if (stage.isFocusing) return;
    camera.updateMatrixWorld(); // screen tests need this frame's camera
    // a pan that waited for budget goes now, if its subject is still off-centre
    if (pending && canPan()) {
      const p = pending; pending = null;
      if (mode === 'rig' && !wellInside(p)) { const r = pan(p.x, false, 'waited'); if (r) stage.glide(r.view, r.dur); }
    }
    const a = acting();
    if (!a) { id = null; return; }
    if (a.id !== id) begin(a);
    if (suspended === id || mode !== 'rig') return; // close-ups play as authored
    const b = actionBox();
    if (b.isEmpty()) return;
    const r = safeRect(), W = r.x1 - r.x0;
    if (!(W > 0)) return;
    const s = spanX(b);
    if (!s) return;
    const tol = W * slack;
    const overL = r.x0 - s[0], overR = s[1] - r.x1;
    if (overL <= tol && overR <= tol) return; // (poking out above or below can't be fixed by a pan)
    const lost = s[1] < r.x0 || s[0] > r.x1; // completely off screen: move even over budget
    // wider than the free area: a pan can't frame it, so don't chase it (unless it's lost)
    if (!lost && s[1] - s[0] > W) return;
    // shift just enough to bring it well inside (centred if it only just fits)
    const comfort = W * 0.12;
    let shiftPx;
    if (lost || s[1] - s[0] > W - 2 * comfort) shiftPx = (s[0] + s[1]) / 2 - (r.x0 + r.x1) / 2;
    else shiftPx = overR > tol ? overR + comfort : -(overL + comfort);
    const m = pan(rigX + shiftPx / pxPerCm(), lost, lost ? 'lost action' : 'action',
      { key: a.key, involved: [...involved].join(','), span: s.map(Math.round), free: [Math.round(r.x0), Math.round(r.x1)] });
    if (m) stage.glide(m.view, m.dur);
  }

  return {
    update,
    hold() { suspended = id; },
    /** For tuning: the moves in the last window, and the current mode. */
    get stats() { prune(); return { mode, rigX, moves: moves.length, pending: !!pending, history }; },
  };
}
