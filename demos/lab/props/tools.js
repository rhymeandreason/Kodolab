/* Hand tools: transfer pipette, 10 mL syringe, scoop, stirring rod, wooden skewer,
 * hole punch, inoculation loop. Each file notes its origin where it isn't the base centre. */
import * as THREE from 'three';
import { V2, V3, lerp } from '../core/math.js';
import { mesh, rbox, roundedRectShape, wrapLabel } from '../core/geometry.js';
import { FONT } from '../core/canvas.js';
import { toLinear } from '../materials.js';

/** LDPE transfer pipette. Origin at the tip, bulb up. setSqueeze(0..1) squeezes the bulb, setFluid(cm) fills the stem. */
export function makePipette(mat, { fluid: fluidMat = mat.soap } = {}) {
  const g = new THREE.Group();
  const stem = mesh(new THREE.LatheGeometry([
    V2(0.001, 0), V2(0.05, 0), V2(0.085, 1.5), V2(0.12, 5.6), V2(0.2, 7.6), V2(0.3, 8.3), V2(0.31, 9.6), V2(0.26, 10.0), V2(0.001, 10.0),
  ], 24), mat.ldpe, { cast: false });
  stem.renderOrder = 3;
  g.add(stem);
  const bulb = new THREE.Group();
  const bulbM = mesh(new THREE.LatheGeometry([
    V2(0.001, 0), V2(0.27, 0), V2(0.5, 0.55), V2(0.63, 1.5), V2(0.61, 2.8), V2(0.43, 3.75), V2(0.18, 4.15), V2(0.001, 4.25),
  ], 28), mat.ldpe, { cast: false });
  bulbM.renderOrder = 3;
  bulb.add(bulbM);
  bulb.position.y = 9.85;
  g.add(bulb);
  for (let i = 0; i < 4; i++) {
    const ring = mesh(new THREE.TorusGeometry(0.15 + i * 0.012, 0.012, 4, 20), mat.slate, { cast: false });
    ring.rotation.x = Math.PI / 2; ring.position.y = 4.4 + i * 0.7;
    g.add(ring);
  }
  const fluidGeo = new THREE.CylinderGeometry(0.065, 0.04, 1, 10);
  fluidGeo.translate(0, 0.5, 0);
  const fluid = mesh(fluidGeo, fluidMat, { cast: false });
  fluid.position.y = 0.15; fluid.renderOrder = 1; fluid.visible = false;
  g.add(fluid);
  return {
    group: g, bulb, fluid,
    anchors: { tip: V3(0, 0, 0) },
    setFluid(L) { fluid.visible = L > 0.02; fluid.scale.y = Math.max(0.001, L); },
    squeeze: 0,
    /** Squeeze the bulb, 0 (relaxed) … 1 (fully squeezed). */
    setSqueeze(a) { this.squeeze = a; bulb.scale.set(1 - 0.42 * a, 1 - 0.1 * a, 1 - 0.42 * a); },
  };
}

/* 10 mL plastic syringe (no needle) with printed mL scale, removable plunger,
 * liquid and a tip cap. Origin at the nozzle tip, barrel along +y. */

export const SYRINGE_ML = 0.65;   // cm of barrel per mL
export const SYRINGE_BOT = 1.32;  // inner bottom of the barrel (stopper fully depressed)

/** plunger = plunger colour (light blue by default). */
export function makeSyringe(mat, { plunger: plungerColor = toLinear('#7cc4e8') } = {}) {
  const ML = SYRINGE_ML, BOT = SYRINGE_BOT;
  const g = new THREE.Group();
  const R = 0.8, Ri = 0.7, top = 10.2;
  const pts = [V2(0.07, 0), V2(0.19, 0), V2(0.22, 0.85), V2(0.5, 1.05), V2(R, 1.22), V2(R, top), V2(Ri, top), V2(Ri, 1.32), V2(0.3, 1.15), V2(0.09, 0.9), V2(0.07, 0.001)];
  const barrel = mesh(new THREE.LatheGeometry(pts, 40), mat.plastic, { cast: false });
  barrel.renderOrder = 3;
  g.add(barrel);
  const flGeo = new THREE.ExtrudeGeometry(roundedRectShape(3.6, 1.7, 0.75), { depth: 0.2, bevelEnabled: false, curveSegments: 10 });
  flGeo.rotateX(-Math.PI / 2);
  const flange = mesh(flGeo, mat.frosted, { cast: false });
  flange.position.y = top - 0.05; flange.renderOrder = 3;
  g.add(flange);
  g.add(wrapLabel({
    rTop: R + 0.006, rBot: R + 0.006, y0: BOT, y1: BOT + 10.4 * ML, arc: 2.2, center: 0, w: 256, h: 1024, order: 4,
    draw: (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.strokeStyle = 'rgba(15,25,35,0.9)'; c.fillStyle = 'rgba(15,25,35,0.9)';
      c.textBaseline = 'middle'; c.textAlign = 'left';
      for (let i = 0; i <= 50; i++) {
        const mL = i * 0.2; const y = h - (mL / 10.4) * h;
        const major = i % 5 === 0;
        c.lineWidth = major ? 4 : 2.5;
        c.beginPath(); c.moveTo(70, y); c.lineTo(major ? 150 : 115, y); c.stroke();
        if (major && i > 0) { c.font = `700 46px ${FONT}`; c.fillText(String(mL), 160, y); }
      }
      c.font = `700 34px ${FONT}`; c.fillText('mL', 160, h - (10.35 / 10.4) * h + 10);
    },
  }));
  const plunger = new THREE.Group();
  const plungerMat = mat.make.solid(plungerColor, 0.35);
  const stopTip = mesh(new THREE.ConeGeometry(Ri - 0.005, 0.25, 32), mat.rubber);
  stopTip.rotation.x = Math.PI; stopTip.position.y = 0.125;
  const stopper = mesh(new THREE.CylinderGeometry(Ri - 0.005, Ri - 0.005, 0.55, 32), mat.rubber);
  stopper.position.y = 0.525;
  const ribA = mesh(new THREE.BoxGeometry(1.15, 10.6, 0.13), plungerMat);
  const ribB = mesh(new THREE.BoxGeometry(0.13, 10.6, 1.15), plungerMat);
  ribA.position.y = ribB.position.y = 6.1;
  const thumb = mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.18, 32), plungerMat);
  thumb.position.y = 11.45;
  plunger.add(stopTip, stopper, ribA, ribB, thumb);
  plunger.position.y = BOT;
  g.add(plunger);
  const liqGeo = new THREE.CylinderGeometry(Ri - 0.03, Ri - 0.03, 1, 28);
  liqGeo.translate(0, 0.5, 0);
  const liquid = mesh(liqGeo, mat.make.liquid(), { cast: false });
  liquid.position.y = BOT; liquid.renderOrder = 1; liquid.visible = false;
  g.add(liquid);
  const nozzleLiq = mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 8), liquid.material, { cast: false });
  nozzleLiq.position.y = 0.65; nozzleLiq.renderOrder = 1; nozzleLiq.visible = false;
  g.add(nozzleLiq);
  const cap = mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.95, 20), mat.orange);
  cap.position.y = 0.32; cap.visible = false;
  g.add(cap);

  return {
    group: g, plunger, liquid, nozzleLiq, cap, py: BOT, vol: 0, capped: false,
    anchors: { tip: V3(0, 0, 0), top: V3(0, top, 0) },
    setPlunger(y) { this.py = y; plunger.position.y = y; },
    setVol(v) {
      this.vol = v;
      liquid.visible = nozzleLiq.visible = v > 0.02;
      liquid.position.y = BOT;
      liquid.scale.y = Math.max(0.001, v * ML);
    },
    setLiquidRange(a, b) {
      liquid.visible = b - a > 0.02;
      liquid.position.y = a;
      liquid.scale.y = Math.max(0.001, b - a);
    },
  };
}

/** Steel scoop lying along +x; the bowl is at the origin. heap = powder in the bowl. */
export function makeScoop(mat) {
  const g = new THREE.Group();
  const blade = mesh(new THREE.BoxGeometry(9.5, 0.07, 0.75), mat.chrome);
  blade.position.x = 5.0;
  const spoon = mesh(new THREE.SphereGeometry(0.6, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat.make.standard({ color: 0xe3e7ec, metalness: 1, roughness: 0.2, side: THREE.DoubleSide }));
  spoon.scale.set(1.45, 0.45, 0.85); spoon.position.x = -0.1;
  const handle = mesh(new THREE.CylinderGeometry(0.32, 0.36, 6, 16), mat.charcoal);
  handle.rotation.z = Math.PI / 2; handle.position.x = 12.6;
  const heap = mesh(new THREE.SphereGeometry(0.5, 14, 10), mat.powder);
  heap.scale.set(1.3, 0.55, 0.8); heap.position.set(-0.1, 0.02, 0); heap.visible = false;
  heap.userData.noHL = true;
  g.add(blade, spoon, handle, heap);
  return { group: g, heap, anchors: { bowl: V3(-0.1, 0.25, 0) } };
}

/** Glass stirring rod, from y = 0 (tip) to y = length. */
export function makeRod(mat, { length = 18 } = {}) {
  const g = new THREE.Group();
  const m = mesh(new THREE.CylinderGeometry(0.22, 0.22, length, 16), mat.glass, { cast: false });
  m.position.y = length / 2; m.renderOrder = 3;
  const capA = mesh(new THREE.SphereGeometry(0.22, 12, 8), mat.glassRim, { cast: false });
  const capB = capA.clone(); capB.position.y = length;
  g.add(m, capA, capB);
  return { group: g, anchors: { tip: V3(0, 0, 0), end: V3(0, length, 0) } };
}

/** Wooden skewer (15 cm by default). Origin at the pointed tip, along +y. */
export function makeSkewer(mat, { length = 15 } = {}) {
  const g = new THREE.Group();
  const wood = mat.make.solid(0xd8b48a, 0.75);
  const shaft = mesh(new THREE.CylinderGeometry(0.16, 0.16, length - 0.6, 12), wood);
  shaft.position.y = 0.6 + (length - 0.6) / 2;
  const point = mesh(new THREE.CylinderGeometry(0.16, 0.02, 0.6, 12), wood);
  point.position.y = 0.3;
  g.add(shaft, point);
  return { group: g, anchors: { tip: V3(0, 0, 0), end: V3(0, length, 0) } };
}

/** Single-hole punch, lying flat; the die (cutting point) is at the local origin. setPress(0..1). */
export function makePunch(mat) {
  const g = new THREE.Group();
  const lowerArm = mesh(rbox(12.8, 0.42, 1.5, 0.25), mat.chrome);
  lowerArm.position.set(5.2, -0.68, 0);
  const die = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 24), mat.charcoal);
  die.position.set(0, -0.25, 0);
  const lowerGrip = mesh(rbox(5.6, 0.78, 1.85, 0.38), mat.teal);
  lowerGrip.position.set(8.4, -0.92, 0);
  const hinge = mesh(new THREE.CylinderGeometry(0.48, 0.48, 1.9, 20), mat.steel);
  hinge.rotation.x = Math.PI / 2; hinge.position.set(11.3, 0.05, 0);
  g.add(lowerArm, die, lowerGrip, hinge);
  const upper = new THREE.Group();
  upper.position.set(11.3, 0.1, 0);
  const upperArm = mesh(rbox(12.6, 0.44, 1.5, 0.25), mat.chrome);
  upperArm.position.set(-6.0, 0.35, 0);
  const pin = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.4, 20), mat.steel);
  pin.position.set(-11.3, 0.15, 0);
  const upperGrip = mesh(rbox(5.6, 0.78, 1.85, 0.38), mat.teal);
  upperGrip.position.set(-2.9, 0.75, 0);
  upper.add(upperArm, pin, upperGrip);
  upper.rotation.z = -0.04;
  g.add(upper);
  return { group: g, anchors: { die: V3(0, 0, 0) }, setPress(e) { upper.rotation.z = lerp(-0.04, 0.034, e); } };
}

/** Disposable inoculation loop (from Ecoli), 7.5 cm. Origin at the centre of the loop,
 *  handle up. setBlob(0..1) shows a dab of colony on the loop, setFilm(0..1) a film of liquid. */
export function makeLoop(mat, { color = toLinear('#2563eb') } = {}) {
  const g = new THREE.Group();
  const m = mat.make.solid(color, 0.4);
  const ring = mesh(new THREE.TorusGeometry(0.275, 0.045, 8, 28), m, { cast: false });
  ring.rotation.x = Math.PI / 2;
  const wire = mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 8), m, { cast: false });
  wire.position.set(-0.275, 0.9, 0);
  const handle = mesh(new THREE.CylinderGeometry(0.14, 0.1, 5.75, 16), mat.make.solid(new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.15), 0.35));
  handle.position.set(-0.275, 1.8 + 2.875, 0);
  const blob = mesh(new THREE.SphereGeometry(0.25, 16, 10), mat.make.standard({ color: toLinear('#fbf3da'), roughness: 0.4 }), { cast: false });
  blob.scale.setScalar(0.001);
  const film = mesh(new THREE.CircleGeometry(0.25, 24), mat.make.physical({ color: toLinear('#bbf7d0'), transparent: true, opacity: 0, roughness: 0, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false }), { cast: false, receive: false });
  film.rotation.x = -Math.PI / 2; film.visible = false;
  g.add(ring, wire, handle, blob, film);
  return {
    group: g, blob, film,
    anchors: { tip: V3(0, 0, 0), end: V3(-0.275, 7.55, 0) },
    setBlob(k) { blob.scale.setScalar(Math.max(0.001, k)); },
    setFilm(k) { film.visible = k > 0.01; film.material.opacity = 0.65 * k; },
  };
}
