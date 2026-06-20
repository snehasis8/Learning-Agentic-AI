# 🎯 Focus System — how it works

A tiny, self-contained system to keep momentum on this curriculum. Every time you start a
Claude Code session in this repo, a **SessionStart hook** auto-prints a dashboard: your streak,
where you are, the single next step, any reviews due, and a projected finish date. You can also
print it any time with `npm run focus`.

There are **two ways to drive it**:
- **Terminal** — `npm run focus` (view) and `npm run focus:log` / `focus:review` (update).
- **Web UI** — `npm run focus:ui` opens a browser dashboard where you can log sessions, mark
  reviews pass/miss, and tick modules off with clicks. It reads and writes the *same* markdown
  files, so the two stay perfectly in sync. (It's a local-only server on `http://localhost:4321`;
  nothing leaves your machine. Stop it with Ctrl-C.)

## The files

| File | What it is | Who edits it |
|------|-----------|--------------|
| `PROGRESS.md` | Checklist of every module/exercise across all 5 phases + capstone. Holds the 👉 marker. | You (tick boxes) / the log helper |
| `STUDY-LOG.md` | Your session history + streak stats. | The log helper (or by hand) |
| `REVIEW.md` | Spaced-repetition queue linking to the existing `*-qa.md` files. | The review helper (or by hand) |
| `.claude/hooks/focus-core.mjs` | Shared brain: parses the files, does the math, writes updates. | — |
| `.claude/hooks/focus.mjs` | Renders the terminal dashboard (also the SessionStart hook). | — |
| `.claude/hooks/log-session.mjs` | One-command logging + review updates from the terminal. | — |
| `.claude/focus-ui/` | The web UI — `server.mjs` (local server) + `index.html` (the page). | — |
| `.claude/settings.json` | Wires `focus.mjs` to run on session start. | — |

## How to use it regularly (the 2-minute ritual)

Pick **one** of these and do it every study day. The web UI is the easiest to stick with.

**Option A — Web UI (recommended for habit-building)**
1. Run `npm run focus:ui` → the dashboard opens in your browser.
2. Read **Next up** at the top; study that module.
3. Click **Pass/Miss** on each review card under "Reviews due".
4. Fill **Minutes / Note**, tick "Mark this module done" if you finished it, hit **＋ Log session**.
5. Leave it open while you work; Ctrl-C in the terminal when done.

**Option B — Terminal**
1. **Start a session** → the dashboard greets you (or run `npm run focus`).
2. **Study** the module the 👉 marker / "Next up" points to.
3. **Do any due reviews** — open the linked `*-qa.md`, quiz yourself, then record it:
   ```bash
   npm run focus:review 1.1 pass   # recalled well  → pushes it further out
   npm run focus:review 1.1 miss   # struggled       → resets to tomorrow
   ```
   (review uses Leitner boxes: +1d, +3d, +7d, +16d, +35d)
4. **Log the session** (and optionally check the module off):
   ```bash
   npm run focus:log -- --minutes 45 --module 2.3 --note "built basic RAG"
   npm run focus:log -- --minutes 45 --module 2.3 --note "done!" --done 2.3
   ```
   `--done 2.3` checks the module in `PROGRESS.md` and advances the 👉 marker automatically.

> Note the `--` after `npm run focus:log`: it passes the flags through to the script.

**Why it keeps you focused:** logging daily grows the 🔥 streak (loss aversion), the projected
finish date makes slipping visible, "Next up" removes "what do I do today?" friction, and spaced
reviews stop earlier modules from fading. Keep the streak alive — even a 15-minute session counts.

## Adding new review cards

When you finish a module, add a row to `REVIEW.md` pointing at its Q&A file, e.g.:
```
| 2.3 | 02-rag-memory/03-basic-rag-qa.md | 1 | — | 2026-06-20 |
```

## Projected finish date

The dashboard sums the **remaining** work in `PROGRESS.md` — module ≈ 1.5 sessions,
mini-project ≈ 3, capstone ≈ 10 — and divides by your weekly pace to project a date. It updates
itself as you check items off. To change the pace, edit `SESSIONS_PER_WEEK` near the top of
`.claude/hooks/focus.mjs` (currently **5**).
