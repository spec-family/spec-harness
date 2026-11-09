# Installing

## Names

The package is `@spec-family/spec-harness`, and the command it installs is `spec-harness`. The name without the scope is not this project: on npm, `spec-harness` is another publisher's package, and it installs a command of the same name.

`npx` fetches and runs the package of whatever name it is given when the project has none installed - a fresh clone, a worktree before `npm ci`, a CI job without the install step - and without a terminal, as under an agent, it does not ask first. So give `npx` the full name:

- `npx --no-install @spec-family/spec-harness` in a project that installed it: it runs that install, the version the lockfile pins, and where there is none it stops with an error that names this package. Every command in the README, in this reference and in the skills is written so.
- `npx @spec-family/spec-harness`, without `--no-install`, fetches this package where nothing is installed. The harness works from a project's install, its own and spec-brief's, so that is for a look at `--help` and little else.

<!-- bare-name: the two forms in the next sentence are shown as what not to write -->
Never `npx spec-harness`, and not `npx --no-install spec-harness` either: `--no-install` stops a download, and npm still runs a copy of the other package that an earlier fetch left in its cache, and where nothing is installed it reports that package, by its own version, as the one to install. If the bare name was ever run through `npx` on a machine, in a tree without the install, empty npm's cache of fetched commands there: the `_npx` directory below the path `npm config get cache` prints.

The same holds for the siblings: `@spec-family/spec-brief`, `@spec-family/spec-guard` and `@spec-family/spec-graph`, whose names without the scope belonged to nobody on npm on 2026-10-07. The hooks, the MCP server and git's hook go through no `npx` at all: they run `node` with the path of the installed file ([ADR-0012](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0012-one-way-into-claude-code.md)). The family's [adopting guide](https://github.com/spec-family/spec-core/blob/main/docs/adopting.md#names) has what was measured, under npm 10, 11 and 12.

## Requirements

- **spec-brief 0.12.0 or later**, required: the brief is the contract, spec-brief is its reader, and 0.12.0 is its first release as `@spec-family/spec-brief`, the only name a sibling is found under. Its archive asks this package's spec-brief plugin about signed rulings, as every release from 0.2.0 on has.
- **spec-guard 0.30.0 and spec-graph 0.21.0 or later**, used when they are installed: their first releases under the same scope. Their absence is reported, never assumed clean.
- **Claude Code 2.1.139 or later** runs the guard hooks and the Claude Code plugin's server: the hooks pass the project's path in a hook's `args`, which Claude Code reads from that release on, and the plugin's server names `${CLAUDE_PROJECT_DIR}`, which a Claude Code plugin may from the same release ([ADR-0012](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0012-one-way-into-claude-code.md)). An older Claude Code runs every write unguarded, so `doctor` checks the one on `PATH`.
- **git 2.31 or later**: spec-harness asks git where its shared directory and its hooks are with `rev-parse --path-format`, which that release added (2021).

A sibling installed below its minimum is never run: `doctor` and every command that needed it name the minimum ([ADR-0011](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0011-releases-are-staged-by-ci.md)).

## As a Claude Code plugin

spec-harness ships two different things called a plugin. This section is the **Claude Code plugin**, installed into Claude Code. The **spec-brief plugin**, `@spec-family/spec-harness/spec-brief-plugin`, is a module spec-brief's archive loads to learn of signed rulings; `init` configures it ([`escalate`, `rule`, `rulings`](rulings.md)).

The repository is a Claude Code plugin and a one-plugin marketplace: the four skills (`draft-brief`, `split-goal`, `run-round`, `close-round`), the hooks and the MCP server. The hooks and the server run the `spec-harness` installed in your project, `node ${CLAUDE_PROJECT_DIR}/node_modules/@spec-family/spec-harness/bin/spec-harness.js`, so install it there first, in every project the plugin guards: without it the hooks cannot start, and [`doctor`](doctor.md) exits 1. The server is told the project with `--root`, since Claude Code starts a plugin's server in the plugin's own directory. It needs Claude Code 2.1.139 or later.

```text
/plugin marketplace add spec-family/spec-harness
/plugin install spec-harness@spec-tools
```

### From a mirror

`spec-family/spec-harness` is GitHub shorthand, fetched from github.com. Where GitHub cannot be reached, as on a company network, mirror the repository and add the mirror by its full git URL; the plugin is `spec-harness@spec-tools` either way:

```text
/plugin marketplace add https://gitlab.example.com/tools/spec-harness.git
/plugin install spec-harness@spec-tools
```

### The plugin or `init`, not both

The Claude Code plugin's hooks and server are the ones `init` writes into `.claude/settings.json` and `.mcp.json`: use one or the other. With both, every write is guarded twice and the server is registered twice.

- `init` run while the plugin is on writes neither.
- The other order, `init` first and the plugin after, nothing prevents: Claude Code runs a plugin's hooks as the plugin ships them.
- A plugin hook that stood down because it believed `init`'s ran could leave no guard at all: Claude Code reads no hooks from `.claude/settings.json` in a session that spans several repositories, and managed settings can turn off the settings' hooks while those of a plugin they force on keep running ([ADR-0012](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0012-one-way-into-claude-code.md)).

So after installing the plugin where `init` has run:

1. Run `npx --no-install @spec-family/spec-harness doctor`: a double install exits 1.
2. Take the `spec-harness` entries out of those two files, or turn the plugin off for the project.

## In a repository that is not Node

The hooks, the server and git's hook run the spec-harness installed in the project, so a .NET, Java or Python repository installs the tools as a Node project does, and its build never sees them:

1. A `package.json` at the root holding `{ "private": true }`. `private` keeps npm from ever publishing it.
2. `npm install --save-dev @spec-family/spec-harness @spec-family/spec-brief`, and `@spec-family/spec-guard` for the rules and the assertions. npm writes the tools as `devDependencies`, and `package-lock.json` pins them.
3. `node_modules/` in `.gitignore`.
4. `npm ci` after a clone and in CI, which installs what the lock pins.

The hooks name `${CLAUDE_PROJECT_DIR}/node_modules/@spec-family/spec-harness/bin/spec-harness.js`, not `npx` or a global install:

- Claude Code starts a hook wherever the session stands and a plugin's server in the plugin's directory, so neither can rely on `npx` finding the project's install.
- On Windows `npx` is a shim that cannot start without a shell.
- The copy in the project is the version the project pinned, the one `doctor` checks the siblings against.

git's hook names the same script, `node_modules/@spec-family/spec-harness/bin/spec-harness.js`, from the top of the work tree, where git starts it. `npx` would start npm to start node on every commit.

A person who runs the tools by hand runs `npx --no-install @spec-family/spec-harness`, from the root, giving `npx` the package's [full name](#names).
