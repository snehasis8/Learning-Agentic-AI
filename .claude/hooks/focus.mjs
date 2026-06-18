#!/usr/bin/env node
// Focus dashboard — prints streak, where you are, next step, due reviews, and a
// projected completion date. Wired as a SessionStart hook (see .claude/settings.json)
// and runnable any time via `npm run focus`. Dependency-free, never throws.

import { readFileSync } from 'node:fs';

// ---- Config -------------------------------------------------------------
const SESSIONS_PER_WEEK = 5; // your target study pace — change to re-project the finish date
const WEIGHTS = { module: 1.5, mini: 3, capstone: 10 }; // sessions of effort per unit

// ---- Paths (resolved relative to this file, so cwd doesn't matter) ------
const root = new URL('../../', import.meta.url);
const read = (name) => {
  try { return readFileSync(new URL(name, root), 'utf8'); } catch { return ''; }
};

// ---- Date helpers -------------------------------------------------------
const DAY = 86400000;
const todayNum = Math.floor(Date.now() / DAY);
const dayNum = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || '').trim());
  if (!m) return NaN;
  return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY);
};
const isoFrom = (num) => new Date(num * DAY).toISOString().slice(0, 10);

// ---- Progress -----------------------------------------------------------
function parseProgress(text) {
  const lines = text.split('\n');
  const items = [];
  let here = '';
  for (const line of lines) {
    const m = /^\s*-\s*\[([ xX])\]\s*(.+?)\s*$/.exec(line);
    if (!m) continue;
    const done = m[1].toLowerCase() === 'x';
    let label = m[2];
    if (label.includes('👉')) here = label.replace(/👉.*$/, '').trim();
    label = label.replace(/👉.*$/, '').trim();
    let kind = 'other';
    if (/capstone/i.test(label)) kind = 'capstone';
    else if (/mini-project/i.test(label)) kind = 'mini';
    else if (/\*\*\d+\.\d+\*\*/.test(label)) kind = 'module';
    items.push({ done, label, kind });
  }
  const modules = items.filter((i) => i.kind === 'module');
  const modulesDone = modules.filter((i) => i.done).length;
  const next = items.find((i) => !i.done);
  let remainingUnits = 0;
  for (const i of items) {
    if (i.done || i.kind === 'other') continue;
    remainingUnits += WEIGHTS[i.kind] || 0;
  }
  const clean = (s) => s.replace(/\*\*/g, '').replace(/\s*YOU ARE HERE\s*/i, '').trim();
  return {
    total: modules.length,
    done: modulesDone,
    here: clean(here),
    next: next ? clean(next.label) : null,
    remainingUnits,
  };
}

// ---- Streak / pace ------------------------------------------------------
function parseLog(text) {
  const dates = [];
  for (const line of text.split('\n')) {
    const m = /^\|\s*(\d{4}-\d{2}-\d{2})\s*\|/.exec(line);
    if (m) { const d = dayNum(m[1]); if (!Number.isNaN(d)) dates.push(d); }
  }
  const unique = [...new Set(dates)].sort((a, b) => b - a);
  const total = dates.length;
  // current streak: consecutive days ending today or yesterday
  let streak = 0;
  if (unique.length && (unique[0] === todayNum || unique[0] === todayNum - 1)) {
    streak = 1;
    for (let i = 1; i < unique.length; i++) {
      if (unique[i] === unique[i - 1] - 1) streak++; else break;
    }
  }
  // pace: sessions in the trailing 7 days (falls back to overall if no recent activity)
  const last7 = dates.filter((d) => d > todayNum - 7).length;
  return { total, streak, recentPace: last7 };
}

// ---- Reviews ------------------------------------------------------------
function parseReviews(text) {
  const due = [];
  for (const line of text.split('\n')) {
    // | Module | path | Box | Last | Next due |
    const m = /^\|\s*([\w.]+)\s*\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|\s*[^|]*\|\s*(\d{4}-\d{2}-\d{2})\s*\|/.exec(line);
    if (!m) continue;
    if (dayNum(m[4]) <= todayNum) due.push({ module: m[1], file: m[2].trim() });
  }
  return due;
}

// ---- Render -------------------------------------------------------------
function bar(done, total, width = 20) {
  if (!total) return '';
  const filled = Math.round((done / total) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function main() {
  const prog = parseProgress(read('PROGRESS.md'));
  const log = parseLog(read('STUDY-LOG.md'));
  const due = parseReviews(read('REVIEW.md'));

  const out = [];
  out.push('');
  out.push('╭───────────────────────────────────────────────╮');
  out.push('│  🎯  AGENTIC AI — FOCUS DASHBOARD              │');
  out.push('╰───────────────────────────────────────────────╯');

  // Streak
  const flame = log.streak > 0 ? '🔥' : '🥶';
  out.push(`${flame} Streak: ${log.streak} day${log.streak === 1 ? '' : 's'}` +
    `   ·   ${log.total} session${log.total === 1 ? '' : 's'} logged` +
    `   ·   ${log.recentPace}/wk recent pace`);

  // Progress
  const pct = prog.total ? Math.round((prog.done / prog.total) * 100) : 0;
  out.push('');
  out.push(`📚 Progress: ${prog.done}/${prog.total} modules (${pct}%)`);
  out.push(`   ${bar(prog.done, prog.total)}`);

  // Where / next
  if (prog.here) out.push(`📍 You are here: ${prog.here}`);
  if (prog.next) out.push(`👉 Next up: ${prog.next}`);

  // Projection
  const weeks = prog.remainingUnits / SESSIONS_PER_WEEK;
  const finish = isoFrom(todayNum + Math.ceil(weeks * 7));
  out.push('');
  out.push(`🏁 Projected finish: ${finish}  (~${weeks.toFixed(1)} weeks at ${SESSIONS_PER_WEEK}/wk)`);

  // Reviews
  out.push('');
  if (due.length) {
    out.push(`🧠 Reviews due today (${due.length}): ${due.map((d) => d.module).join(', ')}`);
    out.push(`   Start with: ${due[0].file}`);
  } else {
    out.push('🧠 Reviews due today: none — nice and current ✅');
  }

  // Footer
  out.push('');
  out.push('Log this session →  npm run focus:log -- --minutes 45 --module ' +
    (prog.next ? (prog.next.match(/\d+\.\d+/)?.[0] || 'X.X') : 'X.X') + ' --note "..."');
  out.push('');

  process.stdout.write(out.join('\n') + '\n');
}

try { main(); } catch (err) {
  // Never break a session start.
  process.stdout.write('\n🎯 Focus dashboard unavailable (' + err.message + ').\n' +
    'Run `npm run focus` to retry, or check PROGRESS.md / STUDY-LOG.md / REVIEW.md.\n');
}
