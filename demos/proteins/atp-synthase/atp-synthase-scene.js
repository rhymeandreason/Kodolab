/* =============================================================================
 *  proteins/atp-synthase/atp-synthase-scene.js — ATPSynthase: the turning enzyme
 * =============================================================================
 *  The human enzyme (8H9S) in a Proteinbox, with what the file does not hold
 *  drawn over it: the rotor turning, protons riding the c-ring, ADP + Pi in
 *  and ATP out of the head, and the inner membrane as a grey band.
 *
 *    ATPSynthase.mount(el, {spin, context})   its own box: fetch, draw, turn
 *      → { box, trace, ready, spin(on), setContext(c), advance(dt), destroy }
 *    ATPSynthase.attach(box)             on a box the page already owns
 *      → { enter(t, context), exit(), spin(on), advance(dt), destroy }
 *    ATPSynthase.viewFor(t, context)     the basis to pass box.setData
 *
 *  CONTEXT IS WHICH MEMBRANE: 'mitochondrion' or 'thylakoid'. The machine is
 *  the same either way: F1 sits on the low-proton side and protons enter from
 *  the other. What flips is which compartment that is. A mitochondrion pumps
 *  into the intermembrane space and makes ATP in the matrix; a thylakoid
 *  pumps into its lumen and makes ATP in the stroma. Drawn the way the
 *  respiration lesson draws both (chemiosmosis/electron-transport.js): the proton side
 *  on top in a mitochondrion, at the bottom in a thylakoid, so F1 hangs down
 *  in one and stands up in the other.
 *
 *  THE STRUCTURE IS STILL THE HUMAN ONE in a thylakoid. A chloroplast's
 *  enzyme is the same machine with a larger c-ring (14 in spinach), and no
 *  chloroplast bake is held; a page showing 'thylakoid' says so.
 *
 *  `attach` is for a page that swaps other structures into the same box
 *  (the story's 1BMF sites): call `enter(t)` right AFTER `box.setData(t)`
 *  with the 8H9S bake, and `exit()` before swapping it out. setData empties
 *  the chain group, so the membrane and the pooled particles go with it.
 *
 *  THE TURN IS A RIGID ROTATION of 8H9S's own rotor coordinates about the
 *  axis the baker measured. The head's shape change is NOT animated.
 *
 *  Needs: three r128, palette.js, molecules.js, skel.js, mol-carriers.js,
 *  scene.js, atomkit.js, membrane/parts.js, kit/ribbon.js, kit/card-stage.js,
 *  kit/proteinbox.js, proteins/proteins.js.
 * ========================================================================== */
(function(global){
'use strict';

const DATA = new URL('data/', document.currentScript.src).href;

/* ---- measured off the bake ------------------------------------------------ */
const roleOf = (t, id) => t.meta.roles[id];
const chainsOf = (t, subs) => {
  const want = new Set(subs.split(','));
  return t.order.filter(id => want.has(roleOf(t, id).subunit));
};
const count = (t, sub) => chainsOf(t, sub).length;
const centroidOf = (t, ids) => {
  const c = [0, 0, 0]; let n = 0;
  for(const id of ids) for(const p of t.chains[id].CA){ c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; n++; }
  return c.map(v => v / n);
};
const holding = (t, res) => [...new Set(t.site.atoms.filter(a => a.res === res).map(a => a.chain))];
/* A site with only the atoms `keep` passes, bonds re-indexed to match. */
function siteOnly(site, keep){
  const atoms = [], at = new Map();
  site.atoms.forEach((a, i) => { if(keep(a)){ at.set(i, atoms.length); atoms.push(a); } });
  return { atoms, bonds: site.bonds.filter(([i, j]) => at.has(i) && at.has(j)).map(([i, j]) => [at.get(i), at.get(j)]) };
}

/* ---- the turn ------------------------------------------------------------- */
/* THE PROTONS DRIVE THE ROTOR. It does not glide: a proton landing on the
   Glu58 at subunit a's entry half-channel advances the ring one c-subunit,
   360/c degrees, and a proton that has ridden c−1 steps round leaves by the
   exit half-channel. Protons arrive one every PERIOD. */
const PERIOD = 1.5;    // s between protons, so between steps
const MOVE_S = 0.45;   // s a step takes
const FIRST = 0.8;     // s until the first proton lands

/* ---- the flow ------------------------------------------------------------- *
 *  DRAWN, NOT DEPOSITED. No map shows a proton and no file catches a
 *  nucleotide in transit, so both are clocked off the rotor angle. What they
 *  ride and where they go are the file's: each c-subunit's Glu58, subunit a,
 *  and each β's P-loop.
 *
 *  POSITIVE ANGLE IS SYNTHESIS. The baker's axis points from the c-ring to
 *  the head, and synthesis turns the rotor counterclockwise seen from the
 *  head: a right-handed turn about that axis.
 *
 *  WHICH SITE OPENS NEXT is inference. The β this file holds empty is the one
 *  that just let go, and the sites open in the direction of rotation. */
const GLU = 58, PLOOP = [160, 167];
const BOARD = 20;                   // degrees past subunit a: the entry half-channel
const FACE = 24;                    // Å either side of the ring's middle a proton is drawn from and to
const HOP = 0.9;                    // s, out of a half-channel
const APPROACH = 3.2;               // s, a proton's wander in from beside the ring
const DROP = 45;                    // Å above the entry mouth a hurried proton starts
const REACH = 130;                  // Å out from subunit a a proton starts
const WOBBLE = 14;                  // Å of sideways drift on the way in
const DRIFT = 150;                  // Å a nucleotide travels from its site: out toward the canvas edge
const OUT_S = 5.2, IN_S = 5, IN_DELAY = 0.6;
/* Glu58 sits mid-membrane, buried between c-subunits, so a proton riding it
   is drawn through the ribbon or it cannot be seen at all. */
/* EXAGGERATED: every drawn particle, badge and name pill is EXAG times its
   size in ångströms, so a proton and an ATP still read when the scene is
   embedded small. The enzyme and the distances they travel stay true. */
const EXAG = 2;
const SPREAD = 20 * EXAG;            // Å either side ADP and Pi start from each other
const PROTON_R = 1.8 * EXAG, BADGE = 4 * EXAG, PILL = 6 * EXAG;   // Å, drawn

/* ---- the membrane --------------------------------------------------------- *
 *  DRAWN: no lipid is in the file. Centred on the c-ring's middle along the
 *  spin axis, which is where the ring sits in the bilayer. One faint grey
 *  band, the bilayer's ~46 Å, heads included: a gently bent strip through
 *  the axis, swung about it to face the camera, so from any view it reads as
 *  a membrane in section. */
const BILAYER = 46, SHEET_R = 260;   // Å
/* CURVED AROUND THE COMPARTMENT IT ENCLOSES, as membrane/sheet.js bends the
   respiration lesson's: the matrix in a mitochondrion (F1's side), the lumen
   in a thylakoid (the proton side). Both put that compartment at the bottom
   of the screen, so the band arches up either way. Same sag for its width as
   sheet.js's default: 12 over a 150 half-span. */
const SAG = 12 / 150 * SHEET_R;
const BEND_R = (SHEET_R * SHEET_R + SAG * SAG) / (2 * SAG);
const BAND = 0x9a9a9a;
const WORD_H = 12;   // Å
/* The word sits off to one side of the protein, pulled toward the middle
   until it is inside the canvas, so a shorter window does not crop it. */
const WORD_ASIDE = 0.55, EDGE = 0.85;   // fraction of SHEET_R; NDC

const CONTEXTS = {
  mitochondrion: { headUp: false },
  thylakoid:     { headUp: true },
};

/* The bake's basis, turned half a turn about the screen's x when F1 would
   otherwise point the wrong way. */
function viewFor(t, context){
  const B = t.view || [[1, 0, 0], [0, 1, 0], [0, 0, 1]], a = t.spin.axis;
  const up = B[1][0] * a[0] + B[1][1] * a[1] + B[1][2] * a[2] > 0;
  if(up === CONTEXTS[context || 'mitochondrion'].headUp) return B.map(r => r.slice());
  return [B[0].slice(), B[1].map(x => -x), B[2].map(x => -x)];
}

const ease = k => k * k * (3 - 2 * k);
const V3 = p => new THREE.Vector3(p[0], p[1], p[2]);

function word(text, h = WORD_H){
  const cv = document.createElement('canvas'), x = cv.getContext('2d'), px = 64;
  const font = `500 ${px}px ${getComputedStyle(document.body).fontFamily}`;
  x.font = font;
  cv.width = Math.ceil(x.measureText(text).width) + 8; cv.height = px * 1.3;
  x.font = font; x.fillStyle = '#6b6b6b'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, cv.width / 2, cv.height / 2);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
  sp.scale.set(h * cv.width / cv.height, h, 1);
  sp.renderOrder = 1;
  return sp;
}

function membrane(t, context){
  const A = V3(t.spin.axis).normalize(), P = V3(t.spin.point);
  const mid = V3(centroidOf(t, chainsOf(t, 'c'))).sub(P).dot(A);
  /* A flat strip bent in its own plane: local y is the membrane normal, and
     the centre of curvature sits at −y. */
  const arc = new THREE.PlaneGeometry(2 * SHEET_R, BILAYER, 48, 1);
  const pos = arc.attributes.position;
  for(let i = 0; i < pos.count; i++){
    const th = pos.getX(i) / BEND_R, rad = BEND_R + pos.getY(i);
    pos.setXY(i, rad * Math.sin(th), rad * Math.cos(th) - BEND_R);
  }
  const m = new THREE.Mesh(arc,
    new THREE.MeshBasicMaterial({ color: BAND, transparent: true, opacity: .14, depthWrite: false, side: THREE.DoubleSide }));
  m.renderOrder = -1;
  m.position.copy(P).addScaledVector(A, mid);
  const g = new THREE.Group();
  g.userData.membrane = true;
  /* +A is F1's side; local y points away from the enclosed compartment. */
  g.userData.ySign = context === 'thylakoid' ? 1 : -1;
  const sp = word('membrane');
  sp.position.copy(m.position);
  g.add(m, sp);
  return g;
}

function attach(box){
  let t = null, on = false, spinning = true, pivot = null;
  let turned = 0, target = 0, moving = null, clock = 0, nextLand = FIRST, band = null, lastT = 0, raf = 0, pending = false;
  const AXIS = new THREE.Vector3();
  const _n = new THREE.Vector3(), _x = new THREE.Vector3(), _p = new THREE.Vector3();

  /* Rotor meshes, found by `userData.chain`, re-parented into a pivot on the
     measured axis. Harvested on a timer rather than rAF, since the box builds
     a chain per frame and rAF stops in a hidden tab. */
  function collect(){
    if(!on) return;
    const P = t.spin.point;
    if(!pivot){
      pivot = new THREE.Group();
      pivot.position.set(P[0], P[1], P[2]);
      box.group.add(pivot);
    }
    const moving = new Set(t.spin.chains);
    for(const m of [...box.group.children]){
      if(m === pivot || !m.userData || !moving.has(m.userData.chain)) continue;
      m.position.set(-P[0], -P[1], -P[2]);
      pivot.add(m);
    }
  }
  const timer = setInterval(collect, 200);

  const flow = (() => {
    let geo = null;
    const live = [];
    const pools = {};

    function measure(){
      const A = V3(t.spin.axis).normalize(), P = V3(t.spin.point);
      const rel = p => V3(p).sub(P);
      const flat = v => v.clone().addScaledVector(A, -v.dot(A));
      const aC = rel(centroidOf(t, chainsOf(t, 'a')));
      const u = flat(aC).normalize(), w = new THREE.Vector3().crossVectors(A, u);
      const az = v => (Math.atan2(v.dot(w), v.dot(u)) * 180 / Math.PI + 360) % 360;
      const mid = rel(centroidOf(t, chainsOf(t, 'c'))).dot(A);
      const glu = chainsOf(t, 'c').map(id => {
        const ch = t.chains[id], i = ch.nums.indexOf(GLU);
        return i < 0 ? null : { local: rel(ch.CA[i]), az: az(rel(ch.CA[i])) };
      }).filter(Boolean);
      const full = new Set(holding(t, 'ADP').concat(holding(t, 'ATP')));
      const betas = chainsOf(t, 'β').map(id => {
        const ch = t.chains[id];
        const pts = ch.CA.filter((p, i) => ch.nums[i] >= PLOOP[0] && ch.nums[i] <= PLOOP[1]);
        const n = pts.length;
        const c = rel(pts.reduce((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n, s[2] + p[2] / n], [0, 0, 0]));
        return { id, at: c, az: az(c), out: flat(c).normalize().addScaledVector(A, 0.35).normalize(), empty: !full.has(id) };
      });
      const open = betas.find(b => b.empty) || betas[0];
      betas.sort((a, b) => ((a.az - open.az + 360) % 360) - ((b.az - open.az + 360) % 360));
      const edge = flat(aC);
      return { A, P, glu, betas, u, w,
        from: edge.clone().addScaledVector(A, mid - FACE).add(P),
        to:   edge.clone().addScaledVector(A, mid + FACE).add(P) };
    }

    const gluAt = (g, deg) => g.local.clone().applyAxisAngle(geo.A, deg * Math.PI / 180).add(geo.P);

    function take(kind, make){
      const pool = pools[kind] || (pools[kind] = []);
      let m = pool.find(x => !x.visible);
      if(!m){ m = make(); pool.push(m); box.group.add(m); }
      if(m.parent !== box.group) box.group.add(m);
      m.visible = true;
      return m;
    }
    const PROTON_GEO = new THREE.SphereGeometry(PROTON_R, 16, 12);
    const PROTON_MAT = new THREE.MeshStandardMaterial({ color: MolLib.PALETTE.respiration.proton,
      emissive: MolLib.PALETTE.respiration.proton, emissiveIntensity: .5, roughness: .4,
      depthTest: false, transparent: true, opacity: .95 });
    /* The membrane lesson's proton: a + badge in Parts' darkened steel. */
    const kit = AtomKit.create(THREE);
    const proton = () => take('H', () => {
      const m = new THREE.Mesh(PROTON_GEO, PROTON_MAT);
      m.renderOrder = 10;
      const b = kit.charge('+', Parts.ionBadge('H'), 'H', BADGE / .62);
      b.material.depthTest = false;
      b.position.set(PROTON_R * .8, PROTON_R * .8, 0);
      m.add(b);
      return m;
    });
    /* A name pill rides beside each nucleotide rather than inside its group,
       so it stays upright while the molecule tumbles. Words off the specs. */
    const NAME = { atp: MolLib.MOLECULES.atp.short, adp: MolLib.MOLECULES.atp.gly.spent.short,
                   pi: MolLib.MOLECULES.pi.short };
    function tagFor(g, kind){
      if(!g.userData.tag){
        g.userData.tag = kit.pill(NAME[kind], PILL);
        box.group.add(g.userData.tag);
      }
      return g.userData.tag;
    }
    /* A carrier spec is in scene units; the box is in ångströms. ADP is ATP
       without the γ phosphoryl, the four atoms the spec names. */
    function molecule(kind){
      return take(kind, () => {
        const spec = MolLib.MOLECULES[kind === 'pi' ? 'pi' : 'atpSkel'];
        const g = Stage.buildMolecule(spec, { center: true });
        if(kind === 'adp'){
          const gone = new Set(spec.gly.gamma), nb = (spec.bonds || []).length;
          g.children.forEach((m, i) => {
            if(i < nb ? m.userData.pair.some(k => gone.has(k)) : gone.has(i - nb)) m.visible = false;
          });
        }
        /* Drawn through the head, as the protons are through the ring: a site
           opening on the far side is still the event. Cloned, since Stage
           shares its materials. */
        g.traverse(m => { if(m.material){ m.material = m.material.clone(); m.material.depthTest = false; m.renderOrder = 11; } });
        g.scale.setScalar(EXAG / MolLib.SCALE);
        g.userData.size = EXAG / MolLib.SCALE;
        return g;
      });
    }
    const withTag = kind => { const m = molecule(kind); const tag = tagFor(m, kind); tag.visible = false; return { m, tag }; };

    const wrap = d => ((d % 360) + 540) % 360 - 180;
    /* The Glu58 that will sit at the entry when this proton lands: the ring
       will have moved one step for every proton still in flight ahead of it. */
    function spawn(approach, target, stepDeg){
      if(!geo) geo = measure();
      const ahead = live.filter(x => x.kind === 'H' && x.phase === 'in').length;
      const at = target + stepDeg * ahead;
      const g = geo.glu.reduce((b, g) => Math.abs(wrap(g.az + at - BOARD)) < Math.abs(wrap(b.az + at - BOARD)) ? g : b);
      const R = () => Math.random() * 2 - 1;
      /* A proton with a full approach wanders in from beside the ring; one
         the rotor is already waiting on drops straight in from the proton
         side (−A, away from F1). */
      const start = approach >= APPROACH
        ? geo.from.clone().addScaledVector(geo.u, REACH * (0.8 + 0.4 * Math.random()))
            .addScaledVector(geo.w, 40 * R()).addScaledVector(geo.A, 20 * R())
        : geo.from.clone().addScaledVector(geo.A, -DROP * (0.4 + 0.6 * approach / APPROACH))
            .addScaledVector(geo.w, 10 * R());
      const waves = [0, 1].map(() => ({ f: 0.8 + 0.8 * Math.random(), ph: Math.random() * 6.28 }));
      live.push({ kind: 'H', m: proton(), g, phase: 'in', clock: 0, dur: approach, start, waves });
    }
    /* The ring finished a step: every rider moved one c-subunit. */
    function stepped(c){
      for(const x of live) if(x.kind === 'H' && x.phase === 'ride' && ++x.steps >= c - 1){
        x.phase = 'out'; x.clock = 0; x.start = x.m.position.clone();
      }
    }
    /* Rotor angle that puts a Glu58 exactly at the entry. */
    function rest(){
      if(!geo) geo = measure();
      return wrap(BOARD - geo.glu[0].az);
    }

    function step(prev, now, dt, onDock){
      if(!geo) geo = measure();
      if(Math.floor(prev / 120) < Math.floor(now / 120)){
        const site = geo.betas[Math.floor(now / 120) % 3];
        const home = site.at.clone().add(geo.P);
        const side = new THREE.Vector3().crossVectors(geo.A, site.out).normalize();
        live.push({ kind: 'mol', ...withTag('atp'), from: home, to: home.clone().addScaledVector(site.out, DRIFT), clock: 0, delay: 0, dur: OUT_S, leaving: true });
        /* ADP (~20 Å drawn EXAG times) and Pi start a molecule's length and
           more apart, sideways and along the axis, and close in on the site. */
        for(const [kind, off] of [['adp', 1], ['pi', -1]])
          live.push({ kind: 'mol', ...withTag(kind), to: home.clone().addScaledVector(side, off * 3 * EXAG),
            from: home.clone().addScaledVector(site.out, DRIFT).addScaledVector(side, off * SPREAD).addScaledVector(geo.A, off * SPREAD * .4),
            clock: 0, delay: IN_DELAY, dur: IN_S });
      }
      for(let i = live.length - 1; i >= 0; i--){
        const x = live[i];
        x.clock += dt;
        let done = false;
        if(x.kind === 'H'){
          if(x.phase === 'in'){
            /* A diffusing ion: one eased curve from its start, past the
               half-channel's mouth, onto Glu58, with a slow wobble that dies
               out on arrival. */
            const k = Math.min(1, x.clock / x.dur), e = ease(k), fade = Math.sin(Math.PI * e);
            const [a, b] = x.waves, end = gluAt(x.g, now);
            x.m.position.copy(x.start).multiplyScalar((1 - e) * (1 - e))
              .addScaledVector(geo.from, 2 * e * (1 - e)).addScaledVector(end, e * e)
              .addScaledVector(geo.w, WOBBLE * fade * Math.sin(6.28 * a.f * e + a.ph))
              .addScaledVector(geo.A, WOBBLE * fade * Math.sin(6.28 * b.f * e + b.ph));
            if(k >= 1){ x.phase = 'ride'; x.steps = 0; onDock(); }
          } else if(x.phase === 'ride'){
            x.m.position.copy(gluAt(x.g, now));
          } else {
            const k = Math.min(1, x.clock / HOP);
            x.m.position.copy(x.start).lerp(geo.to, ease(k));
            x.m.scale.setScalar(k < .7 ? 1 : 1 - (k - .7) / .3 + 1e-3);
            done = k >= 1;
          }
        } else {
          const k = Math.max(0, Math.min(1, (x.clock - x.delay) / x.dur));
          x.m.visible = x.clock >= x.delay;
          x.m.position.copy(x.from).lerp(x.to, ease(k));
          x.m.rotation.y += dt * .7; x.m.rotation.x += dt * .3;
          const fade = x.leaving ? (k < .8 ? 1 : 1 - (k - .8) / .2) : (k < .85 ? Math.min(1, k * 6) : 1 - (k - .85) / .15);
          x.m.scale.setScalar(x.m.userData.size * Math.max(1e-3, fade));
          x.tag.visible = x.m.visible;
          x.tag.position.copy(x.m.position).addScaledVector(geo.A, PILL * 1.4);
          x.tag.scale.set(x.tag.scale.x / (x.tag.scale.y || 1) * PILL * Math.max(1e-3, fade), PILL * Math.max(1e-3, fade), 1);
          done = k >= 1;
        }
        if(done){ x.m.visible = false; if(x.tag) x.tag.visible = false; x.m.scale.setScalar(x.kind === 'H' ? 1 : x.m.userData.size); live.splice(i, 1); }
      }
    }

    function clear(){
      for(const x of live){ x.m.visible = false; if(x.tag) x.tag.visible = false; if(x.kind === 'H') x.m.scale.setScalar(1); }
      live.length = 0;
      for(const pool of Object.values(pools)) for(const m of pool){ m.visible = false; if(m.userData.tag) m.userData.tag.visible = false; }
    }
    /* setData empties the chain group, pooled meshes with it. */
    function reset(){
      clear();
      for(const pool of Object.values(pools)) for(const m of pool){
        if(m.userData.tag){ kit.forget(m.userData.tag); box.group.remove(m.userData.tag); }
        m.traverse(c => { if(c.isSprite) kit.forget(c); });
      }
      for(const k of Object.keys(pools)) delete pools[k];
      geo = null;
    }
    return { step, spawn, stepped, rest, clear, reset, get live(){ return live.length; } };
  })();

  /* One clock for the rotor and everything it carries, so a test can drive it
     where rAF does not run. `turned` is where the rotor is; `target` is
     where the protons that have landed have sent it. */
  function advance(dt){
    if(pending) settle();
    if(!(on && spinning && pivot) || pending) return;
    const prev = turned, c = count(t, 'c'), stepDeg = 360 / c;
    clock += dt;
    while(nextLand - clock <= APPROACH){
      flow.spawn(Math.max(0.3, nextLand - clock), target, stepDeg);
      nextLand += PERIOD;
    }
    if(!moving && turned < target - 1e-6) moving = { from: turned, k: 0 };
    if(moving){
      moving.k = Math.min(1, moving.k + dt / MOVE_S);
      turned = moving.from + stepDeg * ease(moving.k);
      if(moving.k >= 1){ moving = null; flow.stepped(c); }
    }
    const s = t.spin.axis;
    AXIS.set(s[0], s[1], s[2]);
    pivot.setRotationFromAxisAngle(AXIS, (turned % 360) * Math.PI / 180);
    flow.step(prev, turned, dt, () => { target += stepDeg; });
    box.draw();
  }
  /* Riders and the rotor's queue start over together, from rest with a Glu58
     waiting at the entry. */
  function restart(){
    flow.clear();
    turned = target = flow.rest();
    moving = null; clock = 0; nextLand = FIRST;
  }

  function placeBand(){
    if(!band) return;
    const [strip, sp] = band.children;
    const A = V3(t.spin.axis).normalize();
    box.group.worldToLocal(_n.copy(box.camera.position)).sub(strip.position);
    _n.addScaledVector(A, -_n.dot(A));
    if(_n.lengthSq() < 1e-6) return;
    _n.normalize();
    const Y = A.clone().multiplyScalar(band.userData.ySign);
    _x.crossVectors(Y, _n);
    strip.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(_x, Y, _n));
    for(let r = SHEET_R * WORD_ASIDE; r >= 30; r -= 5){
      const th = -r / BEND_R;
      _p.set(BEND_R * Math.sin(th), BEND_R * (Math.cos(th) - 1), 0).applyQuaternion(strip.quaternion).add(strip.position);
      const q = box.group.localToWorld(_p.clone()).project(box.camera);
      if(Math.abs(q.x) < EDGE && Math.abs(q.y) < EDGE) break;
    }
    sp.position.copy(_p);
  }

  (function frame(now){
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;
    if(!on) return;
    if(pending) settle();
    if(pending) return;
    placeBand();
    advance(dt);
  })(0);

  function exit(){
    if(!on) return;
    on = false;
    pending = false;
    flow.reset();
    if(band) box.group.remove(band);
    if(pivot) box.group.remove(pivot);
    band = pivot = null;
  }
  /* THE BOX BUILDS ONE CHAIN PER FRAME, and the rotor would otherwise turn
     the chains that had landed while the rest were still arriving. Nothing
     moves until the queue drains. */
  function settle(){
    if(box.building) return;
    pending = false;
    collect();
    restart();
    box.draw();
  }
  function enter(trace, context = 'mitochondrion'){
    exit();
    t = trace; on = true;
    band = membrane(t, context);
    box.group.add(band);
    pending = true;
    settle();
  }
  return {
    enter, exit, advance, flow,
    spin(v){ if(!!v !== spinning){ spinning = !!v; if(on && !pending) restart(); } },
    get spinning(){ return spinning; },
    destroy(){ exit(); clearInterval(timer); cancelAnimationFrame(raf); },
  };
}

/* A box of its own on `el`: the whole human enzyme, turning. During the turn
   the β sites are the animation's, so only α keeps the nucleotides the file
   holds. */
function mount(el, opts = {}){
  const ME = ProteinLib.byKey('atp-synthase');
  const v = ProteinLib.variantOf(ME, 'human');
  const box = Proteinbox.create(Object.assign({
    mount: el, view: ProteinLib.viewOf(ME), orbit: true,
    stage: { ortho: false, turn: 'trackball' }, pad: 1.15, sub: 10,
  }, opts.box));
  const ctl = attach(box);
  let context = opts.context || 'mitochondrion';
  function draw(t, keep){
    box.setData(t, { keep, view: viewFor(t, context), colors: ProteinLib.colorsOf(ME, v) });
    if(t.site) box.setPocket(siteOnly(t.site, a => roleOf(t, a.chain).subunit === 'α'));
    const spinning = ctl.spinning;
    ctl.enter(t, context);
    ctl.spin(spinning);
    box.draw();
  }
  const api = { box, trace: null, spin: ctl.spin, advance: ctl.advance, flow: ctl.flow,
    get context(){ return context; },
    setContext(c){ context = c; if(api.trace) draw(api.trace, true); },
    destroy(){ ctl.destroy(); box.destroy(); } };
  api.ready = fetch(DATA + v.read.baked).then(r => r.json()).then(t => {
    api.trace = t;
    ctl.spin(opts.spin !== false);
    draw(t, false);
    return api;
  });
  return api;
}

global.ATPSynthase = { mount, attach, viewFor, siteOnly, CONTEXTS };
})(window);
