/* =============================================================================
 *  respiration/steps.js — every step of glycolysis, pyruvate oxidation, the
 *  Krebs cycle and fermentation, as data RespirationReaction drives
 * =============================================================================
 *  One record per reaction. No prose: the page that mounts the component says
 *  what a step means; this says what happens to which molecule, in the words
 *  reaction/reaction.js's verbs and the mol-*.js specs already use.
 *
 *  A STEP IS ONE REACTION ON ONE SUBSTRATE. Glycolysis after the split runs
 *  twice per glucose, and so does everything downstream; `perGlucose` says so
 *  and the stage draws the reaction once, badged ×2. The three hand-built
 *  lessons carry their own copies of this table beside a ledger and a tray;
 *  this one is the component's, and Modules.md says the physics has two homes.
 *
 *  FIELDS
 *    key        the step's name inside its pathway; `<pathway>/<key>` is the
 *               id a page sets and a diagram highlights
 *    n          its number in the textbook count (null for the bridge)
 *    name       two or three words, the step's title
 *    enzyme     printed under the stage
 *    from       substrate lane(s) before the step, spec keys
 *    to         substrate lane(s) after — what the reaction MAKES
 *    linger     a molecule left standing beside the product (free CoA)
 *    partner    the second molecule on stage, and what it becomes:
 *               {key, becomes} — a carrier (atp→adp, nad→nadh, fad→fadh2,
 *               nadh→nad) or a co-substrate (coa, oaa). Null: one molecule
 *    offstage   a carrier that takes part but is not drawn, because the
 *               stage holds two molecules and the second is the co-substrate.
 *               The hydride or phosphate leaves the frame toward it
 *    fx         the reaction/reaction.js verb; `anchor`, `dest`, `couple`
 *               and `co2` are what that verb reads off the step record
 *    acts       which lane the verb runs on: 'substrate' (default) or
 *               'partner' (a reduction: the hydride leaves NADH)
 *    spot       the click — `on` which lane, `at` the spec's own name for
 *               the atom or bond, `say` the prompt beside it
 *    act        the button's words when a page runs the step without a click
 *    perGlucose how many times this reaction happens per glucose
 *    rev        near-equilibrium, runs both ways
 *    yields     per single reaction: atp, nadh, fadh2, co2, as signed counts
 *    leaves     what departs (CO₂, H₂O); arrives — what comes from solution
 *
 *  Partner keys `adp`, `nad` and `fad` are DRAWN as the charged spec with the
 *  transferred group hidden (respiration.js's ALIASES), the same declared
 *  schematic fermentation-lab.html makes for NAD⁺. `atp` and `nadh` are the
 *  idealized skeletal builds every pathway page uses (MolecularGeometry.md
 *  §1.6). `fad` shadows MolLib's measured `fad` inside the component only.
 *
 *  Loaded after nothing; no THREE, no DOM. Exposes window.RespirationSteps.
 *  Checked by respiration/check-respiration.js.
 * ========================================================================== */
(function (global) {
'use strict';

const ATP  = { key: 'atp',  becomes: 'adp'   };
const ADP  = { key: 'adp',  becomes: 'atp'   };
const NAD  = { key: 'nad',  becomes: 'nadh'  };
const NADH = { key: 'nadh', becomes: 'nad'   };
const FAD  = { key: 'fad',  becomes: 'fadh2' };
const COA  = { key: 'coa',  becomes: null    };   // consumed into the product
const OAA  = { key: 'oaa',  becomes: null    };

const PATHWAYS = {
  glycolysis: {
    name: 'Glycolysis', where: 'cytosol', start: ['glucose'],
    steps: [
      { key: '1', n: 1, name: 'Trapping', enzyme: 'Hexokinase',
        from: ['glucose'], to: ['g6p'], partner: ATP,
        fx: 'in', anchor: 'p3', couple: true,
        spot: { on: 'partner', at: 'pg', say: 'Break off a phosphate' },
        act: 'Spend 1 ATP', perGlucose: 1, rev: false,
        yields: { atp: -1 } },
      { key: '2', n: 2, name: 'Shuffling', enzyme: 'Phosphoglucose isomerase',
        from: ['g6p'], to: ['f6p'], partner: null,
        fx: 'open',
        spot: { at: 'open', say: 'Open the ring' },
        act: 'Open the ring', perGlucose: 1, rev: true, yields: {} },
      { key: '3', n: 3, name: 'The committed step', enzyme: 'Phosphofructokinase-1',
        from: ['f6p'], to: ['f16bp'], partner: ATP,
        fx: 'in', anchor: 'p1', couple: true,
        spot: { on: 'partner', at: 'pg', say: 'Break off a phosphate' },
        act: 'Spend 1 more ATP', perGlucose: 1, rev: false,
        yields: { atp: -1 } },
      { key: '4', n: 4, name: 'The split', enzyme: 'Aldolase',
        from: ['f16bp'], to: ['dhap', 'g3p'], partner: null,
        fx: 'split',
        spot: { at: 'cleave', say: 'Break the bond to split' },
        act: 'Cleave the C3–C4 bond', perGlucose: 1, rev: true, yields: {} },
      { key: '5', n: 5, name: 'Streamlining', enzyme: 'Triose-phosphate isomerase',
        from: ['dhap', 'g3p'], to: ['g3p'], partner: null,
        fx: 'iso',
        spot: { at: 'movingH', say: 'Move the H' },
        act: 'Convert DHAP to G3P', perGlucose: 1, rev: true, yields: {},
        // ends with two of the same molecule, so the ×2 starts here
        x2After: true },
      { key: '6', n: 6, name: 'Electron theft', enzyme: 'Glyceraldehyde-3-phosphate dehydrogenase',
        from: ['g3p'], to: ['bpg13'], partner: NAD,
        fx: 'ox', anchor: 'p1', couple: true,
        spot: { at: 'aldehydeH', say: 'NAD⁺ takes a hydride' },
        act: 'Load NAD⁺', perGlucose: 2, rev: true,
        yields: { nadh: 1 }, arrives: ['Pi'] },
      { key: '7', n: 7, name: 'Break-even', enzyme: 'Phosphoglycerate kinase',
        from: ['bpg13'], to: ['pga3'], partner: ADP,
        fx: 'out', anchor: 'p1', couple: true,
        spot: { at: 'hot', say: 'Break off a phosphate' },
        act: 'Charge ADP', perGlucose: 2, rev: true,
        yields: { atp: 1 } },
      { key: '8', n: 8, name: 'Position shift', enzyme: 'Phosphoglycerate mutase',
        from: ['pga3'], to: ['pga2'], partner: null,
        fx: 'move', anchor: 'p3', dest: 'p2',
        spot: { at: 'p3', say: 'Move the phosphate' },
        act: 'Move the phosphate to C2', perGlucose: 2, rev: true, yields: {} },
      { key: '9', n: 9, name: 'High-energy setup', enzyme: 'Enolase',
        from: ['pga2'], to: ['pep'], partner: null,
        fx: 'lose', anchor: 'oh3',
        spot: { at: 'oh3', say: 'Break off the OH' },
        act: 'Remove a water', perGlucose: 2, rev: true,
        yields: {}, leaves: ['H₂O'] },
      { key: '10', n: 10, name: 'Net profit', enzyme: 'Pyruvate kinase',
        from: ['pep'], to: ['pyruvate'], partner: ADP,
        fx: 'out', anchor: 'p2', couple: true,
        spot: { at: 'hot', say: 'Break off a phosphate' },
        act: 'Charge ADP', perGlucose: 2, rev: false,
        yields: { atp: 1 } },
    ],
  },

  'pyruvate-oxidation': {
    name: 'Pyruvate oxidation', where: 'mitochondrial matrix', start: ['pyruvate'],
    steps: [
      { key: '1', n: 1, name: 'The bridge', enzyme: 'Pyruvate dehydrogenase complex',
        from: ['pyruvate'], to: ['acetylcoa'], partner: COA, offstage: NAD,
        fx: 'join', anchor: 'oxC', couple: true, co2: 1,
        spot: { at: 'decarb', say: 'Take the first carbon off' },
        act: 'Load NAD⁺', perGlucose: 2, rev: false,
        yields: { nadh: 1, co2: 1 }, leaves: ['CO₂'] },
    ],
  },

  krebs: {
    name: 'Krebs cycle', where: 'mitochondrial matrix', start: ['acetylcoa'],
    steps: [
      { key: '1', n: 1, name: 'Two become one', enzyme: 'Citrate synthase',
        from: ['acetylcoa'], to: ['citrate'], linger: ['coa'], partner: OAA,
        fx: 'join',
        spot: { at: 'thio', say: 'Break the thioester' },
        act: 'Join them', perGlucose: 2, rev: false, yields: {} },
      { key: '2', n: 2, name: 'Making it oxidizable', enzyme: 'Aconitase',
        from: ['citrate'], to: ['isocitrate'], partner: null,
        fx: 'shift',
        spot: { at: 'oh', say: 'Move the OH' },
        act: 'Move the hydroxyl over', perGlucose: 2, rev: true, yields: {} },
      { key: '3', n: 3, name: 'The pace-setter', enzyme: 'Isocitrate dehydrogenase',
        from: ['isocitrate'], to: ['akg'], partner: NAD,
        fx: 'decarb', anchor: 'oxC', couple: true, co2: 1,
        spot: { at: 'decarb', say: 'Take a carbon off' },
        act: 'Load NAD⁺', perGlucose: 2, rev: false,
        yields: { nadh: 1, co2: 1 }, leaves: ['CO₂'] },
      { key: '4', n: 4, name: 'The last carbon out', enzyme: 'α-Ketoglutarate dehydrogenase',
        from: ['akg'], to: ['succinylcoa'], partner: COA, offstage: NAD,
        fx: 'join', anchor: 'oxC', couple: true, co2: 1,
        spot: { at: 'decarb', say: 'Take the last carbon off' },
        act: 'Load NAD⁺', perGlucose: 2, rev: false,
        yields: { nadh: 1, co2: 1 }, leaves: ['CO₂'] },
      { key: '5', n: 5, name: 'The only direct payoff', enzyme: 'Succinyl-CoA synthetase',
        from: ['succinylcoa'], to: ['succinate'], linger: ['coa'], partner: null, offstage: ADP,
        fx: 'thioester', couple: true,
        spot: { at: 'thio', say: 'Break the thioester' },
        act: 'Charge ADP', perGlucose: 2, rev: true,
        yields: { atp: 1 }, arrives: ['Pi'] },
      { key: '6', n: 6, name: 'A weaker carrier', enzyme: 'Succinate dehydrogenase',
        from: ['succinate'], to: ['fumarate'], partner: FAD,
        fx: 'dehydro', couple: true,
        spot: { at: 'dehydroC', say: 'Pull two hydrogens off' },
        act: 'Load FAD', perGlucose: 2, rev: true,
        yields: { fadh2: 1 } },
      { key: '7', n: 7, name: 'Adding water back', enzyme: 'Fumarase',
        from: ['fumarate'], to: ['malate'], partner: null,
        fx: 'hydrate',
        spot: { at: 'ene', say: 'Add water here' },
        act: 'Add water across the double bond', perGlucose: 2, rev: true,
        yields: {}, arrives: ['H₂O'] },
      { key: '8', n: 8, name: 'Back to the start', enzyme: 'Malate dehydrogenase',
        from: ['malate'], to: ['oaa'], partner: NAD,
        fx: 'ox', anchor: 'hydride', couple: true,
        spot: { at: 'hydride', say: 'NAD⁺ takes a hydride' },
        act: 'Load NAD⁺', perGlucose: 2, rev: true,
        yields: { nadh: 1 } },
    ],
  },

  fermentation: {
    name: 'Fermentation', where: 'cytosol', start: ['pyruvate'],
    steps: [
      { key: 'lactate', n: 1, branch: 'lactic', name: 'One step, and that is the branch',
        enzyme: 'Lactate dehydrogenase',
        from: ['pyruvate'], to: ['lactate'], partner: NADH,
        fx: 'red', acts: 'partner',
        spot: { on: 'partner', at: 'hydride', say: 'Take the hydride off NADH' },
        act: 'Take the hydride off NADH', perGlucose: 2, rev: true,
        yields: { nadh: -1 } },
      { key: 'acetaldehyde', n: 1, branch: 'alcoholic', name: 'A carbon leaves first',
        enzyme: 'Pyruvate decarboxylase',
        from: ['pyruvate'], to: ['acetaldehyde'], partner: null,
        // no couple: this decarboxylation banks nothing, and the verb reads
        // that to mint no hydride
        fx: 'decarb', anchor: 'decarb', co2: 1,
        spot: { at: 'decarb', say: 'Take the carbon off' },
        act: 'Take C1 off as CO₂', perGlucose: 2, rev: false,
        yields: { co2: 1 }, leaves: ['CO₂'] },
      { key: 'ethanol', n: 2, branch: 'alcoholic', name: 'The same event as lactate',
        enzyme: 'Alcohol dehydrogenase',
        from: ['acetaldehyde'], to: ['ethanolSkel'], partner: NADH,
        fx: 'red', acts: 'partner',
        spot: { on: 'partner', at: 'hydride', say: 'Take the hydride off NADH' },
        act: 'Take the hydride off NADH', perGlucose: 2, rev: true,
        yields: { nadh: -1 } },
    ],
  },
};

/* ---- lookup ---------------------------------------------------------- */
const split = id => {
  const s = String(id), i = s.indexOf('/');
  return i < 0 ? [s, null] : [s.slice(0, i), s.slice(i + 1)];
};
const pathway = name => PATHWAYS[name] || null;

/* A step by id (`krebs/3`), by pathway and key, or by pathway and number.
   Fermentation's two branches share numbers, so a number there is ambiguous
   and the key is the name to use. */
function get(id, key) {
  const [p, k] = key == null ? split(id) : [id, String(key)];
  const pw = pathway(p);
  if (!pw || k == null) return null;
  return pw.steps.find(s => s.key === k) || pw.steps.find(s => String(s.n) === k) || null;
}
const idOf = (p, s) => `${p}/${s.key}`;
const pathwayOf = st => Object.keys(PATHWAYS).find(p => PATHWAYS[p].steps.includes(st));

/* The list a diagram is drawn from: every step of one pathway, with its id
   and the names a card prints, and nothing the stage needs. `branch` keeps
   fermentation's two routes apart. */
function list(name) {
  const pw = pathway(name);
  if (!pw) return [];
  return pw.steps.map(s => ({
    id: idOf(name, s), key: s.key, n: s.n, branch: s.branch || null,
    name: s.name, enzyme: s.enzyme,
    substrate: s.from, product: s.to, partner: s.partner ? s.partner.key : null,
    carrier: carrierOf(s), yields: s.yields || {}, perGlucose: s.perGlucose,
    rev: !!s.rev, leaves: s.leaves || [], arrives: s.arrives || [],
  }));
}
/* The carrier a step turns over, on stage or off: {in, out} or null. */
function carrierOf(s) {
  const c = (s.partner && s.partner.becomes) ? s.partner : s.offstage;
  return c ? { in: c.key, out: c.becomes } : null;
}
/* The step after, in the same branch; null at the end of a pathway. */
function next(id) {
  const [p] = split(id), st = get(id), pw = pathway(p);
  if (!st || !pw) return null;
  const rest = pw.steps.slice(pw.steps.indexOf(st) + 1)
    .find(s => !st.branch || !s.branch || s.branch === st.branch);
  return rest ? idOf(p, rest) : null;
}
function prev(id) {
  const [p] = split(id), st = get(id), pw = pathway(p);
  if (!st || !pw) return null;
  const before = pw.steps.slice(0, pw.steps.indexOf(st)).reverse()
    .find(s => !st.branch || !s.branch || s.branch === st.branch);
  return before ? idOf(p, before) : null;
}
/* Whether the ×2 applies BEFORE this step runs — glycolysis step 5 is where
   two lanes become one molecule twice, so the badge appears after it. */
const x2Before = st => st.perGlucose > 1;
const x2After = st => st.perGlucose > 1 || !!st.x2After;

global.RespirationSteps = { PATHWAYS, get, list, next, prev, split, idOf, pathwayOf,
                            carrierOf, x2Before, x2After };
if (typeof module === 'object' && module.exports) module.exports = global.RespirationSteps;

})(typeof globalThis !== 'undefined' ? globalThis : this);
