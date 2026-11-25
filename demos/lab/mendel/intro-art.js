/* The intro card's open F₂ pod, yellow and green peas side by side, started before main.js so it shows while the bench loads. */
import { createPropArt } from '../intro.js';
import { makePeaPod } from '../props/peas.js';

const box = document.querySelector('.intro-art');
const skip = new URLSearchParams(location.search).get('intro') === '0' || document.getElementById('intro').classList.contains('hide');
if (box && !skip) {
  box.introArt = createPropArt(box, (mat) => {
    const pod = makePeaPod(mat, { peas: ['Y', 'Y', 'y', 'Y', 'Y', 'y', 'Y'], seed: 4 });
    pod.setGrowth(1); pod.setDry(1); pod.setOpen(1);
    pod.group.rotation.z = Math.PI / 2;
    return pod.group;
  }, { tilt: 0.45 });
}
