/* =============================================================================
 *  lib/geo.js — capsule, rounded box, merge
 * =============================================================================
 *  The global three.js build (lib/three.r186.min.js) carries no addons, so
 *  RoundedBoxGeometry and BufferGeometryUtils are not there, and the capsule
 *  here predates three's own. One copy, not one per component.
 *
 *    Geo.capsule(THREE, r, len, capSeg, radial)   a lathe: two quarter arcs and a wall
 *    Geo.roundedBox(THREE, w, h, d, seg, r)        a subdivided box whose vertices are
 *                                                  clamped to an inner box and pushed out
 *                                                  by r, which is what the addon does
 *    Geo.merge(THREE, geometries)                  one non-indexed geometry from many;
 *                                                  position, normal and uv, no groups.
 *                                                  IT UN-INDEXES WHAT IT IS GIVEN, so a
 *                                                  caller building a matching attribute
 *                                                  (per-vertex colour, say) must count
 *                                                  the NON-INDEXED parts: an indexed
 *                                                  sphere has a third of the vertices
 *                                                  the merge does, and the shortfall
 *                                                  reads as black.
 * ========================================================================== */
(function (global) {
  'use strict';

  function capsule(THREE, r, len, capSeg = 6, radial = 14) {
    const pts = [];
    for (let i = 0; i <= capSeg; i++) {
      const a = -Math.PI / 2 + (i / capSeg) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r - len / 2));
    }
    for (let i = 0; i <= capSeg; i++) {
      const a = (i / capSeg) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r + len / 2));
    }
    return new THREE.LatheGeometry(pts, radial);
  }

  function roundedBox(THREE, w, h, d, seg, r) {
    const g = new THREE.BoxGeometry(w, h, d, seg * 2, seg * 2, seg * 2);
    const pos = g.attributes.position, nor = g.attributes.normal;
    const inner = new THREE.Vector3(w / 2 - r, h / 2 - r, d / 2 - r);
    const p = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      c.set(Math.max(-inner.x, Math.min(inner.x, p.x)),
            Math.max(-inner.y, Math.min(inner.y, p.y)),
            Math.max(-inner.z, Math.min(inner.z, p.z)));
      n.subVectors(p, c);
      if (n.lengthSq() < 1e-12) n.fromBufferAttribute(nor, i);
      n.normalize();
      p.copy(c).addScaledVector(n, r);
      pos.setXYZ(i, p.x, p.y, p.z);
      nor.setXYZ(i, n.x, n.y, n.z);
    }
    return g;
  }

  function merge(THREE, geometries) {
    const parts = geometries.map(g => g.index ? g.toNonIndexed() : g);
    const names = ['position', 'normal', 'uv'].filter(n => parts.every(g => g.attributes[n]));
    const out = new THREE.BufferGeometry();
    for (const n of names) {
      const size = parts[0].attributes[n].itemSize;
      const total = parts.reduce((a, g) => a + g.attributes[n].count, 0);
      const arr = new Float32Array(total * size);
      let off = 0;
      for (const g of parts) { arr.set(g.attributes[n].array, off); off += g.attributes[n].array.length; }
      out.setAttribute(n, new THREE.BufferAttribute(arr, size));
    }
    return out;
  }

  global.Geo = { capsule, roundedBox, merge };
})(typeof globalThis !== 'undefined' ? globalThis : this);
