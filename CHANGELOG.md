# Changelog

spec-harness is before 1.0, and its version says what an upgrade can do to a
run: a minor release (0.6.x to 0.7.0) may turn a passing run red or change
what a script reads - a finding on by default that was not, a changed exit
code, a flag, key or field renamed or removed, each deprecated with a warning
for a minor release first - and brings new features, while a patch release
only fixes, reports less or documents, so `^0.7.0` takes only releases that
cannot turn a run red. The family's policy is
[spec-core's ADR-0009](https://github.com/spec-family/spec-core/blob/main/docs/adr/0009-versions-before-1-0.md).

## 0.22.0

The first release as `@spec-family/spec-harness`, from
`spec-family/spec-harness`: the family moved to a GitHub organization and an
npm scope of its own. Siblings are found under `@spec-family` alone, at
their first releases there, and `init --write` moves the lines 0.1.2 to
0.21.0 wrote, so that a project moving over in the order the first entry
gives keeps its guard at each step. What the hook decides of a write is as
in 0.21.0
([ADR-0011](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0011-releases-are-staged-by-ci.md)).

### Changed

- **Published as `@spec-family/spec-harness`, from
  `spec-family/spec-harness`, and every sibling found under
  `@spec-family` alone.** The family moved to a GitHub organization and an
  npm scope of its own on 2026-10-26, and versions go on from 0.21.0 under
  the new name. A sibling is looked for in `node_modules/@spec-family/` and
  nowhere else, and each install hint names `@spec-family/<name>`. The
  minimums are each sibling's first release there, spec-brief 0.12.0,
  spec-graph 0.21.0 and spec-guard 0.30.0, in place of 0.2.0, 0.9.0 and
  0.12.0: the scope holds no older release with code. The hooks, the
  server and git's hook that `init` writes, and the Claude Code plugin's,
  run `node_modules/@spec-family/spec-harness/bin/spec-harness.js`; SARIF
  names `https://github.com/spec-family/spec-harness`; the plugin's
  marketplace is `spec-family/spec-harness`, and its install id stays
  `spec-harness@spec-tools`
  ([ADR-0011](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0011-releases-are-staged-by-ci.md),
  amended 2026-10-26). Upgrading, in this order, so that no write goes
  unguarded: `npm install --save-dev @spec-family/spec-harness
  @spec-family/spec-brief`, with `@spec-family/spec-guard` and
  `@spec-family/spec-graph` where the project has them, beside the
  `@descent-vtt` packages; then `npx --no-install @spec-family/spec-harness
  init --write`, and `npx --no-install @spec-family/spec-harness init
  --git-hook --write` where an earlier `init --git-hook` wrote git's hook;
  then `npm uninstall @descent-vtt/spec-harness @descent-vtt/spec-brief`
  and the other `@descent-vtt` packages; then `npm install`. Both scopes'
  packages name the same commands, so the uninstall takes
  `node_modules/.bin/spec-harness` and each sibling's with it, and until
  that `npm install` `npx --no-install @spec-family/spec-harness` starts
  nothing; the hooks and git's hook, which run the script with `node`,
  guard throughout, and `npm ci` is not affected (measured with npm 11.19.1
  on 2026-10-31, and added here after the release). `$schema` in
  `.spec-brief.json`, which `init` leaves, is changed to
  `./node_modules/@spec-family/spec-brief/schema.json`, since the old path
  names no file once the old package is uninstalled. A CI step or script
  that runs `npx --no-install @descent-vtt/spec-harness doctor`, or any
  other command, names `@spec-family/spec-harness` in its place. A plugin user
  installs `@spec-family/spec-harness` in every project the plugin guards
  first, since the plugin's hooks name it from this release on, then runs
  `claude plugin marketplace remove spec-tools`, which uninstalls the
  plugin with it where no other settings scope declares the marketplace
  (Claude Code's plugin commands reference, *plugin marketplace remove*,
  read 2026-10-29), `claude plugin marketplace add
  spec-family/spec-harness` and `claude plugin install
  spec-harness@spec-tools`, and only then uninstalls the `@descent-vtt`
  packages, which the plugin it had runs, and runs `npm install` after it.
- **`init --write` rewrites the lines 0.1.2 to 0.21.0 wrote with the
  earlier scope's script, and `doctor` says where one stands.** Claude
  Code cannot start a hook whose script is not there, and on most events
  lets the action go ahead without it (its hooks reference, *Block the
  action when a hook fails*, read 2026-10-29; the exception it names is a
  shell-form hook on Windows without Git Bash, and init's are not shell
  form), so a line naming
  `node_modules/@descent-vtt/spec-harness/bin/spec-harness.js` guards
  only while that package is installed. `init --write` rewrites each such
  entry of its own where it stands, under `PreToolUse`, `PostToolUse`,
  `SessionStart` and `Stop`, keeping its other fields, and the server's in
  `.mcp.json`; names the spec-brief plugin by its name now where
  `.spec-brief.json` names it `@descent-vtt/spec-harness/spec-brief-plugin`,
  which spec-brief cannot load once that package is gone, when its `lint`
  and `archive` stop at exit 2; and with `--git-hook` writes its own hook
  over the one 0.10.0 to 0.21.0 wrote, which stops every commit once the
  package is gone. `doctor` says of a line that runs the earlier script
  that it guards while that package is installed, and how to move it, and
  of one whose script is gone that it is off, exit 1, with the same; it
  notes git's hook and the plugin's name the same way. A line, a hook or a
  plugin a person wrote is left, and said
  ([ADR-0012](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0012-one-way-into-claude-code.md),
  amended 2026-10-26). Upgrading: nothing beyond the entry above, whose
  second step this is. `doctor --format json` has `plugin.state`
  `"earlier"` where `.spec-brief.json` names the plugin by its earlier name
  alone, a value it did not have, and `claudeCode.lines[].detail` the note
  where a line guards that had none.

## 0.21.0

A path through a link is decided as it reads and as the system writes it,
and the stricter answer stands; a run of the hook has one budget, 45
seconds, for every process it starts; and the server's `check_path` answers
each path as the hook decides a write of it. `doctor` passes the branch that
archived its brief, a round's last commit, where git says the branch
archived it, so a CI job that runs it passes a round's last pull request;
and it fails for a hook's line whose script is not there and for a brief the
branch names that spec-brief cannot be asked about
([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md),
[ADR-0004](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0004-the-active-brief-is-named-not-guessed.md)).

### Changed

- **A path through a link is decided as it reads and as the system writes
  it, and the stricter answer stands.** On Linux and macOS a `..` after a
  link is written after the link: `deep/../schema.ts`, `deep` a link to
  `lib/x`, reads as `schema.ts` and is written to `lib/schema.ts`, and the
  hook, `guard` and the server's `check_path` decided it as `schema.ts`.
  A link to nothing was decided as the link, where a write makes the file
  it names, and a path outside the repository whose `..` after a link
  leads into it as outside. Each such path is now decided both ways, each
  file by the work tree that holds it, and a refusal says where the link
  leads. On Windows, which reads the `..` first, no answer changes
  ([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md)).
  Upgrading: nothing to change. A write through a link to a file the brief
  protects, which passed, is refused, and `guard` exits 1 for it.
- **A run of the hook has one budget, 45 seconds, for every process it
  starts, and holds the write at it.** Each process the hook asked a
  question of had 20 seconds, and several that answered slowly, none of
  them at that, passed the 60 seconds `init` and the plugin give the
  hook's entry, where Claude Code cancels the hook and lets the write go
  ahead. A process is now given its 20 seconds or what is left of the
  run's 45, whichever is less, and one stopped at the budget says so:
  `cannot check this write: spec-brief did not answer within the 45
  seconds the hook's run is given, and was stopped`, exit 2. `doctor`
  notes an entry of the hook whose `timeout` is below the 45 seconds, and
  `--format json` has the note as each line's `timeout`
  ([ADR-0002](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0002-siblings-through-their-command-lines.md)).
  Upgrading: nothing to change where the hook's entry has the 60 seconds
  `init` writes, or no timeout; an entry below 45 is noted, and fails
  nothing.
- **The server's `check_path` answers each path as the hook decides a
  write of it.** A file outside every work tree of the repository is
  outside the repository whatever names the brief, where a brief that
  spec-brief does not list or has archived failed the call; a path inside
  that such a brief holds is `deny`, with the reason `held` and the
  hook's words; and with no brief named each path is answered as no
  brief's, where the call was a tool error. spec-brief is asked only where
  a brief is named and a path is inside. The report at the end of a turn
  says that every write is held but one to a file outside every work tree
  ([ADR-0008](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0008-one-server-for-rounds.md),
  [ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md)).
  Upgrading: a client that read a tool error from `check_path` for a
  brief's problem or for no brief named reads an answer for each path, and
  `held` is a new `reason` of a decision.
- **`doctor` fails nothing for the branch that archived its brief, a
  round's last commit.** A round archives its brief on its own branch
  before the branch merges, and since 0.20.0 `doctor` exited 1 there, so a
  CI job that runs it failed every round's last pull request. Where git
  says the brief's archived file is in HEAD and not at the merge base of
  the base and HEAD, `doctor` says so in a note and exits 0 for it; where
  the file is at the merge base, a closed round's branch used again, it
  exits 1 as before, and so where git cannot say. `--format json` has the
  answer as `closedRound`. The hook holds every write on such a branch as
  before, and says the round is archived and ends when the branch merges
  ([ADR-0004](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0004-the-active-brief-is-named-not-guessed.md)).
  Upgrading: a CI job that runs `doctor` fetches the base under the name it
  is configured by, with its history (`git fetch origin main:main`, in a
  clone that is not shallow); without it, a base that names no commit or a
  shallow history, a round's last pull request still fails `doctor`. Run
  `doctor` in CI without `--strict`, which fails where the release of
  Claude Code cannot be told.
- **`doctor` fails for a line of Claude Code's hook whose script is not
  there**, which Claude Code cannot start and lets every write past: a
  guard that is off, or, under `"onFailure": "block"` that the Claude
  Code on `PATH` reads, one that holds every write. The script is looked
  for where `${CLAUDE_PROJECT_DIR}` can point, a linked worktree's main
  checkout among them; a relative path, npx's package and a word a shell
  reads are not
  ([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md)).
  Upgrading: a project whose hook's line names an install that is not
  there has `doctor` exit 1 where it exited 0: install
  `@descent-vtt/spec-harness`, or mend the line. `claudeCode.lines` has a
  line for each way an entry names the harness.
- **`doctor` fails where the branch names a brief spec-brief cannot be
  asked about**, not installed, too old, or failing as it lists the
  briefs, since the hook holds every write there, and says why on its
  `brief` line; a hook's line that names a brief where spec-brief cannot
  be run is said as one that holds every write
  ([ADR-0004](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0004-the-active-brief-is-named-not-guessed.md)).
  Upgrading: exit 1 where it was 0; the flag and `SPEC_BRIEF` still fail
  nothing.

### Added

- **`doctor` notes a report at the end of a turn that nothing runs**:
  `"turnReport"` on, and no settings file starting the hook as a turn
  ends. It fails nothing; `--format json` has `claudeCode.turnEnd`
  ([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md)).

### Fixed

- **A `tools` command that cannot be started is said in one way on every
  host**: `cannot start "<command>": name the tool's script, such as
  ["node", ...]`, the words a name no program has was given. On Windows a
  script with no `node` before it, or a `.cmd`, ended a command on
  `unexpected error: Error: spawn EFTYPE` (or `EINVAL`) and a stack trace,
  and on Linux a file that may not be run was `exited -1` and nothing more;
  the hook holds the write as it did
  ([ADR-0002](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0002-siblings-through-their-command-lines.md)).

## 0.20.0

The hook decides each path by the work tree that holds it, a third
worktree's and the MCP server's included, and finds siblings in the main
checkout's install wherever a work tree has none; every process it starts
has a time limit, and it reads only a file where a file is expected, so a
named pipe no longer holds it without end; it says a guard that is off with
exit 0, and `init --block-on-failure` asks Claude Code to hold a write when
the hook cannot start. It gives a session spec-brief's answer again where
nothing that answer was read from has changed, and it can report, at the end
of a turn and where the configuration asks for it, what the work tree holds
that the brief protects or that is outside its scope
([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md),
[ADR-0002](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0002-siblings-through-their-command-lines.md)).

A configuration that does not load lets a write to itself through, so
that a session can mend it; a write outside every work tree of the
repository is held by no brief and no configuration; and `doctor` fails
where the branch names a brief no round can work under
([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md),
[ADR-0004](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0004-the-active-brief-is-named-not-guessed.md)).

`doctor` says a line of Claude Code's hook that asks for the help or the
version as a guard that is off, fails `--strict` where git cannot say
where it runs its hooks, and notes in a linked worktree the release the
hook's line runs; a `.spec-harness.json` that cannot be read is said as
that; and on Windows a drive letter is one in either case
([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md)).

### Added

- **A report at the end of a turn, where `.spec-harness.json` asks for
  one.** With `"turnReport": true`, `hook claude` answers Claude Code's
  `Stop`: with one `git status`, every path the work tree holds changed
  that the brief protects or that is outside its scope, a shell's writes
  among them, in the words a write of it is given, as one `systemMessage`,
  exit 0, and never a field that has Claude go on. `init` writes the entry,
  in the background, where the key is on, and Claude reads the report as the
  next turn begins; the plugin carries none, and with it on `init` says
  what to add
  ([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md),
  [ADR-0012](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0012-one-way-into-claude-code.md)).
  Upgrading: off by default, so nothing changes until the key is turned on
  and `spec-harness init --write` run again. A `Stop` entry aimed at the
  hook exited 1, `the hook input names no event or tool`, and now exits 0;
  a configuration's unknown key is refused with `turnReport` among the keys
  it names.
- **`init --block-on-failure` writes `"onFailure": "block"` on its hook
  entries before and after a write and as a session starts**, and on those
  an earlier run wrote, so that Claude Code 2.1.295 or later holds a write
  where the hook cannot start, as in a worktree with no install, or runs
  past its timeout. It is written only
  where asked for, and the plugin does not carry it: no page says what an
  older release does with the key. `doctor` advises it in a note, failing
  nothing, for a line that guards without it where the Claude Code on
  `PATH` reads the field
  ([ADR-0012](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0012-one-way-into-claude-code.md)).
  The entry at the end of a turn is left without it: it runs in the
  background, where the hooks reference gives the field no effect.
- **`doctor`, run in a linked worktree, notes the release the hook's line
  runs.** The line names its script under `${CLAUDE_PROJECT_DIR}`, which
  in a worktree session of the desktop app is the main checkout. Where the
  main checkout's install of spec-harness and the worktree's are not one
  release, a note names both; it fails nothing.

### Changed

- **The hook gives a session spec-brief's list of the briefs again, where
  nothing it was read from has changed.** On a brief's branch the hook
  started spec-brief before every write, most of what a write waited for on
  Windows. Where spec-brief's `list --format json` names everything its
  answer was read from, its `inputs`, the hook keeps the answer for the
  session under the git common directory, in `spec-harness/answers/`, and
  gives it again to the session's later runs while every file, directory
  and index on the list reads as listed, with no process started; anything
  else starts spec-brief as before. No answer changes
  ([ADR-0002](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0002-siblings-through-their-command-lines.md),
  [ADR-0003](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0003-state-outside-the-work-tree.md)).
  Upgrading: nothing to change. A spec-brief whose `list` names no
  `inputs`, 0.9.0 and every release before it, is started before every
  write as it was.
- **A process the harness asks a question of is stopped after 20 seconds,
  and the hook holds the write there.** git had no limit and spec-brief
  ten minutes, where Claude Code cancels the hook at the 60 seconds its
  entry gives it, and before a write lets the write go ahead: a named pipe
  at `.spec-brief.json` or `.git/config` kept the hook, `doctor` and
  every command from coming back. git's reads and spec-brief's list are
  now stopped at 20 seconds and said, `spec-brief did not answer within
  20 seconds, and was stopped`; before a write that is `cannot check this
  write: ...`, exit 2, which holds it. A round's work, a diff, a probe's
  worktree, a sibling's check, keeps ten minutes
  ([ADR-0002](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0002-siblings-through-their-command-lines.md)).
  Upgrading: where git or spec-brief takes longer than 20 seconds to
  answer, which none measured does, writes are held and commands exit 2
  with the line: find what it waits on.
- **A path is decided by the work tree that holds it.** A path in a work
  tree of the repository that was neither the one the project names nor
  the one the question's `cwd` is in was read from the project's top, as a
  file of `.claude/worktrees/<name>/` under the project's branch or as one
  outside the project, and a write its own brief protects passed with no
  word. That work tree now decides it, by its branch, briefs and
  configuration; a nested repository's file is decided as before
  ([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md)).
  Upgrading: a session that writes into another worktree has the write
  refused where that worktree's brief protects it.
- **Every command finds the siblings in the main work tree's install** where
  a linked worktree has none, as git's hook and `doctor` did: `guard`,
  `context`, `audit`, `probe` and the rest exited 2, `spec-brief is not
  installed here`.
  Upgrading: in such a worktree these commands run, and `guard` and
  `audit` can exit 1 where they exited 2.
- **The server reads the work tree a path is in, and the round in the one
  its client names.** `check_path` read every path as the project's, and
  every tool the project's branch, so a worktree's file read as
  `.claude/worktrees/<name>/...` and its brief went unnamed. `check_path`
  decides an absolute path by the work tree of the repository that holds
  it, and `start_round`, `check_path`, `request_escalation` and
  `audit_round` read the round in the work tree a new `directory`
  argument names, else the one the client's roots name where they name
  exactly one of the repository's, else the project's, and say which as
  `workTree`
  ([ADR-0008](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0008-one-server-for-rounds.md)).
  Upgrading: a client that declares roots naming a worktree has its calls
  answered for that worktree; a script reading the tools' structured
  answers finds `workTree`.
- **The hook says the guard is off with exit 0, where it exited 1.** A
  question it cannot read and a line of its own that turns the guard off
  (one it cannot read, a `--root` that is no directory) were one line on
  stderr and exit 1, which Claude Code counts as a hook that failed: under
  `"onFailure": "block"` that held every write of the session, the one
  that mends the line among them. Each is now the same line to the person,
  as `systemMessage`, and exit 0, and the write goes on as it did, so
  `onFailure` holds only a hook that did not run
  ([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md)).
  Upgrading: a script that read the hook's exit 1 or its stderr reads the
  line as `systemMessage` on stdout, with exit 0.
- **A write to `.spec-harness.json` itself goes on while it does not
  load.** Every write was held, exit 2, the one that mends the file among
  them, so a session could not mend a typo in it. Before a write to that
  file and to nothing else, the hook now decides nothing, exit 0, so the
  person's own permission prompt stands, and says why every other write is
  held, to the person and to Claude. A file of that name elsewhere, a link
  to it, a second name of it and the configuration of another work tree
  are held as before, and so is a configuration that is a directory, a
  named pipe, or a link to a file of the repository. As a session starts
  the hook says the same.
  Upgrading: a brief that protects `.spec-harness.json` does not hold that
  write while the file does not load, since none of it is read; the audit
  and spec-brief's archive still measure the change.
- **`doctor` exits 1 where the branch names a brief spec-brief does not
  know, or has archived.** The hook holds every write on such a branch,
  and `doctor` said so on its `brief` line and exited 0. One the flag or
  `SPEC_BRIEF` names still fails nothing.
  Upgrading: a branch whose name only reads as a brief's, as
  `fix/brief-list-order` names `list` under the default `branches`, fails
  `doctor` as it holds every write: rename the branch, or set `branches` in
  `.spec-harness.json`.
- **A write outside every work tree of the repository is not held by what
  holds the writes inside.** A brief that is archived, or that spec-brief
  does not list, whichever names it, and a configuration that does not
  load held every write, a file outside the repository among them, and
  `guard` refused such a path, exit 2. Such a write passes as one outside
  the repository does, with no word, and spec-brief is not asked about it;
  one inside any work tree of the repository, a linked worktree's among
  them, is decided as before, by the work tree that holds it, and a path
  with a `..` in it is held as before.
  Upgrading: `guard` of a path outside the repository exits 0 under such
  a brief, where it exited 2.
- **A hook line that asks for the help or the version is a guard that is
  off.** `hook claude --help`, `--version`, `-h` and `-v` print the help
  or the version, exit 0, and check no write, which Claude Code takes for a
  hook that succeeded; `doctor` said such a line guards, and said a
  `--brief 404` beside it held every write. It says the line as one under
  which no write is checked, whatever else is on it, and exits 1.
  Upgrading: take the option off the hook's line; `doctor` exits 1 until
  it is.
- **`--help` or `--version` beside a `--root` that is not a directory is
  a line the hook cannot read.** `hook claude --help --root nowhere`
  printed the help, exit 0, where without `--help` the hook says the
  root. It says `the hook's line cannot be read (--help is given beside a
  fault, --root is "nowhere", which is not a directory, ...)` as it says
  every line it cannot read, to the person with exit 0, before a write and
  after one, and holds no write; as a session starts it says the same.
  `doctor` says the line in the same words.
  Upgrading: mend the line; no line a release wrote carries either.
- **`doctor --strict` fails where git cannot say where it runs its
  hooks.** Under a `core.hooksPath` that names a file, `where git runs its
  hooks cannot be told` failed nothing, under `--strict` or not, where a
  release, a hook's line, a plugin or a hook file that cannot be told
  fails `--strict`.
  Upgrading: point `core.hooksPath` at a directory, or leave it unset.

### Fixed

- **A named pipe where the harness reads a file** no longer keeps a
  command from coming back: a document a brief cites, a sibling's
  `package.json`, what the run before a write kept, git's configuration
  and a worktree's `commondir` as the hook reads them, a request waiting
  for a ruling, a probe's report. Only a regular file is read, and what
  else stands there is read as a file that is not there
  ([ADR-0002](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0002-siblings-through-their-command-lines.md)).
- **A `.spec-harness.json` that cannot be read is said as that.** One the
  account may not read, or one another process holds open on Windows, was
  `.spec-harness.json is not valid JSON: EACCES: ...`. It is
  `.spec-harness.json cannot be read: EACCES: ...`, exit 2 as before, and
  a write to the file itself goes on, as to one that does not load.
- **On Windows `--root C:\work` beside `--root c:\work` is one root.**
  Every command refused the two as two directories, exit 2, and the hook
  read such a line as one it cannot read, under which it checked no write;
  Windows names a volume by its letter in either case. The hook now guards
  under that root, and the rest of the path is compared as before.

## 0.19.0

An option that takes one value is given one, and a line that is wrong is
refused with `--help` or `--version` on it, as the family's contract has
it from 2026-10-18 (spec-core's ADR-0005, and
[ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md)
here).

`doctor` reads a hyphen in a matcher as the Claude Code on `PATH` reads
it, and no command ends on a stack or fails to come back for what stands
where a repository or a settings file is read
([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md)).

The hook decides a write in the work tree Claude works in, where a write a
worktree's brief protects went through unchecked in a worktree session, and
names the brief of a branch beside a tag of its name; it answers after a
write from what it decided before it, and says as a session starts what
would hold every write of it
([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md),
[ADR-0002](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0002-siblings-through-their-command-lines.md)).

### Changed

- **Two values for an option that takes one are refused.** The parser kept
  the last and passed over the earlier with no word: `doctor --root nowhere
  --root .` ran in `.`, `--brief 404 --brief 001` was brief 001, and
  `probe --at sideways --at head` ran at the head. Every command but
  Claude Code's hook now exits 2 with one line that names both, as
  `--root is given twice, as "nowhere" and as ".", and one of the two would
  go unread; give it one`. The two are compared as the option reads them,
  so one directory spelt two ways, or `--brief 12` beside `--brief 012`,
  is the option once. `--path` and `--option` are lists, as before.
  Upgrading: give each such option once; a script that builds a line by
  adding a second `--root` or `--format` to override the first exits 2.
- **Claude Code's hook says two values for one option on its own line.**
  `hook claude --root nowhere --root .` guarded in `.`, and `hook claude
  --brief 001 --brief 404` held every write for 404. It is a line the hook
  cannot read, said in one line on stderr with exit 1, before a write and
  after one, and holds no write: the guard is off until the line is
  mended. `doctor` says the line in the same words and exits 1. No line a
  release wrote gives an option two values.
  Upgrading: a hook's line with an option given twice, which only a person
  writes, is said and checks no write; give the option once.
- **A wrong line is refused beside `--help` or `--version`, and the two
  beside each other.** `doctor --help --root a --root b`, `doctor --help
  --note x`, `doctor --help extra`, `doctor --help --root nowhere` and
  `bogus --help` printed the help, exit 0, and `--help --version` printed
  the version. Each is now exit 2 and the line it is refused with without
  either; `--help` beside `--version`, in either order, is
  `--help is given beside --version, and one of the two answers would go
  unread; give one of them`. On `hook claude`'s line it is a line the
  hook cannot read, exit 1. A line that is right answers as before, `guard
  --help` among them.
  Upgrading: ask for one of the two, on a line that is right.
- **A matcher of names with a hyphen in one is read as the release on
  `PATH` reads it.** By Claude Code's changelog such a matcher matched as a
  substring before 2.1.195, and the changelog does not say how the rest of
  it was read. Under an older release, or one that cannot be told, a line
  under `Edit|Write|my-tool` is *cannot tell* where it said the line
  guards a write by `Edit` and `Write`, and `init` writes no hook beside
  it.
  Upgrading: `doctor --strict` fails such a line under Claude Code 2.1.139
  to 2.1.194 or with no `claude` on `PATH`: take the hyphenated name out of
  the matcher, or update Claude Code.
- **A hook file the account may not read is said, where `doctor` and `init`
  ended on EACCES and a stack.** One git may not execute is skipped by git,
  and is said and fails nothing; one it may is *cannot tell*, since git runs
  it and a script it cannot read stops every commit. `--format json` has
  the `gitHook.state` `unreadable`.
  Upgrading: `doctor` exits 0, or 1 under `--strict`, and `init` 0, where
  each exited 2: make the file readable.
- **A write in a worktree is decided by the worktree's brief.** In a
  worktree session started from the desktop app, and after Claude enters a
  worktree, Claude Code names the main checkout as the project and hands the
  hook the worktree as the question's `cwd`; the hook read the main
  checkout's branch, which named no brief, and a write the worktree's brief
  protects passed with no word. Where `cwd` is in another work tree of the
  same repository, that work tree's branch, briefs and configuration now
  decide the paths it holds, with its siblings looked for in its own install
  and then the project's; any other path, and a `cwd` in another repository
  or in none, is decided as before
  ([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md)).
  Upgrading: in a worktree session a write the worktree's brief protects is refused, and one outside its scope warned of by that brief; nothing on the hook's line changes.
- **A branch beside a tag of its name names its brief.** The branch was read
  by git's short name, `heads/<name>` where a tag or a ref `refs/<name>` has
  the name, which no template reads: the hook passed a protected write,
  git's hook a protected commit, and `doctor` said `(none named)`. It is
  read as HEAD names it; a base `init` writes for such a branch is still the
  name git reads as the branch, `heads/main` beside a tag `main`.
  Upgrading: on such a branch the guard refuses what its brief protects.
- **git's hook in a linked worktree with no install runs the main work
  tree's.** The hook `init` writes refused the commit there; it now reads
  the script from the repository's main work tree after the worktree's own,
  and `hook git` and `doctor` find the siblings there too, `doctor` saying
  whose install each is (`elsewhere` in `--format json`).
  Upgrading: `init` writes the hook once, so one an earlier release wrote still stops such a commit: take it away and run `spec-harness init --git-hook --write`.
- **The hook answers after a write from what it decided before it.** Claude
  Code starts the hook before a write and after it, and the run after
  decided the write again, at what the run before costs: git, and spec-brief
  on a brief's branch. The run before now keeps what the run after would say
  under the git common directory, named by the question's `session_id` and
  `tool_use_id`, and the run after answers from it with no process started;
  one that finds nothing kept for its call, or another call's, decides as
  before. Under `outOfScope: "ask"` or `"deny"`, where nothing was kept, it
  says nothing with no process started
  ([ADR-0002](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0002-siblings-through-their-command-lines.md)).
  Upgrading: nothing to change. What another process changes between the two runs of one write, the configuration or what spec-brief reads, is read at the next write rather than after this one.
- **The hook says, as a session starts, what would hold every write of it.**
  A SessionStart entry aimed at `hook claude` exited 1, `the hook input
  names no event or tool`. It now reads the question, however the session
  starts, and says in one line, to the person and to Claude, a configuration
  that does not load, a brief named that spec-brief does not list,
  spec-brief missing or too old where a brief is named, or a hook's line it
  cannot read; nothing where all is well, and exit 0 whatever it finds.
  `init` writes the entry beside its two, the plugin's `hooks/hooks.json`
  carries it, and `doctor` notes a settings file that guards writes and has
  none
  ([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md),
  [ADR-0012](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0012-one-way-into-claude-code.md)).
  Upgrading: `init` writes its lines once, so run `spec-harness init
  --write` again to add the entry to a `.claude/settings.json` an earlier
  release wrote; a plugin brings it with this release. A script reading
  `doctor --format json` finds `claudeCode.sessionStart`.

### Fixed

- **A named pipe where a settings file, `.mcp.json` or `.spec-harness.json`
  is read** no longer keeps `doctor`, `init` or every command from coming
  back: the first two are read as files that cannot be read as JSON, and
  `.spec-harness.json` is `neither a file nor a directory, not a
  configuration file`, exit 2, as a directory there is.
- **`escalate` and `rule` say a path under git's directory, where the
  harness keeps its state, that is no directory**, exit 2, in a line, where
  they ended on Node's ENOTDIR and a stack.
- **A `core.hooksPath` that names a file is said in git's own words**, where
  `doctor` and `init` gave the reason for a git older than 2.31.
- **`doctor`'s first line advises an array that unloads the project's
  settings** before `init --write`, which writes no hook while it stands
  and only advised the array in turn. `--format json` gains
  `claudeCode.unloaded`.

### Documentation

- **Worktrees, the branches an app makes, and sessions that write through a
  shell.** Two sections of the README, under *A round*. One says which
  branch names the default templates read (`claude/brief-042-rotate-tokens`
  is brief 042; `*` does not cross `/`; `claude --worktree <name>` makes
  `worktree-<name>`, which needs a template of its own), and how a worktree
  is checked: by its own branch and briefs, with the project's install where
  it has none, at the commit as before the write; and that where a session's
  project is a worktree with no install, the hook cannot start and the write
  goes ahead. The other has, layer by layer, what the guard, the check as a
  session starts, git's pre-commit hook, the audit and spec-brief's archive
  each catch and let through, each run, and what every layer lets through:
  an edit of the brief, a shell's write until the commit, `git commit
  --no-verify`, and a Claude Code mod that approves a call a hook blocked.
  It says why a shell `PostToolUse` hook and `"protected": "ask"` were not
  built (ADR-0005, ADR-0006).
  Upgrading: nothing to change; it describes this release.

## 0.18.0

`doctor` and `init` say more of what looks like a guard and checks
nothing: a matcher the Claude Code on this machine reads otherwise, and a
root on the hook's line that is in another work tree. And a directory where
git looks for its hook, or a probe for its report, ends in a sentence where
it ended on a stack
([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md)).
The hook loads only what it runs and opens its work tree in one start of
git, so it answers a write sooner: on a Windows workstation 1.0 seconds
where it took 1.4 with no brief named, and 1.9 where it took 3.6 before a
write to a protected file. Nothing any command prints changes
([ADR-0002](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0002-siblings-through-their-command-lines.md)).

### Changed

- **A matcher that lists names with a comma is read as the Claude Code on
  `PATH` reads it.** A comma separates names from Claude Code 2.1.191 on;
  before it, by Claude Code's page on debugging a configuration, the matcher
  matched no tool, and `doctor` said a line under `Edit, Write` guards
  where Claude Code never started it. Under an older release the line is
  now said as no guard, with the release and what the matcher is from
  2.1.191 on, and `init --write` writes its own hooks beside it; where the
  release cannot be told, or the matcher holds a `|` as well, it is
  *cannot tell*.
  Upgrading: under a Claude Code older than 2.1.191 `doctor` reports no
  guard for such a line, exits 0 where it exited 1 for the plugin beside it,
  and `--strict` fails a matcher with a comma and a `|`. Write the matcher
  with `|` alone, as `Edit|Write`, or update Claude Code.
- **`doctor` fails where an array for a matcher keeps Claude Code from
  loading a settings file's hooks.** By the same page, a `matcher` that is
  an array is an invalid setting that starts no hook, and under
  `PreToolUse` or `PermissionRequest` none of that file's other hooks
  load either. Every line of the hook in such a file is said as one Claude
  Code does not start, a guard that is off where it stood to be started for
  a write, and `init` writes no hook into the file (`advise`).
  Upgrading: `doctor` exits 1 for such a file, where it exited 0, or 1
  under `--strict` alone: write the matcher as one string, its names
  between `|`.
- **`doctor` fails for a hook's line whose root is in a work tree that does
  not hold the project.** The hook opens the work tree its root is in and
  passes a write to any file outside it with no word, so under a root in a
  repository beside the project, or in one inside it, a submodule or a
  linked worktree among them, no write to the project is checked: the line
  is said as a guard that is off, and `init` advises. Under a root in a
  work tree that holds the project, `doctor` says whose briefs a write
  here is checked by, and fails nothing.
  Upgrading: `doctor` exits 1 for such a line, where it exited 0: give the
  line a directory in the project's work tree, or take `--root` off it.
- **`doctor` and `init` say a directory at the path of git's pre-commit
  hook, where they ended on a stack.** git tries to run whatever it may
  execute there, cannot run a directory, and stops every commit, so
  `doctor` says the path and what git does with it and exits 1; `init`
  advises and writes nothing over it. Where git may not execute it and
  skips it, that is said and fails nothing. `--format json` has the two as
  the `gitHook.state` `stops` and `ignored`.
  Upgrading: `doctor` exits 1 there, and `init` 0, where each exited 2
  with `unexpected error: Error: EISDIR`. Take the directory away, then run
  `spec-harness init --git-hook --write`.

### Fixed

- **`probe` says a report that is a directory, where it ended on a
  stack.** Where a probe's `junit` names a directory the repository holds,
  the run is `no-report`, `cannot be read: it is a directory, not a
  report`, and the probe invalid, exit 1, where it was `unexpected error`
  and exit 2.
- **A command loads what it runs, and the hook no other command.** `hook
  claude` is started before and after every write an agent makes, and the
  command line loaded every command before it read which one was typed: 52
  modules, 42 ms on Linux, close to half of a hook that names no brief. A
  module that only some commands run is now loaded where one of them is
  the command, and such a hook loads 26. Measured on Linux with the build
  before this change and this one taking turns, at the median of ten runs,
  the hook took 64 ms where it took 91, and 155 where it took 176 on a
  brief's branch; `doctor` 81 where it took 99, and `--version` 40 where it
  took 71. Nothing any command prints changes, nor an exit code, but in a
  build with a file of `dist/` missing: a command that does not run that
  module now answers, where every command ended on `build output is
  missing`, and one that runs it ends on that line still, exit 2. In the
  programmatic API, `checkPaths` takes as its reader a reader or a function
  that makes one
  ([ADR-0002](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0002-siblings-through-their-command-lines.md)).
- **A work tree is opened in two starts of git, asked at once, where it
  took three in two waves.** Git is asked for the top of the work tree and
  its common directory in one start, and where the command runs at the top
  of its work tree, for the branch beside them. A process is what a command
  takes on Windows. Measured on a workstation at rest, where starting node
  to do nothing took 0.3 seconds, with the two builds taking turns, at the
  median of ten runs: a hook that names no brief took 1.0 second where it
  took 1.4, with this and the change above, and with every processor held
  by other work, 13.7 seconds where it took 22.7. On Linux, where git
  answers in milliseconds, it is three of the 26 milliseconds the hook is
  quicker by. Below the top of a work tree, and in a directory that is in
  none, as many processes are started as before.
- **A write the brief protects is refused without asking git for the
  base.** The base is read for the allowed signers a ruling is checked
  against, and it was resolved, three of git's processes, before the
  brief's rulings were read. Where no ruling of the brief allows anything
  the refusal now starts three processes where it started seven, and on
  that workstation at rest took 1.9 seconds where it took 3.6; where one
  does, the base is asked for as before.

## 0.17.0

`doctor` and `init` see four more ways a guard is set up and checks
nothing: a root on the hook's line that is in no work tree, hooks switched
off by `disableAllHooks`, an entry that is no command, and a plugin that
settings turn on and the machine does not have. And they name only a tool
Claude Code has as one whose writes go unchecked. `doctor`, `init` and the
hooks ask git at once for what waits on nothing else, about half a second
of the five a `doctor` takes on a Windows workstation, and a matcher that
is a pattern is read once in a run.

### Changed

- **`doctor` fails for a hook's line whose root is a directory outside any
  git work tree.** `hook claude --root <such a directory>` reads a session
  outside a work tree: the hook checks no write and says nothing, exit 0,
  as in every release, and `doctor` said of the line that it guards, by
  its root. It now asks git about the root as the hook does and says the
  line as a guard that is off: `"hook claude --root /elsewhere" in
  .claude/settings.json: --root is "/elsewhere", a directory outside any git
  work tree, which the hook reads as a session outside one, exit 0 and no
  word, so the guard is off and no write is checked`. `init` says the same
  of the file (`advise`) and writes nothing into it. The hook answers as it
  did ([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md)).
  Upgrading: `doctor` exits 1 for such a line, where it exited 0 while no
  write was checked: give the line a directory in the work tree, or take
  `--root` off it for the project Claude Code names.
- **`doctor` fails where `disableAllHooks` switches the guard off.** With
  `"disableAllHooks": true` in a settings file, Claude Code's settings
  reference has it run no hook of the user's, the project's or the local
  settings and none of a plugin, and `doctor` reported `init`'s entries, or
  the plugin, as the guard. It now reads the key from the three files as
  Claude Code merges them, the last that sets it deciding, names the file,
  and exits 1 where there are guard hooks for the key to switch off; where
  nothing is wired it is a note. `init` says it of the file that holds the
  key (`advise`) and writes what it would have written. Hooks of managed
  settings, and of a plugin managed settings force on, keep running, and
  neither `doctor` nor `init` reads managed settings or `--settings`.
  `--format json` has the file as `claudeCode.hooksOff`, `null` where no
  file switches the hooks off.
  Upgrading: `doctor` exits 1 in such a tree, where it exited 0 while no
  hook ran: take the key out, or set it to `false` in a file of higher
  precedence.
- **Only an entry Claude Code runs as a command is read as the hook.** An
  entry of another handler type, `"type": "prompt"`, `"agent"`, `"http"`
  or `"mcp_tool"`, that held the hook's command was reported as the guard.
  Such an entry runs no command, so it is no line of the hook: `doctor`
  reports no guard for it, and `init --write` writes its hooks beside it.
  An entry with no `"type"`, or with a word the hooks reference does not
  list, is *cannot tell*: the reference requires the field and says nothing
  of an entry without it.
  Upgrading: `doctor --strict` exits 1 for a hook's entry with no
  `"type"`: give it `"type": "command"`, as `init` and the plugin write it.
- **`doctor` says whether the plugin that settings turn on is on this
  machine.** It reported the plugin as the guard, and `init` skipped, on the
  word of `enabledPlugins` alone. Both now read what Claude Code's plugin
  loading reference documents of the directories it keeps plugins in
  (`plugins` in its configuration directory, or
  `CLAUDE_CODE_PLUGIN_CACHE_DIR`, and each `CLAUDE_CODE_PLUGIN_SEED_DIR`).
  A version of the plugin in a cache is the plugin on the machine, and
  nothing more is said. Where the project's `.claude/settings.json` alone
  turns it on, no version is cached and no marketplace of its name is
  recorded as fetched or declared in settings, Claude Code fetches none, so
  the plugin is not the guard: `doctor` says so with what would bring it,
  and exits 1 where no hook of `init`'s guards instead. Everything else is
  *cannot tell*, said, and a failure under `--strict` alone: a record that
  is not there or cannot be read, a marketplace that is there or declared
  with nothing cached, a `true` in a settings file of your own, an id that
  names no marketplace. `init` writes no hook on that reading alone: it
  says what `doctor` says (`advise`), and how to have the hooks in the file
  instead. `--format json` has `claudeCode.presence`, `null` where no
  plugin is on, with its `state` (`present`, `absent` or `unknown`) and the
  reason as `detail`, and `claudeCode.notes`, what is said of the plugin
  and of `disableAllHooks`
  ([ADR-0012](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0012-one-way-into-claude-code.md)).
  Upgrading: `doctor` exits 1 where the project's settings alone turn the
  plugin on and the machine has neither a version of it nor its
  marketplace: install the plugin there, or turn it off for the project and
  run `init --write`. `claudeCode.state` is then `none` or `init`, where
  it was `plugin` or `both`. `doctor --strict` exits 1 where it cannot
  tell, as on a machine where Claude Code has recorded no marketplace.
- **`doctor` and `init` no longer name `MultiEdit` as a tool whose writes
  go unchecked.** `doctor` says which of the tools that write a file a
  hook's line is waited on before, and it counted four: `Edit`, `Write`,
  `MultiEdit` and `NotebookEdit`. So a line under the matcher
  `Edit|Write|NotebookEdit` was said to leave a write by `MultiEdit`
  unchecked. No Claude Code the hooks run under has that tool: its tools
  reference lists `Edit`, `Write` and `NotebookEdit`, and the tool inputs
  its releases declare hold a `MultiEdit` up to 1.0.128 and none from 2.0.0
  on, where the hooks need 2.1.139. A line is now read for those three, and
  one waited on before all of them is said with nothing more, as a line
  under the matcher `init` writes is. The hook reads the file a `MultiEdit`
  names as it did, for whatever still sends one, and `init` writes the
  matcher it wrote
  ([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md)).
  Upgrading: in `doctor --format json`, `before` and `after` of each of
  `claudeCode.lines` hold `Edit`, `Write` and `NotebookEdit` at most, three
  names for `init`'s own line where they held four, so a script that
  compared them with the four names compares with three. A line whose
  matcher lets `MultiEdit` through and none of the three is `unstarted`
  where it was `guards`: it is no longer one of `init`'s entries, so beside
  the plugin `doctor` exits 0 where it exited 1 for a double install, and
  `init --write` writes its hooks beside such a line.

### Fixed

- **`doctor`, `init` and the hooks ask git at once for what waits on nothing
  else, and `doctor` asks Claude Code its release meanwhile.** Each started
  its processes one after another, nine for a plain `doctor`, and on a
  Windows workstation a process is what a command takes: 227 ms for one of
  git's there, and 2.6 seconds for Claude Code's. Measured there with the
  two builds taking turns, at the median of ten runs, `doctor` took 4.8
  seconds where it took 5.3, and 4.3 where it took 5.4 on a brief's branch;
  with other work holding every processor of the workstation, 20.0 where it
  took 25.5. `init` and the hooks take a tenth of a second less than they
  did, of one to two and a half. On Linux, where git answers in 2 ms, a
  `doctor` takes 0.10 seconds either way. Nothing any of them prints changes
  ([ADR-0002](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0002-siblings-through-their-command-lines.md)).
- **A matcher that is a pattern is read once in a run.** `doctor` read it
  again for every entry under it, and `init` once more for what to write.
  Under a pattern that runs out its budget of 100 ms, fifty entries took a
  `doctor` 5.2 seconds, and take 0.2. A file with a pattern of its own over
  each entry is read as before, a budget each. In the programmatic API,
  `mergeClaudeSettings` takes what reads a pattern as an optional third
  argument; without it, it reads each pattern once for itself.

## 0.16.0

`doctor` and `init` see the rest of Claude Code's hook. A line that names
a brief which is not one holds every write, and `doctor` says so, exit 1,
where it said the line guards. An entry is read with the event it stands
under and its matcher, so a line Claude Code never starts before a write
is no longer reported as the guard. And `init` writes no second line
beside a line of the hook a person changed, and says of each file what
`doctor` says of it.

### Changed

- **`doctor` says a hook's line that names a brief which is not one, and
  exits 1.** `hook claude --brief 404` on the line in Claude Code's settings
  has the hook hold every write, exit 2, where spec-brief knows no brief 404
  or has archived it, and `doctor` said of that line that it guards. It now
  asks spec-brief about the name as the hook does, in the work tree the
  line's root is in, and says the line in the words the hook holds the write
  with: `"hook claude --brief 404" in .claude/settings.json: the flag names
  brief 404, and spec-brief knows no such brief, so the hook holds every
  write until the line is mended`. `--format json` has the line's `state` as
  `held`. The hook answers as it did
  ([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md)).
  Upgrading: `doctor` exits 1 for such a line, where it exited 0 while every
  write was held: name a brief spec-brief lists on the line, or take
  `--brief` off it.
- **`doctor` reads the event and the matcher of the hook's entries.** It
  read neither, so a line under `PostToolUse` alone, or under a matcher such
  as `Bash`, which Claude Code never starts before a write, was reported as
  the guard. An entry is now read as Claude Code's hooks reference has it:
  waited on before a tool call under `PreToolUse` alone, for the tools its
  matcher lets through, and for none where it runs in the background
  (`async`, `asyncRewake`). A line waited on before no write is said as not
  the guard, with what it stands under; one waited on before some of `Edit`,
  `Write`, `MultiEdit` and `NotebookEdit` guards those, and the rest are
  named as unchecked; an entry with an `if`, whose rule is not read, or with
  a matcher that is not text, is no pattern, or is a pattern that takes more
  than a tenth of a second to test against the four names, is *cannot
  tell*. `--format
  json` has `before`, `after` and `cover` on each of `claudeCode.lines`, and
  the states `unstarted` and `held` beside `guards`, `off` and `unknown`.
  Upgrading: a settings file whose only line of the hook is started for no
  write, before one or after, is no longer one of `init`'s entries, so
  beside the plugin it is no double install, exit 0 where it was 1, and
  alone `doctor` reports no guard and does not ask Claude Code its release.
  `doctor --strict` exits 1 for a line whose entry has an `if`, or a matcher
  it cannot read. A script that reads `claudeCode.lines[].state` meets the
  two new states.
- **`init` writes no hook beside a line of the hook that is there.** It knew
  only the line it writes and the one 0.1 wrote, so beside a line a person
  had changed, such as `hook claude --root ${CLAUDE_PROJECT_DIR}`, `init
  --write` added its own, and both ran for every write; and with the Claude
  Code plugin on beside such a line it said `skip` where `doctor` exits 1
  for the double install. It now knows the hook as `doctor` knows it, by its
  command and the words `hook claude`, with the event and the matcher its
  entry stands under. Where the file holds such a line that Claude Code
  starts for a write, `init` writes no hook into it, and says which line it
  left in `doctor`'s words for it: `keep`, or `advise` where the line turns
  the guard off, holds every write or is waited on before none. Beside the
  plugin the file is `advise`, the double install, and so where the line
  stands in a settings file of your own. It rewrites no line but the one 0.1
  wrote
  ([ADR-0012](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0012-one-way-into-claude-code.md)).
  Upgrading: `init --write` leaves `.claude/settings.json` as it is where it
  added a second line; a file that holds two since an earlier `init` keeps
  both, and one of them is yours to take out. A line Claude Code starts for
  no write, under a matcher that names no writing tool or in the background
  before a write, no longer counts as installed: `init` writes its hooks
  beside it. In the programmatic API, `mergeClaudeSettings` takes the
  hook's reading as an optional second argument; without it, it knows
  `init`'s own line alone, read with its event and matcher as above.

## 0.15.0

`doctor` reads the line of Claude Code's hook as the hook itself reads it:
a line with more on it than `init` writes is said to guard where it does,
and a line the hook cannot read, or whose `--root` is no directory, is said
as a guard that is off, exit 1, where each was reported as no guard at all
or not reported.

### Changed

- **`doctor` reads the line of Claude Code's hook as the hook reads it.** It
  knew the hook only where its command and arguments were exactly what
  `init` writes, or what 0.1 wrote: a line with `--root
  ${CLAUDE_PROJECT_DIR}` added by hand, which guards, was reported as
  `neither the spec-harness plugin nor the hooks init writes, so Claude Code
  guards no write`, and a line that turns the guard off was reported the
  same way, with exit 0. It now knows the hook by its command and the words
  `hook claude`, whatever else is on the line, and reads the rest through
  the code the hook reads it with. A line that guards with more on it than
  `init` writes is said as it is and fails nothing. A line the hook cannot
  read, and a `--root` that is not a directory, are said in the hook's own
  words, as a guard that is off, and `doctor` exits 1. A line with no
  `args`, which a shell reads first, is *cannot tell* where the shell would
  change what follows the command: said, and a failure under `--strict`.
  `"onFailure": "block"` on the entry is said in a note, with what it
  changes. `--format json` has each line as `claudeCode.lines`
  ([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md)).
  Upgrading: a hook's line changed by hand is now the guard to `doctor`, so
  it asks Claude Code its release for it, and beside the plugin it is the
  double install it always was, exit 1. Where `doctor` now exits 1 for a
  line, the guard was off already: mend the line it names, or write
  `hook claude` and nothing after it, as `init` does. The lines `init` and
  the plugin wrote are reported as before.

## 0.14.0

`hook claude` says a line of its own that it cannot read with exit 1 and
holds no write for it, where exit 2 held every write of the session. And
where spec-guard refuses for a spec pattern that matched no file, the
context packet lists the rules of the files that did match, under a
sentence that names the pattern, where it listed none.

### Changed

- **`hook claude` says a line it cannot read, and exits 1.** An option no
  command has, an option left without its value, and a `--format` or an
  `--at` that is none were exit 2 from Claude Code's hook as from every
  command, and Claude Code holds a write on a PreToolUse hook's exit 2:
  every write of the session, the one that mends the line among them. It is
  now one line on stderr, `the hook's line cannot be read (...), so the
  guard is off and this write is not checked`, with the parser's words
  between the brackets, and exit 1, which Claude Code shows as a hook error
  while the write goes on, as for a `--root` that is not a directory. Exit 2
  from the hook is for a write it could not check, and `hook git` and every
  other command stop on such a line as before
  ([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md)).
  Upgrading: no release wrote more than `hook claude` on the hook's line. If
  yours holds more and cannot be read, it held every write and now holds
  none: mend the line the hook error names. A hook entry that sets
  `"onFailure": "block"` has Claude Code hold the write for exit 1 too.

### Added

- **The context packet lists the rules of the rest where spec-guard refuses
  for a spec pattern that matched no file.** spec-guard 0.22.0 exits 2 for
  a pattern among its `specs` that matches no file beside others that do,
  and still answers with the rules of the files that matched. `context` and
  `start_round` read that as rules that could not be read and listed none.
  They now list those rules under one sentence that names the pattern and
  says a rule kept under it is not listed, and name the patterns in
  `--format json` and in `start_round` as `unmatchedSpecs`, an empty list
  where there is none. Any other refusal reads as it did, and so does a
  spec-guard older than 0.22.0, which writes no such field
  ([ADR-0001](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0001-the-harness-decides-the-agent-writes.md)).

## 0.13.0

`hook claude` says a `--root` on its line that is not a directory, with
exit 1 and no write refused, where the guard was off and nothing said so.
And four more inputs that named nothing, or were not read, are refused by
name: a brief `premises` is given that spec-brief does not know, an option
`escalate --list` or `--show` leaves unread, and a brief given as the
argument and as `--brief` at once.

### Changed

- **`hook claude` says a `--root` on its line that is not a directory, and
  exits 1.** It exited 0 with no word, as outside a git work tree, and the
  write went on unguarded; it is now one line on stderr that names the root,
  and exit 1, which Claude Code shows as a hook error without blocking the
  write
  ([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md)).
  Upgrading: no release wrote a `--root` on the hook's line; if you added
  one, point it at a directory that exists, or take it off.
- **`premises` refuses a brief `--brief` or `SPEC_BRIEF` names that
  spec-brief does not know**, as every other command does: `premises
  --brief 999` was read as no round, and held the round's own premise
  against it. It is exit 2 and `the flag names brief 999, and spec-brief
  knows no such brief`
  ([ADR-0004](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0004-the-active-brief-is-named-not-guessed.md)).
  Upgrading: name a brief spec-brief lists, or none. A branch whose name
  reads as a brief's and names none is read as no round, as before.
- **`escalate --list` and `--show` refuse an option they do not read.**
  Beside either, `--path`, `--reason`, `--option`, `--recommend` and
  `--brief` did nothing, and `--show` did nothing beside `--list`: the list
  was printed, exit 0, and a request spelled out beside it was never raised
  ([ADR-0006](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0006-a-ruling-is-a-signed-commit.md)).
  Upgrading: give `--list` or `--show` with `--root` and `--format` alone,
  and raise a request in a call of its own.
- **A brief given as the argument and as `--brief` at once is refused**,
  whatever the two hold, by `context`, `rulings`, `audit` and `probe`:
  `audit 012 --brief 013` audited 012 with no word about 013. Upgrading:
  give one of them. `SPEC_BRIEF` and the branch beside either are read as
  before.

### Added

- `findActive`, from the package, takes the brief an `argument` names, which
  comes before the flag, and gives `argument` as its `source`.

### Fixed

- A brief that is not one is said by what named it: `the argument names
  brief 999` for `context 999`, and `"brief" names brief 999` from the
  server's tools, where both said `the flag`.
- The context packet ends once the sentence in which it quotes why
  spec-guard could not be asked: a refusal spec-guard ends with a full stop
  of its own, as each has since its 0.21.0, read `... in package.json..
  Treat every ADR as binding`.

## 0.12.0

A probe's command is answered when its shell ends, by the shell's exit code,
where one that left something holding its output was waited for until its
timeout and then called stopped. And an input that is set and names nothing
is refused by a line that names it, where it was read as if it had not been
given: an option another command reads, an argument a command does not
take, an empty `--root`, `--brief` or `--base`, an escalation with an empty
path or reason, from the command line or through the server. Every command
line a release's `init` wrote is read as it was.

### Changed

- **A probe's command is answered when its shell ends, by the shell's exit
  code.** A command that ended and left something holding its output, as a
  server started in the background does, was waited for until its timeout,
  ten minutes by default, and then counted as stopped: its `run` was a
  `timeout` and the probe `invalid`, and its `setup` stopped the probe.
  `probe` now waits three seconds for that output, as GitHub's runner waits
  five for a step's, judges the command by its exit code and what it had
  printed, and says that something it started was left running
  ([ADR-0003](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0003-state-outside-the-work-tree.md)).
  Upgrading: a command's work must be done when its shell ends, so have it
  wait for what it starts. A probe that was `invalid` at its timeout may now
  be `measured`, `vacuous`, `fixed` or `still-failing`, and a `setup` that
  stopped the probe may pass.
- On Linux and macOS, what a probe's command left running in its process
  group is stopped when `probe` is done at that commit, before the worktree
  is removed. One that held the command's output was stopped at the
  command's timeout, and one that held nothing ran on after `probe` had
  ended. Upgrading: a process a `setup` starts in the background serves the
  runs at that commit and does not outlive them. On Windows it still runs
  on, since nothing a command left can be reached there.
- **An option a command does not read is refused by that command.** Every
  command took every option, so `doctor --note x`, `init --base main`,
  `mcp --brief 012` and `hook git --strict` ran as if the option were not
  there. Each is now exit 2 and one line that names it, `doctor does not
  take --note; its options are --brief, --base, --root, --format and
  --strict`
  ([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md),
  [An input that names nothing](README.md#an-input-that-names-nothing)).
  Upgrading: drop the option. The README's table has what each command
  reads; `--strict` is for `guard`, `audit`, `premises` and `doctor`, and
  `init` and `mcp` take neither `--brief` nor `--base`.
- **An argument a command does not take is refused.** `doctor extra`,
  `premises extra` and `context 012 extra` ran as if it were not there, and
  `init mydir` set up the directory it stood in; each is exit 2 with the
  argument named. Upgrading: drop the argument; `init --root mydir` sets up
  another directory.
- **An option or an argument given an empty value is refused by name, not
  read as left out.** `--root ""` ran in the current directory, `--brief ""`
  was answered for the branch's brief, `audit --base ""` measured no change
  and warned, and `guard src/a.ts ""` judged the repository itself. Each is
  exit 2 and a line such as `--root is "", which names no directory`, for a
  value of only space too; `probe --id ""` and `escalate --show ""`, exit 2
  before, say the same line
  ([ADR-0004](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0004-the-active-brief-is-named-not-guessed.md)).
  Upgrading: where a script may hand an option nothing, leave the option
  out, as `${ID:+--brief "$ID"}` does in a shell. `SPEC_BRIEF` set and
  empty is still as unset.
- **A memo is not written with a part that says nothing.** `escalate` with
  an empty `--path`, `--reason`, `--option` or `--recommend`, and
  `request_escalation` with an empty path, recommendation or option label,
  recorded a request a person could not rule on: a file with no name, an
  empty *Why*, `1. **** - `. Each is refused, exit 2 or a tool error that
  names the argument, and nothing is recorded
  ([ADR-0006](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0006-a-ruling-is-a-signed-commit.md)).
  Upgrading: give each of them something, or leave `--option` and
  `--recommend` out; an option needs a label, `"<label>: <cost>"`, and its
  cost may be left out.
- **The server's tools refuse an empty `brief`, `base` or path.**
  `start_round`, `check_path`, `request_escalation` and `audit_round`
  answered an empty `brief` for the branch's brief and an empty `base` with
  no ruling verified, and `check_path` judged an empty path as the project
  itself. Each is a tool error that names the argument, `"brief" is "",
  which names no brief`. Upgrading: omit an argument there is nothing to
  give.
- `hook claude` refuses none of the above: whatever else is on its line is
  passed over as before, since exit 2 from it holds every write of a
  session. Every command line a release's `init` wrote, or its plugin
  ships, is read as it was, and a test holds each
  ([ADR-0012](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0012-one-way-into-claude-code.md)).

### Added

- `doctor` says when the brief a round would work under is no brief: one
  spec-brief does not know or has archived, whichever of `--brief`,
  `SPEC_BRIEF` or the branch names it, and an empty `--brief` or `--base`.
  It printed the id and no more, `brief   999`, for a brief under which the
  guard held every write. Its exit code is as it was, and `--format json`
  has the reason as `briefProblem`.

### Fixed

- A `--root` that is a file, or is not there, is refused by name, `--root
  is "nowhere", which is not a directory`, where the line said the path was
  outside a git work tree. Exit 2, as before.
- A `.spec-harness.json` that is a directory is said in the harness's
  words, `.spec-harness.json is a directory, not a configuration file`,
  where it was `is not valid JSON: EISDIR: illegal operation on a
  directory, read`. Exit 2, as before.
- A memo gives an option that states no cost as the choice alone,
  `2. **Refuse**`, where it ended in a dash that led nowhere.

## 0.11.1

A probe's timeout ends the wait as well as the command, where a process out
of reach that held the command's output kept the probe waiting without
limit; and an exit 2 the harness could foresee says so in a line.

### Fixed

- **A reader that closes the output is answered in one line, not a stack.**
  `spec-harness context | head` could end with `spec-harness: unexpected
  error: Error: EPIPE: broken pipe, write` and a stack once `head` had left;
  it now prints `spec-harness: stdout was closed before all of the output
  was written` on stderr, from every command and the server. The exit code
  is 2, as it was
  ([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md)).
- A git command that failed - the diff `audit` reads, the staged files
  `hook git` reads, the worktree `probe` adds - is reported as what git
  said, on one line: `spec-harness: git diff --cached failed: fatal: ...`.
  It was `unexpected error: GitError:` and a stack. Exit 2, as before.
- A probe's timeout ends the wait for its command. Where a process the
  command started still held its output and was out of the timeout's reach -
  one in a session of its own, or on Windows anything left by a command whose
  shell had ended - `probe` waited for that process to end, and never ended
  while it ran. The command is now answered three seconds after its timeout,
  as stopped at it, with what it had printed, and the run's evidence says
  that something it started was left running
  ([ADR-0003](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0003-state-outside-the-work-tree.md)).
- A probe's `setup` that was stopped at its timeout says so, and after how
  many seconds. It said only that the setup failed, with whatever the setup
  had printed.

### Documentation

- The README said an interrupted `probe` stops every command "with
  everything those started". It and ADR-0003 now say what a timeout and an
  interrupt reach - the command's process group on Linux and macOS, the
  processes under the command's shell on Windows while that shell runs - and
  what they leave running.

## 0.11.0

An error the harness did not expect is exit 2, where it was Node's exit 1; a
probe's command fetches nothing through `npx` unless its line or the person
says so, is given no input, and shows what it printed when a run proves
nothing; and a command is stopped by its id only while the harness holds it.

### Changed

- **An error the harness did not expect ends the run with exit 2, not 1.**
  It left the process as Node's uncaught error, and exit 1 reads as a
  refusal or a finding; every command now reports it as
  `spec-harness: unexpected error:` with its stack on stderr, nothing on
  stdout, and exit 2, as does an error thrown where nothing waits for it. In
  `hook claude` that holds the write the guard could not check, where the
  failed hook let it through
  ([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md)).
  Upgrading: a script that took exit 1 after a crash for a refusal now sees
  2, "the answer cannot be trusted"; `run()` and `main()` from the package
  resolve to 2 where their promise rejected.
- `probe` runs a probe's `setup` and `run` lines with `npm_config_yes=false`,
  so `npx <tool>` given a name the project has not installed stops and names
  the package, where it fetched the registry's package of that name and ran
  it, unasked. A probe that passed by fetching is now `invalid`
  ([ADR-0007](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0007-probes-declare-their-failure.md)).
  Upgrading: install the tool in the probe's `setup`, as `setup: npm ci`
  does, and start it through one of the project's scripts or
  `npx --no-install <tool>`. To have npm fetch as before, say `--yes` on the
  probe's line, or set `npm_config_yes=true` in the environment `probe` runs
  in, which it leaves as it finds it; `yes=true` in an `.npmrc` no longer
  does it, since the environment outranks the file.

### Added

- A probe's run that proves nothing - it failed for another reason than the
  probe declares, was stopped at its timeout or left no report - shows the
  last 2,000 characters its command printed, where the reason is: on the
  standard error beside the table, and with `--format json` as `output` on
  that run. Colours are dropped and other control characters written as
  their escapes, and a `setup` that fails shows its output by the same rule.

### Fixed

- A probe's command that reads its input is told at once that there is
  none. Its input was a pipe nothing closed, so it waited until the probe's
  timeout stopped it, ten minutes by default.
- `probe` stops a command by its id only while it still holds the command's
  shell. A command whose shell had ended while something it started held its
  output was stopped all the same at its timeout, an interrupt or exit, under
  an id Windows may have given to another process by then, which
  `taskkill /T /F` ended with all it had started; on Linux and macOS what the
  shell left in its process group is still stopped, unless a process has the
  id by then
  ([ADR-0003](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0003-state-outside-the-work-tree.md)).

## 0.10.1

On Windows a probe lost its verdict when its worktree could not be deleted,
and Ctrl+Break left its commands running; and the README's probe example
started its tool through `npx`.

### Security

- The README's probe example ran its test through `npx` by the runner's name
  alone, and the `draft-brief` skill said nothing of how a probe starts a
  tool. A probe runs in a fresh worktree with nothing installed until its
  `setup` installs it and no terminal, where `npx <tool>` fetches the
  registry's package of that name and runs it, unasked: the example is now
  `run: npm test -- tests/probes/rotate.test.ts`, and the skill tells an
  agent to write a probe so
  ([ADR-0007](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0007-probes-declare-their-failure.md)).
  Upgrading: in a brief of your own, have a probe's `run` and `setup` start
  a tool through one of the project's scripts, or through
  `npx --no-install <tool>`. `probe` itself runs a line as it is written.

### Fixed

- `probe` keeps its verdict when a worktree's directory cannot be deleted,
  as on Windows while something a probe's command started is still running
  in it. It ended in a Node stack trace with exit 1 before, the whole
  checkout left in the temporary directory and git's record of the worktree
  left in the repository. Git now forgets the worktree first, `probe` prints
  and exits by its verdict, and it names the directory it left on the
  standard error as it exits
  ([ADR-0003](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0003-state-outside-the-work-tree.md)).
- Ctrl+Break on Windows, which GitHub's runner also sends a step it
  cancels, stops a `probe`'s commands and removes its worktree, as Ctrl+C
  does, and exits 149. It ended the harness at once before, with the
  worktree in place and the commands running on.

## 0.10.0

The skills and the README gave `npx` the tools' bare command names, which on
npm are not this project's packages; the audit sees a dependency a round
allowed to run install scripts; and git's hook runs `node`, not `npx`.

### Security

- Every command in the four skills, in the MCP prompts that serve the same
  text, and in the README gives `npx` the package's full name behind
  `--no-install`, as in
  `npx --no-install @descent-vtt/spec-harness audit --format json`.
  `spec-harness` without the scope is another publisher's package on npm,
  and `spec-brief`, `spec-guard` and `spec-graph` without it belonged to
  nobody on 2026-10-07. `npx` given a name the project has not installed
  fetches the package of that name and runs it, unasked when no terminal is
  attached, as under an agent: the skills told an agent to run fifteen such
  commands in whatever tree it stood in. Each skill now opens by saying what
  to do when a command stops for a missing package - install the project's
  dependencies, as with `npm ci` - and never to drop the flag or the scope
  ([Names](README.md#names), ADR-0009, and the family's
  [adopting guide](https://github.com/spec-family/spec-core/blob/main/docs/adopting.md#names)).
  The hooks, the MCP server and git's hook run `node` with the installed
  file's path and were not exposed.
  Upgrading: update the Claude Code plugin, or the package, to get the
  skills as they are now. Where a CI job, a script or a prompt of your own
  runs `npx <tool>`, write `npx --no-install @descent-vtt/<tool>`;
  `--no-install` before the bare name is not enough, since npm still runs a
  copy an earlier fetch left in its cache. If a bare name was ever run
  through `npx` where the harness was not installed, empty that cache: the
  `_npx` directory below the path `npm config get cache` prints.

### Added

- `doctor` and `init` note a pre-commit hook that still runs spec-harness
  through `npx`, with the line that runs it with `node`;
  `doctor --format json` gains `gitHook.note`. A note, never a failure.
- `readManifest` and `diffManifest` in the programmatic API give a
  `package.json`'s install-script entries and what changed in them, as
  `installScripts`.

### Changed

- `audit` reports a package a round allowed to run install scripts - an
  entry added to `allowScripts` in a `package.json`, where npm 12 keeps its
  approvals, or turned from `false` to `true` - as `install-script-allowed`,
  a warning as a new dependency is; a denial and a removed entry are notes.
  `--format json` gains `installScripts`
  ([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md)).
  Upgrading: a round that approves a dependency's install script now fails
  `audit --strict`; say in the brief why it must run and audit without
  `--strict`, or remove the entry.
- `init --git-hook` writes a pre-commit hook that runs `node` and the script
  in the project's install, as the Claude Code hooks are run, where it ran
  <!-- bare-name: the hook as it was -->
  `npx --no-install spec-harness hook git`: a commit starts no npm. Where
  the harness is not installed in the work tree, the hook says so and stops
  the commit
  ([ADR-0012](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0012-one-way-into-claude-code.md)).
  Upgrading: a hook written before keeps working; to move it, use the line
  `doctor` names, or delete the hook and run `init --git-hook --write`.

## 0.9.1

A command or a JUnit entity named `constructor`, `toString` or `__proto__`
is the unknown name it is, and the suite now runs against the siblings' newest
releases and, in CI, their minimums.

### Fixed

- A command named as something every JavaScript object answers to -
  `spec-harness constructor`, `toString`, `__proto__` - is the unknown
  command it is: `unknown command "constructor"; see spec-harness --help`
  with exit 2, where it ended on a stack trace with exit 1.
- `probe` leaves an entity of such a name in a JUnit report as written, as
  it leaves any entity XML does not name: `&constructor;` or `&toString;` in
  a test's name, its class or a failure's message was replaced with the
  source of a function, so a probe's `test:` could not name that test.
- `formatSarif`, called with a finding whose rule is so named, describes the
  rule by its name, as it does any rule the audit does not have; the
  description had no text. No command makes such a finding.

## 0.9.0

spec-harness refuses sibling JSON of a shape it does not read, with exit 2,
where it stopped with a stack trace or read the document halfway, and two
messages name what is really missing.

### Fixed

- On a branch with nothing committed yet, `audit`, `context`, `doctor`
  and the MCP tools say HEAD names no commit, where they said the base named
  none.
- When spec-brief exits 2 while listing the briefs and says nothing, the
  error ends in `exit 2`, where it ended with the colon before a reason.
- When spec-guard or spec-brief prints JSON of a shape spec-harness does
  not read - `results` that is not a list, a result whose `ok` is not true
  or false, an archive reason of a severity it does not know - `audit` and
  `premises` exit 2 naming the tool and the field, where they stopped with
  a stack trace or read the document halfway; `context` says the rules could
  not be read and why, as it does for spec-guard output that is not JSON
  ([ADR-0002](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0002-siblings-through-their-command-lines.md)).

## 0.8.0

The context packet names front matter lines it could not read, `doctor`
reads the release of a Claude Code installed with npm on Windows, and
spec-harness reads status words in English only again.

### Added

- `context` names each line of a cited document's front matter that is not
  `key: value`, with its line number and reason, and says a status on it was
  not read; `--format json` and `start_round` gain `unreadableFrontMatter`
  ([ADR-0001](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0001-the-harness-decides-the-agent-writes.md)).

### Removed

- `context` no longer reads a cited document's status under `狀態` or
  `状态`. Upgrading: write the status in English, e.g. `status: superseded`.

### Fixed

- `doctor` reads the release of an npm-installed Claude Code on Windows from
  the package its `claude.cmd` shim runs, without running the shim, where it
  could not tell and failed `--strict`
  ([ADR-0012](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0012-one-way-into-claude-code.md)).
- `doctor` says it cannot tell the release of a `claude.exe` Windows cannot
  start, where it stopped with `spawn UNKNOWN`.
- `doctor` reads the allowed-signers file's quotes and options as OpenSSH
  does, and notes a line OpenSSH refuses as no signer
  ([ADR-0006](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0006-a-ruling-is-a-signed-commit.md)).
- `init` and `doctor` resolve the spec-brief plugin export as Node does: the
  first matching condition in written order, and a `null` target as not
  exported.

## 0.7.0

The audit and `premises` no longer pass on what they could not read, the
audit says what it measured, both write GitLab, SARIF and GitHub reports,
`doctor` checks the Claude Code that runs the guard, and a rooted pattern is
marked wherever it protects, allows or scopes nothing. spec-core is at
5666c96.

### Added

- `audit` and `premises` take `--format gitlab`, `sarif` and `github`. A
  fingerprint is the rule, the file and the finding's subject, never its
  message or line ([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md)).
- `audit` prints what it measured above the counts line, which stays last,
  and `--format json` and `audit_round` gain `measured`. A brief with no
  assertion says `goals: none declared`.
- `--format json` findings carry a `subject`; `doctor --format json` gains
  `branchSource`, `allowedSigners.notFido2`, `allowedSigners.problems`,
  `claudeCode.release` and `gitHook`. No `schemaVersion` moves.
- `doctor` notes signers whose key is not a FIDO2 key (a note, never a
  failure), and says whether git's pre-commit hook runs spec-harness; `init`
  advises that hook when `--git-hook` is not given.
- The README covers non-Node repositories, merge settings that keep signed
  rulings valid on GitHub and GitLab, a marketplace from a GitLab mirror, and
  the git 2.31 the harness has always needed.

### Changed

- spec-core at 5666c96: `.//docs` is `docs`, as POSIX reads it, in every
  scope, protection, ruling path and manifest name, where it was rooted.
  Upgrading: check any pattern written `.//x`; `//x` is still rooted.
- `audit` reports an assertion spec-guard cannot read as
  `assertion-unreadable`, where it dropped it and passed; it fails
  `--strict`. Upgrading: fix the directive spec-guard names.
- `premises` reports an unreadable premise the same way, counts it, and
  `premises --strict` fails on it. Upgrading: fix the directive, or run
  without `--strict`.
- A leading `/` roots a pattern, so a rooted protection or ruling path
  protects or allows nothing and a rooted manifest name names nothing: the
  packet marks them, and `audit` warns `protection-rooted`,
  `ruling-path-rooted` or `manifest-name-rooted`, failing `--strict`.
  Upgrading: write the pattern without the leading slash.
- `doctor` exits 1 when the Claude Code wired to the guard is older than
  2.1.139, which runs every write unguarded; one it cannot find or run is
  unknown, never fine, and fails `--strict`
  ([ADR-0012](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0012-one-way-into-claude-code.md)).
  Upgrading: `claude update`.
- `context` shows a cited document's status under `狀態` or `状态` when it
  has no `status` key. Upgrading: nothing; write the key with an ASCII colon.

### Fixed

- On a detached HEAD, as in CI, the brief is found from the forge's branch
  variable (`GITHUB_HEAD_REF`, `GITHUB_REF_NAME` on a branch push,
  `CI_MERGE_REQUEST_SOURCE_BRANCH_NAME`, `CI_COMMIT_BRANCH`), so `premises`
  no longer fails a round's own CI run
  ([ADR-0004](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0004-the-active-brief-is-named-not-guessed.md)).
- A rooted pattern in `affectedFiles` no longer makes spec-guard refuse the
  whole scope; the rules over the other patterns come back.
- `init --git-hook` writes the hook where git runs it, for an absolute or
  `~` `core.hooksPath` too.
- `init` names the configured allowed-signers file, suggests a FIDO2 key,
  and says how GitHub, GitLab Premium and GitLab Free protect the rule files.
- A spec-brief plugin loaded by path is recognised, so `init` no longer adds
  it twice.
- The `tools` error suggests a `node` command, which Windows can start
  without a shell, where it suggested `npx`.
- A brief's id is dropped from its title before a full-width colon or an
  unspaced dash too, as spec-brief does.

### Documentation

- The README is reorganised into lists and tables, and names the spec-brief
  plugin apart from the Claude Code plugin; SECURITY.md says how to report a
  vulnerability privately.

## 0.6.0

The context packet names a protection or a ruling's path the guard cannot
read, with what that costs - every write refused, or nothing allowed - and
spec-core is at 7e41240, which reads a leading `/` on a brace alternative as
it reads one on a pattern alone. `context --format json` and `start_round`
gain `unreadableProtections` and `unreadableRulingPaths`.

### Changed

- spec-core at 7e41240. Its glob reads a leading `/` on a brace
  alternative as it reads one on a pattern written alone, where the slash
  was dropped: `{/docs,src/**}` is `/docs` or `src/**`, where it was `docs`
  or `src/**`. `/docs` is rooted at the filesystem's root, and every path
  the guard decides is repository-relative, so it matches none of them:
  - In a brief's `affectedFiles`, `{/docs,src/**}` no longer puts
    `docs/a.md` in the scope: the guard answers `out-of-scope` where it
    answered `in-scope`, as it does for `/docs` written alone. `src/a.ts`
    is in the scope as before.
  - In `protectedFiles`, `{/docs,migrations/**}` no longer protects
    `docs/a.md`, and in a ruling's paths `{/src/db/schema.ts,x}` no longer
    allows `src/db/schema.ts`, as `/docs` and `/src/db/schema.ts` alone
    protect and allow nothing. The guard can read each, so the packet lists
    it as written, as it lists `/docs`, with no note.
  - `context` and `start_round` ask spec-guard about `/docs`, or about `/`
    when the repository holds no `docs`, where they asked about `docs`, as
    they do for `/docs` written alone. spec-guard refuses a path outside the
    repository, so the packet says the rules could not be read, with what
    spec-guard said, and to treat every ADR as binding.
  - In `dependencies.manifests`, `{/package.json,Gemfile}` no longer names
    `package.json` at any depth, and names no file the round changed, as
    `/package.json` alone names none. `Gemfile` is read as before, and no
    warning names the name, since it can be read.
  - In spec-graph's `patterns`, `{/briefs/**/*.md,docs/**/*.md}` no longer
    reaches `briefs/`, and `init` says spec-graph does not read the briefs
    there, as it says for `/briefs/**/*.md`.
  - A slash after a segment, or before the braces, reads as before:
    `a/{/b,c}` is `a/b` or `a/c`, `/{docs,src}` roots both, and
    `{docs,src}` is `docs` or `src`.

### Fixed

- `context` and `start_round` name a pattern in `protectedFiles` the guard
  cannot read - malformed, too large to compile, or naming no path, such as
  `{./,src}` - where the protections are listed: it is marked with
  spec-core's reason, the one the guard gives in `because` when it refuses a
  write for it, and with what it does: until it is fixed, the guard refuses
  every write but to the brief, as `unreadable-protection`, which no ruling
  waives. It was listed as written, so the agent learned why every write was
  refused only from the first refusal.
- A path of a signed ruling the guard cannot read is marked the same way
  where the ruling is listed, as allowing nothing: the guard passes over it.
  It was listed among the paths the ruling allows. The ruling's paths the
  guard reads are listed as before, as is a readable protection.
- `context --format json` and `start_round`'s structured result list such
  patterns as `unreadableProtections`, each with its `pattern` and
  `reason`, and `unreadableRulingPaths`, each with its `ruling` as well,
  fields added beside `unreadableScope`, so no `schemaVersion` moves; in the
  programmatic API a context packet carries both, each entry of the second
  an `UnreadableRulingPath`. The reasoning is in
  [ADR-0001](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0001-the-harness-decides-the-agent-writes.md)'s
  third amendment of 2026-09-29.

## 0.5.0

The context packet names a scope pattern the guard cannot read, with
spec-core's reason, and a scope none of whose patterns can be read is said to
be unread, not to be ruled by nothing. `context --format json` and
`start_round` gain `unreadableScope`.

### Fixed

- `context` and `start_round` name a pattern in `affectedFiles` the guard
  cannot read - malformed, too large to compile, or naming no path, such as
  `{./,src}` - where the scope is listed: it is marked with spec-core's
  reason, the one the guard gives in `because` when it passes over it, and
  as putting no path in the scope. It was listed as written among the files
  the round may write, with no note. When no pattern in `affectedFiles` can
  be read, the rules section says the scope could not be read and to treat
  every ADR as binding until it is fixed, where it said "spec-guard holds no
  rule over this scope": spec-guard was asked about no path. A readable
  pattern is listed as before. `context --format json` and `start_round`'s
  structured result list such patterns as `unreadableScope`, each with its
  `pattern` and `reason`, a field added beside `unclosedFrontMatter`, so no
  `schemaVersion` moves; in the programmatic API a context packet carries
  it as well, each entry an `UnreadablePattern`. The reasoning is in
  [ADR-0001](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0001-the-harness-decides-the-agent-writes.md)'s
  amendment.

## 0.4.0

The audit names a `dependencies.manifests` name it cannot read, with
spec-core's reason, where it dropped the name in silence; `context` asks
spec-guard about a plain name in the scope as it is on disk; and spec-core is
at 56c7e54, which refuses a brace alternative that names no path, such as
`{./,src}`, where it read as every path.

### Added

- `readManifestNames` in the programmatic API: the configured manifest
  names read, a predicate over the paths they name and the names that could
  not be read, each with spec-core's reason. `AuditInput.dependencies` takes
  those as `unreadNames`, optional. `manifestMatcher` is unchanged.

### Changed

- spec-core at 56c7e54. Its glob refuses braces that expand to a text
  naming no path, as it refuses that text written alone. `{./,src}`,
  `{src,./}`, `.{/,src}` and `{.,src}/` read `./` as the root's contents and
  matched every path; each is now a pattern that cannot be read, with
  spec-core's reason, `the braces expand to "./", which names no path`:
  - In a brief's `protectedFiles` it protected every path: the guard refused
    every write as `protected`, and a ruling over the path waived it. The
    guard now refuses every write as `unreadable-protection`, naming the
    pattern and the reason, which no ruling waives.
  - In `affectedFiles` it put every path in the scope. It is now named
    among the patterns that could not be read, and the rest of the scope
    still counts. `context` and `start_round` no longer ask spec-guard about
    the whole repository for it, so the packet no longer holds rules over
    code the rest of the scope leaves out.
  - In a ruling's paths it allowed every protected path; it is passed over,
    as a malformed path is.
  - In `dependencies.manifests` it made every file the round changed a
    manifest, each one no reader understands reported as `manifest-unread`.
    It is now the `manifest-name-unread` warning, with the reason.
  - In spec-graph's `patterns` it read the briefs; the list now reads
    nothing, and `init` says spec-graph does not read the briefs.
- `/./` and `/.//` are refused as `the pattern names no path`. They matched
  only paths from the filesystem's root, none of which the guard is given,
  so `protectedFiles: ["/./"]` protected nothing; it now refuses every write
  as `unreadable-protection`.
- A pattern refused before names what its braces expand to: `{.,src}` is
  `the braces expand to ".", which names no path`, `{/,src}` `"/"`, and
  `{,src}` and `{}` `the braces expand to an empty pattern`, where each was
  `the pattern names no path`. `src/{./,a}` reads as before, what `src`
  holds.

### Fixed

- A name in `dependencies.manifests` that spec-core's glob cannot read,
  malformed or too large to compile, is a finding in `audit` and
  `audit_round`: a warning, `manifest-name-unread`, on `.spec-harness.json`,
  with the name and spec-core's reason, such as `a "[" is never closed` or
  `the pattern compiles to more than 65536 states`, whether or not there is
  a base to measure from. It was passed over in silence, so every manifest
  it was meant to name went unmeasured. The other names are read as before,
  and the warning fails the audit only under `--strict`.
- `context` and `start_round` ask spec-guard for the rules over a name with
  no glob syntax in `affectedFiles` as it is on disk: `src`, a directory, is
  asked about as `src`, and `src/auth/a.ts`, a file, as that file. The
  directory holding the name was asked about, the whole repository for a
  name at the top, so the packet held rules over code outside the scope, one
  over `lib/` say, where `src/` asked about `src` alone. A name the round
  has yet to create is asked about through the directory that will hold it,
  as before, since it may become a directory. The guard's answer is
  unchanged.

## 0.3.1

spec-core at f9ce375. A trailing `/` on a brace alternative in a brief's
patterns means that directory's contents, and a pattern too large to compile
is refused as a pattern the guard cannot read, where it crashed the guard and
the hook refused every write.

### Changed

- spec-core at f9ce375. Its glob reads a trailing `/` on a brace
  alternative as it reads one written alone, as that directory's contents,
  where the slash was dropped and the alternative read as a literal:
  - In a brief's `affectedFiles` and `protectedFiles`, and in a ruling's
    paths, `{src/,docs/*.md}` is `src/` or `docs/*.md`. The guard allows or
    protects `src/deep/a.ts` as before, and no longer a path named `src`
    itself.
  - `context` and `start_round` ask spec-guard for the rules over `src` for
    such a scope, where they asked over the whole repository, so a rule that
    reaches only code outside the scope, one over `lib/` say, is no longer
    in the packet.
  - In `dependencies.manifests`, `{tools/,Gemfile}` names every file under
    `tools/` at the root, where it named a file called `tools` at any depth.

### Fixed

- A pattern that spec-core's glob compiles to more than 65536 states is a
  pattern that cannot be read, with spec-core's reason, `the pattern
  compiles to more than 65536 states`, where the command stopped with an
  uncaught `AutomatonTooLarge`. In a brief's `protectedFiles` the guard
  refuses every write as `unreadable-protection`, naming the pattern and the
  reason, as it does a malformed protection; the PreToolUse hook refused
  every write with "cannot check this write" and now gives that refusal and
  the fix. In `affectedFiles` the pattern is named among those that could
  not be read, and the rest of the scope still counts. A ruling's path, a
  name in `dependencies.manifests` and a pattern in spec-graph's
  configuration are passed over as a malformed one is: no path is ruled by
  it, no manifest is read by it, and `init` says spec-graph does not read
  the briefs.

## 0.3.0

An interrupted `probe` stops its commands before it removes their
worktrees, exits 129 on SIGHUP, and never prunes the repository's other
worktrees. `context` says when a cited document's front matter never
closes, and spec-core is at 65ef842, which reads link reference definitions
as CommonMark does. A `DocumentReader` written by hand for `buildContext`
adds one field.

### Changed

- spec-core at 65ef842. Its Markdown scanner reads link reference
  definitions as CommonMark does, and `context` includes the documents a
  brief cites by that reading:
  - A definition cannot interrupt a paragraph. `[r]: r.md` on the line under
    a paragraph's text, a block quote's lazy continuation line included, is
    that text, so `[r]` in the brief no longer cites `r.md`; a blank line
    above the definition has it read. A definition after a blank line or a
    heading, and one under such a definition, is read as before.
  - A label holds no unescaped bracket. `[[r]: r.md](z.md)` is a link to
    `z.md`, and cites it, where it was a definition and cited nothing. A
    label with an escaped bracket, `[a\]b]: x.md`, is now read.
  - A second bracket holding a bracket is no label, and the first is read
    as a shortcut: with `[r]` defined, `[r][a[b]c]` cites `r`'s destination,
    where it cited nothing.

### Fixed

- `context` says when a cited document's front matter opens on its first
  line and is never closed, where it showed the document as one without a
  status. spec-core's scanner reads such a block as no front matter, so the
  status its author wrote was never read. The packet now names the document
  under "Front matter opened on line 1 and never closed, so the status was
  not read; close the block with `---` on a line of its own", still includes
  it, and exits 0. `context --format json` and `start_round`'s structured
  result list such documents as `unclosedFrontMatter`, a field added beside
  `unresolved`, so no `schemaVersion` moves. In the programmatic API a
  cited document may carry `unclosedFrontMatter`, a context packet lists
  them, and a reader's `titleAndStatus` returns it: a reader written for
  `buildContext` by hand adds it. The reasoning is in
  [ADR-0001](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0001-the-harness-decides-the-agent-writes.md)'s
  amendment.
- An interrupted `probe` stops the commands it started before it removes
  their worktree. On Linux and macOS a probe's command runs in a process
  group of its own, so Ctrl+C never reached it: it ran on in a worktree
  removed from under it, and on Windows, where a running command holds its
  directory, the worktree could not be removed. On SIGINT, SIGTERM or SIGHUP,
  and when the process exits mid-probe, every running command is now stopped
  with everything it started, as its timeout stops it, and an interrupt waits
  up to three seconds for them to end before it removes the worktree. The
  reasoning is in
  [ADR-0003](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0003-state-outside-the-work-tree.md)'s
  amendment.
- A run ended by SIGHUP while it held a worktree, as when its terminal is
  closed, exits 129, as a shell reports a process SIGHUP ended, where it
  exited 143, SIGTERM's code. The code is 128 and the signal's number for
  each signal the sandbox handles: SIGINT 130 and SIGTERM 143, as before.
- An interrupted `probe` no longer prunes the repository's other
  worktrees. After removing its own worktree the sandbox ran `git worktree
  prune`, which forgets every worktree git has lost track of - one on a
  drive that is not mounted, or another tool's - and it did the same at the
  end of a probe whose command had deleted its worktree's `.git` file. It
  now deletes the worktree's directory and runs `git worktree remove
  --force` on that path, which forgets that worktree and no other. The
  reasoning is in
  [ADR-0003](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0003-state-outside-the-work-tree.md)'s
  amendment.

## 0.2.0

The Claude Code plugin and `init` no longer install the guard twice by
accident, and the Claude Code release the hooks need is stated: 2.1.139 or
later, the first that runs a hook's `args`. spec-core is at 119345e: a link
inside a link's text now counts only the inner link as a document the brief
cites.

### Changed

- spec-core at 119345e. Its Markdown scanner reads a link inside a link's
  text as CommonMark does: the inner link is the link, and the brackets
  around it and the destination after them are text. `context` now takes
  `[a [b](inner.md) c](outer.md)` as citing `inner.md` alone, where it
  included `outer.md` and never `inner.md`. A badge wrapped in a link still
  cites the link and never the image.
- A brief's pattern that writes `**` inside a name is still one the guard
  cannot read, and what it says of it now builds the advice from the pattern
  written: `docs/**.md` is told `docs/**/*.md` for any depth or `docs/*.md`
  for one level, and `src/a**` `src/a*/**` or `src/a*`, where every such
  pattern was told `docs/**/*.md` or `*.md`.
- `init` writes neither the guard hooks nor the server while Claude Code's
  spec-harness plugin is on. Claude Code runs a plugin's hooks beside the
  same hooks in settings, so with both every write was guarded twice and the
  server registered twice. `init` reads `enabledPlugins` from the user's, the
  project's and the local Claude Code settings as Claude Code merges them,
  plans `.claude/settings.json` and `.mcp.json` as `skip`, and says how to
  have its entries instead: `claude plugin disable spec-harness@spec-tools
  --scope local`, then `init` again. Where the plugin is on and a file
  already holds its entry, it says so and changes nothing.

### Added

- `doctor` says how Claude Code runs the guard - the plugin and the settings
  file that turns it on, `init`'s hooks and server, both, or neither - on a
  `claude` line, and as `claudeCode` in JSON. Both is a double install and
  exits 1, with how to keep one.
- The README and the plugin's manifest state the Claude Code release the
  hooks and the plugin's server need, 2.1.139 or later
  ([ADR-0012](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0012-one-way-into-claude-code.md)).

## 0.1.5

A packaging fix: the tarball no longer carries spec-core's internal README.
Nothing a command, hook or tool does has changed.

### Fixed

- **The package ships one README, its own.** `files` named `README.md`,
  which npm reads as a name at any depth, so the tarball carried spec-core's
  vendored README beside the licence it ships; the entry is `/README.md`.

## 0.1.4

spec-core at 8840d36. Its Markdown scanner now reads an image inside a
link's text, so a badge wrapped in a link gives two links, and makes the
parts of a scan a command may never ask for only when one asks. What the
commands print is unchanged: `context` includes the document a badge links
to, and never the badge.

### Changed

- spec-core at 8840d36. Its Markdown scanner reads an image inside a link's
  text, as CommonMark renders it, and lists it after the link it lies in:
  `[![build](badge.svg)](actions)` gives both, where the image went unread
  before. `context` takes the link around a badge as a document the brief
  cites and never the image, which is a picture on the page, not a document,
  and would otherwise show as a link that resolves to nothing.
- The scanner makes a document's links, list items and directives mask the
  first time they are read, and keeps them. The answers are the same.

## 0.1.3

spec-brief's archive is a gate from `init` onwards. 0.1.2's `init` named the
base in `.spec-harness.json` and left spec-brief's `archiving.base` at
`null`, and without a base spec-brief's archive checks no protected file: a
plain `spec-brief archive` warned that the scope went unmeasured and passed,
where `--base main` refused the file or waived it by a signed ruling. Found
by the end-to-end run of 0.1.2 from npm.

### Fixed

- `init` sets spec-brief's `archiving.base` to the base it names, beside the
  plugin, and keeps a base a person wrote. Running it again on a 0.1.2 setup
  adds the base.
- `list_rounds` leaves the id off each brief's structured `title`, as its
  text already did.
- `doctor` and `init` spell the allowed-signers line the same way.

## 0.1.2

A signed ruling now works from `init` onwards. An end-to-end check of 0.1.1
from npm, in a repository made with `git init`, could not finish the round
the README describes: `init` named no base and did not load the spec-brief
plugin, so no ruling verified, and spec-brief's archive refused the file a
person had allowed. After upgrading, run
`npx --no-install @descent-vtt/spec-harness init --write` again: it adds what
is missing and replaces the `npx` hooks and server 0.1 wrote.

### Fixed

- `init` loads this package's plugin in spec-brief's configuration,
  `"plugins": ["@descent-vtt/spec-harness/spec-brief-plugin"]`, in whichever
  file spec-brief reads. Without it, spec-brief's archive, and so `audit`,
  refused a protected file whatever ruling was signed. `doctor` says whether
  spec-brief loads the plugin, and `audit` gives it as the reason for such a
  refusal, where it passed on spec-brief's "record the departure in the
  brief".
- `init` names the base in `.spec-harness.json`: the remote's default branch
  where git recorded one, otherwise `main`, `master` or the only branch when
  `init` runs on it; otherwise it asks. git records a remote's default
  branch when it clones, and before 2.48 not on a fetch, so a repository
  made with `git init` and pushed to a remote often has none. 0.1 wrote `{}`
  there, and no command could verify a ruling. It adds the base to a configuration that names
  none. `doctor` shows the base, where it came from, and whether the
  allowed-signers file is on it.
- `guard`, `context` and the hooks honour `--base`, which they ignored. The
  MCP tools `check_path` and `start_round` take a `base` argument, as
  `audit_round` does.
- The plugin's MCP server and hooks, and those `init` writes, run `node`
  with `${CLAUDE_PROJECT_DIR}/node_modules/@descent-vtt/spec-harness/bin/spec-harness.js`.
  Claude Code starts a plugin's server in the plugin's directory, where
  the `npx` entry 0.1 wrote found no spec-harness, and on Windows
  starts a server without a shell, where `npx` cannot start at all. The
  server is told the project with `--root`, and reads `CLAUDE_PROJECT_DIR`
  when no root is named. Use the plugin or `init`'s hooks and server, not
  both.
- `context` says spec-guard holds no rule when no spec file matches its
  patterns, rather than that it could not read its specs, and passes on what
  spec-guard said when it could not.
- `premises` reports the premise of the brief a round works on as
  `premise-retired`, a note, as `audit` does, and no longer fails on the
  round's own branch.
- `init` says whether spec-graph's patterns reach the briefs, which its
  defaults do not in `briefs/`, and merges into the configuration spec-graph
  reads rather than shadowing `spec-graph.config.json` or a `"spec-graph"`
  key in `package.json`.
- A title written with an em dash after the id, as `spec-brief new` writes
  it, no longer repeats the id in `list_rounds` and `context`.
- The README's links to the ADRs work in `node_modules` and on npmjs.com.

### Changed

- The programmatic API exports `GUARD_HOOK`, the guard as a Claude Code
  hook, in place of `HOOK_COMMAND`, and `mcpServer`, `PROJECT_DIR` and
  `PROJECT_DIR_OR_HERE` for the server.

## 0.1.1

The same code as 0.1.0, built by CI from its tag and published with a
provenance attestation. 0.1.0 was published from a workstation by mistake, an
`npm publish` run in a checkout, so it has none; it is deprecated in favour
of this one, and nothing else changed between them.

- `npm publish` in a checkout now refuses to run outside GitHub Actions.
  CI never runs it: it stages a tarball it packed, with scripts off.

## 0.1.0

The first release of spec-harness, the agent-facing member of the spec-*
tools: what an agent needs to start a round of work under a brief a person
approved, a guard on every write, escalations a person rules on and signs, an
audit when the round ends, and probes that prove a defect before it is filed.
It calls no model and has no runtime dependencies. It needs spec-brief 0.2.0
or later, and uses spec-guard 0.12.0 and spec-graph 0.9.0 or later when they
are installed; an older one is reported with its minimum and never run.

This version was staged on npm by CI from its tag, with provenance, and
released by a maintainer with a second factor. 0.0.0 on npm is a placeholder
without code, published by hand to claim the name, and is deprecated
([ADR-0011](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0011-releases-are-staged-by-ci.md)).

### Added

- `context`: the brief in full, its scope as the guard reads it, signed
  rulings, dependencies, the rules spec-guard holds the scope to, and the
  documents the brief cites, within a budget.
- `guard` and `hook claude` / `hook git`: protected files refused unless a
  signed ruling allows them, writes outside the scope warned, asked about or
  refused; paths compared as the filesystem spells them.
- `escalate`, `rule`, `rulings`: requests kept outside the work tree; a ruling
  is a row in the brief that counts when the commit that last changed it is
  signed by a key the base branch's allowed signers list.
- `audit`: what spec-brief's archive would say, the brief's goals and
  premises through spec-guard, unverified rulings, and dependencies added.
- `probe`: a brief's declared probes run in temporary worktrees, red at the
  base for the declared reason and green at the head.
- `premises`: every live brief's premises run through spec-guard, and one
  that no longer holds reported as `stale-premise`, exit 1, for CI.
- `init`: the family configured to agree; a plan until `--write`.
- `doctor`: which siblings are installed, at which versions, and which brief
  is named. The minimums are `peerDependencies` too: spec-brief required,
  spec-graph and spec-guard optional.
- `mcp`: start_round, check_path, request_escalation, audit_round and
  list_rounds, with the workflow prompts, over both MCP protocol eras.
- Skills for Claude Code and other Agent Skills readers: draft-brief,
  split-goal, run-round, close-round; the repository is also a Claude Code
  plugin marketplace.
- spec-core at cbe2223, vendored with its licence, which the package ships.
  A scope that writes `**` inside a name (`docs/**.md`) is refused with the
  two ways to say what was meant, as spec-brief and spec-guard refuse it.
