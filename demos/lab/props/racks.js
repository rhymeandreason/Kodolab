/* Racks and holders. The tube rack is from the Strawberry lab: origin at the centre
 * of its base; holes[] are the local positions tubes stand at. The block rack and the tool
 * holder are from Ecoli. */
import * as THREE from 'three';
import { V3 } from '../core/math.js';
import { mesh, roundedRectShape } from '../core/geometry.js';
import { toLinear } from '../materials.js';

/** Tube rack. Two-tier with posts (Strawberry), or block: true for a low solid block with
 *  holes (Ecoli's, for microcentrifuge tubes); depth = how far a tube sinks into the block. */
export function makeTubeRack(mat, { holes = 3, spacing = 3.6, holeR = 1.45, color = toLinear('#f2b134'), block = false, depth = 1.6 } = {}) {
  if (block) return blockRack(mat, { holes, spacing, holeR, color, depth });
  const g = new THREE.Group();
  const w = spacing * (holes - 1) + 4.8, d = 5.5;
  const rackMat = mat.make.solid(color, 0.45);
  const xs = Array.from({ length: holes }, (_, i) => (i - (holes - 1) / 2) * spacing);
  const topShape = roundedRectShape(w, d, 1);
  xs.forEach((x) => { const hp = new THREE.Path(); hp.absarc(x, 0, holeR, 0, Math.PI * 2, true); topShape.holes.push(hp); });
  const ex = { depth: 0.5, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.08, bevelSegments: 2, curveSegments: 24 };
  const topGeo = new THREE.ExtrudeGeometry(topShape, ex); topGeo.rotateX(-Math.PI / 2);
  const baseGeo = new THREE.ExtrudeGeometry(roundedRectShape(w, d, 1), ex); baseGeo.rotateX(-Math.PI / 2);
  const top = mesh(topGeo, rackMat); top.position.y = 4.6;
  const base = mesh(baseGeo, rackMat); base.position.y = 0.08;
  g.add(top, base);
  [-w / 2 + 0.65, w / 2 - 0.65].forEach((x) => {
    const post = mesh(new THREE.CylinderGeometry(0.32, 0.32, 4.1, 16), rackMat);
    post.position.set(x, 2.6, 0);
    g.add(post);
  });
  return { group: g, holes: xs.map((x) => V3(x, 0.66, 0)), anchors: Object.fromEntries(xs.map((x, i) => [`hole${i}`, V3(x, 5.2, 0)])) };
}

/** Small cup a pipette or loop stands in (from Ecoli). Origin at the centre of the base. */
function blockRack(mat, { holes, spacing, holeR, color, depth }) {
  const g = new THREE.Group();
  const w = spacing * (holes - 1) + holeR * 2 + 2.6, d = holeR * 2 + 1.6, h = 2.25;
  const xs = Array.from({ length: holes }, (_, i) => (i - (holes - 1) / 2) * spacing);
  const geo = new THREE.ExtrudeGeometry(roundedRectShape(w, d, 0.5), { depth: h - 0.16, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2 });
  geo.rotateX(-Math.PI / 2); geo.translate(0, 0.08, 0);
  g.add(mesh(geo, mat.make.solid(color, 0.55)));
  const holeMat = mat.make.solid(new THREE.Color(color).multiplyScalar(0.62), 0.8);
  xs.forEach((x) => { const hole = mesh(new THREE.CircleGeometry(holeR, 32), holeMat, { cast: false }); hole.rotation.x = -Math.PI / 2; hole.position.set(x, h + 0.01, 0); g.add(hole); });
  return { group: g, holes: xs.map((x) => V3(x, h - depth, 0)), anchors: Object.fromEntries(xs.map((x, i) => [`hole${i}`, V3(x, h, 0)])) };
}

export function makeToolHolder(mat, { color = toLinear('#d7dee8') } = {}) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.LatheGeometry([[0, 0], [1, 0], [1.05, 2.1], [0.95, 2.1], [0.9, 0.2], [0, 0.2]].map(([r, y]) => new THREE.Vector2(r, y)), 32), mat.make.solid(color, 0.5)));
  return { group: g, anchors: { floor: V3(0, 0.2, 0), top: V3(0, 2.1, 0) } };
}
