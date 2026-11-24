/* Every word Juniper's Seizures shows, in English. Edit freely: the code only names these keys.
 * A translation is text.<lang>.js beside this file, LabText.add('<lang>', { … }) with only
 * the keys it translates (lab/page.js loads it for ?lang=<lang>).
 * Markup allowed: <b>, <i>, <em>, <sup>, <a>. {name} is filled in by the code. */
LabText.add('en', {
  title: 'Juniper’s Seizures',
  icon: 'ph-drop',

  /* the title card. The case is from Osmosis Case Study, used with its author's permission */
  intro: {
    kicker: 'Interactive 3D case',
    title: 'Why is Juniper <em>seizing</em>?',
    body: 'Juniper, a 3-week-old calf, got diarrhea. Her owner stopped her milk and gave her all the fresh water she wanted. Now she can’t stand, and every few minutes she has a seizure. Find out what the water did.',
    keys: [
      { color: '#38bdf8', text: '<b>Water</b> crosses a membrane toward the side with more dissolved particles' },
      { color: '#94a3b8', text: '<b>Sodium</b> can’t follow it quickly, so cells swell or shrink' },
      { color: '#ef4444', text: '<b>Treatment</b> moves water back out, but not too fast' },
    ],
  },

  introArt: {
    alt: 'Juniper, a black-and-white calf, lying on her side and trembling.',
    credit: 'Juniper and her case: <a href="https://naddicott-dtech.github.io/OsmosisCaseStudy/" target="_blank" rel="noopener">Osmosis Case Study</a> by naddicott-dtech',
  },

  info: {
    kicker: 'About the case',
    title: 'Too much plain water',
    body: ['Diarrhea loses water and salt. Plain water replaces only the water, so blood sodium falls. Brain cells keep their solutes, so water moves into them and they swell inside the skull.'],
  },

  phases: {
    setup: { title: 'Set up', desc: 'Placeholder while the lab is built' },
  },

  steps: {
    scope: {
      title: 'Switch on the microscope', short: 'Microscope',
      action: 'switch on the lamp',
      hint: 'Click the <b>microscope</b> to switch on its lamp',
      detail: 'Placeholder step. The blood tests go here.',
    },
  },

  complete: {
    hint: '<b>Scaffold only.</b> The case steps come next.',
    why: '',
  },

  objects: {
    scope: { name: 'Microscope', short: 'Microscope', desc: 'Compound light microscope' },
    rack: { name: 'Tube rack', short: 'Rack', desc: 'Holds the saline tubes' },
  },
});
