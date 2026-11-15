/* =============================================================================
 *  _providers/gemini.js — Gemini behind the same interface
 * =============================================================================
 *  Same contract as anthropic.js: system prompt + question + JSON Schema in,
 *  parsed JSON and normalised usage out. The differences that matter are all
 *  here, not in the tutor:
 *
 *    · the system prompt is `systemInstruction`, not a message;
 *    · the schema goes in `responseJsonSchema` and must lose
 *      `additionalProperties`, which Gemini's validator rejects;
 *    · usage counts are `usageMetadata`, and thinking tokens are counted
 *      separately from the answer's, so they get added into `output` rather
 *      than quietly disappearing from the bill the bench prints;
 *    · the stable half of the prompt is held server-side as a cached content
 *      handle, and `cachedContent` is mutually exclusive with
 *      `systemInstruction`, so only one of the two is ever sent.
 * ========================================================================== */
'use strict';

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

/* USD per 1M text tokens, paid tier, read 2026-08-19 from
 * https://ai.google.dev/gemini-api/docs/pricing
 *
 * Per model, because GEMINI_MODEL is a knob and the models are 40x apart: one
 * rate for "Gemini" would make the bench's cost readout fiction the moment you
 * turned that knob. An unlisted model prices at zero and says so, which is the
 * one honest answer available when the rate is not known here.
 *
 * `write` is one cache write per token: creation bills at the input rate, then
 * CACHE_TTL_S of storage (0.50/M/hour on the 3.x Flash line, 1.00 on 2.5).
 * `usageMetadata` reports neither, so `ask` counts the write itself as `written`.
 *
 * The 3.x Flash figures are promotional through 2026-12-31 (re-read 2026-11-14):
 * input/output double to 1.50/7.50 and storage to 1.00/M/hour after that. The
 * Gemini 4 pair doubles on 2026-12-01. A dated rate is a list, newest last,
 * and `priceOf` takes the last whose `from` has passed.
 *
 * Gemini 4 caches implicitly only, so `write` is zero: there is no explicit
 * cache to create, and a hit shows up as `cachedContentTokenCount` anyway. */
const FLASH_3X = [
  { input: 0.75, output: 3.75, cached: 0.075, write: 0.75 + 0.50 },
  { from: '2027-01-01', input: 1.50, output: 7.50, cached: 0.15, write: 1.50 + 1.00 },
];
const GEMINI_4 = [
  { input: 2.00, output: 10.00, cached: 0.10, write: 0 },
  { from: '2026-12-01', input: 4.00, output: 20.00, cached: 0.20, write: 0 },
];
const PRICES = {
  'gemini-3.8-flash':      FLASH_3X,
  'gemini-3.7-flash':      FLASH_3X,
  'gemini-4-carbon':       GEMINI_4,
  'gemini-4-hydrogen':     { input: 1.50, output: 7.50, cached: 0.075, write: 0 },
  'gemini-3.5-flash':      { input: 1.50, output: 9.00, cached: 0.15,  write: 1.50 + 0.50 },
  'gemini-3.5-flash-lite': { input: 0.30, output: 2.50, cached: 0.03,  write: 0.30 + 1.00 },
  // The 2.5 pair is closed to new API keys: Google answers a request for one
  // with a 400 naming its 3.5 replacement. Kept priced for anyone still on it.
  'gemini-2.5-flash':      { input: 0.30, output: 2.50, cached: 0.03,  write: 0.30 + 1.00 },
  'gemini-2.5-flash-lite': { input: 0.10, output: 0.40, cached: 0.01,  write: 0.10 + 1.00 },
};

const UNPRICED = { input: 0, output: 0, cached: 0, write: 0, unknown: true };
function priceOf(model, now = new Date()) {
  const r = PRICES[model];
  if (!r) return UNPRICED;
  if (!Array.isArray(r)) return r;
  const today = now.toISOString().slice(0, 10);
  let pick = r[0];
  for (const x of r) if (!x.from || x.from <= today) pick = x;
  return pick;
}
const PRICE = priceOf(MODEL);

/* Models that cache only implicitly: no explicit cache is created for them. */
const IMPLICIT = new Set(['gemini-4-carbon', 'gemini-4-hydrogen']);

/* GEMINI 4 THINKS UNTIL THE CAP. Measured on one nephron draft (2026-11-14):
 * Hydrogen at its default spent 14,346 of 16,000 output tokens thinking and was
 * cut off mid-page, and at MEDIUM thought 5,098 and finished. Carbon at MEDIUM
 * thought 23,789 over four minutes and was still cut off; at LOW it finished.
 * So a "default" thinking request is capped per model, with room added. */
const HEAVY = { 'gemini-4-carbon': 'LOW', 'gemini-4-hydrogen': 'MEDIUM' };
const HEAVY_ROOM = 12000;

/* The shortest prompt this model will cache, in tokens. Same reasoning as PRICE
 * and the same three states: a number where it is known, `null` where the model
 * has no context caching to have a minimum for, and `undefined` where nobody has
 * measured it, which asserts nothing rather than inventing a floor.
 *
 * 3.7-flash's 1024 is measured, not read off a page: send it less and the API
 * answers `Cached content is too small. total_token_count=422,
 * min_total_token_count=1024`. The others are unlisted because a wrong floor
 * here fails a build for a reason that is not true. */
const CACHE_MINS = {
  'gemini-3.7-flash':      1024,
  'gemini-3.8-flash':      1024,   // 3.7 requests were already served by 3.8 when 1024 was measured
  'gemini-2.5-flash-lite': null,
};

const CACHE_MIN = Object.prototype.hasOwnProperty.call(CACHE_MINS, MODEL)
  ? CACHE_MINS[MODEL] : undefined;

let client = null;

/* Thinking is configured differently either side of the 3.x line: 2.5 models take
 * a token budget (0 turns it off), 3.x models take a named level, and each
 * rejects the other's field. The answer is three sentences about settled
 * biology, so both settings say the same thing: barely think about it. */
function thinkingFor(model) {
  return /^gemini-2\./.test(model) ? { thinkingBudget: 0 }
                                   : { thinkingLevel: 'LOW' };
}

// Gemini's structured-output validator rejects `additionalProperties`, which the
// Anthropic schema needs. Strip it rather than keep two schemas: one catalog,
// one shape, and the checker only has one thing to assert.
function forGemini(node) {
  if (Array.isArray(node)) return node.map(forGemini);
  if (!node || typeof node !== 'object') return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === 'additionalProperties') continue;
    out[k] = forGemini(v);
  }
  return out;
}

/* ---------------------------------------------------------------------------
 *  Context cache
 * ---------------------------------------------------------------------------
 *  The stable half of the prompt is one lesson's target list, its notes and the
 *  chapter catalog: the same two thousand tokens in front of every question
 *  asked on that page, by every student. Held server-side it reads back at a
 *  tenth of an input token, which is most of what a session costs.
 *
 *  Keyed by the prompt text itself, so editing `_targets.js` starts a new entry
 *  rather than serving the old one for another hour. The map is module state,
 *  which on Vercel means per warm instance: a cold start pays one question at
 *  full rate, and that is the whole downside.
 *
 *  Every failure here falls back to sending the prompt inline. A cache is a
 *  discount, and a discount that can break the tutor is not worth having.
 *
 *  A write is billed at the input rate plus an hour of storage, and
 *  `usageMetadata` reports neither, so the entry remembers how many tokens it
 *  wrote and the first `ask` to use it reports them as `usage.written`. Every
 *  later turn on the same entry reports zero. A write that fails counts nothing.
 * ------------------------------------------------------------------------- */
const CACHE_TTL_S = 3600;
const cached = new Map();   // model + prompt text -> { handle: Promise<string|null>, until, written }

/* A cache belongs to one model, so the key carries it: the same reference
 * asked of two models is two entries. */
function cacheFor(system, model) {
  // A model with no explicit caching, so there is no request to make and no
  // 400 to log once an hour for the rest of the deployment's life.
  if (IMPLICIT.has(model) || CACHE_MINS[model] === null) return Promise.resolve(null);

  const key = model + '\n' + system;
  const hit = cached.get(key);
  if (hit && hit.until > Date.now()) return hit.handle;

  const entry = { handle: null, until: Date.now() + (CACHE_TTL_S - 300) * 1000, written: 0 };
  entry.handle = client.caches.create({
    model,
    config: { systemInstruction: system, ttl: `${CACHE_TTL_S}s`, displayName: 'tutor prompt' },
  }).then(c => {
    entry.written = (c.usageMetadata && c.usageMetadata.totalTokenCount) || 0;
    return c.name || null;
  }).catch(err => {
      // A prompt under the model's minimum, or a model that does not cache.
      // Either way the answer will be the same one next question, so the null
      // is remembered for the same hour rather than re-asked every turn.
      console.warn('[ask] no context cache, sending the prompt inline:', err && err.message);
      return null;
    });

  // Retired five minutes early, so a handle is never handed out in the window
  // where the server may already have dropped it.
  cached.set(key, entry);
  return entry.handle;
}

// The tokens the entry for `system` wrote, handed out once.
function takeWritten(system, model) {
  const hit = cached.get(model + '\n' + system);
  if (!hit || !hit.written) return 0;
  const n = hit.written;
  hit.written = 0;
  return n;
}

/* `max` and `thinking` are the two knobs a caller other than the tutor needs:
 * the builder writes a whole page, which is many times the tutor's 2,000
 * tokens, and wants the model's default thinking on a first draft. Absent,
 * both stay what the tutor has always sent. */
async function ask({ system, context, messages, schema, max, thinking, model }) {
  const m = model || MODEL;
  if (!client) {
    const { GoogleGenAI } = require('@google/genai');
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  // Gemini's word for the assistant's turn is "model". The tutor speaks the
  // same transcript to both vendors; only the label changes here.
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  // The per-turn half rides in front of the newest question, not in the system
  // instruction. The student's step and screen readings describe this moment, so
  // this is where they belong anyway; keeping them out of the prefix is what
  // lets the prefix be cached at all. `_tutor.js` guarantees the last turn is
  // the student's.
  if (context) {
    const last = contents[contents.length - 1];
    last.parts = [{ text: `${context}\n\n${last.parts[0].text}` }];
  }

  const heavy = thinking === 'default' && HEAVY[m];
  const config = {
    maxOutputTokens: (max || 2000) + (heavy ? HEAVY_ROOM : 0),
    ...(heavy ? { thinkingConfig: { thinkingLevel: heavy } }
       : thinking === 'default' ? {} : { thinkingConfig: thinkingFor(m) }),
    responseMimeType: 'application/json',
    responseJsonSchema: forGemini(schema),
  };

  const handle = await cacheFor(system, m);
  if (handle) config.cachedContent = handle;   // holds the system instruction
  else        config.systemInstruction = system;

  let res;
  try {
    res = await client.models.generateContent({ model: m, contents, config });
  } catch (err) {
    // A handle that expired between here and the call. Retried once inline,
    // because the alternative is a student seeing an error for a discount that
    // did not apply. Narrow to the codes an expired or unknown cache answers:
    // a 429 or a 503 is the transport's to retry, in `_tutor.js`.
    if (!handle || ![400, 403, 404].includes(err && err.status)) throw err;
    cached.delete(m + '\n' + system);
    delete config.cachedContent;
    config.systemInstruction = system;
    res = await client.models.generateContent({ model: m, contents, config });
  }

  const u = res.usageMetadata || {};

  return {
    json: JSON.parse(res.text),
    // What answered, not what was asked for. An alias resolves to a dated build,
    // and a model that is retired or rerouted resolves to something else again.
    served: res.modelVersion || m,
    model: m,
    usage: {
      input:  (u.promptTokenCount || 0) - (u.cachedContentTokenCount || 0),
      output: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0),
      cached: u.cachedContentTokenCount || 0,
      written: takeWritten(system, m),
    },
  };
}

module.exports = { id: 'gemini', label: 'Gemini', envKey: 'GEMINI_API_KEY',
                   model: MODEL, PRICE, CACHE_MIN, priceOf, implicit: m => IMPLICIT.has(m), ask };
