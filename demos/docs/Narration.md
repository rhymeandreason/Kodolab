<!-- KIND: recipe. Load whole before turning on narration for a lesson, writing or editing what a lesson's narrator says, or re-baking its audio. How the Listen player works is `kit/listen.js`'s header; the tool's flags are `tools/narrate.js`'s. -->

# Narration

A lesson on `kit/lesson-shell.js` can be listened to: the Listen button reads each step as a chapter, sentence by sentence. Fixed sentences play recordings baked with Kokoro. A sentence with a live number is spoken by the device's own voice, because it only exists at run time. The voice change mid-chapter is accepted.

## The pipeline

| Piece | Job |
| --- | --- |
| `step.listen(ctx, read)` in the page | The chapter: the panel's own text (`read`), then the page's beats. A beat whose `say` is a string can be baked; one whose `say` is a function is read when reached and is always live |
| `LessonShell.create({ narration: '<name>' })` | Turns clips on. Without it, every sentence is live speech |
| `shell.script()` | Every bakeable sentence: the intro, then each step's chapter as its panel reads |
| `tools/narrate.js <page>.html` | Opens the page headless, takes `script()`, bakes what is new, deletes what is gone |
| `media/narration/<name>/` | One `<key>.m4a` per sentence, and `manifest.json` mapping key → text, voice, speed |
| `kit/listen.js` | Plays the clip whose manifest text matches the sentence it is about to say; otherwise speaks it live |

A clip is keyed by a hash of the sentence after `speakable()` (δ−, H₂O, °C rewritten for the ear). A reworded sentence gets a new key, so a stale clip can never play: it just stops matching, and the next bake removes it.

## Narrating a lesson

1. Add `narration: '<lesson file name without .html>'` to the page's `LessonShell.create`.
2. Write `listen(ctx, read)` for the steps that need more than their panel text (the scene tour, an invitation to act). A step without one is read as its panel plus its `describe`.
3. With the dev server running (`node tools/dev-server.js`):

```bash
node tools/narrate.js water-lab.html
```

4. Commit the page and `media/narration/<name>/` together.

**Re-run step 3 whenever the lesson's text changes**: the panel copy, a `listen` beat, a callout the tour reads. Nothing else catches a lesson whose sentences have outrun its clips. It degrades to live speech rather than breaking.

## Writing sentences that bake

* **A number read from the sim goes in a function**: `{ say: () => \`There are ${N} molecules.\` }`. A template literal evaluated when the chapter is built bakes whatever the headless page had, so it plays the wrong number. A step's `describe` function is already treated as live.
* **Keep live numbers in their own sentence.** "There are 12 molecules. Each one is drawn as a dashed line." is one live line and one clip, while one long sentence carrying both is all live.
* **A constant from the data is fine as a string** (`${angleDeg}`), since it is the same on every load. It is still read from the data, so a re-bake follows the data.
* Comments (`shell.listen.comment(...)`) are live by nature and never baked.

## The voice

Kokoro-82M, voice **`af_heart`** at speed 1, chosen 2026-11-25 from a side-by-side of nine voices. Every lesson uses it, so the course has one narrator. Changing the voice or speed re-bakes every clip in that lesson; change it everywhere or nowhere.

AAC in `.m4a` at 64 kbps: it plays in every current browser, about 8 KB per second of speech. The tool writes it with `afconvert`, so baking runs on a Mac.

To audition voices or try a sentence: `node tools/narrate.js sample "<sentence>" --voices af_heart,bm_george`, or `tests/tts-test.html` in the browser.
