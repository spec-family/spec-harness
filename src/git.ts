/**
 * The edge where the harness meets git.
 *
 * Reads, except for two things ADR-0003 allows and bounds: a temporary
 * worktree, added and always removed by the sandbox, and nothing else. Every
 * call is an argument vector, never a shell string, so a path or a ref cannot
 * become a command.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { execFile } from 'node:child_process';

import type { FileChange, LocalBranch } from './types.js';

export interface Run {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * How long a process the harness asks a question of is given to answer:
 * git's reads, spec-brief's list of the briefs. Claude Code gives the hook's
 * entry 60 seconds, as init and the plugin write it, and cancels a hook that
 * reaches them, which before a write lets the write go ahead (ADR-0002). A
 * process that does not answer within this is stopped and its question
 * answered as one that failed, which before a write holds it, well inside
 * that minute; and the slowest such process measured, on a Windows
 * workstation under load and on GitHub's runner, answered in a fraction of
 * it.
 */
export const ANSWER_MS = 20_000;

/**
 * How long a process that does a round's work is given: a diff of the
 * round, a worktree added for a probe or taken away, a sibling's check of
 * the repository. Its length is the repository's, and none runs before a
 * write.
 */
export const WORK_MS = 600_000;

/** The run a process is started in, where it has a budget: its length, and when it ends, as `performance.now()` reads it. */
const budget = new AsyncLocalStorage<{ readonly ms: number; readonly end: number }>();

/** Runs `work` with every process it starts given no more than what is left of `ms` from now. */
export function withBudget<T>(ms: number, work: () => Promise<T>): Promise<T> {
  return budget.run({ ms, end: performance.now() + ms }, work);
}

/**
 * The time a process is given, `limit`, or what is left of the budget of
 * the run it is started in where that is less, with the words that say
 * which: the run's budget is said as such, so that a write held at it says
 * why. A run with nothing left is given 0, and starts nothing.
 */
export function timeFor(limit: number): { readonly ms: number; readonly said: string } {
  const run = budget.getStore();
  const left = run === undefined ? limit : run.end - performance.now();
  if (left >= limit) return { ms: limit, said: `${limit / 1000} seconds` };
  return { ms: Math.max(0, Math.ceil(left)), said: `the ${run!.ms / 1000} seconds the hook's run is given` };
}

/**
 * Whether a process ended because the harness stopped it at its time
 * limit: Node kills it then and says so with `killed`. It kills one for
 * output past `maxBuffer` as well, and names that by its code.
 */
export function stoppedAtLimit(error: unknown): boolean {
  const failure = error as { killed?: unknown; code?: unknown } | null;
  return failure !== null && failure.killed === true && failure.code !== 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER';
}

/** The git command a line of arguments runs, past the `-c` settings before it: every line the harness hands git names one. */
function subcommand(args: readonly string[]): string {
  return args.find((arg, index) => !arg.startsWith('-') && args[index - 1] !== '-c')!;
}

/**
 * Runs git and answers whatever it answered; a missing git is a code of -1.
 * A git that does not answer within `limit` is stopped, and rejected as a
 * `GitError` that says so: read as a failure, a question about the work
 * tree or the branch would answer as a directory in none, or a head on no
 * branch, under which the hook checks no write.
 */
export function git(args: readonly string[], cwd: string, limit = ANSWER_MS): Promise<Run> {
  const { ms, said } = timeFor(limit);
  if (ms === 0) return Promise.reject(new GitError(`git ${subcommand(args)} was not started: ${said} had passed`));
  return new Promise((resolve, reject) => {
    // windowsHide only keeps a console window from flashing up on Windows,
    // and the sweep runs on Linux, where its mutant is equivalent.
    execFile('git', [...args], { cwd, maxBuffer: 256 * 1024 * 1024, encoding: 'utf8', windowsHide: true, timeout: ms }, (error, stdout, stderr) => {
      if (stoppedAtLimit(error)) {
        reject(new GitError(`git ${subcommand(args)} did not answer within ${said}, and was stopped`));
        return;
      }
      // Every caller tells 0 from any other code, never one failure from
      // another, so which code a failure gets is equivalent to its mutants.
      const code = error === null ? 0 : typeof (error as { code?: unknown }).code === 'number' ? (error as { code: number }).code : -1;
      resolve({ code, stdout, stderr });
    });
  });
}

async function value(args: readonly string[], cwd: string): Promise<string | null> {
  const run = await git(args, cwd);
  return run.code === 0 ? run.stdout.trim() : null;
}

export class GitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitError';
  }
}

/** The top of the work tree holding `cwd`, POSIX-separated, or `null` outside one. */
export async function workTreeRoot(cwd: string): Promise<string | null> {
  return value(['rev-parse', '--show-toplevel'], cwd);
}

/** The git directory every worktree of this repository shares. */
export async function commonDirectory(cwd: string): Promise<string | null> {
  return value(['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd);
}

/** A work tree as one start of git names it: its top, and the git directory its worktrees share. */
export interface WorkTree {
  readonly root: string;
  readonly commonDir: string;
}

/**
 * The top of the work tree holding `cwd` and the common directory, asked of
 * git in one start where {@link workTreeRoot} and {@link commonDirectory}
 * are two: `null` outside a work tree, and `'unread'` where the one answer
 * cannot be taken for the two, which are then to be asked for as they were.
 *
 * Measured with git 2.43 and 2.55, rev-parse answers the two in the order
 * they stand on its line, a line each, and prints nothing where the first
 * fails. Its manual says of that only that `--show-toplevel` reports an
 * error where there is no working tree (git-rev-parse(1), Options for
 * Files, as git 2.55.0 has it, read 2026-10-14), so nothing is read on
 * trust. Two lines that are each what `trim` would leave, from a git that
 * did not fail, are the two answers. Nothing printed, by a git that
 * failed, is the first question failing, the one {@link workTreeRoot}
 * asks: `cwd` is in no work tree. Anything else is not read: a path that
 * holds a line break is more lines than two, and so is what a git before
 * 2.31 would print, to which `--path-format=absolute` is a flag to hand
 * back (the same manual, Options for Filtering; the option is new in the
 * release notes of 2.31.0). No such git was measured.
 *
 * `--path-format` reaches only what follows it on the line (Options for
 * Files), so the top is printed as it is where it is asked for alone. The
 * common directory is asked for from `cwd` here, and from the top by
 * {@link commonDirectory}: the same directory only where `cwd` is the top.
 */
export async function workTree(cwd: string): Promise<WorkTree | 'unread' | null> {
  const run = await git(['rev-parse', '--show-toplevel', '--path-format=absolute', '--git-common-dir'], cwd);
  if (run.stdout === '') return run.code === 0 ? 'unread' : null;
  const lines = run.stdout.split('\n');
  if (run.code !== 0 || lines.length !== 3 || lines[2] !== '') return 'unread';
  const root = lines[0]!;
  const commonDir = lines[1]!;
  if (root === '' || commonDir === '' || root.trim() !== root || commonDir.trim() !== commonDir) return 'unread';
  return { root, commonDir };
}

/**
 * Where git runs the hook `name` from, absolute: `core.hooksPath` read as git
 * reads it - relative to the work tree, absolute, or under `~` - and a linked
 * worktree's shared hooks. Where git cannot say, the first line of what it
 * said instead: under a `core.hooksPath` that names a file it refuses the
 * path as one that is not a directory (measured with git 2.47 and 2.55).
 */
export async function hookPath(name: string, cwd: string): Promise<{ readonly path: string } | { readonly refused: string }> {
  const run = await git(['rev-parse', '--path-format=absolute', '--git-path', `hooks/${name}`], cwd);
  if (run.code === 0) return { path: run.stdout.trim() };
  return { refused: run.stderr.split(/\r?\n/)[0]! };
}

const HEADS = 'refs/heads/';

/**
 * The checked-out branch's name, or `null` on a detached head: what HEAD
 * points at, with `refs/heads/` taken off and nothing else. `--short` gives
 * the shortest name git reads as that ref and no other, which is another
 * name where a tag, or a ref under `refs/`, has the branch's: measured with
 * git 2.55, on `claude/brief-042-x` beside the tag `claude/brief-042-x` it
 * answers `heads/claude/brief-042-x`, which no template reads, and the
 * brief went unnamed (ADR-0005). A HEAD that points outside `refs/heads/`,
 * as `git symbolic-ref HEAD refs/tags/x` leaves it, is named as git status
 * names it, the ref whole.
 */
export async function currentBranch(cwd: string): Promise<string | null> {
  const ref = await value(['symbolic-ref', '--quiet', 'HEAD'], cwd);
  return ref !== null && ref.startsWith(HEADS) ? ref.slice(HEADS.length) : ref;
}

/**
 * The remote's default branch as a local ref, such as `origin/main`, or
 * `null`. This is a ref the harness hands git and spec-brief as the base, so
 * it is the short name git reads as that ref and no other: beside a local
 * branch or a tag named `origin/main`, measured with git 2.55, it is
 * `remotes/origin/main`, where `origin/main` would be read as the branch or
 * the tag (gitrevisions(7), the order a ref name is read in).
 */
export async function remoteDefault(cwd: string): Promise<string | null> {
  return value(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], cwd);
}

/**
 * Every local branch. The two are one name but where a tag, or a ref under
 * `refs/`, has the branch's: `main` beside the tag `main` is the ref
 * `heads/main`. A ref name holds no control character
 * (git-check-ref-format(1)), so a tab parts the two.
 */
export async function localBranches(cwd: string): Promise<LocalBranch[]> {
  const listed = await value(['for-each-ref', '--format=%(refname:lstrip=2)%09%(refname:short)', HEADS], cwd);
  // for-each-ref fails only where git itself does, outside a repository,
  // where init never runs: the null check is there for the type.
  if (listed === null || listed === '') return [];
  return listed.split('\n').map((line) => {
    const parts = line.split('\t');
    return { name: parts[0]!, ref: parts[1]! };
  });
}

export async function revision(ref: string, cwd: string): Promise<string | null> {
  return value(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd);
}

export async function mergeBase(a: string, b: string, cwd: string): Promise<string | null> {
  return value(['merge-base', a, b], cwd);
}

/** Parses `git diff --name-status -z` output. */
export function parseNameStatus(output: string): FileChange[] {
  const fields = output.split('\0');
  const out: FileChange[] = [];
  for (let i = 0; i < fields.length; ) {
    const code = fields[i] as string;
    if (code === '') {
      i += 1;
      continue;
    }
    const letter = code.charAt(0);
    const status = letter as FileChange['status'];
    if (status === 'R' || status === 'C') {
      out.push({ status, from: fields[i + 1] ?? '', path: fields[i + 2] ?? '' });
      i += 3;
    } else {
      out.push({ status, path: fields[i + 1] ?? '' });
      i += 2;
    }
  }
  return out;
}

/** The files changed from one revision to another, renames found. */
export async function changes(from: string, to: string, cwd: string): Promise<FileChange[]> {
  const run = await git(['diff', '--name-status', '-z', '--find-renames', '--no-color', from, to, '--'], cwd, WORK_MS);
  if (run.code !== 0) throw new GitError(`git diff ${from} ${to} failed: ${run.stderr.trim()}`);
  return parseNameStatus(run.stdout);
}

/**
 * How many words stand before the path in each kind of record of
 * `git status --porcelain=v2`, as git-status(1) has them (Git for Windows
 * 2.55.0, *Porcelain Format Version 2*, read 2026-10-19): an ordinary
 * change, `1`, and seven; a rename or a copy, `2`, and eight, its path
 * followed by the path it came from as a record of its own under `-z`; an
 * unmerged path, `u`, and nine; an untracked or an ignored path, `?` or
 * `!`, and none. A header, `#`, names no path.
 */
const STATUS_FIELDS: Readonly<Record<string, number>> = { '1': 8, '2': 9, u: 10, '?': 1, '!': 1 };

/**
 * The paths `git status --porcelain=v2 -z` names, each once, in the order
 * git gives them: a rename or a copy by both its paths. A path with a space
 * in it is the rest of its record, which `-z` prints as is.
 */
export function parseStatus(output: string): string[] {
  const records = output.split('\0');
  const paths = new Set<string>();
  for (let at = 0; at < records.length; at += 1) {
    const record = records[at]!;
    const fields = STATUS_FIELDS[record.charAt(0)];
    if (fields === undefined) continue;
    paths.add(record.split(' ').slice(fields).join(' '));
    if (record.startsWith('2')) {
      at += 1;
      paths.add(records[at] ?? '');
    }
  }
  paths.delete('');
  return [...paths];
}

/**
 * Every path the work tree holds changed from HEAD: tracked files that
 * differ in the index or in the work tree, unmerged ones, and each
 * untracked file, those in an untracked directory one by one. One start of
 * git, with no optional lock taken: a status that writes the index as it
 * refreshes it holds a lock that can make another git running beside it
 * fail, and the manual has a status run in the background take none
 * (git-status(1), *Background Refresh*, and git(1), `--no-optional-locks`,
 * as Git for Windows 2.55.0 has them, read 2026-10-19).
 */
export async function changedPaths(cwd: string): Promise<string[]> {
  const run = await git(['--no-optional-locks', 'status', '--porcelain=v2', '-z', '--untracked-files=all'], cwd);
  if (run.code !== 0) throw new GitError(`git status failed: ${run.stderr.trim()}`);
  return parseStatus(run.stdout);
}

/** The files a commit would change: what is staged. */
export async function stagedChanges(cwd: string): Promise<FileChange[]> {
  const run = await git(['diff', '--cached', '--name-status', '-z', '--find-renames', '--no-color', '--'], cwd, WORK_MS);
  if (run.code !== 0) throw new GitError(`git diff --cached failed: ${run.stderr.trim()}`);
  return parseNameStatus(run.stdout);
}

/** A file's content at a revision, or `null` when it does not exist there. */
export async function show(ref: string, path: string, cwd: string): Promise<string | null> {
  const run = await git(['show', `${ref}:${path}`], cwd);
  return run.code === 0 ? run.stdout : null;
}

/**
 * Whether a commit's tree holds `path`, a path from the top of the work tree
 * read as written: `true` where git lists it, `false` where git lists
 * nothing for it, and `null` where git could not say, for a commit it does
 * not have among them. {@link show} answers `null` for a file that is not
 * there and for a git that failed alike, which can only make an answer
 * stricter; this tells the two apart, so that an answer may be loosened by a
 * file that git says is not there.
 *
 * ls-tree reads its paths as patterns, from the directory it is started in
 * (git-ls-tree(1), Description, as Git for Windows 2.55.0 has it, read
 * 2026-10-24): `--full-tree` has it read them from the top, and
 * `--literal-pathspecs` with no globbing and no magic (git(1), Options), so
 * a name such as `:(top)x.md` names that file, where ls-tree would read it
 * as `x.md`.
 */
export async function holdsPath(commit: string, path: string, cwd: string): Promise<boolean | null> {
  const run = await git(['--literal-pathspecs', 'ls-tree', '-z', '--full-tree', '--name-only', commit, '--', path], cwd);
  return run.code === 0 ? run.stdout !== '' : null;
}

/**
 * Whether the history is cut short, as a clone or a fetch with `--depth`
 * leaves it, where a merge base git finds can be an older commit than the
 * one the whole history has; `null` where git could not say. rev-parse
 * learned the question in 2.15.0 (its release notes), and prints `true` or
 * `false` (git-rev-parse(1), Options for Files, read 2026-10-24); anything
 * else is no answer.
 */
export async function isShallow(cwd: string): Promise<boolean | null> {
  const answer = await value(['rev-parse', '--is-shallow-repository'], cwd);
  if (answer === 'true') return true;
  return answer === 'false' ? false : null;
}

/** Whether a commit id from {@link blameLine} is the all-zero one of a line nobody committed. */
export function isUncommitted(sha: string): boolean {
  return /^0+$/.test(sha);
}

/**
 * The commit that last changed one line of a file, as of a revision, or of
 * the working tree when `ref` is `null` - where a line nobody committed yet
 * belongs to the all-zero commit.
 *
 * The commit it names is the one whose signature a ruling is verified by,
 * so nothing the checkout configures may move a line to another commit
 * (ADR-0006). `blame.ignoreRevsFile` passes a listed commit's lines to the
 * commits before it; a textconv filter, configured in the checkout and
 * named for the file in `.git/info/attributes`, can make a widened row read
 * as the row a person signed, and blame follows it unless told not to.
 * Measured with Git for Windows 2.56.0, both credited an unsigned commit's
 * widened ruling to the signed commit before it. The option empties the
 * list the configuration made, as `-c blame.ignoreRevsFile=` does not:
 * git keeps the configured names sorted, so the empty one that is to clear
 * the list is read before the names it was to clear.
 */
export async function blameLine(ref: string | null, path: string, line: number, cwd: string): Promise<string | null> {
  const run = await git(['blame', '--porcelain', '--no-ignore-revs-file', '--no-textconv', '-L', `${line},${line}`, ...(ref === null ? [] : [ref]), '--', path], cwd);
  // A blame that fails prints nothing on stdout, which names no commit. Its
  // output opens with the commit, so the anchor is equivalent to its mutant.
  const sha = /^([0-9a-f]{40,64}) /.exec(run.stdout)?.[1];
  return sha ?? null;
}

/** A good signature names its allowed signer's principal; any other names none. */
export type Signature =
  | { readonly good: true; readonly principal: string; readonly detail: string }
  | { readonly good: false; readonly principal: null; readonly detail: string };

/**
 * The program git verifies each kind of signature with, as git names it
 * where nothing is configured (git-config(1), gpg.program and
 * gpg.<format>.program), set on the command line, which git reads after
 * every configuration file. git runs the program a signature's own kind
 * names, whatever `gpg.format` says, and believes what the program prints:
 * measured with Git for Windows 2.56.0, a script configured in the
 * checkout as `gpg.ssh.program`, or as `gpg.program` for a commit carrying
 * an OpenPGP block, printed a good signature by the agent's principal and
 * git exited 0 (ADR-0006). The program is the one on PATH, as git finds
 * it; a host whose PATH the agent can change is outside what this guards.
 */
const SIGNATURE_PROGRAMS: readonly string[] = ['-c', 'gpg.ssh.program=ssh-keygen', '-c', 'gpg.program=gpg', '-c', 'gpg.x509.program=gpgsm'];

/**
 * Whether a commit carries a good SSH signature by a principal in the given
 * allowed-signers file. The file is passed in, never read from the commit's
 * own tree: a round cannot vouch for itself (ADR-0006).
 */
export async function verifyCommit(sha: string, allowedSignersFile: string, cwd: string): Promise<Signature> {
  const run = await git(
    [...SIGNATURE_PROGRAMS, '-c', `gpg.ssh.allowedSignersFile=${allowedSignersFile}`, '-c', 'gpg.format=ssh', 'verify-commit', '--raw', sha],
    cwd,
  );
  const text = `${run.stderr}\n${run.stdout}`;
  const principal = /Good "git" signature for (\S+)/.exec(text)?.[1];
  // git writes the check to stderr, so the trim changes the first line only
  // for output on stdout alone, which verify-commit does not print; and split
  // always answers a first part.
  const first = text.trim().split('\n')[0]!;
  // git checks the signature of a key no allowed signer lists all the
  // same, and says it is good, with the key and no principal; the cause,
  // "No principal matched.", comes after. Kept to the first line, the
  // reason read as a signature that counts (round 29's evaluation). A key
  // a signer lists is named with its principal, "for" and not "with". git
  // begins the line with it, so the pattern takes no anchor at its start,
  // which would read the same.
  const key = /Good "git" signature with (.+?)\s*$/.exec(first)?.[1];
  const detail = key === undefined ? first : `it is signed with ${key}, which no allowed signer is`;
  // git exits 0 only for a signature by a listed principal, which it names:
  // either condition alone is equivalent to both, and both trust neither.
  return run.code === 0 && principal !== undefined ? { good: true, principal, detail } : { good: false, principal: null, detail };
}

export async function addWorktree(path: string, rev: string, cwd: string): Promise<void> {
  const run = await git(['worktree', 'add', '--detach', '--force', path, rev], cwd, WORK_MS);
  if (run.code !== 0) throw new GitError(`git worktree add failed: ${run.stderr.trim()}`);
}

/**
 * Has git remove the worktree at `path`, and no other, with its record of it,
 * and answers whether git did. Git deletes what it can of the worktree's
 * directory and forgets the worktree even when it cannot delete it all. It
 * refuses a worktree whose directory has lost its `.git` file, and removes
 * its record of one whose directory is gone, found by the path it was added
 * at: `git worktree prune` would also forget every other worktree git has
 * lost track of, the person's among them.
 */
export async function removeWorktree(path: string, cwd: string): Promise<boolean> {
  // The sandbox asks again when this answers false, and git, asked again
  // about a worktree it has forgotten, changes nothing: the mutant that
  // always answers false is equivalent.
  return (await git(['worktree', 'remove', '--force', path], cwd, WORK_MS)).code === 0;
}

/**
 * git's settings for signing a commit, as git reads them here, the
 * person's global ones among them: whether it signs every commit, the
 * format, and the key `user.signingkey` names, a path or `key::` and the
 * key itself (git-config(1), commit.gpgSign and user.signingKey).
 */
export async function signingConfig(cwd: string): Promise<{ readonly every: boolean; readonly format: string | null; readonly key: string | null }> {
  const [every, format, key] = await Promise.all([
    value(['config', '--type=bool', '--get', 'commit.gpgsign'], cwd),
    value(['config', '--get', 'gpg.format'], cwd),
    value(['config', '--get', 'user.signingkey'], cwd),
  ]);
  return { every: every === 'true', format, key };
}
