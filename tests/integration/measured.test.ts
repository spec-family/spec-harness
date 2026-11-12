/**
 * What a round is measured by: the base and the allowed-signers file, read
 * from a ref the round cannot move, never from the work tree's
 * configuration alone (ADR-0006, amended 2026-11-12).
 */

import { afterAll, describe, expect, it } from 'vitest';

import { resolveBase, type Base } from '../../src/round.js';
import type { Finding } from '../../src/types.js';
import { openWorkspace, parseOptions } from '../../src/workspace.js';
import { brief, BRIEF_FILE, cleanup, cli, parsed, repository, siblings, type Repository } from './helpers.js';

afterAll(cleanup);

const QUIET = { stdout: { write: () => true }, stderr: { write: () => true }, env: {} };

/** The base the round in `repo` is measured from, with `--base` where given. */
async function baseOf(repo: Repository, flag?: string): Promise<Base> {
  const workspace = await openWorkspace(parseOptions(['audit', ...(flag === undefined ? [] : ['--base', flag])]), { ...QUIET, cwd: repo.root });
  return resolveBase(workspace, flag);
}

/** The work tree's configuration, the siblings as the suite names them, and `fields`. */
function configure(repo: Repository, fields: Record<string, unknown>): void {
  repo.write('.spec-harness.json', `${JSON.stringify({ tools: siblings(), ...fields }, null, 2)}\n`);
}

/** A repository whose remote's default branch, origin/main, is main, on the round's branch. */
function withRemote(files: Record<string, string> = {}, config: Record<string, unknown> | null = {}): Repository {
  const repo = repository({ [BRIEF_FILE]: brief({ affected: ['src/**'] }), 'src/a.ts': 'a\n', ...files }, config);
  repo.git('update-ref', 'refs/remotes/origin/main', 'main');
  repo.git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  repo.git('checkout', '-q', '-b', 'brief/001-x');
  repo.write('src/a.ts', 'b\n');
  repo.commit('the round');
  return repo;
}

describe('the anchor the base is read from', () => {
  it('is the commit --base names, whose configuration names the signers, and the work tree\'s base changes nothing', async () => {
    const repo = withRemote({}, { rulings: { allowedSigners: 'keys/signers' } });
    configure(repo, { base: 'elsewhere' });
    const base = await baseOf(repo, 'main');
    expect(base).toMatchObject({ kind: 'resolved', ref: 'main', source: 'flag', anchor: 'flag', signers: 'keys/signers' });
    expect(base.kind === 'resolved' && base.changes).toEqual([{ key: 'rulings.allowedSigners', workTree: '.github/allowed_signers', measured: 'keys/signers', at: 'main' }]);
  });

  it('is the remote\'s default branch, which is the base where its configuration names none, and a base of the work tree that names its commit is no change', async () => {
    const repo = withRemote({}, { base: null });
    configure(repo, { base: 'main' });
    const base = await baseOf(repo);
    expect(base).toMatchObject({ kind: 'resolved', ref: 'origin/main', source: 'remote', anchor: 'remote', signers: '.github/allowed_signers', changes: [] });
  });

  it('reads the base the remote\'s default branch configures, and says the work tree that names none as the remote\'s default branch', async () => {
    const repo = withRemote({}, { base: 'develop' });
    // develop, a commit ahead of main, which the remote's default branch names.
    repo.git('checkout', '-q', '-b', 'develop', 'main');
    repo.write('d.txt', 'd\n');
    repo.commit('develop moves on');
    repo.git('checkout', '-q', 'brief/001-x');
    configure(repo, { base: null });
    const base = await baseOf(repo);
    expect(base).toMatchObject({ kind: 'resolved', ref: 'develop', source: 'config', anchor: 'remote' });
    expect(base.kind === 'resolved' && base.changes).toEqual([{ key: 'base', workTree: "the remote's default branch", measured: 'develop', at: 'origin/main' }]);
  });

  it('is the merge base of HEAD with the work tree\'s base, with neither, where the base that configures is read again', async () => {
    // main moves on after evil leaves it, and the round leaves it after that.
    const repo = repository({ [BRIEF_FILE]: brief({ affected: ['src/**'] }), 'src/a.ts': 'a\n' });
    repo.git('branch', 'evil');
    repo.write('README.md', 'x\n');
    const moved = repo.commit('main moves on');
    repo.git('checkout', '-q', '-b', 'brief/001-x');
    configure(repo, { base: 'evil' });
    repo.write('src/a.ts', 'b\n');
    repo.commit('the round');
    const base = await baseOf(repo);
    const evil = repo.git('merge-base', 'evil', 'HEAD');
    expect(base).toMatchObject({ kind: 'resolved', ref: 'main', source: 'config', anchor: 'merge-base', mergeBase: moved });
    expect(base.kind === 'resolved' && base.changes).toEqual([{ key: 'base', workTree: 'evil', measured: 'main', at: `the merge base with evil, ${evil.slice(0, 12)}` }]);
  });

  it('keeps the work tree\'s base where the merge base configures none, as before the harness was set up there', async () => {
    const repo = repository({ [BRIEF_FILE]: brief({ affected: ['src/**'] }), 'src/a.ts': 'a\n' }, null);
    repo.git('checkout', '-q', '-b', 'brief/001-x');
    configure(repo, { base: 'main' });
    repo.write('src/a.ts', 'b\n');
    repo.commit('the round, which sets the harness up');
    expect(await baseOf(repo)).toMatchObject({ kind: 'resolved', ref: 'main', anchor: 'merge-base', changes: [] });
  });
});

describe('a base that cannot be read', () => {
  it('names the remote\'s default branch where it names no commit, as typed', async () => {
    const repo = withRemote();
    repo.git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/gone');
    expect(await baseOf(repo)).toEqual({ kind: 'unresolved', reason: '"origin/gone" names no commit' });
  });

  it('says the configuration it is measured by does not load, on the remote\'s default branch and at the merge base', async () => {
    const remote = withRemote({ '.spec-harness.json': '{ not json' }, null);
    // The work tree's mends it; the remote's default branch still holds it.
    configure(remote, {});
    expect(await baseOf(remote)).toMatchObject({ kind: 'unresolved', reason: expect.stringMatching(/^\.spec-harness\.json on origin\/main does not load, and the round is measured by it: \.spec-harness\.json is not valid JSON: /) });
    const local = repository({ [BRIEF_FILE]: brief({ affected: ['src/**'] }), '.spec-harness.json': '{ not json' }, null);
    const start = local.git('rev-parse', 'HEAD');
    local.git('checkout', '-q', '-b', 'brief/001-x');
    configure(local, { base: 'main' });
    local.commit('the round mends it');
    expect(await baseOf(local)).toMatchObject({
      kind: 'unresolved',
      reason: expect.stringMatching(new RegExp(`^\\.spec-harness\\.json at the merge base with main, ${start.slice(0, 12)} does not load, and the round is measured by it: `)),
    });
  });

  it('says HEAD names no commit, on a branch with none, under the remote\'s anchor', async () => {
    const repo = withRemote();
    repo.git('checkout', '-q', '--orphan', 'nothing-yet');
    expect(await baseOf(repo)).toEqual({ kind: 'unresolved', reason: 'HEAD names no commit: nothing is committed on this branch yet' });
  });
});

describe('the signers a ruling is checked against', () => {
  const ALLOW = '\n## Rulings\n\n| Ruling | Paths | Decision | Note |\n| --- | --- | --- | --- |\n| R-001-1 | `src/db/schema.ts` | allow | n |\n';
  const KEY = 'a@example.com namespaces="git" ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGtQUDZWhs8k/cvAw9yvIZ8xSV4FzrRbRUQ1o4rqxa1w\n';
  const reasons = async (repo: Repository): Promise<string[]> => parsed<{ unverified: { reason: string }[] }>(await cli(['rulings', '--format', 'json'], repo.root)).unverified.map((row) => row.reason);

  it('are none where the base\'s tip lists none, or the merge base listed none, each said by which', async () => {
    const onlyBefore = repository({ [BRIEF_FILE]: brief({ affected: ['src/**'], protected: ['src/db/**'] }), '.github/allowed_signers': KEY });
    onlyBefore.git('checkout', '-q', '-b', 'brief/001-x');
    onlyBefore.write(BRIEF_FILE, `${onlyBefore.read(BRIEF_FILE)}${ALLOW}`);
    onlyBefore.commit('a ruling');
    onlyBefore.git('checkout', '-q', 'main');
    onlyBefore.git('rm', '-q', '.github/allowed_signers');
    onlyBefore.commit('the signers go');
    onlyBefore.git('checkout', '-q', 'brief/001-x');
    expect(await reasons(onlyBefore)).toEqual(['main has no .github/allowed_signers, so no signature can count']);

    const onlyAfter = repository({ [BRIEF_FILE]: brief({ affected: ['src/**'], protected: ['src/db/**'] }) });
    const start = onlyAfter.git('rev-parse', 'HEAD');
    onlyAfter.git('checkout', '-q', '-b', 'brief/001-x');
    onlyAfter.write(BRIEF_FILE, `${onlyAfter.read(BRIEF_FILE)}${ALLOW}`);
    onlyAfter.commit('a ruling');
    onlyAfter.git('checkout', '-q', 'main');
    onlyAfter.write('.github/allowed_signers', KEY);
    onlyAfter.commit('the signers come');
    onlyAfter.git('checkout', '-q', 'brief/001-x');
    expect(await reasons(onlyAfter)).toEqual([`the merge base with main, ${start.slice(0, 12)}, has no .github/allowed_signers, so no signature can count`]);
  });

  it('are read from the file the anchor\'s configuration names, in doctor as in rulings, and the work tree\'s where there is no base', async () => {
    const repo = withRemote({ 'keys/signers': KEY }, { rulings: { allowedSigners: 'keys/signers' } });
    configure(repo, { rulings: { allowedSigners: '.github/allowed_signers' } });
    expect((await cli(['doctor'], repo.root)).stdout).toContain('\nsigners keys/signers is on main\n');
    expect((await cli(['doctor', '--base', 'no-such-ref'], repo.root)).stdout).toContain('\nsigners .github/allowed_signers, read from the base, which could not be resolved');
  });
});

describe('the audit of what was measured', () => {
  it('reports no change of the configuration, and no anchor, for a base that does not resolve, under --require-measured', async () => {
    const repo = repository({ [BRIEF_FILE]: brief({ affected: ['src/**'] }) }, { base: null });
    repo.git('checkout', '-q', '-b', 'brief/001-x');
    const result = await cli(['audit', '--require-measured', '--format', 'json'], repo.root);
    expect(result.code).toBe(1);
    const findings = parsed<{ findings: Finding[] }>(result).findings;
    expect(findings.filter((f) => f.severity === 'error').map((f) => f.rule)).toContain('unmeasured');
    expect(findings.some((f) => f.rule === 'harness-config-changed' || f.rule === 'harness-config-unanchored')).toBe(false);
  });

  it('says where a base read at the merge base was read from, under --require-measured', async () => {
    const repo = repository({ [BRIEF_FILE]: brief({ affected: ['src/**'] }), 'src/a.ts': 'a\n' });
    repo.git('checkout', '-q', '-b', 'brief/001-x');
    repo.write('src/a.ts', 'b\n');
    repo.commit('the round');
    const findings = parsed<{ findings: Finding[] }>(await cli(['audit', '--require-measured', '--format', 'json'], repo.root)).findings;
    expect(findings.find((f) => f.rule === 'harness-config-unanchored')?.message).toBe(
      "the round's base and allowed signers were read from the work tree's .spec-harness.json and the merge base of HEAD with the base it names, which the round can change",
    );
  });
});
