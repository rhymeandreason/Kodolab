/* Animals and animal products at bench scale. A hen's egg, from the EggLab prototype.
 *
 *   const egg = makeEgg(mat);
 *   egg.setShell(d)                 // 0 whole shell … 1 dissolved (eaten away in patches)
 *   egg.setShape({ swell, wrinkle, sag })   // each 0..1: swollen taut, or shrivelled and slumped
 *   egg.setSize(s)                  // linear scale of the shell-less egg; s³ is its volume ratio
 *   egg.bottom()                    // cm from the centre down to the lowest point: rest it at y = floor + bottom()
 *   egg.halfLength()                // cm from the centre to the blunt end, along local x
 *
 * Origin: the egg's CENTRE, lying on its side with its long axis along local x (an egg
 * rests that way). 5.7 × 4.3 cm, a large hen's egg.
 *
 * The shell-less egg is the shell membranes: a translucent, rubbery bag with the yolk
 * showing through. Shape and shell are posed by uniforms and a CPU reshape, never by
 * mutating a material's own fields, so its meshes skip the hover glow (`noHL`): the glow's
 * material copy would not follow. */
import * as THREE from 'three';
import { mesh } from '../core/geometry.js';
import { toLinear } from '../materials.js';

const K = 4.9;            // the shape below is in units of 0.58 = half the long axis; K takes it to cm
const lerp = (a, b, t) => a + (b - a) * t;

function hash3(x, y, z) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let xf = x - xi, yf = y - yi, zf = z - zi;
  xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf); zf = zf * zf * (3 - 2 * zf);
  const c = (a, b, d) => hash3(xi + a, yi + b, zi + d);
  const x00 = lerp(c(0, 0, 0), c(1, 0, 0), xf), x10 = lerp(c(0, 1, 0), c(1, 1, 0), xf);
  const x01 = lerp(c(0, 0, 1), c(1, 0, 1), xf), x11 = lerp(c(0, 1, 1), c(1, 1, 1), xf);
  return lerp(lerp(x00, x10, yf), lerp(x01, x11, yf), zf);
}

const NOISE_GLSL = `
float h31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn3(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm3(vec3 p){ return 0.5 * vn3(p) + 0.3 * vn3(p * 2.13) + 0.2 * vn3(p * 4.37); }
`;

/* Ridged noise for the wrinkles, sampled at each vertex direction and two tangent offsets,
 * so a reshape gets finite-difference normals without recomputing the whole mesh's. */
function wrinkleTerm(x, y, z) {
  const r1 = 1 - Math.abs(2 * vnoise(x * 3.1 + 11.3, y * 2.3 + 3.1, z * 3.1 + 7.7) - 1);
  const r2 = 1 - Math.abs(2 * vnoise(x * 6.6 + 1.7, y * 5.2 + 5.2, z * 6.6 + 9.4) - 1);
  const lump = vnoise(x * 1.7 + 4.1, y * 1.4 + 0.3, z * 1.7 + 2.9) - 0.5;
  return Math.pow(r1, 5) * 0.15 + Math.pow(r2, 5) * 0.075 + lump * 0.11 + 0.035;
}

let EGG = null;   // directions and wrinkle samples, shared by every egg
function eggData() {
  if (EGG) return EGG;
  const geo = new THREE.SphereGeometry(1, 112, 76);
  const p = geo.attributes.position, n = p.count;
  const D = new Float32Array(n * 9), W = new Float32Array(n * 3);
  const d = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), q = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), alt = new THREE.Vector3(1, 0, 0), e = 0.012;
  for (let i = 0; i < n; i++) {
    d.fromBufferAttribute(p, i).normalize();
    t1.crossVectors(Math.abs(d.y) > 0.99 ? alt : up, d).normalize();
    t2.crossVectors(d, t1).normalize();
    for (let j = 0; j < 3; j++) {
      q.copy(d);
      if (j === 1) q.addScaledVector(t1, e).normalize();
      if (j === 2) q.addScaledVector(t2, e).normalize();
      D.set([q.x, q.y, q.z], i * 9 + j * 3);
      W[i * 3 + j] = wrinkleTerm(q.x, q.y, q.z);
    }
  }
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
  EGG = { geo, D, W, n };
  return EGG;
}

/* The surface point for unit direction d. Shape-local +y is the long axis (the blunt end is
 * -y); +x is up once the egg lies on its side, so `sag` flattens the top. */
function eggF(dx, dy, dz, w, P, o) {
  const k = 0.74 * (1 - 0.13 * dy) * (1 + 0.07 * P.swell);
  let x = dx * k, y = dy * (1 - 0.025 * P.swell), z = dz * k;
  const m = 1 - P.wrinkle * w;
  x *= m; y *= m; z *= m;
  if (P.sag > 0 && dx > 0) x -= P.sag * 0.19 * dx * dx * (1 - 0.4 * dy * dy);
  o[0] = x * 0.58; o[1] = y * 0.58; o[2] = z * 0.58;
}
const _a = [0, 0, 0], _b = [0, 0, 0], _c = [0, 0, 0];
function shapeEgg(geo, P) {
  const pos = geo.attributes.position.array, nor = geo.attributes.normal.array;
  const { D, W, n } = eggData();
  for (let i = 0; i < n; i++) {
    const i9 = i * 9, i3 = i * 3;
    eggF(D[i9], D[i9 + 1], D[i9 + 2], W[i3], P, _a);
    eggF(D[i9 + 3], D[i9 + 4], D[i9 + 5], W[i3 + 1], P, _b);
    eggF(D[i9 + 6], D[i9 + 7], D[i9 + 8], W[i3 + 2], P, _c);
    const ux = _b[0] - _a[0], uy = _b[1] - _a[1], uz = _b[2] - _a[2];
    const vx = _c[0] - _a[0], vy = _c[1] - _a[1], vz = _c[2] - _a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    let len = Math.hypot(nx, ny, nz) || 1;
    if (nx * _a[0] + ny * _a[1] + nz * _a[2] < 0) len = -len;
    pos[i3] = _a[0]; pos[i3 + 1] = _a[1]; pos[i3 + 2] = _a[2];
    nor[i3] = nx / len; nor[i3 + 1] = ny / len; nor[i3 + 2] = nz / len;
  }
  geo.attributes.position.needsUpdate = true;
  geo.attributes.normal.needsUpdate = true;
  geo.computeBoundingBox();
}

let SHELL_GEO = null;
function shellGeo() {
  if (SHELL_GEO) return SHELL_GEO;
  SHELL_GEO = eggData().geo.clone();
  shapeEgg(SHELL_GEO, { wrinkle: 0, sag: 0, swell: 0 });
  SHELL_GEO.userData.shared = true;
  return SHELL_GEO;
}

/* Brown shell, satin, faintly mottled. uDissolve eats it away in noise patches with a
 * chalky white rim, the way acid etches calcium carbonate unevenly. */
function shellMaterial(mat, color) {
  const u = { uDissolve: { value: 0 } };
  const m = mat.make.standard({ color: toLinear(color), roughness: 0.52, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uDissolve = u.uDissolve;
    sh.vertexShader = 'varying vec3 vLocal;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vLocal = position;');
    sh.fragmentShader = 'varying vec3 vLocal;\nuniform float uDissolve;\n' + NOISE_GLSL +
      sh.fragmentShader.replace('#include <alphatest_fragment>', `
        #include <alphatest_fragment>
        float nz = fbm3(vLocal * 3.4 + vec3(1.7, 4.2, 0.3));
        float th = uDissolve < 0.001 ? -1.0 : mix(0.2, 0.82, uDissolve);
        float ed = nz - th;
        if (ed < 0.0) discard;
        float rim = 1.0 - smoothstep(0.0, 0.04, ed);
        float mott = fbm3(vLocal * 2.4 + vec3(7.1, 2.3, 5.9));
        diffuseColor.rgb *= mix(0.93, 1.05, mott);
        diffuseColor.rgb = mix(diffuseColor.rgb * (1.0 - 0.18 * uDissolve), vec3(1.0, 0.995, 0.97), rim);`);
  };
  m.customProgramCacheKey = () => 'egg-shell';
  m.userData.u = u;
  return m;
}

/* The membranes: translucent in the middle, denser at the silhouette, tinted by the yolk.
 * uTint and uRough carry the colour and finish a shape change brings. */
function membraneMaterial(mat) {
  const u = { uCenter: { value: 0.66 }, uTint: { value: new THREE.Color(toLinear('#efdcb4')) } };
  const m = mat.make.standard({ color: 0xffffff, roughness: 0.32, metalness: 0, transparent: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uCenter = u.uCenter; sh.uniforms.uTint = u.uTint;
    sh.fragmentShader = 'uniform float uCenter; uniform vec3 uTint;\n' +
      sh.fragmentShader
        .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= uTint;')
        .replace('#include <dithering_fragment>', `
        float fm = pow(1.0 - clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), 1.6);
        gl_FragColor.rgb += 0.05 * (1.0 - fm) * vec3(1.0, 0.78, 0.42);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.74, 0.58, 0.38), fm * 0.55);
        gl_FragColor.a = mix(uCenter, 1.0, fm);
        #include <dithering_fragment>`);
  };
  m.customProgramCacheKey = () => 'egg-membrane';
  m.userData.u = u;
  return m;
}

const TINT = { base: new THREE.Color(toLinear('#efdcb4')), dry: new THREE.Color(toLinear('#dfb978')), taut: new THREE.Color(toLinear('#f3e4c4')) };

/** A hen's egg (see the header). shell: the shell colour. */
export function makeEgg(mat, { shell: shellColor = '#d29d6c' } = {}) {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  inner.rotation.z = Math.PI / 2;      // long axis (shape +y) along -x, shape +x up
  inner.scale.setScalar(K);
  g.add(inner);

  const shellMat = shellMaterial(mat, shellColor);
  const shell = mesh(shellGeo(), shellMat);
  const bodyGeo = eggData().geo.clone();
  bodyGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
  shapeEgg(bodyGeo, { wrinkle: 0, sag: 0, swell: 0 });
  const bodyMat = membraneMaterial(mat);
  const body = mesh(bodyGeo, bodyMat, { receive: false });
  body.renderOrder = 0;   // transparent, inside a liquid: drawn before the liquid (1) tints it
  const yolk = mesh(new THREE.SphereGeometry(1, 40, 28), mat.make.standard({
    color: toLinear('#f6a623'), roughness: 0.45, emissive: toLinear('#c2410c'), emissiveIntensity: 0.18,
  }), { cast: false });
  yolk.position.set(0, -0.045, 0);
  body.add(yolk);
  inner.add(shell, body);
  [shell, body, yolk].forEach((m) => { m.userData.noHL = true; });

  const P = { wrinkle: 0, sag: 0, swell: 0 };
  let size = 1, dissolve = 0;
  const api = {
    group: g, shell, body, yolk,
    anchors: { top: new THREE.Vector3(0, 0.429 * K, 0) },
    setShell(d) {
      dissolve = d;
      shellMat.userData.u.uDissolve.value = d;
      shell.visible = d < 0.999;
      body.visible = d > 0.002;
      return api;
    },
    /** swell, wrinkle, sag 0..1. Reshapes the mesh only when the shape has moved. */
    setShape({ swell = 0, wrinkle = 0, sag = 0 }) {
      if (Math.abs(swell - P.swell) + Math.abs(wrinkle - P.wrinkle) + Math.abs(sag - P.sag) > 0.0008) {
        Object.assign(P, { swell, wrinkle, sag });
        shapeEgg(bodyGeo, P);
      }
      // taut and glassy when swollen; duller, thicker and darker when it has lost water
      const u = bodyMat.userData.u;
      u.uCenter.value = 0.66 - 0.1 * swell + 0.2 * wrinkle;
      bodyMat.roughness = 0.32 - 0.18 * swell + 0.18 * wrinkle;
      u.uTint.value.copy(TINT.base).lerp(TINT.dry, wrinkle).lerp(TINT.taut, swell);
      return api;
    },
    setSize(s) {
      size = s;
      body.scale.setScalar(s);
      yolk.scale.setScalar(0.205 / s);            // the yolk keeps its size; the white takes the water
      shell.scale.setScalar(Math.max(1, s) * 1.012);
      return api;
    },
    bottom: () => 0.429 * K * (dissolve < 0.999 ? Math.max(1, size) * 1.012 : size) * (1 + 0.07 * P.swell) * (1 - 0.035 * P.wrinkle),
    halfLength: () => 0.58 * K * (dissolve < 0.999 ? Math.max(1, size) : size),
  };
  api.setSize(1);
  return api;
}
