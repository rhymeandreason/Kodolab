/* The words a lab shows, for modules: what page.js merged from lab/strings.js, the lab's
 * text.js and the page's language (page.js's header has the loading).
 *
 *   import { T, UI, fmt } from '../lab.js';
 *   T.steps.pour.title                       // the lab's own text
 *   fmt(UI.stepOf, { n: 3, total: 8 })       // 'Step 3 of 8'
 */
const L = globalThis.LabText || { lang: 'en', data: {} };

/** The lab's text (its text.js, translated). */
export const T = L.data;
/** The shared UI's (lab/strings.js, translated). */
export const UI = L.data.ui || {};
export const LANG = L.lang;

/** Fill {name} slots: fmt('Step {n} of {total}', { n: 3, total: 8 }). An unknown slot stays as written. */
export function fmt(s, vars = {}) {
  return String(s).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}
