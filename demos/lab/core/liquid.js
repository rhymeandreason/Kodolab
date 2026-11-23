/* Liquid inside a container. Every liquid container uses this, so they all fill,
 * pour and report their surface the same way.
 *
 *   const liquid = makeLiquid(mat, group, {
 *     wall: [[3.4, 0.14], [3.4, 9.6]],   // inner wall [[r, y], ...] from the floor up (container space)
 *     color: 0x5aa9e6, lip: V3(3.7, 9.8, 0),
 *   });
 *   liquid.setVolume(150);      // mL, from the wall profile
 *   liquid.setLevel(4);         // cm above the inner floor
 *   liquid.setFraction(0.5);    // of `max`
 *   liquid.setRange(0.4, 0.7);  // a layer between two fractions (stacked liquids)
 *   liquid.setPour(k);          // 0 upright … 1 surface pulled up to the lip, while you tilt the container
 *   liquid.surfaceY();          // world y of the surface
 *
 * How it works: the mesh fills the whole inside and a horizontal world-space
 * clip plane cuts it at the surface. The plane is updated just before the
 * mesh renders, from the container's world matrix, so the surface stays level
 * when the container moves, tilts or lifts on hover, with no per-frame code in
 * the sim. When tilted, the surface passes through the point on the
 * container's axis at the current level (volume roughly kept); setPour blends
 * it toward the lip so liquid reaches the spout.
 *
 * Clipping leaves no top surface, so a container with a wall also gets a flat
 * `cap` disc at the surface. It shows while the container is upright (within
 * about 10°) and not pouring; tilted, you see the liquid through the opening.
 *
 * It sets the plane on whichever material the mesh has when it renders, so the
 * hover-glow copies from ix.register work and liquids need no `noHL`.
 *
 * Options:
 *   wall      inner wall profile; the mesh is its lathe, inset by `inset`. Gives
 *             volume (mL = cm³), radiusAt() and `max` (wall height).
 *   geometry  or your own geometry, for shapes that aren't lathes (the zip bag).
 *             Then give `floor` and `max`; volume functions need a wall.
 *   floor     inner floor y (container space). Default: the wall's first y.
 *   max       the level setFraction(1) means. Default: wall height.
 *   lip       pour point (container space), for setPour.
 *   head      how far above the lip the surface rides at full pour, per unit of
 *             fraction (so a fuller container pours with more liquid at the lip).
 *   color, opacity, matOpts   for mat.make.liquid.
 */
import * as THREE from 'three';
import { V3, lerp } from './math.js';
import { lathe, mesh as makeMesh } from './geometry.js';

const OFF = 1e5; // a plane constant that clips nothing
const UPRIGHT = Math.cos(0.18); // the cap shows while the container's up axis is within ~10° of world up
const _inv = new THREE.Matrix4();
const _v = new THREE.Vector3(), _up = new THREE.Vector3(), _s = new THREE.Vector3();
const _flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const CAP_GEO = new THREE.CircleGeometry(1, 48); CAP_GEO.userData.shared = true;

export function makeLiquid(mat, group, {
  wall = null, geometry = null, floor, max, inset = 0.03, segments = 48,
  lip = null, head = 2, color = 0x5aa9e6, opacity = 0.5, matOpts = {}, cloudColor = 0xd9e4ec,
} = {}) {
  // ----- geometry and volume table from the wall -----
  let table = null;
  if (wall) {
    const w = wall.map(([r, y]) => [r, y]);
    floor = floor ?? w[0][1];
    max = max ?? w[w.length - 1][1] - floor;
    if (!geometry) {
      const pts = w.map(([r, y]) => [Math.max(0, r - (r > 0 ? inset : 0)), y]);
      if (pts[0][0] > 0) pts.unshift([0, pts[0][1]]);
      pts.push([0, pts[pts.length - 1][1]]);
      geometry = lathe(pts, segments);
    }
    // cumulative volume at each wall point (frustums), for volume <-> level
    table = [{ y: w[0][1], r: w[0][0], v: 0 }];
    for (let i = 1; i < w.length; i++) {
      const [r0, y0] = w[i - 1], [r1, y1] = w[i];
      const dv = (Math.PI / 3) * (y1 - y0) * (r0 * r0 + r0 * r1 + r1 * r1);
      table.push({ y: y1, r: r1, v: table[i - 1].v + dv });
    }
  }
  floor = floor ?? 0;
  max = max ?? 1;

  const top = new THREE.Plane(V3(0, -1, 0), OFF), bottom = new THREE.Plane(V3(0, 1, 0), OFF);
  const material = mat.make.liquid(color, opacity, Object.assign({ clippingPlanes: [top, bottom] }, matOpts));
  const m = makeMesh(geometry, material, { cast: false });
  m.renderOrder = 1; m.visible = false;
  group.add(m);
  // the surface disc (containers with a wall). Its world matrix is set as it renders.
  const cap = wall ? makeMesh(CAP_GEO, material, { cast: false, receive: false }) : null;
  if (cap) { cap.renderOrder = 1; cap.visible = false; cap.frustumCulled = false; group.add(cap); }
  const mats = () => (cap ? [m.material, cap.material] : [m.material]);

  const baseColor = new THREE.Color(color), cloud = new THREE.Color(cloudColor);
  const worldY = (y) => { _v.set(0, y, 0); return group.localToWorld(_v).y; };

  const api = {
    mesh: m, cap, group, floor, max, level: 0, base: 0, pour: 0, cloud: 0,

    setLevel(cm) { this.level = Math.max(0, cm); this._vis(); return this; },
    setFraction(f) { return this.setLevel(f * this.max); },
    /** A layer between two fractions of `max`: clips below f0 as well as above f1. */
    setRange(f0, f1) { this.base = Math.max(0, f0 * this.max); return this.setLevel(f1 * this.max); },
    setBase(cm) { this.base = Math.max(0, cm); this._vis(); return this; },
    setVolume(mL) { return this.setLevel(this.levelAt(mL)); },
    setPour(k) { this.pour = k; return this; },
    get fraction() { return this.max > 0 ? this.level / this.max : 0; },
    get volume() { return this.volumeAt(this.level); },

    /** Colour: hex or THREE.Color. Resets the cloud. */
    setColor(c) { baseColor.set(c); return this.setCloud(this.cloud); },
    /** Cloudiness 0..1 (undissolved powder): lighter and more opaque. */
    setCloud(c) {
      this.cloud = c;
      for (const x of mats()) {
        x.color.copy(baseColor).lerp(cloud, c * 0.85);
        x.opacity = lerp(opacity, Math.max(opacity, 0.82), c);
      }
      return this;
    },

    /** mL below a level (cm above the floor). */
    volumeAt(level) {
      if (!table) return 0;
      const y = floor + level;
      for (let i = 1; i < table.length; i++) {
        const a = table[i - 1], b = table[i];
        if (y <= b.y) {
          const h = Math.max(0, y - a.y), r = lerp(a.r, b.r, (b.y - a.y) > 0 ? h / (b.y - a.y) : 0);
          return a.v + (Math.PI / 3) * h * (a.r * a.r + a.r * r + r * r);
        }
      }
      return table[table.length - 1].v;
    },
    /** Level (cm above the floor) that holds mL. */
    levelAt(mL) {
      if (!table) return 0;
      let lo = 0, hi = table[table.length - 1].y - floor;
      for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (this.volumeAt(mid) < mL) lo = mid; else hi = mid; }
      return lo;
    },
    /** Inner radius at a level (cm above the floor), minus the inset. */
    radiusAt(level) {
      if (!table) return 0;
      const y = floor + level;
      for (let i = 1; i < table.length; i++) {
        const a = table[i - 1], b = table[i];
        if (y <= b.y) return lerp(a.r, b.r, (b.y - a.y) > 0 ? (y - a.y) / (b.y - a.y) : 0) - inset;
      }
      return table[table.length - 1].r - inset;
    },

    /** World y of a level on the container's axis (default: the floor). */
    yAt(level = 0) { group.updateWorldMatrix(true, false); return worldY(floor + level); },
    /** World y of the surface right now. */
    surfaceY() { group.updateWorldMatrix(true, false); return this._surface(); },

    _surface() {
      let y = worldY(floor + this.level);
      if (this.pour > 0 && lip) y = lerp(y, group.localToWorld(_v.copy(lip)).y + 0.05 + this.fraction * head, this.pour);
      return y;
    },
    _vis() { m.visible = this.level - this.base > 0.002; if (cap) cap.visible = m.visible; },
  };
  // runs after the renderer has updated world matrices, before this mesh draws
  const setPlanes = (mtl) => {
    const planes = mtl.clippingPlanes;
    if (!planes || planes.length < 2) return;
    planes[0].constant = api._surface();
    planes[1].constant = api.base > 0 ? -worldY(floor + api.base) : OFF;
  };
  m.onBeforeRender = (renderer, scene, camera, geo, mtl) => setPlanes(mtl);
  if (cap) {
    // the renderer reads matrixWorld after this, so setting it here places the disc this frame
    cap.onBeforeRender = (renderer, scene, camera, geo, mtl) => {
      setPlanes(mtl);
      _up.setFromMatrixColumn(group.matrixWorld, 1).normalize();
      const r = api.pour > 0 || _up.y < UPRIGHT ? 1e-5 : api.radiusAt(api.level);
      group.localToWorld(_v.set(0, floor + api.level, 0));
      _v.y -= 0.003; // just under the clip plane
      cap.matrixWorld.compose(_v, _flat, _s.set(r, r, 1));
      // keep the local transform in step, so bounds (marker rings, hit boxes, the follow cam)
      // see the disc where it is drawn, not an upright unit disc at the origin
      cap.matrix.copy(_inv.copy(group.matrixWorld).invert()).multiply(cap.matrixWorld);
      cap.matrix.decompose(cap.position, cap.quaternion, cap.scale);
    };
  }
  return api;
}
