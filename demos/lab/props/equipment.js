/* Powered bench equipment: desk lamp, lab timer, and from Ecoli a water bath and a handheld UV lamp. */
import * as THREE from 'three';
import { LIGHT, DECAY } from '../core/three-compat.js';
import { V3, lerp } from '../core/math.js';
import { makeCanvas, canvasTex, FONT } from '../core/canvas.js';
import { mesh, rbox } from '../core/geometry.js';
import { toLinear } from '../materials.js';

/** Desk lamp with a working spotlight and a warm yellow glow. setOn(0..1) fades it. The head is at local (0, 27.6, 24).
 *  color = body and shade; glow = the light's colour. */
export function makeLamp(mat, { color = toLinear('#2f8f8a'), glow = 0xffc93c } = {}) {
  const g = new THREE.Group();
  const body = mat.make.solid(color, 0.4);
  const base = mesh(new THREE.CylinderGeometry(5.2, 5.8, 1.4, 48), body);
  base.position.y = 0.7;
  const baseRing = mesh(new THREE.TorusGeometry(5.5, 0.08, 6, 48), mat.slate, { cast: false });
  baseRing.rotation.x = Math.PI / 2; baseRing.position.y = 0.15;
  const sw = new THREE.Group();
  sw.position.set(2.8, 1.4, 2.6);
  const swBase = mesh(rbox(2.2, 0.35, 1.4, 0.3), mat.charcoal);
  const swLever = mesh(rbox(0.9, 0.5, 0.9, 0.2), body);
  swLever.position.y = 0.25;
  const lever = new THREE.Group(); lever.add(swLever); lever.rotation.x = -0.35;
  sw.add(swBase, lever);
  const pole = mesh(new THREE.CylinderGeometry(0.45, 0.45, 31.6, 20), body);
  pole.position.y = 17.2;
  const j1 = mesh(new THREE.SphereGeometry(0.9, 20, 14), mat.charcoal); j1.position.y = 33;
  const arm = mesh(new THREE.CylinderGeometry(0.4, 0.4, 24, 20), body);
  arm.rotation.x = Math.PI / 2; arm.position.set(0, 33, 12);
  const j2 = mesh(new THREE.SphereGeometry(0.8, 20, 14), mat.charcoal); j2.position.set(0, 33, 24);
  const neck = mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.4, 12), mat.charcoal); neck.position.set(0, 32.2, 24);
  const shadeOuter = mesh(new THREE.CylinderGeometry(2.3, 7.6, 6.4, 64, 1, true), mat.make.standard({ color, roughness: 0.4, side: THREE.FrontSide }));
  shadeOuter.position.set(0, 28.3, 24);
  const innerMat = mat.make.standard({ color: 0xffffff, roughness: 0.6, side: THREE.BackSide, emissive: glow, emissiveIntensity: 0 });
  const shadeInner = mesh(new THREE.CylinderGeometry(2.26, 7.55, 6.38, 64, 1, true), innerMat, { cast: false });
  shadeInner.position.copy(shadeOuter.position);
  shadeInner.userData.noHL = true;
  const shadeTop = mesh(new THREE.CircleGeometry(2.3, 40), body);
  shadeTop.rotation.x = -Math.PI / 2; shadeTop.position.set(0, 31.5, 24);
  const lip = mesh(new THREE.TorusGeometry(7.6, 0.12, 8, 64), mat.slate, { cast: false });
  lip.rotation.x = Math.PI / 2; lip.position.set(0, 25.1, 24);
  const bulbMat = mat.make.standard({ color: 0xfbfaf4, roughness: 0.2, emissive: glow, emissiveIntensity: 0 });
  const bulb = mesh(new THREE.SphereGeometry(1.7, 28, 18), bulbMat, { cast: false });
  bulb.position.set(0, 27.6, 24);
  bulb.userData.noHL = true;
  const spot = new THREE.SpotLight(new THREE.Color(0xffffff).lerp(new THREE.Color(glow), 0.7), 0, 0, 0.72, 0.65, DECAY);
  spot.position.set(0, 27.6, 24);
  spot.target.position.set(0, 0, 24);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.bias = -0.0005;
  g.add(spot, spot.target);
  // Light shaft: soft at the edges (alpha falls off where you look along the cone's
  // wall, i.e. its silhouette) and fading out toward the table. Unlit effect, so
  // its own small shader rather than a mat.make material.
  const coneMat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(glow) }, opacity: { value: 0 } },
    vertexShader: `
      varying vec3 vN; varying vec3 vV; varying float vY;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = -mv.xyz; vY = uv.y;   // uv.y: 0 at the table, 1 at the shade
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 color; uniform float opacity;
      varying vec3 vN; varying vec3 vV; varying float vY;
      void main() {
        float face = abs(dot(normalize(vN), normalize(vV)));       // 1 facing you, 0 at the sides
        float a = opacity * pow(face, 2.0) * smoothstep(0.0, 0.85, vY);
        gl_FragColor = vec4(color, a);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const cone = mesh(new THREE.CylinderGeometry(7.2, 16, 25, 48, 1, true), coneMat, { cast: false, receive: false });
  cone.position.set(0, 13, 24);
  cone.renderOrder = 8;
  cone.userData.noHL = true;
  cone.raycast = () => {};
  g.add(base, baseRing, sw, pole, j1, arm, j2, neck, shadeOuter, shadeInner, shadeTop, lip, bulb, cone);
  return {
    group: g, lever, on: false,
    anchors: { head: V3(0, 27.6, 24), spot: V3(0, 0, 24), switch: V3(2.8, 1.9, 2.6) },
    setOn(e) {
      this.on = e > 0.5;
      spot.intensity = 1.9 * LIGHT * e;
      bulb.material.emissiveIntensity = 1.8 * e;
      shadeInner.material.emissiveIntensity = 0.55 * e;
      cone.material.uniforms.opacity.value = 0.2 * e;
    },
    setLever(e) { lever.rotation.x = lerp(-0.35, 0.35, e); },
  };
}

/** Digital lab timer (orange case). draw(seconds, running) updates the screen. */
export function makeTimer(mat, { color = toLinear('#f08a4b') } = {}) {
  const g = new THREE.Group();
  const body = mesh(rbox(6.6, 3.8, 2.6, 0.7), mat.make.solid(color, 0.45));
  const c = makeCanvas(512, 200); const tex = canvasTex(c);
  const screen = mesh(new THREE.PlaneGeometry(5.2, 2.05), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), { cast: false });
  screen.position.set(0, 1.95, 1.31);
  const btnA = mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.35, 20), mat.teal);
  btnA.position.set(1.6, 3.9, 0);
  const btnB = mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 20), mat.slate);
  btnB.position.set(-1.5, 3.88, 0);
  g.add(body, screen, btnA, btnB);
  let last = '';
  const api = {
    group: g, btn: btnA,
    anchors: { button: V3(1.6, 4.1, 0) },
    draw(sec, running) {
      const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
      const str = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` + (running ? '1' : '0');
      if (str === last) return;
      last = str;
      const x = c.getContext('2d');
      x.fillStyle = '#121c27'; x.fillRect(0, 0, 512, 200);
      x.fillStyle = running ? '#7ef0b5' : '#5d7a8c';
      x.font = `600 132px 'JetBrains Mono', ui-monospace, monospace`;
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(str.slice(0, 5), 256, 108);
      x.font = `600 22px ${FONT}`; x.fillStyle = '#5d7a8c'; x.textAlign = 'left';
      x.fillText(running ? '● RUN' : 'MIN  SEC', 18, 26);
      tex.needsUpdate = true;
    },
  };
  api.draw(0, false);
  return api;
}

/** Water bath (from Ecoli): an open tank of water with a float rack and a control panel
 *  showing the setpoint and `label` while active. 15 × 10.4 cm, 5.5 cm deep. slots[] are where tubes stand in the
 *  float (local). setActive(on, blink) lights the panel; update(time) ripples the water
 *  (call it every frame; stronger while active). */
export function makeWaterBath(mat, { setpoint = '42.0', label = 'HEAT SHOCK', color = toLinear('#e9eef4'), floatColor = toLinear('#fecdd3') } = {}) {
  const K = 6.5;
  const W = 2.3 * K, H = 0.85 * K, D = 1.6 * K, t = 0.45;
  const g = new THREE.Group();
  const wm = mat.make.solid(color, 0.45), trim = mat.make.solid(toLinear('#cfd8e3'), 0.4);
  const add = (geo, m, x, y, z, o) => { const b = mesh(geo, m, o); b.position.set(x, y, z); g.add(b); return b; };
  add(new THREE.BoxGeometry(W, t, D), wm, 0, t / 2, 0);
  add(new THREE.BoxGeometry(W, H, t), wm, 0, H / 2, D / 2 - t / 2); add(new THREE.BoxGeometry(W, H, t), wm, 0, H / 2, -D / 2 + t / 2);
  add(new THREE.BoxGeometry(t, H, D - 2 * t), wm, W / 2 - t / 2, H / 2, 0); add(new THREE.BoxGeometry(t, H, D - 2 * t), wm, -W / 2 + t / 2, H / 2, 0);
  add(new THREE.BoxGeometry(W + 0.26, 0.26, t + 0.26), trim, 0, H, D / 2 - t / 2); add(new THREE.BoxGeometry(W + 0.26, 0.26, t + 0.26), trim, 0, H, -D / 2 + t / 2);
  add(new THREE.BoxGeometry(t + 0.26, 0.26, D), trim, W / 2 - t / 2, H, 0); add(new THREE.BoxGeometry(t + 0.26, 0.26, D), trim, -W / 2 + t / 2, H, 0);
  const waterY = 0.73 * K;
  const water = add(new THREE.BoxGeometry(W - 2 * t, waterY - t, D - 2 * t), mat.make.liquid(toLinear('#4fa8e3'), 0.35), 0, t + (waterY - t) / 2, 0, { cast: false });
  water.renderOrder = 1;
  const sg = new THREE.PlaneGeometry(W - 2 * t, D - 2 * t, 28, 20);
  const surf = add(sg, mat.make.liquid(toLinear('#5fb4ea'), 0.55, { roughness: 0.15, envMapIntensity: 0.6, side: THREE.FrontSide }), 0, waterY, 0, { cast: false });
  surf.rotation.x = -Math.PI / 2; surf.renderOrder = 2;
  const base = Float32Array.from(sg.attributes.position.array);
  const flt = add(new THREE.BoxGeometry(9.4, 0.4, 3.6), mat.make.solid(floatColor, 0.7), 0, 0.74 * K, -0.3);
  // control panel with a screen (an unlit canvas)
  const panel = add(new THREE.BoxGeometry(7.2, 2.7, 1.3), mat.make.solid(toLinear('#1e293b'), 0.4), 3.25, 2.35, D / 2 + 0.65);
  const c = makeCanvas(512, 192); const tex = canvasTex(c);
  add(new THREE.PlaneGeometry(5.6, 2.1), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), 3.25, 2.47, D / 2 + 1.31, { cast: false });
  const knob = add(new THREE.CylinderGeometry(0.4, 0.4, 0.33, 20), mat.make.solid(toLinear('#94a3b8'), 0.3), -2.3, 2.35, D / 2 + 0.15);
  knob.rotation.x = Math.PI / 2;
  let last = '';
  const api = {
    group: g, surface: surf, active: false,
    slots: [V3(-2.3, 0.74 * K + 0.2, -0.3), V3(2.3, 0.74 * K + 0.2, -0.3)],
    anchors: { top: V3(0, H, 0), floor: V3(0, 0.74 * K + 0.2, -0.3), screen: V3(3.25, 2.47, D / 2 + 1.31) },
    setActive(active, blink = false) {
      this.active = active;
      const key = `${active}${blink}`;
      if (key === last) return;
      last = key;
      const x = c.getContext('2d');
      x.fillStyle = '#0b1220'; x.fillRect(0, 0, 512, 192);
      x.fillStyle = active ? (blink ? '#fb923c' : '#fdba74') : '#5eead4';
      x.font = `700 104px ${FONT}`; x.textBaseline = 'middle'; x.textAlign = 'left';
      x.fillText(setpoint, 34, 104);
      x.font = `600 46px ${FONT}`; x.fillText('°C', 300, 82);
      x.fillStyle = active ? '#fb923c' : '#334155';
      x.font = `700 26px ${FONT}`; x.fillText(active ? label : 'READY', 300, 138);
      tex.needsUpdate = true;
    },
    update(time) {
      const pos = sg.attributes.position, amp = this.active ? 0.17 : 0.04;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3] / K, y = base[i * 3 + 1] / K;
        pos.array[i * 3 + 2] = (Math.sin(x * 5 + time * 2.2) * amp + Math.cos(y * 6 - time * 1.7) * amp * 0.8 + (this.active ? Math.sin(x * 13 + y * 11 + time * 9) * 0.04 : 0));
      }
      pos.needsUpdate = true;
      sg.computeVertexNormals();
    },
  };
  api.setActive(false);
  return api;
}

/** Handheld UV lamp (from Ecoli): a dark box with a purple window underneath, a handle on
 *  top and a spotlight pointing down (-y). 8.5 × 2.5 cm. setOn(0..1) lights the window and the spot. */
export function makeUvLamp(mat, { glow = 0x8b5cf6, range = 70 } = {}) {
  const g = new THREE.Group();
  const body = mesh(rbox(8.5, 1.3, 2.5, 0.3), mat.make.solid(toLinear('#1e293b'), 0.35));
  body.position.y = -0.65;
  const winMat = mat.make.standard({ color: toLinear('#4c1d95'), emissive: toLinear('#7c3aed'), emissiveIntensity: 0.35, roughness: 0.2 });
  const win = mesh(new THREE.BoxGeometry(7.3, 0.15, 1.7), winMat, { cast: false });
  win.position.y = -0.7;
  win.userData.noHL = true;
  const handle = mesh(new THREE.TorusGeometry(1.6, 0.2, 10, 28, Math.PI), mat.make.solid(toLinear('#334155'), 0.4));
  handle.position.y = 0.6;
  const sw = mesh(new THREE.BoxGeometry(0.6, 0.2, 0.5), mat.make.solid(toLinear('#a78bfa'), 0.4));
  sw.position.set(3, 0.7, 0);
  const spot = new THREE.SpotLight(glow, 0, range, 1.05, 0.6, DECAY);
  spot.position.set(0, -0.8, 0);
  spot.target.position.set(0, -20, 0);
  g.add(body, win, handle, sw, spot, spot.target);
  return {
    group: g, spot,
    anchors: { spot: V3(0, -0.8, 0), top: V3(0, 2.2, 0) },
    setOn(e) { winMat.emissiveIntensity = 0.35 + 2.6 * e; spot.intensity = 1.0 * LIGHT * e; },
  };
}
