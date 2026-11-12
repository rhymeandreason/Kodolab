/* =============================================================================
 *  crispr/crispr-steps.js — curing sickle cell by switching fetal hemoglobin on
 * =============================================================================
 *  Content only: what each step says and what it asks the stage to do through
 *  ctx. crispr-lab.html wires it, and its header says what ctx carries.
 *
 *  ONE ARGUMENT: sickle hemoglobin sticks; the hemoglobin every fetus makes
 *  does not, at two residues; so an edit that turns the fetal gene back on
 *  treats the disease without touching the mutation.
 *
 *      1  crowd     HbCrowd, HbS — the problem, as the sickle lesson left it
 *      2  protein   Proteinbox, HbF — the hemoglobin made before birth, and
 *                   the switch to the adult one, charted
 *      3  protein   the same box, HbS / HbF on the switch: positions 6 and 87
 *      4  cas9      Proteinbox, the three deposited states on a segmented
 *                   control: empty, guide loaded, on target
 *      5  flow      BloodFlow x2 — what the edited cells do in a vessel
 *
 *  THE SCENE IN BEAT 4 IS NOT THE BCL11A ENHANCER. 5F9R's DNA is that
 *  crystal's own target, and no deposited structure of Cas9 on this enhancer
 *  exists. So the SCENE carries the mechanism — a guide finds a matching
 *  sequence, the nuclease domain swings in, both strands are cut — and
 *  WHICH sequence is the panel's diagram, which reads as a diagram. A page
 *  that labelled the crystal's duplex 'BCL11A' would be inventing a
 *  structure.
 *
 *  Exposes window.CrisprSteps.
 * ========================================================================== */
(function (global) {
  'use strict';

  /* Both fitted into 2HHB's frame by proteins/hemoglobin/tools/prep.js, so a
     swap moves nothing that did not change. */
  const HBS = {
    id: '2HBS', label: 'HbS', chains: 'A,B,C,D',
    trace: 'proteins/hemoglobin/data/hb-2HBS.json',
    surface: 'hemoglobin/data/2HBS.lesson.surf.bin',
  };
  const HBF = {
    id: '1FDH', label: 'HbF', chains: 'A,B,G,H',
    trace: 'proteins/hemoglobin/data/hb-1FDH.json',
    surface: 'hemoglobin/data/1FDH.lesson.surf.bin',
  };

  /* THE SWITCH, as γ's share of the β-like chains being made (γ + β = 1),
     against weeks since conception; birth is 40. Three points, each a figure
     the literature quotes from Wood (1976, Br Med Bull 32:282) and later
     reviews, not a digitised curve:
       32 wk   β has risen to about 10% by 30-35 weeks
       40 wk   at birth β is about 40% of non-α synthesis
       66 wk   the switch is complete by about 6 months; adult HbF is under 1%
     The page draws these as points and the line between them as a line,
     so nothing between is claimed. */
  const SWITCH = {
    birth: 40,
    points: [{ wk: 32, gamma: 0.90 }, { wk: 40, gamma: 0.60 }, { wk: 66, gamma: 0.01 }],
    source: 'after Wood 1976',
  };

  /* HBG1, the first eight codons of the coding strand, from RefSeq
     NM_000559.3's CDS. Numbered like the sickle lesson's HBB: the initiator
     methionine is 0, because it is cleaved off, so the γ chain a reader meets
     starts at Gly 1 and the position that matters is 6.

     POSITION 6 IS GAG, THE SAME CODON NORMAL HBB HAS THERE. A different gene,
     not a corrected one — which is the whole reason this therapy can work
     without touching the mutation. */
  const HBG = 'ATGGGTCATTTCACAGAGGAGGAC';

  /* The therapy's own numbers, fetched by the page: a figure in the copy is
     read from here at render time, never typed into a sentence. */
  const DATA = 'crispr/data/exa-cel.json';

  const bind = (ctx, off) => { (ctx.state.off || (ctx.state.off = [])).push(off); };
  const leave = ctx => {
    (ctx.state.off || []).forEach(f => f());
    ctx.state.off = [];
    ctx.clearTimers();
    ctx.onToggle = null;
  };

  /* ---- 1 ------------------------------------------------------------- */

  /* The sickle lesson's beat 3, on one side and without the HbA control: a
     reader arriving here either took that lesson or needs the one fact. */
  const step1 = {
    eyebrow: 'The problem',
    title: 'Sickle hemoglobin sticks to itself',
    body: `In sickle cell disease, one amino acid in the β chain of hemoglobin is
      greasy. When the cell runs low on oxygen, the molecules stick end to end into
      long fibres that bend the cell out of shape.`,
    onExit: leave,
    onEnter(ctx) {
      ctx.split(false);
      ctx.toggle(false);
      const { crowd } = ctx.use({ show: ['crowd'], keep: ['protein'] });
      crowd.reset();
      crowd.start();
      crowd.intro(3.2);
      ctx.after(4, () => crowd.play());
      /* The same card the sickle lesson opens on, off the same constants, so a
         reader arriving from there lands on something they have already read.
         The verdict line is left off: this lesson's claim is not the size of
         the change but what can be done about it. */
      const card = Codon.figure({
        dna: SickleSteps.HBB, first: 0, at: SickleSteps.AT, to: SickleSteps.TO,
        view: 'card', verdict: false,
        title: 'normal', mutTitle: 'sickle', name: SickleSteps.HBA.label, mutName: SickleSteps.HBS.label,
      });
      const say = t => ctx.ui.controls(card + `<p class="hint-text">${t}</p>`);
      say(`One base, one amino acid. Watch the crowd: nothing happens for a while,
        and then a chain starts and keeps growing.`);
      bind(ctx, crowd.on('nucleate', () => say(`A chain has started. Any treatment
        has to stop this step.`)));
    },
  };

  /* ---- 2 ------------------------------------------------------------- */

  const step2 = {
    eyebrow: 'A clue',
    title: 'You made a different hemoglobin before birth',
    body: `A fetus builds hemoglobin from γ chains instead of β: fetal hemoglobin,
      HbF. Around birth a switch turns the γ genes down and the β genes up.<br><br>
      Babies with sickle cell are healthy until that switch flips.`,
    onExit(ctx) { leave(ctx); },
    onEnter(ctx) {
      ctx.split(false);
      ctx.toggle(false);
      const { protein } = ctx.use({ show: ['protein'], keep: ['crowd'] });
      protein.show('HbF', { marks: false });
      ctx.ui.controls(`<div id="switch-chart"></div>`);
      ctx.ui.q('#switch-chart').innerHTML = ctx.switchChart(SWITCH);
    },
  };

  /* ---- 3 ------------------------------------------------------------- */

  const step3 = {
    eyebrow: 'Why HbF does not sickle',
    title: 'Two positions make the difference',
    body: `Same fold, and the same place in the chain. Flip the switch and compare.<br><br>
      Position 6 is the sticky spot on sickle hemoglobin. Position 87 sits beside the
      pocket that spot docks into on the next molecule.`,
    onExit: leave,
    onEnter(ctx) {
      ctx.split(false);
      ctx.toggle(true);
      const { protein } = ctx.use({ show: ['protein'], keep: ['crowd'] });
      protein.show(ctx.variant, { marks: true });
      ctx.onToggle = v => protein.show(v, { marks: true });
      /* TWO CARDS, NOT A BEFORE AND AFTER. γ is not a mutant of β, so each
         gene gets its own single-column card and neither is drawn as a change
         in the other. The sickle card is focused on the codon the mutation is
         in, and its ring is the mutation's; the fetal card has no change and
         so wears none. */
      const one = (dna, title, name) =>
        Codon.figure({ dna, first: 0, focus: 6, view: 'card', title, name });
      ctx.ui.controls(`
        <div class="cr-codons">
          ${one(Codon.read({ dna: SickleSteps.HBB, first: 0, at: SickleSteps.AT,
                             to: SickleSteps.TO }).mutant.dna, 'sickle β6', SickleSteps.HBS.label)}
          ${one(HBG, 'fetal γ6', HBF.label)}
        </div>
        <p class="hint-text">Different genes, and at position 6 the fetal one reads
          the same codon normal adult hemoglobin does. Drag to turn the molecule;
          tap a label to read it.</p>`);
    },
  };

  /* ---- 4 ------------------------------------------------------------- */

  /* THE EDIT, AS THREE CRYSTALS OF ONE PROTEIN. Each press is a step the
     reader caused: loading the guide reshapes Cas9, and only pairing with a
     matching sequence swings HNH into position to cut. The shifts the panel
     prints are the bake's own (proteins/cas9/tools/prep.js fits all three on
     RuvC + PI and measures what moved), so the claim that something moved is
     the measurement and not the picture.

     APO IS MISSING 228 OF ITS 1372 RESIDUES, mostly in the two domains that
     move. They are not drawn and then they are, which is a bake arriving and
     not a motion, so the copy says what moved and the panel says how far. */
  const STATES = [
    { id: '4CMP', label: 'Empty',
      say: `Cas9 on its own does nothing. It has no way to tell one stretch of DNA
        from another.` },
    { id: '4ZT0', label: 'Guide loaded',
      say: `A guide RNA loads, and the protein closes around it. The guide is the part
        you choose: it carries the sequence Cas9 will go looking for.` },
    { id: '5F9R', label: 'On target',
      say: `The guide finds DNA that matches it and pairs with one strand. Only then does
        the cutting domain swing into place, and both strands are cut.` },
  ];

  const step4 = {
    eyebrow: 'The edit',
    title: 'Cas9 cuts what its guide tells it to',
    body: `Casgevy does not repair the sickle mutation. It cuts the enhancer that
      switches on BCL11A, the protein that holds the γ genes off after birth. Break
      that enhancer and the cell makes fetal hemoglobin again.`,
    onExit: leave,
    onEnter(ctx) {
      ctx.split(false);
      ctx.toggle(false);
      const { cas9 } = ctx.use({ show: ['cas9'] });
      let at = 0;
      const draw = () => {
        cas9.show(STATES[at].id);
        ctx.ui.controls(`
          <div class="segmented" role="group" aria-label="Which state of Cas9">
            ${STATES.map((s, i) => `<button type="button" class="${i === at ? 'is-on' : ''}"
               data-i="${i}">${s.label}</button>`).join('')}
          </div>
          <p class="hint-text">${STATES[at].say}</p>
          <div id="gene"></div>`);
        for (const b of ctx.ui.qa('.segmented button'))
          b.onclick = () => { at = +b.dataset.i; draw(); };
        ctx.ui.q('#gene').innerHTML = ctx.geneDiagram(at === 2);
      };
      draw();
    },
  };

  /* ---- 5 ------------------------------------------------------------- */

  /* THE SAME VESSEL AS THE SICKLE LESSON'S LAST BEAT, which is the point: a
     reader who saw cells jam there sees them pass here. Every number is read
     from crispr/data/exa-cel.json. */
  const step5 = {
    eyebrow: 'The therapy',
    title: 'Cells that cannot sickle',
    onExit: leave,
    onEnter(ctx) {
      ctx.toggle(false);
      ctx.split(true, { left: 'Untreated', right: 'After the edit' });
      const S = ctx.use({ show: ['flowS', 'flowT'] });
      S.flowS.reset(); S.flowT.reset();
      ctx.caption('Loading the trial numbers…');
      ctx.data(DATA).then(d => {
        const pc = x => Math.round(x * 100) + '%';
        ctx.caption(`Stem cells are taken out, edited, and put back. Their red cells carry
          about ${pc(d.trial.hbfMean)} fetal hemoglobin from ${d.trial.hbfFrom}, in roughly
          ${pc(d.trial.cellsWithHbF)} of cells, and they do not sickle.`);
        ctx.after(9, () => ctx.caption(`In the trial this was approved on, ${pc(d.trial.vocFree12mo)}
          of ${d.trial.treated} patients went a year or more with no pain crisis.
          ${d.caveat}`));
      });
    },
  };

  global.CrisprSteps = { steps: [step1, step2, step3, step4, step5],
                         HBS, HBF, SWITCH, STATES, DATA };
})(typeof globalThis !== 'undefined' ? globalThis : this);
