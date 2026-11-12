/**
 * `spec-harness init`: the family configured to agree, from the first day.
 *
 * The integration faults found when the tools were first run together were all
 * configuration: spec-graph read an archived brief as a retired decision and
 * reported every brief that depended on one; spec-guard executed an archived
 * brief's assertions. Each tool can be told the truth; `init` tells each of
 * them the same truth, derived from spec-brief's own settings.
 *
 * It prints a plan and changes nothing until `--write`. It merges into files
 * that exist and never replaces what a person wrote; a git hook the
 * repository already has is left alone, with the line to add printed instead.
 */

import { accessSync, constants, existsSync, statSync, type Stats } from 'node:fs';
import { chmod, mkdir, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';

import { CONFIG_FILE } from './config.js';
import {
  arrayMatcher,
  BIN,
  chooseBase,
  describeAbsent,
  describeArrayMatcher,
  describeGitHook,
  describeGraph,
  describeHooksOff,
  describePresence,
  describeSkipped,
  earlierPreCommit,
  GIT_HOOK_LINE,
  gitHookNote,
  GUARD_MOVED,
  holdsEarlierGuard,
  holdsEarlierServer,
  type GitHookState,
  graphReadsBriefs,
  GUARD_HOOK,
  guardSwitchedOff,
  isStarted,
  loadsEarlierPlugin,
  namesEarlierSchema,
  loadsPlugin,
  matchingUnder,
  measuresArchive,
  mergeClaudeSettings,
  withOnFailure,
  withSessionStart,
  withTurnReport,
  reportsTurns,
  TURN_HOOK,
  mergeMcp,
  mergeCodexHooks,
  CODEX_GROUP,
  COPILOT_HOOKS,
  COPILOT_HOOKS_FILE,
  mergeSpecBrief,
  mergeSpecGraph,
  missingGitHook,
  ON_FAILURE_SINCE,
  ONE_STRING,
  patternReader,
  PLUGIN,
  PLUGIN_MOVED,
  PRE_COMMIT,
  PROJECT_SETTINGS,
  PROTECT_RULE_FILES,
  registersServer,
  SCHEMA_MOVED,
  SERVER_MOVED,
  SPEC_BRIEF_CONFIGS,
  SPEC_GRAPH_CONFIGS,
} from './configure.js';
import { isDirectory, isFile, mainWorkTree, readJsonObject as readJson, writeAtomic } from './fs.js';
import { hookPath, localBranches, remoteDefault } from './git.js';
import { claudeCodeWiring, pluginFile } from './round.js';
import { runSibling } from './siblings.js';
import { answerOf, EXIT_ERROR, EXIT_OK, json, openWorkspace, type CliIO, type Options, type Workspace } from './workspace.js';

/** `skip`: a file init would write, left alone because Claude Code's plugin brings what init would add. */
export type Action = 'create' | 'update' | 'keep' | 'skip' | 'run' | 'advise';

export interface Step {
  readonly file: string;
  readonly action: Action;
  readonly detail: string;
  apply?: () => Promise<void>;
}

type Json = Record<string, unknown>;

/** The project's settings file for Claude Code, as a person finds it and as doctor names it. */
const SETTINGS = PROJECT_SETTINGS;

function stringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** What init says where the project has not installed the package every way in runs. */
export const NOT_INSTALLED = `the hooks, the server and git's hook, init's and the plugin's alike, run ${BIN}, which is not installed here: install the package, npm install --save-dev @spec-family/spec-harness, since until it is, Claude Code cannot start the hooks or the server and lets each write go ahead, and git's hook stops every commit`;

const PLUGIN_DETAIL = `load spec-harness's plugin, "${PLUGIN}": spec-brief's archive asks it whether a signed ruling allows a protected file, and refuses the file without it`;

/** What init adds to spec-brief's configuration, said once for the plan: the plugin added, named in place of its earlier name, or neither; the schema named where it is now; and the base. */
function specBriefDetail(plugin: 'add' | 'rename' | null, schema: boolean, base: string | null): string {
  const parts = plugin === 'add' ? [PLUGIN_DETAIL] : plugin === 'rename' ? [PLUGIN_MOVED] : [];
  if (schema) parts.push(SCHEMA_MOVED);
  if (base !== null) parts.push(`measure the archive from ${base}, as spec-harness does: without a base, spec-brief's archive warns that the scope went unmeasured and checks no protected file`);
  return parts.join('; ');
}

/** A path as a person finds it: from the root when it is inside it, POSIX-separated, and as it is otherwise. */
function shown(root: string, path: string): string {
  const inside = relative(root, path);
  return inside.startsWith('..') || isAbsolute(inside) ? path : inside.split(sep).join('/');
}

/**
 * Whether git takes what stands at a hook's path for a hook to run. git
 * asks the system whether the path can be executed, and skips one that
 * cannot, with no more than a hint: asked here the same way. On Windows the
 * question is only whether the path is there (Node's fs page, File access
 * constants, read 2026-10-14), and git there runs whatever is.
 */
function executable(path: string): boolean {
  let may = true;
  try {
    accessSync(path, constants.X_OK);
  } catch {
    may = false;
  }
  return may;
}

/** What stands at a path, links followed, or `null` where nothing does: a link to nothing is nothing, to git as well. */
function standing(path: string): Stats | null {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}

/**
 * git's pre-commit hook, where git runs it from, and what is there: init and
 * doctor both read it. `path` is `null` when git cannot say where its hooks
 * are, which is said in git's own words: a `core.hooksPath` that names a
 * file is refused by git as no directory, and git then commits with no hook
 * (ADR-0005). `note` is what there is to say of how a hook that runs the
 * harness runs it, or `null`.
 *
 * Only a file is read. A directory under the hook's name, which a
 * repository whose `core.hooksPath` is in its work tree can hold, is not a
 * hook and is one to git all the same: it tries to run what it can execute
 * there, fails, and stops the commit (ADR-0005 has what was measured). Read
 * as a file, it ended this on Node's EISDIR and a stack, and a named pipe
 * would have kept it from ever coming back. A file the account may not read
 * ended it on EACCES and a stack: it is said with what git does with it.
 */
export async function gitHook(root: string): Promise<{ readonly hook: GitHookState; readonly path: string | null; readonly note: string | null; readonly earlier?: string | null }> {
  const where = await hookPath('pre-commit', root);
  if ('refused' in where) return { hook: { state: 'unknown', reason: `git rev-parse --git-path hooks/pre-commit failed: ${where.refused}` }, path: null, note: null };
  const { path } = where;
  const file = shown(root, path);
  const there = standing(path);
  if (there === null) return { hook: { state: 'absent', file }, path, note: null };
  const runs = executable(path);
  if (!there.isFile()) {
    const what = there.isDirectory() ? 'a directory' : 'neither a file nor a directory';
    return { hook: { state: runs ? 'stops' : 'ignored', file, what }, path, note: null };
  }
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    return { hook: { state: 'unreadable', file, runs, reason: (error as Error).message }, path, note: null };
  }
  if (!text.includes('spec-harness')) return { hook: { state: 'other', file }, path, note: null };
  return { hook: { state: runs ? 'runs' : 'inert', file }, path, note: gitHookNote(text), earlier: earlierPreCommit(text) };
}

export async function plan(workspace: Workspace, options: Options, io: CliIO): Promise<Step[]> {
  const { root } = workspace;
  const steps: Step[] = [];

  // The base rounds merge into, decided once: spec-harness verifies rulings
  // against the allowed signers on it, and spec-brief's archive measures the
  // round from it. A base a person wrote, in either file, is kept.
  // openWorkspace loaded this file and refused one that is not a JSON object,
  // so here it is one, or there is none.
  const harnessFile = join(root, CONFIG_FILE);
  const harness = (await readJson(harnessFile)) as Json | null;
  const namedBase = harness !== null && typeof harness['base'] === 'string' ? harness['base'] : null;
  // What the plan asks of git and of Claude Code's settings waits on the
  // root and on nothing of the rest, so it is asked at once: three of git's
  // processes side by side where each waited on the one before. Each is
  // read below where it was asked before, so a plan that fails still fails
  // on the first of them in that order. The matchers in the settings are
  // read with one reader, for the wiring and for what to write. Claude
  // Code's release is asked only where what is read of a line turns on it.
  const pattern = patternReader();
  const [factsAsked, wiringAsked, hookAsked] = await Promise.allSettled([
    namedBase === null ? Promise.all([remoteDefault(root), localBranches(root)]) : null,
    claudeCodeWiring(root, io, pattern, false),
    gitHook(root),
  ]);
  const facts = answerOf(factsAsked);
  const choice = facts === null ? null : chooseBase({ remoteDefault: facts[0], branch: workspace.branch, branches: facts[1] });
  const base = choice === null ? namedBase : choice.base;

  // spec-brief first: every other setting is derived from its directories.
  const briefConfig = SPEC_BRIEF_CONFIGS.find((name) => existsSync(join(root, name)));
  // One name for the sibling found and for the sibling run, which a run that is stopped says.
  const tool = 'spec-brief';
  const brief = workspace.siblings.locate(tool);
  let briefs = 'briefs';
  let archive = 'briefs/archive';
  if (briefConfig === undefined) {
    if (brief.kind === 'found') {
      const command = brief.command;
      const created = join(root, '.spec-brief.json');
      steps.push({
        file: '.spec-brief.json',
        action: 'run',
        detail: 'spec-brief init: the brief and archive directories, every default spelled out',
        apply: async () => {
          const run = await runSibling(tool, command, ['init'], root);
          if (run.code !== 0) throw new Error(`spec-brief init failed: ${run.stderr.trim()}`);
        },
      });
      steps.push({
        file: '.spec-brief.json',
        action: 'update',
        detail: specBriefDetail('add', false, base),
        apply: async () => {
          const written = await readJson(created);
          if (written === null || written === 'unreadable') throw new Error('spec-brief init wrote no configuration JSON can read');
          const merged = mergeSpecBrief(written, base, pluginFile(root));
          if (merged !== null) await writeAtomic(created, stringify(merged));
        },
      });
    } else {
      steps.push({ file: '.spec-brief.json', action: 'advise', detail: brief.reason });
    }
  } else {
    const file = join(root, briefConfig);
    const config = await readJson(file);
    // The file was found a moment ago, so null is one removed in between; and
    // a string has neither key, so these checks are there for the type.
    if (config !== null && config !== 'unreadable') {
      if (typeof config['briefs'] === 'string') briefs = config['briefs'];
      archive = typeof config['archive'] === 'string' ? config['archive'] : `${briefs}/archive`;
    }
    steps.push({ file: briefConfig, action: 'keep', detail: `briefs in ${briefs}/, the archive in ${archive}/` });
    // spec-brief's archive learns that a signed ruling allows a protected file
    // only from this package's plugin (ADR-0006).
    if (config === 'unreadable' || config === null) {
      const measure = base === null ? '' : `, and "archiving": { "base": "${base}" }`;
      steps.push({ file: briefConfig, action: 'advise', detail: `cannot be read as JSON; add "plugins": ["${PLUGIN}"]${measure} by hand` });
    } else {
      const isPluginFile = pluginFile(root);
      const merged = mergeSpecBrief(config, base, isPluginFile);
      const measured = measuresArchive(config);
      if (merged === null) {
        const archiving = config['archiving'];
        const from = measured ? `, and the archive is measured from ${String((archiving as Json)['base'])}` : '';
        steps.push({ file: briefConfig, action: 'keep', detail: `spec-harness's plugin is loaded${from}` });
      } else {
        const plugin = loadsEarlierPlugin(config) ? 'rename' : loadsPlugin(config, isPluginFile) ? null : 'add';
        const detail = specBriefDetail(plugin, namesEarlierSchema(config), measured ? null : base);
        steps.push({ file: briefConfig, action: 'update', detail, apply: () => writeAtomic(file, stringify(merged)) });
      }
    }
  }

  // spec-graph: an archived brief is a record, not a retired decision. Its
  // configuration is the first of its files, then a key in package.json; a
  // file written beside that key would shadow it.
  const graph = workspace.siblings.locate('spec-graph');
  if (graph.kind === 'outdated') steps.push({ file: '.spec-graph.json', action: 'advise', detail: graph.reason });
  if (graph.kind === 'found') {
    const archiveGlob = `${archive}/**`;
    const graphName = SPEC_GRAPH_CONFIGS.find((name) => existsSync(join(root, name)));
    const manifest = graphName === undefined ? await readJson(join(root, 'package.json')) : null;
    if (manifest !== null && manifest !== 'unreadable' && 'spec-graph' in manifest) {
      steps.push({ file: 'package.json', action: 'advise', detail: `spec-graph reads its configuration from the "spec-graph" key here, which init does not edit: add "${archiveGlob}" to its "historyPatterns" by hand` });
    } else {
      const file = graphName ?? '.spec-graph.json';
      const current = await readJson(join(root, file));
      if (current === 'unreadable') {
        steps.push({ file, action: 'advise', detail: `cannot be read as JSON; add "historyPatterns": ["${archiveGlob}"] by hand` });
      } else {
        const merged = mergeSpecGraph(current ?? {}, archiveGlob);
        const detail = describeGraph(archiveGlob, briefs, graphReadsBriefs(current ?? {}, briefs), merged !== null);
        if (merged === null) steps.push({ file, action: 'keep', detail });
        else steps.push({ file, action: current === null ? 'create' : 'update', detail, apply: () => writeAtomic(join(root, file), stringify(merged)) });
      }
    }
  }

  // spec-harness's own file, naming the base the rounds merge into: every
  // ruling is verified against the allowed signers on it. No choice was made
  // only where the file names a base.
  if (choice === null) {
    steps.push({ file: CONFIG_FILE, action: 'keep', detail: `rounds are measured from ${namedBase}` });
  } else if (choice.base === null) {
    steps.push({ file: CONFIG_FILE, action: 'advise', detail: choice.detail });
  } else {
    const content: Json = { ...harness, base: choice.base };
    steps.push({ file: CONFIG_FILE, action: harness === null ? 'create' : 'update', detail: choice.detail, apply: () => writeAtomic(harnessFile, stringify(content)) });
  }

  // The agent's hooks and server, unless the plugin brings them: Claude Code
  // runs a plugin's hook beside the same hook in settings, so both would
  // guard every write twice (ADR-0012). The hook's lines are known as doctor
  // knows them, by the hook's own reading and by the writes Claude Code
  // starts each for, so that the two say the same of every file (ADR-0005).
  const wiring = answerOf(wiringAsked);
  const { plugin } = wiring;
  // A plugin that is not on this machine brings neither. init writes none
  // on that reading alone, which a plugin that is there after all would
  // make a second guard: it says what doctor says, and how to have the
  // entries here instead.
  const absent = wiring.presence?.state === 'absent' ? wiring.presence.detail : null;
  const settingsFile = join(root, '.claude', 'settings.json');
  const settings = await readJson(settingsFile);
  // An array for a matcher, under which Claude Code loads no hook of the file.
  const array = arrayMatcher(settings);
  const lines = wiring.lines.filter((line) => line.file === SETTINGS);
  // What doctor says of a line this file holds is said here too, with why
  // init leaves the line: one a person changed is theirs, and a second line
  // beside one that is started would run for every write as well.
  const said = lines.flatMap((line) => [line.detail, line.cover]).filter((note): note is string => note !== null);
  const left = said.length === 0 ? '' : `${said.join('; ')}; init rewrites no line of the hook it did not write, and writes none beside one Claude Code starts for a write`;
  if (plugin !== null) {
    // Doubled in this file or in one of the person's own, it is the double
    // install doctor fails: said here too, though init writes neither file.
    // This file's own entry is said first, so the others are named only
    // where it holds none.
    const present = wiring.hooks.includes(SETTINGS);
    if (absent !== null) steps.push({ file: SETTINGS, action: 'advise', detail: describeAbsent(plugin, absent, 'hooks', present) });
    else {
      // A plugin that cannot be told to be on this machine is no reason to
      // write either: said beside the reason, as doctor says it.
      const untold = describePresence(wiring);
      const detail = describeSkipped(plugin, 'hooks', present, wiring.hooks);
      steps.push({ file: SETTINGS, action: wiring.hooks.length > 0 ? 'advise' : 'skip', detail: untold === null ? detail : `${detail}. ${untold}` });
    }
    // The plugin's hooks are the same for every project, and run the report
    // for none: one that asks for it adds the entry, which guards nothing
    // twice (ADR-0012). Only init's own line is known here, so a line a
    // person wrote under the event has the entry advised beside it; an
    // `undefined` reads as the `false` does, and that mutant is equivalent.
    if (workspace.config.turnReport && !reportsTurns(settings, () => false)) {
      steps.push({ file: SETTINGS, action: 'advise', detail: `"turnReport" is on, and the plugin brings no hook for the end of a turn: add ${JSON.stringify({ hooks: [TURN_HOOK] })} under "Stop"` });
    }
  } else if (settings === 'unreadable') {
    steps.push({ file: SETTINGS, action: 'advise', detail: `cannot be read as JSON; add the guard as a PreToolUse and a PostToolUse hook by hand: ${JSON.stringify(GUARD_HOOK)}` });
  } else if (array !== null) {
    // A hook written into such a file would be one more that is not loaded:
    // the matcher is the person's to mend, and init is run again after.
    steps.push({ file: SETTINGS, action: 'advise', detail: `${describeArrayMatcher(SETTINGS, array)}, those init writes among them, so it writes none: ${ONE_STRING}, and run init again` });
  } else {
    // An entry is a line of the hook where doctor reports its words as one in this file.
    const reported = new Set(lines.map((line) => JSON.stringify(line.line)));
    const isHook = (words: readonly string[]): boolean => reported.has(JSON.stringify(words));
    const guarded = mergeClaudeSettings(settings ?? {}, isHook, pattern, matchingUnder(wiring.release));
    // The check as a session starts, beside init's two where they stand as
    // init writes them and doctor has nothing more to say of a line: with
    // them, or by itself in a file whose two an earlier release wrote. A file
    // with a line of the person's is theirs to complete (ADR-0012).
    const started = left === '' ? withSessionStart(guarded ?? settings ?? {}, isHook) : null;
    // The report at the end of a turn, where the configuration asks for one,
    // beside the entries as init writes them (ADR-0005, ADR-0012).
    const turned = left === '' && workspace.config.turnReport ? withTurnReport(started ?? guarded ?? settings ?? {}, isHook) : null;
    const merged = turned ?? started ?? guarded;
    // A line that turns the guard off or holds every write is one doctor
    // fails, and lines of which none is waited on before a write are no
    // guard between them: left as they are, they are for the person to mend.
    const broken = lines.some((line) => line.state === 'off' || line.state === 'held') || !lines.some((line) => isStarted(line.before));
    const atStart = 'a SessionStart hook says, as a session starts, what would hold every write of it';
    const atEnd = 'a Stop hook, in the background, tells Claude as each turn begins what the work tree held at the end of the last that the brief protects or that is outside its scope';
    const beside = [started === null ? null : atStart, turned === null ? null : atEnd].filter((part): part is string => part !== null);
    // Asked for, onFailure "block" on init's own entries before and after a
    // write and as a session starts, those it writes now and those a run
    // before wrote, where it writes or keeps them: no page says what a
    // Claude Code before 2.1.295 does with the key, so it is written only
    // where asked for. The entry at the end of a turn runs in the
    // background, where the hooks reference gives the field no effect, and
    // is left without it (ADR-0012).
    const blocked = options.blockOnFailure && (merged !== null || !broken) ? withOnFailure(merged ?? settings ?? {}) : null;
    const written = blocked ?? merged;
    const holds = `onFailure "block" on init's PreToolUse, PostToolUse and SessionStart entries, so that Claude Code ${ON_FAILURE_SINCE} or later holds a write where the hook cannot start or runs past its timeout`;
    if (written === null) steps.push({ file: SETTINGS, action: broken ? 'advise' : 'keep', detail: left === '' ? 'the guard hooks are installed' : left });
    else {
      // What onFailure adds is said after what else is written, and alone where nothing else is.
      const what =
        merged === null
          ? holds
          : guarded === null
            ? `beside the guard hooks, ${beside.join('; ')}`
            : `${holdsEarlierGuard(settings) ? `${GUARD_MOVED}; ` : ''}the guard hooks, run with node from the project's install: a PreToolUse hook refuses writes to protected files; a PostToolUse hook warns about writes outside the scope${beside.map((part) => `; ${part}`).join('')}${left === '' ? '' : `; ${left}`}`;
      steps.push({
        file: SETTINGS,
        action: settings === null ? 'create' : 'update',
        detail: blocked === null || merged === null ? what : `${what}; ${holds}`,
        apply: () => writeAtomic(settingsFile, stringify(written)),
      });
    }
  }
  // disableAllHooks turns off whatever hooks there are, and those init
  // writes with them: said of the file that holds the key, which is the
  // person's to change. init writes what it would have written.
  if (wiring.hooksOff !== null) steps.push({ file: wiring.hooksOff, action: 'advise', detail: describeHooksOff(wiring.hooksOff, guardSwitchedOff(wiring)) });
  const mcpFile = join(root, '.mcp.json');
  const mcp = await readJson(mcpFile);
  if (plugin !== null) {
    const present = registersServer(mcp);
    if (absent !== null) steps.push({ file: '.mcp.json', action: 'advise', detail: describeAbsent(plugin, absent, 'server', present) });
    else steps.push({ file: '.mcp.json', action: present ? 'advise' : 'skip', detail: describeSkipped(plugin, 'server', present) });
  } else if (mcp === 'unreadable') {
    steps.push({ file: '.mcp.json', action: 'advise', detail: 'cannot be read as JSON; add the spec-harness server by hand' });
  } else {
    const merged = mergeMcp(mcp ?? {});
    if (merged === null) steps.push({ file: '.mcp.json', action: 'keep', detail: 'the spec-harness server is registered' });
    else
      steps.push({
        file: '.mcp.json',
        action: mcp === null ? 'create' : 'update',
        detail: `${holdsEarlierServer(mcp) ? `${SERVER_MOVED}: ` : ''}the spec-harness MCP server, run with node from the project's install: start_round, check_path, request_escalation, audit_round, list_rounds`,
        apply: () => writeAtomic(mcpFile, stringify(merged)),
      });
  }

  // Codex's and Copilot's hooks, where the repository keeps the directory
  // each reads them from: a `.codex` directory is Codex's configuration,
  // and `.github/hooks` Copilot's (ADR-0012, amended 2026-11-12). Neither is
  // made: a repository whose agents are other ones keeps neither file.
  if (isDirectory(join(root, '.codex'))) {
    const codexFile = join(root, '.codex', 'hooks.json');
    const codex = await readJson(codexFile);
    const merged = codex === 'unreadable' ? 'unread' : mergeCodexHooks(codex ?? {});
    const by = `add ${JSON.stringify(CODEX_GROUP)} under "hooks"."PreToolUse" by hand`;
    if (merged === 'unread') steps.push({ file: '.codex/hooks.json', action: 'advise', detail: `${codex === 'unreadable' ? 'cannot be read as JSON' : 'its "hooks" is not in the shape Codex reads'}; ${by}` });
    else if (merged === null) steps.push({ file: '.codex/hooks.json', action: 'keep', detail: 'Codex runs the guard, hook codex' });
    else {
      steps.push({
        file: '.codex/hooks.json',
        action: codex === null ? 'create' : 'update',
        detail: 'Codex runs the guard before apply_patch, and before a shell command that runs it, hook codex; Codex runs a project\'s hook once it is trusted, in /hooks',
        apply: () => writeAtomic(codexFile, stringify(merged)),
      });
    }
  }
  if (isDirectory(join(root, '.github', 'hooks'))) {
    const copilotFile = join(root, ...COPILOT_HOOKS_FILE.split('/'));
    const copilot = await readJson(copilotFile);
    if (copilot === null) {
      steps.push({
        file: COPILOT_HOOKS_FILE,
        action: 'create',
        detail: 'Copilot runs the guard before it creates or edits a file, hook copilot; its cloud agent reads the file from the default branch',
        apply: () => writeAtomic(copilotFile, stringify(COPILOT_HOOKS)),
      });
    } else if (JSON.stringify(copilot) === JSON.stringify(COPILOT_HOOKS)) {
      steps.push({ file: COPILOT_HOOKS_FILE, action: 'keep', detail: 'Copilot runs the guard, hook copilot' });
    } else {
      steps.push({ file: COPILOT_HOOKS_FILE, action: 'advise', detail: `holds what init did not write; make it ${JSON.stringify(COPILOT_HOOKS)}, or keep the guard's entry in a file of its own there` });
    }
  }

  // git's hook, where git runs it from: core.hooksPath as git reads it, and
  // a linked worktree's shared hooks. It is the guard for a write the agent's
  // hooks never see, one through a shell, so it is advised when not asked
  // for; it is configuration outside the tree, so it is written only then.
  const { hook, path: hookFile, note: hookNote, earlier } = answerOf(hookAsked);
  // git cannot name its hook where core.hooksPath names a file, and says so,
  // which is said here as doctor says it; git then commits with no hook.
  if (hook.state === 'unknown') {
    steps.push({ file: 'pre-commit', action: 'advise', detail: describeGitHook(hook) });
  } else if (hook.state === 'runs' && options.gitHook && typeof earlier === 'string') {
    // The hook an earlier release of init wrote, which runs the earlier
    // scope's script and stops every commit once that package is gone, or
    // 0.22.0's, which advises an install that brings no hook at a commit from
    // before the project took the harness up, is init's own, and is written
    // again where asked for, as one is created.
    const target = hookFile!;
    steps.push({
      file: hook.file,
      action: 'update',
      detail: earlier,
      apply: async () => {
        await writeAtomic(target, PRE_COMMIT);
        await chmod(target, 0o755);
      },
    });
  } else if (hook.state === 'runs') {
    // A hook that runs it through npx is kept, as any hook that exists is,
    // with the line that runs it as init writes the hook now.
    steps.push({ file: hook.file, action: 'keep', detail: hookNote === null ? 'already runs spec-harness' : `already runs spec-harness; ${hookNote}` });
  } else if (hook.state === 'inert' || hook.state === 'stops' || hook.state === 'ignored' || hook.state === 'unreadable') {
    // What is there is the person's to mend or to take away: nothing is
    // written over it, and what doctor says of it is said.
    steps.push({ file: hook.file, action: 'advise', detail: describeGitHook(hook) });
  } else if (hook.state === 'other') {
    steps.push({ file: hook.file, action: 'advise', detail: `a pre-commit hook exists; add the line "${GIT_HOOK_LINE}" to it` });
  } else if (options.gitHook) {
    // A path is named for every state but the one asked about first.
    const target = hookFile!;
    steps.push({
      file: hook.file,
      action: 'create',
      detail: 'refuse a commit that changes what the active brief protects',
      apply: async () => {
        await mkdir(dirname(target), { recursive: true });
        await writeAtomic(target, PRE_COMMIT);
        await chmod(target, 0o755);
      },
    });
  } else {
    steps.push({ file: hook.file, action: 'advise', detail: missingGitHook(null) });
  }

  // Every way in runs the package's script from the project, init's lines,
  // git's hook and the plugin alike, and starts nothing where it is not
  // installed: Claude Code lets each write go ahead, and git's hook stops
  // every commit (ADR-0012). Said where the script is in neither place a
  // line can name: this work tree, and a linked worktree's main one.
  const main = mainWorkTree(workspace.commonDir);
  const places = main === null ? [root] : [root, main];
  if (!places.some((place) => isFile(join(place, BIN)))) {
    steps.push({ file: 'package.json', action: 'advise', detail: NOT_INSTALLED });
  }

  // The file the configuration names, which a ruling's signature is checked
  // against on the base branch (ADR-0006).
  steps.push({
    file: workspace.config.rulings.allowedSigners,
    action: 'advise',
    detail: `rulings count only when signed by a key listed here on the base branch: one line per person, <email> namespaces="git" <public key>. Where an agent runs as the person, make it a FIDO2 key, ssh-keygen -t ed25519-sk, whose signature needs a touch no process can supply. ${PROTECT_RULE_FILES}`,
  });
  return steps;
}

export async function initCommand(options: Options, io: CliIO): Promise<number> {
  const workspace = await openWorkspace(options, io);
  const steps = await plan(workspace, options, io);
  if (options.write) {
    for (const step of steps) {
      if (step.apply !== undefined) {
        try {
          await step.apply();
        } catch (error) {
          io.stderr.write(`spec-harness: ${step.file}: ${(error as Error).message}\n`);
          return EXIT_ERROR;
        }
      }
    }
  }
  if (options.format === 'json') {
    io.stdout.write(json('init', { written: options.write, steps: steps.map(({ file, action, detail }) => ({ file, action, detail })) }));
  } else {
    for (const step of steps) io.stdout.write(`${step.action.padEnd(6)}  ${step.file}\n        ${step.detail}\n`);
    if (!options.write && steps.some((step) => step.apply !== undefined)) io.stdout.write('\nNothing was changed. Run again with --write to apply the plan.\n');
  }
  return EXIT_OK;
}
