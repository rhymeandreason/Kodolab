/* Strawberry DNA — DNA extraction lab, rebuilt on the shared Lab library.
 * The original lives in /Strawberry and is untouched.
 *
 * The whole experiment runs on one clock, S.t (0..6, one unit per original
 * step). Each click animates S.t from one resting point to the next with
 * anim(); the bench (bench.js), the cell (cell.js) and the molecules
 * (molecule.js) are all posed from S.t, so replaying, jumping and the zoom
 * circles always agree. */
import * as THREE from 'three';
import {
  V3, lerp, Ease, anim, newSession, disposeTree, toast, isInstant,
  createStage, createMaterials, createInteraction, createLesson, createFollowCam, cues, createZoom,
  createIntro, chromeInsets, bindChrome,
} from '../lab.js';
import { buildBench } from './bench.js';
import { createCell } from './cell.js';
import { createMolecule } from './molecule.js';

const $ = (s) => document.querySelector(s);

// =========================================================================
// Camera views (bench), one per step
// =========================================================================
const VIEWS = {
  overview: { t: V3(-2, 3, 0), p: V3(0, 44, 66) },
  berry: { t: V3(-6, 2, 4), p: V3(4, 22, 38) },
  mash: { t: V3(-11, 1.5, 2), p: V3(-5, 20, 24) },
  pour: { t: V3(-18, 4, 3), p: V3(-12, 26, 36) },
  mix: { t: V3(-12, 2, 1), p: V3(-6, 22, 27) },
  filter: { t: V3(6, 14, 0), p: V3(18, 30, 56) },
  funnel: { t: V3(4, 8, -5), p: V3(10, 28, 44) },
  alcohol: { t: V3(13, 9, -0.5), p: V3(4, 16, 32) },
  dna: { t: V3(11, 6.4, 1), p: V3(7.5, 11, 18.5) },        // close on the tube while the DNA forms
  spool: { t: V3(17, 6.5, 6), p: V3(11, 24, 42) },       // the tube and the skewer on the bench
  spoolIn: { t: V3(11, 9.2, 1), p: V3(14.5, 14.5, 17.5) }, // close on the tube while the skewer twirls at the boundary
  spooled: { t: V3(10.3, 18.3, 2.3), p: V3(14.5, 23.5, 12) }, // the DNA wound on the lifted skewer (lab complete), a little from above so the bench is behind it
};

// =========================================================================
// Stage, materials, zoom levels
// =========================================================================
const stage = createStage({
  canvas: $('#scene'),
  views: VIEWS,
  controls: { minDistance: 8, maxDistance: 140 },
  insets: (w, h) => chromeInsets(w, h),
});
const mat = createMaterials(stage);

let S = { t: 0, mash: 0 };   // bench state: recreated by rebuild()
let root = null, B = null;
let lesson, ix;

// which original step (0..5) a lesson step belongs to: picks the cell/molecule views and text
const origStep = () => { const s = STEPS[lesson ? lesson.step : 0]; return s ? s.orig : 5; };
const zoom = createZoom(stage, {
  levels: [
    { key: 'cell', world: createCell(stage.env), name: 'Cell', meta: '≈ 100 µm', bg: '#e9f2ee' },
    { key: 'mol', world: createMolecule(stage.env), name: 'Molecule', meta: '≈ 10 nm', bg: '#eceaf6' },
  ],
  getT: () => S.t,
  getStep: origStep,
  onChange: (scale) => { lesson.holdWatch(scale !== 'lab'); lesson.render(); requestAnimationFrame(() => stage.resize()); },
});

// =========================================================================
// What's happening at each level (from the original lab's steps.js)
// =========================================================================
const LEVELS = [
  {
    lab: 'Strawberries are perfect for DNA extraction. They are soft and easy to mash. They are also octoploid: every cell carries eight copies of each chromosome, so there is a lot of DNA to collect.',
    cell: 'The fruit is made of millions of plant cells. A rigid cellulose wall surrounds each cell membrane. The nucleus holds the DNA, and a large central vacuole stores the red pigments that colour the berry.',
    mol: 'Inside the nucleus, DNA is a double helix: two sugar–phosphate backbones joined by base pairs (A–T and G–C). It is wound around histone proteins and enclosed by membranes made of phospholipids.',
  },
  {
    lab: 'Mashing breaks the fruit into a pulp. This exposes far more cells to the extraction buffer you will add next.',
    cell: 'Squeezing ruptures the tough cellulose cell walls and pulls the tissue apart. Neighbouring cells separate, and the cell contents are now only held in by the soft membrane.',
    mol: 'Nothing has changed at this scale yet. The membranes are still intact, and the DNA is still packed with proteins inside the nucleus.',
  },
  {
    lab: 'The buffer mixes into the pulp and turns it pink and foamy. Mix gently: rough handling breaks the long DNA strands into short pieces.',
    cell: 'Soap dissolves every membrane. The cell membrane, the vacuole and the nuclear envelope fall apart, so the DNA spills out into the liquid along with the red pigment.',
    mol: 'Soap molecules have a water-loving head and a fat-loving tail. They pull phospholipids out of the membrane into tiny balls called micelles. Na⁺ ions from the salt cluster around DNA’s negative phosphates and help strip off the histone proteins.',
  },
  {
    lab: 'The filter holds back seeds, pulp and cell debris. The pink liquid that drips through is called the filtrate, and it contains the dissolved DNA.',
    cell: 'Pieces of cell wall, plastids and other large debris are caught by the filter. Long DNA strands, micelles and pigment pass straight through.',
    mol: 'DNA from thousands of cells now floats freely in salty water. The Na⁺ ions surround its backbone. DNA dissolves easily in water, so it is still invisible.',
  },
  {
    lab: 'Alcohol is less dense than the watery filtrate, so it floats on top. Within seconds, cloudy white strands appear where the two layers meet. That is DNA!',
    cell: 'DNA cannot stay dissolved in alcohol. Millions of strands come out of solution and tangle together into threads thick enough to see.',
    mol: 'Alcohol pulls water away from the DNA. With its charges already shielded by Na⁺, the helices stick to each other and precipitate (come out of solution). Proteins stay dissolved in the liquid below.',
  },
  {
    lab: 'You are holding DNA from thousands of strawberry cells! It looks like white, stringy goo because millions of strands are clumped together. A single DNA molecule is far too thin to see.',
    cell: 'As the skewer turns, the long fibres wind around each other, like spaghetti twirling onto a fork.',
    mol: 'Every visible fibre is a bundle of countless double helices. One helix is only 2 nanometres wide, about 40,000 times thinner than a human hair.',
  },
];
/** The card's "why" line follows the level in the main view. */
const why = (i) => () => {
  const k = zoom.scale;
  return k === 'lab' ? LEVELS[i].lab : `<b>${zoom.names[k]} level:</b> ${LEVELS[i][k]}`;
};

// =========================================================================
// The bench (rebuilt on every jump)
// =========================================================================
function rebuild() {
  if (root) { stage.scene.remove(root); disposeTree(root); }
  ix.clear();
  root = new THREE.Group();
  stage.scene.add(root);
  S = { t: 0, mash: 0 };
  B = buildBench(mat, root);
  const P = B.props;
  // targets
  // the strawberry and its leaves are one target: one click pulls the leaves off and bags it
  ix.register('berry', B.berryGroup, { name: 'Strawberry', short: 'Strawberry', desc: 'Soft, ripe and octoploid: eight copies of every chromosome in each cell.', anchor: V3(0, 1.9, 0) });
  ix.addGroup('berry', P.calyx.group);
  ix.register('bag', P.bag.group, { name: 'Zip-top bag', short: 'Bag', desc: 'Holds the strawberry while you mash it.', anchor: V3(0, 2.2, 0) });
  ix.register('beaker', P.beaker.group, { name: 'Extraction buffer', short: 'Buffer', desc: 'Water + a squirt of dish soap + a pinch of salt.', anchor: V3(0, 9.4, 0) });
  ix.register('funnel', P.funnel.group, { name: 'Funnel + coffee filter', short: 'Funnel', desc: 'Holds back seeds, pulp and cell debris. The liquid passes through.', anchor: V3(0, 7.4, 0) });
  ix.register('bottle', P.bottle.group, { name: 'Isopropyl alcohol', short: 'Alcohol', desc: 'Ice-cold. DNA does not dissolve in alcohol, so it comes out of solution.', anchor: V3(0, 10.6, 0), ringAround: P.ice.group });
  ix.register('skewer', P.skewer.group, { name: 'Wooden skewer', short: 'Skewer', desc: 'Twirl it at the boundary between the layers to wind up the DNA.', anchor: V3(0, 7.5, 0) });
  // things to hover for their name and what they do
  ix.register('soap', P.soap.group, { name: 'Dish soap', desc: 'Detergent: pulls apart the fatty (lipid) membranes around cells and nuclei.' });
  ix.register('salt', P.salt.group, { name: 'Salt (NaCl)', desc: 'Na⁺ ions shield the negative charge on DNA so strands can clump together.' });
  ix.register('tube', P.tube.group, { name: 'Test tube', desc: 'Collects the filtered liquid. DNA gathers where the alcohol meets it.' });
  ix.register('cup', P.cup.group, { name: 'Waste bin', desc: 'Somewhere to put the used funnel and filter.' });
  ix.register('ice', P.ice.group, { name: 'Ice bath', desc: 'Keeps the alcohol ice-cold. DNA is even less soluble when it is cold.' });
  ix.register('bowl', P.bowl.group, { name: 'Strawberries', desc: 'Kiwi, banana and onion work too, but strawberries give the most DNA.' });
}

/** Run the experiment clock from where it is to t1 over dur seconds. */
function clockTo(t1, dur) {
  const t0 = S.t;
  return anim(dur, (e, k) => { S.t = lerp(t0, t1, k); }, Ease.linear);
}
const MASH = [[1.5, 2.2], [1.7, 1.6], [2.0, 2.2]]; // [t at rest after the click, seconds]

// =========================================================================
// Steps
// =========================================================================
const STEPS = [
  {
    id: 'berry', orig: 0, title: 'Prepare the strawberry', short: 'Strawberry', targets: ['berry'], view: 'berry',
    caption: cues(() => S.t, [[0, 'Pull the green leaves off the strawberry'], [0.42, 'Put it in a zip-top bag'], [0.9, 'Seal the bag']]),
    action: 'pull off the leaves and put it in the bag',
    hint: 'Click the <b>strawberry</b> to pull off the leaves and put it in the bag',
    detail: 'Choose one ripe strawberry, pull off the green leaves (the calyx), put it in a zip-top bag and seal it.',
    why: why(0),
    run: () => clockTo(1.28, 3.8),  // leaves off (0-0.6, eased out), into the bag (0.42-0.95), bag sealed (0.9-1.28)
  },
  {
    id: 'mash', orig: 1, title: 'Mash the strawberry', short: 'Mash', targets: ['bag'], view: 'mash',
    caption: cues(() => S.t, [[1.28, 'Squish the strawberry through the bag'], [1.6, 'Keep mashing until there are no large lumps']]),
    action: 'squish the bag',
    hint: () => (S.mash === 0 ? 'Click the <b>bag</b> to squish the strawberry' : `Click the <b>bag</b> to keep squishing · <b>${S.mash}/3</b>`),
    detail: 'Squish the strawberry through the bag with your fingers for about 2 minutes, until there are no large lumps.',
    why: why(1),
    run: async () => { const [t1, dur] = MASH[S.mash]; S.mash++; await clockTo(t1, dur); },
    isDone: () => S.mash >= 3,
    progress: () => S.mash / 3,
  },
  {
    id: 'pour', orig: 2, title: 'Add extraction buffer', short: 'Buffer', targets: ['beaker'], view: 'pour',
    caption: cues(() => S.t, [[2.0, { text: 'Pour in the extraction buffer', note: 'Water, dish soap and a pinch of salt' }], [2.4, 'The soap breaks open the cells']]),
    action: 'pour in the buffer',
    hint: 'Click the <b>buffer beaker</b> to pour it into the bag',
    detail: 'Pour about 10 mL of extraction buffer (water, a squirt of dish soap and a pinch of salt) into the bag.',
    why: why(2),
    run: () => clockTo(2.7, 5.5),
  },
  {
    id: 'mix', orig: 2, title: 'Mix gently', short: 'Mix', targets: ['bag'], view: 'mix',
    caption: { text: 'Mix it gently for another minute', note: 'Rough mixing breaks the DNA into pieces' },
    action: 'mix it gently',
    hint: 'Click the <b>bag</b> to mix it gently',
    detail: 'Mash gently for 1 more minute without making lots of bubbles.',
    why: why(2),
    run: () => clockTo(3.0, 2.8),
  },
  {
    id: 'filter', orig: 3, title: 'Filter the mixture', short: 'Filter', targets: ['bag'], view: 'filter',
    caption: cues(() => S.t, [[3.0, 'Pour the mixture through a coffee filter'], [3.36, 'The pink liquid drips into the test tube']]),
    action: 'pour it through the filter',
    hint: 'Click the <b>bag</b> to pour it through the filter',
    detail: 'Pour the mixture through a coffee filter in a funnel and collect the liquid in a test tube.',
    why: why(3),
    run: () => clockTo(4.0, 9),
  },
  {
    id: 'funnel', orig: 4, title: 'Remove the funnel', short: 'Funnel', targets: ['funnel'], view: 'funnel',
    caption: cues(() => S.t, [[4.0, 'Lift out the funnel and filter'], [4.1, 'The pink filtrate stays in the tube']]),
    action: 'lift out the funnel',
    hint: 'Click the <b>funnel</b> to lift it out of the tube',
    detail: 'Lift the funnel and filter out of the test tube and set them in the waste bin. The pink filtrate stays in the tube.',
    why: why(3),
    run: () => clockTo(4.15, 1.8),
  },
  {
    id: 'alcohol', orig: 4, title: 'Add ice-cold alcohol', short: 'Alcohol', targets: ['bottle'], view: 'alcohol',
    caption: cues(() => S.t, [
      [4.15, { text: 'Slowly pour ice-cold alcohol down the side of the tube', note: 'Don’t mix!' }],
      [4.78, 'The alcohol floats on top in its own layer'],
      [4.92, 'Wait a few minutes and watch where the layers meet'],
      [4.975, 'White strands of DNA appear!'],
    ]),
    action: 'pour the alcohol',
    hint: 'Click the <b>alcohol</b> to pour a layer on top',
    detail: 'Slowly pour ice-cold isopropyl alcohol down the side of the tube to form a layer on top. Do not mix! Then leave it for a few minutes and watch where the layers meet.',
    why: why(4),
    run: async () => {
      await clockTo(4.92, 5.5);              // the pour
      if (!isInstant()) {                     // then a close look at the tube while the DNA forms
        follow.hold();                        // Watch mode: keep this view, don't reframe the bottle
        stage.focus('dna', 1.6);
      }
      await clockTo(4.94, 1.6);               // outside the if, so the lesson's dry run counts it
      await clockTo(5.0, 6);                  // real life: a few minutes; strands gather at the boundary
    },
    // time-lapse clock on the card: 0:00 → 5:00 of real time over the wait (t 4.92 → 5.0)
    clock: () => {
      if (S.t < 4.92) return null;
      const sec = Math.round(Math.min(1, (S.t - 4.92) / 0.08) * 300);
      return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} min`;
    },
  },
  {
    id: 'spool', orig: 5, title: 'Spool the DNA', short: 'Spool', targets: ['skewer'], view: 'spool',
    caption: cues(() => S.t, [[5.0, 'Lower a wooden skewer to where the layers meet'], [5.3, 'Twirl it slowly to wind up the DNA'], [5.72, 'Lift out the DNA']]),
    action: 'twirl the skewer',
    hint: 'Click the <b>skewer</b> to wind up the DNA',
    detail: 'Lower a wooden skewer to the boundary between the layers and twirl it slowly. Lift out the DNA that winds around it.',
    // no why here: what you are holding is explained on the complete card (completeWhy)
    run: async () => {
      await clockTo(5.17, 1.6);              // skewer over to the tube
      const close = (v) => { if (!isInstant()) { follow.hold(); stage.focus(v, 1.4); } };
      close('spoolIn');                      // in close while it goes in and twirls
      await clockTo(5.72, 5);
      close('spooled');                      // follow it up as it lifts the DNA out
      await clockTo(6.0, 2.6);
    },
  },
];
// Bench clicks only work in the Lab view: elsewhere the card says how to get back.
STEPS.forEach((s) => {
  const hint = s.hint;
  s.hint = () => (zoom.scale === 'lab'
    ? (typeof hint === 'function' ? hint() : hint)
    : `Click the <b>Lab</b> circle to go back to the bench and ${s.action}`);
});
const PHASES = [
  { title: 'Prepare the berry', desc: 'Leaves off, into the bag', steps: ['berry'] },
  { title: 'Mash', desc: 'Squish it in the bag', steps: ['mash'] },
  { title: 'Extraction buffer', desc: 'Soap and salt break the cells open', steps: ['pour', 'mix'] },
  { title: 'Filter', desc: 'Strain out the pulp', steps: ['filter'] },
  { title: 'Cold alcohol', desc: 'Float alcohol on the filtrate', steps: ['funnel', 'alcohol'] },
  { title: 'Spool the DNA', desc: 'Wind it onto a skewer', steps: ['spool'] },
];

// =========================================================================
// Wire it together
// =========================================================================
let firstEnter = true;
lesson = createLesson({
  steps: STEPS,
  phases: PHASES,
  rebuild,
  panel: $('#stepsPanel'),
  completeHint: '<b>You extracted strawberry DNA.</b> Click the circles to see the cell and the molecules.',
  completeWhy: why(5),
  completeCaption: { text: 'You extracted strawberry DNA!', note: 'Click the circles to zoom into the cell and the molecules' },
  onEnter: (step) => {
    requestAnimationFrame(() => stage.resize()); // the card's new height changes the free area
    zoom.onStep();
    if (!step) { stage.focus('spooled', 1.6); toast('DNA spooled — zoom in to see what happened', { icon: 'ph-dna' }); return; }
    if (firstEnter) { firstEnter = false; intro.started.then(() => stage.focus(step.view, 2.2)); return; } // the opening move, after Start
    stage.focus(step.view);
  },
});
const benchActive = () => zoom.scale === 'lab' && !zoom.transitioning;
ix = createInteraction(stage, {
  targets: () => (benchActive() ? lesson.targets() : []),
  busy: lesson.isBusy,
  onClick: (k) => (benchActive() ? lesson.click(k) : undefined),
  status: lesson.status,
  markerStyle: new URLSearchParams(location.search).get('marker') || 'circle',
  enabled: benchActive,
});
// Watch mode's camera: one default zoom that pans along the bench; only the close-ups
// on the DNA zoom in (rules in follow.js)
const follow = createFollowCam(stage, ix, {
  acting: lesson.acting,
  watching: () => lesson.mode === 'watch',
  rig: { t: V3(0, 4.5, 1), p: V3(5, 26.5, 43) },
  special: ['dna', 'spoolIn', 'spooled'],
  keepClose: ['spool'],   // stay close from the DNA forming to the skewer going in
});

function restart() {
  newSession();
  firstEnter = false;
  lesson.restart();
}

stage.onFrame((dt, now) => {
  lesson.update(dt);
  follow.update(dt);
  if (B) B.tick(S.t, now / 1000);
  zoom.update(dt);
  ix.update();
});


// the intro card (its strawberry is started early by intro-art.js)
const intro = createIntro(stage);

bindChrome({ stage, zoom, restart, expose: { get S() { return S; }, get B() { return B; }, lesson, ix, stage, follow, zoom, STEPS, intro } });

stage.focus(VIEWS.overview, 0);
lesson.start();
stage.start();
