<!-- KIND: reference + argument — how a page is generated from the component library, what it costs, what the runs showed, and what the builder backend does. Load when working on tools/gen-app.js, api/_builder.js, the reference the model is handed, or the builder pages and endpoints. -->

# The generator

A student's app is one HTML file that mounts components from the library. The model that writes it is given exactly one document, `docs/Components.md`, and a request. `tools/gen-app.js` is that in a script, and it is also the eval: every change to the reference or a component is judged by rerunning the same requests and driving the pages.

## 1. How it works today

```bash
node tools/gen-app.js "a teacher's request" tests/gen-<name>-test.html
node tools/gen-app.js --edit tests/gen-<name>-test.html "the student's next message" tests/gen-<name>-2.html
node tools/gen-app.js --edit <page> "..." <out> --whole      # the old whole-file edit, kept as the baseline
```

- **One module, two transports.** `api/_builder.js` holds the prompts, the reply shapes, the edit applier and the source checks. The script writes a file; `api/build.js` writes a row. Neither holds a prompt, so the eval and the product cannot drift.
- **System prompt**: a four-sentence preamble, then the whole of `Components.md`. Byte-stable across drafts and edits, so the provider caches it once; the cost line prints `cached` so you can see it read back.
- **A draft** is `Request from a teacher: …` and the model replies `{title, summary, html}`. The page is checked (`validate`: scripts only from `../` or the one CDN, every `mount` on a component the reference names) and retried once with the problems quoted if it fails. A page that passes and is wrong is a finding.
- **An edit** carries the page in the uncached half and the request in the message, and the model replies `{summary, edits: [{find, replace}]}`. Each find must occur exactly once; the list is applied here. A miss falls back to one whole-file call with the misses quoted, and then stops.
- **The page carries its history**: a `<!-- requests -->` comment after the doctype, oldest first, rebuilt after every turn. The model is told to leave it alone.
- **Model**: `gemini-3.7-flash` by default, `--provider anthropic` or `--model` to change. Default thinking on a draft, low on an edit. `maxOutputTokens` 16,000 for a page, 6,000 for edits. Keys from `.env.local` at the repo root.
- **Output**: one JSON line with the model served, time, input, cached and output tokens, dollars, and for an edit the route (`edits`, or `whole` with the reason). That line is the cost model; keep it. It counts cache reads and output only, never the write or the hourly storage: §5's session note says what that hides.

## 2. What the reference is

`Components.md` is the product's prompt. It is written to be handed to a model as its only context: the page skeleton, the two templates and when to pick each, the contract every component shares, the scale ladder, one section per component in a fixed shape (a `**Scale**` line, the mount call with every param commented, what it models, the `state()` table, events, anchors, layers, Good for and Not for), and the copy rules. **No section carries a script list** — `kit/app.js` owns the load order. It grew from about 6,000 tokens at five components to roughly twice that at eleven; the cost line's `cached` count is the number to trust, and every section costs every request.

The rules that have held, learned from runs rather than guessed:

- If the section does not say it, the model does not know it. Nothing else reaches the model.
- Anything the reference says twice, or says as a rule in prose, should be a default or an enforcement in the library instead. Every rule the model broke was fixed that way: the particle budget, protein spacing, the view offset, the second script for notes.
- Do not add example pages to the prompt. A designed example lives in the repo as the standard and feeds three or four lines into the section; pasted whole it triples the prefix and the model copies its subject.
- The copy rules are load-bearing. "Show, do not tell" plus the notes and layers API is what turned four edits from paragraphs into callouts.

## 3. Adding a template

A template is the page's shape: how the panel is paced. There are two, `steps` and `sandbox`, and a page picks one with `data-shell` on the loader tag. Six things, and only two of them are prose the model reads.

1. **`kit/<name>-shell.js`, built on `LessonShell.create`.** Not beside it. The step-through owns the panel, `ctx`, `ui`, `viewOffset`, `theme` and the stage, and a template that reimplements any of those forks the reference: `ctx.q` has to mean one thing or every component section needs a copy per template. `kit/sandbox-shell.js` is the worked case, and it is fifty lines of which forty are the header. Where the base genuinely cannot express the shape, add an option to `lesson-shell.js` whose default is today's behaviour (`chrome:'none'` is one) rather than a second copy of the panel.

   **The boxes are the base's too.** `shell.scene(name, mount)` builds one full-bleed layer per component inside the stage and shows the one a step names; a template that wants them side by side, or two thirds and a third, styles `.lshell-scene` under its own class and calls `showScene` with several names — the stage already goes to equal columns under `.is-split`. It also rations the contexts: four scenes stay live and the least recently shown is destroyed, which is why `scene()` hands back a handle rather than the component. A template that mounts components itself takes on their visibility, their start/stop and their destroy, which is the base's job, and the reference would need a copy of "a second component is a second box" per template. `shell.viewOffset` is the one piece a column layout has to replace: it assumes the canvas is the window, so a half-width column reads the panel's overlap wrong.

2. **A line in `kit/app.js`'s `SHELLS`**: the global a page enters through, and the files to load after `lesson-shell.js`. That is the whole registration — `api/_builder.js` reads this table, so nothing else names the template anywhere in the backend.

3. **A row in Components.md's "Which template" table**, and this row is the one that decides whether the template is ever used. Not what it looks like: **when to reach for it**, in the words a request would arrive in. "A request that says show me why is a step-through; one that says let me try is a sandbox." A row describing the layout produces a template the model never picks.

4. **A short section, with one `create()` block and nothing else.** No example page: §2's rule, and a template is the worst case for it, because an example of a template IS a whole page and the model copies its subject along with its shape. The block shows the call, one control, and the line that wires a readout. Say only what differs from the step-through, then say the rest is the same, by name: `shell.stage`, `shell.viewOffset`, `goTo(0)` last.

5. **A bench in `tests/`, carded in `admin.html`.** This is the designed example §2 means, and it is what the block in step 4 is distilled from. It is also the regression test: it is the only place the template is exercised until a student generates one.

6. **One `gen-app.js` run whose request should land on the template, and one that should not.** A template earns its place by being chosen correctly, and the failure that matters is not a broken page — it is a sandbox request that came back as a step-through, which reads as a fine page and is the wrong answer. `build.js` returns `shell` on every draft for exactly this: the choice is visible without opening the page.

**What does not need doing:** no page on an existing shell changes, and no component changes. A template that cannot be added without touching either is a template that has broken the contract in step 1.

## 4. The eval set

Every generated page that taught something is in `admin.html` under Generated apps with the `UGC` badge, and the request that made it is on its card. One of them must be an EDIT that asks for a second scale ("show me where in the cell this happens"): the mount into an element another component already fills renders, so it only shows up by driving the page. Rerun those requests after a change and drive the result: load it, read the console, `pump` the sim by hand, check the numbers and the notes. A page that only "runs" has not been checked; both real defects found so far (a frame cost, a noisy readout) were invisible without driving.

## 5. What the runs measured

First generation, one request, no examples:

| request | input | output | thinking | time | result |
| --- | --- | --- | --- | --- | --- |
| red blood cell, three solutions, sidebar | 2,842 | 2,912 | 1,861 | 19 s | worked first try |
| three-step swelling lesson, shell | 4,454 | 4,106 | 1,555 | 18 s | worked first try |
| "How do salmon go from ocean to freshwater?" | 4,427 | 2,295 | 2,101 | 14 s | a three-step lesson; forgot the view offset |
| the same, after the leak channel existed | 6,196 | 3,080 | 2,333 | 17 s | used the leak channel unasked; spaced proteins too close |

Edits, the whole file returned each turn, before and after the components had notes and layers:

| student message | before | after |
| --- | --- | --- |
| what does the urine do? | a stat tile plus prose | the same, correctly: nothing on stage to point at |
| what are the two pumps? | a callout box in the panel, on every step | `m.notes(['channel.K', 'pump'])` |
| what are gill epithelium? | renamed everything, body at 780 characters | one note on the bilayer, body at 440 |
| speed up the simulation | invented a control and a pump hack, 3,700 thinking tokens | `timeScale: 2.5`, 900 thinking tokens |
| what's the purple thing? can I see it without the water? | not run | `ctx.ui.showPanel(m)` per step |

Every whole-file edit cost about 2,500 output tokens and 8,000 input, of which the reference half is cacheable, at 10 to 15 seconds. The saving from notes and layers was in what the page became, not in the bill.

The same turn as find/replace pairs, once the format was built (2026-09-03, reference at 6,512 cached tokens):

| turn | route | input | cached | output | time | cost |
| --- | --- | --- | --- | --- | --- | --- |
| "make the first step's text shorter, one paragraph" on gen-salmon-n5 | 1 edit | 2,652 | 6,512 | 205 | 2.1 s | $0.0032 |
| "put a note on the aquaporin in the hypotonic step" on gen-rbc, through the builder page | 4 edits | | 6,512 | | 2.8 s | $0.0043 |
| a fresh draft, "a red blood cell in three solutions, with a sidebar" | draft | 17 | 6,512 | 3,478 | 10.1 s | $0.0135 |

Output fell about twelve to one and the turn from 10 to 15 seconds to 2 to 3. The draft's 17 uncached input tokens are the request; everything else read back from the cache.

### What a session costs (2026-09-10, reference at 16,202 cached tokens)

Per turn, from the tables above plus one fallback measured today:

| turn | ≈ cost |
| --- | --- |
| draft | $0.011 |
| edit that stays on pairs | $0.004 |
| edit that falls back to the whole file | $0.0138 |

A student making three apps and editing each four times, with a fifth of the
edits falling back, is **about $0.10**, or $3 for a class of thirty. The spread
is almost entirely the fallback rate: all-pairs is $0.08, all-fallback is $0.20.
The edit's output is what makes it cheap — 178 to 205 tokens against a draft's
2,500 — so an edit's bill is mostly the page riding in uncached, which grows
with every turn. At the median generated page (7,180 characters, ~3,000 tokens
at the 2.41 chars/token these pages measure) that is $0.0023, twice what the
whole reference costs cached. **The reference is not the expensive half of an
edit and never was.**

**Every figure in this section is a read-only number, and understates.**
`usageMetadata` reports neither the cache write nor the hourly storage, which
`_providers/gemini.js` says in its header and the cost line cannot know. A write
is the whole prefix at input rate — $0.0122 today, larger than any single turn
above. On the server that is amortised: the map is module state, so it is one
write per warm instance per hour across every student on it. **Locally it is
not.** `gen-app.js` is a fresh process per invocation, so every eval run writes
a cache, reads it once and abandons it for the hour: a ten-run sweep prints
about $0.10 and actually costs about $0.22. Running a sweep in one process would
pay one write for all of it, and `system()` is byte-stable and `cacheFor`
registers its promise synchronously, so nothing else would have to change.

## 6. What is built, and what an edit still cannot do

Built, in `_builder.js` and measured above: the pair format with its whole-file fallback, the history comment, one retry on a failed source check, low thinking on edits. Built in the builder page: the runtime error relay, so a page that throws in the browser tells the next turn what it threw. The script cannot run a page, so it never sees a runtime error; that loop only closes through the page.

Still true: the cheapest edit is the one the library makes trivial. Thinking tokens fell from 3,700 to 900 on the same edit once the component had the parameter, and no format change matches that.

## 7. Editing the text by hand

A model turn is not the only way a page changes. **Text mode** (`build/app-edit.js`, the rail's second tab) lets a student click a passage in the running app and type over it, and everything about it follows from one test: **a text is editable if it round-trips to the source.**

Every word a generated page shows is a string literal in its file — `eyebrow`, `title`, the `body` HTML, a label inside a `ctx.ui.controls` template. Find the node's text in the source exactly once and the change is a `{find, replace}` pair, which is the format `_builder.js` already applies; the model is not called, the turn is free and instant, and it lands in the history as a version like any other. Find it zero times or twice and the passage is not editable, and no pencil appears on it.

**A duplicate is disambiguated by its context, not refused for being one**, and the find widens to carry whatever tells it apart. Two ways, because the DOM knows two things:

- **The field it is written under.** A step's `nextLabel` names the step after it and that step's `eyebrow` repeats the words, so neither is unique alone and both are with their key: the find becomes `eyebrow: 'Hypotonic Solution'`. `KEYS` maps the shell's class names to the five fields that hold a page's words. Across the eval set that is every short-field duplicate there is — 11 of 217 were blocked, 11 are reachable.
- **The markup around it.** The same sentence in a `callout` and in a `lead` is the same words in different blocks, and what the DOM knows is what comes immediately before: a sibling tag that just closed, or, when the text is first in its element, that element's own opening tag. One of those is in the file right before one occurrence and not the other, so the find widens back through whole tags until it is unique — `</strong>Water is pushed…` against `<p class="lead">Water is pushed…`.

What the DOM cannot say, neither does: two passages under the same key, or one preceded by more text, stay ambiguous and stay refused.

The test refuses a callout's label without being told to: it comes from the component's own library, so it is not the page's to change. **A match must also be the whole authored passage**, bounded by a quote or a tag either side — the bench caught the shell's own `Back` matching inside `nextLabel: 'Back to Start'`, and a chart's `20` tick matching inside `Math.round(mM / 20)`, and the second would have edited the physics.

**A live readout it does NOT refuse, and that was measured rather than assumed.** A readout's first value is written into the source by whoever built the page — `<span class="stat-value" id="vol-val">90 µm³</span>` — so it round-trips like any other passage and the test waves it through; the sim overwrites it on the next frame, the edit is gone, and a misleading number is left in the file. The shell marks its readouts `data-live` — one list, in `lesson-shell.js` beside the sheet that styles them — and text inside one is never edited, only pointed at. That is CLAUDE.md's rule about numbers, enforced where the library already declares which classes hold one.

- **What makes a replacement safe is the context of the match**, read from where it landed. Inside a `<script>` the text is a string literal, so quotes, backslashes and `${` are escaped — all three quote characters, whatever the literal's own delimiter, since knowing the delimiter would mean lexing the script and `\"` inside a single-quoted string is a legal identity escape. Where the enclosing literal holds markup the text is going through innerHTML, so `<`, `>` and `&` become entities; where it does not it is going through textContent and a typed `<` has to stay one. `api/app.js` syntax-checks the spliced page before storing it, so a case this gets wrong is a refused save and not a broken app.
- **The mode is a tab beside History**, not a button on the toolbar, because that is what it is: the rail card shows the app's past or the tools for changing its words, never both. The pane holds the hint, the palette, Cancel and Save, and a log of what the last few clicks landed on; the unsaved count rides on the tab itself, so the mode's one piece of state is legible from the pane the student is not looking at, and leaving with something unsaved asks first. A click on a passage that cannot be typed over prints its tag and WHY — drawn by the lesson template, a callout the component names, a component's own chips, the chart, painted while the app runs, or the same words appearing N times in the file. The sentences live in `build.html`, not in the frame: the frame reports a code and which layer drew it (`data-note`, `.show-panel`, the shell's own classes), and the copy stays on the page a student reads.
- **What cannot be edited can still be pointed at.** A click on a non-editable passage sends it to the request box as a pill, and the pill goes to the next model turn as where to look: the rendered text, the tag, the step, and the nearest passage that IS in the file exactly once. `annotate.js` writes `data-note` on a callout, so a note goes as its key rather than as a label to fuzzy-match, and the named part is selected whole. **It is a selection, not a growing list**: a click IS the selection, cmd or ctrl adds to it, and clicking a picked part again with the modifier takes it out. Putting the caret in a passage is not a reference, so a plain click there leaves nothing selected — a part still lit while the student has moved on to typing somewhere else reads as a selection that will not come off. A click the page itself wants, a Next button or the canvas, is navigation and not a choice, and leaves the selection alone. The frame owns the set because it owns the highlight and hands the builder the whole list each time, so the two cannot come apart; a pill is identified by what it says and where, not by its element, since the panel is rebuilt on every step change and the reference should outlive the element. Selections clear when the request is sent, because a selection is about the sentence being written.
- **One version per session, not per passage**, on a Save button; unsaved edits survive a step change (they are re-applied when the panel repaints) but not a reload. `kind` is `text` in `app_versions`, so restore and the history list work unchanged, and the row names the passage rather than counting the edits.
- **The requests comment is left alone.** It records what was asked for, and a hand edit is not a request; the version row is its record.
- **The bench is `build/edit-test.html`**, which arms the editor on a real generated page with no database and prints the pairs Save would send. It is where both false positives above were found, and it is the regression test.

**The style side is a palette of ROLES, and there are no other knobs.** The shell has no typography utilities on purpose — a font-size or colour control would be the fastest way to make a student's app look broken — so what the mode offers is what a paragraph IS: body, `lead`, `callout`, `foot`, plus `<strong>` and `<em>` inside a line. Each is a tag or a class `lesson-shell.css` already styles, and `Components.md` hands the model the same four names, so an app the model wrote and an app a student edited stay one voice. Adding a role means both files in one commit.

Two shapes of edit come out of that, and the second is why the paragraph, not the passage, is the unit:

- **Inline** is `execCommand` over the selection, not a wrapper of our own, and the buttons read `queryCommandState`. A selection covering part of an existing bold, or two of them and the words between, is what that gets right and what `surroundContents` cannot express: it splits and merges the tags, off is the same press as on, and the button is then honest about what the selection IS. The replacement is the span's children serialized, `strong` and `em` kept, everything else — a paste, a browser's wrapper — flattened to its words, which is the filter that lets the caret be a real `contenteditable`. Offered only in a markup context: a tag inside a `title` would show as a tag, since that goes through textContent.
- **An inline tag around a whole passage is pulled inside it at paint time**, and this is what makes bold reversible. A model writes `<p><strong>The claim.</strong> The rest`, so the tag sits outside the editable span and outside the passage's own find: the browser cannot take it off, and asked to unbold writes a `font-weight: normal` span within instead, which serializes away to nothing — the text reads unbolded on screen and saves unchanged, which is worse than the button not working. Moving the tag inside puts every inline mark in one place; the paragraph becomes the unit from then on, since the tag it used to hold is no longer in the passage's find.
- **A role, a new paragraph, or a deletion** is a class on the `<p>` or the `<p>` itself, so its pair spans the whole element. The bounds are read off the SOURCE, never off `outerHTML` — the browser normalises quoting and attribute order, and a find that has been through that stops matching the file it came from. Two edits over one stretch cannot both apply, so a paragraph that has taken a role writes itself whole from then on and any pair inside it is dropped.
- **A role outlives the element it was put on.** The panel is rebuilt from the page's own strings on every step change, so the `<p>` carrying an unsaved role is thrown away; the role is held against the source region instead, which is the one name for it that does not change, and put back on whatever element is standing in that spot.

### The 2026-09-10 rerun

The same three requests after `data-live`, `shell.q`, `CardStage.fire` and the condense component joined the library. Reference at **15,872** cached tokens, up 1,118 from the section condense added and one clause of mine; cost per draft flat, $0.007 to $0.015. All three passed first try, all three driven, no console errors on any of them.

- **The model writes `data-live` itself**, on the first run after `Components.md` mentioned it, and only on real readouts: `.stat-value` placeholders with ids its own code writes to, and a `.value` on a slider. The cell draft marked a readout of its own shape with no `.stat-value` anywhere, which is what the clause is for.
- **Seeded into the builder and armed**, a page written after the change comes out right end to end: both stat readouts and the counter select-only, the labels beside them editable. Generator → shell → editor, no hand-carried class list.
- `shell.q` went unused this run — the model reached for `ctx.ui.q` correctly all six times. The alias stays as the net.
- `lead` on every step again; `callout` and `foot` unused this run, where the last had two callouts. Variance, not a trend, with one draft each way.

### The 2026-09-09 run

Three drafts (`gemini-3.7-flash`, reference at 14,754 cached tokens), all three passing the source checks first try, at $0.006 to $0.016 and 6 to 12 seconds each. All three were driven step by step.

- **The role vocabulary landed.** Every draft opened each step with `<p class="lead">`, the salmon one reached for `callout` twice unasked, and none of them wrote a `font-size`, a colour or a font. One `style="margin-top:10px"` on a `.stats` container, which `.controls`' own gap already provides.
- **One page came back blank and passing.** The salmon draft wrote `shell.q('#net-flow')` in a module-scope `on('frame')` handler, where there is no `ctx` and the shell is the only handle in reach. It threw inside the render loop every frame, so the scene never drew: source checks green, stage empty. Fixed in the library — `shell.q` and `shell.qa` now exist — rather than by a line in the reference about which object the query hangs off.
- **A selection turn works.** "what is this? explain it", unanswerable alone, with one pill naming the note key `pump` on step 1, came back as one edit — `gill.note('pump', {card: …})` on that step — in 178 output tokens, 2.1 s, $0.0033.

**A subscriber that throws no longer takes the scene down.** The bad `frame` handler above blanked the stage rather than breaking one readout, which is what made a typo look like a broken component. Every component kept its own two-line `emit` that called each listener straight — twelve copies of it — so the fix went into the one module they are all built on: `CardStage.fire(list, args, label)` runs each listener in its own try, reports a thrower ONCE and drops it, and rethrows out of band so `window.onerror` and the builder's relay still see it. Dropped rather than kept, because `frame` fires sixty times a second and a throw a frame is a flood, not a diagnosis: the readout it was painting stops updating, which is visibly broken and honest, and the science beside it keeps running.

## 8. The outline

The step-through is the template nearly every app takes, and reaching step 8 to iterate on step 8's copy meant clicking Next seven times, on every reload. **The rail's Outline tab is the step list, and a row is a jump.**

**It reads the live shell, not the source.** `LessonShell.current` is the shell the page built and `lessonshell:step` fires on every swap, so the list is the steps the app is actually running: titles, eyebrows and the scene each one shows, in the order the shell holds them. The alternative was parsing the `steps: [...]` array literal out of the file, which is a lexer for a list the page can hand over for free. A one-step page is a sandbox and not a walk, so a list of one is no outline and the tab is not there.

The two messages are `app-outline` and `app-outline-go` on the same relay as text mode's, and `go` calls the app's own `goTo`: navigation stays the shell's, and the rail only asks. The push is unsolicited on every swap as well, so the marked row follows the student walking the lesson with Next, not only the rail driving it. The bench is `build/outline-test.html`, the real `Apps.mount` and `Apps.outline` against a generated page on disk, with no database.

Not built: renaming a step from the row, which is text mode's `{find, replace}` on the same passages and should reuse it; and reorder, insert and delete, which are structural edits to a JS array literal rather than string swaps — those belong in a model turn, pointed at the step the way an un-editable passage is pointed at today.

## 9. The hints

Under the request box, one tip at a time, dismissed for good on the cross (`ss.build.nohints` in localStorage). The list is `HINTS` in `build.html`, and it holds two kinds: how to ask for a change that lands, and the two panes beside History that a student would otherwise never open. Eight lines under the box is a wall nobody reads, so it is a carousel — nine seconds, paused on hover, and it stops cycling for good the moment a dot is clicked, since the student is steering by then.

Dismissing is not a one-way door: **Tips** appears in the rail's foot when the hints are off, and puts them back. The foot itself is a line of copy with its buttons under it rather than beside it, because three buttons and a sentence across a 300px rail wrapped the sentence to three ragged lines.

**A hint that has to be retyped is half given.** A hint may carry a `say`, the literal prompt, and it is drawn as a button that puts those words in the box — appended to whatever is already there, since asking for two changes in one turn is itself one of the hints.

**The app's name is the bar's title text, and it is the field.** Click it and type; Enter or clicking away commits, Escape puts back what was there. `api/app.js` has had a `title` action all along and the builder had never called it, so the name a first draft was given was the name it kept. A rename is not a change to the page: it makes no version, it never reaches the model, and the local shelf picks the new name up from `Apps.remember` without a reload.

## 10. The backend

`api/build.js` is the model turn: a first draft makes an app row and returns the edit token once; an edit needs the token and writes a version. `api/app.js` reads a stored page for anyone with the id, and restores, remixes, rotates the token and retitles for the token's holder; it takes no HTML from a caller. `api/_apps.js` is the two tables and the limit, its own constants counted in `app_versions`: 60 model turns an hour per visitor, 200 an hour and 600 a day per cohort, failing open like the tutor's. The same key as the tutor gates it.

**A class builds without accounts.** `api/_access.js` says who a request is: a seat (one student's class code), a teacher code, a cohort key, or nobody. A seat or teacher code admits on its own and owns what it makes, in `apps.owner_id`, so `mayEdit` passes on owner as well as token and a student's work follows the code to any machine. A seat's cohort is its class, with its own higher limits. `api/teacher.js` is the dashboard's data, every id scoped through the teacher's own rows, and read-only on student work. `build/teacher.html` is the page, at `/teach`. The pilot's teacher code (`db.js teacher new`) still admits a browser that holds it, until it is redeemed on an account.

**Accounts are Google sign-in, admitted by invite.** Signing in admits nobody: `api/auth.js` redeems a reusable member invite (`db.js invite member <label>`, capped at `LIMITS.accountDay` builds a day per account) or a single-use teacher invite (`db.js invite teacher`), and a pilot teacher code redeemed there links its classes to the account. `_accounts.js` verifies the ID token against Google's keys with no library, and the session is an HttpOnly cookie. An account owns its apps as `user:<id>`, and apps this browser made on a testing link move to the account on sign-in. Testing links (`TUTOR_KEYS`) still admit without an account.

The pages are `demos/build/`: `build.html` is the builder, `app.html` the viewer, `apps-client.js` what they share. A stored page runs in an iframe by `srcdoc` with `allow-scripts` only, on an opaque origin; a `<base>` is spliced into its head so `../lib/` resolves, and a relay posts its uncaught errors up. **On loopback the frame runs same-origin**: Chromium blocks every request an opaque origin makes to localhost, so locally the sandbox would load the CDN and nothing of the library. Deployed it is the real sandbox. Because the frame is cross-origin deployed, `vercel.json` and the dev server send `Access-Control-Allow-Origin: *` on `/demos/`, which is what lets Proteinbox fetch a bake from inside it.

Deployed routes: `/build` and `/app/<id>`, rewrites in `vercel.json`; locally the file paths. Seed a page from disk with `node demos/tools/db.js seed tests/gen-rbc-test.html`, which prints the view and edit links; `db.js apps` lists what exists and `db.js builds` sums tokens and dollars per cohort per day, which is what tunes the limits. It needs `DATABASE_URL`: without a database nothing can be stored, and both endpoints say so.

Not built: the library at a pinned `/lib/v1/` path, and a per-key limit. What the model is told, and how a page is judged, is this document and `Components.md`, and none of it lives in the backend's code.
