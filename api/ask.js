/* =============================================================================
 *  api/ask.js — the endpoint
 * =============================================================================
 *  GET  /api/ask  → which providers exist, which are configured, which is default
 *  POST /api/ask  {question, provider?} → {answer, chapters, provider, model, usage, ms}
 *
 *  The Vercel entry point. All of the thinking is in `_tutor.js`, which the local
 *  dev server calls directly, so running the box locally and running it deployed
 *  exercise the same code path.
 * ========================================================================== */
'use strict';

const { handleAsk, config, denied } = require('./_tutor.js');
const { local } = require('./_local.js');
const { cohort } = require('./_keys.js');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  // Only this machine gets the bench: the prompt is readable and rewritable
  // there, and neither is for the public. `_local.js` says why a deployed
  // function is never local, even though its socket is loopback.
  const bench = local(req);

  // Which class this link belongs to, or null. Refused before anything else, so
  // an unkeyed caller never reaches a model. A refused GET is also what keeps
  // the launcher off the page: `chat.js` only offers the tutor when this
  // answers ok, so a visitor without a link sees the lesson with no broken
  // invitation on it, exactly as a static deploy does.
  const who  = await cohort(req);
  const gate = await denied(who);
  if (gate) return res.status(gate.status).json(gate.body);

  if (req.method === 'GET') return res.status(200).json(config(bench, who));

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'GET or POST only' });
  }

  // Vercel parses a JSON body already; a string body means some other caller.
  const payload = typeof req.body === 'string' ? safeParse(req.body) : req.body;

  const { status, body } = await handleAsk(payload, { bench, cohort: who });
  return res.status(status).json(body);
};

function safeParse(s) { try { return JSON.parse(s); } catch { return {}; } }
