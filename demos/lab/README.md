# Lab

Shared pieces for 3D bench-lab simulations: stage, materials, props, clickable objects, and a lesson with Hands-on and Watch modes and a timeline you can step back and forth on. **Building a lab is `docs/AddingALab.md`**; this file is what the library does.

Built here; the `Experiments/Lab` repo it came from is archived with the original prototypes the props were taken from.

| | |
| --- | --- |
| `photosynthesis/photosynthesis-lab.html` | Floating leaf disks. The first lab, and the timed, scrubbable observation step |
| `strawberry/strawberry-lab.html` | DNA extraction. Two zoom levels (a cell, the molecules) posed from one clock |
| `ecoli/ecoli-lab.html` | Bacterial transformation with GFP. One zoom level, a UV step that darkens the room, results on the complete card |
| `gallery.html` | every prop on one bench: the catalog, and the check that a change broke nothing |
| `props.html` | one prop on a turntable with its size, anchors and state sliders. `props.html#syringe` |
| `themes.html` | the colour themes side by side, with the UI in each |
| [PROPS.md](PROPS.md), [CATALOG.md](CATALOG.md) | the prop spec, and the build status of every prop and effect |
| `plans/` | which labs to build and why: [ROADMAP.md](plans/ROADMAP.md) picks; MICRO, HISTORIC, HOW-DO-WE-KNOW, QUESTIONS, DESIGN-MODE, PROPS-COVERAGE are the pools it picks from |

## The lesson UI

`createLesson` builds all of it; a lab supplies steps, phases and text.

* **Words live in text files.** `lab/strings.js` is the UI's, `<lab>/text.js` the lab's (`data-text` on the `page.js` tag). `page.js` loads them as classic scripts before any module, plus `strings.<lang>.js` / `text.<lang>.js` for `?lang=`, merged key by key over the English; modules read `T`, `UI` and `fmt` from `lab.js`. A page's own markup names its words with `data-t="key.path"` (Ecoli's plasmid labels, Photosynthesis's data panel).

* **Two modes**, toggled in the top bar. **Hands-on** (default): the student clicks objects and the timeline is hidden. **Watch**: a **Play** button runs the experiment, clicking each step's targets itself. Pause freezes mid-animation (`setPaused` in `core/tween.js`); Space toggles play. Object clicks are ignored and markers hidden. Off the Lab view, a lab's zoom `onChange` calls `lesson.holdWatch(true)`: Watch is forced and Hands-on greyed out until the reader returns, when their mode comes back.
* **Watch is video-like**: the card and procedure list hide, and the step's caption shows large above the timeline. `introCaption` shows before Play, `completeCaption` at the end, a step's `clock` above the caption. Toasts are muted. Zoomed into a level, the level's own caption (`zoom.caption()`, from its world's `cue(t)`) replaces the step's, and Play holds until each has been up long enough to read.
* **Procedure list** (from OnionRoot): numbered *phases*, not steps. The current phase shows one pip per step; clicking a phase jumps to it.
* **Instruction card**, bottom centre (from OnionRoot): a chip numbered like the list ("Step 3b of 6"), `title`, `detail`, then `why` once the object is clicked. When the lab ends it shows `completeHint` and `completeWhy`, gets `.complete`, rises in (`.arrive`) and folds to its title from a caret or a click on the title.
* **Target markers**, `markerStyle: 'circle' | 'dot'` (or `ix.setMarkerStyle()`): a dark pill with a pulsing ring on the bench, or a white pill on a stem. Both label the object with its `short` name, never an instruction.
* **Hover lift**: a clickable object rises 0.8 cm under the pointer (`hoverLift`, 0 turns it off). It's an offset dropped before a click runs, so step animations are unaffected. Liquids from `core/liquid.js` follow it.
* **Hover glow**: `ix.register` gives each mesh its own copy of its material. Liquids from `core/liquid.js` set their clip planes on whichever material is drawing; a hand-built liquid that keeps its own plane or material needs `userData.noHL = true`.

### Watch camera

`follow.js` takes every `stage.focus()` in Watch mode (`stage.setFocusFilter`); Hands-on keeps every authored view. Its rules avoid nausea:

* **One default zoom per lab** (`rig`). Normal moves only pan left and right, keeping the rig's height, distance and angle.
* **Only named close-ups zoom in** (`special`). The next normal view zooms back out, unless it's in `keepClose` (a step between two close-ups, like Strawberry's 'spool').
* **Move only when needed.** A view whose subject is already well inside the free width is dropped, and so is a pan shorter than 15% of it. Only horizontal position counts.
* **At most 4 moves in any 30 s, and 3 s between pans.** A view over budget waits. Zooming into or out of a close-up, and an action that has left the screen, are exempt.
* **No continuous tracking.** If the action pokes more than 8% of the free width past an edge, the camera makes one slow pan to bring it in.
* `follow.stats.history` lists every move with its reason (`window.LAB.follow` in each lab).

### Zoom levels

`zoom.js` draws the levels you're not looking at into circles (render-to-texture) and runs the lens transition when you click one; keys 1, 2, 3 switch too. It takes over the frame's render with `stage.setRender()` and gives each level its own camera and orbit controls on the same `stage.insets()`. Bench clicks only work in the Lab view: `createInteraction(stage, { enabled })` turns picking, hover and markers off elsewhere.

### Colour themes

A lab picks its accent with `data-lab-theme` on its root: green (default), teal, sky, blue, indigo, violet, rose, orange. Each sets five tokens in `lab.css`, and every Lab component uses only these:

| Token | Used for |
| --- | --- |
| `--accent` | fills: buttons, current step, markers, the 3D rings |
| `--accent-2` | lighter partner: gradients, pulse dots, the 3D hover glow |
| `--accent-soft` | tinted backgrounds: current list row, chips |
| `--accent-ink` | accent-coloured *text* on light backgrounds |
| `--accent-glow` | accent on dark backgrounds: icons in dark pills, the clock |

Colours that carry meaning in the experiment (cup A's line on the chart, a stain) are content, not theme, and stay fixed. In JS, `themeColor('--accent')` reads a token and `setTheme(name)` switches. The neutrals and type follow `css/lesson-shell.css`, so a lab reads as kodolab.

## Prop conventions

| | |
| --- | --- |
| Units | 1 unit = 1 cm. The bench top is at y = 0. |
| Origin | Centre of the base, +Y up. Exceptions are noted in each file (a syringe's is its tip, a punch's its die). |
| Files | One per category, following [PROPS.md](PROPS.md)'s sections: `surfaces`, `glassware`, `bottles`, `bag`, `kitchen`, `racks`, `tools`, `equipment`, `culture`, `specimens`, `effects`, `ingredients`. |
| Shape | `makeX(mat, opts)` returns `{ group, anchors, ...controls }`. `worldOf(prop.group, prop.anchors.spout)` gives an anchor's world position. |
| Anchors | Named points in local space: `top` (centre of an opening), `floor` (where contents rest), `spout` (where it pours from), `tip` (a tool's working end), `end`, `center`. A specific name (`powder`, `die`) only when none fit. |
| Liquids | Every container with a liquid has `prop.liquid` from `core/liquid.js`: `setVolume(mL)`, `setLevel(cm)`, `setFraction(f)`, `setRange(f0, f1)` for layers, `setPour(k)` while tilting, `setColor`, `setCloud`, world-space `surfaceY()`. The container's inner wall profile sets the volume, and the surface stays level as it moves or tilts with no per-frame code. |
| Ingredients | One look in every lab, from `props/ingredients.js`: `makeJar(mat, { ingredient: 'salt' })`. Baking soda is peach with an orange label, salt lilac with purple. |
| Labels | `wrapLabel()` geometry drawn with `core/labels.js`: `tapeLabel` (lab tape), `bandLabel` (reagent bottles), `cardLabel` (consumer bottles). |
| Colours | Raw hex: colour management is off (`core/three-compat.js`). The renderer outputs sRGB, so a raw hex renders lighter than in a picker; `toLinear('#9fcfae')` gives what you picked. Props default to real colours, not white, so things read apart on the bench. |
| Draw order | Transparent `renderOrder`: liquid 1, stream 2, glass/plastic 3, rims 4, printed labels 5–6. Glass renders after the liquid inside it. |
| Materials | Everything from `createMaterials` is shared (`userData.shared`): never mutate one. `mat.make.glass({...})`, `mat.make.liquid(color)`, `mat.make.solid`, `mat.make.standard({...})`, `mat.make.physical({...})` make your own copy, so a change in `materials.js` reaches every prop. Only unlit effects (light cones, screens) use `MeshBasicMaterial` directly. |

## What's in Lab, and where it came from

| File | What | From |
| --- | --- | --- |
| `core/stage.js` | renderer, studio and glass reflection maps, lights, `focus(view)`, frame loop, `setRender()` | Photosynthesis, plus Ecoli's glass reflection map |
| `materials.js` | `glassMaterial` and the shared material set | Ecoli (glass), Photosynthesis (the rest) |
| `interact.js` | picking, hover highlight, target markers, hover label with a status line | Photosynthesis, BloodType, OnionRoot |
| `lesson.js` | steps, both modes and autoplay, procedure list, instruction card, timeline | Strawberry (timeline, play), OnionRoot (list, card) |
| `follow.js` | Watch mode's camera | new |
| `zoom.js` | zoom levels: live circles, lens transition, a camera and labels per level | Strawberry |
| `intro.js` | the intro card, and `createPropArt` (a prop turning on its own renderer) | Ecoli |
| `page.js` | the page around a lab: head (import map, fonts, icons, lab.css) and chrome (topbar, procedure panel, info modal, intro frame), so a lab page holds only its content | new |
| `chrome.js` | `chromeInsets` (the camera's free area) and `bindChrome` (view and restart buttons, `window.LAB`) | new |
| `core/liquid.js` | the liquid in every container | new, merging three versions |
| `core/labels.js` | label drawers: tape, band, card | Photosynthesis, plus the jar and bottle labels |
| `core/random.js` | `rand()`/`gauss()` for the lesson, plus `seeded(seed)`, a fixed stream for props whose look is set by a seed | Photosynthesis, Strawberry |
| `props/catalog.js` | every prop with its example call and sliders, read by both benches | |
| `props/*` | bench glassware, syringe, pipette, lamp, timer, punch, jars | Photosynthesis |
| `props/*` | strawberry, zip-top bag, test tubes, funnel and filter, reagent bottle, ice bath, skewer, DNA precipitate | Strawberry |
| `props/*` | microcentrifuge tube, agar plate (colonies, lawn, UV glow), loop, block rack, water bath, UV lamp, bench card | Ecoli |
| `props/surfaces.js` | waste bin | BloodType |

## Upgrading three.js

Every lab and bench runs r186.1, pinned by `THREE_VERSION` in `page.js`. `?three=128` on any page loads r128 instead, to compare, and still works: `core/three-compat.js` holds every difference the labs hit (colour space, the ×π on lights, punctual decay, the glass shader's chunk name, render targets that are no longer tone mapped, and r163+ ignoring a material's `envMapIntensity` under `scene.environment`). It keeps colour management off, so a hex means the same on both. Once r128 is no longer worth comparing against, inline it and delete the file.

`core/sketch.js` is the sketch outline: ink silhouettes and creases from a normal + depth pass, liquid edges stronger. Every stage has it (`stage.sketch`), on the bench only, never inside a zoom level. Off in the labs while it is tuned: `?sketch=1` turns it on, and `?sketch=0` off on the benches, which default it on (`createStage({ sketch: true })`). Tune it in `props.html` (View → Sketch outline). A marker or effect that should not be inked sets `userData.noSketch`.
