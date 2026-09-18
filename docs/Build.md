<!-- KIND: argument, then recipe. The brief for the site build: why the site gets one, and what it does. Read whole before touching tools/build.js, vercel.json's build settings, or a page's bake markers. Retire into demos/docs/ once it ships. -->

# The build

Today the repo is the site: Vercel serves the working tree as committed, with no build step. That was right while there were a few pages. There are now \~30 public pages, and two costs have grown with them.

**Search sees almost nothing.** Most of a page's text is written by its scripts. Measured on the static HTML, with scripts removed: `dna-structure.html` has 18 characters of body text, `tree/tree-lab.html` has 1, and `lessons.html` has the masthead and the teacher strip but none of the lesson cards. Google renders JavaScript, but only the first step's text is ever in the DOM before a click. Bing and the AI crawlers (GPTBot, ClaudeBot, Perplexity) mostly do not run scripts at all. The top bar's links are injected by `lib/site.js`, so to those crawlers a lesson page links nowhere.

**A lesson is slow to load.** `glycolysis-lab.html` loads 26 local scripts plus three.js from cdnjs:

|  | gzipped |
| --- | --- |
| The 26 local files as served | 210 KB |
| The same files with comments stripped | 69 KB |
| three.min.js, from a second origin | 149 KB |

Two thirds of what we send is comments. The comments stay in the source, where the repo's reasoning lives; the build removes them from what ships. Until the build, every asset was also sent `max-age=0, must-revalidate`, so a returning student revalidated all 27 files. `vercel.json` now sets a 5-minute cache with a day of `stale-while-revalidate` on static assets (commit `e6bbf1a`), which is the most caching a URL without a content hash can safely take.

## 1. Decisions

**A build that writes to `dist/`, run by Vercel on every deploy.** Source HTML stays hand-written and is never rewritten by a tool. The build copies the tree, bakes text into the HTML, and bundles scripts.

**The dev server applies the same HTML bake per request.** What you see locally is what ships, with no bake command and no restart. It does NOT bundle: scripts stay separate and commented, so a stack trace names the real file and line.

**Plain scripts, not modules.** Pages load globals in an order the page states. The build concatenates in that order and minifies; nothing is converted. ES modules are the right end state (imports would replace the hand-kept order tables in `kit/app.js` and each page), but that migration is not needed for any of this.

**Two devDependencies in the root `package.json`:** `esbuild`, to minify, and `playwright-core`, to drive the Chrome already installed for the smoke run (section 5). Neither ships to a student.

**Rejected:**

* *React / Next.* Rewrites imperative three.js pages to get server rendering we can get from a bake.
* *Vite.* A bundler and dev server, not a page generator; it wants ES modules.
* *Astro.* Its Vite pipeline wants to own the scripts, which fights r128 globals.
* *Eleventy.* The closest fit (plain templates, data files, passthrough), and the one to reach for if the bake grows nested layouts or pagination. It does not bundle JS, so we would still write the bundling half ourselves.
* *Committing baked output to the source.* What `tools/seo.js` does today. It works, but a data edit needs a re-bake, a missed one ships stale, and parallel sessions collide on generated blocks. The build replaces it, and seo.js's writers become bake stages.

## 2. What the build does

`node demos/tools/build.js` writes `dist/`, mirroring the repo's paths, so every rewrite and redirect in `vercel.json` keeps working unchanged.

1. **Copy** the tree, skipping what `.vercelignore` skips (the build honours that file itself, since `dist/` is what gets served), plus `*.md` and `tools/`.
2. **Bake** every public page's HTML (section 3).
3. **Bundle** every public page's scripts (section 4).
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

**Left out of bundles:** `lib/site.js` (loaded absolutely and deferred from every page; it becomes its own hashed file) and anything a script adds at runtime (`lib/track.js`, analytics).

**Shared code across lessons.** A student moving lesson to lesson re-downloads what each bundle has in common. First cut: accept that; every bundle is still smaller than today's total. If it matters, a fixed `core` list (three.js, `palette.js`, `tokens-from-palette.js`, `molecules.js`, `scene.js`) becomes its own bundle, used only by a page whose run starts with exactly that list, so load order is never changed to share it.

**Caching.** `_b/*` is served `public, max-age=31536000, immutable`: its name changes when its bytes do. HTML stays uncached. Everything else keeps the 5-minute rule.

**What changes when files are joined, and has to be checked before the switch:**

* A load-time throw stops the rest of its bundle, where today it stopped only its own file. Every load-time throw found is a "must be loaded first" guard (`mol-carriers.js`, `mol-aminoacids.js`, `chain-repeat.js`), which means the page is broken either way.
* `document.currentScript` points at the bundle. The only use found is `kit/app.js`, which is not bundled (generated apps, below).
* Two files declaring the same top-level `const`/`let`/`class` already fail today, since separate plain scripts share one global scope. Concatenation keeps that the same.
* A script that computes a path from its own URL would break. None found; the check below would catch one.

## 5. Checks

* `build.js --check`: every marker has a bake, every bake's inputs exist, every public page's text-bearing bakes produced text.

* A smoke run over `dist/`: load each featured page in headless Chrome at 1440x900, fail on any page error, any failed request other than `/_vercel/*`, or a missing global a page's inline script names, and write a screenshot per page for a person to glance at. This is the gate on bundling, and it runs before every deploy, in `tools/check.js deploy`.

  Headless Chrome is not the hidden tab of the in-app browser: tried on `glycolysis-lab.html`, rAF ran at 62 fps, WebGL was live, and the screenshot showed the rendered glucose. So the run can wait for a scene to draw and compare it against the previous build's shot. It uses the installed Chrome (`channel: 'chrome'`), so nothing is downloaded. Playwright's WebKit (`npx playwright install webkit`, \~70 MB) would add a Safari-engine pass, which is the engine the lessons are judged in.

* Size report: each page's bundle bytes, gzipped, against the previous build, so a page that doubles is seen.

## 6. Generated apps, later

Generated apps run in a sandboxed frame from the database and are disallowed in `robots.txt`, so baking does nothing for them. Their load time is the same problem as a lesson's. Once bundling works, the build also writes one bundle per `USES` entry in `kit/app.js`, and `app.js` switches from writing each file's tag to writing its components' bundle tags from the manifest. `ORDER` and `USES` stay the one table, and the build reads it.

## 7. Order of work

1. `tools/build.js` copying to `dist/`, `vercel.json` pointed at it, a deploy that serves the same site. Nothing else changes, so a problem here is the build's alone.
2. `tools/bake.js` and the dev server running it. `head` moves over from `seo.js`, whose writes into the source are then removed.
3. `sitenav`: every page's top bar from one template. The priority, for search and for a consistent layout.
4. `shelf` on `/lessons`, coming-soon cards included. `gallery` on the homepage, and `proteins.js` leaves it.
5. Bundling, behind the smoke run, then `immutable` on `_b/`.
6. `steps`, tree first, then glycolysis.
7. Generated-app bundles.
8. Three.js r128 to current, behind the screenshot diff (section 8).

## 8. Upgrading Three.js

r128 was never forced by the absence of a build: the library is plain scripts on a global `THREE`, and current Three ships no global build (removed around r160) and no global add-ons. The build removes that obstacle. It bundles current Three from npm and assigns it to `window.THREE`, so no library file is converted; the dev server loads the same prebuilt file.

**What changes between r128 and r17x, from a scan of the library:**
- *Colour management* (r152): colours are converted by default, which would shift every authored colour. Two lines restore r128 exactly: `THREE.ColorManagement.enabled = false` and `renderer.outputColorSpace = THREE.LinearSRGBColorSpace`.
- *Physical light units* (r155, legacy mode removed r165): intensities scale by about π. Only directional, hemisphere and ambient lights are used, in 10 files.
- *Shaders*: 2 files use `onBeforeCompile` and 3 use `ShaderMaterial`. The only real work.
- Smaller: the `slerpQuaternions` return-value workaround in `lib/molview.js`, `Geo.capsule` (current Three has `CapsuleGeometry`), and WebGL2 becomes required.

**Gained:** prototypes and generated code written against current Three run without being ported down, current add-ons, and the renderer's newer features.

**Order:** load current Three with the r128 colour and light behaviour switched on; diff every featured page's smoke-run screenshot against r128; fix the five shader files; then move pages to the current defaults one at a time, each judged in Safari. The version is pinned in `package.json`, and `kit/app.js`'s `ORDER` and `Components.md`'s tag change with it.
