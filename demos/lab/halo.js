/* Halo: a band that follows an object's silhouette on screen, a few pixels clear of it.
 * interact.js draws it round a held or hanging target (ringPlane: 'vertical'), where a ring on
 * the bench would mark the wrong thing.
 *
 *   const halo = createHalo(stage);
 *   halo.draw([group, ...], color, opacity);   // each frame; [] draws nothing
 *
 * The groups are drawn alone, white, into a mask at CSS resolution. Two passes turn it into an
 * exact distance field (nearest mask pixel along the row, then the true distance down the
 * column), and the last pass reads that field with linear filtering, so the band's edges are
 * smooth curves rather than steps. Every pass is scissored to the objects' screen box, so the
 * cost follows the object's size on screen, not the canvas's.
 * Drawn over the finished bench with no depth test: it reads through whatever stands in front,
 * as a selection outline does.
 */
import * as THREE from 'three';

const LAYER = 7;
const GAP = 4, BAND = 4;          // CSS px
const R = GAP + BAND + 3;         // how far the field looks, in mask px
const VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const ROW = `
  uniform sampler2D tIn; uniform vec2 texel; varying vec2 vUv;
  void main() {
    float best = 255.0;
    for (int i = -${R}; i <= ${R}; i++)
      if (texture2D(tIn, vUv + vec2(float(i), 0.0) * texel).r > 0.5) best = min(best, abs(float(i)));
    gl_FragColor = vec4(best / 255.0, 0.0, 0.0, 1.0);
  }`;
const COL = `
  uniform sampler2D tIn; uniform vec2 texel; varying vec2 vUv;
  void main() {
    float d = ${R + 1}.0;
    for (int j = -${R}; j <= ${R}; j++) {
      float dx = texture2D(tIn, vUv + vec2(0.0, float(j)) * texel).r * 255.0;
      if (dx < 254.0) d = min(d, length(vec2(dx, float(j))));
    }
    gl_FragColor = vec4(d / ${R + 1}.0, 0.0, 0.0, 1.0);
  }`;
const BANDFRAG = `
  uniform sampler2D tIn; uniform float opacity; uniform vec3 color; varying vec2 vUv;
  void main() {
    float d = texture2D(tIn, vUv).r * ${R + 1}.0;
    float a = smoothstep(${GAP - 0.7}, ${GAP + 0.5}, d) * (1.0 - smoothstep(${GAP + BAND - 0.6}, ${GAP + BAND + 0.6}, d));
    if (a <= 0.0) discard;
    gl_FragColor = vec4(color, a * opacity);
  }`;

export function createHalo(stage) {
  const { renderer, scene } = stage;
  const near = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
  const rtMask = new THREE.WebGLRenderTarget(1, 1, { ...near, depthBuffer: true });
  const rtRow = new THREE.WebGLRenderTarget(1, 1, { ...near, depthBuffer: false });
  const rtDist = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });   // linear: the smoothing
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const texel = new THREE.Vector2();
  const pass = (frag, input, extra = {}) => new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: frag, depthTest: false, depthWrite: false,
    uniforms: { tIn: { value: input.texture }, texel: { value: texel }, ...extra },
  });
  const row = pass(ROW, rtMask), col = pass(COL, rtRow);
  const band = pass(BANDFRAG, rtDist, { opacity: { value: 1 }, color: { value: new THREE.Color() } });
  band.transparent = true;
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), row);
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene(); quadScene.add(quad);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const draw = (m, rt) => { quad.material = m; renderer.setRenderTarget(rt); renderer.render(quadScene, quadCam); };
  const size = new THREE.Vector2(), clear = new THREE.Color(), box = new THREE.Box3(), v = new THREE.Vector3();
  const prevScissor = new THREE.Vector4();
  let groups = [];

  // the groups' screen rectangle in CSS px from the bottom left, grown by m px; null if off screen
  function screenRect(camera, w, h, m) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    groups.forEach((g) => {
      box.setFromObject(g);
      if (box.isEmpty()) return;
      for (let i = 0; i < 8; i++) {
        v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(camera);
        x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
      }
    });
    if (x0 > x1) return null;
    const l = Math.max(0, Math.floor((x0 + 1) / 2 * w) - m), b = Math.max(0, Math.floor((y0 + 1) / 2 * h) - m);
    const r = Math.min(w, Math.ceil((x1 + 1) / 2 * w) + m), t = Math.min(h, Math.ceil((y1 + 1) / 2 * h) + m);
    return r > l && t > b ? [l, b, r - l, t - b] : null;
  }

  stage.sketch.overlays.push((camera) => {
    if (!groups.length) return;
    renderer.getSize(size);
    const w = Math.max(1, Math.round(size.x)), h = Math.max(1, Math.round(size.y));
    // the band lands within R of the object; the field passes read R further on each axis
    const rect = screenRect(camera, w, h, 2 * R + 2), inner = screenRect(camera, w, h, R + 1);
    if (!rect) return;
    if (rtMask.width !== w || rtMask.height !== h) [rtMask, rtRow, rtDist].forEach((rt) => rt.setSize(w, h));
    texel.set(1 / w, 1 / h);

    const tagged = [];
    groups.forEach((g) => g.traverseVisible((m) => {
      if (m.isMesh && !m.userData.hitProxy) { m.layers.enable(LAYER); tagged.push(m); }
    }));
    const layers = camera.layers.mask, bg = scene.background, over = scene.overrideMaterial;
    const autoShadow = renderer.shadowMap.autoUpdate, autoClear = renderer.autoClear;
    const prevClear = renderer.getClearColor(clear).getHex(), prevAlpha = renderer.getClearAlpha();
    const scissorOn = renderer.getScissorTest(); renderer.getScissor(prevScissor);

    // a render target scissors by its own .scissor; the renderer's (×pixelRatio) is the canvas's
    rtMask.scissorTest = false;
    camera.layers.set(LAYER); scene.background = null; scene.overrideMaterial = white; renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(rtMask); renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);   // all of it: the row pass reads past the box
    [rtMask, rtRow, rtDist].forEach((rt) => { rt.scissor.set(...rect); rt.scissorTest = true; });
    renderer.setRenderTarget(rtMask);
    renderer.render(scene, camera);
    camera.layers.mask = layers; scene.background = bg; scene.overrideMaterial = over; renderer.shadowMap.autoUpdate = autoShadow;
    tagged.forEach((m) => m.layers.disable(LAYER));

    renderer.autoClear = false;
    draw(row, rtRow);
    draw(col, rtDist);
    renderer.setScissor(...inner); renderer.setScissorTest(true);
    draw(band, null);
    renderer.setScissor(prevScissor); renderer.setScissorTest(scissorOn);

    renderer.autoClear = autoClear;
    renderer.setClearColor(prevClear, prevAlpha);
  });

  return {
    draw(list, color, opacity = 1) {
      groups = list;
      if (color) band.uniforms.color.value.copy(color);
      band.uniforms.opacity.value = opacity;
    },
  };
}
