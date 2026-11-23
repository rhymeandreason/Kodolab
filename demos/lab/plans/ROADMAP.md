# Roadmap

What to build and in what order, so the site launches as a resource teachers can rely on. The other
docs catalog what *could* be built; this one picks. For details on any lab or prop, see
[CATALOG.md](../CATALOG.md) and the docs it links to.

---

## 1. Targets

| Stage | Labs | What it gives teachers |
|---|---|---|
| **Launch** | **12** | One strong lab for every unit of a high school or AP biology course, so the site fits a whole year, not one week |
| **First year** | **30** | Two or three labs per unit, so teachers have a choice and can assign a different lab next year |
| **Later** | 50+ | Enough to replace the lab program for a whole course. Only worth it once usage shows which kinds of labs teachers actually pick |

Alongside the labs, a separate shelf of **10–12 "How do we know?" mini-sims** (section 5). They're short,
cheap to build, and make the site feel full well before all 30 labs exist.

**Why units matter:** teachers decide unit by unit. A teacher who opens the site and finds nothing for
this month's unit may not come back. AP Biology has 8 units; most high school courses have 8–10.

## 2. The quality bar for every lab

Twelve polished labs are worth more than 30 rough ones. Every lab ships with:

- **Fits one class period** (45–50 minutes), or splits cleanly into parts.
- **Teacher materials:** standards alignment (NGSS, AP), a short guide, pre- and post-lab questions,
  answer keys.
- **Runs on school Chromebooks.** A performance budget for every lab.
- **Data students can export** to graph for lab reports.
- **The zoom:** at least one microscope, cell or molecule view that explains the bench result
  ([MICRO.md](MICRO.md)).
- **Built on `Lab/`**, following the replay rules in [README.md](../README.md).

## 3. The launch set (12)

One lab per unit, plus a second microscope lab for cells. Six of the twelve already exist as
prototypes; only Photosynthesis is rebuilt on `Lab/` so far, so launch includes moving the other five
onto it.

| Unit | Lab | Kind | Status | The zoom |
|---|---|---|---|---|
| Enzymes and biomolecules | Catalase | Classic, D | new | Peroxide splitting at the active site; heat unfolds the enzyme |
| Cells and transport | Egg osmosis | Classic | prototype | Water crossing the membrane |
| | Elodea plasmolysis | Classic | new | The vacuole shrinks and the membrane pulls from the wall |
| Cell energy | Leaf-disk photosynthesis | Classic, D | **on Lab** | O₂ filling the leaf's air spaces |
| Cell division | Onion root mitosis | Classic | prototype | Chromosomes condensing and splitting |
| Heredity | Mendel's peas | Historic | new | Alleles sorting into egg and pollen |
| Gene expression | Crick and Brenner's frameshifts | Historic | new | Letters added or removed change how the code reads in threes |
| DNA | Strawberry DNA extraction | Classic | prototype | Membranes dissolve, DNA clumps |
| Biotech | E. coli transformation | Classic | prototype | A plasmid enters and the cell glows |
| Microbes and evolution | Antibiotic disks | Classic, D | new | Bacteria near the disk burst; resistant ones survive |
| Ecology | Composting | Question, D | new | Microbes take turns and enzymes break down cellulose |
| Physiology | Blood typing | Classic | prototype | Antibodies clump red cells |

**Kind:** Classic = a standard class lab · Historic = a famous experiment ([HISTORIC.md](HISTORIC.md)) ·
Question = starts from an everyday question ([QUESTIONS.md](QUESTIONS.md)) · D = also suits
design-your-own mode ([DESIGN-MODE.md](DESIGN-MODE.md)).

## 4. The first-year list (30)

The launch set plus 18 more, in order by unit. Bold rows are in the launch set.

| # | Unit | Lab | Kind | The zoom | Extra chapters |
|---|---|---|---|---|---|
| 1 | Enzymes and biomolecules | **Catalase** | Classic, D | Active site, unfolding | |
| 2 | | Food tests (sugar, starch, protein) | Classic | What each reagent binds and why it changes color | |
| 3 | | Pineapple in gelatin | Question | Bromelain cutting collagen | |
| 4 | Cells and transport | **Egg osmosis** | Classic | Water crossing the membrane | |
| 5 | | **Elodea plasmolysis** | Classic | Vacuole shrinking | |
| 6 | | Dialysis tubing and amylase | Classic | Small molecules pass the pores, starch can't | |
| 7 | Cell energy | **Leaf-disk photosynthesis** | Classic, D | O₂ in the air spaces | Kok's flashes; Emerson's two light colors |
| 8 | | Yeast fermentation | Classic, D | Sugar to ethanol and CO₂ in the cell | |
| 9 | | Engelmann's spectrum | Historic | Bacteria crowding at red and blue light | |
| 10 | | How respiration was cracked | Historic | Poison one step and see what piles up; the Krebs cycle closes; ATP synthase spins | Chapters from [RESPIRATION-HISTORY.md](RESPIRATION-HISTORY.md) |
| 11 | Cell division | **Onion root mitosis** | Classic | Chromosomes condensing and splitting | Hunt's cyclin |
| 12 | | Sordaria crossing over | Classic | Crossover changing the spore order | |
| 13 | Heredity | **Mendel's peas** | Historic | Alleles sorting | |
| 14 | | Fruit fly crosses | Classic | Following the X chromosome | |
| 15 | Gene expression | **Crick and Brenner's frameshifts** | Historic | Reading in threes | |
| 16 | DNA | **Strawberry DNA extraction** | Classic | Membranes dissolve, DNA clumps | |
| 17 | | Hershey–Chase | Historic | Phages inject DNA; the blender knocks off the coats | |
| 18 | | Meselson–Stahl | Historic | Old and new strands in the centrifuge bands | |
| 19 | Biotech | **E. coli transformation** | Classic | Plasmid enters, cell glows | |
| 20 | | Gel electrophoresis and restriction digest | Classic | Enzymes cut; fragments thread through the gel | |
| 21 | | PCR | Classic | Strands separate, primers stick, copies double | |
| 22 | Microbes and evolution | **Antibiotic disks** | Classic, D | Bacteria bursting near the disk | |
| 23 | | Pasteur's swan-neck flask | Historic | Microbes trapped in the neck | |
| 24 | | The MEGA-plate | Historic | Mutants spreading band by band | |
| 25 | Ecology | **Composting** | Question, D | Microbe succession, cellulose breakdown | |
| 26 | | Algae bloom (fertilizer in pond water) | Question, D | Algae multiply, then bacteria use up the oxygen | |
| 27 | | The mass of a tree (van Helmont) | Historic | CO₂ from the air becoming wood | |
| 28 | Physiology | **Blood typing** | Classic | Antibodies clump red cells | |
| 29 | | Loewi's two hearts | Historic | Acetylcholine crossing the synapse | The patch clamp |
| 30 | | Daphnia heart rate | Classic, D | The heartbeat under the microscope | |

**Balance:** 17 classic labs (teachers find what they already teach), 10 historic (what makes the
site distinctive), 3 question-driven (students' everyday lives). Seven suit design-your-own mode. Every unit has at least two labs except gene expression, which has one plus the mini-sims.

**Extra chapters** are optional add-ons inside a lab, mostly at the college level, rather than separate
labs. They come from [HOW-DO-WE-KNOW.md](HOW-DO-WE-KNOW.md) and RESPIRATION-HISTORY.md.

**Almost made the list** (good swaps if a lab turns out weak or teachers ask): Gram stain, pigment
chromatography, CRISPR, kombucha, microplastics, Frye–Edidin cell fusion, pillbug choice chamber.

## 5. The "How do we know?" shelf

Short mini-sims, 5–10 minutes each: one clever trick and one aha. Teachers can use them as warm-ups and
discussion starters. Most run at the molecule scale on engines the labs already need. Details are in
[HOW-DO-WE-KNOW.md](HOW-DO-WE-KNOW.md).

| Mini-sim | The aha | First six |
|---|---|---|
| Kok's flashes | Oxygen comes out every fourth flash | ✓ |
| The spinning bacterium | Tether the flagellum and the whole cell spins | ✓ |
| Counting chromosomes | Why 48 seemed right, until cells were swollen and counted cleanly | ✓ |
| Hunt's cyclin | A protein that rises and crashes with each division | ✓ |
| The patch clamp | One channel's current in square steps | ✓ |
| Kinesin's steps | 8 nm at a time | ✓ |
| Okazaki fragments | New DNA on one strand comes in short pieces | |
| De Duve's leaky bags | Enzyme activity rises as lysosomes break in the fridge | |
| Sutherland's signal | Only one mixing order works: the second messenger | |
| Woese's three domains | Archaea split off the tree | |
| The molecular clock | Count differences to date a split | |
| Cryo-EM averaging | A shape comes into focus from noisy images | |

Crick and Brenner's frameshifts started on this shelf, but became a full lab because the gene
expression unit had nothing else.

## 6. Build order

The labs are grouped by the shared engines and kits they need, so each phase builds a piece of the
library and then uses it several times.

### Phase 0: move the prototypes onto Lab

Rebuild Ecoli, EggLab, OnionRoot, Strawberry and BloodType on `Lab/`. This pulls their best parts into
the library, where every later lab needs them:

- Agar plate with colonies, microcentrifuge tube, tube racks, water bath (Ecoli)
- Edge-tinted glass and liquid, the deformable egg (EggLab)
- Compound microscope, **eyepiece view**, 3D mitosis cell (OnionRoot)
- **Plant cell kit, DNA and lipid models**, scale switcher (Strawberry)
- Hover labels (BloodType)

### Phase 1: launch

| New lab | Library work it needs |
|---|---|
| Catalase | **Molecule swarm** with reaction rules and protein folding |
| Elodea plasmolysis | Eyepiece view + plant cell kit + **membrane rules** |
| Antibiotic disks | Growth and division on agar; diffusion from a disk |
| Mendel's peas | Inheritance engine; plants with growth |
| Crick and Brenner's frameshifts | Mostly interface: a sequence puzzle |
| Composting | **Days-long timeline**, polymer breakdown, microbe community, experiment-set layout |

Plus the teacher materials for all 12.

### Phase 2: fill out the core units

Yeast fermentation, food tests, pineapple in gelatin, dialysis tubing, gel electrophoresis with
restriction digest. Adds color change in liquids, field-driven drift, size-based membrane rules. Start
the mini-sim shelf with the first six.

### Phase 3: the molecular and historic labs

Hershey–Chase, Meselson–Stahl, PCR, how respiration was cracked, Engelmann's spectrum, Sordaria,
fruit flies. Adds the **pathway puzzle** engine (reaction steps plus blockers plus a live chart of what
builds up), isotope tracking, centrifuge with density gradient, phage, swimmers.

### Phase 4: the rest of the 30

Pasteur's flask, the MEGA-plate, algae bloom, van Helmont, Loewi, Daphnia. Adds populations over
generations, period settings, and the remaining mini-sims.

### Design-your-own mode

Starts after launch, following the build order in DESIGN-MODE.md section 8: the experiment model and
variability engine first, then leaf disks and catalase as the first labs to support it.

## 7. Changes from earlier recommendations

Earlier drafts (in conversation) differed in a few places:

- **Gene expression added.** No earlier list had a lab for transcription, translation and mutations.
  Crick and Brenner's frameshifts fill it, at launch.
- **Launch set.** Yeast fermentation and gel electrophoresis moved from launch to Phase 2, to make room
  for the frameshifts and a second microscope lab while keeping launch at 12.
- **Respiration added** as a historic storyline lab in the cell energy unit.
- **Van Helmont moved** from cell energy to ecology (it's a carbon-cycle story), and the pillbug choice
  chamber dropped to "almost made the list" because it has no zoom.
- **Mini-sim shelf added** as its own kind of content, separate from the 30 labs.
