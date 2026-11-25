# Labs: index and special cases

Every bench lab in `demos/lab/`, and the shortcuts and quirks worth knowing when testing. `README.md` is what the library does; this is what each lab does differently.

## Labs

The four with a short URL are rows in `lib/lessons.js`; the rest are not wired to the lessons page yet.

| Lab | Page | Short URL | What it does |
| --- | --- | --- | --- |
| Floating Leaf Disks | `photosynthesis/photosynthesis-lab.html` | /labs/leaf-disks | Sink spinach disks, time how fast O₂ floats them up. The timed, scrubbable observation step |
| Strawberry DNA | `strawberry/strawberry-lab.html` | /labs/strawberry-dna | DNA extraction. Two zoom levels (a cell, the molecules) |
| Glowing E. coli | `ecoli/ecoli-lab.html` | /labs/glowing-ecoli | Transformation with GFP. UV step darkens the room |
| Onion Root Tip | `onion/onion-lab.html` | /labs/onion-root-tip | Squash and stain, then label mitosis stages under a microscope |
| Gel Electrophoresis | `gel/gel-lab.html` | /labs/gel-electrophoresis | Crime-scene DNA vs three suspects. Micropipette, gel run, ladder measuring |
| Blood Typing | `bloodtype/blood-lab.html` | /labs/blood-typing | Type four people's blood, then Punnett squares to rule out a father |
| Yeast Catalase | `catalase/catalase-lab.html` | /labs/yeast-catalase | Yeast-soaked paper disks float in H₂O₂ at five concentrations, then boiled yeast. Rate against concentration levels off. Disk and molecule zoom levels |
| Mendel's Peas | `mendel/mendel-lab.html` | none | Cross a green-pea bud with yellow-pea pollen, open the F₁ pod, grow and self the F₁, shell and count the F₂, fill a Punnett square. Cell (meiosis) and molecule (SGR, chlorophyll) zoom levels |
| Egg Osmosis | `egg/egg-lab.html` | /labs/egg-osmosis | Dissolve three shells in vinegar, then weigh the eggs before and after a day in water, saline and corn syrup. Predictions live in the mass table |
| Fruit Fly Genetics | `fly/fly-lab.html` | none | Morgan's white eye, crossed both ways: knock out stocks, sex flies under a stereo microscope, raise vials A and B, sort the F₁, cross A's F₁ in vial C, sort the F₂, then χ² and a Punnett square. Cell (X and Y in meiosis) and molecule (the White pump) zoom levels |
| Juniper's Seizures | `calf/calf-lab.html` | none | Calf seizure case, drawn from frame art in `calf/art/`. Not in `README.md` |

Benches: `gallery.html` (every prop), `props.html#<prop>` (one prop on a turntable), `themes.html` (colour themes).

## Special cases

| Lab | Special case |
| --- | --- |
| Blood Typing | **Option+Shift+F** testing shortcut. First press skips the bench steps to 2a; second fills and checks the wells; third fills and checks the types and opens Genetics. The father question is left for you |
| Blood Typing | **New case** reseeds the four types. Case #472 is the fixed default (O+ mother, B+ baby, A− and AB+ men) |
| Blood Typing | Read the wells is two steps: 2a marks clumping, 2b names types. The answer's explanation shows only on the Lab complete card |
| Onion Root Tip | Microscope open: **1–4** pick the objective, a stage's first letter labels the selected cell, arrows pan, Esc deselects then closes |
| Labs with zoom levels | **1, 2, 3** switch level (ignored with a modifier held) |
| Leaf Disks, Strawberry, E. coli | `?marker=dot` swaps the target marker style |
| Egg Osmosis | The predict step waits on the mass table's buttons, not the bench; Watch skips it. Masses are drawn once per session, so **restart** gives new eggs |
| Yeast Catalase | The read step waits on the panel's question, not the bench; Watch skips it. Float times are drawn once per session, so **restart** gives new data |
| Mendel's Peas | Predict, count and Punnett steps wait on the panel, not the bench; Watch skips them. Pea genotypes are drawn once per session, so **restart** gives new counts. `levels-test.html` poses both zoom worlds from sliders |
| Fruit Fly Genetics | Sort, count and question steps wait on the stereo view or the card, not the bench; Watch sorts for you. After 8 correct manual sorts, **Sort the rest** finishes a set. Flies are drawn once per session, so **restart** gives new counts. `stereo-test.html` and `levels-test.html` are its benches |
| Juniper's Seizures | Not in `lessons.js` or `README.md`; status unknown |

## Every lab

From `page.js`, `lesson.js`, `intro.js` and `core/`.

| Control | Effect |
| --- | --- |
| `?intro=0` | Skip the intro card |
| `?mode=watch` | Open in Watch mode |
| `?speed=4` | Speed up every animation |
| `?lang=xx` | Load `text.xx.js` over the English |
| `?theme=<name>` | Override the accent theme |
| `?sketch=1` / `0` | Force the sketch outline on or off |
| `?three=<version>` | Pick the three.js build |
| Space | Play or pause in Watch mode |
| Enter | Close the intro |
| Click a phase in the procedure list | Jump there; earlier steps run instantly |
| `window.LAB` | Testing hook each lab exposes, e.g. `LAB.follow.stats.history` |
