/* =============================================================================
 *  build/app-edit.js — the text editor, running inside the app's own sandbox
 * =============================================================================
 *  Loaded on demand by the relay in `apps-client.js` when the builder turns
 *  the mode on, and never otherwise: an app being read costs nothing for a
 *  feature only its editor uses. It runs on the app's opaque origin, so it
 *  can reach the app's DOM and nothing of the builder's.
 *
 *  A TEXT IS EDITABLE IF IT ROUND-TRIPS TO THE SOURCE, and that test is the
 *  whole design. Every word a generated page shows is a JS string literal in
 *  its source — `eyebrow`, `title`, the `body` HTML, a `stat-label` inside a
 *  `ctx.ui.controls` template. Find the node's text in the source exactly
 *  once and the edit is a `{find, replace}` pair, which is the format the
 *  builder already applies. Find it zero times or twice and the node is not
 *  editable, no pencil, no caret: it is offered for SELECTION instead, and
 *  goes to the model as a reference on the next request.
 *
 *  The test refuses the right things without being told to. A readout painted
 *  from data each frame (`netEl.textContent = s.net`) is not in the source, so
 *  it cannot be typed over — which is the rule CLAUDE.md states about numbers
 *  in user-facing text, arrived at from the other end. A callout's label comes
 *  from the component's own library, so it selects rather than edits.
 *
 *  WHAT MAKES A REPLACEMENT SAFE is the context of the match, read from where
 *  it landed rather than guessed. Inside a `<script>` the text sits in a
 *  string literal, so a quote, a backslash or a `${` has to be escaped; all
 *  three quote characters are escaped whatever the literal's own delimiter is,
 *  since `\"` inside a single-quoted string is a legal identity escape and
 *  knowing the delimiter would mean lexing the script. Where the enclosing
 *  literal holds markup — `body`, a `controls` template — the text is going
 *  through innerHTML, so `<`, `>` and `&` become entities; where it does not,
 *  it is going through textContent and a typed `<` must stay a `<`. The
 *  server syntax-checks the spliced page before it stores it, so a case this
 *  gets wrong is a rejected save and not a broken app.
 *
 *  A COMPOSED PAGE IS EDITED AS ITS LESSON, not its source. Its words live in
 *  a JSON spec (`kit/compose.js`), where a find against the HTML lands by luck
 *  if at all, so each passage the runtime drew carries the field it came from
 *  (`data-cf="body.1"`, or the shell's own eyebrow and title). The passage is
 *  edited whole, the spec is updated in place so a repaint keeps it, and the
 *  save sends `setText` and `setBody` ops, which the server applies to the
 *  stored lesson with no model in the loop.
 *
 *  CLICKS STILL DO WHAT THE PAGE DOES. Editing does not take the page over:
 *  a click on outlined text edits or selects it, but text inside a control (a
 *  Next button, a tab) keeps its own click and offers a badge instead, so the
 *  student can walk the steps and edit each one's copy without leaving.
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__ssEdit) { window.__ssEdit.rearm(); return; }

  var src = '';            // the page as stored; what a find must match
  var on = false;
  var pending = [];        // { find, replace, text } committed but not saved
  var spans = [];          // live editable spans, rebuilt whenever the page redraws
  var order = [];          // every located text, in document order, for anchors
  var scripts = [];        // [start, end) of each inline script's content
  var observer = null;
  var redraw = null;

  var post = function (m) { try { parent.postMessage(m, '*'); } catch (e) {} };

  /* ---- source lookup ---------------------------------------------------- */

  /* How a text may be written in the source. Tried in this order; the one
   * that finds it is the one that writes the replacement back. */
  var FORMS = [
    { id: 'raw',  enc: function (t) { return t; } },
    { id: 'html', enc: entity },
    { id: 'js',   enc: jsEsc },
  ];
  function entity(t) { return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function jsEsc(t) { return t.replace(/([\\'"`])/g, '\\$1').replace(/\$\{/g, '\\${').replace(/\r?\n/g, '\\n'); }

  function scanScripts() {
    scripts = [];
    var re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi, m;
    while ((m = re.exec(src))) {
      if (/\ssrc=/i.test(m[1])) continue;
      var start = m.index + m[0].indexOf(m[2], m[1].length);
      scripts.push([start, start + m[2].length]);
    }
  }
  function inScript(i) {
    for (var k = 0; k < scripts.length; k++) if (i >= scripts[k][0] && i < scripts[k][1]) return true;
    return false;
  }

  /* Whether the literal around the match holds markup, which is what decides
   * innerHTML from textContent. The window is the nearest unescaped quote
   * either side: in `title: 'Dynamic Equilibrium'` that is the title alone,
   * and in a body string it is a stretch of the markup, which is the answer
   * either way. Bounded, because an unquoted stretch would otherwise run to
   * the end of the file. */
  function markupAround(i, len) {
    var a = i, b = i + len, lo = Math.max(0, i - 1500), hi = Math.min(src.length, b + 1500);
    while (a > lo && !(/['"`]/.test(src[a - 1]) && src[a - 2] !== '\\')) a--;
    while (b < hi && !(/['"`]/.test(src[b]) && src[b - 1] !== '\\')) b++;
    return /<[a-zA-Z/!]/.test(src.slice(a, b));
  }

  /* A match has to be the WHOLE authored passage, not a run inside one, which
   * is what the boundary either side says: a quote means the string literal is
   * this text and nothing else, a tag bracket means the same for a stretch of
   * markup. Both false positives the bench found were substrings — the shell's
   * own `Back` button matching inside `nextLabel: 'Back to Start'`, and a
   * chart's `20` tick matching inside `Math.round(mM / 20)`. Editing either
   * would have changed something the student never pointed at, and the second
   * would have changed the physics. */
  var BOUND = /['"`<>]/;
  function bounded(i, len) {
    return (i === 0 || BOUND.test(src[i - 1])) && (i + len >= src.length || BOUND.test(src[i + len]));
  }

  /* WHICH FIELD OF A STEP A PASSAGE IS, read off the shell's own class names.
   * It is the only thing that can tell two identical passages apart: a step's
   * `nextLabel` names the step after it and that step's `eyebrow` repeats the
   * words, so neither is unique on its own and both are unique with the key
   * they are written under. The shell's markup is a contract; these are the
   * five fields of it that hold a page's words. */
  var KEYS = [
    ['.lshell-panel .eyebrow', 'eyebrow'],
    ['.lshell-panel .title', 'title'],
    ['.lshell-nav .primary', 'nextLabel'],
    ['.lshell-brand', 'brand'],
    ['.lshell-hint', 'hint'],
  ];
  function keyFor(el) {
    for (var i = 0; i < KEYS.length; i++) if (el.closest(KEYS[i][0])) return KEYS[i][1];
    return '';
  }

  /* The one occurrence written under `key`, widened to take the key with it.
   * The pair then carries `eyebrow: '…'` rather than the words alone, which is
   * unique where they are not; the replacement puts the same key back. Two
   * passages under the SAME key are still ambiguous and still refused. */
  function keyed(find, key) {
    var pre = new RegExp('\\b' + key + '\\s*:\\s*$');
    var pick = null, at = -1, i = -1;
    while ((i = src.indexOf(find, i + 1)) >= 0) {
      var q = src[i - 1];
      if (!/['"`]/.test(q) || src[i + find.length] !== q) continue;   // not a whole literal
      var m = pre.exec(src.slice(Math.max(0, i - 80), i - 1));
      if (!m) continue;
      if (pick) return null;                                          // two under one key
      pick = { start: i - 1 - m[0].length, q: q };
      at = i;
    }
    if (!pick) return null;
    var wide = src.slice(pick.start, at + find.length + 1);
    if (src.split(wide).length - 1 !== 1) return null;
    return { find: wide, at: at,
             pre: src.slice(pick.start, at), post: pick.q };
  }

  /* The same words in two blocks are told apart by the markup around them, the
   * way two under different keys are told apart by the key. What the DOM knows
   * is what comes immediately before this text: a sibling tag that just closed,
   * or, when it is the first thing in its element, that element's own opening
   * tag. Either is written in the file right before one of the occurrences and
   * not the other, so the find widens back through whole tags until it is
   * unique — `</strong>Water is pushed…` against `<p class="lead">Water is
   * pushed…`. What the DOM cannot say, it does not guess: a passage preceded
   * by more text has nothing to distinguish it and stays refused. */
  function bymarkup(find, node) {
    var el = node.parentElement, prev = node.previousSibling, want;
    if (prev && prev.nodeType === 1) {
      var close = '</' + prev.tagName.toLowerCase() + '>';
      want = function (b) { return b.slice(-close.length).toLowerCase() === close; };
    } else if (!prev && el) {
      want = function (b) {
        if (b.slice(-1) !== '>') return false;
        var o = b.lastIndexOf('<');
        var m = o < 0 ? null : /^<\s*([a-zA-Z][\w-]*)([^>]*)>$/.exec(b.slice(o));
        if (!m || m[1].toLowerCase() !== el.tagName.toLowerCase()) return false;
        var cls = /class\s*=\s*\\?(["'])([^"'\\]*)\\?\1/.exec(m[2]);
        return (cls ? cls[2] : '') === (el.getAttribute('class') || '');
      };
    } else return null;

    var hits = [], i = -1;
    while ((i = src.indexOf(find, i + 1)) >= 0) {
      if (bounded(i, find.length) && want(src.slice(Math.max(0, i - 240), i))) hits.push(i);
    }
    if (hits.length !== 1) return null;
    var at = hits[0], start = at;
    for (var t = 0; t < 3; t++) {
      var o = src.lastIndexOf('<', start - 1);
      if (o < 0) break;
      start = o;
      var wide = src.slice(start, at + find.length);
      if (src.split(wide).length - 1 === 1) {
        return { find: wide, at: at, pre: src.slice(start, at), post: '' };
      }
    }
    return null;
  }

  /* The text's one place in the source, or WHY there isn't one. The reason is
   * carried rather than discarded because a passage that cannot be typed over
   * is the case a student needs told: the panel says which of these it hit.
   * Uniqueness is counted over the raw source, unbounded matches included,
   * because the server applies the pair with the same exactly-once rule and
   * cannot see this one. */
  function locate(text, key, node) {
    for (var k = 0; k < FORMS.length; k++) {
      var find = FORMS[k].enc(text), pre = '', post = '';
      var i = src.indexOf(find);
      if (i < 0) continue;
      var n = src.split(find).length - 1;
      if (n > 1) {
        var one = (key && keyed(find, key)) || (node && bymarkup(find, node));
        if (!one) return { why: 'dupe', n: n };
        /* The context comes into the find; the words stay what is measured
         * for markup and for the script, since that is where they sit. */
        i = one.at; pre = one.pre; post = one.post; find = one.find;
      } else if (!bounded(i, find.length)) return { why: 'partial' };
      var script = inScript(i);
      if (FORMS[k].id === 'js' && !script) return { why: 'partial' };
      return { find: find, pre: pre, post: post, script: script,
               markup: markupAround(i, find.length - pre.length - post.length) };
    }
    return { why: 'absent' };
  }

  function encode(text, hit) {
    if (hit.cf) return text;   // the runtime escapes it when it draws it
    var s = text;
    if (!hit.script || hit.markup) s = entity(s);
    if (hit.script) s = jsEsc(s);
    return s;
  }

  /* WHAT A PASSAGE IS WORTH WRITING BACK. Text is encoded for its context;
   * `strong` and `em` are kept as tags, and everything else an editable node
   * has picked up — a paste, a browser's own wrapper — is flattened to its
   * words. The whitelist is the filter: nothing reaches the file that this
   * does not name, so `contenteditable` does not have to be trusted. */
  var INLINE = { STRONG: 'strong', B: 'strong', EM: 'em', I: 'em' };
  function serialize(el, hit, depth) {
    var out = '';
    for (var n = el.firstChild; n; n = n.nextSibling) {
      var tag = n.nodeType === 1 ? INLINE[n.tagName] : null;
      var d = (depth || 0);
      /* Recursive, because bold inside italic is two nested tags and taking
       * the textContent of the outer one would quietly drop the inner. The
       * editor's own wrapper is transparent: it is not in the file and it is
       * not the only thing between a paragraph and the words. */
      if (n.nodeType === 1 && n.getAttribute && n.getAttribute('data-ssx') === 'e' && d < 4) out += serialize(n, hit, d + 1);
      else if (tag && hit.markup && d < 4) out += '<' + tag + '>' + serialize(n, hit, d + 1) + '</' + tag + '>';
      else out += encode(n.textContent == null ? n.nodeValue : n.textContent, hit);
    }
    return out;
  }

  /* ---- a paragraph, in the source ----------------------------------------
   * A role is a class on the <p>, so the pair for one spans the whole element
   * and not just the words inside it. The bounds are read off the SOURCE and
   * not off `outerHTML`: the browser's serialization normalises quoting and
   * attribute order, and a find that has been through it stops matching the
   * file it came from. The text inside is unique, so the region is too. */
  function region(hit) {
    if (!hit.markup) return null;   // a widened find starts at its key, not in markup
    var i = src.indexOf(hit.find);
    if (i < 0) return null;
    /* Back to the paragraph's own opening tag, not to the nearest `<`: a
     * passage that follows a `<strong>` is preceded by `</strong>`, and the
     * first version of this read that as the enclosing tag and gave up. */
    var open = src.lastIndexOf('<p', i);
    if (open < 0 || !/[\s>]/.test(src[open + 2] || '')) return null;
    var shut = src.indexOf('>', open);
    var end = src.indexOf('</p>', i);
    if (shut < 0 || end < 0 || end > i + 4000) return null;
    if (src.lastIndexOf('</p>', i) > open) return null;        // not the same paragraph
    var attrs = src.slice(open + 2, shut);
    var cls = /class\s*=\s*\\?(["'])([^"'\\]*)\\?\1/.exec(attrs);
    return { start: open, end: end + 4, attrs: attrs, cls: cls ? cls[2] : '',
             find: src.slice(open, end + 4) };
  }

  var ROLES = { lead: 1, callout: 1, foot: 1 };

  /* ---- what is on the page ---------------------------------------------- */

  var SKIP = /^(script|style|noscript|title|option)$/i;
  /* WHAT THE PAGE PAINTS, from the mark the shell puts on it. A readout's
   * FIRST value is written into the source by whoever built the page, so it
   * round-trips like any other passage and the round-trip test waves it
   * through — then the sim overwrites it on the next frame and the edit is
   * gone, with a misleading number left in the file. Which classes hold a
   * live number is `lesson-shell.js`'s to say, beside the sheet that styles
   * them; this reads the answer. CLAUDE.md: a number in user-facing text is
   * read from the data at render time. */
  var READOUT = '[data-live]';
  var CONTROL = 'button, a, label, input, select, summary, [role="button"], [role="tab"]';

  function texts() {
    var out = [];
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentElement;
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        if (!p || SKIP.test(p.tagName) || p.closest('.ssx-ui, [data-ssx="e"]')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    var n;
    while ((n = w.nextNode())) out.push(n);
    return out;
  }

  /* The whitespace at the edges belongs to the source, not to the sentence:
   * the student edits the words and the indentation is put back around them. */
  function split(v) {
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(v);
    return { lead: m[1], core: m[2], trail: m[3] };
  }

  /* ---- the mode --------------------------------------------------------- */

  /* The fields of the step on screen, each one passage. The whole element is
   * the unit, since a paragraph with a bold run in it is three text nodes and
   * one field. `nextLabel` is skipped on the last step, whose button the shell
   * relabels "Start over" whatever the lesson says. */
  var CF = [['.lshell-panel .eyebrow', 'eyebrow'], ['.lshell-panel .title', 'title'], ['.lshell-nav .primary', 'nextLabel']];
  function paintComposed(C) {
    var i = C.at(), n = (C.spec.steps || []).length;
    if (i < 0) return;
    var els = [];
    CF.forEach(function (k) {
      var el = document.querySelector(k[0]);
      if (el && el.textContent.trim() && !(k[1] === 'nextLabel' && i === n - 1)) els.push([el, k[1]]);
    });
    document.querySelectorAll('.lshell-panel [data-cf]').forEach(function (el) { els.push([el, el.getAttribute('data-cf')]); });
    els.forEach(function (pair) {
      var el = pair[0], field = pair[1];
      if (el.querySelector('[data-ssx="e"]')) return;
      var span = document.createElement('span');
      span.setAttribute('data-ssx', 'e');
      while (el.firstChild) span.appendChild(el.firstChild);
      el.appendChild(span);
      var hit = { cf: field, step: i, find: 'cf:' + i + ':' + field, script: false,
                  markup: field === 'lead' || field === 'callout' || /^body\./.test(field) };
      var rec = { span: span, hit: hit, lead: '', trail: '', text: span.textContent };
      rec.body = serialize(span, hit);
      span._ssx = rec;
      spans.push(rec);
      order.push(rec.text);
    });
  }

  /* TWO PASSES, and the reason is the order the walker happens to run in.
   * Everything is resolved first, then the passages are wrapped, then what is
   * left is offered for pointing at — and a block holding a passage is never
   * offered, whichever of its text nodes the walker reached first. One pass
   * marked the paragraph as a thing to point at when its unresolved run came
   * before its editable one, and a paragraph offered whole hides the words
   * inside it. */
  function paint() {
    spans = []; order = [];
    var C = window.Compose;
    if (C) paintComposed(C);
    var list = texts(), found = [];
    for (var j = 0; j < list.length; j++) {
      var host = list[j].parentElement;
      /* On a composed page every editable word was claimed above; the rest
       * (notes, chips, chrome) is drawn by the library and is for pointing at. */
      found.push(C || (host && host.closest(READOUT))
        ? { why: 'absent' }
        : locate(list[j].nodeValue, keyFor(host), list[j]));
    }
    var holds = [];
    for (var c = 0; c < spans.length; c++) {
      for (var e1 = spans[c].span.parentElement; e1 && e1 !== document.body; e1 = e1.parentElement) {
        if (holds.indexOf(e1) < 0) holds.push(e1);
      }
    }
    for (var j2 = 0; j2 < list.length; j2++) {
      if (found[j2].why) continue;
      for (var e2 = list[j2].parentElement; e2 && e2 !== document.body; e2 = e2.parentElement) {
        if (holds.indexOf(e2) < 0) holds.push(e2);
      }
    }
    for (var k = 0; k < list.length; k++) {
      var node = list[k], parts = split(node.nodeValue), el = node.parentElement;
      var hit = found[k];
      if (!hit.why) {
        /* A pending edit is re-applied here: the page repaints its panel from
         * the source strings on every step change, so an unsaved change would
         * otherwise vanish the moment the student walked to the next step. */
        var held = find(hit.find);
        var span = document.createElement('span');
        span.setAttribute('data-ssx', 'e');
        span.textContent = held ? held.text : parts.core;
        node.parentNode.insertBefore(document.createTextNode(parts.lead), node);
        node.parentNode.insertBefore(span, node);
        node.nodeValue = parts.trail;
        var rec = { span: span, hit: hit, lead: parts.lead, trail: parts.trail, text: span.textContent };
        rec.body = serialize(span, hit);
        span._ssx = rec;
        spans.push(rec);
        order.push(span.textContent);
        restore(span, hit);
        hoist(rec);
      } else if (el && holds.indexOf(el) < 0) {
        mark(el, hit, order.length ? order[order.length - 1] : '');
      }
    }
    post({ type: 'app-edit-ready', editable: spans.length, pending: pending.length });
  }

  /* A named part is selected whole. `data-note` is the library saying this
   * thing has a name the model can act on, and the label inside it is not
   * separately meaningful — nor separately clickable, since a callout's own
   * leader and label are pointer-events: none. */
  function mark(el, hit, anchor) {
    var host = el.closest('[data-note]') || el;
    if (host.hasAttribute('data-ssx')) return host;
    host.setAttribute('data-ssx', host.closest(CONTROL) ? 'sc' : 's');
    if (anchor != null) host._ssxAnchor = anchor;
    host._ssxWhy = { code: hit.why, n: hit.n || 0, where: where(host),
                     /* Inside the panel's own copy, so `absent` means the words
                      * on screen and the words in the file have come apart,
                      * not that a readout painted them. */
                     copy: !!host.closest('.lshell-panel .body, .lshell-panel .title, .lshell-panel .eyebrow') };
    /* The mark goes back on. A repaint takes the highlights with it, and a
     * selection whose tag is still in the box but whose part is no longer lit
     * reads as a selection that came undone. */
    if (picked.length) {
      var key = keyOf(pillFor(host));
      for (var i = 0; i < picked.length; i++) {
        if (keyOf(picked[i]) === key) { host.setAttribute('data-ssx-sel', '1'); break; }
      }
    }
    return host;
  }

  /* WHICH LAYER DREW IT, as a word the builder turns into a sentence: the copy
   * belongs on the page a student is reading, not in here. `data-note` and the
   * shell's own class names are the library saying whose text this is. */
  function where(el) {
    if (el.closest('[data-note]')) return 'note';
    if (el.closest('.show-panel')) return 'chips';
    if (el.closest(READOUT)) return 'readout';
    if (el.closest('.lshell-nav, .lshell-progress, .lshell-topbar')) return 'chrome';
    if (el.ownerSVGElement || el.tagName === 'svg') return 'chart';
    return '';
  }

  /* AN INLINE TAG AROUND A PASSAGE IS PULLED INSIDE IT, and this is what makes
   * bold reversible. A model writes `<p><strong>The claim.</strong> The rest`,
   * so the tag is OUTSIDE the editable span and outside the passage's own
   * pair: the browser cannot take it off, and asked to unbold it writes a
   * `font-weight: normal` span within instead, which serializes away to
   * nothing — the text would read unbolded on screen and save unchanged.
   * Moving the tag inside the span puts every inline mark in one place, where
   * execCommand can toggle it and the serializer can see it. The paragraph
   * becomes the unit from then on, since the tag it used to hold is no longer
   * anywhere in the passage's own find. */
  function hoist(rec) {
    var span = rec.span, par = span.parentElement;
    if (!rec.hit.markup || !par || !INLINE[par.tagName]) return;
    if (par.querySelectorAll('[data-ssx="e"]').length !== 1) return;
    /* THE WHITESPACE COMES WITH IT. The tag is rebuilt around everything it
     * held, the edges `split` put aside included, because the file writes them
     * inside it: `<strong>the claim. </strong>Rest`. Moving only the words left
     * that space outside the tag; the paragraph rendered the same and no longer
     * matched, so after one repaint the bold run was a substring of a longer
     * one and the next passage had grown a leading space the file does not
     * have — both of them things to point at rather than words to edit. */
    var kids = [].slice.call(par.childNodes);
    var tag = document.createElement(INLINE[par.tagName]);
    for (var i = 0; i < kids.length; i++) {
      if (kids[i] !== span) { tag.appendChild(kids[i]); continue; }
      while (span.firstChild) tag.appendChild(span.firstChild);
    }
    span.appendChild(tag);
    par.parentNode.insertBefore(span, par);
    par.remove();
    rec.lead = ''; rec.trail = '';   // they are inside the tag now
    rec.body = serialize(span, rec.hit);
    var p = span.closest('p'), reg = p && !p._ssxRegion && region(rec.hit);
    if (!reg) return;   // restore() already owns this paragraph, state and all
    reg.script = rec.hit.script;
    p._ssxRole = p._ssxRole || (ROLES[p.className] ? p.className : '');
    claim(p, reg);
  }

  /* A ROLE OUTLIVES THE PARAGRAPH IT WAS PUT ON. The panel is rebuilt from the
   * page's own strings on every step change, so the element carrying a role is
   * thrown away and a fresh one takes its place; the role is held against the
   * source region instead, which is the one name for it that does not change,
   * and put back on whatever element is now standing in that spot. */
  var regions = {};
  function restore(span, hit) {
    if (!hit.markup) return;
    var p = span.closest('p');
    if (!p || p._ssxRegion) return;
    var reg = region(hit);
    var held = reg && regions[reg.find];
    if (!held) return;
    p._ssxRegion = reg;
    p._ssxRole = held.role; p._ssxGone = held.gone; p._ssxAfter = held.after;
    if (held.role) p.className = held.role;
    if (held.gone) p.style.display = 'none';
    else if (held.after && !p.nextElementSibling) {
      var add = document.createElement('p');
      add.textContent = 'A new line.';
      p.parentNode.insertBefore(add, p.nextSibling);
    }
  }

  /* A pair that puts back what it found is not an edit. Bolding a phrase and
   * unbolding it leaves one of these, and without this the save writes a
   * version in which nothing changed. */
  function prune() { pending = pending.filter(function (e) { return e.replace !== e.find; }); }

  function find(f) { for (var i = 0; i < pending.length; i++) if (pending[i].find === f) return pending[i]; return null; }

  /* Taking the wrappers off puts back the CHILDREN, never the text. A span
   * holds the paragraph's `strong` and `em` once `hoist` has moved them
   * inside it, and standing its textContent in its place threw those away:
   * the paragraph came back as one flat run, which is not what the file says,
   * so the next paint could not find it and offered the whole <p> as a thing
   * to point at instead of words to edit. Only the parents that lost a
   * wrapper are normalised — the document's other text nodes are the app's. */
  function unpaint() {
    var touched = [];
    document.querySelectorAll('[data-ssx]').forEach(function (el) {
      if (el.getAttribute('data-ssx') !== 'e') { el.removeAttribute('data-ssx'); el.removeAttribute('data-ssx-sel'); el._ssxAnchor = null; return; }
      var par = el.parentNode;
      while (el.firstChild) par.insertBefore(el.firstChild, el);
      el.remove();
      if (touched.indexOf(par) < 0) touched.push(par);
    });
    for (var i = 0; i < touched.length; i++) touched[i].normalize();
    spans = []; order = [];
  }

  /* One pair per passage, whatever was typed into it. Banked while the caret
   * is still in it as well as when it leaves: the page redraws its panel
   * whenever the student walks a step, and an edit that only existed in the
   * DOM would go with it. */
  function bank(rec, keep) {
    var text = rec.span.textContent, body = serialize(rec.span, rec.hit);
    if (!keep) rec.span.removeAttribute('contenteditable');
    /* A paragraph carrying a role is written back whole, so a change to its
     * words rebuilds that pair rather than adding a second one inside it. */
    var para = blockOf(rec.span);
    if (para) { reblock(para); return; }
    if (body === rec.body) return;
    rec.text = text; rec.body = body;
    if (rec.hit.cf && window.Compose) window.Compose.setText(rec.hit.step, rec.hit.cf, body);
    var pair = { find: rec.hit.find,
                 replace: (rec.hit.pre || '') + rec.lead + body + rec.trail + (rec.hit.post || ''),
                 text: text };
    var had = find(rec.hit.find);
    if (had) { had.replace = pair.replace; had.text = text; }
    else pending.push(pair);
    prune();
    post({ type: 'app-edit-dirty', count: pending.length });
  }

  /* ---- roles --------------------------------------------------------------
   * Two kinds. `strong` and `em` are a wrapper around the SELECTION and stay
   * inside the passage's own pair, which is why they are offered only where
   * the enclosing literal is markup: a title goes through textContent and a
   * tag in one would show as a tag. The rest are a class on the paragraph, or
   * the paragraph itself going away, and each is one pair spanning the <p>. */

  /* The paragraph this span sits in, if it already has a pending pair. */
  function blockOf(el) {
    var p = el.closest && el.closest('p');
    if (!p || !p._ssxRegion) return null;
    return p;
  }

  /* Rebuild a paragraph's pair from what is on the page now. The find never
   * changes — it is the region as the FILE has it — so re-applying a role or
   * retyping the words updates one pair rather than stacking overlaps. */
  function reblock(p) {
    var reg = p._ssxRegion, hit = { script: reg.script, markup: true };
    var role = p._ssxRole || '';
    var body = serialize(p, hit);
    /* The tag goes into the same string literal the words do, so its own
     * quotes are escaped the way theirs are. `\"` inside a single-quoted
     * literal is an identity escape, so this is right whichever it is. */
    var open = role ? '<p class="' + role + '">' : '<p>';
    if (reg.script) open = jsEsc(open);
    var pair = find(reg.find) || (pending.push({ find: reg.find }), pending[pending.length - 1]);
    pair.replace = p._ssxGone ? '' : open + body + '</p>' + (p._ssxAfter || '');
    regions[reg.find] = { role: role, gone: !!p._ssxGone, after: p._ssxAfter || '' };
    prune();
    post({ type: 'app-edit-dirty', count: pending.length });
  }

  /* Everything inside this paragraph is now written by its own pair, so any
   * pair for a passage within it is dropped: two edits over one stretch of
   * the file cannot both apply. */
  function claim(p, reg) {
    p._ssxRegion = reg;
    regions[reg.find] = { role: p._ssxRole || '', gone: !!p._ssxGone, after: p._ssxAfter || '' };
    pending = pending.filter(function (e) { return e.find === reg.find || reg.find.indexOf(e.find) < 0; });
  }

  function role(name) {
    var sel = getSelection(), node = sel.anchorNode;
    var span = node && (node.nodeType === 1 ? node : node.parentElement);
    span = span && span.closest('[data-ssx="e"]');
    if (!span) return;
    var rec = span._ssx;
    if (name === 'strong' || name === 'em') {
      if (!rec || !rec.hit.markup) return;
      /* execCommand, and not a wrapper of our own. A selection that covers
       * part of an existing bold, or two of them and the words between, is
       * exactly what it gets right and what surroundContents cannot express:
       * it toggles the whole selection, splits and merges the tags, and
       * `queryCommandState` is then the honest answer for the button. Off is
       * the same press as on, which is the only way back from a bold applied
       * by mistake, since nothing here is undo. `styleWithCSS` false so it
       * writes tags rather than a style attribute the serializer would drop. */
      sel = reselect(span);
      if (sel.isCollapsed && !wrapping(sel.anchorNode, span, name)) return;
      try { document.execCommand('styleWithCSS', false, false); } catch (e) { /* older engines */ }
      document.execCommand(name === 'strong' ? 'bold' : 'italic');
      kept = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
      bank(rec, true);
      report(span);
      return;
    }
    var p = span.closest('p');
    if (!p) return;
    var reg = p._ssxRegion || region(rec.hit);
    if (!reg) return;
    reg.script = rec.hit.script;
    claim(p, reg);
    if (name === 'delete') { p._ssxGone = true; p.style.display = 'none'; }
    else if (name === 'after') {
      var add = document.createElement('p');
      add.textContent = 'A new line.';
      p.parentNode.insertBefore(add, p.nextSibling);
      p._ssxAfter = '<p>A new line.</p>';
    } else {
      p._ssxRole = ROLES[name] ? name : '';
      p.className = p._ssxRole;
    }
    reblock(p);
    report(span);
  }

  /* THE PALETTE IS IN THE OTHER DOCUMENT, so pressing one of its buttons takes
   * the focus off this one and the selection with it. The live range is kept
   * here as it moves, and put back before a role acts, which is the only way
   * a button outside the frame can mean "these words". */
  var kept = null;
  document.addEventListener('selectionchange', function () {
    if (!on) return;
    var sel = getSelection();
    if (!sel.rangeCount) return;
    var node = sel.anchorNode, el = node && (node.nodeType === 1 ? node : node.parentElement);
    var span = el && el.closest('[data-ssx="e"]');
    if (!span) return;
    kept = sel.getRangeAt(0).cloneRange();
    /* The buttons say what the SELECTION is, so they follow it however it
     * moved: a drag, shift and an arrow key, or select-all. */
    clearTimeout(told);
    told = setTimeout(function () { report(span); }, 60);
  });
  var told = null;
  function reselect(span) {
    var sel = getSelection();
    if (!kept || !span.contains(kept.commonAncestorContainer)) return sel;
    span.focus();
    sel.removeAllRanges(); sel.addRange(kept);
    return sel;
  }

  /* The `strong` or `em` the caret sits inside, within this passage. */
  function wrapping(node, span, name) {
    var tag = name.toUpperCase();
    for (var e = node && (node.nodeType === 1 ? node : node.parentElement); e && e !== span; e = e.parentElement) {
      if (INLINE[e.tagName] === name) return e;
    }
    return null;
  }

  /* What the caret is in, so the builder can offer only the roles that apply
   * to it. Sent on every focus and after every role. */
  function report(span) {
    var rec = span && span._ssx;
    if (!rec) { post({ type: 'app-edit-focus', on: false }); return; }
    var p = span.closest('p');
    var b = false, i = false;
    try { b = document.queryCommandState('bold'); i = document.queryCommandState('italic'); }
    catch (e) { b = !!wrapping(getSelection().anchorNode, span, 'strong'); }
    post({ type: 'app-edit-focus', on: true, markup: !!rec.hit.markup,
           block: !!(p && (p._ssxRegion || region(rec.hit))),
           role: (p && p._ssxRole) || (p && ROLES[p.className] ? p.className : ''),
           strong: b, em: i,
           text: (span.textContent || '').slice(0, 60) });
  }

  function edit(span) {
    var rec = span._ssx;
    if (!rec) return;
    /* Not `plaintext-only`: a role puts a <strong> inside, and the serializer
     * is what keeps anything else out, so the caret does not have to. */
    span.setAttribute('contenteditable', 'true');
    span.focus();
    var r = document.createRange(); r.selectNodeContents(span);
    var sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    report(span);
    span.onblur = function () { bank(rec); report(null); };
    span.oninput = function () { clearTimeout(span._t); span._t = setTimeout(function () { bank(rec, true); }, 400); };
    span.onkeydown = function (e) {
      if (e.key === 'Enter') { e.preventDefault(); span.blur(); }
      if (e.key === 'Escape') { e.preventDefault(); span.textContent = rec.text; span.blur(); }
      e.stopPropagation();
    };
  }

  /* ---- what is picked out --------------------------------------------------
   * A SELECTION, not a growing list. A plain click is the selection; holding
   * cmd or ctrl adds to it, and clicking a picked part again with the
   * modifier takes it out. The frame owns the set because it owns the
   * highlight, and it hands the builder the whole list every time rather than
   * one pill at a time, so the two cannot come apart.
   *
   * A pill is identified by what it says and where, not by its element: the
   * panel is rebuilt on every step change, so an element picked on step one
   * does not survive being walked away from — the reference to it should. */
  var picked = [];
  function keyOf(pill) { return (pill.note || '') + '|' + (pill.text || '') + '|' + (pill.step || ''); }

  function pillFor(el) {
    var note = el.closest('[data-note]');
    return {
      text: (el.textContent || '').trim().slice(0, 120),
      tag: el.tagName.toLowerCase(),
      cls: (el.getAttribute('class') || '').slice(0, 80),
      note: note ? note.getAttribute('data-note') : '',
      anchor: String(el._ssxAnchor || '').slice(0, 160),
      step: (document.querySelector('.lshell-count') || {}).textContent || '',
      why: el._ssxWhy || { code: 'absent', n: 0, where: where(el) },
    };
  }

  function unmark() {
    var m = document.querySelectorAll('[data-ssx-sel]');
    for (var i = 0; i < m.length; i++) m[i].removeAttribute('data-ssx-sel');
  }

  function select(el, add) {
    var pill = pillFor(el), key = keyOf(pill), at = -1;
    for (var i = 0; i < picked.length; i++) if (keyOf(picked[i]) === key) at = i;
    if (!add) {
      unmark();
      picked = [pill];
      el.setAttribute('data-ssx-sel', '1');
    } else if (at >= 0) {
      picked.splice(at, 1);
      el.removeAttribute('data-ssx-sel');
    } else {
      picked.push(pill);
      el.setAttribute('data-ssx-sel', '1');
    }
    post({ type: 'app-select', picks: picked });
  }

  function unselect() { unmark(); picked = []; post({ type: 'app-select', picks: picked }); }

  function onClick(e) {
    if (!on) return;
    /* A PLAIN CLICK SAYS WHAT YOU MEAN NOW. Putting the caret in a passage is
     * not a reference, so it leaves nothing selected: a part still lit while
     * the student has moved on to typing somewhere else reads as a selection
     * that would not come off. Hold the modifier to keep what is picked.
     * A click the page wants — a Next button, the canvas — is navigation and
     * not a choice, and it leaves the selection where it is. */
    var add = e.metaKey || e.ctrlKey;
    var b = e.target.closest ? e.target.closest('.ssx-badge') : null;
    if (b && b._ssxFor) {
      e.preventDefault(); e.stopPropagation();
      var t = b._ssxFor;
      if (t.getAttribute('data-ssx') === 'e') { if (!add) unselect(); edit(t); }
      else select(t, add);
      return;
    }
    var span = e.target.closest ? e.target.closest('[data-ssx="e"]') : null;
    if (span) {
      if (span.hasAttribute('contenteditable') || span.closest(CONTROL)) return;
      e.preventDefault(); e.stopPropagation();
      if (!add) unselect();
      edit(span);
      return;
    }
    var pick = e.target.closest ? e.target.closest('[data-ssx="s"]') : null;
    if (pick && !pick.closest(CONTROL)) { e.preventDefault(); e.stopPropagation(); select(pick, add); }
  }

  /* ONE BADGE, on whatever is under the pointer, and it is the way in to
   * everything. A plain click is a shortcut that only works where the page
   * does not want the click itself: text in a button, and a callout's label,
   * cannot take one, so an affordance that appeared only sometimes would be
   * the one missing wherever it was needed. */
  var badge = null;
  function onMove(e) {
    if (!on) return;
    var el = e.target.closest ? e.target.closest('[data-ssx]') : null;
    if (!el) { if (badge) badge.style.display = 'none'; return; }
    if (!badge) {
      badge = document.createElement('button');
      badge.className = 'ssx-badge ssx-ui'; badge.type = 'button';
      document.body.appendChild(badge);
    }
    var r = el.getBoundingClientRect();
    badge._ssxFor = el;
    badge.textContent = el.getAttribute('data-ssx') === 'e' ? '\u270e' : '+';
    badge.style.display = 'block';
    badge.style.left = (r.left - 9) + 'px';
    badge.style.top = (r.top - 9) + 'px';
  }

  /* POINTER EVENTS BACK ON, because the shell turns them off. The topbar and
     the hint are click-through so a drag over them orbits the scene, and a
     passage inside one was outlined as editable and then took no click and no
     badge: the brand looked editable and was not. A wrapper asking for its own
     clicks is hittable however its ancestors are set. */
  var CSS = '[data-ssx]{outline:1px dashed rgba(60,110,220,.55);outline-offset:2px;border-radius:2px;cursor:text;pointer-events:auto}'
    + '[data-ssx-sel]{outline:2px solid rgb(60,110,220)!important;background:rgba(60,110,220,.16)!important}'
    /* A callout's own box is 0x0 — its leader, dot and label are each placed
       absolutely — so an outline on it is drawn nowhere. The label is the
       part a student is pointing at, and it is what carries the mark. */
    + '[data-ssx] .annot-label{outline:1px solid rgba(60,110,220,.5);outline-offset:2px;border-radius:2px}'
    + '[data-ssx-sel] .annot-label{outline:2px solid rgb(60,110,220);background:rgba(60,110,220,.16)}'
    + '[data-ssx="s"],[data-ssx="sc"]{outline-style:solid;outline-color:rgba(60,110,220,.28);cursor:cell}'
    + '[data-ssx]:hover{outline-color:rgba(60,110,220,.95);background:rgba(60,110,220,.07)}'
    + '[data-ssx="e"][contenteditable]{outline:2px solid rgba(60,110,220,.95);background:rgba(60,110,220,.09)}'
    + '.ssx-badge{position:fixed;z-index:2147483647;width:18px;height:18px;padding:0;line-height:16px;'
    + 'font-size:11px;border-radius:9px;border:1px solid #fff;background:rgb(60,110,220);color:#fff;cursor:pointer;display:none}';

  function arm(html) {
    src = String(html || '');
    scanScripts();
    if (!document.getElementById('ssx-css')) {
      var s = document.createElement('style'); s.id = 'ssx-css'; s.className = 'ssx-ui'; s.textContent = CSS;
      document.head.appendChild(s);
    }
    on = true;
    paint();
    /* The panel is rebuilt on every step change, so the outlines are too.
     * Debounced, because a running scene mutates its own DOM every frame. */
    /* WHAT COUNTS AS THE PAGE REDRAWING is a span of ours coming off the
     * document, which is what a step change does to the panel. Repainting on
     * any mutation instead takes the caret out mid-sentence, since typing is
     * a mutation and so is a running scene's own DOM, every frame. Nothing is
     * repainted while a caret is in one either way. */
    if (!observer) {
      observer = new MutationObserver(function (records) {
        if (!on || document.activeElement && document.activeElement.hasAttribute('contenteditable')) return;
        var stale = spans.some(function (r) { return !r.span.isConnected; });
        if (!stale) stale = records.some(function (m) {
          return [].some.call(m.addedNodes, function (n) { return n.nodeType === 1 && n.textContent.trim(); });
        });
        if (!stale) return;
        clearTimeout(redraw);
        redraw = setTimeout(function () {
          if (!on || document.activeElement && document.activeElement.hasAttribute('contenteditable')) return;
          /* Deaf while repainting. Painting is itself a childList mutation
           * that adds elements holding text, so an observer left listening
           * reads its own work as another redraw and never stops. */
          observer.disconnect();
          unpaint(); paint();
          observer.takeRecords();
          observe();
        }, 300);
      });
    }
    observe();
  }

  function observe() { observer.observe(document.body, { childList: true, subtree: true, characterData: true }); }

  function disarm() {
    on = false;
    clearTimeout(redraw);
    if (observer) observer.disconnect();
    if (badge) badge.style.display = 'none';
    unpaint();
  }

  /* The composed edits as ops, numbered from 1 as the server's lesson is. A
   * body is sent whole, from the spec already holding every paragraph typed
   * over, and a paragraph emptied is a paragraph removed. */
  function ops() {
    var C = window.Compose, out = [], bodies = {};
    if (!C) return out;
    pending.forEach(function (p) {
      var m = /^cf:(\d+):(.+)$/.exec(p.find);
      if (!m) return;
      var i = +m[1], field = m[2];
      if (/^body\./.test(field)) bodies[i] = true;
      else out.push({ op: 'setText', step: i + 1, field: field, text: p.replace.trim() });
    });
    Object.keys(bodies).forEach(function (i) {
      var list = (C.spec.steps[i].body || []).map(function (t) { return String(t || '').trim(); }).filter(Boolean);
      out.push({ op: 'setBody', step: +i + 1, paragraphs: list });
    });
    return out;
  }

  addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.type !== 'app-edit') return;
    if (d.clear) unselect();
    else if (d.role) role(d.role);
    else if (d.on) arm(d.html);
    else if (d.save) {
      document.activeElement && document.activeElement.blur();
      var plain = pending.filter(function (p) { return p.find.indexOf('cf:') !== 0; });
      post({ type: 'app-edit-edits', ops: ops(),
             edits: plain.map(function (p) { return { find: p.find, replace: p.replace }; }) });
    } else if (d.done) { pending = []; regions = {}; picked = []; disarm(); }
    else disarm();
  });

  document.addEventListener('click', onClick, true);
  document.addEventListener('pointermove', onMove, true);

  window.__ssEdit = { rearm: function () { post({ type: 'app-edit-ready', editable: spans.length, pending: pending.length }); } };
  post({ type: 'app-edit-loaded' });
})();
