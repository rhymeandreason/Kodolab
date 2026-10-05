<!-- KIND: argument — load when choosing the next protein to add to proteins.js, or when pricing one that has already been asked for. Candidates only: nothing here is committed, and no PDB id here has been fetched. How to actually add one is docs/AddingAProtein.md. -->

# What to add next, and what each one costs

**Tiers 1, 2 and 3 are verified (2026-08-28). Tiers 4 and 5 are not**. Confirm the id, the chain count and the format availability against RCSB before a baker is pointed at one. The `format` column is a prediction, not a measurement.

## Where candidates come from

**PDB-101's Molecule of the Month** (`pdb101.rcsb.org/motm`) is the best source found so far: 320 entries, each an article written at roughly this repo's reading level, and **each one names the depositions it draws**. That last part is the whole value — the ids in this document were originally written from memory, and verifying them cost a session and moved four rows. A curated id is a verified id's cheaper cousin.

Nine candidates below came from that index on 2026-08-29, after cross-checking all 320 titles against this document and `proteins.js`. About forty were already here.

## The three selection goals

1. **Tells a story core to Bio 101**
2. **Complete data, or a fragment that is honest by itself.**
3. **Contributes a shape or a function the library does not already have.**
4. **Does it pair with something already in?** Contrast teaches. KcsA earns its place *because* napump is there; GroEL because prion is. Rank pairs above orphans.
5. **When movement is the story, are there two deposited states?** Pairs often help us here. A single apo structure is a portrait; a pair is a mechanism. The `motion?` column answers this and nothing else — a second *state of the same construct*. A related protein, a different species or a bound partner goes in `pairs with`, which is goal 4.
6. **Species consistency.** Half the current library is whale, pig, cow and rat. Not wrong, but if two candidates tie, take the human one.
7. Is the shape beautiful?

## Tier 1 — big story, cheap bake, fills a real hole

**Verified 2026-08-28** against RCSB: every id below was fetched, `.pdb` confirmed to exist, and chains / missing residues / ligands read out of the file itself. `chains` is the asymmetric unit; `gaps` counts unobserved residues per chain (REMARK 465).

| candidate | id | fills | chains (AU) | `does` | motion? | variance? | pairs with | file notes | status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Insulin** | **1MSO** (was 4INS) | signalling; a hormone cut out of a bigger chain | 4 = 2×(A21 + B30) | new: `hormone` | no | no | — | 1.00 Å, **no gaps**, 2 Zn. 4INS is pig at 1.5 Å; 3I40 is one AB dimer if the hexamer is noise | Done |
| **GFP** | 1EMA | the missing β-barrel; how biology is *done* | 1 | new: `reporter` | no | **engineered** — 1EMA is the **S65T** bright mutant, `MUTATION: YES` in the file, not wild-type *Aequorea* GFP | **2POR** — one fold, two problems | selected on **1GFL** and **1BFP**, not 1EMA: the bench is the fold and the dye, and 1GFL is the jellyfish sequence with the chromophore deposited as three ordinary residues. 1EMA and 2WUR were looked at and dropped; the S65T comparison went with 1EMA | Done |
| **Nucleosome** | 1AOI | DNA packaging — the chromatin picture | 8 histone + 2×146 bp DNA | `structural` | no | no | 1ZAA; histone tails (Tier 4) | 2.8 Å, Xenopus. Tails unobserved: H3 18, H3′ 8, H4 4, H2A 1 | Done |
| **Lysozyme** | 1LZ1 | the first enzyme mechanism ever solved | 1 | `enzyme` | no | no — but human lysozyme **amyloid** variants (I56T, D67H) are a real disease pair, not yet priced | **amylase** (held); β-lactamase | 1.5 Å, human, **130/130, no gaps, no ligands** — the cleanest file in the tier. 2LZT etc. are hen, a species contrast not a state | Done |
| **Antibody, intact IgG** | **1HZH** (or 1IGT) | immune recognition; one fold reused six times | 4 (2 heavy 457, 2 light 215) | new: `recognition` | no | no | — | 2.7 Å, **human** IgG1 b12, 13 gaps in one heavy chain, heavy N-glycans. 1IGT is mouse, 2.8 Å, **no gaps** — cleaner file, wrong species |  |
| **Triosephosphate isomerase** | **1HTI** (was 1TIM) | EC class **5, isomerase** — empty; glycolysis | 2 | `enzyme` | no | no | **amylase**, whose catalytic domain is the same barrel | 2.8 Å, human, **no gaps**, PGA inhibitor bound. 1TIM is chicken at 2.5 Å — the fold is named after that file |  |
| **Hexokinase** | 1HKB? / 2YHX? | EC class **2, transferase** — empty | 1–2 | `enzyme` | **yes** — open, glucose-closed | no | — |  | Done |
| **Carbonic anhydrase** | 1CA2 | EC class **4, lyase** — empty; one zinc | 1 | `enzyme` | no | no | **catalase** — both diffusion-limited | 2.0 Å, human, 3 gaps (N-term), 1 Zn | id verified |
| **Lactate dehydrogenase** | **4L4R / 4L4S / 1I10** | EC class **1, oxidoreductase** — empty | 2 / 2 / 8 | `enzyme` | **yes — three states, verified** | no — 4L4R/4L4S/1I10 are one wild-type isozyme | ADH, the other branch | Human **M** isozyme all the way through: **4L4R apo** 2.1 Å, **4L4S + NADH** 2.9 Å, **1I10 + NADH + oxamate** 2.3 Å. A loop closing over the site in three steps. 1I0Z is the **H** isozyme — do not mix the two | id verified |
| **Alcohol dehydrogenase** | **1HET + 8ADH** | the fermentation branch | 2 / 1 | `enzyme` | **yes — verified** | no | LDH; the fermentation lesson | Horse liver both: **1HET holo** 1.15 Å with NAD + 2 Zn, **8ADH apo** 2.4 Å, no gaps. 8ADH's own title is the interdomain motion. Yeast **4W6Z** (2.4 Å, 4 chains) is right for fermentation but has no apo partner verified | id verified, pick organism |
| **Fetal haemoglobin** | 1FDH | the developmental switch | 4 (2α + 2γ) | `oxygen carrier` | no | no — a different gene, not a mutation | **2DN2** — adult deoxy, same state | 2.5 Å, human, deoxy, **no gaps**, 4 HEM | Done |
| **Cytochrome c** | **3ZCF** (was 3CYT) | tiny, ancient, near-identical yeast to human | 4 copies of 1 | new: `electron carrier` | no | no | — | 1.65 Å, **human**, no gaps, HEC covalently attached. 3CYT is tuna and holds oxidised and reduced conformers as chains O and I, but the difference is sub-ångström: a redox pair, not a visible motion | id verified |
| **Zinc finger on DNA** | 1ZAA | sequence-specific DNA reading, smallest package there is | 1 protein (87) + 2 DNA (11 bp) | new: `DNA-binding` | no | no | **1AOI**, **1YSA** | 2.1 Å, Zif268 (mouse), 2 gaps, **3 Zn** — one per finger | Done |
| **Leucine zipper** | 1YSA | the **natural** coiled coil | 2 protein (58) + 2 DNA (20 bp) | new: `DNA-binding` | no | no | **1ZAA**; designed coiled coils (Tier 5) | 2.9 Å, GCN4 (yeast), 1 gap/chain, no ligands. Two HELIX records for the whole file | id verified |
| **Bacterial porin** | 2POR | a **second** β-barrel, membrane-embedded | **1 in the file**; trimer via assembly 1 | new: `transport` | no | no | **1EMA**; napump (held) | 1.8 Å, *Rhodobacter capsulatus*, **no gaps**, 17 SHEET records, C8E detergent belt marks the bilayer. **Porin is an obligate trimer and the asymmetric unit is one third of it** — the pores sit at the subunit interfaces, so a monomer bake draws a barrel and loses what the barrel is doing there. Ferritin's problem, three copies instead of twenty-four | id verified, triaged |
| **Calmodulin** | **1CLL + 1CFD** | a Ca²⁺ switch; one of the largest changes in a small protein | 1 each | new: `sensor` | **yes** — Ca-bound/apo | no | — | 1CLL 1.7 Å x-ray, 4 Ca, 4 gaps; 1CFD **solution NMR**, apo, no gaps. Labelled human and Xenopus — **SEQRES identical at all 148 residues**, so it is one protein twice | id verified |
| **Catalase** | 1DGF | EC class **1** again; diffusion-limited | 4 | `enzyme` | no | no | **1CA2** | 1.5 Å, human erythrocyte, **4×497, no gaps**, 4 HEM + 4 NADPH | id verified |
| **Ferritin** | 1FHA | 24 identical subunits, octahedral — a hollow iron ball built from one part | **1 in the file**; 24 via assembly 1, as 24 models of 1 | new: `storage` | no | no — but 1FHA was **crystallised via engineered contacts**, per its own title | GroEL, the other cage | **human** H ferritin, 2.4 Å, one 183-residue 4-helix bundle, 11 gaps, 1 Fe + 2 Ca. **Not a 24-chain bake** — the cheapest chain in the doc, repeated. Cost is merging 24 models | Done |
| **Chymotrypsin** | **2CGA → 4CHA** | the catalytic triad; digestion — **and a zymogen cut into an enzyme** | 1 → 3 | `enzyme` | **yes — activation, verified** | no (a cut, not a substitution) | **amylase**; prion, for what a cut does to a fold | the demotion reason was thin. Bovine both: **2CGA chymotrypsinogen** 1.8 Å, **one chain of 245, no gaps**, inert; **4CHA α-chymotrypsin** 1.68 Å, the same protein as **three chains (13 / 131 / 97)** held by disulfides after two cuts. The activation is legible as the chain count, which no other pair here can say | id verified |
| **Ras** | **5P21 + 4Q21 + 1AGP + 6OIM** | **signalling — the library transmits nothing.** A switch that is on or off, and the cancer mutation everyone has heard of | 1 each | new: `switch` | **yes — on/off, verified** | G12D held as **1AGP** (same on state as 5P21); G12C + sotorasib as **6OIM** (KRAS, locked off). G12V passed over: 4EFM is state 1, Thr35 off the Mg | **atp-synthase**, the other thing that spends a nucleotide | human both. **5P21 is GppNHp-bound (on) at 1.35 Å, 166 residues, no gaps** — one of the sharpest files in this document. **4Q21 is GDP-bound (off)** at 2.0 Å, modelling 1-168 of a declared 189. **The 20 unobserved are 170-189 and they are not the finding** — that is the C-terminal hypervariable region and the CAAX box, terminal and absent from both files' story; switch I and switch II are fully modelled in each. So this is a superposition pair like hexokinase, not a comparison against missing density. 5P21's own construct declares 166, so the two are comparable over 1-166. **Do not bake 5P21's assembly**: `REMARK 350` calls it dimeric, which is PISA on a crystal contact — Ras signals as a monomer | Done |
| **Superoxide dismutase** | **2C9V + 1AZV** | EC class **1** again, diffusion-limited — a **third** enzyme at that limit; and ALS | 2 each | `enzyme` | no | **yes — 1AZV is the familial ALS mutant G37R**, against 2C9V wild type | **catalase**, **carbonic anhydrase** — all three diffusion-limited | human both. **2C9V is 1.07 Å**, 2×153, no gaps, Cu + Zn. 1AZV is the G37R mutant at 1.9 Å. A disease substitution with its healthy form at atomic resolution, which nothing else in this document offers | id verified |
| **Bacteriorhodopsin** | **1C3W** (not 1BRD) | **the gradient ATP synthase spends.** Light in, protons out | 1 | new: `transport` | no | no | **atp-synthase** — one makes the gradient, the other cashes it; **2POR**, **napump** | 1.55 Å x-ray, *Halobacterium*, **222 residues, no gaps**, retinal (`RET`) plus a lipid belt. **Not 1BRD**, which is a 3.5 Å electron-crystallography model with **71 of 248 unobserved** | id verified |
| **TATA-binding protein** | 1YTB | gene regulation, and **the most violent DNA bend in biology** — about 80° | 2 protein (180) + 2 DNA (29 nt) | new: `DNA-binding` | no | no | **1ZAA**, **1AOI** — three ways of holding DNA | 1.8 Å, yeast, **protein chains complete, no gaps**. A saddle that kinks the duplex, which is a claim one still picture makes. **The mixed-file gate is open** — 1AOI went through it, and triage reports nucleic, mixed and multi-protein all already drawn, so nothing here is new engineering. The bend is still the one real cost: its frame must be a convention, never a PCA, which returns the chord | id verified, triaged |
| **Aspartate transcarbamoylase** | **1RAI + 1D09** | **regulation — the library shows none.** Feedback inhibition: the end product shuts off the first step of its own pathway | 4 in the file (2 catalytic 310 + 2 regulatory 153); **assembly 1 is 3 models → the c₆r₆ holoenzyme** | `enzyme` | **yes — T/R, verified** | no | **hexokinase** — induced fit without allostery; **haemoglobin**, allostery without an enzyme | *E. coli* both. **1RAI is the T state with CTP bound** — the inhibitor is the pathway's own end product, sitting on a regulatory chain 60 Å from the active site — at 2.5 Å, 7 gaps. **1D09 is the R state with PALA** at 2.1 Å, **no gaps**, 2 Zn. The regulatory subunit is the entry: nothing else here has a part whose only job is to say *stop* | id verified |

Every Tier 1 file is x-ray except 1CFD (NMR), every one has legacy `.pdb`, and every one carries HELIX/SHEET records, so the ss read needs nothing new.

**`variance?` is the third axis, beside `motion?` and `pairs with`.** It answers one question: does this entry carry a sequence that differs from the wild-type protein, and is that difference the point or an artefact of getting the crystal? Three of the verified files carry substitutions nobody would guess from the name — GFP's 1EMA is the S65T mutant, KcsA's open state carries six, and 1FHA was crystallised through engineered contacts. A `no` in that column has been checked, not assumed.

**Sickle haemoglobin is done.** The tetramer **is** in `proteins.js`, as `hemoglobin/2HBS`, surface-baked and carrying `state: 'mutant'` since 2026-08-28. What is outstanding is the **fibre**, which the registry header already lists under WHAT IS NOT HERE and which joins the day it has a pipeline the re-bake reaches. Neither is a candidate, and neither belongs in this document except as the thing the R state pairs against.

**Four id changes**, three of them on selection goal 7: insulin 4INS → **1MSO**, TIM 1TIM → **1HTI**, cytochrome c 3CYT → **3ZCF**, and oxy Hb 1HHO → **2DN1** on resolution and chain count.

**2HHB stays.** An earlier draft of this row proposed swapping the held deoxy tetramer for 2DN2 so that T and R came from one study at one resolution. That is wrong from inside the registry: 2HHB's bakes feed `hemoglobin-lab`, a featured lesson, and re-cutting them to gain sharpness a ribbon cannot show is a regression traded for nothing. R is the half that is missing, and 2DN1 is the whole change.

**The cheapest one left is 1LZ1** — one chain, no gaps worth naming. GFP was the second and is done: two structures selected, and the chromophore cost a splice, because the files that fuse residues 65-67 into one residue leave a Ca trace jumping 64 to 68 and the ribbon snapping through the central helix. Insulin was the third and is done: five structures selected, including the storage hexamer, which cost a chain-aware merge of 1MSO's three assembly models.

**Four rows arrived from PDB-101** on 2026-08-29: Ras, superoxide dismutase, bacteriorhodopsin and TBP. Ras is the strongest single candidate in the document — one chain, 1.35 Å, no gaps, a two-state switch, an oncogenic mutant, and the only thing here that would let the collection say what a signal is.

**Two more arrived from Tier 2 on the strength of the verification.** Ferritin was priced at 24 chains and holds one; chymotrypsin was dismissed as a fourth enzyme and is really a zymogen and an enzyme, with the cut between them legible as a chain count. Both are cheap, both fill a hole, and neither reason for keeping them down survived contact with the files.

**The nucleosome is still the highest-value entry, and its engineering cost is now mostly paid.** DNA and RNA chains bake and draw (goal 6 above); what 1AOI still needs is a mixed file in one box, which nothing has done.

**Take 1ZAA first, though.** 1AOI would be the first test of three untested things at once — `chainKinds` on a mixed file, a nucleic branch in `proteinbox.js`, and `runs()` against real chain breaks, since the histone tails are unobserved and H3 alone is missing 18 residues. When those fail together none of them is diagnosable. 1ZAA is the same tier at a twentieth the size, carries all three (87 residues + 11 bp, 2 gaps), and is a lesson in its own right rather than a stepping stone. They are already each other's named pair. Build the small one and 1AOI becomes a content decision instead of an engineering one.

## Tier 2 — strong story, more work

| candidate | id | fills | chains | motion? | variance? | pairs against | why not tier 1 | status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **KcsA K⁺ channel** | 1BL8 (+ **5VK6**) | downhill transport; selectivity | 4 | **yes, with a caveat** | **engineered, heavily** — 5VK6 carries **six** substitutions (A28C, E71A, L90C, R117Q, E118C, E120Q), not the one the name implies | **napump** | needs the bilayer treatment napump already has. Verified: 1BL8 closed 3.2 Å; **5VK6 open 2.25 Å is the E71A mutant and ships with a mouse Fab bound** (2 of its 3 chains) — the open state is not the same molecule alone | id verified |
| **Aquaporin** | 1J4N | water across a membrane | **1 in the file**; tetramer via assembly 1 | no | no | **napump**, **2POR** | 2.2 Å, **bovine** AQP1, 22 gaps, BNG detergent belt. **Species goal loses here**: the human AQP1, 1FQY, is electron crystallography at 3.8 Å with 43 gaps. Story still overlaps KcsA's | id verified |
| **Myosin S1** | **1FMW / 1MMD / 1VOM** (not 2MYS) | muscle; a lever arm that swings | 1 each | **yes — three states, verified** | no — the three states are one construct | **atp-synthase** | the second state exists after all. *Dictyostelium* motor domain, one construct: **1FMW** MgATP 2.15 Å, **1MMD** ADP·BeF₃ 2.0 Å, **1VOM** ADP·vanadate 1.9 Å, 19–32 gaps each. **2MYS is a trap** — chicken S1 at 2.8 Å whose two light chains are **Cα-only**, which renders as a ribbon and is not a structure | id verified |
| **Kinesin** | 1BG2 | walking; the other motor | 1 | **no clean pair** | no | **atp-synthase** | verified: 1BG2 is human motor domain + ADP, 1.8 Å. 3KIN is a rat dimer, 4HNA is kinesin on tubulin with a DARPin — neither is the same construct in a second state. The demotion stands | id verified |
| **Rubisco** | **1RCX + 8RUC** | photosynthesis, absent entirely; most abundant protein on Earth | 16 (8 large + 8 small) / 8 | **yes — activation, verified** | no | **LH2**, if photosynthesis lands | Spinach both: **1RCX non-activated** 2.4 Å with RuBP bound, and **8RUC activated** 1.60 Å with CABP + Mg. The activation is one **carbamylated lysine** — `KCX` appears 48 times in 8RUC and **zero times in 1RCX**, so the difference between the two files is a residue a page can point at, and a checker can assert. Still 16 chains and no lesson waiting | **Done** |
| **GroEL** | 1OEL (+ **1AON**) | folding, chaperoned | **7 in the file**; 14 via assembly 1, as 2 models of 7 | **yes — verified** | no | **prion** | 2.8 Å, *E. coli*, 547 res/chain, 23 gaps each, no ligands. **1AON is the partner state** — GroEL + GroES + 7 ADP, 3.0 Å, 21 chains in one AU, lid on and one ring open | id verified |
| **LH2 light-harvesting ring** | 1NKZ | a circle of chlorophylls on a ring of helices; the symmetry *is* the antenna | **6 in the file** (3 αβ pairs); the 9-fold ring via assembly 1 | no | no | **LHCII 2BHW**, the plant antenna; **PSII 5XNL** | 2.0 Å, *Rhodoblastus acidophilus*, 1 gap/α chain. **The pigments are all in the file** — 594 BCL atoms and 312 carotenoid (RG1), which is the antenna itself and not a garnish. Chains are 53 and 41 residues: two helices per pair, and the ring is symmetry | id verified |
| **PCNA sliding clamp** | **1VYM** (was 1AXC) | a ring threaded *around* DNA | 3 | no | no | DNA polymerase | 1VYM is **native human PCNA**, 2.3 Å, 3×261, 5 gaps/chain, no ligands — the bare ring. 1AXC is the same ring with a 22-residue **p21 peptide** in each site: a binding partner, not a second state | id verified |
| **β-lactamase** | 1BTL | antibiotic resistance: evolution on a human timescale | 1 | no | **wanted, no id yet** — the resistant variant this row asks for is unnamed. TEM-1 (1BTL) is the parent; an extended-spectrum TEM needs picking | **lysozyme** — bacterial wall made and unmade | verified: *E. coli* TEM-1, 1.8 Å, 1 chain. Wants a resistant variant beside it to read | id verified |
| **Antifreeze protein** | 1WFA | binds **ice**, not a molecule — and `water-lab` is a featured lesson about that surface | 2 copies of 1 | no | no | **water-lab's ice**; collagen, the other one-shape protein | 1.7 Å, winter flounder, **38 residues, 1 gap** — the whole protein is a **single α-helix**, two HELIX records for two copies. The smallest entry in the doc by a wide margin, and the bake is trivial; the cost is entirely the ice lattice it has to be shown against | id verified |
| **Nitrogenase** | **1M1N + 1N2C** | the FeMo cofactor — breaking N≡N at room temperature | 8 each | **yes — docking, verified** | no | **atp-synthase** — the other ATP-driven machine | *Azotobacter* both. **1M1N is the MoFe protein alone at 1.16 Å**, the sharpest file anywhere in this doc, carrying FeMo-co (`CFN`) and the P-cluster (`CLF`). **1N2C is the Fe protein docked onto it**, 3.0 Å, frozen mid-cycle by ADP·AlF₄⁻, adding 4 chains and an `SF4` cluster. Still a metal cluster the bake has never met — but at 1.16 Å it would be met properly | id verified |
| **HK97 capsid** | **1OHG** | subunits covalently linked into interlocking rings — protein chainmail | **7 in the file**; the capsid via assembly | no | no | **ferritin** — the other symmetry cage, at ten times the radius | **the format prediction was wrong**: x-ray at 3.45 Å with legacy `.pdb`, and the asymmetric unit is 7 chains, not 60. The 60-fold capsid is symmetry — the same model-merging cost as ferritin, at a much larger radius. Cheaper than this tier assumed | id verified |
| **p53** | 1TUP | the tumour suppressor, and the mutation hotspots that break it | 3 protein (219) + 2 DNA (21 nt) | no | hotspot mutants are the story; no variant id picked yet | **1ZAA**, **1YTB**; the `mutant` axis | 2.2 Å, human, 3 Zn — but it is the **DNA-binding core domain, not full-length p53**, it carries **\~24 gaps per chain**, and only one of the three chains actually grips the duplex. Nucleic-acid gate as well | id verified |
| **Rhodopsin** | 1F88 | **the receptor hole.** A signal crossing a membrane with nothing crossing it | 2 | unverified | no | **napump**, **KcsA**, **2POR** — pump, channel, pore, receptor | 2.8 Å, bovine, retinal bound; **chain B has 43 gaps** where chain A has 10, so one copy is much better than the other. The 7-transmembrane fold is the single most common receptor architecture in the human genome and the library has none | id verified |
| **Proteasome** | **1RYP** (not 1FNT) | destruction, against GroEL's construction — two barrels, opposite jobs | **28, all in the file** | no | no | **GroEL** — the contrast is the entry | 1.9 Å, yeast 20S, no symmetry expansion needed. 1FNT is the same particle with an activator at 3.2 Å and 44 chains. 28 chains for one barrel is the cost, exactly as with GroEL | id verified |
| **Pyruvate dehydrogenase** | **1EAA + 1NI4** | **the bridge between two lessons already built** — glycolysis ends and Krebs begins here | 1 (cube via assembly) / 4 | no | no | **glycolysis-lab**, **krebs-lab** | **1EAA is the E2 catalytic core: one 243-residue chain, no gaps, and assembly 1 is 24 models** — a cube built from one part, the ferritin trick a third time. **1NI4 is human E1** at 1.95 Å with TPP. The story is the assembled complex, which is why this is not Tier 1. Note **2OZL is the S264E phosphomimic**, not wild type | id verified |
| **SNARE complex** | 1SFC | membrane fusion: two bilayers pulled into one | 12 (3 copies of a 4-helix bundle) | no | no | **membrane-lab**; **1YSA**, the other coiled coil | 2.4 Å, rat, and **frayed** — 27 of 96 residues unobserved in the longest chain, 6 to 15 in the others. The bundle is legible, the ends are not | id verified |
| **Keratin** | **6EC0** (not 3TNU) | the fibrous **coiled coil** — skin, and by architecture nail and hair — and the intermediate filament the cytoskeleton row does not reach | 2 (107 + 104) | no | no | **1YSA**, **collagen** — three ways of winding a rope | a **fragment, and honest as one**: the coil-1B heterodimer of human **K1/K10**, 2.98 Å, **2 gaps total**, which is the actual two-chain building block of the filament. 3TNU is the coil-2B fragment and much worse — 41 and 34 gaps. Cd/Co/Ni in the file are crystallisation additives, not biology. The subject is the filament, and a micrograph carries what the file cannot. **NOT HAIR.** K1/K10 is suprabasal **epidermis** — skin. Hair is built from trichocyte ("hard") keratins, K31/K81 and relatives, and **nothing from that family is deposited**: every human keratin structure in the PDB is epidermal (K1/K10, K5/K14, K17). The coiled-coil architecture is shared, so this fragment can carry a claim about how a keratin filament is wound; it cannot carry a claim about hair without saying which protein it actually is | id verified |
| **Silk** | **3LR2 + 2KHM** | the fibre everyone knows, and **the switch that decides when it forms** | 2 each | **yes — pH-triggered, per 3LR2's own title** | no | **prion's fibril** (6LNI), which is the cross-β the silk core would be; **collagen** | the honest version of this row: **the β-sheet core is not deposited anywhere** — it is repetitive and crystalline, and the PDB holds only the terminal domains. **3LR2 is the N-terminal domain at 1.7 Å**, \~10 gaps, and **all-helical: zero SHEET records**. 2KHM is the C-terminal domain by NMR, 2×140, also helical. So what is on offer is the two ends that control assembly, not the middle that is the material | id verified |

**Verifying this tier emptied part of it.** Ferritin and chymotrypsin were promoted to Tier 1, HK97 arrived from Tier 3, and the clathrin cage was ruled out. What moved them was the deposition record, not a change of mind about the story.

**It also killed two demotion reasons.** Chymotrypsin was down here as "a fourth enzyme in a library of three"; it is really a zymogen and an enzyme, and the cut between them is visible as a chain count. Rubisco was down here for 16 chains; it still has them, but its activation turns out to be one carbamylated lysine present in one file and absent in the other. Myosin was demoted for wanting a second state, and has three. What is left holding this tier down is chain count and missing lessons, which are honest reasons, rather than gaps in the deposition record.

The pairings are the argument. KcsA earns its place *because* napump is already registered — channel against pump, downhill against paid-for, on one bench — in a way it would not earn standing alone. Same for GroEL against prion: folding helped, next to folding gone wrong.

Myosin is built (`myosin5`, above), and its morph is the second consumer that makes `setMorph` owed. Kinesin and myosin were never the same bet, though: **myosin's second state exists and kinesin's does not.** The *Dictyostelium* motor domain is deposited in three nucleotide states of one construct, all under 2.2 Å, so a lever-arm tween is a matter of choosing two of them. Kinesin's only partners change the composition — a dimer, or the motor on tubulin — so there is nothing to tween against.

## Myosin beyond the motor domain (2026-10-05)

Triaged with `triage.js`. Myosin S1 (Tier 2) stays the cheapest way to show the lever; these are what it leaves out: the filament it lives in, the off switch, and a motor that walks.

| candidate | id | fills | chains | motion? | file notes | status |
| --- | --- | --- | --- | --- | --- | --- |
| **Actomyosin V, on actin** | **7PLU + 7PM6** | the power stroke **on the track**: myosin bound to an actin filament, lever before and after ADP release | 10 each (2 myosin V + 2 ELC + 3 actin + 3 jasplakinolide) | **yes: rigor / strong-ADP, one construct** | chicken myosin Va motor + 1 IQ, rabbit actin; EM 3.2 / 3.0 Å, legacy `.pdb`. Myosin 747/792, actin 372/377. **H, I, J are jasplakinolide**, a cyclic peptide drug that holds the filament still, not protein; drop them. Actin carries **HIC** (methylhistidine) as MODRES: pass `modResidues`. Only one IQ of six, so the lever is a stub; the walk is a caption, the swing is measured | **Done** (`myosin5`): 7PLU default, 7PM6 fitted by actin, 4ZG4 as deposited; the bench animates 4ZG4→7PM6→7PLU |
| **Myosin V motor, crystal** | 1OE9 + 1W7J | the same motor off actin: nucleotide-free vs ADP·BeFₓ | 2 each | yes | chicken, x-ray 2.05 / 2.0 Å, 6 breaks in 1OE9. Sharper than the EM pair and **without the track**, which is the part that teaches | not needed: 7PM6/7PLU carry the track. Take only if a lesson wants the head alone at 2 Å |
| **Full myosin II, switched off** | **7MF3** | the whole molecule, two heads folded back onto their own tail: how smooth muscle stops | 8 (2 heavy, 4 light, 2 tail segments) | **no on-state deposited**; off only | chicken gizzard, EM **3.4 Å**, ADP·Pi in both heads. **Heavy chain modelled 29-949 plus tail 1412-1623 of 1978**: the heads and one fold of the rod, not the whole rod. 6Z47 is the same state at 6.3 Å | id verified, triaged |
| **Cardiac myosin, off state** | **8ACT** | the same folded-back motif in the **human heart**, the target of mavacamten (approved 2022) | 6 (2 heavy to res 906, 2 ELC, 2 RLC) | no | human β-cardiac, EM 3.6 Å, 95-97% modelled of a **heads + short S2 construct**. **M3L** (trimethyl-lysine) as MODRES | id verified, triaged |
| **Thick filament, human heart** | 8G4L | the filament: myosin rods packed into a rope, heads on the outside, titin and MyBP-C along it | **123** | no | EM **6.4 Å**, mmCIF only. Coarse but a filament, not an envelope. Price after 7MF3 | id verified |

**Ruled out:** 3JBH, 5TBY, 3J04, 1I84 (20 Å envelopes and homology models: the clathrin reason). 8Q6T (18 Å, in situ).

**Built: `myosin5`.** What it found that the next myosin should start from:

* **No myosin V pre-stroke on actin is deposited.** The bench's big swing borrows **4ZG4** (human Vc, off actin, chain stops at the converter at Vc 754), placed by the rigid block carrying its actin face and with 7PM6's lever carried on the converter. Measured with the motor held: Pi release 67.7°, ADP release 12.5°. A deposited pre-stroke on actin replaces all three modelling steps the day one appears.
* **The lever starts at the converter, residue 693 in Va, measured** off the swing rather than typed. Any myosin morph should find it the same way (`myosin5/tools/prep.js`, `isLever`).
* **The palette and the word are set**: `does: 'motor'`, myosin deep green, lever azure (atp-synthase's "what turns"), light chain tan, actin grey. 7MF3 and 8ACT should reuse it, with one new tone for the regulatory light chain.
* **A clean single-construct stroke exists, off actin.** The *Dictyostelium* S1 row in Tier 2 (1VOM ADP·Vi pre-stroke, 1FMW, 1MMD) is one construct in three states, so its stroke needs no isoform or carried-lever caveat. It lacks the track and most of the lever. Worth a variant on `myosin5`'s bench only if the caveats read as too heavy.

**Next: 7MF3**, one molecule doing nothing on purpose: a regulation story beside ATCase, and the answer to what the rest of myosin II looks like. Static, so no morph. **8ACT** is its human, drug-relevant twin (mavacamten holds this state), and the pair is a species/tissue contrast on one motif. 8G4L after both.

### Owed: `Proteinbox.setMorph`

Two pages now hand-build one player: `hexokinase/closure-test.html` and `myosin5/myosin5-test.html` each cache a ribbon per baked keyframe, lerp vertex arrays between them, and colour vertices by nearest residue. Promote it into `kit/proteinbox.js` as `box.setMorph({frames, ss, brk, part, colors})` with `seek(t)`. It would also let the box frame the whole sweep itself (myosin5 passes `focus()` a hand-sized sphere, `FILL`), and give the next two-state protein (CFTR, glycogen phosphorylase, the S1 row) a stroke for free. Cost: a shared-module change, re-testing the closure bench, and moving both pages onto it. Modules.md's rule says promote at the second consumer; this is it.

## Photosynthesis — the rest of the chain

**Verified 2026-10-04** against RCSB: id, title, method, resolution, chain count and source organism read from the entry, and legacy `.pdb` confirmed for every row. **Not triaged**: gaps and ligands are unread, so run `triage.js` before a baker.

Already in: **PSII 5XNL, b6f 7QRM, PSI 5L8R** (`proteins/photosystems/`, with the lineup), **chloroplast ATP synthase 6FKF** (a variant of `atp-synthase`), **rubisco**. Plant structures throughout, because the lessons are set in a chloroplast. The cyanobacterial alternatives are sharper and stay noted, not chosen.

| candidate | id | fills | chains | motion? | pairs with | file notes | status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Plastocyanin** | 1AG6 | the carrier from b6f to PSI; one copper | 1 | no | **b6f**, **PSI** — the lineup's lumen-side shuttle; **cytochrome c**, the same job in the mitochondrion | spinach, x-ray 1.6 Å. Cu site wants a pocket. Cheapest row here | id verified |
| **Ferredoxin + FNR** | **1GAQ** (or 1A70 + 1FNB) | PSI to NADPH: the last two steps of the chain | 3 (complex) | no | **PSI** — the stroma-side shuttle and the enzyme it feeds | maize complex, x-ray 2.59 Å, Fe₂S₂ and FAD caught at the hand-over. Spinach apart: **1A70** ferredoxin 1.7 Å, **1FNB** FNR 1.7 Å | id verified |
| **LHCII trimer** | **2BHW** (or 1RWT) | the antenna unit alone, pigments included | 3 | no | **PSII 5XNL**, which is mostly this; **LH2** (Tier 2), the bacterial ring | pea, x-ray 2.5 Å. **1RWT** is spinach at 2.72 Å with 10 chains | id verified |
| **Phosphoribulokinase** | 6H7H | the Calvin step that remakes RuBP, switched off in the dark | 2 | redox switch, no pair picked | **rubisco**, which uses what it makes | *Arabidopsis*, x-ray 2.47 Å | id verified |
| **Chloroplast GAPDH** | 2PKQ | the Calvin step that spends NADPH | 6 in the file | no | **rubisco**; glycolysis-lab's GAPDH step, run backwards | spinach A₂B₂, x-ray **3.6 Å** — coarse | id verified |
| **Rubisco activase** | 3T15 (or 6Z1F) | the chaperone that unjams rubisco | 1 / 22 | no | **rubisco** | **3T15** tobacco, x-ray 2.95 Å, one subunit. **6Z1F** is activase on rubisco, EM 2.86 Å, but cyanobacterial (*Nostoc*) | id verified |
| **PEP carboxylase, C4** | 1JQO (or 5VYJ) | how C4 plants get around rubisco's oxygen mistake | 2 / 4 | no | **rubisco** | maize C4 isoform, x-ray 3.0 Å. **5VYJ** is maize at 3.3 Å, 4 chains | id verified |
| **Chloroplast ATP synthase, states 2 and 3** | 6FKH + 6FKI | the rotor stopped at two more angles: the spin, measured, as the human enzyme's is | 26 each | **yes** | **6FKF**, already a variant | spinach, EM 4.2 / 4.3 Å. Only if a lesson wants the chloroplast enzyme to turn | id verified |
| **Cyanobacterial PSII** | 3WU2 | the Mn₄CaO₅ cluster at 1.9 Å, the sharpest PSII looked at | 38 | no | **5XNL** | *T. vulcanus*, x-ray 1.9 Å, no LHCII. The one to come back for if a lesson zooms in on water splitting | id verified |

Ranked by what finishes a story first: **plastocyanin and ferredoxin + FNR** put every protein an electron touches, water to NADPH, in the lineup. **LHCII** is the antenna at a size a ribbon can read. The Calvin rows wait for a lesson that asks for them.

## Large assemblies, repriced (2026-10-05)

**Size stopped being a cost.** PSII (5XNL), b6f and PSI render fine, and `cif-lib.js` reads mmCIF, so neither chain count nor the legacy format gates anything. This second pass over PDB-101 (all 322 entries, ids taken from each article) keeps what the first pass passed over for size. Id, method, resolution and chain count read from RCSB; **not triaged**.

| candidate | id | fills | chains | motion? | pairs with | file notes | MOTM |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Ribosome, human 80S** | **6Y0G** (or 4V6X) | translation: the central dogma's missing third | 83 | PRE state; POST pair not picked | **tRNA**, **polymerase**, aaRS (Tier 3) | EM 3.2 Å, mmCIF only. 4V6X is 5.0 Å. RNA most of the mass, so the nucleic drawer carries it | 10, 121, 295 |
| **Cytochrome c oxidase** | **1V54 + 1V55** | Complex IV: O₂ becomes water. The ETC's end | 26 each | **yes: oxidised / reduced** | **cytc**, **atp-synthase**, Complex I (Tier 3) | bovine x-ray **1.8 / 1.9 Å**, legacy `.pdb`. Sharp for 26 chains. 1OCO is the CO-bound state | 5 |
| **Cytochrome bc1** | **1BGY** | Complex III, Q cycle | 22 | no | **b6f**, its chloroplast twin, already in | bovine x-ray 3.0 Å. 1BE3 is the same at 11 chains | 137 |
| **Respiratory supercomplex** | **5XTH** | I + III₂ + IV as one object: the whole ETC in the membrane | 80 | no | the three rows above, **atp-synthase** | human EM 3.9 Å, mmCIF only. The lineup PSII/b6f/PSI gave photosynthesis, for respiration | 273 |
| **Citrate synthase** | **1CTS + 2CTS** | Krebs step 1, and induced fit at domain scale | 1 each | **yes: open / closed** | **hexokinase**'s closing; **krebs-lab** | pig, x-ray 2.7 / 2.0 Å, one paper. **Cheapest row here** and the only Krebs enzyme with a lesson waiting | 93 |
| **RNA polymerase II** | **1I6H** | transcription caught in the act: DNA in, RNA out | 12 (10 protein + DNA + RNA) | no | **polymerase** (Taq), **TBP 1YTB** | yeast x-ray 3.3 Å, legacy `.pdb`. Mixed file | 40 |
| **Viruses: rhinovirus + TMV + ϕX174** | **4RHV**, **2TMV**, **1CD3** | three geometries: icosahedron, helix, procapsid | 4 / 2 / 7 in AU; full particle via assembly | no | **ferritin**, **HK97** | x-ray 3.0 / 2.9 / 3.5 Å, all legacy. **The ferritin trick at 60× and 2130×**: small AU, biology in the assembly. 2TMV is fibre diffraction and carries its RNA. Common cold is the hook | 20, 109, 2, 200 |
| **HIV capsid** | 3J3Q | a cone built from one protein, hexamers + 12 pentamers | **1356** | no | the icosahedral viruses | EM, mmCIF only, 313k residues. **The real size test**; price after one icosahedron | 163 |
| **Flagellar motor** | 8UOX | a rotary motor that is not ATP synthase, ion-driven | 204 | **CW / CCW locked states** | **atp-synthase** | *Salmonella* EM 4.6 Å, mmCIF. Students' favourite machine. Pick the partner state from MOTM 300's list (8UCS, 8UPL) | 300 |
| **CFTR** | **5UAK + 6MSM** | cystic fibrosis: a channel that is an ABC pump | 2 each | **yes: off (dephos, no ATP) / on** | **napump**, KcsA | human EM 3.9 / 3.2 Å, legacy `.pdb`. One genetic disease every Bio 101 text names | 293 |
| **Glycogen phosphorylase** | **1GPA** (a) + **8GPB** (b) | allosteric + phosphorylation control on one enzyme | 4 / 1 | **yes, per 1GPA's title** | **ATCase**, haemoglobin | rabbit x-ray. 8GPB not yet read | 24 |
| **GLUT1** | 4PYP | how glucose gets into the cell glycolysis starts in | 1 | no | **hexokinase**, the next step | human x-ray 3.2 Å | 208 |
| **lac repressor on DNA** | 1EFA | the operon, Bio 101's gene-regulation example | 5 | no; IPTG-bound partner in MOTM 39 (1TLF) | **zif268**, **1YTB** | *E. coli* x-ray 2.6 Å | 39 |
| **HIV protease + drug** | 1HSG | structure-based drug design's first win | 2 | no | **ras/6OIM**, the other drug in a pocket | x-ray 2.0 Å, saquinavir-class inhibitor | 6 |

**Ruled out on this pass:** nuclear pore 5IJN (21 Å, an envelope; the clathrin reason), V-ATPase 5VOX (6.8 Å), injectisome 7AH9 (flagellar motor tells the same story better), microtubule 3J2U (10.8 Å; 1JFF stays the tubulin row).

**Build order.** Citrate synthase first: one chain, a two-state motion, and krebs-lab is waiting. Then **1V54/1V55**: Complex IV at 1.8 Å closes the ETC with cytochrome c already held, and is the redox pair cytc's own entry could not show. Then **rhinovirus**, because no virus is in the library and the bake is ferritin's. The ribosome is the most important missing object in Bio 101 and is now only a content decision.

**MOTM 321-322 (new since the August sweep)** added nothing: biofilms and an anniversary retrospective.

## Tier 3 — expensive, price before committing

| candidate | id | fills | scale | motion? | variance? | the cost | status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Complex I** | **5XTD** | the ETC lesson already queued | **45 chains**, cryo-EM 3.7 Å | no pair verified | no | the guess was right, and better than it looks: 5XTD is **human**, and **legacy `.pdb` exists** despite 45 chains. Still the stator-fit and label-travel traps `atp-synthase/tools/prep.js` documents, so its baker starts from that file. 5LDW is the mammalian class-1 equivalent at 4.27 Å if a second state is ever wanted | id verified |
| **DNA polymerase** | **4KTQ + 3KTQ** (was 1TAU) | replication; the hand-shaped fold | 1 + DNA each | **yes — verified** | no — 4KTQ/3KTQ are one construct | DNA pipeline. The two-state story is found: Taq large fragment, **4KTQ open binary** 2.5 Å (primer/template only) and **3KTQ closed ternary** 2.3 Å (ddNTP caught in the site), each 1 protein + 2 DNA chains, essentially no gaps. The fingers close between them | id verified |
| **Ribosome** | 4V6X | translation | **89 chains**, cryo-EM 5.0 Å | unverified | no | **Gate gone: `cif-lib.js` reads mmCIF; see Large assemblies, 6Y0G.** Was: the mmCIF gate is real and it is general.** 4V6X (human 80S) has no legacy `.pdb`, and neither do 4V4Q (*E. coli*, x-ray 3.46 Å), 6ZSG or 7A5F (human mitoribosome). Every ribosome probed returns 404. This is the one row whose format prediction held | id verified |
| **Aminoacyl-tRNA synthetase** | **1FFY + 1ASY** | EC class **6, ligase** — empty | 2 / 4 | no | no | ids found, and better as a pair than as one: **1FFY** is IleRS with its tRNA, **class I**, 2.2 Å; **1ASY** is yeast AspRS with its tRNA, **class II**, 2.9 Å. Two unrelated folds evolved to do one job — Tier 5's Neo-2/15 argument, made by nature. Both carry legacy `.pdb`. Still the RNA pipeline gate; **1EHZ** (yeast tRNA-Phe alone, 1.93 Å) is the cheapest way to price it | id verified |
| **Tubulin / actin** | 1JFF / **1J6Z** (not 1ATN) | cytoskeleton; a polymer that is not collagen | 2 / **1** | no | no | **1ATN is not actin** — it is actin bound to **DNase I**, and the second chain is the nuclease. Uncomplexed actin is **1J6Z, 1.54 Å, one chain**: cheaper and honest. 1JFF is αβ tubulin from zinc-induced sheets, **electron crystallography** at 3.5 Å. The subject is still the filament, not the file | id verified |
| **CRISPR-Cas9** | 5F9R | humans engineering biology | 4 (1 protein + sgRNA + 2 DNA) | unverified | no | verified: *S. pyogenes* Cas9, x-ray 3.4 Å, legacy `.pdb` present. RNA *and* DNA in one file, so it clears the same gate as DNA polymerase and nothing more | id verified |

**This tier's format predictions were mostly wrong, and wrong in the cheap direction.** The ribosome really is mmCIF-only — every ribosome id probed returns 404 for `.pdb`, so the gate is general and not a quirk of 4V6X. But **Complex I has legacy `.pdb` at 45 chains**, and so do HK97 and the clathrin cage, both of which this tier assumed were mmCIF. Two of the three "too big for the format" rows were not.

What actually gates this tier is therefore narrower than it looked: **mixed protein/nucleic files in one box** (DNA polymerase, Cas9, the synthetases, the ribosome — the nucleic acid itself now bakes and draws, see goal 6) and **resolution** (clathrin at 7.9 Å is an envelope). Chain count and file format turn out to gate almost nothing, because the large assemblies deposit a small asymmetric unit and generate the rest by symmetry — the same trick ferritin plays, which is now the third row in this document to be repriced by it.

Complex I is the one with a schedule behind it: fermentation and the ETC are queued, and Complex I is the ETC's largest single object. It will hit both traps `atp-synthase/tools/prep.js` already documents — fitting on a pseudo-symmetric region, and chain labels that travel with the moving part — so its baker should start from that file rather than from scratch.

## Additions to proteins already held

Not candidates. Every row above competes for a slot in a collection of nine; these compete for nothing, because the protein is already registered, the bench already exists and the cost lives in that protein's own pipeline. Ranking them against GFP was a category error, which is why they are out of the tiers.

| entry | adds | id | motion? | the cost | status |
| --- | --- | --- | --- | --- | --- |
| **hemoglobin** | the **R** state, against the held deoxy T | **2DN1** (not 2DN2) | **yes** — oxy against held deoxy | 1.25 Å, human, 1 gap/chain, 4 HEM + 8 **OXY**. **Do not take 2DN2**: it is deoxy and duplicates 2HHB, whose bakes feed a featured lesson (`2HHB-B.fold.bin`, the surface the sickle contact needs), and 1.74 Å against 1.25 Å is invisible on a Cα ribbon. The work is that **assembly 1 arrives as 2 models each carrying chains A and B** — something must expand and rename to A,B,C,D before a quaternary bake, which `hemoglobin/tools/` has never done. Gets **no `state` field**: oxy/deoxy is a ligand state | id verified |
| **prion** | the N-terminal half nobody can see — 1QLZ models **104 of 210** — and the copper sites in it, which is why `does` is `unknown` | P04156, AlphaFold | no | a predicted entry beside two measured ones, in the entry that already holds the collection's healthy/disease pair. The hole is recorded in `read` already, so the claim it fills is written down | **take**, per Tier 4 |

## Tier 4 — predicted Alphafold

keyed on **the hole** rather than on the protein. Verdict included so ruled-out candidates stay visible instead of being re-proposed.

| the hole | measured now | id | what prediction adds | pairs against | verdict | status |
| --- | --- | --- | --- | --- | --- | --- |
| **Histone tails** | 1AOI, tails absent | P0C0S8 etc. | the parts the chromatin story is entirely about | nucleosome, if it lands | **take, with it** |  |
| **α-synuclein monomer** | nothing deposited | P37840 | low pLDDT *as the finding* — the model reporting there is no answer | its own fibrils (2N0A, 6H6B); prion | **hold** — strong, but it's a new protein, not a hole in one we have |  |
| **Full-length collagen** | 3HR2, 5.2 Å envelope | P02452 | atomic detail across 3016 Å | collagen's six | **no** — long PPII trimers are a known weak case; a confident wrong rope |  |
| **Sickle Hb, E6V** | 2HBS, measured | P68871 | *nothing* — returns normal haemoglobin | 2HHB / 2HBS | **no, and say so** — the calibration case |  |
| **napump, the other door** | 7E1Z + 7E20, both measured | P05023 | one state, chosen by training data | E1/E2 | **no** — prediction flattens exactly what the pair teaches |  |

Basic lesson: The bottom three rows are the section's real work. A collection that only shows prediction succeeding teaches that it's a substitute for measurement; these three are cases where you hold the measured answer and prediction is confidently wrong, so the distinction `method` draws becomes something a reader can check rather than something a comment asserts.

Two rows to take, one to hold, three that exist to be refused.

Then the section changes character: it's no longer "a predicted entry when we're forced," it's **a section about how structures get made** — which is a current topic with a 2024 Nobel behind it (Baker for design; Hassabis and Jumper for AlphaFold).

That reframes what belongs in it. The best entries aren't proteins that happen to lack a structure — they're proteins where **the method is the story**.

| entry | id | the claim it carries | method | why it's in this section | status |
| --- | --- | --- | --- | --- | --- |
| **A nucleoporin** (Y-complex member) | AF, id TBC | prediction supplying parts measurement couldn't trace | `predicted` | the NPC scaffold, 2022 — high pLDDT, no crystal structure, docked into cryo-EM density. The best-documented win there is |  |
| **Top7** | 1QYS | a fold that occurs in no gene, designed then solved | x-ray | the design half of the Nobel, and the library's only structure of something that was **imagined before it existed** |  |
| **α-synuclein monomer** | P37840 | low pLDDT *as the answer*— the model reporting there is nothing to report | `predicted` | disorder is \~30% of the human proteome and the library currently implies it doesn't exist |  |
| **A matched pair** — one protein you already hold, predicted | P02185 (myoglobin) | the same molecule, twice, by two methods | `predicted` | the calibration. Without it the section is anecdotes |  |
| **Sickle Hb, predicted** | P68871 | prediction returning normal haemoglobin for the mutation the library is about | `predicted` | the failure you can check against 2HBS, which you already hold |  |

**Top7 is the one I'd argue hardest for.** It's a measured x-ray structure, so it costs nothing unusual to bake — but it's a protein that was designed on a computer in 2003, then made, then crystallised, and the structure matched the design at \~1.2 Å. Nothing else in the collection is a molecule that didn't exist until someone specified it. Next to seven proteins that evolution wrote, it's the sharpest possible statement of what changed.

The nucleoporin is the strongest *prediction* case but I can't name the right subunit with confidence — that needs checking against the 2022 papers before it goes in the doc as anything but a placeholder.

And the two bottom rows are what keep the section honest: one case where prediction matches measurement almost exactly, one where it's confidently wrong about a molecule you hold the truth for.

## Tier 5 — designed by humans

Ranked by how much biology they teach rather than by how impressive they are. Ids are from memory and need checking.

| protein | id | year | what a student gets from it | pairs against | status |
| --- | --- | --- | --- | --- | --- |
| **Top7** | 1QYS | 2003 | proof the inverse problem is solvable: a fold chosen on a screen, made, crystallised, and it matched at \~1.2 Å | everything — it's the baseline claim |  |
| **Designed fluorescent β-barrel**(mFAP) | TBC | 2018 | nature's barrel and a designed one doing the same job by different means | **GFP**, if it lands |  |
| **Neoleukin-2/15** | TBC | 2019 | same function as IL-2, *no sequence relation to it* — function follows shape, not ancestry | the whole homology assumption |  |
| **Kemp eliminase**(KE07/KE59) | TBC | 2008 | designed enzymes start terrible; directed evolution improved them \~10⁵-fold | **rnase, amylase** — natural enzymes that are superb |  |
| **Designed nanocage vaccine** (I53-50) | TBC | 2016–21 | self-assembly, and design reaching an approved medicine | — |  |
| **Designed coiled coils** (Harbury) | 1GCM etc. | 1993 | why two, three or four helices wrap — the packing rules, made testable | fills the library's **missing coiled coil** |  |
| **Designed TIM barrel** (sTIM11) | TBC | 2016 | **exact** symmetry where nature's is only pseudo — a billion years of drift, removed | **amylase**, whose catalytic domain is a natural TIM barrel |  |
| **Designed β-propeller** | TBC | 2015–17 | the same argument on a pinwheel | a natural propeller, not yet held |  |

**The two I'd actually build first:**

**Top7**, because without it nothing else in the section has a floor. It's one chain, \~93 residues, measured x-ray, and its entire meaning is that the fold appears in no genome.

**The Kemp eliminase**, because it's the honest one. Design produced a catalyst about a millionth as good as a natural enzyme; laboratory evolution then fixed what design couldn't. Set against amylase and RNase A — two enzymes that are extraordinarily good at their jobs — it says something true and unflattering that a section of triumphs would hide: humans can specify a *shape* well and a *catalytic site* badly, and the gap between those two is where the field actually is.

**Neo-2/15 is the biggest idea** on the list and the hardest to show. That two molecules with no common ancestor and no sequence similarity do the same job is a genuinely deep point about what a protein *is* — but it needs IL-2 alongside it to read at all, so it's a two-entry commitment.

The coiled coils are the cheapest win: tiny structures, well-solved, and they close a fold gap while teaching the one folding rule students can actually predict from a sequence.

## Ruled out, and why

When a candidate is dropped it moves here with the reason, so it is not re-proposed six months later on the same merits.

| candidate | id | why it was proposed | why it is out |
| --- | --- | --- | --- |
| **Clathrin cage** | 1XI4 | triskelions self-assembling into a soccer ball, and a leg that is floppy where the cage is exact | **7.9 Å.** Verified 2026-08-28: legacy `.pdb` exists and the deposit is 18 chains, not the 100+ this list assumed — so it is neither huge nor expensive. It is a backbone envelope, and the collection's whole claim is measured detail a reader can point at. Drawn beside a 1.2 Å file it would teach that those are the same kind of thing. Revisit only on a sharper deposition, not on a cheaper bake |
