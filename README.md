# spec-harness

**Rounds of agent work under a brief a person approved: what the agent needs to start, a guard on the agent's writes, an escalation a person signs when the brief is not enough, and an audit when it ends.**

spec-harness is the agent-facing member of the [spec-\* tools](https://github.com/spec-family/spec-core#the-family). It calls no model and writes no content - the agent is the model. It gives the agent the contract and the facts, and answers, the same way every time, whether the agent stayed inside the lines. No runtime dependencies, no account, no network.

The family's words - brief, round, wave, ruling, premise, the two kinds of plugin - are defined in [concepts](https://github.com/spec-family/spec-core/blob/main/docs/concepts.md), and the [tutorial](https://github.com/spec-family/spec-core/blob/main/docs/tutorial.md) takes one round from the brief to the archive in ten steps. This README is the front page; [the reference](docs/reference/README.md) has every command, flag, hook, MCP tool, configuration key and `doctor` check.

## Quick start

```bash
npm install --save-dev @spec-family/spec-harness @spec-family/spec-brief
npx --no-install @spec-family/spec-harness init            # the plan: what it would configure, and why
npx --no-install @spec-family/spec-harness init --write    # apply it
```

In a repository made with `git init` on `main`, with no remote yet, the plan reads:

```text
run     .spec-brief.json
        spec-brief init: the brief and archive directories, every default spelled out
update  .spec-brief.json
        load spec-harness's plugin, "@spec-family/spec-harness/spec-brief-plugin": spec-brief's archive asks it whether a signed ruling allows a protected file, and refuses the file without it; measure the archive from main, as spec-harness does: without a base, spec-brief's archive warns that the scope went unmeasured and checks no protected file
create  .spec-harness.json
        rounds are measured from main, the branch init runs on: no remote records a default branch (refs/remotes/origin/HEAD); change "base" if rounds merge into another
create  .claude/settings.json
        the guard hooks, run with node from the project's install: a PreToolUse hook refuses writes to protected files; a PostToolUse hook warns about writes outside the scope; a SessionStart hook says, as a session starts, what would hold every write of it
create  .mcp.json
        the spec-harness MCP server, run with node from the project's install: start_round, check_path, request_escalation, audit_round, list_rounds
advise  .git/hooks/pre-commit
        no pre-commit hook runs spec-harness: one refuses a commit that changes what the active brief protects, for any agent or none, a shell's writes included; run spec-harness init --git-hook --write to add it
advise  .github/allowed_signers
        rulings count only when signed by a key listed here on the base branch: one line per person, <email> namespaces="git" <public key>. Where an agent runs as the person, make it a FIDO2 key, ssh-keygen -t ed25519-sk, whose signature needs a touch no process can supply. Have the forge protect this file, the ADRs, the tool configurations and the CI configuration, so no change to them reaches the base branch without a person, and check each change in CI against the base branch's rules: on GitHub, CODEOWNERS and a protected branch; on GitLab Premium, Code Owners; on GitLab Free, a protected branch no one pushes to, merged by Maintainers, agents as Developers, and pipelines that must succeed. spec-core's docs/adopting.md has the settings

Nothing was changed. Run again with --write to apply the plan.
```

Then a brief: `npx --no-install @spec-family/spec-brief new "Rotate tokens"` scaffolds `briefs/001_rotate-tokens.md`, and a person fills it in and makes it `active`, here with `affectedFiles: ["src/auth/**"]` and `protectedFiles: ["src/db/schema.ts"]`. On its branch the guard answers for any path:

```bash
git switch -c brief/001-rotate-tokens
npx --no-install @spec-family/spec-harness guard src/db/schema.ts src/auth/token.ts README.md
```

```text
refused  brief 001 does not empower this round to change src/db/schema.ts (protectedFiles: src/db/schema.ts)
         if the round cannot be done without it, stop and ask for a ruling: spec-harness escalate --path <file> --reason <why>, or the request_escalation tool
ok       src/auth/token.ts is in brief 001's scope (src/auth/**)
warning  README.md is outside brief 001's scope, which covers src/auth/**
         if the round needs it, say so in briefs/001_rotate-tokens.md and add it to affectedFiles; the archive reports every file outside the scope
```

That exits 1. Claude Code asks the same before every `Edit` and `Write`, through the hook `init` wrote, and the refused write never happens; Claude reads why, and the next step:

```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"spec-harness: brief 001 does not empower this round to change src/db/schema.ts (protectedFiles: src/db/schema.ts). Next: if the round cannot be done without it, stop and ask for a ruling: spec-harness escalate --path <file> --reason <why>, or the request_escalation tool."}}
```

A repository that is not Node installs the tools the same way, from a `package.json` that holds `{ "private": true }` ([Installing](docs/reference/install.md#in-a-repository-that-is-not-node)).

## Names

The package is `@spec-family/spec-harness`, and the command it installs is `spec-harness`. The name without the scope is not this project: on npm, `spec-harness` is another publisher's package, and it installs a command of the same name. So give `npx` the full name:

- `npx --no-install @spec-family/spec-harness` in a project that installed it runs that install, the version the lockfile pins, and where there is none it stops with an error that names this package. Every command in this README, in the reference and in the skills is written so.
- `npx @spec-family/spec-harness`, without `--no-install`, fetches this package where nothing is installed: for a look at `--help`, and little else.

<!-- bare-name: the two forms in the next sentence are shown as what not to write -->
Never `npx spec-harness`, and not `npx --no-install spec-harness` either: npm still runs a copy of the other package that an earlier fetch left in its cache. [Names](docs/reference/install.md#names) has how to clear that cache, and the same for the siblings' names.

## Requirements

- **spec-brief 0.12.0 or later**, required: the brief is the contract, and spec-brief is its reader.
- **spec-guard 0.30.0 and spec-graph 0.21.0 or later**, used when they are installed. Their absence is reported, never assumed clean.
- **Claude Code 2.1.139 or later** runs the guard hooks and the Claude Code plugin's server; an older one runs every write unguarded, so `doctor` checks the one on `PATH`.
- **git 2.31 or later**, and **Node 22 or later**.

A sibling installed below its minimum is never run: `doctor` and every command that needed it name the minimum. [Installing](docs/reference/install.md#requirements) has why each release is the floor.

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

The round's brief is named, never guessed: `--brief <id>`, then `SPEC_BRIEF`, then the branch, `brief/{id}`, `brief-{id}`, `*/brief/{id}` or `*/brief-{id}`, so `claude/brief-042-rotate-tokens` is brief 042. A name that names no brief is not passed over for the next. [A round](docs/reference/rounds.md) has the order in full, the branch a forge's CI names on a detached HEAD, worktrees and the branches an app makes, and what each layer catches of a session that writes through a shell.

## Commands

In the order a round meets them; `init` and `doctor` set a repository up and check it. Each heading's page in [the reference](docs/reference/README.md) has the whole of it.

### `context [brief]`

The packet an agent starts a round with: the brief in full - it is the contract - then the files it may write and must not change, the rulings already signed, the briefs it depends on, the architecture rules spec-guard holds over its scope, and the documents it cites, whole, up to a budget. What could not be read is named, never left out ([`context`](docs/reference/context.md)).

### `guard <path...>` and the hooks

May the round write this?

| The path | The answer |
| --- | --- |
| one the brief protects | **Refused**, unless a signed ruling allows it. |
| one in `affectedFiles` | Allowed. |
| anything else | **Outside the scope**: a warning by default, or a question to the person, or a refusal (`outOfScope`: `warn`, `ask`, `deny`). |

The hooks ask it of every write:

| When | The hook | What it does |
| --- | --- | --- |
| Before an `Edit`, `Write`, `MultiEdit` or `NotebookEdit` | `hook claude`, Claude Code's `PreToolUse` | Refuses a write to a protected file, with the reason and the next step. It never answers `allow`, which would skip the person's own permission prompt. |
| After such a write | `hook claude`, `PostToolUse` | Warns Claude of a write outside the scope. |
| As a session starts | `hook claude`, `SessionStart` | Says in one line what would hold every write of the session. It holds nothing. |
| As a turn ends, with `"turnReport": true` | `hook claude`, `Stop` | Reports every changed path the brief protects or that is outside its scope, a shell's writes among them. |
| Before a commit | `hook git`, git's `pre-commit`, from `init --git-hook` | Refuses a commit that changes a protected file, for any agent or none. |

A guard is a guardrail - an agent that writes through a shell passes it - so the audit and spec-brief's archive are the gates ([`guard` and the hooks](docs/reference/guard.md)).

### `escalate`, `rule`, `rulings`

When the round cannot be done without a protected file, the agent writes a memo and stops; a person rules, and signs:

```bash
# the agent
npx --no-install @spec-family/spec-harness escalate --path src/db/schema.ts \
  --reason "Rotation needs a rotated_at column." \
  --option "Allow: one additive column" --option "Refuse: rotation keeps no timestamp" \
  --recommend "Allow; the column is additive."

# the person
npx --no-install @spec-family/spec-harness escalate --show E-001-1
npx --no-install @spec-family/spec-harness rule E-001-1 --allow --note "Add rotated_at only."
git commit -S -m "ruling R-001-1: allow" -- briefs/001_rotate-tokens.md
```

A ruling is a row in the brief's `## Rulings` table, and it **counts** when the commit that last changed the row is signed by a key the **base branch's** `.github/allowed_signers` lists. What it proves is that the agent did not sign it, not that a second person reviewed it. Merge a round with a merge commit: a squash or a rebase writes new commits no allowed signer signed, and on the base branch the ruling no longer counts ([`escalate`, `rule`, `rulings`](docs/reference/rulings.md)).

### `audit [brief]`

One report on a round: what spec-brief's archive would refuse or warn about, the brief's own assertions through spec-guard, rulings whose signatures do not verify, and every dependency the round added and every package it allowed to run install scripts. What was measured is said beside what was found, and `--format gitlab`, `sarif` or `github` prints the findings for a forge ([`audit`](docs/reference/audit.md)).

### `probe [brief]`

A defect is measured before it is filed. The brief carries its probe: at the base every run must fail for the reason it declares, or the verdict is `vacuous`, `flaky` or `invalid`, and at the head it must pass ([`probe`](docs/reference/probe.md)).

### `premises`

Is every live brief still about something true? A premise that no longer holds is `stale-premise`, exit 1: the defect was fixed another way, or the code the brief describes is gone. Run it in CI ([`premises`](docs/reference/premises.md)).

### `mcp`

The MCP server, on stdio, which `init` and the plugin register:

| Tool | What it answers |
| --- | --- |
| `start_round` | Everything needed to start the round, as `context` gives it. |
| `check_path` | May the round write these files, as the hook decides each. |
| `request_escalation` | Records a request for a person to rule, as `escalate` does. |
| `audit_round` | Did the round stay inside the lines, as `audit` reports it. |
| `list_rounds` | The live briefs, what each waits on, and which are ready to start. |

With them, four prompts, the workflows of the skills: `draft-brief`, `split-goal`, `run-round` and `close-round` ([`mcp`](docs/reference/mcp.md)). The server is listed in the official MCP Registry as `io.github.spec-family/spec-harness`.

### `init`

Configures the family to agree: spec-brief loads this package's spec-brief plugin and measures from the base, `.spec-harness.json` names the base, Claude Code runs the guard hooks and the server from the project's install, and git's pre-commit hook with `--git-hook`. It prints the plan, merges into files that exist, keeping what is there, and changes nothing without `--write` ([`init`](docs/reference/init.md)).

### `doctor`

The first thing to run when a hook refuses something unexpectedly. It reports the siblings and their versions, the brief the flag, `SPEC_BRIEF` or the branch names, what a signed ruling needs to count, how Claude Code runs the guard and which Claude Code, and git's hook. It exits 1 where a sibling or Claude Code is too old, the guard is installed twice, is off or holds every write, the branch names a brief no round can work under, or git stops every commit ([`doctor`](docs/reference/doctor.md)).

Every command refuses an option, an argument or a value that names nothing, with exit 2 and one line that says what to do. The exit codes are the family's: `0` clean, `1` refused, found something, or waiting on a person, `2` the answer cannot be trusted or did not arrive. [The command line](docs/reference/command-line.md) has the options each command takes and every exit code.

## As a Claude Code plugin

spec-harness ships two things called a plugin. The **Claude Code plugin** is this repository, installed into Claude Code: the four skills, the hooks and the MCP server. The **spec-brief plugin**, `@spec-family/spec-harness/spec-brief-plugin`, is a module spec-brief's archive loads to learn of signed rulings, and `init` configures it.

The Claude Code plugin's hooks and server run the `spec-harness` installed in the project, so install the package there first, in every project the plugin guards: without it the hooks cannot start, and `doctor` exits 1.

```text
/plugin marketplace add spec-family/spec-harness
/plugin install spec-harness@spec-tools
```

Use the plugin or `init`'s entries in `.claude/settings.json` and `.mcp.json`, not both: with both, every write is guarded twice, and `doctor` exits 1. [Installing](docs/reference/install.md#as-a-claude-code-plugin) has the plugin from a mirror, and how to take one of the two away.

## In CI

`doctor` in a CI job checks what the repository holds for the guard: each sibling no older than this release needs, Claude Code's settings running the guard once and on a line that guards, and the branch naming a brief a round can work under. On GitHub Actions:

```yaml
jobs:
  spec-harness:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
          fetch-depth: 0 # the base and its history, which doctor reads
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version: '24'
      - run: npm ci
      - run: npx --no-install @spec-family/spec-harness doctor
      - if: ${{ !cancelled() }} # with spec-guard installed
        run: npx --no-install @spec-family/spec-harness premises --format github
```

Run `doctor` without `--strict`, which fails where the release of Claude Code cannot be told, as on a runner with no `claude`. On a CI runner the Claude Code plugin is neither looked for nor required. [`doctor`](docs/reference/doctor.md) has why the base needs its history, [`audit`](docs/reference/audit.md#for-a-forge) a GitLab job that reports its findings as Code Quality, and spec-core's [adopting guide](https://github.com/spec-family/spec-core/blob/main/docs/adopting.md) the whole family in one job.

## Configuration

`.spec-harness.json` at the repository root. Every key is optional, and an unknown key stops the run with exit 2. The ones a repository most often sets are `base`, the branch rounds are measured from and the allowed signers are read on, which `init` writes; `outOfScope`, `warn`, `ask` or `deny`; `branches`, the branch names that carry a brief's id; and `turnReport`, the report as each of Claude Code's turns ends. [Configuration](docs/reference/configuration.md) has every key, with its default.

## Verified

CI's full mutation sweep reads **98.00% over 12,601 mutants** on b32c85b (run 42970849086), the sweep of 0.24.2, and its `break` is 95. The core sweep, which mutates the pure modules against the unit suite on every change, reads 98.69% over 7,305 mutants on b32c85b (run 42970848876), and fails a change under 97. [ADR-0010](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0010-toolchain-and-verification.md) has each release's sweep, and what a survivor it adds must be before it ships.

## Design

The decisions and what they cost are in [`docs/adr/`](https://github.com/spec-family/spec-harness/blob/main/docs/adr/README.md); what the whole family shares is [spec-core's ADR-0005](https://github.com/spec-family/spec-core/blob/main/docs/adr/0005-the-family-contract.md). Working on spec-harness itself: [CONTRIBUTING.md](https://github.com/spec-family/spec-harness/blob/main/CONTRIBUTING.md); reporting a vulnerability: [SECURITY.md](https://github.com/spec-family/spec-harness/blob/main/SECURITY.md).

## License

MIT
