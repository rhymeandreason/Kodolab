/* =============================================================================
 *  lib/track.js — what a class's browser reports from a lesson
 * =============================================================================
 *  Loaded by lib/site.js ONLY when this browser holds a class code (`ss.class`,
 *  set from a `?class=abcd-efgh` link the teacher handed out). A visitor with
 *  no class loads nothing and sends nothing: the lesson is exactly the static
 *  page it was. Everything here posts to api/event.js by beacon and never
 *  waits on an answer, so its worst failure is a row that does not land.
 *
 *      Track.event('phase', { phase: 'mito', i: 2 });   // a page's hooks
 *      Track.event('complete');
 *      Track.event('quiz', { score, total, answers });
 *
 *  A page guards the call (`window.Track && Track.event(...)`): this file is
 *  absent for most visitors, and a page must not depend on it.
 *
 *  WHAT IS SENT ON ITS OWN: `view` on load, and a `beat` every minute
 *  carrying the seconds the tab was VISIBLE in that minute, so the dashboard's
 *  time on task is time the lesson was actually on screen, not time a tab sat
 *  open behind another. The identity is the tutor's own visitor id
 *  (`ss.tutor.visitor`), so a session's questions and its progress share one
 *  id; the nickname is optional, typed once into the join chip, and is the one
 *  thing here a student says about themselves.
 * ========================================================================== */
(function () {
  'use strict';

  var CLASS_KEY = 'ss.class', NAME_KEY = 'ss.class.name', SEEN_KEY = 'ss.class.seen';
  var VISITOR_KEY = 'ss.tutor.visitor';
  var ENDPOINT = '/api/event';
  var TICK = 15, FLUSH = 60;   // seconds: how often visibility is sampled, how often a beat is sent

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var CLASS = get(CLASS_KEY);
  if (!CLASS) return;
  /* The site's own rooms are not lessons. A teacher whose browser holds the
     class (they opened their own link) must not appear on their roster for
     opening the dashboard. */
  if (/^\/(build|teach|login|join|apps|admin|privacy|contribute)(\/|$)/.test(location.pathname.replace(/^\/demos/, '').replace(/\.html$/, ''))) return;

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    var b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return x.toString(16).padStart(2, '0'); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  var VISITOR = get(VISITOR_KEY);
  if (!VISITOR) { VISITOR = uuid(); set(VISITOR_KEY, VISITOR); }

  /* The same spelling lib/site.js's nav matches against: /demos/x.html and /x are one place. */
  var PAGE = location.pathname.replace(/\/+$/, '').replace(/^\/demos/, '').replace(/\.html$/, '').replace(/\/index$/, '') || '/';

  var queue = [];
  function send(extra) {
    var events = queue.splice(0);
    if (!events.length && !extra) return;
    var body = { class: CLASS, visitorId: VISITOR, page: PAGE, events: events };
    if (extra && 'name' in extra) body.name = extra.name;
    var json = JSON.stringify(body);
    var ok = false;
    try { ok = navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([json], { type: 'application/json' })); } catch (e) {}
    if (!ok) fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json, keepalive: true }).catch(function () {});
  }
  /* A beat waits for the flush; anything else is news and goes at once. */
  function event(kind, payload) {
    queue.push({ kind: kind, payload: payload || {} });
    if (kind !== 'beat') send();
  }

  /* ---- time on task ---- */
  var visible = 0;
  setInterval(function () { if (document.visibilityState === 'visible') visible += TICK; }, TICK * 1000);
  function beat() { if (visible > 0) { queue.push({ kind: 'beat', payload: { s: visible } }); visible = 0; } send(); }
  setInterval(beat, FLUSH * 1000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') beat(); });
  window.addEventListener('pagehide', beat);

  event('view', { ref: document.referrer ? document.referrer.slice(0, 200) : '' });

  /* ---- the join chip ----
   * Once per class per browser: says which class this browser joined, offers a
   * name, and says who reads it. Skip and it never asks again; the teacher's
   * roster shows the row unnamed. */
  function chip(className) {
    var el = document.createElement('div');
    el.id = 'classchip';
    el.innerHTML =
      '<style>' +
      '#classchip{position:fixed;left:18px;bottom:18px;z-index:70;width:min(320px,calc(100vw - 36px));padding:14px 16px;' +
      'background:var(--surface-card,#fff);color:var(--text-body,#222);border:1px solid var(--border-hair,#ddd);border-radius:14px;' +
      'box-shadow:0 12px 32px -12px rgba(0,0,0,.35);font:14px/1.45 var(--font-ui,system-ui,sans-serif)}' +
      '#classchip b{color:var(--text-strong,#111)}' +
      '#classchip p{margin:0 0 10px}#classchip .sub{font-size:12.5px;color:var(--text-muted,#666);margin:8px 0 0}' +
      '#classchip form{display:flex;gap:8px}' +
      '#classchip input{flex:1;min-width:0;font:inherit;padding:7px 10px;border:1px solid var(--border-strong,#bbb);border-radius:8px;background:var(--surface-page,#fff);color:inherit}' +
      '#classchip button{font:600 13px var(--font-ui,system-ui,sans-serif);padding:7px 12px;border-radius:8px;border:1px solid var(--border-strong,#bbb);background:var(--surface-page,#fff);color:var(--text-strong,#111);cursor:pointer}' +
      '#classchip button.go{background:var(--text-strong,#111);color:var(--surface-page,#fff);border-color:var(--text-strong,#111)}' +
      '</style>' +
      '<p>You joined <b></b>.</p>' +
      '<form><input maxlength="40" placeholder="Your name or initials (optional)" aria-label="Your name, optional">' +
      '<button type="submit" class="go">Save</button><button type="button" class="skip">Skip</button></form>' +
      '<p class="sub">Only your teacher sees it, next to how far you got.</p>';
    el.querySelector('b').textContent = className;
    var form = el.querySelector('form');
    function done() { set(SEEN_KEY, CLASS); el.remove(); }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = form.querySelector('input').value.replace(/\s+/g, ' ').trim().slice(0, 40);
      if (name) { set(NAME_KEY, name); queue.push({ kind: 'name', payload: { name: name } }); send({ name: name }); }
      done();
    });
    el.querySelector('.skip').addEventListener('click', done);
    document.body.appendChild(el);
  }
  if (get(SEEN_KEY) !== CLASS) {
    fetch(ENDPOINT + '?class=' + encodeURIComponent(CLASS), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (k) { if (k && k.name) chip(k.name); })
      .catch(function () {});
  }

  window.Track = { event: event, class: CLASS, visitor: VISITOR, page: PAGE };
})();
