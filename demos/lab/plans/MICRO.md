# Zooming in: labs and props for the microscope, cell and molecule scales

The labs where seeing the invisible level is the point, and the micro-scale props they need. This goes
with [PROPS.md](../PROPS.md) (bench props from our prototypes) and [PROPS-COVERAGE.md](PROPS-COVERAGE.md)
(the full range of bench labs).

A real class can do the bench part of any lab. What software adds is showing *why* the result
happens: the water crossing the membrane, the enzyme splitting peroxide, the DNA fragment threading
through the gel. So a lab ranks high here when the bench result is puzzling until you see the small
scale.

---

## 1. The zoom ladder

Four scales, each with its own unit, so props at one level always fit together.

| Level | Unit | What you see | Already in our prototypes |
|---|---|---|---|
| **Bench** | 1 unit = 1 cm | Glassware, hands, equipment | All five labs |
| **Microscope field** | 1 unit = 1 µm, seen through an eyepiece | A field of many cells, stained, at 40× to 1000× | OnionRoot (2D field of root-tip cells, objectives, cell counting) |
| **Cell** | 1 unit = 1 µm, free 3D camera | One cell and its organelles, cut away | Strawberry (plant cell breaking open), Ecoli (bacterium inset with plasmids and GFP), OnionRoot (3D mitosis) |
| **Molecule** | 1 unit = 1 nm | Molecules moving, binding, reacting | Strawberry (DNA, histones, bilayer, micelles, Na⁺, alcohol), EggLab (water particles) |

**Ways to move between levels:**
- **Scale switcher:** jump the whole view between levels (Strawberry).
- **Inset:** a picture-in-picture window showing the smaller level live while the bench runs (Ecoli).
- **Eyepiece:** click the microscope to look through it (OnionRoot).

The library should support all three. They all use the same rule: every level reads the lesson's
timeline, so scrubbing time moves the bench and the molecules together.

## 2. Labs where zooming in pays off

★★★ = the bench result makes no sense without the zoom · ★★ = the zoom adds a lot · ★ = nice to have.

### Standard labs

| Lab | Bench | What the zoom shows | Levels | Rating |
|---|---|---|---|---|
| DNA extraction ✓ | Mash, soap, salt, alcohol; white strands appear | Cell wall and membrane break; soap turns the bilayer into micelles; salt strips histones; DNA clumps in alcohol | cell, molecule | ★★★ |
| Bacterial transformation ✓ | Heat shock; only some plates glow | Pores open in the membrane, a plasmid enters, the cell makes GFP and survives ampicillin | cell, molecule | ★★★ |
| Onion root mitosis ✓ | Stain, squash, count cells | Cells in each phase; chromosomes condense, line up and split | microscope, cell | ★★★ |
| Egg osmosis ✓ | Egg swells or shrinks | Water crossing the membrane each way; shell dissolving in acid | molecule | ★★ |
| Leaf-disk photosynthesis ✓ | Disks float up in light | O₂ from chloroplasts fills the air spaces in the leaf until it floats | cell, molecule | ★★★ |
| Blood typing (BloodType ✓) | Blood clumps or doesn't | Antibodies bridge antigens on red cells, so the cells clump | microscope, cell, molecule | ★★★ |
| Elodea plasmolysis | Leaf in salt water | The vacuole shrinks and the membrane pulls away from the wall; chloroplasts stream (cyclosis) | microscope, cell | ★★★ |
| Potato cores in salt | Cores gain or lose mass | Cells swell (turgid) or shrink (plasmolyzed); water flows by concentration | cell, molecule | ★★ |
| Dialysis tubing | Iodine and starch move one way only | Pores let small iodine and glucose through and block big starch | molecule | ★★★ |
| Catalase | Liver foams in peroxide; heat stops it | H₂O₂ fits the active site and splits into water and O₂; heat unfolds the enzyme | molecule | ★★★ |
| Amylase and starch | Blue-black iodine color fades | Iodine sits inside the starch coil (that's the color); amylase chops the coil | molecule | ★★★ |
| Food tests | Benedict's, Biuret, iodine colors | What each reagent actually binds and why the color changes | molecule | ★★ |
| Chromatography of pigments | Colored bands rise on paper | Each pigment's balance between sticking to paper and dissolving in solvent | molecule | ★★ |
| Yeast fermentation | Balloon inflates | Glucose → ethanol + CO₂ inside the yeast cell; CO₂ leaving | cell, molecule | ★★ |
| Pea respiration | Bead moves in a capillary | Mitochondria use O₂; KOH traps CO₂, so gas volume drops | cell, molecule | ★★ |
| Gel electrophoresis | Bands at different distances | DNA (negative) pulled toward + through an agarose mesh; short pieces slip through faster | molecule | ★★★ |
| Restriction digest | Different band patterns | An enzyme finds its sequence and cuts; the fragment lengths make the pattern | molecule | ★★★ |
| PCR | A tube cycles temperatures | Strands separate, primers stick, polymerase copies; doubling each cycle | molecule | ★★★ |
| Gram stain | Purple vs. pink bacteria | Thick peptidoglycan holds the purple dye; a thin wall plus outer membrane lets alcohol wash it out | microscope, cell | ★★★ |
| Antibiotic disks | Clear zones on a bacterial lawn | Antibiotic diffuses out; bacteria near the disk can't build walls and burst; resistant ones survive | microscope, cell, molecule | ★★★ |
| Cheek cells / staining | Blue dots under the scope | Methylene blue binds DNA in the nucleus | microscope, cell | ★★ |
| Sordaria meiosis | Spore color patterns in asci | Crossing over swaps chromosome pieces, which changes the spore order | microscope, cell | ★★★ |
| Stomata peel | Count open vs. closed pores | Guard cells swell with water and bow apart | microscope, cell | ★★ |
| Spectrophotometry | A number on a meter | Molecules absorb some colors of light; more molecules, more absorbed | molecule | ★★ |
| ELISA | Wells turn color | Antibody sandwich catches the target; a linked enzyme makes color | molecule | ★★★ |

### Science-fair and household labs

| Lab | Bench | What the zoom shows | Rating |
|---|---|---|---|
| Soap vs. hand sanitizer | Fewer colonies after washing | Soap micelles lift oil and germs off skin; alcohol breaks membranes and unfolds proteins | ★★★ |
| Pineapple in gelatin | Gelatin won't set | Bromelain cuts collagen chains so they can't tangle into a gel; cooking unfolds bromelain | ★★★ |
| Red cabbage pH indicator | Purple turns pink or green | Anthocyanin changes shape as H⁺ comes and goes, which changes its color | ★★ |
| Celery in colored water | Dye rises in the stalk | Xylem tubes; water molecules stick to each other and the walls, pulled up by evaporation | ★★ |
| Bone in vinegar | Bone turns rubbery | Acid dissolves calcium phosphate crystals and leaves the collagen fibers | ★★ |
| Yogurt | Milk thickens | Lactobacillus makes lactic acid; casein clusters unfold and link up | ★★ |
| Bread mold | Fuzzy spots spread | Hyphae growing and branching; spores forming | ★★ |
| Elephant toothpaste with yeast | Foam erupts | Catalase in yeast splitting peroxide (same as the catalase lab) | ★★ |
| Daphnia and caffeine | Heart rate counts | A see-through heart beating under the microscope; caffeine changing the rate | ★★ |
| Microbial fuel cell | Multimeter reads a voltage | Bacteria pass electrons to the electrode as they eat | ★★ |

### More esoteric labs (advanced high school, college, research-style)

| Lab | What the zoom shows | Rating |
|---|---|---|
| Phage plaque assay | Viruses inject DNA, the cell bursts, new phages spread; clear spots on the lawn | ★★★ |
| Bacterial chemotaxis | Bacteria run and tumble, biased toward food | ★★★ |
| Paramecium in salt water | The contractile vacuole pumps faster or slower | ★★ |
| Sea urchin fertilization | Sperm meets egg, a fertilization envelope lifts off, first divisions | ★★★ |
| Zebrafish embryo development | Cells divide and fold into a body over hours | ★★ |
| Slime mold maze | Physarum spreads, then thins to the shortest path | ★★ |
| Cockroach leg action potentials (SpikerBox) | Ion channels open in sequence along the nerve | ★★★ |
| Glycerinated muscle + ATP | Myosin walks along actin when ATP is added | ★★★ |
| Chloroplast isolation and DPIP | Light-driven electron flow turns the dye clear | ★★ |
| Lac operon with X-gal | A repressor lets go, the gene turns on, colonies turn blue | ★★★ |
| SDS-PAGE / western blot | SDS unfolds proteins and coats them in charge; antibodies find one band | ★★ |
| Cell fractionation (centrifuge) | Organelles separate by size and density in layers | ★★ |
| Biofilm crystal violet assay | Bacteria stick, build a slime matrix, and resist washing | ★★ |
| Quorum sensing (Vibrio) | Signal molecules build up until all the cells light up at once | ★★★ |
| Pollen tube germination | A tube grows out of a pollen grain toward a sugar source | ★★ |
| Tardigrades drying out | Tun state; protective sugars and proteins replace water | ★★ |
| Microplastics in water | Particles under the microscope, plankton eating them | ★ |
| Kombucha SCOBY | Bacteria spinning out cellulose fibers | ★★ |
| MEGA-plate evolution | Bacteria spread across rising antibiotic bands, mutating to survive | ★★★ |

### Experiments software can invent

Things you can't do in a real class but can in a sim, because you can change the molecules directly.

| Experiment | What the student does |
|---|---|
| **Follow one molecule** | Tag a single water molecule during osmosis and trace its path |
| **Design a plasmid** | Pick genes, promoters and a resistance marker, transform, and predict which colonies grow and what color they glow |
| **Mutate the enzyme** | Change the active site's shape or charge and watch the reaction rate change |
| **Build a membrane** | Add cholesterol, change tail lengths or temperature; see fluidity and what leaks through |
| **CRISPR edit** | Choose a guide sequence, watch Cas9 cut, see the result in the colonies or the organism |
| **Design a drug** | Shape a molecule to block a receptor or enzyme and test whether it fits |
| **Any specimen, any stain** | One virtual microscope with focus, stains and objectives for any sample |
| **Predict the gel** | Draw a restriction map, predict the bands, then run it |
| **Speed up evolution** | Run thousands of bacterial generations against an antibiotic and watch resistance appear |
| **Signal cascade** | A hormone binds outside a cell and the signal spreads inside, step by step |
| **Light color vs. photosynthesis** | Shine colors on a chloroplast and see which ones drive the reaction |
| **Immune response** | Follow cells responding to a splinter: neutrophils, macrophages, antibodies |
| **Cell size limit** | Grow a cell and watch diffusion fail to keep up with its volume (agar-cube lab at cell scale) |

## 3. Micro-scale props

### 3a. Microscope field

| Prop | Variants | Parameters | State / hooks |
|---|---|---|---|
| **Eyepiece view** | brightfield · darkfield · phase contrast · fluorescence (channels) · stereo | `magnification` (40 / 100 / 400 / 1000×), `focus` (depth of field), `light` and `diaphragm`, `stainTint`, `scaleBar`, `pointer`, `drift` | `setObjective()`, `setFocus()`, `pan()`, cell counting / tally (from OnionRoot) |
| **Specimen field** | tissue sheet · smear · suspension (things swim) · cross section | `generator` (from the list below), `density`, `stain`, `seed`, `stageMix` (fraction of cells in each state) | `pickCell(x, y)`, `label()`, `count()` |
| **Specimen generators** | onion epidermis, root tip (from OnionRoot), cheek cells, leaf cross section, stomata peel, Elodea leaf, blood smear (RBC, WBC, platelets), Gram-stained bacteria (rods, cocci, purple or pink), yeast (budding), pond water (protists, algae), pollen, Sordaria asci, fungal hyphae | per-generator: cell shape, size range, packing | per-generator states (plasmolysis, phase, clumping, opening) |

### 3b. Cells (1 unit = 1 µm)

| Prop | Variants | Parameters | State / hooks |
|---|---|---|---|
| **Cell body** | plant (wall and membrane, from Strawberry) · animal · bacterium (capsule, from Ecoli) · yeast (oval, buds) · red blood cell (biconcave) · neuron · guard-cell pair · Paramecium (cilia) · sperm and egg | `size`, `shape`, `wallThickness`, `membraneColor`, `opacity`, `cutaway` (half removed) | `setVolume()` (swell, shrink), `lyse(0–1)`, `divide(0–1)` |
| **Nucleus** | with envelope, nucleolus, chromatin | `size`, `chromatin` (loose, condensed) | `dissolveEnvelope(0–1)` |
| **Chromosomes** | from OnionRoot: mitosis · meiosis with crossover | `count` (2n), `colors` (pairs), `lengths` | `setStage(t)` (condense, align, separate), `crossover(at)` |
| **Spindle / cell plate / cleavage furrow** | plant · animal | `poles` | `setStage(t)` |
| **Vacuole** | central (plant) · contractile (Paramecium) | `size`, `pigment` (Strawberry) | `setVolume()`, `burst()`, `pulse()` |
| **Chloroplast** | with thylakoid stacks | `count`, `size` | `stream()` (cyclosis), `setActive(0–1)` (gives off O₂) |
| **Mitochondrion** | with cristae | `count`, `size` | `setActive(0–1)` |
| **Other organelles** | ER, Golgi, vesicles, lysosomes, starch grains | `count`, `color` | instanced and drifting |
| **Ribosomes** | instanced dots (Ecoli) | `count` | none |
| **Nucleoid and plasmids** | from Ecoli | `plasmidCount`, gene colors | `enter()`, `express(0–1)` |
| **Flagellum / cilia** | helix (Ecoli) · cilia field | `count`, `length` | `beat(speed)` |
| **Cell wall layers** | plant cellulose · Gram-positive (thick) · Gram-negative (thin plus outer membrane) | `thickness`, `dyeHeld` | `crack()`, `stain(color)` |
| **Tissue** | packed neighbors (Voronoi), cells drifting apart (Strawberry) | `count`, `packing`, `seed` | `separate(0–1)` |
| **Virus / phage** | phage (head, tail, legs) · round virus | `size`, `count` | `attach()`, `inject()`, `burst()` |
| **Fungal hyphae** | branching filaments | `growth` 0–1, `branching` | `grow()` |

### 3c. Molecules (1 unit = 1 nm)

| Prop | Variants | Parameters | State / hooks |
|---|---|---|---|
| **DNA** | double helix (from Strawberry) · simple ladder · nucleosomes on histones · supercoil · fragments | `length` (bp), `sequence` (base colors), `style` | `unwind(0–1)` (denature), `cut(at)`, `bundle()` (precipitate) |
| **RNA / primer** | single strand | `length`, `sequence` | `bind(at)` |
| **Protein** | enzyme with an active site · antibody (Y shape) · receptor · channel / pore (aquaporin) · polymerase · restriction enzyme · histone (Strawberry) · GFP barrel · hemoglobin · collagen triple helix · actin and myosin · Cas9 | `preset`, `color`, `size` | `setFolded(0–1)` (denaturing), `bind(ligand)`, `act()` (one reaction step) |
| **Lipids** | phospholipid (two tails, from Strawberry) · detergent (one tail) · cholesterol | `color`, `tailLength` | none |
| **Membrane patch** | bilayer (Strawberry) · with channels or receptors · liposome · micelle | `size`, `cholesterol`, `channels[]`, `fluidity` | `dissolve()` (into micelles), `open(channel)` |
| **Small molecules** | water and alcohol (Strawberry), ions (Na⁺, Cl⁻, Ca²⁺, H⁺, K⁺), glucose, starch coil (with iodine inside), H₂O₂, O₂, CO₂, ATP, dye molecules (crystal violet, iodine, anthocyanin, DPIP), chlorophyll, amino acids | `style` (space-filling, ball-and-stick, simple sphere), colors by element | `setColor()` (indicators) |
| **Polymer chains** | starch, cellulose, collagen, peptidoglycan mesh, agarose gel mesh | `length`, `branching`, `density` | `cut(at)`, `tangle(0–1)` |

### 3d. Engines (the parts that make the props move)

These are the shared systems most micro labs need, more than any single prop.

| System | What it does | Used by |
|---|---|---|
| **Molecule swarm** | Thousands of particles in Brownian motion, with concentrations you set per region | Osmosis, diffusion, dialysis, chromatography, every enzyme lab |
| **Membrane rules** | Which molecules may cross a surface, and how fast (by size, charge, or through channels only) | Osmosis, dialysis, plasmolysis, transformation, nerve signals |
| **Reaction rules** | `A + E → B + E` with rates that depend on temperature, pH and folding | Catalase, amylase, food tests, ELISA, PCR |
| **Binding** | Molecules dock at sites (active site, antigen, primer, receptor), with a snap-in animation | Enzymes, antibodies, PCR, drugs |
| **Field-driven drift** | Charged molecules pushed through a mesh by an electric field, slowed by size | Gel electrophoresis, SDS-PAGE |
| **Growth and division** | Cells divide, colonies spread, hyphae branch, over time | Antibiotic disks, plaques, mold, biofilms, evolution |
| **Swimmers and crawlers** | Run-and-tumble, ciliary swimming, crawling, with simple choices | Chemotaxis, Paramecium, sperm, Daphnia |

### 3e. Overlays

| Overlay | Purpose |
|---|---|
| **Labels with leader lines** | Name parts at any scale (extends the hover labels in `interact.js`) |
| **Concentration heatmap** | Show where there's more of something |
| **Flow arrows** | Net direction of water or ions |
| **Molecule counter** | Live counts inside vs. outside |
| **Cutaway** | Slice a cell or a tube open |
| **Scale bar and "you are here"** | Shows the current level on the zoom ladder |
| **Ghosting** | Fade everything except what matters at this step |

## 4. What to build first

The picks that made the launch and first-year lists are in [ROADMAP.md](ROADMAP.md).

**Shared parts first, because each one unlocks many labs:**
1. **Molecule swarm with membrane rules.** Covers osmosis, dialysis, plasmolysis and diffusion, and is
   half of every enzyme lab.
2. **Cell body kit** (plant, animal, bacterium) with the organelles. Refactor from Strawberry and Ecoli.
3. **Eyepiece view with specimen generators.** Refactor from OnionRoot. One view covers all microscopy.
4. **Protein and DNA kit with binding.** Refactor DNA from Strawberry; add enzyme, antibody and channel.

**Then the labs that get the most from the zoom (all ★★★ and reuse the parts above):**
1. **Catalase / enzymes:** small bench, very clear molecule story, adds reaction rules and folding.
2. **Elodea plasmolysis:** eyepiece view plus the cell kit plus the swarm.
3. **Gel electrophoresis with a restriction digest:** adds field-driven drift; leads to PCR.
4. **Gram stain plus antibiotic disks:** microscope plus cell walls plus growth.
5. **Dialysis tubing / amylase:** the swarm with size-based membrane rules plus the starch coil.
6. **Design-a-plasmid:** builds directly on the Ecoli transformation lab.
