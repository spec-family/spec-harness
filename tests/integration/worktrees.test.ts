/**
 * The work tree a hook decides for (ADR-0005, amended 2026-10-18).
 *
 * Claude Code names the project a session started in, and hands the hook
 * the directory Claude works in as `cwd`: in a worktree session started from
 * the desktop app, and after Claude enters a worktree, the first is the main
 * checkout and the second the worktree. The hook read the main checkout's
 * branch, which named no brief, and let a write the worktree's brief
 * protects pass with no word. Each test here runs the command line on the
 * words Claude Code's line hands it, with the question Claude Code asks.
 */

import { join, relative as relativeTo } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { brief, BRIEF_FILE, cleanup, cli, git, install, installFake, parsed, repository, temp, write, type Repository } from './helpers.js';

afterAll(cleanup);

const FILES = {
  [BRIEF_FILE]: brief({ affected: ['src/auth/**'], protected: ['src/db/**'] }),
  '.gitignore': 'node_modules/\n.claude/worktrees/\n',
  'src/db/schema.ts': 'table;\n',
  'src/auth/a.ts': 'a;\n',
  'README.md': '# x\n',
};

/** A project with no configuration and spec-brief installed in its main checkout, on `branch`. */
function project(branch = 'main'): Repository {
  const repo = repository(FILES, null);
  install(repo.root, 'spec-brief');
  if (branch !== 'main') repo.git('checkout', '-q', '-b', branch);
  return repo;
}

/** A linked worktree of `repo` at `path`, on a new branch. */
function linked(repo: Repository, path: string, branch: string, from = 'main'): string {
  repo.git('worktree', 'add', '-q', '-b', branch, path, from);
  return path;
}

const file = (root: string, path: string): string => join(root, ...path.split('/'));

function question(event: string, cwd: string, input: Record<string, unknown>): string {
  return JSON.stringify({ session_id: 's', transcript_path: '/t', cwd, hook_event_name: event, tool_name: 'Edit', tool_input: { old_string: 'a', new_string: 'b', ...input } });
}

/** The hook as Claude Code starts it: in the project it names, with that project in CLAUDE_PROJECT_DIR. */
async function hook(projectDir: string, event: string, cwd: string, input: Record<string, unknown>) {
  return cli(['hook', 'claude'], projectDir, { stdin: question(event, cwd, input), env: { CLAUDE_PROJECT_DIR: projectDir } });
}

function decision(stdout: string): string | undefined {
  return stdout === '' ? undefined : (JSON.parse(stdout) as { hookSpecificOutput: { permissionDecision?: string } }).hookSpecificOutput.permissionDecision;
}

const REFUSAL = 'spec-harness: brief 001 does not empower this round to change src/db/schema.ts (protectedFiles: src/db/**)';

describe('a session in a linked worktree, with the project Claude Code names on main', () => {
  it("refuses a write the worktree's brief protects, inside the project, beside it, and from below its top", async () => {
    const repo = project();
    const inside = linked(repo, join(repo.root, '.claude', 'worktrees', 'w'), 'claude/brief-001-w');
    const beside = linked(repo, join(temp(), 'beside'), 'claude/brief-001-b');
    // And one inside it in a directory of the project's own, where no name starts with a dot.
    const nested = linked(repo, join(repo.root, 'trees', 'n'), 'claude/brief-001-n');
    for (const [tree, cwd] of [
      [inside, inside],
      [beside, beside],
      [inside, join(inside, 'src')],
      [nested, nested],
    ] as const) {
      const result = await hook(repo.root, 'PreToolUse', cwd, { file_path: file(tree, 'src/db/schema.ts') });
      expect({ code: result.code, stderr: result.stderr, decision: decision(result.stdout) }, cwd).toEqual({ code: 0, stderr: '', decision: 'deny' });
      expect(result.stdout, cwd).toContain(REFUSAL);
    }
  });

  it("says nothing of a write in the worktree's scope, and warns after one outside it, by its brief", async () => {
    const repo = project();
    const tree = linked(repo, join(repo.root, '.claude', 'worktrees', 'w'), 'claude/brief-001-w');
    expect(await hook(repo.root, 'PreToolUse', tree, { file_path: file(tree, 'src/auth/a.ts') })).toEqual({ code: 0, stdout: '', stderr: '' });
    expect(await hook(repo.root, 'PostToolUse', tree, { file_path: file(tree, 'src/auth/a.ts') })).toEqual({ code: 0, stdout: '', stderr: '' });
    const after = await hook(repo.root, 'PostToolUse', tree, { file_path: file(tree, 'README.md') });
    expect(after.code).toBe(0);
    expect(JSON.parse(after.stdout)).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: expect.stringMatching(/^spec-harness: README\.md is outside brief 001's scope, which covers src\/auth\/\*\*\. Next: /),
      },
    });
  });

  it.skipIf(process.platform === 'win32')('refuses it where the one start of git cannot be read for the worktree, whose top holds a line break', async () => {
    // Its common directory is asked for again, from its top (workspace.ts).
    const repo = project();
    const tree = linked(repo, join(temp(), 'two\nlines'), 'claude/brief-001-w');
    const result = await hook(repo.root, 'PreToolUse', tree, { file_path: file(tree, 'src/db/schema.ts') });
    expect({ code: result.code, decision: decision(result.stdout) }).toEqual({ code: 0, decision: 'deny' });
  });

  it("runs the worktree's own install where it has one, and the project's where it has none", async () => {
    const repo = project();
    const tree = linked(repo, join(repo.root, '.claude', 'worktrees', 'w'), 'claude/brief-001-w');
    // Its own, too old to run: it is the one read, and the write waits, though the project's would do.
    installFake(tree, 'spec-brief', JSON.stringify({ version: '0.1.0' }));
    expect(await hook(repo.root, 'PreToolUse', tree, { file_path: file(tree, 'src/db/schema.ts') })).toEqual({
      code: 2,
      stdout: '',
      stderr: 'spec-harness: cannot check this write: spec-brief 0.1.0 is installed here; spec-harness needs 0.12.0 or later: npm install --save-dev @spec-family/spec-brief@latest\n',
    });
    // Neither has one: the write waits, as it did.
    const bare = repository(FILES, null);
    const elsewhere = linked(bare, join(bare.root, '.claude', 'worktrees', 'w'), 'claude/brief-001-w');
    expect(await hook(bare.root, 'PreToolUse', elsewhere, { file_path: file(elsewhere, 'src/db/schema.ts') })).toEqual({
      code: 2,
      stdout: '',
      stderr: 'spec-harness: cannot check this write: spec-brief is not installed here: npm install --save-dev @spec-family/spec-brief, or name its command under "tools" in .spec-harness.json\n',
    });
  });
});

describe("git's hook and doctor in a linked worktree with no install", () => {
  it("read the main work tree's siblings: a protected commit is refused, and doctor says whose install it read", async () => {
    const repo = project();
    const tree = linked(repo, join(temp(), 'linked'), 'brief/001-linked');
    write(tree, 'src/db/schema.ts', 'changed;\n');
    git(tree, 'add', 'src/db/schema.ts');
    const commit = await cli(['hook', 'git'], tree);
    expect(commit.code).toBe(1);
    expect(commit.stderr).toContain('refused  brief 001 does not empower this round to change src/db/schema.ts');
    const doctor = parsed<{ siblings: { tool: string; state: string; elsewhere: string | null }[] }>(await cli(['doctor', '--format', 'json'], tree));
    expect(doctor.siblings.find((sibling) => sibling.tool === 'spec-brief')).toMatchObject({ state: 'found', elsewhere: expect.any(String) });
  });
});

describe('every other command in a linked worktree with no install (ADR-0005)', () => {
  it("reads the main work tree's siblings, as git's hook does, where each said spec-brief is not installed here", async () => {
    const repo = project();
    const tree = linked(repo, join(temp(), 'linked'), 'brief/001-linked');
    const guard = await cli(['guard', 'src/db/schema.ts'], tree);
    expect({ code: guard.code, stderr: guard.stderr }).toEqual({ code: 1, stderr: '' });
    expect(guard.stdout).toContain('refused  brief 001 does not empower this round to change src/db/schema.ts');
    for (const argv of [['context'], ['rulings']]) expect(await cli(argv, tree), argv.join(' ')).toMatchObject({ code: 0, stderr: '' });
    // Its own install is read first, as the hook reads it: one too old to run is the one said.
    installFake(tree, 'spec-brief', JSON.stringify({ version: '0.1.0' }));
    expect(await cli(['guard', 'src/db/schema.ts'], tree)).toMatchObject({ code: 2, stderr: expect.stringContaining('spec-brief 0.1.0 is installed here') });
    // And a main work tree with none, on a brief's branch, is said to have none.
    const bare = repository(FILES, null);
    bare.git('checkout', '-q', '-b', 'brief/001-bare');
    expect(await cli(['guard', 'src/db/schema.ts'], bare.root)).toMatchObject({ code: 2, stderr: expect.stringContaining('spec-brief is not installed here') });
  });
});

describe('guard, asked of a linked worktree\'s file from the main checkout (ADR-0005)', () => {
  it('decides it by the worktree that holds it, as the hook does, where it said the file was outside the repository', async () => {
    const repo = project();
    const tree = linked(repo, join(repo.root, '.claude', 'worktrees', 'w'), 'claude/brief-001-w');
    const guard = await cli(['guard', file(tree, 'src/db/schema.ts'), file(tree, 'src/auth/a.ts'), '--format', 'json'], repo.root);
    expect(guard.code).toBe(1);
    expect(parsed<{ decisions: { path: string; verdict: string; reason: string }[] }>(guard).decisions.map((d) => [d.path, d.verdict, d.reason])).toEqual([
      ['src/db/schema.ts', 'deny', 'protected'],
      ['src/auth/a.ts', 'allow', 'in-scope'],
    ]);
    const hooked = await hook(repo.root, 'PreToolUse', repo.root, { file_path: file(tree, 'src/db/schema.ts') });
    expect(decision(hooked.stdout)).toBe('deny');
    // A file of the main checkout is decided by its branch, which names no brief, as before.
    expect(parsed<{ decisions: { reason: string }[] }>(await cli(['guard', 'src/db/schema.ts', '--format', 'json'], repo.root)).decisions[0]?.reason).toBe('no-brief');
  });
});

describe('a path in a third work tree of the repository (ADR-0005)', () => {
  // Neither the one the project names nor the one cwd is in: the hook read it
  // from the project's top, as a file of the project or one outside it, and
  // a write its own brief protects passed with no word.
  it('is decided by the work tree that holds it, inside the project or beside it, wherever cwd is', async () => {
    const repo = project();
    const here = linked(repo, join(repo.root, '.claude', 'worktrees', 'a'), 'claude/brief-001-a');
    const inside = linked(repo, join(repo.root, '.claude', 'worktrees', 'b'), 'claude/brief-001-b');
    const beside = linked(repo, join(temp(), 'c'), 'claude/brief-001-c');
    for (const [cwd, tree] of [
      [here, inside],
      [here, beside],
      [repo.root, inside],
      [repo.root, beside],
      [join(temp(), 'elsewhere'), inside],
    ] as const) {
      const result = await hook(repo.root, 'PreToolUse', cwd, { file_path: file(tree, 'src/db/schema.ts') });
      expect({ code: result.code, stderr: result.stderr, decision: decision(result.stdout) }, `${cwd} | ${tree}`).toEqual({ code: 0, stderr: '', decision: 'deny' });
      expect(result.stdout, `${cwd} | ${tree}`).toContain(REFUSAL);
    }
    // A question with no cwd: the same.
    const bare = await cli(['hook', 'claude'], repo.root, {
      stdin: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: file(inside, 'src/db/schema.ts') } }),
      env: { CLAUDE_PROJECT_DIR: repo.root },
    });
    expect({ code: bare.code, decision: decision(bare.stdout) }).toEqual({ code: 0, decision: 'deny' });
    // A file in its scope passes, before and after, and the project's own file is the project's, which names no brief.
    for (const event of ['PreToolUse', 'PostToolUse']) expect(await hook(repo.root, event, here, { file_path: file(beside, 'src/auth/a.ts') }), event).toEqual({ code: 0, stdout: '', stderr: '' });
    expect(await hook(repo.root, 'PreToolUse', here, { file_path: file(repo.root, 'src/db/schema.ts') })).toEqual({ code: 0, stdout: '', stderr: '' });
    // One question that names a file of two of them: each by its own, and the refusal stands.
    const both = await hook(repo.root, 'PreToolUse', here, { file_path: file(beside, 'src/auth/a.ts'), path: file(inside, 'src/db/schema.ts') });
    expect({ code: both.code, decision: decision(both.stdout) }).toEqual({ code: 0, decision: 'deny' });
    // A file in no work tree at all is outside the repository, as before.
    for (const event of ['PreToolUse', 'PostToolUse']) expect(await hook(repo.root, event, here, { file_path: join(temp(), 'loose.txt') }), event).toEqual({ code: 0, stdout: '', stderr: '' });
  });

  it("is said by work tree, in the order they are first named, the project's own last, as cwd's work tree's came first", async () => {
    const repo = project('claude/brief-001-p');
    const a = linked(repo, join(repo.root, '.claude', 'worktrees', 'a'), 'claude/brief-001-a');
    const b = linked(repo, join(repo.root, '.claude', 'worktrees', 'b'), 'claude/brief-001-b');
    // The files each refusal names, in the order the answer says them: each work tree's protected file, refused by its own.
    const refused = async (input: Record<string, unknown>): Promise<string[]> => {
      const result = await hook(repo.root, 'PreToolUse', repo.root, input);
      expect(decision(result.stdout)).toBe('deny');
      const reason = (JSON.parse(result.stdout) as { hookSpecificOutput: { permissionDecisionReason: string } }).hookSpecificOutput.permissionDecisionReason;
      return reason.split('\n').map((line) => /change (\S+) \(/.exec(line)?.[1] ?? line);
    };
    expect(await refused({ file_path: file(repo.root, 'src/db/p.ts'), path: file(a, 'src/db/a.ts'), notebook_path: file(b, 'src/db/b.ts') })).toEqual(['src/db/a.ts', 'src/db/b.ts', 'src/db/p.ts']);
    // Two paths of one work tree with another's between them: said together, where that work tree is first met.
    expect(await refused({ file_path: file(a, 'src/db/one.ts'), path: file(b, 'src/db/b.ts'), notebook_path: file(a, 'src/db/two.ts') })).toEqual(['src/db/one.ts', 'src/db/two.ts', 'src/db/b.ts']);
  });

  it('is decided by the innermost work tree of the repository around it, past a repository of its own inside that one', async () => {
    const repo = project();
    const inside = linked(repo, join(repo.root, '.claude', 'worktrees', 'b'), 'claude/brief-001-b');
    // A clone inside the worktree, which is another repository.
    const nested = join(inside, 'vendor', 'n');
    write(nested, 'src/db/schema.ts', 'other;\n');
    git(nested, 'init', '-q', '-b', 'main');
    git(nested, 'add', '-A');
    git(nested, 'commit', '-q', '-m', 'n');
    // The worktree decides it, by the path it has there, outside brief 001's scope: warned of after the write.
    expect(await hook(repo.root, 'PreToolUse', repo.root, { file_path: file(nested, 'src/db/schema.ts') })).toEqual({ code: 0, stdout: '', stderr: '' });
    const after = await hook(repo.root, 'PostToolUse', repo.root, { file_path: file(nested, 'src/db/schema.ts') });
    expect(JSON.parse(after.stdout).hookSpecificOutput.additionalContext).toMatch(/^spec-harness: vendor\/n\/src\/db\/schema\.ts is outside brief 001's scope/);
  });

  it("is warned of after a write outside its scope by its own configuration, where the project's would say nothing", async () => {
    const repo = repository({ ...FILES, '.spec-harness.json': JSON.stringify({ outOfScope: 'deny' }) }, null);
    install(repo.root, 'spec-brief');
    const beside = linked(repo, join(temp(), 'c'), 'claude/brief-001-c');
    // That work tree's branch warns of a write outside the scope; the project's checkout denies one.
    write(beside, '.spec-harness.json', JSON.stringify({ outOfScope: 'warn' }));
    git(beside, 'commit', '-q', '-am', 'warn');
    const after = await hook(repo.root, 'PostToolUse', repo.root, { file_path: file(beside, 'README.md') });
    expect(after.code).toBe(0);
    expect(JSON.parse(after.stdout).hookSpecificOutput.additionalContext).toMatch(/^spec-harness: README\.md is outside brief 001's scope/);
    // A path written relative to the question's cwd is read from there, as Claude Code does not send one.
    const relative = await cli(['hook', 'claude'], repo.root, {
      stdin: question('PostToolUse', join(repo.root, 'src'), { file_path: relativeTo(join(repo.root, 'src'), file(beside, 'README.md')) }),
      env: { CLAUDE_PROJECT_DIR: repo.root },
    });
    expect(JSON.parse(relative.stdout).hookSpecificOutput.additionalContext).toMatch(/^spec-harness: README\.md is outside brief 001's scope/);
    // The project's own file after the write: nothing, under its own deny, with no process started for it.
    expect(await hook(repo.root, 'PostToolUse', repo.root, { file_path: file(repo.root, 'README.md') })).toEqual({ code: 0, stdout: '', stderr: '' });
    // And named with that work tree's: warned of, by that one's.
    const two = await hook(repo.root, 'PostToolUse', repo.root, { file_path: file(repo.root, 'README.md'), path: file(beside, 'README.md') });
    expect(two.stdout).toContain("spec-harness: README.md is outside brief 001's scope");
    // A question with no cwd: a relative path is read from where the hook started, the project's own file here.
    const bare = await cli(['hook', 'claude'], repo.root, {
      stdin: JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: 'README.md' } }),
      env: { CLAUDE_PROJECT_DIR: repo.root },
    });
    expect(bare).toEqual({ code: 0, stdout: '', stderr: '' });
  });
});

describe("the project's own writes", () => {
  it('are decided by its own branch, from a worktree inside it or beside it on a branch that names no brief', async () => {
    const repo = project('brief/001-main');
    const inside = linked(repo, join(repo.root, '.claude', 'worktrees', 'side'), 'side');
    const beside = linked(repo, join(temp(), 'beside'), 'side2');
    for (const cwd of [repo.root, inside, beside]) {
      const result = await hook(repo.root, 'PreToolUse', cwd, { file_path: file(repo.root, 'src/db/schema.ts') });
      expect({ code: result.code, decision: decision(result.stdout) }, cwd).toEqual({ code: 0, decision: 'deny' });
      expect(result.stdout, cwd).toContain(REFUSAL);
    }
    // The worktree's own file is its own branch's, which names no brief: nothing before the write, and nothing after it.
    expect(await hook(repo.root, 'PreToolUse', inside, { file_path: file(inside, 'src/db/schema.ts') })).toEqual({ code: 0, stdout: '', stderr: '' });
    expect(await hook(repo.root, 'PostToolUse', inside, { file_path: file(inside, 'src/db/schema.ts') })).toEqual({ code: 0, stdout: '', stderr: '' });
    // One question that names a file of each: each is decided where it is, and the refusal stands.
    const both = await hook(repo.root, 'PreToolUse', inside, { file_path: file(inside, 'src/db/schema.ts'), path: file(repo.root, 'src/db/schema.ts') });
    expect({ code: both.code, decision: decision(both.stdout) }).toEqual({ code: 0, decision: 'deny' });
    expect(JSON.parse(both.stdout).hookSpecificOutput.permissionDecisionReason.split('\n')).toHaveLength(1);
  });

  it("are a worktree's where the project is that worktree, inside a main checkout on a branch that names no brief", async () => {
    const repo = project();
    const tree = linked(repo, join(repo.root, '.claude', 'worktrees', 'w'), 'claude/brief-001-w');
    install(tree, 'spec-brief');
    // Claude Code names the worktree, and Claude has gone up into the main checkout around it.
    const result = await hook(tree, 'PreToolUse', repo.root, { file_path: file(tree, 'src/db/schema.ts') });
    expect({ code: result.code, decision: decision(result.stdout) }).toEqual({ code: 0, decision: 'deny' });
    expect(result.stdout).toContain(REFUSAL);
    // The main checkout's file of that name is its own branch's, as it was.
    expect(await hook(tree, 'PreToolUse', repo.root, { file_path: file(repo.root, 'src/db/schema.ts') })).toEqual({ code: 0, stdout: '', stderr: '' });
  });
});

describe('a brief that is none, in one work tree or the other', () => {
  it("holds only the writes of the work tree whose branch names it, and a question with no cwd is the project's", async () => {
    // The worktree's branch names a brief spec-brief does not know: the project's own file is the project's to decide.
    const repo = project('brief/001-main');
    const unknown = linked(repo, join(repo.root, '.claude', 'worktrees', 'u'), 'claude/brief-999-u');
    const own = await hook(repo.root, 'PreToolUse', unknown, { file_path: file(repo.root, 'src/db/schema.ts') });
    expect({ code: own.code, decision: decision(own.stdout) }).toEqual({ code: 0, decision: 'deny' });
    const held = await hook(repo.root, 'PreToolUse', unknown, { file_path: file(unknown, 'src/db/schema.ts') });
    expect(held).toEqual({ code: 2, stdout: '', stderr: 'spec-harness: the branch names brief 999, and spec-brief knows no such brief. Fix the brief or the branch before writing.\n' });
    // The project's branch names one: a write in a worktree whose brief is one is that worktree's to decide.
    const other = project('brief/999-main');
    const tree = linked(other, join(other.root, '.claude', 'worktrees', 'w'), 'claude/brief-001-w');
    const there = await hook(other.root, 'PreToolUse', tree, { file_path: file(tree, 'src/db/schema.ts') });
    expect({ code: there.code, decision: decision(there.stdout) }).toEqual({ code: 0, decision: 'deny' });
    expect((await hook(other.root, 'PreToolUse', tree, { file_path: file(other.root, 'src/db/schema.ts') })).code).toBe(2);
    // No cwd in the question: the project, as before.
    const bare = await cli(['hook', 'claude'], repo.root, {
      stdin: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: file(repo.root, 'src/db/schema.ts') } }),
      env: { CLAUDE_PROJECT_DIR: repo.root },
    });
    expect({ code: bare.code, decision: decision(bare.stdout) }).toEqual({ code: 0, decision: 'deny' });
  });
});

describe('a cwd in another repository, or in none', () => {
  it("leaves every write where it was: decided by the project's briefs, by the path it has in the project", async () => {
    const repo = project('brief/001-main');
    // A repository of its own inside the project, on a branch whose brief protects one of its files.
    const nested = join(repo.root, 'vendor', 'n');
    write(nested, 'briefs/099_n.md', brief({ title: '099 - Nested', affected: ['lib/**'], protected: ['secret.txt'] }));
    write(nested, 'secret.txt', 'secret\n');
    git(nested, 'init', '-q', '-b', 'brief/099-n');
    git(nested, 'add', '-A');
    git(nested, 'commit', '-q', '-m', 'n');
    for (const cwd of [nested, temp(), join(repo.root, 'no-such-directory')]) {
      const result = await hook(repo.root, 'PreToolUse', cwd, { file_path: file(repo.root, 'src/db/schema.ts') });
      expect({ code: result.code, decision: decision(result.stdout) }, cwd).toEqual({ code: 0, decision: 'deny' });
    }
    // What that lets through: the nested repository's own brief is not read, and its file is outside the project's scope.
    expect(await hook(repo.root, 'PreToolUse', nested, { file_path: file(nested, 'secret.txt') })).toEqual({ code: 0, stdout: '', stderr: '' });
    const after = await hook(repo.root, 'PostToolUse', nested, { file_path: file(nested, 'secret.txt') });
    expect(JSON.parse(after.stdout).hookSpecificOutput.additionalContext).toMatch(/^spec-harness: vendor\/n\/secret\.txt is outside brief 001's scope/);
  });
});

describe('a branch beside a tag of its name', () => {
  it('names its brief: the hook refuses a protected write, git\'s hook a protected commit, and doctor says the brief', async () => {
    const repo = project('claude/brief-001-t');
    repo.git('tag', 'claude/brief-001-t');
    const result = await hook(repo.root, 'PreToolUse', repo.root, { file_path: file(repo.root, 'src/db/schema.ts') });
    expect({ code: result.code, decision: decision(result.stdout) }).toEqual({ code: 0, decision: 'deny' });
    repo.write('src/db/schema.ts', 'changed;\n');
    repo.git('add', 'src/db/schema.ts');
    const commit = await cli(['hook', 'git'], repo.root);
    expect(commit.code).toBe(1);
    expect(commit.stderr).toContain('refused  brief 001 does not empower this round to change src/db/schema.ts');
    const doctor = parsed<{ branch: string; brief: string | null }>(await cli(['doctor', '--format', 'json'], repo.root));
    expect({ branch: doctor.branch, brief: doctor.brief }).toEqual({ branch: 'claude/brief-001-t', brief: '001' });
  });
});
