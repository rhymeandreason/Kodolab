/* Serology, from BloodType: a three-well typing tray whose wells draw blood, antiserum
 * and agglutination; plastic stir sticks; the cup they stand in. Origins at the centre of the base. */
import * as THREE from 'three';
import { V2, V3 } from '../core/math.js';
import { makeCanvas, canvasTex, roundRect, FONT } from '../core/canvas.js';
import { mesh, roundedRectShape } from '../core/geometry.js';
import { seeded } from '../core/random.js';
import { toLinear } from '../materials.js';

export const TRAY_W = 15, TRAY_D = 6.2, WELL_R = 1.8;
const WELL_X = [-4.6, 0, 4.6];
const WELL_Z = -0.5;          // well centres sit behind the tray's middle; letters go in front
const FLOOR_Y = 0.46, TRAY_TOP = 1.07;

const LIQ_VERT = `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`;
/* One well's contents, from five numbers: blood and serum present (0/1), how far they are
 * stirred together (uMixed), how far the red cells have clumped (uClump), and a swirl angle.
 * Clumps are two octaves of Worley cells whose threshold grows with uClump: agglutinated
 * red cells in a pale serum. */
const LIQ_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform float uBlood, uSerum, uMixed, uClump, uSwirl, uSeed, uScale, uTime;
  uniform vec3 uSerumColor;

  vec2 hash2(vec2 p){ p = vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3))); return fract(sin(p)*43758.5453); }
  float hash1(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    float a = hash1(i), b = hash1(i+vec2(1.0,0.0)), c = hash1(i+vec2(0.0,1.0)), d = hash1(i+vec2(1.0,1.0));
    return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
  }
  float worley(vec2 p){
    vec2 n = floor(p), f = fract(p); float md = 8.0;
    for(int j=-1;j<=1;j++){ for(int i=-1;i<=1;i++){
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash2(n + g + uSeed);
      o = 0.5 + 0.4*sin(6.2831*o);
      vec2 r = g + o - f; md = min(md, dot(r,r));
    }}
    return sqrt(md);
  }

  void main(){
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    if (r > 1.0) discard;
    float ang = uSwirl * (1.2 - r);
    float cs = cos(ang), sn = sin(ang);
    vec2 q = vec2(cs*p.x - sn*p.y, sn*p.x + cs*p.y);
    vec3 blood = vec3(0.52, 0.02, 0.05);
    vec3 col; float alpha = 1.0;

    if (uBlood < 0.5) {
      col = uSerumColor * mix(0.80, 1.0, smoothstep(1.0, 0.35, r));
      alpha = 0.8;
    } else {
      col = blood + vec3(0.07, 0.0, 0.01) * vnoise(q*5.0 + uSeed);
      vec2 bo = q - vec2(0.34, -0.30);
      float blob = (1.0 - smoothstep(0.28, 0.52, length(bo))) * uSerum * (1.0 - uMixed);
      col = mix(col, mix(uSerumColor, blood, 0.22), blob * 0.88);
      float streak = sin(atan(q.y, q.x) * 3.0 + r * 9.0) * 0.5 + 0.5;
      col = mix(col, mix(col, uSerumColor, 0.35), streak * uSerum * uMixed * (1.0 - uMixed) * 2.0);
      col = mix(col, col * 0.84 + uSerumColor * 0.13, uSerum * uMixed);

      float c = uClump;
      if (c > 0.001) {
        vec2 drift = vec2(sin(uTime*0.35 + uSeed), cos(uTime*0.29 + uSeed)) * 0.012 * c;
        float ra = uSwirl * 0.12;
        vec2 qr = vec2(cos(ra)*p.x - sin(ra)*p.y, sin(ra)*p.x + cos(ra)*p.y);
        vec2 qs = (qr + drift) * uScale;
        float w1 = worley(qs);
        float w2 = worley(qs * 2.15 + 7.3);
        float t1 = max(0.003, 0.37 * c);
        float t2 = max(0.003, 0.27 * c);
        float m1 = 1.0 - smoothstep(t1 * 0.68, t1, w1);
        float m2 = (1.0 - smoothstep(t2 * 0.62, t2, w2)) * 0.92;
        float m = max(m1, m2);
        vec3 serumBg = mix(vec3(0.97, 0.74, 0.66), uSerumColor, 0.30);
        vec3 bg = mix(col, serumBg, 0.84 * c);
        float speck = step(0.9, hash1(floor(qr * 70.0) + uSeed)) * c * 0.55;
        bg = mix(bg, blood * 1.15, speck);
        float depth = clamp(1.0 - w1 / t1, 0.0, 1.0);
        vec3 clumpCol = mix(vec3(0.34, 0.01, 0.04), vec3(0.60, 0.04, 0.08), depth * 0.7);
        clumpCol *= 0.85 + 0.3 * vnoise(qs * 3.0);
        float wl = worley(qs + vec2(0.10, -0.10));
        float hl = (1.0 - smoothstep(0.0, t1 * 0.5, wl)) * m1;
        clumpCol += vec3(0.5, 0.3, 0.3) * hl * 0.55;
        col = mix(bg, clumpCol, m);
      }
    }
    col *= mix(0.78, 1.0, smoothstep(1.0, 0.5, r));
    vec2 sp = (p - vec2(-0.32, 0.40)) * vec2(1.0, 1.7);
    col += vec3(1.0) * exp(-dot(sp, sp) * 7.0) * 0.20;
    float rim = smoothstep(0.82, 0.94, r) * (1.0 - smoothstep(0.94, 1.0, r)) * max(0.0, dot(normalize(p + 1e-5), vec2(-0.6, 0.8)));
    col += vec3(1.0) * rim * 0.32;
    alpha *= 1.0 - smoothstep(0.95, 1.0, r);
    gl_FragColor = vec4(col, alpha);
  }
`;

const lin3 = (hex) => { const c = new THREE.Color(hex); return V3(c.r, c.g, c.b); };

function trayTexture(letters) {
  const w = 1200, h = Math.round(1200 * TRAY_D / TRAY_W);
  const c = makeCanvas(w, h); const x = c.getContext('2d');
  x.fillStyle = '#fbfcfd'; x.fillRect(0, 0, w, h);
  const px = w / TRAY_W;
  const at = (tx, ty) => [(tx / TRAY_W + 0.5) * w, (0.5 - ty / TRAY_D) * h];
  WELL_X.forEach((wx, i) => {
    const [cx, cy] = at(wx, -WELL_Z);
    x.strokeStyle = 'rgba(30,40,60,0.18)'; x.lineWidth = 3;
    x.beginPath(); x.arc(cx, cy, (WELL_R + 0.62) * px, 0, Math.PI * 2); x.stroke();
    const [lx, ly] = at(wx, -2.32);
    x.fillStyle = '#2a3348'; x.font = `800 78px ${FONT}`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(letters[i], lx, ly);
  });
  const t = canvasTex(c);
  t.repeat.set(1 / TRAY_W, 1 / TRAY_D);
  t.offset.set(0.5, 0.5);
  return t;
}

/** White plastic typing tray, 15 × 6.2 cm, three wells lettered A, B, Rh. name/color: a strip
 *  of lab tape in front naming whose blood it holds (omit name for none). serum: each well's
 *  antiserum colour, picked hex. wells[i] = { anchor, set({ blood, serum, mixed, clump, swirl }),
 *  setRing(opacity) } (ring = a red highlight round the well); anchors.floor = the middle well's floor. */
export function makeTypingTray(mat, { name, color = '#e0559a', letters = ['A', 'B', 'Rh'], serum = ['#3875f5', '#fccc24', '#ccf0de'], seed = 1 } = {}) {
  const rnd = seeded(seed);
  const g = new THREE.Group();
  const white = mat.make.physical({ color: 0xffffff, roughness: 0.32, clearcoat: 0.35, clearcoatRoughness: 0.3 });
  const baseGeo = new THREE.ExtrudeGeometry(roundedRectShape(TRAY_W, TRAY_D, 1.1), { depth: 0.3, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2, curveSegments: 20 });
  baseGeo.rotateX(-Math.PI / 2);
  const base = mesh(baseGeo, white); base.position.y = 0.08;
  g.add(base);

  const shape = roundedRectShape(TRAY_W, TRAY_D, 1.1);
  WELL_X.forEach((wx) => { const h = new THREE.Path(); h.absarc(wx, -WELL_Z, WELL_R, 0, Math.PI * 2, true); shape.holes.push(h); });
  const topGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.42, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 3, curveSegments: 48 });
  topGeo.rotateX(-Math.PI / 2);
  const printed = mat.make.physical({ color: 0xffffff, map: trayTexture(letters), roughness: 0.32, clearcoat: 0.35, clearcoatRoughness: 0.3 });
  const top = mesh(topGeo, [printed, white]); top.position.y = 0.53;
  g.add(top);

  if (name) {
    const c = makeCanvas(512, 150); const x = c.getContext('2d');
    x.fillStyle = '#ffffff'; roundRect(x, 0, 0, 512, 150, 18); x.fill();
    x.fillStyle = color; x.fillRect(0, 0, 30, 150);
    x.fillStyle = '#141b2d'; x.font = `800 64px ${FONT}`; x.textBaseline = 'middle'; x.textAlign = 'left';
    x.fillText(name, 62, 77);
    const tag = mesh(new THREE.PlaneGeometry(6.6, 6.6 * 150 / 512), mat.make.standard({ map: canvasTex(c), roughness: 0.7, transparent: true }), { cast: false });
    tag.rotation.set(-Math.PI / 2, 0, (rnd() - 0.5) * 0.06);
    tag.position.set(0, 0.05, TRAY_D / 2 + 2.6);
    tag.userData.noSketch = true;
    g.add(tag);
  }

  const floorMat = mat.make.solid(0xe9edf2, 0.4);
  const floorGeo = new THREE.CircleGeometry(WELL_R + 0.05, 48);
  const liqGeo = new THREE.CircleGeometry(WELL_R - 0.1, 64);
  const ringGeo = new THREE.RingGeometry(WELL_R + 0.12, WELL_R + 0.48, 56);
  const wells = WELL_X.map((wx, i) => {
    const floor = mesh(floorGeo, floorMat, { cast: false });
    floor.rotation.x = -Math.PI / 2; floor.position.set(wx, FLOOR_Y + 0.004, WELL_Z);
    const u = {
      uBlood: { value: 0 }, uSerum: { value: 0 }, uMixed: { value: 0 }, uClump: { value: 0 },
      uSwirl: { value: 0 }, uSeed: { value: rnd() * 50 }, uScale: { value: i === 2 ? 5.6 : 4.2 },
      uTime: { value: 0 }, uSerumColor: { value: lin3(serum[i]) },
    };
    const liq = new THREE.Mesh(liqGeo, new THREE.ShaderMaterial({ vertexShader: LIQ_VERT, fragmentShader: LIQ_FRAG, uniforms: u, transparent: true, depthWrite: false }));
    liq.rotation.x = -Math.PI / 2; liq.position.set(wx, FLOOR_Y + 0.03, WELL_Z);
    liq.renderOrder = 2; liq.visible = false;
    liq.userData.noHL = true; liq.userData.noSketch = true;
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xe0334b, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(wx, TRAY_TOP + 0.015, WELL_Z);
    ring.renderOrder = 4; ring.visible = false; ring.userData.noSketch = true; ring.userData.noHL = true;
    g.add(floor, liq, ring);
    return {
      key: letters[i], liq, uniforms: u,
      anchor: V3(wx, FLOOR_Y, WELL_Z),
      /** amount: 0..1 grows the puddle from a drop to the full well. */
      set({ blood, serum: s, mixed, clump, swirl, amount, time } = {}) {
        if (blood !== undefined) u.uBlood.value = blood ? 1 : 0;
        if (s !== undefined) u.uSerum.value = s ? 1 : 0;
        if (mixed !== undefined) u.uMixed.value = mixed;
        if (clump !== undefined) u.uClump.value = clump;
        if (swirl !== undefined) u.uSwirl.value = swirl;
        if (time !== undefined) u.uTime.value = time;
        const a = amount ?? ((u.uBlood.value || u.uSerum.value) ? 1 : 0);
        liq.visible = a > 0.001;
        liq.scale.setScalar(Math.max(0.001, a));
      },
      setRing(o) { ring.material.opacity = o; ring.visible = o > 0.001; },
    };
  });
  return { group: g, wells, anchors: { floor: V3(0, FLOOR_Y, WELL_Z), top: V3(0, TRAY_TOP, WELL_Z) }, w: TRAY_W, d: TRAY_D };
}

const STICK_H = 9.1;
/** Flat plastic stir stick, 9.1 cm, standing on its working end. anchors.tip = that end;
 *  setTip(hex | null) stains the end (blood on it), null = clean. */
export function makeStirStick(mat, { color = '#ff6b81' } = {}) {
  const g = new THREE.Group();
  const m = mat.make.physical({ color: toLinear(color), roughness: 0.35, clearcoat: 0.4 });
  const bodyGeo = new THREE.BoxGeometry(0.5, STICK_H - 0.9, 0.12); bodyGeo.translate(0, 0.9 + (STICK_H - 0.9) / 2, 0);
  const tipGeo = new THREE.BoxGeometry(0.5, 0.9, 0.125); tipGeo.translate(0, 0.45, 0);
  const tipMat = m.clone();
  g.add(mesh(bodyGeo, m), mesh(tipGeo, tipMat));
  const clean = tipMat.color.clone();
  return {
    group: g, anchors: { tip: V3(0, 0, 0), end: V3(0, STICK_H, 0) }, h: STICK_H,
    setTip(hex) { tipMat.color.copy(hex == null ? clean : new THREE.Color(toLinear(hex))); },
  };
}

export const STICK_COLORS = ['#ff6b81', '#4dabf7', '#ffd43b', '#51cf66', '#b197fc', '#ffa94d'];

/** White cup of stir sticks with a red band, 4.8 cm. sticks[] are the stir-stick props
 *  standing in it (lift one out with root.attach(stick.group)); count, seed set the bunch. */
export function makeStickCup(mat, { count = 11, colors = STICK_COLORS, band = '#e0334b', seed = 2 } = {}) {
  const rnd = seeded(seed);
  const g = new THREE.Group();
  const cup = mesh(new THREE.LatheGeometry([[0, 0], [1.95, 0], [2.15, 0.15], [2.45, 4.8], [2.25, 4.8], [1.95, 0.45], [0, 0.45]].map((p) => V2(p[0], p[1])), 48),
    mat.make.physical({ color: 0xffffff, roughness: 0.25, clearcoat: 0.6, side: THREE.DoubleSide }));
  const ring = mesh(new THREE.CylinderGeometry(2.33, 2.22, 0.9, 48, 1, true), mat.make.solid(toLinear(band), 0.5), { cast: false });
  ring.position.y = 2.9;
  g.add(cup, ring);
  const sticks = [];
  for (let i = 0; i < count; i++) {
    const s = makeStirStick(mat, { color: colors[i % colors.length] });
    const a = (i / count) * Math.PI * 2 + rnd() * 0.4;
    const r = 0.4 + rnd() * 0.9;
    s.group.position.set(Math.cos(a) * r, 0.45, Math.sin(a) * r);
    s.group.rotation.set(Math.sin(a) * 0.16, rnd() * Math.PI, -Math.cos(a) * 0.16);
    s.group.scale.y = 0.92 + rnd() * 0.1;
    g.add(s.group);
    sticks.push(s);
  }
  return { group: g, sticks, anchors: { top: V3(0, 4.8, 0), floor: V3(0, 0.45, 0) }, radius: 2.5 };
}
