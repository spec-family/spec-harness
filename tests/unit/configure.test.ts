import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';

import {
  arrayMatcher,
  chooseBase,
  COMMA_SINCE,
  describeArrayMatcher,
  describeBase,
  describeAbsent,
  describeClaudeCode,
  describeClaudeRelease,
  describeGitHook,
  describeHooksOff,
  describeInstalls,
  describePresence,
  GIT_HOOK_LINE,
  gitHookNote,
  describePlugin,
  describePluginAhead,
  describePluginScripts,
  describeSignerKeys,
  describeSignerProblem,
  describeGraph,
  describeSigners,
  describeSkipped,
  earlierPreCommit,
  enabledPlugin,
  exportedFile,
  graphReadsBriefs,
  GUARD_HOOK,
  GUARD_MOVED,
  guardSwitchedOff,
  guardWired,
  handedLines,
  hooksDisabled,
  HYPHEN_SINCE,
  holdsEarlierGuard,
  holdsEarlierServer,
  HOOK_MOVED,
  HOOK_RENEWED,
  isEarlierPreCommit,
  isStarted,
  loadsEarlierPlugin,
  loadsPlugin,
  matchingUnder,
  mcpServer,
  mergeClaudeSettings,
  NO_SESSION_START,
  onCiRunner,
  ON_FAILURE_SINCE,
  readsOnFailure,
  startsSessions,
  withOnFailure,
  withSessionStart,
  withTurnReport,
  reportsTurns,
  TURN_HOOK,
  mergeMcp,
  measuresArchive,
  mergeSpecBrief,
  mergeSpecGraph,
  missingGitHook,
  ONE_STRING,
  patternReader,
  PLUGIN,
  PLUGIN_MOVED,
  PLUGIN_SCRIPT,
  pluginMarketplace,
  pluginPresence,
  PRE_COMMIT,
  PROTECT_RULE_FILES,
  PROJECT_DIR,
  PROJECT_DIR_OR_HERE,
  projectScripts,
  registersServer,
  reportHooks,
  SERVER_MOVED,
  SPEC_BRIEF_CONFIGS,
  SPEC_GRAPH_CONFIGS,
  wiringState,
  writtenHooks,
  type Matching,
  type PatternReader,
  type ScriptPlaces,
} from '../../src/configure.js';
import { claudeHookLine, elsewhereHookLine, heldHookLine, holderHookLine, outsideHookLine, type HookLine } from '../../src/usage.js';
import { parseOptions } from '../../src/workspace.js';
import { releasedHook } from './helpers.js';

const SCRIPT = '${CLAUDE_PROJECT_DIR}/node_modules/@spec-family/spec-harness/bin/spec-harness.js';

describe('the file an exports target names for an import, as Node resolves it', () => {
  it('is a string that starts with ./, and nothing else', () => {
    expect(exportedFile('./dist/plugin.js')).toBe('./dist/plugin.js');
    for (const target of ['dist/plugin.js', '../plugin.js', '/plugin.js', 7, true, undefined]) expect(exportedFile(target), String(target)).toBeNull();
  });

  it('is the target of the first key an import meets, node, import or default, in the object\'s own order', () => {
    expect(exportedFile({ types: './a.d.ts', require: './a.cjs', import: './a.mjs', default: './a.js' })).toBe('./a.mjs');
    expect(exportedFile({ default: './a.js', import: './a.mjs' })).toBe('./a.js');
    expect(exportedFile({ node: './n.js', import: './a.mjs' })).toBe('./n.js');
    expect(exportedFile({ require: './a.cjs', browser: './b.js' })).toBeNull();
    // A key whose own conditions an import does not meet lets the search go on.
    expect(exportedFile({ node: { require: './a.cjs' }, default: './a.js' })).toBe('./a.js');
    expect(exportedFile({ node: { import: './n.mjs' }, default: './a.js' })).toBe('./n.mjs');
  });

  it('stops at a null target, which is not exported, as Node stops', () => {
    expect(exportedFile({ import: null, default: './a.js' })).toBeNull();
    expect(exportedFile({ node: { import: null }, default: './a.js' })).toBeNull();
    expect(exportedFile(null)).toBeNull();
  });

  it('is the first item of an array that resolves, one Node refuses passed over', () => {
    expect(exportedFile(['a.js', './b.js'])).toBe('./b.js');
    // A number is a target Node refuses too, where null is one it resolves, to nothing.
    expect(exportedFile([7, './b.js'])).toBe('./b.js');
    expect(exportedFile([{ require: './a.cjs' }, './b.js'])).toBe('./b.js');
    expect(exportedFile([{ import: 'a.mjs' }, './b.js'])).toBe('./b.js');
    expect(exportedFile({ import: ['a.mjs', './b.mjs'] })).toBe('./b.mjs');
    expect(exportedFile([null, './b.js'])).toBeNull();
    expect(exportedFile([])).toBeNull();
    // An empty array is not exported either, and ends the search as null does.
    expect(exportedFile({ import: [], default: './a.js' })).toBeNull();
    expect(exportedFile(['a.js'])).toBeNull();
  });

  it('refuses the whole target when a key an import meets names one Node refuses', () => {
    expect(exportedFile({ import: 'a.mjs', default: './a.js' })).toBeNull();
  });
});
const HOOK = { type: 'command', command: 'node', args: [SCRIPT, 'hook', 'claude'], timeout: 60 };
const GUARD = { matcher: 'Edit|Write|MultiEdit|NotebookEdit', hooks: [HOOK] };
const LEGACY = 'npx --no-install spec-harness hook claude';

describe('Claude Code settings', () => {
  it('runs the project\'s install with node, the path one argument, as the guard', () => {
    expect(PROJECT_DIR).toBe('${CLAUDE_PROJECT_DIR}');
    expect(GUARD_HOOK).toEqual(HOOK);
  });

  it('adds the guard to PreToolUse and PostToolUse of empty settings', () => {
    expect(mergeClaudeSettings({})).toEqual({ hooks: { PreToolUse: [GUARD], PostToolUse: [GUARD] } });
  });

  it('keeps every other setting and hook, adding after them', () => {
    const lint = { matcher: 'Write', hooks: [{ type: 'command', command: 'npm run lint' }] };
    const current = { model: 'x', permissions: { allow: ['Bash(ls)'] }, hooks: { PreToolUse: [lint], Stop: [{ hooks: [] }] } };
    expect(mergeClaudeSettings(current)).toEqual({
      model: 'x',
      permissions: { allow: ['Bash(ls)'] },
      hooks: { PreToolUse: [lint, GUARD], PostToolUse: [GUARD], Stop: [{ hooks: [] }] },
    });
    // The settings it was given are not changed under the caller.
    expect(current.hooks.PreToolUse).toEqual([lint]);
  });

  it('adds only the event that lacks the guard, and nothing when both have it', () => {
    const own = { matcher: 'Edit', hooks: [{ type: 'command', command: 'x' }, { ...HOOK, timeout: 5 }] };
    expect(mergeClaudeSettings({ hooks: { PreToolUse: [own] } })).toEqual({ hooks: { PreToolUse: [own], PostToolUse: [GUARD] } });
    expect(mergeClaudeSettings({ hooks: { PreToolUse: [own], PostToolUse: [GUARD] } })).toBeNull();
  });

  it('recognises the guard only by node and its exact arguments', () => {
    const similar = {
      hooks: [
        { type: 'command', command: 'npx spec-harness hook claude' },
        { type: 'command', command: 'nodejs', args: HOOK.args },
        { type: 'command', command: 'node', args: HOOK.args.slice(0, 2) },
        { type: 'command', command: 'node', args: [...HOOK.args, '--brief', '1'] },
        { type: 'command', command: 'node', args: ['bin/spec-harness.js', 'hook', 'claude'] },
        { type: 'command', command: 'node', args: 'a b' },
        'node',
      ],
    };
    expect(mergeClaudeSettings({ hooks: { PreToolUse: [similar], PostToolUse: [similar] } })).toEqual({
      hooks: { PreToolUse: [similar, GUARD], PostToolUse: [similar, GUARD] },
    });
  });

  it('replaces the npx guard 0.1 installed where it stands, keeping its other fields', () => {
    const lint = { type: 'command', command: 'npm run lint' };
    const old = { matcher: 'Edit|Write', hooks: [lint, { type: 'command', command: LEGACY, timeout: 30 }] };
    const merged = mergeClaudeSettings({ hooks: { PreToolUse: [old], PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: LEGACY }] }] } });
    expect(merged).toEqual({
      hooks: {
        PreToolUse: [{ matcher: 'Edit|Write', hooks: [lint, { type: 'command', command: 'node', args: HOOK.args, timeout: 30 }] }],
        PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'node', args: HOOK.args }] }],
      },
    });
    expect(mergeClaudeSettings(merged ?? {})).toBeNull();
    // Only 0.1's own command is replaced; the event that already has the guard keeps it.
    expect(mergeClaudeSettings({ hooks: { PreToolUse: [GUARD], PostToolUse: [{ hooks: [{ command: `${LEGACY} --x` }] }] } })).toEqual({
      hooks: { PreToolUse: [GUARD], PostToolUse: [{ hooks: [{ command: `${LEGACY} --x` }] }, GUARD] },
    });
  });

  it('replaces 0.1\'s guard in the one event that still has it, and changes nothing in the other', () => {
    const pre = [GUARD];
    const merged = mergeClaudeSettings({ hooks: { PreToolUse: pre, PostToolUse: [{ hooks: [{ command: LEGACY }] }] } });
    expect(merged).toEqual({ hooks: { PreToolUse: [GUARD], PostToolUse: [{ hooks: [{ command: 'node', args: HOOK.args }] }] } });
    expect((merged?.['hooks'] as Record<string, unknown>)['PreToolUse']).toBe(pre);
  });

  it('reads hooks of the wrong shape as none there, rather than failing', () => {
    expect(mergeClaudeSettings({ hooks: null })).toEqual({ hooks: { PreToolUse: [GUARD], PostToolUse: [GUARD] } });
    expect(mergeClaudeSettings({ hooks: 'x' })).toEqual({ hooks: { PreToolUse: [GUARD], PostToolUse: [GUARD] } });
    expect(mergeClaudeSettings({ hooks: { PreToolUse: 'x', PostToolUse: [{ matcher: 'Edit' }, { hooks: 'y' }, null] } })).toEqual({
      hooks: { PreToolUse: [GUARD], PostToolUse: [{ matcher: 'Edit' }, { hooks: 'y' }, null, GUARD] },
    });
  });

  it('never hands out its own guard, so a caller that edits the result changes nothing of it', () => {
    const merged = mergeClaudeSettings({}) as { hooks: { PreToolUse: { hooks: { args: string[] }[] }[] } };
    merged.hooks.PreToolUse[0]?.hooks[0]?.args.push('--x');
    expect(mergeClaudeSettings({})).toEqual({ hooks: { PreToolUse: [GUARD], PostToolUse: [GUARD] } });
  });

  /** Whether words are the line of Claude Code's hook, by the hook's own reading, as init asks it. */
  const isHook = (words: readonly string[]): boolean => claudeHookLine(words, parseOptions, '/p', () => true) !== null;

  it("writes no line beside one of the hook's that Claude Code starts for a write, however a person wrote it", () => {
    for (const hook of [
      { type: 'command', command: 'node', args: [...HOOK.args, '--root', PROJECT_DIR] },
      { type: 'command', command: 'node', args: ['node_modules/@spec-family/spec-harness/bin/spec-harness.js', 'hook', 'claude'] },
      { type: 'command', command: `node ${SCRIPT} hook claude --brief 404` },
      // A line the hook cannot read is its line all the same, and the person's to mend.
      { type: 'command', command: 'node', args: [...HOOK.args, '--nope'] },
    ]) {
      const changed = { matcher: 'Edit|Write', hooks: [hook] };
      expect(mergeClaudeSettings({ hooks: { PreToolUse: [changed], PostToolUse: [changed] } }, isHook), JSON.stringify(hook)).toBeNull();
      // Without the hook's reading only init's own line is known, as it was.
      expect(mergeClaudeSettings({ hooks: { PreToolUse: [changed], PostToolUse: [changed] } }), JSON.stringify(hook)).toEqual({ hooks: { PreToolUse: [changed, GUARD], PostToolUse: [changed, GUARD] } });
    }
    // Under one event alone it is still a person's line in the file: init adds none under the other, and leaves 0.1's beside it as it is.
    const before = { hooks: [{ type: 'command', command: 'node', args: [...HOOK.args, '--root', PROJECT_DIR] }] };
    expect(mergeClaudeSettings({ hooks: { PreToolUse: [before] } }, isHook)).toBeNull();
    expect(mergeClaudeSettings({ hooks: { PostToolUse: [before] } }, isHook)).toBeNull();
    expect(mergeClaudeSettings({ hooks: { PreToolUse: [before], PostToolUse: [{ hooks: [{ type: 'command', command: LEGACY }] }] } }, isHook)).toBeNull();
    // init's own line under one event is completed as it was, whatever the hook's reading knows.
    expect(mergeClaudeSettings({ hooks: { PostToolUse: [GUARD] } }, isHook)).toEqual({ hooks: { PostToolUse: [GUARD], PreToolUse: [GUARD] } });
    expect(mergeClaudeSettings({ hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: LEGACY }] }] } }, isHook)).toEqual({
      hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'node', args: HOOK.args }] }], PostToolUse: [GUARD] },
    });
    // Another command's line is not the hook's.
    const git = { hooks: [{ type: 'command', command: 'node', args: [SCRIPT, 'hook', 'git'] }] };
    expect(mergeClaudeSettings({ hooks: { PreToolUse: [git], PostToolUse: [git] } }, isHook)).toEqual({ hooks: { PreToolUse: [git, GUARD], PostToolUse: [git, GUARD] } });
  });

  it('writes its own beside a line Claude Code starts for no write, and leaves that line as it is', () => {
    const idle = { matcher: 'Bash', hooks: [HOOK] };
    expect(mergeClaudeSettings({ hooks: { PreToolUse: [idle], PostToolUse: [idle] } })).toEqual({ hooks: { PreToolUse: [idle, GUARD], PostToolUse: [idle, GUARD] } });
    // So beside a person's line that is started for none.
    const changed = { matcher: 'Bash', hooks: [{ type: 'command', command: 'node', args: [...HOOK.args, '--root', PROJECT_DIR] }] };
    expect(mergeClaudeSettings({ hooks: { PreToolUse: [changed], PostToolUse: [changed] } }, isHook)).toEqual({ hooks: { PreToolUse: [changed, GUARD], PostToolUse: [changed, GUARD] } });
    // In the background it refuses nothing before a write, and still tells the model after one.
    const background = { matcher: GUARD.matcher, hooks: [{ ...HOOK, async: true }] };
    expect(mergeClaudeSettings({ hooks: { PreToolUse: [background], PostToolUse: [background] } }, isHook)).toEqual({ hooks: { PreToolUse: [background, GUARD], PostToolUse: [background] } });
    // One whose writes cannot be told is taken as started: a second line would run beside it.
    const conditional = { matcher: GUARD.matcher, hooks: [{ ...HOOK, if: 'Edit(*.ts)' }] };
    expect(mergeClaudeSettings({ hooks: { PreToolUse: [conditional], PostToolUse: [conditional] } })).toBeNull();
  });

  it('gives onFailure "block" to init\'s own entries under the three events it writes them under, and to no other', () => {
    const BLOCKS = { ...HOOK, onFailure: 'block' };
    const START = { hooks: [HOOK] };
    expect(withOnFailure({ hooks: { PreToolUse: [GUARD], PostToolUse: [GUARD], SessionStart: [START] } })).toEqual({
      hooks: { PreToolUse: [{ ...GUARD, hooks: [BLOCKS] }], PostToolUse: [{ ...GUARD, hooks: [BLOCKS] }], SessionStart: [{ hooks: [BLOCKS] }] },
    });
    // Where every one has it, nothing is to be written; one that has another value is given this one.
    expect(withOnFailure({ hooks: { PreToolUse: [{ ...GUARD, hooks: [BLOCKS] }], PostToolUse: [{ ...GUARD, hooks: [BLOCKS] }] } })).toBeNull();
    expect(withOnFailure({ hooks: { PreToolUse: [{ ...GUARD, hooks: [{ ...HOOK, onFailure: 'continue' }] }] } })).toEqual({ hooks: { PreToolUse: [{ ...GUARD, hooks: [BLOCKS] }] } });
    // A person's line, another program's entry beside init's, a group with no line of init's, and an event init writes nothing under are as they were.
    const theirs = { type: 'command', command: 'node', args: [...HOOK.args, '--brief', '001'] };
    const lint = { type: 'command', command: 'npm run lint' };
    const other = { matcher: 'Bash', hooks: [lint] };
    expect(withOnFailure({ hooks: { PreToolUse: [other, { ...GUARD, hooks: [lint, HOOK, theirs] }], Stop: [{ hooks: [HOOK] }] }, model: 'x' })).toEqual({
      hooks: { PreToolUse: [other, { ...GUARD, hooks: [lint, BLOCKS, theirs] }], Stop: [{ hooks: [HOOK] }] },
      model: 'x',
    });
    expect(withOnFailure({ hooks: { PreToolUse: [{ ...GUARD, hooks: [theirs] }], Stop: [{ hooks: [HOOK] }] } })).toBeNull();
    // A group that is not one, beside init's, is left as it stands.
    expect(withOnFailure({ hooks: { PreToolUse: [null, { hooks: 'y' }, GUARD] } })).toEqual({ hooks: { PreToolUse: [null, { hooks: 'y' }, { ...GUARD, hooks: [BLOCKS] }] } });
    for (const none of [{}, { hooks: null }, { hooks: { PreToolUse: 'x', PostToolUse: [null, { hooks: 'y' }] } }]) expect(withOnFailure(none), JSON.stringify(none)).toBeNull();
    // What it is handed is not changed.
    const given = { hooks: { PreToolUse: [GUARD] } };
    withOnFailure(given);
    expect(given).toEqual({ hooks: { PreToolUse: [{ matcher: GUARD.matcher, hooks: [HOOK] }] } });
    expect(HOOK).not.toHaveProperty('onFailure');
  });
});

describe('the MCP server registration', () => {
  it('runs the project\'s install with node, reading the project it names', () => {
    expect(PROJECT_DIR_OR_HERE).toBe('${CLAUDE_PROJECT_DIR:-.}');
    expect(mcpServer(PROJECT_DIR)).toEqual({ command: 'node', args: [SCRIPT, 'mcp', '--root', '${CLAUDE_PROJECT_DIR}'] });
    expect(mcpServer('/p')).toEqual({ command: 'node', args: ['/p/node_modules/@spec-family/spec-harness/bin/spec-harness.js', 'mcp', '--root', '/p'] });
  });

  it('registers the server beside those already there, with the default a project file needs', () => {
    const server = {
      command: 'node',
      args: ['${CLAUDE_PROJECT_DIR:-.}/node_modules/@spec-family/spec-harness/bin/spec-harness.js', 'mcp', '--root', '${CLAUDE_PROJECT_DIR:-.}'],
    };
    const current = { mcpServers: { other: { command: 'x' } }, extra: true };
    expect(mergeMcp(current)).toEqual({ mcpServers: { other: { command: 'x' }, 'spec-harness': server }, extra: true });
    expect(mergeMcp({})).toEqual({ mcpServers: { 'spec-harness': server } });
    expect(mergeMcp({ mcpServers: null })).toEqual(mergeMcp({}));
    expect(mergeMcp({ mcpServers: 'x' })).toEqual(mergeMcp({}));
  });

  it('changes nothing when a server by that name is registered some other way', () => {
    expect(mergeMcp({ mcpServers: { 'spec-harness': { command: 'node', args: ['dist/cli.js', 'mcp'] } } })).toBeNull();
    expect(mergeMcp({ mcpServers: { 'spec-harness': { command: 'npx', args: ['spec-harness', 'mcp'] } } })).toBeNull();
    expect(mergeMcp({ mcpServers: { 'spec-harness': { command: 'bunx', args: ['--no-install', 'spec-harness', 'mcp'] } } })).toBeNull();
    expect(mergeMcp({ mcpServers: { 'spec-harness': null } })).toBeNull();
  });

  it('replaces the npx entry 0.1 registered, keeping its other fields', () => {
    const merged = mergeMcp({ mcpServers: { 'spec-harness': { type: 'stdio', command: 'npx', args: ['--no-install', 'spec-harness', 'mcp'], env: { A: '1' } } } });
    expect(merged).toEqual({ mcpServers: { 'spec-harness': { type: 'stdio', env: { A: '1' }, ...mcpServer(PROJECT_DIR_OR_HERE) } } });
    expect(mergeMcp(merged ?? {})).toBeNull();
  });
});

describe('the Claude Code plugin beside init\'s entries (ADR-0012)', () => {
  const USER = '/home/p/.claude/settings.json';
  const on = (file: string, plugins: Record<string, unknown>) => ({ file, settings: { enabledPlugins: plugins } });

  it('finds the server in .mcp.json under its name, however it is run', () => {
    expect(registersServer(mergeMcp({}) ?? {})).toBe(true);
    expect(registersServer({ mcpServers: { 'spec-harness': { command: 'npx', args: ['--no-install', 'spec-harness', 'mcp'] } } })).toBe(true);
    expect(registersServer({ mcpServers: { 'spec-harness': null } })).toBe(true);
    expect(registersServer({ mcpServers: { other: { command: 'node', args: ['spec-harness.js', 'mcp'] } } })).toBe(false);
    expect(registersServer({ mcpServers: 'spec-harness' })).toBe(false);
    expect(registersServer({ 'spec-harness': {} })).toBe(false);
    expect(registersServer(null)).toBe(false);
    expect(registersServer('unreadable')).toBe(false);
  });

  it('reads the plugin as on when a settings file enables it, from any marketplace that names it spec-harness', () => {
    expect(enabledPlugin([on(USER, { 'spec-harness@spec-tools': true })])).toEqual({ id: 'spec-harness@spec-tools', file: USER });
    expect(enabledPlugin([on('.claude/settings.json', { 'spec-harness@team': true })])).toEqual({ id: 'spec-harness@team', file: '.claude/settings.json' });
  });

  it('lets the later file decide an id, as Claude Code does: user, then project, then local', () => {
    const user = on(USER, { 'spec-harness@spec-tools': true });
    expect(enabledPlugin([user, on('.claude/settings.local.json', { 'spec-harness@spec-tools': false })])).toBeNull();
    expect(enabledPlugin([on(USER, { 'spec-harness@spec-tools': false }), on('.claude/settings.json', { 'spec-harness@spec-tools': true })])).toEqual({
      id: 'spec-harness@spec-tools',
      file: '.claude/settings.json',
    });
    // A file that does not name the id leaves the earlier file's answer.
    expect(enabledPlugin([user, on('.claude/settings.json', { 'other@spec-tools': false }), { file: '.claude/settings.local.json', settings: {} }])).toEqual({
      id: 'spec-harness@spec-tools',
      file: USER,
    });
    // Two marketplaces' plugins are two plugins: turning one off leaves the other on.
    expect(enabledPlugin([on(USER, { 'spec-harness@a': true }), on('.claude/settings.local.json', { 'spec-harness@b': false })])).toEqual({ id: 'spec-harness@a', file: USER });
  });

  it('reads no other plugin as this one, and a value that is not true or false as deciding nothing', () => {
    const others = { 'spec-harness-extra@spec-tools': true, 'other@spec-tools': true, 'spec-harness': true, 'spec-harness@': true, 'x@spec-harness@y': true, 'spec-harness@a@b': true };
    expect(enabledPlugin([on(USER, others)])).toBeNull();
    expect(enabledPlugin([on(USER, { 'spec-harness@spec-tools': 'true' })])).toBeNull();
    expect(enabledPlugin([on(USER, { 'spec-harness@spec-tools': true }), on('.claude/settings.local.json', { 'spec-harness@spec-tools': 'false' })])).toEqual({
      id: 'spec-harness@spec-tools',
      file: USER,
    });
    expect(enabledPlugin([{ file: USER, settings: { enabledPlugins: ['spec-harness@spec-tools'] } }, { file: USER, settings: { enabledPlugins: null } }])).toBeNull();
    expect(enabledPlugin([])).toBeNull();
    // A file that is missing, or that JSON cannot read, turns nothing on or off.
    expect(enabledPlugin([{ file: USER, settings: null }, { file: '.claude/settings.json', settings: 'unreadable' }])).toBeNull();
    expect(enabledPlugin([on(USER, { 'spec-harness@spec-tools': true }), { file: '.claude/settings.local.json', settings: 'unreadable' }])).toEqual({
      id: 'spec-harness@spec-tools',
      file: USER,
    });
  });

  it('says why init writes no hook or server while the plugin is on, and how to have init\'s instead', () => {
    const plugin = { id: 'spec-harness@spec-tools', file: USER };
    const off = 'turn the plugin off for this project with claude plugin disable spec-harness@spec-tools --scope local';
    expect(describeSkipped(plugin, 'hooks', false)).toBe(
      `the spec-harness plugin is on (spec-harness@spec-tools in ${USER}) and brings the guard hooks, so init writes none: with both, every write is guarded twice. To have them here instead, for every clone of the repository, ${off} and run init again`,
    );
    expect(describeSkipped(plugin, 'server', false)).toBe(
      `the spec-harness plugin is on (spec-harness@spec-tools in ${USER}) and brings the server, so init registers none: with both, the server is registered twice. To have it here instead, for every clone of the repository, ${off} and run init again`,
    );
  });

  it('says that a file holding init\'s entry beside the plugin is a double install, and how to keep one', () => {
    const plugin = { id: 'spec-harness@team', file: '.claude/settings.json' };
    const off = 'turn the plugin off for this project with claude plugin disable spec-harness@team --scope local';
    expect(describeSkipped(plugin, 'hooks', true)).toBe(
      `the spec-harness plugin is on (spec-harness@team in .claude/settings.json) and brings the guard hooks this file holds as well, so every write is guarded twice: take spec-harness's hooks out of this file, or ${off}`,
    );
    expect(describeSkipped(plugin, 'server', true)).toBe(
      `the spec-harness plugin is on (spec-harness@team in .claude/settings.json) and brings the server this file holds as well, so the server is registered twice: take the spec-harness server out of this file, or ${off}`,
    );
    // Held by a file init does not write, it is the same double install, said of that file.
    expect(describeSkipped(plugin, 'hooks', false, ['.claude/settings.local.json'])).toBe(
      `the spec-harness plugin is on (spec-harness@team in .claude/settings.json) and brings the guard hooks .claude/settings.local.json holds as well, so every write is guarded twice: take spec-harness's hooks out there, or ${off}. init writes none here`,
    );
    expect(describeSkipped(plugin, 'hooks', false, [USER, '.claude/settings.local.json'])).toBe(
      `the spec-harness plugin is on (spec-harness@team in .claude/settings.json) and brings the guard hooks ${USER} and .claude/settings.local.json hold as well, so every write is guarded twice: take spec-harness's hooks out there, or ${off}. init writes none here`,
    );
    // This file's own entry is said first, whatever another holds.
    expect(describeSkipped(plugin, 'hooks', true, [USER])).toBe(describeSkipped(plugin, 'hooks', true));
  });

  it('tells the plugin, init\'s entries, both and neither apart, either of init\'s entries counting', () => {
    const plugin = { id: 'spec-harness@spec-tools', file: USER };
    expect(wiringState({ plugin: null, hooks: [], server: false })).toBe('none');
    expect(wiringState({ plugin: null, hooks: ['.claude/settings.json'], server: false })).toBe('init');
    expect(wiringState({ plugin: null, hooks: [], server: true })).toBe('init');
    expect(wiringState({ plugin, hooks: [], server: false })).toBe('plugin');
    expect(wiringState({ plugin, hooks: ['.claude/settings.local.json'], server: false })).toBe('both');
    expect(wiringState({ plugin, hooks: [], server: true })).toBe('both');
  });

  it('says in doctor what wires Claude Code, and what doubles', () => {
    const plugin = { id: 'spec-harness@spec-tools', file: USER };
    const off = 'turn the plugin off for this project with claude plugin disable spec-harness@spec-tools --scope local';
    const on = `the spec-harness plugin is on (spec-harness@spec-tools in ${USER})`;
    for (const wiring of [{ plugin: null, hooks: [], server: false }, { plugin: null, hooks: [], server: false, unloaded: null }]) {
      expect(describeClaudeCode(wiring)).toBe(
        'neither the spec-harness plugin nor the hooks init writes, so Claude Code guards no write: run spec-harness init --write, or install the plugin',
      );
    }
    expect(describeClaudeCode({ plugin: null, hooks: ['.claude/settings.json'], server: true })).toBe("init's entries: the guard hooks in .claude/settings.json, the server in .mcp.json");
    expect(describeClaudeCode({ plugin: null, hooks: [], server: true })).toBe("init's entries: the server in .mcp.json");
    expect(describeClaudeCode({ plugin, hooks: [], server: false })).toBe(`${on} and brings the guard hooks and the server`);
    expect(describeClaudeCode({ plugin, hooks: ['.claude/settings.json', '.claude/settings.local.json'], server: true })).toBe(
      `${on}, beside the guard hooks in .claude/settings.json, the guard hooks in .claude/settings.local.json, the server in .mcp.json: every write is guarded twice and the server is registered twice. Keep one: take spec-harness's entries out of those files, or ${off}`,
    );
    expect(describeClaudeCode({ plugin, hooks: ['.claude/settings.json'], server: false })).toBe(
      `${on}, beside the guard hooks in .claude/settings.json: every write is guarded twice. Keep one: take spec-harness's entries out of those files, or ${off}`,
    );
    expect(describeClaudeCode({ plugin, hooks: [], server: true })).toBe(
      `${on}, beside the server in .mcp.json: the server is registered twice. Keep one: take spec-harness's entries out of those files, or ${off}`,
    );
  });

  it("advises the array first where one unloads the project's settings, since init writes no hook there while it stands", () => {
    // init --write, as advised, only advised the array in turn: the advice is the one at the end.
    const unloaded = { event: 'PreToolUse', matcher: '["Bash"]' };
    const mend = `${describeArrayMatcher('.claude/settings.json', unloaded)}, those init writes among them: ${ONE_STRING}, then run spec-harness init --write`;
    expect(describeClaudeCode({ plugin: null, hooks: [], server: false, unloaded })).toBe(`neither the spec-harness plugin nor the hooks init writes, so Claude Code guards no write: ${mend}, or install the plugin`);
    expect(mend).toBe(
      '.claude/settings.json has an array for a matcher under PreToolUse, ["Bash"], which Claude Code lists as an invalid setting, and beside one under PreToolUse or PermissionRequest it loads none of the file\'s other hooks, those init writes among them: write the matcher as one string, its names between "|", then run spec-harness init --write',
    );
    // What is wired is said as it was.
    expect(describeClaudeCode({ plugin: null, hooks: [], server: true, unloaded })).toBe("init's entries: the server in .mcp.json");
  });
});

describe('spec-brief\'s plugins', () => {
  it('names the plugin by the subpath this package exports, and spec-brief\'s files in its order', () => {
    expect(PLUGIN).toBe('@spec-family/spec-harness/spec-brief-plugin');
    expect(SPEC_BRIEF_CONFIGS).toEqual(['.spec-brief.json', 'spec-brief.json']);
  });

  it('reads the plugin as loaded by name or as a module with options, and only so', () => {
    expect(loadsPlugin({ plugins: [PLUGIN] })).toBe(true);
    expect(loadsPlugin({ plugins: ['./tools/x.mjs', { module: PLUGIN, options: {} }] })).toBe(true);
    expect(loadsPlugin({})).toBe(false);
    expect(loadsPlugin({ plugins: PLUGIN })).toBe(false);
    expect(loadsPlugin({ plugins: ['@spec-family/spec-harness', { module: '@spec-family/spec-harness' }, null, { name: PLUGIN }] })).toBe(false);
  });

  it("reads a path spec-brief loads as the plugin when it names the plugin's file, and asks about nothing else", () => {
    const asked: string[] = [];
    const isPluginFile = (path: string): boolean => {
      asked.push(path);
      return path.endsWith('plugin.js');
    };
    // A path starts with a dot or is absolute, as spec-brief reads one, alone or as a module.
    expect(loadsPlugin({ plugins: ['./node_modules/@spec-family/spec-harness/dist/plugin.js'] }, isPluginFile)).toBe(true);
    expect(loadsPlugin({ plugins: [{ module: '../shared/plugin.js' }] }, isPluginFile)).toBe(true);
    expect(loadsPlugin({ plugins: ['/opt/spec-harness/dist/plugin.js'] }, isPluginFile)).toBe(true);
    expect(loadsPlugin({ plugins: ['./tools/other.mjs', { module: './x.mjs' }] }, isPluginFile)).toBe(false);
    // A package name is never a path, and never asked about.
    asked.length = 0;
    expect(loadsPlugin({ plugins: ['some-plugin.js', { module: '@scope/plugin.js' }, 7] }, isPluginFile)).toBe(false);
    expect(asked).toEqual([]);
    // Without a way to read the disk, a path is not the plugin.
    expect(loadsPlugin({ plugins: ['./node_modules/@spec-family/spec-harness/dist/plugin.js'] })).toBe(false);
    // And init adds no second one.
    expect(mergeSpecBrief({ plugins: ['./dist/plugin.js'] }, null, isPluginFile)).toBeNull();
    expect(mergeSpecBrief({ plugins: ['./dist/plugin.js'] })).toEqual({ plugins: ['./dist/plugin.js', PLUGIN] });
  });

  it('loads the plugin after those already there, keeping every other setting', () => {
    expect(mergeSpecBrief({})).toEqual({ plugins: [PLUGIN] });
    const current = { briefs: 'docs/briefs', plugins: ['./tools/x.mjs'], archiving: { base: null } };
    expect(mergeSpecBrief(current)).toEqual({ briefs: 'docs/briefs', plugins: ['./tools/x.mjs', PLUGIN], archiving: { base: null } });
    expect(current.plugins).toEqual(['./tools/x.mjs']);
    expect(mergeSpecBrief({ plugins: 'x' })).toEqual({ plugins: [PLUGIN] });
  });

  it('changes nothing when the plugin is loaded', () => {
    expect(mergeSpecBrief({ plugins: [PLUGIN] })).toBeNull();
    expect(mergeSpecBrief({ plugins: [PLUGIN] }, 'main')).toEqual({ plugins: [PLUGIN], archiving: { base: 'main' } });
    expect(mergeSpecBrief({ plugins: [PLUGIN], archiving: { base: null, rewriteLinks: true } }, 'origin/main')).toEqual({
      plugins: [PLUGIN],
      archiving: { base: 'origin/main', rewriteLinks: true },
    });
    // A base a person wrote is theirs, whatever init would have named.
    expect(mergeSpecBrief({ plugins: [PLUGIN], archiving: { base: 'develop' } }, 'main')).toBeNull();
    expect(mergeSpecBrief({ archiving: { base: 'develop' } }, 'main')).toEqual({ archiving: { base: 'develop' }, plugins: [PLUGIN] });
    expect(measuresArchive({ archiving: { base: 'main' } })).toBe(true);
    expect(measuresArchive({ archiving: { base: null } })).toBe(false);
    expect(measuresArchive({ archiving: 'main' })).toBe(false);
    expect(measuresArchive({})).toBe(false);
    expect(mergeSpecBrief({ plugins: [{ module: PLUGIN }] })).toBeNull();
  });

  it('says whether the plugin is loaded, and what to do when it is not', () => {
    expect(describePlugin({ kind: 'loaded', file: '.spec-brief.json' })).toBe(
      "spec-brief loads spec-harness's plugin (.spec-brief.json): its archive accepts a protected file a signed ruling allows",
    );
    expect(describePlugin({ kind: 'not-loaded', file: 'spec-brief.json' })).toBe(
      'spec-brief does not load spec-harness\'s plugin, so its archive refuses a protected file whatever ruling is signed: add "@spec-family/spec-harness/spec-brief-plugin" to "plugins" in spec-brief.json, or run spec-harness init --write',
    );
    expect(describePlugin({ kind: 'unreadable', file: '.spec-brief.json' })).toBe(
      ".spec-brief.json cannot be read as JSON, so whether spec-brief loads spec-harness's plugin is unknown",
    );
    expect(describePlugin({ kind: 'unconfigured' })).toBe(
      "spec-brief has no configuration at the root, so it loads no plugin: spec-harness init --write writes one that loads spec-harness's",
    );
  });
});

describe('the base init names', () => {
  const unrecorded = 'no remote records a default branch (refs/remotes/origin/HEAD)';
  /** Local branches as git lists them where no tag has a branch's name: the name is the ref. */
  const named = (...names: string[]) => names.map((name) => ({ name, ref: name }));

  it('is the remote\'s default branch, wherever git recorded one', () => {
    expect(chooseBase({ remoteDefault: 'origin/trunk', branch: 'brief/001-x', branches: named('brief/001-x', 'main') })).toEqual({
      base: 'origin/trunk',
      detail: "rounds are measured from origin/trunk, the remote's default branch",
    });
  });

  it('is main or master when init runs on it and no remote records a default', () => {
    for (const branch of ['main', 'master']) {
      expect(chooseBase({ remoteDefault: null, branch, branches: named(branch, 'brief/001-x') })).toEqual({
        base: branch,
        detail: `rounds are measured from ${branch}, the branch init runs on: ${unrecorded}; change "base" if rounds merge into another`,
      });
    }
  });

  it('is the only branch, born or not', () => {
    const only = (branch: string) => `rounds are measured from ${branch}, the only branch: ${unrecorded}; change "base" if rounds merge into another`;
    expect(chooseBase({ remoteDefault: null, branch: 'trunk', branches: named('trunk') })).toEqual({ base: 'trunk', detail: only('trunk') });
    expect(chooseBase({ remoteDefault: null, branch: 'trunk', branches: [] })).toEqual({ base: 'trunk', detail: only('trunk') });
  });

  it('is named by the ref git reads as the branch and nothing else, where a tag has its name', () => {
    // `main` beside a tag `main` is read as the tag (gitrevisions(7)), so the base is the branch's ref.
    const tagged = [...named('brief/001-x'), { name: 'main', ref: 'heads/main' }];
    expect(chooseBase({ remoteDefault: null, branch: 'main', branches: tagged })).toEqual({
      base: 'heads/main',
      detail: `rounds are measured from heads/main, the branch init runs on: ${unrecorded}; change "base" if rounds merge into another`,
    });
    expect(chooseBase({ remoteDefault: null, branch: 'trunk', branches: [{ name: 'trunk', ref: 'heads/trunk' }] })).toEqual({
      base: 'heads/trunk',
      detail: `rounds are measured from heads/trunk, the only branch: ${unrecorded}; change "base" if rounds merge into another`,
    });
  });

  it('is left to the person otherwise, with how to name it', () => {
    const advice = 'set "base" to the branch rounds merge into, or run git remote set-head origin --auto and init again';
    expect(chooseBase({ remoteDefault: null, branch: 'brief/001-x', branches: named('brief/001-x', 'main') })).toEqual({
      base: null,
      detail: `no base can be told: ${unrecorded}, and brief/001-x is not main, master or the only branch; ${advice}`,
    });
    const detached = { base: null, detail: `no base can be told: ${unrecorded}, and HEAD is detached; ${advice}` };
    expect(chooseBase({ remoteDefault: null, branch: null, branches: named('main') })).toEqual(detached);
    expect(chooseBase({ remoteDefault: null, branch: null, branches: [] })).toEqual(detached);
  });
});

describe("what doctor says of the keys, the Claude Code release and git's hook", () => {
  it('notes the signers whose key is not FIDO2, and says nothing when there is none', () => {
    expect(describeSignerKeys([])).toBeNull();
    expect(
      describeSignerKeys([
        { line: 1, principals: ['a@example.com', 'b@example.com'], keyType: 'ssh-ed25519' },
        { line: 4, principals: ['c@example.com'], keyType: 'ssh-rsa' },
      ]),
    ).toBe(
      "note: signers whose key is not a FIDO2 key: a@example.com,b@example.com (ssh-ed25519, line 1), c@example.com (ssh-rsa, line 4). Where an agent runs as the person, ADR-0006 recommends a FIDO2 key, ssh-keygen -t ed25519-sk, whose signature needs a touch no process can supply, or a key the agent's account cannot read; a PIV or PKCS#11 hardware key reads as a plain ssh-rsa or ecdsa line, so this is a note, not a failure",
    );
    expect(describeSignerProblem({ line: 3, message: 'm' })).toBe('note: line 3 is not a signer: m');
  });

  it('says whether the Claude Code on PATH runs the hooks, and never that one it cannot tell is fine', () => {
    expect(describeClaudeRelease({ state: 'ok', version: '2.1.200' })).toBe('Claude Code 2.1.200 runs the hooks, which need 2.1.139 or later');
    expect(describeClaudeRelease({ state: 'outdated', version: '2.1.100' })).toBe(
      "Claude Code 2.1.100 is older than 2.1.139, which the hooks need: it ignores a hook's args and runs a bare node, which fails, and a PreToolUse hook that fails blocks nothing, so every write passes unguarded: update Claude Code, with claude update",
    );
    // Read from the package a Windows shim runs, rather than asked: the file says where.
    const file = 'C:\\npm\\node_modules\\@anthropic-ai\\claude-code\\package.json';
    expect(describeClaudeRelease({ state: 'ok', version: '2.1.285', file })).toBe(`Claude Code 2.1.285 (as ${file} declares) runs the hooks, which need 2.1.139 or later`);
    expect(describeClaudeRelease({ state: 'outdated', version: '2.1.100', file })).toBe(
      `Claude Code 2.1.100 (as ${file} declares) is older than 2.1.139, which the hooks need: it ignores a hook's args and runs a bare node, which fails, and a PreToolUse hook that fails blocks nothing, so every write passes unguarded: update Claude Code, with claude update`,
    );
    expect(describeClaudeRelease({ state: 'unknown', reason: 'no claude is on PATH' })).toBe(
      'whether Claude Code is 2.1.139 or later, which the hooks need, cannot be told: no claude is on PATH; an older release lets every write pass unguarded, so check claude --version where Claude Code runs',
    );
  });

  it("says whether git's pre-commit hook runs spec-harness, and what to do when it does not", () => {
    expect(describeGitHook({ state: 'runs', file: '.git/hooks/pre-commit' })).toBe('.git/hooks/pre-commit runs spec-harness');
    expect(describeGitHook({ state: 'inert', file: '.githooks/pre-commit' })).toBe(
      '.githooks/pre-commit runs spec-harness, but is not executable, so git skips it: chmod +x .githooks/pre-commit',
    );
    expect(describeGitHook({ state: 'other', file: '.git/hooks/pre-commit' })).toBe(
      '.git/hooks/pre-commit does not run spec-harness: add the line "node node_modules/@spec-family/spec-harness/bin/spec-harness.js hook git" to it',
    );
    expect(describeGitHook({ state: 'absent', file: '.git/hooks/pre-commit' })).toBe(missingGitHook('.git/hooks/pre-commit'));
    expect(missingGitHook('.git/hooks/pre-commit')).toBe(
      "no pre-commit hook runs spec-harness (.git/hooks/pre-commit): one refuses a commit that changes what the active brief protects, for any agent or none, a shell's writes included; run spec-harness init --git-hook --write to add it",
    );
    expect(missingGitHook(null)).toBe(
      "no pre-commit hook runs spec-harness: one refuses a commit that changes what the active brief protects, for any agent or none, a shell's writes included; run spec-harness init --git-hook --write to add it",
    );
    expect(describeGitHook({ state: 'unknown', reason: 'r' })).toBe('where git runs its hooks cannot be told: r');
  });

  it('says a hook file that cannot be read, and what git does with it: skips it where it may not execute it, and cannot be told where it may', () => {
    // Measured with git 2.47 as an ordinary account: mode 000 is skipped with a hint and the commit made; 111 and 333 run, and the shell cannot open the script.
    const reason = "EACCES: permission denied, open '/r/.git/hooks/pre-commit'";
    expect(describeGitHook({ state: 'unreadable', file: '.git/hooks/pre-commit', runs: false, reason })).toBe(
      `.git/hooks/pre-commit cannot be read (${reason}), and is not executable, so git skips it and runs no hook: make it readable and executable, or take it away and run spec-harness init --git-hook --write`,
    );
    expect(describeGitHook({ state: 'unreadable', file: '.git/hooks/pre-commit', runs: true, reason })).toBe(
      `.git/hooks/pre-commit cannot be read (${reason}), so whether it runs spec-harness cannot be told: git runs it at a commit, and a script there that cannot be read stops every commit, where a program runs; make it readable`,
    );
  });

  it("says what stands at the hook's path that is no file, and what git does with it: stops every commit, or skips it", () => {
    expect(describeGitHook({ state: 'stops', file: '.githooks/pre-commit', what: 'a directory' })).toBe(
      '.githooks/pre-commit is a directory, not a hook, and git stops every commit at it, since it cannot run it ("cannot spawn" on Windows, "cannot exec" elsewhere): nothing is checked there, and nothing is committed. Take it away, then run spec-harness init --git-hook --write',
    );
    expect(describeGitHook({ state: 'ignored', file: '.git/hooks/pre-commit', what: 'neither a file nor a directory' })).toBe(
      '.git/hooks/pre-commit is neither a file nor a directory, not a hook, and is not executable, so git skips it and runs no hook: take it away, then run spec-harness init --git-hook --write',
    );
  });

  it('runs git\'s hook with node and the script in the project\'s install, as it runs Claude Code\'s, read from the top of the work tree', () => {
    expect(GIT_HOOK_LINE).toBe('node node_modules/@spec-family/spec-harness/bin/spec-harness.js hook git');
    // The script the Claude Code hooks name under the project, here under the directory git starts the hook in.
    expect(`${PROJECT_DIR}/${GIT_HOOK_LINE.split(' ')[1]}`).toBe(SCRIPT);
  });

  it('writes a pre-commit hook in POSIX sh that says what is missing where the install is not, and otherwise runs it', () => {
    expect(PRE_COMMIT).toBe(
      [
        '#!/bin/sh',
        '# spec-harness: refuse a commit that changes what the active brief protects.',
        "# git runs this at the top of the work tree it commits in, a linked worktree's",
        "# own, wherever the hook is kept: the project's install is read from there,",
        "# or, where a linked worktree has none, from the repository's main work tree.",
        'bin=node_modules/@spec-family/spec-harness/bin/spec-harness.js',
        'if [ ! -f "$bin" ]; then',
        '  common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)',
        '  if [ "${common##*/}" = .git ] && [ -f "${common%/.git}/$bin" ]; then',
        '    bin=${common%/.git}/$bin',
        `  elif grep -q '"@spec-family/spec-harness"' package.json 2>/dev/null; then`,
        `    printf '%s\\n' "spec-harness: $bin is not in $PWD, the work tree git commits in, nor in its repository's main work tree: install the project's dependencies there, as with npm ci, and commit again" >&2`,
        '    exit 2',
        '  else',
        `    printf '%s\\n' "spec-harness: $bin is not in $PWD, the work tree git commits in, nor in its repository's main work tree, and package.json there names no @spec-family/spec-harness: a commit from before the project took it up has no hook to run, and installing its dependencies brings none, so the commit waits" >&2`,
        '    exit 2',
        '  fi',
        'fi',
        'exec node "$bin" hook git',
        '',
      ].join('\n'),
    );
    // What it runs is the line advised for a hook of the repository's own, the script by the name it checked.
    expect(PRE_COMMIT.endsWith(`\nexec ${GIT_HOOK_LINE.replace('node_modules/@spec-family/spec-harness/bin/spec-harness.js', '"$bin"')}\n`)).toBe(true);
    // doctor and init find the harness in it by name, and no npx.
    expect(PRE_COMMIT).toContain('spec-harness');
    expect(gitHookNote(PRE_COMMIT)).toBeNull();
  });

  describe('a hook that runs the harness through npx', () => {
    const NOTE =
      'it runs spec-harness through npx, which starts npm to start node on every commit, and under npm 12 prints two "npm notice run" lines each time: ' +
      'to run it with node from the project\'s install, as Claude Code\'s hooks are, replace the npx command there with "node node_modules/@spec-family/spec-harness/bin/spec-harness.js hook git"';

    it.each([
      ['the hook init wrote through 0.9.1', '#!/bin/sh\n# spec-harness: refuse a commit that changes what the active brief protects.\nexec npx --no-install spec-harness hook git\n'],
      ['the line init advised, in a hook of the repository\'s own', '#!/bin/sh\nnpm test || exit 1\nnpx --no-install spec-harness hook git\n'],
      ['npx without --no-install', '#!/bin/sh\nnpx spec-harness hook git\n'],
      ['the package by its full name', '#!/bin/sh\nexec npx --no-install @spec-family/spec-harness hook git\n'],
      ['a comment after the command', '#!/bin/sh\nnpx --no-install spec-harness hook git # the guard\n'],
      ['an indented line, and more spaces than one', '#!/bin/sh\nif true; then\n  npx  --no-install  spec-harness  hook  git\nfi\n'],
      ['Windows line endings', '#!/bin/sh\r\nexec npx --no-install spec-harness hook git\r\n'],
      ['no newline at its end', 'npx --no-install spec-harness hook git'],
    ])('is noted, with the line that runs it with node: %s', (_, text) => {
      expect(gitHookNote(text)).toBe(NOTE);
    });

    it.each([
      ['the hook init writes', PRE_COMMIT],
      ['the line init advises, in a hook of the repository\'s own', `#!/bin/sh\nnpm test || exit 1\n${GIT_HOOK_LINE}\n`],
      ['a comment that names the npx command', '#!/bin/sh\n# was: npx --no-install spec-harness hook git\nexec node node_modules/@spec-family/spec-harness/bin/spec-harness.js hook git\n'],
      ['npx running something else, and the harness run with node', '#!/bin/sh\nnpx --no-install lint-staged\nnode node_modules/@spec-family/spec-harness/bin/spec-harness.js hook git\n'],
      ['npx running the harness\'s other hook', '#!/bin/sh\nnpx --no-install spec-harness hook claude\n'],
      ['npx running another of its commands', '#!/bin/sh\nnpx --no-install spec-harness doctor\n'],
      ['another runner, which is the repository\'s to choose', '#!/bin/sh\npnpm exec spec-harness hook git\nyarn spec-harness hook git\nbunx spec-harness hook git\n'],
      ['a word that only holds npx', '#!/bin/sh\nmynpx spec-harness hook git\nnpxx spec-harness hook git\n'],
      ['npx after the command', '#!/bin/sh\nnode node_modules/@spec-family/spec-harness/bin/spec-harness.js hook git || npx --no-install lint-staged\n'],
      ['a command whose name only starts as the hook\'s does', '#!/bin/sh\nnpx --no-install spec-harness hook gitlab\n'],
      ['a tool whose name only starts as the harness\'s does', '#!/bin/sh\nnpx --no-install spec-harness-hook git\nnpx --no-install spec-harnesshook git\n'],
      ['a tool whose name only ends as the harness\'s does', '#!/bin/sh\nnpx --no-install inspec-harness hook git\n'],
      ['a hook that does not run it', '#!/bin/sh\nnpm test\n'],
      ['an empty hook', ''],
    ])('is not noted: %s', (_, text) => {
      expect(gitHookNote(text)).toBeNull();
    });
  });

  it('says how each forge protects the rule files, GitLab Free without Code Owners (spec-core ADR-0005)', () => {
    expect(PROTECT_RULE_FILES).toContain('on GitHub, CODEOWNERS and a protected branch; on GitLab Premium, Code Owners; on GitLab Free, a protected branch no one pushes to, merged by Maintainers, agents as Developers, and pipelines that must succeed');
    expect(PROTECT_RULE_FILES).toContain("check each change in CI against the base branch's rules");
  });
});

describe('what doctor says of the base and the signers', () => {
  const sha = '0123456789abcdef0123456789abcdef01234567';

  it('names the base, where it came from and the merge base', () => {
    expect(describeBase({ ref: 'main', source: 'config', mergeBase: sha })).toBe('main (.spec-harness.json), merge base 0123456789ab');
    expect(describeBase({ ref: 'origin/main', source: 'remote', mergeBase: sha })).toBe("origin/main (the remote's default branch), merge base 0123456789ab");
    expect(describeBase({ ref: 'dev', source: 'flag', mergeBase: sha })).toBe('dev (--base), merge base 0123456789ab');
    expect(describeBase({ reason: '"x" names no commit' })).toBe('none: "x" names no commit');
  });

  it('says whether the allowed signers are on the base, and what no ruling can do without them', () => {
    expect(describeSigners('.github/allowed_signers', 'main', true)).toBe('.github/allowed_signers is on main');
    expect(describeSigners('.github/allowed_signers', 'main', false)).toBe(
      '.github/allowed_signers is not on main, so no ruling can count: commit it there, one line per person: <email> namespaces="git" <public key>',
    );
    expect(describeSigners('signers', null, false)).toBe('signers, read from the base, which could not be resolved: no ruling can count');
    expect(describeSigners('signers', null, true)).toBe('signers, read from the base, which could not be resolved: no ruling can count');
  });
});

describe('spec-graph\'s history', () => {
  it('adds the archive to the history patterns, keeping the others', () => {
    expect(mergeSpecGraph({}, 'briefs/archive/**')).toEqual({ historyPatterns: ['briefs/archive/**'] });
    expect(mergeSpecGraph({ specs: ['docs/**'], historyPatterns: ['old/**', 3] }, 'briefs/archive/**')).toEqual({
      specs: ['docs/**'],
      historyPatterns: ['old/**', 'briefs/archive/**'],
    });
    expect(mergeSpecGraph({ historyPatterns: 'old/**' }, 'a/**')).toEqual({ historyPatterns: ['a/**'] });
  });

  it('changes nothing when the archive is already history', () => {
    expect(mergeSpecGraph({ historyPatterns: ['briefs/archive/**'] }, 'briefs/archive/**')).toBeNull();
  });

  it('looks for spec-graph\'s configuration where spec-graph does, in its order', () => {
    expect(SPEC_GRAPH_CONFIGS).toEqual(['.spec-graph.json', 'spec-graph.config.json']);
  });

  it('knows whether spec-graph reads the briefs: by its defaults, only where they are under docs/ and the like', () => {
    expect(graphReadsBriefs({}, 'briefs')).toBe(false);
    for (const briefs of ['docs/briefs', 'doc/briefs', 'adr/briefs', 'rfcs/briefs', 'specs/briefs', 'docs/work/briefs']) expect(graphReadsBriefs({}, briefs), briefs).toBe(true);
    expect(graphReadsBriefs({ patterns: [] }, 'docs/briefs')).toBe(true);
    expect(graphReadsBriefs({ patterns: 'briefs/**/*.md' }, 'briefs')).toBe(false);
  });

  it('reads the patterns spec-graph is given as spec-graph does: the last to match decides, a backslash separates', () => {
    expect(graphReadsBriefs({ patterns: ['docs/**/*.md', 'briefs/**/*.md'] }, 'briefs')).toBe(true);
    expect(graphReadsBriefs({ patterns: ['docs/**/*.md', 3] }, 'docs/briefs')).toBe(true);
    expect(graphReadsBriefs({ patterns: ['docs/**/*.md'] }, 'briefs')).toBe(false);
    expect(graphReadsBriefs({ patterns: ['docs/**/*.md', '!docs/briefs/**'] }, 'docs/briefs')).toBe(false);
    expect(graphReadsBriefs({ patterns: ['briefs\\*.md'] }, 'briefs')).toBe(true);
    expect(graphReadsBriefs({ patterns: ['Briefs/**'] }, 'briefs')).toBe(false);
    // A list spec-graph would refuse reads nothing.
    expect(graphReadsBriefs({ patterns: ['briefs/**', 'docs/[a'] }, 'briefs')).toBe(false);
    expect(graphReadsBriefs({ patterns: ['briefs/**', `${'{a,b}'.repeat(8)}/${'x'.repeat(300)}`] }, 'briefs')).toBe(false);
    // Braces that expand to no path are refused, where {./,docs/**/*.md} matched every path, the briefs included.
    expect(graphReadsBriefs({ patterns: ['{./,docs/**/*.md}'] }, 'briefs')).toBe(false);
    // A leading slash inside braces roots that alternative, as one written
    // alone does, where {/briefs/**/*.md,x} read as briefs/**/*.md.
    expect(graphReadsBriefs({ patterns: ['{/briefs/**/*.md,docs/**/*.md}'] }, 'briefs')).toBe(false);
    expect(graphReadsBriefs({ patterns: ['/briefs/**/*.md'] }, 'briefs')).toBe(false);
    expect(graphReadsBriefs({ patterns: ['{/briefs/**/*.md,docs/**/*.md}'] }, 'docs/briefs')).toBe(true);
    // The slashes after a leading ./ go with it, where .//briefs/**/*.md read as /briefs/**/*.md.
    expect(graphReadsBriefs({ patterns: ['.//briefs/**/*.md'] }, 'briefs')).toBe(true);
    expect(graphReadsBriefs({ patterns: ['{.//briefs/**/*.md,docs/**/*.md}'] }, 'briefs')).toBe(true);
  });

  it('says what the history entry does, and when it does nothing yet', () => {
    expect(describeGraph('docs/briefs/archive/**', 'docs/briefs', true, true)).toBe(
      'read docs/briefs/archive/** as history: an archived brief is a record whatever its status says, so a live brief that depends on one is not a stale premise',
    );
    expect(describeGraph('docs/briefs/archive/**', 'docs/briefs', true, false)).toBe(
      'docs/briefs/archive/** is history: an archived brief is a record whatever its status says, so a live brief that depends on one is not a stale premise',
    );
    expect(describeGraph('briefs/archive/**', 'briefs', false, true)).toBe(
      'read briefs/archive/** as history, for when spec-graph reads the briefs; its patterns do not reach briefs/, so it checks none of them now: add "briefs/**/*.md" to its "patterns" if it should',
    );
    expect(describeGraph('briefs/archive/**', 'briefs', false, false)).toBe(
      'briefs/archive/** is history, for when spec-graph reads the briefs; its patterns do not reach briefs/, so it checks none of them now: add "briefs/**/*.md" to its "patterns" if it should',
    );
  });
});

describe('an entry Claude Code runs as a command, and one it may not (ADR-0005)', () => {
  const FILE = '.claude/settings.json';
  const ARGS = [SCRIPT, 'hook', 'claude'];
  const under = (...hooks: unknown[]) => ({ hooks: { PreToolUse: [{ matcher: GUARD.matcher, hooks }], PostToolUse: [{ matcher: GUARD.matcher, hooks }] } });
  const read = (words: readonly string[]) => claudeHookLine(words, parseOptions, '/p', () => true);
  const reported = (settings: unknown) => reportHooks([{ file: FILE, settings }], '/p', read);

  it('finds no line of the hook in an entry of another handler type, whatever command it holds', () => {
    for (const type of ['http', 'mcp_tool', 'prompt', 'agent']) {
      const entry = { type, command: 'node', args: ARGS, prompt: 'hook claude', url: 'http://localhost:1/' };
      expect(writtenHooks(under(entry)), type).toEqual([]);
      expect(reported(under(entry)), type).toEqual([]);
      // Such an entry is no guard, so init writes its own beside it.
      expect(mergeClaudeSettings(under(entry), () => true), type).toEqual({ hooks: { PreToolUse: [{ matcher: GUARD.matcher, hooks: [entry] }, GUARD], PostToolUse: [{ matcher: GUARD.matcher, hooks: [entry] }, GUARD] } });
    }
  });

  it('keeps an entry with no type, or with a word the reference does not list, and says what it has for one', () => {
    expect(writtenHooks(under({ type: 'command', command: 'node', args: ARGS }))).toEqual([{ events: ['PreToolUse', 'PostToolUse'], words: ['hook', 'claude'], shell: false, blocks: false, untyped: null, launcher: { word: SCRIPT, shell: false } }]);
    const cases: readonly (readonly [unknown, string])[] = [
      [undefined, 'no "type"'],
      ['Command', 'the "type" "Command"'],
      ['', 'the "type" ""'],
      [7, 'the "type" 7'],
      [null, 'the "type" null'],
      [['command'], 'the "type" ["command"]'],
    ];
    for (const [type, said] of cases) {
      const entry = type === undefined ? { command: 'node', args: ARGS } : { type, command: 'node', args: ARGS };
      expect(writtenHooks(under(entry)), said).toEqual([{ events: ['PreToolUse', 'PostToolUse'], words: ['hook', 'claude'], shell: false, blocks: false, untyped: said, launcher: { word: SCRIPT, shell: false } }]);
    }
    // The same words on an entry with a type and on one without are two lines.
    expect(writtenHooks(under({ type: 'command', command: 'node', args: ARGS }, { command: 'node', args: ARGS })).map((line) => line.untyped)).toEqual([null, 'no "type"']);
  });

  it('cannot tell whether Claude Code runs an entry with no type, whatever its line holds, and says how to write it', () => {
    const W = '"hook claude" in .claude/settings.json';
    expect(reported(under({ command: 'node', args: ARGS }))).toEqual([
      {
        file: FILE,
        events: ['PreToolUse', 'PostToolUse'],
        line: ['hook', 'claude'],
        state: 'unknown',
        onFailure: null,
        detail: `${W} stands on an entry with no "type", where Claude Code's hooks reference has "type": "command" on an entry it runs as a command, so whether Claude Code runs it cannot be told here: give the entry "type": "command"`,
        before: ['Edit', 'Write', 'NotebookEdit'],
        after: ['Edit', 'Write', 'NotebookEdit'],
        cover: null,
        note: null,
        timeout: null,
      },
    ]);
    expect(reported(under({ type: 'cmd', command: 'node', args: ARGS }))[0]?.detail).toBe(
      `${W} stands on an entry with the "type" "cmd", where Claude Code's hooks reference has "type": "command" on an entry it runs as a command, so whether Claude Code runs it cannot be told here: give the entry "type": "command"`,
    );
    // Neither a guard that is off nor a shell's line is claimed of it: whether it runs at all comes first.
    expect(reported(under({ command: 'node', args: [...ARGS, '--nope'] }))[0]).toMatchObject({ state: 'unknown', detail: expect.stringContaining('stands on an entry with no "type"') });
    expect(reported(under({ command: `node ${SCRIPT} hook claude --root "$PWD"` }))[0]).toMatchObject({ state: 'unknown', detail: expect.stringContaining('stands on an entry with no "type"') });
    expect(reported(under({ command: 'node', args: ARGS, onFailure: 'block' }))[0]).toMatchObject({ state: 'unknown', note: expect.stringContaining('where it lets the write go ahead without it') });
    // It is taken as a line that is started, so init writes none beside it.
    expect(mergeClaudeSettings(under({ command: 'node', args: ARGS }), () => true)).toBeNull();
    expect(mergeClaudeSettings(under({ command: 'node', args: [...ARGS, '--base', 'main'] }), () => true)).toBeNull();
  });
});

describe('a root on the line that is a directory outside any work tree (ADR-0005)', () => {
  const FILE = '.claude/settings.json';
  const entry = (more: Record<string, unknown> = {}) => ({ type: 'command', command: 'node', args: [SCRIPT, 'hook', 'claude', '--root', '/elsewhere'], ...more });
  const under = (matcher: string, hook: unknown) => ({ hooks: { PreToolUse: [{ matcher, hooks: [hook] }], PostToolUse: [{ matcher, hooks: [hook] }] } });
  const reported = (settings: unknown) => reportHooks([{ file: FILE, settings }], '/p', () => outsideHookLine('/elsewhere'));
  const W = '"hook claude --root /elsewhere" in .claude/settings.json';
  const OFF = `${W}: --root is "/elsewhere", a directory outside any git work tree, which the hook reads as a session outside one, exit 0 and no word, so the guard is off and no write is checked; give the hook's line a directory in the work tree, or leave --root out for the project Claude Code names`;

  it('is a guard that is off, said in the words for the hook there', () => {
    expect(reported(under(GUARD.matcher, entry()))).toEqual([
      { file: FILE, events: ['PreToolUse', 'PostToolUse'], line: ['hook', 'claude', '--root', '/elsewhere'], state: 'off', onFailure: null, detail: OFF, before: ['Edit', 'Write', 'NotebookEdit'], after: ['Edit', 'Write', 'NotebookEdit'], cover: null, note: null, timeout: null },
    ]);
    // Waited on before some writes, or before writes that cannot be told, it is off for those.
    expect(reported(under('Edit', entry()))[0]).toMatchObject({ state: 'off', detail: OFF, before: ['Edit'] });
    expect(reported(under(GUARD.matcher, entry({ if: 'Edit(*.ts)' })))[0]).toMatchObject({ state: 'off', detail: OFF, before: null });
  });

  it('holds no write for onFailure, since the hook exits 0 there and no run of it fails', () => {
    expect(reported(under(GUARD.matcher, entry({ onFailure: 'block' })))[0]).toMatchObject({
      state: 'off',
      onFailure: 'block',
      note: `${W} sets onFailure to "block", so Claude Code 2.1.295 or later holds a write when the hook fails, where it lets the write go ahead without it: by not starting, as where the script on its line is not there, or by running past its timeout`,
      timeout: null,
    });
  });

  it('is not said of a line Claude Code waits on before no write, which leaves none unchecked', () => {
    expect(reported(under('Bash', entry()))[0]).toMatchObject({ state: 'unstarted', detail: null, before: [], after: [] });
    expect(reported({ hooks: { PostToolUse: [{ hooks: [entry()] }] } })[0]).toMatchObject({ state: 'unstarted', detail: null, before: [] });
  });
});

describe('a root on the line that is in another work tree than the project\'s (ADR-0005)', () => {
  const FILE = '.claude/settings.json';
  const TOOLS = ['Edit', 'Write', 'NotebookEdit'];
  const entry = (more: Record<string, unknown> = {}) => ({ type: 'command', command: 'node', args: [SCRIPT, 'hook', 'claude', '--root', '../other'], ...more });
  const under = (matcher: string, hook: unknown) => ({ hooks: { PreToolUse: [{ matcher, hooks: [hook] }], PostToolUse: [{ matcher, hooks: [hook] }] } });
  const reported = (settings: unknown, line: HookLine) => reportHooks([{ file: FILE, settings }], '/work/app', () => line);
  const W = '"hook claude --root ../other" in .claude/settings.json';
  const THEIRS = { top: '/work/other', ours: false };
  const OURS = { top: '/work/other', ours: true };
  const off = (whose: string): string =>
    `${W}: --root is "../other", a directory in /work/other, ${whose}, which does not hold this project: the hook checks a write to a file of that work tree, by its briefs, and passes any other with no word, exit 0, so the guard is off and no write to a file of this project is checked; give the hook's line a directory in this work tree, or leave --root out for the project Claude Code names`;

  it('is a guard that is off where that work tree does not hold the project, said with whose work tree it is and what the hook checks there', () => {
    expect(reported(under(GUARD.matcher, entry()), elsewhereHookLine('../other', THEIRS))).toEqual([
      { file: FILE, events: ['PreToolUse', 'PostToolUse'], line: ['hook', 'claude', '--root', '../other'], state: 'off', onFailure: null, detail: off('the work tree of another repository'), before: TOOLS, after: TOOLS, cover: null, note: null, timeout: null },
    ]);
    // A linked worktree of the project's own repository is named as that, and checks no more of the project.
    expect(reported(under(GUARD.matcher, entry()), elsewhereHookLine('../other', OURS))[0]).toMatchObject({ state: 'off', detail: off('another work tree of this repository') });
    // The hook exits 0 under such a root, so no run of it fails: onFailure holds no write for it.
    expect(reported(under(GUARD.matcher, entry({ onFailure: 'block' })), elsewhereHookLine('../other', THEIRS))[0]).toMatchObject({
      state: 'off',
      note: expect.stringContaining('where it lets the write go ahead without it: by not starting, as where the script on its line is not there, or by running past its timeout'),
    });
    // Waited on before no write, it leaves none unchecked that it was asked about: said as that, and no fault.
    expect(reported(under('Bash', entry()), elsewhereHookLine('../other', THEIRS))[0]).toMatchObject({ state: 'unstarted', detail: null });
    // A fault the hook says nothing of, as a root outside any work tree is, and what goes unchecked under it is the project's writes alone.
    expect(elsewhereHookLine('../other', THEIRS)).toMatchObject({ state: 'off', silent: true, unchecked: 'no write to a file of this project is checked' });
    expect(outsideHookLine('/elsewhere')).not.toHaveProperty('unchecked');
  });

  it('guards where that work tree holds the project, and says whose briefs a write here is checked by', () => {
    const line = holderHookLine({ state: 'guards', root: '/work' }, { top: '/work', ours: false }, 'app');
    const guards = (whose: string, path: string): string =>
      `${W} is more than init writes, and guards: the hook reads the line, and its root, /work, is a directory in /work, ${whose}, which holds this project: the hook checks a write here by that work tree's briefs and its branch, as a file under ${path}/ there`;
    expect(reported(under(GUARD.matcher, entry()), line)).toEqual([
      { file: FILE, events: ['PreToolUse', 'PostToolUse'], line: ['hook', 'claude', '--root', '../other'], state: 'guards', onFailure: null, detail: guards('the work tree of another repository', 'app'), before: TOOLS, after: TOOLS, cover: null, note: null, timeout: null },
    ]);
    // The main work tree around a linked one is the project's own repository.
    const main = holderHookLine({ state: 'guards', root: '/work', brief: '001' }, { top: '/work', ours: true }, '.claude/worktrees/x');
    expect(main).toEqual({ state: 'guards', root: '/work', brief: '001', holder: { top: '/work', ours: true, path: '.claude/worktrees/x' } });
    expect(reported(under(GUARD.matcher, entry()), main)[0]).toMatchObject({ state: 'guards', detail: guards('another work tree of this repository', '.claude/worktrees/x') });
    // A root in the project's own work tree has no other work tree to name, as before.
    expect(reported(under(GUARD.matcher, entry()), { state: 'guards', root: '/work/app/src' })[0]?.detail).toBe(`${W} is more than init writes, and guards: the hook reads the line, and its root, /work/app/src, is a directory`);
  });
});

describe('disableAllHooks in a settings file (ADR-0005)', () => {
  const USER = '/home/p/.claude/settings.json';
  const PROJECT = '.claude/settings.json';
  const LOCAL = '.claude/settings.local.json';
  const source = (file: string, settings: unknown) => ({ file, settings });

  it('is the file that sets it to true, where none of higher precedence sets it to false', () => {
    expect(hooksDisabled([source(USER, {}), source(PROJECT, { disableAllHooks: true }), source(LOCAL, {})])).toBe(PROJECT);
    expect(hooksDisabled([source(USER, { disableAllHooks: true })])).toBe(USER);
    expect(hooksDisabled([source(USER, { disableAllHooks: true }), source(PROJECT, { disableAllHooks: false })])).toBeNull();
    expect(hooksDisabled([source(USER, { disableAllHooks: true }), source(PROJECT, { disableAllHooks: false }), source(LOCAL, { disableAllHooks: true })])).toBe(LOCAL);
    expect(hooksDisabled([source(USER, { disableAllHooks: false }), source(PROJECT, { disableAllHooks: true })])).toBe(PROJECT);
    // The last file that says so is named: that is the one whose value Claude Code is left with.
    expect(hooksDisabled([source(USER, { disableAllHooks: true }), source(PROJECT, { disableAllHooks: true })])).toBe(PROJECT);
  });

  it('is none where no file sets it, and a value that is no Boolean is passed over as the key left out', () => {
    expect(hooksDisabled([])).toBeNull();
    expect(hooksDisabled([source(USER, {}), source(PROJECT, { disableAllHooks: false })])).toBeNull();
    for (const value of ['true', 1, null, {}, ['true']]) {
      expect(hooksDisabled([source(PROJECT, { disableAllHooks: value })]), JSON.stringify(value)).toBeNull();
      expect(hooksDisabled([source(USER, { disableAllHooks: true }), source(PROJECT, { disableAllHooks: value })]), JSON.stringify(value)).toBe(USER);
    }
    expect(hooksDisabled([source(USER, null), source(PROJECT, 'unreadable'), source(LOCAL, { disableAllHooks: true })])).toBe(LOCAL);
  });

  const plugin = { id: 'spec-harness@spec-tools', file: USER };
  const absent = { state: 'absent' as const, detail: 'why' };

  it('switches the guard off where a settings file holds the guard hooks, or a plugin that may be here brings them', () => {
    const wired = { plugin: null, hooks: [] as string[], server: false, hooksOff: PROJECT as string | null };
    expect(guardSwitchedOff({ ...wired, hooks: [PROJECT] })).toBe(true);
    expect(guardSwitchedOff({ ...wired, plugin })).toBe(true);
    expect(guardSwitchedOff({ ...wired, plugin, presence: { state: 'unknown', detail: 'x' } })).toBe(true);
    expect(guardSwitchedOff({ ...wired, plugin, presence: { state: 'present', detail: null } })).toBe(true);
    // Nothing to switch off: no wiring, the server alone, or a plugin that is not on this machine.
    expect(guardSwitchedOff(wired)).toBe(false);
    expect(guardSwitchedOff({ ...wired, server: true })).toBe(false);
    expect(guardSwitchedOff({ ...wired, plugin, presence: absent })).toBe(false);
    expect(guardSwitchedOff({ ...wired, plugin, presence: absent, hooks: [PROJECT] })).toBe(true);
    // And nothing is switched off where no file holds the key.
    expect(guardSwitchedOff({ ...wired, hooks: [PROJECT], plugin, hooksOff: null })).toBe(false);
  });

  it('is said with the file that holds the key, what Claude Code then runs, and what keeps running', () => {
    expect(describeHooksOff(PROJECT, true)).toBe(
      '"disableAllHooks" is true in .claude/settings.json, so Claude Code runs no hook of the user\'s, the project\'s or the local settings, and none of a plugin: no write is guarded. Take the key out of .claude/settings.json, or set it to false, to have the guard back. Hooks of managed settings, and of a plugin managed settings force on, keep running, and no managed settings are read here',
    );
    expect(describeHooksOff(USER, false)).toBe(
      'note: "disableAllHooks" is true in /home/p/.claude/settings.json, so Claude Code runs no hook of the user\'s, the project\'s or the local settings, and none of a plugin: the hooks init writes, and those the plugin brings, would not run while it stands',
    );
  });
});

describe('the plugin that settings turn on, and whether it is on this machine (ADR-0012)', () => {
  const USER = '/home/p/.claude/settings.json';
  const PROJECT = '.claude/settings.json';
  const LOCAL = '.claude/settings.local.json';
  const ID = 'spec-harness@spec-tools';
  const plugin = { id: ID, file: PROJECT };
  const ROOT = join('/home', 'p', '.claude', 'plugins');
  const SEED = join('/opt', 'seed');
  const on = (file: string, more: Record<string, unknown> = {}) => ({ file, settings: { enabledPlugins: { [ID]: true }, ...more } });
  const dir = (more: Partial<{ directory: string; cached: boolean; registry: Record<string, unknown> | null | 'unreadable'; hosted: boolean }> = {}) => ({ directory: ROOT, cached: false, registry: {}, hosted: false, ...more });
  const ENTRY = { source: { source: 'github', repo: 'example/spec-harness' }, installLocation: join(ROOT, 'marketplaces', 'spec-tools'), lastUpdated: '2026-10-12T00:00:00.000Z' };

  it('names the marketplace of an id, and none for an origin that is no marketplace or for text that names no directory', () => {
    expect(pluginMarketplace(ID)).toBe('spec-tools');
    expect(pluginMarketplace('spec-harness@team.tools_2')).toBe('team.tools_2');
    for (const id of ['spec-harness@inline', 'spec-harness@skills-dir', 'spec-harness@synced', 'spec-harness@..', 'spec-harness@../x', 'spec-harness@a/b', 'spec-harness@a\\b', 'spec-harness@.hidden', 'spec-harness@', 'spec-harness@a b']) {
      expect(pluginMarketplace(id), id).toBeNull();
    }
    // A name that only holds one of the three origins is a marketplace's.
    expect(pluginMarketplace('spec-harness@synced-tools')).toBe('synced-tools');
  });

  it('is on the machine where a cache holds a version of it, in the plugins root or in a seed', () => {
    expect(pluginPresence(plugin, [on(PROJECT)], [dir({ cached: true })])).toEqual({ state: 'present', detail: null });
    expect(pluginPresence(plugin, [on(PROJECT)], [dir(), dir({ directory: SEED, cached: true })])).toEqual({ state: 'present', detail: null });
    // A cached version is there whatever the records beside it say.
    expect(pluginPresence(plugin, [on(PROJECT)], [dir({ cached: true, registry: null }), dir({ directory: SEED, registry: 'unreadable' })])).toEqual({ state: 'present', detail: null });
  });

  it('is not on the machine where the project alone turns it on, nothing is cached, and no marketplace of the name is fetched or declared', () => {
    expect(pluginPresence(plugin, [{ file: USER, settings: {} }, on(PROJECT), { file: LOCAL, settings: null }], [dir()])).toEqual({
      state: 'absent',
      detail: `.claude/settings.json alone turns it on, and Claude Code fetches no plugin that a project's settings alone turn on, unless its marketplace lists it by a relative path or a seed directory holds it: no marketplace spec-tools is recorded as fetched or declared in settings, and no version of the plugin is in a cache (${join(ROOT, 'cache')})`,
    });
    // Other marketplaces fetched or declared, and another plugin turned on elsewhere, change nothing.
    const others = [{ file: USER, settings: { enabledPlugins: { 'other@spec-tools': true, [ID]: false }, extraKnownMarketplaces: { team: {} } } }, on(PROJECT)];
    const both = pluginPresence(plugin, others, [dir({ registry: { team: ENTRY } }), dir({ directory: SEED })]);
    expect(both.state).toBe('absent');
    expect(both.detail?.endsWith(`(${join(ROOT, 'cache')}, ${join(SEED, 'cache')})`)).toBe(true);
  });

  it('cannot tell where its id names no marketplace, or no directory for plugins is known', () => {
    expect(pluginPresence({ id: 'spec-harness@inline', file: PROJECT }, [], [dir({ cached: true })])).toEqual({
      state: 'unknown',
      detail: 'spec-harness@inline names no marketplace whose plugins are kept in a cache: a plugin from --plugin-dir, a skills directory or a claude.ai account comes another way',
    });
    expect(pluginPresence(plugin, [on(PROJECT)], [])).toEqual({
      state: 'unknown',
      detail: 'where Claude Code keeps its plugins is not known here: none of CLAUDE_CODE_PLUGIN_CACHE_DIR, CLAUDE_CONFIG_DIR and a home directory is set',
    });
  });

  it('cannot tell where a record of the marketplaces fetched is not there or cannot be read, in any of the directories', () => {
    const registry = join(ROOT, 'known_marketplaces.json');
    expect(pluginPresence(plugin, [on(PROJECT)], [dir({ registry: null })])).toEqual({ state: 'unknown', detail: `${registry}, where Claude Code records the marketplaces it has fetched, is not there` });
    expect(pluginPresence(plugin, [on(PROJECT)], [dir({ registry: 'unreadable' })])).toEqual({ state: 'unknown', detail: `${registry}, where Claude Code records the marketplaces it has fetched, cannot be read as JSON` });
    expect(pluginPresence(plugin, [on(PROJECT)], [dir(), dir({ directory: SEED, registry: null })])).toEqual({
      state: 'unknown',
      detail: `${join(SEED, 'known_marketplaces.json')}, where Claude Code records the marketplaces it has fetched, is not there`,
    });
  });

  it('cannot tell where its marketplace is on the machine, or declared in settings, and no version of it is cached', () => {
    expect(pluginPresence(plugin, [on(PROJECT)], [dir({ registry: { team: ENTRY, 'spec-tools': ENTRY } })])).toEqual({
      state: 'unknown',
      detail: `its marketplace, spec-tools, is on this machine (${join(ROOT, 'known_marketplaces.json')}) and no version of the plugin is in the cache: Claude Code loads a plugin that its marketplace lists by a relative path from the marketplace itself, and the marketplace's list is not read here`,
    });
    expect(pluginPresence(plugin, [on(PROJECT)], [dir(), dir({ directory: SEED, registry: { 'spec-tools': ENTRY } })]).detail).toContain(`(${join(SEED, 'known_marketplaces.json')})`);
    // A record names a marketplace by a key of its own: none is inherited.
    expect(pluginPresence({ id: 'spec-harness@constructor', file: PROJECT }, [{ file: PROJECT, settings: { enabledPlugins: { 'spec-harness@constructor': true } } }], [dir()]).state).toBe('absent');
    const declared = pluginPresence(plugin, [{ file: USER, settings: { extraKnownMarketplaces: { 'spec-tools': { source: { source: 'github', repo: 'example/spec-harness' } } } } }, on(PROJECT)], [dir()]);
    expect(declared).toEqual({
      state: 'unknown',
      detail: `${USER} declares its marketplace, spec-tools, under extraKnownMarketplaces, which Claude Code fetches after a session has started: nothing of it is on this machine now`,
    });
    expect(pluginPresence(plugin, [on(PROJECT, { extraKnownMarketplaces: { 'spec-tools': {} } })], [dir()]).detail?.startsWith('.claude/settings.json declares its marketplace, spec-tools, ')).toBe(true);
    // Declared as something that holds no marketplaces, it is not declared.
    expect(pluginPresence(plugin, [on(PROJECT, { extraKnownMarketplaces: ['spec-tools'] })], [dir()]).state).toBe('absent');
  });

  it('cannot tell where marketplaces hosted on claude.ai are recorded, or a settings file of the person\'s own turns it on', () => {
    expect(pluginPresence(plugin, [on(PROJECT)], [dir(), dir({ directory: SEED, hosted: true })])).toEqual({
      state: 'unknown',
      detail: `${join(SEED, 'known_marketplaces_claudeai.json')} records the marketplaces hosted on claude.ai, in a shape Claude Code's reference does not give, so whether spec-tools is one cannot be read`,
    });
    expect(pluginPresence({ id: ID, file: USER }, [on(USER)], [dir()])).toEqual({
      state: 'unknown',
      detail: `${USER} turns it on, and Claude Code fetches a plugin that settings of the person's own turn on: neither a version of it nor its marketplace, spec-tools, is on this machine now`,
    });
    expect(pluginPresence({ id: ID, file: LOCAL }, [on(USER), on(PROJECT), on(LOCAL)], [dir()]).detail?.startsWith(`${USER} and ${LOCAL} turn it on, and Claude Code fetches `)).toBe(true);
    // Only true turns it on there.
    expect(pluginPresence(plugin, [{ file: USER, settings: { enabledPlugins: { [ID]: 'true' } } }, on(PROJECT)], [dir()]).state).toBe('absent');
  });

  const WHY = 'why';
  const here = { state: 'present' as const, detail: null };
  const gone = { state: 'absent' as const, detail: WHY };
  const untold = { state: 'unknown' as const, detail: WHY };
  const ON = 'the spec-harness plugin is on (spec-harness@spec-tools in .claude/settings.json)';
  const OFF = 'turn the plugin off for this project with claude plugin disable spec-harness@spec-tools --scope local';
  const BRING = 'install it here, with claude plugin install spec-harness@spec-tools once its marketplace is added';

  it('is not counted as wiring where it is not on the machine, and is where it is there or cannot be told', () => {
    expect(wiringState({ plugin, presence: gone, hooks: [], server: false })).toBe('none');
    expect(wiringState({ plugin, presence: gone, hooks: [PROJECT], server: false })).toBe('init');
    expect(wiringState({ plugin, presence: gone, hooks: [], server: true })).toBe('init');
    for (const presence of [here, untold, null]) {
      expect(wiringState({ plugin, presence, hooks: [], server: false })).toBe('plugin');
      expect(wiringState({ plugin, presence, hooks: [PROJECT], server: false })).toBe('both');
    }
    expect(wiringState({ plugin: null, presence: null, hooks: [], server: false })).toBe('none');
  });

  it('is said as no guard where it is not on the machine and nothing else is wired, with what would bring it', () => {
    expect(describeClaudeCode({ plugin, presence: gone, hooks: [], server: false })).toBe(
      `${ON} and is not on this machine, so it brings no hook here: why, and Claude Code guards no write. To have the guard, ${BRING}, or ${OFF} and run spec-harness init --write`,
    );
    // Where an array unloads the project's settings, init writes no hook there either, which is said first.
    const unloaded = { event: 'PermissionRequest', matcher: '["Read"]' };
    const mend = `${describeArrayMatcher('.claude/settings.json', unloaded)}, those init writes among them: ${ONE_STRING}, then run spec-harness init --write`;
    expect(describeClaudeCode({ plugin, presence: gone, hooks: [], server: false, unloaded })).toBe(
      `${ON} and is not on this machine, so it brings no hook here: why, and Claude Code guards no write. To have the guard, ${BRING}, or ${OFF} and ${mend}`,
    );
    expect(describePresence({ plugin, presence: gone, hooks: [], server: true, unloaded })).toBe(describeClaudeCode({ plugin, presence: gone, hooks: [], server: false, unloaded }));
    expect(describePresence({ plugin, presence: gone, hooks: [], server: false })).toBeNull();
    // Beside init's entries those are the wiring, and the plugin is a note under them.
    expect(describeClaudeCode({ plugin, presence: gone, hooks: [PROJECT], server: true })).toBe("init's entries: the guard hooks in .claude/settings.json, the server in .mcp.json");
    expect(describePresence({ plugin, presence: gone, hooks: [PROJECT], server: true })).toBe(
      `${ON} and is not on this machine, so it brings no hook here: why. With the plugin installed as well, every write is guarded twice: ${OFF}`,
    );
    // The server alone guards nothing: said as no guard, under it.
    expect(describeClaudeCode({ plugin, presence: gone, hooks: [], server: true })).toBe("init's entries: the server in .mcp.json");
    expect(describePresence({ plugin, presence: gone, hooks: [], server: true })).toBe(describeClaudeCode({ plugin, presence: gone, hooks: [], server: false }));
  });

  it('is said as the plugin where it is there or cannot be told, and what cannot be told is said beside it', () => {
    for (const presence of [here, untold, null]) {
      expect(describeClaudeCode({ plugin, presence, hooks: [], server: false })).toBe(`${ON} and brings the guard hooks and the server`);
      expect(describeClaudeCode({ plugin, presence, hooks: [PROJECT], server: false })).toContain(', beside the guard hooks in .claude/settings.json: every write is guarded twice. ');
    }
    for (const presence of [here, null]) expect(describePresence({ plugin, presence, hooks: [], server: false })).toBeNull();
    // Nor is there more to say of a plugin that is there beside entries of init's: the double install is the wiring's own sentence.
    expect(describePresence({ plugin, presence: here, hooks: [PROJECT], server: true })).toBeNull();
    // A caller that does not ask whether the plugin is there says nothing of it.
    expect(describePresence({ plugin, hooks: [], server: false })).toBeNull();
    expect(describePresence({ plugin, presence: untold, hooks: [PROJECT], server: false })).toBe(
      "whether spec-harness@spec-tools is on this machine cannot be told: why. A plugin that is not there brings no hook: Claude Code's /plugin lists it, and its errors",
    );
    expect(describePresence({ plugin: null, presence: null, hooks: [PROJECT], server: false })).toBeNull();
    // With no plugin on there is none to speak of, whatever a caller hands over beside it.
    expect(describePresence({ plugin: null, presence: untold, hooks: [], server: false })).toBeNull();
  });

  it('has init say why it writes nothing on that reading alone, and what a file that holds its entry would double', () => {
    expect(describeAbsent(plugin, WHY, 'hooks', false)).toBe(
      `${ON} and is not on this machine, so it brings no hook here: why. On that reading alone init writes none, since with a plugin that is there after all every write is guarded twice: ${BRING}, or to have them here instead, ${OFF} and run init again`,
    );
    expect(describeAbsent(plugin, WHY, 'server', false)).toBe(
      `${ON} and is not on this machine, so it brings no server here: why. On that reading alone init registers none, since with a plugin that is there after all the server is registered twice: ${BRING}, or to have it here instead, ${OFF} and run init again`,
    );
    expect(describeAbsent(plugin, WHY, 'hooks', true)).toBe(`${ON} and is not on this machine, so it brings no hook here: why. This file holds spec-harness's hooks; with the plugin installed as well, every write is guarded twice: ${OFF}`);
    expect(describeAbsent(plugin, WHY, 'server', true)).toBe(`${ON} and is not on this machine, so it brings no server here: why. This file holds the spec-harness server; with the plugin installed as well, the server is registered twice: ${OFF}`);
  });

  describe('on a CI runner (ADR-0012, amended 2026-11-08)', () => {
    const RUNNER = 'CI is set, so this is a CI runner, where no Claude Code session runs: the plugin is not looked for here, and neither is the package its hooks run';
    const ON = `the spec-harness plugin is on (${ID} in .claude/settings.json)`;

    it('is a CI runner where CI is set to anything but false or 0', () => {
      for (const value of ['true', '1', 'TRUE', ' yes ', 'x']) expect(onCiRunner({ CI: value }), value).toBe(true);
      for (const value of [undefined, '', '  ', 'false', 'FALSE', ' False ', '0', ' 0 ']) expect(onCiRunner({ CI: value }), String(value)).toBe(false);
      expect(onCiRunner({})).toBe(false);
      // Another forge's variable alone is no runner here.
      expect(onCiRunner({ GITHUB_ACTIONS: 'true', GITLAB_CI: 'true' })).toBe(false);
    });

    it('leaves the plugin unchecked where no cache holds a version of it, whatever else would be said, and reads one a cache holds', () => {
      const unchecked = { state: 'unchecked', detail: RUNNER };
      expect(pluginPresence(plugin, [on(PROJECT)], [], true)).toEqual(unchecked);
      expect(pluginPresence(plugin, [on(PROJECT)], [dir({ registry: null })], true)).toEqual(unchecked);
      expect(pluginPresence({ id: 'spec-harness@inline', file: PROJECT }, [on(PROJECT)], [], true)).toEqual(unchecked);
      expect(pluginPresence(plugin, [on(PROJECT)], [dir({ registry: null }), dir({ directory: SEED, cached: true })], true)).toEqual({ state: 'present', detail: null });
      // Off a runner, as it was.
      expect(pluginPresence(plugin, [on(PROJECT)], [dir({ registry: null })], false).state).toBe('unknown');
      expect(pluginPresence(plugin, [on(PROJECT)], [dir({ registry: null })]).state).toBe('unknown');
    });

    it('counts an unchecked plugin as wiring nothing, says why, and fails nothing for it', () => {
      const presence = { state: 'unchecked', detail: RUNNER } as const;
      expect(wiringState({ plugin, presence, hooks: [], server: false })).toBe('none');
      expect(wiringState({ plugin, presence, hooks: [PROJECT], server: false })).toBe('init');
      expect(wiringState({ plugin, presence, hooks: [], server: true })).toBe('init');
      expect(guardWired({ plugin, presence, hooks: [], server: true })).toBe(false);
      expect(guardSwitchedOff({ plugin, presence, hooks: [], server: false, hooksOff: PROJECT })).toBe(false);
      expect(describeClaudeCode({ plugin, presence, hooks: [], server: false })).toBe(`${ON}; ${RUNNER}`);
      expect(describeClaudeCode({ plugin, presence, hooks: [PROJECT], server: false })).toBe("init's entries: the guard hooks in .claude/settings.json");
      expect(describePresence({ plugin, presence, hooks: [], server: false })).toBeNull();
      expect(describePresence({ plugin, presence, hooks: [PROJECT], server: false })).toBe(`${ON}; ${RUNNER}`);
      expect(describePresence({ plugin, presence, hooks: [], server: true })).toBe(`${ON}; ${RUNNER}`);
    });
  });

  describe('what the plugin runs from the project (ADR-0012, amended 2026-11-08)', () => {
    const SCRIPT = '${CLAUDE_PROJECT_DIR}/node_modules/@spec-family/spec-harness/bin/spec-harness.js';
    const EARLIER = '${CLAUDE_PROJECT_DIR}/node_modules/@descent-vtt/spec-harness/bin/spec-harness.js';
    const ON = `the spec-harness plugin is on (${ID} in .claude/settings.json)`;
    const INSTALL = 'install the package they run in the project, npm install --save-dev @spec-family/spec-harness, which every project the plugin guards installs';

    it('is the script every release under @spec-family runs, the hooks and the server alike', () => {
      expect(PLUGIN_SCRIPT).toBe(SCRIPT);
    });

    it('reads each script under the project in a plugin file, exec form and shell form, once each, in order', () => {
      const hooks = {
        hooks: {
          PreToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'node', args: [SCRIPT, 'hook', 'claude'], timeout: 60 }] }],
          PostToolUse: [{ hooks: [{ type: 'command', command: `node "${EARLIER}" hook claude` }] }],
          SessionStart: [{ hooks: [{ type: 'command', command: 'node', args: [SCRIPT, 'hook', 'claude'] }] }],
        },
      };
      expect(projectScripts(hooks)).toEqual([SCRIPT, EARLIER]);
      const mcp = { mcpServers: { 'spec-harness': { command: 'node', args: [SCRIPT, 'mcp', '--root', '${CLAUDE_PROJECT_DIR}'] }, other: { command: 'x', args: ['${CLAUDE_PROJECT_DIR}/tools/x.mjs'] } } };
      expect(projectScripts(mcp)).toEqual([SCRIPT]);
    });

    it('reads no script outside the project, none that is not a script, and nothing of a file that holds none', () => {
      for (const word of ['${CLAUDE_PLUGIN_ROOT}/bin/x.js', '/abs/node_modules/x.js', 'node_modules/x.js', '${CLAUDE_PROJECT_DIR}', '${CLAUDE_PROJECT_DIR}/sub', '${CLAUDE_PROJECT_DIR}/x.json', 'x${CLAUDE_PROJECT_DIR}/x.js']) {
        expect(projectScripts({ args: [word] }), word).toEqual([]);
      }
      for (const file of [null, 'unreadable', {}, [], 1, true]) expect(projectScripts(file), JSON.stringify(file)).toEqual([]);
      expect(projectScripts([[`npx ${SCRIPT}`]])).toEqual([SCRIPT]);
      // Words a shell line separates by more than one space are read as well.
      expect(projectScripts({ command: `node  ${SCRIPT}  hook claude` })).toEqual([SCRIPT]);
    });

    it('says the scripts the project has not installed, and how to install the package they run', () => {
      expect(describePluginScripts({ plugin, pluginScripts: [{ script: SCRIPT, file: null, there: true }] })).toBeNull();
      expect(describePluginScripts({ plugin, pluginScripts: [] })).toBeNull();
      expect(describePluginScripts({ plugin, pluginScripts: [{ script: SCRIPT, file: null, there: false }] })).toBe(
        `${ON}, and its hooks and server run ${SCRIPT}, which this project has not installed, so Claude Code cannot start them and lets each write go ahead: ${INSTALL}`,
      );
      expect(describePluginScripts({ plugin, pluginScripts: [{ script: SCRIPT, file: 'a', there: true }, { script: EARLIER, file: 'a', there: false }] })).toBe(
        `${ON}, and its hooks and server run ${EARLIER}, which this project has not installed, so Claude Code cannot start them and lets each write go ahead: ${INSTALL}; a script under @descent-vtt is the plugin's of a release before 0.22.0, which runs a package no release under @spec-family installs: update the plugin as well, from its marketplace`,
      );
      expect(describePluginScripts({ plugin, pluginScripts: [{ script: SCRIPT, file: 'a', there: false }, { script: '${CLAUDE_PROJECT_DIR}/b.js', file: 'b', there: false }] })).toContain(`run ${SCRIPT} and \${CLAUDE_PROJECT_DIR}/b.js, which`);
      // Nothing read, or no plugin on, says nothing, whatever stands beside it.
      expect(describePluginScripts({ plugin, pluginScripts: null })).toBeNull();
      expect(describePluginScripts({ plugin: null, pluginScripts: [{ script: SCRIPT, file: null, there: false }] })).toBeNull();
      // The earlier scope beside the scope now: both said, and the plugin to update.
      expect(describePluginScripts({ plugin, pluginScripts: [{ script: SCRIPT, file: 'a', there: false }, { script: EARLIER, file: 'b', there: false }] })).toContain(`run ${SCRIPT} and ${EARLIER}, which this project has not installed, so Claude Code cannot start them and lets each write go ahead: ${INSTALL}; a script under @descent-vtt`);
      // Named once, as the hooks and the server each name it.
      expect(describePluginScripts({ plugin, pluginScripts: [{ script: SCRIPT, file: 'hooks', there: false }, { script: SCRIPT, file: 'mcp', there: false }] })).toContain(`run ${SCRIPT}, which`);
    });

    it('notes a plugin of a release after the package installed, and no other', () => {
      expect(describePluginAhead(['0.24.0'], '0.23.0')).toBe(
        'note: the plugin is 0.24.0, a release after the package its hooks and server run, 0.23.0 here: they are the plugin\'s release, and the package installed here answers them, so install that release of the package, npm install --save-dev @spec-family/spec-harness@0.24.0',
      );
      expect(describePluginAhead(['0.23.1', '0.24.0'], '0.23.0')).toContain('the plugin is 0.23.1 and 0.24.0, a release after');
      expect(describePluginAhead(['0.23.0', '0.24.0'], '0.23.0')).toContain('the plugin is 0.24.0, a release after');
      // A release candidate of the plugin's release is behind it.
      expect(describePluginAhead(['0.24.0'], '0.24.0-rc.1')).toContain('the plugin is 0.24.0, a release after the package its hooks and server run, 0.24.0-rc.1 here');
      for (const [versions, installed] of [[['0.23.0'], '0.23.0'], [['0.22.0'], '0.23.0'], [['0.24.0'], null], [['0.24.0'], 'x'], [['a1b2c3d4e5f6', 'unknown'], '0.23.0'], [[], '0.23.0']] as const) {
        expect(describePluginAhead(versions, installed), `${versions.join(',')} ${installed}`).toBeNull();
      }
    });
  });
});

describe("the lines of Claude Code's hook in its settings, and what doctor says of each (ADR-0005)", () => {
  const FILE = '.claude/settings.json';
  const BOTH = ['PreToolUse', 'PostToolUse'];
  const exec = (...rest: string[]) => ({ type: 'command', command: 'node', args: [SCRIPT, 'hook', 'claude', ...rest], timeout: 60 });
  const shell = (line: string) => ({ type: 'command', command: line });
  /** Settings that hold the hooks under both events, as init writes its own. */
  const settings = (...hooks: unknown[]) => ({ hooks: { PreToolUse: [{ matcher: GUARD.matcher, hooks }], PostToolUse: [{ matcher: GUARD.matcher, hooks }] } });
  /** The tools that write a file and a supported Claude Code can call: the hook reads MultiEdit too, which none has. */
  const TOOLS = ['Edit', 'Write', 'NotebookEdit'];
  /** Started before every tool that writes and after each, as init's own entries are: nothing to say of it. */
  const EVERY = { before: TOOLS, after: TOOLS, cover: null };
  // Which word names the harness is a test of its own, below.
  const line = (words: string[], more: { shell?: boolean; blocks?: boolean; events?: string[] } = {}) => ({ events: more.events ?? BOTH, words, shell: more.shell ?? false, blocks: more.blocks ?? false, untyped: null, launcher: expect.anything() });

  it('knows the harness by its command, the script or the name at the end of a path, and gives what follows it', () => {
    expect(writtenHooks(settings(HOOK))).toEqual([line(['hook', 'claude'])]);
    expect(writtenHooks(settings(exec('--root', PROJECT_DIR, '--brief', '001')))).toEqual([line(['hook', 'claude', '--root', PROJECT_DIR, '--brief', '001'])]);
    for (const hook of [
      { type: 'command', command: '${CLAUDE_PROJECT_DIR}/node_modules/.bin/spec-harness', args: ['hook', 'claude', 'extra'] },
      { type: 'command', command: 'npx', args: ['--no-install', '@spec-family/spec-harness', 'hook', 'claude', 'extra'] },
      { type: 'command', command: 'C:\\Program Files\\nodejs\\node.exe', args: ['C:\\p\\node_modules\\@spec-family\\spec-harness\\bin\\spec-harness.js', 'hook', 'claude', 'extra'] },
      { type: 'command', command: 'node', args: ['--no-warnings', 'node_modules/@spec-family/spec-harness/bin/spec-harness.js', 'hook', 'claude', 'extra'] },
    ]) {
      expect(writtenHooks(settings(hook)), JSON.stringify(hook)).toEqual([line(['hook', 'claude', 'extra'])]);
    }
    // Whatever follows the command, the guard's line or not: the reader says whose it is.
    expect(writtenHooks(settings({ type: 'command', command: 'node', args: [SCRIPT, 'hook', 'git'] }))).toEqual([line(['hook', 'git'])]);
    expect(writtenHooks(settings({ type: 'command', command: 'node', args: [SCRIPT] }))).toEqual([line([])]);
  });

  it('reads a line with no args as the shell splits it, and says where the shell would change what follows', () => {
    expect(writtenHooks(settings(shell(LEGACY)))).toEqual([line(['hook', 'claude'])]);
    expect(writtenHooks(settings(shell(`  node   "${SCRIPT}"  hook claude `)))).toEqual([line(['hook', 'claude'])]);
    expect(writtenHooks(settings(shell(`node '${SCRIPT}' hook claude --brief 001 --root packages/app`)))).toEqual([line(['hook', 'claude', '--brief', '001', '--root', 'packages/app'])]);
    // A quote, a variable, a redirection, a pattern: each is the shell's to read first.
    for (const rest of ['--root "${CLAUDE_PROJECT_DIR}"', '--root $PWD', "--brief '001'", '--root ~/work', '2>/dev/null', '--brief 00*', '--root a\\b', '&& true']) {
      expect(writtenHooks(settings(shell(`${LEGACY} ${rest}`))), rest).toEqual([line(['hook', 'claude', ...rest.split(' ')], { shell: true })]);
    }
    // With args no shell reads a word, whatever it holds.
    expect(writtenHooks(settings(exec('--root', '"$PWD"')))).toEqual([line(['hook', 'claude', '--root', '"$PWD"'])]);
  });

  it('finds no line of the harness in another program\'s hook, in arguments that are not text, or under another event', () => {
    for (const hook of [
      { type: 'command', command: 'node', args: ['${CLAUDE_PROJECT_DIR}/.claude/hooks/check.js', 'hook', 'claude'] },
      { type: 'command', command: 'node', args: ['node_modules/my-spec-harness.js', 'hook', 'claude'] },
      // With args a quote is part of the word, and no file of the harness's is named with one.
      { type: 'command', command: 'node', args: [`"${SCRIPT}"`, 'hook', 'claude'] },
      { type: 'command', command: 'npx --no-install spec-harness-lint hook claude' },
      { type: 'command', command: 'npm run lint' },
      { type: 'command', command: 'node', args: [SCRIPT, 'hook', 7] },
      { type: 'command', command: 'node', args: `${SCRIPT} hook claude` },
      { type: 'command', command: 'node', args: null },
      { type: 'command', command: 7, args: [SCRIPT, 'hook', 'claude'] },
      { type: 'http', url: 'https://example.com/spec-harness' },
      'spec-harness hook claude',
      null,
    ]) {
      expect(writtenHooks(settings(hook)), JSON.stringify(hook)).toEqual([]);
    }
    expect(writtenHooks({ hooks: { Stop: [GUARD], SessionStart: [GUARD] } })).toEqual([]);
    expect(writtenHooks({ hooks: { PreToolUse: 'x', PostToolUse: [null, { hooks: 'y' }] } })).toEqual([]);
    for (const none of [{ hooks: null }, {}, null, 'unreadable']) expect(writtenHooks(none)).toEqual([]);
  });

  it('has a line under both events once, one under either with its event, and a line that differs as another', () => {
    expect(writtenHooks({ hooks: { PreToolUse: [GUARD] } })).toEqual([line(['hook', 'claude'], { events: ['PreToolUse'] })]);
    expect(writtenHooks({ hooks: { PostToolUse: [GUARD, GUARD] } })).toEqual([line(['hook', 'claude'], { events: ['PostToolUse'] })]);
    // Other hooks beside it, in a group of their own or in its group.
    expect(writtenHooks({ hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'npm run lint' }] }, { hooks: [{ type: 'command', command: 'x' }, HOOK] }], PostToolUse: [GUARD] } })).toEqual([line(['hook', 'claude'])]);
    expect(writtenHooks({ hooks: { PreToolUse: [{ hooks: [exec('--brief', '1')] }], PostToolUse: [{ hooks: [exec('--brief', '2'), exec('--brief', '1')] }] } })).toEqual([
      line(['hook', 'claude', '--brief', '1']),
      line(['hook', 'claude', '--brief', '2'], { events: ['PostToolUse'] }),
    ]);
    // The same words, written for a shell and for none, or with and without onFailure, are lines apart.
    expect(writtenHooks(settings(HOOK, { ...HOOK, onFailure: 'block' }, { ...HOOK, onFailure: 'continue' }))).toEqual([line(['hook', 'claude']), line(['hook', 'claude'], { blocks: true })]);
    expect(writtenHooks(settings(exec('--root', '$PWD'), shell(`${LEGACY} --root $PWD`)))).toEqual([line(['hook', 'claude', '--root', '$PWD']), line(['hook', 'claude', '--root', '$PWD'], { shell: true })]);
  });

  it('reads the word that names the harness as written, and has entries that name it two ways as two lines', () => {
    const named = (hooks: unknown) => writtenHooks(hooks).map((each) => [each.launcher, each.events]);
    expect(named(settings(HOOK))).toEqual([[{ word: SCRIPT, shell: false }, BOTH]]);
    expect(named(settings(shell(`node "${SCRIPT}" hook claude`)))).toEqual([[{ word: `"${SCRIPT}"`, shell: true }, BOTH]]);
    expect(named(settings(shell(LEGACY)))).toEqual([[{ word: 'spec-harness', shell: true }, BOTH]]);
    expect(named(settings({ type: 'command', command: '${CLAUDE_PROJECT_DIR}/node_modules/.bin/spec-harness', args: ['hook', 'claude'] }))).toEqual([[{ word: '${CLAUDE_PROJECT_DIR}/node_modules/.bin/spec-harness', shell: false }, BOTH]]);
    // Another script, or the same one for a shell and for none, is another line, whose script may be there where the first's is not.
    const other = { ...HOOK, args: ['/elsewhere/spec-harness.js', 'hook', 'claude'] };
    expect(named({ hooks: { PreToolUse: [{ hooks: [HOOK, other] }], PostToolUse: [{ hooks: [other] }] } })).toEqual([
      [{ word: SCRIPT, shell: false }, ['PreToolUse']],
      [{ word: '/elsewhere/spec-harness.js', shell: false }, BOTH],
    ]);
    expect(named(settings(HOOK, shell(`node ${SCRIPT} hook claude`)))).toEqual([
      [{ word: SCRIPT, shell: false }, BOTH],
      [{ word: SCRIPT, shell: true }, BOTH],
    ]);
  });

  const PROJECT = '/the/project';
  const DIRECTORIES = [PROJECT, `${PROJECT}/packages/app`];
  /** The hook's own reading, in a session started at the project. */
  const read = (words: readonly string[]) => claudeHookLine(words, parseOptions, PROJECT, (path) => DIRECTORIES.includes(path));
  const reported = (hooks: unknown, file = FILE) => reportHooks([{ file, settings: hooks }], PROJECT, read);
  const OFF = "so the guard is off and no write is checked; mend it in Claude Code's settings, where init writes \"hook claude\" and nothing after it";
  const NO_ROOT = "so the guard is off and no write is checked; give the hook's line a directory that exists, or leave --root out for the project Claude Code names";

  describe('where the script the line runs is not there', () => {
    const W = '"hook claude" in .claude/settings.json';
    const MEND = 'install spec-harness in the project, npm install --save-dev @spec-family/spec-harness, or name its script where it is';
    const INSTALLED = `${PROJECT}/node_modules/@spec-family/spec-harness/bin/spec-harness.js`;
    /** Where a session's project may be, and the files that stand there. */
    const looked = (files: readonly string[], projects: readonly string[] = [PROJECT]): ScriptPlaces => ({ projects, isFile: (path) => files.includes(path) });
    const at = (scripts: ScriptPlaces, hooks: unknown, onFailureHere = false) => reportHooks([{ file: FILE, settings: hooks }], PROJECT, read, undefined, undefined, onFailureHere, scripts);
    const off = (script: string, where = W) => `${where}: the script it runs, ${script}, is not there, so the hook cannot start, the guard is off and Claude Code lets each write it is started for go ahead without it; ${MEND}`;

    it('is a guard that is off, said with the script, and one that guards where the script is there or nothing is looked for', () => {
      expect(at(looked([]), settings(HOOK))).toEqual([{ file: FILE, events: BOTH, line: ['hook', 'claude'], state: 'off', onFailure: null, detail: off(INSTALLED), ...EVERY, note: null, timeout: null }]);
      expect(at(looked([INSTALLED]), settings(HOOK))).toEqual([{ file: FILE, events: BOTH, line: ['hook', 'claude'], state: 'guards', onFailure: null, detail: null, ...EVERY, note: null, timeout: null }]);
      // init asks nothing of the script, which the project installs after it.
      expect(reported(settings(HOOK))[0]).toMatchObject({ state: 'guards', detail: null });
      // By a path of its own, with or without a shell, and with a space in the project's.
      expect(at(looked([]), settings({ ...HOOK, args: ['/opt/tools/spec-harness.js', 'hook', 'claude'] }))[0]).toMatchObject({ state: 'off', detail: off('/opt/tools/spec-harness.js') });
      expect(at(looked([]), settings(shell(`node ${SCRIPT} hook claude`)))[0]).toMatchObject({ state: 'off', detail: off(INSTALLED) });
      expect(at({ projects: ['/the project'], isFile: () => false }, settings(HOOK))[0]).toMatchObject({ state: 'off', detail: off('/the project/node_modules/@spec-family/spec-harness/bin/spec-harness.js') });
      // Before what the hook would do with the words, which it never reads.
      expect(at(looked([]), settings(exec('--nope')))[0]).toMatchObject({ state: 'off', detail: off(INSTALLED, '"hook claude --nope" in .claude/settings.json') });
    });

    it('holds every write where the entry sets onFailure "block" and the Claude Code here reads it, before a write', () => {
      const blocking = settings({ ...HOOK, onFailure: 'block' });
      expect(at(looked([]), blocking, true)[0]).toMatchObject({
        state: 'held',
        detail: `${W}: the script it runs, ${INSTALLED}, is not there, so the hook cannot start, and Claude Code holds every write it is started for before, since the entry sets onFailure to "block"; ${MEND}`,
      });
      // A release that does not read the field lets the write go ahead, and so does one that reads it on an entry without it; after a write there is none to hold.
      expect(at(looked([]), blocking, false)[0]).toMatchObject({ state: 'off', detail: off(INSTALLED) });
      expect(at(looked([]), settings(HOOK), true)[0]).toMatchObject({ state: 'off', detail: off(INSTALLED) });
      expect(at(looked([]), { hooks: { PostToolUse: [{ matcher: GUARD.matcher, hooks: [{ ...HOOK, onFailure: 'block' }] }] } }, true)[0]).toMatchObject({ state: 'off', detail: off(INSTALLED, `${W} (under PostToolUse alone)`) });
    });

    it('is off where it is started after a write alone, and is no guard where it is started for none', () => {
      expect(at(looked([]), { hooks: { PostToolUse: [GUARD] } })[0]).toMatchObject({ state: 'off', detail: off(INSTALLED, `${W} (under PostToolUse alone)`) });
      expect(at(looked([]), both('Bash'))[0]).toMatchObject({ state: 'unstarted', detail: null });
    });

    it('is looked for in each place the project can be, and is not there only where it is in none', () => {
      const MAIN = '/the/main';
      const theirs = `${MAIN}/node_modules/@spec-family/spec-harness/bin/spec-harness.js`;
      expect(at(looked([theirs], [PROJECT, MAIN]), settings(HOOK))[0]).toMatchObject({ state: 'guards', detail: null });
      expect(at(looked([], [PROJECT, MAIN]), settings(HOOK))[0]).toMatchObject({
        state: 'off',
        detail: `${W}: the script it runs is in neither place \${CLAUDE_PROJECT_DIR} can name, ${INSTALLED} or ${theirs}, so the hook cannot start, the guard is off and Claude Code lets each write it is started for go ahead without it; ${MEND}`,
      });
      // A path of its own is one place, however many the project can be.
      expect(at(looked([], [PROJECT, MAIN]), settings({ ...HOOK, args: ['/opt/tools/spec-harness.js', 'hook', 'claude'] }))[0]).toMatchObject({ detail: off('/opt/tools/spec-harness.js') });
    });

    it('says nothing of a script whose place it cannot tell: a relative path, a name a program finds, a word a shell reads', () => {
      for (const hook of [
        { ...HOOK, args: ['node_modules/@spec-family/spec-harness/bin/spec-harness.js', 'hook', 'claude'] },
        { type: 'command', command: 'npx', args: ['--no-install', '@spec-family/spec-harness', 'hook', 'claude'] },
        shell(LEGACY),
        shell(`node "${SCRIPT}" hook claude`),
        shell(`node ${PROJECT}/node_modules/*/spec-harness/bin/spec-harness.js hook claude`),
      ]) {
        expect(at(looked([]), settings(hook))[0], JSON.stringify(hook)).toMatchObject({ state: 'guards', detail: null });
      }
    });
  });

  it('has nothing to say of the line a release wrote, which guards', () => {
    const released = { file: FILE, events: BOTH, line: ['hook', 'claude'], state: 'guards', onFailure: null, detail: null, ...EVERY, note: null, timeout: null };
    expect(reported(settings(HOOK))).toEqual([released]);
    expect(reported(settings(shell(LEGACY)))).toEqual([released]);
    expect(reported(mergeClaudeSettings({}))).toEqual([released]);
    // By another path to the script, or with another timeout, it is still that line.
    expect(reported(settings({ type: 'command', command: 'node', args: ['node_modules/@spec-family/spec-harness/bin/spec-harness.js', 'hook', 'claude'], timeout: 90 }))).toEqual([released]);
  });

  it('notes an entry that gives the hook less time than a run of it is given, at which Claude Code cancels it, and none that gives as much or more', () => {
    const short = (timeout: unknown) => reported(settings({ ...HOOK, timeout }))[0]!.timeout;
    expect(short(10)).toBe(
      '"hook claude" in .claude/settings.json gives the hook 10 seconds under PreToolUse and 10 seconds under PostToolUse, less than the 45 a run of it is given, so Claude Code cancels a run that takes longer before it answers, and a write it would have held goes ahead: give the entry 60, as init writes it, or no timeout',
    );
    expect(short(44.5)).toContain('gives the hook 44.5 seconds under PreToolUse and 44.5 seconds under PostToolUse, less than the 45');
    // As much as a run is given, more, none at all, or one that is no number: nothing to say.
    for (const timeout of [45, 60, 600, undefined, '10', null]) expect(short(timeout), String(timeout)).toBeNull();
    // Each entry of the line is read: one under PreToolUse alone is named alone.
    const apart = { hooks: { PreToolUse: [{ matcher: GUARD.matcher, hooks: [{ ...HOOK, timeout: 5 }] }], PostToolUse: [{ matcher: GUARD.matcher, hooks: [HOOK] }] } };
    expect(reported(apart)[0]!.timeout).toContain('gives the hook 5 seconds under PreToolUse, less than the 45');
  });

  it('says a line with more on it as it is, and that it guards, with the root where the line gives one', () => {
    expect(reported(settings(exec('--root', PROJECT_DIR)))).toEqual([
      {
        file: FILE,
        events: BOTH,
        line: ['hook', 'claude', '--root', PROJECT_DIR],
        state: 'guards',
        onFailure: null,
        detail: '"hook claude --root ${CLAUDE_PROJECT_DIR}" in .claude/settings.json is more than init writes, and guards: the hook reads the line, and its root, /the/project, is a directory',
        ...EVERY,
        note: null,
        timeout: null,
      },
    ]);
    const said = (...rest: string[]) => reported(settings(exec(...rest)))[0];
    expect(said('--brief', '001', '--base', 'main')).toMatchObject({ state: 'guards', detail: '"hook claude --brief 001 --base main" in .claude/settings.json is more than init writes, and guards: the hook reads the line' });
    expect(said('extra', '--strict', '--format', 'json')).toMatchObject({ state: 'guards', detail: '"hook claude extra --strict --format json" in .claude/settings.json is more than init writes, and guards: the hook reads the line' });
    expect(said('--root', `${PROJECT_DIR}/packages/app`)).toMatchObject({ state: 'guards', detail: expect.stringContaining(', and its root, /the/project/packages/app, is a directory') });
    // An empty root is the directory the hook is started in.
    expect(said('--root', '')).toMatchObject({ state: 'guards', detail: '"hook claude --root \'\'" in .claude/settings.json is more than init writes, and guards: the hook reads the line, and its root, /the/project, is a directory' });
  });

  it('says a line the hook cannot read, and a root that is no directory, as a guard that is off, in the hook\'s words', () => {
    expect(reported(settings(exec('--format', 'xml')))).toEqual([
      {
        file: FILE,
        events: BOTH,
        line: ['hook', 'claude', '--format', 'xml'],
        state: 'off',
        onFailure: null,
        detail: `"hook claude --format xml" in .claude/settings.json: the hook's line cannot be read (--format must be pretty, json, gitlab, sarif or github, not "xml"), ${OFF}`,
        ...EVERY,
        note: null,
        timeout: null,
      },
    ]);
    expect(reported(settings(exec('--nope')))[0]).toMatchObject({ state: 'off', detail: expect.stringMatching(/^"hook claude --nope" in \.claude\/settings\.json: the hook's line cannot be read \(Unknown option '--nope'/) });
    expect(reported(settings(exec('--root')))[0]).toMatchObject({ state: 'off', detail: expect.stringContaining("(Option '--root <value>' argument missing), so the guard is off") });
    expect(reported(settings(exec('--root', '/nowhere')))[0]).toMatchObject({
      state: 'off',
      detail: `"hook claude --root /nowhere" in .claude/settings.json: --root is "/nowhere", which is not a directory, ${NO_ROOT}`,
    });
    // The root is the one Claude Code hands the hook: the placeholder filled with the project.
    expect(reported(settings(exec('--root', `${PROJECT_DIR}/nowhere`)))[0]).toMatchObject({
      state: 'off',
      detail: `"hook claude --root \${CLAUDE_PROJECT_DIR}/nowhere" in .claude/settings.json: --root is "/the/project/nowhere", which is not a directory, ${NO_ROOT}`,
    });
    // A variable no shell is there to fill is no directory.
    expect(reported(settings(exec('--root', '$CLAUDE_PROJECT_DIR')))[0]).toMatchObject({ state: 'off' });
  });

  it('hands the hook\'s reading the words Claude Code hands the hook: what follows the command, the project filled in', () => {
    const handed: (readonly string[])[] = [];
    reportHooks([{ file: FILE, settings: settings(exec('--root', `${PROJECT_DIR}/a`, '--brief', PROJECT_DIR, '--base', '${CLAUDE_PROJECT_DIR:-.}')) }], 'C:\\the project', (words) => {
      handed.push(words);
      return null;
    });
    expect(handed).toEqual([['hook', 'claude', '--root', 'C:\\the project/a', '--brief', 'C:\\the project', '--base', '${CLAUDE_PROJECT_DIR:-.}']]);
  });

  it('cannot tell what a shell hands the hook, and says how the line is written so that it can', () => {
    const written = `node "${SCRIPT}" hook claude --root "${PROJECT_DIR}"`;
    expect(reported(settings(shell(written)))).toEqual([
      {
        file: FILE,
        events: BOTH,
        line: ['hook', 'claude', '--root', '"${CLAUDE_PROJECT_DIR}"'],
        state: 'unknown',
        onFailure: null,
        detail:
          '"hook claude --root "${CLAUDE_PROJECT_DIR}"" in .claude/settings.json is a shell\'s to read before the hook is handed it, so what the hook does with it cannot be told here: written with "args", each word reaches the hook as it stands',
        ...EVERY,
        note: null,
        timeout: null,
      },
    ]);
    // Read as it stands it would be a root that is no directory, or a line that cannot be read: neither is said of it.
    expect(reported(settings(shell(`${LEGACY} --root "/nowhere"`)))[0]).toMatchObject({ state: 'unknown' });
    expect(reported(settings(shell(`${LEGACY} --format 'xml'`)))[0]).toMatchObject({ state: 'unknown' });
    // A shell's line that holds nothing a shell changes is read as written.
    expect(reported(settings(shell(`${LEGACY} --root /nowhere`)))[0]).toMatchObject({ state: 'off' });
    expect(reported(settings(shell(`${LEGACY} --brief 001`)))[0]).toMatchObject({ state: 'guards' });
  });

  it('reports no line that is not the hook\'s, whatever of the harness it runs', () => {
    for (const rest of [['hook', 'git'], ['guard', 'src/a.ts'], ['mcp', '--root', PROJECT_DIR], ['doctor'], ['hook'], [], ['hook', 'git', '--nope'], ['--nope']]) {
      expect(reported(settings({ type: 'command', command: 'node', args: [SCRIPT, ...rest] })), rest.join(' ')).toEqual([]);
    }
    expect(reported(settings(shell(`${LEGACY.replace('hook claude', 'hook git')} "$1"`)))).toEqual([]);
  });

  it('names the event of a line that stands under one alone, and every file that holds a line, in the order given', () => {
    const pre = { hooks: { PreToolUse: [{ hooks: [exec('--brief', '001')] }], PostToolUse: [{ hooks: [exec('--format', 'xml')] }] } };
    const user = '/home/p/.claude/settings.json';
    const all = reportHooks(
      [
        { file: user, settings: settings(HOOK) },
        { file: FILE, settings: pre },
        { file: '.claude/settings.local.json', settings: 'unreadable' },
      ],
      PROJECT,
      read,
    );
    expect(all.map((report) => [report.file, report.events, report.state])).toEqual([
      [user, BOTH, 'guards'],
      [FILE, ['PreToolUse'], 'guards'],
      [FILE, ['PostToolUse'], 'off'],
    ]);
    expect(all[1]?.detail).toBe('"hook claude --brief 001" in .claude/settings.json (under PreToolUse alone) is more than init writes, and guards: the hook reads the line');
    expect(all[2]?.detail?.startsWith('"hook claude --format xml" in .claude/settings.json (under PostToolUse alone): the hook\'s line cannot be read (')).toBe(true);
  });

  it('says what onFailure "block" changes: a write held when the hook does not start or runs past its timeout, and nothing for a line it says turns the guard off', () => {
    const HOLDS = 'sets onFailure to "block", so Claude Code 2.1.295 or later holds a write when the hook fails';
    expect(reported(settings({ ...HOOK, onFailure: 'block' }))).toEqual([
      {
        file: FILE,
        events: BOTH,
        line: ['hook', 'claude'],
        state: 'guards',
        onFailure: 'block',
        detail: null,
        ...EVERY,
        note: `"hook claude" in .claude/settings.json ${HOLDS}, where it lets the write go ahead without it: by not starting, as where the script on its line is not there, or by running past its timeout`,
        timeout: null,
      },
    ]);
    // The hook says such a line with exit 0, which is no failure: the field holds no write for it.
    expect(reported(settings({ ...exec('--root', '/nowhere'), onFailure: 'block' }))[0]).toMatchObject({
      state: 'off',
      onFailure: 'block',
      note: `"hook claude --root /nowhere" in .claude/settings.json ${HOLDS}, where it lets the write go ahead without it: by not starting, as where the script on its line is not there, or by running past its timeout`,
      timeout: null,
    });
    expect(reported(settings({ ...exec('--format', 'xml'), onFailure: 'block' }))[0]?.note).not.toContain('every write');
    // A line with more on it that guards is told as the line a release wrote is.
    expect(reported(settings({ ...exec('--brief', '001'), onFailure: 'block' }))[0]).toMatchObject({
      state: 'guards',
      note: expect.stringMatching(/^"hook claude --brief 001" in \.claude\/settings\.json sets onFailure to "block", .* where it lets the write go ahead without it: /),
      timeout: null,
    });
    // Under one event alone, the note names the event as the line's own sentence does.
    expect(reported({ hooks: { PreToolUse: [{ hooks: [{ ...HOOK, onFailure: 'block' }] }] } })[0]?.note?.startsWith('"hook claude" in .claude/settings.json (under PreToolUse alone) sets onFailure to "block", ')).toBe(true);
    expect(reported(settings({ ...shell(`${LEGACY} --root "$PWD"`), onFailure: 'block' }))[0]).toMatchObject({ state: 'unknown', onFailure: 'block', note: expect.stringContaining('where it lets the write go ahead without it') });
    // Any other value is Claude Code's default, or not one it reads.
    for (const value of ['continue', 'Block', true, undefined]) expect(reported(settings({ ...HOOK, onFailure: value }))[0], String(value)).toMatchObject({ onFailure: null, note: null, timeout: null });
  });

  it('advises onFailure "block" for a line that guards without it, where the Claude Code here reads the field', () => {
    const here = (hooks: unknown, where = FILE) => reportHooks([{ file: where, settings: hooks }], PROJECT, read, undefined, undefined, true);
    const ADVICE = `sets no onFailure, so Claude Code lets a write go ahead where the hook cannot start, as where the script on its line is not there, or runs past its timeout: where every Claude Code that reads the file is 2.1.295 or later, as the one here is, "onFailure": "block" holds the write instead, and `;
    // init's own entries, in the file init writes: the option that writes it.
    expect(here(settings(HOOK))).toEqual([
      { file: FILE, events: BOTH, line: ['hook', 'claude'], state: 'guards', onFailure: null, detail: null, ...EVERY, note: `${W} ${ADVICE}spec-harness init --write --block-on-failure writes it on these entries`, timeout: null },
    ]);
    // A line a person wrote, or init's in a file init does not write: theirs to give it.
    expect(here(settings(exec('--brief', '001')))[0]?.note).toBe(`"hook claude --brief 001" in .claude/settings.json ${ADVICE}it is written on each of its entries`);
    expect(here(settings(HOOK), '.claude/settings.local.json')[0]?.note).toBe(`"hook claude" in .claude/settings.local.json ${ADVICE}it is written on each of its entries`);
    expect(here(settings(shell(LEGACY)))[0]?.note).toBe(`${W} ${ADVICE}it is written on each of its entries`);
    // The same line by another node is one line, and not all init's: its entries are the person's to give the field.
    expect(here(settings(HOOK, { ...HOOK, command: '/usr/local/bin/node' }))).toEqual([expect.objectContaining({ note: `${W} ${ADVICE}it is written on each of its entries` })]);
    // Beside 0.1's entry, which names the harness otherwise and is a line of its own, init's line is all init's.
    expect(here(settings(HOOK, shell(LEGACY))).map((each) => each.note)).toEqual([`${W} ${ADVICE}spec-harness init --write --block-on-failure writes it on these entries`, `${W} ${ADVICE}it is written on each of its entries`]);
    // A line that sets it is said as before.
    expect(here(settings({ ...HOOK, onFailure: 'block' }))[0]?.note).toContain('sets onFailure to "block"');
    // Nothing for a line that is no guard: off, holding every write, waited on before no write, or one whose reading cannot be told.
    expect(here(settings(exec('--root', '/nowhere')))[0]).toMatchObject({ state: 'off', note: null, timeout: null });
    expect(here(both('Bash'))[0]).toMatchObject({ state: 'unstarted', note: null, timeout: null });
    expect(here(settings(shell(`${LEGACY} --root "$PWD"`)))[0]).toMatchObject({ state: 'unknown', note: null, timeout: null });
    const holding = reportHooks([{ file: FILE, settings: settings(exec('--brief', '404')) }], PROJECT, () => heldHookLine('the flag names brief 404'), undefined, undefined, true);
    expect(holding[0]).toMatchObject({ state: 'held', note: null, timeout: null });
    // And nothing where the Claude Code here does not read it, or cannot be told to.
    expect(reported(settings(HOOK))[0]?.note).toBeNull();
  });

  it('reads the field from Claude Code 2.1.295 on, as a release that was told', () => {
    expect(ON_FAILURE_SINCE).toBe('2.1.295');
    expect(readsOnFailure({ state: 'ok', version: '2.1.295' })).toBe(true);
    expect(readsOnFailure({ state: 'ok', version: '2.1.303', file: 'x' })).toBe(true);
    expect(readsOnFailure({ state: 'ok', version: '2.2.0' })).toBe(true);
    expect(readsOnFailure({ state: 'ok', version: '2.1.294' })).toBe(false);
    expect(readsOnFailure({ state: 'outdated', version: '2.0.0' })).toBe(false);
    expect(readsOnFailure({ state: 'unknown', reason: 'no claude is on PATH' })).toBe(false);
    expect(readsOnFailure(null)).toBe(false);
  });

  const W = '"hook claude" in .claude/settings.json';
  const group = (matcher: unknown, ...hooks: unknown[]) => (matcher === undefined ? { hooks } : { matcher, hooks });
  /** One entry under each event, in a group with the matcher given, or with none. */
  const both = (matcher: unknown, hook: unknown = HOOK) => ({ hooks: { PreToolUse: [group(matcher, hook)], PostToolUse: [group(matcher, hook)] } });
  /** The writing tools the one line of `hooks` is waited on before a write by, and started after one by. */
  const started = (hooks: unknown): unknown => {
    const [report] = reported(hooks);
    return [report?.before, report?.after];
  };

  it("reads a matcher as Claude Code's hooks reference has it: every tool, the tools it names, or a pattern anywhere in a name", () => {
    const cases: readonly (readonly [unknown, readonly string[] | null])[] = [
      // Left out, empty, or a star alone: every tool.
      [undefined, TOOLS],
      ['', TOOLS],
      ['*', TOOLS],
      // Letters, digits, _, -, spaces, commas and bars alone: the tools it names, exactly.
      ['Edit', ['Edit']],
      ['Write|Edit', ['Edit', 'Write']],
      ['Edit, Write ,NotebookEdit', ['Edit', 'Write', 'NotebookEdit']],
      ['Edit | Write', ['Edit', 'Write']],
      ['Edit|', ['Edit']],
      ['Edit|Write-2|x_y', ['Edit']],
      ['Bash', []],
      ['edit|write', []],
      ['Edit Write', []],
      // A name no supported Claude Code has a tool for adds none, and takes none away.
      ['Edit|Write|NotebookEdit', TOOLS],
      ['Edit|Write|MultiEdit|NotebookEdit', TOOLS],
      ['Write|MultiEdit', ['Write']],
      ['MultiEdit', []],
      // Any other character in it: a pattern, which may match anywhere in a name.
      ['Edit.*', ['Edit', 'NotebookEdit']],
      ['^Edit', ['Edit']],
      ['Edit$', ['Edit', 'NotebookEdit']],
      ['^(Edit|Write)$', ['Edit', 'Write']],
      ['^(Edit|Write|NotebookEdit)$', TOOLS],
      ['^Multi', []],
      ['.*', TOOLS],
      ['Notebook.', ['NotebookEdit']],
      ['^Bash$', []],
      // What the reference does not describe: a matcher that is neither text nor an array, or is no pattern.
      ['(', null],
      [7, null],
      [null, null],
      [{ tool: 'Edit' }, null],
    ];
    for (const [matcher, tools] of cases) expect(started(both(matcher)), JSON.stringify(matcher)).toEqual([tools, tools]);
  });

  it('is waited on before no write where its entry runs in the background, and cannot be told where the entry has an "if"', () => {
    expect(started(both(GUARD.matcher, { ...HOOK, async: true }))).toEqual([[], TOOLS]);
    expect(started(both(GUARD.matcher, { ...HOOK, asyncRewake: true }))).toEqual([[], TOOLS]);
    // Only true turns either on.
    expect(started(both(GUARD.matcher, { ...HOOK, async: 'true', asyncRewake: 1 }))).toEqual([TOOLS, TOOLS]);
    expect(started(both(GUARD.matcher, { ...HOOK, if: 'Edit(*.ts)' }))).toEqual([null, null]);
    // In the background it refuses nothing, whatever its rule matches.
    expect(started(both(GUARD.matcher, { ...HOOK, async: true, if: 'Edit(*.ts)' }))).toEqual([[], null]);
  });

  it('adds up the entries that hold one line, and cannot tell only where an entry that cannot be told might add a tool', () => {
    const split = { hooks: { PreToolUse: [group('Edit', HOOK), group('Write|MultiEdit|NotebookEdit', HOOK)], PostToolUse: [group('Write', HOOK), group('Bash', HOOK)] } };
    expect(started(split)).toEqual([TOOLS, ['Write']]);
    const conditional = { ...HOOK, if: 'Edit(*.ts)' };
    expect(started({ hooks: { PreToolUse: [GUARD, group(GUARD.matcher, conditional)], PostToolUse: [group('Edit', HOOK), group('Write', conditional)] } })).toEqual([TOOLS, null]);
  });

  it("reads each line by the entries that hold it, and by no other line's", () => {
    const longer = exec('--base', 'main');
    const two = { hooks: { PreToolUse: [group('Bash', HOOK), group(GUARD.matcher, longer)], PostToolUse: [group(GUARD.matcher, longer)] } };
    expect(reported(two).map((report) => [report.line.join(' '), report.state, report.before, report.after])).toEqual([
      ['hook claude', 'unstarted', [], []],
      ['hook claude --base main', 'guards', TOOLS, TOOLS],
    ]);
  });

  it('is not the guard where Claude Code waits on it before no write, and says what it stands under', () => {
    expect(reported({ hooks: { PostToolUse: [GUARD] } })).toEqual([
      {
        file: FILE,
        events: ['PostToolUse'],
        line: ['hook', 'claude'],
        state: 'unstarted',
        onFailure: null,
        detail: null,
        before: [],
        after: TOOLS,
        cover: `${W} (under PostToolUse alone): Claude Code waits on it before no write, so it is not the guard and refuses none (it stands under no PreToolUse)`,
        note: null,
        timeout: null,
      },
    ]);
    expect(reported(both('Bash'))[0]).toMatchObject({
      state: 'unstarted',
      detail: null,
      before: [],
      after: [],
      cover: `${W}: Claude Code waits on it before no write, so it is not the guard and refuses none (under PreToolUse it has the matcher "Bash"); it is started after no write, so it warns of none (under PostToolUse it has the matcher "Bash")`,
    });
    expect(reported(both(GUARD.matcher, { ...HOOK, async: true }))[0]).toMatchObject({
      state: 'unstarted',
      cover: `${W}: Claude Code waits on it before no write, so it is not the guard and refuses none (under PreToolUse it has the matcher "Edit|Write|MultiEdit|NotebookEdit" in the background)`,
    });
    // What the hook would do with such a line is not said: it is never asked before a write.
    expect(reported(both('Bash', exec('--root', PROJECT_DIR)))[0]).toMatchObject({ state: 'unstarted', detail: null });
    expect(reportHooks([{ file: FILE, settings: both('Bash', exec('--brief', '404')) }], PROJECT, () => heldHookLine('x'))[0]).toMatchObject({ state: 'unstarted', detail: null });
    // A line the hook cannot read is said as off all the same: the hook says so after every write it is started for.
    expect(reported({ hooks: { PostToolUse: [group(undefined, exec('--nope'))] } })[0]).toMatchObject({ state: 'off', before: [], after: TOOLS });
  });

  it('guards the writes Claude Code waits on it before, and says which it leaves unchecked', () => {
    expect(reported(both('Write|Edit'))[0]).toMatchObject({
      state: 'guards',
      detail: null,
      before: ['Edit', 'Write'],
      after: ['Edit', 'Write'],
      cover: `${W}: Claude Code waits on it before a write by Edit and Write, and before none by NotebookEdit, which goes unchecked (under PreToolUse it has the matcher "Write|Edit"); it is started after a write by Edit and Write alone (under PostToolUse it has the matcher "Write|Edit")`,
    });
    expect(reported(both('Edit'))[0]?.cover).toBe(
      `${W}: Claude Code waits on it before a write by Edit, and before none by Write and NotebookEdit, which goes unchecked (under PreToolUse it has the matcher "Edit"); it is started after a write by Edit alone (under PostToolUse it has the matcher "Edit")`,
    );
    expect(reported(both('Edit.*'))[0]?.cover).toBe(
      `${W}: Claude Code waits on it before a write by Edit and NotebookEdit, and before none by Write, which goes unchecked (under PreToolUse it has the matcher "Edit.*"); it is started after a write by Edit and NotebookEdit alone (under PostToolUse it has the matcher "Edit.*")`,
    );
    // Before every write and after none: only that is said.
    expect(reported({ hooks: { PreToolUse: [GUARD] } })[0]).toMatchObject({
      state: 'guards',
      detail: null,
      before: TOOLS,
      after: [],
      cover: `${W} (under PreToolUse alone): it is started after no write, so it warns of none (it stands under no PostToolUse)`,
    });
    // A line with more on it is said both ways: what the hook does with it, and which writes it is asked on.
    expect(reported(both('Edit', exec('--root', PROJECT_DIR)))[0]).toMatchObject({
      state: 'guards',
      detail: '"hook claude --root ${CLAUDE_PROJECT_DIR}" in .claude/settings.json is more than init writes, and guards: the hook reads the line, and its root, /the/project, is a directory',
      cover: expect.stringMatching(/^"hook claude --root \$\{CLAUDE_PROJECT_DIR\}" in \.claude\/settings\.json: Claude Code waits on it before a write by Edit, and before none by Write and NotebookEdit, /),
    });
  });

  it('names as unchecked only a tool a supported Claude Code can call: MultiEdit, which none has, is left unchecked by no line', () => {
    const every = { state: 'guards', detail: null, ...EVERY };
    // Edit, Write and NotebookEdit are every tool that writes: there is no more to say than of the matcher init writes.
    for (const matcher of ['Edit|Write|NotebookEdit', 'NotebookEdit, Write, Edit', '^(Edit|Write|NotebookEdit)$', GUARD.matcher]) expect(reported(both(matcher))[0], matcher).toMatchObject(every);
    // A matcher that names it beside others guards those, and the rest named are tools there are.
    expect(reported(both('Edit|Write|MultiEdit'))[0]).toMatchObject({
      state: 'guards',
      before: ['Edit', 'Write'],
      after: ['Edit', 'Write'],
      cover: `${W}: Claude Code waits on it before a write by Edit and Write, and before none by NotebookEdit, which goes unchecked (under PreToolUse it has the matcher "Edit|Write|MultiEdit"); it is started after a write by Edit and Write alone (under PostToolUse it has the matcher "Edit|Write|MultiEdit")`,
    });
    // Alone, it is a line Claude Code waits on before no write.
    expect(reported(both('MultiEdit'))[0]).toMatchObject({
      state: 'unstarted',
      before: [],
      after: [],
      cover: `${W}: Claude Code waits on it before no write, so it is not the guard and refuses none (under PreToolUse it has the matcher "MultiEdit"); it is started after no write, so it warns of none (under PostToolUse it has the matcher "MultiEdit")`,
    });
    // To init such a line is started for no write, whether its matcher names the tool or matches it: it writes its own beside it.
    for (const matcher of ['MultiEdit', '^MultiEdit$']) {
      const only = { matcher, hooks: [HOOK] };
      expect(mergeClaudeSettings({ hooks: { PreToolUse: [only], PostToolUse: [only] } }), matcher).toEqual({ hooks: { PreToolUse: [only, GUARD], PostToolUse: [only, GUARD] } });
    }
    // Whatever the matcher, the name stands in what is said only where the matcher itself is quoted.
    for (const matcher of ['Edit', 'Write|Edit', 'Bash', 'Edit.*', 'NotebookEdit', '^Write$', 7]) {
      const [report] = reported(both(matcher));
      expect([...(report?.before ?? []), ...(report?.after ?? [])], String(matcher)).not.toContain('MultiEdit');
      expect(report?.cover, String(matcher)).not.toContain('MultiEdit');
    }
  });

  it('cannot tell which writes a line is asked on where an entry has an "if" or a matcher the reference does not describe, and names each entry once', () => {
    const conditional = { ...HOOK, if: 'Edit(*.ts)' };
    expect(reported({ hooks: { PreToolUse: [group(undefined, conditional)] } })[0]).toMatchObject({
      state: 'unknown',
      detail: null,
      before: null,
      after: [],
      cover: `${W} (under PreToolUse alone): which writes Claude Code waits on it before cannot be told here (under PreToolUse it has no matcher with "if" "Edit(*.ts)"); it is started after no write, so it warns of none (it stands under no PostToolUse)`,
    });
    expect(reported(both(7))[0]).toMatchObject({
      state: 'unknown',
      cover: `${W}: which writes Claude Code waits on it before cannot be told here (under PreToolUse it has the matcher 7); which writes it is started after cannot be told here (under PostToolUse it has the matcher 7)`,
    });
    // With more on its line, nothing is said of what the hook does with it either: guards is not claimed.
    expect(reported(both(GUARD.matcher, { ...exec('--base', 'main'), if: 'Write' }))[0]).toMatchObject({ state: 'unknown', detail: null });
    const several = { hooks: { PreToolUse: [group('Bash', HOOK), group('Bash', HOOK), group('Read', { ...HOOK, asyncRewake: true }), group('Glob', HOOK)], PostToolUse: [GUARD] } };
    expect(reported(several)[0]?.cover).toBe(
      `${W}: Claude Code waits on it before no write, so it is not the guard and refuses none (under PreToolUse it has the matcher "Bash", the matcher "Read" in the background and the matcher "Glob")`,
    );
  });

  describe('a matcher the Claude Code on this machine reads otherwise (ADR-0005)', () => {
    const OLD: Matching = { as: 'older', release: '2.1.190' };
    const UNTOLD: Matching = { as: 'untold' };
    /** A release that reads a comma as the reference has it today, and a hyphen as one before 2.1.195 did. */
    const R194: Matching = { as: 'older', release: '2.1.194' };
    const under = (hooks: unknown, matching: Matching, pattern?: PatternReader) => reportHooks([{ file: FILE, settings: hooks }], PROJECT, read, pattern, matching);
    /** The writing tools the one line of `hooks` is waited on before a write by and started after one by, under a reading of a matcher of names. */
    const startedUnder = (hooks: unknown, matching: Matching): unknown => {
      const [report] = under(hooks, matching);
      return [report?.before, report?.after];
    };

    it("takes the reading of a matcher of names from the release doctor asked: today's from 2.1.195 on, the release's own before it, untold where the release is", () => {
      expect(COMMA_SINCE).toBe('2.1.191');
      expect(HYPHEN_SINCE).toBe('2.1.195');
      const today: Matching = { as: 'today' };
      for (const version of ['2.1.195', '2.1.300', '2.2.0', '3.0.0']) expect(matchingUnder({ state: 'ok', version }), version).toEqual(today);
      expect(matchingUnder({ state: 'ok', version: '2.2.0', file: '/p/package.json' })).toEqual(today);
      for (const version of ['2.1.194', '2.1.191', '2.1.190', '2.1.139', '2.1.195-beta.1']) expect(matchingUnder({ state: 'ok', version }), version).toEqual({ as: 'older', release: version });
      // A release too old for the hooks is older than this one too.
      expect(matchingUnder({ state: 'outdated', version: '2.1.100' })).toEqual({ as: 'older', release: '2.1.100' });
      expect(matchingUnder({ state: 'unknown', reason: 'no claude is on PATH' })).toEqual(UNTOLD);
      expect(matchingUnder(null)).toEqual(UNTOLD);
    });

    it('reads a comma as a separator from 2.1.191 on, before 2.1.195 too, and as part of a pattern on a prerelease of 2.1.191', () => {
      for (const matching of [R194, { as: 'older', release: '2.1.191' } satisfies Matching]) {
        expect(under(both('Edit, Write'), matching), matching.release).toEqual(reported(both('Edit, Write')));
      }
      expect(startedUnder(both('Edit, Write'), { as: 'older', release: '2.1.191-beta.1' })).toEqual([[], []]);
    });

    it('cannot tell under names with a hyphen on a release older than 2.1.195, where the readings its changelog leaves open differ, and says why', () => {
      // The changelog has a hyphenated name match as a substring before 2.1.195, and not how the rest of the matcher was read: the names exactly, a pattern, or its whole text, which is in no tool's name.
      const hyphen = 'Edit|Write|my-tool';
      const older = (release: string): string =>
        `, which Claude Code ${release} may read otherwise: before 2.1.195 a matcher with a hyphenated name in it matched as a substring, and Claude Code's changelog does not say how the rest of it was read; from 2.1.195 on it is Edit and Write`;
      for (const [matching, release] of [[R194, '2.1.194'], [OLD, '2.1.190']] as const) {
        expect(under(both(hyphen), matching)[0], release).toMatchObject({
          state: 'unknown',
          before: null,
          after: null,
          cover: `${W}: which writes Claude Code waits on it before cannot be told here (under PreToolUse it has the matcher "${hyphen}"${older(release)}); which writes it is started after cannot be told here (under PostToolUse it has the matcher "${hyphen}"${older(release)})`,
        });
      }
      // Every name that writes, beside a hyphenated one: the whole text is in no tool's name, so it is not told either.
      for (const matcher of ['Edit|Write|NotebookEdit|my-tool', 'Notebook|my-tool']) expect(startedUnder(both(matcher), R194), matcher).toEqual([null, null]);
      // From 2.1.195 on, and for a caller that asked none, the names as listed, with nothing said of the release.
      for (const matching of [{ as: 'today' } satisfies Matching, undefined]) {
        const [report] = reportHooks([{ file: FILE, settings: both(hyphen) }], PROJECT, read, undefined, matching);
        expect(report).toMatchObject({ state: 'guards', before: ['Edit', 'Write'], after: ['Edit', 'Write'] });
        expect(report?.cover).not.toContain('2.1.195');
      }
      expect(under(both(hyphen), UNTOLD)[0]).toMatchObject({ state: 'unknown', before: null, after: null });
      expect(under(both(hyphen), UNTOLD)[0]?.cover).toContain(
        ", which is Edit and Write from Claude Code 2.1.195 on, and may be read otherwise before it, where a matcher with a hyphenated name in it matched as a substring, and Claude Code's changelog does not say how the rest of it was read: the release here cannot be told)",
      );
      // No tool that writes under any reading: nothing turns on the release, and nothing is said.
      for (const matching of [R194, OLD, UNTOLD]) {
        for (const matcher of ['Bash|my-tool', 'mcp__brave-search', 'my-tool', 'code-reviewer|Bash', '-']) expect(under(both(matcher), matching), matcher).toEqual(reported(both(matcher)));
      }
      // A reading that runs out its budget is one that cannot be told, under a hyphen as under any pattern.
      expect(under(both('Bash|my-tool'), R194, patternReader(() => null))[0]).toMatchObject({ state: 'unknown', before: null, after: null });
    });

    it('reads a comma beside a hyphen by the comma before 2.1.191, by the hyphen from it to 2.1.195, and says both where the release cannot be told', () => {
      const mixed = 'Edit, Write, my-tool';
      expect(under(both(mixed), OLD)[0]).toMatchObject({ state: 'unstarted', before: [], after: [] });
      expect(under(both(mixed), OLD)[0]?.cover).toContain(', which Claude Code 2.1.190 reads as a pattern that matches no tool: a comma separates names from 2.1.191 on, where the matcher is Edit and Write)');
      expect(under(both(mixed), R194)[0]).toMatchObject({ state: 'unknown', before: null, after: null });
      expect(under(both(mixed), R194)[0]?.cover).toContain(", which Claude Code 2.1.194 may read otherwise: before 2.1.195 a matcher with a hyphenated name in it matched as a substring, and Claude Code's changelog does not say how the rest of it was read; from 2.1.195 on it is Edit and Write)");
      expect(under(both(mixed), UNTOLD)[0]?.cover).toContain(
        ", which is Edit and Write from Claude Code 2.1.195 on, and may be read otherwise before it, where a matcher with a hyphenated name in it matched as a substring, and Claude Code's changelog does not say how the rest of it was read, and before 2.1.191 a pattern that matches no tool, where a comma separated no names: the release here cannot be told)",
      );
      // And init writes no hook beside a line whose writes cannot be told, and its own beside one started for none.
      expect(mergeClaudeSettings(both('Edit|Write|my-tool'), undefined, undefined, R194)).toBeNull();
      expect(mergeClaudeSettings(both('Edit|Write|my-tool'), undefined, undefined, { as: 'today' })).toBeNull();
      expect(mergeClaudeSettings(both(mixed), undefined, undefined, OLD)).not.toBeNull();
    });

    it('is waited on before no write under names with a comma on a release older than 2.1.191, said with the release and what the matcher is from 2.1.191', () => {
      const aside = ', which Claude Code 2.1.190 reads as a pattern that matches no tool: a comma separates names from 2.1.191 on, where the matcher is Edit and Write';
      expect(under(both('Edit, Write'), OLD)).toEqual([
        {
          file: FILE,
          events: BOTH,
          line: ['hook', 'claude'],
          state: 'unstarted',
          onFailure: null,
          detail: null,
          before: [],
          after: [],
          cover: `${W}: Claude Code waits on it before no write, so it is not the guard and refuses none (under PreToolUse it has the matcher "Edit, Write"${aside}); it is started after no write, so it warns of none (under PostToolUse it has the matcher "Edit, Write"${aside})`,
          note: null,
          timeout: null,
        },
      ]);
      for (const matcher of ['Edit,Write', 'Edit, Write ,NotebookEdit', 'Edit, Write, MultiEdit, NotebookEdit', 'NotebookEdit,', ',Edit']) expect(startedUnder(both(matcher), OLD), matcher).toEqual([[], []]);
      expect(under(both('Edit,Write,NotebookEdit'), OLD)[0]?.cover).toContain('where the matcher is Edit, Write and NotebookEdit)');
      // The same release reads a matcher with no comma as every release does, and a pattern as the pattern it is, a comma in it or not.
      const same: readonly (readonly [unknown, readonly string[] | null])[] = [
        [undefined, TOOLS],
        ['', TOOLS],
        ['*', TOOLS],
        ['Edit|Write', ['Edit', 'Write']],
        ['Edit | Write', ['Edit', 'Write']],
        [GUARD.matcher, TOOLS],
        ['Bash', []],
        ['^(Edit|Write),?$', ['Edit', 'Write']],
        ['Edit.*', ['Edit', 'NotebookEdit']],
        ['(', null],
        [7, null],
        [null, null],
      ];
      for (const matching of [OLD, R194, UNTOLD]) {
        for (const [matcher, tools] of same) {
          expect(startedUnder(both(matcher), matching), JSON.stringify(matcher)).toEqual([tools, tools]);
          // And nothing is said of it that is not said under the newest release: its state, and every word.
          expect(under(both(matcher), matching), JSON.stringify(matcher)).toEqual(reported(both(matcher)));
        }
      }
      // An entry beside it that names a tool without a comma still guards that tool.
      const two = { hooks: { PreToolUse: [group('Edit,Write', HOOK), group('NotebookEdit', HOOK)], PostToolUse: [GUARD] } };
      expect(under(two, OLD)[0]).toMatchObject({ state: 'guards', before: ['NotebookEdit'], after: TOOLS });
      // A release from 2.1.191 on, and a caller that asked none, read the comma as the reference has it today, with nothing more to say.
      for (const matching of [{ as: 'today' } satisfies Matching, R194, undefined]) {
        const [report] = reportHooks([{ file: FILE, settings: both('Edit, Write') }], PROJECT, read, undefined, matching);
        expect(report).toMatchObject({ state: 'guards', before: ['Edit', 'Write'], after: ['Edit', 'Write'] });
        expect(report?.cover).toBe(reported(both('Edit, Write'))[0]?.cover);
        expect(report?.cover).not.toContain('2.1.191');
      }
    });

    it('cannot tell where the release cannot be told and the two readings differ, and says both; where both come to no tool that writes there is nothing to tell', () => {
      const aside = ', which is Edit and Write from Claude Code 2.1.191 on, where a comma separates names, and a pattern that matches no tool before it: the release here cannot be told';
      expect(under(both('Edit, Write'), UNTOLD)[0]).toMatchObject({
        state: 'unknown',
        detail: null,
        before: null,
        after: null,
        cover: `${W}: which writes Claude Code waits on it before cannot be told here (under PreToolUse it has the matcher "Edit, Write"${aside}); which writes it is started after cannot be told here (under PostToolUse it has the matcher "Edit, Write"${aside})`,
      });
      // No tool that writes either way: no release makes it a guard, and none is named.
      for (const matching of [OLD, UNTOLD]) {
        for (const matcher of ['Bash,PowerShell', 'Bash, Read', ',', 'MultiEdit, Bash']) {
          expect(under(both(matcher), matching)[0], matcher).toMatchObject({
            state: 'unstarted',
            before: [],
            after: [],
            cover: `${W}: Claude Code waits on it before no write, so it is not the guard and refuses none (under PreToolUse it has the matcher ${JSON.stringify(matcher)}); it is started after no write, so it warns of none (under PostToolUse it has the matcher ${JSON.stringify(matcher)})`,
          });
        }
      }
    });

    it('cannot tell under names with a comma and a bar where read as a pattern they match a tool: the page says such a matcher never matched, and a pattern would', () => {
      // Read as a pattern, "Edit" stands alone before the bar, and is in NotebookEdit as well.
      const mixed = 'Edit|Write, NotebookEdit';
      const old = ', which Claude Code 2.1.190 reads as a pattern whose matches its documentation does not give: a comma separates names from 2.1.191 on, where the matcher is Edit, Write and NotebookEdit';
      expect(under(both(mixed), OLD)[0]).toMatchObject({
        state: 'unknown',
        before: null,
        after: null,
        cover: `${W}: which writes Claude Code waits on it before cannot be told here (under PreToolUse it has the matcher "${mixed}"${old}); which writes it is started after cannot be told here (under PostToolUse it has the matcher "${mixed}"${old})`,
      });
      expect(under(both(mixed), UNTOLD)[0]?.cover).toContain(
        ', which is Edit, Write and NotebookEdit from Claude Code 2.1.191 on, where a comma separates names, and a pattern whose matches its documentation does not give before it: the release here cannot be told)',
      );
      // Names that list no tool that writes, where a part of one is in a tool's name: said as no tool from 2.1.191, and not told before it.
      const part = 'Bash,X|dit';
      expect(reported(both(part))[0]).toMatchObject({ state: 'unstarted', before: [], after: [] });
      expect(under(both(part), OLD)[0]).toMatchObject({ state: 'unknown', before: null });
      expect(under(both(part), OLD)[0]?.cover).toContain('a comma separates names from 2.1.191 on, where the matcher is no tool that writes)');
      expect(under(both(part), UNTOLD)[0]?.cover).toContain(', which is no tool that writes from Claude Code 2.1.191 on, where a comma separates names, and a pattern whose matches');
      // A reading that runs out its budget is one that cannot be told, for this pattern as for any.
      const spent = (): PatternReader => patternReader(() => null);
      expect(under(both('Edit, Write'), OLD, spent())[0]).toMatchObject({ state: 'unknown', before: null, after: null });
      expect(under(both('Bash, Read'), UNTOLD, spent())[0]).toMatchObject({ state: 'unknown', before: null, after: null });
    });

    it('has init write its hooks beside a line the release here starts for no write, and none beside one it may start', () => {
      const own = both('Edit, Write');
      const added = { hooks: { PreToolUse: [group('Edit, Write', HOOK), GUARD], PostToolUse: [group('Edit, Write', HOOK), GUARD] } };
      expect(mergeClaudeSettings(own)).toBeNull();
      expect(mergeClaudeSettings(own, undefined, undefined, { as: 'today' })).toBeNull();
      expect(mergeClaudeSettings(own, undefined, undefined, R194)).toBeNull();
      expect(mergeClaudeSettings(own, undefined, undefined, UNTOLD)).toBeNull();
      expect(mergeClaudeSettings(own, undefined, undefined, OLD)).toEqual(added);
      // A line a person wrote, known by the hook's own reading: the same.
      const longer = exec('--base', 'main');
      const theirs = both('Edit, Write', longer);
      const isHook = (words: readonly string[]): boolean => read(words) !== null;
      expect(mergeClaudeSettings(theirs, isHook, undefined, UNTOLD)).toBeNull();
      expect(mergeClaudeSettings(theirs, isHook, undefined, OLD)).toEqual({ hooks: { PreToolUse: [group('Edit, Write', longer), GUARD], PostToolUse: [group('Edit, Write', longer), GUARD] } });
    });

    it('is started for no write under an array, which Claude Code lists as an invalid setting, and says so of the entry', () => {
      const after = { hooks: { PreToolUse: [GUARD], PostToolUse: [group(['Edit', 'Write'], HOOK)] } };
      expect(reported(after)).toEqual([
        {
          file: FILE,
          events: BOTH,
          line: ['hook', 'claude'],
          state: 'guards',
          onFailure: null,
          detail: null,
          before: TOOLS,
          after: [],
          cover: `${W}: it is started after no write, so it warns of none (under PostToolUse it has the matcher ["Edit","Write"], an array, which Claude Code lists as an invalid setting and loads no hook under)`,
          note: null,
          timeout: null,
        },
      ]);
      // An entry beside it under the same event is started as its own matcher has it.
      expect(started({ hooks: { PreToolUse: [GUARD], PostToolUse: [group(['Edit'], HOOK), group('Write', HOOK)] } })).toEqual([TOOLS, ['Write']]);
      // init completes its own line under the event, where the entry under the array is started for nothing.
      expect(mergeClaudeSettings(after)).toEqual({ hooks: { PreToolUse: [GUARD], PostToolUse: [group(['Edit', 'Write'], HOOK), GUARD] } });
    });

    it('finds the array that keeps a file\'s hooks from loading: under PreToolUse or PermissionRequest, and under no other event', () => {
      const other = { type: 'command', command: '/usr/local/bin/lint-check.sh' };
      expect(arrayMatcher({ hooks: { PreToolUse: [GUARD, group(['Bash'], other)] } })).toEqual({ event: 'PreToolUse', matcher: '["Bash"]' });
      expect(arrayMatcher({ hooks: { PermissionRequest: [group(['Bash', 7], other)] } })).toEqual({ event: 'PermissionRequest', matcher: '["Bash",7]' });
      expect(arrayMatcher({ hooks: { PreToolUse: [group([], HOOK)] } })).toEqual({ event: 'PreToolUse', matcher: '[]' });
      // The first of them, PreToolUse before PermissionRequest, whatever order the file has the events in.
      expect(arrayMatcher({ hooks: { PermissionRequest: [group(['a'], other)], PreToolUse: [group('Bash', other), group(['b'], other), group(['c'], other)] } })).toEqual({ event: 'PreToolUse', matcher: '["b"]' });
      // An array under any other event unloads nothing beside it, and a matcher that is anything else is no array.
      for (const hooks of [
        { PostToolUse: [group(['Edit'], HOOK)], Stop: [group(['x'], other)], SessionStart: [group(['startup'], other)] },
        { PreToolUse: [GUARD, group('Bash', other), group(undefined, other), group(7, other), group({ 0: 'Edit' }, other), group(null, other)] },
        { PreToolUse: 'Edit', PermissionRequest: { matcher: ['Edit'] } },
        { PreToolUse: [null, 'x', ['matcher']] },
        {},
      ]) {
        expect(arrayMatcher({ hooks }), JSON.stringify(hooks)).toBeNull();
      }
      for (const settings of [null, 'unreadable', {}, { hooks: 7 }, { hooks: [] }, { PreToolUse: [group(['Bash'], other)] }]) expect(arrayMatcher(settings), JSON.stringify(settings)).toBeNull();
      expect(describeArrayMatcher('a/settings.json', { event: 'PermissionRequest', matcher: '["Bash"]' })).toBe(
        'a/settings.json has an array for a matcher under PermissionRequest, ["Bash"], which Claude Code lists as an invalid setting, and beside one under PreToolUse or PermissionRequest it loads none of the file\'s other hooks',
      );
      expect(ONE_STRING).toBe('write the matcher as one string, its names between "|"');
    });

    it('says every line of the hook in such a file as one Claude Code does not start, and as a guard that is off where it stood to be started for a write', () => {
      const other = { type: 'command', command: '/usr/local/bin/lint-check.sh' };
      const array = (event: string): string => `${FILE} has an array for a matcher under ${event}, ["Bash"], which Claude Code lists as an invalid setting, and beside one under PreToolUse or PermissionRequest it loads none of the file's other hooks`;
      const off = (event: string): string => `${W}: ${array(event)}, so the guard is off and no write is checked; write the matcher as one string, its names between "|"`;
      expect(reported({ hooks: { PreToolUse: [GUARD, group(['Bash'], other)], PostToolUse: [GUARD] } })).toEqual([
        { file: FILE, events: BOTH, line: ['hook', 'claude'], state: 'off', onFailure: null, detail: off('PreToolUse'), before: [], after: [], cover: null, note: null, timeout: null },
      ]);
      expect(reported({ hooks: { PreToolUse: [GUARD], PostToolUse: [GUARD], PermissionRequest: [group(['Bash'], other)] } })[0]).toMatchObject({ state: 'off', detail: off('PermissionRequest'), before: [], after: [] });
      // The hook's own entry under an array: whatever the array holds, someone meant a matcher by it.
      for (const matcher of [['Edit', 'Write'], ['Bash'], []]) {
        expect(reported(both(matcher))[0], JSON.stringify(matcher)).toMatchObject({ state: 'off', before: [], after: [], cover: null, detail: expect.stringContaining(`under PreToolUse, ${JSON.stringify(matcher)}, which Claude Code lists as an invalid setting`) });
      }
      // One entry of the line under an array is enough, beside one under a matcher that starts it for nothing.
      expect(reported({ hooks: { PreToolUse: [group(['Edit'], HOOK), group('Bash', HOOK)] } })[0]).toMatchObject({ state: 'off', before: [], after: [] });
      // Started before a write alone, or after one alone, it stood to be started: the guard that refuses, or the one that warns.
      expect(reported({ hooks: { PreToolUse: [GUARD], PermissionRequest: [group(['Bash'], other)] } })[0]).toMatchObject({ state: 'off', events: ['PreToolUse'] });
      expect(reported({ hooks: { PreToolUse: [group(['Bash'], other)], PostToolUse: [GUARD] } })[0]).toMatchObject({ state: 'off', events: ['PostToolUse'], detail: expect.stringMatching(/^"hook claude" in \.claude\/settings\.json \(under PostToolUse alone\): /) });
      // Where which writes it stood to be started for cannot be told, it is taken as started, as everywhere.
      expect(reported({ hooks: { PreToolUse: [group(GUARD.matcher, { ...HOOK, if: 'Edit(*.ts)' }), group(['Bash'], other)] } })[0]).toMatchObject({ state: 'off' });
      // A line that stood to be started for no write is no guard switched off: it is said, and fails nothing.
      expect(reported({ hooks: { PreToolUse: [group('Bash', HOOK), group(['Bash'], other)], PostToolUse: [group('Bash', HOOK)] } })).toEqual([
        {
          file: FILE,
          events: BOTH,
          line: ['hook', 'claude'],
          state: 'unstarted',
          onFailure: null,
          detail: `${W}: ${array('PreToolUse')}: the line is not started, and stood to be started for no write as it is, so no guard is switched off`,
          before: [],
          after: [],
          cover: null,
          note: null,
          timeout: null,
        },
      ]);
      // Whatever the hook would do with the line, and whatever its entry holds: it is never started, so that is what is said, and onFailure changes nothing.
      const held = { hooks: { PreToolUse: [group(GUARD.matcher, exec('--nope'), { ...exec('--brief', '404'), onFailure: 'block' }, shell(`${LEGACY} --root "$PWD"`), { command: 'node', args: [SCRIPT, 'hook', 'claude', '--base', 'x'] }), group(['Bash'], other)] } };
      const said = reportHooks([{ file: FILE, settings: held }], PROJECT, (words) => (words.includes('404') ? heldHookLine('x') : read(words)));
      expect(said.map((report) => [report.state, report.onFailure, report.note, report.cover, report.detail?.includes(array('PreToolUse'))])).toEqual([
        ['off', null, null, null, true],
        ['off', 'block', null, null, true],
        ['off', null, null, null, true],
        ['off', null, null, null, true],
      ]);
      // Another file's hooks are loaded as that file has them.
      const two = reportHooks([{ file: 'user', settings: { hooks: { PreToolUse: [group(['Bash'], other)] } } }, { file: FILE, settings: settings(HOOK) }, { file: 'local', settings: { hooks: { PreToolUse: [GUARD, group(['x'], other)] } } }], PROJECT, read);
      expect(two.map((report) => [report.file, report.state])).toEqual([
        [FILE, 'guards'],
        ['local', 'off'],
      ]);
    });
  });

  it('says a line under a brief that is not one as holding every write, in the words for the name', () => {
    const wrong = 'the flag names brief 404, and spec-brief knows no such brief';
    const held = (hooks: unknown) => reportHooks([{ file: FILE, settings: hooks }], PROJECT, () => heldHookLine(wrong));
    expect(held(settings(exec('--brief', '404')))).toEqual([
      {
        file: FILE,
        events: BOTH,
        line: ['hook', 'claude', '--brief', '404'],
        state: 'held',
        onFailure: null,
        detail: `"hook claude --brief 404" in .claude/settings.json: ${wrong}, so the hook holds every write until the line is mended: name a brief spec-brief lists, or take --brief off the line`,
        ...EVERY,
        note: null,
        timeout: null,
      },
    ]);
    // The hook holds the write itself there, so onFailure adds what it adds to a line that guards.
    expect(held(settings({ ...exec('--brief', '404'), onFailure: 'block' }))[0]).toMatchObject({ state: 'held', note: expect.stringContaining('where it lets the write go ahead without it') });
    // Where the writes it is asked on cannot be told, those it is asked on are held: that is said.
    expect(held(both(GUARD.matcher, { ...exec('--brief', '404'), if: 'Edit(*.ts)' }))[0]).toMatchObject({ state: 'held', before: null });
    // A shell's line is the shell's to read first, as it was.
    expect(held(settings(shell(`${LEGACY} --brief "404"`)))[0]).toMatchObject({ state: 'unknown', detail: expect.stringContaining("is a shell's to read") });
  });

  it("hands a caller the words of every line of the harness's, as the hook's reading is handed them", () => {
    const sources = [
      { file: 'a', settings: settings(exec('--root', PROJECT_DIR), { type: 'command', command: 'node', args: [SCRIPT, 'hook', 'git'] }) },
      { file: 'b', settings: 'unreadable' },
      { file: 'c', settings: { hooks: { PostToolUse: [GUARD] } } },
    ];
    expect(handedLines(sources, '/p')).toEqual([
      ['hook', 'claude', '--root', '/p'],
      ['hook', 'git'],
      ['hook', 'claude'],
    ]);
  });

  it('takes a line as started for a write unless it is waited on for none', () => {
    expect([isStarted(null), isStarted(['Edit']), isStarted([])]).toEqual([true, true, false]);
  });

  it('reads a pattern once in a run, for every entry under it, in what doctor says of the files and in what init writes', () => {
    const asked: string[] = [];
    // What a pattern matches is the reader's to say here: one matches Edit alone, the other cannot be told.
    const pattern = patternReader((source) => {
      asked.push(source);
      return source === 'E.*t$' ? ['Edit'] : null;
    });
    const longer = exec('--base', 'main');
    const held = {
      hooks: {
        PreToolUse: [group('E.*t$', HOOK), group('E.*t$', HOOK), group('^(a+)+$', longer), group('E.*t$', longer)],
        PostToolUse: [group('E.*t$', HOOK), group('^(a+)+$', longer)],
      },
    };
    const said = reportHooks([{ file: FILE, settings: held }, { file: 'other', settings: held }], PROJECT, read, pattern);
    expect(said.map((report) => [report.file, report.line.join(' '), report.before, report.after])).toEqual([
      [FILE, 'hook claude', ['Edit'], ['Edit']],
      [FILE, 'hook claude --base main', null, null],
      ['other', 'hook claude', ['Edit'], ['Edit']],
      ['other', 'hook claude --base main', null, null],
    ]);
    // A person's line that is started: init writes none beside it, by the same readings.
    expect(mergeClaudeSettings(held, (words) => read(words) !== null, pattern)).toBeNull();
    // Twelve entries in two files, and the first of them again for init: each pattern was read once, the one that cannot be told as well.
    expect(asked).toEqual(['E.*t$', '^(a+)+$']);
  });

  it('keeps a reading for its run alone, and reads no pattern where the matcher is none or the entry is waited on whatever it matches', () => {
    const asked: string[] = [];
    const write = (source: string): string[] => {
      asked.push(source);
      return ['Write'];
    };
    const held = both('W.*');
    // A run has a reader of its own: what one run read, the next reads again.
    for (const pattern of [patternReader(write), patternReader(write)]) {
      expect(reportHooks([{ file: FILE, settings: held }], PROJECT, read, pattern)[0]).toMatchObject({ state: 'guards', before: ['Write'], after: ['Write'] });
    }
    expect(asked).toEqual(['W.*', 'W.*']);
    // Names, a matcher left out, an entry in the background before a write and one under an "if" are answered without a reading, as they were.
    const none = patternReader(() => {
      throw new Error('there is no pattern to read');
    });
    const plain = {
      hooks: {
        PreToolUse: [group('Edit|Write', HOOK), group(undefined, HOOK), group('W.*', { ...HOOK, async: true })],
        PostToolUse: [group('*', HOOK), group('W.*', { ...HOOK, if: 'Write(*.ts)' })],
      },
    };
    expect(reportHooks([{ file: FILE, settings: plain }], PROJECT, read, none)[0]).toMatchObject({ state: 'guards', before: TOOLS, after: TOOLS });
    expect(mergeClaudeSettings(plain, undefined, none)).toBeNull();
  });

  it('takes what a pattern matches from the reader it is handed, for its own line and for a line a person wrote', () => {
    // Read here as matching no tool that writes, where a reading of its own would find Write: init then writes its hooks beside the line.
    const idle = (): PatternReader => patternReader(() => []);
    const own = both('W.*');
    expect(mergeClaudeSettings(own)).toBeNull();
    expect(mergeClaudeSettings(own, undefined, idle())).toEqual({ hooks: { PreToolUse: [group('W.*', HOOK), GUARD], PostToolUse: [group('W.*', HOOK), GUARD] } });
    const theirs = both('W.*', exec('--base', 'main'));
    const isHook = (words: readonly string[]): boolean => read(words) !== null;
    expect(mergeClaudeSettings(theirs, isHook)).toBeNull();
    expect(mergeClaudeSettings(theirs, isHook, idle())).toEqual({ hooks: { PreToolUse: [group('W.*', exec('--base', 'main')), GUARD], PostToolUse: [group('W.*', exec('--base', 'main')), GUARD] } });
  });

  // Last in the file: it takes the budget, a tenth of a second, each time it
  // runs, and a sweep stops a mutant's tests at the first that fails.
  it('cannot tell from a pattern whose reading runs out its budget, and comes back at it', () => {
    // Five stars, each around the last: testing a tool's name against it does not end.
    const slow = '^((((([A-Za-z]*)*)*)*)*)*$X';
    const held = { hooks: { PreToolUse: [group(slow, HOOK)], PostToolUse: [GUARD] } };
    // A bound of the test's own around the whole reading. Were the reading's
    // taken away, this stops it after two seconds and the test fails, where
    // it would otherwise not come back at all.
    const found: unknown[] = runInNewContext('read()', { read: () => reported(held) }, { timeout: 2000 });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      state: 'unknown',
      detail: null,
      before: null,
      after: TOOLS,
      cover: `${W}: which writes Claude Code waits on it before cannot be told here (under PreToolUse it has the matcher ${JSON.stringify(slow)})`,
    });
  });
});

describe('the entry as a session starts (ADR-0012)', () => {
  const START = { hooks: [HOOK] };
  const isHook = (words: readonly string[]): boolean => claudeHookLine(words, parseOptions, '/p', () => true) !== null;
  // The two init writes into empty settings, which a test above holds mergeClaudeSettings to, written
  // out: merged here, a mutant of the merge that throws would stop this file loading, not fail a test.
  const two: Record<string, unknown> & { hooks: Record<string, unknown> } = { hooks: { PreToolUse: [GUARD], PostToolUse: [GUARD] } };

  it('is added beside init\'s two lines, after what stands under the event, and to nothing else', () => {
    expect(withSessionStart(two, isHook)).toEqual({ hooks: { ...two.hooks, SessionStart: [START] } });
    const other = { hooks: [{ type: 'command', command: 'echo started' }] };
    expect(withSessionStart({ model: 'x', hooks: { ...two.hooks, SessionStart: [other] } }, isHook)).toEqual({ model: 'x', hooks: { ...two.hooks, SessionStart: [other, START] } });
    expect(withSessionStart({ hooks: { ...two.hooks, SessionStart: 'x' } }, isHook)).toEqual({ hooks: { ...two.hooks, SessionStart: [START] } });
    // Where init's line does not stand under both events, init has a file to complete first, or one it writes no hook into.
    expect(withSessionStart({}, isHook)).toBeNull();
    expect(withSessionStart({ hooks: null }, isHook)).toBeNull();
    expect(withSessionStart({ hooks: { PreToolUse: two.hooks['PreToolUse'] } }, isHook)).toBeNull();
    expect(withSessionStart({ hooks: { PostToolUse: two.hooks['PostToolUse'] } }, isHook)).toBeNull();
    const theirs = { matcher: 'Edit|Write|MultiEdit|NotebookEdit', hooks: [{ ...HOOK, args: [...HOOK.args, '--root', PROJECT_DIR] }] };
    expect(withSessionStart({ hooks: { PreToolUse: [theirs], PostToolUse: [theirs] } }, isHook)).toBeNull();
    // And it is a copy: the line written is not init's own to change.
    const added = withSessionStart(two, isHook) as { hooks: { SessionStart: { hooks: { args: string[] }[] }[] } };
    added.hooks.SessionStart[0]?.hooks[0]?.args.push('--x');
    expect(withSessionStart(two, isHook)).toEqual({ hooks: { ...two.hooks, SessionStart: [START] } });
  });

  it('is not added where a line of the hook stands under the event already, init\'s or a person\'s', () => {
    expect(withSessionStart({ hooks: { ...two.hooks, SessionStart: [START] } }, isHook)).toBeNull();
    const theirs = { matcher: 'startup', hooks: [{ ...HOOK, args: [...HOOK.args, '--root', PROJECT_DIR] }] };
    expect(withSessionStart({ hooks: { ...two.hooks, SessionStart: [theirs] } }, isHook)).toBeNull();
    // Known only by what the caller knows of a line: without it, a person's line is not the hook's.
    expect(withSessionStart({ hooks: { ...two.hooks, SessionStart: [theirs] } }, () => false)).toEqual({ hooks: { ...two.hooks, SessionStart: [theirs, START] } });
  });

  it('is found in settings by an entry under SessionStart that runs the hook, and in no other', () => {
    expect(startsSessions({ hooks: { SessionStart: [START] } }, () => false)).toBe(true);
    expect(startsSessions({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'echo', args: ['x'] }] }, START] } }, () => false)).toBe(true);
    expect(startsSessions({ hooks: { SessionStart: [{ matcher: 'resume', hooks: [{ type: 'command', command: 'echo', args: ['x'] }, HOOK] }] } }, () => false)).toBe(true);
    const words = { hooks: [{ type: 'command', command: `node ${SCRIPT} hook claude` }] };
    expect(startsSessions({ hooks: { SessionStart: [words] } }, isHook)).toBe(true);
    expect(startsSessions({ hooks: { SessionStart: [words] } }, () => false)).toBe(false);
    for (const settings of [{}, { hooks: 'x' }, { hooks: { SessionStart: 'x' } }, { hooks: { SessionStart: [{ hooks: ['node', null] }, null, { hooks: 'x' }] } }, { hooks: { PreToolUse: [START] } }, { hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'node', args: [SCRIPT, 'hook', 'git'] }] }] } }]) {
      expect(startsSessions(settings, isHook), JSON.stringify(settings)).toBe(false);
    }
  });

  it('is noted where it is missing in the words doctor has', () => {
    expect(NO_SESSION_START).toBe(
      'note: no settings file has Claude Code start the hook as a session starts, so a configuration that does not load, or a brief named that spec-brief does not list, is said only at the first write, which it holds: spec-harness init --write adds the entry beside the two it wrote',
    );
  });
});

describe('the entry as a turn ends (ADR-0012)', () => {
  const END = { hooks: [{ ...HOOK, async: true }] };
  const isHook = (words: readonly string[]): boolean => claudeHookLine(words, parseOptions, '/p', () => true) !== null;
  // The two init writes into empty settings, which a test above holds mergeClaudeSettings to, written
  // out: merged here, a mutant of the merge that throws would stop this file loading, not fail a test.
  const two: Record<string, unknown> & { hooks: Record<string, unknown> } = { hooks: { PreToolUse: [GUARD], PostToolUse: [GUARD] } };

  it('runs the hook\'s own line in the background', () => {
    expect(TURN_HOOK).toEqual({ ...HOOK, async: true });
  });

  it('is added after what stands under the event, whatever else the file holds', () => {
    expect(withTurnReport(two, isHook)).toEqual({ hooks: { ...two.hooks, Stop: [END] } });
    expect(withTurnReport({}, isHook)).toEqual({ hooks: { Stop: [END] } });
    expect(withTurnReport({ hooks: null }, isHook)).toEqual({ hooks: { Stop: [END] } });
    const other = { hooks: [{ type: 'command', command: 'echo done' }] };
    expect(withTurnReport({ model: 'x', hooks: { Stop: [other] } }, isHook)).toEqual({ model: 'x', hooks: { Stop: [other, END] } });
    expect(withTurnReport({ hooks: { Stop: 'x' } }, isHook)).toEqual({ hooks: { Stop: [END] } });
    // A copy: the line written is not init's own to change.
    const added = withTurnReport(two, isHook) as { hooks: { Stop: { hooks: { args: string[] }[] }[] } };
    added.hooks.Stop[0]?.hooks[0]?.args.push('--x');
    expect(withTurnReport(two, isHook)).toEqual({ hooks: { ...two.hooks, Stop: [END] } });
  });

  it('is not added where a line of the hook stands under the event already, init\'s or a person\'s', () => {
    for (const entry of [END, { hooks: [HOOK] }]) expect(withTurnReport({ hooks: { Stop: [entry] } }, isHook)).toBeNull();
    const theirs = { hooks: [{ ...HOOK, args: [...HOOK.args, '--root', PROJECT_DIR] }] };
    expect(withTurnReport({ hooks: { Stop: [theirs] } }, isHook)).toBeNull();
    expect(reportsTurns({ hooks: { Stop: [theirs] } }, isHook)).toBe(true);
    // Beside another group under the event, as well.
    const other = { hooks: [{ type: 'command', command: 'echo done' }] };
    expect(reportsTurns({ hooks: { Stop: [other, END] } }, isHook)).toBe(true);
    expect(withTurnReport({ hooks: { Stop: [other, END] } }, isHook)).toBeNull();
    // Known only by what the caller knows of a line.
    expect(withTurnReport({ hooks: { Stop: [theirs] } }, () => false)).toEqual({ hooks: { Stop: [theirs, END] } });
    expect(reportsTurns({ hooks: { Stop: [theirs] } }, () => false)).toBe(false);
    for (const settings of [null, 'x', {}, { hooks: { Stop: {} } }, { hooks: { Stop: [{ hooks: 'x' }, { hooks: ['x'] }] } }, { hooks: { SessionStart: [END] } }]) expect(reportsTurns(settings, isHook), JSON.stringify(settings)).toBe(false);
  });
});

describe('the install the hook\'s line runs, from a linked worktree', () => {
  it('is a note where the main checkout\'s release and this work tree\'s differ, none among them, and nothing where they are one', () => {
    expect(describeInstalls('/work/app', '0.19.0', '0.19.0')).toBeNull();
    expect(describeInstalls('/work/app', null, null)).toBeNull();
    expect(describeInstalls('/work/app', '0.18.0', '0.19.0')).toBe(`note: this is a linked worktree of /work/app, and the hook's line runs the spec-harness installed where \${CLAUDE_PROJECT_DIR} points: this work tree's, 0.19.0, in a session started here, and /work/app's, 0.18.0, in one started there, as a worktree session of the desktop app is`);
    expect(describeInstalls('/work/app', null, '0.19.0')).toBe(`note: this is a linked worktree of /work/app, and the hook's line runs the spec-harness installed where \${CLAUDE_PROJECT_DIR} points: this work tree's, 0.19.0, in a session started here, and /work/app's, none, in one started there, as a worktree session of the desktop app is`);
    expect(describeInstalls('/work/app', '0.19.0', null)).toBe(`note: this is a linked worktree of /work/app, and the hook's line runs the spec-harness installed where \${CLAUDE_PROJECT_DIR} points: this work tree's, none, in a session started here, and /work/app's, 0.19.0, in one started there, as a worktree session of the desktop app is`);
  });
});

describe("the lines 0.21.0 and earlier wrote, with the script of the scope the family left on 2026-10-26 (spec-core's ADR-0005, Names)", () => {
  const EARLIER_BIN = 'node_modules/@descent-vtt/spec-harness/bin/spec-harness.js';
  const EARLIER = `\${CLAUDE_PROJECT_DIR}/${EARLIER_BIN}`;
  const BIN = 'node_modules/@spec-family/spec-harness/bin/spec-harness.js';
  const OLD = { type: 'command', command: 'node', args: [EARLIER, 'hook', 'claude'], timeout: 60 };
  const MATCHER = GUARD.matcher;
  /** Settings as 0.20.0 and 0.21.0 wrote them with turnReport on: the line under the four events, and `hook` in place of it where given. */
  const released = (hook: Record<string, unknown> = OLD) => ({
    hooks: { PreToolUse: [{ matcher: MATCHER, hooks: [hook] }], PostToolUse: [{ matcher: MATCHER, hooks: [hook] }], SessionStart: [{ hooks: [hook] }], Stop: [{ hooks: [{ ...hook, async: true }] }] },
  });

  describe("in Claude Code's settings", () => {
    it("is rewritten under each event it stands under, where it stands, keeping the entry's other fields", () => {
      const lint = { type: 'command', command: 'npm run lint' };
      const blocking = { ...OLD, onFailure: 'block' };
      const settings = { model: 'x', hooks: { ...released(blocking).hooks, PreToolUse: [{ matcher: MATCHER, hooks: [lint, blocking] }] } };
      const now = { ...HOOK, onFailure: 'block' };
      const merged = mergeClaudeSettings(settings);
      expect(merged).toEqual({
        model: 'x',
        hooks: { PreToolUse: [{ matcher: MATCHER, hooks: [lint, now] }], PostToolUse: [{ matcher: MATCHER, hooks: [now] }], SessionStart: [{ hooks: [now] }], Stop: [{ hooks: [{ ...now, async: true }] }] },
      });
      // Once rewritten there is nothing more to do, and the settings given are as they were.
      expect(mergeClaudeSettings(merged ?? {})).toBeNull();
      expect(settings.hooks.PreToolUse[0]?.hooks[1]).toBe(blocking);
    });

    it('is rewritten as a session starts and as a turn ends where the two before and after a write are init\'s line already, and nothing else is touched', () => {
      const pre = [GUARD];
      const post = [GUARD];
      const merged = mergeClaudeSettings({ hooks: { PreToolUse: pre, PostToolUse: post, SessionStart: [{ hooks: [OLD] }] } });
      expect(merged).toEqual({ hooks: { PreToolUse: [GUARD], PostToolUse: [GUARD], SessionStart: [{ hooks: [HOOK] }] } });
      const hooks = merged?.['hooks'] as Record<string, unknown>;
      expect(hooks['PreToolUse']).toBe(pre);
      expect(hooks['PostToolUse']).toBe(post);
      expect(mergeClaudeSettings({ hooks: { PreToolUse: [GUARD], PostToolUse: [GUARD], Stop: [{ hooks: [{ ...OLD, async: true }] }] } })).toEqual({
        hooks: { PreToolUse: [GUARD], PostToolUse: [GUARD], Stop: [{ hooks: [{ ...HOOK, async: true }] }] },
      });
      // Beside another group under the event, which is left as it is.
      const other = { hooks: [{ type: 'command', command: 'echo hi' }] };
      const started = mergeClaudeSettings({ hooks: { PreToolUse: [GUARD], PostToolUse: [GUARD], SessionStart: [other, { hooks: [OLD] }] } });
      expect(started).toEqual({ hooks: { PreToolUse: [GUARD], PostToolUse: [GUARD], SessionStart: [other, { hooks: [HOOK] }] } });
      expect(((started?.['hooks'] as Record<string, unknown[]>)['SessionStart'] ?? [])[0]).toBe(other);
      // init's line under all four already: nothing to write.
      expect(mergeClaudeSettings(released(HOOK))).toBeNull();
    });

    it("is not rewritten where it is not the line a release wrote: another command, other words, more on it, or 0.1's npx command as a session starts", () => {
      const similar = { hooks: [{ ...OLD, command: 'nodejs' }, { ...OLD, args: [EARLIER, 'hook', 'git'] }, { ...OLD, args: [`/opt/${EARLIER_BIN}`, 'hook', 'claude'] }] };
      expect(mergeClaudeSettings({ hooks: { PreToolUse: [similar], PostToolUse: [similar] } })).toEqual({ hooks: { PreToolUse: [similar, GUARD], PostToolUse: [similar, GUARD] } });
      // A line of the earlier script with more on it, which the hook's reading knows, is a person's, and init writes nothing beside it.
      const theirs = { ...OLD, args: [EARLIER, 'hook', 'claude', '--brief', '001'] };
      const isHook = (words: readonly string[]): boolean => words[0] === 'hook' && words[1] === 'claude';
      expect(mergeClaudeSettings(released(theirs), isHook)).toBeNull();
      // But the line a release wrote, known the same way, is init's, and is rewritten.
      expect(mergeClaudeSettings(released(), isHook)).toEqual(released(HOOK));
      // 0.1 wrote nothing as a session starts.
      const npx = { hooks: [{ type: 'command', command: LEGACY }] };
      expect(mergeClaudeSettings({ hooks: { PreToolUse: [GUARD], PostToolUse: [GUARD], SessionStart: [npx], Stop: [npx] } })).toBeNull();
    });

    it('is said to stand in settings under any event init writes one under, and in none other', () => {
      expect(holdsEarlierGuard(released())).toBe(true);
      expect(holdsEarlierGuard({ hooks: { PreToolUse: [GUARD, { hooks: [OLD] }] } })).toBe(true);
      for (const event of ['PreToolUse', 'PostToolUse', 'SessionStart', 'Stop']) {
        expect(holdsEarlierGuard({ hooks: { Notification: [{ hooks: [OLD] }], [event]: [{ hooks: [{ type: 'command', command: 'x' }, OLD] }] } }), event).toBe(true);
      }
      for (const settings of [released(HOOK), { hooks: { Notification: [{ hooks: [OLD] }] } }, { hooks: { PreToolUse: [{ hooks: [{ ...OLD, command: 'nodejs' }] }] } }, { hooks: { PreToolUse: 'x' } }, {}, null, 'x']) {
        expect(holdsEarlierGuard(settings), JSON.stringify(settings)).toBe(false);
      }
    });
  });

  describe("in a project's .mcp.json", () => {
    const SERVER = { command: 'node', args: [`\${CLAUDE_PROJECT_DIR:-.}/${EARLIER_BIN}`, 'mcp', '--root', '${CLAUDE_PROJECT_DIR:-.}'] };

    it('is rewritten, keeping its other fields and the servers beside it', () => {
      const merged = mergeMcp({ mcpServers: { other: { command: 'x' }, 'spec-harness': { type: 'stdio', ...SERVER, env: { A: '1' } } }, extra: true });
      expect(merged).toEqual({ mcpServers: { other: { command: 'x' }, 'spec-harness': { type: 'stdio', env: { A: '1' }, ...mcpServer(PROJECT_DIR_OR_HERE) } }, extra: true });
      expect(mergeMcp(merged ?? {})).toBeNull();
      expect(holdsEarlierServer({ mcpServers: { 'spec-harness': SERVER } })).toBe(true);
      expect(holdsEarlierServer(merged)).toBe(false);
    });

    it("is kept where it is not the entry init wrote: the plugin's line, another command, other words", () => {
      for (const server of [{ command: 'node', args: [EARLIER, 'mcp', '--root', '${CLAUDE_PROJECT_DIR}'] }, { ...SERVER, command: 'bun' }, { command: 'node', args: SERVER.args.slice(0, 2) }]) {
        expect(mergeMcp({ mcpServers: { 'spec-harness': server } }), JSON.stringify(server)).toBeNull();
        expect(holdsEarlierServer({ mcpServers: { 'spec-harness': server } }), JSON.stringify(server)).toBe(false);
      }
      expect(holdsEarlierServer({ mcpServers: { other: SERVER } })).toBe(false);
      for (const mcp of [{}, { mcpServers: null }, null]) expect(holdsEarlierServer(mcp), JSON.stringify(mcp)).toBe(false);
    });
  });

  describe("in spec-brief's plugins", () => {
    const NAME = '@descent-vtt/spec-harness/spec-brief-plugin';

    it('names the plugin by its name now, where the earlier name stood and with its options', () => {
      expect(mergeSpecBrief({ briefs: 'b', plugins: ['./x.mjs', NAME, './y.mjs'] })).toEqual({ briefs: 'b', plugins: ['./x.mjs', PLUGIN, './y.mjs'] });
      expect(mergeSpecBrief({ plugins: [{ module: NAME, options: { a: 1 } }, null] })).toEqual({ plugins: [{ module: PLUGIN, options: { a: 1 } }, null] });
      expect(mergeSpecBrief({ plugins: [NAME] }, 'main')).toEqual({ plugins: [PLUGIN], archiving: { base: 'main' } });
      expect(mergeSpecBrief(mergeSpecBrief({ plugins: [NAME] }) ?? {})).toBeNull();
    });

    it('takes the earlier name out beside the name now, since spec-brief refuses two plugins of one name, and leaves a name only like it', () => {
      expect(mergeSpecBrief({ plugins: [PLUGIN, NAME, { module: NAME }] })).toEqual({ plugins: [PLUGIN] });
      expect(mergeSpecBrief({ plugins: ['@descent-vtt/spec-harness', { module: '@descent-vtt/spec-harness/other' }] })).toEqual({
        plugins: ['@descent-vtt/spec-harness', { module: '@descent-vtt/spec-harness/other' }, PLUGIN],
      });
    });

    it('is said as the earlier name where no entry names the plugin by its name now', () => {
      expect(loadsEarlierPlugin({ plugins: [NAME] })).toBe(true);
      expect(loadsEarlierPlugin({ plugins: [null, { module: NAME }] })).toBe(true);
      for (const config of [{}, { plugins: NAME }, { plugins: [PLUGIN, { name: NAME }, '@descent-vtt/spec-harness'] }]) expect(loadsEarlierPlugin(config), JSON.stringify(config)).toBe(false);
      expect(describePlugin({ kind: 'earlier', file: '.spec-brief.json' })).toBe(
        `.spec-brief.json names spec-harness's plugin "${NAME}", by the name of this package's releases up to 0.21.0: spec-brief loads it from @descent-vtt/spec-harness while that is installed, and once it is not, its lint and its archive stop at exit 2, the plugin not loaded. spec-harness init --write names "${PLUGIN}" in its place`,
      );
    });
  });

  describe("in git's pre-commit hook", () => {
    /** The hook 0.19.0 to 0.21.0 wrote: init's now, with the earlier script. Read in a test: read as the file loads, a mutant under which init's hook is no text would stop the file, and fail no test. */
    const hook19 = (): string => releasedHook(EARLIER_BIN);
    /** The hook 0.10.0 to 0.18.0 wrote, as their tags have it. */
    const HOOK_10 = "#!/bin/sh\n# spec-harness: refuse a commit that changes what the active brief protects.\n# git runs this at the top of the work tree it commits in, a linked worktree's\n# own, wherever the hook is kept: the project's install is read from there.\nbin=node_modules/@descent-vtt/spec-harness/bin/spec-harness.js\nif [ ! -f \"$bin\" ]; then\n  printf '%s\\n' \"spec-harness: $bin is not in $PWD, the work tree git commits in: install the project's dependencies there, as with npm ci, and commit again\" >&2\n  exit 2\nfi\nexec node \"$bin\" hook git\n";
    const NOTE = `it runs ${EARLIER_BIN}, the script of @descent-vtt/spec-harness, the name of this package's releases up to 0.21.0, which is not there once that package is uninstalled`;
    const NPX =
      'it runs spec-harness through npx, which starts npm to start node on every commit, and under npm 12 prints two "npm notice run" lines each time: ' +
      `to run it with node from the project's install, as Claude Code's hooks are, replace the npx command there with "node ${BIN} hook git"`;

    it('is known as one init wrote, byte for byte, and no other is', () => {
      expect(hook19()).not.toBe(PRE_COMMIT);
      expect(isEarlierPreCommit(hook19())).toBe(true);
      expect(isEarlierPreCommit(HOOK_10)).toBe(true);
      for (const text of [PRE_COMMIT, `${hook19()}npm test\n`, HOOK_10.split('\n').join('\r\n'), HOOK_10.trimEnd(), '']) expect(isEarlierPreCommit(text), JSON.stringify(text)).toBe(false);
      // 0.22.0's runs this scope's script, and is written again for its words alone.
      expect(releasedHook(BIN)).not.toBe(PRE_COMMIT);
      expect(isEarlierPreCommit(releasedHook(BIN))).toBe(true);
    });

    it('is written again by init with what it was: the earlier scope\'s, or the one 0.22.0 wrote', () => {
      expect(earlierPreCommit(hook19())).toBe(HOOK_MOVED);
      expect(earlierPreCommit(HOOK_10)).toBe(HOOK_MOVED);
      expect(earlierPreCommit(releasedHook(BIN))).toBe(HOOK_RENEWED);
      expect(HOOK_RENEWED).toBe('the hook init wrote in 0.22.0, written again to say, where the script is not installed, whether package.json names @spec-family/spec-harness');
      for (const text of [PRE_COMMIT, `${releasedHook(BIN)}npm test\n`, '']) expect(earlierPreCommit(text), JSON.stringify(text)).toBeNull();
    });

    it("notes 0.22.0's hook, which guards as init's does, so that init writes it again", () => {
      expect(gitHookNote(releasedHook(BIN))).toBe(
        'it is the hook init wrote in 0.22.0, which advises installing the dependencies where the script is not there, at a commit from before the project took up @spec-family/spec-harness too, where they bring none: spec-harness init --git-hook --write writes it again',
      );
    });

    it('is noted with how to move it: init writes its own hook again, and a hook of the repository\'s own names this package\'s script', () => {
      const again = `${NOTE}: it is the hook an earlier release of init wrote, and spec-harness init --git-hook --write writes it again to run ${BIN}`;
      expect(gitHookNote(hook19())).toBe(again);
      expect(gitHookNote(HOOK_10)).toBe(again);
      const own = `#!/bin/sh\nnpm test || exit 1\nnode ${EARLIER_BIN} hook git # the guard\n`;
      expect(gitHookNote(own)).toBe(`${NOTE}: name ${BIN} there in its place`);
      // Beside an npx line, both are said.
      expect(gitHookNote(`#!/bin/sh\nnpx --no-install spec-harness hook git\nnode ${EARLIER_BIN} hook git\n`)).toBe(`${NPX}; ${NOTE}: name ${BIN} there in its place`);
      // What a comment names runs nothing, and neither does another package's script.
      for (const text of [`#!/bin/sh\n# was: node ${EARLIER_BIN} hook git\nexec node ${BIN} hook git\n`, PRE_COMMIT, '#!/bin/sh\nnode node_modules/@descent-vtt/spec-guard/bin/spec-guard.js\n']) {
        expect(gitHookNote(text), text).toBeNull();
      }
    });
  });

  it('is said by init, in each file it rewrites one, with the path it ran and the one it runs', () => {
    expect(GUARD_MOVED).toBe(`the entries an earlier release wrote, which ran ${EARLIER_BIN}, run ${BIN}, where they stand`);
    expect(SERVER_MOVED).toBe(`the entry an earlier release wrote, which ran ${EARLIER_BIN}, runs ${BIN}`);
    expect(HOOK_MOVED).toBe(`the hook an earlier release of init wrote, which runs ${EARLIER_BIN}, written again to run ${BIN}`);
    expect(PLUGIN_MOVED).toBe(`name spec-harness's plugin "${PLUGIN}" where an earlier release wrote "@descent-vtt/spec-harness/spec-brief-plugin", which spec-brief cannot load once @descent-vtt/spec-harness is uninstalled`);
  });

  describe('as doctor reads it', () => {
    const PROJECT = '/p';
    const FILE = '.claude/settings.json';
    const BOTH = ['PreToolUse', 'PostToolUse'];
    const TOOLS = ['Edit', 'Write', 'NotebookEdit'];
    const THERE = `${PROJECT}/${EARLIER_BIN}`;
    const read = (words: readonly string[]) => claudeHookLine(words, parseOptions, PROJECT, () => true);
    const looked = (files: readonly string[]): ScriptPlaces => ({ projects: [PROJECT], isFile: (path) => files.includes(path) });
    const at = (hooks: unknown, scripts: ScriptPlaces | null, file = FILE) => reportHooks([{ file, settings: hooks }], PROJECT, read, undefined, undefined, false, scripts);
    const both = (hook: unknown) => ({ hooks: { PreToolUse: [{ matcher: MATCHER, hooks: [hook] }], PostToolUse: [{ matcher: MATCHER, hooks: [hook] }] } });
    const W = '"hook claude" in .claude/settings.json';
    const INIT = `spec-harness init --write rewrites the line an earlier release wrote to run ${BIN}, which npm install --save-dev @spec-family/spec-harness installs`;
    const BY_HAND = `name ${BIN}, which npm install --save-dev @spec-family/spec-harness installs, on the line in its place`;
    const runs = (where: string, script = EARLIER) => `${where} runs ${script}, the script of @descent-vtt/spec-harness, the name of this package's releases up to 0.21.0: it guards while that package is installed, and once it is uninstalled the hook cannot start and Claude Code lets each write go ahead without it`;
    const off = (where: string, mend: string) => `${where}: the script it runs, ${THERE}, is not there, so the hook cannot start, the guard is off and Claude Code lets each write it is started for go ahead without it; ${mend}`;

    it('guards where the script is there, and says how init moves it; is off where it is not, with the same', () => {
      const report = { file: FILE, events: BOTH, line: ['hook', 'claude'], onFailure: null, before: TOOLS, after: TOOLS, cover: null, note: null, timeout: null };
      expect(at(both(OLD), looked([THERE]))).toEqual([{ ...report, state: 'guards', detail: `${runs(W)}; ${INIT}` }]);
      expect(at(both(OLD), looked([]))).toEqual([{ ...report, state: 'off', detail: off(W, INIT) }]);
      // init asks of no script, and rewrites the line: nothing is said of it there.
      expect(at(both(OLD), null)).toEqual([{ ...report, state: 'guards', detail: null }]);
      // Nor of this package's script, wherever it is looked for.
      expect(at(both(HOOK), looked([`${PROJECT}/${BIN}`]))).toEqual([{ ...report, state: 'guards', detail: null }]);
    });

    it('says to mend by hand a line init did not write: in another settings file, with more on it, or by another path to the script', () => {
      const local = '"hook claude" in .claude/settings.local.json';
      expect(at(both(OLD), looked([THERE]), '.claude/settings.local.json')[0]).toMatchObject({ state: 'guards', detail: `${runs(local)}; ${BY_HAND}` });
      expect(at(both(OLD), looked([]), '.claude/settings.local.json')[0]).toMatchObject({ state: 'off', detail: off(local, BY_HAND) });
      const more = '"hook claude --brief 001" in .claude/settings.json';
      expect(at(both({ ...OLD, args: [...OLD.args, '--brief', '001'] }), looked([THERE]))[0]).toMatchObject({ state: 'guards', detail: `${more} is more than init writes, and guards: the hook reads the line; ${runs(more)}; ${BY_HAND}` });
      // The line a release wrote under one event and, under the other, the same words run by another program: init rewrites the one.
      expect(at({ hooks: { PreToolUse: [{ matcher: MATCHER, hooks: [OLD] }], PostToolUse: [{ matcher: MATCHER, hooks: [{ ...OLD, command: 'nodejs' }] }] } }, looked([THERE]))[0]).toMatchObject({
        events: BOTH,
        state: 'guards',
        detail: `${runs(W)}; ${BY_HAND}`,
      });
      // A Windows path, which the earlier script ends just as well, and is no line a release wrote.
      const windows = `C:\\p\\node_modules\\@descent-vtt\\spec-harness\\bin\\spec-harness.js`;
      expect(at(both({ ...OLD, args: [windows, 'hook', 'claude'] }), looked([windows]))[0]).toMatchObject({ state: 'guards', detail: `${runs(W, windows)}; ${BY_HAND}` });
    });

    it('says, where nothing is looked for, as init reads it, nothing of a line init rewrites and how to move one it leaves', () => {
      expect(at(both(OLD), null)[0]).toMatchObject({ state: 'guards', detail: null });
      const local = '"hook claude" in .claude/settings.local.json';
      expect(at(both(OLD), null, '.claude/settings.local.json')[0]).toMatchObject({ state: 'guards', detail: `${runs(local)}; ${BY_HAND}` });
      const more = '"hook claude --brief 001" in .claude/settings.json';
      expect(at(both({ ...OLD, args: [...OLD.args, '--brief', '001'] }), null)[0]).toMatchObject({ state: 'guards', detail: `${more} is more than init writes, and guards: the hook reads the line; ${runs(more)}; ${BY_HAND}` });
    });

    it('says nothing of a script that only looks like it', () => {
      for (const script of [`${PROJECT}/node_modules/@other/spec-harness/bin/spec-harness.js`, `${PROJECT}/descent-vtt/spec-harness/bin/spec-harness.js`, `${PROJECT}/node_modules/@descent-vtt/spec-harness/spec-harness.js`]) {
        expect(at(both({ ...OLD, args: [script, 'hook', 'claude'] }), looked([script]))[0], script).toMatchObject({ state: 'guards', detail: null });
      }
    });
  });
});
