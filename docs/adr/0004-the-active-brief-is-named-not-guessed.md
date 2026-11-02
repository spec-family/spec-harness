---
status: accepted
date: 2026-09-26
---

# ADR-0004: The active brief is named, not guessed

## Decision

The brief a round works on is, in order: `--brief <id>`; the `SPEC_BRIEF`
environment variable; the branch name, read through templates such as
`brief/{id}` and `*/brief-{id}` (configurable as `branches`). Ids compare as
written, or as numbers when both are all digits, so `brief/12` names `012`.

It is never inferred from which brief happens to be the only active one.
With no brief named, the guard has no contract to check and says so. With a
brief named that spec-brief does not know, or one already archived, every
write waits (exit 2) until the name is fixed: a guard pointed at the wrong
contract protects the wrong files.

*Amended 2026-09-30.* CI checks out a commit on no branch, so a round's own
CI run named no brief: `premises` read the premise the round retires as
stale, and failed the round's pipeline for doing its work. On a detached
HEAD the branch is now the one the forge's CI names, in this order:
`GITHUB_HEAD_REF`, a GitHub pull request's head branch; `GITHUB_REF_NAME`
when `GITHUB_REF_TYPE` is `branch`, the branch a GitHub push built;
`CI_MERGE_REQUEST_SOURCE_BRANCH_NAME`, a GitLab merge request's source
branch; `CI_COMMIT_BRANCH`, the branch a GitLab pipeline built. Each names a
branch only: `GITHUB_REF_NAME` names a tag too, so it is read only with
`GITHUB_REF_TYPE`, and GitLab's `CI_COMMIT_REF_NAME`, which names a tag as
well, is not read. This is a name, not a guess: the forge says which branch
the run builds, and the branch's name still has to carry the brief's id. A
branch checked out always wins, so a person's detached HEAD outside CI
names no brief, as before.

*Amended 2026-10-09.* A name that names no brief is refused where it is
given, and only an empty `SPEC_BRIEF` is still passed over. The order above
had the next source answer for a flag that held nothing: on a branch
`brief/012-x`, `guard --brief ""` was decided against brief 012 and
`context --brief " "` printed its packet, exit 0, and nothing said the flag
had named no brief (measured on 0.11.1, through the launcher).
`--brief "$ID"` is what a script writes, and the variable not set is how it
comes to hold nothing. The run then answers for another brief than the one
its caller believes it named, which is the guard pointed at the wrong
contract that this decision exists to prevent.

- `--brief` given an empty value, or space alone, is exit 2 and one line,
  `--brief is "", which names no brief`, from every command that reads it;
  so is a brief given as an argument, `context ""`, and the `brief` argument
  of the server's tools, as a tool error that names it (ADR-0005).
- `SPEC_BRIEF` set and empty, or to space alone, is as unset, and that is
  decided, not left over. What sets the variable sets it whether or not a
  round is under way: a hook's settings, a pipeline's `env` block, which is
  written once and expands to nothing on every run outside a round. The
  branch that then names the brief is a source the output states. A flag is
  typed for the run it is on; a variable is set for every run. One that
  names a brief spec-brief does not know stops the run, as the flag does and
  as it did.
- `hook claude` passes over an empty `--brief`, as every release has: a
  refusal on its line is exit 2 before every write of a session (ADR-0005).
- `doctor` says it in its report, `brief   none: --brief is "", which names
  no brief`, and says there what every command that acts on a brief stops
  on: a brief spec-brief does not know, or has archived, whichever source
  names it. It printed `brief   999` and no more for a brief under which
  every write was held. It asks spec-brief only when something names a
  brief, as above; a spec-brief that cannot be run is a row of the report
  already, and one that could not list the briefs is said on the brief's
  line. None of it changes doctor's exit code: its report states a base that
  names no commit and exits as it would have, and a brief is stated the
  same way. `--format json` keeps the id as `brief` and adds the reason as
  `briefProblem`, `null` where there is none; the field is added, so no
  `schemaVersion` moves.

*Amended 2026-10-11.* Three more things about a name that names no brief,
each measured on 0.12.0 through the launcher.

- **`premises` stops on a brief `--brief` or `SPEC_BRIEF` names that
  spec-brief does not know.** Every command that acts on a brief stopped
  there but this one. `premises --brief 999`, `premises` under
  `SPEC_BRIEF=999` and `premises` on a branch `brief/999-nowhere` each ran
  as if no brief were named, and the premise the caller's round retires was
  reported stale, exit 1. Given the same name, `context`, `guard`,
  `escalate`, `rulings`, `audit`, `probe`, both hooks and the server's four
  tools were exit 2 or a tool error already, and `doctor` says it in its
  report. Now `premises` is exit 2 with their line, `the flag names brief
  999, and spec-brief knows no such brief`, or `the environment`, before it
  prints anything and where no brief is live as well.

  **A branch that names no brief is still read by `premises` as no round.**
  The flag and the variable are given to a run. A branch is where the run
  finds itself, and `premises` is the command that CI runs on every branch:
  the family's adopting guide has it in the job of every pull request,
  where the forge names the branch. A branch whose name only reads as a
  brief's is common where briefs are a subject, and `fix/brief-list-order`
  names `list` under the default templates (measured: `doctor` says so, and
  `guard` and both hooks stop on it, as decided above). Refused by
  `premises` too, the pull request of someone who never ran the guard turns
  red over its branch's name, where its premises were judged. Reading no
  round costs nothing here that the guard's refusal protects: no premise is
  excused, which is the stricter answer. So it stands as it was, and is
  measured to: `premises` on that branch, and on a detached head the forge
  names so, answers as on a branch that names nothing.

  A brief spec-brief has archived is not refused by `premises` either,
  whatever names it. Its round is closed and retires no premise, which is
  how it was read and how the branch of a round reads once the round has
  archived its brief: the last commit of every round, whose own CI run must
  not fail for it. Where spec-brief is not installed nothing is known of
  any name, and the run ends as it did, exit 2 on the line that says
  spec-brief is not there.
- **A brief named twice is refused.** `context`, `rulings`, `audit` and
  `probe` take the id as their argument, which came before the flag with no
  word: `audit 1 --brief 999` audited brief 001, exit 0, and
  `context 999 --brief 1` was refused for 999. The two together are exit 2,
  `audit was given the brief twice, as its argument "1" and as --brief
  "999"; give one of them`, whatever they hold, the same id twice included:
  a line with two names for one thing was put together from parts, and
  which part was meant is not the harness's to pick. `SPEC_BRIEF` or the
  branch beside either is the order above, as it was. A variable is set for
  every run, and what is typed for this one comes before it.
- **The line says what named the brief.** `context 999` and `start_round`
  with `{"brief": "999"}` were told `the flag names brief 999`, and neither
  had a flag. A command's argument is `the argument`, and a tool's is said
  as the server says every argument, by its name: `"brief" names brief 999,
  and spec-brief knows no such brief`. So the order is four: the argument,
  `--brief`, `SPEC_BRIEF`, the branch.

`hook claude` reads its line as before (ADR-0005). The first is an exit code
that changed and the second input refused that was accepted: a minor release
(spec-core's ADR-0009).

*Amended 2026-10-19.* **A branch that names a brief no round can work
under fails `doctor`.** The amendment of 2026-10-09 has `doctor` say a
brief no round can work under on its `brief` line, and change nothing of
its exit code for it. *Claimed* by round 24's evaluation of a consumer's
request: a branch that names a brief spec-brief does not list holds every
write, and `doctor` exits 0 for it, where it exits 1 for any other setup
that holds every write. *Measured* through the launcher of 0.19.0
(3c4112c) and of this change, taking turns (Windows 11, Node 24.18.1, Git
for Windows 2.55.0), in a project with spec-brief 0.8.0 and spec-guard
0.26.0 installed and brief 042 its only live brief, the hook handed an Edit
of a file outside the brief's scope:

| What names the brief | The hook, before the write | `doctor` on 0.19.0 | `doctor` now |
| --- | --- | --- | --- |
| the branch `brief/999-nowhere` | exit 2: `the branch names brief 999, and spec-brief knows no such brief. ...` | the same words on its `brief` line; exit 0 | the same; exit 1 |
| the branch `brief/042-done`, brief 042 archived | exit 2: `... which is archived; a closed round writes nothing. ...` | the same; exit 0 | the same; exit 1 |
| the branch `fix/brief-list-order`, which names `list` | exit 2 | the same; exit 0 | the same; exit 1 |
| `SPEC_BRIEF=999` in `doctor`'s environment, on `main` | | the same; exit 0 | the same |
| `doctor --brief 999` on `main`, and `doctor --brief 042` on `brief/999-nowhere` | | brief 999 none, and brief 042; exit 0 | the same |
| a brief's branch, `.spec-brief.json` that is no JSON | exit 2: `cannot check this write: spec-brief could not list the briefs: ...` | `spec-brief could not say whether it knows brief 042: ...`; exit 0 | the same |
| a brief's branch, spec-brief not installed, spec-guard installed | exit 2: `cannot check this write: spec-brief is not installed here: ...` | `brief   042`, and spec-brief `absent`; exit 0 | the same |

So the claim holds, and its premise in part: `doctor` exits 1 for a
hook's line that holds every write (ADR-0005), but the last two rows are
setups that hold every write too, and fail nothing.

- **The branch's name, where it names no brief a round can work under.** A
  brief spec-brief does not know, and one it has archived, held every
  write already, and `doctor` now exits 1 for either where the branch names
  it: the hook reads the same branch, so the setup `doctor` reads is the
  one that holds the session's writes. An archived brief is read with one
  spec-brief does not know, as this ADR's decision reads the two: the
  decision handed over named the first, and the hold is the same, which is
  the branch of a round once its brief is archived.
- **The flag and the variable fail nothing, as before.** The flag is the
  question `doctor` was asked, and names the brief in the branch's place
  for that run alone. `SPEC_BRIEF` is read from `doctor`'s own
  environment, and a value there says nothing of the one a session's hook
  is started with; the test that holds the line of the hook (ADR-0005)
  holds this as well.
- **A write outside every work tree of the repository** is not held by a
  name that is no brief's, whatever names it, nor by a configuration that
  does not load: ADR-0005's amendment of 2026-10-19 that lets a
  configuration that does not load have a write to itself through, in its
  part on a write outside every work tree, has such a write decided as one
  outside the repository is, since no brief decides one. So every write
  this ADR's decision has wait is every write inside the repository's work
  trees, a linked worktree's among them.
- **What the hook does is otherwise not touched**, and `--format json`
  gains no field: `briefProblem` says the name as before, and the exit code is the
  change. CI of the family's documents runs `premises`, not `doctor`
  (spec-core's `docs/adopting.md`), so no pull request turns red for its
  branch's name by this.

An exit code that can change for a tree that passed is a minor release
(spec-core's ADR-0009). What was measured for this and left as it was:

- **A spec-brief that cannot list the briefs, or is not installed, where
  the branch names a brief.** The hook holds every write, `cannot check
  this write`, and `doctor` says the first on its `brief` line and the
  second on the sibling's row, and fails neither while another sibling is
  found. Each is a sibling's state, which the rows of `doctor` judge, and
  neither was decided here.
- **A hook's line that names a brief of its own.** Its brief is the
  line's, and the branch's is not read by the hook; `doctor` judges the
  branch's all the same, so a line `hook claude --brief 042` on a branch
  that names 999 fails `doctor` though no write is held (measured: the hook
  refuses the protected file under 042).

*Amended 2026-10-24.* **The branch that archived its brief fails nothing
in `doctor`.** The amendment of 2026-10-19 has `doctor` exit 1 where the
branch names a brief spec-brief has archived, and accepted "the branch of a
round once its brief is archived" among those on the premise that CI of the
family's documents runs `premises`, not `doctor`. *Claimed* by a consumer
of the family, and evaluated in round 26: a round archives its brief on its
own branch before the branch merges, since a ruling's signature verifies
only on its original commit (ADR-0006), so the head of a round's last pull
request is its archive commit, on a branch that names an archived brief; a
consumer runs `doctor` in CI, and from 0.20.0 every round's last pull
request failed it. *Measured* through the launcher of main (84cb6d7) and of
this change, taking turns (Windows 11, Node 24.22.1, Git for Windows
2.55.0), in a project with spec-brief 0.10.0, whose rounds were archived
with spec-brief's own `archive --base main` on the round's branch before it
merged, as step 10 of spec-core's tutorial does; the hook handed an Edit
inside the brief's scope:

| The branch, and the checkout | The hook, before the write | `doctor` on main | `doctor` now |
| --- | --- | --- | --- |
| `brief/020-compute` at round 020's archive commit, named, or detached with `GITHUB_HEAD_REF`, `CI_MERGE_REQUEST_SOURCE_BRANCH_NAME` or `CI_COMMIT_BRANCH` naming it | exit 2 | exit 1 | exit 0, and a note: archived on this branch, which waits to merge |
| the same, after main is merged into it; and brief 022, written and archived on its branch | exit 2 | exit 1 | exit 0, the same note |
| `brief/007-old`, round 007 merged and its branch used again | exit 2 | exit 1 | exit 1, and a note: archived before this branch |
| `brief/020-compute`, `--base nowhere` | | exit 1 | exit 1, and a note: cannot tell, the base names no commit |
| `brief/020-compute`, the head fetched alone, `main` naming no commit; and a clone of depth 1 | exit 2 | exit 1 | exit 1, cannot tell |
| `brief/021-ahead`, before brief 021 exists, and `fix/brief-list-order` | exit 2 | exit 1 | exit 1, as before |
| `SPEC_BRIEF=020` or `--brief 020` on `brief/020-compute` | exit 2, under `SPEC_BRIEF` | exit 0 | exit 0, and no note |

Every hook's answer is as it was but its words, below: the lines `init`
and the plugin write, before a write and after it, as a session starts and
as a turn ends, and the server's tools, 676 runs, of which the 172 that
differ differ by those words alone, and two by the order the server
answered in. `doctor` on the archive commit took 466 ms, the median of ten,
where main's took 389 (`node -e 0`: 60).

- **What tells the two apart is git, after the base resolves.** Where the
  branch names a brief spec-brief lists as archived, `doctor` asks git
  whether the brief's archived file, its `file` in spec-brief's row, is in
  HEAD and at the merge base of the base and HEAD. In HEAD and not at the
  merge base, the branch archived it, and the round waits to merge: a note,
  and exit 0 for it. At the merge base, the brief was archived before the
  branch, a closed round's branch used again: exit 1 as before. A file
  spec-brief lists that is not in HEAD is an archive not committed, or a
  path git does not name so: neither is this branch's archive. This returns
  to the amendment of 2026-10-11's reading for `premises`, of the branch of
  a round once the round has archived its brief: "the last commit of every
  round, whose own CI run must not fail for it".
- **Any doubt is exit 1, and says it cannot tell.** A base that names no
  commit, or shares no history with HEAD; a history that is shallow, where
  a merge base git finds can be older than the true one, at which the file
  may be absent; a git that cannot read either tree, or cannot say whether
  the history is shallow. `git show`, which answers no file for a file that
  is not there and for a git that failed alike, is not what loosens an exit
  code: a question of its own tells the two apart (`git ls-tree`, read from
  the top, its path as written). A CI job that runs `doctor` fetches the
  base under the name it is configured by, with its history; one that
  fetches the head alone, or `origin/main` alone where the base is `main`,
  fails a round's last pull request as 0.20.0 did.
- **What passes that arguably should not.** A second branch for the same
  id, cut from the round's archive commit before it merged, has the archive
  after its merge base as well, and passes. It is accepted: telling it from
  the round's own branch would need more of the history than one merge base,
  and the hook holds every write on it.
- **The hook holds every write as before.** Nothing it shares with
  `doctor` changes: the brief named, read and refused as it was, and the
  problem every write is held with. Reading the brief as it stood at the
  merge base, where it was live, would have the hook guard by the closed
  round's scope and pass the writes inside it. Its words change on a closed
  round's branch, where there is nothing to fix: before a write, `The round
  is archived and ends when this branch merges: write on the branch of a
  live brief.`, where it said `Fix the brief or the branch before writing.`;
  as a session starts and as a turn ends, the same in their places. Exit 2
  is kept. A brief the flag or the variable names is said as before.
- **A brief spec-brief does not list fails as before.** A branch named
  ahead of its brief, or a round's first commit before its brief is
  written, holds every write, and no round's last commit names one: its
  brief is listed by then, archived.
- `--format json` adds `closedRound`: `null` where the branch names no
  brief spec-brief has archived, and otherwise its `state`
  (`waiting-to-merge`, `archived-before` or `unknown`), the `file`, the
  `mergeBase`, `null` where it is not known, and the note as `detail`. The
  field is added, so no `schemaVersion` moves. `doctor --strict` in CI
  fails all the same where `init`'s hooks are in the settings and no
  `claude` is on `PATH`, since Claude Code's release cannot be told; CI runs
  `doctor` without it.

An exit code that changes for a tree that failed is a minor release
(spec-core's ADR-0009).

*Amended again 2026-10-24.* **A brief the branch names that spec-brief cannot be
asked about fails `doctor`.** The amendment of 2026-10-19 above left a
spec-brief that cannot list the briefs, or is not installed, where the
branch names a brief, to the sibling's row, and failed neither. *Claimed*
by round 25's agents B, F and H: there every write is held, and `doctor`
exits 0. *Measured* through the launcher of main (84cb6d7) and of this
change, taking turns (Windows 11, Node 24.22.1, Git for Windows), in a
project whose brief 001 protects `src/db/**`, with spec-brief 0.8.0 and
spec-guard 0.28.0 installed unless the row says otherwise:

| Setup | The hook, before a write | `doctor` on main | `doctor` now |
| --- | --- | --- | --- |
| `brief/001-rotate`, spec-brief not installed | exit 2: `cannot check this write: spec-brief is not installed here: ...` | `brief   001`, and spec-brief `absent`; exit 0 | `brief   none: spec-brief could not say whether it knows brief 001: spec-brief is not installed here: ...`; exit 1 |
| the same, spec-brief 0.1.0 | exit 2 | `brief   001`, and spec-brief `outdated`; exit 1 | the brief line as above, with the minimum; exit 1 |
| the same, a spec-brief that exits 2 | exit 2: `cannot check this write: spec-brief could not list the briefs: no briefs directory` | `brief   none: spec-brief could not say whether it knows brief 001: ...`; exit 0 | the same line; exit 1 |
| the same, one that prints no JSON, or cannot be started | exit 2 | the line says it; exit 0 | the same line; exit 1 |
| `main`, spec-brief not installed or exiting 2 | no brief named, no write held | exit 0 | exit 0 |
| `main` with `SPEC_BRIEF=001` or `--brief 001`, spec-brief exiting 2 | | the line says it; exit 0 | the same |
| the branch names archived 003 or unknown 404; detached, with and without `GITHUB_HEAD_REF` naming 003; `SPEC_BRIEF=001` or `--brief 1` beside 003 | | | each report and exit byte for byte main's |

So the claim holds.

- **The branch's name, where spec-brief cannot answer for it.** The hook
  asks spec-brief before every write under a name the branch gives, and
  holds each write it cannot ask about: spec-brief not installed, older
  than this release runs, or failing as it lists the briefs. That is a
  setup that holds every write, and `doctor` exits 1 for it. It says why on
  its `brief` line, in the words a failing spec-brief already had there;
  one not installed or too old is said there as well where the branch
  names a brief, as one it could not ask, and its row says it as before.
- **The flag and the variable fail nothing, as before**, for the reasons
  of the amendment above; under them a spec-brief that cannot be run is
  still its row's to say, and the `brief` line gives the id.
- **Where nothing names a brief, spec-brief is asked nothing**, and none
  of this applies.
- **A branch that names an archived or an unknown brief** is not touched by
  this change.

An exit code that can change for a tree that passed is a minor release
(spec-core's ADR-0009).

*Amended 2026-11-02.* **git's hook takes the commit that archives the
round's brief.** The amendment of 2026-10-24 has `doctor` pass the branch
that archived its brief, and the hook hold every write on it, and it read
the hook as Claude Code's. `hook git` reads the same name. *Claimed* by a
consumer of the family, and evaluated: in a repository with git's hook, the
commit of step 10 of spec-core's tutorial is refused, since spec-brief has
moved the brief in the work tree and the move is in the index, where
`doctor`'s reading of HEAD does not reach. That consumer merged first and
archived after, and spec-brief then had no diff to measure the scope by:
`archive/scope-unmeasured`, on a base the commit was already in. *Measured*
with @spec-family/spec-harness 0.22.0 and this change, spec-brief 0.12.0
(Windows 11, Node 24.22.1, Git for Windows 2.56.0), each by a real
`git commit`, on the round's branch, of what is staged:

| Staged | 0.22.0 | Now |
| --- | --- | --- |
| what `spec-brief archive 001 --base main` left, a rename | refused | the commit, and nothing said |
| the same, and a link it rewrote in a live brief | refused | the commit |
| the same move, which git calls a file deleted and a file added | refused | the commit |
| that move and any other file | refused | refused: unstage the rest |
| any file, the archive committed | refused | refused: the round ends when the branch merges |
| a conflict resolved, after `git merge main` | refused | refused |
| the move, `SPEC_BRIEF=001` naming the brief | refused | refused |

- **What tells that commit from the rest is the index, read by `hook git`
  alone.** Where the branch names a brief spec-brief lists as archived, the
  hook asks whether the staged changes bring the file spec-brief lists it
  at, and take away a file of that name: spec-brief keeps the name, and git
  says a rename only of files that read alike, which a short brief under a
  long summary does not. `describeActive` is not touched, so Claude Code's
  hook, `guard` and `check_path` answer as before, and no write of
  spec-brief's reaches them.
- **Beside the move, what spec-brief's archive writes, and nothing else.**
  The archive rewrites the links live briefs hold to the file, so a file
  spec-brief lists as live may be modified in that commit; a brief's file is
  writable throughout a round. Anything else staged holds the commit, with
  the archive named: a closed round's last commit is the archive and no more.
- **A merge that stops on a conflict stays held.** Its resolution is a write
  no round's scope read, and the branch has no brief left to read one by. A
  merge git finishes by itself runs no pre-commit hook. The base is merged
  in before the archive, or a person takes `git commit --no-verify` for it.
- **What passes that arguably should not.** A brief moved into the archive
  by hand reaches the branch without spec-brief's archive having run, and a
  deleted file of the brief's name takes the brief's place in the reading.
  Accepted: the hook is a guardrail, the audit and spec-brief's archive are
  the gates (ADR-0005), and every later write on the branch is held.

An exit code that changes for a tree that failed is a minor release
(spec-core's ADR-0009).

## Consequences

No file records the active brief, so no file can record it wrongly, and two
worktrees on two branches run two rounds without coordinating.
