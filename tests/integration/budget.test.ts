/**
 * One budget for a run of Claude Code's hook, every process it starts
 * together (ADR-0002, amended 2026-10-24). Each process asked a question
 * had 20 seconds, and several that answered slowly, none of them at that,
 * passed the 60 seconds Claude Code gives the hook's entry as init writes
 * it, which cancels the hook and lets the write go ahead. This file
 * shortens the budget to three seconds, so that a run that passes it is
 * read in seconds; the rest of the suite runs at the budget itself.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/hooks.js', async (original) => ({ ...(await original<typeof import('../../src/hooks.js')>()), HOOK_BUDGET_MS: 3_000 }));

import { brief, BRIEF_FILE, cleanup, cli, repository, siblings, SPEC_BRIEF, temp, type Repository } from './helpers.js';

afterAll(cleanup);

/** spec-brief, started after `ms` of waiting: slow, and never at the 20 seconds a question is given. */
function slowBrief(ms: number): string[] {
  const script = join(temp(), 'slow-brief.cjs');
  writeFileSync(
    script,
    `setTimeout(() => { const run = require('node:child_process').spawnSync(process.execPath, [${JSON.stringify(SPEC_BRIEF)}, ...process.argv.slice(2)], { stdio: 'inherit' }); process.exit(run.status ?? 2); }, ${ms});\n`,
  );
  return ['node', script];
}

const FILES = { [BRIEF_FILE]: brief({ affected: ['src/app/**'], protected: ['src/db/**'] }), 'src/db/schema.ts': 'table;\n', 'src/app/a.ts': 'a;\n' };

function project(ms: number, config: Record<string, unknown> = {}): Repository {
  const repo = repository(FILES, { tools: { ...siblings(), 'spec-brief': slowBrief(ms) }, ...config });
  repo.git('checkout', '-q', '-b', 'brief/001-rotate');
  return repo;
}

const question = (repo: Repository, event: string, input: Record<string, string> = {}): string =>
  JSON.stringify({ session_id: 's', tool_use_id: 'toolu_1', cwd: repo.root, hook_event_name: event, ...(event === 'PreToolUse' || event === 'PostToolUse' ? { tool_name: 'Edit', tool_input: { old_string: 'a', new_string: 'b', ...input } } : {}) });

const hook = (repo: Repository, stdin: string) => cli(['hook', 'claude'], repo.root, { stdin, env: { CLAUDE_PROJECT_DIR: repo.root } });

const SPENT = 'spec-brief did not answer within the 3 seconds the hook\'s run is given, and was stopped';

describe("a run of Claude Code's hook, which has one budget", () => {
  it('holds the write before it where a process takes more than is left of it, in the time limit\'s words', async () => {
    const repo = project(4_000);
    expect(await hook(repo, question(repo, 'PreToolUse', { file_path: join(repo.root, 'src', 'app', 'a.ts') }))).toEqual({ code: 2, stdout: '', stderr: `spec-harness: cannot check this write: ${SPENT}\n` });
    // After a write there is nothing to hold, and the run ends as one whose sibling fails.
    expect(await hook(repo, question(repo, 'PostToolUse', { file_path: join(repo.root, 'README.md') }))).toEqual({ code: 2, stdout: '', stderr: `spec-harness: ${SPENT}\n` });
  });

  it('holds the write where two processes take more than it together, each well inside the time a question is given', async () => {
    const repo = project(2_000);
    const beside = join(temp(), 'w');
    repo.git('worktree', 'add', '-q', '-b', 'brief/001-w', beside);
    // A write to a file of each work tree asks spec-brief of each, one after the other.
    const answer = await hook(repo, question(repo, 'PreToolUse', { file_path: join(beside, 'src', 'app', 'a.ts'), path: join(repo.root, 'src', 'app', 'a.ts') }));
    // Whichever process the budget ran out in, the second spec-brief where
    // the first answered in time, is said by the budget.
    expect({ code: answer.code, stdout: answer.stdout }).toEqual({ code: 2, stdout: '' });
    expect(answer.stderr).toMatch(/^spec-harness: cannot check this write: .+ the 3 seconds the hook's run is given(, and was stopped| had passed)\n$/);
  });

  it('decides the write as before where the run ends inside it', async () => {
    const repo = project(500);
    const answer = await hook(repo, question(repo, 'PreToolUse', { file_path: join(repo.root, 'src', 'db', 'schema.ts') }));
    expect(answer.code).toBe(0);
    expect(JSON.parse(answer.stdout)).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny' } });
    expect(await hook(repo, question(repo, 'PreToolUse', { file_path: join(repo.root, 'src', 'app', 'a.ts') }))).toEqual({ code: 0, stdout: '', stderr: '' });
  });

  it('is said as a session starts, and at the end of a turn, which neither holds', async () => {
    const repo = project(4_000, { turnReport: true });
    const said = `spec-harness: ${SPENT}, so every write of this session is held until it is mended, but one to a file outside every work tree of the repository; spec-harness doctor says more`;
    expect(await hook(repo, question(repo, 'SessionStart'))).toEqual({ code: 0, stdout: `${JSON.stringify({ systemMessage: said, hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: said } })}\n`, stderr: '' });
    expect(await hook(repo, question(repo, 'Stop'))).toEqual({ code: 0, stdout: `${JSON.stringify({ systemMessage: `spec-harness: ${SPENT}, so what the work tree holds is not reported` })}\n`, stderr: '' });
  });

  it("is said by doctor of an entry whose timeout is below it, and of none that gives it as much", async () => {
    const repo = project(0);
    const entry = (timeout: number) => ({ matcher: 'Edit|Write|MultiEdit|NotebookEdit', hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PROJECT_DIR}/node_modules/@spec-family/spec-harness/bin/spec-harness.js', 'hook', 'claude'], timeout }] });
    const settings = (before: number, after: number) => repo.write('.claude/settings.json', `${JSON.stringify({ hooks: { PreToolUse: [entry(before)], PostToolUse: [entry(after)] } }, null, 2)}\n`);
    settings(2, 60);
    const noted = await cli(['doctor'], repo.root);
    expect(noted.stdout).toContain('\n        "hook claude" in .claude/settings.json gives the hook 2 seconds under PreToolUse, less than the 3 a run of it is given, so Claude Code cancels a run that takes longer before it answers, and a write it would have held goes ahead: give the entry 60, as init writes it, or no timeout\n');
    settings(3, 60);
    const plain = await cli(['doctor'], repo.root);
    expect(plain.stdout).not.toContain('a run of it is given');
    // A note, which fails nothing.
    expect(noted.code).toBe(plain.code);
  });

  it("is no budget of git's hook, of guard, or of doctor, which no entry of Claude Code's runs", async () => {
    const repo = project(4_000);
    repo.write('src/db/schema.ts', 'changed;\n');
    repo.git('add', 'src/db/schema.ts');
    const committed = await cli(['hook', 'git'], repo.root);
    expect(committed.code).toBe(1);
    expect(committed.stderr).toContain('refused  brief 001 does not empower this round to change src/db/schema.ts');
    expect((await cli(['guard', 'src/db/schema.ts'], repo.root)).code).toBe(1);
    expect((await cli(['doctor'], repo.root)).stdout).toContain('\nbrief   001\n');
  });
});
