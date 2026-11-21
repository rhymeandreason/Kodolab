/* =============================================================================
 *  api/_embed.js — text to vectors, behind one interface
 * =============================================================================
 *  An embedder is `{ id, model, dims, task, embed(texts) → unit vectors }`.
 *  `EMBEDDER` in the environment picks one, the way AI_PROVIDER picks the
 *  model that writes, and the two are independent: which model composes a
 *  lesson says nothing about which one ranks the components for it. Adding
 *  a local one (an Ollama server, a small open model) is an entry here.
 *
 *  A VECTOR IS ONLY COMPARABLE TO ITS OWN KIND. Same model, same task type,
 *  same width, or the cosines come back plausible and the ranking is quietly
 *  wrong (api/find.js says the same). So `stamp` is written into every baked
 *  file and a reader refuses a file whose stamp differs from the live one.
 *
 *  Vectors come back unit length: a truncated Matryoshka prefix is a valid
 *  embedding but not a unit vector, and every reader here treats a dot
 *  product as the cosine.
 * ========================================================================== */
'use strict';

const unit = v => { const n = Math.hypot(...v) || 1; return v.map(x => x / n); };

/* SEMANTIC_SIMILARITY: a teacher's request against short phrases ("osmosis
 * and tonicity on a real cell") is the same register at the same length,
 * which is the symmetric case. The RETRIEVAL pair is for a short query
 * against a long passage. */
function gemini() {
  const model = process.env.EMBED_MODEL || 'gemini-embedding-001';
  const dims = 768, task = 'SEMANTIC_SIMILARITY';
  async function embed(texts) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY is not set');
    const out = [];
    for (let i = 0; i < texts.length; i += 50) {
      const body = { requests: texts.slice(i, i + 50).map(t => ({
        model: 'models/' + model, content: { parts: [{ text: t }] }, taskType: task, outputDimensionality: dims })) };
      let res, last = '';
      // One retry: a cold 503 is the common failure, and it says nothing about the text.
      for (let tries = 0; tries < 2; tries++) {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`,
          { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) });
        if (res.ok) break;
        last = await res.text();
      }
      if (!res.ok) throw new Error(`embed failed ${res.status}: ${last.slice(0, 200)}`);
      for (const e of (await res.json()).embeddings) out.push(unit(e.values));
    }
    return out;
  }
  return { id: 'gemini', model, dims, task, embed };
}

const EMBEDDERS = { gemini };

function pick() {
  const id = process.env.EMBEDDER || 'gemini';
  if (!EMBEDDERS[id]) throw new Error(`EMBEDDER is "${id}", which is not one of: ${Object.keys(EMBEDDERS).join(', ')}`);
  const e = EMBEDDERS[id]();
  return { ...e, stamp: `${e.id}:${e.model}:${e.task}:${e.dims}` };
}

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

module.exports = { pick, dot, unit };
