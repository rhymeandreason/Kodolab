# tools/sdf/ — the committed PubChem inputs

The source records for every `src:{path:'pubchem'}` spec in `molecules.js`.
Eleven files, 84 KB. They are **build-time inputs, never a page dependency** — no
HTML here loads them, and nothing fetches at runtime.

Committed because path 2 was the one path that could not be re-run from this
repo: both converters read `${name}.sdf` from the working directory, and no
`.sdf` existed anywhere. See docs/molecule-pipeline.md item 2.

## Re-running a conversion

The converters read from the working directory, so run them from in here:

```bash
cd demos/tools/sdf
node ../sdf2spec.js glycine alanine serine cysteine   # -> generated-specs.json
node ../sdf2spec-generic.js amp atp                   # -> generated-specs-generic.json
```

Then compare against what is committed. `generated-specs*.json` are outputs, not
inputs — they are gitignored by the `_`-prefixed convention's spirit and should
not be committed.

## What is actually in here

`regen` in each spec's `src:` says how completely that file rebuilds the spec.
`check-molecules.js` enforces that the value is present and that the file named
by `src.sdf` exists.

| File | CID | Conformer | `regen` | |
|---|---|---|---|---|
| `glycine.sdf` | 750 | `000002EE00000001` | `exact` | rebuilds to 0.000 |
| `alanine.sdf` | 5950 | `0000173E00000001` | `exact` | rebuilds to 0.000 |
| `serine.sdf` | 5951 | `0000173F00000001` | `exact` | rebuilds to 0.000 |
| `cysteine.sdf` | 5862 | `000016E600000001` | `exact` | rebuilds to 0.000 |
| `amp.sdf` | 15938965 | `00F3359500000005` | `exact` | rebuilds to 0.000 |
| `atp.sdf` | 5461108 | `0053547400000001` | `exact` | rebuilds to 0.000 |
| `phosphate.sdf` | 1004 | `000003EC00000001` | `exact` | rebuilds to 0.000 |
| `datp.sdf` | 15993 | `00003E7900000001` | `manual` | the frame for all four dNTPs |
| `proline.sdf` | 145742 | `0002394E00000001` | `manual` | `sdf2spec.js` throws on it |
| `glutamine.sdf` | 5961 | `0000174900000002` | **`lost`** | does *not* rebuild the spec |
| `glutamate.sdf` | 33032 | `0000810800000001` | **`lost`** | does *not* rebuild the spec |
| `valine.sdf` | 6287 | `0000188F00000002` | `exact` | |
| `histidine.sdf` | 6274 | `0000188200000001` | `exact` | |
| `leucine.sdf` | 6106 | `000017DA00000001` | `exact` | |
| `threonine.sdf` | 6288 | `0000189000000001` | `exact` | |
| `tyrosine.sdf` | 6057 | `000017A900000001` | `exact` | |
| `isoleucine.sdf` | 6306 | `000018A200000001` | `exact` | |
| `asparagine.sdf` | 6267 | `0000187B00000002` | `exact` | |
| `phenylalanine.sdf` | 6140 | `000017FC00000001` | `exact` | |
| `arginine.sdf` | 6322 | `000018B200000004` | `manual` | the neutral base; the spec adds HE to make the +1 guanidinium |
| `methionine.sdf` | 6137 | `000017F90000000E` | `exact` | |

Verified 2026-07-30, `atp.sdf` added 2026-08-12, `phosphate.sdf` 2026-09-02, `datp.sdf` 2026-09-05. Seven of eleven rebuild exactly; the three that do not are
each a different problem, and the two marked `lost` are the ones to be careful
with.

## The three that are not straightforward

**`datp` — one record, four molecules.** All four dNTP specs are built from
this one file: its adenine is removed and each of the four bases is superposed
on the frame that adenine occupied, so the four wear one sugar and one
triphosphate. PubChem publishes no 3D conformer for dGTP at all, and four
independently-relaxed floppy triphosphates would have been the worse choice
anyway. The conversion re-runs, but the graft and the two swept torsions sit in
the middle of it, which is what `manual` records. `mol-nucleic.js`'s dNTP header
is the argument; `tools/check-handedness.js` is what proves the graft did not
mirror anything, against all four published records.

**`proline` — the converter refuses it.** `reindex` assumes the backbone order
`0 N · 1 H · 2 H · 3 Ca`, i.e. two hydrogens on the amino nitrogen. Proline's
nitrogen is secondary — one H, one bond into its own side-chain ring — so slot 2
has nothing to fill it and `sdf2spec.js` throws a `TypeError`. It is the one
proteinogenic amino acid the amino-acid converter cannot take, which is also,
not coincidentally, the fact `contrast-lab.html` teaches about it. The committed
spec was reindexed **by hand** and then put through `reframe()` alone. So this
file records the source truthfully; it just does not, on its own, reproduce the
spec.

**`glutamine` and `glutamate` — the source geometry is gone.** All ten
currently-published conformers of each CID were fetched and converted on
2026-07-30. None reproduces the committed spec: glutamine's best is |Δ| 6.357
(the default record 7.056), glutamate's best 5.827. The deviation climbs
outward from the backbone — N 0.5 → CG 1.5 → CD 2.3 → NE2 5.3 → terminal H 7.1 —
so the backbone reproduces and the flexible tail does not.

PubChem regenerates conformer sets, and whichever one these came from is no
longer published. **The files here are the closest available record, not a
reproduction.** The specs in `molecules.js` are now their own source.

> **Do not "refresh" these two from PubChem.** You would silently swap the
> rotamer. The amide's edge-on presentation is a property of *that* conformer
> and the contrast lesson depends on it — this is exactly the class of change
> that renders beautifully and teaches something slightly different.

## The trap that produced a wrong conclusion, worth not repeating

`amp` is committed as the dianion, and its own comment always said the record
supplied it. The item 0 sweep queried the **name** `AMP`, which returns CID
6083 — the neutral acid: 37 atoms, two extra H on the phosphate oxygens, and a
different conformer. It read 14 fetched hydrogens against 12 committed and
concluded a stripping step had happened. None had. The right record is CID
15938965, `adenosine 5'-monophosphate(2-)`, and it rebuilds the spec exactly.

**A name query does not pin a charge state, and does not pin a stereocentre**
(the same reason PubChem's generic `glucose`, CID 5793, is the wrong reference
for a spec that claims an anomer). The four amino acids here were originally
fetched by name; they now carry a CID because of this. Their `query:` field is
kept only to record how they were *originally* asked for.

## What is still missing

Nothing verifies these files automatically. `check-molecules.js` confirms a
named `.sdf` exists, but re-running a conversion and diffing is a manual step —
the numbers in the table above came from a hand-run sweep. That check is now
*possible* offline for the first time, since the inputs are committed; building
it would be a small, self-contained addition.
