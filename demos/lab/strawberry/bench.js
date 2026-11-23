/* The bench for Strawberry DNA, built from Lab props. Every pose is a pure
 * function of the experiment clock t (0..6, one unit per original step), as in
 * the original lab (/Strawberry/js/lab.js), so the lesson can replay and jump.
 *
 *   const B = buildBench(mat, root);
 *   B.pose(t);          // when t changes: positions, levels, colours
 *   B.tick(t, time);    // every frame: streams, drips, bubbles, pulp (it follows hover lift)
 *
 * Timings follow the original, with two changes so every click ends at rest:
 * the buffer pour is a little quicker (done by 2.68, before mixing at 2.7) and
 * the funnel is out of the way by 4.14 (before the alcohol pour at 4.15).
 */
import * as THREE from 'three';
import {
  V3, Q, clamp, lerp, Ease, seeded,
  makeBench, makeBeaker, makeWasteBin, makeJar, makeSqueezeBottle,
  makeStrawberry, makeCalyx, STRAWBERRY_H as BH, strawberrySeed,
  makeZipBag, makeTestTube, makeTubeRack, makeFunnel, makePlate, makeBowl,
  makeReagentBottle, makeIceBath, makeSkewer, makeDnaPrecipitate, makeStream, makeBubbles, mesh, T,
} from '../lab.js';

const linear = (k) => k;
const ph = (t, a, b, ease = Ease.inOut) => ease(clamp((t - a) / (b - a)));
const win = (t, a, b, c, d) => ph(t, a, b) * (1 - ph(t, c, d));
const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
const srgb = (hex) => lin(hex).getHex();
const X = V3(1, 0, 0), Y = V3(0, 1, 0), Z = V3(0, 0, 1);

// Layout (cm, bench top at y = 0)
export const POS = {
  plate: V3(-2, 0, 10), bag: V3(-12, 0, 1), beaker: V3(-26, 0, 7), soap: V3(-31.5, 0, -1),
  salt: V3(-31, 0, 15), rack: V3(11, 0, 1), cup: V3(-4, 0, -13), ice: V3(21, 0, -5),
  skewer: V3(25, 0.17, 12.5), bowl: V3(-24, 0, -9),
};
const TUBE_Y = 1.0;
const FILTRATE = 0.42, ALC = 0.72;

export function buildBench(mat, root) {
  const tmp = V3(), tmp2 = V3(), tmpQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4(), tmpS = V3();
  const qI = new THREE.Quaternion();
  const hidden = V3(0, -999, 0), zeroS = V3(0, 0, 0);
  const BAG_JUICE = new THREE.Color();
  const add = (p, pos, ry = 0, s = 1) => { p.group.position.copy(pos); p.group.rotation.y = ry; p.group.scale.setScalar(s); root.add(p.group); return p; };

  root.add(makeBench(mat).group);

  // ----- plate, berry, calyx, bowl -----
  // The props' default colours (sage plate, cornflower bowl, amber rack...) came
  // from this lab: no plain white props, so each reads apart on the bench.
  const plate = add(makePlate(mat), POS.plate);
  const bowl = add(makeBowl(mat), POS.bowl);
  [[-1.2, 1.9, 0.6, 1.3, 0.4], [1.4, 1.9, -0.4, 1.0, 2.2], [0.1, 2.6, -1.6, 1.6, 4.0]].forEach((b, i) => {
    const s = makeStrawberry(mat, { seed: 77 + i * 13, calyx: true });
    const o = new THREE.Group();
    s.group.position.y = -BH * 0.5;
    o.add(s.group);
    o.position.set(b[0], b[1], b[2]);
    o.rotation.set(b[3], b[4], 1.4);
    bowl.group.add(o);
  });

  const berry = new THREE.Group();
  const berryOrient = new THREE.Group();
  berryOrient.rotation.set(0, 0.5, Math.PI / 2);
  const berryProp = makeStrawberry(mat, { seed: 5 });
  berryProp.group.position.y = -BH * 0.5;
  berryOrient.add(berryProp.group);
  berry.add(berryOrient);
  root.add(berry);
  const BERRY_PLATE = POS.plate.clone().add(V3(0, 2.05, 0));
  berry.position.copy(BERRY_PLATE);
  berry.updateMatrixWorld(true);
  const calAttachPos = berryProp.group.localToWorld(berryProp.anchors.top.clone());
  const calAttachQ = berryOrient.getWorldQuaternion(new THREE.Quaternion());
  const calyx = makeCalyx(mat, { seed: 6 });
  root.add(calyx.group);
  const calRemovedPos = POS.plate.clone().add(V3(-6.3, 0, 2.4));
  calRemovedPos.y = -calyx.minY + 0.05; // rest the drooping tips on the bench
  const calRemovedQ = new THREE.Quaternion().setFromAxisAngle(Y, 0.7);

  // ----- zip-top bag -----
  const bag = makeZipBag(mat);
  const bagHomeQ = new THREE.Quaternion().setFromAxisAngle(Y, 0.12);
  bag.group.position.copy(POS.bag);
  bag.group.quaternion.copy(bagHomeQ);
  root.add(bag.group);

  // ----- buffer beaker, soap, salt -----
  const BK_H = 8.6;
  const beaker = add(makeBeaker(mat, { r: 3.2, h: BK_H, level: 6, cap: 250, ...T.props.beaker, liquidColor: 0xbfe2f5 }), POS.beaker);
  const soap = add(makeSqueezeBottle(mat), POS.soap, 0.4, 0.62);
  const salt = add(makeJar(mat, { ingredient: 'salt' }), POS.salt, 0.3, 0.62);

  // ----- rack, tubes, funnel, waste bin -----
  const rack = add(makeTubeRack(mat), POS.rack);
  const tube = add(makeTestTube(mat), V3(POS.rack.x, TUBE_Y, POS.rack.z));
  add(makeTestTube(mat), V3(POS.rack.x - 3.6, TUBE_Y, POS.rack.z));
  tube.group.updateMatrixWorld(true);
  const JUICE = srgb('#e3346a');                 // strained strawberry juice
  const filtrate = tube.addLayer(JUICE, 0.9);
  const alcohol = tube.addLayer(0xc9e3fb, 0.42);
  const levelY = (f) => tube.levelY(f);
  const tubeTop = TUBE_Y + tube.h;
  const interfaceY = levelY(FILTRATE);

  const funnel = makeFunnel(mat);
  const FUNNEL_HOME = V3(POS.rack.x, 12.0, POS.rack.z);
  const FUNNEL_CUP = V3(POS.cup.x, 2.6, POS.cup.z); // stem down inside the bin
  funnel.group.position.copy(FUNNEL_HOME);
  root.add(funnel.group);
  const cup = add(makeWasteBin(mat, { label: T.props.waste, symbol: null }), POS.cup, 0.2);

  // ----- ice bath, alcohol bottle, skewer -----
  const ice = add(makeIceBath(mat), POS.ice);
  const bottle = makeReagentBottle(mat);
  const BOTTLE_HOME = POS.ice.clone().add(V3(0, 0.3, 0));
  bottle.group.position.copy(BOTTLE_HOME);
  root.add(bottle.group);

  const skewer = makeSkewer(mat);
  const SKEW_Q = new THREE.Quaternion().setFromAxisAngle(Z, Math.PI / 2).premultiply(new THREE.Quaternion().setFromAxisAngle(Y, -0.08));
  skewer.group.position.copy(POS.skewer);
  skewer.group.quaternion.copy(SKEW_Q);
  root.add(skewer.group);

  const dna = makeDnaPrecipitate(mat);
  root.add(dna.group);

  // ----- strawberry pulp (instanced, world space) -----
  const R = seeded(1234);
  const rdir = (out = V3()) => { const u = R() * 2 - 1, a = R() * Math.PI * 2, s = Math.sqrt(1 - u * u); return out.set(s * Math.cos(a), u, s * Math.sin(a)); };
  const CH = 70, SD = 50;
  const chunkGeo = new THREE.IcosahedronGeometry(0.5, 1);
  {
    const p = chunkGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      tmp.fromBufferAttribute(p, i);
      tmp.multiplyScalar(1 + 0.25 * Math.sin(tmp.x * 9.1 + tmp.y * 5.3 + tmp.z * 7.7));
      p.setXYZ(i, tmp.x, tmp.y, tmp.z);
    }
    chunkGeo.computeVertexNormals();
  }
  const chunks = new THREE.InstancedMesh(chunkGeo, new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, clearcoat: 0.6 }), CH);
  const pulpSeeds = new THREE.InstancedMesh(strawberrySeed.geometry, new THREE.MeshStandardMaterial({ color: strawberrySeed.color, roughness: 0.6 }), SD);
  chunks.frustumCulled = pulpSeeds.frustumCulled = false;
  chunks.castShadow = true;
  root.add(chunks, pulpSeeds);
  const pulp = [];
  const cRed = ['#b80f2c', '#d42343', '#e04560', '#c9304d', '#9e0c25', '#eb7085'].map(lin);
  for (let i = 0; i < CH + SD; i++) {
    const isSeed = i >= CH;
    const cl = bag.anchors.floor.clone().add(rdir().multiplyScalar(R() * 1.3).multiply(V3(1, 0.7, 1.2)));
    const a = R() * Math.PI * 2, rr = Math.sqrt(R());
    const sp = V3(Math.cos(a) * rr * 4.2, isSeed ? 0.45 + R() * 0.5 : 0.35 + R() * 0.7, Math.sin(a) * rr * 4.8 + 0.4);
    const s = isSeed ? 1 : 0.55 + R() * 0.75;
    // resting in the filter: keep each piece (radius ~0.6 s) inside the cone, whose
    // inner radius is about 0.42 + (y - 3.4) * 0.69 above the funnel's stem
    const hh = 4.2 + R() * 1.9;
    const room = Math.max(0, 0.42 + (hh - 3.4) * 0.69 - (isSeed ? 0.15 : 0.62 * s) - 0.12);
    const cr = room * Math.sqrt(R());
    const fa = R() * Math.PI * 2;
    const fl = V3(Math.cos(fa) * cr, hh, Math.sin(fa) * cr);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(R() * 6, R() * 6, R() * 6));
    pulp.push({ isSeed, idx: isSeed ? i - CH : i, cl, sp, fl, q, s, delay: R(), ph: R() * 6, spin: V3(R() - 0.5, R() - 0.5, R() - 0.5).normalize() });
    if (!isSeed) chunks.setColorAt(i, cRed[Math.floor(R() * cRed.length)]);
  }
  chunks.instanceColor.needsUpdate = true;

  // ----- streams, drips, bubbles -----
  const streamBuffer = makeStream(mat, root, { color: 0xbfe2f5 });
  const streamBag = makeStream(mat, root, { color: 0xd9466a });
  const streamAlc = makeStream(mat, root, { color: 0xe5f3ff });
  const DRIPS = 5;
  const drips = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), mat.make.liquid(JUICE, 0.9), DRIPS);
  drips.frustumCulled = false; drips.renderOrder = 1;
  root.add(drips);
  const bubbles = makeBubbles(mat, root, { count: 16 });

  /* ---------- helpers ---------- */
  const _q = new THREE.Quaternion(), _p = V3();
  function pourPose(obj, homePos, baseQ, spoutLocal, target, axis, angle, kMove, kTilt, arc) {
    _q.setFromAxisAngle(axis, angle * kTilt).multiply(baseQ);
    _p.copy(spoutLocal).applyQuaternion(_q);
    const posed = target.clone().sub(_p);
    obj.position.lerpVectors(homePos, posed, kMove);
    obj.position.y += Math.sin(Math.PI * kMove) * arc;
    obj.quaternion.copy(_q);
  }
  const BK_TARGET = V3(POS.bag.x - 2.0, 8.5, POS.bag.z + 1.5);
  const BAG_TARGET = V3(POS.rack.x - 0.2, 22.5, POS.rack.z + 0.2);
  const BT_TARGET = V3(POS.rack.x + 0.75, tubeTop + 1.3, POS.rack.z);
  const SK_ABOVE = V3(POS.rack.x, tubeTop + 2.5, POS.rack.z);
  const SK_IN = V3(POS.rack.x, interfaceY + 0.6, POS.rack.z);
  const SK_OUT = V3(POS.rack.x - 0.6, tubeTop + 3.0, POS.rack.z + 1.4);
  const SK_TILT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.45, 0, 0.25));
  const DNA_HOME = V3(POS.rack.x, interfaceY + 0.6, POS.rack.z);

  // what pose() works out and tick() needs
  const P = { t: -1, bagLevel: 0, bagTilt: 0, T: 0.5, bkLevel: 0, bkTilt: 0, btLevel: 0.8, btTilt: 0, fl: 0, aTopY: 0, fTopY: 0, wind: 0, appear: 0 };

  /* Pulp: world-space instances placed from the bag and the funnel. Re-placed from tick()
   * whenever either moves (the hover lift), so the mush lifts with the funnel and filter. */
  function placePulp(t) {
    const { squish, mix, T } = P;
    bag.group.updateMatrixWorld(true); funnel.group.updateMatrixWorld(true);
    const transfer = ph(t, 3.3, 3.64, linear);
    const sAppear = ph(t, 1.45, 1.85);
    const spread = ph(t, 1.5, 1.92);
    const bagOpenW = bag.group.localToWorld(V3().copy(bag.anchors.spout));
    for (const c of pulp) {
      const target = c.isSeed ? pulpSeeds : chunks;
      if (sAppear <= 0.001) { target.setMatrixAt(c.idx, tmpM.compose(hidden, qI, zeroS)); continue; }
      tmp.lerpVectors(c.cl, c.sp, spread);
      const jig = squish * 0.25 + mix * 0.2;
      tmp.x += Math.sin(c.ph + t * 60) * jig;
      tmp.z += Math.cos(c.ph + t * 50) * jig;
      tmp.y *= clamp(T / 2.2, 0.35, 1.3);
      bag.group.localToWorld(tmp);
      const u = clamp((transfer - c.delay * 0.45) / 0.55);
      tmpQ.copy(c.q);
      if (u > 0) {
        const fw = funnel.group.localToWorld(tmp2.copy(c.fl));
        if (u < 0.5) tmp.lerp(bagOpenW, u * 2);
        else tmp.copy(bagOpenW).lerp(fw, (u - 0.5) * 2);
        tmpQ.multiply(new THREE.Quaternion().setFromAxisAngle(c.spin, u * 6));
      }
      const s = (c.isSeed ? 1 : c.s) * sAppear;
      tmpM.compose(tmp, tmpQ, c.isSeed ? tmpS.set(0.07 * s, 0.11 * s, 0.06 * s) : tmpS.setScalar(s));
      target.setMatrixAt(c.idx, tmpM);
    }
    chunks.instanceMatrix.needsUpdate = true;
    pulpSeeds.instanceMatrix.needsUpdate = true;
    P.pulpAt = bag.group.position.y + funnel.group.position.y;
  }

  /* ---------- pose(t): everything that depends on the experiment clock only ---------- */
  function pose(t) {
    P.t = t;
    // calyx removal
    const kc = ph(t, 0, 0.6, Ease.out); // plucked off the moment the strawberry is clicked, then settles
    calyx.group.position.lerpVectors(calAttachPos, calRemovedPos, kc);
    calyx.group.position.y += Math.sin(Math.PI * kc) * 2.5;
    calyx.group.quaternion.copy(calAttachQ).slerp(calRemovedQ, kc);

    // mash pulses
    const mashWin = win(t, 1.3, 1.34, 1.86, 1.92);
    const squish = mashWin * Math.pow(Math.max(0, Math.sin(((t - 1.3) / 0.6) * Math.PI * 12)), 2);
    const mixWin = win(t, 2.7, 2.73, 2.95, 2.99);
    const mix = mixWin * Math.pow(Math.max(0, Math.sin(((t - 2.7) / 0.29) * Math.PI * 6)), 2);

    // bag
    const bagMove = win(t, 3.0, 3.17, 3.75, 3.92);
    P.bagTilt = win(t, 3.17, 3.3, 3.62, 3.75);
    pourPose(bag.group, POS.bag, bagHomeQ, bag.anchors.spout, BAG_TARGET, X, -1.85, bagMove, P.bagTilt, 4);
    let T = 0.5 + 2.9 * ph(t, 0.9, 1.28) - 1.3 * ph(t, 1.3, 1.9) - squish * 0.8;
    T += 0.5 * ph(t, 2.22, 2.47) - mix * 0.45;
    T -= 1.8 * ph(t, 3.35, 3.62);
    T = lerp(T, 0.5, ph(t, 3.75, 3.92));
    P.T = T = Math.max(0.35, T);
    bag.setPuff(T, squish * 0.035 + mix * 0.02);
    const juice = 0.35 * ph(t, 1.5, 1.9);
    P.bagLevel = (juice + 0.65 * ph(t, 2.22, 2.47)) * (1 - ph(t, 3.28, 3.6, linear));
    bag.liquid.setFraction(P.bagLevel).setPour(P.bagTilt)
      .setColor(BAG_JUICE.copy(lin('#c8284a')).lerp(lin('#ec7891'), ph(t, 2.22, 2.55)));
    bag.group.updateMatrixWorld(true);

    // strawberry
    const kHop = ph(t, 0.42, 0.95); // straight after the leaves come off
    const inBag = bag.group.localToWorld(tmp.copy(bag.anchors.floor));
    berry.position.lerpVectors(BERRY_PLATE, inBag, kHop);
    berry.position.y += Math.sin(Math.PI * kHop) * 5;
    berry.rotation.y = kHop * 1.1;
    const m = ph(t, 1.3, 1.9, linear);
    const gone = 1 - ph(t, 1.72, 1.92);
    berry.scale.set((1 + 0.5 * m + 0.15 * squish) * gone, (1 - 0.6 * m - 0.2 * squish) * gone, (1 + 0.5 * m + 0.15 * squish) * gone);
    berry.visible = gone > 0.01;

    // foam
    bag.setFoam(ph(t, 2.4, 2.65) * (1 - ph(t, 3.05, 3.25)));

    // beaker pour (toward +x, into the bag)
    const bkMove = win(t, 2.0, 2.15, 2.53, 2.68);
    P.bkTilt = win(t, 2.15, 2.25, 2.43, 2.53);
    pourPose(beaker.group, POS.beaker, qI, beaker.anchors.spout, BK_TARGET, Z, -1.85, bkMove, P.bkTilt, 3);
    P.bkLevel = 0.04 + 0.7 * (1 - ph(t, 2.22, 2.45, linear));
    beaker.liquid.setLevel(P.bkLevel * (BK_H - 0.4)).setPour(P.bkTilt);

    // funnel out of the tube, into the waste bin
    const kF = ph(t, 4.0, 4.14);
    funnel.group.position.lerpVectors(FUNNEL_HOME, FUNNEL_CUP, kF);
    funnel.group.position.y += Math.sin(Math.PI * kF) * 7;
    funnel.group.rotation.z = Math.sin(Math.PI * kF) * 0.25;

    // bottle pour
    const btMove = win(t, 4.15, 4.3, 4.78, 4.92);
    P.btTilt = win(t, 4.3, 4.42, 4.68, 4.78);
    pourPose(bottle.group, BOTTLE_HOME, qI, bottle.anchors.spout, BT_TARGET, Z, 2.0, btMove, P.btTilt, 4);
    bottle.cap.visible = btMove < 0.02;
    P.btLevel = 0.8 - 0.3 * ph(t, 4.38, 4.7, linear);
    bottle.liquid.setFraction(P.btLevel).setPour(P.btTilt);

    // skewer
    const kA = ph(t, 5.0, 5.17), kB = ph(t, 5.17, 5.3), kCc = ph(t, 5.72, 5.9);
    P.spin = ph(t, 5.3, 5.72, linear) * Math.PI * 8;
    tmp.lerpVectors(POS.skewer, SK_ABOVE, kA);
    tmp.y += Math.sin(Math.PI * kA) * 4;
    tmp.lerp(SK_IN, kB);
    tmp.lerp(SK_OUT, kCc);
    skewer.group.position.copy(tmp);
    P.kA = kA; P.tiltQ = new THREE.Quaternion().slerp(SK_TILT, kCc);
    poseSkewer(P.spin);

    root.updateMatrixWorld();

    // filter and tube levels (the tube never moves, so these can be set here)
    P.fl = 0.75 * ph(t, 3.3, 3.52) * (1 - 0.9 * ph(t, 3.5, 3.95));
    funnel.liquid.setFraction(P.fl);
    const fLevel = FILTRATE * ph(t, 3.35, 3.95);
    P.fTopY = levelY(fLevel);
    filtrate.setRange(0, fLevel);
    const aLevel = FILTRATE + (ALC - FILTRATE) * ph(t, 4.38, 4.7);
    P.aTopY = levelY(aLevel);
    alcohol.setRange(fLevel, aLevel);

    P.squish = squish; P.mix = mix;
    placePulp(t);

    // DNA precipitate
    P.appear = ph(t, 4.92, 5.0, linear); // strands gather while you wait, after the pour (ends 4.92)
    P.wind = ph(t, 5.32, 5.7);
    if (t < 5.3) { dna.group.position.copy(DNA_HOME); dna.group.quaternion.identity(); }
  }

  function poseSkewer(spin) {
    tmpQ.setFromAxisAngle(Y, spin).premultiply(P.tiltQ);
    skewer.group.quaternion.copy(SKEW_Q).slerp(tmpQ, P.kA);
  }

  /* ---------- tick(t, time): every frame ---------- */
  function tick(t, time) {
    if (t !== P.t) pose(t);
    if (bag.group.position.y + funnel.group.position.y !== P.pulpAt) placePulp(t); // hover lift
    // the skewer keeps turning slowly once the DNA is out
    if (t > 5.9) poseSkewer(P.spin + Math.sin(time * 0.8) * 0.4);
    if (t >= 5.3) {
      dna.group.position.copy(skewer.group.position);
      dna.group.quaternion.copy(qI).slerp(skewer.group.quaternion, P.wind);
    }
    dna.set(P.appear, P.wind, time);
    dna.glob.material.opacity = 0.55 * ph(t, 5.45, 5.78);
    root.updateMatrixWorld();

    // pour points for the streams (liquid surfaces update themselves as the props move)
    const bagBottom = bag.group.localToWorld(tmp.set(0, 0, 0)).y;
    const bagOpenW = bag.group.localToWorld(V3().copy(bag.anchors.spout));
    const bkSpoutW = beaker.group.localToWorld(V3().copy(beaker.anchors.spout));
    const btSpoutW = bottle.group.localToWorld(V3().copy(bottle.anchors.spout));
    const funnelBase = funnel.liquid.yAt(0);

    // streams (radius in cm; Lab's stream is 0.17 cm across at scale 1)
    const stream = (s, from, toY, r) => { if (r < 0.01 || from.y <= toY) s.hide(); else s.set(from, toY, r / 0.17); };
    stream(streamBuffer, bkSpoutW, bagBottom + 1.4, 0.28 * win(t, 2.22, 2.26, 2.43, 2.47));
    stream(streamBag, bagOpenW, funnelBase + Math.max(0.3, P.fl * 3.65), 0.34 * win(t, 3.27, 3.31, 3.58, 3.63));
    stream(streamAlc, btSpoutW, P.aTopY, 0.12 * win(t, 4.38, 4.42, 4.66, 4.7));

    // drips from the funnel stem into the tube
    const dripOn = t > 3.36 && t < 3.97;
    const stemY = funnel.group.position.y;
    for (let i = 0; i < DRIPS; i++) {
      if (!dripOn) { drips.setMatrixAt(i, tmpM.compose(hidden, qI, zeroS)); continue; }
      const u = (time * 1.4 + i / DRIPS) % 1;
      tmpM.compose(tmp.set(funnel.group.position.x, lerp(stemY - 0.1, P.fTopY, u * u), funnel.group.position.z), qI, tmpS.set(0.12, 0.17, 0.12));
      drips.setMatrixAt(i, tmpM);
    }
    drips.instanceMatrix.needsUpdate = true;

    // bubbles in the alcohol layer
    const bub = ph(t, 4.5, 4.7) * (1 - ph(t, 5.2, 5.5)); // bubbles rise through the alcohol while the DNA forms
    bubbles.set(bub, time, POS.rack.x, POS.rack.z, interfaceY + 0.3, P.aTopY - 0.15);
  }

  return {
    pose, tick,
    props: { plate, bowl, berry, calyx, bag, beaker, soap, salt, rack, tube, funnel, cup, ice, bottle, skewer, dna },
    berryGroup: berry,
    anchors: { interfaceY, tubeTop },
  };
}
