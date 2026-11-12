import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { INSTRUCTIONS, prompts, rootsClient, tools, toolsOpeningAgain, type Roots } from '../../src/server.js';
import { createMcpServer, type JsonObject, type ToolDefinition } from '../../src/vendor/spec-core/jsonrpc/index.js';
import { openWorkspace, parseOptions, version, type Workspace } from '../../src/workspace.js';
import { BIN, brief, BRIEF_FILE, cleanup, cli, install, repository, ROOT, siblings, temp, type Repository } from './helpers.js';

afterAll(cleanup);

let repo: Repository;
let workspace: Workspace;

beforeAll(async () => {
  repo = repository({
    [BRIEF_FILE]: brief({ affected: ['src/auth/**'], protected: ['src/db/**'] }),
    'briefs/002_next.md': brief({
      title: '002 - Next',
      affected: ['"src/[a"'],
      protected: ['"{./,lib}"'],
      dependsOn: ['1'],
      body: 'See [the ADR](../docs/adr/0003.md) and [the next](../docs/adr/0004.md).\n',
    }),
    'docs/adr/0003.md': '---\nstatus: accepted\n\n# ADR-0003\n',
    'docs/adr/0004.md': '---\nstatus draft\n---\n\n# ADR-0004\n',
    'briefs/archive/003_old.md': brief({ title: '003 - Old', status: 'archived' }),
    'src/db/schema.ts': 'table;\n',
  });
  repo.git('checkout', '-q', '-b', 'brief/001-rotate');
  workspace = await openWorkspace(parseOptions(['mcp']), { stdout: { write: () => true }, stderr: { write: () => true }, cwd: repo.root, env: {} });
});

function tool(name: string): ToolDefinition {
  const found = tools(workspace, {}).find((candidate) => candidate.descriptor.name === name);
  if (found === undefined) throw new Error(`no tool ${name}`);
  return found;
}

describe('the tools', () => {
  it('are the five a round needs, each described with its schema', () => {
    const list = tools(workspace, {});
    expect(list.map((t) => t.descriptor.name)).toEqual(['start_round', 'check_path', 'request_escalation', 'audit_round', 'list_rounds']);
    for (const t of list) expect(t.descriptor['inputSchema']).toMatchObject({ type: 'object', additionalProperties: false });
    expect(list.find((t) => t.descriptor.name === 'request_escalation')?.descriptor['annotations']).toMatchObject({ readOnlyHint: false });
    expect(list.find((t) => t.descriptor.name === 'check_path')?.descriptor['annotations']).toMatchObject({ readOnlyHint: true });
  });

  it('describe themselves and every argument they take, and refuse any other by the same names', async () => {
    for (const t of tools(workspace, {})) {
      const { name, title, description, inputSchema } = t.descriptor as unknown as {
        name: string;
        title: string;
        description: string;
        inputSchema: { properties: Record<string, { description: string }> };
      };
      // A model picks a tool, and fills in its arguments, from these words alone.
      expect(title.length, name).toBeGreaterThan(0);
      expect(description.length, name).toBeGreaterThan(0);
      const names = Object.keys(inputSchema.properties);
      for (const argument of names) expect(inputSchema.properties[argument]?.description.length, `${name}.${argument}`).toBeGreaterThan(0);
      const takes = names.length === 0 ? 'no arguments' : names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
      expect((await t.call({ zzz: 1 })).text, name).toBe(`Unknown argument "zzz"; this tool takes ${takes}.`);
    }
  });

  it('declare the type of every argument, and require the ones a call is refused without', () => {
    const shape = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(shape)
        : typeof value === 'object' && value !== null
          ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'description').map(([key, inner]) => [key, shape(inner)]))
          : value;
    const schemas = Object.fromEntries(tools(workspace, {}).map((t) => [t.descriptor.name, shape(t.descriptor['inputSchema'])]));
    const text = { type: 'string' };
    const paths = { type: 'array', items: text };
    expect(schemas).toEqual({
      start_round: { type: 'object', properties: { brief: text, base: text, directory: text }, additionalProperties: false },
      check_path: { type: 'object', properties: { paths, brief: text, base: text, directory: text }, required: ['paths'], additionalProperties: false },
      request_escalation: {
        type: 'object',
        properties: {
          paths,
          reason: text,
          options: { type: 'array', items: { type: 'object', properties: { label: text, consequence: text }, required: ['label', 'consequence'] } },
          recommendation: text,
          brief: text,
          directory: text,
        },
        required: ['paths', 'reason'],
        additionalProperties: false,
      },
      audit_round: { type: 'object', properties: { brief: text, base: text, directory: text }, additionalProperties: false },
      list_rounds: { type: 'object', properties: {}, additionalProperties: false },
    });
  });

  it('tell a client which only read, and that each request for a ruling records another', () => {
    const reads = { readOnlyHint: true, idempotentHint: true, openWorldHint: false };
    expect(Object.fromEntries(tools(workspace, {}).map((t) => [t.descriptor.name, t.descriptor['annotations']]))).toEqual({
      start_round: reads,
      check_path: reads,
      request_escalation: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
      audit_round: reads,
      list_rounds: reads,
    });
  });

  it('start_round gives the context packet of the brief the branch names', async () => {
    const outcome = await tool('start_round').call({});
    expect(outcome.isError).toBeUndefined();
    expect(outcome.text.startsWith('# Round 001: Rotate tokens\n')).toBe(true);
    // Read in the server's own work tree, which is said where a script reads it, and not in the packet.
    expect(outcome.text).not.toContain('Read in the work tree');
    expect(outcome.structured).toEqual({
      workTree: { root: workspace.root, from: 'server' },
      brief: '001',
      included: [],
      omitted: [],
      unresolved: [],
      unclosedFrontMatter: [],
      unreadableFrontMatter: [],
      unreadableScope: [],
      unreadableProtections: [],
      unreadableRulingPaths: [],
      unmatchedSpecs: [],
    });
    const next = await tool('start_round').call({ brief: '2' });
    expect(next.structured).toEqual({
      workTree: { root: workspace.root, from: 'server' },
      brief: '002',
      included: ['docs/adr/0003.md', 'docs/adr/0004.md'],
      omitted: [],
      unresolved: [],
      unclosedFrontMatter: ['docs/adr/0003.md'],
      unreadableFrontMatter: [{ path: 'docs/adr/0004.md', line: 2, text: 'status draft', reason: 'not a "key: value" line' }],
      unreadableScope: [{ pattern: 'src/[a', reason: 'a "[" is never closed' }],
      unreadableProtections: [{ pattern: '{./,lib}', reason: 'the braces expand to "./", which names no path' }],
      unreadableRulingPaths: [],
      unmatchedSpecs: [],
    });
    expect(next.text).toContain('May write:\n- `src/[a`, which the guard cannot read: a "[" is never closed; it puts no path in the scope\n');
    expect(next.text).toContain('The scope could not be read: no pattern in `affectedFiles` can be read');
    expect(next.text).toContain(
      'Must not change without a ruling:\n- `{./,lib}`, which the guard cannot read: the braces expand to "./", which names no path; until it is fixed, the guard refuses every write but to the brief\n',
    );
    expect(next.text).toContain('Front matter opened on line 1 and never closed, so the status was not read; close the block with `---` on a line of its own:\n- `docs/adr/0003.md`\n');
    expect(next.text).toContain(
      'Front matter lines that are not `key: value` were not read, so a status written on one, if any, was not read either:\n- `docs/adr/0004.md`, line 2, `status draft`: not a "key: value" line\n',
    );
  });

  it('check_path decides each path, relative to the project, with the next step', async () => {
    const outcome = await tool('check_path').call({ paths: ['src/db/schema.ts', 'src/auth/a.ts', 'README.md'] });
    expect(outcome.text.split('\n')).toEqual([
      'deny: brief 001 does not empower this round to change src/db/schema.ts (protectedFiles: src/db/**). Next: if the round cannot be done without it, stop and ask for a ruling: spec-harness escalate --path <file> --reason <why>, or the request_escalation tool',
      "allow: src/auth/a.ts is in brief 001's scope (src/auth/**)",
      "warn: README.md is outside brief 001's scope, which covers src/auth/**. Next: if the round needs it, say so in briefs/001_rotate-tokens.md and add it to affectedFiles; the archive reports every file outside the scope that the round commits",
    ]);
    const decisions = (outcome.structured as { decisions: { verdict: string }[] }).decisions;
    expect(decisions.map((d) => d.verdict)).toEqual(['deny', 'allow', 'warn']);
  });

  it('check_path holds a path through a share on this machine that names no drive, where paths are read as Windows reads them', async () => {
    const asWindows = tools({ ...workspace, platform: 'win32' }, {}).find((candidate) => candidate.descriptor.name === 'check_path')!;
    const outcome = await asWindows.call({ paths: ['//localhost/work/src/a.ts'] });
    expect(outcome.text).toBe(
      "deny: //localhost/work/src/a.ts names a share on this machine, which can be the repository by another name, and the guard cannot tell which directory it is. Next: write the path as a local one, the drive and the directories, or through the drive's own share, such as C$",
    );
  });

  it.skipIf(process.platform !== 'win32')("check_path reads a drive's share on this machine as the drive, as the hook does", async () => {
    const local = join(repo.root, 'src', 'db', 'schema.ts');
    const outcome = await tool('check_path').call({ paths: [`//localhost/${local.slice(0, 1)}$${local.slice(2)}`] });
    expect(outcome.text).toMatch(/^deny: brief 001 does not empower this round to change src\/db\/schema\.ts /);
  });

  it('check_path refuses arguments it does not take', async () => {
    expect(await tool('check_path').call({ paths: [] })).toEqual({ text: '"paths" must be a non-empty array of strings.', isError: true });
    expect(await tool('check_path').call({ paths: 'a.ts' })).toEqual({ text: '"paths" must be a non-empty array of strings.', isError: true });
    expect(await tool('check_path').call({ paths: [1] })).toEqual({ text: '"paths" must be a non-empty array of strings.', isError: true });
    expect(await tool('check_path').call({ paths: ['a', 1] })).toEqual({ text: '"paths" must be a non-empty array of strings.', isError: true });
    expect(await tool('check_path').call({ paths: ['a'], path: 'b' })).toEqual({ text: 'Unknown argument "path"; this tool takes paths, brief, base and directory.', isError: true });
    expect(await tool('check_path').call({ paths: ['a'], brief: 1 })).toEqual({ text: '"brief" must be a string.', isError: true });
    expect(await tool('check_path').call({ paths: ['a'], base: 1 })).toEqual({ text: '"base" must be a string.', isError: true });
    expect(await tool('start_round').call({ base: ['main'] })).toEqual({ text: '"base" must be a string.', isError: true });
    expect(await tool('start_round').call({ brief: 1 })).toEqual({ text: '"brief" must be a string.', isError: true });
    expect(await tool('start_round').call({ at: 'main' })).toEqual({ text: 'Unknown argument "at"; this tool takes brief, base and directory.', isError: true });
    // Said of the argument that named it: a tool call has no flag. A path
    // inside is held for it, as the hook holds a write of it.
    expect((await tool('check_path').call({ paths: ['a'], brief: '404' })).text).toBe('deny: "brief" names brief 404, and spec-brief knows no such brief. Next: fix the brief or the branch before writing');
    expect(await tool('start_round').call({ brief: '3' })).toEqual({ text: '"brief" names brief 003, which is archived; a closed round writes nothing', isError: true });
  });

  it('refuse a brief, a base or a path that is given and names nothing, by the argument, where each was read as left out', async () => {
    // An empty brief was answered for the branch's brief, an empty base with
    // no ruling verified, and an empty path as the project itself.
    const brief = (value: string) => ({ text: `"brief" is ${JSON.stringify(value)}, which names no brief; give it a brief's id, or leave it out for the one SPEC_BRIEF or the branch names.`, isError: true });
    const base = (value: string) => ({ text: `"base" is ${JSON.stringify(value)}, which names no commit; give it a branch or a commit, or leave it out for the configured base.`, isError: true });
    expect(await tool('start_round').call({ brief: '' })).toEqual(brief(''));
    expect(await tool('check_path').call({ paths: ['a'], brief: ' ' })).toEqual(brief(' '));
    expect(await tool('audit_round').call({ brief: '\t' })).toEqual(brief('\t'));
    expect(await tool('request_escalation').call({ paths: ['a'], reason: 'r', brief: '' })).toEqual(brief(''));
    expect(await tool('start_round').call({ base: '' })).toEqual(base(''));
    expect(await tool('check_path').call({ paths: ['a'], base: ' ' })).toEqual(base(' '));
    expect(await tool('audit_round').call({ base: '' })).toEqual(base(''));
    expect(await tool('check_path').call({ paths: [''] })).toEqual({ text: '"paths[0]" is "", which names no file; give it the path of a file.', isError: true });
    expect(await tool('check_path').call({ paths: ['src/auth/a.ts', ' '] })).toEqual({ text: '"paths[1]" is " ", which names no file; give it the path of a file.', isError: true });
    // The argument is named before the brief is looked for.
    expect(await tool('check_path').call({ paths: ['a'], base: '', brief: '404' })).toEqual(base(''));
    // What names something is read as it was: an id with space around it, and a base that is one.
    expect((await tool('start_round').call({ brief: ' 2 ', base: 'main' })).structured).toMatchObject({ brief: '002' });
  });

  it('request_escalation records the request and tells the agent to stop', async () => {
    const outcome = await tool('request_escalation').call({
      paths: ['src/db/schema.ts'],
      reason: 'Rotation needs a column.',
      options: [{ label: 'Allow', consequence: 'one column' }, { label: 'Refuse' }],
      recommendation: 'Allow.',
    });
    expect(outcome.isError).toBeUndefined();
    expect(outcome.structured).toEqual({ id: 'E-001-1', workTree: { root: workspace.root, from: 'server' } });
    expect(outcome.text).toContain('# Escalation E-001-1');
    expect(outcome.text).toContain('1. **Allow** - one column\n2. **Refuse**\n');
    expect(outcome.text).toContain('## The agent recommends\n\nAllow.\n');
    expect(outcome.text.endsWith('\nStop here until a person rules on E-001-1.')).toBe(true);
    const state = join(workspace.commonDir, 'spec-harness', 'escalations');
    expect(existsSync(state) ? readdirSync(state) : []).toContain('E-001-1.json');
  });

  it('request_escalation refuses what it cannot record', async () => {
    const call = (args: JsonObject) => tool('request_escalation').call(args);
    expect(await call({ reason: 'r' })).toEqual({ text: '"paths" must be a non-empty array of strings.', isError: true });
    expect(await call({ paths: [], reason: 'r' })).toEqual({ text: '"paths" must be a non-empty array of strings.', isError: true });
    expect(await call({ paths: [1], reason: 'r' })).toEqual({ text: '"paths" must be a non-empty array of strings.', isError: true });
    expect(await call({ paths: ['a', 2], reason: 'r' })).toEqual({ text: '"paths" must be a non-empty array of strings.', isError: true });
    expect(await call({ paths: ['a'], reason: ' ' })).toEqual({ text: '"reason" is required.', isError: true });
    expect(await call({ paths: ['a'] })).toEqual({ text: '"reason" is required.', isError: true });
    expect(await call({ paths: ['a'], reason: 'r', options: 'x' })).toEqual({ text: '"options" must be an array.', isError: true });
    expect(await call({ paths: ['a'], reason: 'r', recommendation: 3 })).toEqual({ text: '"recommendation" must be a string.', isError: true });
    expect(await call({ paths: ['a', ''], reason: 'r' })).toEqual({ text: '"paths[1]" is "", which names no file; give it the path of a file.', isError: true });
    expect(await call({ paths: ['a'], reason: '' })).toEqual({ text: '"reason" is required.', isError: true });
    expect(await call({ paths: ['a'], reason: 'r', recommendation: ' ' })).toEqual({
      text: '"recommendation" is " ", which recommends nothing; say which option and why, or leave it out.',
      isError: true,
    });
    expect((await call({ paths: ['a'], reason: 'r', why: 'x' })).isError).toBe(true);
  });

  it('audit_round reports the audit\'s findings, what it measured, and its counts', async () => {
    const outcome = await tool('audit_round').call({});
    expect(outcome.text).toContain('warning unmeasured: the round\'s changes were not measured: main and HEAD are the same commit');
    expect(outcome.text).toMatch(
      /\n\nmeasured: goals: none declared · premises: none declared · archive: asked · rulings: none · dependencies: not measured\n\n\d+ error\(s\), \d+ warning\(s\), \d+ note\(s\)$/,
    );
    expect((outcome.structured as { counts: Record<string, number> }).counts.warning).toBeGreaterThanOrEqual(1);
    expect((outcome.structured as { findings: unknown[] }).findings).toContainEqual(
      expect.objectContaining({ rule: 'unmeasured', severity: 'warning', message: expect.stringContaining('main and HEAD are the same commit') }),
    );
    expect((outcome.structured as { measured: unknown }).measured).toMatchObject({ changes: 'unmeasured', archive: 'asked', assertions: 'run', goals: { held: 0, failed: 0 } });
    expect(await tool('audit_round').call({ base: 7 })).toEqual({ text: '"base" must be a string.', isError: true });
    const unbased = await tool('audit_round').call({ base: 'nowhere' });
    expect(unbased.text).toContain('"nowhere" names no commit');
  });

  it('audit_round says what it measured when it finds nothing, so nothing found is not read as nothing checked', async () => {
    const clean = repository({ [BRIEF_FILE]: brief({ affected: ['src/**'], body: '## Goals\n\n<!-- @assert-absence target="src" symbol="OldToken" -->\n' }), 'src/a.ts': 'a\n' });
    clean.git('checkout', '-q', '-b', 'brief/001-x');
    clean.write('src/b.ts', 'b\n');
    clean.commit('work');
    const other = await openWorkspace(parseOptions(['mcp']), { stdout: { write: () => true }, stderr: { write: () => true }, cwd: clean.root, env: {} });
    const audited = await tools(other, {}).find((t) => t.descriptor.name === 'audit_round')?.call({});
    expect(audited?.text).toBe(
      'The audit found nothing in what it measured.\n\nmeasured: goals: 1 held, 0 failed · premises: none declared · archive: asked · rulings: none · dependencies: 0 changed, 0 unread\n\n0 error(s), 0 warning(s), 0 note(s)',
    );
  });

  it('audit_round names a package the round allowed to run install scripts, and counts it in what it measured', async () => {
    const before = { name: 'x', dependencies: { sharp: '^0.33.0' } };
    const allowed = repository({ [BRIEF_FILE]: brief({ affected: ['**'] }), 'package.json': `${JSON.stringify(before)}\n` });
    allowed.git('checkout', '-q', '-b', 'brief/001-x');
    allowed.write('package.json', `${JSON.stringify({ ...before, allowScripts: { 'sharp@0.33.5': true } })}\n`);
    allowed.commit('work');
    const other = await openWorkspace(parseOptions(['mcp']), { stdout: { write: () => true }, stderr: { write: () => true }, cwd: allowed.root, env: {} });
    const audited = await tools(other, {}).find((t) => t.descriptor.name === 'audit_round')?.call({});
    expect(audited?.text).toBe(
      [
        'warning install-script-allowed: the round allowed "sharp@0.33.5" to run install scripts in package.json (allowScripts). Next: say in the brief why its install scripts must run, or remove the entry; an install script is code no reviewer read, run on every install',
        '',
        'measured: goals: none declared · premises: none declared · archive: asked · rulings: none · dependencies: 0 changed, 0 unread · install scripts: 1 changed',
        '',
        '0 error(s), 1 warning(s), 0 note(s)',
      ].join('\n'),
    );
    expect((audited?.structured as { measured: unknown }).measured).toMatchObject({ dependencies: { changed: 0, unread: 0 }, installScripts: { changed: 1 } });
  });

  it('list_rounds lists the live briefs and what each waits on', async () => {
    const outcome = await tool('list_rounds').call({});
    expect(outcome.text).toBe('001 Rotate tokens - active, wave -, ready\n002 Next - active, wave -, waits on 1');
    expect((outcome.structured as { briefs: { id: string }[] }).briefs.map((b) => b.id)).toEqual(['001', '002']);
    // The id is its own field, so the title does not say it again, here or in the text.
    expect((outcome.structured as { briefs: { title: string | null }[] }).briefs.map((b) => b.title)).toEqual(['Rotate tokens', 'Next']);
    expect(await tool('list_rounds').call({ all: true })).toEqual({ text: 'Unknown argument "all"; this tool takes no arguments.', isError: true });
  });

  it('list_rounds says when there is no live brief', async () => {
    const empty = repository({ 'briefs/archive/001_x.md': brief({ status: 'archived' }) });
    const other = await openWorkspace(parseOptions(['mcp']), { stdout: { write: () => true }, stderr: { write: () => true }, cwd: empty.root, env: {} });
    const listed = tools(other, {}).find((t) => t.descriptor.name === 'list_rounds');
    expect(await listed?.call({})).toEqual({ text: 'No live brief.', structured: { briefs: [] } });
  });

  it('reads the brief SPEC_BRIEF names when the branch names none', async () => {
    const plain = repository({ [BRIEF_FILE]: brief() });
    const other = await openWorkspace(parseOptions(['mcp']), { stdout: { write: () => true }, stderr: { write: () => true }, cwd: plain.root, env: {} });
    const start = (env: Record<string, string>) => tools(other, env).find((t) => t.descriptor.name === 'start_round')?.call({});
    expect((await start({ SPEC_BRIEF: '1' }))?.structured).toMatchObject({ brief: '001' });
    expect((await start({}))?.text).toContain('no brief is named');
  });

  it('request_escalation records a request with no options and no recommendation, and says neither', async () => {
    const outcome = await tool('request_escalation').call({ paths: ['src/db/schema.ts'], reason: 'A column.' });
    expect(outcome.isError).toBeUndefined();
    expect(outcome.text).toContain('## Why\n\nA column.\n\n## To rule\n');
    expect(outcome.text).not.toContain('## Options');
    expect(outcome.text).not.toContain('## The agent recommends');
  });

  it('request_escalation refuses a choice with no label, which the memo numbered and did not name, and writes nothing', async () => {
    const state = join(workspace.commonDir, 'spec-harness', 'escalations');
    const before = existsSync(state) ? readdirSync(state) : [];
    const call = (options: unknown) => tool('request_escalation').call({ paths: ['src/db/schema.ts'], reason: 'A column.', options } as JsonObject);
    const unnamed = (index: number, label: string) => ({
      text: `"options[${index}].label" is ${JSON.stringify(label)}, which names no choice; give the option a label, or leave the option out.`,
      isError: true,
    });
    expect(await call([{ label: '', consequence: 'no column' }])).toEqual(unnamed(0, ''));
    expect(await call([{ label: 'Allow', consequence: 'one column' }, { label: ' ', consequence: '' }])).toEqual(unnamed(1, ' '));
    // A choice with no label at all, and one that is no object, have none to name it by.
    expect(await call([{ consequence: 'no column' }])).toEqual({ text: '"options[0].label" must be a string.', isError: true });
    expect(await call([{ label: 5, consequence: 'x' }])).toEqual({ text: '"options[0].label" must be a string.', isError: true });
    expect(await call([{ label: 'Allow' }, 'Refuse'])).toEqual({ text: '"options[1].label" must be a string.', isError: true });
    expect(await call([null])).toEqual({ text: '"options[0].label" must be a string.', isError: true });
    expect(await call([{ label: 'Allow', consequence: 3 }])).toEqual({ text: '"options[0].consequence" must be a string.', isError: true });
    expect(existsSync(state) ? readdirSync(state) : []).toEqual(before);
  });

  it('request_escalation records a choice whose cost is left out as the choice alone, and trims both', async () => {
    const outcome = await tool('request_escalation').call({
      paths: ['src/db/schema.ts'],
      reason: 'A column.',
      options: [{ label: ' Allow ', consequence: ' one column ' }, { label: 'Refuse', consequence: null }, { label: 'Wait', consequence: ' ' }],
    });
    expect(outcome.isError).toBeUndefined();
    expect(outcome.text).toContain('## Options\n\n1. **Allow** - one column\n2. **Refuse**\n3. **Wait**\n');
    // No list of choices at all is none, as before.
    expect((await tool('request_escalation').call({ paths: ['src/db/schema.ts'], reason: 'A column.', options: null })).text).not.toContain('## Options');
  });

  it('request_escalation and audit_round act on the brief they are given', async () => {
    const other = await tool('request_escalation').call({ paths: ['lib/x.ts'], reason: 'r', brief: '2' });
    expect(other.structured).toEqual({ id: 'E-002-1', workTree: { root: workspace.root, from: 'server' } });
    expect(other.text).toContain('Brief 002 (`briefs/002_next.md`)');
    const nowhere = { text: '"brief" names brief 404, and spec-brief knows no such brief', isError: true };
    expect(await tool('request_escalation').call({ paths: ['a'], reason: 'r', brief: '404' })).toEqual(nowhere);
    expect(await tool('audit_round').call({ brief: '404' })).toEqual(nowhere);
    const audited = await tool('audit_round').call({ brief: '2' });
    expect((audited.structured as { findings: { file?: string }[] }).findings.map((f) => f.file).filter((file) => file !== undefined)).toContain('briefs/002_next.md');
    expect((await tool('audit_round').call({})).text).not.toContain('briefs/002_next.md');
  });

  it('audit_round gives each finding a line of its own', async () => {
    const outcome = await tool('audit_round').call({ brief: '2' });
    const findings = (outcome.structured as { findings: { severity: string; rule: string }[] }).findings;
    expect(findings.length).toBeGreaterThanOrEqual(2);
    const lines = (outcome.text.split('\n\n')[0] ?? '').split('\n');
    expect(lines.map((line) => line.slice(0, line.indexOf(':')))).toEqual(findings.map((f) => `${f.severity} ${f.rule}`));
  });

  it('start_round names the documents the budget leaves out and those it cannot find', async () => {
    const small = repository(
      { [BRIEF_FILE]: brief({ body: 'See [a](../docs/a.md) and [gone](../docs/gone.md).\n' }), 'docs/a.md': `# A\n\n${'text '.repeat(40)}\n` },
      { context: { budget: 100 } },
    );
    const other = await openWorkspace(parseOptions(['mcp']), { stdout: { write: () => true }, stderr: { write: () => true }, cwd: small.root, env: {} });
    const outcome = await tools(other, { SPEC_BRIEF: '1' }).find((t) => t.descriptor.name === 'start_round')?.call({});
    expect(outcome?.structured).toMatchObject({ included: [], omitted: ['docs/a.md'], unresolved: ['docs/gone.md'] });
  });

  it('list_rounds lists a brief without a title by its id, one without a status as unknown, and every brief one waits on', async () => {
    const untitled = [
      '---',
      'status: draft',
      'dependsOn: [1, 2]',
      '---',
      '',
      '## Intent',
      '',
      'x',
      '',
      '## Negative Scope',
      '',
      '- none',
      '',
      '## Invariants',
      '',
      '- [ ] y',
      '',
    ].join('\n');
    const unstated = untitled.replace('status: draft\ndependsOn: [1, 2]\n', '').replace('## Intent', '# 004 - Unstated\n\n## Intent');
    const many = repository({
      [BRIEF_FILE]: brief(),
      'briefs/002_other.md': brief({ title: '002 - Other' }),
      'briefs/003_untitled.md': untitled,
      'briefs/004_unstated.md': unstated,
    });
    const other = await openWorkspace(parseOptions(['mcp']), { stdout: { write: () => true }, stderr: { write: () => true }, cwd: many.root, env: {} });
    const listed = await tools(other, {}).find((t) => t.descriptor.name === 'list_rounds')?.call({});
    expect(listed?.text.split('\n')).toContain('003 - draft, wave -, waits on 1, 2');
    expect(listed?.text.split('\n')).toContain('004 Unstated - unknown, wave -, ready');
  });
});

describe('the work tree a tool reads the round in (ADR-0008)', () => {
  // The server is started once, for the project Claude Code names. A session
  // in a worktree works there, and check_path read every path as the
  // project's, start_round the project's branch.
  const QUIET = { stdout: { write: () => true }, stderr: { write: () => true }, env: {} };
  let project: Repository;
  let server: Workspace;
  let tree: string;
  let other: string;

  beforeAll(async () => {
    project = repository({ [BRIEF_FILE]: brief({ affected: ['src/auth/**'], protected: ['src/db/**'] }), '.gitignore': 'node_modules/\n.claude/worktrees/\n', 'src/db/schema.ts': 'table;\n' }, null);
    install(project.root, 'spec-brief');
    tree = join(project.root, '.claude', 'worktrees', 'w');
    project.git('worktree', 'add', '-q', '-b', 'claude/brief-001-w', tree);
    other = join(temp(), 'other');
    project.git('worktree', 'add', '-q', '-b', 'claude/brief-001-o', other);
    server = await openWorkspace(parseOptions(['mcp']), { ...QUIET, cwd: project.root });
  });

  const called = async (name: string, args: JsonObject, roots?: Roots) => {
    const found = tools(server, {}, roots).find((candidate) => candidate.descriptor.name === name);
    return found!.call(args);
  };

  it('is the one the client\'s roots name, where they name one work tree of this repository, and is said', async () => {
    const started = await called('start_round', {}, async () => [tree]);
    expect(started.isError).toBeUndefined();
    expect(started.structured).toMatchObject({ brief: '001', workTree: { root: expect.stringMatching(/\.claude\/worktrees\/w$/), from: 'roots' } });
    expect(started.text).toMatch(/\n\nRead in the work tree at .*\.claude\/worktrees\/w, which the client's roots name\.$/);
    // A directory below the worktree's top names it as well.
    expect((await called('start_round', {}, async () => [join(tree, 'src')])).structured).toMatchObject({ workTree: { from: 'roots' } });
  });

  it("is the server's own where the roots name none, two, or only work trees of another repository, as before", async () => {
    const elsewhere = repository({});
    for (const roots of [async () => null, async () => [], async () => [tree, other], async () => [elsewhere.root, temp()]] as Roots[]) {
      const outcome = await called('start_round', {}, roots);
      // The project's branch names no brief, which a round needs.
      expect(outcome.isError, String(roots)).toBe(true);
    }
  });

  it('is the one a "directory" given names, over the roots, and refuses one in no work tree of this repository', async () => {
    const outcome = await called('audit_round', { directory: other }, async () => [tree]);
    expect(outcome.structured).toMatchObject({ workTree: { root: expect.stringMatching(/other$/), from: 'argument' } });
    expect(outcome.text).toMatch(/which the "directory" given name\.$/);
    // Relative to the project.
    expect((await called('start_round', { directory: '.claude/worktrees/w' })).structured).toMatchObject({ brief: '001', workTree: { from: 'argument' } });
    expect(await called('start_round', { directory: '' })).toMatchObject({ isError: true, text: '"directory" is "", which names no directory; give it the directory the round is in, or leave it out.' });
    expect(await called('start_round', { directory: 7 })).toMatchObject({ isError: true, text: '"directory" must be a string.' });
    // Every tool that reads a branch takes it, and refuses one that is no string.
    expect((await called('check_path', { paths: ['src/db/schema.ts'], directory: tree })).structured).toMatchObject({ workTree: { from: 'argument' }, decisions: [{ verdict: 'deny' }] });
    expect((await called('request_escalation', { paths: ['src/db/schema.ts'], reason: 'The schema moves.', directory: tree })).structured).toMatchObject({ workTree: { from: 'argument' } });
    for (const [name, args] of [
      ['check_path', { paths: ['src/db/schema.ts'] }],
      ['request_escalation', { paths: ['src/db/schema.ts'], reason: 'The schema moves.' }],
      ['audit_round', {}],
    ] as [string, JsonObject][]) {
      expect(await called(name, { ...args, directory: 7 }), name).toMatchObject({ isError: true, text: '"directory" must be a string.' });
    }
    const elsewhere = temp();
    expect(await called('start_round', { directory: elsewhere })).toMatchObject({
      isError: true,
      text: `"directory" is ${JSON.stringify(elsewhere)}, which is in no work tree of this repository; give a directory in the project or in one of its worktrees, or leave it out.`,
    });
  });

  it('decides an absolute path in check_path by the work tree of this repository that holds it, wherever the round is read', async () => {
    const decided = async (paths: string[], roots?: Roots) => ((await called('check_path', { paths }, roots)).structured as { decisions: { verdict: string; path: string }[] }).decisions.map((d) => [d.path, d.verdict]);
    // The server's own work tree names no brief; each worktree's branch names 001.
    expect(await decided([join(tree, 'src', 'db', 'schema.ts')])).toEqual([['src/db/schema.ts', 'deny']]);
    expect(await decided([join(other, 'src', 'db', 'schema.ts'), join(other, 'src', 'auth', 'a.ts')])).toEqual([
      ['src/db/schema.ts', 'deny'],
      ['src/auth/a.ts', 'allow'],
    ]);
    // A relative path is read from the work tree the round is read in.
    expect(await decided(['src/db/schema.ts'], async () => [tree])).toEqual([['src/db/schema.ts', 'deny']]);
    // The project's own file under the project's branch, which names no
    // brief: no brief governs it, as the hook passes a write of it.
    const own = await called('check_path', { paths: [join(project.root, 'src', 'db', 'schema.ts')] });
    expect((own.structured as { decisions: { reason: string }[] }).decisions.map((d) => d.reason)).toEqual(['no-brief']);
  });

  it("asks the client for its roots only where it declared them, by a request of its own, and reads the answer by that request's id", async () => {
    const written: string[] = [];
    const client = rootsClient((line) => written.push(line), 1_000);
    expect(await client.ask()).toBeNull();
    expect(written).toEqual([]);
    expect(client.observe({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { capabilities: { roots: { listChanged: true } } } })).toBe(false);
    const asked = client.ask();
    expect(written.map((line) => JSON.parse(line))).toEqual([{ jsonrpc: '2.0', id: 'spec-harness-roots-1', method: 'roots/list' }]);
    // Another id, and a request of the client's, are not the answer.
    expect(client.observe({ jsonrpc: '2.0', id: 'spec-harness-roots-9', result: { roots: [] } })).toBe(false);
    expect(client.observe({ jsonrpc: '2.0', id: 'spec-harness-roots-1', method: 'ping' })).toBe(false);
    const uri = pathToFileURL(tree).href;
    // A uri that is no string is none, one shaped as Node reads a URL among them.
    const shaped = pathToFileURL(repo.root);
    const object = { href: shaped.href, protocol: shaped.protocol, hostname: shaped.hostname, pathname: shaped.pathname };
    expect(client.observe({ jsonrpc: '2.0', id: 'spec-harness-roots-1', result: { roots: [{ uri, name: 'w' }, { uri: 'https://example.com/x' }, { uri: 7 }, { uri: object }, null] } })).toBe(true);
    expect(await asked).toEqual([tree]);
    // An answer to a request answered already is none.
    expect(client.observe({ jsonrpc: '2.0', id: 'spec-harness-roots-1', result: { roots: [] } })).toBe(false);
    // Asked again, under another id; an error, or no answer in time, is no roots.
    const again = client.ask();
    expect(JSON.parse(written[1]!)).toMatchObject({ id: 'spec-harness-roots-2' });
    client.observe({ jsonrpc: '2.0', id: 'spec-harness-roots-2', error: { code: -32601, message: 'Method not found' } });
    expect(await again).toBeNull();
    expect(await client.ask()).toBeNull();
    // A capability declared in a request's _meta, as a client of the newer protocol sends it, is declared too.
    const sent: string[] = [];
    const modern = rootsClient((line) => sent.push(line), 1);
    modern.observe({ jsonrpc: '2.0', id: 3, method: 'tools/list', params: { _meta: { 'io.modelcontextprotocol/clientCapabilities': { roots: {} } } } });
    expect(await modern.ask()).toBeNull();
    expect(sent).toHaveLength(1);
    // A message that is no object is no answer.
    expect(client.observe('x')).toBe(false);
    expect(client.observe(null)).toBe(false);
    // Capabilities with no roots, or roots named where no capabilities are declared, declare none.
    const none: string[] = [];
    const bare = rootsClient((line) => none.push(line), 1);
    bare.observe({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { capabilities: {} } });
    bare.observe({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { capabilities: { roots: {} } } });
    bare.observe({ jsonrpc: '2.0', id: 3, method: 'initialize' });
    expect(await bare.ask()).toBeNull();
    expect(none).toEqual([]);
  });

  it('lets go of the time it waits for an answer once one comes', async () => {
    vi.useFakeTimers();
    try {
      const client = rootsClient(() => undefined, 5_000);
      client.observe({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { capabilities: { roots: {} } } });
      const asked = client.ask();
      expect(vi.getTimerCount()).toBe(1);
      client.observe({ jsonrpc: '2.0', id: 'spec-harness-roots-1', result: { roots: [] } });
      expect(await asked).toEqual([]);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reads a worktree on no branch by the branch the forge's CI names, as every command does", async () => {
    const detached = join(temp(), 'detached');
    project.git('worktree', 'add', '-q', '--detach', detached);
    const found = tools(server, { GITHUB_HEAD_REF: 'claude/brief-001-ci' }).find((candidate) => candidate.descriptor.name === 'start_round');
    expect((await found!.call({ directory: detached })).structured).toMatchObject({ brief: '001', workTree: { from: 'argument' } });
  });
});

describe('the prompts', () => {
  it('are the four skills, without their front matter, with the argument appended', async () => {
    const list = prompts();
    expect(list.map((p) => p.descriptor.name)).toEqual(['draft-brief', 'split-goal', 'run-round', 'close-round']);
    const run = list.find((p) => p.descriptor.name === 'run-round');
    const message = (await run?.get({ brief: '012' })) as { description: string; messages: { role: string; content: { type: string; text: string } }[] };
    expect(message.description).toBe('Run a round');
    expect(message.messages[0]?.role).toBe('user');
    const text = message.messages[0]?.content.text ?? '';
    expect(text.startsWith('# Run a round')).toBe(true);
    expect(text).not.toContain('name: run-round');
    expect(text.endsWith('\n\nbrief: 012')).toBe(true);
    const bare = (await run?.get({ brief: '' })) as { messages: { content: { text: string } }[] };
    expect(bare.messages[0]?.content.text.endsWith('brief: ')).toBe(false);
  });

  it('each take one optional argument, named for what it appends, and serve the skill alone without it', async () => {
    const skills = { 'draft-brief': 'request', 'split-goal': 'goal', 'run-round': 'brief', 'close-round': 'brief' };
    const titles = new Set<string>();
    for (const prompt of prompts()) {
      const { name, title, arguments: args } = prompt.descriptor as unknown as { name: keyof typeof skills; title: string; arguments: { name: string; description: string; required: boolean }[] };
      expect(title.length, name).toBeGreaterThan(0);
      titles.add(title);
      expect(args.map((a) => ({ name: a.name, required: a.required })), name).toEqual([{ name: skills[name], required: false }]);
      expect(args[0]?.description.length, name).toBeGreaterThan(0);
      const skill = readFileSync(join(ROOT, 'skills', name, 'SKILL.md'), 'utf8');
      const body = skill.slice(skill.indexOf('\n---\n', 4) + '\n---\n'.length).trim();
      const bare = (await prompt.get({})) as { description: string; messages: { role: string; content: { type: string; text: string } }[] };
      expect(bare).toEqual({ description: title, messages: [{ role: 'user', content: { type: 'text', text: body } }] });
      const given = (await prompt.get({ [skills[name]]: 'x' })) as { messages: { content: { text: string } }[] };
      expect(given.messages[0]?.content.text, name).toBe(`${body}\n\n${skills[name]}: x`);
    }
    expect(titles.size).toBe(4);
  });
});

describe('the server', () => {
  const handle = () => createMcpServer({ name: 'spec-harness', version: '0.1.0', instructions: INSTRUCTIONS, tools: tools(workspace, {}), prompts: prompts() });

  it('answers initialize with its instructions and capabilities', async () => {
    const answer = await handle()({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
    expect(answer).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: { protocolVersion: '2025-06-18', capabilities: { tools: {}, prompts: {} }, serverInfo: { name: 'spec-harness' }, instructions: INSTRUCTIONS },
    });
    expect(INSTRUCTIONS).toContain('start_round');
  });

  it('lists its tools, calls check_path and gets a prompt', async () => {
    const server = handle();
    const list = (await server({ jsonrpc: '2.0', id: 2, method: 'tools/list' })) as unknown as { result: { tools: { name: string }[] } };
    expect(list.result.tools.map((t) => t.name)).toContain('check_path');
    const call = (await server({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'check_path', arguments: { paths: ['src/db/schema.ts'] } } })) as unknown as {
      result: { content: { type: string; text: string }[]; structuredContent: { decisions: { verdict: string; reason: string }[] }; isError?: boolean };
    };
    expect(call.result.isError).toBeUndefined();
    expect(call.result.content[0]?.text.startsWith('deny: brief 001 does not empower')).toBe(true);
    expect(call.result.structuredContent.decisions[0]).toMatchObject({ verdict: 'deny', reason: 'protected' });
    const prompt = (await server({ jsonrpc: '2.0', id: 4, method: 'prompts/get', params: { name: 'close-round', arguments: { brief: '001' } } })) as unknown as {
      result: { messages: { content: { text: string } }[] };
    };
    expect(prompt.result.messages[0]?.content.text).toContain('brief: 001');
  });

  it('reports a failing tool to the model, not as a protocol error', async () => {
    const broken = await openWorkspace(parseOptions(['mcp']), { stdout: { write: () => true }, stderr: { write: () => true }, cwd: repo.root, env: {} });
    const server = createMcpServer({
      name: 'spec-harness',
      version: '0',
      instructions: '',
      tools: tools({ ...broken, siblings: { ...broken.siblings, briefs: async () => Promise.reject(new Error('spec-brief is gone')) } }, {}),
    });
    const answer = (await server({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'list_rounds', arguments: {} } })) as unknown as { result: { isError: boolean; content: { text: string }[] } };
    expect(answer.result).toMatchObject({ isError: true, content: [{ type: 'text', text: 'spec-harness failed: spec-brief is gone' }] });
  });
});

describe('the mcp command', () => {
  const session = `${[
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'check_path', arguments: { paths: ['src/db/schema.ts'] } } },
  ]
    .map((message) => JSON.stringify(message))
    .join('\n')}\n`;

  const answers = (stdout: string) =>
    stdout
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => JSON.parse(line) as { id: number; result: { serverInfo?: unknown; structuredContent?: { decisions: { verdict: string }[] } } })
      .sort((a, b) => a.id - b.id);

  it('answers for the project CLAUDE_PROJECT_DIR names, one line per answer, as spec-harness at its version', async () => {
    const served = await cli(['mcp'], temp(), { env: { CLAUDE_PROJECT_DIR: repo.root }, stdin: session });
    expect(served).toMatchObject({ code: 0, stderr: '' });
    expect(served.stdout.endsWith('}\n')).toBe(true);
    const [initialized, called] = answers(served.stdout);
    expect(initialized?.result.serverInfo).toEqual({ name: 'spec-harness', version: version() });
    expect(called?.result.structuredContent?.decisions.map((d) => d.verdict)).toEqual(['deny']);
  });

  it("starts as the MCP Registry lists it: server.json's arguments, in the directory a client that names no project starts it in, at the version server.json names", async () => {
    const listing = JSON.parse(readFileSync(join(ROOT, 'server.json'), 'utf8')) as { version: string; packages: Array<{ packageArguments: Array<{ value: string }> }> };
    const served = await cli(
      listing.packages[0]!.packageArguments.map((argument) => argument.value),
      repo.root,
      { stdin: session },
    );
    expect(served).toMatchObject({ code: 0, stderr: '' });
    const [initialized, called] = answers(served.stdout);
    expect(initialized?.result.serverInfo).toEqual({ name: 'spec-harness', version: listing.version });
    expect(called?.result.structuredContent?.decisions.map((d) => d.verdict)).toEqual(['deny']);
  });

  it('starts where the configuration does not load, lists its tools, and has each say why it cannot answer (ADR-0008, amended 2026-11-08)', async () => {
    const broken = repository({ [BRIEF_FILE]: brief() });
    broken.write('.spec-harness.json', '{ "outOfScope": "sideways" }\n');
    const listing = `${[
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'check_path', arguments: { paths: ['src/db/schema.ts'] } } },
    ]
      .map((message) => JSON.stringify(message))
      .join('\n')}\n`;
    const served = await cli(['mcp'], broken.root, { env: { CLAUDE_PROJECT_DIR: broken.root }, stdin: listing });
    expect(served).toMatchObject({ code: 0, stderr: '' });
    const said = served.stdout
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => JSON.parse(line) as { id: number; result: { tools?: { name: string }[]; isError?: boolean; content?: { text: string }[] } })
      .sort((a, b) => a.id - b.id);
    expect(said[1]?.result.tools?.map((tool) => tool.name)).toEqual(['start_round', 'check_path', 'request_escalation', 'audit_round', 'list_rounds']);
    // A root that is no work tree still stops it, as it stops every command.
    expect((await cli(['mcp'], temp(), { env: { CLAUDE_PROJECT_DIR: temp() }, stdin: listing })).code).toBe(2);
    expect(said[2]?.result).toMatchObject({
      isError: true,
      content: [{ text: 'spec-harness failed: .spec-harness.json: "outOfScope" must be "warn", "ask" or "deny", so no tool can answer until it loads; it is read again at every call' }],
    });
  });

  it('reads the configuration again at every call where it did not load, and answers once it is mended', async () => {
    const mended = repository({ [BRIEF_FILE]: brief() });
    mended.git('checkout', '-q', '-b', 'brief/001-rotate');
    mended.write('.spec-harness.json', '{ "outOfScope": "sideways" }\n');
    const quiet = { write: () => true };
    const io = { stdout: quiet, stderr: quiet, cwd: mended.root, env: {} };
    const check = toolsOpeningAgain(() => openWorkspace(parseOptions(['mcp']), io), mended.root, {}).find((tool) => tool.descriptor.name === 'check_path')!;
    await expect(check.call({ paths: ['src/db/schema.ts'] })).rejects.toThrow(
      '.spec-harness.json: "outOfScope" must be "warn", "ask" or "deny", so no tool can answer until it loads; it is read again at every call',
    );
    mended.write('.spec-harness.json', `${JSON.stringify({ base: 'main', tools: siblings() })}\n`);
    const answered = await check.call({ paths: ['src/db/schema.ts'] });
    expect(answered.isError).toBeUndefined();
    expect(answered.text).toContain('src/db/schema.ts');
    // An error that is not the configuration's is the tool's error as it is.
    const failing = toolsOpeningAgain(() => Promise.reject(new Error('git is gone')), mended.root, {}).find((tool) => tool.descriptor.name === 'list_rounds')!;
    await expect(failing.call({})).rejects.toThrow(/^git is gone$/);
  });

  it('answers for --root over CLAUDE_PROJECT_DIR, and for where it runs when that is empty', async () => {
    const rooted = await cli(['mcp', '--root', repo.root], temp(), { env: { CLAUDE_PROJECT_DIR: temp() }, stdin: session });
    expect(rooted.code).toBe(0);
    expect(answers(rooted.stdout)[1]?.result.structuredContent?.decisions.map((d) => d.verdict)).toEqual(['deny']);
    const here = await cli(['mcp'], repo.root, { env: { CLAUDE_PROJECT_DIR: '' }, stdin: session });
    expect(here.code).toBe(0);
    expect(answers(here.stdout)).toHaveLength(2);
  });
});

describe('over stdio, as a client runs it', () => {
  it('serves initialize, tools/list and a check_path call from the built command line', async () => {
    if (!existsSync(join(ROOT, 'dist', 'cli.js'))) throw new Error('dist/cli.js is missing: run "npm run build" before the suite');
    const child = spawn(process.execPath, [BIN, 'mcp'], { cwd: repo.root, env: { ...process.env, SPEC_BRIEF: '' }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
    const messages = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'check_path', arguments: { paths: ['src/db/schema.ts', 'src/auth/x.ts'] } } },
    ];
    child.stdin.end(`${messages.map((m) => JSON.stringify(m)).join('\n')}\n`);
    const code = await new Promise<number | null>((resolve) => child.once('close', resolve));
    expect(stderr).toBe('');
    expect(code).toBe(0);
    const answers = stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { id: number; result: Record<string, unknown> })
      .sort((a, b) => a.id - b.id);
    expect(answers.map((a) => a.id)).toEqual([1, 2, 3]);
    expect(answers[0]?.result).toMatchObject({ serverInfo: { name: 'spec-harness' }, instructions: INSTRUCTIONS });
    expect((answers[1]?.result['tools'] as { name: string }[]).map((t) => t.name)).toEqual(['start_round', 'check_path', 'request_escalation', 'audit_round', 'list_rounds']);
    const decisions = (answers[2]?.result['structuredContent'] as { decisions: { verdict: string }[] }).decisions;
    expect(decisions.map((d) => d.verdict)).toEqual(['deny', 'allow']);
  });

  it("asks a client that declares roots for them, and reads the round in the one work tree they name (ADR-0008)", async () => {
    if (!existsSync(join(ROOT, 'dist', 'cli.js'))) throw new Error('dist/cli.js is missing: run "npm run build" before the suite');
    const project = repository({ [BRIEF_FILE]: brief({ affected: ['src/auth/**'], protected: ['src/db/**'] }), '.gitignore': 'node_modules/\n' }, null);
    install(project.root, 'spec-brief');
    const tree = join(temp(), 'w');
    project.git('worktree', 'add', '-q', '-b', 'claude/brief-001-w', tree);
    const child = spawn(process.execPath, [BIN, 'mcp'], { cwd: project.root, env: { ...process.env, SPEC_BRIEF: '', CLAUDE_PROJECT_DIR: project.root }, stdio: ['pipe', 'pipe', 'pipe'] });
    const lines: Record<string, unknown>[] = [];
    let buffer = '';
    const send = (message: unknown): void => {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    };
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      buffer += chunk;
      for (let at = buffer.indexOf('\n'); at !== -1; at = buffer.indexOf('\n')) {
        const message = JSON.parse(buffer.slice(0, at)) as Record<string, unknown>;
        buffer = buffer.slice(at + 1);
        lines.push(message);
        // The client of this test answers the server's request as Claude Code's MCP page has Claude Code answer it.
        if (message['method'] === 'roots/list') send({ jsonrpc: '2.0', id: message['id'], result: { roots: [{ uri: pathToFileURL(tree).href }] } });
        if (message['id'] === 2) child.stdin.end();
      }
    });
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: { roots: { listChanged: true } }, clientInfo: { name: 't', version: '1' } } });
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'start_round', arguments: {} } });
    expect(await new Promise<number | null>((resolve) => child.once('close', resolve))).toBe(0);
    expect(lines.filter((message) => message['method'] === 'roots/list')).toHaveLength(1);
    const result = lines.find((message) => message['id'] === 2)?.['result'] as { structuredContent: { brief: string; workTree: { from: string } } };
    expect(result.structuredContent).toMatchObject({ brief: '001', workTree: { from: 'roots' } });
  });
});
