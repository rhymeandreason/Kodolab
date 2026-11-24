/* Lab: shared pieces for 3D bench-lab simulations. See README.md. */
export * from './core/three-compat.js';  // first: turns colour management off before any Color exists
export * from './core/math.js';
export * from './core/random.js';
export * from './core/tween.js';
export * from './core/canvas.js';
export * from './core/labels.js';
export * from './core/geometry.js';
export { createStage } from './core/stage.js';
export { createSketch } from './core/sketch.js';
export { createMaterials, glassMaterial, toLinear, GLASS_LOOK } from './materials.js';
export { createInteraction } from './interact.js';
export { createLesson, cues, cueAt } from './lesson.js';
export { T, UI, LANG, fmt } from './text.js';
export { createFollowCam } from './follow.js';
export { createZoom } from './zoom.js';
export { createIntro, createPropArt } from './intro.js';
export { chromeInsets, bindChrome, PHONE } from './chrome.js';
export { toast, ensureEl, uiRoot, stripTags, THEMES, setTheme, getTheme, themeColor } from './ui.js';

export { makeBench, makeWorkMat, makePaperTowel, makeTray, makeWasteBin, makeBenchCard } from './props/surfaces.js';
export { makeBeaker, makeCup, makeDish, makeTestTube, makeFunnel, makeMicroTube } from './props/glassware.js';
export { makeJar, makeJarLid, makeSqueezeBottle, makeReagentBottle } from './props/bottles.js';
export { INGREDIENTS, ingredient } from './props/ingredients.js';
export { makeZipBag, pillowH } from './props/bag.js';
export { makePlate, makeBowl, makeIceBath } from './props/kitchen.js';
export { makeTubeRack, makeToolHolder } from './props/racks.js';
export { makePipette, makeSyringe, SYRINGE_ML, SYRINGE_BOT, makeScoop, makeRod, makeSkewer, makePunch, makeLoop, makeScalpel, makePencil } from './props/tools.js';
export { makeLamp, makeTimer, makeWaterBath, makeUvLamp } from './props/equipment.js';
export { makeAgarPlate } from './props/culture.js';
export { makeStrawberry, makeCalyx, STRAWBERRY_H, strawberrySeed, makeDnaPrecipitate, makeLeaf, makeLeafDisk } from './props/specimens.js';
export { makeOnion } from './props/onion.js';
export { makeSlide, makeCoverslip, makeFilterPaper, makeMicroscope } from './props/microscopy.js';
export { makeGelBox, makeAgaroseGel, makeGelComb, makePowerSupply, makeLead, makeTransilluminator } from './props/electrophoresis.js';
export { makeMicropipette, makeTipBox, makePipetteStand } from './props/micropipette.js';
export { makeStream, ripple, powderFall, drop, makeBubbles } from './props/effects.js';
