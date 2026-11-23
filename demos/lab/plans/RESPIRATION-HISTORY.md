# How we figured out glycolysis and cellular respiration

The textbook diagram of glycolysis, the Krebs cycle and the electron transport chain took about 150
years to work out, mostly without anyone seeing the molecules. It was pieced together from a few
clever experimental tricks used again and again. This doc tells that story and suggests sims for it.
It goes with [HISTORIC.md](HISTORIC.md).

Dates and details are from memory, so check them before they go into a lesson.

---

## 1. Breathing is a kind of burning (1780s)

**Antoine Lavoisier** showed that an animal takes in oxygen, gives off CO₂ and makes heat, just like
burning charcoal. With **Pierre-Simon Laplace** he measured an animal's heat by how much ice it melted.
So respiration was "slow combustion," but where it happened and how stayed a mystery for another
century.

## 2. Fermentation happens inside yeast (1850s–1897)

- **Louis Pasteur** showed fermentation needs living yeast. He also noticed yeast burns through far
  less sugar when it has oxygen (the "Pasteur effect"). That was a first hint of two routes: one with
  oxygen, one without.
- **Eduard Buchner (1897)** ground yeast with sand and pressed out the juice. The juice, with no
  living cells, still turned sugar into alcohol. So the work was done by chemicals (enzymes), not a
  "life force." This opened the door to doing biochemistry in a test tube.

## 3. Taking yeast juice apart: glycolysis (1900s–1930s)

- **Arthur Harden and William Young (1906)** found fermentation in yeast juice sped up when they
  added phosphate. A sugar with phosphate groups attached piled up in the juice. Phosphate turned out
  to be central.
- They also ran the juice through a membrane bag (dialysis). Neither part worked alone, but together
  they did: big heat-sensitive enzymes, plus a small heat-stable helper. That helper was later
  identified as NAD⁺ and ATP/ADP.
- **Gustav Embden, Otto Meyerhof, Jakub Parnas and others (1920s–30s)** worked out the steps of
  glycolysis in yeast and muscle extracts. Their main trick: **poison one step and see what piles up.**
  - Fluoride blocks one enzyme near the end, so the molecule just before it builds up.
  - Iodoacetate blocks a different step, so a different molecule builds up.

  Block step by step and you get the order of the chain, like finding a clogged pipe by where the
  water backs up. The pathway was complete around 1940.
- **ATP** was discovered in 1929 (Karl Lohmann; also Cyrus Fiske and Yellapragada Subbarow).
  **Fritz Lipmann (1941)** proposed ATP as the cell's energy currency.

## 4. The Krebs cycle (1935–1937)

- **Albert Szent-Györgyi (1935)** used minced pigeon breast muscle, which breathes very fast, and
  measured its oxygen use with a **Warburg manometer**: a small flask attached to a pressure gauge.
  Adding a small amount of certain acids (succinate, fumarate, malate) raised oxygen use far more
  than burning those acids alone could explain. So they weren't fuel. They were being **reused**, like
  a catalyst.
- **Hans Krebs (1937)** closed the loop. He found that citrate also had this catalytic effect, and
  that oxaloacetate plus pyruvate made citrate. Blocking one enzyme with malonate made the acids before
  it pile up. Put together, the acids had to form a **cycle**, not a line. This was the
  poison-and-pile-up trick again, plus the "small amount, big effect" clue.

## 5. Where it happens (1940s)

- **Cell fractionation:** cells were broken open and spun in a centrifuge so their parts separated
  into layers.
- **Eugene Kennedy and Albert Lehninger (1948–49)** showed that isolated **mitochondria** alone could
  run the Krebs cycle and make ATP using oxygen. Mitochondria were the power plant.
- **Radioactive carbon** (available from the 1940s) let researchers follow individual carbon atoms
  from glucose to CO₂ and confirm the routes.

## 6. The electron transport chain: reading colors

- **David Keilin (1925)** looked at insect flight muscle through a spectroscope. He saw dark
  absorption bands from pigments he called **cytochromes**, which appeared and disappeared as the
  muscle used oxygen. They were carriers passing electrons along a chain.
- **Otto Warburg** found the enzyme at the end that hands electrons to oxygen, and showed cyanide
  blocks it. That's why cyanide is deadly.
- **Britton Chance (1950s)** used sensitive spectrophotometers and poisons. Carriers before a block
  stayed loaded with electrons and carriers after it went empty. That gave the order of the chain: the
  same pile-up logic, read in color.

## 7. How the chain makes ATP: a 20-year argument (1940s–1970s)

- **The search:** for decades, everyone looked for a high-energy chemical go-between linking the
  chain to ATP-making. Nobody ever found it.
- **Peter Mitchell's idea (1961):** the chain pumps protons across the membrane, and the protons
  flowing back through an enzyme drive ATP synthesis, like water through a turbine. Most of the field
  thought he was wrong.
- **André Jagendorf and Ernest Uribe (1966):** soaked chloroplast membranes in acid, then dropped them
  into a basic solution. They made ATP in the dark. A proton difference alone was enough.
- **Efraim Racker and Walther Stoeckenius (1974):** put two unrelated parts into an artificial
  membrane bubble. One was a light-driven proton pump from a salt-loving microbe; the other was ATP
  synthase from a cow. Shine light and it made ATP. Mitchell won the Nobel Prize in 1978.
- **Seeing the motor (1997):** Hiroyuki Noji, Masasuke Yoshida and Kazuhiko Kinosita attached a
  fluorescent actin filament to a single ATP synthase and watched it **spin** under a microscope.

## The tricks that keep coming back

| Trick | What it reveals | Who used it |
|---|---|---|
| Grind the cells, keep the chemistry working | You can study the steps in a test tube | Buchner, Harden and Young |
| Poison one step, see what piles up | The order of a pathway | Embden, Meyerhof, Krebs, Chance |
| Add a little, get a big effect | A molecule is reused, so the pathway is a cycle | Szent-Györgyi, Krebs |
| Measure gas (manometers) | How fast respiration is running | Warburg, Szent-Györgyi, Krebs |
| Spin cells apart | Where in the cell it happens | Kennedy and Lehninger |
| Look at colors (spectroscope) | Which carriers are loaded or empty | Keilin, Chance |
| Radioactive labels | Where the atoms go | 1940s onward |
| Rebuild it from parts | Proof that those parts are enough | Racker and Stoeckenius |

## Sim ideas

The picks that made the launch and first-year lists are in [ROADMAP.md](ROADMAP.md).

| Sim | What the student does | Levels | Props and systems |
|---|---|---|---|
| **Poison and pile-up** | Picks an enzyme to block, watches intermediates build up in a bar chart, and works out the order of glycolysis themselves | B, Mol | Test tubes, poison bottles, bar chart, reaction rules (MICRO.md) |
| **Szent-Györgyi's manometer** | Adds a pinch of fumarate to minced muscle and watches oxygen use jump far more than expected, then has to explain why | B, Mol | Warburg manometer (new), flask, gauge, timer |
| **Close the cycle** | Arranges the acids into a line, sees it doesn't fit the data, then closes it into a loop | Mol | Molecule cards, data panel |
| **Keilin's spectroscope** | Looks at muscle through a spectroscope and watches bands appear and vanish as oxygen comes and goes; adds cyanide | B, M, Mol | Spectroscope (new), absorption-band display |
| **Spin out the mitochondria** | Breaks cells, runs the centrifuge, and tests each layer for oxygen use | B, C | Centrifuge with layered tube (PROPS-COVERAGE.md), cell kit |
| **Jagendorf's acid bath** | Moves membranes from acid to base in the dark and sees ATP appear | B, Mol | Beakers, membrane patch, ATP synthase |
| **Racker's bubble** | Builds a bubble from a light pump and ATP synthase, shines light, and gets ATP | Mol | Liposome, proton pump, ATP synthase, light |
| **The spinning motor** | Watches a single ATP synthase turn with a filament attached; changes the ATP supply and the speed changes | M, Mol | ATP synthase model, fluorescence view |

**New props:** Warburg manometer, spectroscope, minced-muscle sample, ATP synthase (spinning model),
light-driven proton pump. Everything else is in PROPS.md, PROPS-COVERAGE.md or MICRO.md.

**Storyline:** this could be one connected lesson in seven short chapters, following the order above.
The poison-and-pile-up puzzle returns in chapters 3, 4 and 6, so students get better at it each time.
