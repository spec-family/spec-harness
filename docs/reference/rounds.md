# A round

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

## Which brief

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

## Worktrees, and the branches an app makes

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

## Sessions that write through a shell, with no rulings

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
