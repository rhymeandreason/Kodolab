<!-- KIND: rulebook — load whole, always. What this repo builds, the four layers it builds in, the page index, and where every other doc is. -->

# Working in demos/

**The product is a component library and a generator.** A student describes an app; a model writes one HTML file that mounts components by name and drives them by parameters. The hand-built lessons are the reference implementations and where components come from. The molecule library is mostly built — adding one is occasional, and has its own recipe.

* Model the science accurately.
* Let the human test visual changes in the browser; tell her what to click.
* Be extremely concise everywhere, including commit messages. Sacrifice grammar for concision.

## The four layers

Each layer may use the ones above it and knows nothing of the ones below.

| Layer | What it is | Where |
| --- | --- | --- |
| **Modules** | Plumbing: renderer, timeline, geometry questions, callouts, stage shell. No lesson state, no physics that two lessons would disagree about | `lib/`, `kit/`, root `*.js`, `css/` · `Modules.md` |
| **Components** | A 3D scene mounted by name and driven by parameters, on one contract — `X.mount(el, params)` → `set` · `state` · `on` · `note` · `show` · `destroy`, each on `kit/card-stage.js` | eleven, and `kit/app.js`'s `USES` is the list · `AddingAComponent.md` |
| **Pages, Featured Lessons** | Hand-built lessons, one HTML file each. May reach past the components straight to modules | top level · `AddingAPage.md` |
| **Generated apps** | Written by a model from `docs/Components.md` and a request, nothing else. The eval set | `tests/gen-*.html` · `Generator.md` |

**A module's scope is declared, not inferred.** Three kinds, and `Modules.md` says which each one is: *shared* (`scene.js`, `kit/motion.js`), *folder* (`membrane/`, `water/`), *one lesson* (`haworth.js` is contrast-lab's, `molecule-builder/` is the builder's). **A one-lesson module is not a candidate for anything until a second page wants it** — generalising on one instance is how a shared module acquires a caller's assumptions. Promoting one means moving it and saying so in `Modules.md`'s table.

**A component is not a module with a `mount()`.** It owns its own physics and its own scale (`kit/scale.js`), and it is the only layer a generated app can see. A module a component happens to use stays a module.

**Share the plumbing, not the physics.** Deliberately no monolithic `engine.js`. The test for whether something belongs in a shared module — *would two lessons disagree about it?* — and the same split a level down inside the bonding builder: `Modules.md`.

**A featured lesson and its component are two copies of one physics for now.** `membrane-lab.html` still runs its own inline membrane, `water-lab.html` its own driving of WaterSim. Until each migrates, a physics fix has two homes, and `Modules.md` says which.

## What to read

Every doc lives in `demos/docs/` except the node graph's two and the clipper's, which sit beside the code they describe; prose names them bare, the way it names a script. **Each doc's `KIND:` header says when to load it** — *rulebook* = invariants, load whole; *recipe* = how to build one kind of thing; *argument* = why this and not that, written for the human, and loading one during a build spends context on priority judgement instead of on the build.

**If you need a doc this table does not name, stop and say which.** A gap here is invisible from inside a build.

| Task | Read |
| --- | --- |
| A component a generated app can mount (a cell, a tissue, an organism, any render) | `AddingAComponent.md` — the mount contract, the r128 stack, budgets, and the test of done: `tools/gen-app.js` writes a working page from `Components.md` alone |
| What a generated app may use | `Components.md` — the reference the model is handed, and its only context. A component is not done until its section exists |
| The generator, `tools/gen-app.js`, or the builder backend | `Generator.md` — how a page is generated today, what it costs, what the edit runs showed, and what the backend should do differently |
| A template a generated app can be built on (the page's shape, not its scene) | `Generator.md` §3 — a template is `kit/lesson-shell.js` with a wrapper, never beside it: `ctx.q` means one thing or `Components.md` forks per template. `kit/app.js`'s `SHELLS` is the registration, and the failure that matters is a template the model never picks |
| **Making pages consistent in style, especially the header and wordmark** | `Design.md` — **there are two shells** (`body.kodo` for a document, `body.lshell-page` for a full-window lesson or a component bench) and its first section is how to pick. Also the one way the logo is written and the tokens a page may not restate |
| Adding or changing a shared module; which modules a page loads, in which order | `Modules.md` |
| Set the scale of a component or module | `kit/scale.js` is the enum |
| A new page that hand-draws molecules | `AddingAPage.md`, then the sibling page the human names |
| A new page that mounts a component | `AddingAComponent.md`, then `Generator.md` |
| A new step-through pathway lesson | `AddingAPage.md`, `Modules.md`'s load order, `SCIENCE.md` §5, `glycolysis-lab.html`'s `STEPS` table and what reads it |
| The chemistry a molecule has to obey | `SCIENCE.md` §§2-3, plus the target `mol-*.js` |
| Changing geometry, or what a motion implies happened at the molecule scale | `SCIENCE.md` §§2-5 |
| Adding or converting a molecule | `AddingAMolecule.md` — the eight steps, two of which catch failures that render correctly. `MolecularGeometry.md` §1 is the rulebook behind it, §1.4 for the fidelity tier it owes |
| Add a protein | `AddingAProtein.md` — say what the protein IS first, then pull the data that summary asked for, then build a bench to look at. Ends before the lesson does |
| Drawing a protein, DNA or RNA, or anything from deposited coordinates | `rendering-modules.md` — which of tube / ribbon / nucleic / surface, and why no outside viewer is loaded. A nucleic acid is a ladder whose rungs are JOINED, which no published viewer does; its index is `proteins/nucleic-acids.js`. **A protein is not a molecule spec**: real ångströms, secondary structure from the file's own records, and `MolecularGeometry.md` §1.5's scale families are what keep it in one frame with anything built from a spec |
| The node graph — `nodegraph/`, its data, its layout, or anything it draws | `nodegraph/Nodegraph.md` — the rulebook: edge grammar, rank, placement, and the QA list every unit passes; its traps section is failures that ship looking fine. `nodegraph/Biology-Node-Graph.md` is the conceptual truth for what the graph is FOR, and `docs/Nodegraph-*.md` are the per-unit briefs |
| Curating images for the node graph | `tools/clipper/README.md` — the extension, and why a clip carries its source page. The registry it writes is `nodegraph/images.js`; placement stays `graphcontent.js`'s job |
| A solvation page | `WaterSim.md`, then `Modules.md`'s `water/` note — `water/watersim.js` is the liquid itself |
| A new `reaction/` verb | `reaction/reaction.js`'s header, `reaction/check-reaction.js` |
| Anything in `api/`: the AI tutor, the access gate, the log, class codes and what a lesson reports to `/teach` | `docs/api.md` (root `docs/`). A lesson that only reports progress reads its "Class codes" section |
| Deploying, short URLs, promoting a page to featured | `docs/deploy.md` |
| Running locally, the checkers | `docs/dev.md` |
| Questions-composer, or the door map | `tests/question-composer.md`, beside the page. **Being deprecated**: the node graph is its successor, and nothing new should depend on `lib/mapcontent.js`. A page mounting SEVERAL live 3D boxes reads `kit/card-stage.js`'s header instead |
| Deciding what to build next | ask the human. `molecules-wishlist.md` is the live plan for molecules and has some ideas |

**Build-time briefs for a component in progress live at the repo root `docs/`**, not here: `Cell-Component.md`, `Membrane-Chemiosmosis.md`. They are read until the feature ships and then retired; the lasting rules move into `demos/docs/`.

## Pages (lessons)

<!-- ENUM: Only add to this chart if a page is a featured lesson or important prototype. Test pages go on demos/admin.html -->

**Where a page lives says what it is.** The top level holds lessons — featured and prototype — and nothing else; the shared modules are in `lib/` and the shared stylesheets in `css/`. A module that belongs to one folder keeps its stylesheet beside it (`kit/enzyme-blob.css`, `energy/energy.css`); `css/` is only for the sheets more than one folder's pages load. A bench lives beside the module it exercises (`kit/kit-test.html`, `membrane/pump-test.html`); a bench with no module folder of its own goes in `tests/`. `attic/` holds superseded lessons and the sheet they were drawn in, kept as worked examples and `.vercelignore`d so nothing links a student into one.

**Status**: *featured lesson* = real, student-facing, browser-tested; breaking one is a regression, and it's listed under "Featured" on the top-level `index.html`. *prototype* = in progress, not held to that bar. *reference* = superseded, kept as a fallback or worked example; not listed here either, and don't read one unless asked. *test* = a bench, not a lesson; **test pages are not listed here — `admin.html` is the live index of every page in the repo**, and it is the one that stays current. *internal tool* = not a lesson either, but kept in active use (e.g. to pick a molecule's default rotation) — don't delete it like a test.

| Page | Lesson | Status |
| --- | --- | --- |
| `water-lab.html` | Structure of water → the universal solvent (H-bonds, ice, temperature, salt dissolving), with an AI tutor: the lesson's text lives on the model as `annotate.js` callouts, and an ask box takes the sidebar | featured lesson |
| `molecule-builder.html` | Build a bond by hand: drag atoms together and watch valence, geometry and charge decide what you get (H₂O · CH₄ · NH₃→NH₄⁺ · CO₂ · N₂ · HCl · NaCl · KCl · MgCl₂) | featured lesson |
| `hemoglobin-lab.html` | **The protein-structure lesson.** All four levels on one molecule: a β chain folds 1→3, heme settles into the pocket, then the other three chains dock | featured lesson |
| `contrast-lab.html` | Spot the difference: six near-identical pairs (glucose/galactose · ribose/deoxyribose · purine/pyrimidine · L-/D-alanine · maltose/cellobiose · palmitic/palmitoleic acid) | prototype |
| `glycolysis-lab.html` | Ten steps in five stages. Everything is rendered as molecules. Animations for each step. the user interacts on the molecule. Hosts the `massaction/` sim in a modal — a second simulation with its own physics (below) | featured lesson |
| `krebs-lab.html` | The Krebs cycle. Pyruvate oxidation, then eight steps around the ring, with the loop drawn in the sidebar and a second turn played back for the ×2. Where the carbon goes, and why the ATP is beside the point | Lesson |
| `fermentation-lab.html` | Where pyruvate goes with no O₂. Two branches on tabs (lactate, one step; ethanol, two), and the claim that the product is the byproduct: the ledger is a NAD⁺ balance carried in from glycolysis, and it lands on zero | Lesson |
| `membrane-lab.html` | The membrane: what gets through, and what it costs. Five steps — bilayer structure, simple diffusion (O₂), a channel's selectivity, a pump spending ATP, active vs passive transport side by side | featured lesson |
| `design-system.html` | Every token, type step and button in `kodo.css`, drawn on the stage's own paper. Swatches read their own computed value, so the page cannot claim a colour the token does not hold | internal tool |
| `molecule-viewer.html` | Reference shelf: (ATP · NADH · acetyl-CoA · FADH₂). **Three views of one molecule** — 3D with measured and idealized (skel), then *the same spheres sliding onto the diagram's layout* (`flat2d`), then the drawn diagram (SmilesDrawer over the generated `smiles`). | internal tool |
| `build/build.html` | The builder: a request becomes an app from `Components.md`, stored in the database with every edit a version, run in a sandboxed frame. `app.html` beside it is the viewer. `Generator.md` | Prototype |
| `nodegraph/nodegraph.html` | The whole of Bio 101 as one map: typed, ranked edges between \~200 cards across seven units. X is explanatory order and Y is the scale ladder, both baked from the data so the map is identical every session. Fog of war, a rank-1 walk on the arrow keys, themes as saved queries, and a `kinds` pill that reveals detail too small to be a node. `nodegraph/Nodegraph.md` | prototype |
| `tests/question-composer.html` | The door map, entered by typing: the reader's words become the root card, and the map opens through the authored question they matched plus the concepts the wording reached on its own. Every protein in `proteins/proteins.js` is a node on it; `PLACEMENTS` only says where one sits. Content (lessons, videos, sims, molecules) is `CONTENT` + `PLACEMENTS`, separate from the concepts that show it. `tests/question-composer.md` | Deprecated |
| `capillary/pbf-test.html` | Capillary action as a position-based fluid: water climbing a 3.5 nm slot between real cellulose walls, with a measured contact angle, evaporation, and Young-Laplace holding as the pore narrows. `WaterSim.md` is its rulebook | prototype |
| `sickle/fibre-test.html` | HbS fibre structure test bench, with SES surface render (HbA vs HbS toggle). No lesson page yet | prototype |
| `dna-structure.html` | Walk through the parts of a DNA helix | featured lesson |
| `tree/tree-lab.html` | Where a tree's mass comes from: Van Helmont's willow, photosynthesis as traffic, the tree taken apart by origin. The first lesson on `kit/lesson-shell.js`, the step-through shell every generated app takes, with `tree/tree.js` as the scene | Lesson |
| **A featured lesson is served at a short URL** by a `vercel.json` rewrite, which does not move the file, so it carries `<base href="/demos/">` and its relative paths keep resolving. Which URL maps to which file is `vercel.json`; copying that list into prose is how it goes stale. Promoting a page: `docs/deploy.md`. |  |  |

## The primary UX is always a bespoke 3D simulation

A lesson's main stage is a 3D scene built for that lesson, at the scale the lesson is about — water and solvation are not the scale of a comparison or a pathway. A molecule-scale lesson prioritises interaction and animation **on the molecule**.

Generated pages live under `tests/gen-*.html` and are listed in `admin.html` as **UGC**. They are the eval set, rerun after any change to a component or the reference. **A rule the model keeps breaking is fixed in the library, never by rewording the prompt.**

## Scientific accuracy

`SCIENCE.md` is the rulebook — §§2–3 polarity and covalent bonding, §4 rendering caveats, §5 what a motion may imply. The fx vocabulary itself is `Modules.md`'s "Effects".

**A molecule that makes a chemical claim ships with the assertion that checks it, in the same commit** — `MolecularGeometry.md` §1.4's fidelity tiers (prop / contrast / subject) set how much accuracy it owes for the claim it makes. Pedagogical exaggerations (stretched bonds, neutral vs zwitterion) stay **explicit in comments**.

**Never type an atom or bond colour.** `tokens-from-palette.js` publishes `palette.js` as `--atom-*` / `--bond-*` at load, so a caption and the sphere it names cannot drift. `design-system.html` draws every token on the stage's own paper.

## Run / test locally

```bash
node tools/dev-server.js        # http://localhost:8817/ — zero dependencies
```

Live reload, `no-store`, and it serves the **repo root**, not `demos/`, because the root is what deploys. A lesson is `/demos/water-lab.html`. A CSS-only change swaps the stylesheet in place, so the scene keeps its camera and selection.

**Checkers run by hand when a feature is done**, not on every commit: `node tools/check.js <file you changed>` runs the checkers that read it, `molecules` everything that loads the specs, `deploy` before a deploy. The ones outside it, `check-handedness.js`, and what deploys: `docs/dev.md`.

Two browser gotchas: a backgrounded tab pauses `requestAnimationFrame`, so an automated screenshot may freeze on the last frame — drive the page's functions directly instead of trusting one shot. And **set the viewport before judging layout**: `resize_window` to \~1440x900. These are laptop lessons.

Framing, spacing, rotation, captions: the human tests in the browser.

## Copywriting

Write as a tutor for a college Bio 101 student. Concise, no repetition. The text supports the visuals and interaction. Prioritize core concepts, and steer the reader toward asking more rather than dumping facts.

**A number in user-facing text must be read from the data at render time.** A typed number is a claim nothing checks and a re-bake silently falsifies. **Read it from where the fact lives, not the nearest lookalike**. Example: counting helices in a trajectory's `ss` gives five because adjacent ones merge, so the eight the page says is carried across from the HELIX records by the baker.

**Don't use em dashes.**

## Working Conventions

You are an engineer who cares about design and making science easy to understand. We want to make beautiful, richly interactive science simulations that are better than what's out there. Be brave in your recommendations, you are an LLM and work that would take a human a day takes you 15 minutes.

The human uses `molecule-viewer.html` to manually choose a good default rotation for a molecule. Ask her to do this if you need. Don't try to rotate dynamically, you can't see what is happening.

**The human uses Safari.** Keep that in mind when she reports rendering or style bugs. **`proteins/tools/stills.html` only works in Chrome.**

**Don't write a changelog in a code file's comments. Comments should be active voice, and only document things that are not obvious from reading the code.**

**Read a module's own header before using it a way you have not used it before.** The load-bearing reasoning in this repo lives in the file headers, not only in `docs/` — and most of it is a trap that ships looking merely ugly, so it is written where someone about to fall in will be looking. `kit/ribbon.js` says not to slice a chain and build per secondary-structure element; a page did it anyway and drew the protein as scattered splinters.

## Never use these structures when writing:

* "It's not just X — it's Y"
* "Not only X, but Y"
* "This isn't about X. It's about Y."
* "No X. No Y. Just Z."

These mimic insight without providing any.
