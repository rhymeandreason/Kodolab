/* =============================================================================
 *  lib/track.js — what a class's browser reports from a lesson
 * =============================================================================
 *  Loaded by lib/site.js ONLY when this browser holds a class code (`ss.class`,
 *  set from a `?class=abcd-efgh` link the teacher handed out). A visitor with
 *  no class loads nothing and sends nothing: the lesson is exactly the static
 *  page it was. Everything here posts to api/event.js by beacon and never
 *  waits on an answer, so its worst failure is a row that does not land.
 *
 *      Track.step(2, 5, 'Link step & Krebs');           // the step a page reached
 *      Track.event('complete');
 *      Track.event('quiz', { score, total, answers });
 *
 *  EVERY LESSON DRIVES ITS OWN STEPS — there is no one shell to hook, so the
 *  page calls `step` from wherever it commits a step, handing the name the
 *  student just read and how many there are. The dashboard prints that name
 *  and sizes its pips from that count, so a lesson's steps are never a second
 *  copy on the dashboard that a re-cut of the lesson silently falsifies.
 *
 *  A page guards the call (`window.Track && Track.event(...)`): this file is
 *  absent for most visitors, and a page must not depend on it.
 *
 *  WHAT IS SENT ON ITS OWN: `view` on load, and a `beat` every minute
 *  carrying the seconds the tab was VISIBLE in that minute, so the dashboard's
 *  time on task is time the lesson was actually on screen, not time a tab sat
 *  open behind another. The identity is the tutor's own visitor id
 *  (`ss.tutor.visitor`), so a session's questions and its progress share one
 *  id; the nickname is optional, behind a gear the page never pushes, and is
 *  the one thing here a student says about themselves.
 * ========================================================================== */
(function () {
  'use strict';

  var CLASS_KEY = 'ss.class', NAME_KEY = 'ss.class.name';
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
  if (/^\/(build|teach|beta|login|join|apps|admin|privacy|contribute)(\/|$)/.test(location.pathname.replace(/^\/demos/, '').replace(/\.html$/, ''))) return;

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

  /* `i` orders the steps and is what the furthest-reached roll-up sorts on;
     `n` is how many the lesson has. A page with no name for a step gets a
     number, which is worse for a teacher but still ordered. */
  function step(i, n, title) {
    i = Number(i) || 0;
    var name = String(title == null ? '' : title).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    event('phase', { phase: (name || 'Step ' + (i + 1)).slice(0, 80), i: i, n: Number(n) || 0 });
  }

  /* ---- time on task ---- */
  var visible = 0;
  setInterval(function () { if (document.visibilityState === 'visible') visible += TICK; }, TICK * 1000);
  function beat() { if (visible > 0) { queue.push({ kind: 'beat', payload: { s: visible } }); visible = 0; } send(); }
  setInterval(beat, FLUSH * 1000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') beat(); });
  window.addEventListener('pagehide', beat);

  event('view', { ref: document.referrer ? document.referrer.slice(0, 200) : '' });

  /* ---- class settings ----
   * A small gear, not a prompt: the class is already joined by the link, and
   * the name is optional, so nothing asks for it. The gear goes in the page's
   * `#classslot` when it offers one (respiration puts it beside its Quiz
   * button), else the window's bottom-left. It opens a card that says which
   * class this browser is in, takes a name or initials, says who reads it,
   * and lets the student leave the class. */
  var className = null;
  var STYLE =
    '#classgear{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;' +
    'border:1px solid var(--border-strong,#bbb);background:var(--surface-page,#fff);color:var(--text-muted,#666);cursor:pointer;opacity:.7}' +
    '#classgear:hover{opacity:1;color:var(--text-strong,#111)}#classgear svg{width:16px;height:16px}' +
    '#classgear.fixed{position:fixed;left:18px;bottom:18px;z-index:70}' +
    '#classcard{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;padding:24px}' +
    '#classcard[hidden]{display:none}#classcard .back{position:absolute;inset:0;background:rgba(20,22,26,.45)}' +
    '#classcard .card{position:relative;width:min(520px,100%);padding:28px 30px;border-radius:16px;background:var(--surface-card,#fff);' +
    'color:var(--text-body,#222);box-shadow:0 24px 60px -24px rgba(0,0,0,.5);font:15px/1.5 var(--font-ui,system-ui,sans-serif)}' +
    '#classcard .kick{margin:0;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-dim,#777)}' +
    '#classcard h2{margin:4px 0 18px;font-size:24px;color:var(--text-strong,#111)}' +
    '#classcard label{display:block;font-weight:600;color:var(--text-strong,#111);margin:0 0 6px}' +
    '#classcard input{width:100%;box-sizing:border-box;font:inherit;padding:9px 12px;border:1px solid var(--border-strong,#bbb);border-radius:10px;background:var(--surface-page,#fff);color:inherit}' +
    '#classcard .sub{font-size:13px;color:var(--text-muted,#666);margin:8px 0 12px}#classcard .sub:last-of-type{margin-bottom:20px}#classcard .bid{font-family:ui-monospace,Menlo,monospace;color:var(--text-strong,#111)}' +
    '#classcard .row{display:flex;gap:10px;align-items:center}#classcard .row .sp{flex:1}' +
    '#classcard button{font:600 13px var(--font-ui,system-ui,sans-serif);padding:8px 14px;border-radius:10px;border:1px solid var(--border-strong,#bbb);background:var(--surface-page,#fff);color:var(--text-strong,#111);cursor:pointer}' +
    '#classcard button.go{background:var(--text-strong,#111);color:var(--surface-page,#fff);border-color:var(--text-strong,#111)}' +
    '#classcard button.leave{border:0;background:none;color:var(--text-muted,#666);padding-left:0}' +
    '#classcard .x{position:absolute;top:10px;right:14px;border:0;background:none;font-size:24px;line-height:1;color:var(--text-muted,#666);padding:4px 6px}';
  var GEAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';

  /* The first eight hex digits of the visitor id, as 'xxxx-xxxx': readable off a
     screen, and the same function on the dashboard prints the same code. */
  function shortId(v) { var h = String(v).replace(/-/g, '').slice(0, 8); return h.slice(0, 4) + '-' + h.slice(4); }

  var card = null;
  function openCard() {
    if (!card) {
      card = document.createElement('div');
      card.id = 'classcard';
      card.innerHTML = '<div class="back"></div><div class="card" role="dialog" aria-modal="true" aria-labelledby="classcardtitle">' +
        '<button type="button" class="x" aria-label="Close">&times;</button>' +
        '<p class="kick">Your class</p><h2 id="classcardtitle"></h2>' +
        '<form><label for="classname">Your name or initials <span style="font-weight:400;color:var(--text-muted,#666)">(optional)</span></label>' +
        '<input id="classname" maxlength="40" autocomplete="off">' +
        '<p class="sub">Only your teacher sees it, next to how far you got in the lesson. Leave it blank to stay anonymous.</p>' +
        '<p class="sub">This browser\'s code: <b class="bid"></b>. Your teacher sees the same code, so you can tell them which row is yours without giving a name.</p>' +
        '<div class="row"><button type="button" class="leave">Leave this class</button><span class="sp"></span><button type="submit" class="go">Save</button></div></form></div>';
      document.body.appendChild(card);
      var form = card.querySelector('form');
      var close = function () { card.hidden = true; };
      card.querySelector('.back').addEventListener('click', close);
      card.querySelector('.x').addEventListener('click', close);
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !card.hidden) close(); });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var name = form.querySelector('input').value.replace(/\s+/g, ' ').trim().slice(0, 40);
        set(NAME_KEY, name);
        queue.push({ kind: 'name', payload: { name: name } });
        send({ name: name });
        close();
      });
      card.querySelector('.leave').addEventListener('click', function () {
        if (!confirm('Leave ' + (className || 'this class') + ' on this browser? Your teacher keeps what was already recorded.')) return;
        [CLASS_KEY, NAME_KEY].forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
        location.reload();
      });
    }
    card.querySelector('h2').textContent = className || 'Class ' + CLASS;
    card.querySelector('.bid').textContent = shortId(VISITOR);
    card.querySelector('input').value = get(NAME_KEY) || '';
    card.hidden = false;
    card.querySelector('input').focus();
  }

  function gear() {
    /* Framed (respiration opens glycolysis in a modal, the builder shows an
       app), the frame's own page has the gear; a second one inside would
       float over the card. Events still report from the frame. */
    if (window.top !== window.self) return;
    var st = document.createElement('style'); st.textContent = STYLE; document.head.appendChild(st);
    var b = document.createElement('button');
    b.id = 'classgear'; b.type = 'button'; b.innerHTML = GEAR;
    b.setAttribute('aria-label', 'Class settings'); b.title = 'Class settings';
    b.addEventListener('click', openCard);
    var slot = document.getElementById('classslot');
    if (slot) slot.appendChild(b); else { b.classList.add('fixed'); document.body.appendChild(b); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', gear); else gear();
  fetch(ENDPOINT + '?class=' + encodeURIComponent(CLASS), { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (k) { if (k && k.name) className = k.name; })
    .catch(function () {});

  window.Track = { event: event, step: step, settings: openCard, class: CLASS, visitor: VISITOR, page: PAGE };
})();
