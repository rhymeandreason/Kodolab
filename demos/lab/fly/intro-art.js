/* The intro card's pair of flies, red-eyed female and white-eyed male, started before main.js so it shows while the bench loads. */
import * as THREE from 'three';
import { createPropArt } from '../intro.js';
import { makeFly } from '../props/fly.js';

const box = document.querySelector('.intro-art');
const skip = new URLSearchParams(location.search).get('intro') === '0' || document.getElementById('intro').classList.contains('hide');
if (box && !skip) {
  box.introArt = createPropArt(box, (mat) => {
    const g = new THREE.Group();
    const f = makeFly(mat, { sex: 'f', eye: 'red', seed: 1 }), m = makeFly(mat, { sex: 'm', eye: 'white', seed: 2 });
    f.setPose(0); m.setPose(0);
    f.group.position.set(-0.17, 0, 0.04); f.group.rotation.y = 0.5;
    m.group.position.set(0.15, 0, -0.04); m.group.rotation.y = 2.6;
    g.add(f.group, m.group);
    g.scale.setScalar(40);
    return g;
  }, { tilt: 0.5 });
}
