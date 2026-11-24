/* Microscopy: a glass slide, a coverslip, a square of filter paper and a compound light
 * microscope (all from OnionRoot). Origins at the centre of the base.
 *
 *   const slide = makeSlide(mat, { label: ['Allium', 'root tip'] });
 *   slide.setDrop(k, color)     // a drop of stain on the slide, 0..1 of its size
 *   slide.setSmear(k, color)    // tissue squashed out under the coverslip, 0..1
 *   slide.anchors.top           // centre of the top face, where a specimen goes
 *
 *   const scope = makeMicroscope(mat);
 *   scope.setLamp(0..1)         // the lamp under the stage, and the beam up through it
 *   scope.nose.rotation.y       // the revolving nosepiece; 4× is in place at 0
 *   scope.anchors.stage         // the centre of the stage, where a slide is clipped
 *   scope.anchors.eye           // the eyepoint above the binocular head; anchors.eyeAxis points out of it
 */
import * as THREE from 'three';
import { V2, V3 } from '../core/math.js';
import { mesh, rbox } from '../core/geometry.js';
import { makeCanvas, canvasTex, FONT } from '../core/canvas.js';
import { toLinear } from '../materials.js';

/** A box of w × h × d centred on its origin, with rounded edges. */
function cbox(w, h, d, r) { const g = rbox(w, h, d, r); g.translate(0, -h / 2, 0); return g; }

function softDot() {
  const c = makeCanvas(64, 64), g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/* ------------------------------------------------------------------ slide */

/** Glass microscope slide, 76 × 26 × 1 mm, with a frosted label end (-x). */
export function makeSlide(mat, { label = ['Allium cepa', 'root tip squash'] } = {}) {
  const g = new THREE.Group();
  const T = 0.1;
  const glass = mesh(new THREE.BoxGeometry(7.6, T, 2.6), mat.make.glass({ color: '#e4f2fb', opacity: 0.4 }), { cast: false });
  glass.position.y = T / 2; glass.renderOrder = 3;
  const c = makeCanvas(256, 352), x = c.getContext('2d');
  x.fillStyle = '#f6f6f3'; x.fillRect(0, 0, 256, 352);
  x.textAlign = 'center'; x.fillStyle = '#3a4352';
  x.font = `italic 600 40px ${FONT}`; label[0].split(' ').forEach((w, i) => x.fillText(w, 128, 110 + i * 48));
  x.font = `500 28px ${FONT}`; x.fillStyle = '#7b8596';
  (label[1] || '').split(' ').forEach((w, i) => x.fillText(w, 128, 230 + i * 36));
  const frost = mesh(new THREE.BoxGeometry(1.9, T + 0.006, 2.6), mat.make.standard({ map: canvasTex(c), roughness: 0.95 }), { cast: false });
  frost.position.set(-2.85, T / 2, 0);
  g.add(glass, frost);

  const smear = new THREE.Mesh(new THREE.CircleGeometry(0.6, 40), new THREE.MeshBasicMaterial({ map: softDot(), transparent: true, depthWrite: false }));
  smear.rotation.x = -Math.PI / 2; smear.position.y = T + 0.008; smear.renderOrder = 4; smear.visible = false;
  const drop = mesh(new THREE.SphereGeometry(0.32, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    mat.make.physical({ roughness: 0.04, transparent: true, opacity: 0.55, clearcoat: 1, depthWrite: false }), { cast: false });
  drop.position.y = T; drop.renderOrder = 4; drop.visible = false;
  g.add(smear, drop);
  return {
    group: g, smear, drop,
    anchors: { top: V3(0, T, 0), floor: V3(0, T, 0) },
    thickness: T,
    /** k: 0 (none) … 1 (a full drop); flat: 0 (domed) … 1 (spread thin under a coverslip). */
    setDrop(k, color, flat = 0) {
      drop.visible = k > 0.01;
      if (color !== undefined) drop.material.color.set(color);
      drop.scale.set(k * (1 + 1.6 * flat), 0.5 * k * (1 - 0.85 * flat), k * (1 + 1.6 * flat));
    },
    setSmear(k, color) {
      smear.visible = k > 0.01;
      if (color !== undefined) smear.material.color.set(color);
      smear.scale.setScalar(0.15 + k * 0.85);
      smear.material.opacity = 0.35 + 0.5 * k;
    },
  };
}

/** Glass coverslip, 22 × 22 mm. */
export function makeCoverslip(mat) {
  const g = new THREE.Group();
  const m = mesh(new THREE.BoxGeometry(2.2, 0.025, 2.2), mat.make.glass({ color: '#f2f9ff', opacity: 0.32 }), { cast: false });
  m.position.y = 0.0125; m.renderOrder = 5;
  g.add(m);
  return { group: g, anchors: { top: V3(0, 0.025, 0) } };
}

/** A square of filter paper, 3 cm. setSpot(k, color) shows stain it has soaked up. */
export function makeFilterPaper(mat, { size = 3 } = {}) {
  const g = new THREE.Group();
  const m = mesh(new THREE.BoxGeometry(size, 0.02, size), mat.paper);
  m.position.y = 0.01;
  const spot = new THREE.Mesh(new THREE.CircleGeometry(0.9, 40), new THREE.MeshBasicMaterial({ map: softDot(), transparent: true, opacity: 0, depthWrite: false }));
  spot.rotation.x = -Math.PI / 2; spot.position.y = 0.022;
  g.add(m, spot);
  return {
    group: g, spot,
    anchors: { top: V3(0, 0.02, 0) },
    setSpot(k, color) {
      if (color !== undefined) spot.material.color.set(color);
      spot.material.opacity = Math.min(0.55, k * 0.6);
      spot.scale.setScalar(0.5 + k * 0.7);
    },
  };
}

/* ------------------------------------------------------------- microscope */

/** Compound light microscope, about 40 cm to the eyepieces: lamp in the base, a C-arm with
 *  coaxial focus knobs, a mechanical stage over a condenser, a revolving nosepiece of four
 *  objectives (4×, 10×, 40×, 100× oil) and a binocular head. Moulded-plastic look: chamfered
 *  teal body, slate-blue fittings, a pale grey head. Faces +z. Drawn in a 1/22 scale inner
 *  group, which is the original's unit. */
export function makeMicroscope(mat) {
  const K = 22;
  const g = new THREE.Group();
  const u = new THREE.Group();
  u.scale.setScalar(K);
  g.add(u);
  const std = (hex, roughness, o = {}) => mat.make.standard(Object.assign({ color: toLinear(hex), roughness }, o));
  const SM = {
    body: std('#82bdb3', 0.62),
    slate: std('#4f7b9e', 0.5),
    slateFacet: std('#4f7b9e', 0.5, { flatShading: true }),
    slateDark: std('#3a5d7a', 0.55),
    head: std('#d9dfe5', 0.5),
    headFacet: std('#d9dfe5', 0.5, { flatShading: true }),
    panel: std('#e6eaee', 0.4, { metalness: 0.1 }),
    knurlSteel: std('#d0d4da', 0.28, { metalness: 0.9, flatShading: true }),
    barrel: std('#b9c0c8', 0.3, { metalness: 0.85 }),
    cord: std('#cfd5da', 0.55),
    lensGlass: mat.make.physical({ color: toLinear('#16202e'), roughness: 0.04, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02 }),
    black: mat.make.solid(toLinear('#121418'), 0.6),
  };
  const put = (geo, m, parent, pos, o) => { const x = mesh(geo, m, o); if (pos) x.position.set(pos[0], pos[1], pos[2]); parent.add(x); return x; };
  /** Cylinder with its rim pushed in and out into grip ridges. Axis +Y. */
  function knurl(r, h, ridges, depth, m, parent, y = 0) {
    const geo = new THREE.CylinderGeometry(r, r, h, ridges * 4, 1).toNonIndexed();
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), rr = Math.hypot(x, z);
      if (rr < r * 0.5) continue;
      const j = ((Math.round((Math.atan2(x, z) / (Math.PI * 2)) * ridges * 4) % 4) + 4) % 4;
      const k = j < 2 ? 1 : 1 - depth;
      p.setX(i, (x / rr) * r * k); p.setZ(i, (z / rr) * r * k);
    }
    geo.computeVertexNormals();
    return put(geo, m, parent, [0, y, 0]);
  }
  /** Turned part from [radius, y] points spun around +Y. */
  function turn(pts, m, parent, seg = 32) {
    if (pts[0][1] > pts[pts.length - 1][1]) pts = pts.slice().reverse();   // faces point outward only when y runs upward
    return put(new THREE.LatheGeometry(pts.map(([r, y]) => V2(r, y)), seg), m, parent);
  }
  /** A moulded knob: a short cylinder with chamfered faces, `seg` flat facets round. Axis +Y from y0. */
  function knob(r, h, seg, m, parent, y0 = 0) {
    const c = Math.min(h * 0.25, r * 0.15);
    return turn([[0, y0], [r - c, y0], [r, y0 + c], [r, y0 + h - c], [r - c, y0 + h], [0, y0 + h]], m, parent, seg);
  }
  /** A group at `pos` whose +Y points along +x (sx = 1) or -x (sx = -1): for knobs on a side face. */
  function sideAxis(pos, sx, parent = u) {
    const a = new THREE.Group();
    a.position.set(pos[0], pos[1], pos[2]); a.rotation.z = -sx * Math.PI / 2; parent.add(a);
    return a;
  }
  function bandTex(text, bg = '#e9ebee', fg = '#2a2e35', n = text.length > 11 ? 2 : 3) {
    const c = makeCanvas(512, 48), x = c.getContext('2d');
    x.fillStyle = bg; x.fillRect(0, 0, 512, 48);
    x.fillStyle = fg; x.font = `600 30px ${FONT}`; x.textBaseline = 'middle';
    for (let i = 0; i < n; i++) x.fillText(text, 12 + (i * 512) / n, 25);
    return canvasTex(c);
  }
  /** Side profile as [z, y] points, extruded across x and centred. One bevel segment, so edges
   *  read as chamfers. The bevel grows the profile outward by `bevel`. */
  function side(pts, width, m, bevel = 0.02, curves, parent = u) {
    const sh = new THREE.Shape();
    sh.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const q = curves && curves[i];
      if (q) sh.quadraticCurveTo(q[0], q[1], pts[i][0], pts[i][1]); else sh.lineTo(pts[i][0], pts[i][1]);
    }
    const depth = width - bevel * 2;
    const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 12 });
    geo.translate(0, 0, -depth / 2); geo.rotateY(-Math.PI / 2);
    geo.computeVertexNormals();
    return put(geo, m, parent);
  }

  const STAGE_Y = 0.8, AXIS_Z = 0.19;   // stage top, and the optical axis everything lines up on
  const BASE_Y = 0.27, COL_F = -0.22;   // top of the base; front face of the column

  // base: slate plinth, chamfered teal housing, a pale panel down the front, switch and dimmer
  put(cbox(0.88, 0.035, 1.02, 0.012), SM.slateDark, u, [0, 0.0175, 0]);
  side([[-0.48, 0.035], [0.48, 0.035], [0.48, 0.17], [0.31, BASE_Y - 0.02], [-0.48, BASE_Y - 0.02]], 0.82, SM.body, 0.02);
  side([[0.2, 0.035], [0.488, 0.035], [0.488, 0.174], [0.314, BASE_Y - 0.012], [0.2, BASE_Y - 0.012]], 0.24, SM.panel, 0.02);
  put(new THREE.BoxGeometry(0.05, 0.05, 0.014), SM.slateDark, u, [0, 0.1, 0.512]);
  put(new THREE.BoxGeometry(0.03, 0.02, 0.01), SM.black, u, [0, 0.109, 0.52]).rotation.x = -0.25;
  knob(0.055, 0.03, 12, SM.slateFacet, sideAxis([0.41, 0.14, 0.1], 1));
  // lamp port on the base, under the stage
  turn([[0.08, BASE_Y], [0.1, BASE_Y], [0.11, BASE_Y + 0.012], [0.11, BASE_Y + 0.042], [0.1, BASE_Y + 0.05], [0.08, BASE_Y + 0.05]], SM.slate, u, 32).position.z = AXIS_Z;
  const lampMat = mat.make.standard({ color: toLinear('#5a5f68'), emissive: new THREE.Color(0), roughness: 0.3 });
  put(new THREE.CylinderGeometry(0.081, 0.081, 0.04, 32), lampMat, u, [0, BASE_Y + 0.026, AXIS_Z], { cast: false });
  put(new THREE.TorusGeometry(0.084, 0.005, 8, 40), mat.chrome, u, [0, BASE_Y + 0.047, AXIS_Z]).rotation.x = Math.PI / 2;

  // C-arm: a column at the back that turns forward at the top to carry the nosepiece
  // A slim column and a long arm that tapers toward its front end, so the stage sits well forward of the column.
  side([[-0.47, BASE_Y - 0.02], [COL_F, BASE_Y - 0.02], [COL_F, 0.98], [-0.08, 1.17], [0.34, 1.27], [0.34, 1.33], [0.31, 1.36], [-0.44, 1.36], [-0.47, 1.33]],
    0.3, SM.body, 0.025, { 3: [COL_F, 1.15] });
  put(new THREE.BoxGeometry(0.13, 0.4, 0.02), SM.slateDark, u, [0, 0.62, COL_F + 0.032]);   // rack the stage rides on
  // coaxial focus knobs either side: coarse (big) and fine (outboard)
  for (const sx of [1, -1]) {
    const kn = sideAxis([sx * 0.15, 0.6, (COL_F - 0.47) / 2], sx);
    turn([[0, 0], [0.05, 0], [0.05, 0.02], [0, 0.02]], SM.slateDark, kn, 24);
    knob(0.115, 0.055, 16, SM.slateFacet, kn, 0.015);
    knob(0.06, 0.04, 12, SM.slateFacet, kn, 0.07);
    put(new THREE.CylinderGeometry(0.03, 0.03, 0.006, 16), SM.head, kn, [0, 0.112, 0]);
  }
  // power cord out of the back of the arm, falling to the bench
  const cordPath = new THREE.CatmullRomCurve3([V3(0, 0.95, -0.47), V3(0, 0.95, -0.56), V3(0.02, 0.8, -0.64), V3(0.06, 0.45, -0.67), V3(0.1, 0.12, -0.66), V3(0.14, 0.012, -0.62), V3(0.2, 0.012, -0.58)]);
  put(new THREE.TubeGeometry(cordPath, 48, 0.011, 8), SM.cord, u);
  put(new THREE.CylinderGeometry(0.022, 0.018, 0.06, 12), SM.slateDark, u, [0, 0.95, -0.5]).rotation.x = Math.PI / 2;

  // stage: bracket off the rack, two plates, aperture, slide holder, X/Y knobs under the right side
  put(new THREE.BoxGeometry(0.22, 0.1, 0.2), SM.slateDark, u, [0, STAGE_Y - 0.09, COL_F + 0.12]);
  put(cbox(0.5, 0.035, 0.42, 0.01), SM.slateDark, u, [0, STAGE_Y - 0.065, AXIS_Z]);
  put(cbox(0.62, 0.05, 0.5, 0.012), SM.slate, u, [0, STAGE_Y - 0.025, AXIS_Z]);
  put(new THREE.CylinderGeometry(0.035, 0.035, 0.042, 24), new THREE.MeshBasicMaterial({ color: 0x0d0f12 }), u, [0, STAGE_Y - 0.02, AXIS_Z], { cast: false });
  put(new THREE.BoxGeometry(0.46, 0.016, 0.026), SM.barrel, u, [0, STAGE_Y + 0.008, AXIS_Z - 0.075]);   // holder rail behind the slide
  put(new THREE.BoxGeometry(0.03, 0.016, 0.12), SM.barrel, u, [-0.19, STAGE_Y + 0.008, AXIS_Z - 0.01]); // fixed finger at the label end
  put(new THREE.BoxGeometry(0.05, 0.012, 0.03), SM.barrel, u, [0.2, STAGE_Y + 0.006, AXIS_Z - 0.045]);  // spring arm
  put(new THREE.CylinderGeometry(0.01, 0.01, 0.07, 10), SM.barrel, u, [0.2, STAGE_Y + 0.012, AXIS_Z - 0.01]).rotation.x = Math.PI / 2;
  put(new THREE.BoxGeometry(0.5, 0.014, 0.022), SM.barrel, u, [0, STAGE_Y + 0.007, AXIS_Z + 0.22]);     // vernier rail along the front
  const xy = new THREE.Group();
  xy.position.set(0.24, STAGE_Y - 0.07, AXIS_Z - 0.12); u.add(xy);
  put(new THREE.CylinderGeometry(0.009, 0.009, 0.2, 10), SM.barrel, xy, [0, -0.1, 0]);
  knob(0.034, 0.035, 12, SM.slateFacet, xy, -0.11);
  knob(0.026, 0.035, 10, SM.slateFacet, xy, -0.18);
  // condenser: a wide collar under the aperture on a carrier, iris lever, focus knob
  put(new THREE.BoxGeometry(0.09, 0.03, AXIS_Z - COL_F), SM.slateDark, u, [0, STAGE_Y - 0.18, (AXIS_Z + COL_F) / 2]);
  turn([[0.07, STAGE_Y - 0.21], [0.09, STAGE_Y - 0.2], [0.09, STAGE_Y - 0.13], [0.125, STAGE_Y - 0.125], [0.125, STAGE_Y - 0.1], [0.07, STAGE_Y - 0.095]], SM.slate, u, 32).position.z = AXIS_Z;
  put(new THREE.TorusGeometry(0.088, 0.005, 8, 36), SM.barrel, u, [0, STAGE_Y - 0.165, AXIS_Z]).rotation.x = Math.PI / 2;
  put(new THREE.CylinderGeometry(0.005, 0.005, 0.09, 8), SM.barrel, u, [0.1, STAGE_Y - 0.165, AXIS_Z + 0.06]).rotation.set(Math.PI / 2, 0, -1.0);
  put(new THREE.SphereGeometry(0.012, 12, 8), SM.slateDark, u, [0.137, STAGE_Y - 0.165, AXIS_Z + 0.085]);
  knob(0.035, 0.03, 10, SM.slateFacet, sideAxis([-0.13, STAGE_Y - 0.2, COL_F + 0.1], -1));
  put(new THREE.CylinderGeometry(0.008, 0.008, 0.09, 8), SM.barrel, u, [-0.09, STAGE_Y - 0.2, COL_F + 0.1]).rotation.z = Math.PI / 2;

  const beamBot = BASE_Y + 0.05, beamTop = STAGE_Y - 0.21;
  const beam = put(new THREE.CylinderGeometry(0.06, 0.075, beamTop - beamBot, 32, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff1c2, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    u, [0, (beamTop + beamBot) / 2, AXIS_Z], { cast: false, receive: false });
  beam.userData.noSketch = true;

  // The nosepiece is tilted: its axis leans back and the objectives sit on a matching cone,
  // so the one in use points straight down at the slide and the others fan out forward.
  const TILT = 0.3, OB_R = 0.088, OB_DROP = 0.025;   // objective seat: radius on the turret, depth below it
  const noseTilt = new THREE.Group();
  noseTilt.position.set(0, 1.12, AXIS_Z + OB_R * Math.cos(TILT) - OB_DROP * Math.sin(TILT)); noseTilt.rotation.x = -TILT; u.add(noseTilt);
  put(new THREE.CylinderGeometry(0.06, 0.07, 0.14, 24), SM.slateDark, noseTilt, [0, 0.085, 0]);   // neck into the arm
  const nose = new THREE.Group();
  noseTilt.add(nose);
  turn([[0, 0.06], [0.07, 0.057], [0.12, 0.04], [0.148, 0.014], [0.148, 0.008], [0, 0.008]], SM.slate, nose, 48);
  turn([[0, 0.008], [0.156, 0.008], [0.162, 0.0], [0.162, -0.022], [0.154, -0.026], [0, -0.026]], SM.barrel, nose, 48);
  knurl(0.163, 0.012, 70, 0.04, SM.knurlSteel, nose, -0.01);
  put(new THREE.SphereGeometry(0.009, 12, 8), mat.chrome, nose, [0, 0.04, -0.12]);
  // Chunky barrels: a wide body, a shoulder, then a narrower nose that is longer at higher power.
  const OBJ = [
    { len: 0.12, ring: '#d94040', label: '4× / 0.10', lensR: 0.016 },
    { len: 0.15, ring: '#f2c230', label: '10× / 0.25', lensR: 0.012 },
    { len: 0.19, ring: '#3b78d8', label: '40× / 0.65', lensR: 0.008 },
    { len: 0.21, ring: '#f4f4f4', label: '100× / 1.25 OIL', lensR: 0.005, oil: true },
  ];
  const BR = 0.042, TR = 0.03;   // body and nose radius
  OBJ.forEach((o, i) => {
    const L = o.len, arm = new THREE.Group();
    arm.rotation.y = Math.PI + (i * Math.PI) / 2; nose.add(arm);
    const ob = new THREE.Group();
    ob.position.set(0, -OB_DROP, OB_R); ob.rotation.x = -TILT; arm.add(ob);
    const step = -0.105;
    turn([[0, 0], [BR - 0.012, 0], [BR - 0.012, -0.006], [BR - 0.002, -0.008], [BR, -0.012], [BR, step + 0.006], [BR - 0.004, step],
      [TR, step - 0.006], [TR, -L + 0.01], [TR - 0.006, -L + 0.002], [o.lensR + 0.004, -L], [0, -L]], SM.barrel, ob, 40);
    knurl(BR + 0.001, 0.016, 32, 0.05, SM.knurlSteel, ob, -0.022);
    put(new THREE.CylinderGeometry(BR + 0.0008, BR + 0.0008, 0.01, 40), mat.make.solid(toLinear(o.ring), 0.35, { metalness: 0.1 }), ob, [0, -0.04, 0]);
    put(new THREE.CylinderGeometry(BR + 0.0006, BR + 0.0006, 0.022, 48, 1, true), mat.make.standard({ map: bandTex(o.label), roughness: 0.4, metalness: 0.3 }), ob, [0, -0.06, 0]);
    if (o.oil) put(new THREE.CylinderGeometry(TR + 0.001, TR + 0.001, 0.006, 32), SM.black, ob, [0, -L + 0.03, 0]);
    put(new THREE.TorusGeometry(o.lensR + 0.0015, 0.0015, 6, 24), SM.black, ob, [0, -L - 0.0002, 0]).rotation.x = Math.PI / 2;
    put(new THREE.SphereGeometry(o.lensR, 20, 8, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38), SM.lensGlass, ob, [0, -L + o.lensR * 0.78, 0], { cast: false });
  });

  // head: one chamfered wedge sitting flat on the arm, its top rising toward the user at the
  // eyepieces' angle, and its front end square to them, where they come out. Locking screw on the side.
  const EYE_TILT = 1.065, EYE_PIVOT = V3(0, 1.592, 0.38), EYE_LEN = 0.3;
  side([[-0.08, 1.37], [0.31, 1.37], [0.31, 1.44], [0.43, 1.505], [0.33, 1.68], [-0.04, 1.48]], 0.28, SM.head, 0.02);
  knob(0.024, 0.022, 10, SM.slateFacet, sideAxis([0.14, 1.42, 0.2], 1));
  const eyeG = new THREE.Group();
  eyeG.position.copy(EYE_PIVOT); eyeG.rotation.x = EYE_TILT; u.add(eyeG);
  // The tube's surface is about 2:1 (round × along), so the canvas is too, or the text stretches.
  const tc = makeCanvas(512, 256), tx = tc.getContext('2d');
  tx.fillStyle = '#4f7b9e'; tx.fillRect(0, 0, 512, 256);
  tx.fillStyle = '#eef2f6'; tx.font = `600 64px ${FONT}`; tx.textAlign = 'center'; tx.textBaseline = 'middle';
  for (const cx of [128, 384]) tx.fillText('10×', cx, 128);
  const tubeTex = canvasTex(tc);
  for (const sx of [1, -1]) {
    const ep = new THREE.Group();
    ep.position.set(sx * 0.07, 0, 0); eyeG.add(ep);
    put(new THREE.CylinderGeometry(0.048, 0.054, 0.12, 8), SM.headFacet, ep, [0, 0.05, 0]);
    put(new THREE.CylinderGeometry(0.051, 0.051, 0.18, 8, 1, true), mat.make.standard({ map: tubeTex, roughness: 0.5, flatShading: true }), ep, [0, EYE_LEN - 0.09, 0]);
    put(new THREE.CylinderGeometry(0.045, 0.051, 0.01, 8), SM.slateFacet, ep, [0, EYE_LEN - 0.005, 0]);
    put(new THREE.SphereGeometry(0.034, 24, 6, 0, Math.PI * 2, 0, Math.PI * 0.2), SM.lensGlass, ep, [0, EYE_LEN - 0.034 * 0.95, 0], { cast: false });
    put(new THREE.CircleGeometry(0.03, 24), SM.black, ep, [0, EYE_LEN - 0.012, 0], { cast: false }).rotation.x = -Math.PI / 2;
  }
  const eyeAxis = V3(0, 1, 0).applyAxisAngle(V3(1, 0, 0), EYE_TILT);
  const eyeTop = EYE_PIVOT.clone().addScaledVector(eyeAxis, EYE_LEN);
  return {
    group: g, nose, K,
    anchors: {
      stage: V3(0, STAGE_Y + 0.0015, AXIS_Z).multiplyScalar(K),   // a hair above the plate: a slide resting exactly on it z-fights
      eye: eyeTop.clone().multiplyScalar(K),
      eyeAxis,
      top: V3(0, eyeTop.y * K, 0),
    },
    setLamp(k) {
      lampMat.emissive.setRGB(1.6 * k, 1.45 * k, 1.1 * k);
      beam.material.opacity = 0.32 * k;
    },
  };
}
