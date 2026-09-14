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

  /* The account, as the builder's pages last saw it. A name in storage, not a
     request per page view: the session cookie is HttpOnly and a stale name only
     costs a click, since /login shows the truth. */
  function account() {
    var name = null;
    try { name = localStorage.getItem('ss.account'); } catch (e) {}
    return {
      text: name ? name.split(/\s+/)[0] : 'Sign in',
      href: '/login',
      at: /^\/(login|join|build\/login)(\/|$)/,
    };
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
     second masthead over it. Same rule the foot below follows. */
  function nav() {
    if (!document.body.classList.contains('kodo')) return;
    var bar = document.querySelector('.sitenav');
    if (!bar || bar.querySelector('.sitelinks')) return;

    var here = place();
    var links = document.createElement('nav');
    links.className = 'sitelinks';
    links.setAttribute('aria-label', 'Site');
    NAV.concat(account()).forEach(function (n) {
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

  function chrome() { nav(); foot(); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', chrome);
  } else chrome();
})();
