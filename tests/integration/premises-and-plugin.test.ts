/**
 * `premises` and the spec-brief plugin, against real repositories, the real
 * spec-brief and spec-guard, and a real SSH signature.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { waive } from '../../src/plugin.js';
import { premisesCommand } from '../../src/premises.js';
import { parseOptions, type CliIO } from '../../src/workspace.js';

const HERE = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = join(HERE, '..', '..');
const BIN = (tool: string): string => join(ROOT, 'node_modules', '@spec-family', tool, 'bin', `${tool}.js`).replace(/\\/g, '/');

const made: string[] = [];
afterEach(() => {
  for (const directory of made.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function repository(): string {
  const root = mkdtempSync(join(tmpdir(), 'spec-harness-test-'));
  made.push(root);
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 't@example.com');
  git(root, 'config', 'user.name', 'T');
  git(root, 'config', 'core.autocrlf', 'false');
  write(
    root,
    '.spec-harness.json',
    `${JSON.stringify({ base: 'main', tools: { 'spec-brief': ['node', BIN('spec-brief')], 'spec-guard': ['node', BIN('spec-guard')] } }, null, 2)}\n`,
  );
  return root;
}

function io(cwd: string): CliIO & { out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, stdout: { write: (t: string) => out.push(t) }, stderr: { write: (t: string) => err.push(t) }, cwd, env: {} };
}

const BRIEF = `---
status: active
wave: 1
affectedFiles: [src/**]
protectedFiles: [src/db/schema.ts]
---

# 001 - Remove the legacy call

## Intent

No caller uses legacyCall.

## Negative Scope

- Nothing else.

## The Defect, Measured

<!-- @assert-count target="src" symbol="legacyCall" min="1" reason="the defect: legacyCall is still called" -->

## Invariants

<!-- @assert-absence target="src" symbol="legacyCall" reason="the goal: nothing calls legacyCall" -->

- [ ] legacyCall is gone
`;

describe('premises', () => {
  it('passes while every premise holds, whatever the goals say', async () => {
    const root = repository();
    write(root, 'briefs/001_remove.md', BRIEF);
    write(root, 'src/a.ts', 'legacyCall();\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-qm', 'start');
    const cli = io(root);
    const code = await premisesCommand(parseOptions(['premises']), cli);
    expect(cli.err.join('')).toBe('');
    expect(code).toBe(0);
    expect(cli.out.join('')).toContain('1 premise(s) in 1 live brief(s), 0 no longer hold');
  });

  it('fails when a live brief\'s premise no longer holds', async () => {
    const root = repository();
    write(root, 'briefs/001_remove.md', BRIEF);
    write(root, 'src/a.ts', 'modernCall();\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-qm', 'start');
    const cli = io(root);
    const code = await premisesCommand(parseOptions(['premises', '--format', 'json']), cli);
    expect(code).toBe(1);
    const report = JSON.parse(cli.out.join('')) as { findings: { rule: string; file: string; line: number }[] };
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]).toMatchObject({ rule: 'stale-premise', file: 'briefs/001_remove.md', line: 20 });
  });

  it('reports the premise of the brief a round works on as retired, as audit does, and fails only on the others', async () => {
    const root = repository();
    write(root, 'briefs/001_remove.md', BRIEF);
    write(root, 'briefs/002_other.md', BRIEF.replace('# 001 - Remove the legacy call', '# 002 - Another'));
    write(root, 'src/a.ts', 'modernCall();\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-qm', 'start');
    git(root, 'checkout', '-qb', 'brief/001-remove');
    const branch = io(root);
    expect(await premisesCommand(parseOptions(['premises']), branch)).toBe(1);
    expect(branch.out.join('')).toContain('note     briefs/001_remove.md:20  brief 001\'s premise no longer holds, as the round on it intends: ');
    expect(branch.out.join('')).toContain('error    briefs/002_other.md:20  brief 002\'s premise no longer holds: ');
    expect(branch.out.join('')).toContain('2 premise(s) in 2 live brief(s), 1 no longer hold, and 1 retired by the round on brief 001, as it intends\n');

    git(root, 'rm', '-q', 'briefs/002_other.md');
    git(root, 'commit', '-qm', 'one brief');
    const json = io(root);
    expect(await premisesCommand(parseOptions(['premises', '--format', 'json']), json)).toBe(0);
    const report = JSON.parse(json.out.join('')) as { ok: boolean; findings: { rule: string; severity: string; line: number }[] };
    expect(report.ok).toBe(true);
    expect(report.findings).toEqual([expect.objectContaining({ rule: 'premise-retired', severity: 'note', line: 20 })]);

    // On main no round is named, and the premise is stale; the flag names one.
    git(root, 'checkout', '-q', 'main');
    git(root, 'rm', '-q', 'briefs/002_other.md');
    git(root, 'commit', '-qm', 'one brief on main');
    expect(await premisesCommand(parseOptions(['premises']), io(root))).toBe(1);
    const flagged = io(root);
    expect(await premisesCommand(parseOptions(['premises', '--brief', '1']), flagged)).toBe(0);
    expect(flagged.out.join('')).toContain('1 premise(s) in 1 live brief(s), 0 no longer hold, and 1 retired by the round on brief 001, as it intends\n');
  });

  it('cannot be trusted without spec-guard, and says so', async () => {
    const root = repository();
    write(root, '.spec-harness.json', `${JSON.stringify({ tools: { 'spec-brief': ['node', BIN('spec-brief')] } })}\n`);
    write(root, 'briefs/001_remove.md', BRIEF);
    git(root, 'add', '-A');
    git(root, 'commit', '-qm', 'start');
    const cli = io(root);
    expect(await premisesCommand(parseOptions(['premises']), cli)).toBe(2);
    expect(cli.err.join('')).toContain('premises cannot be checked');
  });
});

function hasSshKeygen(): boolean {
  try {
    execFileSync('ssh-keygen', ['-?'], { stdio: 'ignore' });
    return true;
  } catch (error) {
    // ssh-keygen prints usage and exits non-zero when it exists.
    return (error as { status?: number | null }).status !== undefined && (error as { status?: number | null }).status !== null;
  }
}

describe.skipIf(!hasSshKeygen())('the spec-brief plugin', () => {
  function signedRepository(): { root: string; key: string } {
    const root = repository();
    const key = join(root, '..', `${root.split(/[\\/]/).pop() as string}-key`);
    made.push(key, `${key}.pub`);
    execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', 't@example.com', '-f', key]);
    write(root, '.github/allowed_signers', `t@example.com namespaces="git" ${readFileSync(`${key}.pub`, 'utf8').trim()}\n`);
    write(root, 'briefs/001_remove.md', BRIEF);
    write(root, 'src/db/schema.ts', 'table;\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-qm', 'start');
    git(root, 'checkout', '-qb', 'brief/001-remove');
    return { root, key };
  }

  const ruling = (text: string): string =>
    `${text}\n## Rulings\n\n| Ruling | Paths | Decision | Note |\n| --- | --- | --- | --- |\n| R-001-1 | \`src/db/schema.ts\` | allow | One column. |\n`;

  it('waives a protected file a signed ruling allows, and only that', async () => {
    const { root, key } = signedRepository();
    const text = ruling(BRIEF);
    write(root, 'briefs/001_remove.md', text);
    git(root, '-c', 'gpg.format=ssh', '-c', `user.signingkey=${key}`, 'commit', '-q', '-S', '-am', 'ruling R-001-1');
    const waivers = await waive({
      root,
      brief: { id: '001', file: 'briefs/001_remove.md', text },
      findings: [
        { rule: 'protected-file', path: 'src/db/schema.ts' },
        { rule: 'protected-file', path: 'src/db/other.ts' },
        { rule: 'open-task', path: 'src/db/schema.ts' },
      ],
      base: 'main',
      commit: null,
    });
    expect(waivers).toEqual([{ rule: 'protected-file', path: 'src/db/schema.ts', reason: 'ruling R-001-1, signed by t@example.com, allows it' }]);
  });

  it('waives a path a finding lists among others, and nothing a finding of another rule names', async () => {
    const { root, key } = signedRepository();
    const text = ruling(BRIEF);
    write(root, 'briefs/001_remove.md', text);
    git(root, '-c', 'gpg.format=ssh', '-c', `user.signingkey=${key}`, 'commit', '-q', '-S', '-am', 'ruling R-001-1');
    const asked = (findings: { rule: string; path?: string; paths?: string[] }[]) =>
      waive({ root, brief: { id: '001', file: 'briefs/001_remove.md', text }, findings, base: 'main', commit: null });
    expect(await asked([{ rule: 'protected-file', paths: ['src/db/other.ts', 'src/db/schema.ts'] }])).toEqual([
      { rule: 'protected-file', path: 'src/db/schema.ts', reason: 'ruling R-001-1, signed by t@example.com, allows it' },
    ]);
    expect(await asked([{ rule: 'open-task', path: 'src/db/schema.ts' }])).toEqual([]);
  });

  it('reads the signers from the base spec-brief measures from, over the configuration\'s, and from a linked worktree', async () => {
    const { root, key } = signedRepository();
    const text = ruling(BRIEF);
    write(root, 'briefs/001_remove.md', text);
    git(root, '-c', 'gpg.format=ssh', '-c', `user.signingkey=${key}`, 'commit', '-q', '-S', '-am', 'ruling R-001-1');
    const expected = [{ rule: 'protected-file', path: 'src/db/schema.ts', reason: 'ruling R-001-1, signed by t@example.com, allows it' }];
    const configured = JSON.parse(readFileSync(join(root, '.spec-harness.json'), 'utf8')) as Record<string, unknown>;
    write(root, '.spec-harness.json', `${JSON.stringify({ ...configured, base: 'no-such-branch' })}\n`);
    const asked = (at: string, base: string | null) =>
      waive({ root: at, brief: { id: '001', file: 'briefs/001_remove.md', text }, findings: [{ rule: 'protected-file', path: 'src/db/schema.ts' }], base, commit: null });
    expect(await asked(root, 'main')).toEqual(expected);
    expect(await asked(root, null)).toEqual([]);
    // A linked worktree keeps its state, the copy of the signers among it, in the repository's common directory.
    const linked = join(root, '..', `${root.split(/[\\/]/).pop() as string}-linked`);
    made.push(linked);
    git(root, 'worktree', 'add', '-q', '--detach', linked, 'HEAD');
    write(linked, '.spec-harness.json', `${JSON.stringify({ ...configured, base: 'no-such-branch' })}\n`);
    expect(await asked(linked, 'main')).toEqual(expected);
  });

  it('waives a scope change a signed ruling names, or whose every file it let through one allows, and none that let nothing through, or **', async () => {
    const { root, key } = signedRepository();
    const text = `${BRIEF}\n## Rulings\n\n| Ruling | Paths | Decision | Note |\n| --- | --- | --- | --- |\n| R-001-1 | \`src/db/schema.ts\` | allow | One column. |\n| R-001-2 | \`src/db/**\` | allow | The store moves. |\n`;
    write(root, 'briefs/001_remove.md', text);
    git(root, '-c', 'gpg.format=ssh', '-c', `user.signingkey=${key}`, 'commit', '-q', '-S', '-am', 'rulings R-001-1 and R-001-2');
    const asked = (warnings: { rule: string; path?: string; paths?: string[] }[], findings: { rule: string; path?: string; paths?: string[] }[] = []) =>
      waive({ root, brief: { id: '001', file: 'briefs/001_remove.md', text }, findings, warnings, base: 'main', commit: null });
    // The pattern itself a ruling names.
    expect(await asked([{ rule: 'scope-changed', path: 'src/db/**', paths: [] }])).toEqual([
      { rule: 'scope-changed', path: 'src/db/**', reason: 'ruling R-001-2, signed by t@example.com, names src/db/**' },
    ]);
    // Every file it let through, allowed; and under --strict, among the refusals.
    expect(await asked([], [{ rule: 'scope-changed', path: 'src/**', paths: ['src/db/schema.ts'] }])).toEqual([
      { rule: 'scope-changed', path: 'src/**', reason: 'every file it let through is allowed: ruling R-001-1, signed by t@example.com' },
    ]);
    // A file no ruling allows, nothing let through, and a scope that bounds nothing.
    expect(await asked([{ rule: 'scope-changed', path: 'src/**', paths: ['src/db/schema.ts', 'src/app.ts'] }])).toEqual([]);
    expect(await asked([{ rule: 'scope-changed', path: 'lib/**', paths: [] }])).toEqual([]);
    expect(await asked([{ rule: 'scope-changed', path: '**', paths: ['src/db/schema.ts'] }])).toEqual([]);
    expect(await asked([{ rule: 'scope-changed', paths: ['src/db/schema.ts'] }])).toEqual([]);
    // Named twice, waived once.
    expect(await asked([{ rule: 'scope-changed', path: 'src/db/**', paths: [] }], [{ rule: 'scope-changed', path: 'src/db/**', paths: [] }])).toHaveLength(1);
    // Beside a waiver of another rule for the same path, and of another pattern, each waived.
    expect(
      await asked(
        [
          { rule: 'scope-changed', path: 'src/db/schema.ts', paths: [] },
          { rule: 'scope-changed', path: 'src/db/**', paths: [] },
        ],
        [{ rule: 'protected-file', path: 'src/db/schema.ts' }],
      ),
    ).toEqual([
      { rule: 'protected-file', path: 'src/db/schema.ts', reason: 'ruling R-001-1, signed by t@example.com, allows it' },
      { rule: 'scope-changed', path: 'src/db/schema.ts', reason: 'ruling R-001-1, signed by t@example.com, names src/db/schema.ts' },
      { rule: 'scope-changed', path: 'src/db/**', reason: 'ruling R-001-2, signed by t@example.com, names src/db/**' },
    ]);
    // Files two rulings allow between them, each named once; and a change that names no files at all.
    expect(await asked([{ rule: 'scope-changed', path: 'src/**', paths: ['src/db/schema.ts', 'src/db/other.ts', 'src/db/more.ts'] }])).toEqual([
      { rule: 'scope-changed', path: 'src/**', reason: 'every file it let through is allowed: ruling R-001-1, signed by t@example.com; ruling R-001-2, signed by t@example.com' },
    ]);
    expect(await asked([{ rule: 'scope-changed', path: 'lib/**' }])).toEqual([]);
  });

  it('waives no scope change for a spec-brief that hands no warnings, nor for a ruling nobody signed', async () => {
    const { root } = signedRepository();
    const text = `${BRIEF}\n## Rulings\n\n| Ruling | Paths | Decision | Note |\n| --- | --- | --- | --- |\n| R-001-1 | \`src/db/**\` | allow | n |\n`;
    write(root, 'briefs/001_remove.md', text);
    git(root, 'commit', '-q', '-am', 'an unsigned ruling');
    expect(await waive({ root, brief: { id: '001', file: 'briefs/001_remove.md', text }, findings: [], base: 'main', commit: null })).toEqual([]);
    expect(await waive({ root, brief: { id: '001', file: 'briefs/001_remove.md', text }, findings: [], warnings: [{ rule: 'scope-changed', path: 'src/db/**', paths: [] }], base: 'main', commit: null })).toEqual([]);
  });

  it('waives nothing for a ruling nobody signed', async () => {
    const { root } = signedRepository();
    const text = ruling(BRIEF);
    write(root, 'briefs/001_remove.md', text);
    git(root, 'commit', '-q', '-am', 'an unsigned ruling');
    const waivers = await waive({
      root,
      brief: { id: '001', file: 'briefs/001_remove.md', text },
      findings: [{ rule: 'protected-file', path: 'src/db/schema.ts' }],
      base: 'main',
      commit: null,
    });
    expect(waivers).toEqual([]);
  });
});
