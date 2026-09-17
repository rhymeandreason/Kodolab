/* =============================================================================
 *  scene.js — shared 3D stage + molecule builder for the simulation pages
 * =============================================================================
 *  The boring-but-universal scaffolding every page re-implemented: renderer,
 *  scene, camera + orbit controls, studio lights, resize. Plus a clean molecule
 *  builder (materials + atom/bond/buildMolecule) for pages that assemble and
 *  transform molecules.
 *
 *  Loaded as a classic script AFTER three.min.js and molecules.js. Exposes
 *  window.Stage. Deliberately knows NOTHING about any particular lesson's
 *  physics — solvation (createWaterSim), pathways, membranes, etc. are built per
 *  page on top of this. See Modules.md for the architecture rationale.
 *
 *  Usage:
 *    const {scene,camera,renderer,root,cam,applyCam,resize}=Stage.create(canvas,{
 *      cam:{theta:0,phi:1.2,r:16}, onZoom:r=>..., onDrag:()=>...
 *    });
 *    const g = Stage.buildMolecule(MolLib.MOLECULES.glycine);   // atoms+bonds group
 *    root.add(g);  // ...then render camera each frame yourself
 * ========================================================================== */
(function(global){
  'use strict';
  const THREE=global.THREE;

  /* ---- material system (Standard by default; optional cel-shaded Toon) ---- */
  let toon=false;
  function setToon(b){ toon=!!b; }
  /* Atoms are MATTE. roughness .35 + a touch of metalness gave every sphere a
   * small hard highlight, and at these sizes that reads as wet plastic — worse,
   * on a big atom the hotspot competes with the element letter sitting right
   * next to it. Broad diffuse shading still says which atom is nearer, which is
   * the only job the lighting has here. */
  function atomMat(color){ return toon
    ? new THREE.MeshToonMaterial({color})
    : new THREE.MeshStandardMaterial({color,roughness:.92,metalness:0}); }
  function bondMat(color){ return toon
    ? new THREE.MeshToonMaterial({color})
    : new THREE.MeshStandardMaterial({color,roughness:.5}); }
  function glowMat(color,ei){ return toon
    ? Object.assign(new THREE.MeshToonMaterial({color,emissive:color}),{emissiveIntensity:ei})
    : new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:ei,roughness:.4}); }

  /* ---- geometry primitives ---- */
  const Rsphere=new THREE.SphereGeometry(1,32,24);
  // one atom sphere. `role` tags the mesh with its element so downstream code
  // (fx.js colorOf/popGlow, per-page recolouring) can find atoms vs. bonds.
  function atom(color,radius,pos,role){
    const m=new THREE.Mesh(Rsphere,atomMat(color));
    m.scale.setScalar(radius); if(pos)m.position.copy(pos);
    if(role) m.userData.role=role;
    return m;
  }
  // A double bond is two thinner sticks offset either side of the bond axis.
  // The offset and the ratio are here because placeBond() has to reproduce them
  // exactly: a re-placed pair drawn at a different gap is a different bond.
  const DOUBLE_OFF=0.15, DOUBLE_RAD=0.75;
  /* WHICH WAY the pair splays: perpendicular to the bond, in the plane the bond
     shares with a neighbouring atom `k` — so the two sticks read as two from the
     angle the rest of the group is drawn at. Null when a,b,k are collinear, and
     the caller picks an arbitrary perpendicular instead.
     One function, used at build AND on every frame of a conformational change:
     the plane a double bond is drawn in has to be the same one it is animated
     in, or the pair walks out of it as the molecule moves. */
  function doublePerp(a,b,k){
    const dir=new THREE.Vector3().subVectors(b,a).normalize();
    const other=new THREE.Vector3().subVectors(k,a).normalize();
    const norm=new THREE.Vector3().crossVectors(dir,other);
    if(norm.lengthSq()<0.001) return null;
    return new THREE.Vector3().crossVectors(norm,dir).normalize();
  }
  // one covalent stick (or pair for double bond) between two points.
  function bond(a,b,color,rad=0.14,order=1,perpHint=null){
    const dir=new THREE.Vector3().subVectors(b,a), len=dir.length();
    const normDir=dir.clone().normalize();
    if(order===2){
      const g=new THREE.Group();
      g.userData.role='covalent';
      let perp=perpHint?perpHint.clone():null;
      if(!perp || perp.lengthSq()<0.001){
        // A LINEAR molecule (CO2) has no neighbouring bond to define a plane, so
        // any perpendicular is geometrically arbitrary — but not visually. Offset
        // the pair ACROSS the view, not along it: crossing with +Z for a bond that
        // isn't already pointing at the camera splays the sticks vertically, so the
        // double bond reads as double from the default angle instead of hiding one
        // stick directly behind the other.
        const helper=Math.abs(normDir.z)<0.9?new THREE.Vector3(0,0,1):new THREE.Vector3(0,1,0);
        perp=new THREE.Vector3().crossVectors(normDir,helper);
      }
      perp.normalize();
      const offset=DOUBLE_OFF;
      const r2=rad*DOUBLE_RAD;
      [-offset, offset].forEach(off=>{
        const shift=perp.clone().multiplyScalar(off);
        const aOff=a.clone().add(shift);
        const m=new THREE.Mesh(new THREE.CylinderGeometry(r2,r2,len,16),bondMat(color));
        m.userData.role='covalent';
        m.position.copy(aOff).add(dir.clone().multiplyScalar(.5));
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),normDir);
        g.add(m);
      });
      return g;
    }
    const m=new THREE.Mesh(new THREE.CylinderGeometry(rad,rad,len,16),bondMat(color));
    m.userData.role='covalent';
    m.position.copy(a).add(dir.clone().multiplyScalar(.5));
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),normDir);
    return m;
  }

  /* ---- the structure style: half-coloured bonds, thicker sticks ---------
   * `bond` above is the LESSON style: one neutral covalent colour, thin, with
   * the spheres carrying the element. This is the other one, the convention
   * every published structure figure uses (PyMOL calls it half_bond_colors)
   * — one stick per bond, split at its midpoint, each half in its own atom's
   * colour. It reads better on a molecule drawn from DEPOSITED coordinates,
   * where there is no spec, no `optH` and often no hydrogens at all, so the
   * bond is doing more of the work of saying what the atoms are.
   *
   * Which style a page uses is a page decision and both are correct. Do not
   * mix them inside one molecule.
   *
   * STICK_RATIO is a RATIO and not a width, because these two styles are
   * drawn at two scales — a lesson works in MolLib's SCALE space and a
   * structure page in ångströms (Modules.md: display radii are
   * PALETTE.radii / SCALE, computed in the page). A stored width would be
   * right in one and wrong by 1.9x in the other. Multiply it by whatever
   * carbon's ball radius is in the space you are drawing in.
   *
   * The number itself: 0.38 against the lesson bond's 0.165 of a carbon.
   * A half-coloured stick has to be wide enough for two colours to be legible
   * along it, and at the lesson width the seam is the whole stick. */
  const STICK_RATIO = 0.38;
  function bondSplit(a, b, colorA, colorB, rad){
    const g=new THREE.Group();
    g.userData.role='covalent';
    const mid=a.clone().add(b).multiplyScalar(.5);
    g.add(bond(a, mid, colorA, rad));
    g.add(bond(mid, b, colorB, rad));
    return g;
  }

  // Clean molecule builder from a molecules.js spec. Tracks per-atom AND per-bond
  // meshes (each bond stamped with its atom `pair`) so a reaction can pull specific
  // atoms/bonds out later — e.g. the leaving –OH/–H of a peptide condensation.
  // Colours/radii come from MolLib.PALETTE. Pages layer their own userData
  // (hydration sites, peptide metadata, …) on top of what's returned here.
  function buildMolecule(spec, opts={}){
    const P=global.MolLib.PALETTE, state=P.atoms;
    const g=new THREE.Group();
    const atomMeshes=spec.atoms.map(a=>atom(state[a.el]||0x888888, P.radii[a.el]||0.7,
      new THREE.Vector3(a.pos[0],a.pos[1],a.pos[2]), a.el));
    const bondCol=opts.bondColor!=null?opts.bondColor:P.bonds.covalent;
    const bondMeshes=(spec.bonds||[]).map(bSpec=>{
      const i=bSpec[0], j=bSpec[1], order=bSpec[2]||1;
      const posI=new THREE.Vector3().fromArray(spec.atoms[i].pos);
      const posJ=new THREE.Vector3().fromArray(spec.atoms[j].pos);
      let perpHint=null, perpRef=null;
      if(order===2){
        const kBond=(spec.bonds||[]).find(b=>(b[0]===i||b[1]===i||b[0]===j||b[1]===j) && !(b[0]===i&&b[1]===j) && !(b[0]===j&&b[1]===i));
        if(kBond){
          const kIdx=[kBond[0],kBond[1]].find(idx=>idx!==i && idx!==j);
          if(kIdx!=null){
            perpHint=doublePerp(posI, posJ, new THREE.Vector3().fromArray(spec.atoms[kIdx].pos));
            if(perpHint) perpRef=kIdx;
          }
        }
      }
      const m=bond(posI, posJ, bondCol, 0.14, order, perpHint);
      // `perpRef` is the atom the pair's plane was taken from, kept so placeBond()
      // can recompute that plane from where the three atoms are NOW.
      m.userData.pair=[i,j]; m.userData.perpRef=perpRef; return m;
    });
    bondMeshes.forEach(m=>g.add(m));
    atomMeshes.forEach(m=>g.add(m));
    // YXZ, so a page that both leans and spins a molecule gets a turntable
    // rather than a tumble: the default XYZ composes as RX*RY, applying the spin
    // in the model's own frame and then leaning the spin axis over with it.
    // Harmless where only rotation.y is set, which is every other page today.
    g.rotation.order='YXZ';
    // opts.center puts the group's origin at the middle of the molecule so it
    // turns on the spot rather than orbiting its build origin. Opt-in: pages
    // that place molecules by their spec origin would shift if it were default.
    //
    // `true` centres on the bounding box. An explicit [x,y,z] centres on a point
    // the caller chooses — which is how a comparison page registers two
    // molecules against each other: centred on their own boxes, two specs that
    // differ by one atom have different boxes, so their SHARED skeleton lands in
    // slightly different places and the eye reads a shift that is not the
    // difference. Centring both on the part they have in common removes it.
    let center=null;
    if(opts.center){
      center=Array.isArray(opts.center)?opts.center:centerOf(spec);
      g.children.forEach(ch=>{ ch.position.x-=center[0]; ch.position.y-=center[1]; ch.position.z-=center[2]; });
    }
    // PRESENTATION ORIENTATION. `spec.view` is [x,y,z] radians saying which way
    // this molecule should face — the angle that makes a pyranose read as a 3/4
    // chair rather than a flat hexagon. It used to be baked into the atom
    // coordinates by Skel.rotate(), which meant the spec's numbers were a view
    // rather than the molecule, two specs could only share a view by copying
    // three constants, and a page could not ask for a different one.
    //
    // Applied to the MESHES, not to the group's rotation: the group's rotation
    // belongs to the page (idle spin, the user's drag), and composing the two
    // there is exactly the Euler-order trap that made molecules cartwheel.
    // Baking it here instead keeps that free, and keeps atom/bond meshes as
    // direct children so removeAtoms() and friends still work.
    //
    // WHICH LEAVES THE PAGE ONE OBLIGATION: that rotation is an OFFSET, and it
    // must be ZERO AT REST. A spec's `view:` is a declaration about how the
    // molecule should be seen; anything composed on top of it at rest means the
    // declared angle is one nobody ever sees, while the file still says
    // otherwise. contrast-lab.html holds to it by construction
    // (`rotation.y=spin` — 0 at rest); molecule-viewer.html broke it twice, and
    // is fixed by routing every opening angle through one function
    // (molview.js's defaultView) rather than by checking afterwards — a check
    // downstream of the spec derives its expectation from the same field it is
    // checking, so it cannot see a view that never arrived. CLAUDE.md carries
    // the rule.
    //
    // Pass opts.view to override, or null for the spec's canonical coordinates.
    const view = opts.view!==undefined ? opts.view : spec.view;
    if(view){
      // 'ZYX' composes as RZ*RY*RX, which is the order Skel.rotate() applied
      // when these were baked — so a migrated spec renders identically.
      const q=new THREE.Quaternion().setFromEuler(
        new THREE.Euler(view[0]||0, view[1]||0, view[2]||0, 'ZYX'));
      g.children.forEach(ch=>{
        ch.position.applyQuaternion(q);      // where it sits
        ch.quaternion.premultiply(q);        // and which way it points (bonds)
      });
    }
    g.userData={ spec, atomMeshes, bondMeshes, center,
      atomWorld:i=>atomMeshes[i].getWorldPosition(new THREE.Vector3()) };
    return g;
  }
  // Move an existing bond mesh onto a new pair of endpoints. A stick's LENGTH is
  // baked into its geometry, so a molecule whose atoms move (a conformational
  // change animated frame by frame, rather than a swap between two specs) needs
  // its bonds re-placed and re-stretched rather than rebuilt — rebuilding per
  // frame would churn geometries and materials at 60Hz.
  // A DOUBLE BOND NEEDS ITS PLANE PASSED IN. Its two sticks are offset either
  // side of the axis, and that direction is not recoverable from the endpoints
  // alone — so `perp` (doublePerp() against the neighbour `userData.perpRef`
  // names, at the positions of this frame) is required, and without it the pair
  // is left where it was. An unmoved double bond is the floating stick a
  // conformational change leaves behind when a caller forgets.
  // The group's own transform must be the identity: see flattenBonds().
  function placeBond(mesh,a,b,perp){
    if(mesh.isGroup) return placeDouble(mesh,a,b,perp);
    const dir=new THREE.Vector3().subVectors(b,a), len=dir.length();
    if(!len) return false;
    const base=mesh.geometry.parameters && mesh.geometry.parameters.height;
    mesh.position.copy(a).addScaledVector(dir,0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.clone().normalize());
    if(base) mesh.scale.y=len/base;
    return true;
  }
  const _Y=new THREE.Vector3(0,1,0);
  function placeDouble(g,a,b,perp){
    if(!perp || perp.lengthSq()<1e-6) return false;
    const dir=new THREE.Vector3().subVectors(b,a), len=dir.length();
    if(!len) return false;
    const nd=dir.clone().normalize();
    // Orthogonalise: doublePerp's answer is already square to the axis, but a
    // caller reusing a stale one is not, and a tilted pair reads as a bent bond.
    const p=perp.clone().addScaledVector(nd,-perp.dot(nd));
    if(p.lengthSq()<1e-6) return false;
    p.normalize();
    g.children.forEach((c,side)=>{
      const base=c.geometry.parameters && c.geometry.parameters.height;
      c.position.copy(a).addScaledVector(nd,len/2)
                        .addScaledVector(p,(side?1:-1)*DOUBLE_OFF);
      c.quaternion.setFromUnitVectors(_Y,nd);
      if(base) c.scale.y=len/base;
    });
    return true;
  }
  /* THE GROUP HAS ITS OWN TRANSFORM, and placing its children at molecule-space
     coordinates ignores it. buildMolecule centres a molecule (and applies
     `spec.view`) by shifting every direct child, so each double-bond group
     carries that offset while its two sticks keep the coordinates they were
     built at. Flatten the transform into the children ONCE before animating,
     and from then on the pair lives in the same frame as the atom meshes;
     without it every double bond sits off by exactly the centring offset.
     Idempotent, so a caller may flatten on every plan. */
  function flattenBonds(g){
    g.userData.bondMeshes.forEach(bm=>{
      if(!bm.isGroup) return;
      bm.children.forEach(c=>{ c.position.applyQuaternion(bm.quaternion).add(bm.position);
                               c.quaternion.premultiply(bm.quaternion); });
      bm.position.set(0,0,0); bm.quaternion.identity();
    });
    return g;
  }

  // remove atoms (and any bond touching them) from a built molecule — the leaving
  // group of a reaction. Nulls the atomMeshes slot so indices stay stable.
  function removeAtoms(g,idxs){
    const set=new Set(idxs), u=g.userData;
    idxs.forEach(i=>{ const m=u.atomMeshes[i]; if(m) g.remove(m); u.atomMeshes[i]=null; });
    u.bondMeshes=u.bondMeshes.filter(bm=>{
      if(bm.userData.pair.some(p=>set.has(p))){ g.remove(bm); return false; } return true; });
  }

  /* ---- presentation: how big a molecule is, and where to put the camera ----
   *
   *  Framing used to be a hand-tuned constant per page (`r:26`), guessed against
   *  one molecule at one viewport, and the extent maths behind it was copied
   *  between pages. Both belong here: how large a molecule is, and how far back
   *  you must stand to see it, are properties of the geometry and the lens — not
   *  decisions a lesson should have an opinion about.
   */

  // Bounding-box centre of a spec, INCLUDING display radii. This is the point to
  // spin about: a spec's coordinates sit around wherever its build started (a
  // ring's centre, a chain's first atom), which is not the middle of the
  // finished molecule, and turning about that makes it orbit rather than rotate.
  // Bounding box rather than mean atom position, which dense clusters of
  // hydrogens drag off-centre.
  function centerOf(spec){
    const P=global.MolLib.PALETTE.radii;
    const lo=[Infinity,Infinity,Infinity], hi=[-Infinity,-Infinity,-Infinity];
    spec.atoms.forEach(a=>{ const R=P[a.el]||0.7;
      for(let k=0;k<3;k++){ lo[k]=Math.min(lo[k],a.pos[k]-R); hi[k]=Math.max(hi[k],a.pos[k]+R); } });
    return lo.map((v,k)=>(v+hi[k])/2);
  }

  // How much room a molecule needs, measured about its own centre.
  //
  //   rxz    horizontal radius about the vertical spin axis — the extent that
  //          matters once it is turning, because a turntable sweeps a CYLINDER,
  //          not a sphere. Framing the sphere (the obvious first guess) treats
  //          the tallest point as though it could also swing out sideways, and
  //          costs roughly a third of the molecule's size on screen.
  //   hy     half-height, which a vertical spin never changes.
  //   radius full 3D radius — for anything tumbling on more than one axis.
  //   span   widest heavy-atom centre separation in REAL angstroms (the display
  //          scale divided out), i.e. the figure an instrument would agree with.
  //          Heavy atoms only: an -OH is a free rotor, so counting its hydrogen
  //          reports how the spec happens to be drawn, not how big it is.
  // Measured AS BUILT, which means the spec's `view` is applied first. Skipping
  // that reports the extents of a differently-oriented molecule: a pyranose
  // turned face-on is much taller than the same ring seen edge-on, so the camera
  // frames the wrong shape and captions placed at ±hy land on top of the model.
  // opts.view overrides, matching buildMolecule's option of the same name.
  function measure(spec, opts={}){
    const P=global.MolLib.PALETTE.radii;
    const O=opts.center||centerOf(spec);
    const skip=new Set(opts.skip||[]);
    const view = opts.view!==undefined ? opts.view : spec.view;
    const q = view ? new THREE.Quaternion().setFromEuler(
      new THREE.Euler(view[0]||0, view[1]||0, view[2]||0, 'ZYX')) : null;
    const v=new THREE.Vector3();
    let rxz=0, hy=0, radius=0;
    spec.atoms.forEach((a,i)=>{
      if(skip.has(i)) return;
      const R=P[a.el]||0.7;
      v.set(a.pos[0]-O[0], a.pos[1]-O[1], a.pos[2]-O[2]);
      if(q) v.applyQuaternion(q);
      const x=v.x, y=v.y, z=v.z;
      rxz=Math.max(rxz, Math.hypot(x,z)+R);
      hy =Math.max(hy,  Math.abs(y)+R);
      radius=Math.max(radius, Math.hypot(x,y,z)+R);
    });
    const heavy=spec.atoms.filter(a=>a.el!=='H');
    let span=0;
    for(let i=0;i<heavy.length;i++)
      for(let j=i+1;j<heavy.length;j++){
        const a=heavy[i].pos, b=heavy[j].pos;
        span=Math.max(span, Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]));
      }
    return { rxz, hy, radius, span:span/(global.MolLib.SCALE||1.9), center:O };
  }

  // Solve the camera distance that fits `boxes`, instead of guessing a constant.
  //
  //   boxes  [{x,y,rxz,hy}]  each item's centre and half-extents (from measure)
  //   opts   {pad, top, bottom, min, max}  pad is slack (1.12 = 12%);
  //          top/bottom reserve world-space bands for captions above/below.
  //
  // Solved per AXIS against the real frustum, not as one circumscribing radius:
  // a row of molecules is far wider than it is tall, and fitting its bounding
  // circle pulls back far enough to show empty space above and below. The
  // horizontal half-angle shrinks with aspect < 1, so the tighter axis wins —
  // which is why a constant tuned on a wide monitor crops on a laptop.
  function frame(camera, cam, boxes, opts={}){
    const o=Object.assign({pad:1.12, top:0, bottom:0, min:6, max:220}, opts);
    if(!boxes.length || !isFinite(camera.aspect) || !camera.aspect) return cam.r;
    const hw=Math.max(...boxes.map(b=>Math.abs(b.x||0)+b.rxz));
    const hh=Math.max(...boxes.map(b=>Math.max( (b.y||0)+b.hy+o.top,
                                               -(b.y||0)+b.hy+o.bottom)));
    // An orthographic camera's apparent size comes from the frustum's
    // half-extents, not from standing distance — there is no fov to solve a
    // `d` against, so fit left/right/top/bottom directly instead of cam.r.
    if(camera.isOrthographicCamera){
      const halfH=Math.max(hh, hw/camera.aspect)*o.pad;
      camera.top=halfH; camera.bottom=-halfH;
      camera.left=-halfH*camera.aspect; camera.right=halfH*camera.aspect;
      camera.updateProjectionMatrix();
      return cam.r;
    }
    const tan=Math.tan(camera.fov*Math.PI/360);
    const d=Math.max(hh/tan, hw/(tan*camera.aspect))*o.pad;
    cam.r=Math.max(o.min, Math.min(o.max, d));
    return cam.r;
  }

  /* ---- the stage: renderer + scene + camera + orbit + resize ---- */
  // opts: cam {theta,phi,r} initial · turn:'trackball' for pole-free rotation
  //       · phiMin/phiMax pitch clamp (turntable only) · rMin/rMax zoom
  // clamp · wheel step per mouse detent · zoom:false drops wheel zoom entirely · onZoom(r) /
  // onDrag() side-effect hooks (per-page state)
  // · ortho:true swaps in an OrthographicCamera — no perspective foreshortening,
  //   so a shape read off one side of the frame is the same size as the same
  //   shape read off the other. `frame()` fits its frustum directly; `cam.r`
  //   still only sets standing distance (harmless for an ortho camera, never
  //   drives apparent size).
  function create(canvas, opts={}){
    const o=Object.assign({ phiMin:0.25, phiMax:2.85, rMin:5, rMax:60, wheel:0.08,
      onZoom:null, onDrag:null }, opts);
    const camInit=Object.assign({theta:0.5,phi:1.15,r:9}, opts.cam||{});

    // antialias defaults ON and every lesson leaves it there. It is an option
    // only because it is a context-CREATION attribute — WebGL will not change
    // it on a live context — so a page that wants to measure what MSAA costs
    // on a weak GPU has no way to ask for it after the fact.
    // `opts.antialias:false` is that ask; see hemoglobin/crowd-test.html.
    const renderer=new THREE.WebGLRenderer(
      {canvas,antialias:o.antialias!==false,alpha:true});
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    const scene=new THREE.Scene();
    // An ortho camera's standing distance is not its framing, and frame()
    // writes cam.r as the frustum HALF-HEIGHT — so the camera ends up parked
    // roughly one molecule-radius away. With a near plane at 0.1 the front of
    // a spinning molecule crosses it and is sliced open. Depth range is free
    // under ortho (no perspective divide), so it spans the origin instead.
    const camera=o.ortho
      ? new THREE.OrthographicCamera(-1,1,1,-1,-2000,2000)
      : new THREE.PerspectiveCamera(45,1,0.1,1000);
    const root=new THREE.Group(); scene.add(root);

    scene.add(new THREE.AmbientLight(0xffffff,.55));
    // Lights parented to the camera so they travel with the view: orbiting reads
    // as rotating the MODEL under a fixed studio light — highlights stay put on
    // screen instead of sweeping across the molecules.
    scene.add(camera);
    const keyL=new THREE.DirectionalLight(0xffffff,.9); keyL.position.set(4,6,8);
    const fillL=new THREE.DirectionalLight(0x88aaff,.4); fillL.position.set(-6,-2,-4);
    camera.add(keyL,keyL.target,fillL,fillL.target);

    const cam={theta:camInit.theta,phi:camInit.phi,r:camInit.r,target:new THREE.Vector3(0,0,0)};

    // TRACKBALL vs TURNTABLE, and why a viewer wants the first.
    //
    // theta/phi is a turntable: the world has an up axis, the camera swings
    // around it, and phi has to be clamped short of the poles or the view
    // flips over as sin(phi) changes sign. That clamp is what a drag "getting
    // stuck" is — at 0.008 rad per pixel the default range is about 100 px of
    // upward travel, which on a page whose subject is a SHAPE runs out
    // exactly when someone is trying to look at the top of it.
    //
    // A trackball has no up axis and no poles: each drag turns the view about
    // axes in the CAMERA's own frame and composes onto what came before, so
    // the molecule keeps rolling in whatever direction the hand moves. That
    // is what every molecular viewer does, and what a page examining one
    // structure wants. It is opt-in because a lesson with a composed framing
    // usually does not: `turn:'trackball'`.
    //
    // cam.q is seeded FROM theta/phi so a page reads the same either way, and
    // theta/phi stop being meaningful the moment a trackball drag lands. Zoom
    // still writes cam.r, which is why the offset is rebuilt from it here.
    cam.q=new THREE.Quaternion();
    const seedQ=()=>{
      const m=new THREE.Matrix4().lookAt(
        new THREE.Vector3(
          Math.sin(cam.phi)*Math.sin(cam.theta),
          Math.cos(cam.phi),
          Math.sin(cam.phi)*Math.cos(cam.theta)),
        new THREE.Vector3(0,0,0), new THREE.Vector3(0,1,0));
      cam.q.setFromRotationMatrix(m);
    };
    seedQ();
    // A caller that writes theta/phi directly (a box seeding a canonical view)
    // has to say so, because in trackball mode cam.q is the authority and
    // theta/phi are only its seed.
    cam.seed=seedQ;

    function applyCam(){
      if(o.turn==='trackball'){
        camera.position.copy(cam.target).add(
          new THREE.Vector3(0,0,cam.r).applyQuaternion(cam.q));
        camera.up.set(0,1,0).applyQuaternion(cam.q);
        camera.lookAt(cam.target);
        return;
      }
      camera.position.set(
        cam.target.x+cam.r*Math.sin(cam.phi)*Math.sin(cam.theta),
        cam.target.y+cam.r*Math.cos(cam.phi),
        cam.target.z+cam.r*Math.sin(cam.phi)*Math.cos(cam.theta));
      camera.lookAt(cam.target);
    }
    // Camera orbit. `orbit:'pan'` drags the view flat instead. Pages pass `orbit:false` when dragging should turn the MODELS
    // instead of swinging the camera — a comparison page showing two molecules
    // side by side must not orbit, because orbiting puts one of them nearer the
    // camera than the other and perspective then magnifies it. Those pages take
    // the pointer themselves; wheel zoom stays either way.
    let drag=null;
    // Live touch points, kept whatever `orbit` says: a two-finger pinch on a
    // touchscreen is a zoom gesture, and the zoom block below reads this map.
    const pts=new Map(); let pinchD=0;
    if(o.orbit!==false){
      // preventDefault stops the browser starting a TEXT SELECTION on the same
      // drag — the site sheet also sets user-select:none on #stage, and both
      // are wanted: the CSS covers pages that take the pointer themselves
      // (orbit:false, where this handler does not exist), this covers a drag
      // that begins on the canvas and sweeps out of the stage entirely.
      canvas.addEventListener('pointerdown',e=>{e.preventDefault();
        drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
      // A second finger down ends the orbit rather than fighting it: the hand
      // is now asking for a scale, and orbiting off whichever finger happens to
      // be `drag` swings the camera through the pinch.
      canvas.addEventListener('pointermove',e=>{ if(!drag||pts.size>1)return;
        if(o.onDrag)o.onDrag();
        const dx=e.clientX-drag.x, dy=e.clientY-drag.y;
        if(o.orbit==='pan'){
          // `orbit:'pan'` slides the target in the view plane, for a flat
          // scene with nothing to turn. One pixel moves one pixel's worth of
          // world at the target's depth, so the scene tracks the pointer.
          const V=THREE.Vector3, h=canvas.clientHeight||1;
          const k=camera.isPerspectiveCamera
            ? 2*cam.r*Math.tan(camera.fov*Math.PI/360)/h
            : (camera.top-camera.bottom)/camera.zoom/h;
          const right=new V().setFromMatrixColumn(camera.matrixWorld,0);
          const up=new V().setFromMatrixColumn(camera.matrixWorld,1);
          cam.target.addScaledVector(right,-dx*k).addScaledVector(up,dy*k);
        } else if(o.turn==='trackball'){
          // Composed in the camera's own frame (multiply, not premultiply), so
          // the axes turn with the view and there is nothing to clamp.
          const k=0.008, Q=THREE.Quaternion, V=THREE.Vector3;
          cam.q.multiply(new Q().setFromAxisAngle(new V(0,1,0),-dx*k))
               .multiply(new Q().setFromAxisAngle(new V(1,0,0),-dy*k));
        } else {
          cam.theta-=dx*0.008;
          cam.phi=Math.max(o.phiMin,Math.min(o.phiMax,cam.phi-dy*0.008));
        }
        drag={x:e.clientX,y:e.clientY}; applyCam();});
      canvas.addEventListener('pointerup',()=>drag=null);
    }
    // `zoom:false` leaves the wheel to the browser. A lesson whose framing is
    // SOLVED — one scale for a whole pathway, so a shape's size is a claim about
    // the molecule — has nothing to offer a zoom but a way to falsify that, and
    // the page eases back to the solved distance anyway, so a scroll read as the
    // camera fighting the student.
    // deltaY carries a MAGNITUDE: a mouse sends one ~100px detent, a trackpad
    // sends a stream of few-pixel deltas. Reading only its sign made every one
    // of those a full detent, so a two-finger swipe slammed r into its clamp.
    // Scale by the delta instead, normalise the line/page modes Firefox and
    // Safari can send, and cap one event at a detent so a flung trackpad or a
    // coarse mouse still steps rather than jumps.
    const DETENT=100;                       // px of deltaY per mouse detent
    // One place the distance changes, so wheel, trackpad pinch and touch pinch
    // cannot drift apart in feel or in what they tell the page. `f` is a ratio:
    // multiplying (never adding) is what makes a gesture and its reverse cancel.
    function zoomBy(f){
      const r=Math.max(o.rMin,Math.min(o.rMax,cam.r*f));
      if(r===cam.r)return; cam.r=r; if(o.onZoom)o.onZoom(r); applyCam();
    }
    /* THE ZOOM CLAMP IS RELATIVE TO WHAT IS ON SCREEN, and rMin/rMax at create
       are only the default for a caller who knows its subject's size by then.
       A caller that does not — a box fed a structure after the fact — retunes
       here, because a clamp tighter than the framing distance is a trap the
       reader falls into and cannot climb out of: 1DFJ frames at 63 against the
       default rMax of 60, so the first wheel event snapped it CLOSER than it
       opened and no amount of zooming out ever came back. */
    function setZoomLimits(min,max){
      if(isFinite(min)) o.rMin=min;
      if(isFinite(max)) o.rMax=max;
      const r=Math.max(o.rMin,Math.min(o.rMax,cam.r));
      if(r!==cam.r){ cam.r=r; applyCam(); }
    }
    if(o.zoom!==false){
      canvas.addEventListener('wheel',e=>{e.preventDefault();
        // A trackpad pinch arrives as a wheel event with ctrlKey set — the same
        // event the browser would have used to zoom the PAGE. Its deltas are
        // small and continuous, so they get their own gain and skip the detent
        // quantising that exists for a mouse.
        if(e.ctrlKey){ zoomBy(Math.exp(Math.max(-.15,Math.min(.15,e.deltaY*.01)))); return; }
        const px=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?DETENT*4:1);
        const detents=Math.max(-1,Math.min(1,px/DETENT));
        // exponential so zoom-in and zoom-out of the same swipe cancel exactly
        zoomBy(Math.exp(detents*o.wheel));},{passive:false});

      // Safari on macOS answers a trackpad pinch with these non-standard gesture
      // events as well as the ctrl-wheel above; `e.scale` is cumulative from the
      // gesture's start, so the ratio between frames is what applies.
      let gScale=1;
      canvas.addEventListener('gesturestart',e=>{e.preventDefault();gScale=1;});
      canvas.addEventListener('gesturechange',e=>{e.preventDefault();
        if(e.scale>0){ zoomBy(gScale/e.scale); gScale=e.scale; }});
      canvas.addEventListener('gestureend',e=>e.preventDefault());
    }

    // Touchscreen pinch. Tracked here rather than in the orbit block because a
    // page that took the pointer itself (orbit:false) still wants two fingers to
    // scale, and touch-action:none in the CSS is what stops the browser eating
    // the second finger.
    canvas.style.touchAction='none';        // or the browser scrolls/zooms instead
    const span=()=>{const [a,b]=[...pts.values()];return Math.hypot(a.x-b.x,a.y-b.y);};
    canvas.addEventListener('pointerdown',e=>{
      if(e.pointerType!=='touch')return;
      pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(pts.size===2) pinchD=span();
    });
    canvas.addEventListener('pointermove',e=>{
      if(e.pointerType!=='touch'||!pts.has(e.pointerId))return;
      pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(pts.size!==2||!pinchD)return;
      const d=span(); if(!d)return;
      if(o.zoom!==false) zoomBy(pinchD/d); pinchD=d;
    });
    const lift=e=>{ if(pts.delete(e.pointerId)) pinchD=0; };
    canvas.addEventListener('pointerup',lift);
    canvas.addEventListener('pointercancel',lift);

    // Bail on a zero-sized canvas instead of computing w/0. A ResizeObserver
    // fires during layout, and a grid item is briefly 0px tall before its row is
    // resolved — one such frame set camera.aspect to NaN, which poisons the
    // projection matrix and makes every subsequent project()/unproject() return
    // NaN until the next real resize happens to arrive. Pages that fit their
    // camera from camera.aspect then silently frame against a garbage number.
    function resize(){ const w=canvas.clientWidth,h=canvas.clientHeight;
      if(!w||!h) return;
      renderer.setSize(w,h,false); camera.aspect=w/h;
      /* An ortho camera has no fov for `aspect` to reach, so a resize that only
       * sets it leaves the frustum at the OLD aspect and the scene stretches
       * until something calls frame() again. Hold the half-height the caller
       * chose and rewrite the width from the new aspect. */
      if(camera.isOrthographicCamera){
        const halfH=camera.top;
        camera.left=-halfH*camera.aspect; camera.right=halfH*camera.aspect;
      }
      camera.updateProjectionMatrix(); }
    new ResizeObserver(resize).observe(canvas);
    applyCam();
    return {scene,camera,renderer,root,cam,applyCam,resize,setZoomLimits};
  }

  // Show/hide a spec's OPTIONAL hydrogens — the nonpolar C–H's listed in
  // spec.optH. Unlike removeAtoms this only flips `visible`, so it is fully
  // reversible and does not disturb atoms a REACTION has already removed (the
  // peptide bond deletes the leaving –OH and one amino H; a rebuild would
  // resurrect them). An H on N/O/S is never in optH: those are the H-bond
  // donors, so hiding them would hide the lesson.
  function setOptionalH(g,show){
    const spec=g.userData.spec, opt=spec&&spec.optH;
    if(!opt||!opt.length) return;
    const set=new Set(opt);
    opt.forEach(i=>{ const m=g.userData.atomMeshes[i]; if(m) m.visible=show; });
    g.userData.bondMeshes.forEach(bm=>{
      if(bm.userData.pair.some(p=>set.has(p))) bm.visible=show; });
  }

  global.Stage={ create, setToon, atomMat, bondMat, glowMat, atom, bond,
    bondSplit, STICK_RATIO,
    buildMolecule, removeAtoms, setOptionalH, placeBond, doublePerp, flattenBonds,
    measure, frame, centerOf,
    Rsphere, get toon(){return toon;} };
})(this);
