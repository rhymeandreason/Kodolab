<!-- KIND: recipe + reference — load when drawing a PROTEIN, DNA or RNA from deposited coordinates: which of tube / ribbon / nucleic / surface a page wants, what each one costs. Not needed for a lesson that only draws molecules from specs. -->

# Rendering modules

**`kit/molbox.js` — `Molbox`**

**Takes a SPEC, so nothing on this page goes in one.** One molecule from `mol-*.js` on a camera solved against its own extent, size-agnostic — a water or a lipid. It cannot read deposited coordinates; a protein, DNA or RNA goes to `Proteinbox` below.

**`kit/proteinbox.js` — `Proteinbox`**

**Use this to draw a protein unless the human gives you a reason not to.** Its own CardStage scene, ortho by default, real ångströms.

```
Proteinbox.create({ mount, trace | data, chains, view, colors, sub, orbit, surface, skin, fold })
```

Four reps, and only the first is free: the 12 KB trace on create, a \~360 KB SES and an \~830 KB trajectory on the click that asks for them. Omit `surface` and there is no toggle; omit `fold` and there is no play button. Returns card-stage's box (so a pool's acquire / snapshot / destroy work unchanged) plus `drop()`, `setData(t)`, `setPocket(p)` and `rep`.

* **`data:` is `trace:` already parsed** — the same object, no fetch. **It does not read PDB and must not learn to**: parsing decides which altloc, which chain, and whether secondary structure is read or detected, and a page that owns a protein already owns those decisions. What is shared is the box — the scene, the camera, the framing and the turn — so a page whose coordinates arrive as anything else parses them itself and hands over chains. `proteins/prion/prion-test.html` builds the object straight off a PDB with `proteins/prion/prion.js`.

* **`setData(t)` redraws without replacing the box**, so a reader who turned the molecule keeps that view across a switch. A page comparing several structures wants one box re-fed, not one box per structure: the alternative costs a WebGL context each and snaps the camera back on every click.

* **The ribbon breaks where the chain breaks**, on `nums` from the trace. A chain carrying only `first` is treated as contiguous, which is the honest reading of a file that does not say otherwise — and why `bake-trace.js` now writes them.

* **`view:` is a 3x3 basis saying which way the structure should face**, applied to the chain group so the camera stays the reader's — the same split `scene.js` makes for a molecule spec's `view`. **Two kinds, in two places.** A SOLVED basis is measured from the shape and rides in the bake, so a trace carries its own when one was worth solving. A CHOSEN one is a human's taste: it lives in `proteins/proteins.js` as `view:{by:'human',basis}` and is read at DRAW time, so re-aiming a protein is an edit and a reload rather than a re-bake of files whose coordinates did not change. A box created with `protein:` picks it up itself; a caller passing `data:` asks `ProteinLib.viewOf(p)`. Precedence runs `setData`'s, then create's, then the bake's — chosen beats solved, and a protein whose registry entry chooses bakes no view at all, so a page that forgets opens in the deposited frame rather than subtly wrong. **The box seeds a canonical camera on the FIRST data only**: "shortest axis into the screen" means nothing looked at obliquely, and a card's default camera stands off at an angle. After that the camera is the reader's, and a switch must not snap away the turn they just made.

* **`sub:` is samples per residue, default 6.** A card is a thumbnail with a triangle budget; at full height 6 shows as faceting wherever the chain turns hard — the ends of arrows and tight loops read chunky, which is the spline showing rather than the protein. `RibbonLib`'s own default is 10 and that is what a stage wants.

* **`colors:`** overrides the ss palette: one number for flat, or `{C,H,E}` for some of it. Omit it and every protein in the repo is drawn the same way, which is the default for a reason. A page overrides only when colour is carrying a claim of its own (prion: healthy fold against disease fold).

* **`setPocket({atoms, bonds})` is the few atoms drawn INSIDE the ribbon** — a heme, what is bound to its iron, the one or two side chains a bench is about. Ball-and-stick is the exception a group of \~40 atoms earns: it is a shape you can read at 10 Å across, which 150 residues of the same treatment is not, and it is how every published figure draws a porphyrin. **The proportions are the module's** (`BALL`, `FE_BALL`, `STICK`): smaller balls and more than twice the house stick width, because the subject is the group's shape seen from across a 40 Å protein and at that distance the house width is about a pixel. Judge them at a whole-protein framing, never zoomed in. Sticks are SPLIT, each half in its atom's colour — deposited coordinates have no spec and often no hydrogens, so the bond does more of the work of saying what the atoms are. It draws in the chain group, so a heme wears the same `view` as the protein; it does not widen the framing radius, because a pocket is inside the protein by definition; and it clears with the ribbon on every `setData`. Returns `{group, materials}` so a lesson can fade or tint it without the box growing an opinion about timing. **What is IN the pocket is the baker's decision, never the box's** — the same refusal it makes about parsing. `proteins/myoglobin/` is the worked example; `hemoglobin-lab.html` still draws its heme by hand, and is the one place the two conventions have not yet met.

* **`skin:true` is a fourth rep and a different claim**: the same SES drawn OVER the ribbon rather than instead of it, which is what a page asks for when the question is WHERE ON the fold something is. `surface` alone still means what it always did. On a skin, `paintSkin(fn)` recolours per residue by writing one array into the geometry already uploaded — no rebuild, nothing refetched, and **nothing moves**, which is the point when the claim is that a substitution left the fold alone. `patch(name, {chains,num}, {colour,opacity})` is a residue-sized mark as its OWN mesh over the same buffers, because one mesh has one opacity.

* **One decoded surface across every box**, for the same reason contexts are rationed: the LRU rations contexts, not what a page hangs off one. A box that loses its surface falls back to the ribbon it never removed.

* **`orbit:false` by default** — a drag belongs to the page, not to the molecule; a canvas that spins under the pointer leaves no way back to the framing the card was composed with.

* **It reads every library by its BARE name.** `kit/ribbon.js` publishes `const RibbonLib` at script top level, which is script scope and never a property of window, so `global.RibbonLib` is undefined — and only at the moment a card tries to draw. Load it after every library it reads.

* Look is `kit/proteinbox.css` (`.pbox-rep`, `.pbox-play`); the page decides WHEN they are reachable, because only the page knows how big its card is on screen.

**`kit/tube.js` — `TubeLib`**

Cα trace + secondary structure → a smooth tube: one continuous mesh per chain, wide through helices, thin through loops, helix collapsed onto its axis so there's no corkscrew. The multi-molecule representation — a tetramer is 4 draw calls instead of \~240. This is used as a simplified illustration style that is more abstract and less dense than the ribbon render.

* `chain(THREE, CA, ss, opts)` → parts `[{geo}]` (tube + 2 terminus caps, cap offsets baked into the geometry so the set shares one transform, which is what makes it instanceable)

* `triangles(nRes, opts)` → cost of a setting without building it

* `DEFAULTS` — the tuned constants, readable so pages don't retype them

* Real ångströms in, plain `BufferGeometry` out. No materials. THREE passed in.

**`kit/ribbon.js` — `RibbonLib`**

Cα trace + secondary structure → a cartoon: helices as flat twisted bands, strands as arrows, coil as a round tube. The dense, literal style — one geometry per chain, but far more triangles than `TubeLib`, which is the abstract counterpart to reach for when a page needs many chains at once.

* `build(THREE, points, ss, opts)` → `BufferGeometry`. Real ångströms in, no materials, THREE passed in — the page keeps materials, opacity and fading

* Secondary structure comes from the caller: `assign(n, first, ranges, code)` stamps deposited HELIX/SHEET ranges onto a per-residue array, `dssp(bb)` runs real H-bond DSSP on an N/CA/C/O backbone (`parseBackbone(pdbText)` extracts one), and `detect(points)` is a Cα-only geometric fallback. Prefer the deposited records; a helix `detect()` invents is a claim about the structure.

* `frames`, `smooth` and the tuning constants (`PROFILE`, `ARROW`, `SMOOTH_W`, `TENSION`) are exported for the test bench and for pages that need to retune rather than retype.

* **One geometry per contiguous run, coloured by its own GROUPS — never one build per secondary-structure element.** `build` stamps geometry groups with material index 0/1/2 for coil, helix and strand, so three colours come out of one call and the caller passes an array of three materials. Slicing the chain and calling `build` per element is the obvious way to get the same thing and it is wrong twice over: the arrowhead logic re-runs on every slice so each strand grows a duplicate head, and the bands come out as disconnected fragments with the coil between them missing. `proteins/zif268` did it that way first and rendered the protein as splinters around an intact duplex.

* The orientation frame uses the neighbour **bisector**, not a cross product — a binormal rotates the band a quarter turn and it reads as a corkscrew while every other number stays right. The file's header explains the failure at length; `kit/check-ribbon.js` asserts it on an ideal helix, along with the rotating frame, the flat strand and the arrowhead. Every claim in that checker is a bug that shipped looking merely ugly, which is why it is gated on the module rather than on any page.

**`kit/nucleic.js` — `NucleicLib`**

DNA or RNA → a ladder: a flat backbone ribbon per strand, and one rung per base pair spanning **both** backbones. Same contract as `RibbonLib` — real ångströms in, plain `BufferGeometry` out, THREE passed in, no materials. `NucleicLib.build(THREE, trace, opts)` → `{ strands: [{id, geo}], rungs: {G: geo, C: geo, …}, stubs: {…} }`.

* **The joined rung is the reason it exists.** 3Dmol and Mol\* both hang a separate stub off each strand, pointing inward and stopping in mid-air — correct, and it says "bases face inward" while saying nothing about which base is with which. For a reader meeting base pairing for the first time the pair IS the lesson. `viewer-compare/` at the repo root is where both were looked at, on 1BNA and 1EHZ.

* **An unpaired base is a STUB — half a rung, going nowhere** — and that is what makes the rung mean anything. A hairpin loop, a melted end, a bulge and every one of tRNA's tertiary contacts come out visibly not-a-ladder. The picture under-claims and never invents a pair.

* **A rung's end is a CHORD OF THE RIBBON**: its centre is a point on the backbone's own spline and its width axis is that spline's tangent. This is the third construction the module has had and the other two are worth knowing, because both look reasonable: extending along the pair axis walks the end sideways PAST the ribbon (that axis does not point at the phosphate — every end lands 2 to 3.6 Å short on 1BNA), and bending through C1' to P arrives but reads as kinked wire. A rung anchored anywhere but on the drawn curve has to chase it, and the chase is what shows.

* **Every rung is split at its own hydrogen bonds and each half is coloured by its base**, the split-stick convention `kit/proteinbox.js` uses inside a pocket. Half a rung already IS one base, so the sequence becomes readable off the structure with no labels. It is also how a **G·U wobble** is drawn honestly: the rung says *paired*, the colours say *G with U*, and the split lands off-centre because the bases are ~2 Å out of register — the shift drawn rather than captioned. Colour therefore cannot also carry paired-versus-unpaired; the gap down the middle does.

* **The backbone's flat face points outward**, and this is the easy one to get backwards. The radial (C1'→P, with the local tangent rejected out) is the face's NORMAL, so it is the ribbon's THIN axis. Put the width along it and the backbone becomes a fin standing edge-on from the helix — still twisting, still following the phosphates, showing its narrow side all the way round. That shipped.

* Colour is `lib/palette.js`'s `bases` and `strands`, published as `--base-*` / `--strand-*`. Nothing in the module types one.

* `kit/check-nucleic.js` asserts all of the above on an ideal B-DNA it builds itself, plus an oblique case for the anchor and an off-centre split for the wobble. Every claim in it is a bug that shipped looking merely ugly, which is why it is gated on the module. **Two of its assertions carry non-degeneracy guards** — on ideal B-DNA the pair axis IS the radial, so an anchor test without one passes while proving nothing, and this checker did exactly that for two rounds.

* **`kit/proteinbox.js` draws nucleic chains too**, on any chain a bake marks `kind:'na'` — a backbone per strand and one rung per pair, through `kit/nucleic.js`, which a page loads alongside `kit/ribbon.js`. A protein and a duplex out of one bake share one box, one scale and one centre. `proteins/zif268/`, `proteins/polymerase/` and `proteins/rb69/` are the worked examples, and `proteins/index.html` draws every nucleic entry through it. **A page that builds its own `CardStage` to draw DNA is out of date, not making a choice** — this bullet said the branch did not exist for long enough that the claim got copied into new benches, and each copy brought its own `runs()`, strand colours and ball-and-stick constants with it. `proteins/nucleosome/nucleosome-test.html` is the one still to convert.

**`kit/duplex.js` — `Duplex`**

DNA with no deposition behind it: a prop in a scene, chromatin, a bundle. `Duplex.trace(opts)` writes the bake a baker would have, ideal B-DNA along any path (straight by default, `axis` for a polyline in Å), so the drawing is `NucleicLib`'s and nothing about the ladder is re-derived. `Duplex.group(THREE, trace, {scale, sub})` → a `THREE.Group` in palette.js's colours, with `userData.rebuild(trace)` for a path that moves. `superhelix`, `hermite` and `join` build wrapped and linker paths; `NUCLEOSOME` is the core particle's wrap.

* **The grooves are there**: C1'–C1' across a pair is 10.5 Å, so the strands sit 126° apart, not 180°. `check-nucleic.js`'s own ideal helix drops the offset on purpose; copying it would give DNA with no major groove.
* **Parallel-transport frame along the path**, not Frenet, so a wrap does not add its own rotation to the twist.
* **`NUCLEOSOME` is calibrated, not fitted raw**: the inputs whose ideal wrap, measured the way 1AOI is measured, gives 1AOI's numbers. The measurement reads ~1 Å narrow and ~5 Å flat because a pair's midpoint sits off the axis.
* An ideal helix is a prop. A claim about roll, propeller or groove width reads a deposition through `Proteinbox`.
* `kit/check-duplex.js` asserts handedness, rise, twist, the groove chord, antiparallel numbering, and NUCLEOSOME against 1AOI. First caller: `lab/strawberry/molecule.js`.

**`kit/surface.js` — `SurfLib`**

The browser half of the SES1 format written by `hemoglobin/tools/bake-surface.js`.

* `decode(THREE, arrayBuffer)` → `{geo, head, res, nVert, nTri}` — de-quantises positions, keeps normals as int8 interleaved

* `chainOf` / `numberOf` — per-vertex residue lookups, which is what lets a page paint one residue onto the skin

* The format itself stays specified in `hemoglobin/tools/bake-surface.js`'s header, next to the writer

**`hemoglobin/foldplay.js` — `FoldPlay`**

Only used for hemoglobin, which has a special baked folding animation. A trajectory from `HbFold.decode`, played as a ribbon that means something. It owns one rule, and the rule is the reason it is a module: **the ribbon must not show a helix before its bonds exist.** A residue is drawn helical when a formed H-bond spans it, and only where the deposited records say a helix belongs — so the assignment can arrive early or late but can never invent a helix the structure does not have. Pass the deposited `ss` to `RibbonLib` on every frame instead and the extended chain at t=0 comes out with eight wide blue bands in it: level 2 finished before level 1 has been read.

* `covers(fold)` — per residue, the bonds whose span contains it. Once per trajectory.
* `ssFor(fold, cov, formed, out)` — the letters at this instant. `out` is reused; this runs every frame.
* `create(THREE, fold, opts)` → `{ mesh, seek(t), tick(dt), dispose() }`. `opts.rate` is REBUILDS PER SECOND (24 default), not frames: the cost of a frame is `RibbonLib.build`'s spline work, measured at 7.9ms for a 2.5k-triangle card ribbon and 2.5ms once rebuilds are on their own clock. `rate: 0` for a caller that is scrubbing rather than playing.
* `dispose()` before every rebuild is not optional — the triangle count depends on the path, so there is no fixed buffer to update, and a frame that does not release the old geometry leaks it on the GPU.

**Two consumers, which is why it exists**: `hemoglobin-lab.html` (act 2) and the door map's protein card. What stays in the lesson is its level 1 — an extended chain blended into the trajectory through rigid per-residue frames — because that is a mechanism for the story that page tells, not a property of the fold.

**`tools/bake-trace.js`** (baker, not a module)

A deposited PDB down to what a ribbon needs: `node tools/bake-trace.js <file.pdb> [chains]` writes `<file>.trace.json` beside it — per chain a Ca array, every residue NUMBER, one ss letter per residue, and the record COUNT of helices and strands. Centred on the baked Ca, `centre` recording the vector removed so anything else baked from the same PDB can be brought into the frame.

* **`view` is solved, not typed, and only when the shape earns it.** A deposited frame is a crystal or an EM box, so there is nothing in it worth preserving; `FoldLib.viewBasis` turns the structure onto its own axes, longest across the frame and shortest into the screen. It reports `worth:false` for a globular domain, whose three extents are too close to tell apart and whose basis would flip between rebakes — no `view` is written, and a human picks one on the bench with `copy this view` (which is `box.pickView()`, because the answer is `camera⁻¹ · group` and only the box can see the second half) and pastes it into the registry. 2HHB declines; a fibril rung does not. **The handedness guard is the point of having one solver**: an eigenvector's sign is arbitrary, and a left-handed basis mirrors the protein into its enantiomer, which no internal check can see.
* **A structure with a known axis takes a convention instead**, via `FoldLib.basisFrom(up, hint)` — a fibril upright, a membrane protein on its normal. `proteins/prion/prion-test.html` measures a fibril's axis off consecutive rung centroids, which is what PCA cannot do there: the longest direction in 6LNI's box is the 75 Å between two protofibrils, a fact about the deposition rather than about the fibril.
* **`nums` is what makes a chain break drawable.** A trace carrying only `first` describes the chain as contiguous, so an unmodelled loop reads as a chain that simply skips and the ribbon splines a smooth band across coordinates nobody measured — indistinguishable from data at ribbon width. 7LNA orders 95-227 and models nothing for 194-196, which is what this exists for; the baker prints the break count.
* Secondary structure is READ from HELIX/SHEET, never detected. No records bakes as all coil and says `ssFrom:'none'`, so the card is visibly a worm rather than silently wrong.
* The helix COUNT is from the records, because adjacent helices merge into one run of `H`: 2HHB's eight per chain read as six. A caption saying "eight" has to say it from `helices`.
* 2HHB: 4 chains, 574 residues, 12 KB — against 453 KB of PDB, most of it atoms a ribbon discards.

**`proteins/bake-lib.js`'s nucleic half** (baker, not a module)

The reading side of the above. `naTrace(text, only, mod)` for the chains — P for the backbone, C1' for where the base hangs off, the base's ring centroid and plane normal so a slab can be drawn IN its plane; `assembleNA` for the trace shape, `centrePairs` to move the split points into it.

* **`chainKinds(text)` says what every chain in a file IS**, and it is the first thing a baker should call on an unfamiliar entry. A nucleic chain has no CA, so `caTrace` skips it atom by atom — 1AOI comes back as eight histones and a perfectly good render. **`caTrace` now reports what it dropped**, unconditionally and on stderr, so this cannot happen quietly any more; it stays silent when `only` excluded the chain on purpose.

* **`basePairs` is SOLVED, not read** — the format has no record for a base pair — so a bake says `pairsFrom` the way a trace says `ssFrom`. Watson-Crick is purine N1···pyrimidine N3; a **wobble** is N1···O2 *and* O6···N3, which adenine fails on its own because it has an amine at position 6 and no O6. Nothing names which bases may wobble. Hoogsteen, reverse-Hoogsteen and trans-Watson-Crick are refused, which is why 1EHZ's L is drawn with its two arms joined by nothing — but note that a tertiary contact is not automatically refused: G19·C56 is an ordinary cis Watson-Crick pair and is found.

* **The tolerance is a function of the structure's own resolution**, `hbFor(res)` — 3.3 Å plus 0.25 per Å beyond 2.0, recorded in the bake's `pairsFrom`. The N1···N3 distance is a hydrogen bond and does not vary; what varies is how well a model knows where the atoms are, and a single tight cutoff finds every pair in 1BNA at 1.9 Å while dropping a fifth of them in 1AOI at 2.8 Å. That loosening is only safe because of the **C1'–C1' window** (8.4–12.6 Å), a second criterion that fails on something else entirely: a base pair's sugars are ~10.5 Å apart and a stacked neighbour's are ~5.

* **A modified base is a HETATM**, so `naTrace` takes the same opt-in `mod` set `caTrace` does, off the file's own MODRES records. 1EHZ is 14 of 76 — an ATOM-only read returns 62, in fourteen separate one-residue holes the ribbon splines across. Which ones are modified rides in the bake as `mods`, because `seq` cannot say it: 5MC and C are both `C`.

* **A MIXED file's two polymers must share ONE centre.** `assemble` and `assembleNA` each solve their own when not given one, so a protein centred on its atoms and a duplex centred on its atoms overlap at the origin — each individually correct, the picture nonsense. `proteins/zif268/tools/prep.js` solves it over both.

* Every bake carrying nucleic chains is indexed in **`proteins/nucleic-acids.js`**, not `proteins.js`, and `check-nucleic-acids.js` re-derives every number in it. The line between the two indexes is the bake, not the biology — Zif268 is a protein and is in the nucleic one.

**`tools/bake-card-surface.js`** (baker, not a module)

A card-tier SES: `node tools/bake-card-surface.js <file.pdb> [chains] [spacing]` → `<file>.card.surf.bin`. Same `encode` as `hemoglobin/tools/bake-surface.js`, required rather than copied, so `SurfLib` decodes both.

* 1.4 A against the lesson tier's 0.6. On 2HHB: 0.6 is 1.5 MB, 1.1 is 608 KB, 1.4 is 362 KB, 1.7 is 266 KB. 1.4 is where the shape is still the protein's and the file is small enough that a toggle answers rather than makes the reader wait.
* **The frame is READ from the trace file**, not re-derived. `2HHB.surf.bin` is in the frame `FoldLib.orient()` solved from chain B; a card's ribbon is in the crystal frame centred on its own Ca. A surface that is the right shape in the wrong orientation reads as a bug in the mesh rather than as a missing rotation.
