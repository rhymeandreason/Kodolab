<!-- KIND: recipe. Load whole when building a new bench-lab simulation on `lab/` (an experiment on a 3D bench: Strawberry DNA, Glowing E. coli, Floating Leaf Disks). Not for a lesson on the kit/ stack, which is AddingAPage.md or AddingAComponent.md. What each piece of the library does, and what the props are, is `lab/README.md` and `lab/PROPS.md`. -->

# Adding a lab

A lab is one experiment on a bench: the student clicks the equipment through the procedure, or watches it play. It lives in `lab/<name>/` and runs on `lab/`'s ES modules (three r128 on an import map), never on the classic-script stack the rest of `demos/` uses.

## 1. Copy a lab

Copy `lab/strawberry/` to `lab/<name>/` and rename the page `<name>-lab.html`. Keep its skeleton:

* `<script defer src="/demos/lib/site.js">`, first in `<head>`
* the wordmark in the topbar, written exactly as Strawberry has it: `<div class="brand lab-brand chrome-title">`, then `<a class="mark">`, then `.brand-title` with the `<h1>`. `site.js` turns the mark into the lesson menu
* `../lab.css`, then the lab's own `styles.css`; the Phosphor icon CSS
* the import map. Import maps can't be shared, so every lab carries its own:

```html
<script type="importmap">
  { "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/"
  } }
</script>
```

Pick the accent on the root: `<html lang="en" data-lab-theme="teal">`. The themes are in `lab/themes.html`, and the lab's CSS uses the `--accent*` tokens, never hex, for anything themed (README, "Colour themes").

## 2. The minimum `main.js`

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

`ix.register(key, group, { name, short, desc, anchor })` makes an object clickable: `short` is its marker label, `anchor` where the marker points.

## 3. Write the steps

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

The last step's payoff goes in `completeHint` / `completeWhy`, not on the last step, where it would only flash during the animation. The complete card rises in and folds to its title on its own; a lab can style it wider with `.lab-card.complete` and stagger its contents under `.lab-card.arrive` (Ecoli's results).

## 4. Rules that make the timeline work

Going back or jumping ahead calls `rebuild()`, replays the earlier clicks instantly, and completes any skipped steps. For that to work:

1. **All bench state lives inside what `rebuild()` creates.** Keep it in an object recreated there (`S`), never in a module-level variable.
2. **Animate only with `anim`, `moveTo` and `wait`** from `core/tween.js`. They finish instantly during replay. Never `setTimeout`, `requestAnimationFrame` or CSS transitions for bench state.
3. **Use `rand()` and `gauss()`, never `Math.random()`.** The lesson reseeds before each click, so a replay reproduces the same results. Draw random values before any `await` that runs in parallel.
4. **Multi-click steps** need `isDone()`, and ideally `progress()` for the timeline fill. An auto-completed step clicks its first active target until `isDone()`.
5. **Timed steps** use `watch: { duration, get, set, rate }`. `set(t)` poses everything from `t` alone, so the student can scrub (Photosynthesis's observation step).
6. **A sim that poses objects every frame** poses them only when its state changes, or the hover lift is overwritten.

## 5. The intro card

Its markup is in the page (the header of `lab/intro.js`), so it shows at once while the bench loads: a kicker, a title with one `<em>` word, a short paragraph and three `.keys`, the ideas the lab is about. Call `createIntro(stage, { art })` near the end of `main.js`.

* Start the art from a small `intro-art.js`, loaded `<script type="module" async>` before `main.js`, so it shows before the library has loaded. `createPropArt(box, (mat) => makeStrawberry(mat).group)` turns any prop.
* The opening camera move waits for Start: in `onEnter`, the first step does `intro.started.then(() => stage.focus(step.view, 2.2))`.

## 6. Zoom levels, if the bench needs explaining

`createZoom(stage, { levels: [{ key: 'cell', world, name, meta, bg }], getT, getStep })`. A world is the lab's own scene, in its folder (`strawberry/cell.js`); its shape is the header of `lab/zoom.js`. The page gives one `.zoom-inset` circle per level you're not looking at, and the lab's CSS sets `.bg-<key>`.

**Every level shows the same moment.** Pose bench, cell and molecule from one number (Strawberry's clock `S.t`, animated between resting points with `anim()`), or have the world ease toward a stage the bench sets (Ecoli's `S.micro`). Either way replay needs no extra code. A world whose background changes with the bench (Ecoli's UV) returns `insetBg(bg)` so its circle follows.

## 7. The camera

* `insets(w, h)`, passed to `createStage`, says how much of the screen the UI covers. Measure the real elements: the top of the card, captions or timeline (whichever is higher; a hidden one counts as 0) and the procedure panel's width. `.lab-captions` keeps a fixed height, so the camera doesn't shift per caption.
* The card's height changes per step: call `stage.resize()` in `onEnter`.
* Watch mode's camera takes `rig: { t, p }` (the one default zoom) and `special: [...]`, the view names allowed to zoom in, as `createFollowCam` options. Everything else only pans (README, "Watch camera").

## 8. Props

Reuse first: `lab/gallery.html` shows every prop, and `lab/props.html#<key>` one at a time with its sliders. A new prop:

1. goes in its category file in `lab/props/`, even if only this lab uses it, so the next lab finds it. Start a new file when one passes about 300 lines
2. is exported from `lab/lab.js`
3. gets an entry in `props/catalog.js`, which both benches read
4. follows `lab/README.md`'s "Prop conventions": units, origin, anchors, liquids, materials, draw order

A common ingredient gets one entry in `props/ingredients.js` in a colour no other uses, never a colour in the lab. Bigger machinery (a cell scene) stays in the lab's folder until a second lab needs it.

## 9. Check it

* `?intro=0` skips the intro, `?speed=8` speeds up every animation, `?mode=watch` opens in Watch
* at ~1440×900 and at phone width, in both modes, on every step with a side panel
* back, jump ahead and scrub from every step: the bench must come back the same
* `lab/gallery.html` after any prop change, since every lab shares the props
* the browser pane's tab is hidden and rAF does not run there: drive frames with `stage.frame(performance.now())`, and have the human play it through in Safari

## 10. Put it in kodolab

* a card in `admin.html`, status prototype
* to publish at `/labs/<name>`: a rewrite and a 301 in `vercel.json`; `<base href="/demos/lab/<folder>/">` in the page, or its scripts 404 at the short URL; a `PAGES` entry in `tools/seo.js`, then run it; a `lib/lessons.js` row with a card still in `media/components/`; then `node tools/check.js deploy`. `docs/deploy.md` is the why
