/**
 * What a command loads.
 *
 * The hook runs before and after every write an agent makes, and what the
 * command line loaded of the other commands was a wait before each: so a
 * module only some commands run is imported where one of them is the
 * command (cli.ts, round.ts). Nothing a command prints says what it loaded,
 * so these tests read it through mocks that hand each such module on as it
 * is, and write down that it was asked for.
 *
 * A file of its own, because a mock reaches everything the file imports;
 * and one that imports none of those modules at its top. A mutant under
 * which one of them throws as it loads keeps every file that imports it
 * from loading, and a sweep counts a test that failed, not a file that did
 * not load: here the command line asks for the module inside a test, and
 * the test fails.
 */

import { join } from 'node:path';

import { afterAll, describe, expect, it, vi } from 'vitest';

import { brief, BRIEF_FILE, cleanup, installHarness, repository, temp, type Captured, type Repository } from './helpers.js';

const seen = {
  /** The modules asked for since the command line was last loaded, in the order they were. */
  loaded: [] as string[],
  /** The modules that throw as they load. */
  broken: new Set<string>(),
};

/** The module as it is, written down as asked for; or its failure to load. */
function handedOn<T>(name: string, original: () => Promise<T>): Promise<T> {
  seen.loaded.push(name);
  if (seen.broken.has(name)) throw new Error(`${name} is broken`);
  return original();
}

/**
 * Each module only some commands run, mocked by itself handed on. Said again
 * before every load of the command line: a mock's module is kept from one
 * load to the next, and a module kept is one never seen asked for again.
 */
function watch(): void {
  vi.doMock('node:crypto', (original) => handedOn('node:crypto', original));
  vi.doMock('../../src/audit.js', (original) => handedOn('audit', original));
  vi.doMock('../../src/commands.js', (original) => handedOn('commands', original));
  vi.doMock('../../src/configure.js', (original) => handedOn('configure', original));
  vi.doMock('../../src/host.js', (original) => handedOn('host', original));
  vi.doMock('../../src/premises.js', (original) => handedOn('premises', original));
  vi.doMock('../../src/reader.js', (original) => handedOn('reader', original));
  vi.doMock('../../src/round.js', (original) => handedOn('round', original));
  vi.doMock('../../src/server.js', (original) => handedOn('server', original));
  vi.doMock('../../src/setup.js', (original) => handedOn('setup', original));
  vi.doMock('../../src/signers.js', (original) => handedOn('signers', original));
}

afterAll(cleanup);

interface Ran extends Captured {
  /** What the run loaded of the modules above, the command line loaded afresh for it. */
  readonly loaded: readonly string[];
}

/** The command line, loaded as a process loads it, with nothing kept of a run before. */
async function fresh(argv: readonly string[], cwd: string, options: { readonly env?: Readonly<Record<string, string | undefined>>; readonly stdin?: string; readonly broken?: readonly string[] } = {}): Promise<Ran> {
  vi.resetModules();
  watch();
  seen.loaded.length = 0;
  seen.broken = new Set(options.broken ?? []);
  const { run } = await import('../../src/cli.js');
  let stdout = '';
  let stderr = '';
  const code = await run(argv, {
    stdout: { write: (text: string) => (stdout += text) },
    stderr: { write: (text: string) => (stderr += text) },
    cwd,
    env: options.env ?? {},
    stdin: async () => options.stdin ?? '',
  });
  const loaded = [...seen.loaded];
  // doctor asks for its modules at once, and ends on the first that cannot
  // be loaded while the others are still loading. They are waited for here:
  // one that came to its end during the next run would be that run's.
  await Promise.allSettled([import('../../src/configure.js'), import('../../src/round.js'), import('../../src/setup.js'), import('../../src/signers.js')]);
  seen.broken = new Set();
  return { code, stdout, stderr, loaded };
}

/** What a run loaded, but for the tables of `init`, which the operations of a round still load with them. */
const ofThem = (ran: Ran): string[] => ran.loaded.filter((name) => name !== 'configure');

const question = (event: string, file: string, cwd: string): string => JSON.stringify({ hook_event_name: event, tool_name: 'Edit', tool_input: { file_path: file }, cwd });
const hook = (repo: Repository, event: string, path: string, options: { readonly broken?: readonly string[] } = {}): Promise<Ran> =>
  fresh(['hook', 'claude'], repo.root, { env: { CLAUDE_PROJECT_DIR: repo.root }, stdin: question(event, join(repo.root, ...path.split('/')), repo.root), ...options });

/** The settings of a project whose writes Claude Code hands to the hook, as `init` writes the entry. */
const WIRED = JSON.stringify({
  hooks: { PreToolUse: [{ matcher: 'Edit|Write', hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PROJECT_DIR}/node_modules/@spec-family/spec-harness/bin/spec-harness.js', 'hook', 'claude'], timeout: 60 }] }] },
});

const RULINGS = ['## Rulings', '', '| id | paths | decision | note |', '| --- | --- | --- | --- |'];
const ALLOW = '| R-001-1 | `src/db/schema.ts` | allow | the schema moves with the token |';

/** A repository on the branch of its one brief, which protects src/db/**. */
function onBrief(rows: readonly string[] = []): Repository {
  const body = rows.length === 0 ? {} : { body: [...RULINGS, ...rows, ''].join('\n') };
  const repo = repository({ [BRIEF_FILE]: brief({ affected: ['src/**'], protected: ['src/db/**'], ...body }), 'src/db/schema.ts': 'table;\n', 'src/app.ts': 'app;\n' });
  repo.git('checkout', '-q', '-b', 'brief/001-rotate');
  return repo;
}

describe('the hook', () => {
  it('loads the operations of a round to decide a write, and no other command, where no brief is named', async () => {
    const repo = repository({ 'src/app.ts': 'app;\n' });
    const before = await hook(repo, 'PreToolUse', 'src/app.ts');
    expect(before).toMatchObject({ code: 0, stdout: '', stderr: '' });
    expect(ofThem(before)).toEqual(['round']);
    expect(ofThem(await hook(repo, 'PostToolUse', 'src/app.ts'))).toEqual(['round']);
  });

  it('loads no reader of rulings for a write the brief does not protect', async () => {
    const repo = onBrief([ALLOW]);
    const inside = await hook(repo, 'PreToolUse', 'src/app.ts');
    expect(inside).toMatchObject({ code: 0, stdout: '', stderr: '' });
    expect(ofThem(inside)).toEqual(['round']);
    expect(ofThem(await hook(repo, 'PostToolUse', 'README.md'))).toEqual(['round']);
  });

  it('loads the reader where a ruling is read, and the hash where a copy of the signers is named by it', async () => {
    // No row allows anything: the rulings are read, and nothing is verified.
    const unruled = await hook(onBrief(), 'PreToolUse', 'src/db/schema.ts');
    expect(unruled.stdout).toContain('"permissionDecision":"deny"');
    expect(ofThem(unruled)).toEqual(['round', 'reader']);
    // A row allows the file, and the base has signers to check its commit against.
    const repo = onBrief([ALLOW]);
    repo.git('checkout', '-q', 'main');
    repo.write('.github/allowed_signers', 'a@example.com namespaces="git" ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGtQUDZWhs8k/cvAw9yvIZ8xSV4FzrRbRUQ1o4rqxa1w\n');
    repo.commit('signers');
    repo.git('checkout', '-q', 'brief/001-rotate');
    // A signer counts where the merge base lists it too (ADR-0006).
    repo.git('merge', '-q', '--no-edit', 'main');
    const ruled = await hook(repo, 'PreToolUse', 'src/db/schema.ts');
    // The row's commit is not signed, so the ruling does not count.
    expect(ruled.stdout).toContain('"permissionDecision":"deny"');
    expect(ofThem(ruled)).toEqual(['round', 'reader', 'node:crypto']);
  });

  it('loads nothing after a write it answers from what the run before kept, or where nothing can be said', async () => {
    const repo = onBrief();
    const ask = (event: string, path: string): string =>
      JSON.stringify({ session_id: 'loads', tool_use_id: 'toolu_loads', hook_event_name: event, tool_name: 'Edit', tool_input: { file_path: join(repo.root, ...path.split('/')) }, cwd: repo.root });
    const before = await fresh(['hook', 'claude'], repo.root, { env: { CLAUDE_PROJECT_DIR: repo.root }, stdin: ask('PreToolUse', 'README.md') });
    expect(ofThem(before)).toEqual(['round']);
    const after = await fresh(['hook', 'claude'], repo.root, { env: { CLAUDE_PROJECT_DIR: repo.root }, stdin: ask('PostToolUse', 'README.md') });
    expect(after.stdout).toContain('README.md is outside brief 001');
    expect(after.loaded).toEqual([]);
    // Under outOfScope deny, with nothing kept.
    repo.write('.spec-harness.json', JSON.stringify({ outOfScope: 'deny' }));
    expect((await hook(repo, 'PostToolUse', 'README.md')).loaded).toEqual([]);
  });

  it('loads nothing more than the command line where it decides nothing', async () => {
    const repo = repository({});
    const outside = temp();
    // A session in no work tree, a tool that writes no file, a question that is none, and a line the parser refuses.
    expect((await fresh(['hook', 'claude'], outside, { env: { CLAUDE_PROJECT_DIR: outside }, stdin: question('PreToolUse', join(outside, 'a.txt'), outside) })).loaded).toEqual([]);
    expect((await fresh(['hook', 'claude'], repo.root, { stdin: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } }) })).loaded).toEqual([]);
    expect((await fresh(['hook', 'claude'], repo.root, { stdin: '{ not json' })).loaded).toEqual([]);
    const refused = await fresh(['hook', 'claude', '--nope'], repo.root, { stdin: question('PreToolUse', join(repo.root, 'a.txt'), repo.root) });
    expect(refused.code).toBe(0);
    expect(refused.loaded).toEqual([]);
  });
});

describe('the command line', () => {
  it('loads no command to say its version, its help, or what it refuses', async () => {
    const root = temp();
    expect((await fresh(['--version'], root)).loaded).toEqual([]);
    expect((await fresh(['--help'], root)).loaded).toEqual([]);
    expect(await fresh(['nope'], root)).toMatchObject({ code: 2, loaded: [] });
    expect(await fresh(['context', '--nope'], root)).toMatchObject({ code: 2, loaded: [] });
    expect(await fresh(['init', '--brief', '001'], root)).toMatchObject({ code: 2, loaded: [] });
  });

  // Each command opens its work tree first. In a directory that is in none
  // it ends there, with its module loaded and nothing of a round asked:
  // what a command loads does not turn on where it runs.
  const nowhere = (directory: string): string => `spec-harness: ${directory} is not inside a git work tree; spec-harness measures rounds by their commits\n`;

  it("loads a command's module where the command is the one typed, and no other command's", async () => {
    const outside = temp();
    const own = { context: 'commands', audit: 'commands', rulings: 'commands', probe: 'commands', escalate: 'commands', rule: 'commands', premises: 'premises', init: 'setup', mcp: 'server' };
    const line: Readonly<Record<string, readonly string[]>> = { escalate: ['escalate', '--list'], rule: ['rule', 'E-001-1', '--deny', '--note', 'no'] };
    for (const [command, module] of Object.entries(own)) {
      const ran = await fresh(line[command] ?? [command], outside);
      expect(ran, command).toMatchObject({ code: 2, stdout: '', stderr: nowhere(outside) });
      expect(ran.loaded.filter((name) => ['commands', 'premises', 'server', 'setup'].includes(name)), command).toEqual([module]);
      expect(ran.loaded, command).not.toContain('host');
    }
  });

  it('loads for doctor what doctor reads, and no command that reads a round', async () => {
    const outside = temp();
    const doctor = await fresh(['doctor'], outside);
    expect(doctor).toMatchObject({ code: 2, stdout: '', stderr: nowhere(outside) });
    expect([...doctor.loaded].sort()).toEqual(expect.arrayContaining(['configure', 'round', 'setup', 'signers']));
    expect(doctor.loaded.filter((name) => ['commands', 'premises', 'server', 'host'].includes(name))).toEqual([]);
  });

  it('loads what asks Claude Code its release where doctor asks it, which is where something wires the guard', async () => {
    const env = { PATH: temp() };
    const bare = await fresh(['doctor'], repository({}).root, { env });
    expect(bare).toMatchObject({ code: 0, stderr: '' });
    expect(bare.stdout).not.toContain('claude is on PATH');
    expect(bare.loaded).not.toContain('host');
    // With the install init's line names, so that the line guards.
    const project = repository({ '.claude/settings.json': WIRED });
    installHarness(project.root);
    const wired = await fresh(['doctor'], project.root, { env });
    expect(wired).toMatchObject({ code: 0, stderr: '' });
    expect(wired.stdout).toContain('cannot be told: no claude is on PATH');
    expect(wired.loaded).toContain('host');
  });
});

describe('a module that cannot be loaded', () => {
  it('ends the command that runs it in a line and exit 2, and no other command', async () => {
    const repo = onBrief();
    // doctor asks a release, and loads what asks it, where a guard is wired.
    repo.write('.claude/settings.json', WIRED);
    for (const [argv, broken] of [
      [['context'], 'commands'],
      [['premises'], 'premises'],
      [['init'], 'setup'],
      [['mcp'], 'server'],
      [['doctor'], 'signers'],
      [['doctor'], 'host'],
      [['guard', 'src/app.ts'], 'round'],
    ] as const) {
      const ran = await fresh(argv, repo.root, { broken: [broken], env: { PATH: temp() } });
      expect(ran, argv.join(' ')).toMatchObject({ code: 2, stdout: '' });
      expect(ran.stderr, argv.join(' ')).toMatch(/^spec-harness: unexpected error: /);
      expect(ran.loaded, argv.join(' ')).toContain(broken);
    }
    // What a command does not run is nothing to it.
    const others = ['commands', 'premises', 'server', 'setup', 'signers', 'host', 'audit'];
    expect(await fresh(['--version'], repo.root, { broken: [...others, 'round', 'reader'] })).toMatchObject({ code: 0, stderr: '' });
    const decided = await hook(repo, 'PreToolUse', 'src/db/schema.ts', { broken: others });
    expect(decided).toMatchObject({ code: 0, stderr: '' });
    expect(decided.stdout).toContain('"permissionDecision":"deny"');
    // git's hook decides nothing where nothing is staged, and loads nothing for it.
    expect(await fresh(['hook', 'git'], repo.root, { broken: ['round'] })).toMatchObject({ code: 0, stdout: '', stderr: '', loaded: [] });
    repo.write('src/app.ts', 'changed;\n');
    repo.git('add', 'src/app.ts');
    const staged = await fresh(['hook', 'git'], repo.root, { broken: ['round'] });
    expect(staged).toMatchObject({ code: 2, stdout: '' });
    expect(staged.stderr).toMatch(/^spec-harness: unexpected error: /);
  });

  it('holds the write the hook cannot check for it, before the write, and ends in exit 2 after it', async () => {
    const repo = onBrief();
    for (const broken of ['round', 'reader']) {
      const before = await hook(repo, 'PreToolUse', 'src/db/schema.ts', { broken: [broken] });
      expect(before, broken).toMatchObject({ code: 2, stdout: '' });
      expect(before.stderr, broken).toMatch(/^spec-harness: cannot check this write: /);
      expect(before.loaded, broken).toContain(broken);
      const after = await hook(repo, 'PostToolUse', 'src/db/schema.ts', { broken: [broken] });
      expect(after, broken).toMatchObject({ code: 2, stdout: '' });
      expect(after.stderr, broken).toMatch(/^spec-harness: unexpected error: /);
    }
    // The audit's judgement is loaded where an audit is run.
    const audit = await fresh(['audit'], repo.root, { broken: ['audit'] });
    expect(audit).toMatchObject({ code: 2, stdout: '' });
    expect(audit.stderr).toMatch(/^spec-harness: unexpected error: /);
    expect(audit.loaded).toContain('audit');
  });
});
