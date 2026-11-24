/* The bench for Blood Typing, laid out as the BloodType prototype had it: antisera and the
 * stick cup and bin at the back, four blood samples in a row, a typing tray in front of each,
 * with the zones printed straight on the bench. Words come from T.props. */
import * as THREE from 'three';
import {
  V3, makeBench, makeNozzleBottle, makeTypingTray, makeStickCup, makeWasteBin, mesh,
  makeCanvas, canvasTex, FONT, T,
} from '../lab.js';

export const PATIENTS = [
  { id: 'mother', color: '#e0559a' },
  { id: 'baby', color: '#16b3a3' },
  { id: 'man1', color: '#5b6cff' },
  { id: 'man2', color: '#f08c2e' },
];
// Anti-A and anti-B are dyed blue and yellow by the makers; anti-D (Rh) is clear.
export const SERA = [
  { id: 'A', cap: '#2f6fe4', liquid: '#2a66e0', well: '#3875f5', opacity: 0.9 },
  { id: 'B', cap: '#f3b700', liquid: '#f4c20f', well: '#fccc24', opacity: 0.9 },
  { id: 'Rh', cap: '#22a866', liquid: '#cdeedd', well: '#ccf0de', opacity: 0.6 },
];
export const BLOOD = '#6a0711';

const COLS_X = [-26.25, -8.75, 8.75, 26.25];
export const POS = {
  bottleZ: -8.5, trayZ: 4,
  serum: { A: V3(-6.5, 0, -21), B: V3(0, 0, -21), Rh: V3(6.5, 0, -21) },
  cup: V3(-26, 0, -21), bin: V3(26, 0, -21.5),
};
const MAT = { w: 100, d: 46, x0: -50, z0: -30 };

function printedMat() {
  const S = 16, W = MAT.w * S, H = MAT.d * S;
  const c = makeCanvas(W, H); const x = c.getContext('2d');
  const P = (wx, wz) => [(wx - MAT.x0) * S, (wz - MAT.z0) * S];
  x.font = `700 21px ${FONT}`; x.fillStyle = 'rgba(30,45,75,0.55)'; x.textAlign = 'center'; x.textBaseline = 'middle';
  const label = (txt, wx, wz) => { const [px, py] = P(wx, wz); x.fillText(txt.split('').join(' '), px, py); };
  const Z = T.props.zones;
  label(Z.sera, 0, -16.6);
  label(Z.samples, 0, -4.6);
  label(Z.trays, 0, 13.4);
  label(Z.sticks, POS.cup.x, POS.cup.z + 4.6);
  label(Z.bin, POS.bin.x, POS.bin.z + 6.3);
  return canvasTex(c);
}

/** Builds the bench into root; returns { props } with bloods[], sera[], trays[], cup, bin. */
export function buildBench(mat, root) {
  root.add(makeBench(mat).group);
  const bloods = PATIENTS.map((p, i) => {
    const b = makeNozzleBottle(mat, { title: T.props.people[p.id], sub: T.props.blood.sub, footer: T.props.blood.footer, color: p.color, liquidColor: new THREE.Color(BLOOD).getHex(), liquidOpacity: 1 });
    b.liquid.setLevel(3.8);
    b.group.position.set(COLS_X[i], 0, POS.bottleZ);
    root.add(b.group);
    return b;
  });
  const sera = SERA.map((s) => {
    const b = makeNozzleBottle(mat, { title: T.props.sera[s.id], sub: T.props.serum.sub, footer: T.props.serum.footer, color: s.cap, liquidColor: new THREE.Color(s.liquid).getHex(), liquidOpacity: s.opacity });
    b.liquid.setLevel(3.5);
    b.group.position.copy(POS.serum[s.id]);
    root.add(b.group);
    return b;
  });
  const trays = PATIENTS.map((p, i) => {
    const t = makeTypingTray(mat, { name: T.props.people[p.id], color: p.color, serum: SERA.map((s) => s.well), seed: i + 1 });
    t.group.position.set(COLS_X[i], 0, POS.trayZ);
    root.add(t.group);
    return t;
  });
  const cup = makeStickCup(mat);
  cup.group.position.copy(POS.cup);
  const bin = makeWasteBin(mat, { label: T.props.bin });
  bin.group.position.copy(POS.bin);
  const printed = mesh(new THREE.PlaneGeometry(MAT.w, MAT.d), mat.make.standard({ map: printedMat(), roughness: 0.95, transparent: true, depthWrite: false }), { cast: false });
  printed.rotation.x = -Math.PI / 2;
  printed.position.set(0, 0.02, MAT.z0 + MAT.d / 2);
  printed.userData.noSketch = true;
  root.add(cup.group, bin.group, printed);
  return { props: { bloods, sera, trays, cup, bin } };
}
