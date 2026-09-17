/* =============================================================================
 *  sickle/sickle-steps.js — sickle cell, as steps for the shell
 * =============================================================================
 *  Content only: what each step says and what it asks the stage to do through
 *  ctx. sickle-lab.html wires it, and its header says what ctx carries.
 *
 *  FIVE BEATS, ONE ARGUMENT: one base, one amino acid, one contact, one cell,
 *  one blocked vessel.
 *
 *      1  cell      BloodCell, whole — the toggle sickles it; the codon card
 *      2  protein   Proteinbox, skin — the two β6 spots, the toggle swaps HbA/HbS
 *      3  split     HbCrowd ×2 — opens on one molecule and widens into the
 *                   crowd; then the HbS side's attraction goes on and chains
 *                   assemble themselves
 *      4  split     BloodCell ×2, cut open — the same fibres, a scale up
 *      5  split     BloodFlow ×2 — discs slip through, crescents catch and jam
 *
 *  Beats 3 to 5 have no panel. Two halves, one caption, Next. The toggle that
 *  drives 1 and 2 sits at the bottom of the room, the same place on both, and
 *  carries one state (ctx.variant) across them.
 *
 *  THE COPY IS SHORT ON PURPOSE. Each beat makes one claim and the scene makes
 *  it; the words say what to look at. Nothing here prints a residue count, a
 *  distance or a rate — the components carry those in state() for a page that
 *  wants them, and this one does not.
 *
 *  Exposes window.SickleSteps.
 * ========================================================================== */
(function (global) {
  'use strict';

  /* HBB, the first eight codons of the coding strand. The initiator methionine
     is numbered 0 because it is cleaved off, so the β chain a student meets
     starts at Val 1 and the glutamate that matters is Glu 6 — which is what
     every clinical description of this mutation calls it. */
  const HBB = 'ATGGTGCACCTGACTCCTGAGGAG';
  const AT = 19, TO = 'T';                 // the substitution, in the fragment

  const HBA = {
    id: '2HHB', label: 'HbA',
    trace: 'proteins/hemoglobin/data/hb-2HHB.json',
    surface: 'hemoglobin/data/2HHB.lesson.surf.bin',
  };
  const HBS = {
    id: '2HBS', label: 'HbS',
    trace: 'proteins/hemoglobin/data/hb-2HBS.json',
    surface: 'hemoglobin/data/2HBS.lesson.surf.bin',
  };

  /* A STEP'S SUBSCRIPTIONS DIE WITH THE STEP. A readout left subscribed from
     the step before fires on the next step's first set(), looking for an
     element that is no longer in the panel. */
  const bind = (ctx, off) => { (ctx.state.off || (ctx.state.off = [])).push(off); };
  const leave = ctx => {
    (ctx.state.off || []).forEach(f => f());
    ctx.state.off = [];
    ctx.clearTimers();
    ctx.onToggle = null;
  };

  /* ---- 1 ------------------------------------------------------------- */

  const step1 = {
    eyebrow: 'One letter',
    title: 'A point mutation',
    body: `One base in the gene for the β chain of hemoglobin: an A becomes a T.
      That is the whole mutation.`,
    onExit: leave,
    onEnter(ctx) {
      ctx.split(false);
      ctx.toggle(true);
      const { cell } = ctx.use({ show: ['cell'], keep: ['protein'] });
      cell.set({ sickle: ctx.variant === 'HbS' ? 1 : 0 }, { snap: true });
      ctx.onToggle = v => cell.set({ sickle: v === 'HbS' ? 1 : 0 }, { seconds: 2.4 });

      /* The card: one codon, both states, the flow drawn downward. The verdict
         line is the module's and is left off — the claim of this beat is the
         size of the change, and the card shows it. */
      ctx.ui.controls(`
        <div id="codon"></div>
        <p class="hint-text">One base pair changes, so one amino acid changes.
          Flip the switch under the cell to see where that ends up.</p>`);
      ctx.ui.q('#codon').innerHTML = Codon.figure({
        dna: HBB, first: 0, at: AT, to: TO, view: 'card', verdict: false,
        title: 'normal', mutTitle: 'sickle', name: HBA.label, mutName: HBS.label,
      });
    },
  };

  /* ---- 2 ------------------------------------------------------------- */

  const step2 = {
    eyebrow: 'One amino acid',
    title: 'Glutamate becomes valine',
    body: `Same fold, same four chains. Only position 6 of each β chain is different.
      Glutamate carries a charge and sits happily in water. Valine is greasy, and on
      the outside of a protein it wants somewhere to hide.`,
    onExit(ctx) { leave(ctx); ctx.state.protein = null; },
    /* THE HANDOFF STARTS HERE. Beat 3 opens on one molecule as a bare skin,
       so this one ends as one: the ribbon goes under an opaque surface before
       the swap, and the reader crosses on a shape AND a colour that did not
       change — the crowd's own, read off the component rather than typed, so
       the two cannot drift apart. Only going forward; backing out of the beat
       should not perform anything. */
    onLeave(ctx, to) {
      if (to <= 1 || !ctx.state.protein) return 0;
      ctx.state.protein.box.setSkin(1, 0.85, { colour: HbCrowd.skinOf() });
      return 1.05;
    },
    onEnter(ctx) {
      ctx.split(false);
      ctx.toggle(true);
      const { protein } = ctx.use({ show: ['protein'], keep: ['cell'] });
      ctx.state.protein = protein;
      /* Back into this beat from the handoff: the skin is opaque and has to
         be a skin again. */
      protein.box.setSkin(null);
      protein.show(ctx.variant);
      ctx.onToggle = v => protein.show(v);
      ctx.ui.controls(`<p class="hint-text">Drag to turn it. Flip the switch:
        nothing moves except the two marked spots.</p>`);
    },
  };

  /* ---- 3 ------------------------------------------------------------- */

  /* THE ONLY BEAT WITH NO SCRIPT. hbcrowd.js simulates assembly rather than
     playing it, so nothing here knows when the first contact will hold or how
     long the chains will take — the captions hang off the component's own
     `nucleate` and `done`, and a timer would be a lie about what is on screen.
     Replay genuinely re-runs it, and the wait is a different wait. */
  const step3 = {
    title: 'The greasy spot sticks',
    onExit: leave,
    onEnter(ctx) {
      ctx.toggle(false);
      ctx.split(true, { left: `Normal · ${HBA.label}`, right: `Sickle · ${HBS.label}` });
      const S = ctx.use({ show: ['crowdA', 'crowdS'] });

      /* THE BEAT OPENS WHERE THE LAST ONE ENDED — one molecule, that size —
         and widens. The whole argument is arithmetic: one patch is nothing,
         and a cell full of them cannot get through a capillary. Cutting
         straight to a crowd asserts that; widening into one shows it. */
      const IN = 3.4;
      const run = () => {
        ctx.clearTimers();
        S.crowdA.reset(); S.crowdS.reset();
        S.crowdA.start(); S.crowdS.start();
        S.crowdA.intro(IN); S.crowdS.intro(IN);
        ctx.caption(`The same molecule, the same size. Nothing about it has changed.`);
        ctx.after(IN * 0.75, () => ctx.caption(`Now the crowd it was always in
          — ${S.crowdS.state().n} here, and a red cell holds millions.`));
        ctx.after(IN + 0.8, () => {
          S.crowdS.play();
          ctx.caption(`One greasy spot per molecule, and it pulls. Watch the sickle side.`);
        });
      };
      bind(ctx, S.crowdS.on('nucleate', () =>
        ctx.caption(`Pairs kept forming and falling apart. One has held long enough
          to grow, and now it only grows.`)));
      /* Chains, plural. One long strand would be the tidier picture and it is
         not what the simulation makes, or what a sickling cell makes. */
      bind(ctx, S.crowdS.on('done', () =>
        ctx.caption(`Most of the crowd is now in chains, every one of them the same
          contact repeated. Seven twist together into a fibre.`)));
      ctx.replay(run);
      run();
    },
  };

  /* ---- 4 ------------------------------------------------------------- */

  /* Its own beat, because it is a change of scale and not a caption: the
     molecules of beat 3 were inside this, and the cut is what makes the rods
     the reader just watched assemble visible as the thing bending the
     membrane. */
  const step4 = {
    title: 'The cell goes stiff',
    onExit: leave,
    onEnter(ctx) {
      ctx.toggle(false);
      ctx.split(true, { left: 'Normal cell', right: 'Sickle cell' });
      const S = ctx.use({ show: ['cellA', 'cellS'] });
      const run = () => {
        ctx.clearTimers();
        S.cellA.start(); S.cellS.start();
        ctx.fade('cellA', true); ctx.fade('cellS', true);
        ctx.caption(`Both cells, cut open. On the right the fibres run the length of
          it and push the membrane out into a crescent.`);
      };
      ctx.replay(run);
      run();
    },
  };

  /* ---- 5 ------------------------------------------------------------- */

  const step5 = {
    title: 'A stiff cell jams',
    onExit: leave,
    onEnter(ctx) {
      ctx.toggle(false);
      ctx.split(true, { left: 'Normal cells', right: 'Sickle cells' });
      const S = ctx.use({ show: ['flowA', 'flowS'] });
      const run = () => {
        ctx.clearTimers();
        S.flowA.reset(); S.flowS.reset();
        ctx.caption(`Round cells fold and slip through. Stiff cells catch, stick to
          each other, and block the vessel.`);
      };
      bind(ctx, S.flowS.on('blocked', () =>
        ctx.caption(`Blocked. Nothing behind it moves, and the tissue past it runs short of oxygen.`)));
      ctx.replay(run);
      run();
    },
  };

  global.SickleSteps = { steps: [step1, step2, step3, step4, step5], HBB, AT, TO, HBA, HBS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
