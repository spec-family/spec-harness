/**
 * The command lines the releases put into people's repositories.
 *
 * `init` writes the guard hooks into `.claude/settings.json`, the server
 * into `.mcp.json` and git's pre-commit hook, and never writes one of them
 * again: a repository keeps the line the release it ran wrote. The plugin
 * ships the same hooks and server. So each line any release wrote is one a
 * later release is still handed, argument for argument, and a release that
 * refuses what an earlier one accepted is held to them here: none may be
 * refused, and Claude Code's hook least of all, since exit 2 from it holds
 * every write of a session (ADR-0005, ADR-0012).
 *
 * The lines are data, read from the tags: `src/setup.ts`, `src/configure.ts`,
 * `hooks/hooks.json` and `.mcp.json` at v0.1.0 to v0.21.0. A line is added
 * here when a release changes what it writes, and none is taken out: 0.22.0
 * names the script under the scope the family moved to on 2026-10-26, so the
 * lines with the earlier scope's stay, beside those it writes.
 */

import { spawnSync } from 'node:child_process';
import { chmodSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { arrayMatcher, GIT_HOOK_LINE, GUARD_HOOK, matchingUnder, mcpServer, mergeClaudeSettings, PLUGIN, PRE_COMMIT, PROJECT_DIR, PROJECT_DIR_OR_HERE, reportHooks, SCHEMA_MOVED, SPEC_BRIEF_SCHEMA, TURN_HOOK, withSessionStart, withTurnReport } from '../../src/configure.js';
import { CALLABLE_TOOLS, WRITING_TOOLS } from '../../src/hooks.js';
import { claudeHookLine, refusal, twoValues } from '../../src/usage.js';
import { parseOptions } from '../../src/workspace.js';
import { releasedHook } from './released-hooks.js';
import { brief, BRIEF_FILE, cleanup, cli, installHarness, parsed, repository, ROOT, temp, type Captured, type Repository } from './helpers.js';

afterAll(cleanup);

/**
 * The hook's answer where it checks nothing and says so: one line to the
 * person, as `systemMessage`, and exit 0. Exit 1 said it before, which
 * Claude Code counts as a hook that failed, and `onFailure: "block"` holds
 * the write for (ADR-0005).
 */
const warning = (said: string): Captured => ({ code: 0, stdout: `${JSON.stringify({ systemMessage: said })}\n`, stderr: '' });

/** The line a run says as a warning, alone on stdout with nothing on stderr, or `null` for any other answer. */
function warned(result: Captured): string | null {
  if (result.code !== 0 || result.stderr !== '') return null;
  try {
    const value = JSON.parse(result.stdout) as Record<string, unknown>;
    return Object.keys(value).length === 1 && typeof value['systemMessage'] === 'string' ? value['systemMessage'] : null;
  } catch {
    return null;
  }
}

const SCRIPT = 'node_modules/@spec-family/spec-harness/bin/spec-harness.js';

/** The script as 0.1.2 to 0.21.0 wrote it, the package's name before the family moved to `@spec-family` (spec-core's ADR-0005, Names). */
const EARLIER = 'node_modules/@descent-vtt/spec-harness/bin/spec-harness.js';

interface Written {
  /** The releases whose `init` wrote the line, or whose plugin shipped it. */
  readonly releases: string;
  readonly where: string;
  /** As it was written: one string where a shell reads it, a program and its arguments where none does. */
  readonly line: string | readonly string[];
}

const HOOKS = "the guard hooks init wrote into .claude/settings.json, and the plugin's hooks/hooks.json";

/**
 * The matcher every release wrote over the hook's line, under PreToolUse and
 * under PostToolUse: read from the tags as the lines were, `src/setup.ts`,
 * `src/configure.ts` and `hooks/hooks.json` at v0.1.0 to v0.15.0. Claude Code
 * starts an entry by the event it stands under and this, so what doctor says
 * of when a line is started is held to it as well.
 */
const MATCHER = 'Edit|Write|MultiEdit|NotebookEdit';

const WRITTEN: readonly Written[] = [
  { releases: '0.1.0 to 0.1.1', where: HOOKS, line: 'npx --no-install spec-harness hook claude' },
  { releases: '0.1.2 to 0.21.0', where: HOOKS, line: ['node', `\${CLAUDE_PROJECT_DIR}/${EARLIER}`, 'hook', 'claude'] },
  { releases: '0.22.0 on', where: HOOKS, line: ['node', `\${CLAUDE_PROJECT_DIR}/${SCRIPT}`, 'hook', 'claude'] },
  { releases: '0.1.0 to 0.1.1', where: "the server init registered in .mcp.json, and the plugin's .mcp.json", line: ['npx', '--no-install', 'spec-harness', 'mcp'] },
  { releases: '0.1.2 to 0.21.0', where: 'the server init registered in .mcp.json', line: ['node', `\${CLAUDE_PROJECT_DIR:-.}/${EARLIER}`, 'mcp', '--root', '${CLAUDE_PROJECT_DIR:-.}'] },
  { releases: '0.22.0 on', where: 'the server init registers in .mcp.json', line: ['node', `\${CLAUDE_PROJECT_DIR:-.}/${SCRIPT}`, 'mcp', '--root', '${CLAUDE_PROJECT_DIR:-.}'] },
  { releases: '0.1.2 to 0.21.0', where: "the plugin's .mcp.json", line: ['node', `\${CLAUDE_PROJECT_DIR}/${EARLIER}`, 'mcp', '--root', '${CLAUDE_PROJECT_DIR}'] },
  { releases: '0.22.0 on', where: "the plugin's .mcp.json", line: ['node', `\${CLAUDE_PROJECT_DIR}/${SCRIPT}`, 'mcp', '--root', '${CLAUDE_PROJECT_DIR}'] },
  {
    releases: '0.1.0 to 0.9.1',
    where: "the pre-commit hook init --git-hook wrote, and the line init and doctor gave for a hook of the repository's own",
    line: 'npx --no-install spec-harness hook git',
  },
  // The hook's last line is the same under either scope: what it runs is `bin`, set above it.
  { releases: '0.10.0 on', where: 'the pre-commit hook init --git-hook wrote, with bin set to the script', line: 'node "$bin" hook git' },
  { releases: '0.10.0 to 0.21.0', where: "the line init and doctor gave for a hook of the repository's own", line: `node ${EARLIER} hook git` },
  { releases: '0.22.0 on', where: "the line init and doctor give for a hook of the repository's own", line: `node ${SCRIPT} hook git` },
];

/** The words of a line, as a shell splits one that holds no space inside a word. */
function wordsOf(line: string | readonly string[]): readonly string[] {
  return typeof line === 'string' ? line.split(' ') : line;
}

/**
 * What the harness is handed: the words after the one that starts it, each
 * placeholder filled in as Claude Code fills it, `project` being the project
 * where Claude Code knows it and `null` where it does not. `null` for a
 * line that starts nothing then: its script's path, with nothing in front
 * of it, is at the top of the filesystem, where node finds none.
 */
function handed(line: Written['line'], project: string | null): string[] | null {
  const words = wordsOf(line).map((word) =>
    word
      .split('${CLAUDE_PROJECT_DIR:-.}')
      .join(project ?? '.')
      .split('${CLAUDE_PROJECT_DIR}')
      .join(project ?? ''),
  );
  const launcher = words.findIndex((word) => word === 'spec-harness' || word === '"$bin"' || word.endsWith('/spec-harness.js'));
  if (launcher === -1) throw new Error(`no launcher in ${words.join(' ')}`);
  return (words[launcher] as string).startsWith('/node_modules/') ? null : words.slice(launcher + 1);
}

let repo: Repository;

beforeAll(() => {
  repo = repository({ [BRIEF_FILE]: brief({ affected: ['src/auth/**'], protected: ['src/db/**'] }), 'src/db/schema.ts': 'table;\n' });
  repo.git('checkout', '-q', '-b', 'brief/001-rotate');
  // A commit that would change a protected file: what git's hook is asked about.
  repo.write('src/db/schema.ts', 'table changed;\n');
  repo.git('add', 'src/db/schema.ts');
});

const QUESTION = (event = 'PreToolUse'): string =>
  JSON.stringify({ session_id: 's', cwd: repo.root, hook_event_name: event, tool_name: 'Edit', tool_input: { file_path: join(repo.root, 'src', 'db', 'schema.ts'), old_string: 'a', new_string: 'b' } });

const SESSION = `${[
  { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } },
  { jsonrpc: '2.0', method: 'notifications/initialized' },
  { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'check_path', arguments: { paths: ['src/db/schema.ts'] } } },
]
  .map((message) => JSON.stringify(message))
  .join('\n')}\n`;

/** What the server answered the one call of {@link SESSION}. */
function answered(stdout: string): string {
  const answers = stdout
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as { id: number; result?: { content?: { text: string }[] } });
  return answers.find((answer) => answer.id === 2)?.result?.content?.[0]?.text ?? stdout;
}

describe('the lines the releases wrote', () => {
  it('are these, down to what this release writes, so that a line it changes is a line added here', () => {
    const lines = WRITTEN.map((written) => written.line);
    expect(lines).toContainEqual([GUARD_HOOK['command'], ...(GUARD_HOOK['args'] as string[])]);
    const project = mcpServer(PROJECT_DIR_OR_HERE);
    expect(lines).toContainEqual([project['command'], ...(project['args'] as string[])]);
    const plugin = mcpServer(PROJECT_DIR);
    expect(lines).toContainEqual([plugin['command'], ...(plugin['args'] as string[])]);
    expect(lines).toContain(GIT_HOOK_LINE);
    // The hook's last line, without the `exec` that hands it the shell.
    expect(PRE_COMMIT).toContain(`\nbin=${SCRIPT}\n`);
    expect(lines).toContain(PRE_COMMIT.trimEnd().split('\n').at(-1)?.replace(/^exec /, ''));
    // And the plugin's own files hold lines that are listed.
    const hooks = JSON.parse(readFileSync(join(ROOT, 'hooks', 'hooks.json'), 'utf8')) as { hooks: Record<string, { hooks: { command: string; args: string[] }[] }[]> };
    for (const event of ['PreToolUse', 'PostToolUse', 'SessionStart']) {
      for (const hook of hooks.hooks[event]?.flatMap((group) => group.hooks) ?? []) expect(lines, event).toContainEqual([hook.command, ...hook.args]);
    }
    expect(hooks.hooks['SessionStart']).toHaveLength(1);
    // No onFailure on the plugin's entries: what a Claude Code before 2.1.295
    // does with the key is on no page, and a plugin is read by whatever
    // release loads it, where init writes the key only when asked (ADR-0012).
    for (const event of Object.keys(hooks.hooks)) {
      for (const hook of hooks.hooks[event]?.flatMap((group) => group.hooks) ?? []) expect(Object.keys(hook), event).toEqual(['type', 'command', 'args', 'timeout']);
    }
    const servers = JSON.parse(readFileSync(join(ROOT, '.mcp.json'), 'utf8')) as { mcpServers: Record<string, { command: string; args: string[] }> };
    const server = servers.mcpServers['spec-harness'] as { command: string; args: string[] };
    expect(lines).toContainEqual([server.command, ...server.args]);
  });

  /** Every command line they hand the harness: where Claude Code knows the project, and where its environment does not hold it. */
  const HANDED = WRITTEN.flatMap((written) => ['/the/project', null].flatMap((project) => handed(written.line, project) ?? [])).length;

  it('hand the harness these five command lines, and no other', () => {
    const all = WRITTEN.flatMap((written) => ['/the/project', null].map((project) => handed(written.line, project)?.join(' ')));
    expect([...new Set(all.filter((argv) => argv !== undefined))].sort()).toEqual(['hook claude', 'hook git', 'mcp', 'mcp --root .', 'mcp --root /the/project']);
    expect(HANDED).toBeGreaterThan(0);
  });

  it('are none of them refused: each is read as the release that wrote it read it', () => {
    const isDirectory = (path: string): boolean => path === '/the/project' || path === '.';
    for (const written of WRITTEN) {
      for (const project of ['/the/project', null]) {
        const argv = handed(written.line, project);
        if (argv === null) continue;
        expect(refusal(parseOptions(argv), isDirectory), `${written.releases}: ${wordsOf(written.line).join(' ')}`).toBeNull();
        // Nor read as a line with two values for one option, which every command refuses and the hook says of its own.
        expect(twoValues(parseOptions(argv), '/the/project'), `${written.releases}: ${wordsOf(written.line).join(' ')}`).toBeNull();
      }
    }
  });

  it('are read argument for argument: the command, the word after it, and a root only where one is written', () => {
    // The parser is asked first, and a line it refused would be one no release ever had refused.
    const read = (argv: readonly string[]): unknown => (({ command, positionals, given, root }) => ({ command, positionals, given, root }))(parseOptions(argv));
    expect(read(['hook', 'claude'])).toEqual({ command: 'hook', positionals: ['claude'], given: [], root: undefined });
    expect(read(['hook', 'git'])).toEqual({ command: 'hook', positionals: ['git'], given: [], root: undefined });
    expect(read(['mcp'])).toEqual({ command: 'mcp', positionals: [], given: [], root: undefined });
    expect(read(['mcp', '--root', '.'])).toEqual({ command: 'mcp', positionals: [], given: ['root'], root: '.' });
    expect(read(['mcp', '--root', '/the/project'])).toEqual({ command: 'mcp', positionals: [], given: ['root'], root: '/the/project' });
    // Each value once: no line a release wrote gives an option two.
    for (const argv of [['hook', 'claude'], ['hook', 'git'], ['mcp']]) expect(parseOptions(argv).written, argv.join(' ')).toEqual({});
    for (const root of ['.', '/the/project']) expect(parseOptions(['mcp', '--root', root]).written).toEqual({ root: [root] });
  });

  it('name the root of a server by the placeholder they find its script with, so a root filled with nothing never ran', () => {
    // --root "" is refused now, where it ran in the directory the server was
    // started in. No line here was ever handed it and ran: the placeholder
    // that would leave the root empty leaves the script without its path.
    const rooted = WRITTEN.filter((written) => wordsOf(written.line).includes('--root'));
    expect(rooted).toHaveLength(4);
    for (const written of rooted) {
      const words = wordsOf(written.line);
      const root = words[words.indexOf('--root') + 1] as string;
      expect(root).toMatch(/^\$\{CLAUDE_PROJECT_DIR(?::-\.)?\}$/);
      expect([`${root}/${SCRIPT}`, `${root}/${EARLIER}`]).toContain(words[1]);
    }
  });

  it("put no --root on a hook's line: one that stands there, and what the hook says of it, is a person's", () => {
    // Claude Code's hook says a root that is not there, with exit 0. Every
    // line a release wrote for a hook is still handed to it without one.
    const hooks = WRITTEN.filter((written) => wordsOf(written.line).includes('hook'));
    expect(hooks.map((written) => wordsOf(written.line).at(-1))).toEqual(['claude', 'claude', 'claude', 'git', 'git', 'git', 'git']);
    for (const written of hooks) expect(wordsOf(written.line), written.releases).not.toContain('--root');
  });
});

describe('each line, run', () => {
  it("answers Claude Code's hook before a write to a protected file with a refusal, and exit 0", async () => {
    const result = await cli(['hook', 'claude'], repo.root, { stdin: QUESTION() });
    expect(result).toMatchObject({ code: 0, stderr: '' });
    expect(JSON.parse(result.stdout)).toMatchObject({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny' } });
  });

  it("answers git's hook for a commit that changes a protected file with a refusal, and exit 1", async () => {
    const result = await cli(['hook', 'git'], repo.root);
    expect(result).toMatchObject({ code: 1, stdout: '' });
    expect(result.stderr).toContain('refused  brief 001 does not empower this round to change src/db/schema.ts');
  });

  it('serves the project it runs in, and the one --root names from anywhere else', async () => {
    const here = await cli(['mcp'], repo.root, { stdin: SESSION });
    expect(here).toMatchObject({ code: 0, stderr: '' });
    expect(answered(here.stdout)).toMatch(/^deny: brief 001 does not empower this round to change src\/db\/schema\.ts/);
    // The plugin's line, from the plugin's own directory. `--root .`, which a
    // project's line is where Claude Code's environment does not hold the
    // project, is run as Claude Code runs it in claude-code.test.ts.
    const rooted = await cli(['mcp', '--root', repo.root], temp(), { stdin: SESSION });
    expect(rooted).toMatchObject({ code: 0, stderr: '' });
    expect(answered(rooted.stdout)).toMatch(/^deny: brief 001 does not empower/);
  });
});

describe("Claude Code's hook, with more on its line than a release wrote", () => {
  // Every other command refuses these. The hook reads its line as 0.11.1
  // did: a settings file is not the harness's to rewrite, and a refusal here
  // would be exit 2 before every write, the one that mends the line included.
  it('answers as it did: what it does not read is passed over, and the write is still refused', async () => {
    for (const rest of [['extra', '--strict', '--format', 'json', '--note', 'x', '--list', '--id', ''], ['--brief', ' ', '--base', '']]) {
      const result = await cli(['hook', 'claude', ...rest], repo.root, { stdin: QUESTION() });
      expect(result, rest.join(' ')).toMatchObject({ code: 0, stderr: '' });
      expect(JSON.parse(result.stdout), rest.join(' ')).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny' } });
    }
  });

  it('keeps its own answers: a warning for a question it cannot read, exit 0 outside a work tree, exit 2 for a brief that is not one', async () => {
    expect(await cli(['hook', 'claude', 'extra', '--strict'], repo.root, { stdin: 'not json' })).toEqual(warning('spec-harness: the hook input is not JSON, so nothing it asks about is checked'));
    // A root that is there and is no work tree is a session outside one.
    expect(await cli(['hook', 'claude', '--root', temp()], repo.root, { stdin: QUESTION() })).toEqual({ code: 0, stdout: '', stderr: '' });
    expect(await cli(['hook', 'claude', '--brief', '404'], repo.root, { stdin: QUESTION() })).toEqual({
      code: 2,
      stdout: '',
      stderr: 'spec-harness: the flag names brief 404, and spec-brief knows no such brief. Fix the brief or the branch before writing.\n',
    });
  });

  it("is the only line read so: git's hook refuses what it does not take, and the commit waits on a line that says why", async () => {
    expect(await cli(['hook', 'git', 'extra'], repo.root)).toEqual({ code: 2, stdout: '', stderr: 'spec-harness: hook takes one argument, "claude", "codex", "copilot" or "git", not "git", "extra"\n' });
    expect(await cli(['hook', 'git', '--strict'], repo.root)).toEqual({ code: 2, stdout: '', stderr: 'spec-harness: hook does not take --strict; its options are --brief, --base and --root\n' });
  });
});

describe("Claude Code's hook, with a --root on its line that is not there", () => {
  // No release wrote a --root on the hook's line: one that stands there is a
  // person's. A root that is a file, or is not there, read as a session
  // outside a work tree: exit 0, no word, and the write went on unguarded.
  // It is said now, in one line to the person, and exit 0: the write goes
  // on as it would without the hook. Exit 2 would hold every write of the
  // session over a line only a write can mend, and so would exit 1 under
  // onFailure "block", which Claude Code counts as a hook that failed
  // (ADR-0005).
  const said = (root: string): Captured =>
    warning(`spec-harness: --root is "${root}", which is not a directory, so the guard is off and this write is not checked; give the hook's line a directory that exists, or leave --root out for the project Claude Code names`);

  it('says so in one line with exit 0, before a write and after one, and refuses nothing', async () => {
    const nowhere = join(repo.root, 'nowhere');
    for (const event of ['PreToolUse', 'PostToolUse']) {
      expect(await cli(['hook', 'claude', '--root', nowhere], repo.root, { stdin: QUESTION(event) }), event).toEqual(said(nowhere));
    }
    const file = join(repo.root, 'src', 'db', 'schema.ts');
    expect(await cli(['hook', 'claude', '--root', file], repo.root, { stdin: QUESTION() })).toEqual(said(file));
    // Space alone names no directory either; git started in none for it.
    expect(await cli(['hook', 'claude', '--root', ' '], repo.root, { stdin: QUESTION() })).toEqual(said(' '));
  });

  it('is a warning whatever stands beside it, never the exit 2 that holds every write, and never an answer', async () => {
    const nowhere = join(repo.root, 'nowhere');
    // --brief 404 alone holds the write, exit 2: the root is asked about first, since no brief can be read without one.
    for (const rest of [['--brief', '404'], ['--brief', '', '--base', ' '], ['001', '--brief', '001', '--list', '--path', 'src/a.ts', '--strict']]) {
      const result = await cli(['hook', 'claude', '--root', nowhere, ...rest], repo.root, { stdin: QUESTION() });
      expect(result, rest.join(' ')).toEqual(said(nowhere));
    }
  });

  it('keeps what the hook answered before it: a question it cannot read, and a tool that writes no file', async () => {
    const nowhere = join(repo.root, 'nowhere');
    expect(await cli(['hook', 'claude', '--root', nowhere], repo.root, { stdin: 'not json' })).toEqual(warning('spec-harness: the hook input is not JSON, so nothing it asks about is checked'));
    const bash = JSON.stringify({ session_id: 's', cwd: repo.root, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } });
    expect(await cli(['hook', 'claude', '--root', nowhere], repo.root, { stdin: bash })).toEqual({ code: 0, stdout: '', stderr: '' });
  });

  it('guards as it did where the root is empty, in the directory the hook was started in, whatever else another command would refuse', async () => {
    // An empty root is what an unset variable leaves on a line written by
    // hand, and git starts where the hook did for it: the write is refused,
    // as in every release, not waved through with a line about the root.
    // Beside it, what every other command refuses since: an option --list
    // leaves unread, and a brief named twice.
    const result = await cli(['hook', 'claude', '--root', '', '001', '--brief', '001', '--list', '--path', 'src/a.ts', '--show', 'E-001-1'], repo.root, { stdin: QUESTION() });
    expect(result).toMatchObject({ code: 0, stderr: '' });
    expect(JSON.parse(result.stdout)).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny' } });
  });
});

describe("Claude Code's hook, on a line the parser cannot read", () => {
  // An option no command has, an option left without its value, a --format
  // or an --at that is none: each was exit 2 before the question was read,
  // which to Claude Code holds the write, and every write after it, the one
  // that mends the line among them. It is said as a root that is not there
  // is: one line to the person, exit 0, where there is a write the line
  // leaves unchecked (ADR-0005).
  const OFF = '), so the guard is off and this write is not checked; mend it in Claude Code\'s settings, where init writes "hook claude" and nothing after it';
  const said = (wrong: string): Captured => warning(`spec-harness: the hook's line cannot be read (${wrong}${OFF}`);

  /** Lines node's parser refuses, each with how its refusal starts: the rest is node's to word. */
  const REFUSED: readonly (readonly [readonly string[], string])[] = [
    [['--nope'], "Unknown option '--nope'"],
    [['--nope=value', 'extra'], "Unknown option '--nope'"],
    [['-x'], "Unknown option '-x'"],
    [['--root'], "Option '--root <value>' argument missing"],
    [['--brief'], "Option '--brief <value>' argument missing"],
    [['--strict=yes'], "Option '--strict' does not take an argument"],
    [['--format'], "Option '--format <value>' argument missing"],
  ];

  /** Lines that parse, and name a format or a probe position that is none: the harness's own words. */
  const NONE: readonly (readonly [readonly string[], string])[] = [
    [['--format', 'xml'], '--format must be pretty or human, json, gitlab, sarif or github, not "xml"'],
    [['--format', ''], '--format must be pretty or human, json, gitlab, sarif or github, not ""'],
    [['--format', 'gitlab'], '--format gitlab is for audit and premises; hook prints pretty or json'],
    [['--at', 'sideways'], '--at must be base, head or both, not "sideways"'],
  ];

  it('says so in one line with exit 0, before a write and after one, and holds no write for it', async () => {
    for (const event of ['PreToolUse', 'PostToolUse']) {
      for (const [rest, starts] of REFUSED) {
        const result = await cli(['hook', 'claude', ...rest], repo.root, { stdin: QUESTION(event) });
        const where = `${event}: ${rest.join(' ')}`;
        const line = warned(result);
        expect(line?.startsWith(`spec-harness: the hook's line cannot be read (${starts}`), `${where}: ${JSON.stringify(result)}`).toBe(true);
        expect(line?.endsWith(OFF), where).toBe(true);
        // One line: what the person is shown.
        expect(line, where).not.toContain('\n');
      }
      for (const [rest, wrong] of NONE) {
        expect(await cli(['hook', 'claude', ...rest], repo.root, { stdin: QUESTION(event) }), `${event}: ${rest.join(' ')}`).toEqual(said(wrong));
      }
    }
  });

  it('keeps on one line what node says in three of an option that may have lost its value', async () => {
    const result = await cli(['hook', 'claude', '--root', '--brief', '001'], repo.root, { stdin: QUESTION() });
    expect(result).toEqual(
      said("Option '--root' argument is ambiguous. Did you forget to specify the option argument for '--root'? To specify an option argument starting with a dash use '--root=-XYZ'."),
    );
  });

  it('is a warning whatever else stands on the line or names the brief, never the exit 2 that holds every write, and never an answer', async () => {
    // --brief 404 alone holds the write, exit 2, and so does SPEC_BRIEF: a line that cannot be read names no round.
    for (const rest of [
      ['--brief', '404', '--nope'],
      ['--nope', '--root', join(repo.root, 'nowhere')],
      ['--version', '--nope'],
      ['--help=1'],
      ['extra', '--list', '--nope'],
      // Two answers asked for, and two values for one option, are lines the parser cannot read, --help beside them or not.
      ['--help', '--version'],
      ['--help', '--brief', '404', '--brief', '001'],
      ['--brief', '001', '--brief', '404'],
    ]) {
      for (const event of ['PreToolUse', 'PostToolUse']) {
        const result = await cli(['hook', 'claude', ...rest], repo.root, { stdin: QUESTION(event), env: { SPEC_BRIEF: '404' } });
        expect(warned(result)?.endsWith(OFF), `${event}: ${rest.join(' ')}: ${JSON.stringify(result)}`).toBe(true);
      }
    }
  });

  it('says two values for an option that takes one, naming both, and guards where the two name one thing as it reads them', async () => {
    // --root nowhere --root . guarded in ., and --brief 001 --brief 404 held every write for 404.
    const twice = (option: string, first: string, other: string): Captured =>
      said(`--${option} is given twice, as ${JSON.stringify(first)} and as ${JSON.stringify(other)}, and one of the two would go unread`);
    for (const event of ['PreToolUse', 'PostToolUse']) {
      for (const [rest, option, first, other] of [
        [['--root', 'nowhere', '--root', '.'], 'root', 'nowhere', '.'],
        [['--brief', '001', '--brief', '404'], 'brief', '001', '404'],
        [['--base', 'nowhere', '--base', 'main'], 'base', 'nowhere', 'main'],
        // What the hook passes over, given two, cannot be read either.
        [['--format', 'json', '--format', 'pretty'], 'format', 'json', 'pretty'],
        [['--note', 'a', '--note', 'b'], 'note', 'a', 'b'],
      ] as const) {
        expect(await cli(['hook', 'claude', ...rest], repo.root, { stdin: QUESTION(event) }), `${event}: ${rest.join(' ')}`).toEqual(twice(option, first, other));
      }
    }
    // A relative root is read from where the hook is started, which is not the directory a test runs it for.
    for (const rest of [['--root', repo.root, '--root', `${repo.root}/`], ['--root', '', '--root', repo.root], ['--brief', '1', '--brief', '001'], ['--format', 'json', '--format', 'json']]) {
      const result = await cli(['hook', 'claude', ...rest], repo.root, { stdin: QUESTION() });
      expect(result, rest.join(' ')).toMatchObject({ code: 0, stderr: '' });
      expect(JSON.parse(result.stdout), rest.join(' ')).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny' } });
    }
  });

  it("is the hook's line wherever the option stands, and a value before the command is not taken for it", async () => {
    for (const argv of [['--nope', 'hook', 'claude'], ['hook', '--nope', 'claude'], ['--root', repo.root, 'hook', 'claude', '--nope'], ['hook', 'claude', 'extra', '-x']]) {
      const result = await cli(argv, repo.root, { stdin: QUESTION() });
      expect(warned(result)?.endsWith(OFF), `${argv.join(' ')}: ${JSON.stringify(result)}`).toBe(true);
    }
  });

  it('keeps what the hook answered before it: a question it cannot read, and a tool that writes no file', async () => {
    expect(await cli(['hook', 'claude', '--nope'], repo.root, { stdin: 'not json' })).toEqual(warning('spec-harness: the hook input is not JSON, so nothing it asks about is checked'));
    expect(await cli(['hook', 'claude', '--format', 'xml'], repo.root, { stdin: '{"tool_name":"Write"}' })).toEqual(warning('spec-harness: the hook input names no event or tool, so nothing it asks about is checked'));
    const bash = JSON.stringify({ session_id: 's', cwd: repo.root, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } });
    for (const rest of [['--nope'], ['--root'], ['--at', 'sideways']]) {
      expect(await cli(['hook', 'claude', ...rest], repo.root, { stdin: bash }), rest.join(' ')).toEqual({ code: 0, stdout: '', stderr: '' });
    }
  });

  it("is the hook's alone: git's hook, a hook that is neither and every other command stop on the same line, exit 2", async () => {
    // git stops one commit on a line a person reads, who can then mend the hook.
    const git = await cli(['hook', 'git', '--nope'], repo.root, { stdin: QUESTION() });
    expect({ code: git.code, stdout: git.stdout }).toEqual({ code: 2, stdout: '' });
    expect(git.stderr.startsWith("spec-harness: Unknown option '--nope'")).toBe(true);
    expect(git.stderr).not.toContain('the guard is off');
    expect(await cli(['hook', 'git', '--format', 'xml'], repo.root, { stdin: QUESTION() })).toEqual({
      code: 2,
      stdout: '',
      stderr: 'spec-harness: --format must be pretty or human, json, gitlab, sarif or github, not "xml"\n',
    });
    // A line that does not say whose hook it is, is nobody's: the word claude taken for a value, misspelt, or left out.
    for (const argv of [['hook', '--brief', 'claude', '--nope'], ['hook', 'claud', '--nope'], ['hook', '--nope'], ['guard', 'claude', '--nope'], ['--nope']]) {
      const result = await cli(argv, repo.root, { stdin: QUESTION() });
      expect({ code: result.code, stdout: result.stdout }, argv.join(' ')).toEqual({ code: 2, stdout: '' });
      expect(result.stderr.startsWith("spec-harness: Unknown option '--nope'"), argv.join(' ')).toBe(true);
    }
  });
});

describe("doctor, of the hook's line in Claude Code's settings", () => {
  // doctor reads a line by the hook's own reading of it (usage.ts), so what
  // it says of a line is what the hook does with that line (ADR-0005).
  const entry = (line: Written['line']): unknown => (typeof line === 'string' ? { type: 'command', command: line } : { type: 'command', command: line[0], args: line.slice(1) });
  const held = (...hooks: unknown[]): unknown => ({ hooks: { PreToolUse: [{ matcher: MATCHER, hooks }], PostToolUse: [{ matcher: MATCHER, hooks }] } });
  /** What doctor says of a line a release wrote: it guards, before every tool that writes and after each, and there is no more to say. */
  const RELEASED = {
    file: '.claude/settings.json',
    events: ['PreToolUse', 'PostToolUse'],
    line: ['hook', 'claude'],
    state: 'guards',
    onFailure: null,
    detail: null,
    before: CALLABLE_TOOLS,
    after: CALLABLE_TOOLS,
    cover: null,
    note: null,
    timeout: null,
  };
  const read = (words: readonly string[]) => claudeHookLine(words, parseOptions, '/the/project', () => false);

  it('reads each line a release wrote for the hook as the guard, with nothing more to say of it', () => {
    const hooks = WRITTEN.filter((written) => wordsOf(written.line).at(-1) === 'claude');
    expect(hooks).toHaveLength(3);
    for (const written of hooks) {
      const said = reportHooks([{ file: '.claude/settings.json', settings: held(entry(written.line)) }], '/the/project', read);
      expect(said, written.releases).toEqual([RELEASED]);
    }
  });

  it('reads the entries a release wrote, by their event and their matcher, as started before every write and after each', () => {
    // What init writes today, and the plugin's own file: each holds the
    // released matcher under both events, and is read as it stands.
    const plugin: unknown = JSON.parse(readFileSync(join(ROOT, 'hooks', 'hooks.json'), 'utf8'));
    for (const settings of [withSessionStart(mergeClaudeSettings({}) ?? {}, () => false), plugin]) {
      const groups = (settings as { hooks: Record<string, { matcher: string }[]> }).hooks;
      expect(Object.keys(groups)).toEqual(['PreToolUse', 'PostToolUse', 'SessionStart']);
      for (const event of ['PreToolUse', 'PostToolUse']) expect(groups[event]?.map((group) => group.matcher), event).toEqual([MATCHER]);
      // The entry as a session starts names no matcher, and is read for no write.
      expect(groups['SessionStart']?.map((group) => group.matcher)).toEqual([undefined]);
      expect(reportHooks([{ file: '.claude/settings.json', settings }], '/the/project', read)).toEqual([RELEASED]);
    }
    // The tools it names are the ones the hook reads a file from, and no other:
    // every one a supported Claude Code can call, and the one name more that
    // the hook reads for whatever still sends it.
    // And the entry at a turn's end, where turnReport is on, runs the same line and is read for no write.
    const turns = withTurnReport(withSessionStart(mergeClaudeSettings({}) ?? {}, () => false) ?? {}, () => false) as { hooks: Record<string, { matcher?: string; hooks: { command: string; args: string[] }[] }[]> };
    expect(Object.keys(turns.hooks)).toEqual(['PreToolUse', 'PostToolUse', 'SessionStart', 'Stop']);
    expect(turns.hooks['Stop']?.map((group) => group.matcher)).toEqual([undefined]);
    expect(turns.hooks['Stop']?.flatMap((group) => group.hooks.map((hook) => [hook.command, ...hook.args]))).toEqual([[GUARD_HOOK['command'], ...(GUARD_HOOK['args'] as string[])]]);
    expect(TURN_HOOK['args']).toEqual(GUARD_HOOK['args']);
    expect(reportHooks([{ file: '.claude/settings.json', settings: turns }], '/the/project', read)).toEqual([RELEASED]);
    expect(MATCHER.split('|')).toEqual(WRITING_TOOLS);
    for (const tool of CALLABLE_TOOLS) expect(MATCHER.split('|'), tool).toContain(tool);
  });

  it('reads the matcher every release wrote the same under every release of Claude Code, and under none: one string, with no comma and no hyphen in it', () => {
    // A comma separates names only from Claude Code 2.1.191 on, a hyphenated name is matched exactly only from 2.1.195 on, and an array for a matcher unloads a file's hooks (ADR-0005): none is in a line a release wrote.
    const plugin: unknown = JSON.parse(readFileSync(join(ROOT, 'hooks', 'hooks.json'), 'utf8'));
    for (const settings of [mergeClaudeSettings({}), plugin]) {
      for (const release of [{ state: 'ok', version: '2.1.139' }, { state: 'ok', version: '2.1.190' }, { state: 'ok', version: '2.1.191' }, { state: 'ok', version: '2.1.194' }, { state: 'ok', version: '2.1.195' }, { state: 'outdated', version: '2.0.0' }, { state: 'unknown', reason: 'no claude is on PATH' }, null] as const) {
        expect(reportHooks([{ file: '.claude/settings.json', settings }], '/the/project', read, undefined, matchingUnder(release)), JSON.stringify(release)).toEqual([RELEASED]);
      }
      expect(arrayMatcher(settings)).toBeNull();
    }
    expect(MATCHER).not.toContain(',');
    expect(MATCHER).not.toContain('-');
  });

  it('says what the hook does: a write refused where it says the line guards, and the hook\'s own words where it says the guard is off', async () => {
    // A directory that is there and is in no work tree: the hook reads a session outside one.
    const outside = temp();
    const LINES: readonly (readonly string[])[] = [
      ['--root', PROJECT_DIR, '--brief', '001'],
      ['--root', 'nowhere'],
      ['--format', 'xml'],
      ['--brief', '404'],
      ['--root', outside],
      ['--brief', '001', '--brief', '404'],
      ['--root', PROJECT_DIR, '--root', `${PROJECT_DIR}/`, '--brief', '1', '--brief', '001'],
      ['--help'],
      ['-v', '--brief', '404'],
      ['--help', '--root', 'nowhere'],
    ];
    repo.write('.claude/settings.json', JSON.stringify(held(...LINES.map((rest) => entry(['node', `${PROJECT_DIR}/${SCRIPT}`, 'hook', 'claude', ...rest])))));
    // The install the lines name, whose script doctor looks for.
    installHarness(repo.root);
    try {
      const doctor = parsed<{ root: string; claudeCode: { lines: { line: string[]; state: string; detail: string }[] } }>(await cli(['doctor', '--format', 'json'], repo.root));
      expect(doctor.claudeCode.lines.map((line) => [line.line.slice(2), line.state])).toEqual([
        [LINES[0], 'guards'],
        [LINES[1], 'off'],
        [LINES[2], 'off'],
        [LINES[3], 'held'],
        [LINES[4], 'off'],
        [LINES[5], 'off'],
        [LINES[6], 'guards'],
        [LINES[7], 'off'],
        [LINES[8], 'off'],
        [LINES[9], 'off'],
      ]);
      for (const [index, rest] of LINES.entries()) {
        const said = doctor.claudeCode.lines[index] as { state: string; detail: string };
        // The words Claude Code hands the hook: the project filled in.
        const result = await cli(['hook', 'claude', ...rest.map((word) => word.split(PROJECT_DIR).join(doctor.root))], repo.root, { stdin: QUESTION() });
        const where = `"hook claude ${rest.join(' ')}" in .claude/settings.json: `;
        if (said.state === 'guards') {
          expect(result, rest.join(' ')).toMatchObject({ code: 0, stderr: '' });
          expect(JSON.parse(result.stdout), rest.join(' ')).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny' } });
        } else if (said.state === 'held') {
          // Exit 2, which holds the write, and the same words for what is wrong with the name.
          const mend = ', so the hook holds every write until the line is mended: name a brief spec-brief lists, or take --brief off the line';
          expect(said.detail.startsWith(where) && said.detail.endsWith(mend), said.detail).toBe(true);
          expect(result, rest.join(' ')).toEqual({ code: 2, stdout: '', stderr: `spec-harness: ${said.detail.slice(where.length, -mend.length)}. Fix the brief or the branch before writing.\n` });
        } else if (rest === LINES[7] || rest === LINES[8]) {
          // The help or the version, printed in place of checking the write: exit 0, as doctor says of it, and the protected file's write not refused.
          expect(said.detail, said.detail).toContain(`the line asks for the ${rest === LINES[7] ? 'help' : 'version'}, which the hook prints, exit 0, in place of checking the write, so the guard is off`);
          expect(result, rest.join(' ')).toMatchObject({ code: 0, stderr: '' });
          expect(result.stdout, rest.join(' ')).not.toContain('permissionDecision');
        } else if (rest === LINES[4]) {
          // The one fault the hook says nothing of: exit 0 and no word, as doctor says of it.
          expect(said.detail, said.detail).toContain(`--root is "${outside}", a directory outside any git work tree, which the hook reads as a session outside one, exit 0 and no word, so the guard is off`);
          expect(result, rest.join(' ')).toEqual({ code: 0, stdout: '', stderr: '' });
        } else {
          expect(said.detail.startsWith(where), said.detail).toBe(true);
          expect(result, rest.join(' ')).toEqual(warning(`spec-harness: ${said.detail.slice(where.length).replace('no write is checked', 'this write is not checked')}`));
        }
      }
    } finally {
      rmSync(join(repo.root, '.claude'), { recursive: true, force: true });
      rmSync(join(repo.root, 'node_modules', '@spec-family', 'spec-harness'), { recursive: true, force: true });
    }
  });
});

describe("Claude Code's hook, whatever is on its line", () => {
  // The two things a line must never do: answer `allow`, which would skip
  // the person's own permission prompt, and hold a write for what is wrong
  // with the line itself: exit 2 holds it, and so does any other exit but 0
  // under onFailure "block". Exit 2 is for a write the hook could not check,
  // as for the brief that is named and is not one, above.
  const LINES: readonly (readonly string[])[] = [
    // Read, and passed over: the word as an option, an argument and a value.
    ['--allow', 'allow', '--note', 'allow'],
    // Not read, or with a root that is not there: said, and nothing answered.
    ['--allow', '--nope'],
    ['--allow=allow'],
    ['--root'],
    ['--format', 'allow'],
    ['--at', 'allow'],
    ['--allow', '--root', 'nowhere'],
    ['--allow', '--root', 'a', '--root', 'b'],
    ['--help', '--version'],
    ['--help', '--allow', '--root', 'nowhere'],
  ];

  it('never answers allow, and never holds a write for its own line: one the round may make, one it may not, one outside its scope', async () => {
    const before = (path: string): string =>
      JSON.stringify({ session_id: 's', cwd: repo.root, hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: join(repo.root, ...path.split('/')), content: 'x' } });
    for (const rest of LINES) {
      for (const path of ['src/auth/a.ts', 'src/db/schema.ts', 'README.md']) {
        const result = await cli(['hook', 'claude', ...rest], repo.root, { stdin: before(path) });
        const where = `${rest.join(' ')} | ${path}`;
        expect(result.stdout, where).not.toContain('"allow"');
        expect(result.code, where).toBe(0);
        // The line that is read still decides: the protected file is refused.
        if (rest === LINES[0] && path === 'src/db/schema.ts') expect(JSON.parse(result.stdout)).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny' } });
      }
    }
  });
});

describe('the lines 0.1.2 to 0.21.0 wrote, once the package is @spec-family/spec-harness', () => {
  // A project that ran init with 0.21.0 and then installed this release
  // beside it: the Upgrading line's first step. Its lines name the earlier
  // scope's script, which runs while that package is installed and starts
  // nothing once it is not, and Claude Code then lets each write go ahead.
  const OLD = { type: 'command', command: 'node', args: [`\${CLAUDE_PROJECT_DIR}/${EARLIER}`, 'hook', 'claude'], timeout: 60 };
  const SETTINGS = {
    hooks: { PreToolUse: [{ matcher: MATCHER, hooks: [OLD] }], PostToolUse: [{ matcher: MATCHER, hooks: [OLD] }], SessionStart: [{ hooks: [OLD] }], Stop: [{ hooks: [{ ...OLD, async: true }] }] },
  };
  const SERVER = { command: 'node', args: [`\${CLAUDE_PROJECT_DIR:-.}/${EARLIER}`, 'mcp', '--root', '${CLAUDE_PROJECT_DIR:-.}'] };
  const NAME = '@descent-vtt/spec-harness/spec-brief-plugin';
  /** spec-brief's schema where its init wrote it before the move, from 2026-09-26 on. */
  const SCHEMA = './node_modules/@descent-vtt/spec-brief/schema.json';
  /** The hook 0.19.0 to 0.21.0 wrote, as their tags have it. */
  const hook19 = (): string => releasedHook(EARLIER);

  /** A project on brief 001's branch with what 0.21.0's init wrote, this release installed, and the earlier package as well where `earlier`. */
  function moving(earlier: boolean, settings: unknown = SETTINGS): Repository {
    const project = repository({ [BRIEF_FILE]: brief({ affected: ['src/auth/**'], protected: ['src/db/**'] }), 'src/db/schema.ts': 'table;\n', 'src/auth/a.ts': 'auth;\n' });
    project.git('checkout', '-q', '-b', 'brief/001-rotate');
    project.write('.claude/settings.json', `${JSON.stringify(settings, null, 2)}\n`);
    project.write('.mcp.json', `${JSON.stringify({ mcpServers: { other: { command: 'x' }, 'spec-harness': SERVER } }, null, 2)}\n`);
    project.write('.spec-brief.json', `${JSON.stringify({ $schema: SCHEMA, plugins: [NAME] }, null, 2)}\n`);
    project.write('.git/hooks/pre-commit', hook19());
    chmodSync(join(project.root, '.git', 'hooks', 'pre-commit'), 0o755);
    installHarness(project.root);
    // doctor asks only whether the earlier script is a file.
    if (earlier) project.write(EARLIER, '');
    return project;
  }

  /** What doctor says of each line of the hook, of the plugin spec-brief loads and of git's hook, and its exit. */
  async function doctor(project: Repository) {
    const result = await cli(['doctor', '--format', 'json'], project.root);
    const said = parsed<{ root: string; claudeCode: { lines: { events: string[]; state: string; detail: string | null }[] }; plugin: { state: string }; gitHook: { state: string; note: string | null } }>(result);
    return { code: result.code, root: said.root, lines: said.claudeCode.lines.map(({ events, state, detail }) => ({ events, state, detail })), plugin: said.plugin.state, gitHook: { state: said.gitHook.state, note: said.gitHook.note } };
  }

  const INIT = `spec-harness init --write rewrites the line an earlier release wrote to run ${SCRIPT}, which npm install --save-dev @spec-family/spec-harness installs`;
  const WHERE = '"hook claude" in .claude/settings.json';

  it('is a line doctor says guards while the earlier package is installed, with how to move it, and is off once it is not', async () => {
    const both = await doctor(moving(true));
    expect(both.code).toBe(0);
    expect(both.lines).toEqual([
      {
        events: ['PreToolUse', 'PostToolUse'],
        state: 'guards',
        detail: `${WHERE} runs \${CLAUDE_PROJECT_DIR}/${EARLIER}, the script of @descent-vtt/spec-harness, the name of this package's releases up to 0.21.0: it guards while that package is installed, and once it is uninstalled the hook cannot start and Claude Code lets each write go ahead without it; ${INIT}`,
      },
    ]);
    expect(both.plugin).toBe('earlier');
    expect(both.gitHook.state).toBe('runs');
    expect(both.gitHook.note).toBe(
      `it runs ${EARLIER}, the script of @descent-vtt/spec-harness, the name of this package's releases up to 0.21.0, which is not there once that package is uninstalled: it is the hook an earlier release of init wrote, and spec-harness init --git-hook --write writes it again to run ${SCRIPT}`,
    );
    const off = await doctor(moving(false));
    expect(off.code).toBe(1);
    expect(off.lines).toEqual([
      {
        events: ['PreToolUse', 'PostToolUse'],
        state: 'off',
        detail: `${WHERE}: the script it runs, ${off.root}/${EARLIER}, is not there, so the hook cannot start, the guard is off and Claude Code lets each write it is started for go ahead without it; ${INIT}`,
      },
    ]);
  });

  it('is rewritten by init --write where it stands, with the server and the plugin, and by init --git-hook --write in git\'s hook, whichever package is still there', async () => {
    for (const earlier of [true, false]) {
      const project = moving(earlier);
      const steps = parsed<{ steps: { file: string; action: string; detail: string }[] }>(await cli(['init', '--write', '--format', 'json'], project.root)).steps;
      // The last step for a file is what is written there: spec-brief's has one that says what is kept first.
      const step = (file: string) => steps.filter((found) => found.file === file).at(-1);
      expect(step('.claude/settings.json')?.action).toBe('update');
      expect(step('.claude/settings.json')?.detail.startsWith(`the entries an earlier release wrote, which ran ${EARLIER}, run ${SCRIPT}, where they stand; the guard hooks`)).toBe(true);
      expect(step('.mcp.json')?.action).toBe('update');
      expect(step('.mcp.json')?.detail.startsWith(`the entry an earlier release wrote, which ran ${EARLIER}, runs ${SCRIPT}: the spec-harness MCP server`)).toBe(true);
      expect(step('.spec-brief.json')).toMatchObject({ action: 'update', detail: expect.stringContaining(`name spec-harness's plugin "${PLUGIN}" where an earlier release wrote "${NAME}"`) });
      expect(step('.spec-brief.json')?.detail).toContain(`uninstalled; ${SCHEMA_MOVED}; measure the archive from main`);
      // git's hook is written only where asked for, and kept with a note until then.
      expect(step('.git/hooks/pre-commit')).toMatchObject({ action: 'keep', detail: expect.stringContaining('spec-harness init --git-hook --write writes it again') });
      expect(project.read('.git/hooks/pre-commit')).toBe(hook19());
      const now = { ...GUARD_HOOK };
      expect(JSON.parse(project.read('.claude/settings.json'))).toEqual({
        hooks: { PreToolUse: [{ matcher: MATCHER, hooks: [now] }], PostToolUse: [{ matcher: MATCHER, hooks: [now] }], SessionStart: [{ hooks: [now] }], Stop: [{ hooks: [TURN_HOOK] }] },
      });
      expect(JSON.parse(project.read('.mcp.json'))).toEqual({ mcpServers: { other: { command: 'x' }, 'spec-harness': mcpServer(PROJECT_DIR_OR_HERE) } });
      expect(JSON.parse(project.read('.spec-brief.json'))).toEqual({ $schema: SPEC_BRIEF_SCHEMA, plugins: [PLUGIN], archiving: { base: 'main' } });
      const hooked = parsed<{ steps: { file: string; action: string; detail: string }[] }>(await cli(['init', '--git-hook', '--write', '--format', 'json'], project.root)).steps;
      expect(hooked.find((found) => found.file === '.git/hooks/pre-commit')).toEqual({
        file: '.git/hooks/pre-commit',
        action: 'update',
        detail: `the hook an earlier release of init wrote, which runs ${EARLIER}, written again to run ${SCRIPT}`,
      });
      expect(project.read('.git/hooks/pre-commit')).toBe(PRE_COMMIT);
      if (process.platform !== 'win32') expect(statSync(join(project.root, '.git', 'hooks', 'pre-commit')).mode & 0o777).toBe(0o755);
      // And doctor has nothing more to say of any of them.
      expect(await doctor(project)).toEqual({ code: 0, root: expect.any(String), lines: [{ events: ['PreToolUse', 'PostToolUse'], state: 'guards', detail: null }], plugin: 'loaded', gitHook: { state: 'runs', note: null } });
    }
  });

  it('starts, once rewritten, the hook of this package, which refuses the write the brief protects and lets the one it empowers through, never with allow', async () => {
    const project = moving(false);
    await cli(['init', '--write'], project.root);
    const settings = JSON.parse(project.read('.claude/settings.json')) as { hooks: Record<string, { hooks: { command: string; args: string[] }[] }[]> };
    for (const event of ['PreToolUse', 'PostToolUse']) {
      const entry = settings.hooks[event]?.[0]?.hooks[0];
      if (entry === undefined) throw new Error(`no entry under ${event}`);
      // As Claude Code starts it: the placeholder filled, node the one running here.
      const args = entry.args.map((arg) => arg.split('${CLAUDE_PROJECT_DIR}').join(project.root));
      const run = (path: string) =>
        spawnSync(process.execPath, args, { cwd: project.root, encoding: 'utf8', env: { ...process.env, SPEC_BRIEF: '' }, input: JSON.stringify({ session_id: 's', cwd: project.root, hook_event_name: event, tool_name: 'Write', tool_input: { file_path: join(project.root, ...path.split('/')), content: 'x' } }) });
      const refused = run('src/db/schema.ts');
      expect(refused.status, refused.stderr).toBe(0);
      if (event === 'PreToolUse') expect(JSON.parse(refused.stdout)).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny' } });
      const passed = run('src/auth/a.ts');
      expect({ status: passed.status, stderr: passed.stderr }).toEqual({ status: 0, stderr: '' });
      expect(passed.stdout).not.toContain('permissionDecision');
      expect(`${refused.stdout}${passed.stdout}`).not.toContain('"allow"');
    }
  });

  // On Windows git runs whatever stands at the path, so no hook is one it skips.
  it.skipIf(process.platform === 'win32')('is left, in git\'s hook, where git skips it for not being executable, as any such hook is', async () => {
    const project = moving(true);
    chmodSync(join(project.root, '.git', 'hooks', 'pre-commit'), 0o644);
    const steps = parsed<{ steps: { file: string; action: string; detail: string }[] }>(await cli(['init', '--git-hook', '--write', '--format', 'json'], project.root)).steps;
    expect(steps.find((found) => found.file === '.git/hooks/pre-commit')).toEqual({
      file: '.git/hooks/pre-commit',
      action: 'advise',
      detail: '.git/hooks/pre-commit runs spec-harness, but is not executable, so git skips it: chmod +x .git/hooks/pre-commit',
    });
    expect(project.read('.git/hooks/pre-commit')).toBe(hook19());
  });

  it("is left where a person wrote it: more on the line, or a hook of the repository's own", async () => {
    const theirs = { ...OLD, args: [...OLD.args, '--brief', '001'] };
    const project = moving(true, { hooks: { PreToolUse: [{ matcher: MATCHER, hooks: [theirs] }], PostToolUse: [{ matcher: MATCHER, hooks: [theirs] }] } });
    const own = `#!/bin/sh\nnpm test || exit 1\nnode ${EARLIER} hook git\n`;
    project.write('.git/hooks/pre-commit', own);
    const before = project.read('.claude/settings.json');
    const steps = parsed<{ steps: { file: string; action: string; detail: string }[] }>(await cli(['init', '--git-hook', '--write', '--format', 'json'], project.root)).steps;
    expect(steps.find((found) => found.file === '.claude/settings.json')).toMatchObject({ action: 'keep', detail: expect.stringContaining(`name ${SCRIPT}, which npm install --save-dev @spec-family/spec-harness installs, on the line in its place`) });
    expect(project.read('.claude/settings.json')).toBe(before);
    expect(steps.find((found) => found.file === '.git/hooks/pre-commit')).toMatchObject({ action: 'keep', detail: expect.stringContaining(`name ${SCRIPT} there in its place`) });
    expect(project.read('.git/hooks/pre-commit')).toBe(own);
  });
});
