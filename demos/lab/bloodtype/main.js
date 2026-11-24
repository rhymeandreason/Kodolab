/* Blood Typing: props on the bench, laid out. The procedure is still to build. */
import * as THREE from 'three';
import {
  V3, disposeTree, createStage, createMaterials, createInteraction, createLesson, createFollowCam,
  createIntro, chromeInsets, bindChrome, T,
} from '../lab.js';
import { buildBench } from './bench.js';

const VIEWS = {
  overview: { t: V3(0, 0, -6), p: V3(0, 62, 56) },
  trays: { t: V3(0, 0, 3), p: V3(0, 27, 27) },
};
const stage = createStage({ canvas: document.getElementById('scene'), views: VIEWS,
  controls: { minDistance: 10, maxDistance: 160 }, insets: (w, h) => chromeInsets(w, h) });
const mat = createMaterials(stage);

let root = null, B = null, lesson, ix, intro;
function rebuild() {
  if (root) { stage.scene.remove(root); disposeTree(root); }
  ix.clear();
  root = new THREE.Group(); stage.scene.add(root);
  B = buildBench(mat, root).props;
  B.trays.forEach((t, i) => ix.register(`tray${i}`, t.group, { name: T.objects.tray.name, short: T.objects.tray.short }));
}

lesson = createLesson({
  rebuild,
  panel: document.getElementById('stepsPanel'),
  onEnter: (step, i) => { stage.resize(); if (step) (i === 0 && intro ? intro.started : Promise.resolve()).then(() => stage.focus(step.view, 2.2)); },
  phases: [{ ...T.phases.setup, steps: ['look'] }],
  completeHint: T.completeHint,
  steps: [{ id: 'look', targets: ['tray0'], view: 'trays', run: () => {}, ...T.steps.look }],
});
ix = createInteraction(stage, { targets: lesson.targets, busy: lesson.isBusy, onClick: lesson.click, status: lesson.status, markerStyle: 'circle' });
const follow = createFollowCam(stage, ix, { acting: lesson.acting, rig: VIEWS.overview });
stage.onFrame((dt) => { lesson.update(dt); follow.update(dt); ix.update(); });
bindChrome({ stage, restart: () => lesson.restart(), expose: { get B() { return B; }, lesson, stage, follow } });
intro = createIntro(stage, { art: document.querySelector('.intro-art')?.introArt });
lesson.start();
stage.start();
