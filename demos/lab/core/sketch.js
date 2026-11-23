/* Sketch outline: hand-drawn ink lines over the rendered scene, for legibility.
 *
 *   const sketch = createSketch(stage);
 *   stage.setRender(sketch.render);
 *   sketch.set({ width: 1.6, wobble: 1.2 });   sketch.enabled = false;
 *
 * Screen-space, so every prop gets it with no per-prop work. The scene is drawn again into
 * normal + depth targets and lines go where either jumps: silhouettes (depth) and creases
 * (normal). Two passes, because glass writes no depth and would hide the liquid level:
 *   A  everything, glass included    → the glass's own silhouette
 *   B  everything but shells         → what is inside or behind them
 * A shell is a material with userData.shell (materials.js marks glass, plastic, frosted, ldpe).
 * A liquid (userData.liquid) is written with alpha 0.5, and any edge it touches is drawn wider
 * and in its own ink: the level is what a student reads off a container.
 *
 * Left out: lines, points, sprites, anything with depthTest off (markers), additive or
 * transparent shader effects (light cones), printed labels (wrapLabel), and anything with userData.noSketch.
 * Clipping planes are copied each frame, so a clipped liquid outlines at its level.
 *
 * Stroke width and wobble shrink with distance past `ref` cm, down to `minScale`.
 * The wobble is a fixed noise field in screen space, not animated: lines that boil read as
 * motion, and a lab's camera already moves.
 */
import * as THREE from 'three';

const VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FRAG = `
  uniform sampler2D tN0, tD0, tN1, tD1;
  uniform vec2 res; uniform float px, wob, near, far, opacity, grain, lw, ref, minK; uniform vec3 ink, lInk;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float lin(float d) { float z = d * 2.0 - 1.0; return 2.0 * near * far / (far + near - z * (far - near)); }
  float isObj(float a) { return step(0.01, a); }
  float isLiq(float a) { return step(0.01, a) * step(a, 0.75); }
  // a neighbour against the centre. x: any edge, y: an edge that touches a liquid
  vec2 cmp(vec4 n, float d, vec4 m, float dm) {
    float s = abs(isObj(m.a) - isObj(n.a));                                          // object against background
    s = max(s, smoothstep(0.025, 0.07, abs(dm - d) / min(d, dm)));                  // silhouette
    s = max(s, isObj(n.a) * isObj(m.a) * smoothstep(0.35, 0.7, length(m.rgb - n.rgb))); // crease
    s = max(s, abs(isLiq(m.a) - isLiq(n.a)));                                        // liquid against anything
    return vec2(s, s * max(isLiq(m.a), isLiq(n.a)));
  }
  // one pass, all three strokes. x: main, y: liquid, z: the fainter second stroke at uv2
  vec3 strokes(sampler2D tN, sampler2D tD, vec2 uv, vec2 uv2, float w) {
    vec4 n = texture2D(tN, uv); float d = lin(texture2D(tD, uv).x);
    vec2 e = vec2(0.0), sum = vec2(0.0);
    for (int k = 0; k < 8; k++) {
      float a = float(k) * 0.7853982;
      vec2 o = vec2(cos(a), sin(a)) * w / res;
      vec2 c = cmp(n, d, texture2D(tN, uv + o), lin(texture2D(tD, uv + o).x));
      e = max(e, c); sum += c;
    }
    // the mean falls off across the stroke where the max is flat: a soft edge instead of a stair
    e = min(e, sum * 0.5);
    // the liquid's wider ring needs only the liquid flag, so normals alone, four of them
    for (int k = 0; k < 4; k++) {
      float a = float(k) * 1.5707963;
      e.y = max(e.y, abs(isLiq(texture2D(tN, uv + vec2(cos(a), sin(a)) * w * lw / res).a) - isLiq(n.a)));
    }
    vec4 n2 = texture2D(tN, uv2); float d2 = lin(texture2D(tD, uv2).x);
    float e2 = 0.0;
    for (int k = 0; k < 4; k++) {
      float a = float(k) * 1.5707963 + 0.7853982;
      vec2 o = vec2(cos(a), sin(a)) * w * 0.6 / res;
      e2 = max(e2, cmp(n2, d2, texture2D(tN, uv2 + o), lin(texture2D(tD, uv2 + o).x)).x);
    }
    return vec3(e, e2);
  }
  void main() {
    vec2 p = vUv * res;
    // thinner and steadier with distance: a stroke sized for a close-up swamps a whole bench.
    // The nearest depth under a small cross, so both sides of a silhouette agree.
    float d = lin(texture2D(tD0, vUv).x);
    for (int k = 0; k < 5; k++) {
      vec2 o = k == 0 ? vec2(0.0) : vec2(cos(float(k) * 1.5708), sin(float(k) * 1.5708)) * px / res;
      d = min(d, lin(texture2D(tD1, vUv + o).x));
    }
    float kd = clamp(ref / d, minK, 1.0);
    float w = px * kd, wb = wob * kd * kd;
    vec2 j1 = (vec2(noise(p * 0.018), noise(p * 0.018 + 19.0)) - 0.5) * 2.0 * wb;
    vec2 j2 = (vec2(noise(p * 0.031 + 41.0), noise(p * 0.031 + 73.0)) - 0.5) * 3.2 * wb;
    vec3 a = strokes(tN0, tD0, (p + j1) / res, (p + j2) / res, w);
    vec3 b = strokes(tN1, tD1, (p + j1) / res, (p + j2) / res, w);
    vec3 s = max(a, b);
    float g = 1.0 - grain + grain * noise(p * vec2(0.35, 0.9));               // pencil grain
    float e = max(s.x, s.z * 0.45);
    gl_FragColor = vec4(mix(ink, lInk, step(e, s.y)), clamp(max(e, s.y) * g * opacity, 0.0, 1.0));
  }`;
const COPY = `uniform sampler2D tInk; varying vec2 vUv; void main() { gl_FragColor = texture2D(tInk, vUv); }`;

function target() {
  // nearest: a filtered sample between an object (alpha 1) and the background (0) would read as liquid (0.5)
  const rt = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  rt.depthTexture = new THREE.DepthTexture(1, 1);
  return rt;
}

export function createSketch(stage, params = {}) {
  const { renderer, scene, camera } = stage;
  const P = Object.assign({ color: '#2b3540', width: 1.3, wobble: 0.8, opacity: 0.8, grain: 0.35, liquidColor: '#1f5f8f', liquidWidth: 1.8, ref: 45, minScale: 0.4, resolution: 2 }, params);
  const rtA = target(), rtB = target();
  const rtInk = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });   // linear: upscaled onto the canvas
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, blending: THREE.NoBlending, depthTest: false, depthWrite: false,
    uniforms: {
      tN0: { value: rtA.texture }, tD0: { value: rtA.depthTexture }, tN1: { value: rtB.texture }, tD1: { value: rtB.depthTexture },
      res: { value: new THREE.Vector2() }, px: { value: 1 }, wob: { value: 1 }, near: { value: 1 }, far: { value: 1 },
      opacity: { value: 1 }, grain: { value: 0 }, lw: { value: 1 }, ref: { value: 1 }, minK: { value: 1 }, ink: { value: new THREE.Color() }, lInk: { value: new THREE.Color() },
    },
  });
  const copy = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: COPY, transparent: true, depthTest: false, depthWrite: false,
    uniforms: { tInk: { value: rtInk.texture } },
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene(); quadScene.add(quad);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const drawQuad = (m, rt) => { quad.material = m; renderer.setRenderTarget(rt); renderer.render(quadScene, quadCam); };

  const normals = new WeakMap();
  const normalOf = (m) => {
    let n = normals.get(m);
    if (!n) {
      n = new THREE.MeshNormalMaterial(); n.toneMapped = false;
      // a liquid writes alpha 0.5: transparent so three leaves alpha alone, NoBlending so it lands as written
      if (m.userData.liquid) Object.assign(n, { opacity: 0.5, transparent: true, blending: THREE.NoBlending });
      normals.set(m, n);
    }
    n.side = m.side; n.clippingPlanes = m.clippingPlanes; n.clipIntersection = m.clipIntersection;
    return n;
  };
  const skip = (o, m) => o.userData.noSketch || m.userData.noSketch || m.depthTest === false || m.visible === false
    || (m.transparent && m.opacity < 0.03) || m.blending === THREE.AdditiveBlending || (m.isShaderMaterial && m.transparent);
  const isShell = (m) => m.userData.shell;

  // swap every visible mesh to its normal material; returns the undo list
  function swap(shells) {
    const undo = [];
    scene.traverseVisible((o) => {
      if (o.isLine || o.isPoints || o.isSprite) { undo.push([o, 'visible', true]); return; }
      if (!o.isMesh) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      if (ms.some((m) => skip(o, m) || (!shells && isShell(m)))) { undo.push([o, 'visible', true]); return; }
      undo.push([o, 'material', o.material]);
      o.material = Array.isArray(o.material) ? ms.map(normalOf) : normalOf(o.material);
    });
    undo.forEach(([o, k]) => { if (k === 'visible') o.visible = false; });
    return undo;
  }
  const restore = (undo) => undo.forEach(([o, k, v]) => { o[k] = v; });

  const size = new THREE.Vector2(), clear = new THREE.Color();
  function pass(rt, shells) {
    const undo = swap(shells);
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    renderer.render(scene, camera);
    restore(undo);
  }

  const sketch = {
    enabled: true,
    params: P,
    set(o) { Object.assign(P, o); },
    render() {
      renderer.render(scene, camera);
      if (!sketch.enabled) return;
      // the passes and the ink run at `resolution` × CSS pixels, capped at the canvas's own.
      // 1 on Retina is a quarter of the work, stretched onto the canvas, and reads as pixelated
      renderer.getSize(size);
      const k = Math.min(P.resolution, renderer.getPixelRatio());
      size.set(Math.max(1, Math.round(size.x * k)), Math.max(1, Math.round(size.y * k)));
      if (rtA.width !== size.x || rtA.height !== size.y) [rtA, rtB, rtInk].forEach((rt) => rt.setSize(size.x, size.y));
      const prevClear = renderer.getClearColor(clear).getHex(), prevAlpha = renderer.getClearAlpha();
      const autoShadow = renderer.shadowMap.autoUpdate, autoClear = renderer.autoClear;
      renderer.shadowMap.autoUpdate = false;
      pass(rtA, true);
      pass(rtB, false);
      renderer.shadowMap.autoUpdate = autoShadow;

      const u = mat.uniforms;
      u.res.value.copy(size); u.px.value = P.width * k; u.wob.value = P.wobble * k;
      u.near.value = camera.near; u.far.value = camera.far;
      u.opacity.value = P.opacity; u.grain.value = P.grain; u.ink.value.set(P.color);
      u.lw.value = P.liquidWidth; u.ref.value = P.ref; u.minK.value = P.minScale; u.lInk.value.set(P.liquidColor);
      drawQuad(mat, rtInk);
      renderer.setClearColor(prevClear, prevAlpha);
      renderer.autoClear = false;
      drawQuad(copy, null);
      renderer.autoClear = autoClear;
    },
    dispose() { [rtA, rtB, rtInk, mat, copy, quad.geometry].forEach((x) => x.dispose()); },
  };
  return sketch;
}
