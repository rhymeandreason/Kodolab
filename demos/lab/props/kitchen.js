/* Kitchen ware for food labs: a plate, a serving bowl and a glass bowl of ice water.
 * From the Strawberry lab. Origins at the centre of the base. */
import * as THREE from 'three';
import { V3, V2 } from '../core/math.js';
import { lathe, mesh } from '../core/geometry.js';
import { seeded } from '../core/random.js';
import { toLinear } from '../materials.js';

/** Sage china plate, 9 cm across. anchors.floor = the eating surface. */
export function makePlate(mat, { color = toLinear('#9fcfae') } = {}) {
  const g = new THREE.Group();
  g.add(mesh(lathe([[0, 0], [3.4, 0], [3.6, 0.12], [4.4, 0.42], [4.6, 0.62], [4.45, 0.66], [3.7, 0.4], [0, 0.32]], 72),
    mat.make.physical({ color, roughness: 0.22, clearcoat: 0.6 })));
  return { group: g, anchors: { floor: V3(0, 0.32, 0) }, radius: 4.6 };
}

/** Cornflower serving bowl, 10.6 cm across. anchors.floor = the bottom of the bowl. */
export function makeBowl(mat, { color = toLinear('#5b8fd9') } = {}) {
  const g = new THREE.Group();
  g.add(mesh(lathe([[0, 0], [2.4, 0], [2.6, 0.25], [5, 2.4], [5.3, 3.2], [5.15, 3.28], [4.8, 2.55], [2.4, 0.62], [0, 0.55]], 72),
    mat.make.physical({ color, roughness: 0.3, clearcoat: 0.4 })));
  return { group: g, anchors: { floor: V3(0, 0.55, 0), top: V3(0, 3.28, 0) }, radius: 5.3 };
}

/** Light blue glass bowl of ice water with cubes, for keeping a bottle cold. Origin at the centre of the base.
 *  glassOpts: wideGlass options for the bowl, merged over the light blue tint. */
export function makeIceBath(mat, { cubes = 10, seed = 11, glassOpts = {} } = {}) {
  const r = seeded(seed);
  const g = new THREE.Group();
  const bowl = mesh(new THREE.LatheGeometry([V2(0.001, 0), V2(3.2, 0), V2(4.6, 0.6), V2(5.6, 2.4), V2(5.9, 3.8), V2(6.05, 3.92)], 72), mat.make.wideGlass({ color: '#4fb0e0', opacity: 1, edge: 1, back: 0.6, ...glassOpts }), { cast: false });
  bowl.renderOrder = 3;
  const water = mesh(new THREE.LatheGeometry([V2(0.001, 0.15), V2(3.1, 0.15), V2(4.5, 0.7), V2(5.4, 2.3), V2(0.001, 2.3)], 64), mat.make.liquid(0xd4ecfb, 0.3), { cast: false });
  water.renderOrder = 1;
  g.add(bowl, water);
  const cubeMat = mat.make.glass({ color: '#e3f4ff', opacity: 0.4, roughness: 0.12 });
  const cubeGeo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
  for (let i = 0; i < cubes; i++) {
    const a = (i / cubes) * Math.PI * 2 + r() * 0.3, rr = 3.4 + r() * 1.2;
    const cube = mesh(cubeGeo, cubeMat, { cast: false });
    cube.position.set(Math.cos(a) * rr, 1.4 + r() * 0.9, Math.sin(a) * rr);
    cube.rotation.set(r() * 3, r() * 3, r() * 3);
    cube.renderOrder = 3;
    g.add(cube);
  }
  return { group: g, anchors: { floor: V3(0, 0.3, 0), top: V3(0, 3.92, 0) } };
}
