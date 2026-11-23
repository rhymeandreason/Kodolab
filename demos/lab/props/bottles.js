/* Reagent containers: powder jar and lid, squeeze bottle, reagent bottle. */
import * as THREE from 'three';
import { V2, V3 } from '../core/math.js';
import { bandLabel, cardLabel } from '../core/labels.js';
import { mesh, wrapLabel } from '../core/geometry.js';
import { makeLiquid } from '../core/liquid.js';
import { toLinear } from '../materials.js';
import { ingredient as getIngredient } from './ingredients.js';

/** Open jar of white powder with a printed label, coloured by ingredient (props/ingredients.js;
 *  baking soda by default). title, line, color (label bands) and body (jar colour, picked hex)
 *  override the ingredient's. dome = the powder surface. */
export function makeJar(mat, { ingredient = 'bakingSoda', ...o } = {}) {
  const it = getIngredient(ingredient);
  const title = o.title ?? it.title, line = o.line ?? it.line, color = o.color ?? it.label;
  const bodyColor = toLinear(o.body ?? it.body);
  const g = new THREE.Group();
  const bodyMat = mat.make.standard({ color: bodyColor, roughness: 0.35, side: THREE.DoubleSide });
  const body = mesh(new THREE.LatheGeometry([
    V2(0.001, 0), V2(2.8, 0), V2(3.05, 0.35), V2(3.05, 5.6), V2(2.72, 6.0), V2(2.72, 6.7), V2(2.52, 6.7), V2(2.52, 6.1), V2(2.85, 5.6), V2(2.85, 0.4), V2(0.001, 0.4),
  ], 48), bodyMat);
  g.add(body);
  for (let i = 0; i < 2; i++) {
    const th = mesh(new THREE.TorusGeometry(2.73, 0.05, 6, 48), bodyMat, { cast: false });
    th.rotation.x = Math.PI / 2; th.position.y = 6.2 + i * 0.28;
    g.add(th);
  }
  const powder = mesh(new THREE.CylinderGeometry(2.82, 2.82, 4.2, 40), mat.powder, { cast: false });
  powder.position.y = 2.5;
  const dome = mesh(new THREE.SphereGeometry(2.8, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat.powder, { cast: false });
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
  const b = mesh(new THREE.LatheGeometry([V2(0.001, 0), V2(2.1, 0), V2(2.4, 0.4), V2(2.45, 8.4), V2(2.1, 10.5), V2(1.0, 11.8), V2(0.9, 12.5), V2(0.001, 12.5)], 40),
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
 *  fills 0..1 of the body (below the shoulder); liquid.setPour(k) while you tilt it. */
export function makeReagentBottle(mat, { title = 'ISOPROPYL', line = 'ALCOHOL 91%', note = 'keep ice-cold', color = '#2f6fed', liquidColor = 0xdff0ff } = {}) {
  const g = new THREE.Group();
  const shell = mesh(new THREE.LatheGeometry([V2(0.001, 0), V2(1.7, 0), V2(1.8, 0.2), V2(1.8, 6.8), V2(1.6, 7.4), V2(0.75, 8.3), V2(0.6, 8.5), V2(0.6, 9.6), V2(0.55, 9.7)], 56),
    mat.make.glass({ color: '#eef6ff', opacity: 0.3 }), { cast: false });
  shell.renderOrder = 3;
  g.add(shell);
  const liquid = makeLiquid(mat, g, {
    wall: [[1.66, 0.15], [1.66, 6.75], [1.46, 7.3], [0.62, 8.2], [0.48, 8.4], [0.48, 9.5]], inset: 0, max: 7,
    lip: V3(0, 9.7, 0), head: 2.5, color: liquidColor, opacity: 0.45, matOpts: { roughness: 0.1, clearcoat: 0.7 },
  });
  liquid.setFraction(0.8);
  g.add(wrapLabel({
    rTop: 1.83, rBot: 1.83, y0: 1.8, y1: 5.4, arc: 2.5, center: 0, w: 512, h: 256, order: 5,
    draw: (c, w, h) => bandLabel(c, w, h, { title, line, note, color, ink: '#1b2a4a', lineColor: '#1b2a4a' }),
  }));
  const cap = mesh(new THREE.CylinderGeometry(0.72, 0.72, 1.0, 24), mat.make.physical({ color, roughness: 0.35 }));
  cap.position.y = 9.9;
  g.add(cap);
  return {
    group: g, cap, liquid,
    anchors: { spout: V3(0, 9.7, 0), floor: V3(0, 0.15, 0) },
  };
}
