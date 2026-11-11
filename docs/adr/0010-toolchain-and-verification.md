---
status: accepted
date: 2026-09-26
---

# ADR-0010: Toolchain and verification

## Decision

The family's toolchain (spec-core ADR-0008): Node >= 22, TypeScript 7,
Vitest 4.1, Stryker 10, zero runtime dependencies, native ESM, the strictest
compiler options. spec-core modules are vendored under
`src/vendor/spec-core/` and verified by hash (`tests/vendor.test.ts`); they
are excluded from this repository's coverage and mutation sweeps.

Two suites, as in spec-brief (its ADR-0009): the unit suite (`tests/unit/`)
reads no disk and spawns nothing, and the core mutation sweep holds the pure
modules to it; the integration suite drives git, the sandbox and real sibling
tools in temporary repositories. The mutation `break` is set below the first
full measurement and moves only up.

*Amended 2026-09-27.* The full sweep, `stryker.config.mjs`, has a job of its
own. `.github/workflows/mutation.yml` runs it weekly and on request (Actions,
Mutation, Run workflow, with `full` ticked), builds `dist/` first for the
integration tests that spawn the command line, and uploads its report; the
core sweep stays a job in `ci.yml`, on every change. The full sweep runs the
whole suite but `tests/source.test.ts`, which reads the repository as it is
on disk and Stryker's sandbox is not, and writes `// @ts-nocheck` into the
harness's own modules alone: a vendored file given it no longer has the hash
`tests/vendor.test.ts` holds it to, and spec-brief's first hosted full sweep
stopped at its initial test run on exactly that. Its `break` stays `null`
until a hosted run has been measured, then sits below that measurement and
moves only up.

The first hosted full sweep, on 3b04262 (run 36316697866), measured **90.74%
over 6,466 mutants** in 69 minutes: 5,809 killed, 58 timed out, 483 survived,
116 without coverage. Losing every timeout kill would leave 89.84%, so the
full sweep's `break` is 89. It sits below the core sweep's 97 because it also
mutates the modules the core sweep leaves out, and the lowest scores are
theirs: `sandbox.ts` 33.33, 43 of its mutants reached by no test on Linux,
`plugin.ts` 62.22, `server.ts` 70.65, `git.ts` 77.63 and `round.ts` 79.95.
Those, the 116 mutants no test reaches and the 483 survivors are where the
number moves up from.

*Amended 2026-10-01.* `mutation.yml` runs the full sweep in eight shards,
each mutating its own files against every test, and a job after them merges
the reports and applies the `break` once, to the merged score; a shard is
not a score. It is still the sweep a single run would make: every test but
`tests/source.test.ts` and the merge's own, in every shard, with the same
`timeoutMS` and `break`, and `npm run test:mutation:full` still runs it in
one process. The merge, `scripts/mutation-shards.mjs`, is spec-core's (its
ADR-0007), with its tests: it refuses a missing shard, a shard reported
twice, a file mutated by two shards or by one it does not belong to, a
listed file its shard did not report, a shard that ran with other patterns,
and shards that ran different tests, matching tests by file and name. An
unset or unknown shard is an error when the shard configuration loads, never
a run over everything, and a file no shard lists is mutated by the last.

*Amended again 2026-10-01.* After the survivors of the full sweep were
worked through, main's sharded sweep of c385f19 (run 36743578103) measured
**97.42% over 7,717 mutants**: 7,438 killed, 80 by timeout, 168 survived and
31 without coverage. Losing every timeout kill would leave 96.38%, so the full
sweep's `break` rises from 89 to 95, under that worst case as before, and
still moves only up. The shards took from 5m54s to 24m47s. For 0.10.0 the sweep of
16f3a8e (run 37622048228) read 97.56% over 7,877 mutants, 96.41% with every
timeout lost, and the `break` stays 95. For 0.10.1 the sweep of b1c0f70 (run
37662090669) read 97.47% over 7,897 mutants, 96.48% with every timeout
lost, and the `break` stays 95. For 0.11.0 the sweep of a572d9d (run
37703230719) read 97.49% over 7,996 mutants, 96.54% with every timeout
lost, and the `break` stays 95. For 0.11.1 the sweep of a2a0596 (run
37791578721) read 97.47% over 8,024 mutants, 96.44% with every timeout
lost, and the `break` stays 95; three of its shards took from 31 to 36
minutes, where the table in `scripts/mutation-shards.mjs` was balanced for
14, so the table is to be measured again. For 0.12.0 the sweep of d8a7e8b
(run 37834817671), in the order and on the table of the 2026-10-09
amendment below, read 97.48% over 8,212 mutants, 96.43% with every timeout
lost, in shards of 13m34s to 16m57s, and the `break` stays 95. For 0.13.0
the sweep of 618dff0 (run 38127053349) read 97.49% over 8,290 mutants,
96.45% with every timeout lost, in shards of 12m27s to 17m51s, and the
`break` stays 95. One mutant it left had been counted killed for 0.12.0:
`'hex'` made empty where the copy of the signers is named
(`src/round.ts`), which the comment beside it has as equivalent. The file
is then named by the digest's bytes, and a path refuses a NUL among them,
so a sweep counts it killed now and then, as 0.12.0's did and those of
0.11.0 and 0.11.1 did not. For 0.14.0 the sweep of 36a6c8e (run
38144471044) read 97.51% over 8,355 mutants, 96.48% with every timeout
lost, in shards of 12m24s to 17m00s, and the `break` stays 95: it has 65
mutants more than 0.13.0's and 65 more killed, and its 177 survivors and
31 without coverage are 0.13.0's, mutant for mutant. For 0.15.0 the sweep
of 3c3b1f1 (run 38174911926) read 97.51% over 8,778 mutants, 96.56% with
every timeout lost, in shards of 12m16s to 19m22s, and the `break` stays
95. It is the first for a release since nothing a mutator reads stands
under an `as` (the amendment of 2026-10-12): its 188 survivors are
0.14.0's 177, the ten equivalents that amendment records, and the body of
`literal()` in `src/literal.ts`, which is neither. With that body emptied
every table built through it is nothing, each module that reads one
throws as it loads, and a file that does not load is no failure to a
sweep. The sweep of the change itself had killed it through a test of
`configure.ts`; that test's file loads `usage.ts` since `doctor` reads a
hook's line, and no longer runs under the mutant.
`tests/unit/literal.test.ts`, added with the release, loads the function
alone and fails for it, which the release's core sweep shows. For 0.16.0
the sweep of d8edba0 (run 38205988813) read 97.58% over 9,105 mutants,
96.67% with every timeout lost, in shards of 12m39s to 21m01s, and the
`break` stays 95. It has 327 mutants more than the sweep taken once every
test stood alone (run 38198901681, in the amendment of 2026-10-12 below),
which are what `doctor` and `init` now read of the hook, and 189
survivors to that sweep's 185. One of the 185 moved with its function,
from `cli.ts` to `round.ts`. Two of the new ones are equivalent and said
beside their code: the default of `isHook` in `mergeClaudeSettings`, and
the check of a line's state in `hookLineHere`. Two were neither, both in
`init`'s plan (`setup.ts`), which only the full sweep reaches. Under one,
what `doctor` has of a line is joined with nothing between, which shows
only where a line has two things said of it, and no test read both.
Under the other, a file with two lines of the hook, one that turns the
guard off and one that guards, is `keep` where it is `advise`, and no
test had such a file. `tests/integration/init.test.ts` has a test for
each, added with the release; written into the source by hand, each
mutant fails its test and no other of that suite.

For 0.17.0 the sweep of 262d53b (run 38258557802) read 97.69% over 9,483
mutants, 96.73% with every timeout lost, in shards of 12m21s to 17m59s, and
the `break` stays 95. It ran by itself, for the push that brought the last
of the release's changes to main, as each of those changes was swept as a
pull request before it merged (the third amendment of 2026-10-12, below). It
has 378 mutants more than the first sweep after 0.16.0 (run 38227824081, of
43518f7, whose source is that release's), all in the seven modules the
release changed, `configure.ts` with 238 of them, and 188 survivors to that
sweep's 187, with the same 31 without coverage. The one survivor that is new
is equivalent and said beside its code: the list of plugin directories that
`claudeCodeWiring` makes for an id that names no marketplace, which nothing
reads. The sweep of the pull request that brought it had named it before the
merge, and the sweeps of the release's other three changes named none. From
this release the figure is recorded here alone: the comment in
`stryker.config.mjs` that held it made a release's pull request, and its
push, run the sweep for that one edit.

For 0.18.0 the sweep of cf11ffb (run 38555334383) read 97.82% over 9,817
mutants, 97.03% with every timeout lost, in shards of 12m22s to 17m24s, and
the `break` stays 95. It has 334 mutants more than 0.17.0's sweep (run
38258557802, of 262d53b), all in the nine modules the release changed,
`configure.ts` with 151 of them, and 185 survivors and 29 without coverage
to that sweep's 188 and 31. Not one undetected mutant is new. Five of
0.17.0's are gone: two in `checkPaths`, killed now that reading the rulings
for every write loads the reader, which `tests/integration/loads.test.ts`
sees; two of the platform check that `gitHook` no longer makes; and
`${root}/.git` in `workspace.ts`, covered now by a test of `core.worktree`.
Each of the release's three pull requests, the two that changed a source
and the one that changed the sweep, was swept before it merged, and each
ended with no undetected mutant new against main's.

For 0.19.0 the sweep of 74dac98 (run 39160139131) read 97.89% over 10,480
mutants, 97.08% with every timeout lost, in shards of 15m31s to 25m47s, and
the `break` stays 95. It has 663 mutants more than 0.18.0's sweep (run
38555334383, of cf11ffb), all in eleven of the twelve modules the release
changed (`types.ts` holds none), `cli.ts` with 227 of them, and 195
survivors and 26 without coverage to that sweep's 185 and 29. The 21
undetected mutants new against it are each in code the release wrote and
each said equivalent beside its code, as the sweep of the pull request that
brought it had named it before the merge. Fourteen of 0.18.0's are gone:
nine in `setup.ts`, where advice for a pre-commit hook it cannot tell is now
held by tests of an unreadable hook file; three in `branch.ts`, which the
release did not change, killed by its new tests of branch names; one in
`git.ts`, whose list of branches is now read by name and by ref; and `'hex'`
in `round.ts`, which its comment says is counted killed now and then. Each
of the release's six pull requests that changed a source or the sweep was
swept before it merged, and each ended with every undetected mutant new
against main's killed or said equivalent.

For 0.20.0 the sweep of 3a1dad8 (run 39334835801) read 97.81% over 11,571
mutants, 97.11% with every timeout lost, in shards of 17m52s to 37m09s, and
the `break` stays 95. It has 1,091 mutants more than 0.19.0's sweep (run
39160139131, of 74dac98), in the fourteen modules the release changed,
`fs.ts` with 216 of them and `server.ts` with 183, and 227 survivors and 26
without coverage to that sweep's 195 and 26. Of the 37 undetected mutants
new against it, 34 are of this release's own lines, each said equivalent
beside its code, as the sweep of the pull request that brought it had named
it before the merge: the kept answers and their pruning in `fs.ts`,
`siblings.ts` and `hooks.ts`, the walk of the work trees in `workspace.ts`
and the server, the write outside every work tree in `fs.ts` and `cli.ts`,
the turn's report in `setup.ts`, and `sandbox.ts`'s spawn, which gained its
time limit. The other three are `branch.ts`'s, which the release did not
change: 0.19.0's sweep counted them killed, and this record said a test of
branch names had killed them, but they survive here and in every pull
request's sweep of the release, so they are decided by the order tests run
in, not by a test. Five of 0.19.0's are gone, three of them lines that moved
from `cli.ts` and `sandbox.ts` and are counted again where they stand. Each
of the release's seven pull requests that changed a source was swept before
it merged, and each ended with every undetected mutant new against main's
killed or said equivalent.

For 0.21.0 the sweep of e8a2c5f (run 40157462678) read 97.81% over 11,973
mutants, 97.06% with every timeout lost, in shards of 19m33s to 45m05s, and
the `break` stays 95; the release's last commit, #128, moved the spec-brief
the suite installs and no source, and was not swept. It has 402 mutants more
than 0.20.0's sweep (run 39334835801, of 3a1dad8), in nine of the modules
the release changed, `cli.ts` with 118 of them and `configure.ts` with 76,
and 235 survivors and 27 without coverage to that sweep's 227 and 26. Of the
9 undetected mutants new against it, 8 are of this release's own lines, each
said equivalent beside its code, as the sweep of the pull request that
brought it had named it before the merge: five of the reading of a path as
the system writes it in `fs.ts`, equivalent on Linux, where the sweep runs,
and killed by hand on Windows; the two empty lists `findActive` is given in
`server.ts` where nothing names a brief or every path is outside; and
`branch: false` in `round.ts` where spec-brief is not there under the
branch's name, where `holds` fails `doctor` already. The ninth is
`round.ts`'s `'hex'`, which the release did not change and its comment says
is counted killed now and then. None of 0.20.0's is gone. Each of the
release's seven pull requests that changed a source or the integration suite
was swept before it merged, and each ended with every undetected mutant new
against main's killed or said equivalent.

For 0.22.0, the first release as `@spec-family/spec-harness`, the sweep of
c7c8100 (run 41202882905) read 97.85% over 12,159 mutants, 97.17% with every
timeout lost, in shards of 20m39s to 46m25s, and the `break` stays 95. It
has 186 mutants more than 0.21.0's sweep (run 40157462678, of e8a2c5f), in
the three modules that took the move's lines, `configure.ts` with 156 of
them and `setup.ts` with 29, and 234 survivors and 27 without coverage to
that sweep's 235 and 27. No undetected mutant is new against it, and one of
its is gone: `round.ts`'s `'hex'`, which its comment says is counted killed
now and then. The release's one pull request was swept before it merged, and
ended with no undetected mutant new against main's.

For 0.23.0 the sweep of 8960e5f (run 41449993320) read 97.87% over 12,248
mutants, 97.19% with every timeout lost, in shards of 19m22s to 36m42s, and
the `break` stays 95. It has 89 mutants more than 0.22.0's sweep (run
41202882905, of c7c8100), in the modules git's hook took, `hooks.ts` with 53
of them, `cli.ts` with 24 and `configure.ts` with 12, and the same 234
survivors and 27 without coverage, mutant for mutant. The release's one pull
request was swept twice before it merged: the first sweep found 19
undetected mutants new against main's, 17 of them in a path of `cli.ts` that
only a real `git commit` reached, through the built script in a process of
its own where no mutant runs, and the second, with that path asked in
process and the equivalent one written away, none.

For 0.24.0 the sweep of cc9cab1 (run 42513980035) read 98.00% over 12,601
mutants, 97.37% with every timeout lost, in shards of 9m34s to 47m53s, and
the `break` stays 95. It has 353 mutants more than 0.23.0's sweep (run
41449993320, of 8960e5f): `configure.ts` with 188 of them, what `doctor`
reads of the plugin, of the package its hooks run and of a line it cannot
check, `cli.ts` with 73 and `round.ts` with 64, and 40 fewer in `branch.ts`,
read without index bounds. Of 0.23.0's 234 survivors and 27 without
coverage, 11 survivors are gone: nine in `branch.ts` and the signers' copy
named by sixteen characters of its digest, which no clock or chance decides
now (amended 2026-11-08, below), and the empty list of plugin directories in
`round.ts` for an id that names no marketplace, an equivalent mutant until
the plugin's versions were read from that list. Two are new, the `branch`
and `holds` an empty `--brief` gives in `diagnoseBrief`, `false` made
`true`: equivalent, as the comment beside them says, since `doctor` fails a
`--brief` given nothing and reads neither for it. Each of the release's six
pull requests was swept before it merged, and each ended with no undetected
mutant new against main's but those two.

For 0.24.2, the first release swept on vitest 5, the sweep of b32c85b (run
42970849086) read 98.00% over 12,601 mutants, 97.41% with every timeout
lost, in shards of 11m07s to 35m46s, and the `break` stays 95. Its 252
undetected mutants are 0.24.0's, mutant for mutant, and none survived
having run no test. The core sweep of b32c85b (run 42970848876) read 98.69%
over 7,305, as it did on vitest 4. 0.24.1 changed documents alone, and no
sweep ran for it.

For 0.25.0, which adds `audit --if-round`, knows Azure Pipelines and
Jenkins as runners and copies spec-core at 92e46d4, the sweep of ac40ca6
(run 43076735805) read 98.01% over 12,686 mutants, 97.41% with every
timeout lost, in shards of 10m15s to 44m42s against their 60, and the
`break` stays 95. Its 252 undetected mutants are 0.24.2's, mutant for
mutant, and none survived having run no test. The core sweep of ac40ca6
(run 43076735879) read 98.69% over 7,334, its 96 undetected 0.24.2's.

One runner took 69 to 130 minutes for the full sweep. Before any sharded
sweep ran, the report of eb39599 was cut into shards the way Stryker writes
them and put back by the merge: all 7,507 verdicts came back with their
tests, and its 91.18%.

**Where the minutes went.** spec-core's shards were quicker than its single
run because a shard instruments only its own files, and its suite spent most
of its time in instrumented code. This suite spends it in git and the
sibling tools: it ran in 61 seconds in every shard, as in the single run, so
a file took the same minutes in a shard as in the single run, and a shard's
minutes are its files' added up (`scripts/mutation-timeline.mjs` reads them
off a log). `server.ts` takes 13 to 14 minutes on its own, most of them
static mutants, each of which runs the whole suite, so no shard finishes
sooner; eight shards come within a few minutes of it, and more would wait on
it. The table is balanced on the mean of the first two sharded sweeps, at
13.7 to 14.5 minutes a shard; the same shard moved by up to four minutes
between runners.

| Run | Layout | Score | Mutants | Killed | Timed out | Survived | No coverage | Took |
| --- | --- | --- | --- | --- | --- | --- | --- | ---: |
| 36708096066 | one job | 92.94% | 7,665 | 7,041 | 83 | 455 | 86 | 2h10m |
| 36709265748 | eb39599's minutes | 92.95% | 7,665 | 7,045 | 80 | 454 | 86 | 22m10s |
| 36711848267 | the first sharded sweep's | 92.95% | 7,665 | 7,047 | 78 | 454 | 86 | 19m52s |
| 36714214575 | the mean of the two | 92.95% | 7,665 | 7,046 | 79 | 454 | 86 | see below |

All four are of 82d1817's code and tests, the sharded ones dispatched on the
branch that brought the shards and timed from the first shard starting to
the merged score. Mutant by mutant the sharded sweeps differ from the single
run only by three to five mutants that timed out there and were killed in a
shard, and one survivor killed in each, as a faster runner differs from a
slower one. In the third, one shard's runner lost contact with GitHub after
49 minutes, and the merge refused the sweep, as it should; re-running that
job alone took 16 minutes, and the merge scored the sweep from its report
and the other seven shards' of the first attempt, whose slowest had ended
18 minutes after the start.

The core sweep in `ci.yml` stays one job. It takes 6 to 8 minutes, the
longest of CI's jobs, of which a minute and a half is the start every
shard would pay again; split, it would add jobs to every change to save a
few minutes.

**The split left the `break` at 89**; the sweep of c385f19, above, moved it
to 95.

*Amended 2026-10-07.* **Vitest stays on 4 until Stryker's runner reads 5.**
(*Amended 2026-11-09*: the hold is lifted, by the steps below; the
amendment of that date has what the two sweeps read.)
The Decision's "Vitest 4.1" was the family's choice of a line that had
aged; it is now a hold with a cause. On vitest 5,
`@stryker-mutator/vitest-runner` 10.0.0, the newest there is, runs no test
against a mutant a test covers and scores it as survived, with every test
green: vitest 5 matches a test's name with ` > ` between its suites, and the
runner asks for the tests of a mutant by names joined with a space
([stryker-js #6210](https://github.com/stryker-mutator/stryker-js/issues/6210),
open). The evidence is spec-guard's, which met this on 2026-09-07 and pinned
vitest then
([its ADR-0003](https://github.com/spec-family/spec-guard/blob/main/docs/adr/0003-mutation-testing.md)).
On 2026-10-06 Dependabot proposed vitest 5.0.0 (pull request 45), and the
core sweep measured it:

| Vitest | Run | Score | Mutants | Killed | Timed out | Survived | No coverage |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4.1.11, main at 94203e3 | 37555884370 | 98.13% | 4,871 | 4,752 | 28 | 87 | 4 |
| 5.0.0, pull request 45 | 37528943599 | 3.83% | 4,862 | 186 | 0 | 4,672 | 4 |

spec-core's sweep of the same bump read 4.00%, where its main reads 96.36%.
The core sweep is the only one a pull request runs here, and it failed
with a score and no reason, on a pull request whose every test had passed.

So `.github/dependabot.yml` proposes no major of `vitest` or of an `@vitest`
package, and `tests/source.test.ts` fails when `package.json` admits a
vitest that is not a 4, with the issue and this amendment in its message: a
bump made by hand fails `npm test` with its reason. Minors and patches of 4
still come, and a security update is not held back.

The hold is the family's and is lifted in spec-core first, by the steps in
[its ADR-0008](https://github.com/spec-family/spec-core/blob/main/docs/adr/0008-toolchain.md)
(amended 2026-10-07), which also records what vitest 4 still receives while
it is held. When the bump comes here, its pull request's core sweep
measures it; dispatch `mutation.yml` on the branch as well, for the modules
the core sweep leaves out, and hold both to that ADR's two conditions
before merging.

*Amended 2026-10-08.* **A run of the suite works in a temporary directory of
its own.** On 2026-10-07 one workstation's temporary directory held 998
directories of the suite's making: 874 `spec-harness-test-*`, the
repositories its tests make, and 124 `spec-harness-*`, worktrees of the
sandbox, of which every one that still said whose it was, 104, was a test
repository's. Measured there, each with a temporary directory given to the
run and empty at the start:

| Run, on main at 10f0e8b | Left behind |
| --- | --- |
| 18 of the 19 integration files, every test passing | nothing |
| `sandbox.test.ts` with 17 of its tests timing out | 4 worktrees of the sandbox |
| four files, the run ended after 45 seconds as an agent's is | 86 directories of the tests |

So a run that ends leaves nothing unless a sandbox test fails while its
worktree is in use, and a run that is ended leaves all it had made.
`vitest.config.ts` now has every run start in `tests/temporary.ts`, which
makes one directory with the suite's prefix in the system's temporary
directory and names it, in `TMPDIR`, `TMP` and `TEMP`, as the temporary
directory to everything the run starts: the tests, the sandbox under test,
and git and node under those. The run removes it when it ends, with whatever
a failed test left in it: the timed-out run above then leaves nothing, and
the ended one leaves one directory. Before it makes its own, a run removes
the directories earlier runs left: those with the suite's prefix, directly
in the system's temporary directory, that nothing was added to or taken from
for a day. No run lasts a day; a watch left idle for one loses its directory
to the next run and is started again. A link is never followed, and the
sandbox's own prefix is never removed, since a person's `probe` makes
directories with it on the same machine.

One directory for the whole run was chosen over each file clearing up after
the others because only it holds what a test did not make itself: a worktree
the sandbox made carries the sandbox's prefix, which the suite may not
remove from the system's temporary directory. The mutation sweeps run
without it, as before, on a runner that is thrown away, and
`tests/mutation-shards.test.ts` still holds their configuration to this
one's files and timeouts.

*Amended 2026-10-09.* **The shards measured again: a static mutant costs the
test files that run before its killer.** Three shards of 0.11.1's sweep took
31 to 36 minutes on a table balanced for 14. The logs and reports of the
nine sharded sweeps were read again, shard by shard, with
`scripts/mutation-timeline.mjs`. The minutes are the eight shards' added up,
and a static mutant is killed late when a test file other than its killer's
had run to its end first:

| Run | Source | Tests | Initial run, a shard | Mutants not static | Static mutants | Killed late | Survived | Timed out | Slowest shard |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 36709265748 | 82d1817 | 759 | 60 to 62 s | 41 min | 78 min | 158 of 1,139 | 73 | 15 | 21m53s |
| 36711848267 | 82d1817 | 759 | 46 to 62 s | 37 min | 72 min | 150 | 73 | 15 | 18m21s |
| 36714214575 | 82d1817 | 759 | 50 to 65 s | 40 min | 76 min | 165 | 73 | 15 | 18m21s |
| 36743578103 | c385f19 | 829 | 57 to 77 s | 38 min | 66 min | 151 of 1,141 | 30 | 16 | 24m47s |
| 37307780901 | c385f19 | 829 | 55 to 76 s | 36 min | 73 min | 159 | 30 | 16 | 23m56s |
| 37622048228 | 16f3a8e | 984 | 66 to 88 s | 40 min | 89 min | 162 of 1,179 | 23 | 26 | 26m49s |
| 37662090669 | b1c0f70 | 1,073 | 90 to 114 s | 38 min | 93 min | 179 | 30 | 16 | 25m06s |
| 37703230719 | a572d9d | 1,114 | 97 to 119 s | 43 min | 103 min | 168 of 1,182 | 28 | 16 | 32m37s |
| 37791578721 | a2a0596 | 1,128 | 105 to 141 s | 49 min | 134 min | 181 of 1,183 | 28 | 13 | 36m29s |

The first three ran 82d1817's code on the branch that brought the shards,
and 37307780901 ran c385f19's on the commit that released it. The mutants
that are not static took what they took when the table was made. The static
ones came to take nearly twice as long, with 44 more of them. The table's
own premises had gone as well: `server.ts`, given a shard for its 13
minutes, has taken 2.4 to 3.2 since its 15 static survivors were killed, and
the last shard, put at 12 to 14 minutes, took 25 in the sweep of c385f19.

**Where a static mutant's minutes go.** Stryker's vitest runner runs a
mutant's test files one after another in one worker and stops at the first
test that fails; a static mutant's files are all of them. Vitest runs first
the file that failed in the worker's last run, then the longest. So a static
mutant killed by the file that killed the one before it costs a second or
two, and any other runs `tests/integration/sandbox.test.ts` first, then the
audit, probe and rulings tests, until it reaches its killer: a mutant only a
unit test kills waits for nearly the whole suite. The reports say how many
tests each mutant had completed when it was decided, and those killed late,
about one in seven, had completed 206 to 296 of them on average. Fitted to
each file's static minutes in the four sweeps from 16f3a8e to a2a0596 (108
readings, R-squared 0.88), a mutant killed late cost 0.7 of an initial run, a
survivor 1.6 and a timeout 2.4, in worker-seconds with four workers busy,
and one killed in the first file under 3 seconds: the mutants killed late
took 53% of the static minutes, the survivors 19%, the timeouts 17%, and the
four in five killed at once 10%. Which mutants are killed late is an
accident of which worker ran which mutant last: `workspace.ts`, unchanged,
had 8 of them in one sweep and 20 in the next, and took 3.8 and 13.6
minutes.

**What the suite costs.** An initial run is the suite, once, and it doubled.
CI's test step on Ubuntu spent 76 seconds in tests at 82d1817, 96 at
16f3a8e, 102 at b1c0f70, 107 at a572d9d and 124 at a2a0596. Of the 48 it
grew by, 35 are `tests/integration/sandbox.test.ts`, from 10.8 seconds and
26 tests to 45.6 and 46, and 7 are `tests/integration/probe.test.ts`. At
a2a0596 eleven tests took three seconds or more, 43 seconds between them,
and ten were in `sandbox.test.ts`: eight took the three seconds of the
sandbox's bound, and two ran the built command line through a timeout and
the bound, 14.6 seconds that no mutant is covered by.

**No test leaves the run; its files run the quickest first.**
`vitest.mutation.config.ts` gives the sweep an order of its own: the file
that failed in the worker's last run first, as vitest has it, then the
quickest, and a file the worker has not run yet after those it has, the
smaller first. A mutant survives when every file has passed, in any order,
so the sweep proves what it proved. The sweep of effd817 (run 37810898544)
is 0.11.1's source and table with the order alone changed:

| Shard, by the table of 2026-10-01 | Vitest's order, run 37791578721 | The quickest first, run 37810898544 |
| --- | ---: | ---: |
| `server.ts`, `guard.ts` | 5m19s | 4m02s |
| `round.ts`, `host.ts`, `premises.ts` | 19m30s | 17m29s |
| `siblings.ts`, `reader.ts`, `context.ts` | 26m44s | 19m17s |
| `git.ts`, `sandbox.ts` | 27m01s | 23m28s |
| `branch.ts`, `rulings.ts`, `hooks.ts` | 31m22s | 16m56s |
| `commands.ts`, `workspace.ts` | 23m47s | 10m01s |
| `signers.ts`, `config.ts`, `cli.ts`, `probe.ts`, `briefs.ts` | 34m34s | 11m46s |
| the rest | 36m29s | 13m10s |
| Static mutants, the eight shards | 134 min | 57 min |
| Mutants not static | 49 min | 38 min |
| Static mutants killed late | 181 | 135 |
| Score | 97.47% over 8,024 | 97.47% over 8,024 |
| Killed, timed out, survived, no coverage | 7,738, 83, 172, 31 | 7,739, 82, 172, 31 |

The survivors are the same 172. Twenty-one mutants moved between killed and
timed out, ten one way and eleven the other, where two sweeps of the same
code in vitest's order differed in four verdicts and in six; with every
timeout lost the sweep would read 96.45%. By the same fit on the two sweeps
of that source in the new order, a mutant killed late costs 0.3 of an
initial run, and survivors and timeouts, which run the whole suite in any
order, take 57% of the static minutes that are left.

The tests that wait out a bound stay in the run. They share a file with the
tests that cover `sandbox.ts`, so the configuration could leave them out
only by their names; and in each of the two sweeps before the order changed
the tests of three seconds or more were the recorded killer of three
mutants, all in `sandbox.ts`, and the only cover of one. With the quickest
first they run last, and a static mutant pays for them when it survives,
when it times out, or when nothing else kills it. What they still cost is
their 43 seconds in every shard's initial run and in every static survivor
and timeout, 28 and 17 a sweep: by the fit, about 16 of the 116 minutes the
eight jobs took. Making them cheaper is a change to the tests, a bound they
need not wait out or a file of their own, and not to the sweep.

**The table.** Two sweeps of a475910's source ran the quickest first: effd817
on the table of 2026-10-01, above, and d340a82 on a first table made from
its minutes (run 37818344640, 97.48% over 8,024). The files took 95 minutes
between them both times. That first table had `config.ts` with `branch.ts`
and `reader.ts`, and its shards took 12m12s to 18m05s where it had them at
14 to 15: the shard of `branch.ts`, fifteen static survivors in it, took
15.2 minutes for its files where the others took 9.7 to 12.7. The timeline
had charged `branch.ts` too little. It reads a file's minutes off the count
of mutants tested, and the count runs on into the next file while a worker
is still on a survivor, so a file is charged for the survivors of the file
before it in its shard: `config.ts` took 0.8 minutes after `cli.ts` and 3.4
after `branch.ts`. A shard's own minutes are the measure, and the table
moved `config.ts`, `hooks.ts` and `guard.ts` on that sweep's. The sweep of
226dfe8 (run 37821498621) is that table on 08b8ab4, which changes
`sandbox.ts` and `commands.ts` and has 28 more mutants and 8 more tests:

| Shard | Its files' minutes in runs 37810898544 and 37818344640 | In run 37821498621 | Its job |
| --- | ---: | ---: | ---: |
| `round.ts` | 12.4, 11.4 | 11.9 | 15m11s |
| `siblings.ts` | 12.0, 12.0 | 11.0 | 13m36s |
| `sandbox.ts` | 11.3, 12.7 | 13.0 | 15m21s |
| `git.ts`, `premises.ts`, `host.ts`, `briefs.ts`, `hooks.ts`, `guard.ts` | 12.6, 11.1 | 10.4 | 12m46s |
| `branch.ts`, `reader.ts` | 11.3, 11.7 | 13.3 | 16m05s |
| `rulings.ts`, `commands.ts` | 11.2, 11.0 | 9.3 | 12m10s |
| `cli.ts`, `signers.ts`, `workspace.ts`, `server.ts`, `probe.ts`, `config.ts` | 12.9, 13.2 | 11.2 | 14m01s |
| the rest | 11.3, 12.1 | 12.8 | 16m48s |

It read **97.48% over 8,052 mutants**: 7,760 killed, 89 by timeout, 172
survived and 31 without coverage, 96.37% with every timeout lost, and the
`break` stays 95. In the files 08b8ab4 leaves alone, four verdicts differ
from the sweep before. The files took 93 minutes and the eight jobs 116,
where 0.11.1's took 183 and 205, and the sweep had its merged score 17
minutes after it was dispatched, where 0.11.1's had it after 38. A job takes
two to four minutes more than its files: its setup, and its initial run of
the suite, 107 to 131 seconds in that sweep. The shard of `rulings.ts` and
`commands.ts` has room, and the last shard is where the next file to move
is.

Between sweeps of the same code, in vitest's order and on one table
(c385f19, runs 36743578103 and 37307780901), a shard moved by up to 6m05s
and a file by up to 3.4 minutes, and the files took 104 and 109 minutes in
all. No two sweeps in the new order had the same code and table. The shards
of `round.ts` and `siblings.ts` and the last, whose files 08b8ab4 leaves
alone, took 14m50s, 14m44s and 14m55s in the sweep of a475910's source and
15m11s, 13m36s and 16m48s in that of 08b8ab4's. The runners differ by as
much: the initial run took 108 to 133 seconds across the eight shards of one
sweep.

`tests/mutation-shards.test.ts` holds the order: the failed file first, the
quickest after it, a file never run after those, the keys vitest's own
sequencer reads, and `npm test` left with vitest's order.
`scripts/mutation-timeline.mjs` prints the three counts above beside each
file's minutes, so the next measurement reads them off a report. A shard
that keeps passing 22 minutes, half as long again as the table has it, is
the sign to measure again; so is a suite that has grown, since every static
mutant that survives runs all of it.

*Amended 2026-10-12.* **Nothing a mutator reads stands under a TypeScript
`as`.** Stryker 10.0.0 makes no mutant of anything under an `as`
expression. Its transformer skips every node it takes for a type
(`shouldSkip` in the instrumenter's `transformers/babel-transformer.js`),
and the list it asks (`isTypeNode`, `util/syntax-helpers.js`) holds
`TSAsExpression`: the whole expression is passed over, the value with the
type. `satisfies` and `!` are not on the list. So a table written
`{ ... } as const` was not mutated, nor the `i - 1` of
`lines[i - 1] as string`, and a sweep's score said nothing of either.

Counted on the report of 0.14.0's sweep (run 38144471044), each source read
with the parser Stryker reads it with: 87 outermost `as` expressions, 29
with a place a mutator applies under them, 198 such places, and not one of
the 8,355 mutants inside an `as`. 143 of the places were in
`src/usage.ts`, beside the 119 mutants the sweep made of that file: the
tables that decide which options each command reads, which arguments it
takes and what it says of a value that names nothing were written
`as const`, and no sweep had mutated a word of them.

Each of the 29 was rewritten so that what a mutator reads stands outside
the assertion, with the types the compiler sees as they were:

| Way | Sites |
| --- | ---: |
| `literal()`, a function with a `const` type parameter that returns its argument (`src/literal.ts`): the four tables of `usage.ts`, and `PARTS` in `configure.ts` | 5 |
| `!`, where the assertion only said an index or a match is there | 9 |
| a type on the declaration, where the value is `any` or a list of text | 7 |
| the value hoisted, and the assertion on its name | 6 |
| the value hoisted, where narrowing then needs no assertion | 1 |
| `satisfies`, for the signals the sandbox listens to | 1 |

`satisfies` alone, as `parseOptions` has its table, does not do for the
tables of `usage.ts`: `Command` and `ValuedOption` are `keyof typeof`
them, so `dist/usage.d.ts` declares them, and without the const assertion
every literal type there widens and every `readonly` goes. A `const`
type parameter reads its argument as the assertion did. The compiler was
asked of each of the five tables whether it has the type it had, and it
has; every declaration file is byte for byte what it was but
`dist/usage.d.ts`, which differs in the quote the emitter prints a string
literal type with and in nothing else; and the emitted JavaScript differs
by the hoisted constants, the calls of `literal()` and comments.

| Sweep | Run | Source | Score | Mutants | Killed | Timed out | Survived | No coverage |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| core, before | 38146456905 | f8b1fb6 | 98.22% | 5,238 | 5,117 | 28 | 89 | 4 |
| core, after | 38160629865 | 7b22db2 | 98.19% | 5,429 | 5,303 | 28 | 94 | 4 |
| full, before | 38144471044 | 36a6c8e | 97.51% | 8,355 | 8,061 | 86 | 177 | 31 |
| full, after | 38160632452 | 7b22db2 | 97.47% | 8,564 | 8,256 | 91 | 186 | 31 |

f8b1fb6 is 36a6c8e with the version of 0.14.0 and no other change to the
sources. Mutant for mutant, a mutant being its file, its mutator, the text
it replaces and what replaces it: of the core sweep's mutants 5,194 are in
both, each with the verdict it had; 235 are new, 228 killed, 2 timed out
and 5 survivors; and 44, of the lines rewritten, are gone. Of the full
sweep's, 8,281 are in both, 283 are new, 268 killed, 5 timed out and 10
survivors, the core sweep's five among them, and 74 are gone. `usage.ts`
went from 119 mutants to 262, and its two survivors are the two it had.

The ten survivors are equivalent, and each is said beside its code:

| Where | Mutated | Replacement | Why it reads the same |
| --- | --- | --- | --- |
| `signers.ts`, a key type or a key | `/^([^ \t]*)[ \t]*(.*)$/s` | the pattern without `^`, and without `$` | every part can match nothing, so it matches from the start of any text, and its last part runs to the end |
| `signers.ts`, an option's name | `/^[^,="]*/` | `/[^,="]*/` | nothing is a match too, at the start of any text |
| `reader.ts`, a line's indent | `/^ */` | `/ */` | the same |
| `versions.ts`, the first word of `claude --version` | `/\s+/` | `/\s/` | what is split is trimmed and not empty, so its first part ends at the first space either way |
| `fs.ts`, `round.ts` twice, `siblings.ts`: a JSON file read | `'utf8'` | `""` | without an encoding the file is a Buffer, which `JSON.parse` reads as its text |
| `git.ts`, the first line of what `verify-commit` printed | `text.trim()` | `text` | git writes the check to stderr, which stands first in the text, so the trim changes the first line only for output on stdout alone, which `verify-commit` does not print |

The same encoding in `version()` (`workspace.ts`) is equivalent for the
same reason and was counted killed, by a test that fails for another
cause: `tests/integration/rulings.test.ts` numbers a second request after
the one the test before it raised, and Stryker runs for a mutant only the
tests that cover it, so the second runs alone and finds no first. Thirty
mutants of this sweep, and twenty-seven of the sweep before, have that test
as their recorded killer where the test before it does not cover them: 25
in `commands.ts`, where `escalate --list` and `--show` are, and the
rest in `rulings.ts` and `workspace.ts`. A run stops at the first test
that fails, so the sweep does not say whether a test kills them. The test
is left as it is here: making it stand alone is a change to the suite, and
to which of those thirty survive.

`'hex'` in `round.ts`, the survivor the amendment of 2026-10-01 has as
counted killed now and then, was counted killed, which is why the
survivors are 186 and not 187; and eleven mutants moved between killed and
timed out, eight one way and three the other, as between any two sweeps.

With every timeout lost the full sweep would read 96.40%, and the core
sweep 97.68%: both `break`s stay, at 95 and 97. The shards took 11m16s to
18m18s. The static mutants, each of which runs every test file until one
fails, went from 1,294 to 1,458, 142 of the new ones in `usage.ts`, and
the last shard, which holds that file, took 18m04s for its sweep where it
took 14m13s: nearer the 22 minutes that say to measure the table again,
and not there.

**The count is kept.** `scripts/mutation-unmeasured.mjs` counts the
places a mutator applies under each outermost `as`, in the sources a
sweep's report holds or in those on disk, and fails for more than the
number it records as left, which is none. The full sweep's score step runs
it on the merged report, after the merge that writes it.
`tests/mutation-unmeasured.test.ts` holds the script to a small source it
must count to the number, and the repository's sources to the count on
every change, since the sweep that would say it runs once a week. The
script reads a source with `@babel/parser`, which Stryker brings and this
package does not ask for, as the merge reads its score with Stryker's own
library; where it cannot be loaded the script says so and exits 2, and
counts nothing as none. A place is where a mutator applies, not a mutant:
each makes one to three, so the count says where to look, and the sweeps
above say what was there.

*Amended again 2026-10-12.* **A test stands alone, and a kill is a test
that fails for the mutant.** The amendment above found one test that was
the recorded killer of mutants it does not test, and left it. Stryker runs
for a mutant the tests that cover it and no other, in their order, so a test
that passes only after another in its file fails whenever the other does
not cover the mutant, whatever the mutant is, and the sweep counts a kill.

**Which tests.** Every file of the suite but
`tests/integration/round.test.ts` was run on one workstation with the tests
of each file, and of each suite in it, in the reverse of their order: 19 of
1,320 tests failed, in seven files. Each of the 19, and every test of
`tests/integration/rulings.test.ts`, was then run alone, as Stryker runs a
test: one vitest context, the test's file, and its name as the pattern, so
that the file's hooks run and every other test is skipped. Four fail alone,
all in that file, and each passes in its place:

| Test, in `tests/integration/rulings.test.ts` | Leans on |
| --- | --- |
| `escalate`: numbers the next request after the last, and lists, shows and prints them as JSON | the request the test before it raises |
| `escalate`: skips a request it cannot read rather than listing nothing true | the requests of the two tests before it, and the directory they made |
| a ruling is a row whose commit a person signed: allows a protected path beside one in scope, deciding each | the commit an earlier test signs |
| the same suite: does not lend a signed line's commit to an uncommitted row written where that line was | the same commit |

The other fifteen pass alone. Five read a repository their file shares
after a test that follows them in the file's order had changed it, which no
sweep does, since it keeps the order; ten ran past a bound on a workstation
under load. `round.test.ts` times out on that workstation on unchanged
main, and has one test, which makes its own repository.

**Which mutants.** In the report of 0.15.0's sweep (run 38174911926) the
first of the four is a recorded killer of 38 mutants. Ten are static, so
every test ran for them, the test before it with the rest. The other 28 are
not covered by the test before it, so it ran without it: 25 in
`src/commands.ts`, where `escalate --list` and `--show` are, one in
`src/rulings.ts` and two in `src/workspace.ts`. For 26 of them the recorded
failure is one sentence, that the request is `E-001-1` where `E-001-2` was
expected: the test failing for want of the first request. The sweep before
it (run 38160632452) has 30 such mutants, the 25, the one, and four in
`workspace.ts`. The other three tests are the recorded killer of no mutant
that the test they lean on does not cover.

**The tests now.** The two `escalate` tests each raise, in a round of their
own, the requests they then number after and list beside. The three tests
that read the signed row are a suite of their own whose hook signs the
commit, where the first of them signed it for the two after it. Each of the
four passes alone, and the file passes whole.

Read against the test as mended, before any sweep, five of the 28 were
expected to survive it. Written into the source by hand, each did, and two
more written in as a check were killed, each by an assertion about what it
changes:

| Where | Mutated | Replacement | What it is |
| --- | --- | --- | --- |
| `commands.ts`, the document `escalate --list` prints | `'escalate'` | `""` | the command the document names, which no test read |
| `commands.ts`, the document `escalate --show` prints | `'escalate'` | `""` | the same |
| `commands.ts`, the document a request is raised with | `'escalate'` | `""` | the same |
| `rulings.ts`, the next id | `n > highest` | `n >= highest` | equivalent: a number equal to the highest is the highest |
| `workspace.ts`, `version()` | `'utf8'` | `""` | equivalent, and said beside the code since the amendment above |

The test now reads the command each of the three documents names, and the
comparison is said beside its code. The sweep below has the other 21 killed
by the test as well, each for what it changes.

**A survivor that is a file that did not load.** Stryker counts a test that
failed, not a test file that failed to load. A mutant under which a module
throws as it loads takes with it every test file that imports the module,
and where no other test fails it is scored as survived, as the body of
`literal()` was in 0.15.0's sweep. That sweep has 1,455 static mutants, and
33 of them survived. Sixteen are called equivalent beside their code. The
other seventeen were written into the source by hand, one at a time, with
the unit suite run and every test file of the suite loaded with no test
run:

| What happened | Mutants |
| --- | ---: |
| a test fails | 1 |
| a file fails to load, and no test fails | 0 |
| nothing happens | 16 |

The one is the body of `literal()`: under it 23 of the 52 test files do
not load, and `tests/unit/literal.test.ts`, which loads the function alone,
fails. It is the one function every table is built through, and that test
has held it since 0.15.0. Of the sixteen, four are killed by three tests
added with this amendment: an empty branch name, for which a list made two
places short has fewer places than none (`branch.ts`, twice); a
`claude.bat` found under Windows' own extensions where `PATHEXT` is not set
(`host.ts`); and a run of whitespace after a signer's principals, skipped
whole before options as before a key type (`signers.ts`). Twelve are
equivalent, and each is said beside its code:

| Where | Mutated | Replacement | Why it reads the same |
| --- | --- | --- | --- |
| `branch.ts`, the offsets a prefix can end at, twice | `new Array<boolean>(name.length + 1)` | `new Array()` | an offset never written reads as one that cannot be reached, and `forEach` passes over it |
| `branch.ts`, a token of the prefix | `j < name.length` | `j <= name.length` | one place past the end `charAt` gives the empty string, which is no token |
| `branch.ts`, the offsets found | `[]` | `["Stryker was here"]` | no id starts at a text, so it is passed over |
| `branch.ts`, the end of an id, twice | `end < name.length` | `true`, and `end <= name.length` | past the end `charAt` gives the empty string, which is no character of an id |
| `reader.ts`, a heading's leading number | `/^\s*\d+[.)]?\s+/` | `/^\s*\d+[.)]?\s/` | what is left of the run of spaces is trimmed two lines on |
| `reader.ts`, the scan kept | `cache !== null && cache.text === text` | `false` | the scan kept spares a scan and changes no answer |
| `rulings.ts`, the last line of a brief, twice | `lines.length > 0` | `true`, and `lines.length >= 0` | a text splits into one line at least |
| `rulings.ts`, the same line read again | `lines[lines.length - 1]?.trim` | `lines[lines.length - 1].trim` | it is read only where there is one |
| `signers.ts`, the whitespace between fields | `/^[ \t\r\n]*/` | `/[ \t\r\n]*/` | nothing is a match too, at the start of any text |

**The sweep.** `mutation.yml` was dispatched on the branch that brought
this (run 38198901681, on 1664ce6):

| Sweep | Run | Source | Score | Mutants | Killed | Timed out | Survived | No coverage |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| main's last | 38174911926 | 3c3b1f1 | 97.51% | 8,778 | 8,476 | 83 | 188 | 31 |
| with the tests mended | 38198901681 | 1664ce6 | 97.54% | 8,778 | 8,478 | 84 | 185 | 31 |

Mutant for mutant, 8,767 are in both, and the other eleven are the same
mutants under another text: blocks that now hold one of the comments
above, killed before and after. Of the 28 mutants the test had "killed",
26 are killed by it for what they change, the three documents' command
among them, and two survive, the two equivalents. Five survivors of the
sweep before are killed: the four the new tests are for, and the body of
`literal()`, by the test it has had since. So the survivors are 188, less
five, and two more: 185, of which 28 are static where 33 were. Seven
mutants moved between killed and timed out, three one way and four the
other, all in `probe`'s command, as between any two sweeps. With every
timeout lost the sweep would read 96.58%, and the `break` stays 95. The
shards took 13m37s to 16m55s, with 1,247 tests where the sweep before had
1,243.

*Amended a third time 2026-10-12.* **A change only the full sweep reaches
is swept before it merges.** Read from the two configurations at 2c652e7,
with Stryker's reading of `mutate`:

| Sweep | When, until now | Mutates | Against |
| --- | --- | --- | --- |
| core, `stryker.core.config.mjs` | every pull request and every push to main (`ci.yml`) | 19 modules whole, and `parseOptions` of `workspace.ts` | `tests/unit` |
| full, `stryker.config.mjs` | weekly and on request (`mutation.yml`) | 33 modules | the whole suite |

So fourteen modules were mutated by the full sweep alone, and a change to
one merged with no sweep having read it: `cli.ts`, `commands.ts`,
`document.ts`, `fs.ts`, `git.ts`, `host.ts`, `plugin.ts`, `premises.ts`,
`round.ts`, `sandbox.ts`, `server.ts`, `setup.ts`, `siblings.ts`, and
`workspace.ts` outside its one function. `index.ts` and `types.ts` are in
neither list and declare no value. Of the 85 pull requests merged from
2026-09-26 to 2026-10-12, 34 changed one of the fourteen, by the lists as
they are today: `cli.ts` in 17, `commands.ts` in 14, `round.ts` and
`server.ts` in 13 each, `setup.ts` and `sandbox.ts` in 10 each. What such a
change left was found when a release was swept, twice after a replay by
hand had every mutant killed: the body of `literal()` for 0.15.0, and two
survivors in `init`'s plan for 0.16.0, both recorded above.

**The sweep runs for the change.** `mutation.yml` also runs for a pull
request, and for a push to main, that changes one of the fourteen or what
the sweep is made of: the Stryker configurations, the core sweep's with
them since it says which modules are left to this one,
`vitest.mutation.config.ts`, `scripts/mutation-*.mjs` and the workflow.
The schedule and a dispatch are as they were. A push to main is swept so
that main has a report of its own head for the next pull request to be
compared with. The fourteen are written in the workflow by name, once for
each event, and `tests/mutation-shards.test.ts` holds the two lists equal
and holds them to the configurations: the sources the full sweep mutates
and the core sweep does not mutate whole, and no other. A module added to
`src/` is in neither list, and `npm test` fails until it is in the core
sweep's or the workflow's.

What GitHub does with the workflow, from its documentation as read on
2026-10-12:

- *Workflow syntax for GitHub Actions*, under
  `on.<push|pull_request|pull_request_target>.<paths|paths-ignore>` and its
  *Git diff comparisons*: a run starts when one changed file matches a
  path. For a pull request the changed files are those between its branch
  and the commit where the branch last met its base, and for a push to a
  branch those between the two heads. The page's exceptions: a push of
  more than 1,000 commits always runs, and so does a diff that times out;
  a diff of more than 3,000 files does not run for a match past the first
  3,000; and a filter of paths is not read for a pushed tag. What follows
  from the first: every push to a pull request that has changed one of the
  fourteen runs the sweep again, whatever that push changed.
- The same section: a check of a workflow that a filter skipped stays
  pending, and a pull request that requires it cannot merge. What
  follows: `mutation (full)` is never made a required check. Main's
  ruleset requires none today.
- The same page, under `concurrency`, and *Contexts reference*, under
  `github.ref`: with `cancel-in-progress` a new run ends the run in
  progress in its group, and the ref of a pull request's run is
  `refs/pull/<number>/merge`. The group here was already the ref and the
  event, so a newer push to a pull request ends the sweep of the push
  before it and no other run's, and the group is unchanged.
- *Events that trigger workflows*, under `pull_request`: the commit is the
  pull request's merge into its base, and no workflow runs while the pull
  request has a merge conflict. So the sweep is of what main would be, and
  a pull request in conflict is not swept until it is mended.
- *Workflow syntax*, under `permissions`, and *Permissions required for
  GitHub Apps*, under the repository permissions for Actions: a job that
  names a permission has none it does not name, and listing a workflow's
  runs, listing a run's artifacts and downloading one each take read
  access to Actions. The second page has that for a private repository
  and leaves a public one to each endpoint's own page, and the page of the
  download names no way without. So the merge's job names
  `contents: read` and `actions: read`, and the shards keep the
  workflow's `contents: read`.
- *Using GitHub CLI in workflows*: the CLI is on every hosted runner and
  takes its token from `GH_TOKEN`, which the one step sets.
- *Workflow commands for GitHub Actions*, under *Step isolation and
  limits*: a step's summary may hold 1 MiB. The comparison lists 200 rows
  there and all of them in the log.

**The merge names the undetected mutants that are new.** A score does not:
189 survivors of 9,105 mutants read 97.58%, and so do 187 and 191.
`scripts/mutation-compare.mjs` asks GitHub for main's newest full sweep
that passed and still has its merged report, a sweep of main itself by a
push, the schedule or a dispatch, and lists what this sweep leaves
undetected, survived or without coverage, that the other did not. A mutant
is its file, its mutator, the text it replaces and what replaces it, never
its line; mutants the same in all four are told apart by how many there
are. It writes the list to the job's summary and its log with a count, and
fails the sweep for none of them: a new survivor may be equivalent, and is
then said beside its code, and the `break` still gates the score. Where
there is no report to fetch, it says that nothing was compared, as a
warning, and never that none is new. The report of run 38205988813 expires
on 2026-10-26, fourteen days after its run, and the weekly sweep leaves a
newer one each Monday.

Run by hand on two reports kept from the sweeps above, that of 1664ce6 as
main's (run 38198901681) and that of d8edba0 (run 38205988813), it names
five new and one gone, which are what the paragraph on 0.16.0 has: the two
equivalents, the survivor that moved from `cli.ts` to `round.ts` as one new
and one gone, and the two in `setup.ts` that were neither. Had the sweep run
for the pull request that brought them, its summary would have named both
before the merge.

What the list holds that the change did not make: a mutant whose own text
changed, a block that gained a line among them, is another mutant, and so
is one in a function that moved to another file; an undetected mutant of
anything main took after the commit its report is of; and a verdict that
differs between two sweeps of one code, as `'hex'` in `round.ts` does. The
pull request says which of these each is.

**The rule.** A pull request that changes one of these files lists the
undetected mutants its sweep names as new, and says what each is: killed,
by a test it adds, or equivalent, in a comment beside the code
(`CONTRIBUTING.md`, `CLAUDE.md`). A summary that says nothing was compared
is not one that found none: the two reports are then compared by hand,
with the same script.

**What it costs.** Main's last three full sweeps (runs 38144471044,
38174911926 and 38205988813) took 120, 128 and 127 minutes of runners over
their nine jobs, in shards of 12m16s to 21m01s, and had their merged score
18 to 22 minutes after they started; CI for a pull request took a median
of 8.7 minutes over the 39 runs that passed since 2026-10-08. So a pull
request that changes such a file has nine more checks and waits about
twenty minutes where it waited nine. Of the 85 merged pull requests, 49
would have run the sweep: the 34, and 15 that changed only what the sweep
is made of, eight of them a release, whose one such change is the sentence
in `stryker.config.mjs` that records its sweep. CI ran 79 times for those
49, once a push, so with the 49 pushes to main that is at most 128 sweeps
in seventeen days where 25 were run, fewer by each a newer push ended.

**What still merges unswept.** A change to the tests alone, to the vendored
spec-core or to a dependency runs no full sweep, and each can move a
verdict: the pull request that had every test stand alone (the amendment
above) changed which mutants of `commands.ts` a test kills, and no source
the full sweep alone reaches. The weekly sweep reads those, and its
summary names what they left. And the first runs: main's newest report is
of d8edba0, and main is at 2c652e7, the release of 0.16.0, which changed
no source and added the two tests that kill the survivors in `setup.ts`.
Until main has a sweep of its own head, a pull request's summary has those
two as gone and nothing of main's as new.

*Amended 2026-10-14.* **What the sweep still left: its tests and the
vendored copy, a table that had drifted, and a count that was not
Stryker's.** Each was measured again before anything changed, from the
workflow, the runs and the reports.

**The sweep runs for the integration suite and for the vendored spec-core.**
Of the 90 pull requests merged from 2026-09-26 to 2026-10-12, 53 changed a
path the sweep runs for. Of the other 37, six changed a file under
`tests/integration`, seven a file under `src/vendor`, and nine one or the
other. Each is what the verdicts are made of. In the report of main's
newest sweep (run 38264176050, of 9fc6cc5) the fourteen modules only this
sweep reaches have 3,518 mutants, and the test first recorded as the killer
of one is in `tests/integration` for 3,139 of them and in `tests/unit` for
192. The vendored spec-core is in no sweep's `mutate` here, and six of the
modules that are import from it. So the paths of `mutation.yml` name
`tests/integration/**` and `src/vendor/**`, under both events.
`tests/mutation-shards.test.ts` holds every file of either directory to
those two entries, holds that no file of the integration suite imports a
helper from outside it but `tests/temporary.ts`, which reaches no source,
and holds that the paths match none of what is left to the core sweep and
the schedule: a module the core sweep mutates whole, a unit test, a test of
the repository itself, a manifest, a document.

What GitHub does with such an entry, from *Workflow syntax for GitHub
Actions* as read on 2026-10-14, under *Filter pattern cheat sheet* and its
*Patterns to match file paths*: a pattern is matched against the whole
path, from the repository's root; `*` is any run of characters but a slash,
and `**` any run at all; and its example of a directory followed by `/**`
is every file in that directory and in its subdirectories.

**What that costs.** The five newest full sweeps took 126.5 to 134.6
minutes of runners over their nine jobs. CI ran for 12 heads of the nine
pull requests, so with their nine pushes to main the two entries would have
run at most 21 sweeps more in seventeen days, where the paths before them
would have run at most 139: about 2,700 minutes of runners. *GitHub Actions
billing*, under *How use of GitHub Actions is measured*, has the use of
standard hosted runners by a public repository as free, so what a sweep
costs here is the wait. *Actions limits*, under *Job concurrency limits for
GitHub-hosted runners*, gives an account on the Free plan 20 jobs at once,
and a sweep is nine. On 2026-10-12 nine sweeps ran between 09:07 and 15:00
beside the CI of their pull requests: in four the shards started within a
minute of being made, and in five they waited for a runner, the longest
wait of each from 11 minutes to 61.

**What still merges unswept.** A dependency's bump alone: 19 of the 37
changed `package.json` or the lockfile and neither directory. Eleven of
those changed the package's own version, a script or the list of files.
Eight changed a dependency, five of them a sibling tool that the
integration suite runs. A unit test alone: `tests/unit/git.test.ts` is the
first recorded killer of 21 mutants of `git.ts`, three of which no
integration test covers, and `tests/unit/workspace.test.ts` of 34 mutants
of `workspace.ts` outside the function the core sweep mutates, each of
which an integration test covers as well or is static. And what the suites
read by its path that is no test: `bin/`, `hooks/hooks.json`, `skills/` and
`package.json`. Monday's sweep reads all of these, and its summary names
what they left.

**The shards, levelled on five sweeps.** The five full sweeps that ran last
on the table of 2026-10-09 were read shard by shard with
`scripts/mutation-timeline.mjs`: runs 38249083949, 38252478668,
38258557802, 38261238288 and 38264176050, all of 2026-10-12, the second of
1016375 and the others of 0.17.0's source. The last shard's job passed 21
minutes in three of them, and 22, the sign the amendment of 2026-10-09 set,
in one.

| Shard | Its files' minutes in the five sweeps, oldest first | Its job, the least and the most |
| --- | --- | ---: |
| `round.ts` | 15.4, 15.4, 14.7, 14.6, 11.2 | 13m47s to 18m21s |
| `siblings.ts` | 10.3, 12.9, 12.8, 12.9, 11.4 | 12m34s to 15m55s |
| `sandbox.ts` | 14.0, 13.6, 14.1, 14.2, 14.8 | 16m15s to 17m49s |
| `git.ts`, `premises.ts`, `host.ts`, `briefs.ts`, `hooks.ts`, `guard.ts` | 14.2, 12.4, 15.0, 14.2, 14.5 | 15m10s to 17m59s |
| `branch.ts`, `reader.ts` | 12.5, 13.2, 10.5, 12.6, 12.8 | 13m16s to 16m10s |
| `rulings.ts`, `commands.ts` | 10.6, 9.6, 10.0, 10.9, 11.1 | 12m17s to 13m46s |
| `cli.ts`, `signers.ts`, `workspace.ts`, `server.ts`, `probe.ts`, `config.ts` | 15.4, 11.4, 13.6, 12.9, 10.5 | 12m56s to 18m13s |
| the rest | 14.4, 18.6, 13.4, 18.8, 19.8 | 15m41s to 22m49s |

The files took 104 to 111 minutes in all, where the table was made on 95:
the sources have 1,459 more mutants than they had then, 9,483, and the
suite 187 more tests, 1,315. An initial run took 1m55s to 2m34s in the
forty shards, and a job 2.3 to 3.1 minutes more than its files. Static
mutants took 55 to 56 minutes in the hundred of each sweep. What grew is
the last shard, where a file added to `src/` lands and where `configure.ts`
gained 238 mutants for 0.17.0: `setup.ts` took 2.3 to 3.6 minutes there,
`configure.ts` 2.2 to 3.3, `versions.ts` 2.0 to 2.8, `fs.ts` 1.1 to 3.3 and
`usage.ts` 1.3 to 1.9. The comment above the table in
`scripts/mutation-shards.mjs` has every file's.

**A file's minutes do not add up where it goes.** The first table made on
those minutes moved `setup.ts` to the shard of `rulings.ts` and
`commands.ts`, which the amendment of 2026-10-09 had as the one with room,
and `usage.ts` to the shard of `siblings.ts`. Added up file by file it had
the eight shards at means of 12.3 to 14.3 minutes. The pull request that
brought it ran the sweep on it (run 38456021914, 97.69% over 9,483 mutants,
no undetected mutant new against main's), and it was not level:

| Shard | Its files, added up from the five sweeps | In run 38456021914 | Its job |
| --- | ---: | ---: | ---: |
| `round.ts` | 14.3 | 9.8 | 12m13s |
| `siblings.ts`, `usage.ts` | 13.7 | 14.5 | 17m11s |
| `sandbox.ts` | 14.1 | 14.1 | 16m56s |
| `git.ts`, `premises.ts`, `host.ts`, `briefs.ts`, `hooks.ts`, `guard.ts` | 14.1 | 12.9 | 15m39s |
| `branch.ts`, `reader.ts` | 12.3 | 10.3 | 12m58s |
| `rulings.ts`, `commands.ts`, `setup.ts` | 13.6 | 17.2 | 20m05s |
| `cli.ts`, `signers.ts`, `workspace.ts`, `server.ts`, `probe.ts`, `config.ts` | 12.8 | 15.3 | 18m18s |
| the rest | 12.3 | 9.5 | 12m10s |

The five shards that did not change stood from 4.5 minutes under their
means to 2.5 over, which is what one runner differs from another by. The
shard that gained `setup.ts` took 3.6 minutes more than its files had
taken apart, and the reports say where. The 59 static mutants of
`commands.ts` had run 1,479 to 1,591 tests between them before they were
decided, in three of the five sweeps read; beside `setup.ts` they ran
13,848, thirteen of them more than 600 each where none had. The mutants
that are not static took what they had taken: 4.2 minutes for
`commands.ts`, 3.6 for `setup.ts`.

A worker runs a static mutant's files the quickest first, by what it last
timed each at (`vitest.mutation.config.ts`). Vitest keeps for a file the
time of its last run (`updateResults` in its `dist/chunks/cli-api.*.js`,
4.1.11), and before the static mutants begin a worker has run of a file
only the tests that cover some mutant. What follows, and the counts agree
with: every test file a shard's sources are covered by stands among the
quickest when the static mutants start, whatever it takes whole, and the
first static mutants of the shard run those files to their end before the
one that kills them. `setup.ts` is covered by
`tests/integration/init.test.ts`, fifty-one tests, and by four more
integration files, none of which anything in that shard had brought. In the
last shard it had stood beside static mutants that a unit test kills, 121
of `configure.ts`'s 138, 213 of `usage.ts`'s 215 and all 52 of
`versions.ts`'s, and a unit file is quick whatever part of it ran.
So a file's mutants that are not static cost the same wherever it goes, and
its neighbours' static mutants cost by the test files it brings. No trace
of a worker's order was taken: the mechanism is read from the two sources
and the counts, and the order is left as it is here, a change to the
sweep's own and not to its table.

**The table.** `setup.ts` stays in the last shard. Three files leave it for
the shard of `rulings.ts` and `commands.ts`: `manifests.ts`, `context.ts`
and `junit.ts`, which have 30 static mutants among 1,496, and which bring
that shard no test file but unit tests. `usage.ts` stays with
`siblings.ts`, where the two took 14.5 minutes in the run above. By the
five sweeps, file by file:

| Shard | Its files' minutes, oldest first | Mean |
| --- | --- | ---: |
| `siblings.ts`, `usage.ts` | 11.6, 14.6, 14.2, 14.8, 13.1 | 13.7 |
| `rulings.ts`, `commands.ts`, `manifests.ts`, `context.ts`, `junit.ts` | 12.8, 14.9, 12.2, 14.0, 14.4 | 13.7 |
| the rest | 10.9, 11.6, 9.8, 13.8, 14.8 | 12.2 |

The other five are as they were, with means of 12.3 to 14.3 minutes, so
the eight stand at 12.2 to 14.3 where they stood at 10.4 to 17.0, and the
last shard is the shortest, since that is where the sources grow unasked.
The sweep of the commit that brought this table measured it (run
38463439916, 97.70% over 9,483 mutants, no undetected mutant new against
main's, and one of main's gone, `'hex'` in `round.ts`, which the amendment
of 2026-10-01 has as killed now and then):

| Shard | Its files, added up from the five sweeps | In run 38463439916 | Its job |
| --- | ---: | ---: | ---: |
| `round.ts` | 14.3 | 14.7 | 17m39s |
| `siblings.ts`, `usage.ts` | 13.7 | 15.6 | 18m31s |
| `sandbox.ts` | 14.1 | 14.1 | 17m11s |
| `git.ts`, `premises.ts`, `host.ts`, `briefs.ts`, `hooks.ts`, `guard.ts` | 14.1 | 14.3 | 17m13s |
| `branch.ts`, `reader.ts` | 12.3 | 12.7 | 15m37s |
| `rulings.ts`, `commands.ts`, `manifests.ts`, `context.ts`, `junit.ts` | 13.7 | 12.9 | 15m27s |
| `cli.ts`, `signers.ts`, `workspace.ts`, `server.ts`, `probe.ts`, `config.ts` | 12.8 | 12.7 | 15m20s |
| the rest | 12.2 | 12.5 | 15m57s |

Its jobs took 15m20s to 18m31s, where those of the first table took 12m10s
to 20m05s and those of the five sweeps before it 12m17s to 22m49s. Beside
the three files that bring unit tests alone, the static mutants of
`commands.ts` ran 3,635 tests, none of them more than 600. The shard of
`siblings.ts` and `usage.ts` was the longest, at 15.6 minutes where the
sum gave 13.7 and the run before had it at 14.5: the static mutants of
`siblings.ts` ran 11,640 and 11,431 tests in the two runs where they had
run 9,173 and 9,749 alone. If a shard keeps passing the others it is that
one, and `usage.ts` goes back to the last.

No test names a file's shard: `tests/mutation-shards.test.ts` holds the
table to the configuration and to the workflow's matrix, and passes with it
as it did. The sign to measure again stays a shard that keeps passing 22
minutes, now five more than the table has its longest job. One thing the
five sweeps say of any table: the last shard's files took 13.4 minutes in
one and 19.8 in another of the same source, each file of it longer by
about the same share. A runner is that much slower than another, and no
table levels it.

**How long a report is kept.** The comparison of 2026-10-12 reads main's
newest report, and that amendment has it expiring fourteen days after its
run. The workflow does not say so: the upload of the merged report names no
`retention-days`, and the fourteen days are the repository's setting, read
on 2026-10-14 from GitHub's API as 14 days, with 14 the most that may be set
(`gh api repos/spec-family/spec-harness/actions/permissions/artifact-and-log-retention`).
From GitHub's documentation as read the same day:

- *Store and share data with workflow artifacts*, under *Configuring a
  custom artifact retention period*: the `retention-days` of an upload
  cannot exceed the limit set by the repository, its organisation or its
  enterprise.
- *Managing GitHub Actions settings for a repository*, under *Configuring
  the retention period for checks, workflow runs, commit statuses,
  artifacts, and logs in your repository*: the period is 90 days unless it
  is set, a public repository may set 1 to 90, a repository cannot exceed
  the limit of the organisation that manages it, and a change applies to
  what is made after it. The same section has the period cover checks,
  workflow runs and commit statuses as well from 2026-10-01.

What follows, and is not the pages': no line of this workflow can keep the
report a month, and none is added for it. The limit is the organisation's
to set. Where an owner raises it, the merged report follows with no change
here, since its upload names no time of its own. And a run made since
2026-10-01 is kept as long as its artifacts are: the runs this record cites
by number will stop answering fourteen days after each, and the figures
written here are then what is left of them.

What does hold is the schedule. Monday's sweep of main leaves a newer
report inside the fourteen days, and so does a push to main that changes
one of the workflow's paths. The schedule has run on each of the three
Mondays since the workflow has had it, 2026-09-28, 2026-10-05 and
2026-10-12 (runs 36416689848, 37307780901 and 38252478668), and each sweep
passed: no Monday has yet failed to leave a report. Each was made 6h37m to
7h59m after the hour its cron names. *Events that trigger workflows*, under
`schedule`, as read on 2026-10-14, has a scheduled run delayed while GitHub
is under load, the start of an hour above all, and at times dropped, and
has a public repository's schedules switched off after 60 days in which
nothing happens in it.

So a pull request's sweep has nothing to compare with only after two
Mondays running whose sweep did not pass, or did not run, with no such
push between them. What it says then is the amendment of 2026-10-12's: a
warning in the log and the summary *not compared*, with the reason, that
main has no full sweep that passed or that none of its five newest gave
its report, and exit 0. It never reads as none new. The way back is a
sweep of main, `gh workflow run mutation.yml --ref main`, after which the
pull request's sweep, run again, has a report to fetch.

**The count of what stands under an `as` is held to the Stryker
installed.** spec-core's test of the same count found three defects that
its first writing let through. Each was put into this repository's script
and its test run: a key written as a string counted as a place failed the
test, and two passed it, a type inside the expression read as code and a
mutant of a report beside an assertion on its own line read as under it.
The count was then set beside the instrumenter itself, as spec-core's test
does: over the eleven outermost assertions of spec-core's source and
fourteen more written for this measurement, each read by the instrumenter
with the assertion and with spaces where it was, the count differed from
the places Stryker mutates at fourteen of the twenty-five. It read fewer at
five and more at nine. At two it read none where Stryker mutates one place:
`new Array<boolean>(3) as boolean[]` and `(~count) as number`. It read
none for an enum's initialisers, which Stryker passes over as it does an
`as`, since `TSEnumDeclaration` stands beside `TSAsExpression` in the
instrumenter's list of types.

The script now counts by the instrumenter's own mutators, as spec-core's
does: a ternary that only chooses is no place, nor a `+` beside a text; a
list made with `Array`, a `~`, an optional call of a method, a setter of a
date, and a call or a `throw` that would be its statement's one mutant are;
and an enum is read down to its initialisers. It reaches the parser from
`@stryker-mutator/core` through the instrumenter and its `@babel/core`,
and not by the bare name, which is whichever `@babel/parser` stands at the
top of `node_modules`: Stryker's 8 in this tree today, and in spec-graph's
the 7 that magicast asks for, with Stryker's nested under `@babel/core`.
After the change the count is the places Stryker mutates at
every one of the twenty-five but a pattern the Regex mutator makes nothing
of, `/b/`, which it counts by intent. Both counts read none on 0.17.0's
sources and on its merged report, over 66 assertions, so `LEFT` stays 0.

`tests/mutation-unmeasured.test.ts` holds the count to the instrumenter
installed, over one source of twenty-two assertions with each kind of place:
no mutant is made under any while they stand, and with spaces where they
were the places mutated under each are exactly the places counted. It has
a case for each of the three defects, for an enum, and for a step of the
way to the parser that is not installed. It has no hook that prepares
anything, and had none. The note of a `beforeAll` that could run past its
time is true of spec-core's test, whose suite sets a hook no time of its
own and whose test gives that hook sixty seconds; this suite gives hooks
and tests 300 (`vitest.config.ts`). On a workstation so loaded that
`node -e 0` took five to nine seconds, its slowest test, seven runs of the
script, took fifteen.

*Amended 2026-10-24.* **`branch.ts`'s three survivors are decided by a
clock, not by the order tests run in.** The record of 0.20.0 above has
`j <= name.length` (line 50), `["Stryker was here"]` for the list of ends
(57) and `true` for `end < name.length` (80) counted killed by 0.19.0's
sweep, and decided by the order tests run in. *Measured* in the reports of
the sweeps of 0.18.0 (run 38555334383) and 0.19.0 (run 39160139131), and
of the thirty full sweeps that passed from 2026-10-19 on, the last of them
0.20.0's (run 39334835801): no sweep counted any of the three killed by a
test. Each survived in 0.18.0's and in 28 of the thirty, and timed out in
0.19.0's and in two sweeps of one pull request
(`feat/a-configuration-that-can-be-mended`, at dc74f8f and 05caf52). The
fourth beside them, `end <= name.length` (80), survived in every one but
dc74f8f's. The four are static mutants, and a static survivor runs every
test file: it times out where that run passes its limit, which a slow
runner reaches. So a clock decides them.

Each is equivalent, as the comment beside it has said since #92. Written
into the source one at a time, `tests/unit/branch.test.ts`,
`tests/unit/workspace.test.ts` and `tests/integration/premises-cli.test.ts`
pass, 69 tests, and the mutated `idFromBranch` answers as the original for
each of 781 templates (up to four of `a`, `1`, `-`, `/` and `*` before
`{id}`) and 37,449 names (up to five of `a`, `1`, `-`, `/`, `+`, `.`, `_`
and `é`), where two mutants a test kills differ on 6,320,546 of the same
pairs. No test can kill them, and none is added. Source written so that no
such mutant is made would end the clock; that is a change of `src/` no
decision asked for, and is left.

*Amended 2026-11-08.* **No mutant decided by a clock or by chance in
`branch.ts` and where the copy of the signers is named.** The maintainer
asked for the source written so that none is made (round 27). Of the
equivalent mutants a sweep counted one way in some runs and the other in
the rest, four were `branch.ts`'s, the three above and `end <= name.length`
beside them, and one `round.ts`'s, `'hex'` made empty, which the record of
0.13.0 above has counted killed by a NUL among the digest's bytes.

- **`branch.ts`** reads the offsets a template's prefix can end at as a
  set, built from the name's characters and from offsets reached, and an
  id as a pattern read from where the prefix ends,
  `^[A-Za-z0-9]+(?=[-_/.]|$)`. No index is bounded, so no bound one past
  the end is written, and no list starts with a value no reading of it
  can use. A star adds no offset at the end of the name, where no id
  starts, and each set is filled in increasing order, which is the order
  the ends are read in, so nothing sorts them. The equivalent mutants the
  comments named, the four above, the two anchors of the character test
  and the two tables made with no places, are not made.
  `tests/unit/branch.test.ts` holds the reading to the one it replaced,
  kept in the test as it was, for 85 templates (up to three of `*`, `/`,
  `-` and `a` before `{id}`) and 781 names (up to four of `a`, `1`, `/`, `-`
  and `+`), in 70 ms here. Written into the source one at a time, 43
  mutants of the new lines, those the mutators make and the blocks
  emptied, each failed a test of that file.
- **`round.ts`** names the copy by the whole digest, read as hex from its
  bytes: `digest().toString('hex')`. A buffer refuses to be read in no
  encoding every time, so `'hex'` made empty fails every test that checks
  a ruling, and with no cut of the digest there is no `slice` for a
  mutant to leave out unseen. Written into the source, it and `'sha256'`
  made empty each failed `tests/integration/rulings.test.ts`. Where the
  copy is kept, `'signers'`, stays equivalent, and is said beside it.

*Amended 2026-11-09.* **Vitest 5, and the order's own record of the file
that failed last.** Stryker 10.1.0, of 2026-10-23, names "support vitest
v5" (#6214) in its notes: its vitest runner joins a test's name with ` > `
where it finds vitest 5 or later, which is what
[#6210](https://github.com/stryker-mutator/stryker-js/issues/6210) asked
for, and Dependabot brought both packages to 10.1.1 here on 2026-11-08
(pull request 144).
spec-core took vitest 5 the same day, with both conditions of
[its ADR-0008](https://github.com/spec-family/spec-core/blob/main/docs/adr/0008-toolchain.md)
met (its #57), and gave its sweep's order a record of its own (its #67).
This is step 4 of that ADR here, in pull request 156, and the
Decision's "Vitest 4.1" is vitest 5.0 from it.

**What changed.** `vitest` and `@vitest/coverage-v8` went to 5.0.5, the
version spec-core runs, and both Stryker packages are asked for at 10.1.1,
where the range admitted 10.0.0, which reads no test on vitest 5. The hold
went in the same change: the two vitest entries under `ignore` in
`.github/dependabot.yml` and the test in `tests/source.test.ts`. Two tests
in `tests/mutation-shards.test.ts` failed on vitest 5, each on a change of
vitest's own: a sequencer asks the cache by a file's specification
(`getTestSpecificationResult`), and the cache keeps no sizes, which vitest's
own sequencer reads from the disk; and `resolveConfig` returns Vite's
resolved configuration, vitest's under `test`, with the reporters of a
suite that names none decided when vitest is first imported, so the test
resolves each suite in a process started with `GITHUB_ACTIONS` set.
`QuickestFirst` asks what vitest's sequencer asks and reads a size as it
does; a file never run still runs after those that have, the smaller first.

**The record.** Vitest 5's cache keeps a failure from a run a test name
pattern narrows, or that stops at its first failure, until a run of the
whole file passes, and Stryker's workers share it, so a file that killed
one mutant would run first for every mutant after it, in every worker
(spec-core's ADR-0007, 2026-11-09, has how that read there). The full
sweep's order now keeps its own record, copied whole from spec-core: a
reporter, `lastRun`, named after `'default'` in
`vitest.mutation.config.ts`, records each file's verdict at its end, and
`QuickestFirst` reads that record where it read the cache's `failed`. The
times stay the cache's. The reporter has no `onInit`, which vitest 5 calls
at the start of every run.

**The core sweep takes both.** `vitest.core.config.ts` named no sequencer,
so the core sweep ran vitest's own order: a file the cache has failed
first, then the longest first. On vitest 5 that order lost the last
failure as the full sweep's had, and the pull request's first core sweep,
with the record in the full sweep alone, read main's verdicts and ran its
killed mutants 15.47 tests to a kill where main's read 9.20 to 9.81 (the
table below). So the core sweep's suite takes `QuickestFirst` and `lastRun`
from `vitest.mutation.config.ts`, one class and one reporter, and its order
changes from vitest's longest-first to the quickest first as well, for the
reason the full sweep's is that (the amendment of 2026-10-09): Stryker
stops a mutant's run at its first failing test, so what a mutant costs is
the files that run before the one that kills it, and vitest's order suits a
run that reports every failure. The maintainer chose this on 2026-11-09.

**Tests.** `tests/mutation-shards.test.ts` holds the record as spec-core's
tests do, with a test that drives five narrowed runs as Stryker's runner
does and takes the order inside each, run for each sweep's configuration,
and holds the core suite to the full suite's class and reporter. Breaks put
in by hand one at a time each failed a test: the failure read from the
cache, an emptying `onInit`, the full suite's reporter not named, every
state recorded, a pass recorded as a failure, and the core suite without
its `lastRun` or without its sequencer. The `onInit` failed the test
through vitest alone, for both suites.

**What the sweeps read.** "Tests to a kill" is the mean of the tests a
killed mutant completed, the one that failed among them; "by the first"
counts the killed mutants whose first test failed. The full sweep of
f5aff90, which has the record in the full sweep's suite alone, beside the
three latest of main, on vitest 4.1.12:

| | Main, 3335d35 | Main, 68b86a1 | Main, cc9cab1 | f5aff90 |
| --- | ---: | ---: | ---: | ---: |
| Run | 42504548255 | 42509425751 | 42513980035 | 42608690965 |
| Mutants | 12,435 | 12,531 | 12,601 | 12,601 |
| Killed, timed out, survived, without coverage | 12,102, 83, 223, 27 | 12,192, 87, 225, 27 | 12,269, 80, 225, 27 | 12,273, 77, 224, 27 |
| Score | 97.99% | 97.99% | 98.00% | 98.01% |
| Survived, covered, untested | 0 | 0 | 0 | 0 |
| Runtime errors | 0 | 0 | 0 | 0 |
| Tests to a kill | 15.90 | 11.84 | 12.31 | 17.35 |
| Those of the killed mutants that are not static | 3.84 | 3.86 | 3.81 | 3.79 |
| The static mutants', in all | 153,178 | 104,507 | 111,498 | 173,480 |
| By the first | 7,043 | 7,123 | 7,189 | 7,132 |
| Eight shards | 234m41s | 229m05s | 232m14s | 237m46s |
| The slowest shard | 52m27s | 38m16s | 48m04s | 53m50s |

Both conditions of spec-core's ADR-0008 held: 0.01 of a point apart, and
no survivor ran no test. `scripts/mutation-compare.mjs`, in the merge job,
found no undetected mutant new against cc9cab1's and one gone:
`src/config.ts` 231, `command[0]?.trim` made `command[0].trim`, which the
comment beside it calls equivalent. It is a static mutant, survived after
1,705 to 1,714 tests in the three sweeps of main, and timed out here: a
static survivor runs every test file, and where that run passes its limit
the clock decides it. Twelve more went between killed and timed out, eight
to killed and four to timed out, each detected either way. By the third
condition, the mutants that are not static ran 3.79 tests to a kill, at the
foot of vitest 4's 3.81 to 3.86. The static ones ran 173,480 tests before
their kills, above vitest 4's 104,507 to 153,178, as spec-core's did with
the record, where why is not explained (its ADR-0007, 2026-11-09). The
slowest shard, the seventh, took 53m50s, where main's seventh took 38m16s
to 52m27s.

The core sweep, beside the four latest of main on vitest 4.1.12: f5aff90's
in vitest's order, and a420a4e's in the full sweep's order with the record:

| | Main, b958709 | Main, 2838626 | Main, 2597078 | Main, 58e9e1b | f5aff90, vitest's order | a420a4e, the record |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Run | 42553300482 | 42573070951 | 42576240687 | 42582577857 | 42608691005 | 42616364842 |
| Tests to a kill | 9.20 | 9.81 | 9.23 | 9.32 | 15.47 | 7.47 |
| Those of the killed mutants that are not static | 2.79 | 2.78 | 2.81 | 2.80 | 3.65 | 2.72 |
| The 492 static mutants', in all | 47,355 | 51,833 | 47,454 | 48,196 | 86,713 | 35,454 |
| By the first | 4,550 | 4,552 | 4,550 | 4,553 | 4,441 | 4,560 |
| Killed after more than 200 tests | 57 | 67 | 59 | 60 | 123 | 40 |
| The job | 13m59s | 9m23s | 14m22s | 10m56s | 16m21s | 13m37s |

The six read the same verdicts, mutant by mutant: 98.69% over 7,305, with
7,182 killed, 27 timed out, 87 survived and 9 without coverage, none
survived, covered and untested, and no runtime error. In vitest's order on
vitest 5 a killed mutant ran six tests more before its kill, and the static
ones nearly twice as many. In the full sweep's order with the record every
count is at or past vitest 4's, the static mutants' most of all: in
vitest's order a static mutant ran the longest unit files first. The job
took 13m37s, within main's 9m23s to 14m22s, which is what one runner
differs from another by.
