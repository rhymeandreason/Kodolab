/* =============================================================================
 *  lib/site.js — the chrome every page shares, in one file
 * =============================================================================
 *  Loaded absolutely, once, by every public page:
 *
 *      <script defer src="/demos/lib/site.js"></script>
 *
 *  Absolute because a featured page sets <base href="/demos/"> and a protein
 *  bench sits three folders down; a relative src resolves differently in each.
 *
 *  It owns what is true of the whole site and nothing about any one page:
 *  analytics, the four links in the top bar, a lesson's wordmark menu, the
 *  right-hand half of the document shell's foot, and the wishlist band and feedback form. Anything
 *  site-wide added later belongs here rather than in 30 files.
 *
 *  Only body.kodo gets a foot. A lesson on body.lshell-page is a full-window
 *  scene with no bottom edge to hang one from, and Design.md forbids a second
 *  masthead over it; the privacy notice is reached from the homepage and the
 *  collection pages instead.
 *
 *  A page whose foot is entirely its own writes data-own on it and is skipped.
 */
(function () {
  'use strict';

  // Vercel Web Analytics. Cookieless and no personal data, so no consent
  // banner. The path is served by Vercel's edge, so it 404s under the local
  // dev server and that console line is expected. Skipped inside a frame: a
  // lesson previewed in lessons.html or the node graph, or an app on the
  // builder's shelf, would count as a second pageview of one visit. An
  // /embed/ page is the exception: it is only ever framed by someone else's
  // site, so framed is the one view there is, and its referrer is the host.
  if (window.top === window || location.pathname.indexOf('/embed/') === 0) {
    var s = document.createElement('script');
    s.defer = true;
    s.src = '/_vercel/insights/script.js';
    document.head.appendChild(s);
  }

  /* THE CLASS. A teacher's lesson link carries `?class=abcd-efgh`; it is kept
     here once, stripped from the address bar the way the tutor's `?k=` is, and
     from then on this browser reports to the class (lib/track.js) and asks the
     tutor as it (ask/chat.js). Not the seat code: that one owns apps and lives
     in `ss.class.code`, and a lesson link must not hand out the right to build.
     track.js is loaded only when there is a class, so every other visitor gets
     the page untouched. */
  var CLASS_KEY = 'ss.class';
  (function () {
    var klass = null;
    try {
      var url = new URL(location.href);
      var q = url.searchParams.get('class');
      if (q) {
        klass = q.toLowerCase().replace(/[^a-z0-9]/g, '');
        klass = klass.length === 8 ? klass.slice(0, 4) + '-' + klass.slice(4) : null;
        if (klass) { try { localStorage.setItem(CLASS_KEY, klass); } catch (e) {} }
        url.searchParams.delete('class');
        history.replaceState(null, '', url.pathname + url.search + url.hash);
      }
    } catch (e) {}
    if (!klass) { try { klass = localStorage.getItem(CLASS_KEY); } catch (e) {} }
    if (!klass) return;
    var t = document.createElement('script');
    t.src = '/demos/lib/track.js';
    document.head.appendChild(t);
  })();

  var SITE = '<span>open source <span class="sep">·</span> CC-BY-NC' +
             ' <span class="sep">·</span> <a href="/privacy">privacy</a></span>';

  /* THE THREE PLACES THIS SITE HAS, and the pattern that says you are in one.
     Here rather than in each page's own bar: a link typed into one bar is a
     link the other nine do not have, and which pages carry the nav then
     depends on when each was last edited. Lessons is /lessons, the course in
     teaching order; the front door counts as being there too, since it is the
     same shelf, shorter. */
  var NAV = [
    { text: 'Lessons',    href: '/lessons',    at: /^(\/lessons)?$/ },
    // The collections are one place: a protein's own page and the molecule
    // shelf are both "in the library", and a reader who got there from it
    // should still be able to see where they are.
    { text: 'Library',    href: '/library',    at: /^\/(library|molecules|proteins)(\/|$)/ },
    { text: 'Build',      href: '/build',      at: /^\/build(\/build)?$/ },
  ];
  // The library's two shelves, under its link: hover or the caret opens them,
  // and the folded phone menu lists them indented beneath it.
  var SHELVES = [
    { text: 'Proteins',  href: '/proteins',  at: /^\/proteins$/ },
    { text: 'Molecules', href: '/molecules', at: /^\/molecules$/ },
  ];

  /* THE ACCOUNT. Storage is what the builder's pages last saw (`ss.account`,
     the user as /api/auth describes it), painted at once so the bar does not
     flicker; then one GET reconciles it with the cookie, which is HttpOnly and
     the truth. A server with no database answers 503 and storage stands. */
  var ACCOUNT_KEY = 'ss.account';

  /* Everything in storage that admits someone or edits something, which
     build/apps-client.js and ask/chat.js write. Sign out takes all of it: on a
     shared Chromebook the next person must not inherit a class code, a testing
     link, or the edit tokens for the apps the last one opened. The visitor id
     stays; it admits nobody. */
  var PERSON_KEYS = [ACCOUNT_KEY, 'ss.teacher.code', 'ss.class.code', 'ss.tutor.key', 'ss.apps',
                     CLASS_KEY, 'ss.class.name'];

  function stored() {
    var raw = null;
    try { raw = localStorage.getItem(ACCOUNT_KEY); } catch (e) {}
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return { name: raw }; }  // a bare name is the older shape
  }
  function store(user) {
    try { user ? localStorage.setItem(ACCOUNT_KEY, JSON.stringify(user)) : localStorage.removeItem(ACCOUNT_KEY); }
    catch (e) {}
  }
  function same(a, b) { return JSON.stringify(a || null) === JSON.stringify(b || null); }

  function reconcile() {
    fetch('/api/auth', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (s) {
        if (!s) return;
        var user = s.user || null;
        if (same(user, stored())) return;
        store(user);
        each('.sitelinks, ' + OWN, function (n) { paintAccount(n, user); });
      })
      .catch(function () {});
  }

  function signOut() {
    PERSON_KEYS.forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
    fetch('/api/auth', { method: 'POST', credentials: 'same-origin',
                         headers: { 'Content-Type': 'application/json' },
                         body: JSON.stringify({ action: 'logout' }) })
      .catch(function () {})
      .then(function () { location.href = '/'; });
  }

  function initial(user) {
    var src = (user.name || user.email || '?').trim();
    return src.charAt(0).toUpperCase();
  }

  /* A signed-in person's own links, then the avatar and name that open the
     menu. Everything the account adds is marked `.acct` so a repaint can clear
     it without touching the site's four links. */
  function paintAccount(links, user) {
    document.documentElement.classList.toggle('signed-in', !!user);
    document.documentElement.classList.toggle('teacher', !!(user && user.teacher));
    Array.prototype.slice.call(links.querySelectorAll('.acct')).forEach(function (n) { n.remove(); });
    var here = place();

    if (!user) {
      var a = document.createElement('a');
      a.className = 'acct signin';
      a.href = '/login';
      a.textContent = 'Sign in';
      if (/^\/(login|join|build\/login)(\/|$)/.test(here)) a.setAttribute('aria-current', 'page');
      links.appendChild(a);
      return;
    }

    // The person's own places sit right of a hairline, apart from the site's.
    var rule = document.createElement('span');
    rule.className = 'acct rule';
    links.appendChild(rule);
    var own = [{ text: 'My apps', href: '/apps', at: /^\/(apps|build\/apps)$/ }];
    if (user.teacher) own.unshift({ text: 'Teach', href: '/teach', at: /^\/(teach|build\/teacher)$/ });
    own.forEach(function (n) {
      var a = document.createElement('a');
      a.className = 'acct';
      a.href = n.href;
      a.textContent = n.text;
      if (n.at.test(here)) a.setAttribute('aria-current', 'page');
      links.appendChild(a);
    });

    var d = document.createElement('span');
    d.className = 'acct menu';
    var sum = document.createElement('button');
    sum.type = 'button';
    sum.className = 'summary';
    sum.setAttribute('aria-label', 'Account menu');
    sum.setAttribute('aria-expanded', 'false');
    var av = document.createElement('span');
    av.className = 'avatar';
    av.textContent = initial(user);
    if (user.picture) {
      var img = document.createElement('img');
      img.alt = '';
      img.referrerPolicy = 'no-referrer';  // Google's photo host refuses some referrers
      img.onerror = function () { img.remove(); };
      img.onload  = function () { av.textContent = ''; av.appendChild(img); };
      img.src = user.picture;
    }
    var nm = document.createElement('span');
    nm.className = 'acct-name';  // not `.name`: the library styles that for its cards
    nm.textContent = (user.name || user.email || '').split(/\s+/)[0];
    sum.appendChild(av); sum.appendChild(nm);

    var card = document.createElement('div');
    card.className = 'card';
    // The homepage paints two menus, so the second one's ids take a suffix.
    var sfx = document.getElementById('acct-card') ? '-2' : '';
    card.id = 'acct-card' + sfx;
    card.hidden = true;
    var who = document.createElement('p');
    who.className = 'who';
    var full = document.createElement('b'); full.textContent = user.name || '';
    var mail = document.createElement('span'); mail.textContent = user.email || '';
    who.appendChild(full); who.appendChild(mail);
    var out = document.createElement('button');
    out.type = 'button';
    out.id = 'acct-signout' + sfx;
    out.textContent = 'Sign out';
    out.addEventListener('click', signOut);
    card.appendChild(who); card.appendChild(out);
    d.appendChild(sum); d.appendChild(card);
    links.appendChild(d);

    // A button and a panel rather than <details>: Safari gives a details
    // element no text baseline, so it sat below the bar's other links.
    function open(on) { card.hidden = !on; sum.setAttribute('aria-expanded', String(on)); }
    sum.addEventListener('click', function () { open(card.hidden); });
    document.addEventListener('click', function (e) { if (!card.hidden && !d.contains(e.target)) open(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !card.hidden) { open(false); sum.focus(); } });
  }

  /* ONE SPELLING TO MATCH AGAINST. A featured page is served at a short URL by
     a vercel.json rewrite and at its own path under /demos, and either can be
     what the address bar holds — so the two are reduced to one before the
     patterns above see it. `/demos/proteins/index.html` and `/proteins` both
     come out as `/proteins`, and the front door as ''. */
  function place() { return norm(location.pathname); }
  function norm(path) {
    return path
      .replace(/\/+$/, '')
      .replace(/^\/demos/, '')
      .replace(/\.html$/, '')
      .replace(/\/index$/, '');
  }

  /* Only a page that already has a bar, and only on the document shell — a
     lesson on body.lshell-page is a full-window scene, and Design.md forbids a
     second masthead over it. Same rule the foot below follows. A page with
     its own `header.bar` (lessons, the front door, the builder) writes the
     links itself, in its own ink, and is only given the account. */
  var OWN = 'header.bar nav.links';
  function each(sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), fn); }
  // Below 560px a bar's links fold behind a menu button (kodo.css `.navfold`).
  function fold(links) {
    var row = links.parentNode;
    if (row.querySelector(':scope > .burger')) return;
    var bg = document.createElement('button');
    bg.type = 'button'; bg.className = 'burger';
    bg.setAttribute('aria-label', 'Menu'); bg.setAttribute('aria-expanded', 'false');
    bg.innerHTML = '<i></i><i></i><i></i>';
    bg.addEventListener('click', function () { bg.setAttribute('aria-expanded', String(row.classList.toggle('nav-open'))); });
    row.classList.add('navfold');
    row.insertBefore(bg, links);
  }
  /* Each bar sets its links in its own ink, so a shelf link takes the Library
     link's classes for font and case; the panel's colours are set here, since
     a dark bar's link ink would vanish on it. */
  var DROP_CSS =
    '.navdrop{position:relative;display:inline-flex;align-items:baseline;gap:.25em}' +
    '.navdrop .caret{padding:0 .15em;border:0;background:none;cursor:pointer;color:inherit;font:inherit;line-height:1;opacity:.6}' +
    '.navdrop .caret::before{content:"";display:inline-block;width:.38em;height:.38em;border:solid currentColor;border-width:0 1.5px 1.5px 0;transform:translateY(-.2em) rotate(45deg)}' +
    '.navdrop .caret:hover,.navdrop.open .caret{opacity:1}' +
    '.navdrop .navdrop-list{display:none;position:absolute;left:-1rem;top:100%;z-index:30;padding-top:.6rem}' +
    '.navdrop:hover .navdrop-list,.navdrop:focus-within .navdrop-list,.navdrop.open .navdrop-list{display:block}' +
    '.navdrop .navdrop-list>div{display:flex;flex-direction:column;gap:.1rem;min-width:9rem;padding:.5rem 0;background:var(--surface-card,var(--paper,#fff));border:1px solid rgba(0,0,0,.08);border-radius:12px;box-shadow:var(--shadow-panel,0 6px 24px -12px rgba(0,0,0,.45))}' +
    '.navdrop .navdrop-list a.navshelf{padding:.55rem 1rem;color:var(--text-muted,var(--mute,#6b6b6b))}' +
    '.navdrop .navdrop-list a.navshelf:hover{color:var(--accent,var(--coral,#c55))}' +
    '.navdrop .navdrop-list a.navshelf[aria-current="page"]{color:var(--text-strong,var(--ink,#222))}' +
    '@media (max-width:560px){.navdrop{flex-direction:column;align-items:flex-start}.navdrop .caret{display:none}' +
    '.navdrop .navdrop-list{display:block;position:static;padding:0}.navdrop .navdrop-list>div{background:none;border:0;box-shadow:none;min-width:0;padding:.3rem 0 0 1rem}' +
    '.navdrop .navdrop-list a.navshelf{padding:.5rem 0}}';
  function drop(links) {
    var lib = links.querySelector(':scope > a[href="/library"]');
    if (!lib) return;
    if (!document.getElementById('navdrop-css')) {
      var st = document.createElement('style');
      st.id = 'navdrop-css'; st.textContent = DROP_CSS;
      document.head.appendChild(st);
    }
    var here = place();
    var wrap = document.createElement('span');
    wrap.className = 'navdrop';
    links.insertBefore(wrap, lib);
    wrap.appendChild(lib);
    var caret = document.createElement('button');
    caret.type = 'button'; caret.className = 'caret';
    caret.setAttribute('aria-label', 'Library shelves'); caret.setAttribute('aria-expanded', 'false');
    wrap.appendChild(caret);
    var panel = document.createElement('div');
    panel.className = 'navdrop-list';
    var list = document.createElement('div');
    SHELVES.forEach(function (n) {
      var a = document.createElement('a');
      a.href = n.href; a.textContent = n.text;
      a.className = (lib.className + ' navshelf').trim();
      if (n.at.test(here)) a.setAttribute('aria-current', 'page');
      list.appendChild(a);
    });
    panel.appendChild(list);
    wrap.appendChild(panel);
    function open(on) { wrap.classList.toggle('open', on); caret.setAttribute('aria-expanded', String(on)); }
    caret.addEventListener('click', function () { open(!wrap.classList.contains('open')); });
    document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) open(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') open(false); });
  }

  function nav() {
    var own = document.querySelectorAll(OWN);
    if (own.length) { each(OWN, function (n) { drop(n); paintAccount(n, stored()); }); each('header.bar nav.links', fold); reconcile(); return; }
    if (!document.body.classList.contains('kodo')) return;
    var bar = document.querySelector('.sitenav');
    if (!bar || bar.querySelector('.sitelinks')) return;

    var here = place();
    var links = document.createElement('nav');
    links.className = 'sitelinks';
    links.setAttribute('aria-label', 'Site');
    NAV.forEach(function (n) {
      var a = document.createElement('a');
      a.href = n.href;
      a.textContent = n.text;
      if (n.at.test(here)) a.setAttribute('aria-current', 'page');
      links.appendChild(a);
    });

    // The page may have put its own spacer in; adding a second would divide the
    // slack between them and leave the links mid-bar.
    if (!bar.querySelector('.spacer')) {
      var sp = document.createElement('span');
      sp.className = 'spacer';
      bar.appendChild(sp);
    }
    bar.appendChild(links);
    drop(links);
    fold(links);
    paintAccount(links, stored());
    reconcile();
  }

  function foot() {
    if (!document.body.classList.contains('kodo')) return;

    var f = document.querySelector('.sitefoot');
    if (f && f.hasAttribute('data-own')) return;

    if (!f) {
      f = document.createElement('footer');
      f.className = 'sitefoot';
      (document.querySelector('.page') || document.body).appendChild(f);
    }
    // The page owns the left span, this owns the right. A foot with nothing of
    // its own still needs the left slot, or flex pushes the site line left.
    if (!f.children.length) f.appendChild(document.createElement('span'));
    f.insertAdjacentHTML('beforeend', SITE);
  }

  /* The info button, on a lesson that carries #lesson-about (tools/seo.js
     writes it). Top-right of the floating bar: it is site chrome, and every
     lesson's stage corners are already spoken for. Phosphor BOLD glyphs, the one weight
     every lesson loads (water also loads regular; nothing else does). Closes on its own X, on Escape, and on a click outside. */
  function about() {
    var panel = document.getElementById('lesson-about');
    var bar = document.querySelector('.sitenav.floating');
    if (!panel || !bar || bar.querySelector('.aboutbtn')) return;
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'iconbtn aboutbtn';
    b.innerHTML = '<i class="ph-bold ph-info"></i>';
    b.setAttribute('aria-label', 'About this lesson'); b.title = 'About this lesson';
    b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-controls', 'lesson-about');
    var x = document.createElement('button');
    x.type = 'button'; x.className = 'iconbtn aboutclose';
    x.innerHTML = '<i class="ph-bold ph-x"></i>'; x.setAttribute('aria-label', 'Close');
    panel.insertAdjacentElement('afterbegin', x);
    // The one place a full-window lesson can be talked back to.
    var fb = document.createElement('p');
    fb.className = 'aboutfb';
    fb.innerHTML = 'Something off, or a wish for this lesson? <button type="button" class="textbtn" data-feedback="wish">Tell us</button>';
    panel.appendChild(fb);
    fb.querySelector('button').addEventListener('click', function () { set(false); });
    function set(open) { panel.hidden = !open; b.setAttribute('aria-expanded', String(open)); }
    b.addEventListener('click', function () { set(panel.hidden); });
    x.addEventListener('click', function () { set(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
    document.addEventListener('pointerdown', function (e) {
      if (!panel.hidden && !panel.contains(e.target) && !b.contains(e.target)) set(false);
    });
    if (!bar.querySelector('.spacer')) {
      var sp = document.createElement('span'); sp.className = 'spacer'; bar.appendChild(sp);
    }
    bar.appendChild(b);
  }

  /* THE WISHLIST BAND, above the footer of any page a reader browses, and the
     door to the feedback form. Not on the tools, the teacher's pages or sign-in:
     a band asking what to build next is noise to someone mid-task. A page can
     also opt out with data-nowish on its footer. css/feedback.css is linked
     here; lib/feedback.js only on the first open. */
  var NO_WISH = /^\/(build|tools|apps|login|join|teach|beta)(\/|$)/;
  var WISH_MOL =
    '<svg class="wb-mol" viewBox="0 0 120 120" aria-hidden="true"><g>' +
    '<line x1="60" y1="58" x2="60" y2="18"/><line x1="60" y1="58" x2="98" y2="74"/>' +
    '<line x1="60" y1="58" x2="24" y2="80"/><line x1="24" y1="80" x2="34" y2="108"/>' +
    '<circle class="a-love"  cx="60" cy="58" r="13" fill="var(--hue-green)"/>' +
    '<circle class="a-wish"  cx="60" cy="18" r="10" fill="var(--hue-blue)"/>' +
    '<circle class="a-wrong" cx="98" cy="74" r="10" fill="var(--hue-coral)"/>' +
    '<circle cx="24" cy="80" r="9" fill="var(--hue-amber)"/>' +
    '<circle cx="34" cy="108" r="7" fill="var(--hue-violet)"/>' +
    '</g></svg>';
  var WISH =
    '<section class="wishband" aria-labelledby="wb-h">' + WISH_MOL +
    '<div class="wb-copy"><p class="wb-kick">Feedback</p>' +
    '<h2 id="wb-h">What should Kodolab build next?</h2>' +
    '<p>A molecule you want to turn over, a lesson that is missing, a mistake you spotted. Every note is read.</p></div>' +
    '<div class="wb-chips">' +
    '<button type="button" data-feedback="wish" style="--wb-hue:var(--hue-blue)"><i></i>I wish it had…</button>' +
    '<button type="button" data-feedback="wrong" style="--wb-hue:var(--hue-coral)"><i></i>Something’s off</button>' +
    '<button type="button" data-feedback="love" style="--wb-hue:var(--hue-green)"><i></i>I love this</button>' +
    '</div></section>';

  function sheet(href) {
    if (document.querySelector('link[href="' + href + '"]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href;
    document.head.appendChild(l);
  }

  function wish() {
    if (NO_WISH.test(place()) || document.body.classList.contains('teach')) return;
    var f = document.querySelector('footer.sitefoot') ||
            (!document.body.classList.contains('kodo') && document.querySelector('body > footer'));
    if (!f || f.hasAttribute('data-nowish') || document.querySelector('.wishband')) return;
    sheet('/demos/css/feedback.css');
    // A brand page's footer holds a .wrap at the page's measure; the band sits
    // in one of its own so it lines up with the content above.
    if (f.querySelector(':scope > .wrap')) {
      var w = document.createElement('div');
      w.className = 'wrap';
      w.innerHTML = WISH;
      f.parentNode.insertBefore(w, f);
    } else f.insertAdjacentHTML('beforebegin', WISH);
    var band = document.querySelector('.wishband');
    band.addEventListener('pointerover', function (e) {
      var b = e.target.closest('[data-feedback]');
      if (b) band.setAttribute('data-hot', b.getAttribute('data-feedback'));
    });
    band.addEventListener('pointerleave', function () { band.removeAttribute('data-hot'); });
  }

  /* Anything with data-feedback opens the form, on any page, so a lesson's own
     button or a link in prose needs no script of its own. `#feedback` in the
     address opens it too, which makes it something to link to. */
  var fbLoading = null;
  function feedback(kind) {
    sheet('/demos/css/feedback.css');
    if (window.KodoFeedback) return window.KodoFeedback.open(kind);
    if (!fbLoading) {
      fbLoading = new Promise(function (ok, no) {
        var s = document.createElement('script');
        s.src = '/demos/lib/feedback.js';
        s.onload = ok; s.onerror = no;
        document.head.appendChild(s);
      });
    }
    fbLoading.then(function () { window.KodoFeedback.open(kind); }, function () {
      fbLoading = null;
      location.href = 'mailto:mary@kodolab.org';
    });
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-feedback]');
    if (!t) return;
    e.preventDefault();
    feedback(t.getAttribute('data-feedback') || 'wish');
  });
  function hash() { if (location.hash === '#feedback') feedback('wish'); }
  window.addEventListener('hashchange', hash);

  /* THE LESSON MENU. A full-window lesson carries only the wordmark, so the
     wordmark opens a panel instead of leaving: this unit's lessons, then the
     site's places. Same slot on both lesson chromes (`.sitenav.floating` and
     `.lshell-brand`), so it adds nothing to the scene until it is opened. A
     modifier click still goes home, and in someone else's frame there is no
     menu, since the mark is not a link there either. */
  var LM_CSS =
    '.lmenu{position:relative;display:inline-flex;align-items:baseline;gap:.3em;pointer-events:auto}' +
    '.lmenu .lm-caret{padding:0 .2em;border:0;background:none;cursor:pointer;color:inherit;font:inherit;line-height:1;opacity:.55}' +
    '.lmenu .lm-caret::before{content:"";display:inline-block;width:.4em;height:.4em;border:solid currentColor;border-width:0 1.5px 1.5px 0;transform:translateY(-.25em) rotate(45deg);transition:transform .15s}' +
    '.lmenu .lm-caret:hover,.lmenu.open .lm-caret{opacity:1}' +
    '.lmenu.open .lm-caret::before{transform:translateY(0) rotate(225deg)}' +
    '.lm-panel{position:absolute;left:-.75rem;top:calc(100% + .6rem);z-index:40;min-width:15rem;width:max-content;max-height:calc(100vh - 5rem);overflow:auto;padding:.5rem 0;' +
      'background:var(--surface-card,#fff);border:1px solid rgba(0,0,0,.08);border-radius:12px;box-shadow:var(--shadow-panel,0 10px 30px -12px rgba(0,0,0,.45));' +
      'font:400 14px/1.3 var(--sans,system-ui,sans-serif);letter-spacing:0;text-transform:none;color:var(--text-strong,#222);text-align:left}' +
    '.lm-panel[hidden]{display:none}' +
    '.lm-panel .lm-h{margin:0;padding:.55rem 1rem .3rem;font-size:11px;font-weight:500;letter-spacing:.16em;text-transform:uppercase;color:var(--text-muted,#6b6b6b)}' +
    '.lm-panel .lm-h a{color:inherit;text-decoration:none}.lm-panel .lm-h a:hover{color:var(--accent,#c55)}' +
    '.lm-panel a.lm-i{display:block;padding:.42rem 1rem;color:var(--text-muted,#6b6b6b);text-decoration:none}' +
    '.lm-panel a.lm-i:hover{color:var(--accent,#c55);background:rgba(0,0,0,.03)}' +
    '.lm-panel a.lm-i[aria-current="page"]{color:var(--text-strong,#222);font-weight:500;box-shadow:inset 2px 0 0 var(--accent,#c55)}' +
    '.lm-panel hr{margin:.45rem 0;border:0;border-top:1px solid rgba(0,0,0,.08)}' +
    '.lm-panel .lm-site{display:flex;white-space:nowrap;padding:0 .4rem}.lm-panel .lm-site a.lm-i{padding:.42rem .6rem}';

  function lessons(cb) {
    if (window.Lessons && window.LessonUnits) return cb();
    var s = document.createElement('script');
    s.src = '/demos/lib/lessons.js';
    s.onload = cb;
    document.head.appendChild(s);
  }

  function lessonMenu() {
    if (window.top !== window) return;
    var mark = document.querySelector('.lshell-brand > .mark, .sitenav.floating > .mark');
    if (!mark || mark.parentNode.querySelector('.sitelinks, .lmenu')) return;
    if (!document.getElementById('lmenu-css')) {
      var st = document.createElement('style');
      st.id = 'lmenu-css'; st.textContent = LM_CSS;
      document.head.appendChild(st);
    }
    var wrap = document.createElement('span');
    wrap.className = 'lmenu';
    mark.parentNode.insertBefore(wrap, mark);
    wrap.appendChild(mark);
    mark.setAttribute('aria-haspopup', 'true');
    var caret = document.createElement('button');
    caret.type = 'button'; caret.className = 'lm-caret';
    caret.setAttribute('aria-label', 'Site menu'); caret.setAttribute('aria-expanded', 'false');
    wrap.appendChild(caret);
    var panel = document.createElement('div');
    panel.className = 'lm-panel'; panel.hidden = true;
    wrap.appendChild(panel);

    function item(text, href, current) {
      var a = document.createElement('a');
      a.className = 'lm-i'; a.href = href; a.textContent = text;
      if (current) a.setAttribute('aria-current', 'page');
      return a;
    }
    function fill() {
      var here = place(), L = window.Lessons || [], U = window.LessonUnits || [];
      var me = L.filter(function (l) { return l.url && (norm(l.url) === here || (l.file && norm(l.file) === here)); })[0];
      var unit = me && U.filter(function (u) { return u.key === me.unit; })[0];
      panel.textContent = '';
      if (unit) {
        var h = document.createElement('p'); h.className = 'lm-h';
        h.appendChild(item(unit.title, '/lessons#' + unit.key)).className = '';
        panel.appendChild(h);
        L.forEach(function (l) {
          if (l.unit === unit.key && l.url && !l.soon) panel.appendChild(item(l.title, l.url, l === me));
        });
        panel.appendChild(document.createElement('hr'));
      }
      var site = document.createElement('div'); site.className = 'lm-site';
      site.appendChild(item('Home', '/'));
      NAV.forEach(function (n) { site.appendChild(item(n.text, n.href, n.at.test(here))); });
      var user = stored();
      if (!user) site.appendChild(item('Sign in', '/login'));
      else {
        if (user.teacher) site.appendChild(item('Teach', '/teach'));
        site.appendChild(item('My apps', '/apps'));
      }
      panel.appendChild(site);
    }
    function open(on) {
      panel.hidden = !on;
      wrap.classList.toggle('open', on);
      caret.setAttribute('aria-expanded', String(on));
      mark.setAttribute('aria-expanded', String(on));
    }
    function toggle(e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
      e.preventDefault();
      open(panel.hidden);
    }
    mark.addEventListener('click', toggle);
    caret.addEventListener('click', toggle);
    document.addEventListener('pointerdown', function (e) { if (!panel.hidden && !wrap.contains(e.target)) open(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) { open(false); caret.focus(); } });
    fill();
    lessons(fill);
  }

  function chrome() { nav(); lessonMenu(); foot(); about(); wish(); hash(); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', chrome);
  } else chrome();
})();
