# Lab

Shared pieces for 3D bench-lab simulations: stage, materials, props, clickable objects, and a lesson with Hands-on and Watch modes and a timeline you can step back and forth on.

Ported into kodolab from `Experiments/Lab` with Strawberry only. Photosynthesis and Ecoli, named below as worked examples, and the planning docs (ROADMAP, MICRO, …) are still in that repo.

* `sims/Photosynthesis/` is the first lab built on it (not ported).
* `strawberry/strawberry-lab.html` (DNA extraction) is the second. It adds zoom levels: two live circles show one cell and the molecules, and all three views show the same moment.
* `sims/Ecoli/` (bacterial transformation, GFP, not ported) is the third. It has one zoom level (one E. coli cell), a UV step that darkens the room, an intro card with a 3D plasmid, and the results on the complete card.
* `gallery.html` shows every prop on one bench. Use it as a catalog, and to check that a change to Lab didn't break anything.
* `themes.html` shows the colour themes side by side, with the UI pieces in each.
* `props.html` shows one prop at a time on a turntable, with its size, anchors and sliders for its state (liquid level, plunger, lamp, …). Link to a prop with its key, e.g. `props.html#syringe`.

The original labs (`/Photosynthesis`, `/BloodType`, `/Ecoli`, …) don't use Lab and are left untouched as references. The git tag `pre-lab` marks the repo before Lab existed. When porting these in, reuse lab props first. Then add new props to the props library.

## Planning docs

* [ROADMAP.md](ROADMAP.md): which labs to build, in what order (12 at launch, 30 in the first year).
* [CATALOG.md](CATALOG.md): every prop, effect and engine from the docs below, in one list with status.
* [PROPS.md](PROPS.md): props from the five prototypes, with variants and parameters.
* [PROPS-COVERAGE.md](PROPS-COVERAGE.md): props for the full range of high school to intro college labs, and science-fair projects.
* [MICRO.md](MICRO.md): labs that zoom to the microscope, cell and molecule levels, and the props for those levels.
* [HISTORIC.md](HISTORIC.md), [RESPIRATION-HISTORY.md](RESPIRATION-HISTORY.md), [HOW-DO-WE-KNOW.md](HOW-DO-WE-KNOW.md): landmark experiments.
* [QUESTIONS.md](QUESTIONS.md): labs that start from a student's everyday question.
* [DESIGN-MODE.md](DESIGN-MODE.md): letting students design their own experiments.

## Running

ES modules need a server, so `file://` won't work. kodolab's `node tools/dev-server.js` sends `no-store`, so a reload always picks up edited modules.

Then open <http://localhost:8817/demos/lab/strawberry/strawberry-lab.html>, <http://localhost:8817/demos/lab/gallery.html> or <http://localhost:8817/demos/lab/props.html>. URL options:

|  |  |
| --- | --- |
| `?speed=8` | speed up every animation |
| `?mode=watch` | open in Watch mode instead of Hands-on |
| `?marker=dot` | compare the 'dot' marker style |
| `?theme=teal` | try another colour theme |

## A new sim

Reuse props from the library first. Then add new ones specific for your lab. Read PROPS.md for overall structure.

Copy `strawberry/` to `lab/<name>/` and keep its page skeleton: `lib/site.js`, the wordmark in `.lab-brand`, `../lab.css`, the Phosphor icon CSS, and this import map. Import maps can't be shared between pages, so every sim carries its own copy:

```html
<script type="importmap">
  { "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/"
  } }
</script>
```

The minimum `main.js`:

```js
import * as THREE from 'three';
import { V3, createStage, createMaterials, createInteraction, createLesson,
         createFollowCam, disposeTree, makeBench, makeBeaker, moveTo } from '../lab.js';

const stage = createStage({ canvas: document.getElementById('scene'),
  views: { bench: { t: V3(0, 4, 0), p: V3(0, 40, 60) } } });
const mat = createMaterials(stage);

let root, B;
function rebuild() {                      // put the bench back to its starting state
  if (root) { stage.scene.remove(root); disposeTree(root); }
  ix.clear();
  root = new THREE.Group(); stage.scene.add(root);
  root.add(makeBench(mat).group);
  const beaker = makeBeaker(mat, { label: 'Water' });
  root.add(beaker.group);
  B = { beaker };
  ix.register('beaker', beaker.group, { name: 'Beaker', desc: '250 mL of water' });
}

const lesson = createLesson({
  rebuild,
  panel: document.getElementById('stepsPanel'),
  onEnter: (step) => step && stage.focus(step.view),
  steps: [{
    id: 'lift', title: 'Lift the beaker', targets: ['beaker'], view: 'bench',
    action: 'lift it', hint: 'Click the <b>beaker</b>',
    detail: 'Lift the beaker 5 cm off the bench.',
    run: () => moveTo(B.beaker.group, { pos: V3(0, 5, 0), dur: 1 }),
  }],
});
const ix = createInteraction(stage, { targets: lesson.targets, busy: lesson.isBusy,
                                      onClick: lesson.click, status: lesson.status,
                                      markerStyle: 'circle' });
const follow = createFollowCam(stage, ix, { acting: lesson.acting });
stage.onFrame((dt) => { lesson.update(dt); follow.update(dt); ix.update(); });
lesson.start();
stage.start();
```

## The lesson UI

`createLesson` builds all of this; a sim only supplies steps, phases and text.

* **Two modes**, toggled in the top bar. **Hands-on** (default): the student clicks objects; the timeline is hidden. **Watch**: the timeline shows with a primary **Play** button that runs the whole experiment, clicking each step's targets itself. Pause freezes mid-animation (`setPaused` in `core/tween.js`). Space toggles play. Object clicks are ignored and markers hidden in Watch.
* **Watch mode is video-like**: the instruction card and procedure list hide, and the step's `caption` shows in large text above the timeline (default: the step `title`). Captions say what is happening, not what to click. A `caption` function is re-read every frame, so it can follow the animation: `cues(() => S.t, [[0, 'Pull off the leaves'], [0.42, 'Put it in the bag']])` picks the cue for the sim's clock, and Photosynthesis reads bench state (pulls, disks sunk, disks floating) instead. Return `{ text, note }` for a short, essential aside ("Don't mix!"); skip the `why`/`hint` text here. `introCaption` shows before Play, `completeCaption` at the end, and a step's `clock` shows above the caption. Toasts are muted in Watch. A sim's `insets()` must count `.lab-captions` (it keeps a fixed height, `--caption-h`, so the camera doesn't shift per caption) and measure the procedure panel instead of assuming its width.
* **Watch camera** (`follow.js`, Watch only): calm, video-like moves, with rules to avoid nausea. Every `stage.focus()` in Watch mode goes through it (`stage.setFocusFilter`); Hands-on keeps every authored view.
  * **One default zoom per lab** (`rig: { t, p }`). Normal moves only pan left and right, keeping the rig's height, distance and angle.
  * **Only named close-ups zoom in** (`special: [...]` view names). The next normal view zooms back out, unless it's in `keepClose` (a step between two close-ups, like Strawberry's 'spool'). A repeat request for the current close-up is skipped.
  * **Move only when needed.** A step view whose subject is already well inside the free width is dropped, and so is any pan shorter than 15% of the free width. Only horizontal position counts, since a pan can't fix something poking out above or below.
  * **At most 4 moves in any 30 s, and 3 s between pans.** A step view over budget waits and is re-checked before it moves. Zooming in or out of a close-up, and an action that has left the screen completely, are exempt.
  * **No continuous tracking.** If the action (the clicked object, things that moved since the click began, a vessel a moving tool's centre is over) pokes more than 8% of the free width past an edge, the camera makes one slow pan to bring it in. An action wider than the free width is left alone, and a tool on its way back to its resting place stops counting.
  * Tuning: `follow.stats.history` lists every move with its reason (`window.LAB.follow` in each sim). In a background tab, drive frames with `stage.frame(performance.now())` from a timer, since `requestAnimationFrame` pauses there. Judge layout at a laptop size (~1440×900).
  * In Photosynthesis, `syrWork` is the same view as `syringe`, so loading and drawing up pan while only the vacuum zooms in.
* **Procedure list** (from OnionRoot): a numbered list of *phases*, not steps, so 16 steps still read as 4. Give each phase a `desc` line. The current phase shows pips, one per step. Clicking a phase jumps to it.
* **Instruction card**, bottom centre (from OnionRoot): a step chip numbered like the procedure list when `phases` are given ("Step 3b of 6" for the second step of phase 3; otherwise "Step n of N"), the step `title`, `detail`, `why`, then the `hint` as the click instruction. To keep the card short, `why` appears only once the step's object is clicked, and the `hint` line hides while that click animates (it comes back if the step needs another click). When the lab ends the card shows `completeHint`, plus `completeWhy` (optional) as its blue note: put the last step's payoff there rather than on the last step, where it would only flash during the animation. **Put amounts and how-to in `detail`** ("Pour 150 mL into cup A…"); `hint` says what to click; `action` only feeds the hover tooltip's status line.
* **Target markers** have two swappable styles, `markerStyle: 'circle' | 'dot'` (or `ix.setMarkerStyle()`). 'circle' (from OnionRoot): dark pill with a pulsing dot plus a pulsing ring on the bench. 'dot': white pill, stem and dot. The style is visual only: both label the object with its `short` name, never an instruction.
* **Hover lift**: a clickable object rises 0.8 cm under the pointer (`hoverLift` option, 0 turns it off). It's an offset on top of the object's position, dropped before a click runs, so step animations are unaffected. If a sim poses objects every frame, pose them only when its state changes, or the lift is overwritten. Liquids from `core/liquid.js` follow the lift by themselves.
* **Card text** (`hint`, `detail`, `why`) can be a function, re-read on every `lesson.render()`. Strawberry uses this so `why` explains what you see at the zoom level in the main view.
* **Liquids and hover glow**: `ix.register` gives each mesh its own copy of its material for the glow. Liquids from `core/liquid.js` set their clip planes on whichever material is drawing, so they glow like everything else. If you build a liquid by hand that keeps a reference to its own plane or material, mark it `userData.noHL = true`.

### The intro card

Every lab opens with an intro card (from Ecoli) instead of a loading screen. Its markup sits in the sim's `index.html` (see the header of `intro.js`), so it shows at once while three.js and the bench load. Call `createIntro(stage, { art })` near the end of `main.js`: the Start button reads "Setting up the bench…" until the first frame has drawn, then starts the lab (Enter works too).

* `art(box)` draws into `.intro-art` and returns `{ stop }`. `createPropArt(box, (mat) => makeStrawberry(mat).group, { tilt })` turns any lab prop on a small renderer lit like the bench (Strawberry, Photosynthesis). Ecoli draws its own plasmid (`sims/Ecoli/intro.js`). Each sim starts its art from a small `intro-art.js` (`<script type="module" async>` before `main.js`), so it shows without waiting for the whole library and the bench; `createIntro` picks it up from `box.introArt`.
* The card has a kicker, a title with one `<em>` word (coloured with the theme accent, or `--intro-em`), a short paragraph and three `.keys`: the ideas the lab is about.
* The opening camera move waits for Start: the camera holds the overview behind the card, then glides to the first step's view. In `onEnter`, the first step does `intro.started.then(() => stage.focus(step.view, 2.2))`.
* Add `?intro=0` to the URL to skip it while you work.

### Zoom levels (Strawberry, Ecoli)

`zoom.js` (from Strawberry, shared since Ecoli) adds levels below the bench: `createZoom(stage, { levels: [{ key: 'cell', world, name, meta, bg }], getT, getStep })`. Each level is a "world" (its own scene, views, name labels and hover info; the header of `zoom.js` lists what it needs). The page gives one `.zoom-inset` circle per level you're not looking at, and the sim sets each level's background with `.bg-<key>`; `lab.css` styles the rest.

* It draws the levels you're not looking at into circles (render-to-texture) and runs the lens transition when you click one. Keys 1, 2, 3 … switch levels too.
* It takes over the frame's render call with `stage.setRender()`, and gives each level its own camera and orbit controls. They use the same `stage.insets()`, so every view centres in the free area.
* Bench clicks only work in the Lab view: `createInteraction(stage, { enabled })` turns picking, hover and markers off elsewhere, and the card's click line says to go back to the bench.
* Every level must show the same moment. Strawberry poses its bench, cell and molecule scenes from one number, the experiment clock `S.t` (0..6, one unit per step of the original lab): a click animates the clock from one resting point to the next with `anim()`, so replay and jumping need no extra code. Ecoli's actions set `S.micro`, the stage the cells have reached, and its cell eases toward each stage, so a jump settles in a second or two.
* The worlds themselves (`cell.js`, `molecule.js`, `util.js` in Strawberry; `cell.js` in Ecoli) are sim-local, ported from the originals: a strawberry cell and a bacterium share little.

### Colour themes

A sim picks its accent colour on its root element, e.g. `<html lang="en" data-lab-theme="teal">`. The themes are green (the default), teal, sky, blue, indigo, violet, rose and orange; see `themes.html`. Each one sets five tokens in `lab.css`, and every Lab component uses only these:

| Token | Used for |
| --- | --- |
| `--accent` | fills: buttons, current step, markers, the 3D rings |
| `--accent-2` | lighter partner: gradients, pulse dots, the 3D hover glow |
| `--accent-soft` | tinted backgrounds: current list row, chips |
| `--accent-ink` | accent-coloured *text* on light backgrounds (darker, so it stays readable) |
| `--accent-glow` | accent on dark backgrounds: icons in dark pills, the clock |

In a sim's own CSS, use these tokens instead of hex values. Colours that carry meaning in the experiment (cup A's green line on the chart, a stain's colour) are content, not theme: keep them as fixed values. In JS, read a token with `themeColor('--accent')`; `setTheme(name)` switches theme at runtime.

### Layout and the camera

The sim's `insets(w, h)` (passed to `createStage`) tells the camera how much of the screen the UI covers, so views centre in the free area. Measure the real elements: the card's or timeline's top (whichever is higher; hidden ones have zero height and must count as 0) and the procedure panel's width. The card's height changes per step, so Photosynthesis calls `stage.resize()` in `onEnter`. Check a sim at desktop and phone widths, in both modes, and on any step with a side panel (Photosynthesis's observation step slims the list and card so both cups stay visible).

## Rules that make the timeline work

Going back or jumping ahead calls `rebuild()`, then replays the student's earlier clicks instantly, and completes any steps they skipped. For that to work:

1. **All bench state lives inside what `rebuild()` creates.** Keep it in an object you recreate there (`S` in Photosynthesis), never in a module-level variable that survives rebuilds.
2. **Animate only with `anim`, `moveTo` and `wait`** from `core/tween.js`. They finish instantly during replay. Don't use `setTimeout`, `requestAnimationFrame` or CSS transitions for bench state.
3. **Use `rand()` and `gauss()`, never `Math.random()`.** The lesson reseeds before each click, so a replay reproduces the same disks, bubbles and results. Draw random values before any `await` that runs in parallel, so the order never depends on timing.
4. **Multi-click steps** need `isDone()`, and ideally `progress()` for the timeline fill. When a step is auto-completed, the lesson clicks the first active target until `isDone()` is true.
5. **Timed steps** use `watch: { duration, get, set, rate }`. `set(t)` must pose everything from `t` alone, so the student can scrub. See the observation step in Photosynthesis.

## Conventions

|  |  |
| --- | --- |
| Units | 1 unit = 1 cm. The bench top is at y = 0. |
| Prop origin | Centre of the base, +Y up. Exceptions are noted in each file (a syringe's origin is its tip, a punch's is its die). |
| Prop files | One file per category, following the sections of [PROPS.md](PROPS.md): `surfaces`, `glassware`, `bottles`, `bag`, `kitchen`, `racks`, `tools`, `equipment`, `culture` (agar plates and what grows on them), `specimens`, `effects`. Add a new prop to its category's file, and start a new file when one passes about 300 lines. |
| Liquids | Every container with a liquid has `prop.liquid` from `core/liquid.js`, with the same calls on all of them: `setVolume(mL)`, `setLevel(cm)`, `setFraction(f)`, `setRange(f0, f1)` for stacked layers, `setPour(k)` while tilting, `setColor`, `setCloud`, and a world-space `surfaceY()`. A container gives it its inner wall profile, which sets the volume and a surface disc drawn while the container is upright. The surface stays level as the container moves or tilts, with no per-frame code. |
| Prop shape | `makeX(mat, opts)` returns `{ group, anchors, ...controls }`. Get an anchor's world position with `worldOf(prop.group, prop.anchors.spout)`. |
| Anchor names | Named points in local space. Use these names wherever they fit: `top` (centre of an opening or rim), `floor` (where contents rest: inner bottom, plate surface), `spout` (where it pours from: lip, neck, nozzle, bag opening), `tip` (a tool's working end), `end` (its other end), `center`. Use a specific name (`powder`, `die`, `head`, `stem`) only when none of these fit. |
| New props | Add the prop to its category file, export it from `lab.js`, and add an entry to `props/catalog.js`. Both `gallery.html` and `props.html` read that list, with its sliders. |
| Ingredients | Common ingredients have one look in every lab, kept in `props/ingredients.js`: `makeJar(mat, { ingredient: 'salt' })` and `makeJarLid(mat, { ingredient: 'salt' })`. Baking soda is peach with an orange label, salt lilac with purple. A new ingredient gets an entry there, in a colour no other uses, never colours in the sim. |
| Labels | Printed labels are `wrapLabel()` (geometry) drawing with `core/labels.js`: `tapeLabel` (lab tape), `bandLabel` (reagent jars and bottles), `cardLabel` (consumer bottles). |
| Colours | Raw hex. On r128 there's no colour management, which matches the original labs. The renderer outputs sRGB, so a raw hex renders lighter than it looks in a picker; wrap a picked colour in `toLinear('#9fcfae')` to get what you picked. Props default to real colours, not white (the sage plate, amber rack and so on came from Strawberry), so things read apart on the bench. |
| Draw order | Transparent objects render in `renderOrder`: liquid 1, stream 2, glass/plastic 3, rims 4, printed labels 5–6. Glass must render after the liquid inside it. |
| Shared materials | Everything from `createMaterials` is shared (`userData.shared`). Never mutate one; call `mat.make.glass({...})`, `mat.make.liquid(color)` etc. for your own copy. Props never call `new THREE.Mesh*Material` themselves: other lit materials go through `mat.make.solid`, `mat.make.standard({...})` or `mat.make.physical({...})`, so a change in `materials.js` reaches every prop. Unlit effects (light cones, screens, ripples) may use `MeshBasicMaterial`. |
| Clickable objects | `ix.register(key, group, { name, short, desc, anchor })`. `short` is the marker label, and `anchor` is where the marker points. |

## What's in Lab, and where it came from

| File | What | From |
| --- | --- | --- |
| `core/stage.js` | renderer, studio and glass reflection maps, lights, `focus(view)`, frame loop, `setRender()` | Photosynthesis, plus Ecoli's glass reflection map |
| `materials.js` | `glassMaterial` and the shared material set | Ecoli (glass), Photosynthesis (the rest) |
| `interact.js` | picking, hover highlight, 'circle'/'dot' target markers, hover label with a status line | Photosynthesis (label layout, 'dot'), BloodType (status line, no orbit on press), OnionRoot ('circle') |
| `zoom.js` | zoom levels: live circles, lens transition, a camera and labels per level | Strawberry |
| `intro.js` | the intro card every lab opens with, and `createPropArt` (a prop turning on its own renderer) | Ecoli |
| `lesson.js` | steps, Hands-on/Watch modes and autoplay, numbered procedure list, instruction card, timeline with play, back, next, restart-step and scrub | Strawberry (timeline, play), OnionRoot (list, card) |
| `follow.js` | Watch mode's follow camera | new |
| `core/labels.js` | label drawers: tape, band, card | Photosynthesis (tape), the jar and bottle labels merged |
| `props/catalog.js` | every prop with its example call and sliders, read by the gallery and the viewer | was two lists, in gallery.html and props.html |
| `core/liquid.js` | the liquid inside every container: volume from the wall profile, auto-updating clip planes, pouring, surface disc | new (merges the beaker's, cup's and Strawberry's own versions) |
| `props/*` | beaker, cup, syringe, pipette, dish, rod, tray, lamp, timer, punch, jar, lid, scoop, squeeze bottle, bench, work mat, paper towel, pour stream, ripple, powder, drop | Photosynthesis |
| `props/*` | strawberry, calyx, zip-top bag, test tube, tube rack, funnel with coffee filter, reagent bottle, ice bath, skewer, plate, bowl, DNA precipitate | Strawberry |
| `props/surfaces.js` | waste bin | BloodType |
| `props/*` | microcentrifuge tube, agar plate (colonies, streak, lawn, UV glow), inoculation loop, block tube rack, tool holder, water bath, UV lamp, bench card | Ecoli |
| `props/specimens.js`, `props/effects.js` | spinach leaf and leaf disks; rising bubbles | moved out of the Photosynthesis and Strawberry sims |
| `core/random.js` | `rand()`/`gauss()` for the lesson, plus `seeded(seed)`: a separate fixed stream for props whose look is set by a seed (a strawberry's seeds, ice cubes) | Photosynthesis, Strawberry |

A lab's props go into `Lab/props` straight away, even when only one lab uses them, so the next lab finds them. Bigger machinery stays in its sim until a second lab needs it (the zoom views moved into Lab with Ecoli; the cell and molecule scenes stay in their sims).

## Upgrading three.js

Everything is pinned to r128, the same version as the original labs, so that moving a lab over changes nothing visually. To upgrade, change the import map in each sim and in `gallery.html`, then:

* `materials.js`: the glass shader hooks `#include <output_fragment>`, which became `opaque_fragment` in r154.
* `core/stage.js` and `core/canvas.js`: `outputEncoding`/`sRGBEncoding` became `outputColorSpace`/`SRGBColorSpace`. Lights use physical units from r155, so retune their intensities. Colour management is on by default, so hex colours will look different. Check each sim against the gallery.
