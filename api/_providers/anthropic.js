/* =============================================================================
 *  _providers/anthropic.js — Claude behind the provider interface
 * =============================================================================
 *  Takes a system prompt, a question and a JSON Schema; returns parsed JSON and
 *  normalised usage. Everything Anthropic-shaped stops here: the prompt cache
 *  breakpoint, the `output_config` schema, the token field names.
 * ========================================================================== */
'use strict';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5';

/* USD per 1M tokens, read 2026-09-14 from https://claude.com/pricing
 * A cache read is a tenth of an input token; a 5-minute cache write is 1.25x.
 * Per model, because ANTHROPIC_MODEL is a knob; an unlisted model prices at
 * zero and says so rather than quoting some other model's rate. */
const PRICES = {
  'claude-opus-5':    { input: 5.00, output: 25.00, cached: 0.50, write: 6.25 },
  'claude-sonnet-5':  { input: 2.00, output: 10.00, cached: 0.20, write: 2.50 },
  'claude-haiku-4-5': { input: 1.00, output:  5.00, cached: 0.10, write: 1.25 },
};

const PRICE = PRICES[MODEL] || { input: 0, output: 0, cached: 0, write: 0, unknown: true };

/* The shortest prompt this model will cache, in tokens. NOT MONOTONIC across
 * generations and not guessable from the model's tier: Opus 5 halved what 4.8
 * asks, and Haiku 4.5 wants eight times what Opus 5 does. Under it a prompt
 * silently does not cache - no error, `cache_creation_input_tokens: 0`.
 *
 * Which is why this table exists rather than one constant: switching to Haiku to
 * save money would turn the cache off, because no lesson prompt is near 4096. */
const CACHE_MINS = {
  'claude-opus-5':     512,
  'claude-sonnet-5':  1024,
  'claude-haiku-4-5': 4096,
};

const CACHE_MIN = Object.prototype.hasOwnProperty.call(CACHE_MINS, MODEL)
  ? CACHE_MINS[MODEL] : undefined;

let client = null;

/* `max` and `thinking` as in gemini.js: the builder's page is many times the
 * tutor's answer, and a first draft gets the model's default effort. */
async function ask({ system, context, messages, schema, max, thinking }) {
  if (!client) {
    const Anthropic = require('@anthropic-ai/sdk');
    client = new Anthropic();               // reads ANTHROPIC_API_KEY
  }

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: max || 2000,
    // The tutor's answer is three sentences. Low effort keeps latency and cost
    // in the range a question box can afford without changing what the model
    // knows; a first draft of a page is the one case that asks for more.
    output_config: { ...(thinking === 'default' ? {} : { effort: 'low' }),
                     format: { type: 'json_schema', schema } },
    // Two blocks with the breakpoint between them. The first is byte-stable for
    // the whole lesson, so it is paid once and read back at a tenth on every
    // later question; the second is this turn's step and screen readings, which
    // differ every time and would move the breakpoint if they shared a block.
    system: [
      { type: 'text', text: system, cache_control: { type: 'ephemeral' } },
      ...(context ? [{ type: 'text', text: context }] : []),
    ],
    messages,
  });

  // output_config.format guarantees the first text block is valid JSON matching
  // the schema, so this parse is not a hopeful one.
  const text = res.content.find(b => b.type === 'text').text;

  return {
    json: JSON.parse(text),
    served: res.model || MODEL,   // what answered, not what was asked for
    usage: {
      input:   res.usage.input_tokens,
      output:  res.usage.output_tokens,
      cached:  res.usage.cache_read_input_tokens || 0,
      written: res.usage.cache_creation_input_tokens || 0,
    },
  };
}

module.exports = { id: 'anthropic', label: 'Claude', envKey: 'ANTHROPIC_API_KEY',
                   model: MODEL, PRICE, CACHE_MIN, ask };
