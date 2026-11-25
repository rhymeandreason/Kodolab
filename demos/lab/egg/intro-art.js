/* The intro card's egg, shell dissolved, started before main.js so it shows while the bench loads. */
import * as THREE from 'three';
import { createPropArt } from '../intro.js';
import { makeEgg } from '../props/animals.js';

const box = document.querySelector('.intro-art');
const skip = new URLSearchParams(location.search).get('intro') === '0' || document.getElementById('intro').classList.contains('hide');
if (box && !skip) box.introArt = createPropArt(box, (mat) => {
  const g = new THREE.Group(); g.add(makeEgg(mat).setShell(1).group);
  g.rotation.z = -Math.PI / 2;   // makeEgg lies on its side; stand it on end
  return g;
}, { tilt: 0.3 });
