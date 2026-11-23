/* The stage: renderer, scene, camera, orbit controls, studio lighting and the
 * frame loop. Units are centimetres with the bench top at y = 0.
 *
 *   const stage = createStage({ canvas, views: { overview: { t: V3(...), p: V3(...) } } });
 *   stage.onFrame((dt, now) => { ... });
 *   stage.start();
 *   stage.setRender(() => { ... });   // optional: draw something other than scene + camera
 *
 * Three reflection maps:
 *   stage.env           soft studio room, used by every material (scene.environment)
 *   stage.glassEnv      darker room with tall strip lights, used only by narrow
 *                       glass so tubes get crisp vertical highlights (from Ecoli)
 *   stage.wideGlassEnv  soft room without strips, for wide glass (beakers, cups,
 *                       dishes), where strips would read as stripes
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { V3, clamp } from './math.js';
import { anim, tickTweens } from './tween.js';

export function studioEnv(renderer) {
  const pm = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(120, 60, 120), new THREE.MeshBasicMaterial({ color: 0x5d6873, side: THREE.BackSide }));
  room.position.y = 20;
  env.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshBasicMaterial({ color: 0x454e58 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -9.9;
  env.add(floor);
  const panel = (w, h, pos, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide }));
    m.position.copy(pos); m.lookAt(0, 5, 0); env.add(m);
  };
  panel(50, 14, V3(0, 49, 0), 2.2);
  panel(30, 30, V3(-59, 22, 10), 1.3);
  panel(30, 24, V3(59, 22, -10), 0.9);
  panel(60, 10, V3(0, 25, 59), 1.0);
  const tex = pm.fromScene(env, 0.035).texture;
  pm.dispose();
  return tex;
}

/* Glass-only environment: tall thin softbox strips become the crisp vertical
 * streaks you see on real tubes. A darker surround makes edges read grey, like
 * the refracted room. Kept out of scene.environment so it doesn't brighten
 * every other material. */
function glassEnv(renderer) {
  const pm = new THREE.PMREMGenerator(renderer);
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.BoxGeometry(30, 30, 30), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.07, 0.07, 0.08), side: THREE.BackSide })));
  const lm = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.6, 1.6), side: THREE.DoubleSide });
  const a = new THREE.Mesh(new THREE.PlaneGeometry(12, 4), lm); a.position.set(0, 14, 0); a.rotation.x = Math.PI / 2; s.add(a);
  const b = new THREE.Mesh(new THREE.PlaneGeometry(4, 8), lm); b.position.set(-14, 4, 4); b.rotation.y = Math.PI / 2; s.add(b);
  const c = new THREE.Mesh(new THREE.PlaneGeometry(4, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 0.8, 0.8), side: THREE.DoubleSide }));
  c.position.set(14, 4, -4); c.rotation.y = -Math.PI / 2; s.add(c);
  const sm = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 5, 5), side: THREE.DoubleSide });
  [[-7, 13], [8, 12], [-13, -6], [12, -8]].forEach(([x, z]) => {
    const st = new THREE.Mesh(new THREE.PlaneGeometry(1, 28), sm); st.position.set(x, 0, z); st.lookAt(0, 0, 0); s.add(st);
  });
  const tex = pm.fromScene(s, 0.015).texture;
  pm.dispose();
  return tex;
}

/* Environment for wide glass (beakers, cups, dishes): no thin strips. A wide
 * vessel shows each light twice (front and back wall) and stretched across its
 * width, so thin strips turn into a row of stripes. One broad soft window and a
 * soft overhead panel give a single smooth highlight instead. */
function wideGlassEnv(renderer) {
  const pm = new THREE.PMREMGenerator(renderer);
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.BoxGeometry(30, 30, 30), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.12, 0.13, 0.14), side: THREE.BackSide })));
  const panel = (w, h, pos, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide }));
    m.position.copy(pos); m.lookAt(0, 0, 0); s.add(m);
  };
  panel(16, 16, V3(0, 14, 0), 1.3);       // overhead
  panel(9, 12, V3(-10, 3, 10), 1.8);      // window, front-left
  const tex = pm.fromScene(s, 0.04).texture;
  pm.dispose();
  return tex;
}

export function createStage({
  canvas,
  exposure = 0.88,
  fov = 36,
  near = 0.5,
  far = 900,
  controls: ctl = {},
  shadow = { left: -85, right: 85, top: 55, bottom: -55 },
  views = {},
  fitAspect = 1.85,          // views are framed for this aspect; narrower screens pull the camera back
  insets = () => ({ left: 0, right: 0, top: 0, bottom: 0 }), // px of screen covered by UI on each side
}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.shadowMap.enabled = true;
  // PCF, not PCFSoft: only PCF reads shadow.radius in r128, and the radius is what softens the edge
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.localClippingEnabled = true;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, near, far);
  camera.position.set(4, 74, 104);

  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, {
    enableDamping: true, dampingFactor: 0.08, minDistance: 10, maxDistance: 200,
    maxPolarAngle: Math.PI * 0.48, screenSpacePanning: true,
  }, ctl);

  const env = studioEnv(renderer);
  scene.environment = env;
  const gEnv = glassEnv(renderer);
  const wgEnv = wideGlassEnv(renderer);

  // lights. A strong sky and a moderate sun, so a shadow grounds an object without
  // reading as a hole in the bench: shadowed floor is ~0.9 of lit floor.
  const hemi = new THREE.HemisphereLight(0xffffff, 0xc4ccd4, 0.62);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfffaf2, 0.78);
  sun.position.set(-35, 90, 50);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { near: 20, far: 220 }, shadow);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xeaf2ff, 0.3);
  fill.position.set(60, 40, 80);
  scene.add(fill);

  // camera views
  let lastView = Object.values(views)[0] || { t: V3(), p: V3(0, 60, 90) };
  let focusToken = 0;
  let focusing = 0;
  const aspectScale = () => clamp(fitAspect / camera.aspect, 1, 2.6);
  let focusFilter = null; // setFocusFilter(): Watch mode's camera director rewrites or drops requests
  function focus(v, dur = 1.2) {
    let view = typeof v === 'string' ? views[v] : v;
    if (!view) return Promise.resolve();
    if (focusFilter) {
      const r = focusFilter(view, typeof v === 'string' ? v : null, dur);
      if (!r) return Promise.resolve();
      ({ view, dur } = r);
    }
    return glide(view, dur);
  }
  /** Move the camera to a view, skipping the focus filter. */
  function glide(view, dur = 1.2) {
    lastView = view;
    const token = ++focusToken;
    const t0 = controls.target.clone(), p0 = camera.position.clone();
    const p1 = view.t.clone().add(view.p.clone().sub(view.t).multiplyScalar(aspectScale()));
    focusing = performance.now() + dur * 1000 + 100; // deadline, in case the tween is cleared
    return anim(dur, (e, k) => {
      if (token !== focusToken) return;
      controls.target.lerpVectors(t0, view.t, e);
      camera.position.lerpVectors(p0, p1, e);
      if (k >= 1) focusing = 0;
    });
  }

  // resize: keep the subject centred in the part of the screen not covered by panels
  const resizeHooks = [];
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    if (!w || !h) return; // a hidden or zero-size window: keep the last size (a NaN aspect would poison the camera)
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const i = insets(w, h);
    camera.setViewOffset(w, h, ((i.right || 0) - (i.left || 0)) / 2, ((i.bottom || 0) - (i.top || 0)) / 2, w, h);
    camera.updateProjectionMatrix();
    resizeHooks.forEach((f) => f(w, h));
  }
  window.addEventListener('resize', resize);

  // frame loop
  const frameHooks = [];
  let prev = performance.now();
  let first = true;
  const firstHooks = [];
  let renderFn = null; // setRender(): a sim that draws more than the bench (zoom levels, insets)
  function loop(now) {
    requestAnimationFrame(loop);
    frame(now);
  }
  function frame(now) {
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    tickTweens(now);
    frameHooks.forEach((f) => f(dt, now));
    controls.update();
    if (renderFn) renderFn(); else renderer.render(scene, camera);
    if (first) { first = false; firstHooks.forEach((f) => f()); }
  }

  return {
    renderer, scene, camera, controls, canvas,
    env, glassEnv: gEnv, wideGlassEnv: wgEnv,
    lights: { hemi, sun, fill },
    views, focus, glide,
    /** f(view, name, dur) → { view, dur } to move (possibly rewritten), or null to stay put. */
    setFocusFilter: (f) => { focusFilter = f; },
    get lastView() { return lastView; },
    get isFocusing() { return performance.now() < focusing; },
    insets: () => insets(window.innerWidth, window.innerHeight),
    resize,
    onResize: (f) => resizeHooks.push(f),
    onFrame: (f) => frameHooks.push(f),
    onFirstFrame: (f) => firstHooks.push(f),
    /** Replace the frame's render call, e.g. to draw another scene or overlays. null = default. */
    setRender: (f) => { renderFn = f; },
    start() { resize(); requestAnimationFrame(loop); },
    /** Run one frame by hand at time `now` (ms), e.g. to test a page whose tab is in the background. */
    frame,
  };
}
