import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { GUARD_HOOK, mcpServer, mergeMcp, PLUGIN, PRE_COMMIT, PROJECT_DIR_OR_HERE } from '../../src/configure.js';
import { stateDirectory, StateError } from '../../src/fs.js';
import { claudeCodeWiring, claudeSettingsFiles, pluginDirectories } from '../../src/round.js';
import { gitHook, NOT_INSTALLED } from '../../src/setup.js';
import { brief, BRIEF_FILE, claudeOf, cleanup, cli, git, install, installFake, installHarness, installPlugin, parsed, repository, siblings, temp, write, type Repository } from './helpers.js';

afterAll(cleanup);

/** A repository with spec-brief installed where `locate()` looks for it, and no configuration of its own. */
function installed(): Repository {
  const repo = repository({ 'README.md': '# x\n' }, null);
  install(repo.root, 'spec-brief');
  return repo;
}

/** Every file in the work tree but .git and node_modules, with its content. */
function snapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (directory: string, prefix: string): void => {
    for (const name of readdirSync(directory)) {
      if (name === '.git' || name === 'node_modules') continue;
      const path = join(directory, name);
      if (statSync(path).isDirectory()) walk(path, `${prefix}${name}/`);
      else out[`${prefix}${name}`] = `${statSync(path).size}`;
    }
  };
  walk(root, '');
  return out;
}

interface Step {
  file: string;
  action: string;
  detail: string;
}

describe('init', () => {
  it('prints the plan and changes nothing without --write', async () => {
    const repo = installed();
    const before = snapshot(repo.root);
    const result = await cli(['init'], repo.root);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('run     .spec-brief.json\n        spec-brief init');
    expect(result.stdout).toContain(
      `update  .spec-brief.json\n        load spec-harness's plugin, "${PLUGIN}": spec-brief's archive asks it whether a signed ruling allows a protected file, and refuses the file without it; measure the archive from main, as spec-harness does: without a base, spec-brief's archive warns that the scope went unmeasured and checks no protected file\n`,
    );
    expect(result.stdout).toContain(
      'create  .spec-harness.json\n        rounds are measured from main, the branch init runs on: no remote records a default branch (refs/remotes/origin/HEAD); change "base" if rounds merge into another\n',
    );
    expect(result.stdout).toContain('create  .claude/settings.json');
    expect(result.stdout).toContain('create  .mcp.json');
    expect(result.stdout).toContain('advise  .github/allowed_signers');
    expect(result.stdout.endsWith('\nNothing was changed. Run again with --write to apply the plan.\n')).toBe(true);
    expect(snapshot(repo.root)).toEqual(before);
  });

  it('applies the plan with --write, and a second run changes nothing', async () => {
    const repo = installed();
    const first = await cli(['init', '--write', '--format', 'json'], repo.root);
    expect(first.code).toBe(0);
    const steps = parsed<{ command: string; written: boolean; steps: Step[] }>(first);
    expect(steps.command).toBe('init');
    expect(steps.written).toBe(true);
    expect(steps.steps.map((s) => [s.file, s.action])).toEqual([
      ['.spec-brief.json', 'run'],
      ['.spec-brief.json', 'update'],
      ['.spec-harness.json', 'create'],
      ['.claude/settings.json', 'create'],
      ['.mcp.json', 'create'],
      ['.git/hooks/pre-commit', 'advise'],
      ['package.json', 'advise'],
      ['.github/allowed_signers', 'advise'],
    ]);
    // The lines it writes run the package's script, which this project has not installed yet.
    expect(steps.steps.find((s) => s.file === 'package.json')?.detail).toBe(NOT_INSTALLED);
    const briefConfig = JSON.parse(repo.read('.spec-brief.json'));
    expect(briefConfig.plugins).toEqual([PLUGIN]);
    // Everything spec-brief init spelled out is still there.
    expect(briefConfig).toMatchObject({ briefs: 'briefs', archive: 'briefs/archive' });
    expect(JSON.parse(repo.read('.spec-harness.json'))).toEqual({ base: 'main' });
    const settings = JSON.parse(repo.read('.claude/settings.json'));
    expect(settings.hooks.PreToolUse[0].hooks[0]).toEqual(GUARD_HOOK);
    expect(settings.hooks.PostToolUse[0].hooks[0]).toEqual(GUARD_HOOK);
    expect(JSON.parse(repo.read('.mcp.json'))).toEqual({ mcpServers: { 'spec-harness': mcpServer(PROJECT_DIR_OR_HERE) } });

    const settled = snapshot(repo.root);
    const contents = ['.spec-brief.json', '.spec-harness.json', '.claude/settings.json', '.mcp.json'].map((file) => repo.read(file));
    const second = await cli(['init', '--write'], repo.root);
    expect(second.code).toBe(0);
    expect(second.stdout).toContain('keep    .spec-brief.json\n        briefs in briefs/, the archive in briefs/archive/');
    expect(second.stdout).toContain("keep    .spec-brief.json\n        spec-harness's plugin is loaded, and the archive is measured from main\n");
    expect(second.stdout).toContain('keep    .claude/settings.json\n        the guard hooks are installed');
    expect(second.stdout).toContain('keep    .mcp.json\n        the spec-harness server is registered');
    expect(second.stdout).not.toContain('Nothing was changed');
    expect(snapshot(repo.root)).toEqual(settled);
    expect(['.spec-brief.json', '.spec-harness.json', '.claude/settings.json', '.mcp.json'].map((file) => repo.read(file))).toEqual(contents);
  });

  it('says, where the project has not installed the package every way in runs, that it has not, and nothing once it has', async () => {
    const note = (steps: readonly Step[]) => steps.filter((s) => s.file === 'package.json');
    const plan = async (root: string, ...more: string[]) => parsed<{ steps: Step[] }>(await cli(['init', '--format', 'json', ...more], root)).steps;
    const repo = installed();
    expect(note(await plan(repo.root))).toEqual([{ file: 'package.json', action: 'advise', detail: NOT_INSTALLED }]);
    expect(NOT_INSTALLED).toBe(
      "the hooks, the server and git's hook, init's and the plugin's alike, run node_modules/@spec-family/spec-harness/bin/spec-harness.js, which is not installed here: install the package, npm install --save-dev @spec-family/spec-harness, since until it is, Claude Code cannot start the hooks or the server and lets each write go ahead, and git's hook stops every commit",
    );
    // Said once the lines are written as well, and where the plugin would bring them: each runs the package.
    await cli(['init', '--write'], repo.root);
    expect((await plan(repo.root)).filter((s) => s.action === 'create' || s.action === 'update')).toEqual([]);
    expect(note(await plan(repo.root))).toEqual([{ file: 'package.json', action: 'advise', detail: NOT_INSTALLED }]);
    // Installed, nothing is said.
    installHarness(repo.root);
    expect(note(await plan(repo.root, '--git-hook'))).toEqual([]);
    // In a linked worktree, the main work tree's install is one a line can name.
    const tree = join(temp(), 'w');
    repo.git('worktree', 'add', '-q', '-b', 'w', tree);
    expect(note(await plan(tree, '--git-hook'))).toEqual([]);
    rmSync(join(repo.root, 'node_modules', '@spec-family', 'spec-harness'), { recursive: true });
    expect(note(await plan(tree))).toEqual([{ file: 'package.json', action: 'advise', detail: NOT_INSTALLED }]);
    // A repository that keeps its git directory apart names no main work tree: its own is the one place.
    const apart = temp();
    git(apart, 'init', '-q', '-b', 'main', `--separate-git-dir=${join(temp(), 'kept.git')}`);
    install(apart, 'spec-brief');
    expect(note(await plan(apart))).toEqual([{ file: 'package.json', action: 'advise', detail: NOT_INSTALLED }]);
    installHarness(apart);
    expect(note(await plan(apart))).toEqual([]);
  });

  it('writes onFailure "block" on its own entries only when asked, onto entries a run before wrote too, and never onto a person\'s', async () => {
    const BLOCKS = { ...GUARD_HOOK, onFailure: 'block' };
    const HOLDS = `onFailure "block" on init's PreToolUse, PostToolUse and SessionStart entries, so that Claude Code 2.1.295 or later holds a write where the hook cannot start or runs past its timeout`;
    const entries = (repo: Repository): unknown[] => {
      const { hooks } = JSON.parse(repo.read('.claude/settings.json')) as { hooks: Record<string, { hooks: unknown[] }[]> };
      return ['PreToolUse', 'PostToolUse', 'SessionStart'].map((event) => hooks[event]?.[0]?.hooks[0]);
    };
    // Not asked: no entry carries it, as in every release.
    const plain = installed();
    const first = await cli(['init', '--write'], plain.root);
    expect(first.code).toBe(0);
    expect(first.stdout).not.toContain('onFailure');
    expect(entries(plain)).toEqual([GUARD_HOOK, GUARD_HOOK, GUARD_HOOK]);
    // Asked, on a file that holds them already: each of the three is given it, and a run after changes nothing.
    const plan = await cli(['init', '--block-on-failure'], plain.root);
    expect(plan.stdout).toContain(`update  .claude/settings.json\n        ${HOLDS}\n`);
    expect(entries(plain)).toEqual([GUARD_HOOK, GUARD_HOOK, GUARD_HOOK]);
    expect((await cli(['init', '--write', '--block-on-failure'], plain.root)).code).toBe(0);
    expect(entries(plain)).toEqual([BLOCKS, BLOCKS, BLOCKS]);
    expect((await cli(['init', '--block-on-failure'], plain.root)).stdout).toContain('keep    .claude/settings.json\n        the guard hooks are installed\n');
    // Without the option a run takes nothing away.
    expect((await cli(['init', '--write'], plain.root)).stdout).toContain('keep    .claude/settings.json\n');
    expect(entries(plain)).toEqual([BLOCKS, BLOCKS, BLOCKS]);
    // Asked on a file that has none: written with the entries, and said after them.
    const fresh = installed();
    const written = await cli(['init', '--write', '--block-on-failure'], fresh.root);
    expect(written.stdout).toContain("create  .claude/settings.json\n        the guard hooks, run with node from the project's install: ");
    expect(written.stdout).toContain(`; ${HOLDS}\n`);
    expect(entries(fresh)).toEqual([BLOCKS, BLOCKS, BLOCKS]);
    // A line a person wrote is theirs, the field with the rest of it.
    const theirs = { type: 'command', command: 'node', args: [...(GUARD_HOOK['args'] as string[]), '--base', 'main'] };
    const person = repository({ '.claude/settings.json': JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Edit|Write|MultiEdit|NotebookEdit', hooks: [theirs] }], PostToolUse: [{ matcher: 'Edit|Write|MultiEdit|NotebookEdit', hooks: [theirs] }] } }) });
    const kept = person.read('.claude/settings.json');
    const left = await cli(['init', '--write', '--block-on-failure'], person.root);
    expect(left.stdout).toContain('keep    .claude/settings.json\n        "hook claude --base main" in .claude/settings.json is more than init writes, and guards');
    expect(person.read('.claude/settings.json')).toBe(kept);
    // A file that holds a line that turns the guard off is the person's to mend, and is left as it is, init's own entries in it with the rest.
    const off = { ...theirs, args: [...(GUARD_HOOK['args'] as string[]), '--nope'] };
    const broken = repository({ '.claude/settings.json': JSON.stringify({ hooks: { PreToolUse: [{ hooks: [off, GUARD_HOOK] }], PostToolUse: [{ hooks: [off, GUARD_HOOK] }] } }) });
    const before = broken.read('.claude/settings.json');
    expect((await cli(['init', '--write', '--block-on-failure'], broken.root)).stdout).toContain('advise  .claude/settings.json\n');
    expect(broken.read('.claude/settings.json')).toBe(before);
  });

  it('merges into settings that exist, keeping the person\'s own hooks and servers', async () => {
    const lint = { matcher: 'Write', hooks: [{ type: 'command', command: 'npm run lint' }] };
    const repo = repository({
      '.spec-brief.json': JSON.stringify({ briefs: 'docs/briefs' }),
      '.claude/settings.json': JSON.stringify({ permissions: { allow: ['Bash(ls)'] }, hooks: { PreToolUse: [lint] } }),
      '.mcp.json': JSON.stringify({ mcpServers: { other: { command: 'x' } } }),
    });
    const result = await cli(['init', '--write'], repo.root);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('keep    .spec-brief.json\n        briefs in docs/briefs/, the archive in docs/briefs/archive/');
    expect(result.stdout).toContain("update  .spec-brief.json\n        load spec-harness's plugin");
    expect(JSON.parse(repo.read('.spec-brief.json'))).toEqual({ briefs: 'docs/briefs', plugins: [PLUGIN], archiving: { base: 'main' } });
    expect(result.stdout).toContain('keep    .spec-harness.json\n        rounds are measured from main\n');
    const settings = JSON.parse(repo.read('.claude/settings.json'));
    expect(settings.permissions).toEqual({ allow: ['Bash(ls)'] });
    expect(settings.hooks.PreToolUse).toHaveLength(2);
    expect(settings.hooks.PreToolUse[0]).toEqual(lint);
    expect(settings.hooks.PreToolUse[1].hooks[0]).toEqual(GUARD_HOOK);
    expect(JSON.parse(repo.read('.mcp.json')).mcpServers.other).toEqual({ command: 'x' });
    expect((await cli(['init'], repo.root)).stdout).toContain('keep    .claude/settings.json');
  });

  it('advises by hand for a file it cannot read, and leaves it alone', async () => {
    const repo = repository({ '.claude/settings.json': '{ not json', '.mcp.json': '[]', '.spec-brief.json': '{', '.spec-graph.json': 'x' }, { tools: { ...siblings(), 'spec-graph': ['node', 'graph.js'] } });
    const result = await cli(['init', '--write'], repo.root);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`advise  .claude/settings.json\n        cannot be read as JSON; add the guard as a PreToolUse and a PostToolUse hook by hand: ${JSON.stringify(GUARD_HOOK)}`);
    expect(result.stdout).toContain('advise  .mcp.json\n        cannot be read as JSON; add the spec-harness server by hand');
    expect(result.stdout).toContain('advise  .spec-graph.json\n        cannot be read as JSON; add "historyPatterns": ["briefs/archive/**"] by hand');
    expect(repo.read('.spec-graph.json')).toBe('x');
    expect(result.stdout).toContain('keep    .spec-brief.json\n        briefs in briefs/, the archive in briefs/archive/');
    expect(result.stdout).toContain(`advise  .spec-brief.json\n        cannot be read as JSON; add "plugins": ["${PLUGIN}"], and "archiving": { "base": "main" } by hand`);
    expect(repo.read('.spec-brief.json')).toBe('{');
    expect(repo.read('.claude/settings.json')).toBe('{ not json');
    expect(repo.read('.mcp.json')).toBe('[]');
  });

  it('loads the plugin in spec-brief.json when that is the configuration spec-brief reads', async () => {
    const repo = repository({ 'spec-brief.json': JSON.stringify({ plugins: [{ module: './x.mjs' }] }) });
    const result = await cli(['init', '--write', '--format', 'json'], repo.root);
    expect(parsed<{ steps: Step[] }>(result).steps.filter((step) => step.file.endsWith('spec-brief.json')).map((step) => [step.file, step.action])).toEqual([
      ['spec-brief.json', 'keep'],
      ['spec-brief.json', 'update'],
    ]);
    expect(JSON.parse(repo.read('spec-brief.json'))).toEqual({ plugins: [{ module: './x.mjs' }, PLUGIN], archiving: { base: 'main' } });
    expect(existsSync(join(repo.root, '.spec-brief.json'))).toBe(false);
  });

  it('tells spec-graph that the archive is history, and says it reads no brief where its patterns miss them', async () => {
    const graph = { tools: { ...siblings(), 'spec-graph': ['node', 'graph.js'] } };
    const repo = repository({ '.spec-brief.json': JSON.stringify({ briefs: 'b', archive: 'old' }) }, graph);
    const result = await cli(['init', '--write'], repo.root);
    expect(result.stdout).toContain(
      'create  .spec-graph.json\n        read old/** as history, for when spec-graph reads the briefs; its patterns do not reach b/, so it checks none of them now: add "b/**/*.md" to its "patterns" if it should\n',
    );
    expect(JSON.parse(repo.read('.spec-graph.json'))).toEqual({ historyPatterns: ['old/**'] });
    expect((await cli(['init'], repo.root)).stdout).toContain('keep    .spec-graph.json\n        old/** is history, for when spec-graph reads the briefs');

    const read = repository({ '.spec-brief.json': JSON.stringify({ briefs: 'docs/briefs' }) }, graph);
    expect((await cli(['init'], read.root)).stdout).toContain(
      'create  .spec-graph.json\n        read docs/briefs/archive/** as history: an archived brief is a record whatever its status says, so a live brief that depends on one is not a stale premise\n',
    );
  });

  it('merges into the configuration spec-graph reads, and never shadows the key in package.json', async () => {
    const graph = { tools: { ...siblings(), 'spec-graph': ['node', 'graph.js'] } };
    const named = repository({ 'spec-graph.config.json': JSON.stringify({ patterns: ['briefs/**/*.md'] }) }, graph);
    const result = await cli(['init', '--write'], named.root);
    expect(result.stdout).toContain('update  spec-graph.config.json\n        read briefs/archive/** as history: an archived brief is a record');
    expect(JSON.parse(named.read('spec-graph.config.json'))).toEqual({ patterns: ['briefs/**/*.md'], historyPatterns: ['briefs/archive/**'] });
    expect(existsSync(join(named.root, '.spec-graph.json'))).toBe(false);

    const keyed = repository({ 'package.json': JSON.stringify({ name: 'x', 'spec-graph': { patterns: ['docs/**/*.md'] } }) }, graph);
    const advised = await cli(['init', '--write'], keyed.root);
    expect(advised.stdout).toContain(
      'advise  package.json\n        spec-graph reads its configuration from the "spec-graph" key here, which init does not edit: add "briefs/archive/**" to its "historyPatterns" by hand\n',
    );
    expect(existsSync(join(keyed.root, '.spec-graph.json'))).toBe(false);
    // A package.json without the key is spec-graph's defaults, and gets a file.
    const plain = repository({ 'package.json': JSON.stringify({ name: 'x' }) }, graph);
    expect((await cli(['init'], plain.root)).stdout).toContain('create  .spec-graph.json\n');
  });

  it('replaces the npx hooks and server 0.1 installed, keeping everything else', async () => {
    const legacy = { type: 'command', command: 'npx --no-install spec-harness hook claude', timeout: 60 };
    const repo = repository({
      '.claude/settings.json': JSON.stringify({ model: 'm', hooks: { PreToolUse: [{ matcher: 'Edit|Write|MultiEdit|NotebookEdit', hooks: [legacy] }], PostToolUse: [{ matcher: 'Edit|Write|MultiEdit|NotebookEdit', hooks: [legacy] }] } }),
      '.mcp.json': JSON.stringify({ mcpServers: { other: { command: 'x' }, 'spec-harness': { command: 'npx', args: ['--no-install', 'spec-harness', 'mcp'] } } }),
    });
    const result = await cli(['init', '--write'], repo.root);
    expect(result.stdout).toContain('update  .claude/settings.json\n        the guard hooks, run with node from the project\'s install');
    expect(result.stdout).toContain('update  .mcp.json\n        the spec-harness MCP server, run with node from the project\'s install');
    const settings = JSON.parse(repo.read('.claude/settings.json'));
    expect(settings.model).toBe('m');
    expect(settings.hooks.PreToolUse).toEqual([{ matcher: 'Edit|Write|MultiEdit|NotebookEdit', hooks: [GUARD_HOOK] }]);
    expect(settings.hooks.PostToolUse).toEqual([{ matcher: 'Edit|Write|MultiEdit|NotebookEdit', hooks: [GUARD_HOOK] }]);
    expect(JSON.parse(repo.read('.mcp.json'))).toEqual({ mcpServers: { other: { command: 'x' }, 'spec-harness': mcpServer(PROJECT_DIR_OR_HERE) } });
  });

  it('advises installing spec-brief when it is not there to ask', async () => {
    const repo = repository({}, null);
    const result = await cli(['init'], repo.root);
    expect(result.stdout).toContain('advise  .spec-brief.json\n        spec-brief is not installed here: npm install --save-dev @spec-family/spec-brief');
  });

  it('advises upgrading a sibling older than this release runs, and runs nothing of it', async () => {
    const repo = repository({}, null);
    installFake(repo.root, 'spec-brief', JSON.stringify({ version: '0.1.0' }));
    installFake(repo.root, 'spec-graph', JSON.stringify({ version: '0.20.0' }));
    const result = await cli(['init', '--write', '--format', 'json'], repo.root);
    expect(result.code).toBe(0);
    const steps = parsed<{ steps: Step[] }>(result).steps;
    expect(steps.filter((step) => step.file === '.spec-brief.json' || step.file === '.spec-graph.json')).toEqual([
      {
        file: '.spec-brief.json',
        action: 'advise',
        detail: 'spec-brief 0.1.0 is installed here; spec-harness needs 0.12.0 or later: npm install --save-dev @spec-family/spec-brief@latest',
      },
      {
        file: '.spec-graph.json',
        action: 'advise',
        detail: 'spec-graph 0.20.0 is installed here; spec-harness needs 0.21.0 or later: npm install --save-dev @spec-family/spec-graph@latest',
      },
    ]);
    expect(existsSync(join(repo.root, '.spec-brief.json'))).toBe(false);
    expect(existsSync(join(repo.root, '.spec-graph.json'))).toBe(false);
  });

  it('names the remote\'s default branch as the base', async () => {
    const repo = repository({}, null);
    repo.git('update-ref', 'refs/remotes/origin/trunk', 'HEAD');
    repo.git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk');
    const result = await cli(['init', '--write'], repo.root);
    expect(result.stdout).toContain('create  .spec-harness.json\n        rounds are measured from origin/trunk');
    expect(JSON.parse(repo.read('.spec-harness.json'))).toEqual({ base: 'origin/trunk' });
  });

  it('names main when a remote was added and pushed to, which records no default branch', async () => {
    const remote = temp();
    execFileSync('git', ['init', '-q', '--bare', remote]);
    const repo = repository({}, null);
    repo.git('remote', 'add', 'origin', remote);
    repo.git('push', '-q', '-u', 'origin', 'main');
    repo.git('fetch', '-q', 'origin');
    // git 2.48 and later record the remote's HEAD when they fetch; earlier
    // releases, and a push alone, leave none. The repository is left as those do.
    repo.git('update-ref', '--no-deref', '-d', 'refs/remotes/origin/HEAD');
    expect(() => repo.git('rev-parse', '--verify', '--quiet', 'refs/remotes/origin/HEAD')).toThrow();
    expect(repo.git('rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main')).toBe(repo.git('rev-parse', 'HEAD'));
    const result = await cli(['init', '--write'], repo.root);
    expect(result.stdout).toContain('create  .spec-harness.json\n        rounds are measured from main, the branch init runs on');
    expect(JSON.parse(repo.read('.spec-harness.json'))).toEqual({ base: 'main' });
  });

  it('names the only branch, whatever it is called', async () => {
    const repo = repository({}, null);
    repo.git('branch', '-m', 'main', 'trunk');
    const result = await cli(['init', '--write'], repo.root);
    expect(result.stdout).toContain('create  .spec-harness.json\n        rounds are measured from trunk, the only branch');
    expect(JSON.parse(repo.read('.spec-harness.json'))).toEqual({ base: 'trunk' });
  });

  it('names the branch of a repository with no commit yet, the only branch there will be', async () => {
    const root = temp();
    execFileSync('git', ['init', '-q', '-b', 'trunk'], { cwd: root });
    expect((await cli(['init'], root)).stdout).toContain('create  .spec-harness.json\n        rounds are measured from trunk, the only branch:');
  });

  it('asks the person for the base when it cannot tell one, and writes nothing for it', async () => {
    const repo = repository({}, null);
    repo.git('checkout', '-q', '-b', 'brief/001-x');
    const result = await cli(['init', '--write'], repo.root);
    expect(result.stdout).toContain(
      'advise  .spec-harness.json\n        no base can be told: no remote records a default branch (refs/remotes/origin/HEAD), and brief/001-x is not main, master or the only branch; set "base" to the branch rounds merge into, or run git remote set-head origin --auto and init again\n',
    );
    expect(existsSync(join(repo.root, '.spec-harness.json'))).toBe(false);
  });

  it('adds the base to a configuration that names none, keeping the rest', async () => {
    const repo = repository({ '.spec-brief.json': '{}' }, null);
    repo.write('.spec-harness.json', '{ "outOfScope": "ask", "base": null }\n');
    const result = await cli(['init', '--write'], repo.root);
    expect(result.stdout).toContain('update  .spec-harness.json\n        rounds are measured from main, the branch init runs on');
    expect(JSON.parse(repo.read('.spec-harness.json'))).toEqual({ outOfScope: 'ask', base: 'main' });
  });

  it('adds the base to a configuration without the key, as to one that names none', async () => {
    const repo = repository({ '.spec-brief.json': '{}' }, null);
    repo.write('.spec-harness.json', '{ "outOfScope": "ask" }\n');
    const result = await cli(['init', '--write'], repo.root);
    expect(result.stdout).toContain('update  .spec-harness.json\n        rounds are measured from main, the branch init runs on');
    expect(JSON.parse(repo.read('.spec-harness.json'))).toEqual({ outOfScope: 'ask', base: 'main' });
  });

  it('says only what spec-brief lacks: the base alone once it loads the plugin, the plugin alone with no base to name', async () => {
    const loaded = repository({ '.spec-brief.json': JSON.stringify({ plugins: [PLUGIN] }) });
    expect((await cli(['init'], loaded.root)).stdout).toContain(
      "update  .spec-brief.json\n        measure the archive from main, as spec-harness does: without a base, spec-brief's archive warns that the scope went unmeasured and checks no protected file\n",
    );
    const unbased = repository({ '.spec-brief.json': '{}' }, null);
    unbased.git('checkout', '-q', '-b', 'brief/001-x');
    expect((await cli(['init'], unbased.root)).stdout).toContain(
      `update  .spec-brief.json\n        load spec-harness's plugin, "${PLUGIN}": spec-brief's archive asks it whether a signed ruling allows a protected file, and refuses the file without it\n`,
    );
    const kept = repository({ '.spec-brief.json': JSON.stringify({ plugins: [PLUGIN] }) }, null);
    kept.git('checkout', '-q', '-b', 'brief/001-x');
    expect((await cli(['init'], kept.root)).stdout).toContain("keep    .spec-brief.json\n        spec-harness's plugin is loaded\n");
    const unreadable = repository({ '.spec-brief.json': '{' }, null);
    unreadable.git('checkout', '-q', '-b', 'brief/001-x');
    expect((await cli(['init'], unreadable.root)).stdout).toContain(`advise  .spec-brief.json\n        cannot be read as JSON; add "plugins": ["${PLUGIN}"] by hand\n`);
  });

  it('reads the default directories past a spec-brief setting that is not a path', async () => {
    const repo = repository({ '.spec-brief.json': JSON.stringify({ briefs: 7, archive: ['x'] }) });
    expect((await cli(['init'], repo.root)).stdout).toContain('keep    .spec-brief.json\n        briefs in briefs/, the archive in briefs/archive/\n');
  });

  describe('with what spec-brief init writes', () => {
    /** A spec-brief whose init writes `content` as its configuration, or nothing when it is `null`. */
    const writing = (content: string | null): Repository => {
      const fake = temp();
      const script = content === null ? '' : `require('node:fs').writeFileSync('.spec-brief.json', ${JSON.stringify(content)});`;
      write(fake, 'spec-brief.cjs', `${script}\n`);
      return repository({}, { tools: { ...siblings(), 'spec-brief': ['node', join(fake, 'spec-brief.cjs')] } });
    };

    it('stops with exit 2 when it writes nothing JSON can read', async () => {
      for (const content of [null, '{ briefs']) {
        const result = await cli(['init', '--write'], writing(content).root);
        expect(result, String(content)).toMatchObject({ code: 2, stderr: 'spec-harness: .spec-brief.json: spec-brief init wrote no configuration JSON can read\n' });
      }
    });

    it('leaves it as written when it already loads the plugin and measures from the base', async () => {
      const written = `${JSON.stringify({ plugins: [PLUGIN], archiving: { base: 'main' } })}\n`;
      const repo = writing(written);
      expect((await cli(['init', '--write'], repo.root)).code).toBe(0);
      expect(repo.read('.spec-brief.json')).toBe(written);
    });
  });

  it('merges into the file spec-graph reads over the key in package.json, and reads a package.json that is not JSON as holding no key', async () => {
    const graph = { tools: { ...siblings(), 'spec-graph': ['node', 'graph.js'] } };
    const both = repository({ '.spec-graph.json': '{}', 'package.json': JSON.stringify({ 'spec-graph': { patterns: ['docs/**/*.md'] } }) }, graph);
    expect((await cli(['init'], both.root)).stdout).toContain('update  .spec-graph.json\n');
    const broken = repository({ 'package.json': '{ "name": ' }, graph);
    expect((await cli(['init'], broken.root)).stdout).toContain('create  .spec-graph.json\n');
  });

  it('says nothing was changed only when something would be, and only without --write', async () => {
    const repo = installed();
    const written = await cli(['init', '--write'], repo.root);
    expect(written.code).toBe(0);
    expect(written.stdout).not.toContain('Nothing was changed');
    expect((await cli(['init'], repo.root)).stdout).not.toContain('Nothing was changed');
  });

  it('cannot say where git\'s hooks are outside a work tree, and says what git said instead', async () => {
    expect(await gitHook(temp())).toEqual({ hook: { state: 'unknown', reason: expect.stringMatching(/^git rev-parse --git-path hooks\/pre-commit failed: fatal: not a git repository/) }, path: null, note: null });
  });

  it.skipIf(process.platform === 'win32')('advises making a hook that runs spec-harness executable, since git skips it, and writes nothing over it', async () => {
    const repo = repository({});
    repo.write('.git/hooks/pre-commit', '#!/bin/sh\nexec npx --no-install spec-harness hook git\n');
    const result = await cli(['init', '--git-hook', '--write'], repo.root);
    expect(result.stdout).toContain('advise  .git/hooks/pre-commit\n        .git/hooks/pre-commit runs spec-harness, but is not executable, so git skips it: chmod +x .git/hooks/pre-commit\n');
    expect(repo.read('.git/hooks/pre-commit')).toBe('#!/bin/sh\nexec npx --no-install spec-harness hook git\n');
  });

  it('advises git\'s pre-commit hook when not asked to add it, adds it when asked, and never over one that exists', async () => {
    const repo = repository({});
    const hook = join(repo.git('rev-parse', '--path-format=absolute', '--git-common-dir'), 'hooks', 'pre-commit');
    const advised = await cli(['init', '--write'], repo.root);
    expect(advised.stdout).toContain(
      'advise  .git/hooks/pre-commit\n        no pre-commit hook runs spec-harness: one refuses a commit that changes what the active brief protects, for any agent or none, a shell\'s writes included; run spec-harness init --git-hook --write to add it\n',
    );
    expect(existsSync(hook)).toBe(false);
    const planned = await cli(['init', '--git-hook', '--write'], repo.root);
    expect(planned.stdout).toContain('create  .git/hooks/pre-commit\n        refuse a commit that changes what the active brief protects\n');
    // node and the script in the project's install, as the Claude Code hooks init writes are run; tests/integration/git-hook.test.ts has git run it.
    expect(repo.read('.git/hooks/pre-commit')).toBe(PRE_COMMIT);
    expect(repo.read('.git/hooks/pre-commit')).toContain('\nexec node "$bin" hook git\n');
    expect(existsSync(hook)).toBe(true);
    // Once there, it is kept, asked for or not.
    expect((await cli(['init', '--git-hook'], repo.root)).stdout).toContain('keep    .git/hooks/pre-commit\n        already runs spec-harness\n');
    expect((await cli(['init'], repo.root)).stdout).toContain('keep    .git/hooks/pre-commit\n        already runs spec-harness\n');

    const other = repository({});
    other.write('.git/hooks/pre-commit', '#!/bin/sh\nnpm test\n');
    const line = 'advise  .git/hooks/pre-commit\n        a pre-commit hook exists; add the line "node node_modules/@spec-family/spec-harness/bin/spec-harness.js hook git" to it\n';
    expect((await cli(['init', '--git-hook', '--write'], other.root)).stdout).toContain(line);
    expect((await cli(['init', '--write'], other.root)).stdout).toContain(line);
    expect(other.read('.git/hooks/pre-commit')).toBe('#!/bin/sh\nnpm test\n');
  });

  describe("what stands at the path of git's pre-commit hook and is no file (ADR-0005)", () => {
    const STOPS = (file: string, what = 'a directory'): string =>
      `${file} is ${what}, not a hook, and git stops every commit at it, since it cannot run it ("cannot spawn" on Windows, "cannot exec" elsewhere): nothing is checked there, and nothing is committed. Take it away, then run spec-harness init --git-hook --write`;
    /** Whether git makes a commit there, with what stands at the hook's path, and what it says where it does not. */
    const commits = (repo: Repository): { made: boolean; said: string } => {
      repo.write('work.txt', `${Math.random()}\n`);
      repo.git('add', 'work.txt');
      const result = spawnSync('git', ['commit', '-q', '-m', 'work'], { cwd: repo.root, encoding: 'utf8' });
      return { made: result.status === 0, said: result.stderr };
    };
    /** What doctor says of git's hook, with its exit code and what it wrote on stderr. */
    const doctor = async (repo: Repository): Promise<{ code: number; stderr: string; hook: { state: string; file: string; detail: string; note: string | null } }> => {
      const result = await cli(['doctor', '--format', 'json'], repo.root);
      return { code: result.code, stderr: result.stderr, hook: parsed<{ gitHook: { state: string; file: string; detail: string; note: string | null } }>(result).gitHook };
    };

    it('is said as a directory git stops every commit at, fails doctor as git fails the commit, and has init write nothing over it', async () => {
      const repo = repository({});
      // The install init's lines name, so that what doctor fails for is the hook git runs alone.
      installHarness(repo.root);
      const directory = join(repo.root, '.git', 'hooks', 'pre-commit');
      mkdirSync(directory, { recursive: true });
      const stops = STOPS('.git/hooks/pre-commit');
      // No stack and nothing on stderr: a sentence in the report, and a failure, since nothing is committed while it stands.
      expect(await doctor(repo)).toEqual({ code: 1, stderr: '', hook: { state: 'stops', file: '.git/hooks/pre-commit', detail: stops, note: null } });
      expect(await gitHook(repo.root)).toEqual({ hook: { state: 'stops', file: '.git/hooks/pre-commit', what: 'a directory' }, path: repo.git('rev-parse', '--path-format=absolute', '--git-path', 'hooks/pre-commit'), note: null });
      // What git does with it is what the exit code follows: it stops the commit, and names the path.
      const commit = commits(repo);
      expect(commit.made).toBe(false);
      expect(commit.said).toContain('pre-commit');
      // init says the same, asked for the hook or not, and leaves what is there.
      for (const args of [['init', '--write'], ['init', '--git-hook', '--write']]) {
        const result = await cli(args, repo.root);
        expect({ code: result.code, stderr: result.stderr }, args.join(' ')).toEqual({ code: 0, stderr: '' });
        expect(result.stdout, args.join(' ')).toContain(`advise  .git/hooks/pre-commit\n        ${stops}\n`);
      }
      expect(statSync(directory).isDirectory()).toBe(true);
      expect(readdirSync(directory)).toEqual([]);
      // Taken away, the hook is written as into any repository, and doctor fails nothing for it.
      rmSync(directory, { recursive: true });
      expect((await cli(['init', '--git-hook', '--write'], repo.root)).stdout).toContain('create  .git/hooks/pre-commit\n');
      expect(await doctor(repo)).toMatchObject({ code: 0, hook: { state: 'runs' } });
    });

    it('is the same where the repository holds the directory, under a core.hooksPath in its work tree', async () => {
      const repo = repository({ '.githooks/pre-commit/keep': 'x\n' });
      repo.git('config', 'core.hooksPath', '.githooks');
      expect(await doctor(repo)).toEqual({ code: 1, stderr: '', hook: { state: 'stops', file: '.githooks/pre-commit', detail: STOPS('.githooks/pre-commit'), note: null } });
      expect(commits(repo).made).toBe(false);
      const planned = await cli(['init', '--git-hook', '--write'], repo.root);
      expect(planned.stdout).toContain(`advise  .githooks/pre-commit\n        ${STOPS('.githooks/pre-commit')}\n`);
      expect(repo.read('.githooks/pre-commit/keep')).toBe('x\n');
    });

    // Windows has no executable bit, and git there runs whatever stands at the path. An account that may do anything is told it may execute a directory whatever its bits, by git as by this.
    it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('is one git skips where it may not execute it, which fails nothing: no hook runs, as where there is none', async () => {
      const repo = repository({});
      const directory = join(repo.root, '.git', 'hooks', 'pre-commit');
      mkdirSync(directory, { recursive: true });
      chmodSync(directory, 0o644);
      const ignored = '.git/hooks/pre-commit is a directory, not a hook, and is not executable, so git skips it and runs no hook: take it away, then run spec-harness init --git-hook --write';
      expect(await doctor(repo)).toEqual({ code: 0, stderr: '', hook: { state: 'ignored', file: '.git/hooks/pre-commit', detail: ignored, note: null } });
      expect(commits(repo).made).toBe(true);
      expect((await cli(['init', '--git-hook', '--write'], repo.root)).stdout).toContain(`advise  .git/hooks/pre-commit\n        ${ignored}\n`);
      expect(statSync(directory).isDirectory()).toBe(true);
    });

    // An account that may do anything may read the file too.
    it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('says a hook file the account may not read, where it ended both on EACCES and a stack, by what git does with it', async () => {
      const repo = repository({});
      // The install init's lines name, so that what doctor fails for is the hook git runs alone.
      installHarness(repo.root);
      const hook = join(repo.root, '.git', 'hooks', 'pre-commit');
      mkdirSync(join(repo.root, '.git', 'hooks'), { recursive: true });
      writeFileSync(hook, `#!/bin/sh\nexec node ${'node_modules/@spec-family/spec-harness/bin/spec-harness.js'} hook git\n`);
      const reason = `EACCES: permission denied, open '${hook}'`;
      // Not executable: git skips it with a hint and commits, as it skips any hook it may not execute.
      chmodSync(hook, 0o000);
      const skipped = `.git/hooks/pre-commit cannot be read (${reason}), and is not executable, so git skips it and runs no hook: make it readable and executable, or take it away and run spec-harness init --git-hook --write`;
      expect(await doctor(repo)).toEqual({ code: 0, stderr: '', hook: { state: 'unreadable', file: '.git/hooks/pre-commit', detail: skipped, note: null } });
      expect((await cli(['doctor', '--strict'], repo.root)).code).toBe(0);
      expect(commits(repo).made).toBe(true);
      // Executable: git runs it, and the shell it runs a script with cannot read it either, and stops the commit. A program would run unread.
      chmodSync(hook, 0o111);
      const untold = `.git/hooks/pre-commit cannot be read (${reason}), so whether it runs spec-harness cannot be told: git runs it at a commit, and a script there that cannot be read stops every commit, where a program runs; make it readable`;
      expect(await doctor(repo)).toEqual({ code: 0, stderr: '', hook: { state: 'unreadable', file: '.git/hooks/pre-commit', detail: untold, note: null } });
      expect((await cli(['doctor', '--strict'], repo.root)).code).toBe(1);
      expect(commits(repo).made).toBe(false);
      // init says the same, and writes nothing over it.
      for (const args of [['init', '--write'], ['init', '--git-hook', '--write']]) {
        const result = await cli(args, repo.root);
        expect({ code: result.code, stderr: result.stderr }, args.join(' ')).toEqual({ code: 0, stderr: '' });
        expect(result.stdout, args.join(' ')).toContain(`advise  .git/hooks/pre-commit\n        ${untold}\n`);
      }
      chmodSync(hook, 0o755);
      expect(await doctor(repo)).toMatchObject({ code: 0, hook: { state: 'runs' } });
    });

    it.skipIf(process.platform === 'win32')('comes back from a named pipe there, which it does not open, and follows a link: to a directory, and to nothing', async () => {
      const repo = repository({});
      const hook = join(repo.root, '.git', 'hooks', 'pre-commit');
      mkdirSync(join(repo.root, '.git', 'hooks'), { recursive: true });
      execFileSync('mkfifo', [hook]);
      chmodSync(hook, 0o755);
      // Opened as a file, a pipe nothing writes to is read without end.
      expect((await doctor(repo)).hook).toEqual({ state: 'stops', file: '.git/hooks/pre-commit', detail: STOPS('.git/hooks/pre-commit', 'neither a file nor a directory'), note: null });
      expect(commits(repo).made).toBe(false);
      rmSync(hook);
      const elsewhere = temp();
      symlinkSync(elsewhere, hook);
      expect((await doctor(repo)).hook).toMatchObject({ state: 'stops', detail: expect.stringContaining(' is a directory, not a hook') });
      expect(commits(repo).made).toBe(false);
      // A link to nothing is no hook to git, which commits: there is none.
      rmSync(hook);
      symlinkSync(join(elsewhere, 'nowhere'), hook);
      expect((await doctor(repo)).hook).toMatchObject({ state: 'absent' });
      expect(commits(repo).made).toBe(true);
    });
  });

  it('writes the hook where core.hooksPath points, relative to the work tree', async () => {
    const repo = repository({});
    repo.git('config', 'core.hooksPath', '.githooks');
    const result = await cli(['init', '--git-hook', '--write'], repo.root);
    expect(result.stdout).toContain('create  .githooks/pre-commit\n');
    expect(repo.read('.githooks/pre-commit')).toBe(PRE_COMMIT);
  });

  it('writes the hook where an absolute core.hooksPath points, which it joined to the work tree', async () => {
    const repo = repository({});
    const hooks = join(temp(), 'shared-hooks');
    repo.git('config', 'core.hooksPath', hooks);
    const result = parsed<{ steps: Step[] }>(await cli(['init', '--git-hook', '--write', '--format', 'json'], repo.root));
    const step = result.steps.find((candidate) => candidate.file.endsWith('pre-commit'));
    expect(step?.action).toBe('create');
    expect(realpathSync.native(step?.file ?? '')).toBe(realpathSync.native(join(hooks, 'pre-commit')));
    expect(readFileSync(join(hooks, 'pre-commit'), 'utf8')).toBe(PRE_COMMIT);
    expect(existsSync(join(repo.root, hooks.replace(/^[A-Za-z]:/, ''), 'pre-commit'))).toBe(false);
  });

  it('plans the hook where git reads a core.hooksPath under ~, and writes nothing without --write', async () => {
    const repo = repository({});
    repo.git('config', 'core.hooksPath', '~/spec-harness-test-hooks-never-written');
    const step = parsed<{ steps: Step[] }>(await cli(['init', '--format', 'json'], repo.root)).steps.find((candidate) => candidate.file.endsWith('pre-commit'));
    // Where git itself runs the hook from, outside the work tree; never "<root>/~/...".
    expect(step).toMatchObject({ action: 'advise', file: repo.git('rev-parse', '--path-format=absolute', '--git-path', 'hooks/pre-commit') });
    expect(step?.file).not.toContain('~');
  });

  it('writes the hook of a linked worktree where git runs it: the shared hooks, or a relative core.hooksPath in that worktree', async () => {
    const main = repository({});
    const linked = join(temp(), 'linked');
    main.git('worktree', 'add', '-q', '-b', 'brief/001-linked', linked);
    await cli(['init', '--git-hook', '--write'], linked);
    expect(main.read('.git/hooks/pre-commit')).toBe(PRE_COMMIT);
    main.git('config', 'core.hooksPath', '.githooks');
    await cli(['init', '--git-hook', '--write'], linked);
    expect(readFileSync(join(linked, '.githooks', 'pre-commit'), 'utf8')).toBe(PRE_COMMIT);
    expect(existsSync(join(main.root, '.githooks', 'pre-commit'))).toBe(false);
  });

  it('advises the allowed-signers file the configuration names, with a FIDO2 key, and how each forge protects it', async () => {
    const detail =
      'rulings count only when signed by a key listed here on the base branch: one line per person, <email> namespaces="git" <public key>. Where an agent runs as the person, make it a FIDO2 key, ssh-keygen -t ed25519-sk, whose signature needs a touch no process can supply. ' +
      "Have the forge protect this file, the ADRs, the tool configurations and the CI configuration, so no change to them reaches the base branch without a person, and check each change in CI against the base branch's rules: " +
      'on GitHub, CODEOWNERS and a protected branch; on GitLab Premium, Code Owners; on GitLab Free, a protected branch no one pushes to, merged by Maintainers, agents as Developers, and pipelines that must succeed. ' +
      "spec-core's docs/adopting.md has the settings";
    const named = repository({}, { rulings: { allowedSigners: '.gitlab/allowed_signers' } });
    const steps = parsed<{ steps: Step[] }>(await cli(['init', '--format', 'json'], named.root)).steps;
    expect(steps.filter((step) => step.file.endsWith('allowed_signers'))).toEqual([{ file: '.gitlab/allowed_signers', action: 'advise', detail }]);
    const plain = repository({});
    expect(parsed<{ steps: Step[] }>(await cli(['init', '--format', 'json'], plain.root)).steps.filter((step) => step.file.endsWith('allowed_signers'))).toEqual([
      { file: '.github/allowed_signers', action: 'advise', detail },
    ]);
  });

  it('keeps a spec-brief configuration that loads the plugin by a path to its file, and adds no second one', async () => {
    const repo = repository({ '.spec-brief.json': JSON.stringify({ plugins: ['./node_modules/@spec-family/spec-harness/plugin.js'], archiving: { base: 'main' } }) });
    installHarness(repo.root);
    const result = await cli(['init', '--write'], repo.root);
    expect(result.stdout).toContain("keep    .spec-brief.json\n        spec-harness's plugin is loaded, and the archive is measured from main\n");
    expect(JSON.parse(repo.read('.spec-brief.json')).plugins).toEqual(['./node_modules/@spec-family/spec-harness/plugin.js']);
    // A path to another file is another plugin.
    const other = repository({ '.spec-brief.json': JSON.stringify({ plugins: ['./tools/plugin.js'] }) });
    installHarness(other.root);
    other.write('tools/plugin.js', 'export default { name: "x", rules: [] };\n');
    await cli(['init', '--write'], other.root);
    expect(JSON.parse(other.read('.spec-brief.json')).plugins).toEqual(['./tools/plugin.js', PLUGIN]);
  });

  it('writes no hook and no server while the Claude Code plugin is on, and says how to have them instead', async () => {
    const user = temp();
    write(user, 'settings.json', JSON.stringify({ enabledPlugins: { 'spec-harness@spec-tools': true } }));
    // Installed for the user, as Claude Code leaves it under its configuration directory.
    installPlugin(join(user, 'plugins'));
    const env = { CLAUDE_CONFIG_DIR: user };
    const repo = installed();
    const result = await cli(['init', '--write', '--format', 'json'], repo.root, { env });
    expect(result.code).toBe(0);
    const settingsFile = join(user, 'settings.json');
    const off = 'turn the plugin off for this project with claude plugin disable spec-harness@spec-tools --scope local and run init again';
    expect(parsed<{ steps: Step[] }>(result).steps.filter((step) => step.file === '.claude/settings.json' || step.file === '.mcp.json')).toEqual([
      {
        file: '.claude/settings.json',
        action: 'skip',
        detail: `the spec-harness plugin is on (spec-harness@spec-tools in ${settingsFile}) and brings the guard hooks, so init writes none: with both, every write is guarded twice. To have them here instead, for every clone of the repository, ${off}`,
      },
      {
        file: '.mcp.json',
        action: 'skip',
        detail: `the spec-harness plugin is on (spec-harness@spec-tools in ${settingsFile}) and brings the server, so init registers none: with both, the server is registered twice. To have it here instead, for every clone of the repository, ${off}`,
      },
    ]);
    expect(existsSync(join(repo.root, '.claude'))).toBe(false);
    expect(existsSync(join(repo.root, '.mcp.json'))).toBe(false);
    // The rest of the family is configured as before.
    expect(JSON.parse(repo.read('.spec-harness.json'))).toEqual({ base: 'main' });
    expect(JSON.parse(repo.read('.spec-brief.json')).plugins).toEqual([PLUGIN]);
    // Nothing is advised by hand for a file the plugin makes unnecessary.
    const unreadable = repository({ '.claude/settings.json': '{ not json' });
    expect((await cli(['init'], unreadable.root, { env })).stdout).toContain('skip    .claude/settings.json\n        the spec-harness plugin is on');
    // A repository that turns the plugin on in its own settings, beside other entries, keeps both files as they are.
    const settings = JSON.stringify({ enabledPlugins: { 'spec-harness@spec-tools': true }, permissions: { allow: ['Bash(ls)'] } });
    const servers = JSON.stringify({ mcpServers: { other: { command: 'x' } } });
    const committed = repository({ '.claude/settings.json': settings, '.mcp.json': servers });
    const plan = await cli(['init', '--write', '--format', 'json'], committed.root);
    expect(parsed<{ steps: Step[] }>(plan).steps.filter((step) => step.file === '.claude/settings.json' || step.file === '.mcp.json').map((step) => step.action)).toEqual([
      'skip',
      'skip',
    ]);
    expect(committed.read('.claude/settings.json')).toBe(settings);
    expect(committed.read('.mcp.json')).toBe(servers);
  });

  it('reports init\'s entries beside the plugin as a double install, and changes neither file', async () => {
    const legacy = { type: 'command', command: 'npx --no-install spec-harness hook claude', timeout: 60 };
    const settings = JSON.stringify({ enabledPlugins: { 'spec-harness@team': true }, hooks: { PostToolUse: [{ matcher: 'Write', hooks: [legacy] }] } });
    const mcp = JSON.stringify(mergeMcp({}));
    const repo = repository({ '.claude/settings.json': settings, '.mcp.json': mcp });
    // The plugin is on this machine, installed from its marketplace: both run.
    const result = await cli(['init', '--write'], repo.root, { env: { CLAUDE_CODE_PLUGIN_CACHE_DIR: installPlugin(temp(), 'spec-harness@team') } });
    expect(result.code).toBe(0);
    const off = 'turn the plugin off for this project with claude plugin disable spec-harness@team --scope local';
    expect(result.stdout).toContain(
      `advise  .claude/settings.json\n        the spec-harness plugin is on (spec-harness@team in .claude/settings.json) and brings the guard hooks this file holds as well, so every write is guarded twice: take spec-harness's hooks out of this file, or ${off}\n`,
    );
    expect(result.stdout).toContain(
      `advise  .mcp.json\n        the spec-harness plugin is on (spec-harness@team in .claude/settings.json) and brings the server this file holds as well, so the server is registered twice: take the spec-harness server out of this file, or ${off}\n`,
    );
    // 0.1's hook stays as it was: init neither upgrades nor removes an entry the plugin doubles.
    expect(repo.read('.claude/settings.json')).toBe(settings);
    expect(repo.read('.mcp.json')).toBe(mcp);
  });

  describe("beside a line of Claude Code's hook that init did not write (ADR-0005)", () => {
    const SCRIPT = '${CLAUDE_PROJECT_DIR}/node_modules/@spec-family/spec-harness/bin/spec-harness.js';
    const MATCHER = 'Edit|Write|MultiEdit|NotebookEdit';
    const line = (...rest: string[]) => ({ type: 'command', command: 'node', args: [SCRIPT, 'hook', 'claude', ...rest] });
    const under = (matcher: string, hook: unknown) => ({ matcher, hooks: [hook] });
    const both = (hook: unknown): string => JSON.stringify({ hooks: { PreToolUse: [under(MATCHER, hook)], PostToolUse: [under(MATCHER, hook)] } });
    const LEFT = 'init rewrites no line of the hook it did not write, and writes none beside one Claude Code starts for a write';
    /** A plugins root of the file's own, with the plugin the tests below turn on installed in it. */
    const env = { CLAUDE_CODE_PLUGIN_CACHE_DIR: installPlugin(temp(), 'spec-harness@team') };
    const step = async (repo: Repository, ...more: string[]): Promise<Step | undefined> =>
      parsed<{ steps: Step[] }>(await cli(['init', ...more, '--format', 'json'], repo.root, { env })).steps.find((found) => found.file === '.claude/settings.json');

    it('writes none beside it and says which line it left, in the words doctor has for the line', async () => {
      const settings = both(line('--root', '${CLAUDE_PROJECT_DIR}'));
      const repo = repository({ '.claude/settings.json': settings });
      const top = repo.git('rev-parse', '--show-toplevel');
      expect(await step(repo, '--write')).toEqual({
        file: '.claude/settings.json',
        action: 'keep',
        detail: `"hook claude --root \${CLAUDE_PROJECT_DIR}" in .claude/settings.json is more than init writes, and guards: the hook reads the line, and its root, ${top}, is a directory; ${LEFT}`,
      });
      expect(repo.read('.claude/settings.json')).toBe(settings);
      // A line in the person's own file is theirs: the project's file, which every clone reads, is written all the same, and nothing is said of the other.
      const local = repository({ '.claude/settings.local.json': settings });
      expect(await step(local)).toEqual({
        file: '.claude/settings.json',
        action: 'create',
        detail: "the guard hooks, run with node from the project's install: a PreToolUse hook refuses writes to protected files; a PostToolUse hook warns about writes outside the scope; a SessionStart hook says, as a session starts, what would hold every write of it",
      });
      // Beside the plugin the line is the double install doctor fails, where init said it wrote none.
      repo.write('.claude/settings.local.json', JSON.stringify({ enabledPlugins: { 'spec-harness@team': true } }));
      expect(await step(repo)).toEqual({
        file: '.claude/settings.json',
        action: 'advise',
        detail:
          "the spec-harness plugin is on (spec-harness@team in .claude/settings.local.json) and brings the guard hooks this file holds as well, so every write is guarded twice: take spec-harness's hooks out of this file, or turn the plugin off for this project with claude plugin disable spec-harness@team --scope local",
      });
      // And where the line is in the person's own file, which init does not write, it is said of that file.
      repo.write('.claude/settings.local.json', JSON.stringify({ enabledPlugins: { 'spec-harness@team': true }, ...JSON.parse(settings) }));
      repo.write('.claude/settings.json', '{}');
      expect(await step(repo)).toEqual({
        file: '.claude/settings.json',
        action: 'advise',
        detail:
          "the spec-harness plugin is on (spec-harness@team in .claude/settings.local.json) and brings the guard hooks .claude/settings.local.json holds as well, so every write is guarded twice: take spec-harness's hooks out there, or turn the plugin off for this project with claude plugin disable spec-harness@team --scope local. init writes none here",
      });
    });

    it('advises on a line that turns the guard off or holds every write, which is the person\'s to mend, and changes nothing', async () => {
      const unread = both(line('--nope'));
      const repo = repository({ '.claude/settings.json': unread });
      const off = await step(repo, '--write');
      expect(off?.action).toBe('advise');
      expect(off?.detail.startsWith('"hook claude --nope" in .claude/settings.json: the hook\'s line cannot be read (Unknown option \'--nope\'')).toBe(true);
      expect(off?.detail.endsWith(`, where init writes "hook claude" and nothing after it; ${LEFT}`)).toBe(true);
      expect(repo.read('.claude/settings.json')).toBe(unread);
      // No brief is 404 here, so the hook holds every write under this line.
      repo.write('.claude/settings.json', both(line('--brief', '404')));
      expect(await step(repo)).toEqual({
        file: '.claude/settings.json',
        action: 'advise',
        detail: `"hook claude --brief 404" in .claude/settings.json: the flag names brief 404, and spec-brief knows no such brief, so the hook holds every write until the line is mended: name a brief spec-brief lists, or take --brief off the line; ${LEFT}`,
      });
    });

    it("leaves a person's line that stands under one event alone as it is, and advises where that leaves no guard before a write", async () => {
      const changed = under(MATCHER, line('--root', '${CLAUDE_PROJECT_DIR}'));
      const before = JSON.stringify({ hooks: { PreToolUse: [changed] } });
      const repo = repository({ '.claude/settings.json': before });
      const guarded = await step(repo, '--write');
      expect(guarded?.action).toBe('keep');
      expect(guarded?.detail.endsWith(`(under PreToolUse alone): it is started after no write, so it warns of none (it stands under no PostToolUse); ${LEFT}`)).toBe(true);
      expect(repo.read('.claude/settings.json')).toBe(before);
      const after = JSON.stringify({ hooks: { PostToolUse: [changed] } });
      repo.write('.claude/settings.json', after);
      expect(await step(repo, '--write')).toEqual({
        file: '.claude/settings.json',
        action: 'advise',
        detail: `"hook claude --root \${CLAUDE_PROJECT_DIR}" in .claude/settings.json (under PostToolUse alone): Claude Code waits on it before no write, so it is not the guard and refuses none (it stands under no PreToolUse); ${LEFT}`,
      });
      expect(repo.read('.claude/settings.json')).toBe(after);
    });

    it('writes its own hooks beside a line Claude Code starts for no write, leaves that line as it is, and says so', async () => {
      const idle = under('Bash', line('--root', '${CLAUDE_PROJECT_DIR}'));
      const repo = repository({ '.claude/settings.json': JSON.stringify({ hooks: { PreToolUse: [idle] } }) });
      expect(await step(repo, '--write')).toEqual({
        file: '.claude/settings.json',
        action: 'update',
        detail:
          "the guard hooks, run with node from the project's install: a PreToolUse hook refuses writes to protected files; a PostToolUse hook warns about writes outside the scope; " +
          '"hook claude --root ${CLAUDE_PROJECT_DIR}" in .claude/settings.json (under PreToolUse alone): Claude Code waits on it before no write, so it is not the guard and refuses none (under PreToolUse it has the matcher "Bash"); ' +
          `it is started after no write, so it warns of none (it stands under no PostToolUse); ${LEFT}`,
      });
      const own = under(MATCHER, GUARD_HOOK);
      expect(JSON.parse(repo.read('.claude/settings.json'))).toEqual({ hooks: { PreToolUse: [idle, own], PostToolUse: [own] } });
      // A second run finds its own line started for every write, and adds none.
      expect((await step(repo))?.action).toBe('keep');
    });

    it('says each thing doctor has of a line one after another, what the hook does with it and then the writes it is started for', async () => {
      const repo = repository({ '.claude/settings.json': JSON.stringify({ hooks: { PreToolUse: [under(MATCHER, line('--root', '${CLAUDE_PROJECT_DIR}'))] } }) });
      const top = repo.git('rev-parse', '--show-toplevel');
      const where = '"hook claude --root ${CLAUDE_PROJECT_DIR}" in .claude/settings.json (under PreToolUse alone)';
      expect((await step(repo))?.detail).toBe(
        `${where} is more than init writes, and guards: the hook reads the line, and its root, ${top}, is a directory; ` +
          `${where}: it is started after no write, so it warns of none (it stands under no PostToolUse); ${LEFT}`,
      );
    });

    it('advises where one line of two turns the guard off, though the other guards, as doctor fails the file', async () => {
      const own = under(MATCHER, GUARD_HOOK);
      const unread = under(MATCHER, line('--nope'));
      const settings = JSON.stringify({ hooks: { PreToolUse: [own, unread], PostToolUse: [own, unread] } });
      const repo = repository({ '.claude/settings.json': settings });
      const found = await step(repo, '--write');
      expect(found?.action).toBe('advise');
      expect(found?.detail.startsWith('"hook claude --nope" in .claude/settings.json: the hook\'s line cannot be read (Unknown option \'--nope\'')).toBe(true);
      expect(repo.read('.claude/settings.json')).toBe(settings);
      expect((await cli(['doctor'], repo.root)).code).toBe(1);
    });

    describe('under a matcher the Claude Code on this machine reads otherwise', () => {
      const stepUnder = async (repo: Repository, release: Record<string, string>, ...more: string[]): Promise<Step | undefined> =>
        parsed<{ steps: Step[] }>(await cli(['init', ...more, '--format', 'json'], repo.root, { env: release })).steps.find((found) => found.file === '.claude/settings.json');
      const comma = under('Edit, Write', GUARD_HOOK);
      const own = under(MATCHER, GUARD_HOOK);
      const WRITES = "the guard hooks, run with node from the project's install: a PreToolUse hook refuses writes to protected files; a PostToolUse hook warns about writes outside the scope";

      it('writes its hooks beside a line whose comma the release here reads as part of a pattern, and none where the release reads a separator or cannot be told', async () => {
        const settings = JSON.stringify({ hooks: { PreToolUse: [comma], PostToolUse: [comma] } });
        const repo = repository({ '.claude/settings.json': settings });
        // A release that reads the matcher as written starts the line for Edit and Write: it is left, with what it leaves unchecked.
        const kept = await stepUnder(repo, claudeOf('2.1.191'), '--write');
        expect(kept?.action).toBe('keep');
        expect(kept?.detail).toBe(
          '"hook claude" in .claude/settings.json: Claude Code waits on it before a write by Edit and Write, and before none by NotebookEdit, which goes unchecked (under PreToolUse it has the matcher "Edit, Write"); it is started after a write by Edit and Write alone (under PostToolUse it has the matcher "Edit, Write"); ' +
            LEFT,
        );
        // Where the release cannot be told the line may be started, and a second one beside it would run as well.
        const untold = await stepUnder(repo, { PATH: temp() }, '--write');
        expect(untold?.action).toBe('keep');
        expect(untold?.detail).toContain('which writes Claude Code waits on it before cannot be told here (under PreToolUse it has the matcher "Edit, Write", which is Edit and Write from Claude Code 2.1.191 on');
        expect(repo.read('.claude/settings.json')).toBe(settings);
        // An older release starts it for no write: init writes its own, and says which line it left and why.
        const aside = ', which Claude Code 2.1.190 reads as a pattern that matches no tool: a comma separates names from 2.1.191 on, where the matcher is Edit and Write';
        expect(await stepUnder(repo, claudeOf('2.1.190'), '--write')).toEqual({
          file: '.claude/settings.json',
          action: 'update',
          detail:
            `${WRITES}; "hook claude" in .claude/settings.json: Claude Code waits on it before no write, so it is not the guard and refuses none (under PreToolUse it has the matcher "Edit, Write"${aside}); ` +
            `it is started after no write, so it warns of none (under PostToolUse it has the matcher "Edit, Write"${aside}); ${LEFT}`,
        });
        expect(JSON.parse(repo.read('.claude/settings.json'))).toEqual({ hooks: { PreToolUse: [comma, own], PostToolUse: [comma, own] } });
        // A second run under that release finds its own line started for every write, and adds none of the two: the one as a session starts, beside them.
        expect(await stepUnder(repo, claudeOf('2.1.190'), '--write')).toEqual({ file: '.claude/settings.json', action: 'update', detail: 'beside the guard hooks, a SessionStart hook says, as a session starts, what would hold every write of it' });
        expect(await stepUnder(repo, claudeOf('2.1.190'), '--write')).toEqual({ file: '.claude/settings.json', action: 'keep', detail: 'the guard hooks are installed' });
      });

      it('asks Claude Code its release only where what is read of a line turns on it, where doctor asks wherever the guard is wired', async () => {
        const io = (env: Record<string, string>, cwd: string) => ({ stdout: { write: () => true }, stderr: { write: () => true }, cwd, env });
        /** The release the wiring asked, for a caller that reports it, as doctor does, and for one that does not, as init. */
        const release = async (repo: Repository, reported?: boolean) => (await claudeCodeWiring(repo.root, io(claudeOf('2.1.190'), repo.root), undefined, reported)).release;
        const told = { state: 'ok', version: '2.1.190' };
        // The matcher every release wrote is read one way by every Claude Code: init has no use for the release there.
        const plain = repository({ '.claude/settings.json': both(GUARD_HOOK) });
        expect(await release(plain, false)).toBeNull();
        expect(await release(plain, true)).toMatchObject(told);
        expect(await release(plain)).toMatchObject(told);
        // Names with a comma that list a tool that writes: both ask.
        const turning = repository({ '.claude/settings.json': JSON.stringify({ hooks: { PreToolUse: [comma], PostToolUse: [own] } }) });
        expect(await release(turning, false)).toMatchObject(told);
        expect(await release(turning)).toMatchObject(told);
        // And the lines are read under the release that was asked: one older than 2.1.191 starts this line before no write.
        expect((await claudeCodeWiring(turning.root, io(claudeOf('2.1.190'), turning.root), undefined, false)).lines).toMatchObject([{ state: 'unstarted', before: [], after: ['Edit', 'Write', 'NotebookEdit'] }]);
        // Names with a comma that list none: no release starts the line for a write, and neither asks.
        const idle = repository({ '.claude/settings.json': JSON.stringify({ hooks: { PreToolUse: [under('Bash, Read', GUARD_HOOK)] } }) });
        expect(await release(idle, false)).toBeNull();
        expect(await release(idle)).toBeNull();
        expect(await release(repository({}))).toBeNull();
      });

      // On Windows a claude.cmd is read and never started, so there is nothing to see started.
      it.skipIf(process.platform === 'win32')('starts no claude for init where no line turns on its release, and starts it where one does, as doctor does wherever the guard is wired', async () => {
        const directory = temp();
        const started = join(directory, 'started');
        const file = join(directory, 'claude');
        // A claude of the test's own, which leaves a file behind each time it is started.
        writeFileSync(file, `#!/bin/sh\necho started >> '${started}'\necho '2.1.190 (Claude Code)'\n`);
        chmodSync(file, 0o755);
        const env = { PATH: directory };
        const plain = repository({ '.claude/settings.json': both(GUARD_HOOK) });
        expect((await cli(['init'], plain.root, { env })).code).toBe(0);
        expect(existsSync(started)).toBe(false);
        expect((await cli(['doctor'], plain.root, { env })).stdout).toContain('Claude Code 2.1.190 runs the hooks');
        expect(existsSync(started)).toBe(true);
        rmSync(started);
        const turning = repository({ '.claude/settings.json': JSON.stringify({ hooks: { PreToolUse: [comma], PostToolUse: [comma] } }) });
        expect((await cli(['init'], turning.root, { env })).stdout).toContain('which Claude Code 2.1.190 reads as a pattern that matches no tool');
        expect(existsSync(started)).toBe(true);
      });

      it('writes no hook into a file whose hooks an array for a matcher keeps Claude Code from loading, and says how the matcher is mended', async () => {
        const other = { matcher: ['Bash', 'PowerShell'], hooks: [{ type: 'command', command: '/usr/local/bin/lint-check.sh' }] };
        const advice = {
          file: '.claude/settings.json',
          action: 'advise',
          detail:
            '.claude/settings.json has an array for a matcher under PreToolUse, ["Bash","PowerShell"], which Claude Code lists as an invalid setting, and beside one under PreToolUse or PermissionRequest it loads none of the file\'s other hooks, ' +
            'those init writes among them, so it writes none: write the matcher as one string, its names between "|", and run init again',
        };
        // With no line of the hook, and with init's own beside a line a person wrote: the file is left as it is.
        for (const groups of [[other], [own, under(MATCHER, line('--base', 'main')), other]]) {
          const settings = JSON.stringify({ hooks: { PreToolUse: groups } });
          const repo = repository({ '.claude/settings.json': settings });
          expect(await stepUnder(repo, { PATH: temp() }, '--write'), settings).toEqual(advice);
          expect(repo.read('.claude/settings.json'), settings).toBe(settings);
        }
        // Mended, the hooks are written as into any file.
        const mended = { matcher: 'Bash|PowerShell', hooks: other.hooks };
        const repo = repository({ '.claude/settings.json': JSON.stringify({ hooks: { PreToolUse: [mended] } }) });
        expect(await stepUnder(repo, { PATH: temp() }, '--write')).toEqual({ file: '.claude/settings.json', action: 'update', detail: `${WRITES}; a SessionStart hook says, as a session starts, what would hold every write of it` });
        expect(JSON.parse(repo.read('.claude/settings.json'))).toEqual({ hooks: { PreToolUse: [mended, own], PostToolUse: [own], SessionStart: [{ hooks: [GUARD_HOOK] }] } });
        // An array after a write unloads its own entry and no other: init completes its line under that event.
        const arrayed = { matcher: ['Edit', 'Write'], hooks: [GUARD_HOOK] };
        const after = repository({ '.claude/settings.json': JSON.stringify({ hooks: { PreToolUse: [own], PostToolUse: [arrayed] } }) });
        expect((await stepUnder(after, { PATH: temp() }, '--write'))?.action).toBe('update');
        expect(JSON.parse(after.read('.claude/settings.json'))).toEqual({ hooks: { PreToolUse: [own], PostToolUse: [arrayed, own] } });
      });
    });
  });

  describe('where the plugin that is turned on is not on this machine, or cannot be told to be (ADR-0012)', () => {
    const ID = 'spec-harness@spec-tools';
    const ON = JSON.stringify({ enabledPlugins: { [ID]: true } });
    const steps = async (repo: Repository, env: Record<string, string>, ...more: string[]): Promise<Step[]> =>
      parsed<{ steps: Step[] }>(await cli(['init', ...more, '--format', 'json'], repo.root, { env })).steps.filter((step) => step.file === '.claude/settings.json' || step.file === '.mcp.json');
    const off = `turn the plugin off for this project with claude plugin disable ${ID} --scope local`;
    const bring = `install it here, with claude plugin install ${ID} once its marketplace is added`;

    it('writes neither entry on that reading alone, and says what doctor says and how to have them in the files instead', async () => {
      const plugins = temp();
      write(plugins, 'known_marketplaces.json', '{}');
      const repo = repository({ '.claude/settings.json': ON });
      const gone = (none: string): string =>
        `the spec-harness plugin is on (${ID} in .claude/settings.json) and is not on this machine, so it brings ${none} here: .claude/settings.json alone turns it on, and Claude Code fetches no plugin that a project's settings alone turn on, unless its marketplace lists it by a relative path or a seed directory holds it: no marketplace spec-tools is recorded as fetched or declared in settings, and no version of the plugin is in a cache (${join(plugins, 'cache')})`;
      expect(await steps(repo, { CLAUDE_CODE_PLUGIN_CACHE_DIR: plugins }, '--write')).toEqual([
        {
          file: '.claude/settings.json',
          action: 'advise',
          detail: `${gone('no hook')}. On that reading alone init writes none, since with a plugin that is there after all every write is guarded twice: ${bring}, or to have them here instead, ${off} and run init again`,
        },
        {
          file: '.mcp.json',
          action: 'advise',
          detail: `${gone('no server')}. On that reading alone init registers none, since with a plugin that is there after all the server is registered twice: ${bring}, or to have it here instead, ${off} and run init again`,
        },
      ]);
      expect(repo.read('.claude/settings.json')).toBe(ON);
      expect(existsSync(join(repo.root, '.mcp.json'))).toBe(false);
      // A file that holds init's entry is said as what the plugin, installed, would double.
      const held = repository({ '.claude/settings.json': JSON.stringify({ ...JSON.parse(ON), hooks: { PreToolUse: [{ matcher: 'Edit|Write', hooks: [GUARD_HOOK] }] } }), '.mcp.json': JSON.stringify(mergeMcp({})) });
      expect(await steps(held, { CLAUDE_CODE_PLUGIN_CACHE_DIR: plugins })).toEqual([
        { file: '.claude/settings.json', action: 'advise', detail: `${gone('no hook')}. This file holds spec-harness's hooks; with the plugin installed as well, every write is guarded twice: ${off}` },
        { file: '.mcp.json', action: 'advise', detail: `${gone('no server')}. This file holds the spec-harness server; with the plugin installed as well, the server is registered twice: ${off}` },
      ]);
    });

    it('skips as it did where that cannot be told, and says so beside the reason', async () => {
      const plugins = temp();
      const repo = repository({ '.claude/settings.json': ON });
      const [settings, server] = await steps(repo, { CLAUDE_CODE_PLUGIN_CACHE_DIR: plugins });
      expect(settings).toEqual({
        file: '.claude/settings.json',
        action: 'skip',
        detail: `the spec-harness plugin is on (${ID} in .claude/settings.json) and brings the guard hooks, so init writes none: with both, every write is guarded twice. To have them here instead, for every clone of the repository, ${off} and run init again. whether ${ID} is on this machine cannot be told: ${join(plugins, 'known_marketplaces.json')}, where Claude Code records the marketplaces it has fetched, is not there. A plugin that is not there brings no hook: Claude Code's /plugin lists it, and its errors`,
      });
      expect(server).toMatchObject({ action: 'skip', detail: expect.stringMatching(/ and run init again$/) });
    });

    it('says disableAllHooks of the file that holds it, and writes what it would have written', async () => {
      const repo = repository({ '.claude/settings.json': JSON.stringify({ disableAllHooks: true }) });
      const plan = parsed<{ steps: Step[] }>(await cli(['init', '--write', '--format', 'json'], repo.root)).steps;
      const at = plan.findIndex((step) => step.file === '.claude/settings.json');
      expect(plan.slice(at, at + 3).map((step) => [step.file, step.action])).toEqual([
        ['.claude/settings.json', 'update'],
        ['.claude/settings.json', 'advise'],
        ['.mcp.json', 'create'],
      ]);
      expect(plan[at + 1]?.detail).toMatch(/^note: "disableAllHooks" is true in \.claude\/settings\.json, .* would not run while it stands$/);
      const written = JSON.parse(repo.read('.claude/settings.json'));
      expect(written.disableAllHooks).toBe(true);
      expect(written.hooks.PreToolUse[0].hooks[0]).toEqual(GUARD_HOOK);
      // With the hooks in the file, the key is what switches the guard off.
      const again = parsed<{ steps: Step[] }>(await cli(['init', '--format', 'json'], repo.root)).steps.filter((step) => step.file === '.claude/settings.json');
      expect(again.map((step) => step.action)).toEqual(['keep', 'advise']);
      expect(again[1]?.detail).toContain(': no write is guarded. Take the key out of .claude/settings.json, or set it to false, to have the guard back.');
      // Without the key, nothing is said of it.
      const plain = repository({});
      expect(parsed<{ steps: Step[] }>(await cli(['init', '--format', 'json'], plain.root)).steps.filter((step) => step.detail.includes('disableAllHooks'))).toEqual([]);
    });
  });

  describe('the directories Claude Code keeps plugins in, and what is read of them (ADR-0012)', () => {
    it('are the plugins root, from CLAUDE_CODE_PLUGIN_CACHE_DIR or the configuration directory, and each seed after it', () => {
      expect(pluginDirectories({ CLAUDE_CODE_PLUGIN_CACHE_DIR: 'p', CLAUDE_CONFIG_DIR: 'c', HOME: 'h' }, 'linux')).toEqual(['p']);
      expect(pluginDirectories({ CLAUDE_CODE_PLUGIN_CACHE_DIR: '', CLAUDE_CONFIG_DIR: 'c', HOME: 'h' }, 'linux')).toEqual([join('c', 'plugins')]);
      expect(pluginDirectories({ HOME: 'h', USERPROFILE: 'u' }, 'linux')).toEqual([join('h', '.claude', 'plugins')]);
      expect(pluginDirectories({ HOME: 'h', USERPROFILE: 'u' }, 'win32')).toEqual([join('u', '.claude', 'plugins')]);
      expect(pluginDirectories({}, 'linux')).toEqual([]);
      // Seeds are separated as PATH is on each platform, and an empty place between two names none.
      expect(pluginDirectories({ HOME: 'h', CLAUDE_CODE_PLUGIN_SEED_DIR: '/a:/b::' }, 'linux')).toEqual([join('h', '.claude', 'plugins'), '/a', '/b']);
      expect(pluginDirectories({ CLAUDE_CODE_PLUGIN_SEED_DIR: 'C:\\a;D:\\b' }, 'win32')).toEqual(['C:\\a', 'D:\\b']);
      expect(pluginDirectories({ CLAUDE_CODE_PLUGIN_SEED_DIR: '/a;/b' }, 'linux')).toEqual(['/a;/b']);
      expect(pluginDirectories({ CLAUDE_CODE_PLUGIN_SEED_DIR: '' }, 'linux')).toEqual([]);
    });

    const ID = 'spec-harness@spec-tools';
    const io = (env: Record<string, string>, cwd: string) => ({ stdout: { write: () => true }, stderr: { write: () => true }, cwd, env });
    const presence = async (repo: Repository, env: Record<string, string>) => (await claudeCodeWiring(repo.root, io(env, repo.root))).presence;

    it('find a version of the plugin in a cache, in the root or in a seed, and none in what an update or an uninstall left behind', async () => {
      const repo = repository({ '.claude/settings.json': JSON.stringify({ enabledPlugins: { [ID]: true } }) });
      const plugins = temp();
      write(plugins, 'known_marketplaces.json', '{}');
      const env = { CLAUDE_CODE_PLUGIN_CACHE_DIR: plugins };
      expect(await presence(repo, env)).toMatchObject({ state: 'absent' });
      const versions = join(plugins, 'cache', 'spec-tools', 'spec-harness');
      // A file where a version's directory would be is no version.
      mkdirSync(versions, { recursive: true });
      writeFileSync(join(versions, '0.15.0'), '');
      expect(await presence(repo, env)).toMatchObject({ state: 'absent' });
      // Nor is a directory marked as left behind.
      mkdirSync(join(versions, '0.14.0'));
      writeFileSync(join(versions, '0.14.0', '.orphaned_at'), '2026-10-01T00:00:00.000Z');
      expect(await presence(repo, env)).toMatchObject({ state: 'absent' });
      // Another marketplace's plugin of the name, and another plugin of this marketplace, are not it.
      mkdirSync(join(plugins, 'cache', 'team', 'spec-harness', '1.0.0'), { recursive: true });
      mkdirSync(join(plugins, 'cache', 'spec-tools', 'other', '1.0.0'), { recursive: true });
      expect(await presence(repo, env)).toMatchObject({ state: 'absent' });
      mkdirSync(join(versions, '0.16.0'));
      expect(await presence(repo, env)).toEqual({ state: 'present', detail: null });
      // A seed directory holds it as the root does.
      const seed = installPlugin(temp());
      const other = temp();
      write(other, 'known_marketplaces.json', '{}');
      const seeded = { CLAUDE_CODE_PLUGIN_CACHE_DIR: other, CLAUDE_CODE_PLUGIN_SEED_DIR: [temp(), seed].join(delimiter) };
      expect(await presence(repo, seeded)).toEqual({ state: 'present', detail: null });
    });

    it('read the record of marketplaces fetched, and whether one of those hosted on claude.ai stands beside it', async () => {
      const repo = repository({ '.claude/settings.json': JSON.stringify({ enabledPlugins: { [ID]: true } }) });
      const plugins = temp();
      const env = { CLAUDE_CODE_PLUGIN_CACHE_DIR: plugins };
      expect((await presence(repo, env))?.detail).toBe(`${join(plugins, 'known_marketplaces.json')}, where Claude Code records the marketplaces it has fetched, is not there`);
      write(plugins, 'known_marketplaces.json', '{ not json');
      expect((await presence(repo, env))?.detail).toBe(`${join(plugins, 'known_marketplaces.json')}, where Claude Code records the marketplaces it has fetched, cannot be read as JSON`);
      write(plugins, 'known_marketplaces.json', JSON.stringify({ 'spec-tools': { installLocation: join(plugins, 'marketplaces', 'spec-tools') } }));
      expect(await presence(repo, env)).toMatchObject({ state: 'unknown', detail: expect.stringContaining(`its marketplace, spec-tools, is on this machine (${join(plugins, 'known_marketplaces.json')})`) });
      write(plugins, 'known_marketplaces.json', '{}');
      write(plugins, 'known_marketplaces_claudeai.json', '{}');
      expect(await presence(repo, env)).toMatchObject({ state: 'unknown', detail: expect.stringContaining(`${join(plugins, 'known_marketplaces_claudeai.json')} records the marketplaces hosted on claude.ai`) });
      // An id that names no marketplace has no directory to look in, whatever is on disk.
      const inline = repository({ '.claude/settings.json': JSON.stringify({ enabledPlugins: { 'spec-harness@inline': true } }) });
      expect(await presence(inline, { CLAUDE_CODE_PLUGIN_CACHE_DIR: installPlugin(temp(), 'spec-harness@inline') })).toMatchObject({ state: 'unknown', detail: expect.stringContaining('spec-harness@inline names no marketplace') });
      // And where no plugin is on, nothing is read or said.
      expect(await presence(repository({}), env)).toBeNull();
    });
  });

  it('writes the hooks and the server once the plugin is off for the project, whatever the user\'s settings say', async () => {
    const user = temp();
    write(user, 'settings.json', JSON.stringify({ enabledPlugins: { 'spec-harness@spec-tools': true } }));
    const repo = repository({ '.claude/settings.local.json': JSON.stringify({ enabledPlugins: { 'spec-harness@spec-tools': false } }) });
    const result = await cli(['init', '--write'], repo.root, { env: { CLAUDE_CONFIG_DIR: user } });
    expect(result.stdout).toContain('create  .claude/settings.json\n        the guard hooks');
    expect(result.stdout).toContain('create  .mcp.json\n        the spec-harness MCP server');
    expect(JSON.parse(repo.read('.claude/settings.json')).hooks.PreToolUse[0].hooks[0]).toEqual(GUARD_HOOK);
    expect(JSON.parse(repo.read('.mcp.json'))).toEqual({ mcpServers: { 'spec-harness': mcpServer(PROJECT_DIR_OR_HERE) } });
  });

  it('reads the user\'s settings under the home directory, unless CLAUDE_CONFIG_DIR names another place', async () => {
    const home = temp();
    write(home, '.claude/settings.json', JSON.stringify({ enabledPlugins: { 'spec-harness@spec-tools': true } }));
    const repo = repository({});
    // HOME on macOS and Linux, USERPROFILE on Windows: both name the same place here.
    const fromHome = await cli(['init'], repo.root, { env: { HOME: home, USERPROFILE: home } });
    expect(fromHome.stdout).toContain(`skip    .claude/settings.json\n        the spec-harness plugin is on (spec-harness@spec-tools in ${join(home, '.claude', 'settings.json')})`);
    const elsewhere = await cli(['init'], repo.root, { env: { HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: temp() } });
    expect(elsewhere.stdout).toContain('create  .claude/settings.json\n');
  });

  it('stops with exit 2 when a step it applies fails', async () => {
    const repo = repository({}, { tools: { 'spec-brief': ['node', '-e', 'process.stderr.write("init refused\\n"); process.exit(1)'] } });
    const result = await cli(['init', '--write'], repo.root);
    expect(result).toMatchObject({ code: 2, stderr: 'spec-harness: .spec-brief.json: spec-brief init failed: init refused\n' });
  });
});

describe('the Claude Code settings init and doctor read', () => {
  const project = (root: string) => [
    { file: '.claude/settings.json', path: join(root, '.claude', 'settings.json') },
    { file: '.claude/settings.local.json', path: join(root, '.claude', 'settings.local.json') },
  ];

  it('are the user\'s under the home directory Claude Code uses, then the project\'s and the local ones', () => {
    const env = { HOME: join('h', 'posix'), USERPROFILE: join('h', 'windows') };
    const user = (home: string) => ({ file: join(home, '.claude', 'settings.json'), path: join(home, '.claude', 'settings.json') });
    expect(claudeSettingsFiles('r', env, 'win32')).toEqual([user(join('h', 'windows')), ...project('r')]);
    expect(claudeSettingsFiles('r', env, 'linux')).toEqual([user(join('h', 'posix')), ...project('r')]);
    expect(claudeSettingsFiles('r', env, 'darwin')).toEqual([user(join('h', 'posix')), ...project('r')]);
  });

  it('put CLAUDE_CONFIG_DIR before the home directory, and leave the user\'s out when neither is named', () => {
    const settings = join('c', 'settings.json');
    expect(claudeSettingsFiles('r', { CLAUDE_CONFIG_DIR: 'c', HOME: 'h' }, 'linux')).toEqual([{ file: settings, path: settings }, ...project('r')]);
    expect(claudeSettingsFiles('r', { CLAUDE_CONFIG_DIR: '', HOME: 'h' }, 'linux')[0]?.path).toBe(join('h', '.claude', 'settings.json'));
    expect(claudeSettingsFiles('r', { HOME: '' }, 'linux')).toEqual(project('r'));
    expect(claudeSettingsFiles('r', { HOME: 'h' }, 'win32')).toEqual(project('r'));
    expect(claudeSettingsFiles('r', {}, 'linux')).toEqual(project('r'));
  });
});

describe("a core.hooksPath that names a file (ADR-0005)", () => {
  it("is said in git's own words, where it was said as a git older than 2.31, and git commits with no hook", async () => {
    // Measured with git 2.47 and 2.55: rev-parse refuses the path as one that is not a directory, and a commit runs no hook.
    const repo = repository({ hooksfile: 'not a directory\n' });
    repo.git('config', 'core.hooksPath', 'hooksfile');
    const result = await cli(['doctor', '--format', 'json'], repo.root);
    expect({ code: result.code, stderr: result.stderr }).toEqual({ code: 0, stderr: '' });
    const { gitHook } = parsed<{ gitHook: { state: string; detail: string } }>(result);
    expect(gitHook.state).toBe('unknown');
    expect(gitHook.detail).toMatch(/^where git runs its hooks cannot be told: git rev-parse --git-path hooks\/pre-commit failed: fatal: Invalid path '.*hooksfile[\\/]pre-commit': Not a directory$/);
    expect(gitHook.detail).not.toContain('2.31');
    // Never fine: a failure under --strict, as every other thing doctor cannot tell is, where it failed nothing.
    expect((await cli(['doctor', '--strict'], repo.root)).code).toBe(1);
    expect((await cli(['init', '--git-hook', '--write'], repo.root)).stdout).toContain(`advise  pre-commit\n        ${gitHook.detail}\n`);
    expect(existsSync(join(repo.root, 'hooksfile', 'pre-commit'))).toBe(false);
    repo.write('work.txt', 'w\n');
    repo.git('add', 'work.txt');
    expect(spawnSync('git', ['commit', '-q', '-m', 'work'], { cwd: repo.root, encoding: 'utf8' }).status).toBe(0);
  });
});

describe("the harness's own state under git's directory, where something else stands (ADR-0003)", () => {
  // A file there ended escalate and rule on Node's ENOTDIR and a stack.
  it('is said in a line that names the path, exit 2, by every command that keeps a request there', async () => {
    const repo = repository({ [BRIEF_FILE]: brief({ affected: ['src/**'] }) });
    repo.git('checkout', '-q', '-b', 'brief/001-rotate');
    const state = join(repo.git('rev-parse', '--path-format=absolute', '--git-common-dir'), 'spec-harness');
    writeFileSync(state, 'a file\n');
    const said = (path: string): string => `spec-harness: ${path} is not a directory, where spec-harness keeps its state in one: move it away, and run the command again\n`;
    for (const argv of [['escalate', '--list'], ['escalate', '--show', 'E-001-1'], ['escalate', '--path', 'src/a.ts', '--reason', 'why'], ['rule', 'E-001-1', '--allow', '--note', 'n']]) {
      expect(await cli(argv, repo.root), argv.join(' ')).toEqual({ code: 2, stdout: '', stderr: said(join(state)) });
    }
    // A file a step further down is named itself.
    rmSync(state);
    mkdirSync(state);
    writeFileSync(join(state, 'escalations'), 'a file\n');
    expect(await cli(['escalate', '--list'], repo.root)).toEqual({ code: 2, stdout: '', stderr: said(join(state, 'escalations')) });
    // Moved away, the command runs.
    rmSync(join(state, 'escalations'));
    expect(await cli(['escalate', '--list'], repo.root)).toMatchObject({ code: 0, stderr: '' });
  });

  it('is an error of its own, by its name, and any other refusal of the directory is thrown as Node threw it', async () => {
    const repo = repository({});
    const common = repo.git('rev-parse', '--path-format=absolute', '--git-common-dir');
    writeFileSync(join(common, 'spec-harness'), 'a file\n');
    await expect(stateDirectory(common, 'escalations')).rejects.toMatchObject({ name: 'StateError', message: expect.stringMatching(/ is not a directory, where spec-harness keeps its state in one: /) });
    rmSync(join(common, 'spec-harness'));
    // A name no filesystem takes is no path that holds something else.
    const refused: unknown = await stateDirectory(common, 'x'.repeat(1000)).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(Error);
    expect(refused).not.toBeInstanceOf(StateError);
    expect((refused as NodeJS.ErrnoException).code).toMatch(/^E[A-Z]+$/);
    expect(['ENOTDIR', 'EEXIST']).not.toContain((refused as NodeJS.ErrnoException).code);
  });
});

describe('a named pipe where a file is read (ADR-0005)', () => {
  // Read as a file, a pipe nothing writes to was read without end: neither doctor nor init came back.
  it.skipIf(process.platform === 'win32')("has doctor and init come back from one where a settings file or the servers' file is expected", async () => {
    for (const path of ['.claude/settings.json', '.claude/settings.local.json', '.mcp.json', '<user>/settings.json']) {
      const repo = repository({});
      const user = temp();
      const full = path.startsWith('<user>/') ? join(user, path.slice('<user>/'.length)) : join(repo.root, ...path.split('/'));
      mkdirSync(join(full, '..'), { recursive: true });
      execFileSync('mkfifo', [full]);
      const env = { CLAUDE_CONFIG_DIR: user, PATH: process.env['PATH'] ?? '' };
      const doctor = await cli(['doctor'], repo.root, { env });
      expect({ code: doctor.code, stderr: doctor.stderr }, path).toEqual({ code: 0, stderr: '' });
      const init = await cli(['init'], repo.root, { env });
      expect({ code: init.code, stderr: init.stderr }, path).toEqual({ code: 0, stderr: '' });
      // Read as one that cannot be read as JSON, which holds no hook and no plugin.
      if (path === '.claude/settings.json') expect(init.stdout).toContain('advise  .claude/settings.json\n        cannot be read as JSON');
      if (path === '.mcp.json') expect(init.stdout).toContain('advise  .mcp.json\n        cannot be read as JSON; add the spec-harness server by hand');
    }
  });

  it.skipIf(process.platform === 'win32')("has every command, the hook among them, say one under the configuration's name in a line, exit 2, as for a directory", async () => {
    const repo = repository({}, null);
    execFileSync('mkfifo', [join(repo.root, '.spec-harness.json')]);
    const said = 'spec-harness: .spec-harness.json is neither a file nor a directory, not a configuration file\n';
    expect(await cli(['doctor'], repo.root)).toEqual({ code: 2, stdout: '', stderr: said });
    const question = JSON.stringify({ session_id: 's', cwd: repo.root, hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: join(repo.root, 'a.ts'), old_string: 'a', new_string: 'b' } });
    expect(await cli(['hook', 'claude'], repo.root, { stdin: question })).toEqual({ code: 2, stdout: '', stderr: said });
  });
});

