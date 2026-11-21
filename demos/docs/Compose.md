<!-- KIND: reference — handed to a model as its context when it COMPOSES a lesson as JSON instead of writing a page. The component sections that follow it are Components.md's, cut to the ones the request needs. Under test: tools/gen-json.js. -->

# Composing a lesson

You write one JSON object. A runtime (`kit/compose.js`) turns it into a step-through lesson: a full-window 3D scene, and a glass panel with an eyebrow, a title, a short body and controls. The student moves with Back and Next. You write no code.

The component sections below are written for a page that calls JavaScript. Read them for **what a component can show**: its params (the names in its `mount` example), what glides, its `state()` fields, and its anchors for notes. Ignore the code itself.

## The object

- `title`: a short name. `brand`: the panel's heading, a few words. `summary`: one line on what the lesson shows.
- `scenes`: one or two. Each is `{ id, component, params }`. `component` is a name from the sections below, spelled exactly. `params` set where the scene starts. Two scenes only when the lesson changes scale or compares two things; each step then names the one it shows.
- `steps`: three to six. Each makes one claim the picture is showing right now.

## A step

- `scene`: the id of the scene this step shows.
- `eyebrow`: two or three words, like "1 · Filtration". `title`: the claim, one line.
- `lead`: one sentence, the claim in full; it is shown in bold. `body`: zero to two short paragraphs. `callout`: optional, one boxed aside. Inside text, `<strong>` and `<em>` only. No em dashes.
- `set`: the params this step changes. They **glide**: the student watches the scene move there, so set the destination and let it run. Only params the component's section names.
- `notes`: zero to three callouts pinned to parts, `{ anchor }` for the library's own label, or `{ anchor, text, card }` in your words. `anchor` is one of the component's listed anchor names. A question about a thing on stage is answered with a note on it, not a paragraph.
- `legend`: `true` when the student will ask what a colour means. Most steps with several coloured things on stage want it.
- `describe`: one or two sentences saying what the scene shows, for a student who cannot see it. Put a live number in braces with its `state()` field name: `"The cell holds {volume} cubic micrometres."` Never type a number.
- `controls`: usually none. At most one or two on a step that asks the student to try something:
  - `{ type: 'slider', param, label, min, max, step, unit, digits }`: drags a gliding param. Use the range the section gives.
  - `{ type: 'button', label, set }`: one click sets params, which glide. Two or three buttons make a choice (pure water · plasma · brine).
  - `{ type: 'readout', key, label, unit, digits }`: a live number from `state()[key]`. Only when the step's own sentence is about that number.
- `nextLabel`: optional, what the Next button says, like "Now add salt".

## Values

Every param value is written as a string: `"1"`, `"-0.5"`, `"true"`, `"null"`, `"leaf"`. The runtime turns them back into numbers and booleans. A param that is an object in the section's example takes a dotted name and its value as JSON: `{ "name": "proteins.leak", "value": "{\"x\":0}" }` puts a leak on stage, and `"null"` takes it away.

## Editing: ops

An edit replies with `ops`, a list of verbs applied in order, and a one-line `summary` of the change. Steps are numbered from 1, as the lesson you are shown numbers them in `n`, and every op in the list uses those numbers, even after an earlier op added or removed a step. Only `moveStep`'s `to` is a position in the final order. An eyebrow's leading number is renumbered for you. Use as few ops as the change needs and touch nothing the student did not ask about.

| op | fields | does |
| --- | --- | --- |
| `addStep` | `after` (0 = first), `add` (a whole step) | inserts a step |
| `removeStep` | `step` | deletes it |
| `moveStep` | `step`, `to` | moves it |
| `setText` | `step`, `field` (eyebrow · title · lead · callout · describe · nextLabel), `text` | replaces one field; empty `text` clears it |
| `setBody` | `step`, `paragraphs` | replaces the body |
| `set` | `step`, `params` | params the step glides to; a name already set is replaced |
| `addNote` | `step`, `anchor`, `text`, `card` | pins a note; one per anchor |
| `removeNote` | `step`, `anchor` | unpins it |
| `addControl` | `step`, `control` | appends a slider, button or readout |
| `removeControl` | `step`, `index` (from 1) | removes one |
| `legend` | `step`, `on` | shows or hides the colour legend |
| `addScene` | `scene` (a new id), `component`, `params` | a second scene; the existing steps keep the first, and each step you add for the new one names it in `scene` |
| `swapComponent` | `scene`, `component`, `params` | replaces a scene's component; its steps lose their params, notes and controls, so follow with ops that give the new ones |
| `retitle` | `text` | renames the lesson |

"Add a slider for oxygen" is one `addControl`. "Make step 2 shorter" is a `setBody` and maybe a `setText` on `lead`. "Show it in salt water too" is an `addStep`.

## Rules that render fine and are wrong

- A component, param, anchor or `state()` field the sections below do not name does nothing. Use only those.
- A number the student reads comes from `state()` through a readout or `{field}` in `describe`, never typed into prose.
- Keep the same one or two readouts across steps when the lesson is about one quantity: the same number falling and then climbing is the argument.
- A step that is a paragraph and a scene gets no controls. Controls belong to steps that ask a question the student answers by touching one.
- When a request asks for something no component below can show, say so in one sentence in a step rather than faking it.
