# spec-harness

**Rounds of agent work under a brief a person approved: what the agent needs to start, a guard on every write, an escalation a person signs when the brief is not enough, and an audit when it ends.**

spec-harness is the agent-facing member of the [spec-\* tools](https://github.com/spec-family/spec-core#the-family). It calls no model and writes no content - the agent is the model. It gives the agent the contract and the facts, and answers, the same way every time, whether the agent stayed inside the lines. No runtime dependencies, no account, no network.

The family's words - brief, round, wave, ruling, premise, the two kinds of plugin - are defined in [concepts](https://github.com/spec-family/spec-core/blob/main/docs/concepts.md), and the [tutorial](https://github.com/spec-family/spec-core/blob/main/docs/tutorial.md) takes one round from the brief to the archive in ten steps.

```bash
npm install --save-dev @spec-family/spec-harness @spec-family/spec-brief
npx --no-install @spec-family/spec-harness init            # the plan: what it would configure, and why
npx --no-install @spec-family/spec-harness init --write    # apply it
```

## Names

The package is `@spec-family/spec-harness`, and the command it installs is `spec-harness`. The name without the scope is not this project: on npm, `spec-harness` is another publisher's package, and it installs a command of the same name.

`npx` fetches and runs the package of whatever name it is given when the project has none installed - a fresh clone, a worktree before `npm ci`, a CI job without the install step - and without a terminal, as under an agent, it does not ask first. So give `npx` the full name:

- `npx --no-install @spec-family/spec-harness` in a project that installed it: it runs that install, the version the lockfile pins, and where there is none it stops with an error that names this package. Every command in this README and in the skills is written so.
- `npx @spec-family/spec-harness`, without `--no-install`, fetches this package where nothing is installed. The harness works from a project's install, its own and spec-brief's, so that is for a look at `--help` and little else.

<!-- bare-name: the two forms in the next sentence are shown as what not to write -->
Never `npx spec-harness`, and not `npx --no-install spec-harness` either: `--no-install` stops a download, and npm still runs a copy of the other package that an earlier fetch left in its cache, and where nothing is installed it reports that package, by its own version, as the one to install. If the bare name was ever run through `npx` on a machine, in a tree without the install, empty npm's cache of fetched commands there: the `_npx` directory below the path `npm config get cache` prints.

The same holds for the siblings: `@spec-family/spec-brief`, `@spec-family/spec-guard` and `@spec-family/spec-graph`, whose names without the scope belonged to nobody on npm on 2026-10-07. The hooks, the MCP server and git's hook go through no `npx` at all: they run `node` with the path of the installed file ([ADR-0012](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0012-one-way-into-claude-code.md)). The family's [adopting guide](https://github.com/spec-family/spec-core/blob/main/docs/adopting.md#names) has what was measured, under npm 10, 11 and 12.

## Requirements

- **spec-brief 0.12.0 or later**, required: the brief is the contract, spec-brief is its reader, and 0.12.0 is its first release as `@spec-family/spec-brief`, the only name a sibling is found under. Its archive asks this package's spec-brief plugin about signed rulings, as every release from 0.2.0 on has.
- **spec-guard 0.30.0 and spec-graph 0.21.0 or later**, used when they are installed: their first releases under the same scope. Their absence is reported, never assumed clean.
- **Claude Code 2.1.139 or later** runs the guard hooks and the Claude Code plugin's server: the hooks pass the project's path in a hook's `args`, which Claude Code reads from that release on, and the plugin's server names `${CLAUDE_PROJECT_DIR}`, which a Claude Code plugin may from the same release ([ADR-0012](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0012-one-way-into-claude-code.md)). An older Claude Code runs every write unguarded, so `doctor` checks the one on `PATH`.
- **git 2.31 or later**: spec-harness asks git where its shared directory and its hooks are with `rev-parse --path-format`, which that release added (2021).

A sibling installed below its minimum is never run: `doctor` and every command that needed it name the minimum ([ADR-0011](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0011-releases-are-staged-by-ci.md)).

## A round

```text
person approves brief 012 ─▶ agent on branch brief/012-rotate-tokens
                                   │
            spec-harness context ◀─┘  the brief, its scope, signed rulings,
                   │                  the rules in force, the documents it cites
                   ▼
         agent edits ── hook: protected? refused, with the next step
                   │          outside the scope? a warning after the write
                   │
                   ├── needs a protected file ─▶ escalate ─▶ person rules, signs
                   ▼
            spec-harness audit ─▶ spec-brief archive --dry-run ─▶ person archives
```

### Which brief

The first of these names the round's brief; it is never guessed ([ADR-0004](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0004-the-active-brief-is-named-not-guessed.md)):

1. `--brief <id>`;
2. `SPEC_BRIEF`;
3. the branch name: `brief/{id}`, `brief-{id}`, `*/brief/{id}`, `*/brief-{id}`.

The branch is read as HEAD names it, `refs/heads/` taken off, so a tag of the same name does not hide it: `claude/brief-042-x` beside a tag `claude/brief-042-x` names brief 042, where git's short name for it, `heads/claude/brief-042-x`, named none.

CI checks out a commit on no branch, so on a detached HEAD the branch is the one the forge's CI names, the first of:

| Variable | Set by |
| --- | --- |
| `GITHUB_HEAD_REF` | a GitHub pull request |
| `GITHUB_REF_NAME`, when `GITHUB_REF_TYPE` is `branch` | a GitHub push |
| `CI_MERGE_REQUEST_SOURCE_BRANCH_NAME` | a GitLab merge request pipeline |
| `CI_COMMIT_BRANCH` | a GitLab branch pipeline |

A branch checked out always wins, and `doctor` says which variable named the branch. Without them, a round's own CI run would name no brief, and `premises` would report the premise the round retires as stale.

A name that names no brief is not passed over for the next ([ADR-0004](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0004-the-active-brief-is-named-not-guessed.md)):

- `--brief` given nothing, `--brief ""`, is refused, as `--brief "$ID"` is where the variable is not set: it was read as the option left out, and the branch's brief answered.
- `SPEC_BRIEF` set and empty, or to space alone, is as unset. A hook's settings and a pipeline's `env` block set it whether or not a round is under way, and the branch then names the brief, which `doctor` shows.
- An id spec-brief does not know, or one it has archived, is not passed over either, whichever of the three names it: a command that acts on the brief stops with exit 2, and `doctor` says so in its report. The line says what named it: `the flag names brief 999, and spec-brief knows no such brief`, or `the environment`, `the branch`, or `the argument` for `context 999`.
- `context`, `rulings`, `audit` and `probe` take the brief's id as their argument as well, which comes before all three. The argument beside `--brief` is refused, whatever the two hold: one of them would not be read.

### Worktrees, and the branches an app makes

An app that makes a branch for a session puts a name of its own before the brief's, and the default `*/brief-{id}` reads it: `claude/brief-042-rotate-tokens` is brief 042. A `*` stands for a run of characters other than `/`, so `claude/team/brief-042-x` names no brief under the defaults, and does with a template of one star more. `branches` replaces the defaults, so name them beside it:

```json
{ "branches": ["brief/{id}", "brief-{id}", "*/brief/{id}", "*/brief-{id}", "*/*/brief-{id}"] }
```

- `claude --worktree <name>` makes its worktree under `.claude/worktrees/<name>/`, on a new branch named `worktree-<name>` ([Claude Code's worktrees page](https://code.claude.com/docs/en/worktrees), *Start Claude in a worktree*). No default reads it: `worktree-brief-042-x` names no brief. With `worktree-brief-{id}` among the `branches`, `claude --worktree brief-042-x` works on brief 042.
- A branch that names an id spec-brief does not list, as `claude/brief-999-x`, is not passed over for the next: every write of the session is held until the brief or the branch is mended. Where Claude Code starts the hook as a session starts, the entry `init` and the plugin write under `SessionStart`, the session is told so before its first write.
- A tag of the same name as the branch does not hide it: the branch is read as HEAD names it.
- In a worktree session started from the desktop app, and after Claude enters a worktree mid-session, Claude Code starts the hook with `${CLAUDE_PROJECT_DIR}` at the main checkout and hands it the worktree as the question's `cwd` (the worktrees page, *What worktrees share with the main checkout*; [the hooks reference](https://code.claude.com/docs/en/hooks), *Reference scripts by path*). The worktree's branch names the brief, and a worktree with no install of its own is checked with the project's: an Edit of a file brief 042 protects, in a worktree on `claude/brief-042-x` of a main checkout on `main`, is refused.
- A path is decided by the work tree that holds it, where that is a work tree of the same repository, whichever `cwd` is in: an Edit of a file brief 042 protects, in a worktree on `claude/brief-042-x`, is refused from a session at the main checkout and from one in another worktree, inside the project or beside it. A path in no work tree of the repository is decided as before ([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md)).
- A nested repository, a submodule or a clone inside the tree, is another repository, and a path in it is decided as before, by the work tree of the project's repository that holds it, under the path it has there. What that lets through: a file the nested repository's own brief protects is outside the project's scope, warned of after the write and not refused, and one the project's brief does not reach passes with no word. That repository is guarded by its own hook, in its own sessions.
- Where `${CLAUDE_PROJECT_DIR}` points in a session started with `claude --worktree` is on no page of Claude Code's: the hooks reference has it the project root where the session started, the worktrees page has the flag start Claude in the worktree, and a worktree a fresh checkout to install dependencies into, and says where it points only for a session started from the desktop app. Where it is the worktree, the next point holds.
- git's pre-commit hook in such a worktree runs the main work tree's install where the worktree has none, and refuses the same file at the commit. So does every other command, `guard`, `context`, `audit`, `probe` and the rest, where each said that spec-brief is not installed here. A hook an earlier release wrote reads the worktree's own install alone: take it away and run `init --git-hook --write`.
- Where `${CLAUDE_PROJECT_DIR}` is the worktree itself, the project root a session started in, the hook's script is looked for in the worktree's own `node_modules`. A worktree is a fresh checkout (the worktrees page, *Set up the worktree environment*), and where it has no install, node cannot find the script and exits 1: Claude Code reads that as a hook's non-blocking error, and the write goes ahead (the hooks reference, *Exit code output*). Install in the worktree before such a session writes. From Claude Code 2.1.295, `"onFailure": "block"` on the hook's entry holds the write instead: `init --block-on-failure` writes it on init's PreToolUse, PostToolUse and SessionStart entries, and the plugin does not carry it ([ADR-0012](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0012-one-way-into-claude-code.md)).

### Sessions that write through a shell, with no rulings

Claude Code starts the guard for `Edit`, `Write`, `MultiEdit` and `NotebookEdit`, the matcher `init` and the plugin write. A `Bash` or `PowerShell` call takes a command, not a file, and the guard is not asked about what it writes. With brief 042 covering `src/**` and protecting `src/db/schema.ts`, and `notes.md` outside its scope, each layer was run:

| Layer | Catches | Lets through |
| --- | --- | --- |
| The guard, before an Edit | an Edit of `src/db/schema.ts`: refused, with the next step | an Edit of `notes.md` under `outOfScope: "warn"`; every shell command |
| The guard, after an Edit | an Edit of `notes.md`: a warning to Claude | every shell command |
| The hook as a session starts | a configuration that does not load, an id spec-brief does not list, spec-brief missing or too old where a brief is named: one line, to the person and to Claude | everything: it holds nothing, and the event cannot block |
| The report at the end of a turn, `"turnReport": true` | every path the work tree holds changed, a shell's writes among them: `src/db/schema.ts` reported as protected and `notes.md` as outside the scope, to Claude as the next turn begins | a change made and undone, or committed, within the turn; an ignored file; a turn an interrupt or an API error ends; and it refuses nothing, the write having happened |
| git's pre-commit hook, `init --git-hook` | every staged path, a shell's writes among them: `src/db/schema.ts` refused; `notes.md` warned of under `warn`, refused under `ask` and `deny` | `git commit --no-verify`, which skips the hook ([githooks](https://git-scm.com/docs/githooks), *pre-commit*) |
| `spec-harness audit` | the round's commits from the base: `src/db/schema.ts` changed, an error, and `notes.md`, a warning; exit 1 | what the brief, as it stands at the end, allows |
| `spec-brief archive --strict --base <branch>` | the same, both errors: the brief is not archived | the same |

What every layer lets through:

- **An edit of the brief.** Its file is always writable, and the audit and the archive read the brief as it stands at the end: a round that adds `notes.md` to `affectedFiles` and takes `src/db/schema.ts` out of `protectedFiles` is archived with `--strict`. The change is in the brief's diff, for the person who approved it to read.
- **A shell's write**, until the commit; with `turnReport` on, it is reported at the end of the turn, and not refused.
- **`git commit --no-verify`**, until the audit.
- **The commit that archives the round's brief**, past git's hook, which holds every other commit on a branch whose brief is archived. spec-brief's archive runs on the round's branch, before it merges, so the hook takes what the archive left staged, the brief's move and the links it rewrites in live briefs, with nothing else beside them. A merge of the base that stops on a conflict is held with the rest: merge the base before the archive ([ADR-0004](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0004-the-active-brief-is-named-not-guessed.md)).
- **A Claude Code mod** that handles `tool.check` can approve a call a `PreToolUse` hook blocked, unless the hook is in managed settings ([Claude Code's permissions page](https://code.claude.com/docs/en/permissions), *Precedence among rules, hooks, and mods*).

Two more layers were weighed and not built. A `PostToolUse` hook for the shell tools: every shell command would pay for it, it is easy to get around, and the audit stays the gate; the report at the end of a turn is paid once a turn, in the background, and reads the work tree rather than a command ([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md), amended 2026-09-30). And `"protected": "ask"`: a protected file passes the guard only by a ruling whose commit a person signed, which the audit and the archive check again ([ADR-0006](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0006-a-ruling-is-a-signed-commit.md)), and an approval given in the session is kept nowhere they read.

## Commands

In the order a round meets them; `init` and `doctor` set a repository up and check it.

### `context [brief]`

The packet an agent starts a round with: the brief in full - it is the contract - then what it implies:

- the files the round may write and must not change, as the guard reads them;
- the rulings already signed;
- the briefs it depends on, and whether they are done;
- the architecture rules spec-guard holds that code to;
- the documents the brief links to, whole, until the packet reaches its budget (`context.budget`, 60,000 characters). Documents left out are named by path, not dropped. Each is headed by its first level-one heading and the status its front matter gives under `status`, in English as every spec-* tool reads it, whatever language the document is written in.

`--base` names the base the rulings are verified against.

**The rules over the scope.** spec-guard is asked about where `affectedFiles` can reach, not the whole repository ([ADR-0001](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0001-the-harness-decides-the-agent-writes.md)):

- for a pattern, the directory it reaches: `src` for `src/**` or `src/`;
- for a name with no glob syntax that exists, `src` or `src/a.ts`, that name;
- for a name the round has yet to create, the directory that will hold it, the root for a name at the top, since it may become a directory as well as a file.

Rules spec-guard could not read are named as unread, with what it said, never as none; a repository where no spec file matches spec-guard's patterns has none.

A spec pattern of spec-guard's that matches no file beside others that do is neither. spec-guard 0.22.0 and later refuse the question for it, exit 2, and still answer with the rules of every spec file that did match. The packet lists those rules as it lists any, under one sentence that names the pattern: `` spec-guard's pattern `rfcs/*.md` matched no spec file, so a rule kept under it is not listed here; remove the pattern from spec-guard's `specs`. `` `context --format json` and `start_round` name the patterns as `unmatchedSpecs`, an empty list where spec-guard names none. An older spec-guard says nothing of such a pattern, and its rules are listed as they were.

**What it could not read is named, never left out.** A cited document whose front matter opens on its first line and is never closed is one spec-core's scanner reads as having no front matter: its status was not read, and the packet says so, with the fix - close the block with `---` on a line of its own - rather than showing a document without one. So is each line of closed front matter that is not `key: value`, such as `status accepted` without its colon, or an indented line with no key above it: spec-core's reader passes over it, so a status written on it was not read, and the packet names the document, the line as written and spec-core's reason. `context --format json` and `start_round` list them as `unreadableFrontMatter`, each with its `path`, `line`, `text` and `reason`. The notes fail nothing; `context` exits 0.

A pattern the guard cannot read - malformed, too large to compile, or naming no path, such as `{./,src}` - is named as unread where it is listed, with spec-core's reason, the one the guard gives when it passes over it:

| Unreadable in | What the packet says of it | In `context --format json` and `start_round` |
| --- | --- | --- |
| `affectedFiles` | It puts no path in the scope, and spec-guard is not asked about it. When no pattern in `affectedFiles` can be read, the packet says the scope could not be read, never that spec-guard holds no rule over it. | `unreadableScope`, each with its `pattern` and `reason` |
| `protectedFiles` | Until it is fixed, the guard refuses every write but to the brief, and no ruling waives the refusal. | `unreadableProtections`, each with its `pattern` and `reason` |
| a signed ruling's paths | The guard passes over it, so it allows nothing. | `unreadableRulingPaths`, each with its `pattern`, `reason` and `ruling` |

A pattern a leading `/` roots at the filesystem's root, alone or on a brace alternative, such as `/docs` or `{/docs,src/**}`, can be read, and names no path the guard decides, all of which are repository-relative. Where it is listed, it is marked:

- in the scope, as putting no path in it: spec-guard is not asked about it, so the rules over the rest of the scope stand;
- as a protection, as protecting no path;
- as a ruling's path, as allowing nothing.

### `guard <path...>` and the hooks

May the round write this?

| The path | The answer |
| --- | --- |
| one the brief protects | **Refused**, unless a signed ruling allows it. |
| one in `affectedFiles` | Allowed. |
| anything else | **Outside the scope**: a warning by default, or a question to the person, or a refusal (`outOfScope`: `warn`, `ask`, `deny`). |

Paths are compared as the filesystem spells them, links resolved and case corrected, so `SRC/db/schema.ts` does not walk past a protection on `src/db/schema.ts` on Windows.

A path through a link is decided two ways: as it reads, its `..` taken first, and as the system writes it, which on Linux and macOS reads a `..` from where the link before it leads and follows a link to nothing to the file it names. Each file is decided by the work tree that holds it, and the stricter answer stands, so `deep/../schema.ts`, `deep` a link to `lib/x`, is refused where `lib/**` is protected, in words that say where the link leads. Which of the two Claude Code's tools write, its hooks reference and its permissions page do not say (read 2026-10-24). On Windows, which reads the `..` first, the two are one ([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md)).

- `spec-harness hook claude` answers Claude Code's PreToolUse and PostToolUse hooks: a refusal before the write, with the reason and the next step; a warning after a write outside the scope. It never answers `allow`, which would skip the person's own permission prompt. When it cannot answer - the configuration does not load, the briefs cannot be read, the harness meets an error it did not expect - it exits 2, and before a write Claude Code then holds the write.
- While `.spec-harness.json` does not load, a write to that file itself is let through, so that a session can mend it: no decision, so the person's own permission prompt stands, and the line that says why every other write is held, to the person as `systemMessage` and to Claude as `additionalContext`, as `.spec-harness.json: unknown key "outofscope"; ..., so every other write is held until it loads; this write, to /work/app/.spec-harness.json itself, is not checked`. The write is to the file and nothing else as the hook reads a path and as the disk does: a file that stands under that name alone, not a link to one and with no second name, named by every path of the call. A file of the same name elsewhere, a link to it, and the configuration of another work tree than the one that does not load are held as every other write is. After the write the hook loads the file again, and says, exit 2, where it still does not load. While it does not load nothing of it is read, so a brief that protects the file, or an `outOfScope` it sets, does not hold this write; the audit and spec-brief's archive still measure the round's change to it ([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md)).
- A write outside every work tree of the repository is decided as one outside the repository is, whatever holds the writes inside: a brief that is archived, or that spec-brief does not list, whichever names it, and a configuration that does not load. It passes with no word, before the write and after it, and spec-brief is not asked about it; `guard` says it is outside the repository. The work trees are the main one and every linked worktree, as the files git keeps under its common directory name them, and a file of a linked worktree is decided as any other inside, by the worktree that holds it. Where they cannot all be named, a git directory kept apart, an entry git keeps that cannot be read, or a `core.worktree` where the configuration does not load, the write is held as before, and so is a path with a `..` in it, and one that a link outside them, a link to nothing among them, has written into a work tree. A path with a `..` that reads both ways as outside every work tree is held in its own words, that a link before the `..` can lead back into one, with how to write it, where it was held in the words of the brief ([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md)).
- In a worktree, a write is decided by the worktree's brief. Claude Code names the project a session started in, and hands the hook the directory Claude works in as the question's `cwd`: in a worktree session started from the desktop app, and after Claude enters a worktree, the first is the main checkout and the second the worktree. Where `cwd` is in another work tree of the same repository, that work tree's branch names the brief, its briefs and configuration are read, and its siblings are looked for in its own `node_modules` and then the project's, so a worktree with no install is checked with the project's. A path it does not hold, and every path where `cwd` is in another repository or in none, is decided by the project as before ([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md)).
- After a write the hook answers from what it decided before it, for the same call: the run before keeps the warnings it would give under the git common directory, in `spec-harness/calls/`, named by the question's `session_id` and `tool_use_id`, and the run after takes them away and answers with no process started. A refused call keeps nothing, nor one that writes `.spec-harness.json`, spec-brief's configuration, the brief or a file beside it, which are decided again after the write; what no run after a write reads is removed after a day. Under `outOfScope: "ask"` or `"deny"` no write is warned of, and the run after one says nothing with no process started ([ADR-0002](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0002-siblings-through-their-command-lines.md)).
- On a brief's branch the hook asks spec-brief for the briefs, which on Windows is most of what a write waits on. Within a session it keeps spec-brief's answer, where spec-brief's `list` names every input it was read from (`inputs`), under the git common directory in `spec-harness/answers/`, by the work tree, the session, spec-brief's script and version, the command line, and the variables git and Node read; and it gives the answer again while each file on the list has the digest listed, or is still not there, each directory holds the files listed, or is still not there where it was listed as not there, and the git index and ignore files read as listed, with no process started. Anything else starts spec-brief as before: an input that is missing, unreadable or reads otherwise, `keep` not `true`, an answer with no `inputs`, a command `tools` names, and, where the list names what git read, `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE` or `GIT_COMMON_DIR` set. What is kept is removed after a day; every other command starts spec-brief every time ([ADR-0002](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0002-siblings-through-their-command-lines.md)).
- As a session starts, resumes, is cleared, compacted or forked, `hook claude` answers Claude Code's SessionStart with what would hold every write of the session, in one line, to the person as `systemMessage` and to Claude as `additionalContext`, with the writes it would not hold, one to a file outside every work tree of the repository, as the report at a turn's end says: a configuration that does not load, a brief the line, `SPEC_BRIEF` or the branch names that spec-brief does not list, spec-brief missing or too old where a brief is named, and what is wrong with the hook's own line. Nothing is said where all is well, and it exits 0 whatever it finds: the event cannot block, and the session's start is not to be stopped by it ([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md)).
- With `"turnReport": true` in `.spec-harness.json`, `hook claude` answers Claude Code's `Stop`, which it runs as its main agent finishes a turn: with one `git --no-optional-locks status`, every path the work tree holds changed, a shell's writes among them, that the brief protects or that is outside its scope under the `outOfScope` in force, in the words a write of each is given, twenty by name and how many more, as one `systemMessage`; or nothing. It exits 0 and never has Claude go on. `init` writes the entry with `"async": true`, so the turn waits on none of it and Claude Code hands the report to Claude as the next turn begins; without `async` the person sees it as the turn ends, Claude does not, and the end of the turn waits for it. No ruling is read: a protected file a signed ruling allows is reported, and the audit reads the ruling. The plugin brings no such entry; with it on, `init` says the entry to add ([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md), [ADR-0012](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0012-one-way-into-claude-code.md)).
- A run of the hook has 45 seconds for every process it starts, together, and a process it asks a question of, git or spec-brief's list of the briefs, is stopped after 20 seconds, or after what is left of the 45 where that is less: Claude Code cancels the hook at the 60 seconds `init` and the plugin give its entry, and before a write lets the write go ahead, and several processes that each answered inside their 20 seconds could pass that minute together. At either limit the hook says `cannot check this write: spec-brief did not answer within 20 seconds, and was stopped`, or `within the 45 seconds the hook's run is given`, and exits 2, which holds the write; a process the run reaches with nothing left is not started, and said so. Every command gives a question the same time, and a round's work, a diff, a probe's worktree, a sibling's check, ten minutes ([ADR-0002](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0002-siblings-through-their-command-lines.md)).
- `spec-harness hook git` is a pre-commit hook for any agent or none. `init --git-hook` writes it; in a hook of your own it is the line `node node_modules/@spec-family/spec-harness/bin/spec-harness.js hook git`.
- `hook claude` passes over whatever else is on its line that it does not read, as every release has, where every other command [refuses it](#an-input-that-names-nothing): its line is in settings a later release cannot rewrite, and exit 2 from it holds every write.
- A `--root` on the hook's line that is a file, or is not there, is a guard that was set up and is off: `hook claude` says so in one line to the person, as `systemMessage`, and exits 0, and the write goes on. It refuses nothing for it. No release wrote a `--root` there; without one the hook reads the project Claude Code names, then the session's directory, and outside a git work tree it has nothing to guard and says nothing.
- A line the hook cannot read - an option no command has, an option left without its value, a `--format` or an `--at` that is none, two values for an option that takes one, `--help` beside `--version` - is said the same way: one line to the person, exit 0, and no write held for it. So is a question the hook cannot read, one that is not JSON or names no event. Exit 2 from `hook claude` is for a write it could not check, never for what is wrong with its own line; and no answer of the hook's is exit 1, which Claude Code counts as a hook that failed, so that `"onFailure": "block"` holds a write only for a hook that did not run ([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md)). `hook git` stops the commit on such a line, exit 2, where a person reads why.

A guard is a guardrail - an agent that writes through a shell passes it - so the audit and spec-brief's archive are the gates ([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md)).

### `escalate`, `rule`, `rulings`

```bash
# the agent, when the round cannot be done without a protected file
npx --no-install @spec-family/spec-harness escalate --path src/db/schema.ts \
  --reason "Rotation needs a rotated_at column." \
  --option "Allow: one additive column" --option "Refuse: rotation keeps no timestamp" \
  --recommend "Allow; the column is additive."

# the person
npx --no-install @spec-family/spec-harness escalate --show E-012-1
npx --no-install @spec-family/spec-harness rule E-012-1 --allow --note "Add rotated_at only."
git commit -S -m "ruling R-012-1: allow" -- briefs/012_rotate-tokens.md
```

A memo is what a person rules on, so none is written with a part that says nothing: a path, the reason, a recommendation or an option that is empty is [refused](#an-input-that-names-nothing), by `escalate` and by the server's `request_escalation` alike. An option is `"<label>: <cost>"`: the label names the choice and may not be empty, and the cost may be left out, the memo then giving the choice alone.

Requests wait under git's directory, in `spec-harness/escalations` (ADR-0003). Where something that is no directory stands at either path, `escalate` and `rule` say which, exit 2, in a line: `.git/spec-harness is not a directory, where spec-harness keeps its state in one: move it away, and run the command again`.

`escalate --list` prints every request that waits, whichever round raised it, and `escalate --show <id>` one memo. Neither raises a request, so neither reads `--path`, `--reason`, `--option`, `--recommend` or `--brief`, and either beside one of them is [refused](#an-input-that-names-nothing): the request was never raised, and the list looked like an answer to it.

A ruling is a row in the brief's `## Rulings` table. It **counts** when the commit that last changed the row is signed by a key the **base branch's** `.github/allowed_signers` lists. The file is `rulings.allowedSigners` in `.spec-harness.json`, `.github/allowed_signers` by default.

- An agent can write a row and compute any hash; it cannot produce the person's signature, and an edit to the row moves it to a commit that must be signed again ([ADR-0006](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0006-a-ruling-is-a-signed-commit.md)).
- Use a FIDO2 key (`ssh-keygen -t ed25519-sk`) where the agent runs as you: its signature needs a touch no process can supply.

**What a ruling proves** is that the agent did not sign it: a key the base branch's allowed-signers file lists signed the row's commit, and a FIDO2 key needs a person's touch. It is not two-person review or separation of duties. Nothing checks that the signer is someone other than the brief's author or whoever committed the round's work, so one person can write the brief, run the round and sign the ruling. Where a second person must decide, that is the forge's review to require, as for any change ([ADR-0006](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0006-a-ruling-is-a-signed-commit.md), amended 2026-11-08).

**The spec-brief plugin.** spec-brief's archive refuses a round that changed a protected file, and learns that a signed ruling allows it only from this package's spec-brief plugin: `init` adds `"plugins": ["@spec-family/spec-harness/spec-brief-plugin"]` to spec-brief's configuration.

- Without it, the archive refuses the file whatever was signed.
- `doctor` says whether spec-brief loads the spec-brief plugin, and `audit` names it as the reason for such a refusal.
- spec-brief loads a plugin by a path as well, one that starts with `.` or is absolute: a path to this package's spec-brief plugin file counts as loading it.

#### Merge a round with a merge commit

A squash or a rebase writes new commits: the forge signs them with its own key or not at all, so on the base branch a ruling's row blames to a commit no allowed signer signed, and it no longer counts. Rulings are verified on the round's branch, before the merge; keep them verifiable after it:

- GitHub: allow merge commits for the repository, and turn off *Allow squash merging* and *Allow rebase merging* in its settings, or in the rules for the branch rounds merge into.
- GitLab: in *Settings > Merge requests*, set *Merge method* to *Merge commit* and *Squash commits when merging* to *Do not allow*. *Merge commit with semi-linear history* and *Fast-forward merge* need the branch rebased, which the *Rebase* button does on the server, writing new commits.

### `audit [brief]`

One report on a round, in four parts:

| Part | What it reports |
| --- | --- |
| The archive | What spec-brief's archive would refuse or warn about, run with `--dry-run`. |
| Assertions | The brief's own assertions through spec-guard: a goal that fails, or a premise (under a heading such as *The Defect, Measured*) that still holds after the round meant to change it. |
| Rulings | Rulings whose signatures do not verify. |
| Dependencies | Every dependency the round added to `package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`, `requirements*.txt`, NuGet project files or a `Gemfile`, and every package it [allowed to run install scripts](#install-scripts) in a `package.json`. |

#### Install scripts

A dependency's install script is code no reviewer read, run on every contributor's machine and in CI when the dependency is installed. npm 12 runs one only where `allowScripts` in the project's `package.json` allows the package, and `npm install-scripts approve` writes the approval there. So the audit reads that field in each `package.json` the round changed, as npm reads it: an entry whose value is `true` is an approval, one whose value is `false` a denial, and any other value neither.

| The round | The audit reports |
| --- | --- |
| added an entry that is `true`, or turned one from `false` to `true` | `install-script-allowed`, a warning, as a new dependency is: it fails the audit under `--strict`, and no ruling covers it. |
| added an entry that is `false`, or turned one from `true` to `false` | `install-script-denied`, a note. |
| removed an entry | `install-script-entry-removed`, a note, which says whether the entry allowed or denied. |

- A denial and a removed entry are no grant, so neither is a warning.
- An entry is named as the manifest names it. npm pins an approval to the version a person reviewed, `canvas@3.1.0`, so one moved to `canvas@3.2.0` is a new approval, and the old entry a removed one.
- `--format json` lists them as `installScripts`, beside `dependencies`: each with its `file`, its `section` (`allowScripts`), its `name`, and `before` and `after`, each `"allowed"`, `"denied"` or `null`.

It reads no other grant ([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md) has the reasons):

- `.npmrc`: npm reads `allow-scripts` there when `package.json` holds no entry, and `dangerously-allow-all-scripts` whenever it is set. `.npmrc` is not a manifest the audit reads.
- pnpm: pnpm 11 and 12 keep their approvals as `allowBuilds` in `pnpm-workspace.yaml`, YAML the audit has no reader for, and read nothing from the `pnpm` field of `package.json`. Bun's `trustedDependencies` and Yarn's `dependenciesMeta` are not read either.
- The package's own `preinstall`, `install`, `postinstall` and `prepare` scripts. They are the repository's own commands, on a line of the round's diff, where an approval turns on code that is in no diff; and `prepare` is where a package builds, so a round changes it for ordinary reasons. To have a round stop before it changes them, protect `package.json` in the brief.
- Whether npm honours a key. npm passes over a semver range, `canvas@^3`, and a dist-tag, `canvas@latest`, and reads the field in the project's root alone, warning about one in a workspace. The audit reports the entry as written, in whichever `package.json` holds it.

#### What it could not measure

A part that could not be measured is a finding, never a silence. Each of these is a warning, which fails the audit only under `--strict`:

- `assertion-unreadable`: an assertion in the brief spec-guard cannot read, on its line, with spec-guard's reason. Nothing it states was run.
- `manifest-name-unread`: a name in `dependencies.manifests` that spec-core's glob cannot read, malformed or too large to compile, with the reason. The audit reads the manifests the other names name.
- `protection-rooted` and `ruling-path-rooted`: a pattern in `protectedFiles`, or a path of a signed ruling, that a leading `/` roots, alone or on a brace alternative, such as `/src/db/schema.ts`. It protects no path, so the round could change the file it meant to protect, or allows nothing, so the file is still refused. Write the protection without the slash; a ruling's path is fixed by a new ruling.
- `manifest-name-rooted`: a name a leading `/` roots at the filesystem's root, alone or on a brace alternative, such as `/package.json` or `{/Gemfile,Cargo.toml}`. Every path the audit reads is repository-relative, so the rooted part names no manifest; write the name without the slash, since a name is matched at any depth.

#### What it measured

What was measured is said beside what was found, so an audit that found nothing can be told from one that checked nothing ([spec-core's ADR-0005](https://github.com/spec-family/spec-core/blob/main/docs/adr/0005-the-family-contract.md)). It is the line above the counts, which stay the last line:

```text
measured: goals: 2 held, 0 failed · premises: 1 retired, 0 holding · archive: asked · rulings: none · dependencies: 3 changed, 0 unread
0 error(s), 0 warning(s), 1 note(s)
```

A brief that declares no assertion says `goals: none declared`, and draws no warning: a brief without assertions is a brief, and the archive still measures its round. A round that changed an install-script policy has its entries counted at the end of the line, `· install scripts: 2 changed`; a round that changed none says nothing of them there.

`--format json` has the same as `measured`, beside `counts`, and `audit_round` says it too:

| Field | Holds |
| --- | --- |
| `changes` | `measured` or `unmeasured` |
| `archive` | `asked` or `unavailable` |
| `assertions` | `run` or `unavailable` |
| `goals` | counts: `held`, `failed` |
| `premises` | counts: `retired`, `holding` |
| `unreadableAssertions` | a count |
| `rulings` | counts: `verified`, `unverified` |
| `dependencies` | counts: `changed`, `unread` |
| `installScripts` | a count: `changed` |

#### For a forge

`--format gitlab`, `sarif` or `github` prints the findings for a forge:

| Format | Prints | An error, a warning, a note |
| --- | --- | --- |
| `gitlab` | a GitLab Code Quality report | `major`, `minor`, `info` |
| `sarif` | SARIF 2.1.0 | levels `error`, `warning`, `note` |
| `github` | GitHub workflow commands | `error`, `warning`, `notice` |

- Each carries the finding's hint after its message.
- A finding with no file of its own is placed on the brief, and one with no line on line 1.
- The fingerprint is the SHA-256 of the rule, the file and the finding's `subject` - the assertion, ruling, dependency or name it is about - never of its message or line, so a reworded message or a line added above does not read as one problem fixed and another found.
- SARIF carries the fingerprint as `partialFingerprints.specHarnessFinding`, with what was measured as a note.

In GitLab CI:

```yaml
spec-harness:
  image: node:22
  script:
    - npm ci
    - npx --no-install @spec-family/spec-harness audit --format gitlab > gl-spec-harness.json
  artifacts:
    when: always
    reports:
      codequality: gl-spec-harness.json
```

### `probe [brief]`

A defect is measured before it is filed. The brief carries its probe:

````markdown
```probe
id: old-token-still-accepted
setup: npm ci
run: npm test -- tests/probes/rotate.test.ts
signature: expected 401, got 200
```

```probe-file tests/probes/rotate.test.ts
...
```
````

- `probe --at base` runs it in a temporary worktree at the base commit: every run must fail **for the declared reason** - the `signature` in the output, or a JUnit `test` failing - or the verdict is `vacuous` (no defect), `flaky` or `invalid`.
- `probe --at head` must be green: `fixed`.
- That worktree is a fresh checkout, so a probe's commands can rely on the files the commit tracks, the probe's own files and what its `setup` installed, and on nothing else: there is no `node_modules` until `setup` puts one there. Start a tool through one of the project's scripts, as `npm test --` does above, or through `npx --no-install <tool>`. A command is given no input: one that reads its input is told at once that there is none.
- A probe's commands fetch nothing through `npx` unless you say so. Given a tool's name alone where `setup` did not install the tool, `npx` would fetch the registry's package of that name and run it, unasked, since the command has no terminal to be asked on ([Names](#names)). `probe` runs a probe's commands with `npm_config_yes=false`, so npm stops there and names the package, `npx canceled due to missing packages`, and the probe is `invalid`. To have npm fetch, say `--yes` on the probe's line, or set `npm_config_yes` yourself, in lower case or upper: `probe` leaves the variable as it finds it. The variable outranks a `yes=true` in an `.npmrc`. It is npm's alone, so `pnpm dlx` fetches whatever it says, and it stops a download only: a copy an earlier fetch left in npm's cache still runs.
- A run that proves nothing says what its command printed. Where a run failed for another reason than the probe declares, was stopped at its timeout or left no report - every run of an `invalid` probe, and any such run of a `flaky` one - `probe` shows the last 2,000 characters of its command's output, where the reason is. With the table that is on the standard error, for the first such run of each probe, under a line that names the probe and the run; with `--format json` it is `output` on each such run, and nothing is written beside the document. Colours are dropped and any other control character but the line feed and the tab is written as its escape, `\u001b`, so nothing in it reaches a terminal as a command. A `setup` that fails shows its output the same way.
- The evidence table it prints names the hash of the probe it measured with ([ADR-0007](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0007-probes-declare-their-failure.md)).
- A command, a `setup` as well as a `run`, is its shell, as a step is in CI: it is answered when its shell ends, by the shell's exit code and what was printed until then. A `run` is red, green or neither by those, and a `setup` has passed when the code is 0. What the command started and did not wait for is no part of the answer, so a command's work must be done when its shell ends: have it wait for what it starts.
- Where something the command started still holds its output once the shell has ended, as a server left in the background does, `probe` waits three seconds for that output, then reads no more of it and goes on; GitHub's runner does the same with a step, after five. The run's evidence then ends `, and something it started was left running, holding its output`. A `setup` that passed says so in a line on the standard error, `spec-harness: the probe setup "<line>" passed at base, and something it started was left running, holding its output`, and one that failed says it in the error that stops the probe. A process that writes to that output afterwards has the write fail, as it would once `probe` had ended. Send a process's output to a file and nothing is held, nothing waited for and nothing said; on Windows a process the shell started with `start /b` holds the command's output even so.
- What a command left running runs on beside the commands after it, as what a step left does in CI, and is stopped when `probe` is done at that commit, before the worktree is removed, as far as `probe` can still reach it ([ADR-0003](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0003-state-outside-the-work-tree.md)):
  - On Linux and macOS that is every process still in the command's process group, forced: what the shell put in the background with `&`, whether or not it holds the command's output. Not what moved to a session or a group of its own, as a daemon does, `setsid`, and a process Node starts `detached`.
  - On Windows it is nothing: once a command's shell has ended, nothing the command left can be found again.
  - What is out of reach runs on until it ends or you end it: through the runs after it, and through the head's when it was left at the base.
- A command whose shell still runs at its timeout - `probes.timeout` seconds, or for a `run` the probe's own `timeout` - is stopped, forced, with what `probe` can reach of what it started, and no more:
  - On Linux and macOS that is every process still in the command's process group: all the command started, except what moved to a session or a group of its own.
  - On Windows it is the command's shell and the processes under it, each found through a parent that still runs. A process whose parent has ended is not found.
- The timeout ends the wait as well. Three seconds after it has stopped what it can, the run is answered whether or not something still holds the command's output: it is a run stopped at its timeout, with what was printed until then, and its evidence says the same of what was left running. A `setup` answered so says it in the error that stops the probe.
- Interrupted - by Ctrl+C, SIGTERM or SIGHUP, or by Ctrl+Break on Windows - `probe` stops the commands still running, with the reach a timeout has, waits up to three seconds for their output, stops what earlier commands left, with the reach the end of a commit has, and removes the worktree before it exits.
- A worktree's directory that cannot be deleted - on Windows, one that something a command started is still running in - costs the verdict nothing: git forgets the worktree, `probe` prints and exits as it would have, and it names the directory it left on the standard error as it exits.

### `premises`

Is every live brief still about something true? It runs spec-guard over the live briefs' assertions and reports each premise - an assertion under a section in `assertions.premises` - that no longer holds as `stale-premise`: the defect was fixed another way, or the code the brief describes is gone, and an agent sent to fix it would fix nothing.

- Goals are left to `audit`, since a goal fails until its round is done.
- For the same reason, the premise of the brief a round is working on - the one `--brief`, `SPEC_BRIEF` or the branch names - is reported as `audit` reports it, `premise-retired`, a note that fails nothing: on the round's branch, a premise that no longer holds is the work being done.
- A premise spec-guard cannot read is `assertion-unreadable`, a warning, as in the audit: nothing checks it, so `--strict` fails the run on it, and the summary counts it apart from the premises that were checked.
- A brief `--brief` or `SPEC_BRIEF` names that spec-brief does not know is refused, exit 2, as every command that acts on a brief refuses it: read as no round, it held the round's own premise against it.
- A branch whose name reads as a brief's and names none is read as no round, as before, and so is a brief spec-brief has archived. CI runs `premises` on every branch, and `fix/brief-list-order`, which names `list` under the default `branches`, is no round's; an archived brief is a closed round, which retires no premise, and is what the branch of a round names once the round has archived it.

Run it in CI: exit 1 when a premise is stale, exit 2 when spec-guard is not there to ask, or `--brief` or `SPEC_BRIEF` names a brief that is not one. `--format gitlab`, `sarif` or `github` prints its findings for a forge, as `audit` does.

### `mcp`

`start_round`, `check_path`, `request_escalation`, `audit_round` and `list_rounds` over MCP on stdio, with the four workflow prompts. Both protocol eras are served. The architecture rules themselves stay with spec-guard's server. Where `.spec-harness.json` does not load, the server starts all the same, and each tool says why it cannot answer, reading the file again at every call ([ADR-0008](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0008-one-server-for-rounds.md)).

- The server is started for the project Claude Code names. `check_path` decides an absolute path by the work tree of the same repository that holds it, and answers each path as the hook decides a write of it alone: a file outside every work tree of the repository as outside it, whatever names the brief; a path the hook holds for a brief spec-brief does not list or has archived as `deny`, with the reason `held` and the hook's words; and every path, with no brief named, as no brief's, without asking spec-brief. `start_round`, `check_path`, `request_escalation` and `audit_round` read the round, its branch and its brief, in one work tree: the one a `directory` argument names; else the one the client's roots name, where they name exactly one work tree of the repository, asked with `roots/list` where the client declared roots; else the project's. Each says which as `workTree`, and in its text where it is not the project's ([ADR-0008](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0008-one-server-for-rounds.md)).

A tool answers an argument it cannot use with a tool error that names the argument, and writes nothing: one it does not take, one of the wrong type, and one that is given and [names nothing](#an-input-that-names-nothing), such as an empty `brief`.

### `init`

Configures the family to agree. It prints the plan, merges into files that exist, keeping what is there, and changes nothing without `--write`. Each step names its file and what `init` does there: `skip` is a step it does not take and `advise` one it leaves to you, each with the reason.

- **spec-brief**: `spec-brief init` when there is no configuration, then:
  - this package's spec-brief plugin in its `plugins`, `"@spec-family/spec-harness/spec-brief-plugin"`. spec-brief's archive asks the plugin whether a signed ruling allows a protected file, and refuses the file without it; an entry that names it `"@descent-vtt/spec-harness/spec-brief-plugin"`, as `init` wrote it from 0.1.2 to 0.21.0, names it so in its place, since spec-brief cannot load the old name once that package is uninstalled, and refuses two plugins of one name;
  - the base below as its `archiving.base`, unless one is set. Without a base, the archive checks no protected file at all, warning only that the scope went unmeasured, so a plain `spec-brief archive` is a gate only once one is named.
  - spec-brief's schema as its `$schema`, `./node_modules/@spec-family/spec-brief/schema.json`, where it names a place spec-brief's `init` wrote before the move to `@spec-family` on 2026-10-26, `./node_modules/@descent-vtt/spec-brief/schema.json` or the file on the earlier repository's main: an editor reads neither once that package is uninstalled. It is written where it stands, and a schema anywhere else is left as it is.
- **spec-graph**, when it is installed: the archive in its `historyPatterns`, so an archived brief is a record whatever its status says, and a live brief that depends on one is not a stale premise.
  - That holds only where spec-graph reads the briefs, and its default patterns (`docs/`, `doc/`, `adr/`, `rfcs/`, `specs/` and Markdown at the root) do not reach `briefs/`. `init` says whether they do, and leaves adding the briefs to `patterns` to you, since that changes what spec-graph checks, and its `patterns` replace its defaults.
  - It merges into the configuration spec-graph reads, and leaves a `"spec-graph"` key in `package.json` to you.
- **`.spec-harness.json`**, naming the base rounds are measured from and the allowed signers are read on:
  - the remote's default branch where git recorded one, as a clone does and git 2.48 or later does on a fetch;
  - otherwise the branch `init` runs on when it is `main` or `master`, or the only branch, since a repository made with `git init` and pushed to a remote often records no default;
  - when it cannot tell, it says so and writes none: set `"base"` yourself.
- **Claude Code**: the guard hooks in `.claude/settings.json` and the MCP server in `.mcp.json`, each run with `node` from the project's `node_modules`. The `npx` entries 0.1 wrote are replaced, and so are those 0.1.2 to 0.21.0 wrote, which run `node_modules/@descent-vtt/spec-harness/bin/spec-harness.js`, the package's name until the family moved to the `@spec-family` scope on 2026-10-26: Claude Code cannot start one once that package is uninstalled, and lets each write go ahead without it. Each is rewritten where it stands, under `PreToolUse`, `PostToolUse`, `SessionStart` and `Stop`, keeping its other fields (`update`).
  - Beside the hook's entries under `PreToolUse` and `PostToolUse`, one under `SessionStart`, with no matcher: every way a session starts. In a file whose two an earlier release wrote, `init --write` adds it by itself; beside a line of the hook a person wrote or changed it adds none.
  - With `--block-on-failure`, each of its entries before and after a write and as a session starts carries `"onFailure": "block"`, and so do those an earlier run wrote (`update`); the entry at the end of a turn, which runs in the background, is left without it, since the hooks reference gives the field no effect on a `Stop` hook or on one in the background. Claude Code 2.1.295 or later then holds a write where the hook cannot start, as where the project's install is not there, or runs past its timeout, where without the field it lets the write go ahead with a notice. Claude Code's documentation does not say what a release before 2.1.295 does with a key it does not know, and the file is read by every clone's Claude Code, so the field is written only where asked for: ask for it where every Claude Code that reads the file is 2.1.295 or later. The plugin's hooks do not carry it, and a line a person wrote is theirs to give it ([ADR-0012](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0012-one-way-into-claude-code.md)).
  - These are the ones the [Claude Code plugin](#as-a-claude-code-plugin) brings, so while that plugin is on - `"spec-harness@<marketplace>": true` under `enabledPlugins` in your user, project or local Claude Code settings - `init` writes neither and says why (`skip`).
  - To have its entries instead, which every clone reads, turn the Claude Code plugin off for the project, `claude plugin disable spec-harness@spec-tools --scope local`, and run `init` again.
  - It removes nothing: where the Claude Code plugin is on and a file already holds its entry, it says so (`advise`) and leaves the file alone. So where the hook stands in a settings file of your own, which `init` does not write.
  - Where the plugin that is turned on is not on this machine, as [`doctor`](#doctor) reads it, `init` still writes neither entry: a plugin that is there after all would bring them a second time. It says what `doctor` says (`advise`), and how to have the entries in the files instead. Where that cannot be told, it says so beside the `skip`.
  - `"disableAllHooks": true` in a settings file is said of that file (`advise`): the hooks `init` writes do not run while it stands. `init` writes what it would have written.
  - A line of the hook that is there already is known as [`doctor`](#doctor) knows it: by its command and the words `hook claude`, however a person changed it, with the event and the matcher its entry stands under. Where the file holds such a line that Claude Code starts for a write, `init` writes no hook into it, since a second line would run beside the first, and says which line it left, in `doctor`'s words for it (`keep`, or `advise` where the line is no guard: it turns the guard off, holds every write, or is waited on before none). It rewrites no line but the one 0.1 wrote, and completes only its own line where that stands under one event alone. A line Claude Code starts for no write is left as it is, and `init` writes its own beside it.
  - A matcher is read as [`doctor`](#doctor) reads it, for the Claude Code on `PATH`. A line under names with a comma, `Edit, Write`, is one a Claude Code older than 2.1.191 starts for no write, so there `init` writes its own hooks beside it; it asks Claude Code its release only where what it reads of a line turns on it. And into a file that holds an array for a matcher under `PreToolUse` or `PermissionRequest` it writes no hook (`advise`): Claude Code loads none of that file's hooks, so write the matcher as one string, its names between `|`, and run `init` again.
- **git's pre-commit hook**, where git runs it from: `core.hooksPath`, relative, absolute or under `~`, and the shared hooks of a linked worktree.
  - It refuses a commit that changes what the active brief protects, for any agent or none, a shell's writes included.
  - With `--git-hook` it is written; without, the plan advises it (`advise`).
  - It runs `node` and the script in the project's `node_modules`, as the Claude Code hooks do, and no `npx`. git starts a pre-commit hook at the top of the work tree it commits in, so the script is read from there: a linked worktree is guarded by its own install, or, where it has none, by the main work tree's, by its own branch and briefs; each repository that shares a hooks directory is guarded by its own. Where neither has the install, the hook says so and the commit waits. A hook an earlier release wrote reads the work tree's own install alone: take it away and run `init --git-hook --write` for this one.
  - It is a POSIX `sh` script on every platform: Git for Windows runs a hook with the `sh` it ships.
  - Where the script is in neither work tree, it says to install the project's dependencies, or, where the work tree's `package.json` names no `@spec-family/spec-harness`, as at a commit from before the project took it up, that installing them brings no hook to run. Either way the commit waits ([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md)).
  - The hook `init` wrote in 0.22.0, byte for byte, which advises the install in both cases, is written again by `init --git-hook --write` (`update`), and noted without `--git-hook`.
  - A hook that exists is never replaced: `init` says to add the line to it. One that runs spec-harness through `npx`, as `init` wrote it through 0.9.1, keeps working, and `init` names the line that runs it with `node`.
  - But for the hook `init` wrote from 0.10.0 to 0.21.0, byte for byte, which runs `node_modules/@descent-vtt/spec-harness/bin/spec-harness.js` and stops every commit once that package is uninstalled: `init --git-hook --write` writes its own hook over it (`update`), and without `--git-hook` keeps it and says so. A hook of the repository's own that names that script is kept, with a note to name this package's in its place.
  - Nor is anything else that stands at the hook's path. A directory there is said as [`doctor`](#doctor) says it (`advise`), with `--git-hook` or without, and nothing is written over it.
- **The allowed-signers file** `rulings.allowedSigners` names, `.github/allowed_signers` by default: one line per person, and a FIDO2 key, `ssh-keygen -t ed25519-sk`, for anyone whose agent runs as them (`advise`).
  - With it, how the forge keeps it, the ADRs, the tool configurations and the CI configuration from changing unread, as [spec-core's ADR-0005](https://github.com/spec-family/spec-core/blob/main/docs/adr/0005-the-family-contract.md) asks; [spec-core's adopting guide](https://github.com/spec-family/spec-core/blob/main/docs/adopting.md) has the settings:
    - GitHub: CODEOWNERS and a protected branch;
    - GitLab Premium: Code Owners;
    - GitLab Free, which has no Code Owners approval: a protected branch no one pushes to, merged by Maintainers, with agents as Developers and pipelines that must succeed.

### `doctor`

The first thing to run when a hook refuses something unexpectedly. It reports:

- **The siblings**: which are installed, at which versions, and how each is run.
  - A sibling older than this release needs is `outdated`, with the minimum and the command that installs a newer one, and exit 1.
  - A command named under `tools` is run as named, with no shell, and its version is not checked. One that runs a script of the earlier scope's install, `node_modules/@descent-vtt/<name>/`, the family's name until 2026-10-26, is said with what to name in its place, and fails `doctor` where that script is not there. One that cannot be started is said in one way on every host, `cannot start "<command>": name the tool's script, such as ["node", ...]`: a name no program has, a directory, a `.cmd` such as `npx.cmd`, and a script with no `node` before it, which Windows does not run and Linux runs only where it has the mode to run and a `#!` line ([ADR-0002](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0002-siblings-through-their-command-lines.md)).
  - In a linked worktree with no install of its own, the siblings are the main work tree's, as git's hook runs them there, and each such row says whose install it is: `(0.8.0, the install of /work/app: this work tree has none of its own)`. `--format json` has it as `elsewhere`, `null` for a sibling of the work tree's own.
- **The repository**: its root, the branch, and the brief the flag, `SPEC_BRIEF` or the branch names.
  - A brief no round can work under is said on that line, with why: `brief   none: the flag names brief 999, and spec-brief knows no such brief`. So is one spec-brief has archived, an empty `--brief`, and a spec-brief that could not list the briefs. The guard holds every write while it stands, which is often why `doctor` is being run.
  - Where the branch names it, a brief spec-brief does not know or has archived, the hook holds every write on that branch, and `doctor` exits 1, as for a hook's line that holds every write: `brief   none: the branch names brief 999, and spec-brief knows no such brief`. One the flag or `SPEC_BRIEF` names fails nothing: the flag is the question `doctor` was asked, and the variable `doctor` reads is its own, which need not be the one Claude Code's hook is started with. Where the branch names a brief and spec-brief cannot be asked about it, not installed, too old, or failing as it lists the briefs, the hook holds every write on that branch as well, and `doctor` says why on that line and exits 1: `brief   none: spec-brief could not say whether it knows brief 001: spec-brief is not installed here: ...`. Under the flag or `SPEC_BRIEF` a spec-brief that could not list the briefs fails nothing, and one that cannot be run is its row's to say. A base that names no commit fails nothing either. `--format json` has the id as `brief` and the reason as `briefProblem`, `null` where there is none ([ADR-0004](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0004-the-active-brief-is-named-not-guessed.md)).
  - But for the branch that archived its brief, which is a round's last commit: a round archives its brief on its own branch before the branch merges. Where git says the brief's archived file, as spec-brief lists it, is in HEAD and not at the merge base of the base and HEAD, `doctor` says so in a note and fails nothing for it, so a round's last pull request passes a CI job that runs `doctor`: `brief 020 was archived on this branch, which waits to merge: briefs/archive/020_compute.md is in HEAD and not at the merge base with main, 8835800a03b3, so this fails nothing; the hook holds every write on the branch all the same`. Where the file is at the merge base, the brief was archived before the branch, a closed round's branch used again, and `doctor` exits 1 as before. Where git cannot say, it cannot tell, and exits 1: a base that names no commit, a history that is shallow, a git that cannot read a tree, an archive not committed at HEAD. So a CI job that runs `doctor` fetches the base under the name it is configured by, with its history (`git fetch origin main:main`, in a clone that is not shallow); without that, a round's last pull request fails `doctor` as it did. It runs `doctor` without `--strict`, which fails where the release of Claude Code cannot be told, as on a runner with no `claude` and `init`'s hooks in the settings. A brief spec-brief does not list, which no round's last commit names, fails as before. The hook holds every write on such a branch in every case, and says the round is archived and ends when the branch merges. `--format json` has the answer as `closedRound`, with its `state` (`waiting-to-merge`, `archived-before` or `unknown`), the `file`, the `mergeBase` and the note as `detail`, and `null` where the branch names no brief spec-brief has archived.
- **What a signed ruling needs to count**:
  - the base, and whether `--base`, `.spec-harness.json` or the remote named it;
  - whether the allowed-signers file is on that base;
  - whether spec-brief loads this package's spec-brief plugin, by name or by a path to its file. One named `"@descent-vtt/spec-harness/spec-brief-plugin"`, as `init` wrote it up to 0.21.0, is said as that: spec-brief loads it from that package while it is installed, and once it is not, its `lint` and `archive` stop at exit 2.
- **The signers' keys**: a note naming each signer in the allowed-signers file whose key is not a FIDO2 key (`sk-ssh-ed25519@openssh.com` or `sk-ecdsa-sha2-nistp256@openssh.com`).
  - A note, never a failure: [ADR-0006](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0006-a-ruling-is-a-signed-commit.md) also accepts a key the agent's account cannot read, and a PIV or PKCS#11 hardware key reads as a plain `ssh-rsa` or `ecdsa` line.
  - A `cert-authority` line is a certificate authority's key, not a person's, and is left out.
  - A line OpenSSH refuses is named as no signer, with why. Its quotes are read as OpenSSH reads them: in the principals, the first double quote, wherever it opens, is taken out with the next, which ends the field; an option's value is always in double quotes, `\"` a quote inside it. And its options are OpenSSH's: `cert-authority`, `namespaces`, `valid-after` and `valid-before`, separated by commas.
- **How Claude Code runs the guard**: the Claude Code plugin, with the settings file that turns it on; `init`'s hooks and server; both, which guards every write twice and exits 1, with how to keep one; or neither.
  - Where a settings file guards writes and none starts the hook as a session starts, a note says so and how to add it, `spec-harness init --write`, and fails nothing. `--format json` has `claudeCode.sessionStart`.
  - Where `"turnReport"` is on and no settings file starts the hook as a turn ends, a note says that no turn's end is reported, and how to add the entry, and fails nothing; the plugin brings none. `--format json` has `claudeCode.turnEnd`.
  - Run in a linked worktree where something wires the guard, a note says which release of spec-harness the hook's line runs, where the main checkout's install and this work tree's are not one: the line names its script under `${CLAUDE_PROJECT_DIR}`, which is this work tree in a session started in it, and the main checkout in a worktree session of the desktop app, where by [Claude Code's worktrees page](https://code.claude.com/docs/en/worktrees) Claude Code reads the hooks from the main checkout's root and points the placeholder at it. Either decides a write by the work tree that holds it, from 0.19.0 on, so the note says which release answers, and fails nothing.
  - `"disableAllHooks": true` in a settings file switches the guard off: by [Claude Code's settings reference](https://code.claude.com/docs/en/settings-reference) it turns off the hooks of the user's, the project's and the local settings and of plugins. `doctor` reads the key from the three files as Claude Code merges them, the last that sets it deciding, names the file that holds it, and exits 1 where there are guard hooks for it to switch off. Where nothing is wired it is a note. Hooks of managed settings, and of a plugin managed settings force on, keep running; `doctor` reads no managed settings and no `--settings`.
  - A hook in Claude Code's settings is the guard by its command, `spec-harness` or its script, and the words `hook claude`, whatever else is on its line. `doctor` reads the line as the hook reads it, through the same code, with the project in place of `${CLAUDE_PROJECT_DIR}`, and says what the hook does with it.
  - Only an entry Claude Code runs as a command is a line of the hook, `"type": "command"`. An entry of another handler type (`http`, `mcp_tool`, `prompt`, `agent`) runs no command, whatever it holds, and is not reported. One with no `type`, or with a word the hooks reference does not list, is *cannot tell*, never fine: the reference requires the field and says nothing of an entry without it; `--strict` fails it.
  - A line that holds more than `init` writes, such as `--root ${CLAUDE_PROJECT_DIR}` or `--brief 012`, is said as it is and fails nothing: `"hook claude --root ${CLAUDE_PROJECT_DIR}" in .claude/settings.json is more than init writes, and guards: the hook reads the line, and its root, /work/app, is a directory`.
  - A line the hook cannot read, and a `--root` that is a file or is not there, are a guard that is off. Each is said in the words the hook itself says before a write, and exits 1.
  - A line whose script is not there is a guard that is off as well, said with the script and how to install it, and exits 1: [Claude Code's hooks reference](https://code.claude.com/docs/en/hooks) counts a hook that cannot start as one that failed, and lets the write go ahead. Where its entry sets `"onFailure": "block"` and the Claude Code on `PATH` is 2.1.295 or later, it is said as a line that holds every write, since Claude Code holds each write before which the hook fails, and exits 1 too. The script is looked for where `${CLAUDE_PROJECT_DIR}` can name the project as a session starts: the work tree `doctor` runs in, and in a linked worktree the main checkout as well, where a worktree session of the desktop app finds it; it is not there only where it is in neither. A relative path, which is read from wherever the session stands, a name npx or `PATH` finds, and in a line a shell reads a word with anything a shell rewrites, cannot be looked for, and are said as that beside the line, with how to write it so that it can be, failing nothing. `init` looks only to say, where the package is not installed, that it is not, with the install, since every line runs it.
  - A line that runs `node_modules/@descent-vtt/spec-harness/bin/spec-harness.js`, the script of this package's releases up to 0.21.0, is said with how to move it: `spec-harness init --write` rewrites a line an earlier release wrote in `.claude/settings.json`, and any other is mended by hand. Where the script is there, the line guards by that release and fails nothing, and a note says Claude Code cannot start it once that package is uninstalled; where it is not, it is off, as above.
  - A line that asks for the help or the version, with `--help`, `--version`, `-h` or `-v`, is a guard that is off as well. The hook prints the help or the version, exit 0, in place of reading its question, and [Claude Code's hooks reference](https://code.claude.com/docs/en/hooks) has what a hook that exits 0 prints go to the debug log: no write is checked, and nothing says so. `doctor` says it and exits 1, whatever else is on the line: `"hook claude --help" in .claude/settings.json: the line asks for the help, which the hook prints, exit 0, in place of checking the write, so the guard is off and no write is checked`. Beside a `--root` that is a file or is not there, it is a line the hook cannot read, which the hook says before a write as it says the root without either.
  - A `--root` that is a directory outside any git work tree is a guard that is off as well, and the one fault the hook says nothing of: it reads a session outside a work tree there, checks no write, and exits 0. `doctor` asks git about the root as the hook does, says so, and exits 1: `"hook claude --root /elsewhere" in .claude/settings.json: --root is "/elsewhere", a directory outside any git work tree, which the hook reads as a session outside one, exit 0 and no word, so the guard is off and no write is checked`.
  - A `--root` in another git work tree than the project's is read by where that work tree is. The hook opens the work tree its root is in and decides by that work tree's briefs, and a file outside it is none of its repository's, which the hook passes with no word. So where that work tree does not hold the project - another repository beside it, or one inside it: a repository of its own, a submodule, a linked worktree - no write to a file of the project is checked. The guard is off, and `doctor` exits 1: `"hook claude --root ../other" in .claude/settings.json: --root is "../other", a directory in /work/other, the work tree of another repository, which does not hold this project: the hook checks a write to a file of that work tree, by its briefs, and passes any other with no word, exit 0, so the guard is off and no write to a file of this project is checked`. Where the work tree holds the project, as a repository the project is nested in does, or the main work tree around a linked one, a write here is checked, by that work tree's briefs and its branch and under the path the file has there: `doctor` says whose briefs they are and fails nothing. A work tree of the project's own repository, linked or main, is named `another work tree of this repository`, and is read by the same rule: a linked worktree beside the project holds none of its files.
  - A line that names a brief which is not one, as `--brief 404` does where spec-brief knows no brief 404 or has archived it, holds every write: the hook exits 2 before each until the line is mended. `doctor` asks spec-brief about the name as the hook does, in the work tree the line's root is in, says it in the words the hook holds the write with, and exits 1: `"hook claude --brief 404" in .claude/settings.json: the flag names brief 404, and spec-brief knows no such brief, so the hook holds every write until the line is mended: name a brief spec-brief lists, or take --brief off the line`. So does a line that names a brief where spec-brief cannot be run, not installed or too old, which the hook asks before each write.
  - An entry is read with the event it stands under and its matcher, as [Claude Code's hooks reference](https://code.claude.com/docs/en/hooks) has them: Claude Code waits on a hook before a tool call under `PreToolUse` alone, and starts an entry for the tools its matcher lets through - every tool where the matcher is left out, empty or `*`, the tools it names where it is a list of names, and the names a pattern matches otherwise. An entry that runs in the background (`async`, `asyncRewake`) is waited on for none.
    - A line Claude Code waits on before no write is not the guard, whatever the hook would do with it. `doctor` says so with what the line stands under, `"hook claude" in .claude/settings.json: Claude Code waits on it before no write, so it is not the guard and refuses none (under PreToolUse it has the matcher "Bash")`, and a file whose only line is started for no write, before one or after, is not counted among `init`'s entries. It fails nothing: no guard is a choice.
    - A line waited on before some of `Edit`, `Write` and `NotebookEdit` guards those, and `doctor` names the rest, whose writes go unchecked. A line started after no write warns of none, which is said too. Neither fails anything.
    - Those three are the tools a Claude Code from 2.1.139 on writes a file with, by its [tools reference](https://code.claude.com/docs/en/tools-reference). The hook also reads the file a `MultiEdit` names, a tool no release from 2.0.0 on declares, and `init`'s matcher keeps the name; `doctor` says of no line that it leaves `MultiEdit` unchecked, and a line under `Edit|Write|NotebookEdit` is said with nothing more.
    - An `if` on the entry has Claude Code start it only for the tool calls its rule matches. The rule is not read, so which writes the line is asked on is *cannot tell*, never fine; `--strict` fails it. So is a matcher that is neither text nor an array, or is no pattern, or is a pattern that takes more than a tenth of a second to test against the three names: one can be written that never finishes, and `doctor` and `init` come back all the same.
    - A matcher that lists names with a `,` is read as the Claude Code on `PATH` reads it. By [Claude Code's page on debugging a configuration](https://code.claude.com/docs/en/debug-your-config), a comma separates names as a `|` does from 2.1.191 on; before it, a comma was read as part of a pattern, and the matcher matched no tool. So under 2.1.139 to 2.1.190 a line under `Edit, Write` is waited on before no write and is not the guard: `doctor` says it with the release and what the matcher is from 2.1.191 on, `(under PreToolUse it has the matcher "Edit, Write", which Claude Code 2.1.190 reads as a pattern that matches no tool: a comma separates names from 2.1.191 on, where the matcher is Edit and Write)`, and fails nothing for it, as for any line that is no guard. Where the release cannot be told, which writes the line is started for is *cannot tell*, never fine; `--strict` fails it. So is a matcher with a `,` and a `|` under an older release, where read as a pattern it would match a tool, as `Edit|Write, NotebookEdit` would `Edit`: the page has such a matcher never match, and has the comma read as part of a pattern, and for that matcher the two disagree. A matcher with no comma, the one `init` writes among them, is read the same under every release.
    - A matcher of names with a hyphen in one, `Edit|Write|my-tool`, is read as the Claude Code on `PATH` reads it too. By [Claude Code's changelog](https://code.claude.com/docs/en/changelog), 2.1.195, such a matcher matched as a substring before that release and exactly from it on; the changelog does not say how the rest of it was read, the names it lists exactly, the matcher as a pattern, under which `Edit` is in `NotebookEdit` too, or its whole text, which is in no tool's name. So under 2.1.139 to 2.1.194, and where the release cannot be told, which writes the line is started for is *cannot tell* wherever those readings differ, never fine; `--strict` fails it: `(under PreToolUse it has the matcher "Edit|Write|my-tool", which Claude Code 2.1.194 may read otherwise: before 2.1.195 a matcher with a hyphenated name in it matched as a substring, and Claude Code's changelog does not say how the rest of it was read; from 2.1.195 on it is Edit and Write)`. A matcher whose readings all come to no tool that writes, `Bash|my-tool`, is no guard under any release, and nothing is said of the release.
    - A matcher that is an array, `["Edit", "Write"]`, is by the same page an entry Claude Code lists as an invalid setting, and no hook under it is started. Where one stands under `PreToolUse` or `PermissionRequest`, in an entry of the hook's or of any other program's, Claude Code loads none of that settings file's other hooks either. `doctor` says so of every line of the hook the file holds, and a line that stood to be started for a write is a guard that is off, exit 1: `"hook claude" in .claude/settings.json: .claude/settings.json has an array for a matcher under PreToolUse, ["Bash"], which Claude Code lists as an invalid setting, and beside one under PreToolUse or PermissionRequest it loads none of the file's other hooks, so the guard is off and no write is checked`. The hooks of another settings file are read as that file has them. Where such an array stands in the project's `.claude/settings.json`, the file `init` writes its hooks into, `doctor`'s advice is the array's first, since `init` writes no hook there while it stands, and then `init --write`. `--format json` has the array as `claudeCode.unloaded`, `null` where there is none.
  - A line with no `args` is one Claude Code hands to a shell. Where it holds a quote, a variable or anything else a shell rewrites after its command, what the hook is handed is *cannot tell*, never fine; `--strict` fails it. Written with `args`, each word reaches the hook as it stands, and `doctor` reads it.
  - `"onFailure": "block"` on the hook's entry is said in a note. Claude Code 2.1.295 or later then holds a write when the hook fails, where without the field the write goes ahead: by a hook that does not start, or by one that runs past its timeout. The hook says each of its own answers with exit 0 or 2, a line that turns the guard off among them, so the field holds no write for those. Where the Claude Code on `PATH` is 2.1.295 or later and a line that guards sets no `onFailure`, a note advises it, with `init --write --block-on-failure` for `init`'s own entries, and fails nothing: every Claude Code that reads the file has to be one that reads the field.
  - An entry whose `timeout` is below the 45 seconds a run of the hook is given is said in a note, with the event it stands under: Claude Code cancels a hook at its entry's timeout, and before a write a cancelled hook lets the write go ahead, so a run that needs its budget is cut short. It fails nothing; `init` writes 60, and an entry with none has the 600 seconds Claude Code's hooks reference, read 2026-10-24, gives a command hook by default ([ADR-0002](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0002-siblings-through-their-command-lines.md)).
  - `--format json` has each line under `claudeCode.lines`: its `file`, `events`, the `line` as written, its `state` (`guards`, `off`, `held`, `unstarted` or `unknown`), `onFailure`, the writing tools Claude Code waits on it `before` a write by and starts it `after` one by, of `Edit`, `Write` and `NotebookEdit` (`null` where that cannot be told), and what is said of it as `detail`, `cover`, `note` and `timeout`, `null` where there is nothing to say. Beside the lines, `claudeCode.presence` is whether the plugin is on this machine, `null` where no plugin is on and otherwise its `state` (`present`, `absent` or `unknown`) with the reason as `detail`; `claudeCode.hooksOff` is the settings file whose `disableAllHooks` is `true`, or `null`; and `claudeCode.notes` holds what is said of the two. Entries that name the harness in two ways, by two scripts or with a shell and without one, are two lines.
  - What the plugin runs is read where it may be on this machine: the script under `${CLAUDE_PROJECT_DIR}` its `hooks/hooks.json` and `.mcp.json` run, in each version a cache holds, or, where none is cached, the script every release under `@spec-family` runs. Where that script is not installed in the project, in either place `${CLAUDE_PROJECT_DIR}` can name from a linked worktree, Claude Code cannot start the hooks and lets each write go ahead: `doctor` exits 1 and says to install the package, `npm install --save-dev @spec-family/spec-harness`. The project's install is the one way in: its lockfile pins the release the siblings agree on ([ADR-0012](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0012-one-way-into-claude-code.md), amended 2026-11-08). A version of the plugin after the release installed is a note. `--format json` has `claudeCode.pluginVersions` and `claudeCode.pluginScripts`, each script with the `file` it was read from and whether it is `there`, `null` where nothing was read.
  - On a CI runner, `CI` set to anything but `false` or `0`, as GitHub Actions and GitLab CI set it, a plugin no cache holds is neither looked for nor required, and neither is the package its hooks run: no Claude Code session runs there. It is wired to nothing, `claudeCode.presence.state` is `unchecked`, and `--strict` fails nothing for it.
  - The plugin's hook lines are not read for what the hook does with them: every release wrote `hook claude` and no more on the line, under the matcher `init` writes. What is read is whether the plugin that settings turn on is on this machine, by [Claude Code's plugin loading reference](https://code.claude.com/docs/en/plugins/loading), from the directories Claude Code keeps plugins in: `plugins` in its configuration directory, or what `CLAUDE_CODE_PLUGIN_CACHE_DIR` names, and each directory `CLAUDE_CODE_PLUGIN_SEED_DIR` names.
    - *On the machine*: a version of it is in a cache, `cache/<marketplace>/spec-harness/<version>/`, which no `.orphaned_at` marks as left behind. Nothing more is said.
    - *Not on the machine*: the project's `.claude/settings.json` alone turns it on, no version of it is cached, and no marketplace of its name is recorded as fetched (`known_marketplaces.json`) or declared in settings (`extraKnownMarketplaces`). Claude Code fetches no plugin that a project's settings alone turn on, so the plugin brings no hook and is not counted. With `init`'s hooks in a settings file, those are the guard, and the plugin is a note. Without them `doctor` exits 1 and says what would bring it.
    - *Cannot tell*, never fine, and a failure under `--strict` alone: a record that is not there or cannot be read; a marketplace that is on the machine, or declared, while nothing is cached, since a plugin its marketplace lists by a relative path loads from the marketplace, whose list is not read; marketplaces hosted on claude.ai; a `true` in a settings file of your own, for which Claude Code fetches; and an id that names no marketplace (`@inline`, `@skills-dir`, `@synced`).
- **Which Claude Code**, when Claude Code runs the guard: `claude --version`, found on `PATH` and run without a shell.
  - Older than 2.1.139 exits 1. An older release ignores a hook's `args` and runs a bare `node`, which reads the hook's input as a script and fails, and a PreToolUse hook that fails with anything but exit 2 blocks nothing: every write passes unguarded.
  - On Windows, npm installs Claude Code as a `claude.cmd` shim, which cannot be run without a shell, so it is read instead: the `node_modules\@anthropic-ai\claude-code` it runs, as npm's shim or pnpm's names it, and that package.json's `version`, which doctor says it read. Nothing is run.
  - A `claude` that is not found, a Windows script that runs no `@anthropic-ai/claude-code` package whose package.json gives a version, and a version that cannot be read are *cannot tell*, never fine; `--strict` fails them.
  - The Claude Code in an editor or the desktop app may be another release than the one on `PATH`: check it there with `claude --version` or `/status`.
- **git's pre-commit hook**: whether it runs spec-harness, where git runs it from: installed, missing, a hook of the repository's own without the line, or, outside Windows, one git skips because it is not executable.
  - A hook that runs it through `npx` is one that runs it. A note names the line that runs it with `node`: `npx` starts npm to start node on every commit, and under npm 12 prints two `npm notice run` lines each time. A note, never a failure; `--format json` has it as `gitHook.note`.
  - A hook that names `node_modules/@descent-vtt/spec-harness/bin/spec-harness.js`, as the hook `init` wrote from 0.10.0 to 0.21.0 does, and the line it advised, is noted too: the script is not there once that package is uninstalled, and the note says how to move it, `spec-harness init --git-hook --write` for the hook `init` wrote. A note as well; the hook runs as it did.
  - So is the hook `init` wrote in 0.22.0, which advises installing the dependencies at a commit from before the project took the harness up too, where they bring none: the note says `spec-harness init --git-hook --write` writes it again.
  - What stands at the hook's path and is no file is no hook, and git takes it for one all the same. A directory there, which a repository whose `core.hooksPath` is in its work tree can hold, is one git tries to run where it may execute it, which on Windows is always: it cannot, and stops every commit, with `cannot spawn` on Windows and `cannot exec` elsewhere. `doctor` says the path, what it is and what git does with it, and exits 1, since nothing is checked there and nothing is committed: `.git/hooks/pre-commit is a directory, not a hook, and git stops every commit at it`. Where git may not execute it, it skips it as it skips a hook that is not executable: that is said, and fails nothing. `--format json` has the two as the `gitHook.state` `stops` and `ignored`. Only a file is read, so `doctor` and `init` come back from a named pipe there as well.
  - A hook file the account may not read is said with what git does with it, where `doctor` and `init` ended on a stack. Where git may not execute it either, it skips it with a hint and commits: said, and nothing fails. Where it may, git runs it, and a script the shell cannot read stops every commit, where a program runs unread: whether it runs spec-harness is *cannot tell*, never fine; `--strict` fails it. `--format json` has the `gitHook.state` `unreadable`.
  - A `core.hooksPath` that names a file is one git names no hook under: it says `Invalid path ...: Not a directory`, and commits with no hook. `doctor` says that where git runs its hooks cannot be told, in git's own words, where it gave the reason it has for a git older than 2.31. That is *cannot tell*, never fine; `--strict` fails it, where it failed nothing.
- **What stands where a file is read.** A settings file, `.mcp.json` or a record of Claude Code's plugins that is neither a file nor a directory, such as a named pipe, is read as one that cannot be read as JSON, as a directory is: a pipe nothing writes to was read without end, and neither `doctor` nor `init` came back. `.spec-harness.json` that is neither stops every command, the hook among them, with `.spec-harness.json is neither a file nor a directory, not a configuration file`, exit 2, as one that is a directory does. One that cannot be read, which the account may not read or another process holds open on Windows, is said as that, with the reason: `.spec-harness.json cannot be read: EACCES: permission denied, open ...`, exit 2, where it was said to be JSON that is not valid. Every other file the harness reads is read only where it is a file, and what else stands there as a file that is not there: a document a brief cites, a sibling's `package.json`, what the run before a write kept, git's configuration and a worktree's `commondir` as the hook reads them, a request waiting for a ruling, and a probe's report, said as `neither a file nor a directory`.

### An input that names nothing

An option, an argument or a value that is given and names nothing is refused: exit 2, one line on stderr that names it and says what to do, nothing read or written for it. None is read as if it had not been given. `--root "$DIR"` where the variable is not set would otherwise run in the current directory, and the answer would look like the one that was asked for ([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md)).

- **An option a command does not read.** A command takes the options its answer depends on, and refuses any other by name, with the ones it takes: `doctor does not take --note; its options are --brief, --base, --root, --format and --strict`.

  | Command | Reads |
  | --- | --- |
  | `context`, `rulings` | `--brief`, `--base`, `--root`, `--format` |
  | `guard`, `audit`, `doctor` | `--brief`, `--base`, `--root`, `--format`, `--strict` |
  | `probe` | `--brief`, `--base`, `--root`, `--format`, `--id`, `--at` |
  | `premises` | `--brief`, `--root`, `--format`, `--strict` |
  | `escalate` | `--brief`, `--root`, `--format`, `--path`, `--reason`, `--option`, `--recommend`, `--list`, `--show` |
  | `rule` | `--root`, `--format`, `--allow`, `--deny`, `--note` |
  | `init` | `--root`, `--format`, `--write`, `--git-hook`, `--block-on-failure` |
  | `hook` | `--brief`, `--base`, `--root` |
  | `mcp` | `--root` |

  `init` chooses the base itself, and the server is told the brief and the base by each call, so neither takes `--base` or `--brief`: taking one would say the base or the brief had been set.
- **An option beside one that leaves it unread.** `escalate --list` and `escalate --show <id>` print what waits and raise nothing, and beside either only `--root` and `--format` are read: `escalate --list does not take --path; beside --list its options are --root and --format`. A request spelled out beside `--list` printed the list, exit 0, and was never raised.
- **A brief named twice.** `context`, `rulings`, `audit` and `probe` take the brief as their argument or as `--brief`, and refuse the two together, whatever they hold: `audit was given the brief twice, as its argument "012" and as --brief "013"; give one of them`. The argument won with no word. `SPEC_BRIEF` and the branch beside either are the [order](#which-brief) as it stands.
- **An argument a command does not take.** `context`, `rulings`, `audit` and `probe` take one brief's id at most, `rule` one escalation's id, `guard` its paths and `hook` the word `claude` or `git`; `escalate`, `premises`, `init`, `mcp` and `doctor` take none. `init mydir` set up the directory it stood in; `init --root mydir` sets up another.
- **A value that names nothing.** An option that takes a value refuses one that is empty or only space, by the option's name: `--brief is "", which names no brief`. So does an argument, as in `guard ""`. No option gives an empty value a meaning: leave the option out for what the command does without it.
- **A `--root` that is no directory**, a file or a path that is not there: `--root is "nowhere", which is not a directory`.
- **An option that takes one value, given two.** `doctor --root nowhere --root .` ran in `.`, and `--brief 404 --brief 001` was brief 001: the parser kept the last, and the earlier went unread with no word. It is `--root is given twice, as "nowhere" and as ".", and one of the two would go unread; give it one`. Two values are compared as the option reads them, so the same thing given twice is the option once: `--root .` beside `--root ./`, a directory however it is spelt from where the command is started, a drive letter on Windows in either case (`--root C:\work` beside `--root c:\work`, which [spec-core's ADR-0005](https://github.com/spec-family/spec-core/blob/main/docs/adr/0005-the-family-contract.md) has every tool read as one: Windows names a volume by its letter in either case), and `--brief 12` beside `--brief 012`, a brief by its id as spec-brief's names are matched. A base, a format, an id and text are compared as written. `--path` and `--option` are lists, and each use adds to the list.
- **A `.spec-harness.json` that is a directory** does not load, and is said so in a line, as one that is not JSON is.

A line that is wrong is refused with `--help` or `--version` on it, each of the above and a command that is none, as an option no command has always was: `doctor --help --root a --root b` printed the help, exit 0. `--help` beside `--version` asks for two answers, of which one would go unread, and is refused: `--help is given beside --version, and one of the two answers would go unread; give one of them`. On a line that is right, either answers, a command that needs more than the line gives it among them, as `guard --help` does. Three things are read another way, each for its reason:

- **`hook claude` reads its line as every release has.** The line is in `.claude/settings.json` and in the Claude Code plugin of every release since 0.1.0, which a later release cannot rewrite, and exit 2 from it holds every write of a session, the one that would mend the line among them. So what it does not read is passed over as before, an empty `--brief` with the rest. The releases have handed the harness five command lines, `hook claude`, `hook git`, `mcp`, and `mcp --root` with the project or with `.`, and each is read as the release that wrote it read it ([ADR-0012](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0012-one-way-into-claude-code.md)).

  Two things on its line are said, and still refuse nothing. Each is one line to the person, as `systemMessage`, and exit 0, said where there is a write the line leaves unchecked: Claude Code goes on with the write. It was exit 1, which Claude Code counts as a hook that failed, and under `"onFailure": "block"` that held every write of the session. No release wrote more than `hook claude` on the hook's line, so either is a line a person changed.

  - **A `--root` that is a file, or is not there.** It read as a session outside a git work tree, exit 0 and no word, and the guard was off. It is `--root is "nowhere", which is not a directory, so the guard is off and this write is not checked`, with what to do. An empty `--root` is the directory the hook was started in, and guards there, as before.
  - **A line the parser cannot read**: an option no command has, as in `hook claude --nope`; an option left without its value, as `--root $DIR` is in a shell where the variable is not set; a `--format` or an `--at` that is none; two values for an option that takes one, whichever option it is, as in `hook claude --brief 001 --brief 404`, with `--help` beside them or not; `--help` beside `--version`; and `--help` or `--version` beside a `--root` that is a file or is not there, which the hook said only as it ran, and printed the help over, exit 0. Each was exit 2, as it is from every other command, and Claude Code blocks the tool call on a PreToolUse hook's exit 2: every write of the session waited on a line only a write can mend. It is `the hook's line cannot be read (Option '--root <value>' argument missing), so the guard is off and this write is not checked`, with what to do. The parser's own words stand between the brackets, on one line.

  Exit 2 from `hook claude` is kept for a write it could not check: a configuration that does not load, briefs that cannot be read, a brief that is named and is not one, an error nothing expected. `hook git` is not read this way. It stops one commit, exit 2, on a line a person reads, who can then mend the hook. Nor is a line that does not say `hook claude`, such as `hook` alone: the harness cannot tell whose it is. A hook entry that sets `"onFailure": "block"`, which Claude Code 2.1.295 and later read, has Claude Code hold the action when the hook fails: when it cannot start, runs past its timeout, or exits with a code other than 0 and 2, which no answer of the hook's is. `init --block-on-failure` writes the field; the plugin does not. [`doctor`](#doctor) says each of these of a line it finds in Claude Code's settings, before any write meets it.
- **`doctor` says an empty `--brief` or `--base` in its report**, as it says a brief spec-brief does not know: a diagnosis is what a person runs when something is wrong, and it reports what is wrong with what it was given. It exits 1 for either: the question it was asked names nothing.
- **`SPEC_BRIEF` set and empty is as unset**, since what sets it sets it whether or not there is a round ([Which brief](#which-brief)).

**In a tool call.** The server's tools refuse the same in their arguments, with a tool error that names the argument, as in `"paths[1]" is "", which names no file`: an empty `brief` or `base`, an empty path, an empty `recommendation`, an option whose `label` is empty. An argument a tool does not take was refused already. A `brief` spec-brief does not know, or has archived, is said of the argument too, `"brief" names brief 999, and spec-brief knows no such brief`, where the line called it the flag.

## As a Claude Code plugin

spec-harness ships two different things called a plugin. This section is the **Claude Code plugin**, installed into Claude Code. The **spec-brief plugin**, `@spec-family/spec-harness/spec-brief-plugin`, is a module spec-brief's archive loads to learn of signed rulings; `init` configures it ([above](#escalate-rule-rulings)).

The repository is a Claude Code plugin and a one-plugin marketplace: the four skills (`draft-brief`, `split-goal`, `run-round`, `close-round`), the hooks and the MCP server. The hooks and the server run the `spec-harness` installed in your project, `node ${CLAUDE_PROJECT_DIR}/node_modules/@spec-family/spec-harness/bin/spec-harness.js`, so install it there first, in every project the plugin guards: without it the hooks cannot start, and [`doctor`](#doctor) exits 1. The server is told the project with `--root`, since Claude Code starts a plugin's server in the plugin's own directory. It needs Claude Code 2.1.139 or later.

```text
/plugin marketplace add spec-family/spec-harness
/plugin install spec-harness@spec-tools
```

### From a mirror

`spec-family/spec-harness` is GitHub shorthand, fetched from github.com. Where GitHub cannot be reached, as on a company network, mirror the repository and add the mirror by its full git URL; the plugin is `spec-harness@spec-tools` either way:

```text
/plugin marketplace add https://gitlab.example.com/tools/spec-harness.git
/plugin install spec-harness@spec-tools
```

### The plugin or `init`, not both

The Claude Code plugin's hooks and server are the ones `init` writes into `.claude/settings.json` and `.mcp.json`: use one or the other. With both, every write is guarded twice and the server is registered twice.

- `init` run while the plugin is on writes neither.
- The other order, `init` first and the plugin after, nothing prevents: Claude Code runs a plugin's hooks as the plugin ships them.
- A plugin hook that stood down because it believed `init`'s ran could leave no guard at all: Claude Code reads no hooks from `.claude/settings.json` in a session that spans several repositories, and managed settings can turn off the settings' hooks while those of a plugin they force on keep running ([ADR-0012](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0012-one-way-into-claude-code.md)).

So after installing the plugin where `init` has run:

1. Run `npx --no-install @spec-family/spec-harness doctor`: a double install exits 1.
2. Take the `spec-harness` entries out of those two files, or turn the plugin off for the project.

## In a repository that is not Node

The hooks, the server and git's hook run the spec-harness installed in the project, so a .NET, Java or Python repository installs the tools as a Node project does, and its build never sees them:

1. A `package.json` at the root holding `{ "private": true }`. `private` keeps npm from ever publishing it.
2. `npm install --save-dev @spec-family/spec-harness @spec-family/spec-brief`, and `@spec-family/spec-guard` for the rules and the assertions. npm writes the tools as `devDependencies`, and `package-lock.json` pins them.
3. `node_modules/` in `.gitignore`.
4. `npm ci` after a clone and in CI, which installs what the lock pins.

The hooks name `${CLAUDE_PROJECT_DIR}/node_modules/@spec-family/spec-harness/bin/spec-harness.js`, not `npx` or a global install:

- Claude Code starts a hook wherever the session stands and a plugin's server in the plugin's directory, so neither can rely on `npx` finding the project's install.
- On Windows `npx` is a shim that cannot start without a shell.
- The copy in the project is the version the project pinned, the one `doctor` checks the siblings against.

git's hook names the same script, `node_modules/@spec-family/spec-harness/bin/spec-harness.js`, from the top of the work tree, where git starts it. `npx` would start npm to start node on every commit.

A person who runs the tools by hand runs `npx --no-install @spec-family/spec-harness`, from the root, giving `npx` the package's [full name](#names).

## Configuration

`.spec-harness.json` at the repository root. Every key is optional; an unknown key stops the run with exit 2.

| Key | Default | What it says |
| --- | --- | --- |
| `branches` | `brief/{id}`, `brief-{id}`, `*/brief/{id}`, `*/brief-{id}` | Branch names that carry the active brief's id. |
| `outOfScope` | `"warn"` | A write outside `affectedFiles`: `warn`, `ask` or `deny`. |
| `base` | the remote's default branch | What rounds are measured from, and where allowed signers are read. `init` names it, since a repository git did not clone may have no default branch recorded. Where the name reads as no commit here, as in a CI checkout that fetched the base as `origin/main` alone, the remote's branch of that name is the base, `remotes/origin/<name>`. |
| `rulings.section` | `"Rulings"` | The brief section holding the rulings table. |
| `rulings.allowedSigners` | `".github/allowed_signers"` | The allowed-signers file, read from the base branch. |
| `dependencies.manifests` | the list under [`audit`](#audit-brief) | Manifest names whose added dependencies the audit reports, and, in a `package.json`, the install scripts it allowed. A name that cannot be read is a warning in the audit. |
| `context.budget` | `60000` | Characters a context packet may hold; cited documents fill what the rest leaves, and those that do not fit are named by path. |
| `assertions.premises` | `The Defect, Measured`, `Premises`, `Preconditions` | Sections whose assertions state what was true before the round. |
| `probes.runs`, `probes.timeout` | `2`, `600` | Runs per probe, and seconds per run. |
| `tools` | found in `node_modules` | A sibling's command by name: `{ "spec-brief": ["node", "path/to/spec-brief.js"] }`. |
| `turnReport` | `false` | `true`: as each of Claude Code's turns ends, the hook reports every changed path the brief protects or that is outside its scope, to Claude as the next turn begins ([`guard` and the hooks](#guard-path-and-the-hooks)). `init` writes the entry that runs it where it is on. |

**Exit codes:**

| Code | Means |
| --- | --- |
| `0` | Clean. |
| `1` | Refused, found something, or waiting on a person. From `hook claude`, also what it says and holds no write for: a question it cannot read, and a line of its own it cannot read or whose `--root` is no directory. |
| `2` | The answer cannot be trusted, or did not arrive. An option, an argument or a value that [names nothing](#an-input-that-names-nothing) is one. A git command that failed is one, and so is a stdout its reader closed before all of the output was written, as a pipeline into `head` does: each is one line on stderr. An error the harness did not expect is one too: `spec-harness: unexpected error:` and its stack, on stderr. |
| `130` | A `probe` interrupted by SIGINT (Ctrl+C) while it runs. |
| `143` | A `probe` interrupted by SIGTERM. |
| `129` | A `probe` interrupted by SIGHUP. |
| `149` | A `probe` interrupted by SIGBREAK, which is Ctrl+Break on Windows. |

An interrupted `probe` exits as a shell reports a process the signal ended.

## Design

The decisions and what they cost are in [`docs/adr/`](https://github.com/spec-family/spec-harness/blob/main/docs/adr/README.md); what the whole family shares is [spec-core's ADR-0005](https://github.com/spec-family/spec-core/blob/main/docs/adr/0005-the-family-contract.md). Working on spec-harness itself: [CONTRIBUTING.md](https://github.com/spec-family/spec-harness/blob/main/CONTRIBUTING.md); reporting a vulnerability: [SECURITY.md](https://github.com/spec-family/spec-harness/blob/main/SECURITY.md).

## License

MIT
