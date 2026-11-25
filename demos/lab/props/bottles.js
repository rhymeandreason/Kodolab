/* Reagent containers: powder jar and lid, squeeze bottle, reagent bottle. */
import * as THREE from 'three';
import { V2, V3 } from '../core/math.js';
import { bandLabel, cardLabel } from '../core/labels.js';
import { mesh, wrapLabel } from '../core/geometry.js';
import { makeLiquid } from '../core/liquid.js';
import { toLinear } from '../materials.js';
import { ingredient as getIngredient, powderMaterial } from './ingredients.js';

/** Open jar of white powder with a printed label, coloured by ingredient (props/ingredients.js;
 *  baking soda by default). title, line, color (label bands), body (jar colour) and powder (contents, picked hex)
 *  override the ingredient's. dome = the powder surface. */
export function makeJar(mat, { ingredient = 'bakingSoda', ...o } = {}) {
  const it = getIngredient(ingredient);
  const title = o.title ?? it.title, line = o.line ?? it.line, color = o.color ?? it.label;
  const bodyColor = toLinear(o.body ?? it.body);
  const g = new THREE.Group();
  const bodyMat = mat.make.standard({ color: bodyColor, roughness: 0.35, side: THREE.DoubleSide });
  const body = mesh(new THREE.LatheGeometry([
    V2(0.001, 0.015), V2(2.8, 0.015), V2(3.05, 0.35), V2(3.05, 5.6), V2(2.72, 6.0), V2(2.72, 6.7), V2(2.52, 6.7), V2(2.52, 6.1), V2(2.85, 5.6), V2(2.85, 0.4), V2(0.001, 0.4),
  ], 48), bodyMat);
  g.add(body);
  for (let i = 0; i < 2; i++) {
    const th = mesh(new THREE.TorusGeometry(2.73, 0.05, 6, 48), bodyMat, { cast: false });
    th.rotation.x = Math.PI / 2; th.position.y = 6.2 + i * 0.28;
    g.add(th);
  }
  const powderMat = (o.powder ?? it.powder) ? powderMaterial(mat, o.powder ?? it.powder) : mat.powder;
  const powder = mesh(new THREE.CylinderGeometry(2.82, 2.82, 4.2, 40), powderMat, { cast: false });
  powder.position.y = 2.5;
  const dome = mesh(new THREE.SphereGeometry(2.8, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), powderMat, { cast: false });
  dome.scale.y = 0.16; dome.position.y = 4.6;
  g.add(powder, dome);
  g.add(wrapLabel({
    rTop: 3.07, rBot: 3.07, y0: 1.1, y1: 4.9, arc: 2.6, center: 0.15, w: 640, h: 320,
    draw: (c, w, h) => bandLabel(c, w, h, { header: 'LAB GRADE', title, line, color }),
  }));
  return { group: g, dome, anchors: { top: V3(0, 6.7, 0), powder: V3(0, 4.95, 0) } };
}

/** Screw lid in the ingredient's label colour, to match its jar. color: a picked hex instead. */
export function makeJarLid(mat, { ingredient = 'bakingSoda', color = getIngredient(ingredient).label, material = mat.make.solid(toLinear(color), 0.4) } = {}) {
  const lid = mesh(new THREE.CylinderGeometry(3.15, 3.15, 1.1, 40), material);
  lid.position.y = 0.55;
  const g = new THREE.Group(); g.add(lid);
  return { group: g, anchors: {} };
}

/** Squeeze bottle (dish soap by default). cap = cap colour (yellow by default; null for white). */
export function makeSqueezeBottle(mat, { color = 0x3fbf7f, title = ['DISH', 'SOAP'], line = 'liquid detergent', ink = '#15803d', cap: capColor = toLinear('#f5c518') } = {}) {
  const g = new THREE.Group();
  const capMat = capColor == null ? mat.white : mat.make.solid(capColor, 0.42);
  const b = mesh(new THREE.LatheGeometry([V2(0.001, 0.015), V2(2.1, 0.015), V2(2.4, 0.4), V2(2.45, 8.4), V2(2.1, 10.5), V2(1.0, 11.8), V2(0.9, 12.5), V2(0.001, 12.5)], 40),
    mat.make.physical({ color, roughness: 0.15, transparent: true, opacity: 0.88, clearcoat: 1 }));
  const cap = mesh(new THREE.CylinderGeometry(0.95, 1.0, 1.5, 24), capMat);
  cap.position.y = 13.2;
  const nub = mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.6, 12), capMat);
  nub.position.y = 14.2;
  g.add(b, cap, nub);
  g.add(wrapLabel({
    rTop: 2.47, rBot: 2.47, y0: 2.5, y1: 7.2, arc: 2.2, center: 0.1, w: 400, h: 400,
    draw: (c, w, h) => cardLabel(c, w, h, { title, line, ink }),
  }));
  return { group: g, anchors: { spout: V3(0, 14.5, 0) } };
}

/** Reagent bottle with a printed label, a cap and a liquid (isopropyl alcohol by default).
 *  Origin at the centre of the base; anchors.spout is the open neck. liquid.setFraction(f)
 *  fills 0..1 of the body (below the shoulder); liquid.setPour(k) while you tilt it.
 *  scale: 1 is about 100 mL, 3.6 × 10 cm; 2 is about 500 mL. Anchors are scaled with it.
 *  glass tints the bottle (picked hex) and glassOpacity sets how much it hides: amber peroxide is
 *  { glass: '#8a4a10', glassOpacity: 0.7 }. */
export function makeReagentBottle(mat, { title = 'ISOPROPYL', line = 'ALCOHOL 91%', note = 'keep ice-cold', color = '#2f6fed', liquidColor = 0xdff0ff, scale = 1, glass = '#eef6ff', glassOpacity = 0.3 } = {}) {
  const outer = new THREE.Group(), g = new THREE.Group();
  g.scale.setScalar(scale);
  outer.add(g);
  const shell = mesh(new THREE.LatheGeometry([V2(0.001, 0.015), V2(1.7, 0.015), V2(1.8, 0.2), V2(1.8, 6.8), V2(1.6, 7.4), V2(0.75, 8.3), V2(0.6, 8.5), V2(0.6, 9.6), V2(0.55, 9.7)], 56),
    mat.make.glass({ color: glass, opacity: glassOpacity }), { cast: false });
  shell.renderOrder = 3;
  g.add(shell);
  const liquid = makeLiquid(mat, g, {
    wall: [[1.66, 0.15], [1.66, 6.75], [1.46, 7.3], [0.62, 8.2], [0.48, 8.4], [0.48, 9.5]], inset: 0, max: 7,
    lip: V3(0, 9.7, 0), head: 2.5, color: liquidColor, opacity: 0.45, matOpts: { roughness: 0.1, clearcoat: 0.7 },
  });
  liquid.setFraction(0.8);
  g.add(wrapLabel({
    rTop: 1.83, rBot: 1.83, y0: 1.8, y1: 5.4, arc: 2.5, center: 0, order: 5,
    draw: (c, w, h) => bandLabel(c, w, h, { title, line, note, color, ink: '#1b2a4a', lineColor: '#1b2a4a' }),
  }));
  const cap = mesh(new THREE.CylinderGeometry(0.72, 0.72, 1.0, 24), mat.make.physical({ color, roughness: 0.35 }));
  cap.position.y = 9.9;
  g.add(cap);
  return {
    group: outer, cap, liquid,
    anchors: { spout: V3(0, 9.7 * scale, 0), floor: V3(0, 0.15 * scale, 0) },
  };
}

/** 30 mL dropper bottle (from OnionRoot): a squat glass bottle with a band label and a dropper
 *  standing in it, a rubber bulb on a glass pipe. Origin at the centre of the base.
 *  dropper is a group of its own at the neck (lift it out with root.attach(b.dropper));
 *  anchors.tip is the pipe's tip in dropper space. setSqueeze(0..1) squeezes the bulb,
 *  setFill(0..1) fills the pipe. color = the label bands; tint = the glass. */
export function makeDropperBottle(mat, { title = '1 M HCl', line = 'HYDROCHLORIC ACID', note, color = '#e8a23a', liquidColor = 0xe6f2ff, liquidOpacity = 0.4, tint = '#eef6ff', bulb: bulbColor = '#24272e' } = {}) {
  const NECK = 5.88, PIPE = 4.5;
  const g = new THREE.Group();
  const shell = mesh(new THREE.LatheGeometry([V2(0.001, 0.015), V2(1.54, 0.015), V2(1.67, 0.2), V2(1.67, 4.2), V2(1.43, 4.97), V2(0.7, 5.39), V2(0.66, NECK)], 48),
    mat.make.glass({ color: tint, opacity: 0.28 }), { cast: false });
  shell.renderOrder = 3;
  g.add(shell);
  const liquid = makeLiquid(mat, g, {
    wall: [[1.58, 0.18], [1.58, 4.15], [1.36, 4.9], [0.62, 5.3], [0.58, 5.8]], inset: 0, max: 4,
    color: liquidColor, opacity: liquidOpacity, matOpts: { roughness: 0.1, clearcoat: 0.7 },
  });
  liquid.setFraction(0.75);
  g.add(wrapLabel({
    rTop: 1.69, rBot: 1.69, y0: 1.0, y1: 3.6, arc: 2.5, center: 0, order: 5,
    draw: (c, w, h) => bandLabel(c, w, h, { title, line, note, color, ink: '#151a22', lineColor: '#5b6575' }),
  }));
  const dropper = new THREE.Group();
  dropper.position.y = NECK;
  const collar = mesh(new THREE.CylinderGeometry(0.74, 0.74, 0.84, 32), mat.charcoal);
  collar.position.y = 0.42;
  const bulb = mesh(new THREE.SphereGeometry(0.53, 24, 16), mat.make.physical({ color: toLinear(bulbColor), roughness: 0.45, clearcoat: 0.6 }));
  bulb.position.y = 1.47; bulb.scale.y = 1.6;
  const pipe = mesh(new THREE.CylinderGeometry(0.12, 0.07, PIPE, 12), mat.glass, { cast: false });
  pipe.position.y = -PIPE / 2; pipe.renderOrder = 3;
  const fluidGeo = new THREE.CylinderGeometry(0.075, 0.045, 1, 10);
  fluidGeo.translate(0, 0.5, 0);
  const fluid = mesh(fluidGeo, mat.make.liquid(liquidColor, Math.max(0.6, liquidOpacity)), { cast: false });
  fluid.position.y = -PIPE + 0.05; fluid.renderOrder = 2; fluid.visible = false;
  dropper.add(collar, bulb, pipe, fluid);
  g.add(dropper);
  return {
    group: g, dropper, bulb, liquid,
    anchors: { tip: V3(0, -PIPE, 0), neck: V3(0, NECK, 0) },
    setSqueeze(a) { bulb.scale.set(1 + 0.15 * a, 1.6 - 0.45 * a, 1 + 0.15 * a); },
    setFill(f) { fluid.visible = f > 0.01; fluid.scale.y = Math.max(0.001, f * (PIPE - 0.6)); },
  };
}

/** Squeeze dropper bottle with a pointed nozzle, from BloodType: the antisera and the
 *  blood samples. 9.6 cm tall. color = cap and label band; title, sub, footer = the label;
 *  liquid.setFraction() sets the level. anchors.tip = the nozzle's point, where a drop forms. */
export function makeNozzleBottle(mat, { title = 'Anti-A', sub = 'Antiserum', footer = 'Typing reagent', color = '#2f6fe4', liquidColor = 0x2a66e0, liquidOpacity = 0.9 } = {}) {
  const TIP = 8.6;
  const g = new THREE.Group();
  const body = mesh(new THREE.LatheGeometry([[0, 0.015], [1.35, 0.015], [1.55, 0.08], [1.62, 0.3], [1.62, 4.5], [1.56, 5.0], [1.3, 5.4], [0.92, 5.66], [0.8, 5.78], [0.8, 6.0], [0, 6.0]].map((p) => V2(p[0], p[1])), 56),
    mat.make.plastic({ opacity: 0.2, color: '#f4f7fb' }), { cast: false });
  body.renderOrder = 3;
  g.add(body);
  const liquid = makeLiquid(mat, g, {
    wall: [[1.52, 0.1], [1.52, 4.4], [1.46, 4.9], [1.2, 5.3]], inset: 0,
    color: liquidColor, opacity: liquidOpacity, matOpts: { roughness: 0.3, clearcoat: 0.3 },
  });
  liquid.setLevel(3.8);
  const collar = mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.72, 40), mat.make.solid(toLinear(color), 0.35));
  collar.position.y = 6.22;
  const nozzle = mesh(new THREE.LatheGeometry([[0.74, 6.55], [0.72, 6.75], [0.46, 7.2], [0.24, 8.05], [0.13, 8.5], [0, TIP]].map((p) => V2(p[0], p[1])), 40),
    mat.make.physical({ color: 0xf8f9fb, roughness: 0.3, clearcoat: 0.5 }));
  g.add(collar, nozzle);
  g.add(wrapLabel({
    rTop: 1.645, rBot: 1.645, y0: 2.2, y1: 4.5, arc: Math.PI, center: 0, w: 576, h: 256, order: 5,
    draw: (c, w, h) => bandLabel(c, w, h, { header: sub.toUpperCase(), title, line: footer, color, ink: '#141b2d', lineColor: '#8a93a6' }),
  }));
  return { group: g, liquid, collar, anchors: { tip: V3(0, TIP, 0), top: V3(0, TIP, 0) }, radius: 1.7, h: TIP };
}
