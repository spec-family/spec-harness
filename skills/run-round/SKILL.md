---
name: run-round
description: Carry out one approved brief as a contract - load its context, stay inside its scope, escalate instead of working around a protection, and keep its checklist honest. Use when asked to implement, execute or work on a brief, or when on a branch named like brief/<id>-<topic>.
---

# Run a round

## Before any command

Run every command below as written, from the repository's root. Each gives
`npx` the package's full name behind `--no-install`, so it runs the tool this
project installed and fetches nothing.

If one stops with `npx canceled due to missing packages`, the project's
dependencies are not installed in this work tree - a fresh clone, a new
worktree - or you are not at its root. Install them there, as with `npm ci`,
and run the command again; if that fails, stop and tell the person.

Never work around it by dropping `--no-install` or the `@spec-family/` in
front of the name. Without the scope the names are not these tools: on npm
`spec-harness` is another publisher's package, and `npx` would fetch it and
run it.

## 1. Start from the contract

Work on a branch named after the brief, `brief/<id>-<topic>`, or pass
`--brief <id>`. Then:

```bash
npx --no-install @spec-family/spec-harness context <id>
```

It gives you the brief in full, the scope as the guard reads it, the rulings
already signed, the briefs this one waited on, the rules spec-guard holds the
scope's code to, and the documents the brief cites. Read it before the code.

## 2. Stay inside the lines

- Write the files in `affectedFiles`. If the hook is installed, every edit is
  checked; otherwise ask first:
  `npx --no-install @spec-family/spec-harness guard <path>`.
- A protected file is not yours to change. If the round cannot be finished
  without it, stop and escalate - do not work around it, do not edit through
  a shell to avoid the hook:

  ```bash
  npx --no-install @spec-family/spec-harness escalate --path <file> --reason "<why the round needs it>" \
    --option "<option>: <what it costs>" --option "<other option>: <cost>" \
    --recommend "<which, and why>"
  ```

  Then wait. A person rules, and signs the ruling; only a signed ruling lets
  the guard pass the file.
- A file outside the scope that the round genuinely needs: say so in the
  brief and tell the person. The archive reports every such file it commits.
- Adding a dependency is a decision, and so is allowing one to run install
  scripts: name it in the brief and say why.

## 3. Keep the checklist true

Tick a box when its work is done and verified, not before. A box you will
not do gets a note under it that starts with a disposition the repository
accepts - `**Delegated`, `**Accepted debt`, `**Rejected` by default - and
says why. Commit as you go; the audit measures commits.
