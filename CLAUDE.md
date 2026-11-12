# CLAUDE.md

Working agreements for this repository. The ADRs in `docs/adr/` carry the
reasoning; spec-core's ADR-0005 is the contract every spec-* tool keeps.

## Invariants

Breaking one is a decision that needs an ADR.

- **No model, no content.** The harness gives and judges; it never writes a
  brief, an ADR, a fix or a ruling ([ADR-0001](docs/adr/0001-the-harness-decides-the-agent-writes.md)).
- **Siblings through their command lines**, versioned JSON, never imports and
  never a shell. A missing sibling is reported, never assumed clean
  ([ADR-0002](docs/adr/0002-siblings-through-their-command-lines.md)).
- **No state in the work tree; no git writes but temporary worktrees**, always
  removed ([ADR-0003](docs/adr/0003-state-outside-the-work-tree.md)).
- **The active brief is named, not guessed** ([ADR-0004](docs/adr/0004-the-active-brief-is-named-not-guessed.md)).
- **The hook never answers `allow`** ([ADR-0005](docs/adr/0005-a-guard-is-a-guardrail.md)).
- **A ruling counts only by a signature verified against the base branch's
  allowed signers** ([ADR-0006](docs/adr/0006-a-ruling-is-a-signed-commit.md)).
- **Zero runtime dependencies**, native ESM, TypeScript 7, Node >= 22, strict.
  spec-core is vendored in `src/vendor/spec-core/` and never edited there:
  change spec-core and run its `scripts/vendor.mjs`.
- **LF, no control characters.**
- **Skills stay under 30,000 characters together** ([ADR-0009](docs/adr/0009-prompts-are-workflow-with-a-budget.md)).

## Verification

```bash
npm run lint            # tsc --noEmit
npm test                # vitest: unit and integration
npm run build
```

The two mutation sweeps are not in that list, and are not run on a
workstation: they are checks of a pull request, as below.

Both mutation sweeps run in GitHub Actions. The core sweep is a job in
`ci.yml`, on every change, and its `break` is the gate. The full sweep,
`npm run test:mutation:full`, every module against the whole suite, is
`mutation.yml`: for a change to what only it reaches, weekly and on request,
with its own `break` of 95, set below its sweep of c385f19
([ADR-0010](docs/adr/0010-toolchain-and-verification.md)).
It runs in nine shards, balanced on measured minutes in
`scripts/mutation-shards.mjs`, and the `break` is applied once, to their
merged report; a file no shard lists is mutated by the last. A mutant's test
files run the quickest first there (`vitest.mutation.config.ts`), and a
static mutant that survives runs them all, so a second added to the suite is
a second for each of those in every sweep. On a pull request the full sweep
runs incrementally, from the file main's last full sweep published, keeping
the verdict of each mutant whose code and covering tests are unchanged; on
main, weekly and on request it runs every mutant, that score counts, and
only main's sweep publishes the file
([ADR-0010](docs/adr/0010-toolchain-and-verification.md), amended
2026-11-13).

A change to a module the core sweep does not mutate whole, the command line,
`init`, the server, `round.ts` and the edges, or to what the full sweep is
made of, is swept before it merges, and so is a change to the integration
suite or to the vendored spec-core, which its verdicts are made of:
`mutation.yml` runs for such a pull request and again for its push to main,
and `tests/mutation-shards.test.ts` fails for a module of `src/` that is in
neither the core sweep's `mutate` nor the workflow's paths. The job that
merges the shards names, in its summary, the undetected mutants that main's
newest full sweep did not have (`scripts/mutation-compare.mjs`), by file,
mutator, mutated text and replacement, and fails for none of them. The pull request lists each one
and what it is: killed, by a test it adds, or equivalent, said beside its
code. A summary that says nothing was compared is not one that found none
([ADR-0010](docs/adr/0010-toolchain-and-verification.md)).

A sweep runs for a mutant the tests that cover it and no other, so a test
stands alone: one that passes only after another in its file fails for
every mutant the other does not cover, and the sweep counts a kill. And it
counts a test that failed, not a test file that failed to load: a mutant
under which a module throws as it loads is killed only by a test whose file
still loads, as `tests/unit/literal.test.ts` is for `literal()`
([ADR-0010](docs/adr/0010-toolchain-and-verification.md)).

A command loads what it runs. The hook is started before and after every
write, so `cli.ts` and `round.ts` import a module that only some commands
run where one of them runs it, with `import()`. A sweep reads what such a
module does as it loads, its tables and its constants, as run by every test
only where a test file imports the module at its top: left to the command
line, it loads inside the first test that needs it, and a mutant of a table
is run for that test alone. So each of them has such a test file, and
`tests/source.test.ts` fails for one that has none.
`tests/integration/loads.test.ts` reads what each command loads, and imports
none of them at its top, so that a mutant under which one throws as it loads
fails a test there. A test file that loads modules afresh
(`vi.resetModules`) loads the command line afresh where it runs it: one
loaded before would run a command's module of the new ones and judge what
it throws by the classes of the old
([ADR-0002](docs/adr/0002-siblings-through-their-command-lines.md),
[ADR-0010](docs/adr/0010-toolchain-and-verification.md)).

Stryker makes no mutant of anything that stands under a TypeScript `as`, a
const assertion with the rest, so nothing a mutator reads stands under one:
a value is hoisted and the assertion put on its name, `!` says an index or
a match is there, a declaration takes the type where the value is `any`,
`satisfies` holds a table to a type, and `literal()` (`src/literal.ts`)
gives a table the types `as const` would.
`scripts/mutation-unmeasured.mjs` counts, by Stryker's own instrumenter,
the places a mutator applies under an `as`;
`tests/mutation-unmeasured.test.ts` holds the sources to its count on every
change, and the full sweep's score step holds the merged report to it ([ADR-0010](docs/adr/0010-toolchain-and-verification.md)).

Vitest is on 5 here since round 27, when Stryker 10.1's runner read its
test names and both sweeps of the change read as main's;
[ADR-0010](docs/adr/0010-toolchain-and-verification.md) has the
measurement, and spec-core's
[ADR-0008](https://github.com/spec-family/spec-core/blob/main/docs/adr/0008-toolchain.md)
the steps. Vitest 5's cache keeps a failure from a run a test name pattern
narrows until a run of the whole file passes, so the full sweep's order
keeps its own record of the file that failed when the worker last ran it,
`lastRun` in `vitest.mutation.config.ts`, and the core sweep's suite takes
the order and the record from there, where it had vitest's longest-first.
A sweep's workers share the record through a file in Stryker's sandbox,
read once when a worker starts, so one started after a timeout begins with
what the others left, as on vitest 4.
The reporter has no `onInit`: vitest 5 calls that at the start of every
run, which would empty the record before each sort, and
`tests/mutation-shards.test.ts` fails with one put back, or with either
suite left without the order or the record.

Run a tool through `npm run <script>` or `npx --no-install <tool>`, never a
bare `npx <name>`: before `npm ci` that fetches whatever the registry has
under the name. `.npmrc` has npm stop there instead, and `tests/npm.test.ts`
holds both. One of the family's own tools takes its package's full name
(spec-core's
[ADR-0005](https://github.com/spec-family/spec-core/blob/main/docs/adr/0005-the-family-contract.md#names),
Names).

Every job names the image it runs on, never a `-latest` label, which GitHub
moves: the suite's matrix runs Ubuntu 24.04 and 26.04, and coverage, the
sweeps and the release stay on `ubuntu-24.04`, where their numbers were
measured. `tests/runner-images.test.ts` fails a label that names no image
and a gate that leaves its own, and spec-core's
[ADR-0008](https://github.com/spec-family/spec-core/blob/main/docs/adr/0008-toolchain.md)
has the labels and the steps that move an image.

## Layout

| Module | Responsibility |
| --- | --- |
| `branch.ts`, `briefs.ts`, `answers.ts`, `config.ts` | Which brief, what spec-brief and spec-guard answer, read and checked, what the repository configured. |
| `guard.ts`, `hooks.ts` | May this path be written, and the answer in each hook's language. |
| `context.ts`, `audit.ts`, `manifests.ts` | The context packet; the audit's judgement; dependency diffs. |
| `formats.ts` | Findings for a forge: GitLab Code Quality, SARIF and GitHub annotations. |
| `rulings.ts`, `signers.ts`, `probe.ts`, `junit.ts` | Escalations and rulings; the allowed-signers file; probes and their verdicts; JUnit reports. |
| `reader.ts` | Documents through spec-core's Markdown scanner. |
| `round.ts` | The operations the CLI and the server share: facts gathered, decisions delegated. |
| `versions.ts` | The oldest release of each sibling this one runs, and of Claude Code; an installed version against it. |
| `git.ts`, `fs.ts`, `siblings.ts`, `host.ts`, `sandbox.ts` | The edges; `host.ts` asks Claude Code its release. |
| `configure.ts` | What `init` writes into each tool's configuration. |
| `usage.ts` | What a command line has to be before it runs: the options each command reads, the arguments it takes, and the refusal of what names nothing. |
| `literal.ts` | A table with the types a const assertion gives it, written where a sweep mutates it. |
| `cli.ts`, `commands.ts`, `setup.ts`, `server.ts` | The command line, `init`, and the MCP server. |

## Prose

Comments explain why, never what. No exclamation marks, no hedging. The same
for diagnostics, hints and commit bodies.
