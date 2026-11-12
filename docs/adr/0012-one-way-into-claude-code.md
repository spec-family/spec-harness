---
status: accepted
date: 2026-09-27
---

# ADR-0012: One way into Claude Code, and the release it needs

## Context

Claude Code reaches the harness one of two ways. The plugin brings the
skills, the guard hooks (`hooks/hooks.json`) and the MCP server
(`.mcp.json`); `spec-harness init` writes the same hooks into the project's
`.claude/settings.json` and the same server into its `.mcp.json`. Until now
only the README said to pick one.

Both at once is not merged away. Claude Code runs one copy of a handler that
several settings files define, but a plugin's copy of the same handler stays
separate (its hooks reference), so the guard runs twice before and after
every write: a refusal twice, an `ask` asked twice, a warning twice. Claude
Code drops a plugin's server that runs the same command as a server
configured above it, but the two spell the project differently: the plugin
names `${CLAUDE_PROJECT_DIR}`, which Claude Code substitutes for a plugin,
and a project's `.mcp.json` must write `${CLAUDE_PROJECT_DIR:-.}`, since
Claude Code expands it there from an environment that does not hold the
variable. Their arguments differ, and both servers connect.

Claude Code records a plugin as on in `enabledPlugins`, keyed
`<name>@<marketplace>`, in any of its settings: the user's
(`~/.claude/settings.json`, or `settings.json` in `CLAUDE_CONFIG_DIR`), the
project's `.claude/settings.json`, the local `.claude/settings.local.json`,
`--settings` and managed settings. They merge key by key, and for each id
the source of highest precedence that names it decides: user, then project,
then local, then `--settings`, then managed.

The hooks are exec form, `command` and `args`, so the project's path is one
argument whatever it holds and no shell reads it. Claude Code's changelog
adds hook `args` in 2.1.139, the release that also lets a plugin's server
command name `${CLAUDE_PROJECT_DIR}`. The hooks reference describes exec
form without naming a release.

## Decision

**init writes neither entry while the plugin is on.** It reads
`enabledPlugins` from the user's, the project's and the local settings, in
that order, as Claude Code merges them, and counts an id
`spec-harness@<marketplace>` that one sets to `true` and no later one sets
to `false`. Then `.claude/settings.json` and `.mcp.json` are `skip` in its
plan, which names the id and the file that turns it on, and says how to
have init's entries instead: turn the plugin off for this project,
`claude plugin disable <id> --scope local`, which writes `false` into
`.claude/settings.local.json`, and run init again. That is the whole
override. A flag that wrote the entries with the plugin still on would
write the double install this decision is about.

**init removes nothing.** Where the plugin is on and a file already holds
init's entry, as this release or 0.1 wrote it, the step is `advise`: the
double install, and the two ways out. The file is left as it is. Both files
are the repository's, committed for every clone, and a clone whose person
has no plugin relies on them; the plugin may be on in one person's user
settings alone.

**doctor reports the wiring**: the plugin and the file that turns it on,
init's entries (the settings files that hold the guard hooks, and whether
`.mcp.json` registers the server), both, or neither. Both exits 1, with how
to keep one. Neither is said, and is a choice rather than a failure: a
repository may use spec-harness without Claude Code.

**The plugin does not stand down at run time.** Its hooks are files Claude
Code runs as the plugin ships them. The plugin's copy could be told apart by
an argument and stay silent where settings hold the guard, but a copy that
stays silent because it believes another runs can leave none running.
Claude Code reads no hooks from a repository's `.claude/settings.json` in a
session that spans several repositories, and still reads `enabledPlugins`
there; `allowManagedHooksOnly`, and `disableAllHooks` outside managed
settings, turn the settings' hooks off and leave on the hooks of a plugin
that managed settings force on. A guard twice is noise; no guard is an
unguarded write. So the other order, init first and the plugin installed
later, is found by `doctor` and by init's next run rather than prevented.

**Claude Code 2.1.139 or later** runs the hooks and the plugin's server. The
README says so where it says what to install, and so does the plugin's
manifest.

*Amended 2026-09-30.* doctor checks the release, where only the documents
stated it. A Claude Code older than 2.1.139 ignores a hook's `args` and runs
its bare `command`, `node`, which reads the hook's input as a script and
fails; Claude Code blocks a tool call only on a PreToolUse hook's exit 2, so
every write passes unguarded, and nothing says so. When the plugin or
init's hooks wire Claude Code to the guard, doctor runs `claude --version`,
found on `PATH` and started without a shell, as every program the harness
runs is (ADR-0002). An older release exits 1. A `claude` that is not found,
a version that cannot be read, and on Windows a `claude.cmd` shim, which
cannot be started without a shell, are *cannot tell*: never reported as
fine, and a failure under `--strict`, since nothing measured is not clean
(spec-core ADR-0005). The minimum is `CLAUDE_CODE_MINIMUM` in
`src/versions.ts`, beside the siblings', and a test holds the README and the
plugin's manifest to it. The `claude` on `PATH` may not be the one an editor
or the desktop app runs, which doctor cannot see; the README says to check
that one there.

*Amended 2026-09-30.* npm installs Claude Code on Windows as a `claude.cmd`
shim, and Node refuses to start a `.cmd` without a shell since the fix for
CVE-2024-27980, so doctor told most Windows users it could not tell, and
`doctor --strict` failed them. doctor now reads the shim rather than run
it: the path it runs, from the shim's own directory, as npm's cmd-shim
writes it (`"%dp0%\node_modules\@anthropic-ai\claude-code\..."`) and pnpm's
(`"%~dp0\..."`), names the `@anthropic-ai/claude-code` package, whose
package.json declares the release, which is measured against the minimum
as `claude --version`'s answer is, and named as read from that file. Nothing
is run, through cmd.exe or otherwise. A shim that names no such package -
another package's, one by an absolute path, which pnpm writes only across
drives, or none - and a package.json with no version are *cannot tell*, as
before. Which `claude`
is measured is still the one Windows finds first on `PATH`, and a
`claude.exe`, as the native installer puts one, is asked, as before.

*Amended 2026-10-07.* git's pre-commit hook is run as Claude Code's hooks
are: `node` and the script in the project's install. `init --git-hook`
wrote <!-- bare-name: the hook as it was -->
`exec npx --no-install spec-harness hook git`, which starts npm to start
node on every commit. Under npm 12, npx says on stderr what it runs, two
`npm notice run` lines a commit, where npm 10 and 11 print none (measured
with 10.9.9, 11.20.0 and 12.2.0). And where the harness is not installed,
npx asks the registry about the bare name `spec-harness`, which is another
publisher's package, and names that package in its refusal.

git starts a pre-commit hook at the top of the work tree it commits in:
from a subdirectory, under `git -C`, in a linked worktree, whose top it is
though the hook file is the main work tree's, and for a `core.hooksPath`
that is relative, absolute, or shared by several repositories (githooks(5),
and measured with Git for Windows 2.55). So the hook names the script by
its path from there,
`node_modules/@descent-vtt/spec-harness/bin/spec-harness.js`: not from
where the hook file is, which for a linked worktree and for shared hooks is
another place, and not by an absolute path written by init, which a second
work tree or a moved repository does not have. Each work tree is
guarded by its own install, as the siblings are found in its own
`node_modules`. Where the script is not there - a linked worktree nobody
installed into, a repository that shares its hooks with one that uses the
harness - node would end on a stack trace, so the hook checks first, says
what is missing and where, and exits 2: git stops the commit, as it did
when npx found nothing to run. The hook is a POSIX sh script on every
platform, since Git for Windows runs a hook with the sh it ships, and a
test has git run it there.

init never replaces a hook that exists, so one written the old way keeps
running through npx, and keeps guarding. doctor and init read it as a hook
that runs spec-harness, as before, and add a note: how it is run, and the
line that runs it with node. The note fails nothing, `--strict` or not, and
`doctor --format json` has it as `gitHook.note`, `null` where there is
nothing to say; the field is added, so no `schemaVersion` moves.
A comment that names the npx command is not noted, and neither is another
runner's line, such as `pnpm exec`, which is the repository's to choose.
The line advised for a hook of the repository's own is the node line too.

*Amended 2026-10-09.* The lines the releases wrote are read as they were.
init writes a line once and never again: a repository keeps the hook, the
server and the pre-commit hook of the release it ran init with, and a plugin
of any release runs beside any release of the package. When the command line
began to refuse an option or an argument a command does not take, and a
value that names nothing (ADR-0005), the lines were read from the tags,
`src/setup.ts`, `src/configure.ts`, `hooks/hooks.json` and `.mcp.json` at
v0.1.0 to v0.11.1:

<!-- bare-name: the lines as the releases wrote them, never to be run -->
| Releases | Where | The line |
| --- | --- | --- |
| 0.1.0 to 0.1.1 | the hooks, in `.claude/settings.json` and the plugin | `npx --no-install spec-harness hook claude` |
| 0.1.2 to 0.11.1 | the same | `node ${CLAUDE_PROJECT_DIR}/node_modules/@descent-vtt/spec-harness/bin/spec-harness.js hook claude` |
| 0.1.0 to 0.1.1 | the server, in `.mcp.json` and the plugin | `npx --no-install spec-harness mcp` |
| 0.1.2 to 0.11.1 | the server, in `.mcp.json` | `node ${CLAUDE_PROJECT_DIR:-.}/node_modules/@descent-vtt/spec-harness/bin/spec-harness.js mcp --root ${CLAUDE_PROJECT_DIR:-.}` |
| 0.1.2 to 0.11.1 | the server, in the plugin | `node ${CLAUDE_PROJECT_DIR}/node_modules/@descent-vtt/spec-harness/bin/spec-harness.js mcp --root ${CLAUDE_PROJECT_DIR}` |
| 0.1.0 to 0.9.1 | git's pre-commit hook, and the line advised for a hook of the repository's own | `npx --no-install spec-harness hook git` |
| 0.10.0 to 0.11.1 | git's pre-commit hook | `node "$bin" hook git`, `bin` being the script's path |
| 0.10.0 to 0.11.1 | the line advised | `node node_modules/@descent-vtt/spec-harness/bin/spec-harness.js hook git` |

So the harness has been handed five command lines: `hook claude`,
`hook git`, `mcp`, `mcp --root .` and `mcp --root` with the project. None
is refused, and `tests/integration/released-lines.test.ts` holds the table
as data, each line read as the release that wrote it read it, and what this
release writes to be among them: a release that changes a line adds one
there, and none is taken out.

`--root ""` is refused now, and no line above was ever handed it and ran.
A root is empty only where its placeholder was filled with nothing, and each
line finds its script by the same placeholder: filled with nothing, the
script's path starts at the top of the filesystem, and node has none to
start. `hook claude` is read as before whatever else is on its line
(ADR-0005), so a line a person changed by hand guards as it did.

*Amended 2026-10-11.* 0.12.0 wrote the lines 0.11.1 wrote, read from its
tag as the rest were, so each row above that ends at 0.11.1 ends at 0.12.0,
and the test's table says so. Of the lines in the table, the two that carry
a `--root` are the server's, and no hook's line ever did. So when
`hook claude` began to say a `--root` that is not a directory, with exit 1
and nothing refused (ADR-0005), no line a release wrote was read another
way: the test holds that none of the hooks' lines carries one, and runs the
hook with a root that is not there, with an empty one and with none.

*Amended again 2026-10-11.* 0.13.0 wrote the lines 0.12.0 wrote, read from
its tag as the rest were, so each row above that ends at 0.11.1 ends at
0.13.0, and the test's table says so. When `hook claude` began to say a line
its parser cannot read, with exit 1 and no write held (ADR-0005), the
parser came to read a line it refuses a second time, for whose line it is.
So the test now holds each of the five command lines to what it is read as,
argument for argument: the command, the word after it, the options given,
and a root only where one is written. None of the five is a line the parser refuses, and none carries
anything `hook claude` passes over, so what the hook says of its own line
is said of a line a person wrote.

*Amended 2026-10-12.* doctor knows init's hooks by the hook's own reading
of their line, where it knew them by the exact command and arguments init
writes (ADR-0005, amended the same day). A hook a person changed by hand,
such as one given `--root ${CLAUDE_PROJECT_DIR}`, is therefore one of
init's entries in the report, where it was no guard at all. Two things
follow for a tree that passed: beside the plugin such a hook is the double
install it always was, and doctor exits 1 for it; and the release of Claude
Code is asked for it, which exits 1 for a release too old to run the hooks
and, under `--strict`, for one that cannot be told. The lines the releases
wrote are read as they were. init still tells its own entries by what it
and 0.1 wrote, so that it never rewrites a line a person changed.

*Amended again 2026-10-12.* init knows the hook as doctor knows it, where it
told its own entries by what it and 0.1 wrote (ADR-0005, amended again the
same day). The amendment above kept that, so that init would never rewrite a
line a person changed, and it had another effect, measured on 0.15.0: beside
such a line `init --write` added its own, and the file held two lines that
both run for every write, the double guard this decision is about, made by
init itself; and with the plugin on beside such a line init reported `skip`,
that it writes no hook because the plugin brings them, of a file that held
one, where doctor exits 1 for the double install.

init now knows whose line an entry is by doctor's own report of the file,
with the event and the matcher the entry stands under. Where the file holds
a line of the hook that init did not write and Claude Code starts for a
write, it writes no hook into the file and says which line it left, in
doctor's words for the line: `keep` where the line guards, `advise` where
it is no guard. It still rewrites no line but the one 0.1 wrote, completes
its own line where that stands under one event alone, and removes nothing. Beside the plugin, a file
that holds a line Claude Code starts for a write is `advise`, the double
install, whoever wrote the line and whichever of the three settings files
holds it; a line started for no write doubles nothing, and is `skip`.

So init and doctor say the same of every tree: where doctor reports no
guard, init writes one; where doctor reports the double install, init
advises it; and where doctor reports a line of the hook, init writes none
beside it. The pairs were measured over one set of trees, 51 of them,
before and after (ADR-0005 has the table). One pair is left apart: a line
in a settings file of the person's own, with no plugin, beside which init
still writes the project's file, since every clone reads that one.

*Amended a third time 2026-10-12.* doctor and init read whether the plugin
that settings turn on is on the machine. The decision above counts an id
that a settings file sets to `true`, and ADR-0005 (amended again the same
day) found what that does not say and left it: where the project's
`.claude/settings.json` alone turns the plugin on and nothing of it is on a
person's machine, doctor reported the plugin as the guard and init skipped,
and no write was guarded (measured on 0.16.0, through the launcher).

What Claude Code's plugin loading reference has of it
(<https://code.claude.com/docs/en/plugins/loading>, read 2026-10-12, with
the sections in italics):

- **A plugin is declared, fetched, then loaded** (*Check which stage a
  plugin reached*). Settings declare it under `enabledPlugins`, and a
  marketplace under `extraKnownMarketplaces`. What is fetched is kept under
  one plugins root, `~/.claude/plugins` unless `CLAUDE_CODE_PLUGIN_CACHE_DIR`
  names another (*Find plugins on disk*): `known_marketplaces.json` records
  each marketplace fetched, `installed_plugins.json` each install, and
  `cache/<marketplace>/<plugin>/<version>/` is one directory for each
  installed version of a marketplace plugin. A session loads from the
  install record and the cache, without the network, and afterwards fetches
  a marketplace that settings declare and the record lacks (*Plugins and
  marketplaces that aren't on disk at session start*).
- **A plugin whose only `true` is in the project's `.claude/settings.json`
  is not fetched to a machine that lacks it** (*Enabled in project settings
  but not installed*), with two exceptions: a marketplace that lists the
  plugin by a relative path, from which it loads with no install record,
  and a seed directory that holds it already. A plugin from elsewhere is
  fetched only where the user's settings, a local settings file git does
  not track, `--settings` or managed settings set it to `true`.
- **An id's origin may be no marketplace** (*Find where a plugin came
  from*): `@inline`, `@skills-dir` and `@synced` are a plugin started from
  a directory, one saved under a skills directory and one synced from a
  claude.ai account, and no marketplace may take those names.
- **An update or an uninstall leaves the old version's directory** for 14
  days, marked with a file `.orphaned_at` (*Cleanup of previous versions*).
- Beside it, the environment variables reference
  (<https://code.claude.com/docs/en/env-vars>, read the same day) has
  `CLAUDE_CONFIG_DIR` move the configuration directory, plugins with it,
  and `CLAUDE_CODE_PLUGIN_SEED_DIR` name one or more seed directories,
  separated by `:`, or by `;` on Windows; the page on plugins for an
  organization gives a seed the layout of the plugins root; and the error
  reference and the plugin troubleshooting page speak of an entry of
  `known_marketplaces.json` by the marketplace's name, and of `{}` as
  that file with none.

This repository's own marketplace lists the plugin by a relative path,
`./`, in every release, read from the 25 tags. So for a marketplace made of
this repository the first exception is the rule: once the marketplace is on
a machine, or declared, the plugin may load with no install at all. And the
two ways the README gives to install it, the marketplace added from GitHub
or from a git URL and the plugin installed from it, both end with a version
in the cache, since the reference has every marketplace plugin copied there
at install but one that a marketplace added from a local path lists by a
relative path, which loads in place (*In-place and copied plugins*).

**Read: only what the reference documents, and three answers.** doctor
reads the plugins root Claude Code would use, from the environment it runs
in as it reads the settings files, and each seed directory after it.

- **On the machine**: a cache holds a version of the plugin, a directory
  under the marketplace's name and `spec-harness` that no `.orphaned_at`
  marks. Nothing more is said, and the tree reads as it did: the plugin,
  installed for the user, is the guard, and beside init's entries the
  double install.
- **Not on the machine** is said only where the reference leaves the plugin
  no way to load: the project's `.claude/settings.json` alone sets it to
  `true`; no cache holds a version; `known_marketplaces.json` is there, in
  the root and in each seed, and none has an entry of the marketplace's
  name; no settings file declares that name under `extraKnownMarketplaces`;
  and no record of marketplaces hosted on claude.ai stands beside them.
  Then the plugin is not counted as wiring. With hooks of init's in a
  settings file, those are the guard, and the plugin is a note under them:
  installed, it would double them. Without them doctor exits 1, as for a
  guard that is off, and says what would bring it in the reference's terms,
  the marketplace added and the plugin installed, or how to have init's
  entries instead. That the plugin then brings no hook follows from the
  reference, and is not its sentence.
- **Cannot tell** is everything else, said with what was found, never
  fine, and a failure under `--strict` alone: a `known_marketplaces.json`
  that is not there or cannot be read; the marketplace on the machine, or
  declared, with no version cached, where a relative path would load the
  plugin from the marketplace, whose own list is not read; a record of
  marketplaces hosted on claude.ai, whose shape the reference does not
  give; a `true` in the user's settings or in the local file, for which
  Claude Code fetches; an id whose origin is no marketplace; and no
  directory to look in at all.

`installed_plugins.json` is not read. The reference names three of its
fields and not where a record stands in the file, and the workstation this
was written on, whose plugins root holds a record of marketplaces and no
install, has none to compare. The cache says the same for every way the
README gives.

**init writes no hook on this reading alone.** A wrong "not on the machine"
would write a second guard beside one that runs, the double install this
decision is about. So where doctor says the plugin is not there, init
leaves both files as they are and says so (`advise`, where it said
`skip`): why the plugin brings nothing here, and the two ways out, install
it or turn it off for the project and run init again. Where it cannot be
told, init skips as it did and says that beside the reason.

`--format json` has `claudeCode.presence`: `null` where no plugin is on,
and otherwise `state`, `present`, `absent` or `unknown`, with the reason
as `detail`. `claudeCode.state` is `none` or `init` for a plugin that is
not on the machine. The field is added, so no `schemaVersion` moves; an
exit code that can change for a tree that passed is a minor release
(spec-core's ADR-0009). What was found and left as it was:

- **A marketplace's own list.** Reading it through the record's
  `installLocation` would tell a plugin that loads by a relative path, on
  the machine with no cached version, from one that needs an install. The
  reference gives that location as a directory for a marketplace cloned and
  as the path a person gave for one added from a file, and has relative
  paths not resolve in a marketplace added from a URL. Until that is read,
  such a plugin is *cannot tell*, which a person who added this repository
  from a local path meets under `--strict`.
- **A marketplace entry that replaces the plugin's hooks**: the
  marketplace reference
  (<https://code.claude.com/docs/en/plugins/marketplace-reference>, *Strict
  mode*, read the same day) has an entry's `hooks` replace the manifest's
  for an event. And a second enabled plugin of the same name, of which the
  loading reference has one alone register its hooks. Neither is read.

*Amended 2026-10-18.* A linked worktree with no install of its own is
checked with the main work tree's, where the amendment of 2026-10-07 had
each work tree guarded by its own install alone (ADR-0005, amended a third
time 2026-10-18, has what was measured). git still starts the pre-commit
hook at
the top of the work tree it commits in, and the hook `init` writes reads
the script from there first. Where it is not there, the hook asks git for
the common directory, `rev-parse --path-format=absolute --git-common-dir`,
and where that is a work tree's `.git`, reads the script from that work
tree, the repository's main one, where `git worktree add` was run; `hook
git` and `doctor` look for the siblings in the same two places. Where
neither has it, the hook says so, and now names both, and the commit waits.
The line it runs is the line it ran, `node "$bin" hook git`, so
`tests/integration/released-lines.test.ts` holds it as before. `init`
writes the hook once, so a repository keeps the one its release wrote,
which refuses such a commit, until the hook is taken away and written
again.

*Amended again 2026-10-18.* **A third entry, as a session starts.** `init`
writes, beside its two, an entry under `SessionStart` that runs the hook's
own line, `node ${CLAUDE_PROJECT_DIR}/node_modules/@descent-vtt/spec-harness/bin/spec-harness.js hook claude`,
with no matcher, which Claude Code reads as every way a session starts, and
the plugin's `hooks/hooks.json` carries the same (ADR-0005, amended a fourth
time the same day, has what the hook says there). The line is the one the
two have run since 0.1.2, so `tests/integration/released-lines.test.ts`
holds it as it holds theirs, and no line a release wrote is read another
way.

- **Beside init's two, where they stand as init writes them.** The entry
  is written where init's own line stands under both `PreToolUse` and
  `PostToolUse` and `doctor` has nothing more to say of a line in the file:
  with the two, in a file init writes them into, and by itself, `update`,
  in a file whose two an earlier release wrote, so that `init --write` run
  once more completes it. A file that holds a line of the hook a person
  wrote or changed, and one doctor fails, is theirs to complete, as before.
  A line of the hook already under `SessionStart`, init's or a person's, is
  the entry, and no second one is written beside it.
- **`init` writes a line once, and this is a line it had not written.** A
  repository keeps the two its release wrote, and gains the third only when
  `init --write` is run again: the CHANGELOG says so. A plugin brings it
  with the release that ships it.
- **`doctor` notes a settings file that guards writes and holds no such
  entry**, a note after what it says of the release, failing nothing, and
  `--format json` has `claudeCode.sessionStart`, whether a settings file
  holds one. The field is added, so no `schemaVersion` moves. Of the
  plugin's own entries nothing is read, as before.

*Amended 2026-10-19.* **An entry at the end of a turn, where
`turnReport` is on.** `init` writes, where `.spec-harness.json` has
`"turnReport": true`, an entry under `Stop` that runs the hook's own line,
`node ${CLAUDE_PROJECT_DIR}/node_modules/@descent-vtt/spec-harness/bin/spec-harness.js hook claude`,
with `"async": true` and no matcher, which the event takes none of (ADR-0005,
amended the same day, has what the hook says there and why in the
background). The line is the one the guard's entries have run since 0.1.2,
so `tests/integration/released-lines.test.ts` holds it as it holds theirs.

- **Only where the key is on, beside init's entries where they stand as
  init writes them**, as the entry as a session starts is: with them, in a
  file init writes them into, and by itself, `update`, in a file whose
  entries an earlier release wrote, once the key is turned on and `init
  --write` is run again. A file with a line of the hook a person wrote or
  changed is theirs to complete. A line of the hook already under `Stop`,
  init's or a person's, is the entry, and no second one is written.
- **The plugin carries none.** Its `hooks/hooks.json` is the same for every
  project, and an entry there would start the hook at the end of every turn
  of every session that has the plugin on, to read a key that is off. With
  the plugin on and the key on, `init` writes no hook, as before, and says
  the entry to add, `advise`.
- **`async` is a key every Claude Code the harness runs under reads**:
  Claude Code's changelog fixes background hooks in 2.1.23, older than
  2.1.139, the oldest release `doctor` reads as running the hooks
  (`CLAUDE_CODE_MINIMUM`), and has a malformed hooks entry invalidate no
  longer the whole settings file from 2.1.122 on
  (<https://code.claude.com/docs/en/changelog>, read 2026-10-19). That no
  release from 2.1.139 on unloads the entry for the key follows from the
  two and was not measured: no Claude Code was started.
- **`doctor` reads nothing of the entry**, which guards no write: what it
  says of the hook's lines is of those under `PreToolUse` and
  `PostToolUse`, as before.

*Amended 2026-10-19.* **`init --block-on-failure` writes `"onFailure":
"block"` on its entries, the plugin does not, and `doctor` advises it.**
A hook that cannot start lets the write go ahead: where the project a
session names is a worktree with no install, the script on the hook's line
is not there, node exits 1, and Claude Code reads that as an error that
does not block (ADR-0005, amended the same day, has what was measured and
what the hooks reference says of the field). `onFailure: "block"` on the
entry holds the write instead, from Claude Code 2.1.295 on, and the hook
no longer exits 1 for any answer of its own, so the field holds only a
hook that did not run, or ran past its timeout.

Whether to write it turns on what a Claude Code that does not know the key
does with an entry that carries it. A settings file of the project's is
read by every clone's Claude Code, and the plugin's by whatever release
loads it, and the oldest that runs the hooks is 2.1.139
(`CLAUDE_CODE_MINIMUM`). Read 2026-10-19:

- **The hooks reference** (<https://code.claude.com/docs/en/hooks>,
  *Command hook fields*) has `onFailure` "Requires Claude Code v2.1.295 or
  later", and says nothing of an older release.
- **The changelog** (<https://code.claude.com/docs/en/changelog>) adds the
  field under 2.1.295, of October 8, 2026, and says nothing of an unknown
  key on a hook's entry under any release: what it has is an unrecognized
  hook event name that no longer has a settings file ignored (2.1.101), a
  malformed hooks entry that no longer invalidates the whole file
  (2.1.122), and a top-level `$schema` in a plugin's `hooks/hooks.json`
  that no longer shows an "unknown key" notice (2.1.274).
- **The settings page** (<https://code.claude.com/docs/en/settings>, *Fix a
  broken settings file*) has a value the schema rejects make Claude Code
  set aside the file, or the entry alone, without saying which keys of a
  hook's entry its schema of a release accepts.
- **The plugin manifest reference**
  (<https://code.claude.com/docs/en/plugins/manifest-reference>,
  *Unrecognized fields*) has some of a plugin's objects strict, an
  unknown key in one keeping the plugin from loading, and a field it names
  (`options`) that keeps a plugin from loading on a release before the one
  that added it. It is not the page of a hook's entry.

So what a release from 2.1.139 to 2.1.294 does with the key cannot be
told: it may pass over it, or set the entry aside as one its schema
rejects, which would leave the guard unloaded and every write unchecked on
that release. That follows from the pages and is none of their sentences.
The side that holds the write is the one that keeps the hook loaded on
every release a consumer may still run:

- **`init` writes the field only where it is asked to**, with
  `--block-on-failure`, an option of `init` alone (`src/usage.ts`). Asked,
  it gives `"onFailure": "block"` to each of its own entries, the line it
  writes under `PreToolUse`, `PostToolUse` and `SessionStart`, in a file it
  writes them into and in one an earlier run wrote them into (`update`),
  and to no line a person wrote or changed, which is theirs. Exit 2 does
  nothing more than a notice after a write and as a session starts, by the
  reference, so the field changes nothing there; it is written on all
  three so that they stay one line. Without the option no entry carries
  it, as in every release, and none that carries it loses it. A file that
  holds a line `doctor` fails is the person's to mend, as before, and
  `init` writes nothing into it.
- **The entry at the end of a turn is left without it.** `init` writes
  that entry under `Stop`, in the background, where the configuration asks
  for the report (amended before this, the same day). The hooks reference
  (*Block the action when a hook fails*, read 2026-10-19) says "The field
  has no effect on these hooks", and lists `Stop` hooks among them, since
  exit 2 as a turn ends sends Claude back to work, and background command
  hooks, those that set `async` or `asyncRewake`. So `--block-on-failure` leaves that entry as
  it is, `withOnFailure` reading the three events alone, and `init` says
  the field is on the other three. A question the hook cannot read as a
  turn ends, or a line of its own it cannot read there, is said as
  `systemMessage` with exit 0, as on every other event (ADR-0005).
- **The plugin's `hooks/hooks.json` does not carry it.** A plugin has no
  option, and is read by whatever release loads it.
  `tests/integration/released-lines.test.ts` holds its entries to the four
  keys every release wrote.
- **`doctor` says which a line has, and advises it** where the Claude Code
  on `PATH` reads the field, at 2.1.295 or later: of a line that guards
  and whose entries set none, a note that a hook that cannot start, or
  runs past its timeout, lets the write go ahead, that `"onFailure":
  "block"` holds it where every Claude Code that reads the file is 2.1.295
  or later, and how it is written, `init --write --block-on-failure` for
  init's own entries in `.claude/settings.json`. It fails nothing, and is
  not said where the release is older or cannot be told. Of a line that
  sets it, the note says what it holds, as before. `--format json` has
  each line's `onFailure`, as before, and the note as `note`; no field is
  added.

Input accepted that was refused, and a note added: a minor release beside
the exit code ADR-0005 changes (spec-core's ADR-0009). What was found and
left as it was:

- **The plugin's own entries.** A plugin user has no way to the field but
  to turn the plugin off for the project and have `init`'s entries
  instead; `doctor` does not say so, since it reads no line of the
  plugin's.
- **The timeout on the entry.** `init` and the plugin write `"timeout":
  60`. Under `onFailure: "block"` a hook that runs past it holds the
  write, and without the field lets it go ahead. What the hook waits on
  within that minute is not changed here.

*Amended 2026-10-26.* **The lines an earlier release wrote, under the scope
the family left.** From 0.22.0 the package is `@spec-family/spec-harness`
(ADR-0011, amended the same day), and every line `init` writes and the
plugin brings runs
`${CLAUDE_PROJECT_DIR}/node_modules/@spec-family/spec-harness/bin/spec-harness.js`.
The lines 0.1.2 to 0.21.0 wrote run the same script under `@descent-vtt`,
which no release under the new name installs or looks for. Claude Code's
hooks reference (https://code.claude.com/docs/en/hooks, *Block the action
when a hook fails*, read 2026-10-29) counts a command hook that cannot
start, its script not there, as one that failed, and on most events
carries out the action all the same; the exception it names is a
shell-form `PreToolUse` hook on Windows without Git Bash, and these lines
are exec form. It follows that such a line guards only while the earlier
package is installed, and once it is uninstalled lets every write go
ahead, where `init` writing a line once and never again had been safe.

- **`init --write` rewrites them.** An entry whose command is `node` and
  whose arguments are the earlier line's, word for word, is init's own:
  it is rewritten where it stands, keeping its other fields
  (`timeout`, `async`, `onFailure`), under `PreToolUse` and
  `PostToolUse`, as 0.1's npx line was, and under `SessionStart`, which
  0.19.0 on wrote, and `Stop`, which 0.20.0 on wrote. So is the server's
  entry in `.mcp.json`, the spec-brief plugin's name in `.spec-brief.json`,
  `@descent-vtt/spec-harness/spec-brief-plugin` from 0.1.2 on, which
  spec-brief 0.12.0 stops its `lint` at exit 2 for once the package is
  gone (measured), and, with `--git-hook`, git's pre-commit hook where it
  is byte for byte one 0.10.0 to 0.21.0 wrote. A line with more on it, one
  in another settings file, a hook with anything else in it and a plugin
  named by a path are a person's, and are said, not rewritten.
- **`doctor` says where one stands.** A line whose script ends in the
  earlier scope's path guards while that script is there, and is said with
  how to move it, failing nothing; where it is not there it is off, exit 1,
  as any line whose script is gone, with the same mend. git's hook and the
  plugin's earlier name are noted the same way. The plugin's own hooks are
  still not read: a plugin user installs the new package in each project
  the plugin guards before taking the release that names it.
- **`tests/integration/released-lines.test.ts` keeps the earlier lines**
  beside the new ones, as data, and runs the rewritten entries as Claude
  Code starts them.

*Amended 2026-11-08.* **Two more names the earlier scope left: spec-brief's
schema and the spec-brief plugin in `audit`'s hint.**

- **`init --write` moves `$schema` in spec-brief's configuration**, where
  it names a place spec-brief's `init` wrote before the move: the copy in
  the earlier package, `./node_modules/@descent-vtt/spec-brief/schema.json`,
  which spec-brief's `init` wrote from its release of 2026-09-26 on, and the
  file on the earlier repository's main before that. Neither is there for a
  project that installs `@spec-family/spec-brief`, so an editor checks the
  file by no schema. It is written as
  `./node_modules/@spec-family/spec-brief/schema.json`, what spec-brief's
  `init` writes now, where it stands in the file, in the same `update` as
  the plugin's name, and said in it. A schema anywhere else is a person's,
  and left. `doctor` says nothing of it: nothing it checks reads the key.
- **`audit` says the plugin's earlier name where the configuration names
  it so.** For a protected file a verified ruling allows, which the
  archive refused, `audit` advised adding the plugin by its name now
  wherever the configuration did not load it by that name. Beside the
  earlier name, which spec-brief loads from the earlier package while that
  is installed, that is a second plugin of one name, which spec-brief
  refuses. Where the configuration names the plugin by the earlier name
  alone, which `doctor` reports as `earlier`, the hint says so and that
  `init --write` names it in its place. `AuditInput` has
  `pluginNamedEarlier` for it, optional, so a caller of the library that
  does not give it reads the hint as before.

*Amended again 2026-11-08.* **The project's install stays the one way in, and
`doctor` holds a plugin-only project to it.** The plugin's hooks and server
run `${CLAUDE_PROJECT_DIR}/node_modules/@spec-family/spec-harness/bin/spec-harness.js`.
In a project that has not installed the package that script is not there,
so Claude Code cannot start the hooks and lets each write go ahead (the
hooks reference, as the amendment of 2026-10-26 read it), and `doctor`
exited 0: it read whether the plugin was on this machine, and nothing of
what it ran. On a CI runner, where no Claude Code keeps plugins, the same
project's `doctor --strict` failed, the plugin being one that cannot be
told to be there, and the release of a `claude` that is not on the runner
being asked for it.

Two ways out were put to the maintainer in round 27: hold the project to
the install, or ship the program inside the plugin and run it from
`${CLAUDE_PLUGIN_ROOT}`, which a listing in Anthropic's plugin directory
would want. The maintainer decided the first, and that this decision is
otherwise unchanged. The reason is the lockfile: a project that installs
the package pins, in its `package-lock.json`, the release of spec-harness
its siblings were measured against (`MINIMUM_VERSIONS`, ADR-0011), and every
clone, CI and git's hook run that release. A plugin carries whatever
release the person last fetched, which no file of the project records. The
plugin is not moved to `${CLAUDE_PLUGIN_ROOT}`.

- **`doctor` reads what the plugin runs**, where it may be on this machine,
  `present` or `unknown`: each script under `${CLAUDE_PROJECT_DIR}` that
  `hooks/hooks.json` and `.mcp.json` of each version a cache holds name, the
  files Claude Code loads them from (*Find plugins on disk*), read in every
  string so that exec form and shell form are both read; and where no version
  is cached, as for a plugin a relative path loads, the script every release
  under `@spec-family` runs. Each is looked for in the places
  `${CLAUDE_PROJECT_DIR}` can name, a linked worktree's own and its main
  work tree's (amended 2026-10-24). One that is in neither exits 1, with
  `npm install --save-dev @spec-family/spec-harness`, and, for a script
  under `@descent-vtt`, which only a plugin before 0.22.0 runs, that the
  plugin wants updating as well. A plugin `absent` from the machine starts
  nothing, and is read as before. This replaces the sentence of the
  amendments of 2026-10-18 and 2026-10-26 that the plugin's own hooks are not
  read.
- **A plugin of a release after the package installed is a note**: the
  version a cache directory names, read as a release, against the
  `package.json` of the package in this work tree. The hooks and server are
  the plugin's release, and the package here answers them. A directory named
  by a commit, as a plugin with no version is cached, is not compared.
- **On a CI runner the plugin is not required.** Where `CI` is set to
  anything but `false` or `0`, as GitHub Actions and GitLab CI set it on
  every job, and no cache holds a version of the plugin, its presence is
  `unchecked`: no Claude Code session runs there, so it brings nothing, is
  not counted as wiring, the release of Claude Code is not asked for it,
  what it would run is not read, and `--strict` fails nothing for it.
  Beside init's entries the wiring is theirs, as beside a plugin that is not
  on the machine, so a project that commits both is the double install on a
  person's machine and not on its runner. A runner that holds the plugin
  after all is read as any machine. The variable is the forges' own, and
  the harness reads it for no other purpose.

`--format json` has `claudeCode.pluginVersions`, the versions a cache holds,
and `claudeCode.pluginScripts`, each script with the `file` it was read
from, `null` for the release's own, and whether it is `there`, `null` where
nothing was read; `claudeCode.presence.state` gains `unchecked`. Nothing is
renamed or taken away, so no `schemaVersion` moves; an exit code that can
change for a tree that passed is a minor release (spec-core's ADR-0009).
`init` is unchanged: on a runner it reads the plugin as it reads one that
cannot be told to be there, and writes neither entry.

*Amended 2026-11-11.* **Azure Pipelines and Jenkins are runners too.**
Neither sets `CI`: Azure Pipelines sets `TF_BUILD` to `True` on every job,
and Jenkins sets `JENKINS_URL` to its own address. On either, a plugin-only
project's `doctor --strict` failed where on GitHub Actions and GitLab CI it
passed. So where `CI` is not set, `TF_BUILD` set to anything but `false` or
`0` says a runner, and so does `JENKINS_URL` set to anything. `CI` set to
`false` or `0` still says no runner, whatever else is set: it is the one
variable a person sets to say so. The detail names the variable that said
it, and `CI` is said in the words it was. No other forge's variable is
read, and none for any other purpose; nothing is renamed or taken away, and
no run that passed can fail for it.

*Amended 2026-11-12.* **The one way in is Claude Code's, and other agents
run it too.** By their documentation, read 2026-11-12, GitHub Copilot (CLI
and cloud agent) and Cursor read `.claude/settings.json` and run the hook
lines `init` wrote, and each answers a hook in a language of its own:
Copilot needs `exec` where `init` writes `args`, reads a top-level
`permissionDecision` and holds a write whose hook exits non-zero, so it
would hold every edit; Cursor lets a write through for any exit but 2, so
every one would go ahead, with no word. `init`'s line run by hand, `node`
with no script, exits 1; neither agent was run against it. The
README and the guard reference say that the write guard covers Claude Code
only, and `hook claude` says in one line to the person, exit 0, that a
write is not checked where the question carries another agent's fields,
an event of another agent's, or a tool the guard does not know that names
a file or carries a patch (`otherAgent`, hooks.ts). It checks nothing for
such a question: it cannot answer in a language the asker reads. Adapters
of their own, `hook codex` and `hook copilot`, are round 29's next step
(its D2).
*Amended again 2026-11-12.* **Two more ways in: Codex and Copilot.** Round
29 decided (its D2) to guard the writes of the two agents whose hooks can
refuse one and whose shapes are the nearest Claude Code's: OpenAI's Codex
CLI and GitHub Copilot. The guard's decision is one, and each agent's
question is read into the tool and the files it writes, and the decision
answered in the agent's language, by `hook codex` and `hook copilot`;
`hook claude` answers as it did. The shapes are from Codex's hooks
reference and its source at c0cc9fc, and from Copilot's hooks reference,
read 2026-11-12.

- Codex's question has Claude Code's shape. `apply_patch` carries its patch
  as `tool_input.command` and names no file in a field, so the files are
  read from the patch's headers; a shell command that hands `apply_patch` a
  heredoc is applied by Codex too, and is read the same way. A refusal is
  `hookSpecificOutput` with a reason: Codex counts one without a reason as
  a hook that failed, and an `ask` too, so where the guard would ask it
  refuses, and says why.
- Copilot's question is `toolName` and `toolArgs`, which its reference
  types as unknown and its tutorial as a JSON string; both are read. Its
  reference names no argument a file is in, so every name an editing tool
  gives one is read. The answer is `permissionDecision` at the top of the
  object, `deny` or `ask`.
- Both run the tool where a hook fails, times out or says nothing they
  read, and Copilot refuses where one exits otherwise than 0, with a reason
  of its own. So the two refuse in words what they cannot read or check,
  with exit 0, where `hook claude`, whose question Claude Code's own hooks
  shape, says it and passes: a new way in fails closed.
- `init` writes each agent's file where the repository keeps the
  directory the agent reads it from, `.codex` and `.github/hooks`, and
  neither elsewhere. Codex's entry is a shell string, run from the
  session's directory, so it asks git for the top under a POSIX shell.
- Copilot runs the lines of `.claude/settings.json` as well, by its
  documentation, as the amendment before this one says, and that line,
  which it cannot run, holds every edit whatever `hook copilot` answers.
  A line of Claude Code's that Copilot runs too, or one it is told to
  pass over, is round 30's.
- Not done: Cursor, Gemini CLI and Devin, round 30 or later; a hook after a
  write for either agent, so a write outside the scope is not warned of
  there; a live test in either agent, which nothing here can run.

## Consequences

- A plugin turned on by managed settings or `--settings` is invisible to
  init and doctor: neither is a file a project can read. A marketplace that
  lists this repository under a name other than `spec-harness` is not
  recognised either.
- A settings file that cannot be read as JSON says nothing about the plugin
  or the guard.
- A person with the plugin on in their user settings, in a repository that
  committed init's entries, has a double install: doctor exits 1 and says to
  turn the plugin off for the project, which the local settings file keeps
  to them.
- init reads the user's settings from `CLAUDE_CONFIG_DIR`, or `.claude`
  under `USERPROFILE` on Windows and `HOME` elsewhere, as Claude Code does;
  with none of them set it reads the project's two files alone.
