/**
 * A write outside every work tree of the repository, where something holds
 * every write inside them (ADR-0005, amended 2026-10-19).
 *
 * A brief the branch names that is archived, or that spec-brief does not
 * list, and a configuration that does not load, each held every write, a
 * file outside the repository among them, where no brief decides one. Such
 * a file is decided as it is with no brief named: it passes with no word,
 * before the write and after it. The problem still holds every path inside
 * a work tree of the repository that has it, a linked worktree's on a branch
 * that names the same brief among them: a path in a linked worktree is
 * decided by that worktree's own branch.
 */

import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { outsideEvery } from '../../src/fs.js';
import { brief, BRIEF_FILE, cleanup, cli, git, repository, siblings, temp, write, type Repository } from './helpers.js';

afterAll(cleanup);

const FILES = { [BRIEF_FILE]: brief({ affected: ['src/app/**'], protected: ['src/db/**'] }), 'src/db/schema.ts': 'table;\n', 'README.md': 'r\n' };

/** A project on a branch that names a brief, where `make` sets up what holds every write; `said` is how a held write starts. */
interface Problem {
  readonly name: string;
  readonly make: (repo: Repository) => void;
  readonly said: string;
  /** A branch for a linked worktree that names the same brief, so that the worktree has the problem too. */
  readonly linked: string;
}

const PROBLEMS: readonly Problem[] = [
  {
    name: 'a brief the branch names that spec-brief has archived',
    make: (repo) => {
      repo.git('checkout', '-q', '-b', 'brief/001-done');
      rmSync(join(repo.root, BRIEF_FILE));
      repo.write('briefs/archive/001_rotate-tokens.md', brief({ status: 'archived', affected: ['src/app/**'], protected: ['src/db/**'] }));
      repo.commit('archive');
    },
    said: 'spec-harness: the branch names brief 001, which is archived; a closed round writes nothing.',
    linked: 'brief/001-w',
  },
  { name: 'a brief the branch names that spec-brief does not list', make: (repo) => repo.git('checkout', '-q', '-b', 'brief/999-nowhere'), said: 'spec-harness: the branch names brief 999, and spec-brief knows no such brief.', linked: 'brief/999-w' },
  {
    name: 'a configuration that does not load',
    make: (repo) => {
      repo.git('checkout', '-q', '-b', 'brief/001-rotate');
      repo.write('.spec-harness.json', '{ "outofscope": "warn" }\n');
    },
    said: 'spec-harness: .spec-harness.json: unknown key "outofscope"',
    linked: 'brief/001-w',
  },
];

const question = (repo: Repository, event: string, paths: Readonly<Record<string, string>>): string =>
  JSON.stringify({ session_id: 's', tool_use_id: 'toolu_1', cwd: repo.root, hook_event_name: event, tool_name: 'Edit', tool_input: { old_string: 'a', new_string: 'b', ...paths } });

const ask = (repo: Repository, event: string, paths: Readonly<Record<string, string>>) => cli(['hook', 'claude'], repo.root, { stdin: question(repo, event, paths), env: { CLAUDE_PROJECT_DIR: repo.root } });

const PASSED = { code: 0, stdout: '', stderr: '' };

async function held(answer: Promise<{ code: number; stdout: string; stderr: string }>, said: string, where: string): Promise<void> {
  const result = await answer;
  expect({ code: result.code, stdout: result.stdout }, where).toEqual({ code: 2, stdout: '' });
  expect(result.stderr.startsWith(said), `${where}: ${result.stderr}`).toBe(true);
}

describe('a write outside every work tree of the repository', () => {
  for (const problem of PROBLEMS) {
    it(`passes with no word where ${problem.name}, before the write and after it, and the problem holds every write inside`, async () => {
      const repo = repository(FILES);
      problem.make(repo);
      const outside = temp();
      writeFileSync(join(outside, 'notes.md'), 'n\n');
      // A file there, as Claude Code keeps a session's under its own directory, and one the write makes.
      for (const file of [join(outside, 'notes.md'), join(outside, 'new.md')]) {
        for (const event of ['PreToolUse', 'PostToolUse']) expect(await ask(repo, event, { file_path: file }), `${event} ${file}`).toEqual(PASSED);
      }
      // Inside the work tree, the problem holds the write as before, the protected file and any other.
      for (const path of ['src/db/schema.ts', 'README.md', 'nowhere/new.md']) await held(ask(repo, 'PreToolUse', { file_path: join(repo.root, ...path.split('/')) }), problem.said, path);
      // One call that names a file outside and one inside is a write inside.
      await held(ask(repo, 'PreToolUse', { file_path: join(outside, 'notes.md'), path: join(repo.root, 'README.md') }), problem.said, 'both');
      // A linked worktree of the repository is a work tree of it, beside the project or inside it.
      const beside = join(temp(), 'w');
      repo.git('worktree', 'add', '-q', '-b', problem.linked, beside);
      await held(ask(repo, 'PreToolUse', { file_path: join(beside, 'README.md') }), problem.said, 'a linked worktree beside it');
      await held(ask(repo, 'PreToolUse', { file_path: join(beside, 'new.md') }), problem.said, 'a new file in it');
      await held(ask(repo, 'PreToolUse', { file_path: join(outside, 'notes.md'), path: join(beside, 'README.md') }), problem.said, 'outside, and in the linked worktree');
    });
  }

  it('passes a file outside whichever work tree the rest of the call is decided by', async () => {
    const [archived, unknown, broken] = PROBLEMS as [Problem, Problem, Problem];
    for (const problem of [archived, unknown]) {
      const repo = repository(FILES);
      problem.make(repo);
      const outside = join(temp(), 'notes.md');
      // A linked worktree on no branch names no brief, and decides its own files: with a file outside, the call passes.
      const free = join(temp(), 'free');
      repo.git('worktree', 'add', '-q', '--detach', free);
      for (const event of ['PreToolUse', 'PostToolUse']) {
        expect(await ask(repo, event, { file_path: join(free, 'README.md') }), `${problem.name}: ${event} the free worktree's file`).toEqual(PASSED);
        expect(await ask(repo, event, { file_path: outside, path: join(free, 'README.md') }), `${problem.name}: ${event} outside and the free worktree's file`).toEqual(PASSED);
      }
      // With a file of the project's beside them, the project's problem holds the call.
      await held(ask(repo, 'PreToolUse', { file_path: outside, path: join(free, 'README.md'), notebook_path: join(repo.root, 'README.md') }), problem.said, `${problem.name}: and the project's file`);
    }
    // A configuration of the project's that does not load is read before any path is: a call with a file another work tree decides is held.
    const repo = repository(FILES);
    broken.make(repo);
    const free = join(temp(), 'free');
    repo.git('worktree', 'add', '-q', '--detach', free);
    expect(await ask(repo, 'PreToolUse', { file_path: join(temp(), 'notes.md') })).toEqual(PASSED);
    await held(ask(repo, 'PreToolUse', { file_path: join(temp(), 'notes.md'), path: join(free, 'README.md') }), broken.said, 'outside and the free worktree, the configuration not loading');
  });

  it('is told by the files git keeps for the work trees, and held where they cannot all be named', async () => {
    const [, unknown, broken] = PROBLEMS as [Problem, Problem, Problem];
    const outside = join(temp(), 'notes.md');
    // A worktree linked by a relative path, as worktree.useRelativePaths has git write it.
    const relative = repository(FILES);
    unknown.make(relative);
    const linked = join(temp(), 'r');
    relative.git('-c', 'worktree.useRelativePaths=true', 'worktree', 'add', '-q', '-b', unknown.linked, linked);
    await held(ask(relative, 'PreToolUse', { file_path: join(linked, 'README.md') }), unknown.said, 'a worktree linked by a relative path');
    expect(await ask(relative, 'PreToolUse', { file_path: outside })).toEqual(PASSED);
    // An entry git keeps for a worktree that cannot be read: no work tree is known to leave the path outside.
    rmSync(join(relative.root, '.git', 'worktrees', 'r', 'gitdir'));
    await held(ask(relative, 'PreToolUse', { file_path: outside }), unknown.said, 'a worktree whose gitdir is gone');
    // Nor where what git keeps them under is no directory.
    rmSync(join(relative.root, '.git', 'worktrees'), { recursive: true, force: true });
    writeFileSync(join(relative.root, '.git', 'worktrees'), 'not a directory');
    await held(ask(relative, 'PreToolUse', { file_path: outside }), unknown.said, 'worktrees a file');
    // A git directory kept apart names no main work tree.
    const apart = temp();
    git(apart, 'init', '-q', '-b', 'main', `--separate-git-dir=${join(temp(), 'kept.git')}`);
    write(apart, '.spec-harness.json', JSON.stringify({ base: 'main', tools: siblings() }));
    write(apart, BRIEF_FILE, FILES[BRIEF_FILE]);
    git(apart, 'add', '-A');
    git(apart, 'commit', '-q', '-m', 'base');
    git(apart, 'checkout', '-q', '-b', 'brief/999-nowhere');
    const kept = { root: apart } as Repository;
    await held(ask(kept, 'PreToolUse', { file_path: outside }), unknown.said, 'a git directory kept apart');
    // A configuration git reads a work tree's place from, where it does not load.
    const moved = repository(FILES);
    broken.make(moved);
    expect(await ask(moved, 'PreToolUse', { file_path: outside })).toEqual(PASSED);
    moved.git('config', 'core.worktree', moved.root);
    await held(ask(moved, 'PreToolUse', { file_path: outside }), broken.said, 'core.worktree');
  });

  it('holds a path with a `..` in it, which the hook reads before its links where Linux and macOS write it after', async () => {
    const [, unknown] = PROBLEMS as [Problem, Problem];
    const repo = repository(FILES);
    unknown.make(repo);
    const outside = temp();
    mkdirSync(join(outside, 'sub'));
    // Held in its own words, with how to write it, where it was held in the brief's (ADR-0005, amended 2026-11-08).
    const dotted = [outside, 'sub', '..', 'notes.md'].join(sep);
    const own = (path: string) =>
      `spec-harness: ${path} has a .. in it and reads as a file outside every work tree of the repository, but a link before the .. can lead back into one, so it is held as a write in the repository is while the branch names brief 999, and spec-brief knows no such brief. Write the path without its .., as it resolves.\n`;
    expect(await ask(repo, 'PreToolUse', { file_path: dotted })).toEqual({ code: 2, stdout: '', stderr: own(dotted) });
    // One path of the call with a `..` in it is enough, and it alone is named.
    const other = [outside, 'sub', '..', 'other.md'].join(sep);
    expect(await ask(repo, 'PreToolUse', { file_path: join(outside, 'notes.md'), path: other })).toEqual({ code: 2, stdout: '', stderr: own(other) });
    // Two such paths are both named, as a list.
    expect(await ask(repo, 'PreToolUse', { file_path: dotted, path: other })).toEqual({ code: 2, stdout: '', stderr: own(`${dotted}, ${other}`) });
    // Beside a path in the work tree it is the brief's problem that holds the write, as before.
    await held(ask(repo, 'PreToolUse', { file_path: join(repo.root, 'README.md'), path: other }), unknown.said, 'beside one inside');
    // And a path with a `..` that reads as one in the work tree is one in it, held for the brief.
    await held(ask(repo, 'PreToolUse', { file_path: [repo.root, 'src', '..', 'README.md'].join(sep) }), unknown.said, 'a `..` inside');
    expect(await ask(repo, 'PreToolUse', { file_path: join(outside, 'notes.md') })).toEqual(PASSED);
    // Where nothing holds the writes in the work tree, such a path is one outside the repository, and goes ahead.
    repo.git('checkout', '-q', 'main');
    expect(await ask(repo, 'PreToolUse', { file_path: dotted })).toEqual(PASSED);
  });

  // Windows lets an account make a link to a directory as a junction, which Windows itself reads after a `..`.
  it.skipIf(process.platform === 'win32')('holds a path outside whose `..` after a link leads into the work tree', async () => {
    const [, unknown] = PROBLEMS as [Problem, Problem];
    const repo = repository(FILES);
    unknown.make(repo);
    const outside = temp();
    symlinkSync(join(repo.root, 'src'), join(outside, 'link'));
    // As written it is outside; on the disk it is README.md of the work tree.
    await held(ask(repo, 'PreToolUse', { file_path: `${outside}/link/../README.md` }), unknown.said, 'a link and `..`');
  });

  it('is no write that names no path', () => {
    const repo = repository(FILES);
    const [top, common] = [repo.git('rev-parse', '--show-toplevel'), repo.git('rev-parse', '--path-format=absolute', '--git-common-dir')];
    expect(outsideEvery([join(temp(), 'notes.md')], top, common, repo.root)).toBe(true);
    expect(outsideEvery([], top, common, repo.root)).toBe(false);
  });

  it('asks spec-brief nothing for it, and guard says it as outside the repository', async () => {
    // A spec-brief that cannot list the briefs holds every write inside, as one it cannot check.
    const failing = join(temp(), 'sibling.js');
    writeFileSync(failing, "process.stderr.write('no briefs directory'); process.exit(2);");
    const repo = repository(FILES, { tools: { 'spec-brief': ['node', failing] } });
    repo.git('checkout', '-q', '-b', 'brief/001-rotate');
    const outside = join(temp(), 'notes.md');
    expect(await ask(repo, 'PreToolUse', { file_path: outside })).toEqual(PASSED);
    await held(ask(repo, 'PreToolUse', { file_path: join(repo.root, 'README.md') }), 'spec-harness: cannot check this write: spec-brief could not list the briefs', 'inside');
    // guard answers the same: the path outside is fine, and a line that names one inside as well stops on the problem.
    const [, unknown] = PROBLEMS as [Problem, Problem];
    const named = repository(FILES);
    unknown.make(named);
    const guarded = await cli(['guard', outside], named.root);
    expect({ code: guarded.code, stderr: guarded.stderr }).toEqual({ code: 0, stderr: '' });
    expect(guarded.stdout).toBe(`ok       ${outside} is outside the repository; no brief governs it\n`);
    expect(await cli(['guard', outside, 'README.md'], named.root)).toEqual({ code: 2, stdout: '', stderr: 'spec-harness: the branch names brief 999, and spec-brief knows no such brief\n' });
  });
});
