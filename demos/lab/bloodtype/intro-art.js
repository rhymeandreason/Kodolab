/* The intro card's bottle, started before main.js so it shows while the bench loads. */
import { createPropArt } from '../intro.js';
import { makeNozzleBottle } from '../props/bottles.js';

const box = document.querySelector('.intro-art');
const skip = new URLSearchParams(location.search).get('intro') === '0' || document.getElementById('intro').classList.contains('hide');
if (box && !skip) box.introArt = createPropArt(box, (mat) => makeNozzleBottle(mat).group, { tilt: 0.2 });
