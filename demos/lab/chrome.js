/* The half of the page chrome that needs the stage: the camera's insets and the topbar's view
 * and restart buttons. page.js builds the elements; this measures and wires them.
 *
 *   const stage = createStage({ canvas, views, insets: (w, h) => chromeInsets(w, h) });
 *   bindChrome({ stage, zoom, restart, expose: { get S() { return S; }, lesson, stage } });
 */

/** Below this width the procedure panel and zoom circles hide (lab.css's phone breakpoint). */
export const PHONE = 820;

/** How much of the screen the standard chrome covers, so views centre in the free area.
 *  bottom: the highest of the card, timeline, captions and any `bottom` extras (hidden ones
 *  count as 0). left: the procedure panel. right: the zoom circles. A lab with panels of its
 *  own adjusts the result (Photosynthesis's observation step). */
export function chromeInsets(w, h, { bottom = [], captions = true, phoneTop = 60 } = {}) {
  const rect = (q) => { const e = document.querySelector(q); return e ? e.getBoundingClientRect() : null; };
  const sel = ['.lab-card', '.lab-timeline', ...(captions ? ['.lab-captions'] : []), ...bottom];
  const tops = sel.map(rect).filter((r) => r && r.height).map((r) => r.top);
  const b = tops.length ? h - Math.min(...tops) : 0;
  if (w <= PHONE) return { left: 0, right: 0, top: phoneTop, bottom: b };
  const panel = rect('#stepsPanel'), z = rect('#zoomInsets');
  return {
    left: panel && panel.width ? panel.right + 20 : 0,
    right: z && z.width ? w - z.left + 10 : 0,
    top: 0, bottom: b,
  };
}

/** The topbar's view and restart buttons, and the `window.LAB` hook for testing. Reset view
 *  goes back to the bench's current view, or re-frames the zoom level you're on. */
export function bindChrome({ stage, zoom = null, restart, expose = {} }) {
  document.getElementById('btnView').addEventListener('click', () => {
    if (!zoom || zoom.scale === 'lab') stage.focus(stage.lastView); else zoom.onStep();
  });
  document.getElementById('btnRestart').addEventListener('click', restart);
  window.LAB = expose;
}
