<!-- KIND: rulebook. Load whole before building or restyling ANY page: a lesson, a generated app, a collection, a component bench. Its first section is which of the two shells the page takes, and getting that wrong is not a styling mistake. `Modules.md` says which stylesheets to link; this says what to put inside the page once they are linked. -->

# The page shell

**THERE ARE TWO SHELLS, AND THE PAGE PICKS ONE.** Read this section before
anything below it, because everything below it describes only the first.

| | `body.kodo` — the document shell | `body.lshell-page` — the lesson shell |
| --- | --- | --- |
| what it is | a page you read and scroll | a full-window scene with a glass panel over it |
| sheets | `css/kodo.css` | `css/kodo.css` **then** `css/lesson-shell.css` |
| chrome | `.sitenav` + `.pagehead` + `main` + `.sitefoot` | `.lshell-topbar` (brand, progress dots), `.lshell-panel`, Back/Next |
| who owns the DOM | the page | `kit/lesson-shell.js`. Nothing goes in the `<body>` |
| built by | hand | `LessonShell.create({brand, hint, steps})` |
| used by | the homepage, `proteins/`, a protein's page, the node graph | every generated app, `tree/tree-lab.html`, and **every component bench** |

**A component bench takes the lesson shell**, not the document shell and not a
bench chrome of its own. `leaf/leaf-test.html` is the one to copy, and the reason
is in its header: the component is judged in the chrome a student will see it
in. `docs/AddingAComponent.md` is the recipe; `docs/Components.md` carries the
boilerplate a generated page starts from.

**Do not put a `.sitenav` or a `.pagehead` on a lesson-shell page.** The brand in
`.lshell-topbar` is that shell's wordmark slot, and a second masthead over a
full-window scene covers the thing the page exists to show.

`lesson-shell.css` declares its own tokens on `body.lshell-page` — `--ink`,
`--line`, `--panel`, `--display`, `--accent` and the rest. They shadow the site
sheet's for the duration of that page and are the shell's business; a page on it
reads those names, not `--text-strong` and `--border-hair`.

---

## The document shell

Every public page on `body.kodo` is the same blocks in the same order, so moving
between them feels like turning a page rather than opening another site. Copy
this.

```html
<link rel="stylesheet" href="css/kodo.css">   <!-- the only sheet a plain page needs -->
...
<body class="kodo">
<div class="page">

  <nav class="sitenav">
    <a class="mark" href="/"><img src="/kodolab-wordmark.svg" alt="kodolab"></a>
    <span class="crumb">proteins</span>
  </nav>

  <header class="pagehead">
    <h1>proteins</h1>
    <p class="deck">One line of prose about this page.</p>
  </header>

  <main> ... </main>

  <footer class="sitefoot"> ... </footer>

</div>
</body>
```

`body.kodo` is the opt-in. A lesson is a full-bleed `#app` and must never take a
document's paper rhythm, which is why it is a class and not `body`.

---

## 1. The wordmark

**Never set the letters in type.** The mark is the drawn wordmark, and it is
this, exactly, on every page:

```html
<a class="mark" href="/"><img src="/kodolab-wordmark.svg" alt="kodolab"></a>
```

The path is root-absolute so it survives a page that carries `<base
href="/demos/">`. `kodo.css` sizes the image off `--mark-size`, so a page sets
no width of its own. On the homepage the mark is the `<h1>`; everywhere else it
is an `<a>` to `/`.

**One size.** `.mark` is `1.35rem` on every page in the repo. There is exactly
one exception and it says so out loud:

| | where | what it is |
| --- | --- | --- |
| `.mark` | every page | 1.35rem, in the nav bar |
| `.mark.hero` | a masthead on this shell | `clamp(2.8rem, 9vw, 5.5rem)`. Defined by `kodo.css` and unused today: the front door draws its own hero, because it is not on this shell |
| `.sitenav.floating` | a full-window app (the node graph) | the same bar, fixed over the canvas |

**This is the rule with the worst failure mode in the repo.** Four pages each
spelled the mark out in their own `<style>` at three different sizes, and no
single page looked wrong. It is only visible when a reader moves between two of
them, which is the one thing nobody does while building one.

## 2. The bar and the masthead

`.crumb` says where this page sits. A `<span>` when the page **is** that place,
an `<a>` when it is a level up. Same size either way, so the bar keeps its shape.
It is the way back: a page that also prints its own "← all proteins" link is
saying it twice. **A crumb that repeats the page's own `h1` is left out**: the
heading already says where you are, so `/login`, `/teach` and the design page
have none. Write one only when it names something the heading does not (the
collection a molecule sits in, the subject a lesson belongs to).

**The four links on the right of the bar are written by `lib/site.js`, not by
the page** — Lessons, Library, Contribute, Build, with `aria-current="page"` on
the one you are in. A page types no part of that row: a link typed into one bar
is a link the other nine do not have, and which pages carry the nav then depends
on when each was last edited. `contribute.html` is the one exception, because
its bar is its own (fixed, blurred, its own palette) and says so in a comment.
Only `body.kodo` gets the row, for the same reason only it gets the foot.

`.pagehead` carries the page's own name and closes with the 2px rule, which is
the one heavy line in the system and means "this page's name stops here".

| class | for |
| --- | --- |
| `.pagehead h1` | the name, lowercase geometric |
| `.pagehead h1.proper` | a proper noun that keeps its capital (a protein is called Myoglobin) |
| `.pagehead .deck` | the sentence under the name, serif |
| `.pagehead .meta` | a count or a date on the right, micro-cap, tabular |
| `.pagehead .tagline` | the homepage's line of prose on the right |
| `.pagehead.open` | no rule, for a reading page whose deck runs into the first section |

Inside `main`: `.lede` is one line saying what the reader is looking at a
collection of. `.sechead` is a section head (`h2` + `.rule` + an optional
`.count` or `.more`).

**The page's action is `.cta`**, and `.cta--ghost` is the second answer where a
page offers one. It is usually an `<a>`. Do not reach for `.pill` here: a pill
is an instrument standing on a model's paper, a solid body with a side and a
shadow, and on a document it reads as a sticker. Which shape a control takes is
decided by what it is lying on, not by how important it is. Every shape is drawn
live in `design-system.html`.

`.cta`, `.pill` and `.segmented` share one voice: the display face, uppercase,
letterspaced, accent at rest and spark on hover. **A `.pill` gives up the spark
the moment a page names its colour** (`--pill-fill`), because a pill on the
stage is often a substance rather than an action, and water-lab's blue Add Water
turning orange under the pointer would be a claim about a different substance.
The step tabs (`.pill--ghost`) take none of the signage: they carry phrases, and
a letterspaced capital sentence is decoded rather than scanned.

**A switch is not a door, and it takes the shape of what it lies on**:
`.btn--check` in a document, `.pill--ghost .pill--check` on a model's paper
beside a `.segmented--sm`. Both are a `<label>` around a real checkbox, and
neither changes when checked, because the tick already says so.

## 3. What a page does not get to set

Paper, gutter, measure, masthead rhythm and the two accents belong to
`kodo.css`. A page that restates one has forked it, silently, until somebody
compares two pages side by side.

| token | what it is |
| --- | --- |
| `--page-max` | the measure. The only one a page routinely overrides: the homepage sets 1080px |
| `--page-gutter` | the side padding. `.page` reads it, so a full-bleed child undoes it with one negative margin rather than guessing the clamp |
| `--page-top` · `--head-gap` · `--page-gap` | nav to window, rule to content, grid gutter |
| `--mark-size` | set by `.mark` and `.mark.hero`. Nothing else touches it |

**Never type a colour.** `--surface-page` · `--surface-card` · `--surface-stage`
(the warmer ground a molecule is drawn on) · `--border-hair` · `--border-strong`
· `--text-strong` / `-body` / `-dim` / `-muted` · `--accent` · `--spark`. Atom
and bond colours are published from `palette.js` as `--atom-*` / `--bond-*` at
load, so a caption and the sphere it names cannot drift.

**Those are ROLES, and roles are what a page reads.** The values behind them
live one file down in `css/brand.css`, which `kodo.css` imports — so a page on
this shell never links it and never names a `--brand-*`. It is a separate file
for one reason: the front door (the repo-root `index.html`, `contribute.html`) cannot load
`kodo.css`, because the site sheet is a base reset with its own scroll and its
own `.mark` and both fight a bespoke scroll piece. Those two link `brand.css`
alone. It is the only thing the two halves of the site share, and it is the
reason they agree on the paper and the ink.

**The six signature hues** — coral, blue, green, amber, violet, butter — come
from the same file and are a categorical set: no ramp, no order, no meaning
carried by any one of them. A band picks one and then uses it for everything
that band says, its eyebrow and its heading `<em>` and its dot, so the reader
learns a section by colour rather than by counting. **A hue is never a role.**
The primary fill is `--accent`, which is the deep green; reaching for the bright
`--hue-green` because it is the green one is how a page ends up with a second
primary that nothing declared.

**Two sans faces, split by job.** `--font-display` is the geometric one: the
wordmark, a masthead, a micro-cap, a numeral a page reads out. `--font-ui` is
system-ui and is what everything is actually **read** in, because a display face
sets a paragraph badly and its 600 at 13px is a black bar. `--font-editorial` is
Literata, for prose in a card and for a deck.

**One heading device.** Every label is a micro-cap through `--cap-lg` (names a
whole thing) or `--cap-sm` (labels a part of the chrome). Same face, tracking,
weight and colour; the size is the entire hierarchy. A page that picks its own
tracking has invented a third treatment.

---

## Where the truth lives

`css/kodo.css` §6.5 is the shell itself, and its header carries the reasoning;
`css/brand.css` holds the values every role above resolves to, and nothing else
— no reset, no components, no type.
`design-system.html` draws every token on the stage's own paper, reading each
swatch's own computed value, so it cannot claim a colour the token does not
hold. **Nothing above restates a value on purpose**: a hex typed into a doc is a
claim nothing checks.

## The sheets

Which one a new page links, in load order. A page links at most three: `kodo.css`,
maybe `lesson-shell.css`, maybe its own.

| Sheet | What it is | A new page |
| --- | --- | --- |
| `css/brand.css` | the colour values, and nothing else | never links it — `kodo.css` imports it |
| `css/kodo.css` | **the site sheet.** Maps the roles onto brand.css and carries the reset, type, buttons and document shell | always, first |
| `css/lesson-shell.css` | **the other shell**: full-window scene, glass panel, progress dots. Its own tokens on `body.lshell-page` | only a lesson or bench on that shell, after `kodo.css` |
| `css/annotate.css` | the look of a callout | never links it — `kodo.css` imports it |
| `pathways.css` · `proteins/protein-test.css` · `kit/enzyme-blob.css` | **folder chrome**, shared by the pages of one folder: a step-through pathway's rail and lane plates, a protein bench's stage-and-panel grid, the blob's two sways | only a page in that folder, after `kodo.css` |
| the page's own `.css` | **its chrome only** — `build.css`, `graph.css`, `energy/energy.css`. Never a token, never a colour, never a type step `kodo.css` already sets | only if the page has chrome no other page has |

`css/bench.css` is not in the table because nothing new links it: it is the old
scratch-bench sheet, frozen, kept only for the pages already drawn in it.

**A sheet that more than one folder's pages load goes in `css/`; a sheet one
folder owns stays beside it** (`energy/energy.css`, `kit/enzyme-blob.css`).
**This table is the one list.** `Modules.md` carries the `<link>` order a hand-built page writes and nothing else about the sheets.

**The repo-root `index.html` and `contribute.html` have no sheet of their own**: ~240 lines
inline each, on `brand.css` alone, because the site sheet's reset and its own
`.mark` both fight a bespoke scroll piece. The two are not merged while they are
still being reworked, and that is a decision, not an omission.

## The pages on this shell

`proteins/index.html` · `proteins/myoglobin/myoglobin.html` ·
`nodegraph/nodegraph.html` (the `.sitenav.floating` case). Copy the closest one.
**The repo-root `index.html` and `contribute.html` are NOT on it** — they link
`brand.css` alone and draw their own chrome, which is the section above.
