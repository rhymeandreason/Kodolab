<!-- KIND: argument. Which components to build next and which existing ones to deepen, judged from Components.md's own "Good for / Not for" lines against the units in Bio-Content-Recommendation.md. Written for the human deciding what to build; nothing here is built, and every parameter list is a sketch, not a contract. Building one starts at demos/docs/AddingAComponent.md. -->

# Components: what to add, what to deepen

**Why components and not lessons.** The component library is what this project has that nobody else does: a membrane whose potential comes from the live ion counts, molecules that ship with the assertion that checks them. The generator is how that library reaches a teacher. Every component added widens what the builder can make without touching the builder, so after Beta this is where most effort should go.

**How this was judged.** Each section of `Components.md` ends with what the component is good for and what it is not for. Read together, those lines are a map of the covered ground and, in the "Not for" halves, a list of what the authors already know is missing. `Bio-Content-Recommendation.md` is the course.

| Unit | Components today |
| --- | --- |
| Water | `WaterSim` |
| Macromolecules | `Molecule`, `Diagram`, `Condense` |
| Proteins | `Proteinbox`, `HbCrowd` |
| Cell, membrane | `Membrane`, `AnimalCell`, `PlantCell`, `Mitochondrion`, `Chloroplast`, `BloodCell` |
| Respiration | `ElectronTransport`, `RespirationReaction` |
| Photosynthesis | `LightReactions`, `Leaf`, `Tree` |
| Physiology | `BloodFlow` |
| Molecular genetics | none |
| Mendelian genetics | none |
| Evolution | none |
| Viruses | none |
| Ecology | none |

Chemistry, energy and cells are covered well. Four units that make up roughly half the course have nothing a generated app can mount.

**What makes a component worth building,** in the order these were ranked: how much of the course it carries; whether it attacks a named misconception; whether a simulation beats the textbook's diagram; and what it reuses from the repo.

## 1. New components

### 1.1 Gene expression

A stretch of DNA, transcribed and then translated: the template strand read, an mRNA leaving, a ribosome walking codons, tRNAs arriving, a chain growing. Rung `macromolecule`.

* **Parameters (sketch):** `sequence` (a short coding stretch, or a named gene's opening codons), `mutation` (`{ at, to }`, or an insertion or deletion), `stage` (`'transcription' | 'translation' | 'both'`), `pace`.
* **State:** the mRNA so far, the peptide so far, the codon under the ribosome, the mutation's class (silent, missense, nonsense, frameshift) **computed from the codon table, never typed**.
* **Why first.** It is the most-taught unit with no coverage. It attacks reading frame, "mutations are always harmful" and "RNA is a mere helper" by letting the student break the sequence and watch what happens. And it is the missing first rung of the best story the library already tells: `HbCrowd`, `BloodCell` and `BloodFlow` run fibre to cell to vessel, and `Bio-Content-Recommendation.md` stars the "sickle cell full chain". With β-globin's opening codons and GAG→GTG at Glu6 (the sixth residue of the mature chain, the seventh codon counting the start), this component is the base change that starts it. The numbering is a trap worth a comment and a check: the literature's "6" does not count the methionine.
* **Reuses:** `kit/nucleic.js`, `dna-structure.html`, `mol-nucleic.js`, `mol-aminoacids.js`.
* **Accuracy notes.** The ribosome and polymerase are blobs at this rung, as the enzyme blob is, and the section says so. Transcription and translation are separated in space in a eukaryote (the misconception list has "DNA leaves the nucleus"), so `'both'` must show the mRNA leaving a compartment, not a ribosome following the polymerase, unless a `prokaryote` flag says otherwise.
* **Not for:** replication (a separate, smaller component on the same kit: fork, leading and lagging strands, Okazaki fragments), regulation, splicing in a first version.

### 1.2 Cell division

Mitosis and meiosis with chromosomes as objects a student can follow by colour and by the alleles they carry. Rung `cell`.

* **Parameters:** `mode` (`'mitosis' | 'meiosis'`), `pairs` (1 to 4; more is unreadable), `alleles` (what each homolog carries, e.g. `{ 1: ['A','a'], 2: ['B','b'] }`), `crossover` (on, off, or a position), `nondisjunction` (none, meiosis I, meiosis II), `phase` to hold on one.
* **State:** phase, ploidy per cell, and **the gametes' genotypes**, which is the output the rest of genetics needs.
* **Why.** "Meiosis is mitosis twice" and "traits blend" are on the misconception list, and the starred content piece is a meiosis animation with a variation counter. Run it many times and independent assortment is something watched, with the 9:3:3:1 arriving through `Graph` as a tally instead of being asserted by a Punnett square. `AnimalCell`'s own section names cell division as its gap.
* **Reuses:** `AnimalCell`'s envelope and scale.
* **Accuracy notes.** Random orientation at metaphase I must be actually random (seeded, per `Build-Updated.md` §10), since the claim being taught is that it is. Chromosomes are drawn condensed throughout, which is a stated simplification for interphase.
* **Not for:** the cell cycle's checkpoints, cancer, a karyotype of 23 pairs.

### 1.3 Enzyme kinetics

A crowd of one enzyme and its substrate, bulk form of the `macromolecule` rung: collisions, binding, turnover, product.

* **Parameters:** `substrate` and `enzyme` counts, `temperature`, `pH` with the enzyme's `optimum`, `inhibitor` (`{ kind: 'competitive' | 'allosteric', count }`), `feedback` (product inhibits), `denatureAbove`.
* **State:** bound fraction, rate, product count, each ready for `Graph`. Sweep `substrate` and the saturation curve is drawn by the simulation; add a competitive inhibitor and the student sees the same ceiling reached later.
* **Why.** Enzymes sit under respiration, photosynthesis and genetics, and saturation, inhibition and denaturation are all claims a student usually meets only as a graph to memorise.
* **Reuses:** `massaction/` (hosted today inside `glycolysis-lab.html`, with its own checker) and `kit/enzyme-blob.js`. Mostly a promotion of code that exists, which makes it the cheapest item on this list. `Modules.md`'s table changes with it, since a one-lesson module gains a second caller.
* **Accuracy notes.** The memory note that the enzyme has two scales applies: this is the blob's crowd, and a measured structure stays `Proteinbox`'s. Rates are relative, and the section should say no number read off it is a k<sub>cat</sub>.
* **Not for:** a real enzyme's shape, a multi-step pathway.

### 1.4 Population

Agents with a heritable trait, reproducing under a selection pressure. Rung `population`, the top of `kit/scale.js`'s ladder and currently empty.

* **Parameters:** `size`, `trait` (discrete alleles or a continuous value), `selection` (strength, and which way), `mutationRate`, `bottleneck` (at a generation, to a size), `migration`, `mating` (random or assortative).
* **State:** allele frequencies and trait distribution per generation, for `Graph`; whether Hardy-Weinberg proportions hold.
* **Why.** `Bio-Content-Recommendation.md` stars the selection simulator with exactly the right sentence: individuals don't change, the distribution does. Drift against selection is among the most durable misconceptions in the course, and it is one where a simulation is the argument: set `selection: 0`, `size: 20`, and an allele fixes anyway. The same component serves antibiotic resistance ("bacteria become resistant") and antigenic drift.
* **The link to what exists.** The sickle allele under malaria is heterozygote advantage: `trait: HbS`, fitness by genotype, with and without malaria. That makes one story from a base pair (1.1) to an allele frequency, through four components already built.
* **Accuracy notes.** No agent's trait changes in its lifetime, and the rendering must make that visible, since it is the claim. Needs the seeded clock more than any other component: a drift run must be replayable to be discussed.
* **Not for:** speciation, phylogeny (the cytochrome c comparison is a different, data-driven tool), ecology's population growth, which is a sibling worth considering once this exists.

### 1.5 Virus

Attachment, entry, the host's machinery making viral parts, assembly, exit. Rung `cell`, with the binding step at `membrane`.

* **Parameters:** `virus` (enveloped or not; genome kind), `receptor` present or absent on the host, `cycle` (`'lytic' | 'lysogenic'`), `drug` (an entry blocker, a polymerase inhibitor; and an antibiotic, which does nothing, and that is the lesson).
* **Why.** "The virus supplies only instructions" is the starred piece, and it is only visible if the host's ribosomes are seen doing the work.
* **Build after 1.1,** because the middle of the cycle is gene expression with someone else's message. Spike and receptor as measured structures are `Proteinbox`'s.
* **Not for:** immunity, which is its own large subject.

### 1.6 Neuron, if the syllabus wants it

`Membrane` already has channels, a pump and a Nernst potential from live counts. A voltage-gated sodium channel and a patch that excites its neighbour is an action potential. Build it only if the target course covers it; physiology varies more between syllabi than any other unit.

## 2. Depth in components that exist

### 2.1 Proteinbox: proteins that do something

Its section says it is not for animation of function, and that nothing moves except hemoglobin's fold. The unit's central claim is that structure gives function, and a still structure shows half of that.

Morphs between two deposited states, for a few proteins:

* **Hemoglobin T to R** as O₂ binds. With `Graph`, the sigmoid binding curve appears as cooperativity happens, beside myoglobin's hyperbola.
* **Induced fit**: hexokinase open and closed around glucose, which glycolysis's first step already needs. `proteins/hexokinase/closure-test` is a bench for exactly this, so the work is the mount parameter and the `Components.md` section.
* **A channel gating**, which `Membrane` can point to.
* **ATP synthase turning**, which `ElectronTransport` and `LightReactions` both draw as a blob.

Each is an interpolation between two real depositions, so the accuracy rule holds: the endpoints are measured, the path between is a stated visual aid (`SCIENCE.md` §5 governs what a motion may imply). The parameter is small: `state: 'T' | 'R'`, or a 0 to 1 `progress`.

### 2.2 WaterSim: a surface, and the hydrophobic effect

Its section says: not for anything the water is in, no container, no membrane, no surface.

* **The hydrophobic effect.** `nodegraph/Biology-Node-Graph.md` draws the edge from it to the phospholipid bilayer and to protein folding, and calls that kind of edge what justifies the project. Lipids dropped into water assembling into a micelle or a bilayer on their own is the join between the water unit and the membrane unit, and nothing in the library shows it.
* **pH and buffers.** The other water topic with no coverage. Proton transfer is beyond a classical water model, so this is a schematic layer with its exaggeration stated, not a new physics.
* **The capillary bench** (`capillary/pbf-test.html`) is a surface with a measured contact angle. It can graduate into a component, and transpiration in `Leaf` and `Tree` then has its mechanism.

### 2.3 Membrane: the rest of what crosses

"Not for" names receptors and vesicles. Add, in this order:

1. **Cotransport** (glucose riding sodium's gradient). It is the payoff of the pump the component already has: the gradient is spent on something.
2. **Vesicles**, endocytosis and exocytosis, which `AnimalCell`'s secretory story ends in.
3. **A receptor** with a ligand and a response inside, the opening of signalling.

### 2.4 Leaf: stomata that respond

"Good for" names the trade a stoma makes between CO₂ in and water out; "Not for" names light and a day and night cycle. Parameters for light and water stress, with guard cells that respond, make the trade something a student operates instead of reads.

## 3. One platform feature: the handoff between rungs

The strongest material in the library is a vertical arc: `HbCrowd` to `BloodCell` to `BloodFlow`. `Generator.md` §4 requires an eval edit that asks "show me where in the cell this happens", because students ask it.

A shell-level transition between two scenes that share an anchor: zoom into `Mitochondrion`'s inner membrane and arrive in `ElectronTransport`; into `Chloroplast` and arrive in `LightReactions`; into `AnimalCell`'s nucleus and arrive in gene expression. The anchors exist (every component section lists them) and `shell.scene` already holds several scenes live. What is new is a declared pairing, which anchor in the outer component is which component a rung down, and a camera move that ends where the inner scene begins.

Every pair of components on adjacent rungs becomes a lesson, with no new component. It also makes `kit/scale.js`'s ladder something the student experiences.

## 4. Order

1. **Enzyme kinetics.** Cheapest, since the simulation exists; proves the promotion path from a lesson's module to a component.
2. **Gene expression.** The largest gap, and it completes the sickle arc.
3. **Proteinbox morphs,** hemoglobin first, since the lesson and the structures exist.
4. **Cell division.**
5. **Population,** after the seeded clock (`Build-Updated.md` §10), which it depends on.
6. **The handoff,** once there are three arcs to use it on.
7. **Hydrophobic assembly** in `WaterSim`; **cotransport** in `Membrane`.
8. **Virus.**
9. `Leaf`'s stomata, the capillary component, vesicles and receptors, the neuron, as lessons ask for them.

**A component is not done until `tools/gen-app.js` writes a working page from its `Components.md` section alone** (`AddingAComponent.md`). For each of these, write the "Good for / Not for" line first. It is the scope, and it is what the model will pick by.
