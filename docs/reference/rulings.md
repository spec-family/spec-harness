# `escalate`, `rule`, `rulings`

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

A memo is what a person rules on, so none is written with a part that says nothing: a path, the reason, a recommendation or an option that is empty is [refused](command-line.md#an-input-that-names-nothing), by `escalate` and by the server's `request_escalation` alike. An option is `"<label>: <cost>"`: the label names the choice and may not be empty, and the cost may be left out, the memo then giving the choice alone.

Requests wait under git's directory, in `spec-harness/escalations` (ADR-0003). Where something that is no directory stands at either path, `escalate` and `rule` say which, exit 2, in a line: `.git/spec-harness is not a directory, where spec-harness keeps its state in one: move it away, and run the command again`.

`escalate --list` prints every request that waits, whichever round raised it, and `escalate --show <id>` one memo. Neither raises a request, so neither reads `--path`, `--reason`, `--option`, `--recommend` or `--brief`, and either beside one of them is [refused](command-line.md#an-input-that-names-nothing): the request was never raised, and the list looked like an answer to it.

A ruling is a row in the brief's `## Rulings` table. It **counts** when the commit that last changed the row is signed by a key the **base branch's** `.github/allowed_signers` lists. The file is `rulings.allowedSigners` in `.spec-harness.json`, `.github/allowed_signers` by default.

- An agent can write a row and compute any hash; it cannot produce the person's signature, and an edit to the row moves it to a commit that must be signed again ([ADR-0006](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0006-a-ruling-is-a-signed-commit.md)).
- Use a FIDO2 key (`ssh-keygen -t ed25519-sk`) where the agent runs as you: its signature needs a touch no process can supply.

**What a ruling proves** is that the agent did not sign it: a key the base branch's allowed-signers file lists signed the row's commit, and a FIDO2 key needs a person's touch. It is not two-person review or separation of duties. Nothing checks that the signer is someone other than the brief's author or whoever committed the round's work, so one person can write the brief, run the round and sign the ruling. Where a second person must decide, that is the forge's review to require, as for any change ([ADR-0006](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0006-a-ruling-is-a-signed-commit.md), amended 2026-11-08).

**The spec-brief plugin.** spec-brief's archive refuses a round that changed a protected file, and learns that a signed ruling allows it only from this package's spec-brief plugin: `init` adds `"plugins": ["@spec-family/spec-harness/spec-brief-plugin"]` to spec-brief's configuration.

- Without it, the archive refuses the file whatever was signed.
- `doctor` says whether spec-brief loads the spec-brief plugin, and `audit` names it as the reason for such a refusal.
- spec-brief loads a plugin by a path as well, one that starts with `.` or is absolute: a path to this package's spec-brief plugin file counts as loading it.

## Merge a round with a merge commit

A squash or a rebase writes new commits: the forge signs them with its own key or not at all, so on the base branch a ruling's row blames to a commit no allowed signer signed, and it no longer counts. Rulings are verified on the round's branch, before the merge; keep them verifiable after it:

- GitHub: allow merge commits for the repository, and turn off *Allow squash merging* and *Allow rebase merging* in its settings, or in the rules for the branch rounds merge into.
- GitLab: in *Settings > Merge requests*, set *Merge method* to *Merge commit* and *Squash commits when merging* to *Do not allow*. *Merge commit with semi-linear history* and *Fast-forward merge* need the branch rebased, which the *Rebase* button does on the server, writing new commits.
