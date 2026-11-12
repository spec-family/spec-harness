/**
 * A configuration that does not load, and the one write it lets through
 * (ADR-0005, amended 2026-10-19).
 *
 * Every write was held while `.spec-harness.json` did not load, the one
 * that mends it among them, so a session could not mend a typo in it. A
 * write to that file itself, and to nothing else, now goes on with the line
 * that says why every other write is held. What a write names is read as
 * the hook reads a path to decide it, and as the disk reads it to write: a
 * path that only reads like the file, a link to it, a second name of it and
 * a file of another work tree are each held as before.
 */

import { linkSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { brief, BRIEF_FILE, cleanup, cli, ignoresCase, repository, siblings, temp, type Repository } from './helpers.js';

afterAll(cleanup);

const FILES = { [BRIEF_FILE]: brief({ affected: ['src/app/**'], protected: ['src/db/**', 'lib/**'] }), 'src/db/schema.ts': 'table;\n', 'src/app/a.ts': 'a;\n', 'lib/x/keep.ts': 'k;\n' };

/** What each configuration that does not load is said to be, as every command says it. */
const BROKEN: readonly (readonly [string, string])[] = [
  ['{ "outofscope": "warn" }\n', '.spec-harness.json: unknown key "outofscope"; the keys are $schema, branches, outOfScope, base, rulings, dependencies, context, assertions, probes, tools, turnReport, protectHarness'],
  ['{ "base": "main",\n', '.spec-harness.json is not valid JSON: '],
  ['{ "outOfScope": "never" }\n', '.spec-harness.json: "outOfScope" must be "warn", "ask" or "deny"'],
];

/** A project on its brief's branch, with the siblings named in a configuration that loads. */
function project(): Repository {
  const repo = repository(FILES);
  repo.git('checkout', '-q', '-b', 'brief/001-rotate');
  return repo;
}

type Fields = Readonly<Record<string, string>>;

/** The question Claude Code asks before a write, or after it, of a tool's input. */
function question(repo: Repository, input: Fields, event = 'PreToolUse', tool = 'Edit', cwd = repo.root): string {
  return JSON.stringify({ session_id: 's', tool_use_id: 'toolu_1', cwd, hook_event_name: event, tool_name: tool, tool_input: { old_string: 'a', new_string: 'b', ...input } });
}

const ask = (repo: Repository, input: Fields, event?: string, tool?: string, cwd?: string) =>
  cli(['hook', 'claude'], repo.root, { stdin: question(repo, input, event, tool, cwd), env: { CLAUDE_PROJECT_DIR: repo.root } });

/** The answer that lets the write to the configuration through: no decision, and the line, to the person and to Claude. */
function mended(said: string, file: string) {
  const text = `spec-harness: ${said}, so every other write is held until it loads; this write, to ${file} itself, is not checked`;
  return { code: 0, stderr: '', stdout: `${JSON.stringify({ systemMessage: text, hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: text } })}\n` };
}

/** What a write that is held is answered: exit 2, and the configuration's own words, as before. */
async function held(result: Promise<{ code: number; stdout: string; stderr: string }>, said: string, where: string): Promise<void> {
  const answer = await result;
  expect({ code: answer.code, stdout: answer.stdout }, where).toEqual({ code: 2, stdout: '' });
  expect(answer.stderr.startsWith(`spec-harness: ${said}`), `${where}: ${answer.stderr}`).toBe(true);
}

describe('a configuration that does not load', () => {
  it('lets a write to the configuration file itself through, by every tool that writes one, with the line that says why every other write is held', async () => {
    for (const [text, said] of BROKEN) {
      const repo = project();
      const file = join(repo.root, '.spec-harness.json');
      writeFileSync(file, text);
      const answer = await ask(repo, { file_path: file });
      // The parser's words for a text that is no JSON end the message, and are Node's.
      const full = said.endsWith(': ') ? (JSON.parse(answer.stdout) as { systemMessage: string }).systemMessage.slice('spec-harness: '.length).split(', so every other write')[0]! : said;
      expect(full.startsWith(said), full).toBe(true);
      expect(answer, text).toEqual(mended(full, file));
      // Never a decision: the person's own permission prompt stands, as for any write the guard passes.
      expect(answer.stdout).not.toContain('permissionDecision');
      expect(await ask(repo, { file_path: file, content: '{}' }, 'PreToolUse', 'Write'), text).toEqual(mended(full, file));
      expect(await ask(repo, { notebook_path: file }, 'PreToolUse', 'NotebookEdit'), text).toEqual(mended(full, file));
      // Read from the question's directory, as the hook reads a relative path.
      expect(await ask(repo, { file_path: '.spec-harness.json' }), text).toEqual(mended(full, file));
      expect(await ask(repo, { file_path: join(repo.root, 'src', '..', '.spec-harness.json') }), text).toEqual(mended(full, file));
    }
  });

  it('holds every other write as before: one that only reads like the file, one the brief protects, one in its scope, and a call that names the file and another', async () => {
    for (const [text, said] of BROKEN) {
      const repo = project();
      const file = join(repo.root, '.spec-harness.json');
      writeFileSync(file, text);
      repo.write('src/.spec-harness.json', '{}\n');
      repo.write('.spec-harness.json.bak', '{}\n');
      for (const path of [
        join(repo.root, 'src', '.spec-harness.json'),
        join(repo.root, '.spec-harness.json.bak'),
        join(repo.root, '.spec-harness'),
        join(repo.root, 'src', 'db', 'schema.ts'),
        join(repo.root, 'src', 'app', 'a.ts'),
        join(repo.root, 'README.md'),
        // A relative path is read from the question's directory, and src/ holds no configuration.
        '.spec-harness.json',
      ]) {
        const cwd = path === '.spec-harness.json' ? join(repo.root, 'src', 'app') : repo.root;
        await held(ask(repo, { file_path: path }, 'PreToolUse', 'Edit', cwd), said, `${text} ${path}`);
      }
      // One call that names the file and another file is a write to both.
      await held(ask(repo, { file_path: file, path: join(repo.root, 'src', 'db', 'schema.ts') }), said, `${text} two paths`);
      await held(ask(repo, { file_path: file, notebook_path: join(repo.root, 'src', 'app', 'a.ts') }), said, `${text} two paths`);
    }
  });

  it('is said after the write as before, and the write that mends it loads: the next write is decided under what it holds', async () => {
    const repo = project();
    const file = join(repo.root, '.spec-harness.json');
    const [[text, said]] = BROKEN as [readonly [string, string]];
    writeFileSync(file, text);
    // After a write there is nothing to hold, and the hook says to Claude that the file still does not load.
    await held(ask(repo, { file_path: file }, 'PostToolUse'), said, 'after');
    expect(await ask(repo, { file_path: file })).toEqual(mended(said, file));
    // The write that mends it.
    writeFileSync(file, `${JSON.stringify({ base: 'main', outOfScope: 'deny', tools: siblings() })}\n`);
    expect(await ask(repo, { file_path: file }, 'PostToolUse')).toEqual({ code: 0, stdout: '', stderr: '' });
    const refused = await ask(repo, { file_path: join(repo.root, 'src', 'db', 'schema.ts') });
    expect(JSON.parse(refused.stdout)).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny' } });
    // What it now says is in force: a write outside the scope is refused, and so is the file itself, as any file outside it.
    expect(JSON.parse((await ask(repo, { file_path: join(repo.root, 'README.md') })).stdout)).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny' } });
    expect(JSON.parse((await ask(repo, { file_path: file })).stdout)).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny' } });
  });

  it('holds a write to the file under a second name, and to a file of another name, where the configuration is one name of two', async () => {
    const repo = project();
    const file = join(repo.root, '.spec-harness.json');
    const [[text, said]] = BROKEN as [readonly [string, string]];
    writeFileSync(file, text);
    linkSync(file, join(repo.root, 'second.json'));
    // A write to either name writes both, the other name's file among them.
    await held(ask(repo, { file_path: file }), said, 'the configuration, one of two names');
    await held(ask(repo, { file_path: join(repo.root, 'second.json') }), said, 'its second name');
    rmSync(join(repo.root, 'second.json'));
    expect(await ask(repo, { file_path: file })).toEqual(mended(said, file));
    // A configuration that is a second name of the protected file does not load, and a write to it is one to the protected file.
    rmSync(file);
    linkSync(join(repo.root, 'src', 'db', 'schema.ts'), file);
    await held(ask(repo, { file_path: file }), '.spec-harness.json is not valid JSON: ', 'a second name of the protected file');
  });

  it('holds a write where the configuration is a directory, to it and in it', async () => {
    const repo = project();
    const file = join(repo.root, '.spec-harness.json');
    rmSync(file);
    mkdirSync(file);
    const said = '.spec-harness.json is a directory, not a configuration file';
    await held(ask(repo, { file_path: file }), said, 'the directory');
    await held(ask(repo, { file_path: join(file, 'x.json') }), said, 'a file in it');
  });

  it('reads the name as the filesystem holding it reads one: in another case the same file where it ignores case, and another where it does not', async () => {
    const repo = project();
    const file = join(repo.root, '.spec-harness.json');
    const [[text, said]] = BROKEN as [readonly [string, string]];
    writeFileSync(file, text);
    const upper = join(repo.root, '.SPEC-HARNESS.JSON');
    if (ignoresCase(repo.root)) expect(await ask(repo, { file_path: upper })).toEqual(mended(said, file));
    else await held(ask(repo, { file_path: upper }), said, 'in upper case');
  });

  // Windows lets an account make a link to a file only with a privilege a test does not ask for.
  it.skipIf(process.platform === 'win32')('holds a write through a link: to the file, the file a link itself, and a path whose `..` reads otherwise on the disk than as written', async () => {
    const repo = project();
    const file = join(repo.root, '.spec-harness.json');
    const [[text, said]] = BROKEN as [readonly [string, string]];
    writeFileSync(file, text);
    symlinkSync(file, join(repo.root, 'cfg-link.json'));
    symlinkSync('.spec-harness.json', join(repo.root, 'cfg-relative.json'));
    await held(ask(repo, { file_path: join(repo.root, 'cfg-link.json') }), said, 'a link to it');
    await held(ask(repo, { file_path: join(repo.root, 'cfg-relative.json') }), said, 'a relative link to it');
    // Written `deep/..`, the root; on the disk, lib/, where a protected file of the name is.
    symlinkSync(join(repo.root, 'lib', 'x'), join(repo.root, 'deep'));
    repo.write('lib/.spec-harness.json', 'protected\n');
    await held(ask(repo, { file_path: `${repo.root}/deep/../.spec-harness.json` }), said, 'deep/..');
    // Written `a/up/..`, a/; on the disk, the root: the file, but not as the hook reads the path.
    mkdirSync(join(repo.root, 'a'));
    symlinkSync(join(repo.root, 'src'), join(repo.root, 'a', 'up'));
    await held(ask(repo, { file_path: `${repo.root}/a/up/../.spec-harness.json` }), said, 'a/up/..');
    // Both ways the root: the file.
    symlinkSync(join(repo.root, 'src'), join(repo.root, 'src-link'));
    expect(await ask(repo, { file_path: `${repo.root}/src-link/../.spec-harness.json` })).toEqual(mended(said, file));
    // The configuration a link, read through it: to the protected file, a write to which is held; and to a file outside
    // every work tree, which is no file of the repository's, and is decided as one outside it is (outside.test.ts).
    rmSync(file);
    symlinkSync(join(repo.root, 'src', 'db', 'schema.ts'), file);
    await held(ask(repo, { file_path: file }), '.spec-harness.json is not valid JSON: ', 'a link to the protected file');
    rmSync(file);
    const elsewhere = join(temp(), 'config.json');
    writeFileSync(elsewhere, text);
    symlinkSync(elsewhere, file);
    expect(await ask(repo, { file_path: file })).toEqual({ code: 0, stdout: '', stderr: '' });
  });

  it('lets through the configuration of the work tree a write is decided in, and holds a write to that of another work tree', async () => {
    const repo = project();
    const tree = join(repo.root, '.claude', 'worktrees', 'w');
    repo.git('worktree', 'add', '-q', '-b', 'brief/001-w', tree);
    const own = join(repo.root, '.spec-harness.json');
    const theirs = join(tree, '.spec-harness.json');
    const [[text, said]] = BROKEN as [readonly [string, string]];
    // The project's does not load: its own file goes through, from the project or from the worktree, and the worktree's is held.
    writeFileSync(own, text);
    expect(await ask(repo, { file_path: own })).toEqual(mended(said, own));
    expect(await ask(repo, { file_path: own }, 'PreToolUse', 'Edit', tree)).toEqual(mended(said, own));
    await held(ask(repo, { file_path: theirs }), said, "the worktree's, from the project");
    await held(ask(repo, { file_path: theirs }, 'PreToolUse', 'Edit', tree), said, "the worktree's, from the worktree");
    // The worktree's does not load, where a write of its files is decided: its own file goes through, and its other files are held.
    writeFileSync(own, `${JSON.stringify({ base: 'main', tools: siblings() })}\n`);
    writeFileSync(theirs, text);
    expect(await ask(repo, { file_path: theirs }, 'PreToolUse', 'Edit', tree)).toEqual(mended(said, theirs));
    await held(ask(repo, { file_path: join(tree, 'src', 'db', 'schema.ts') }, 'PreToolUse', 'Edit', tree), `cannot check this write: ${said}`, "the worktree's protected file");
    // From the project as well, where the work tree that holds a path decides it.
    expect(await ask(repo, { file_path: theirs })).toEqual(mended(said, theirs));
    await held(ask(repo, { file_path: join(tree, 'src', 'db', 'schema.ts') }), `cannot check this write: ${said}`, "the worktree's protected file, from the project");
    await held(ask(repo, { file_path: theirs, notebook_path: join(repo.root, 'src', 'app', 'a.ts') }), `cannot check this write: ${said}`, "the worktree's file and the project's, in one call");
    // The project's own files are decided by the project's configuration, which loads.
    expect(JSON.parse((await ask(repo, { file_path: join(repo.root, 'src', 'db', 'schema.ts') }, 'PreToolUse', 'Edit', tree)).stdout)).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny' } });
  });

  it('says so as a session starts: every write is held but one to the file itself', async () => {
    const repo = project();
    const file = join(repo.root, '.spec-harness.json');
    const [[text, said]] = BROKEN as [readonly [string, string]];
    writeFileSync(file, text);
    const start = JSON.stringify({ session_id: 's', cwd: repo.root, hook_event_name: 'SessionStart', source: 'startup' });
    const line = `spec-harness: ${said}, so every write of this session is held until it is mended, but one to a file outside every work tree of the repository and one to ${file} itself, which is not checked; spec-harness doctor says more`;
    expect(await cli(['hook', 'claude'], repo.root, { stdin: start, env: { CLAUDE_PROJECT_DIR: repo.root } })).toEqual({
      code: 0,
      stderr: '',
      stdout: `${JSON.stringify({ systemMessage: line, hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: line } })}\n`,
    });
    // A directory there no write reaches, so the line says only the writes outside every work tree, which go ahead.
    rmSync(file);
    mkdirSync(file);
    const directory = 'spec-harness: .spec-harness.json is a directory, not a configuration file, so every write of this session is held until it is mended, but one to a file outside every work tree of the repository; spec-harness doctor says more';
    expect(JSON.parse((await cli(['hook', 'claude'], repo.root, { stdin: start, env: { CLAUDE_PROJECT_DIR: repo.root } })).stdout)).toMatchObject({ systemMessage: directory });
  });
});
