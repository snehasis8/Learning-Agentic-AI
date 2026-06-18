# 🎯 Focus System — how it works

A tiny, self-contained system to keep momentum on this curriculum. Every time you start a
Claude Code session in this repo, a **SessionStart hook** auto-prints a dashboard: your streak,
where you are, the single next step, any reviews due, and a projected finish date. You can also
print it any time with `npm run focus`.

## The files

| File | What it is | Who edits it |
|------|-----------|--------------|
| `PROGRESS.md` | Checklist of every module/exercise across all 5 phases + capstone. Holds the 👉 marker. | You (tick boxes) / the log helper |
| `STUDY-LOG.md` | Your session history + streak stats. | The log helper (or by hand) |
| `REVIEW.md` | Spaced-repetition queue linking to the existing `*-qa.md` files. | The review helper (or by hand) |
| `.claude/hooks/focus.mjs` | Reads the three files above and renders the dashboard. | — |
| `.claude/hooks/log-session.mjs` | One-command logging + review updates. | — |
| `.claude/settings.json` | Wires `focus.mjs` to run on session start. | — |

## Daily flow

1. **Start a session** → the dashboard greets you (or run `npm run focus`).
2. **Study** the module the 👉 marker / "Next up" points to.
3. **Do any due reviews** it lists — open the linked `*-qa.md`, quiz yourself, then record it:
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
