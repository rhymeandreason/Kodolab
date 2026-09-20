/* =====================================================================
 *  annotate.js — callouts pinned to a point on a 3D model.
 *
 *  A label with a leader dot that names part of a molecule: "Iron (Fe) —
 *  binds O2", "Heme group". The callout every textbook figure has.
 *
 *  WHAT THIS OWNS AND WHAT IT DOES NOT (SCIENCE.md 6). It owns how a
 *  callout LOOKS and how it TRACKS: the dot, the leader, the type, the
 *  three reveal modes, the projection maths. It owns nothing about what a
 *  callout says or where it points — that is the lesson, and it stays in
 *  the page. The test the section sets is "would two lessons disagree
 *  about it?", and the answer here splits cleanly: a student must not have
 *  to learn a second annotation vocabulary on the second tab, and no two
 *  pages will ever want to label the same atom.
 *
 *  ---- ANCHORS ARE SEMANTIC, WHICH IS THE WHOLE POINT ------------------
 *
 *  `at` may be a fixed point, but it is meant to be a FUNCTION returning
 *  one, and every moving model should pass a function. The label then
 *  follows whatever the page recomputes each frame — a folding chain, a
 *  sliding subunit, a heme riding its chain in — because the anchor is
 *  "wherever atom N is now" rather than a position captured at build time.
 *
 *  An anchor may also declare which way its part FACES, and a note on a part
 *  turned away from the camera fades out: a callout on the underside of a leaf,
 *  read from above, points at a surface the student is looking at the back of.
 *  `facing` is a direction in the MODEL's own space and is transformed each
 *  frame, for the same reason the point is — the model turns.
 *
 *  NEVER capture the point at build time. Baking an anchor — a coordinate,
 *  or a spot on the mesh — is what a viewer has to do when it is handed an
 *  opaque asset, and it is wrong here: every model on this site is built
 *  from named atoms that move, so a baked point comes adrift the moment
 *  the thing it names does anything.
 *
 *  ---- DOM, NOT SPRITES ------------------------------------------------
 *
 *  The labels are absolutely-positioned HTML over the canvas, not textures
 *  in the scene. A canvas sprite bakes whatever font is loaded at draw
 *  time — atomkit.js carries a whole comment about redrawing once the
 *  webfonts settle — and it resamples badly as the camera pulls in. DOM
 *  gets the house type from the page's stylesheet for free, stays crisp at every
 *  zoom, and can be read by a screen reader. The cost is that the layer
 *  cannot be occluded by geometry, which is not a cost: a label
 *  half-swallowed by the atom it names reads as a rendering fault. These
 *  are annotation OVER the scene, deliberately.
 *
 *  Labels are still depth-SORTED against each other by z-index, so two
 *  callouts that overlap stack the way the model does.
 *
 *  ---- THE THREE TRAPS -------------------------------------------------
 *
 *  1. step() BELONGS IN THE RENDER LOOP, not in whatever advances your
 *     animation. Orbiting and zooming move the camera without advancing
 *     anything, and a label that only updates when the model does shears
 *     off its atom the moment the user drags. Same rule as
 *     hemoglobin-lab's pearls, for the same reason.
 *
 *  2. THE LAYER MUST NOT EAT THE MOUSE. It covers the whole stage, so it
 *     is pointer-events:none, and only the dots turn pointer events back
 *     on — and only in 'click' mode. Get this wrong and orbit dies with no
 *     visible cause, because the thing swallowing the drag is invisible.
 *
 *  3. PROJECT IN CSS PIXELS. camera.project gives normalised coordinates;
 *     turning those into a position means the element's CSS box
 *     (clientWidth/Height), never canvas.width/height, which on a retina
 *     screen is twice that and puts every label off the bottom right.
 *
 *  ---- REVEAL MODES ----------------------------------------------------
 *
 *    'on'      every label visible. The figure-caption mode.
 *    'click'   dots only; clicking one opens its label, clicking again
 *              closes it. For a crowded model where all-on is soup.
 *    'reveal'  play() runs them in as a staggered wipe, left to right
 *              across the screen, each one rising into place. For a page
 *              that wants the naming to be an EVENT — the same sweep
 *              hemoglobin-lab uses for its residue pearls, so the two read
 *              as the same gesture.
 *
 *  The mode is a property of the layer and can be changed at any time.
 *  'reveal' finishes in the 'on' state: the wipe is how the labels ARRIVE,
 *  not a state they stay in.
 *
 *  ---- POINTING AT CHROME, NOT AT THE MODEL ----------------------------
 *
 *  `atPx` is the escape hatch: a function returning [x, y] in CSS pixels
 *  within the stage, used INSTEAD of `at`. It exists for the one honest
 *  case — naming a CONTROL, a button or a toggle that is part of what the
 *  student is being taught rather than part of the model. membrane-lab's
 *  pump step points at its own Spend 1 ATP button, because "one ATP buys
 *  one turn" is a fact about the transaction the button performs.
 *
 *  Use it for nothing else. A callout on a fixed screen position is a
 *  caption with a leader line drawn on it, and it comes adrift from the
 *  chemistry the moment the camera moves — which is the exact failure the
 *  semantic-anchor rule above exists to prevent. If the thing you are
 *  naming is IN the scene, it has an atom, and the atom is the anchor.
 *
 *  A pixel-anchored note is never depth-sorted (there is no depth) and is
 *  never culled for being behind the camera; it sorts as nearest, since a
 *  control is in front of the scene by definition.
 *
 *  ---- MEASURING BRACKETS ----------------------------------------------
 *
 *  `span()` draws a DIMENSION LINE between two anchors — end ticks, a rule
 *  across, and the measurement on it — for the question a label cannot
 *  answer: how far apart. Both ends are anchors under the same contract as
 *  `at`, so a bracket on a turning model stays across the gap it measures,
 *  and `text` may be a function, which is where the number should come
 *  from: measured off those same two points rather than typed.
 *
 *    notes.span({ from:() => pA(), to:() => pB(),
 *                 text:() => pA().distanceTo(pB()).toFixed(1) + ' Å' });
 *
 *  `axis:'y'` (or `'x'`) is what makes it read as a DRAWING rather than as a
 *  chord: the rule stands off to one side — `side` and `gap` say which and
 *  how far — with extension lines back to the anchors, and it measures only
 *  the height (or the width) between them. A groove, a pitch, a diameter are
 *  drawn that way in every textbook figure, and the diagonal between two
 *  atoms instead reads as a line THROUGH the molecule. `side:'auto'` is the
 *  side of the stage the bracket is on, re-read every frame, because a rule
 *  that stays put while the model turns ends up drawn across it.
 *
 *  `text` may name what is being measured as well as state it, and often
 *  should: a chip reading "Minor groove · 5.4 Å" keeps the number attached
 *  to the thing rather than to the length of the bracket, which is what a
 *  bare number on a rule that spans something else quietly claims.
 *
 *  It takes `facing` too, for a gap that turns to the back of the model.
 *  Brackets draw UNDER the labels, in one SVG per layer.
 *
 *  ---- CARDS -----------------------------------------------------------
 *
 *  A note may carry `card`: HTML for a short popover that opens when the
 *  student clicks the label (or its dot). The label says WHAT, the card
 *  says WHY, and the split is the point — a stage crowded with sentences
 *  is a stage nobody reads, and a stage of bare dots teaches nothing to
 *  the student who never clicks. Short label, always visible; one click
 *  for the reason.
 *
 *    notes.add({ text:'Na+ keeps its shell', card:'Two sentences. No more.',
 *                at:() => ..., offset:[30,-22] });
 *
 *  Keep a card to TWO SENTENCES. It is a margin note, not a paragraph, and
 *  the box is sized so a third one has to be scrolled to.
 *
 *  One card is open at a time, per layer. It closes on a second click, on
 *  Escape, on a click anywhere else, and on setMode/clear — because all of
 *  those mean the subject just changed.
 *
 *  How they LEAVE is show(false) or fade(x), and those are different
 *  things on purpose. show() is the switch a student flicks: these do not
 *  apply here. fade() is the dimmer a page drives: these are on their way
 *  out because the subject is changing. They multiply, and either reaching
 *  zero drops the layer out of the document — which is also what stops a
 *  faded-out callout catching clicks in 'click' mode. There is deliberately
 *  no staggered EXIT to match the wipe: arriving is an event worth making,
 *  leaving is the page moving on, and animating both makes the second one
 *  look like the first.
 *
 *  ---- USE -------------------------------------------------------------
 *
 *    const notes = Annot.create(THREE, document.getElementById('stage'),
 *                               camera, { mode:'on' });
 *    notes.add({ text:'Iron (Fe)', at:() => hemeFe(), tone:'iron' });
 *    ...
 *    notes.step();                    // in the render loop, before render
 *
 *  Load after scene.js; no dependency on MolLib, and it never sees SCALE —
 *  it is given world points and asks nothing about what they mean.
 * ===================================================================== */
'use strict';

window.Annot = (function () {

  const MODES = ['on', 'click', 'reveal'];

  /* The wipe. Matched to hemoglobin-lab's pearl reveal, because a page
     showing both should not look like it has two different ideas of how
     things arrive. */
  const SWEEP = 0.55;      // seconds for the stagger to cross the screen
  const RISE  = 0.34;      // seconds one label takes to come in
  const LIFT  = 14;        // px it travels up on the way

  function create(THREE, stageEl, camera, opts) {
    opts = opts || {};
    const layer = document.createElement('div');
    layer.className = 'annot-layer';
    /* Trap 2. The layer is the size of the stage; if it took pointer
       events the user could never orbit again. */
    layer.style.pointerEvents = 'none';
    stageEl.appendChild(layer);

    const notes = [];
    const _v = new THREE.Vector3();
    const _p0 = new THREE.Vector3(), _vd = new THREE.Vector3();
    /* Half the fade, in cosine. Edge-on is the MIDDLE of it, so a note is
       already half gone by the time its part passes 90 degrees rather than
       popping off there. About 15 degrees either side. */
    const FACE_BAND = 0.26;
    const clamp01 = t => (t < 0 ? 0 : t > 1 ? 1 : t);

    /* ---- the card ----
       A label names the thing; a card answers "why". ONE card per layer,
       never one per note: two open cards are two answers to a question the
       student asked once, and the second is always the one they did not
       ask. Opening a card closes whichever was open.

       It is the ONE child of the layer that takes the mouse — it has a
       close button and text worth selecting. Trap 2 still holds: the layer
       itself never does, so orbit survives.

       Built lazily. A page that never passes `card` never pays for it, and
       the two lessons already using this module get an unchanged DOM. */
    let card = null, cardNote = null;

    function ensureCard() {
      if (card) return card;
      card = document.createElement('div');
      card.className = 'annot-card';
      card.setAttribute('role', 'dialog');
      card.style.pointerEvents = 'auto';
      const x = document.createElement('button');
      x.type = 'button'; x.className = 'annot-card-x';
      x.setAttribute('aria-label', 'Close');
      x.textContent = '\u00d7';
      x.addEventListener('click', e => { e.stopPropagation(); closeCard(); });
      const h = document.createElement('h4'); h.className = 'annot-card-t';
      const b = document.createElement('p');  b.className = 'annot-card-b';
      card.appendChild(x); card.appendChild(h); card.appendChild(b);
      card._t = h; card._b = b;
      layer.appendChild(card);
      return card;
    }

    function openCard(note) {
      if (cardNote === note) { closeCard(); return; }   // the label is a toggle
      const c = ensureCard();
      c._t.textContent = note.cardTitle || '';
      c._t.style.display = note.cardTitle ? '' : 'none';
      c._b.innerHTML = note.card;
      cardNote = note;
      c.classList.add('is-open');
      /* `is-carded` is the note whose card is open NOW; `is-seen` is the note
         that has ever been opened, and it never comes off. A page that draws
         attention to an unread callout needs to know when to stop. */
      note.el.classList.add('is-seen');
      for (const n of notes) carded(n, n === note);
      step();                       // place it now, not on the next frame
      return api;
    }

    /* The card covers its label, so the label goes: it showed through the card's
       own translucency, border and all. Its BOX stays (the card is placed from
       it), so this is opacity in the stylesheet — and pointer-events here,
       because a carded label carries an inline `auto` no rule can outrank. */
    function carded(n, on) {
      n.el.classList.toggle('is-carded', on);
      if (n.card) n.label.style.pointerEvents = on ? 'none' : 'auto';
    }

    function closeCard() {
      cardNote = null;
      if (card) card.classList.remove('is-open');
      for (const n of notes) carded(n, false);
      return api;
    }

    /* Click-away and Escape. The pointerdown fires BEFORE the label's own
       click, so a click on the open note's own label falls through to the
       toggle rather than being closed here and reopened there. */
    document.addEventListener('pointerdown', e => {
      if (!cardNote) return;
      if (card && card.contains(e.target)) return;
      if (cardNote.el.contains(e.target)) return;
      closeCard();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && cardNote) closeCard();
    });
    let mode = 'on';
    let visible = opts.visible !== false;
    let alpha = opts.alpha === undefined ? 1 : opts.alpha;
    let revealT0 = -1;

    /* ---- the fan ----
       THE DOT IS THE TRUTH AND THE LABEL IS THE TYPESETTING. A dot sits
       exactly on its anchor and never moves; the label is pushed off by a
       fixed screen-space offset and joined back by a drawn leader. This is
       not decoration, it is the only way two callouts on one 10 A group
       are readable at all — anchored strictly, a label on the iron and one
       on the ring holding it land within forty pixels of each other and
       the top one hides the other.

       `offset` is [dx, dy] in CSS pixels from the dot. dx<0 puts the label
       on the left and flips the leader with it. The leader's length and
       angle are solved from the offset ONCE, here, because the offset is
       screen-space and constant — recomputing it per frame would burn a
       trig call per label to arrive at the same number. */
    const SIDE_GAP = 18;         // px from the dot to the label's near edge
    /* How far past the middle of the stage a bracket has to be before it
       changes sides. Without it one sitting near the middle flips on alternate
       frames all the way through a turn. */
    const AUTO_HYST = 26;

    function pickSide(prev, x, w) {
      if (x > w / 2 + AUTO_HYST) return 1;
      if (x < w / 2 - AUTO_HYST) return -1;
      return prev || (x > w / 2 ? 1 : -1);
    }

    /* The leader's length and angle are solved from the offset HERE and not per
       frame: it is screen-space, so the trig would return the same number every
       time. A page that has to move a label — one whose stage has an obstacle on
       one side, say a readout column — calls note.setOffset and pays for the
       trig on that change alone. */
    /* ---- the keep-out ----
       A stage is rarely all free: the lesson shell parks a panel down one
       side, and a label whose dot sits behind it typesets straight under the
       glass. Which side is read from the rect, not assumed: respiration-lab
       puts its panel on the right, and a left-only rule flipped every label
       into it. The panel's rect comes from `opts.keepOut` or, failing that,
       from the stage element itself — kit/lesson-shell.js hangs `keepOut` on
       its stage the same way it hangs `viewOffset`, so a component gets this
       without being handed anything. A note whose LABEL would land over the
       region flips it to the free side; the DOT DOES NOT MOVE, because the
       dot is the anchor and only the typesetting changes.

       It is the label's box that has to clear, not the dot: a dot well clear
       of the panel still hangs its label back across it, which is what
       shipped looking fixed. So the width is measured — cached per note, and
       re-read only when the text or the side changes, because offsetWidth in
       the frame loop is a forced reflow per label per frame. */
    const keepOutFn = opts.keepOut || stageEl.keepOut || null;
    function keepOut() {
      if (!keepOutFn) return null;
      const r = keepOutFn();
      if (!r) return null;
      const lr = layer.getBoundingClientRect();
      const left = r.left - lr.left, right = r.right - lr.left;
      return { left, right, side: left >= lr.width / 2 ? 'right' : 'left' };
    }

    function applyOffset(el, off) {
      const dx = (off[0] || 0) + (off[0] < 0 ? -SIDE_GAP : SIDE_GAP);
      const dy = off[1] || 0;
      el.classList.toggle('annot-left', dx < 0);
      el.style.setProperty('--adx', dx + 'px');
      el.style.setProperty('--ady', dy + 'px');
      el.style.setProperty('--alen', Math.hypot(dx, dy).toFixed(1) + 'px');
      el.style.setProperty('--aang', (Math.atan2(dy, dx) * 180 / Math.PI).toFixed(2) + 'deg');
    }

    function add(spec) {
      const el = document.createElement('div');
      el.className = 'annot' + (spec.tone ? ' annot-' + spec.tone : '');
      /* The name the caller asked for, on the element. A label is drawn from
         the component's own library, so it is not text anyone can edit in
         place; naming it is what lets a student point at it and ask. */
      if (spec.key) el.dataset.note = spec.key;

      const off = spec.offset || [0, 0];
      applyOffset(el, off);

      const dot = document.createElement('button');
      dot.className = 'annot-dot';
      dot.type = 'button';
      dot.setAttribute('aria-label', spec.text);

      const leader = document.createElement('span');
      leader.className = 'annot-leader';

      const label = document.createElement('span');
      label.className = 'annot-label';
      label.textContent = spec.text;

      el.appendChild(leader); el.appendChild(dot); el.appendChild(label);
      layer.appendChild(el);

      const note = {
        el, dot, label,
        at: spec.at,
        atPx: spec.atPx,
        /* Which way the part faces: a function returning a WORLD vector, the
           same rule as `at` and for the same reason — the model turns, so a
           baked normal comes adrift the moment it does. */
        facing: spec.facing || null,
        offset: off,
        flipped: false,               // pushed off the keep-out this frame
        _lw: null,                    // label width, measured once (see keepOut)
        card: null, cardTitle: '',
        _sx: 0, _sy: 0,
        openCard() { return openCard(note); },
        open: spec.open !== false,     // 'click' mode starts them closed below
        delay: 0,
        set(text) { label.textContent = text; dot.setAttribute('aria-label', text); note._lw = null; return note; },
        // Move the label to the other side of its dot (dx<0 is left). The dot
        // does not move: it is the anchor, and only the typesetting changes.
        setOffset(o) { note.offset = o; applyOffset(el, o); return note; },
        remove() {
          const i = notes.indexOf(note);
          if (i >= 0) notes.splice(i, 1);
          if (cardNote === note) closeCard();
          el.remove();
        },
      };

      dot.addEventListener('click', e => {
        e.stopPropagation();
        /* In 'click' mode the dot's job is the label. Everywhere else, a
           note that HAS a card uses the dot for the card — otherwise the
           dot is inert in the very mode the card ships in. */
        if (mode !== 'click') { if (note.card) openCard(note); return; }
        note.open = !note.open;
        el.classList.toggle('is-open', note.open);
      });

      /* THE LABEL IS THE TARGET, not the dot. The dot is ten pixels and it
         sits on the molecule the student is trying to see; the label is the
         thing that reads as "there is more here". The dot still works. */
      if (spec.card) {
        el.classList.add('annot-has-card');
        note.card = spec.card;
        note.cardTitle = spec.cardTitle === undefined ? spec.text : spec.cardTitle;
        label.setAttribute('role', 'button');
        label.tabIndex = 0;
        label.style.pointerEvents = 'auto';
        label.addEventListener('click', e => { e.stopPropagation(); openCard(note); });
        label.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCard(note); }
        });
      }

      notes.push(note);
      applyMode();
      return note;
    }

    /* ---- measuring brackets ----------------------------------------
       A DIMENSION LINE between two points on the model: end ticks, the rule
       between them, and the measurement sitting on it. It answers the one
       question a label cannot — "how far apart" — and it is the drawing every
       textbook figure uses for a width, so it needs no explaining.

       IT IS NOT A CALLOUT WITH TWO ENDS. A callout names a thing and hangs off
       it; a bracket IS the measurement, drawn where the gap is, and its text is
       a number. Pages that tried this with two notes and a caption drew three
       objects for one fact and left the reader to pair them up.

       THE ENDS ARE ANCHORS, same contract as `at`: functions returning world
       points, re-read every frame, so a bracket on a turning model stays across
       the gap it measures. `text` may be a function, and should be wherever the
       number is measured off those same two points — a typed number is a claim
       nothing checks.

       ONE SVG for all the brackets in a layer, under the labels: geometry the
       browser can draw crisply at any zoom, which a rotated div cannot. */
    const spans = [];
    let svg = null;
    const SPAN_TICK = 7;               // px, half the end tick

    function ensureSvg() {
      if (svg) return svg;
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'annot-spans');
      // FIRST child: the brackets draw UNDER every label, so a label's chip
      // masks the rule where it crosses it rather than being cut by it.
      layer.insertBefore(svg, layer.firstChild);
      return svg;
    }

    function span(spec) {
      const g = ensureSvg();
      // TWO PATHS: the dimension line, and the extension lines that carry it
      // out to the side. They are drawn differently (the extensions are the
      // fainter of the two, as they are on any drawing) and one path cannot
      // hold two strokes.
      const ext = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      ext.setAttribute('class', 'annot-span-ext');
      g.appendChild(ext);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('class', 'annot-span-line');
      g.appendChild(path);

      const label = document.createElement('span');
      label.className = 'annot-span-label';
      layer.appendChild(label);

      const sp = {
        path, ext, label,
        from: spec.from, to: spec.to, text: spec.text, facing: spec.facing,
        /* AXIS is what makes it read as a drawing rather than as a chord. A
           bracket with no axis runs straight between the two points, which is
           right for a bond length and wrong for anything measured ALONG a
           molecule: a groove, a pitch, a diameter are all drawn as a rule
           standing off to one side, and a diagonal across the model reads as a
           line THROUGH it. 'y' stands the rule up beside the model and measures
           the height between the anchors; 'x' lays it under them. */
        axis: spec.axis || null,
        /* 'auto' is the side of the stage the bracket is on, re-read every
           frame: the model turns, and a rule that stays on the left while what
           it measures crosses to the right is drawn through the molecule. */
        side: spec.side || 'right',
        _side: null,
        gap: spec.gap == null ? 28 : spec.gap,
        _a: new THREE.Vector3(), _b: new THREE.Vector3(), _m: new THREE.Vector3(),
        _t: null,
        _px: null,
        /* WHERE THE CHIP IS, in the layer's pixels. A note can anchor to this
           with `atPx` and point at the measurement instead of at a bead of its
           own — one marker for one place. Null until the first step(), and null
           whenever the bracket is hidden. */
        midPx() { return sp._px; },
        remove() {
          path.remove(); ext.remove(); label.remove();
          const i = spans.indexOf(sp); if (i >= 0) spans.splice(i, 1);
          return api;
        },
      };
      spans.push(sp);
      return sp;
    }

    function hideSpan(s) {
      s._px = null;
      s.path.style.display = 'none';
      s.ext.style.display = 'none';
      s.label.style.display = 'none';
    }

    /* Place every bracket. Called from step(), which already has the stage's
       CSS box — Trap 3 applies here exactly as it does to a label. */
    function stepSpans(w, h) {
      for (const s of spans) {
        const a = anchor(s.from); if (a) s._a.copy(a);
        const b = anchor(s.to);   if (b) s._b.copy(b);
        if (!a || !b) { hideSpan(s); continue; }
        s._m.copy(s._a).add(s._b).multiplyScalar(0.5);

        const wa = s._a.clone(), wb = s._b.clone();
        wa.project(camera); wb.project(camera);
        if (wa.z < -1 || wa.z > 1 || wb.z < -1 || wb.z > 1) { hideSpan(s); continue; }
        s.path.style.display = ''; s.ext.style.display = ''; s.label.style.display = '';

        const ax = (wa.x + 1) / 2 * w, ay = (1 - wa.y) / 2 * h;
        const bx = (wb.x + 1) / 2 * w, by = (1 - wb.y) / 2 * h;

        // The two ends of the rule, and where the extensions run from.
        let p = [ax, ay], q = [bx, by], lx = 0, ly = 0;
        let side = s.side;
        if (side === 'auto') {
          const mid = s.axis === 'x' ? (ay + by) / 2 : (ax + bx) / 2;
          const span = s.axis === 'x' ? h : w;
          s._side = pickSide(s._side, mid, span);
          side = s.axis === 'x' ? (s._side > 0 ? 'bottom' : 'top')
                                : (s._side > 0 ? 'right' : 'left');
        }
        if (s.axis === 'y') {
          const x = side === 'left' ? Math.min(ax, bx) - s.gap
                                    : Math.max(ax, bx) + s.gap;
          p = [x, ay]; q = [x, by]; lx = SPAN_TICK;      // ticks lie across it
        } else if (s.axis === 'x') {
          const y = side === 'top' ? Math.min(ay, by) - s.gap
                                   : Math.max(ay, by) + s.gap;
          p = [ax, y]; q = [bx, y]; ly = SPAN_TICK;
        } else {
          let dx = bx - ax, dy = by - ay;
          const len = Math.hypot(dx, dy) || 1;
          lx = -dy / len * SPAN_TICK; ly = dx / len * SPAN_TICK;
        }
        const seg = (x1, y1, x2, y2) =>
          `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`;
        s.path.setAttribute('d',
          seg(p[0] - lx, p[1] - ly, p[0] + lx, p[1] + ly)
          + seg(p[0], p[1], q[0], q[1])
          + seg(q[0] - lx, q[1] - ly, q[0] + lx, q[1] + ly));
        // The extensions only exist where the rule was carried off the model.
        s.ext.setAttribute('d', s.axis
          ? seg(ax, ay, p[0], p[1]) + seg(bx, by, q[0], q[1]) : '');

        s._px = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];

        /* A BRACKET NEED NOT CARRY A NUMBER. Passing no `text` leaves the rule
           marking WHERE something is and nothing else — which is how a groove
           is bracketed in a textbook figure, the measurement belonging to the
           label that names it. The chip is still positioned, so a note can
           still anchor to it. */
        const t = (typeof s.text === 'function') ? s.text() : s.text;
        if (t !== s._t) { s.label.textContent = t == null ? '' : t; s._t = t; }
        s.label.style.display = (t == null || t === '') ? 'none' : '';
        // The -50% pair is what centres the chip on the point; annotate.css
        // sets no offset of its own, so the two halves live in one place.
        s.label.style.transform =
          `translate3d(${((p[0] + q[0]) / 2).toFixed(1)}px, ${((p[1] + q[1]) / 2).toFixed(1)}px, 0)`
          + ' translate(-50%, -50%)';

        // Same facing rule as a note, and for the same reason: a bracket across
        // a gap on the far side of the model measures something nobody can see.
        let face = 1;
        const fw = s.facing && s.facing();
        if (fw) {
          _vd.copy(s._m).sub(camera.position).normalize();
          face = clamp01((-fw.dot(_vd) + FACE_BAND) / (2 * FACE_BAND));
        }
        s.path.style.opacity = face;
        s.ext.style.opacity = face;
        s.label.style.opacity = face;
      }
    }

    /* Resolve an anchor to a world point. A function is the interesting
       case — see the header — but a Vector3 or a plain [x,y,z] is allowed
       for something genuinely fixed. */
    function anchor(a) {
      const p = (typeof a === 'function') ? a() : a;
      if (!p) return null;
      return Array.isArray(p) ? _v.set(p[0], p[1], p[2]) : _v.copy(p);
    }

    function applyMode() {
      layer.classList.toggle('is-click', mode === 'click');
      /* Trap 2 again: the dots are only clickable in the mode where
         clicking them means something. */
      layer.style.pointerEvents = 'none';
      for (const n of notes) {
        const hot = (mode === 'click') || !!n.card;
        n.dot.style.pointerEvents = hot ? 'auto' : 'none';
        n.dot.tabIndex = (mode === 'click') ? 0 : -1;   // the label carries the tab stop
        if (mode === 'click') { n.open = false; }
        else if (mode === 'on') { n.open = true; }
        n.el.classList.toggle('is-open', n.open);
      }
    }

    function setMode(m) {
      if (MODES.indexOf(m) < 0) throw new Error('annotate: unknown mode ' + m);
      mode = m;
      revealT0 = -1;
      closeCard();                 // the subject is changing; the answer is stale
      applyMode();
      if (m === 'reveal') play();
      return api;
    }

    /* Stagger by where each label actually IS on screen, not by the order
       they were added — the sweep has to look like one gesture crossing
       the stage, and the add order is whatever the page found convenient.
       Re-seeded on every play() because the camera will have moved.

       BY RANK, NOT BY RAW X. Scaling each label's screen x straight into a
       delay works only when the labels are spread across the stage:
       callouts on ONE heme sit within a few percent of each other and all
       arrive on the same frame, so the stagger stops staggering exactly
       when the set is small enough to want it. Ranking spaces them evenly
       however tightly they cluster, and still runs left to right because
       the rank is by x. */
    function play() {
      revealT0 = performance.now() / 1000;
      const order = [];
      for (const n of notes) {
        n.open = true;
        if (n.atPx) {
          const q = n.atPx();
          if (q) order.push({ n, x: q[0] / (stageEl.clientWidth || 1) * 2 - 1 });
          else n.delay = 0;
          continue;
        }
        const p = anchor(n.at);
        if (!p) { n.delay = 0; continue; }
        p.project(camera);
        order.push({ n, x: p.x });
      }
      order.sort((a, b) => a.x - b.x);
      const gap = order.length > 1 ? SWEEP / (order.length - 1) : 0;
      order.forEach((e, i) => { e.n.delay = i * gap; });
      return api;
    }

    /* show() is the switch, fade() is the dimmer, and they are separate
       because a page needs both: "these do not apply here" (a toggle a
       student flicks) and "these are on their way out" (a page taking them
       off as the subject changes). They multiply — fade(0.4) on a hidden
       layer stays hidden — and either one reaching zero drops the layer
       out of the document, which is also what stops a faded-out callout
       from still catching clicks in click mode. */
    function paint() {
      layer.style.opacity = alpha;
      layer.style.display = (visible && alpha > 0.002) ? '' : 'none';
    }
    function show(on) { visible = !!on; paint(); return api; }
    function fade(x) {
      alpha = x <= 0 ? 0 : x >= 1 ? 1 : x;
      paint();
      return api;
    }

    function step() {
      if (!visible || alpha <= 0.002) return;   // display:none — nothing to place
      /* Trap 3: the element's CSS box, never the canvas backing store. */
      const w = stageEl.clientWidth, h = stageEl.clientHeight;
      if (!w || !h) return;
      const now = performance.now() / 1000;
      if (spans.length) stepSpans(w, h);
      const ko = keepOut();
      const live = [];

      for (const n of notes) {
        let x, y, depth;
        if (n.atPx) {
          /* Already in the layer's own coordinates: no projection, no
             culling, and nearest in the sort — see the header. */
          const q = n.atPx();
          if (!q) { n.el.style.display = 'none'; continue; }
          x = q[0]; y = q[1]; depth = -1;
          n.el.style.display = '';
        } else {
        const p = anchor(n.at);
        if (!p) { n.el.style.display = 'none'; continue; }
        /* Camera distance BEFORE projecting, because project() overwrites
           the vector — and it is the honest depth. See the sort below. */
        depth = p.distanceTo(camera.position);
        _p0.copy(p);                    // project() overwrites p; the facing test needs the world point
        p.project(camera);

        /* z outside [-1,1] is behind the camera or past the far plane:
           projecting it gives a mirrored point that lands somewhere
           plausible and completely wrong. */
        if (p.z < -1 || p.z > 1) { n.el.style.display = 'none'; continue; }
        n.el.style.display = '';
        x = (p.x + 1) / 2 * w;
        y = (1 - p.y) / 2 * h;
        }

        /* Flip while the label would cross the keep-out, and back once its
           own side clears it with room to spare. The gap is hysteresis:
           without it a label that just fits flips on alternate frames. */
        if (ko) {
          if (n._lw == null) n._lw = n.label.offsetWidth;
          const dx = (n.offset[0] || 0) + (n.offset[0] < 0 ? -SIDE_GAP : SIDE_GAP);
          const natural = x + dx - (dx < 0 ? n._lw : 0);       // the label's own left edge
          const want = ko.side === 'right'
            ? natural + n._lw > ko.left - (n.flipped ? 8 : 0)
            : natural < ko.right + (n.flipped ? 8 : 0);
          if (want !== n.flipped) {
            n.flipped = want;
            const free = (Math.abs(n.offset[0] || 0) || 1) * (ko.side === 'right' ? -1 : 1);
            applyOffset(n.el, want ? [free, n.offset[1] || 0] : n.offset);
          }
        }

        /* FACING. Edge-on is the middle of the fade, not its start, so a note
           does not pop off the instant its part passes 90 degrees: it is
           already half gone by then. Below the floor the note also stops
           taking the mouse, or a ghost label eats a click on the model. */
        let face = 1;
        const fw = n.facing && n.facing();
        if (fw) {
          _vd.copy(_p0).sub(camera.position).normalize();    // camera towards the part
          const towards = -fw.dot(_vd);                      // 1 face on, -1 dead away
          face = clamp01((towards + FACE_BAND) / (2 * FACE_BAND));
          n.el.classList.toggle('is-away', face < 0.06);
        }

        let o = face, lift = 0;
        if (mode === 'reveal') {
          if (revealT0 < 0) { o = 0; }
          else {
            const t = (now - revealT0 - n.delay) / RISE;
            const r = t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
            lift = (1 - r) * LIFT;
            o = r * face;
          }
        }

        n.el.style.transform =
          `translate3d(${x.toFixed(1)}px, ${(y + lift).toFixed(1)}px, 0)`;
        n.el.style.opacity = o;
        n._sx = x; n._sy = y;
        live.push({ n, depth });
      }

      /* THE CARD SITS ON ITS LABEL, not under it. Opened below, the label
         stayed on screen above a box explaining it — the same words twice,
         and on a crowded stage the pair reads as two callouts. Growing out
         of the label instead makes the card feel like the label opening,
         which is what the click meant.

         Placed from the LABEL'S OWN BOX rather than from the offset: the
         label is a different width for every note and hangs on either side
         depending on the sign of dx, so reconstructing where it landed is
         arithmetic that goes wrong the moment either changes.

         Still CLAMPED to the stage — a card that follows a traveller off
         the edge is a card the student cannot read or close. */
      if (cardNote && card) {
        const n = cardNote;
        if (n.el.style.display === 'none') { card.style.display = 'none'; }
        else {
          card.style.display = '';
          const cw = card.offsetWidth || 240, ch = card.offsetHeight || 96;
          const lb = n.label.getBoundingClientRect();
          const lr = layer.getBoundingClientRect();
          /* Slightly out and up from the label's own corner, so the label's
             text is covered rather than framed. */
          let cx = lb.left - lr.left - 9;
          let cy = lb.top - lr.top - 8;
          cx = Math.max(8, Math.min(cx, w - cw - 8));
          cy = Math.max(8, Math.min(cy, h - ch - 8));
          card.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0)`;
        }
      }

      /* Nearer labels on top — BY RANK, not by the projected z. Mapping
         p.z into a z-index band silently does nothing: perspective z is so
         nonlinear that everything more than a few molecule-widths out
         lands at 0.99-something, and labels on one heme come out
         identical. Ranking by true camera distance costs a sort of two. */
      live.sort((a, b) => b.depth - a.depth);
      live.forEach((e, i) => { e.n.el.style.zIndex = 100 + i; });
    }

    /* ---- pointing at the CHROME, not the model ----
       A callout that names a control rather than an atom: "set this to start
       the flow". The look and the tracking have to be the lesson's other
       callouts, or the student reads it as a different kind of object.

       Anchors are scene points, and this one is a DOM element, so the
       element's box is taken in CSS pixels and UNPROJECTED back through the
       camera. The world point that comes out projects to exactly that pixel
       whatever the camera is doing, so the dot rides the control through
       orbit, zoom and resize with nothing else in the module knowing that
       chrome is involved.

         at: notes.atElement(slider, { gap: 16, yFrom: sliderInput })

       `gap` is CSS pixels to the LEFT of the element's left edge, so the dot
       stands off a panel rather than sitting on its border. `yFrom` takes the
       vertical centre from a different element: a labelled row's own centre
       falls between its name and its control and reads as a miss.

       FIRST OF ITS KIND at the time of writing — capillary/nanopore-test.html
       is the only caller. If you are adding the second, this comment is the
       convention. */
    const _uiAnchor = new THREE.Vector3();
    function atElement(el, o) {
      o = o || {};
      return () => {
        const host = stageEl.getBoundingClientRect();
        const rx = el.getBoundingClientRect();
        const ry = (o.yFrom || el).getBoundingClientRect();
        return _uiAnchor.set(
          ((rx.left - (o.gap || 0) - host.left) / host.width) * 2 - 1,
          -(((ry.top + ry.height * 0.5 - host.top) / host.height) * 2 - 1),
          0.5).unproject(camera);
      };
    }

    const api = {
      add, span, step, play, show, fade, setMode, openCard, closeCard, atElement,
      clear() {
        closeCard();
        while (notes.length) notes[0].remove();
        while (spans.length) spans[0].remove();
        return api;
      },
      get cardOpen() { return !!cardNote; },
      get mode() { return mode; },
      get alpha() { return alpha; },
      get notes() { return notes.slice(); },
      el: layer,
    };
    if (opts.mode) setMode(opts.mode); else applyMode();
    paint();
    return api;
  }

  return { create, MODES };
})();

/* =====================================================================
 *  Notebook — a component's named parts, and the notes it carries
 *  A student asks "what are the two pumps?" and the honest answer is two
 *  callouts on the two proteins, not a paragraph. For that a page needs
 *  NAMES for the parts ("channel.K", "pump", "outside") and something to
 *  say about each in the library's voice. Every component's mount makes
 *  one of these and exposes note / notes / clearNotes / anchors on its
 *  handle:
 *      c.note('pump');                          // the library's note, on the thing
 *      c.note('pump', { text:'…', card:'…' });  // the page's own words, same anchor
 *      c.notes(['channel.K', 'pump']);          // exactly these; false clears
 *      c.anchors();                             // names, with the library text
 *  `facings` is the optional twin of `anchors`: name → function returning the
 *  world direction that part faces, for the parts where being on the far side
 *  of the model should fade the callout out. Most parts have none.
 *  It lives in this file, not beside card-stage.js, so that loading
 *  annotate.js is all a page has to remember: a generated page that
 *  reached for callouts loaded this and forgot a second script, and every
 *  note silently no-oped.
 *  Anchors are FUNCTIONS by the rule above; one that answers null (no
 *  pump in this layout, no Na⁺ yet) parks the note off screen.
 * ===================================================================== */
window.Notebook = (function () {
  function create({ box, anchors = {}, library = {}, facings = {} }) {
    let layer = null;
    const open = new Map();                  // name → annotate note
    const _p = new THREE.Vector3();
    function ensure() {
      if (layer) return layer;
      const host = box.canvas.parentElement;
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      layer = window.Annot.create(THREE, host, box.camera, { mode: 'on' });
      return layer;
    }
    const anchorOf = name => {
      const a = anchors[name];
      if (!a) return null;
      /* A part that is not on stage right now (no pump in this layout, no
         Na⁺ yet) answers null; the note waits off screen instead of throwing
         inside annotate's step. */
      const f = typeof a === 'function' ? a : () => _p.copy(a);
      return () => f() || _p.set(0, 1e6, 0);
    };
    function note(name, over = {}) {
      const at = anchorOf(name);
      if (!at) { console.warn('notebook.js: no anchor named ' + name + '; have ' + Object.keys(anchors).join(', ')); return null; }
      const lib = library[name] || {};
      const spec = Object.assign({ text: name, offset: [34, -26] }, lib, over);
      if (open.has(name)) open.get(name).remove();
      const n = ensure().add({ key: name, text: spec.text, card: spec.card, offset: spec.offset, tone: spec.tone,
        at: () => at(), facing: facings[name] || null });
      open.set(name, n);
      if (!box.running) box.draw();
      return n;
    }
    function unnote(name) { const n = open.get(name); if (n) { n.remove(); open.delete(name); } }
    function clear() { if (layer) layer.clear(); open.clear(); }
    function notes(names) {
      clear();
      if (names) for (const n of names) note(n);
    }
    /* `present` is whether the part is on stage right now, so a panel can
       leave out the pump in a layout with no pump. */
    const list = () => Object.keys(anchors).map(k => {
      const a = anchors[k];
      const present = typeof a === 'function' ? !!a() : true;
      return Object.assign({ name: k, present }, library[k] || {});
    });
    function step() { if (layer) layer.step(); }
    return { note, unnote, notes, clear, list, step, get layer() { return layer; } };
  }

  return { create };
})();
