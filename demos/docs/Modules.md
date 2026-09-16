<!-- KIND: recipe + reference — load when a page needs a module it does not already load, or when building a module. The table is lookup material: read the row, not the file. -->

# Modules

The shared layer: what exists, what each one owns, and how to add one.

## Scope: shared, folder, one lesson

**A module's scope is declared, not inferred**, and the table below says which each one is in its Rules column or its note.

* **shared** — more than one page loads it: `scene.js`, `molecules.js`, `kit/motion.js`, `kit/card-stage.js`, `annotate.js`, `fx.js`. Changing one is a change to every lesson, so its rules belong here and its checker is not optional.
* **folder** — owned by a folder and loaded by that folder's pages and bench: `water/`, `membrane/`, `reaction/`, `energy/`. Its stylesheet lives beside it, never in `css/`.
* **one lesson** — built for a single page and loaded by nothing else: `haworth.js` (reached through `diagram-2d.js`), `molecule-builder/` (the builder), `folding/actin.js`. It may hold that lesson's assumptions, and it says so in its header.

**A one-lesson module is not a candidate for anything until a second page wants it.** Generalising on one instance is how a shared module acquires a caller's assumptions — see "One instance is not a convention" below. Promoting one means moving the file and changing its row here, in the same commit.

**A component is not a module with a `mount()`.** It owns its own physics and its own scale (`kit/scale.js`), and it is the only layer a generated app can see: `docs/AddingAComponent.md`. A module a component happens to use stays a module.

## How a page loads the library

**Two ways, and which one a page uses is decided by who wrote it.**

**A generated app names what it MOUNTS, not what it loads** — one tag:

```html
<script src="../kit/app.js" data-shell="steps" data-use="Membrane,Graph"></script>
```

`kit/app.js`'s `ORDER` and `USES` tables are the one copy of the load order: `ORDER` is the only sequence the files may load in, `USES` says which files each component needs, and `api/_builder.js` reads this file so the reference handed to the model carries no script list to drift. **Adding a component means adding a line to `USES`, and nothing else.** `data-shell` picks the template the same way. It uses `document.write` deliberately — the library is globals with a load order and no build, and the tags must run before the page's own inline script; the header says why injecting them instead would make every page a callback.

Four rules were prose here and enforced by nothing: both molecule families at once, a component without the module its scene is built from, `geo.js` after `card-stage.js`, `lesson-shell.js` anywhere. A page on `app.js` cannot express any of them.

**A hand-built lesson names its files**, because someone reads them. Only `molecules.js` + `scene.js` are universal. It loads what it uses, in this order — each script assumes the ones above it:

```html
<link rel="stylesheet" href="kodo.css">      <!-- always, first — the site sheet: tokens, type scale, buttons, page shell; loads the fonts. It imports brand.css, so a page never links that -->
<link rel="stylesheet" href="pathways.css"> <!-- only for a step-through pathway lesson; see below -->
<link rel="stylesheet" href="energy/energy.css"> <!-- only with energy/energy.js; after pathways.css -->
<link rel="stylesheet" href="kit/enzyme-blob.css">  <!-- only with kit/enzyme-blob.js; the module depends on these rules -->
<link rel="stylesheet" href="proteins/protein-test.css"> <!-- a protein bench links this and kit/proteinbox.css, and no site sheet -->
<link rel="stylesheet" href="molecule-builder/molecule-builder.css"> <!-- only with molecule-builder.js -->
...
<script src=".../three.min.js"></script>
<script src="palette.js"></script>     <!-- always, first — atom/bond colours + radii -->
<script src="tokens-from-palette.js"></script>  <!-- always, straight after — publishes the atom/bond colours as CSS -->
<script src="molecules.js"></script>   <!-- always — PALETTE, SCALE, VIEW + the empty registry -->
<script src="skel.js"></script>        <!-- only if the page shows a Skel-built molecule -->
<script src="mol-small.js"></script>       <!-- the specs: load the domains this page shows -->
<script src="mol-aminoacids.js"></script>  <!-- the domains this page shows -->
<script src="mol-krebs.js"></script>       <!-- the citric-acid cycle + CoA/FAD; needs skel.js -->
<script src="scene.js"></script>       <!-- always — Stage.create + molecule builder -->
<script src="water/watersim.js"></script>  <!-- only for a solvation page; after scene.js. Carries its own salts, so needs no mol-*.js -->
<script src="water/watersim-mount.js"></script>  <!-- the one-call box over it; after kit/card-stage.js -->
<script src="kit/motion.js"></script>     <!-- the timeline, if anything animates -->
<script src="kit/molgraph.js"></script>   <!-- if the page asks a spec a question -->
<script src="kit/fit.js"></script>        <!-- if chrome sits over the canvas -->
<script src="kit/lanes.js"></script>      <!-- if molecules stand side by side -->
<script src="kit/hotspot.js"></script>    <!-- if the student clicks the chemistry -->
<script src="kit/leaving.js"></script>    <!-- if something detaches and travels -->
<script src="kit/carriers.js"></script>   <!-- if a molecule has two states -->
<script src="kit/enzyme-blob.js"></script>     <!-- if a step has a catalyst to show -->
<script src="kit/modal.js"></script>      <!-- if the lesson has side doors -->
<script src="kit/card-stage.js"></script> <!-- the stage shell: several live stages, a molbox, or an embedded builder -->
<script src="kit/molbox.js"></script>     <!-- if a page draws one molecule in a box; after card-stage.js -->
<script src="kit/focus.js"></script>      <!-- if the page says "look here" -->
<script src="kit/stagekit.js"></script>   <!-- the loop/resize/fit shell; last of the four -->
<script src="molview.js"></script>     <!-- if the page shows one molecule three ways -->
<script src="fx.js"></script>          <!-- if the page fires any effect -->
<script src="annotate.js"></script>    <!-- if the page labels parts of a model -->
<script src="reaction/reaction.js"></script>  <!-- if a step transforms a molecule (pathway lessons) -->
<script src="atomkit.js"></script>     <!-- bonding builder only -->
<script src="covalent-drag.js"></script>  <!-- bonding builder only -->
<script src="ionic-drag.js"></script>     <!-- bonding builder only -->
<script src="molecule-builder/molecule-builder.js"></script>  <!-- only to EMBED a builder; after both drag modules AND kit/card-stage.js -->
<script> /* page-specific code */ </script>
```

* **A page loads only the molecules it shows.** `molecules.js` is the registry (`PALETTE`, `SCALE`, `VIEW`, `DOMAINS`) and holds no specs; the `mol-*.js` files assign into it. Wrong script tags = `MOLECULES.x is undefined`, not a silent wrong render.
* Order is `molecules.js` → `skel.js` → `mol-*.js`. `skel.js` has no dependencies (real ångströms, never sees `SCALE`); the domain files need both, and `mol-glycans.js` builds lactose and galactobiose against `mol-sugars.js`'s galactose.
* **Spec coordinates on disk are real ångströms** (`units:'angstrom'`); `register()` applies `SCALE` once on the way in, so every spec in `lib/` is comparable to every other. `check-molecules.js` requires the field. Why, and what a protein does instead: MolecularGeometry.md §1.5.

**Two kinds of page.** Most load `scene.js` + MolLib. The folding pages (`folding-lab`, `folding-lab-ribbon`, `hemoglobin-lab`) draw *deposited* coordinates through `scene.js` too, but load `palette.js`/`molecules.js` for `PALETTE` alone, no `mol-*.js`: every coordinate is a real ångström and display radii are `PALETTE.radii / SCALE`, computed in the page.

A page that needs a real water beside measured molecules loads `mol-small.js`: **the library is one scale family.** `register()` still throws on a duplicate key, which is what would catch a second file arriving at a different scale.

<!-- ENUM: update when a module is added, or an exported entry point is added/renamed. -->

## The modules

Grouped by how often a page reaches for one. A module appears once; the group is its scope, and `Scope` above is what the three levels mean.

**A file earns a row when someone has to decide something about it** — load it, call it, or obey a rule it carries. A file its parent always drags in, that no page calls and no page can load on its own, is named in the parent's row instead: `membrane/parts.js` and `membrane/pump.js` are the pattern. That is a rule about the TABLE, not about the file — an internal file still carries its own header and its own checker.

### Core — every page loads these

Nothing below works without them, and no page chooses them.

| Module | Exposes | Rules |
| --- | --- | --- |
| `palette.js` | `MolPalette` — atom/bond colours, display radii. Loads before `molecules.js`, which re-exports it as `MolLib.PALETTE` | own header |
| `molecules.js` | `MolLib` = `PALETTE` · `MOLECULES` (registry, empty until a domain file loads) · `SCALE` · `VIEW` · `DOMAINS` · `register` · `atomIndex`/`resolveAtoms` | `MolecularGeometry.md` §1 |
| `scene.js` | `Stage.create/measure/frame/buildMolecule/atom/bond/bondSplit/removeAtoms/setOptionalH` + `STICK_RATIO`. Renderer, camera, orbit, lights, resize, and the two bond styles. `turn:'trackball'` is the pole-free drag | Adding a module, below |

### Common kit — reached for on most lessons

General plumbing. A page loads the ones its mechanic needs; none of them knows what lesson it is in.

| Module | Exposes | Rules |
| --- | --- | --- |
| `kit/motion.js` | `Motion.create` → `tween`, `seq`, `after`, `step(dt)`, `cancel(tag)`, plus a handle with `seek`/`duration`. **A page's timeline**, one clock advanced by the render loop, no `setTimeout`. No THREE; Node-loadable. A component's own params glide on `CardStage.tweens()` instead: `AddingAComponent.md` §1 | `kit/README.md` |
| `kit/molgraph.js` | `MolGraph` — neighbours, `terminal`/`bridging`, `side`, `rings`, `findGroups`, `phosphoryl`, `leavingBond`, signed `torsion`, `centroid`/`spread`. Questions about a SPEC, no scene involved, so `kit/check-kit.js` asserts the same code a page animates with | `kit/README.md` |
| `kit/card-stage.js` | `CardStage.create({mount,cam,stage,step,frame,afterFrame,onResize,onDestroy,autoplay})` → `canvas` · `stage` · `start`/`stop`/`draw`/`pump` · `snapshot` · `running` · `destroy`, plus `CardStage.pool({limit,onEvict})`. **A live 3D box on a card, and the budget of them** — every component sits on it, and the pool is the reason a page with many boxes does not lose contexts | own header, `kit/README.md` |
| `kit/molbox.js` | `Molbox.create({mount,spec,spin,pad,stage,view,frame,afterFrame,leader})` → `show(spec)` · `fit` · `setSpin` · card-stage's box. One molecule in a box, on a camera it fits itself | `kit/README.md` |
| `kit/stagekit.js` | `Lesson.create` → everything `Stage.create` returns plus `fx`/`motion`/`focus`, the `frame`/`afterFrame` hooks, `worldPerPx`/`pxToWorld`, and `fit()` (turns measured DOM chrome into the world bands `Stage.frame` takes). **Anything projecting DOM onto a 3D point goes in `afterFrame`** | `kit/README.md` |
| `kit/fit.js` | `Fit.create({canvas,camera,cam,reserve})` → `usable` · `solve` · `anchorTop` · `frustum`. The arithmetic for a scene with chrome over it; the page supplies what it reserved | `kit/README.md` |
| `kit/focus.js` | `Focus.create` → `atoms` (by spec index), `among` (whole objects), `clear`, `claim`. The one spelling of ghost-the-rest / light-the-chosen. A bond is lit only when BOTH ends are | `kit/README.md` |
| `kit/modal.js` | `Modal.create({el,onShow,onHide})` → `show(arg)` / `hide` / `isOpen`, plus `Modal.anyOpen()`. The side doors a lesson grows. The page writes the markup | `kit/README.md` |
| `kit/lanes.js` | `Lanes.create` → `render`/`swapOne`/`spawn`/`clear`/`settle` · `step` · `draw` · the geometry every flight target needs (`origin`, `base`, `shift`, `lift`, `top`, `offset`, `plateY`, `heightPx`). n molecules side by side that split and swap; **the module owns the lane LIST** | `kit/README.md` |
| `annotate.js` | `Annot.create` → `add`, `span`, `step`, `play`, `setMode`, `show`, `clear`. Callouts pinned to a model, DOM over the canvas, three reveal modes. `span` is the measuring bracket: it answers "how far apart", which a callout cannot | own header |
| `fx.js` | `FX.create` → `spawnRing`, `popGlow`, `protonHop`, `settleShimmer`, `step` | "Effects", below |
| `atomkit.js` | `AtomKit.create` → `dot`, `cloud`, `label`, `charge`, `cel`, `DOT_GAP` | own header |
| `molview.js` | `MolView.create` → `show`, `setMode`, `setHighlight`, `setOptionalH`, `step`, `fit`, `snap`, `viewEuler`, `resetPose`, `setSpin`, `atDeclaredView`, plus `usableAround`, `flatPose`, `VIEW_FIELD`. Three views of one molecule and the morph between them. `defaultView()` is the ONLY source of an opening angle. After `scene.js`; `smiles-drawer` only for the Diagram view | own header |
| `lib/embed.js` | puts `bare` on `<html>` when the page is FRAMED (or `?chrome=bare` forces it). The page marks its own `.chrome-title` | own header |
| `kit/lesson-shell.js` | `LessonShell.create({brand,hint,steps,ctx,onStep})` → `stage` (mount the scene here) · `ui` · `goTo` · `panelRect` · `theme`. **The step-through shell every generated app runs in.** Owns the DOM and the step index and nothing about the scene. A step's optional `onLeave(ctx,to)` returns seconds to hold before the swap | own header |
| `lib/story.js` | `Story.scroll(sections, onPart)` → the Lenis instance. A story page's scroll: momentum, which section is on the reading line, and the settle onto it. Pairs with `css/story.css`; after Lenis | own header |
| `lib/geo.js` | `Geo.capsule` · `Geo.roundedBox` · `Geo.merge` — the three geometries the r128 global build lacks. After `scene.js`, before `leaf/` or `tree/` | own header |

### Molecule data — the specs and what builds them

A page loads only the domains it draws. Order is `molecules.js` → `skel.js` → `mol-*.js`.

| Module | Exposes | Rules |
| --- | --- | --- |
| `skel.js` | `SkelLib` = `Skel` + `GL`/`AR` bond-length tables (**real ångströms**) + ring/chain scaffolds + the nucleotide fragments `adenine`, `ribosyl`, `Skel.phosphoUnit`. Builder, not data; no dependencies | MolecularGeometry.md §1.2, §1.5 |
| `residues.js` | `ResidueLib` = `SIDE` (twenty side chains in each residue's N–CA–C frame) + `graft` + `TYPES`. **Generated** by `tools/bake-residues.js` — real ångströms, no `SCALE`, no MolLib. Not a domain file: it holds pieces of molecules | own header |
| `mol-small.js` · `mol-aminoacids.js` · `mol-pathways.js` · `mol-krebs.js` · `mol-carriers.js` · `mol-heme.js` · `mol-sugars.js` · `mol-glycans.js` · `mol-lipids.js` · `mol-nucleic.js` | nothing — each `register()`s its specs into `MolLib.MOLECULES`. `mol-heme.js` is WRITTEN by `tools/bake-heme.js`: heme b from the myoglobin pocket bake, heme c with cysteine stubs from the cytochrome c bake, hydrogens grown by atom name; rerun the baker, never edit it | MolecularGeometry.md §1.2, §1.5 |
| `mol-small.js` | water, ammonia, methane, O₂, CO₂, ethanol and carbonic acid from measured lengths — the props to put beside a big molecule. The small-molecule domain | own header |
| `lib-node.js` | the whole library for Node checkers, via `MolLib.DOMAINS`. No page loads it | own header |
| `mol-shelf.js` | `MolShelf.list` (one card per molecule, not per spec) · `groupOf` (domain file → the words over a group) · `card(m, el)`. The shelf `library.html` and `molecules.html` both draw, so the two cannot disagree about the order or the count. Card CSS is the page's. After every `mol-*.js` | own header |

### Structure rendering — deposited coordinates

Real angstroms, secondary structure from the file's own records. Which representation a page wants, and what each costs: `rendering-modules.md`.

| Module | Exposes | Rules |
| --- | --- | --- |
| `kit/tube.js` | `TubeLib` = `chain` + `triangles` + `relax` + `DEFAULTS`. The abstract multi-chain style: one continuous tube per chain, helix collapsed onto its axis | `docs/rendering-modules.md` |
| `kit/ribbon.js` | `RibbonLib` = `build` + `dssp`/`parseBackbone` (Kabsch & Sander, needs N/CA/C/O) + `assign`/`detect`. Real ångströms, no materials. **Never slice a chain and build per element**: own header | `kit/check-ribbon.js` |
| `kit/surface.js` | `SurfLib` = `decode` (SES1 buffer → geometry) + `chainOf`/`numberOf` + `colors(S, fn)` + `triangles(S, pred)` / `patchGeo`. Per-vertex residue lookups, so a page can paint one residue onto the skin | `docs/rendering-modules.md` |
| `folding/folding.js` | `FoldLib` = `parse`/`hbonds`/`extended` + `orient` + `viewBasis`/`basisFrom` + `SCHEDULE` + `Folder` (constrained relaxation + `bake`). Real ångströms, renders nothing | own header |
| `proteins/proteins.js` | `ProteinLib` = `PROTEINS` · `METHODS`/`MEASURED` · `DOES` · `EC_CLASS` · `byKey` · `defaultOf` · `variantOf` · `ecOf` · `colorsOf` · `viewOf` · `urls`. Which proteins we hold, which variants of each, and what every one is FOR — what `molecules.js` is to a spec. `proteins/nucleic-acids.js` is the same index for nucleic bakes | `docs/AddingAProtein.md` |

### Components — mounted by name, driven by parameters

Each owns its own physics and its own scale, on the `X.mount(el, params)` contract. The contract and the budgets are `AddingAComponent.md`; what a generated app may say to one is `Components.md`. **`kit/app.js`'s `USES` table is the list of what a generated app can mount**; a component missing from it cannot be mounted at all.

| Module | Exposes | Rules |
| --- | --- | --- |
| `kit/proteinbox.js` <br>`docs/rendering-modules.md` | `Proteinbox.create({mount, trace/data, ...})` → card-stage's box plus `setData` · `paintSkin` · `patch` · `surface()` · `rep`. A protein in real ångströms, in its own scene; DNA/RNA through `kit/nucleic.js`. **Gated**: ribbon on create, surface and fold only on click | `docs/rendering-modules.md` |
| `proteins/atp-synthase/atp-synthase-scene.js` | `ATPSynthase.mount(el, {spin, context})` → `{box, ready, spin, setContext, advance, destroy}` · `attach(box)` → `enter(t, context)` · `exit` · `spin` · `viewFor(t, context)`. `context` is mitochondrion or thylakoid: F1 hangs into the matrix or stands into the stroma. The human enzyme turning in 45° proton steps, with drawn protons, ADP/Pi/ATP and a grey membrane band. **shared**: the story page attaches it to its own box | own header |
| `water/watersim.js` | `WaterSim.create(THREE, root, {tuning,onDissociate,onSaltChange})`. A page calls `step(frame)` with a DESCRIPTION of the scene and gets back what the module did. Draws no text and decides no fx; `thermo()` is reachable without THREE, which is what lets the checker run offline | `WaterSim.md` |
| `water/watersim-mount.js` | `WaterSim.mount(el, {nWater,salt,nSalt,temperature,freeze,hbonds})` → `set` · `state` · `on('frame'\|'dissociate'\|'saltchange')` · `destroy`, on a card-stage box. Adds no physics: `w.sim` and `w.box` are the layers under it | `WaterSim.md` |
| `membrane/sheet.js` | **shared, by two components.** `Sheet.create(THREE, root, camera, P, machines)`: the bilayer with one hole per protein, the travellers, pores, hops, shells, voltage and headcount, and `Sheet.mount(el, params, spec)` the box. A machine is a plugin (`layout`, `pre`, `post`, `onConduct`, `admits`, …, its header lists them). Owns no protein and no physics two lessons would disagree about | own header |
| `membrane/membrane.js` | `Membrane.create` / `Membrane.mount`: sheet.js plus channels and the Na⁺/K⁺ pump, over `membrane/parts.js` (the shapes) and `membrane/pump.js` (the Post-Albers cycle as a function of time, no THREE, `membrane/check-pump.js`). Still runs the proton circuit when `chemiosmosis/circuit.js` is loaded, for the generated apps that mount it that way. **membrane-lab.html does not load it yet** | own header |
| `chemiosmosis/circuit.js` | `Chemiosmosis.create` / `Chemiosmosis.mount`, added to the arithmetic's own global: sheet.js plus complex (or I–IV with ubiquinone and cytochrome c, `chain:'split'`), synthase, uncoupler, translocase, outer membrane, and the ATP, fuel and O₂ tokens. `span:'cell'` is mount() stacking a Membrane above it in one box. **Load after `membrane/sheet.js` and before `membrane/membrane.js`** | `membrane/check-chemiosmosis.js` |
| `membrane/chemiosmosis.js` | the proton circuit's arithmetic, and it holds no THREE: `PROTONS_PER_PH`, the rotor's stoichiometry, `PMF_STALL`, `Complex`, `CONTEXTS`. **Load before `sheet.js`**, which throws without it. The bottom half is always the enclosed compartment, and `pumpDir()` is the single sign every direction reads. Mitochondrion and Chloroplast read their stoichiometry here too | `membrane/check-chemiosmosis.js` |
| `macromolecule/nucleoside.js` | `Nucleoside.pose(sugar, base, lib)` / `react` / `routeFor`. The fourth condensation: a sugar's anomeric –OH meets a base's ring N–H and a nucleoside is left. MEASURED off dATP/dGTP/dTTP/dCTP, because the chi torsion is what decides anti vs syn and nothing derives it from angles. A purine bonds through N9 and a pyrimidine through N1, declared per base and never guessed — a purine has an N1 too, on its other ring | `check-nucleoside.js` |
| `condense/condense.js` | `Condense.create(THREE, root, camera, opts)` / `Condense.mount(el, params)`: one condensation between two molecules, and the water it releases. `progress` 0..1 is the whole animation and it SCRUBS, so a beat can be looked at rather than caught. Owns the beats only — `macromolecule/` solves the geometry and which atoms leave, and which molecule gives the oxygen is read off the specs, never branched on the linkage. Molecules rung, and measurable: real angstroms | `AddingAComponent.md` |
| `respiration/respiration.js` <br>`respiration/steps.js` | `RespirationReaction.mount(el, {step:'krebs/3', x2, click, fit})` → `run` · `next` · `prev` · `reset` · `steps(pathway)`. One step of glycolysis, pyruvate oxidation, the Krebs cycle, fermentation or the electron transport chain on TWO molecules: the substrate and the one it reacts with, a carrier standing as a lane rather than a tray tile, the ×2 a badge. The animation is `reaction/reaction.js`'s verbs over `kit/lanes.js`, `kit/hotspot.js` and `kit/leaving.js`; `respiration/steps.js` is the step table, keyed `<pathway>/<key>`, and the physics it copies from the three pathway lessons has two homes until they migrate. Molecules rung | `respiration/check-respiration.js` |
| `leaf/leaf.js` | `Leaf.create(THREE, root, camera, opts)` / `Leaf.mount(el, params)`: five layers from a seed, `explode`, `isolate`. Tissue rung, prop tier — nothing is measured | `AddingAComponent.md` |
| `tree/tree.js` | `Tree.mount` — a procedural oak, a person for scale, the potted willow, five particle flows and the piles by origin. Adds `flyTo` in Stage's turntable terms and a `viewOffset` callback. Organism rung; the lesson's copy is `tree/tree-steps.js` | `AddingAComponent.md` |
| `cell/animalcell.js` · `cell/plantcell.js` | two components at the cell rung, **not one with a switch** — different cells with different arguments. Both build from `cell/organelles.js` | `AddingAComponent.md` |
| `cell/chloroplast.js` | one chloroplast at the `organelle` rung, the level of detail a cut leaf cell cannot show: two envelope membranes, grana as stacks of sacs joined by lamellae, PSII / b6f / PSI / synthase sorted by where they fit, protons round the circuit and O₂ leaving. Geometry is `cell/organelles.js`'s `chloroplastDetail`, behaviour is here | `AddingAComponent.md` |
| `cell/mitochondrion.js` | one organelle at the `organelle` rung, the level of detail a cut cell cannot show: two membranes, cristae as sacs, the chain on them, protons round the circuit. Geometry is `cell/organelles.js`'s `mitochondrionDetail`, behaviour is here | `AddingAComponent.md` |
| `cell/organelles.js` | the shared kit: nucleus, mitochondrion (two levels of detail — `mitochondrion` for a cut cell, `mitochondrionDetail` for the organelle as the subject, which the cut cell also swaps in on a fly-to), Golgi, ER, plastids (`chloroplast` for a cut cell, `chloroplastDetail` for the organelle as the subject), vacuole, plus `buildShell` (any parametric surface, offset inward and closed with a rounded lip, so a cut organelle has real membrane thickness) and `partsOf` (a cell's organelle list → the anchors, layers and `show` the contract asks for, live) | own header |
| `bloodcell/bloodcell.js` | one red cell, **measured** — a scene unit to the micrometre. Sickling, swelling, crenating and the cut are one grid allocated at mount and moved. `state()` carries area, volume and swell ratio read off the profile | `AddingAComponent.md` |
| `sickle/sickle-fibre.js` | `SickleFibre.mount(el, {base, preset})`; `preset` changes only HOW MANY copies are drawn. **Measured and modelled are separate blocks of `state()`.** The assembly maths (`place`, `strainOf`, `linkOf`, `seatsFor`) is free of THREE, so the checker runs it rather than a copy | own header |
| `molecule/molecule.js` | `Molecule.mount(el, {molecule, mode, spin, showH, highlight})` — one MolLib spec on `lib/molview.js` over a card-stage box, the pair `molecules.html`'s modal uses. Diagram's twin from the same spec: `mode:'2d'` is molview's morph onto the flat layout, anchors are the spec's atom names, `highlight` is molview's grey-and-glow, `state().source` is the spec's `src.path` in a sentence. No `create`: the scene layer IS molview | own header |
| `graph/graph.js` | `Graph.mount(el, params)` — Observable Plot under a SEMANTIC layer: a caller says what the graph MEANS (scatter of rate against light, fit a line, error bars from the spread) and never touches a mark, a scale or a colour. Not a scene, but on the same contract | own header |
| `bloodcell/bloodflow.js` | `BloodFlow.mount(el, {sickle})` — a vessel of red cells, and what a stiff one does in it. After `bloodcell/bloodcell.js`, whose disc profile and red it reads | own header |
| `sickle/hbcrowd.js` | `HbCrowd.mount(el, {variant, stick})` — a crowd of haemoglobins, and what HbS does that HbA does not. After `kit/surface.js` and `sickle/sickle-fibre.js` | own header |
| `kit/scale.js` | `ScaleLadder.RUNGS` — nine rungs from `molecules` to `population`, and every component declares one block against it. Same rung may share a scene, different rungs may not; crossing one is a handoff between boxes. `unit` is usually **null**, which is a claim and not a gap. Just the enum: nothing enforces a block | `MolecularGeometry.md` §1.5 |

### Scoped — one lesson, or one folder's pages

Each of these carries a caller's assumptions on purpose. **Not a candidate for anything until a second page wants it.**

| Module | Exposes | Rules |
| --- | --- | --- |
| `kit/hotspot.js` | `Hotspot.create({canvas,camera,host,glowHost,onPick})` → `update(items)` / `clear`. The click target that sits ON the chemistry, at the bond's projected midpoint, from `afterFrame` | `kit/README.md` |
| `kit/carriers.js` | `Carriers.create({root,camera,canvas,host,align})` → `show(n,spec)` · `setGroup(g,group,charged,keep)` · `place(visible)` · `pointAt`/`bondMid` (flight endpoints, null rather than a guess) · `pop(j)` · `clear`. The carrier tray beside the subject. No chemistry: the page's pair table says which molecule and which atoms | `kit/README.md` |
| `kit/leaving.js` | `Leaving.create({root,camera,motion,tag})` → `shed`/`unshed` · `fragment` · `launch` · `gather`/`link` · `offstage`/`acrossScreen`. A group detaching, travelling and arriving. Where 'gone' is, is solved from the camera | `kit/README.md` |
| `kit/enzyme-blob.js` | `EnzymeBlob.create({camera,canvas,host})` → `update(sets,{key,pin})` / `clear` / `measure`, plus the pure `EnzymeBlob.circle(pts)`. The translucent blob behind the molecule a step acts on — one path for every enzyme. `sets` is arrays of GROUPS, never lane indices. Chrome is `kit/enzyme-blob.css` | `kit/README.md`, `kit/check-kit.js` |
| `reaction/reaction.js` | `Reaction.create({host})` → `verbs`, `verb(name,{dur,lane})`, `durOf`, `lane`, `all`, plus `Reaction.stageHost({lanes,carriers,onLanes})`. What a step DOES to a molecule, driving the lesson's own 3D stage. `host` answers only stage questions; timings are the module's. Verb table: own header | `reaction/check-reaction.js` |
| `haworth.js` | `Haworth` = `haworth` (sugar spec → Haworth-projection SVG) + `findRings` + `faces`. Derived from the spec's own geometry, never through SMILES. Reached through `diagram-2d.js`, not called directly | own header |
| `diagram-2d.js` | `Diagram2D` = `draw(el,spec,opts)` · `highlight(spec,refs)` · `mode(spec)` + the ink/box constants. The flat drawing under a 3D model: picks Haworth for a sugar, a LEWIS structure for a molecule too small to have a skeleton — any acyclic spec of four heavy atoms or fewer, laid out by walking out from its busiest atom, topologically and never from the spec's coordinates, and SmilesDrawer for everything else, sharing one palette, one font and one electron-placement rule across all three — `lonePairs:true` draws them on a Haworth, using the same slots the Lewis structures use. Bench: `tests/diagram-2d-test.html`. Does NOT read `spec.flat2d` (that is bake-flat2d.js's RDKit layout, for `molecule-viewer.html`). The page loads SmilesDrawer, not the module. `diagram/diagram.js` is the COMPONENT that mounts it; this stays a module because two hand-built pages reach it directly | own header |
| `molecule-builder/molecule-builder.js` | `MoleculeBuilder.create({mount, recipe, onChange, dims, armDims, fill, turn, zoomOnComplete, afterFrame})` → `sim` · `setView` · `flat` · `reset` · `fill` · `state` · `snapshot` · card-stage's box. The bonding builder as a box a page can put anywhere. Owns its own ORTHOGRAPHIC stage; picks `CovalentDrag` or `IonicDrag` from the recipe name and holds no chemistry of its own | own header, `molecule-builder/check-molecule-builder.js` |
| `covalent-drag.js` / `ionic-drag.js` | `CovalentDrag` / `IonicDrag`, each driven by a `RECIPES` table | own header |
| `amylase/fit.js` | `AmylaseFit` = `place` + `kabsch` · `clash` · `index`/`nearest` · `SEVERE`/`CLOSE`. Real ångströms, no THREE. The pose is deposited, not searched. `amylase/amylase-test.html` only | `amylase/tools/check-fit.js` |
| `hemoglobin/hbfold.js` | `HbFold` = `decode` (baked fold → Cα trace, secondary structure, H-bonds, sequence, the **focus segment**'s backbone, `at(t)`). `hemoglobin-lab.html` only. Real ångströms, no THREE | own header |
| `folding/actin.js` | `ActinLib` = `parseCA` + `screwOf` + `extend` + `encode`/`decode`. `attic/folding-lab.html` rungs 4–5 only. Real ångströms | own header |
| `folding/villin.js` | `VillinLib` = `parseCA`/`segment` (PAE → rigid domains)/`poses` + `encode`/`decode`. `attic/folding-lab.html` act 3 only. Real ångströms | own header |
| `lobes/lobes.js` | `Lobes.at(spec, i)` for the geometry, `Lobes.create(THREE).build(spec, {like: molGroup})` for meshes. The electrons a molecule is NOT sharing. **Not molecular orbitals** — the localised picture, and a page owes the student that word. **Always pass `like:`**, and `dirs.length` is not a pair count | own header, `lobes/check-lobes.js` |
| `lib/mapcontent.js` | content, not code, and the door map's: `window.MapContent = {DOORS, CONCEPTS, QUESTIONS, CONTENT, PLACEMENTS}`. **QUESTIONS is question-major on purpose**, and rank belongs to the EDGE. `tools/mapcontent-io.js` is the one place that knows the shape | `tests/question-composer.md` |
| `questions.js` | content, not a module: `window.QuestionBank = {CONCEPTS, QUESTIONS}`, 27 coarse buckets, so more than one page reads the same rows. The `built` flag has to be kept true as lessons ship | the file's own header |

### Second simulations and figures

A side door off a lesson: its own canvas, its own physics, no MolLib and no geometry claim. `reaction/` is the counter-example — it drives the lesson's own 3D stage instead of adding a second one.

| Module | Exposes | Rules |
| --- | --- | --- |
| `massaction/` | `MassAction.create({host, scenarios, ea})` after `massaction.css` + `.js`. A plain 2D canvas whose dots stand for **populations**; molecules draw from the thermal distribution and react over a barrier, `ea` forward and `ea + ΔE` back. The page supplies which reaction. `ea` is a legibility knob | `massaction/check-massaction.js` |
| `diffusion/` | `Diffusion.create({host, scenarios})` after `palette.js`/`molecules.js`. Same paradigm, asking about a box nothing is pushing. A scenario names molecules by MolLib key and the module reads their SIZE from the spec, so the rate difference is a prediction. **Reads size off the spec**, and has deliberately no membrane | `diffusion/check-diffusion.js` |
| `coupling/` | `Coupling.create({host, scenarios, range})`. The only one with real numbers: every ΔG°′ is a published value carried on the scenario. **`shared` is not a caption** — unticked, the two ΔG do not add. Disagrees with `glycolysis-lab.html` on purpose | `coupling/check-coupling.js` |
| `energy/energy.js` | `Energy.curve` · `solo` · `pair` · `tabs` · `levels` (pure) · `Y` / `BARRIER`. Free energy on a vertical axis, as two tabs of one card. **A FIGURE**: SVG strings, no canvas, no loop, no state. Its one rule is that the axis carries no scale | `energy/check-energy.js` |
| `dna/codon.js` | `Codon.figure({dna, first, at, to, view})` draws a gene fragment before and after one substitution; `Codon.read` is the same analysis with no drawing. **Three views over one analysis** — `strip`, `card`, `chain` — and which a step takes is the question it asks. **Nothing about the outcome is authored**: it comes out of the genetic code | `dna/check-codon.js` |

### Stylesheets

**`Design.md`'s sheet table is the one list** — which sheet a page links, what each holds, and where a folder's own chrome goes. The `<link>` order is above; nothing else about the sheets is here.

## Node only — checkers, bakers, tools

**No page loads any of these.** They run as `node <path>`, offline and dependency-free. Which ones the commit hook gates, and how: `dev.md`.

| File | What it does | Rules |
| --- | --- | --- |
| `kit/check-kit.js` | the offline kit code — the timeline's cancel/clamp/seek semantics, the chemistry `molgraph` claims, and `enzyme.circle`. Its fixtures carry the straddling and diagonal cases on purpose | own header |
| `kit/check-ribbon.js` | `ribbon.js`'s orientation frame, measured on an ideal helix and an ideal strand the checker builds from arithmetic — no data file, no THREE, so it runs instantly | own header |
| `reaction/check-reaction.js` | the four claims the module used to make with nothing checking them: every `fx:` a lesson names is a registered verb, exactly one verb is `whole`, and no verb reads a lane it was not given | own header |
| `energy/check-energy.js` | that no drawn label is a quantity and the axis has no ticks; that each shape says what it means; that every `tone:` a page declares is coloured | own header |
| `proteins/check-proteins.js` | the registry against the files it describes: every variant has its bake and every bake a variant, and the counts a bake carries are the registry's | own header |
| `hemoglobin/tools/check-hb.js` | the ~85 assertions behind the haemoglobin page: staleness, quantisation, both decoders agreeing, DSSP vs deposited HELIX records, level 1's flat chain | own header |
| `tools/check-residues.js` | re-bakes and compares, then asserts chemistry: heavy-atom counts, ring closure, proline's ring onto the backbone N, and **L-configuration** — one of two checks that catch a mirror | own header |
| `tools/check-handedness.js` | the ONLY check that catches a global mirror; needs `npm i` + network. Covers glycolysis too, deriving SMILES from spec geometry where none is committed | own header, MolecularGeometry.md §1.3 |
| `proteins/bake-lib.js` | how a deposition is READ, for every protein's baker: `modelOne` · `caTrace` · `ssRanges`/`ssFrom` · `declared` · `disulfides` · `ligands` · `modResidues` | `docs/AddingAProtein.md` |
| `proteins/tools/read-own.js` | the `read` blocks for a protein marked `pipeline:'own'` — haemoglobin today, whose bakes carry no `meta` to cross-check | own header |
| `proteins/tools/registry-io.js` | `read` · `parse` · `validate` · `write(key, blocks)` · `spliceRead`. **The one place that knows the registry's shape**: RUN the file rather than parse it, and splice back only the `read` block | own header |
| `tools/bake-residues.js` | writes `residues.js` by MEASURING the twenty side chains off committed structures — 2HHB for nineteen, 9ZZI for isoleucine. Keeps one real instance each (the medoid), never an average of rotamers | own header |
| `tools/bake-flat2d.js` | `--write` as above. The 2D LAYOUT (`flat2d`) each `flat:true` spec's atoms slide onto — RDKit's depiction coordinates, returned in the spec's own atom order so no graph matching is needed, scaled to the molecule's own mean bond | own header |
| `tools/sdf2spec.js` | PubChem 3D → spec, amino-acid backbone order | `tools/README.md` |
| `tools/sdf2spec-generic.js` | the same for non-amino-acids; orients on the ring plane | `tools/README.md` |
| `tools/sdf/` | the committed PubChem inputs (9 `.sdf`) for every `path:'pubchem'` spec | `tools/sdf/README.md` |
| `tools/catalog/` | the molecule catalog (265 rows) with the `CID` / `Has 3D` / `Stereo` columns the resolver added. Committed for `tools/sdf/`'s reason: a build-time input no page loads, costing \~400 network requests to re-derive | `tools/catalog/README.md` |
| `tools/resolve-catalog.js` | resolves `tools/catalog/`'s NAMES to CIDs and asks whether each has a 3D conformer. **Needs the network.** Never picks between candidates: marks a row `Ambiguous` and reports every CID | own header |
| `tools/spec2smiles.js` | regenerates every contrast spec's `smiles` through RDKit. `--write` puts it in the spec instead of printing it to paste | `tools/README.md` |
| `tools/specfile.js` | writes a generated field back into the spec that owns it, for the two bakers above. Replaces a field that is already there and refuses to invent a position for one that is not; verifies every write by re-loading the library | own header |
| `folding/tools/bake-actin.js` | reduces 9ZZI + 9JUS (6.1 MB) to `pdb/actin.bin` (27 KB): one protomer, the screw that stacks it, the complex's Cα traces. The page rebuilds the other twelve | own header |
| `folding/tools/bake-villin.js` | derives villin's domains from the 1.9 MB PAE, samples the eight arrangements, runs `RibbonLib.dssp` over the full backbone → `folding/data/AF-P02640-villin.poses.bin`. Neither the PAE nor the backbone reaches the browser, so the DSSP happens here | own header |
| `folding/tools/bake-fold.js` | solves the villin fold once → `folding/data/1VII.fold.bin` (442 KB, 185 keyframes). Both folding pages play that file. **Re-run after any change to the solver, schedule or H-bond cutoffs** | own header |
| `hemoglobin/tools/chain.js` | pulls one chain out of 2HHB and builds the amide hydrogens it doesn't deposit — `FoldLib.parse` reads no chain ID, and `hbonds` needs an H an X-ray structure lacks | own header |
| `hemoglobin/tools/bake-unfold.js` | **the baker.** Unfolds 2HHB chain B and reverses the film, holding helices rigid at first → `hemoglobin/data/2HHB-B.fold.bin` (403 KB, \~60 s), keyframes resampled by arc length so playback is even. **Re-run after any change to it or `folding/folding.js`** | own header |
| `hemoglobin/tools/bake-hb.js` | **superseded**, refuses to run. Kept because it owns the file format and records four traps its header lists | own header |
| `hemoglobin/tools/bake-quaternary.js` | level 4's other three chains: 2HHB A/C/D Cα traces + four heme irons, rotated into the trajectory frame via `FoldLib.orient()` → `hemoglobin/data/2HHB-quaternary.json` (12 KB). JSON because 428 points need no second decoder | own header |


## Effects (`fx.js`)

Every "something happened" moment gets a transient effect from the shared
`fx.js`, so every page looks the same. One instance per page, bound to its scene:

```js
const FXi = FX.create(THREE, root, camera);   // root: group the molecules live in
FXi.spawnRing(pos, color);  FXi.popGlow(g, color);  …
FXi.step();                                    // once per frame, in loop()
```

Effects step off a wall-clock delta (frame-rate independent) and are **purely
cosmetic** — never feeding back into physics, H-bond counts or pH. `popGlow`
scales *relative* to the target's current scale, so it works on a molecule Group
(rest scale 1) and a bare ion mesh (rest scale = its radius) alike.

**Intensity tracks the chemistry** — which event earns which effect is `SCIENCE.md` §5.

<!-- ENUM: update when an fx.js primitive is added or removed. -->
| Function | What it draws | Used for |
|---|---|---|
| `spawnRing(pos,color)` | white core flash + double additive shockwave ring + 16-spark burst | bond break/form events |
| `popGlow(g,color)` | emissive flash (2.2×) + springy scale overshoot on a molecule's atoms | a molecule freshly formed / an ion tearing free |
| `settleShimmer(g,color)` | soft emissive breathe in-and-out, **no** scale/ring/sparks | a polar solute locking into its hydration shell |
| `protonHop(from,to,onArrive,opt)` | glowing proton arcing between points with a fading comet trail | the H⁺ transfer of an acid ionization. `opt` is optional: `{color}` where a hop must not read as the effect firing beside it, `{dur}` in seconds, `{away}` for a proton a reaction **displaces** — snaps off the bond, then drifts and fades instead of landing |
| `colorOf(g)` | reads a molecule's first **atom** colour (skips covalent-bond meshes) | tinting an effect to whatever it decorates |

#### Per-molecule event → effect → colour

Atom colours are the single source of truth in `molecules.js`
(`MolLib.PALETTE.atoms`); ion effects pull them live via `colorOf`.

<!-- ENUM: update when an effect is wired to a new event. -->
| Molecule | `class` | Event | Effect(s) | Colour(s) |
|---|---|---|---|---|
| **Water** H₂O | `solvent` | — (the medium; ambient H-bond network) | none | — |
| **Salt** NaCl | `ionic` | water bridges the pair → **dissociation** | `spawnRing` + `popGlow` each ion | ring/Na⁺ violet `#9a3fe0`, Cl⁻ green `#1fa968` |
| **Potassium chloride** KCl | `ionic` | same → **dissociation** | `spawnRing` + `popGlow` each ion | ring/K⁺ blue `#0054c0`, Cl⁻ green `#1fa968` |
| **Ethanol** C₂H₅OH | `polar` | settles into water → hydration toast | `settleShimmer` (in sync with toast) | water-blue `#9fd4ff` |
| **Ammonia** NH₃ | `polar` | settles into water → hydration toast | `settleShimmer` (in sync with toast) | water-blue `#9fd4ff` |
| **Methane** CH₄ | `nonpolar` | squeezed out (no H-bonds) | **none** (silence is the point) | — |
| **Carbon dioxide** CO₂ | `reactive` | **step 1:** CO₂ + H₂O → H₂CO₃ | `spawnRing` at attack site + `popGlow` on new H₂CO₃ | cool blue: ring `#7cc4ff`, glow `#bfe4ff` |
| ↳ **Carbonic acid** H₂CO₃ | `polar`, `product` | **step 2:** H₂CO₃ → HCO₃⁻ + H⁺ | `popGlow` on HCO₃⁻ + `protonHop` acid→water | glow `#ffe4b0`; proton `#ffe08a`, trail `#ffcf6b` |
| ↳ **Bicarbonate** HCO₃⁻ | `ion`, `product` | (formed in step 2) | — (glowed as part of step 2) | `#ffe4b0` |
| ↳ **Hydronium** H₃O⁺ | `ion`, `product` | proton lands on a water | `spawnRing` at landing + `popGlow` on new H₃O⁺ | warm amber: ring `#ffc24d`, glow `#ffd98a` |

#### Bonding builder (`molecule-builder.html`)

Each **bond type finishes in its own visual language**, because the page exists
to say they are different kinds of event; recolouring one effect for all three
would say the opposite. Every effect fires at a position the module **asks for**
(the anchor atom, the landing point), never at the world origin.

| Bond formed | Event | Effect(s) | Colour(s) |
|---|---|---|---|
| **Covalent** (H₂O, CH₄, NH₃) | the last slot fills | `spawnRing` from the **core atom**, expanding through the molecule — the bond is a thing the whole molecule now has | covalent stone `#b3a892` |
| **Dative** (NH₃ + H⁺ → NH₄⁺) | the proton lands in the lone pair | `spawnRing` from the **donor**, in the **donor's own colour** (it did not come from both atoms) + the donor pair swells 1.34× and settles + amber `settleShimmer` on the new ion | N blue `#3f6ae0`; shimmer amber `#ffc24d` |
| **Ionic** (NaCl, KCl) | the electron lands on the nonmetal | **no ring** — `spawnCore` white flash + `spawnBurst` at the **arrival point on the shell**: one electron arrived at one place, the molecule did not acquire something | white `#ffffff` + the nonmetal's colour |

- The **completion ring fires once per molecule**, re-armed when the lesson
  reports incomplete — rebuilding earns it again, a repeated finished state
  doesn't.
- The **electron's flight** carries the ionic story: sodium's dot detaches, arcs
  over 0.55 s, lands **green**. An electron wears its owner's colour, so changing
  colour mid-flight *is* the sentence "it changed owner". Counts flip at
  transfer, not arrival — the callback only runs while the frame loop does, and a
  backgrounded tab must not leave the readout stale.
- The **dative flare is deliberately small** (1.34×). A ballooning dot stops
  reading as an electron; the whole claim is that these are the *same two
  electrons* throughout.

#### Dehydration synthesis has ONE effect, everywhere

<!-- ENUM: every page that condenses calls this; nothing else may. -->
A peptide bond, a glycosidic bond and a phosphoester are **the same reaction on
different groups**: two halves give up an –OH and an –H, a water leaves, and a
bond closes where they were. So they get one effect and one colour, and a page
that invents its own flare for a condensation is teaching, in the language a
student reads fastest, that these are three different kinds of chemistry.

`fx.condense(bondAt, waterAt, opt)` is the only implementation. It fires in two
places because the reaction happens in two: a full `spawnRing` **at the new
bond's midpoint** in flare violet `#8a2be2`, plus a small white core and
**oxygen-red** burst where the water goes. It does not draw the water; that is a molecule, and the page
owns it.

The midpoint matters. A flare at a molecule's transform origin lands in the
middle of a ring system and says "something happened somewhere" — the failure
`dna-lab` step 1 had already fixed for hydrogen bonds.

Its rings are also the one effect in `fx.js` that is **painted rather than
added**. Every other flare is a bright colour, and additive blending is right
for those; violet is darker than the paper, and adding it to cream gives a pale
pink smudge however saturated it is. The white core stays additive, because
painting a white disc over a molecule punches a hole in it.

`opt.color` exists only for a page saying *this particular one is not a
condensation*. `opt.size` is the ångström scaling every `fx` primitive takes.

#### Colour language

- **Cool blue** (`#7cc4ff` / `#bfe4ff`) — a **water-driven** step.
- **Warm amber** (`#ffc24d` / `#ffd98a` / `#ffe08a`) — **acid / proton**
  chemistry; echoes the ion–dipole bond colour and the falling-pH story.
- **Ion palette** (violet / blue / green) — each ion flares in its own identity
  colour so cation and anion read as distinct.
- **Water-blue** (`#9fd4ff`) — the **hydration shell closing in**; a water
  colour, not the solute's, because the solute is unchanged.
- **Violet** (`#6a5acd` the bond, `#8a2be2` the flare) — **dehydration
  synthesis**, whichever groups it joined. Two numbers for one idea because the
  effects blend additively on cream: adding a violet that carries green
  (`#6a5acd`, g=`0x5a`) lands as a pale pink smudge, so the flare uses the same
  hue with the green taken out. `PALETTE.bonds.condense` is the stick; the flare
  constant lives in `fx.js` beside `PROTON_GOLD`, like every other ring colour.
- **White core flash** (`#ffffff`) — shared by all `spawnRing` events, the
  white-hot instant before the coloured rings.

#### Where each is wired

- Dissociation — `checkDissociation()`, in `water-lab.html`.
- The CO₂ chain and the solute settle were `molecule-lab.html`'s, and went to
  `attic/solvation/` with it. A page that brings either back re-wires them; the
  effects themselves are still in `fx.js`.
- Dehydration synthesis — `fx.condense()`, called by `dna-lab.html` step 2 (the
  glycosidic bond and the phosphoester) and step 3 (the phosphodiester).
  `dna-lab` deliberately adds no `popGlow` on the two molecules, because its
  nucleotide is hydrogen-bonded to a partner four ångströms away and a 1.7×
  punch swells one straight through the other.

New pages: add `<script src="fx.js">`, `FX.create(THREE, root, camera)` once,
`FXi.step()` in the loop, then call the primitives at your own event sites.

## Module notes

What is true BETWEEN modules, and invisible from any one of them. Each module's own
traps are in its header; the table above says where it sits.

* **`atomkit.js` owns what a student learns to *read***, never how a bond forms.
* **`kit/card-stage.js` is a LAYER, not a peer, and its own header is the rulebook.** `kit/molbox.js` and `molecule-builder/molecule-builder.js` are both built on it, so nothing that constructs either can live inside it — the adapters a page writes to turn a descriptor into a box stay in the page. What the three of them share is a short list of invariants that all break silently: the WebGL context budget and its LRU pool, `onEvict` firing before the destroy so a released card keeps a still, `acquire` doubling as bring-to-front, the builder's `onResize` having to run after `Stage.resize`, `snapshot()` refusing mid-fold, and `Stage.frame`'s perspective distance floor of 6 (which is why molbox is orthographic). Read that file before touching any of them or either card page; do not re-derive the list from the code, because most of it is invisible from the page that has the bug.
* **`water/` is the only shared module that IS the physics.** Everywhere else the rule is share the plumbing, not the physics ("Adding a module", below); here the liquid is the shared thing and the lesson is what stays on the page. **It is one module and not four on purpose**: the freeze fraction, the lattice seating, the hydration shells and brine rejection all read each other, and splitting them yields four files that import each other.
* **`lib/palette.js` carries `organelles`, the only place an organelle's colour lives.** The numbers are `cell/animalcell.js`'s, chosen by eye against the cream paper, and both cells read them from here, so the cut cell and anything else drawing an organelle cannot drift. Each entry is a cut shell (`outer` the outside face, `inner` the darker cut face, `rim` the band between) or, for one drawn as ribbons, `side` and `top`; plus its own parts (`cristaSide`, `nucleolus`, `ribosome`, …). The membrane-bounded ones also carry `head` and `tail`, which is what `membrane/membrane.js` tints its bilayer with when a `context` is set — so a student who zooms from the cut cell into a mitochondrion's inner membrane arrives at the same orange. A `centrosome` has no membrane and deliberately has no `head`/`tail`, or a page would try to set a bilayer inside one. `tokens-from-palette.js` publishes the lot as `--organelle-<name>` and `--organelle-<name>-<part>`, and `design-system.html` draws every one off its own computed value.
* **Every mount carries its named parts and their notes.** `lib/annotate.js` also defines `Notebook.create({box, anchors, library})`, and each component's `create` returns `anchors` (name → live world point, null when the part is off stage) and `library` (name → `{text, card, offset}` in the lesson's words). The mount exposes `note(name, override?)`, `notes(names | false)`, `clearNotes()`, `anchors()`. It lives inside annotate.js so one script is all a page loads for callouts; a generated page loaded annotate.js and forgot a second one, and every note no-oped. A component without a pump answers `pump` with null and the note waits off screen.
* **`annotate.js` can point at the UI, not only at the model.** `notes.atElement(el, {gap, yFrom})` returns an `at` function anchored to a DOM element: the element's box is taken in CSS pixels and unprojected through the camera, so the dot rides a slider or a button through orbit and resize. It is there because a callout naming a control has to look and track exactly like the ones naming atoms, or the student reads it as a different kind of object. Both callers are the evaporation slider in `capillary/` (`nanopore-test.html`, and `pbf-test.html` which inherited it), so a third one is still setting the convention rather than following it.
* Drag modules are *mechanics*, not plumbing. Water and methane share `covalent-drag.js` — the **same mechanic at two slot counts**, a recipe; salt gets `ionic-drag.js`, because filling a valence slot and handing an electron over are **different mechanics**, and expressing the second as a mode of the first means a flag that turns the lesson off. Same mechanic, different constants → a recipe in the same file; different mechanic → new file. The two solvation pages keep their **own** molecule builder too — cel outlines, Debug recolour/toon, hydration `userData` — sharing only the scene bootstrap, for the same reason.
* **`molecule-builder/` is the SHELL around those mechanics, and the split is the point.** `covalent-drag.js` and `ionic-drag.js` still own every rule; this owns the stage, the loop and the view. Two things about it are invisible from the API. **Its frame is sized by the WIDTH its content needs, not by a zoom level**: an embedded builder does not get to assume its host's aspect, and in a box taller than it is wide a height-driven frustum crops the outermost atom off the side — chloride first, dealt at x 4.6 with 1.24 of radius and a valence cloud outside that again. So a narrow panel zooms out instead of cutting, and `check-molecule-builder.js` measures that against each recipe's own dealt positions rather than trusting the constants. And **a recipe belongs to exactly one drag module**: the name is the only thing that routes it, so one that is in neither file, or in both, is a runtime crash or a silent wrong mechanic, and the checker fails either.

## Adding a module

Most of this is already taught by the folders — `kit/`, `reaction/`, `energy/`, `massaction/`, `diffusion/`, `coupling/`, `lobes/`, `chain/`, `chair/`, `water/` all have the same shape, and a twelfth built by copying an eleventh will come out right. What follows is what the folders cannot show.

**When.** Deliberately **no monolithic `engine.js`**. The lessons are distinct paradigms — solvation, assembly, pathways, bonding — with no shared simulation core, and pretending otherwise produces an engine whose every option exists for one caller. What *is* extracted is the scaffolding nobody's lesson is about:

| Module | Owns | Deliberately does **not** own |
| --- | --- | --- |
| `molecules.js` | colours, radii, geometry specs | anything that moves |
| `scene.js` | renderer/camera/orbit/lights/resize, `atom`/`bond`/`buildMolecule` | any page's physics |
| `fx.js` | transient event effects | when an event happened |
| `atomkit.js` | how an atom is **drawn** for the bonding lessons | how a bond **forms** |
| `annotate.js` | how a callout **looks** and how it **tracks** a point | what a callout **says**, and which atom it points at |

The test: **would two lessons disagree about it?** Colours, radii and the look of an electron must not vary between pages — a student moving tabs has to read the second lesson with the vocabulary the first one taught. How a bond forms is exactly what the lessons are *for*, so it stays local. Two lessons sharing a *vocabulary* is not the signal — two lessons sharing an *implementation* is. The energy card qualified because the figure is the same drawing from the same flags; the pathway step runner does not, because glycolysis folds in a half-run per-lane step and the cycle folds in laps, and each of those is the lesson's own claim about what a step means.

**The contract.** A folder named for the module, holding five things, each named for the folder: the module script, a stylesheet if it draws chrome of its own, a test page, a checker, and either a README or a load-bearing header comment. `lobes/` is the smallest complete example. Nothing here has a build step, so the module is a plain script assigning one global.

**The test page is not optional**, and its second job is the one worth stating: it is the next author's worked example, read more carefully than any paragraph here. Mount the module more than one way if the module supports more than one — `massaction-test.html` renders the barrier slider no lesson currently uses, which is what keeps that path from rotting.

**The checker is not optional either**, for this repo's standing reason: a claim ships with its assertion. Assert the things that break silently, not the things a missing file would announce. `reaction/check-reaction.js` is the model — it fails an `fx:` no verb registers, because the old code swallowed that in a bare `else` and ran a 280 ms swap with nothing visibly wrong.

**A GEOMETRIC CHECKER HAS TO PROVE IT IS NOT VACUOUS.** These checkers build their own ideal case — an alpha helix, a pleated strand, a B-DNA duplex — because a generated case tests the arithmetic without also testing the reader. The cost is that an ideal case is often SYMMETRIC in exactly the way that makes the assertion meaningless, and it still prints `ok`.

`kit/check-nucleic.js` did this twice while being written. Its rung-anchor test ran on ideal B-DNA, where the base-pair axis IS the radial — so a rung built the right way and one built the wrong way land in the same place, and the assertion passed without touching what it was for. Its mitred-cap test gave each chain one residue, so there was no tangent, so the code fell back to the branch the test was meant to exercise. Both passed. Both proved nothing.

**So assert the precondition beside the assertion that rides on it**, and print it. `and the test case was genuinely oblique · pair axis . ribbon tangent = 0.472, wants > 0.1` is a line whose only job is to fail the day someone simplifies the fixture. A degenerate fixture is the one bug a green checker cannot tell you about.

**What stays out.** No lesson state. A module reaching for `done`, `busy`, `intro`, `lanes` or the tray is the lesson's physics migrating into shared code; `check-reaction.js` asserts this by name for `reaction/`, and the rule is general. A module answers questions about the *stage*; the page answers questions about the *chemistry*.

**Where a module may appear.** A 2D module that abstracts a statistical or thermodynamic point — `massaction/`, `diffusion/`, `coupling/` — is never a lesson's primary UX. It goes behind a `kit/modal.js` side door, as a second simulation the student opens when they doubt what the 3D stage just did. This is the boundary the folders cannot show you: they look like templates for a main stage, and they are not one. `energy/` is a third kind again — a figure, no canvas and no loop. `reaction/` is the exception that drives the 3D stage rather than replacing it.

**One instance is not a convention.** If you are building the first of something, say so in its header. The next author cannot tell an accident from a pattern, and will copy either.
