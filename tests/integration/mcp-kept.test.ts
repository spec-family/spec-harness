/**
 * The work tree the server opens as it starts is the one every call answers
 * from, where the configuration loads then; only where it does not is the
 * work tree opened again at each call (ADR-0008, amended 2026-11-08). The
 * opening is counted here, in a file of its own, since it mocks the module
 * that opens it.
 */

import { afterAll, describe, expect, it, vi } from 'vitest';

const opened = vi.hoisted(() => ({ count: 0 }));

vi.mock('../../src/workspace.js', async (original) => {
  const actual = await original<typeof import('../../src/workspace.js')>();
  return {
    ...actual,
    openWorkspace: async (...args: Parameters<typeof actual.openWorkspace>) => {
      opened.count += 1;
      return actual.openWorkspace(...args);
    },
  };
});

import { brief, BRIEF_FILE, cleanup, cli, repository } from './helpers.js';

afterAll(cleanup);

describe('the work tree the server opened as it started', () => {
  const session = `${[
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_rounds', arguments: {} } },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_rounds', arguments: {} } },
  ]
    .map((message) => JSON.stringify(message))
    .join('\n')}\n`;

  it('answers every call, where the configuration loaded, without opening it again', async () => {
    const repo = repository({ [BRIEF_FILE]: brief() });
    opened.count = 0;
    const served = await cli(['mcp'], repo.root, { env: { CLAUDE_PROJECT_DIR: repo.root }, stdin: session });
    expect(served).toMatchObject({ code: 0, stderr: '' });
    expect(served.stdout.split('\n').filter((line) => line !== '')).toHaveLength(3);
    expect(opened.count).toBe(1);
  });

  it('opens it again at each call where the configuration did not load', async () => {
    const repo = repository({ [BRIEF_FILE]: brief() });
    repo.write('.spec-harness.json', '{ "outOfScope": "sideways" }\n');
    opened.count = 0;
    const served = await cli(['mcp'], repo.root, { env: { CLAUDE_PROJECT_DIR: repo.root }, stdin: session });
    expect(served).toMatchObject({ code: 0, stderr: '' });
    expect(opened.count).toBe(3);
  });
});
