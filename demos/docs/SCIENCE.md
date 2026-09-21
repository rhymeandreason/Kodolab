<!-- KIND: rulebook — load whole before adding a molecule, changing geometry, or changing what a motion implies happened. -->

# Scientific Accuracy Rules

The rulebook for every page. §§2–3 are chemistry (polarity, covalent bonding),
§4 is rendering caveats, and the last section is what a motion may imply.
Water/solvation physics lives in `WaterSim.md` (solvation apps only). Module architecture — what's shared and what stays local — lives
in `Modules.md`.

**Read `MolecularGeometry.md` §1.1–§1.6 before adding or converting any molecule
spec** — angles, bond lengths, geometry sources, stereochemistry. It moved out
for length, not because it's optional. Check these rules before shipping a new
molecule, a geometry change, or a motion that implies a bond formed/broke or a
charge moved; polish on an already-reviewed animation (timing, easing, camera)
doesn't need it.

> **Accuracy comes from the coordinates and the forces, not from the rendering
> library.** A pretty render of wrong geometry is still wrong. Compute real
> positions and interactions rather than eyeballing them.

---

## 2. Polarity & charge

- Oxygen is **more electronegative** → it carries **δ−**; each hydrogen **δ+**.
- The **dipole points toward oxygen**, and the electron cloud is drawn **shifted
  toward O**, never symmetric.
- `molecule-builder.html` draws this three ways from one per-recipe `polar`
  weight — a stylised electronegativity difference, **not** a dipole moment (O–H
  1.24 → `1`, N–H 0.84 → `0.7`, C–H 0.35 → `0`): the shared pair sits **off-centre
  toward the core**, each atom gets a **δ−/δ+ badge**, and the ligand's cloud
  **leans back** along its bond. The offset stays small on purpose — pushed far
  enough to bury the pair in the core, it reads as *transferred*, i.e. ionic.
- **Methane is the control.** `polar: 0` means centred pairs and no badges, so
  "shared" in the water tab and "shared" in the methane tab are visibly not the
  same word.

## 3. Electrons & covalent bonding

- A **covalent bond = a shared pair**, one electron from each atom. Draw it as a
  pair, not a dot or a plain stick, when the lesson is about electrons.
- Oxygen has **two bonding pairs and two lone pairs** (4 domains,
  tetrahedral-ish). Show both lone pairs whenever O's electrons are depicted.
- Bonding pairs sit **closer to O**, consistent with the δ−/δ+ story.
- **Double bonds are two sticks, never one.** A bond entry's optional third
  element is the bond order, so `[i,j,2]` renders as a pair of thinner cylinders.
  Every C=O in the library is tagged: CO₂, carbonic acid, bicarbonate, the
  amino-acid carboxyls, the glycolysis carbonyls.
- **Splay direction matters.** With a neighbouring bond, the offset comes from
  the plane those two bonds define so both sticks read head-on. A **linear**
  molecule (CO₂) has no such plane, so the fallback offsets *across* the view —
  otherwise one stick hides behind the other and a double bond reads as single.
- **An electron wears its own atom's colour** (`molecule-builder.html`), so a
  shared pair is **one dot of each colour** and ownership needs no legend. Cost:
  a red dot lands on a red sphere, so every dot carries an ink ring — without it
  the shared pair vanishes into the oxygen exactly when it matters.
- **A LONE PAIR IS THE EXCEPTION** (`lobes/lobes.js`): one blue for every
  element, greyed when conjugated. A dot's colour answers *whose electron this
  is* — the point of a shared pair being one of each. A lobe is not asking that;
  it is asking *can a donor point here*, so it wears the H-bond's colour
  instead. Tinting by element would also put red ears on water and blue ones on
  adenine, which is the **orbital phase convention**, and the sign a student
  would infer is backwards — a lone pair is the δ− end. The hexes and the
  reason they are two keys live in `palette.js`.
- **A dative bond is two dots of the DONOR's colour.** In NH₃ + H⁺ → NH₄⁺ nitrogen
  supplies both electrons, so there's no second colour; the proton is drawn with
  **no dot at all** and a `+`, because that's what a proton is. Once formed the
  four N–H bonds are identical and the ion carries a **whole +1** — every δ badge
  comes off, since four δ+ would assert partial charges that sum to one.
- **P=O stays a single stick.** Phosphate's charge is delocalised over the
  oxygens; doubling one asserts a localisation that isn't there. Same reasoning
  as drawing bicarbonate's two bare O's identically.

## 4. Rendering caveats

- **WebGL ignores line width** — thin `THREE.Line` H-bonds are invisible and get
  occluded. Bonds that must be *seen* are thin cylinders.
- Prefer **real computed coordinates** for any crystal/lattice/geometry claim.
  Where a record exists, convert it (`tools/sdf2spec.js`) — the amino acids
  carried impossible bond angles for as long as they were hand-written.
- Keep pedagogical exaggerations (enlarged bonds, spacing for legibility)
  **explicit in comments** so they aren't read as to-scale facts.
- **Mixed conventions are fine, but label them.** Every spec is real ångströms
  now, but not every one is a real conformer: the amino acids are PubChem 3D,
  the glycolysis set is built from VSEPR angles and measured lengths, and some
  are deliberately flat (z=0). Don't infer a spec's style from its neighbours —
  read the comment above it.
- A stick only shows if the bond is **longer than the two display radii
  combined**. A rendering constraint, not chemistry, and why lengths get scaled
  up. `check-molecules.js` is the guard.

---

---

## 5. Effects

**What a motion is allowed to imply** is §§2-4's business and stays here: a
bond drawn breaking is a claim that a bond broke. HOW the effect is drawn —
`fx.js`'s primitives, which event gets which ring, and the colour language — is
a page convention rather than a chemical rule, and lives in `Modules.md`
under "Effects (`fx.js`)".

A machine's motion (a rotor, a pump, a particle's route) is `Animation.md`.

**Intensity tracks the chemistry.** Bonds breaking or forming get the full
shockwave-and-sparks; **hydration** (no bonds broken, identity unchanged) gets a
soft shimmer; a solute where **nothing happens** stays silent. Never dramatize a
non-event — an animation on plain dissolving implies a reaction that didn't
occur, and methane's silence is itself the lesson about nonpolar solutes.
