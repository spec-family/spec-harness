---
status: accepted
date: 2026-09-26
---

# ADR-0008: One MCP server for rounds; spec-guard keeps its own for rules

## Decision

`spec-harness mcp` serves what is about a round: `start_round` (the context
packet), `check_path` (the guard), `request_escalation`, `audit_round`,
`list_rounds`, and the workflow prompts. spec-guard's server keeps serving the
rules (`get_architectural_rules`, `check_architecture`). The harness asks
spec-guard for rules through its command line and does not re-serve them, so
an agent meets each question once. Both servers use spec-core's `jsonrpc`
module and serve both protocol eras (spec-core ADR-0008).

*Amended 2026-10-09.* A tool refuses an argument that is given and names
nothing, as the command line refuses its option (ADR-0005): an empty `brief`
or `base`, an empty place in `paths`, an empty `recommendation`, an option
without a label (ADR-0006). The answer is a tool error that names the
argument and shows what it holds, `"paths[1]" is "", which names no file`,
and nothing is written for the call. Read as left out, an empty `brief` was
answered for the branch's brief and an empty `base` with no ruling
verified, and the agent took either for the answer to what it had asked. A
prompt's argument left empty is still the prompt alone: a client sends an
empty one for a field a person left blank.

*Amended 2026-10-11.* A `brief` that names no brief spec-brief knows, or one
it has archived, is said of the argument, as every other tool error is:
`"brief" names brief 999, and spec-brief knows no such brief`. The tool
error read `the flag names brief 999`, in the command line's words for
`--brief`, and a tool call has no flag (ADR-0004). What a tool refuses is as
it was.

*Amended 2026-10-19.* **The server reads the work tree a path is in, and
the round in the work tree its client names.** *Measured by the parent
session from the source,* and through the launcher of main (3c4112c) and of
this change with a client of this change's own (Windows 11, Node 24.18.1,
Git for Windows 2.55.0; `b25-measure-mcp.mjs`): the server opens one
workspace as it starts, from `--root` or `CLAUDE_PROJECT_DIR`, and every
tool reads the round there. In a project on `main`, whose branch names no
brief, with a worktree inside it on `claude/brief-001-w`:

| The call | main | Now |
| --- | --- | --- |
| `check_path` of the worktree's protected file, by its absolute path | tool error: no brief is named, read as the project's `.claude/worktrees/w/src/db/schema.ts` | `deny`, by the worktree's brief 001 |
| `check_path` of `src/db/schema.ts`, `start_round`, `audit_round`, the client's roots naming the worktree | tool error: no brief is named | the worktree's brief 001; `workTree` `from: "roots"` |
| the same, the client declaring no roots | tool error | the same tool error, the server's own work tree |
| `start_round` with `directory` naming the worktree | tool error: an argument it does not take | brief 001; `from: "argument"` |

Claude Code's MCP page (<https://code.claude.com/docs/en/mcp>, *Option 3:
Add a local stdio server*, read 2026-10-19) has `CLAUDE_PROJECT_DIR` set in
a stdio server's environment to the project root, the directory hooks
receive, "the stable project root" that does not change with the working
directories; and has Claude Code answer the protocol's `roots/list` with the
session's launch directory and every working directory granted with
`--add-dir`, `/add-dir` or `additionalDirectories`, sending
`notifications/roots/list_changed` when that set changes. It does not say
what the launch directory is in a worktree session started from the desktop
app, and no Claude Code was run to see it: the client above is this
change's own, answering as the page has Claude Code answer.

- **`check_path` decides an absolute path by the work tree of this
  repository that holds it**, as the hook decides a write (ADR-0005,
  amended the same day): the one the round is read in, another worktree,
  or the server's own, each by its own branch, briefs and configuration. A
  relative path is read from the top of the work tree the round is read
  in. A path in another repository, or in none, is decided as before.
- **The tools that read a branch read the round in one work tree**:
  `start_round`, `check_path`, `request_escalation` and `audit_round`. It is
  the one an optional `directory` argument names, a directory in the work
  tree, relative to the project or absolute; where none is given, the one
  the client's roots name, where the directories they list are in exactly
  one work tree of this repository; and the server's own otherwise, as
  before. A `directory` that is empty, is no string, or is in no work tree
  of this repository is a tool error, and nothing is read for the call.
  `list_rounds` reads no branch, and lists the server's briefs as before.
- **Roots are asked as the protocol has a server ask them**: a request of
  the server's own, `roots/list`, written where the client declared the
  `roots` capability as it started (in `initialize`, or in a later
  request's `_meta` under the newer protocol), and asked again for each
  call, since the set may change. The answer comes on the input as a
  response, which spec-core's `jsonrpc` module passes over: the server reads
  it first, by the id it asked under. A client that does not answer within
  five seconds, or answers with an error, names no roots. A root whose URI
  is not `file:` names no directory here.
- **Which work tree was read is said**: as `workTree`, its `root` and
  `from` (`argument`, `roots` or `server`), in every answer of the four
  tools, a field added beside the others; and in the answer's text, a line
  at its end, where it is not the server's own.

A call that was answered for the project is answered for the work tree
the client names, and one refused an argument now takes it: a minor
release (spec-core's ADR-0009). What was measured for this and left as it
was:

- **A client that names its roots and works elsewhere.** Where the roots
  name one work tree and a session has moved to another without adding it,
  the round is read in the one the roots name; `directory` names the other.
- **`list_rounds`** lists the server's briefs, which a worktree's branch may
  have added to.

*Amended 2026-10-24.* **`check_path` answers each path as the hook decides
a write of it.** *Claimed* by round 25's agent F: under a brief's problem
`check_path` answers the problem for a path outside every work tree of the
repository, where the hook passes it (ADR-0005, the amendment of 2026-10-19
that has such a write held by no brief). *Measured* through the launcher
of main (4227a6a) and of this change (Windows 11, Node 24.22.1, Git for
Windows 2.55.0; `b26-measure/b2.mjs`), in a project on brief 042's branch,
the brief covering `src/app/**` and protecting `src/db/**`: the hook handed
a write of each path alone, and `check_path` asked of each alone and of
all of them in one call.

| The project, and the path | The hook | `check_path` on main | Now |
| --- | --- | --- | --- |
| a brief found: the protected file, one in the scope, one outside it, the brief, a file outside every work tree | refused; passes; passes, and warns after it; passes; passes | `deny`; `allow`; `warn`; `allow`; `allow` | the same |
| the same, `outOfScope` `ask` or `deny`, the file outside the scope | asked; refused | `ask`; `deny` | the same |
| no brief named, any path | passes | tool error: `no brief is named: ...` | `allow`: `no brief governs <path>: no brief is named: ...`, as `guard` says it |
| the branch names brief 999, which spec-brief does not list, or 042, archived, or `SPEC_BRIEF=404`: a path inside | held, exit 2 | tool error, in the problem's words | `deny`, reason `held`: the problem's words, and `Next: fix the brief or the branch before writing` |
| the same, a file outside every work tree | passes | tool error | `allow`: outside the repository |
| the same, every path in one call | | tool error | each path as above |
| a brief named, spec-brief not installed: a path inside | held: `cannot check this write: spec-brief is not installed here: ...` | tool error: `spec-harness failed: spec-brief is not installed here: ...` | the same |
| the same, a file outside every work tree | passes | tool error | `allow` |
| no brief named, spec-brief not installed | passes | tool error, the same | `allow`: no brief governs it |
| a configuration that does not load | holds every write but one to the file itself | the server does not start, exit 2 | the same |

So the claim holds, and goes further: with no brief named, and with no
brief named and no spec-brief installed, `check_path` failed every call
the hook would pass, since it asked spec-brief before anything else.

- **Each path as the hook decides a write of it alone**, by the work tree
  of the repository that holds it, as before. A path outside every work
  tree of the repository, by the hook's own test (`outsideEvery`,
  `src/fs.ts`), is outside the repository, with no brief asked about
  whatever names one. The rest are decided by the brief the `brief`
  argument, `SPEC_BRIEF` or the branch names, found as the hook finds it:
  spec-brief is not asked where nothing names a brief, and is asked only
  where a path is inside.
- **A path held is refused, and says why**: `deny` with the reason `held`,
  a reason added beside the others (`heldBy`, `src/guard.ts`), in the
  hook's words for what names the brief, said of the argument where the
  argument named it (`"brief" names brief 404, ...`), with the hook's next
  step. A call that names a path inside and one outside answers each,
  where the hook holds a write of both: a call asks of each path, and an
  agent may then write the file outside alone.
- **What failed a call for a path inside fails it still**: a spec-brief
  that is not installed, cannot run or cannot list the briefs is a tool
  error, as the hook's `cannot check this write` is its exit 2; a call of
  paths that are all outside asks spec-brief nothing.
- **Its description says so**: `check_path` answers as the guard hook
  decides a write, a path held among what it refuses.
- **One table holds the two** (`tests/integration/as-the-hook.test.ts`):
  for each of nine states of a project, each of five paths is asked of the
  hook and of `check_path`, and the two answers are held to one, refused,
  asked, passed, held or not checked, in the same words.

A tool error that is now an answer, and an answer of a new reason: a minor
release (spec-core's ADR-0009). What was measured for this and left as it
was:

- **A configuration that does not load.** The server reads the project's
  configuration as it starts, and does not start, where the hook lets a
  write to the file itself through; a server that starts there and answers
  as the hook does is another change than this one.
- **`start_round`, `request_escalation` and `audit_round`** need a brief,
  and answer a tool error where none is named, as before: each acts on a
  round, not on a write.

*Amended 2026-11-08.* **The server starts where the configuration does not
load.** It opened the work tree as it started and ended with exit 2 where
`.spec-harness.json` did not load, so Claude Code listed none of its tools
and said only that it could not connect, which says nothing of the file. It
now starts, lists its tools and prompts as always, and each tool opens the
work tree again as it is called: where the configuration still does not
load, the call is the tool's error, the file's own message and that no tool
answers until it loads; once the file is mended, the next call answers.
Where the work tree opened as the server started, it is kept for every
call, as before. A root that is no work tree still stops the server, as it
stops every command.
