/**
 * The guard, spoken in the languages that ask it: an agent's pre- and
 * post-tool hooks, and git's pre-commit.
 *
 * Claude Code sends a hook one JSON object on stdin naming the tool and its
 * input. A file-editing tool names its file under `file_path`, `path` or
 * `notebook_path` depending on the tool and the release; all three are read,
 * because a guard that missed a renamed field would allow everything.
 *
 * What the answer may not do matters as much as what it does. Returning
 * `allow` from a pre-tool hook skips the person's own permission prompt, so
 * the guard never says `allow`: it says `deny`, or `ask`, or nothing. A
 * warning - a write outside the scope when the repository asked only to be
 * warned - is told to the model after the write, through the post-tool hook's
 * additional context, where it cannot unlock anything.
 */

import { posix } from 'node:path';

import type { Decision } from './guard.js';
import type { FileChange } from './types.js';

/**
 * The tools whose input names a file they write, by every name a release of
 * Claude Code has had for one. The hook reads a path from each: a name more
 * costs nothing, and a Claude Code that still has the tool may send it.
 */
export const WRITING_TOOLS: readonly string[] = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'];

/**
 * Those of them a Claude Code the harness runs under can call
 * (`CLAUDE_CODE_MINIMUM`, versions.ts). Its tools reference
 * (https://code.claude.com/docs/en/tools-reference, read 2026-10-12) has
 * `Edit`, `Write` and `NotebookEdit` in its table of tools, and no
 * `MultiEdit`, which its permissions page calls a legacy tool; and the tool
 * inputs each release declares hold a `MultiEdit` up to 1.0.128 and none
 * from 2.0.0 on (ADR-0005). So what doctor and init say of the writes a
 * line is started for names these alone: a tool nobody can call leaves no
 * write unchecked.
 */
export const CALLABLE_TOOLS: readonly string[] = ['Edit', 'Write', 'NotebookEdit'];

const PATH_FIELDS: readonly string[] = ['file_path', 'path', 'notebook_path'];

export interface HookRequest {
  readonly event: string;
  readonly tool: string;
  /** The session's working directory, when the hook says. */
  readonly cwd: string | null;
  /** Files the tool writes, as the tool named them - absolute, usually. */
  readonly paths: readonly string[];
  /** The session and the tool call the question is about, when it says: `session_id` and `tool_use_id`. */
  readonly session: string | null;
  readonly call: string | null;
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The event Claude Code runs as a session starts, resumes, is cleared or
 * compacted, or is forked: no tool is named, and the hook checks what every
 * write of the session will need (ADR-0005).
 */
export const SESSION_START = 'SessionStart';

/**
 * The event Claude Code runs as its main agent finishes a turn, under which
 * the hook reports what the work tree holds, where the configuration asks
 * for it (ADR-0005). No tool is named.
 */
export const TURN_END = 'Stop';

/**
 * How long a run of Claude Code's hook is given, every process it starts
 * together (ADR-0002). Claude Code's hooks reference (Timeouts and Common
 * fields, read 2026-10-24) has a command hook cancelled at its entry's
 * `timeout`, 600 seconds where the entry gives none, and a PreToolUse hook
 * it cancels blocks no tool call; init and the plugin give the entry 60.
 * Each process asked a question keeps its 20 seconds (`ANSWER_MS`,
 * git.ts), but several that answer slowly, none of them at that, passed the
 * minute, and the write went ahead. So a run has this, from when the hook
 * begins its work, and a process is given no more of it than is left;
 * Node's start and the reading of the question, before it, are inside the
 * margin to the minute.
 */
export const HOOK_BUDGET_MS = 45_000;

/** The events that name no tool, which the hook answers of the session and not of a write. */
const NO_TOOL: readonly string[] = [SESSION_START, TURN_END];

/**
 * The fields of another agent's hook input, by the agent whose they are,
 * as each agent's hooks reference has them (read 2026-11-12): Cursor's
 * `cursor_version`, and GitHub Copilot's `toolName` and `toolArgs`. Copilot
 * and Cursor read `.claude/settings.json` and run the line `init` wrote
 * there, and its answer is in a language neither reads, so a write of theirs
 * goes ahead unchecked (round 29's evaluation).
 */
const AGENT_FIELDS: readonly (readonly [string, string])[] = [
  ['cursor_version', 'Cursor'],
  ['toolName', 'GitHub Copilot'],
  ['toolArgs', 'GitHub Copilot'],
];

/** Events of another agent's hooks, by the agent whose they are: Cursor's in camelCase, and Gemini CLI's. */
const AGENT_EVENTS: readonly (readonly [string, string])[] = [
  ['preToolUse', 'Cursor'],
  ['postToolUse', 'Cursor'],
  ['BeforeTool', 'Gemini CLI'],
  ['AfterTool', 'Gemini CLI'],
];

/**
 * Claude Code's tools that name a file they read and write none, which a
 * matcher that lets every tool through starts the hook for.
 */
const READING_TOOLS: readonly string[] = ['Read', 'Glob', 'Grep', 'LS', 'NotebookRead'];

/** The fields another agent's tools name a file in, which no tool of Claude Code's does. */
const OTHER_PATH_FIELDS: readonly string[] = ['filePath', 'TargetFile', 'target_file'];

/**
 * What a hook input says of another agent than Claude Code, in words for
 * the line the hook gives: a field or an event of another agent's, or a
 * tool the guard does not know that names a file, or a patch, which is how
 * Codex's `apply_patch` writes one. `null` where it says nothing of one.
 * `hook claude` guards Claude Code's writes alone, so such a write goes
 * ahead unchecked, and the person is told (ADR-0012).
 */
export function otherAgent(raw: string): string | null {
  let value: unknown = null;
  try {
    value = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch {
    // Text that is not JSON leaves the value null, which is no object.
  }
  if (!isObject(value)) return null;
  const field = AGENT_FIELDS.find(([name]) => name in value);
  if (field !== undefined) return `it carries ${field[0]}, as ${field[1]}'s does`;
  const event = AGENT_EVENTS.find(([name]) => value['hook_event_name'] === name);
  if (event !== undefined) return `its event is ${event[0]}, ${event[1]}'s`;
  const tool = value['tool_name'];
  const input = value['tool_input'];
  if (typeof tool !== 'string' || WRITING_TOOLS.includes(tool) || READING_TOOLS.includes(tool) || !isObject(input)) return null;
  const named = [...PATH_FIELDS, ...OTHER_PATH_FIELDS].find((name) => typeof input[name] === 'string');
  if (named !== undefined) return `its tool ${tool}, which the guard does not know, names a file in ${named}`;
  const command = input['command'];
  if (typeof command === 'string' && command.includes('*** Begin Patch')) return `its tool ${tool} carries a patch, as Codex's apply_patch does`;
  return null;
}

/** Reads a Claude Code hook's stdin, or says why it cannot. */
export function parseClaudeHook(raw: string): HookRequest | { readonly error: string } {
  let value: unknown;
  try {
    // A byte order mark before the JSON is read past: refused, the question
    // was one the hook could not read, and the write went ahead unchecked.
    value = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch {
    return { error: 'the hook input is not JSON' };
  }
  if (!isObject(value)) return { error: 'the hook input is not a JSON object' };
  const event = value['hook_event_name'];
  const tool = value['tool_name'];
  if (typeof event !== 'string' || (typeof tool !== 'string' && !NO_TOOL.includes(event))) return { error: 'the hook input names no event or tool' };
  // A session's start and a turn's end name no tool, and are read as naming none.
  const named = typeof tool === 'string' ? tool : '';
  const input = isObject(value['tool_input']) ? value['tool_input'] : {};
  const paths: string[] = [];
  if (WRITING_TOOLS.includes(named)) {
    for (const field of PATH_FIELDS) {
      const path = input[field];
      if (typeof path === 'string' && path !== '' && !paths.includes(path)) paths.push(path);
    }
    // A tool that writes a file and names none is a question the hook
    // cannot answer: read as one that writes nothing, it passed with no
    // word, where guard.md promises a line for what it cannot read.
    if (paths.length === 0) return { error: `the hook input names ${named} and no file it writes, as a string in file_path, path or notebook_path` };
  }
  const text = (field: string): string | null => {
    const found = value[field];
    return typeof found === 'string' ? found : null;
  };
  return { event, tool: named, cwd: text('cwd'), paths, session: text('session_id'), call: text('tool_use_id') };
}

/**
 * The answer as a session starts: what would hold every write of it, in
 * one line, for the person as `systemMessage` and for Claude as
 * `additionalContext`; or nothing, where all is well. Always exit 0: the
 * event cannot block, and a check that fails must not keep a session from
 * starting.
 */
export function sessionResponse(problem: string | null): HookResponse {
  if (problem === null) return NONE;
  const said = `spec-harness: ${problem}`;
  return { stdout: `${JSON.stringify({ systemMessage: said, hookSpecificOutput: { hookEventName: SESSION_START, additionalContext: said } })}\n`, exitCode: 0 };
}

/**
 * The answer as a turn ends: the report, in one `systemMessage`, or
 * nothing, where there is nothing to report. Always exit 0, and never a
 * field that has Claude go on: `decision`, `additionalContext` and exit 2
 * each continue the turn under Stop, and `continue: false` would stop one
 * another hook continues. Claude Code shows a `systemMessage` to the person
 * from an entry it waits on, and hands it to Claude on the next turn from
 * one it runs in the background, as `init` writes it (ADR-0005, ADR-0012).
 */
export function turnResponse(report: string | null): HookResponse {
  if (report === null) return NONE;
  return { stdout: `${JSON.stringify({ systemMessage: report })}\n`, exitCode: 0 };
}

export interface HookResponse {
  /** What to print on stdout: JSON, or nothing. */
  readonly stdout: string;
  readonly exitCode: number;
}

/**
 * The answer before the one write a configuration that does not load lets
 * through, a write to the configuration file itself: no decision, so that
 * the person's own permission prompt stands as for any write the guard
 * passes, and the line that says why every other write is held, for the
 * person as `systemMessage` and for Claude as `additionalContext`, which
 * Claude Code's hooks reference has a PreToolUse hook's answer carry
 * (ADR-0005). Exit 0.
 */
export function mendResponse(said: string): HookResponse {
  const line = `spec-harness: ${said}`;
  return { stdout: `${JSON.stringify({ systemMessage: line, hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: line } })}\n`, exitCode: 0 };
}

/** The answer that says nothing and decides nothing: the write goes on as the person's own permissions have it. */
export const NONE: HookResponse = { stdout: '', exitCode: 0 };

/**
 * The answer where the hook checks nothing and says so, a question it cannot
 * read or a line of its own that turns the guard off: one line, as
 * `systemMessage`, which Claude Code's hooks reference has shown to the
 * person on every event the hook answers, and exit 0. It decides nothing,
 * so the call goes on as it would without the hook. It was exit 1, which
 * the reference counts as a hook that failed: under `onFailure: "block"`,
 * which holds the call of a hook that cannot start, it held every write of
 * a session for a line only a write can mend (ADR-0005).
 */
export function warningResponse(said: string): HookResponse {
  return { stdout: `${JSON.stringify({ systemMessage: `spec-harness: ${said}` })}\n`, exitCode: 0 };
}

function reasonOf(decisions: readonly Warning[]): string {
  return decisions.map((decision) => `spec-harness: ${decision.message}. Next: ${decision.hint}.`).join('\n');
}

/** What a warning after a write says: a decision's message and its next step. */
export type Warning = Pick<Decision, 'message' | 'hint'>;

/** The answer after a write: the warnings, as additional context for the model, or nothing. */
export function afterResponse(warnings: readonly Warning[]): HookResponse {
  if (warnings.length === 0) return NONE;
  return {
    stdout: `${JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: reasonOf(warnings) },
    })}\n`,
    exitCode: 0,
  };
}

/**
 * The answer to a Claude Code hook: a refusal or a question before a write,
 * a warning after one, or nothing.
 */
export function claudeResponse(event: string, decisions: readonly Decision[]): HookResponse {
  if (event === 'PreToolUse') {
    const denied = decisions.filter((decision) => decision.verdict === 'deny');
    const asked = decisions.filter((decision) => decision.verdict === 'ask');
    const decided = denied.length > 0 ? { verdict: 'deny', list: denied } : asked.length > 0 ? { verdict: 'ask', list: asked } : null;
    if (decided === null) return NONE;
    return {
      stdout: `${JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: decided.verdict,
          permissionDecisionReason: reasonOf(decided.list),
        },
      })}\n`,
      exitCode: 0,
    };
  }
  if (event === 'PostToolUse') return afterResponse(warningsOf(decisions));
  return NONE;
}

/** The decisions a run after the write would say: those that warn, each by its message and next step. */
export function warningsOf(decisions: readonly Decision[]): Warning[] {
  return decisions.filter((decision) => decision.verdict === 'warn').map(({ message, hint }) => ({ message, hint }));
}

/* ------------------------------------------------------- other agents' hooks */

/**
 * The agents besides Claude Code whose hooks spec-harness answers, each in
 * its own language and with the guard's one decision (ADR-0012, amended
 * 2026-11-12): OpenAI's Codex CLI and GitHub Copilot, its cloud agent and
 * its CLI.
 */
export type Agent = 'codex' | 'copilot';

/**
 * A line of a patch in the form Codex's `apply_patch` takes, that names a
 * file it writes: one it adds, deletes or updates, or the name an update
 * moves it to (openai/codex, codex-rs/core/assets/tools/apply_patch.lark,
 * read 2026-11-12). The parser there reads the markers past whitespace,
 * and the name to the end of its line, trimmed: a `.` stops at a carriage
 * return as at the line's end.
 */
const PATCH_FILE = /^\s*\*\*\* (?:Add File|Delete File|Update File|Move to):\s*(\S.*)/;

/** The files a patch in apply_patch's form writes, each once, as it names them: relative to the session's directory, or absolute. */
export function patchPaths(patch: string): string[] {
  const paths: string[] = [];
  for (const line of patch.split('\n')) {
    const path = PATCH_FILE.exec(line)?.[1]!.trimEnd();
    if (path !== undefined && !paths.includes(path)) paths.push(path);
  }
  return paths;
}

/** Whether a text holds a patch in apply_patch's form, as a shell command that runs `apply_patch` with a heredoc does. */
function holdsPatch(text: string): boolean {
  return text.includes('*** Begin Patch');
}

/**
 * Reads Codex's hook input, which has Claude Code's shape (Codex's hooks
 * reference, learn.chatgpt.com/docs/hooks, read 2026-11-12): the files
 * `apply_patch` writes are in the patch it carries as `tool_input.command`,
 * with no field of their own, and a shell command that runs `apply_patch`
 * with a heredoc, which Codex applies too, comes as `Bash` with the patch
 * in its command. A tool that writes a file of Claude Code's names, which
 * no Codex tool has, is read as `hook claude` reads it.
 */
export function parseCodexHook(raw: string): HookRequest | { readonly error: string } {
  const read = parseClaudeHook(raw);
  if ('error' in read) return read;
  // parseClaudeHook read the same text as an object, so this reads, and is
  // one: the test of it is the compiler's, and its mutant equivalent.
  const value: unknown = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  const input = isObject(value) && isObject(value['tool_input']) ? value['tool_input'] : {};
  const command = input['command'];
  if (typeof command !== 'string' || (read.tool !== 'apply_patch' && !holdsPatch(command))) {
    return read.tool === 'apply_patch' ? { error: 'the hook input names apply_patch and no patch in tool_input.command' } : read;
  }
  const paths = patchPaths(command);
  if (paths.length === 0) return { error: `the hook input names ${read.tool} with a patch that names no file` };
  return { ...read, paths };
}

/**
 * The tools of Copilot's that write a file, by the names its hook input
 * gives them, as Copilot's hooks reference lists them beside the names of
 * Claude Code's they stand for (docs.github.com/en/copilot/reference/hooks-reference,
 * read 2026-11-12): `create` for Write, `edit`, `str_replace_editor` and
 * `apply_patch` for Edit.
 */
export const COPILOT_WRITING_TOOLS: readonly string[] = ['create', 'edit', 'str_replace_editor', 'apply_patch'];

/**
 * The fields a Copilot tool may name its file under. The reference gives
 * no argument's name, so every name a file is given by an editing tool of
 * the agents read is read: a guard that missed the one Copilot sends would
 * allow everything.
 */
const COPILOT_PATH_FIELDS: readonly string[] = ['path', 'file_path', 'filePath', 'filename', 'file'];

/**
 * Reads Copilot's preToolUse input, `{ toolName, toolArgs, cwd, ... }`, in
 * the camelCase form its hooks file takes (the reference above). Its
 * reference types `toolArgs` as unknown and its tutorial calls it a JSON
 * string, so both are read. The file of a writing tool is read from each
 * field a file is named under, and from a patch in apply_patch's form in
 * any argument. The PascalCase form Copilot's CLI also sends is Claude
 * Code's, and is read as `hook claude` reads it.
 */
export function parseCopilotHook(raw: string): HookRequest | { readonly error: string } {
  let value: unknown;
  try {
    value = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch {
    return { error: 'the hook input is not JSON' };
  }
  if (!isObject(value)) return { error: 'the hook input is not a JSON object' };
  if (!('toolName' in value)) return parseClaudeHook(raw);
  const tool = value['toolName'];
  if (typeof tool !== 'string') return { error: 'the hook input names no tool' };
  let args = value['toolArgs'];
  if (typeof args === 'string') {
    try {
      args = JSON.parse(args);
    } catch {
      return { error: `the hook input names ${tool} with arguments that are not JSON` };
    }
  }
  const cwd = typeof value['cwd'] === 'string' ? value['cwd'] : null;
  const session = typeof value['sessionId'] === 'string' ? value['sessionId'] : null;
  const request = { event: 'PreToolUse', tool, cwd, session, call: null };
  if (!COPILOT_WRITING_TOOLS.includes(tool)) return { ...request, paths: [] };
  const given = isObject(args) ? args : {};
  const paths: string[] = [];
  for (const field of COPILOT_PATH_FIELDS) {
    const path = given[field];
    if (typeof path === 'string' && path !== '' && !paths.includes(path)) paths.push(path);
  }
  for (const text of Object.values(given)) {
    if (typeof text === 'string' && holdsPatch(text)) for (const path of patchPaths(text)) if (!paths.includes(path)) paths.push(path);
  }
  if (paths.length === 0) return { error: `the hook input names ${tool} and no file it writes` };
  return { ...request, paths };
}

/** What an answer to Codex or Copilot reads of a decision: its verdict, its message and its next step. */
export type Held = Pick<Decision, 'verdict' | 'message' | 'hint'>;

/** The decisions that hold a write, the refusals before the questions, or `null` where none does. */
function holding(decisions: readonly Held[]): { readonly verdict: 'deny' | 'ask'; readonly list: readonly Held[] } | null {
  const denied = decisions.filter((decision) => decision.verdict === 'deny');
  if (denied.length > 0) return { verdict: 'deny', list: denied };
  const asked = decisions.filter((decision) => decision.verdict === 'ask');
  return asked.length > 0 ? { verdict: 'ask', list: asked } : null;
}

/**
 * What Codex is told where the guard would put a write to the person:
 * Codex reads an `ask` as a hook that failed and runs the tool (its hooks
 * reference, and codex-rs/hooks/src/engine/output_parser.rs at c0cc9fc),
 * so the write is refused, and the reason says the person was to decide.
 */
const NO_ASKING = 'spec-harness: this write is the person\'s to decide, and Codex cannot ask them through a hook, so it is refused: approve it outside the session, or run it in Claude Code, which asks';

/**
 * The answer to Codex before a write: a refusal, in Claude Code's words,
 * which Codex reads (its hooks reference), with a reason, without which
 * Codex counts the hook as failed and runs the tool; or nothing. Exit 0.
 */
export function codexResponse(decisions: readonly Held[]): HookResponse {
  const held = holding(decisions);
  if (held === null) return NONE;
  const reason = held.verdict === 'ask' ? `${NO_ASKING}\n${reasonOf(held.list)}` : reasonOf(held.list);
  return { stdout: `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } })}\n`, exitCode: 0 };
}

/**
 * The answer to Copilot before a write: `permissionDecision` at the top of
 * the object, `deny` or `ask`, with its reason, which Copilot requires for
 * a refusal; or nothing (its hooks reference). Copilot's cloud agent reads
 * `ask` as a refusal, and its CLI asks the person. Exit 0: a hook that
 * exits otherwise is one Copilot counts as failed, and its reason is lost.
 */
export function copilotResponse(decisions: readonly Held[]): HookResponse {
  const held = holding(decisions);
  if (held === null) return NONE;
  return { stdout: `${JSON.stringify({ permissionDecision: held.verdict, permissionDecisionReason: reasonOf(held.list) })}\n`, exitCode: 0 };
}

/**
 * The answer, in the agent's language, before a write the hook could not
 * check or whose question it could not read: a refusal, with why. Each of
 * the two runs the tool where a hook fails, times out or says nothing it
 * reads, so a write the guard cannot see is held, where `hook claude`,
 * whose question Claude Code's own hooks shape, says it and passes
 * (ADR-0012).
 */
export function heldResponse(agent: Agent, why: string, next = 'run spec-harness doctor, and fix what it says'): HookResponse {
  const held: Held = { verdict: 'deny', message: why, hint: next };
  return agent === 'codex' ? codexResponse([held]) : copilotResponse([held]);
}

/**
 * What the hook reads besides its question and its line, as it decides: the
 * project Claude Code names, the brief the environment names, and the
 * branch a forge's CI names on a detached head (ADR-0004).
 */
export const CALL_VARIABLES: readonly string[] = [
  'CLAUDE_PROJECT_DIR',
  'SPEC_BRIEF',
  'GITHUB_HEAD_REF',
  'GITHUB_REF_TYPE',
  'GITHUB_REF_NAME',
  'CI_MERGE_REQUEST_SOURCE_BRANCH_NAME',
  'CI_COMMIT_BRANCH',
];

/**
 * A tool call, as both of its hooks see it: the release, the session and
 * the call, the tool and its paths, the session's directory, what the
 * hook's line gives, the directory the hook was started in, and the
 * variables it reads (ADR-0002). What a run before the write keeps is
 * answered after it only to a run for which all of it is the same.
 */
export interface CallRecord {
  readonly release: string;
  readonly session: string;
  readonly call: string;
  readonly tool: string;
  readonly paths: readonly string[];
  readonly cwd: string | null;
  readonly line: readonly (string | null)[];
  readonly started: string;
  readonly env: readonly (string | null)[];
}

/** An id the hook names a file by: what Claude Code's ids are made of, and nothing a path could climb out by. */
const ID = /^[\w-]{1,256}$/;

/**
 * The session a question is in, which spec-brief's answers are kept for,
 * or `null` where it names none in the form Claude Code's ids have: such a
 * question has every answer asked for afresh (ADR-0002).
 */
export function sessionOf(request: HookRequest): string | null {
  // The pattern reads null as "null", and what is answered is the session,
  // null: the test of null is the compiler's, and its mutant equivalent.
  return request.session !== null && ID.test(request.session) ? request.session : null;
}

/**
 * The call a question is about, or `null` where it does not say which
 * session and call it is, or says it in a form no file is named by.
 */
export function callRecord(
  request: HookRequest,
  line: Readonly<{ root: string | undefined; brief: string | undefined; base: string | undefined }>,
  started: string,
  env: Readonly<Record<string, string | undefined>>,
  release: string,
): CallRecord | null {
  const { session, call } = request;
  if (session === null || call === null || !ID.test(session) || !ID.test(call)) return null;
  return {
    release,
    session,
    call,
    tool: request.tool,
    paths: request.paths,
    cwd: request.cwd,
    line: [line.root ?? null, line.brief ?? null, line.base ?? null],
    started,
    env: CALL_VARIABLES.map((name) => env[name] ?? null),
  };
}

/** The name of the file a call's decisions are kept under. */
export function callFile(record: CallRecord): string {
  return `${record.session}.${record.call}.json`;
}

/** What a run before the write keeps for the run after it: the call, and the warnings it decided. */
export function keptCall(record: CallRecord, warnings: readonly Warning[]): string {
  return `${JSON.stringify({ record, warnings })}\n`;
}

function isWarning(value: unknown): value is Warning {
  return isObject(value) && typeof value['message'] === 'string' && typeof value['hint'] === 'string';
}

/**
 * The warnings kept for this call, or `null` where what was kept is not
 * JSON, is another call's, or holds anything but warnings: such a call is
 * decided as it was before anything was kept (ADR-0002).
 */
export function warningsKept(text: string, record: CallRecord): Warning[] | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    // Read as an empty object, a text that is not JSON holds no record
    // either: that mutant is equivalent.
    return null;
  }
  if (!isObject(value) || JSON.stringify(value['record']) !== JSON.stringify(record)) return null;
  const warnings = value['warnings'];
  return Array.isArray(warnings) && warnings.every(isWarning) ? warnings.map(({ message, hint }) => ({ message, hint })) : null;
}

/**
 * The answer to git's pre-commit hook: every file the commit would change
 * that the round may not, and exit 1 if any is refused. A warning prints and
 * lets the commit through; a question has no one to ask in git, so it refuses.
 */
export function gitResponse(decisions: readonly Decision[]): { readonly text: string; readonly exitCode: number } {
  const lines: string[] = [];
  let refused = 0;
  for (const decision of decisions) {
    if (decision.verdict === 'allow') continue;
    const blocking = decision.verdict === 'deny' || decision.verdict === 'ask';
    if (blocking) refused += 1;
    lines.push(`${blocking ? 'refused' : 'warning'}  ${decision.message}`, `         ${decision.hint}`);
  }
  if (refused > 0) lines.push(`spec-harness: ${refused} file(s) this round may not change; the commit was stopped`);
  return { text: lines.length === 0 ? '' : `${lines.join('\n')}\n`, exitCode: refused > 0 ? 1 : 0 };
}

/**
 * What a commit on a closed round's branch holds of the round's own archive,
 * the move of its brief to `archived`, the file spec-brief lists it at now,
 * which is the round's last commit (ADR-0004). `alone`: that move and what
 * spec-brief's archive writes beside it, the links `live` briefs hold to the
 * file. `beside`: that move and anything else. `absent`: no such move. git
 * says a rename where the two files read alike, and a file deleted and a
 * file added where they do not, as a short brief under a long summary does.
 * spec-brief keeps the file's name, so a file of another name git pairs with
 * this one is not the brief, whatever it reads like.
 */
export function stagedArchive(staged: readonly FileChange[], archived: string, live: readonly string[]): 'alone' | 'beside' | 'absent' {
  const arrived = staged.find((change) => change.path === archived && (change.status === 'A' || change.status === 'R'));
  if (arrived === undefined) return 'absent';
  // A second file deleted beside the brief is no move of it, so the first
  // stands for every one: of another name it is no brief, and of the name,
  // what is left holds the other.
  const name = posix.basename(archived);
  const left = arrived.from ?? staged.find((change) => change.status === 'D')?.path;
  if (left === undefined || posix.basename(left) !== name) return 'beside';
  const rest = staged.filter((change) => change !== arrived && change.path !== left);
  return rest.every((change) => change.status === 'M' && live.includes(change.path)) ? 'alone' : 'beside';
}
