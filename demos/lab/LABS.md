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
| Gel Electrophoresis | `gel/gel-lab.html` | none | Crime-scene DNA vs three suspects. Micropipette, gel run, ladder measuring |
| Blood Typing | `bloodtype/blood-lab.html` | none | Type four people's blood, then Punnett squares to rule out a father |
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
