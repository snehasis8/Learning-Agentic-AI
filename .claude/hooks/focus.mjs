#!/usr/bin/env node
// Focus dashboard — prints streak, where you are, next step, due reviews, and a
// projected completion date. Wired as a SessionStart hook (see .claude/settings.json)
// and runnable any time via `npm run focus`. Logic lives in focus-core.mjs.

import { getState } from './focus-core.mjs';

function bar(done, total, width = 20) {
  if (!total) return '';
  const filled = Math.round((done / total) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function main() {
  const s = getState();
  const { progress: p, log, projection, reviewsDue, pct } = s;
  const out = [];
  out.push('');
  out.push('╭───────────────────────────────────────────────╮');
  out.push('│  🎯  AGENTIC AI — FOCUS DASHBOARD              │');
  out.push('╰───────────────────────────────────────────────╯');

  const flame = log.streak > 0 ? '🔥' : '🥶';
  out.push(`${flame} Streak: ${log.streak} day${log.streak === 1 ? '' : 's'}` +
    `   ·   ${log.total} session${log.total === 1 ? '' : 's'} logged` +
    `   ·   ${log.recentPace}/wk recent pace`);

  out.push('');
  out.push(`📚 Progress: ${p.done}/${p.total} modules (${pct}%)`);
  out.push(`   ${bar(p.done, p.total)}`);
  if (p.here) out.push(`📍 You are here: ${p.here}`);
  if (p.next) out.push(`👉 Next up: ${p.next}`);

  out.push('');
  out.push(`🏁 Projected finish: ${projection.finish}  (~${projection.weeks} weeks at ${projection.sessionsPerWeek}/wk)`);

  out.push('');
  if (reviewsDue.length) {
    out.push(`🧠 Reviews due today (${reviewsDue.length}): ${reviewsDue.map((d) => d.module).join(', ')}`);
    out.push(`   Start with: ${reviewsDue[0].file}`);
  } else {
    out.push('🧠 Reviews due today: none — nice and current ✅');
  }

  out.push('');
  out.push('Dashboard in your browser →  npm run focus:ui');
  out.push('Log this session →  npm run focus:log -- --minutes 45 --module ' +
    (p.nextId || 'X.X') + ' --note "..."');
  out.push('');
  process.stdout.write(out.join('\n') + '\n');
}

try { main(); } catch (err) {
  process.stdout.write('\n🎯 Focus dashboard unavailable (' + err.message + ').\n' +
    'Run `npm run focus` to retry, or check PROGRESS.md / STUDY-LOG.md / REVIEW.md.\n');
}
