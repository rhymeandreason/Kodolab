/* =============================================================================
 *  enzyme/enzyme-steps.js: the enzyme lesson, as steps for the shell
 * =============================================================================
 *  Content only: what each step says and the controls it puts in the panel.
 *  The scene is enzyme/enzyme.js; enzyme-lab.html hands every step `ctx.enz`
 *  and calls `enz.show(step.key, step)` before onEnter, so a step here only
 *  builds its controls and wires them to the scene.
 *  Exposes window.EnzymeSteps.
 * ========================================================================== */
(function (global) {
  'use strict';

  const AA_NAMES = ['Hydrophobic', 'Polar', 'Positive charge', 'Negative charge'];

  const segmented = (name, opts, val) =>
    `<div class="segmented" data-seg="${name}">${opts.map(([v, l, c]) =>
      `<button type="button" data-v="${v}" class="${v === val ? 'is-on' : ''}">${c ? `<i class="enz-dot" style="--c:${c}"></i>` : ''}${l}</button>`).join('')}</div>`;
  function bindSegmented(ctx, name, fn) {
    const el = ctx.q(`[data-seg="${name}"]`);
    el.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      el.querySelectorAll('button').forEach(x => x.classList.toggle('is-on', x === b));
      fn(b.dataset.v);
    });
  }
  function bump(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  /* A counter the scene ticks, written only while its step is up. */
  function counter(ctx, ev, sel, read) {
    const off = ctx.enz.on(ev, () => { const el = ctx.q(sel); if (el) { el.textContent = read(); bump(el); } });
    ctx.offs.push(off);
  }

  /* The stage scrubber (kit/lesson-stage.js) on the scene's timeline for this
     step, repainted every frame so it follows playback. */
  function scrubber(ctx) {
    const paint = () => {
      const tl = ctx.enz.timeline();
      if (!tl) return;
      ctx.scrub({
        max: tl.max, value: tl.t, step: 0.01, label: tl.label, playing: tl.playing,
        onScrub: v => ctx.enz.seek(v), onPlay: () => ctx.enz.togglePlay(),
      });
    };
    ctx.offs.push(ctx.enz.on('frame', paint));
    paint();
  }

  /* An activity curve over a slider's range, its marker at the current value. */
  function chart(el, x0, x1) {
    el.innerHTML = `
      <svg viewBox="0 0 300 64" preserveAspectRatio="none">
        <path class="area"/><path class="line" vector-effect="non-scaling-stroke"/>
      </svg><span class="vline"></span><span class="mk"></span>`;
    const area = el.querySelector('.area'), line = el.querySelector('.line'),
      mk = el.querySelector('.mk'), vl = el.querySelector('.vline');
    const Y = y => 60 - y * 54;
    return (fn, x) => {
      let d = '';
      for (let i = 0; i <= 100; i++) d += (i ? 'L' : 'M') + i * 3 + ',' + Y(fn(x0 + (x1 - x0) * i / 100)).toFixed(2);
      line.setAttribute('d', d);
      area.setAttribute('d', d + 'L300,64L0,64Z');
      mk.style.left = vl.style.left = ((x - x0) / (x1 - x0)) * 100 + '%';
      mk.style.top = (Y(fn(x)) / 64) * 100 + '%';
    };
  }

  const steps = [
    {
      key: 'fold', eyebrow: 'Structure', title: 'An enzyme is a folded protein',
      body: ctx => `
        <p class="lead">Every enzyme starts as a chain of amino acids.</p>
        <p>The chain folds on its own. Hydrophobic side chains pack into the core, away from water, and the charged and polar ones stay on the surface. The shape that results is what lets the enzyme work.</p>
        <p class="callout">Real enzymes run to hundreds of amino acids. This one is cut down to ${ctx.enz.chainLength}.</p>`,
      camera: { pos: [0, 1.6, 15.5], target: [0, 0, 0] },
      cameraAfter: { pos: [1.6, 2.1, 11.6], target: [0, 0, 0] },
      onEnter(ctx) {
        ctx.controls(`
          <div class="enz-key">${ctx.enz.aaTypes.map((t, i) => `<span><i style="--c:${t.color}"></i>${AA_NAMES[i]}</span>`).join('')}</div>`);
        scrubber(ctx);
      },
    },
    {
      key: 'site', eyebrow: 'Shape', title: 'The active site',
      body: `
        <p>Folding leaves a small pocket on the surface, the <strong>active site</strong>. Its shape and the chemical groups lining it fit one molecule, the <strong>substrate</strong>.</p>
        <p>That fit is why an enzyme speeds up one reaction and not others. What would happen to the fit if the pocket changed shape?</p>
        <p class="callout">Enzyme names usually end in -ase: lactase breaks down lactose, amylase breaks down starch.</p>`,
      camera: { pos: [7.6, 4.8, 8.2], target: [0, 0.1, 0] },
    },
    {
      key: 'binding', eyebrow: 'Binding', title: 'Induced fit',
      body: `
        <p>Molecules tumble at random until a substrate hits the active site the right way round. The enzyme then shifts shape and closes around it.</p>
        <p>This is <strong>induced fit</strong>, a refinement of the older, rigid lock-and-key picture. Switch models and watch the lips of the pocket.</p>`,
      camera: { pos: [6.0, 4.6, 8.6], target: [0, 0.3, 0] },
      onEnter(ctx) {
        ctx.controls(`
          ${segmented('model', [['induced', 'Induced fit'], ['lock', 'Lock and key']], ctx.enz.params.model)}`);
        bindSegmented(ctx, 'model', v => ctx.enz.setModel(v));
        scrubber(ctx);
      },
    },
    {
      key: 'catalysis', eyebrow: 'Catalysis', title: 'Break, release, repeat',
      body: `
        <p>Held in the pocket, the substrate's bond is strained and its atoms lined up, so it breaks far faster than it would alone.</p>
        <p>The <strong>products</strong> drift off and the enzyme relaxes, unchanged and ready for the next one. A catalyst is never used up.</p>
        <p class="callout">Catalase, which breaks down hydrogen peroxide, turns over millions of molecules every second.</p>`,
      camera: { pos: [3.2, 3.4, 11.2], target: [0, 0.3, 0] },
      onEnter(ctx) {
        const s = ctx.enz.params.speed;
        ctx.controls(`
          <div class="stats"><div class="stat accent"><span class="stat-label">Reactions catalysed</span><span class="stat-value" id="turnovers">${ctx.enz.turnovers()}</span><span class="stat-sub">by this one enzyme</span></div></div>
          <div class="slider">
            <div class="slider-head"><span class="label">Playback speed</span><span class="value" id="speedVal"></span></div>
            <input type="range" id="speed" min="0.25" max="3" step="0.05" value="${s}">
          </div>`);
        counter(ctx, 'turnover', '#turnovers', ctx.enz.turnovers);
        ctx.range(ctx.q('#speed'), v => { ctx.enz.setSpeed(v); ctx.q('#speedVal').textContent = v.toFixed(2) + '×'; });
      },
    },
    {
      key: 'energy', eyebrow: 'Energy', title: 'A lower hill',
      body: `
        <p>To react, molecules first have to climb an energy hill, the <strong>activation energy</strong> (E<sub>a</sub>).</p>
        <p>An enzyme adds no energy. It offers a route with a lower hill, so far more molecules get over in the same time. Where the reaction starts and ends does not change.</p>`,
      camera: { pos: [4.6, 4.0, 16.8], target: [0, 0.3, 0] },
      onEnter(ctx) {
        const c = ctx.enz.crossed();
        ctx.controls(`
          <div class="stats">
            <div class="stat accent"><span class="stat-label">With the enzyme</span><span class="stat-value" id="crossCat">${c.cat}</span><span class="stat-sub">made it over</span></div>
            <div class="stat"><span class="stat-label">Without it</span><span class="stat-value" id="crossUn">${c.un}</span><span class="stat-sub">made it over</span></div>
          </div>`);
        counter(ctx, 'cross', '#crossCat', () => ctx.enz.crossed().cat);
      },
    },
    {
      key: 'conditions', eyebrow: 'Conditions', title: 'Temperature and pH',
      body: ctx => `
        <p>Warmer molecules move and collide faster, so activity climbs, up to an <strong>optimum</strong>. Past it, vibration breaks the weak bonds that hold the fold: the enzyme <strong>denatures</strong>, the active site loses its shape, and the substrate no longer fits.</p>
        <p>A pH far from the optimum breaks the same bonds.</p>
        <p class="callout">Most human enzymes work best near body temperature, and pepsin, in the stomach, prefers pH 2. This one peaks at ${Math.round(ctx.enz.T_OPT)} °C and pH ${ctx.enz.PH_OPT}.</p>`,
      camera: { pos: [-1.8, 2.8, 10.8], target: [0, 0.3, 0] },
      onEnter(ctx) {
        const { enz } = ctx, p = enz.params;
        ctx.controls(`
          <div class="enz-meter">
            <div class="slider-head"><span class="label">Enzyme activity</span><span class="value" id="actVal"></span></div>
            <div class="enz-bar"><i id="actBar"></i></div>
            <div class="enz-status" id="status"></div>
          </div>
          <div class="slider">
            <div class="slider-head"><span class="label">Temperature</span><span class="value" id="tVal"></span></div>
            <div class="enz-chart" id="tChart"></div>
            <input type="range" id="tIn" min="0" max="80" step="1" value="${p.T}">
          </div>
          <div class="slider">
            <div class="slider-head"><span class="label">pH</span><span class="value" id="pVal"></span></div>
            <div class="enz-chart" id="pChart"></div>
            <input type="range" id="pIn" min="1" max="13" step="0.1" value="${p.pH}">
          </div>`);
        const tc = chart(ctx.q('#tChart'), 0, 80), pc = chart(ctx.q('#pChart'), 1, 13);
        let T = p.T, pH = p.pH;
        const refresh = () => {
          const { a, dn } = enz.setConditions(T, pH);
          tc(t => enz.tempF(t) * enz.phF(pH), T);
          pc(x => enz.tempF(T) * enz.phF(x), pH);
          ctx.q('#tVal').textContent = `${T} °C`;
          ctx.q('#pVal').textContent = pH.toFixed(1);
          ctx.q('#actVal').textContent = Math.round(a * 100) + '%';
          const state = dn > 0.45 ? 'bad' : a > 0.6 ? 'good' : 'mid';
          const bar = ctx.q('#actBar');
          bar.style.width = Math.max(2, a * 100) + '%';
          bar.dataset.state = state;
          const msg = dn > 0.45 ? 'Denatured: the active site has lost its shape'
            : a > 0.85 ? 'Near the optimum'
            : T < 30 && Math.abs(pH - enz.PH_OPT) < 1.5 ? 'Too cold: fewer, slower collisions'
            : 'Away from the optimum';
          ctx.q('#status').innerHTML = `<i data-state="${state}"></i>${msg}`;
        };
        ctx.range(ctx.q('#tIn'), v => { T = v; refresh(); });
        ctx.range(ctx.q('#pIn'), v => { pH = v; refresh(); });
      },
    },
    {
      key: 'inhibition', eyebrow: 'Control', title: 'Switching an enzyme off',
      body: `
        <p>Cells regulate enzymes with <strong>inhibitors</strong>. A competitive inhibitor resembles the substrate and sits in the active site.</p>
        <p>An allosteric inhibitor binds somewhere else, the allosteric site, and changes the active site's shape from a distance. Either way, the substrate cannot bind.</p>
        <p class="callout">Many drugs are enzyme inhibitors. Statins block an enzyme the liver uses to make cholesterol.</p>`,
      camera: { pos: [-4.8, 4.0, 9.4], target: [0, 0.3, 0] },
      onEnter(ctx) {
        const C = ctx.enz.colors;
        ctx.controls(`
          ${segmented('inh', [['none', 'None'], ['competitive', 'Competitive', C.comp], ['allosteric', 'Allosteric', C.alloInh]], ctx.enz.params.inhibit)}
          <div class="stats"><div class="stat"><span class="stat-label">Reactions catalysed</span><span class="stat-value" id="turnovers">${ctx.enz.turnovers()}</span></div></div>`);
        bindSegmented(ctx, 'inh', v => ctx.enz.setInhibitor(v));
        counter(ctx, 'turnover', '#turnovers', ctx.enz.turnovers);
      },
    },
  ];

  /* Subscriptions and the scrubber a step makes die with it. */
  for (const s of steps) s.onExit = ctx => { ctx.offs.forEach(f => f()); ctx.offs = []; ctx.scrub(null); };

  global.EnzymeSteps = { steps };
})(typeof globalThis !== 'undefined' ? globalThis : this);
