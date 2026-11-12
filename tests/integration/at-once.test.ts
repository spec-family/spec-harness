/**
 * What a command asks at once, and what it reads once.
 *
 * A process is what a command's time is made of: on a Windows workstation
 * git answers in a few hundred milliseconds and Claude Code in seconds, so
 * what `doctor`, `init` and the hook take is how many of them wait on one
 * another. Nothing a command prints says which did, so these tests read the
 * order the processes were started and answered in, through a mock of
 * `execFile` that hands every call on as it was given. No test here reads a
 * clock: where one thing has to be shown started before another has
 * answered, the mock keeps the answer back until it is.
 *
 * The same for a matcher that is a pattern, read in a context of its own:
 * the readings are counted through a mock of `runInNewContext`.
 *
 * A file of its own, because a mock reaches everything the file imports.
 */

import { copyFileSync, linkSync, symlinkSync } from 'node:fs';
import { basename, join } from 'node:path';

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { mergeClaudeSettings } from '../../src/configure.js';
import { openWorkspace } from '../../src/workspace.js';
import { brief, BRIEF_FILE, cleanup, cli, installHarness, parsed, repository, temp, withEnvironment, type Repository } from './helpers.js';

/** An answer kept back until something else is asked. */
interface Kept {
  /** What the command whose answer waits holds on its line. */
  readonly answer: string;
  /** Which asking of it, the first being 1. */
  readonly nth: number;
  /** What the line holds whose asking lets the answer go. */
  readonly until: string;
}

const seen = vi.hoisted(() => ({
  /** Every asking and every answer, in the order they happened; a line is the program by its name, and its arguments. */
  log: [] as { what: 'asked' | 'answered'; line: string; cwd?: string }[],
  /** What git is to be heard saying on stdout, for the one line that holds `part`, in place of what it said. */
  said: null as { readonly part: string; readonly stdout: (real: string) => string } | null,
  kept: null as Kept | null,
  /** A line that holds `part` is refused before it starts, as Node refuses one on Windows with spawn UNKNOWN: an error no command expects. */
  thrown: null as { readonly part: string } | null,
  waiting: [] as (() => void)[],
  /** The source of every pattern read in a context of its own. */
  readings: [] as string[],
}));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  type Done = (error: Error | null, stdout: string, stderr: string) => void;
  const started = actual.execFile as unknown as (file: string, args: string[], options: object, done: Done) => unknown;
  const asked = (part: string): number => seen.log.filter((entry) => entry.what === 'asked' && entry.line.includes(part)).length;
  const execFile = (file: string, args: readonly string[], options: { readonly cwd?: string }, done: Done): unknown => {
    const line = [basename(file).replace(/\.exe$/i, ''), ...args].join(' ');
    if (seen.thrown !== null && line.includes(seen.thrown.part)) throw new Error(`cannot start ${line}`);
    seen.log.push({ what: 'asked', line, ...(options.cwd === undefined ? {} : { cwd: options.cwd }) });
    const { said } = seen;
    const { kept } = seen;
    const waits = kept !== null && line.includes(kept.answer) && asked(kept.answer) === kept.nth;
    if (kept !== null && line.includes(kept.until)) for (const deliver of seen.waiting.splice(0)) deliver();
    return started(file, [...args], options, (error, stdout, stderr) => {
      const deliver = (): void => {
        seen.log.push({ what: 'answered', line });
        done(error, said !== null && line.includes(said.part) ? said.stdout(stdout) : stdout, stderr);
      };
      if (kept === null || !waits || asked(kept.until) > 0) return deliver();
      seen.waiting.push(deliver);
      // Where the other is never asked while this one waits, the answer is
      // handed on at last, and the test fails on the order it then reads.
      setTimeout(() => {
        const at = seen.waiting.indexOf(deliver);
        if (at === -1) return;
        seen.waiting.splice(at, 1);
        deliver();
      }, 5000).unref();
    });
  };
  return { ...actual, execFile };
});

vi.mock('node:vm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:vm')>();
  const runInNewContext: typeof actual.runInNewContext = (code, context, options) => {
    const handed = typeof context === 'object' ? (context as { readonly source?: unknown }) : {};
    seen.readings.push(String(handed.source));
    return actual.runInNewContext(code, context, options);
  };
  return { ...actual, runInNewContext };
});

beforeEach(() => {
  seen.log.length = 0;
  seen.kept = null;
  seen.said = null;
  seen.thrown = null;
  seen.waiting.length = 0;
  seen.readings.length = 0;
});

afterAll(cleanup);

/** Where, in the order things happened, the one command that holds `part` on its line was asked, or answered. */
function when(what: 'asked' | 'answered', part: string): number {
  const found = seen.log.flatMap((entry, index) => (entry.what === what && entry.line.includes(part) ? [index] : []));
  expect(found, `${what} once: ${part}\n${seen.log.map((entry) => `${entry.what} ${entry.line}`).join('\n')}`).toHaveLength(1);
  return found[0]!;
}

/** Whether every one of them was asked before any of them had answered. */
function atOnce(...parts: readonly string[]): boolean {
  return Math.max(...parts.map((part) => when('asked', part))) < Math.min(...parts.map((part) => when('answered', part)));
}

/**
 * Waits until every answer still on its way is in. A run that ends on a
 * fault of a work tree it was opening leaves the two processes it had asked
 * at once with the configuration, and their answers are not the next test's
 * to count.
 */
async function settled(): Promise<void> {
  const count = (what: 'asked' | 'answered'): number => seen.log.filter((entry) => entry.what === what).length;
  await vi.waitFor(() => expect(count('answered')).toBe(count('asked')), { timeout: 60_000, interval: 20 });
}

const TOP = 'rev-parse --show-toplevel';
const COMMON = '--git-common-dir';
/** The top and the common directory, asked in one start of git. */
const TREE = `${TOP} --path-format=absolute ${COMMON}`;
const BRANCH = 'symbolic-ref --quiet HEAD';
const BRIEFS = 'list --archived --format json';
const BASE = 'rev-parse --verify --quiet main^{commit}';
const HEAD = 'rev-parse --verify --quiet HEAD^{commit}';
const MERGE_BASE = 'merge-base';
const CONFIG = ':.spec-harness.json';
const SIGNERS = ':.github/allowed_signers';
const HOOKS = '--git-path hooks/pre-commit';
const REMOTE = 'refs/remotes/origin/HEAD';
const BRANCHES = 'for-each-ref';
const RELEASE = 'claude --version';

const WIRED = JSON.stringify(mergeClaudeSettings({}));
const SCRIPT = '${CLAUDE_PROJECT_DIR}/node_modules/@spec-family/spec-harness/bin/spec-harness.js';
const line = (...rest: string[]): unknown => ({ type: 'command', command: 'node', args: [SCRIPT, 'hook', 'claude', ...rest], timeout: 60 });

/** A repository on the branch of its one brief, so that spec-brief is asked which brief the branch names. */
function onBrief(files: Readonly<Record<string, string>> = {}): Repository {
  const repo = installed({ [BRIEF_FILE]: brief({ affected: ['src/**'], protected: ['src/db/**'] }), ...files });
  repo.git('checkout', '-q', '-b', 'brief/001-rotate');
  return repo;
}

/** A repository with this checkout installed in it, as the hook's line names it and doctor looks for it. */
function installed(files: Readonly<Record<string, string>>): Repository {
  const repo = repository(files);
  installHarness(repo.root);
  return repo;
}

describe('doctor', () => {
  it('asks at once what waits on the work tree alone, and in turn what waits on an answer', async () => {
    const repo = onBrief({ '.claude/settings.json': WIRED });
    const result = await cli(['doctor'], repo.root, { env: { PATH: temp() } });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('\nbrief   001\n');
    // The work tree first: its top and its common directory in one start
    // of git, the branch beside them, and neither asked for again.
    expect(atOnce(TREE, BRANCH)).toBe(true);
    expect(when('asked', TOP)).toBe(when('asked', COMMON));
    expect(Math.max(when('answered', TREE), when('answered', BRANCH))).toBeLessThan(when('asked', BRIEFS));
    // Then the brief, the two commits of the base and git's hooks: none says anything another is asked with.
    expect(atOnce(BRIEFS, BASE, HEAD, HOOKS)).toBe(true);
    // The commit the two share waits on both, the configuration the round
    // is measured by on that, and the signers' file it names on that.
    expect(Math.max(when('answered', BASE), when('answered', HEAD))).toBeLessThan(when('asked', MERGE_BASE));
    expect(when('answered', MERGE_BASE)).toBeLessThan(when('asked', CONFIG));
    expect(when('answered', CONFIG)).toBeLessThan(when('asked', SIGNERS));
  });

  it('asks Claude Code its release while git is still answering, and not at all where nothing wires it to the guard', async () => {
    // This Node under the name claude, which every platform starts without a shell: it prints its own version.
    const directory = temp();
    const name = process.platform === 'win32' ? 'claude.exe' : 'claude';
    try {
      linkSync(process.execPath, join(directory, name));
    } catch {
      copyFileSync(process.execPath, join(directory, name));
    }
    const env = { PATH: directory };
    // HEAD's commit is kept back until Claude Code is asked: asked only
    // after git's last answer, as it was, it would not be asked in time.
    seen.kept = { answer: HEAD, nth: 1, until: RELEASE };
    const result = await cli(['doctor'], installed({ '.claude/settings.json': WIRED }).root, { env });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`cannot be told: claude --version printed "${process.version}", which is not a version`);
    expect(when('asked', RELEASE)).toBeLessThan(when('answered', HEAD));
    seen.log.length = 0;
    seen.kept = null;
    const bare = await cli(['doctor', '--format', 'json'], repository({}).root, { env });
    expect(parsed<{ claudeCode: { state: string } }>(bare).claudeCode.state).toBe('none');
    expect(seen.log.filter((entry) => entry.line.includes(RELEASE))).toEqual([]);
    when('answered', SIGNERS);
  });

  // A directory for git's hook, and a file there the account may not read,
  // ended a run too, and are lines of the report now (ADR-0005): nothing a
  // repository holds at the hook's path ends one. A git that cannot be
  // started to say where the hook is still does, as any error nothing
  // expects does.
  it('ends on the first of them to fail in the order it read them in, whichever failed first', async () => {
    // Two things fail. The root on the hook's line has a configuration that
    // does not load, and git is refused when it is started to say where its
    // hooks are. The line was read before the hook was, so the run ends on
    // the line's fault, said in a line. Here the hook's fault is known first:
    // the root's work tree is not answered until git has been asked for the
    // signers' file, after it was refused.
    const broken = repository({ '.spec-harness.json': '{ not json' }, null);
    const repo = repository({ '.claude/settings.json': JSON.stringify({ hooks: { PreToolUse: [{ hooks: [line('--root', broken.root, '--brief', '001')] }] } }) });
    seen.thrown = { part: HOOKS };
    seen.kept = { answer: TOP, nth: 2, until: SIGNERS };
    const result = await cli(['doctor'], repo.root, { env: { PATH: temp() } });
    expect(result).toMatchObject({ code: 2, stdout: '' });
    expect(result.stderr).toMatch(/^spec-harness: \.spec-harness\.json is not valid JSON: .*\n$/);
    // Alone, the hook's fault ends the run, so the run above had both to choose from.
    await settled();
    repo.write('.claude/settings.json', '{}');
    seen.kept = null;
    const alone = await cli(['doctor'], repo.root, { env: { PATH: temp() } });
    expect(alone).toMatchObject({ code: 2, stdout: '' });
    expect(alone.stderr).toMatch(/^spec-harness: unexpected error: Error: cannot start git rev-parse --path-format=absolute --git-path hooks\/pre-commit\n/);
    await settled();
  });

  it('ends on a fault of the root on the hook\'s line however late it is known, and on nothing the report has a line for', async () => {
    // What stands for git's pre-commit hook is a directory, which is said in
    // the report and ends no run. The root on the hook's line has a
    // configuration that does not load, and its work tree is not answered
    // until git has been asked for the signers' file, by when the hook has
    // long been read: the run ends on the line's fault all the same.
    const broken = repository({ '.spec-harness.json': '{ not json' }, null);
    const repo = repository({ '.claude/settings.json': JSON.stringify({ hooks: { PreToolUse: [{ hooks: [line('--root', broken.root, '--brief', '001')] }] } }), '.githooks/pre-commit/keep': '' });
    repo.git('config', 'core.hooksPath', '.githooks');
    seen.kept = { answer: TOP, nth: 2, until: SIGNERS };
    const result = await cli(['doctor'], repo.root, { env: { PATH: temp() } });
    expect(result).toMatchObject({ code: 2, stdout: '' });
    expect(result.stderr).toMatch(/^spec-harness: \.spec-harness\.json is not valid JSON: .*\n$/);
    await settled();
  });
});

describe('audit', () => {
  it("asks git for no remote's default branch where --base names the base, and for it where nothing does", async () => {
    const repo = onBrief();
    const named = await cli(['audit', '--base', 'main', '--format', 'json'], repo.root, { env: {} });
    expect(parsed<{ brief: string }>(named).brief).toBe('001');
    await settled();
    expect(seen.log.filter((entry) => entry.line.includes(REMOTE))).toEqual([]);
    seen.log.length = 0;
    await cli(['audit', '--format', 'json'], repo.root, { env: {} });
    await settled();
    // Without --base the remote's default branch is asked for, once.
    when('answered', REMOTE);
  });
});

describe('hook codex and hook copilot', () => {
  it('ask git nothing for a question whose tool writes no file', async () => {
    const repo = onBrief();
    const codex = await cli(['hook', 'codex'], repo.root, { stdin: JSON.stringify({ hook_event_name: 'PreToolUse', cwd: repo.root, tool_name: 'Bash', tool_input: { command: 'ls' } }), env: {} });
    const copilot = await cli(['hook', 'copilot'], repo.root, { stdin: JSON.stringify({ cwd: repo.root, toolName: 'bash', toolArgs: { command: 'ls' } }), env: {} });
    expect([codex, copilot]).toEqual([
      { code: 0, stdout: '', stderr: '' },
      { code: 0, stdout: '', stderr: '' },
    ]);
    expect(seen.log).toEqual([]);
  });

  it('hold a write in words where git cannot be started to read the work tree, an error that is no configuration\'s', async () => {
    const repo = onBrief();
    seen.thrown = { part: TOP };
    const codex = await cli(['hook', 'codex'], repo.root, { stdin: JSON.stringify({ hook_event_name: 'PreToolUse', cwd: repo.root, tool_name: 'apply_patch', tool_input: { command: '*** Begin Patch\n*** Add File: src/new.ts\n+x\n*** End Patch\n' } }), env: {} });
    expect(codex.code).toBe(0);
    expect(JSON.parse(codex.stdout).hookSpecificOutput).toMatchObject({ permissionDecision: 'deny', permissionDecisionReason: expect.stringMatching(/^spec-harness: cannot check this write: cannot start git rev-parse --show-toplevel.*\. Next: run spec-harness doctor, and fix what it says\.$/) });
    const copilot = await cli(['hook', 'copilot'], repo.root, { stdin: JSON.stringify({ cwd: repo.root, toolName: 'create', toolArgs: { path: 'src/new.ts' } }), env: {} });
    expect(JSON.parse(copilot.stdout)).toMatchObject({ permissionDecision: 'deny', permissionDecisionReason: expect.stringMatching(/^spec-harness: cannot check this write: cannot start git rev-parse --show-toplevel/) });
    // The branch, asked beside the work tree, is answered after the run ends.
    await settled();
  });
});

describe('init', () => {
  it("asks git at once for the remote's default branch, the local branches and where its hooks are", async () => {
    const repo = repository({ 'README.md': '# x\n' }, null);
    const result = await cli(['init', '--format', 'json'], repo.root, { env: {} });
    expect(result.code).toBe(0);
    expect(parsed<{ steps: { file: string; action: string }[] }>(result).steps.find((step) => step.file === '.spec-harness.json')?.action).toBe('create');
    expect(Math.max(when('answered', COMMON), when('answered', BRANCH))).toBeLessThan(when('asked', REMOTE));
    expect(atOnce(REMOTE, BRANCHES, HOOKS)).toBe(true);
  });

  it('asks git for no base where the configuration names one', async () => {
    const result = await cli(['init', '--format', 'json'], repository({}).root, { env: {} });
    expect(result.code).toBe(0);
    expect(seen.log.filter((entry) => entry.line.includes(REMOTE) || entry.line.includes(BRANCHES))).toEqual([]);
    when('answered', HOOKS);
  });
});

/** Every line that was asked, in the order it was, with the directory it was asked from where `from` is given. */
const asked = (): string[] => seen.log.filter((entry) => entry.what === 'asked').map((entry) => entry.line);

/** The words git is handed for each of its questions about a work tree, shortened to which question it is. */
function questions(): string[] {
  return asked().flatMap((line) => (line.includes(TREE) ? ['tree'] : line.includes(TOP) ? ['top'] : line.includes(COMMON) ? ['common'] : line.includes(BRANCH) ? ['branch'] : []));
}

const io = (cwd: string): Parameters<typeof openWorkspace>[1] => ({ stdout: { write: () => true }, stderr: { write: () => true }, cwd, env: {} });

describe('a work tree', () => {
  it('is opened at its top in two starts of git, asked at once: the top with the common directory, and the branch', async () => {
    const repo = onBrief();
    const workspace = await openWorkspace({ root: undefined }, io(repo.root));
    expect(workspace).toMatchObject({ root: repo.root.split('\\').join('/'), branch: 'brief/001-rotate', commonDir: `${repo.root.split('\\').join('/')}/.git` });
    expect(questions().sort()).toEqual(['branch', 'tree']);
    expect(atOnce(TREE, BRANCH)).toBe(true);
  });

  it('is asked for its branch and its common directory from its top, where it is opened from a directory below', async () => {
    const repo = onBrief({ 'src/db/schema.ts': 'table;\n' });
    const below = join(repo.root, 'src', 'db');
    const workspace = await openWorkspace({ root: below }, io(repo.root));
    expect(workspace).toMatchObject({ root: repo.root.split('\\').join('/'), branch: 'brief/001-rotate', commonDir: `${repo.root.split('\\').join('/')}/.git` });
    // The top first, as it was: the branch is asked for once, and of the top.
    expect(questions()).toEqual(['tree', 'common', 'branch']);
    expect(seen.log.filter((entry) => entry.what === 'asked').map((entry) => entry.cwd)).toEqual([below, workspace.root, workspace.root]);
    expect(when('answered', TREE)).toBeLessThan(Math.min(when('asked', `rev-parse --path-format=absolute ${COMMON}`), when('asked', BRANCH)));
    expect(atOnce(`rev-parse --path-format=absolute ${COMMON}`, BRANCH)).toBe(true);
  });

  it('is asked nothing more than whether it is one, in a directory that is in none', async () => {
    const outside = temp();
    await expect(openWorkspace({ root: undefined }, io(outside))).rejects.toThrow(`${outside} is not inside a git work tree; spec-harness measures rounds by their commits`);
    expect(questions()).toEqual(['tree']);
  });

  it('is opened at its top through a link to it, which spells the directory otherwise', async () => {
    const repo = onBrief();
    const link = join(temp(), 'link');
    // A junction on Windows, which needs no privilege; a symbolic link elsewhere.
    symlinkSync(repo.root, link, 'junction');
    const workspace = await openWorkspace({ root: link }, io(repo.root));
    expect(workspace).toMatchObject({ root: repo.root.split('\\').join('/'), branch: 'brief/001-rotate' });
    expect(questions().sort()).toEqual(['branch', 'tree']);
  });

  it('is asked for its branch after its top, where its top holds no .git: one the environment names the repository of', async () => {
    // GIT_DIR and GIT_WORK_TREE, as a script that keeps a repository apart
    // from its files sets them. The directory is the top, so what git
    // said of the common directory from it is the top's; the branch was
    // not asked for beside it, so it is asked for now.
    const repo = onBrief();
    const files = temp();
    const workspace = await withEnvironment({ GIT_DIR: join(repo.root, '.git'), GIT_WORK_TREE: files }, () => openWorkspace({ root: undefined }, io(files)));
    expect(workspace).toMatchObject({ root: files.split('\\').join('/'), branch: 'brief/001-rotate', commonDir: `${repo.root.split('\\').join('/')}/.git` });
    expect(questions()).toEqual(['tree', 'branch']);
    expect(when('answered', TREE)).toBeLessThan(when('asked', BRANCH));
  });

  it('is read from its top and not from where it was opened, where the two are not one directory', async () => {
    // git reads a repository from the directory it is started in. Here the
    // work tree is another directory than the repository's, and no
    // repository is found from it: asked from there, git names no branch
    // and no common directory, which is what every release has read.
    const repo = onBrief();
    const elsewhere = temp();
    repo.git('config', 'core.worktree', elsewhere);
    const workspace = await openWorkspace({ root: undefined }, io(repo.root));
    expect(workspace).toMatchObject({ root: elsewhere.split('\\').join('/'), branch: null, commonDir: `${elsewhere.split('\\').join('/')}/.git` });
    // The branch was asked for beside the top, from the repository, and that answer is not the top's.
    expect(questions()).toEqual(['tree', 'branch', 'common', 'branch']);
    expect(seen.log.filter((entry) => entry.what === 'asked').map((entry) => entry.cwd)).toEqual([repo.root, repo.root, workspace.root, workspace.root]);
  });

  it.each([
    ['three lines, the option handed back as one of them, as the manual has a rev-parse do that does not know it', (real: string): string => `${real.split('\n')[0]!}\n--path-format=absolute\n.git\n`],
    ['a top whose name holds a line break', (real: string): string => real.split('\n').slice(0, 2).map((path) => `${path.slice(0, 3)}\n${path.slice(3)}`).join('\n').concat('\n')],
    ['a top whose name ends in a space', (real: string): string => real.split('\n').slice(0, 2).map((path) => `${path} `).join('\n').concat('\n')],
    ['a top alone that trimming would change', (real: string): string => ` ${real}`],
    ['a common directory alone that trimming would change', (real: string): string => `${real.trimEnd()}\r\n`],
    ['a third line that is not the end of the second', (real: string): string => `${real}more`],
    ['an empty line after the two, and a line after it', (real: string): string => `${real}\nmore\n`],
    ['an answer with one line', (real: string): string => `${real.split('\n')[0]!}\n`],
    ['an answer with a line more', (real: string): string => `${real}more\n`],
    ['an answer whose second line is empty', (real: string): string => `${real.split('\n')[0]!}\n\n`],
    ['an answer whose first line is empty', (real: string): string => `\n${real.split('\n')[1]!}\n`],
    ['an answer that does not end its last line', (real: string): string => real.trimEnd()],
  ])('is asked for its top, its common directory and its branch one question each, as it was, where the one answer is not two paths: %s', async (_, stdout) => {
    const repo = onBrief();
    seen.said = { part: TREE, stdout };
    const workspace = await openWorkspace({ root: undefined }, io(repo.root));
    expect(workspace).toMatchObject({ root: repo.root.split('\\').join('/'), branch: 'brief/001-rotate', commonDir: `${repo.root.split('\\').join('/')}/.git` });
    expect(questions()).toEqual(['tree', 'branch', 'top', 'common', 'branch']);
  });

  it('is asked for again, one question each, where git answers nothing and does not fail', async () => {
    const repo = onBrief();
    seen.said = { part: TREE, stdout: () => '' };
    const workspace = await openWorkspace({ root: undefined }, io(repo.root));
    expect(workspace.root).toBe(repo.root.split('\\').join('/'));
    expect(questions()).toEqual(['tree', 'branch', 'top', 'common', 'branch']);
  });

  it('is asked for its top again, alone, where git answers two lines and fails', async () => {
    // In a directory that is in no work tree git answers nothing and fails.
    // Heard as two paths and a failure, the answer is not read for the
    // paths: the question asked again alone is answered as it was.
    const outside = temp();
    seen.said = { part: TREE, stdout: () => `${outside.split('\\').join('/')}\n${outside.split('\\').join('/')}/.git\n` };
    await expect(openWorkspace({ root: undefined }, io(outside))).rejects.toThrow('is not inside a git work tree');
    expect(questions()).toEqual(['tree', 'top']);
  });
});

describe('the hook', () => {
  const question = (root: string): string => JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: join(root, 'src', 'db', 'schema.ts') }, cwd: root });
  const ruled = (row: string): string => brief({ affected: ['src/**'], protected: ['src/db/**'], body: ['## Rulings', '', '| id | paths | decision | note |', '| --- | --- | --- | --- |', row, ''].join('\n') });

  it('opens its work tree as every command does, and asks nothing of the base where no ruling of the brief allows anything', async () => {
    const repo = onBrief();
    const result = await cli(['hook', 'claude'], repo.root, { env: { CLAUDE_PROJECT_DIR: repo.root }, stdin: question(repo.root) });
    expect(result.code).toBe(0);
    expect(parsed<{ hookSpecificOutput: { permissionDecision: string } }>(result).hookSpecificOutput.permissionDecision).toBe('deny');
    expect(atOnce(TREE, BRANCH)).toBe(true);
    // spec-brief is asked which brief the branch names, so only once the branch is known.
    expect(when('answered', BRANCH)).toBeLessThan(when('asked', BRIEFS));
    // The write is to a protected file, and is refused for want of a ruling:
    // two of git's processes and spec-brief, and no more.
    expect(asked()).toHaveLength(3);
  });

  it('asks nothing of the base where the rulings of the brief only deny', async () => {
    const repo = onBrief({ [BRIEF_FILE]: ruled('| R-001-1 | `src/db/**` | deny | the store stays as it is |') });
    const result = await cli(['hook', 'claude'], repo.root, { env: { CLAUDE_PROJECT_DIR: repo.root }, stdin: question(repo.root) });
    expect(parsed<{ hookSpecificOutput: { permissionDecision: string } }>(result).hookSpecificOutput.permissionDecision).toBe('deny');
    expect(asked()).toHaveLength(3);
  });

  it('asks for the base a ruling is checked on where one allows something, both commits at once', async () => {
    const repo = onBrief({ [BRIEF_FILE]: ruled('| R-001-1 | `src/db/schema.ts` | allow | the schema moves with the token |') });
    const result = await cli(['hook', 'claude'], repo.root, { env: { CLAUDE_PROJECT_DIR: repo.root }, stdin: question(repo.root) });
    // The row is committed unsigned, and the base has no signers: the ruling does not count.
    expect(parsed<{ hookSpecificOutput: { permissionDecision: string } }>(result).hookSpecificOutput.permissionDecision).toBe('deny');
    expect(when('answered', BRIEFS)).toBeLessThan(Math.min(when('asked', BASE), when('asked', HEAD)));
    expect(atOnce(BASE, HEAD)).toBe(true);
    expect(Math.max(when('answered', BASE), when('answered', HEAD))).toBeLessThan(when('asked', MERGE_BASE));
    expect(when('answered', MERGE_BASE)).toBeLessThan(when('asked', CONFIG));
    expect(when('answered', CONFIG)).toBeLessThan(when('asked', SIGNERS));
  });

  it('starts three processes for a write no brief protects, and one in a directory that is in no work tree', async () => {
    const repo = onBrief();
    const inside = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: join(repo.root, 'src', 'app.ts') }, cwd: repo.root });
    expect(await cli(['hook', 'claude'], repo.root, { env: { CLAUDE_PROJECT_DIR: repo.root }, stdin: inside })).toEqual({ code: 0, stdout: '', stderr: '' });
    expect(asked()).toHaveLength(3);
    seen.log.length = 0;
    const outside = temp();
    expect(await cli(['hook', 'claude'], outside, { env: { CLAUDE_PROJECT_DIR: outside }, stdin: question(outside) })).toEqual({ code: 0, stdout: '', stderr: '' });
    expect(questions()).toEqual(['tree']);
  });
});

describe('a matcher that is a pattern', () => {
  it('is read once in a run of doctor and once in a run of init, however many entries stand under it', async () => {
    // Two patterns, each read in half a millisecond: what is counted is the
    // readings, not what they take. One matches no tool that writes, so
    // every entry under it is asked of where an entry that is started is
    // looked for; the other stands over a line a person wrote.
    const idle = '^Bash$';
    const some = 'Edit.*';
    const entry = (matcher: string, ...rest: string[]): unknown => ({ matcher, hooks: [line(...rest)] });
    const held = {
      hooks: {
        PreToolUse: [entry(idle), entry(idle), entry(some, '--base', 'main'), entry(idle), entry(some, '--base', 'main')],
        PostToolUse: [entry(idle), entry(some, '--base', 'main'), entry(idle)],
      },
    };
    const repo = installed({ '.claude/settings.json': JSON.stringify(held) });
    const env = { PATH: temp() };
    const doctor = await cli(['doctor', '--format', 'json'], repo.root, { env });
    expect(parsed<{ claudeCode: { lines: { state: string; before: string[] }[] } }>(doctor).claudeCode.lines.map((said) => [said.state, said.before])).toEqual([
      ['unstarted', []],
      ['guards', ['Edit', 'NotebookEdit']],
    ]);
    expect(seen.readings).toEqual([idle, some]);
    seen.readings.length = 0;
    // init reads the file for what doctor says of it, and again for what to write into it.
    const init = await cli(['init', '--format', 'json'], repo.root, { env });
    expect(parsed<{ steps: { file: string; action: string }[] }>(init).steps.find((step) => step.file === '.claude/settings.json')?.action).toBe('keep');
    expect(seen.readings).toEqual([idle, some]);
  });
});
