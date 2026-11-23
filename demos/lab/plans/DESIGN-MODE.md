# Design-your-own mode

What a sim needs so students can design their own experiment and meet the expectations of a
college experimental design course. The guided labs (one procedure, one right way) stay as they are;
this mode sits on top of the same benches, props and zoom levels.

The idea in one line: **the student makes the design decisions, the sim plays the role of nature
(with realistic noise and hidden traps), and the feedback grades the design, not just the result.**

---

## 1. Course expectations → features

| What the course teaches | What the sim needs | Section |
|---|---|---|
| Question → testable, falsifiable hypothesis | Hypothesis builder with a directional prediction and a null | 2a |
| Independent, dependent and controlled variables | Variable picker: factor levels, a defined measurement with units and timing, a list of things held constant | 2a |
| Controls (negative, positive, vehicle) | Control types the student must choose and justify | 2a |
| Experimental unit, replication, pseudoreplication | Units are explicit objects (pot, jar, plate, animal); the sim knows what's shared | 2b, 3 |
| Randomization and blocking | Randomize button, block assignment, and a bench with hidden gradients that punish neither | 2b, 3 |
| Factorial designs and interactions | Factorial grid builder; truth models with real interactions | 2b, 4 |
| Sample size and power | Budget limits, pilot runs, power estimate from the pilot | 2b, 6 |
| Measurement and error | Instruments with resolution and human error; blinding | 2c, 3 |
| Analysis that matches the design | Built-in plots and tests chosen from the design, with assumption checks | 2d |
| Type I and II errors, p-hacking | Re-run the same design 100 times; preregistration lock | 6 |
| Reproducibility and methods writing | Auto-drafted methods, shareable designs, class replication | 2e, 7 |
| Correlation vs. causation | Observational mode where you can't assign treatments | 5 |

---

## 2. The student's workflow

### 2a. Plan

A design worksheet the student fills in before touching the bench. Each field is checked.

| Field | What the student enters | What the sim checks |
|---|---|---|
| **Question** | Free text, picked from a prompt list, or their own | none (any question is allowed) |
| **Hypothesis** | "If [factor] increases, then [measurement] will [increase / decrease / peak], because [reason]" plus the null | Has a direction, names a measurable outcome, can be false |
| **Factor(s)** | Chosen from the experiment's available dials, with levels (e.g. salt 0, 0.5, 1, 2%) | Levels span a sensible range; a zero or baseline level is included or a control is named |
| **Measurement** | Chosen from the experiment's metrics, with units, timing and method (e.g. "frond count on day 7, counted by eye") | Defined precisely enough to repeat |
| **Held constant** | A checklist of other dials the experiment exposes (light, temperature, volume, seed lot…) | Flags any that will vary unless the student fixes them |
| **Controls** | Negative, positive, vehicle or sham, and why | Warns if a control differs from the treatment in more than one way |
| **Experimental unit** | What gets the treatment independently (the pot, not each seedling) | Matches how treatments are actually applied |
| **Analysis plan** | Which comparison or test, decided now | Fits the design (see 2d) |

### 2b. Set up

The bench becomes the layout tool, built on the experiment-set layout helper from QUESTIONS.md.

- **Units on the bench.** The student places jars, pots or plates on shelves, a windowsill or in an
  incubator. Space is limited, as in a real lab.
- **Assign treatments** by hand, or with a **Randomize** button, or **by block** (one of each treatment
  per shelf, per day, per batch).
- **Factorial grid.** Pick two factors and their levels; the sim lays out every combination × replicates.
- **Budget.** Each experiment has limits: number of jars, seeds, plates, microscope time, days in the
  term. Students trade replicates against levels against factors, which is the real constraint.
- **Labels.** Students can code the labels (A, B, C…) so measurement is **blind**. The code key is
  hidden until analysis.

### 2c. Run and measure

- **Timeline in days.** The existing scrubbable timeline, stretched to weeks, with a daily view.
- **Scheduled measurements.** The student chooses when to measure. Each measurement costs time (a
  meter on the screen), so measuring everything every hour isn't free.
- **Measurement actions are real interactions:** counting fronds, reading a ruler, timing disks with
  the stopwatch, counting Daphnia beats under the microscope, reading a pH strip. The zoom levels from
  MICRO.md appear when the measurement needs them.
- **Things go wrong at realistic rates:** a plate gets contaminated, a seedling dies, a jar is knocked
  over. The student decides how to handle missing data and must report it.
- **Lab notebook.** Every action and value logs automatically with the date; students add notes.

### 2d. Analyze

| Tool | Details |
|---|---|
| **Data table** | One row per unit per measurement (tidy format), with treatment, block and unit ID. Export to CSV for R, Python, Sheets. |
| **Plots** | Raw points with mean and confidence interval (never bars alone), dose-response curves, time series per unit, interaction plots for factorial designs |
| **Tests matched to the design** | t-test, paired t-test, one- and two-way ANOVA, regression, chi-square for counts, repeated measures. The sim suggests the test from the design and warns when the chosen one doesn't fit (e.g. a t-test on pseudoreplicated seedlings) |
| **Assumption checks** | Normality, equal variance, independence, with plain-language explanations and alternatives (transformations, nonparametric tests) |
| **Effect sizes** | Difference in means, % change, slope, with confidence intervals alongside p-values |
| **Multiple comparisons** | Warns when many tests are run and offers corrections |

### 2e. Report

- **Methods drafted from the design:** units, n, randomization, blocking, measurement method and
  timing, in the past tense, for the student to edit.
- **Results figures** exported from the plots.
- **Conclusion prompts:** does the result support the hypothesis, what are the limitations, what
  would you change.

---

## 3. Nature's side: the variability model

The sim has to behave like real biology, or the design lessons don't land. Every experiment defines
these, and the instructor can adjust them.

| Source of variation | Example | What it teaches |
|---|---|---|
| **Unit-to-unit variation** | Each seed has its own vigor; each Daphnia its own resting heart rate | Why you need replicates |
| **Shared-unit effects** | Seedlings in one pot share soil and water; colonies on one plate share agar | Pseudoreplication |
| **Batch effects** | Seed lot, agar batch, day of the week | Blocking |
| **Hidden gradients** | One end of the windowsill gets more light; the top incubator shelf runs warmer; a draft near the door | Randomization |
| **Measurement error** | Ruler resolution, miscounting, reading a color strip, timing by hand | Instruments, blinding, repeated measurements |
| **Observer bias** | If labels aren't coded, measurements drift slightly toward the hypothesis | Blinding |
| **Mishaps** | Contamination, death, spills | Missing data and honest reporting |
| **Time effects** | Growth slows, enzymes lose activity, cultures crash | Timing of measurements, repeated-measures designs |

**Implementation fit with Lab:** every unit draws its own variation with `reseed('unit', id)` and
`gauss()`, so a design replays identically (Lab's replay rule), but a classmate's run with a
different session seed gets different noise. That makes "replicate a classmate's experiment" a real
exercise.

---

## 4. The truth model behind each experiment

Each experiment is defined by data, not custom code, so new experiments are mostly configuration:

```js
{
  id: 'duckweed',
  unit: 'cup',                          // what a treatment is applied to
  subunits: 'frond',                    // what students might wrongly count as replicates
  factors: {
    salt:  { unit: '%',  range: [0, 3],   default: 0 },
    light: { unit: 'h/day', range: [0, 24], default: 12 },
    nitrate: { unit: 'mg/L', range: [0, 50], default: 10 },
  },
  responses: {
    fronds:  { unit: 'count', measure: 'count by eye', error: 'miscount ~3%' },
    area:    { unit: 'mm²',  measure: 'photo + grid', error: '±5%' },
  },
  truth: (f, day) => /* growth rate from salt (declining), light (saturating), nitrate (optimum),
                        with a salt × nitrate interaction */,
  noise: { unit: 0.12, batch: 0.05, gradient: { light: 'windowsill', strength: 0.15 } },
  mishaps: { death: 0.02 },
  budget: { units: 24, days: 14, measurements: 60 },
}
```

**Truth shapes to cover**, because students need to meet each kind at least once:
- **Linear / monotonic:** more salt, less growth.
- **Saturating:** more light helps, then stops helping.
- **Optimum:** enzymes peak at one temperature or pH, then fall off. Students who only test two
  levels miss it.
- **Threshold:** nothing happens until a dose, then a lot.
- **Interaction:** fertilizer helps only when there's enough light.
- **No effect:** sometimes the honest answer is "no difference", which teaches power and
  non-significant results.

**Instructor settings:** effect sizes, noise levels, which gradients exist, budgets, and whether the
truth is revealed afterward.

---

## 5. Observational mode

Some questions can't be answered with an experiment (you can't assign shade to a forest). A field
mode where students **sample** instead of **assign**:
- Quadrats on a virtual field with sun, shade, mowing, soil moisture.
- Confounders built in (shady spots are also wetter), so a correlation appears that isn't causal.
- A follow-up where they turn the observation into a manipulative experiment and compare.

---

## 6. Feedback and statistics lessons

| Feature | What it does |
|---|---|
| **Design critique before running** | Flags pseudoreplication, confounding, missing controls, low n, unblinded measurement, and unrandomized layout on a known gradient. Students can run anyway and find out. |
| **Pilot run** | A small, cheap first run; the sim estimates variability from it and suggests the n needed (power analysis) |
| **Run it 100 times** | Repeats the student's exact design with fresh noise and shows how often it finds the effect (power) and how often it finds one that isn't there (false positives) |
| **Reveal** | After the report, shows the hidden truth model, the gradients and what each design flaw cost |
| **Preregistration lock** | The hypothesis and analysis plan lock before data appears; changes afterward are logged and shown in the report |
| **p-hacking demo** | Lets students "try every test and every subset" and shows how quickly a false finding appears |

---

## 7. Class and instructor features

| Feature | Use |
|---|---|
| **Assignment setup** | Choose the experiment, allowed factors, budget, noise, hidden truths, deadline |
| **Class dataset** | Pool every group's results to show how individual studies scatter around the truth (a mini meta-analysis) |
| **Replication exercise** | Groups swap designs and rerun them with new noise; compare conclusions |
| **Rubric view** | Scores the worksheet, the layout and the report against course criteria, with the critique flags as evidence |
| **Export** | Data, figures, notebook and methods for grading in an LMS |

---

## 8. Which experiments to support first

The picks that made the launch and first-year lists are in [ROADMAP.md](ROADMAP.md).

From the list of experiments students typically design, these fit the model best and reuse the most
existing work:

| Experiment | Factors | Measurement | Built-in traps | Zoom |
|---|---|---|---|---|
| **Leaf-disk photosynthesis** | light color, distance, bicarbonate, temperature | time to float (ET50) | lamp heat confounds distance; disks from one leaf aren't independent | O₂ from chloroplasts filling air spaces |
| **Catalase** | temperature, pH, enzyme amount, substrate amount | foam height, disk float time | optimum missed with two levels; timing by hand | enzyme splitting H₂O₂; unfolding with heat |
| **Duckweed / seed germination** | salt, light, nutrients, pollutants | frond count, % germinated | windowsill gradient; seeds in one dish pseudoreplicated | root cells shrinking in salt |
| **Disk diffusion** | substance, concentration | zone diameter | disks on one plate share agar; measuring bias without blinding | bacteria bursting near the disk |
| **Daphnia heart rate** | caffeine, temperature, alcohol | beats per minute | individual variation; counting error; order effects | the heartbeat under the microscope |
| **Yeast fermentation** | sugar type, sugar amount, temperature | balloon size, gas volume | interaction (sugar × temperature); batch of yeast | glucose to ethanol and CO₂ in the cell |
| **Pillbug choice** | wet/dry, light/dark, food | count per zone over time | repeated counts aren't independent; animals reused | (behavior; no zoom needed) |

**Build order:**
1. The experiment model (section 4) and the variability engine (section 3), using Lab's seeded `rand()`.
2. Design worksheet and layout tool, starting with leaf disks (already in Lab) and catalase.
3. Data table, plots and the core tests (t-test, ANOVA, regression).
4. Critique, pilot, run-100-times and reveal.
5. Class dataset and instructor setup.
