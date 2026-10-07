/* =====================================================================
 *  gallery-search.js — a collection page's search: filters the grid as
 *  you type, suggests the best few, and picking one opens it.
 *  Pairs with css/library.css's `.find`. Used by library.html,
 *  proteins/index.html and molecules.html.
 *
 *  GallerySearch.mount(root, { placeholder, items, onPick, onFilter, empty })
 *    items:    [{ key, name, alias?, text, hint, el }]. `name` and `alias`
 *              rank above `text`, so "oxygen" lists hemoglobin first by
 *              name before anything whose blurb says oxygen. `el` is the
 *              card the filter hides.
 *    onPick:   key → open it.
 *    onFilter: (shown Set | null) after every keystroke; null = no query.
 *    empty:    an element shown, with the query, when nothing matches.
 * ===================================================================== */
(function (global) {
  'use strict';

  /* NFKD so a formula's subscripts match: "C6H12O6" finds C₆H₁₂O₆. */
  const norm = t => (t || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  const esc = t => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* Every word must match somewhere; a word at the start of a name word
     outranks one inside it, which outranks one only in the text. */
  function score(e, words) {
    let s = 0;
    for (const w of words) {
      if (e.name.startsWith(w) || e.name.includes(' ' + w)) s += 4;
      else if (e.name.includes(w)) s += 3;
      else if (e.text.includes(w)) s += 1;
      else return 0;
    }
    /* The whole query as the whole name ("glucose" is Glucose, not G6P). */
    if (e.names.includes(words.join(' '))) s += 10;
    return s;
  }

  function mark(name, words) {
    const n = norm(name);
    for (const w of words) {
      const i = n.indexOf(w);
      /* NFKD can change length (ligatures, some subscripts); skip the mark
         rather than bold the wrong letters. */
      if (i >= 0 && n.length === name.length)
        return esc(name.slice(0, i)) + '<mark>' + esc(name.slice(i, i + w.length)) + '</mark>' + esc(name.slice(i + w.length));
    }
    return esc(name);
  }

  let uid = 0;

  function mount(root, opts) {
    const id = 'gs' + (++uid);
    root.classList.add('find');
    root.setAttribute('role', 'search');
    root.innerHTML = `
      <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg>
      <input type="search" autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list"
        aria-expanded="false" aria-controls="${id}" aria-label="${esc(opts.placeholder || 'Search')}" placeholder="${esc(opts.placeholder || 'Search')}">
      <ul id="${id}" role="listbox" hidden></ul>`;
    const q = root.querySelector('input'), sugg = root.querySelector('ul');
    const index = opts.items.map(it => ({
      it, name: norm([it.name, it.alias].filter(Boolean).join(' ')),
      names: [it.name, it.alias].filter(Boolean).map(norm), text: norm(it.text),
    }));
    let hits = [], active = -1;

    function show(on) {
      sugg.hidden = !on;
      q.setAttribute('aria-expanded', on);
      q.setAttribute('aria-activedescendant', on && active >= 0 ? `${id}-${active}` : '');
    }

    function search() {
      const words = norm(q.value).split(/\s+/).filter(Boolean);
      hits = words.length
        ? index.map(e => [e, score(e, words)]).filter(x => x[1]).sort((a, b) => b[1] - a[1] || a[0].it.name.length - b[0].it.name.length).map(x => x[0].it)
        : [];
      const shown = words.length ? new Set(hits.map(it => it.key)) : null;
      for (const it of opts.items) if (it.el) it.el.hidden = !!shown && !shown.has(it.key);
      if (opts.empty) {
        opts.empty.hidden = !words.length || hits.length > 0;
        opts.empty.textContent = `Nothing matches “${q.value.trim()}”.`;
      }
      if (opts.onFilter) opts.onFilter(shown);
      active = hits.length ? 0 : -1;
      sugg.innerHTML = hits.slice(0, 6).map((it, i) =>
        `<li role="option" id="${id}-${i}" data-key="${esc(it.key)}" aria-selected="${i === active}">
          <span>${mark(it.name, words)}</span><small>${esc(it.hint || '')}</small></li>`).join('');
      show(hits.length > 0);
    }

    function move(d) {
      const n = sugg.children.length; if (!n) return;
      active = (active + d + n) % n;
      [...sugg.children].forEach((li, i) => li.setAttribute('aria-selected', i === active));
      show(true);
    }

    function pick(key) { show(false); opts.onPick(key); }

    q.addEventListener('input', search);
    q.addEventListener('focus', () => { if (q.value.trim()) search(); });
    q.addEventListener('blur', () => setTimeout(() => show(false), 120));
    q.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sugg.hidden ? search() : move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter' && !sugg.hidden && active >= 0) { e.preventDefault(); pick(hits[active].key); }
      else if (e.key === 'Escape' && !sugg.hidden) { e.stopPropagation(); show(false); }
    });
    /* mousedown, not click: a click would blur the field and close the list first. */
    sugg.addEventListener('mousedown', e => {
      const li = e.target.closest('li'); if (!li) return;
      e.preventDefault(); pick(li.dataset.key);
    });

    return { input: q };
  }

  global.GallerySearch = { mount };
})(window);
