/* lab/page.js: everything around a lab that every lab page would otherwise repeat.
 * A classic script, not a module, so it runs during parsing: the head it writes is in place
 * before any module loads, and the chrome is on screen before three.js has downloaded.
 *
 * In <head>, after the <title> (and the seo block):
 *   <script src="../page.js"></script>     writes the import map, fonts, icons and lab.css
 *   <link rel="stylesheet" href="styles.css">   the lab's own sheet, after lab.css
 *
 * In <body>, the page writes only its own content, then builds the rest:
 *   <div id="app">
 *     …the lab's own backgrounds and panels (Ecoli's .uv-bg, Photosynthesis's data panel)
 *     <div class="lab-info" hidden>…kicker, h2, paragraphs…</div>         → the info modal
 *     <div class="lab-intro">[.intro-art] …kicker, h2, p, .keys…</div>   → the intro card
 *   </div>
 *   <script>LabPage.chrome()</script>
 *
 * chrome() adds the canvas, the zoom lens and label layers, the topbar (wordmark, title from
 * #app[data-title] or <title>, view / info / restart buttons), the procedure panel, and wraps
 * the two content blocks. The info modal opens, closes and hears Escape here; the view and
 * restart buttons need the stage, so chrome.js's bindChrome() wires them. zoom.js adds its
 * own circles and per-level backgrounds.
 */
(function () {
  'use strict';
  var THREE_VERSION = '0.128.0';  // the only place three.js is pinned; README "Upgrading three.js"
  var PHOSPHOR = 'https://unpkg.com/@phosphor-icons/web@2.1.1/src/';
  var here = document.currentScript.src;

  // document.write, not appendChild: an import map is only honoured if it is in the document
  // before the first module script, and a parser-inserted one is the case every browser
  // supports. The same call keeps lab.css ahead of the page's own styles.css.
  var map = { imports: {
    three: 'https://cdn.jsdelivr.net/npm/three@' + THREE_VERSION + '/build/three.module.js',
    'three/addons/': 'https://cdn.jsdelivr.net/npm/three@' + THREE_VERSION + '/examples/jsm/',
  } };
  var css = function (href) { return '<link rel="stylesheet" href="' + href + '">'; };
  document.write([
    '<script type="importmap">' + JSON.stringify(map) + '</script>',
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    css('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;600&display=swap'),
    css(PHOSPHOR + 'regular/style.css'), css(PHOSPHOR + 'fill/style.css'), css(PHOSPHOR + 'bold/style.css'),
    css(new URL('lab.css', here).href),
  ].join('\n'));

  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (html) e.innerHTML = html;
    return e;
  }
  function moveChildren(from, to) { while (from.firstChild) to.appendChild(from.firstChild); }

  function chrome() {
    var app = document.getElementById('app');
    if (!app) throw new Error('lab/page.js: no #app');

    // the 3D layers go in front of the page's own backgrounds and behind everything else
    var bgs = app.querySelectorAll(':scope > .uv-bg, :scope > .scale-bg, :scope > [data-bg]');
    var after = bgs.length ? bgs[bgs.length - 1] : null;
    var layers = [
      el('canvas', { id: 'scene' }),
      el('div', { id: 'zoomLens', class: 'zoom-lens', 'aria-hidden': 'true' }),
      el('div', { id: 'zoomLabels', 'aria-hidden': 'true' }),
    ];
    var title = app.dataset.title || document.title;
    var top = el('header', { class: 'topbar' },
      '<div class="brand lab-brand chrome-title">'
      + '<a class="mark" href="/"><img src="/kodolab-wordmark.svg" alt="kodolab"></a>'
      + '<div class="brand-title"><h1></h1></div></div>'
      + '<div class="top-actions">'
      + '<button class="icon-btn" id="btnView" title="Reset view" aria-label="Reset view"><i class="ph ph-crosshair-simple"></i></button>'
      + '<button class="icon-btn" id="btnInfo" title="About this experiment" aria-label="About this experiment"><i class="ph ph-info"></i></button>'
      + '<button class="icon-btn" id="btnRestart" title="Restart lab" aria-label="Restart lab"><i class="ph ph-arrow-counter-clockwise"></i></button>'
      + '</div>');
    top.querySelector('h1').textContent = title;
    var panel = el('aside', { class: 'panel steps-panel', id: 'stepsPanel' });
    [].concat(layers, [top, panel]).reduce(function (prev, node) {
      app.insertBefore(node, prev ? prev.nextSibling : app.firstChild);
      return node;
    }, after);

    // the info modal around .lab-info
    var info = app.querySelector(':scope > .lab-info');
    if (info) {
      var modal = el('div', { class: 'modal', id: 'infoModal', role: 'dialog', 'aria-modal': 'true', hidden: '' });
      var card = el('div', { class: 'modal-card' },
        '<button class="icon-btn modal-close" id="btnCloseInfo" title="Close" aria-label="Close"><i class="ph ph-x"></i></button>');
      moveChildren(info, card);
      modal.appendChild(card);
      info.replaceWith(modal);
      var open = function (on) { modal.hidden = !on; if (on) card.querySelector('.modal-close').focus(); };
      document.getElementById('btnInfo').addEventListener('click', function () { open(true); });
      card.querySelector('.modal-close').addEventListener('click', function () { open(false); });
      modal.addEventListener('click', function (e) { if (e.target === modal) open(false); });
      window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden) open(false); });
    } else {
      document.getElementById('btnInfo').hidden = true;
    }

    // the intro card around .lab-intro; the page may bring its own .intro-art (Ecoli's plasmid)
    var intro = app.querySelector(':scope > .lab-intro');
    if (intro) {
      var wrap = el('div', { class: 'intro', id: 'intro' });
      var icard = el('div', { class: 'intro-card' });
      var art = intro.querySelector(':scope > .intro-art') || el('div', { class: 'intro-art' });
      var text = el('div');
      moveChildren(intro, text);
      if (art.parentNode === text) text.removeChild(art);
      if (!text.querySelector('.intro-start')) {
        text.appendChild(el('button', { class: 'btn intro-start', id: 'startBtn' },
          'Start the experiment <i class="ph-bold ph-arrow-right"></i>'));
      }
      // intro.js swaps the loading line for Start once the bench has drawn its first frame
      var startBtn = text.querySelector('.intro-start');
      startBtn.hidden = true;
      startBtn.insertAdjacentElement('afterend',
        el('div', { class: 'intro-loading', role: 'status' }, '<span class="intro-spin"></span>Setting up the bench…'));
      icard.appendChild(art); icard.appendChild(text); wrap.appendChild(icard);
      intro.replaceWith(wrap);
    }
    // the modal and the intro sit over everything the page added
    ['infoModal', 'intro'].forEach(function (id) { var n = document.getElementById(id); if (n) app.appendChild(n); });
  }

  window.LabPage = { chrome: chrome, THREE_VERSION: THREE_VERSION };
})();
