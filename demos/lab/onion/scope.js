/* The microscope view (from OnionRoot): the root-tip squash seen through the eyepiece, with
 * objectives, focus and light, a counter that tallies the stage of each cell the student
 * names (for the mitotic index), and the plant mitosis model beside it (mitosis.js).
 *
 *   const scope = createScope({ onClose });
 *   scope.open({ stain: 'orcein', squash: 0.6 });   // builds the field once per stain and squash
 *   scope.close();
 *
 * The tissue is generated, not drawn: a root's outline, a root cap, a meristem behind it where
 * cells divide, and an elongation zone above that. Which cells divide, and at which stage, is
 * drawn from a fixed seed, so every student sees the same slide. Field units are µm.
 * Colours are hex as given: the renderer outputs linear, as the 2D original did.
 */
import * as THREE from 'three';
import { clamp, seeded, linearOut, themeColor, T, fmt } from '../lab.js';
import { STAINS, STAGE_COLORS } from './stains.js';
import { createMitosis } from './mitosis.js';

const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const STAGES = T.stages.map((s, i) => ({ ...s, color: STAGE_COLORS[i] }));
export const ENOUGH = 50;   // cells to count for a fair estimate of the mitotic index

export function createScope({ onClose = () => {} } = {}) {
  const OBJECTIVES = [
    { mag: 4, field: 4500, ring: '#d94040', focus: 0.46, dof: 0.7 },
    { mag: 10, field: 1800, ring: '#f2c230', focus: 0.5, dof: 1.1 },
    { mag: 40, field: 450, ring: '#3b78d8', focus: 0.545, dof: 2.0 },
    { mag: 100, field: 180, ring: '#e6e8ec', focus: 0.565, dof: 3.0 },
  ];
  const PICK_FROM = 2;   // objectives from 40× up show single cells well enough to name
  const HW = 560, CAP = 230, MER = 1150, TOP = 2900, FW = 21;

  let renderer, scene, camera, canvas, eyeEl, root, mitosis, inited = false, isOpen = false;
  let cells = [], grid = new Map(), spread = 1;
  let field = 4500, fieldT = 4500, obj = 0, camX = 0, camY = 1150;
  let focus = 0.25, light = 0.62;
  let selected = -1, hovered = -1, showAnswers = false;
  const labels = new Map();
  let stainKey = 'orcein', squashQ = 0.6, builtKey = '';
  let last = 0;
  const M = {};
  const TX = {};
  let rrGeo, discGeo, ringGeo;
  let selFrame, hovFrame, lastBadgeField = 0, lastFilter = '';
  const $ = (q) => root.querySelector(q);

  /* ---------- Textures ---------- */
  function cnv(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    return [c, c.getContext('2d')];
  }
  function tex(c) {
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  }
  function makeTextures() {
    const R = seeded(99);
    // interphase nucleus: grainy chromatin, nucleolus, envelope rim
    {
      const [c, g] = cnv(256);
      const cx = 128, r = 120;
      const grd = g.createRadialGradient(cx - 24, cx - 24, 10, cx, cx, r);
      grd.addColorStop(0, 'rgb(252,252,252)');
      grd.addColorStop(0.75, 'rgb(232,232,232)');
      grd.addColorStop(1, 'rgb(190,190,190)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(cx, cx, r, 0, 7); g.fill();
      g.save(); g.clip();
      for (let i = 0; i < 1100; i++) {
        const a = R() * 6.28, d = Math.sqrt(R()) * r;
        const s = 120 + R() * 100;
        g.fillStyle = `rgba(${s},${s},${s},${0.25 + R() * 0.4})`;
        g.beginPath(); g.arc(cx + Math.cos(a) * d, cx + Math.sin(a) * d, 1 + R() * 3.4, 0, 7); g.fill();
      }
      const ng = g.createRadialGradient(cx + 30, cx - 20, 2, cx + 30, cx - 20, 30);
      ng.addColorStop(0, 'rgba(70,70,70,0.95)');
      ng.addColorStop(0.75, 'rgba(95,95,95,0.85)');
      ng.addColorStop(1, 'rgba(120,120,120,0)');
      g.fillStyle = ng;
      g.beginPath(); g.arc(cx + 30, cx - 20, 30, 0, 7); g.fill();
      g.restore();
      g.strokeStyle = 'rgba(130,130,130,0.9)';
      g.lineWidth = 5;
      g.beginPath(); g.arc(cx, cx, r - 3, 0, 7); g.stroke();
      TX.nuc = tex(c);
    }
    // prophase: thin threads (early) and thick threads (late)
    const threads = (n, wMin, wMax, segLen, rim, base) => {
      const [c, g] = cnv(256);
      const cx = 128, r = 118;
      g.fillStyle = `rgba(250,250,250,${base})`;
      g.beginPath(); g.arc(cx, cx, r, 0, 7); g.fill();
      if (rim) { g.strokeStyle = 'rgba(160,160,160,0.7)'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cx, r - 2, 0, 7); g.stroke(); }
      g.lineCap = 'round';
      g.lineJoin = 'round';
      for (let i = 0; i < n; i++) {
        let a = R() * 6.28, d = Math.sqrt(R()) * r * 0.7;
        let x = cx + Math.cos(a) * d, y = cx + Math.sin(a) * d, dir = R() * 6.28;
        const pts = [[x, y]];
        const steps = 6 + ((R() * 5) | 0);
        for (let k = 0; k < steps; k++) {
          dir += (R() - 0.5) * 1.6;
          let nx = x + Math.cos(dir) * segLen, ny = y + Math.sin(dir) * segLen;
          if (Math.hypot(nx - cx, ny - cx) > r * 0.86) { dir += Math.PI * 0.8; nx = x + Math.cos(dir) * segLen; ny = y + Math.sin(dir) * segLen; }
          x = nx; y = ny;
          pts.push([x, y]);
        }
        const s = 50 + R() * 50;
        g.strokeStyle = `rgba(${s},${s},${s},0.92)`;
        g.lineWidth = wMin + R() * (wMax - wMin);
        g.beginPath();
        g.moveTo(pts[0][0], pts[0][1]);
        for (let k = 1; k < pts.length - 1; k++) {
          const mx = (pts[k][0] + pts[k + 1][0]) / 2, my = (pts[k][1] + pts[k + 1][1]) / 2;
          g.quadraticCurveTo(pts[k][0], pts[k][1], mx, my);
        }
        g.stroke();
      }
      return tex(c);
    };
    TX.proA = threads(22, 3, 5, 22, true, 0.7);
    TX.proB = threads(15, 9, 13, 20, false, 0.45);
    TX.clump = threads(18, 10, 14, 14, false, 0.85);
    // soft rod (chromosome arm)
    {
      const [c, g] = cnv(64);
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, 'rgba(225,225,225,1)');
      grd.addColorStop(0.62, 'rgba(255,255,255,1)');
      grd.addColorStop(0.85, 'rgba(255,255,255,0.55)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 64);
      TX.rod = tex(c);
    }
    // cytoplasm grain
    {
      const [c, g] = cnv(128);
      g.fillStyle = '#fff';
      g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 700; i++) {
        const s = 228 + R() * 27;
        g.fillStyle = `rgba(${s},${s},${s},0.6)`;
        g.beginPath(); g.arc(R() * 128, R() * 128, 0.6 + R() * 2.2, 0, 7); g.fill();
      }
      TX.cyto = tex(c);
      TX.cyto.wrapS = TX.cyto.wrapT = THREE.RepeatWrapping;
    }
    TX.label = STAGES.map((_, i) => badgeTex(i, true));
    TX.answer = STAGES.map((_, i) => badgeTex(i, false));
  }

  /** A round badge with the stage's letter. filled: the student's label (stage colour, white
   *  letter); outline: an answer (white, stage-coloured ring and letter). */
  function badgeTex(stage, filled) {
    const [c, g] = cnv(128);
    const col = STAGES[stage].color;
    g.beginPath(); g.arc(64, 64, 58, 0, 7);
    g.fillStyle = filled ? col : '#ffffff'; g.fill();
    g.lineWidth = 10; g.strokeStyle = filled ? '#ffffff' : col; g.stroke();
    g.fillStyle = filled ? '#ffffff' : col;
    g.font = '700 70px system-ui, -apple-system, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(STAGES[stage].key, 64, 68);
    return tex(c);
  }

  /* ---------- Geometry helpers ---------- */
  function rrShape(w, h, r) {
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
  function frameGeo(w, h, t) {
    const r = Math.min(w, h) * 0.2;
    const outer = rrShape(w + 2 * t, h + 2 * t, r + t);
    outer.holes.push(rrShape(w, h, r));
    return new THREE.ShapeGeometry(outer, 6);
  }

  /* ---------- Tissue generation (units: µm) ---------- */
  const profile = (y) => (y <= 0 ? 0 : HW * Math.pow(Math.min(1, y / 950), 0.62));
  // irregular squash outline: left and right edges wobble independently, the cut end is ragged
  const leftEdge = (y) => profile(y) * (1 + 0.15 * Math.sin(y * 0.0022 + 0.4) + 0.05 * Math.sin(y * 0.009 + 2.1) + (y > 1400 ? (y - 1400) * 0.00012 : 0));
  const rightEdge = (y) => profile(y) * (1 + 0.12 * Math.sin(y * 0.0019 + 2.9) + 0.05 * Math.sin(y * 0.012) + (y > 1700 ? (y - 1700) * 0.0001 : 0));
  const topAt = (x) => TOP - 160 + 140 * Math.sin(x * 0.009) + 90 * Math.sin(x * 0.023 + 1);
  const inside = (x, y, m = 0) => y > 0 && y < topAt(x) && x > -leftEdge(y) + m && x < rightEdge(y) - m;
  const edgeDist = (x, y) => Math.min(x + leftEdge(y), rightEdge(y) - x);
  const capB = (x) => 70 + CAP * (1 - Math.pow(x / HW, 2));
  function divProb(cy, x) {
    const dy = cy - capB(x);
    if (dy < 0) return 0;
    if (cy < MER) return 0.035 + 0.3 * Math.exp(-Math.pow((dy - 330) / 280, 2));
    return Math.max(0, 0.05 * (1 - (cy - MER) / 380));
  }
  function pickStage(R) {
    const r = R();
    return r < 0.44 ? 1 : r < 0.6 ? 2 : r < 0.71 ? 3 : 4;
  }
  function genCells(R, sq) {
    spread = 0.95 + sq * 0.1;
    const shrink = 1 - (sq - 0.45) * 0.07;
    const over = sq >= 0.9;
    const out = [];
    const W = HW * 1.2;
    const nF = Math.floor((2 * W) / FW);
    for (let j = 0; j < nF; j++) {
      const x0 = -W + FW * (j + 0.5);
      let y = 0;
      while (y < 900 && !inside(x0, y, 6)) y += 2;
      if (y >= 900) continue;
      y += R() * 10;
      const yTop = topAt(x0) + (R() - 0.5) * 60;
      while (y < yTop) {
        const isCap = y < capB(x0);
        let h;
        if (isCap) h = 20 + R() * 12;
        else h = 16 + R() * 8 + Math.max(0, y - (MER - 300)) * 0.05 * (0.8 + R() * 0.4);
        const cy = y + h / 2;
        y += h;
        if (!inside(x0, cy, 4)) continue;
        const lateral = edgeDist(x0, cy) < 2 * FW && cy < 750;
        const zone = isCap || lateral ? 0 : cy < MER ? 1 : 2;
        const c = {
          x: x0 * spread + (R() - 0.5) * 2.5,
          y: cy * spread + (R() - 0.5) * 2,
          w: FW * (0.93 + R() * 0.09) * shrink * (zone === 0 ? 1.04 : 1),
          h: h * 0.985 * shrink,
          rot: (R() - 0.5) * 0.06,
          zone,
          ty: cy,
          stage: 0,
          sub: R(),
        };
        if (zone !== 0 && R() < divProb(cy, x0)) c.stage = pickStage(R);
        if (over) {
          c.x += (R() - 0.5) * 12;
          c.y += (R() - 0.5) * 12;
          c.rot += (R() - 0.5) * 0.35;
          if (R() < 0.12) continue;
        }
        out.push(c);
      }
    }
    // loose root-cap cells sloughed off around the apex
    for (let i = 0; i < 34; i++) {
      const a = Math.PI * (1.05 + R() * 0.9);
      const d = 60 + R() * 220;
      const s = 22 + R() * 10;
      out.push({ x: Math.cos(a) * d * 1.3, y: 40 + Math.sin(a) * d * 0.7, w: s, h: s * (0.8 + R() * 0.4), rot: R() * 3, zone: 0, stage: 0, sub: R(), loose: true });
    }
    return out;
  }

  function buildGrid() {
    grid = new Map();
    const G = 60;
    cells.forEach((c, i) => {
      const r = Math.max(c.w, c.h) / 2 + 2;
      for (let gx = Math.floor((c.x - r) / G); gx <= Math.floor((c.x + r) / G); gx++) {
        for (let gy = Math.floor((c.y - r) / G); gy <= Math.floor((c.y + r) / G); gy++) {
          const k = gx * 100003 + gy;
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push(i);
        }
      }
    });
  }
  function pickCell(wx, wy) {
    const list = grid.get(Math.floor(wx / 60) * 100003 + Math.floor(wy / 60));
    if (!list) return -1;
    for (let n = list.length - 1; n >= 0; n--) {
      const i = list[n], c = cells[i];
      const dx = wx - c.x, dy = wy - c.y;
      const cs = Math.cos(-c.rot), sn = Math.sin(-c.rot);
      const lx = dx * cs - dy * sn, ly = dx * sn + dy * cs;
      if (Math.abs(lx) < c.w / 2 && Math.abs(ly) < c.h / 2) return i;
    }
    return -1;
  }

  /* ---------- Build scene ---------- */
  function clearScene() {
    while (scene.children.length) {
      const o = scene.children.pop();
      if (o.geometry && o.geometry !== rrGeo && o.geometry !== discGeo && o.geometry !== ringGeo) o.geometry.dispose();
      if (o.material) o.material.dispose();
    }
  }
  function basicMat(opts) {
    return new THREE.MeshBasicMaterial(Object.assign({ depthTest: false, depthWrite: false }, opts));
  }
  function inst(geo, mat, list, order) {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
    const d = new THREE.Object3D();
    list.forEach((it, i) => {
      d.position.set(it.x, it.y, 0);
      d.rotation.set(0, 0, it.r || 0);
      d.scale.set(it.sx, it.sy, 1);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
      m.setColorAt(i, it.c);
    });
    m.count = list.length;
    m.renderOrder = order;
    m.frustumCulled = false;
    scene.add(m);
    return m;
  }

  function build() {
    clearScene();
    const S = STAINS[stainKey];
    const R = seeded(20241112);
    cells = genCells(R, squashQ);
    buildGrid();
    labels.clear();
    selected = hovered = -1;

    const cWall = new THREE.Color(S.wall), cCyto = new THREE.Color(S.cyto), cNuc = new THREE.Color(S.nuc), cChrom = new THREE.Color(S.chrom);
    const white = new THREE.Color(1, 1, 1);
    const walls = [], fills = [], nucs = [], proA = [], proB = [], clumps = [], rods = [], plates = [], answers = [];

    const place = (c, lx, ly) => {
      const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
      return [c.x + lx * cs - ly * sn, c.y + lx * sn + ly * cs];
    };
    const chromCol = () => cChrom.clone().lerp(cNuc, R() * 0.18);
    const rod = (c, lx, ly, a, len, wid) => {
      const [x, y] = place(c, lx, ly);
      rods.push({ x, y, r: c.rot - a, sx: wid, sy: len, c: chromCol() });
    };

    for (const c of cells) {
      const wf = c.zone === 0 ? 0.32 + R() * 0.15 : smoothstep(MER - 350, MER + 650, c.ty || 0) * 0.26 + 0.04 + R() * 0.1;
      walls.push({ x: c.x, y: c.y, r: c.rot, sx: c.w, sy: c.h, c: cWall.clone().lerp(white, wf) });
      // stain intensity fades gradually from the dense meristem into the elongation zone
      const fade = c.zone === 0 ? 1 : smoothstep(MER - 350, MER + 650, c.ty || 0);
      const pale = c.zone === 0 ? 0.45 + R() * 0.3 : fade * 0.45 + R() * (0.18 + fade * 0.2);
      const fc = cCyto.clone().lerp(white, pale);
      if (c.zone !== 0) fc.lerp(cNuc, 0.07 * (1 - fade));
      fills.push({ x: c.x, y: c.y, r: c.rot, sx: c.w - 1.6, sy: c.h - 1.6, c: fc });

      if (c.stage === 0) {
        if (c.zone === 0 && R() < 0.45) continue;
        const base = c.zone === 2 ? 9 : c.zone === 0 ? 7.5 : 9.8;
        const dn = Math.min(base * (0.9 + R() * 0.2), Math.min(c.w, c.h) * 0.72);
        const ey = c.zone === 2 ? 1.25 : 1 + (R() - 0.5) * 0.1;
        const [x, y] = place(c, (R() - 0.5) * c.w * 0.15, (R() - 0.5) * Math.max(0, c.h - dn * ey) * 0.5);
        const nc = cNuc.clone().lerp(white, c.zone === 2 ? 0.32 : c.zone === 0 ? 0.48 : R() * 0.12);
        nucs.push({ x, y, r: c.zone === 2 ? c.rot + (R() < 0.5 ? 0 : Math.PI) : R() * 6.28, sx: dn, sy: dn * ey, c: nc });
      } else if (c.stage === 1) {
        const dn = Math.min(11 * (0.95 + R() * 0.15), Math.min(c.w, c.h) * 0.8);
        const [x, y] = place(c, (R() - 0.5) * 1.5, (R() - 0.5) * 1.5);
        (c.sub < 0.5 ? proA : proB).push({ x, y, r: R() * 6.28, sx: dn, sy: dn, c: cChrom.clone().lerp(cNuc, c.sub < 0.5 ? 0.4 : 0.12) });
      } else if (c.stage === 2) {
        // Each chromosome is one rod across the plate, darkest where its centromere sits on it:
        // two arms drawn apart leave a pale line down the plate that reads as anaphase.
        for (let k = 0; k < 16; k++) {
          const cx = (R() - 0.5) * c.w * 0.62, cy = (R() - 0.5) * 0.8;
          const a = (R() - 0.5) * 0.5;
          rod(c, cx, cy, a, 4.4 + R() * 3.4, 1.55);
        }
      } else if (c.stage === 3) {
        // The two sets start clear of the plate, arms trailing back toward it, so even early
        // anaphase shows a gap down the middle.
        const len0 = 1.8, lenR = 1.6;
        const dd = Math.max(c.h * (0.2 + 0.16 * c.sub), len0 + lenR + 1.2);
        for (const sg of [1, -1]) {
          for (let k = 0; k < 16; k++) {
            const cx = (R() - 0.5) * c.w * (0.62 - 0.22 * c.sub), cy = sg * (dd + (R() - 0.5) * 1.2);
            const back = sg > 0 ? Math.PI : 0;
            for (const arm of [1, -1]) {
              const a = back + arm * (0.12 + R() * 0.32);
              const len = len0 + R() * lenR;
              rod(c, cx + (Math.sin(a) * len) / 2, cy + (Math.cos(a) * len) / 2, a, len, 1.25);
            }
          }
        }
      } else if (c.stage === 4) {
        const py = c.h * (0.27 + 0.06 * c.sub);
        for (const sg of [1, -1]) {
          const [x, y] = place(c, 0, sg * py);
          clumps.push({ x, y, r: c.rot + (R() < 0.5 ? 0 : Math.PI), sx: c.w * (0.64 - 0.12 * c.sub), sy: 4.5 + 3.2 * c.sub, c: cChrom.clone().lerp(cNuc, 0.08 + 0.3 * c.sub) });
          for (let k = 0; k < 7; k++) rod(c, (R() - 0.5) * c.w * 0.48, sg * py + (R() - 0.5) * 2.6, R() * Math.PI, 1.5 + R() * 1.6, 1.1);
        }
        if (c.sub > 0.3) {
          const wdt = (c.w - 1.6) * Math.min(1, (c.sub - 0.3) * 2.2);
          plates.push({ x: c.x, y: c.y, r: c.rot, sx: wdt, sy: 0.9, c: cWall.clone().lerp(cChrom, 0.15) });
        }
      }
      if (c.stage > 0) {
        const [x, y] = place(c, c.w * 0.3, c.h * 0.34);
        answers.push({ x, y, cell: c, c: new THREE.Color(STAGE_COLORS[c.stage]) });
      }
    }

    // debris and air bubbles on the slide
    const specks = [];
    for (let i = 0; i < 260; i++) {
      const s = 0.8 + R() * 3.5;
      specks.push({ x: (R() - 0.5) * 3600, y: -900 + R() * 4600, r: R() * 3, sx: s, sy: s * (0.6 + R() * 0.8), c: cChrom.clone().lerp(white, 0.35 + R() * 0.4) });
    }
    const bubbles = [
      { x: -930, y: 1650, s: 260 }, { x: 860, y: 480, s: 150 }, { x: 760, y: 2350, s: 95 }, { x: -720, y: -260, s: 70 }, { x: 330, y: 3200, s: 180 },
    ];

    M.walls = inst(rrGeo, basicMat({ color: 0xffffff }), walls, 1);
    M.fills = inst(rrGeo, basicMat({ map: TX.cyto }), fills, 2);
    M.plates = inst(rrGeo, basicMat({ transparent: true, opacity: 0.9 }), plates, 3);
    M.nucs = inst(discGeo, basicMat({ map: TX.nuc, transparent: true }), nucs, 4);
    M.proA = inst(discGeo, basicMat({ map: TX.proA, transparent: true }), proA, 4);
    M.proB = inst(discGeo, basicMat({ map: TX.proB, transparent: true }), proB, 4);
    M.clumps = inst(discGeo, basicMat({ map: TX.clump, transparent: true, opacity: 0.95 }), clumps, 4);
    M.rods = inst(discGeo, basicMat({ map: TX.rod, transparent: true, opacity: 0.93 }), rods, 5);
    M.specks = inst(discGeo, basicMat({ map: TX.rod, transparent: true, opacity: 0.5 }), specks, 6);
    const bubbleFill = bubbles.map((b) => ({ x: b.x, y: b.y, sx: b.s, sy: b.s, c: new THREE.Color('#ffffff') }));
    const bubbleRim = bubbles.map((b) => ({ x: b.x, y: b.y, sx: b.s, sy: b.s, c: new THREE.Color('#3c3c40') }));
    inst(discGeo, basicMat({ transparent: true, opacity: 0.55 }), bubbleFill, 7);
    inst(new THREE.RingGeometry(0.42, 0.5, 64), basicMat({ transparent: true, opacity: 0.75 }), bubbleRim, 7);
    inst(new THREE.RingGeometry(0.36, 0.4, 64), basicMat({ transparent: true, opacity: 0.25 }), bubbleRim, 7);

    // letter badges, one instanced mesh per stage: answers (outlined) under labels (filled)
    const badges = (texs, n, order) => texs.map((map) => {
      const m = new THREE.InstancedMesh(discGeo, basicMat({ map, transparent: true }), Math.max(1, n));
      m.count = 0; m.renderOrder = order; m.frustumCulled = false;
      scene.add(m);
      return m;
    });
    M.answerData = answers;
    M.answers = badges(TX.answer, answers.length, 8);
    M.answers.forEach((m) => { m.visible = showAnswers; });
    M.labels = badges(TX.label, cells.length, 9);

    selFrame = new THREE.Mesh(new THREE.BufferGeometry(), basicMat({ color: new THREE.Color(themeColor('--accent') || '#4f46e5'), transparent: true }));
    selFrame.renderOrder = 10;
    hovFrame = new THREE.Mesh(new THREE.BufferGeometry(), basicMat({ color: 0x1b1f27, transparent: true, opacity: 0.55 }));
    hovFrame.renderOrder = 10;
    selFrame.visible = hovFrame.visible = false;
    scene.add(selFrame, hovFrame);
    lastBadgeField = 0;
    updateTally();
    renderSel();
  }

  /* ---------- Badges & frames that keep constant screen size ---------- */
  function updateBadges() {
    const s = field * 0.022;
    const d = new THREE.Object3D();
    const put = (meshes, stage, x, y, k) => {
      const m = meshes[stage];
      d.position.set(x, y, 0);
      d.scale.set(s * k, s * k, 1);
      d.updateMatrix();
      m.setMatrixAt(m.count++, d.matrix);
    };
    if (M.answerData) {
      M.answers.forEach((m) => { m.count = 0; });
      M.answerData.forEach((a) => put(M.answers, a.cell.stage, a.x, a.y, 1.15));
      M.answers.forEach((m) => { m.instanceMatrix.needsUpdate = true; });
    }
    M.labels.forEach((m) => { m.count = 0; });
    labels.forEach((stage, idx) => {
      const c = cells[idx];
      const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
      const lx = -c.w * 0.3, ly = c.h * 0.34;
      put(M.labels, stage, c.x + lx * cs - ly * sn, c.y + lx * sn + ly * cs, 1.3);
    });
    M.labels.forEach((m) => { m.instanceMatrix.needsUpdate = true; });
    lastBadgeField = field;
    setFrame(selFrame, selected);
    setFrame(hovFrame, hovered === selected ? -1 : hovered);
  }
  function setFrame(m, idx) {
    if (!m) return;
    if (idx < 0) { m.visible = false; return; }
    const c = cells[idx];
    const t = field * (m === selFrame ? 0.0045 : 0.0028);
    m.geometry.dispose();
    m.geometry = frameGeo(c.w, c.h, t);
    m.position.set(c.x, c.y, 0);
    m.rotation.z = c.rot;
    m.visible = true;
  }

  /* ---------- UI ---------- */
  /* ---------- DOM ---------- */
  function buildDom() {
    const W = T.scope;
    root = document.createElement('section');
    root.className = 'scope';
    root.hidden = true;
    root.innerHTML = `
      <header class="scope-top">
        <button class="btn scope-back" data-act="back"><i class="ph-bold ph-arrow-left"></i>${W.back}</button>
        <div class="scope-title"><b>${W.title}</b><span class="scope-sub"></span></div>
        <div class="scope-chips">
          <span class="chip scope-zone"></span>
          <span class="chip scope-mag"></span>
        </div>
      </header>
      <div class="scope-grid">
        <aside class="panel scope-model">
          <div class="scope-row"><div class="panel-label">${W.model}</div><span class="scope-note">${W.drag}</span></div>
          <div class="model-view"></div>
          <div class="model-controls">
            <button class="icon-btn model-play" aria-label="${W.play}"><i class="ph-fill ph-pause"></i></button>
            <input type="range" class="model-scrub" min="0" max="1000" value="0" aria-label="${W.timeline}">
          </div>
          <div class="stage-chips"></div>
          <h3 class="model-stage"></h3>
          <p class="model-desc"></p>
        </aside>
        <main class="eye-col">
          <div class="eyepiece">
            <canvas></canvas>
            <div class="vignette"></div>
            <div class="eye-hint"></div>
            <div class="scalebar"><i></i><b></b></div>
          </div>
          <div class="panel scope-controls">
            <div class="objectives"></div>
            <div class="sliders">
              <label class="slider-row"><span>${W.focus}</span><input type="range" class="scope-focus" min="0" max="1000" value="250"><span class="kbd">${W.scroll}</span></label>
              <label class="slider-row"><span>${W.light}</span><input type="range" class="scope-light" min="0" max="1000" value="620"><span class="kbd scope-light-val"></span></label>
            </div>
          </div>
        </main>
        <aside class="panel scope-count">
          <div class="panel-label">${W.countTitle}</div>
          <div class="sel-box empty">
            <div class="sel-empty">${W.empty}</div>
            <div class="sel-main">
              <div class="sel-meta"><span class="sel-zone"></span><span class="sel-id"></span></div>
              <div class="sel-q">${W.question}</div>
              <div class="stage-btns"></div>
              <div class="feedback"></div>
            </div>
          </div>
          <div class="tally">
            <div class="tally-rows"></div>
            <div class="mi">
              <div><small>${W.mi}</small><b class="mi-val">–</b></div>
              <div class="mi-side"><small class="mi-sub"></small><div class="progress"><i></i></div></div>
            </div>
            <div class="mi-formula">${W.miFormula}</div>
            <div class="acc"></div>
          </div>
          <div class="row-btns">
            <label class="switch"><input type="checkbox" class="answers"><span class="track"></span>${W.answers}</label>
            <button class="btn ghost sm" data-act="reset">${W.reset}</button>
          </div>
        </aside>
      </div>`;
    (document.getElementById('app') || document.body).appendChild(root);
  }

  /* ---------- UI ---------- */
  function buildUI() {
    const W = T.scope;
    const objEl = $('.objectives');
    objEl.innerHTML = OBJECTIVES.map((o, i) => `<button data-i="${i}" style="--ring:${o.ring}"><b>${o.mag}×</b><small>${fmt(W.total, { n: o.mag * 10 })}</small></button>`).join('');
    objEl.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setObjective(+b.dataset.i); });
    const sb = $('.stage-btns');
    sb.innerHTML = STAGES.map((s, i) => `<button data-i="${i}" style="--c:${s.color}"><i></i>${s.name}<kbd>${s.key}</kbd></button>`).join('');
    sb.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) labelSelected(+b.dataset.i); });
    $('.tally-rows').innerHTML = STAGES.map((s, i) => `<div class="trow" style="--c:${s.color}"><span><i></i>${s.name}</span><div class="bar"><i data-bar="${i}"></i></div><b data-cnt="${i}">0</b></div>`).join('');

    const focusEl = $('.scope-focus'), lightEl = $('.scope-light');
    const setP = (el) => el.style.setProperty('--p', el.value / 10 + '%');
    focusEl.addEventListener('input', () => { focus = focusEl.value / 1000; setP(focusEl); });
    lightEl.addEventListener('input', () => { light = lightEl.value / 1000; setP(lightEl); $('.scope-light-val').textContent = Math.round(light * 100) + '%'; });
    setP(focusEl); setP(lightEl);
    $('.scope-light-val').textContent = Math.round(light * 100) + '%';

    $('.answers').addEventListener('change', (e) => {
      showAnswers = e.target.checked;
      if (M.answers) M.answers.forEach((m) => { m.visible = showAnswers; });
      updateTally();
    });
    root.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'back') close();
      if (act.dataset.act === 'reset') { labels.clear(); updateBadges(); updateTally(); renderSel(); }
    });

    let drag = null;
    eyeEl.addEventListener('pointerdown', (e) => {
      eyeEl.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, cx: camX, cy: camY, moved: 0 };
    });
    eyeEl.addEventListener('pointermove', (e) => {
      const rect = eyeEl.getBoundingClientRect();
      if (drag) {
        const k = field / rect.width;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
        if (drag.moved > 3) {
          eyeEl.classList.add('dragging');
          camX = drag.cx - dx * k;
          camY = drag.cy + dy * k;
          clampCam();
        }
      }
      const [wx, wy, inside] = toWorld(e, rect);
      const canPick = obj >= PICK_FROM && inside;
      eyeEl.classList.toggle('can-pick', canPick && !drag);
      const h = canPick && !(drag && drag.moved > 3) ? pickCell(wx, wy) : -1;
      if (h !== hovered) { hovered = h; setFrame(hovFrame, hovered === selected ? -1 : hovered); }
    });
    const endDrag = (e) => {
      if (!drag) return;
      const wasClick = drag.moved <= 3;
      drag = null;
      eyeEl.classList.remove('dragging');
      if (!wasClick) return;
      const [wx, wy, inside] = toWorld(e, eyeEl.getBoundingClientRect());
      if (!inside) return;
      if (obj < PICK_FROM) { flashHint(T.scope.hints.pickMag); return; }
      select(pickCell(wx, wy));
    };
    eyeEl.addEventListener('pointerup', endDrag);
    eyeEl.addEventListener('pointercancel', () => { drag = null; eyeEl.classList.remove('dragging'); });
    eyeEl.addEventListener('pointerleave', () => { if (!drag && hovered >= 0) { hovered = -1; setFrame(hovFrame, -1); } });
    eyeEl.addEventListener('wheel', (e) => {
      e.preventDefault();
      focus = clamp(focus - e.deltaY * 0.00025, 0, 1);
      focusEl.value = focus * 1000;
      setP(focusEl);
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (!isOpen || e.target.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (k >= '1' && k <= '4') setObjective(+k - 1);
      const si = STAGES.findIndex((s) => s.key.toLowerCase() === k);
      if (si >= 0 && selected >= 0) labelSelected(si);
      if (k === 'escape') { if (selected >= 0) select(-1); else close(); }
      const step = field * 0.08;
      if (k === 'arrowleft') camX -= step;
      if (k === 'arrowright') camX += step;
      if (k === 'arrowup') camY += step;
      if (k === 'arrowdown') camY -= step;
      if (k.startsWith('arrow')) { e.preventDefault(); clampCam(); }
      if (k === ' ') e.stopPropagation();
    }, true);

    new ResizeObserver(resize).observe(eyeEl);
  }

  let flashUntil = 0;
  function flashHint(msg) {
    $('.eye-hint').textContent = msg;
    flashUntil = performance.now() + 2800;
  }

  function toWorld(e, rect) {
    const px = (e.clientX - rect.left) / rect.width, py = (e.clientY - rect.top) / rect.height;
    const inside = Math.hypot(px - 0.5, py - 0.5) < 0.5;
    return [camX + (px - 0.5) * field, camY - (py - 0.5) * field, inside];
  }
  function clampCam() {
    camX = clamp(camX, -HW * 1.4 * spread, HW * 1.4 * spread);
    camY = clamp(camY, -400, TOP * spread + 200);
  }

  function setObjective(i) {
    obj = i;
    fieldT = OBJECTIVES[i].field;
    root.querySelectorAll('.objectives button').forEach((b, j) => b.classList.toggle('active', j === i));
    $('.scope-mag').textContent = fmt(T.scope.total, { n: OBJECTIVES[i].mag * 10 });
    if (i < PICK_FROM && selected >= 0) select(-1);
    eyeEl.classList.toggle('can-pick', false);
  }

  function select(i) {
    selected = i;
    setFrame(selFrame, selected);
    setFrame(hovFrame, hovered === selected ? -1 : hovered);
    renderSel();
  }
  function renderSel() {
    const box = $('.sel-box');
    box.classList.toggle('empty', selected < 0);
    if (selected < 0) return;
    const c = cells[selected];
    $('.sel-zone').textContent = T.scope.zones[c.zone];
    $('.sel-id').textContent = fmt(T.scope.cellId, { n: selected + 1 });
    const lab = labels.has(selected) ? labels.get(selected) : -1;
    root.querySelectorAll('.stage-btns button').forEach((b, j) => b.classList.toggle('picked', j === lab));
    const fb = $('.feedback');
    if (lab < 0) { fb.className = 'feedback'; fb.innerHTML = ''; return; }
    const ok = lab === c.stage, s = STAGES[c.stage];
    fb.className = 'feedback ' + (ok ? 'ok' : 'bad');
    fb.innerHTML = `<i class="ph-bold ${ok ? 'ph-check-circle' : 'ph-x-circle'}"></i><span>${fmt(ok ? T.scope.correct : T.scope.wrong, { stage: s.name, hint: s.hint })}</span>`;
  }
  function labelSelected(stage) {
    if (selected < 0) return;
    labels.set(selected, stage);
    updateBadges();
    updateTally();
    renderSel();
  }

  function updateTally() {
    const W = T.scope;
    const counts = STAGES.map(() => 0);
    let correct = 0;
    labels.forEach((s, i) => { counts[s]++; if (cells[i].stage === s) correct++; });
    const total = labels.size;
    const max = Math.max(1, ...counts);
    counts.forEach((n, i) => {
      root.querySelector(`[data-cnt="${i}"]`).textContent = n;
      root.querySelector(`[data-bar="${i}"]`).style.width = (n / max) * 100 + '%';
    });
    const div = total - counts[0];
    $('.mi-val').textContent = total ? ((div / total) * 100).toFixed(1) + '%' : '–';
    $('.mi-sub').textContent = total >= ENOUGH ? fmt(W.counted, { n: total }) : fmt(W.countMore, { n: total, need: ENOUGH });
    $('.progress i').style.width = Math.min(100, (total / ENOUGH) * 100) + '%';
    const lines = [];
    if (total) lines.push(fmt(W.accuracy, { right: correct, n: total, pct: Math.round((correct / total) * 100) }));
    if (showAnswers) {
      const vis = visibleStats();
      if (vis.total) lines.push(fmt(W.trueMi, { mi: ((vis.div / vis.total) * 100).toFixed(1), n: vis.total }));
    }
    $('.acc').innerHTML = lines.join('<br>');
  }
  function visibleStats() {
    let total = 0, div = 0;
    const r = field / 2;
    for (const c of cells) {
      if (Math.hypot(c.x - camX, c.y - camY) < r) { total++; if (c.stage > 0) div++; }
    }
    return { total, div };
  }

  function zoneAt(x, y) {
    const ty = y / spread, tx = x / spread, Z = T.scope.chips;
    if (!inside(tx, ty)) return { name: Z.empty, c: '#cbd5e1' };
    if (ty < capB(tx)) return { name: Z.cap, c: '#d4a373' };
    if (ty < MER) return { name: Z.meristem, c: themeColor('--accent') };
    return { name: Z.elongation, c: '#10b981' };
  }

  /* ---------- Loop ---------- */
  let lastZone = '', statTimer = 0, raf = 0;
  function frame(now) {
    if (!isOpen) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    field += (fieldT - field) * Math.min(1, dt * 7);
    if (Math.abs(field - fieldT) < 0.5) field = fieldT;
    if (Math.abs(field - lastBadgeField) / field > 0.01) updateBadges();
    camera.left = -field / 2; camera.right = field / 2; camera.top = field / 2; camera.bottom = -field / 2;
    camera.updateProjectionMatrix();
    camera.position.set(camX, camY, 100);
    if (selFrame && selFrame.visible) selFrame.material.opacity = 0.75 + 0.25 * Math.sin(now * 0.006);
    // optics: an objective has a focal point and a depth of field; the lamp sets brightness and contrast
    const o = OBJECTIVES[obj];
    const blur = Math.min(16, Math.abs(focus - o.focus) * 70 * o.dof);
    const bright = 0.5 + light * 0.8;
    const contrast = 1.28 - light * 0.38;
    const filter = `blur(${blur.toFixed(1)}px) brightness(${bright.toFixed(2)}) contrast(${contrast.toFixed(2)}) saturate(${(0.85 + (1 - light) * 0.4).toFixed(2)})`;
    if (filter !== lastFilter) { canvas.style.filter = filter; lastFilter = filter; }
    if (now > flashUntil) {
      const H = T.scope.hints;
      const msg = blur > 2.5 ? H.blurry : light < 0.18 ? H.dark : light > 0.94 ? H.bright : '';
      const eh = $('.eye-hint');
      if (msg !== eh.textContent) eh.textContent = msg;
    }
    const z = zoneAt(camX, camY);
    if (z.name !== lastZone) {
      const zc = $('.scope-zone');
      zc.textContent = z.name;
      zc.style.setProperty('--zc', z.c);
      lastZone = z.name;
    }
    const rect = eyeEl.getBoundingClientRect();
    const target = field * 0.22;
    const nice = [5, 10, 20, 50, 100, 200, 500, 1000].reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
    $('.scalebar i').style.width = ((nice / field) * rect.width).toFixed(1) + 'px';
    $('.scalebar b').textContent = nice >= 1000 ? nice / 1000 + ' mm' : nice + ' µm';
    if (showAnswers) { statTimer += dt; if (statTimer > 0.5) { statTimer = 0; updateTally(); } }
    renderer.render(scene, camera);
    if (mitosis) mitosis.frame(dt, now);
  }

  function resize() {
    if (!renderer) return;
    const r = eyeEl.getBoundingClientRect();
    if (r.width < 10) return;
    renderer.setSize(r.width, r.height, false);
    lastBadgeField = 0;
  }

  function init() {
    buildDom();
    eyeEl = $('.eyepiece');
    canvas = eyeEl.querySelector('canvas');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    linearOut(renderer);
    renderer.setClearColor('#f6f3ec');
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    rrGeo = new THREE.ShapeGeometry(rrShape(1, 1, 0.22), 5);
    discGeo = new THREE.CircleGeometry(0.5, 32);
    ringGeo = new THREE.RingGeometry(0.34, 0.5, 32);
    makeTextures();
    buildUI();
    mitosis = createMitosis(root.querySelector('.scope-model'), STAGES);
    inited = true;
  }

  function open({ stain = 'orcein', squash = 0.6 } = {}) {
    if (!inited) init();
    root.hidden = false;
    document.body.classList.add('scope-open');
    const key = stain + ':' + squash.toFixed(2);
    stainKey = stain;
    squashQ = squash;
    if (key !== builtKey) {
      build();
      builtKey = key;
      camX = 0;
      camY = 1000 * spread;
      focus = 0.28;
      const f = $('.scope-focus');
      f.value = focus * 1000;
      f.style.setProperty('--p', focus * 100 + '%');
      setObjective(0);
      field = fieldT;
      flashHint(T.scope.hints.start);
    }
    $('.scope-sub').textContent = fmt(T.scope.sub, { stain: T.stains[stainKey].name });
    isOpen = true;
    resize();
    if (mitosis) mitosis.start();
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    cancelAnimationFrame(raf);
    if (mitosis) mitosis.stop();
    root.hidden = true;
    document.body.classList.remove('scope-open');
    onClose();
  }

  return {
    open, close,
    get isOpen() { return isOpen; },
    /** The student's count so far: cells named, how many of them as dividing, and the mitotic index (%). */
    tally() {
      let dividing = 0;
      labels.forEach((s) => { if (s > 0) dividing++; });
      return { total: labels.size, dividing, mi: labels.size ? (dividing / labels.size) * 100 : 0 };
    },
    /** For tests: the field's cells, the labels so far, and one frame drawn by hand. */
    debug: { get cells() { return cells; }, labels, frame: (now = performance.now()) => { if (isOpen) { cancelAnimationFrame(raf); frame(now); } }, select, labelSelected, setObjective, look(x, y) { camX = x; camY = y; } },
  };
}
