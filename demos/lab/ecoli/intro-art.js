/* The intro card's plasmid, started before main.js so it shows while the bench loads. */
import { createPlasmidArt } from './intro.js';

const box = document.querySelector('.intro-art');
const skip = new URLSearchParams(location.search).get('intro') === '0' || document.getElementById('intro').classList.contains('hide');
if (box && !skip) box.introArt = createPlasmidArt(document.getElementById('plasmid3d'), document.getElementById('plasmidCanvas'));
