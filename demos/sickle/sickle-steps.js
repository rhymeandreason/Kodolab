/* =============================================================================
 *  sickle/sickle-steps.js — sickle cell, as steps for the shell
 * =============================================================================
 *  Content only: what each step says and what it asks the stage to do through
 *  ctx. sickle-lab.html wires it, and its header says what ctx carries.
 *
 *  EIGHT BEATS, ONE ARGUMENT: one base, one amino acid, one contact, one cell,
 *  one blocked vessel; then why an allele that does all that is common.
 *
 *      1  cell      BloodCell, whole — the toggle sickles it; the codon card
 *      2  protein   Proteinbox, skin — the two β6 spots, the toggle swaps HbA/HbS
 *      3  split     HbCrowd ×2 — opens on one molecule and widens into the
 *                   crowd; then the HbS side's attraction goes on and chains
 *                   assemble themselves
 *      4  split     BloodCell ×2, cut open — the same fibres, a scale up
 *      5  split     BloodFlow ×2 — discs slip through, crescents catch and jam
 *      6  malaria   BloodCell, infected — the puzzle, and the parasite, on a card
 *      7  split     BloodCell ×2, infected — the carrier's cell sickles and is
 *                   removed; the normal one feeds the parasite until it bursts
 *      8  split     Population ×2 — the same village with and without malaria,
 *                   sixty-odd generations; the allele holds only where malaria is
 *
 *  Beats 3 to 5 and 7 to 8 have no panel. Two halves, one caption, Next. The toggle that
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

  /* Carriers' odds of SEVERE malaria against people with two normal copies:
     0.09 (Taylor, Parobek & Fairhurst 2012, Lancet Infect Dis 12:457, a
     meta-analysis). Against any malaria at all it is far weaker, which is
     why the copy says severe. */
  const SEVERE_OR = 0.09;
  /* WHO World Malaria Report 2024, for 2023: cases and deaths worldwide, and
     the share of deaths that were children under five in the African Region. */
  const MALARIA = { cases: 263e6, deaths: 597e3, under5: 0.76, year: 2023 };
  /* Carriers reach about a quarter of people in the most affected parts of
     sub-Saharan Africa (Piel et al. 2010, Nat Commun 1:104). */
  const CARRIERS_MAX = 0.25;
  /* Beat 7's village. sickle/tools/check-population.js runs these exact
     numbers, so the run a student sees is one that makes the claim. */
  const POP = { n: 220, start: 0.05, seed: 5, gens: 80, slowFor: 4, fast: 4 };

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

  /* ---- 6 ------------------------------------------------------------- */

  /* THE PUZZLE BEFORE THE ANSWER. Five beats of harm, and then the fact that
     does not fit: the allele is common. The card says why that matters and
     names the parasite; the cell shows it at work, so beat 7's two cells
     open on something the reader has already seen once, slowly. */
  const WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'];
  const big = n => (n >= 1e6 ? `${Math.round(n / 1e6)} million` : n.toLocaleString('en-US'));
  const step6 = {
    eyebrow: 'A puzzle',
    title: 'Why is it common?',
    body: `Most children born with two sickle copies used to die young, so the allele
      should have faded away. Instead, in parts of Africa about one person in
      ${WORD[Math.round(1 / CARRIERS_MAX)]} carries it. Those are the places where malaria is.`,
    onExit(ctx) { leave(ctx); if (ctx.state.malaria) ctx.state.malaria.clearNotes(); },
    onEnter(ctx) {
      ctx.split(false);
      ctx.toggle(false);
      const { malaria } = ctx.use({ show: ['malaria'] });
      ctx.state.malaria = malaria;
      malaria.clearNotes();
      malaria.set({ parasite: 0, sickle: 0, spill: 0 }, { snap: true });
      malaria.set({ parasite: 0.72 }, { seconds: 16 });
      bind(ctx, malaria.on('stage', st => {
        if (st === 'ring') malaria.note('parasite');
        /* Below and left, clear of the parasite's own label. */
        if (st === 'trophozoite') malaria.note('hemozoin', { offset: [-70, 46] });
      }));
      ctx.ui.controls(`
        <div class="stats">
          <div class="stat accent"><span class="stat-label">Malaria deaths, ${MALARIA.year}</span>
            <span class="stat-value">${big(MALARIA.deaths)}</span>
            <span class="stat-sub">in Africa, ${Math.round(MALARIA.under5 * 100)}% were under five</span></div>
          <div class="stat"><span class="stat-label">Malaria cases, ${MALARIA.year}</span>
            <span class="stat-value">${big(MALARIA.cases)}</span>
            <span class="stat-sub">worldwide</span></div>
        </div>
        <p class="callout">Malaria is a single-celled parasite, <em>Plasmodium</em>, passed on by
          mosquito bites. It lives inside red blood cells: the cell this lesson is about.</p>
        <p class="hint-text">This cell is infected. Watch the parasite eat the hemoglobin.
          If a gene can change that cell, it can change who survives malaria.</p>`);
    },
  };

  /* ---- 7 ------------------------------------------------------------- */

  /* THE SAME PARASITE, THE SAME HOUR, TWO CELLS. The carrier's cell holds
     both hemoglobins and does not sickle on its own; the parasite is what
     tips it, by using up its oxygen (Luzzatto 1970). The left half pauses
     at the ring while the right one sickles, so there is one thing to watch
     at a time, and then carries on through the whole cycle. Its captions
     hang off the cell's own `stage` events, so they cannot run ahead of the
     picture. */
  const step7 = {
    title: 'One copy protects against malaria',
    onExit: leave,
    onEnter(ctx) {
      ctx.toggle(false);
      ctx.split(true, { left: `Normal · ${HBA.label} only`, right: `Carrier · ${HBA.label} and ${HBS.label}` });
      const S = ctx.use({ show: ['infA', 'infS'] });
      let live = true;
      const say = {
        trophozoite: () => ctx.caption(`In the normal cell the parasite keeps eating hemoglobin.
          The dark grains are the heme it cannot use, and the bumps on the membrane
          glue the cell to vessel walls.`),
        schizont: () => ctx.caption(`Now it divides into ${S.infA.state().merozoites} new parasites.`),
        bursting: () => {
          const s = S.infA.state();
          ctx.caption(`The cell bursts. Each of the ${s.merozoites} can invade a new cell,
            so the count multiplies every ${s.cycleHours} hours.`);
          ctx.after(4.5, () => ctx.caption(`Carriers still catch malaria, but they are about
            ${Math.round((1 - SEVERE_OR) * 10) * 10}% less likely to get the severe kind that kills.`));
        },
      };
      bind(ctx, S.infA.on('stage', st => { if (live && say[st]) say[st](); }));
      bind(ctx, () => { live = false; });
      const run = () => {
        ctx.clearTimers();
        live = false;
        for (const c of [S.infA, S.infS]) { c.set({ parasite: 0, sickle: 0, spill: 0 }, { snap: true }); c.start(); }
        live = true;
        ctx.fade('infA', true); ctx.fade('infS', true);
        ctx.caption(`A malaria parasite gets into a red cell on each side. The carrier's has
          one copy of each gene, so it holds both kinds of hemoglobin.`);
        S.infA.set({ parasite: 0.3 }, { seconds: 6 });
        S.infS.set({ parasite: 0.3 }, { seconds: 6 });
        ctx.after(6.6, () => {
          S.infS.set({ sickle: 1 }, { seconds: 2.6 });
          ctx.caption(`The parasite uses up the carrier cell's oxygen. Without it, the
            ${HBS.label} polymerizes and the cell sickles.`);
        });
        ctx.after(10.6, () => {
          ctx.fade('infS', false);
          ctx.caption(`The spleen destroys sickled cells. The parasite dies with this one,
            before it can multiply.`);
        });
        ctx.after(15, () => S.infA.set({ parasite: 0.95 }, { seconds: 12,
          onDone: () => S.infA.set({ parasite: 1 }, { seconds: 1.8 }) }));
      };
      ctx.replay(run);
      run();
    },
  };

  /* ---- 8 ------------------------------------------------------------- */

  /* A CHANGE OF RUNG, TO PEOPLE. Two villages that start as the same people
     (same seed), one with malaria. Slow for the first generations so the
     reader can see who falls and why, then fast enough to watch the allele
     settle. Every number printed is read off the sim's state. */
  const step8 = {
    title: 'Malaria keeps the allele common',
    onExit(ctx) { leave(ctx); ctx.legend(null); ctx.readout(null); },
    onEnter(ctx) {
      ctx.toggle(false);
      ctx.split(true, { left: 'No malaria', right: 'Malaria' });
      const S = ctx.use({ show: ['popA', 'popS'] });
      ctx.legend([
        { colour: 'A', text: `normal copy (${HBA.label})` },
        { colour: 'S', text: `sickle copy (${HBS.label})` },
        { colour: 'dead', text: 'died young' },
      ]);
      const show = () => {
        for (const [side, P] of [['left', S.popA], ['right', S.popS]]) {
          const s = P.state();
          ctx.readout(side, { value: s.q, values: s.history, mark: s.equilibrium || null,
            text: `${ctx.pct(s.q)} of copies are ${HBS.label} · generation ${s.generation + 1}` });
        }
      };
      bind(ctx, S.popS.on('generation', s => {
        show();
        if (s.generation === POP.slowFor) {
          S.popA.set({ speed: POP.fast }); S.popS.set({ speed: POP.fast });
          ctx.caption(`Each round is a generation: the survivors have the next one. Faster now.`);
        }
      }));
      bind(ctx, S.popA.on('generation', show));
      bind(ctx, S.popS.on('done', s => {
        show();
        ctx.caption(`With malaria, the sickle allele settles near ${ctx.pct(s.equilibrium)}, where the
          two kinds of early death balance. Without it, the allele only costs, and it drains away.`);
        ctx.after(6, () => ctx.caption(`That is why sickle cell is most common in families from
          where malaria was: sub-Saharan Africa, the Mediterranean, the Middle East and India.`));
      }));
      const run = () => {
        ctx.clearTimers();
        for (const P of [S.popA, S.popS]) { P.stop(); P.set({ speed: 1 }); P.reset(); }
        show();
        ctx.caption(`Each figure is a person, and its two halves are their two copies of the
          gene. Both villages start as the same people.`);
        ctx.after(5, () => {
          S.popA.start(); S.popS.start();
          ctx.caption(`Malaria kills some people with two normal copies. Sickle cell disease
            kills most with two sickle copies. Carriers lose to neither.`);
        });
      };
      ctx.replay(run);
      run();
    },
  };

  global.SickleSteps = { steps: [step1, step2, step3, step4, step5, step6, step7, step8],
                         HBB, AT, TO, HBA, HBS, SEVERE_OR, POP };
})(typeof globalThis !== 'undefined' ? globalThis : this);
