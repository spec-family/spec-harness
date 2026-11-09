# The command line

## An input that names nothing

An option, an argument or a value that is given and names nothing is refused: exit 2, one line on stderr that names it and says what to do, nothing read or written for it. None is read as if it had not been given. `--root "$DIR"` where the variable is not set would otherwise run in the current directory, and the answer would look like the one that was asked for ([ADR-0005](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0005-a-guard-is-a-guardrail.md)).

- **An option a command does not read.** A command takes the options its answer depends on, and refuses any other by name, with the ones it takes: `doctor does not take --note; its options are --brief, --base, --root, --format and --strict`.

  | Command | Reads |
  | --- | --- |
  | `context`, `rulings` | `--brief`, `--base`, `--root`, `--format` |
  | `guard`, `audit`, `doctor` | `--brief`, `--base`, `--root`, `--format`, `--strict` |
  | `probe` | `--brief`, `--base`, `--root`, `--format`, `--id`, `--at` |
  | `premises` | `--brief`, `--root`, `--format`, `--strict` |
  | `escalate` | `--brief`, `--root`, `--format`, `--path`, `--reason`, `--option`, `--recommend`, `--list`, `--show` |
  | `rule` | `--root`, `--format`, `--allow`, `--deny`, `--note` |
  | `init` | `--root`, `--format`, `--write`, `--git-hook`, `--block-on-failure` |
  | `hook` | `--brief`, `--base`, `--root` |
  | `mcp` | `--root` |

  `init` chooses the base itself, and the server is told the brief and the base by each call, so neither takes `--base` or `--brief`: taking one would say the base or the brief had been set.
- **An option beside one that leaves it unread.** `escalate --list` and `escalate --show <id>` print what waits and raise nothing, and beside either only `--root` and `--format` are read: `escalate --list does not take --path; beside --list its options are --root and --format`. A request spelled out beside `--list` printed the list, exit 0, and was never raised.
- **A brief named twice.** `context`, `rulings`, `audit` and `probe` take the brief as their argument or as `--brief`, and refuse the two together, whatever they hold: `audit was given the brief twice, as its argument "012" and as --brief "013"; give one of them`. The argument won with no word. `SPEC_BRIEF` and the branch beside either are the [order](rounds.md#which-brief) as it stands.
- **An argument a command does not take.** `context`, `rulings`, `audit` and `probe` take one brief's id at most, `rule` one escalation's id, `guard` its paths and `hook` the word `claude` or `git`; `escalate`, `premises`, `init`, `mcp` and `doctor` take none. `init mydir` set up the directory it stood in; `init --root mydir` sets up another.
- **A value that names nothing.** An option that takes a value refuses one that is empty or only space, by the option's name: `--brief is "", which names no brief`. So does an argument, as in `guard ""`. No option gives an empty value a meaning: leave the option out for what the command does without it.
- **A `--root` that is no directory**, a file or a path that is not there: `--root is "nowhere", which is not a directory`.
- **An option that takes one value, given two.** `doctor --root nowhere --root .` ran in `.`, and `--brief 404 --brief 001` was brief 001: the parser kept the last, and the earlier went unread with no word. It is `--root is given twice, as "nowhere" and as ".", and one of the two would go unread; give it one`. Two values are compared as the option reads them, so the same thing given twice is the option once: `--root .` beside `--root ./`, a directory however it is spelt from where the command is started, a drive letter on Windows in either case (`--root C:\work` beside `--root c:\work`, which [spec-core's ADR-0005](https://github.com/spec-family/spec-core/blob/main/docs/adr/0005-the-family-contract.md) has every tool read as one: Windows names a volume by its letter in either case), and `--brief 12` beside `--brief 012`, a brief by its id as spec-brief's names are matched. A base, a format, an id and text are compared as written. `--path` and `--option` are lists, and each use adds to the list.
- **A `.spec-harness.json` that is a directory** does not load, and is said so in a line, as one that is not JSON is.

A line that is wrong is refused with `--help` or `--version` on it, each of the above and a command that is none, as an option no command has always was: `doctor --help --root a --root b` printed the help, exit 0. `--help` beside `--version` asks for two answers, of which one would go unread, and is refused: `--help is given beside --version, and one of the two answers would go unread; give one of them`. On a line that is right, either answers, a command that needs more than the line gives it among them, as `guard --help` does. Three things are read another way, each for its reason:

- **`hook claude` reads its line as every release has.** The line is in `.claude/settings.json` and in the Claude Code plugin of every release since 0.1.0, which a later release cannot rewrite, and exit 2 from it holds every write of a session, the one that would mend the line among them. So what it does not read is passed over as before, an empty `--brief` with the rest. The releases have handed the harness five command lines, `hook claude`, `hook git`, `mcp`, and `mcp --root` with the project or with `.`, and each is read as the release that wrote it read it ([ADR-0012](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0012-one-way-into-claude-code.md)).

  Two things on its line are said, and still refuse nothing. Each is one line to the person, as `systemMessage`, and exit 0, said where there is a write the line leaves unchecked: Claude Code goes on with the write. It was exit 1, which Claude Code counts as a hook that failed, and under `"onFailure": "block"` that held every write of the session. No release wrote more than `hook claude` on the hook's line, so either is a line a person changed.

  - **A `--root` that is a file, or is not there.** It read as a session outside a git work tree, exit 0 and no word, and the guard was off. It is `--root is "nowhere", which is not a directory, so the guard is off and this write is not checked`, with what to do. An empty `--root` is the directory the hook was started in, and guards there, as before.
  - **A line the parser cannot read**: an option no command has, as in `hook claude --nope`; an option left without its value, as `--root $DIR` is in a shell where the variable is not set; a `--format` or an `--at` that is none; two values for an option that takes one, whichever option it is, as in `hook claude --brief 001 --brief 404`, with `--help` beside them or not; `--help` beside `--version`; and `--help` or `--version` beside a `--root` that is a file or is not there, which the hook said only as it ran, and printed the help over, exit 0. Each was exit 2, as it is from every other command, and Claude Code blocks the tool call on a PreToolUse hook's exit 2: every write of the session waited on a line only a write can mend. It is `the hook's line cannot be read (Option '--root <value>' argument missing), so the guard is off and this write is not checked`, with what to do. The parser's own words stand between the brackets, on one line.

  Exit 2 from `hook claude` is kept for a write it could not check: a configuration that does not load, briefs that cannot be read, a brief that is named and is not one, an error nothing expected. `hook git` is not read this way. It stops one commit, exit 2, on a line a person reads, who can then mend the hook. Nor is a line that does not say `hook claude`, such as `hook` alone: the harness cannot tell whose it is. A hook entry that sets `"onFailure": "block"`, which Claude Code 2.1.295 and later read, has Claude Code hold the action when the hook fails: when it cannot start, runs past its timeout, or exits with a code other than 0 and 2, which no answer of the hook's is. `init --block-on-failure` writes the field; the plugin does not. [`doctor`](doctor.md) says each of these of a line it finds in Claude Code's settings, before any write meets it.
- **`doctor` says an empty `--brief` or `--base` in its report**, as it says a brief spec-brief does not know: a diagnosis is what a person runs when something is wrong, and it reports what is wrong with what it was given. It exits 1 for either: the question it was asked names nothing.
- **`SPEC_BRIEF` set and empty is as unset**, since what sets it sets it whether or not there is a round ([Which brief](rounds.md#which-brief)).

**In a tool call.** The server's tools refuse the same in their arguments, with a tool error that names the argument, as in `"paths[1]" is "", which names no file`: an empty `brief` or `base`, an empty path, an empty `recommendation`, an option whose `label` is empty. An argument a tool does not take was refused already. A `brief` spec-brief does not know, or has archived, is said of the argument too, `"brief" names brief 999, and spec-brief knows no such brief`, where the line called it the flag.

## Exit codes

| Code | Means |
| --- | --- |
| `0` | Clean. |
| `1` | Refused, found something, or waiting on a person. From `hook claude`, also what it says and holds no write for: a question it cannot read, and a line of its own it cannot read or whose `--root` is no directory. |
| `2` | The answer cannot be trusted, or did not arrive. An option, an argument or a value that [names nothing](#an-input-that-names-nothing) is one. A git command that failed is one, and so is a stdout its reader closed before all of the output was written, as a pipeline into `head` does: each is one line on stderr. An error the harness did not expect is one too: `spec-harness: unexpected error:` and its stack, on stderr. |
| `130` | A `probe` interrupted by SIGINT (Ctrl+C) while it runs. |
| `143` | A `probe` interrupted by SIGTERM. |
| `129` | A `probe` interrupted by SIGHUP. |
| `149` | A `probe` interrupted by SIGBREAK, which is Ctrl+Break on Windows. |

An interrupted `probe` exits as a shell reports a process the signal ended.
