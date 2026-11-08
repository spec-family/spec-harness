/**
 * The server's `check_path` answers each path as the hook decides a write
 * of it (ADR-0008, amended 2026-10-24).
 *
 * Under a brief the branch names that spec-brief does not list or has
 * archived, `check_path` answered every path with the problem, a file
 * outside every work tree of the repository among them, which the hook
 * passes with no word; with no brief named it answered every path with a
 * tool error, where the hook passes every write; and it asked spec-brief
 * where nothing named a brief, so a spec-brief that cannot run failed a call
 * the hook would pass. One table of cases holds the two to one answer.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { brief, BRIEF_FILE, cleanup, cli, repository, temp, type Captured, type Repository } from './helpers.js';

afterAll(cleanup);

const FILES = { [BRIEF_FILE]: brief({ affected: ['src/app/**'], protected: ['src/db/**'] }), 'src/db/schema.ts': 'table;\n', 'src/app/a.ts': 'a;\n', 'README.md': 'r\n' };

/** What a write of a path comes to, and the words it is said in. */
interface Said {
  readonly as: 'refused' | 'asked' | 'passes' | 'held' | 'cannot check';
  readonly words: string;
}

/** The hook's answer before a write of `file` alone. */
async function hook(repo: Repository, file: string, env: Readonly<Record<string, string>>): Promise<Said> {
  const question = JSON.stringify({ session_id: 's', tool_use_id: 'toolu_1', cwd: repo.root, hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: file, content: 'x' } });
  const answer: Captured = await cli(['hook', 'claude'], repo.root, { stdin: question, env: { ...env, CLAUDE_PROJECT_DIR: repo.root } });
  if (answer.code === 2) {
    const cannot = 'spec-harness: cannot check this write: ';
    if (answer.stderr.startsWith(cannot)) return { as: 'cannot check', words: answer.stderr.slice(cannot.length).trim() };
    // What holds the write, before what the hook says to do about it: a
    // closed round's branch has nothing to fix (ADR-0004).
    const held = /^spec-harness: (.*)\. (?:Fix the brief or the branch before writing|The round is archived and ends when this branch merges: write on the branch of a live brief)\.\n$/.exec(answer.stderr);
    return { as: 'held', words: held?.[1] ?? answer.stderr };
  }
  expect({ code: answer.code, stderr: answer.stderr }, file).toEqual({ code: 0, stderr: '' });
  if (answer.stdout === '') return { as: 'passes', words: '' };
  const { permissionDecision, permissionDecisionReason } = (JSON.parse(answer.stdout) as { hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string } }).hookSpecificOutput;
  return { as: permissionDecision === 'deny' ? 'refused' : 'asked', words: permissionDecisionReason };
}

interface Decided {
  readonly verdict: string;
  readonly reason: string;
  readonly message: string;
  readonly hint: string;
}

/** The server's answer to `check_path` of `file` alone, in the same terms. */
async function server(repo: Repository, file: string, env: Readonly<Record<string, string>>): Promise<Said> {
  const lines = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'check_path', arguments: { paths: [file] } } },
  ];
  const served = await cli(['mcp'], repo.root, { stdin: lines.map((line) => JSON.stringify(line)).join('\n'), env: { ...env, CLAUDE_PROJECT_DIR: repo.root } });
  const answer = served.stdout
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as { id?: number; result?: { isError?: boolean; content: { text: string }[]; structuredContent?: { decisions: Decided[] } } })
    .find((message) => message.id === 2)!.result!;
  if (answer.isError === true) return { as: 'cannot check', words: answer.content[0]!.text.replace(/^spec-harness failed: /, '') };
  const [decision] = answer.structuredContent!.decisions as [Decided];
  if (decision.reason === 'held') return { as: 'held', words: decision.message };
  if (decision.verdict === 'deny') return { as: 'refused', words: `spec-harness: ${decision.message}. Next: ${decision.hint}.` };
  if (decision.verdict === 'ask') return { as: 'asked', words: `spec-harness: ${decision.message}. Next: ${decision.hint}.` };
  return { as: 'passes', words: '' };
}

/** A spec-brief that cannot list the briefs: the hook cannot check a write that needs it. */
function failing(): string {
  const script = join(temp(), 'sibling.js');
  writeFileSync(script, "process.stderr.write('no briefs directory'); process.exit(2);");
  return script;
}

interface Case {
  readonly name: string;
  readonly make: () => Repository;
  readonly env?: Readonly<Record<string, string>>;
  /** What a write of each path comes to: the protected file, one in the scope, one outside it, the brief, and a file outside every work tree. */
  readonly expected: readonly Said['as'][];
}

const onBranch = (config: Record<string, unknown> = {}, branch = 'brief/001-rotate') => (): Repository => {
  const repo = repository(FILES, config);
  repo.git('checkout', '-q', '-b', branch);
  return repo;
};

const CASES: readonly Case[] = [
  { name: 'a brief named, outOfScope warn', make: onBranch(), expected: ['refused', 'passes', 'passes', 'passes', 'passes'] },
  { name: 'a brief named, outOfScope ask', make: onBranch({ outOfScope: 'ask' }), expected: ['refused', 'passes', 'asked', 'passes', 'passes'] },
  { name: 'a brief named, outOfScope deny', make: onBranch({ outOfScope: 'deny' }), expected: ['refused', 'passes', 'refused', 'passes', 'passes'] },
  { name: 'no brief named', make: () => repository(FILES), expected: ['passes', 'passes', 'passes', 'passes', 'passes'] },
  { name: 'a branch that names a brief spec-brief does not list', make: onBranch({}, 'brief/999-nowhere'), expected: ['held', 'held', 'held', 'held', 'passes'] },
  {
    name: 'a branch that names a brief spec-brief has archived',
    make: () => {
      const repo = onBranch({}, 'brief/001-done')();
      rmSync(join(repo.root, BRIEF_FILE));
      repo.write('briefs/archive/001_rotate-tokens.md', brief({ status: 'archived', affected: ['src/app/**'], protected: ['src/db/**'] }));
      repo.commit('archive');
      return repo;
    },
    expected: ['held', 'held', 'held', 'held', 'passes'],
  },
  { name: 'SPEC_BRIEF naming a brief spec-brief does not list', make: () => repository(FILES), env: { SPEC_BRIEF: '404' }, expected: ['held', 'held', 'held', 'held', 'passes'] },
  { name: 'a brief named, and a spec-brief that cannot list the briefs', make: onBranch({ tools: { 'spec-brief': ['node', failing()] } }), expected: ['cannot check', 'cannot check', 'cannot check', 'cannot check', 'passes'] },
  { name: 'no brief named, and a spec-brief that cannot list the briefs', make: () => repository(FILES, { tools: { 'spec-brief': ['node', failing()] } }), expected: ['passes', 'passes', 'passes', 'passes', 'passes'] },
];

describe('check_path and the hook', () => {
  it.each(CASES)('answer each path alike: $name', async ({ make, env = {}, expected }) => {
    const repo = make();
    const files = [join(repo.root, 'src', 'db', 'schema.ts'), join(repo.root, 'src', 'app', 'a.ts'), join(repo.root, 'README.md'), join(repo.root, BRIEF_FILE), join(temp(), 'notes.md')];
    const answers = [];
    for (const file of files) {
      const [byHook, byServer] = [await hook(repo, file, env), await server(repo, file, env)];
      expect(byServer, file).toEqual(byHook);
      answers.push(byHook.as);
    }
    expect(answers).toEqual(expected);
  });

  it('reads the brief the argument names where nothing else names one, as the hook reads its line\'s', async () => {
    const repo = repository(FILES);
    const call = async (brief: string): Promise<string> => {
      const lines = [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } },
        { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'check_path', arguments: { paths: ['src/db/schema.ts'], brief } } },
      ];
      const served = await cli(['mcp'], repo.root, { stdin: lines.map((line) => JSON.stringify(line)).join('\n'), env: { CLAUDE_PROJECT_DIR: repo.root } });
      return (JSON.parse(served.stdout.split('\n').filter((line) => line !== '')[1]!) as { result: { content: { text: string }[] } }).result.content[0]!.text;
    };
    // On main, which names no brief, the argument alone names one.
    expect(await call('001')).toMatch(/^deny: brief 001 does not empower this round to change src\/db\/schema\.ts/);
    expect(await call('404')).toBe('deny: "brief" names brief 404, and spec-brief knows no such brief. Next: fix the brief or the branch before writing');
    const byLine = await cli(['hook', 'claude', '--brief', '404'], repo.root, {
      stdin: JSON.stringify({ session_id: 's', tool_use_id: 'toolu_1', cwd: repo.root, hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: join(repo.root, 'src', 'db', 'schema.ts'), content: 'x' } }),
      env: { CLAUDE_PROJECT_DIR: repo.root },
    });
    expect(byLine).toEqual({ code: 2, stdout: '', stderr: 'spec-harness: the flag names brief 404, and spec-brief knows no such brief. Fix the brief or the branch before writing.\n' });
  });

  it('holds a path with a `..` that reads as outside every work tree in its own words, the hook and check_path alike (ADR-0005, amended 2026-11-08)', async () => {
    const repo = onBranch({}, 'brief/999-nowhere')();
    const outside = temp();
    mkdirSync(join(outside, 'sub'));
    const dotted = [outside, 'sub', '..', 'notes.md'].join(sep);
    const own = `${dotted} has a .. in it and reads as a file outside every work tree of the repository, but a link before the .. can lead back into one, so it is held as a write in the repository is while the branch names brief 999, and spec-brief knows no such brief`;
    const byHook = await cli(['hook', 'claude'], repo.root, {
      stdin: JSON.stringify({ session_id: 's', tool_use_id: 'toolu_1', cwd: repo.root, hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: dotted, content: 'x' } }),
      env: { CLAUDE_PROJECT_DIR: repo.root },
    });
    expect(byHook).toEqual({ code: 2, stdout: '', stderr: `spec-harness: ${own}. Write the path without its .., as it resolves.\n` });
    const lines = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'check_path', arguments: { paths: ['src/db/schema.ts', dotted, join(outside, 'notes.md')] } } },
    ];
    const served = await cli(['mcp'], repo.root, { stdin: lines.map((line) => JSON.stringify(line)).join('\n'), env: { CLAUDE_PROJECT_DIR: repo.root } });
    const text = (JSON.parse(served.stdout.split('\n').filter((line) => line !== '')[1]!) as { result: { content: { text: string }[] } }).result.content[0]!.text;
    expect(text.split('\n')).toEqual([
      'deny: the branch names brief 999, and spec-brief knows no such brief. Next: fix the brief or the branch before writing',
      `deny: ${own}. Next: write the path without its .., as it resolves`,
      `allow: ${join(outside, 'notes.md')} is outside the repository; no brief governs it`,
    ]);
  });

  it('holds a path inside in the words the hook holds a write with, and passes one outside in the same call', async () => {
    const repo = onBranch({}, 'brief/999-nowhere')();
    const outside = join(temp(), 'notes.md');
    const lines = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'check_path', arguments: { paths: ['src/db/schema.ts', outside] } } },
    ];
    const served = await cli(['mcp'], repo.root, { stdin: lines.map((line) => JSON.stringify(line)).join('\n'), env: { CLAUDE_PROJECT_DIR: repo.root } });
    const text = (JSON.parse(served.stdout.split('\n').filter((line) => line !== '')[1]!) as { result: { content: { text: string }[] } }).result.content[0]!.text;
    expect(text.split('\n')).toEqual([
      'deny: the branch names brief 999, and spec-brief knows no such brief. Next: fix the brief or the branch before writing',
      `allow: ${outside} is outside the repository; no brief governs it`,
    ]);
  });
});
