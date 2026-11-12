# `audit [brief]`

One report on a round, in four parts:

| Part | What it reports |
| --- | --- |
| The archive | What spec-brief's archive would refuse or warn about, run with `--dry-run`. |
| Assertions | The brief's own assertions through spec-guard: a goal that fails, or a premise (under a heading such as *The Defect, Measured*) that still holds after the round meant to change it. |
| Rulings | Rulings whose signatures do not verify. |
| Dependencies | Every dependency the round added to `package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`, `requirements*.txt`, NuGet project files or a `Gemfile`, and every package it [allowed to run install scripts](#install-scripts) in a `package.json`. |

## Install scripts

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

## What it could not measure

A part that could not be measured is a finding, never a silence. Each of these is a warning, which fails the audit only under `--strict`:

- `assertion-unreadable`: an assertion in the brief spec-guard cannot read, on its line, with spec-guard's reason. Nothing it states was run.
- `manifest-name-unread`: a name in `dependencies.manifests` that spec-core's glob cannot read, malformed or too large to compile, with the reason. The audit reads the manifests the other names name.
- `protection-rooted` and `ruling-path-rooted`: a pattern in `protectedFiles`, or a path of a signed ruling, that a leading `/` roots, alone or on a brace alternative, such as `/src/db/schema.ts`. It protects no path, so the round could change the file it meant to protect, or allows nothing, so the file is still refused. Write the protection without the slash; a ruling's path is fixed by a new ruling.
- `manifest-name-rooted`: a name a leading `/` roots at the filesystem's root, alone or on a brace alternative, such as `/package.json` or `{/Gemfile,Cargo.toml}`. Every path the audit reads is repository-relative, so the rooted part names no manifest; write the name without the slash, since a name is matched at any depth.

## What the round is measured by

The base and the allowed-signers file vouch for the round, so the round does not choose them: the work tree's `.spec-harness.json` is the round's to edit. They are read from the configuration on a ref the round cannot move ([ADR-0006](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0006-a-ruling-is-a-signed-commit.md), amended 2026-11-12):

| Where | The base | The allowed signers |
| --- | --- | --- |
| `--base <ref>` | that commit | the file `rulings.allowedSigners` names in the `.spec-harness.json` of that commit |
| the remote's default branch, `refs/remotes/origin/HEAD`, where git records one | what `base` says in the `.spec-harness.json` there, or that branch | as named there |
| neither | the base the work tree names, read again at the merge base of HEAD with it: what `base` says there, where it says one | as named there |

The third is weaker: where a round begins the branch its work tree names as the base, the merge base is the round's own commit. Pass `--base` in CI, where a fresh checkout records no default branch.

- A signer counts where the allowed-signers file lists it both on the base and at the merge base of HEAD with it. One added on the base while the round ran counts once the round is rebased onto it.
- `harness-config-changed`, a warning, says where the work tree's file names another base, a branch that names another commit, or another allowed-signers file: `the work tree's .spec-harness.json measures the round from evil, where origin/main has main: the round is measured from main`. The change counts once it is on the base.
- A `base` of `"main"` beside a remote whose default branch is `origin/main` names the same commit, and is no change.
- `doctor` reads the allowed-signers file the same way.

**`--require-measured`** fails the run, exit 1 and `ok: false`, where the round was not measured, or was measured by what it can change: `unmeasured` and `archive/scope-unmeasured` are errors under it, and `harness-config-unanchored`, an error it alone reports, says where the base and the allowed signers were read at the merge base. Without it, nothing of this fails a run but under `--strict`. Round 30 makes it the default, as the next minor after the D4 freeze.

## What it measured

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

## For a forge

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

## In CI

A job that runs on every branch audits the round on a brief's branch, and on any other branch there is no round to audit. `--if-round` passes that run: where no argument, `--brief`, `SPEC_BRIEF` or branch names a brief ([Which brief](rounds.md#which-brief)), `audit` says so in one line and exits 0, where without the flag it exits 2. It asks spec-brief nothing then, so a repository with no `briefs/`, or without spec-brief installed, passes too.

- The branch that archived its brief is no round to audit either. A round archives its brief on its own branch before the branch merges, and the branch still names the brief, which spec-brief then lists as archived; `spec-brief archive` checked the round as it archived it. Under `--if-round`, where the branch names a brief spec-brief has archived and git says this branch archived it, as [`doctor`](doctor.md) tells it, the archived file in HEAD and not at the merge base of the base and HEAD, `audit` says so in one line and exits 0: `brief 020 was archived on this branch, which waits to merge: briefs/archive/020_compute.md is in HEAD and not at the merge base with main, 8835800a03b3, and spec-brief archive checked the round as it archived it, so there is no round to audit, and --if-round passes the run`. So the job checks out the whole history, with the base's branch in it, as one that runs `doctor` does.
- A brief that is named and cannot be read fails as it does without the flag, exit 2: one spec-brief does not list; one spec-brief has archived that the flag, `SPEC_BRIEF` or the argument names; and spec-brief missing or unable to list the briefs where a brief is named. So does the branch's archived brief where the file is at the merge base already, a closed round's branch used again, and where git cannot say, as in a history that is shallow or where the base names no commit; the line then adds what `doctor` says of it: `the branch names brief 020, which is archived; a closed round writes nothing; whether brief 020 was archived on this branch, which waits to merge, cannot be told: the history is shallow, ...`.
- A round that is named is audited as it is without the flag.
- Where nothing names a brief, the line is `no brief is named by --brief, SPEC_BRIEF or the branch, so there is no round to audit, and --if-round passes the run`. Under `pretty` the line, either one, is the output. The other formats print what a run that found nothing prints, and say the line on stderr, where a script or a forge reads none of it: `--format json` has `ok: true`, `brief`, `base` and `measured` `null`, every count 0 and no finding, dependency or install script; `gitlab` an empty report; `sarif` a run with no result, the line as its note; `github` nothing.

On GitHub Actions, as a step of the [README's job](../../README.md#in-ci), which fetches the base with its history. `--base` names the branch the pull request merges into, or the repository's default branch on a push, as the forge has it, and `--require-measured` fails a run that could not measure the round ([What the round is measured by](#what-the-round-is-measured-by)); the branch name goes through `env`, never into the line itself, where a name could run as a command:

```yaml
      - if: ${{ !cancelled() }}
        env: # the branch the round merges into, as the forge names it, which the round cannot move
          BASE: origin/${{ github.base_ref || github.event.repository.default_branch }}
        run: npx --no-install @spec-family/spec-harness audit --if-round --require-measured --base "$BASE" --format github
```

In GitLab CI:

```yaml
spec-harness:
  image: node:22
  variables:
    GIT_DEPTH: 0 # the whole history, which the merge base is read from
  script:
    - git fetch origin main # the base's branch, read as remotes/origin/main
    - npm ci
    - npx --no-install @spec-family/spec-harness audit --if-round --require-measured --base remotes/origin/main --format gitlab > gl-spec-harness.json
  artifacts:
    when: always
    reports:
      codequality: gl-spec-harness.json
```
