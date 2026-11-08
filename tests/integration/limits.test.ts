/**
 * What the hook and doctor answer where spec-brief does not answer: at the
 * time a question is given, which this file shortens to five seconds so that
 * the answer is read in seconds where it would take twenty of them; the rest
 * of the suite runs at the time itself (ADR-0002). git keeps its own limit,
 * which its module reads as its own and no import of it; a git that does not
 * answer is its first question rejected, as at its limit, where a test says so.
 */

import { join } from 'node:path';

import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/git.js', async (original) => {
  const actual = await original<typeof import('../../src/git.js')>();
  // The first question of where a work tree is, as the tests below have it answer.
  return { ...actual, ANSWER_MS: 5_000, workTree: vi.fn(actual.workTree) };
});

import { GitError, workTree } from '../../src/git.js';
import { brief, BRIEF_FILE, cleanup, cli, repository, siblings, type Repository } from './helpers.js';

afterAll(cleanup);

/** A spec-brief that is started and never answers, as one reading a named pipe for its configuration did. */
const SILENT = ['node', '-e', 'setInterval(() => {}, 1000)'];

const STOPPED = 'spec-brief did not answer within 5 seconds, and was stopped';

function project(branch: string): Repository {
  const repo = repository({ [BRIEF_FILE]: brief({ affected: ['src/auth/**'], protected: ['src/db/**'] }), 'src/db/schema.ts': 'table;\n' }, { tools: { ...siblings(), 'spec-brief': SILENT } });
  if (branch !== 'main') repo.git('checkout', '-q', '-b', branch);
  return repo;
}

const question = (root: string, event: string, path = 'src/db/schema.ts'): string =>
  JSON.stringify({ session_id: 's', cwd: root, hook_event_name: event, ...(event === 'SessionStart' ? { source: 'startup' } : { tool_name: 'Edit', tool_input: { file_path: join(root, ...path.split('/')), old_string: 'a', new_string: 'b' } }) });

describe('spec-brief that does not answer (ADR-0002)', () => {
  it('holds the write before it, in the words a write gets when a sibling fails, within the minute Claude Code gives the hook', async () => {
    const repo = project('brief/001-rotate');
    const started = Date.now();
    // Claude Code cancels a hook that reaches its entry's timeout, which before a write lets the write go ahead.
    expect(await cli(['hook', 'claude'], repo.root, { stdin: question(repo.root, 'PreToolUse') })).toEqual({ code: 2, stdout: '', stderr: `spec-harness: cannot check this write: ${STOPPED}\n` });
    expect(Date.now() - started).toBeLessThan(60_000);
    // After a write there is nothing to hold, and the run ends as any whose sibling fails.
    expect(await cli(['hook', 'claude'], repo.root, { stdin: question(repo.root, 'PostToolUse', 'README.md') })).toEqual({ code: 2, stdout: '', stderr: `spec-harness: ${STOPPED}\n` });
  });

  it('is said as a session starts, which it does not keep from starting', async () => {
    const repo = project('brief/001-rotate');
    const said = `spec-harness: ${STOPPED}, so every write of this session is held until it is mended, but one to a file outside every work tree of the repository; spec-harness doctor says more`;
    expect(await cli(['hook', 'claude'], repo.root, { stdin: question(repo.root, 'SessionStart') })).toEqual({
      code: 0,
      stdout: `${JSON.stringify({ systemMessage: said, hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: said } })}\n`,
      stderr: '',
    });
  });

  it('is said by doctor, which comes back', async () => {
    const repo = project('brief/001-rotate');
    const result = await cli(['doctor'], repo.root);
    expect(result.stdout).toContain(`\nbrief   none: spec-brief could not say whether it knows brief 001: ${STOPPED}\n`);
  });

  it('holds the write before it where git does not answer where the work tree is, which read as no work tree held nothing', async () => {
    const repo = project('brief/001-rotate');
    const stopped = 'git rev-parse did not answer within 20 seconds, and was stopped';
    vi.mocked(workTree).mockRejectedValueOnce(new GitError(stopped));
    expect(await cli(['hook', 'claude'], repo.root, { stdin: question(repo.root, 'PreToolUse') })).toEqual({ code: 2, stdout: '', stderr: `spec-harness: cannot check this write: ${stopped}\n` });
    vi.mocked(workTree).mockRejectedValueOnce(new GitError(stopped));
    expect(await cli(['hook', 'claude'], repo.root, { stdin: question(repo.root, 'PostToolUse', 'README.md') })).toEqual({ code: 2, stdout: '', stderr: `spec-harness: ${stopped}\n` });
  });

  it('holds no write where nothing names a brief, since spec-brief is not asked', async () => {
    const repo = project('main');
    expect(await cli(['hook', 'claude'], repo.root, { stdin: question(repo.root, 'PreToolUse') })).toEqual({ code: 0, stdout: '', stderr: '' });
  });
});
