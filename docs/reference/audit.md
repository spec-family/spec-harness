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
