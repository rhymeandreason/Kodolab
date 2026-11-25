#!/usr/bin/env node
/* =============================================================================
 *  tools/narrate.js — bake lesson narration with Kokoro
 * =============================================================================
 *      node tools/narrate.js water-lab.html                 [--voice af_heart] [--speed 1] [--port 8817]
 *      node tools/narrate.js bake <lesson> <script.txt|->  [--voice af_heart] [--speed 1] [--prune]
 *      node tools/narrate.js sample "<sentence>" [--voices af_heart,am_michael] [--out dir]
 *      node tools/narrate.js voices
 *
 *  <page>.html: a lesson on kit/lesson-shell.js with `narration: '<name>'`.
 *  Opens it in headless Chrome on the dev server, takes `shell.script()`
 *  (every literal sentence of every chapter), and bakes exactly that set,
 *  pruning the rest. Run it again after editing the lesson's text.
 *
 *  bake: splits the script into sentences with kit/listen.js's own
 *  `sentences()`, normalises each with its `speakable()`, and writes one clip
 *  per sentence to media/narration/<lesson>/<key>.m4a. The key is a hash of
 *  the speakable text, so listen.js can find a clip from the sentence it is
 *  about to speak, and a reworded sentence is a new clip, never a stale one.
 *  manifest.json beside the clips maps key → text and records the voice and
 *  speed; changing either re-bakes every clip. --prune deletes clips the
 *  script no longer has.
 *
 *  A sentence with a run-time number ("There are 12 water molecules") cannot
 *  be baked; leave it out of the script and listen.js speaks it live.
 *
 *  Kokoro-82M (Apache-2.0) through kokoro-js, on the CPU. The model downloads
 *  once (~90 MB) into transformers.js's cache. macOS only: AAC is written
 *  by afconvert.
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const DEMOS = path.join(__dirname, '..');
const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const BITRATE = '64000';

function loadListen() {
  const ctx = {};
  vm.runInNewContext(fs.readFileSync(path.join(DEMOS, 'kit/listen.js'), 'utf8'), ctx);
  return ctx.Listen;
}
const { speakable, sentences } = loadListen();
const keyOf = text => crypto.createHash('sha1').update(text).digest('hex').slice(0, 12);

function args(argv) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2);
      opt[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    } else pos.push(argv[i]);
  }
  return { pos, opt };
}

let tts = null;
async function engine() {
  if (tts) return tts;
  const { KokoroTTS } = await import('kokoro-js');
  process.stderr.write('Loading Kokoro…\n');
  tts = await KokoroTTS.from_pretrained(MODEL, { dtype: 'q8', device: 'cpu' });
  return tts;
}

async function toM4a(text, voice, speed, out) {
  const audio = await (await engine()).generate(text, { voice, speed });
  const wav = path.join(os.tmpdir(), `narrate-${process.pid}.wav`);
  await audio.save(wav);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', BITRATE, wav, out]);
  fs.unlinkSync(wav);
  return audio.audio.length / audio.sampling_rate;
}

async function bakeFile(lesson, src, opt) {
  if (!lesson || !src) throw new Error('usage: bake <lesson> <script.txt|->');
  const raw = src === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(src, 'utf8');
  await bake(lesson, raw.split('\n').flatMap(sentences).map(speakable), opt);
}

async function bakePage(page, opt) {
  const { chromium } = require('playwright-core');
  const origin = `http://localhost:${opt.port || 8817}`;
  try { await fetch(origin + '/demos/', { method: 'HEAD' }); }
  catch { throw new Error(`no dev server on ${opt.port || 8817}: node tools/dev-server.js`); }
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  let got;
  try {
    const tab = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await tab.goto(`${origin}/demos/${page}`);
    await tab.waitForFunction(() => window.LessonShell && LessonShell.current, null, { timeout: 60000 });
    got = await tab.evaluate(() => {
      const s = LessonShell.current, name = s.listen && s.listen.clipsName;
      return { name, lines: s.script() };
    });
  } finally { await browser.close(); }
  if (!got.name) throw new Error(`${page}: add narration: '<name>' to its LessonShell.create`);
  await bake(got.name, got.lines, { ...opt, prune: true });
}

async function bake(lesson, list, opt) {
  const voice = opt.voice || 'af_heart', speed = +(opt.speed || 1);
  const lines = [...new Set(list.filter(Boolean))];

  const dir = path.join(DEMOS, 'media/narration', lesson);
  const mfPath = path.join(dir, 'manifest.json');
  const old = fs.existsSync(mfPath) ? JSON.parse(fs.readFileSync(mfPath, 'utf8')) : null;
  const same = old && old.voice === voice && old.speed === speed && old.model === MODEL;
  const clips = {};
  let made = 0, kept = 0;
  for (const text of lines) {
    const key = keyOf(text), file = path.join(dir, key + '.m4a');
    clips[key] = text;
    if (same && old.clips[key] && fs.existsSync(file)) { kept++; continue; }
    const secs = await toM4a(text, voice, speed, file);
    made++;
    process.stderr.write(`  ${key}  ${secs.toFixed(1)}s  ${text.slice(0, 70)}\n`);
  }
  const stale = old ? Object.keys(old.clips).filter(k => !clips[k]) : [];
  if (opt.prune) for (const k of stale) fs.rmSync(path.join(dir, k + '.m4a'), { force: true });
  else Object.assign(clips, Object.fromEntries(stale.map(k => [k, old.clips[k]])));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(mfPath, JSON.stringify({ model: MODEL, voice, speed, clips }, null, 1) + '\n');
  console.log(`${lesson}: ${made} baked, ${kept} unchanged, ${stale.length} stale${opt.prune ? ' removed' : ' kept (--prune to remove)'}`);
}

async function sample(text, opt) {
  if (!text) throw new Error('usage: sample "<sentence>"');
  const voices = String(opt.voices || 'af_heart,af_bella,af_nicole,am_michael,am_fenrir,bf_emma,bm_george').split(',');
  const out = opt.out || path.join(os.tmpdir(), 'narration-samples');
  const spoken = speakable(text);
  for (const v of voices) {
    const file = path.join(out, `${v}.m4a`);
    const secs = await toM4a(spoken, v, +(opt.speed || 1), file);
    console.log(`${file}  ${secs.toFixed(1)}s`);
  }
}

(async () => {
  const [cmd, ...rest] = process.argv.slice(2);
  const { pos, opt } = args(rest);
  if (cmd && cmd.endsWith('.html')) await bakePage(cmd, opt);
  else if (cmd === 'bake') await bakeFile(pos[0], pos[1], opt);
  else if (cmd === 'sample') await sample(pos.join(' '), opt);
  else if (cmd === 'voices') console.log(Object.keys((await engine()).voices).join('\n'));
  else { console.error(fs.readFileSync(__filename, 'utf8').split('\n').slice(3, 6).join('\n')); process.exit(1); }
})().catch(e => { console.error(e.message || e); process.exit(1); });
