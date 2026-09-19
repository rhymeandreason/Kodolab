/* =============================================================================
 *  build/apps-client.js — what the builder and the viewer share
 * =============================================================================
 *  The access key, the class or teacher code, the visitor id, the edit tokens
 *  this browser holds, the fetch that carries them, and the one way a stored
 *  page is put on screen.
 *
 *  A CLASS CODE IS WHO THE STUDENT IS (`api/_access.js`). It is typed once, or
 *  arrives as `?c=` and is stripped like `?k=`, and it rides on every request,
 *  so the apps it made are theirs on any machine that holds it.
 *
 *  A PAGE RUNS IN A SANDBOX, ALWAYS. `mount` writes it into an iframe by
 *  `srcdoc` with `allow-scripts` and nothing else, so it lives on an opaque
 *  origin: it cannot read this page's storage, cannot send a request with
 *  this browser's key, and cannot navigate the parent. Two things are spliced
 *  into its head first: a `<base>` so the `../lib/` paths the reference uses
 *  resolve against the library one folder up, and a relay that posts every
 *  uncaught error to the parent, which is how the next build turn hears what
 *  the last one broke.
 *
 *  ON LOOPBACK THE FRAME RUNS SAME-ORIGIN, and that is the one exception.
 *  Chromium refuses every request an opaque origin makes to localhost (its
 *  local-network-access rule treats the sandbox as a public page), so on the
 *  dev server an opaque frame loads the CDN and nothing of the library.
 *  Deployed, the site is public and the rule never applies. Locally a stored
 *  page can therefore read this page's storage; the dev machine is the one
 *  place that is acceptable.
 *
 *  THE EDIT TOKEN RIDES IN THE URL ONCE. `?e=` is copied to storage and
 *  stripped from the address bar on arrival, the way the tutor's `?k=` is,
 *  so a screenshot or a pasted address does not hand out the right to save.
 *  Safari clears a site's storage after seven days of browser use without a
 *  visit, so the link in the email stays the real record, and the page says so.
 * ========================================================================== */
const Apps = (() => {
  'use strict';

  const KEY_KEY     = 'ss.tutor.key';       // shared with ask/chat.js: one link admits to both
  const VISITOR_KEY = 'ss.tutor.visitor';
  const STORE_KEY   = 'ss.apps';            // { id: { token, title, at } }
  const SEAT_KEY    = 'ss.class.code';
  const ACCOUNT_KEY = 'ss.account';         // the signed-in user as /api/auth described it, for lib/site.js's bar; the cookie is the truth
  const TEACHER_KEY = 'ss.teacher.code';
  /* Which way in this browser last used: 'google' or 'email', so /login can
     mark it. THE METHOD AND NEVER THE ADDRESS. The method admits nobody, which
     is why it is deliberately left out of lib/site.js's PERSON_KEYS and outlives
     a sign-out: the hint is for the person who comes back after one. An address
     would do the opposite on a shared machine, naming who was here last, and the
     keychain already fills it. */
  const LAST_KEY    = 'ss.lastSignIn';

  const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));

  const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* this page load only */ } };
  const del = k => { try { localStorage.removeItem(k); } catch {} };

  const url = new URL(location.href);
  const params = url.searchParams;
  let dirty = false;

  /* ---- the access link, exactly as chat.js does it ---------------------- */
  let KEY = params.get('k');
  if (KEY) { set(KEY_KEY, KEY); params.delete('k'); dirty = true; }
  else KEY = get(KEY_KEY);

  let SEAT = params.get('c'), TEACHER = params.get('t');
  if (SEAT) { set(SEAT_KEY, SEAT); params.delete('c'); dirty = true; } else SEAT = get(SEAT_KEY);
  if (TEACHER) { set(TEACHER_KEY, TEACHER); params.delete('t'); dirty = true; } else TEACHER = get(TEACHER_KEY);
  const codes = {
    seat: () => SEAT,
    teacher: () => TEACHER,
    setSeat(c)    { SEAT = c || null;    c ? set(SEAT_KEY, c)    : del(SEAT_KEY); },
    setTeacher(c) { TEACHER = c || null; c ? set(TEACHER_KEY, c) : del(TEACHER_KEY); },
  };

  /* ---- the edit token for this app, if the link carried one ------------- */
  /* Deployed, `/app/<id>` is a rewrite and the browser never sees the query
   * it adds, so the id is read from the path when the query has none. */
  const ID = params.get('id') || (/^\/app\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname) || [])[1] || null;
  const fromLink = params.get('e');
  if (fromLink && ID) { remember(ID, fromLink); params.delete('e'); dirty = true; }
  if (dirty) { try { history.replaceState(null, '', url.pathname + (params.toString() ? '?' + params : '') + url.hash); } catch {} }

  const VISITOR = (() => { let v = get(VISITOR_KEY); if (!v) { v = uuid(); set(VISITOR_KEY, v); } return v; })();

  function store() { try { return JSON.parse(get(STORE_KEY) || '{}') || {}; } catch { return {}; } }
  /* With a class code the token is not kept: a Chromebook is shared, and the
     next student's code must not find the last one's edit rights in storage.
     The code itself is what edits, from `api/_apps.js`'s `mayEdit`. */
  function remember(id, token, title) {
    const s = store();
    if (SEAT) token = null;
    s[id] = { ...(s[id] || {}), token, title: title || (s[id] || {}).title || '', at: Date.now() };
    set(STORE_KEY, JSON.stringify(s));
  }
  function forget(id) { const s = store(); delete s[id]; set(STORE_KEY, JSON.stringify(s)); }
  function tokenFor(id) { return (store()[id] || {}).token || null; }
  function mine() {
    return Object.entries(store()).map(([id, v]) => ({ id, ...v })).sort((a, b) => (b.at || 0) - (a.at || 0));
  }

  /* ---- fetch, with the headers ------------------------------------------ */
  async function api(path, { method = 'GET', body, token } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (KEY) headers['X-Tutor-Key'] = KEY;
    if (SEAT) headers['X-Seat-Code'] = SEAT;
    if (TEACHER) headers['X-Teacher-Code'] = TEACHER;
    if (token) headers['X-App-Token'] = token;
    const r = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    let json = null;
    try { json = await r.json(); } catch { json = { error: `HTTP ${r.status}` }; }
    // A pilot teacher code retires when its teacher signs in with Google. A
    // browser still holding it would be refused for it on every page, so it is
    // dropped here, once, and the request asked again as whoever else this is.
    if (r.status === 401 && json && json.code === 'teacher-gone' && TEACHER) {
      codes.setTeacher(null);
      return api(path, { method, body, token });
    }
    if (!r.ok) { const e = new Error((json && json.error) || `HTTP ${r.status}`); e.status = r.status; e.body = json; throw e; }
    return json;
  }

  /* ---- the account ------------------------------------------------------ *
   * Either way in sets an HttpOnly cookie, so this page never holds the
   * session; it only asks /api/auth what the cookie says. */
  function loadScript(src) {
    return new Promise((ok, fail) => {
      if (document.querySelector(`script[src="${src}"]`) && window.google) return ok();
      const s = document.createElement('script');
      s.src = src; s.async = true; s.onload = ok; s.onerror = () => fail(new Error('Google sign-in did not load'));
      document.head.appendChild(s);
    });
  }
  const account = {
    state: () => api('../../api/auth').catch(() => ({ clientId: null, user: null })),
    /* Google's own button, drawn into `el`. `start()` runs the moment Google hands
       back a token, `done(user, err)` once the cookie is set. */
    async button(el, done, start) {
      const s = await account.state();
      if (!s.clientId) { el.hidden = true; return s; }
      await loadScript('https://accounts.google.com/gsi/client');
      window.google.accounts.id.initialize({
        client_id: s.clientId,
        callback: async r => {
          if (start) start();
          let user;
          try { user = (await api('../../api/auth', { method: 'POST', body: { action: 'google', credential: r.credential } })).user; }
          catch (err) { return done(null, err); }
          set(LAST_KEY, 'google');   // only once the cookie is set: a refused attempt is not a way in
          done(user);
        },
      });
      window.google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with' });
      return s;
    },
    /* The email door. `codeSend` answers {sent, minutes, console}; `minutes` is
       the server's own TTL, so the page says how long a code lasts without
       holding a second copy of the number. `console: true` means no mail
       provider is configured and the dev server printed it. */
    codeSend: email => api('../../api/auth', { method: 'POST', body: { action: 'code', email } }),
    async codeVerify(email, code) {
      const r = await api('../../api/auth', { method: 'POST', body: { action: 'verify', email, code } });
      set(LAST_KEY, 'email');
      return r;
    },
    lastMethod() { const m = get(LAST_KEY); return m === 'google' || m === 'email' ? m : null; },
    redeem: code => api('../../api/auth', { method: 'POST', body: { action: 'redeem', code } }),
    note: user => (user ? set(ACCOUNT_KEY, JSON.stringify(user)) : del(ACCOUNT_KEY)),
    /* The apps this browser made on a testing link become the account's. Only
       unowned ones move, so running it again is harmless. */
    claimLocal() {
      const list = mine().filter(m => m.token).map(m => ({ id: m.id, token: m.token }));
      return list.length ? api('../../api/auth', { method: 'POST', body: { action: 'claim', apps: list } }).catch(() => null) : null;
    },
  };

  /* ---- links ------------------------------------------------------------ *
   * Deployed, the short forms `/app/<id>` and `/build?id=` are vercel.json
   * rewrites; on the dev server the file path is the URL. Which world this is
   * shows in the address bar. */
  const fileForm = /\.html$/.test(location.pathname);
  const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  function link(kind, id, token) {
    const o = location.origin;
    const view = fileForm ? `${o}/demos/build/app.html?id=${id}` : `${o}/app/${id}`;
    if (kind === 'view') return view;
    // The same page with the Edit / Remix bar: the tester's preview, not the public one.
    if (kind === 'preview') return view + (fileForm ? '&' : '?') + 'preview=1';
    const base = fileForm ? `${o}/demos/build/build.html?id=${id}` : `${o}/build?id=${id}`;
    return kind === 'edit' && token ? `${base}&e=${token}` : base;
  }

  /* The site's own pages, in whichever spelling this world uses. */
  function page(name) {
    const file = { build: 'build/build.html', apps: 'build/apps.html', teach: 'build/teacher.html',
                   login: 'build/login.html', 'beta-invite': 'build/beta-invite.html' }[name];
    return fileForm ? `/demos/${file}` : `/${name}`;
  }

  /* WHERE ?next= MAY SEND SOMEONE, and the only place that decides it. Two
     pages hand people on after signing in, and an absolute or unlisted `next`
     is an open redirect: a link that signs a teacher in and drops her on
     somebody else's page. Kept here rather than in each page because a guard
     written twice is a guard that drifts. Only a builder page is somewhere to
     come back to; anything else, /login itself included, answers null and the
     caller sends them to their own home. */
  const NEXT_OK = /^\/(build|apps|teach|app)([?#\/]|$)|^\/demos\/build\/(build|apps|teacher|app)\.html([?#]|$)/;
  const safeNext = raw => (NEXT_OK.test(String(raw || '')) ? String(raw) : null);
  /* Sent to the dashboard, so an account that is not a teacher's is not done. */
  const wantsTeach = next => !!next && /^\/(teach|demos\/build\/teacher\.html)([?#\/]|$)/.test(next);
  /* The sign-in page, told to come back here. `why` names a refused class code. */
  function login(why) {
    return page('login') + '?next=' + encodeURIComponent(location.pathname + location.search + location.hash)
      + (why ? '&why=' + encodeURIComponent(why) : '');
  }

  /* ---- the sandbox -------------------------------------------------------- */
  const RELAY = `<script>(function(){function send(m){try{parent.postMessage({type:'app-error',message:String(m).slice(0,300)},'*')}catch(e){}}
window.addEventListener('error',function(e){send((e.message||'error')+(e.filename?' @ '+String(e.filename).split('/').pop()+':'+e.lineno:''))});
window.addEventListener('unhandledrejection',function(e){send('unhandled: '+(e.reason&&e.reason.message||e.reason))});
/* THE THUMB IS NOT A PICTURE OF THE PAGE. It is the scene, plus the words on
   the card in front of it, and the shelf composes the two in its own DOM.
   Rasterising the panel here meant html2canvas reimplementing CSS, which broke
   on every token the shell added (it already needed the fork that parses
   color-mix and oklab); the canvas readback underneath it always worked. So
   only the canvas is captured, and the panel travels as the four strings the
   shell has already rendered. Both shells wear the same card, so one set of
   strings covers steps and sandbox alike: nav is the Back/Next row the sandbox
   does without. Armed three seconds in, so the scene has settled; taken once,
   and again whenever the builder asks. */
var armed=false,done=false,asked=false,tries=0,ed=null;setTimeout(function(){armed=true},3000);
/* The text editor is a real file, fetched the first time the builder turns the
   mode on: a page being read never pays for it. */
window.addEventListener('message',function(e){if(!e.data)return;if(e.data.type==='app-snap')asked=true;
if(e.data.type==='app-outline')outline();
if(e.data.type==='app-outline-go')try{LessonShell.current.goTo(e.data.i)}catch(x){}
if(e.data.type==='app-edit'&&e.data.on&&!ed){ed=document.createElement('script');ed.src='app-edit.js';document.head.appendChild(ed);
var m=e.data;ed.onload=function(){window.postMessage(m,'*')}}});
/* The outline: the shell's own step list, read off the live shell rather than
   parsed out of the source. A null step list is the answer for a page with no
   step-through, and the builder hides the tab on that. Sent unasked on every
   swap too, so the rail's current row follows the student's own Next. */
function outline(){var s=window.LessonShell&&LessonShell.current,o={type:'app-outline-steps',steps:null};
if(s)o={type:'app-outline-steps',current:s.current,steps:(s.steps||[]).map(function(t){
return{eyebrow:String(t.eyebrow||''),title:String(t.title||''),scene:[].concat(t.scene||[]).join(' + ')}})};
try{parent.postMessage(o,'*')}catch(x){}}
document.addEventListener('lessonshell:step',outline);
var raf=window.requestAnimationFrame.bind(window);
/* A SHOT IS TAKEN, NOT ATTEMPTED. This used to mark itself done before snap
   ran, so the one frame it happened to land on decided whether the app ever
   got a thumb: a frame that drew nothing reads back blank, snap drops it
   rather than overwrite a good still with a flat rectangle, and the page then
   never tried again. Now only a posted shot ends it, and a page that can never
   post one stops after a few seconds of frames instead of forever. */
window.requestAnimationFrame=function(cb){return raf(function(t){cb(t);
if(!((armed&&!done)||asked))return;
if(snap()){done=true;asked=false;tries=0;return}
if(++tries>300){done=true;asked=false;tries=0}})};
/* The scene the student is looking at, which is not always the biggest canvas:
   a shell hands out up to four and keeps the hidden ones sized, so a layer
   marked is-off is a live context drawing something no one is being shown. */
function shown(){var best=null,area=0,cs=document.querySelectorAll('canvas');
for(var i=0;i<cs.length;i++){var c=cs[i],lay=c.closest?c.closest('.lshell-scene'):null;
if(c.width<50||c.height<50)continue;
if(lay&&lay.classList.contains('is-off'))continue;
if(!c.offsetParent&&getComputedStyle(c).position!=='fixed')continue;
var a=c.width*c.height;if(a>area){area=a;best=c}}
return best}
/* Read off the rendered panel, not the step object: body may be a function of
   ctx, and what the card actually says is what the shelf should repeat. */
function words(){var p=document.querySelector('.lshell-panel');
var t=function(s){var e=p&&p.querySelector(s);return e?String(e.textContent||'').replace(/\\s+/g,' ').trim():''};
var b=document.querySelector('.lshell-brand'),bd=p&&p.querySelector('.body'),body='';
/* Joined across the block children: textContent alone runs the last word of one
   paragraph into the first of the next. */
if(bd)body=String(bd.children.length?[].map.call(bd.children,function(n){return n.textContent}).join(' '):bd.textContent).replace(/\\s+/g,' ').trim();
return{brand:String((b&&b.textContent)||document.title||'').trim().slice(0,80),
eyebrow:t('.eyebrow').slice(0,60),title:t('.title').slice(0,120),body:body.slice(0,320),
steps:document.querySelectorAll('.lshell-progress > *').length,
nav:!!document.querySelector('.lshell-nav')}}
function snap(){try{
var c=shown();if(!c)return false;
var w=640,h=400,out=document.createElement('canvas');out.width=w;out.height=h;var g=out.getContext('2d');
g.fillStyle=getComputedStyle(document.body).backgroundColor||'#faf8f4';g.fillRect(0,0,w,h);
/* cover-crop to the card's 16:10, centred */
var cw=Math.min(c.width,c.height*1.6),ch=cw/1.6,sx=(c.width-cw)/2,sy=(c.height-ch)/2;
g.drawImage(c,sx,sy,cw,ch,0,0,w,h);
/* A WebGL canvas whose buffer has been cleared reads back as one flat colour,
   and a flat rectangle on the shelf looks broken where paper looks unstarted.
   It would also overwrite a good thumb, so it is dropped instead of posted. */
var px=g.getImageData(0,0,w,h).data,seen={};
for(var i=0;i<px.length;i+=4000)seen[px[i]+','+px[i+1]+','+px[i+2]]=1;
if(Object.keys(seen).length<3)return false;
/* The API caps the data URL at 80 KB. A busy scene overruns that at .72, so
   quality gives way until it fits rather than the POST failing. */
var q=.72,data=out.toDataURL('image/jpeg',q);
while(data.length>76000&&q>.35){q-=.1;data=out.toDataURL('image/jpeg',q)}
if(data.length>76000)return false;
parent.postMessage({type:'app-thumb',data:data,meta:words()},'*');return true;
}catch(e){return false}}
})();</script>`;

  /* kit/app.js's own tables, fetched once, so a page's data-mol can be written
     before it runs: a page that mounts Molecule or Diagram then loads the domain
     files of the molecules it names instead of all ten. Until this arrives, or
     if it fails, a page loads every domain file, as it would without data-mol.
     app.js returns its exports before touching the document when `module` is
     defined, which is how the builder reads it in node too. */
  let Loader = null;
  fetch(`${location.origin}/demos/kit/app.js`).then(r => r.ok ? r.text() : Promise.reject())
    .then(src => { const module = { exports: {} }; new Function('module', src)(module); Loader = module.exports; })
    .catch(() => {});

  /* Unions what the page declared with what its source names, so the model
     adding a key the scan missed only ever widens the list. */
  function withMols(html) {
    if (!Loader) return html;
    return html.replace(/<script\b[^>]*\bsrc="[^"]*kit\/app\.js"[^>]*>/i, tag => {
      const use = /\bdata-use="([^"]*)"/.exec(tag);
      if (!use || !/\b(Molecule|Diagram)\b/.test(use[1])) return tag;
      const had = /\sdata-mol="([^"]*)"/.exec(tag);
      const keys = [...new Set([...(had ? had[1].split(',') : []).map(k => k.trim()).filter(Boolean),
                                ...Loader.molsNamed(html)])];
      if (!keys.length) return tag;
      const attr = ` data-mol="${keys.join(',')}"`;
      return had ? tag.replace(had[0], attr) : tag.replace(/>$/, attr + '>');
    });
  }

  function framed(html, relay = RELAY) {
    html = withMols(html);
    const base = `<base href="${location.origin}/demos/build/">`;
    const head = /<head[^>]*>/i.exec(html);
    return head ? html.slice(0, head.index + head[0].length) + '\n' + base + relay + html.slice(head.index + head[0].length)
                : base + relay + html;
  }

  /* A live but inert copy for the shelf: no relay, so it neither reports
   * errors nor takes a thumb. The page is expected to have pointer-events off. */
  function preview(iframe, html) {
    iframe.setAttribute('sandbox', LOOPBACK ? 'allow-scripts allow-same-origin' : 'allow-scripts');
    iframe.srcdoc = framed(html, '');
  }

  /* Puts the page in the iframe and returns the errors it relays, as a live
   * array the caller drains between turns. */
  function mount(iframe, html, onError, onThumb, onEdit) {
    const errors = [];
    const listener = e => {
      if (e.source !== iframe.contentWindow || !e.data) return;
      if (e.data.type === 'app-thumb') { if (onThumb) onThumb(e.data.data, e.data.meta); return; }
      if (/^app-(edit|select|outline)/.test(e.data.type)) { if (onEdit) onEdit(e.data); return; }
      if (e.data.type !== 'app-error') return;
      errors.push(e.data.message);
      if (onError) onError(e.data.message, errors);
    };
    if (iframe._appListener) window.removeEventListener('message', iframe._appListener);
    iframe._appListener = listener;
    window.addEventListener('message', listener);
    iframe.setAttribute('sandbox', LOOPBACK ? 'allow-scripts allow-same-origin' : 'allow-scripts');
    iframe.srcdoc = framed(html);
    return errors;
  }

  /* Text-edit mode. `on` hands the frame the page as STORED, which is what a
   * find has to match: the DOM in front of the student is the rendered page,
   * and the source is what a version is made of. `save` asks for the pairs
   * banked so far; `done` clears them and takes the outlines down. */
  const editMode = {
    on:   (iframe, html) => iframe.contentWindow.postMessage({ type: 'app-edit', on: true, html }, '*'),
    save: iframe => iframe.contentWindow.postMessage({ type: 'app-edit', save: true }, '*'),
    done: iframe => iframe.contentWindow.postMessage({ type: 'app-edit', done: true }, '*'),
    off:  iframe => iframe.contentWindow.postMessage({ type: 'app-edit' }, '*'),
  };

  /* The outline. `ask` is for the moment the tab opens; the frame also pushes
   * one on every step change, so the two arrive on the same message. `go`
   * drives the app's own goTo, which is why the rail can jump to step 8
   * without clicking Next seven times. */
  const outline = {
    ask: iframe => iframe.contentWindow.postMessage({ type: 'app-outline' }, '*'),
    go:  (iframe, i) => iframe.contentWindow.postMessage({ type: 'app-outline-go', i }, '*'),
  };

  /* The file, standing alone: the library paths made absolute to this site. */
  function exportFile(html, title) {
    const abs = html.replace(/((?:src|href)=["'])\.\.\//g, `$1${location.origin}/demos/`);
    const blob = new Blob([abs], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(title || 'app').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'app'}.html`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* The closed door. Shown when a remix or a build answers 401: no copy is
   * made, and the page says why. `err` is that 401: a refused code or a
   * turned-off account is told so, and only a visitor with nothing is told
   * about the beta. */
  const REFUSED = ['revoked', 'invalid', 'not-class', 'disabled'];
  function beta(err) {
    let d = document.getElementById('betaModal');
    if (!d) {
      d = document.createElement('dialog');
      d.id = 'betaModal';
      d.className = 'beta';
      document.body.appendChild(d);
    }
    const code = err && err.body && err.body.code;
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    d.innerHTML = (REFUSED.includes(code)
      ? `<h2>Can't remix</h2><p>${esc(err.message)}</p>`
      : '<h2>Private beta</h2><p>Building and remixing apps is open to invited testers for now. Sign in with your class code or invite, or join the waitlist.</p>')
      + `<form method="dialog"><a class="btn" href="${login(code === 'revoked' || code === 'invalid' ? code : '')}">Sign in</a> <button class="btn btn--tint" type="submit">OK</button></form>`;
    d.showModal();
  }

  return { KEY, VISITOR, ID, codes, account, api, link, page, login, safeNext, wantsTeach, mount, preview, editMode, outline, exportFile, remember, forget, tokenFor, mine, beta };
})();
