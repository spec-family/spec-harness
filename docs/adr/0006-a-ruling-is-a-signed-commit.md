---
status: accepted
date: 2026-09-26
---

# ADR-0006: A ruling is a row whose commit a person signed

## Context

When a round cannot finish without touching what its brief protects, a person
must decide. The plan recorded the decision with a SHA-256 of token, option,
time and actor. The agent can compute that hash as well as anyone, so it
proves nothing about who decided.

## Decision

- An agent **escalates**: `spec-harness escalate --path … --reason …`, or the
  `request_escalation` MCP tool, records the request under
  `<git-common-dir>/spec-harness/escalations/` and prints a memo: what, why,
  the options and what each costs, and the agent's recommendation.
- A person **rules**: `spec-harness rule <id> --allow|--deny --note …` writes
  one row into the brief's `## Rulings` table
  (`| Ruling | Paths | Decision | Note |`), and the person commits it
  **signed**.
- A row **counts** when the commit that last changed it - `git blame` of that
  line as the file on disk has it, so an uncommitted row has no commit and
  cannot borrow a signed line's - carries a good SSH signature by a principal
  in the allowed signers file **as the base branch has it**
  (`.github/allowed_signers` by default). The round's own tree cannot add a signer, and an edit to the row
  by anyone moves the blame to a commit that must be signed again.
- Verified `allow` rulings let the guard pass the paths they name, and let
  spec-brief's archive accept a protected file they cover, through the
  spec-brief plugin this package ships.

**A signature is only as strong as the key's isolation.** An agent running as
the person, with the key loaded where it can reach it, can sign. The
recommendation is a FIDO2 key (`sk-ssh-ed25519@openssh.com`), whose
signature needs a touch no process can supply, or a signing key the agent's
account cannot read.

*Amended 2026-09-30.* doctor notes each signer in the allowed-signers file on
the base whose key is not a FIDO2 key, `sk-ssh-ed25519@openssh.com` or
`sk-ecdsa-sha2-nistp256@openssh.com`, reading the file as OpenSSH does:
principals, any options, the key type and the key. It is a note, never a
failure. This decision accepts a key the agent's account cannot read as well
as a FIDO2 key, and a hardware key reached through PIV or PKCS#11 is written
as a plain `ssh-rsa` or `ecdsa` line, so a failure on the key type would
refuse keys this decision accepts. A `cert-authority` line holds a
certificate authority's key; the keys it certifies are not in the file, so
it is left out. init's advice names the file `rulings.allowedSigners`
names, where it named `.github/allowed_signers` whatever the configuration
said, and a FIDO2 key made with `ssh-keygen -t ed25519-sk`.

*Amended 2026-09-30.* The reader followed OpenSSH's fields but not its
quotes: it unquoted a field only when quoted whole, and read an option's
value quoted or not. OpenSSH's `strdelim` takes the first double quote of
the principals out with the next, wherever it opens, and the field ends at
that one, so `a@example.com,"b@example.com"` names both people and
`"a@example.com"b` ends at `a@example.com`; its `sshsigopt_parse` reads
only `cert-authority`, `namespaces`, `valid-after` and `valid-before`,
each value in double quotes with `\"` a quote inside, once each,
separated by commas, and refuses the line otherwise. The reader now does
the same, following those functions, and names a line OpenSSH refuses as
no signer with the reason, still as a note. It reads the times as
written, where OpenSSH also refuses one it cannot parse.

*Amended 2026-09-30.* A squash or a rebase writes new commits, on GitLab as
on GitHub: a squash, a fast-forward or semi-linear merge, and the *Rebase*
button, which rebases on the server. On the base branch a ruling's row then
blames to a commit no allowed signer signed, and the ruling no longer counts
there. Rulings are verified on the round's branch, before the merge, and a
merge commit keeps them verifiable after it: the README says how to set
that, on GitLab the merge method *Merge commit* with *Squash commits when
merging* set to *Do not allow*.

*Amended 2026-10-09.* A memo is never written with a part that says
nothing. A person rules on the memo, and cannot rule on a hole in it.
Measured on 0.11.1: `escalate --path "" --reason why` recorded a request
for a file named with two backticks and nothing between them;
`--reason ""` or `" "` one with an empty *Why*; `--option ""` wrote
`1. **** - `, a choice numbered and not named; `--recommend ""` a
recommendation of nothing. `request_escalation` refused an empty reason and
wrote the rest, and a test held an option with no label to be recorded
"rather than refuse to ask".

That is reversed. A request that is refused costs the agent one more call,
in the same turn, with the part filled in; a memo with a hole costs the
person a trip back to the agent to learn what was meant, and a ruling made
without it rules on something else.

- `escalate` refuses an empty `--path`, `--reason`, `--option` or
  `--recommend` by the option's name, and an option with a cost and no
  label, `--option ": a cost"`, the same way: exit 2, nothing recorded.
- `request_escalation` refuses an empty place in `paths`, an empty
  `recommendation` and an option whose `label` is empty or is not a
  string, with a tool error that names the argument, `"options[1].label"`.
- An option's cost may be left out, on the command line and in a tool call
  alike: a choice with a name is a choice. The memo then gives the choice
  alone, where it wrote the name and a dash that led nowhere.

*Amended 2026-10-11.* `escalate --list` and `--show` read nothing of a
request, and refuse what they do not read. `escalate` is three commands
under one name: it raises a request, lists what waits, or prints one memo.
The command line gave all three one set of options, so the parts of a
request were taken beside `--list` and `--show` and did nothing. Measured
on 0.12.0 through the launcher: `escalate --list` beside `--path`,
`--reason`, `--option`, `--recommend`, `--brief` or `--show`, and
`escalate --show <id>` beside the first five, each printed the list or the
memo, exit 0. `escalate --path src/x.ts --reason why --list` printed the
list, and the request it spells out was never raised: an agent that reads a
list and exit 0 has every reason to believe it asked.

Each is now exit 2 and one line, nothing printed: `escalate --list does not
take --path; beside --list its options are --root and --format`. `--brief`
is refused with the rest. What waits is kept for the repository, under the
git common directory, whichever round raised it, and neither option reads a
brief; a list that took `--brief 012` would pass for the list of brief 012.
`--list` decides over `--show`, as the command does. A request reads every
option but those two, as before, and `SPEC_BRIEF` set beside `--list` is
not a thing on the line: it is passed over. The server has no tool that
lists, so nothing changes there. Input refused that was accepted is a minor
release (spec-core's ADR-0009).

*Amended 2026-11-08.* **What a ruling proves, said where rulings are
described.** A ruling that counts proves that the agent did not sign it: a
key the base branch's allowed-signers file lists signed the commit that
last changed its row, and a FIDO2 key needs a person's touch. It does not
prove that a second person decided. Nothing reads who wrote the brief or
committed the round's work, so one person can write the brief, run the
round and sign its rulings, and a ruling is not two-person review or
separation of duties.

A check that the signer differs from the brief's author, or from the
author of the round's commits, was put to the maintainer in round 27, who
decided to say what a ruling proves and add no check for now. What such a
check would have to settle is left with that decision: git records an
author that the round's own commits can set to any name, so whose name
counts would need a rule of its own. The README's section on rulings says
what a ruling proves, and that a second person deciding is the forge's
review to require, as for any change.

## Consequences

No new format, service or network: git, OpenSSH 8.1 or later (2019), and an
allowed-signers file the forge's branch protection already guards. A forge
that squash-merges re-signs with its own key, so rulings are verified on the
branch, before the merge.
