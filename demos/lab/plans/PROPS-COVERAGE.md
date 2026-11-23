# Prop coverage: high school to first-year college biology

Which props the library needs to cover the standard labs from high school biology through AP / IB
and intro college biology. This builds on [PROPS.md](../PROPS.md), which catalogs the props already in
our five prototypes.

**Legend:** **bold** = a prop not in PROPS.md yet · *(variant)* = a new variant of a prop PROPS.md
already has. Same scale and conventions as PROPS.md (1 unit = 1 cm).

---

## 1. The labs

The labs that show up across most curricula, grouped by topic. ✓ means we have a prototype.

| Topic | Labs |
|---|---|
| Microscopy and cells | Onion root mitosis ✓, onion skin / cheek cells, Elodea (plasmolysis), pond water, prepared slides, meiosis in Sordaria |
| Transport | Osmosis in eggs ✓, potato cores in salt or sugar, dialysis-tubing diffusion, agar-cube diffusion (surface area to volume) |
| Biomolecules | Food tests: Benedict's (sugar), iodine (starch), Biuret (protein), Sudan / paper (fat) |
| Enzymes | Catalase (liver or potato in H₂O₂), effect of temperature, pH and concentration, amylase and starch |
| Energy | Leaf-disk photosynthesis ✓, chromatography of plant pigments, respiration in germinating peas, yeast fermentation |
| Molecular genetics | DNA extraction ✓, bacterial transformation ✓, gel electrophoresis, PCR, restriction digests, ELISA |
| Genetics and evolution | Fruit fly crosses, corn-ear counts, Fast Plants artificial selection, Hardy-Weinberg |
| Microbiology | Aseptic technique and streaking, Gram stain, antibiotic disk diffusion, hand-washing swabs |
| Physiology | Blood typing ✓, heart rate and exercise, lung capacity, reaction time, dissection (earthworm, frog, fetal pig, owl pellets) |
| Plants | Transpiration (potometer), tropisms, seed germination, flower dissection, stomata peels |
| Ecology and behavior | Pillbug choice chamber, quadrat / biodiversity sampling, water quality, decomposition, Winogradsky column |
| Measurement | Spectrophotometry (protein assay, enzyme rates), buffers and pH |

## 2. Props by group

### Glassware and plasticware

| Prop | Variants | Parameters | Used by |
|---|---|---|---|
| **Flask** | Erlenmeyer · volumetric · side-arm | `capacity`, `stopper` (none, rubber, cotton, foil), liquid | Fermentation, enzymes, media prep, Winogradsky |
| **Graduated cylinder** | glass · plastic, base hexagonal or round | `capacity` (10 / 25 / 100 / 500 mL), liquid, meniscus | Nearly every lab that measures volume |
| Test tube *(variant)* | culture tube with cap · tube with stopper · tube with balloon (fermentation) | `layers[]`, `capType` | Food tests, fermentation, enzymes |
| Tube *(variant)* | 15 mL and 50 mL conical, PCR strip / 0.2 mL tube | `capColor`, liquid | PCR, DNA, centrifuging |
| **Spot plate / microplate** | ceramic spot plate · 24- and 96-well plates | `wells` (rows × cols), per-well color | Food tests, pH, ELISA, enzyme series |
| **Cuvette** | plastic or quartz | liquid color, cap | Spectrophotometry |
| **Wash bottle** | water, ethanol (label colors) | `color`, `label` | Everywhere (rinsing, slide prep) |
| **Dropper / Pasteur pipette** | glass with rubber bulb | fluid | Stains, food tests, indicators |
| **Dialysis tubing** | knotted bag with contents | `length`, contents color | Diffusion, osmosis |
| **Agar cubes** | cubes of different sizes | `size`, dye penetration 0–1 | Surface area to volume |
| **Respirometer** | vial with a pipette tip and bead in a water bath | `vialCount`, `bubblePos` | Pea respiration |
| **Potometer** | stem in a tube with a capillary and bubble | `bubblePos` | Transpiration |
| **Choice chamber** | two- or four-zone dish | `zones`, zone conditions (wet/dry, light/dark) | Animal behavior |
| **Chromatography setup** | paper strip in a tube or beaker with cap | `solventFront` 0–1, pigment bands[] | Plant pigments |
| **Winogradsky column** | tall cylinder with soil layers | `layers[]`, color bands over time | Ecology, microbiology |

### Measuring and transfer

| Prop | Variants | Parameters | Used by |
|---|---|---|---|
| **Micropipette** | P10 · P20 · P200 · P1000 (color-coded plunger) | `volume` (dial readout), `tip` on/off | Every molecular biology lab: PCR, gels, ELISA, transformation |
| **Pipette tip box** | 10 · 200 · 1000 µL racks | `remaining` (tips left), lid open | With the micropipette |
| **Serological pipette + pump** | 5 / 10 / 25 mL | fill level | Media, larger volumes |
| **Balance** | top-loading · analytical with a draft shield | `reading`, `tare()` | Osmosis (mass change), solutions, egg mass |
| **Weigh boat** | square plastic | contents | With the balance |
| **Thermometer** | glass · digital probe | `temp` | Enzymes, water baths, respiration |
| **pH meter / pH strip** | handheld meter · strip with color key | `pH` (sets display or color) | Buffers, enzymes, water quality |
| **Ruler / caliper** | 15 cm ruler · caliper | `length` | Potato cores, agar cubes, plant growth |
| **Sensor probe + datalogger** | CO₂, O₂, temperature, heart rate | `reading`, live graph on the screen | Respiration, photosynthesis, physiology |

### Equipment

| Prop | Variants | Parameters | Used by |
|---|---|---|---|
| **Gel electrophoresis box** | horizontal box with tray, comb and lid with leads | `wells`, band positions[], `running` | Electrophoresis, PCR, restriction digests |
| **Power supply** | box with display and red/black leads | `volts`, `on` | With the gel box |
| **Transilluminator** | blue light · UV with an amber shield | `on` | Seeing gel bands |
| **Microcentrifuge** | lid, rotor with slots | `spinning`, `slots[]` | DNA, PCR, cell fractionation |
| **Vortex mixer** | small with a rubber cup | `on` | Mixing tubes |
| **Thermal cycler** | lid and block with a display | `temp`, `stage` | PCR |
| **Spectrophotometer / colorimeter** | benchtop with a cuvette slot | `reading`, `wavelength` | Protein assays, enzyme rates, photosynthesis (DPIP) |
| Hot plate *(variant)* | hot plate with a magnetic stirrer + **stir bar** | `heat`, `stir` | Media prep, enzymes at temperature |
| **Incubator** | small benchtop with a glass door and shelves | `temp`, `doorOpen`, `slots[]` | Microbiology, transformation |
| **Bunsen burner** | with or without a flame; hose | `flame` (off, yellow, blue) | Aseptic technique (sterilizing loops) |
| **Alcohol lamp** | wick and cap | `lit` | Low-cost aseptic setups |
| **Ring stand + clamps** | ring, utility clamp, test-tube clamp, burette clamp | `height`, attachments[] | Holding flasks, funnels, potometers |
| **Stereo (dissecting) microscope** | low-power scope with top light | `zoom`, `light` | Fruit flies, flowers, insects |
| Lamp *(variant)* | grow light / light box | `color`, `intensity` | Plants, tropisms, Fast Plants |
| **Refrigerator / ice bucket** | foam ice bucket with lid | holds tubes in slots | Molecular biology (keeping enzymes cold) |

### Dissection and handling

| Prop | Variants | Parameters | Used by |
|---|---|---|---|
| **Dissection tray** | wax-bottom tray · flat tray | `w`, `d`, specimen slot | All dissections |
| **Forceps** | fine-tip, blunt | `open` 0–1 | Dissection, slides, peeling |
| **Dissecting scissors** | fine · blunt-sharp | `open` 0–1 | Dissection |
| **Probe / teasing needle** | straight, angled | none | Dissection, slide prep |
| **T-pins** | pins | `count` | Pinning specimens |
| **Tongs** | beaker tongs, crucible tongs, test-tube holder | `grip` 0–1 | Hot glassware |
| **Mortar and pestle** | ceramic | contents and `ground` 0–1 | Pigments, enzymes (liver), DNA |
| **Cork borer** | set of sizes | `size` | Potato cores, leaf disks |
| **Razor blade** | single-edge | none | Cross sections, peels |
| **Cotton swab / toothpick** | | | Cheek cells, swabbing, streaking |
| **Spreader** | L-shaped glass or plastic | none | Plating bacteria |

### Consumables and set dressing

| Prop | Variants | Parameters | Used by |
|---|---|---|---|
| **Gloves** | nitrile on the bench (or as hands) | `color` | Everything |
| **Goggles** | on the bench | none | Safety steps |
| **Marker + label tape** | marker, roll of tape | `color` | Labeling tubes and plates |
| **Parafilm, foil** | roll, small square on a flask | none | Covering |
| **Kimwipes box** | tissue box | none | Cleaning, blotting |
| **Lab notebook** | open with handwriting | `pages` text | Recording results (the notebook from OnionRoot is a start) |
| **Sharps / biohazard bin** | red bin; biohazard bag | none | Disposal steps |
| **Spray bottle** | 70% ethanol disinfectant | `label` | Aseptic technique |
| **Plant pot** | pot with soil, seedlings | `growth` 0–1, `count` | Fast Plants, tropisms, germination |
| **Fly vial** | vial with food and foam plug | fly count, phenotype mix | Fruit fly genetics |

### Specimens

Each needs its own model, but they share techniques with what we have (lathe shapes, instancing,
procedural textures, deformable surfaces like the egg).

| Prop | States | Used by |
|---|---|---|
| **Potato** (whole, core, slices) | `mass`, firmness (limp/turgid) | Osmosis, catalase |
| **Liver chunk** | fresh, boiled | Catalase |
| **Yeast suspension** | foam, bubbles | Fermentation |
| **Seeds / peas** | dry, germinating, sprouted | Respiration, germination |
| **Elodea sprig** | with bubbles | Photosynthesis, plasmolysis |
| **Pillbugs** | animated crawlers | Behavior |
| **Fruit flies** | phenotypes (eye color, wing shape) | Genetics |
| **Corn ear** | kernel colors and textures by ratio | Genetics |
| **Earthworm, frog, fetal pig** | closed, open, organ layers | Dissection |
| **Owl pellet** | whole, opened, bones | Ecology |
| **Flower** | whole, parts separated | Plant reproduction |
| **Plant seedlings** | growth, bending (tropisms) | Plants |
| **Gel** | with wells and stained bands | Electrophoresis |

### Effects and states

| Effect | Used by |
|---|---|
| **Color change in a liquid** (indicator: blue to orange for Benedict's, amber to black for iodine, pink to purple for Biuret) | Food tests, pH, enzymes, ELISA |
| **Foam rising** (catalase) | Enzymes |
| **Flame** | Bunsen burner, alcohol lamp |
| **Dye diffusing** (in agar, in water) | Diffusion |
| **Bands migrating** (in a gel) | Electrophoresis |
| **Solvent front** on paper | Chromatography |
| **Fog / condensation** | Cold tubes, incubator door |
| **Glow under blue / UV light** (Ecoli has this for colonies) | Gels, GFP |

## 3. What to build first

Ranked by how many labs each prop unlocks. Generic glassware plus the micropipette cover most of
the list.

**Tier 1: shared by most labs**
1. Graduated cylinder and flask (lathe containers with our shared liquid)
2. Micropipette with tip box
3. Balance with weigh boat
4. Test tube variants (culture tube, stoppered) and a test-tube rack variant
5. Color-changing liquid state (one setting on the shared liquid)
6. Spot plate / microplate
7. Forceps, tongs, wash bottle, dropper

**Tier 2: whole topic areas**
- Molecular biology: gel box, power supply, transilluminator, microcentrifuge, gel, thermal cycler, ice bucket
- Microbiology: Bunsen burner and flame, incubator, spreader, spray bottle
- Measurement: thermometer, pH meter / strips, spectrophotometer + cuvette, sensor probe + datalogger
- Hot plate with stirrer, ring stand with clamps

**Tier 3: lab-specific**
- Dissection tray, scissors, probe, pins, plus each specimen
- Respirometer, potometer, choice chamber, chromatography setup, dialysis tubing, agar cubes
- Living specimens (pillbugs, flies, Elodea, seedlings)

## 4. Parameterization notes

- **One lathe-container base.** Beaker, flask, cylinder, test tube, bottle and cup differ only in
  profile. Give them one base that takes a profile and a capacity, and gives every container the same
  liquid behavior (fill by mL, tilt, pour, color change, layers).
- **Color-coding as a parameter.** Micropipettes, caps, tip boxes, label bands and racks all come
  color-coded in real labs. Expose `color` everywhere and keep a shared palette.
- **One `display` part.** Balance, pH meter, thermometer, power supply, thermal cycler, spectrophotometer
  and timer all show a number. One screen part with `setText()` covers them.
- **Slots everywhere.** Racks, the centrifuge rotor, the gel comb, the incubator shelves, the ice
  bucket and the water-bath float all hold things. A shared `slots[]` convention lets any holder accept
  any tube.
- **Grip states.** Forceps, scissors, tongs and test-tube holders all open and close. Give them one
  `open` 0–1 setting so the same animation code drives them all.

---

## 5. Science-fair projects (Science Buddies style)

Written from general knowledge of Science Buddies' biology projects. The site's bot check blocked the
built-in browser, so this list hasn't been checked against their current pages.

Science-fair projects are a different kind of lab. They run at home or in a classroom with household
materials, they last days or weeks rather than one class period, and each project tests one variable
across several setups. So the library needs **home settings**, **kitchen and garden props**, **living
things that change over time**, and **multiples of one setup**.

### The kinds of projects

| Area | Typical projects |
|---|---|
| Plants | Seed germination (salt, music, light color), plant growth under colored light, phototropism in a shoebox maze, colored water rising in celery, hydroponics, stomata peels with nail polish, leaf-pigment chromatography, duckweed growth |
| Microbes | Swabbing surfaces onto agar plates, hand sanitizer vs. soap, bread mold, yeast blowing up balloons, yogurt or kombucha, antibiotic disks, microbial fuel cells |
| Human body | Reaction time (ruler drop), heart rate and exercise, lung capacity with a balloon, taste and smell tests, vision and memory tests, muscle and nerve signals with hobby sensor kits |
| Small animals | Planaria regeneration, Daphnia heart rate (caffeine), brine shrimp hatching, mealworm or pillbug choice tests, ant behavior, earthworms and soil, fish |
| Biochemistry and food | Enzymes (pineapple in gelatin), catalase with potato, vitamin C with iodine, red-cabbage pH indicator, DNA extraction, egg osmosis, bone in vinegar |
| Biotech kits | Gel electrophoresis with food dye, bacterial transformation kits, CRISPR kits, paper microscope (Foldscope), phone-camera microscopy |
| Environment | Water quality testing, oil spill cleanup, bioplastics, algae growth, bird feeders, compost and decomposition, soil testing |

### New props for these projects

**Settings** (variants of the Bench prop in PROPS.md)

| Prop | Variants | Parameters |
|---|---|---|
| Bench *(variant)* | kitchen counter · wooden table · classroom desk · windowsill with daylight · outdoor patch (soil, grass) | `material` (laminate, wood, stone), `w`, `d`, `backsplash`, `window` (light direction, time of day) |

**Household containers**

| Prop | Variants | Parameters |
|---|---|---|
| **Mason jar** | with lid · with cheesecloth · with a hole for a plant | `size`, `lid`, contents (liquid, soil, layers) |
| **Plastic bottle** | 2 L soda bottle · water bottle · cut-open (self-watering planter, terrarium) | `size`, `cut` (none, top off, halved), balloon on top |
| **Egg carton / ice cube tray** | for seed starting or sample sets | `cells` (rows × cols), per-cell contents |
| **Food container** | deli cup · takeout box with lid | `size`, `lid` |
| **Shoebox** | closed · open · with maze partitions and a hole | `partitions[]`, `hole` position |
| **Balloon** | flat · inflating on a bottle | `inflate` 0–1, `color` |
| **Spray bottle, measuring cups and spoons** | | `size`, `fill` |

**Kitchen tools**

| Prop | Variants | Parameters |
|---|---|---|
| **Kitchen scale** | digital | `reading` (shared display part) |
| **Knife and cutting board** | | none |
| **Blender** | | `on`, contents |
| **Microwave / stove / fridge** | appliance fronts only (doors open, food goes in) | `doorOpen`, `on`, display |
| **Stopwatch / phone** | phone as stopwatch, camera, light meter or sound meter | screen content |

**Garden and growing**

| Prop | Variants | Parameters |
|---|---|---|
| Plant pot *(from section 2)* | terracotta · plastic nursery pot · peat pot · hydroponic net cup | `size`, `soil`, plant `growth` 0–1 |
| **Seedling / plant** | bean · radish · grass · duckweed · celery stalk | `growth` 0–1 over days, `lean` (phototropism), `wilt`, `leafColor`, dye uptake 0–1 (celery) |
| **Seed packet + seeds** | | `type`, `count` |
| **Watering can** | | `fill`, pour |
| **Grow light** | LED panel (red, blue, white) · clip lamp with colored filter | `color`, `intensity` |
| **Soil / compost** | bag, tray of soil, compost bin | `moisture`, `decomposition` 0–1 |
| **Terrarium / aquarium** | tank with gravel and plants · small fish bowl | `w`, `d`, `h`, water level, `airStone` (bubbles) |

**Small animals and habitats**

| Prop | States |
|---|---|
| **Planaria** | crawling, cut, regrowing 0–1 |
| **Daphnia** | swimming, heart beating at a set rate (needs a microscope close-up) |
| **Brine shrimp** | eggs, hatching, swimming swarm |
| **Mealworms / pillbugs / ants** | crawling with simple choice behavior (shared crawler AI) |
| **Earthworm** | crawling, burrowing |
| **Fish** | swimming, gill rate |

**Food and household materials** (used as specimens or reagents)

| Prop | States |
|---|---|
| **Bread slice** | mold growth 0–1 (spots spread over days) |
| **Gelatin cup** | set, liquefied (enzymes) |
| **Fruit and vegetables** | pineapple chunks, potato slices, red cabbage, celery stalks, banana (DNA): whole, cut, mashed |
| **Milk / yogurt** | liquid, thickened |
| **Chicken bone** | rigid, rubbery after vinegar |
| **Food coloring bottle** | squeeze drops into liquids (uses the drop effect) |
| **Cheesecloth / coffee filter** | for filtering (coffee filter is already in Strawberry) |

**Hobby electronics and kits**

| Prop | Variants | Parameters |
|---|---|---|
| **Microcontroller board** | Arduino-style board with jumper wires and a breadboard | attached sensors[] |
| **Sensor** | temperature, light, soil moisture, heart rate clip, muscle sensor pads | `reading` |
| **Multimeter** | for microbial fuel cells | `reading` |
| **Paper microscope / phone microscope adapter** | | sample slot, view |
| **Aquarium pump and air stone** | | `on` (bubbles) |
| **Mini gel kit** | small all-in-one gel box with built-in light | bands |

### What this adds to the build plan

- **Home settings matter as much as props.** A kitchen counter and a windowsill are the backdrop for
  most science-fair projects. They should be Bench variants, with daylight from a window as part of the
  lighting setup.
- **Time-lapse state.** Plants grow, mold spreads, brine shrimp hatch and bones soften over days. Props
  need a `day` or `growth` setting that the timeline can scrub, the same way the EggLab egg changes
  over its days.
- **Experimental sets.** A project is usually three to six copies of one setup with one thing changed
  (salt amount, light color). A helper that lays out N copies of a setup in a row, with labels and one
  setting varied, would cover most projects.
- **Living-things AI.** Pillbugs, mealworms, ants, planaria and brine shrimp all need simple wandering
  and choice behavior. One crawler and one swimmer behavior, each with settings, cover them.
- **Reuse from earlier sections:** agar plates and colonies (Ecoli), DNA extraction (Strawberry), egg
  osmosis (EggLab), leaf disks (Photosynthesis), the microscope (OnionRoot), plant pots, choice chamber
  and gel box (section 2).
