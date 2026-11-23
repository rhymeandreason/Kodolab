/* Small DOM helpers shared by every lab. Styles live in lab.css. */

let root = null;
let muted = false;

/* ---------- colour themes (tokens in lab.css) ---------- */
export const THEMES = ['green', 'teal', 'sky', 'blue', 'indigo', 'violet', 'rose', 'orange'];
let themeVersion = 0;

/** Switch the page's theme. A sim normally sets <html data-lab-theme> instead. */
export function setTheme(name) {
  if (!THEMES.includes(name)) return;
  document.documentElement.dataset.labTheme = name;
  themeVersion++;
}
export const getTheme = () => document.documentElement.dataset.labTheme || 'green';
/** Bumps on every setTheme(), so 3D colours read from CSS can refresh. */
export const getThemeVersion = () => themeVersion;
/** A theme token's current value, e.g. themeColor('--accent') → '#16a34a'. */
export const themeColor = (token) => getComputedStyle(document.documentElement).getPropertyValue(token).trim();

{ // ?theme=teal overrides the sim's choice, for comparing
  const t = new URLSearchParams(location.search).get('theme');
  if (t) setTheme(t);
}

/** Where Lab puts its overlays (tooltip, markers, toasts, hint, timeline). */
export function uiRoot(el) {
  if (el) root = el;
  return root || document.getElementById('app') || document.body;
}

export function ensureEl(id, className, tag = 'div') {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement(tag);
    el.id = id;
    if (className) el.className = className;
    uiRoot().appendChild(el);
  }
  return el;
}

/** Silence toasts (the lesson does this while it replays steps). */
export const setToastMuted = (on) => { muted = !!on; };

export function toast(html, { icon = 'ph-check-circle', warn = false } = {}) {
  if (muted) return;
  const box = ensureEl('lab-toasts', 'lab-toasts');
  const el = document.createElement('div');
  el.className = 'lab-toast' + (warn ? ' warn' : '');
  el.innerHTML = `<i class="ph-fill ${icon}"></i><span>${html}</span>`;
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 350); }, 2600);
}

export const stripTags = (s) => String(s || '').replace(/<[^>]+>/g, '');
