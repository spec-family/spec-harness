/**
 * A run of Claude Code's hook whose budget is spent before git is asked:
 * git is not started, and what it would have told is a GitError. As a
 * session starts that is said as holding every write, a write outside
 * every work tree among them, since the hook asks git where such a write
 * is too, where a brief's name, a configuration or spec-brief spares it
 * (ADR-0005, amended 2026-11-08). The budget is mocked to nothing here, in
 * a file of its own: `tests/integration/budget.test.ts` has it at three
 * seconds.
 */

import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/hooks.js', async (original) => ({ ...(await original<typeof import('../../src/hooks.js')>()), HOOK_BUDGET_MS: 0 }));

import { brief, BRIEF_FILE, cleanup, cli, repository } from './helpers.js';

afterAll(cleanup);

describe('a run of the hook with nothing left of its budget', () => {
  it('says, as a session starts, a git it could not ask, and spares no write', async () => {
    const repo = repository({ [BRIEF_FILE]: brief() });
    repo.git('checkout', '-q', '-b', 'brief/001-rotate');
    const question = JSON.stringify({ session_id: 's', cwd: repo.root, hook_event_name: 'SessionStart', source: 'startup' });
    const answer = await cli(['hook', 'claude'], repo.root, { stdin: question, env: { CLAUDE_PROJECT_DIR: repo.root } });
    expect({ code: answer.code, stderr: answer.stderr }).toEqual({ code: 0, stderr: '' });
    const said = (JSON.parse(answer.stdout) as { systemMessage: string }).systemMessage;
    expect(said).toMatch(/^spec-harness: git .+ was not started: the 0 seconds the hook's run is given had passed, so every write of this session is held until it is mended; spec-harness doctor says more$/);
  });
});
