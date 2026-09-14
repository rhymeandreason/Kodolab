Short recipe, from the two builds:

 1. **Copy prion-story.html, not the DNA page.** The DNA page hand-builds its molecule; the two protein pages drive Proteinbox. The layout is `css/story.css` and the scroll is `lib/story.js`, shared by all three; the page keeps only its parts and `show()`.

 2. **Pick the files first, and pick few.** The bench settles which depositions are real; the page takes the ones that carry a story beat. Myoglobin used four of seven, prion three of three. A file without a sentence to say about it stays on the bench.

 3. **Write PARTS as the table of contents.** One entry is: `id` (which file), `title`, `sub`, `note` (the claim, blank-line paragraphs), `notes` (callouts), optional `stats`, `dl`, `close`. Five to seven parts. The first is the masthead and gets `deck`, `hint`, and the stats row. If a later part switches to a materially different file, give it a stats row too.

 4. **Every number in a note is a function of the trace.** `frac`, `extents`, `rungs`, `fileStats`, and myoglobin's HemeMetrics are the pattern. Type only history (Kendrew's 1958) and say so in a comment.

 5. **Callouts anchor on named atoms, read each frame.** `worldAt(p)` through the pocket group (myoglobin) or `box.group`(prion). Helices hang on the middle CA of an ss run. Two to four per part, none on the masthead.

 6. **Offsets point away from the stage edge and away from each other.** Typed pixels, placed at 1440 wide. Check every part once in Safari. The three failures so far were all offsets: a label off the right edge, two leaders crossing, a label on top of the atoms it named.

 7. **Lean in only when there is a site.** `close:true` plus a human-picked `SITE_VIEW` and a radius in ångströms. Whole-protein parts pass `focus(null)`.

 8. **A transition between two files is three moves in order:** turn at the current distance, reveal, pull back. Hold the framing by hand while the box is still building, since it re-fits on every chain. Two files in one frame can be animated honestly; two files in different frames cannot.

 9. **Stage caption says the file, the column says the science.** Do not repeat species or resolution in the caption once the stats row has them.

10. **The story replaces the bench as the protein's public page.** Name it `proteins/<key>/<key>-story.html` and wire it in one pass:
    * `proteins.js`: add `story: 'proteins/<key>/<key>-story.html'` to the entry. `proteins/index.html` reads it, shows "Learn More →" on the card and in the modal, and drops the bench link.
    * `vercel.json`: point `/proteins/<key>` at the story, move the bench to `/proteins/<key>/bench`, and redirect both files' `/demos/...` paths to their short URLs.
    * `tools/seo.js`: add `/proteins/<key>/bench` to `HIDDEN`, title the page `<Protein> Structure in 3D — Kodolab`, then run `node tools/seo.js`.
    * `admin.html`: a card for the story. An older student page it replaces goes to `attic/`.
    * The running dev server reads `vercel.json` once at start; restart it before testing a short URL.

If you want this kept, it belongs in docs/AddingAPage.md as a section, or as its own recipe. Say which and I will write it.
