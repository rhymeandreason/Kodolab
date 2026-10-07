#!/usr/bin/env node
/* quiz/check-quiz.js — the builder's switch: turning a question off or on
   edits exactly that question's literal, the page still evaluates, and the
   question reads back as switched. */
'use strict';
const Quiz = require('./quiz.js');
let fail = 0;
const ok = (c, msg) => { if (!c) { fail++; console.log('FAIL ' + msg); } };

const PAGE = `
Quiz.step({ scene: () => L, questions: [
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
const switched = (src, k, on) => {
  const pair = Quiz.activation(src, arrayOf(src)[k].q, on);
  ok(pair && src.split(pair.find).length === 2, `question ${k + 1} found exactly once`);
  return pair ? src.replace(pair.find, () => pair.replace) : src;
};

let src = PAGE;
for (let k = 0; k < 3; k++) src = switched(src, k, false);
ok(arrayOf(src).every(q => q.active === false), 'every question reads back off');
src = switched(src, 1, false);
ok((src.match(/active/g) || []).length === 3, 'switching off twice writes one field');
src = switched(src, 1, true);
const back = arrayOf(src);
ok(back[1].active === undefined && back[0].active === false, 'switching on removes the field from that question only');
ok(Quiz.activation(PAGE + "\nconst again = 'Which gas leaves?';", 'Which gas leaves?', false) === null, 'a question text found twice is refused');

console.log(fail ? `check-quiz: ${fail} failed` : 'check-quiz: ok');
process.exit(fail ? 1 : 0);
