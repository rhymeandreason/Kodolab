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
  // Closed profile with a real wall: outer skin, rolled lip, inner skin. Only the foot ring touches
  // y = 0, so the base never lies coplanar with the bench (z-fighting). Close pairs of points at each
  // crease keep LatheGeometry's smoothed normals from bending the flat floor into the wall.
  const floorY = 0.2;
  const inner = [V2(5.78, 3.86), V2(5.74, 3.7), V2(5.46, 2.44), V2(4.5, 0.74), V2(3.3, floorY + 0.02), V2(3.1, floorY), V2(0.001, floorY)];
  const bowl = mesh(lathe([
    V2(0.001, 0.07), V2(2.8, 0.07), V2(2.95, 0.02), V2(3.05, 0), V2(3.2, 0.01), V2(3.3, 0.04), V2(4.6, 0.6),
    V2(5.6, 2.4), V2(5.9, 3.8), V2(6.0, 3.9), V2(5.95, 3.97), V2(5.85, 3.95), ...inner,
  ], 72), mat.make.wideGlass({ color: '#4fb0e0', opacity: 1, edge: 1, back: 0.6, ...glassOpts }), { cast: false });
  bowl.renderOrder = 3;
  const surf = 2.3;
  const water = mesh(lathe([V2(0.001, floorY + 0.02), V2(3.08, floorY + 0.02), V2(4.46, 0.78), V2(5.38, surf), V2(0.001, surf)], 64), mat.make.liquid(0xd4ecfb, 0.3), { cast: false });
  water.renderOrder = 1;
  g.add(bowl, water);
  // inner radius at height y, from the inner skin
  const rIn = (y) => {
    for (let i = inner.length - 2; i > 0; i--) {
      const lo = inner[i], hi = inner[i - 1];
      if (y <= hi.y) return lo.x + (hi.x - lo.x) * Math.max(0, (y - lo.y) / (hi.y - lo.y));
    }
    return inner[0].x;
  };
  const cubeMat = mat.make.glass({ color: '#e3f4ff', opacity: 0.4, roughness: 0.12 });
  const cubeGeo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
  const corner = new THREE.Vector3();
  for (let i = 0; i < cubes; i++) {
    const a = (i / cubes) * Math.PI * 2 + r() * 0.3;
    let rr = 3.4 + r() * 1.2;
    const cube = mesh(cubeGeo, cubeMat, { cast: false });
    cube.rotation.set(r() * 3, r() * 3, r() * 3);
    cube.updateMatrix();
    const corners = [];
    for (let k = 0; k < 8; k++) corners.push(corner.set(k & 1 ? 0.75 : -0.75, k & 2 ? 0.75 : -0.75, k & 4 ? 0.75 : -0.75).applyMatrix4(cube.matrix).clone());
    // floating: ice rides with ~90% below the surface, but never through the floor
    const y = Math.max(1.5 + r() * 0.6, floorY + 0.05 - Math.min(...corners.map((c) => c.y)));
    // pull the cube in until every corner is clear of the wall
    const fits = (d) => corners.every((c) => Math.hypot(c.x + Math.cos(a) * d, c.z + Math.sin(a) * d) < rIn(c.y + y) - 0.05);
    while (rr > 0 && !fits(rr)) rr -= 0.05;
    cube.position.set(Math.cos(a) * rr, y, Math.sin(a) * rr);
    cube.renderOrder = 3;
    g.add(cube);
  }
  return { group: g, anchors: { floor: V3(0, floorY, 0), top: V3(0, 3.97, 0) } };
}
