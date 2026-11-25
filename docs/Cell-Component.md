<!-- KIND: recipe, scoped — the brief for the cell components. Load whole when building one. It assumes demos/docs/AddingAComponent.md, which is the contract every component shares, and demos/kit/scale.js, which is the rung ladder they declare against. This says only what is specific to a cell. -->

# The cell components

The cell is where most generated requests land, because "cell" is the word students use. It is also where the osmosis question every run has asked for gets answered, which no component could show: a cell that swells, shrivels and bursts.

**Most of the animal render is already done.** `cell/animalcell.js` draws the textbook animal cutaway at reference quality: a bowl of cytoplasm with a nucleus, mitochondria with cristae, ER ribbons studded with ribosomes, a Golgi stack, centrioles and vesicles, procedurally from noise, on r128 and `kit/card-stage.js`. `cell/animalcell-test.html` mounts it. Look at it before reading further.

What `animalcell.js` is not is a component. It has `create` · `mount` · `flyTo` · `focusOn` · `pick` · `hover` · `bounds`, and none of `set` · `state` · `on` · `show` · `layers` · `featured`. Its params are `seed` and `tilt`. It does carry a `SCALE` block.

The test of done is unchanged: `tools/gen-app.js` writes a working page from `Components.md` and a request such as "why does a red blood cell burst in pure water?"

## 1. The split, and the test behind it

**The test is animation.** Two states that must tween continuously between them belong in one component. Two that never morph may be two components, and usually should be. The test is asymmetric: continuous animation forces unity, its absence merely permits a split.

It agrees with the rung rule from `demos/kit/scale.js` wherever both apply, which is a good sign. A cell and a bilayer are 4000:1 apart, so nothing can animate between them, so it is a handoff and they are different rungs. Same answer from two directions.

| | morphs? | |
| --- | --- | --- |
| isotonic ↔ hypotonic | yes, must tween | one component |
| disc ↔ sickle, HbA ↔ HbS | yes | one component |
| animal ↔ plant anatomy | never | split |
| anatomy ↔ osmosis | never | split |
| cell ↔ bilayer | no, a handoff | split, and different rungs |

So: **components are named for a question, not for an object.** Anatomy and osmosis are different questions that happen to be about the same thing, and a component that answers both has a parameter table where half the entries are dead for whatever the page is doing. That is the failure the seven-preset draft of this brief had, one level up.

| Component | the question it answers | kinds |
| --- | --- | --- |
| `AnimalCellAnatomy` | what is in an animal cell | — |
| `PlantCellAnatomy` | what is in a plant cell | `leaf` · `root` · `potato` |
| `BacterialCellAnatomy` | what a prokaryote has and has not | — |
| `AnimalOsmosis` | what water does to a cell with no wall | — |
| `PlantOsmosis` | what water does to a cell with a wall | `leaf` · `root` · `potato` |
| `RedBloodCell` | this one cell, and what goes wrong with it | — |
| `EpithelialCell` | what crosses a cell, and why its two faces differ | `gill` · `gut` · `kidney` |

Two notes on where the line fell.

**Leaf, root and potato stay a `kind` inside the plant components.** Same box, same wall, same dominating vacuole; what changes is the filling — chloroplasts, none, amyloplasts and starch. That is content, not structure, and splitting it three ways triples the geometry to keep in sync for no gain.

**Tonicity does not need the organelles.** "Why doesn't a plant cell burst" wants a wall, a membrane and a vacuole; it does not want ER, Golgi, lysosomes or centrioles. There is a geometry conflict in packing them together too: an anatomy scene is a rich procedural build done once, while osmosis needs one mesh with stable topology deformed per vertex every frame. Those pull in opposite directions, and the seam between them is the split.

## 2. The cost this split carries

**The same object now gets drawn twice.** An animal cell appears in `AnimalCellAnatomy` and again in `AnimalOsmosis`, by two components that can drift. A student may see both in one week.

They do not have to be identical: a labelled cutaway and a whole cell swelling are honestly different views, and forcing one geometry to serve both is what we just rejected. They do have to read as the same organism, so **they share a palette through `palette()` and agree on the membrane's colour and the cell's silhouette**. When one changes, look at the other. This is the mirror of the duplication the split avoids, and it is named here so it does not arrive as a surprise.

## 3. Fidelity: `buildShell` is the answer, and it exists

Do not write a fidelity spec for these. `animalcell.js` already reaches the reference standard, and the reason is one idea:

**`buildShell` takes any parametric surface `S(u,w)`, keeps `w` up to a per-`u` cut, offsets an inner wall along the finite-difference normal, and closes the two with a rounded lip.** A cut organelle therefore has real membrane thickness instead of a clipped single surface, and the lip is what makes the render read as a cell rather than a diagram. Outer, lip and inner are vertex colours, which is why those materials carry no `color`. `sweepProfile` gives the cristae and the ER ribbons; the noise gives the cytoplasm speckle and the ragged Golgi discs.

The anatomy components want all of that. **The osmosis components mostly do not**: they need one deformable surface and a wall, cheap, because their whole cost is per-frame. Take the idea of the lip, not necessarily the builder.

There is no `cell/cell-core.js` and there should not be one yet. `animalcell.js`'s header says its builders are inlined because nothing else wanted them; when a second component genuinely wants one, move that one, and let two consumers inform the interface rather than guessing it from one. A component that finds itself wanting a whole builder verbatim should say so rather than copy it silently.

Per component, the shapes:

- **`PlantCellAnatomy`**: a box profile, not a bowl. The wall is three shells with a visible middle lamella between neighbour stubs, since the wall is the thing the student is being asked to notice. Chloroplasts are lens bodies cut open with grana stacks inside. One vacuole dominating, with the tonoplast a shell of its own. The potato adds amyloplasts packed with starch grains.
- **`BacterialCellAnatomy`**: a capsule profile, wall and membrane as two shells, a nucleoid as a displaced tangle, a flagellum as a swept helix. Its point is the contrast, so it is drawn beside an animal cell more often than alone.
- **`RedBloodCell`**: a biconcave profile revolved, cut, with nothing inside but a haemoglobin tint and a spectrin mesh. The shape change is the subject.
- **`EpithelialCell`**: a column with a tight junction to each neighbour's stub, and the animal organelle set with many mitochondria.

**Prop tier, and not a scale** (`MolecularGeometry.md` §1.4). Every one of these declares `rung: 'cell'` and `unit: null` against the ladder in `demos/kit/scale.js`; `cell/animalcell.js` already carries the block. A null unit is a claim, not a gap: the render is not measurable, no page prints a length off it.

Sizes that ARE claimed, such as a red blood cell's 8 µm across, belong in the library card as prose, where they read as a fact about real cells rather than a measurement of the render. How big a cell IS survives the picture not being to scale.

`form` is `'single'` for all of them. A single cell at the `cell` rung may share a scene with bulk cells at the same rung, which is how a red cell in a vessel and a chloroplast in mesophyll will work. It may not share a scene with `Membrane`, which is §7.

## 4. Organelles as named parts

Every organelle is an anchor with a library card, so a page answers "what is that?" with a note on it. Names, used for anchors, layers and `isolate` alike:

`membrane`, `wall`, `lamella`, `nucleus`, `nucleolus`, `chromatin`, `pore`, `mitochondrion`, `chloroplast`, `amyloplast`, `starch`, `roughER`, `smoothER`, `golgi`, `vesicle`, `lysosome`, `vacuole`, `tonoplast`, `ribosome`, `cytoskeleton`, `centriole`, `hair`, `nucleoid`, `plasmid`, `flagellum`, `capsule`, `cytoplasm`, and for the epithelial cell `apical`, `basolateral`, `junction`.

**Split `er` into `roughER` and `smoothER`.** `animalcell.js` registers one part named `er`, and what it draws is rough ER: two arcs of swept ribbon around the nucleus with ribosome studs pushed into `riboPositions`. Register those arcs as `roughER`, and add a third run of ribbon further out with no studs, a paler profile and more tubular curvature as `smoothER`. Two parts, two library cards, because a Bio 101 student is asked for the difference by name and one `er` anchor cannot say it. The instanced ribosome mesh keeps serving both the cytoplasm speckle and `roughER`'s studs, so the split costs one more group and no new draw call.

The library is keyed by component and by name. A vacuole in a potato is a store and in a leaf it is turgor, and the card should say the thing the lesson is about. The card is two sentences in a tutor's voice: what it is, what it does. Write them as carefully as the header; they are what a generated page says.

Hover lights a part and click isolates it, as Leaf does; `animalcell.js` has the hover and the pick already, and `setHighlight` is where isolate hooks in. `featured()` returns the five or six a student asks about first: for `AnimalCellAnatomy`, nucleus, mitochondrion, roughER, golgi, membrane, lysosome.

The osmosis components have few parts and short featured sets, which is correct. `AnimalOsmosis` has `membrane`, `cytoplasm`, `nucleus` as a landmark; `PlantOsmosis` has `wall`, `membrane`, `vacuole`, `cytoplasm`. A part list is not a lesson, and a show panel with every anchor was a menu.

## 5. The osmosis components

This is the reason to build any of it. Membrane shows a patch of bilayer with two compartments; it cannot show a cell changing shape, and the red blood cell request is exactly that.

Shared by both, and by `RedBloodCell`:

- `tonicity` drives `volume` over a few seconds through a tween, never a snap. A number is allowed, outside over inside, so a page can sweep it with a slider.
- **One mesh, stable topology, deformed per vertex.** Every visible behaviour is a deformation of one surface. A rebuild spends the frame budget on the thing the component is for: `membrane/membrane.js`'s lathe rebuilt every tick cost 3 ms a frame and hid under the crowd cost until an empty stage was timed.
- Water crossing the membrane is a `flows` layer of particles entering or leaving, rate from the tonicity, off by default. Choreography, not physics, and say so.
- The tween itself is about forty lines and is duplicated across the three rather than extracted. That is cheaper than a core module holding one function.

`AnimalOsmosis`: swelling, then crenation when it shrinks, then a burst past a threshold. A `burst` event, the membrane opens, the contents disperse, `state().burst` true until `set({ volume: 1 })` resets.

`PlantOsmosis`: never bursts. The wall holds and swelling becomes turgor, `state().turgor` 0..1. Shrinking is plasmolysis: the membrane peels off the wall and the gap is visible, which is the whole plant-versus-animal lesson and the reason these are two components rather than a flag. The potato needs `state().mass`, relative to its start, since the class measures a cylinder on a balance and not a cell; volume times a declared density is enough. The claim a page makes is the sign and shape of the curve against tonicity and the isotonic crossing, and a page should be able to sweep tonicity and plot it.

`BacterialCellAnatomy` has no osmosis component of its own. A walled prokaryote behaves as the plant does, and if a request needs it, `PlantOsmosis` is the honest answer with a note rather than an eighth component.

Events on all three: `frame` (state, dt), `burst`, `hover` (name or null), `select` (name or null).

## 6. RedBloodCell

Its own component because it is the odd one out at every level: no nucleus, no mitochondria, no organelles at all, a biconcave disc rather than a blob, and a second shape change that has nothing to do with water.

- The tonicity behaviour of `AnimalOsmosis`: crenates when it shrinks, bursts when it swells past a threshold.
- **Sickling.** `deoxygenated` 0..1 and, for `variant: 'HbS'`, `sickle` follows it: the disc morphs to the crescent through the same vertex machinery as volume, `state().rigidity` rises, and the cell stops deforming under tonicity. HbA never sickles at any `deoxygenated`, and that is a checkable claim.
- Events add `sickled`.

What sickling causes is the scale above and a separate component: a vessel of instanced red cells jamming a capillary, `rung: 'cell'` and `form: 'bulk'`, which may therefore share a scene with this one. What causes it is the scale below and already built: `sickle/fibre-test.html` for the HbS fibre and `Proteinbox` for haemoglobin. This component draws one cell changing shape and nothing more; the `sickle` library card points at the others in prose.

Real facts for the library cards: about 8 µm across and 2 µm thick; biconcave, which buys the surface area to exchange gas fast and the flexibility to fold through a capillary narrower than itself; no nucleus and no mitochondria in mammals, so it runs glycolysis alone and cannot use the oxygen it carries; roughly 270 million haemoglobin molecules; about 120 days in circulation.

## 7. EpithelialCell

**An epithelial cell is polarised, and that is the whole point of it.** A gill ionocyte, a gut lining cell and a kidney tubule cell sit between two environments and carry different proteins on each face; every transport story a Bio 101 course tells is a story about the two faces being different. A generic cell with one outside cannot tell it, and the salmon lesson drawn as one membrane between "inside" and "outside" quietly implies the blood touches the sea.

- `bath.apical` and `bath.basolateral` in millimolar, the shape Membrane's `contents` takes: for a seawater gill, apical is the sea and basolateral is blood.
- `tissue` picks the proteins on each face, and `state().faces.apical` / `.basolateral` say which way salt and water move across each. Gill in seawater: the pump and the cotransporter stand-in basolateral, a chloride channel apical, sodium leaking between cells past the tight junction. Gill in fresh water: uptake, the other way. Gut: sugar in with sodium apically, out basolaterally. Kidney: water back through aquaporins.
- Mitochondria drawn many and lit when the pump works, because an ionocyte is packed with them and that is the visible fact saying this cell spends energy.
- A `salt` flow layer through the cell, one face in and the other out, so the cell reads as a conduit and not a bag. Choreography, declared.
- Two handoffs, §8.

It is its own component and not a mode of `AnimalCellAnatomy` because the question is different — what crosses, not what is inside — even though the organelle set is nearly shared.

## 8. The zoom to the bilayer

The cell is where the ladder goes from a cell to a membrane, and the handoff is a first-class thing. A cell is about 20 µm and a bilayer about 5 nm, 4000 to 1, and `Membrane` is exaggerated on top of that. A literally continuous zoom would break depth precision long before arriving and would land on a lie about relative size when it did. Nothing can animate across it, which by §1's test is exactly why it is two components. So the bridge is **a flight and then a swap**, which reads as continuous to a student and asserts nothing false.

Three rungs:

1. **At cell zoom the membrane is a visible double line**, exaggerated and declared. `buildShell` already gives the outer membrane a real inner wall and a lip, so this is a material and thickness change, not new geometry. The student sees it is two layers before going anywhere, which makes the transition legible instead of magical.
2. **The flight.** `zoomTo('membrane')` picks a point on the surface and closes on it until the patch fills the frame, organelles fading as it goes. `bounds(org)` and `flyTo` exist in `animalcell.js`, in the stage's own theta/phi/r terms as `tree/tree.js` does it.
3. **The swap.** At frame-fill, crossfade into `Membrane`. Hold the patch orientation across the fade, same normal up and same roll, and it reads as one motion.

```js
c.zoomTo('membrane');          // flies, then emits 'handoff'
c.on('handoff', h => ...);     // h = { to:'Membrane', params:{...}, back:() => ... }
c.zoomTo(null);                // fly back out; the cell's state is as it was
```

The event carries the params describing the patch the camera reached, so the next component opens on what the student was looking at. It carries proteins and bath **by preset, never sizes**, which keeps §3's no-scale position intact.

- `zoomTo('membrane')` → `Membrane` with `units:'mM'` and `contents` from the cell's tonicity, proteins by component: a red blood cell gets `AQP` and a chloride channel as the anion exchanger stand-in, a root cell its pumps, an animal cell `NA`, `K`, `pump`. Outside is up.
- `zoomTo('apical')` and `zoomTo('basolateral')`, `EpithelialCell` only → `Membrane` with that face's proteins for the `tissue` and that face's bath as the outside. Same Membrane, two layouts, and the student sees why one cell needs two different membranes.
- `zoomTo('mitochondrion')` → `Membrane` with `context:'mitochondrion'`, `fuel:'NADH'`. This skips the `organelle` rung deliberately, because the lesson there is chemiosmosis and not mitochondrial shape.
- `zoomTo('chloroplast')` → `Membrane` with `context:'thylakoid'`, `fuel:'light'`. Both are in `Membrane-Chemiosmosis.md`.
- Any other part → a flight and `state().zoom` naming it, no handoff. The reference says so and a page does not fake one.

**The swap itself is shared.** `CardStage.handoff(fromBox, mountNext)` crossfades one box into another in the same stage element and returns a `back()`. `kit/card-stage.js` today exports `showPanel` · `create` · `pool` only, so this is new; put it beside `showPanel` so Leaf's palisade cell can hand off to a chloroplast the same way. **Until it exists, a component declares `down: {}`** rather than advertising a zoom it cannot perform, since `Components.md` is all the model sees.

## 9. Counts and what is exaggerated

A real animal cell has hundreds of mitochondria and millions of ribosomes. `animalcell.js` draws five mitochondria and an instanced ribosome speckle. Draw what reads and declare the rest:

- One number per organelle kind in a `COUNTS` table at the top of each anatomy file: drawn versus typical real. `state().organelles[name]` carries `{drawn, real}` so a page can print "5 drawn, about 1,000 in a real cell."
- Ribosomes cannot be drawn to scale beside a nucleus; they are oversize and it goes in `SCALE.exag` as drawn/true, so a page prints the factor rather than typing it.
- Every exaggeration is declared where it is set, not in a doc.

## 10. Budget

Measure the step alone, with nothing moving and again mid-morph, at the biggest component. Under 2 ms a step. Organelles are instanced where repeated. `buildShell` and `sweepProfile` are build-time costs and must stay build-time.

The two families have different profiles and should be measured differently. An anatomy component is a heavy build and a near-free step; its risk is the build blocking the first frame. An osmosis component is a light build and a per-frame deformation; its risk is the step. Measure the one that matters for each.

Add a triangle budget per component when the first is measured; `animalcell.js` is the baseline and nobody has counted it yet.

## 11. Traps this project has already fallen into

- A rule in the reference is not enforcement. Every rule the model broke (particle budget, protein spacing, the view offset, a second script for notes) was fixed by moving it into the library. Clamp, default and enforce in the component. The split in §1 is this lesson applied to the parameter table itself.
- `state()` must read the live thing, not the params. Tree reported flow intensities from its params while the steps drove the flows directly, and a page printed zeros over visible traffic.
- Materials are per part, not shared, or isolating one dims another. `animalcell.js` shares `erMat` across the ER ribbons, which is right within a part and wrong across the `roughER` / `smoothER` split, so give the smooth run its own material.
- A hidden part is still simulated. Hiding is visibility only.
- Featured sets are short.
- Every number a page could print is in `state()`.
- Colours are typed as sRGB and converted; colour management is off and a hex lands in the material as linear. Any new part goes through `animalcell.js`'s `col()`.

## 12. Files, and the order to build them

Each component is the file set in `demos/docs/AddingAComponent.md` §5: the module with its header as the contract and its `SCALE` block, a bench on the sidebar shell, a checker if it makes a checkable claim, a `Components.md` section with the `**Scale**:` line, a `Modules.md` bullet, an admin card, then the generation run.

1. **`RedBloodCell`** first. It is self-contained, it is the request that keeps arriving, and it exercises the deformation machinery on the simplest geometry. It builds its own shapes and does not wait for anything.
2. **`AnimalCellAnatomy`**, which is `animalcell.js` wrapped in the contract with `er` split. Retire `animalcell.js` into it rather than keeping both.
3. **`AnimalOsmosis`**, sharing nothing with the above but the palette.
4. **`PlantCellAnatomy`** and **`PlantOsmosis`**, in that order.
5. `CardStage.handoff`, then `zoomTo('membrane')` on the components that declare it.
6. **`BacterialCellAnatomy`**, then **`EpithelialCell`**.

`Components.md` will grow uncomfortable around step 4. **Let it.** Splitting the reference into per-topic files is the right answer eventually, but the boundaries should be drawn where the components actually fell rather than guessed in advance, and it is a builder change and not a doc change: `api/_builder.js` uses that one file as the system prompt, as the allowlist `validate()` refuses unknown mounts against, and as the cached prefix of every request.

## 13. Process hooks, later

Leave room, do not build in the first version: `divide` 0..1 for mitosis, `secrete` for ER to Golgi to membrane traffic as particle flows like Tree's, `stream` for cytoplasmic streaming in the plant cell. Each a scalar `set`, which is what makes it one line for the model. All three belong to the anatomy components, not the osmosis ones. Design organelle placement so a nucleus can split and vesicles have a path, and stop there.

Everything else is `demos/docs/AddingAComponent.md`.
