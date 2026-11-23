/* The intro card's strawberry, started before main.js so it shows while the bench loads. */
import { createPropArt } from '../intro.js';
import { makeStrawberry } from '../props/specimens.js';

const box = document.querySelector('.intro-art');
const skip = new URLSearchParams(location.search).get('intro') === '0' || document.getElementById('intro').classList.contains('hide');
if (box && !skip) box.introArt = createPropArt(box, (mat) => makeStrawberry(mat, { calyx: true }).group, { tilt: 0.25 });
