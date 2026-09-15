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
 *  analytics, the four links in the top bar, and the right-hand half of the
 *  document shell's foot. Anything site-wide added later belongs here rather
 *  than in 30 files.
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
  // dev server and that console line is expected.
  var s = document.createElement('script');
  s.defer = true;
  s.src = '/_vercel/insights/script.js';
  document.head.appendChild(s);

  var SITE = '<span>open source <span class="sep">·</span> CC-BY-NC' +
             ' <span class="sep">·</span> <a href="/privacy">privacy</a></span>';

  /* THE FOUR PLACES THIS SITE HAS, and the pattern that says you are in one.
     Here rather than in each page's own bar: a link typed into one bar is a
     link the other nine do not have, and which pages carry the nav then
     depends on when each was last edited. Lessons is the front door's own
     shelf — the homepage IS the lesson index, so it is a fragment on it and
     not a page of its own. */
  var NAV = [
    { text: 'Lessons',    href: '/#field',     at: /^$/ },
    // The collections are one place: a protein's own page and the molecule
    // shelf are both "in the library", and a reader who got there from it
    // should still be able to see where they are.
    { text: 'Library',    href: '/library',    at: /^\/(library|molecules|proteins)(\/|$)/ },
    { text: 'Contribute', href: '/contribute', at: /^\/contribute$/ },
    { text: 'Build',      href: '/build',      at: /^\/build(\/build)?$/ },
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
  var PERSON_KEYS = [ACCOUNT_KEY, 'ss.teacher.code', 'ss.class.code', 'ss.tutor.key', 'ss.apps'];

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
  function place() {
    return location.pathname
      .replace(/\/+$/, '')
      .replace(/^\/demos/, '')
      .replace(/\.html$/, '')
      .replace(/\/index$/, '');
  }

  /* Only a page that already has a bar, and only on the document shell — a
     lesson on body.lshell-page is a full-window scene, and Design.md forbids a
     second masthead over it. Same rule the foot below follows. The builder's
     bar and the front door's mast are the two exceptions: each writes the four
     links itself, in its own ink, and is only given the account. */
  var OWN = 'header.bar > nav.links, .mast nav.links, .hero nav.links';
  function each(sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), fn); }
  function nav() {
    var own = document.querySelectorAll(OWN);
    if (own.length) { each(OWN, function (n) { paintAccount(n, stored()); }); reconcile(); return; }
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

  function chrome() { nav(); foot(); about(); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', chrome);
  } else chrome();
})();
