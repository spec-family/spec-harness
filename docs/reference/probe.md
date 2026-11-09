# `probe [brief]`

A defect is measured before it is filed. The brief carries its probe:

````markdown
```probe
id: old-token-still-accepted
setup: npm ci
run: npm test -- tests/probes/rotate.test.ts
signature: expected 401, got 200
```

```probe-file tests/probes/rotate.test.ts
...
```
````

- `probe --at base` runs it in a temporary worktree at the base commit: every run must fail **for the declared reason** - the `signature` in the output, or a JUnit `test` failing - or the verdict is `vacuous` (no defect), `flaky` or `invalid`.
- `probe --at head` must be green: `fixed`.
- That worktree is a fresh checkout, so a probe's commands can rely on the files the commit tracks, the probe's own files and what its `setup` installed, and on nothing else: there is no `node_modules` until `setup` puts one there. Start a tool through one of the project's scripts, as `npm test --` does above, or through `npx --no-install <tool>`. A command is given no input: one that reads its input is told at once that there is none.
- A probe's commands fetch nothing through `npx` unless you say so. Given a tool's name alone where `setup` did not install the tool, `npx` would fetch the registry's package of that name and run it, unasked, since the command has no terminal to be asked on ([Names](install.md#names)). `probe` runs a probe's commands with `npm_config_yes=false`, so npm stops there and names the package, `npx canceled due to missing packages`, and the probe is `invalid`. To have npm fetch, say `--yes` on the probe's line, or set `npm_config_yes` yourself, in lower case or upper: `probe` leaves the variable as it finds it. The variable outranks a `yes=true` in an `.npmrc`. It is npm's alone, so `pnpm dlx` fetches whatever it says, and it stops a download only: a copy an earlier fetch left in npm's cache still runs.
- A run that proves nothing says what its command printed. Where a run failed for another reason than the probe declares, was stopped at its timeout or left no report - every run of an `invalid` probe, and any such run of a `flaky` one - `probe` shows the last 2,000 characters of its command's output, where the reason is. With the table that is on the standard error, for the first such run of each probe, under a line that names the probe and the run; with `--format json` it is `output` on each such run, and nothing is written beside the document. Colours are dropped and any other control character but the line feed and the tab is written as its escape, `\u001b`, so nothing in it reaches a terminal as a command. A `setup` that fails shows its output the same way.
- The evidence table it prints names the hash of the probe it measured with ([ADR-0007](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0007-probes-declare-their-failure.md)).
- A command, a `setup` as well as a `run`, is its shell, as a step is in CI: it is answered when its shell ends, by the shell's exit code and what was printed until then. A `run` is red, green or neither by those, and a `setup` has passed when the code is 0. What the command started and did not wait for is no part of the answer, so a command's work must be done when its shell ends: have it wait for what it starts.
- Where something the command started still holds its output once the shell has ended, as a server left in the background does, `probe` waits three seconds for that output, then reads no more of it and goes on; GitHub's runner does the same with a step, after five. The run's evidence then ends `, and something it started was left running, holding its output`. A `setup` that passed says so in a line on the standard error, `spec-harness: the probe setup "<line>" passed at base, and something it started was left running, holding its output`, and one that failed says it in the error that stops the probe. A process that writes to that output afterwards has the write fail, as it would once `probe` had ended. Send a process's output to a file and nothing is held, nothing waited for and nothing said; on Windows a process the shell started with `start /b` holds the command's output even so.
- What a command left running runs on beside the commands after it, as what a step left does in CI, and is stopped when `probe` is done at that commit, before the worktree is removed, as far as `probe` can still reach it ([ADR-0003](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0003-state-outside-the-work-tree.md)):
  - On Linux and macOS that is every process still in the command's process group, forced: what the shell put in the background with `&`, whether or not it holds the command's output. Not what moved to a session or a group of its own, as a daemon does, `setsid`, and a process Node starts `detached`.
  - On Windows it is nothing: once a command's shell has ended, nothing the command left can be found again.
  - What is out of reach runs on until it ends or you end it: through the runs after it, and through the head's when it was left at the base.
- A command whose shell still runs at its timeout - `probes.timeout` seconds, or for a `run` the probe's own `timeout` - is stopped, forced, with what `probe` can reach of what it started, and no more:
  - On Linux and macOS that is every process still in the command's process group: all the command started, except what moved to a session or a group of its own.
  - On Windows it is the command's shell and the processes under it, each found through a parent that still runs. A process whose parent has ended is not found.
- The timeout ends the wait as well. Three seconds after it has stopped what it can, the run is answered whether or not something still holds the command's output: it is a run stopped at its timeout, with what was printed until then, and its evidence says the same of what was left running. A `setup` answered so says it in the error that stops the probe.
- Interrupted - by Ctrl+C, SIGTERM or SIGHUP, or by Ctrl+Break on Windows - `probe` stops the commands still running, with the reach a timeout has, waits up to three seconds for their output, stops what earlier commands left, with the reach the end of a commit has, and removes the worktree before it exits.
- A worktree's directory that cannot be deleted - on Windows, one that something a command started is still running in - costs the verdict nothing: git forgets the worktree, `probe` prints and exits as it would have, and it names the directory it left on the standard error as it exits.
