/**
 * A path through a link, decided as it reads and as the system writes it
 * (ADR-0005, amended 2026-10-24).
 *
 * The hook read a path's `..` before the links in front of it, where Linux
 * and macOS write it after them: `deep/../schema.ts`, `deep` a link to
 * `lib/x`, read as `schema.ts` and was written to `lib/schema.ts`; a path
 * outside the work tree whose `..` leads back into it read as outside; and
 * a link to nothing read as the link and was written to what it names. A
 * path is now decided both ways, and the stricter answer stands. Windows
 * reads the `..` first, as the hook did, so there the two are one.
 *
 * A link to a directory is a junction on Windows, which an account may make
 * without a privilege, and a symbolic link elsewhere; a link to a file, or
 * named from its own directory, is made only where an account may.
 */

import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { outsideEvery, reachedBy, realSpelling, writtenSpelling } from '../../src/fs.js';
import { brief, BRIEF_FILE, cleanup, cli, ignoresCase, parsed, repository, temp, type Captured, type Repository } from './helpers.js';

afterAll(cleanup);

const windows = process.platform === 'win32';

/** A link to a directory, which every account may make. */
function linkTo(target: string, link: string): void {
  symlinkSync(target, link, 'junction');
}

/** A path of names, separated as the system separates them, a `..` kept as written. */
const path = (...names: string[]): string => names.join(sep);

describe('the file a write reaches', () => {
  it('reads a `..` after a link after the link on Linux and macOS, and before it on Windows, where the system writes it', () => {
    const root = realSpelling(temp());
    mkdirSync(join(root, 'lib', 'x'), { recursive: true });
    linkTo(join(root, 'lib', 'x'), join(root, 'deep'));
    const given = path(root, 'deep', '..', 'schema.ts');
    const written = windows ? join(root, 'schema.ts') : join(root, 'lib', 'schema.ts');
    expect(writtenSpelling(given, root)).toBe(written);
    expect(writtenSpelling(path('deep', '..', 'schema.ts'), root)).toBe(written);
    expect(writtenSpelling(path('.', 'deep', '', '..', 'schema.ts'), root)).toBe(written);
    // As the path reads, its `..` is taken first.
    expect(realSpelling(given)).toBe(join(root, 'schema.ts'));
    expect(reachedBy(given, root)).toEqual(windows ? [written] : [join(root, 'schema.ts'), written]);
    expect(reachedBy(path('lib', 'x', 'a.ts'), root)).toEqual([join(root, 'lib', 'x', 'a.ts')]);
    // And the system writes it there.
    writeFileSync(given, 'written');
    expect(readFileSync(written, 'utf8')).toBe('written');
  });

  it('follows a link to nothing to what it names, and a chain of links to its end', () => {
    const root = realSpelling(temp());
    mkdirSync(join(root, 'lib'));
    linkTo(join(root, 'lib', 'gone'), join(root, 'gone'));
    expect(writtenSpelling(join(root, 'gone', 'a.ts'), root)).toBe(join(root, 'lib', 'gone', 'a.ts'));
    expect(realSpelling(join(root, 'gone', 'a.ts'))).toBe(join(root, 'gone', 'a.ts'));
    expect(reachedBy(join(root, 'gone', 'a.ts'), root)).toEqual([join(root, 'gone', 'a.ts'), join(root, 'lib', 'gone', 'a.ts')]);
    linkTo(join(root, 'gone'), join(root, 'again'));
    expect(writtenSpelling(join(root, 'again', 'a.ts'), root)).toBe(join(root, 'lib', 'gone', 'a.ts'));
  });

  it.skipIf(windows)('follows a link named from its own directory, and a link to a file that is not there', () => {
    const root = realSpelling(temp());
    mkdirSync(join(root, 'lib', 'x'), { recursive: true });
    mkdirSync(join(root, 'src'));
    symlinkSync('../lib/x', join(root, 'src', 'up'));
    expect(writtenSpelling(path(root, 'src', 'up', '..', 'a.ts'), root)).toBe(join(root, 'lib', 'a.ts'));
    symlinkSync('../lib/new.sql', join(root, 'src', 'new.sql'));
    expect(writtenSpelling(join(root, 'src', 'new.sql'), root)).toBe(join(root, 'lib', 'new.sql'));
    writeFileSync(join(root, 'src', 'new.sql'), 'made');
    expect(readFileSync(join(root, 'lib', 'new.sql'), 'utf8')).toBe('made');
  });

  it('follows a symbolic link to a file that is not there to what it names, which a write makes, where the account may make one', () => {
    const root = realSpelling(temp());
    mkdirSync(join(root, 'lib'));
    try {
      symlinkSync(join(root, 'lib', 'new.sql'), join(root, 'dangling'), 'file');
    } catch (error) {
      // Windows lets an account make a symbolic link only with a privilege it
      // may not have; GitHub's Windows runner has it.
      expect((error as NodeJS.ErrnoException).code).toBe('EPERM');
      return;
    }
    expect(writtenSpelling(join(root, 'dangling'), root)).toBe(join(root, 'lib', 'new.sql'));
    expect(reachedBy(join(root, 'dangling'), root)).toEqual([join(root, 'dangling'), join(root, 'lib', 'new.sql')]);
    writeFileSync(join(root, 'dangling'), 'made');
    expect(readFileSync(join(root, 'lib', 'new.sql'), 'utf8')).toBe('made');
  });

  it.skipIf(windows)('reads a backslash as a character of a name on Linux and macOS', () => {
    const root = realSpelling(temp());
    mkdirSync(join(root, 'a\\b'));
    expect(writtenSpelling(join(root, 'a\\b', 'c.ts'), root)).toBe(join(root, 'a\\b', 'c.ts'));
  });

  it('reaches no file through a loop of links, or through more links than Linux follows', () => {
    const root = realSpelling(temp());
    linkTo(join(root, 'b'), join(root, 'a'));
    linkTo(join(root, 'a'), join(root, 'b'));
    expect(writtenSpelling(join(root, 'a', 'x.ts'), root)).toBeNull();
    // Reaching none, the path is read as it reads.
    expect(reachedBy(join(root, 'a', 'x.ts'), root)).toEqual([realSpelling(join(root, 'a', 'x.ts'))]);
    mkdirSync(join(root, 'end'));
    for (let link = 1; link <= 41; link += 1) linkTo(join(root, link === 41 ? 'end' : `l${link + 1}`), join(root, `l${link}`));
    expect(writtenSpelling(join(root, 'l2', 'x.ts'), root)).toBe(join(root, 'end', 'x.ts'));
    expect(writtenSpelling(join(root, 'l1', 'x.ts'), root)).toBeNull();
  });

  it('spells what it reaches in the case its entries have, on a filesystem that ignores case', () => {
    const root = realSpelling(temp());
    mkdirSync(join(root, 'Lib', 'X'), { recursive: true });
    linkTo(join(root, 'Lib', 'X'), join(root, 'deep'));
    if (!ignoresCase(root)) return; // Here LIB and Lib are two directories, and there is nothing to correct.
    expect(writtenSpelling(join(root, 'LIB', 'x', 'new.ts'), root)).toBe(join(root, 'Lib', 'X', 'new.ts'));
    expect(writtenSpelling(join(root, 'DEEP', 'new.ts'), root)).toBe(join(root, 'Lib', 'X', 'new.ts'));
  });
});

const FILES = {
  [BRIEF_FILE]: brief({ affected: ['src/app/**'], protected: ['src/db/**', 'lib/**'] }),
  'src/db/schema.ts': 'table;\n',
  'src/app/a.ts': 'a;\n',
  'src/app/sub/keep.ts': 'k;\n',
  'lib/schema.ts': 'lib;\n',
  'lib/x/keep.ts': 'x;\n',
  'README.md': 'r\n',
};

/** A project on brief 001's branch, its brief protecting `src/db/**` and `lib/**`, with `deep` a link to `lib/x` and `applink` one to `src/app`. */
function project(): Repository {
  const repo = repository(FILES);
  repo.git('checkout', '-q', '-b', 'brief/001-rotate');
  linkTo(join(repo.root, 'lib', 'x'), join(repo.root, 'deep'));
  linkTo(join(repo.root, 'src', 'app'), join(repo.root, 'applink'));
  return repo;
}

const ask = (repo: Repository, event: string, file: string, cwd = repo.root): Promise<Captured> =>
  cli(['hook', 'claude'], repo.root, {
    stdin: JSON.stringify({ session_id: 's', tool_use_id: 'toolu_1', cwd, hook_event_name: event, tool_name: existsSync(file) ? 'Edit' : 'Write', tool_input: { file_path: file, old_string: 'a', new_string: 'b', content: 'x' } }),
    env: { CLAUDE_PROJECT_DIR: repo.root },
  });

/** The decision before a write: `deny` or `ask` and its reason, or `null` where the hook says nothing. */
async function before(repo: Repository, file: string): Promise<{ readonly decision: string; readonly reason: string } | null> {
  const answer = await ask(repo, 'PreToolUse', file);
  expect({ code: answer.code, stderr: answer.stderr }, file).toEqual({ code: 0, stderr: '' });
  if (answer.stdout === '') return null;
  const { hookSpecificOutput } = JSON.parse(answer.stdout) as { hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string } };
  return { decision: hookSpecificOutput.permissionDecision, reason: hookSpecificOutput.permissionDecisionReason };
}

/** What the server's `check_path` answers of the paths, in its text. */
async function checkPath(repo: Repository, paths: readonly string[]): Promise<string> {
  const lines = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'check_path', arguments: { paths } } },
  ];
  const served = await cli(['mcp'], repo.root, { stdin: lines.map((line) => JSON.stringify(line)).join('\n'), env: { CLAUDE_PROJECT_DIR: repo.root } });
  const answer = served.stdout
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as { id?: number; result?: { content: { text: string }[] } })
    .find((message) => message.id === 2);
  return answer!.result!.content.map((part) => part.text).join('\n');
}

const REFUSED = (given: string, written: string, pattern: string): string =>
  `spec-harness: ${given} is written to ${written} through a link: brief 001 does not empower this round to change ${written} (protectedFiles: ${pattern}). Next: if the round cannot be done without it, stop and ask for a ruling: spec-harness escalate --path <file> --reason <why>, or the request_escalation tool.`;

describe('a write through a link', () => {
  it.skipIf(windows)('is refused where the system writes it to a file the brief protects, though it reads as one the round may write', async () => {
    const repo = project();
    for (const [given, written] of [
      [path(repo.root, 'deep', '..', 'schema.ts'), 'lib/schema.ts'],
      [path(repo.root, 'deep', '..', 'fresh.ts'), 'lib/fresh.ts'],
      [path(repo.root, 'deep', '..', 'src', 'app', 'a.ts'), 'lib/src/app/a.ts'],
    ] as const) {
      expect(await before(repo, given), given).toEqual({ decision: 'deny', reason: REFUSED(given, written, 'lib/**') });
    }
    // guard and the server say the same of it.
    const given = path(repo.root, 'deep', '..', 'schema.ts');
    const guarded = await cli(['guard', given, '--format', 'json'], repo.root);
    expect(guarded.code).toBe(1);
    expect(parsed<{ decisions: { path: string; verdict: string }[] }>(guarded).decisions.map((decision) => [decision.path, decision.verdict])).toEqual([['lib/schema.ts', 'deny']]);
    expect(await checkPath(repo, [path('deep', '..', 'schema.ts')])).toMatch(/^deny: deep\/\.\.\/schema\.ts is written to lib\/schema\.ts through a link: brief 001 does not empower/);
    // The system writes it where it was refused.
    writeFileSync(given, 'changed;\n');
    expect(repo.read('lib/schema.ts')).toBe('changed;\n');
  });

  it.skipIf(!windows)('is decided as it reads on Windows, which writes it there', async () => {
    const repo = project();
    const given = path(repo.root, 'deep', '..', 'src', 'app', 'a.ts');
    expect(await before(repo, given)).toBeNull();
    expect(await before(repo, path(repo.root, 'deep', '..', 'schema.ts'))).toBeNull();
    expect((await cli(['guard', given], repo.root)).code).toBe(0);
    writeFileSync(given, 'changed;\n');
    expect(repo.read('src/app/a.ts')).toBe('changed;\n');
  });

  it('passes where it reads as and is written to a file in the scope, and the write after it is decided again', async () => {
    const repo = project();
    expect(await before(repo, join(repo.root, 'applink', 'new.ts'))).toBeNull();
    expect(await before(repo, path(repo.root, 'applink', 'sub', '..', 'a.ts'))).toBeNull();
    expect(await ask(repo, 'PostToolUse', join(repo.root, 'applink', 'new.ts'))).toEqual({ code: 0, stdout: '', stderr: '' });
    expect((await cli(['guard', join(repo.root, 'applink', 'new.ts')], repo.root)).stdout).toBe("ok       src/app/new.ts is in brief 001's scope (src/app/**)\n");
    // A file the brief protects is refused through a link as it is without one.
    expect(await before(repo, join(repo.root, 'deep', 'keep.ts'))).toMatchObject({ decision: 'deny', reason: expect.stringContaining('change lib/x/keep.ts (protectedFiles: lib/**)') });
  });

  it.skipIf(windows)('is refused as it reads where that is a file the brief protects and the system writes it into the scope', async () => {
    const repo = project();
    symlinkSync(join(repo.root, 'src', 'app', 'sub'), join(repo.root, 'lib', 'up'));
    expect(await before(repo, path(repo.root, 'lib', 'up', '..', 'a.ts'))).toEqual({
      decision: 'deny',
      reason: 'spec-harness: brief 001 does not empower this round to change lib/a.ts (protectedFiles: lib/**). Next: if the round cannot be done without it, stop and ask for a ruling: spec-harness escalate --path <file> --reason <why>, or the request_escalation tool.',
    });
  });

  it.skipIf(windows)('is refused where it reads as outside the work tree and the system writes it into it, and passes where both are outside', async () => {
    const repo = project();
    const outside = realSpelling(temp());
    symlinkSync(join(repo.root, 'src', 'app'), join(outside, 'into'));
    mkdirSync(join(outside, 'sub'));
    const given = path(outside, 'into', '..', 'db', 'schema.ts');
    expect(await before(repo, given)).toEqual({ decision: 'deny', reason: REFUSED(given, 'src/db/schema.ts', 'src/db/**') });
    expect(await before(repo, path(outside, 'sub', '..', 'notes.md'))).toBeNull();
    expect(await ask(repo, 'PostToolUse', path(outside, 'sub', '..', 'notes.md'))).toEqual({ code: 0, stdout: '', stderr: '' });
  });

  it.skipIf(windows)('is refused where it is a link to nothing the brief protects, and passes where what it names is in the scope', async () => {
    const repo = project();
    symlinkSync(join(repo.root, 'src', 'db', 'new.sql'), join(repo.root, 'newlink'));
    symlinkSync(join(repo.root, 'src', 'app', 'new.ts'), join(repo.root, 'applink.ts'));
    expect(await before(repo, join(repo.root, 'newlink'))).toEqual({ decision: 'deny', reason: REFUSED(join(repo.root, 'newlink'), 'src/db/new.sql', 'src/db/**') });
    expect(await before(repo, join(repo.root, 'applink.ts'))).toBeNull();
  });

  it.skipIf(windows)('is held where a brief holds every write and a link outside the work tree leads into it, where a file outside passes', async () => {
    const repo = repository(FILES);
    repo.git('checkout', '-q', '-b', 'brief/999-nowhere');
    const outside = realSpelling(temp());
    symlinkSync(join(repo.root, 'src', 'db', 'new.sql'), join(outside, 'dangling'));
    const answer = await ask(repo, 'PreToolUse', join(outside, 'dangling'));
    expect({ code: answer.code, stdout: answer.stdout }).toEqual({ code: 2, stdout: '' });
    expect(answer.stderr).toBe('spec-harness: the branch names brief 999, and spec-brief knows no such brief. Fix the brief or the branch before writing.\n');
    expect(await ask(repo, 'PreToolUse', join(outside, 'notes.md'))).toEqual({ code: 0, stdout: '', stderr: '' });
    const [top, common] = [repo.git('rev-parse', '--show-toplevel'), repo.git('rev-parse', '--path-format=absolute', '--git-common-dir')];
    expect(outsideEvery([join(outside, 'dangling')], top, common, repo.root)).toBe(false);
    expect(outsideEvery([join(outside, 'notes.md')], top, common, repo.root)).toBe(true);
  });

  it.skipIf(windows)('is decided by the work tree the system writes it into, where a link leads from one work tree into another', async () => {
    const repo = repository(FILES);
    const worktree = join(repo.root, '.claude', 'worktrees', 'b');
    repo.git('worktree', 'add', '-q', '-b', 'brief/001-b', worktree);
    // The project is on main, which names no brief; the worktree's branch names brief 001.
    symlinkSync(join(worktree, 'src', 'app'), join(repo.root, 'into-b'));
    const given = path(repo.root, 'into-b', '..', 'db', 'schema.ts');
    const answer = await before(repo, given);
    expect(answer).toMatchObject({ decision: 'deny' });
    expect(answer!.reason).toContain('brief 001 does not empower this round to change src/db/schema.ts (protectedFiles: src/db/**)');
    // As it reads, it is the project's, which no brief governs.
    const scoped = path(repo.root, 'into-b', '..', 'b.ts');
    expect(await before(repo, scoped)).toBeNull();
    // After a write the worktree's brief warns of the file the link wrote,
    // though the project's configuration has nothing to say after one.
    repo.write('.spec-harness.json', `${JSON.stringify({ ...JSON.parse(repo.read('.spec-harness.json')), outOfScope: 'ask' }, null, 2)}\n`);
    const after = await cli(['hook', 'claude'], repo.root, {
      stdin: JSON.stringify({ session_id: 's', tool_use_id: 'toolu_after', cwd: repo.root, hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: scoped, content: 'x' } }),
      env: { CLAUDE_PROJECT_DIR: repo.root },
    });
    expect(after.code).toBe(0);
    expect(JSON.parse(after.stdout)).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: `spec-harness: ${scoped} is written to src/b.ts through a link: src/b.ts is outside brief 001's scope, which covers src/app/**. Next: if the round needs it, say so in ${BRIEF_FILE} and add it to affectedFiles; the archive reports every file outside the scope that the round commits.`,
      },
    });
  });
});
