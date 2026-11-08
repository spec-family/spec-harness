/**
 * A closed round's branch: one that names a brief spec-brief has archived
 * (ADR-0004, amended 2026-10-24). The hook holds every write on it, as
 * before, in words of its own; `doctor` fails for it as before, but where
 * git says the branch archived the brief and waits to merge, the last pull
 * request of every round: the archived file is in HEAD and not at the merge
 * base of the base and HEAD. Wherever git does not say, `doctor` cannot
 * tell, and fails.
 *
 * spec-brief is one of the test's own making, which lists brief 020 as it
 * is told to whatever the tree holds, so what is measured is what git says
 * of the history, and no installed release's reading of a brief.
 */

import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { brief, cleanup, cli, git, parsed, repository, temp, write, type Repository } from './helpers.js';

afterAll(cleanup);

const LIVE = 'briefs/020_compute.md';
const ARCHIVED = 'briefs/archive/020_compute.md';
const PROBLEM = 'the branch names brief 020, which is archived; a closed round writes nothing';

/** A spec-brief that lists brief 020 in `phase`, at `file`, wherever it is asked. */
function specBrief(phase: 'archived' | 'live' = 'archived', file = phase === 'archived' ? ARCHIVED : LIVE): string[] {
  const directory = temp();
  const row = { id: '020', file, phase, status: phase === 'archived' ? 'archived' : 'active', title: 'Compute', affectedFiles: ['src/app/**'], protectedFiles: ['src/db/**'] };
  const document = JSON.stringify({ tool: 'spec-brief', command: 'list', schemaVersion: 2, briefs: [row] });
  write(directory, 'spec-brief.js', `process.stdout.write(${JSON.stringify(document)});\n`);
  return ['node', join(directory, 'spec-brief.js')];
}

/**
 * Round 020, approved on main and archived on its branch, `brief/020-compute`,
 * which has not merged: the way spec-brief's archive moves a brief, committed
 * with the round. `main` has `before` commits more after the approval.
 */
function closedRound(options: { readonly config?: Record<string, unknown>; readonly before?: number; readonly commit?: boolean } = {}): Repository {
  const repo = repository(
    { [LIVE]: brief({ title: '020 - Compute', affected: ['src/app/**'], protected: ['src/db/**'] }), 'src/app/a.ts': 'a;\n', 'src/db/schema.ts': 'table;\n' },
    { tools: { 'spec-brief': specBrief() }, ...options.config },
  );
  for (let commit = 0; commit < (options.before ?? 0); commit += 1) {
    repo.write('main.txt', `${commit}\n`);
    repo.commit(`Main ${commit}`);
  }
  repo.git('checkout', '-q', '-b', 'brief/020-compute');
  repo.write('src/app/a.ts', 'a changed;\n');
  repo.commit('Round 020 work');
  mkdirSync(join(repo.root, 'briefs', 'archive'));
  repo.git('mv', LIVE, ARCHIVED);
  if (options.commit !== false) repo.commit('Archive brief 020');
  return repo;
}

const briefLines = (stdout: string): string[] => {
  const lines = stdout.split('\n');
  const at = lines.findIndex((line) => line.startsWith('brief   '));
  const end = lines.findIndex((line, index) => index > at && !line.startsWith('        '));
  return lines.slice(at, end);
};

const WAITING = (mergeBase: string): string =>
  `brief 020 was archived on this branch, which waits to merge: ${ARCHIVED} is in HEAD and not at the merge base with main, ${mergeBase.slice(0, 12)}, so this fails nothing; the hook holds every write on the branch all the same`;
const UNTOLD = (reason: string): string => `whether brief 020 was archived on this branch, which waits to merge, cannot be told: ${reason}`;

const edit = (repo: Repository, event = 'PreToolUse'): string =>
  JSON.stringify({ session_id: 's', tool_use_id: 'toolu_1', cwd: repo.root, hook_event_name: event, tool_name: 'Edit', tool_input: { file_path: join(repo.root, 'src', 'app', 'a.ts'), old_string: 'a', new_string: 'b' } });
const starts = (repo: Repository): string => JSON.stringify({ session_id: 's', cwd: repo.root, hook_event_name: 'SessionStart', source: 'startup' });
const hook = (repo: Repository, stdin: string, env: Readonly<Record<string, string>> = {}) => cli(['hook', 'claude'], repo.root, { stdin, env: { CLAUDE_PROJECT_DIR: repo.root, ...env } });

const CLOSED_WRITE = { code: 2, stdout: '', stderr: `spec-harness: ${PROBLEM}. The round is archived and ends when this branch merges: write on the branch of a live brief.\n` };
const startSaid = (line: string) => {
  const text = `spec-harness: ${line}`;
  return { code: 0, stderr: '', stdout: `${JSON.stringify({ systemMessage: text, hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } })}\n` };
};
const CLOSED_START = startSaid(`${PROBLEM}, so every write of this session is held, but one to a file outside every work tree of the repository: the round is archived and ends when this branch merges, so write on the branch of a live brief; spec-harness doctor says more`);

describe('doctor on the branch that archived its brief', () => {
  it('fails nothing for it, and says why, where the hook holds every write all the same', async () => {
    const repo = closedRound();
    const mergeBase = repo.git('merge-base', 'main', 'HEAD');
    const result = await cli(['doctor'], repo.root);
    expect(result).toMatchObject({ code: 0, stderr: '' });
    expect(briefLines(result.stdout)).toEqual([`brief   none: ${PROBLEM}`, `        ${WAITING(mergeBase)}`]);
    const json = await cli(['doctor', '--format', 'json'], repo.root);
    expect(json.code).toBe(0);
    expect(parsed(json)).toMatchObject({ brief: '020', briefProblem: PROBLEM, closedRound: { state: 'waiting-to-merge', file: ARCHIVED, mergeBase, detail: WAITING(mergeBase) } });
    // The hook holds the write before an Edit, and says so as a session starts, in the words of a round that is done.
    expect(await hook(repo, edit(repo))).toEqual(CLOSED_WRITE);
    expect(await hook(repo, starts(repo))).toEqual(CLOSED_START);
  });

  it('reads the branch as CI names it, and as it stands once main is merged into it', async () => {
    const repo = closedRound();
    const head = repo.git('rev-parse', 'HEAD');
    repo.git('checkout', '-q', '--detach');
    const ci = { GITHUB_HEAD_REF: 'brief/020-compute' };
    const detached = await cli(['doctor'], repo.root, { env: ci });
    expect(detached).toMatchObject({ code: 0, stderr: '' });
    expect(briefLines(detached.stdout)).toEqual([`brief   none: ${PROBLEM}`, `        ${WAITING(repo.git('merge-base', 'main', head))}`]);
    expect(await hook(repo, edit(repo), ci)).toEqual(CLOSED_WRITE);
    // A detached head that nothing names is no round, as it was.
    expect(parsed(await cli(['doctor', '--format', 'json'], repo.root))).toMatchObject({ brief: null, briefProblem: null, closedRound: null });
    // main moves, and the round's branch brings it in with a merge: the merge base is main's new commit, which has no archive.
    repo.git('checkout', '-q', 'main');
    repo.write('main.txt', 'moved\n');
    repo.commit('Main moves');
    repo.git('checkout', '-q', 'brief/020-compute');
    repo.git('merge', '-q', '--no-edit', 'main');
    const merged = await cli(['doctor'], repo.root);
    expect(merged.code).toBe(0);
    expect(briefLines(merged.stdout)).toEqual([`brief   none: ${PROBLEM}`, `        ${WAITING(repo.git('rev-parse', 'main'))}`]);
  });
});

describe('doctor on a closed round\'s branch it fails for', () => {
  it('fails, as it did, where the brief was archived before the branch: a closed round\'s branch used again', async () => {
    const repo = closedRound();
    const archive = repo.git('rev-parse', 'HEAD');
    repo.git('checkout', '-q', 'main');
    repo.git('merge', '-q', '--no-ff', '-m', 'Merge brief 020', 'brief/020-compute');
    repo.git('checkout', '-q', 'brief/020-compute');
    repo.write('src/app/a.ts', 'again;\n');
    repo.commit('More work after the merge');
    const said = `brief 020 was archived before this branch: ${ARCHIVED} is at the merge base with main, ${archive.slice(0, 12)}, so the branch is a closed round's, used again, and every write on it is held`;
    const result = await cli(['doctor'], repo.root);
    expect(result.code).toBe(1);
    expect(briefLines(result.stdout)).toEqual([`brief   none: ${PROBLEM}`, `        ${said}`]);
    expect(parsed(await cli(['doctor', '--format', 'json'], repo.root))).toMatchObject({ closedRound: { state: 'archived-before', file: ARCHIVED, mergeBase: archive, detail: said } });
    expect(await hook(repo, edit(repo))).toEqual(CLOSED_WRITE);
    expect(await hook(repo, starts(repo))).toEqual(CLOSED_START);
  });

  it('cannot tell, and fails, where the base names no commit, as where only the head is fetched, and tells once the base is fetched under its name', async () => {
    const repo = closedRound();
    const flagged = await cli(['doctor', '--base', 'nowhere'], repo.root);
    expect(flagged.code).toBe(1);
    const nowhere = UNTOLD('the base cannot be resolved ("nowhere" names no commit): fetch it under that name, with its history, as git fetch origin main:main fetches main');
    expect(briefLines(flagged.stdout)).toEqual([`brief   none: ${PROBLEM}`, `        ${nowhere}`]);
    expect(parsed(await cli(['doctor', '--base', 'nowhere', '--format', 'json'], repo.root))).toMatchObject({ closedRound: { state: 'unknown', file: ARCHIVED, mergeBase: null, detail: nowhere } });
    // A CI job that fetches the pull request's head alone and checks it out as its branch.
    const job = temp();
    git(job, 'init', '-q', '-b', 'work');
    git(job, 'fetch', '-q', repo.root, 'brief/020-compute');
    git(job, 'checkout', '-q', '-B', 'brief/020-compute', 'FETCH_HEAD');
    const headOnly = await cli(['doctor'], job);
    expect(headOnly.code).toBe(1);
    // The configured base is looked for as the remote's branch as well, which this job has none of either.
    expect(briefLines(headOnly.stdout)[1]).toBe(`        ${UNTOLD('the base cannot be resolved ("main" names no commit, and neither does remotes/origin/main): fetch it under that name, with its history, as git fetch origin main:main fetches main')}`);
    git(job, 'fetch', '-q', repo.root, 'main:main');
    const fetched = await cli(['doctor'], job);
    expect(fetched.code).toBe(0);
    expect(briefLines(fetched.stdout)[1]).toBe(`        ${WAITING(git(job, 'merge-base', 'main', 'HEAD'))}`);
  });

  it('cannot tell, and fails, in a history cut short, where the merge base it finds may be older than the true one', async () => {
    const repo = closedRound({ before: 3 });
    const clone = join(temp(), 'clone');
    git(temp(), 'clone', '-q', '--depth', '3', '--no-single-branch', pathToFileURL(repo.root).href, clone);
    git(clone, 'checkout', '-q', '-B', 'brief/020-compute', 'origin/brief/020-compute');
    git(clone, 'branch', '-q', '-f', 'main', 'origin/main');
    // The merge base is found, in a history that is shallow.
    expect(git(clone, 'merge-base', 'main', 'HEAD')).toBe(repo.git('rev-parse', 'main'));
    expect(git(clone, 'rev-parse', '--is-shallow-repository')).toBe('true');
    const shallow = await cli(['doctor'], clone);
    expect(shallow.code).toBe(1);
    expect(briefLines(shallow.stdout)[1]).toBe(
      `        ${UNTOLD('the history is shallow, or git cannot say that it is not, and a merge base found in it may be older than the one the whole history has: fetch the whole history')}`,
    );
    git(clone, 'fetch', '-q', '--unshallow');
    expect(await cli(['doctor'], clone)).toMatchObject({ code: 0, stderr: '' });
    // Of depth 1, as a checkout fetches by default, the head and the base share no history at all.
    const single = join(temp(), 'single');
    git(temp(), 'clone', '-q', '--depth', '1', '--no-single-branch', pathToFileURL(repo.root).href, single);
    git(single, 'checkout', '-q', '-B', 'brief/020-compute', 'origin/brief/020-compute');
    git(single, 'branch', '-q', '-f', 'main', 'origin/main');
    const cut = await cli(['doctor'], single);
    expect(cut.code).toBe(1);
    expect(briefLines(cut.stdout)[1]).toBe(`        ${UNTOLD('the base cannot be resolved ("main" and HEAD share no history): fetch it under that name, with its history, as git fetch origin main:main fetches main')}`);
  });

  it('cannot tell, and fails, where git cannot read the tree of the merge base or of HEAD', async () => {
    const said = UNTOLD(`git could not list ${ARCHIVED} at the merge base with main, or at HEAD`);
    for (const commit of ['main', 'HEAD']) {
      const repo = closedRound();
      const tree = repo.git('rev-parse', `${commit}^{tree}`);
      rmSync(join(repo.root, '.git', 'objects', tree.slice(0, 2), tree.slice(2)));
      const result = await cli(['doctor'], repo.root);
      expect(result.code, commit).toBe(1);
      expect(briefLines(result.stdout)[1], commit).toBe(`        ${said}`);
    }
  });

  it('cannot tell, and fails, where the archive is not committed at HEAD', async () => {
    const repo = closedRound({ commit: false });
    const result = await cli(['doctor'], repo.root);
    expect(result.code).toBe(1);
    expect(briefLines(result.stdout)[1]).toBe(`        ${UNTOLD(`${ARCHIVED} is not committed at HEAD; commit the archive`)}`);
    repo.commit('Archive brief 020');
    expect(await cli(['doctor'], repo.root)).toMatchObject({ code: 0, stderr: '' });
  });
});

describe('doctor where nothing the branch names is archived', () => {
  it('fails as it did for a brief spec-brief does not list, and asks git nothing more', async () => {
    const repo = closedRound();
    repo.git('checkout', '-q', '-b', 'brief/021-ahead', 'main');
    const result = await cli(['doctor'], repo.root);
    expect(result.code).toBe(1);
    expect(briefLines(result.stdout)).toEqual(['brief   none: the branch names brief 021, and spec-brief knows no such brief']);
    expect(parsed(await cli(['doctor', '--format', 'json'], repo.root))).toMatchObject({ closedRound: null });
    expect(await hook(repo, edit(repo))).toEqual({ code: 2, stdout: '', stderr: 'spec-harness: the branch names brief 021, and spec-brief knows no such brief. Fix the brief or the branch before writing.\n' });
  });

  it('fails nothing, and reads nothing of the archive, for a brief the flag or SPEC_BRIEF names', async () => {
    const repo = closedRound();
    repo.git('checkout', '-q', 'main');
    for (const [argv, env] of [[['--brief', '020'], {}], [[], { SPEC_BRIEF: '020' }]] as const) {
      const result = await cli(['doctor', '--format', 'json', ...argv], repo.root, { env });
      expect(result.code, argv.join(' ')).toBe(0);
      expect(parsed(result), argv.join(' ')).toMatchObject({ brief: '020', closedRound: null });
    }
    // The hook holds the write under the variable in the words it had: no branch names the round.
    expect(await hook(repo, edit(repo), { SPEC_BRIEF: '020' })).toEqual({
      code: 2,
      stdout: '',
      stderr: 'spec-harness: the environment names brief 020, which is archived; a closed round writes nothing. Fix the brief or the branch before writing.\n',
    });
  });

  it('reads nothing of the archive for a live brief the branch names', async () => {
    const repo = closedRound({ config: { tools: { 'spec-brief': specBrief('live') } } });
    const result = await cli(['doctor', '--format', 'json'], repo.root);
    expect(result.code).toBe(0);
    expect(parsed(result)).toMatchObject({ brief: '020', briefProblem: null, closedRound: null });
  });
});

describe('the turn report on a closed round\'s branch', () => {
  it('says that every write is held, and that the round ends when the branch merges', async () => {
    const repo = closedRound({ config: { turnReport: true } });
    const said = `spec-harness: ${PROBLEM}, so what the work tree holds is not reported, and every write is held but one to a file outside every work tree of the repository: the round is archived and ends when this branch merges; spec-harness doctor says more`;
    const stop = JSON.stringify({ session_id: 's', cwd: repo.root, hook_event_name: 'Stop', stop_hook_active: false });
    expect(await hook(repo, stop)).toEqual({ code: 0, stderr: '', stdout: `${JSON.stringify({ systemMessage: said })}\n` });
  });
});
