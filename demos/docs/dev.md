<!-- KIND: recipe — load when running the site locally, adding a checker, or working on the commit hook. Nothing here is needed to edit a page. Deploying is docs/deploy.md. -->

# Running and checking locally

```bash
node tools/dev-server.js        # http://localhost:8817/ — zero dependencies
```

Live reload, and `no-store` so you never debug a fix that's already correct on disk. **It serves the repo root, not `demos/`**, because the root is what deploys. `/` is the lesson index; a lesson is `/demos/water-lab.html`. `demos/index.html` only redirects up.

**The dev server applies `vercel.json`'s rewrites but not its redirects**, so a short URL works locally and so does the file path behind it. A query string survives the redirect between them in production, which is what keeps the tutor's `?k=` links working whichever form gets shared.

Save a file and the browser reloads; a **CSS-only** change swaps the stylesheet in place, so the scene keeps its camera, selection and toggles.

The reload client is injected into responses, never written to disk. **The site is on Vercel, built by the GitHub integration**, so what deploys is what is committed, and `.vercelignore` decides what is withheld. To see exactly what deploys:

```bash
python3 -m http.server 8818     # from the repo root; no injection, no reload
```

**The pages are dependency-free; the tutor is not.** `water-lab`'s ask box needs SDKs and a key that are not in the working tree; setup is in `ai-tutor.md`. **The tutor is live on `kodolab.org`, behind an access link.** No `?k=` means no Ask button, which is also what every checkout without a key sees, so its absence locally is normal and not a fault to chase.

## Checkers

A checker is `node <path>`, offline and dependency-free.

`check-molecules.js` prints every spec's bond angles, audits each declared `stereo` / `topology` / `chirality` claim, and **fails if any bonded pair's spheres merge** — a merged pair buries the stick, which is how a double bond can be correctly tagged and render as nothing. Run it after any geometry change.

**Checkers run automatically on commit**, each gated to the files it can judge, so most commits run one or none — see `.githooks/pre-commit` for the exact patterns and reasoning. `npm i` in `demos/` points `core.hooksPath` there. Reinstall with `npm run hooks`; disable with `git config --unset core.hooksPath`; skip once with `git commit --no-verify`.

**The hook prints only on skip or failure** — a silent checker ran and passed. Don't read silence as "it didn't fire".

Widen a checker's gate pattern alongside any new derived artefact — nothing about a stale one is visible from the page that plays it.

No CI: the hook is the run. It covers every checker except `tools/check-handedness.js` below, and `chain/`'s and `chair/`'s, which stay ungated while those pages are test-status.

**`tools/check-handedness.js` is separate on purpose** — it needs the network and RDKit, and it is the only global-mirror check (why: `MolecularGeometry.md` §1.3). Run it after touching a ring builder or adding a stereocentre:

```bash
npm i && node tools/check-handedness.js
```

`tools/seo.js` writes `robots.txt`, `sitemap.xml` and each public page's description and share-card block from its own table; `--check` is the hook's run. A new rewrite fails it until the route is listed as indexed or hidden.

`tools/check-docs.js` audits what the docs *claim*. Framing, spacing, rotation and captions the human tests in the browser.

## Driving a page from a probe tab

* **The browser probe tab is hidden**, so `requestAnimationFrame`, `ResizeObserver` and `IntersectionObserver` delivery never fire. Drive `box.pump(dt)` and the page's own `step()` directly. `pump()` exists for this.
* **`setTimeout` is throttled there too**, so a debounce does not fire on the schedule you typed against. A dropdown that looks empty a second after typing is usually this and not a bug.
* **Screenshots with 4 live contexts come back blank** — the compositor does not pick up four WebGL layers. Verify with `readPixels` or `snapshot()` instead, and ask the human to look in Safari.
* **`querySelectorAll` finds a control that `opacity: 0` has hidden.** Anything gated by `.near`, `.hub` or a class is verified with computed style, or it is not verified. And a synthetic `click` skips the pointer sequence half these bugs live in, so it passes on a completely dead button. Test controls with a real click.
* `check-docs.js` treats any backticked path as a claim the file exists, and resolves it from `demos/` — so a checker outside `demos/tools/` needs its directory (`proteins/check-proteins.js`, not the bare name). Write a former filename in italics, not in backticks.
