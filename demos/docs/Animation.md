<!-- KIND: rulebook — load whole before animating a machine in a component or lesson, or improving an animation that exists: a rotor, a pump, a particle's route, a queue, a tempo. Molecule-scale effects (shockwave, shimmer, silence) are SCIENCE.md §5 and Modules.md's "Effects". -->

# Animation

An animation is a chain of claims: where a thing is, what moved it, what it became. These rules keep the claims true and make them visible. Each names the code that carries its reasoning; read that header before changing the behaviour.

Worked examples: `chemiosmosis/circuit.js` (the synthase's ring riders, the ATP's way out), `proteins/atp-synthase/atp-synthase-scene.js` (the measured enzyme).

## 1. What a motion claims

* **A pile-up is a modelling error.** Surplus ATP heaping in the cytosol meant demand was missing from the model. Fix the rate that is wrong, never the pile. Do the supply and demand arithmetic from the constants before tuning anything: it showed a 10x gap that no pump speed could close.
* **Put the particle where the chemistry happens.** A proton docks on a c subunit at mid-membrane and rides the ring's outer face, because that is where the Glu is. A lane straight through is a tube the protein does not have. If the file header describes the real path, the drawing owes it.
* **The causal event drives the motion.** Binding is the rotor's notch, so the notch fires on binding, and the ledger counts at that same event. One event, one place in the code: the picture and the numbers then cannot disagree. `boardRing()`.
* **Start in steady state.** A real c ring is always loaded. Starting empty shows a filling transient that never happens in a cell, and the first student sees protons go in and none come out. `seedRing()`.
* **Conserve what you draw.** Anything pre-seated or parked comes out of the existing pool and keeps counting on the side it came from. Seeding the ring moves no pH. Charge crosses when the particle exits, so that is when mV moves.
* **Draw the structural number, declare the rounded one.** A student can count rods, so the ring turns one rod per proton. A classroom rounding (9 H⁺ per 3 ATP on a c8) lives in the ledger with a comment that says it is rounded.
* **Only fade what is consumed.** A fade reads as ceasing to exist. Matter that persists leaves the frame; matter that is spent may fade where it is spent. `AWAY` in the synthase scene.

## 2. Staging

* **One event, one beat.** A thing that appears and leaves in the same instant is never seen. Emerge, hold, travel: `ATP_EMERGE`, `ATP_LINGER`, then the route.
* **Things come out of the machine that made them.** Start the product inside the body, where the site is, and let the surface hide it until it clears. Popping in beside the machine reads as unrelated to it.
* **Route around bodies, never through them.** The ATP arcs under the head. A straight line through a protein is a claim that the protein is not there.
* **In and out use opposite sides.** ADP and Pᵢ enter the head on the stalk side, ATP leaves by the free flank. Crossing traffic hides both.
* **One tempo, tuned as a unit.** Period, step time, approach and drift scale together, or the rotor outruns its protons. A discrete step stays long enough to read as a click; if a ring starts to glide, lengthen the step first.
* **The queue is part of the picture.** Only the next one goes to the machine; the rest wait where they are, in order. A crowd at a door reads as a jam, which is a claim about rate (§1).

## 3. Building and checking

* **Put the behaviour in the shared layer, then test every consumer.** The thylakoid's synthase got the riders and the arc from `circuit.js` for free, so `/photosynthesis` is part of testing a respiration change.
* **One WebGL scene animates at a time.** A stage behind a modal stops on show and starts on hide; a second box is mounted per open and destroyed on close.
* **Verify by driving the clock.** A hidden tab never runs rAF. Call `pump(dt)` or `advance(dt)` in a loop and log positions: a traced path is evidence, one screenshot is not. Every animated thing therefore needs a clock a test can drive.
* **Check the field name before adding state to a shared object.** A chip, a traveller and a leg are open bags that several features write to. `hold` was already a queue flag.
* **Pace, framing and whether a beat reads are the human's call, in Safari.** Say what to open, what to watch, and which constant changes it.
