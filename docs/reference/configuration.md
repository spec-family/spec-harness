# Configuration

`.spec-harness.json` at the repository root. Every key is optional; an unknown key stops the run with exit 2.

| Key | Default | What it says |
| --- | --- | --- |
| `branches` | `brief/{id}`, `brief-{id}`, `*/brief/{id}`, `*/brief-{id}` | Branch names that carry the active brief's id. |
| `outOfScope` | `"warn"` | A write outside `affectedFiles`: `warn`, `ask` or `deny`. |
| `base` | the remote's default branch | What rounds are measured from, and where allowed signers are read. `init` names it, since a repository git did not clone may have no default branch recorded. Where the name reads as no commit here, as in a CI checkout that fetched the base as `origin/main` alone, the remote's branch of that name is the base, `remotes/origin/<name>`. Read from the `.spec-harness.json` on the remote's default branch, or at the merge base of HEAD with the work tree's base, never from the work tree's alone: a round that names another is measured from this one, and `audit` reports `harness-config-changed` ([audit](audit.md#what-the-round-is-measured-by)). |
| `rulings.section` | `"Rulings"` | The brief section holding the rulings table. |
| `rulings.allowedSigners` | `".github/allowed_signers"` | The allowed-signers file, read from the base branch. The name is read as `base` is, never from the work tree's file alone, and a signer counts where the file lists it on the base and at the merge base of HEAD with it. |
| `dependencies.manifests` | the list under [`audit`](audit.md) | Manifest names whose added dependencies the audit reports, and, in a `package.json`, the install scripts it allowed. A name that cannot be read is a warning in the audit. |
| `context.budget` | `60000` | Characters a context packet may hold; cited documents fill what the rest leaves, and those that do not fit are named by path. |
| `assertions.premises` | `The Defect, Measured`, `Premises`, `Preconditions` | Sections whose assertions state what was true before the round. |
| `probes.runs`, `probes.timeout` | `2`, `600` | Runs per probe, and seconds per run. |
| `tools` | found in `node_modules` | A sibling's command by name: `{ "spec-brief": ["node", "path/to/spec-brief.js"] }`. |
| `protectHarness` | `null` | `"ask"` or `"deny"`: a write to a file the guard runs on or takes its trust from, `.git/**`, `.spec-harness.json`, spec-brief's configuration, Claude Code's project settings, `node_modules/@spec-family/**` and the allowed-signers file, is put to the person or refused, whatever the brief's scope says ([`guard`](guard.md)). `null` decides it by the brief, as any other file. |
| `turnReport` | `false` | `true`: as each of Claude Code's turns ends, the hook reports every changed path the brief protects or that is outside its scope, to Claude as the next turn begins ([`guard` and the hooks](guard.md)). `init` writes the entry that runs it where it is on. |
