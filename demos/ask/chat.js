/* =============================================================================
 *  ask/chat.js — the tutor drawer a lesson can open
 * =============================================================================
 *  Loaded after the lesson. DOM only: no THREE, no scene, no step logic. It
 *  cannot break a lesson, and its worst failure is a line of text in the panel.
 *
 *      Ask.chat({
 *        rail:    document.getElementById('side'),   // where it slides over
 *        lesson:  'water-lab',
 *        step:    () => cur,                         // read per turn
 *        state:   () => ({ ... }),                   // flat readings, per turn
 *        examples: ['Why does ice float?', …],       // the empty state
 *        act:     target => { ... },                 // only for targets at home
 *      });
 *
 *  THE TUTOR DOES NOT DRIVE THE PAGE. It returns a target and the drawer offers
 *  a button. A wrong aim then costs a click instead of yanking the scene away
 *  from what the student was watching, and the button is a pull back toward the
 *  model rather than another reason to keep typing.
 *
 *  `act` is the lesson's half and covers only its own targets. Anything on
 *  another lesson is a link, which needs nothing from the page, so the module
 *  handles it and the lesson never learns that other lessons exist.
 * ========================================================================== */
(function (global) {
  'use strict';

  const ENDPOINT = '/api/ask';
  const MAX_TURNS = 40;

/* ---- who is asking, and in which conversation --------------------------------
 * Two random ids and nothing else. `visitor` persists so a student's second
 * visit is recognisable as the same browser; `thread` is minted per page load,
 * so a conversation is a conversation and not one endless transcript per
 * device. Neither is derived from anything about the person, and clearing site
 * data clears both. The server never records an address.
 *
 * A browser refusing storage (private mode, blocked cookies) is not an error
 * here: the visitor id falls back to a fresh one and the turn still logs. */
const VISITOR_KEY = 'ss.tutor.visitor';

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  // Safari before 15.4 has getRandomValues but not randomUUID.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

const VISITOR = (() => {
  try {
    let v = localStorage.getItem(VISITOR_KEY);
    if (!v) localStorage.setItem(VISITOR_KEY, v = uuid());
    return v;
  } catch { return uuid(); }
})();

const THREAD = uuid();

/* ---- the access link --------------------------------------------------------
 * The live tutor is open to invited classes, and the invitation is a link:
 * `?k=<secret>`. It rides in the URL exactly once. On arrival it is copied to
 * localStorage, stripped from the address bar, and after that it travels only
 * as a request header - a query string ends up in server access logs, browser
 * history and screenshots, and a header ends up in none of them.
 *
 * A key names a class rather than a person, so it is a bearer token and nothing
 * more: it protects spend, never anything private. Storage refused (private
 * mode, blocked cookies) is not an error - the key lives for this page load and
 * the student asks again from the link next time.
 *
 * No key is not an error state either. The GET below simply does not answer,
 * the launcher is never added, and the lesson looks the way it does on a static
 * host. There is nothing to explain to a student who was never invited. */
const KEY_KEY = 'ss.tutor.key';

const KEY = (() => {
  let k = null;
  try {
    const url = new URL(location.href);
    const fromLink = url.searchParams.get('k');
    if (fromLink) {
      k = fromLink;
      try { localStorage.setItem(KEY_KEY, k); } catch { /* this page load only */ }
      url.searchParams.delete('k');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
  } catch { /* no URL API, or a history call a sandbox refused */ }
  if (!k) { try { k = localStorage.getItem(KEY_KEY); } catch { k = null; } }
  return k;
})();

/* A class code (lib/site.js keeps it from a teacher's `?class=` link) admits
 * to the tutor as the class's cohort, the way a testing link does. Either or
 * both ride as headers; a browser with neither sends none and is refused. */
/* Read per request, and from the address first: site.js is deferred, so on the
 * load that carries `?class=` it has not stored the code when the launcher's
 * GET goes out, while this script (in the body) is already running. */
function classCode() {
  try {
    const q = new URL(location.href).searchParams.get('class');
    if (q) { const c = q.toLowerCase().replace(/[^a-z0-9]/g, ''); if (c.length === 8) return c.slice(0, 4) + '-' + c.slice(4); }
  } catch { /* no URL API */ }
  try { return localStorage.getItem('ss.class'); } catch { return null; }
}

/* Sent on every request, and simply absent without a key. */
function keyed(headers) {
  const h = { ...headers };
  const klass = classCode();
  if (KEY) h['X-Tutor-Key'] = KEY;
  if (klass) h['X-Class-Code'] = klass;
  return h;
}

  function chat(opts) {
    const rail = opts.rail;
    const slot = opts.slot || rail;      // where the launcher goes; the panel
    const act  = opts.act || (() => false);   // always covers the whole rail

    /* ---- launcher, in the rail ---------------------------------------------
     * Built now, ADDED only once /api/ask answers. These pages also publish to
     * GitHub Pages, which serves files and nothing else, so the endpoint is
     * simply absent there. An invitation you cannot honour is worse than no
     * invitation: without this the button and the example questions are fully
     * present and a student clicking one is shown a JSON parse error. */
    const open = document.createElement('button');
    open.id = 'askopen';
    open.type = 'button';
    open.innerHTML = '<i class="ph-bold ph-chat-teardrop-dots"></i>'
      + '<span>Ask a question<span class="sub"> about what you are seeing</span></span>';

    fetch(ENDPOINT, { method: 'GET', headers: keyed({}) })
      .then(r => r.ok && r.json())
      .then(cfg => { if (cfg) slot.appendChild(open); })
      .catch(() => {})
      .then(() => { if (!open.isConnected) console.info(
        '[ask] the tutor is not offered here: either this host has no /api/ask, '
        + 'or the live tutor needs an access link and this browser has none.'); });

    /* ---- drawer ---- */
    const panel = document.createElement('div');
    panel.id = 'askchat';
    panel.innerHTML = `
      <button id="askclose" type="button" aria-label="Close">&times;</button>
      <div class="askthread"><div class="hello"></div></div>
      <form>
        <input type="text" maxlength="500" autocomplete="off" placeholder="Ask about this page…"
               aria-label="Ask a question about this lesson">
        <button type="submit" aria-label="Ask">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 19V5M12 5l-6 6M12 5l6 6" fill="none" stroke="currentColor"
                  stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </form>`;
    rail.appendChild(panel);

    const thread = panel.querySelector('.askthread');

    /* The empty state is three questions, not a paragraph explaining that you
     * may ask questions. A student who does not know what this thing is for
     * learns more from one good example than from a sentence about it, and the
     * third one is there to show the box is worth more than a search bar.
     * Clicking asks it, so the first turn costs no typing. */
    const hello = panel.querySelector('.hello');
    (opts.examples || []).forEach(q => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'askeg';
      b.textContent = q;
      b.addEventListener('click', () => { input.value = q; form.requestSubmit(); });
      hello.appendChild(b);
    });
    const form   = panel.querySelector('form');
    const input  = panel.querySelector('input');
    const send   = form.querySelector('button');

    const messages = [];
    const cited    = new Set();
    let busy = false;

    /* ---- open / close ---- */
    // One class, and it is the only thing that decides whether the drawer is
    // there. No `hidden` attribute to be overridden and no transition to be
    // interrupted mid-flight.
    function show() {
      panel.classList.add('on');
      open.classList.remove('waiting');
      input.focus();
    }
    function hide() { panel.classList.remove('on'); }

    open.addEventListener('click', show);
    panel.querySelector('#askclose').addEventListener('click', hide);
    // Esc closes the drawer and nothing else. A lesson's own key handling keeps
    // working because this only fires while the drawer is open.
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && panel.classList.contains('on')) { e.stopPropagation(); hide(); }
    }, true);

    /* ---- a turn ---- */
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q || busy) return;
      input.value = '';

      if (messages.length >= MAX_TURNS) {
        messages.splice(0, 4);   // drop the oldest exchange rather than refuse
      }

      busy = true; send.disabled = true;
      messages.push({ role: 'user', content: q });
      say('you', q);
      const pending = say('tutor', 'Thinking…', 'wait');

      try {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: keyed({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            messages,
            lesson: opts.lesson,
            step: opts.step ? opts.step() : undefined,
            state: opts.state ? opts.state() : undefined,
            cited: [...cited],
            threadId: THREAD,
            visitorId: VISITOR,
          }),
        });
        // A host without the function answers with an HTML error page, which
        // is a parse failure, not a tutor failure. Say which.
        let data;
        try { data = await res.json(); }
        catch { throw new Error('the tutor is not available on this site'); }
        if (!res.ok) throw new Error(data.error || 'something went wrong');

        messages.push({ role: 'assistant', content: data.answer });
        pending.remove();
        answer(data);
      } catch (err) {
        pending.remove();
        say('tutor', err.message, 'err');
      } finally {
        busy = false; send.disabled = false;
        thread.scrollTop = thread.scrollHeight;
      }
    });

    function say(who, text, cls) {
      const empty = thread.querySelector('.hello');
      if (empty) empty.remove();
      const d = document.createElement('div');
      /* No "You"/"Tutor" label: the shape says it. A question sits in its own
         grey bubble, an answer runs as plain text on the paper. */
      d.className = 'askturn ' + who;
      const p = document.createElement('p');
      p.className = 'say' + (cls ? ' ' + cls : '');
      p.textContent = text;
      d.appendChild(p);
      thread.appendChild(d);
      thread.scrollTop = thread.scrollHeight;
      return d;
    }

    function answer(data) {
      const d = say('tutor', data.answer);

      if (data.point) d.appendChild(pointButton(data.point));

      // Chapters not already shown, and not the one the point button already
      // goes to: "See it in Glycolysis" with "See Glycolysis" underneath says
      // the same thing twice, and the button says it better.
      const pointed = data.point && !data.point.home ? data.point.chapter : null;
      const others = (data.chapters || []).filter(c => !cited.has(c.id) && c.id !== pointed);
      if (others.length) {
        const see = document.createElement('p');
        see.className = 'asksee';
        see.appendChild(document.createTextNode('See '));
        others.forEach((c, i) => {
          if (i) see.appendChild(document.createTextNode(i === others.length - 1 ? ' and ' : ', '));
          if (c.page) {
            const a = document.createElement('a');
            a.href = '/' + c.page; a.textContent = c.chapter;
            see.appendChild(a);
          } else {
            const s = document.createElement('span');
            s.className = 'asksoon'; s.textContent = c.chapter;
            s.title = 'this lesson is not built yet';
            see.appendChild(s);
          }
        });
        d.appendChild(see);
      }
      for (const c of data.chapters || []) cited.add(c.id);
      thread.scrollTop = thread.scrollHeight;
    }

    function pointButton(p) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'askgo' + (p.home ? '' : ' away');
      // One line. The answer above already named the thing, so a subtitle
      // repeating it made the button a paragraph instead of an action.
      b.textContent = p.home ? 'Show me' : `See it in ${p.lessonTitle} \u2192`;

      b.addEventListener('click', () => {
        if (!p.home) { location.href = p.href; return; }
        // The panel stays open. It used to close, because it covered the rail
        // and stood in front of the model; it now floats and the canvas moves
        // over for it, so closing would only cost the student the answer they
        // are still reading.
        if (act(p) === false) say('tutor', 'I cannot show that one yet.', 'err');
      });
      return b;
    }

    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    return { show, hide, el: panel };
  }

  /* Point at a control. Not lesson-specific, so every lesson gets the same
   * gesture instead of three near-identical ones.
   *
   * Rings travelling outward, and nothing on the control itself: lighting the
   * element changed the shape of a round button and read as the lesson's own UI
   * changing state. They stop the moment the student touches the control,
   * because at that point they have found it and the flashing is noise.
   *
   * Returns false when the element is missing or has no box, which is what a
   * lesson checks before telling a student it has shown them something. */
  /* A slider's box is the whole track, and ringing that says "somewhere along
   * here" while drawing a circle the size of the track. What a student needs is
   * the thumb: the part they can actually take hold of. A range input has no
   * element for it, so it is solved from value/min/max.
   *
   * `invert` is for a vertical slider whose maximum is at the TOP, which is how
   * a temperature reads and the opposite of how the value maps. The caller says
   * so, because only the caller can see which end is hot. */
  function thumbRect(node, invert) {
    const r = node.getBoundingClientRect();
    const min = +node.min || 0, max = +node.max || 100;
    const span = max - min || 1;
    const f = Math.min(1, Math.max(0, (+node.value - min) / span));

    const vertical = r.height > r.width;
    const thumb = vertical ? r.width : r.height;      // custom thumbs run the track's width
    const along = (vertical ? r.height : r.width) - thumb;   // the thumb is inset half at each end
    const t = (vertical ? (invert !== false) : false) ? 1 - f : f;
    const at = thumb / 2 + t * along;

    const cx = vertical ? r.left + r.width / 2 : r.left + at;
    const cy = vertical ? r.top + at : r.top + r.height / 2;
    return { left: cx - thumb / 2, top: cy - thumb / 2, width: thumb, height: thumb };
  }

  function ping(el, o = {}) {
    const node = typeof el === 'string' ? document.getElementById(el) : el;
    if (!node) return false;
    const box = node.getBoundingClientRect();
    if (!box.width || !box.height) return false;   // present, but not on screen yet
    const r = node.matches && node.matches('input[type="range"]')
      ? thumbRect(node, o.invert) : box;

    const rings = [];
    const stop = () => {
      rings.forEach(x => x.remove());
      rings.length = 0;
      node.removeEventListener('pointerdown', stop);
    };

    node.addEventListener('pointerdown', stop);

    // Three rings, staggered, so it reads as travelling outward rather than as
    // one circle breathing. Sized off the element: a slider and a 34px round
    // button both end up ringed by the same margin.
    const d = Math.max(r.width, r.height) + 34;
    for (let i = 0; i < 3; i++) {
      const ring = document.createElement('div');
      ring.className = 'askpulse';
      ring.style.cssText = `left:${r.left + r.width / 2 - d / 2}px;top:${r.top + r.height / 2 - d / 2}px;`
                         + `width:${d}px;height:${d}px;animation-delay:${i * 0.28}s`;
      document.body.appendChild(ring);
      rings.push(ring);
    }
    setTimeout(stop, 3800);
    return true;
  }

  global.Ask = Object.assign(global.Ask || {}, { chat, ping });
})(window);
