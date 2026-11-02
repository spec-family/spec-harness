/**
 * git's pre-commit hook as git runs it: the hook init writes, started by a
 * real `git commit` - through the sh Git for Windows ships, on Windows - at
 * the top of the work tree being committed, from the main work tree, a
 * subdirectory of it, a linked worktree, and a hooks directory two
 * repositories share.
 */

import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PRE_COMMIT } from '../../src/configure.js';
import { brief, BRIEF_FILE, cleanup, cli, install, installFake, installHarness, parsed, repository, ROOT, temp, type Repository } from './helpers.js';

afterAll(cleanup);

beforeAll(() => {
  if (!existsSync(join(ROOT, 'dist', 'cli.js'))) throw new Error('dist/cli.js is missing: run "npm run build" before the suite');
});

const SCRIPT = 'node_modules/@spec-family/spec-harness/bin/spec-harness.js';
const REFUSED = [
  'refused  brief 001 does not empower this round to change src/db/schema.ts (protectedFiles: src/db/**)',
  '         if the round cannot be done without it, stop and ask for a ruling: spec-harness escalate --path <file> --reason <why>, or the request_escalation tool',
  'spec-harness: 1 file(s) this round may not change; the commit was stopped',
  '',
].join('\n');
/** What the hook says where the project's install is not in the work tree: the script, the work tree as sh spells it, and what to do. */
const NOT_INSTALLED = new RegExp(
  `^spec-harness: ${SCRIPT.replaceAll('.', '\\.')} is not in \\S.*, the work tree git commits in, nor in its repository's main work tree: install the project's dependencies there, as with npm ci, and commit again\\n$`,
);

/** The hook's `node` is this Node, found first on PATH, as a person's is. */
function environment(): NodeJS.ProcessEnv {
  return { ...process.env, SPEC_BRIEF: '', PATH: `${dirname(process.execPath)}${delimiter}${process.env['PATH'] ?? ''}` };
}

/** `git commit` of what is staged, as a person runs it, from `cwd`. */
function commit(cwd: string, env: NodeJS.ProcessEnv = {}): { code: number | null; stdout: string; stderr: string } {
  const result = spawnSync('git', ['commit', '-q', '-m', 'work'], { cwd, encoding: 'utf8', env: { ...environment(), ...env } });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

/**
 * A repository with the project's install of the harness and everything init
 * writes, the hook with it, on the round's branch. What init wrote is on the
 * base, so a round's commit holds only what the test stages.
 */
async function guarded(files: Readonly<Record<string, string>> = {}): Promise<Repository> {
  const repo = repository({
    [BRIEF_FILE]: brief({ affected: ['src/auth/**'], protected: ['src/db/**'] }),
    '.gitignore': 'node_modules/\n',
    'src/db/schema.ts': 'table;\n',
    'src/auth/a.ts': 'a;\n',
    ...files,
  });
  installHarness(repo.root);
  const written = await cli(['init', '--git-hook', '--write'], repo.root);
  expect(written.stdout).toContain('create  .git/hooks/pre-commit\n        refuse a commit that changes what the active brief protects\n');
  repo.git('add', '-A');
  repo.git('commit', '-q', '--no-verify', '-m', 'configured');
  repo.git('checkout', '-q', '-b', 'brief/001-rotate');
  return repo;
}

function head(root: string): string {
  return spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
}

describe('the pre-commit hook init writes, run by git', () => {
  it('is a POSIX sh script that runs node and the script in the project\'s install, and never npx', async () => {
    const repo = await guarded();
    const hook = repo.read('.git/hooks/pre-commit');
    expect(hook).toBe(PRE_COMMIT);
    expect(hook.startsWith('#!/bin/sh\n')).toBe(true);
    expect(hook).toContain(`\nbin=${SCRIPT}\n`);
    expect(hook.endsWith('\nexec node "$bin" hook git\n')).toBe(true);
    expect(hook).not.toContain('npx');
    expect(hook).not.toContain('\r');
  });

  it('refuses a commit that changes a protected file, and says nothing of one inside the scope', async () => {
    const repo = await guarded();
    const before = head(repo.root);
    repo.write('src/db/schema.ts', 'changed;\n');
    repo.git('add', 'src/db/schema.ts');
    expect(commit(repo.root)).toEqual({ code: 1, stdout: '', stderr: REFUSED });
    expect(head(repo.root)).toBe(before);
    repo.git('reset', '-q', '--hard');
    repo.write('src/auth/a.ts', 'b;\n');
    repo.git('add', 'src/auth/a.ts');
    // Nothing on stderr: no runner between git and the harness has anything to say.
    expect(commit(repo.root)).toEqual({ code: 0, stdout: '', stderr: '' });
    expect(head(repo.root)).not.toBe(before);
  });

  it('finds the install from the top of the work tree when the commit is made in a subdirectory', async () => {
    const repo = await guarded();
    repo.write('src/db/schema.ts', 'changed;\n');
    repo.git('add', 'src/db/schema.ts');
    expect(commit(join(repo.root, 'src', 'db'))).toEqual({ code: 1, stdout: '', stderr: REFUSED });
  });

  it("runs the install of a linked worktree, where git runs the shared hook, and the main work tree's where it has none", async () => {
    const repo = await guarded();
    const linked = join(temp(), 'linked');
    repo.git('worktree', 'add', '-q', '-b', 'brief/001-linked', linked);
    const change = (path: string, content: string): void => {
      mkdirSync(dirname(join(linked, path)), { recursive: true });
      writeFileSync(join(linked, path), content);
      spawnSync('git', ['add', path], { cwd: linked });
    };
    const before = head(linked);
    // No install in this work tree: the main work tree's checks it, by this work tree's branch and brief.
    change('src/db/schema.ts', 'changed;\n');
    expect(commit(linked)).toEqual({ code: 1, stdout: '', stderr: REFUSED });
    expect(head(linked)).toBe(before);
    spawnSync('git', ['reset', '-q', '--hard'], { cwd: linked });
    change('src/auth/a.ts', 'linked;\n');
    expect(commit(linked)).toEqual({ code: 0, stdout: '', stderr: '' });
    expect(head(linked)).not.toBe(before);
    // An install of its own is the one run, whatever the main work tree has.
    mkdirSync(join(linked, 'node_modules', '@spec-family', 'spec-harness', 'bin'), { recursive: true });
    writeFileSync(join(linked, SCRIPT), "process.stderr.write('the linked install\\n');\nprocess.exit(2);\n");
    change('src/auth/a.ts', 'linked again;\n');
    expect(commit(join(linked, 'src'))).toEqual({ code: 1, stdout: '', stderr: 'the linked install\n' });
  });

  it('stops the commit in a linked worktree where neither it nor the main work tree has the install', async () => {
    const repo = repository({ [BRIEF_FILE]: brief({ affected: ['src/auth/**'], protected: ['src/db/**'] }), 'src/auth/a.ts': 'a;\n' });
    repo.write('.git/hooks/pre-commit', PRE_COMMIT);
    chmodSync(join(repo.root, '.git', 'hooks', 'pre-commit'), 0o755);
    const linked = join(temp(), 'linked');
    repo.git('worktree', 'add', '-q', '-b', 'brief/001-linked', linked);
    writeFileSync(join(linked, 'src', 'auth', 'a.ts'), 'linked;\n');
    spawnSync('git', ['add', '-A'], { cwd: linked });
    const before = head(linked);
    const stopped = commit(linked);
    // git's own code for a commit its hook stopped, whatever the hook exited with.
    expect(stopped.code).toBe(1);
    expect(stopped.stdout).toBe('');
    expect(stopped.stderr).toMatch(NOT_INSTALLED);
    expect(stopped.stderr).toContain('linked, the work tree git commits in');
    expect(head(linked)).toBe(before);
  });
  it("checks a linked worktree with no install by the main work tree's siblings too, where no configuration names them", async () => {
    const repo = repository({ [BRIEF_FILE]: brief({ affected: ['src/auth/**'], protected: ['src/db/**'] }), '.gitignore': 'node_modules/\n', 'src/db/schema.ts': 'table;\n' }, null);
    installHarness(repo.root);
    install(repo.root, 'spec-brief');
    repo.write('.git/hooks/pre-commit', PRE_COMMIT);
    chmodSync(join(repo.root, '.git', 'hooks', 'pre-commit'), 0o755);
    const linked = join(temp(), 'linked');
    repo.git('worktree', 'add', '-q', '-b', 'brief/001-linked', linked);
    writeFileSync(join(linked, 'src', 'db', 'schema.ts'), 'changed;\n');
    spawnSync('git', ['add', '-A'], { cwd: linked });
    expect(commit(linked)).toEqual({ code: 1, stdout: '', stderr: REFUSED });
    // doctor there says whose install it read: the main work tree's, as git names its top.
    type Rows = { root: string; siblings: { tool: string; state: string; elsewhere: string | null; detail: string }[] };
    const main = parsed<Rows>(await cli(['doctor', '--format', 'json'], repo.root));
    expect(main.siblings.find((sibling) => sibling.tool === 'spec-brief')).toMatchObject({ state: 'found', elsewhere: null });
    expect(main.siblings.find((sibling) => sibling.tool === 'spec-brief')?.detail).not.toContain('the install of');
    const there = parsed<Rows>(await cli(['doctor', '--format', 'json'], linked));
    const row = there.siblings.find((sibling) => sibling.tool === 'spec-brief');
    expect(row).toMatchObject({ state: 'found', elsewhere: main.root });
    expect(row?.detail.endsWith(`, the install of ${main.root}: this work tree has none of its own)`)).toBe(true);
    expect(there.siblings.find((sibling) => sibling.tool === 'spec-guard')).toMatchObject({ state: 'absent', elsewhere: null });
    // One too old there is said with whose install it is, and fails doctor, as it does in the main work tree.
    installFake(repo.root, 'spec-guard', JSON.stringify({ version: '0.29.0' }));
    const outdated = await cli(['doctor', '--format', 'json'], linked);
    expect(outdated.code).toBe(1);
    expect(parsed<Rows>(outdated).siblings.find((sibling) => sibling.tool === 'spec-guard')).toEqual({
      tool: 'spec-guard',
      state: 'outdated',
      minimum: '0.30.0',
      version: '0.29.0',
      elsewhere: main.root,
      detail: `spec-guard 0.29.0 is installed here; spec-harness needs 0.30.0 or later: npm install --save-dev @spec-family/spec-guard@latest, the install of ${main.root}: this work tree has none of its own`,
    });
  });

  it('guards each repository that shares a hooks directory by its own install, and stops a commit in one that has none', async () => {
    const hooks = join(temp(), 'shared-hooks');
    const repo = await guarded();
    repo.git('config', 'core.hooksPath', hooks);
    const plan = parsed<{ steps: { file: string; action: string }[] }>(await cli(['init', '--git-hook', '--write', '--format', 'json'], repo.root));
    expect(plan.steps.find((step) => step.file.endsWith('pre-commit'))?.action).toBe('create');
    expect(readFileSync(join(hooks, 'pre-commit'), 'utf8')).toBe(PRE_COMMIT);
    repo.write('src/db/schema.ts', 'changed;\n');
    repo.git('add', 'src/db/schema.ts');
    expect(commit(repo.root)).toEqual({ code: 1, stdout: '', stderr: REFUSED });
    // Another repository on the same hooks, which never installed the harness.
    const other = repository({ 'a.txt': 'a\n' }, null);
    other.git('config', 'core.hooksPath', hooks);
    other.write('a.txt', 'b\n');
    other.git('add', '-A');
    const before = head(other.root);
    const stopped = commit(other.root);
    expect(stopped.code).toBe(1);
    expect(stopped.stderr).toMatch(NOT_INSTALLED);
    expect(head(other.root)).toBe(before);
  });

  it('runs from a hooks directory core.hooksPath names in the work tree', async () => {
    const repo = await guarded();
    repo.git('config', 'core.hooksPath', '.githooks');
    await cli(['init', '--git-hook', '--write'], repo.root);
    expect(repo.read('.githooks/pre-commit')).toBe(PRE_COMMIT);
    repo.write('src/db/schema.ts', 'changed;\n');
    repo.git('add', 'src/db/schema.ts');
    expect(commit(join(repo.root, 'src', 'auth'))).toEqual({ code: 1, stdout: '', stderr: REFUSED });
  });
});

describe("the round's last commit, on its own branch", () => {
  const ARCHIVED = 'briefs/archive/001_rotate-tokens.md';
  const HELD = 'spec-harness: the branch names brief 001, which is archived; a closed round writes nothing.';

  /** The round's work, committed, and spec-brief's own archive of its brief, as step 10 of the tutorial has it: nothing committed, everything staged. */
  async function archived(files: Readonly<Record<string, string>> = {}): Promise<Repository> {
    const repo = await guarded(files);
    repo.write('src/auth/a.ts', 'b;\n');
    repo.git('add', '-A');
    expect(commit(repo.root).code).toBe(0);
    const script = join(ROOT, 'node_modules', '@spec-family', 'spec-brief', 'bin', 'spec-brief.js');
    const run = spawnSync(process.execPath, [script, 'archive', '001', '--base', 'main', '--summary', 'Tokens rotate.'], { cwd: repo.root, encoding: 'utf8', env: environment() });
    expect(run.status, run.stdout).toBe(0);
    repo.git('add', '-A');
    return repo;
  }

  it('takes the commit that archives the brief, and holds every commit after it', async () => {
    const repo = await archived();
    expect(repo.git('diff', '--cached', '--name-status')).toContain(`\t${ARCHIVED}`);
    const before = head(repo.root);
    expect(commit(repo.root)).toEqual({ code: 0, stdout: '', stderr: '' });
    expect(head(repo.root)).not.toBe(before);
    expect(existsSync(join(repo.root, BRIEF_FILE))).toBe(false);

    repo.write('src/auth/a.ts', 'c;\n');
    repo.git('add', '-A');
    expect(commit(repo.root)).toEqual({ code: 1, stdout: '', stderr: `${HELD} The round is archived and ends when this branch merges: write on the branch of a live brief.\n` });
  });

  it('takes the link spec-brief rewrites in a live brief with it', async () => {
    const repo = await archived({ 'briefs/002_other.md': brief({ title: '002 - Other', status: 'draft', body: '[The tokens](001_rotate-tokens.md).' }) });
    expect(repo.read('briefs/002_other.md')).toContain('archive/001_rotate-tokens.md');
    expect(commit(repo.root)).toEqual({ code: 0, stdout: '', stderr: '' });
  });

  it('takes the move where the two files read too little alike for git to call it a rename', async () => {
    const repo = await archived();
    repo.write(ARCHIVED, `${repo.read(ARCHIVED)}\n${'A long summary of what the round found.\n'.repeat(200)}`);
    repo.git('add', '-A');
    expect(repo.git('diff', '--cached', '--name-status').split('\n').map((line) => line.charAt(0)).sort().join('')).toBe('AD');
    expect(commit(repo.root)).toEqual({ code: 0, stdout: '', stderr: '' });
  });

  it('refuses the archive with anything else staged beside it', async () => {
    const repo = await archived();
    repo.write('src/auth/a.ts', 'c;\n');
    repo.git('add', '-A');
    expect(commit(repo.root)).toEqual({ code: 1, stdout: '', stderr: `${HELD} The archive is a closed round's last commit, and takes nothing else with it: unstage the rest.\n` });
  });

  it('refuses the archive where the brief is named by anything but the branch, as a brief named there is no round closing here', async () => {
    const repo = await archived();
    expect(commit(repo.root, { SPEC_BRIEF: '001' })).toEqual({ code: 1, stdout: '', stderr: 'spec-harness: the environment names brief 001, which is archived; a closed round writes nothing\n' });
  });

  it('holds a conflict resolved on the closed branch, a write of its own, and passes a merge that needed none', async () => {
    const repo = await archived();
    expect(commit(repo.root).code).toBe(0);
    repo.git('checkout', '-q', 'main');
    repo.write('src/auth/z.ts', 'z;\n');
    repo.git('add', '-A');
    repo.git('commit', '-q', '--no-verify', '-m', 'main moves');
    repo.git('checkout', '-q', 'brief/001-rotate');
    repo.git('merge', '-q', '--no-edit', 'main');
    repo.git('checkout', '-q', 'main');
    repo.write('src/auth/a.ts', 'main;\n');
    repo.git('add', '-A');
    repo.git('commit', '-q', '--no-verify', '-m', 'main moves again');
    repo.git('checkout', '-q', 'brief/001-rotate');
    const merge = spawnSync('git', ['merge', 'main'], { cwd: repo.root, encoding: 'utf8', env: environment() });
    expect(merge.status).toBe(1);
    repo.write('src/auth/a.ts', 'both;\n');
    repo.git('add', '-A');
    expect(commit(repo.root).stderr).toContain(HELD);
  });
});

describe('a hook that runs the harness through npx, as init wrote it through 0.9.1', () => {
  const OLD = '#!/bin/sh\n# spec-harness: refuse a commit that changes what the active brief protects.\nexec npx --no-install spec-harness hook git\n';
  const NOTE =
    'it runs spec-harness through npx, which starts npm to start node on every commit, and under npm 12 prints two "npm notice run" lines each time: ' +
    `to run it with node from the project's install, as Claude Code's hooks are, replace the npx command there with "node ${SCRIPT} hook git"`;

  function hooked(text: string): Repository {
    const repo = repository({});
    repo.write('.git/hooks/pre-commit', text);
    chmodSync(join(repo.root, '.git', 'hooks', 'pre-commit'), 0o755);
    return repo;
  }

  it('is a hook that runs spec-harness to doctor, with a note that offers the node line and fails nothing', async () => {
    const old = hooked(OLD);
    const now = hooked(PRE_COMMIT);
    const said = await cli(['doctor'], old.root);
    expect(said.stdout).toContain(`\ngit     .git/hooks/pre-commit runs spec-harness\n        ${NOTE}\n\n`);
    const json = parsed<{ gitHook: unknown }>(await cli(['doctor', '--format', 'json'], old.root));
    expect(json.gitHook).toEqual({ state: 'runs', file: '.git/hooks/pre-commit', detail: '.git/hooks/pre-commit runs spec-harness', note: NOTE });
    // A note: the exit code is the one a hook written today gets, --strict or not.
    for (const flags of [[], ['--strict']]) {
      expect((await cli(['doctor', ...flags], old.root)).code).toBe((await cli(['doctor', ...flags], now.root)).code);
    }
    // The hook written today has no note.
    expect((await cli(['doctor'], now.root)).stdout).toContain('\ngit     .git/hooks/pre-commit runs spec-harness\n\n');
    expect(parsed<{ gitHook: { note: unknown } }>(await cli(['doctor', '--format', 'json'], now.root)).gitHook.note).toBeNull();
  });

  it('is kept by init, byte for byte, with the same note, asked for the hook or not', async () => {
    const old = hooked(OLD);
    for (const flags of [['--git-hook', '--write'], ['--write'], []]) {
      const result = await cli(['init', ...flags], old.root);
      expect(result.stdout).toContain(`keep    .git/hooks/pre-commit\n        already runs spec-harness; ${NOTE}\n`);
    }
    expect(old.read('.git/hooks/pre-commit')).toBe(OLD);
  });

  it('is noted in a hook of the repository\'s own that holds the line init advised, and not in one that has no hook line', async () => {
    const own = hooked('#!/bin/sh\nnpm test || exit 1\nnpx --no-install spec-harness hook git\n');
    expect(parsed<{ gitHook: { state: string; note: unknown } }>(await cli(['doctor', '--format', 'json'], own.root)).gitHook).toMatchObject({ state: 'runs', note: NOTE });
    const none = hooked('#!/bin/sh\nnpm test\n');
    expect(parsed<{ gitHook: { state: string; note: unknown } }>(await cli(['doctor', '--format', 'json'], none.root)).gitHook).toMatchObject({ state: 'other', note: null });
    const absent = repository({});
    expect(parsed<{ gitHook: { state: string; note: unknown } }>(await cli(['doctor', '--format', 'json'], absent.root)).gitHook).toMatchObject({ state: 'absent', note: null });
  });
});
