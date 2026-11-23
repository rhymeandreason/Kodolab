/* Helpers for the cell and molecule scenes, ported from the original Strawberry
 * lab (/Strawberry/js/utils.js). Sim-local: the bench uses Lab instead.
 * Colours here go through C(), which converts from sRGB like the original. */
import * as THREE from 'three';
import { srgb } from '../core/three-compat.js';

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const easeIn = (t) => t * t * t;
export const linear = (t) => t;
export const smooth = (t) => t * t * (3 - 2 * t);
// progress of t inside [a, b], eased
export const ph = (t, a, b, ease = easeInOut) => ease(clamp((t - a) / (b - a)));
// rises over [a, b], falls over [c, d]
export const win = (t, a, b, c, d) => ph(t, a, b) * (1 - ph(t, c, d));

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const C = (hex) => new THREE.Color(hex).convertSRGBToLinear();
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export function randDir(r, out = new THREE.Vector3()) {
  const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
  return out.set(s * Math.cos(a), u, s * Math.sin(a));
}
export function fibSphere(i, n, out = new THREE.Vector3()) {
  const y = 1 - (2 * (i + 0.5)) / n;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const a = i * 2.399963;
  return out.set(Math.cos(a) * r, y, Math.sin(a) * r);
}


/* ---------- textures ---------- */
export function makeTexture(draw, w = 256, h = 256) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  srgb(tex);
  tex.anisotropy = 4;
  return tex;
}

let _dot = null;
export function dotTexture() {
  if (_dot) return _dot;
  _dot = makeTexture((ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, 64, 64);
  return _dot;
}

/* ---------- geometry ---------- */
// Merge geometries (non-indexed) and paint each with a vertex color.
export function mergeColored(parts) {
  const pos = [], nor = [], col = [];
  parts.forEach(({ geo, color }) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    const c = C(color);
    for (let i = 0; i < p.length; i += 3) {
      pos.push(p[i], p[i + 1], p[i + 2]);
      nor.push(n[i], n[i + 1], n[i + 2]);
      col.push(c.r, c.g, c.b);
    }
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

export function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/* ---------- materials ---------- */
// Clear glass / plastic with a fresnel rim so edges read well on a light background.
export function makeGlass(o = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: C(o.color || '#ffffff'),
    metalness: 0,
    roughness: o.roughness != null ? o.roughness : 0.06,
    transparent: true,
    opacity: o.opacity != null ? o.opacity : 0.14,
    side: THREE.DoubleSide,
    depthWrite: false,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: o.env != null ? o.env : 1.4,
  });
  const rim = { value: o.rim != null ? o.rim : 0.5 };
  m.userData.rim = rim;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = rim;
    sh.fragmentShader = 'uniform float uRim;\n' + sh.fragmentShader.replace(
      '#include <dithering_fragment>',
      'float fres = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 3.0);\n' +
      'gl_FragColor.a = clamp(gl_FragColor.a + fres * uRim, 0.0, 1.0);\n' +
      '#include <dithering_fragment>'
    );
  };
  return m;
}

const NOISE_GLSL = `
  float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vn3(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm3(vec3 p){ return 0.6 * vn3(p) + 0.3 * vn3(p * 2.03 + 7.1) + 0.1 * vn3(p * 4.1 + 3.3); }
`;

// Membrane material that can dissolve away with a glowing noisy edge.
export function makeDissolve(params, o = {}) {
  const m = new THREE.MeshPhysicalMaterial(params);
  const u = {
    uDissolve: { value: 0 },
    uEdge: { value: C(o.edge || '#ffffff') },
    uNScale: { value: o.scale || 2.0 },
  };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'varying vec3 vObjPos;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;'
    );
    sh.fragmentShader = 'uniform float uDissolve;\nuniform vec3 uEdge;\nuniform float uNScale;\nvarying vec3 vObjPos;\n' + NOISE_GLSL +
      sh.fragmentShader
        .replace('#include <clipping_planes_fragment>',
          '#include <clipping_planes_fragment>\nfloat dn = fbm3(vObjPos * uNScale);\nif (dn < uDissolve) discard;')
        .replace('#include <dithering_fragment>',
          'float edgeK = (1.0 - smoothstep(0.0, 0.07, dn - uDissolve)) * step(0.001, uDissolve);\n' +
          'gl_FragColor.rgb = mix(gl_FragColor.rgb, uEdge, edgeK);\n' +
          'gl_FragColor.a = max(gl_FragColor.a, edgeK * 0.9);\n#include <dithering_fragment>');
  };
  return m;
}
