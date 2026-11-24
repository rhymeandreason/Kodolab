# Lab prop catalog

The props in five prototypes (Ecoli, EggLab, OnionRoot, Photosynthesis, Strawberry), sorted into
reusable library props. Strawberry2 is left out.

**Scale.** 1 unit = 1 cm, bench top at y = 0, +y up, +z toward the viewer. `Lab/` already uses this,
and so do Photosynthesis and Strawberry. Ecoli (about 1 unit = 5.5 cm), EggLab and OnionRoot use their own
stylized units, so their props need rescaling to real sizes. The defaults below are real-world sizes.

**Legend.** ✅ already in `Lab/props` (built from Photosynthesis or Strawberry) · ◐ in Lab, but other
prototypes have variants to merge in · blank = not built yet. This file is the spec; for what's built,
[CATALOG.md](CATALOG.md) has the up-to-date status. Each section's props live in one file
in `Lab/props/` (see the Conventions table in the README).

**Conventions for every prop** (Lab already follows these):
`make<Prop>(mat, opts) → { group, ...handles, set<State>() }`, the origin at the base center, sitting
on y = 0, and every animated value set through a setter so `rebuild()` can restore it.

---

## 1. Surfaces and set dressing

| Prop | From | Variants | Parameters | State / hooks |
|---|---|---|---|---|
| **Bench** ◐ | Photosynthesis, Strawberry, OnionRoot, EggLab, Ecoli | `cabinet`: speckled worktop, front edge strip, base cabinets with door seams and steel handles (Photosynthesis) · `slab`: rounded, bevelled slab (Strawberry lab mat, OnionRoot bench) · `tray`: thin rounded tray over a shadow catcher (EggLab) · `floor`: no bench, just a floor plane and fog (Ecoli) | `w`, `d`, `thickness`, `cornerR`, `bevel`, `color`, `speckle` (on/off, dot colors, density), `doors` (count), `handleMaterial`, `edgeColor` | none |
| **Shadow catcher** | EggLab, OnionRoot, Strawberry | shadow-only plane · plane plus radial AO halo | `size`, `opacity`, `haloSize`, `haloOpacity`, `y` | none |
| **Work mat** ✅ | Photosynthesis | silicone mat | `w`, `d`, `cornerR`, `color` | none |
| **Sheet** ◐ | Photosynthesis (paper towel ✅), OnionRoot (filter paper, notebook) | `towel`: dot-embossed · `filter`: plain square · `notebook`: cover plus page | `w`, `d`, `color`, `rotation`; `spot` (color, opacity) for stains | `setSpot(opacity)` (stain soaking in) |
| **Bench card** | Ecoli (cards in front of plates) | flat printed card | `title`, `sub`, `subColor`, `w`, `d` | `setHighlight()` |
| **Tray / bin** ✅ | Photosynthesis (syringe tray) | open-top tray | `w`, `d`, `h`, `wall`, `color` | none |

## 2. Liquid containers

All of these share one **liquid** sub-part, built: `core/liquid.js` ✅ (color, opacity, cloudiness, a level
set in mL, cm or a fraction, stacked layers, pouring, a surface disc). A meniscus is not done yet. They
also share one **label** sub-part (section 8).

| Prop | From | Variants | Parameters | State / hooks |
|---|---|---|---|---|
| **Beaker** ◐ | Photosynthesis ✅, EggLab, Strawberry, OnionRoot | `standard` (Photosynthesis) · `fresnel`: two-pass glass with edge tint that reads on white backgrounds (EggLab) · with or without spout (Strawberry) | `capacity` (50 / 150 / 250 / 600 mL, which sets r and h), `level` or `volume`, `liquidColor`, `liquidOpacity`, `graduations` (on/off, step), `label` (tape or letter patch), `spout`, `meniscus`, `caustic` + `contactShadow` (EggLab) | `setVolume(mL)`, `setCloud(0–1)`, tilt/pour with the clip plane, `spoutPoint`, `surfaceY()` |
| **Cup** ◐ | Photosynthesis ✅ (clear plastic), Ecoli (paper ice cup, biohazard waste cup), Strawberry (glass waste cup) | `clear-plastic` with ridge · `paper` (opaque white) · `waste` (colored plastic with a band) · `glass` | `rTop`, `rBot`, `h`, `material`, `color`, `band` (text and color), `ridge` | `setVolume(mL)`, `innerR(y)`, `surfaceY()` |
| **Bowl** ◐ | Strawberry (fruit bowl, ice bowl) | glass · ceramic | `r`, `h`, `material`, `contents` (none, fruit, ice water) | none |
| **Ice bath** ◐ | Ecoli (ice in a paper cup), Strawberry (ice water in a glass bowl) | `cup` · `bowl` | `container` (cup or bowl), `cubeCount`, `cubeSize`, `keepOut` (slots left clear for tubes or a bottle), `water` (on/off, level), `seed` | `slots[]` (where tubes or bottles sit) |
| **Microcentrifuge tube** | Ecoli (also used as the plasmid vial) | 1.5 mL | `capColor`, `level`, `liquidColor`, `label` (text, dot color) | `openCap(bool)` (hinged pivot), `setLevel()`, `tweenLiquid(color)` |
| **Test tube** ✅ | Strawberry | standard, about 15 × 1.6 cm | `h`, `r`, `layers[]` (color, opacity, height), `stopper` | `setLayer(i, h)` (e.g. filtrate below an alcohol layer) |
| **Petri dish** ◐ | Photosynthesis ✅ (plain dish), Ecoli (agar plate) | `dish`: glass, no lid · `plate`: agar and lid | `r` (default 4.5), `agarColor`, `lid`, `contents`: `colonies` (count, seed, size range), `lawn`, `streak` (path), `glowColor` | `liftLid(bool)`, `setGrowth(0–1)`, `setGlow(0–1)` (UV fluorescence) |
| **Reagent bottle** ◐ | Ecoli (media bottle), OnionRoot (dropper bottle), Strawberry (alcohol bottle) | `media`: round-shoulder glass with screw cap · `dropper`: small, with a pipette dropper insert · `narrow-neck`: tall alcohol bottle | `h`, `glassTint`, `glassOpacity`, `liquidColor`, `level`, `label` (title, sub, band color), `capColor`, `bulbColor` (dropper) | `openCap()` / lift the cap, `dropper` handle (lift and squeeze), `spoutPoint` |
| **Squeeze bottle** ✅ | Photosynthesis, Strawberry (both dish soap) | flip cap | `color`, `title`, `line`, `ink`, `h` | `spoutPoint` |
| **Shaker** | Strawberry (salt) | glass with metal cap | `fillColor`, `fill`, `capColor` | none |
| **Jar with powder** ✅ | Photosynthesis (baking soda) | with separate lid | `title`, `line`, `color`, `powderColor`, `fill`, `lidColor` | lid comes off, `scoop` target point |
| **Funnel** ✅ | Strawberry | with or without a coffee filter | `rimR`, `stemLen`, `filter` (on/off), `filterLiquid` (level, color) | `setFilterLevel()`, `dripPoint` |
| **Watch glass** | OnionRoot | shallow spherical cap | `R`, `theta`, `liquidColor` | `setLiquid(h)` |
| **Zip-top bag** ✅ | Strawberry | quart bag | `w`, `d`, `zipColor`, `contents` (color, level), `foam` (count) | `setOpen(bool)`, `setContents(level)`, `setFoam(0–1)` |
| **Microscope slide** | OnionRoot | plain · with frosted label end | `label` (text lines), `specimenColor` | `setSmear(0–1)`, `setDrop(bool)` |
| **Coverslip** | OnionRoot | 22 × 22 mm | `size` | none (picked up and placed) |

## 3. Racks and holders

| Prop | From | Variants | Parameters | State / hooks |
|---|---|---|---|---|
| **Tube rack** ◐ | Ecoli (block rack, single-tube stand), Strawberry (two-tier rack) | `block`: solid block with dark hole discs · `tiered`: top plate with holes, a base, and posts | `holes` (count, spacing, hole r), `w`, `d`, `h`, `color` | `slots[]` (world positions for tubes) |
| **Tool holder** | Ecoli (cups holding the pipette and loop) | small cup | `r`, `h`, `color` | `slot` |

## 4. Hand tools

| Prop | From | Variants | Parameters | State / hooks |
|---|---|---|---|---|
| **Transfer pipette** ◐ | Photosynthesis ✅, Ecoli | ribbed bulb (Photosynthesis) · smooth squeezable bulb (Ecoli) | `length`, `fluidColor`, `bulbStyle` | `squeeze()`, `setFill(0–1)`, `tipPoint` |
| **Syringe** ✅ | Photosynthesis | 10 mL | `capacity`, `liquidColor`, `cap` (on/off), `contents` (e.g. leaf disks) | `setPlunger(mL)`, `setLiquid(mL)`, `tipPoint` |
| **Inoculation loop** | Ecoli | disposable plastic | `color`, `payload` (none, colony blob, liquid film) | `setPayload()`, `twirl()` |
| **Scoop / spatula** ✅ | Photosynthesis | with a powder heap | `length`, `heap` (on/off) | `setHeap(bool)` |
| **Stirring rod** ✅ | Photosynthesis | glass | `length`, `r` | none |
| **Skewer** ✅ | Strawberry | wooden, pivot at the tip | `length`, `woundMaterial` (DNA) | `setWound(0–1)` |
| **Scalpel** | OnionRoot | steel | `length` | `edgePoint` |
| **Pencil** | OnionRoot | yellow with eraser | `color`, `length` | `tipPoint` (reach) |
| **Hole punch** ✅ | Photosynthesis | single-hole | `color` | `press()` |

## 5. Powered equipment

| Prop | From | Variants | Parameters | State / hooks |
|---|---|---|---|---|
| **Lamp** ◐ | Photosynthesis ✅ (desk lamp), Ecoli (handheld UV lamp) | `desk`: base, arm, shade, bulb, light cone · `uv`: box with handle and purple window, plus a spotlight | `lightColor`, `intensity`, `armHeight`, `armReach`, `coneLength` | `setOn(0–1)`, `aimAt(point)` |
| **Timer / display** ◐ | Photosynthesis ✅ (timer), Ecoli (water-bath readout) | standalone timer · panel screen built into another device | `text` / `digits`, `color`, `activeColor` | `setText()`, `setActive(bool, blink)` |
| **Water bath** | Ecoli | open tank with float rack | `w`, `d`, `h`, `waterColor`, `setpoint`, `floatColor` | `setActive(bool)`, rippling water surface, `slots[]` in the float |
| **Hot plate** | OnionRoot | small single-plate | `w`, `d`, `bodyColor` | `setHeat(0–1)` (plate glow and LED) |
| **Microscope** | OnionRoot | compound, 4 objectives | `bodyColor`, `objectiveRingColors[]` | `setObjective(i)` (nosepiece turns), `setLamp(bool)` (beam), `stageSlot`, `eyePoint` (camera target) |

Implied by the prototypes but never modeled: an **incubator** (Ecoli incubates in place), a
**balance/scale** (EggLab tracks egg mass), a **graduated cylinder**.

## 6. Specimens

| Prop | From | Variants | Parameters | State / hooks |
|---|---|---|---|---|
| **Egg** | EggLab | in shell · shell-less (membrane and yolk) | `seed`, `size` | `setShell(0–1)` (dissolve), `setShape({wrinkle, sag, swell})` (osmosis), `setMass()` |
| **Onion with roots** | OnionRoot | bulb only · bulb with roots | `rootCount`, `rootLength`, `seed`, `skinColor` | `cutTip()` (removable tip piece), `rootEnds[]` |
| **Strawberry** ✅ | Strawberry | whole · calyx removed · mashed pulp (instanced chunks and seeds) | `seed`, `size`, `calyx` | `removeCalyx()`, `setMash(0–1)` |
| **Leaf** ✅ | Photosynthesis | spinach | `seed`, `w`, `h`, `holes[]` (punched) | `punch(at)`; makes **leaf disks** that float or sink (`setFloat(0–1)`) |
| **Colonies / lawn** | Ecoli | colonies · lawn · streak | (petri dish contents) | `setGrowth()` |
| **DNA precipitate** ✅ | Strawberry | strands, glob, cloud | `color`, `seed` | `setAmount(0–1)` |

## 7. Effects

| Prop | From | Variants | Parameters | State / hooks |
|---|---|---|---|---|
| **Pour stream** ✅ | Photosynthesis, EggLab, Strawberry | straight stream | `color`, `r` | `set(from, toY, r)` |
| **Drops / drips** ◐ | OnionRoot, Strawberry, Lab ✅ | single drop · continuous drip | `color`, `size`, `rate` | `drop(from, surfY)` |
| **Bubbles** ◐ | EggLab (CO₂ on the egg), Strawberry | on a surface · rising in liquid | `count`, `sizeRange`, `period`, `surface` (sphere, plane) | `setRate(0–1)` |
| **Ripples** ✅ | EggLab, Lab | rings | `maxR`, `color` | `ripple(pos)` |
| **Steam** | OnionRoot | puffs | `rate`, `color` | `setRate(0–1)` |
| **Powder fall** ✅ | Photosynthesis | falling stream of grains | `color` | `powderFall(from, surfY)` |
| **Foam** | Strawberry | bubble cluster | `count`, `color` | `setAmount(0–1)` |
| **Molecule particles** | EggLab (water moving across the membrane) | particles moving in or out | `count`, `color`, `direction` (in/out) | `setFlow(−1…1)` |
| **Glow points** | Ecoli (GFP under UV) | additive glow sprites | `color`, `size` | `setGlow(0–1)` |
| **Contact shadow / caustic** | EggLab | dark blob · tinted light patch | `size`, `color`, `opacity` | `setColor()` (follows the liquid color) |

## 8. Labels and markers

| Prop | From | Variants | Parameters | State / hooks |
|---|---|---|---|---|
| **Wrap label** ◐ | Photosynthesis ✅ (tape label), Ecoli and OnionRoot (band label), EggLab (letter patch) | `tape` · `band` (color stripes top and bottom) · `letterPatch` (one big letter) · `graduations` | `title`, `sub`, `color`, `arc`, `y0`, `y1`, `rTop`, `rBot` | none |
| **Target marker** | Ecoli (ring plus arrow), OnionRoot (ring) | ring · ring and arrow | `r`, `h`, `color` | `show(at)`, pulse |
| **Floating label** | Ecoli (billboard with a colored dot) | dot and text | `text`, `dotColor`, `scale` | follows its object; covered by the hover labels in `interact.js` |

## Materials that come with the props

Already in `Lab/materials.js`, or to merge in: **glass** (Ecoli, the user's favorite), **fresnel glass**
(EggLab), clear plastic, **liquid** (EggLab's shader version or the standard one), agar, steel, chrome,
rubber, white clearcoat plastic, dark plastic, powder. Props take materials from `mat` rather than making
their own, so one material change restyles every prop.

## Avoiding flicker

Flicker is two surfaces on one plane. Offset them by about 0.01 to 0.03 cm.

- **Contact:** lift the prop's underside a hair in its own geometry or anchor. Don't rely on the placer.
- **Stacked parts:** make the lower part slightly larger, or overlap them.
- **Bevels:** check bevelled and extruded faces, since they grow outward.
- **Glass:** it writes no depth, so it only fights with opaque surfaces beneath it.
- **Check:** orbit slowly. A still frame hides it.
