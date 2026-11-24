/* Gel electrophoresis: the gel box with its lid, an agarose gel and its comb, the power supply,
 * a test lead, and a blue-light transilluminator with an amber filter.
 *
 * The box's long axis is z: the black (−) electrode at −z, the red (+) at +z, so a gel with its
 * wells at −z runs toward +z, toward a camera in front of the bench. */
import * as THREE from 'three';
import { LIGHT, DECAY } from '../core/three-compat.js';
import { V3, lerp, clamp } from '../core/math.js';
import { makeCanvas, canvasTex, FONT, roundRect } from '../core/canvas.js';
import { mesh, rbox } from '../core/geometry.js';
import { seeded } from '../core/random.js';
import { toLinear } from '../materials.js';

const BLACK = toLinear('#23272e'), RED = toLinear('#d92b2b');

/** Mini gel box, 10.2 × 21 cm, 5.5 cm tall. A raised bed in the middle (top at anchors.bed)
 *  holds the gel; the buffer chambers at each end hold the electrodes, a platinum wire across
 *  the floor. setBuffer(cm) fills it (anchors.bed.y + 0.9 covers a 0.6 cm gel); setCurrent(0..1)
 *  bubbles the electrodes, twice as many at the cathode (H₂) as at the anode (O₂), and
 *  update(time) moves them. The lid sits closed on top as `lid` (a group: attach it elsewhere
 *  to move it), with its plugs at lidAnchors.black / red. */
export function makeGelBox(mat, { color = '#cfe2f3' } = {}) {
  const W = 10.2, L = 21, H = 5.5, t = 0.4, BED = 2.0;
  const g = new THREE.Group();
  const wall = mat.make.plastic({ color, opacity: 0.32 });
  const solid = mat.make.solid(toLinear('#e9eef3'), 0.5);
  const add = (geo, m, x, y, z, o) => { const b = mesh(geo, m, o); b.position.set(x, y, z); g.add(b); return b; };
  add(new THREE.BoxGeometry(W, t, L), solid, 0, t / 2, 0);
  [-1, 1].forEach((s) => {
    const side = add(new THREE.BoxGeometry(t, H, L), wall, s * (W / 2 - t / 2), H / 2, 0, { cast: false });
    side.renderOrder = 3;
    const end = add(new THREE.BoxGeometry(W - 2 * t, H, t), wall, 0, H / 2, s * (L / 2 - t / 2), { cast: false });
    end.renderOrder = 3;
  });
  // the gel bed, with the dams that keep it off the electrodes
  add(new THREE.BoxGeometry(W - 2 * t, BED - t, 12), solid, 0, t + (BED - t) / 2, 0);
  // electrodes: platinum wire across each chamber's floor, up the end wall to a pin
  const wire = mat.steel;
  const ELZ = L / 2 - 1.1;
  [-1, 1].forEach((s) => {
    const w = add(new THREE.CylinderGeometry(0.04, 0.04, W - 2 * t - 0.6, 6), wire, 0, 0.75, s * ELZ, { cast: false });
    w.rotation.z = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.04, 0.04, H - 0.8, 6), wire, 3.1, 0.75 + (H - 0.8) / 2, s * ELZ, { cast: false });
    add(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 10), mat.chrome, 3.1, H + 0.1, s * ELZ);
  });
  // the buffer: a box of liquid from the floor up to `level`
  const bufMat = mat.make.liquid(toLinear('#d8ebfa'), 0.35, { roughness: 0.1 });
  const buffer = add(new THREE.BoxGeometry(W - 2 * t - 0.02, 1, L - 2 * t - 0.02), bufMat, 0, 0, 0, { cast: false });
  buffer.renderOrder = 1;
  buffer.userData.noHL = true;
  buffer.visible = false;

  // lid: a clear cover with the two plug housings over the pins
  const lid = new THREE.Group();
  lid.position.y = H;
  const top = mesh(rbox(W + 0.8, 0.35, L + 0.6, 0.25), mat.make.plastic({ color, opacity: 0.5, edge: 1 }), { cast: false });
  top.renderOrder = 3;
  lid.add(top);
  [-1, 1].forEach((s) => {
    const skirt = mesh(new THREE.BoxGeometry(W + 0.8, 0.9, 0.2), mat.make.plastic({ color, opacity: 0.3 }), { cast: false });
    skirt.position.set(0, -0.35, s * (L / 2 + 0.2)); skirt.renderOrder = 3;
    lid.add(skirt);
    const house = mesh(rbox(1.5, 1.3, 1.5, 0.3), mat.make.solid(s < 0 ? BLACK : RED, 0.4));
    house.position.set(3.1, 0.2, s * ELZ);
    lid.add(house);
  });
  g.add(lid);

  // bubbles: instanced spheres rising off each wire
  const R = seeded(23);
  const N = 60;
  const bub = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), mat.make.physical({ color: 0xffffff, transparent: true, opacity: 0.75, roughness: 0.05, clearcoat: 1 }), N);
  bub.frustumCulled = false; bub.renderOrder = 2; bub.userData.noHL = true;
  g.add(bub);
  // two thirds at the cathode (−z): water splits into twice as much H₂ as O₂
  const bd = Array.from({ length: N }, (_, i) => ({ z: i < N * 2 / 3 ? -ELZ : ELZ, x: lerp(-3.9, 3.9, R()), o: R(), s: lerp(0.04, 0.09, R()), sp: lerp(0.5, 0.9, R()) }));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = V3(), sc = V3();

  const api = {
    group: g, lid, buffer, level: 0, current: 0,
    lidAnchors: { black: V3(3.1, 0.85, -ELZ), red: V3(3.1, 0.85, ELZ) },   // the plug tops, in lid space
    anchors: { bed: V3(0, BED, 0), top: V3(0, H, 0), black: V3(3.1, H + 0.55, -ELZ), red: V3(3.1, H + 0.55, ELZ), fill: V3(-3, H, -ELZ) },
    size: { W, L, H },
    setBuffer(cm) {
      this.level = cm;
      buffer.visible = cm > t + 0.01;
      buffer.scale.y = Math.max(0.001, cm - t);
      buffer.position.y = t + (cm - t) / 2;
    },
    setCurrent(k) { this.current = k; },
    update(time) {
      const top = Math.max(1, this.level - 0.1);
      for (let i = 0; i < N; i++) {
        const b = bd[i];
        const on = this.current > b.o * 0.999 && this.level > 1;
        const y = 0.8 + ((time * b.sp + b.o * 7) % 1) * (top - 0.8);
        p.set(b.x + Math.sin(time * 3 + i) * 0.05, y, b.z + Math.cos(time * 2 + i) * 0.08);
        sc.setScalar(on ? b.s : 0);
        m4.compose(p, q, sc);
        bub.setMatrixAt(i, m4);
      }
      bub.instanceMatrix.needsUpdate = true;
    },
  };
  return api;
}

/** Agarose gel, w × l × 0.6 cm, origin at the centre of its base; +z runs toward the anode, so
 *  its wells sit `wellFrom` cm in from the −z end. laneX[i] is each lane's x. setLanes(lanes)
 *  repaints it, each lane { loaded: 0..1 (dye in the well), dyes: [{ d, color, a }],
 *  bands: [{ d, a, w }] } with d in cm below the well; setStain(0..1) fades the bands in. The
 *  bands glow (additive), so they read on the transilluminator and vanish on a white bench,
 *  like DNA stained with SYBR Safe. */
export function makeAgaroseGel(mat, { lanes = 5, w = 7, l = 10, thick = 0.6, wellFrom = 1, wellW = 0.8, color = '#d5e3ea' } = {}) {
  const g = new THREE.Group();
  const slab = mesh(new THREE.BoxGeometry(w, thick, l), mat.make.physical({ color: toLinear(color), transparent: true, opacity: 0.72, roughness: 0.35, clearcoat: 0.8, depthWrite: false }), { cast: false });
  slab.position.y = thick / 2; slab.renderOrder = 3;
  g.add(slab);
  const PX = 64;                            // canvas pixels per cm
  const cw = Math.round(w * PX), ch = Math.round(l * PX);
  const dyeC = makeCanvas(cw, ch), glowC = makeCanvas(cw, ch);
  const dyeTex = canvasTex(dyeC), glowTex = canvasTex(glowC);
  const plane = (tex, opts) => {
    const m = mesh(new THREE.PlaneGeometry(w, l), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, ...opts }), { cast: false, receive: false });
    m.rotation.x = -Math.PI / 2; m.userData.noHL = true; m.userData.noSketch = true;
    g.add(m);
    return m;
  };
  const dyePlane = plane(dyeTex); dyePlane.position.y = thick * 0.55; dyePlane.renderOrder = 4;
  const glowPlane = plane(glowTex, { blending: THREE.AdditiveBlending, opacity: 0 }); glowPlane.position.y = thick * 0.5; glowPlane.renderOrder = 7;   // after the transilluminator's amber filter, which passes the stain's light
  const laneX = Array.from({ length: lanes }, (_, i) => (i - (lanes - 1) / 2) * (w - 1.2) / (lanes - 1 || 1));
  const wellZ = -l / 2 + wellFrom;
  const toPx = (x, z) => [(x + w / 2) * PX, (z + l / 2) * PX];
  // wells: dark slots, drawn on their own canvas layer so they show on every repaint
  const wells = makeCanvas(cw, ch); {
    const x = wells.getContext('2d');
    laneX.forEach((lx) => {
      const [px, pz] = toPx(lx - wellW / 2, wellZ - 0.08);
      x.fillStyle = 'rgba(70,90,110,.28)'; roundRect(x, px, pz, wellW * PX, 0.16 * PX, 3); x.fill();
      x.strokeStyle = 'rgba(70,90,110,.35)'; x.lineWidth = 1.5; x.stroke();
    });
  }
  const api = {
    group: g, laneX, wellZ, w, l, thick, wellW,
    anchors: { top: V3(0, thick, 0), wells: laneX.map((lx) => V3(lx, thick, wellZ)) },
    setLanes(L) {
      const d = dyeC.getContext('2d'), gl = glowC.getContext('2d');
      d.clearRect(0, 0, cw, ch); gl.fillStyle = '#000'; gl.fillRect(0, 0, cw, ch);
      d.drawImage(wells, 0, 0);
      L.forEach((lane, i) => {
        if (!lane) return;
        const lx = laneX[i];
        if (lane.loaded > 0) {
          const [px, pz] = toPx(lx - wellW / 2 + 0.04, wellZ - 0.07);
          d.fillStyle = `rgba(52,74,196,${0.85 * lane.loaded})`; roundRect(d, px, pz, (wellW - 0.08) * PX, 0.14 * PX, 3); d.fill();
        }
        (lane.dyes || []).forEach((dy) => {
          if (dy.a <= 0) return;
          const [px, pz] = toPx(lx - wellW / 2 + 0.03, wellZ + dy.d);
          const hgt = Math.max(0.12, dy.h || 0.22) * PX;
          const grad = d.createLinearGradient(0, pz - hgt / 2, 0, pz + hgt / 2);
          const c = new THREE.Color(dy.color), rgb = `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;
          grad.addColorStop(0, `rgba(${rgb},0)`); grad.addColorStop(0.5, `rgba(${rgb},${dy.a})`); grad.addColorStop(1, `rgba(${rgb},0)`);
          d.fillStyle = grad; d.fillRect(px, pz - hgt / 2, (wellW - 0.06) * PX, hgt);
        });
        (lane.bands || []).forEach((b) => {
          if (b.a <= 0) return;
          const [px, pz] = toPx(lx - wellW / 2 + 0.04, wellZ + b.d);
          const hgt = Math.max(0.06, b.w || 0.1) * PX;
          gl.shadowColor = `rgba(190,255,120,${0.8 * b.a})`; gl.shadowBlur = 6;
          gl.fillStyle = `rgba(200,255,140,${clamp(b.a)})`;
          roundRect(gl, px, pz - hgt / 2, (wellW - 0.08) * PX, hgt, hgt / 2); gl.fill();
          gl.shadowBlur = 0;
        });
      });
      dyeTex.needsUpdate = true; glowTex.needsUpdate = true;
    },
    setStain(k) { glowPlane.material.opacity = k; glowPlane.visible = k > 0.001; },
  };
  api.setLanes([]);
  api.setStain(0);
  return api;
}

/** Well comb for an agarose gel: a bar with `teeth` teeth, origin at the teeth's bottom. Set it
 *  in the gel at (0, gel.thick − depth, gel.wellZ) with the gel's laneX as `xs`. */
export function makeGelComb(mat, { xs = [-2.9, -1.45, 0, 1.45, 2.9], toothW = 0.8, depth = 0.45, color = toLinear('#3b4250') } = {}) {
  const g = new THREE.Group();
  const m = mat.make.solid(color, 0.4);
  const span = xs[xs.length - 1] - xs[0] + toothW + 1.4;
  const bar = mesh(rbox(span, 1.3, 0.35, 0.12), m);
  bar.position.y = depth + 0.5;
  g.add(bar);
  xs.forEach((x) => { const t = mesh(new THREE.BoxGeometry(toothW, depth + 0.6, 0.15), m); t.position.set(x, (depth + 0.6) / 2, 0); g.add(t); });
  return { group: g, anchors: { top: V3(0, depth + 1.8, 0) } };
}

/** Power supply, 14 × 10 cm: a screen on the sloped front, a rocker switch and two jacks.
 *  setDisplay({ on, volts, mA, time }) redraws the screen; anchors.black / red are the jacks. */
export function makePowerSupply(mat, { color = toLinear('#e7ebf0') } = {}) {
  const g = new THREE.Group();
  const W = 14, D = 10, H = 6;
  const body = mesh(rbox(W, H, D, 0.6), mat.make.solid(color, 0.45));
  g.add(body);
  const face = mesh(new THREE.BoxGeometry(W - 1, 3.4, 0.3), mat.make.solid(toLinear('#2a313b'), 0.4));
  face.position.set(0, 3.6, D / 2 + 0.05); face.rotation.x = -0.18;
  g.add(face);
  const c = makeCanvas(512, 192), tex = canvasTex(c);
  const screen = mesh(new THREE.PlaneGeometry(7.4, 2.6), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), { cast: false });
  screen.position.set(-1.6, 3.62, D / 2 + 0.22); screen.rotation.x = -0.18; screen.userData.noSketch = true;
  g.add(screen);
  const sw = new THREE.Group();
  sw.position.set(4.6, 3.6, D / 2 + 0.25); sw.rotation.x = -0.18;
  const rock = mesh(rbox(1.3, 0.5, 1.8, 0.15), mat.make.solid(toLinear('#ef4444'), 0.4));
  rock.rotation.x = Math.PI / 2; rock.position.z = 0.15;
  const pivot = new THREE.Group(); pivot.add(rock); sw.add(pivot);
  g.add(sw);
  const jack = (x, col) => {
    const j = mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.6, 18), mat.make.solid(col, 0.35));
    j.rotation.x = Math.PI / 2; j.position.set(x, 1.1, D / 2 + 0.3); g.add(j);
  };
  jack(-3.6, BLACK); jack(-1.2, RED);
  let last = '';
  const api = {
    group: g, on: false,
    anchors: { black: V3(-3.6, 1.1, D / 2 + 0.6), red: V3(-1.2, 1.1, D / 2 + 0.6), button: V3(4.6, 4.4, D / 2 + 0.4), top: V3(0, H, 0) },
    setDisplay({ on = false, volts = 100, mA = 0, time = '' } = {}) {
      this.on = on;
      pivot.rotation.x = on ? 0.3 : -0.3;
      const key = `${on}|${volts}|${mA}|${time}`;
      if (key === last) return;
      last = key;
      const x = c.getContext('2d');
      x.fillStyle = '#0b1220'; x.fillRect(0, 0, 512, 192);
      x.textBaseline = 'middle';
      x.fillStyle = on ? '#7ef0b5' : '#334155';
      x.font = `700 92px ${FONT}`; x.textAlign = 'right';
      x.fillText(String(volts), 220, 96);
      x.font = `600 38px ${FONT}`; x.textAlign = 'left'; x.fillText('V', 232, 82);
      x.fillStyle = on ? '#fdba74' : '#334155';
      x.font = `700 54px ${FONT}`; x.textAlign = 'right'; x.fillText(on ? String(mA) : '0', 420, 96);
      x.font = `600 30px ${FONT}`; x.textAlign = 'left'; x.fillText('mA', 428, 86);
      x.fillStyle = on ? '#94a3b8' : '#334155'; x.font = `600 26px ${FONT}`;
      x.fillText(on ? (time || 'RUN') : 'STANDBY', 34, 160);
      tex.needsUpdate = true;
    },
  };
  api.setDisplay({ on: false });
  return api;
}

/** A test lead: a cable with a banana plug at each end. set(a, aDir, b, bDir, sag) lays it
 *  from point a (leaving along aDir) to point b (arriving against bDir), in its parent's space,
 *  sagging to `floor` at most. */
export function makeLead(mat, { color = RED, r = 0.13, floor = 0.15 } = {}) {
  const g = new THREE.Group();
  const m = mat.make.solid(color, 0.45);
  let cable = null;
  const plugGeo = new THREE.CylinderGeometry(0.22, 0.22, 1.1, 12); plugGeo.translate(0, 0.55, 0);
  const plugA = mesh(plugGeo, m), plugB = mesh(plugGeo.clone(), m);
  g.add(plugA, plugB);
  const up = V3(0, 1, 0);
  return {
    group: g,
    set(a, aDir, b, bDir, sag = 6) {
      const a1 = a.clone().addScaledVector(aDir, 1.1), b1 = b.clone().addScaledVector(bDir, 1.1);
      const span = a1.distanceTo(b1);
      const low = Math.max(floor + r, Math.min(a1.y, b1.y) - sag - span * 0.05);
      const mid = a1.clone().lerp(b1, 0.5); mid.y = low;
      const pts = [a1, a1.clone().addScaledVector(aDir, 1.5), a1.clone().lerp(mid, 0.6).setY(lerp(a1.y, low, 0.85)), mid,
        b1.clone().lerp(mid, 0.6).setY(lerp(b1.y, low, 0.85)), b1.clone().addScaledVector(bDir, 1.5), b1];
      pts[2].y = Math.max(pts[2].y, floor + r); pts[4].y = Math.max(pts[4].y, floor + r);
      if (cable) { g.remove(cable); cable.geometry.dispose(); }
      cable = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, r, 8), m);
      g.add(cable);
      plugA.position.copy(a); plugA.quaternion.setFromUnitVectors(up, aDir.clone().normalize());
      plugB.position.copy(b); plugB.quaternion.setFromUnitVectors(up, bDir.clone().normalize());
    },
  };
}

/** Blue-light transilluminator, 18 × 13 cm: a blue window on top (anchors.bed is its surface)
 *  under an amber filter on a hinge at the back. setOn(0..1) lights the window; setCover(0..1)
 *  lowers the filter from open (0) to over the window (1). Blue light (470 nm) excites SYBR
 *  Safe; the amber filter blocks the blue so only the dye's green-yellow glow gets through. */
export function makeTransilluminator(mat) {
  const g = new THREE.Group();
  const W = 18, D = 13, H = 2.6;
  g.add(mesh(rbox(W, H, D, 0.5), mat.make.solid(toLinear('#2f3640'), 0.45)));
  const winMat = mat.make.standard({ color: toLinear('#9fb6d8'), emissive: toLinear('#2f6bff'), emissiveIntensity: 0, roughness: 0.25 });
  const win = mesh(new THREE.BoxGeometry(14, 0.1, 10), winMat, { cast: false });
  win.position.set(0, H + 0.02, 0.4); win.userData.noHL = true;
  g.add(win);
  const light = new THREE.PointLight(toLinear('#3b7bff'), 0, 30, DECAY);
  light.position.set(0, H + 4, 0.4);
  g.add(light);
  const hinge = new THREE.Group();
  hinge.position.set(0, H + 0.2, -D / 2 + 0.6);
  const amber = mesh(new THREE.BoxGeometry(16, 0.25, 11.6), mat.make.physical({ color: toLinear('#b45309'), transparent: true, opacity: 0.66, roughness: 0.08, clearcoat: 1, depthWrite: false }), { cast: false });
  amber.position.set(0, 2.2, 5.8); amber.renderOrder = 6; amber.userData.shell = true;
  const post = (x) => { const p = mesh(new THREE.BoxGeometry(0.5, 2.2, 0.5), mat.make.solid(toLinear('#2f3640'), 0.45)); p.position.set(x, 1.1, 0.3); hinge.add(p); };
  post(-7.6); post(7.6);
  hinge.add(amber);
  g.add(hinge);
  const api = {
    group: g, light,
    anchors: { bed: V3(0, H + 0.08, 0.4), switch: V3(W / 2 - 1.5, H, D / 2 - 1.2) },
    setOn(e) { winMat.emissiveIntensity = 1.5 * e; light.intensity = 0.8 * LIGHT * e; },
    setCover(k) { hinge.rotation.x = lerp(-1.25, 0, k); },
  };
  api.setOn(0); api.setCover(0);
  return api;
}
