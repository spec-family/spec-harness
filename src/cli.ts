/**
 * The command line: arguments, dispatch, output and exit codes.
 *
 * Exit 0: done, nothing refused. Exit 1: something refused or found. Exit 2:
 * the answer cannot be trusted - a bad flag, an option, an argument or a
 * value that names nothing, a configuration that does not load, a sibling
 * that is missing or printed something unreadable, a git command that
 * failed, an output its reader closed, an error nothing here expected. A run
 * that could not look must never exit as though it looked and found nothing
 * (spec-core ADR-0005).
 *
 * A command loads what it runs. This module imports what every run needs,
 * the hook's before a write among them, and a module that only some
 * commands run is imported where one of them is the command: the hook
 * runs before and after every write an agent makes, and what it loaded of
 * the other commands was a wait before each (ADR-0002). A module that
 * cannot be loaded is thrown where it was asked for, and ends the run in a
 * line and exit 2, as every error does.
 */

import { SiblingOutputError, type ActiveBrief } from './briefs.js';
import { CONFIG_FILE, ConfigError, SIBLINGS, SPEC_BRIEF_CONFIGS } from './config.js';
import type { ClaudeCodeWiring } from './configure.js';
import { dirname, join, resolve } from 'node:path';

import { dotsOutside, gitDirectories, isDirectory, isFile, keepCall, loadConfig, localSpelling, mainWorkTree, outsideEvery, reachedBy, StateError, takeCall, writesOnly } from './fs.js';
import { changedPaths, GitError, show, stagedChanges, withBudget } from './git.js';
import type { DocumentReader } from './document.js';
import type { Decision } from './guard.js';
import { afterResponse, callFile, callRecord, claudeResponse, gitResponse, HOOK_BUDGET_MS, keptCall, mendResponse, NONE, otherAgent, parseClaudeHook, SESSION_START, sessionOf, sessionResponse, stagedArchive, TURN_END, turnResponse, warningResponse, warningsKept, warningsOf, type CallRecord, type HookRequest, type HookResponse } from './hooks.js';
import type { Base } from './round.js';
import type { BriefRow } from './types.js';
import { declaredVersion, SiblingError } from './siblings.js';
import { answerBeside, emptyValue, heldHookLine, isBlank, isClaudeHook, readHookLine, refusal, twoValues, unreadHookLine, type Command, type LineFault } from './usage.js';
import { CLAUDE_CODE_MINIMUM, MINIMUM_VERSIONS, reportsUnread, unreportedSaid, type ClaudeCodeCheck } from './versions.js';
import {
  activeBrief,
  answerOf,
  describeActive,
  EXIT_ERROR,
  EXIT_FAILED,
  EXIT_OK,
  json,
  MAIN_INSTALL,
  mayBeElsewhere,
  openFound,
  openWorkspace,
  otherTree,
  parseOptions,
  UsageError,
  version,
  type CliIO,
  type Options,
  type UnreadableLine,
  type Workspace,
  writesBy,
} from './workspace.js';

export { EXIT_ERROR, EXIT_FAILED, EXIT_OK, UsageError, version, type CliIO } from './workspace.js';

export const HELP = `spec-harness - context, guards, audits and rulings for rounds of agent work

Usage:
  spec-harness <command> [options]

Commands:
  context [brief]     What an agent needs to start a round: the brief, its scope,
                      rulings, dependencies, the rules in force, the cited documents.
  guard <path...>     May the round write these paths? Exit 1 if one is refused.
  hook claude         Answer a Claude Code PreToolUse, PostToolUse, SessionStart or Stop
                      hook (stdin). At session start it says what would hold every
                      write; at a turn's end, with "turnReport" on, what the work tree
                      holds that the brief protects or that is outside its scope.
  hook git            Answer git's pre-commit hook for the staged files.
  escalate            Ask a person to rule: --path <file> (repeatable) --reason <why>
                      [--option "<label>: <cost>"]... [--recommend <text>].
                      --list shows what waits; --show <id> prints one memo. Neither
                      raises a request: beside one, only --root and --format are read.
  rule <id>           Record a person's ruling in the brief: --allow or --deny, with
                      --note <text>. It counts once committed signed.
  rulings [brief]     The brief's rulings, and whether each one's signature verifies.
  audit [brief]       Did the round stay inside the lines: what the archive would say,
                      the brief's assertions, unverified rulings, new dependencies
                      and the install scripts it allowed.
  probe [brief]       Run the brief's probes: red at the base, green at the head.
                      --at <base|head|both>, --id <probe>.
  premises            Do the live briefs' premises still hold? For CI: exit 1 when one
                      is stale, or, with --strict, when spec-guard cannot read one.
  init                Configure the spec-* tools to agree. Prints the plan; --write
                      applies it; --git-hook adds a pre-commit hook; --block-on-failure
                      has Claude Code 2.1.295 or later hold a write when the hook cannot
                      start or runs past its timeout.
  mcp                 Serve start_round, check_path, request_escalation, audit_round,
                      list_rounds and the workflow prompts over MCP on stdio.
  doctor              Which siblings are installed, at which versions, which brief is
                      named, how Claude Code runs the guard, and git's hook. Exit 1
                      when a sibling is older than this release needs, the guard is
                      installed twice, its hook's line turns it off or holds every
                      write or runs a script that is not there, the branch names a
                      brief spec-brief does not list, cannot be asked about, or has
                      archived, but for the branch git says archived it, a round's
                      last commit, which waits to merge (CI fetches the base with its
                      history for git to say), disableAllHooks or an array for a
                      matcher switches it off, the plugin that is turned on is not on
                      this machine and nothing else guards, Claude Code is too old to
                      run its hooks, or git stops every commit at what stands for its
                      hook.

Options:
  --brief <id>        The brief the round works on. Otherwise SPEC_BRIEF, then the branch.
                      For context, guard, hook, escalate, rulings, audit, probe, premises
                      and doctor.
  --base <ref>        What the round is measured from. Otherwise "base" in
                      .spec-harness.json, then the remote's default branch. For context,
                      guard, hook, rulings, audit, probe and doctor.
  --root <dir>        Run from another directory, which must exist. For every command.
  --format <fmt>      pretty or json; audit and premises also gitlab, sarif or github.
                      For every command but hook and mcp.
  --strict            Warnings fail the run. For guard, audit, premises and doctor.
  --if-round          Where nothing names a brief, say there is no round and exit 0,
                      not 2. For audit.
  --require-measured  Fail where the round could not be measured, or its base and allowed
                      signers were read from what the round can change. For audit.
  --block-on-failure  onFailure "block" on init's entries but the one as a turn ends. For init.
  --help, --version   One of the two: both on one line are refused.

An option a command does not read, an argument it does not take, an option or an
argument given an empty value, a brief given both as the argument and as --brief,
and an option that takes one value given two that name two things are refused, exit 2,
not read as if they were not there, and so with --help or --version on the line. The
same value twice, as --root . --root ./, is read once, and on Windows a drive letter in
either case. doctor says an empty --brief or --base in its report. hook claude reads its
line as every release has, and says a line it cannot read, two values for one option or
--help beside a --root that is not a directory among them, a --root that is not a
directory, and a question it cannot read, as a warning to the person with exit 0: it
refuses nothing for any of them.

Exit codes: 0 clean, 1 refused or found something, 2 the answer cannot be trusted.
`;


/* ------------------------------------------------------------------- guard */

/**
 * The reader of a brief's rulings, loaded where a ruling is read: a write
 * to a file no brief protects reads none.
 */
const reader = async (): Promise<DocumentReader> => (await import('./reader.js')).createReader();

/**
 * The work tree with spec-brief's answers kept for a session of Claude
 * Code's, and given again to it where all they were read from reads the
 * same (ADR-0002); as it is where no session is named.
 */
function keptFor(workspace: Workspace, session: string | null): Workspace {
  return session === null ? workspace : { ...workspace, siblings: workspace.siblings.keeping(workspace.commonDir, session) };
}

/**
 * Whether the brief the branch names is one spec-brief has archived: a
 * closed round's branch, whose every write is held as under any name that is
 * no brief's, and in words of its own, since nothing on it is to be mended:
 * its round ends when the branch merges (ADR-0004).
 */
function closesRound(active: ActiveBrief): active is Extract<ActiveBrief, { readonly kind: 'archived' }> {
  return active.kind === 'archived' && active.source === 'branch';
}

/** What the hook says after what holds the write: how to mend it, or that a closed round's branch has nothing to mend. */
const MEND = 'Fix the brief or the branch before writing.';
const CLOSED = 'The round is archived and ends when this branch merges: write on the branch of a live brief.';
/** What git's hook says where the archive of the round's brief is staged beside something else. */
const ARCHIVE_ALONE = "The archive is a closed round's last commit, and takes nothing else with it: unstage the rest.";

async function decisionsFor(
  workspace: Workspace,
  options: Options,
  io: CliIO,
  asked: readonly string[],
  cwd: string,
  session: string | null = null,
): Promise<{ readonly decisions: Decision[]; readonly brief: BriefRow | null } | { readonly problem: string; readonly closed: BriefRow | null; readonly mend?: string }> {
  // A drive's share on this machine is decided as the drive, before
  // anything reads where the path is (fs.ts, localSpelling); one through
  // another share is held where it is decided, in checkPaths.
  const given = asked.map((path) => localSpelling(path, workspace.platform) ?? path);
  // A path outside every work tree of the repository is decided as one
  // outside it, whichever brief is named and whatever is wrong with the
  // name: the problem held every write, a file outside the repository
  // among them, where no brief decides one (ADR-0005). So no brief is asked
  // about for such a write, and spec-brief is not run for it.
  const outside = outsideEvery(given, workspace.root, workspace.commonDir, cwd);
  const active = outside ? null : await activeBrief(keptFor(workspace, session), options, io.env);
  const { brief, note, problem } = active === null ? { brief: null, note: undefined, problem: null } : describeActive(active);
  // A problem is said only of a brief something names, so `active` is one.
  // Where every path the problem holds is one with a `..` that reads as
  // outside every work tree, the write is held for the `..`, and said so,
  // where the problem decides no file outside the repository (ADR-0005).
  const dotted = problem === null ? [] : given.filter((path) => dotsOutside(path, workspace.root, workspace.commonDir, cwd));
  if (dotted.length > 0 && given.every((path) => dotted.includes(path) || outsideEvery([path], workspace.root, workspace.commonDir, cwd))) {
    const { heldForDots } = await import('./guard.js');
    const held = heldForDots(dotted.join(', '), problem!);
    return { problem: held.message, closed: null, mend: `${held.hint.charAt(0).toUpperCase()}${held.hint.slice(1)}.` };
  }
  if (problem !== null) return { problem, closed: closesRound(active!) ? active.brief : null };
  const { checkPaths } = await import('./round.js');
  return { decisions: await checkPaths(workspace, brief, note, given, cwd, reader, options.base), brief };
}

/**
 * Whether a decision is of a file the answer after the write is made from:
 * the configuration, spec-brief's, the brief, or a file beside it in the
 * briefs' directory, which spec-brief reads too. A call that writes one is
 * decided again after the write, so that what the write changed is read
 * (ADR-0002).
 */
function decidesAnswers(decision: Decision, brief: BriefRow | null): boolean {
  if (decision.path === CONFIG_FILE || SPEC_BRIEF_CONFIGS.includes(decision.path)) return true;
  if (brief === null) return false;
  return decision.path === brief.file || decision.path.startsWith(`${dirname(brief.file)}/`);
}

const SYMBOL: Record<Decision['verdict'], string> = { allow: 'ok     ', warn: 'warning', ask: 'ask    ', deny: 'refused' };

async function guardCommand(options: Options, io: CliIO): Promise<number> {
  if (options.positionals.length === 0) throw new UsageError('guard needs at least one path');
  const workspace = await openWorkspace(options, io);
  const decided = await decisionsFor(workspace, options, io, options.positionals, io.cwd);
  if ('problem' in decided) {
    io.stderr.write(`spec-harness: ${decided.problem}\n`);
    return EXIT_ERROR;
  }
  const { decisions } = decided;
  if (options.format === 'json') {
    io.stdout.write(json('guard', { decisions }));
  } else {
    for (const decision of decisions) {
      io.stdout.write(`${SYMBOL[decision.verdict]}  ${decision.message}\n`);
      if (decision.verdict !== 'allow') io.stdout.write(`         ${decision.hint}\n`);
    }
  }
  const refused = decisions.some((d) => d.verdict === 'deny' || d.verdict === 'ask');
  const warned = decisions.some((d) => d.verdict === 'warn');
  return refused || (options.strict && warned) ? EXIT_FAILED : EXIT_OK;
}

/* -------------------------------------------------------------------- hook */

async function readStdin(io: CliIO): Promise<string> {
  // Only the built command line reads process.stdin, and the suite spawns it
  // from dist/, outside the sweep (tests/integration/claude-code.test.ts): the
  // lines below survive it untested in-process.
  if (io.stdin !== undefined) return io.stdin();
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * The write Claude Code asks the hook about, or the session that starts, or
 * the exit code that answers already, 0: for a question that cannot be read,
 * said to the person, and for a tool that writes no file. Asked before
 * anything on the hook's own line is, so that a line that is wrong is said
 * where there is a write it leaves unchecked, or a session whose every write
 * it leaves so.
 */
async function writeAsked(io: CliIO): Promise<HookRequest | number> {
  let question: string;
  try {
    question = await readStdin(io);
  } catch (error) {
    // A question that could not be read is one the hook cannot see, as one
    // it cannot parse is, below: it has no event to hold a write by.
    return answer(io, warningResponse(`the hook input could not be read: ${(error as Error).message}, so nothing it asks about is checked`));
  }
  // Another agent that runs the line Claude Code's settings hold asks in a
  // language of its own, and is told that its write is not checked, where
  // it went ahead with no word (ADR-0012).
  const agent = otherAgent(question);
  if (agent !== null) return answer(io, warningResponse(`the hook input is not one hook claude checks: ${agent}; hook claude checks the writes of Claude Code's Edit, Write, MultiEdit and NotebookEdit alone, so this one is not checked`));
  const request = parseClaudeHook(question);
  // A hook that cannot read its question refuses nothing it cannot see, and
  // says so where the person reads it.
  if ('error' in request) return answer(io, warningResponse(`${request.error}, so nothing it asks about is checked`));
  return request.paths.length === 0 && request.event !== SESSION_START && request.event !== TURN_END ? EXIT_OK : request;
}

/**
 * What is wrong with the hook's own line, said and nothing refused for it:
 * one line, shown to the person, and exit 0, where exit 2 would hold every
 * write of the session, the one that mends the line among them. Exit 1 said
 * it as well, and is what Claude Code counts as a hook that failed, which
 * `onFailure: "block"` holds the write for (ADR-0005).
 */
function guardOff(io: CliIO, { wrong, mend }: LineFault, event: string): number {
  if (event === SESSION_START) return answer(io, sessionResponse(`${wrong}, so the guard is off and no write of this session is checked; ${mend}`));
  if (event === TURN_END) return answer(io, turnResponse(`spec-harness: ${wrong}, so the guard is off and no write of this session is checked; ${mend}`));
  return answer(io, warningResponse(`${wrong}, so the guard is off and this write is not checked; ${mend}`));
}

function answer(io: CliIO, response: { readonly stdout: string; readonly exitCode: number }): number {
  io.stdout.write(response.stdout);
  return response.exitCode;
}

/**
 * The answer to a write a configuration that does not load holds no more,
 * or `null` for every other write, which is held as before (ADR-0005). Every
 * write was held. A write outside every work tree of the repository is
 * decided as such a write is, after the write as before it: nothing of the
 * repository's decides it. And before a write to the configuration file
 * itself, and to nothing else, the line says why every other write is held,
 * so that a session can mend a typo in it. `cwd` is what a relative path
 * is read from.
 */
function mending(error: unknown, request: HookRequest, cwd: string, env: CliIO['env']): HookResponse | null {
  // Every configuration the hook loads is read from a file, so `file` is
  // never `null` here, and the test of it is the compiler's: its mutant is
  // equivalent.
  if (!(error instanceof ConfigError) || error.file === null) return null;
  // The work trees are named by the files git keeps, where git would name
  // the same ones; a repository whose configuration or environment moves a
  // work tree elsewhere is not known to leave the path outside. The file
  // was loaded from the top git named, where a `.git` stands, so the files
  // name a work tree, and the test of `null` is the compiler's.
  const found = gitDirectories(dirname(error.file), env);
  if (found !== null && found.exact && outsideEvery(request.paths, found.top, found.common, cwd)) return NONE;
  if (request.event !== 'PreToolUse' || !writesOnly(request.paths, error.file, cwd)) return null;
  return mendResponse(`${error.message}, so every other write is held until it loads; this write, to ${error.file} itself, is not checked`);
}

/**
 * What would hold every write of the session that starts, said once as it
 * starts and no write waits on it (ADR-0005): a configuration that does not
 * load, a brief named that spec-brief does not list or has archived, and
 * spec-brief itself, where a brief is named, missing, too old or unable to
 * list the briefs. Each in the words a write would be held with, and
 * `doctor` says, and with what mends it. `null` where nothing does. The
 * check never ends the session's start: whatever it meets is said.
 */
async function sessionProblem(options: Options, io: CliIO, root: string, cwd: string | null, session: string | null): Promise<string | null> {
  const held = 'so every write of this session is held until it is mended';
  // A file outside every work tree of the repository is decided as one
  // outside it, whatever is wrong with the name of the brief, the
  // configuration or spec-brief (decisionsFor, mending): such a write goes
  // ahead, and the line says so, as the report at a turn's end does.
  const outside = 'one to a file outside every work tree of the repository';
  try {
    const named = await openWorkspace({ ...options, root }, io);
    // A session in another work tree of the project has its writes decided
    // there, and so is the check (ADR-0005).
    const found = cwd === null ? null : await otherTree(named, cwd);
    const workspace = found === null ? named : await openFound(found, io, () => [named.root]);
    const active = await activeBrief(keptFor(workspace, session), options, io.env);
    const { brief, problem } = describeActive(active);
    if (problem === null) {
      // A brief spec-brief cannot read whole holds every write but one to
      // itself, as a protection that cannot be read does (guard.ts).
      if (brief === null) return null;
      // A spec-brief before the field cannot say, and is said once here,
      // where a write is decided as if it read the brief whole.
      if (brief.problems === undefined) return unreportedSaid(null);
      const { describeUnread, unreadScope } = await import('./guard.js');
      const unread = unreadScope(brief);
      return unread.length === 0 ? null : `${describeUnread(brief, unread)}, ${held}, but one to ${brief.file} itself and ${outside}: spec-brief lint names the problem`;
    }
    if (closesRound(active)) return `${heldHookLine(problem).wrong}, so every write of this session is held, but ${outside}: the round is archived and ends when this branch merges, so write on the branch of a live brief; spec-harness doctor says more`;
    return `${heldHookLine(problem).wrong}, ${held}, but ${outside}: fix the brief or the branch before writing; spec-harness doctor says more`;
  } catch (error) {
    // A session in no work tree has nothing to guard, as a write there has
    // not. Anything else that stops the check stops a write's as well, which
    // is then held as one the hook cannot check: a configuration that does
    // not load, a spec-brief that is missing, too old or cannot list the
    // briefs, and whatever a defect throws.
    if (error instanceof UsageError) return null;
    // But a write to the configuration file itself, which mends it, where
    // the file is one a write may reach under its name alone (ADR-0005). The
    // configuration is read from a file here as before a write, so the test
    // of `file` is the compiler's, and its mutant is equivalent.
    const mendable = error instanceof ConfigError && error.file !== null && writesOnly([error.file], error.file, root);
    // Of what stops the check, a configuration that does not load and a
    // spec-brief that cannot answer leave a write outside every work tree
    // to go ahead; git that does not answer, and a defect, hold it too.
    const spared = [...(error instanceof ConfigError || error instanceof SiblingError ? [outside] : []), ...(mendable ? [`one to ${error.file} itself, which is not checked`] : [])];
    return `${(error as Error).message}, ${held}${spared.length === 0 ? '' : `, but ${spared.join(' and ')}`}; spec-harness doctor says more`;
  }
}

/** The most paths a report names one by one: past it, how many more there are. */
const REPORTED = 20;

/**
 * What the work tree holds at the end of a turn that the brief protects or
 * that is outside its scope, one line a path in the words a write of it is
 * given; or `null` where there is nothing to say: `turnReport` is off, no
 * brief is named, nothing changed is either, or the session is in no work
 * tree (ADR-0005). The work tree is the one a write of the session is
 * decided in. One start of git reads what changed, and nothing is asked of
 * the base, so no ruling is read: a protected file a signed ruling allows
 * is said as protected, and the audit reads the ruling. A configuration
 * that does not load is said by every write and as the session starts, and
 * here holds the report back without a word.
 */
async function turnReport(options: Options, io: CliIO, root: string, cwd: string | null): Promise<string | null> {
  try {
    const named = await openWorkspace({ ...options, root }, io);
    const found = cwd === null ? null : await otherTree(named, cwd);
    const workspace = found === null ? named : await openFound(found, io, () => [named.root]);
    if (!workspace.config.turnReport) return null;
    const active = await activeBrief(workspace, options, io.env);
    const { brief, problem } = describeActive(active);
    if (problem !== null) {
      const ends = closesRound(active) ? ': the round is archived and ends when this branch merges' : '';
      return `spec-harness: ${heldHookLine(problem).wrong}, so what the work tree holds is not reported, and every write is held but one to a file outside every work tree of the repository${ends}; spec-harness doctor says more`;
    }
    if (brief === null) return null;
    const [changed, { decide }] = await Promise.all([changedPaths(workspace.root), import('./guard.js')]);
    const { outOfScope, protectHarness } = workspace.config;
    const signers = workspace.config.rulings.allowedSigners;
    const said = changed.map((path) => decide({ path, given: path, brief, rulings: [], outOfScope, protectHarness, signers })).filter((decision) => decision.verdict !== 'allow');
    if (said.length === 0) return null;
    const lines = said.slice(0, REPORTED).map((decision) => `- ${decision.message}. Next: ${decision.hint}.`);
    const more = said.length > REPORTED ? [`- and ${said.length - REPORTED} more: spec-harness guard <path> says each`] : [];
    const paths = said.length === 1 ? `a path that brief ${brief.id} protects or that is outside its scope` : `${said.length} paths that brief ${brief.id} protects or that are outside its scope`;
    return [`spec-harness: as this turn ended, the work tree held changes to ${paths}:`, ...lines, ...more].join('\n');
  } catch (error) {
    if (error instanceof UsageError || error instanceof ConfigError) return null;
    return `spec-harness: ${(error as Error).message}, so what the work tree holds is not reported`;
  }
}

/**
 * Claude Code's hook on a line the parser refused: an option no command has,
 * an option left without its value, a --format or an --at that is none. It
 * was exit 2 before the question was read, for the line a settings file
 * holds as for one typed at a terminal. What is said of it is `doctor`'s
 * to say as well, of a line it finds in a settings file (usage.ts).
 */
async function unreadLine(said: string, io: CliIO): Promise<number> {
  const request = await writeAsked(io);
  if (typeof request === 'number') return request;
  return guardOff(io, unreadHookLine(said).fault, request.event);
}

/**
 * The answer after a write, where it can be given with no process started,
 * or `null` where it is to be decided as before (ADR-0002, ADR-0003).
 *
 * The git directory is the one the files at the hook's root name. What the
 * run before the write kept for this call, if anything, is taken away as it
 * is read, and answered from where it is this call's: the same release,
 * session, call, tool, paths, directories, line and variables. And where
 * nothing is kept, a run after a write says nothing but a warning outside
 * the scope, which only `outOfScope: "warn"` decides: under `ask` or
 * `deny` there is nothing to say, where the configuration read is the one
 * git would have the hook read, of the work tree the session is in.
 */
async function answeredAfter(root: string, record: CallRecord | null, cwd: string | null, paths: readonly string[], io: CliIO): Promise<HookResponse | null> {
  const found = gitDirectories(root, io.env);
  if (found === null) return null;
  if (record !== null) {
    const kept = await takeCall(found.common, callFile(record));
    // warningsKept reads no text as no record as well: the test is there for
    // the type, and its mutant is equivalent.
    const warnings = kept === null ? null : warningsKept(kept, record);
    if (warnings !== null) return afterResponse(warnings);
  }
  // A path in another work tree than the one this configuration is read
  // from may be decided by another's, which may warn, and so may the file a
  // link has a path written to.
  if (!found.exact || (cwd !== null && mayBeElsewhere(cwd, found.top)) || paths.some((path) => reachedBy(path, cwd ?? io.cwd).some((spelled) => mayBeElsewhere(spelled, found.top)))) return null;
  try {
    return (await loadConfig(found.top)).config.outOfScope === 'warn' ? null : afterResponse([]);
  } catch {
    // A configuration that does not load is said as it was, by the run.
    return null;
  }
}

/**
 * The answer before a write the hook could not check: one line, and exit 2,
 * which holds the write. Claude Code shows the line to Claude as the
 * reason.
 */
function cannotCheck(io: CliIO, error: unknown): number {
  io.stderr.write(`spec-harness: cannot check this write: ${(error as Error).message}\n`);
  return EXIT_ERROR;
}

/**
 * `hook claude` within one budget for every process it starts, below the
 * timeout Claude Code gives its entry, so that a run of slow processes ends
 * with its own answer and not the cancelling of it (ADR-0002); `hook git`
 * as it was, which no entry of Claude Code's runs.
 */
function hookCommand(options: Options, io: CliIO): Promise<number> {
  return options.positionals[0] === 'claude' ? withBudget(HOOK_BUDGET_MS, () => answerHook(options, io)) : answerHook(options, io);
}

async function answerHook(options: Options, io: CliIO): Promise<number> {
  const kind = options.positionals[0];
  if (kind === 'claude') {
    const asked = await writeAsked(io);
    if (typeof asked === 'number') return asked;
    // A share on this machine is read as the drive it names, before
    // anything decides where the path is; one that names no drive is kept
    // as written, and held where it is decided (checkPaths), since it can
    // be the repository by another name. The platform is the one the paths
    // are read as, the process's where the caller names none.
    const request = { ...asked, paths: asked.paths.map((path) => localSpelling(path, io.platform) ?? path) };
    // The root the line gives, or what is wrong with it: read as `doctor`
    // reads the line where it finds it in a settings file (usage.ts).
    const line = readHookLine(options.root, io.cwd, isDirectory);
    if (line.state === 'off') return guardOff(io, line.fault, request.event);
    const cwd = request.cwd ?? io.cwd;
    const root = line.root ?? io.env['CLAUDE_PROJECT_DIR'] ?? cwd;
    const session = sessionOf(request);
    if (request.event === SESSION_START) return answer(io, sessionResponse(await sessionProblem(options, io, root, request.cwd, session)));
    if (request.event === TURN_END) return answer(io, turnResponse(await turnReport(options, io, root, request.cwd)));
    const record = callRecord(request, { root: line.root, brief: options.brief, base: options.base }, io.cwd, io.env, version());
    if (request.event === 'PostToolUse') {
      const answered = await answeredAfter(root, record, request.cwd, request.paths, io);
      if (answered !== null) {
        io.stdout.write(answered.stdout);
        return answered.exitCode;
      }
    }
    let workspace: Workspace;
    try {
      workspace = await openWorkspace({ ...options, root }, io);
    } catch (error) {
      if (error instanceof UsageError) return EXIT_OK;
      const mended = mending(error, request, cwd, io.env);
      if (mended !== null) return answer(io, mended);
      // git asked where the work tree is and did not answer within its time
      // limit: before a write that is a write the hook could not check, said
      // as one (ADR-0002).
      if (error instanceof GitError && request.event === 'PreToolUse') return cannotCheck(io, error);
      throw error;
    }
    try {
      // The answer reads a decision by its verdict, which a mutant's text
      // put first on this list has none of: that mutant is equivalent.
      const decisions: Decision[] = [];
      // Whether the run after the write may answer from what this one keeps:
      // not where a decision refuses, nor where the write is to what the
      // answer is made from, in any work tree that decides it.
      let keeps = true;
      for (const part of await writesBy(workspace, request.cwd, request.paths, io)) {
        const decided = await decisionsFor(part.workspace, options, io, part.paths, cwd, session);
        if ('problem' in decided) {
          // Exit 2 blocks the tool call, and its stderr reaches the model. Where
          // the name stands on the hook's own line, what is wrong with it is
          // `doctor`'s to say as well, in the same words (usage.ts).
          io.stderr.write(`spec-harness: ${heldHookLine(decided.problem).wrong}. ${decided.mend ?? (decided.closed === null ? MEND : CLOSED)}\n`);
          return EXIT_ERROR;
        }
        // A line of the answer for each path, by the work tree that decided it.
        decisions.push(...decided.decisions);
        if (decided.decisions.some((decision) => decision.verdict === 'deny' || decidesAnswers(decision, decided.brief))) keeps = false;
      }
      const response = claudeResponse(request.event, decisions);
      io.stdout.write(response.stdout);
      // What the run after the write will say, kept for it where the call
      // goes ahead: a refused call has none. It changes nothing of the
      // answer, which is made before it is kept.
      if (request.event === 'PreToolUse' && record !== null && keeps) {
        await keepCall(workspace.commonDir, callFile(record), keptCall(record, warningsOf(decisions)));
      }
      return response.exitCode;
    } catch (error) {
      if (request.event !== 'PreToolUse') throw error;
      // The configuration of another work tree the write is decided in,
      // which does not load, lets a write to itself through as the
      // project's does.
      const mended = mending(error, request, cwd, io.env);
      if (mended !== null) return answer(io, mended);
      // A round is named and its briefs cannot be read: the guard cannot
      // tell a protected file from any other, so the write waits.
      return cannotCheck(io, error);
    }
  }
  if (kind === 'git') {
    // git starts its hook at the top of the work tree it commits in, a
    // linked worktree's own, whose install may be none: it is then checked
    // with the main work tree's (ADR-0005).
    const workspace = await openWorkspace(options, io, MAIN_INSTALL);
    const staged = await stagedChanges(workspace.root);
    const paths = staged.flatMap((change) => (change.from === undefined ? [change.path] : [change.from, change.path]));
    if (paths.length === 0) return EXIT_OK;
    const decided = await decisionsFor(workspace, options, io, paths, workspace.root);
    if ('problem' in decided) {
      const { closed, problem } = decided;
      if (closed === null) {
        io.stderr.write(`spec-harness: ${problem}\n`);
        return EXIT_ERROR;
      }
      // The round's last commit is on its own branch, whose name by then is a
      // closed round's: held with the rest, a round could only be archived
      // after it merged, where spec-brief has no diff to measure its scope
      // by (ADR-0004).
      const live = (await workspace.siblings.briefs()).filter((row) => row.phase === 'live').map((row) => row.file);
      const archive = stagedArchive(staged, closed.file, live);
      if (archive === 'alone') return EXIT_OK;
      io.stderr.write(`spec-harness: ${problem}. ${archive === 'beside' ? ARCHIVE_ALONE : CLOSED}\n`);
      return EXIT_ERROR;
    }
    const response = gitResponse(decided.decisions);
    io.stderr.write(response.text);
    return response.exitCode;
  }
  throw new UsageError('hook takes "claude" or "git"');
}

/* ------------------------------------------------------------------ doctor */

/**
 * The base, and the allowed-signers file as it is on it: the file waits on
 * the base, and the two on nothing else doctor asks. A --base given nothing
 * is no base, said as the brief's is, in the report.
 */
async function baseAndSigners(
  { resolveBase }: Pick<typeof import('./round.js'), 'resolveBase'>,
  workspace: Workspace,
  flag: string | undefined,
  signersFile: string,
): Promise<{ readonly base: Base; readonly signersFile: string; readonly signersText: string | null }> {
  // Nothing in doctor asks what kind a base is but whether it is resolved, so
  // the mutant that names this one otherwise is equivalent.
  const base: Base = flag !== undefined && isBlank(flag) ? { kind: 'unresolved', reason: emptyValue('--base', 'base', flag) } : await resolveBase(workspace, flag);
  // An unresolved base has no commit: git shows nothing for one, so asking
  // anyway reads as no file, and that mutant is equivalent.
  // The file is the one the configuration the round is measured by names,
  // as rulings reads it; with no base, the work tree's is said.
  const file = base.kind === 'resolved' ? base.signers : signersFile;
  const signersText = base.kind === 'resolved' ? await show(base.sha, file, workspace.root) : null;
  return { base, signersFile: file, signersText };
}

/**
 * The release of spec-harness installed in a work tree, where the hook's
 * line, init's and the plugin's, names its script under the project's
 * `node_modules`; `null` where none is, or its manifest gives no version.
 */
function harnessRelease(root: string): string | null {
  const version = declaredVersion(join(root, 'node_modules', '@spec-family', 'spec-harness', 'package.json'));
  return typeof version === 'string' ? version : null;
}

/**
 * How Claude Code is wired to the guard, and the release of the one on
 * `PATH`, which waits on the wiring: only a Claude Code that runs the guard
 * is asked its release, since one older than the hooks need lets every
 * write through unguarded. `null` where it was not asked. The wiring asks
 * it itself, since which writes a line is started for can turn on the
 * release as well (round.ts); the two are told apart here for the report,
 * which has a place of its own for the release. The script each line runs
 * is looked for in `places`, where `${CLAUDE_PROJECT_DIR}` can point.
 */
async function wiringAndRelease(
  { claudeCodeWiring }: Pick<typeof import('./round.js'), 'claudeCodeWiring'>,
  root: string,
  io: CliIO,
  places: readonly string[],
): Promise<{ readonly wiring: Omit<ClaudeCodeWiring, 'release'>; readonly release: ClaudeCodeCheck | null }> {
  const { release, ...wiring } = await claudeCodeWiring(root, io, undefined, true, places);
  return { wiring, release };
}

async function doctorCommand(options: Options, io: CliIO): Promise<number> {
  // What doctor alone runs of them, loaded before anything is asked: the
  // five things below are asked at once, and none waits on a module.
  const [configure, round, setup, signing] = await Promise.all([import('./configure.js'), import('./round.js'), import('./setup.js'), import('./signers.js')]);
  const { describeBase, describeClaudeCode, describeClaudeRelease, describeGitHook, describeHooksOff, describeInstalls, describePlugin, describePluginAhead, describePluginScripts, describePresence, describeSignerKeys, describeSignerProblem, describeSigners, earlierTool, guardSwitchedOff, guardWired, NO_SESSION_START, NO_TURN_END, wiringState } = configure;
  const { closedRound, describeClosedRound, diagnoseBrief, specBriefPlugin } = round;
  const { gitHook } = setup;
  const { notFido2, readAllowedSigners } = signing;
  // The siblings as git's hook finds them in this work tree: its own
  // install, and in a linked worktree with none the main work tree's.
  const workspace = await openWorkspace(options, io, MAIN_INSTALL);
  // A command `tools` names that runs a script of the earlier scope's
  // install runs while that package is installed, and fails doctor where
  // the script is not there, as a hook's line whose script is gone does.
  const gone: string[] = [];
  const rows = SIBLINGS.map((name) => {
    const sibling = workspace.siblings.locate(name);
    const row = { tool: name, state: sibling.kind, minimum: MINIMUM_VERSIONS[name] };
    if (sibling.kind === 'absent') return { ...row, version: null, elsewhere: null, detail: sibling.reason };
    const elsewhere = sibling.elsewhere ?? null;
    const whose = elsewhere === null ? '' : `, the install of ${elsewhere}: this work tree has none of its own`;
    if (sibling.kind === 'outdated') return { ...row, version: sibling.version, elsewhere, detail: `${sibling.reason}${whose}` };
    const command = sibling.command.join(' ');
    if (sibling.version !== null) return { ...row, version: sibling.version, elsewhere, detail: `${command} (${sibling.version}${whose})` };
    const earlier = earlierTool(name, sibling.command, (path) => isFile(resolve(workspace.root, path)));
    if (earlier?.gone === true) gone.push(name);
    const named = `${command} (named in .spec-harness.json; its version is not checked)`;
    return { ...row, version: null, elsewhere, detail: earlier === null ? named : `${named}; ${earlier.detail}` };
  });
  const configuredSigners = workspace.config.rulings.allowedSigners;
  // Five things that wait on the work tree and on nothing of one another,
  // each a process or a chain of them. Asked one after another, Claude
  // Code's release, the longest wait of a doctor on Windows, was asked for
  // only when every answer of git's before it was in. So they are asked at
  // once, and read below in the order they were asked in before: where more
  // than one fails, the first of that order is the one thrown, whichever
  // failed first by the clock (ADR-0002).
  // In a linked worktree, `${CLAUDE_PROJECT_DIR}` names it in a session
  // started there and the main checkout in a worktree session of the desktop
  // app (https://code.claude.com/docs/en/worktrees, What worktrees share with
  // the main checkout, read 2026-10-24): the hook's script is looked for in
  // both, and is not there only where it is in neither.
  const main = mainWorkTree(workspace.commonDir);
  const [briefAsked, baseAsked, pluginAsked, claudeAsked, hookAsked] = await Promise.allSettled([
    diagnoseBrief(workspace, options, io.env),
    baseAndSigners(round, workspace, options.base, configuredSigners),
    specBriefPlugin(workspace.root),
    wiringAndRelease(round, workspace.root, io, main === null ? [workspace.root] : [workspace.root, main]),
    gitHook(workspace.root),
  ]);
  const named = answerOf(briefAsked);
  // A ruling counts only by a signature checked against the allowed signers
  // on the base, and only once spec-brief's archive asks the plugin about it.
  const { base, signersFile, signersText } = answerOf(baseAsked);
  // A branch that names a brief spec-brief has archived holds every write,
  // and fails doctor, but for the branch that archived it: the last commit
  // of every round, whose own CI run must not fail for it. git tells the
  // two apart by the base, so they are told once it is resolved (ADR-0004).
  const closed = named.archived === null ? null : await closedRound(workspace, base, named.archived);
  const onBase = base.kind === 'resolved' ? signersText !== null : null;
  const signers = describeSigners(signersFile, base.kind === 'resolved' ? base.ref : null, onBase === true);
  // Which keys sign, as notes: a key that is not FIDO2 can still be one the
  // agent cannot use, and a PIV key reads as a plain one (ADR-0006).
  const read = readAllowedSigners(signersText ?? '');
  const plain = notFido2(read.signers);
  const signerNotes = [describeSignerKeys(plain), ...read.problems.map(describeSignerProblem)].filter((note): note is string => note !== null);
  const plugin = answerOf(pluginAsked);
  // The plugin and init's entries both on: Claude Code runs every guard twice
  // and registers the server twice (ADR-0012).
  const { wiring, release } = answerOf(claudeAsked);
  const claude = wiringState(wiring);
  // What the hook does with each line the settings hold for it, where there
  // is something to say: more on it than init writes, a line that turns the
  // guard off or holds every write, one only a shell can read, the writes
  // Claude Code starts it for where they are not all of them, and what
  // onFailure changes.
  const lineNotes = wiring.lines.flatMap((line) => [line.detail, line.cover, line.note, line.timeout]).filter((note): note is string => note !== null);
  // What stands over every line: a plugin that is turned on and is not on
  // this machine, or cannot be told to be, and disableAllHooks, which
  // switches off whatever hooks there are.
  const switchedOff = guardSwitchedOff(wiring);
  // And whether the hook is started as a session starts, where settings hold
  // the guard: a note, failing nothing, and `sessionStart` in the document.
  const atStart = wiring.hooks.length > 0 && !wiring.sessionStart ? NO_SESSION_START : null;
  // And whether the report the configuration asks for at a turn's end is
  // made at all: a note, failing nothing, and `turnEnd` in the document.
  const atEnd = workspace.config.turnReport && !wiring.turnEnd ? NO_TURN_END : null;
  // And, in a linked worktree where something wires the guard, the release
  // the hook's line runs where it is not this work tree's own: a note. In
  // the main work tree both are read from one install, and are one.
  const installs = guardWired(wiring) && main !== null ? describeInstalls(main, harnessRelease(main), harnessRelease(workspace.root)) : null;
  // And what the plugin runs, where it may be on this machine: a script the
  // project has not installed, which Claude Code cannot start, fails doctor
  // (ADR-0012, amended 2026-11-08); a plugin of a release after the package
  // installed here is a note. The package is this work tree's own.
  const unstartable = describePluginScripts(wiring);
  const ahead = describePluginAhead(wiring.pluginVersions, harnessRelease(workspace.root));
  const wiringNotes = [describePresence(wiring), wiring.hooksOff === null ? null : describeHooksOff(wiring.hooksOff, switchedOff), installs, unstartable, ahead].filter((note): note is string => note !== null);
  // How the hook runs the harness is a note: one that goes through npx guards
  // as well as one that does not, and fails nothing, --strict or not.
  const { hook, note: hookNote } = answerOf(hookAsked);
  const branch = workspace.branch === null ? '(detached)' : `${workspace.branch}${workspace.branchSource === undefined ? '' : ` (detached; ${workspace.branchSource} names it)`}`;
  if (options.format === 'json') {
    io.stdout.write(
      json('doctor', {
        root: workspace.root,
        branch: workspace.branch,
        branchSource: workspace.branchSource ?? null,
        brief: named.id,
        briefProblem: named.problem,
        closedRound:
          closed === null
            ? null
            : { state: closed.state, file: closed.brief.file, mergeBase: closed.state === 'unknown' ? null : closed.mergeBase, detail: describeClosedRound(closed) },
        base: base.kind === 'resolved' ? { ref: base.ref, source: base.source, mergeBase: base.mergeBase } : { unresolved: base.reason },
        allowedSigners: {
          file: signersFile,
          onBase,
          detail: signers,
          notFido2: plain.map(({ line, principals, keyType }) => ({ line, principals, keyType })),
          problems: read.problems,
        },
        plugin: { state: plugin.kind, file: 'file' in plugin ? plugin.file : null, detail: describePlugin(plugin) },
        claudeCode: {
          state: claude,
          ...wiring,
          detail: describeClaudeCode(wiring),
          notes: wiringNotes,
          release:
            release === null
              ? { state: 'unchecked', version: null, minimum: CLAUDE_CODE_MINIMUM, detail: 'not asked: nothing wires Claude Code to the guard here' }
              : { state: release.state, version: 'version' in release ? release.version : null, minimum: CLAUDE_CODE_MINIMUM, detail: describeClaudeRelease(release) },
        },
        gitHook: { state: hook.state, file: 'file' in hook ? hook.file : null, detail: describeGitHook(hook), note: hookNote },
        siblings: rows,
      }),
    );
  } else {
    const more = (notes: readonly string[]): string[] => notes.map((note) => `        ${note}`);
    io.stdout.write(
      [
        `root    ${workspace.root}`,
        `branch  ${branch}`,
        `brief   ${named.problem === null ? (named.id ?? '(none named)') : `none: ${named.problem}`}`,
        ...more(closed === null ? [] : [describeClosedRound(closed)]),
        `base    ${describeBase(base)}`,
        `signers ${signers}`,
        ...more(signerNotes),
        `plugin  ${describePlugin(plugin)}`,
        `claude  ${describeClaudeCode(wiring)}`,
        ...more(wiringNotes),
        ...more(lineNotes),
        ...more(release === null ? [] : [describeClaudeRelease(release)]),
        ...more(atStart === null ? [] : [atStart]),
        ...more(atEnd === null ? [] : [atEnd]),
        `git     ${describeGitHook(hook)}`,
        ...more(hookNote === null ? [] : [hookNote]),
        '',
        '',
      ].join('\n'),
    );
    // A spec-brief that runs and cannot say which briefs it could not read
    // whole, said once, under its line (ADR-0005). The rows are SIBLINGS',
    // in its order, so its row is at its place there.
    const lister = rows[SIBLINGS.indexOf('spec-brief')]!;
    const unreported = lister.state === 'found' && lister.version !== null && !reportsUnread(lister.version) ? unreportedSaid(lister.version) : null;
    for (const row of rows) {
      io.stdout.write(`${row.state.padEnd(8)}  ${row.tool.padEnd(10)}  ${row.detail}\n`);
      if (row === lister && unreported !== null) io.stdout.write(`${' '.repeat(22)}note: ${unreported}\n`);
    }
  }
  // An outdated sibling is a problem to fix, where a missing optional one is
  // a choice; with none installed, the harness can check nothing; and so is
  // a command `tools` names whose script of the earlier scope is gone. A double
  // install is a problem too, where no Claude Code wiring at all is a choice,
  // and so are a hook whose own line turns the guard off or holds every
  // write, or whose script is not there, a branch that names a brief no round
  // can work under, which holds every write as well, but for the branch that
  // archived its brief and waits to merge (ADR-0004), or one that names a
  // brief spec-brief cannot be asked about, which the hook holds every write
  // for too, guard hooks that disableAllHooks
  // switches off, a plugin that is turned on and is not on this machine
  // where no hook of init's stands in for it, a plugin whose hooks run a
  // script the project has not installed, a Claude Code too old to run
  // the hooks, and something at the path of git's pre-commit hook that git
  // cannot run and stops every commit at. A release that cannot be told is
  // not fine either, nor a line whose reading cannot be, nor a plugin that
  // cannot be told to be on this machine, nor a hook git runs that cannot be
  // read, which stops every commit as a script and runs as a program, nor a
  // place git runs its hooks from that git cannot name: --strict fails the
  // five.
  const outdated = rows.some((row) => row.state === 'outdated');
  // A --brief or a --base given nothing is said in the report, where every
  // other command refuses it, and fails: the question doctor was asked
  // names nothing, as a script that hands it an unset variable does.
  const blank = [options.brief, options.base].some((value) => value !== undefined && isBlank(value));
  const usable = rows.some((row) => row.state === 'found');
  const off = wiring.lines.some((line) => line.state === 'off' || line.state === 'held');
  const missing = wiring.presence?.state === 'absent' && wiring.hooks.length === 0;
  const notInstalled = unstartable !== null;
  const tooOld = release?.state === 'outdated';
  const stopped = hook.state === 'stops';
  const unworkable = named.branch && closed?.state !== 'waiting-to-merge';
  // Only an unreadable hook has `runs`, so the test of its state is the
  // compiler's, and its mutant is equivalent.
  const untold =
    options.strict &&
    (release?.state === 'unknown' || wiring.lines.some((line) => line.state === 'unknown') || wiring.presence?.state === 'unknown' || (hook.state === 'unreadable' && hook.runs) || hook.state === 'unknown');
  return outdated || !usable || blank || gone.length > 0 || claude === 'both' || off || unworkable || named.holds || switchedOff || missing || notInstalled || tooOld || stopped || untold ? EXIT_FAILED : EXIT_OK;
}

/* ---------------------------------------------------------------- dispatch */

/**
 * A map, because the command is the first word a person types and an object
 * answers to more names than it was given: `spec-harness constructor` ran
 * `Object` as a command and ended on a stack trace, where `spec-harness
 * construct` is an unknown command with exit 2.
 */
const COMMANDS: ReadonlyMap<string, (options: Options, io: CliIO) => Promise<number>> = new Map(
  // One for every command that has a shape (usage.ts), which the compiler
  // holds. A command of another module loads its module when it is the one
  // typed, and no other command's.
  Object.entries({
    guard: guardCommand,
    hook: hookCommand,
    context: async (options, io) => (await import('./commands.js')).contextCommand(options, io),
    audit: async (options, io) => (await import('./commands.js')).auditCommand(options, io),
    escalate: async (options, io) => (await import('./commands.js')).escalateCommand(options, io),
    rule: async (options, io) => (await import('./commands.js')).ruleCommand(options, io),
    rulings: async (options, io) => (await import('./commands.js')).rulingsCommand(options, io),
    probe: async (options, io) => (await import('./commands.js')).probeCommand(options, io),
    premises: async (options, io) => (await import('./premises.js')).premisesCommand(options, io),
    init: async (options, io) => (await import('./setup.js')).initCommand(options, io),
    mcp: async (options, io) => (await import('./server.js')).mcpCommand(options, io),
    doctor: doctorCommand,
  } satisfies Record<Command, (options: Options, io: CliIO) => Promise<number>>),
);

async function dispatch(argv: readonly string[], io: CliIO): Promise<number> {
  let options: Options;
  try {
    options = parseOptions(argv);
  } catch (error) {
    // The parser throws nothing but its refusal of the line, which holds
    // whose line it was. Claude Code's hook says its own, and holds no
    // write for it.
    const refused = error as UnreadableLine;
    if (isClaudeHook(refused.words[0], refused.words[1])) return unreadLine(refused.message, io);
    io.stderr.write(`spec-harness: ${refused.message}\n`);
    return EXIT_ERROR;
  }
  // Two values for an option that takes one: the parser kept the last, and
  // which was meant cannot be told from the line, so it is refused as a line
  // the parser cannot read is, and Claude Code's hook says it of its own.
  const twice = twoValues(options, io.cwd);
  if (twice !== null) {
    if (isClaudeHook(options.command, options.positionals[0])) return unreadLine(twice, io);
    io.stderr.write(`spec-harness: ${twice}; give it one\n`);
    return EXIT_ERROR;
  }
  // A line that is wrong is refused before --help or --version answers: an
  // answer beside it said nothing of what was wrong, exit 0, as an option no
  // command has never was (spec-core ADR-0005).
  if (options.command !== undefined && !COMMANDS.has(options.command)) {
    io.stderr.write(`spec-harness: unknown command "${options.command}"; see spec-harness --help\n`);
    return EXIT_ERROR;
  }
  // What parsed and names nothing, before anything is read or written for it.
  const refused = refusal(options, isDirectory);
  if (refused !== null) {
    io.stderr.write(`spec-harness: ${refused}\n`);
    return EXIT_ERROR;
  }
  // Claude Code's hook is exempt from every refusal above, and said a root
  // that is not a directory only as it ran, which the help or the version
  // answered in place of: printed beside one, either is a line it cannot
  // read, said where there is a write it leaves unchecked (ADR-0005).
  const beside = isClaudeHook(options.command, options.positionals[0]) ? answerBeside(options, io.cwd, isDirectory) : null;
  if (beside !== null) return unreadLine(beside, io);
  if (options.version) {
    io.stdout.write(`${version()}\n`);
    return EXIT_OK;
  }
  if (options.help || options.command === undefined) {
    io.stdout.write(HELP);
    return options.help ? EXIT_OK : EXIT_ERROR;
  }
  return COMMANDS.get(options.command)!(options, io);
}

/**
 * Runs the command line and resolves to the exit code, for an error nothing
 * below expected too.
 *
 * Such an error is neither a refusal nor a finding: the answer cannot be
 * trusted, which is exit 2 (spec-core ADR-0005). Rejected instead, it reached
 * the launcher as Node's uncaught error, exit 1, "refused or found something"
 * to a script, and to Claude Code a hook that failed without blocking: the
 * write the guard could not check went ahead. The stack is what makes a
 * report of it something to act on, and it goes to stderr alone: a script
 * that reads a document from stdout is handed no part of one.
 *
 * A write its reader had closed the pipe for is not such an error: the answer
 * was not delivered, which is still 2, and nothing in the harness is at
 * fault, so it is said in a line and no stack sends a person looking for a
 * defect. The process's own streams report it as an event, which the
 * launcher answers in the same words; here it is a caller's stream that
 * throws it. It is read by its code: stdout and stderr are the only pipes
 * the harness writes to.
 *
 * Nor is a module of the build that is not there. The launcher says a build
 * without its command line in a line, and a module a command asks for where
 * it runs is said in the same line: a build with a file missing is not a
 * defect a stack leads to. It is read by its code too: the harness imports
 * nothing but its own modules and Node's.
 */
export async function run(argv: readonly string[], io: CliIO): Promise<number> {
  try {
    return await dispatch(argv, io);
  } catch (error) {
    // A sibling's document of a shape the harness does not read is a sibling
    // that printed something it cannot read (answers.ts): exit 2. A git
    // command that failed is what git said, and no line of the harness's;
    // and a path under git's directory where the harness keeps its state,
    // which holds something else, is said in a line of its own (fs.ts).
    if (
      error instanceof UsageError ||
      error instanceof ConfigError ||
      error instanceof SiblingError ||
      error instanceof SiblingOutputError ||
      error instanceof GitError ||
      error instanceof StateError
    ) {
      io.stderr.write(`spec-harness: ${error.message}\n`);
      return EXIT_ERROR;
    }
    if (!(error instanceof Error)) io.stderr.write(`spec-harness: unexpected error: ${String(error)}\n`);
    else if ((error as NodeJS.ErrnoException).code === 'EPIPE') io.stderr.write('spec-harness: stdout was closed before all of the output was written\n');
    else if ((error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND') io.stderr.write('spec-harness: build output is missing; run "npm run build" first, or install the published package.\n');
    else io.stderr.write(`spec-harness: unexpected error: ${error.stack ?? error.message}\n`);
    return EXIT_ERROR;
  }
}

// What bin/spec-harness.js runs; the suite spawns the built one, from dist/,
// outside the sweep (tests/integration/cli.test.ts), so it survives untested
// in-process.
export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  return run(argv, { stdout: process.stdout, stderr: process.stderr, cwd: process.cwd(), env: process.env });
}

