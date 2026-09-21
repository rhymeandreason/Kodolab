<!-- KIND: recipe — load whole when building a component a generated app can mount: a cell, a tissue, an organism, a render of anything. Not for a lesson page, and not for a shared plumbing module (that is Modules.md's "Adding a module"). -->

# Adding a component

A component is a 3D scene a student's app can mount by name and drive by parameters, without writing Three.js. **`kit/app.js`'s `USES` table is the list of what exists**; a count typed here would be stale by the next one. Read one before starting. `leaf/leaf.js` is the smallest and the closest model for a render; `membrane/membrane.js` for anything with physics; `graph/graph.js` for anything that is not a scene.

**The test of done is not that the bench looks right.** It is that `gemini-3.7-flash`, given only `docs/Components.md` and a one-sentence request, produces a working page that mounts your component. `tools/gen-app.js` runs exactly that. A component the model cannot use from the reference is not finished.

## 1. The contract

```js
const c = X.mount(el, params);   // builds its own canvas inside el and starts running
c.set({ ...params });            // any param, live; returns c
c.state();                       // a plain object; null before the first frame is acceptable
c.on('frame', (s, dt) => ...);   // every tick; returns an unsubscribe
c.start(); c.stop(); c.pump(dt); // pump is one step and one draw by hand, for tests
c.destroy();                     // gives the WebGL context back
c.sim; c.box;                    // the layers under it
```

Two layers, both exported:

* `X.create(THREE, root, camera, opts)` is the scene. It adds to a `root` it was handed, owns everything it adds, and knows nothing about canvases, loops or the DOM. It returns `{ step(dt), state(), set(next), on(ev, fn), ... }`.
* `X.mount(el, params)` is one `kit/card-stage.js` box around it: `CardStage.create({ mount: el, cam, stage, step, afterFrame, onResize, viewOffset: params.viewOffset })`. Pass `viewOffset` through; that is what centres the scene beside a lesson shell's panel. Do not write your own render loop, resize observer, or destroy. CardStage's are the ones that give the context back and stop rendering when the box scrolls off screen.

`set` reconciles: it adds and removes the difference, and never tears the scene down to apply a number. A parameter that requires a rebuild (a seed, a layer height) may rebuild, and the header says which ones do.

`state()` carries **every number a page could print**, and the reference will tell the model to print from it. If a fact is worth a caption, put it in state, not in the model's memory. Tree's flows once reported the params instead of the live intensities; a page printed zeros while water visibly flowed.

Events: `frame` always. Add named events for things a page wants to react to (`cross`, `turn`, `hover`, `select`, `night`), and emit nothing a page can read off `frame` anyway.

**Anchors and a library**, returned by `create` and wired by `mount` through `Notebook.create` in `lib/annotate.js`. `anchors` is name → function returning a live world point, or null when that part is not on stage. `library` is name → `{text, card, offset}`: the label and a two-sentence card, in a tutor's voice, for each part. This is how a generated page answers "what is that?" with a callout on the thing instead of a paragraph, so write the library as carefully as the header. The mount exposes `note`, `notes`, `clearNotes` and `anchors`; copy the five lines from `leaf/leaf.js`'s mount. List the anchor names in the Components.md section.

**Params that move, glide.** `set()` is the whole animation API a page gets: it names the destination, the component takes the time. Own a `CardStage.tweens()` (`kit/card-stage.js`, which every component already loads), advance it with `update(dt)` at the top of `step`, and route each moving param through a keyed tween so a second `set()` mid-flight replaces the first instead of racing it. Accept `set(next, {snap:true})` and honour it: a slider the student is dragging must track the thumb, and a glide chasing it feels broken. A param that rebuilds geometry snaps regardless — nothing can tween across a rebuild. Say in the header and the reference section which params glide and which snap.

`kit/motion.js` is the OTHER tweener and stays the page's: it sequences beats, seeks, and rides a wall clock so a beat that advances lesson state fires in a hidden tab. A component owes a hidden tab no picture, so it does not need any of that, and loading it would cost every generated page a script tag it can forget. The easing names are shared, so the same word means the same curve in both.

**Selection clears on the background, not on a second click.** Clicking the part that is already selected keeps it: on a model made of small parts it is easy to click the same one twice, and a click on the thing you are already looking at reads as "yes, this one" rather than as undo. Emptiness is what clears — a click that picks nothing. Guard it against drags: the browser fires `click` at the end of an orbit like any other, so an orbit ending over empty space would throw the selection away; measure the pointer from where it went down and treat more than a few pixels as a drag.

**A facing for a part on the far side.** Beside `anchors`, return `facings`: name → function giving the WORLD direction that part faces. `lib/annotate.js` fades a note out as its part turns away, so a callout is never left on a surface the student is looking at the back of. A function, not a baked vector, for the reason anchors are functions — the model turns, and the normal turns with it. Only the parts that can face away need one. Leaf declares two, both `(0,-1,0)` through the block's world quaternion; every other anchor is on the cut face the default camera is aimed at.

**A view for a part that faces away.** If an anchor names something the default camera cannot see, declare a pose for it (`{theta, phi, r}`), expose it on `views()`, and expose `lookAt(name)` on the mount, which is `box.flyTo(pose)`. **Pointing at a part and travelling to it are separate**: the panel's `notes` row labels and the `zoom` row flies, and a note chip moves the camera only for a part `views()` names. A component with no far side declares no views and still exposes `lookAt`, which a step or the `zoom` row calls when travel is what was asked for. Declare a view ONLY for the parts that need one: a component that flies on every chip is seasick, and a part already in frame should not move the camera. `box.flyTo` interpolates theta/phi/r rather than the camera's position — a straight line between two poses passes through the middle of the model — and takes theta the short way round.

**Layers and a palette.** `layers()` lists what can be shown or hidden as `{name, label, on}`, `show(name, on)` does it by visibility (the sim keeps running: a hidden water still crosses), and `palette()` says what the colours mean. `CardStage.showPanel` turns all three into chips, so a component that declares them gets its "point at / show / colours" UI without a page writing a button. List the layer names in the Components.md section too.

## 2. The stack

* **Three r128, global script, no modules, no build.** The prototypes for Leaf and Tree were ES-module Three 0.17x and both were ported down; the library is not moving up (Modules.md). `lib/geo.js` holds the geometry the r128 build lacks: capsule, rounded box, merge. Add to it rather than vendoring an addon.
* **No CSS2DRenderer.** A label pinned to a 3D point is a DOM element in an overlay, positioned in CardStage's `afterFrame` from `camera.project`. `tree/tree.js`'s piles do it.
* **Lights: keep Stage's, and add to the CAMERA.** `Stage.create`'s studio lights are parented to the camera, so orbiting reads as turning the model under a fixed lamp rather than sweeping a lamp across it. That is what makes water-lab look soft, and it is the default to extend, not replace: a world-fixed key puts the far side of a model in the dark exactly when the student turns it over to look at something there. Leaf's underside is where its stomata are, and it learned this the hard way. Add a hemisphere when up and down are real for the subject, and warm Stage's blue fill off, which reads as cold grey on anything green.
* **Shadows are opt-in, and mostly the answer is no.** No featured lesson casts one. A directional light's shadow has no darkness to turn down, so lightening one costs a fill that flattens everything else to pay for it; between parts packed closely it lands as soot. Form comes from normals and colour. Set `castShadow`/`receiveShadow` at build anyway, so a page that does want a map gets every mesh right — but leave `renderer.shadowMap.enabled` alone. Tree is the exception that proves it: its sun IS the subject, it swings through a day, and it dims Stage's lights *because* it replaces them.
* **Tone mapping off.** These colours are authored, not captured, so there is no dynamic range to compress and ACES only rolls the saturation off. r128 light intensities are not physical units either, so a prototype's numbers do not transfer: tune by eye, against the render, and say so in a comment. A hex that looks right in the file renders paler and greyer than it reads there.
* **Colours.** Atom and bond colours come from `palette.js`, never typed (CLAUDE.md). A render's own palette (a cytoplasm, a chloroplast) is the component's, declared once at the top of the file.
* **Materials are per instance of what can be dimmed or highlighted separately.** 

## 3. Scale and science

* **Declare a `SCALE` block, and declare it first.** `kit/scale.js` holds the ladder as an enum. It goes beside the `global.X = {...}` export:

```js
X.SCALE = {
  rung: 'cell',                  // required, from the nine-rung ladder
  form: 'single',                // 'single' | 'bulk'
  unit: null,                    // metres per scene unit, or null: not measurable
  sceneUnits: [],                // advertised fields that are scene units on purpose
  exag: { ribosome: 30 },        // drawn / true, per part name
  down: { membrane: 'Membrane' },// part name -> the component a zoom hands off to
};
```

* **One scale family per scene, and rung is now what says so.** Components at the same rung may share a scene; components at different rungs may not. Two things are "in the same scene" if they are rendered with the same camera, so a page can host *multiple* scenes (via kit/card-stage.js, one canvas per card or an inset module) with no conflict. tests/cards-cluster.html is the cited example: an ångström phospholipid in one card, display-scale water in another, on the same page, fine, because they never share a camera. 
* **`form` is how many, and bulk plus single at one rung is the normal scene.** A solute inside bulk water, a chloroplast inside bulk mesophyll. Reach for that before reaching for a second box.
* **Say what is measured and what is drawn, in `unit`.** A render of a plant cell is a textbook diagram, prop tier: proportions plausible, nothing deposited, so `unit: null`. That is a claim rather than a gap: nothing may print a length off a component with no unit. Where a number is real (a bilayer's thickness from OPM, a tree's allometry) keep it beside its citation, and if the whole render is measurable give `unit` its metres per scene unit. **How big the real thing IS survives the render not being to scale**, so a real size still belongs on the library card as prose: "a red blood cell is about 8 µm across" is a fact about cells, not a measurement of the picture.
* **Invariants live in the component, not in the prompt.** A student remixing parameters must not be able to make the science false: clamp ranges, refuse impossible counts, keep the same particle budget per side if that is what the claim rests on. Membrane's contents reconcile and its budgets refuse; the reference only describes the rule.
* **Anything that moves obeys `Animation.md`**: what a motion claims, how an event is staged, and how to check one where rAF does not run.
* Pedagogical exaggeration is allowed and goes in `exag` as drawn/true per part, applied uniformly so relative sizes stay true. A page then prints the factor rather than typing it. Membrane's long-standing `EXAG` is `exag:{crossing:5}`.

## 4. Budget

A generated page will put more on stage than you expect. Measure the sim step alone, `sim.step(dt)` in a loop, at the crowd the reference recommends and at the budget:

* under 2 ms a step at the recommended crowd, on a laptop
* a hard cap the component enforces at `add`, with one console warning, not a clamp somewhere later
* anything quadratic in the crowd bucketed on a grid

Measure the fixed cost too, with nothing on stage. Membrane's was 3 ms a frame from a lathe rebuilt every tick whether or not its gates had moved, and it hid under the crowd cost until an empty stage was timed.

## 5. Files, in this order

1. `<name>/<name>.js`, header first. The header is the contract: what it is, what one unit is, every param with its range and default, what `state()` holds, the events, what is exaggerated, what it refuses to own, and the `SCALE` block beside the export. Comments are present tense and explain the non-obvious (CLAUDE.md).

2. `<name>/<name>-test.html`, the bench: every control a `set`, every readout from `state`, **on the lesson shell** (`css/kodo.css` + `css/lesson-shell.css` + `kit/lesson-shell.js`), which is the chrome a student will actually meet the component in, so the bench and the generated app cannot flatter it differently. One step, and `.lshell-nav` / `.lshell-progress` hidden: a bench is one screen, not a sequence. Copy `leaf/leaf-test.html`. Drive it with `pump` from the console; a backgrounded tab never runs the loop.

3. A checker if the component makes a checkable claim, `<name>/check-<name>.js`, Node-loadable and dependency-free, and its line in `tools/check.js`'s `AREAS` once the component is past test status.

4. `demos/kit/app.js`: a line in `USES` naming every module the component needs, and each of those in `ORDER` if it is not there already, at the position it must load in. **The page a student generates names components, not files**, so a component absent from that table cannot be mounted at all, and `api/_builder.js` reads `USES` for what to check a page against. A stylesheet of its own goes in `CSS`. Then `demos/tests/loader-test.html` is the proof: point its `data-use` at the new name and the console stays clean.
5. `docs/Components.md`: a section in the shape of the others. **No script list**: the loader owns that now. A **`**Scale**: <rung>, <form>`** line, the `mount` call with every param commented, what it models in two sentences, the `state()` table, events, then **Good for / Not for**. Add the component to the ladder table too. The model reads nothing else, so if the section does not say it, the model does not know it. Keep it tight; the whole file is the cached prompt and every section costs every request.

   **The section is not documentation. It is the model's decision procedure**, and the two want opposite things. The API half can be terse: one `mount` call with commented params is enough, and prose restating what a param does is never consulted. Spend the sentences on WHEN TO REACH FOR IT, which is the one thing that cannot be inferred from an example — and name the thing the model would otherwise do instead, because it already has an answer and you are beating it, not describing yourself. "A step that asks how something CHANGES gets a trace; a step that asks what something IS gets a `.stat`" is what made the model draw a graph. "Good for showing change over time" did not. Say where it mounts if that is not `shell.stage`; the reference says the stage is the only layout, so a component that belongs in the panel has nowhere to go until the section says so.

   **A dependency outside `demos/` goes in `kit/app.js`, not in the section.** The loader writes the tag, so the page's own source never names it and `validate()` never sees it. A cross-site script is the one thing to weigh before adding: Chrome may refuse a parser-blocking cross-site script written by `document.write` on a slow connection, which is a component that silently does not arrive. `kit/app.js`'s header says which ones are already taken on and why.

6. `docs/Modules.md`: one row in the Components table. `admin.html`: one card for the bench. `node tools/check-docs.js` passes.

   **The two shelves, and the still they show.** `library.html` (at `/library`) and `contribute.html`'s row each carry one typed card per component: name, a one-line blurb, three or four feature chips, and the rung. Components have no registry, so both cards are typed and both are yours to add. The picture is a baked still: add a `SHOTS` entry to `tools/component-stills.html` with the params that make a frame worth keeping, run it on the dev server in Chrome, and commit `media/components/<key>.webp`. A component that draws in HTML rather than a canvas (Graph, Diagram) mounts live on both pages instead and gets a `skip` entry in `SHOTS`.

7. Run `node tools/gen-app.js "<a request a teacher would type that needs your component>" tests/gen-<name>-test.html`, open the page, drive it, and fix the component or the reference until it works first try. **Twice, and read the `retried` flag in the printed JSON**: `retried:true` means the draft failed `validate()` and the second try dropped whatever caused it, so a page missing your component is a block, not a preference. Add the page to `admin.html` under Generated apps with the `UGC` badge. That page is the eval; keep it.

## 6. What the last four taught

* The reference is carrying the structure. A bare question produced a three-step lesson. Put effort into the section, not into a prompt.
* **Cut the section, then let the eval say what was load-bearing.** You cannot tell by reading which sentences earn their place. Graph's went 120 lines to 47 with nothing lost, and the whole difference between two runs drawing a graph and two runs drawing none was one sentence that trimming by judgement would have deleted. Write it short, run it twice, add back only what changes the output.
* Anything the reference has to say twice, or say in prose as a rule, should be a parameter or a default instead. The salmon app reached under the params twice; both became defaults.
* What the model forgets goes into the library, not the doc. It forgot `viewOffset`, so the shell now stamps it on its stage and CardStage reads it there.
* Two flaws from three runs were in the components, not the model: a frame cost and a noisy readout. Drive the generated page by hand; the model's page will use your component the way a student will, not the way your bench does.
