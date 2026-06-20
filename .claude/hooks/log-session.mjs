#!/usr/bin/env node
// Maintenance helper for the focus system. Two modes:
//   node log-session.mjs --minutes 45 --module 2.3 --note "basic RAG" [--done 2.3]
//   node log-session.mjs review <module> <pass|miss>
// Thin CLI over focus-core.mjs.

import { logSession, recordReview } from './focus-core.mjs';

const argv = process.argv.slice(2);

if (argv[0] === 'review') {
  const r = recordReview(argv[1], argv[2]);
  console.log((r.ok ? '✅ ' : '⚠️  ') + r.message);
  if (!r.ok) process.exit(1);
} else {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--minutes') opts.minutes = argv[++i];
    else if (a === '--module') opts.module = argv[++i];
    else if (a === '--note') opts.note = argv[++i];
    else if (a === '--done') opts.done = argv[++i];
  }
  const r = logSession(opts);
  console.log('✅ ' + r.message);
}
