/**
 * spec-brief's answer given again (ADR-0002, ADR-0003, amended 2026-10-19).
 *
 * The hook asks spec-brief for the briefs before every write on a brief's
 * branch, and a start of Node is most of what that costs on Windows. A
 * spec-brief whose `list` names everything its answer was read from is
 * asked once in a session, and its answer is given again to the session's
 * later runs while every input reads as listed. Each test runs the command
 * line on the question Claude Code asks, with a spec-brief of the test's
 * own that lists the briefs as spec-brief does, names what it read in the
 * shape spec-brief's `inputs` has, and counts its starts.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { answerKey } from '../../src/siblings.js';
import { brief, BRIEF_FILE, cleanup, cli, install, repository, SPEC_BRIEF, temp, type Repository } from './helpers.js';

afterAll(cleanup);

const FILES = {
  [BRIEF_FILE]: brief({ affected: ['src/auth/**'], protected: ['src/db/**'] }),
  '.spec-brief.json': '{}\n',
  '.gitignore': 'node_modules/\n',
  'src/db/schema.ts': 'table;\n',
  'src/auth/a.ts': 'a;\n',
  'README.md': '# x\n',
  // Names whose order as a directory lists them is not their order as text.
  'briefs/README.md': '# briefs\n',
  'briefs/a-note.md': 'a\n',
  'briefs/B-note.md': 'b\n',
};

/**
 * A spec-brief that lists the briefs in `briefs/` from the lines of their
 * front matter, names what it read as spec-brief's `inputs` does, and
 * writes a line to `starts` beside its manifest each time it is started.
 * `fake.json` there says how it answers: `inputs` false prints none, `keep`
 * the value it prints, `tool` the version it says it is, `git` whether it
 * names the index and the ignore files, `bad` a digest that is not one,
 * `absent` more paths it names as not there, `missing` directories it
 * names as not there, and `exit` the code it exits with. It names a directory's files in reverse order, as nothing requires
 * them in one.
 */
const FAKE = [
  "'use strict';",
  "const { createHash } = require('node:crypto');",
  "const { appendFileSync, existsSync, readdirSync, readFileSync, statSync } = require('node:fs');",
  "const { isAbsolute, join, resolve } = require('node:path');",
  "const here = join(__dirname, '..');",
  "const settings = JSON.parse(readFileSync(join(here, 'fake.json'), 'utf8'));",
  "const version = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8')).version;",
  "appendFileSync(join(here, 'starts'), 'started\\n');",
  'const root = process.cwd();',
  "const digest = (path) => (existsSync(path) && statSync(path).isFile() ? createHash('sha256').update(readFileSync(path)).digest('hex') : null);",
  "if (existsSync(join(root, '.spec-brief.json')) && !statSync(join(root, '.spec-brief.json')).isFile()) { process.stderr.write('.spec-brief.json is a directory\\n'); process.exit(2); }",
  "if (!existsSync(join(root, 'briefs'))) { process.stderr.write('briefs/ does not exist\\n'); process.exit(2); }",
  "const entries = readdirSync(join(root, 'briefs'), { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name).sort();",
  "const names = entries.filter((name) => name.endsWith('.md') && name[0] >= '0' && name[0] <= '9');",
  'const field = (text, key) => {',
  "  const line = text.split('\\n').find((each) => each.startsWith(key + ': '));",
  '  return line === undefined ? null : line.slice(key.length + 2);',
  '};',
  'const list = (text, key) => {',
  '  const value = field(text, key);',
  "  return value === null ? [] : value.slice(1, -1).split(',').map((each) => each.trim()).filter((each) => each !== '');",
  '};',
  'const briefs = names.map((name) => {',
  "  const text = readFileSync(join(root, 'briefs', name), 'utf8');",
  "  return { id: name.split('_')[0], file: 'briefs/' + name, title: null, phase: 'live', status: field(text, 'status'), type: null, wave: null, dependsOn: [], affectedFiles: list(text, 'affectedFiles'), protectedFiles: list(text, 'protectedFiles'), tasks: { total: 0, checked: 0 }, ready: true, waitingOn: [], problems: [] };",
  '});',
  "const files = ['.spec-brief.json', 'spec-brief.json', ...names.map((name) => 'briefs/' + name)].map((path) => ({ path, sha256: digest(join(root, path)) }));",
  "if (settings.bad === true) files[0].sha256 = 'not a digest';",
  'let git = null;',
  'if (settings.git === true) {',
  "  const dotGit = join(root, '.git');",
  "  const gitDir = statSync(dotGit).isFile() ? resolve(root, readFileSync(dotGit, 'utf8').trim().slice('gitdir: '.length)) : dotGit;",
  "  const common = existsSync(join(gitDir, 'commondir')) ? resolve(gitDir, readFileSync(join(gitDir, 'commondir'), 'utf8').trim()) : gitDir;",
  "  const exclude = join(common, 'info', 'exclude');",
  "  git = { index: digest(join(gitDir, 'index')), ignores: [{ path: '.gitignore', sha256: digest(join(root, '.gitignore')) }, { path: exclude.split('\\\\').join('/'), sha256: digest(exclude) }] };",
  '}',
  "for (const path of settings.absent ?? []) files.push({ path, sha256: null });",
  "const missing = (settings.missing ?? []).map((path) => ({ path, entries: null }));",
  "const inputs = { keep: settings.keep ?? true, tool: settings.tool ?? version, files: settings.empty === true ? [] : files, directories: settings.empty === true ? [] : [{ path: 'briefs', entries: [...entries].reverse() }, ...missing], git };",
  "const document = { tool: 'spec-brief', version, schemaVersion: 2, command: 'list', ok: true, briefs, sections: {}, ...(settings.inputs === false ? {} : { inputs }) };",
  "process.stdout.write(JSON.stringify(document, null, 2) + '\\n');",
  'process.exitCode = settings.exit ?? 0;',
  '',
].join('\n');

interface Fake {
  readonly inputs?: boolean;
  readonly keep?: unknown;
  readonly tool?: string;
  readonly git?: boolean;
  readonly bad?: boolean;
  readonly empty?: boolean;
  readonly absent?: readonly string[];
  readonly missing?: readonly string[];
  readonly exit?: number;
}

function spec(root: string): string {
  return join(root, 'node_modules', '@spec-family', 'spec-brief');
}

/** The test's spec-brief, installed into `root` at `version`, answering as `fake` says. */
function installFake(root: string, fake: Fake = {}, version = '0.12.0'): void {
  mkdirSync(join(spec(root), 'bin'), { recursive: true });
  writeFileSync(join(spec(root), 'package.json'), `${JSON.stringify({ name: '@spec-family/spec-brief', version })}\n`);
  writeFileSync(join(spec(root), 'bin', 'spec-brief.js'), FAKE);
  writeFileSync(join(spec(root), 'fake.json'), `${JSON.stringify(fake)}\n`);
}

/** How many times the test's spec-brief in `root` was started. */
function starts(root: string): number {
  const file = join(spec(root), 'starts');
  return existsSync(file) ? readFileSync(file, 'utf8').split('\n').length - 1 : 0;
}

/** A project on a brief's branch with the test's spec-brief installed and no configuration of the harness's. */
function project(fake: Fake = {}, files: Readonly<Record<string, string>> = FILES): Repository {
  const repo = repository(files, null);
  installFake(repo.root, fake);
  repo.git('checkout', '-q', '-b', 'brief/001-rotate');
  return repo;
}

let calls = 0;

/** Claude Code's question before a write of `path`, in `session`, from `cwd`. */
function question(repo: Repository, path: string, session: string | null, cwd = repo.root): string {
  return JSON.stringify({ ...(session === null ? {} : { session_id: session }), tool_use_id: `toolu_${(calls += 1)}`, cwd, hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: join(repo.root, ...path.split('/')), old_string: 'a', new_string: 'b' } });
}

/** The hook before a write of `path`, from `cwd` in a session started in `project`, and whether it refused it. */
async function before(repo: Repository, path: string, session: string | null = 'session-1', cwd = repo.root, project = repo.root): Promise<'refused' | 'nothing'> {
  const run = await cli(['hook', 'claude'], project, { stdin: question(repo, path, session, cwd), env: { CLAUDE_PROJECT_DIR: project } });
  expect(run.code, run.stderr).toBe(0);
  expect(run.stderr).toBe('');
  if (run.stdout === '') return 'nothing';
  expect(JSON.parse(run.stdout)).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny' } });
  return 'refused';
}

const answers = (repo: Repository): string[] => {
  const directory = join(repo.root, '.git', 'spec-harness', 'answers');
  return existsSync(directory) ? readdirSync(directory).sort() : [];
};

describe("spec-brief's answer, kept for a session", () => {
  it('is given again to the session while every input reads as listed, with spec-brief started once', async () => {
    const repo = project();
    const start = await cli(['hook', 'claude'], repo.root, { stdin: JSON.stringify({ session_id: 'session-1', cwd: repo.root, hook_event_name: 'SessionStart', source: 'startup' }), env: { CLAUDE_PROJECT_DIR: repo.root } });
    expect(start).toEqual({ code: 0, stdout: '', stderr: '' });
    expect(starts(repo.root)).toBe(1);
    expect(answers(repo)).toEqual([expect.stringMatching(/^[0-9a-f]{64}\.json$/)]);
    expect(await before(repo, 'src/db/schema.ts')).toBe('refused');
    expect(await before(repo, 'src/auth/a.ts')).toBe('nothing');
    expect(await before(repo, 'src/db/schema.ts')).toBe('refused');
    // A directory in the briefs' directory is no file spec-brief lists there.
    mkdirSync(join(repo.root, 'briefs', 'drafts'));
    expect(await before(repo, 'src/db/schema.ts')).toBe('refused');
    expect(starts(repo.root)).toBe(1);
    expect(answers(repo)).toHaveLength(1);
  });

  it('starts spec-brief again for each input that reads otherwise, and answers by what it then lists', async () => {
    const changes: [string, (repo: Repository) => void, 'refused' | 'nothing'][] = [
      ["the brief's bytes", (repo) => repo.write(BRIEF_FILE, brief({ affected: ['src/auth/**'], protected: ['src/other/**'] })), 'nothing'],
      ['a file listed as not there, made', (repo) => repo.write('spec-brief.json', '{}\n'), 'refused'],
      ['a file listed, removed', (repo) => rmSync(join(repo.root, '.spec-brief.json')), 'refused'],
      ['a directory where a file was listed', (repo) => (rmSync(join(repo.root, '.spec-brief.json')), mkdirSync(join(repo.root, '.spec-brief.json'))), 'refused'],
      ['an entry added to a directory listed', (repo) => repo.write('briefs/notes.md', '# notes\n'), 'refused'],
      ['a file of a directory listed, renamed', (repo) => renameSync(join(repo.root, 'briefs', 'README.md'), join(repo.root, 'briefs', 'READ.md')), 'refused'],
      // The last of the files in their order as text: the rest are the start of the list.
      ['a file of a directory listed, removed', (repo) => rmSync(join(repo.root, 'briefs', 'a-note.md')), 'refused'],
      ['a brief added', (repo) => repo.write('briefs/002_more.md', brief({ title: '002 - More', protected: ['src/auth/**'] })), 'refused'],
      ['the directory listed taken away', (repo) => rmSync(join(repo.root, 'briefs'), { recursive: true }), 'refused'],
    ];
    for (const [what, change, then] of changes) {
      const repo = project();
      expect(await before(repo, 'src/db/schema.ts'), what).toBe('refused');
      expect(await before(repo, 'src/db/schema.ts'), what).toBe('refused');
      expect(starts(repo.root), what).toBe(1);
      change(repo);
      const after = await cli(['hook', 'claude'], repo.root, { stdin: question(repo, 'src/db/schema.ts', 'session-1'), env: { CLAUDE_PROJECT_DIR: repo.root } });
      expect(starts(repo.root), what).toBe(2);
      if (what === 'a directory where a file was listed') {
        expect(after, what).toEqual({ code: 2, stdout: '', stderr: 'spec-harness: cannot check this write: spec-brief could not list the briefs: .spec-brief.json is a directory\n' });
        continue;
      }
      if (what === 'the directory listed taken away') {
        expect(after, what).toEqual({ code: 2, stdout: '', stderr: 'spec-harness: cannot check this write: spec-brief could not list the briefs: briefs/ does not exist\n' });
        continue;
      }
      expect(after.code, what).toBe(0);
      expect(after.stdout === '' ? 'nothing' : 'refused', what).toBe(then);
      // What spec-brief then listed is the answer given again.
      expect(await before(repo, 'src/db/schema.ts'), what).toBe(then);
      expect(starts(repo.root), what).toBe(2);
    }
  });

  it('starts spec-brief again for the index and the ignore files, where git was asked', async () => {
    const changes: [string, (repo: Repository) => void][] = [
      ['the index', (repo) => (repo.write('src/auth/b.ts', 'b;\n'), repo.git('add', 'src/auth/b.ts'))],
      ['an ignore file listed', (repo) => repo.write('.gitignore', 'node_modules/\ndist/\n')],
      ['an ignore file outside the work tree, listed as not there, made', (repo) => repo.write('.git/info/exclude', 'tmp/\n')],
    ];
    for (const [what, change] of changes) {
      const repo = project({ git: true });
      rmSync(join(repo.root, '.git', 'info', 'exclude'), { force: true });
      expect(await before(repo, 'src/db/schema.ts'), what).toBe('refused');
      expect(await before(repo, 'src/auth/a.ts'), what).toBe('nothing');
      expect(starts(repo.root), what).toBe(1);
      change(repo);
      expect(await before(repo, 'src/db/schema.ts'), what).toBe('refused');
      expect(starts(repo.root), what).toBe(2);
      expect(await before(repo, 'src/db/schema.ts'), what).toBe('refused');
      expect(starts(repo.root), what).toBe(2);
    }
  });

  it('is never given where spec-brief does not say it may be: no inputs, keep anything but true, a list that names nothing or that is not read here, another version', async () => {
    const fakes: Fake[] = [{ inputs: false }, { keep: false }, { keep: 'true' }, { empty: true }, { bad: true }, { tool: '0.9.0' }, { exit: 1 }];
    for (const fake of fakes) {
      const repo = project(fake);
      expect(await before(repo, 'src/db/schema.ts'), JSON.stringify(fake)).toBe('refused');
      expect(await before(repo, 'src/db/schema.ts'), JSON.stringify(fake)).toBe('refused');
      expect(starts(repo.root), JSON.stringify(fake)).toBe(2);
      expect(answers(repo), JSON.stringify(fake)).toEqual([]);
    }
  });

  it('keeps the answer of the spec-brief installed here where its own list says it may, and none where it does not, whatever its release', async () => {
    // The release is the lockfile's, or in CI's `test (minimum siblings)` the
    // oldest this package runs: spec-brief names its inputs from 0.10.0 on,
    // and an older one names none. So what it says is read, not assumed.
    const repo = repository(FILES, null);
    install(repo.root, 'spec-brief');
    repo.git('checkout', '-q', '-b', 'brief/001-rotate');
    const listed = JSON.parse(execFileSync(process.execPath, [SPEC_BRIEF, 'list', '--archived', '--format', 'json', '--no-color'], { cwd: repo.root, encoding: 'utf8' })) as { inputs?: { keep?: unknown } };
    expect(await before(repo, 'src/db/schema.ts')).toBe('refused');
    expect(await before(repo, 'src/db/schema.ts')).toBe('refused');
    expect(answers(repo)).toHaveLength(listed.inputs?.keep === true ? 1 : 0);
  });

  it('gives no answer it kept once spec-brief is taken away: the write waits, as where none was ever installed', async () => {
    const repo = project();
    expect(await before(repo, 'src/db/schema.ts')).toBe('refused');
    expect(answers(repo)).toHaveLength(1);
    rmSync(spec(repo.root), { recursive: true, force: true });
    const run = await cli(['hook', 'claude'], repo.root, { stdin: question(repo, 'src/db/schema.ts', 'session-1'), env: { CLAUDE_PROJECT_DIR: repo.root } });
    expect(run.code).toBe(2);
    expect(run.stderr).toMatch(/^spec-harness: cannot check this write: spec-brief is not installed here/);
  });

  it('answers no other session, no other work tree, and no question that names no session', async () => {
    const repo = project();
    expect(await before(repo, 'src/db/schema.ts', 'session-1')).toBe('refused');
    expect(await before(repo, 'src/db/schema.ts', 'session-2')).toBe('refused');
    expect(starts(repo.root)).toBe(2);
    expect(answers(repo)).toHaveLength(2);
    // A session's id in a form no Claude Code id has, and none, keep nothing.
    expect(await before(repo, 'src/db/schema.ts', '../session-1')).toBe('refused');
    expect(await before(repo, 'src/db/schema.ts', null)).toBe('refused');
    expect(await before(repo, 'src/db/schema.ts', null)).toBe('refused');
    expect(starts(repo.root)).toBe(5);
    expect(answers(repo)).toHaveLength(2);
    // The same session in a linked worktree of the project, on the same branch's brief, with the same briefs: another work tree's answer.
    const tree = join(repo.root, '.claude', 'worktrees', 'w');
    repo.git('worktree', 'add', '-q', '-b', 'brief/001-w', tree);
    installFake(tree);
    const linked: Repository = { ...repo, root: tree };
    expect(await before(linked, 'src/db/schema.ts', 'session-1', tree)).toBe('refused');
    expect(starts(tree)).toBe(1);
    expect(await before(linked, 'src/db/schema.ts', 'session-1', tree)).toBe('refused');
    expect(starts(tree)).toBe(1);
    expect(answers(repo)).toHaveLength(3);
  });

  it('is kept for the spec-brief that answered, by its version, and for no command the configuration names', async () => {
    const repo = project();
    expect(await before(repo, 'src/db/schema.ts')).toBe('refused');
    writeFileSync(join(spec(repo.root), 'package.json'), `${JSON.stringify({ name: '@spec-family/spec-brief', version: '0.12.1' })}\n`);
    expect(await before(repo, 'src/db/schema.ts')).toBe('refused');
    expect(starts(repo.root)).toBe(2);
    expect(await before(repo, 'src/db/schema.ts')).toBe('refused');
    expect(starts(repo.root)).toBe(2);
    // Named by the configuration, the same script is started for every write.
    repo.write('.spec-harness.json', `${JSON.stringify({ tools: { 'spec-brief': ['node', join(spec(repo.root), 'bin', 'spec-brief.js')] } })}\n`);
    expect(await before(repo, 'src/db/schema.ts')).toBe('refused');
    expect(await before(repo, 'src/db/schema.ts')).toBe('refused');
    expect(starts(repo.root)).toBe(4);
  });

  it('starts spec-brief where git is sent elsewhere, and where a variable the answer turns on differs', async () => {
    const repo = project({ git: true });
    expect(await before(repo, 'src/db/schema.ts')).toBe('refused');
    expect(starts(repo.root)).toBe(1);
    const elsewhere = [['GIT_INDEX_FILE', join(repo.root, '.git', 'index')], ['GIT_DIR', join(repo.root, '.git')], ['GIT_WORK_TREE', repo.root], ['GIT_COMMON_DIR', join(repo.root, '.git')]] as const;
    for (const [name, value] of elsewhere) {
      process.env[name] = value;
      try {
        expect(await before(repo, 'src/db/schema.ts'), name).toBe('refused');
        expect(await before(repo, 'src/db/schema.ts'), name).toBe('refused');
      } finally {
        delete process.env[name];
      }
    }
    expect(starts(repo.root)).toBe(9);
    expect(await before(repo, 'src/db/schema.ts')).toBe('refused');
    expect(starts(repo.root)).toBe(9);
    // Where git reads the person's own configuration and ignore files.
    const home = process.env['GIT_CONFIG_GLOBAL'];
    process.env['GIT_CONFIG_GLOBAL'] = `${home}.other`;
    try {
      expect(await before(repo, 'src/db/schema.ts')).toBe('refused');
    } finally {
      process.env['GIT_CONFIG_GLOBAL'] = home;
    }
    expect(starts(repo.root)).toBe(10);
  });

  it("starts spec-brief where the work tree's git directory keeps a configuration of its own, which git reads beside the repository's", async () => {
    const repo = project({ git: true });
    repo.git('config', 'extensions.worktreeConfig', 'true');
    repo.git('config', '--worktree', 'core.excludesFile', join(repo.root, 'nowhere'));
    for (let n = 0; n < 2; n += 1) expect(await before(repo, 'src/db/schema.ts')).toBe('refused');
    expect(starts(repo.root)).toBe(2);
    // Where the list names nothing git read, the git directory is asked nothing, and the answer is given again.
    const asked = project();
    asked.git('config', 'extensions.worktreeConfig', 'true');
    asked.git('config', '--worktree', 'core.excludesFile', join(asked.root, 'nowhere'));
    for (let n = 0; n < 2; n += 1) expect(await before(asked, 'src/db/schema.ts')).toBe('refused');
    expect(starts(asked.root)).toBe(1);
  });

  it('gives the answer again where a path named as not there is under a file', async () => {
    const repo = project({ absent: ['README.md/notes'] });
    for (let n = 0; n < 2; n += 1) expect(await before(repo, 'src/db/schema.ts')).toBe('refused');
    expect(starts(repo.root)).toBe(1);
  });

  it('gives the answer again while a directory named as not there is still not there, and starts spec-brief once anything stands there', async () => {
    for (const [what, make] of [
      ['a directory', (repo: Repository) => mkdirSync(join(repo.root, 'briefs', 'archive'))],
      ['a file', (repo: Repository) => repo.write('briefs/archive', 'not a directory\n')],
    ] as const) {
      const repo = project({ missing: ['briefs/archive'] });
      for (let n = 0; n < 2; n += 1) expect(await before(repo, 'src/db/schema.ts'), what).toBe('refused');
      expect(starts(repo.root), what).toBe(1);
      make(repo);
      expect(await before(repo, 'src/db/schema.ts'), what).toBe('refused');
      expect(starts(repo.root), what).toBe(2);
    }
    // Under a file, a directory is not there either.
    const under = project({ missing: ['README.md/archive'] });
    for (let n = 0; n < 2; n += 1) expect(await before(under, 'src/db/schema.ts')).toBe('refused');
    expect(starts(under.root)).toBe(1);
  });

  it('starts spec-brief where a path named as not there cannot be looked for', async () => {
    const odd = `a${String.fromCharCode(0)}b`;
    for (const fake of [{ absent: [odd] }, { missing: [odd] }]) {
      const repo = project(fake);
      for (let n = 0; n < 2; n += 1) expect(await before(repo, 'src/db/schema.ts'), Object.keys(fake)[0]).toBe('refused');
      expect(starts(repo.root), Object.keys(fake)[0]).toBe(2);
    }
  });

  // Windows has no named pipe at a path of the disk.
  it.skipIf(process.platform === 'win32')('reads no named pipe where a file was listed, and starts spec-brief', { timeout: 60_000 }, async () => {
    const repo = project();
    expect(await before(repo, 'src/db/schema.ts')).toBe('refused');
    rmSync(join(repo.root, '.spec-brief.json'));
    execFileSync('mkfifo', [join(repo.root, '.spec-brief.json')]);
    const run = await cli(['hook', 'claude'], repo.root, { stdin: question(repo, 'src/db/schema.ts', 'session-1'), env: { CLAUDE_PROJECT_DIR: repo.root } });
    expect(run).toEqual({ code: 2, stdout: '', stderr: 'spec-harness: cannot check this write: spec-brief could not list the briefs: .spec-brief.json is a directory\n' });
    expect(starts(repo.root)).toBe(2);
  });

  it.skipIf(process.platform === 'win32')('reads no named pipe where the answer is kept, and starts spec-brief', { timeout: 60_000 }, async () => {
    const repo = project();
    expect(await before(repo, 'src/db/schema.ts')).toBe('refused');
    const [name] = answers(repo);
    const file = join(repo.root, '.git', 'spec-harness', 'answers', name!);
    rmSync(file);
    execFileSync('mkfifo', [file]);
    expect(await before(repo, 'src/db/schema.ts')).toBe('refused');
    expect(starts(repo.root)).toBe(2);
  });

  it('starts spec-brief where what was kept is not an answer kept for it', async () => {
    const repo = project();
    expect(await before(repo, 'src/db/schema.ts')).toBe('refused');
    const [name] = answers(repo);
    const file = join(repo.root, '.git', 'spec-harness', 'answers', name!);
    const kept = JSON.parse(readFileSync(file, 'utf8')) as { key: string; answer: string };
    const lies: [string, () => void][] = [
      ['not JSON', () => writeFileSync(file, '{ not json')],
      ['null', () => writeFileSync(file, 'null\n')],
      ["another key's", () => writeFileSync(file, `${JSON.stringify({ ...kept, key: `${kept.key} ` })}\n`)],
      ['an answer that is no text', () => writeFileSync(file, `${JSON.stringify({ ...kept, answer: JSON.parse(kept.answer) })}\n`)],
      ['an answer that is not JSON', () => writeFileSync(file, `${JSON.stringify({ ...kept, answer: '{' })}\n`)],
      ['an answer in a list', () => writeFileSync(file, `${JSON.stringify({ ...kept, answer: [kept.answer] })}\n`)],
      ['an answer that names no inputs', () => writeFileSync(file, `${JSON.stringify({ ...kept, answer: JSON.stringify({ ...JSON.parse(kept.answer), inputs: undefined }) })}\n`)],
      ['an answer another version gave', () => writeFileSync(file, `${JSON.stringify({ ...kept, answer: JSON.stringify({ ...JSON.parse(kept.answer), inputs: { ...JSON.parse(kept.answer).inputs, tool: '0.10.1' } }) })}\n`)],
      ['a directory', () => mkdirSync(file)],
    ];
    let count = 1;
    for (const [what, lie] of lies) {
      lie();
      expect(await before(repo, 'src/db/schema.ts'), what).toBe('refused');
      expect(starts(repo.root), what).toBe((count += 1));
      rmSync(file, { recursive: true, force: true });
    }
  });

  it('is given again to the hook alone: guard starts spec-brief every time', async () => {
    const repo = project();
    expect(await before(repo, 'src/db/schema.ts')).toBe('refused');
    for (let n = 0; n < 2; n += 1) expect((await cli(['guard', 'src/db/schema.ts'], repo.root)).code).toBe(1);
    expect(starts(repo.root)).toBe(3);
  });

  it('removes what was kept over a day ago, as the next answer is kept, and answers where nothing can be kept', async () => {
    const repo = project();
    expect(await before(repo, 'src/db/schema.ts', 'session-1')).toBe('refused');
    const directory = join(repo.root, '.git', 'spec-harness', 'answers');
    const age = (name: string, hours: number): void => {
      writeFileSync(join(directory, name), '{}\n');
      const then = new Date(Date.now() - hours * 60 * 60 * 1000);
      utimesSync(join(directory, name), then, then);
    };
    age('old.json', 25);
    age('recent.json', 23);
    const [first] = answers(repo).filter((name) => name.length === 69);
    expect(await before(repo, 'src/db/schema.ts', 'session-2')).toBe('refused');
    expect(answers(repo).filter((name) => name !== first && name.length === 69)).toHaveLength(1);
    expect(answers(repo)).toContain('recent.json');
    expect(answers(repo)).not.toContain('old.json');
    // A file where the directory would be: nothing is kept, and every write is decided.
    const other = project();
    mkdirSync(join(other.root, '.git', 'spec-harness'), { recursive: true });
    writeFileSync(join(other.root, '.git', 'spec-harness', 'answers'), 'a file where the directory would be\n');
    expect(await before(other, 'src/db/schema.ts')).toBe('refused');
    expect(await before(other, 'src/auth/a.ts')).toBe('nothing');
    expect(starts(other.root)).toBe(2);
  });
});

describe('a session in a worktree with no install of its own', () => {
  it("is given the answer of the project's spec-brief again, in that worktree, and not the project's own", async () => {
    const repo = project();
    expect(await before(repo, 'src/db/schema.ts', 'session-1')).toBe('refused');
    const tree = join(temp(), 'w');
    repo.git('worktree', 'add', '-q', '-b', 'brief/001-w', tree);
    const linked: Repository = { ...repo, root: tree };
    expect(await before(linked, 'src/db/schema.ts', 'session-1', tree, repo.root)).toBe('refused');
    expect(starts(repo.root)).toBe(2);
    expect(await before(linked, 'src/db/schema.ts', 'session-1', tree, repo.root)).toBe('refused');
    expect(await before(repo, 'src/db/schema.ts', 'session-1')).toBe('refused');
    expect(starts(repo.root)).toBe(2);
  });
});

describe('what a kept answer is the answer to', () => {
  const key = (env: Record<string, string>): string => answerKey('/repo', 'session-1', ['node', 'spec-brief.js'], '0.10.0', env);
  const base = { PATH: '/bin', HOME: '/home/a' };

  it('is the work tree, the session, the command, the version and the command line', () => {
    const one = answerKey('/repo', 'session-1', ['node', 'spec-brief.js'], '0.10.0', base);
    for (const other of [
      answerKey('/other', 'session-1', ['node', 'spec-brief.js'], '0.10.0', base),
      answerKey('/repo', 'session-2', ['node', 'spec-brief.js'], '0.10.0', base),
      answerKey('/repo', 'session-1', ['node', 'other.js'], '0.10.0', base),
      answerKey('/repo', 'session-1', ['node', 'spec-brief.js'], '0.10.1', base),
    ]) {
      expect(other).not.toBe(one);
    }
    expect(JSON.parse(one)).toMatchObject({ root: '/repo', session: 'session-1', command: ['node', 'spec-brief.js'], version: '0.10.0', node: process.version, args: ['list', '--archived', '--format', 'json', '--no-color'] });
  });

  it('is every variable git reads, and those an answer turns on, whatever their case, in any order', () => {
    for (const name of ['PATH', 'Path', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'XDG_CONFIG_HOME', 'NODE_OPTIONS', 'NODE_PATH', 'GIT_CONFIG_GLOBAL', 'git_dir', 'GIT_']) {
      expect(key({ ...base, [name]: 'x' }), name).not.toBe(key(base));
    }
    expect(key({ HOME: '/home/a', PATH: '/bin' })).toBe(key(base));
    expect(key({ path: '/bin', HOME: '/home/a' })).toBe(key(base));
    // Claude Code's own, set for one event and not another, are none of them.
    for (const name of ['CLAUDE_ENV_FILE', 'CLAUDE_EFFORT', 'CLAUDE_PROJECT_DIR', 'SPEC_BRIEF', 'MY_GIT_DIR', 'XGIT_DIR']) {
      expect(key({ ...base, [name]: 'x' }), name).toBe(key(base));
    }
  });
});
