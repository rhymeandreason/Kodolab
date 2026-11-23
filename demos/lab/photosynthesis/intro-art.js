/* The intro card's spinach leaf, started before main.js so it shows while the bench loads. */
import { createPropArt } from '../intro.js';
import { makeLeaf } from '../props/specimens.js';

const box = document.querySelector('.intro-art');
const skip = new URLSearchParams(location.search).get('intro') === '0' || document.getElementById('intro').classList.contains('hide');
if (box && !skip) box.introArt = createPropArt(box, (mat) => makeLeaf(mat, { seed: 1 }).group, { tilt: 0.9 });
