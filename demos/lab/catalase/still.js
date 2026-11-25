/* The /labs card's picture (lab/still.html): 1A4E's four chains as ribbons in their registry hues,
 * the tetramer molecule.js opens on. The intro card keeps the yeast jar.
 * Turned by catalase's human-picked basis for the 'tetramer' frame: the bake is fitted into
 * 1DGF-site's frame, which is 1DGF's own (chain A superposes with no rotation). */
import * as THREE from 'three';
import { createPropArt } from '../intro.js';

const script = (src) => new Promise((ok, no) => {
  const s = document.createElement('script');
  s.src = new URL(src, import.meta.url); s.onload = ok; s.onerror = no;
  document.head.appendChild(s);
});
await script('../../kit/ribbon.js');
await script('../../proteins/proteins.js');
const j = await (await fetch(new URL('../../proteins/catalase/data/catalase-1A4E-tetramer.json', import.meta.url))).json();
const CAT = globalThis.ProteinLib.byKey('catalase');
const HUE = CAT.draw.byStrand, B = CAT.view.basis.tetramer;

const box = document.querySelector('.intro-art');
box.introArt = createPropArt(box, () => {
  const g = new THREE.Group();
  g.setRotationFromMatrix(new THREE.Matrix4().set(...B[0], 0, ...B[1], 0, ...B[2], 0, 0, 0, 0, 1));
  for (const id of j.order) {
    const c = j.chains[id];
    const ca = c.CA.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(HUE[id]), roughness: 0.55 });
    g.add(new THREE.Mesh(RibbonLib.build(THREE, ca, c.ss.split(''), { sub: 4 }), mat));
  }
  return new THREE.Group().add(g);
}, { tilt: 0, fill: 0.9 });
