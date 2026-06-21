// Shared core for the focus system. Pure-ish data + mutations over the three
// markdown files. Imported by the CLI scripts (focus.mjs, log-session.mjs) and
// the web UI server (../focus-ui/server.mjs). Dependency-free.

import { readFileSync, writeFileSync } from 'node:fs';

// ---- Config -------------------------------------------------------------
export const SESSIONS_PER_WEEK = 5; // your target study pace — re-projects the finish date
export const WEIGHTS = { module: 1.5, mini: 3, capstone: 10 }; // sessions of effort per unit
const INTERVAL = { 1: 1, 2: 3, 3: 7, 4: 16, 5: 35 }; // Leitner days per box

// ---- Paths (relative to repo root, regardless of importer) --------------
const root = new URL('../../', import.meta.url); // this file lives in .claude/hooks/
const path = (name) => new URL(name, root);
const read = (name) => { try { return readFileSync(path(name), 'utf8'); } catch { return ''; } };
const write = (name, text) => writeFileSync(path(name), text);

// ---- Date helpers (work in the LOCAL calendar day, not UTC) -------------
const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');
// Integer day-number for a YYYY-MM-DD string (canonical, calendar-based).
const dayNum = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || '').trim());
  return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY) : NaN;
};
export const isoFrom = (num) => new Date(num * DAY).toISOString().slice(0, 10);
// "Today" is the machine's LOCAL date — so streaks/due-dates match the user's clock.
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const todayNum = () => dayNum(todayIso());

// ---- Parsers ------------------------------------------------------------
export function parseProgress() {
  const text = read('PROGRESS.md');
  const items = [];
  let here = '';
  let phase = '';
  let idx = 0;
  for (const line of text.split('\n')) {
    const ph = /^##\s+(.+?)\s*$/.exec(line);
    if (ph) { phase = ph[1]; continue; }
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
    const id = (label.match(/\d+\.\d+/) || [])[0] || null;
    items.push({ index: idx++, done, label: clean(label), kind, id, phase });
  }
  const modules = items.filter((i) => i.kind === 'module');
  const next = items.find((i) => !i.done);
  let remainingUnits = 0;
  for (const i of items) {
    if (i.done || i.kind === 'other') continue;
    remainingUnits += WEIGHTS[i.kind] || 0;
  }
  return {
    items,
    total: modules.length,
    done: modules.filter((i) => i.done).length,
    here: clean(here),
    next: next ? next.label : null,
    nextId: next ? next.id : null,
    remainingUnits,
  };
}
const clean = (s) => s.replace(/\*\*/g, '').replace(/\s*YOU ARE HERE\s*/i, '').trim();

export function parseLog() {
  const text = read('STUDY-LOG.md');
  const dates = [];
  const rows = [];
  for (const line of text.split('\n')) {
    const m = /^\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(\d+)\s*\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|/.exec(line);
    if (!m) continue;
    const d = dayNum(m[1]);
    if (!Number.isNaN(d)) dates.push(d);
    rows.push({ date: m[1], n: m[2], module: m[3].trim(), minutes: m[4].trim(), note: m[5].trim() });
  }
  const unique = [...new Set(dates)].sort((a, b) => b - a);
  const today = todayNum();
  let streak = 0;
  if (unique.length && (unique[0] === today || unique[0] === today - 1)) {
    streak = 1;
    for (let i = 1; i < unique.length; i++) {
      if (unique[i] === unique[i - 1] - 1) streak++; else break;
    }
  }
  let longest = 0, run = 0;
  for (let i = 0; i < unique.length; i++) {
    if (i === 0 || unique[i] === unique[i - 1] - 1) run++; else run = 1;
    if (run > longest) longest = run;
  }
  const recentPace = dates.filter((d) => d > today - 7).length;
  return { total: dates.length, streak, longest, recentPace, rows: rows.reverse() };
}

export function parseReviews() {
  const text = read('REVIEW.md');
  const today = todayNum();
  const rows = [];
  for (const line of text.split('\n')) {
    const m = /^\|\s*([\w.]+)\s*\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|\s*([^|]*?)\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|/.exec(line);
    if (!m) continue;
    rows.push({ module: m[1], file: m[2].trim(), box: +m[3], last: m[4].trim(), next: m[5], due: dayNum(m[5]) <= today });
  }
  return rows;
}

// ---- Review questions (parsed from the *-qa.md files) -------------------
// Q&A files use blocks separated by `---`, each starting with `**Q: ... **`
// followed by the answer. Returns [{ q, a }] for a given module id.
function parseQA(text) {
  const out = [];
  for (const block of text.split(/^\s*---\s*$/m)) {
    // Question can be bold style `**Q: ... **` or heading style `## Q: ...`.
    let m = /\*\*Q:\s*([\s\S]*?)\*\*/.exec(block);
    if (!m) m = /^#{1,6}\s*Q:\s*(.+)$/m.exec(block);
    if (!m) continue;
    const q = m[1].trim();
    let a = block.slice(m.index + m[0].length).replace(/^\s*\n/, '');
    a = a.replace(/^\s*A:\s*/, '').trim(); // drop a leading "A:" label if present
    if (q) out.push({ q, a });
  }
  return out;
}

export function getQuestions(moduleId) {
  const row = parseReviews().find((r) => r.module === String(moduleId));
  if (!row) return { ok: false, message: `No review card for module ${moduleId}.`, questions: [] };
  const text = read(row.file);
  if (!text) return { ok: false, message: `Could not read ${row.file}.`, questions: [], file: row.file };
  return { ok: true, module: String(moduleId), file: row.file, questions: parseQA(text) };
}

// ---- Aggregate state (for dashboard + UI) -------------------------------
export function getState() {
  const progress = parseProgress();
  const log = parseLog();
  const reviews = parseReviews();
  const weeks = progress.remainingUnits / SESSIONS_PER_WEEK;
  const finish = isoFrom(todayNum() + Math.ceil(weeks * 7));
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  return {
    progress, log, reviews,
    projection: { weeks: +weeks.toFixed(1), finish, sessionsPerWeek: SESSIONS_PER_WEEK },
    pct,
    today: todayIso(),
    reviewsDue: reviews.filter((r) => r.due),
  };
}

// ---- Mutations ----------------------------------------------------------
function updateStatsLine(logText) {
  const { total, streak, longest } = parseLogText(logText);
  const line = `**Current streak:** ${streak} day${streak === 1 ? '' : 's'} · ` +
    `**Longest streak:** ${longest} day${longest === 1 ? '' : 's'} · ` +
    `**Total sessions:** ${total}`;
  return logText.replace(/^\*\*Current streak:\*\*.*$/m, line);
}
// streak math over an arbitrary log string (used right after we mutate it in-memory)
function parseLogText(logText) {
  const dates = [];
  for (const line of logText.split('\n')) {
    const m = /^\|\s*(\d{4}-\d{2}-\d{2})\s*\|/.exec(line);
    if (m) { const d = dayNum(m[1]); if (!Number.isNaN(d)) dates.push(d); }
  }
  const unique = [...new Set(dates)].sort((a, b) => b - a);
  const today = todayNum();
  let streak = 0;
  if (unique.length && (unique[0] === today || unique[0] === today - 1)) {
    streak = 1;
    for (let i = 1; i < unique.length; i++) {
      if (unique[i] === unique[i - 1] - 1) streak++; else break;
    }
  }
  let longest = 0, run = 0;
  for (let i = 0; i < unique.length; i++) {
    if (i === 0 || unique[i] === unique[i - 1] - 1) run++; else run = 1;
    if (run > longest) longest = run;
  }
  return { total: dates.length, streak, longest };
}

export function logSession({ minutes, module, note, done } = {}) {
  let log = read('STUDY-LOG.md');
  const num = (log.match(/^\|\s*\d{4}-\d{2}-\d{2}\s*\|/gm) || []).length + 1;
  const row = `| ${todayIso()} | ${num} | ${module || '—'} | ${minutes || '—'} | ${note || ''} |`;
  log = log.replace(/(<!-- LOG ROWS BELOW -->\n?)/, `$1${row}\n`);
  log = updateStatsLine(log);
  write('STUDY-LOG.md', log);
  let message = `Logged session #${num} (${minutes || '?'} min on ${module || 'study'}).`;
  if (done) message += ' ' + markDone(done).message;
  return { ok: true, message };
}

export function markDone(moduleId) {
  let prog = read('PROGRESS.md');
  const esc = String(moduleId).replace('.', '\\.');
  const re = new RegExp(`^(\\s*-\\s*)\\[ \\](\\s*\\*\\*${esc}\\*\\*.*)$`, 'm');
  if (!re.test(prog)) return { ok: false, message: `Module ${moduleId} not found as an unchecked item.` };
  prog = prog.replace(/\s*👉 YOU ARE HERE/g, '');
  prog = prog.replace(re, (_m, dash, rest) => `${dash}[x]${rest.replace(/\s+$/, '')}`);
  prog = prog.replace(/^(\s*-\s*)\[ \](\s*\*\*\d+\.\d+\*\*.*)$/m,
    (_m, dash, rest) => `${dash}[ ]${rest.replace(/\s+$/, '')} 👉 YOU ARE HERE`);
  write('PROGRESS.md', prog);
  return { ok: true, message: `Checked off module ${moduleId} and moved the 👉 marker.` };
}

// Toggle the Nth checkbox line (used by the UI checklist); repositions the marker.
export function toggleItem(index) {
  const text = read('PROGRESS.md');
  const lines = text.split('\n');
  let seen = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*-\s*)\[([ xX])\](.*)$/.exec(lines[i]);
    if (!m) continue;
    seen++;
    if (seen === index) {
      const nowDone = m[2].toLowerCase() === 'x';
      lines[i] = `${m[1]}[${nowDone ? ' ' : 'x'}]${m[3].replace(/\s*👉 YOU ARE HERE/, '').replace(/\s+$/, '')}`;
      break;
    }
  }
  let out = lines.join('\n').replace(/\s*👉 YOU ARE HERE/g, '');
  out = out.replace(/^(\s*-\s*)\[ \](\s*\*\*\d+\.\d+\*\*.*)$/m,
    (_m, dash, rest) => `${dash}[ ]${rest.replace(/\s+$/, '')} 👉 YOU ARE HERE`);
  write('PROGRESS.md', out);
  return { ok: true, message: `Toggled item #${index}.` };
}

export function recordReview(moduleId, result) {
  if (!['pass', 'miss'].includes(result)) return { ok: false, message: 'result must be pass|miss' };
  let text = read('REVIEW.md');
  const esc = String(moduleId).replace('.', '\\.');
  const re = new RegExp(`^(\\|\\s*${esc}\\s*\\|\\s*[^|]+\\|\\s*)(\\d+)(\\s*\\|\\s*)[^|]*(\\|\\s*)\\d{4}-\\d{2}-\\d{2}(\\s*\\|)`, 'm');
  const m = re.exec(text);
  if (!m) return { ok: false, message: `Module ${moduleId} not found in REVIEW.md.` };
  const newBox = result === 'pass' ? Math.min(+m[2] + 1, 5) : 1;
  const nextDue = isoFrom(todayNum() + INTERVAL[newBox]);
  text = text.replace(re, `$1${newBox}$3${todayIso()} $4${nextDue}$5`);
  write('REVIEW.md', text);
  return { ok: true, message: `Review ${moduleId}: ${result} → Box ${newBox}, next due ${nextDue}.` };
}
