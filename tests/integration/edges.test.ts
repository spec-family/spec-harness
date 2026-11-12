import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { ConfigError, DEFAULT_CONFIG } from '../../src/config.js';
import { CALL_LIFE_MS, gitDirectories, holdsGit, isFile, isTop, keepCall, loadConfig, localSpelling, mainWorkTree, readJsonObject, readText, realSpelling, repositoryPath, stateDirectory, takeCall, throughShare, writeAtomic } from '../../src/fs.js';
import {
  addWorktree,
  ANSWER_MS,
  blameLine,
  changes,
  commonDirectory,
  currentBranch,
  git as runGit,
  GitError,
  holdsPath,
  isShallow,
  localBranches,
  mergeBase,
  remoteDefault,
  revision,
  show,
  stagedChanges,
  stoppedAtLimit,
  timeFor,
  verifyCommit,
  withBudget,
  WORK_MS,
  workTree,
  workTreeRoot,
} from '../../src/git.js';
import { pluginFile } from '../../src/round.js';
import { runCommand, withWorktree } from '../../src/sandbox.js';
import { createSiblings, declaredVersion, locate, runSibling, SiblingError } from '../../src/siblings.js';
import { MAIN_INSTALL } from '../../src/workspace.js';
import { brief, BRIEF_FILE, cleanup, cli, git, ignoresCase, install, installFake, parsed, repository, ROOT, temp } from './helpers.js';

afterAll(cleanup);

describe('a path through a share on this machine (ADR-0005)', () => {
  it('names a drive\'s share on this machine by the drive, another share on it as a share, and any other path as none', () => {
    const host = 'Desk-1';
    for (const [path, local] of [
      ['\\\\localhost\\C$\\Repos\\x\\a.js', 'C:\\Repos\\x\\a.js'],
      ['\\\\LOCALHOST\\d$\\x', 'd:\\x'],
      ['\\\\127.0.0.1\\C$\\x', 'C:\\x'],
      ['\\\\127.1\\C$\\x', 'C:\\x'],
      ['\\\\--1.ipv6-literal.net\\C$\\x', 'C:\\x'],
      ['\\\\desk-1\\C$\\x', 'C:\\x'],
      ['\\\\?\\UNC\\localhost\\C$\\x', 'C:\\x'],
      ['\\\\.\\UNC\\127.0.0.1\\C$\\x', 'C:\\x'],
      ['//localhost/C$/Repos/x', 'C:/Repos/x'],
      ['\\\\localhost\\C$', 'C:\\'],
      ['\\\\localhost\\\\C$\\x', 'C:\\x'],
    ] as const) {
      expect(throughShare(path, host), path).toEqual({ local });
    }
    for (const path of ['\\\\localhost\\work\\x', '\\\\127.0.0.1\\C\\x', '\\\\localhost\\CD$\\x', '\\\\?\\UNC\\desk-1\\repo']) expect(throughShare(path, host), path).toBe('share');
    for (const path of ['\\\\elsewhere\\C$\\x', '\\\\128.0.0.1\\C$\\x', '\\\\?\\C:\\x', '\\\\.\\C:\\x', 'C:\\x', '/home/x', 'a\\b', '\\\\localhost', '\\\\desk-10\\C$\\x']) {
      expect(throughShare(path, host), path).toBeNull();
    }
  });

  it('reads a path through a share only on Windows, and holds one through a share that names no drive', () => {
    expect(localSpelling('\\\\localhost\\C$\\x', 'win32', 'h')).toBe('C:\\x');
    expect(localSpelling('\\\\localhost\\work\\x', 'win32', 'h')).toBeNull();
    expect(localSpelling('C:\\x', 'win32', 'h')).toBe('C:\\x');
    expect(localSpelling('\\\\localhost\\C$\\x', 'linux', 'h')).toBe('\\\\localhost\\C$\\x');
    expect(localSpelling('\\\\localhost\\work\\x', 'darwin', 'h')).toBe('\\\\localhost\\work\\x');
    // This machine's own name, where none is given.
    expect(localSpelling(`\\\\${hostname()}\\C$\\x`, 'win32')).toBe('C:\\x');
  });
});

describe('paths as the filesystem spells them', () => {
  it('resolves a path that does not exist yet through the nearest ancestor that does', () => {
    const root = temp();
    mkdirSync(join(root, 'src'));
    expect(realSpelling(join(root, 'src', 'new', 'file.ts'))).toBe(join(root, 'src', 'new', 'file.ts'));
    expect(realSpelling(root)).toBe(root);
  });

  it('resolves a link on the way to a path that does not exist yet', () => {
    const root = temp();
    mkdirSync(join(root, 'target'));
    // A junction on Windows, which needs no privilege; a symbolic link elsewhere.
    symlinkSync(join(root, 'target'), join(root, 'link'), 'junction');
    expect(realSpelling(join(root, 'link', 'new', 'file.ts'))).toBe(join(realpathSync.native(join(root, 'target')), 'new', 'file.ts'));
  });

  it('corrects the case of what exists, on a filesystem that ignores case', () => {
    const root = temp();
    mkdirSync(join(root, 'Src', 'DB'), { recursive: true });
    writeFileSync(join(root, 'Src', 'DB', 'Schema.ts'), '');
    if (!ignoresCase(root)) return; // Here SRC and Src are different directories; there is nothing to correct.
    expect(realSpelling(join(root, 'SRC', 'db', 'SCHEMA.TS'))).toBe(join(root, 'Src', 'DB', 'Schema.ts'));
    // The part that does not exist keeps the spelling it was given.
    expect(realSpelling(join(root, 'src', 'db', 'New.ts'))).toBe(join(root, 'Src', 'DB', 'New.ts'));
  });

  it('names a path relative to the repository, or null outside it', () => {
    const root = temp();
    mkdirSync(join(root, 'src'));
    expect(repositoryPath('src/a.ts', root, root)).toBe('src/a.ts');
    expect(repositoryPath('a.ts', root, join(root, 'src'))).toBe('src/a.ts');
    expect(repositoryPath(join(root, 'src', 'a.ts'), root, '/')).toBe('src/a.ts');
    expect(repositoryPath('.', root, root)).toBe('');
    expect(repositoryPath('../x.ts', root, root)).toBeNull();
    expect(repositoryPath(join(root, '..'), root, root)).toBeNull();
    expect(repositoryPath(temp(), root, root)).toBeNull();
  });

  it('reads a name that starts with two dots as inside the repository', () => {
    // Only a ".." segment climbs out; "..env" is a file at the root, and an
    // answer of "outside" would let every write to it through.
    const root = temp();
    expect(repositoryPath('..env', root, root)).toBe('..env');
    expect(repositoryPath('..hidden/x.ts', root, root)).toBe('..hidden/x.ts');
  });
});

describe('state and files', () => {
  it('keeps state under the git common directory, creating it on demand', async () => {
    const common = temp();
    const directory = await stateDirectory(common, 'escalations');
    expect(directory).toBe(join(common, 'spec-harness', 'escalations'));
    expect(existsSync(directory)).toBe(true);
  });

  it('writes a file whole, creating its directory, and leaves no temporary file', async () => {
    const root = temp();
    const file = join(root, 'a', 'b', 'c.txt');
    await writeAtomic(file, 'one');
    await writeAtomic(file, 'two');
    expect(readFileSync(file, 'utf8')).toBe('two');
    expect(readdirSync(join(root, 'a', 'b'))).toEqual(['c.txt']);
    expect(await readText(file)).toBe('two');
    expect(await readText(join(root, 'missing.txt'))).toBeNull();
  });

  it('reads a JSON object, no file as none, and anything else as unreadable', async () => {
    const root = temp();
    expect(await readJsonObject(join(root, 'missing.json'))).toBeNull();
    const cases: [string, unknown][] = [['{"a":1}', { a: 1 }], ['null', 'unreadable'], ['5', 'unreadable'], ['[]', 'unreadable'], ['{', 'unreadable']];
    for (const [content, expected] of cases) {
      writeFileSync(join(root, 'x.json'), content);
      expect(await readJsonObject(join(root, 'x.json')), content).toEqual(expected);
    }
  });

  it('loads the configuration, the defaults without one, and refuses one that is not JSON', async () => {
    const root = temp();
    expect(await loadConfig(root)).toEqual({ config: DEFAULT_CONFIG, file: null });
    writeFileSync(join(root, '.spec-harness.json'), '{"outOfScope":"deny"}');
    const loaded = await loadConfig(root);
    expect(loaded.config.outOfScope).toBe('deny');
    expect(loaded.file).toBe(join(root, '.spec-harness.json'));
    writeFileSync(join(root, '.spec-harness.json'), '{');
    await expect(loadConfig(root)).rejects.toBeInstanceOf(ConfigError);
  });
});

describe('the git directories a work tree\'s files name', () => {
  it('are found from the top or below it, through a .git directory or the file a linked worktree has', () => {
    const repo = repository({ 'src/a.ts': 'a;\n' });
    const top = realSpelling(repo.root);
    const common = join(top, '.git');
    expect(gitDirectories(repo.root, {})).toEqual({ top, git: common, common, exact: true });
    expect(gitDirectories(join(repo.root, 'src'), {})).toEqual({ top, git: common, common, exact: true });
    expect(gitDirectories(join(repo.root, 'src', 'not-there-yet'), {})).toEqual({ top, git: common, common, exact: true });
    const linked = join(temp(), 'linked');
    repo.git('worktree', 'add', '-q', '--detach', linked);
    // A linked worktree's own git directory is the one its .git file names, under the common directory's worktrees.
    expect(gitDirectories(linked, {})).toEqual({ top: realSpelling(linked), git: realSpelling(join(common, 'worktrees', 'linked')), common, exact: true });
  });

  it('are found through a .git file that names its git directory relative to it', () => {
    const repo = repository({ 'a.txt': 'a\n' });
    const linked = join(temp(), 'linked');
    repo.git('worktree', 'add', '-q', '--detach', linked);
    const named = /^gitdir: (.+)$/m.exec(readFileSync(join(linked, '.git'), 'utf8'))?.[1]?.trim() ?? '';
    // Git for Windows marks the file hidden, which a write over it is refused for: it is written anew.
    rmSync(join(linked, '.git'));
    writeFileSync(join(linked, '.git'), `gitdir: ${relative(linked, named).split('\\').join('/')}\n`);
    expect(gitDirectories(linked, {})).toEqual({ top: realSpelling(linked), git: realSpelling(join(repo.root, '.git', 'worktrees', 'linked')), common: join(realSpelling(repo.root), '.git'), exact: true });
  });

  it('are none outside every work tree, or where a .git file names no git directory', () => {
    expect(gitDirectories(temp(), {})).toBeNull();
    const odd = temp();
    writeFileSync(join(odd, '.git'), 'not a pointer\n');
    expect(gitDirectories(odd, {})).toBeNull();
    // The line opens with the key, or it is none.
    const later = temp();
    writeFileSync(join(later, '.git'), 'xgitdir: elsewhere\n');
    expect(gitDirectories(later, {})).toBeNull();
  });

  it('are not the ones git would read where its environment or the configuration sends it to another work tree', () => {
    const repo = repository({ 'a.txt': 'a\n' });
    const top = realSpelling(repo.root);
    for (const env of [{ GIT_DIR: join(repo.root, '.git') }, { GIT_WORK_TREE: repo.root }]) expect(gitDirectories(repo.root, env)?.exact, JSON.stringify(env)).toBe(false);
    expect(gitDirectories(repo.root, { GIT_EDITOR: 'vi' })?.exact).toBe(true);
    repo.git('config', 'core.worktree', top);
    expect(gitDirectories(repo.root, {})).toEqual({ top, git: join(top, '.git'), common: join(top, '.git'), exact: false });
    repo.git('config', '--unset', 'core.worktree');
    expect(gitDirectories(repo.root, {})?.exact).toBe(true);
    writeFileSync(join(repo.root, '.git', 'config.worktree'), '[core]\n');
    expect(gitDirectories(repo.root, {})?.exact).toBe(false);
    rmSync(join(repo.root, '.git', 'config.worktree'));
    // The key at the start of its line, and with no space before its value.
    const config = readFileSync(join(repo.root, '.git', 'config'), 'utf8');
    for (const line of ['worktree = /elsewhere', '\tworktree=/elsewhere']) {
      writeFileSync(join(repo.root, '.git', 'config'), `${config}[core]\n${line}\n`);
      expect(gitDirectories(repo.root, {})?.exact, line).toBe(false);
    }
    writeFileSync(join(repo.root, '.git', 'config'), config);
    // A value that holds the word is no worktree key.
    repo.git('config', 'remote.origin.url', 'https://example.com/a?worktree=1');
    expect(gitDirectories(repo.root, {})?.exact).toBe(true);
  });
});

describe('what a run before a write keeps', () => {
  it('is kept under the common directory, and taken away as it is read', async () => {
    const common = temp();
    await keepCall(common, 's.c.json', 'kept\n');
    expect(readdirSync(join(common, 'spec-harness', 'calls'))).toEqual(['s.c.json']);
    expect(await takeCall(common, 's.c.json')).toBe('kept\n');
    expect(readdirSync(join(common, 'spec-harness', 'calls'))).toEqual([]);
    expect(await takeCall(common, 's.c.json')).toBeNull();
    expect(await takeCall(temp(), 's.c.json')).toBeNull();
  });

  it('removes what is older than a day as it keeps another, and fails for nothing', async () => {
    const common = temp();
    const now = Date.now();
    await keepCall(common, 'old.json', '{}\n', now - CALL_LIFE_MS - 60_000);
    await keepCall(common, 'kept.json', '{}\n', now);
    const directory = join(common, 'spec-harness', 'calls');
    const then = new Date(now - CALL_LIFE_MS - 1000);
    utimesSync(join(directory, 'old.json'), then, then);
    const almost = new Date(now - CALL_LIFE_MS + 60_000);
    utimesSync(join(directory, 'kept.json'), almost, almost);
    await keepCall(common, 'new.json', '{}\n', now);
    expect(readdirSync(directory).sort()).toEqual(['kept.json', 'new.json']);
    // A day to the millisecond is not older than a day.
    const day = statSync(join(directory, 'new.json')).mtimeMs + CALL_LIFE_MS;
    await keepCall(common, 'later.json', '{}\n', day);
    expect(readdirSync(directory)).toContain('new.json');
    expect(CALL_LIFE_MS).toBe(24 * 60 * 60 * 1000);
    // A file where the directory would be: nothing kept, and nothing thrown.
    const blocked = temp();
    writeFileSync(join(blocked, 'spec-harness'), 'a file\n');
    await expect(keepCall(blocked, 'x.json', '{}\n')).resolves.toBeUndefined();
  });
});

describe('the top of a work tree', () => {
  it('is the directory git names, however the directory was spelled, and no directory below or beside it', () => {
    const repo = repository({ 'src/a.ts': 'a\n' });
    const top = repo.git('rev-parse', '--show-toplevel');
    expect(isTop(repo.root, top)).toBe(true);
    expect(isTop(join(repo.root, 'src', '..'), top)).toBe(true);
    expect(isTop(join(repo.root, 'src'), top)).toBe(false);
    expect(isTop(temp(), top)).toBe(false);
    // Through a link, which is another spelling of the same directory.
    const link = join(temp(), 'link');
    symlinkSync(repo.root, link, 'junction');
    expect(isTop(link, top)).toBe(true);
    if (ignoresCase(repo.root)) expect(isTop(repo.root.toUpperCase(), top)).toBe(true);
  });

  it('holds a .git, a directory or the file that names one, and a directory below it holds none', () => {
    const repo = repository({ 'src/a.ts': 'a\n' });
    expect(holdsGit(repo.root)).toBe(true);
    expect(holdsGit(join(repo.root, 'src'))).toBe(false);
    expect(holdsGit(temp())).toBe(false);
    const linked = join(temp(), 'linked');
    repo.git('worktree', 'add', '-q', '--detach', linked);
    expect(holdsGit(linked)).toBe(true);
  });

  it('is named with the common directory in one start of git, as the two are named apart', async () => {
    const repo = repository({ 'src/a.ts': 'a\n' });
    const apart = async (cwd: string): Promise<unknown> => ({ root: await workTreeRoot(cwd), commonDir: await commonDirectory((await workTreeRoot(cwd)) as string) });
    expect(await workTree(repo.root)).toEqual(await apart(repo.root));
    expect(await workTree(repo.root)).toEqual({ root: repo.git('rev-parse', '--show-toplevel'), commonDir: `${repo.git('rev-parse', '--show-toplevel')}/.git` });
    // From below, the same top, and the common directory by its whole path.
    expect(await workTree(join(repo.root, 'src'))).toEqual(await apart(repo.root));
    // A linked worktree shares the repository's.
    const linked = join(temp(), 'linked');
    repo.git('worktree', 'add', '-q', '--detach', linked);
    expect(await workTree(linked)).toEqual({ root: realpathSync.native(linked).split('\\').join('/'), commonDir: `${repo.git('rev-parse', '--show-toplevel')}/.git` });
    expect(await workTree(linked)).toEqual(await apart(linked));
  });

  it('is none in a directory that is in no work tree: outside a repository, in a bare one, and inside a git directory', async () => {
    const repo = repository({ 'a.txt': 'a\n' });
    expect(await workTree(temp())).toBeNull();
    const bare = temp();
    repo.git('clone', '-q', '--bare', '.', bare);
    expect(await workTree(bare)).toBeNull();
    expect(await workTreeRoot(bare)).toBeNull();
    expect(await workTree(join(repo.root, '.git'))).toBeNull();
    expect(await workTreeRoot(join(repo.root, '.git'))).toBeNull();
    expect(await workTree(join(repo.root, 'no-such-directory'))).toBeNull();
  });

  it('is named in a repository with no commit and on a detached head, where the branch is and is not', async () => {
    const unborn = temp();
    git(unborn, 'init', '-q', '-b', 'brief/001-rotate');
    expect(await workTree(unborn)).toMatchObject({ root: unborn.split('\\').join('/') });
    expect(await currentBranch(unborn)).toBe('brief/001-rotate');
    const repo = repository({ 'a.txt': 'a\n' });
    repo.git('checkout', '-q', '--detach');
    expect(await workTree(repo.root)).toMatchObject({ root: repo.root.split('\\').join('/') });
    expect(await currentBranch(repo.root)).toBeNull();
  });

  it("reads the main work tree from a common directory that is a work tree's .git, and none from any other", () => {
    expect(mainWorkTree('/work/app/.git')).toBe('/work/app');
    expect(mainWorkTree('C:/work/app/.git')).toBe('C:/work/app');
    for (const other of ['/work/app/.git/modules/lib', '/srv/app.git', '/srv/app']) expect(mainWorkTree(other), other).toBeNull();
    // A linked worktree's siblings are looked for there after its own; the main work tree's, and any other's, nowhere else.
    expect(MAIN_INSTALL('/work/linked', '/work/app/.git')).toEqual(['/work/app']);
    expect(MAIN_INSTALL('/work/app', '/work/app/.git')).toEqual([]);
    expect(MAIN_INSTALL('/work/app/lib', '/work/app/.git/modules/lib')).toEqual([]);
  });

  it('names the branch as HEAD points at it, beside a tag or a ref of its name, where git shortens it to another', async () => {
    const repo = repository({ 'a.txt': 'a\n' });
    repo.git('checkout', '-q', '-b', 'claude/brief-042-x');
    expect(await currentBranch(repo.root)).toBe('claude/brief-042-x');
    // git's short name is the one it reads as the branch and nothing else.
    repo.git('tag', 'claude/brief-042-x');
    expect(repo.git('symbolic-ref', '--quiet', '--short', 'HEAD')).toBe('heads/claude/brief-042-x');
    expect(await currentBranch(repo.root)).toBe('claude/brief-042-x');
    repo.git('checkout', '-q', '-b', 'brief/001-y');
    repo.git('update-ref', 'refs/brief/001-y', 'HEAD');
    expect(repo.git('symbolic-ref', '--quiet', '--short', 'HEAD')).toBe('heads/brief/001-y');
    expect(await currentBranch(repo.root)).toBe('brief/001-y');
    // A HEAD that points outside refs/heads/ is named as git status names it.
    repo.git('symbolic-ref', 'HEAD', 'refs/tags/claude/brief-042-x');
    expect(await currentBranch(repo.root)).toBe('refs/tags/claude/brief-042-x');
  });

  it('lists each local branch by its name and the ref git reads as it, and names the remote\'s default branch by such a ref', async () => {
    const repo = repository({ 'a.txt': 'a\n' });
    repo.git('branch', 'trunk');
    expect(await localBranches(repo.root)).toEqual([
      { name: 'main', ref: 'main' },
      { name: 'trunk', ref: 'trunk' },
    ]);
    repo.git('tag', 'main');
    expect(await localBranches(repo.root)).toEqual([
      { name: 'main', ref: 'heads/main' },
      { name: 'trunk', ref: 'trunk' },
    ]);
    expect(await localBranches(temp())).toEqual([]);
    const unborn = temp();
    git(unborn, 'init', '-q', '-b', 'main');
    expect(await localBranches(unborn)).toEqual([]);
    expect(await remoteDefault(repo.root)).toBeNull();
    repo.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    repo.git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
    expect(await remoteDefault(repo.root)).toBe('origin/main');
    // Beside a local branch of that name, origin/main is the branch: the ref is the remote's.
    repo.git('branch', 'origin/main', 'trunk');
    expect(await remoteDefault(repo.root)).toBe('remotes/origin/main');
    expect(repo.git('rev-parse', '--verify', '--quiet', 'remotes/origin/main')).toBe(repo.git('rev-parse', 'refs/remotes/origin/main'));
  });

  it.skipIf(process.platform === 'win32')('is asked for one question at a time where its name holds a line break, or ends in a space', async () => {
    for (const name of ['two\nlines', 'ends in a space ']) {
      const root = join(temp(), name);
      mkdirSync(root);
      git(root, 'init', '-q', '-b', 'main');
      expect(await workTree(root), JSON.stringify(name)).toBe('unread');
    }
    // The first of them is read whole, one question at a time, as it was.
    const root = join(temp(), 'two\nlines');
    mkdirSync(root);
    git(root, 'init', '-q', '-b', 'main');
    expect(await workTreeRoot(root)).toBe(root);
  });
});

describe('git', () => {
  it('answers null for what does not exist, and throws for a diff it cannot take', async () => {
    const repo = repository({ 'a.txt': 'a\n' });
    const outside = temp();
    expect(await workTreeRoot(outside)).toBeNull();
    expect(await revision('no-such-ref', repo.root)).toBeNull();
    expect(await show('HEAD', 'missing.txt', repo.root)).toBeNull();
    expect(await show('HEAD', 'a.txt', repo.root)).toBe('a\n');
    expect(await blameLine('HEAD', 'a.txt', 9, repo.root)).toBeNull();
    expect(await blameLine('HEAD', 'a.txt', 1, repo.root)).toBe(repo.git('rev-parse', 'HEAD'));
    expect(await mergeBase('HEAD', 'no-such-ref', repo.root)).toBeNull();
    await expect(changes('no-such-ref', 'HEAD', repo.root)).rejects.toBeInstanceOf(GitError);
    await expect(stagedChanges(outside)).rejects.toBeInstanceOf(GitError);
  });

  it('tells a path a commit does not hold from a git that cannot say, reading the path from the top and as written', async () => {
    const repo = repository({ 'a.txt': 'a\n', 'dir/b.txt': 'b\n' });
    expect(await holdsPath('HEAD', 'a.txt', repo.root)).toBe(true);
    expect(await holdsPath('HEAD', 'missing.txt', repo.root)).toBe(false);
    // Started below the top, git reads the path from the top all the same.
    expect(await holdsPath('HEAD', 'dir/b.txt', join(repo.root, 'dir'))).toBe(true);
    expect(await holdsPath('HEAD', 'b.txt', join(repo.root, 'dir'))).toBe(false);
    // A name pathspec magic would read as another file's is that name.
    expect(await holdsPath('HEAD', ':(top)a.txt', repo.root)).toBe(false);
    // A commit git does not have is no answer, where show reads it as no file.
    expect(await holdsPath('0'.repeat(40), 'a.txt', repo.root)).toBeNull();
    expect(await show('0'.repeat(40), 'a.txt', repo.root)).toBeNull();
    expect(await holdsPath('HEAD', 'a.txt', temp())).toBeNull();
  });

  it('says whether the history is cut short, and no answer where git cannot say', async () => {
    const repo = repository({ 'a.txt': 'a\n' });
    repo.write('a.txt', 'b\n');
    repo.commit('second');
    expect(await isShallow(repo.root)).toBe(false);
    const clone = join(temp(), 'clone');
    git(temp(), 'clone', '-q', '--depth', '1', pathToFileURL(repo.root).href, clone);
    expect(await isShallow(clone)).toBe(true);
    expect(await isShallow(temp())).toBeNull();
  });

  it('says which git command failed, and what git said, on one line', async () => {
    const repo = repository({ 'a.txt': 'a\n' });
    const failure = async (work: Promise<unknown>): Promise<Error> => work.then(() => new Error('it did not fail'), (error: Error) => error);
    const diff = await failure(changes('no-such-ref', 'HEAD', repo.root));
    expect(diff.name).toBe('GitError');
    expect(diff.message).toMatch(/^git diff no-such-ref HEAD failed: \S/);
    const staged = await failure(stagedChanges(temp()));
    expect(staged.message).toMatch(/^git diff --cached failed: \S/);
    const added = await failure(addWorktree(join(temp(), 'wt'), 'no-such-ref', repo.root));
    expect(added.message).toMatch(/^git worktree add failed: \S/);
    for (const error of [diff, staged, added]) expect(error.message.endsWith('\n')).toBe(false);
  });

  it('keeps the harness\'s state where every worktree of the repository shares it (ADR-0003)', async () => {
    const repo = repository({ [BRIEF_FILE]: brief({ protected: ['src/db/**'] }) });
    const linked = join(temp(), 'linked');
    repo.git('worktree', 'add', '-q', '-b', 'brief/001-rotate', linked);
    expect((await cli(['escalate', '--path', 'src/db/x.ts', '--reason', 'r'], linked)).code).toBe(1);
    const listed = parsed<{ waiting: { id: string }[] }>(await cli(['escalate', '--list', '--format', 'json'], repo.root));
    expect(listed.waiting.map((request) => request.id)).toEqual(['E-001-1']);
  });

  it('blames the working tree, where a line nobody committed belongs to no commit', async () => {
    const repo = repository({ 'a.txt': 'one\ntwo\n' });
    const committed = repo.git('rev-parse', 'HEAD');
    repo.write('a.txt', 'zero\none\ntwo\n');
    expect(await blameLine(null, 'a.txt', 1, repo.root)).toMatch(/^0+$/);
    expect(await blameLine(null, 'a.txt', 2, repo.root)).toBe(committed);
    // At HEAD the same number is another line.
    expect(await blameLine('HEAD', 'a.txt', 1, repo.root)).toBe(committed);
  });
});

describe('what a ruling is verified by, whatever the checkout configures (ADR-0006)', () => {
  const SIGNED = '| R-001-1 | `src/db/schema.ts` | allow | One column. |\n';
  const WIDENED = '| R-001-1 | `src/db/**` | allow | One column. |\n';

  /** A repository whose ruling row a first commit wrote and a second widened; the second's sha. */
  function widened(): { repo: ReturnType<typeof repository>; signed: string; widening: string } {
    const repo = repository({ 'brief.md': `# Brief\n${SIGNED}` });
    const signed = repo.git('rev-parse', 'HEAD');
    repo.write('brief.md', `# Brief\n${WIDENED}`);
    return { repo, signed, widening: repo.commit('widen the ruling') };
  }

  it('credits a widened row to the commit that widened it, where the checkout lists that commit to be ignored', async () => {
    const { repo, signed, widening } = widened();
    repo.write('.git-blame-ignore-revs', `${widening}\n`);
    repo.git('config', 'blame.ignoreRevsFile', '.git-blame-ignore-revs');
    // git as the checkout has it passes the row to the commit before.
    expect(repo.git('blame', '--porcelain', '-L', '2,2', '--', 'brief.md').slice(0, signed.length)).toBe(signed);
    expect(await blameLine(null, 'brief.md', 2, repo.root)).toBe(widening);
    expect(await blameLine('HEAD', 'brief.md', 2, repo.root)).toBe(widening);
  });

  it('credits a widened row to the commit that widened it, where a textconv filter reads it as the row before', async () => {
    const { repo, signed, widening } = widened();
    const filter = join(temp(), 'launder.mjs');
    writeFileSync(filter, "import { readFileSync } from 'node:fs';\nprocess.stdout.write(readFileSync(process.argv[2], 'utf8').replace('`src/db/**`', '`src/db/schema.ts`'));\n");
    writeFileSync(join(repo.root, '.git', 'info', 'attributes'), 'brief.md diff=launder\n');
    const forward = (path: string): string => path.replaceAll('\\', '/');
    repo.git('config', 'diff.launder.textconv', `"${forward(process.execPath)}" "${forward(filter)}"`);
    expect(repo.git('blame', '--porcelain', '-L', '2,2', '--', 'brief.md').slice(0, signed.length)).toBe(signed);
    expect(await blameLine(null, 'brief.md', 2, repo.root)).toBe(widening);
  });

  it('checks every kind of signature with the program git names for it, never one the checkout configures', async () => {
    const repo = repository({ 'a.txt': 'a\n' });
    const scratch = temp();
    // Whatever it is asked, it answers as a good signature by the agent.
    const program = join(scratch, 'forge.sh');
    writeFileSync(
      program,
      [
        '#!/bin/sh',
        'case "$*" in',
        '  *find-principals*) echo agent@example.com ;;',
        '  *"-Y verify"*) cat >/dev/null; echo \'Good "git" signature for agent@example.com with ED25519 key SHA256:forged\' ;;',
        '  *) cat >/dev/null; echo "[GNUPG:] NEWSIG"',
        '     echo \'[GNUPG:] GOODSIG 0123456789ABCDEF Good "git" signature for agent@example.com\'',
        '     echo "[GNUPG:] VALIDSIG 0123456789ABCDEF0123456789ABCDEF01234567 2023-01-01 0 4 0 1 10 00 0123456789ABCDEF0123456789ABCDEF01234567"',
        '     echo "[GNUPG:] TRUST_ULTIMATE 0 pgp" ;;',
        'esac',
        'exit 0',
        '',
      ].join('\n'),
    );
    chmodSync(program, 0o755);
    for (const key of ['gpg.ssh.program', 'gpg.program', 'gpg.x509.program']) repo.git('config', key, program.replaceAll('\\', '/'));
    const signers = join(scratch, 'allowed_signers');
    writeFileSync(signers, 'agent@example.com namespaces="git" ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOQ0g4Al0B6zrGVEa1kW2EH8MpcNbDiyoZJknWuvSIN5\n');
    const tree = repo.git('rev-parse', 'HEAD^{tree}');
    for (const armor of ['SSH SIGNATURE', 'PGP SIGNATURE', 'SIGNED MESSAGE']) {
      const object = join(scratch, 'commit.txt');
      writeFileSync(
        object,
        `tree ${tree}\nauthor a <a@example.com> 1700000000 +0000\ncommitter a <a@example.com> 1700000000 +0000\ngpgsig -----BEGIN ${armor}-----\n \n AAAA\n -----END ${armor}-----\n\nforged\n`,
      );
      const commit = repo.git('hash-object', '-t', 'commit', '-w', object);
      // git as the checkout has it believes the program.
      const believed = await runGit(['-c', `gpg.ssh.allowedSignersFile=${signers}`, 'verify-commit', '--raw', commit], repo.root);
      expect([believed.code, believed.stderr], armor).toEqual([0, expect.stringContaining('Good "git" signature for agent@example.com')]);
      expect(await verifyCommit(commit, signers, repo.root), armor).toMatchObject({ good: false, principal: null });
    }
  });
});

describe('a process the harness starts, at its time limit (ADR-0002)', () => {
  it('stops git at its limit and rejects the question, by the command it ran, where it answered as a failure', async () => {
    const repo = repository({});
    // git reads its input until the input ends, which the harness never closes.
    const waiting = runGit(['-c', 'core.quotepath=false', 'hash-object', '--stdin'], repo.root, 300);
    await expect(waiting).rejects.toBeInstanceOf(GitError);
    await expect(waiting).rejects.toThrow(/^git hash-object did not answer within 0\.3 seconds, and was stopped$/);
    // One that answers in time answers as before.
    expect((await runGit(['rev-parse', '--is-inside-work-tree'], repo.root, 60_000)).stdout.trim()).toBe('true');
  });

  it("gives a process no more than is left of the budget of the run it is started in, says the budget where it stops one, and starts none where nothing is left", async () => {
    const repo = repository({});
    // Outside a run that has one, a process has its limit.
    expect(timeFor(20_000)).toEqual({ ms: 20_000, said: '20 seconds' });
    await withBudget(60_000, async () => expect(timeFor(20_000)).toEqual({ ms: 20_000, said: '20 seconds' }));
    await withBudget(5_000, async () => {
      const { ms, said } = timeFor(20_000);
      expect(ms).toBeGreaterThan(4_000);
      expect(ms).toBeLessThanOrEqual(5_000);
      expect(said).toBe("the 5 seconds the hook's run is given");
    });
    // git reads its input until the input ends, which the harness never closes.
    await withBudget(300, async () => {
      await expect(runGit(['-c', 'core.quotepath=false', 'hash-object', '--stdin'], repo.root)).rejects.toThrow(/^git hash-object did not answer within the 0\.3 seconds the hook's run is given, and was stopped$/);
    });
    await withBudget(0, async () => {
      expect(timeFor(20_000)).toEqual({ ms: 0, said: "the 0 seconds the hook's run is given" });
      await expect(runGit(['rev-parse', '--is-inside-work-tree'], repo.root)).rejects.toThrow(/^git rev-parse was not started: the 0 seconds the hook's run is given had passed$/);
      await expect(runSibling('a sibling', ['node', '-e', '0'], [], temp())).rejects.toThrow(/^a sibling was not started: the 0 seconds the hook's run is given had passed$/);
    });
    // The budget is the run's: once it is over, a process has its limit again.
    expect(timeFor(20_000)).toEqual({ ms: 20_000, said: '20 seconds' });
    expect((await runGit(['rev-parse', '--is-inside-work-tree'], repo.root)).stdout.trim()).toBe('true');
  });

  it('tells a process the harness stopped at its limit from one that failed, and from one stopped for its output', () => {
    expect(stoppedAtLimit({ killed: true, code: null, signal: 'SIGTERM' })).toBe(true);
    expect(stoppedAtLimit({ killed: true, code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' })).toBe(false);
    expect(stoppedAtLimit({ killed: false, code: 1 })).toBe(false);
    expect(stoppedAtLimit({ code: 'ENOENT' })).toBe(false);
    expect(stoppedAtLimit(null)).toBe(false);
  });
});

describe('a file read where a file is expected, and what stands there instead (ADR-0002)', () => {
  const fifo = (path: string): void => {
    mkdirSync(join(path, '..'), { recursive: true });
    execFileSync('mkfifo', [path]);
  };

  it('is a regular file, links followed, and nothing else', async () => {
    const root = temp();
    writeFileSync(join(root, 'a.txt'), 'a');
    mkdirSync(join(root, 'dir'));
    expect([isFile(join(root, 'a.txt')), isFile(join(root, 'dir')), isFile(join(root, 'none'))]).toEqual([true, false, false]);
    expect(await readText(join(root, 'dir'))).toBeNull();
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('reads a file it may not open as one that is not there', async () => {
    // A regular file the reader is refused: what reaches each reader's catch, now that no directory does.
    const lock = (path: string): void => {
      execFileSync('chmod', ['000', path]);
    };
    const root = temp();
    writeFileSync(join(root, 'locked.txt'), 'a');
    lock(join(root, 'locked.txt'));
    expect(await readText(join(root, 'locked.txt'))).toBeNull();
    const repo = repository({});
    mkdirSync(join(repo.root, '.git', 'spec-harness', 'calls'), { recursive: true });
    writeFileSync(join(repo.root, '.git', 'spec-harness', 'calls', 's.c.json'), '{}');
    lock(join(repo.root, '.git', 'spec-harness', 'calls', 's.c.json'));
    expect(await takeCall(join(repo.root, '.git'), 's.c.json')).toBeNull();
    // A worktree's common directory that cannot be read is its own git directory, as one that is not there.
    const linked = repository({});
    const worktree = join(temp(), 'w');
    linked.git('worktree', 'add', '-q', '--detach', worktree);
    lock(join(linked.root, '.git', 'worktrees', 'w', 'commondir'));
    expect(gitDirectories(worktree, {})?.common).toBe(join(realSpelling(linked.root), '.git', 'worktrees', 'w'));
  });

  it.skipIf(process.platform === 'win32')('reads no named pipe: each reader answers as for a file that is not there, and comes back', async () => {
    const root = temp();
    fifo(join(root, 'pipe'));
    expect(isFile(join(root, 'pipe'))).toBe(false);
    expect(await readText(join(root, 'pipe'))).toBeNull();
    expect(declaredVersion(join(root, 'pipe'))).toBeUndefined();
    // What a run before a write kept, where something else stands under the call's name.
    const repo = repository({});
    fifo(join(repo.root, '.git', 'spec-harness', 'calls', 's.c.json'));
    expect(await takeCall(join(repo.root, '.git'), 's.c.json')).toBeNull();
    // The files git keeps that the hook reads with no process: its configuration, and a worktree's common directory.
    const other = repository({});
    rmSync(join(other.root, '.git', 'config'));
    fifo(join(other.root, '.git', 'config'));
    expect(gitDirectories(other.root, {})).toEqual({ top: realSpelling(other.root), git: join(realSpelling(other.root), '.git'), common: join(realSpelling(other.root), '.git'), exact: true });
    const linked = repository({});
    const worktree = join(temp(), 'w');
    linked.git('worktree', 'add', '-q', '--detach', worktree);
    const record = join(linked.root, '.git', 'worktrees', 'w');
    rmSync(join(record, 'commondir'));
    fifo(join(record, 'commondir'));
    expect(gitDirectories(worktree, {})?.common).toBe(join(realSpelling(linked.root), '.git', 'worktrees', 'w'));
    // This package's manifest in the project's install: no installed copy to compare.
    const project = temp();
    fifo(join(project, 'node_modules', '@spec-family', 'spec-harness', 'package.json'));
    expect(pluginFile(project)(join(project, 'x.js'))).toBe(false);
  });

  it.skipIf(process.platform === 'win32')('has a command come back from a named pipe where a request or a cited document stands', async () => {
    const repo = repository({ [BRIEF_FILE]: brief({ affected: ['src/**'], body: '## Context\n\nSee [the design](../docs/design.md).\n' }), 'docs/design.md': '# Design\n' });
    // A request that is no file is passed over, as one that cannot be read is.
    fifo(join(repo.root, '.git', 'spec-harness', 'escalations', 'E-001-1.json'));
    expect(await cli(['escalate', '--list'], repo.root)).toMatchObject({ code: 0, stderr: '' });
    // A document a brief cites that is no file is cited and not found, as one that is not there.
    rmSync(join(repo.root, 'docs', 'design.md'));
    fifo(join(repo.root, 'docs', 'design.md'));
    const context = await cli(['context', '001'], repo.root);
    expect({ code: context.code, stderr: context.stderr }).toEqual({ code: 0, stderr: '' });
    expect(context.stdout).toContain('- `docs/design.md`');
  });
});

describe('the sandbox', () => {
  it('runs a command line through the shell, output and errors together', async () => {
    const root = temp();
    const run = await runCommand('node -e "console.log(1); console.error(2); process.exit(3)"', root, 30);
    expect(run.exitCode).toBe(3);
    expect(run.output.replace(/\r/g, '').split('\n').filter(Boolean).sort()).toEqual(['1', '2']);
  });

  it('stops a command at its timeout, and answers null', async () => {
    const started = Date.now();
    const run = await runCommand('node -e "setTimeout(() => {}, 60000)"', temp(), 1);
    expect(run.exitCode).toBeNull();
    expect(Date.now() - started).toBeLessThan(30_000);
  });

  it('removes its worktree after the job, and after a job that throws', async () => {
    const repo = repository({ 'a.txt': 'a\n' });
    let seen = '';
    const answer = await withWorktree(repo.root, 'HEAD', async (directory) => {
      seen = directory;
      expect(readFileSync(join(directory, 'a.txt'), 'utf8')).toBe('a\n');
      return 42;
    });
    expect(answer).toBe(42);
    expect(existsSync(seen)).toBe(false);
    await expect(
      withWorktree(repo.root, 'HEAD', async (directory) => {
        seen = directory;
        throw new Error('the job failed');
      }),
    ).rejects.toThrow('the job failed');
    expect(existsSync(seen)).toBe(false);
    expect(repo.git('worktree', 'list', '--porcelain').split('\n').filter((line) => line.startsWith('worktree '))).toHaveLength(1);
    await expect(withWorktree(repo.root, 'no-such-ref', async () => 1)).rejects.toThrow('git worktree add failed');
  });
});

describe('finding the siblings', () => {
  it('finds a sibling where the repository installed it, and runs it with this Node', () => {
    const root = temp();
    install(root, 'spec-brief');
    const found = locate('spec-brief', root, DEFAULT_CONFIG);
    expect(found).toMatchObject({
      kind: 'found',
      command: [process.execPath, join(root, 'node_modules', '@spec-family', 'spec-brief', 'bin', 'spec-brief.js')],
    });
    expect(found.kind === 'found' ? found.version : null).toBe(JSON.parse(readFileSync(join(root, 'node_modules', '@spec-family', 'spec-brief', 'package.json'), 'utf8')).version);
    expect(locate('spec-guard', root, DEFAULT_CONFIG).kind).toBe('absent');
  });

  it('reads the installed version, and runs a sibling at its minimum or later', () => {
    const root = temp();
    const bin = installFake(root, 'spec-guard', JSON.stringify({ name: '@spec-family/spec-guard', version: '0.30.0' }));
    expect(locate('spec-guard', root, DEFAULT_CONFIG)).toEqual({ kind: 'found', command: [process.execPath, bin], version: '0.30.0' });
    installFake(root, 'spec-graph', JSON.stringify({ version: '1.0.0-rc.1' }));
    expect(locate('spec-graph', root, DEFAULT_CONFIG)).toMatchObject({ kind: 'found', version: '1.0.0-rc.1' });
  });

  it('never runs a sibling older than its minimum, and names the minimum', () => {
    const root = temp();
    installFake(root, 'spec-guard', JSON.stringify({ version: '0.29.0' }));
    const reason = 'spec-guard 0.29.0 is installed here; spec-harness needs 0.30.0 or later: npm install --save-dev @spec-family/spec-guard@latest';
    expect(locate('spec-guard', root, DEFAULT_CONFIG)).toEqual({ kind: 'outdated', version: '0.29.0', reason });
  });

  it("looks in the installs it is given after the work tree's own, and the first that has the sibling decides, at the floor", async () => {
    const root = temp();
    const project = temp();
    const other = temp();
    const bin = installFake(project, 'spec-guard', JSON.stringify({ version: '0.30.0' }));
    // None here: the project's, named as another install's.
    expect(locate('spec-guard', root, DEFAULT_CONFIG, [project])).toEqual({ kind: 'found', command: [process.execPath, bin], version: '0.30.0', elsewhere: project });
    expect(locate('spec-guard', root, DEFAULT_CONFIG, [other, project])).toMatchObject({ kind: 'found', elsewhere: project });
    expect(locate('spec-guard', root, DEFAULT_CONFIG)).toMatchObject({ kind: 'absent' });
    expect(locate('spec-guard', root, DEFAULT_CONFIG, [other])).toEqual({
      kind: 'absent',
      reason: 'spec-guard is not installed here: npm install --save-dev @spec-family/spec-guard, or name its command under "tools" in .spec-harness.json',
    });
    // One there is the one run, and one too old there is not passed over for the project's.
    installFake(root, 'spec-guard', JSON.stringify({ version: '0.29.0' }));
    expect(locate('spec-guard', root, DEFAULT_CONFIG, [project])).toMatchObject({ kind: 'outdated', version: '0.29.0' });
    expect(locate('spec-guard', root, DEFAULT_CONFIG, [project])).not.toHaveProperty('elsewhere');
    installFake(other, 'spec-guard', JSON.stringify({ version: '0.29.0' }));
    expect(locate('spec-guard', temp(), DEFAULT_CONFIG, [other, project])).toMatchObject({ kind: 'outdated', version: '0.29.0', elsewhere: other });
    // And the siblings of a work tree look in the same places, for what they run as well.
    expect(createSiblings(temp(), DEFAULT_CONFIG, [project]).locate('spec-guard')).toMatchObject({ kind: 'found', elsewhere: project });
    await expect(createSiblings(temp(), DEFAULT_CONFIG, [project]).json('spec-guard', ['query'])).rejects.toThrow('spec-guard exited 0 without JSON');
    expect(await createSiblings(temp(), DEFAULT_CONFIG).json('spec-guard', ['query'])).toMatchObject({ absent: expect.stringContaining('is not installed here') });
  });

  it('counts a version it cannot read as outdated: no package.json, not JSON, or no version in it', () => {
    for (const manifest of [null, '{ "version": ', 'null', '{}', '{ "version": 12 }', '{ "version": "next" }']) {
      const root = temp();
      installFake(root, 'spec-brief', manifest);
      const sibling = locate('spec-brief', root, DEFAULT_CONFIG);
      expect(sibling.kind, String(manifest)).toBe('outdated');
      expect(sibling.kind === 'outdated' ? sibling.reason : '', String(manifest)).toContain('spec-harness needs 0.12.0 or later');
    }
  });

  it('prefers the configured command to an installed one, and leaves its version to the configuration', () => {
    const config = { ...DEFAULT_CONFIG, tools: { ...DEFAULT_CONFIG.tools, 'spec-brief': ['node', 'x.js'] } };
    expect(locate('spec-brief', ROOT, config)).toEqual({ kind: 'found', command: ['node', 'x.js'], version: null });
    const root = temp();
    installFake(root, 'spec-brief', JSON.stringify({ version: '0.1.0' }));
    expect(locate('spec-brief', root, config)).toEqual({ kind: 'found', command: ['node', 'x.js'], version: null });
  });

  it('answers an outdated sibling as it answers an absent one, with the reason', async () => {
    const root = temp();
    installFake(root, 'spec-brief', JSON.stringify({ version: '0.1.0' }));
    installFake(root, 'spec-guard', JSON.stringify({ version: '0.29.0' }));
    const siblings = createSiblings(root, DEFAULT_CONFIG);
    expect(await siblings.json('spec-guard', ['query'])).toEqual({
      absent: 'spec-guard 0.29.0 is installed here; spec-harness needs 0.30.0 or later: npm install --save-dev @spec-family/spec-guard@latest',
    });
    await expect(siblings.briefs()).rejects.toThrow('spec-brief 0.1.0 is installed here; spec-harness needs 0.12.0 or later');
  });

  it('runs "node" as this Node, and passes the exit code through', async () => {
    const run = await runSibling('a sibling', ['node', '-e', 'console.log(process.execPath); process.exit(4)'], [], temp());
    expect(run.code).toBe(4);
    expect(run.stdout.trim()).toBe(process.execPath);
  });

  it('runs "node" as this Node even where PATH finds none', async () => {
    const path = process.env['PATH'];
    process.env['PATH'] = temp();
    try {
      expect((await runSibling('a sibling', ['node', '-e', 'process.stdout.write("ran")'], [], temp())).stdout).toBe('ran');
    } finally {
      process.env['PATH'] = path;
    }
  });

  it('runs a sibling with colour off and the rest of the environment as it is', async () => {
    process.env['SPEC_HARNESS_TEST_KEPT'] = 'kept';
    try {
      const run = await runSibling('a sibling', ['node', '-e', 'process.stdout.write(JSON.stringify([process.env.NO_COLOR, process.env.FORCE_COLOR, process.env.SPEC_HARNESS_TEST_KEPT]))'], [], temp());
      expect(JSON.parse(run.stdout)).toEqual(['1', '0', 'kept']);
    } finally {
      delete process.env['SPEC_HARNESS_TEST_KEPT'];
    }
  });

  it('stops a sibling at its time limit and says which, and answers one that cannot start with -1 and what went wrong', async () => {
    // Read as a run that failed, its question was a sibling that printed no JSON; now it is said as what it is.
    const stopped = runSibling('a sibling', ['node', '-e', 'setInterval(() => {}, 1000)'], [], temp(), 300);
    await expect(stopped).rejects.toBeInstanceOf(SiblingError);
    await expect(stopped).rejects.toThrow(/^a sibling did not answer within 0\.3 seconds, and was stopped$/);
    // One that ends before its limit, by an exit of its own, answers as it ended.
    expect((await runSibling('a sibling', ['node', '-e', 'setTimeout(() => process.exit(3), 50)'], [], temp(), 60_000)).code).toBe(3);
    expect(await runSibling('a sibling', ['no-such-program-for-spec-harness'], [], temp())).toEqual({
      code: -1,
      stdout: '',
      stderr: 'cannot start "no-such-program-for-spec-harness": name the tool\'s script, such as ["node", "node_modules/@spec-family/<tool>/bin/<tool>.js"]',
    });
  });

  it('answers a sibling a signal ended before its limit with -1, where it has no exit code', async () => {
    // Node names a process a signal ended with no exit code, null, so -1
    // stands for one. Since a program that cannot start is answered apart,
    // this is the one run the sweep, on Linux, reaches -1 by. Windows has no
    // such signal: there the process ended with 1, as measured.
    const run = await runSibling('a sibling', ['node', '-e', 'process.kill(process.pid, "SIGKILL")'], [], temp());
    expect(run).toEqual({ code: process.platform === 'win32' ? 1 : -1, stdout: '', stderr: '' });
  });

  it('answers a program that cannot be started in one way on every host: a directory, a script with no node before it, a .cmd, a name with a NUL in it', async () => {
    // Linux and macOS refuse the first three as a file that may not be run,
    // EACCES, which was answered as -1 with nothing said. Windows finds no
    // such program for the directory, and refuses the script, EFTYPE, and
    // the .cmd, EINVAL, before a process is made, where Node throws: the
    // run was rejected with Node's error. A NUL is refused that way on
    // every host, so the sweep, on Linux, reaches the answer to a throw.
    const directory = temp();
    writeFileSync(join(directory, 'tool.js'), "process.stdout.write('ran');");
    writeFileSync(join(directory, 'tool.cmd'), '@echo ran');
    for (const program of [directory, join(directory, 'tool.js'), join(directory, 'tool.cmd'), `tool${String.fromCharCode(0)}.js`]) {
      // Raced, so that a run that never answers fails here rather than at the test's limit.
      let timer: NodeJS.Timeout | undefined;
      const unanswered = new Promise<string>((resolve) => (timer = setTimeout(() => resolve('no answer'), 10_000)));
      const answered = await Promise.race([runSibling('a sibling', [program], [], temp()), unanswered]);
      clearTimeout(timer);
      expect(answered, program).toEqual({ code: -1, stdout: '', stderr: `cannot start "${program}": name the tool's script, such as ["node", "node_modules/@spec-family/<tool>/bin/<tool>.js"]` });
    }
  });

  it("gives spec-brief's list the time a question is given, and the hook's write is held at it", async () => {
    // A configured spec-brief that never answers: listing the briefs is the one sibling run a write waits on.
    const slow = { ...DEFAULT_CONFIG, tools: { ...DEFAULT_CONFIG.tools, 'spec-brief': ['node', '-e', 'setInterval(() => {}, 1000)'] } };
    const listed = createSiblings(temp(), slow).briefs(300);
    await expect(listed).rejects.toBeInstanceOf(SiblingError);
    await expect(listed).rejects.toThrow(/^spec-brief did not answer within 0\.3 seconds, and was stopped$/);
    // The bounds: a question is answered well inside the minute Claude Code gives the hook's entry, and work is given ten.
    expect(ANSWER_MS).toBe(20_000);
    expect(WORK_MS).toBe(600_000);
  });

  it('answers "absent" for JSON from a sibling that is not there', async () => {
    const siblings = createSiblings(temp(), DEFAULT_CONFIG);
    expect(await siblings.json('spec-guard', ['query'])).toEqual({
      absent: 'spec-guard is not installed here: npm install --save-dev @spec-family/spec-guard, or name its command under "tools" in .spec-harness.json',
    });
    await expect(siblings.briefs()).rejects.toBeInstanceOf(SiblingError);
    await expect(siblings.briefs()).rejects.toMatchObject({ name: 'SiblingError' });
  });
});
