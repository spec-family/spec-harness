/**
 * What `init` writes into each tool's configuration, and what `doctor` says
 * of the result.
 *
 * Pure: `setup.ts` and the command line read the files and ask git, and
 * write what these return, so the core sweep holds these to the unit suite.
 * Each merge keeps what a person wrote and returns `null` when there is
 * nothing to add.
 */

import { isAbsolute, join } from 'node:path';
import { runInNewContext } from 'node:vm';

import { CALLABLE_TOOLS, HOOK_BUDGET_MS } from './hooks.js';
import { literal } from './literal.js';
import type { AllowedSigner } from './signers.js';
import type { LocalBranch } from './types.js';
import { namedTree, type HookLine } from './usage.js';
import { parseGlobList } from './vendor/spec-core/pattern/index.js';
import { CLAUDE_CODE_MINIMUM, meets, parseVersion, type ClaudeCodeCheck } from './versions.js';

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null;
}

function sameStrings(value: unknown, expected: readonly string[]): boolean {
  return Array.isArray(value) && value.length === expected.length && value.every((item, index) => item === expected[index]);
}

/**
 * The command line as the project installed it. Claude Code starts a plugin's
 * server in the plugin's own directory and a hook wherever the session
 * stands, so neither can rely on `npx` finding the project's install; and on
 * Windows a server's command is started without a shell, where `npx` is a
 * shim that cannot start at all. `node` and the script's path work
 * everywhere. git's hook runs the same script, from the top of the work
 * tree, where git starts it.
 */
const BIN = 'node_modules/@spec-family/spec-harness/bin/spec-harness.js';

/** The package the script is in, as a project's package.json names it. */
const PACKAGE = '@spec-family/spec-harness';

/** The project root, as Claude Code substitutes it in a hook's arguments and in a plugin server's. */
export const PROJECT_DIR = '${CLAUDE_PROJECT_DIR}';

/**
 * The project root in a project's own `.mcp.json`. Claude Code expands it
 * there from its own environment, which does not hold it, so it needs a
 * default; `.` is right, since a project's server starts in the project.
 */
export const PROJECT_DIR_OR_HERE = '${CLAUDE_PROJECT_DIR:-.}';

/**
 * The matcher every release wrote: each name the hook reads a file from
 * (hooks.ts). `MultiEdit` is one no supported Claude Code has a tool for,
 * and Claude Code compares a listed name with a tool's exactly, so it starts
 * the hook for nothing there. It stays, since the hook is asked about a name
 * only under a matcher that lets the name through, and it reads this one for
 * whatever still sends it.
 */
const HOOK_MATCHER = 'Edit|Write|MultiEdit|NotebookEdit';
/** The event Claude Code runs before a tool call, the only one of the two where a hook can refuse the call. */
const BEFORE = 'PreToolUse';
/** The event after a call that succeeded, where a hook can only tell the model what it wrote. */
const AFTER = 'PostToolUse';
const GUARDED_EVENTS = [BEFORE, AFTER];
/**
 * The event Claude Code runs as a session starts, under which the hook says
 * what would hold every write of it (ADR-0005). Its entry has no matcher:
 * left out, it is every way a session starts.
 */
const AT_START = 'SessionStart';
/**
 * The event Claude Code runs as its main agent finishes a turn, under which
 * the hook reports what the work tree holds where `turnReport` is on
 * (ADR-0005). Its entry has no matcher: the event takes none.
 */
const AT_TURN_END = 'Stop';
const GUARD_ARGS: readonly string[] = Object.freeze([`${PROJECT_DIR}/${BIN}`, 'hook', 'claude']);

/**
 * The guard as a Claude Code hook: exec form, `args` given, so the project's
 * path is one argument whatever it holds, and no shell is involved.
 */
export const GUARD_HOOK: Readonly<Json> = Object.freeze({ type: 'command', command: 'node', args: GUARD_ARGS, timeout: 60 });

/**
 * The hook's entry at the end of a turn: the guard's line, run in the
 * background. Claude Code waits on no part of it, so the turn ends as it
 * would, and it hands the hook's `systemMessage` to Claude as the next
 * turn begins, where from an entry it waits on it shows the person the
 * message instead (the hooks reference,
 * https://code.claude.com/docs/en/hooks, *Run hooks in the background* and
 * *JSON output*, read 2026-10-19).
 */
export const TURN_HOOK: Readonly<Json> = Object.freeze({ ...GUARD_HOOK, async: true });

// bare-name: what 0.1 installed, an npx command found from wherever the
// session stood. Read here so that init replaces it, and never run.
const LEGACY_HOOK = 'npx --no-install spec-harness hook claude';
const LEGACY_SERVER_ARGS = ['--no-install', 'spec-harness', 'mcp'];

/**
 * The script as the releases from 0.1.2 to 0.21.0 wrote it, in the package
 * they were published as until the family moved to the `@spec-family` scope
 * on 2026-10-26 (spec-core's ADR-0005, Names). No release under the new name
 * looks for that package, and a line that names its script starts nothing
 * once it is uninstalled, which Claude Code takes as a hook that failed and
 * lets each write go ahead without. Read here so that init rewrites the lines
 * it wrote with it and doctor says where one stands, and never run.
 */
const EARLIER_BIN = 'node_modules/@descent-vtt/spec-harness/bin/spec-harness.js';
const EARLIER_GUARD_ARGS: readonly string[] = Object.freeze([`${PROJECT_DIR}/${EARLIER_BIN}`, 'hook', 'claude']);

/** What init says it rewrote of the entries an earlier release wrote in Claude Code's settings. */
export const GUARD_MOVED = `the entries an earlier release wrote, which ran ${EARLIER_BIN}, run ${BIN}, where they stand`;

function isGuard(hook: unknown): boolean {
  return isObject(hook) && hook['command'] === 'node' && sameStrings(hook['args'], GUARD_ARGS);
}

function isLegacyGuard(hook: unknown): boolean {
  return isObject(hook) && hook['command'] === LEGACY_HOOK;
}

/** init's entry as the releases from 0.1.2 to 0.21.0 wrote it, under each event they wrote one under. */
function isEarlierGuard(hook: unknown): boolean {
  return isObject(hook) && hook['command'] === 'node' && sameStrings(hook['args'], EARLIER_GUARD_ARGS);
}

/** An entry an earlier release of init wrote that runs the harness another way than init does now. */
function isReleasedGuard(hook: unknown): boolean {
  return isLegacyGuard(hook) || isEarlierGuard(hook);
}

function hooksOf(group: unknown): unknown[] {
  return isObject(group) && Array.isArray(group['hooks']) ? group['hooks'] : [];
}

/** A group with each entry `replaced` says an earlier release wrote put in init's line where it stands, keeping its other fields; the group itself when it has none. */
function upgraded(group: unknown, replaced: (hook: unknown) => boolean): unknown {
  const hooks = hooksOf(group);
  if (!hooks.some(replaced)) return group;
  return { ...(group as Json), hooks: hooks.map((hook) => (replaced(hook) ? { ...(hook as Json), command: 'node', args: [...GUARD_ARGS] } : hook)) };
}

/** Whether settings hold an entry init wrote before 0.22.0, which runs the script of the earlier scope, under any event init writes one under. */
export function holdsEarlierGuard(settings: unknown): boolean {
  const hooks = field(settings, 'hooks');
  return [...INIT_EVENTS, AT_TURN_END].some((event) => {
    const groups = field(hooks, event);
    return Array.isArray(groups) && groups.some((group) => hooksOf(group).some(isEarlierGuard));
  });
}

/**
 * The tools, of those that write a file and a supported Claude Code can call
 * (hooks.ts), that a group's matcher has Claude Code start the group's hooks
 * for, by its hooks reference
 * (https://code.claude.com/docs/en/hooks, Matcher patterns, read
 * 2026-10-12): left out, empty or `*`, every tool; made of letters, digits,
 * `_`, `-`, spaces, `,` and `|` alone, the tools it names, one between each
 * `|` or `,`; with any other character in it, a JavaScript regular
 * expression that may match anywhere in a tool's name. `null` where the
 * reference does not say, or it cannot be told: a matcher that is neither
 * text nor an array, is no pattern, or is a pattern whose reading runs out
 * its budget.
 *
 * Two things its page on debugging a configuration adds
 * (https://code.claude.com/docs/en/debug-your-config, Check hooks and Check
 * common causes, read 2026-10-14). A matcher that is an array is an entry
 * Claude Code lists as an invalid setting, among the reasons a hook is not
 * loaded and never fires: no tool. And a comma separates names only from
 * {@link COMMA_SINCE} on; its changelog adds that a hyphenated name is
 * matched exactly only from {@link HYPHEN_SINCE} on. So a matcher of names
 * with either in it is read as `matching` has the Claude Code here read it
 * ({@link namesReadings}), and where the readings it may have differ, it
 * cannot be told.
 */
function matchedTools(matcher: unknown, pattern: PatternReader, matching: Matching): readonly string[] | null {
  if (matcher === undefined || matcher === '' || matcher === '*') return CALLABLE_TOOLS;
  if (Array.isArray(matcher)) return [];
  if (typeof matcher !== 'string') return null;
  if (!NAMES.test(matcher)) return pattern(matcher);
  // A reading that cannot be told, or two that differ, leave the matcher one
  // whose tools cannot be told; where every reading comes to the same tools,
  // nothing turns on which the release has.
  const readings = namesReadings(matcher, pattern, matching);
  return readings.every((tools) => sameStrings(tools, readings[0]!)) ? readings[0]! : null;
}

/** A matcher that is a name, or names between `|` and `,`: what the reference compares with a tool's name exactly. */
const NAMES = /^[A-Za-z0-9_\- ,|]*$/;

/** The writing tools a matcher of names lists, one between each `|` or `,`. */
function listedTools(matcher: string): readonly string[] {
  const names = matcher.split(/[|,]/).map((name) => name.trim());
  return CALLABLE_TOOLS.filter((tool) => names.includes(tool));
}

/**
 * The release of Claude Code from which a comma in a matcher separates
 * names as a `|` does. Its page on debugging a configuration (Check hooks,
 * read 2026-10-14) has a comma before it fall through to the reading of a
 * pattern, under which the matcher never matched, and its changelog has the
 * fix under this release: hooks with comma-separated matchers no longer
 * silently never firing.
 */
export const COMMA_SINCE = '2.1.191';

/**
 * The release of Claude Code from which a hyphenated name in a matcher of
 * names is matched exactly. Its changelog
 * (https://code.claude.com/docs/en/changelog, 2.1.195, read 2026-10-18) has,
 * among its fixes, hook matchers with hyphenated identifiers that matched as
 * substrings, and match exactly from this release on; it does not say how
 * the rest of such a matcher was read.
 */
export const HYPHEN_SINCE = '2.1.195';

/**
 * How the Claude Code that runs the hooks reads a matcher of names: as every
 * release from {@link HYPHEN_SINCE} on, and the hooks reference today; as
 * the release named, which is older; or it cannot be told, where the release
 * cannot.
 */
export type Matching = { readonly as: 'today' } | { readonly as: 'older'; readonly release: string } | { readonly as: 'untold' };

/** The reading every release from {@link HYPHEN_SINCE} on has, and what a caller that asks no release is given. */
const TODAY: Matching = { as: 'today' };

/**
 * How the Claude Code doctor asked its release reads a matcher of names. A
 * release that was not asked, or could not be told, leaves the reading
 * untold: asked or not, nothing says which it is.
 */
export function matchingUnder(release: ClaudeCodeCheck | null): Matching {
  if (release === null || release.state === 'unknown') return { as: 'untold' };
  // A release that was told is one whose version was read as one, and the
  // constant is a version, so both parse.
  return meets(parseVersion(release.version)!, parseVersion(HYPHEN_SINCE)!) ? TODAY : { as: 'older', release: release.version };
}

/** Whether `release` reads a comma in `matcher` as part of a pattern: one before {@link COMMA_SINCE}, where the matcher holds one. */
function commaAsPattern(matcher: string, release: string): boolean {
  return matcher.includes(',') && !meets(parseVersion(release)!, parseVersion(COMMA_SINCE)!);
}

/** A matcher of names that holds a comma, as a release before {@link COMMA_SINCE} reads it. */
function commaEarlier(matcher: string, pattern: PatternReader): readonly string[] | null {
  // No tool, where the matcher read as a pattern matches none of the writing
  // tools, which is what the page has such a matcher do; and where it matches
  // one, as `Edit|Write,Bash` matches `Edit`, the page's two sentences, that
  // a comma is read as part of a pattern and that the matcher never matched,
  // disagree, and it cannot be told.
  const read = pattern(matcher);
  return read !== null && read.length === 0 ? read : null;
}

/**
 * Each reading the Claude Code here may have of a matcher of names: the
 * writing tools it lists, or `null` where a reading cannot be told. From
 * {@link HYPHEN_SINCE} on there is one, the names matched exactly. Before
 * {@link COMMA_SINCE} a comma in it makes it a pattern ({@link commaEarlier}).
 * Before {@link HYPHEN_SINCE} a hyphen in it made it match as a substring,
 * and the changelog does not say which way: each name matched exactly but
 * the one with the hyphen, the matcher read as a pattern, which matches
 * anywhere in a tool's name, or its whole text found in a tool's name, which
 * no writing tool's holds, since none has a hyphen. A release that cannot be
 * told may read it any way a release does.
 */
function namesReadings(matcher: string, pattern: PatternReader, matching: Matching): (readonly string[] | null)[] {
  const listed = listedTools(matcher);
  if (matching.as === 'today') return [listed];
  const substring = matcher.includes('-') ? [pattern(matcher), []] : [];
  if (matching.as === 'older') return commaAsPattern(matcher, matching.release) ? [commaEarlier(matcher, pattern)] : [listed, ...substring];
  return [listed, ...(matcher.includes(',') ? [commaEarlier(matcher, pattern)] : []), ...substring];
}

/**
 * How long the reading of one pattern may take, in milliseconds of the
 * clock. A sane matcher is read in about half of one (ADR-0005), so only a
 * pattern that backtracks without end meets it; on a machine under load an
 * ordinary one may, and is then said as one that cannot be told, where an
 * idle machine reads it.
 */
const PATTERN_BUDGET = 100;

/**
 * The writing tools a matcher that is a pattern matches, or `null` where it
 * is no pattern, or its reading runs out its budget.
 *
 * The pattern is a line of a settings file, which arrives with a clone, and
 * one can be written that a test of a few short names never finishes:
 * `^((((([A-Za-z]*)*)*)*)*)*$X` ran for more than ten seconds. Tested as
 * written, one such entry and neither doctor nor init would come back, with
 * no word. So it is made and tested in a context of its own, whose run
 * takes a timeout where a test in this one takes none, and what throws
 * there, a pattern that is none or the stop itself, is a matcher that
 * cannot be told. The shape of a pattern does not say which will: groups in
 * a row backtrack as nested ones do.
 */
function patternTools(source: string): readonly string[] | null {
  try {
    const matched: string[] = runInNewContext('tools.filter((tool) => new RegExp(source).test(tool))', { tools: CALLABLE_TOOLS, source }, { timeout: PATTERN_BUDGET });
    return matched;
  } catch {
    return null;
  }
}

/** What reads a matcher that is a pattern: the writing tools it matches, or `null` where that cannot be told. */
export type PatternReader = (source: string) => readonly string[] | null;

/**
 * A reader for one run: a pattern is read the first time it is asked of,
 * and answered from that reading after.
 *
 * A reading that runs out its budget costs the whole of it, a settings file
 * can hold one matcher over any number of entries, and init asks of an
 * entry twice, for what doctor says of the file and for what to write into
 * it. Fifty entries under one such pattern were fifty readings, five and a
 * half seconds, and fifty-one for init; they are one. Nothing is spared a
 * file that holds a pattern of its own for each entry.
 *
 * Made where a run begins and handed down, never kept by this module: a
 * reading is of the clock, so one kept past its run would answer for a
 * machine that is busy no longer.
 */
export function patternReader(read: PatternReader = patternTools): PatternReader {
  const known = new Map<string, readonly string[] | null>();
  return (source) => {
    const before = known.get(source);
    if (before !== undefined) return before;
    const tools = read(source);
    known.set(source, tools);
    return tools;
  };
}

/** Whether Claude Code runs a hook's entry in the background, where it waits on no answer of it. */
function inBackground(hook: Json): boolean {
  return hook['async'] === true || hook['asyncRewake'] === true;
}

/**
 * The writing tools whose call Claude Code hands an entry under `event` and
 * waits for it on, or `null` where that cannot be told here. Before a write
 * an entry in the background answers too late to refuse it, so it is waited
 * on for none (the reference, Run hooks in the background). An `if` has the
 * entry started only for the calls its rule matches, in the syntax of a
 * permission rule, which is not read here.
 */
function answered(event: string, matcher: unknown, hook: Json, pattern: PatternReader, matching: Matching): readonly string[] | null {
  if (event === BEFORE && inBackground(hook)) return [];
  if (hook['if'] !== undefined) return null;
  return matchedTools(matcher, pattern, matching);
}

/**
 * `.claude/settings.json`, or the plugin's hooks, with the guard hooks merged
 * in; `null` when they are already there.
 *
 * An event has the guard where Claude Code starts init's own line under it
 * for a write. Where the settings hold another line of the hook that it
 * starts for a write, one `isHook` knows as the hook's by the words after
 * the harness's command, nothing is merged in at all: the line is a
 * person's, a second one beside it would run for every write as well, and
 * init rewrites none but those an earlier release wrote: 0.1's npx command,
 * and the line of 0.1.2 to 0.21.0, whose script is the earlier scope's,
 * under each event it stood under. Without `isHook`, only init's
 * own line is known: the default's `false` and an `undefined` read the same
 * in `some`, so that mutant is equivalent.
 *
 * `pattern` reads a matcher that is a pattern: the run's own reader, where
 * the run has read the file's matchers already ({@link patternReader}).
 * `matching` is how the Claude Code here reads a matcher of names, where
 * the run asked its release ({@link matchingUnder}): a line that
 * release starts for no write is no guard, and init's own is written beside
 * it.
 */
export function mergeClaudeSettings(
  current: Json,
  isHook: (words: readonly string[]) => boolean = () => false,
  pattern: PatternReader = patternReader(),
  matching: Matching = TODAY,
): Json | null {
  const hooks = isObject(current['hooks']) ? current['hooks'] : {};
  const theirs = harnessEntries(current).some((entry) => !isGuard(entry.hook) && !isReleasedGuard(entry.hook) && isHook(entry.words) && isStarted(toolsOf(entry, pattern, matching)));
  if (theirs) return null;
  let changed = false;
  const next: Json = { ...hooks };
  for (const event of GUARDED_EVENTS) {
    const listed = hooks[event];
    const before: unknown[] = Array.isArray(listed) ? listed : [];
    const groups = before.map((group) => upgraded(group, isReleasedGuard));
    const replaced = groups.some((group, index) => group !== before[index]);
    const present = harnessEntries({ hooks: { [event]: groups } }).some((entry) => isGuard(entry.hook) && isStarted(toolsOf(entry, pattern, matching)));
    if (!present) groups.push({ matcher: HOOK_MATCHER, hooks: [{ ...GUARD_HOOK, args: [...GUARD_ARGS] }] });
    if (replaced || !present) {
      next[event] = groups;
      changed = true;
    }
  }
  // The entries 0.19.0 to 0.21.0 wrote as a session starts, and 0.20.0 and
  // 0.21.0 as a turn ends, run the earlier scope's script too, and are
  // init's own beside the two: rewritten where they stand. 0.1 wrote none
  // there, so a line of its npx command under them is a person's.
  for (const event of [AT_START, AT_TURN_END]) {
    const listed = hooks[event];
    if (!Array.isArray(listed)) continue;
    const groups = listed.map((group) => upgraded(group, isEarlierGuard));
    if (groups.some((group, index) => group !== listed[index])) {
      next[event] = groups;
      changed = true;
    }
  }
  return changed ? { ...current, hooks: next } : null;
}

/**
 * Settings with init's entry under `SessionStart` added beside its two, or
 * `null` where it is not to be: where init's own line does not stand
 * under both `PreToolUse` and `PostToolUse`, a file init writes no hook
 * into or one it has yet to complete; and where a line of the hook stands
 * under `SessionStart` already, init's or one `isHook` knows, which would
 * say the same twice (ADR-0012).
 */
export function withSessionStart(settings: Json, isHook: (words: readonly string[]) => boolean): Json | null {
  const hooks = isObject(settings['hooks']) ? settings['hooks'] : {};
  const own = GUARDED_EVENTS.every((event) => harnessEntries({ hooks: { [event]: hooks[event] } }).some((entry) => isGuard(entry.hook)));
  if (!own || startsSessions(settings, isHook)) return null;
  const listed = hooks[AT_START];
  return { ...settings, hooks: { ...hooks, [AT_START]: [...(Array.isArray(listed) ? listed : []), { hooks: [{ ...GUARD_HOOK, args: [...GUARD_ARGS] }] }] } };
}

/** The events init writes its own line under. */
const INIT_EVENTS: readonly string[] = [BEFORE, AFTER, AT_START];

/**
 * Settings with `onFailure: "block"` on each of init's own entries, under
 * the three events it writes them under, or `null` where each has it
 * already: `init --block-on-failure`. Claude Code's hooks reference
 * (https://code.claude.com/docs/en/hooks, Block the action when a hook
 * fails, read 2026-10-19) has the field read by Claude Code 2.1.295 and
 * later, and a failure under it, a hook that cannot start or that reaches
 * its timeout among them, do what exit 2 does on its event: before a write,
 * hold it. What a release before 2.1.295 does with the key is on no page, so
 * init writes it only where it is asked to (ADR-0012). An entry a person
 * wrote is theirs, and is left as it is.
 */
export function withOnFailure(settings: Json): Json | null {
  const hooks = isObject(settings['hooks']) ? settings['hooks'] : {};
  const unblocked = (hook: unknown): boolean => isGuard(hook) && (hook as Json)['onFailure'] !== 'block';
  const next: Json = { ...hooks };
  let changed = false;
  for (const event of INIT_EVENTS) {
    const groups = hooks[event];
    if (!Array.isArray(groups) || !groups.some((group) => hooksOf(group).some(unblocked))) continue;
    next[event] = groups.map((group) => (hooksOf(group).some(unblocked) ? { ...(group as Json), hooks: hooksOf(group).map((hook) => (unblocked(hook) ? { ...(hook as Json), onFailure: 'block' } : hook)) } : group));
    changed = true;
  }
  return changed ? { ...settings, hooks: next } : null;
}

/**
 * Whether settings have Claude Code start the hook as a session starts: an
 * entry under `SessionStart` whose line is init's, or one `isHook` knows
 * as the hook's. Its matcher is not read: one that names some of the ways a
 * session starts has the check made for those.
 */
export function startsSessions(settings: unknown, isHook: (words: readonly string[]) => boolean): boolean {
  const groups = field(field(settings, 'hooks'), AT_START);
  if (!Array.isArray(groups)) return false;
  return groups.some((group) => hooksOf(group).some((hook) => isObject(hook) && (isGuard(hook) || knownAs(hook, isHook))));
}

/**
 * Settings with init's entry under `Stop` added, or `null` where a line
 * of the hook stands there already, init's or one `isHook` knows, which
 * would report the turn twice (ADR-0012).
 */
export function withTurnReport(settings: Json, isHook: (words: readonly string[]) => boolean): Json | null {
  if (reportsTurns(settings, isHook)) return null;
  const hooks = isObject(settings['hooks']) ? settings['hooks'] : {};
  const listed = hooks[AT_TURN_END];
  return { ...settings, hooks: { ...hooks, [AT_TURN_END]: [...(Array.isArray(listed) ? listed : []), { hooks: [{ ...TURN_HOOK, args: [...GUARD_ARGS] }] }] } };
}

/** Whether settings have Claude Code start the hook as a turn ends: an entry under `Stop` whose line is init's, or one `isHook` knows as the hook's. */
export function reportsTurns(settings: unknown, isHook: (words: readonly string[]) => boolean): boolean {
  const groups = field(field(settings, 'hooks'), AT_TURN_END);
  if (!Array.isArray(groups)) return false;
  return groups.some((group) => hooksOf(group).some((hook) => isObject(hook) && (isGuard(hook) || knownAs(hook, isHook))));
}

/** Whether `isHook` knows an entry's line as the hook's. */
function knownAs(hook: Json, isHook: (words: readonly string[]) => boolean): boolean {
  const written = writtenHook(hook);
  return written !== null && isHook(written.words);
}

/**
 * What doctor notes where settings hold the guard hooks and none under
 * `SessionStart`: what would hold every write is said at the first write,
 * which it holds, and not as the session starts.
 */
export const NO_SESSION_START =
  'note: no settings file has Claude Code start the hook as a session starts, so a configuration that does not load, or a brief named that spec-brief does not list, is said only at the first write, which it holds: spec-harness init --write adds the entry beside the two it wrote';

/**
 * What doctor notes where `turnReport` is on and no settings file has Claude
 * Code start the hook as a turn ends: the report the configuration asks for
 * is made at no turn's end. The plugin brings no entry for it (ADR-0012).
 */
export const NO_TURN_END = `note: "turnReport" is on, and no settings file has Claude Code start the hook as a turn ends, so no turn's end is reported: spec-harness init --write adds the entry beside init's, and says where it goes where the plugin brings the guard hooks`;

/**
 * What doctor notes, run in a linked worktree, of the spec-harness the
 * hook's line runs: the one installed where `${CLAUDE_PROJECT_DIR}` points,
 * which is this work tree in a session started in it, and the main
 * checkout in a worktree session of the desktop app's, where Claude Code
 * reads the hooks from the main checkout's root and points the placeholder
 * at it (its worktrees page, What worktrees share with the main checkout,
 * read 2026-10-19). Said where the two are not one release, `null` for
 * none, and `null` where they are. A note: from 0.19.0 on either decides a
 * write by the work tree that holds it, so it says which release answers,
 * not where a write is decided.
 */
export function describeInstalls(main: string, there: string | null, here: string | null): string | null {
  if (there === here) return null;
  const release = (version: string | null): string => (version === null ? 'none' : version);
  return `note: this is a linked worktree of ${main}, and the hook's line runs the spec-harness installed where \${CLAUDE_PROJECT_DIR} points: this work tree's, ${release(here)}, in a session started here, and ${main}'s, ${release(there)}, in one started there, as a worktree session of the desktop app is`;
}

/** The server's entry, reading the project at `projectDir`: {@link PROJECT_DIR} for the plugin, {@link PROJECT_DIR_OR_HERE} for a project. */
export function mcpServer(projectDir: string): Json {
  return { command: 'node', args: [`${projectDir}/${BIN}`, 'mcp', '--root', projectDir] };
}

function isLegacyServer(server: unknown): boolean {
  return isObject(server) && server['command'] === 'npx' && sameStrings(server['args'], LEGACY_SERVER_ARGS);
}

const EARLIER_SERVER_ARGS: readonly string[] = Object.freeze([`${PROJECT_DIR_OR_HERE}/${EARLIER_BIN}`, 'mcp', '--root', PROJECT_DIR_OR_HERE]);

/** The server's entry in a project's `.mcp.json` as the releases from 0.1.2 to 0.21.0 wrote it, with the earlier scope's script. */
function isEarlierServer(server: unknown): boolean {
  return isObject(server) && server['command'] === 'node' && sameStrings(server['args'], EARLIER_SERVER_ARGS);
}

/** Whether a project's `.mcp.json` registers the server as a release before 0.22.0 wrote it, with the earlier scope's script. */
export function holdsEarlierServer(mcp: unknown): boolean {
  return isEarlierServer(field(field(mcp, 'mcpServers'), 'spec-harness'));
}

/** What init says it rewrote of the server's entry an earlier release wrote. */
export const SERVER_MOVED = `the entry an earlier release wrote, which ran ${EARLIER_BIN}, runs ${BIN}`;

/**
 * A project's `.mcp.json` with the harness's server merged in, or `null` when
 * one is registered. A server registered under the name some other way is
 * the person's, and stays; an entry an earlier release wrote, 0.1's npx
 * entry or the line of 0.1.2 to 0.21.0 with the earlier scope's script, is
 * replaced, keeping its other fields.
 */
export function mergeMcp(current: Json): Json | null {
  const servers = isObject(current['mcpServers']) ? current['mcpServers'] : {};
  const existing = servers['spec-harness'];
  if ('spec-harness' in servers && !isLegacyServer(existing) && !isEarlierServer(existing)) return null;
  return { ...current, mcpServers: { ...servers, 'spec-harness': { ...(existing as Json | undefined), ...mcpServer(PROJECT_DIR_OR_HERE) } } };
}

/** A key of a file read as JSON; a file that is missing, or is not a JSON object, holds nothing. */
function field(file: unknown, key: string): unknown {
  return isObject(file) ? file[key] : undefined;
}

/** The harness's command on a line: its script, or its name, alone or at the end of a path. */
function isLauncher(word: string): boolean {
  const name = word.split(/[\\/]/).at(-1);
  return name === 'spec-harness' || name === 'spec-harness.js';
}

/** Anything in a word that a shell reads before the program is handed it: a quote, a variable, an operator, a pattern. */
const SHELL_READS = /[^A-Za-z0-9_./:=@%+,-]/;

/** A line of the harness's in Claude Code's settings: what follows its command there. */
export interface WrittenHook {
  /** The events whose hooks hold the line, of the two the guard answers. */
  readonly events: readonly string[];
  /** What follows the harness's command, word for word as written. */
  readonly words: readonly string[];
  /**
   * Whether a shell reads those words first, and can change them: a line
   * with no `args`, which Claude Code hands to a shell, holding a quote, a
   * variable or anything else a shell rewrites. What the hook is handed is
   * then the shell's to say. With `args`, Claude Code hands each word over
   * as it stands.
   */
  readonly shell: boolean;
  /** Whether the entry sets `onFailure` to `"block"`. */
  readonly blocks: boolean;
  /**
   * The word that names the harness, its script's path or its name, as
   * written, and whether a shell reads it first: an entry with no `args`.
   * Entries that name the harness in two ways are two lines.
   */
  readonly launcher: { readonly word: string; readonly shell: boolean };
  /**
   * What the entry has for `type` where that is not `"command"`, as it is
   * said of the line: none at all, or a word the reference does not list.
   * Whether Claude Code runs such an entry cannot be told. `null` for an
   * entry it runs as a command.
   */
  readonly untyped: string | null;
}

/**
 * The handler types that are no command, by Claude Code's hooks reference
 * (https://code.claude.com/docs/en/hooks, Hook handler fields, read
 * 2026-10-12): an entry of one sends a request, calls a tool of an MCP
 * server, or asks a model or an agent. It runs no command, the harness's or
 * any other, whatever else the entry holds.
 */
const OTHER_HANDLERS: readonly unknown[] = ['http', 'mcp_tool', 'prompt', 'agent'];

/**
 * The line of an entry that runs the harness, or `null` for one that does
 * not. Only an entry Claude Code runs as a command is one: the reference
 * has `type` as a field every entry must have, with `"command"` for a
 * command and four other words, and says nothing of an entry with none or
 * with another word, which is kept, and said as one that cannot be told.
 */
function writtenHook(hook: Json): Line | null {
  const { command, args, type } = hook;
  if (typeof command !== 'string' || OTHER_HANDLERS.includes(type)) return null;
  let line: string[];
  // Without arguments the line is a shell's, which splits it at its spaces:
  // at each one here, and what stands between two of them is no word.
  if (args === undefined) line = command.split(/\s/).filter((word) => word !== '');
  else if (Array.isArray(args) && args.every((arg): arg is string => typeof arg === 'string')) line = [command, ...args];
  // Arguments that are not all text are no line Claude Code can start.
  else return null;
  const shell = args === undefined;
  // A quote around the path of the command is the shell's, dropped to know the command by.
  const at = line.findIndex((word) => isLauncher(shell ? word.replace(/["']/g, '') : word));
  if (at === -1) return null;
  const words = line.slice(at + 1);
  const untyped = type === 'command' ? null : type === undefined ? 'no "type"' : `the "type" ${JSON.stringify(type)}`;
  return { words, shell: shell && words.some((word) => SHELL_READS.test(word)), blocks: hook['onFailure'] === 'block', untyped, launcher: { word: line[at]!, shell } };
}

/**
 * Every line in Claude Code's settings that runs the harness, under the two
 * events the guard answers: a line that stands under both, as init writes
 * it, is one line. Whose line each is, the guard's or another command's, is
 * the reader's to say (usage.ts): this knows the harness by its command
 * alone.
 */
export function writtenHooks(settings: unknown): WrittenHook[] {
  const found: { events: string[]; words: readonly string[]; shell: boolean; blocks: boolean; untyped: string | null; launcher: WrittenHook['launcher'] }[] = [];
  for (const { event, words, shell, blocks, untyped, launcher } of harnessEntries(settings)) {
    const same = found.find((other) => sameLine(other, { words, shell, blocks, untyped, launcher }));
    if (same === undefined) found.push({ events: [event], words, shell, blocks, untyped, launcher });
    else if (!same.events.includes(event)) same.events.push(event);
  }
  return found;
}

type Line = Omit<WrittenHook, 'events'>;

function sameLine(one: Line, other: Line): boolean {
  // `shell` is not compared: it follows from whether a shell reads the
  // launcher and from the words after it, which are.
  return (
    one.blocks === other.blocks &&
    one.untyped === other.untyped &&
    one.launcher.word === other.launcher.word &&
    one.launcher.shell === other.launcher.shell &&
    sameStrings(one.words, other.words)
  );
}

/**
 * Where doctor looks for the script a line runs: each directory
 * `${CLAUDE_PROJECT_DIR}` can name as a session starts, which Claude Code
 * fills in, in either form, and how a file is told to stand at a path.
 */
export interface ScriptPlaces {
  readonly projects: readonly string[];
  readonly isFile: (path: string) => boolean;
}

/**
 * What is said of the script a line runs where it is in none of the places
 * it can name, `null` where it is in one, and `null` where that cannot be
 * told here: a relative path, which is read from wherever the session
 * stands as the hook starts, a name a program finds by itself (npx's
 * package, a command on `PATH`), and a word a shell reads before it runs
 * anything.
 */
function absentScript(launcher: WrittenHook['launcher'], places: ScriptPlaces): string | null {
  const paths = [...new Set(places.projects.map((project) => launcher.word.split(PROJECT_DIR).join(project)))];
  if (paths.some((path) => (launcher.shell && SHELL_READS.test(path)) || !isAbsolute(path) || places.isFile(path))) return null;
  return paths.length === 1 ? `the script it runs, ${paths[0]}, is not there` : `the script it runs is in neither place \${CLAUDE_PROJECT_DIR} can name, ${paths.join(' or ')}`;
}

/** An entry that runs the harness: its line, where it stands, and what decides whether Claude Code starts it there. */
interface HarnessEntry extends Line {
  readonly event: string;
  /** The matcher of the entry's group, as written; `undefined` where the group has none. */
  readonly matcher: unknown;
  readonly hook: Json;
}

/**
 * The writing tools whose call an entry is handed and waited on for, or
 * `null` where that cannot be told. Read where it is asked for and no
 * sooner: a matcher that is a pattern can cost its whole budget.
 */
function toolsOf(entry: HarnessEntry, pattern: PatternReader, matching: Matching): readonly string[] | null {
  return answered(entry.event, entry.matcher, entry.hook, pattern, matching);
}

/** Every entry that runs the harness under the two events the guard answers, in the order the settings hold them. */
function harnessEntries(settings: unknown): HarnessEntry[] {
  const hooks = field(settings, 'hooks');
  if (!isObject(hooks)) return [];
  return GUARDED_EVENTS.flatMap((event) => {
    const groups = hooks[event];
    if (!Array.isArray(groups)) return [];
    return groups.flatMap((group) =>
      hooksOf(group).flatMap((hook): HarnessEntry[] => {
        if (!isObject(hook)) return [];
        const written = writtenHook(hook);
        if (written === null) return [];
        return [{ ...written, event, matcher: field(group, 'matcher'), hook }];
      }),
    );
  });
}

/** Whether Claude Code starts a line for a write, by the tools it is waited on for: one whose tools cannot be told is taken as started. */
export function isStarted(tools: readonly string[] | null): boolean {
  return tools === null || tools.length > 0;
}

/** The parts of the earlier scope's script, which a path ends in wherever it has it from. */
const EARLIER_PARTS: readonly string[] = EARLIER_BIN.split('/');

/**
 * Whether the script a line runs is the earlier scope's, by the parts its
 * path ends in: after the placeholder, after a path of the line's own, and
 * in a word a shell reads, with either separator.
 */
function namesEarlierScript(word: string): boolean {
  return sameStrings(word.split(/[\\/]/).slice(-EARLIER_PARTS.length), EARLIER_PARTS);
}

/**
 * How a line that runs the earlier scope's script is moved to this one's:
 * by init, where `rewrites`, the line being one an earlier release wrote in
 * the file init writes, and otherwise by hand.
 */
function moveTo(rewrites: boolean): string {
  const there = `${BIN}, which npm install --save-dev @spec-family/spec-harness installs`;
  return rewrites ? `spec-harness init --write rewrites the line an earlier release wrote to run ${there}` : `name ${there}, on the line in its place`;
}

/** What doctor reports of one line of Claude Code's hook. */
export interface HookReport {
  /** The settings file that holds it, as a person finds it. */
  readonly file: string;
  readonly events: readonly string[];
  /** What follows the harness's command, as written. */
  readonly line: readonly string[];
  /**
   * `guards`: Claude Code waits on the hook before a write, and the hook
   * checks it. `off`: the hook checks no write, for a line it cannot read, a
   * root that is no directory, or a root that is a directory outside any
   * work tree; or it is never started, in a file an array for a matcher
   * keeps Claude Code from loading the hooks of, or it cannot start, its
   * script not there. `held`: the hook holds every write, for a brief the
   * line names that is not one or that spec-brief cannot be asked about;
   * or Claude Code does, for a hook that cannot start under `onFailure:
   * "block"`. `unstarted`: Claude Code waits on
   * the line before no write, so it is not the guard. `unknown`: what the
   * hook is handed, which writes it is started for, or whether Claude Code
   * runs the entry at all, cannot be told here.
   */
  readonly state: 'guards' | 'off' | 'held' | 'unstarted' | 'unknown';
  readonly onFailure: 'block' | null;
  /** What there is to say of what the hook does with the line, or `null`. */
  readonly detail: string | null;
  /** The writing tools Claude Code waits on the line before a write by, where the hook can refuse it, of those a supported Claude Code can call (hooks.ts); `null` where that cannot be told. */
  readonly before: readonly string[] | null;
  /** The writing tools Claude Code starts the line after a write by, where the hook can warn of it; `null` where that cannot be told. */
  readonly after: readonly string[] | null;
  /** What there is to say of the two, or `null` where they are every tool that writes, as init has it. */
  readonly cover: string | null;
  /** What `onFailure` changes, where the entry sets it to `"block"`. */
  readonly note: string | null;
  /** What is said of an entry whose `timeout` is below what a run of the hook is given, or `null`. */
  readonly timeout: string | null;
}

/**
 * The release of Claude Code that reads `onFailure` on a hook's entry, by its
 * hooks reference (https://code.claude.com/docs/en/hooks, Command hook
 * fields, read 2026-10-19) and its changelog, which adds the field under it.
 */
export const ON_FAILURE_SINCE = '2.1.295';

/** Whether the Claude Code doctor asked its release reads `onFailure`: one that was told, at {@link ON_FAILURE_SINCE} or later. */
export function readsOnFailure(release: ClaudeCodeCheck | null): boolean {
  // A release that was told is one whose version was read as one, and the
  // constant is a version, so both parse.
  return release !== null && release.state !== 'unknown' && meets(parseVersion(release.version)!, parseVersion(ON_FAILURE_SINCE)!);
}

/**
 * What `onFailure: "block"` changes for a line, named by `where` it stands,
 * or `null` where the entry does not set it. The hook fails for none of its
 * own answers, a line of its own that turns the guard off among them, which
 * it says with exit 0 (ADR-0005): what the field holds is a hook that does
 * not run.
 */
function describeOnFailure(where: string, blocks: boolean): string | null {
  if (!blocks) return null;
  return `${where} sets onFailure to "block", so Claude Code ${ON_FAILURE_SINCE} or later holds a write when the hook fails, where it lets the write go ahead without it: by not starting, as where the script on its line is not there, or by running past its timeout`;
}

/**
 * What is said of a line whose entries give the hook less time than a run
 * of it is given ({@link HOOK_BUDGET_MS}), or `null`. Claude Code's hooks
 * reference (Timeouts, read 2026-10-24) has a command hook cancelled at its
 * entry's `timeout`, and a PreToolUse hook it cancels blocks no tool call:
 * a run that needs its budget, which holds the write at the end of it, is
 * cut short there, and the write goes ahead. A note, which fails nothing:
 * the timeout is the person's. One that is no number is not read.
 */
function describeTimeout(where: string, entries: readonly HarnessEntry[]): string | null {
  const short = entries.flatMap((entry) => {
    const seconds = entry.hook['timeout'];
    return typeof seconds === 'number' && seconds * 1000 < HOOK_BUDGET_MS ? [`${seconds} seconds under ${entry.event}`] : [];
  });
  if (short.length === 0) return null;
  return `${where} gives the hook ${named(short)}, less than the ${HOOK_BUDGET_MS / 1000} a run of it is given, so Claude Code cancels a run that takes longer before it answers, and a write it would have held goes ahead: give the entry 60, as init writes it, or no timeout`;
}

/**
 * What is said of a line that guards and whose entries set no `onFailure`,
 * where the Claude Code here reads the field: a hook that cannot start lets
 * the write go ahead, and the field would hold it. Advice, which fails
 * nothing: the file is read by every clone's Claude Code, and what a release
 * before {@link ON_FAILURE_SINCE} does with the key is on no page. `own` is
 * whether the entries are init's, in the file init writes, which
 * `init --block-on-failure` gives the field.
 */
function adviseOnFailure(where: string, own: boolean): string {
  const how = own ? 'spec-harness init --write --block-on-failure writes it on these entries' : 'it is written on each of its entries';
  return `${where} sets no onFailure, so Claude Code lets a write go ahead where the hook cannot start, as where the script on its line is not there, or runs past its timeout: where every Claude Code that reads the file is ${ON_FAILURE_SINCE} or later, as the one here is, "onFailure": "block" holds the write instead, and ${how}`;
}

/** Names as a sentence lists them: one, two with "and", more with commas before it. Never asked of none. */
function named(names: readonly string[]): string {
  const last = names.at(-1)!;
  return names.length === 1 ? last : `${names.slice(0, -1).join(', ')} and ${last}`;
}

/** The writing tools a line's entries under `event` are waited on for between them, or `null` where an entry that cannot be told might add one. */
function toolsUnder(event: string, entries: readonly HarnessEntry[], reading: Reading): readonly string[] | null {
  const read = entries.filter((entry) => entry.event === event).map((entry) => toolsOf(entry, reading.pattern, reading.matching));
  const sure = CALLABLE_TOOLS.filter((tool) => read.some((tools) => tools !== null && tools.includes(tool)));
  return sure.length < CALLABLE_TOOLS.length && read.some((tools) => tools === null) ? null : sure;
}

/** What a run reads every matcher with: its reader of patterns, and how the Claude Code here reads a matcher of names. */
interface Reading {
  readonly pattern: PatternReader;
  readonly matching: Matching;
}

/**
 * What is said after a matcher that Claude Code does not read as its text
 * suggests: an array, which it loads no hook under, and names with a comma or
 * a hyphen where the release here reads them another way than the newest
 * does, or cannot be told. Nothing for any other matcher, and nothing where
 * every reading the release may have is the names as listed.
 */
function saidOfMatcher(matcher: unknown, { pattern, matching }: Reading): string {
  if (Array.isArray(matcher)) return ', an array, which Claude Code lists as an invalid setting and loads no hook under';
  if (typeof matcher !== 'string' || !NAMES.test(matcher)) return '';
  const tools = listedTools(matcher);
  if (namesReadings(matcher, pattern, matching).every((read) => sameStrings(read, tools))) return '';
  const listed = tools.length === 0 ? 'no tool that writes' : named(tools);
  const earlier = commaEarlier(matcher, pattern) === null ? 'a pattern whose matches its documentation does not give' : 'a pattern that matches no tool';
  const substring = "a matcher with a hyphenated name in it matched as a substring, and Claude Code's changelog does not say how the rest of it was read";
  if (matching.as === 'older') {
    if (commaAsPattern(matcher, matching.release)) return `, which Claude Code ${matching.release} reads as ${earlier}: a comma separates names from ${COMMA_SINCE} on, where the matcher is ${listed}`;
    return `, which Claude Code ${matching.release} may read otherwise: before ${HYPHEN_SINCE} ${substring}; from ${HYPHEN_SINCE} on it is ${listed}`;
  }
  // The release cannot be told: a comma alone turns on 2.1.191, and a hyphen on 2.1.195.
  if (!matcher.includes('-')) return `, which is ${listed} from Claude Code ${COMMA_SINCE} on, where a comma separates names, and ${earlier} before it: the release here cannot be told`;
  const comma = matcher.includes(',') ? `, and before ${COMMA_SINCE} ${earlier}, where a comma separated no names` : '';
  return `, which is ${listed} from Claude Code ${HYPHEN_SINCE} on, and may be read otherwise before it, where ${substring}${comma}: the release here cannot be told`;
}

/** What a line's entries under `event` hold that decides when Claude Code starts them, as written. */
function entriesUnder(event: string, entries: readonly HarnessEntry[], reading: Reading): string {
  const under = entries.filter((entry) => entry.event === event);
  if (under.length === 0) return `it stands under no ${event}`;
  const said = under.map(({ matcher, hook }) => {
    const pattern = matcher === undefined ? 'no matcher' : `the matcher ${JSON.stringify(matcher)}${saidOfMatcher(matcher, reading)}`;
    const background = inBackground(hook) ? ' in the background' : '';
    const rule = hook['if'] === undefined ? '' : ` with "if" ${JSON.stringify(hook['if'])}`;
    return `${pattern}${background}${rule}`;
  });
  return `under ${event} it has ${named([...new Set(said)])}`;
}

/**
 * What is said of the writes Claude Code starts a line for, by the event and
 * the matcher of each entry that holds it; `null` where it is waited on
 * before every tool that writes and started after each, as init writes it.
 * A tool is one a supported Claude Code can call: `MultiEdit`, which the
 * hook still reads a path from, is named as unchecked for no line, since no
 * such Claude Code has it to call (hooks.ts).
 */
function describeCover(where: string, before: readonly string[] | null, after: readonly string[] | null, entries: readonly HarnessEntry[], reading: Reading): string | null {
  const parts: string[] = [];
  const left = (tools: readonly string[]): string[] => CALLABLE_TOOLS.filter((tool) => !tools.includes(tool));
  if (before === null) parts.push(`which writes Claude Code waits on it before cannot be told here (${entriesUnder(BEFORE, entries, reading)})`);
  else if (before.length === 0) parts.push(`Claude Code waits on it before no write, so it is not the guard and refuses none (${entriesUnder(BEFORE, entries, reading)})`);
  else if (left(before).length > 0) {
    parts.push(`Claude Code waits on it before a write by ${named(before)}, and before none by ${named(left(before))}, which goes unchecked (${entriesUnder(BEFORE, entries, reading)})`);
  }
  if (after === null) parts.push(`which writes it is started after cannot be told here (${entriesUnder(AFTER, entries, reading)})`);
  else if (after.length === 0) parts.push(`it is started after no write, so it warns of none (${entriesUnder(AFTER, entries, reading)})`);
  else if (left(after).length > 0) parts.push(`it is started after a write by ${named(after)} alone (${entriesUnder(AFTER, entries, reading)})`);
  return parts.length === 0 ? null : `${where}: ${parts.join('; ')}`;
}

/** The events under which an array for a matcher keeps Claude Code from loading the rest of a file's hooks. */
const UNLOADING: readonly string[] = [BEFORE, 'PermissionRequest'];

/** An array that stands for a matcher where it unloads a settings file's hooks: the event it stands under, and the array as written. */
export interface ArrayMatcher {
  readonly event: string;
  readonly matcher: string;
}

/**
 * The first array that stands for a matcher under `PreToolUse` or
 * `PermissionRequest` in a settings file, or `null`.
 *
 * Claude Code's page on debugging a configuration
 * (https://code.claude.com/docs/en/debug-your-config, Check hooks, read
 * 2026-10-14) has a matcher that is an array, where it must be one string,
 * as an entry Claude Code lists as an invalid setting, at the start of an
 * interactive session and in `claude doctor`; and where the array is under
 * one of these two events, none of that file's other hooks load either. It
 * names no release. So a file that holds one runs no hook at all, whoever
 * wrote the entry and whatever it runs: the array's own is not loaded, and
 * neither is any other.
 */
export function arrayMatcher(settings: unknown): ArrayMatcher | null {
  const hooks = field(settings, 'hooks');
  for (const event of UNLOADING) {
    const groups = field(hooks, event);
    if (!Array.isArray(groups)) continue;
    const group = groups.find((candidate) => Array.isArray(field(candidate, 'matcher')));
    if (group !== undefined) return { event, matcher: JSON.stringify(field(group, 'matcher')) };
  }
  return null;
}

/** What is said of a settings file that an array for a matcher keeps Claude Code from loading the hooks of. */
export function describeArrayMatcher(file: string, { event, matcher }: ArrayMatcher): string {
  return `${file} has an array for a matcher under ${event}, ${matcher}, which Claude Code lists as an invalid setting, and beside one under PreToolUse or PermissionRequest it loads none of the file's other hooks`;
}

/** How a matcher that is an array is mended. */
export const ONE_STRING = 'write the matcher as one string, its names between "|"';

/** The words Claude Code hands the hook for a line: what follows the harness's command, each `${CLAUDE_PROJECT_DIR}` filled with `project`. */
function handedWords(words: readonly string[], project: string): string[] {
  return words.map((word) => word.split(PROJECT_DIR).join(project));
}

/** The words handed over for every line of the harness's in the settings files, for a caller that has to ask something of each before it reports them. */
export function handedLines(sources: readonly ClaudeSettings[], project: string): string[][] {
  return sources.flatMap(({ settings }) => writtenHooks(settings).map((hook) => handedWords(hook.words, project)));
}

/**
 * The lines of Claude Code's hook in the settings files, each with what the
 * hook does with it and which writes Claude Code starts it for. `read` is
 * the hook's own reading of the words it is handed (usage.ts), `null` for a
 * line that is not its; the words are handed to it as Claude Code hands them
 * to the hook, each `${CLAUDE_PROJECT_DIR}` filled with `project`.
 *
 * A line that guards and holds no more than a release wrote is reported
 * with nothing to say, as it always was. One with more on it is said as it
 * is, and fails nothing. One the hook cannot read, or whose root is no
 * directory, or is in no work tree that holds the project, is a guard that
 * is off, and one that names a brief which is not
 * one holds every write: each a problem, and doctor exits 1 for it. A line
 * Claude Code waits on before no write is not the guard, whatever the hook
 * would do with it.
 *
 * `pattern` reads a matcher that is a pattern, once for every entry under
 * it in every file: the run's own reader, where something else in the run
 * reads the same files ({@link patternReader}). `matching` is how the
 * Claude Code here reads a matcher of names, where its release was asked
 * ({@link matchingUnder}); a caller that asks none reads one as every
 * release from {@link HYPHEN_SINCE} on does.
 *
 * A file that holds an array for a matcher under `PreToolUse` or
 * `PermissionRequest` has none of its hooks loaded ({@link arrayMatcher}):
 * each line of the hook there is started for no write, and one that stood
 * to be started for a write is a guard that is off.
 *
 * `scripts` is where a caller that says whether the script a line runs is
 * there looks for it; with none it is not asked. A line whose script is
 * not there is a hook Claude Code cannot start, which it lets each write
 * go ahead without, or holds every write for where the entry sets
 * `onFailure` to `"block"` and the release here reads it.
 */
export function reportHooks(
  sources: readonly ClaudeSettings[],
  project: string,
  read: (words: readonly string[]) => HookLine | null,
  pattern: PatternReader = patternReader(),
  matching: Matching = TODAY,
  onFailureHere = false,
  scripts: ScriptPlaces | null = null,
): HookReport[] {
  const reading: Reading = { pattern, matching };
  return sources.flatMap(({ file, settings }) => {
    const entries = harnessEntries(settings);
    const array = arrayMatcher(settings);
    return writtenHooks(settings).flatMap((hook): HookReport[] => {
      const handed = read(handedWords(hook.words, project));
      if (handed === null) return [];
      const both = GUARDED_EVENTS.every((event) => hook.events.includes(event));
      // An empty word is shown as a shell spells one, where joined it would not show at all.
      // A line that is not under both events is under one.
      const where = `"${hook.words.map((word) => (word === '' ? "''" : word)).join(' ')}" in ${file}${both ? '' : ` (under ${hook.events[0]} alone)`}`;
      const mine = entries.filter((entry) => sameLine(entry, hook));
      const before = toolsUnder(BEFORE, mine, reading);
      const after = toolsUnder(AFTER, mine, reading);
      if (array !== null) {
        // Nothing of the file is loaded, whatever the line holds and
        // whatever the hook would do with it. A line that stood to be
        // started for a write, or stands under an array itself, where
        // someone meant a matcher, is a guard set up that checks nothing;
        // one that stood to be started for none leaves no write unchecked
        // that it was ever asked about.
        const unloaded = { file, events: hook.events, line: hook.words, onFailure: hook.blocks ? 'block' : null, before: [], after: [], cover: null, note: null, timeout: null } satisfies Partial<HookReport>;
        const said = `${where}: ${describeArrayMatcher(file, array)}`;
        if (isStarted(before) || isStarted(after) || mine.some((entry) => Array.isArray(entry.matcher))) {
          return [{ ...unloaded, state: 'off', detail: `${said}, so the guard is off and no write is checked; ${ONE_STRING}` }];
        }
        return [{ ...unloaded, state: 'unstarted', detail: `${said}: the line is not started, and stood to be started for no write as it is, so no guard is switched off` }];
      }
      const written = { file, events: hook.events, line: hook.words, onFailure: hook.blocks ? 'block' : null, before, after, cover: describeCover(where, before, after, mine, reading), timeout: describeTimeout(where, mine) } satisfies Partial<HookReport>;
      const note = describeOnFailure(where, hook.blocks);
      // Where the release here reads the field, a line that guards without it is advised it.
      const own = file === PROJECT_SETTINGS && mine.every((entry) => isGuard(entry.hook));
      // A line that runs the earlier scope's script is mended by init where
      // it is init's own, as a release before 0.22.0 wrote it in the file
      // init writes, and by hand anywhere else.
      const rewrites = file === PROJECT_SETTINGS && mine.every((entry) => isEarlierGuard(entry.hook));
      const earlier = namesEarlierScript(hook.launcher.word) ? moveTo(rewrites) : null;
      // Where doctor found that script, the line guards by the release of
      // the earlier package until it is uninstalled: said, failing nothing.
      // init asks of no script, and says it of a line it leaves, which is a
      // person's, and of none it rewrites.
      const moved = earlier === null || (scripts === null && rewrites) ? null : `${where} runs ${hook.launcher.word}, the script of @descent-vtt/spec-harness, the name of this package's releases up to 0.21.0: it guards while that package is installed, and once it is uninstalled the hook cannot start and Claude Code lets each write go ahead without it; ${earlier}`;
      const guards = (detail: string | null): HookReport => ({
        ...written,
        state: 'guards',
        detail: detail === null ? moved : moved === null ? detail : `${detail}; ${moved}`,
        note: note ?? (onFailureHere ? adviseOnFailure(where, own) : null),
      });
      if (hook.untyped !== null) {
        const detail = `${where} stands on an entry with ${hook.untyped}, where Claude Code's hooks reference has "type": "command" on an entry it runs as a command, so whether Claude Code runs it cannot be told here: give the entry "type": "command"`;
        return [{ ...written, state: 'unknown', detail, note }];
      }
      if (hook.shell) {
        const detail = `${where} is a shell's to read before the hook is handed it, so what the hook does with it cannot be told here: written with "args", each word reaches the hook as it stands`;
        return [{ ...written, state: 'unknown', detail, note }];
      }
      // What the hook would do with a line it is never asked on before a write is not what guards.
      const unstarted: HookReport = { ...written, state: 'unstarted', detail: null, note };
      const waited = before === null || before.length > 0;
      // Whatever the hook would do with the words, it never reads them where
      // its script is not there. By the hooks reference
      // (https://code.claude.com/docs/en/hooks, Block the action when a hook
      // fails, read 2026-10-24) a command hook that cannot start, as where
      // its script does not exist, has failed, and the action goes ahead
      // unless the entry sets onFailure to "block", which holds it.
      const absent = scripts === null ? null : absentScript(hook.launcher, scripts);
      if (absent !== null) {
        if (!waited && !isStarted(after)) return [unstarted];
        const mend = earlier ?? 'install spec-harness in the project, npm install --save-dev @spec-family/spec-harness, or name its script where it is';
        if (hook.blocks && onFailureHere && waited) {
          return [{ ...written, state: 'held', detail: `${where}: ${absent}, so the hook cannot start, and Claude Code holds every write it is started for before, since the entry sets onFailure to "block"; ${mend}`, note }];
        }
        return [{ ...written, state: 'off', detail: `${where}: ${absent}, so the hook cannot start, the guard is off and Claude Code lets each write it is started for go ahead without it; ${mend}`, note }];
      }
      if (handed.state === 'off') {
        const detail = `${where}: ${handed.fault.wrong}, so the guard is off and ${handed.unchecked ?? 'no write is checked'}; ${handed.fault.mend}`;
        // A fault the hook says, it says after every write it is started for
        // as well, so it is said wherever the line stands. A root outside
        // any work tree, or in one that does not hold the project, it says
        // nothing of, and where the line is waited on before no write there
        // is none it leaves unchecked.
        return [handed.silent !== true || waited ? { ...written, state: 'off', detail, note } : unstarted];
      }
      if (!waited) return [unstarted];
      if (handed.state === 'held') {
        const detail = `${where}: ${handed.wrong}, so the hook holds every write until the line is mended: name a brief spec-brief lists, or take --brief off the line`;
        return [{ ...written, state: 'held', detail, note }];
      }
      if (before === null) return [{ ...written, state: 'unknown', detail: null, note }];
      // What a release wrote: its hook, and nothing after it.
      if (sameStrings(hook.words, ['hook', 'claude'])) return [guards(null)];
      const root = handed.root === undefined ? '' : `, and its root, ${handed.root}, is a directory`;
      // Whose briefs a write is checked by, where they are not the project's own.
      const holder = handed.holder === undefined ? '' : ` in ${namedTree(handed.holder)}, which holds this project: the hook checks a write here by that work tree's briefs and its branch, as a file under ${handed.holder.path}/ there`;
      return [guards(`${where} is more than init writes, and guards: the hook reads the line${root}${holder}`)];
    });
  });
}

/** Whether a project's `.mcp.json` registers a server under the harness's name, however it runs it. */
export function registersServer(mcp: unknown): boolean {
  const servers = field(mcp, 'mcpServers');
  return isObject(servers) && 'spec-harness' in servers;
}

/** A Claude Code settings file, named as a person finds it, and what reading it gave: an object, or nothing usable. */
export interface ClaudeSettings {
  readonly file: string;
  readonly settings: unknown;
}

/** The plugin's id in `enabledPlugins`, and the settings file that turns it on. */
export interface EnabledPlugin {
  readonly id: string;
  readonly file: string;
}

/** `enabledPlugins` keys a plugin `<name>@<marketplace>`; this repository's marketplace lists the plugin as `spec-harness`. */
const PLUGIN_ID = /^spec-harness@[^@]+$/;

/**
 * Whether Claude Code runs this package's plugin, from its settings files
 * given lowest precedence first: user, project, local. Claude Code merges
 * `enabledPlugins` key by key, so for each id the last file that sets it to
 * `true` or `false` decides. A plugin named `spec-harness` counts from any
 * marketplace, since another can list this repository. `null` when no file
 * turns it on.
 */
export function enabledPlugin(sources: readonly ClaudeSettings[]): EnabledPlugin | null {
  const decided = new Map<string, EnabledPlugin | null>();
  for (const { file, settings } of sources) {
    const plugins = field(settings, 'enabledPlugins');
    if (!isObject(plugins)) continue;
    for (const [id, on] of Object.entries(plugins)) {
      if (PLUGIN_ID.test(id) && typeof on === 'boolean') decided.set(id, on ? { id, file } : null);
    }
  }
  return [...decided.values()].find((entry) => entry !== null) ?? null;
}

/**
 * The settings file whose `disableAllHooks` turns Claude Code's hooks off,
 * or `null` where none does.
 *
 * By its settings reference
 * (https://code.claude.com/docs/en/settings-reference, disableAllHooks, read
 * 2026-10-12) the key is a Boolean any settings file may hold, and `true`
 * turns hooks off. Set outside managed settings, it turns off the hooks of
 * the user's, the project's and the local settings and of plugins, and the
 * hooks of managed settings, of the Agent SDK and of a plugin that managed
 * settings force on keep running. By its hooks reference (Disable or remove
 * hooks) the value that counts is the one left after settings precedence:
 * of the files given, lowest precedence first, the last that sets a Boolean
 * decides. A value that is no Boolean is passed over, as the key left out.
 */
export function hooksDisabled(sources: readonly ClaudeSettings[]): string | null {
  let file: string | null = null;
  for (const source of sources) {
    const value = field(source.settings, 'disableAllHooks');
    if (typeof value === 'boolean') file = value ? source.file : null;
  }
  return file;
}

/** The project's settings file for Claude Code, as it is named among the sources. */
export const PROJECT_SETTINGS = '.claude/settings.json';

/** Where Claude Code records the marketplaces it has fetched, in a directory it keeps plugins in. */
export const MARKETPLACE_REGISTRY = 'known_marketplaces.json';

/** Where it records the marketplaces hosted on claude.ai, in a shape its reference does not give. */
export const HOSTED_REGISTRY = 'known_marketplaces_claudeai.json';

/**
 * The origins in a plugin's id that are no marketplace, by Claude Code's
 * plugin loading reference (https://code.claude.com/docs/en/plugins/loading,
 * Find where a plugin came from, read 2026-10-12): a plugin started from a
 * directory or an archive, one saved under a skills directory, and one
 * synced from a claude.ai account. None has a marketplace, and the first
 * and the last no record on disk that the reference describes.
 */
const OTHER_ORIGINS: readonly string[] = ['inline', 'skills-dir', 'synced'];

/** A name a directory can be looked up by: no separator, and no way out of the directory it is looked up in. */
const DIRECTORY_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * The marketplace a plugin's id names, where it names one whose directory
 * can be looked up: `null` for an origin that is no marketplace, and for
 * text that names no directory.
 */
export function pluginMarketplace(id: string): string | null {
  const origin = id.slice(id.indexOf('@') + 1);
  return OTHER_ORIGINS.includes(origin) || !DIRECTORY_NAME.test(origin) ? null : origin;
}

/** What one of the directories Claude Code keeps plugins in holds of a plugin and its marketplace. */
export interface PluginsRoot {
  readonly directory: string;
  /** Whether its cache holds a version of the plugin that no `.orphaned_at` marks as left behind. */
  readonly cached: boolean;
  /** Its `known_marketplaces.json` as read: `null` where there is none. */
  readonly registry: Json | null | 'unreadable';
  /** Whether a record of marketplaces hosted on claude.ai stands beside it. */
  readonly hosted: boolean;
}

/**
 * Whether this machine has what Claude Code loads a plugin from. `detail`
 * is why, where the plugin is not simply there.
 */
export type PluginPresence = { readonly state: 'present'; readonly detail: null } | { readonly state: 'absent' | 'unknown'; readonly detail: string };

function turnsOn(settings: unknown, id: string): boolean {
  const plugins = field(settings, 'enabledPlugins');
  return isObject(plugins) && plugins[id] === true;
}

function holds(record: unknown, name: string): boolean {
  return isObject(record) && Object.hasOwn(record, name);
}

/**
 * Whether the plugin that settings turn on is on this machine, by Claude
 * Code's plugin loading reference
 * (https://code.claude.com/docs/en/plugins/loading, read 2026-10-12), from
 * the settings files and from what the directories it keeps plugins in
 * hold: its plugins root, and each seed directory.
 *
 * `present`: a version of it is in a cache, where the reference has one
 * directory for each installed version of a marketplace plugin (Find
 * plugins on disk).
 *
 * `absent` is said only where the reference leaves the plugin no way to
 * load (Enabled in project settings but not installed): its only `true` is
 * in the project's `.claude/settings.json`, for which Claude Code fetches
 * no plugin a machine lacks, and neither of the page's two exceptions is
 * met, a marketplace that lists it by a relative path, since no marketplace
 * of that name is recorded as fetched or declared in settings, and a seed
 * directory that holds it.
 *
 * Everything else is `unknown`: an origin that is no marketplace, a record
 * that is not there or cannot be read, a marketplace that is there or is
 * declared, whose own list is not read here, and a `true` in a settings
 * file of the person's own, for which Claude Code fetches.
 */
export function pluginPresence(plugin: EnabledPlugin, sources: readonly ClaudeSettings[], roots: readonly PluginsRoot[]): PluginPresence {
  const untold = (detail: string): PluginPresence => ({ state: 'unknown', detail });
  const marketplace = pluginMarketplace(plugin.id);
  if (marketplace === null) return untold(`${plugin.id} names no marketplace whose plugins are kept in a cache: a plugin from --plugin-dir, a skills directory or a claude.ai account comes another way`);
  if (roots.length === 0) return untold('where Claude Code keeps its plugins is not known here: none of CLAUDE_CODE_PLUGIN_CACHE_DIR, CLAUDE_CONFIG_DIR and a home directory is set');
  if (roots.some((root) => root.cached)) return { state: 'present', detail: null };
  const unread = roots.find((root) => !isObject(root.registry));
  if (unread !== undefined) {
    const wrong = unread.registry === null ? 'is not there' : 'cannot be read as JSON';
    return untold(`${join(unread.directory, MARKETPLACE_REGISTRY)}, where Claude Code records the marketplaces it has fetched, ${wrong}`);
  }
  const fetched = roots.find((root) => holds(root.registry, marketplace));
  if (fetched !== undefined) {
    return untold(
      `its marketplace, ${marketplace}, is on this machine (${join(fetched.directory, MARKETPLACE_REGISTRY)}) and no version of the plugin is in the cache: Claude Code loads a plugin that its marketplace lists by a relative path from the marketplace itself, and the marketplace's list is not read here`,
    );
  }
  const declaring = sources.find(({ settings }) => holds(field(settings, 'extraKnownMarketplaces'), marketplace));
  if (declaring !== undefined) return untold(`${declaring.file} declares its marketplace, ${marketplace}, under extraKnownMarketplaces, which Claude Code fetches after a session has started: nothing of it is on this machine now`);
  const hosted = roots.find((root) => root.hosted);
  if (hosted !== undefined) return untold(`${join(hosted.directory, HOSTED_REGISTRY)} records the marketplaces hosted on claude.ai, in a shape Claude Code's reference does not give, so whether ${marketplace} is one cannot be read`);
  const own = sources.filter(({ file, settings }) => file !== PROJECT_SETTINGS && turnsOn(settings, plugin.id)).map(({ file }) => file);
  if (own.length > 0) return untold(`${named(own)} ${own.length === 1 ? 'turns' : 'turn'} it on, and Claude Code fetches a plugin that settings of the person's own turn on: neither a version of it nor its marketplace, ${marketplace}, is on this machine now`);
  return {
    state: 'absent',
    detail: `${PROJECT_SETTINGS} alone turns it on, and Claude Code fetches no plugin that a project's settings alone turn on, unless its marketplace lists it by a relative path or a seed directory holds it: no marketplace ${marketplace} is recorded as fetched or declared in settings, and no version of the plugin is in a cache (${roots.map((root) => join(root.directory, 'cache')).join(', ')})`,
  };
}

/** Where the plugin is on, as a person would look it up. */
function isOn(plugin: EnabledPlugin): string {
  return `the spec-harness plugin is on (${plugin.id} in ${plugin.file})`;
}

/** How to have init's entries in place of the plugin's, for this project alone. */
function turnOff(plugin: EnabledPlugin): string {
  return `turn the plugin off for this project with claude plugin disable ${plugin.id} --scope local`;
}

const PARTS = literal({
  hooks: { brings: 'the guard hooks', twice: 'every write is guarded twice', skipped: 'init writes none', entry: "spec-harness's hooks", them: 'them', none: 'no hook' },
  server: { brings: 'the server', twice: 'the server is registered twice', skipped: 'init registers none', entry: 'the spec-harness server', them: 'it', none: 'no server' },
});

/** How to have a plugin that is not on this machine brought to it, in the commands Claude Code's plugin pages give. */
function bring(plugin: EnabledPlugin): string {
  return `install it here, with claude plugin install ${plugin.id} once its marketplace is added`;
}

/** That the plugin settings turn on is not on this machine, and why. */
function isAbsent(plugin: EnabledPlugin, detail: string, brought: string): string {
  return `${isOn(plugin)} and is not on this machine, so it brings ${brought} here: ${detail}`;
}

/**
 * What init says of a Claude Code file where the plugin that settings turn
 * on is not on this machine. It writes nothing on that reading alone: a
 * plugin that is there after all would bring the same `part` a second time.
 * A file that holds init's entry already is `present`.
 */
export function describeAbsent(plugin: EnabledPlugin, detail: string, part: 'hooks' | 'server', present: boolean): string {
  const words = PARTS[part];
  const absent = isAbsent(plugin, detail, words.none);
  if (present) return `${absent}. This file holds ${words.entry}; with the plugin installed as well, ${words.twice}: ${turnOff(plugin)}`;
  return `${absent}. On that reading alone ${words.skipped}, since with a plugin that is there after all ${words.twice}: ${bring(plugin)}, or to have ${words.them} here instead, ${turnOff(plugin)} and run init again`;
}

/**
 * What init says of a Claude Code file it leaves alone because the plugin is
 * on and brings the same `part`. A file that holds init's entry already is a
 * double install for the person to settle: init removes nothing, since the
 * file is the repository's and a clone without the plugin relies on it. So
 * is an entry `elsewhere`, in a settings file of the person's own, which
 * init does not write and doctor fails all the same.
 */
export function describeSkipped(plugin: EnabledPlugin, part: 'hooks' | 'server', present: boolean, elsewhere: readonly string[] = []): string {
  const words = PARTS[part];
  if (present) return `${isOn(plugin)} and brings ${words.brings} this file holds as well, so ${words.twice}: take ${words.entry} out of this file, or ${turnOff(plugin)}`;
  if (elsewhere.length > 0) {
    return `${isOn(plugin)} and brings ${words.brings} ${named(elsewhere)} ${elsewhere.length === 1 ? 'holds' : 'hold'} as well, so ${words.twice}: take ${words.entry} out there, or ${turnOff(plugin)}. init writes none here`;
  }
  return `${isOn(plugin)} and brings ${words.brings}, so ${words.skipped}: with both, ${words.twice}. To have ${words.them} here instead, for every clone of the repository, ${turnOff(plugin)} and run init again`;
}

/** How Claude Code is wired to the harness: the plugin, init's entries, both or neither. */
export interface ClaudeCodeWiring {
  readonly plugin: EnabledPlugin | null;
  /** Whether this machine has what Claude Code loads that plugin from; `null` where no settings file turns one on. */
  readonly presence: PluginPresence | null;
  /** The settings file whose `disableAllHooks` turns the hooks off, or `null`. */
  readonly hooksOff: string | null;
  /** The settings files that hold the guard hooks: a line of the hook that Claude Code starts for a write, before it or after. */
  readonly hooks: readonly string[];
  /** Each line of the hook in the settings files, with what the hook does with it and the writes it is started for. */
  readonly lines: readonly HookReport[];
  /** Whether `.mcp.json` registers the server. */
  readonly server: boolean;
  /** Whether a settings file has Claude Code start the hook as a session starts (startsSessions). */
  readonly sessionStart: boolean;
  /** Whether a settings file has Claude Code start the hook as a turn ends (reportsTurns): the plugin brings no such entry. */
  readonly turnEnd: boolean;
  /**
   * The release of the Claude Code on `PATH`, where it was asked: a matcher
   * that lists names with a comma is read as that release reads it
   * ({@link matchingUnder}). `null` where it was not asked.
   */
  readonly release: ClaudeCodeCheck | null;
  /**
   * An array for a matcher that keeps Claude Code from loading the hooks of
   * the project's settings file, the file init writes its hooks into, or
   * `null`: init writes none there while it stands ({@link arrayMatcher}).
   */
  readonly unloaded: ArrayMatcher | null;
}

export type WiringState = 'plugin' | 'init' | 'both' | 'none';

/** The wiring as its descriptions read it: what a caller knows of the plugin's presence, and of an array in the project's settings, which one that does not ask leaves out. */
type Wired = Pick<ClaudeCodeWiring, 'plugin' | 'hooks' | 'server'> & { readonly presence?: PluginPresence | null; readonly unloaded?: ArrayMatcher | null };

/**
 * How init comes to write the guard hooks. Where an array unloads the
 * project's settings file, init writes none there and says the array, so
 * the advice is the array's, and init after it: advice that led to more
 * advice is the advice at the end.
 */
function runInit(wiring: Wired): string {
  const unloaded = wiring.unloaded ?? null;
  if (unloaded === null) return 'run spec-harness init --write';
  return `${describeArrayMatcher(PROJECT_SETTINGS, unloaded)}, those init writes among them: ${ONE_STRING}, then run spec-harness init --write`;
}

/** Why the plugin settings turn on is not on this machine, or `null` where it is, may be, or none is on. */
function absence(wiring: Wired): string | null {
  return wiring.presence?.state === 'absent' ? wiring.presence.detail : null;
}

/**
 * Which of the four the wiring is. `both` is a double install, and doctor
 * fails it; either of init's entries counts. A plugin that is not on this
 * machine brings nothing to it, and is not counted.
 */
export function wiringState(wiring: Wired): WiringState {
  const init = wiring.hooks.length > 0 || wiring.server;
  if (wiring.plugin === null || absence(wiring) !== null) return init ? 'init' : 'none';
  return init ? 'both' : 'plugin';
}

/**
 * Whether hooks that would guard are switched off: `disableAllHooks` in a
 * settings file, where a settings file holds the guard hooks or a plugin
 * that may be on this machine brings them. A guard someone set up, which
 * checks no write.
 */
export function guardSwitchedOff(wiring: Wired & Pick<ClaudeCodeWiring, 'hooksOff'>): boolean {
  return wiring.hooksOff !== null && guardWired(wiring);
}

/** Whether something brings the guard hooks: a settings file that holds them, or a plugin settings turn on that may be on this machine. */
export function guardWired(wiring: Wired): boolean {
  return wiring.hooks.length > 0 || (wiring.plugin !== null && absence(wiring) === null);
}

/**
 * What doctor and init say of `disableAllHooks` in `file`. `guarded` is
 * whether there are guard hooks for it to switch off; without any it is a
 * note on what the key would do to them.
 */
export function describeHooksOff(file: string, guarded: boolean): string {
  const off = `"disableAllHooks" is true in ${file}, so Claude Code runs no hook of the user's, the project's or the local settings, and none of a plugin`;
  if (!guarded) return `note: ${off}: the hooks init writes, and those the plugin brings, would not run while it stands`;
  return `${off}: no write is guarded. Take the key out of ${file}, or set it to false, to have the guard back. Hooks of managed settings, and of a plugin managed settings force on, keep running, and no managed settings are read here`;
}

/**
 * What doctor adds of the plugin settings turn on, where it is not simply on
 * this machine: that it cannot be told, which is never fine, or that it is
 * not, beside entries of init's. `null` where there is no more to say: no
 * plugin, one that is there, and one that is not where nothing else is
 * wired, which the wiring's own sentence says.
 */
export function describePresence(wiring: Wired): string | null {
  const { plugin, presence } = wiring;
  if (plugin === null || presence === undefined || presence === null || presence.state === 'present') return null;
  if (presence.state === 'unknown') return `whether ${plugin.id} is on this machine cannot be told: ${presence.detail}. A plugin that is not there brings no hook: Claude Code's /plugin lists it, and its errors`;
  if (wiring.hooks.length > 0) return `${isAbsent(plugin, presence.detail, 'no hook')}. With the plugin installed as well, ${PARTS.hooks.twice}: ${turnOff(plugin)}`;
  return wiring.server ? unguarded(plugin, presence.detail, wiring) : null;
}

/** That the plugin settings turn on is not on this machine and no hook of init's stands in for it, with the two ways to a guard. */
function unguarded(plugin: EnabledPlugin, detail: string, wiring: Wired): string {
  return `${isAbsent(plugin, detail, 'no hook')}, and Claude Code guards no write. To have the guard, ${bring(plugin)}, or ${turnOff(plugin)} and ${runInit(wiring)}`;
}

/** What `doctor` says of the wiring, and what to do when it is doubled or missing. */
export function describeClaudeCode(wiring: Wired): string {
  const { plugin } = wiring;
  const entries = [...wiring.hooks.map((file) => `the guard hooks in ${file}`), ...(wiring.server ? ['the server in .mcp.json'] : [])].join(', ');
  const own = `init's entries: ${entries}`;
  if (plugin === null) {
    if (entries === '') return `neither the spec-harness plugin nor the hooks init writes, so Claude Code guards no write: ${runInit(wiring)}, or install the plugin`;
    return own;
  }
  const absent = absence(wiring);
  if (absent !== null) return entries === '' ? unguarded(plugin, absent, wiring) : own;
  if (entries === '') return `${isOn(plugin)} and brings the guard hooks and the server`;
  const twice = [...(wiring.hooks.length > 0 ? [PARTS.hooks.twice] : []), ...(wiring.server ? [PARTS.server.twice] : [])].join(' and ');
  return `${isOn(plugin)}, beside ${entries}: ${twice}. Keep one: take spec-harness's entries out of those files, or ${turnOff(plugin)}`;
}

/** The spec-brief plugin this package ships, as spec-brief's `plugins` names it. */
export const PLUGIN = '@spec-family/spec-harness/spec-brief-plugin';

/**
 * The plugin by the name init wrote from 0.1.2 to 0.21.0, the earlier
 * scope's. spec-brief loads it from that package while it is installed, and
 * once it is not, its lint and its archive stop at exit 2: the plugin
 * could not be loaded. Read so that init names the plugin by its name now
 * in its place, and never loaded.
 */
const EARLIER_PLUGIN = '@descent-vtt/spec-harness/spec-brief-plugin';

/** Whether an entry of spec-brief's `plugins` names the plugin by its earlier name, alone or as `{ module, options }`. */
function namesEarlierPlugin(entry: unknown): boolean {
  return entry === EARLIER_PLUGIN || (isObject(entry) && entry['module'] === EARLIER_PLUGIN);
}

export { SPEC_BRIEF_CONFIGS } from './config.js';

/** The conditions an import meets in Node, its `defaultConditions`, and `default`, which every one meets. */
const IMPORT_CONDITIONS: readonly string[] = ['node', 'import', 'default'];

/** A target Node refuses as invalid, which an array passes over and anything else stops at. */
const INVALID = Symbol('invalid target');

function resolveTarget(target: unknown): string | null | undefined | typeof INVALID {
  if (typeof target === 'string') return target.startsWith('./') ? target : INVALID;
  if (Array.isArray(target)) {
    for (const item of target) {
      const resolved = resolveTarget(item);
      if (resolved !== undefined && resolved !== INVALID) return resolved;
    }
    return null;
  }
  if (typeof target !== 'object' || target === null) return target === null ? null : INVALID;
  for (const [condition, value] of Object.entries(target)) {
    if (!IMPORT_CONDITIONS.includes(condition)) continue;
    const resolved = resolveTarget(value);
    if (resolved !== undefined) return resolved;
  }
  return undefined;
}

/**
 * The file a package's `exports` target names for an import, as Node's
 * PACKAGE_TARGET_RESOLVE finds it, or `null` when it names none: a string
 * that starts with `./`; in an object, the target of the first key, in the
 * object's own order, that an import meets - `node`, `import` or
 * `default` - and that resolves to anything, a `null` included; in an
 * array, the first item that resolves, one Node refuses passed over. A
 * `null` target is not exported, and ends the search there, where a
 * condition an import does not meet lets it go on.
 */
export function exportedFile(target: unknown): string | null {
  const resolved = resolveTarget(target);
  return typeof resolved === 'string' ? resolved : null;
}

/**
 * Whether spec-brief's configuration loads the plugin, by name or as
 * `{ module, options }`. spec-brief also loads a plugin by a path, one that
 * starts with `.` or is absolute, read from the root; such a path is the
 * plugin when `isPluginFile` says it names the plugin's file, which only the
 * disk can tell. Without one, no path is: the default's `false` and an
 * `undefined` read the same in `some`, so that mutant is equivalent.
 */
export function loadsPlugin(config: Json, isPluginFile: (path: string) => boolean = () => false): boolean {
  const plugins = config['plugins'];
  const names = (specifier: unknown): boolean =>
    specifier === PLUGIN || (typeof specifier === 'string' && (specifier.startsWith('.') || isAbsolute(specifier)) && isPluginFile(specifier));
  return Array.isArray(plugins) && plugins.some((entry) => names(entry) || (isObject(entry) && names(entry['module'])));
}

/** Whether spec-brief's configuration names the base its archive measures a round from. */
export function measuresArchive(config: Json): boolean {
  const archiving = config['archiving'];
  return isObject(archiving) && typeof archiving['base'] === 'string';
}

/**
 * spec-brief's configuration with the plugin loaded and the archive measured
 * from `base`, or `null` when both already hold. spec-brief's archive
 * refuses a round that changed a protected file, and learns that a signed
 * ruling allows it only by asking the plugin (ADR-0006). It checks the file at
 * all only when it knows the base: without one it warns that the scope went
 * unmeasured and passes, so the gate is open until a base is named. A base a
 * person wrote is kept.
 *
 * An entry that names the plugin by the name an earlier release wrote names
 * it by its name now, where it stands and with its options; beside an entry
 * that names it so already it is taken out, since spec-brief refuses two
 * plugins of one name.
 */
export function mergeSpecBrief(current: Json, base: string | null = null, isPluginFile?: (path: string) => boolean): Json | null {
  const named = loadsPlugin(current, isPluginFile);
  const listed: unknown[] = Array.isArray(current['plugins']) ? current['plugins'] : [];
  const moved = listed.some(namesEarlierPlugin);
  const renamed = listed.flatMap((entry) => (!namesEarlierPlugin(entry) ? [entry] : named ? [] : [isObject(entry) ? { ...entry, module: PLUGIN } : PLUGIN]));
  const plugin = named || moved;
  const measure = base !== null && !measuresArchive(current);
  if (plugin && !measure && !moved) return null;
  const archiving: Json = isObject(current['archiving']) ? current['archiving'] : {};
  return {
    ...current,
    plugins: plugin ? renamed : [...renamed, PLUGIN],
    ...(measure ? { archiving: { ...archiving, base } } : {}),
  };
}

/** What init says where it names the plugin in place of its earlier name. */
export const PLUGIN_MOVED = `name spec-harness's plugin "${PLUGIN}" where an earlier release wrote "${EARLIER_PLUGIN}", which spec-brief cannot load once @descent-vtt/spec-harness is uninstalled`;

/** Whether spec-brief's configuration names the plugin by the name an earlier release wrote, the earlier scope's. */
export function loadsEarlierPlugin(config: Json): boolean {
  const plugins = config['plugins'];
  return Array.isArray(plugins) && plugins.some(namesEarlierPlugin);
}

/** Whether spec-brief loads the plugin, as its configuration at the root says. */
export type PluginState =
  /** `earlier`: it names the plugin by the name an earlier release wrote, and no entry names it by its name now. */
  | { readonly kind: 'loaded' | 'earlier' | 'not-loaded' | 'unreadable'; readonly file: string }
  | { readonly kind: 'unconfigured' };

/** What a person reads about the plugin, and what to do when it is not loaded. */
export function describePlugin(state: PluginState): string {
  switch (state.kind) {
    case 'loaded':
      return `spec-brief loads spec-harness's plugin (${state.file}): its archive accepts a protected file a signed ruling allows`;
    case 'earlier':
      return `${state.file} names spec-harness's plugin "${EARLIER_PLUGIN}", by the name of this package's releases up to 0.21.0: spec-brief loads it from @descent-vtt/spec-harness while that is installed, and once it is not, its lint and its archive stop at exit 2, the plugin not loaded. spec-harness init --write names "${PLUGIN}" in its place`;
    case 'not-loaded':
      return `spec-brief does not load spec-harness's plugin, so its archive refuses a protected file whatever ruling is signed: add "${PLUGIN}" to "plugins" in ${state.file}, or run spec-harness init --write`;
    case 'unreadable':
      return `${state.file} cannot be read as JSON, so whether spec-brief loads spec-harness's plugin is unknown`;
    case 'unconfigured':
      return "spec-brief has no configuration at the root, so it loads no plugin: spec-harness init --write writes one that loads spec-harness's";
  }
}

/** What git says that tells a base apart. */
export interface BaseFacts {
  /** The remote's default branch as a local ref, such as `origin/main`, or `null`. */
  readonly remoteDefault: string | null;
  /** The name of the branch checked out, or `null` on a detached head. */
  readonly branch: string | null;
  /** Every local branch, by its name and the ref a base names it by. */
  readonly branches: readonly LocalBranch[];
}

/** The base `init` names, and why; `base` is `null` when none can be told. */
export interface BaseChoice {
  readonly base: string | null;
  readonly detail: string;
}

/**
 * The base `init` writes into `.spec-harness.json`. Every ruling is verified
 * against the allowed signers on it, so it is named rather than left to be
 * found. The remote's default branch comes first, but git records it when
 * it clones, and before 2.48 not on a fetch: a repository made with `git
 * init` and pushed to a remote often has none. There the branch init runs on
 * is the base when it is `main` or `master`, or the only branch; otherwise
 * the person names it.
 */
export function chooseBase(facts: BaseFacts): BaseChoice {
  const { remoteDefault, branch } = facts;
  if (remoteDefault !== null) return { base: remoteDefault, detail: `rounds are measured from ${remoteDefault}, the remote's default branch` };
  const unrecorded = 'no remote records a default branch (refs/remotes/origin/HEAD)';
  if (branch !== null) {
    const conventional = branch === 'main' || branch === 'master';
    if (conventional || facts.branches.every((local) => local.name === branch)) {
      const which = conventional ? 'the branch init runs on' : 'the only branch';
      // The base is a ref git and spec-brief read, so it is the name git
      // reads as the branch and nothing else: `heads/main` beside a tag
      // `main`. A branch with no commit yet is listed by no ref.
      const base = facts.branches.find((local) => local.name === branch)?.ref ?? branch;
      return { base, detail: `rounds are measured from ${base}, ${which}: ${unrecorded}; change "base" if rounds merge into another` };
    }
  }
  const where = branch === null ? 'HEAD is detached' : `${branch} is not main, master or the only branch`;
  return {
    base: null,
    detail: `no base can be told: ${unrecorded}, and ${where}; set "base" to the branch rounds merge into, or run git remote set-head origin --auto and init again`,
  };
}

/** Where a base came from: `--base`, the configuration, or the remote. */
export type BaseSource = 'flag' | 'config' | 'remote';

const SOURCES: Readonly<Record<BaseSource, string>> = { flag: '--base', config: '.spec-harness.json', remote: "the remote's default branch" };

/** The base a command resolved, and how; or why there is none. */
export function describeBase(base: { readonly ref: string; readonly source: BaseSource; readonly mergeBase: string } | { readonly reason: string }): string {
  if ('reason' in base) return `none: ${base.reason}`;
  return `${base.ref} (${SOURCES[base.source]}), merge base ${base.mergeBase.slice(0, 12)}`;
}

/** Whether the allowed-signers file is on the base, where every ruling's signature is checked against it. */
export function describeSigners(file: string, base: string | null, onBase: boolean): string {
  if (base === null) return `${file}, read from the base, which could not be resolved: no ruling can count`;
  if (onBase) return `${file} is on ${base}`;
  return `${file} is not on ${base}, so no ruling can count: commit it there, one line per person: <email> namespaces="git" <public key>`;
}

/**
 * The note doctor gives on the signers whose key is not FIDO2, or `null`
 * when every one's is. A note, never a failure: ADR-0006 accepts a key the
 * agent's account cannot read too, and a PIV or PKCS#11 hardware key is
 * written as a plain key.
 */
export function describeSignerKeys(signers: readonly Pick<AllowedSigner, 'line' | 'principals' | 'keyType'>[]): string | null {
  if (signers.length === 0) return null;
  const named = signers.map((signer) => `${signer.principals.join(',')} (${signer.keyType}, line ${signer.line})`).join(', ');
  return (
    `note: signers whose key is not a FIDO2 key: ${named}. ` +
    "Where an agent runs as the person, ADR-0006 recommends a FIDO2 key, ssh-keygen -t ed25519-sk, whose signature needs a touch no process can supply, or a key the agent's account cannot read; " +
    'a PIV or PKCS#11 hardware key reads as a plain ssh-rsa or ecdsa line, so this is a note, not a failure'
  );
}

/** The note doctor gives on a line of the allowed-signers file that is not a signer. */
export function describeSignerProblem(problem: { readonly line: number; readonly message: string }): string {
  return `note: line ${problem.line} is not a signer: ${problem.message}`;
}

/** What doctor says of the Claude Code on `PATH`, which runs the guard's hooks only from the minimum on. */
export function describeClaudeRelease(check: ClaudeCodeCheck): string {
  // A version read from a package.json says so: nothing ran to tell it.
  const release = (found: { readonly version: string; readonly file?: string }): string =>
    `Claude Code ${found.version}${found.file === undefined ? '' : ` (as ${found.file} declares)`}`;
  switch (check.state) {
    case 'ok':
      return `${release(check)} runs the hooks, which need ${CLAUDE_CODE_MINIMUM} or later`;
    case 'outdated':
      return `${release(check)} is older than ${CLAUDE_CODE_MINIMUM}, which the hooks need: it ignores a hook's args and runs a bare node, which fails, and a PreToolUse hook that fails blocks nothing, so every write passes unguarded: update Claude Code, with claude update`;
    case 'unknown':
      return `whether Claude Code is ${CLAUDE_CODE_MINIMUM} or later, which the hooks need, cannot be told: ${check.reason}; an older release lets every write pass unguarded, so check claude --version where Claude Code runs`;
  }
}

/** Where git's pre-commit hook stands: git's path for it, shown from the root, and what is there. */
export type GitHookState =
  | { readonly state: 'runs' | 'absent' | 'other' | 'inert'; readonly file: string }
  /**
   * What stands at the path is no file, `what` it is instead. `stops`: git
   * can execute it, tries to run it as the hook, fails, and stops every
   * commit. `ignored`: git cannot execute it, and skips it as it skips a
   * hook that is not executable.
   */
  | { readonly state: 'stops' | 'ignored'; readonly file: string; readonly what: string }
  /**
   * A file the account may not read, `reason` being why, and `runs` whether
   * git may execute it. One git may not execute it skips, with a hint, and
   * commits. One it may it runs, and a script the shell cannot read either
   * stops every commit there (measured with git 2.47 as an ordinary account),
   * where a program runs without being read: which it is cannot be read.
   */
  | { readonly state: 'unreadable'; readonly file: string; readonly runs: boolean; readonly reason: string }
  | { readonly state: 'unknown'; readonly reason: string };

/**
 * The advice for a missing hook, which init gives beside the file and doctor
 * with it. The hook is the guard for a write the agent's hooks never see,
 * one made through a shell (ADR-0005).
 */
export function missingGitHook(file: string | null): string {
  const where = file === null ? '' : ` (${file})`;
  return `no pre-commit hook runs spec-harness${where}: one refuses a commit that changes what the active brief protects, for any agent or none, a shell's writes included; run spec-harness init --git-hook --write to add it`;
}

/**
 * How to keep the files the rules live in from changing unread, on each
 * forge, as spec-core's ADR-0005 asks: the forge protects them, and CI checks
 * a change against the base branch's rules. GitLab Free has no Code Owners
 * approval, so there the person who merges is the reviewer.
 */
export const PROTECT_RULE_FILES =
  "Have the forge protect this file, the ADRs, the tool configurations and the CI configuration, so no change to them reaches the base branch without a person, and check each change in CI against the base branch's rules: " +
  'on GitHub, CODEOWNERS and a protected branch; on GitLab Premium, Code Owners; on GitLab Free, a protected branch no one pushes to, merged by Maintainers, agents as Developers, and pipelines that must succeed. ' +
  "spec-core's docs/adopting.md has the settings";

/**
 * The line to add to a hook the repository has of its own: node and the
 * script in the project's install, as Claude Code's hooks are run. git starts
 * a pre-commit hook at the top of the work tree it commits in, a linked
 * worktree's own, wherever the hook is kept, so the path is read from there.
 */
export const GIT_HOOK_LINE = `node ${BIN} hook git`;

/**
 * The hook init writes. It is a POSIX sh script on every platform, since Git
 * for Windows runs a hook with the sh it ships. git starts it at the top of
 * the work tree it commits in, so the project's install is read from there,
 * and where a linked worktree has none, from the repository's main work
 * tree: the work tree whose `.git` the common directory is, where `git
 * worktree add` was run and the project installed (ADR-0005). Where neither
 * has the install - a worktree of a repository nobody installed into, a
 * repository that shares its hooks with one that uses the harness - node
 * would end on a stack trace, so the hook says what is missing and where,
 * and the commit waits, as it did when npx found nothing to run.
 *
 * Where the work tree's `package.json` does not name the package, installing
 * the dependencies there brings no script: the commit checked out is one from
 * before the project took the harness up, or the package is not installed
 * through that file. The hook says so in place of advising the install. The
 * commit waits all the same: a file that names no package does not tell an
 * old commit from a project that installs the harness from a workspace of its
 * own, and a guard that let one through for the other would answer for
 * nothing.
 */
export const PRE_COMMIT = `#!/bin/sh
# spec-harness: refuse a commit that changes what the active brief protects.
# git runs this at the top of the work tree it commits in, a linked worktree's
# own, wherever the hook is kept: the project's install is read from there,
# or, where a linked worktree has none, from the repository's main work tree.
bin=${BIN}
if [ ! -f "$bin" ]; then
  common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
  if [ "\${common##*/}" = .git ] && [ -f "\${common%/.git}/$bin" ]; then
    bin=\${common%/.git}/$bin
  elif grep -q '"${PACKAGE}"' package.json 2>/dev/null; then
    printf '%s\\n' "spec-harness: $bin is not in $PWD, the work tree git commits in, nor in its repository's main work tree: install the project's dependencies there, as with npm ci, and commit again" >&2
    exit 2
  else
    printf '%s\\n' "spec-harness: $bin is not in $PWD, the work tree git commits in, nor in its repository's main work tree, and package.json there names no ${PACKAGE}: a commit from before the project took it up has no hook to run, and installing its dependencies brings none, so the commit waits" >&2
    exit 2
  fi
fi
exec node "$bin" hook git
`;

/** The hook 0.19.0 to 0.22.0 wrote, run with the script at `bin`: 0.22.0's with this scope's, and the earlier releases' with the earlier scope's. */
function waitingPreCommit(bin: string): string {
  return `#!/bin/sh
# spec-harness: refuse a commit that changes what the active brief protects.
# git runs this at the top of the work tree it commits in, a linked worktree's
# own, wherever the hook is kept: the project's install is read from there,
# or, where a linked worktree has none, from the repository's main work tree.
bin=${bin}
if [ ! -f "$bin" ]; then
  common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
  if [ "\${common##*/}" = .git ] && [ -f "\${common%/.git}/$bin" ]; then
    bin=\${common%/.git}/$bin
  else
    printf '%s\\n' "spec-harness: $bin is not in $PWD, the work tree git commits in, nor in its repository's main work tree: install the project's dependencies there, as with npm ci, and commit again" >&2
    exit 2
  fi
fi
exec node "$bin" hook git
`;
}

/** The hook 0.22.0 wrote, which advises the install at a commit from before the project took the harness up too. */
const RELEASED_PRE_COMMIT = waitingPreCommit(BIN);

/**
 * The hooks earlier releases wrote, each written over by `init --git-hook
 * --write`. 0.22.0's runs this scope's script, and only its words differ.
 * 0.10.0 to 0.21.0 ran the earlier scope's: 0.19.0 to 0.21.0 the hook 0.22.0
 * wrote, and 0.10.0 to 0.18.0 one that looks in no main work tree, as its tag
 * has it. Once that package is uninstalled either stops every commit, as
 * where the install is not there. A hook with anything else in it is the
 * repository's own.
 */
const EARLIER_PRE_COMMITS: readonly string[] = [
  RELEASED_PRE_COMMIT,
  waitingPreCommit(EARLIER_BIN),
  `#!/bin/sh
# spec-harness: refuse a commit that changes what the active brief protects.
# git runs this at the top of the work tree it commits in, a linked worktree's
# own, wherever the hook is kept: the project's install is read from there.
bin=${EARLIER_BIN}
if [ ! -f "$bin" ]; then
  printf '%s\\n' "spec-harness: $bin is not in $PWD, the work tree git commits in: install the project's dependencies there, as with npm ci, and commit again" >&2
  exit 2
fi
exec node "$bin" hook git
`,
];

/** Whether a pre-commit hook is one an earlier release of init wrote, which init writes again where asked to. */
export function isEarlierPreCommit(text: string): boolean {
  return EARLIER_PRE_COMMITS.includes(text);
}

/** What init says where it writes its hook over one an earlier release wrote that runs the earlier scope's script. */
export const HOOK_MOVED = `the hook an earlier release of init wrote, which runs ${EARLIER_BIN}, written again to run ${BIN}`;

/** What init says where it writes its hook over the one 0.22.0 wrote. */
export const HOOK_RENEWED = `the hook init wrote in 0.22.0, written again to say, where the script is not installed, whether package.json names ${PACKAGE}`;

/** What init says where it writes its hook over one an earlier release wrote, or null where the text is no such hook. */
export function earlierPreCommit(text: string): string | null {
  if (text === RELEASED_PRE_COMMIT) return HOOK_RENEWED;
  return isEarlierPreCommit(text) ? HOOK_MOVED : null;
}

/**
 * What doctor and init add of a hook whose text runs the harness through
 * npx: the hook init wrote through 0.9.1, or the line it advised for a hook
 * of the repository's own. A note, never a failure: the hook guards as it
 * did. npx starts npm to start node, and npm 12 says on stderr what it runs,
 * twice a commit. A comment that names the command runs nothing, and neither
 * does another runner's line, which is the repository's to choose.
 *
 * And of a hook whose text names the earlier scope's script, the hook init
 * wrote from 0.10.0 to 0.21.0 or the line it advised: it runs while that
 * package is installed, and the script is not there once it is not. A note
 * too: the hook runs as it did, and what it does once the package is gone
 * is the hook's own text to say.
 *
 * And of the hook 0.22.0 wrote, which guards as init's does and advises the
 * install at a commit from before the project took the harness up too, where
 * the install brings none: a note, so that the hook is written again.
 */
export function gitHookNote(text: string): string | null {
  const lines = text.split('\n');
  const npx = lines.some((line) => /^[^#]*\bnpx\b.*\bspec-harness\s+hook\s+git\b/.test(line));
  // What stands before a `#` is what the shell runs, as for npx above.
  const earlier = lines.some((line) => line.split('#')[0]!.includes(EARLIER_BIN));
  const said: string[] = [];
  if (npx) said.push(`it runs spec-harness through npx, which starts npm to start node on every commit, and under npm 12 prints two "npm notice run" lines each time: to run it with node from the project's install, as Claude Code's hooks are, replace the npx command there with "${GIT_HOOK_LINE}"`);
  if (earlier) {
    const mend = isEarlierPreCommit(text) ? `it is the hook an earlier release of init wrote, and spec-harness init --git-hook --write writes it again to run ${BIN}` : `name ${BIN} there in its place`;
    said.push(`it runs ${EARLIER_BIN}, the script of @descent-vtt/spec-harness, the name of this package's releases up to 0.21.0, which is not there once that package is uninstalled: ${mend}`);
  }
  if (text === RELEASED_PRE_COMMIT) {
    said.push(`it is the hook init wrote in 0.22.0, which advises installing the dependencies where the script is not there, at a commit from before the project took up ${PACKAGE} too, where they bring none: spec-harness init --git-hook --write writes it again`);
  }
  return said.length === 0 ? null : said.join('; ');
}

/** What doctor says of git's pre-commit hook. */
export function describeGitHook(hook: GitHookState): string {
  switch (hook.state) {
    case 'runs':
      return `${hook.file} runs spec-harness`;
    case 'inert':
      return `${hook.file} runs spec-harness, but is not executable, so git skips it: chmod +x ${hook.file}`;
    case 'other':
      return `${hook.file} does not run spec-harness: add the line "${GIT_HOOK_LINE}" to it`;
    case 'stops':
      return `${hook.file} is ${hook.what}, not a hook, and git stops every commit at it, since it cannot run it ("cannot spawn" on Windows, "cannot exec" elsewhere): nothing is checked there, and nothing is committed. Take it away, then run spec-harness init --git-hook --write`;
    case 'ignored':
      return `${hook.file} is ${hook.what}, not a hook, and is not executable, so git skips it and runs no hook: take it away, then run spec-harness init --git-hook --write`;
    case 'unreadable':
      if (!hook.runs) return `${hook.file} cannot be read (${hook.reason}), and is not executable, so git skips it and runs no hook: make it readable and executable, or take it away and run spec-harness init --git-hook --write`;
      return `${hook.file} cannot be read (${hook.reason}), so whether it runs spec-harness cannot be told: git runs it at a commit, and a script there that cannot be read stops every commit, where a program runs; make it readable`;
    case 'absent':
      return missingGitHook(hook.file);
    case 'unknown':
      return `where git runs its hooks cannot be told: ${hook.reason}`;
  }
}

/** spec-graph's configuration files, in the order spec-graph reads them; then a "spec-graph" key in package.json. */
export const SPEC_GRAPH_CONFIGS: readonly string[] = ['.spec-graph.json', 'spec-graph.config.json'];

/**
 * spec-graph's own patterns when its configuration names none, its
 * DEFAULT_PATTERNS as of 0.9.0. They decide only what init says, never what
 * it writes: `patterns` in the configuration replaces them, so writing the
 * briefs into it would freeze spec-graph's defaults into the file.
 */
const SPEC_GRAPH_DEFAULTS: readonly string[] = ['docs/**/*.md', 'doc/**/*.md', 'adr/**/*.md', 'rfcs/**/*.md', 'specs/**/*.md', '*.md'];

/** Whether spec-graph, configured as `config` says, reads the briefs in the directory `briefs`. */
export function graphReadsBriefs(config: Json, briefs: string): boolean {
  const configured = Array.isArray(config['patterns']) ? config['patterns'].filter((pattern): pattern is string => typeof pattern === 'string') : [];
  const list = parseGlobList(configured.length > 0 ? configured : SPEC_GRAPH_DEFAULTS, { dialect: 'path', caseSensitive: true, backslash: 'separator' });
  return list.ok && list.list.match(`${briefs}/001_brief.md`);
}

/**
 * What the history entry does. spec-graph reads a brief whose status says
 * `archived` as a record already; the entry makes one a record whatever word
 * its status uses, or none - and it does anything only where spec-graph
 * reads the briefs, which its defaults do not in `briefs/`.
 */
export function describeGraph(archiveGlob: string, briefs: string, reads: boolean, added: boolean): string {
  const history = added ? `read ${archiveGlob} as history` : `${archiveGlob} is history`;
  if (reads) return `${history}: an archived brief is a record whatever its status says, so a live brief that depends on one is not a stale premise`;
  return `${history}, for when spec-graph reads the briefs; its patterns do not reach ${briefs}/, so it checks none of them now: add "${briefs}/**/*.md" to its "patterns" if it should`;
}

/** spec-graph's configuration with the archive read as history, or `null` when it already is. */
export function mergeSpecGraph(current: Json, archiveGlob: string): Json | null {
  const patterns = current['historyPatterns'];
  const history = Array.isArray(patterns) ? patterns.filter((p): p is string => typeof p === 'string') : [];
  if (history.includes(archiveGlob)) return null;
  return { ...current, historyPatterns: [...history, archiveGlob] };
}
