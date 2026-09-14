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

module.exports = { pick, names, DEFAULT };
