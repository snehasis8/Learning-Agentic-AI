#!/usr/bin/env node
// Maintenance helper for the focus system. Two modes:
//   node log-session.mjs --minutes 45 --module 2.3 --note "basic RAG" [--done 2.3]
//   node log-session.mjs review <module> <pass|miss>
// Updates STUDY-LOG.md (and optionally PROGRESS.md), or REVIEW.md. Dependency-free.

import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const path = (name) => new URL(name, root);
const read = (name) => readFileSync(path(name), 'utf8');
const write = (name, text) => writeFileSync(path(name), text);

const DAY = 86400000;
const todayNum = Math.floor(Date.now() / DAY);
const todayIso = new Date(todayNum * DAY).toISOString().slice(0, 10);
const isoFrom = (num) => new Date(num * DAY).toISOString().slice(0, 10);
const dayNum = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || '').trim());
  return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY) : NaN;
};

// ---- streak recompute (mirrors focus.mjs) -------------------------------
function recomputeStats(logText) {
  const dates = [];
  for (const line of logText.split('\n')) {
    const m = /^\|\s*(\d{4}-\d{2}-\d{2})\s*\|/.exec(line);
    if (m) { const d = dayNum(m[1]); if (!Number.isNaN(d)) dates.push(d); }
  }
  const unique = [...new Set(dates)].sort((a, b) => b - a);
  const total = dates.length;
  let streak = 0;
  if (unique.length && (unique[0] === todayNum || unique[0] === todayNum - 1)) {
    streak = 1;
    for (let i = 1; i < unique.length; i++) {
      if (unique[i] === unique[i - 1] - 1) streak++; else break;
    }
  }
  // longest streak across all logged days
  let longest = 0, run = 0;
  for (let i = 0; i < unique.length; i++) {
    if (i === 0 || unique[i] === unique[i - 1] - 1) run++; else run = 1;
    if (run > longest) longest = run;
  }
  return { total, streak, longest };
}

function updateStatsLine(logText) {
  const { total, streak, longest } = recomputeStats(logText);
  const line = `**Current streak:** ${streak} day${streak === 1 ? '' : 's'} · ` +
    `**Longest streak:** ${longest} day${longest === 1 ? '' : 's'} · ` +
    `**Total sessions:** ${total}`;
  return logText.replace(/^\*\*Current streak:\*\*.*$/m, line);
}

// ---- log a session ------------------------------------------------------
function logSession(opts) {
  let log = read('STUDY-LOG.md');
  const existing = (log.match(/^\|\s*\d{4}-\d{2}-\d{2}\s*\|/gm) || []).length;
  const num = existing + 1;
  const row = `| ${todayIso} | ${num} | ${opts.module || '—'} | ${opts.minutes || '—'} | ${opts.note || ''} |`;
  log = log.replace(/(<!-- LOG ROWS BELOW -->\n?)/, `$1${row}\n`);
  log = updateStatsLine(log);
  write('STUDY-LOG.md', log);
  console.log(`✅ Logged session #${num} (${opts.minutes || '?'} min on ${opts.module || 'study'}).`);

  if (opts.done) markDone(opts.done);
}

function markDone(moduleId) {
  let prog = read('PROGRESS.md');
  const esc = moduleId.replace('.', '\\.');
  const re = new RegExp(`^(\\s*-\\s*)\\[ \\](\\s*\\*\\*${esc}\\*\\*.*)$`, 'm');
  if (!re.test(prog)) {
    console.log(`⚠️  Module ${moduleId} not found as an unchecked item in PROGRESS.md.`);
    return;
  }
  // strip any existing marker, check the module, then move marker to next unchecked module
  prog = prog.replace(/\s*👉 YOU ARE HERE/g, '');
  prog = prog.replace(re, (_m, dash, rest) => `${dash}[x]${rest.replace(/\s+$/, '')}`);
  prog = prog.replace(/^(\s*-\s*)\[ \](\s*\*\*\d+\.\d+\*\*.*)$/m,
    (_m, dash, rest) => `${dash}[ ]${rest.replace(/\s+$/, '')} 👉 YOU ARE HERE`);
  write('PROGRESS.md', prog);
  console.log(`✅ Checked off module ${moduleId} and moved the 👉 marker forward.`);
}

// ---- record a review ----------------------------------------------------
const INTERVAL = { 1: 1, 2: 3, 3: 7, 4: 16, 5: 35 };
function review(moduleId, result) {
  if (!['pass', 'miss'].includes(result)) {
    console.log('Usage: node log-session.mjs review <module> <pass|miss>');
    process.exit(1);
  }
  let text = read('REVIEW.md');
  const esc = moduleId.replace('.', '\\.');
  const re = new RegExp(`^(\\|\\s*${esc}\\s*\\|\\s*[^|]+\\|\\s*)(\\d+)(\\s*\\|\\s*)[^|]*(\\|\\s*)\\d{4}-\\d{2}-\\d{2}(\\s*\\|)`, 'm');
  const m = re.exec(text);
  if (!m) { console.log(`⚠️  Module ${moduleId} not found in REVIEW.md.`); return; }
  const oldBox = +m[2];
  const newBox = result === 'pass' ? Math.min(oldBox + 1, 5) : 1;
  const nextDue = isoFrom(todayNum + INTERVAL[newBox]);
  text = text.replace(re, `$1${newBox}$3${todayIso} $4${nextDue}$5`);
  write('REVIEW.md', text);
  console.log(`✅ Review ${moduleId}: ${result} → Box ${newBox}, next due ${nextDue}.`);
}

// ---- arg parsing --------------------------------------------------------
const argv = process.argv.slice(2);
if (argv[0] === 'review') {
  review(argv[1], argv[2]);
} else {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--minutes') opts.minutes = argv[++i];
    else if (a === '--module') opts.module = argv[++i];
    else if (a === '--note') opts.note = argv[++i];
    else if (a === '--done') opts.done = argv[++i];
  }
  logSession(opts);
}
