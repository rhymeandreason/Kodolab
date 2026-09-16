/* =============================================================================
 *  kit/lanes.js — molecules side by side, named, that split and swap
 * =============================================================================
 *  The shape every pathway lesson has: one molecule on stage becomes two, each
 *  keeps running, each carries its name, and a step replaces one lane's
 *  molecule without disturbing the other. Glycolysis is the first, not the
 *  last — respiration, photosynthesis, fermentation and the pentose phosphate
 *  pathway are all "n lanes, swap one, sometimes split".
 *
 *  Everything here was got right once in glycolysis-lab.html and is worth more
 *  than the code it takes, because each of these is invisible until it is wrong:
 *
 *   · A LANE IS CENTRED ON THE MOLECULE, not on its origin. A spec keeps
 *     whatever origin its source used, so a lopsided one sits off the lane axis
 *     and reads as the whole stage being off-centre.
 *   · THE VERTICAL TWIN. A spec is centred on its centroid, not the middle of
 *     what you SEE — a phosphate tail hanging down with nothing above to
 *     balance leaves the molecule loitering under its own name. Move the
 *     MOLECULE, never the camera: re-centring the camera per state slides the
 *     scene between steps and turns a split into a camera move.
 *   · ONE SHARED LABEL BASELINE, passed in, not derived per molecule. Two names
 *     at different heights read as two different SIZES of thing.
 *   · A LABEL'S WIDTH IS IN PIXELS AND THE LANES' SEPARATION IS NOT. A DOM
 *     label keeps its width as the camera pulls back, so two names run through
 *     each other on a narrow stage. Each gets the space between the lanes.
 *   · ABBREVIATE FIRST, THEN SHRINK, and decide it for ALL lanes at once. Per
 *     lane, the narrow name abbreviates while the wide one stays systematic and
 *     the pair reads as two kinds of thing.
 *   · POSITIONS ARE TARGETS. A product placed straight onto its own centring
 *     JUMPS on the swap frame — the frame the name returns — so it reads as the
 *     label shoving the molecule down. It starts where the outgoing molecule
 *     stood and eases.
 *
 *  Names are DOM, not sprites: sharp at any zoom, selectable, sized by the
 *  page's type scale rather than the camera. The tracking a sprite gives free is
 *  paid explicitly — every frame each anchor is projected and the label parked
 *  over it. That is `drawPlates`, and it must run AFTER the render (kit's
 *  `afterFrame`) or the label is pinned to the previous frame's camera.
 *
 *  WHAT THIS MODULE DOES NOT OWN: which molecule a step produces, when a step
 *  runs, what a name says. The page passes `specOf`, `label` and `plateHTML`.
 *
 *  Loaded after scene.js. Exposes window.Lanes.
 * ========================================================================== */
(function(global){
  'use strict';
  const THREE=global.THREE;

  const DEF={
    spread:8.0,          // half the distance between two lanes, world units;
                         //   a () => number is re-asked every time a lane is placed
    plateGap:0.8,        // world gap between the molecule top and its label
    plateGapPx:10,       // …plus this much in pixels, in the top reserve
    plateClearPx:14,     // clearance above the top label (a rail, a title)
    plateGapPxX:14,      // horizontal breathing room between two labels
    minScale:0.62,       // a label shrinks this far and no further
    fallbackPlatePx:58,  // before any label exists to measure
  };

  function create(opts){
    const o=Object.assign({}, DEF, opts);
    const root=o.root, camera=o.camera, canvas=o.canvas, host=o.host;
    const radii=o.radii||{};
    const specOf=o.specOf;
    // {full, abbr} — both spellings of a name. Default: the spec's own fields.
    const label=o.label||(spec=>({full:spec.name, abbr:spec.short||spec.name}));
    // The page's markup for one label. It owns the type; this owns the position.
    const plateHTML=o.plateHTML||(spec=>
      `<div class="pn">${spec.name}</div><div class="pf">${spec.formula||''}</div>`);
    const plateClass=o.plateClass||'plate';
    const nameSel=o.nameSel||'.pn';

    /* ---- what counts as visible ----
     * The page's policy, because it is a teaching decision: glycolysis hides
     * every C–H (the lesson is carbon and phosphate bookkeeping), and an
     * invisible hydrogen must not widen a shared camera fit.
     *
     * EVERY MEASUREMENT BELOW IS IN THE ORIENTATION THE MOLECULE IS BUILT IN.
     * buildMolecule applies `spec.view` after layout, so raw coordinates are
     * fine for a viewless chain and wrong for a ring that is drawn turned —
     * measured in an orientation it is never drawn in, a ring hangs off two
     * edges and the label lands on it. The default applies `view`; a page that
     * passes its own must too.
     */
    const viewQuat=spec=>spec.view
      ? new THREE.Quaternion().setFromEuler(
          new THREE.Euler(spec.view[0]||0, spec.view[1]||0, spec.view[2]||0, 'ZYX'))
      : null;
    const visibleAtoms=o.visibleAtoms||(spec=>{
      const opt=new Set(spec.optH||[]), q=viewQuat(spec);
      const keep=spec.atoms.filter((_,i)=>!opt.has(i));
      if(!q) return keep;
      return keep.map(a=>{
        const v=new THREE.Vector3(a.pos[0],a.pos[1],a.pos[2]).applyQuaternion(q);
        return {el:a.el, pos:[v.x,v.y,v.z]};
      });
    });
    const rOf=el=>radii[el]||0.7;

    /* ---- per-species geometry, cached (asked per frame, a property of the spec) ---- */
    const mem=(fn)=>{ const c=new Map();
      return key=>{ if(c.has(key)) return c.get(key); const v=fn(key); c.set(key,v); return v; }; };
    const extent=(key,axis)=>{
      let lo=Infinity, hi=-Infinity;
      visibleAtoms(specOf(key)).forEach(a=>{ const R=rOf(a.el);
        lo=Math.min(lo,a.pos[axis]-R); hi=Math.max(hi,a.pos[axis]+R); });
      return isFinite(lo)?{lo,hi}:{lo:0,hi:0};
    };
    const shift=mem(key=>{ const e=extent(key,0); return (e.lo+e.hi)/2; });
    const lift =mem(key=>{ const e=extent(key,1); return (e.lo+e.hi)/2; });
    const top  =mem(key=>extent(key,1).hi);
    const bottom=mem(key=>extent(key,1).lo);

    /* EVENLY SPACED ABOUT THE CENTRE LINE, for any n. `spread` is the HALF
     * separation of a pair, so two lanes land on ∓spread exactly as they did
     * when this only ever handled one or two — glycolysis's split and the
     * cycle's join are unchanged to the pixel. What is new is that a lane count
     * is now a number rather than a case: fermentation stands a carrier beside
     * each of two substrates, which is four, and a page cannot open the shape
     * of this expression to add its own. */
    /* A THUNK IS ACCEPTED, and it is not a convenience. A page whose lanes hold
     * molecules of ONE size can pick a separation once; a page whose pair
     * changes between steps cannot, and picking the widest pair's gap leaves
     * every other step two small molecules at opposite edges of the frame with
     * nothing between them. Resolved per call, so the answer follows whatever
     * the page currently stands up. */
    const spreadOf=()=>typeof o.spread==='function'?o.spread():o.spread;
    const xOf=(i,n)=>n===1?0:(i-(n-1)/2)*(2*spreadOf()/(n-1));
    // where a lane's molecule actually SITS — every flight target must use this,
    // not xOf, or a group lands beside the atom it was aiming at
    const origin=(key,i,n)=>xOf(i,n)-shift(key);
    const base=key=>-lift(key);
    // Distance from settled height, mid-ease. Anything pinned in world Y (the
    // name plate) must add this or it un-sticks for the length of the settle.
    const offset=l=>l.g.userData.ty==null?0:l.g.position.y-l.g.userData.ty;
    // Where a shared label baseline goes, MEASURED WHERE THE MOLECULE IS DRAWN:
    // each species is recentred vertically, so the label comes down by the same
    // amount or it floats above nothing.
    const plateY=keys=>Math.max(...keys.map(k=>top(k)-lift(k)))+o.plateGap;
    // Label strip height in PIXELS, off a live label so restyling the type moves
    // the camera with it. This is what kit/fit.js reserves at the top.
    const heightPx=()=>{ const d=host.firstElementChild;
      return d ? d.getBoundingClientRect().height+o.plateGapPx+o.plateClearPx
               : o.fallbackPlatePx; };

    let lanes=[];
    const all=()=>lanes;

    function makePlate(spec){
      const d=document.createElement('div');
      d.className=plateClass;
      d.innerHTML=plateHTML(spec);
      host.appendChild(d);
      return d;
    }

    /* One lane: molecule + name plate. `topY` is passed in, never derived per
     * molecule — see the shared-baseline note in the header. */
    function spawn(key,i,n,topY){
      const spec=specOf(key);
      const g=o.build ? o.build(spec) : global.Stage.buildMolecule(spec);
      g.position.set(origin(key,i,n), base(key), 0);
      g.userData.ty=base(key);            // a TARGET; step() eases into it
      root.add(g);
      const plate=makePlate(spec);
      // Natural width, measured ONCE unconstrained — draw() cannot re-measure a
      // scaled element. BOTH spellings here: by draw time the plate carries
      // whichever is showing, so its live width answers the wrong question.
      const nameEl=plate.querySelector(nameSel);
      const {full,abbr}=label(spec);
      const natW=plate.offsetWidth;
      if(nameEl) nameEl.textContent=abbr;
      const shortW=plate.offsetWidth;
      if(nameEl) nameEl.textContent=full;
      return {g,key,plate,nameEl,topY,natW,shortW,full,abbr,showing:'full'};
    }

    function clear(){
      lanes.forEach(l=>{ root.remove(l.g); l.plate.remove(); });
      lanes=[];
    }

    /* Rebuild from a list of species. Carries the OUTGOING lanes' heights onto
     * the incoming ones so the swap frame moves nothing; one outgoing lane can
     * feed two incoming ones (the split), so the index is clamped. */
    function render(keys, topY, place){
      const fromY = lanes.length ? lanes.map(l=>l.g.position.y) : null;
      clear();
      const t = topY!=null?topY:plateY(keys);
      lanes = keys.map((k,j)=>spawn(k,j,keys.length,t));
      if(fromY) lanes.forEach((l,j)=>{ l.g.position.y=fromY[Math.min(j,fromY.length-1)]; });
      // A SPLIT is a render with a different starting arrangement: both halves
      // begin where the whole molecule stood and are eased outward, so six
      // carbons visibly BECOME 3 + 3 instead of cutting to a new layout. That is
      // a placement, not a second lane system — hence a hook rather than a
      // branch, and the lanes stay the module's either way (or `draw` has
      // nothing to label and `step` nothing to ease).
      if(place) lanes.forEach((l,j)=>place(l,j,lanes.length));
      return lanes;
    }
    // Land every lane on its target immediately. The parting is a render-loop
    // ease, so in a hidden tab it never ran — a step that finishes on the wall
    // clock must put the halves on their marks itself, or they come back stacked
    // on each other.
    function settle(){
      lanes.forEach(l=>{ const u=l.g.userData;
        if(u.tx!=null) l.g.position.x=u.tx;
        if(u.ty!=null) l.g.position.y=u.ty;
        if(u.tz!=null) l.g.position.z=u.tz; });
    }

    /* ONE LANE replaced in place — a per-lane step has no whole-state index to
     * rebuild from: half way through, one lane is the product and the other is
     * still the substrate. The shared baseline is re-solved over the MIXED
     * contents and handed to both, else the two names sit at different heights
     * while the step is half done. */
    function swapOne(j,key){
      const old=lanes[j], n=lanes.length;
      const keys=lanes.map((l,i)=>i===j?key:l.key);
      const t=plateY(keys);
      root.remove(old.g); old.plate.remove();
      const l=spawn(key,j,n,t);
      l.g.position.y=old.g.position.y;   // carry the height; step() eases the rest
      lanes[j]=l;
      lanes.forEach(x=>{ x.topY=t; });
      return l;
    }

    /* Per-frame settle. Deliberately per FRAME, not per second: these are
     * critically-damped follows chasing a target the same loop recomputes, and
     * their feel was tuned by eye. */
    const EASE=o.ease!=null?o.ease:0.10;
    function step(){
      lanes.forEach(l=>{ const u=l.g.userData;
        if(u.tx!=null) l.g.position.x+=(u.tx-l.g.position.x)*EASE;
        if(u.ty!=null) l.g.position.y+=(u.ty-l.g.position.y)*EASE;
        // A LANE IS NORMALLY FLAT AT z=0 and only `tz` moves it off that plane.
        // A molecule docking onto an atom has to, because the atom has a depth
        // and a lane parked in front of it only looks joined head-on.
        if(u.tz!=null) l.g.position.z+=(u.tz-l.g.position.z)*EASE; });
    }

    /* Project each anchor, park its label over it. `position.x` is read LIVE,
     * not from xOf(), so labels ride the halves apart during a split instead of
     * snapping to their final positions.
     * MUST RUN AFTER THE RENDER — kit/stagekit.js's `afterFrame`. */
    const projV=new THREE.Vector3();
    function draw(){
      if(!lanes.length) return;
      const w=canvas.clientWidth, h=canvas.clientHeight;
      camera.updateMatrixWorld();        // safe to call off-loop (restart, resize)
      const xs=lanes.map(l=>{
        // BOTH read live: topY is the settled anchor, but a lane eases into its
        // centring after a swap, so the label carries that offset or it waits at
        // the destination.
        projV.set(l.g.position.x, l.topY+offset(l), 0).project(camera);
        return {x:(projV.x*0.5+0.5)*w, y:(-projV.y*0.5+0.5)*h};
      });
      const budget = xs.length>1
        ? Math.max(90, Math.abs(xs[1].x-xs[0].x)-o.plateGapPxX)
        : Math.max(120, w-40);
      // ONE DECISION FOR BOTH LANES — widest name wins. No oscillation: `budget`
      // is the lanes' property, not the label's.
      const wide = lanes.every(l=>budget>=l.natW);
      lanes.forEach((l,i)=>{
        const want = wide?'full':'abbr';
        if(l.showing!==want){ if(l.nameEl) l.nameEl.textContent = wide?l.full:l.abbr;
                              l.showing=want; }
        // SHRINK, don't wrap: there is no space to break at, so wrapping chops a
        // name mid-word. Scaled about bottom-centre to stay anchored to the
        // molecule; the floor stops it becoming unreadable.
        const s=Math.max(o.minScale, Math.min(1, budget/Math.max(1, wide?l.natW:l.shortW)));
        l.plate.style.left=xs[i].x+'px';
        l.plate.style.top =xs[i].y+'px';
        l.plate.style.transform=`translate(-50%,-100%) scale(${s.toFixed(3)})`;
      });
    }

    return { all, spawn, clear, render, swapOne, settle, step, draw,
      shift, lift, top, bottom, xOf, origin, base, offset, plateY, heightPx,
      visibleAtoms, get lanes(){ return lanes; }, get SPREAD(){ return spreadOf(); } };
  }

  global.Lanes={create, DEFAULTS:DEF};
})(this);
