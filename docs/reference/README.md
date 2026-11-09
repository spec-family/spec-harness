# The spec-harness reference

Everything spec-harness does: every command, flag, hook, MCP tool, configuration key, `doctor` check and output format, with the reasons each is the way it is. The [README](../../README.md) is the front page. The family's guides are spec-core's: the [tutorial](https://github.com/spec-family/spec-core/blob/main/docs/tutorial.md) takes one round from the brief to the archive, [adopting](https://github.com/spec-family/spec-core/blob/main/docs/adopting.md) goes from one tool to the whole loop and its CI, and [concepts](https://github.com/spec-family/spec-core/blob/main/docs/concepts.md) defines the family's words. The decisions behind the behaviour, and what each costs, are the [ADRs](https://github.com/spec-family/spec-harness/blob/main/docs/adr/README.md).

This reference ships in the package, in `node_modules/@spec-family/spec-harness/docs/reference/`, so the copy a project installed describes the release it runs.

| Page | What it holds |
| --- | --- |
| [Installing](install.md) | The package's name, and the name without the scope that is not this project; the releases of the siblings, Claude Code and git it needs; the Claude Code plugin, from GitHub or a mirror, and why not beside `init`; a repository that is not Node. |
| [A round](rounds.md) | Which brief a command acts on, and what names it; worktrees, and the branches an app makes; what each layer catches of a session that writes through a shell. |
| [`context`](context.md) | The packet an agent starts a round with, the rules spec-guard is asked about, and what could not be read. |
| [`guard` and the hooks](guard.md) | May the round write this path: the answer, the Claude Code hook before and after a write, as a session starts and as a turn ends, git's pre-commit hook, and their limits. |
| [`escalate`, `rule`, `rulings`](rulings.md) | Asking a person to rule, the ruling a signature makes count, what it proves, the spec-brief plugin, and merging a round. |
| [`audit`](audit.md) | One report on a round: the archive, the assertions, the rulings, the dependencies and install scripts; what it measured and could not; the formats for a forge. |
| [`probe`](probe.md) | A defect measured before it is filed: red at the base for the declared reason, green at the head, and what a probe's commands may rely on. |
| [`premises`](premises.md) | Whether every live brief is still about something true, for CI. |
| [`mcp`](mcp.md) | The MCP server: its tools, the work tree each reads, and the arguments it refuses. |
| [`init`](init.md) | What `init` configures in each tool, file by file, and what it leaves to you. |
| [`doctor`](doctor.md) | Every check `doctor` makes, what fails it, and its JSON. |
| [The command line](command-line.md) | The options each command takes, the input that names nothing and is refused, and the exit codes. |
| [Configuration](configuration.md) | Every key of `.spec-harness.json`, with its default. |
