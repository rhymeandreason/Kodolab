<!-- KIND: recipe — load when deploying, or when something about the deployment is wrong. Nothing in the lessons needs it. -->

# Deploying to Vercel

The lessons are static and would publish anywhere. The tutor is why this is not
GitHub Pages: `api/ask.js` is a serverless function, and Pages serves files.

**Deploy from the Git integration, not the CLI.** A CLI deploy uploads the
working tree and consults `.vercelignore` alone - a gitignored file is not
excluded by being gitignored, and `.env.local` is a gitignored file. The Git
integration only ever builds what is committed, which is the same guarantee
Pages gives today. **The Git integration honours `.vercelignore` too**
(`/demos/ask/log.html` 404s in production), so an entry there keeps a file off
the site either way.

## What deploys

`vercel.json` sets `outputDirectory: "."`, so the repo root is the site, exactly
as Pages publishes it. The local URL is the URL that ships, which is the whole
reason `dev-server.js` serves the root rather than `demos/`.

Local tools are withheld by `.vercelignore`: the log viewer
(`demos/ask/log.html` + `api/log.js`), the question-bank editor, and the
`viewer-compare/` bench. See that file for why each one.

**Test benches do not deploy**: `demos/tests/` and every bench no public page
links. The ones a public page does link stay: the library's component cards and
every `/proteins/<key>` page. A new bench deploys unless it is added there.

**The deposited structures do not deploy either.** Every `.pdb` in the repo is a
baker input: the bakers under `*/tools/` read one and write the `.bin`/`.json`
a page actually fetches. They are committed because they are not reproducible on
demand - an entry gets superseded, a download URL moves - so git is the pin on
the exact structure a lesson was checked against. That is 13 MB the site never
serves.

Four pages fetch one at runtime and so are broken on the deployment, on purpose:
`attic/folding-lab.html` and `attic/folding-lab-ribbon.html` (1VII),
`kit/ribbon-test.html` (villin), `hemoglobin/hemoglobin-inhouse.html`
(2HHB). All four are prototypes or benches, used on the dev server. **Promoting
one to a featured lesson means baking what it fetches, not un-ignoring the
`.pdb`.**

`vercel.json` also redirects `/viewer-compare` and everything under it, and
anything ending `.pdb`, to `/`, as a second guard: a redirect is matched before
the filesystem. The two `api/` tools do not need the
same treatment: an undeployed function is not a route at all, and the smoke
test below checks that.

## Public pages have short URLs

`vercel.json` rewrites a short URL onto each public page's file, and 301s the
file path onto it. `index.html` links the short form. The five featured lessons
are `demos/*.html`; the node graph is `/nodes`, the protein collection is
`/proteins` and each bench under `demos/proteins/` is `/proteins/<key>`. Those
are the cases that show the `<base>` rule below is about the file's own folder
rather than about `/demos/`.

Amylase and haemoglobin have no `/proteins/<key>` URL: their data lives outside
`demos/proteins/`, so the collection page links them by file path. The rule the
gallery applies is the folder, not the registry.
The builder is two more: `/build` is `demos/build/build.html` and `/app/:id` is
`demos/build/app.html?id=:id`, over `api/build.js` and `api/app.js`. Both
functions need `DATABASE_URL`, and `/demos/` is served with
`Access-Control-Allow-Origin: *` because a stored page runs on an opaque origin
and a component that fetches a bake is making a cross-origin request.

**The `rewrites` block is the list**; it is not repeated here, because a URL
renamed there and not here is a doc that lies.

Renaming one is two edits plus a third: the paired `redirects` entry has to
follow it, `index.html`'s link has to follow it, and the URL it replaces needs
its own redirect onto the new one. The old `/demos/….html` 301 is `permanent`,
so a returning browser goes to the retired short URL from cache and never asks
the server which page it wanted.

**A new rewrite also needs a search decision.** `demos/tools/seo.js` fails until
the route is in its `PAGES` (indexed, with a description) or `HIDDEN` list, then
rewrites `robots.txt`, `sitemap.xml` and the page's head block. Submit
`https://kodolab.org/sitemap.xml` in Google Search Console once.

A rewrite does not move the file, so every relative `src`, `href` and `fetch()`
in a rewritten page would resolve against `/` instead of against the folder the
file sits in. Each one carries a `<base>` naming that folder for that reason —
`/demos/` for the lessons, `/demos/nodegraph/` for the node graph — which is
also correct at its own path and on the local dev server. **Adding a page to this list means
adding the `<base>` tag too** - without it the short URL serves the HTML and
then 404s every script in it.

The short URLs work locally too: `dev-server.js` reads the same `rewrites` block
out of `vercel.json`, so the index's own links resolve on the dev server instead
of 404ing there and working only once deployed. The file path still serves
directly as well.

**Two files become public endpoints: `api/ask.js` and `api/find.js`.** Vercel
does not route files whose names begin with an underscore, so `_tutor.js`,
`_keys.js`, `_limit.js`, `_finds.js`, `_log.js`, `_catalog.js`, `_targets.js`,
`_local.js` and `_providers/` are imported by them and are not reachable. The
smoke test below checks that rather than trusting it.

**`api/find.js` is OPEN, and that is deliberate.** It embeds one question for
the question composer. The gate it would otherwise inherit is `TUTOR_KEYS`, so
a shared map link would hand out tutor spend with it: one link, two budgets.
Its protection is `_finds.js` instead, which caps searches per visitor and
globally, and a refusal degrades the page to word matching rather than breaking
it. The global cap is the one that means anything, because Gemini's rate limits
are per PROJECT, so an abused search endpoint starves the tutor of quota no
matter which API key each one presents.

**`api/` publishes as readable source.** The system prompt is public. No key is
in it. This was already true on Pages.

## Environment variables

Set in the Vercel project, Production scope. Same names as `.env.local`.

| | |
| --- | --- |
| `GEMINI_API_KEY` | required, or the tutor answers "not set on the server" |
| `AI_PROVIDER` | `gemini` unless you mean otherwise |
| `DATABASE_URL` | the Neon pooled string. **Unset means no log AND no rate limit**, for the tutor and the search alike |
| `TUTOR_KEYS` | `cohort:secret` pairs. **Unset means the tutor is public and unmetered.** Does not gate `api/find.js`, which is open by design |
| `EMBED_MODEL` | optional; `gemini-embedding-001` unless set. **Must match what `lib/mapcontent-vectors.json` was baked with** |

The last two are the ones that fail quietly. Unset `TUTOR_KEYS` does not error:
it makes the tutor open to anyone who finds it. Unset `DATABASE_URL` does not
error either: `_limit.js` and `_finds.js` have nothing to count and both fail
open, so the caps stop existing. Neither shows up on the page.

`EMBED_MODEL` fails quietly in a different way: a query embedded by one model
against a corpus baked by another lands in a different geometry, so the cosines
come back plausible and the composer's ranking is silently wrong. The page
compares the endpoint's reported model against the baked file and drops to word
matching when they disagree, which is the only visible symptom.

## The domain

`kodolab.org` is a GitHub Pages CNAME today. Moving it to Vercel is a DNS
change, and `CNAME` stays in the repo so Pages remains a working fallback: point
the records back and it serves again, without the tutor.

Do the DNS change LAST, after the `*.vercel.app` URL has answered the smoke test
below. The domain must never be the thing that first points at an ungated
endpoint.

## Smoke test

Against the deployment, before the domain moves and again after. `$K` is a real
secret from `TUTOR_KEYS`.

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://<deployment>/            # 200, the lesson index
curl -s -o /dev/null -w '%{http_code}\n' https://<deployment>/water            # 200, the lesson
curl -s -o /dev/null -w '%{http_code}\n' https://<deployment>/demos/scene.js   # 200, what <base> resolves to
curl -s -o /dev/null -w '%{http_code}\n' https://<deployment>/demos/water-lab.html   # 301 to /water
curl -s -w ' %{http_code}\n' https://<deployment>/api/ask                 # 401 gated, 200 if not
curl -s -w ' %{http_code}\n' -H "X-Tutor-Key: $K" https://<deployment>/api/ask       # 200 + config
curl -s -w ' %{http_code}\n' https://<deployment>/api/find                # 200 + config, open by design
curl -s -o /dev/null -w '%{http_code}\n' https://<deployment>/api/_tutor  # 404: not a route
curl -s -o /dev/null -w '%{http_code}\n' https://<deployment>/api/_finds  # 404: not a route
curl -s -o /dev/null -w '%{http_code}\n' https://<deployment>/api/log     # 404: not deployed
curl -s -o /dev/null -w '%{http_code}\n' https://<deployment>/viewer-compare/  # 307 to /, never the bench
curl -s -o /dev/null -w '%{http_code}\n' https://<deployment>/demos/hemoglobin/data/2HHB.pdb        # 307 to /, not 200
curl -s -o /dev/null -w '%{http_code}\n' https://<deployment>/demos/hemoglobin/data/2HHB-B.fold.bin # 200: the baked file IS served
curl -s -o /dev/null -w '%{http_code}\n' https://<deployment>/.env.local  # 404: never uploaded
```

Then in a browser, which is the half curl cannot check:

* `/water` with no `?k=` - **no Ask button**, and the console says why
* `/water?k=<secret>` - the button appears, `k` is gone from the
  address bar, and a question comes back with a Show me pill
* reload with no `?k=` - the button is still there, from `localStorage`

A 401 on the first of those is the gate working, not a broken deploy.

## After it is live

`node demos/tools/db.js cost` and the log viewer read the same Neon database
production writes to, from a laptop, with nothing public in the path. Watch the
per-class counts: a cohort at its hourly cap is what a leaked link looks like.
Rotate by editing `TUTOR_KEYS` and redeploying; the other cohorts are unaffected.
