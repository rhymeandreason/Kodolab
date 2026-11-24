/* The magnifier: a hand lens over one well, drawn live from the bench. A second camera looks
 * down at whatever it is pointed at; the frame renders that into a target and paints it as a
 * disc over the page's .mag ring, so the circle shows the same moment as the bench (clumps form
 * in it while a stick stirs). Its focus is UI state, not bench state: a rebuild leaves it.
 *
 *   const mag = createMagnifier(stage, { el: document.querySelector('.mag') });
 *   mag.focus(worldPos, label)       // glide there; label goes on the ring's tag
 *   mag.show(on) · mag.update(dt)
 *   stage.setRender(() => { stage.sketch.render(); mag.render(); });
 *
 * Same tone mapping and colour space as the stage (zoom.js's inset disc), so a well reads the
 * same red in the circle as on the bench. */
import * as THREE from 'three';
import { V3, LEGACY } from '../lab.js';

const OFFSET = V3(0, 10, 5.5);      // cm from the well: ~6.5 cm of bench across the circle
const BG = new THREE.Color(0xe9edf2);

export function createMagnifier(stage, { el }) {
  const { renderer, scene } = stage;
  const cam = new THREE.PerspectiveCamera(30, 1, 0.5, 200);
  const rt = LEGACY ? new THREE.WebGLRenderTarget(512, 512) : new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType, samples: 4 });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.5, 72), new THREE.ShaderMaterial({
    uniforms: { map: { value: rt.texture } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D map; varying vec2 vUv;
      void main(){
        gl_FragColor = vec4(texture2D(map, vUv).rgb, 1.0);
        ${LEGACY ? '' : '#include <tonemapping_fragment>\n#include <colorspace_fragment>'}
      }`,
    depthTest: false, depthWrite: false,
  }));
  const hud = new THREE.Scene(); hud.add(disc);
  const hudCam = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10);
  const tag = el.querySelector('.mag-name');

  const target = V3(), eased = V3();
  let shown = false, snapped = false;

  const api = {
    get shown() { return shown; },
    show(on) { shown = !!on; el.hidden = !shown; },
    focus(pos, label) {
      target.copy(pos);
      if (!snapped) { eased.copy(pos); snapped = true; }
      if (label != null && tag) tag.innerHTML = label;
    },
    update(dt) {
      eased.lerp(target, 1 - Math.exp(-Math.max(0, dt) * 7));
      cam.position.copy(eased).add(OFFSET);
      cam.lookAt(eased);
    },
    render() {
      if (!shown) return;
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      const clear = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha();
      renderer.setRenderTarget(rt);
      renderer.setClearColor(BG, 1);
      renderer.clear();
      renderer.render(scene, cam);
      renderer.setRenderTarget(null);
      renderer.setClearColor(clear, alpha);
      const W = window.innerWidth, H = window.innerHeight, inset = 6;   // inside the ring's border
      hudCam.right = W; hudCam.top = H; hudCam.updateProjectionMatrix();
      disc.scale.setScalar(r.width - inset * 2);
      disc.position.set(r.left + r.width / 2, H - (r.top + r.height / 2), 0);
      renderer.autoClear = false;
      renderer.render(hud, hudCam);
      renderer.autoClear = true;
    },
  };
  api.show(false);
  return api;
}
