/**
 * The check as a session starts (ADR-0005 and ADR-0012, amended 2026-10-18).
 *
 * Claude Code runs a SessionStart hook as a session starts, resumes, is
 * cleared, compacted or forked, and no write waits on it. The hook says
 * there, in one line for the person and the same for Claude, what would
 * hold every write of the session: and nothing where all is well, and exit
 * 0 whatever it finds. Each test runs the command line on the words
 * Claude Code's line hands it, with the question Claude Code asks.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { reportsUnread, unreportedSaid } from '../../src/versions.js';
import { brief, BRIEF_FILE, cleanup, cli, install, installFake, parsed, repository, ROOT, temp, type Repository } from './helpers.js';

afterAll(cleanup);

const FILES = { [BRIEF_FILE]: brief({ affected: ['src/auth/**'], protected: ['src/db/**'] }), '.gitignore': 'node_modules/\n', 'src/db/schema.ts': 'table;\n' };

/** A project with spec-brief installed, on `branch`, under no configuration of its own. */
function project(branch = 'main', withBrief = true): Repository {
  const repo = repository(FILES, null);
  if (withBrief) install(repo.root, 'spec-brief');
  if (branch !== 'main') repo.git('checkout', '-q', '-b', branch);
  return repo;
}

const question = (cwd: string, source = 'startup'): string => JSON.stringify({ session_id: 's', transcript_path: '/t', cwd, hook_event_name: 'SessionStart', source, model: 'claude' });

async function start(repo: Repository, options: { readonly line?: readonly string[]; readonly env?: Record<string, string>; readonly source?: string; readonly cwd?: string } = {}) {
  const cwd = options.cwd ?? repo.root;
  return cli(['hook', 'claude', ...(options.line ?? [])], cwd, { stdin: question(cwd, options.source), env: { CLAUDE_PROJECT_DIR: cwd, ...options.env } });
}

/**
 * What a session start says where all is well and a brief is named: nothing,
 * under a spec-brief that says which briefs it could not read whole; under
 * the one the suite installs before it does, that it does not (ADR-0005).
 */
const INSTALLED = (JSON.parse(readFileSync(join(ROOT, 'node_modules', '@spec-family', 'spec-brief', 'package.json'), 'utf8')) as { version: string }).version;

/** What is said for `line`: the same to the person and to Claude, exit 0. */
function said(line: string) {
  const text = `spec-harness: ${line}`;
  return { code: 0, stderr: '', stdout: `${JSON.stringify({ systemMessage: text, hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } })}\n` };
}

const NAMED_WELL = reportsUnread(INSTALLED) ? { code: 0, stdout: '', stderr: '' } : said(unreportedSaid(null));

const HELD = 'so every write of this session is held until it is mended';
/** The writes a session's problem does not hold: one outside every work tree goes ahead, as the report at a turn's end says (ADR-0005). */
const OUTSIDE = 'but one to a file outside every work tree of the repository';

describe('the hook as a session starts', () => {
  it('says nothing where all is well, however the session starts', async () => {
    const plain = project();
    const named = project('brief/001-rotate');
    for (const source of ['startup', 'resume', 'clear', 'compact', 'fork', 'what Claude Code adds next']) {
      expect(await start(plain, { source }), source).toEqual({ code: 0, stdout: '', stderr: '' });
      expect(await start(named, { source }), source).toEqual(NAMED_WELL);
    }
    // A question with no source is a session start all the same.
    expect(await cli(['hook', 'claude'], plain.root, { stdin: JSON.stringify({ hook_event_name: 'SessionStart', cwd: plain.root }), env: { CLAUDE_PROJECT_DIR: plain.root } })).toEqual({ code: 0, stdout: '', stderr: '' });
  });

  it('says a brief named that spec-brief does not list, by what names it, in the words a write is held with', async () => {
    const unknown = project('brief/999-nowhere');
    for (const source of ['startup', 'resume', 'compact']) {
      expect(await start(unknown, { source }), source).toEqual(said(`the branch names brief 999, and spec-brief knows no such brief, ${HELD}, ${OUTSIDE}: fix the brief or the branch before writing; spec-harness doctor says more`));
    }
    const plain = project();
    expect(await start(plain, { line: ['--brief', '404'] })).toEqual(said(`the flag names brief 404, and spec-brief knows no such brief, ${HELD}, ${OUTSIDE}: fix the brief or the branch before writing; spec-harness doctor says more`));
    expect(await start(plain, { env: { SPEC_BRIEF: '404' } })).toEqual(said(`the environment names brief 404, and spec-brief knows no such brief, ${HELD}, ${OUTSIDE}: fix the brief or the branch before writing; spec-harness doctor says more`));
    // A session whose directory is in no work tree is the project's, which Claude Code names.
    const elsewhere = temp();
    expect(await cli(['hook', 'claude'], unknown.root, { stdin: question(elsewhere), env: { CLAUDE_PROJECT_DIR: unknown.root } })).toEqual(said(`the branch names brief 999, and spec-brief knows no such brief, ${HELD}, ${OUTSIDE}: fix the brief or the branch before writing; spec-harness doctor says more`));
    // Started in another directory, the hook reads the project Claude Code names.
    expect(await cli(['hook', 'claude'], temp(), { stdin: question(unknown.root), env: { CLAUDE_PROJECT_DIR: unknown.root } })).toEqual(said(`the branch names brief 999, and spec-brief knows no such brief, ${HELD}, ${OUTSIDE}: fix the brief or the branch before writing; spec-harness doctor says more`));
    // And the write it would hold is held so.
    const write = JSON.stringify({ cwd: unknown.root, hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: join(unknown.root, 'src', 'a.ts') } });
    expect(await cli(['hook', 'claude'], unknown.root, { stdin: write, env: { CLAUDE_PROJECT_DIR: unknown.root } })).toEqual({
      code: 2,
      stdout: '',
      stderr: 'spec-harness: the branch names brief 999, and spec-brief knows no such brief. Fix the brief or the branch before writing.\n',
    });
  });

  it('reads the work tree a write of the session is decided in, a worktree of the project where the session works in one (ADR-0005)', async () => {
    const UNKNOWN = said(`the branch names brief 999, and spec-brief knows no such brief, ${HELD}, ${OUTSIDE}: fix the brief or the branch before writing; spec-harness doctor says more`);
    const repo = project();
    const unknown = join(repo.root, '.claude', 'worktrees', 'u');
    repo.git('worktree', 'add', '-q', '-b', 'brief/999-u', unknown);
    const listed = join(repo.root, '.claude', 'worktrees', 'l');
    repo.git('worktree', 'add', '-q', '-b', 'brief/001-l', listed);
    // Started in the project, which Claude Code names, with the question's directory the worktree, as the desktop app has it.
    const ask = (root: string, cwd?: string) =>
      cli(['hook', 'claude'], root, { stdin: JSON.stringify({ session_id: 's', hook_event_name: 'SessionStart', source: 'startup', ...(cwd === undefined ? {} : { cwd }) }), env: { CLAUDE_PROJECT_DIR: root } });
    expect(await ask(repo.root, unknown)).toEqual(UNKNOWN);
    expect(await ask(repo.root, join(unknown, 'src'))).toEqual(UNKNOWN);
    expect(await ask(repo.root, listed)).toEqual(NAMED_WELL);
    // The project's own work tree, and a question that names no directory, are the project's.
    expect(await ask(repo.root, repo.root)).toEqual({ code: 0, stdout: '', stderr: '' });
    expect(await ask(repo.root)).toEqual({ code: 0, stdout: '', stderr: '' });
    // And a project on a branch naming an unknown brief, whose session works in a worktree that names none.
    const named = project('brief/999-nowhere');
    const plain = join(named.root, '.claude', 'worktrees', 'p');
    named.git('worktree', 'add', '-q', '-b', 'plain', plain);
    expect(await ask(named.root, plain)).toEqual({ code: 0, stdout: '', stderr: '' });
    expect(await ask(named.root, named.root)).toEqual(UNKNOWN);
  });

  it('says a configuration that does not load, and spec-brief missing or too old where a brief is named', async () => {
    const broken = project();
    broken.write('.spec-harness.json', '{ "outOfScope": "sideways" }\n');
    // But for a write to the file itself, which may mend it (ADR-0005, amended 2026-10-19).
    expect(await start(broken)).toEqual(
      said(`.spec-harness.json: "outOfScope" must be "warn", "ask" or "deny", ${HELD}, ${OUTSIDE} and one to ${join(broken.root, '.spec-harness.json')} itself, which is not checked; spec-harness doctor says more`),
    );
    const missing = project('brief/001-rotate', false);
    expect(await start(missing)).toEqual(
      said(`spec-brief is not installed here: npm install --save-dev @spec-family/spec-brief, or name its command under "tools" in .spec-harness.json, ${HELD}, ${OUTSIDE}; spec-harness doctor says more`),
    );
    // With no brief named, no write runs spec-brief, and there is nothing to say.
    expect(await start(project('main', false))).toEqual({ code: 0, stdout: '', stderr: '' });
    const old = project('brief/001-rotate', false);
    installFake(old.root, 'spec-brief', JSON.stringify({ version: '0.1.0' }));
    expect(await start(old)).toEqual(said(`spec-brief 0.1.0 is installed here; spec-harness needs 0.12.0 or later: npm install --save-dev @spec-family/spec-brief@latest, ${HELD}, ${OUTSIDE}; spec-harness doctor says more`));
  });

  it("says what is wrong with the hook's own line, in the words it says it with before a write, and exits 0", async () => {
    const repo = project('brief/001-rotate');
    const nowhere = join(repo.root, 'nowhere');
    expect(await start(repo, { line: ['--root', nowhere] })).toEqual(
      said(`--root is "${nowhere}", which is not a directory, so the guard is off and no write of this session is checked; give the hook's line a directory that exists, or leave --root out for the project Claude Code names`),
    );
    const unread = await start(repo, { line: ['--nope'] });
    expect({ code: unread.code, stderr: unread.stderr }).toEqual({ code: 0, stderr: '' });
    const answer = JSON.parse(unread.stdout) as { systemMessage: string; hookSpecificOutput: { additionalContext: string } };
    expect(answer.systemMessage.startsWith("spec-harness: the hook's line cannot be read (Unknown option '--nope'")).toBe(true);
    expect(answer.systemMessage.endsWith('), so the guard is off and no write of this session is checked; mend it in Claude Code\'s settings, where init writes "hook claude" and nothing after it')).toBe(true);
    expect(answer.hookSpecificOutput.additionalContext).toBe(answer.systemMessage);
  });

  it('says nothing in no work tree, and says a question it cannot read as before a write', async () => {
    const outside = temp();
    expect(await cli(['hook', 'claude'], outside, { stdin: question(outside), env: { CLAUDE_PROJECT_DIR: outside } })).toEqual({ code: 0, stdout: '', stderr: '' });
    const repo = project();
    expect(await cli(['hook', 'claude'], repo.root, { stdin: '{ not json' })).toEqual({ code: 0, stdout: `${JSON.stringify({ systemMessage: 'spec-harness: the hook input is not JSON, so nothing it asks about is checked' })}\n`, stderr: '' });
    // An event that names no tool, and is not a session's start, is no question the hook can read.
    expect(await cli(['hook', 'claude'], repo.root, { stdin: JSON.stringify({ hook_event_name: 'UserPromptSubmit', cwd: repo.root }) })).toEqual(
      { code: 0, stdout: `${JSON.stringify({ systemMessage: 'spec-harness: the hook input names no event or tool, so nothing it asks about is checked' })}\n`, stderr: '' },
    );
  });
});

describe('doctor, of the hook as a session starts', () => {
  const LINE = { type: 'command', command: 'node', args: ['${CLAUDE_PROJECT_DIR}/node_modules/@spec-family/spec-harness/bin/spec-harness.js', 'hook', 'claude'], timeout: 60 };
  const TWO = { PreToolUse: [{ matcher: 'Edit|Write|MultiEdit|NotebookEdit', hooks: [LINE] }], PostToolUse: [{ matcher: 'Edit|Write|MultiEdit|NotebookEdit', hooks: [LINE] }] };
  const NOTE =
    'note: no settings file has Claude Code start the hook as a session starts, so a configuration that does not load, or a brief named that spec-brief does not list, is said only at the first write, which it holds: spec-harness init --write adds the entry beside the two it wrote';

  it('notes a settings file that starts the hook for writes and not as a session starts, and fails nothing for it', async () => {
    const repo = repository({ '.claude/settings.json': JSON.stringify({ hooks: TWO }) });
    const text = await cli(['doctor'], repo.root);
    expect(text.stdout).toContain(`\n        ${NOTE}\n`);
    const json = parsed<{ claudeCode: { sessionStart: boolean; notes: string[] } }>(await cli(['doctor', '--format', 'json'], repo.root));
    expect(json.claudeCode.sessionStart).toBe(false);
    expect(json.claudeCode.notes).not.toContain(NOTE);
    // With the entry, nothing is noted, and the exit code is the one it was.
    const started = repository({ '.claude/settings.json': JSON.stringify({ hooks: { ...TWO, SessionStart: [{ hooks: [LINE] }] } }) });
    const after = await cli(['doctor'], started.root);
    expect(after.stdout).not.toContain(NOTE);
    expect(after.code).toBe(text.code);
    expect(parsed<{ claudeCode: { sessionStart: boolean } }>(await cli(['doctor', '--format', 'json'], started.root)).claudeCode.sessionStart).toBe(true);
    // A line of the hook a person wrote under the event is the entry too; another program's is not.
    const theirs = repository({ '.claude/settings.json': JSON.stringify({ hooks: { ...TWO, SessionStart: [{ matcher: 'startup', hooks: [{ ...LINE, args: [...LINE.args, '--root', '${CLAUDE_PROJECT_DIR}'] }] }] } }) });
    expect((await cli(['doctor'], theirs.root)).stdout).not.toContain(NOTE);
    const other = repository({ '.claude/settings.json': JSON.stringify({ hooks: { ...TWO, SessionStart: [{ hooks: [{ type: 'command', command: 'node', args: ['other.js'] }] }] } }) });
    expect((await cli(['doctor'], other.root)).stdout).toContain(NOTE);
    // Nor is the harness's own script on a line that is not the hook's.
    const git = repository({ '.claude/settings.json': JSON.stringify({ hooks: { ...TWO, SessionStart: [{ hooks: [{ ...LINE, args: [LINE.args[0], 'hook', 'git'] }] }] } }) });
    expect((await cli(['doctor'], git.root)).stdout).toContain(NOTE);
    // Where nothing in the settings guards, there is no entry to note.
    expect((await cli(['doctor'], repository({}).root)).stdout).not.toContain(NOTE);
  });

  it("is written by init beside its two, and completes a file an earlier release wrote, once", async () => {
    const repo = repository({ '.claude/settings.json': JSON.stringify({ hooks: TWO }) });
    const step = async (): Promise<{ action: string; detail: string } | undefined> =>
      parsed<{ steps: { file: string; action: string; detail: string }[] }>(await cli(['init', '--write', '--format', 'json'], repo.root)).steps.find((found) => found.file === '.claude/settings.json');
    expect(await step()).toEqual({ file: '.claude/settings.json', action: 'update', detail: 'beside the guard hooks, a SessionStart hook says, as a session starts, what would hold every write of it' });
    expect(JSON.parse(repo.read('.claude/settings.json'))).toEqual({ hooks: { ...TWO, SessionStart: [{ hooks: [LINE] }] } });
    expect(await step()).toEqual({ file: '.claude/settings.json', action: 'keep', detail: 'the guard hooks are installed' });
    expect((await cli(['doctor'], repo.root)).stdout).not.toContain(NOTE);
  });
});
