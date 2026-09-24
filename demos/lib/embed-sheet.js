/* =============================================================================
 *  lib/embed-sheet.js — the dialog that writes an embed code
 * =============================================================================
 *  One sheet for everything a teacher can paste: a lesson (lessons.html), a
 *  protein (proteins/index.html), a molecule (molecules.html). Styles in
 *  css/embed-sheet.css. The left column is the choices and the code; the right
 *  is the framed page itself, so what the code says is what a teacher is
 *  looking at. The iframe is made on show and dropped on close: a WebGL page
 *  left running behind this one costs every frame.
 *
 *      const sheet = EmbedSheet.create({
 *        heading, pick,           'Embed this lesson', 'Lesson'
 *        items: [{ key, title, group? }],
 *        views: [{ key, label }], the first is the default
 *        can(item, view),         false greys a view out for that item
 *        note(item, view),        a line under the views, or ''
 *        resolve(item, view) -> { src, lw },
 *        credit(item) -> { href, text },
 *        size: { w, h },
 *      });
 *      sheet.show(key); sheet.isOpen();
 *      EmbedSheet.saveStill(src, name)   a baked still, downloaded as PNG
 *
 *  `src` is the short URL, which the snippet carries and the preview frames.
 *  `lw` is the width the page is LAID OUT at, or 0 for a page that fills any
 *  box (a lone model): see size() below.
 * ========================================================================== */
(function (global) {
  'use strict';

  const SITE = 'https://www.kodolab.org';
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

  function create(o) {
    const byKey = k => o.items.find(i => i.key === k);
    const can = (it, v) => !o.can || o.can(it, v);
    const size0 = o.size || { w: 960, h: 600 };

    const dlg = document.createElement('dialog');
    dlg.className = 'esheet';
    dlg.setAttribute('aria-labelledby', 'esheet-h');
    const groups = [...new Set(o.items.map(i => i.group).filter(Boolean))];
    const opt = i => `<option value="${esc(i.key)}">${esc(i.title)}</option>`;
    dlg.innerHTML = `
      <button class="x" type="button" aria-label="Close">&times;</button>
      <div class="in">
        <form class="ctl" method="dialog">
          <h2 id="esheet-h">${esc(o.heading)}</h2>
          <label class="f">${esc(o.pick)} <select data-r="pick">${groups.length
            ? groups.map(g => `<optgroup label="${esc(g)}">${o.items.filter(i => i.group === g).map(opt).join('')}</optgroup>`).join('')
            : o.items.map(opt).join('')}</select></label>
          <div class="f" role="radiogroup" aria-label="View">
            <span>View</span>
            <div class="views">${o.views.map((v, n) =>
              `<input type="radio" name="esheet-view" id="esheet-v-${v.key}" value="${v.key}"${n ? '' : ' checked'}><label for="esheet-v-${v.key}">${esc(v.label)}</label>`).join('')}</div>
          </div>
          <p class="note" data-r="note"></p>
          <div class="f size"><span>Size on your page</span>
            <div class="dims"><label><input type="number" data-r="w" min="320" max="2400" step="10" value="${size0.w}"> <span>wide</span></label><span class="by">×</span><label><input type="number" data-r="h" min="200" max="1600" step="10" value="${size0.h}"> <span>tall</span></label><label class="lock"><input type="checkbox" data-r="lock" checked> <span>keep ratio</span></label></div>
            <p class="note" data-r="size"></p>
          </div>
          <label class="f">Paste this<pre data-r="code"></pre></label>
          <div class="btns">
            <button class="ebtn" type="button" data-r="copy">Copy code</button>
            <a class="ebtn ghost" data-r="open" href="#" target="_blank" rel="noopener">Open in a tab</a>
            <span class="ok" data-r="ok" hidden>Copied</span>
          </div>
        </form>
        <div class="prev">
          <div class="stack" data-r="stack">
            <div class="frame" data-r="frame"><span class="cap">Live preview</span></div>
            <p class="credit" data-r="credit"></p>
          </div>
          <button class="btn" type="button" data-r="png" hidden>Save as PNG</button>
        </div>
      </div>`;
    document.body.appendChild(dlg);
    const r = k => dlg.querySelector(`[data-r="${k}"]`);
    const sel = r('pick'), note = r('note'), code = r('code'), openA = r('open');
    const frame = r('frame'), ok = r('ok'), wEl = r('w'), hEl = r('h'), sizeNote = r('size');
    const radios = [...dlg.querySelectorAll('input[name="esheet-view"]')];
    const view = () => (radios.find(x => x.checked) || radios[0]).value;
    const item = () => byKey(sel.value);
    const res = () => o.resolve(item(), view());

    /* THE LAYOUT WIDTH. A page that stacks into its phone layout under some
       width is never what a teacher wants on a slide, so a frame narrower than
       `lw` is laid out at `lw` and scaled down to the size asked for; a wider
       one is laid out at its own width. The pair a teacher types is a SHAPE and
       a ceiling, not a promise: the host's column decides the real width (Canvas
       by the institution's theme, Notion by a page setting), so the snippet
       scales the box to whatever width it is actually given. A lone model has
       no layout to protect (`lw` 0) and simply fills the box. */
    function size() {
      const w = Math.max(320, Number(wEl.value) || size0.w), h = Math.max(200, Number(hEl.value) || size0.h);
      const lw = res().lw ? Math.max(res().lw, w) : w;
      return { w, h, lw, lh: Math.round(lw * h / w), scale: w / lw, fluid: !res().lw };
    }
    /* SCALING WITH NO SCRIPT. Canvas's sanitizer strips <script> and <style>
       from anything a teacher pastes, so the snippet has one inline declaration
       to do this with: read the container's own width as a unit and divide it
       down to the unitless factor scale() takes. The plain scale() before it is
       the fallback an engine keeps when it cannot do the division. */
    function fitCSS(z) {
      if (z.fluid) return 'width:100%;height:100%';
      return `width:${z.lw}px;height:${z.lh}px;transform-origin:0 0;`
           + `transform:scale(${z.scale.toFixed(4)});transform:scale(calc(100cqw / ${z.lw}px))`;
    }
    /* The preview only decides how much of the pane to take. The frame inside
       carries the SNIPPET'S OWN CSS and scales itself exactly as a host page
       would, so a preview that looks right is evidence the paste will. */
    function fit() {
      const f = frame.querySelector('iframe'), z = size(), pane = frame.parentElement.parentElement;
      frame.style.setProperty('--ar', `${z.w} / ${z.h}`);
      const room = pane.clientHeight - 2 * parseFloat(getComputedStyle(pane).paddingTop) - 30;   // less the credit line
      const want = Math.min(z.w, pane.clientWidth, room * z.w / z.h) + 'px', stack = r('stack');
      if (stack.style.width !== want) stack.style.width = want;   // an unchanged write still re-fires the observer
      if (f) f.style.cssText = 'position:absolute;left:0;top:0;border:0;' + fitCSS(z);
    }
    new ResizeObserver(fit).observe(frame);

    /* THE CREDIT under the frame, in the snippet and the preview alike: the
       wordmark and a link back. target=_blank is load-bearing inside a host
       page: a plain link would navigate the teacher's page. */
    function credit(it, pStyle = '', aStyle = '', imgStyle = '') {
      const c = o.credit(it);
      return `<p ${pStyle}><a href="${SITE + c.href}?from=embed" target="_blank" rel="noopener" ${aStyle}><img src="${SITE}/kodolab-wordmark.svg" alt="Kodolab" ${imgStyle}>${esc(c.text)}</a></p>`;
    }
    /* `container-type` on the outer box is what makes 100cqw mean "the width
       this embed was actually given"; aspect-ratio keeps the hole the right
       shape as that width changes, so nothing is ever cropped. */
    function snippet(it) {
      const z = size();
      return `<div style="container-type:inline-size;width:${z.w}px;max-width:100%">\n<div style="position:relative;overflow:hidden;aspect-ratio:${z.w} / ${z.h};border-radius:12px">\n  <iframe src="${SITE + res().src}" title="${esc(it.title)} — Kodolab"\n    style="position:absolute;left:0;top:0;border:0;${fitCSS(z)}"\n    allow="fullscreen" loading="lazy"></iframe>\n</div>\n${credit(it, 'style="margin:6px 0 0;font:13px/1.4 -apple-system,Segoe UI,sans-serif;color:#6b7280"', 'style="color:inherit;text-decoration:none"', 'style="height:14px;vertical-align:baseline;margin-right:6px"')}\n</div>`;
    }
    function draw() {
      const it = item();
      for (const x of radios) x.disabled = !can(it, x.value);
      if (!can(it, view())) radios[0].checked = true;
      const n = o.note ? o.note(it, view()) : '';
      note.textContent = n; note.hidden = !n;
      const z = size();
      sizeNote.textContent = z.fluid
        ? 'Fills whatever box your page gives it, at any shape.'
        : `Laid out at ${z.lw} px and shown at ${Math.round(z.scale * 100)}% here. `
          + 'A narrower column scales it down to fit rather than cropping it.';
      code.textContent = snippet(it);
      r('credit').innerHTML = credit(it).replace(/^<p >|<\/p>$/g, '').replace(SITE + '/kodolab', '/kodolab');
      openA.href = res().src;
      ok.hidden = true;
    }
    /* Only a change of item or view reloads the frame: a size change rescales. */
    function load() {
      const it = item();
      frame.querySelectorAll('iframe').forEach(f => f.remove());
      const f = document.createElement('iframe');
      f.src = res().src; f.title = it.title; f.loading = 'lazy';
      f.setAttribute('allow', 'fullscreen');
      frame.appendChild(f);
      fit();
    }
    const redraw = () => { draw(); load(); };
    function show(key) {
      sel.value = key;
      radios[0].checked = true;
      redraw();
      dlg.showModal();
    }
    sel.addEventListener('change', redraw);
    for (const x of radios) x.addEventListener('change', redraw);
    /* KEEP RATIO: editing one side sets the other from the ratio the pair had
       when the lock was last on. Rounded to the field's step. */
    const lock = r('lock');
    let ratio = size0.w / size0.h;
    const snap = v => Math.max(0, Math.round(v / 10) * 10);
    lock.addEventListener('change', () => { if (lock.checked) ratio = size().w / size().h; });
    wEl.addEventListener('input', () => { if (lock.checked && Number(wEl.value) > 0) hEl.value = snap(Number(wEl.value) / ratio); fit(); draw(); });
    hEl.addEventListener('input', () => { if (lock.checked && Number(hEl.value) > 0) wEl.value = snap(Number(hEl.value) * ratio); fit(); draw(); });
    dlg.addEventListener('close', () => frame.querySelectorAll('iframe').forEach(f => f.remove()));
    dlg.querySelector('.x').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    let okTimer = 0;
    r('copy').addEventListener('click', async () => {
      const text = code.textContent;
      try { await navigator.clipboard.writeText(text); }
      catch (e) { const rg = document.createRange(); rg.selectNodeContents(code); const s = getSelection(); s.removeAllRanges(); s.addRange(rg); document.execCommand('copy'); }
      ok.hidden = false; clearTimeout(okTimer); okTimer = setTimeout(() => { ok.hidden = true; }, 1800);
    });

    /* SAVE AS PNG, FROM THE SCREEN ITSELF, LOCALHOST ONLY. Rasterising the DOM
       drops web fonts in Safari and reads a blank WebGL buffer, and a page's own
       screen capture asks permission on every click. So the dev server runs
       macOS `screencapture` over this window (tools/dev-server.js,
       /api/screenshot) and the page crops the frame out of it. Where the frame
       sits is found, not computed, since the browser's toolbar height is not
       something a page can read: the page rings the frame in magenta and looks
       for the ring. */
    const png = r('png');
    png.hidden = !/^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    async function grab() {
      frame.classList.add('shooting');
      try {
        await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
        await new Promise(res => setTimeout(res, 80));   // past the compositor, onto the glass
        const rs = await fetch('/api/screenshot', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ x: screenX, y: screenY, w: outerWidth, h: outerHeight }) });
        if (!rs.ok) throw new Error((await rs.json().catch(() => ({}))).error || rs.status);
        const img = await createImageBitmap(await rs.blob());
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        return c;
      } finally { frame.classList.remove('shooting'); }
    }
    function crop(c) {
      const W = c.width, H = c.height, d = c.getContext('2d').getImageData(0, 0, W, H).data;
      let x0 = W, y0 = H, x1 = -1, y1 = -1;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (d[i] > 200 && d[i + 1] < 70 && d[i + 2] > 200) {
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
      if (x1 < 0) return null;
      const rc = frame.getBoundingClientRect(), px = (x1 - x0 + 1) / (rc.width + 8);   // captured px per CSS px
      const ring = Math.ceil(4 * px) + 1;   // one extra px for an edge on a fractional pixel
      const out = document.createElement('canvas');
      out.width = x1 - x0 + 1 - 2 * ring; out.height = y1 - y0 + 1 - 2 * ring;
      out.getContext('2d').drawImage(c, x0 + ring, y0 + ring, out.width, out.height, 0, 0, out.width, out.height);
      return out;
    }
    let pngTimer = 0;
    const say = t => { png.textContent = t; clearTimeout(pngTimer); pngTimer = setTimeout(() => { png.textContent = 'Save as PNG'; }, 2400); };
    png.addEventListener('click', async () => {
      let c;
      try { c = crop(await grab()); } catch (e) { return say(String(e.message || e)); }
      // A capture with no windows in it is macOS withholding Screen Recording.
      if (!c) return say('Frame not found: allow Screen Recording for the terminal');
      const z = size(), a = document.createElement('a');
      a.download = `${sel.value}${view() === o.views[0].key ? '' : '-' + view()}-${z.w}x${z.h}.png`;
      a.href = URL.createObjectURL(await new Promise(res => c.toBlob(res, 'image/png')));
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      say(`Saved ${c.width}×${c.height}`);
    });

    return { show, isOpen: () => dlg.open };
  }

  /* A STILL, AS A PNG. The baked thumbnails are transparent WebP, which Google
     Slides will not take; a canvas re-encodes the same pixels, alpha and all. */
  function saveStill(src, name) {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      c.toBlob(b => {
        const a = document.createElement('a');
        a.download = name + '.png';
        a.href = URL.createObjectURL(b);
        a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }, 'image/png');
    };
    img.src = src;
  }

  global.EmbedSheet = { create, saveStill };
})(window);
