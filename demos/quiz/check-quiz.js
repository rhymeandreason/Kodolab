#!/usr/bin/env node
/* quiz/check-quiz.js — the answer key's one promise: a question reaches a
   student only as the teacher passed it. Writes the hash the way the builder
   does, evaluates the page's array, and checks that a passed question passes,
   that an edited one does not, and that an approval cannot land twice. */
'use strict';
const Quiz = require('./quiz.js');
let fail = 0;
const ok = (c, msg) => { if (!c) { fail++; console.log('FAIL ' + msg); } };

const PAGE = `
const quiz = Quiz.mount(ctx.ui.q('#quiz'), { scene: L, questions: [
  { q: 'Most of a leaf\\'s photosynthesis happens in which layer?',
    choices: ['Upper epidermis', 'Palisade mesophyll'], answer: 1,
    why: 'Columns packed with chloroplasts.' },
  {
    q: "Click the vein that brings water up.", find: 'bundle', // a comment with a { brace
    why: \`Xylem carries water in.\`,
  },
  { q: 'Which gas leaves?', choices: ['O₂', 'CO₂'], answer: 0 },
] });`;
const arrayOf = src => Function('return ' + src.slice(src.indexOf('questions: [') + 11, src.lastIndexOf(']') + 1))();

let src = PAGE;
for (const q of arrayOf(PAGE)) {
  const pair = Quiz.approval(src, q.q, Quiz.hash(q));
  ok(pair && src.split(pair.find).length === 2, `approval finds "${q.q}" exactly once`);
  if (pair) src = src.replace(pair.find, pair.replace);
}
for (const q of arrayOf(src)) ok(q.approved === Quiz.hash(q), `"${q.q}" passes after approval`);

const again = arrayOf(src)[0];
const twice = Quiz.approval(src, again.q, Quiz.hash(again));
ok(twice && (twice.replace.match(/approved/g) || []).length === 1, 'a second approval replaces, never stacks');

const edited = arrayOf(src.replace('answer: 1', 'answer: 0'))[0];
ok(edited.approved !== Quiz.hash(edited), 'changing the key unpasses the question');
const reworded = arrayOf(src.replace('Columns packed', 'Rows packed'))[0];
ok(reworded.approved !== Quiz.hash(reworded), 'changing the why unpasses the question');

ok(Quiz.approval(PAGE + "\nconst again = 'Which gas leaves?';", 'Which gas leaves?', 'x') === null, 'a question text found twice is refused');

console.log(fail ? `check-quiz: ${fail} failed` : 'check-quiz: ok');
process.exit(fail ? 1 : 0);
