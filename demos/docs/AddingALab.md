<!-- KIND: recipe. Load whole when building a new bench-lab simulation on `lab/` (an experiment on a 3D bench: Strawberry DNA, Glowing E. coli, Floating Leaf Disks). Not for a lesson on the kit/ stack, which is AddingAPage.md or AddingAComponent.md. What each piece of the library does, and what the props are, is `lab/README.md` and `lab/PROPS.md`; the list of existing labs and their quirks is `lab/LABS.md`. -->

# Adding a lab

A lab is one experiment on a bench: the student clicks the equipment through the procedure, or watches it play. It lives in `lab/<name>/` and runs on `lab/`'s ES modules (three r186 on an import map), never on the classic-script stack the rest of `demos/` uses.

## 1. Copy a lab

Copy `lab/strawberry/` to `lab/<name>/` and rename the page `<name>-lab.html`. **The page holds only what is this lab's**; `lab/page.js` writes everything every lab shares, so a change to the chrome or the three.js version is one edit:

```html
<head>
  <meta charset="utf-8">
  <script defer src="/demos/lib/site.js"></script>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Strawberry DNA</title>                 <!-- the tab's; text.js's title is the topbar's -->
  <script src="../page.js" data-text="text.js"></script>  <!-- import map, fonts, icons, lab.css, the words -->
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="app">
    <!-- the lab's own backgrounds and panels, if any; the intro card and info modal come from text.js -->
  </div>
  <script>LabPage.chrome()</script>
  <script type="module" async src="intro-art.js"></script>
  <script type="module" src="main.js"></script>
</body>
```

`LabPage.chrome()` adds the canvas, the topbar with the wordmark (`site.js` turns it into the lesson menu), the procedure panel, the modal and the intro frame; `zoom.js` adds the zoom circles. Never write those into a page. A chrome element every lab needs goes in `page.js`.

Pick the accent on the root: `<html lang="en" data-lab-theme="teal">`. The themes are in `lab/themes.html`, and the lab's CSS uses the `--accent*` tokens, never hex, for anything themed (README, "Colour themes").

**Splitting the build across agents:** write the contract first, one short file: every new prop's call, origin, anchors and setters; the state object each zoom level poses from; and what each step sets it to. Then props, levels and `main.js` can be built at once and meet with little rework. Give the level builders a bench page with every state field on a slider (`mendel/levels-test.html`). A props brief names the anatomy (Mendel's: stipules bigger than the leaflets, branched tendrils, a keel round ten stamens, fresh vs dry pods); "a pea plant" alone gets a generic vine.

## 2. The minimum `main.js`

```js
import * as THREE from 'three';
import { V3, createStage, createMaterials, createInteraction, createLesson, createFollowCam,
         chromeInsets, bindChrome, disposeTree, makeBench, makeBeaker, moveTo } from '../lab.js';

const stage = createStage({ canvas: document.getElementById('scene'),
  views: { bench: { t: V3(0, 4, 0), p: V3(0, 40, 60) } },
  insets: (w, h) => chromeInsets(w, h) });
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
bindChrome({ stage, restart: () => lesson.restart(), expose: { get B() { return B; }, lesson, stage } });
lesson.start();
stage.start();
```

`ix.register(key, group, { name, short, desc, anchor })` makes an object clickable: `short` is its marker label, `anchor` where the marker points.

## 3. Write the steps

**Every word a student reads goes in `<lab>/text.js`, never in the code.** Teachers edit it and translators copy it, so the code names keys and keeps everything else: timings, colours, which label a caption points at. `strawberry/text.js` is the worked example and its key scheme is the one to copy: `intro`, `info`, `phases`, `steps.<id>` (card fields plus `captions`), `complete`, `why`, `objects`, `props`, `levels.<key>` (`name`, `labels`, `info`, `legend`, `cues`). Modules read it as `T` from `lab.js`; `{name}` slots are filled with `fmt()`, so a sentence with a number in it stays one string a translator can reorder. A count the sim owns goes in as a slot, not typed (Photosynthesis's `{disks}`), so editing the sentence can never contradict the bench. Shared UI words are `lab/strings.js` (`UI`). A translation is `text.<lang>.js` beside it, with only the keys it translates, loaded for `?lang=<lang>`: `page.js`'s header.

Each field has one job, and putting text in the wrong one is what makes the card long:

| Field | Holds |
| --- | --- |
| `title` | the step's name, on the card and the timeline |
| `detail` | amounts and how-to: "Pour 150 mL into cup A" |
| `why` | the payoff. Shows only once the object is clicked |
| `hint` | what to click |
| `action` | the hover tooltip's status line only |
| `caption` | Watch mode's line: what is happening, never what to click. Default `title`. Return `{ text, note }` for a short essential aside |
| `clock` | the card's top-right time-lapse, or null |

Group steps into `phases` with a `desc` line each, so 16 steps read as 4 in the procedure list. Any card text can be a function, re-read on every render. A `caption` function is re-read every frame, so it can follow the animation: `cues(() => S.t, [[0, 'Pull off the leaves'], [0.42, 'Put it in the bag']])`.

**Write captions as a video's voiceover, not a log of the animation.** Read in order, a lab's captions should be a coherent paragraph that still tells the student what to do: start from the card's `detail`, which is already the instruction, and condense it. That means:
* One line for a stretch of action, not one per motion. "Soak a disk in yeast, blot it, drop it in" covers the whole handling, rather than "dip", "drop", "dip", "drop" flickering by for each disk.
* Narrate a repeated procedure once, in full, then summarise: "Repeat with each cup, {conc} this time." Pick the narrated run by order of play ("no other trial started yet"), not by index, so it holds when a student clicks out of order (`catalase/main.js`'s `runCaption`).
* Instruct first. A why belongs in a `note` or on the card; a caption may name what to watch for ("The weaker the peroxide, the longer the disks take to rise") but never replaces the instruction with an explanation.
* A summary line must stay true in any order the student plays the steps, so prefer "the weaker…, the longer…" to "slower than the last one".

The last step's payoff goes in `completeHint` / `completeWhy`, not on the last step, where it would only flash during the animation. The complete card rises in and folds to its title on its own; a lab can style it wider with `.lab-card.complete` and stagger its contents under `.lab-card.arrive` (Ecoli's results).

## 4. Rules that make the timeline work

Going back or jumping ahead calls `rebuild()`, replays the earlier clicks instantly, and completes any skipped steps. For that to work:

1. **All bench state lives inside what `rebuild()` creates.** Keep it in an object recreated there (`S`), never in a module-level variable.
2. **Animate only with `anim`, `moveTo` and `wait`** from `core/tween.js`. They finish instantly during replay. Never `setTimeout`, `requestAnimationFrame` or CSS transitions for bench state.
3. **Use `rand()` and `gauss()`, never `Math.random()`.** The lesson reseeds before each click, so a replay reproduces the same results. Draw random values before any `await` that runs in parallel.
4. **Multi-click steps** need `isDone()`, and ideally `progress()` for the timeline fill. An auto-completed step clicks its first active target until `isDone()`.
5. **Timed steps** use `watch: { duration, get, set, rate }`. `set(t)` poses everything from `t` alone, so the student can scrub (Photosynthesis's observation step).
6. **A sim that poses objects every frame** poses them only when its state changes, or the hover lift is overwritten.
7. **A life cycle is one number.** Mendel's `poseSite(site, age)` turns days since a flower opened into bud, flower, wither, pod, dry pod; the parents, the cross and the F₁ garden all call it, so scrubbing comes free.
8. **Where an item lands follows click order**, kept in `S` (Mendel's `S.order`), never a fixed index per source: a student who clicks out of order otherwise makes landed items jump to new slots.

**Hand actions are shared:** `lab/hands.js` has `pourPose`, `carry` (over a container wall), `dropIn` (a used item into a bin) and the micropipette's `takeTip`, `pipetteDraw`, `pipetteDispense`, `ejectTip`. They keep these rules; use them before writing your own, and add one there when a second lab would repeat it.

**A step finished off the bench** (a panel where the student counts or measures: Onion's eyepiece, Gel's gel image) keeps its state in that panel, not in `S`, so a rebuild leaves it alone and only restart clears it. The step's `isDone` reads the panel and returns true in Watch (`lesson.mode === 'watch'`), since Watch stops at the bench; `progress` reads it too; its `run` opens the panel unless `isInstant()`. The panel's change handler calls `lesson.jumpTo(i + 1)` once it is done, because no bench click is coming to advance the step.

**A graded question must survive the noise in the student's data.** Work out the spread before writing the choices: Mendel's ~120 peas pick "ratio nearest 3:1 or 2:1" wrong about one run in eight, while "about 1 in 4 green, or 1 in 2" is 3.6 σ safe. A prediction is never graded; show what they said beside what happened. Once answered and passed, a question folds to its result line, or the panel grows over the zoom circles.

## 5. The intro card

Its text is `intro` in `text.js`, built by `page.js` before any module loads, so it shows at once while the bench loads: a kicker, a title with one `<em>` word, a short paragraph and three `keys`, the ideas the lab is about. `info` is the (i) modal: `body`, numbered `steps`, an `equation`, muted `notes` and icon `tips`, all optional. Markup the page keeps for itself (a panel, the intro art) takes its words from `data-t="key.path"`. The Start button is added for you; a `.intro-art` in the page's `.lab-intro` replaces the default empty one (Ecoli's plasmid). Call `createIntro(stage, { art })` near the end of `main.js`.

* Start the art from a small `intro-art.js`, loaded `<script type="module" async>` before `main.js`, so it shows before the library has loaded. `createPropArt(box, (mat) => makeStrawberry(mat).group)` turns any prop.
* The opening camera move waits for Start: in `onEnter`, the first step does `intro.started.then(() => stage.focus(step.view, 2.2))`.

## 6. Zoom levels, if the bench needs explaining

`createZoom(stage, { levels: [{ key: 'cell', world, name, meta, bg }], getT, getStep })`, then pass the result to both `createLesson({ zoom, levelWhy })` and `createInteraction(stage, { zoom })`. That is all the wiring: Watch is held while zoomed in, the card's hint points back to the Lab, its why (and `completeWhy`) becomes `levelWhy(levelKey, step)` (`step` is null on the complete card; return null for none), bench clicks stop off the Lab view, and the free area is re-measured on every switch. A world is the lab's own scene, in its folder (`strawberry/cell.js`); its shape is the header of `lab/zoom.js`. `zoom.js` makes the circles and the per-level backgrounds; the lab's CSS only colours `.bg-<key>`.

**Every level shows the same moment.** Pose bench, cell and molecule from one number (Strawberry's clock `S.t`, animated between resting points with `anim()`), or have the world ease toward a stage the bench sets (Ecoli's `S.micro`). Either way replay needs no extra code. A world whose background changes with the bench (Ecoli's UV) returns `insetBg(bg)` so its circle follows.

**Each level narrates itself in Watch.** A world's `cue(t)` returns `{ text, mark }`: what is happening at that scale, not the bench step. `cueAt([[t, cue], …], t)` from `lesson.js` picks one off a clock; Ecoli's switches on stage and its eased state. `mark` is a label's `key` (or its `text`), spotlit while the cue is up. `createLesson({ zoom })` shows it as the caption; Play then holds on each cue until it is readable, so a level's beats may sit closer than the bench's. Time cues to the labels' `show` windows, and give a step that changes nothing at this scale one short line rather than none.

## 7. The camera

* `insets: (w, h) => chromeInsets(w, h)`, passed to `createStage`, measures the standard chrome so views centre in the free area. A lab with panels of its own passes extras (`chromeInsets(w, h, { bottom: ['.data-panel'] })`) or adjusts the result; Photosynthesis's observation step is the example.
* The card's height changes per step: call `stage.resize()` in `onEnter`.
* Close-ups aim from the props, not typed coordinates: read the subject's world position and facing after `rebuild()` and write them into the view's `t` and `p` (`stage.focus` reads the views object by reference). Turn a prop so the part being worked on faces the reader (Mendel's `faceFront`). Typed coordinates break whenever a prop changes.
* Watch mode's camera takes `rig: { t, p }` (the one default zoom) and `special: [...]`, the view names allowed to zoom in, as `createFollowCam` options. Everything else only pans (README, "Watch camera").

## 8. Props

Reuse first: `lab/gallery.html` shows every prop, and `lab/props.html#<key>` one at a time with its sliders. **For a prop's call, origin, anchors and state setters, read its entry in `props/catalog.js`, not its source**; `PROPS.md` is the spec for new props and `CATALOG.md` the build status of every planned one. A new prop:

1. goes in its category file in `lab/props/`, even if only this lab uses it, so the next lab finds it. Start a new file when one passes about 300 lines
2. is exported from `lab/lab.js`
3. gets an entry in `props/catalog.js`, which both benches read
4. follows `lab/README.md`'s "Prop conventions": units, origin, anchors, liquids, materials, draw order

A common ingredient gets one entry in `props/ingredients.js` in a colour no other uses, never a colour in the lab. Bigger machinery (a cell scene) stays in the lab's folder until a second lab needs it.

**A setter that changes a material after creation paints every copy now drawing.** `ix.register` gives each mesh its own material copy, so a prop that keeps writing to the material it made stops changing on screen once it is clickable, frozen in whatever state it was registered in (Mendel's pods stayed dry, its leaves stayed yellow). Tag the material with `live()` and change it through `paint(root, m, fn)`, both in `props/shapes.js`.

Rule: Lowest face at y ≥ 0.015 cm (0.03 for scaled-up props). Walls start on top of the floor, and inner parts are 0.04 cm narrower than the walls around them. This solves flickering when object is placed on a table.

## 9. Check it

* `?intro=0` skips the intro, `?speed=8` speeds up every animation, `?mode=watch` opens in Watch
* at \~1440×900 and at phone width, in both modes, on every step with a side panel
* back, jump ahead and scrub from every step: the bench must come back the same
* `lab/gallery.html` after any prop change, since every lab shares the props
* screenshots: headless Playwright (in `node_modules`, Chromium) renders a lab on the GPU at a true 1440×900 with rAF and tweens running. Launch with `--use-angle=metal --enable-gpu --ignore-gpu-blocklist`, reach each step with `page.evaluate(() => LAB.lesson.jumpTo(i))`, and run it with network access, since three.js and fonts come from a CDN. Since a step's pose is a function of `S` alone, setting an action's progress (`LAB.S.em = 0.5`) shows the middle of an animation, which is where things clip through each other; a few frames per action, from the step's camera and one from the side, go a long way
* the built-in browser pane is for what the human should watch. Its tab is usually hidden: rAF does not run, the first screenshot after a change is often stale (take two), camera glides need `stage.focus(view, 0)`, and `window.__noLiveReload = true` stops reloads while other agents save. Have the human play it through in Safari

## 10. Put it in kodolab

* a card in `admin.html`, status prototype
* to publish at `/labs/<name>`: a rewrite and a 301 in `vercel.json`; `<base href="/demos/lab/<folder>/">` in the page, or its scripts 404 at the short URL; a `PAGES` entry in `tools/seo.js`, then run it; a `lib/lessons.js` row with a card still in `media/components/`; then `node tools/check.js deploy`. `docs/deploy.md` is the why
