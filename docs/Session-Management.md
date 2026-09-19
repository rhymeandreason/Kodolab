<!-- KIND: recipe. How to run several model sessions on this repo at once without them colliding, and without the human's review becoming the queue. Written for the human planning the work, and for a session told it is one of several. The plans it schedules are Build-Updated.md, Components-Recommendation.md and Generator-Recommendation.md. -->

# Running the work across sessions

Sessions are cheap and fast. One person's eye in Safari is neither: framing, rotation, captions, colour, and whether the science reads true are all judged there, by hand. So the work is arranged around that one scarce thing. Everything below follows from it.

## 1. A session owns a folder, not a task

A component session owns `<component>/`: its scene, its bench, its checker. It reads anything and writes nowhere else until the end. Two sessions that own different folders cannot collide, whatever their tasks are.

**The collisions are in the registries,** the few files everything touches:

| File | What a new component or page adds |
| --- | --- |
| `kit/app.js` | a line in `USES` |
| `demos/docs/Components.md` | its section |
| `admin.html` | its card |
| `demos/docs/Modules.md` | a row, if a module moved or was promoted |
| `lib/lessons.js`, `vercel.json` | a lesson's row, a short URL |
| `tools/check.js` | its checker's registration |

**Registration is one small commit at the end, and only one session registers at a time.** Until then the component is exercised through its own bench, which needs no registry.

**Stage and commit in one command,** naming the files (`git commit <paths> -m …`). Parallel sessions share one index, and a `git add -A` in one sweeps up another's half-finished work. If a commit does get swept, say so and offer to split it; never reset or rewrite HEAD alone, because someone else's work may be sitting in it.

## 2. Content runs in parallel. Infrastructure runs alone

**Content** is a component, a lesson, a protein story, a molecule. Its files are its own, so several run side by side in the main checkout on the human's dev server.

**Infrastructure** is anything that touches every page: the build, the Three.js upgrade, a module conversion, a change to `kit/card-stage.js` or `kit/lesson-shell.js`. For each:

* **Its own worktree, and its own dev server:** `node tools/dev-server.js 8821` from inside the worktree. Port 8817 is the human's and serves the main checkout; the in-app preview also pins to the main checkout, so a worktree is tested at its own port.
* **A quiet window.** No content session open against the same shared modules while it lands, or each invalidates the other's testing.
* **Small commits behind the smoke run** (`Build-Updated.md` §5). For a module conversion that is one file per commit.
* **Merged soon.** A long-lived infrastructure branch meets every content commit made since it forked.

## 3. A brief in, a handoff out

Every session starts from a written brief. The existing build-time briefs (`Cell-Component.md`, `Membrane-Chemiosmosis.md`) are the model; the additions are the ownership lines and the click list.

```markdown
# <Thing>: brief

**Read first:** <the docs CLAUDE.md's table names for this task, and the sibling to copy>
**Owns:** <folder(s)>. Writes nowhere else until registration.
**Must not touch:** <shared modules in play elsewhere; the registries until the end>
**The claim:** <what the scene says about the science, in two sentences, and the
"Good for / Not for" line, written before any code>
**Done when:** <the checker passes; tools/gen-app.js writes a working page from the
Components.md section alone; the smoke run is green>
**For the human to judge in Safari:** <the bench URL, what to click, what should happen>
```

**The "Good for / Not for" line is written first.** It is the scope, it is what stops a component growing sideways, and it is what the model will choose the component by.

A session ends with a handoff: what was built, what was skipped and why, the bench URL, the click list, and anything it noticed outside its folder, reported and not fixed. A brief retires when the feature ships, and its lasting rules move into `demos/docs/`.

## 4. No more in flight than can be reviewed

Two or three sessions at once. A finished session waiting on a Safari pass is inventory: it goes stale as the files around it move, and its author's context is gone by the time the feedback arrives.

**Batch the judging.** Several sessions finishing into one review sitting is better than context-switching as each lands. The sitting is a list of bench URLs and clicks, walked in order, with notes that go back as each session's next message.

## 5. Review by a session that did not write it

A fresh session, given the diff, `SCIENCE.md` and the component's claim from its brief, checks the science and the code. It finds more than the author does, because it does not share the author's assumptions, and it costs minutes. Before registration, every time.

What it is asked, specifically: does each motion imply only what `SCIENCE.md` §5 allows; is every number in user-facing text read from the data; is every exaggeration stated in a comment; does the checker assert the claim the component makes, or only that it runs.

## 6. Gates the machine runs

In the order they catch things:

1. `node tools/check.js <changed files>`, by the session, before its handoff.
2. **The smoke run** over the featured lessons: page errors, failed requests, a screenshot each. Against the dev server until the build exists. This is the gate that lets content move fast across shared modules, so it comes before anything else in this document is worth doing.
3. **The generator eval**, after any change to a component or to `Components.md`. Run the sweep in one process: `Generator.md` §5 measured that each fresh `gen-app.js` process pays a cache write larger than any single turn.

The smoke run and the eval sweep can run nightly on a schedule, with a report waiting in the morning: what broke, which screenshots changed, which generated pages stopped working.

## 7. What can run unattended

Work that is well specified, mechanical, and gated by the smoke run: a leaf-file module conversion, declared parameters added to an older component, a seeded random source threaded through a sim, comment cleanup against the rubric. These go to background sessions, and the human reviews a diff.

What cannot: anything whose test of done is how it looks. A session cannot see a rotation, and a hidden browser tab never fires `requestAnimationFrame`, so an animated path goes untested unless the page's functions are driven directly. That work ends at a bench and a click list, always.

## 8. Starting order

1. The smoke run, against the dev server. Everything above leans on it.
2. Two content sessions from `Components-Recommendation.md`: enzyme kinetics (a promotion of code that exists) and gene expression (the largest gap). Different folders, so they run together.
3. One small item from `Build-Updated.md` §12's "now" list at a time, in a worktree where it touches shared files.
4. A review sitting when two benches are waiting, not before and not much after.
