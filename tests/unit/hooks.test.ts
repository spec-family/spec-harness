import { describe, expect, it } from 'vitest';

import type { Decision, Verdict } from '../../src/guard.js';
import { afterResponse, CALL_VARIABLES, CALLABLE_TOOLS, callFile, callRecord, claudeResponse, gitResponse, keptCall, mendResponse, parseClaudeHook, SESSION_START, sessionOf, sessionResponse, stagedArchive, TURN_END, turnResponse, warningsKept, warningsOf, WRITING_TOOLS, type HookRequest } from '../../src/hooks.js';

function hook(fields: Record<string, unknown>): string {
  return JSON.stringify({ session_id: 's', hook_event_name: 'PreToolUse', tool_name: 'Write', cwd: '/repo', ...fields });
}

function decision(verdict: Verdict, path = 'a.ts'): Decision {
  return {
    path,
    verdict,
    reason: verdict === 'allow' ? 'in-scope' : verdict === 'deny' ? 'protected' : 'out-of-scope',
    because: [],
    message: `${path} is ${verdict}`,
    hint: `fix ${path}`,
  };
}

describe('reading a Claude Code hook', () => {
  it('reads the file a writing tool names under file_path, path or notebook_path', () => {
    expect(parseClaudeHook(hook({ tool_input: { file_path: '/repo/a.ts', content: 'x' } }))).toEqual({
      event: 'PreToolUse',
      tool: 'Write',
      cwd: '/repo',
      paths: ['/repo/a.ts'],
      session: 's',
      call: null,
    });
    expect(parseClaudeHook(hook({ tool_name: 'Edit', tool_input: { path: 'b.ts' } }))).toMatchObject({ paths: ['b.ts'] });
    expect(parseClaudeHook(hook({ tool_name: 'NotebookEdit', tool_input: { notebook_path: '/repo/n.ipynb' } }))).toMatchObject({
      tool: 'NotebookEdit',
      paths: ['/repo/n.ipynb'],
    });
    expect(parseClaudeHook(hook({ tool_name: 'MultiEdit', tool_input: { file_path: 'm.ts', edits: [] } }))).toMatchObject({ paths: ['m.ts'] });
  });

  it('reads every field a tool fills, once each', () => {
    // A guard that read only the first field would allow whatever a renamed field named.
    const request = parseClaudeHook(hook({ tool_input: { file_path: 'a.ts', path: 'b.ts', notebook_path: 'a.ts' } }));
    expect(request).toMatchObject({ paths: ['a.ts', 'b.ts'] });
  });

  it('ignores empty and non-string paths', () => {
    expect(parseClaudeHook(hook({ tool_input: { file_path: '', path: 7, notebook_path: null } }))).toMatchObject({ paths: [] });
    expect(parseClaudeHook(hook({ tool_input: 'a.ts' }))).toMatchObject({ paths: [] });
    expect(parseClaudeHook(hook({ tool_input: ['a.ts'] }))).toMatchObject({ paths: [] });
    expect(parseClaudeHook(hook({}))).toMatchObject({ paths: [] });
  });

  it('reads no path from a tool that does not write files', () => {
    expect(WRITING_TOOLS).toEqual(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
    for (const tool of ['Read', 'Bash', 'Grep', 'write', 'WebFetch']) {
      expect(parseClaudeHook(hook({ tool_name: tool, tool_input: { file_path: '/repo/a.ts', path: '/repo' } }))).toMatchObject({ tool, paths: [] });
    }
  });

  it('calls callable the tools a supported Claude Code has, each one a tool the hook reads a path from', () => {
    expect(CALLABLE_TOOLS).toEqual(['Edit', 'Write', 'NotebookEdit']);
    for (const tool of CALLABLE_TOOLS) expect(WRITING_TOOLS, tool).toContain(tool);
    // The one name more is read all the same: a Claude Code that still has the tool is answered for it.
    const legacy = WRITING_TOOLS.filter((tool) => !CALLABLE_TOOLS.includes(tool));
    expect(legacy).toEqual(['MultiEdit']);
    for (const tool of legacy) expect(parseClaudeHook(hook({ tool_name: tool, tool_input: { file_path: '/repo/a.ts' } }))).toMatchObject({ tool, paths: ['/repo/a.ts'] });
  });

  it('reads the working directory only when it is a string', () => {
    expect(parseClaudeHook(hook({ cwd: 3, tool_input: { file_path: 'a' } }))).toMatchObject({ cwd: null });
    expect(parseClaudeHook(JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Edit' }))).toEqual({
      event: 'PostToolUse',
      tool: 'Edit',
      cwd: null,
      paths: [],
      session: null,
      call: null,
    });
  });

  it('reads the session and the call it is about only where each is a string', () => {
    expect(parseClaudeHook(hook({ tool_use_id: 'toolu_01', tool_input: { file_path: 'a' } }))).toMatchObject({ session: 's', call: 'toolu_01' });
    expect(parseClaudeHook(hook({ session_id: 7, tool_use_id: ['toolu_01'], tool_input: { file_path: 'a' } }))).toMatchObject({ session: null, call: null });
  });

  it('says why it cannot read malformed input', () => {
    expect(parseClaudeHook('{"hook_event_name":')).toEqual({ error: 'the hook input is not JSON' });
    expect(parseClaudeHook('')).toEqual({ error: 'the hook input is not JSON' });
    expect(parseClaudeHook('[1]')).toEqual({ error: 'the hook input is not a JSON object' });
    expect(parseClaudeHook('null')).toEqual({ error: 'the hook input is not a JSON object' });
    expect(parseClaudeHook(JSON.stringify({ tool_name: 'Write' }))).toEqual({ error: 'the hook input names no event or tool' });
    expect(parseClaudeHook(JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 3 }))).toEqual({ error: 'the hook input names no event or tool' });
  });
});

describe('answering Claude Code', () => {
  it('refuses before the write, with every refused path, its reason and the next step', () => {
    const response = claudeResponse('PreToolUse', [decision('allow'), decision('deny', 'x.ts'), decision('ask', 'y.ts'), decision('deny', 'z.ts')]);
    expect(response.exitCode).toBe(0);
    expect(response.stdout.endsWith('\n')).toBe(true);
    expect(JSON.parse(response.stdout)).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'spec-harness: x.ts is deny. Next: fix x.ts.\nspec-harness: z.ts is deny. Next: fix z.ts.',
      },
    });
  });

  it('asks the person when nothing is refused and something is to be asked', () => {
    const response = claudeResponse('PreToolUse', [decision('warn'), decision('ask', 'y.ts')]);
    expect(JSON.parse(response.stdout)).toEqual({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: 'spec-harness: y.ts is ask. Next: fix y.ts.' },
    });
  });

  it('says nothing before a write it allows or only warns about: never "allow"', () => {
    // "allow" would skip the person's own permission prompt.
    expect(claudeResponse('PreToolUse', [decision('allow'), decision('warn')])).toEqual({ stdout: '', exitCode: 0 });
    expect(claudeResponse('PreToolUse', [])).toEqual({ stdout: '', exitCode: 0 });
    for (const verdicts of [['allow'], ['warn'], ['ask'], ['deny'], ['allow', 'warn', 'ask', 'deny']] as Verdict[][]) {
      for (const event of ['PreToolUse', 'PostToolUse', 'Stop']) {
        expect(claudeResponse(event, verdicts.map((v) => decision(v))).stdout).not.toContain('"allow"');
      }
    }
  });

  it('warns after a write outside the scope, as context for the model', () => {
    const response = claudeResponse('PostToolUse', [decision('allow'), decision('warn', 'w.ts'), decision('deny', 'd.ts')]);
    expect(response.exitCode).toBe(0);
    expect(JSON.parse(response.stdout)).toEqual({
      hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: 'spec-harness: w.ts is warn. Next: fix w.ts.' },
    });
  });

  it('says nothing after a write it has nothing to warn about, and nothing to other events', () => {
    expect(claudeResponse('PostToolUse', [decision('allow'), decision('deny')])).toEqual({ stdout: '', exitCode: 0 });
    expect(claudeResponse('UserPromptSubmit', [decision('deny'), decision('warn')])).toEqual({ stdout: '', exitCode: 0 });
  });
});

describe('answering git', () => {
  it('stops a commit that changes a refused path, and one that would need a question', () => {
    const response = gitResponse([decision('allow'), decision('deny', 'x.ts'), decision('ask', 'y.ts')]);
    expect(response.exitCode).toBe(1);
    expect(response.text).toBe(
      [
        'refused  x.ts is deny',
        '         fix x.ts',
        'refused  y.ts is ask',
        '         fix y.ts',
        "spec-harness: 2 file(s) this round may not change; the commit was stopped",
        '',
      ].join('\n'),
    );
  });

  it('lets a commit through with a warning for a path outside the scope', () => {
    const response = gitResponse([decision('warn', 'w.ts'), decision('allow')]);
    expect(response).toEqual({ text: 'warning  w.ts is warn\n         fix w.ts\n', exitCode: 0 });
  });

  it('says nothing about a commit it allows', () => {
    expect(gitResponse([decision('allow'), decision('allow')])).toEqual({ text: '', exitCode: 0 });
    expect(gitResponse([])).toEqual({ text: '', exitCode: 0 });
  });
});

describe("what is staged of a round's own archive", () => {
  const LIVE = 'briefs/001_rotate.md';
  const ARCHIVED = 'briefs/archive/001_rotate.md';
  const OTHER = 'briefs/002_other.md';
  const moved = { status: 'R', from: LIVE, path: ARCHIVED } as const;
  const added = { status: 'A', path: ARCHIVED } as const;
  const deleted = { status: 'D', path: LIVE } as const;

  it('reads the move as a rename, and as a file deleted and a file added', () => {
    expect(stagedArchive([moved], ARCHIVED, [])).toBe('alone');
    expect(stagedArchive([deleted, added], ARCHIVED, [])).toBe('alone');
    expect(stagedArchive([added, deleted], ARCHIVED, [])).toBe('alone');
  });

  it('takes a live brief whose links the archive rewrote, and no other file beside the move', () => {
    const rewritten = { status: 'M', path: OTHER } as const;
    expect(stagedArchive([moved, rewritten], ARCHIVED, [OTHER])).toBe('alone');
    expect(stagedArchive([moved, rewritten], ARCHIVED, [])).toBe('beside');
    expect(stagedArchive([moved, { status: 'D', path: OTHER }], ARCHIVED, [OTHER])).toBe('beside');
    expect(stagedArchive([deleted, added, { status: 'A', path: 'src/a.ts' }], ARCHIVED, [])).toBe('beside');
  });

  it('reads a file of another name that arrives at the archive as no brief, whatever git pairs it with', () => {
    expect(stagedArchive([{ status: 'R', from: 'src/db/schema.ts', path: ARCHIVED }], ARCHIVED, [])).toBe('beside');
    expect(stagedArchive([{ status: 'D', path: 'src/db/schema.ts' }, added], ARCHIVED, [])).toBe('beside');
    expect(stagedArchive([added], ARCHIVED, [])).toBe('beside');
  });

  it('finds no archive where the file is not one the commit brings', () => {
    expect(stagedArchive([{ status: 'M', path: ARCHIVED }], ARCHIVED, [])).toBe('absent');
    expect(stagedArchive([{ status: 'D', path: ARCHIVED }], ARCHIVED, [])).toBe('absent');
    expect(stagedArchive([{ status: 'A', path: 'src/a.ts' }], ARCHIVED, [])).toBe('absent');
    expect(stagedArchive([], ARCHIVED, [])).toBe('absent');
  });
});

describe('the hook as a session starts', () => {
  it('reads a SessionStart question, which names no tool and no file, and no other event without a tool', () => {
    expect(SESSION_START).toBe('SessionStart');
    expect(parseClaudeHook(JSON.stringify({ hook_event_name: 'SessionStart', cwd: '/repo', source: 'resume' }))).toEqual({ event: 'SessionStart', tool: '', cwd: '/repo', paths: [], session: null, call: null });
    // A tool named beside it is read as named, and a file only a writing tool's.
    expect(parseClaudeHook(JSON.stringify({ hook_event_name: 'SessionStart', tool_name: 'Edit', tool_input: { file_path: '/repo/a.ts' } }))).toEqual({ event: 'SessionStart', tool: 'Edit', cwd: null, paths: ['/repo/a.ts'], session: null, call: null });
    expect(parseClaudeHook(JSON.stringify({ hook_event_name: 'SessionStart', tool_name: 7, tool_input: { file_path: '/repo/a.ts' } }))).toEqual({ event: 'SessionStart', tool: '', cwd: null, paths: [], session: null, call: null });
    for (const event of ['UserPromptSubmit', 'sessionstart', 'stop', 'SubagentStop']) expect(parseClaudeHook(JSON.stringify({ hook_event_name: event })), event).toEqual({ error: 'the hook input names no event or tool' });
    expect(parseClaudeHook(JSON.stringify({ tool_name: 'Edit' }))).toEqual({ error: 'the hook input names no event or tool' });
  });

  it('says a problem once for the person and once for Claude, exit 0, and nothing where there is none', () => {
    expect(sessionResponse(null)).toEqual({ stdout: '', exitCode: 0 });
    const said = sessionResponse('every write is held');
    expect(said.exitCode).toBe(0);
    expect(said.stdout.endsWith('}\n')).toBe(true);
    expect(JSON.parse(said.stdout)).toEqual({ systemMessage: 'spec-harness: every write is held', hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: 'spec-harness: every write is held' } });
  });
});

describe('the write a configuration that does not load lets through', () => {
  it("decides nothing, so the person's own prompt stands, and says the line once for the person and once for Claude, exit 0", () => {
    const said = mendResponse('the file does not load');
    expect(said.exitCode).toBe(0);
    expect(said.stdout.endsWith('}\n')).toBe(true);
    expect(JSON.parse(said.stdout)).toStrictEqual({ systemMessage: 'spec-harness: the file does not load', hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: 'spec-harness: the file does not load' } });
  });
});

describe('what the run before a write keeps for the run after it', () => {
  const request: HookRequest = { event: 'PreToolUse', tool: 'Edit', cwd: '/repo', paths: ['/repo/a.ts'], session: 'abc-123', call: 'toolu_01ABC' };
  const line = { root: undefined, brief: undefined, base: undefined };
  const env = { CLAUDE_PROJECT_DIR: '/repo', HOME: '/home/a' };
  const record = callRecord(request, line, '/repo', env, '0.19.0')!;

  it('names the call by its session, its call, the tool, its paths, its directories, its line and the variables the hook reads', () => {
    expect(record).toEqual({
      release: '0.19.0',
      session: 'abc-123',
      call: 'toolu_01ABC',
      tool: 'Edit',
      paths: ['/repo/a.ts'],
      cwd: '/repo',
      line: [null, null, null],
      started: '/repo',
      env: ['/repo', null, null, null, null, null, null],
    });
    expect(CALL_VARIABLES).toEqual(['CLAUDE_PROJECT_DIR', 'SPEC_BRIEF', 'GITHUB_HEAD_REF', 'GITHUB_REF_TYPE', 'GITHUB_REF_NAME', 'CI_MERGE_REQUEST_SOURCE_BRANCH_NAME', 'CI_COMMIT_BRANCH']);
    expect(callRecord(request, { root: '/r', brief: '001', base: 'main' }, '/repo', env, '0.19.0')?.line).toEqual(['/r', '001', 'main']);
    expect(callFile(record)).toBe('abc-123.toolu_01ABC.json');
  });

  it('names no call where the question names no session or call, or one no file could be named by', () => {
    for (const ids of [
      { session: null, call: 'toolu_01' },
      { session: 'abc', call: null },
      { session: '', call: 'toolu_01' },
      { session: 'abc', call: '../toolu_01' },
      { session: 'a/b', call: 'toolu_01' },
      { session: 'abc', call: 'toolu 01' },
      { session: 'abc', call: `x${'1'.repeat(256)}` },
    ]) {
      expect(callRecord({ ...request, ...ids }, line, '/repo', env, '0.19.0'), JSON.stringify(ids)).toBeNull();
    }
    expect(callRecord({ ...request, call: '1'.repeat(256) }, line, '/repo', env, '0.19.0')).not.toBeNull();
  });

  it('answers the call it was kept for with the warnings it decided, and nothing for one that decided none', () => {
    const warned = [decision('warn', 'notes.md'), decision('allow'), decision('ask', 'b.ts')];
    expect(warningsOf(warned)).toEqual([{ message: 'notes.md is warn', hint: 'fix notes.md' }]);
    const kept = keptCall(record, warningsOf(warned));
    expect(kept.endsWith('}\n')).toBe(true);
    expect(warningsKept(kept, record)).toEqual([{ message: 'notes.md is warn', hint: 'fix notes.md' }]);
    expect(afterResponse(warningsKept(kept, record)!)).toEqual(claudeResponse('PostToolUse', warned));
    expect(warningsKept(keptCall(record, []), record)).toEqual([]);
    expect(afterResponse([])).toEqual({ stdout: '', exitCode: 0 });
  });

  it("answers no other call with them: any part of the call that differs is another call's", () => {
    const kept = keptCall(record, [{ message: 'm', hint: 'h' }]);
    const others: Partial<typeof record>[] = [
      { release: '0.18.0' },
      { session: 'abc-124' },
      { call: 'toolu_01ABD' },
      { tool: 'Write' },
      { paths: ['/repo/b.ts'] },
      { cwd: '/repo/src' },
      { line: ['/r', null, null] },
      { started: '/elsewhere' },
      { env: ['/repo', '001', null, null, null, null, null] },
    ];
    for (const other of others) expect(warningsKept(kept, { ...record, ...other }), JSON.stringify(other)).toBeNull();
  });

  it('reads nothing kept that is not JSON, holds no record, or holds anything but warnings', () => {
    for (const text of [
      '',
      '{ "record": ',
      'null',
      '[]',
      JSON.stringify({ warnings: [] }),
      JSON.stringify({ record, warnings: null }),
      JSON.stringify({ record, warnings: {} }),
      JSON.stringify({ record, warnings: [{ message: 'm' }] }),
      JSON.stringify({ record, warnings: [{ hint: 'h' }] }),
      JSON.stringify({ record, warnings: [{ message: 1, hint: 'h' }] }),
      JSON.stringify({ record, warnings: [null] }),
      JSON.stringify({ record, warnings: ['m'] }),
    ]) {
      expect(warningsKept(text, record), text).toBeNull();
    }
    // What a warning holds besides its message and its next step is not read.
    expect(warningsKept(JSON.stringify({ record, warnings: [{ message: 'm', hint: 'h', verdict: 'deny' }] }), record)).toEqual([{ message: 'm', hint: 'h' }]);
  });
});

describe("the session spec-brief's answers are kept for", () => {
  const request: HookRequest = { event: 'PreToolUse', tool: 'Edit', cwd: '/repo', paths: ['/repo/a.ts'], session: 'abc-123', call: null };

  it("is the question's session, in the form Claude Code's ids have, whether or not it names a call", () => {
    expect(sessionOf(request)).toBe('abc-123');
    expect(sessionOf({ ...request, event: SESSION_START, tool: '', paths: [] })).toBe('abc-123');
    expect(sessionOf({ ...request, session: 'a'.repeat(256) })).toBe('a'.repeat(256));
  });

  it('is none where the question names none, or one in another form', () => {
    for (const session of [null, '', '../abc', 'a/b', 'a b', `x${'1'.repeat(256)}`]) expect(sessionOf({ ...request, session }), String(session)).toBeNull();
  });
});

describe('the hook as a turn ends', () => {
  it('reads a Stop question, which names no tool and no file', () => {
    expect(TURN_END).toBe('Stop');
    expect(parseClaudeHook(JSON.stringify({ session_id: 's', hook_event_name: 'Stop', cwd: '/repo', stop_hook_active: false, last_assistant_message: 'Done.' }))).toEqual({ event: 'Stop', tool: '', cwd: '/repo', paths: [], session: 's', call: null });
    expect(parseClaudeHook(JSON.stringify({ hook_event_name: 'Stop', tool_name: 7, tool_input: { file_path: '/repo/a.ts' } }))).toEqual({ event: 'Stop', tool: '', cwd: null, paths: [], session: null, call: null });
  });

  it('answers with the report alone, as a message, exit 0, and nothing where there is none', () => {
    expect(turnResponse(null)).toEqual({ stdout: '', exitCode: 0 });
    const said = turnResponse('spec-harness: one\n- two');
    expect(said.exitCode).toBe(0);
    expect(said.stdout.endsWith('}\n')).toBe(true);
    expect(said.stdout.split('\n')).toHaveLength(2);
    // No field that would have Claude go on: no decision, no context, no continue.
    expect(JSON.parse(said.stdout)).toEqual({ systemMessage: 'spec-harness: one\n- two' });
  });
});
