/* Juniper's Seizures: a vet's bench for a calf with water intoxication (hyponatremia).
 * Scaffold: the bench and one placeholder step; the case steps replace it. */
import * as THREE from 'three';
import { V3, T, createStage, createMaterials, createInteraction, createLesson, createFollowCam, createIntro,
         chromeInsets, bindChrome, disposeTree, makeBench, makeMicroscope, makeTubeRack, wait } from '../lab.js';

const VIEWS = { bench: { t: V3(0, 8, 0), p: V3(0, 42, 62) } };
const stage = createStage({ canvas: document.getElementById('scene'), views: VIEWS,
  insets: (w, h) => chromeInsets(w, h) });
const mat = createMaterials(stage);

let root, B, first = true;
function rebuild() {
  if (root) { stage.scene.remove(root); disposeTree(root); }
  ix.clear();
  root = new THREE.Group(); stage.scene.add(root);
  root.add(makeBench(mat).group);
  const scope = makeMicroscope(mat);
  scope.group.position.set(12, 0, -2);
  const rack = makeTubeRack(mat, { holes: 3 });
  rack.group.position.set(-10, 0, 4);
  root.add(scope.group, rack.group);
  B = { scope, rack };
  for (const k of ['scope', 'rack']) ix.register(k, B[k].group, T.objects[k]);
}

const S = T.steps;
const lesson = createLesson({
  rebuild,
  panel: document.getElementById('stepsPanel'),
  phases: [{ id: 'setup', ...T.phases.setup, steps: ['scope'] }],
  onEnter: (step) => {
    stage.resize();
    if (!step) return;
    if (first) { first = false; intro.started.then(() => stage.focus(step.view, 2.2)); }
    else stage.focus(step.view);
  },
  steps: [{ id: 'scope', ...S.scope, targets: ['scope'], view: 'bench', run: () => wait(0.4) }],
  completeHint: T.complete.hint,
  completeWhy: T.complete.why,
});
const ix = createInteraction(stage, { targets: lesson.targets, busy: lesson.isBusy,
  onClick: lesson.click, status: lesson.status, markerStyle: 'circle' });
const follow = createFollowCam(stage, ix, { acting: lesson.acting, rig: VIEWS.bench });
stage.onFrame((dt) => { lesson.update(dt); follow.update(dt); ix.update(); });
bindChrome({ stage, restart: () => lesson.restart(), expose: { get B() { return B; }, lesson, stage } });
const intro = createIntro(stage);
lesson.start();
stage.start();
