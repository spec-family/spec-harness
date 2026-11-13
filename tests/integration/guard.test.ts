import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { repositoryPath } from '../../src/fs.js';
import type { Decision } from '../../src/guard.js';
import { brief, BRIEF_FILE, cleanup, cli, ignoresCase, parsed, repository, siblingsSayingNoProblem, SPEC_BRIEF, temp, type Repository } from './helpers.js';

afterAll(cleanup);

let repo: Repository;

beforeAll(() => {
  repo = repository({
    [BRIEF_FILE]: brief({ affected: ['src/auth/**'], protected: ['src/db/schema.ts'] }),
    'briefs/archive/002_old.md': brief({ status: 'archived', title: '002 - Old' }),
    'src/db/schema.ts': 'table;\n',
    'src/auth/a.ts': 'a;\n',
    'README.md': '# x\n',
  });
  repo.git('checkout', '-q', '-b', 'brief/001-rotate');
});

async function decisions(args: readonly string[], cwd = repo.root, env: Record<string, string> = {}): Promise<Decision[]> {
  const result = await cli(['guard', ...args, '--format', 'json'], cwd, { env });
  return parsed<{ decisions: Decision[] }>(result).decisions;
}

describe('guard on a brief branch', () => {
  it('allows a path in scope, and one the round creates', async () => {
    const result = await cli(['guard', 'src/auth/a.ts', 'src/auth/new/b.ts'], repo.root);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(
      "ok       src/auth/a.ts is in brief 001's scope (src/auth/**)\nok       src/auth/new/b.ts is in brief 001's scope (src/auth/**)\n",
    );
  });

  it('refuses a protected path with the next step, and exits 1', async () => {
    const result = await cli(['guard', 'src/db/schema.ts', 'src/auth/a.ts'], repo.root);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('refused  brief 001 does not empower this round to change src/db/schema.ts');
    expect(result.stdout).toContain('spec-harness escalate --path <file> --reason <why>');
  });

  it('warns about a path outside the scope, failing only under --strict', async () => {
    const warned = await cli(['guard', 'README.md'], repo.root);
    expect(warned.code).toBe(0);
    expect(warned.stdout).toContain("warning  README.md is outside brief 001's scope, which covers src/auth/**");
    expect((await cli(['guard', 'README.md', '--strict'], repo.root)).code).toBe(1);
    expect((await cli(['guard', 'src/auth/a.ts', 'README.md', '--strict'], repo.root)).code).toBe(1);
    expect((await cli(['guard', 'src/auth/a.ts', '--strict'], repo.root)).code).toBe(0);
  });

  it('answers in JSON with every decision', async () => {
    const result = await cli(['guard', 'src/db/schema.ts', 'README.md', BRIEF_FILE, '--format', 'json'], repo.root);
    const document = parsed<{ tool: string; command: string; schemaVersion: number; decisions: Decision[] }>(result);
    expect(document).toMatchObject({ tool: 'spec-harness', command: 'guard', schemaVersion: 1 });
    expect(document.decisions.map((d) => [d.path, d.verdict, d.reason])).toEqual([
      ['src/db/schema.ts', 'deny', 'protected'],
      ['README.md', 'warn', 'out-of-scope'],
      [BRIEF_FILE, 'allow', 'brief-file'],
    ]);
  });

  it('resolves a path from the directory it is run in, and an absolute one', async () => {
    expect((await decisions(['db/schema.ts'], join(repo.root, 'src')))[0]).toMatchObject({ path: 'src/db/schema.ts', verdict: 'deny' });
    expect((await decisions([join(repo.root, 'src', 'db', 'schema.ts')]))[0]).toMatchObject({ path: 'src/db/schema.ts', verdict: 'deny' });
    expect((await decisions(['../README.md'], join(repo.root, 'src')))[0]).toMatchObject({ path: 'README.md', reason: 'out-of-scope' });
  });

  it('allows a path outside the repository, which no brief governs', async () => {
    const elsewhere = join(temp(), 'x.ts');
    expect((await decisions([elsewhere]))[0]).toMatchObject({ path: elsewhere, verdict: 'allow', reason: 'outside-repository' });
  });

  it('reads the real spelling of a path, so a case change does not walk past a protection', async () => {
    const lower = repositoryPath('src/db/schema.ts', repo.root, repo.root);
    expect(lower).toBe('src/db/schema.ts');
    if (!ignoresCase(repo.root)) return; // Two spellings are two files here; there is nothing to correct.
    expect(repositoryPath('SRC/DB/Schema.TS', repo.root, repo.root)).toBe('src/db/schema.ts');
    expect(repositoryPath(join(repo.root.toUpperCase(), 'SRC', 'db', 'schema.ts'), repo.root, repo.root)).toBe('src/db/schema.ts');
    expect((await decisions(['SRC/DB/Schema.TS']))[0]).toMatchObject({ path: 'src/db/schema.ts', verdict: 'deny', reason: 'protected' });
  });

  it('names a brief by the flag or SPEC_BRIEF over the branch, and refuses one spec-brief does not know or has archived', async () => {
    const unknown = await cli(['guard', 'src/db/schema.ts', '--brief', '099'], repo.root);
    expect(unknown.code).toBe(2);
    expect(unknown.stderr).toBe('spec-harness: the flag names brief 099, and spec-brief knows no such brief\n');
    const archived = await cli(['guard', 'src/db/schema.ts'], repo.root, { env: { SPEC_BRIEF: '2' } });
    expect(archived.code).toBe(2);
    expect(archived.stderr).toBe('spec-harness: the environment names brief 002, which is archived; a closed round writes nothing\n');
  });
});

describe('guard with no brief named', () => {
  it('allows everything, saying no brief governs it', async () => {
    const plain = repository({ [BRIEF_FILE]: brief({ protected: ['src/db/schema.ts'] }), 'src/db/schema.ts': 'x\n' });
    const result = await cli(['guard', 'src/db/schema.ts', '--format', 'json'], plain.root);
    expect(result.code).toBe(0);
    expect(parsed<{ decisions: Decision[] }>(result).decisions[0]).toMatchObject({ verdict: 'allow', reason: 'no-brief' });
    expect(parsed<{ decisions: Decision[] }>(result).decisions[0]?.message).toContain('pass --brief <id>, set SPEC_BRIEF');
    // SPEC_BRIEF names one on a branch that does not.
    expect((await decisions(['src/db/schema.ts'], plain.root, { SPEC_BRIEF: '1' }))[0]).toMatchObject({ verdict: 'deny', reason: 'protected' });
  });

  it('asks spec-brief nothing when no brief is named, so a spec-brief that cannot run blocks nothing', async () => {
    const broken = repository({}, { tools: { 'spec-brief': ['no-such-program-for-spec-harness'] } });
    const result = await cli(['guard', 'src/a.ts'], broken.root);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('no brief governs src/a.ts: no brief is named');
  });

  it('needs a path', async () => {
    const result = await cli(['guard'], repo.root);
    expect(result).toMatchObject({ code: 2, stderr: 'spec-harness: guard needs at least one path\n' });
  });
});

describe('guard under the repository\'s configuration', () => {
  it('asks about, or refuses, a path outside the scope when configured to', async () => {
    const files = { [BRIEF_FILE]: brief({ affected: ['src/**'] }) };
    const ask = repository(files, { outOfScope: 'ask' });
    const asked = await cli(['guard', 'README.md', '--brief', '1'], ask.root);
    expect(asked.code).toBe(1);
    expect(asked.stdout).toContain("ask      README.md is outside brief 001's scope");
    const deny = repository(files, { outOfScope: 'deny' });
    expect((await decisions(['README.md', '--brief', '1'], deny.root))[0]).toMatchObject({ verdict: 'deny', reason: 'out-of-scope' });
  });

  it('reads the branch templates it is given', async () => {
    const custom = repository({ [BRIEF_FILE]: brief({ protected: ['x.ts'] }) }, { branches: ['work/{id}'] });
    custom.git('checkout', '-q', '-b', 'work/1-x');
    expect((await decisions(['x.ts'], custom.root))[0]).toMatchObject({ reason: 'protected' });
    custom.git('checkout', '-q', '-b', 'brief/1-x');
    expect((await decisions(['x.ts'], custom.root))[0]).toMatchObject({ reason: 'no-brief' });
  });

  it('fails closed on a protection spec-brief lists but no glob can read', async () => {
    // Quoted, or YAML reads the "[" as a nested list and spec-brief lists no protection at all.
    const broken = repository({ [BRIEF_FILE]: brief({ protected: ['"src/[db"'] }) });
    expect((await decisions(['README.md', '--brief', '1'], broken.root))[0]).toMatchObject({ verdict: 'deny', reason: 'unreadable-protection' });
  });

  it('fails closed on a protection whose braces expand to no path, which protected every path, and names such a scope pattern', async () => {
    // Quoted, or YAML reads the braces as a mapping. The harness's own
    // reading, as of a spec-brief before 0.15.0, which says nothing of the
    // pattern; a later one says it cannot read it (below).
    const noPath = repository(
      {
        [BRIEF_FILE]: brief({ affected: ['**'], protected: ['"{./,src}"'] }),
        'briefs/002_scope.md': brief({ title: '002 - Scope', affected: ['"{./,src}"', 'docs/**'] }),
      },
      { tools: siblingsSayingNoProblem() },
    );
    const unreadable = '{./,src} (the braces expand to "./", which names no path)';
    expect((await decisions(['README.md', '--brief', '1'], noPath.root))[0]).toMatchObject({
      verdict: 'deny',
      reason: 'unreadable-protection',
      message: `brief 001 protects files with a pattern that cannot be read: ${unreadable}`,
    });
    expect((await decisions(['src/a.ts', 'docs/a.md', '--brief', '2'], noPath.root)).map((d) => [d.path, d.reason, d.because])).toEqual([
      ['src/a.ts', 'out-of-scope', [unreadable]],
      ['docs/a.md', 'in-scope', ['docs/**']],
    ]);
  });

  it('fails closed on a protection too large to compile, in the command and the hook, with spec-core\'s reason', async () => {
    const huge = `${'{a,b}'.repeat(8)}/${'x'.repeat(300)}`;
    const large = repository({ [BRIEF_FILE]: brief({ affected: ['src/**'], protected: [`"${huge}"`] }) }, { tools: siblingsSayingNoProblem() });
    const message = `brief 001 protects files with a pattern that cannot be read: ${huge} (the pattern compiles to more than 65536 states)`;
    expect((await decisions(['src/a.ts', '--brief', '1'], large.root))[0]).toMatchObject({ verdict: 'deny', reason: 'unreadable-protection', message });
    const stdin = JSON.stringify({ cwd: large.root, hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: join(large.root, 'src', 'a.ts') } });
    const hook = await cli(['hook', 'claude'], large.root, { stdin, env: { SPEC_BRIEF: '1' } });
    expect(hook.code).toBe(0);
    const answer = JSON.parse(hook.stdout) as { hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string } };
    expect(answer.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(answer.hookSpecificOutput.permissionDecisionReason).toContain(message);
  });

  it("holds every write in spec-brief's words where the installed spec-brief says it cannot read a protection, and decides by the rest where it says nothing", async () => {
    // A leading "/" roots a protection at the filesystem's root, where it
    // protects no path. spec-brief 0.15.0 and later list it among the
    // brief's problems; an earlier one lists the pattern as written, which
    // the guard reads itself (audit.test.ts, protection-rooted). What the
    // installed one says is read from it, so the test runs at either.
    const rooted = repository({ [BRIEF_FILE]: brief({ affected: ['src/**'], protected: ['/src/db/schema.ts'] }), 'src/db/schema.ts': 'table;\n' });
    const listed = JSON.parse(execFileSync(process.execPath, [SPEC_BRIEF, 'list', '--format', 'json'], { cwd: rooted.root, encoding: 'utf8' })) as { briefs: { problems?: { message: string }[] }[] };
    const problems = listed.briefs[0]?.problems ?? [];
    const [decided] = await decisions(['src/db/schema.ts', '--brief', '1'], rooted.root);
    if (problems.length === 0) expect(decided).toMatchObject({ verdict: 'allow', reason: 'in-scope' });
    else expect(decided).toMatchObject({ verdict: 'deny', reason: 'unreadable-protection', message: expect.stringContaining(`spec-brief cannot read brief 001 whole, so what it protects cannot be told: ${problems[0]?.message}`) });
  });
});
