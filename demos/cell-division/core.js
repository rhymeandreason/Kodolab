/* cell-division/core.js: math, seeded randomness, keyframe tracks, dynamic tube mesh. */
window.CD = window.CD || {};

(function (CD) {
  'use strict';

  const V3 = THREE.Vector3;
  const TAU = Math.PI * 2;

  CD.TAU = TAU;
  CD.N_PTS = 72; // spine samples per chromatid
  CD.N_RAD = 12; // radial segments per chromatid

  // ---------------------------------------------------------------- math
  CD.clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  CD.lerp = (a, b, t) => a + (b - a) * t;
  CD.smoothstep = (a, b, x) => {
    const t = CD.clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  CD.bell = (x) => Math.sin(CD.clamp(x, 0, 1) * Math.PI);

  CD.ease = {
    linear: (t) => t,
    sine: (t) => 0.5 - 0.5 * Math.cos(Math.PI * t),
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    out: (t) => 1 - Math.pow(1 - t, 3),
    in: (t) => t * t * t,
  };

  // mulberry32
  CD.rng = function (seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  CD.randUnit = function (rnd) {
    const u = rnd() * 2 - 1;
    const a = rnd() * TAU;
    const s = Math.sqrt(1 - u * u);
    return new V3(s * Math.cos(a), u, s * Math.sin(a));
  };
  CD.randInBall = (rnd, r) => CD.randUnit(rnd).multiplyScalar(r * Math.cbrt(rnd()));
  CD.randPerp = function (v, rnd) {
    for (;;) {
      const t = CD.randUnit(rnd);
      t.addScaledVector(v, -t.dot(v));
      if (t.lengthSq() > 1e-3) return t.normalize();
    }
  };
  CD.anyPerp = function (v, out) {
    const ax = Math.abs(v.x) < 0.9 ? new V3(1, 0, 0) : new V3(0, 1, 0);
    return out.crossVectors(v, ax).normalize();
  };
  CD.alignTo = (v, ref) => (v.dot(ref) < 0 ? v.negate() : v);
  CD.v3 = (x, y, z) => new V3(x, y, z);

  // Smooth pseudo-random wobble used for congression "jitter".
  CD.jitter = (t, s, out) =>
    out.set(
      Math.sin(t * 1.9 + s) * 0.6 + Math.sin(t * 3.3 + s * 1.7) * 0.4,
      Math.sin(t * 1.4 + s * 2.3) * 0.6 + Math.sin(t * 2.9 + s * 0.9) * 0.4,
      Math.sin(t * 1.6 + s * 3.1) * 0.6 + Math.sin(t * 3.7 + s * 1.3) * 0.4
    );

  // ---------------------------------------------------------------- keyframe tracks
  // Fields listed here hold their value until the next key instead of interpolating.
  const STEP = { ci: true, vis: true };

  class Track {
    constructor() {
      this.keys = [];
    }

    // Each key inherits every field of the previous key; `vals` overrides some of them.
    // `ease` shapes the segment that arrives at this key.
    key(t, vals, ease) {
      const last = this.keys[this.keys.length - 1];
      if (last && t < last.t) console.warn('Track keys out of order', t, last.t);
      const v = Object.assign({}, last ? last.v : {});
      for (const k in vals) {
        const x = vals[k];
        v[k] = x && x.isVector3 ? x.clone() : x;
      }
      this.keys.push({ t, v, ease: ease || 'sine' });
      return this;
    }

    sample(t, out) {
      const k = this.keys;
      const n = k.length;
      if (!n) return out;
      let a, b, u;
      if (t <= k[0].t) {
        a = b = k[0];
        u = 0;
      } else if (t >= k[n - 1].t) {
        a = b = k[n - 1];
        u = 0;
      } else {
        let i = 0;
        while (i < n - 1 && k[i + 1].t <= t) i++;
        a = k[i];
        b = k[i + 1];
        const span = b.t - a.t;
        u = span > 0 ? CD.ease[b.ease]((t - a.t) / span) : 1;
      }
      for (const f in a.v) {
        const va = a.v[f];
        const vb = b.v[f];
        if (va && va.isVector3) (out[f] || (out[f] = new V3())).lerpVectors(va, vb, u);
        else if (STEP[f]) out[f] = va;
        else out[f] = va + (vb - va) * u;
      }
      return out;
    }
  }
  CD.Track = Track;

  // ---------------------------------------------------------------- chromatin coils
  // A smooth random 3D curve used as the decondensed (interphase) shape of a chromatid.
  CD.makeCoil = function (rnd, n, amp) {
    const comps = [];
    for (let axis = 0; axis < 3; axis++) {
      for (let k = 0; k < 4; k++) {
        comps.push({ axis, f: (1 + k * 1.35) * (0.8 + rnd() * 0.6), p: rnd() * TAU, m: amp / (1 + k * 0.85) });
      }
    }
    const pts = [];
    const mean = new V3();
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const v = [0, 0, 0];
      for (const c of comps) v[c.axis] += Math.sin(c.f * t * TAU + c.p) * c.m;
      const p = new V3(v[0], v[1], v[2]);
      pts.push(p);
      mean.add(p);
    }
    mean.multiplyScalar(1 / n);
    let max = 0;
    for (const p of pts) {
      p.sub(mean);
      max = Math.max(max, p.length());
    }
    const lim = amp * 1.35;
    if (max > lim) for (const p of pts) p.multiplyScalar(lim / max);
    return pts;
  };

  // Sister chromatids are copies: same path, slightly offset, with their own fine wiggle.
  CD.sisterCoil = function (base, rnd) {
    const off = CD.randUnit(rnd).multiplyScalar(0.07);
    const ph = [rnd() * TAU, rnd() * TAU, rnd() * TAU];
    const n = base.length - 1;
    return base.map((p, i) => {
      const t = i / n;
      return new V3(
        p.x + off.x + Math.sin(t * 37 + ph[0]) * 0.035,
        p.y + off.y + Math.sin(t * 41 + ph[1]) * 0.035,
        p.z + off.z + Math.sin(t * 33 + ph[2]) * 0.035
      );
    });
  };

  // ---------------------------------------------------------------- dynamic tube
  // A tube swept along a polyline with per-sample radius; rebuilt every frame.
  class Tube {
    constructor(nPts, nRad, material) {
      this.n = nPts;
      this.m = nRad;
      const count = nPts * nRad;
      this.position = new Float32Array(count * 3);
      this.normal = new Float32Array(count * 3);
      this.color = new Float32Array(count * 3).fill(1);

      const idx = [];
      for (let i = 0; i < nPts - 1; i++) {
        for (let j = 0; j < nRad; j++) {
          const a = i * nRad + j;
          const b = i * nRad + ((j + 1) % nRad);
          const c = (i + 1) * nRad + j;
          const d = (i + 1) * nRad + ((j + 1) % nRad);
          idx.push(a, b, c, b, d, c);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setIndex(idx);
      this.posAttr = new THREE.BufferAttribute(this.position, 3).setUsage(THREE.DynamicDrawUsage);
      this.norAttr = new THREE.BufferAttribute(this.normal, 3).setUsage(THREE.DynamicDrawUsage);
      this.colorAttr = new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('position', this.posAttr);
      g.setAttribute('normal', this.norAttr);
      g.setAttribute('color', this.colorAttr);
      this.geometry = g;

      this.mesh = new THREE.Mesh(g, material);
      this.mesh.frustumCulled = false;

      this.cum = new Float32Array(nPts);
      this.T = new Float32Array(nPts * 3);
      this.N = new Float32Array(nPts * 3);
      this.B = new Float32Array(nPts * 3);
      this.cos = new Float32Array(nRad);
      this.sin = new Float32Array(nRad);
      for (let j = 0; j < nRad; j++) {
        this.cos[j] = Math.cos((j / nRad) * TAU);
        this.sin[j] = Math.sin((j / nRad) * TAU);
      }
    }

    // Cumulative arc length along pts; returns total length.
    measure(pts) {
      const cum = this.cum;
      cum[0] = 0;
      for (let i = 1; i < this.n; i++) cum[i] = cum[i - 1] + pts[i].distanceTo(pts[i - 1]);
      return cum[this.n - 1];
    }

    setRingColor(i, c) {
      const m = this.m;
      const col = this.color;
      for (let j = 0; j < m; j++) {
        const o = (i * m + j) * 3;
        col[o] = c.r;
        col[o + 1] = c.g;
        col[o + 2] = c.b;
      }
    }

    // Requires measure(pts) to have been called for the same points.
    update(pts, radii) {
      const n = this.n;
      const m = this.m;
      const T = this.T;
      const N = this.N;
      const B = this.B;

      // tangents
      for (let i = 0; i < n; i++) {
        const a = pts[i > 0 ? i - 1 : 0];
        const b = pts[i < n - 1 ? i + 1 : n - 1];
        let tx = b.x - a.x;
        let ty = b.y - a.y;
        let tz = b.z - a.z;
        const l = Math.sqrt(tx * tx + ty * ty + tz * tz);
        const o = i * 3;
        if (l < 1e-9) {
          if (i > 0) {
            tx = T[o - 3];
            ty = T[o - 2];
            tz = T[o - 1];
          } else {
            tx = 0;
            ty = 1;
            tz = 0;
          }
        } else {
          tx /= l;
          ty /= l;
          tz /= l;
        }
        T[o] = tx;
        T[o + 1] = ty;
        T[o + 2] = tz;
      }

      // parallel-transport frames
      for (let i = 0; i < n; i++) {
        const o = i * 3;
        const tx = T[o];
        const ty = T[o + 1];
        const tz = T[o + 2];
        let nx, ny, nz;
        if (i === 0) {
          nx = ny = nz = 0;
        } else {
          nx = N[o - 3];
          ny = N[o - 2];
          nz = N[o - 1];
          const d = nx * tx + ny * ty + nz * tz;
          nx -= tx * d;
          ny -= ty * d;
          nz -= tz * d;
        }
        let l = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (l < 1e-6) {
          // cross(T, axis)
          if (Math.abs(tx) < 0.9) {
            nx = 0;
            ny = tz;
            nz = -ty;
          } else {
            nx = -tz;
            ny = 0;
            nz = tx;
          }
          l = Math.sqrt(nx * nx + ny * ny + nz * nz);
        }
        nx /= l;
        ny /= l;
        nz /= l;
        N[o] = nx;
        N[o + 1] = ny;
        N[o + 2] = nz;
        B[o] = ty * nz - tz * ny;
        B[o + 1] = tz * nx - tx * nz;
        B[o + 2] = tx * ny - ty * nx;
      }

      const P = this.position;
      const NR = this.normal;
      const cum = this.cum;
      const cs = this.cos;
      const sn = this.sin;
      for (let i = 0; i < n; i++) {
        const o = i * 3;
        const r = radii[i];
        const i0 = i > 0 ? i - 1 : i;
        const i1 = i < n - 1 ? i + 1 : i;
        const ds = cum[i1] - cum[i0];
        const drds = ds > 1e-9 ? (radii[i1] - radii[i0]) / ds : 0;
        const px = pts[i].x;
        const py = pts[i].y;
        const pz = pts[i].z;
        for (let j = 0; j < m; j++) {
          const rx = N[o] * cs[j] + B[o] * sn[j];
          const ry = N[o + 1] * cs[j] + B[o + 1] * sn[j];
          const rz = N[o + 2] * cs[j] + B[o + 2] * sn[j];
          const v = (i * m + j) * 3;
          P[v] = px + rx * r;
          P[v + 1] = py + ry * r;
          P[v + 2] = pz + rz * r;
          let qx = rx - T[o] * drds;
          let qy = ry - T[o + 1] * drds;
          let qz = rz - T[o + 2] * drds;
          const ql = Math.sqrt(qx * qx + qy * qy + qz * qz) || 1;
          NR[v] = qx / ql;
          NR[v + 1] = qy / ql;
          NR[v + 2] = qz / ql;
        }
      }
      this.posAttr.needsUpdate = true;
      this.norAttr.needsUpdate = true;
    }
  }
  CD.Tube = Tube;
})(window.CD);
