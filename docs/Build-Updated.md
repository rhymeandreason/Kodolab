<!-- KIND: argument, then recipe. The brief for the site build and for what the build makes possible after Beta: current Three.js, ES modules, a declared component contract. Section 12 says what is worth doing now, beside the content work, and what waits: most of the build waits until after Beta. Generator-Recommendation.md is its companion: what a generated app should be stored as, which sections 7, 9 and 10 leave room for. Read whole before touching tools/build.js, vercel.json's build settings, or a page's bake markers. Retire into demos/docs/ once it ships. -->

# The build, and what follows it

Today the repo is the site: Vercel serves the working tree as committed, with no build step. That was right while there were a few pages. There are now \~30 public pages, and two costs have grown with them.

**Search sees almost nothing.** Most of a page's text is written by its scripts. Measured on the static HTML, with scripts removed: `dna-structure.html` has 18 characters of body text, `tree/tree-lab.html` has 1, and `lessons.html` has the masthead and the teacher strip but none of the lesson cards. Google renders JavaScript, but only the first step's text is ever in the DOM before a click. Bing and the AI crawlers (GPTBot, ClaudeBot, Perplexity) mostly do not run scripts at all. The top bar's links are injected by `lib/site.js`, so to those crawlers a lesson page links nowhere.

**A lesson is slow to load.** `glycolysis-lab.html` loads 26 local scripts plus three.js from cdnjs:

|  | gzipped |
| --- | --- |
| The 26 local files as served | 210 KB |
| The same files with comments stripped | 69 KB |
| three.min.js, from a second origin | 149 KB |

Two thirds of what we send is comments. The comments stay in the source, where the repo's reasoning lives; the build removes them from what ships.

**File count costs more than bytes.** A cold load of `/glycolysis`, measured in Chromium on 2026-09-18: the HTML arrives at 0.16 s and DOMContentLoaded fires at 1.5 s. The 28 scripts are requested a few at a time, each waiting 30 to 180 ms on the edge, so the 3.5 KB `stagekit.js` lands at 1.3 s. `kodo.css` `@import`s `annotate.css` and `brand.css`, which cannot be requested until it arrives. Warm from the browser cache, the same page is at DOMContentLoaded in 0.17 s.

**Caching without a content hash runs out.** Until the build, every asset was sent `max-age=0, must-revalidate`. `vercel.json` now sets `max-age=300, stale-while-revalidate=1800` on static assets (`e6bbf1a`, `396fbc5`): the most a URL without a hash can take while a pre-class fix still lands on first load. A student returning the next day revalidates every file, in the same queue.

**The apex redirects.** `kodolab.org/*` answers 308 to `www`, a round trip and a second TLS handshake. Every canonical, sitemap entry and class link is already `www`, so only a hand-typed bare link pays it. Not build work.

## 1. Decisions

**A build that writes to `dist/`, run by Vercel on every deploy.** Source HTML stays hand-written and is never rewritten by a tool. The build copies the tree, bakes text into the HTML, and bundles scripts.

**The dev server applies the same HTML bake per request.** What you see locally is what ships, with no bake command and no restart. It does NOT bundle: scripts stay separate and commented, so a stack trace names the real file and line. This holds through every later stage, modules included.

**Plain scripts first, ES modules second.** Pages load globals in an order the page states. The build concatenates in that order and minifies; nothing is converted. That ships the load-time win without touching a library file. Modules are the end state and have their own section (9), because three things this plan would otherwise hand-build (the shared `core` bundle, per-page molecule data, the `ORDER` tables) are what imports give for free.

**Three.js moves to current early in the build, not last.** The upgrade depends only on bundling and the smoke run's screenshot diff, and it is what the generator gains most from, since a model writes current Three. It is not a reason to hold up a component: with colour management off, what breaks is the five shader files and the light intensities (section 6), so ordinary geometry and material code written on r128 ports almost free.

**Two devDependencies in the root `package.json`:** `esbuild`, to minify and later to bundle, and `playwright-core`, to drive the Chrome already installed for the smoke run (section 5). Neither ships to a student.

**The hosting stays.** Vercel, Neon and Resend fit this shape and none of this plan strains them. Section 11 covers auth.

**Rejected:**

* *React / Next.* Rewrites imperative three.js pages to get server rendering we can get from a bake.
* *react-three-fiber.* The mount contract is framework-free and is what a generated app is written against. A reactive wrapper adds a runtime and a second way to drive a scene.
* *Vite, Astro.* Both want ES modules and want to own the scripts, which fights r128 globals. **That objection expires when section 9 lands.** By then `tools/bake.js` and the templates exist and work, so the question becomes whether a framework earns the migration, and the default answer is no: esbuild's `bundle` mode covers the half the build lacks.
* *Eleventy.* The closest fit (plain templates, data files, passthrough). The tripwire for reaching for it is in section 8.
* *Committing baked output to the source.* What `tools/seo.js` does today. It works, but a data edit needs a re-bake, a missed one ships stale, and parallel sessions collide on generated blocks. The build replaces it, and seo.js's writers become bake stages.

## 2. What the build does

`node demos/tools/build.js` writes `dist/`, mirroring the repo's paths, so every rewrite and redirect in `vercel.json` keeps working unchanged.

1. **Copy** the tree, skipping what `.vercelignore` skips (the build honours that file itself, since `dist/` is what gets served), plus `*.md` and `tools/`.
2. **Bake** every public page's HTML (section 3).
3. **Bundle** every public page's scripts and stylesheets (section 4).
4. **Manifest**: `dist/demos/_b/manifest.json`, mapping each page to its bundles, for the checks and later for `kit/app.js`.

`vercel.json`: `"buildCommand": "node demos/tools/build.js"`, `"outputDirectory": "dist"`. Functions in `api/` are built by Vercel from the repo as they are now; `api/_builder.js` reads `kit/app.js` and `Components.md` from source and is unaffected.

`node demos/tools/build.js --serve` builds and serves `dist/` on a free port, for testing the production output before a deploy.

## 3. Baking

A page marks where baked HTML goes with an empty pair of comments:

```html
<div class="wrap" id="course"><!-- bake:shelf --><!-- /bake --></div>
```

A **bake** is a named function in `tools/bake.js`: it takes the page and returns HTML. The same file is required by the build and by the dev server, so the two cannot disagree. A marker with no registered bake fails the build.

A bake reads its facts from where they live: `lib/lessons.js` for the shelf, a lesson's steps file for its text. It never holds a second copy of the content, which is what `seo.js`'s hand-written `about` paragraphs are and why they go.

**Rendering code the page also runs at runtime moves into the data's module**, written to work in both Node and the browser (`if (typeof module === 'object') module.exports = …`). Then the build and the page call one function. For `/lessons`, `UNITS`, `card()` and `teaser()` move beside `Lessons`; the page stops building the shelf on load, and the embed sheet keeps working because it already listens on `document` for `[data-embed]`.

The first bakes, in order:

| Bake | Writes | Reads |
| --- | --- | --- |
| `head` | description, canonical, share card, JSON-LD | `seo.js`'s `PAGES` table, moved into `tools/bake.js` |
| `sitenav` | the whole top bar: wordmark, crumb, links | one template for every page, with the page supplying only its crumb and `Design.md`'s shell (`kodo` or `lshell-page`). Today 24 pages hand-write the `<nav>` and `site.js` fills its links at runtime; after this, `site.js` only adds behaviour |
| `shelf` | `/lessons`' units and cards, plus an ItemList in JSON-LD | `lib/lessons.js` |
| `gallery` | the homepage's protein marquee: link, still, name and one-line job per protein | `proteins/proteins.js` via `ProteinLib.byKey`, for the keys the marker names (`<!-- bake:gallery hemoglobin gfp collagen … -->`), so the page keeps choosing its twelve and their order |
| `steps` | a lesson's step titles and text, as a visible "About this lesson" section | the lesson's steps file (`tree/tree-steps.js` is the model; glycolysis's `STEPS` moves out of the page into one) |

`robots.txt` and `sitemap.xml` are written into `dist/` by the build too, from the same table.

**The homepage's gallery** is written at runtime from `ProteinLib` today, so search never sees a protein name, and the page loads `proteins.js` (109 KB) for twelve names. Baked, it drops that script. The marquee is doubled so the slide loops without a seam: the bake writes one copy, the page clones it, and the clone gets `aria-hidden` and `tabindex="-1"` (today a screen reader and the Tab key meet every protein twice). The homepage's lesson cards stay hand-written: each carries its own placement and motion, which is design, not data.

The about section is **visible** (below the stage, or a `<details>`), not `hidden` as `seo.js` writes it now. Hidden text earns little or nothing in search, and a visible one is also what a screen reader gets.

**The dev server** runs the bake on each HTML response, beside the reload client it already injects. A bake's inputs are files the page's scripts also load, so the existing dependency tracking (a save reloads only the pages whose requests named that file) already wakes the right tabs. The one addition: a bake's inputs that the page does not load itself are declared by the bake, and the server adds them to the page's dependency set. Changing `dev-server.js` needs one restart; after that nothing does.

## 4. Bundling

For each page, **each unbroken run of `<script src>` tags becomes one bundle**. An inline `<script>` between two runs ends a bundle, so the page's own code still runs where it ran before, after exactly the files that preceded it.

A bundle is the files concatenated in the page's order, each minified by esbuild's `transform` (no `format`, so top-level names stay global and are not renamed), written to `dist/demos/_b/<name>.<hash>.js`, and the run of tags is replaced by one tag. The CDN libraries (three.js, d3, Plot, SmilesDrawer) are fetched once at build time, pinned by the version already in the URL, and bundled in with the rest: browsers partition their cache by site, so a shared CDN copy saves nothing, and a second origin costs a connection.

**Stylesheets the same way.** Each run of `<link rel="stylesheet">` becomes one `_b/<name>.<hash>.css`, built by esbuild with `bundle: true`, so a local `@import` (`kodo.css` pulls in `annotate.css` and `brand.css`) is inlined instead of fetched after its parent, and a relative `url()` (`pathways.css`'s `../images/asterisk.svg`) is rewritten to resolve from `_b/`. Google Fonts `@import`s stay external and first. The Phosphor icon sheet from unpkg is vendored like the CDN scripts, font files included.

**Embedded lessons.** The embed code on `/lessons` frames `https://www.kodolab.org/<lesson>`, so an embed loads the same HTML and bundles. Browsers partition the cache by top-level site, so the first open inside a school's LMS is cold even for a student who has used kodolab directly; after that `_b/` caches within that site. A cold load is the case bundling shrinks most, and the one an embed hits first.

**`lib/embed.js` is inlined, not bundled.** It must run between `</head>` and `<body>` so a framed page is `bare` before first paint, and under the run rule it would become a one-file bundle: a render-blocking request for 1.3 KB. The build writes its contents into the tag instead; the source keeps the file. Audit before the switch: only the `bare: true` rows in `lib/lessons.js` load it (water, protein, membrane, glycolysis, krebs, etc, fermentation). Four embeddable lessons do not (bonds, respiration, tree, dna), so framed they show their own title under the host's, and nothing reads `bare`, so the flag and the pages can drift.

**Left out of bundles:** `lib/site.js` (loaded absolutely and deferred from every page; it becomes its own hashed file) and anything a script adds at runtime (`lib/track.js`, analytics).

**Shared code across lessons: accept the duplication.** A student moving lesson to lesson re-downloads what each bundle has in common, and every bundle is still smaller than today's total. Do not hand-build a `core` bundle for it. Under modules (section 9) esbuild's code splitting shares common chunks with no list to keep.

**Caching.** `_b/*`, scripts and stylesheets, is served `public, max-age=31536000, immutable`: its name changes when its bytes do. HTML stays uncached, so a deploy reaches a student on their next load. Everything else (data, images, traces) keeps the 5-minute rule.

**What changes when files are joined, and has to be checked before the switch:**

* A load-time throw stops the rest of its bundle, where today it stopped only its own file. Every load-time throw found is a "must be loaded first" guard (`mol-carriers.js`, `mol-aminoacids.js`, `chain-repeat.js`), which means the page is broken either way.
* `document.currentScript` points at the bundle. The only use found is `kit/app.js`, which is not bundled (generated apps, section 7).
* Two files declaring the same top-level `const`/`let`/`class` already fail today, since separate plain scripts share one global scope. Concatenation keeps that the same.
* A script that computes a path from its own URL would break. None found; the check below would catch one.

## 5. Checks

* `build.js --check`: every marker has a bake, every bake's inputs exist, every public page's text-bearing bakes produced text.

* A smoke run over `dist/`: load each featured page in headless Chrome at 1440x900, fail on any page error, any failed request other than `/_vercel/*`, or a missing global a page's inline script names, and write a screenshot per page for a person to glance at. This is the gate on bundling, on the Three.js upgrade and on every module conversion, and it runs before every deploy, in `tools/check.js deploy`. **It does not need the build**: pointed at the dev server it is a regression gate for the featured lessons today (section 12), and it moves to `dist/` when `dist/` exists.

  Headless Chrome is not the hidden tab of the in-app browser: tried on `glycolysis-lab.html`, rAF ran at 62 fps, WebGL was live, and the screenshot showed the rendered glucose. So the run can wait for a scene to draw and compare it against the previous build's shot. It uses the installed Chrome (`channel: 'chrome'`), so nothing is downloaded. Playwright's WebKit (`npx playwright install webkit`, \~70 MB) adds a Safari-engine pass, which is the engine the lessons are judged in. Worth installing before section 6, where colour is the thing being compared.

* **A sim that draws differently each load cannot be diffed.** Water, the membrane's contents and the crowds all place things at random, so their shots differ build to build with nothing wrong. Until section 10's seeded `step(dt)`, the diff gates the deterministic pages (molecules, proteins, pathways) and the sims get the error checks and a human glance.

* Size report: each page's bundle bytes, gzipped, against the previous build, so a page that doubles is seen.

## 6. Upgrading Three.js

r128 was never forced by the absence of a build: the library is plain scripts on a global `THREE`, and current Three ships no global build (removed around r160) and no global add-ons. The build removes that obstacle. It bundles current Three from npm and assigns it to `window.THREE`, so no library file is converted; the dev server loads the same prebuilt file.

**What changes between r128 and r17x, from a scan of the library:**
- *Colour management* (r152): colours are converted by default, which would shift every authored colour. Two lines restore r128 exactly: `THREE.ColorManagement.enabled = false` and `renderer.outputColorSpace = THREE.LinearSRGBColorSpace`.
- *Physical light units* (r155, legacy mode removed r165): intensities scale by about π. Only directional, hemisphere and ambient lights are used, in 10 files.
- *Shaders*: 2 files use `onBeforeCompile` and 3 use `ShaderMaterial`. The only real work.
- Smaller: the `slerpQuaternions` return-value workaround in `lib/molview.js`, `Geo.capsule` (current Three has `CapsuleGeometry`), and WebGL2 becomes required.

**Gained:** prototypes and generated code written against current Three run without being ported down, current add-ons, and the renderer's newer features.

**Order:** load current Three with the r128 colour and light behaviour switched on; diff every featured page's smoke-run screenshot against r128; fix the five shader files; then move pages to the current defaults one at a time, each judged in Safari. The version is pinned in `package.json`, and `kit/app.js`'s `ORDER` and `Components.md`'s tag change with it.

**Stay on `WebGLRenderer` for this step.** `WebGPURenderer` with TSL materials is the direction, and GPU compute is where `water/watersim.js` and the capillary fluid would gain most. It is a second migration with its own risk (Safari, school Chromebooks, every custom shader rewritten in TSL), and it should start as one bench, after modules, with the CPU path kept.

## 7. Generated apps

Generated apps run in a sandboxed frame from the database and are disallowed in `robots.txt`, so baking does nothing for them. Their load time is a lesson's problem, plus two of their own.

**Bundles per component.** The build writes one bundle for `CORE` and one per `USES` entry in `kit/app.js`, in `ORDER`. `ORDER` and `USES` stay the one table, and the build reads it.

**No hop through `app.js`.** Today the page loads `app.js`, which `document.write`s the library's tags, so nothing below it is requested until `app.js` has arrived and run, and the preload scanner never sees the written tags ahead of time. `build/apps-client.js`'s `framed()` already splices a `<base>` and the error relay into every page before it goes into the frame; it also replaces the `<script src="../kit/app.js" data-use=…>` tag with the bundle tags, from `plan()` and the manifest. The splice happens at mount, never in the stored HTML: a stored page holds component names, and a hashed name saved into it would 404 once a deploy retires that bundle. `app.js` stays as the fallback for a page opened any other way.

**The splice is the compatibility layer, so keep stored pages abstract.** A stored app names components and parameters and nothing about how the library is delivered. That is what lets bundling, current Three and modules each land without rewriting a row in the database.

**What a stored app should be is `Generator-Recommendation.md`'s question**: a document the shell renders, with the HTML written around it at mount and never stored. That takes this paragraph's rule to its end, and the version below is what lets the two stored forms coexist.

**Stamp a contract version on every stored app, now.** One attribute on the `app.js` tag (`data-v="1"`), written at generation time. It costs nothing today and cannot be added later: once a component's parameters change, an app stored without a version cannot be told apart from one written after. What the version selects is section 10's decision.

**The sandbox may defeat the cache.** The frame is `srcdoc` with `sandbox="allow-scripts"`, an opaque origin. That is the right security boundary and stays. Chrome keys its HTTP cache by top-level site and frame site, and an opaque origin may count as a fresh site on every mount. If so, every app open is a cold load however long `_b/` is cached, and the shelf, which mounts a live preview per card, pays it per card. Untested: open one deployed app twice in Chrome and in Safari (which partitions by top-level site only) and read `transferSize` on the bundles. If the cache is lost, the options are `allow-same-origin` on a separate app origin (a subdomain, so the sandbox still cannot reach `www`'s storage or keys), or the parent fetching the bundles once and handing them into the frame as blob URLs.

## 8. Templates and partials

A page is one of two things: **a hand-written HTML file with bake markers**, or **a template and a list**, one page per entry. The build writes each generated page to the path its route names; the dev server renders the template on request for that route, so neither needs a file per entry in the source.

**The tripwire.** This section is where a homemade build starts becoming a framework. It stays homemade while a template is one function from an entry to a page and a partial is one function to a fragment. The day it wants nested layouts, pagination, or a partial that takes another partial, stop and move the page-writing half to Eleventy, keeping `tools/bake.js`'s functions as its data and shortcodes. Do not grow a layout engine in `build.js`.

### The protein story

`myoglobin-story.html` is the current design (`css/story.css`, `lib/story.js`), and prion and ATP synthase follow it. The three pages are the same page around different content:

- **Shared, and written three times today:** the shell (stage, top bar, `#read` column), the one `Proteinbox` re-fed as the reader scrolls, the `Annot` callouts, `fileStats`, the column builders (`claim`, `tiles`, `terms`), loading each part's trace, and `Story.scroll`.
- **The protein's own:** `PARTS` (each part's deposition, title, text as a function of the trace, stat tiles, callouts), `SAYS` (one line per deposition), the geometry its callouts anchor to (myoglobin's `worldAt`/`atomIn`, prion's `runs`/`rungs`), and what the stage does on a part (myoglobin leans in on the iron; prion stacks; ATP synthase toggles context).

So:
- `lib/story-protein.js` is the shared runtime: `StoryProtein.mount({ key, parts, says, onShow })`.
- `proteins/<key>/<key>-story.js` holds only the protein's own, and loads in Node as well as the browser (`module.exports`) with its helpers (`heme-metrics.js` the same).
- One template writes `/proteins/<key>` for every protein that has a story file.

**The column is baked with real numbers.** The build reads each part's trace JSON from disk and calls the part's `note(t)` and `stats(t)`, the same functions the page calls, so the text search reads carries the file's own numbers, and CLAUDE.md's rule (a number in user-facing text is read from the data) holds in the HTML too. Callouts (`notes(t)`) need THREE and stay runtime-only. At runtime the page attaches to the baked sections instead of building them.

**Order:** myoglobin first, extracted until its screenshot matches the page it replaces, then prion and ATP synthase. The 19 proteins still on `-test.html` benches move to a story when someone writes their `PARTS`: that is content work, and the template makes it a data file plus, at most, an `onShow`.

### A page per library entry

The same mechanism, pointed at the libraries: one template and `lib/molecules.js`'s registry writes `/molecules/<key>`; one and `proteins/proteins.js` writes `/proteins/<key>` for a protein with no story yet (name, job, deposition, a still, the live `Proteinbox`). Each is a page search can land on for a query a student types ("structure of NADH"), linking into the lesson that uses it. This is the cheapest SEO the project has, since the data and the stills exist. After the story template, because it reuses it.

### The sheets

`kit/modal.js` owns open, close, focus and the stack, and deliberately leaves the markup to the page. Without includes, that meant copies: `molecules.html`'s sheet is labelled a copy of `proteins/index.html`'s, and `respiration-lab.html` has its own `#molmodal`; `nodegraph/nodegraph.html` and `sickle-lab.html` mount `Proteinbox` their own way. Each sheet becomes a partial (`<!-- bake:molsheet -->`, `<!-- bake:protsheet -->`) with one stylesheet and one script that fills it. The markup is still HTML in the page, as `modal.js` asks; it is written once.

## 9. ES modules

After Beta. The build as sections 2-4 describe it is complete without this; modules replace its hand-kept parts.

**What imports delete:** `kit/app.js`'s `ORDER` table and every page's script order, the "must be loaded first" throw guards, the run-of-tags bundling rule, and the question of a shared `core` bundle. esbuild's `bundle` with `splitting: true` and `format: 'esm'` writes per-page entry chunks plus shared chunks, hashed, from the import graph.

**The dev server still does not bundle.** It serves the source files as native modules, so a stack trace keeps its file and line. An import map in the page maps `three` to the vendored build; the build resolves the same specifier from npm. Safari has had import maps since 16.4.

**Conversion is leaf-first, with a bridge.** A converted file `export`s and also assigns the global it always did, until its last plain-script consumer converts; then the assignment goes. `palette.js`, `geo.js` and `kit/scale.js` first, `scene.js` and `kit/card-stage.js` in the middle, components and pages last. One file per commit, each behind the smoke run.

**Two behaviours change, and both need checking per page:** a module script is deferred, so a page's inline script that relied on running during parse becomes a module too; and a module is strict and scoped, so an accidental global a second file reads becomes a ReferenceError at load, which is the smoke run's easiest catch.

**Generated apps keep their stored form.** A stored page still says `data-use="Membrane,Graph"`; the splice (section 7) writes module tags for it instead of bundle tags. New pages may be generated as a module with imports once `Components.md` says so, and the contract version tells the splice which it is holding. If apps become documents (`Generator-Recommendation.md`), this question goes away for them: a document names no scripts, and whatever renders it chooses the tags. `document.write` retires with the last unversioned app, or never, at no cost.

### Molecule and protein data per page

The domain files (`mol-sugars.js`, `mol-carriers.js`, …) group specs so a hand-written page loads a reasonable subset. With imports, a page ships only the specs it uses.

**What it saves.** Measured on `glycolysis-lab.html` (2026-09-18): the page registers 34 specs and names 15 as string literals in its own source and the modules it loads; the other 19 (lactate, CoA, FAD, ubiquinone, …) are the other pathway lessons'. `skel.js` only builds specs at load; neither the page nor `reaction.js` calls it at runtime. The three domain files plus `skel.js` are about 62 KB gzipped; the page's own specs, pre-built, about 15 KB. Registering the whole library costs about 30 ms, so the saving is bytes, not CPU.

**The larger case is a page that shows one or two as detail.** `respiration-lab.html` mounts `Molecule` and `Proteinbox` through `kit/app.js`, whose `USES` load every domain file plus `skel.js` (about 122 KB gzipped) and the whole `proteins/proteins.js` (33 KB) for a few molecule views and ATP synthase: more than three.js, on a hub page. More lessons will pull in a protein or two as a detail example this way.

**Under modules the import is the declaration.** Each spec is an export; a page imports the ones it draws; the bundler ships those and what they derive from, and a misspelt one fails the build instead of failing at the step that first draws it. The build pre-builds Skel-derived specs through `lib-node.js`, so `skel.js` leaves pages that only used it to build. A key composed at runtime (a generated app's `Molecule.mount(el, { key })`) cannot be seen by any bundler, so the string registry stays, backed by a dynamic `import()` of the key's domain file (`spec.domain` names it): slower on a miss, never broken.

**If the size report says a page cannot wait for modules,** the plain-script version is: the page declares its keys beside its steps table (or `data-mol="atp,adp,nadh"` and `data-protein="atp-synthase"` on the `app.js` tag), and the build writes `_b/<page>.mol.<hash>.js` from the declared keys plus what they derive from, with the same whole-domain fallback on a miss. It is a declared list nothing checks, which is why it is the fallback plan and not the plan.

**Proteins subset the same way.** Each structure's bake is already its own file, fetched when drawn; the aggregate is `proteins/proteins.js`, the index `ProteinLib` reads. A page ships only its entries, and `ProteinLib`'s API is unchanged. The `gallery` bake takes it off the homepage; `proteins/index.html`, `library.html` and the node graph genuinely use the whole index and keep it.

**What stays.** The domain files and `proteins.js` are the source: the checkers, `lib-node.js` and hand editing read them.

## 10. The component contract, declared

After Beta. The generator is the product, and today its reference is prose: each component's section in `Components.md` is a hand-written `mount()` block whose comments carry the types, ranges and defaults, beside a `DEFAULTS` object in the component that says the same thing a second time. CLAUDE.md's rule is that a mistake the model keeps making is fixed in the library. This section is that rule made mechanical.

**Each component declares its parameters once,** as data beside `DEFAULTS`: per key a type, a default, a range or the allowed values, a unit, and the one line the reference prints. Signals (`SIGNALS`) and layers the same. Five things read it:

1. **`Components.md`'s mount blocks,** written by a bake between markers. The prose around them (what the scene is, what it must not be used to claim) stays hand-written; that is the science and no schema holds it.
2. **Validation in `kit/card-stage.js`,** at `mount` and `set`: an unknown key names the nearest real one, an out-of-range value names the range. In the builder these reach the error relay `framed()` already splices in, so the model gets the message and repairs the page before a student sees it.
3. **The bench.** A component's test page draws its controls from the declaration, so a new parameter is exercisable the moment it exists.
4. **The widgets a generated app declares.** `Generator-Recommendation.md` binds a readout to a `state()` key and a slider to a parameter; both bindings are checked against this declaration, and its pose-then-snapshot builder draws its controls from it. That document depends on this section and not the reverse.
5. **A `.d.ts`,** once generated apps are modules, so generated code can be type-checked before it is stored. Validation first, since it needs nothing new on the server; measure on the eval set what a type check catches that validation does not before paying for TypeScript in `api/_builder.js`.

**What the contract version selects.** Section 7 stamps every stored app. When a component's parameters change incompatibly, the version bumps, and old apps are carried by a small adapter at `mount` that maps the old parameters to the new. The alternative, a frozen bundle of the library per version, keeps old apps pixel-identical and also keeps their physics bugs: a fix to the membrane's Nernst potential should reach an app a teacher made last term. Adapters, plus the smoke run loading a sample of stored apps against each new build.

**Sims step on a seeded clock.** Each component's physics takes a seeded random source and advances by a fixed `step(dt)` that drawing does not call. Same seed, same frames. That gives the smoke run a stable diff for the sims (section 5's gap), lets a checker assert a physical claim after N steps in Node, and makes an app's thumbnail reproducible. Needs an audit of where each sim reads `Math.random` and wall-clock time; the featured lesson and its component are still two copies of one physics (CLAUDE.md), so each fix has two homes until they merge.

**TypeScript for the library** is an option modules open, not a decision here. JSDoc types checked by `tsc --noEmit` get most of the value with no compile step and no change to what the dev server serves.

## 11. Accounts and data

**Keep the hand-built email and Google login.** It works, its surface is small, and migrating working auth to a hosted provider costs more than it returns. What custom auth owes is a review, once, before Beta widens: how sessions are stored, rotated and expired; reset and magic-link token lifetime and single use; rate limits on login and on every path that sends mail through Resend; what happens when one email arrives by both paths (linking, and who wins); and how far an access link or class code reaches if it leaks. The trigger for revisiting the decision is a requirement the code would have to grow a subsystem for: school SSO (SAML, Clever, ClassLink) or district rostering.

**Neon stays.** Postgres row-level security is available there if teacher and student rows ever need the database, and not only `api/`, to keep them apart.

**The log is one append-only event table with a declared event vocabulary,** shared by lessons, generated apps and `/teach`. If `api/_log.js` and `api/event.js` already are that, the only work is writing the vocabulary down where a lesson author finds it (`docs/api.md`).

## 12. Order of work

Content is what a Beta user judges, and a 1.5 s cold load is tolerable. So the components and lessons in progress come first, and the build waits, except for the short list below.

**Now, beside the content work.** Each is under a day, and each either cannot be done after the fact or protects Beta:

1. **The contract-version stamp on stored apps** (section 7). One attribute. Every app a Beta user saves without it cannot be told apart later.
2. **The smoke run, against the dev server** (section 5). Featured lessons loaded in headless Chrome, failing on errors, a screenshot each. New components are being built fast across shared modules and parallel sessions, and this is the cheapest gate on a featured lesson breaking.
3. **The auth review** (section 11). Independent of everything else; before Beta widens.
4. **The draft walk in the builder, and a read of the request log** (`Generator-Recommendation.md` §§5, 7). A Beta teacher should not be shown a blank page that passed its checks.
5. **New components are born in the later shape.** A seeded random source and a fixed `step(dt)` that drawing does not call, and parameters declared as data beside `DEFAULTS` (section 10). No extra cost in a component being written anyway, and it saves retrofitting each one. Meiosis needs the seeded randomness regardless.

**Pulled forward only if search is a growth channel right after Beta:** steps 6 and 10 to 12 below (the copy to `dist/`, then the `head`, `sitenav` and `steps` bakes). Indexing lags by weeks and that delay is outside our control. If Beta grows through teachers recruited directly, they wait with the rest.

**The build, after Beta:**

6. `tools/build.js` copying to `dist/`, `vercel.json` pointed at it, a deploy that serves the same site. Nothing else changes, so a problem here is the build's alone.
7. Bundling, scripts and stylesheets, behind the smoke run, then `immutable` on `_b/`. First because load time is what a student feels, and it depends on no bake.
8. Three.js r128 to current, behind the screenshot diff (section 6). Sooner if a new component needs something r128 lacks.
9. Generated-app bundles (section 7): the sandbox cache test, whose answer decides whether bundles alone help; then per-component bundles and the splice in `framed()`.
10. `tools/bake.js` and the dev server running it. `head` moves over from `seo.js`, whose writes into the source are then removed.
11. `sitenav`: every page's top bar from one template. The priority for search and for a consistent layout.
12. `steps`, tree first, then glycolysis. `shelf` on `/lessons`, coming-soon cards included. `gallery` on the homepage, and `proteins.js` leaves it.
13. The protein story template (section 8): myoglobin extracted first, then prion and ATP synthase, each checked against its own screenshot.
14. The protein and molecule sheets as partials, then a page per library entry.

**After the build.** None of these costs more for having waited:

15. The shell's badge (`Generator-Recommendation.md` §6). Small, and it removes most generated CSS.
16. Parameter declarations and validation in `card-stage.js` for the components that predate item 5 (section 10, readers 1-3). Needs no modules, and the generator improves the day it lands.
17. Declared widgets, then the document form, if the request log supports it (`Generator-Recommendation.md` §6). After 16, which they bind to.
18. Seeded `step(dt)` for the older sims, and they join the screenshot diff.
19. ES modules, leaf-first (section 9), then per-page molecule data by import, then the `.d.ts`.
20. A `WebGPURenderer` bench for WaterSim, CPU path kept.
