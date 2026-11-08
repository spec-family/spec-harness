---
status: accepted
date: 2026-09-26
---

# ADR-0005: A guard is a guardrail; the audit and the archive are the gates

## Context

The plan intercepted an agent's writes by watching its output stream and
killing it on a violation. By the time a stream shows a write, the write has
happened. And an agent with a shell can write a file no tool-level hook sees.

## Decision

- **Before the write, in the agent's own hook.** `spec-harness hook claude`
  answers Claude Code's PreToolUse for Edit, Write, MultiEdit and
  NotebookEdit, reading the file from `file_path`, `path` or
  `notebook_path`. It refuses a protected file (`deny`, with the reason and
  the next step), may ask the person about a file outside the scope
  (`outOfScope: "ask"`), and otherwise says nothing. It never says `allow`:
  that would skip the person's own permission prompt.
- **After the write, a warning.** PostToolUse tells the model, as additional
  context, that it wrote outside the scope: informing, never unlocking.
- **At commit, for any agent or none.** `spec-harness hook git` is a
  pre-commit hook over the staged files.
- **Paths are compared as the filesystem spells them**: links resolved and,
  on a case-insensitive filesystem, the real case, so `SRC/db/schema.ts` does
  not walk past a protection on `src/db/schema.ts`.
- **The gates are elsewhere**: `audit` measures the whole round from its base,
  and spec-brief's `archive` refuses a round that changed a protected file.

*Amended 2026-09-30.* The audit says what it measured beside what it found.
spec-core's ADR-0005 holds that nothing measured is not clean, and the audit
reported only what failed. spec-guard lists an assertion it cannot read
apart from its results, as one of its `errors`; the audit read only the
results, so a brief whose assertions could not be read ran none of them and
passed. And a report with no finding could not be told from one that checked
nothing. Each assertion spec-guard cannot read is now `assertion-unreadable`,
a warning on its line with spec-guard's reason, which fails the audit under
`--strict` as every warning does. Beside the counts the audit reports
`measured`: whether the round's changes were measured from a base, whether
the archive answered and the assertions ran, the goals that held and
failed, the premises retired and still holding, the assertions that could
not be read, the rulings verified and not, and the dependencies changed and
the manifests that could not be read. A person reads it as one line above
the counts, which stay the last line, and `audit_round` says it too. A brief
that declares no assertion says `goals: none declared` and draws no warning:
a brief without assertions is a brief, the archive still measures its
round, and a warning on every such brief would be a false positive. The
field is added beside `counts`, so no `schemaVersion` moves.

*Amended 2026-09-30.* spec-core's ADR-0005 offers SARIF and GitHub
annotations where findings have places, and GitLab Code Quality as each tool
next touches its reporter. `audit` and `premises` take `--format gitlab`,
`sarif` and `github`; every other command prints pretty or json, and
refuses the three with exit 2, since its output has no places. The shapes
are the siblings'. An error is `major` in GitLab, a warning `minor` and a
note `info`, as in spec-brief, and each format carries the hint after the
message. A finding's fingerprint is the SHA-256 of its identity - the rule,
the file and its `subject`, the assertion, ruling, dependency or name it is
about - with a count for repeats, and never of its message or line, as in
spec-guard: GitLab compares fingerprints between a merge request and its
target, and a reworded message or a line added above would read as one
problem fixed and another found. A finding with no file is placed on the
brief, and one with no line on line 1. `subject` is a field of each finding
in `--format json` as well, added, so no `schemaVersion` moves.

*Amended 2026-09-30.* The guard at commit covers what the agent's hooks do
not, a write through a shell, and it was installed only when asked. init
now advises git's pre-commit hook when `--git-hook` is not given, and doctor
says whether it is installed. Both find it where git runs it from, as `git
rev-parse --path-format=absolute --git-path hooks/pre-commit` answers:
`core.hooksPath` relative to the work tree, absolute or under `~`, and the
shared hooks of a linked worktree. init joined `core.hooksPath` to the work
tree, which put the hook for an absolute or a `~` path where git never runs
it. No Bash hook looks for `--no-verify` or a shell's writes: every shell
command would pay for it, it is easy to get around, and the audit stays the
gate.

*Amended 2026-09-30.* `premises` reads spec-guard's errors as the audit now
does. A directive in a premise section that spec-guard cannot read was
dropped with the rest of its errors, so a brief whose premise nothing checks
passed for one whose premise holds, and CI said nothing. It is now
`assertion-unreadable`, the audit's warning, on its line with spec-guard's
reason, and `premises` fails on a warning under `--strict`, as the audit
does; without it, only a stale premise fails the run, as before. A directive
spec-guard cannot read outside the premise sections is a goal, the audit's
to report. The summary counts the premises that could not be read apart
from those checked, and `--format json` gains `unreadable`.

*Amended 2026-10-07.* The audit reports a package a round allowed to run
install scripts, as it reports a dependency a round added. npm 12 runs a
dependency's `preinstall`, `install` and `postinstall`, and `prepare` for one
that is not from a registry, only where the project's `package.json` allows
the package under `allowScripts`, where `npm install-scripts approve` and
`deny` write: a key that is a package, a package at exact versions joined by
`||`, or a git, file or tarball source, to `true` or `false`, a denial
winning over an approval. The audit read the four dependency sections alone,
so a round could add the one line that runs a dependency's code on every
contributor's machine and in CI, code that is in no diff, and the audit said
nothing. It now reads the field in each `package.json` that
`dependencies.manifests` names and the round changed, as npm reads it: an
entry is its key as written and `true` or `false`, any other value is no
entry, and a field that is not an object holds none. An approval the round
added, or turned from a denial, is `install-script-allowed`, a warning that
fails `--strict`, which no ruling covers, as `new-dependency` is. A denial
is `install-script-denied` and a removed entry
`install-script-entry-removed`, notes as `dependency-removed` is: a denial
and a removed approval stop a script, and a removed denial approves nothing
by itself. Where an approval of the same package stood beside the denial,
npm honours it again; npm's own commands never leave the two together, and
the note on the denial is what the audit says of it. A key is not parsed.
npm pins an approval to the version a person reviewed, so `canvas@3.2.0`
beside a removed `canvas@3.1.0` is a new approval and a removed entry, not
a version moved; and telling an exact version from the range or the
dist-tag npm passes over is npm's reading of a package spec, which the
audit does not copy. `--format json` lists the entries as `installScripts`
and counts them in `measured`, apart from the dependencies, and the line a
person reads says so only when a policy changed. Both are added, so no
`schemaVersion` moves.

What else grants the same, and is not read:

- **`.npmrc`.** npm takes `allow-scripts` from it when `package.json` has
  no entry, and `dangerously-allow-all-scripts` whenever it is set. It is not
  a manifest, and `dependencies.manifests` names none. The lockfile holds no
  approval.
- **pnpm.** pnpm 11 and 12 keep their approvals as `allowBuilds` in
  `pnpm-workspace.yaml`, where pnpm also writes a placeholder for each build
  it ignored, and read no setting from the `pnpm` field of `package.json`.
  That is YAML, a reader the harness does not have. The
  `pnpm.onlyBuiltDependencies` pnpm 10 read from `package.json` is an
  approval under that major and nothing under the two after it, so the
  manifest alone does not say whether an entry there grants anything.
- **Bun and Yarn.** Bun's `trustedDependencies` replaces a list built into
  Bun, and Yarn's `dependenciesMeta` allows a build only where
  `.yarnrc.yml` turns scripts off. What an entry of either grants is not in
  the manifest, and neither was run here.
- **The root package's own `preinstall`, `install`, `postinstall` and
  `prepare`.** They run on every install too. But they are the repository's
  commands, written in the round's diff for a reviewer to read, where an
  approval is one line that turns on code no diff holds. `prepare` is where
  a package builds, so it changes in ordinary rounds, and a script that runs
  `npm run build` changes what it runs without changing. A brief that must
  keep them protects `package.json`, which the guard and the archive hold.

*Amended 2026-10-08.* An error the harness did not expect is exit 2, from
the hook as from every command. `run` named the errors it expects (a usage
mistake, a configuration that does not load, a sibling missing or
unreadable) and threw any other again, and the launcher's
`process.exitCode = await cli.main()` left that to Node: the stack and exit
code 1. Exit 1 is "refused or found something" to a script, and to Claude Code a
PreToolUse hook that failed without blocking, so the write the guard could
not check went ahead (ADR-0012). Measured on 0.10.1 through the launcher,
with a stdout that throws: `--version`, `--help`, `doctor`, `guard`,
`escalate --list` and `init` each exited 1. Such an error is now
`spec-harness: unexpected error:` and the stack on stderr, so that a report
of it says where, nothing on stdout for it, and exit 2: the answer cannot be
trusted (spec-core's ADR-0005), and before a write the write waits, as it
does when the guard cannot read the briefs. After a write there is nothing
to hold, and the hook exits 2 all the same, as it did for an error it
expects. The launcher answers the same way an error nothing awaits - a
stream's, a timer's, a child process's - which never reaches `run`.

What the hook already answered its own way is as it was: a question that is
not JSON or names no event is exit 1, refusing nothing it cannot see, and
so is one that could not be read from its input at all, which has no event
to hold a write by; a
session outside a git work tree is exit 0; and a check before a write that
fails says `cannot check this write`, with exit 2. The server answers a
request that fails with an error for that request and serves the next. A
caller of `run` or `main` from the package gets 2 where it got a rejection.

*Amended again 2026-10-08.* An exit 2 the harness could foresee says so in a
line. The amendment above printed two things as `unexpected error:` with a
stack that are no defect of the harness's, and a stack sends a person looking
for one. Measured on 0.11.0 through the launcher (Windows 11, Node 24.18.1):

- **A reader that closed the output.** `spec-harness --help` into a reader
  that had already left printed `spec-harness: unexpected error: Error:
  EPIPE: broken pipe, write` and eight lines of stack, exit 2; so did
  `doctor`, `guard`, `escalate --list` and `init`, and the server at the
  first answer it could not write. It is now one line,
  `spec-harness: stdout was closed before all of the output was written`, in
  the words every tool of the family uses (spec-core's ADR-0005), and exit 2
  as before: the answer did not arrive. Every time, it arrived as the
  stream's `error` event, which nothing awaits, and never as an error thrown
  where `run` awaits: so the launcher answers it, and `run` answers in the
  same words where a write does throw it, as a caller's own stream may. It
  is told from every other error by its code, `EPIPE`: stdout and stderr are
  the only pipes the harness writes to. When stderr is the one that closed
  there is nowhere left to say anything: nothing is written, to stdout
  either, and the exit is 2. A write that fails for another reason, a full
  disk, keeps `unexpected error:` and its stack. A hook's answer before a
  write is as it was: a check that fails for any reason, this one included,
  says `cannot check this write`, exit 2, and the write waits.
- **A git command that failed.** `hook git` in a repository whose index git
  could not read printed `spec-harness: unexpected error: GitError: git diff
  --cached failed: fatal: .git/index: index file smaller than expected` and
  a stack. `GitError` is the harness's own error, with a message written
  for a person, and `run` now names it with the others it expects: the
  message alone, `spec-harness: git diff --cached failed: fatal: ...`, exit
  2. So for the diff `audit` reads and the worktree `probe` adds.

*Amended 2026-10-09.* An input that is set and names nothing is refused,
not read as if it had not been given (spec-core's ADR-0005, amended the same
day). The command line had one table of options for every command, and
nothing asked whether what the parser took named anything. Measured on
0.11.1 through the launcher, each of these ran as if the input were not
there, exit 0 unless said:

- **An option another command reads.** `doctor --note x`, `doctor --id ""`,
  `init --base nowhere`, `mcp --brief 999`, `hook git --strict`: every
  command took all eighteen options, and did nothing with those it does not
  read.
- **An argument no command asked for.** `doctor extra`, `init mydir`, which
  set up the directory it stood in, `premises extra`, `mcp extra`, and a
  second argument to `context`, `rulings`, `audit`, `probe` and `rule`.
- **An option given an empty value.** `--root ""` ran in the current
  directory; `--brief ""` was the branch's brief (ADR-0004); `audit --base
  ""` was an audit that measured no change, with a warning; `escalate`
  wrote the empty value into its memo (ADR-0006). `probe --id ""` and
  `escalate --show ""` were exit 2 in words that named no option.
- **An empty argument.** `guard src/a.ts ""` judged the empty path as the
  repository itself, and `context ""` was the branch's brief.

Each is now exit 2 and one line on stderr that names the input, shows what
it holds and says what to do, before the command reads or writes anything:

- A command has a shape: the options it reads and the arguments it takes
  (`src/usage.ts`, and the README's table). An option is a command's only
  where its answer depends on it. `init` chooses the base itself and the
  server is told the brief and the base by each call, so neither takes
  `--base` or `--brief`: taking one would tell someone the base or the
  brief had been set. An option a command does not read is refused by name,
  with those it does read, and an argument it does not take with what it
  takes.
- An option that takes a value refuses one that is empty or only space, by
  the option's name, the value shown as JSON, where a tab can be seen. No
  option gives emptiness a meaning, so there is no exception among them.
  `--format`, `--at` and `rule`'s `--note` were refused already, each in
  its own words, and keep them. An argument that names nothing is refused
  the same way.
- A `--root` that is a file, or is not there, was exit 2 already, in words
  that named a git work tree and not the option. It is refused by name.
- A `.spec-harness.json` that is a directory was refused in Node's words,
  `is not valid JSON: EISDIR`. It says `is a directory, not a configuration
  file`.
- `--help` and `--version` answer whatever else is on the line: asked for
  the help, a run answers nothing else that could be mistaken.
- The server answers a tool call that holds such an argument with a tool
  error that names it, `"brief" is "", which names no brief`, and serves
  the next: an empty `brief` or `base`, an empty place in `paths`, an empty
  `recommendation`, an option without a label (ADR-0006). It refused an
  argument a tool does not take, and one of the wrong type, already.

**`hook claude` is exempt, and reads its line as every release has.** The
line is in `.claude/settings.json` and in the plugin of every release since
0.1.0, which a later release cannot rewrite, and Claude Code holds a tool
call on a PreToolUse hook's exit 2: a refusal of something on that line
would hold every write of a session, the write that mends the line among
them, for the sake of an option that had done no harm. So whatever is on
its line beside `hook claude` is passed over as it was, an empty `--brief`
or `--root` included, and the hook keeps the answers the amendments above
give it: exit 1 for a question it cannot read, exit 0 outside a git work
tree, exit 2 for a brief that is named and is not one, and exit 2 for an
option no command has, which the parser refused before this. What the
releases wrote on that line is `hook claude` and nothing else (ADR-0012).

`hook git` is held to the rule. It stops one commit with a line a person
reads, who can then mend the hook, and the releases wrote `hook git` and
nothing after it. `doctor` is a diagnosis: it refuses what any command
refuses, but an empty `--brief` or `--base` it says in its report, as it
says a base that names no commit (ADR-0004).

Each refusal is input refused that was accepted, a minor release (spec-core's
ADR-0009). What was found and left as it was:

- `--base` naming no commit is said where it matters and stops nothing but
  `probe`: a warning in `audit`, a ruling not verified in `rulings` and the
  guard, a line of `doctor`'s report.
- `escalate --list` and `--show` pass over the options of a request given
  beside them, and `premises` reads a `--brief` spec-brief does not know as
  no round.
- A brief given as an argument and by `--brief` at once is the argument's.

*Amended 2026-10-11.* A `--root` on the line of Claude Code's hook that is
not a directory is said, with exit 1, and refuses nothing. The amendment
above left `hook claude` out of every refusal, and the hook went on to open
its root as before. git starts in neither a file nor a directory that is not
there, and the hook read that as a session outside a git work tree, where it
has nothing to guard and says nothing. Measured on 0.12.0 through the
launcher (Windows 11, Node 24.18.1, git 2.55), before a write to a file the
brief protects: `hook claude --root <not there>`, `--root <a file>` and
`--root " "` each exited 0 with nothing on either stream, and so did each
after a write. A root that was written on the hook's line and is not there
is a guard that was set up and is off, and nothing told anyone.

It is now exit 1 and one line on stderr:

    spec-harness: --root is "nowhere", which is not a directory, so the guard is off and this write is not checked; give the hook's line a directory that exists, or leave --root out for the project Claude Code names

- **Exit 1, as for a question the hook cannot read.** Claude Code's hooks
  reference (<https://code.claude.com/docs/en/hooks>, *Other exit codes*,
  read 2026-10-11) has a hook that exits with a code other than 0 or 2, and
  prints plain text or nothing on stdout, as a non-blocking error, of which
  it says under *Exit code output*: "The action goes ahead". (This sentence
  first carried a paraphrase between quotation marks; the words are now the
  page's.) The transcript then shows a hook error with the first
  line of the hook's stderr, which is why the line is one line. Its table
  of what blocks gives a PreToolUse hook no blocking code but 2 and a
  PostToolUse hook none, so the write goes on and the person is told.
  Exit 0 would not tell them: the same page sends the stderr of a hook
  that exits 0 to the debug log alone. Exit 2 would hold every write of the
  session, the one that mends the line among them, which is why the hook is
  exempt in the first place.
- **Said where there is a write to check, before a write and after one.** A
  question that cannot be read or parsed is said first, as it was, and a
  tool that writes no file is answered with nothing, exit 0, as it was.
  Whatever else stands on the line, a brief that is not one included, the
  root is said and the exit is 1: no brief is read without a root, and
  `--root <not there> --brief 404` is no decision to hold a write.
- **Not an empty root, and not a directory that is no work tree.**
  `--root ""` is the directory the hook was started in: git starts there
  when it is handed no directory, and the hook has guarded there for one in
  every release (measured: the write is refused). It still does, and the
  hook now names that directory itself. A root that is a directory outside
  any work tree is a session outside one, exit 0 and no word, as before.
- **No line a release wrote meets it.** Read from the tags v0.1.0 to
  v0.12.0, the hook's line is `hook claude` and nothing after it in every
  release, in `.claude/settings.json` and in the plugin. `--root` stands
  only on the server's lines (ADR-0012), and
  `tests/integration/released-lines.test.ts` holds that no hook's line
  carries one. A root on that line is one a person wrote.

Three things the amendment of 2026-10-09 found and left are refused now,
each exit 2 and one line, by every command but `hook claude`, which passes
over them as it passes over the rest: an option beside `escalate --list` or
`--show` that neither reads (ADR-0006), a brief that `premises` is given and
spec-brief does not know, and a brief given as the argument and as `--brief`
at once (both ADR-0004). Each is input refused that was accepted, or an exit
code that changed: a minor release (spec-core's ADR-0009).

What was measured for this and left as it was:

- **The `cwd` of the hook's question.** The hook reads it: as the root, when
  neither `--root` nor `CLAUDE_PROJECT_DIR` names one, and as the directory
  a relative path is read from. Claude Code sets `CLAUDE_PROJECT_DIR` for
  every hook it runs, and with it a `cwd` that is not there changes
  nothing: the write is checked against the project, for an absolute path
  and for a relative one. Without the variable, a `cwd` that is not there is
  exit 0 and no word, and so is a `CLAUDE_PROJECT_DIR` that is not there.
  Neither is written on a line. The first arrives with every question, and
  a project that is gone takes the hook's script with it, so node has
  nothing to start and Claude Code reports that.
- **`doctor` and an installed hook's line.** `doctor` knows a hook as the
  harness's only where its command and arguments are exactly those `init`
  writes, or the line 0.1 wrote. A line with anything added by hand, a
  `--root` that is there as much as one that is not, is to `doctor` no guard
  at all: `neither the spec-harness plugin nor the hooks init writes, so
  Claude Code guards no write`. It reads no argument of a hook's line, so it
  has nowhere to say a root's problem, and is left alone.
- **`hook git` with nothing staged** asks which brief of nobody, and exits 0
  for a brief that is not one: a commit that stages nothing changes nothing
  to check.
- **The hook's other exits of 2** are what they were: a brief that is named
  and is not one, a check that could not be made, an error nothing
  expected, and a line the parser cannot read, such as an option no command
  has or `--root` with no value after it.

*Amended again 2026-10-11.* A line Claude Code's hook cannot read is said,
with exit 1, and holds no write. The amendment above left it among the
hook's exits of 2: the parser refuses a line before any command is known, so
`hook claude` was refused as every command is. Measured on 0.13.0 through
the launcher (Windows 11, Node 24.18.1, git 2.55), before a write to a file
the brief protects and after a write outside its scope, each of these was
exit 2, the parser's words on stderr, and the question never read:

- an option no command has, long or short, with a value or without:
  `--nope`, `--nope=value`, `-x`, and the same before `hook` or between
  `hook` and `claude`;
- an option left without its value: `--root` or `--brief` at the end of the
  line, as `--root $DIR` is in a shell where the variable is not set, and
  `--root --brief 001`, which node says in three lines;
- a value given to an option that takes none, `--strict=yes`;
- a `--format` that is none, or one of the three the hook has no use for,
  and an `--at` that is none: `--format xml`, `--format ""`, `--format
  gitlab`, `--at sideways`.

That is the line the amendment of 2026-10-09 exempted, in the same settings
file, holding the same writes, the one that mends it among them. Each is now
exit 1 and one line on stderr:

    spec-harness: the hook's line cannot be read (Option '--root <value>' argument missing), so the guard is off and this write is not checked; mend it in Claude Code's settings, where init writes "hook claude" and nothing after it

- **Exit 1, by Claude Code's hooks reference as it reads today.** The page
  (<https://code.claude.com/docs/en/hooks>, *Exit code output*, read
  2026-10-11) names a hook that exits with any code but 0 and 2 a
  non-blocking error, and says of one: "The action goes ahead". The table
  under the same heading has the notice in the transcript carry the first
  line of the hook's stderr where its stdout holds no JSON, so the parser's
  words are put on one line, between brackets, with what follows from them
  and what to do after. After a write there is nothing to hold either way:
  the page shows the stderr of a PostToolUse hook's exit 2 to the model,
  and the first line of that of its exit 1 to the person.
- **A hook entry can ask Claude Code to hold the write all the same.** The
  page documents `onFailure` on a hook's entry, read by Claude Code 2.1.295
  and later: set to `"block"`, a hook that fails, by an exit code other than
  0 and 2 among other ways, does what exit 2 does on its event. Neither
  `init` nor the plugin writes the field. Where a person has set it, the
  hook's exit 1 holds the write, for its line as for a question it cannot
  read, which is what the field asks for.
- **Said where a root that is not there is said.** A question that cannot
  be read or parsed is said first, a tool that writes no file is answered
  with nothing, exit 0, and then the line is said, before a write and after
  one. Whatever else stands on it, or names the brief, the exit is 1:
  `--brief 404 --nope`, and `--nope` under `SPEC_BRIEF=404`, name no round,
  since nothing is read from a line that cannot be read.
- **Whose line it is, where the parser gave no command.** The line is read
  a second time with nothing refused, by the same table of options, so that
  a value is not taken for the command it stands before: an option no
  command has is passed over, and one left without its value takes none.
  Only the command and the argument after it are read from that, and no
  value: `hook` and `claude`, as on a line that parsed. A line that does
  not say so is nobody's, and is exit 2 as it was: `hook` alone, `hook
  claud`, `hook --brief claude --nope`, where the word is the brief's
  value.
- **Exit 2 from the hook is for a write it could not check**, and for
  nothing on its own line that it cannot read: a configuration that does
  not load, briefs that cannot be read, an error nothing expected, and a
  brief that is named and is not one. The last may stand on the line,
  `--brief 404`. That line is read, and what it names is missing from the
  repository, as it is when `SPEC_BRIEF` or the branch names it (ADR-0004):
  it holds the write as it did.
- **`hook git` is left as it is.** Measured with a protected file staged:
  `hook git --nope`, `--root` with no value, `--format xml`, `--at
  sideways`, `--strict`, an argument after `git`, a `--root` that is empty
  or not there, and `--brief 404` are each exit 2 and one line that names
  the fault, three for the option that may have lost its value, and git
  stops the commit. A pre-commit hook stops one commit in front of the
  person who made it, who reads the line and mends the hook; nothing there
  waits on a write the hook itself would have to allow.
- **No line a release wrote meets it.** 0.13.0 wrote the lines 0.12.0 wrote
  (ADR-0012), `hook claude` and nothing after it, and
  `tests/integration/released-lines.test.ts` holds each of the five lines
  the releases hand the harness to the command, the argument and the root
  it is read as.

An exit code that changed is a minor release (spec-core's ADR-0009). What
was measured for this and left as it was:

- **`--help` and `--version` on the hook's line** answer as they do on every
  line, `-h` and `-v` too: the help or the version on stdout, exit 0, and no
  write checked. Claude Code takes that for a hook that succeeded, so
  nothing in the transcript says the guard is off. A person who asks the
  hook for its help at a terminal is answered the same way, and the harness
  cannot tell the two apart without waiting for a question that never comes
  at a terminal. No release wrote either on the line.
- **An option given twice** is read as its last value, which is the
  parser's reading for every command: `--root a --root b` is `b`, and
  `--brief 404 --brief 001` is brief 001.
- **A hook that is not named** on its line, `hook` alone or a word that is
  neither `claude` nor `git`, is exit 2 from a settings file as from a
  terminal.

*Amended 2026-10-12.* `doctor` reads the line of Claude Code's hook as the
hook reads it. The amendment of 2026-10-11 found that `doctor` knew a hook
as the harness's only where its command and arguments were exactly those
`init` writes, or the line 0.1 wrote, and left it. Measured on 0.14.0
through the launcher (Windows 11, Node 24.18.1, git 2.55), in a repository
with a brief that protects a file: each line written into
`.claude/settings.json` under both events, `doctor` run there, and the
hook handed the words Claude Code hands it for that line, before a write to
the protected file. "No guard" is `doctor`'s `neither the spec-harness
plugin nor the hooks init writes, so Claude Code guards no write`.

| What follows the harness's command | The hook, before the write | `doctor` on 0.14.0 | `doctor` now |
| --- | --- | --- | --- |
| `hook claude`, as 0.1.2 to 0.14.0 write it, and as 0.1 wrote it | refuses the write | init's entries, exit 0 | the same |
| `hook claude`, the script named without the placeholder, or today's line written for a shell | refuses the write | no guard, exit 0 | init's entries, exit 0 |
| `hook claude --root ${CLAUDE_PROJECT_DIR}` | refuses the write | no guard, exit 0 | init's entries; the line, and that it guards; exit 0 |
| `--brief 001`, `--base main`, `--strict --format json`, or an argument after `claude` | refuses the write | no guard, exit 0 | init's entries; the line, and that it guards; exit 0 |
| `--root ""` | refuses the write, from the directory it was started in | no guard, exit 0 | init's entries; the line, and that it guards; exit 0 |
| `--nope`, `--root` with no value, `--format xml` | exit 1, the line cannot be read, and the write goes on | no guard, exit 0 | the guard is off, in the hook's words; exit 1 |
| `--root` a file, or a directory that is not there, written out or under the placeholder | exit 1, not a directory, and the write goes on | no guard, exit 0 | the guard is off, in the hook's words; exit 1 |
| `--brief 404` | exit 2, and the write is held | no guard, exit 0 | init's entries; the line, and that it guards; exit 0 |
| `hook claude` with `"onFailure": "block"` on its entry | refuses the write | init's entries, exit 0 | the same, and a note on the field |
| a shell's line with `--root "${CLAUDE_PROJECT_DIR}"` after `hook claude` | refuses the write | no guard, exit 0 | cannot tell; exit 0, and 1 under `--strict` |
| the same script with `hook git` or `guard`, and another program's hook | not Claude Code's hook | no guard, exit 0 | the same |

It was the same in `.claude/settings.local.json` and in the user's
settings. So a line a person had added `--root ${CLAUDE_PROJECT_DIR}` to,
which guards, was reported as no guard at all; a line that turns the guard
off was reported in the same words, with exit 0; and beside the plugin
neither was the double install it is.

- **Known by its command and the words `hook claude`.** A hook's entry
  runs the harness where a word of its line is `spec-harness` or
  `spec-harness.js`, alone or at the end of a path: the script by any
  path, the name as `npx` is given it, the package's scoped name. What
  follows that word is the line the harness is handed. It is Claude Code's
  hook where the command line would take it for one: read by the parser
  every line is read by, `hook` its command and `claude` the argument
  after it, on a line that parsed and on one that did not, so an option
  before the two words, or between them, leaves it the hook's line here as
  it does when the hook is started. The same script under `hook git`,
  `guard` or `mcp` is another command's line, and is not reported.
- **Read by the hook's own code.** What the hook does with its line, as far
  as the line decides it, is three functions of `src/usage.ts`: a line the
  parser refused, a line that parsed and the root it gives, and the two
  behind the parser. `hook claude` itself now answers through the first
  two, where it held the same lines of code in the command line, and
  `doctor` reads a line it finds through the third. There is no second
  reading to drift from the first, and a test runs the hook on the words of
  a line and holds `doctor` to its answer: a write refused where `doctor`
  says the line guards, and the hook's own sentence, to the word, where it
  says the guard is off.
- **As a session started at the root hands it over.** Claude Code fills
  `${CLAUDE_PROJECT_DIR}` in a hook's command and arguments with the
  project root where the session started (its hooks reference,
  <https://code.claude.com/docs/en/hooks>, *Reference scripts by path*,
  read 2026-10-12), and `doctor` fills it with the root it runs in. An
  empty `--root` is the directory the hook is started in, which is there,
  and a relative one is read from the root. A session started in a
  subdirectory, or one that has changed directory, can hand the hook
  another path than `doctor` read; a line that names its root by the
  placeholder or by an absolute path is read the same from anywhere.
- **Guards, off, or cannot tell.** A line that guards and holds no more
  than a release wrote is reported with nothing to say of it, as it was. A
  line that guards with more on it is said as it is, with its root where it
  gives one, and fails nothing. A line the hook cannot read, and a root that
  is a file or is not there, are said in the hook's words for them, as a
  guard that is off, and `doctor` exits 1: a guard someone set up, which
  checks no write, is what a diagnosis is run to find.
- **A shell's line is read only as far as it can be.** A hook with no
  `args` is handed to a shell, which splits it, expands its variables and
  drops its quotes before the harness sees a word (the reference, *Exec
  form and shell form*). The line 0.1 wrote is such a line, and holds
  nothing a shell changes: it is split at its spaces and read. Where what
  follows the command holds a quote, a variable or anything else a shell
  rewrites, only the shell can say what the hook is handed, and `doctor`
  does not guess: the line is known as the guard, reported as *cannot
  tell*, never as fine, and `--strict` fails it, as it fails a Claude Code
  whose release cannot be told (ADR-0012). The decision was to say of every
  line what the hook would do with it; for these lines that would take a
  second reading of a shell's syntax, and the note says how to write the
  line so that it is read: with `args`, where each word reaches the hook
  as it stands.
- **`onFailure` is said in a note.** The reference has the field on a
  command hook's entry, `"continue"` by default, read by Claude Code
  2.1.295 and later, and says of `"block"`: "a failure does what exit code
  2 does on that event" (*Block the action when a hook fails*, read
  2026-10-12). Among the failures it lists are a hook that cannot start,
  one that reaches its timeout, and an exit code other than 0 and 2. So
  with the field set, the hook's exit 1 holds a write before it: for a
  question it cannot read, and for a line of its own that turns the guard
  off, which is then every write of the session, the one that mends the
  line among them. The note says which of the two the line is. It fails
  nothing: the field is a person's choice, and `doctor` exits 1 for the
  line that is off with it or without it. After a write there is nothing
  to hold either way.
- **`--format json` has each line** as `claudeCode.lines`: the file, the
  events, the line as written, its state, `onFailure`, and what is said of
  it. The field is added, so no `schemaVersion` moves.
- **No line a release wrote is read another way.** The hook's lines of
  0.1.0 to 0.14.0 are `hook claude` and nothing after it, and
  `tests/integration/released-lines.test.ts` holds `doctor` to reporting
  each as the guard with nothing more to say.

An exit code that can change for a tree that passed is a minor release
(spec-core's ADR-0009). What was measured for this and left as it was:

- **A `--brief` on the line that names no brief.** The hook holds every
  write for it, exit 2, and `doctor` says of the line that it guards: it
  reads the line, and asks spec-brief only about the brief it is given
  itself. The brief `doctor` reports is the one its own flag,
  `SPEC_BRIEF` or the branch names.
- **The plugin's own hooks.** `doctor` reads `enabledPlugins` and no line
  of the plugin's `hooks/hooks.json`, which is a release's file in a
  directory Claude Code keeps.
- **`init` knows only the lines it and 0.1 wrote.** Beside a hook written
  another way it adds its own, and the file then holds two lines that both
  guard, which `doctor` lists and does not count as the double install it
  is; beside the plugin, `init` reports `skip` for such a file where
  `doctor` exits 1 for the double install.
- **What else on an entry decides whether the hook runs**: its `matcher`,
  an `if`, `async`, the event it stands under, `disableAllHooks`. None
  is read. A line under PreToolUse alone, or PostToolUse alone, is named
  with its event.

*Amended again 2026-10-12.* `doctor` says a brief on the hook's line that is
not one, reads the event and the matcher of each entry, and `init` knows the
hook as `doctor` does. The amendment above measured four things and left
them. Measured again on 0.15.0 through the launcher (Windows 11, Node
24.18.1, git 2.55), in a repository with a brief that protects a file, with
spec-brief 0.8.0 and spec-guard 0.23.0 installed in it: each entry written
into `.claude/settings.json`, under both events with the matcher `init`
writes unless the row says otherwise, `doctor` and `init --write` run
there, and the hook handed the words Claude Code hands it for the line
before a write to the protected file.

| What the settings hold | The hook, before the write | `doctor` on 0.15.0 | `init --write` on 0.15.0 | `doctor` now | `init --write` now |
| --- | --- | --- | --- | --- | --- |
| `hook claude --brief 404`, or a brief spec-brief has archived | exit 2: the write is held, and every write after it | the line, and that it guards; exit 0 | adds its own line beside it | the line holds every write, in the hook's words for the name; exit 1 | `advise`, in the same words; writes nothing |
| `--root ${CLAUDE_PROJECT_DIR}`, `--brief 001`, the script named without the placeholder, today's line written for a shell | refuses the write | init's entries; exit 0 | adds its own line beside it, and both run for every write | the same | `keep`, with the line it left and why where doctor has something to say of it; writes nothing |
| `--root ${CLAUDE_PROJECT_DIR}`, with the plugin on | refuses the write | the double install; exit 1 | `skip`: the plugin brings the hooks, so init writes none | the same | `advise`: the double install |
| `--nope`, `--root nowhere` | exit 1, and the write goes on | the guard is off; exit 1 | adds its own line beside it | the same | `advise`, in doctor's words; writes nothing |
| init's line under `PostToolUse` alone | not asked before a write | init's entries, and no word of the event; exit 0 | adds its line under `PreToolUse` | the line is waited on before no write, so it is not the guard; exit 0 | the same as on 0.15.0 |
| init's line under the matcher `Bash` | not asked for a write | init's entries; exit 0 | `keep`: the guard hooks are installed | no guard, and the line said with its matcher; exit 0 | writes its hooks beside the line, and says which it left |
| the same, with the plugin on | not asked for a write | the double install; exit 1 | `advise`: the double install | the plugin alone is the guard, and the line said; exit 0 | `skip` |
| init's line under the matcher `Write\|Edit` | asked before a write by Edit or Write | init's entries; exit 0 | `keep` | guards a write by Edit and Write, and names MultiEdit and NotebookEdit as unchecked; exit 0 | `keep`, saying the same |
| init's line with `"async": true` on its entry | started, and not waited on | init's entries; exit 0 | `keep` | waited on before no write, so not the guard; exit 0 | writes its line under `PreToolUse` |
| init's line with an `if` on its entry | asked for the calls the rule matches | init's entries; exit 0 | `keep` | cannot tell which writes; exit 0, and 1 under `--strict` | `keep`, saying the same |

So `doctor` said that a line guards under which every write was held; one
settings file came to hold two lines that both run; `init` said it wrote no
hook, for the plugin's sake, into a file that held one; and a line Claude
Code never starts before a write was reported as the guard.

- **A brief on the line that is not one holds every write, and is said so.**
  The hook reads `--brief` from its line, asks spec-brief which brief the
  name is, and holds the write under a name spec-brief does not know or has
  archived, exit 2 (ADR-0004). `doctor` read the line and asked nothing.
  The hook's reading of its line now says which brief a line that guards
  names (`claudeHookLine`, `src/usage.ts`), and `doctor` asks spec-brief
  about that name as the hook does: in the work tree the line's root is in,
  through the functions the hook asks through. A name that is no brief is
  said in the words the hook holds the write with, `the flag names brief
  404, and spec-brief knows no such brief`, as a line that holds every
  write until it is mended, and `doctor` exits 1: the guard someone set up
  stops all work, which is what a diagnosis is run to find. The hook says
  its own sentence through the same function (`heldHookLine`), and a test
  runs the hook on the line and holds `doctor` to its words and to exit 2.
  An empty `--brief` is passed over by the hook, and so names nothing here.
- **An entry is read with its event and its matcher, by Claude Code's hooks
  reference as read on 2026-10-12** (<https://code.claude.com/docs/en/hooks>,
  *Hook lifecycle* and *Matcher patterns*). Of the two events the hook
  answers, the page has `PreToolUse` run before a tool call, where a hook
  can block it, and `PostToolUse` after a call that succeeded. A group's
  matcher is tested against the tool's name: left out, empty or `*` it
  matches every tool; made of letters, digits, `_`, `-`, spaces, `,` and
  `|` alone it is the names it lists, each matched exactly; and with any
  other character in it, it is a "JavaScript regular expression,
  unanchored", so `Edit.*` matches `NotebookEdit` as well. The tools a line
  is read for are the four the hook reads a file from, `Edit`, `Write`,
  `MultiEdit` and `NotebookEdit` (`src/hooks.ts`), which is the matcher
  every release wrote.
- **A line Claude Code waits on before no write is not the guard**,
  whatever the hook would do with it: under `PostToolUse` alone, or under a
  matcher that names none of the four tools. `doctor` says so, with what
  the line stands under, and a settings file whose only line is started
  for no write, before one or after, is not counted among `init`'s entries:
  alone it is no guard, as `doctor` then reports, and beside the plugin it
  doubles nothing. It fails nothing: no guard is a choice (ADR-0012). A
  line the hook cannot read is still said as off, wherever it stands: it
  fails after every write it is started for.
- **A line waited on before some of the four tools guards those**, and
  `doctor` names the rest, whose writes go unchecked, and the tools it is
  started after. It fails nothing: `Edit|Write` is the matcher the
  reference itself gives as its example, and a person may have chosen it.
- **A hook in the background refuses nothing.** The reference has an entry
  with `async` or `asyncRewake` set run in the background, where Claude
  Code does not wait for it and takes no decision from it (*Run hooks in
  the background*). Before a write such an entry is waited on for nothing,
  and is read so. After a write it still tells the model, on the next turn.
- **`if` is not read, and is said as cannot tell.** The reference has an
  entry with an `if` start only for the tool calls its rule matches, a rule
  written in the syntax of a permission rule, which is another page's and
  is not read here. So which writes such a line is asked on is *cannot
  tell*: never reported as fine, and a failure under `--strict`, as a line
  only a shell can read is. So is a matcher that is not text, or is no
  pattern, of which the reference says nothing.
- **A matcher that is a pattern is read within a budget.** A matcher is a
  line of a settings file, which arrives with a clone, and a pattern can be
  written that a test of four short names never finishes. Measured on Node
  24.18.1 against the four tools' names: `^((([A-Za-z]*)*)*)*$X`, three
  stars each around the last, took 208 ms, four took 4,047, and five ran
  for more than ten seconds and was stopped. Read as written, one such
  entry beside the hook's line and neither `doctor` nor `init` would come
  back, with no word. So a pattern is made and tested in a context of its
  own (`node:vm`), whose run takes a timeout where a test in the
  process's own context takes none, and is stopped after 100 ms. A
  reading that runs out its budget is *cannot tell*, as a matcher that is
  no pattern is: said with the matcher, never fine, a failure under
  `--strict`, and taken by `init` as a line that is started, beside which
  it writes none. The budget is of the clock, so a
  machine under load may answer *cannot tell* for a matcher an idle one
  reads. No matcher of a sane size comes near it: `Edit.*`,
  `^(Edit|Write)$`, `mcp__.*__write.*` and an alternation of 6,805
  characters each took half a millisecond at the median of 500 readings
  and under four at the slowest, on Node 22.16.0 as on 24.18.1, and 4.81
  at the slowest with the machine busy at a test run, so the budget is
  some two hundred times what a reading takes. An answer that comes back
  and says it cannot tell is better than one that does not come: a
  diagnosis that hangs says nothing of the guard at all, and a `--strict`
  run that fails on a loaded runner can be run again. A check of the
  pattern's shape would not do instead: groups in a row backtrack as
  nested ones do, ten of `(.*)*` taking 674 ms where four took 6. Two
  tests hold the budget with the pattern of five stars, each under a bound
  of its own around the reading, so that without the budget it fails after
  two seconds where it would otherwise not come back.
- **`init` knows the hook as `doctor` knows it.** It knew its own line and
  0.1's, by their exact command and arguments. It now asks the hook's own
  reading whose line an entry is, and reads the entry's event and matcher
  as above. Where the file holds a line of the hook it did not write, which
  Claude Code starts for a write, `init` writes no hook into the file: a
  second line would run beside the first, and a line under one event alone
  is the person's to complete. It says which line it left and why, in
  `doctor`'s words for the line: `keep` where the line guards, `advise`
  where it turns the guard off, holds every write, or is waited on before
  none. It rewrites no line but the one 0.1 wrote, so a line a person
  changed is as they left it, and its own line under one event alone it
  completes, as it did. A line that is started for no write is left too,
  and `init` writes its own, as `doctor` then advises. Beside the plugin, a line that is started
  is the double install, in the project's file or in one of the person's
  own, and `init` says so where it said it had written none (ADR-0012).
- **`--format json`** has `held` and `unstarted` among a line's states, and
  for each line `before` and `after`, the writing tools Claude Code waits
  on it before a write by and starts it after one by, `null` where that
  cannot be told, with what is said of the two as `cover`. The fields are
  added, so no `schemaVersion` moves.
- **No line a release wrote is read another way, and the hook answers no
  line differently.** Read from the tags v0.1.0 to v0.15.0, every release
  wrote the hook's line under both events with the matcher
  `Edit|Write|MultiEdit|NotebookEdit`, in `.claude/settings.json` and in
  the plugin, and nothing after `hook claude`.
  `tests/integration/released-lines.test.ts` holds `doctor` to reporting
  each as the guard, started before every write and after each, with
  nothing more to say, and holds the hook's answer for each line it had.

An exit code that can change for a tree, and what `init` writes, are a
minor release (spec-core's ADR-0009). What was measured for this and left
as it was:

- **The plugin's own `hooks/hooks.json`.** Read from the tags, the file
  holds the same line under the same matcher in every release, so nothing
  in it would change an answer. What `enabledPlugins` does not say is
  whether the plugin is on this machine at all. Claude Code's plugin
  loading reference (<https://code.claude.com/docs/en/plugins/loading>,
  *Enabled in project settings but not installed*, read 2026-10-12) has
  Claude Code not go and get a plugin a machine lacks where a project's
  `.claude/settings.json` alone turns it on, with two exceptions: a
  marketplace that gives the plugin's source as a relative path, and a
  seed directory that has the plugin already. The `/plugin` Errors tab
  then shows a message. A plugin that is not on the machine brings no
  hook to it: that follows, and is not the reference's sentence. So
  `doctor` there reports as the guard a plugin that guards nothing, and
  `init` skips. Telling it apart takes Claude Code's own
  records of what it installed, under its plugins directory, whose shape
  the reference gives only in part, and which could not be measured
  against a Claude Code here; a wrong answer would have `init` write a
  second guard, or `doctor` fail a tree that is guarded. It is left
  unread.
- **A root on the line that is a directory outside any work tree.** The
  hook checks no write there and says nothing, exit 0 (the amendment of
  2026-10-11), and `doctor` says of the line that it guards, by its root.
  A brief on such a line is asked of no one.
- **Two lines in two files.** A line in a person's own
  `.claude/settings.local.json`, or in their user settings, and `init`'s in
  `.claude/settings.json` both run for that person. `init` writes the
  project's file whatever the person's own holds, since every clone reads
  it, and `doctor` lists both lines and counts nothing.
- **`disableAllHooks`**, an entry's `type`, and an entry of the harness's
  under another event than the two, which the hook answers with nothing.
  None is read.

*Amended a third time 2026-10-12.* `doctor` and `init` read a line for the
tools a supported Claude Code can call, which are three. The amendment
above read a line for the four names the hook reads a file from, and said
of a line waited on before some of them that the rest go unchecked.
*Claimed:* Claude Code has no `MultiEdit` any more, so that sentence names
a tool nobody can call. *Measured*, each page read on 2026-10-12:

- **The tools reference** (<https://code.claude.com/docs/en/tools-reference>,
  the table of tools and *Configure tools with permission rules and hooks*).
  Of the tools in the table, three change a file their input names: `Edit`
  makes edits to a file, `Write` creates or overwrites one, and
  `NotebookEdit` changes the cells of a notebook. The word `MultiEdit` is
  nowhere on the page, and the path format of a permission rule,
  `Edit(...)`, is given as applying to those three.
- **The permissions page** (<https://code.claude.com/docs/en/permissions>,
  *Read and Edit*) is one of two pages that have the name at all, the errors
  reference being the other, and calls it "the legacy `MultiEdit` tool": a
  path rule written for it is accepted and never consulted.
- **The changelog** (<https://code.claude.com/docs/en/changelog>, 2.1.296
  back to 0.2.21, and the `CHANGELOG.md` of Claude Code's repository) names
  `MultiEdit` in no release, so the release the tool went in cannot be read
  there.
- **What each release declares.** Every release of
  `@anthropic-ai/claude-code` on npm ships `sdk-tools.d.ts`, the inputs of
  its tools as types. Read as text, release by release, never installed and
  never run: the file declares an input for `MultiEdit` in 1.0.128,
  published 2025-09-27, and in the releases sampled before it, and none in
  2.0.0, published two days later, or in any release sampled after it; and
  each of the 138 releases from 2.1.139 to 2.1.296 was read, of which none
  declares one. The file is no list of every tool (the reference has tools
  it does not hold), so that 2.0.0 took the tool away follows from it and
  is not its sentence. The oldest Claude Code that runs the hooks is
  2.1.139 (`CLAUDE_CODE_MINIMUM`, ADR-0012), published 2026-05-11.
- **The field that holds the path.** The hooks reference
  (<https://code.claude.com/docs/en/hooks>, *PreToolUse input*) gives
  `file_path` for `Write` and for `Edit`, always absolute, and has no
  section for `NotebookEdit`. The permissions page (*Match by input
  parameter*) has `notebook_path` as that tool's, and so do the declarations
  of every release read. The hook reads `file_path`, `path` and
  `notebook_path`, as it did.
- **No other tool in the table names a file it writes.** `Bash`,
  `PowerShell` and `Monitor` take a command, whose writes are git's hook's
  and the audit's to find (above). `Artifact`, `SendUserFile` and
  `ShareOnboardingGuide` send a file somewhere else; `EnterWorktree` makes
  a worktree or enters one; `SendFeedback` keeps a draft in a directory of
  Claude Code's own; `ExitPlanMode` presents a plan written before the
  call. A tool of an MCP server may write anything, under any field, and is
  read by no hook of the harness's.

So no Claude Code the hooks run under has a `MultiEdit` to call, and:

- **The hook reads a path from every name it ever read**, `MultiEdit`
  among them (`WRITING_TOOLS`, `src/hooks.ts`): a name more costs nothing,
  the hook never answers `allow`, and whatever still sends the name is
  answered. No answer of the hook's changes, for any line:
  `tests/integration/released-lines.test.ts` holds them, and the trees
  below were run through both builds.
- **What `doctor` and `init` say names the three** (`CALLABLE_TOOLS`). A
  line Claude Code waits on before `Edit`, `Write` and `NotebookEdit`
  covers every tool that writes, and is said with nothing more; one waited
  on before some of the three names the rest as unchecked; and `MultiEdit`
  is named as unchecked for no line.
- **A matcher that lets `MultiEdit` through and none of the three** is a
  line Claude Code waits on before no write: not the guard, as a line under
  `Bash` is not, and no entry of `init`'s.
- **`init` writes the matcher every release wrote**,
  `Edit|Write|MultiEdit|NotebookEdit`, and the plugin's `hooks/hooks.json`
  holds it. Taking the name out was weighed, and could be shown safe: a
  line is `init`'s own by its command and arguments, never by its matcher,
  so every line a release wrote would still be known, and a second `init
  --write` over a file an older release wrote would change nothing. It
  stays because the hook is asked about a name only under a matcher that
  lets the name through: with `MultiEdit` out of the matcher, the hook
  would read a name its own line never asks it about. The reference has a
  matcher made of names compare each with a tool's name exactly (*Matcher
  patterns*), so a name no tool has starts the hook for nothing.
- **`--format json`**: `before` and `after` hold the three names at most,
  so three for `init`'s own line where they held four. No field is added
  or taken away, and no `schemaVersion` moves.

Measured through the launcher of 0.16.0 and of this change (Windows 11,
Node 24.18.1, git 2.55), in a repository with a brief that protects a file,
the hook's line under both events with the matcher given:

| The matcher | `doctor` on 0.16.0 | `doctor` now |
| --- | --- | --- |
| `Edit\|Write\|MultiEdit\|NotebookEdit`, as `init` writes it | the guard, nothing more; `before` holds four names | the same; `before` holds three |
| `Edit\|Write\|NotebookEdit`, and `^(Edit\|Write\|NotebookEdit)$` | guards, and before none by MultiEdit, which goes unchecked | the guard, nothing more |
| `Edit\|Write` | before none by MultiEdit and NotebookEdit, which goes unchecked | before none by NotebookEdit, which goes unchecked |
| `MultiEdit` | guards, and before none by Edit, Write and NotebookEdit; one of `init`'s entries; exit 0, and 1 beside the plugin | waited on before no write, so not the guard; no entry of `init`'s; exit 0, beside the plugin too |

A `state` and an exit code that can change for a tree are a minor release
(spec-core's ADR-0009), though the tree is one nobody is known to have.
What was measured for this and left as it was:

- **A matcher with a comma, before Claude Code 2.1.191.** The page on
  debugging a configuration (<https://code.claude.com/docs/en/debug-your-config>,
  *Check hooks*, read 2026-10-12) has a `,` separate names as a `|` does,
  and says that before 2.1.191 a comma was read as part of a pattern, which
  then matched no tool. `doctor` reads a comma as the hooks reference has
  it today, for every release, so on 2.1.139 to 2.1.190 a line under
  `Edit, Write` is waited on before no write where `doctor` says it guards
  both. Every release wrote `|`.
- **A matcher that is an array.** The same section has such an entry listed
  as an invalid setting, and under `PreToolUse` none of that file's other
  hooks loaded either. `doctor` says of the entry that it cannot tell, as
  of any matcher that is not text, and reads the file's other entries as
  if they ran.

*Amended a fourth time 2026-10-12.* `doctor` and `init` say three more
ways in which a guard is set up and checks nothing, and fail them. The
amendment before the last measured each and left it: a root on the hook's
line that is a directory outside any work tree, `disableAllHooks`, and an
entry's `type`. (The fourth it left, a plugin that settings turn on and the
machine does not have, is in ADR-0012.) Measured again on 0.16.0 through
the launcher (Windows 11, Node 24.18.1, git 2.55), in a repository with a
brief that protects a file, with spec-brief 0.8.0 and spec-guard 0.23.0
installed in it: each entry under both events with the matcher `init`
writes, `doctor` and `init --write` run there, and the hook handed the
words of the line before a write to the protected file.

| What the settings hold | The hook, before the write | `doctor` on 0.16.0 | `init --write` on 0.16.0 | `doctor` now | `init --write` now |
| --- | --- | --- | --- | --- | --- |
| `hook claude --root <a directory in no work tree>`, with a `--brief` or without | exit 0 and no word: no write is checked | the line guards, by its root; exit 0 | `keep` | the guard is off; exit 1 | `advise`, in the same words; writes nothing |
| the same line under the matcher `Bash` | not asked before a write | not the guard; exit 0 | writes its hooks beside it | the same | the same |
| `"disableAllHooks": true` beside `init`'s line, in that file or in the user's | refuses the write, were it started | `init`'s entries; exit 0 | `keep` | `init`'s entries, and that no hook runs, with the file that holds the key; exit 1 | `keep`, and `advise` for the file that holds the key |
| the same, with `false` in a file of higher precedence | refuses the write | `init`'s entries; exit 0 | `keep` | the same | the same |
| `"disableAllHooks": true`, and the plugin on and installed | | the plugin; exit 0 | `skip` | the plugin, and that no hook runs; exit 1 | `skip`, and `advise` for the key |
| `"disableAllHooks": true`, and nothing wired | | no guard; exit 0 | writes its hooks | the same, and a note on the key | writes its hooks, and `advise` for the key |
| an entry `"type": "prompt"`, or `"http"`, that holds the hook's command | refuses the write, were it run as a command | `init`'s entries; exit 0 | `keep` | no guard; exit 0 | writes its hooks beside the entry |
| the hook's entry with no `"type"`, or with `"Command"` | refuses the write, were it run | `init`'s entries; exit 0 | `keep` | cannot tell; exit 0, and 1 under `--strict` | `keep`, saying the same |

- **A root that is a directory outside any work tree is said as a guard
  that is off.** The hook there reads a session outside a work tree, checks
  no write and says nothing, exit 0 (the amendment of 2026-10-11), and that
  stays: a hook started where there is no repository has nothing to guard,
  and no way to tell a root a person mistyped from a session that is simply
  elsewhere. `doctor` can tell, since it reads a line someone wrote: a
  `--root` on the hook's line is a person's (no release wrote one), and one
  that is in no work tree is a guard set up to check nothing. It asks git
  about the root as the hook does, once for each such line, and says the
  line in the words above for the hook there, with exit 1, as for a root
  that is not a directory. It is the one fault the hook says nothing of, so
  `onFailure` holds no write for it, and the note on that field says what
  it says of a line that guards. Where Claude Code waits on the line before
  no write, it is said as that, and fails nothing: no write is left
  unchecked that the line was ever asked about. A brief on such a line is
  asked of no one, as before. A root in another repository's work tree is
  read as it was: the hook guards there, by that repository's briefs.
- **`disableAllHooks` is read, from the three settings files.** Claude
  Code's settings reference
  (<https://code.claude.com/docs/en/settings-reference>, *disableAllHooks*,
  read 2026-10-12) has the key as a Boolean that any settings file may
  hold: `true` turns hooks off, with a custom status line and a custom file
  suggestion. Which hooks depends on the file that holds it. In managed
  settings, every configured hook, the managed ones among them, but not
  those the Agent SDK registers. In any
  other file, the hooks of the user's, the project's and the local settings
  and those of plugins, while the hooks of managed settings, of the Agent
  SDK, and of a plugin that managed settings force on through
  `enabledPlugins` keep running. The hooks reference
  (<https://code.claude.com/docs/en/hooks>, *Disable or remove hooks*, read
  the same day) adds that the value that counts is the one left after
  settings precedence, so `false` in a project's settings overrides `true`
  in the user's, and that `--settings` comes before the project's and the
  local file.
  So `doctor` takes the last of the user's, the project's and the local
  file that sets the key to a Boolean. Where that is `true`, every hook the
  harness's wiring stands on is switched off, `init`'s entries in any of
  the three files and the plugin's own: it says so with the file, and exits
  1 where there are guard hooks to switch off, a settings file that holds a
  line Claude Code starts for a write or a plugin that may be on the
  machine. Where nothing is wired it is a note, since the hooks `init`
  would write as `doctor` advises would not run. What the reference leaves
  running is said in the same sentence, and is nothing `doctor` can see:
  managed settings and `--settings` are no file a project reads (ADR-0012),
  and either may set the key the other way. A value that is no Boolean is
  passed over, as the key left out: the settings reference gives the key no
  other type, and its page on settings files
  (<https://code.claude.com/docs/en/settings>, *Fix a broken settings
  file*) has Claude Code set aside a value its schema rejects, the entry or
  more of the file, without saying which for this key.
  `init` says the key of the file that holds it, as a step of its own
  (`advise`), and writes what it would have written: the key is the
  person's to take out, and the hooks are there when they do.
- **Only an entry Claude Code runs as a command is a line of the hook.**
  The hooks reference (*Hook handler fields*, read 2026-10-12) has five
  types of handler, told apart by `type`: `command` runs a shell command,
  `http` sends a request, `mcp_tool` calls a tool of an MCP server,
  `prompt` asks a model and `agent` starts a subagent. Its table of
  fields has `type` as
  required, and `command` and `args` as fields of a command hook alone. So
  an entry of one of the other four types that holds the harness's command
  runs nothing of the harness's: it is no line, is not reported, and
  `init` writes its hooks beside it. Of an entry with no `type`, or with a
  word that is none of the five, the reference says nothing: not that
  Claude Code runs it as a command, nor that it skips it. It is kept as a
  line and said as *cannot tell*, with how to write it, never fine, and a
  failure under `--strict`; `init` takes it as a line that is started, and
  writes none beside it. Every release wrote `"type": "command"` on both of
  its entries, read from the 25 tags, v0.1.0 to v0.16.0.
- **`--format json`** has `claudeCode.hooksOff`, the file whose
  `disableAllHooks` is `true` or `null`, and `claudeCode.notes`, what is
  said of the key and of the plugin. A line under a root outside any work
  tree has the state `off`, and an entry with no `type` the state
  `unknown`, both states a script met before. The fields are added, so no
  `schemaVersion` moves.
- **The hook answers no line differently.** Each tree measured for this
  was run through the launcher of 0.16.0 and of this change, and the hook's
  exit code and both its streams compared for each line, before a write and
  for each of the four names it reads a file from.
  `tests/integration/released-lines.test.ts` holds `doctor` to the hook's
  answer for the new fault as for the others: nothing, and exit 0.

An exit code that can change for a tree that passed is a minor release
(spec-core's ADR-0009). What was measured for this and left as it was:

- **A root in the work tree of another repository.** The hook opens that
  work tree and decides by its briefs. Measured with a root in a repository
  that names no brief: it said nothing of a write to this project's
  protected file, exit 0, and `doctor` says of the line that it guards, by
  its root. Which repository a person meant the line for is not read from
  the line.
- **`allowManagedHooksOnly`**, which the same references have turn off the
  hooks of the three files and of plugins that managed settings do not
  force on, is a key of managed settings, which are not read.
- **An entry of the harness's under another event than the two**, which the
  hook answers with nothing.

*Amended 2026-10-14.* `doctor` and `init` read a matcher as the Claude
Code on this machine reads it. The amendment that took the tools down to
three measured two things about a matcher and left them: names with a comma
before Claude Code 2.1.191, and a matcher that is an array. *Claimed* there,
from a page that was not kept: before 2.1.191 a matcher that lists names
with commas matched no tool, and an array for a matcher has Claude Code load
none of the settings file's other hooks under the event. *Measured*, each
page read again on 2026-10-14:

- **The page on debugging a configuration**
  (<https://code.claude.com/docs/en/debug-your-config>, *Check hooks* and
  *Check common causes*). Of a hook that is listed and does not fire: a
  `,` separates the names of a matcher as a `|` does, and "Before
  v2.1.191, a comma fell through to regex evaluation and the matcher never
  matched". Its table says the same of `"Edit,Write"`: read with the comma
  as a literal character, it matches nothing. Of a hook that is not listed
  at all: a `matcher` that is an array, where it must be one string, is an
  entry Claude Code lists as an invalid setting, when an interactive session
  starts and in `claude doctor`; and where the array is under `PreToolUse`
  or `PermissionRequest`, none of that file's other hooks load either. The
  page names no release for the array. So the first claim holds, and the
  second holds more widely than it was made: the page has the whole file,
  not the event, and two events an array does that under.
- **The hooks reference** (<https://code.claude.com/docs/en/hooks>, *Matcher
  patterns*) has a matcher made of letters, digits, `_`, `-`, spaces, `,`
  and `|` alone as a name, or a list of names between `|` or `,`, as it
  had on 2026-10-12, and names no release for the comma.
- **The changelog** (<https://code.claude.com/docs/en/changelog>, 2.1.191,
  of June 24, 2026) has, among its fixes, hooks with comma-separated
  matchers that silently never fired, `"Bash,PowerShell"` its example.

Measured through the launcher of 0.17.0 and of this change, in a repository
with a brief that protects a file, the hook's line under both events with
the matcher given unless the row says otherwise, and a `claude` on `PATH`
of the release given, made up and never a Claude Code (Linux, Node 24.21,
git 2.47, in a container; the rows were run again on Windows 11, Node
24.18.1, git 2.55):

| What the settings hold, and the release | `doctor` on 0.17.0 | `init --write` on 0.17.0 | `doctor` now | `init --write` now |
| --- | --- | --- | --- | --- |
| `Edit, Write`, under 2.1.191 or later | guards a write by Edit and Write; exit 0 | `keep` | the same | the same |
| the same, under 2.1.139 to 2.1.190 | the same | `keep` | waited on before no write, so not the guard, with the release and what the matcher is from 2.1.191; exit 0 | writes its hooks beside the line |
| the same, with no `claude` on `PATH` | the same; exit 0, and 1 under `--strict` for the release | `keep` | cannot tell which writes; the same exit codes | `keep`, saying the same |
| the same under 2.1.190, the plugin on and installed | the double install; exit 1 | `advise` | the plugin alone is the guard; exit 0 | `skip` |
| `Edit\|Write, NotebookEdit` under 2.1.190 | guards; exit 0 | `keep` | cannot tell; exit 0, and 1 under `--strict` | `keep` |
| `Bash, Read`, under any release or none | not the guard; exit 0 | writes its hooks | the same | the same |
| an array, `["Edit","Write"]`, over the hook's own entry under both events | cannot tell; exit 0, and 1 under `--strict` | `keep` | the guard is off; exit 1 | `advise`; writes nothing |
| `init`'s line, and another program's entry under an array under `PreToolUse` or `PermissionRequest` | `init`'s entries; exit 0 | `keep` | the guard is off; exit 1 | `advise`; writes nothing |
| the same array, and no line of the hook | no guard; exit 0 | writes its hooks into the file | the same | `advise`; writes nothing |
| the same array, and the hook's line under `Bash` | not the guard; exit 0 | writes its hooks | not started, and no guard switched off; exit 0 | `advise`; writes nothing |
| `init`'s line, and another program's array under `PostToolUse` or `SessionStart` | `init`'s entries; exit 0 | `keep` | the same | the same |
| the hook under `init`'s matcher before a write, and under an array after one | guards, and cannot tell after which writes; exit 0 | `keep` | guards, and is started after no write; exit 0 | completes its line under `PostToolUse` |
| an array under `PreToolUse` in the user's settings, `init`'s line in the project's | `init`'s entries; exit 0 | `keep` | the same | the same |

- **A comma is read as the release on `PATH` reads it.** `doctor` asks
  that release where something wires the guard (ADR-0012), and the reading
  of a matcher of names that holds a comma now turns on it. From 2.1.191 on
  the matcher is the names it lists, as it was read for every release. Under
  an older release it is what the page has that release make of it, a
  pattern with the comma in it: read as one within the budget every pattern
  is read in, a matcher of names and commas matches none of the three
  tools, since no tool's name holds a comma. An entry under it is started
  for no write, and a line all of whose entries before a write are such is
  one Claude Code waits on before no write: not the guard (`unstarted`),
  said with the release and with what the matcher is from 2.1.191 on, and
  no failure, as a line under `Bash` is none. `init` writes its own hooks
  beside it, as beside any line that is started for no write.
- **Where the release cannot be told, the line is *cannot tell*.** No
  `claude` on `PATH`, or one whose release cannot be read, leaves both
  readings open: which writes the line is started for is said as that, with
  both readings, never fine, and a failure under `--strict` alone
  (`unknown`). `init` takes the line as one that may be started and writes
  none beside it.
- **A comma beside a `|` under an older release is *cannot tell* as well**,
  where the matcher read as a pattern matches a tool. `Edit|Write,
  NotebookEdit` read as a JavaScript regular expression matches `Edit`, and
  `NotebookEdit` by the same four letters. The page says of a comma both
  that it was read as part of a pattern and that the matcher never matched,
  and for such a matcher the two cannot both hold. That a pattern would
  match follows from the hooks reference's reading of a pattern, and is not
  the page's sentence; no Claude Code was run to see which it is.
- **Where both readings come to no tool that writes, nothing turns on the
  release**, and nothing is said of it: `Bash, Read` is no guard under any.
  And a matcher with any other character in it is a pattern under every
  release, a comma in it or not.
- **The release is asked as before by `doctor`, and by `init` only where
  it decides something.** `doctor` asks where something wires the guard,
  and a line that may be started under either reading counts as wiring for
  that question; a release that then reads the line as started for nothing
  is still said, since it was asked, and a release too old for the hooks
  still fails. `init` asked no release and now asks where what it reads of
  a line differs between a release that cannot be told and the newest: one
  more process, or one file read on Windows (ADR-0012), in a repository
  that has such a matcher and in no other.
- **An array for a matcher starts no hook, and under two events unloads the
  file.** An entry under an array is started for no tool, where it was
  *cannot tell*: after a write that is said of the entry, with what the
  page has of it. And a settings file that holds an array for a matcher
  under `PreToolUse` or `PermissionRequest`, in an entry of the hook's or of
  any other program's, has none of its hooks loaded. Every line of the hook
  in the file is said as one Claude Code does not start, with the array and
  the event it stands under. A line that stood to be started for a write,
  before one or after, or that stands under an array itself, is a guard
  someone set up that checks nothing: off, and `doctor` exits 1, as it does
  where `disableAllHooks` switches the guard off. A line that stood to be
  started for no write, as one under `Bash`, is said and fails nothing: no
  guard is switched off. Nothing of the file counts as wiring, so beside the
  plugin there is no double install, and the release is not asked for the
  file's sake.
- **`init` writes no hook into a file that an array unloads.** A hook
  written there would be one more that is not loaded. It says the array, the
  event and how the matcher is mended, as one string with its names between
  `|`, and is run again after (`advise`). An array under another event
  unloads nothing beside it, and `init` completes its own line there as it
  does under any event its line is not started under.
- **`--format json`** gains no field. A line under names with a comma has
  the `state`, `before` and `after` the release gives it, and a line in a
  file an array unloads has the `state` `off`, or `unstarted`, with no tool
  under either.
- **The hook answers no line differently, and no line a release wrote is
  read another way.** The hook reads nothing of a settings file. Every
  release wrote the matcher `Edit|Write|MultiEdit|NotebookEdit`, one string
  with no comma, read from the tags v0.1.0 to v0.17.0;
  `tests/integration/released-lines.test.ts` holds what `doctor` says of it
  under a release from before 2.1.191, under one from after it and under
  none. The trees above, and those of the amendments before, were run
  through both builds, and the hook's exit code and both its streams
  compared for each line.

A `state` and an exit code that can change for a tree are a minor release
(spec-core's ADR-0009). What was measured for this and left as it was:

- **A name with a hyphen, before Claude Code 2.1.195.** The changelog has,
  under 2.1.195, hook matchers with hyphenated identifiers that matched as
  substrings, and exact-match from there on. So under 2.1.139 to 2.1.194 a
  matcher such as `Edit|Write|my-tool` may have been read as a pattern,
  under which `Edit` is in `NotebookEdit` too, where `doctor` says that
  `NotebookEdit` goes unchecked. No page says what else such a matcher was
  read as, and it is read as the hooks reference has it today.
- **A hook whose matching fails.** The changelog has, under 2.1.288, hooks
  under `PreToolUse` and `PermissionRequest` that were skipped when
  matching them failed, and the tool call blocked from there on. What makes
  a matching fail is not said: whether a matcher that is no pattern, which
  `doctor` says it cannot tell, is such a one, or an array, of which the
  page on debugging says what is above.
- **A matcher that is neither text nor an array**, a number, an object or
  `null`: no page says what Claude Code does with one, and it stays
  *cannot tell*.
- **A file an array unloads that holds no line of the hook.** `doctor`
  says a thing of a line, and has none there: it reports no guard and
  advises `init`, which then says the array.

*Amended again 2026-10-14.* A root on the hook's line that is in another
work tree than the project's is said by what the hook checks under it. The
fourth amendment of 2026-10-12 measured a root in the work tree of another
repository and left it: `doctor` said of the line that it guards, by its
root. *Claimed* then: with such a root the hook said nothing of a write to
this project's protected file. *Measured* through the launcher of 0.17.0
(Linux, Node 24.21, git 2.47, in a container, and Windows 11, Node 24.18.1,
git 2.55, with the same answers): the project a repository with a brief
that protects `src/db/**`, on the brief's branch, the hook's line
`hook claude --root <the directory>` in its settings, and the hook handed
that line before an edit of the project's protected file, and of the file
of that name in the root's work tree. What each root is, git's own commands
say: `rev-parse --show-toplevel` its work tree, `--git-common-dir` the git
directory that work tree's repository keeps, which every work tree of one
repository shares, and `--show-superproject-working-tree` the project a
submodule is one of.

| Where the root is | The hook, before a write to the project's protected file | The hook, before a write to that work tree's | `doctor` on 0.17.0 | `doctor` now |
| --- | --- | --- | --- | --- |
| a subdirectory of the project | refuses | the same file | guards; exit 0 | the same |
| another repository beside the project, on a branch that names no brief | exit 0, no word | exit 0, no word | guards; exit 0 | the guard is off; exit 1 |
| the same, on a branch that names a brief of its own | exit 0, no word | refuses, by that repository's brief | guards; exit 0 | the guard is off; exit 1 |
| inside the project, a repository of its own | exit 0, no word | refuses | guards; exit 0 | the guard is off; exit 1 |
| inside the project, a submodule | exit 0, no word | refuses | guards; exit 0 | the guard is off; exit 1 |
| inside the project, a linked worktree of its repository | exit 0, no word | refuses | guards; exit 0 | the guard is off; exit 1 |
| beside the project, a linked worktree of its repository | exit 0, no word | refuses | guards; exit 0 | the guard is off; exit 1 |
| the main work tree of the repository, where the project is a linked worktree beside it | exit 0, no word | refuses | guards; exit 0 | the guard is off; exit 1 |
| a repository the project is nested in, a repository of its own, whose brief protects `packages/project/src/db/**` | refuses, as `packages/project/src/db/schema.ts`, by that repository's brief | refuses | guards; exit 0 | guards, and says whose briefs; exit 0 |
| the same, whose brief protects `src/db/**` alone | exit 0, no word; after a write outside its scope, a warning that names the file by its path there | refuses | guards; exit 0 | guards, and says whose briefs; exit 0 |
| the main work tree, where the project is a linked worktree inside it | as the row above | refuses | guards; exit 0 | guards, and says whose briefs; exit 0 |
| a bare repository, or the project's own `.git` | exit 0, no word | exit 0, no word | the guard is off; exit 1 | the same |

So the claim holds, and more widely than the case it was made for. The hook
opens the work tree its root is in and reads every path from that work
tree's top: a file under it is checked by its briefs, read from its own
branch and configuration, and a file outside it is to the hook a file
outside the repository, which it lets pass with no word.

- **Whether the root's work tree holds the project decides what is said.**
  `doctor` asks git for the top of the root's work tree, as it did for a
  root outside any, and reads where the project's top is from there, links
  and case resolved as the hook resolves a path. The same work tree: the
  line is read as it was. A work tree that does not hold the project,
  beside it or inside it: no write to a file of the project is checked, and
  the line is a guard that is off, said with that work tree and with what
  the hook does there, and `doctor` exits 1, as for a root outside any work
  tree. It is a fault the hook says nothing of, so `onFailure` holds no
  write for it, and where Claude Code waits on the line before no write it
  is said as that and fails nothing. A work tree that holds the project: a
  write here is checked, by that work tree's briefs and its branch, under
  the path the file has there. The line guards, `doctor` says whose briefs
  they are and the path the project has in that work tree, and it fails
  nothing.
- **A work tree of the project's own repository is named as that, and read
  by the same rule.** The decision handed over had a linked worktree of
  this repository be this repository. git says which a work tree is, by the
  git directory it shares, and the sentence follows it: `another work tree
  of this repository`, where any other is `the work tree of another
  repository`. What the hook checks does not turn on whose the work tree
  is, and the exit code follows what the hook checks. Measured, under a
  root in a linked worktree, beside the project or inside it, a write to the
  project's protected file passes with no word, as under another
  repository's: a linked worktree holds no file of the work tree it is
  linked from. And under the main work tree around a linked one, the write
  is checked as under any work tree that holds the project.
- **A brief on the line is asked of the work tree the hook opens, as it
  was**, and a name that is none there holds every write, which is said as
  that wherever the root is: a line that stops all work is the larger
  fault.
- **The hook is not touched**, and no line a release wrote carries a root
  (`tests/integration/released-lines.test.ts`). The layouts above were run
  through both builds, and the hook's exit code and both its streams
  compared for each. A test builds four of them, and holds `doctor` to the
  hook: a write to the project's file refused where it says the line
  guards, and passed with no word where it says no write here is checked.
- **`--format json`** gains no field: such a line has the `state` `off`,
  or `guards` with what is said of it as `detail`.

An exit code that can change for a tree that passed is a minor release
(spec-core's ADR-0009). What was measured for this and left as it was:

- **What else of the other work tree the hook reads.** Under such a root
  the hook loads that work tree's configuration, takes the brief its branch
  names, and runs the siblings installed there. A configuration there that
  does not load, a branch that names a brief which is not one, or a
  spec-brief that is not installed there, each holds every write of the
  session, exit 2. `doctor` asks that work tree about the brief the line
  names and about nothing else, so a line it says guards, by a holder's
  briefs, may hold every write for the holder's branch.
- **Which of the project's files a holder's briefs reach.** A work tree
  that holds the project reads its own patterns from its own top: a brief
  there that protects `src/db/**` protects nothing under
  `packages/project/`. `doctor` says the path the project has there, and
  reads no brief's patterns.
- **A line meant for the other work tree.** A person may write a second
  line with a root in a submodule, or in a repository beside the project,
  so that a session's writes there are checked by that work tree's briefs.
  Such a line is said as a guard that is off for the project, and fails
  `doctor`, though it does what was meant: the sentence says what the hook
  checks under it.

*Amended a third time 2026-10-14.* What stands at the path of git's
pre-commit hook and is no file is said, with what git does with it, and no
command ends on a stack for something a repository can hold. The amendment
of 2026-09-30 has `doctor` and `init` find the hook where git runs it from,
and both then read what is there as a file. *Claimed:* where
`.git/hooks/pre-commit` is a directory, both end on `unexpected error:
EISDIR` and a stack, exit 2, in 0.16.0 as well. *Measured*, through the
launcher of 0.17.0 and with git itself at a commit (git 2.47.3 on Linux as
an ordinary account, Node 24.21, in a container; Git for Windows 2.55.0,
Node 24.18.1):

| What stands at git's path for the hook | git, at a commit | `doctor` and `init` on 0.17.0 | Now |
| --- | --- | --- | --- |
| a directory, as `mkdir` makes one; on Windows, any | stops the commit, exit 1: `cannot exec '.git/hooks/pre-commit': Permission denied`, and on Windows `cannot spawn .git/hooks/pre-commit: No such file or directory` | `unexpected error: Error: EISDIR` and a stack; exit 2 | `doctor` says it, exit 1; `init` advises, exit 0, and writes nothing |
| the same under a `core.hooksPath` in the work tree, held by the repository | the same | the same | the same |
| a link to a directory | the same | the same | the same |
| a directory nobody may execute (not on Windows) | skips it, with the hint it has for a hook that is not executable, and commits | the same stack | said as skipped; exit 0 |
| a named pipe that may be executed | stops the commit | neither comes back | said as neither a file nor a directory; exit 1 |
| a link to nothing, or to itself | no hook: commits | no hook, as it is | the same |
| a file nobody may execute (not on Windows) | skips it, with the hint | not executable, so git skips it | the same |

So the claim holds, and what git does with such a path is not to pass it
over: it takes whatever it may execute there for the hook, fails to start
it, and stops the commit.

- **Only a file is read.** What else stands at the path is said with what
  it is, a directory or neither a file nor a directory, and what git does
  with it. Nothing there is opened, so a named pipe is said like the rest.
- **The exit code follows what git does.** Where git stops every commit at
  it, nothing is checked and nothing is committed: `doctor` exits 1, with
  git's own words for it, `cannot spawn` on Windows and `cannot exec`
  elsewhere, so that the error a person met at a commit leads here. Where
  git skips it, no hook runs, as where there is none, and that is said and
  fails nothing: no hook at commit is a choice (ADR-0012).
- **Whether git runs what is there is asked as git asks it**: whether the
  account may execute the path. `doctor` read the mode's three executable
  bits for a hook that is a file, outside Windows. A directory answers
  another way for an account that may do anything, which may always enter
  one, and git, run as such an account, stops the commit at a directory
  with none of the bits (measured in a container as root). So both are
  asked through Node's access check for execution, which on Windows is by
  Node's fs page no more than whether the path is there
  (<https://nodejs.org/docs/latest-v24.x/api/fs.html>, *File access
  constants*, read 2026-10-14), as git on Windows runs whatever is. A hook
  that is a file reads as it did.
- **`init` advises, and writes nothing over it**, with `--git-hook` or
  without, in `doctor`'s words: what is there is the person's to take
  away, as a hook that exists is theirs to add the line to.
- **`--format json`** has the two as the `gitHook.state` `stops` and
  `ignored`, beside the five it had.

Every other path the harness reads where it expects a file was made a
directory, one at a time, and each command that reads it run (Linux, as
above, and on Windows for the hook's path, the project's settings file, the
configuration and the probe's report):

| The path | What reads it says |
| --- | --- |
| `.claude/settings.json`, `.claude/settings.local.json`, the user's `settings.json` | read as a file that cannot be read as JSON, which holds no hook and no plugin (ADR-0012); `init`: `cannot be read as JSON; add the guard ... by hand`, and writes nothing over it |
| `.claude`, a file where the directory should be | `doctor` reads no settings there; `init --write`: `spec-harness: .claude/settings.json: EEXIST: file already exists, mkdir ...`, exit 2, in Node's words and with no stack |
| `.mcp.json` | `init`: `cannot be read as JSON; add the spec-harness server by hand` |
| `.spec-harness.json` | every command, the hook among them: `.spec-harness.json is a directory, not a configuration file`, exit 2 |
| `.spec-brief.json` | `doctor` and `init`: `cannot be read as JSON`, so whether spec-brief loads the plugin is unknown; spec-brief's own sentence from every command that asks it, `is a directory, not a configuration file`, exit 2, and the hook holds the write |
| `package.json` | spec-guard's own sentence from `audit`, exit 2; nothing else reads it where spec-graph is not installed |
| the allowed-signers file, a directory on the base | `doctor`: `.github/allowed_signers is on main`, and its lines noted as no signers; a ruling is not verified |
| a brief's file, or the briefs' directory a file | spec-brief lists no such brief, or says its own sentence: the brief is none, exit 2 from every command that needs it |
| `known_marketplaces.json`, and the plugin's directory in a cache a file | *cannot tell*, and not on the machine, as for a record that cannot be read |
| a sibling's `package.json` | `declares no version`, as for one that is not JSON |
| a document a brief cites | `context`: cited and not found, as one that is not there |
| the report a probe's `junit` names | `unexpected error: SystemError [ERR_FS_EISDIR]` and a stack; exit 2 |

One more ended on a stack, then: `probe`, which took the report away as a
file before each run. A directory under that name is the repository's, and
is now left and read as a report that cannot be read: the run is
`no-report`, in the probe's own words for one (ADR-0007), and the probe
invalid.

What was measured for this and left as it was:

- **The allowed-signers file as a directory.** git shows a directory at a
  commit as a list of its entries, which `doctor` reads as the file: it
  says the file is on the base, and each line of the list as no signer. No
  ruling verifies against it, so nothing is allowed that should not be;
  the first sentence is wrong.
- **A settings file that is a directory** says nothing to `doctor`, which
  reports no guard and no more, as for any settings file that cannot be
  read (ADR-0012, Consequences).
- **A `core.hooksPath` that names a file.** git cannot name the hook's path
  under it (`Invalid path ...: Not a directory`) and commits with no hook.
  `doctor` says that where git runs its hooks cannot be told, and gives the
  reason it has for a git older than 2.31, which is not this one.
- **What stands under the git directory.** The harness's own state
  directory as a file (`.git/spec-harness`) ends `escalate` on Node's
  ENOTDIR and a stack, and a hook file the account may not read ends
  `doctor` on EACCES and one. Neither is something a repository holds: git
  keeps one bit of a file's mode, and nothing of its own directory.
- **A named pipe where a settings file is expected** is read as a file, and
  a pipe nothing writes to is read without end. A repository cannot hold
  one.

*Amended 2026-10-18.* An option that takes one value is given one, and a
line that is wrong is refused with `--help` or `--version` on it (spec-core's
ADR-0005, amended the same day). The amendment of 2026-10-11 measured an
option given twice and left it: the parser's reading for every command, the
last value read. *Measured* on 0.18.0 through the launcher (Windows 11,
Node 24.18.1, git 2.55), in a repository with a brief that protects a file,
on the brief's branch: every option that takes one value given twice to
every command that reads it, once with one value and once with two, and
each refusal `src/usage.ts` has beside `--help` and `--version`, 209 lines
in all.

| The line | 0.18.0 | Now |
| --- | --- | --- |
| `doctor --root nowhere --root .`, and `--root` so for every command | runs in `.`, exit 0 | exit 2: `--root is given twice, as "nowhere" and as ".", and one of the two would go unread; give it one` |
| `context --brief 404 --brief 001`, `--base nowhere --base main`, `--format pretty --format json`, `probe --id p --id q`, `escalate --reason a --reason b`, `--recommend` and `--show` so, `rule --note a --note b` | the last is read, and the earlier passed over: brief 001, a JSON document, probe q, a memo that says b | exit 2, in the same words for the option |
| `probe --at sideways --at head` | runs at the head: a position the parser refuses, read first, refused nothing | exit 2, the same |
| `--root . --root ./`, `--brief 1 --brief 001`, the same value twice | the last | the same: the option once |
| `escalate --path a --path b`, `--option` twice | a list | the same |
| `hook claude --root nowhere --root .`, before a write to the protected file and after one | refuses the write, under `.` | exit 1, `the hook's line cannot be read (--root is given twice, ...)`, and the write goes on |
| `hook claude --brief 001 --brief 404` | exit 2, every write held for 404 | exit 1, the same words for `--brief` |
| `hook claude --root . --root ./`, `--brief 1 --brief 001` | refuses the write | the same |
| `doctor --help --root a --root b`, `doctor --help --note x`, `doctor --help extra`, `doctor --help --root ""`, `doctor --help --root nowhere`, `audit 001 --brief 001 --help`, `escalate --list --path a --help`, `guard --help ""`, `hook git --help --strict`, `init --version --brief 001`, `bogus --help` | the help or the version, exit 0 | exit 2, the line each is refused with alone |
| `--help --version`, `--version --help`, `-h -v`, `doctor --help --version` | the version, exit 0 | exit 2: `--help is given beside --version, and one of the two answers would go unread; give one of them` |
| `hook claude --help --version`, `hook claude --help --root a --root b`, before a write | the version, or the help, exit 0, and no write checked | exit 1, the hook's line cannot be read |
| `doctor --help --bogus` | exit 2 | the same |
| `--help`, `guard --help`, `hook --help`, `rule --help`, `escalate --help`, `hook claude --help` | the help, exit 0 | the same |

- **Two values are compared as the option reads them.** A root by the
  directory it names from where the command is started, so `.`, `./` and
  the directory's own path are one; on the hook's line an empty root is the
  directory the hook is started in, as it reads one. A brief by its id as
  spec-brief's names are matched (ADR-0004): space around it dropped, and
  digits as a number, so `12` is `012`. Everything else as written: a base
  is a name git is handed, and `main` beside `origin/main` asks for two
  refs whatever commit each names today; a format, a probe's position and
  an id are words read exactly; a reason, a recommendation and a note are
  text. The first option given two is named, with the first value it was
  given and the first that reads otherwise; the same value given again is
  the option once, and the last is the one read. An empty value is refused
  wherever it stands, beside one that reads as the same directory too: it
  is the unset variable it most often is.
- **A list is a list.** `--path` and `--option` take every value, as they
  did.
- **Claude Code's hook says it of its own line.** Two values on the hook's
  line, for an option it reads or one it passes over, is a line it cannot
  read: one line on stderr, exit 1, after the question is read, before a
  write and after one, and no write held, as for an option no command has
  (the amendment of 2026-10-11). Read as before, the hook guarded under the
  last root, in a work tree the person may not have meant, and held every
  write for the last brief. `doctor` reads the line through the same
  function (`claudeHookLine`, `src/usage.ts`), with a relative root read
  from the root it runs in as for one root, says it as a guard that is off
  in the hook's words, and exits 1. A brief on such a line is asked of no
  one. A test runs the hook on such a line and holds `doctor` to its words.
- **A wrong line is refused before `--help` or `--version` answers.** Every
  refusal of `src/usage.ts` is asked first, and so is a command that is
  none: `spec-harness bogus --help` is `unknown command "bogus"`. What a
  command says only as it runs is not asked, so `guard --help`, `hook
  --help`, `rule --help` and `escalate --help` print the help, where each
  without it says what it needs. The two of them beside each other is
  refused by the parser, which names both as they were written, `-h` and
  `-v` as `-h` and `-v`; on the hook's line that is a line it cannot read.
- **No line a release wrote is read another way.** The five command lines
  the releases hand the harness (ADR-0012) give no option twice, and
  `tests/integration/released-lines.test.ts` holds each to that. The hook
  was handed 52 lines through the launcher of 0.18.0 and of this change,
  364 runs in all: each line before and after a write to a protected file,
  to a file in the scope and to one outside it, by each tool it reads a
  path from, and before a call of `Bash`, and git's hook with a protected
  file staged. The exit code and both streams were the same in every run
  but 58 of the lines above, two values and `--help` beside `--version`,
  and 14 that print the help, whose words for these rules are new.

Input refused that was accepted, and exit codes that changed, are a minor
release (spec-core's ADR-0009). What was measured for this and left as it
was:

- **`--help` or `--version` on the hook's line beside a fault it says as it
  runs**: `hook claude --help --root nowhere` prints the help, exit 0, as
  before. The hook says such a fault only once it has read the question, and
  `--help` is answered before. And `doctor` reads `hook claude --help` as a
  line that guards, where the hook prints the help and checks no write. No
  release wrote either word on the line.
- **A word after `hook` that is neither `claude` nor `git`**, beside
  `--help`: `hook claud --help` prints the help. `hook` refuses the word as
  it runs.
- **A root is compared as Node's `path.resolve` spells it.** On Windows
  `C:\repo` beside `c:\repo`, and a link beside its target, are two values
  though they name one directory.
- **A line with no command reads no root.** `--root nowhere --version`
  prints the version, as `--root nowhere --help` prints the help: no shape
  is asked of a line with no command. Two roots on it are refused all the
  same.

*Amended again 2026-10-18.* `doctor` reads a hyphen in a matcher as the
Claude Code on this machine reads it, and no command ends on a stack or
fails to come back for what stands where a file is read. The first and the
third amendments of 2026-10-14 measured five things and left them.
*Claimed* again from them (spec-family/spec-harness#101 and #102, "Found and
not fixed"): a hyphenated name in a matcher before Claude Code 2.1.195 may
be read otherwise than `doctor` reads it; a pre-commit hook the account may
not read, and a state directory under the git directory that is a file,
end `doctor` and `init` on a stack; a named pipe where a settings file is
expected is read without end; a `core.hooksPath` that names a file is given
the reason for a git older than 2.31; and where an array for a matcher
unloads a settings file, `doctor`'s first line advises `init --write`,
which then only advises. *Measured* through the launcher of 0.18.0 and of
this change, taking turns, in scratch repositories with a brief that
protects a file: on Windows 11 (Node 24.18.1, Git for Windows 2.55, a
`claude` on `PATH` made up, a shim whose package declares the release,
never run), and for what needs a mode or a named pipe in a container as an
ordinary account (Linux, Node 24.21, git 2.47.3). Claude Code's changelog
was read again on 2026-10-18 (<https://code.claude.com/docs/en/changelog>,
2.1.195, and the same entry in the `CHANGELOG.md` of Claude Code's
repository), and has among that release's fixes hook matchers with
hyphenated identifiers "accidentally substring-matching", which now match
exactly; its examples are `code-reviewer` and `mcp__brave-search`.

| What stands, and the release on `PATH` | 0.18.0 | Now |
| --- | --- | --- |
| a line under `Edit\|Write\|my-tool`, `Edit\|my-tool`, `Write\|my-tool` or `Edit\|Write\|NotebookEdit\|my-tool`, under 2.1.190 or 2.1.194 | guards the names it lists; exit 0 | *cannot tell*, with the release and why; exit 0, and 1 under `--strict`; `init` keeps the line |
| the same, with no `claude` on `PATH` | guards the names it lists; exit 0, and 1 under `--strict` for the release | *cannot tell*; the same exit codes |
| the same, under 2.1.195 | guards the names it lists | the same |
| `Edit, Write, my-tool` under 2.1.194 | guards `Edit` and `Write` | *cannot tell* |
| `Edit, Write, my-tool` under 2.1.190, and with no `claude` | not the guard, and *cannot tell* | the same |
| `Bash\|my-tool`, `mcp__brave-search`, under any release or none | not the guard; exit 0 | the same |
| `init`'s matcher, under any release or none | guards | the same |
| a pre-commit hook file of mode 000: git skips it with a hint and commits | `doctor` and `init`: `unexpected error: Error: EACCES` and a stack, exit 2 | `cannot be read (EACCES: ...), and is not executable, so git skips it`; `doctor` exit 0, `init` advises |
| the same, of mode 111 or 333: git runs it, `/bin/sh: 0: cannot open .git/hooks/pre-commit: Permission denied`, and the commit stops | the same stack | *cannot tell* whether it runs spec-harness; `doctor` exit 0, and 1 under `--strict`; `init` advises |
| `.git/spec-harness` a file | `escalate --list`, `--show`, a request, and `rule`: `unexpected error: Error: ENOTDIR` and a stack, exit 2; `doctor`, `init`, `context`, `guard`, `rulings`, `premises` and the hook as without it; the server's `request_escalation` a tool error in Node's words | `.git/spec-harness is not a directory, where spec-harness keeps its state in one: move it away, and run the command again`, exit 2; the server's tool error in the same words |
| `.git/spec-harness/escalations` a file | the same, EEXIST on Windows | the same line, naming `escalations` |
| a named pipe at `.claude/settings.json`, `.claude/settings.local.json`, the user's `settings.json`, `.mcp.json` or `known_marketplaces.json` | `doctor` and `init` do not come back in 20 s; the hook as without it | each comes back, the file read as one that cannot be read as JSON |
| a named pipe at `.spec-harness.json` | no command comes back, the hook before a write among them | `.spec-harness.json is neither a file nor a directory, not a configuration file`, exit 2, from every command and the hook |
| a named pipe at `.spec-brief.json` | `doctor`, `init` and the hook do not come back | `init` comes back; `doctor` and the hook wait on spec-brief, which does not |
| a `core.hooksPath` that names a file: `rev-parse --git-path` exits 128, `fatal: Invalid path '.../hooksfile/pre-commit': Not a directory`, and a commit runs no hook | `where git runs its hooks cannot be told: git does not say where they are; spec-harness needs git 2.31 or later`, exit 0; `init` advises the same | `... cannot be told: git rev-parse --git-path hooks/pre-commit failed: fatal: Invalid path '...': Not a directory`, exit 0; `init` advises the same |
| an array under `PreToolUse` in `.claude/settings.json`, and no line of the hook | `claude  neither ... guards no write: run spec-harness init --write, or install the plugin`; `init --write` then advises the array and writes no hook | the first line advises the array and its mend, then `init --write`; `init` as before |
| the same array in the user's settings, or under `PostToolUse` | `run spec-harness init --write`, which writes the hooks | the same |

So four claims hold, and one in part: a state directory that is a file
ends no `doctor` and no `init`; it ends `escalate` and `rule`, as the
amendment that left it had it. A named pipe holds more than a settings
file: the servers' file, Claude Code's record of marketplaces, and
`.spec-harness.json`, under which every command, the hook among them, did
not come back.

- **A hyphen in a matcher of names is read as the release on `PATH` reads
  it, or cannot be told.** The changelog says that such a matcher matched
  as a substring, and not how the rest of it was read: the names it lists
  matched exactly but the hyphenated one, which is in no writing tool's
  name; the matcher read as a pattern, which matches anywhere in a tool's
  name, so that `Edit` matches `NotebookEdit` too; or its whole text found
  in a tool's name, which no writing tool's holds, since none has a hyphen.
  Which it was is not on the page, and no Claude Code was run. So from
  2.1.195 on a matcher of names is the names it lists, as every release was
  read before; under 2.1.139 to 2.1.194, and where the release cannot be
  told, a matcher of names with a hyphen in one is read as the three agree,
  and is *cannot tell* where they differ: said with the release and with
  what it is from 2.1.195 on, never fine, a failure under `--strict`, and a
  line `init` writes no hook beside. Where the three come to no tool that
  writes, `Bash|my-tool`, nothing turns on the release and nothing is said.
  A comma beside a hyphen under a release before 2.1.191 is read by the
  comma, as the amendment of 2026-10-14 has it, and from 2.1.191 to 2.1.194
  by the hyphen. `doctor` asks the release where something wires the guard,
  as before, and `init` where what it reads of a line turns on it.
- **Only a file is read where a file is expected.** A settings file of the
  three, `.mcp.json` and the record of marketplaces that is neither a file
  nor a directory is read as one that cannot be read as JSON, as a
  directory is (ADR-0012, Consequences), and `.spec-harness.json` that is
  neither is refused in a line, exit 2, as one that is a directory is, by
  every command and by the hook, before a write as after one, which holds
  the write as a configuration that does not load does.
- **A hook file the account may not read is said by what git does with
  it.** Where git may not execute it, it skips it with a hint and commits
  (mode 000): said, and fails nothing. Where it may (111, 333), git runs it,
  and the shell it starts a script with cannot read it either and stops the
  commit; a program would run unread, and which it is cannot be read: *cannot
  tell*, never fine, a failure under `--strict`. `init` advises in the same
  words and writes nothing over it. `--format json` has the `gitHook.state`
  `unreadable`.
- **A path under the git directory where the harness keeps its state that
  is no directory is named in a line** (ADR-0003): Node refuses the
  directory with ENOTDIR where the path above is a file and EEXIST where the
  path itself is, and the harness finds which step stands in the way and
  says it, exit 2, where Node's words and a stack sent a person looking for
  a defect. The server answers the tool call with the same words.
- **git's own words where it names no hook.** Under a `core.hooksPath` that
  names a file, `rev-parse --git-path hooks/pre-commit` exits 128 with
  `fatal: Invalid path '.../hooksfile/pre-commit': Not a directory`, and a
  commit runs no hook. `doctor` and `init` say that where git runs its hooks
  cannot be told, with git's first line, and fail nothing for it, as
  before.
- **The advice is the one at the end.** Where an array unloads the
  project's `.claude/settings.json`, the file `init` writes its hooks into,
  and nothing wires the guard, `doctor`'s first line advises the array, its
  mend and then `init --write`, where it advised `init --write`, which wrote
  no hook there and advised the array. So does the line for a plugin that
  is not on this machine. An array in a settings file of the person's own
  unloads that file alone, and changes nothing here. `--format json` gains
  `claudeCode.unloaded`, the event and the array, or `null`; no
  `schemaVersion` moves.
- **The hook answers no line differently but the configuration's pipe.**
  The 52 lines of the amendment before this one were handed to the hook
  through the launcher of 0.18.0 and of this change on Windows, 364 runs,
  and the exit code and both streams were the same in every run. On Linux
  a named pipe at `.spec-harness.json` is now a configuration that does not
  load, exit 2, which holds the write, where the hook did not come back.

An exit code that can change for a tree that passed is a minor release
(spec-core's ADR-0009). What was measured for this and left as it was:

- **A named pipe at `.spec-brief.json`.** The harness reads it as no file
  now, and spec-brief, which every command that names a brief asks, reads
  it as its configuration and does not come back; neither does the command
  that waits on it, the hook among them. That is spec-brief's to read, and a
  budget on a sibling's run is a change of its own (ADR-0002).
- **`.spec-harness.json` the account may not read** is refused in a line,
  exit 2, in words that call it JSON that is not valid.
- **A brief's file or a document a brief cites that is a named pipe** is
  read as it was: a repository holds no named pipe, and spec-brief reads a
  brief's file first.
- **On Windows** a hook file the account may not read was not measured:
  that is an access list, which this was not run to change.

*Amended a third time 2026-10-18.* **The work tree a hook decides for is the
one Claude works in, and a branch is read as HEAD names it.** *Claimed* by
the evaluation of a consumer's request in round 24, measured at bd6a87c: in
a worktree session started from the desktop app the hook reads the main
checkout's branch, and a write the worktree's brief protects passes with no
word; and a branch beside a tag of its name names no brief.

What Claude Code hands the hook, read from its documentation on 2026-10-18.
In a worktree session started from the desktop app it reads the project's
hooks from the main checkout's root, runs hook commands there and points
`${CLAUDE_PROJECT_DIR}` at it, and the worktree's path is the input's `cwd`
(<https://code.claude.com/docs/en/worktrees>, *What worktrees share with
the main checkout*). After Claude enters a worktree mid-session,
`${CLAUDE_PROJECT_DIR}` stays at the project where the session started, and
`cwd` is the worktree's root, and moves again when Claude runs `cd`
(<https://code.claude.com/docs/en/hooks>, *Reference scripts by path*).

*Measured* again through the launcher of main as it stood, fd76621, and of
this change (Windows 11, Node 24.18.1, Git for Windows 2.55.0), in scratch
projects with spec-brief 0.8.0 and the harness installed in the main
checkout and `node_modules` ignored, brief 042 protecting
`src/db/schema.ts`: the hook started as its line starts it, from the project
with `CLAUDE_PROJECT_DIR` naming it, and handed an Edit with the `cwd` the
row gives. The middle column is the decision as it was handed over, read
literally (every path of the write read against the work tree that holds
`cwd`), built and run the same way.

| The layout, and the write | fd76621 | Read literally | Now |
| --- | --- | --- | --- |
| the project on `main`; `cwd` a worktree inside it on `claude/brief-042-w`; an Edit of the worktree's protected file | exit 0, no word | refused | refused |
| the same, `cwd` a directory below the worktree's top | exit 0, no word | refused | refused |
| the same, the worktree beside the project | exit 0, no word | refused | refused |
| the same, after an Edit outside the worktree's scope | nothing | a warning, by its brief | the same |
| the same, an Edit in its scope, before it and after it | nothing | nothing | nothing |
| the project on `brief/042-q`; `cwd` a worktree inside it, or beside it, on a branch that names no brief; an Edit of the project's protected file | refused | exit 0, no word | refused |
| the same, after an Edit of the worktree's own file of that name | a warning by the project's brief, of `.claude/worktrees/m/src/db/schema.ts` | nothing | nothing |
| the project a worktree on a brief's branch, inside a main checkout on `main`; `cwd` the main checkout; an Edit of the worktree's protected file | refused | exit 0, no word | refused |
| `cwd` a repository of its own inside the project, or a submodule; an Edit of the project's protected file | refused | refused | refused |
| the same, an Edit of a file the nested repository's own brief protects | nothing before it; after it, a warning by the project's brief | the same | the same |
| `cwd` a directory in no work tree, or one that is not there | refused | refused | refused |
| a branch beside a tag of its name; an Edit of its protected file | exit 0, no word | | refused |
| the same, `doctor` | `branch heads/claude/brief-042-t`, `brief (none named)` | | `branch claude/brief-042-t`, `brief 042` |
| the same, git's hook with the protected file staged | exit 0 | | exit 1, refused |
| a branch beside a remote-tracking ref of its name, or a tag `heads/` and its name | refused | | refused |
| a linked worktree with no install; git's hook as `init` writes it, the protected file staged | exit 2: the script `is not in` the work tree git commits in | | exit 1, refused by the worktree's brief |
| the same, the line `init` advises for a hook of the repository's own | exit 1: node cannot find the script | | the same |
| the same, `hook git` run from the main work tree's install | exit 2: spec-brief `is not installed here` | | exit 1, refused |
| the same, `doctor` | every sibling `absent`, exit 1 | | found in the main work tree's install, said so, exit 0 |

So the first claim holds in every layout where a worktree's brief protects
the file, beside the project as inside it, and the second for a tag of the
branch's name and for a ref `refs/<name>`, under which `git symbolic-ref
--short HEAD` answered `heads/<name>`; a remote-tracking ref of the name and
a tag `heads/<name>` leave the short name as it is.

- **The repository is named as before**: `--root` on the line, then
  `CLAUDE_PROJECT_DIR`, then the question's `cwd`. Where `cwd` is in another
  work tree of that repository, linked or main, by the git directory the
  two share as git names it (`rev-parse --path-format=absolute
  --git-common-dir`, both spelled as the filesystem spells them), that work
  tree decides the paths it holds: its branch names the brief (ADR-0004 is
  unchanged), its briefs, its configuration and its rulings are read, and a
  path is read from its top.
- **A path that work tree does not hold is decided as before**, by the work
  tree the root names. The decision handed over read every path of the
  write against the work tree that holds `cwd`. Read so, the three rows the
  table marks turn a refusal into a write passed with no word: a session
  whose `cwd` is a worktree on a branch that names no brief, writing to the
  project's protected file. Where both work trees hold a path, one is
  inside the other, and the inner one holds it, as git reads a path under a
  worktree in `.claude/worktrees/`. Claude Code blocks an Edit, a Write or a
  NotebookEdit that targets the main checkout while a session is isolated
  in a worktree (the worktrees page, *How Claude Code enforces isolation*);
  a session that runs `cd` into another work tree is not isolated, and the
  hook is what is left there.
- **git is asked only where the work tree may be another.** A `cwd` at the
  project's top or below it, with no `.git` in a directory between, is in
  the project's work tree, and nothing more is asked: a session at its
  project's root starts no process it did not. Elsewhere one start of git
  names the top and the common directory, beside the branch where a `.git`
  stands in `cwd`, and the work tree's configuration is read only where it
  holds a path of the write. Measured with the two builds taking turns,
  ten runs of each at the median, where starting node to do nothing took
  676 ms beside them:

  | The hook before an Edit | Processes | fd76621 | Now |
  | --- | --- | ---: | ---: |
  | `cwd` the project's top, on `main` | 2, then 2 | 780 ms | 786 ms |
  | `cwd` a directory below it | 2, then 2 | 767 ms | 776 ms |
  | `cwd` a worktree inside the project, of its protected file | 2, then 5 in three waves | 768 ms | 1,620 ms |
  | the same, the worktree beside the project | 2, then 5 in three waves | 785 ms | 1,675 ms |
  | `cwd` the project's top on a brief's branch, of its protected file | 3, then 3 | 1,606 ms | 1,599 ms |

  In a worktree a write now costs what one on a brief's branch costs in the
  project: two of git's processes at once for the worktree, and spec-brief,
  which was not asked where no brief was named.
- **A `cwd` in another repository, or in none, leaves every path where it
  was.** A repository of its own inside the project, a submodule, a clone
  beside it: the write is decided by the project's briefs, by the path the
  file has in the project. What that lets through, as it did: a file the
  nested repository's own brief protects is outside the project's scope,
  warned of after the write and not refused, and a file of a repository
  beside the project is outside the project and passes with no word. That
  repository is guarded by its own hook, in its own sessions.
- **A worktree with no install is checked with the project's.** The
  siblings of the work tree that holds `cwd` are looked for in its own
  `node_modules`, then in the project's, where Claude Code starts the hook's
  script from. The first that has a sibling runs it, at its floor in
  `src/versions.ts`, so a worktree's own install that is too old holds the
  write, as the project's would; where neither has one, the write waits, as
  it did. A command `tools` names is run as named.
- **git's hook does the same.** git starts it at the top of the work tree
  it commits in (ADR-0012), and in a linked worktree with no install the
  hook `init` wrote refused the commit, its script not being there. The
  hook `init` writes now looks for the script there and then in the
  repository's main work tree, the one whose `.git` the common directory
  is, where `git worktree add` was run; `hook git` and `doctor` look for the
  siblings in the same two places, and `doctor` says, of a sibling found in
  the main work tree's install, whose it is. A common directory of any other
  name, a bare repository's, a submodule's or one kept apart, has no main
  work tree to look in, and the commit waits as before. `init` writes a
  hook once, so one an earlier release wrote refuses such a commit until it
  is written again; a line a person wrote into a hook of their own is
  theirs, and fails where its script is not.
- **The branch is read as HEAD names it**: `git symbolic-ref --quiet HEAD`,
  with `refs/heads/` taken off, and a HEAD that points elsewhere under
  `refs/` named whole, as `git status` names it. Of `--short` the manual
  says only that it tries to shorten the name (git-symbolic-ref(1),
  *Options*, as Git for Windows 2.55.0 has it, read 2026-10-18). Measured,
  it shortens to the name git reads as that ref and no other, which a tag
  or a ref under `refs/` of the branch's name changes: gitrevisions(7)
  (*Specifying revisions*) has `refs/<refname>` and `refs/tags/<refname>`
  read before `refs/heads/<refname>`.
- **Every other short name was read for the same.** The remote's default
  branch, `symbolic-ref --short refs/remotes/origin/HEAD`, is a ref the
  harness hands git and spec-brief as the base, so it stays the name git
  reads as that ref and nothing else: beside a local branch `origin/main`
  it is `remotes/origin/main`, where `origin/main` would be the branch. The
  local branches, `for-each-ref --format=%(refname:short)`, were compared
  with the branch's name for the base `init` chooses, so they are read as
  both, the name (`%(refname:lstrip=2)`) and the ref, and where the base is
  the branch it is written as the ref: `heads/main` beside a tag `main`, as
  before, where `main` would be read as the tag. git-for-each-ref(1)
  (*Field names*) has `:short` as the non-ambiguous short name, and
  git-check-ref-format(1) no control character in a ref's name, so a tab
  parts the two.

Tests run the hook on the words its line hands it, in each layout of the
table: a protected write in a linked worktree refused with the main
checkout on `main`, with an install in the worktree and without one, beside
the project and inside it; the project's own writes decided as before; a
`cwd` in another repository and in none; the branch beside a tag, through
the hook, git's hook and `doctor`; and git running the hook `init` writes
in a linked worktree with no install, with the main work tree's and with
neither. Every tree of the table was run through both builds, and
`tests/integration/released-lines.test.ts` holds.

A write that passed is refused, and a commit: a minor release (spec-core's
ADR-0009). What was measured for this and left as it was:

- **A session started in a worktree that has no install.** Claude Code
  names that worktree as the project, and the hook's line names its script
  by `${CLAUDE_PROJECT_DIR}`: node cannot find it and exits 1, which the
  hooks reference (*Exit code output*) has as an error that does not block,
  and the write goes ahead. The harness does not run, so it can say
  nothing. Install the project there, or start the session in the main
  checkout.
- **A path in a third work tree**, neither the one that holds `cwd` nor the
  one the root names, is decided by the root's, as before, and passes as a
  file outside it.
- **The other commands**, `guard`, `context`, `audit`, `probe` and the
  rest, read a work tree's own install, as before.

*Amended a fourth time 2026-10-18.* **The hook says, as a session starts,
what would hold every write of it.** *Claimed* by the evaluation of a
consumer's request in round 24: nothing runs at session start, and a
SessionStart entry aimed at the hook exits 1, `the hook input names no event
or tool`; a configuration that does not load, or a brief the branch names
that is none, is learned at the first write, which it holds. *Measured*
through the launcher of main (fd76621) and of this change (Windows 11, Node
24.18.1, Git for Windows 2.55.0), the hook handed a SessionStart question as
Claude Code's hooks reference shows it (`h24-measure-h3.mjs`):

| As the session starts | main | Now |
| --- | --- | --- |
| no brief named, or a brief's branch, however the session starts (`startup`, `resume`, `clear`, `compact`, `fork`) | exit 1, `the hook input names no event or tool` | exit 0, nothing |
| a branch that names a brief spec-brief does not list | the same | exit 0: `the branch names brief 999, and spec-brief knows no such brief, so every write of this session is held until it is mended: fix the brief or the branch before writing; spec-harness doctor says more`, as `systemMessage` and as `additionalContext` |
| `--brief 404` on the line, or `SPEC_BRIEF=404` | the same | exit 0, the same line by what names it |
| a configuration that does not load | the same | exit 0, the configuration's own words, and that every write is held |
| a brief's branch, spec-brief not installed, or too old | the same | exit 0, the words a write is held with |
| no brief named, spec-brief not installed | the same | exit 0, nothing: no write runs it |
| a `--root` on the line that is not there, a line the parser cannot read | exit 1, the guard is off | exit 0, the same words, of every write of the session |
| a session in no work tree | exit 1 | exit 0, nothing |
| a question that is not JSON, an event that names no tool and is not SessionStart | exit 1 | the same |
| before and after a write, every case of the amendments above | | the same |

What the hooks reference has of the event, read 2026-10-18
(<https://code.claude.com/docs/en/hooks>, *SessionStart*, *SessionStart
input*, *SessionStart decision control*, *JSON output* and *Exit code 2
behavior per event*): it runs as a session starts or resumes, is cleared,
compacted or forked, `source` saying which; it cannot block, and exit 2
shows its stderr to the person alone; in an interactive session it runs
in the background and Claude's first response waits for it; `systemMessage`
is a warning shown to the person, and `additionalContext` is, in the
page's words, a "String added to Claude's context at the start of the
conversation, before the first prompt". The brief this follows named four
sources; the page has a fifth, `fork`, from Claude Code 2.1.214, and the
hook reads every source alike.

- **It checks what a write of the session would need**: that the
  configuration loads, that a brief named by the line, `SPEC_BRIEF` or the
  branch is one spec-brief lists and has not archived, and, where one is
  named, that spec-brief is there at its floor and can list the briefs.
  spec-brief is the one sibling a write runs. Each is said in the words a
  write would be held with, which are `doctor`'s: the brief by what names
  it, the configuration and spec-brief in their own.
- **One line, twice, and exit 0.** The person reads it as `systemMessage`
  and Claude as `additionalContext`, so that neither starts the session's
  work to meet it at the first write. Nothing is said where all is well,
  and a check that cannot be made says what stopped it: the session's start
  is never ended by it.
- **The hook's own line is said there too.** A line the parser cannot read
  and a root that is not a directory are said in the words a write is told
  with, of every write of the session, exit 0 where a write's run exits 1.
  A root outside any work tree is a session outside one, and says nothing,
  as before.
- **The work tree read is the one a write is decided in**, as the third
  amendment of the day has it: the repository the root on the line,
  `CLAUDE_PROJECT_DIR` or the question's `cwd` names, and in it the work
  tree that holds the question's `cwd` where that is another of its work
  trees, with its siblings looked for in its install and then the
  project's. A desktop session in a worktree on a branch naming a brief
  spec-brief does not list is told so as it starts, though the main
  checkout names none.
- **Every answer before and after a write is as it was.** Every line of the
  hook the amendments above measured, before seven writes and after each,
  and git's hook, was run through both builds (`h24-hook-compare.mjs`): of
  552 runs, the 28 of `hook claude --help` and `-h` print the help with its
  new words for the event, exit 0 as before, and the other 524 are the same.

A SessionStart entry that ran the hook exited 1 and now exits 0, and `init`
writes an entry it did not: a minor release (spec-core's ADR-0009).

**What it costs a session's start**, the builds taking turns inside each
round, at the median with the 95th percentile between brackets
(`h24-bench.mjs <work> <rounds> <out.json> main=<build> h2=<build>
h3=<build>`): on GitHub's Windows runner (`windows-2025-vs2026`, Node
24.21.0, Git for Windows 2.56.0), thirty rounds, through a workflow of a
draft pull request that measured and was closed
(spec-family/spec-harness#111), where starting node to do nothing took 60
ms; and on the Windows workstation (Node 24.18.1, Git for Windows 2.55.0),
ten rounds, where it took 693 ms, the machine shared. main's hook answered
the question with exit 1 and nothing else.

| As the session starts | Runner: main | This change | Workstation: main | This change |
| --- | ---: | ---: | ---: | ---: |
| no brief named | 86 ms (92) | 140 ms (156) | 725 ms (771) | 774 ms (821) |
| a brief's branch | 86 ms (92) | 325 ms (339) | 722 ms (756) | 1,615 ms (1,691) |
| a branch that names a brief spec-brief does not list | 88 ms (96) | 324 ms (347) | 732 ms (764) | 1,652 ms (1,700) |

That is a write's check, without the write: two of git's processes, and
spec-brief where a brief is named. The hooks reference has an interactive
session's SessionStart hooks run in the background, with Claude's first
response waiting for them, once a session.

*Amended 2026-10-19.* **A report at the end of a turn, where the
configuration asks for one.** An agent that writes through a shell passes
the guard, which Claude Code starts for Edit, Write and NotebookEdit, and
is caught at the commit and at the audit. Round 24's evaluation of a
consumer's request weighed two ways to say such a write sooner: a hook after
every shell command, and one report a turn of what the work tree holds; the
user chose the second, off by default.

*Measured* through the launcher of main (3c4112c) and of this change
(Windows 11, Node 24.18.1, Git for Windows 2.55.0), in scratch projects
with spec-brief 0.9.0 installed and brief 042 covering `src/auth/**` and
protecting `src/db/**`, each handed the question Claude Code's hooks
reference shows for `Stop`, with the processes the run started written down
by a preload (`h25-measure-h2.mjs`):

| As the turn ends | main | Now |
| --- | --- | --- |
| `turnReport` off, a protected file changed | exit 1, `the hook input names no event or tool`, no process | exit 0, nothing; two of git's processes, opening the work tree |
| `turnReport` on, no brief named, a protected file changed | the same | exit 0, nothing; the same two |
| `turnReport` on, a brief's branch, nothing changed | the same | exit 0, nothing; the two, spec-brief, and `git status` |
| `turnReport` on, a brief's branch, `src/db/schema.ts` changed and `notes/new.md` made, by no hook | the same | exit 0, one `systemMessage`: `spec-harness: as this turn ended, the work tree held changes to 2 paths that brief 042 protects or that are outside its scope:`, then a line for each, `src/db/schema.ts` as protected and `notes/new.md` as outside the scope, in the words a write of each is given; the same four processes |
| `turnReport` on, a branch that names a brief spec-brief does not list | the same | exit 0, `the branch names brief 999, and spec-brief knows no such brief, so what the work tree holds is not reported, and every write is held; spec-harness doctor says more`; the two and spec-brief |

What the hooks reference has of the end of a turn, read 2026-10-19
(<https://code.claude.com/docs/en/hooks>, *Stop*, *Stop decision control*,
*JSON output*, *Block the action when a hook fails* and *Run hooks in the
background*). `Stop` runs when the main agent has finished responding, and
not where a person interrupted it; an API error runs `StopFailure` instead,
whose output is ignored. Under `Stop`, `decision: "block"` and exit 2 keep
Claude going, and so does `hookSpecificOutput.additionalContext`, which
Claude reads "at the end of the turn" while the conversation continues so
that it can act on it, within the same loop protections, `stop_hook_active`
and a cap of eight continuations in a row. `systemMessage` is a warning
shown to the person. `continue: false` stops Claude entirely and takes
precedence over any event-specific decision field. An entry with `async:
true` runs in the background, can block and control nothing, and once it
exits Claude Code delivers its `additionalContext` and `systemMessage` to
Claude on the next conversation turn, showing neither to the person; while
the session is idle the delivery waits for the next prompt, and under `-p` a
background hook still running at the end is killed. `onFailure` has no
effect on `Stop` or on a background hook.

So a report that reaches Claude as the turn ends keeps the turn going, which
is not what was decided; and nothing the hook prints reaches both the person
and Claude without that, but `continue: false` with a `stopReason`, which
would end a turn another hook keeps going, a `/goal` among them. What was
built:

- **`turnReport`, a key of `.spec-harness.json`, `false` by default.**
  `true` alone turns it on, and anything but `true`, `false` or `null` is a
  configuration that does not load, as every key's wrong value is.
- **The hook reads `Stop`** as it reads `SessionStart`, a question that names
  no tool. With `turnReport` off it says nothing and starts nothing past
  opening the work tree; with it on, it reads the work tree a write of the
  session is decided in, as the amendments of 2026-10-18 have it, and the
  brief that work tree's branch, the line or `SPEC_BRIEF` names.
- **One start of git a report:** `git --no-optional-locks status
  --porcelain=v2 -z --untracked-files=all`, every path that differs from
  HEAD in the index or the work tree, unmerged or untracked, an untracked
  directory's files one by one, a rename by both its paths
  (git-status(1), *Porcelain Format Version 2*, as Git for Windows 2.55.0
  has it, read 2026-10-19). git's manual has a status run in the
  background take no optional lock, since the lock it takes to write the
  index it refreshes can make another git beside it fail (git-status(1),
  *Background Refresh*; git(1), `--no-optional-locks`): the report runs
  beside Claude's next turn and its git.
- **Each path is decided as a write of it is**, by the brief and the
  `outOfScope` in force, and every decision that is not `allow` is said in
  its own words and next step: a protected file, a protection that cannot
  be read, and a file outside the scope, warned of, asked about or refused
  as `outOfScope` says. No ruling is read, which would ask git for the base
  and a commit's signature: a protected file a signed ruling allows is
  reported as protected, and the audit reads the ruling. Twenty paths are
  named one by one, and past them how many more there are.
- **One `systemMessage`, exit 0, or nothing**, and never `decision`,
  `additionalContext`, `continue` or exit 2. A brief named that spec-brief
  does not list, and a line of the hook's own it cannot read, are said there
  in the words a session's start has for them; a configuration that does not
  load, which every write and the session's start say already, and a
  session in no work tree, say nothing; a git that fails is said in its own
  words.
- **`init` writes the entry with `async: true`** (ADR-0012, amended the same
  day): the turn waits on none of it, and Claude reads the report as the next
  turn begins. Run without `async`, the same line shows the person the
  report as the turn ends, Claude reads none of it, and the end of the turn
  waits for the hook, as for any entry it waits on. Two entries would be two
  reports and two starts of git a turn, and were not written.

**Why one report a turn is not the hook the amendment of 2026-09-30 turned
down.** That one ran after every shell command, so every command paid for
it; it read a command's words, which are easy to get around; and the audit
stayed the gate. This one is asked for, and off otherwise; it is paid once a
turn, in the background, where the turn waits on nothing; it reads the work
tree and not a command, so how a file was changed, a shell, a script or a
tool, makes no difference to it; and it refuses and holds nothing, so the
audit stays the gate. What it lets through: a change made and undone within
a turn, and one committed within it, which git's pre-commit hook and the
audit have; an ignored file; a turn an interrupt or an API error ended, for
which no `Stop` runs; and a write it reports has happened, the report being
read when the next turn begins.

**What it costs**, the builds taking turns, ten rounds at the median, beside
`node -e 0`:

| As the turn ends | main | Now |
| --- | ---: | ---: |
| `turnReport` off | 934 ms | 1,028 ms |
| `turnReport` on, no brief named | 954 ms | 1,059 ms |
| `turnReport` on, a brief's branch, nothing changed | 991 ms | 2,221 ms |
| `turnReport` on, a brief's branch, two paths reported | 913 ms | 2,234 ms |
| `turnReport` on, a brief spec-brief does not list | 962 ms | 2,225 ms |

On the Windows workstation, where starting node to do nothing took 907 ms
beside these runs, the machine shared; main's column is the hook reading a
question it refuses. Where `init` writes the entry, in the background, the
turn waits on none of it.

Every answer before and after a write, and as a session starts, is as it
was: the lines of the hook the amendments of this record measured were run
through both builds before seven writes and after each, as a session starts,
and git's hook beside them, and again after seven changes to what spec-brief
reads (`h25-hook-compare.mjs`), 913 runs: 883 the same, and the 30 of `hook
claude --help` and `-h`, which print the help with its new words for the end
of a turn, exit 0 as before.

A `Stop` entry aimed at the hook exited 1 and is now read, and a key is
added: a minor release (spec-core's ADR-0009).

*Amended 2026-10-19.* **A path is decided by the work tree of the
repository that holds it, and every command finds the siblings as the hook
does.** *Claimed* by round 24's agent H, from the third amendment of
2026-10-18, which left them: a path in a third work tree, neither the one
that holds the question's `cwd` nor the one the root names, is decided by
the root's and passes as a file outside it; `guard`, `context`, `audit` and
`probe` look for the siblings in a work tree's own install alone, where the
hook falls back to the project's; and a nested repository's own brief is not
applied.

*Measured* through the launcher of main (3c4112c) and of this change
(Windows 11, Node 24.18.1, Git for Windows 2.55.0; `b25-measure-b3.mjs`), in
a project on `main`, which names no brief, with spec-brief installed in its
main checkout: worktrees `a` and `b` under `.claude/worktrees/`, on
`brief/001-a` and `brief/002-b`, and `c` beside the project on
`brief/002-c`, each brief protecting `src/db/**`, none of them installed
into; and a repository of its own at `vendor/nested`, on a branch whose
brief protects the same. The hook started as its line starts it, from the
project with `CLAUDE_PROJECT_DIR` naming it.

| The write, and where `cwd` is | main | Now |
| --- | --- | --- |
| an Edit of `b`'s protected file, `cwd` in `a` | exit 0, no word | refused, by brief 002 |
| an Edit of `c`'s protected file, `cwd` in `a` | exit 0, no word | refused, by brief 002 |
| an Edit of `b`'s or `c`'s protected file, `cwd` at the project | exit 0, no word | refused |
| an Edit of `a`'s protected file, `cwd` in `a`; one of `b`'s file in its scope; one of the project's protected file | refused; nothing; nothing | the same |
| after each of these writes | nothing | nothing |
| an Edit of the nested repository's protected file, `cwd` at the project or in it | exit 0, no word | the same |
| `guard src/db/schema.ts`, `context`, `rulings`, `audit`, `probe`, `premises`, in `a` | exit 2, `spec-brief is not installed here` | the main work tree's install: `guard` refuses, exit 1, and each other answers |
| `doctor` and git's hook in `a` | the main work tree's install | the same |

So the claims hold: where a session at the project, or in one worktree,
writes into another, the hook read the path from the project's top, as a
file of `.claude/worktrees/b/` under the project's branch or as one outside
the project, and passed it.

- **The innermost work tree of the repository that holds a path decides
  it.** For each path the hook looks through the directories above it, with
  no process, for each that holds a `.git`. The first is the root's own top:
  the path is decided as before. Any other is asked of git once, and where
  it is the top of a work tree that shares the git directory the root's
  repository keeps, that work tree decides the path: its branch names the
  brief, and its briefs, configuration and rulings decide it, read from its
  top, with its siblings looked for in its install and then the project's,
  as `cwd`'s were. One of another repository's, a submodule's or a clone's,
  is passed by for the next above it. So a path is decided by the work tree
  that holds it whichever `cwd` is in, and the one `cwd` is in decides the
  paths it holds as it did; a question with no `cwd` is read the same way.
  A session at its project's root writing the project's own files starts no
  process it did not: the walk stops at the project's top.
- **After a write, a path in another work tree is decided again.** The run
  after a write that found nothing kept said nothing, with no process
  started, where the configuration of `cwd`'s work tree has
  `outOfScope` other than `warn`. It now does so only where no path of the
  write may be in another work tree than that one, by the same walk: a
  third work tree whose configuration warns is asked.
- **A nested repository is decided as before.** A submodule, or a clone
  inside the tree, is another repository, whose git directory is not the
  root's: a path in it is decided by the work tree of the root's repository
  around it, by that one's briefs, under the path it has there, the
  project's for a clone inside the project and a worktree's for one inside
  that worktree. What that lets through: a file the nested repository's own
  brief protects is outside that scope, warned of after the write and not
  refused, and one the project's brief does not reach passes with no word.
  Its own sessions are guarded by its own hook.
  `tests/integration/worktrees.test.ts` holds both.
- **Every command finds the siblings as the hook does.** `guard`,
  `context`, `rulings`, `audit`, `probe`, `premises`, `escalate`, `rule`,
  `init` and the server look for a sibling in the work tree's own install
  and then, in a linked worktree with none, in the main work tree's, where
  `git worktree add` was run, as git's hook and `doctor` did
  (`MAIN_INSTALL`, `src/workspace.ts`), and so does the hook in the work
  tree its root names. In `cwd`'s work tree, or a third, it looks in that
  one's and then the project's, as before.
- **Where `${CLAUDE_PROJECT_DIR}` points in a session started with `claude
  --worktree` is on no page.** Read 2026-10-19: the worktrees page
  (<https://code.claude.com/docs/en/worktrees>, *Start Claude in a
  worktree*) has the flag create the worktree under `.claude/worktrees/`
  and start Claude in it, and *Set up the worktree environment* has a
  worktree a fresh checkout to install dependencies into; *What worktrees
  share with the main checkout* has a desktop-app session point the
  variable at the main checkout's root, and says nothing of the flag on
  that point; the hooks reference (<https://code.claude.com/docs/en/hooks>,
  *Reference scripts by path*) has the variable the project root where the
  session started, and keeps it where it was when Claude enters a worktree
  mid-session; and the changelog has, under 2.1.78, `--worktree` loading
  skills and hooks from the worktree's directory. Whether the root where
  such a session started is the main checkout or the worktree, no page
  says. Where it is the worktree, and the worktree has no install, the
  hook's script is not there and Claude Code goes ahead with the write
  unless the entry sets `onFailure: "block"`; the README says so.

Every line of the hook the amendments above measured was run through the
launcher of main and of this change on Windows, taking turns, before seven
writes, after each and as a session starts, and git's hook
(`b25-hook-compare.mjs`), in a repository with no worktree: the count is in
the pull request.

A write that passed is refused, and commands that exited 2 run: a minor
release (spec-core's ADR-0009). What was measured for this and left as it
was:

- **A nested repository's own brief** is not applied, as above.

*Amended 2026-10-19.* **The hook says the guard is off with exit 0, so that
`onFailure` holds only a hook that did not run.** *Claimed* by round 24's
evaluation of a consumer's request, measured then: where the session's
project is itself a worktree with no install, the hook's line names a
script that is not there, node exits 1, and Claude Code goes ahead with
the write, a guard off with only a notice; and setting `"onFailure":
"block"` on the entry would also turn the hook's own exit 1, which it
gives where it means that the guard is off and the write goes on, into a
held write.

What Claude Code's hooks reference has, read 2026-10-19
(<https://code.claude.com/docs/en/hooks>, *Exit code output*, *Other exit
codes*, *Timeouts*, *Block the action when a hook fails* and *JSON
output*). A hook that exits with a code other than 0 and 2, or fails in
another way, as by not starting, is a non-blocking error: the action goes
ahead and the transcript shows a notice with the first line of its
stderr, "except for hooks whose failure blocks the action". A hook that
reaches its timeout is cancelled, and before a tool call does not block it.
`onFailure` on a command hook, read by Claude Code 2.1.295 and later, is
`"continue"` by default; set to `"block"`, a failure does what exit 2 does
on the event, and the failures it lists are a hook that cannot start, an
exit code other than 0 and 2 (even one that printed JSON allowing the
action), a timeout and output that is no valid JSON. `systemMessage` is a
field of the hook's JSON every event accepts, a warning shown to the
person; the events that discard it or show it elsewhere are listed under
each event, and `PreToolUse`, `PostToolUse` and `SessionStart` are not
among them.

*Measured* through the launcher of main (3c4112c) and of this change
(Windows 11, Node 24.18.1, Git for Windows 2.55.0), in a scratch project on
a brief's branch whose brief protects `src/db/**` (`b25-measure-b1.mjs`):

| The hook's line, or its question | main | Now |
| --- | --- | --- |
| `hook claude` as `init` writes it, the placeholder filled with a linked worktree that has no install, before a write | node exits 1, `Error: Cannot find module ...`, whose first line on stderr is `node:internal/modules/cjs/loader:1520` | the same: the harness does not run |
| `hook claude --nope`, `--format xml`, `--root --brief 001`, two values for one option, before a write and after one | exit 1, the line on stderr: `the hook's line cannot be read (...), so the guard is off and this write is not checked; ...` | exit 0, the same line as `systemMessage` |
| `hook claude --root nowhere`, or a root that is a file, before a write and after one | exit 1, `--root is "nowhere", which is not a directory, so the guard is off ...` | exit 0, the same line as `systemMessage` |
| a question that is not JSON, is not an object, or names no event or tool, as a `Stop` question does | exit 1, `the hook input is not JSON` and the like | exit 0, the same words and `, so nothing it asks about is checked`, as `systemMessage` |
| a question whose input cannot be read at all (in-process, a stream that throws) | exit 1, `the hook input could not be read: ...` | exit 0, the same as `systemMessage` |
| any of these as a session starts | exit 0, the line as `systemMessage` and `additionalContext` | the same |
| `hook claude --brief 404`, a configuration that does not load, briefs that cannot be read | exit 2, the write held | the same |
| `hook claude` before and after every write, by each tool, and git's hook | | the same, byte for byte |

So the claim holds. Under `onFailure: "block"`, the field Claude Code
reads to hold a hook that could not run, the hook's exit 1 for a line of
its own that turns the guard off held every write of the session, the
one that mends the line among them, which is what the amendments of
2026-10-11 made that exit to avoid.

- **No answer of the hook's is exit 1.** Where it means that the guard is
  off and the write goes on, for a line it cannot read, a root that is no
  directory, or a question it cannot read, it says so in the same one
  line, to the person as `systemMessage`, and exits 0 (`warningResponse`,
  `src/hooks.ts`). The write goes on as it did, and the person reads the
  line as a warning where they read it as a hook error. Exit 2 is for a
  write the hook could not check, as before, and a timeout or a script
  that is not there is no answer of the hook's at all. So `onFailure:
  "block"` holds a write only where the hook did not run, which is what
  the field is for; a person who sets it no longer holds every write for
  a line the hook says is off.
- **The person is told, as before.** The reference has a non-blocking
  error's notice shown in the transcript and `systemMessage` shown to the
  person, and says of neither that it reaches Claude. Claude reads the line
  as a session starts, where it is `additionalContext` as well.
- **A question the hook cannot read is said the same way.** It has no event
  to answer by, and `systemMessage` is a field every event takes; the line
  says, after what was wrong, that nothing it asks about is checked.
- **`doctor` reads the field as the hook now answers.** Of a line that sets
  `onFailure: "block"` it says that Claude Code 2.1.295 or later holds a
  write when the hook fails, by not starting or by running past its
  timeout, where the note said the field held every write under a line
  that turns the guard off. What `init` writes of the field, and what
  `doctor` advises, is ADR-0012's (amended the same day).
- **Every other answer is as it was.** Every line of the hook the
  amendments above measured, before seven writes and after each, as a
  session starts, three questions it cannot read and git's hook, was run
  through the launcher of main and of this change taking turns
  (`b25-hook-compare.mjs`): of 214 runs, 130 are the same, the hook's own
  lines and git's hook among them; 69 are a line that turns the guard off,
  or a question it cannot read, said as `systemMessage` with exit 0 where
  it was stderr with exit 1; 8 are `--help`, whose words are new; and 7 are
  `hook claude --block-on-failure`, a line the parser refused, which now
  names an option `init` reads and so is passed over and guards, as any
  option another command reads is. `tests/integration/released-lines.test.ts`
  holds the hook to exit 0 for every line it says is off, and to no exit
  1 for any line at all.

An exit code that changed is a minor release (spec-core's ADR-0009). What
was measured for this and left as it was:

- **A hook that cannot start says nothing a person can act on.** Where the
  script is not there, the notice carries node's first line on stderr,
  `node:internal/modules/cjs/loader:1520`, which names neither the harness
  nor the missing install. The harness cannot speak where it does not run;
  `doctor` run in that work tree finds the siblings in the main work
  tree's install and says nothing of the hook's script.

*Amended 2026-10-19.* **A configuration that does not load lets a write
to itself through, and to nothing else.** The amendment of 2026-10-08 has a
configuration that does not load end the hook with exit 2, which holds the
write before it, and the fourth amendment of 2026-10-18 has the hook say so
as a session starts. *Claimed* by round 24's evaluation of a consumer's
request: every write is then held, the one that mends the file among them,
so a session cannot mend a typo in `.spec-harness.json` with Edit or Write.
*Measured* through the launcher of 0.19.0 (3c4112c) and of this change,
taking turns, on Windows 11 (Node 24.18.1, Git for Windows 2.55.0, no
`claude` on `PATH`) and, for links and second names, in a container as an
ordinary account (Linux, Node 24.21.0, git 2.47.3): a project on its brief's
branch, the brief protecting `src/db/**` (and `lib/**` in the container),
`.spec-harness.json` holding an unknown key, a text that is no JSON, or an
`outOfScope` it refuses, and the hook handed an Edit, a Write or a
NotebookEdit before the write unless the row says otherwise.

| The write | 0.19.0 | Now |
| --- | --- | --- |
| `.spec-harness.json` by Edit, Write or NotebookEdit: absolute, relative to the question's `cwd`, or through `src/..` | exit 2, in the configuration's words | exit 0, no decision, and the line to the person and to Claude |
| the same in upper case | exit 2 | on Windows, the same file: let through; on Linux, another: exit 2 |
| `src/.spec-harness.json`, `.spec-harness.json.bak`, the protected file, a file in the scope | exit 2 | the same |
| a file outside every work tree of the repository | exit 2 | exit 0, no word: a write outside every work tree (below) |
| a link to the configuration, absolute or relative (Linux) | exit 2 | the same |
| `deep/../.spec-harness.json`, `deep` a link to `lib/x`: the configuration as the path is written, `lib/.spec-harness.json` on the disk (Linux) | exit 2 | the same |
| `a/up/../.spec-harness.json`, `up` a link to `src`: `a/.spec-harness.json` as written, the configuration on the disk (Linux) | exit 2 | the same |
| `src-link/../.spec-harness.json`, `src-link` a link to `src`: the configuration both ways (Linux) | exit 2 | let through |
| the configuration with a second name, by either name | exit 2 | the same |
| the configuration a link to the protected file, or a second name of it | exit 2 | the same |
| the configuration a link to a file outside every work tree (Linux) | exit 2 | exit 0, no word: a write outside every work tree (below) |
| `.spec-harness.json` a directory: it, or a file in it; a named pipe (Linux) | exit 2 | the same |
| the project's configuration does not load: its file, from the project or from a linked worktree | exit 2 | let through |
| the same: the worktree's own `.spec-harness.json`, from either | exit 2 | the same |
| a linked worktree's configuration does not load: its file, from the worktree | exit 2, `cannot check this write: ...` | let through |
| the same: the worktree's protected file | exit 2 | the same |
| its file, from the project | a file of the project's before main decided a path by the work tree that holds it; on main of 6e605d5, exit 2, `cannot check this write: ...` | let through |
| after a write to the configuration that leaves it as it was | exit 2, in its words, which reach Claude | the same |
| after the write that mends it, and the write after that | decided under what it holds | the same |
| as a session starts | `..., so every write of this session is held until it is mended; ...` | `..., but for a write to <the file> itself, which is not checked; ...` |

So the claim holds, and of a linked worktree's own configuration as well.

- **The file itself, and nothing else.** A write is let through where the
  configuration that did not load is a file that stands under its name
  alone, neither a link nor a file with a second name, since a write to a
  file with two names writes both; and where every path of the call names
  that file. A call that names it and another file is a write to both, and
  is held. Every other write is held as before, in the same words.
- **As the hook reads a path, and as the disk does.** The hook decides a
  path by its real spelling (`realSpelling`, `src/fs.ts`), which reads a
  `..` as written and then resolves links; the disk resolves a link before
  the `..` that follows it, on Linux and macOS, where Windows reads the
  path as written first (measured: Node's write of `deep\..\written.txt`,
  `deep` a junction to `lib\x`, made `written.txt` at the top, and
  `realpathSync.native` named it there). The two can name two files, and a
  write is let through only where both name the configuration and the name
  the path ends in is no link. So a path that only reads like the file, a
  link to it, and a path whose `..` leads elsewhere on the disk are held,
  and so is a file of another work tree. On a filesystem that ignores case
  the file in another case is the file, as it is to every decision of the
  hook's.
- **Which configuration.** The one that did not load, of the work tree the
  write is decided in: the project's, which the hook's root names, or that
  of another work tree of the repository that holds the path, whichever
  work tree the question's `cwd` is in (the amendment of 2026-10-19 that
  has a path decided by the work tree of the repository that holds it;
  measured again once it merged, through main's launcher and this one's).
  A write to the project's file from a worktree is the project's to
  decide, and is let through where the project's does not load; while the
  project's does not load, a write to a worktree's is held, since the
  project's work tree is opened first.
- **What it is answered with.** No decision, exit 0: the hook never says
  `allow`, and here says neither `deny` nor `ask`, so the person's own
  permission prompt stands as for any write the guard passes. The line
  `<the configuration's words>, so every other write is held until it
  loads; this write, to <the file> itself, is not checked` goes to the
  person as `systemMessage` and to Claude as `additionalContext`. Claude
  Code's hooks reference (<https://code.claude.com/docs/en/hooks>, *JSON
  output* and *PreToolUse decision control*, read 2026-10-19) has the first
  a warning shown to the user and the second a string added to Claude's
  context beside the tool's result, and a hook that exits 0 with no
  `permissionDecision` leaves the call to the normal permission flow, in
  the words of its example, "No decision: the normal permission flow
  applies".
- **What it lets through.** While the file does not load nothing of it is
  read: no branch template names the brief, and no brief is asked about. So
  a brief that protects `.spec-harness.json`, or an `outOfScope` of `ask`
  or `deny` the file sets, does not hold this write as it would hold it
  once the file loads. The decision was a session that can mend the file
  it is held by; what that write changes is in the round's diff, which the
  audit and spec-brief's archive measure, and the person's permission
  prompt stands.
- **After the write** the hook loads the file again: where it still does
  not load, it says so with exit 2, which shows Claude its words; where it
  loads, the write is decided as any other after it, and every write after
  that is checked under what the file now holds.
- **As a session starts** the line says the same, where a write to the
  file would be let through.
- **The hook answers nothing else differently.** The lines of the hook the
  amendments above measured, before nine writes and after each and as a
  session starts, and git's hook, were run through both builds, in a
  project whose configuration loads and in two whose configuration does
  not (`f25-hook-compare.mjs`); the runs that differ are the writes to the
  configuration itself and the session's start, above.
  `tests/integration/released-lines.test.ts` holds.

**A write outside every work tree of the repository is not held by what
holds the writes inside.** Added to this change after it was handed over,
as the user chose. *Measured by the parent session from the source*:
`decisionsFor` (`src/cli.ts`) returned the active brief's problem before
any path was read, so a brief no round can work under held every write, a
file outside the repository among them, where the hook passes one with no
word. *Measured again* through both launchers (Windows 11, as above), the
project on a branch whose brief is archived, or names one spec-brief does
not list, or with a configuration that does not load:

| The write, before it and after it | 0.19.0 | Now |
| --- | --- | --- |
| a file outside every work tree of the repository, there or not yet | exit 2, in the problem's words | exit 0, no word |
| `guard` of it | exit 2, the same | `ok  <it> is outside the repository; no brief governs it`, exit 0 |
| the protected file, `README.md`, a file of a linked worktree beside the project on a branch that names the same brief, and a call that names a file inside and one outside | exit 2 | the same |
| a file of a linked worktree on no branch, which names no brief | exit 2, decided by the project's branch | exit 0, no word, decided by that worktree, as on main of 6e605d5 |
| `guard` of a path outside and one inside | exit 2 | the same |
| nothing wrong: a file outside, a linked worktree's file | exit 0, no word | the same |

So the claim holds, for each of the three.

- **Decided as a write outside the repository is**, whichever brief is
  named and whatever is wrong with it: no brief decides a file outside the
  repository, so its problem has nothing of such a write to hold. The
  paths are read before any brief is asked about (`outsideEvery`,
  `src/fs.ts`, in `decisionsFor`), so spec-brief is not run for such a
  write, and one that cannot list the briefs holds none either; and before
  a configuration that does not load is said, in the hook's answer to one.
  A call that names a path inside a work tree and one outside is a write
  inside, and is held.
- **Every work tree of the repository**, as the files git keeps name them,
  with no process: the main work tree, whose `.git` the common directory
  is, and each linked worktree, by `worktrees/<id>/gitdir` under the
  common directory, which gitrepository-layout(5) (as Git for Windows
  2.55.0 ships it, read 2026-10-19) has hold the path back to the
  worktree's `.git`; measured, git 2.55 writes it relative to its own
  directory under `worktree.useRelativePaths`, and it is read so. A path in
  a linked worktree is inside a work tree of the repository, beside the
  project or inside it, and is decided as before, by that worktree (the
  amendment of 2026-10-19 that has a path decided by the work tree of the
  repository that holds it): a problem holds it where the worktree has it
  too, as on a branch that names the same brief.
- **Where they cannot all be named, the write is held as before**: a
  common directory of another name, as a git directory kept apart has, an
  entry under `worktrees` that cannot be read, and, where the configuration
  does not load, a `core.worktree`, `GIT_DIR` or `GIT_WORK_TREE`, under
  which git may name another work tree than its files do. No path is then
  known to be outside.
- **A path with a `..` in it is not known to be outside.** The hook reads
  a path's `..` before its links, where Linux and macOS write it after
  them, as above: `/elsewhere/link/../README.md`, the link to a directory
  of the work tree, reads as outside and is written inside (a test holds
  it, on Linux and macOS). Such a path is held under the problem as every
  write inside is. A path through a
  link with no `..`, the configuration itself a link among them, is read
  where the link leads, as the hook reads every path: one to a file
  outside every work tree is outside, and one into the work tree inside.

A write that was held goes on: a minor release (spec-core's ADR-0009), as
an exit code that changes is. What was measured for this and left as it
was:

- **A path with a `..` after a link, where the configuration loads.** The
  hook decides such a path as it is written. Measured in the container,
  with `deep` a link to `lib/x` and `lib/**` protected: an Edit of
  `deep/../schema.ts` is decided as `schema.ts`, outside the scope, with no
  word before it, and `realpath` names `lib/schema.ts`. Whether Claude
  Code's tools write a path as they are given it or as written after `..`
  is read is on none of its pages read, and no Claude Code was run, so
  whether such a write reaches the protected file cannot be told here. It
  is not of this change, which reads both for the one write it lets
  through.
- **The words of a write that is held** are as they were: they do not say
  that a write to the file goes on.
- **`doctor`** with a configuration that does not load ends as before, exit
  2 in the configuration's words.

*Amended 2026-10-19.* **What `doctor` says of a hook's line that asks for
the help or the version, of a configuration that cannot be read, and of
where git runs its hooks, and a drive letter in either case.** The first
amendment of 2026-10-18 measured three things and left them: `--help` or
`--version` on the hook's line beside a fault the hook says as it runs, a
line `hook claude --help` that `doctor` read as guarding, and a root
compared as Node's `path.resolve` spells it. The second left a
`.spec-harness.json` the account may not read, refused in words that call
it JSON that is not valid; and the third of 2026-10-14 had `where git runs
its hooks cannot be told` fail nothing. *Claimed* by round 24's agent B:
each stands as it was left, and `--strict` passes the last. *Measured*
through the launcher of 0.19.0 (3c4112c) and of this change, taking turns,
on Windows 11 (Node 24.18.1, Git for Windows 2.55.0, no `claude` on `PATH`)
and, for a mode the account may not read, in a container as an ordinary
account (Linux, Node 24.21.0, git 2.47.3), in a project whose brief
protects `src/db/schema.ts`, on the brief's branch, the hook's line written
into `.claude/settings.json` under both events with `init`'s matcher:

| What stands | 0.19.0 | Now |
| --- | --- | --- |
| `hook claude --help`, `--version`, `-h` or `-v` on the line | the hook prints the help or the version, exit 0, before a write to the protected file and after it; `doctor`: `is more than init writes, and guards`, exit 0 | the hook the same; `doctor`: the line asks for the help or the version, which the hook prints in place of checking the write, so the guard is off; exit 1 |
| the same with `--root ""`, `--root <the project>` or `--brief 404` beside it | the hook the same; `doctor`: guards, or holds every write for 404 | the hook the same; `doctor`: the guard is off, as above; exit 1 |
| the same with a `--root` in no work tree beside it | the hook the same; `doctor`: the root, off | the hook the same; `doctor`: the help or the version, off |
| `--help`, `--version` or `-h` beside `--root nowhere` | the hook prints the help or the version, exit 0; `doctor`: the root is not a directory, off; exit 1 | the hook, before a write and after one: `the hook's line cannot be read (--help is given beside a fault, --root is "nowhere", which is not a directory, and the help would be printed in its place)`, to the person, exit 0 (exit 1 before main had the hook say the guard is off with exit 0), and holds no write; `doctor` the same words; exit 1 |
| `.spec-harness.json` of mode 000 (Linux) | `doctor`, `guard` and the hook: `.spec-harness.json is not valid JSON: EACCES: permission denied, open ...`, exit 2 | `.spec-harness.json cannot be read: EACCES: permission denied, open ...`, exit 2 |
| `.spec-harness.json` held open by another process with no sharing (Windows) | `doctor`, `guard`, `context` and the hook: `is not valid JSON: EBUSY: resource busy or locked, ...`, exit 2 | `cannot be read: EBUSY: ...`, exit 2 |
| a `core.hooksPath` that names a file, with nothing wiring Claude Code to the guard so that no release is asked | `where git runs its hooks cannot be told: ...`; `doctor` exit 0, and 0 under `--strict` | the same words; exit 0, and 1 under `--strict` |
| `doctor --root C:\...\repo --root c:\...\repo`, and so `guard` and `context` | exit 2: `--root is given twice, ...` | runs in the project |
| `--root C:\nowhere --root c:\nowhere` | exit 2, given twice | exit 2: `--root is "c:\nowhere", which is not a directory` |
| `hook claude --root C:\...\repo --root c:\...\repo` | exit 1, a line the hook cannot read, and the write goes on; `doctor`: off; exit 1 | refuses the write to the protected file; `doctor`: guards; exit 0 |

So each claim holds. With `--strict`, a project whose settings wire the
guard and that has no `claude` on `PATH` failed on 0.19.0 as well, for the
release that cannot be told, which is why the row is measured with nothing
wired.

- **A line that asks for the help or the version is a guard that is off.**
  Every command answers either before it runs, and the hook does too: it
  prints the help or the version on stdout and exits 0 without reading its
  question. Claude Code's hooks reference
  (<https://code.claude.com/docs/en/hooks>, *Exit code output* and *Exit
  code 0*, read 2026-10-19) has a hook that exits 0 succeed and the action
  go ahead, and of what such a hook prints that is not JSON it says that
  for most events "Claude Code writes stdout to the debug log and doesn't
  show it in the transcript"; of the events a write is asked about, before
  it and after it, neither is among the exceptions it names. So no write
  is checked under such a line, and neither the person nor Claude is told.
  The hook keeps answering so: a person who asks it for its help at a
  terminal is answered the same way, and it cannot tell the two apart
  without waiting for a question that never comes there (the second
  amendment of 2026-10-11).
  `doctor` reads the line through the hook's own reading of it
  (`claudeHookLine`, `src/usage.ts`), which now says it as a guard that is
  off and that the hook says nothing of, as a root outside any work tree
  is, and exits 1. Whatever else stands on the line is read no further: the
  hook reads no brief and opens no root before the answer, so `doctor`
  asks spec-brief and git nothing for it either.
- **Beside a root that is not a directory, either is a line the hook
  cannot read.** The hook says such a root as it runs (the first
  amendment of 2026-10-11), and the help or the version was printed in its
  place, exit 0, so the guard someone set up was off with no word. Such a
  line is now said as one the hook cannot read, after its question is
  read, before a write and after one, as every such line is said: to the
  person, exit 0, by the amendment of 2026-10-19 that has the hook say the
  guard is off with exit 0 (it was exit 1 when this was measured), and no
  write is held for it; as a session starts it is said in the same words,
  exit 0. The faults read so are those the line shows by itself: a root
  that is a file, or is not there, or is empty where the directory the
  hook is started in is gone. A root outside any work tree or in another,
  and a brief that is not one, take git or spec-brief to tell, and neither
  is asked before an answer that runs nothing: beside those the hook
  prints the help, and `doctor` says the line as above. The decision named
  "a wrong value" beside `--help`; these are the values a wrong one can be
  told by with no process started.
- **A configuration that cannot be read is said as that.** Reading the
  file and parsing it are told apart: a read that fails is
  `.spec-harness.json cannot be read: ` and Node's words, EACCES where the
  account may not read it and EBUSY where another process holds it open
  on Windows, and only a text that is no JSON is `is not valid JSON`. Exit
  2 as before, from every command and from the hook, which holds the write
  as for any configuration that does not load, and lets a write to the
  file itself through as for one (the amendment of 2026-10-19 that lets a
  configuration that does not load have a write to itself through).
- **Where git runs its hooks cannot be told fails `--strict`**, as a
  Claude Code release, a line of the hook, a plugin that may be on the
  machine and a hook file git runs that cannot be read each do. Read
  against every other place `doctor` says it cannot tell, two others fail
  nothing under `--strict`, and are left (below).
- **On Windows a drive letter names its volume in either case**, by
  spec-core's ADR-0005 as amended on 2026-10-19
  (spec-family/spec-core#42), which reads Microsoft's *Naming Files, Paths,
  and Namespaces* (*Naming Conventions*): two roots are compared with the
  drive letter of each resolved path in one case (`foldDrive`,
  `src/usage.ts`), and the rest of the path as resolved, since NTFS can be
  made to tell names apart by case and that is the disk's to say. `doctor`
  reads the hook's line through the same comparison. A path resolved
  elsewhere starts with `/`, so on Linux and macOS `C:\x` and `c:\x` stay
  two names in the directory they are read from.
- **In a linked worktree, the release the hook's line runs.** The line,
  `init`'s and the plugin's, names its script under `${CLAUDE_PROJECT_DIR}`.
  Claude Code's worktrees page (<https://code.claude.com/docs/en/worktrees>,
  *What worktrees share with the main checkout* and *Ask Claude to create a
  worktree*, read 2026-10-19) has a worktree session started from the
  desktop app read the project's hooks from the main checkout's root, run
  them there and point `${CLAUDE_PROJECT_DIR}` at it, and has the
  placeholder stay where a session started once it enters a worktree; the
  hooks reference (*Reference scripts by path*) has it name the project
  root where the session started. So the hook such a session runs is the
  main checkout's install, and in a session started in the worktree it
  follows that the hook is the worktree's own. `doctor`, run
  in a linked worktree where something wires the guard, notes both
  releases where they are not one, a release or `none`
  (`describeInstalls`, `src/configure.ts`), and fails nothing: from 0.19.0
  on either decides a write by the work tree that holds it, so the note
  says which release answers, not where a write is decided. Measured
  through both launchers, the main checkout's install and the worktree's
  made up as manifests:

  | The main checkout's install, and the worktree's | `doctor` in the worktree, 0.19.0 | Now |
  | --- | --- | --- |
  | 0.18.0 and 0.19.0; 0.19.0 and none; none and 0.19.0 | nothing of it; exit 0 | the note, with both; exit 0 |
  | one release in both, or none in either | nothing of it | the same |
  | `doctor` in the main checkout | nothing of it | the same |

An exit code that can change for a tree that passed is a minor release
(spec-core's ADR-0009). What was measured for this and left as it was:

- **Two things `doctor` cannot tell that `--strict` passes.** A line of
  the hook waited on before every write whose entries after a write cannot
  be read, as an `if` on its `PostToolUse` entry alone makes it, says
  `which writes it is started after cannot be told here` of a line that
  guards: the state is `guards`, and `--strict` reads states. And a
  `.spec-brief.json` that is not JSON is `whether spec-brief loads
  spec-harness's plugin is unknown`, exit 0 under `--strict` (measured).
  The first is of warnings after a write, which hold nothing; the second
  of the archive's reading of a ruling. Neither was decided here.
- **`--help` beside a brief that is not one, or a root in another work
  tree**: the hook prints the help, and the line is said as a guard that
  is off, by the help.
- **`doctor`'s words for `-h` and `-v`** are those for `--help` and
  `--version`: the line is shown above them as it was written.

*Amended 2026-10-24.* **A path through a link is decided as it reads and
as the system writes it, and the stricter answer stands.** The amendment of
2026-10-19 that lets a configuration that does not load have a write to
itself through measured a path with a `..` after a link, where the
configuration loads, and left it. *Claimed* by round 25's agent F: the hook
reads such a path's `..` first, `deep/../schema.ts` as `schema.ts`, where
the system writes through the link, to `lib/schema.ts` when `deep` links
into `lib/`; and whether Claude Code's tools hand the hook the path as
given is on none of its pages.

What Claude Code's documentation has, read 2026-10-24. The hooks reference
(<https://code.claude.com/docs/en/hooks>, *PreToolUse input*) has
`tool_input.file_path` always absolute for Write, Edit and Read, a `~` and
a relative path expanded before a hook runs; it says nothing of a `..` in a
path. The permissions page (<https://code.claude.com/docs/en/permissions>,
*Symlinks*) has a path that goes through a link checked as the path asked
for and as the file it resolves to, a deny rule applying where either
matches; and under *Writes through a symlink*, Edit and Write refuse a
write whose path is itself a link, while a write still passes through a
link where a directory on the way is one. The errors reference
(<https://code.claude.com/docs/en/errors>, *Refusing to read, write, or
search a path*) has that refusal, `it is a symbolic link`, among those
that do not appear before v2.1.251, where the hooks run under releases from
2.1.139 (ADR-0012). No page says whether the file a path resolves to is
read with its `..` before the link in front of it or after it, and none
names NotebookEdit there. So which file a tool writes for such a path
cannot be told from them, and the hook leans on no refusal of Claude
Code's.

*Measured* through the launcher of main (4227a6a) and of this change, in a
Linux container as an ordinary account (`node:24-slim`, Node 24.22.1, git
2.39.5) and on Windows 11 (Node 24.22.1, Git for Windows 2.55.0), in a
project on brief 042's branch, the brief covering `src/app/**` and
protecting `src/db/**` and `lib/**`: the hook handed an Edit, or a Write
for a file not there, before the write and after it, `guard` and the
server's `check_path` asked of the same path, and then the write made by
Node, to see where it lands. On Linux:

| The path, and its link | Where the system writes it | main | Now |
| --- | --- | --- | --- |
| `deep/../schema.ts`, `deep` a link to `lib/x` | `lib/schema.ts` | no word before it, a warning after it, of `schema.ts`; `guard` warns, `check_path` `warn` | refused, `lib/schema.ts`; `guard` exit 1, `check_path` `deny` |
| `deep/../fresh.ts`, nothing at `lib/fresh.ts` | `lib/fresh.ts`, made | the same, of `fresh.ts` | the same as above |
| `deep/../src/app/a.ts` | nowhere: `lib/src/app` is not there | passes, in the scope | refused, `lib/src/app/a.ts` |
| `<outside>/into/../db/schema.ts`, `into` a link outside the repository to `src/app` | `src/db/schema.ts` | passes: outside the repository | refused |
| `newlink`, a link to `src/db/new.sql`, which is not there | `src/db/new.sql`, made | no word before it, a warning after it, of `newlink` | refused, `src/db/new.sql` |
| `<outside>/dang`, a link outside to `src/db/new2.sql`, not there | `src/db/new2.sql`, made | passes: outside | refused |
| the same, the branch naming brief 999, which spec-brief does not list | the same | passes: a write outside every work tree | held, exit 2 |
| `lib/up/../a.ts`, `up` a link to `src/app/sub` | `src/app/a.ts`, in the scope | refused, as `lib/a.ts` | the same |
| `applink/new.ts`, `applink` a link to `src/app`; `alias.ts`, a link to the protected file; `src/app/../db/schema.ts`; a path through no link | where it reads | as it reads | the same |

So the claim holds, and goes further: a path outside the work tree whose
`..` after a link leads into it read as outside the repository, and a link
to nothing read as the link, each passing a write that made a protected
file. On Windows each path of the table that a junction can make was
written where it reads, its `..` first (`deep\..\schema.ts` made
`schema.ts` at the top), and main and this change answered each alike; the
account may make no symbolic link there (`EPERM`). On GitHub's Windows
runner (`windows-2025-vs2026`, Node 24.22.1, Git for Windows 2.56.0), where
an account may, through the workflow of a branch of its own that measured
and is not merged (`measure/b26-budget-on-windows`, run 40102588740): a
`..` after a link to a directory, absolute or named from its own
directory, was written at the top, as through a junction; a link to a file
was written through; and a link to a file that is not there made the file
it names, as on Linux, which the written reading follows on Windows too,
after its `..`.

- **Two readings.** A path is read as before, its `..` first and then its
  links (`realSpelling`, `src/fs.ts`), and as the system writes it
  (`writtenSpelling`): its names walked from the root one by one, each link
  replaced by what it names, a link to nothing among them, so that a `..`
  is read from the directory the link before it leads to; on Windows its
  `..` first, as Windows writes it. Each reading is decided by the work
  tree of the repository that holds its file, and the stricter decision
  stands, refused over asked, asked over warned, warned over passed
  (`decideWritten`, `src/guard.ts`). Where the two are as strict, the path
  is decided as it reads, as before; where the written one decides, it is
  said with the path given and where it is written:
  `<path> is written to lib/schema.ts through a link: brief 042 does not
  empower this round to change lib/schema.ts (protectedFiles: lib/**)`.
- **Everywhere a path is decided**: the hook before a write and after it,
  `guard`, the server's `check_path`, git's hook, and the reading of a
  write outside every work tree, which no brief holds (the amendment of
  2026-10-19 that lets a configuration that does not load have a write to
  itself through): a path is outside where both its files are.
- **A link from one work tree into another** has its written reading
  decided by the work tree it leads into, by that work tree's branch and
  briefs, as the amendment of 2026-10-19 that has a path decided by the
  work tree of the repository that holds it has every path decided; a test
  holds it, before a write and after one.
- **What each reading lets through.** Read only as it reads, every row of
  the table that turned was let through. Read only as the system writes it,
  `lib/up/../a.ts` would be, `src/app/a.ts` in the scope, where a tool that
  takes the `..` out first writes `lib/a.ts`, which is protected. Read both
  ways, no link makes a protected file read as another where the path
  reaches the file by either reading. What is left: a link made or changed
  between the hook's check and the write, as for every path; a path through
  more than 40 links, past which Linux writes nothing and which is decided
  as it reads (path_resolution(7), read 2026-10-24, has Linux follow at
  most 40 in resolving a pathname); and a directory the account may not
  look into, which a write cannot pass either.
- **macOS is read as Linux is**, a `..` after the link before it. That is
  not measured here: the suite's macOS leg runs the test that writes
  through a link and reads where the write landed, as the Linux legs do,
  and fails where it lands elsewhere.
- **What is unchanged.** A path through no link reads one way, as before,
  and every answer for it is as it was. A path with a `..` in it outside
  every work tree is still held where a problem holds every write inside,
  though both its readings may now name a file outside: nothing measured
  asked for it to pass, and it is left.

The lines of the hook the amendments above measured, as a session starts,
before ten writes and after each, as a turn ends, and git's hook, were run
through the launchers of main and of this change taking turns, in a
project whose configuration loads, in one with links, and in five where
something holds every write or nothing names a brief
(`b26-measure/hook-compare.mjs`): on Windows, 1,877 runs, every one the
same; on Linux, 1,949 runs, of which 14 differ, each a path through a link
in the project with links: the two lines of the hook that guard there,
`hook claude` and `hook claude --root <repo>`, now refuse it before the
write where main passed it, and say nothing after it where main warned of
the file the path reads as. `tests/integration/released-lines.test.ts`
holds.

**What it costs**: an `lstat` of each name of the path, and a `readlink`
of each link, with no process. Measured on the Windows workstation, the
builds taking turns, ten rounds at the median with the 95th percentile
between brackets, where starting node to do nothing took 68 ms beside them
(`b26-measure/bench.mjs`):

| The hook | main | This change |
| --- | ---: | ---: |
| before an Edit, no brief named | 206 ms (589) | 207 ms (512) |
| before an Edit in the scope, on a brief's branch | 504 ms (1,286) | 503 ms (1,067) |
| before an Edit of a protected file, which it refuses | 489 ms (1,729) | 501 ms (1,089) |
| before an Edit through a junction, of a protected file | 485 ms (614) | 564 ms (703) |
| as a session starts, on a brief's branch | 447 ms (594) | 427 ms (1,029) |

A path is walked where the work tree that holds it is found and again
where it is decided, each name from the root, and the names of a link that
names an absolute path from the root again, which on Windows is most of
what the row through a junction adds.

A write that passed is refused, and `guard` exits 1 for it: a minor
release (spec-core's ADR-0009).

*Amended again 2026-10-24.* **The report at the end of a turn says what
is held as the hook holds it.** Where the branch, the line or `SPEC_BRIEF`
names a brief no round can work under, the report the first amendment of
2026-10-19 added says `..., so what the work tree holds is not reported,
and every write is held`. *Claimed* by round 25's agent F: beside the
amendment of 2026-10-19 that has a write outside every work tree held by
no brief, those words are too broad. *Measured* through the launcher of
main (4227a6a) and of this change (Windows 11, Node 24.22.1;
`b26-measure/b2.mjs`), `turnReport` on, the branch naming brief 999: the
report said every write is held, and a write of a file outside every work
tree passed with no word. It now says `..., and every write is held but one
to a file outside every work tree of the repository; spec-harness doctor
says more`. Every other answer of the hook, the session's start among
them, is as it was.

What was measured for this and left as it was: **the line as a session
starts**, `..., so every write of this session is held until it is
mended`, is as broad, and was not decided here.

*Amended a third time 2026-10-24.* **What `doctor` checks of a line: whether its script
is there, and whether spec-brief can be asked about the brief it names;
and a report at the end of a turn that nothing runs.** *Claimed* by round
25's agents B, F and H: `doctor` does not check that the script the hook's
line names exists, so a line whose script is not there is reported as
guarding; and it says nothing where `turnReport` is on and no entry runs
the report. *Measured* through the launcher of main (84cb6d7) and of this
change, taking turns (Windows 11, Node 24.22.1, a `claude.cmd` on `PATH`
that `doctor` reads as Claude Code 2.1.300 and never starts), in a project
on its brief's branch with spec-brief 0.8.0 and spec-guard 0.28.0
installed, the hook's entry under `PreToolUse` and `PostToolUse` with
`init`'s matcher:

| The line, and what stands | main | now |
| --- | --- | --- |
| `init`'s line, the project's install there | guards; exit 0 | the same |
| `init`'s line, no install | guards, and the advice of `onFailure`; exit 0 | `the script it runs, <project>/node_modules/@descent-vtt/spec-harness/bin/spec-harness.js, is not there, so the hook cannot start, the guard is off ...`; exit 1 |
| the same, a directory where the script would be | guards; exit 0 | off, the same words; exit 1 |
| the same, `"onFailure": "block"` | guards, and the note of `onFailure`; exit 0 | holds every write: `... and Claude Code holds every write it is started for before, since the entry sets onFailure to "block"`; exit 1 |
| an absolute path of its own, not there | guards; exit 0 | off; exit 1 |
| a shell's line, `node "$CLAUDE_PROJECT_DIR"/node_modules/...`, no install | guards; exit 0 | the same |
| a relative path, no install | guards; exit 0 | the same |
| `npx --no-install @descent-vtt/spec-harness`, no install | guards; exit 0 | the same |
| a linked worktree with no install, the main checkout's there | guards, and the note of each release; exit 0 | the same |
| a linked worktree with no install, nor the main checkout | guards; exit 0 | `the script it runs is in neither place ${CLAUDE_PROJECT_DIR} can name, ...`; exit 1 |
| `hook claude --brief 001` on `main`, spec-brief not installed | `is more than init writes, and guards`; exit 0 | `spec-brief could not say whether it knows brief 001: spec-brief is not installed here: ..., so the hook holds every write until the line is mended ...`; exit 1 |
| `hook claude --brief 001`, spec-brief exiting 2 | holds every write; exit 1 | the same |
| `"turnReport": true`, no entry under `Stop` | nothing; exit 0 | `note: "turnReport" is on, and no settings file has Claude Code start the hook as a turn ends, so no turn's end is reported: ...`; exit 0 |
| the same with `init`'s entry under `Stop`, or `turnReport` off | nothing; exit 0 | the same |
| the plugin turned on and on the machine, no install | brings the guard hooks; exit 0 | the same |

So each claim holds. The hook answers alike through both launchers, 80
answers each, for the line `init` and the plugin write, before a write,
after it, as a session starts and as a turn ends, on a brief's branch,
`main`, an archived brief's and an unknown brief's branch, and with
spec-brief exiting 2, named by its script alone, or not installed: this
changes `doctor` alone.

- **A line whose script is not there is a guard that is off.** Claude
  Code's hooks reference (<https://code.claude.com/docs/en/hooks>, *Block
  the action when a hook fails*, read 2026-10-24) counts a command hook
  that fails to start, "for example because the script or executable
  doesn't exist", as a failure, after which the action goes ahead on most
  events; with `"onFailure": "block"` a failure does what exit 2 does on
  the event, which before a tool call blocks it (*Exit code 2 behavior per
  event*). So such a line is said as off, naming the script and how to
  install it, and exits 1. Where its entry sets `onFailure: "block"`, it
  is waited on before a write and the Claude Code on `PATH` reads the
  field, it holds every write instead, and exits 1 as well.
- **Where the script is looked for.** `${CLAUDE_PROJECT_DIR}` is filled in
  by Claude Code in either form of entry (*Exec form and shell form*,
  *Reference scripts by path*), and names the project root where the
  session started. In a linked worktree that is the worktree in a session
  started there, and the main checkout in a worktree session of the
  desktop app, where hook commands run in the main checkout's root and the
  placeholder points at it (the worktrees page,
  <https://code.claude.com/docs/en/worktrees>, *What worktrees share with
  the main checkout*, read 2026-10-24). So the script is looked for in the
  work tree `doctor` runs in and, in a linked worktree, in the main
  checkout too, and is not there only where it is in neither.
- **What is not looked for.** A relative path is read from the directory
  the hook is started in, which by the hooks reference (*Hook handler
  fields*) is the session's
  current directory, and moves with it; a name npx or `PATH` resolves is
  that program's to find; and in a line a shell reads, a word with
  anything a shell rewrites is the shell's, the filled-in project among
  them, as a backslash in a Windows path is. Each is said as it was.
- **Entries that name the harness in two ways are two lines**, by two
  scripts, or with a shell and without one: one may be there where the
  other is not. `claudeCode.lines` has a line for each, where entries with
  the same words after the harness were one.
- **A line that names a brief where spec-brief cannot be run** holds every
  write: the hook asks spec-brief about it before each, and holds the write
  it cannot ask about. It is said in the words of a line whose brief
  spec-brief could not be asked about, and exits 1.
- **A report at the end of a turn that nothing runs is a note.** With
  `"turnReport": true`, where no settings file has an entry under `Stop`
  that runs the hook, and the plugin brings none, no turn's end is
  reported: `doctor` says so, fails nothing, and `--format json` has
  `claudeCode.turnEnd`.
- **`init` does not look for the script**: it writes the line that names
  the project's install, which a project may install after it, and what
  it says of a line is as before.

An exit code that can change for a tree that passed is a minor release
(spec-core's ADR-0009). What was measured for this and left as it was:

- **The plugin's line.** Every release of the plugin from 0.1.2 on runs
  `${CLAUDE_PROJECT_DIR}/node_modules/@descent-vtt/spec-harness/bin/spec-harness.js`,
  so with the plugin on and no install in the project its hooks cannot
  start either. Its hooks are not read (ADR-0012), and `doctor` says it
  brings the guard hooks, exit 0.

*Amended 2026-11-02.* **git's hook says when the work tree's package.json
names no spec-harness.** The hook lives in the repository's hooks, which
every work tree and every commit checked out share. *Claimed* by a consumer
of the family: at a commit from before the project took the harness up,
with no install anywhere, the hook stopped the commit and said to install
the dependencies, as with `npm ci`, and that commit's `package.json` has no
spec-harness to install. *Measured* with 0.22.0 from npm: the main checkout
at such a commit, its `node_modules` left behind, and a linked worktree at
it, the main checkout's install there, both commit, the hook reading the
install that is there; with no install anywhere the commit stops, exit 2,
and `npm ci` there installs nothing that brings the script.

- **Where the script is in neither work tree, the hook reads the work
  tree's `package.json` for `"@spec-family/spec-harness"`.** Where it is
  named, the install brings the script, and the hook says to install, as
  before. Where it is not, the hook says so: a commit from before the
  project took it up has no hook to run, and installing its dependencies
  brings none. `grep` is in every `sh` git runs a hook with.
- **The commit waits all the same, exit 2.** A `package.json` that names no
  spec-harness does not tell a commit from before the project took it up
  from a project that installs it some other way, from a workspace's own
  manifest or by hand, and a hook that let the one through would let the
  other through unguarded. What to do with such a commit is the person's
  choice, and the hook names none: a bypass written where an agent reads
  the refusal is one the agent takes.
- **`init --git-hook --write` writes the hook again** where it finds the
  one 0.22.0 wrote, byte for byte (`update`), and without `--git-hook`
  keeps it with a note, as `doctor` notes it: the hook 0.22.0 wrote guards
  as this one does, and differs in what it says.

*Amended 2026-11-08.* **The line as a session starts, and a path with a
`..`, say what is held and why, no broader than the hook holds it.**

- **As a session starts.** The line said every write of the session was
  held, where the hook holds none to a file outside every work tree of the
  repository: a name of the brief that is none, a configuration that does
  not load and a spec-brief that cannot answer each leave such a write to
  go ahead (`decisionsFor`, `mending`). The report at a turn's end said so
  already, "every write is held but one to a file outside every work tree
  of the repository", and the line now says what that report says. A git
  that does not answer within its time, and an error nothing expected, hold
  such a write too, and are said as before.
- **A path with a `..`.** `outsideEvery` reads no path with a `..` as one
  outside every work tree, though it reads as one both ways: a link before
  the `..` can lead back into a work tree, which is why such a path is held
  as the amendment of 2026-10-24 has it. Where the hook holds every write in
  a work tree, for a brief's name that is none, such a path was held in the
  brief's words, which decide no file outside the repository. It is now held
  in its own: that the path has a `..` and reads as outside, why it is held
  all the same, and to write it without the `..`. `check_path` answers each
  such path so, and the hook says it where every path of the write is one.

## Consequences

An agent that writes through a shell passes the guard and is caught at the
audit and at the archive. The guard's job is to make an honest agent never
need them, cheaply.
