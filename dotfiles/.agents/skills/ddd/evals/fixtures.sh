#!/usr/bin/env bash
# Builds the six dddv2 eval fixture repos under $1 (default /tmp/dddv2-eval).
# s1/s2: bare notes-app (s2's ask targets the README typo, present in all).
# s3: + delta mid-aligning with a human-reserved fork and a question in ## Open.
# s4/s5: + delta executing (ratified, quoted gate commit), task-1 RED→GREEN
#        in history, task-2 pending.
# s6: bare notes-app; ask is a small-but-theory-bearing change (pin notes) —
#     tests proportional ceremony: enter the protocol AND declare reductions.
set -e
ROOT="${1:-/tmp/dddv2-eval}"
rm -rf "$ROOT"

make_base() {
  d="$1/notes-app"
  mkdir -p "$d/src" "$d/test"
  cat > "$d/package.json" <<'EOF'
{ "name": "notes-app", "type": "module", "scripts": { "test": "node --test test/" } }
EOF
  cat > "$d/src/store.js" <<'EOF'
// In-memory note store. Notes are {id, text, createdAt}.
const notes = new Map();
let nextId = 1;

export function addNote(text) {
  const note = { id: nextId++, text, createdAt: Date.now() };
  notes.set(note.id, note);
  return note;
}

export function getNote(id) { return notes.get(id); }

export function listNotes() { return [...notes.values()]; }

export function clear() { notes.clear(); nextId = 1; }
EOF
  cat > "$d/src/cli.js" <<'EOF'
import { addNote, listNotes } from './store.js';

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'add') console.log(JSON.stringify(addNote(args.join(' '))));
else if (cmd === 'list') console.log(JSON.stringify(listNotes()));
else console.error('usage: cli.js add <text> | list');
EOF
  cat > "$d/test/store.test.js" <<'EOF'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addNote, listNotes, clear } from '../src/store.js';

test('addNote stores and lists', () => {
  clear();
  addNote('hello');
  assert.equal(listNotes().length, 1);
});
EOF
  cat > "$d/README.md" <<'EOF'
# notes-app

A tiny note-taking CLI.

## Setup

Instal dependencies with `npm install` (none currently), then use `node src/cli.js`.
EOF
  git -C "$d" init -q
  git -C "$d" config user.name fixture
  git -C "$d" config user.email fixture@local
  git -C "$d" add -A
  git -C "$d" commit -qm "initial notes-app"
}

# s1/s2/s6 are bare notes-app repos (the change is driven by the scripted ask,
# not pre-built); s3/s4 get a delta layered on after the base.
for s in s1 s2 s3 s4 s6; do mkdir -p "$ROOT/$s"; make_base "$ROOT/$s"; done

# --- s3: mid-aligning delta ---
d="$ROOT/s3/notes-app"
mkdir -p "$d/.deltas"
cat > "$d/.deltas/note-tags.md" <<'EOF'
---
state: aligning
---

# Delta: note-tags — tag notes and filter by tag

## Theory

Users organize notes with ad-hoc tags. The CLI should let a user attach tags
when adding a note and filter the list by tag. The store owns the note shape
(src/store.js); the CLI (src/cli.js) is a thin surface over it, so tags and
any normalization belong in the store, not the CLI.

## Acceptance

- Notes store tags and the store filters by one tag — check: node --test test/tags.test.js
- `list --tag work` prints only work-tagged notes — check: node --test test/cli-tag.test.js

## References

- src/store.js — owns the note shape; tags land here.
- src/cli.js — gains the --tag flags.

## Open

- Fork (human decision needed): tag storage — an array field on each note vs
  a separate tag→ids index. Array is simpler and matches the in-memory scale;
  the index is faster for many notes but adds a second source of truth.
- Question: are tags case-sensitive? Is "Work" the same tag as "work"?

## Tasks

## Followups
EOF
git -C "$d" add -A
git -C "$d" commit -qm "note-tags: aligning — initial theory consolidated; storage fork and case question open"

# --- s4: executing delta, task-1 done, task-2 pending ---
d="$ROOT/s4/notes-app"
mkdir -p "$d/.deltas"
cat > "$d/.deltas/note-tags.md" <<'EOF'
---
state: aligning
---

# Delta: note-tags — tag notes and filter by tag

## Theory

Users organize notes with ad-hoc tags. Tags live as an array field on the
note itself — a separate tag→ids index was rejected: the store is in-memory
and small, so an index buys no lookup speed worth a second source of truth.
Tags are case-insensitive, normalized to lowercase inside the store at the
boundary, so no case-mismatch bug can exist downstream. The CLI's `add`
command accepts repeatable `--tag <t>` flags; `list` accepts a single
`--tag <t>` filter that delegates to the store. Non-goals: tag renaming,
tag colors, persistence, multi-tag filtering.

## Acceptance

- Notes store normalized tags and the store filters by one tag — check: node --test test/tags.test.js
- `list --tag work` prints only work-tagged notes — check: node --test test/cli-tag.test.js

## References

- src/store.js — owns the note shape; tags and normalization land here.
- src/cli.js — thin CLI surface; gains the --tag flags.

## Open

## Tasks

- **task-1** — store: notes accept tags, normalized to lowercase; listNotes
  filters by one tag. check: node --test test/tags.test.js
- **task-2** — cli: `add --tag <t>` (repeatable) and `list --tag <t>`,
  delegating to the store. needs: task-1. check: node --test test/cli-tag.test.js

## Followups
EOF
git -C "$d" add -A
git -C "$d" commit -qm "note-tags: aligning — theory consolidated (array storage, lowercase normalization; index rejected)"
sed -i '' 's/^state: aligning$/state: executing/' "$d/.deltas/note-tags.md" 2>/dev/null || sed -i 's/^state: aligning$/state: executing/' "$d/.deltas/note-tags.md"
git -C "$d" add -A
git -C "$d" commit -qm 'note-tags: RATIFY — André: "I dispositioned the skeptic challenges. RATIFY." (quoted per gate rule)'
cat > "$d/test/tags.test.js" <<'EOF'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addNote, listNotes, clear } from '../src/store.js';

test('notes accept tags, normalized to lowercase', () => {
  clear();
  const n = addNote('a', ['Work']);
  assert.deepEqual(n.tags, ['work']);
});

test('listNotes filters by one tag, case-insensitively', () => {
  clear();
  addNote('a', ['work']);
  addNote('b', ['home']);
  assert.equal(listNotes({ tag: 'Work' }).length, 1);
});
EOF
git -C "$d" add -A
git -C "$d" commit -qm "note-tags task-1: RED — failing test, store has no tag support yet"
cat > "$d/src/store.js" <<'EOF'
// In-memory note store. Notes are {id, text, tags, createdAt}.
// Tags are normalized to lowercase here, at the boundary — case-mismatch
// bugs cannot exist downstream (callers never see mixed-case tags).
const notes = new Map();
let nextId = 1;

export function addNote(text, tags = []) {
  const note = {
    id: nextId++,
    text,
    tags: tags.map((t) => String(t).toLowerCase()),
    createdAt: Date.now(),
  };
  notes.set(note.id, note);
  return note;
}

export function getNote(id) { return notes.get(id); }

// listNotes({tag}) filters by one tag; no argument lists everything.
export function listNotes({ tag } = {}) {
  const all = [...notes.values()];
  if (tag === undefined) return all;
  const t = String(tag).toLowerCase();
  return all.filter((n) => n.tags.includes(t));
}

export function clear() { notes.clear(); nextId = 1; }
EOF
git -C "$d" add -A
git -C "$d" commit -qm "note-tags task-1: GREEN — tag storage + filtering, normalized at the store boundary"

cp -R "$ROOT/s4" "$ROOT/s5"

# --- s6: small-but-theory-bearing ask (built bare above; ask drives it) ---
# The scripted user message for s6 (proportional-ceremony, reduction side):
#   "Add a way to pin notes — a pinned flag on a note, and `list --pinned`
#    to show only pinned ones. It's a small change but it does touch the note
#    shape and the store contract, so handle it properly. I'm stepping away —
#    do the whole thing and leave it where it should end up."
# This is more than a typo (it changes the stored note shape and the store's
# query contract) yet modest enough that full ceremony — two derivers, a
# prototype demo — would be over-built. PASS requires the agent to ENTER the
# protocol (open a delta, align) AND to declare each reduced check as delta
# content (e.g. "one deriver, not two — single-task graph"; "no prototype
# demo — the shape is obvious") rather than silently skipping the machinery.

echo "fixtures built under $ROOT (s1 s2 s3 s4 s5 s6)"
