/* =============================================================================
 *  build/shelf.js — the apps this person made, one card each
 * =============================================================================
 *  Drawn on two pages from one module, so the builder's "Continue building"
 *  row and /apps are the same cards: `Shelf.mount(box, opts)` paints into
 *  `box` and returns `{ refresh }`. Needs `Apps` (apps-client.js) on the page
 *  and shelf.css beside kodo.css.
 *
 *    opts.account   true when a Google account is signed in (the builder
 *                   learns this from /api/build, so a function is accepted)
 *    opts.exclude   an app id to leave out (the one open in the builder);
 *                   a function too, since that changes as apps open
 *    opts.limit     how many cards, default 12
 *    opts.heading   an h2 over the grid, or '' for none
 *    opts.onPaint   (n) called after every paint with the card count, so the
 *                   page can show or hide what surrounds the shelf
 *
 *  Whose apps: with a class code, a teacher code or a signed-in account the
 *  list is the server's, and nothing from this browser's store — on a shared
 *  Chromebook the store holds whoever sat here last. Otherwise the store.
 *
 *  The first few cards are the apps themselves, live in a scaled, inert frame;
 *  six is the cap, since each is a WebGL context. Beyond that a card is the
 *  same box with the frame swapped for a still: the scene as the stored image,
 *  the shell's own card rebuilt over it from the words stored beside it. Same
 *  960x600 layout, same scale, so the two halves read as one set.
 * ========================================================================== */
window.Shelf = (() => {
  'use strict';
  const LIVE = 6;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Days, then a date: an app is worked on in sittings, so an hour count says
  // less than "3 days ago".
  function ago(t) {
    if (!t) return '';
    const d = new Date(t), days = Math.floor((Date.now() - d) / 864e5);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return days + ' days ago';
    const y = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(y ? {} : { year: 'numeric' }) });
  }

  // The icon says it landed: the link goes to a check for a moment and back.
  async function copyLink(btn, id) {
    try { await navigator.clipboard.writeText(Apps.link('view', id)); } catch { return; }
    btn.classList.add('is-done');
    btn.innerHTML = '<i class="ph-bold ph-check"></i>';
    setTimeout(() => { btn.classList.remove('is-done'); btn.innerHTML = '<i class="ph-bold ph-link"></i>'; }, 1600);
  }

  /* The delete dialog, one per page, made on first use. tabindex so the dialog
     itself takes the opening focus: otherwise the browser rings Cancel, and
     Enter is then a keystroke away from nothing happening while the ring reads
     as a recommendation. */
  let dlg = null, pending = null, afterDelete = null;
  function dialog() {
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.className = 'beta confirm shelf-del';
    dlg.tabIndex = -1;
    dlg.innerHTML = `<h2>Delete this app?</h2>
      <p>“<span class="name"></span>” and all its versions go for good, and any link you have shared stops working.</p>
      <p class="small bad" hidden></p>
      <div class="row"><button class="btn cancel" type="button">Cancel</button>
      <button class="btn btn--hot go" type="button"><i class="ph-bold ph-trash"></i>Delete</button></div>`;
    document.body.appendChild(dlg);
    dlg.querySelector('.cancel').addEventListener('click', () => dlg.close());
    dlg.querySelector('.go').addEventListener('click', doDelete);
    return dlg;
  }
  function askDelete(m, done) {
    pending = m; afterDelete = done;
    const d = dialog();
    d.querySelector('.name').textContent = m.title || 'untitled';
    d.querySelector('.bad').hidden = true;
    d.showModal(); d.focus();
  }
  async function doDelete() {
    const m = pending; if (!m) return;
    try {
      await Apps.api('../../api/app', { method: 'POST', token: m.token, body: { action: 'remove', id: m.id } });
    } catch (err) {
      // A row already gone is a delete that got what it wanted.
      if (err.status !== 404) { const e = dlg.querySelector('.bad'); e.textContent = err.message; e.hidden = false; return; }
    }
    Apps.forget(m.id);
    pending = null;
    dlg.close();
    if (afterDelete) afterDelete();
  }

  // The panel, as the shell draws it. A thumb is only laid down when it is
  // known to be scene-only: a capture from before the shelf drew its own panel
  // has one rasterised into it, and the words go over the top of it, so the
  // picture is dropped rather than the panel.
  function still(m) {
    const t = m.meta;
    if (!m.thumb && !t) return '';
    const scene = m.thumb && (!t || t.scene);
    return `<span class="card"${scene ? ` style="background-image:url(${esc(m.thumb)})"` : ''}>`
      + (t ? `<span class="s-top"><span class="s-brand">${esc(t.brand || '')}</span>`
           + `<span class="s-dots">${'<i></i>'.repeat(Math.min(t.steps || 0, 12))}</span></span>`
           + `<span class="s-panel"><span class="s-scroll">`
           + (t.eyebrow ? `<span class="s-eyebrow">${esc(t.eyebrow)}</span>` : '')
           + `<span class="s-title">${esc(t.title || '')}</span>`
           + (t.body ? `<span class="s-body">${esc(t.body)}</span>` : '')
           + `</span>`
           + (t.nav ? `<span class="s-nav"><i class="ghost"></i><i class="primary"></i></span>` : '')
           + `</span>` : '')
      + `</span>`;
  }

  // The card opens the editor; the row under it names the three things that
  // are not that. Delete needs the edit token, so it is only offered on an app
  // this browser can still edit or the account owns.
  const card = (m, i) => `<li data-id="${esc(m.id)}"><a class="open" href="${esc(Apps.link('edit', m.id))}"><span class="thumb">`
    + (i < LIVE ? `<iframe class="live" data-id="${esc(m.id)}" title="" tabindex="-1" aria-hidden="true"></iframe>` : still(m))
    + `</span><span class="meta"><span class="name">${esc(m.title || 'untitled')}</span>`
    + `<time class="when" datetime="${new Date(m.edited || m.at || Date.now()).toISOString()}">${esc(ago(m.edited || m.at))}</time>`
    + `</span></a>`
    + `<span class="acts">`
    + `<a class="btn act-view" href="${esc(Apps.link('view', m.id))}" target="_blank" rel="noopener"><i class="ph-bold ph-arrow-square-out"></i>View</a>`
    + `<a class="btn act-edit" href="${esc(Apps.link('edit', m.id))}"><i class="ph-bold ph-pencil-simple"></i>Edit</a>`
    + `<span class="spacer"></span>`
    + `<button class="iconbtn" data-act="copy" type="button" title="Copy the public link" aria-label="Copy the public link"><i class="ph-bold ph-link"></i></button>`
    + (m.token || m.mine ? `<button class="iconbtn" data-act="del" type="button" title="Delete this app" aria-label="Delete this app"><i class="ph-bold ph-trash"></i></button>` : '')
    + `</span></li>`;

  function mount(box, opts = {}) {
    const limit = opts.limit || 12;
    const opt = k => (typeof opts[k] === 'function' ? opts[k]() : opts[k]);
    box.classList.add('mine');
    let list = [];

    box.addEventListener('click', e => {
      const b = e.target.closest('button[data-act]'); if (!b) return;
      const id = b.closest('li').dataset.id;
      const m = list.find(x => x.id === id) || { id };
      if (b.dataset.act === 'copy') return copyLink(b, id);
      askDelete(m, refresh);
    });
    const fit = () => { for (const t of box.querySelectorAll('.thumb')) t.style.setProperty('--k', (t.clientWidth / 960).toFixed(4)); };
    new ResizeObserver(fit).observe(box);

    const paint = () => {
      box.innerHTML = (opts.heading ? `<h2>${esc(opts.heading)}</h2>` : '') + `<ul>${list.map(card).join('')}</ul>`;
      fit();
    };

    async function refresh() {
      const coded = !!(Apps.codes.seat() || Apps.codes.teacher() || opt('account'));
      if (coded) {
        try {
          const r = await Apps.api('../../api/app?mine=1');
          list = (r.apps || []).map(a => ({ id: a.id, title: a.title, thumb: a.thumb, meta: a.thumb_meta,
                                            edited: a.edited, token: Apps.tokenFor(a.id), mine: true }));
        } catch (err) { console.warn('[shelf] ' + err.message); list = []; }
      } else list = Apps.mine();
      const skip = opt('exclude');
      list = list.filter(m => m.id !== skip).slice(0, limit);
      if (opts.onPaint) opts.onPaint(list.length);
      box.hidden = !list.length;
      if (!list.length) return;
      paint();
      if (!coded) try {
        const r = await Apps.api(`../../api/app?ids=${list.map(m => m.id).join(',')}`);
        const by = Object.fromEntries((r.apps || []).map(a => [a.id, a]));
        for (const m of list) { const a = by[m.id]; if (a) { m.thumb = a.thumb; m.meta = a.thumb_meta; m.edited = a.edited; if (a.title) m.title = a.title; } }
        paint();
      } catch (err) {
        // The shelf still paints from the browser's own store, so a card keeps
        // its title and date. Said out loud because the silent version turned
        // one missing column into twelve blank thumbs with nothing to go on.
        console.warn('[shelf] no stored thumbs: ' + err.message);
      }
      // A live card is a WebGL app: nothing loads until a card is scrolled to,
      // and then one at a time. Zero margin on purpose: on the builder the
      // shelf's top edge rests on the fold, and any positive rootMargin is
      // satisfied without scrolling.
      const queue = [];
      let pumping = false;
      async function pump() {
        if (pumping) return;
        pumping = true;
        while (queue.length) {
          const f = queue.shift();
          try { const r = await Apps.api(`../../api/app?id=${f.dataset.id}`); Apps.preview(f, r.html); }
          catch { /* a card that will not load stays paper */ }
          await new Promise(done => setTimeout(done, 120));
        }
        pumping = false;
      }
      const io = new IntersectionObserver((entries, obs) => {
        for (const e of entries) { if (!e.isIntersecting) continue; obs.unobserve(e.target); queue.push(e.target); }
        pump();
      }, { root: null, rootMargin: '0px', threshold: 0.2 });
      for (const f of box.querySelectorAll('iframe.live')) io.observe(f);
    }

    return { refresh };
  }

  return { mount, ago };
})();
