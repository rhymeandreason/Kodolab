/* Halo: a band that follows an object's silhouette on screen, a few pixels clear of it.
 * interact.js draws it round a held or hanging target (ringPlane: 'vertical'), where a ring on
 * the bench would mark the wrong thing.
 *
 *   const halo = createHalo(stage);
 *   halo.draw([group, ...], color, opacity);   // each frame; [] draws nothing
 *
 * The groups are drawn alone, white, into a half-resolution mask; a full-screen pass then
 * finds each pixel's distance to the mask and paints the band. Drawn over the finished bench
 * with no depth test, so it reads through whatever stands in front, as a selection outline does.
 */
import * as THREE from 'three';

const LAYER = 7;
const VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FRAG = `
  uniform sampler2D tMask; uniform vec2 res; uniform float px, gap, band, opacity; uniform vec3 color;
  varying vec2 vUv;
  void main() {
    float reach = gap + band, d = reach + 1.0;
    if (texture2D(tMask, vUv).r > 0.5) d = 0.0;
    else for (int i = 0; i < 24; i++) {
      float a = float(i) * 0.2618;
      vec2 dir = vec2(cos(a), sin(a)) * px / res;
      for (int j = 1; j <= 10; j++) {
        float r = reach * float(j) / 10.0;
        if (r >= d) break;
        if (texture2D(tMask, vUv + dir * r).r > 0.5) { d = r; break; }
      }
    }
    float a = smoothstep(gap - 0.8, gap + 0.4, d) * (1.0 - smoothstep(reach - 0.6, reach + 0.6, d));
    if (a <= 0.0) discard;
    gl_FragColor = vec4(color, a * opacity);
  }`;

export function createHalo(stage) {
  const { renderer, scene } = stage;
  const rt = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true });
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthTest: false, depthWrite: false,
    uniforms: {
      tMask: { value: rt.texture }, res: { value: new THREE.Vector2() }, px: { value: 1 },
      gap: { value: 4 }, band: { value: 4 }, opacity: { value: 1 }, color: { value: new THREE.Color() },
    },
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene(); quadScene.add(quad);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const size = new THREE.Vector2(), clear = new THREE.Color();
  let groups = [];

  stage.sketch.overlays.push((camera) => {
    if (!groups.length) return;
    renderer.getDrawingBufferSize(size);
    const w = Math.max(1, Math.round(size.x / 2)), h = Math.max(1, Math.round(size.y / 2));
    if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
    const tagged = [];
    groups.forEach((g) => g.traverseVisible((m) => {
      if (m.isMesh && !m.userData.hitProxy) { m.layers.enable(LAYER); tagged.push(m); }
    }));
    const layers = camera.layers.mask, bg = scene.background, over = scene.overrideMaterial;
    const autoShadow = renderer.shadowMap.autoUpdate, autoClear = renderer.autoClear;
    const prevClear = renderer.getClearColor(clear).getHex(), prevAlpha = renderer.getClearAlpha();
    camera.layers.set(LAYER); scene.background = null; scene.overrideMaterial = white; renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(true, true, false);
    renderer.render(scene, camera);
    camera.layers.mask = layers; scene.background = bg; scene.overrideMaterial = over; renderer.shadowMap.autoUpdate = autoShadow;
    tagged.forEach((m) => m.layers.disable(LAYER));
    renderer.setClearColor(prevClear, prevAlpha);
    mat.uniforms.res.value.set(w, h);
    mat.uniforms.px.value = renderer.getPixelRatio() / 2;   // the shader's gap and band are CSS px
    renderer.autoClear = false;
    renderer.setRenderTarget(null);
    renderer.render(quadScene, quadCam);
    renderer.autoClear = autoClear;
  });

  return {
    draw(list, color, opacity = 1) {
      groups = list;
      if (color) mat.uniforms.color.value.copy(color);
      mat.uniforms.opacity.value = opacity;
    },
  };
}
