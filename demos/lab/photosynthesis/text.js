/* Every word Floating Leaf Disks shows, in English. Edit freely: the code only names these keys.
 * A translation is text.<lang>.js beside this file, LabText.add('<lang>', { … }) with only
 * the keys it translates (lab/page.js loads it for ?lang=<lang>).
 * Markup allowed: <b>, <i>, <em>, <sub>. {name} is filled in by the code: {disks} is how many
 * disks go in each syringe, {total} how many are cut. Timings, colours and amounts the
 * animation acts out live in the code. */
LabText.add('en', {
  title: 'Floating Leaf Disks',
  icon: 'ph-leaf',

  /* the title card */
  intro: {
    kicker: 'Interactive 3D lab',
    title: 'Make leaf disks <em>float</em>',
    body: 'Leaves use light to turn carbon dioxide and water into sugar, and give off <b>oxygen</b>. Sink small disks of spinach leaf, shine a lamp on them, and time how fast the oxygen floats them back up.',
    keys: [
      { color: '#38bdf8', text: '<b>Bicarbonate</b> gives the leaf the CO<sub>2</sub> it needs' },
      { color: '#f59e0b', text: '<b>Light</b> powers photosynthesis in the chloroplasts' },
      { color: '#22c55e', text: '<b>Oxygen</b> fills the air spaces and lifts the disks' },
    ],
  },

  /* the (i) button's modal */
  info: {
    kicker: 'About the experiment',
    title: 'Why do leaf disks float?',
    body: ['A spinach leaf is full of tiny air spaces in its <b>spongy mesophyll</b>. Air makes a fresh leaf disk float.'],
    steps: [
      { head: 'Sink the disks.', text: 'A syringe vacuum pulls the air out. Bicarbonate solution flows in, so the disks get denser than water and sink.' },
      { head: 'Add light.', text: 'Chloroplasts use light energy and CO<sub>2</sub> (from the bicarbonate) to photosynthesize.' },
      { head: 'Oxygen lifts them.', text: 'O<sub>2</sub> collects in the air spaces and the disks float back up. Faster floating means faster photosynthesis.' },
    ],
    equation: '6CO<sub>2</sub> + 6H<sub>2</sub>O <i class="ph ph-arrow-right"></i> C<sub>6</sub>H<sub>12</sub>O<sub>6</sub> + 6O<sub>2</sub>',
    notes: ['Measure the rate with <b>ET<sub>50</sub></b>: the time it takes half the disks to float. The control cup has no bicarbonate, so it has no CO<sub>2</sub> source.'],
    tips: [
      { icon: 'ph-mouse-left-click', text: 'Click objects to use them · drag to orbit · scroll to zoom · right-drag to pan · use the timeline to go back or skip ahead' },
    ],
  },

  /* the procedure list's groups */
  phases: {
    prepare: { title: 'Prepare solutions', desc: 'Bicarbonate & soapy water' },
    cut: { title: 'Cut leaf disks', desc: '{total} disks from a spinach leaf' },
    sink: { title: 'Sink the disks', desc: 'Vacuum the air out in a syringe' },
    observe: { title: 'Light & observe', desc: 'Count floating disks over time' },
  },

  /* each step: the card (title, hint, detail, why), the click label (action: "Click to …"), and
     Watch mode's caption. A step that changes partway has captions instead */
  steps: {
    soda: {
      title: 'Add baking soda', short: 'Baking soda',
      action: 'add a scoop to the left beaker',
      hint: 'Click the <b>sodium bicarbonate</b> jar',
      detail: 'Add one scoop of baking soda (NaHCO<sub>3</sub>) to the left beaker of water to make a ~0.2% bicarbonate solution.',
      why: 'Dissolved bicarbonate releases CO<sub>2</sub>, the carbon source the leaf needs for photosynthesis.',
      caption: { text: 'Add a scoop of baking soda to the left beaker', note: 'It gives the leaves CO₂' },
    },
    soap: {
      title: 'Add a drop of soap', short: 'Soap',
      action: 'add a drop to each beaker',
      hint: 'Click the <b>pipette</b> to add soap',
      detail: 'Use the pipette to add one drop of dilute soap to each beaker.',
      why: 'Soap is a surfactant. It wets the waxy, water-repelling leaf surface so solution can get into the leaf.',
      caption: 'Add one drop of soap to each beaker',
    },
    stir: {
      title: 'Stir the solutions', short: 'Stir',
      action: 'stir its beaker',
      hint: 'Click each <b>stirring rod</b> to stir its beaker',
      hintMore: 'Now click the other <b>stirring rod</b>',
      detail: 'Stir each beaker with its own rod until the bicarbonate dissolves and the solution is clear.',
      why: 'A separate rod for each beaker keeps bicarbonate out of the control. Fully dissolved powder gives a known CO<sub>2</sub> concentration.',
      captions: {
        left: 'Stir the left beaker until the baking soda dissolves',
        right: 'Stir the right beaker with its own rod',
      },
    },
    fill: {
      title: 'Fill both cups', short: 'Fill cups',
      action: 'pour 150 mL into it',
      hint: 'Click <b>cup A</b> and <b>cup B</b> to fill them',
      hintMore: 'Now click <b>cup {cup}</b>',
      detail: 'Pour 150 mL of bicarbonate solution into cup A, and 150 mL of plain soapy water into cup B, the control.',
      why: 'The control has no CO<sub>2</sub> source, so any difference between the cups comes from the bicarbonate.',
      captions: {
        a: 'Pour 150 mL of bicarbonate solution into cup A',
        b: { text: 'Pour 150 mL of plain soapy water into cup B', note: 'Cup B is the control: no CO₂' },
      },
    },
    punch: {
      title: 'Punch {total} leaf disks', short: 'Punch disks',
      action: 'punch {total} disks',
      hint: 'Click the <b>hole punch</b> to cut leaf disks',
      detail: 'Punch {total} disks from the spinach leaf into the petri dish. Avoid the big midrib vein.',
      why: 'Same-sized disks make the groups comparable. Veins have no air-filled mesophyll.',
      caption: { text: 'Punch {total} disks from the spinach leaf', note: 'Avoid the big vein' },
    },
    load1: {
      title: 'Load syringe 1', short: 'Load 1',
      action: 'load {disks} disks',
      hint: 'Click <b>syringe 1</b> to load {disks} disks',
      detail: 'Pull out the plunger, drop in {disks} leaf disks, and put the plunger back.',
      why: 'Each cup gets its own set of fresh disks, so the trials are independent.',
      caption: 'Load {disks} leaf disks into syringe 1',
    },
    draw1: {
      title: 'Draw up bicarbonate solution', short: 'Draw 1',
      action: 'draw up 5 mL',
      hint: 'Click the <b>bicarbonate beaker</b> to draw up 5 mL',
      detail: 'Put the tip in the bicarbonate solution and pull the plunger back to draw up about 5 mL. The disks float at the top.',
      why: 'The disks still float because their spongy mesophyll is full of air.',
      caption: { text: 'Draw up 5 mL of bicarbonate solution', note: 'The disks float: the leaf is full of air' },
    },
    vac1: {
      title: 'Pull a vacuum', short: 'Vacuum 1',
      action: 'pull the plunger',
      hint: 'Click <b>syringe 1</b> to pull the plunger · <b>{sunk}/{disks}</b> sunk',
      detail: 'Cap the tip, then pull the plunger back and let it go. Repeat until every disk sinks.',
      why: 'The vacuum pulls air out of the leaf. When you let go, solution flows into the air spaces, so the disks become denser and sink.',
    },
    empty1: {
      title: 'Pour into cup A', short: 'Pour 1',
      action: 'pour in the disks',
      hint: 'Click <b>cup A</b> to pour in the disks',
      detail: 'Take out the plunger and pour the disks into cup A. They should rest on the bottom.',
      why: 'Every disk starts at the bottom, so each one that floats later is a measurable result.',
      caption: { text: 'Pour the disks into cup A', note: 'They rest on the bottom' },
    },
    load2: {
      title: 'Load syringe 2 (control)', short: 'Load 2',
      action: 'load {disks} disks',
      hint: 'Click <b>syringe 2</b> to load {disks} disks',
      detail: 'Pull out the plunger, drop in {disks} leaf disks, and put the plunger back.',
      why: 'A separate syringe for the control stops bicarbonate from syringe 1 getting into it.',
      caption: { text: 'Load {disks} fresh disks into syringe 2', note: 'A clean syringe for the control' },
    },
    draw2: {
      title: 'Draw up water', short: 'Draw 2',
      action: 'draw up 5 mL',
      hint: 'Click the <b>water beaker</b> to draw up 5 mL',
      detail: 'Put the tip in the water and pull the plunger back to draw up about 5 mL. The disks float at the top.',
      why: 'The disks still float because their spongy mesophyll is full of air.',
      caption: { text: 'Draw up 5 mL of plain soapy water', note: 'The disks float: the leaf is full of air' },
    },
    vac2: {
      title: 'Pull a vacuum', short: 'Vacuum 2',
      action: 'pull the plunger',
      hint: 'Click <b>syringe 2</b> to pull the plunger · <b>{sunk}/{disks}</b> sunk',
      detail: 'Cap the tip, then pull the plunger back and let it go. Repeat until every disk sinks.',
      why: 'The vacuum pulls air out of the leaf. When you let go, solution flows into the air spaces, so the disks become denser and sink.',
    },
    empty2: {
      title: 'Pour into cup B', short: 'Pour 2',
      action: 'pour in the disks',
      hint: 'Click <b>cup B</b> to pour in the disks',
      detail: 'Take out the plunger and pour the disks into cup B. They should rest on the bottom.',
      why: 'Every disk starts at the bottom, so each one that floats later is a measurable result.',
      caption: { text: 'Pour the disks into cup B', note: 'They rest on the bottom' },
    },
    lamp: {
      title: 'Turn on the light', short: 'Lamp',
      action: 'switch it on',
      hint: 'Click the <b>lamp</b> to switch it on',
      detail: 'Place both cups under the lamp and switch it on.',
      why: 'Light drives the light-dependent reactions that split water and release O<sub>2</sub>.',
      caption: 'Place both cups under the lamp and switch it on',
    },
    timer: {
      title: 'Start the timer', short: 'Timer',
      action: 'start timing',
      hint: 'Click the <b>timer</b> to start counting',
      detail: 'Start timing as soon as the light is on.',
      caption: 'Start the timer',
    },
    observe: {
      title: 'Count floating disks', short: 'Observe',
      hint: 'Watch the cups. Drag the timeline to scrub through the {min} minutes',
      detail: 'Count the floating disks in each cup every minute. Look for tiny O<sub>2</sub> bubbles on the disks.',
      why: 'The faster a group reaches 50% floating (ET<sub>50</sub>), the faster it is photosynthesizing.',
      captions: {
        watch: { text: 'Watch for tiny oxygen bubbles on the disks', note: 'Count the floating disks every minute' },
        rising: { text: 'Oxygen bubbles lift the disks in cup A', note: '{n}/{disks} floating' },
        half: { text: 'Cup A passed half floating: that time is its ET₅₀', note: '{n}/{disks} floating' },
        control: { text: 'Cup B stays on the bottom', note: 'Without CO₂, its leaves can’t photosynthesize' },
      },
    },
  },
  /* the vacuum steps' captions, both syringes */
  vacuum: {
    start: 'Cap the tip and pull back the plunger to make a vacuum',
    bubbles: 'Air bubbles out of the leaf disks',
    again: 'Pull again until every disk sinks',
    sunkNote: '{sunk}/{disks} sunk',
    done: { text: 'Every disk has sunk', note: 'Solution now fills the air spaces' },
  },

  /* pop-up notes after a click (Hands-on mode) */
  toasts: {
    soda: 'Baking soda added. Stir it in later',
    soap: 'One drop of soap in each beaker',
    stirredAlready: 'Beaker {which} is already stirred',
    dissolved: 'Bicarbonate dissolved',
    controlStirred: 'Control stirred',
    filledAlready: 'Cup {which} is already filled',
    filledA: 'Cup A filled with bicarbonate solution',
    filledB: 'Cup B filled with water (control)',
    punched: '{total} leaf disks cut. Notice they float on water',
    loaded: '{disks} disks loaded into syringe {n}',
    drawnA: '5 mL of bicarbonate solution drawn. The disks float',
    drawnB: '5 mL of water drawn. The disks float',
    capped: 'Tip capped. Now the plunger can pull a vacuum',
    allSunk: 'All {disks} disks sank. The air spaces are full of solution',
    someSunk: '{n} sank · {sunk}/{disks}. Pull again',
    noneSunk: 'None sank · {sunk}/{disks}. Pull again',
    poured: 'Disks in cup {cup}. They rest on the bottom',
    lamp: 'Lamp on: light energy for the chloroplasts',
    timer: 'Timer started. Watch for oxygen bubbles',
    complete: 'Experiment complete. Check your ET₅₀',
  },

  complete: {
    hint: '<b>Lab complete.</b> Compare the two cups',
    caption: { text: 'Experiment complete: compare the two cups', note: 'Only cup A had CO₂ for photosynthesis' },
  },

  /* the observation panel, its chart and the result */
  panel: {
    title: 'Observations',
    cupA: 'Cup A · NaHCO<sub>3</sub>',
    cupB: 'Cup B · control',
    floating: '/{disks} floating',
    time: 'Time',
    clock: '{mm}:{ss}',
    axisEnd: '{t} min',
    et50: 'ET₅₀ {t} min',
    resultA: 'Cup A (NaHCO₃): ET<sub>50</sub> ≈ <b>{et}</b> · {n}/{disks} floated',
    resultB: 'Cup B (control): <b>{n}/{disks}</b> floated',
    minutes: '{t} min',
    notReached: 'not reached',
    explain: 'In the light, the disks with bicarbonate photosynthesized. O<sub>2</sub> filled their air spaces and they rose. The control disks had no CO<sub>2</sub> source, so they made no O<sub>2</sub> and stayed down.',
    again: 'Run the lab again',
  },

  /* bench objects: hover name, short name, and what they are for */
  objects: {
    jar: { name: 'Sodium bicarbonate', short: 'Baking soda', desc: 'NaHCO₃ powder. Dissolved in water it releases CO₂ for photosynthesis.' },
    beakerA: { name: 'Beaker · bicarbonate', short: 'Bicarbonate beaker', desc: '250 mL beaker of water that becomes the 0.2% NaHCO₃ solution.' },
    beakerB: { name: 'Beaker · water (control)', short: 'Water beaker', desc: 'Plain water with a drop of soap. No CO₂ source.' },
    soap: { name: 'Dilute soap', short: 'Soap', desc: '1% dish soap, a surfactant.' },
    pipette: { name: 'Transfer pipette', short: 'Pipette', desc: 'For adding single drops of soap.' },
    rodA: { name: 'Stirring rod · bicarbonate', short: 'Rod A', desc: 'Glass rod for the bicarbonate beaker.' },
    rodB: { name: 'Stirring rod · control', short: 'Rod B', desc: 'Glass rod for the water (control) beaker.' },
    leaf: { name: 'Spinach leaf', short: 'Spinach leaf', desc: 'Fresh spinach. Its spongy mesophyll is full of air spaces.' },
    punch: { name: 'Hole punch', short: 'Hole punch', desc: 'Cuts uniform 6 mm leaf disks.' },
    dish: { name: 'Petri dish', short: 'Petri dish', desc: 'Holds the cut leaf disks.' },
    syringe: { name: '10 mL syringe {n}', short: 'Syringe {n}', desc: 'Plastic syringe with no needle. Used to pull a vacuum on the leaf disks.' },
    cupA: { name: 'Cup A · bicarbonate', short: 'Cup A', desc: 'Leaf disks + NaHCO₃ solution, under the lamp.' },
    cupB: { name: 'Cup B · control', short: 'Cup B', desc: 'Leaf disks + water only (no bicarbonate).' },
    lamp: { name: 'Desk lamp', short: 'Lamp', desc: 'Bright LED lamp: the light energy for photosynthesis.' },
    timer: { name: 'Lab timer', short: 'Timer', desc: 'Time how long the disks take to float.' },
  },
  /* text printed on the bench props */
  props: {
    beakerA: { label: '0.2% NaHCO₃', sub: 'bicarbonate' },
    beakerB: { label: 'Water', sub: 'control' },
    soap: { label: 'Soap 1%' },
    cupA: { label: 'Cup A', sub: 'NaHCO₃ + light' },
    cupB: { label: 'Cup B', sub: 'control · water' },
  },
});
