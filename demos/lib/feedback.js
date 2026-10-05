/* =============================================================================
 *  lib/feedback.js — the feedback form, as a modal over any page
 * =============================================================================
 *  lib/site.js loads this on the first click of anything carrying
 *  `data-feedback` (its value picks the kind), or on a `#feedback` address,
 *  so a page that never opens it never downloads it. Styles are
 *  css/feedback.css, which site.js has already loaded for the footer band.
 *
 *      KodoFeedback.open('wish')     // 'wrong' · 'wish' · 'love'
 *
 *  Posts to api/feedback.js with the page it was opened on, so a note about
 *  "the arrow" arrives knowing which lesson's arrow. The email field is
 *  optional and filled from the signed-in account when there is one.
 * ========================================================================== */
(function () {
  'use strict';
  if (window.KodoFeedback) return;

  var KINDS = [
    { id: 'wrong', label: 'Something’s off',  hue: 'var(--hue-coral)',
      ph: 'What looks wrong, broken or confusing? The step or molecule helps.' },
    { id: 'wish',  label: 'I wish it had…',   hue: 'var(--hue-blue)',
      ph: 'A lesson, a molecule, a feature, an idea. Big or small.' },
    { id: 'love',  label: 'I love this',       hue: 'var(--hue-green)',
      ph: 'What worked for you? It tells us what to make more of.' },
  ];

  var root, form, text, email, status, send, kind = 'wish', lastFocus = null;

  function account() {
    try { return JSON.parse(localStorage.getItem('ss.account') || 'null'); } catch (e) { return null; }
  }
  function visitor() {
    try { return localStorage.getItem('ss.tutor.visitor'); } catch (e) { return null; }
  }
  function place() {
    return location.pathname.replace(/\/+$/, '').replace(/^\/demos/, '').replace(/\.html$/, '').replace(/\/index$/, '') || '/';
  }

  function build() {
    root = document.createElement('div');
    root.className = 'fb';
    root.hidden = true;
    root.innerHTML =
      '<div class="fb-back" data-close></div>' +
      '<div class="fb-card" role="dialog" aria-modal="true" aria-labelledby="fb-title">' +
        '<button type="button" class="fb-x" data-close aria-label="Close">×</button>' +
        '<form novalidate>' +
          '<h2 id="fb-title">Feedback</h2>' +
          '<p class="fb-deck">I’d love to hear from you!</p>' +
          '<div class="fb-kinds" role="radiogroup" aria-label="Kind of note">' +
            KINDS.map(function (k) {
              return '<button type="button" role="radio" data-kind="' + k.id + '" style="--fb-hue:' + k.hue + '">' +
                     '<i></i>' + k.label + '</button>';
            }).join('') +
          '</div>' +
          '<label class="fb-sr" for="fb-text">Your note</label>' +
          '<textarea id="fb-text" rows="5" maxlength="4000" required></textarea>' +
          '<label class="fb-email"><span>Email, if you would like a reply</span>' +
            '<input type="email" autocomplete="email" maxlength="200" placeholder="optional"></label>' +
          '<input class="fb-hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">' +
          '<div class="fb-foot"><span class="fb-from"></span><button type="submit" class="fb-send">Send</button></div>' +
          '<p class="fb-status" role="status" aria-live="polite"></p>' +
        '</form>' +
        '<div class="fb-done" hidden>' +
          '<div class="fb-burst" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>' +
          '<h2>Thank you</h2><p>Every note is read. If you left an address, expect a reply.</p>' +
          '<button type="button" class="fb-send" data-close>Back to the page</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);

    form   = root.querySelector('form');
    text   = root.querySelector('textarea');
    email  = root.querySelector('.fb-email input');
    status = root.querySelector('.fb-status');
    send   = form.querySelector('.fb-send');

    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) close();
      var k = e.target.closest('[data-kind]');
      if (k) { pick(k.getAttribute('data-kind')); text.focus(); }
    });
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Tab') trap(e);
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !form.hidden) form.requestSubmit();
      var k = e.target.closest('[data-kind]');
      if (k && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        var i = KINDS.findIndex(function (x) { return x.id === kind; });
        i = (i + (e.key === 'ArrowRight' ? 1 : KINDS.length - 1)) % KINDS.length;
        pick(KINDS[i].id);
        root.querySelector('[data-kind="' + KINDS[i].id + '"]').focus();
      }
      // A lesson steps on arrow keys; typing here must not turn its page.
      e.stopPropagation();
    });
    form.addEventListener('submit', submit);
  }

  function pick(id) {
    kind = id;
    root.querySelectorAll('[data-kind]').forEach(function (b) {
      var on = b.getAttribute('data-kind') === id;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    var k = KINDS.filter(function (k) { return k.id === id; })[0];
    text.placeholder = k.ph;
    root.querySelector('.fb-card').style.setProperty('--fb-hue', k.hue);
  }

  function trap(e) {
    var f = Array.prototype.filter.call(
      root.querySelectorAll('button, textarea, input:not(.fb-hp)'),
      function (n) { return n.offsetParent !== null && n.tabIndex >= 0; });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function open(which) {
    if (!root) build();
    lastFocus = document.activeElement;
    form.hidden = false;
    root.querySelector('.fb-done').hidden = true;
    status.textContent = '';
    send.disabled = false;
    pick(KINDS.some(function (k) { return k.id === which; }) ? which : kind);
    var a = account();
    if (a && a.email && !email.value) email.value = a.email;
    root.querySelector('.fb-from').textContent = 'From ' + place();
    root.hidden = false;
    document.documentElement.classList.add('fb-open');
    void root.offsetWidth;   // commit the hidden state so the fade runs
    root.classList.add('in');
    text.focus();
  }

  function close() {
    if (!root || root.hidden) return;
    root.classList.remove('in');
    root.hidden = true;
    document.documentElement.classList.remove('fb-open');
    if (location.hash === '#feedback') history.replaceState(null, '', location.pathname + location.search);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function submit(e) {
    e.preventDefault();
    var body = text.value.trim();
    if (!body) { status.textContent = 'Write a few words first.'; text.focus(); return; }
    send.disabled = true;
    status.textContent = 'Sending…';
    fetch('/api/feedback', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: kind, body: body, email: email.value.trim(), page: place(),
                             visitorId: visitor(), website: form.querySelector('.fb-hp').value }),
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.j.error || 'It did not go through.');
        text.value = '';
        form.hidden = true;
        var done = root.querySelector('.fb-done');
        done.hidden = false;
        done.querySelector('button').focus();
      })
      .catch(function (err) {
        send.disabled = false;
        status.innerHTML = '';
        status.appendChild(document.createTextNode((err && err.message) || 'It did not go through.'));
        if (!/@/.test(status.textContent)) {
          status.appendChild(document.createTextNode(' Or write to '));
          var m = document.createElement('a');
          m.href = 'mailto:mary@kodolab.org?body=' + encodeURIComponent(body);
          m.textContent = 'mary@kodolab.org';
          status.appendChild(m);
        }
      });
  }

  window.KodoFeedback = { open: open, close: close };
})();
