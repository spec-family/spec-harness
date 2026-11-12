/**
 * The edge where the harness meets the disk: the configuration, the state
 * directory outside the work tree, and paths as the filesystem spells them.
 */

import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync, statSync, type Stats } from 'node:fs';
import { lstat, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';

import type { BriefInputs } from './briefs.js';
import { ConfigError, CONFIG_FILE, DEFAULT_CONFIG, parseConfig, type HarnessConfig } from './config.js';

/** What stands at a path, links followed, or `null` where nothing does: a link to nothing is nothing. */
function standing(path: string): Stats | null {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}

/**
 * Whether a regular file stands at a path, links followed. Only one is read
 * where a file is expected: opened, a named pipe nothing writes to is read
 * without end, and one read as the process waits on it, as the harness reads
 * a few small files, stops every timer with it (ADR-0002).
 */
export function isFile(path: string): boolean {
  return standing(path)?.isFile() === true;
}

/**
 * Reads `.spec-harness.json` at the root, or the defaults when there is none.
 *
 * Only a file is read. A named pipe under the file's name was read without
 * end, by every command and by the hook before every write; and Node's words
 * for a directory, EISDIR, are not the harness's. A file that cannot be read
 * is said as that, with the reason: one the account may not read, or one
 * another process holds open on Windows, was said to be JSON that is not
 * valid, which sent a person to its text. What does not load is thrown with
 * the path it stands at, which the hook lets a write reach (ADR-0005).
 */
export async function loadConfig(root: string): Promise<{ config: HarnessConfig; file: string | null }> {
  const file = join(root, CONFIG_FILE);
  const there = standing(file);
  if (there === null) return { config: DEFAULT_CONFIG, file: null };
  if (!there.isFile()) throw new ConfigError(`${CONFIG_FILE} is ${there.isDirectory() ? 'a directory' : 'neither a file nor a directory'}, not a configuration file`, file);
  let text: string;
  try {
    // A Buffer parses as its text, so the encoding is equivalent to its mutant.
    text = await readFile(file, 'utf8');
  } catch (error) {
    throw new ConfigError(`${CONFIG_FILE} cannot be read: ${(error as Error).message}`, file);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new ConfigError(`${CONFIG_FILE} is not valid JSON: ${(error as Error).message}`, file);
  }
  try {
    return { config: parseConfig(raw), file };
  } catch (error) {
    // parseConfig throws nothing but its own refusal, whose words are kept.
    throw new ConfigError((error as Error).message, file);
  }
}

/**
 * The real path of a file that stands at `path` under that name alone: a
 * file, not a link to one, and with no other name, since a write to a file
 * with two names writes both. `null` for anything else, and for nothing.
 */
function soleFile(path: string): string | null {
  try {
    const entry = lstatSync(path);
    return entry.isFile() && entry.nlink === 1 ? realpathSync.native(path) : null;
  } catch {
    // Nothing at the path, or nothing the account may look at. Its callers
    // compare the answer with a real path, which neither `null` nor what an
    // empty block answers is, so that mutant is equivalent.
    return null;
  }
}

/**
 * Whether every path of a write names `file` and nothing else: a file that
 * stands under that name alone, which the path names as the hook resolves a
 * path to decide it ({@link realSpelling}), and as the filesystem resolves
 * it to write, which on Linux and macOS follows a link before a `..` where
 * the hook reads the `..` first. A path that only reads like it, a link to
 * it, a second name of it, and a file of another work tree are none of
 * these. `cwd` is what a relative path is read from, its words kept as
 * written.
 */
export function writesOnly(paths: readonly string[], file: string, cwd: string): boolean {
  // Where the file is none, no path's real spelling is `null`, so no path
  // names it.
  const own = soleFile(file);
  return paths.every((given) => {
    const path = isAbsolute(given) ? given : `${cwd}${sep}${given}`;
    return soleFile(path) === own && realSpelling(path) === own;
  });
}

/**
 * A path where the harness keeps its state that holds something else: said
 * in a line, exit 2, where Node's ENOTDIR and a stack sent a person looking
 * for a defect (spec-core ADR-0005).
 */
export class StateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StateError';
  }
}

/**
 * The real spelling of a path: links resolved and, on a filesystem that
 * ignores case, the case the directory entries have. A path that does not
 * exist yet is resolved through its nearest existing ancestor.
 *
 * This is what stops `SRC/db/schema.ts` from walking past a protection on
 * `src/db/schema.ts` on Windows or macOS, where both name one file.
 */
export function realSpelling(path: string): string {
  const missing: string[] = [];
  let current = resolve(path);
  for (;;) {
    try {
      // join leaves a real path as it is, and reads a segment's leading
      // separator as the one between it and the last.
      return join(realpathSync.native(current), ...missing.reverse());
    } catch {
      const parent = dirname(current);
      // Only a root that does not exist fails at the top, a drive Windows
      // does not have; everywhere else the loop ends in the try.
      if (parent === current) return resolve(path);
      missing.push(current.slice(parent.length));
      current = parent;
    }
  }
}

/**
 * The most links the written reading of a path follows. Linux follows at
 * most 40 in resolving a pathname, and fails the call with ELOOP past them
 * (path_resolution(7)), so no write reaches a file through more.
 */
const MOST_LINKS = 40;

/**
 * A path's names, separated as the system separates them: Windows takes `/`
 * as well as `\`, where Linux and macOS take a `\` for a character of a name.
 * The sweep runs on Linux, where the mutants that read the pattern there, or
 * change it, are equivalent; the suite's Windows leg holds them.
 */
function namesOf(path: string): string[] {
  return path.split(sep === '/' ? '/' : /[\\/]/);
}

/**
 * The real spelling of the file a write of `given` reaches, read from `cwd`
 * where it is relative; `null` where it reaches none, through more links
 * than the system follows or a loop of them. Linux reads a `..` after the
 * link before it, and macOS is read so, so `deep/../schema.ts`, `deep` a
 * link to `lib/x`, is written as `lib/schema.ts` (measured on Linux), where
 * {@link realSpelling} reads the `..` first and names `schema.ts`; Windows
 * reads the `..` first, as resolve does (measured, through a junction). And
 * a link to nothing is followed, since a write opens the file it names and
 * makes it there (measured on Linux and on GitHub's Windows runner), where
 * `realSpelling` names the link.
 * The names are walked one by one from the root, each link replaced by what
 * it names, so the directory reached holds no link, and `join` reads a `.`,
 * a `..` and an empty name from it as the system does; what is not there
 * yet is made as written.
 */
export function writtenSpelling(given: string, cwd: string): string | null {
  // On Linux, where the sweep runs, the mutant that reads every path as
  // Windows does is caught, and the one that reads every path as Linux does
  // is equivalent; the suite's Windows leg holds it. The root is taken off
  // the names as it is off a link's, below.
  const absolute = sep === '/' ? (isAbsolute(given) ? given : `${cwd}/${given}`) : resolve(cwd, given);
  const root = parse(absolute).root;
  const names = namesOf(absolute.slice(root.length));
  let at = root;
  let links = 0;
  while (names.length > 0) {
    const next = join(at, names.shift()!);
    let target: string;
    try {
      if (!lstatSync(next).isSymbolicLink()) {
        at = next;
        continue;
      }
      target = readlinkSync(next);
    } catch {
      // Nothing there, or nothing the account may look into: a write makes
      // what is not there as written, and reaches nothing past a directory
      // it may not look into.
      at = join(next, ...names);
      break;
    }
    links += 1;
    if (links > MOST_LINKS) return null;
    // A link names a path from the directory it stands in, or from a root,
    // which is taken off its names: on Linux and macOS the root is `/`,
    // whose name is empty and read as none, so keeping it there is
    // equivalent; on Windows it is the drive (a test holds it there).
    const top = parse(target).root;
    if (top !== '') at = top;
    names.unshift(...namesOf(target.slice(top.length)));
  }
  // The walk spells what exists as given, links followed; where case is
  // ignored, the entries' case is the real one. On Linux, where the sweep
  // runs, the two are one, so the mutant that leaves this out is equivalent
  // there (a test holds it on Windows and macOS).
  return realSpelling(at);
}

/**
 * Every file a write of `given` may reach, each by its real spelling: the
 * one the path reads as ({@link realSpelling}), and the one the system
 * writes ({@link writtenSpelling}) where that is another. The hook does not
 * know which of the two a tool writes, so it decides both (ADR-0005). A
 * path that reaches no file is read as it reads.
 */
export function reachedBy(given: string, cwd: string): string[] {
  const read = realSpelling(resolve(cwd, given));
  const written = writtenSpelling(given, cwd);
  return written === null || written === read ? [read] : [read, written];
}

/**
 * Whether `directory` is the one git names as the top of a work tree: the
 * two spelled alike once the filesystem has spelled the directory, links
 * and short names resolved, as git spells a top. A spelling that differs is
 * read as another directory: what git said from the one is then not taken
 * for what it would say from the other.
 */
export function isTop(directory: string, top: string): boolean {
  return realSpelling(directory).split(sep).join('/') === top;
}

/**
 * The repository's main work tree, where git keeps the repository as that
 * work tree's `.git`, as `git init` and `git clone` do and every linked
 * worktree's common directory then is: `null` for a common directory of any
 * other name, a bare repository's, a submodule's under its superproject's
 * `modules`, or one kept apart with `--separate-git-dir`. Read from the
 * name, with no process: it says only where an install is looked for.
 */
export function mainWorkTree(commonDir: string): string | null {
  return basename(commonDir) === '.git' ? dirname(commonDir) : null;
}

/** Whether a `.git` stands in `directory`, a repository's or the file that names one, as at the top of a work tree. */
export function holdsGit(directory: string): boolean {
  return existsSync(join(directory, '.git'));
}

/**
 * The names a UNC path calls this machine by: the name every Windows
 * machine answers to, its loopback addresses, and `::1` as a UNC path
 * spells it. The machine's own name is the caller's to add.
 */
const LOOPBACK = /^(?:localhost|127(?:\.\d{1,3}){1,3}|--1\.ipv6-literal\.net)$/i;

/** A UNC path, a server and a share and the rest, written with two separators or after `?\UNC\` or `.\UNC\`, in either separator. */
const UNC = /^[\\/]{2}(?:[?.][\\/]UNC[\\/])?([^\\/]+)[\\/]+([^\\/]+)(.*)$/i;

/**
 * What a UNC path names where it names this machine: the local path of a
 * drive's administrative share, the share `C$` of localhost being the
 * drive `C:`, or `'share'` for any other share on it, whose directory only
 * the share's own configuration names; `null` for a path that names no
 * share on this machine. Node writes through each to the local file
 * (round 29's evaluation, on Windows 11), where the guard read the path
 * as one outside the repository and let the write through (ADR-0005).
 */
export function throughShare(path: string, host: string): { readonly local: string } | 'share' | null {
  const unc = UNC.exec(path);
  if (unc === null) return null;
  const server = unc[1]!;
  if (!LOOPBACK.test(server) && server.toLowerCase() !== host.toLowerCase()) return null;
  const drive = /^([a-z])\$$/i.exec(unc[2]!);
  if (drive === null) return 'share';
  const rest = unc[3]!;
  return { local: `${drive[1]!}:${rest === '' ? '\\' : rest}` };
}

/**
 * A path as the guard decides it: on Windows, a drive's share on this
 * machine as the local path it names, and `null` for another share on it,
 * which can be the repository by another name; elsewhere, and for every
 * other path, the path as given.
 */
export function localSpelling(path: string, platform: NodeJS.Platform = process.platform, host: string = hostname()): string | null {
  if (platform !== 'win32') return path;
  const through = throughShare(path, host);
  if (through === null) return path;
  return through === 'share' ? null : through.local;
}

/**
 * A path as the repository names it - relative to the root, POSIX-separated,
 * real spelling - or `null` when it lies outside the root.
 */
export function repositoryPath(given: string, root: string, cwd: string): string | null {
  const absolute = isAbsolute(given) ? given : resolve(cwd, given);
  const real = realSpelling(absolute);
  const realRoot = realSpelling(root);
  const rel = relative(realRoot, real);
  // `..env` at the root is inside it; only a `..` segment climbs out.
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  return rel.split(sep).join('/');
}

/**
 * The top of every work tree of the repository whose common directory is
 * `common`, `top` among them, read with no process: the main work tree,
 * whose `.git` the common directory is, and each linked worktree, by the
 * `gitdir` file git keeps for it under the common directory's `worktrees`,
 * which names the worktree's `.git` (gitrepository-layout(5)), absolute or
 * from its own directory. `null` where they cannot all be named: a common
 * directory of any other name, whose main work tree only its configuration
 * names, and an entry under `worktrees` that cannot be read.
 */
export function workTrees(top: string, common: string): string[] | null {
  const main = mainWorkTree(common);
  if (main === null) return null;
  const kept = join(common, 'worktrees');
  let names: string[] = [];
  try {
    names = readdirSync(kept);
  } catch (error) {
    // No such directory is no linked worktree, and anything else there is
    // one that cannot be read.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return null;
  }
  const linked = names.map((name) => textOf(join(kept, name, 'gitdir')));
  if (linked.includes(null)) return null;
  // The line's end stands in the last name, the worktree's `.git`, which
  // dirname takes away with it.
  return [top, main, ...names.map((name, at) => dirname(resolve(kept, name, linked[at]!)))];
}

/**
 * Whether every path lies outside every work tree of the repository whose
 * top and common directory are given, as it reads and as the system writes
 * it ({@link reachedBy}): such a path is no file of the repository's, so no
 * brief of its decides it, whatever is wrong with the brief or the
 * configuration (ADR-0005). Where the work trees cannot all be named, a
 * path is not known to be outside them, and this is `false`.
 */
export function outsideEvery(paths: readonly string[], top: string, common: string, cwd: string): boolean {
  // A write that names no path is no write outside: no caller asks of
  // one, and a test holds the answer.
  if (paths.length === 0) return false;
  // A path in the work tree that was opened, as nearly every write's is,
  // is told with nothing of git's directory read; read anyway, `top` is
  // among the work trees, so the mutant without this test is equivalent.
  if (paths.some((path) => repositoryPath(path, top, cwd) !== null)) return false;
  // A path with a `..` in it was held here when the hook read a path one
  // way, its `..` before its links: `/elsewhere/link/../a.ts`, the link to
  // a directory of the work tree, read as outside and was written inside.
  // Both readings are read below, and such a path is held as it was all
  // the same (ADR-0005).
  if (paths.some(hasDots)) return false;
  return readsOutside(paths, top, common, cwd);
}

/** Whether a path names a `..` among its names. */
function hasDots(path: string): boolean {
  return path.split(/[\\/]/).includes('..');
}

/**
 * As a path reads and as the system writes it, a link to nothing among its
 * links, whether each path reaches only files outside every work tree.
 */
function readsOutside(paths: readonly string[], top: string, common: string, cwd: string): boolean {
  const reached = paths.flatMap((path) => reachedBy(path, cwd));
  const trees = workTrees(top, common);
  return trees !== null && reached.every((path) => trees.every((tree) => repositoryPath(path, tree, cwd) === null));
}

/**
 * Whether a path with a `..` in it reads, both ways, as a file outside every
 * work tree of the repository: {@link outsideEvery} holds it all the same,
 * and the hook and `check_path` say that, where they said the brief's
 * problem, which decides no file outside the repository (ADR-0005).
 */
export function dotsOutside(path: string, top: string, common: string, cwd: string): boolean {
  // The work tree that was opened is among the work trees read.
  return hasDots(path) && readsOutside([path], top, common, cwd);
}

/**
 * The harness's own directory under the git common directory, created on
 * demand (ADR-0003). Where something that is no directory stands at its path,
 * or at one between it and git's, Node refuses to make it, with ENOTDIR or
 * EEXIST, and the harness says which path holds what.
 */
export async function stateDirectory(commonDir: string, ...parts: string[]): Promise<string> {
  const directory = join(commonDir, 'spec-harness', ...parts);
  try {
    await mkdir(directory, { recursive: true });
  } catch (error) {
    const { code } = error as NodeJS.ErrnoException;
    if (code !== 'ENOTDIR' && code !== 'EEXIST') throw error;
    // mkdir refuses for this alone, so one of the steps is there and is no
    // directory, and every step before it is one.
    const steps = ['spec-harness', ...parts].map((_, at, all) => join(commonDir, ...all.slice(0, at + 1)));
    const there = steps.find((step) => !standing(step)!.isDirectory())!;
    throw new StateError(`${there} is not a directory, where spec-harness keeps its state in one: move it away, and run the command again`);
  }
  return directory;
}

/**
 * A work tree and its git directories as the files git keeps name them, read
 * with no process: the nearest directory at or above `root` that holds a
 * `.git`; the git directory, that `.git` or the one a `.git` file names
 * (`gitdir: <path>`, relative to the file's directory); and the common
 * directory, the one that git directory's `commondir` file names, relative
 * to it, or the git directory itself (gitrepository-layout(5)). `exact` is
 * whether git, asked, would name the same work tree: not where
 * `GIT_DIR` or `GIT_WORK_TREE` sends it elsewhere, and not where the
 * repository's configuration names a `worktree`, which `core.worktree`
 * moves it to (git-config(1)), or keeps one of its own for a worktree.
 * `null` where no directory up to the top of the filesystem holds one, or
 * a `.git` file names none.
 */
export function gitDirectories(root: string, env: Readonly<Record<string, string | undefined>>): { readonly top: string; readonly git: string; readonly common: string; readonly exact: boolean } | null {
  let top = realSpelling(root);
  let found: Stats | null = null;
  for (;;) {
    found = standing(join(top, '.git'));
    if (found !== null) break;
    const parent = dirname(top);
    if (parent === top) return null;
    top = parent;
  }
  const dotGit = join(top, '.git');
  let gitDir = dotGit;
  if (found.isFile()) {
    // The path is the rest of the line: `.` stops at a line's end, a
    // carriage return among them, so the mutant that drops `$` is
    // equivalent; and a Buffer is read as its text, so is the encoding's.
    const named = /^gitdir: (.+)$/m.exec(readFileSync(dotGit, 'utf8'))?.[1];
    if (named === undefined) return null;
    gitDir = resolve(top, named);
  }
  const commondir = textOf(join(gitDir, 'commondir'));
  const common = commondir === null ? gitDir : resolve(gitDir, commondir.trim());
  const moved = env['GIT_DIR'] !== undefined || env['GIT_WORK_TREE'] !== undefined;
  // No configuration holds no key, as a text without one does: the mutant
  // of the empty text is equivalent.
  const elsewhere = /^\s*worktree\s*=/im.test(textOf(join(common, 'config')) ?? '') || existsSync(join(gitDir, 'config.worktree'));
  return { top, git: gitDir, common, exact: !moved && !elsewhere };
}

/** A file's text, or `null` where it cannot be read or is no file. */
function textOf(file: string): string | null {
  if (!isFile(file)) return null;
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/**
 * How long a call's decisions are kept for a run after the write that does
 * not come: a call refused by the person, one that failed, one stopped
 * (ADR-0002). A day, since a call waits on a person's prompt for as long as
 * the person is away, and an entry removed too soon costs only that call's
 * answer being decided again.
 */
export const CALL_LIFE_MS = 24 * 60 * 60 * 1000;

/**
 * Keeps what a run before a write decided, under the common directory, for
 * the run after it, and removes what no run after a write read in a day.
 * Nothing here may change the answer before the write: whatever fails is
 * passed over, and the run after the write then decides as it did.
 */
export async function keepCall(commonDir: string, name: string, text: string, now: number = Date.now()): Promise<void> {
  try {
    const directory = await stateDirectory(commonDir, 'calls');
    await writeAtomic(join(directory, name), text);
    // A file another run takes away before it is removed here ends the
    // pruning in the catch below, where `force` would pass over it, and what
    // is left is pruned by a later run: the mutants of `force` are
    // equivalent.
    for (const entry of await readdir(directory)) {
      const file = join(directory, entry);
      if (now - (await stat(file)).mtimeMs > CALL_LIFE_MS) await rm(file, { force: true });
    }
  } catch {
    // A full disk, a directory another run removed: the call is decided again after the write.
  }
}

/** What was kept for a call, taken away as it is read; `null` where nothing was. */
export async function takeCall(commonDir: string, name: string): Promise<string | null> {
  const file = join(commonDir, 'spec-harness', 'calls', name);
  // What is no file holds nothing kept, and is written over at the next write.
  if (!isFile(file)) return null;
  try {
    const text = await readFile(file, 'utf8');
    // Taken away by another run since it was read, the mutants of `force`
    // decide the call again, which answers as the text read does: they are
    // equivalent.
    await rm(file, { force: true });
    return text;
  } catch {
    return null;
  }
}

/** SHA-256 of a text or of bytes, in hex. */
export type Hash = (data: string | Uint8Array) => string;

/** SHA-256, loaded where something is hashed: a run that keeps no answer loads no hash (ADR-0002). */
export async function hasher(): Promise<Hash> {
  const { createHash } = await import('node:crypto');
  return (data) => createHash('sha256').update(data).digest('hex');
}

/**
 * How long a session's answer of spec-brief's is kept once it was last
 * kept (ADR-0003). A day, as a call's: an answer removed costs one start of
 * spec-brief, and one kept is a few kilobytes.
 */
export const ANSWER_LIFE_MS = 24 * 60 * 60 * 1000;

/**
 * Keeps a session's answer of spec-brief's under the common directory, with
 * the key it answers, and removes what was kept over a day ago. Whatever
 * fails is passed over: the answer is the one given whether or not it is
 * kept.
 */
export async function keepAnswer(commonDir: string, name: string, key: string, answer: string, now: number = Date.now()): Promise<void> {
  try {
    const directory = await stateDirectory(commonDir, 'answers');
    await writeAtomic(join(directory, name), `${JSON.stringify({ key, answer })}\n`);
    // A file another run takes away before it is removed here ends the
    // pruning in the catch below, where `force` would pass over it, and what
    // is left is pruned by a later run: the mutants of `force` are
    // equivalent, and so is the one that also removes a file kept a day ago
    // to the millisecond.
    for (const entry of await readdir(directory)) {
      const file = join(directory, entry);
      if (now - (await stat(file)).mtimeMs > ANSWER_LIFE_MS) await rm(file, { force: true });
    }
  } catch {
    // A full disk, a directory another run removed: the next run starts spec-brief.
  }
}

/**
 * The answer kept under `name` for `key`, or `null` where there is none:
 * nothing there, something that is not a file, a text that is not what
 * `keepAnswer` writes, or another key's.
 */
export async function keptAnswer(commonDir: string, name: string, key: string): Promise<string | null> {
  const file = join(commonDir, 'spec-harness', 'answers', name);
  try {
    // Only a file is read: a named pipe would be read without end.
    if (!(await stat(file)).isFile()) return null;
    // A text that holds null throws on the read, and any other that is no
    // object has no key: the catch answers for both. A Buffer parses as its
    // text, so the encoding is equivalent to its mutant.
    const kept: { readonly key?: unknown; readonly answer?: unknown } = JSON.parse(await readFile(file, 'utf8'));
    return kept.key === key && typeof kept.answer === 'string' ? kept.answer : null;
  } catch {
    // Falling out of the catch answers undefined, which no answer is read
    // from either: the mutant without the return is equivalent.
    return null;
  }
}

/** Whether a path that could not be read names nothing: it, or a directory on the way to it, is not there. */
function nothingThere(error: unknown): boolean {
  const { code } = error as NodeJS.ErrnoException;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/**
 * Whether a file reads as listed: a file, never a pipe or a directory, whose
 * bytes have the digest; or, listed as not there, nothing at its path.
 */
async function fileReads(file: string, sha256: string | null, hash: Hash): Promise<boolean> {
  let there: Stats;
  try {
    there = await stat(file);
  } catch (error) {
    return sha256 === null && nothingThere(error);
  }
  // Only a file is read: a named pipe would be read without end. A file
  // listed as not there has no digest a file's bytes have.
  if (!there.isFile()) return false;
  return hash(await readFile(file)) === sha256;
}

/**
 * Whether a directory is there and holds the files listed, and no other: a
 * file as spec-brief lists one, an entry that is a file itself, where a
 * directory or a link is not one. What is no directory, a named pipe among
 * it, is refused by the listing, which throws. Listed as not there, nothing
 * may stand at its path in any form, a link that leads nowhere among them.
 */
async function entriesRead(directory: string, entries: readonly string[] | null): Promise<boolean> {
  if (entries === null) {
    try {
      await lstat(directory);
      return false;
    } catch (error) {
      return nothingThere(error);
    }
  }
  // The entries are names no two of which are one (inputsOf), and so are a
  // directory's: as many of each, every one of the one among the other, is
  // the same names, in whatever order the disk lists them.
  const names = (await readdir(directory, { withFileTypes: true })).flatMap((entry) => (entry.isFile() ? [entry.name] : []));
  const listed = new Set(entries);
  return names.length === listed.size && names.every((name) => listed.has(name));
}

/**
 * Whether every input of an answer reads as listed, with no process
 * started: each file by the digest of its bytes, or as not there; each
 * directory by its entries; and, where git was asked, the index of the work
 * tree's git directory and each ignore file. A path is read from the work
 * tree's top, or as it stands where it is absolute. Anything that cannot be
 * read, and an index that is not the one git reads for the work tree, is a
 * doubt, and answers `false` (ADR-0002).
 */
export async function readsAsListed(root: string, inputs: BriefInputs, hash: Hash, env: Readonly<Record<string, string | undefined>> = process.env): Promise<boolean> {
  const at = (path: string): string => (isAbsolute(path) ? path : join(root, ...path.split('/')));
  const git = inputs.git;
  let index: string | null = null;
  if (git !== null) {
    // The index of the work tree's own git directory, as the files git keeps
    // name it: not where git is sent elsewhere, GIT_DIR, GIT_WORK_TREE or a
    // worktree key (`exact`), GIT_INDEX_FILE or GIT_COMMON_DIR. A top git
    // named always holds a `.git`, so the test of none is the compiler's, and
    // a null read past it throws, which the caller reads as a doubt: that
    // mutant is equivalent. The top found is the work tree's own but where
    // git names a top that holds no `.git`, a work tree `core.worktree`
    // names away from its repository and inside another, whose index the
    // one found would be.
    const found = gitDirectories(root, env);
    if (found === null || !found.exact || env['GIT_INDEX_FILE'] !== undefined || env['GIT_COMMON_DIR'] !== undefined || found.top !== realSpelling(root)) return false;
    index = join(found.git, 'index');
  }
  // Made once every check is known to be made, so that none is left to fail
  // with no one reading it. A text put among them where git was asked
  // nothing is one `every` reads as true, so that mutant is equivalent.
  const checks = [
    ...inputs.files.map((file) => fileReads(at(file.path), file.sha256, hash)),
    ...inputs.directories.map((directory) => entriesRead(at(directory.path), directory.entries)),
    ...(git === null ? [] : [fileReads(index!, git.index, hash), ...git.ignores.map((file) => fileReads(at(file.path), file.sha256, hash))]),
  ];
  try {
    return (await Promise.all(checks)).every((reads) => reads);
  } catch {
    // Falling out of the catch answers undefined, which the caller reads as
    // false: the mutant without the return is equivalent.
    return false;
  }
}

/** Writes a file whole or not at all: a temporary file renamed over the target. */
export async function writeAtomic(file: string, content: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  // utf8 is writeFile's own default, so naming it is equivalent to its mutant.
  await writeFile(temporary, content, 'utf8');
  await rename(temporary, file);
}

/**
 * A JSON object from a file: `null` when there is no file, `'unreadable'`
 * when it holds anything else. Only a file is read: a named pipe where a
 * settings file is expected was read without end, and neither doctor nor
 * init came back. What is neither a file nor a directory holds no JSON
 * object, as a directory holds none.
 */
export async function readJsonObject(file: string): Promise<Record<string, unknown> | null | 'unreadable'> {
  const there = standing(file);
  if (there === null) return null;
  if (!there.isFile()) return 'unreadable';
  try {
    // A Buffer parses as its text, so the encoding is equivalent to its mutant.
    const value: unknown = JSON.parse(await readFile(file, 'utf8'));
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : 'unreadable';
  } catch {
    return 'unreadable';
  }
}

/** Whether a path names a directory that is there; one that cannot be read names none. */
export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    // Each caller reads the answer with `!`, so the mutant that answers
    // nothing here is equivalent.
    return false;
  }
}

/** A file's text, or `null` where it cannot be read or is no file: a brief, a document one cites, a shim. */
export async function readText(file: string): Promise<string | null> {
  if (!isFile(file)) return null;
  try {
    return await readFile(file, 'utf8');
  } catch {
    return null;
  }
}
