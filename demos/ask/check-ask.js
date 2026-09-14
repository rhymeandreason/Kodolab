#!/usr/bin/env node
/* =============================================================================
 *  check-ask.js — the catalog is a set of claims about files. Check them.
 * =============================================================================
 *  `node demos/ask/check-ask.js`
 *
 *  The failure this exists to catch is silent from the page: a lesson gets
 *  renamed, the catalog still names the old file, and the box keeps confidently
 *  citing a chapter whose link 404s. Nothing about that is visible until a
 *  student clicks it.
 * ========================================================================== */
'use strict';

const fs   = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const { CHAPTERS, IDS } = require(path.join(ROOT, 'api/_catalog.js'));

let fail = 0;
const bad = m => { console.log(`  FAIL  ${m}`); fail++; };
const pending = [];   // assertions that only settle later; awaited before the exit code

console.log(`\nask catalog: ${CHAPTERS.length} chapters\n`);

if (new Set(IDS).size !== IDS.length) bad('duplicate chapter id');

for (const c of CHAPTERS) {
  if (!/^[a-z][a-z0-9-]*$/.test(c.id)) bad(`${c.id}: id must be lowercase kebab`);
  if (!c.chapter) bad(`${c.id}: no chapter name`);
  if (!c.covers || c.covers.length < 30) bad(`${c.id}: covers is too thin to match a student's wording against`);

  if (c.page === null) { console.log(`  ----  ${c.id.padEnd(11)} ${c.chapter}  (no page yet)`); continue; }

  if (c.page.startsWith('/')) bad(`${c.id}: page must be repo-relative, not rooted`);
  if (!fs.existsSync(path.join(ROOT, c.page))) bad(`${c.id}: ${c.page} does not exist`);
  else console.log(`  ok    ${c.id.padEnd(11)} ${c.page}`);
}

// The schema's enum is built from IDS, so a prompt that names a chapter the enum
// does not carry would be unreachable. Cheap to assert, and it fails loudly the
// first time the two lists are edited apart.
const { SCHEMA, SYSTEM } = require(path.join(ROOT, 'api/_tutor.js'));
const enums = SCHEMA.properties.chapters.items.enum;
if (enums.join() !== IDS.join()) bad('the response schema enum and the catalog have drifted apart');
for (const id of IDS) if (!SYSTEM.includes(`- ${id} (`)) bad(`${id} is missing from the system prompt`);

/* Every provider answers the same interface. This is the assertion that keeps
 * "swap the provider" a one-line env change instead of a debugging session:
 * a module that drops `PRICE` prices every question at zero, silently. */
const providers = require(path.join(ROOT, 'api/_providers'));
console.log(`\nproviders: default ${providers.DEFAULT}\n`);

for (const id of providers.names()) {
  const p = require(path.join(ROOT, `api/_providers/${id}.js`));
  for (const f of ['id', 'label', 'envKey', 'model', 'PRICE', 'ask']) {
    if (p[f] === undefined) bad(`${id}: no ${f}`);
  }
  if (p.id !== id) bad(`${id}: module says its id is "${p.id}"`);
  if (typeof p.ask !== 'function') bad(`${id}: ask is not a function`);
  for (const k of ['input', 'output', 'cached']) {
    if (typeof (p.PRICE || {})[k] !== 'number') bad(`${id}: PRICE.${k} is not a number`);
  }
  if (!fail) console.log(`  ok    ${id.padEnd(11)} ${p.model}  (${p.envKey}${process.env[p.envKey] ? ' set' : ' unset'})`);
}

if (!providers.names().includes(providers.DEFAULT)) bad(`AI_PROVIDER "${providers.DEFAULT}" is not a provider`);

/* A target is a claim about a lesson page: this control exists, this step is
 * called that, this link lands where it says. All three go stale invisibly, and
 * a stale one means the tutor points confidently at the wrong place. */
const T = require(path.join(ROOT, 'api/_targets.js'));
const { schemaFor, situation, moment } = require(path.join(ROOT, 'api/_tutor.js'));
/* A prompt under the model's minimum does not cache, and loses the discount
 * silently: same answers, same aiming, several times the bill. So the size is
 * worth printing next to the target list that decides it - trimming the
 * away-lesson lists is exactly what would do it.
 *
 * The floor comes from the provider that will actually serve the question, not
 * from a constant here. It is a per-model fact and it is NOT monotonic: Claude
 * Opus 5 caches from 512 tokens, Sonnet 5 from 1024, Haiku 4.5 only from 4096.
 * Switching to Haiku to save money would turn caching off for every lesson, and
 * a floor hardcoded in this file would have said everything was fine.
 *
 * Tokens are estimated at 5 characters each, DELIBERATELY LOW. The real ratio
 * measured ~4.5, so this under-counts by around 10%: the error lands on the side
 * of warning about a lesson that was actually fine, never on the side of
 * clearing one that was not. For the true count, which needs the network and a
 * key that this checker refuses to require, count the same string with the
 * vendor's own tokenizer endpoint:
 *   SYSTEM + situation(lesson)
 */
const provider  = require(path.join(ROOT, `api/_providers/${providers.DEFAULT}.js`));
const FLOOR     = provider.CACHE_MIN;
const CHARS_PER = 5;
const CLEARANCE = 1.2;   // margin the estimate's own error fits inside

const allQids = new Set();

for (const [lesson, L] of Object.entries(T.LESSONS)) {
  console.log(`\ntargets: ${lesson} (${L.targets.length})\n`);

  if (!fs.existsSync(path.join(ROOT, L.page))) { bad(`${lesson}: ${L.page} does not exist`); continue; }
  if (!IDS.includes(L.chapter)) bad(`${lesson}: chapter "${L.chapter}" is not in the catalog`);

  // Assert against the page the chat is MOUNTED on, not the one links point at.
  // While a prototype is diverging from the lesson it was copied from, those are
  // two different files, and only one of them can make these claims true.
  const target = L.runsOn || L.page;
  if (!fs.existsSync(path.join(ROOT, target))) { bad(`${lesson}: runsOn ${target} does not exist`); continue; }
  if (L.runsOn) console.log(`  ....  claims checked against ${target}`);
  const html = fs.readFileSync(path.join(ROOT, target), 'utf8');

  // `deepLink` says a cross-lesson link may carry ?param=. Believe it only if
  // the page really reads that parameter. Otherwise the link lands on the right
  // lesson at whatever place it happens to open, and nothing about that is
  // visible from either end.
  const reads = new RegExp(`[?&]${L.param}=|get\\(['"\`]${L.param}['"\`]\\)`).test(html);
  if (L.deepLink && !reads) bad(`${lesson}: deepLink is true but the page never reads ?${L.param}=`);
  if (!L.deepLink && reads) bad(`${lesson}: the page reads ?${L.param}= but deepLink is false`);
  console.log(`  ${L.deepLink ? 'ok  ' : '----'}  ?${L.param}=${' '.repeat(Math.max(0, 8 - L.param.length))}`
    + `${L.deepLink ? 'read by the page' : 'not read yet, a link opens the lesson'}`);

  const steps = [];
  for (const t of L.targets) {
    const qid = `${lesson}/${t.id}`;
    if (allQids.has(qid)) bad(`${qid}: duplicate target id`);
    allQids.add(qid);
    if (!/^[a-z][a-z0-9-]*$/.test(t.id)) bad(`${qid}: id must be lowercase kebab`);
    if (!t.what || t.what.length < 30)   bad(`${qid}: "what" is too thin to match a question against`);

    if (t.kind === 'ui') {
      if (!t.el) bad(`${qid}: a ui target needs the element's id`);
      else if (!html.includes(`id="${t.el}"`)) bad(`${qid}: no id="${t.el}" in ${target}`);
      else console.log(`  ok    ${t.id.padEnd(17)} ui     #${t.el}`);
    } else if (t.kind === 'step') {
      if (t.at === undefined) bad(`${qid}: a step target needs "at"`);
      if (!t.title) bad(`${qid}: a step target needs its title`);
      // Titles are retyped here from each lesson's own step table, so assert the
      // copy still matches rather than trusting that it does.
      else if (!html.toLowerCase().includes(t.title.toLowerCase()))
        bad(`${qid}: no "${t.title}" in ${target}`);
      else console.log(`  ok    ${t.id.padEnd(17)} step   ${L.param}=${String(t.at).padEnd(10)} ${t.title}`);
      if (typeof t.at === 'number') steps.push(t.at);
    } else if (t.kind === 'atoms') {
      console.log(`  ----  ${t.id.padEnd(17)} atoms  (resolved by the page)`);
    } else {
      bad(`${qid}: unknown kind "${t.kind}"`);
    }
  }

  // Ascending, or "4 of 5" in the prompt is a lie.
  for (let i = 1; i < steps.length; i++)
    if (steps[i] <= steps[i - 1]) { bad(`${lesson}: step values ${steps.join(',')} are not ascending`); break; }

  // The enum the model picks from must be the list it was shown, and a lesson
  // offers only its steps to the others: a control you cannot reach is not a
  // destination.
  const seen = T.visible(lesson);
  if (schemaFor(lesson).properties.point.enum.join() !== [...seen.map(t => t.qid), 'none'].join())
    bad(`${lesson}: the point enum and the visible target list have drifted apart`);
  if (seen.some(t => !t.home && t.kind !== 'step'))
    bad(`${lesson}: a non-step target from another lesson is offered as a destination`);
  const prompt = situation(lesson);
  for (const t of seen) if (!prompt.includes(`- ${t.qid}:`)) bad(`${t.qid} is missing from the prompt`);

  // The cached half must not move with the student. Nothing about a prefix that
  // quietly stopped matching is visible from the page, or from the answer: it
  // just costs ten times as much. Two different moments, one prompt.
  if (situation(lesson) !== prompt || situation(lesson, 3, { temperature: 'warm' }) !== prompt)
    bad(`${lesson}: situation() varies by turn, so nothing in front of the question is cacheable`);
  if (!moment(lesson, 0, { temperature: 'warm' }).includes('warm'))
    bad(`${lesson}: the screen readings are not reaching moment()`);

  // What it costs to ask a question here, in the only unit that changes it.
  const tok = Math.floor((SYSTEM + prompt).length / CHARS_PER);
  if (FLOOR === null)
    console.log(`  ----  cacheable prompt  ${tok} tok est, ${provider.model} has no context caching`);
  else if (FLOOR === undefined)
    console.log(`  ----  cacheable prompt  ${tok} tok est, no floor known for ${provider.model}`);
  else if (tok < FLOOR)
    bad(`${lesson}: the cacheable prompt is ~${tok} tokens and ${provider.model} caches from `
      + `${FLOOR}: it will not cache, and every question pays full rate for all of it.`);
  else if (tok < FLOOR * CLEARANCE)
    console.log(`  warn  cacheable prompt  ${tok} tok est, floor ${FLOOR}  THIN, `
      + `trimming further drops off the cliff`);
  else
    console.log(`  ok    cacheable prompt  ${tok} tok est, floor ${FLOOR} (${provider.model})`
      + `  +${tok - FLOOR}`);
}

/* ---- the log ----------------------------------------------------------------
 * Only one property matters and it is invisible from the page: a logging
 * failure must never reach the student. Assert it offline, with no database,
 * by handing `logTurn` exactly the shapes a bad turn produces. If any of these
 * rejects, a dropped connection takes an answer down with it. */
{
  const log = require(path.join(ROOT, 'api/_log.js'));
  const sql = fs.readFileSync(path.join(ROOT, 'api/_schema.sql'), 'utf8');

  const junk = [
    {},                                                   // nothing at all
    { threadId: 'not-a-uuid', visitorId: 'nope' },         // ids the client mangled
    { threadId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', visitorId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      turn: 1, question: 'q', out: null, error: 'boom' },  // a failed turn, no database
  ];
  // Awaited at the bottom: a rejection that lands after process.exit proves
  // nothing, which is exactly the bug this assertion is about.
  pending.push(Promise.all(junk.map(a => log.logTurn(a)))
    .catch(() => bad('logTurn rejected: a logging failure would cost a student their answer')));

  // Every column `logTurn` writes has to exist, and the DDL is the only place
  // that says so. A rename here is otherwise a runtime error per question.
  // Matched inside the CREATE TABLE body alone: the `turns` view names most of
  // these too, and matching the whole file lets a renamed column pass.
  const table = /CREATE TABLE IF NOT EXISTS messages \(([\s\S]*?)\n\);/.exec(sql);
  if (!table) bad('_schema.sql has no messages table');
  else for (const col of ['thread_id', 'turn', 'reply_to', 'role', 'text', 'step', 'state',
                          'point', 'chapters', 'provider', 'model', 'usage', 'ms', 'error'])
    if (!new RegExp(`^\\s*${col}\\s`, 'm').test(table[1])) bad(`messages has no ${col} column`);

  // Same for the thread row's columns, in the threads block. `cohort` is the
  // one a rate limit will count against, so a schema without it is a limit that
  // silently counts nothing.
  const threads = /CREATE TABLE IF NOT EXISTS threads \(([\s\S]*?)\n\);/.exec(sql);
  if (!threads) bad('_schema.sql has no threads table');
  else for (const col of ['visitor_id', 'lesson', 'cohort'])
    if (!new RegExp(`^\\s*${col}\\s`, 'm').test(threads[1])) bad(`threads has no ${col} column`);

  // An existing database predates `cohort`, and only the ALTER reaches it. The
  // CREATE alone would leave every deployed copy without the column.
  if (!/ALTER TABLE threads ADD COLUMN IF NOT EXISTS cohort/.test(sql))
    bad('_schema.sql creates cohort but never ALTERs it onto an existing threads table');

  // The viewer and the limit both read the view, not the tables.
  const cview = /CREATE VIEW turns AS([\s\S]*?);/.exec(sql);
  if (cview && !/t\.cohort/.test(cview[1]))
    bad('the turns view does not carry cohort: the log cannot filter by class');

  // The view must pair an answer with its question by id. Pairing on
  // (thread_id, turn) looks right and silently multiplies rows the moment one
  // thread holds two questions with the same number, which is every thread a
  // client using the single-question form opens. Counts double; nothing errors.
  const view = /CREATE VIEW turns AS([\s\S]*?);/.exec(sql);
  if (!view) bad('_schema.sql has no turns view');
  else if (!/a\.reply_to\s*=\s*q\.id/.test(view[1]))
    bad('the turns view does not join on reply_to: an exchange can multiply');
}

/* ---- the rate limit ---------------------------------------------------------
 * Sized against a real class, so the assertion is the sizing: thirty students
 * asking eight questions each is ~240 turns, and a cap under that refuses the
 * students it exists to serve. That is the failure nothing else would catch -
 * a too-tight limit looks exactly like a working one until a class is using it.
 *
 * Offline. No database, which is also the configuration that must not limit. */
{
  const { exceeded, LIMITS } = require(path.join(ROOT, 'api/_limit.js'));

  const CLASS = 30 * 8;   // the class this was sized for
  if (LIMITS.cohortHour < CLASS)
    bad(`cohortHour ${LIMITS.cohortHour} is under a real class's session (${CLASS} turns)`);
  if (LIMITS.cohortDay < LIMITS.cohortHour)
    bad('cohortDay is under cohortHour: the daily cap would fire first and the hourly one never');
  if (LIMITS.visitorHour > LIMITS.cohortHour)
    bad('visitorHour is over cohortHour: one browser could exhaust its whole class');

  // The per-visitor cap must clear a single thread, or a student hits it inside
  // one conversation the server was willing to hold.
  if (LIMITS.visitorHour < 40)
    bad(`visitorHour ${LIMITS.visitorHour} is under MAX_TURNS, so one thread cannot finish`);

  // Ungated is not limited: with no cohort there is nothing to count against
  // and nothing to revoke. Asserted because the opposite - counting every
  // stranger into one shared bucket - looks like caution and is a shared outage.
  pending.push(exceeded({ cohort: null, visitorId: null })
    .then(r => { if (r) bad('an ungated request was rate limited'); })
    .catch(e => bad(`exceeded() threw on an ungated request: ${e.message}`)));

  // No database means no counting, and a turn that is allowed rather than
  // refused. This is a local checkout, and it must not be a dead tutor.
  pending.push(exceeded({ cohort: 'bio101', visitorId: null })
    .then(r => { if (r && !process.env.DATABASE_URL)
                   bad('with no DATABASE_URL the limit refused instead of failing open'); })
    .catch(e => bad(`exceeded() threw with no database: ${e.message}`)));
}

/* ---- the access gate --------------------------------------------------------
 * A gate that has quietly stopped gating looks exactly like one that works: the
 * tutor answers, which is what it does either way. Nothing about a hole here is
 * visible from the page, so it is asserted rather than eyeballed.
 *
 * Offline and with no key of its own: TUTOR_KEYS is set and restored around the
 * checks, so a checkout without one still runs them. The `links` table half
 * needs a database and is not asserted here; with DATABASE_URL in the
 * environment the "no gate" checks are skipped, since a row may exist. ------- */
{
  const keys = require(path.join(ROOT, 'api/_keys.js'));
  const { denied, handleAsk } = require(path.join(ROOT, 'api/_tutor.js'));
  const offline = !require(path.join(ROOT, 'api/_log.js')).enabled();
  const was = process.env.TUTOR_KEYS;

  pending.push((async () => {
    // Unset: nothing is gated. This is what a fresh checkout gets, and breaking
    // it breaks running the tutor locally.
    delete process.env.TUTOR_KEYS;
    if (offline && await keys.enabled()) bad('no links anywhere but the gate reports itself enabled');
    if (offline && await denied(null))   bad('no links anywhere but a request without a key was refused');

    // A typo that yields no usable pair is OFF, not a lockout nobody can explain.
    process.env.TUTOR_KEYS = 'garbage-with-no-colon';
    if (offline && await keys.enabled()) bad('a malformed TUTOR_KEYS reads as an enabled gate');

    process.env.TUTOR_KEYS = 'bio101:s3cret,openday:0ther';
    if (!(await keys.enabled()))     bad('TUTOR_KEYS is set but the gate reports itself off');
    if (await keys.labelFor('s3cret') !== 'bio101') bad('a valid key does not resolve to its cohort');
    if (await keys.labelFor('0ther') !== 'openday') bad('the second key in TUTOR_KEYS does not resolve');

    // The label is a cohort and the secret is not it. Naming the label as the key
    // would make every link guessable from the log.
    if (await keys.labelFor('bio101') !== null) bad('the cohort label is accepted as its own key');
    if (await keys.labelFor('wrong')  !== null) bad('a wrong key resolves to a cohort');
    if (await keys.labelFor('')       !== null) bad('an empty key resolves to a cohort');
    if (await keys.labelFor(null)     !== null) bad('a missing key resolves to a cohort');

    // A prefix of a real key must not pass. This is the shape a timing walk would
    // produce, and the compare hashes both sides so it cannot.
    if (await keys.labelFor('s3cre') !== null)  bad('a prefix of a valid key is accepted');

    // The refusal happens BEFORE a model runs. Asserted through handleAsk with a
    // question that would otherwise be answered: no provider key is needed,
    // because a gated call must never reach one.
    const r = await handleAsk({ question: 'Why does ice float?', lesson: 'water' }, { cohort: null });
    if (r.status !== 401) bad(`a gated ask without a key returned ${r.status}, not 401`);
  })()
    .catch(e => bad(`the gate threw instead of refusing: ${e.message}`))
    .finally(() => {
      if (was === undefined) delete process.env.TUTOR_KEYS;
      else process.env.TUTOR_KEYS = was;
    }));
}

console.log(`\n  ${allQids.size} targets across ${Object.keys(T.LESSONS).length} lessons`);

Promise.all(pending).then(() => {
  console.log(fail ? `\n  ${fail} problem(s)\n` : '\n  all good\n');
  process.exit(fail ? 1 : 0);
});
