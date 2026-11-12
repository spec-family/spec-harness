/**
 * A report at the end of a turn (ADR-0005 and ADR-0012, amended 2026-10-19).
 *
 * An agent that writes through a shell passes the guard, which is started
 * for Edit, Write and NotebookEdit. Where `turnReport` is on, Claude Code
 * starts the hook as its main agent finishes a turn, and the hook says,
 * with one start of git, every changed path the brief protects or that is
 * outside its scope, in the words a write of it is given; and nothing
 * otherwise. Always exit 0, and never a field that has Claude go on. Each
 * test runs the command line on the words the entry `init` writes hands
 * it, with the question Claude Code asks, and changes the work tree as a
 * shell would, with no hook started.
 */

import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { GUARD_HOOK, mergeClaudeSettings, TURN_HOOK } from '../../src/configure.js';
import { brief, BRIEF_FILE, cleanup, cli, install, installPlugin, parsed, repository, temp, write, type Repository } from './helpers.js';

afterAll(cleanup);

const FILES = {
  [BRIEF_FILE]: brief({ affected: ['src/auth/**'], protected: ['src/db/**'] }),
  '.gitignore': 'node_modules/\n',
  'src/db/schema.ts': 'table;\n',
  'src/auth/a.ts': 'a;\n',
  'README.md': '# x\n',
};

/** A project with spec-brief installed, on `branch`, under the configuration given, which names no sibling's command. */
function project(config: Record<string, unknown> | null = { turnReport: true }, branch = 'brief/001-rotate'): Repository {
  const repo = repository(FILES, config === null ? null : { tools: {}, ...config });
  install(repo.root, 'spec-brief');
  if (branch !== 'main') repo.git('checkout', '-q', '-b', branch);
  return repo;
}

const question = (cwd: string, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ session_id: 's', transcript_path: '/t', cwd, permission_mode: 'default', hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: 'Done.', ...extra });

async function stop(repo: Repository, options: { readonly line?: readonly string[]; readonly cwd?: string; readonly extra?: Record<string, unknown> } = {}) {
  const cwd = options.cwd ?? repo.root;
  return cli(['hook', 'claude', ...(options.line ?? [])], repo.root, { stdin: question(cwd, options.extra), env: { CLAUDE_PROJECT_DIR: repo.root } });
}

/** The report a turn's end gives, line by line, from an answer that must be one `systemMessage` and exit 0. */
function report(run: { readonly code: number; readonly stdout: string; readonly stderr: string }): string[] {
  expect(run.code).toBe(0);
  expect(run.stderr).toBe('');
  const answer = JSON.parse(run.stdout) as Record<string, unknown>;
  expect(Object.keys(answer)).toEqual(['systemMessage']);
  return String(answer['systemMessage']).split('\n');
}

const NOTHING = { code: 0, stdout: '', stderr: '' };
const PROTECTED = (path: string): string =>
  `- brief 001 does not empower this round to change ${path} (protectedFiles: src/db/**). Next: if the round cannot be done without it, stop and ask for a ruling: spec-harness escalate --path <file> --reason <why>, or the request_escalation tool.`;

describe('the hook as a turn ends', () => {
  it('says nothing where turnReport is off, as it is by default, whatever the work tree holds', async () => {
    for (const config of [null, {}, { turnReport: false }]) {
      const repo = project(config);
      repo.write('src/db/schema.ts', 'changed;\n');
      expect(await stop(repo), JSON.stringify(config)).toEqual(NOTHING);
    }
  });

  it('reports a protected file the work tree holds changed, however it was changed, and exits 0', async () => {
    const repo = project();
    expect(await stop(repo)).toEqual(NOTHING);
    repo.write('src/db/schema.ts', 'changed through a shell;\n');
    expect(report(await stop(repo))).toEqual(['spec-harness: as this turn ended, the work tree held changes to a path that brief 001 protects or that is outside its scope:', PROTECTED('src/db/schema.ts')]);
    // Staged, it is the same change; committed, the work tree holds none, and the audit has it.
    repo.git('add', 'src/db/schema.ts');
    expect(report(await stop(repo))).toEqual(['spec-harness: as this turn ended, the work tree held changes to a path that brief 001 protects or that is outside its scope:', PROTECTED('src/db/schema.ts')]);
    repo.git('commit', '-q', '-m', 'through a shell');
    expect(await stop(repo)).toEqual(NOTHING);
    // As often as the turn ends, and whether or not a hook continued it.
    repo.write('src/db/more.ts', 'more;\n');
    expect(report(await stop(repo, { extra: { stop_hook_active: true } }))).toHaveLength(2);
  });

  it('reports what is outside the scope under the outOfScope in force, and nothing in it, nor the brief itself', async () => {
    const WARN = `README.md is outside brief 001's scope, which covers src/auth/**. Next: if the round needs it, say so in ${BRIEF_FILE} and add it to affectedFiles; the archive reports every file outside the scope that the round commits.`;
    const DENY = `README.md is outside brief 001's scope, which covers src/auth/**. Next: add it to affectedFiles in ${BRIEF_FILE} if the round needs it, which is a change the person who approved the brief must see; or if the round cannot be done without it, stop and ask for a ruling: spec-harness escalate --path <file> --reason <why>, or the request_escalation tool.`;
    for (const [outOfScope, words] of [
      ['warn', WARN],
      ['ask', WARN],
      ['deny', DENY],
    ] as const) {
      const repo = project({ turnReport: true, outOfScope });
      repo.write('src/auth/a.ts', 'in the scope;\n');
      repo.write(BRIEF_FILE, `${repo.read(BRIEF_FILE)}\nA note.\n`);
      expect(await stop(repo), outOfScope).toEqual(NOTHING);
      repo.write('README.md', '# changed\n');
      expect(report(await stop(repo)), outOfScope).toEqual([
        'spec-harness: as this turn ended, the work tree held changes to a path that brief 001 protects or that is outside its scope:',
        `- ${words}`,
      ]);
    }
  });

  it('names each untracked file, both paths of a rename, a path with a space in it, a deleted file, and a file in an untracked directory', async () => {
    const repo = project();
    repo.git('mv', 'src/db/schema.ts', 'src/db/tables.ts');
    repo.write('src/db/with space.ts', 'x;\n');
    repo.write('notes/new/a.md', 'a\n');
    repo.write('notes/new/b.md', 'b\n');
    rmSync(join(repo.root, 'README.md'));
    const lines = report(await stop(repo));
    expect(lines[0]).toBe('spec-harness: as this turn ended, the work tree held changes to 6 paths that brief 001 protects or that are outside its scope:');
    expect(lines.slice(1).map((line) => /^- (?:brief 001 does not empower this round to change )?(.+?)(?: \(protectedFiles| is outside)/.exec(line)?.[1]).sort()).toEqual(['README.md', 'notes/new/a.md', 'notes/new/b.md', 'src/db/schema.ts', 'src/db/tables.ts', 'src/db/with space.ts']);
  });

  it('names twenty paths one by one, and how many more there are', async () => {
    const repo = project();
    for (let n = 0; n < 23; n += 1) repo.write(`src/db/t${String(n).padStart(2, '0')}.ts`, 'x;\n');
    const lines = report(await stop(repo));
    expect(lines).toHaveLength(22);
    expect(lines[0]).toContain('23 paths');
    expect(lines[21]).toBe('- and 3 more: spec-harness guard <path> says each');
    expect(lines.slice(1, 21).every((line) => line.startsWith('- brief 001 does not empower this round to change src/db/t'))).toBe(true);
    // Twenty are named, and no more is said.
    for (let n = 20; n < 23; n += 1) rmSync(join(repo.root, 'src', 'db', `t${n}.ts`));
    const twenty = report(await stop(repo));
    expect(twenty).toHaveLength(21);
    expect(twenty[0]).toContain('20 paths');
  });

  it('says nothing where no brief is named, outside a work tree, or where the configuration does not load', async () => {
    const plain = project({ turnReport: true }, 'main');
    plain.write('src/db/schema.ts', 'changed;\n');
    expect(await stop(plain)).toEqual(NOTHING);
    // And git is not asked what changed: a status that would fail is not started.
    writeFileSync(join(plain.root, '.git', 'index'), 'not an index');
    expect(await stop(plain)).toEqual(NOTHING);
    const repo = project();
    repo.write('src/db/schema.ts', 'changed;\n');
    expect(await cli(['hook', 'claude'], temp(), { stdin: question(temp()), env: { CLAUDE_PROJECT_DIR: temp() } })).toEqual(NOTHING);
    repo.write('.spec-harness.json', '{ "turnReport": true, ');
    expect(await stop(repo)).toEqual(NOTHING);
  });

  it('says what holds every write where the brief named is none, and what is wrong with its own line', async () => {
    const repo = project({ turnReport: true }, 'brief/999-nowhere');
    expect(report(await stop(repo))).toEqual(['spec-harness: the branch names brief 999, and spec-brief knows no such brief, so what the work tree holds is not reported, and every write is held but one to a file outside every work tree of the repository; spec-harness doctor says more']);
    const named = project();
    expect(report(await stop(named, { line: ['--root', 'nowhere'] }))).toEqual([expect.stringMatching(/^spec-harness: --root is "nowhere", .*, so the guard is off and no write of this session is checked; /)]);
    expect(report(await stop(named, { line: ['--nope'] }))).toEqual([expect.stringMatching(/so the guard is off and no write of this session is checked; /)]);
  });

  it('reports the project Claude Code names wherever the hook is started, and where the question names no directory', async () => {
    const repo = project();
    repo.write('src/db/schema.ts', 'changed;\n');
    const said = ['spec-harness: as this turn ended, the work tree held changes to a path that brief 001 protects or that is outside its scope:', PROTECTED('src/db/schema.ts')];
    expect(report(await cli(['hook', 'claude'], temp(), { stdin: question(repo.root), env: { CLAUDE_PROJECT_DIR: repo.root } }))).toEqual(said);
    const nowhere = JSON.stringify({ session_id: 's', hook_event_name: 'Stop', stop_hook_active: false });
    expect(report(await cli(['hook', 'claude'], repo.root, { stdin: nowhere, env: { CLAUDE_PROJECT_DIR: repo.root } }))).toEqual(said);
  });

  it('reports the work tree a write of the session is decided in, a worktree of the project where the session works in one', async () => {
    const repo = project({ turnReport: true }, 'main');
    const tree = join(temp(), 'w');
    repo.git('worktree', 'add', '-q', '-b', 'brief/001-w', tree);
    writeFileSync(join(tree, 'src', 'db', 'schema.ts'), 'changed in the worktree;\n');
    expect(report(await stop(repo, { cwd: tree }))).toEqual(['spec-harness: as this turn ended, the work tree held changes to a path that brief 001 protects or that is outside its scope:', PROTECTED('src/db/schema.ts')]);
    // The project itself, on main, names no brief.
    expect(await stop(repo)).toEqual(NOTHING);
  });

  it('says what stopped the report where git cannot tell what changed, and holds nothing', async () => {
    const repo = project();
    mkdirSync(join(repo.root, 'src', 'db', 'nested'), { recursive: true });
    renameSync(join(repo.root, '.git', 'index'), join(repo.root, '.git', 'index.away'));
    writeFileSync(join(repo.root, '.git', 'index'), 'not an index');
    const run = await stop(repo);
    expect(report(run)).toEqual([expect.stringMatching(/^spec-harness: git status failed: .+, so what the work tree holds is not reported$/)]);
  });
});

interface Step {
  readonly file: string;
  readonly action: string;
  readonly detail: string;
}

const steps = async (repo: Repository, env: Record<string, string> = {}): Promise<Step[]> => parsed<{ steps: Step[] }>(await cli(['init', '--write', '--format', 'json'], repo.root, { env })).steps.filter((step) => step.file === '.claude/settings.json');
const AT_START = { hooks: [GUARD_HOOK] };
const AT_END = { hooks: [TURN_HOOK] };

describe('init, for the report at the end of a turn', () => {
  it('writes the entry, in the background, only where turnReport is on, and once', async () => {
    const on = project();
    expect(await steps(on)).toEqual([
      {
        file: '.claude/settings.json',
        action: 'create',
        detail:
          "the guard hooks, run with node from the project's install: a PreToolUse hook refuses writes to protected files; a PostToolUse hook warns about writes outside the scope; a SessionStart hook says, as a session starts, what would hold every write of it; a Stop hook, in the background, tells Claude as each turn begins what the work tree held at the end of the last that the brief protects or that is outside its scope",
      },
    ]);
    const settings = JSON.parse(on.read('.claude/settings.json')) as { hooks: Record<string, unknown> };
    expect(settings.hooks['SessionStart']).toEqual([AT_START]);
    expect(settings.hooks['Stop']).toEqual([AT_END]);
    expect(TURN_HOOK).toEqual({ ...GUARD_HOOK, async: true });
    expect(await steps(on)).toEqual([{ file: '.claude/settings.json', action: 'keep', detail: 'the guard hooks are installed' }]);
    for (const config of [{}, { turnReport: false }]) {
      const off = project(config);
      await steps(off);
      expect(Object.keys((JSON.parse(off.read('.claude/settings.json')) as { hooks: Record<string, unknown> }).hooks), JSON.stringify(config)).toEqual(['PreToolUse', 'PostToolUse', 'SessionStart']);
    }
  });

  it('leaves the entry without onFailure under --block-on-failure, which gives it to the other three (ADR-0012)', async () => {
    // The hooks reference gives the field no effect on a Stop hook, nor on one in the background.
    const repo = project();
    const blocked = async (): Promise<Step | undefined> => parsed<{ steps: Step[] }>(await cli(['init', '--write', '--block-on-failure', '--format', 'json'], repo.root)).steps.find((step) => step.file === '.claude/settings.json');
    expect((await blocked())?.detail).toMatch(/; onFailure "block" on init's PreToolUse, PostToolUse and SessionStart entries, so that /);
    const hooks = (): Record<string, { hooks: Record<string, unknown>[] }[]> => (JSON.parse(repo.read('.claude/settings.json')) as { hooks: Record<string, { hooks: Record<string, unknown>[] }[]> }).hooks;
    for (const event of ['PreToolUse', 'PostToolUse', 'SessionStart']) expect(hooks()[event]?.[0]?.hooks[0]?.['onFailure'], event).toBe('block');
    expect(hooks()['Stop']).toEqual([AT_END]);
    // Run again: the three keep it, and the entry at the end of a turn is still without it.
    expect((await blocked())?.action).toBe('keep');
    expect(hooks()['Stop']).toEqual([AT_END]);
  });

  it('adds the entry beside the guard hooks an earlier release wrote, once turnReport is turned on', async () => {
    const repo = project({});
    await steps(repo);
    repo.write('.spec-harness.json', `${JSON.stringify({ ...JSON.parse(repo.read('.spec-harness.json')), turnReport: true })}\n`);
    expect(await steps(repo)).toEqual([{ file: '.claude/settings.json', action: 'update', detail: 'beside the guard hooks, a Stop hook, in the background, tells Claude as each turn begins what the work tree held at the end of the last that the brief protects or that is outside its scope' }]);
    expect((JSON.parse(repo.read('.claude/settings.json')) as { hooks: Record<string, unknown> }).hooks['Stop']).toEqual([AT_END]);
  });

  it('says how to add the entry where the plugin brings the guard hooks, and writes none', async () => {
    const user = temp();
    write(user, 'settings.json', JSON.stringify({ enabledPlugins: { 'spec-harness@spec-tools': true } }));
    installPlugin(join(user, 'plugins'));
    const env = { CLAUDE_CONFIG_DIR: user };
    const on = project();
    const said = await steps(on, env);
    expect(said.map((step) => step.action)).toEqual(['skip', 'advise']);
    expect(said[1]?.detail).toBe(`"turnReport" is on, and the plugin brings no hook for the end of a turn: add ${JSON.stringify(AT_END)} under "Stop"`);
    expect(existsSync(join(on.root, '.claude'))).toBe(false);
    expect((await steps(project({}), env)).map((step) => step.action)).toEqual(['skip']);
    // A project's own settings that run the report already have nothing to add.
    const running = project();
    running.write('.claude/settings.json', `${JSON.stringify({ hooks: { Stop: [AT_END] } })}\n`);
    running.commit('the report');
    expect((await steps(running, env)).map((step) => step.action)).toEqual(['skip']);
    // A line of a person's own under the event is not init's entry, and the entry is said beside it.
    const theirs = project();
    theirs.write('.claude/settings.json', `${JSON.stringify({ hooks: { Stop: [{ hooks: [{ ...TURN_HOOK, args: [...(TURN_HOOK['args'] as string[]), '--brief', '001'] }] }] } })}\n`);
    theirs.commit('a line of their own');
    expect((await steps(theirs, env)).map((step) => step.action)).toEqual(['skip', 'advise']);
  });

  it('writes both entries beside the guard hooks an earlier release wrote, once turnReport is on', async () => {
    const repo = project({});
    repo.write('.claude/settings.json', `${JSON.stringify(mergeClaudeSettings({}))}\n`);
    repo.commit('the guard hooks of an earlier release');
    repo.write('.spec-harness.json', `${JSON.stringify({ ...JSON.parse(repo.read('.spec-harness.json')), turnReport: true })}\n`);
    expect(await steps(repo)).toEqual([
      {
        file: '.claude/settings.json',
        action: 'update',
        detail:
          'beside the guard hooks, a SessionStart hook says, as a session starts, what would hold every write of it; a Stop hook, in the background, tells Claude as each turn begins what the work tree held at the end of the last that the brief protects or that is outside its scope',
      },
    ]);
  });

  it("writes no entry into a file that holds a line of the hook a person wrote, which is theirs to complete", async () => {
    const theirs = { matcher: 'Edit|Write|MultiEdit|NotebookEdit', hooks: [{ ...GUARD_HOOK, args: [...(GUARD_HOOK['args'] as string[]), '--base', 'main'] }] };
    const settings = `${JSON.stringify({ hooks: { PreToolUse: [theirs], PostToolUse: [theirs] } })}\n`;
    const repo = project();
    repo.write('.claude/settings.json', settings);
    repo.commit('a line of their own');
    const [step] = await steps(repo);
    expect(step?.action).not.toBe('update');
    expect(repo.read('.claude/settings.json')).toBe(settings);
  });
});
