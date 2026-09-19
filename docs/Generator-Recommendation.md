<!-- KIND: argument. A recommendation for what a generated app IS once Beta is over: a document the shell renders, not an HTML string. Written for the human deciding what to build; it is not a recipe and nothing here is built. Read demos/docs/Generator.md first, which is how the generator works today and what its runs measured. Build-Updated.md is the plan this slots into. -->

# The generator: store a document, not a page

`Generator.md` describes a loop that is well tuned: one cached reference, a draft checked and retried once, edits as find/replace pairs at a twelfth of the output, a runtime error relay, text edited by hand with no model turn. None of that is what this document argues with. It argues with one decision underneath it: **the stored app is an HTML string.**

## 1. What a generated page is made of

Read `tests/gen-salmon-n4.html`. It is a `LessonShell.create({ steps: [...] })` call. Each step is four text fields, the parameters the scene takes on that step, and an `onEnter` that writes a panel of stat tiles or sliders as a template string and wires two or three of them. The part that is logic, in the sense that no table could hold it, is a few lines.

Tallied across the 35 pages in `tests/gen-*.html` on 2026-09-19, by grep:

| the page has | pages |
| --- | --- |
| a `ctx.ui.controls` panel | 30 |
| stat tiles | 27 |
| a readout painted from `on('frame')` | 24 |
| a range slider | 19 |
| buttons | 14 |
| a `Graph` | 2 |
| its own canvas or SVG | 1 |
| a `<select>`, a timer, a `fetch` | 0 |

26 of the 35 carry a `<style>` block, and nearly all of that CSS is one thing: a coloured status badge (`.flux-badge`, 16 rule occurrences; `.tag-hypo`, `.state-tag` and the like once each). It is written with typed colours (`#ef4444`), which is the rule CLAUDE.md states for atoms and the shell's tokens exist to prevent.

So a generated app today is text, scene state, five kinds of widget, and a badge the library does not have yet.

## 2. What the string costs

Each of these is in `Generator.md` as solved or as not built, and each exists because data is held inside JS literals inside a string:

* **Text mode's round-trip machinery** (§7): a passage is editable only if it is found exactly once in the source; duplicates are told apart by their field or the markup before them; a replacement is escaped for whichever of three contexts the match landed in; `api/app.js` syntax-checks the splice because a wrong guess is a broken app.
* **`data-live`**, which exists so a readout's first value, typed into the source by the model, is not mistaken for authored text.
* **The find that misses.** An edit falls back to the whole file at about three times the cost, and §5 says the spread in a session's bill is almost entirely that rate.
* **The outline cannot reorder, insert or delete** (§8), because those are structural edits to an array literal and would need a lexer.
* **The page grows with every turn** and rides uncached in each edit, which §5 measured as the expensive half.
* **Delivery is spliced at mount** (`Build-Updated.md` §7), because a page that names script tags cannot survive the library changing how it is delivered.

`Generator.md` §6 has the finding that matters: the cheapest edit is the one the library makes trivial, and no format change matched giving the component the parameter. This recommendation is that finding applied to the page's structure.

## 3. The recommendation

**An app is a JSON-serialisable document. The shell renders it. The server writes the HTML around it at mount, and nothing stores that HTML.**

The document holds:

* `template` and the components it mounts, which is what `data-shell` and `data-use` say today.
* `steps[]`: `eyebrow`, `title`, `body`, `nextLabel`; which scene the step shows; the `set` parameters the scene takes on entering; its notes and layers.
* **Declared widgets per step.** A readout bound to a key of the component's `state()`, with a label, a unit and a format. A slider, a toggle or a choice bound to a parameter. A badge bound to a state key with a value-to-tone map, the tones being the shell's tokens. A `Graph` bound to state. The shell draws them, so every readout is `data-live` by construction and no colour is typed.
* **`onEnter` as a code string, optional.** The escape hatch, for what is logic: a derived quantity, a condition across two components, a sequence. It receives the same `ctx` it does today.

The model replies with the document through the provider's constrained output, so a malformed draft is not a case. `Components.md` keeps its sections; what changes is the page skeleton at its top and one new section for the widget vocabulary.

**An edit is a patch on the document**: a path and a value. It cannot miss, so the whole-file fallback goes. The find/replace pair survives in one place, inside an `onEnter` string, where it is the right tool.

## 4. What it makes cheap

* **Text mode is a field write.** Every authored passage has a path. Refusing a readout, disambiguating a duplicate and escaping for a context stop being problems. The role palette and the inline marks are unchanged, since `body` is still the same small HTML.
* **The outline can reorder, insert and delete**, as array operations, with no model turn.
* **Pose, then snapshot.** Every component has `set` and `state`. With parameters declared (`Build-Updated.md` §10), the builder shows real controls for the mounted component; a teacher drags the membrane to the state she wants and saves it as the step's parameters. Direct manipulation is what a builder for 3D scenes should feel like, and a string cannot offer it.
* **A smaller uncached half.** The document is the page minus its boilerplate, and a patch turn can be sent the step it concerns plus an index of the rest.
* **Steps the rest of the product can read.** `/teach` can report progress by step title. A shared app can be given a baked text section the way a lesson is, if one is ever made public. A translation is a second set of text fields.
* **Validation with an address.** A parameter out of range is reported at `steps[2].set.curve`, to the model in the repair turn and to a person in the builder.

## 5. The risk: the templates have to be wide enough

This works only if templates and widgets cover what people ask for. If they do not, every request lands in the escape hatch and the document is a string with extra steps.

**The tally in §1 does not settle it.** The model builds what `Components.md` shows it, so the eval set measures the reference's reach, not what users want. The evidence is the request text in `app_versions`, which `tools/prompts.html` already lists. Read, before building anything:

* edits that fell back to the whole file, and what they asked for
* turns whose reply added CSS or a new element kind
* requests whose summary declined, or built something adjacent to what was asked

**What would change the recommendation:** requests for things no panel vocabulary holds, such as a student's own drawing, uploaded data, or game mechanics with scoring and state across steps. If those are common, HTML stays and the effort goes into §7 instead.

Two design rules keep a thin vocabulary from becoming a wall:

* **A request the widgets cannot express falls through to code, never to a refusal.** Every use of `onEnter` is logged with the request that caused it. That log is the backlog for the next widget, and its rate is the measure of whether the vocabulary is wide enough. It is the repo's existing rule (a mistake the model keeps making is fixed in the library) pointed at users' wants as well as the model's errors.
* **Templates and widgets are different questions.** A template is the page's pacing: `steps`, `sandbox`, and perhaps later a side-by-side comparison or predict-then-reveal, each earned the way `Generator.md` §3 says, by being chosen correctly. Widgets are what stands in the panel. Most customisation is scene state, text and widgets; the first two are already free and the third is small.

## 6. Migration

Gradual, and the contract version (`Build-Updated.md` §7) is what allows it.

1. **Read the request log** (§5). An hour, and it decides the rest.
2. **The badge, in the shell.** Worth doing whatever is decided: it removes most generated CSS and every typed colour, under today's format.
3. **Declared widgets as a `ctx.ui` call**, still under today's format: `ctx.ui.readout({ label, from, key, unit })` beside `ctx.ui.controls`. The reference prefers it; the eval shows whether the model picks it and what it still reaches past it for. This tests the vocabulary before anything depends on it.
4. **The document form**, as a new contract version. `LessonShell.create` already takes nearly this shape, so the renderer is small. `api/_builder.js` gains the schema and the patch applier; `gen-app.js` is unchanged in kind, since it is the same module over another transport.
5. **Text mode and the outline move onto paths** for documents, and keep today's machinery for stored HTML apps. No stored app is converted: a converter would be a lexer for model-written JS, which is the thing this design exists to avoid. A remix of an old app is a model turn that writes it out as a document.

**What is lost:** much of `build/app-edit.js` retires for new apps, and it works. The widget vocabulary becomes a second reference to keep as carefully as the component sections. And a model is more fluent in HTML than in any schema of ours, so step 3's eval is where that fluency is priced.

## 7. Worth doing whatever is decided

* **Walk a draft before showing it.** The 2026-09-09 salmon draft passed every source check with an empty stage, and the error only reached the model on the student's next turn. The builder mounts a draft hidden, calls `goTo` on every step, pumps each scene a few seconds, and collects what the relay reports; one repair turn runs before the student sees anything. The relay and the outline's `goTo` both exist.
* **Start from vetted apps.** Most teachers want a good app adjusted for their class more than an empty box. Remix exists in `api/app.js`. A shelf of curated, driven apps per unit as the builder's front door raises quality and lowers cost more than a prompt change can, and each one is an eval page that earns its keep.
* **Drive the eval by script.** `Generator.md` §4 says a page that only runs has not been checked, and the checking is by hand. The smoke run (`Build-Updated.md` §5) can walk every `gen-*` page the way the builder would; a seeded `step(dt)` (§10 there) makes the result comparable between runs.

## 8. Leave alone

* **The one cached reference.** `Generator.md` §5 measured that it is not the expensive half of an edit. Split it per component when the eval shows the model choosing the wrong component, which is a quality signal, and not before for cost: a prefix per component set fragments the cache, and a cache write costs more than any single turn.
* One module, two transports, so the eval and the product cannot drift.
* The source checks and the single retry.
* Selection pills, and a note sent as its key.
* The role palette, and no typography controls.
* The `srcdoc` sandbox on an opaque origin.
