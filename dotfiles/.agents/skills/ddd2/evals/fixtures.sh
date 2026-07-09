#!/usr/bin/env bash
# Builds iteration-1 eval dirs: fixture repo + prompts per eval, copied into
# with_skill/repo and without_skill/repo arms.
set -e
WS="$1/iteration-1"
rm -rf "$WS"; mkdir -p "$WS"

make_base() { # $1 = target repo dir
  d="$1"; mkdir -p "$d/src" "$d/test"
  cat > "$d/package.json" <<'EOF'
{ "name": "notes-app", "type": "module", "scripts": { "test": "node --test" } }
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
  git -C "$d" config user.name andre
  git -C "$d" config user.email andre@local
  git -C "$d" add -A
  git -C "$d" commit -qm "initial notes-app"
}

# ---------- eval dirs with prompts ----------
mk_eval() { # $1 name
  mkdir -p "$WS/$1"
}

FRAMING="I'm stepping away — act for real: your final message is the reply I'll read when I return; do not describe hypothetical actions."
BASELINE_PREFIX="For this task, do not use the Skill tool or any installed skills — just work directly, however you normally would."

# --- eval-1: feature ask, shaping discipline ---
E="$WS/eval-1-feature-ask-shaping-discipline"; mk_eval "$(basename $E)"
make_base "$E/fixture"
echo "Add tag support to the notes app: notes can have multiple tags, and \`list\` can filter by tag. $FRAMING" > "$E/prompt.txt"

# --- eval-2: trivial change skips protocol ---
E="$WS/eval-2-trivial-change-skips-protocol"; mk_eval "$(basename $E)"
make_base "$E/fixture"
echo "There's a typo in the README: 'Instal' should be 'Install'. Fix it. $FRAMING" > "$E/prompt.txt"

# --- eval-3: mid-build contradiction ---
E="$WS/eval-3-mid-build-contradiction-surfaced"; mk_eval "$(basename $E)"
make_base "$E/fixture"
d="$E/fixture"
# store gains a structured array field: the territory's convention that the
# delta's comma-string theory contradicts.
cat > "$d/src/store.js" <<'EOF'
// In-memory note store. Notes are {id, text, attachments, createdAt}.
// Structured fields are real arrays — see attachments — serialized with
// JSON.stringify only at the CLI boundary.
const notes = new Map();
let nextId = 1;

export function addNote(text, attachments = []) {
  const note = { id: nextId++, text, attachments: [...attachments], createdAt: Date.now() };
  notes.set(note.id, note);
  return note;
}

export function getNote(id) { return notes.get(id); }

export function listNotes() { return [...notes.values()]; }

export function clear() { notes.clear(); nextId = 1; }
EOF
git -C "$d" add -A; git -C "$d" commit -qm "store: attachments as structured array field"
mkdir -p "$d/.deltas"
cat > "$d/.deltas/tags.md" <<'EOF'
---
state: shaping
---
<!-- ddd2 delta — load the ddd2 skill before working on this file -->
# Delta: tags

## Intent

Notes can carry multiple tags; `list` can filter by one tag. (André)

## Theory

Tags belong to the store — src/store.js owns the note shape; the CLI stays a
thin surface. The store keeps tags as a single comma-joined string field on
the note (`note.tags = "work,home"`) to keep the stored shape flat, splitting
on read for filtering. Rejected: a separate tag→ids index — a second source
of truth with no win at this scale. `add` accepts repeatable `--tag <t>`;
`list` accepts a single `--tag <t>` filter that delegates to the store.

## Assumptions

- Store fields are flat scalars — evidence: guess — breaks: if the store uses structured fields, the comma-string shape fights the codebase convention.
- No tag contains a comma — evidence: guess — breaks: splitting corrupts tags.

## Acceptance

- Store keeps tags and filters by one tag — check: node --test test/tags.test.js
- `list --tag work` prints only work-tagged notes — check: node --test test/cli-tag.test.js

## Unknowns

## Tasks

- t-store: store keeps tags as a comma-joined string field; listNotes({tag}) filters by splitting — check: node --test test/tags.test.js
- t-cli: `add --tag <t>` repeatable and `list --tag <t>`, delegating to the store — check: node --test test/cli-tag.test.js — needs: t-store

## Findings

## Deviations

## Followups
EOF
git -C "$d" add -A; git -C "$d" commit -qm "tags: shaping — theory consolidated (comma-string storage), tasks derived"
sed -i '' 's/^state: shaping$/state: building/' "$d/.deltas/tags.md"
git -C "$d" add -A; git -C "$d" commit -qm 'tags: go — André: "go" (state -> building)'
echo "Resume the delta at .deltas/tags.md — continue building. $FRAMING" > "$E/prompt.txt"

# --- eval-4: react not read on fuzzy fork ---
E="$WS/eval-4-react-not-read-on-fuzzy-fork"; mk_eval "$(basename $E)"
make_base "$E/fixture"
echo "I want a small dashboard page for my notes stats but honestly I don't know what I want it to look like. Something clean? You pick... actually no, show me options. I'm stepping away — leave whatever you make where I can open it; your final message is what I'll read when I return." > "$E/prompt.txt"

# --- eval-5: verify before ship ---
E="$WS/eval-5-verify-before-ship"; mk_eval "$(basename $E)"
make_base "$E/fixture"
d="$E/fixture"
mkdir -p "$d/.deltas"
cat > "$d/.deltas/tags.md" <<'EOF'
---
state: shaping
---
<!-- ddd2 delta — load the ddd2 skill before working on this file -->
# Delta: tags

## Intent

Notes can carry multiple tags; `list` can filter by one tag. (André)

## Theory

Tags belong to the store — src/store.js owns the note shape; the CLI stays a
thin surface. Tags are an array field on the note, normalized to lowercase
inside the store at the boundary so no case-mismatch bug can exist
downstream. Rejected: comma-joined string field (commas in tags corrupt the
split; fights structured-field style), tag→ids index (second source of
truth, no win at this scale). `add` takes repeatable `--tag <t>`; `list`
takes a single `--tag <t>` filter delegating to the store.

## Assumptions

- Single-tag filtering is enough — evidence: Intent — breaks: list API grows a combinator later.
- In-memory scale — evidence: src/store.js Map store, no persistence — breaks: linear scan gets slow past ~10k notes.

## Acceptance

- Store keeps normalized tags and filters by one tag — check: node --test test/tags.test.js
- `list --tag work` prints only work-tagged notes — check: node --test test/cli-tag.test.js

## Unknowns

## Tasks

- t-store: tags on addNote, lowercase-normalized; listNotes({tag}) filters — check: node --test test/tags.test.js
- t-cli: `add --tag <t>` repeatable, `list --tag <t>` single, delegating to the store — check: node --test test/cli-tag.test.js — needs: t-store

## Findings

- shaping poke-holes (failure lens): comma-string storage corrupts on tags containing commas — fix-now: Theory moved to array field. [dispositioned: fix-now, done]

## Deviations

## Followups

- tag rename command? (out of scope — needs disposition with André)
EOF
git -C "$d" add -A; git -C "$d" commit -qm "tags: shaping — theory consolidated (array field, lowercase at boundary)"
sed -i '' 's/^state: shaping$/state: building/' "$d/.deltas/tags.md"
git -C "$d" add -A; git -C "$d" commit -qm 'tags: go — André: "go" (state -> building)'
# t-store: test + impl
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
git -C "$d" add -A; git -C "$d" commit -qm "tags t-store: RED — failing store test"
cat > "$d/src/store.js" <<'EOF'
// In-memory note store. Notes are {id, text, tags, createdAt}.
// Tags are normalized to lowercase here, at the boundary — callers never
// see mixed-case tags, so case-mismatch bugs cannot exist downstream.
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
git -C "$d" add -A; git -C "$d" commit -qm "tags t-store: GREEN — array tags, normalized at store boundary"
# t-cli: test + impl (run() exported so tests drive the CLI in-process)
cat > "$d/test/cli-tag.test.js" <<'EOF'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/cli.js';
import { clear } from '../src/store.js';

test('list --tag work prints only work-tagged notes', () => {
  clear();
  run(['add', '--tag', 'work', 'buy milk']);
  run(['add', '--tag', 'home', 'fix door']);
  const out = JSON.parse(run(['list', '--tag', 'work']));
  assert.equal(out.length, 1);
  assert.equal(out[0].text, 'buy milk');
});
EOF
git -C "$d" add -A; git -C "$d" commit -qm "tags t-cli: RED — failing cli test"
cat > "$d/src/cli.js" <<'EOF'
import { addNote, listNotes } from './store.js';

// run(argv) is exported so tests can drive the CLI in-process — the store is
// in-memory, so a fresh process per command would lose state.
export function run(args) {
  const [cmd, ...rest] = args;
  if (cmd === 'add') {
    const tags = [];
    const words = [];
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '--tag') tags.push(rest[++i]);
      else words.push(rest[i]);
    }
    return JSON.stringify(addNote(words.join(' '), tags));
  }
  if (cmd === 'list') {
    const i = rest.indexOf('--tag');
    const tag = i === -1 ? undefined : rest[i + 1];
    return JSON.stringify(listNotes(tag === undefined ? {} : { tag }));
  }
  return 'usage: cli.js add [--tag t]... <text> | list [--tag t]';
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(run(process.argv.slice(2)));
EOF
git -C "$d" add -A; git -C "$d" commit -qm "tags t-cli: GREEN — --tag flags delegating to store"
# merge deviation reports into the delta, per contract
python3 - "$d/.deltas/tags.md" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
s = s.replace("## Deviations\n\n## Followups", """## Deviations

- t-store — Deviations: none. Decisions: none. Surprises: none. [ok]
- t-cli — Deviations: none. Decisions: exported run(argv) so tests drive the CLI in-process (in-memory store loses state across processes). Surprises: none. [ok]

## Followups""")
open(p, "w").write(s)
PY
git -C "$d" add -A; git -C "$d" commit -qm "tags: deviations merged — t-store, t-cli reports triaged ok"
echo "Resume the delta at .deltas/tags.md — everything's built and passing as far as I know. Get it ready to merge. $FRAMING" > "$E/prompt.txt"

# ---------- arms: copy fixture into with_skill/repo and without_skill/repo ----------
for E in "$WS"/eval-*; do
  sed "1s/^/$BASELINE_PREFIX /" "$E/prompt.txt" > "$E/prompt-baseline.txt"
  for arm in with_skill without_skill; do
    mkdir -p "$E/$arm/outputs"
    cp -R "$E/fixture" "$E/$arm/repo"
  done
done

echo "fixtures built under $WS"
