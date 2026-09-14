/* =============================================================================
 *  api/find.js — one query, one vector
 * =============================================================================
 *  GET  /api/find  → whether the endpoint is configured and gated
 *  POST /api/find  {q} → {v, model, dims, task, ms}
 *
 *  THE SERVER DOES NOT SEARCH. It embeds the reader's question and returns the
 *  vector; the ranking happens in the page, against the baked
 *  lib/mapcontent-vectors.json it already loaded. That split is deliberate:
 *
 *    · the corpus vectors are public anyway — they ship with the page — so
 *      keeping the cosine server-side would protect nothing;
 *    · the floor, the top-k and what counts as a discovered edge are the
 *      knobs worth tuning, and tuning them in the page is an edit rather than
 *      a redeploy;
 *    · this stays stateless, which is what makes it fast enough to sit on a
 *      keystroke.
 *
 *  THE TASK TYPE IS NOT A DETAIL. bake-vectors.js writes the corpus with
 *  SEMANTIC_SIMILARITY, and a query embedded with anything else lands in a
 *  different geometry: the cosines come back plausible and the ranking is
 *  quietly wrong. The value is echoed in the response so a page can refuse a
 *  vector that does not match the file it is comparing against.
 *
 *  NO TURN COUNTER, AND THAT IS A CHOICE. _limit.js counts rows in the tutor's
 *  tables; a search writes none, so reusing it would ration search against
 *  tutor usage, which is two different things sharing one number. The key gate
 *  is the protection here, and an embedding call is orders of magnitude cheaper
 *  than a turn. A promoted page wants its own counter; a prototype does not.
 * ========================================================================== */
'use strict';

const keys = require('./_keys.js');
const finds = require('./_finds.js');
const { local } = require('./_local.js');

const MODEL = process.env.EMBED_MODEL || 'gemini-embedding-001';
const DIMS = 256;
const TASK = 'SEMANTIC_SIMILARITY';
const MAXLEN = 400;          // a question, not a passage

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  /* OPEN, unlike the tutor, and not because a search is cheap. The gate it
     would inherit is the tutor's testing links, so a shared map link would also
     hand out tutor spend — one link, two budgets, and no way to give away the
     first without the second. The caps in _finds.js are the protection here, and
     they hold against someone with no key at all, which is the case the tutor's
     gate cannot cover anyway. `cohort` is still read and still recorded, so a
     link that HAS a key says which group it came from. */
  const who = await keys.cohort(req);

  if (req.method === 'GET') {
    return res.status(200).json({
      ok: !!process.env.GEMINI_API_KEY, model: MODEL, dims: DIMS, task: TASK, gated: false,
    });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'GET or POST only' });
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
  const q = String(body.q || '').trim().slice(0, MAXLEN);
  if (!q) return res.status(400).json({ error: 'q is required' });

  const capped = await finds.exceeded({ visitorId: body.visitorId });
  if (capped) return res.status(capped.status).json(capped.body);

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: 'no embedding key configured' });

  const t0 = Date.now();
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent`,
      { method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          model: 'models/' + MODEL,
          content: { parts: [{ text: q }] },
          taskType: TASK,
          outputDimensionality: DIMS,
        }) });
    if (!r.ok) {
      const detail = (await r.text()).slice(0, 200);
      console.error('[find] embed failed', r.status, detail);
      return res.status(502).json({ error: 'embedding failed' });
    }
    const json = await r.json();
    const raw = (json.embedding && json.embedding.values) || [];
    if (raw.length !== DIMS) {
      console.error('[find] unexpected width', raw.length);
      return res.status(502).json({ error: 'embedding failed' });
    }
    /* Re-normalised here, not in the page: a truncated Matryoshka prefix is a
     * valid embedding but not a unit vector, and the page treats a dot product
     * AS the cosine. The baked rows are normalised the same way. */
    const n = Math.hypot(...raw);
    const v = n ? raw.map(x => +(x / n).toFixed(4)) : raw;

    const ms = Date.now() - t0;
    // Not awaited: a reader waits for their answer, not for the row about it.
    finds.record({ visitorId: body.visitorId, cohort: who, q, kind: 'find', isLocal: local(req), ms });
    return res.status(200).json({ v, model: MODEL, dims: DIMS, task: TASK, ms });
  } catch (err) {
    console.error('[find] ' + ((err && err.message) || err));
    return res.status(502).json({ error: 'embedding failed' });
  }
};

function safeParse(s) { try { return JSON.parse(s); } catch { return {}; } }
