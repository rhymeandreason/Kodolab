/* Printed labels: canvas drawers for wrapLabel() (core/geometry.js). Each one
 * is draw(c, w, h, opts) and fills the whole canvas, so they work at any size.
 *
 *   g.add(wrapLabel({ rTop: 2.47, rBot: 2.47, y0: 2.5, y1: 7.2, arc: 2.2,
 *     draw: (c, w, h) => cardLabel(c, w, h, { title: ['DISH', 'SOAP'], line: 'liquid detergent', ink: '#15803d' }) }));
 *
 *   tapeLabel  strip of lab tape: coloured tab, title, optional subtitle (beakers, cups)
 *   bandLabel  white label with colour bands top and bottom (reagent jars and bottles)
 *   cardLabel  rounded white card with big ink text (consumer bottles)
 *
 * Text that would overflow is shrunk to fit the width.
 */
import { FONT, roundRect } from './canvas.js';

/** Draw text centred at (x, y), shrinking the font so it fits in maxW. */
function fitText(c, text, x, y, size, weight, maxW) {
  c.font = `${weight} ${size}px ${FONT}`;
  const tw = c.measureText(text).width;
  if (tw > maxW) c.font = `${weight} ${Math.floor(size * maxW / tw)}px ${FONT}`;
  c.fillText(text, x, y);
}

/** A strip of lab tape: white label with a coloured tab, a title and an optional subtitle. */
export function tapeLabel(c, w, h, title, sub, color) {
  c.clearRect(0, 0, w, h);
  c.fillStyle = 'rgba(255,255,255,0.97)';
  roundRect(c, 4, 4, w - 8, h - 8, 18); c.fill();
  c.fillStyle = color;
  roundRect(c, 4, 4, 22, h - 8, 10); c.fill();
  c.fillRect(16, 4, 10, h - 8);
  c.fillStyle = '#0f1d2b';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  fitText(c, title, w / 2 + 10, sub ? h * 0.4 : h / 2, h * 0.3, 700, w - 60);
  if (sub) {
    c.fillStyle = '#5b6b7c';
    fitText(c, sub, w / 2 + 10, h * 0.72, h * 0.19, 500, w - 60);
  }
}

/** Reagent label: colour bands top and bottom, a title (one or two lines), a line and a note.
 *  header: small white text in the top band (e.g. 'LAB GRADE'); the band grows to hold it.
 *  lineColor: the line's colour (default `color`); the title is `ink`. */
export function bandLabel(c, w, h, { title, line, note, header, color = '#2563eb', ink = '#0f1d2b', lineColor = color } = {}) {
  const titles = Array.isArray(title) ? title.filter(Boolean) : [title];
  const top = header ? h * 0.17 : h * 0.13, bot = header ? h * 0.08 : h * 0.13;
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
  c.fillStyle = color; c.fillRect(0, 0, w, top); c.fillRect(0, h - bot, w, bot);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  if (header) { c.fillStyle = '#ffffff'; fitText(c, header, w / 2, top / 2, h * 0.094, 700, w * 0.9); }
  // rows, stacked and centred between the bands
  const T = titles.length > 1 ? h * 0.165 : h * 0.25;
  const rows = [
    ...titles.map((t) => ({ t, size: T, weight: 800, fill: ink })),
    line && { t: line, size: h * (titles.length > 1 ? 0.125 : 0.15), weight: titles.length > 1 ? 700 : 600, fill: lineColor },
    note && { t: note, size: h * 0.1, weight: 600, fill: color },
  ].filter(Boolean);
  const gap = (r) => r.size * 1.2;
  const total = rows.reduce((a, r) => a + gap(r), 0);
  let y = top + (h - top - bot - total) / 2;
  for (const r of rows) {
    c.fillStyle = r.fill;
    fitText(c, r.t, w / 2, y + gap(r) / 2, r.size, r.weight, w * 0.9);
    y += gap(r);
  }
}

/** Consumer label: a rounded white card with a big title (one or two lines) in ink and a grey line. */
export function cardLabel(c, w, h, { title, line, ink = '#15803d' } = {}) {
  const titles = Array.isArray(title) ? title.filter(Boolean) : [title];
  c.clearRect(0, 0, w, h);
  c.fillStyle = '#ffffff'; roundRect(c, 0, 0, w, h, Math.min(w, h) * 0.1); c.fill();
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = ink;
  titles.forEach((t, i) => fitText(c, t, w / 2, h * (titles.length > 1 ? 0.36 + i * 0.22 : 0.45), h * 0.185, 800, w * 0.88));
  if (line) { c.fillStyle = '#64748b'; fitText(c, line, w / 2, h * 0.8, h * 0.08, 600, w * 0.88); }
}
