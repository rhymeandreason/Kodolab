<!-- KIND: reference — the whole of what a page GENERATED from the component library may use. Written to be handed to a model as its only context, so it is complete on its own and says nothing twice. -->

# Components

A generated app is one HTML file. It loads the shared library from `demos/`, mounts one or two components into boxes, wires controls to `set()` and readouts to `state()`, and says in prose what the student is looking at. It writes no Three.js and no physics. If the request needs something no component offers, say so instead of inventing it.

## Which template

Two, and a page is one of them. Choose before writing anything, because the template decides what the panel is for and it is the `data-shell` in the page below.

| template | `data-shell` | reach for it when |
| --- | --- | --- |
| Step-through | `steps` | the answer is an argument with an order. Each step makes one claim, the scene changes under it, and the student moves with Next. Anything explaining WHY or HOW something happens |
| Sandbox | `sandbox` | the answer is the thing itself. One scene, every control visible at once, no steps and no Next. A student asking to try it, play with it, or see what happens if |

**A request that says "show me why" is a step-through; one that says "let me try" is a sandbox.** When neither is clear, a step-through is the safer default: an argument can hold a sandbox's controls in its last step, and a sandbox cannot hold an argument at all.

## The page

Every app is one page on the shell the section above chose. A full-window scene, a glass panel with eyebrow, title, body and controls, and one box per component: the single component of most pages goes in `shell.stage`, and a page with two mounts each in its own `shell.scene()`. There is no other layout.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>short name</title>
<style> /* page-specific rules only, and as few as possible */ </style>
</head>
<body>

<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="../kit/app.js" data-shell="steps" data-use="Membrane,Graph"></script>
<script>
  // the shell, the mount(s), shell.goTo(0): see "The step-through shell"
</script>
</body>
</html>
```

**`data-shell` names the template and `data-use` names the components this page mounts, and that one tag loads the library**: the modules those components are built from, their stylesheets and the shell, in the only order they load in. Name every component you mount and nothing you do not. Never write a `<script>` or `<link>` for a library file yourself; a second copy of a module overwrites the first. Some pairs are refused: the loader says which, and why, on the page.

Paths are relative to the file, which lives one folder below `demos/`. Everything is a global; there are no modules and no build. The shell owns the DOM: no markup goes in the body, the panel is filled per step, and the scene is whatever the shell was given to mount.

Never type an atom or bond colour; the palette publishes them as CSS custom properties `--atom-O`, `--atom-H`, `--atom-Na`, `--bond-covalent`, `--bond-hbond`, and a caption naming an atom uses its token.

## The step-through shell

The shell is the page. Every app is a sequence of steps, even one step: the scene fills the window, the panel carries the copy and the controls, and the student moves with Back and Next.

```js
const shell = LessonShell.create({
  brand: 'The Mass of a Tree',
  hint: 'Drag to orbit · Scroll to zoom',
  ctx: { state: {} },                        // handed to every step; the shell adds ui and goTo
  steps: [{
    eyebrow: 'Start here', title: 'Where does a tree’s mass come from?',
    body: '<p>...</p>',                       // or a function of ctx
    nextLabel: 'Test it',
    camera: { pos: [21, 9.5, 28], target: [0, 6.5, 0] },
    onEnter(ctx) { ctx.ui.controls('<button class="btn secondary" id="go">Go</button>'); ctx.ui.q('#go').onclick = ...; },
    onExit(ctx) {},
  }],
  onStep(step) { if (step.camera) T.flyTo(step.camera.pos, step.camera.target); },
});
const T = Tree.mount(shell.stage, { viewOffset: shell.viewOffset });
T.on('night', on => shell.theme('is-night', on));
shell.goTo(0);
```

Inside a step, on `ctx` (and on `ctx.ui`, which is the same set of functions: `ctx.q` and `ctx.ui.q` are one call):

| call | what it does |
| --- | --- |
| `controls(html)` | fills the step's control slot; call it before looking anything up |
| `q(sel)`, `qa(sel)` | find one / all, inside that slot only |
| `show(el)`, `hide(el)` | reveal with a rise, or hide |
| `setNext(label, visible)` | rename or hide the Next button |
| `range(input, onChange)` | paints a slider's track, fires once with its value, returns `sync(v)` to write it from code |
| `showPanel(c, opts)` | the component's own chips, into the slot: see "The show panel" |
| `goTo(i)` | jump to a step |

**A paragraph in `body` takes one of four roles, and the shell decides how each reads**: nothing (body copy), `class="lead"` for an opening line worth more weight, `class="callout"` for a boxed aside, `class="foot"` for a smaller aside under the copy. Inside a line, `<strong>` and `<em>`. That is the whole vocabulary: never set a size, a weight, a colour or a font, and never write a `style` attribute. A student editing this app by hand is offered these same four and nothing else, so an app that reaches past them is one they cannot keep consistent.

The panel's own classes, all styled: `.choices > .choice`, `.callout`, `.slider` with `.slider-head`, `.label`, `.value`, `.stats > .stat` with `.stat-label`, `.stat-value`, `.stat-sub`, `.chips > .chip`, `.switch` with `.track`, `.seg`, `.legend`, `.equation`, `.btn.primary | .secondary | .ghost`, and `.is-hidden`. **A number the page repaints belongs in one of the readout classes** (`.stat-value`, `.value`, `.legend-pct`), which the shell marks `data-live` so nothing downstream mistakes its first value for copy; a readout of your own shape carries `data-live` itself.

`shell.viewOffset` is what every mount takes to centre its scene beside the panel. The shell knows nothing about the scene; the camera named by a step is flown in `onStep`.

### A second component is a second box

**`shell.stage` holds one component.** A lesson that changes scale — the cell this happens in, the membrane inside it — asks the shell for a box per component and each step names the one it shows:

```js
const cell = shell.scene('cell', el => PlantCell.mount(el, { viewOffset: shell.viewOffset }));
const m    = shell.scene('membrane', el => Membrane.mount(el, { viewOffset: shell.viewOffset }));
// steps: [{ ..., scene: 'cell' }, { ..., scene: 'membrane' }, { ..., scene: 'cell' }]
```

`scene(name, mount)` returns the component, so everything after it is unchanged: `set()`, `state()`, `on()`, `note()`. The shell shows the step's scene, hides and stops the others before `onStep` and `onEnter` run, and destroys them with the page. A step that names no `scene` keeps the one already on stage, so name it only on the steps that change it. `shell.showScene('cell')` does the same from a control, for a switch of scale that does not deserve its own step.

**Never mount twice into `shell.stage`.** Two canvases in one element stack out of view and the first component's labels draw over the second, which renders and looks like a bug in the scene. The shell throws when it happens.

## Contract every component shares

```js
const c = X.mount(el, params);   // builds a canvas inside el and starts running
c.set({ ...params });            // change any param live; returns c
c.state();                       // the latest reading, a plain object; null before the first frame
c.on('frame', s => ...);         // every tick, with the reading; returns an unsubscribe function
c.start(); c.stop();             // pause keeps the last picture on screen
c.pump(dt);                      // one step and one draw by hand; for tests
c.destroy();                     // gives the WebGL context back
c.sim; c.box;                    // the layers under it, for a page that outgrows the params
```

### Movement: set() glides

**A param a step sets is a move the student watches, so `set()` animates it.** You write the destination and the component takes the time it needs: `L.set({ aperture: 0 })` closes the stomata over about a second, it does not teleport them shut. Do not tween it yourself, and never reach for `setTimeout` — a backgrounded tab fires timers while the picture is frozen, and the student comes back to a scene that moved without them.

**A param the student is DRAGGING has to track the thumb**, so a slider passes `snap`:

```js
ui.range(ui.q('#aperture'), v => L.set({ aperture: v }, { snap: true }));
```

Not everything can glide. A param that rebuilds the geometry — a new seed, a layer's thickness — snaps whatever you pass, because a leaf dissolving into a different leaf is not a transition. Each component's section says which of its params move.

To play one on a timeline rather than a control, set the destination when the step opens and let it run; if a step needs several movements in sequence, give each its own step. A component's animation is a property of the component, not a script the page writes.

### Notes: pointing at the scene

Every component has named parts, and a callout can be pinned to any of them. **A question about a thing on stage is answered with a note on that thing**, in the library's words, plus at most one sentence of copy. Not a paragraph.

```js
c.note('pump');                                   // the library's callout, on the pump: a short label, a two-sentence card on click
c.note('pump', { text:'Na⁺/K⁺ pump', card:'…' }); // your own words, same anchor
c.note('outside', { text:'seawater' });           // a bare label
c.notes(['channel.K', 'pump']);                   // exactly these, clearing the rest; c.notes(false) clears
c.anchors();                                      // the names this component has, with their library text
```

Notes follow their part as it moves and as the camera turns. Show two or three at once, never ten. A step that changes subject should `notes(false)` first. Each component's section lists its anchor names.

**A note on a part facing away fades out.** A component says which way a part faces, and the callout goes with it as the model turns: pointing at a stoma from above would put a label on a surface the student is looking at the back of. It happens on its own, so a step may point at anything and trust the model. The chip stays pressed while the note is faded, because the student asked for it — the view below is how they get back to it.

### Going somewhere: lookAt

`c.lookAt('golgi')` flies the camera to a part. **Pointing at a thing and going to it are two different asks**, and the panel keeps them on two rows: a chip that labels *and* flies takes the student away from whatever they were looking at, and after two of them they are lost. Label with `notes`, travel with `zoom`, and let the student decide which they wanted.

The one exception is a part on the far side. A component may declare a fixed pose per part, and `c.views()` says which have one; a note chip on one of those flies on its own, because a callout on a surface the student is seeing the back of is a label they cannot check. Only the parts that need it have one — a part already in frame never moves the camera.

### Layers: showing and hiding

Every component declares what can be switched off without stopping the sim: a hidden water still crosses and still counts.

```js
c.layers();                 // [{name, label, on}]
c.show('shells', true);     // one layer; returns c
c.palette();                // [{name, color}] what the colours mean, for a legend
```

### The show panel

The colour legend, plus optional chips for point at, zoom to and show, in one call. **When a step wants any of those, use this instead of writing your own buttons** — but wanting them is the exception.

```js
ctx.ui.showPanel(c, { notes: ['pump'], zoom: ['pump'], layers: ['water'] });  // on the step: into the step's controls
CardStage.showPanel(container, c, { layers: ['water'] });                    // into any element
```

**`showPanel(c)` with nothing named draws the legend and nothing else, and that is the right call for most steps.** The legend is a reading aid: the student sees a purple sphere and wants to know what it is. The other three rows are inspection tools, and they were built for a bench. **Do not add them to a step by reflex.** Name `notes`, `zoom` or `layers` only when the step's own question is what that chip answers — a step whose point is that the water is in the way earns `layers: ['water']`, a step that asks the student to find the pump earns `notes: ['pump']`. A step that is a paragraph and a scene earns neither, and three rows of chips under every paragraph reads as a debug panel someone forgot to remove. When a step does earn them: two or three chips is a step, seven is a menu, and a part not on stage never appears.

`only` picks any of `'notes'`, `'zoom'`, `'layers'`, `'legend'` when a step wants fewer rows than it named; `only: ['legend']` is the legend on its own. `legendLabel` renames its heading, which reads `legend` by default. A `zoom` chip is not a switch: it flies when pressed and comes home when pressed again, and only one is ever lit. A question like "what is the purple thing?" is answered by the legend and one note; "can I see it without the water?" by the layers chips.

Readouts belong in the `frame` handler, never in their own loop.

## Scale: what rung each component sits at

Every component declares a **rung** (how big) and a **form** (how many) in its own section, off the ladder in `kit/scale.js`:

```
molecules · macromolecule · membrane · organelle · cell · tissue · organ · organism · population
```

**A page composing normally cannot get this wrong**: each `mount()` gets its own box and its own camera, so components at different rungs simply live in different boxes. Nothing at the `population` rung yet; Graph and Diagram sit on no rung, because a chart and a notation are not in the world.

**At the cell rung, AnimalCell and PlantCell are the defaults.** They are what a reader pictures when they hear "a cell", and between them they carry a nucleus, organelles, a wall and a vacuole. BloodCell is a specialist with none of that, so it comes out when the subject really is blood, or as a second example after a general cell has made the point.

**Respiration is three rungs and the middle one is Mitochondrion.** The reactions themselves, one step on two molecules, are RespirationReaction; WHERE IN THE CELL is AnimalCell; the architecture the gradient stands in is Mitochondrion; the gradient's own arithmetic is Membrane with `context:'mitochondrion'`. A step asking how chemiosmosis works wants the last two together — the organelle for where the protons go, the membrane for how much it buys.

**Photosynthesis is the same three rungs, and the middle one is Chloroplast.** WHERE IN THE CELL is PlantCell with `tissue:'leaf'`; the architecture the gradient stands in is Chloroplast; the gradient's own arithmetic is Membrane with `context:'thylakoid'`. Neither organelle draws the reactions that feed it or spend it.

**Two rungs are often the lesson, not a choice between them.** *Why does osmosis matter* is two boxes or two steps: Membrane for the mechanism (water crossing, counted) and BloodCell or PlantCell for the consequence (a cell bursting, a leaf wilting). Neither half answers it alone — the mechanism without a consequence is a headcount nobody asked for, and the consequence without the mechanism is a shape changing for no stated reason. The same holds for a pump and the cell it keeps alive, or a chloroplast and the tree it feeds. **When a question asks why something MATTERS, reach for the pair.**

Where a real size matters, say it as a fact about the real thing ("a red blood cell is about 8 µm across"), never as a measurement of the picture.

## WaterSim — liquid water and what follows from hydrogen bonds

**Scale**: molecules, bulk. The liquid and any solute spec are the same rung, which is why a solute goes in this box rather than beside it. The render is not measurable: no page prints a distance off it.


```js
const w = WaterSim.mount(el, {
  nWater: 16,          // molecules, 1..60
  salt: null,          // 'nacl' or null
  nSalt: 0,            // crystal PAIRS, 0..8. Lowering it clears and re-drops
  temperature: null,   // °C, -25..110; null is room temperature with the continuum off
  freeze: false,       // may cooling build ice
  hbonds: true,        // draw the dashed network
  still: false,        // no thermal jiggle (one molecule under inspection)
  cam: { theta:0.5, phi:1.15, r:26 },   // first mount only
});
```

What it models, and the numbers `state()` returns every frame:

| field | meaning |
| --- | --- |
| `nWater`, `nIons` | counts on stage (ions are Na⁺ and Cl⁻ separately) |
| `hbondCount` | hydrogen bonds this frame. A water takes at most four |
| `fz` | 0 liquid to 1 ice. Ice is the real hexagonal lattice and takes MORE room |
| `warm`, `kinetic` | 0..1 warmth and the extra jiggle it buys |
| `escaping` | molecules leaving as vapour this frame; boiling is at 100 °C plus `dTb` |
| `dTf`, `dTb` | freezing-point depression and boiling-point elevation from dissolved salt, °C |
| `molal` | free particles per kg of water |
| `hbScale` | how strong the H-bond network is at this temperature and freeze fraction |

Events: `frame` (state) · `dissociate` (na, cl, at) when water wedges a salt pair apart · `saltchange` when the phase-change points move. The freezing point in the readout is `-dTf`, the boiling point `100 + dTb`.

Anchors for `note()`: `water` (one molecule), `O` and `H` (its atoms, with the partial charges), and with salt on stage `Na` and `Cl`. Layers for `show()`: `hbonds`, `ions`.

Good for: temperature, phase change, why ice floats, salt dissolving, colligative properties. Not for: anything the water is in (no container, no membrane, no surface).

## Membrane — a bilayer, its proteins, and what crosses

**Scale**: membrane, bulk. One scene unit is about an angstrom. Everything crossing is drawn 5x oversize against the sheet, so a size read off a travelling ion is that exaggeration, not a measurement.


```js
const m = Membrane.mount(el, {
  proteins: { K:{ x:-36 }, CL:null, NA:null, AQP:null, pump:{ x:36 },   // which machines stand in the sheet, and where (±x, world units, |x| ≤ 110). Too close and the layout spreads them itself, keeping your order
              complex:null, synthase:null, leak:null },                 // the chemiosmotic three, below
  context: 'plasma',     // 'plasma' | 'mitochondrion' | 'thylakoid': renames the two sides and repaints the lipid
  potential: 'nernst',   // 'off': pores conduct forever · 'fixed': E_K, E_Cl constant · 'nernst': from the live counts
  E: { K:-90, CL:-75 },  // mV, used by 'fixed'
  pumpAuto: true,        // the pump re-arms itself; false waits for m.spend()
  pumpOn: true,
  timeScale: 1,          // sim seconds per real second; 2 or 3 to speed it up
  shells: false,         // hydration shells drawn, and shed at a channel's filter
  cut: true,             // proteins cut open so the lumen shows
  curve: 9,              // the sheet bows: how far it has dropped by |x| = 150. 0 is flat
});
```

Outside is +y (top), inside is −y (bottom), **and the sheet bows so the outside is the convex face** — the reader can tell the two compartments apart before reading a label. `curve: 0` flattens it for a page that wants a straight cross-section. The sheet is an oily bilayer: water and small gases cross it, ions do not. `K` admits K⁺ by hydration (Na⁺ is smaller and still refused, holding its water too tightly); `CL` admits by charge; `NA` is a leak letting sodium in down its gradient, which is what gives the pump work to do; `AQP` passes water single file and nothing charged, so water crosses fast where one stands, though it still seeps through the lipid anyway. The Na⁺/K⁺ pump carries 3 Na⁺ out and 2 K⁺ in per ATP, never open at both ends. With the potential on, every K⁺ leaving builds the voltage that stops the leak. A cell honest about seawater has `NA`, `K` and `pump`; an osmosis lesson at the kidney has `AQP`. **This is one patch of one membrane.** A cell in a tissue has two faces with different proteins, and a lesson about a gill, a gut or a kidney should say which face this is, usually the one touching the environment, and that the blood is on the other side of the cell, not on the other side of this membrane.

Populating it. The box starts empty. Say what is dissolved on each side and the module keeps the stage matching it:

```js
m.set({ contents: {
  inside:  { water:46, K:20, NA:4, A:8 },     // kind: 'water' | 'o2' | 'co2' | 'NA' | 'K' | 'CL' | 'A' (an impermeant anion)
  outside: { water:26, NA:26, CL:26 },
} });                            // 'H' is a proton, for a chemiosmosis scene
m.reset();                       // zero the counters after a change of scene
m.spend();                       // one ATP, one pump turn; false if a turn is running or no Na⁺ inside
```

Or in millimolar, which is how a page should say it: `units: 'mM'` at mount, then `contents: { inside: { K:140, NA:12 }, outside: { NA:470, CL:550 } }`, and the module turns it into counts at one particle per 20 mM. Leave water out; it fills each side. A concentration the page states comes from `state().concentration`, never typed. Blood is about 150 mM Na⁺, seawater 470, a river under 1.

Changing `contents` adds and removes only the difference, by current side, so a water that already crossed stays crossed. **The budget is 220 particles on stage, at most 110 of them ions**; past it nothing more is added. Keep the particle count equal per side and fewer free waters where the solute is; that is what makes osmosis a headcount rather than a pull. About 78 a side reads well: 78 water on the fresh side, and 26 water with 26 Na⁺ and 26 Cl⁻ on the salty one.

**Osmosis is the mechanism half of this component.** Put more solute on one side and there are fewer free waters there; water crosses both ways and simply arrives more often on the crowded side, until the headcounts match. Nothing pulls; there is no osmotic force in the sim, because there is none in the cell. The verdict to print is `state().net`.

For one molecule placed by hand there is `m.add(kind, opts)` with `opts.x, .y, .z`, and `m.scatter(kind, n, side, opts)` with side 1 outside, −1 inside.

Defaults do the right thing: ions walk slower and are blocked by the bilayer, water and gases cross it and keep out of the pores, a K⁺ or Cl⁻ ion uses a channel of its kind when one stands in the sheet, and the anions stay deep inside. `opts` on `add`/`scatter` can override: `conducts:'K'`, `seeks:true` (tries the channel and is refused, what Na⁺ does), `speed:[lo,hi]`, `blocked:false`.

**What to print, out of all of this.** The hand-built version of this lesson runs six steps on **two** instruments: a K⁺/Cl⁻ headcount beside each compartment, and one `mV` figure. Two of its steps show no number at all. Nothing else in the table below ever reaches the student. Take that as the shape: **`counts` (or `concentration`), `mV`, and `atpSpent` when a step is about the cost** are the printable few, and the rest of the table is for the page's own logic.

Three habits worth copying. A verdict goes in words, not digits: `net` and the equilibrium it implies read as "levelled out" or "two currents cancelling", and a number beside them adds nothing. A count belongs on the picture at the compartment it counts, not in a panel. And an instrument that survives from one step to the next is what shows a quantity going down and then back up, so reuse the same one rather than adding a second.

`state()`:

| field | meaning |
| --- | --- |
| `t` | sim seconds |
| `counts[kind].inside / .outside` | every kind on stage, by side |
| `concentration[kind].inside / .outside` | the same in mM. If a page states a concentration, it comes from here |
| `net` | `'entering'`, `'leaving'` or `'balanced'`: the water verdict, read off the free-water headcount per side, so right from the first frame |
| `crossings.up / .down`, `netRecent` | lifetime crossings each way, and a recent net decaying to 0 at equilibrium (positive is leaving). Noisy for the first half minute, so print a count, not a direction |
| `mV`, `equilibrium.K`, `equilibrium.CL` | membrane potential and each ion's equilibrium potential |
| `crossed.K`, `crossed.CL`, `crossed.NA`, `crossed.water` | net transits through each channel, signed outward |
| `atpSpent`, `pumpT` | the pump's ledger, and where it is in its cycle |
| `context`, `sides.inside / .outside` | what to call the two compartments here; name them from these rather than typing your own |
| `pH.inside / .outside`, `dpH`, `pmf` | the proton gradient: pH per side, the difference, and the proton-motive force in mV (positive means protons want to come back in) |
| `atpMade`, `rotorTurns`, `protonsThroughSynthase`, `protonsLeaked`, `complexTurns` | the proton circuit's ledger, counted rather than declared |
| `stoichiometry.protonsPerTurn / .atpPerTurn / .protonsPerATP` | what the rotor is actually keeping to; do not type a ratio |
| `fuel`, `oxygen`, `fuelRate`, `pmfStall` | the fuel, whether O₂ is there to take the electrons, the rate after back-pressure and oxygen have had their say, and the pmf at which the complexes stall |
| `complexLabel`, `complexT` | the beat of the complex's six-phase cycle, and the words for it |
| `complexStarved` | fuelled, but no protons on the side it loads from, so it cannot turn |

Events: `frame` (state, dt) · `cross` (traveller, dir) through the bilayer · `conduct` (traveller, dir) through a channel · `turn` (n) a pump turn starting · `turned` (n) one finishing · `pumped` (n) one proton thrown out by the complex · `atp` (n) the synthase completing one.

Anchors for `note()`: `channel.K`, `channel.CL`, `channel.NA`, `aquaporin`, `pump`, `complex`, `synthase`, `leak` (each only when in the layout), `heads` and `tails` (the bilayer's halves), `outside`, `inside`, and one molecule of each kind on stage: `water`, `NA`, `K`, `CL`, `A`, `H`. The `outside` and `inside` cards are rewritten by the context, so they name the matrix or the stroma on their own. Two at once: `m.notes(['channel.K', 'pump'])`.

Layers for `show()`: `water`, `ions`, `badges` (the charge signs), `shells`, `cut` (proteins cut open), `membrane`.

Good for: diffusion, osmosis and tonicity, selectivity, the resting potential, active transport and its cost, a cell in a changed environment. Not for: a specific real protein's shape, receptors, vesicles, anything at whole-cell scale. **A proton gradient in a mitochondrion or a chloroplast is the same component with an organelle `context`** and has its own section below.

## Chemiosmosis — the same membrane in an organelle

**Scale**: membrane, bulk — it IS Membrane, mounted with an organelle `context`, so everything in that section still holds: `contents`, `state()`, anchors, layers, the particle budget. Read it first; this section is only what changes. **There is no `Chemiosmosis` to mount** — the name on `data-use` and on `mount` is `Membrane`.

Respiration and photosynthesis are that picture with one parameter flipped.

```js
const m = Membrane.mount(el, {
  context: 'mitochondrion',   // or 'thylakoid': renames the two sides, tints the lipid
  fuel: 'light',              // 'NADH' | 'FADH2' | 'light' | null (nothing driving it)
  fuelRate: 1,                // 0..1: a light dimmer, or a supply dial
  oxygen: true,               // false stops an NADH or FADH2 chain: nothing takes the electrons. No effect on 'light'
  proteins: { complex:{ x:-80 }, synthase:{ x:40 }, translocase:{ x:120 }, leak:null },
  outerMembrane: true,        // a second sheet with a porin in it, mitochondrion only
  contents: { inside:{ water:30, H:22 }, outside:{ water:30, H:22 } },   // 'H' is a proton. Omitted, a complex gets these 22 a side; H:0 means none
  potential: 'nernst',
  sideLabels: true,           // both halves named on the stage; false only if you have your own
  showATP: true,              // an ATP leaves the F1 head per third-turn; false for the gradient alone
  showFuel: true,             // a carrier docks at the complex and leaves spent
  atpExit: null,              // 'left' | 'right': it drifts off that way, with nowhere to be sent
  atpTo: null,                // a function returning a world point to walk to; beats atpExit
  bounds: null,               // {up,down}: how far the compartments run, for a stack of membranes
});
```

Every third of a turn a labelled ATP is released from the synthase head into the compartment it is made in and drifts off. It is the `atpMade` count, drawn: a step about where the energy went wants it, and a step about the gradient itself can set `showATP:false`.

**`m.feed()` is one carrier, one turn** — the complex's answer to the pump's `spend()`. `fuel` is the continuous supply; `feed()` is a single NADH arriving, and it drives exactly one cycle **whether or not the supply is on**. That is the demonstration worth building a button for: switch the supply off, send one, and the complex turns once and stops. `feed('FADH2')` names the fuel; with none named it uses the supply's, or NADH in a mitochondrion. Cutting the supply mid-run lets a machine that is already loaded finish its cycle, and never starts another.

**THE FUEL ARRIVES AND LEAVES, AND IT NEVER CROSSES.** With `showFuel` a carrier comes up out of the matrix as the complex opens to load, docks on its matrix face, and goes back down — NADH in, NAD⁺ out, same body and same colour with only the name changed. Two claims a caption keeps losing: NADH hands its electrons over **in the matrix** and never goes through the membrane, and it is **not consumed** — the NAD⁺ returning is what lets the Krebs cycle turn again. Timed off the complex's own cycle, on the beat already captioned "the fuel is spent", so the picture and the caption cannot disagree. A thylakoid draws nothing: light has no spent form, which `Chemiosmosis.SPENT` says and `check-chemiosmosis.js` asserts.

**THE ATP IS MADE IN THE MATRIX AND HAS TO GET OUT.** The F1 head hangs on the inside, and a charged nucleotide does not cross a bilayer. Two doors, and the component draws both: `proteins.translocase` is the ADP/ATP translocase in the inner membrane — one ATP out for one ADP in, a strict swap, and you watch the ADP go the other way — and `outerMembrane:true` adds the outer sheet with a porin in it, which passes anything small and is why the intermembrane space is nearly the same solution as the cytosol. With both on, the token walks matrix → translocase → intermembrane space → porin → cytosol; with neither, it wanders off, which is a page not teaching export. The lid is real to the sim in one respect: protons pumped out stay under it.

The translocase's swap is **electrogenic** — ATP⁴⁻ out for ADP³⁻ in, driven by the membrane voltage, about a quarter of the whole proton budget — which the library card says and the sim does not model. Say it; do not try to read it off `state()`.

**Three events, and they are three different moments.** `'atp'` fires when the molecule is made, in the matrix; `'atpOut'` when it has cleared the last door on stage and is in the cytosol; `'atpDelivered'` when it reaches the `atpTo` point. A handoff wired to `'atp'` claims the ATP is available where it was made, and one wired to `'atpOut'` claims it is available the moment it leaves rather than where it arrives. `state().outerMembrane` says whether the lid is on, and `state().sides.beyond` is what to call the space above it.

**WHAT SPENDS IT IS ANOTHER MEMBRANE, IN THE SAME SCENE.** The Na⁺/K⁺ pump runs on ATP and is one of the biggest consumers in a cell, but it is in the PLASMA membrane. Do not put a pump and a synthase in one sheet — that is a bacterium. Stack them instead: `Membrane.create(THREE, root, camera, opts)` takes any Object3D, so two sims can live in one `CardStage` as two groups at different y, each still believing its own membrane is at y = 0.

Top to bottom the stack is: outside the cell · **plasma membrane** · cytosol · **outer membrane** · intermembrane space · **inner membrane** · matrix. It needs no sign changes — the plasma membrane pumps Na⁺ to +y (out of the cell, up) and the mitochondrion pumps protons to +y (into the intermembrane space, up), so both already point the same way.

```js
const cell = Membrane.create(THREE, gCell, box.camera, { context:'plasma', pumpAuto:false,
  bounds:{ up:78, down:CYTOSOL - 8 } });          // its cytosol stops above the outer membrane
const mito = Membrane.create(THREE, gMito, box.camera, { context:'mitochondrion',
  outerMembrane:true, bounds:{ down:95 },
  atpTo: () => worldPositionOf(cell, 'pump') });  // the token walks the whole way
mito.on('atpDelivered', () => cell.spend());      // it ARRIVED, not it was made
```

`bounds:{up,down}` is how far each sim's compartments run from its own membrane, so one sim's solution stops where the next sim's membrane begins instead of the two interleaving. `atpTo` is a function returning a WORLD point; the token is converted into the sim's own frame at release and walks there, and `'atpDelivered'` fires on arrival. `atpExit` is the fallback for a page with nowhere to send it.

**Three things a page building this stack owns.** `create()` makes no side labels and no notebook — that is `mount()`'s work — so the page draws the band names itself (four of them here, and two sims each drawing a pair would say "the cytosol" twice) and builds its own `Notebook.create({box, anchors, library})` per sim. And a sim's anchors answer in ITS frame: lift them through the group with `localToWorld` before handing them to a notebook or to `atpTo`, or every callout is off by the offset. `membrane/atp-handoff-test.html` is the worked example.

**Say that the heights are compressed.** A real intermembrane space is about 20 nm and a real mitochondrion sits microns below the cell surface, so a cytosol drawn comparable to the intermembrane space is perhaps a hundred times too thin. Everything else is to scale with itself.

`spend()` returns false if a turn is already running or there is no Na⁺ to carry, which is the honest answer: ATP arriving faster than the pump can turn does not make it turn faster.

`complex` burns fuel to carry protons **inside → outside only**, on a six-phase cycle it visibly turns through. `synthase` is a turbine, not a pump: protons come back down through it and the rotor turns, and it cannot run uphill, so with the gradient gone it stops. `leak` is an uncoupler's hole — protons home without making ATP, and the fuel all comes out as heat. The complexes slow as the force they pump against rises and stall near `state().pmfStall`: respiratory control.

**THE BOTTOM HALF IS ALWAYS THE ENCLOSED COMPARTMENT** — the cytosol, the matrix, the lumen — the way every textbook cross-section draws it. So a mitochondrion pumps protons UP the screen and a thylakoid pumps them DOWN, and the direction is not something to assume from the other one. The box names both halves on the stage itself and keeps them there, so do not add your own labels. For a caption, `state().sides.pumpedInto` is where the protons collect and `.inside` / `.outside` are the bottom and top names.

**Printable here: `pmf` or `dpH`, and `atpMade`. One stat tile, chosen by what the step asks; the rest of the ledger drives the page, not the panel.** **What the gradient IS** is `state().pH`, `.dpH`, `.pmf`; **where the energy WENT** is `.atpMade` against `.protonsThroughSynthase` and `.protonsLeaked`, a ledger that only means something as a comparison; **what the machine is DOING** is `.complexLabel`, the beat of the cycle it is on. Do not caption a machine from the step's own prose while it is mid-turn; the label is what it is actually doing. Ratios come from `.stoichiometry` and `.complexStoichiometry`, never typed: the rotor decides them.

Good for: chemiosmosis in either organelle, the proton circuit and where the energy went, uncouplers and why they make heat, respiratory control, light as the thing driving a gradient. Not for: the reactions feeding it (no Krebs cycle, no Calvin cycle, no electron carriers being made here).

## Proteinbox — a real protein, from the library

**Scale**: macromolecule, single. One scene unit is one angstrom, from a lab's own coordinates, and nothing is exaggerated. This is the one component a page may print a real distance off.


```js
const P = Proteinbox.mount(el, {
  protein: 'hemoglobin',   // a key from the list below
  variant: undefined,      // a PDB id the registry holds for it; omit for the default
  rep: 'ribbon',           // 'ribbon' | 'surface' | 'fold'; the last two only where state().available says so
  colors: undefined,       // omit: helices, sheets and loops in the library's palette. {byChain:{A:0x..., B:0x...}} to tell chains apart
  pocket: true,            // the baked non-protein atoms (hemes and their iron, metals, a chromophore), ball-and-stick. false hides them
});
```

These are deposited structures drawn at real ångströms from files this repo baked, so a page can make measured claims about them, and `state()` carries the facts to print: `name`, `does`, `blurb`, `variant`, `species`, `purpose`, `method` (how it was solved), `residues`, `chains`, `rep`, `pocket`, and `available` for surface and fold. Never type a residue count or a method; read them. `set({protein})` fetches and redraws in the same box. Drag turns the molecule.

Proteins: `atp-synthase`, `napump` (the sodium-potassium pump), `prion`, `amylase`, `hexokinase`, `chymotrypsin`, `hemoglobin`, `collagen`, `rnase`, `insulin`, `myoglobin`, `gfp`, `ferritin`, `rubisco`, `lysozyme`, `antibody`. Through the registry nearly all of them are ribbon only; ask `state().available` before offering a surface or fold control, and do not promise one in the copy. Events: `rep` (name) when the representation changes · `load` (state) when a swapped protein has drawn.

Good for: what a protein looks like, primary to quaternary structure, comparing two proteins side by side in two boxes, enzymes and their shape. Not for: animation of function (nothing here moves except hemoglobin's fold), or any protein not in the list.

## Leaf — a leaf in cross-section, tissue by tissue

**Scale**: tissue, bulk. Layer heights and `width` / `depth` are scene units, not micrometres. Proportions are a diagram's: no page prints a thickness off it.


```js
const L = Leaf.mount(el, {
  explode: 0,          // 0..1, the layers lifted apart
  seed: 1337,          // any integer; a new seed is a new leaf
  isolate: null,       // a layer name kept opaque while the rest fade
  autoRotate: false,
  aperture: 1,         // 0..1, the stomata shut to open
  flows: { co2:0, o2:0, vapour:0, sap:0 },   // each 0..1; gases are gated by aperture
  layers: { cuticle:0.12, upperEpi:0.7, palisade:2.4, spongy:2.6, lowerEpi:0.7 },  // heights; changing one rebuilds
});
```

Layer names, bottom to top: `lowerEpi` (with stomata), `spongy` (air spaces, cells with chloroplasts), `bundle` (the vein: xylem above, phloem below), `palisade` (columns packed with chloroplasts, where most photosynthesis happens), `upperEpi` with the waxy cuticle on top. Hovering a layer lights it and clicking isolates it; the page can do the same with `set({isolate})`. Nothing here is measured: the proportions are a textbook diagram's, and the page should say so if it makes a claim about size.

`aperture` opens and closes every stoma at once: turgid guard cells bow apart and a pore appears between them, drained they meet and it shuts. It is the thing in this component that a lesson moves, so a step about water loss or gas exchange sets it and turns the leaf over to watch, which the camera allows. The underside is where the stomata are.

`flows` is the traffic, and it is what the leaf is FOR: `co2` in, `o2` out, `vapour` out, and `sap` arriving along the vein. Sap and vapour are one journey: water runs down the xylem, turns off into the air spaces, and leaves as vapour through a stoma, so a step about transpiration turns both on. They are drawn as real molecules with their atoms — linear O=C=O, bent water — so the exchange reads as chemistry rather than as two colours of dot, and the same shapes a student met in a molecule lesson turn up here. **The three that pass a pore are multiplied by `aperture`**, so shutting the stomata stops the gas exchange and leaves the sap running; that trade is the lesson, and a step about drought or water loss is one `set({aperture})` with the flows on. Their molecules are drawn about 53,000× oversize (`Leaf.SCALE.exag`), which a page reads from there rather than typing; nothing else in the component is exaggerated.

Glides: `aperture`, `explode`, and the fade `isolate` puts on everything else. Snaps: `seed`, `layers`, `width`, `depth`, all of which rebuild.

`state()`: `explode`, `seed`, `isolate`, `aperture`, `hovered`, and `layers` as a list of `{name, y, height}`. Events: `frame` (state) · `hover` (name or null) · `select` (name or null).

Anchors for `note()`: `upperEpi`, `cuticle`, `palisade`, `spongy`, `bundle`, `lowerEpi`, `stoma`. Each carries the library's two-sentence card on what that tissue does. `stoma` and `lowerEpi` carry a view as well: pointing at either turns the leaf over, because the stomata are underneath, and their callouts fade out if the student turns it back.

Layers for `show()`: the five tissues by the same names, plus `chloroplasts`, `cuticle`, and the four flows (`co2`, `o2`, `vapour`, `sap`), which a chip turns fully on or off — a step wanting a half-open stream sets `flows` instead.

Good for: leaf anatomy, gas exchange, transpiration, what a vein carries, structure and function of each tissue, and the trade a stoma makes between CO₂ in and water out. Not for: a single cell's interior, light or a day/night cycle, or comparing one kind of leaf with another — the stomata are always on the underside at one density.

## Condense — two molecules joining, and the water that leaves

**Scale**: molecules, single. Real coordinates: `state().bondAngstrom` is a true length, unlike most components here.


```js
const C = Condense.mount(el, {
  from: ['glucose', 'glucose'],   // two molecule keys; the linkage is worked out from them
  progress: 0,                     // 0 apart .. 1 bonded and the water gone. THE WHOLE ANIMATION
  role: null,                      // which of the host's –OH reacts; null takes the first free
  gap: 3,                          // how far apart they wait, in bond lengths
  turn: 1,                         // 1 starts the guest facing the way the host does, and the linkage's twist arrives as they close
});
C.set({ progress: 1 });            // runs the reaction; set({progress:0}) runs it backwards
```

Pairs that work: `['glucose','glucose']` → cellobiose's β-1,4 (cellulose's linkage) · `['alphaGlucose','alphaGlucose']` → maltose's α-1,4 (starch's) · `['galactose','glucose']` → lactose · `['glycerol','palmitate']` → an ester, and `role` picks `sn1`/`sn2`/`sn3` for a second and third tail · `['glycine','alanine']` or any two of the twenty amino acids → a peptide bond · `['deoxyribose', 'adenine'|'guanine'|'thymine'|'cytosine']` → a nucleoside, the sugar-and-base bond DNA is built on.

**Hydrolysis is this run backwards, and it is the same reaction.** Mount at `progress: 1` and set `0`: a water arrives, the bond breaks, the water splits, and each half goes back where it came from. The picture and the atom bookkeeping are right in that direction because every frame is recomputed from `progress` rather than replayed. **What does not reverse is the wording** — `phase` is named for a condensation, so it reads `done` at the bonded end and `apart` at the separated one, and the anchors' cards say "comes in" and "left". A hydrolysis step should caption from its own prose and use `phase` only to know where in the beat it is.

**`progress` is the entire API and it scrubs.** A step sets it to 1; a slider bound straight to it drags through and back. The beat students miss is between the hydroxyl coming off and the proton arriving, and it lasts about 300 ms at full speed. Glides over ~3 s; pass `{snap:true}` for a slider being dragged.

The water is made of BOTH molecules, a whole hydroxyl from one and a single proton from the other, and which gives which is read from the specs rather than the linkage: a sugar takes the oxygen from the acceptor, an ester and a peptide from the donor. `state().oxygenFrom` and `protonFrom` name them, so a caption prints from there. Atom bookkeeping, not the mechanism; `state().mechanism` says so.

**`state().linkageTurn` is the α/β difference as one number**, and the thing to print on the last step rather than describe. The guest turns to arrive, and how far is read off the real disaccharide: β-1,4 arrives flipped 180°, which is why every other glucose in cellulose is upside down and the chain lies flat enough to stack into a fibre we cannot digest; α-1,4 turns 57.5° and winds into starch's helix. Run both anomers in one lesson and the flip is visible rather than asserted.

Glides: `progress`. Snaps and rebuilds: `from`, `role`, `gap`, `turn`.

`state()`: `progress`, `phase` (`apart` · `breaking` · `waiting` · `crossing` · `water` · `closing` · `done`), `linkage` (`glycosidic` · `ester` · `peptide` · `nucleoside`), `host`, `guest`, `role`, `oxygenFrom`, `protonFrom`, `leaves` (always `H2O`), `bondAngstrom`, `linkageTurn`, `atomsDrawn`. Events: `frame` (state) · `phase` (name, progress).

Anchors for `note()`: `host`, `guest`, `bond`, `water`, `leavingH`. `bond` and `water` return null until they exist, so a callout on either appears only once the reaction has made it. Layers for `show()`: `water`.

Good for: what a condensation IS — where the water in "dehydration synthesis" comes from, why a polymer loses one water per bond, α- vs β-1,4, what makes a peptide bond a bond, why a fat is not a polymer (glycerol runs out of hydroxyls). **Not for building a chain**: it does exactly one bond between exactly two molecules, so starch coiling or a polymer's shape is the wrong picture. Also not for anything that is not a condensation — a phosphodiester bond is not one, DNA's backbone releases pyrophosphate — nor rates, energy or equilibrium.

## RespirationReaction — one step of respiration, on two molecules

**Scale**: molecules, single. Real coordinates for the substrates; a carrier is drawn at the same scale beside them.

One reaction of glycolysis, pyruvate oxidation, the Krebs cycle or fermentation: the substrate, the one molecule it reacts with, and the bond to click. Clicking runs the step as an animation on the molecules themselves: the phosphate crosses, the hydride hops, CO₂ assembles out of the carbon that left, the ring opens. No ledger, no tray, no pathway diagram: those are the page's, drawn from `steps()`.

```js
const R = RespirationReaction.mount(el, {
  step: 'krebs/3',     // '<pathway>/<key>': glycolysis/1..10 · pyruvate-oxidation/1 · krebs/1..8 · fermentation/lactate, /acetaldehyde, /ethanol · electron-transport/complex-i, /complex-ii, /complex-iii, /complex-iv
  x2: true,            // the ×2 badge where the reaction runs twice per glucose
  click: true,         // the glowing target on the bond; false, and the page's own button calls run()
  fit: 'step',         // 'pathway' keeps one camera for the whole pathway, so a molecule shrinking means it lost carbon
});
R.run();                          // runs the step (same as the click); ignored unless state().phase is 'ready'
R.set({ step: R.state().next });  // the next step, its product now the substrate. null at the end
R.next(); R.prev(); R.reset();    // the same, and the current step put back to 'ready'
RespirationReaction.steps('krebs') // [{id, n, name, enzyme, substrate, product, partner, carrier, yields, perGlucose, rev, leaves, arrives}]
```

**A step is two molecules at most.** A carrier stands in the second lane and visibly turns over: ATP beside glucose becomes ADP as the phosphate crosses; NAD⁺ beside G3P becomes NADH when the hydride lands. When a step has a co-substrate and a carrier both (the two dehydrogenase complexes), the co-substrate is on stage and the hydride leaves the frame toward the carrier; `state().carrier` and `state().offstage` say which. **The ×2 is a badge, never a second copy**: after glycolysis's split everything happens twice per glucose, and `state().x2` is the number to print.

**Draw the pathway from `steps()`, and bind it both ways.** A row of chips, a ring, a ladder: build it from the list, set `step` by each entry's `id` on click, and light the entry whose id `state().id` reports. Then the diagram and the stage cannot name different steps. `on('ran')` is when to mark a step done, and `state().next` is what Next should set. Pyruvate oxidation is its own pathway with one step, between glycolysis and Krebs; a lesson that crosses from one to the next sets `pyruvate-oxidation/1` and then `krebs/1`.

**The electron transport chain is the fifth pathway, on the same frame.** Each complex is a step on two molecules: NADH hands its hydride to FMN at complex I, FADH₂ its two hydrogens to ubiquinone at complex II, ubiquinol gives an electron to cytochrome c at complex III and its protons leave the frame for the intermembrane space, and at complex IV the cytochrome's electron goes to O₂, which leaves as two waters. `yields.protons` is what each complex pumps, and summing it along a branch gives the 10 per NADH and 6 per FADH₂; complex II's zero is why FADH₂ is worth less. The gradient those protons make and the synthase that spends it are Membrane with `context:'mitochondrion'` in a second box, which is the lesson.

**Print from state, not from memory**: `enzyme`, `substrate`, `product`, `partner.name` and `partner.becomesName`, `yields` (per single reaction: `atp`, `nadh`, `fadh2`, `co2`, `protons`, signed), `leaves` and `arrives`. A tally across steps is the page's sum of `yields`, times `x2` where it applies, and a Graph beside the stage is how to show it.

Rebuilds and snaps: `step`, `pathway`. Live: `x2`, `click`, `fit`. Nothing else moves except by `run()`.

`state()`: `pathway`, `id`, `key`, `n`, `name`, `enzyme`, `branch` (fermentation: `lactic` · `alcoholic`), `phase` (`ready` · `running` · `done`), `substrate`, `product`, `from`, `to`, `linger`, `partner` `{key, becomes, name, becomesName}`, `offstage`, `carrier` `{in, out}`, `x2`, `x2Shown`, `lanes`, `click` `{on, at, say}`, `act`, `rev`, `yields`, `leaves`, `arrives`, `next`, `prev`. Events: `frame` (state) · `step` (state) after a rebuild · `pick` (lane) on the click · `ran` (state) when the step lands.

Anchors for `note()`: `substrate`, `partner`, `bond` (null once the step has run), `product` (null until it has). No layers, no views.

Good for: one step or a few, each on its own molecules, for a student who has not met the pathway before; what a carrier IS (one molecule, two states); where the CO₂ comes from; why the ×2; what an electron carrier passes along. Not for: the whole pathway's bookkeeping on one screen (that is a Graph fed from `yields`), the proton gradient and ATP synthase (Membrane with `context:'mitochondrion'`), where in the cell it happens (AnimalCell, Mitochondrion), or a molecule on its own (Molecule).

## Tree — a tree, the air around it, and where its mass came from

**Scale**: organism, single. The person beside it is how this scene answers size, by comparison rather than by a number. The mass shares in `Tree.PILES` are the numbers it owns.


```js
const T = Tree.mount(el, {
  growth: 1,            // 0..1 of the oak; 1 is a 25 m tree
  daylight: 1,          // 0..1, tweened; below 0.5 the page hears 'night'
  treeOpacity: 1,       // the oak ghosts so the piles can be read
  potScene: false,      // Van Helmont's willow in its pot instead of the oak
  flows: { co2:0, o2:0, h2o:0, minerals:0, ambient:0 },   // each 0..1
  piles: null,          // 'dry' | 'fresh' takes the tree apart by origin: air, water, soil
  saplingGrowth: 1,
  pos: [21, 9.5, 28], target: [0, 6.5, 0],   // first camera
});
T.flyTo([5.2, 3.6, 7], [0, 2.3, 0], 1.6);    // a camera flight; a drag cancels it
```

The organism scale, and choreography rather than physics: CO₂ drifts into the canopy, O₂ leaves it, water and minerals climb the trunk, and the piles show the lesson's shares of dry mass (about 93% from CO₂, 6% from water's hydrogen, 1% minerals). `Tree.PILES` holds those numbers for a legend. `state()` returns the params at their current values. Events: `frame` (state, dt) · `night` (bool), which a page uses to switch the shell's theme.

Anchors for `note()`: `trunk`, `canopy`, `leaves`, `roots`, `soil`, `sun`, `person`, `air`, and with `potScene` on, `pot` and `willow`.

Layers for `show()`: the flows `co2`, `o2`, `h2o`, `minerals`, `ambient`, and `piles`, `person`, `sun`.

Good for: where a plant's mass comes from, photosynthesis as traffic, Van Helmont's experiment, scale of carbon stored in a tree. Not for: a leaf's interior (that is Leaf), or any molecule.

## BloodCell — one red blood cell, cut open

**Scale**: cell, single. Measured: a scene unit is one micrometre, so `state()` carries real lengths and a page may print them. The membrane alone is drawn twenty times too thick (`BloodCell.SCALE.exag`), which the page reads from there rather than typing.


```js
const C = BloodCell.mount(el, {
  tonicity: 0,       // the SOLUTION, not the cell: -1 pure water · 0 plasma · +1 brine
  spill: 0,          // 0..1 lysis: the haemoglobin leaves and a pale ghost is left
  sickle: 0,         // 0 discocyte · 1 sickled
  cut: 0,            // 0 whole · 1 halved, which is what shows the inside
  cutTurn: 0,        // turns: which half is taken away
  hb: true,          // the haemoglobin inside
  seed: 7,           // a new seed is a different cell; only the sickled shape uses it
  autoRotate: false,
});
```

One cell, and every shape it takes is the same membrane moved: nothing is rebuilt, so a morph is smooth and a page may drive it from a slider. `tonicity` is the whole osmosis story on one axis, and both ends follow from the membrane's area being fixed — toward pure water the cell fills to the sphere that area can enclose and then can hold no more (raise `spill` and it lyses), toward brine the water leaves and the surplus membrane buckles into spikes, a crenated cell.

**A red cell is a specialist, not a stand-in for "a cell".** It has no nucleus and no organelles, so a step that means a generic cell — what is in one, what one does, what happens to one — gets AnimalCell or PlantCell, and a reader shown a red cell instead comes away thinking cells have no nucleus. **Reach for this one when the subject is genuinely blood or genuinely this cell** — the biconcave shape and why it is that shape, haemoglobin and what a red cell is filled with, sickle-cell disease, lysis and crenation on a real measured cell — or as the second example when one cell has already made the general point and a contrasting case would sharpen it. **A step about what crosses the membrane is Membrane, not this one**: a bilayer is a thousand times smaller, so the two never share a scene. Osmosis has both halves, and they are two boxes or two steps: Membrane counts the water crossing, BloodCell shows the cell it happens to. For a plant the consequence half is PlantCell, and a lesson with room for both cells gets the wall's argument for free.

**`cut: 1` is the setting most steps want on.** Whole, the cell is a smooth red disc; halved, the shell has visible thickness and the haemoglobin is on show, which is what makes the inside a fact rather than a claim.

Glides: `tonicity`, `spill`, `sickle`, `cut`. Snaps: `seed`, `membrane`, and anything passed with `{snap:true}`, which a slider must.

`state()`: the params, plus `discR` and `sphereR` (µm), `area` (µm²), `volume` (µm³) — the volume of the cell as it stands, so it moves with `tonicity` and a printout beside a solution control tracks it; `restVolume` is the resting disc's, and `area` does not move, which is the premise both ends of the axis follow from. Also `swellRatio` (how many times its resting volume the cell holds when it is a sphere) and `crenateFraction`. Print those; do not type them. Events: `frame`.

Anchors for `note()`: `rim`, `dimple`, `cutFace`, `haemoglobin`, `horn` (only when sickled), `spicule` (only in brine). Layers for `show()`: `membrane`, `hb`; hiding the membrane leaves the haemoglobin standing in the shape of the cell.

Good for: the biconcave shape and why it is that shape, osmosis and tonicity on a real cell, lysis and crenation, what a red cell is filled with, and sickle-cell disease. Not for: transport across the membrane, blood as a fluid or a vessel full of cells, anything with a nucleus — this one has none — or standing in for a typical cell, which is AnimalCell's job.

## HbCrowd — a crowd of haemoglobins, and the moment HbS starts a fibre

**Scale**: macromolecule, bulk. One scene unit is one ångström: the tetramer is a deposited structure's surface and every seat in the strand is the fibre bake's, so a page may print the strand's length off `state()`. The tumbling is choreography, not a diffusion rate, and `state()` reports no speed.


```js
const C = HbCrowd.mount(el, {
  variant: 'HbS',    // 'HbA' | 'HbS': which molecule, and which colour the β6 spot takes
  n: 12,             // molecules on stage (rebuild); up to 48
  stick: true,       // whether play() docks them; HbA should say false
  lay: 0,            // 0 standing .. 1 lying; glides, and turns only the docked strand
  base: '../',       // path to demos/ from the page
});
C.play();            // one by one, each free molecule docks onto the end of the strand
C.set({ lay: 1 });   // the strand turns over to lie across the frame
C.reset();
```

A dozen haemoglobin molecules tumble in the frame. Both β6 spots are marked on every one: charge blue on HbA, the fibre's greasy orange on HbS. With `stick: true`, `play()` docks them one at a time into the measured double strand, the camera pulling back as it grows; `lay` then turns the finished strand from standing to lying. **Reach for this for the step between "one residue changed" and "a fibre": two boxes, HbA on the left tumbling and HbS on the right docking, is the comparison.** The finished fibre, its twist and its strain are SickleFibre's.

Glides: `lay`. Snaps: `n`, `variant`, `drift`, `stick`. `play()` and `reset()` are the animation; a page times `lay` after `done`.

`state()`: `variant`, `n`, `free`, `seated`, `repeats`, `lengthA` / `lengthNm` (the axial repeat times the repeats on stage), `lay`, `playing`, `done`, and `measured.axialA`. Events: `frame` · `dock` (seated count, after each docking) · `done` (every molecule seated).

Anchors for `note()`: `patch` (β6 on the first molecule), `chain` (the strand's middle, once anything has docked). No layers.

Good for: why one amino acid makes a polymer, HbA against HbS side by side, the start of a sickle fibre. Not for: the whole fibre (SickleFibre), the cell it deforms (BloodCell), or any other protein.

## BloodFlow — a vessel of red cells, narrowing

**Scale**: organ, bulk. One scene unit is one micrometre: the disc is BloodCell's measured profile, the vessel radii are capillary numbers and the crescent's length is in the measured range, so a page may print those off `state()`. The flow speed is choreography and is not reported.


```js
const F = BloodFlow.mount(el, {
  sickle: 0,         // 0..1 fraction of the cells that are crescents (rebuild)
  n: 40,             // cells in the vessel (rebuild)
  speed: 1,          // choreography; 1 is watchable
  throat: 0.47,      // throat radius over vessel radius (rebuild)
  seed: 3,
});
F.reset();
```

Cells stream along a vessel that narrows to a capillary. Discs turn face-on and go through in single file. Crescents are stiff and longer than the throat is wide: one catches unless it arrives end-on, every crescent that touches a caught one sticks to it, and the jam grows upstream until nothing moves. **Reach for this when the step is what a sickled cell does in a vessel: two boxes, `sickle: 0` beside `sickle: 1`, same vessel.** One cell's shape or contents is BloodCell.

Snaps: everything; a param that rebuilds respawns the crowd. `reset()` starts the flow over.

`state()`: `n`, `crescents`, `moving`, `stuck`, `passed` (cells through the throat), `jammed`, `blocked` (nothing left moving), `vesselR`, `throatR`, `crescentLen`, `discR` (µm). Events: `frame` · `jam` (the first cell caught) · `blocked`.

Anchors for `note()`: `throat`, `jam` (only once a cell is caught), `cell`. No layers.

Good for: vaso-occlusion, why a stiff cell is a problem and a flexible one is not, capillaries being narrower than the cells in them. Not for: a single cell (BloodCell), transport across a wall (Membrane), the heart or a named organ.

## AnimalCell — an animal cell cut open, with its organelles

**Scale**: cell, single. A diagram's proportions, nothing deposited: `unit` is null, so **no page may print a length off it**. Ribosomes are drawn 30x and mitochondria 2x (`AnimalCell.SCALE.exag`) because at true size neither reads beside a nucleus.


```js
const C = AnimalCell.mount(el, {
  motion: 1,        // 0..3 the jiggle and the vesicle runs; 0 stops the cell dead
  seed: 1234,       // a different seed is a different arrangement (rebuild)
  detail: 'auto',   // 'auto' resolves the mitochondrion a click flies to; 'low' never; 'high' all five, and costs it
});
```

A bowl of cytoplasm cut on a wavy line, with a nucleus, five mitochondria, a Golgi ribbon, rough ER wrapped round the nucleus, a centrosome, vesicles and 1500 ribosomes. Everything jiggles in place and the vesicles run in and out along the line to the centrosome, which is what an animal cell's organelles actually do.

**This is the default animal cell.** Reach for it when the step asks WHAT IS IN A CELL, what an animal cell has that a plant cell does not, or whenever a lesson needs one cell to point at and the subject is not some particular cell's speciality. PlantCell is the same default on the plant side. Hover brightens an organelle, a click flies to it, a double-click comes home, so "find the Golgi" is a thing the student does rather than reads. **Fly to a mitochondrion and it resolves**: the same organelle, in the same place, swaps its folded ribbon for two membranes and cristae as sacs, and drops back on the way home. A step about one organelle's own machinery is still not this component — that is Mitochondrion, a rung down, and a different box.

Snaps: everything. `motion` is the only live param; geometry rebuilds, and nothing glides across a rebuild.

`state()`: `motion`, `detail`, `detailed` (how many mitochondria are resolved), `hovered`, `counts` (how many of each are drawn), `shown`. Events: `frame`, `hover`, `pick`.

One list of parts serves `note()`, `lookAt()` and `show()`: `membrane`, `nucleus`, `er`, `golgi`, `mitochondrion`, `centrosome`, `vesicle`, `ribosome`. Every one carries a card, so `showPanel` gives a working panel with no copy of your own. **No part declares a view**, so a `notes` chip labels and never moves the camera; put the two or three worth travelling to in `zoom` instead.

Good for: naming the parts of a cell, animal against plant, where proteins are made and how they leave, what an organelle is. Not for: cell division, anything inside one organelle, or a number in micrometres.

## PlantCell — a plant cell cut open, and what water does to it

**Scale**: cell, single. Same rung and the same rules as AnimalCell: `unit` is null and nothing prints a length. It shares `cell/organelles.js` with it, so a nucleus is the same object in both.


```js
const C = PlantCell.mount(el, {
  tissue: 'leaf',   // leaf · root · potato · cactus — what the cell is full of (rebuild)
  t: 0,             // 0 turgid · 1 flaccid · 2 plasmolysed, and anywhere between
  stream: 1,        // 0..3 cyclosis: the cytoplasm circling the vacuole
});
C.set({ state: 'plasmolysis' });    // the same axis by name
C.set({ t: 1.4, now: true });       // now:true snaps, for a slider the student is dragging
```

A hexagonal cell with a cellulose wall, a plasma membrane just inside it, and one vacuole taking most of the room. **The tissue is the argument**: a leaf cell is full of chloroplasts, a root cell has amyloplasts and no chloroplast, a potato cell is mostly starch, a cactus cell has a thick wall and an enormous vacuole. Switching tissue rebuilds the contents and tints the wall and the membrane; the old organelles shrink away as the new ones grow.

**Reach for this whenever water and a plant are in the same step.** `t` is the whole turgor story on one axis: the vacuole empties, the protoplast shrinks off the wall, and threads of membrane stay stuck to it. **For a reader asking why osmosis matters, this is usually the nearer answer**: a wilting plant is osmosis they have already watched happen, where a lysing red cell is not. An animal cell under the same question is BloodCell, and running the two side by side is itself the lesson: the plant cell has a wall to press against and the red cell does not, so the same water movement ends in turgor on one side and in bursting on the other.

Glides: `t` (pass `now: true` to snap). Snaps: `tissue`, `stream`.

`state()`: `tissue`, `t`, `state` (the nearest named point on the axis), `stream`, `hovered`, `counts`, `shown`. Events: `frame`, `t`, `tissue`, `hover`, `pick`.

One list of parts serves `note()`, `lookAt()` and `show()`: `wall`, `membrane`, `plasmodesma`, `nucleus`, `vacuole`, `chloroplast`, `amyloplast`, `mitochondrion`, `golgi`, `er`, `ribosome`, `vesicle`. No part declares a view, so a `notes` chip never moves the camera; `zoom` is the row for that, and a plasmodesma is too small to see from the home view without it. **What exists depends on the tissue** — an anchor for a part this tissue did not build returns nothing and its chip does not appear, so a step may name `chloroplast` safely and it simply will not show on a root cell.

Good for: the parts of a plant cell, plant against animal, turgor and wilting, plasmolysis, where starch is stored, why a plant needs a wall. Not for: photosynthesis itself (that is Leaf, a rung up, or a pathway lesson), anything inside a chloroplast, or a number in micrometres.

## Mitochondrion — one organelle, cut open, membrane by membrane

**Scale**: organelle, single. **Measured along, drawn across**: one scene unit is 100 nm, so `state().lengthNm` and `.widthNm` are real and printable. Membranes and machines are exaggerated — `Mitochondrion.SCALE.exag` has the factors, and a page prints those rather than typing one.

```js
const M = Mitochondrion.mount(el, {
  flow: 0.6,          // 0..1 how hard the chain is running; 0 stops it dead. Glides
  uncoupler: false,   // protons home without a synthase: no ATP, all heat
  seed: 4231,         // a different arrangement of folds (rebuild)
});
```

An outer membrane, and inside it **one continuous inner membrane folded back and forth** — every crista is a fold of that one sheet, not a plate standing in the matrix. The sheet is drawn at one membrane's thickness with its cut edge painted as a bilayer, and a crista lumen is the space a fold encloses, continuous with the intermembrane space through the junction; complexes I–IV sit on the faces, ATP synthase in dimer rows at the fold tips, mtDNA and mitoribosomes in the lobes of matrix between, and protons make the round trip: out of the matrix at a complex, back in through a synthase.

**Reach for this the moment a step says "in the mitochondrion" and means it.** The claim it exists to carry is one a diagram almost always gets wrong: **the inside of a crista is the intermembrane space**, joined to it at the crista junctions, so a proton pumped at a complex lands INSIDE the fold and not in the matrix. It is one ribbon for exactly that reason — separate plates say separate compartments. Complex II is on the cristae, in the paler blue, and no proton ever uses it: that is why FADH₂ is worth less than NADH, and it is true of the picture. **The machines are Membrane's own colours** — same blue chain, same gold synthase, same grey porin — so the two boxes can sit in one lesson.

**It is not the arithmetic and refuses to be.** No pH, no proton-motive force, no fuel, no respiratory control: that is Membrane with `context:'mitochondrion'`, one rung down, where it is checked. Mount both when a step asks how much — the organelle for where, the membrane for how much. The rotor's stoichiometry is the one number they share, and both read it from the same place.

Glides: `flow` (pass `{snap:true}` for a slider under a thumb). Snaps: `uncoupler`, and every geometry parameter, which rebuilds.

`state()`: `flow`, `uncoupler`, counts (`cristae`, `junctions`, `complexes`, `synthases`, `porins`), `protons.lumen / .matrix`, the ledger (`pumped`, `throughSynthase`, `leaked`, `rotorTurns`, `atpMade`), `stoichiometry`, and the sizes (`lengthNm`, `widthNm`, `cristaSpacingNm`, `membraneNm`). **Printable: one of `atpMade` or `protons.lumen`, and `lengthNm`.** The rest drives the page. A drawn proton stands for a great many, so nothing here is a concentration. Events: `frame`, `hover`, `pick`, `turn`.

Parts, each with a card: `outer`, `porin`, `ims`, `inner`, `crista`, `junction`, `complex`, `synthase`, `matrix`, `dna`, `ribosome`, `proton`. **Four of them can be pointed at but not hidden** — `crista` and `junction` are places on the inner membrane and `ims` and `matrix` are spaces, so they take a `notes` chip and never appear under `layers`. **`crista`, `junction`, `synthase`, `complex`, `proton` and `porin` declare a view**, so a `zoom` chip for one of those travels; a `notes` chip only labels.

Good for: what a mitochondrion IS, the two membranes and why only one holds a gradient, cristae and surface area, where the electron transport chain sits, why an uncoupler makes heat, mitochondria as ex-bacteria. Not for: the Krebs cycle or glycolysis (a pathway lesson), the numbers on the gradient (Membrane), or a cell with other organelles in it (AnimalCell).

## Chloroplast — one organelle, cut open, membrane by membrane

**Scale**: organelle, single. **Measured along, drawn thick**: one scene unit is 100 nm, so `state().lengthNm`, `.widthNm` and `.granumNm` are real and printable. Membranes, the lumen, the stacking gap and the machines are exaggerated — `Chloroplast.SCALE.exag` has the factors, and a page prints those rather than typing one.

```js
const C = Chloroplast.mount(el, {
  light: 0.6,         // 0..1 how bright; 0 is dark and everything stops. Glides
  uncoupler: false,   // protons leave the lumen without a synthase: no ATP, all heat
});
```

Two envelope membranes, and inside them **one thylakoid membrane**: grana as columns of flattened sacs standing in the stroma, stroma lamellae joining every stack to the next, photosystem II in the faces between stacked discs, photosystem I and ATP synthase only where the membrane is open to the stroma, a starch grain, plastid DNA and ribosomes in the stroma, and protons making the round trip: into the lumen at cytochrome b6f and from water at PSII, back out through a synthase. Water molecules in the lumen move to PSII and split, two per O₂; every fourth proton from water releases an O₂, which drifts up out of the cut. Light falls in through the cut as streaks and flashes where a photosystem absorbs it, PSII and PSI both, at a rate `light` sets.

**Reach for this the moment a step says "in the chloroplast" and means it**, and as the step between PlantCell and Membrane in a photosynthesis lesson: the cell for where, this for the architecture, Membrane with `context:'thylakoid'` for how much. Two claims it exists to carry, both of which a diagram of separate green coins gets wrong: **the thylakoid is one membrane around one lumen**, so a gradient built in any stack drives every synthase in the organelle; and **the machines sort by where they fit**, PSII between stacked discs, PSI and synthase never there because both hang a bulk into the stroma. A third the picture shows without a caption: the gradient is built twice, by a pump and by water splitting, and the oxygen is the waste. **The pump is Membrane's indigo complex and the synthase the mitochondrion's gold**, so the three boxes can sit in one lesson; the two photosystems have colours of their own.

**It is not the arithmetic and refuses to be.** No pH, no proton-motive force, no spectrum, **no Calvin cycle**: the gradient is Membrane with `context:'thylakoid'`, one rung down, and what the ATP and NADPH buy is a pathway lesson. Mount both when a step asks how much. The rotor's stoichiometry is the one number they share, read from the same place.

Glides: `light` (pass `{snap:true}` for a slider under a thumb). Snaps: `uncoupler`. One model: the layout of grana is authored, so there is no seed.

`state()`: `light`, `uncoupler`, counts (`grana`, `thylakoids`, `lamellae`, `psii`, `b6f`, `psi`, `synthases`, `thylakoidsPerGranum`), `protons.lumen / .stroma`, the ledger as `ledger.pumped`, `.fromWater`, `.throughSynthase`, `.leaked`, `.rotorTurns`, `.atpMade`, `.nadphMade`, `.o2Released`, `.waterSplit` (each also flat on `state()`), `stoichiometry` (protons per turn and per ATP from the rotor; per O₂, per NADPH and per water from water), and the sizes (`lengthNm`, `widthNm`, `thicknessNm`, `granumNm`, `membraneNm`, `lumenNm`, `gapNm`). **Printable: one of `atpMade`, `o2Released` or `protons.lumen`, and `lengthNm` or `granumNm`.** The rest drives the page. A drawn proton stands for a great many, so nothing here is a concentration. Events: `frame`, `hover`, `pick`, `turn`, `oxygen`.

Parts, each with a card: `outer`, `inner`, `ims`, `stroma`, `granum`, `thylakoid`, `lamella`, `lumen`, `psii`, `b6f`, `psi`, `synthase`, `starch`, `dna`, `ribosome`, `proton`, `oxygen`, `water`, `photon`. **Four can be pointed at but not hidden** — `ims`, `stroma` and `lumen` are spaces and `thylakoid` is one disc of a granum — so they take a `notes` chip and never appear under `layers`. **`granum`, `thylakoid`, `lamella`, `psii`, `b6f`, `psi`, `synthase`, `proton`, `oxygen`, `water` and `photon` declare a view**, so a `zoom` chip for one of those travels; a `notes` chip only labels.

Good for: what a chloroplast IS, the envelope against the thylakoid and why only one holds a gradient, grana and why stacking, where the light reactions sit, where the oxygen comes from, why an uncoupler makes heat, chloroplasts as ex-cyanobacteria. Not for: the Calvin cycle or a pigment's spectrum (a pathway lesson), the numbers on the gradient (Membrane), or a cell with other organelles in it (PlantCell).

## The sandbox shell

`data-shell="sandbox"`. One scene and one panel, with no Back, no Next and no dots. The copy is one short paragraph saying what the student is looking at, and every control is in the panel at once.

```js
const shell = Sandbox.create({
  brand: 'The pump, at your pace',
  hint: 'Drag to orbit · Scroll to zoom',
  eyebrow: 'Sandbox', title: 'Sodium and potassium, across one patch',
  body: '<p><b>One claim, in bold.</b> One sentence after it.</p>',
  controls: '<div class="switch">...</div>',   // the panel's own classes, as a step's controls
  onReady(ctx) {                                // ctx is a step's ctx: q, qa, range, showPanel
    ctx.q('#pump').addEventListener('change', e => m.set({ pumpOn: e.target.checked }));
    m.on('frame', s => { ctx.q('#mv').textContent = Math.round(s.mV) + ' mV'; });
  },
});
const m = Membrane.mount(shell.stage, { viewOffset: shell.viewOffset });
shell.goTo(0);
```

Everything else is the step-through's: `shell.stage`, `shell.viewOffset`, `shell.theme`, and the same `ctx` inside `onReady` that a step gets inside `onEnter`. `goTo(0)` is still the last line, and still after the mount, because `onReady` wires controls to a component that does not exist until then.

**Three or four controls, each one a question.** A sandbox with eight sliders is a control panel nobody reads, and a control whose answer the student cannot see in the scene is a control that should not be there.

## Graph — a chart of measurements, or of a running sim

**Scale**: none. A graph is not in the world; its axes carry their own units.


Never draw a chart by hand. A graph goes in the panel, not on the stage: mount it
in `onEnter` from `ctx.ui.q()`, destroy it in `onExit`.

```js
Graph.mount(el, {
  kind: 'scatter',       // scatter | line | bar | histogram | box
  data: rows,            // plain objects; Graph.csv(text) parses a CSV into them
  x: { field: 'temp', label: 'Temperature', unit: 'C' },   // the axis writes "Temperature (C)"
  y: { field: 'rate', label: 'Reaction rate', unit: 'umol/min' },
  color: 'group',        // a field to split into series, with a legend
  error: 'sd',           // 'sd' | 'sem' | a field of plus/minus values
  fit: 'linear', ci: 0.95, xIntercept: true,
  ref: [{ x: 37, label: 'body temp' }],
  caption: 'one sentence about what the marks are',
});
```

A live trace off a running component is one line. The signal carries its own
label, unit and y range, so no page types a maximum:

```js
Graph.mount(el, { live: { span: 120 }, height: 130 }).follow(m, 'water');
```

`Membrane.SIGNALS`: `water`, `sodium`, `potassium`, `protons` — each side, two
lines named by context · `voltage` mV · `dpH` · `pmf` mV · `atp` cumulative.

**A step that asks how something CHANGES gets a trace; a step that asks what
something IS gets a `.stat` and a number.** Net water flow, a gradient
building, ATP accumulating: a stat reading "balanced" is a word for a shape the
student could have watched.

`state()` is `{n, rows, series, x, y, fit:{slope, intercept, r2, xIntercept}}`,
and a number the page prints about a graph is read from it. Two quantities on
one x share one axis, normalized to percent of maximum: there is no second
y-axis.

## Diagram — one molecule, drawn flat

**Scale**: none. A structural diagram is a notation, not a thing in the world, so
it sits on no rung and can share a page with any component.

A diagram goes in the panel, beside the model — not on the stage. Mount it in
`onEnter` from `ctx.ui.q()`, destroy it in `onExit`.

**Never pick the notation.** Name the molecule and say what the drawing is for;
which notation suits it is chemistry, and the component decides: a Haworth
projection for a sugar, a Lewis structure for a molecule too small to have a
skeleton, the skeletal drawing for everything else.

```js
Diagram.mount(el, {
  molecule: 'glucose',   // a key in MolLib.MOLECULES, or a spec
  highlight: ['O4'],     // atom names to light up; a hydrogen marks its heavy atom
  lonePairs: true,       // the non-bonding electrons
  showH: false,          // the C-H hydrogens (Haworth only)
  caption: 'one sentence about what the drawing shows',
});
```

`state()` is `{key, name, formula, charge, projection, atoms, heavy, lonePairs}`,
and a number the page prints about a molecule is read from it — `projection`
says which notation it landed on.

**A diagram is a SECOND VIEW of a molecule, never a second source.** It is drawn
from the same spec the 3D model is built from, so put one beside a model rather
than in place of it: the model is the shape, the diagram is the bookkeeping.
Two steps showing the same molecule keep the same diagram and change what is
marked on it.

**`lonePairs` is a claim, so turn it on only where the step makes it.** Hydrogen
bonding, an oxygen accepting one, a nucleophile about to attack — those steps
want the electrons. Every other step they are decoration, and a Haworth with
twelve pairs on it is a drawing nobody can read. `highlight` is the same
discipline: mark the one atom the step is about.

**It has no note(), show() or lookAt().** There is no depth to reveal and no
camera to move, which is the same reason Graph has none. To point at something,
mark it.

## Molecule — one molecule, in 3D

**Scale**: molecules, single. A scene unit is a real length, and `state().span` is real ångströms; the spheres are stylised, so nothing prints a radius off the picture.

Diagram's 3D twin, from the same spec. It goes on the stage, one per box.

```js
const M = Molecule.mount(el, {
  molecule: 'glucose',   // a key in MolLib.MOLECULES, or a spec. Changing it rebuilds; nothing tweens
  mode: '3d',            // '2d' lays the SAME spheres onto the diagram's layout, animated. Not a drawing
  spin: false,           // the turntable, 3D only. Off: a posed molecule should open on its pose
  showH: false,          // true shows the C-H hydrogens; the H on N, O and S is always there
  highlight: ['O4'],     // atom names from the spec; the rest greys out in place, the marked atoms glow
});
M.set({ highlight: ['C1'] });   // re-marks in place; set({ molecule: 'atp' }) is a rebuild
M.set({ mode: '2d' });          // the student watches it lie down; set({ mode: '3d' }) stands it back up
```

**Print `state().source` under the model, once, on the step that introduces it.** It is one sentence saying whether the coordinates are a deposited measurement or a construction, and a student is entitled to it. Never write your own. In 2D print instead that the layout is the diagram's, not the molecule's: `mode` says which is up.

**A step about WHAT a molecule looks like gets Molecule; a step about what it HAS gets Diagram; a step about a molecule doing something gets the component that does it.** A chair, an anomer, a tail folding back on itself, two sugars that differ in one hydroxyl's direction: those are shapes and only a model shows them. Which atoms, which bonds, where the charge sits: that is bookkeeping and the flat drawing reads faster. A molecule reacting, dissolving or crossing is Condense, WaterSim or Membrane, never this with a caption saying it happened.

**Put a Molecule and a Diagram of the same key side by side** when a step has to connect the drawing a textbook shows to the thing itself. They cannot disagree, and the student sees why a Haworth's "up" is a real direction. **`mode: '2d'` is the step between them**: the model lies down onto the diagram's layout in front of the student, which is the one way to show that the flat drawing and the shape are the same molecule rather than telling them.

`state()`: `key`, `name`, `formula`, `class`, `charge`, `atoms`, `heavy`, `hydrogens`, `span` (Å, real, null for one heavy atom), `rings`, `mode`, `canFlat` (false: the spec has no flat layout and `mode: '2d'` stays 3D), `spin`, `showH`, `highlight`, `source`. Events: `frame` (state, dt) · `render` (state) after a rebuild.

Anchors for `note()`: every atom by the spec's own name (`C1`, `O5`, `HO4`), plus `center`; a note follows its atom down into the 2D layout. Names are the ones `highlight` takes, so a step marks an atom and notes it with one string. Layers for `show()`: `hydrogens` (the C-H ones). No views: nothing on one molecule is out of frame, and `lookAt()` moves nothing.

Good for: the shape of one molecule, a functional group pointed at, comparing two molecules in two boxes (glucose beside galactose, palmitate beside palmitoleate), the model beside its diagram. Not for: a reaction, a liquid, a protein (Proteinbox), a chain of monomers (Condense joins two), or anything at a scale where a molecule is a dot.

## Copy

A tutor for a college Bio 101 student. Concise, no repetition, one claim per paragraph, in bold, that the picture is showing right now. Prefer a question the student can answer by touching a control. No em dashes.

**`state()` is for driving the scene, not for filling the panel.** Most of what it carries is there so a step can time an animation, gate a control or decide a camera. A value reaches the student only when the step's own claim is about that number: **at most one or two readouts on screen at a time, and none on a step that is not asking a question they answer.** A wall of live counters is what a page looks like when it has not decided what the step is about. When a number is not the point, say the thing in words and let the picture carry it: a verdict like "levelled out" is the readout, and the digits behind it are the page's business.

**Pick a couple of instruments and keep them across steps.** The same readout falling and then climbing again is an argument; a fresh set of numbers each step hides that it is the same quantity. Membrane's section names its printable few and is the worked example; where a section does not, the same restraint is the default.

**Show, do not tell.** When a student asks what something is, put a note on it, in the step where they asked. When they ask what happens if, add a control that does it, or a step that shows it. When they ask to see or hide something, it is a layer. A note names the part it is on, not the whole scene. Add a paragraph only when none of those is possible. A panel body stays under two short paragraphs, and an edit that would push it past that replaces text rather than adding it. When something asked for is beyond the components, say so in one sentence in the page rather than faking it.

## Before you answer

Read the page you wrote against this list. Every line is a failure that renders
correctly and then breaks, or breaks nothing and is wrong anyway.

- The Three r128 tag, then one `../kit/app.js` tag whose `data-shell` is the
  template the page actually enters, and no other `<script>` or
  `<link>` for a library file. Its `data-use` names every component the page mounts, and no other.
- Every `mount()` passes `viewOffset: shell.viewOffset`.
- One component per box: the page mounts once into `shell.stage`, or gives each
  component its own `shell.scene(name, el => ...)` and names the scene its
  steps show. Never two mounts into `shell.stage`.
- The last line of the page's script is `shell.goTo(0)`.
- No markup in the body: the shell builds the panel, steps fill it.
- No `setTimeout`, no `setInterval`, no animation loop. A step sets a
  destination and `set()` glides there; a readout lives in `on('frame')`.
- Every number the student reads came from `state()`. None is typed.
- Every number the student reads is one the step is about. A field exists to be
  read by the page, not to be shown to the student; a step with a readout that
  its own sentence never mentions drops the readout.
- No colour is typed: the palette publishes `--atom-O`, `--bond-hbond` and the
  rest, and a caption naming an atom uses its token.
- Nothing is mounted, set or called that this document does not describe. If
  the request needed something more, the page says so in one sentence.
