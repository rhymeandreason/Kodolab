<!-- KIND: argument — the September plan for the app builder. Read for priority and reasoning, not during a build. -->

# September plan: the app builder

**Goal.** A hosted builder where students and teachers make single-page biology apps from a tested library, with cheap, fast LLM generation and edits. Easier than a coding agent, because the model composes components and never writes Three.js.

**Three tiers of authoring fall out of that.**

| Tier | What the author does | Who does the work |
| --- | --- | --- |
| 0 | Pick a template, change parameters | No model, or a tiny one |
| 1 | Compose components, wire sliders to `set` and a graph to `state`, write prose | A small model |
| 2 | Build a new component | Mary, with a full coding agent |

Generated apps will be the median, not the bespoke. The featured lessons stay hand-built and set the bar for what the next component has to do.

## Library first

1. **Component contract.** `X.mount(el, params)` returns `{set(params), state(), on(event, fn), destroy()}`. `state()` feeds the tutor drawer per turn today and feeds the builder's LLM when it debugs an app tomorrow. (Done)

2. **Extract Membrane.** Move membrane-lab's inline logic into a Membrane component. Then protein box, molbox, and a small graph. The salmon question is Membrane plus a graph plus a parameter sweep. (Done)

3. **Invariants live in the components.** A remixer can make ice denser than water. Clamp parameter ranges inside the module and keep the existing checkers as the gate. The generator cannot be trusted with accuracy and does not need to be if the components refuse to lie.

4. **One stack.** Leaf and Tree are now components in `Components.md` on the global-script stack (r128 then, r186 now), alongside WaterSim, Membrane and Proteinbox. (Done)

5. **Freeze the library.** Student apps live forever. Serve it at a pinned path like `/lib/v1/kodo.js` and `/lib/v1/kodo.css` by Vercel rewrite, and never change v1 behaviour. A behaviour change cuts v2. Serving from our own origin keeps the iframe CSP simple.

6. **A graph component.** In the reference as "A chart". (Done)

7. **Rules go in the library, not the prompt.** Generator.md's finding: every rule the model broke was fixed by making it a default or an enforcement in the component, never by saying it twice in the reference. Particle budget, protein spacing, view offset, the notes script. Keep doing that.

## The eval set

The format is proven, by generation rather than by hand: `tools/gen-app.js` writes a working page from `Components.md` alone, and the pages that taught something (red blood cell, swelling lesson, salmon) sit in `admin.html` under Generated apps with the request on the card. Generator.md §§3-4 has the numbers and the rule: a page that only runs has not been checked, drive it. Rerun the requests after any change to a component or the reference. Seed the `apps` table with these pages so the render route is testable with zero model calls.

## Backend, extending `api/`

What exists: serverless functions on Vercel with a provider layer for Anthropic and Gemini; Neon Postgres with `threads`, `messages`, and `finds` (whose `extend` rows already store a generated `answer` as JSON); cohort keys in `_keys.js`; a Postgres rate limit in `_limit.js` that fails open; loopback-gated developer affordances in `_local.js`; the privacy posture of no IP, no name, a browser-minted visitor id. All of it carries over.

1. **An `apps` table.** id (unguessable), cohort, title, html, parent_id for remix lineage, hashed edit token, nullable owner_id for accounts later, created_at. Store the HTML string itself: the app is exactly what the student sees and exports. Save every version as a new row, never an overwrite. An LLM edit that breaks the app is the common case, and undo is what makes people trust the editor.

2. **A render route.** `/app/<id>` serves the stored HTML in an iframe via `srcdoc` with `sandbox="allow-scripts"` and no `allow-same-origin`. The app runs on an opaque origin and cannot reach cookies, the parent's localStorage, or the API with the viewer's key. The parent owns the chrome: title, remix, the prompt box. The iframe posts `window.onerror` up to the parent, and the next edit turn carries those errors. This is the biggest quality lever for a low-cost model.

3. **A build endpoint** shaped like `extend.js`. In: prompt, current HTML when editing, the component reference (cached). Out: HTML, or a diff for edits. Logs provider, model, usage and latency per turn the way `messages` does. Gated by the same key as the tutor, so a forwarded email cannot spend the budget. The extend rule carries over: the model may only assemble from what exists.

   **The reference is the cached prefix.** `_tutor.js` already sends two strings: `stable` (the system prompt plus the lesson's situation), which the provider caches, and `context` (the moment), which pays full rate. The build endpoint uses the same split. Stable is the four-sentence preamble plus `Components.md`, about 6,000 tokens with five components and the shell, a few hundred more per component; that growth is fine, since a cache read is a tenth of an input token and the prefix only changes on deploy. Context is the per-app HTML, the last runtime errors and any selection, since those change every turn. `gen-app.js` sends it all as one system prompt today; the split is the backend's job, and the Gemini provider needs it as much as the Anthropic one.

   **The prefix clears every cache minimum.** `CACHE_MINS` in `_providers/anthropic.js`: Sonnet 5 wants 1,024 tokens, Haiku 4.5 wants 4,096, and under the minimum the prompt silently does not cache. At 6,000 the reference is over both. Do not pad it with example pages: Generator.md measured that a pasted example triples the prefix and the model copies its subject. A designed example lives in the repo and feeds three or four lines into its component's section.

4. **Export.** One button that downloads the HTML with library paths made absolute.

5. **Save rate.** Cap saves per token per minute so a runaway page loop cannot fill the table. No model cost, still a row.

Do not sanitise generated HTML. Sandbox everything instead.

## Edits, not just first drafts

Most turns are follow-ons: "make the graph bigger", "add a slider for salinity", "why is it blank". The first draft is the cheap case. The design is for the edit.

**An app has a thread.** Reuse the `threads` and `messages` shape: one thread per app, one user message per request, one assistant message per turn carrying the edit and its usage. The transcript holds prompts and one-line edit summaries, never past HTML. The current HTML rides in the uncached context each turn, so the model always sees the file as it is and the transcript stays small.

**The model returns `{find, replace}` pairs, not a whole file.** `gen-app.js --edit` returns the whole file today, and Generator.md §4 measured it: four of five edits touched under forty lines and returned 240, about 2,500 output tokens per turn. Output is the bill. A find/replace list with each find unique cuts that roughly five to one; unified diffs fail on line numbers. On a failed find, retry once asking for the whole file, then surface the failure. Test the format in `gen-app.js` first as a mode flag and a small applier, before it goes anywhere near the backend. The server applies the edit, stores the result as a new version row, and returns the HTML plus the summary line.

**The page carries its request history.** A comment block at the top of the generated file lists the requests that shaped it. The model sees what the student asked before without the transcript, and the eval replays the sequence. Generator.md §5; the generator does not do this yet.

**Validate before storing.** Parse the result, check every script tag points at `/lib/v1/`, check every component it mounts is in the reference. A failed check goes back to the model as the next turn's error, not to the student as a broken page. Retry once on a syntax error, never on a semantic one: a page that runs and is wrong is a finding about the reference or a component, and the script's job is to expose it.

**Runtime errors close the loop.** The iframe posts `window.onerror` and unhandled rejections to the parent. The next turn carries them automatically as "the previous edit produced these errors", whether or not the student mentions them. A student saying "it's blank" and the model seeing `Membrane is not defined` is the difference between one turn and four.

**Selection scopes the request.** The student clicks a component or a paragraph in the preview and types "this one, bigger". The parent chrome knows the element and passes its outer HTML as the anchor in context. Cheap, and it makes small edits land where the student pointed.

**Parameter changes need no model.** An app declares its parameters in one data block. The chrome renders them as controls and edits the block directly. Tier 0 costs nothing per turn, and the student learns that the numbers are the physics.

**Undo is a pointer move.** Every turn is a version row, so undo and "go back to the one that worked" spend no model call. Show the versions as a list with their summary lines.

**Escalate on failure, not by default.** A small model does the edit. After a failed apply or two turns in a row that end in runtime errors, the next turn goes to the larger model. Log which model produced each version so the escalation rate is a query. The cheapest edit is the one the library makes trivial: thinking tokens fell from 3,700 to 900 on "speed up the simulation" once Membrane had `timeScale`.

## Access and ownership

**Beta testers get personal keyed links.** `TUTOR_KEYS` is `label:secret,label:secret`. One pair per person, the label is their name, the link is `/build?k=<secret>`. The page copies the key to storage and strips it from the address bar exactly as water-lab does. The label is what the log and the limit count against, so each tester's builds show by name and one person is revoked by removing one pair. The key is the default owner of what they build. A vanity path like `/build/mary` can rewrite to the keyed URL, but the secret must still be in the link or the path is guessable.

**Each app has two links.** View: `/app/<id>`, anyone can see and remix. Edit: `/app/<id>?e=<secret>`, the secret stored hashed on the row the way cohort keys are, compared in constant time, a miss is a 403. After the first visit the page saves the token to localStorage and `history.replaceState`s it away, so copies of the address bar, screenshots and referrers do not leak edit rights.

**Remix forks.** A new row with `parent_id` set and a fresh edit token. The original is never touched. A remix does not see the original's build prompts by default; the author can opt in.

**Unlisted by default.** Ids are unguessable, so a view link is private in practice. A public gallery, if ever, is an explicit curated flag.

**No accounts yet.** Email is the account: the tester finds the edit link in their inbox. What this cannot do: list "my apps" across devices, recover a lost link without a hand re-issue, or revoke a leaked edit link except by rotation. Mitigations: the builder page keeps a list of edit links it has seen in localStorage; an edit page has a "rotate edit link" action.

**Safari eviction.** Safari clears a site's localStorage after seven days of browser use without a visit. Say so on the page: keep the email or bookmark, this browser may forget.

**When accounts become worth it.** People ask "where are my apps" more than once, teachers want their students' work in one place, or spend needs a per-person budget. Then add magic-link email sign-in, which is the same token idea attached to an email. Existing rows join an account when the person pastes an edit link once. That is why `owner_id` exists from day one.

## Limits

Builds cost far more than questions, and a tester iterating for an hour uses maybe twenty turns. Give builds their own constants in `_limit.js`, counted in the same single-round-trip query as asks so the 1.5 s budget stays one trip:

```js
const LIMITS = {
  ask:   { visitorHour: 40, cohortHour: 500, cohortDay: 1500 },
  build: { visitorHour: 60, cohortHour: 200, cohortDay: 600  },
};
```

Optionally per key via a third field in the env pair, `mary:<secret>:1000`. With one person per cohort, the visitor cap equals the cohort cap for builders.

Fail open still holds. Raise the provider's prepaid cap deliberately when raising these, since that is the number that actually stops spend.

Add a view summing input and output tokens per cohort per day. Within a week of named testers, tune the constants from that rather than from guesses.

## Cost levers, in order

Template-first generation, prompt caching of the component reference, a small model for edits, diffs rather than whole files.

## Order

1. Contract, Membrane, Leaf, Tree, Proteinbox, chart, notes and layers. (Done)
2. `gen-app.js` as the eval, first drafts and whole-file edits measured. (Done)
3. `{find, replace}` edit mode and the request-history comment, in `api/_builder.js`, shared by the script and the endpoint. Measured 2026-09-03: an edit at 205 output tokens and 2 s against 2,500 and 10 to 15 s. (Done)
4. `apps` and `app_versions` tables, `/app/<id>` viewer, `db.js seed` for the generated pages. (Done)
5. Build endpoint: cached prefix through the provider layer, edit apply with whole-file fallback, one retry on a failed source check, runtime errors relayed from the frame into the next turn. (Done)
6. Library freeze at `/lib/v1/`.
7. Limits: built with their own constants in `_apps.js`; the per-key form and the usage view (`db.js builds`) are there, the per-key override is not. Keys: the tutor's, unchanged.
8. Export, rotate-token, Safari note: built into `build.html`.

Found while building: Chromium blocks every request an opaque-origin frame makes to localhost, so locally the sandbox runs same-origin and only the deployment exercises the real one. Generator.md §6.

Additional status notes: Leaf is on the contract and complete as a render, and not done as a lesson subject. What it has: five tissues from a seed, explode, isolate, hover and click, thickness parameters, anchors with cards, layers, a palette, a bench, and a section in the reference. What it lacks, from the improvements list: gas exchange as motion, stomata that open and close, and a light parameter. Nothing moves in it, so a question like "what happens in the light?" has nothing to show. That is the next Leaf work and it is a day. Status of everything else:

* Membrane. The most complete component: contents in counts or millimolar, five proteins including the new leak channel and aquaporin, notes, layers, time scale, budgets, the net verdict. Not done: the featured lesson still runs its own inline copy of the physics, so a fix has two homes until membrane-lab migrates. Chemiosmosis is briefed, not built.

* WaterSim. Wrapped, on the contract, notes and layers. Unchanged physics. No lesson-shaped work planned.

* Tree. Ported, on the contract with the lesson rebuilt on the shell. Lighting was retuned by hand and the exploded-piles camera runs low in the frame; both want your eye in Safari. The colour question is the same for Leaf.

* Proteinbox. Mounted by name, but ribbon-only through the registry for every protein except amylase. Surfaces for the proteins a student will name are a bake each.

* Cell. Briefed at the root `docs/`, not started. The handoff helper it needs in CardStage is specified, not built.

* The shell and panel. Working and used by the model unprompted. The panel is curated. The salmon example page, done properly, is yours in another session.

* The generator. Six eval pages in admin.html. Edit mode returns whole files; the diff format is specified in Generator.md, not built.

* Featured lessons. Untouched, still on their own code. Migration deferred by human.

* Example lesson for Salmon (doc at Salmon-Example-app.md) is a to do item for the human.

**URL**

`kodolab.org/build`, and the routes for it are already in `vercel.json`: `/build` for the builder and `/app/<id>` for a shared app. Nothing more to set up beyond deploying.

Why the path and not the subdomain, for now:

* **One origin, one key.** The access key lives in the browser's storage for `kodolab.org`, shared by the tutor and the builder. On `make.kodolab.org` it would be a separate store, so a tester's link would admit them to one and not the other.

* **The API and the library are on this origin.** From a subdomain the builder page would need CORS on `/api/build`and `/api/app`, and the `/lib/v1/` freeze would need to be served to two hosts. All of that is avoidable work today.

* **Apps live at `kodolab.org/app/<id>`** either way, since they load the library from here. Splitting the builder onto a subdomain would put the maker and the made on different hosts.

The subdomain becomes right when the builder is a product of its own: its own landing page, its own sign-in, possibly its own deploy. That is the accounts milestone in the plan, and moving then is a rewrite change plus DNS, nothing in the code assumes the path.

One thing worth doing now: `/build` with no key shows the "open to invited testers" notice and nothing else. If you plan to send that link around, a short line about the beta and the waitlist there, matching the remix modal, is a few minutes.

To Do 8:05pm

1. **Deploy and smoke test.** Push the branch and let Vercel build it. Confirm `DATABASE_URL` and the model key are set in the project's environment, then open `/build?k=…` on the live site. This is the first time the real sandbox runs, since locally the frame is same-origin, so the thing to check is that a stored app loads its library and a Proteinbox app can fetch a bake through the CORS header.

2. **Cell, in a parallel session.** Still the gap every osmosis request hits. Its test of done is unchanged: `gen-app.js` on "why does a red blood cell burst in pure water?" and a page that swells and bursts.

3. **Freeze the library at `/lib/v1/`.** The one piece of the backend plan not built, and it matters more now that the reference just changed shape. Until it exists, a renamed parameter breaks every stored app at once.

4. **Templates.** You have docs/Generator-Templates.md in the tree. Build one by hand on a real page, then its shell in `kit/`, then extend `validate` from "loads the shell" to "loads one of these". Experiment or Compare first, by the argument earlier.

5. **Salmon, after Cell.** The worked example, with each reach into `m.sim` reported as a reference gap.

6. **Leaf motion day.** Gas exchange as motion, stomata opening, a light parameter, so "what happens in the light?" has something to show.

7. **First tester links.** One `TUTOR_KEYS` pair per person, sent once Cell lands. Then `db.js builds` weekly to set the limits from evidence.
