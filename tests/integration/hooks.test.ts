import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { brief, BRIEF_FILE, cleanup, cli, repository, temp, write, type Repository } from './helpers.js';

afterAll(cleanup);

let repo: Repository;

beforeAll(() => {
  repo = repository({
    [BRIEF_FILE]: brief({ affected: ['src/auth/**'], protected: ['src/db/**'] }),
    'src/db/schema.ts': 'table;\n',
    'src/db/old.ts': 'old;\n',
    'src/auth/a.ts': 'a;\n',
    'README.md': '# x\n',
  });
  repo.git('checkout', '-q', '-b', 'brief/001-rotate');
});

function hookInput(event: string, tool: string, input: Record<string, unknown>, cwd: string = repo.root): string {
  return JSON.stringify({ session_id: 's', transcript_path: '/t', cwd, hook_event_name: event, tool_name: tool, tool_input: input });
}

async function claude(stdin: string, options: { cwd?: string; env?: Record<string, string>; root?: string } = {}) {
  return cli(['hook', 'claude', ...(options.root === undefined ? [] : ['--root', options.root])], options.cwd ?? repo.root, {
    stdin,
    env: options.env ?? {},
  });
}

describe('hook claude', () => {
  it('refuses a write to a protected file before it happens, with the next step', async () => {
    const result = await claude(hookInput('PreToolUse', 'Write', { file_path: join(repo.root, 'src', 'db', 'schema.ts'), content: 'x' }));
    expect(result.code).toBe(0);
    const answer = JSON.parse(result.stdout) as { hookSpecificOutput: { hookEventName: string; permissionDecision: string; permissionDecisionReason: string } };
    expect(answer.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(answer.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(answer.hookSpecificOutput.permissionDecisionReason).toContain('brief 001 does not empower this round to change src/db/schema.ts');
    expect(answer.hookSpecificOutput.permissionDecisionReason).toContain('Next: if the round cannot be done without it');
  });

  it('reads the path an Edit, a MultiEdit or a NotebookEdit names, relative to the session', async () => {
    for (const [tool, input] of [
      ['Edit', { file_path: 'src/db/schema.ts', old_string: 'a', new_string: 'b' }],
      ['MultiEdit', { file_path: 'src/db/schema.ts', edits: [] }],
      ['NotebookEdit', { notebook_path: 'src/db/n.ipynb', new_source: 'x' }],
      ['Write', { path: 'src/db/new.ts', content: 'x' }],
    ] as const) {
      const result = await claude(hookInput('PreToolUse', tool, input));
      expect(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, tool).toBe('deny');
    }
    const fromSrc = await claude(hookInput('PreToolUse', 'Edit', { file_path: 'db/schema.ts' }, join(repo.root, 'src')));
    expect(JSON.parse(fromSrc.stdout).hookSpecificOutput.permissionDecision).toBe('deny');
  });

  it('says nothing before a write in scope, or outside it when only warning: never "allow"', async () => {
    for (const path of ['src/auth/a.ts', 'README.md', BRIEF_FILE]) {
      expect(await claude(hookInput('PreToolUse', 'Write', { file_path: path }))).toEqual({ code: 0, stdout: '', stderr: '' });
    }
  });

  it('warns the model after a write outside the scope, and says nothing after one inside it', async () => {
    const warned = await claude(hookInput('PostToolUse', 'Write', { file_path: 'README.md' }));
    expect(warned.code).toBe(0);
    expect(JSON.parse(warned.stdout)).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext:
          "spec-harness: README.md is outside brief 001's scope, which covers src/auth/**. Next: if the round needs it, say so in briefs/001_rotate-tokens.md and add it to affectedFiles; the archive reports every file outside the scope.",
      },
    });
    expect((await claude(hookInput('PostToolUse', 'Write', { file_path: 'src/auth/a.ts' }))).stdout).toBe('');
  });

  it('ignores a tool that writes no file, without asking spec-brief', async () => {
    // A command that cannot run: the hook must not need it for a Bash call.
    const broken = repository({}, { tools: { 'spec-brief': ['no-such-program-for-spec-harness'] } });
    expect(await claude(hookInput('PreToolUse', 'Bash', { command: 'rm -rf src' }, broken.root), { cwd: broken.root })).toEqual({ code: 0, stdout: '', stderr: '' });
    expect(await claude(hookInput('PreToolUse', 'Read', { file_path: 'src/db/schema.ts' }))).toEqual({ code: 0, stdout: '', stderr: '' });
    // Nor blocks it over a brief it cannot name: a write it would check never comes.
    expect(await claude(hookInput('PreToolUse', 'Bash', { command: 'ls' }), { env: { SPEC_BRIEF: '404' } })).toEqual({ code: 0, stdout: '', stderr: '' });
  });

  it('says input it cannot read to the person, with exit 0, which no onFailure takes for a hook that failed', async () => {
    expect(await claude('{"hook_event_name":')).toEqual({ code: 0, stdout: `${JSON.stringify({ systemMessage: 'spec-harness: the hook input is not JSON, so nothing it asks about is checked' })}\n`, stderr: '' });
    expect(await claude('{"tool_name":"Write"}')).toEqual({ code: 0, stdout: `${JSON.stringify({ systemMessage: 'spec-harness: the hook input names no event or tool, so nothing it asks about is checked' })}\n`, stderr: '' });
  });

  it('finds the project from CLAUDE_PROJECT_DIR, or --root, when run from elsewhere', async () => {
    const elsewhere = temp();
    const input = hookInput('PreToolUse', 'Write', { file_path: join(repo.root, 'src', 'db', 'schema.ts') }, elsewhere);
    const fromEnv = await claude(input, { cwd: elsewhere, env: { CLAUDE_PROJECT_DIR: repo.root } });
    expect(JSON.parse(fromEnv.stdout).hookSpecificOutput.permissionDecision).toBe('deny');
    const fromRoot = await claude(input, { cwd: elsewhere, root: repo.root });
    expect(JSON.parse(fromRoot.stdout).hookSpecificOutput.permissionDecision).toBe('deny');
  });

  it('stays out of the way outside a git repository', async () => {
    const elsewhere = temp();
    expect(await claude(hookInput('PreToolUse', 'Write', { file_path: 'a.ts' }, elsewhere), { cwd: elsewhere })).toEqual({ code: 0, stdout: '', stderr: '' });
  });

  it('asks the person about a write outside the scope when the repository says to', async () => {
    const asking = repository({ [BRIEF_FILE]: brief({ affected: ['src/**'] }) }, { outOfScope: 'ask' });
    const result = await claude(hookInput('PreToolUse', 'Write', { file_path: 'README.md' }, asking.root), { cwd: asking.root, env: { SPEC_BRIEF: '1' } });
    expect(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision).toBe('ask');
  });

  it('blocks every write while the named brief is unknown or archived (exit 2)', async () => {
    const result = await claude(hookInput('PreToolUse', 'Write', { file_path: 'src/auth/a.ts' }), { env: { SPEC_BRIEF: '404' } });
    expect(result).toEqual({
      code: 2,
      stdout: '',
      stderr: 'spec-harness: the environment names brief 404, and spec-brief knows no such brief. Fix the brief or the branch before writing.\n',
    });
  });

  it('blocks a write it cannot check because spec-brief cannot answer, and reports the same after a write', async () => {
    const fake = temp();
    write(fake, 'fail.js', 'process.stderr.write("no config\\n"); process.exit(2);\n');
    const broken = repository({}, { tools: { 'spec-brief': ['node', join(fake, 'fail.js')] } });
    broken.git('checkout', '-q', '-b', 'brief/001-x');
    const before = await claude(hookInput('PreToolUse', 'Write', { file_path: 'a.ts' }, broken.root), { cwd: broken.root });
    expect(before).toEqual({ code: 2, stdout: '', stderr: 'spec-harness: cannot check this write: spec-brief could not list the briefs: no config\n' });
    const after = await claude(hookInput('PostToolUse', 'Write', { file_path: 'a.ts' }, broken.root), { cwd: broken.root });
    expect(after).toEqual({ code: 2, stdout: '', stderr: 'spec-harness: spec-brief could not list the briefs: no config\n' });
  });
});

describe('hook git', () => {
  async function staged(change: (r: Repository) => void, files: Readonly<Record<string, string>> = {}): Promise<{ code: number; stdout: string; stderr: string }> {
    const r = repository({
      [BRIEF_FILE]: brief({ affected: ['src/auth/**'], protected: ['src/db/**'] }),
      'src/db/schema.ts': 'table;\n',
      'src/auth/a.ts': 'a;\n',
      ...files,
    });
    r.git('checkout', '-q', '-b', 'brief/001-x');
    change(r);
    return cli(['hook', 'git'], r.root);
  }

  it('stops a commit that changes a protected file', async () => {
    const result = await staged((r) => {
      r.write('src/db/schema.ts', 'changed;\n');
      r.write('src/auth/a.ts', 'b;\n');
      r.git('add', '-A');
    });
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      [
        'refused  brief 001 does not empower this round to change src/db/schema.ts (protectedFiles: src/db/**)',
        '         if the round cannot be done without it, stop and ask for a ruling: spec-harness escalate --path <file> --reason <why>, or the request_escalation tool',
        "spec-harness: 1 file(s) this round may not change; the commit was stopped",
        '',
      ].join('\n'),
    );
  });

  it('stops a commit that deletes or renames a protected file away', async () => {
    const deleted = await staged((r) => r.git('rm', '-q', 'src/db/schema.ts'));
    expect(deleted.code).toBe(1);
    const renamed = await staged((r) => r.git('mv', 'src/db/schema.ts', 'src/auth/schema.ts'));
    expect(renamed.code).toBe(1);
    expect(renamed.stderr).toContain('src/db/schema.ts');
  });

  it('lets a commit through with a warning for a file outside the scope, and silently inside it', async () => {
    const outside = await staged((r) => {
      r.write('NOTES.md', 'x\n');
      r.git('add', '-A');
    });
    expect(outside.code).toBe(0);
    expect(outside.stderr).toContain("warning  NOTES.md is outside brief 001's scope");
    const inside = await staged((r) => {
      r.write('src/auth/b.ts', 'x\n');
      r.git('add', '-A');
    });
    expect(inside).toEqual({ code: 0, stdout: '', stderr: '' });
    expect(await staged(() => undefined)).toEqual({ code: 0, stdout: '', stderr: '' });
  });

  it('stops every commit while the named brief is unknown', async () => {
    const r = repository({ [BRIEF_FILE]: brief(), 'a.ts': 'a\n' });
    // A commit that stages nothing changes nothing to check.
    expect(await cli(['hook', 'git', '--brief', '404'], r.root)).toEqual({ code: 0, stdout: '', stderr: '' });
    r.write('a.ts', 'b\n');
    r.git('add', '-A');
    const result = await cli(['hook', 'git', '--brief', '404'], r.root);
    expect(result).toEqual({ code: 2, stdout: '', stderr: 'spec-harness: the flag names brief 404, and spec-brief knows no such brief\n' });
  });

  describe("on the branch of a round whose brief spec-brief lists as archived", () => {
    const ARCHIVED = 'briefs/archive/001_rotate-tokens.md';
    const HELD = 'spec-harness: the branch names brief 001, which is archived; a closed round writes nothing.';
    /** The move spec-brief's archive makes of brief 001, staged. */
    const archive = (r: Repository): void => {
      mkdirSync(join(r.root, 'briefs', 'archive'), { recursive: true });
      r.git('mv', BRIEF_FILE, ARCHIVED);
    };

    it('takes the commit that archives it, with the links spec-brief rewrote in a live brief', async () => {
      expect(await staged(archive)).toEqual({ code: 0, stdout: '', stderr: '' });
      const linked = await staged(
        (r) => {
          archive(r);
          r.write('briefs/002_other.md', brief({ title: '002 - Other', status: 'draft', body: '[The tokens](archive/001_rotate-tokens.md).' }));
          r.git('add', '-A');
        },
        { 'briefs/002_other.md': brief({ title: '002 - Other', status: 'draft', body: '[The tokens](001_rotate-tokens.md).' }) },
      );
      expect(linked).toEqual({ code: 0, stdout: '', stderr: '' });
    });

    it('holds it beside anything else, an archived brief of another round among them, and says to unstage the rest', async () => {
      const ALONE = `${HELD} The archive is a closed round's last commit, and takes nothing else with it: unstage the rest.\n`;
      const beside = await staged((r) => {
        archive(r);
        r.write('src/auth/b.ts', 'x\n');
        r.git('add', '-A');
      });
      expect(beside).toEqual({ code: 2, stdout: '', stderr: ALONE });
      const frozen = await staged(
        (r) => {
          archive(r);
          r.write('briefs/archive/000_old.md', brief({ title: '000 - Old', body: 'Changed.' }));
          r.git('add', '-A');
        },
        { 'briefs/archive/000_old.md': brief({ title: '000 - Old' }) },
      );
      expect(frozen).toEqual({ code: 2, stdout: '', stderr: ALONE });
    });

    it('holds every commit after it, with the round ending when the branch merges', async () => {
      const after = await staged((r) => {
        archive(r);
        r.git('commit', '-q', '--no-verify', '-m', 'Archive brief 001');
        r.write('src/auth/a.ts', 'b;\n');
        r.git('add', '-A');
      });
      expect(after).toEqual({ code: 2, stdout: '', stderr: `${HELD} The round is archived and ends when this branch merges: write on the branch of a live brief.\n` });
    });
  });

  it('answers only claude and git', async () => {
    expect(await cli(['hook'], repo.root)).toEqual({ code: 2, stdout: '', stderr: 'spec-harness: hook takes "claude" or "git"\n' });
    expect((await cli(['hook', 'cursor'], repo.root)).code).toBe(2);
  });
});
