/**
 * What every command shares: exit codes, options, the repository a command
 * runs in, and which brief the round is working on.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs, type ParseArgsOptionsConfig } from 'node:util';

import { findActive, type ActiveBrief, type ActiveSource } from './briefs.js';
import { briefIdFromBranch, ciBranch } from './branch.js';
import type { HarnessConfig } from './config.js';
import { holdsGit, isTop, loadConfig, mainWorkTree, reachedBy, realSpelling, repositoryPath } from './fs.js';
import { commonDirectory, currentBranch, workTree, workTreeRoot, type WorkTree } from './git.js';
import type { FindingFormat } from './formats.js';
import { createSiblings, type Siblings } from './siblings.js';
import type { BriefRow } from './types.js';

export const EXIT_OK = 0;
export const EXIT_FAILED = 1;
export const EXIT_ERROR = 2;

/** The version of the JSON documents this tool prints. Bumped when a field changes meaning. */
export const JSON_SCHEMA_VERSION = 1;

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

/**
 * A command line the parser refused, with the command and the arguments on
 * it. Whose line it was decides what the refusal is: Claude Code's hook says
 * it and holds no write for it, where every other command stops (cli.ts).
 */
export class UnreadableLine extends UsageError {
  readonly words: readonly string[];

  constructor(message: string, words: readonly string[]) {
    super(message);
    this.words = words;
  }
}

export interface CliIO {
  readonly stdout: { write(text: string): unknown };
  readonly stderr: { write(text: string): unknown };
  readonly stdin?: () => Promise<string>;
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  /**
   * The platform a path is read as, where a share on this machine is a
   * drive (fs.ts, localSpelling): the process's where none is given. A
   * test reads a path as Windows does on any platform by naming it.
   */
  readonly platform?: NodeJS.Platform | undefined;
}

export function version(): string {
  // A Buffer parses as its text, so the encoding is equivalent to its mutant.
  const manifest: { version: string } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  return manifest.version;
}

export interface Options {
  readonly command: string | undefined;
  readonly positionals: readonly string[];
  /** The long name of every option given, in the order given: what tells an option left out from one a command does not read. */
  readonly given: readonly string[];
  /**
   * Every value given to each option that takes one value, by its long name,
   * in the order given. The fields below hold the last of them, which is
   * what the parser keeps.
   */
  readonly written: Readonly<Record<string, readonly string[]>>;
  readonly brief: string | undefined;
  readonly base: string | undefined;
  readonly root: string | undefined;
  /** `gitlab`, `sarif` and `github` only for `audit` and `premises`, whose findings have places. */
  readonly format: 'pretty' | 'json' | FindingFormat;
  readonly strict: boolean;
  /** audit: pass where nothing names a brief, where that is exit 2 without it. */
  readonly ifRound: boolean;
  readonly help: boolean;
  readonly version: boolean;
  /** init: apply the plan instead of printing it. */
  readonly write: boolean;
  /** init: also install git's pre-commit hook. */
  readonly gitHook: boolean;
  /** init: `onFailure: "block"` on the hook entries it writes (ADR-0012). */
  readonly blockOnFailure: boolean;
  /** escalate: the files the round needs, the reason, the options and the recommendation. */
  readonly paths: readonly string[];
  readonly reason: string | undefined;
  readonly options: readonly string[];
  readonly recommend: string | undefined;
  readonly list: boolean;
  readonly show: string | undefined;
  /** rule: the decision and what it allows. */
  readonly allow: boolean;
  readonly deny: boolean;
  readonly note: string | undefined;
  /** probe: which probe, and at which commit. */
  readonly id: string | undefined;
  readonly at: 'base' | 'head' | 'both' | undefined;
}

export function parseOptions(argv: readonly string[]): Options {
  // `satisfies`, where a const assertion would read the same to the compiler:
  // the sweep mutates nothing that stands under an `as`, the table with it.
  const options = {
    brief: { type: 'string' },
    base: { type: 'string' },
    root: { type: 'string' },
    format: { type: 'string' },
    strict: { type: 'boolean' },
    'if-round': { type: 'boolean' },
    write: { type: 'boolean' },
    'git-hook': { type: 'boolean' },
    'block-on-failure': { type: 'boolean' },
    path: { type: 'string', multiple: true },
    reason: { type: 'string' },
    option: { type: 'string', multiple: true },
    recommend: { type: 'string' },
    list: { type: 'boolean' },
    show: { type: 'string' },
    allow: { type: 'boolean' },
    deny: { type: 'boolean' },
    note: { type: 'string' },
    id: { type: 'string' },
    at: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
    version: { type: 'boolean', short: 'v' },
  } satisfies ParseArgsOptionsConfig;
  let parsed;
  try {
    parsed = parseArgs({ args: [...argv], allowPositionals: true, strict: true, options, tokens: true });
  } catch (error) {
    // Read again with nothing refused, for whose line it was and nothing
    // else: an option no command has is passed over, one left without its
    // value takes none, and no value read this way is used. The same table,
    // so that a value is not taken for the command it stands before.
    throw new UnreadableLine((error as Error).message, parseArgs({ args: [...argv], strict: false, options }).positionals);
  }
  const { values, positionals, tokens } = parsed;
  // The parser keeps the last value of an option given twice, and the earlier
  // went unread with no word of it: `--root nowhere --root .` ran in `.`. So
  // every value is kept, for the refusal of two (usage.ts). A list keeps
  // every value already.
  const table: ParseArgsOptionsConfig = options;
  const written: Record<string, string[]> = {};
  for (const token of tokens) {
    if (token.kind === 'option' && token.value !== undefined && table[token.name]!.multiple !== true) (written[token.name] ??= []).push(token.value);
  }
  // Two answers asked for at once: the version was printed, and the help went
  // unread. A line that is wrong, whoever's it is (spec-core ADR-0005). Only
  // an option's token has a name, so the test of its kind is the compiler's,
  // and its mutant is equivalent.
  const answers = tokens.flatMap((token) => (token.kind === 'option' && (token.name === 'help' || token.name === 'version') ? [token] : []));
  const other = answers.find((token) => token.name !== answers[0]!.name);
  if (other !== undefined) throw new UnreadableLine(`${answers[0]!.rawName} is given beside ${other.rawName}, and one of the two answers would go unread; give one of them`, positionals);
  const asked = values.format ?? 'pretty';
  const format = asked as Options['format'];
  const formats: readonly Options['format'][] = ['pretty', 'json', 'gitlab', 'sarif', 'github'];
  if (!formats.includes(format)) throw new UnreadableLine(`--format must be pretty, json, gitlab, sarif or github, not "${format}"`, positionals);
  const command = positionals[0];
  // Only the commands whose findings have places print them for a forge.
  if (command !== undefined && command !== 'audit' && command !== 'premises' && format !== 'pretty' && format !== 'json') {
    throw new UnreadableLine(`--format ${format} is for audit and premises; ${command} prints pretty or json`, positionals);
  }
  const at = values.at;
  if (at !== undefined && at !== 'base' && at !== 'head' && at !== 'both') throw new UnreadableLine(`--at must be base, head or both, not "${at}"`, positionals);
  return {
    command,
    positionals: positionals.slice(1),
    given: Object.keys(values),
    written,
    brief: values.brief,
    base: values.base,
    root: values.root,
    format,
    strict: values.strict === true,
    ifRound: values['if-round'] === true,
    help: values.help === true,
    version: values.version === true,
    write: values.write === true,
    gitHook: values['git-hook'] === true,
    blockOnFailure: values['block-on-failure'] === true,
    paths: values.path ?? [],
    reason: values.reason,
    options: values.option ?? [],
    recommend: values.recommend,
    list: values.list === true,
    show: values.show,
    allow: values.allow === true,
    deny: values.deny === true,
    note: values.note,
    id: values.id,
    at,
  };
}

/** Everything a command needs about the repository it runs in. */
export interface Workspace {
  readonly root: string;
  readonly commonDir: string;
  readonly config: HarnessConfig;
  readonly siblings: Siblings;
  /** The branch checked out, or on a detached head the one the forge's CI names; `null` when neither names one. */
  readonly branch: string | null;
  /** The CI variable that named the branch, on a detached head; absent when git named it. */
  readonly branchSource?: string | undefined;
  readonly cwd: string;
  /** The platform its paths are read as, as the command line's input names it; the process's where absent. */
  readonly platform?: NodeJS.Platform | undefined;
}

/**
 * A work tree as the first wave of opening it found it: the directory it
 * was asked from, its top, what one start of git said from there, and the
 * branch where it was asked beside them.
 */
export interface FoundTree {
  readonly cwd: string;
  readonly root: string;
  readonly tree: WorkTree | 'unread';
  readonly early: string | null | undefined;
}

/** The work tree that holds `cwd`, or `null` where none does. */
export async function findTree(cwd: string): Promise<FoundTree | null> {
  // Each git command is a process, a few milliseconds on Linux and a few
  // hundred on a Windows workstation, and every command opens a work tree,
  // the hook before every write among them. So the top and the common
  // directory are asked for in one start of git, and where a `.git` stands
  // in the directory, as it does at the top of a work tree, the branch is
  // asked for beside them and not after. Anywhere else the branch waits, as
  // it did: below a top it would be asked twice, and in no work tree for
  // nothing.
  const [tree, early] = await Promise.all([workTree(cwd), holdsGit(cwd) ? currentBranch(cwd) : undefined]);
  if (tree === null) return null;
  const root = tree === 'unread' ? await workTreeRoot(cwd) : tree.root;
  return root === null ? null : { cwd, root, tree, early };
}

/**
 * The git directory a found work tree's repository keeps, as git names it
 * from the directory it was found from: one repository's work trees, linked
 * and main, share it, and no two repositories do. Asked again only where
 * the one start of git could not be read.
 */
export async function foundCommonDir(found: FoundTree): Promise<string | null> {
  // Asked again from the top, git names the directory the one start named:
  // the mutant that always asks again is equivalent, at a process's cost.
  return found.tree === 'unread' ? commonDirectory(found.root) : found.tree.commonDir;
}

export async function openWorkspace(options: Pick<Options, 'root'>, io: CliIO, installs: Installs = MAIN_INSTALL): Promise<Workspace> {
  const cwd = options.root ?? io.cwd;
  const found = await findTree(cwd);
  if (found === null) throw new UsageError(`${cwd} is not inside a git work tree; spec-harness measures rounds by their commits`);
  return openFound(found, io, installs);
}

/** The installs a work tree's siblings are looked for in after its own, given its top and its common directory (siblings.ts). */
export type Installs = (root: string, commonDir: string) => readonly string[];

/**
 * Every command: a linked worktree with no install of its own is checked
 * with the main work tree's, where `git worktree add` leaves the project's
 * `node_modules`, as git's hook and doctor were, and as the hook is with the
 * project's (ADR-0005).
 */
export const MAIN_INSTALL: Installs = (root, commonDir) => {
  const main = mainWorkTree(commonDir);
  // The main work tree's own install is the one looked in first: the mutant
  // that keeps it here as well looks in it twice and finds what it found.
  return main === null || main === root ? [] : [main];
};

/** The rest of opening a work tree, once it is found: its common directory, its configuration and its branch. */
export async function openFound(found: FoundTree, io: CliIO, installs: Installs = MAIN_INSTALL): Promise<Workspace> {
  const { cwd, root, tree, early } = found;
  // The common directory and the branch are asked of the root. What git
  // said from `cwd` is that answer where `cwd` is the root, the same
  // directory asked the same thing, and nowhere else. Measured with git
  // 2.43 and 2.55: started in a work tree that `core.worktree` names, away
  // from its repository, git finds no repository, so asked of that root it
  // names no branch, where from the repository it names one. So elsewhere
  // the two are asked for from the root, as they were, at once. Only the
  // configuration can fail, so what is thrown is what it threw.
  const here = tree !== 'unread' && isTop(cwd, root) ? tree : null;
  const [common, { config }, checkedOut] = await Promise.all([here === null ? commonDirectory(root) : here.commonDir, loadConfig(root), here === null || early === undefined ? currentBranch(root) : early]);
  // Asked from the top of its own work tree, git names the common
  // directory. From a root that holds no repository, the work tree that
  // `core.worktree` names away from its own, it names none, and the
  // directory a repository would have there stands in, as it always has.
  const commonDir = common ?? `${root}/.git`;
  // A branch checked out is the branch; only a head on none, as CI checks
  // out, asks the forge which branch the run builds.
  const ci = checkedOut === null ? ciBranch(io.env) : null;
  const named = ci === null ? { branch: checkedOut } : { branch: ci.branch, branchSource: ci.source };
  return { root, commonDir, config, siblings: createSiblings(root, config, installs(root, commonDir)), ...named, cwd: io.cwd, platform: io.platform };
}

/**
 * What one of several things asked at once answered, or what it threw,
 * thrown from here: the things are asked through `Promise.allSettled`, and
 * each is read with this where it was awaited while they were asked one
 * after another. So a run in which one of them fails still fails on the
 * first that failed in that order, whichever failed first by the clock,
 * and says what it said.
 */
export function answerOf<T>(asked: PromiseSettledResult<T>): T {
  if (asked.status === 'rejected') throw asked.reason;
  return asked.value;
}

/** The id the flag, the environment or the branch names, without asking spec-brief anything. */
export function namedId(workspace: Workspace, options: Pick<Options, 'brief'>, env: CliIO['env']): string | null {
  if (options.brief !== undefined && options.brief.trim() !== '') return options.brief.trim();
  const environment = env['SPEC_BRIEF'];
  if (environment !== undefined && environment.trim() !== '') return environment.trim();
  return briefIdFromBranch(workspace.config.branches, workspace.branch);
}

export async function activeBrief(workspace: Workspace, options: Pick<Options, 'brief'>, env: CliIO['env']): Promise<ActiveBrief> {
  // Nothing names a brief, so spec-brief is not asked (ADR-0004): the answer
  // is none whatever the briefs are, and so the empty list is equivalent to
  // its mutant.
  if (namedId(workspace, options, env) === null) {
    return findActive([], {});
  }
  const briefs = await workspace.siblings.briefs();
  const fromBranch = briefIdFromBranch(workspace.config.branches, workspace.branch);
  return findActive(briefs, { flag: options.brief, environment: env['SPEC_BRIEF'], branch: fromBranch });
}

/**
 * What named a brief, as its caller knows it. An argument is the command
 * line's by default, the id after the command; a tool call's is its `brief`,
 * which the server says as it says every argument, by its name in quotes.
 */
function namedBy(source: ActiveSource, argument: string): string {
  return source === 'argument' ? argument : `the ${source}`;
}

/** What is said of a name that names no brief spec-brief knows, by what named it. */
export function namesNoBrief(active: Extract<ActiveBrief, { kind: 'unknown' }>, argument = 'the argument'): string {
  return `${namedBy(active.source, argument)} names brief ${active.id}, and spec-brief knows no such brief`;
}

/**
 * The brief a command acts on, or why there is none: a note when nothing names
 * one, which a command that needs a brief refuses with, or a problem when what
 * names one is wrong. `argument` is what the caller calls an argument that
 * named it.
 */
export function describeActive(
  active: ActiveBrief,
  argument = 'the argument',
): { brief: BriefRow; note: undefined; problem: null } | { brief: null; note: string; problem: null } | { brief: null; note: undefined; problem: string } {
  switch (active.kind) {
    case 'found':
      return { brief: active.brief, note: undefined, problem: null };
    case 'none':
      return { brief: null, note: active.reason, problem: null };
    case 'unknown':
      return { brief: null, note: undefined, problem: namesNoBrief(active, argument) };
    case 'archived':
      return {
        brief: null,
        note: undefined,
        problem: `${namedBy(active.source, argument)} names brief ${active.brief.id}, which is archived; a closed round writes nothing`,
      };
  }
}

export function json(command: string, body: Record<string, unknown>): string {
  return `${JSON.stringify({ tool: 'spec-harness', version: version(), schemaVersion: JSON_SCHEMA_VERSION, command, ...body }, null, 2)}\n`;
}

/**
 * Whether a work tree other than the one whose top is `top` may hold `cwd`:
 * `cwd` is outside it, or a `.git` stands in a directory between the two,
 * where a linked worktree, a submodule or a repository of its own starts.
 * Where neither is so, `cwd` is in that work tree, and git is asked nothing
 * more: a session works at its project's top, or below it, for nearly every
 * write. Answering that one may is what git is then asked, so the mutant
 * that always answers so is equivalent, at the cost of a process, and so
 * is each that only answers so more often: a slice one short reaches the
 * top itself, which holds a `.git`, and a part named in place of none is
 * a directory no top holds.
 */
export function mayBeElsewhere(cwd: string, top: string): boolean {
  const path = repositoryPath(cwd, top, cwd);
  if (path === null) return true;
  const parts = path === '' ? [] : path.split('/');
  return parts.some((_, index) => holdsGit(join(top, ...parts.slice(0, index + 1))));
}

/**
 * The work tree that holds `cwd`, where it is another work tree of the
 * repository the work tree `named` is one of, as the hook's root names it, by the git directory the two share;
 * `null` where `cwd` is in the root's own, in another repository, or in
 * none (ADR-0005).
 */
export async function otherTree(named: Workspace, cwd: string): Promise<FoundTree | null> {
  // Asked anyway, git names the root's own top for a directory in its work
  // tree, and none for one not made, either of which answers `null` below:
  // the mutant that always asks is equivalent, at a process's cost.
  if (!mayBeElsewhere(cwd, named.root)) return null;
  const found = await findTree(cwd);
  // The project's own work tree, found again, would decide every path the
  // same way once more: the check saves reading its configuration twice, and
  // its mutant is equivalent.
  if (found === null || found.root === named.root) return null;
  const common = await foundCommonDir(found);
  // git names a common directory wherever it names a top, so `null` is
  // there for the type.
  if (common === null || realSpelling(common) !== realSpelling(named.commonDir)) return null;
  return found;
}

/**
 * The top of the nearest work tree, of any repository, above a directory or
 * a file: the nearest directory above it that holds a `.git`, found with no
 * process; `null` where none does. A path not yet written has the
 * directories it would be written in looked through, those not made yet
 * among them.
 */
function topAbove(path: string): string | null {
  for (let directory = dirname(path); ; directory = dirname(directory)) {
    if (holdsGit(directory)) return directory;
    // Only the top of the filesystem is its own parent.
    if (dirname(directory) === directory) return null;
  }
}

/**
 * The innermost work tree of the repository the work tree `named` is one of
 * that holds a file, given by its real spelling, where it is not `named`
 * itself: a linked worktree or the main one, inside the project, beside it,
 * or around it (ADR-0005). The
 * directories above the path are looked through, with no process, for each
 * that holds a `.git`; git is asked of each that is not `named`'s top, and
 * one that git names as no work tree of this repository's, a submodule's, a
 * clone's inside the tree, or a `.git` that stands in no work tree's top, is
 * passed by for the next above it. `null` where the first of this repository
 * met is `named`, or none is: the path is decided by `named`, as before, a
 * path in no work tree of the repository among them.
 */
async function treeHolding(named: Workspace, spelled: string): Promise<FoundTree | null> {
  const own = realSpelling(named.root);
  for (let top = topAbove(spelled); top !== null; top = topAbove(top)) {
    if (top === own) return null;
    const tree = await otherTree(named, top);
    // git names a work tree whose top is not this directory where it reads
    // the `.git` here as no repository's, an empty directory say, and names
    // the one around it: the walk meets that one's top next, past any `.git`
    // between that git reads as none too, and takes it. So the mutant that
    // takes what git names here is equivalent for every work tree git makes;
    // the check keeps a `core.worktree` set by hand to name another
    // directory from deciding a path that directory does not hold.
    if (tree !== null && realSpelling(tree.root) === top) return tree;
  }
  return null;
}

/**
 * The work trees a write is decided in, each with the paths it decides, for
 * the hook and for the server's `check_path` (ADR-0005). The repository is
 * the one the hook's root names, as before. Each path is decided by the
 * innermost work tree of that repository that holds it, by its branch, its
 * briefs and its configuration, read from its top, with its siblings looked
 * for in its install and then the project's: there a session works in a
 * worktree while Claude Code names the project it started in, or writes from
 * one into another, and the hook decided by the project's branch, which
 * named no brief, so a protected write passed with no word. A path in no
 * other work tree of the repository is decided by the work tree the root
 * names, as before: a write to the project's own file from a worktree is
 * refused where it was, and a path in another repository, or in none, is
 * read as it was. `cwd` is what a relative path is read from.
 */
export async function writesBy(named: Workspace, cwd: string | null, paths: readonly string[], io: CliIO): Promise<{ readonly workspace: Workspace; readonly paths: readonly string[] }[]> {
  const from = cwd ?? io.cwd;
  const trees: { readonly tree: FoundTree | null; readonly paths: string[] }[] = [];
  // The parts in the order their work trees are first met, each with its
  // paths in the order they were named.
  for (const path of paths) {
    // Each file the path reaches, as it reads and as the system writes it,
    // by the work tree that holds that file: a link can lead from one work
    // tree into another, and each decides the file it holds.
    const held: (FoundTree | null)[] = [];
    for (const spelled of reachedBy(path, from)) {
      const tree = await treeHolding(named, spelled);
      if (!held.some((other) => other?.root === tree?.root)) held.push(tree);
    }
    for (const tree of held) {
      const part = trees.find((other) => other.tree?.root === tree?.root);
      if (part === undefined) trees.push({ tree, paths: [path] });
      else part.paths.push(path);
    }
  }
  // The root's own last, as it was decided after the work tree Claude works in.
  const ordered = [...trees.filter((part) => part.tree !== null), ...trees.filter((part) => part.tree === null)];
  return Promise.all(ordered.map(async ({ tree, paths: held }) => ({ workspace: tree === null ? named : await openFound(tree, io, () => [named.root]), paths: held })));
}
