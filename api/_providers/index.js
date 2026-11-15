/* =============================================================================
 *  _providers/index.js — which model answers the question
 * =============================================================================
 *  `AI_PROVIDER` in the environment picks one. A provider is any module with
 *  `{id, label, envKey, model, PRICE, CACHE_MIN,
 *    ask({system, context, messages, schema})}`
 *  that returns `{json, usage:{input, output, cached, written}}`, so adding a
 *  third is a file and a line in PROVIDERS, and `_tutor.js` never learns its
 *  name. `written` is the tokens this call wrote into the vendor's cache, priced
 *  at `PRICE.write`: a cost line that skipped it undercounted the bill by a
 *  factor of three on a bench that starts a process per run.
 *
 *  `system` and `context` arrive separately because they are priced separately:
 *  `system` is byte-stable for a whole lesson and every vendor sells it back
 *  cheap, `context` is this turn's step and screen readings. A provider that
 *  concatenates them still answers correctly and quietly pays full rate.
 *
 *  `CACHE_MIN` is the shortest prompt this model will cache: a number, `null`
 *  where the model does not cache at all, or `undefined` where nobody has
 *  measured it. It lives here for the same reason PRICE does - it is a fact
 *  about a model, the model is a knob, and it is not guessable from the tier.
 *
 *  `pick` takes `bench` as an ARGUMENT rather than reading an environment flag.
 *  A request may name its provider only on a bench, and whether this is a bench
 *  is the transport's question to answer (`api/_local.js`), not a global for a
 *  module three call-levels down to read. In production it is always false, so
 *  a visitor cannot choose which key to spend.
 * ========================================================================== */
'use strict';

const PROVIDERS = {
  gemini:    () => require('./gemini.js'),
  anthropic: () => require('./anthropic.js'),
};

const DEFAULT = process.env.AI_PROVIDER || 'gemini';

const names = () => Object.keys(PROVIDERS);

/* Returns a provider, or throws a message the box can show a student. The
 * require is lazy per provider: a missing SDK for the one you are not using is
 * not an error. */
function pick(requested, bench) {
  let id = DEFAULT;

  if (requested) {
    if (!bench)                throw new Error('this deployment does not let the request pick a provider');
    if (!PROVIDERS[requested]) throw new Error(`no provider named "${requested}"`);
    id = requested;
  }

  if (!PROVIDERS[id]) throw new Error(`AI_PROVIDER is "${id}", which is not one of: ${names().join(', ')}`);

  const p = PROVIDERS[id]();
  if (!process.env[p.envKey]) throw new Error(`${p.envKey} is not set on the server`);
  return p;
}

/* The models the builder may be asked for by name, in the order a picker lists
 * them. Only a teacher (or a bench) may choose; everyone else gets the
 * provider's default. A model is here because the eval set was run on it, so
 * adding one is a gen-app.js sweep first and a line second. `role` is the
 * picker's one-word reason to choose it. */
const MODELS = [
  { id: 'gemini-3.8-flash',      provider: 'gemini', label: 'Gemini 3.8 Flash',      role: 'everyday' },
  { id: 'gemini-4-hydrogen',     provider: 'gemini', label: 'Gemini 4 Hydrogen',     role: 'stronger' },
  { id: 'gemini-4-carbon',       provider: 'gemini', label: 'Gemini 4 Carbon',       role: 'strongest' },
  { id: 'gemini-3.5-flash-lite', provider: 'gemini', label: 'Gemini 3.5 Flash-Lite', role: 'cheapest' },
];

/* A draft's rough bill on each model: the reference read from cache, a page
 * out, thinking on top. Rounded for a picker, never for the cost line, which
 * prices what the call actually used. */
const DRAFT_TOKENS = { cached: 30000, output: 8000 };

function catalog() {
  return MODELS.map(m => {
    let ready = false, draft = null;
    try {
      const p = PROVIDERS[m.provider]();
      ready = !!process.env[p.envKey];
      const r = p.priceOf ? p.priceOf(m.id) : null;
      /* An implicit cache may not hit, so the reference is priced as input there. */
      const ref = p.implicit && p.implicit(m.id) ? r && r.input : r && r.cached;
      if (r && !r.unknown) draft = (DRAFT_TOKENS.cached * ref + DRAFT_TOKENS.output * r.output) / 1e6;
    } catch { /* SDK missing: listed as not ready */ }
    return { ...m, ready, draft };
  });
}

/* A provider and a model id for a request that named one, or throws a message
 * the box can show. `allowed` is the transport's answer to whether this caller
 * may choose at all. */
function forModel(id, allowed) {
  if (!allowed) throw new Error('only a teacher can choose the model');
  const m = MODELS.find(x => x.id === id);
  if (!m) throw new Error(`no model named "${id}" is offered`);
  const p = PROVIDERS[m.provider]();
  if (!process.env[p.envKey]) throw new Error(`${p.envKey} is not set on the server`);
  return { p, model: m.id };
}

module.exports = { pick, names, DEFAULT, MODELS, catalog, forModel };
