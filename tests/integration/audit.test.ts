import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { DependencyChange, InstallScriptChange } from '../../src/manifests.js';
import type { Finding } from '../../src/types.js';
import { join } from 'node:path';

import { brief, BRIEF_FILE, cleanup, cli, guardCannotRead, parsed, repository, siblings, SPEC_BRIEF, temp, write, type Repository } from './helpers.js';

afterAll(cleanup);

interface Report {
  ok: boolean;
  brief: string;
  base: { ref: string; mergeBase: string; head: string } | null;
  counts: { error: number; warning: number; note: number };
  findings: Finding[];
  dependencies: DependencyChange[];
  installScripts: InstallScriptChange[];
}

const BODY = [
  '## The Defect, Measured',
  '',
  '<!-- @assert-count target="src/auth" symbol="OldToken" min="1" -->',
  '',
  '## Goals',
  '',
  '<!-- @assert-absence target="src/auth" symbol="OldToken" -->',
  '<!-- @assert-absence target="src/auth" symbol="LegacyGateway" -->',
  '',
].join('\n');

const PACKAGE = { name: 'x', version: '1.0.0', dependencies: { kept: '^1.0.0', bumped: '1.0.0', dropped: '2.0.0' } };

let repo: Repository;
let base: string;

beforeAll(() => {
  repo = repository({
    [BRIEF_FILE]: brief({ affected: ['src/auth/**', 'package.json'], protected: ['src/db/schema.ts'], tasks: ['- [ ] the tests pass'], body: BODY }),
    'package.json': `${JSON.stringify(PACKAGE, null, 2)}\n`,
    'requirements-dev.txt': 'pytest==8.0\n',
    'src/auth/a.ts': 'export const OldToken = 1;\n',
    'src/db/schema.ts': 'table;\n',
  });
  base = repo.git('rev-parse', 'HEAD');
  repo.git('checkout', '-q', '-b', 'brief/001-rotate');
  repo.write('package.json', `${JSON.stringify({ ...PACKAGE, dependencies: { kept: '^1.0.0', bumped: '1.1.0', 'left-pad': '^1.3.0' } }, null, 2)}\n`);
  repo.write('requirements-dev.txt', 'pytest==8.0\nhypothesis\n');
  repo.write('src/auth/a.ts', 'export const NewToken = 1;\n');
  repo.write('NOTES.md', 'outside the scope\n');
  repo.commit('the round');
});

describe('audit of a round', () => {
  it('reports the archive\'s reasons, the assertions, and every dependency added', async () => {
    const result = await cli(['audit', '--format', 'json'], repo.root);
    expect(result.code).toBe(1);
    const report = parsed<Report>(result);
    expect(report.ok).toBe(false);
    expect(report.brief).toBe('001');
    expect(report.base).toEqual({ ref: 'main', mergeBase: base, head: repo.git('rev-parse', 'HEAD') });
    const rules = report.findings.map((f) => f.rule);
    expect(rules).toContain('archive/open-task');
    expect(rules).toContain('archive/out-of-scope');
    // The default manifest names all read.
    expect(rules).not.toContain('manifest-name-unread');
    expect(report.findings.find((f) => f.rule === 'archive/out-of-scope')?.message).toContain('NOTES.md');
    // The premise stopped holding, as the round meant it to; the goals hold.
    expect(report.findings.filter((f) => f.rule.startsWith('premise') || f.rule === 'goal-failed').map((f) => [f.rule, f.line])).toEqual([['premise-retired', 23]]);
    expect(report.findings.filter((f) => f.rule === 'new-dependency').map((f) => f.message)).toEqual([
      'the round added npm dependency "left-pad" ^1.3.0 in package.json (dependencies)',
      'the round added pip dependency "hypothesis" hypothesis in requirements-dev.txt (requirements)',
    ]);
    expect(report.dependencies.map((d) => [d.name, d.before, d.after])).toEqual([
      ['bumped', '1.0.0', '1.1.0'],
      ['left-pad', null, '^1.3.0'],
      ['dropped', '2.0.0', null],
      ['hypothesis', null, 'hypothesis'],
    ]);
    expect(report.counts.error).toBeGreaterThanOrEqual(1);
  });

  it('prints the same as text, with what it measured above its counts, which stay the last line', async () => {
    const result = await cli(['audit'], repo.root);
    expect(result.code).toBe(1);
    expect(result.stdout.startsWith(`audit of brief 001 from main (${base.slice(0, 12)})\n\n`)).toBe(true);
    expect(result.stdout).toContain(`error    ${BRIEF_FILE}:`);
    expect(result.stdout).toContain('warning  package.json  the round added npm dependency "left-pad" ^1.3.0 in package.json (dependencies)  new-dependency');
    expect(result.stdout).toContain('\nnote     package.json  the round removed "dropped" from package.json (dependencies)  dependency-removed\n');
    expect(result.stdout).toMatch(
      /\n\nmeasured: goals: 2 held, 0 failed · premises: 1 retired, 0 holding · archive: asked · rulings: none · dependencies: 4 changed, 0 unread\n\d+ error\(s\), \d+ warning\(s\), \d+ note\(s\)\n$/,
    );
  });

  it('says in JSON what it measured, beside the counts', async () => {
    const report = parsed<Report & { measured: unknown }>(await cli(['audit', '--format', 'json'], repo.root));
    expect(report.measured).toEqual({
      changes: 'measured',
      archive: 'asked',
      assertions: 'run',
      goals: { held: 2, failed: 0 },
      premises: { retired: 1, holding: 0 },
      unreadableAssertions: 0,
      rulings: { verified: 0, unverified: 0 },
      dependencies: { changed: 4, unread: 0 },
      installScripts: { changed: 0 },
    });
    // The round changed no install-script policy, and the list says so.
    expect(report.installScripts).toEqual([]);
  });

  it('reports each assertion spec-guard cannot read as a warning, where the audit dropped it and passed', async () => {
    const unreadable = ['## Goals', '', '<!-- @assert-absence target="src" -->', '<!-- @assert-count symbol="Foo" target="src" min="abc" -->', ''].join('\n');
    const r = repository({ [BRIEF_FILE]: brief({ affected: ['src/**'], body: unreadable }), 'src/a.ts': 'a\n' });
    r.git('checkout', '-q', '-b', 'brief/001-x');
    r.write('src/b.ts', 'b\n');
    r.commit('work');
    const result = await cli(['audit', '--format', 'json'], r.root);
    const report = parsed<Report & { measured: { assertions: string; goals: unknown; unreadableAssertions: number } }>(result);
    // What is wrong with each directive is said in spec-guard's words, as the release installed here words it.
    expect(report.findings.filter((f) => f.rule === 'assertion-unreadable').map((f) => [f.severity, f.line, f.message])).toEqual(
      [22, 23].map((line) => ['warning', line, `spec-guard cannot read an assertion in the brief, so nothing it states was run: ${guardCannotRead(r.root, BRIEF_FILE, line)}`]),
    );
    // Each is about the directive as written, which its fingerprint is made of.
    expect(report.findings.filter((f) => f.rule === 'assertion-unreadable').map((f) => f.subject)).toEqual([
      '<!-- @assert-absence target="src" -->',
      '<!-- @assert-count symbol="Foo" target="src" min="abc" -->',
    ]);
    expect(report.measured).toMatchObject({ assertions: 'run', goals: { held: 0, failed: 0 }, unreadableAssertions: 2 });
    // Warnings: the audit fails on them only under --strict.
    expect(result.code).toBe(0);
    expect((await cli(['audit', '--strict'], r.root)).code).toBe(1);
    expect((await cli(['audit'], r.root)).stdout).toContain('\nmeasured: goals: none declared · premises: none declared · unreadable assertions: 2 · archive: asked');
  });

  it('counts a ruling row it cannot read among its warnings, first in the report', async () => {
    const rows = '## Rulings\n\n| Ruling | Paths | Decision |\n| --- | --- | --- |\n| R-001-1 | `a` | perhaps |\n';
    const r = repository({ [BRIEF_FILE]: brief({ affected: ['src/**'], body: rows }), 'src/a.ts': 'a\n' });
    r.git('checkout', '-q', '-b', 'brief/001-x');
    r.write('src/b.ts', 'b\n');
    r.commit('work');
    const report = parsed<Report>(await cli(['audit', '--format', 'json'], r.root));
    expect(report.findings.map((f) => f.rule)).toEqual(['ruling-unreadable']);
    expect(report.counts).toEqual({ error: 0, warning: 1, note: 0 });
  });

  it('says a brief with no assertion declares no goal, and warns about nothing for it', async () => {
    const r = repository({ [BRIEF_FILE]: brief({ affected: ['src/**'] }), 'src/a.ts': 'a\n' });
    r.git('checkout', '-q', '-b', 'brief/001-x');
    r.write('src/b.ts', 'b\n');
    r.commit('work');
    const result = await cli(['audit'], r.root);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(
      `audit of brief 001 from main (${r.git('rev-parse', 'main').slice(0, 12)})\n\n\nmeasured: goals: none declared · premises: none declared · archive: asked · rulings: none · dependencies: 0 changed, 0 unread\n0 error(s), 0 warning(s), 0 note(s)\n`,
    );
    expect((await cli(['audit', '--strict'], r.root)).code).toBe(0);
    expect(parsed<Report & { command: string }>(await cli(['audit', '--strict', '--format', 'json'], r.root))).toMatchObject({ command: 'audit', ok: true });
  });

  it('fails a goal that does not hold, and warns about a premise that still does', async () => {
    const r = repository({
      [BRIEF_FILE]: brief({ affected: ['src/**'], body: BODY }),
      'src/auth/a.ts': 'export const OldToken = 1; LegacyGateway();\n',
    });
    r.git('checkout', '-q', '-b', 'brief/001-x');
    r.write('src/auth/b.ts', 'b;\n');
    r.commit('a round that fixed nothing');
    const report = parsed<Report>(await cli(['audit', '--format', 'json'], r.root));
    expect(report.findings.filter((f) => ['premise-holds', 'premise-retired', 'goal-failed'].includes(f.rule)).map((f) => [f.rule, f.line])).toEqual([
      ['premise-holds', 22],
      ['goal-failed', 26],
      ['goal-failed', 27],
    ]);
  });

  it('warns that the round was not measured when the base is HEAD, or names no commit', async () => {
    const r = repository({ [BRIEF_FILE]: brief({ affected: ['src/**'] }) });
    const same = parsed<Report>(await cli(['audit', '1', '--format', 'json'], r.root));
    expect(same.findings[0]).toMatchObject({ rule: 'unmeasured', message: "the round's changes were not measured: main and HEAD are the same commit: there is nothing to measure" });
    // Warnings alone pass unless --strict.
    expect(same.ok).toBe(true);
    expect((await cli(['audit', '1', '--base', 'no-such-branch'], r.root)).stdout.startsWith('audit of brief 001\n\n')).toBe(true);
    const none = parsed<Report>(await cli(['audit', '1', '--base', 'no-such-branch', '--format', 'json'], r.root));
    expect(none.base).toBeNull();
    expect(none.findings[0]).toMatchObject({ rule: 'unmeasured', message: 'the round\'s changes were not measured: "no-such-branch" names no commit' });
    // With nothing measured, no dependency is reported, nor a manifest as unread.
    const dependencyRules = ['manifest-unread', 'new-dependency', 'dependency-removed', 'dependency-changed'];
    expect(none.findings.filter((f) => dependencyRules.includes(f.rule))).toEqual([]);
  });

  it('says which commit is missing when HEAD has none yet, and when the base and HEAD share no history', async () => {
    const r = repository({ [BRIEF_FILE]: brief({ affected: ['src/**'] }) });
    r.git('checkout', '-q', '--orphan', 'brief/001-fresh');
    const unborn = parsed<Report>(await cli(['audit', '--format', 'json'], r.root));
    expect(unborn.findings[0]).toMatchObject({
      rule: 'unmeasured',
      message: "the round's changes were not measured: HEAD names no commit: nothing is committed on this branch yet",
    });
    r.commit('a history of its own');
    const apart = parsed<Report>(await cli(['audit', '--format', 'json'], r.root));
    expect(apart.base).toBeNull();
    expect(apart.findings[0]).toMatchObject({ rule: 'unmeasured', message: 'the round\'s changes were not measured: "main" and HEAD share no history' });
  });

  it('says no base is named, and measures nothing, when neither the configuration nor the remote names one', async () => {
    const r = repository({ [BRIEF_FILE]: brief({ affected: ['src/**'] }), 'package.json': '{"dependencies":{"a":"1"}}\n' }, { base: null });
    r.git('checkout', '-q', '-b', 'brief/1-x');
    r.write('package.json', '{"dependencies":{"a":"1","b":"2"}}\n');
    r.commit('work');
    const report = parsed<Report>(await cli(['audit', '--format', 'json'], r.root));
    expect(report.base).toBeNull();
    expect(report.findings[0]).toMatchObject({
      rule: 'unmeasured',
      message: 'the round\'s changes were not measured: no base is named and the remote has no default branch; pass --base <ref> or set "base"',
    });
    expect(report.dependencies).toEqual([]);
  });

  it('runs the goals of a brief whatever its status, as spec-guard runs them only when told to ignore it', async () => {
    const r = repository({ [BRIEF_FILE]: brief({ status: 'draft', affected: ['src/**'], body: '## Goals\n\n<!-- @assert-absence target="src" symbol="OldToken" -->\n' }), 'src/a.ts': 'OldToken\n' });
    const report = parsed<Report & { measured: { goals: unknown } }>(await cli(['audit', '1', '--format', 'json'], r.root));
    expect(report.measured.goals).toEqual({ held: 0, failed: 1 });
  });

  describe('when a sibling cannot answer', () => {
    /** spec-brief as installed, but for its archive, which prints `plan` and exits with `code`. */
    const fakeBrief = (plan: string, code: number): string[] => {
      const fake = temp();
      write(
        fake,
        'spec-brief.mjs',
        [
          "import { spawnSync } from 'node:child_process';",
          'const args = process.argv.slice(2);',
          `if (args[0] === 'archive') { process.stdout.write(${JSON.stringify(plan)}); process.exit(${code}); }`,
          `const run = spawnSync(process.execPath, [${JSON.stringify(SPEC_BRIEF)}, ...args], { stdio: 'inherit' });`,
          'process.exit(run.status ?? 1);',
          '',
        ].join('\n'),
      );
      return ['node', join(fake, 'spec-brief.mjs')];
    };
    const guard = (): string[] => {
      const fake = temp();
      write(fake, 'guard.js', 'process.stdout.write("{}"); process.exit(2);\n');
      return ['node', join(fake, 'guard.js')];
    };
    const audited = async (tools: Record<string, string[]>) => {
      const r = repository({ [BRIEF_FILE]: brief({ affected: ['src/**'] }) }, { tools: { ...siblings(), ...tools } });
      return parsed<Report & { measured: Record<string, unknown> }>(await cli(['audit', '1', '--format', 'json'], r.root));
    };

    it('says the archive could not be planned when spec-brief exits 2', async () => {
      const report = await audited({ 'spec-brief': fakeBrief('{}', 2) });
      expect(report.measured['archive']).toBe('unavailable');
      expect(report.findings.find((f) => f.rule === 'archive-unchecked')?.message).toContain('spec-brief could not plan the archive');
    });

    it('prints a reason the archive places in no file without a place', async () => {
      const plan = { plan: { blocking: [{ rule: 'no-base', severity: 'error', message: 'the archive has no base', hint: 'name one' }], warnings: [] } };
      const r = repository({ [BRIEF_FILE]: brief({ affected: ['src/**'] }) }, { tools: { ...siblings(), 'spec-brief': fakeBrief(JSON.stringify(plan), 1) } });
      expect((await cli(['audit', '1'], r.root)).stdout).toContain('\nerror    the archive has no base  archive/no-base\n         name one\n');
    });

    it('stops with exit 2, naming the tool and the field, when spec-guard or spec-brief prints a document of another shape', async () => {
      const printing = (json: string): string[] => {
        const fake = temp();
        write(fake, 'guard.js', `process.stdout.write(${JSON.stringify(json)});\n`);
        return ['node', join(fake, 'guard.js')];
      };
      const run = async (tools: Record<string, string[]>) => {
        const r = repository({ [BRIEF_FILE]: brief({ affected: ['src/**'] }) }, { tools: { ...siblings(), ...tools } });
        return cli(['audit', '1', '--format', 'json'], r.root);
      };
      expect(await run({ 'spec-guard': printing('{"results":5}') })).toEqual({ code: 2, stdout: '', stderr: 'spec-harness: spec-guard printed results that is not a list\n' });
      expect(await run({ 'spec-guard': printing('{"results":[{"ok":"no","description":"d","message":"m"}]}') })).toEqual({
        code: 2,
        stdout: '',
        stderr: 'spec-harness: spec-guard printed results[0].ok that is not true or false\n',
      });
      const plan = JSON.stringify({ plan: { blocking: [{ rule: 'open-task', severity: 'fatal', message: 'm' }] } });
      expect(await run({ 'spec-brief': fakeBrief(plan, 1) })).toEqual({
        code: 2,
        stdout: '',
        stderr: 'spec-harness: spec-brief archive printed plan.blocking[0].severity that is not error, warning or note\n',
      });
    });

    it('reads an archive plan that lists nothing as refusing nothing', async () => {
      const report = await audited({ 'spec-brief': fakeBrief('{}', 0) });
      expect(report.measured['archive']).toBe('asked');
      expect(report.findings.filter((f) => f.rule.startsWith('archive'))).toEqual([]);
    });

    it('says the assertions could not be run when spec-guard exits 2', async () => {
      const report = await audited({ 'spec-guard': guard() });
      expect(report.measured['assertions']).toBe('unavailable');
      expect(report.findings.find((f) => f.rule === 'assertions-unchecked')?.message).toContain("spec-guard could not run the brief's assertions");
    });
  });

  it('counts what spec-guard places in the brief, however the path is written, or places nowhere, and nothing it places elsewhere', async () => {
    const report = {
      results: [
        { ok: false, description: 'd', message: 'placed in the brief', spec: { file: 'briefs\\001_rotate-tokens.md', line: 22 } },
        { ok: false, description: 'd', message: 'placed in another document', spec: { file: 'docs/adr/0003.md', line: 5 } },
        { ok: true, description: 'd', message: 'placed nowhere' },
      ],
      errors: [
        { message: 'placed nowhere, written nowhere' },
        { message: 'placed elsewhere', raw: '<!-- x -->', spec: { file: 'docs/adr/0003.md', line: 2 } },
      ],
    };
    const fake = temp();
    write(fake, 'guard.js', `process.stdout.write(${JSON.stringify(JSON.stringify(report))});\n`);
    write(fake, 'empty.js', 'process.stdout.write("{}");\n');
    const tools = (script: string): Record<string, string[]> => ({ 'spec-brief': ['node', SPEC_BRIEF], 'spec-guard': ['node', join(fake, script)] });
    const r = repository({ [BRIEF_FILE]: brief({ affected: ['src/**'] }) }, { tools: tools('guard.js') });
    const audited = parsed<Report & { measured: { goals: unknown } }>(await cli(['audit', '1', '--format', 'json'], r.root));
    expect(audited.measured.goals).toEqual({ held: 1, failed: 1 });
    const judged = audited.findings.filter((f) => f.rule === 'goal-failed' || f.rule === 'assertion-unreadable');
    expect(judged.map((f) => ({ rule: f.rule, line: f.line, subject: f.subject }))).toEqual([
      { rule: 'goal-failed', line: 22, subject: expect.any(String) },
      { rule: 'assertion-unreadable', line: 0, subject: '' },
    ]);
    expect(judged[0]?.message).toContain('placed in the brief');
    // No list is an empty one.
    const empty = repository({ [BRIEF_FILE]: brief({ affected: ['src/**'] }) }, { tools: tools('empty.js') });
    const none = parsed<Report & { measured: { goals: unknown; unreadableAssertions: unknown } }>(await cli(['audit', '1', '--format', 'json'], empty.root));
    expect(none.measured).toMatchObject({ goals: { held: 0, failed: 0 }, unreadableAssertions: 0 });
  });

  it('fails on warnings alone under --strict', async () => {
    const r = repository({ [BRIEF_FILE]: brief({ affected: ['src/**'] }) });
    expect((await cli(['audit', '1'], r.root)).code).toBe(0);
    const strict = await cli(['audit', '1', '--strict', '--format', 'json'], r.root);
    expect(strict.code).toBe(1);
    expect(parsed<Report>(strict).ok).toBe(false);
  });

  it('says what it could not ask when spec-guard is not there', async () => {
    const r = repository({ [BRIEF_FILE]: brief({ affected: ['src/**'] }) }, { tools: { 'spec-brief': ['node', SPEC_BRIEF] } });
    r.git('checkout', '-q', '-b', 'brief/1-x');
    r.write('src/a.ts', 'a\n');
    r.commit('work');
    const report = parsed<Report>(await cli(['audit', '--format', 'json'], r.root));
    expect(report.findings.map((f) => f.rule)).toContain('assertions-unchecked');
    expect(report.findings.find((f) => f.rule === 'assertions-unchecked')?.message).toContain('spec-guard is not installed here');
  });

  it('reports a manifest the round broke as unread, never as clean', async () => {
    // Not package.json: spec-guard reads its own options there and stops on a broken one.
    const r = repository({ [BRIEF_FILE]: brief({ affected: ['**'] }), 'Cargo.toml': '[dependencies]\nserde = "1"\n', 'go.mod': 'module x\n' });
    r.git('checkout', '-q', '-b', 'brief/1-x');
    r.write('Cargo.toml', '[dependencies]\nserde = "1"\n[features]\nall = [\n  "a",\n');
    r.write('go.mod', 'module x\n\nrequire (\n\tgithub.com/a/b v1.0.0\n');
    r.commit('broken manifests');
    const report = parsed<Report>(await cli(['audit', '--format', 'json'], r.root));
    expect(report.findings.filter((f) => f.rule === 'manifest-unread').map((f) => f.file).sort()).toEqual(['Cargo.toml', 'go.mod']);
    expect(report.dependencies).toEqual([]);
  });

  it('reads a manifest the round renamed from where it came, and one only the configuration names', async () => {
    // Large enough that one more line leaves git calling it a rename.
    const dependencies = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`dependency-${i}`, `^${i}.0.0`]));
    const r = repository(
      { [BRIEF_FILE]: brief({ affected: ['**'] }), 'app/package.json': `${JSON.stringify({ dependencies }, null, 2)}\n`, 'deps.lock': 'x\n' },
      { dependencies: { manifests: ['package.json', 'deps.lock'] } },
    );
    r.git('checkout', '-q', '-b', 'brief/1-x');
    r.git('rm', '-q', 'app/package.json');
    r.write('web/package.json', `${JSON.stringify({ dependencies: { ...dependencies, b: '2' } }, null, 2)}\n`);
    r.write('deps.lock', 'y\n');
    r.commit('moved');
    const report = parsed<Report>(await cli(['audit', '--format', 'json'], r.root));
    expect(report.dependencies).toEqual([{ file: 'web/package.json', ecosystem: 'npm', section: 'dependencies', name: 'b', before: null, after: '2' }]);
    // A configured manifest no reader understands is reported, not skipped.
    expect(report.findings.filter((f) => f.rule === 'manifest-unread').map((f) => f.file)).toEqual(['deps.lock']);
    // Its name read, so the name is not reported.
    expect(report.findings.map((f) => f.rule)).not.toContain('manifest-name-unread');
  });

  it('reports a manifest renamed to a name no reader understands as unread, rather than skip it', async () => {
    // Large enough that git calls the move a rename.
    const dependencies = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`dependency-${i}`, `^${i}.0.0`]));
    const r = repository({ [BRIEF_FILE]: brief({ affected: ['**'] }), 'package.json': `${JSON.stringify({ dependencies }, null, 2)}\n` });
    r.git('checkout', '-q', '-b', 'brief/1-x');
    r.git('mv', 'package.json', 'package.json.orig');
    r.commit('moved aside');
    const report = parsed<Report>(await cli(['audit', '--format', 'json'], r.root));
    expect(report.findings.filter((f) => f.rule === 'manifest-unread').map((f) => f.file)).toEqual(['package.json.orig']);
  });

  it('names a manifest name it cannot read, with spec-core\'s reason, and reads the manifests the other names name', async () => {
    const huge = `${'{a,b}'.repeat(8)}/${'x'.repeat(300)}`;
    const r = repository(
      { [BRIEF_FILE]: brief({ affected: ['**'] }), 'Cargo.toml': '[dependencies]\nserde = "1"\n' },
      { dependencies: { manifests: ['[x', huge, 'Cargo.toml'] } },
    );
    r.git('checkout', '-q', '-b', 'brief/1-x');
    r.write('Cargo.toml', '[dependencies]\nserde = "1.1"\n');
    r.commit('work');
    const result = await cli(['audit', '--format', 'json'], r.root);
    const report = parsed<Report>(result);
    const names = (findings: readonly Finding[]): string[][] => findings.filter((f) => f.rule === 'manifest-name-unread').map((f) => [f.severity, f.file ?? '', f.message]);
    expect(names(report.findings)).toEqual([
      ['warning', '.spec-harness.json', '"dependencies.manifests" names "[x", which cannot be read: a "[" is never closed; no manifest it names was read'],
      [
        'warning',
        '.spec-harness.json',
        `"dependencies.manifests" names "${huge}", which cannot be read: the pattern compiles to more than 65536 states; no manifest it names was read`,
      ],
    ]);
    expect(report.dependencies).toEqual([{ file: 'Cargo.toml', ecosystem: 'cargo', section: 'dependencies', name: 'serde', before: '1', after: '1.1' }]);
    // A warning, which fails the audit only under --strict.
    expect(result.code).toBe(0);
    expect((await cli(['audit', '--strict'], r.root)).code).toBe(1);
    // With no base to measure from, the names are named all the same.
    const unmeasured = parsed<Report>(await cli(['audit', '--base', 'no-such-branch', '--format', 'json'], r.root));
    expect(unmeasured.base).toBeNull();
    expect(names(unmeasured.findings)).toEqual(names(report.findings));
  });

  it('warns about a protection a leading "/" roots, which let the round change the file it meant to protect', async () => {
    const r = repository({ [BRIEF_FILE]: brief({ affected: ['src/**'], protected: ['/src/db/schema.ts'] }), 'src/db/schema.ts': 'table;\n' });
    r.git('checkout', '-q', '-b', 'brief/001-x');
    // The guard lets the write through: the protection names no path it decides.
    expect((await cli(['guard', 'src/db/schema.ts', '--format', 'json'], r.root)).code).toBe(0);
    r.write('src/db/schema.ts', 'table; column;\n');
    r.commit('work');
    const result = await cli(['audit', '--format', 'json'], r.root);
    expect(parsed<Report>(result).findings.filter((f) => f.rule === 'protection-rooted').map((f) => [f.severity, f.file, f.message])).toEqual([
      ['warning', BRIEF_FILE, `brief 001 protects "/src/db/schema.ts", which a leading "/" roots at the filesystem's root, so it protects no path`],
    ]);
    expect((await cli(['audit', '--strict'], r.root)).code).toBe(1);
    const packet = (await cli(['context', '1'], r.root)).stdout;
    expect(packet).toContain("Must not change without a ruling:\n- `/src/db/schema.ts`, which a leading `/` roots at the filesystem's root: it protects no path\n");
  });

  it('names a manifest name a leading "/" roots, which names no manifest the round changed, as it names one it cannot read', async () => {
    const r = repository(
      { [BRIEF_FILE]: brief({ affected: ['**'] }), 'package.json': '{ "dependencies": {} }\n', 'Gemfile': "gem 'rails'\n", 'Cargo.toml': '[dependencies]\n' },
      { dependencies: { manifests: ['/package.json', '{/Gemfile,Cargo.toml}'] } },
    );
    r.git('checkout', '-q', '-b', 'brief/1-x');
    r.write('package.json', '{ "dependencies": { "left-pad": "1" } }\n');
    r.write('Gemfile', "gem 'rails'\ngem 'rack'\n");
    r.write('Cargo.toml', '[dependencies]\nserde = "1"\n');
    r.commit('work');
    const result = await cli(['audit', '--format', 'json'], r.root);
    const report = parsed<Report>(result);
    expect(report.findings.filter((f) => f.rule === 'manifest-name-rooted').map((f) => [f.severity, f.file, f.message])).toEqual([
      ['warning', '.spec-harness.json', `"dependencies.manifests" names "/package.json": a leading "/" roots it at the filesystem's root, where no file of the repository is, so no manifest it names was read`],
      [
        'warning',
        '.spec-harness.json',
        `"dependencies.manifests" names "{/Gemfile,Cargo.toml}": a leading "/" roots an alternative of it at the filesystem's root, where no file of the repository is, so that alternative names no manifest`,
      ],
    ]);
    // The alternative that is not rooted is read as before; the rooted ones name nothing the round changed.
    expect(report.dependencies).toEqual([{ file: 'Cargo.toml', ecosystem: 'cargo', section: 'dependencies', name: 'serde', before: null, after: '1' }]);
    expect(result.code).toBe(0);
    expect((await cli(['audit', '--strict'], r.root)).code).toBe(1);
  });

  it('names a manifest name whose braces expand to no path, which made every file the round changed a manifest', async () => {
    const r = repository(
      { [BRIEF_FILE]: brief({ affected: ['**'] }), 'Cargo.toml': '[dependencies]\nserde = "1"\n' },
      { dependencies: { manifests: ['{./,Gemfile}', 'Cargo.toml'] } },
    );
    r.git('checkout', '-q', '-b', 'brief/1-x');
    r.write('Cargo.toml', '[dependencies]\nserde = "1.1"\n');
    r.write('src/a.ts', 'a;\n');
    r.commit('work');
    const report = parsed<Report>(await cli(['audit', '--format', 'json'], r.root));
    expect(report.findings.filter((f) => f.rule === 'manifest-name-unread').map((f) => [f.severity, f.message])).toEqual([
      ['warning', '"dependencies.manifests" names "{./,Gemfile}", which cannot be read: the braces expand to "./", which names no path; no manifest it names was read'],
    ]);
    // Read as every path, the name made src/a.ts a manifest no reader understands.
    expect(report.findings.map((f) => f.rule)).not.toContain('manifest-unread');
    expect(report.dependencies).toEqual([{ file: 'Cargo.toml', ecosystem: 'cargo', section: 'dependencies', name: 'serde', before: '1', after: '1.1' }]);
  });
});

describe('audit of the install scripts a round allowed', () => {
  type Measured = Report & { measured: { dependencies: unknown; installScripts: unknown } };
  const POLICY = {
    name: 'x',
    version: '1.0.0',
    dependencies: { canvas: '^3.0.0', esbuild: '^0.25.0' },
    allowScripts: { 'canvas@3.1.0': true, esbuild: false, 'old-native@1.0.0': true },
  };
  const manifest = (value: object): string => `${JSON.stringify(value, null, 2)}\n`;
  const entry = (name: string, before: string | null, after: string | null, file = 'package.json') => ({ file, ecosystem: 'npm', section: 'allowScripts', name, before, after });
  const scripts = (findings: readonly Finding[]) => findings.filter((f) => f.rule.startsWith('install-script-')).map((f) => [f.severity, f.rule, f.file, f.message]);

  function round(after: object, files: Readonly<Record<string, string>> = {}, config: Record<string, unknown> = {}): Repository {
    const r = repository({ [BRIEF_FILE]: brief({ affected: ['**'] }), 'package.json': manifest(POLICY), ...files }, config);
    r.git('checkout', '-q', '-b', 'brief/1-x');
    r.write('package.json', manifest(after));
    r.commit('the round');
    return r;
  }

  it('warns about each approval the round added or turned on, notes what it denied or removed, and fails on the warnings only under --strict', async () => {
    const r = round({ ...POLICY, allowScripts: { 'canvas@3.2.0': true, esbuild: true, sharp: true, 'core-js': false } });
    const result = await cli(['audit', '--format', 'json'], r.root);
    const report = parsed<Measured>(result);
    expect(report.installScripts).toEqual([
      entry('canvas@3.2.0', null, 'allowed'),
      entry('esbuild', 'denied', 'allowed'),
      entry('sharp', null, 'allowed'),
      entry('core-js', null, 'denied'),
      entry('canvas@3.1.0', 'allowed', null),
      entry('old-native@1.0.0', 'allowed', null),
    ]);
    expect(report.findings.map((f) => [f.severity, f.rule, f.file, f.message])).toEqual([
      ['warning', 'install-script-allowed', 'package.json', 'the round allowed "canvas@3.2.0" to run install scripts in package.json (allowScripts)'],
      ['warning', 'install-script-allowed', 'package.json', 'the round allowed "esbuild" to run install scripts in package.json (allowScripts), which denied it before'],
      ['warning', 'install-script-allowed', 'package.json', 'the round allowed "sharp" to run install scripts in package.json (allowScripts)'],
      ['note', 'install-script-denied', 'package.json', 'the round denied "core-js" its install scripts in package.json (allowScripts)'],
      ['note', 'install-script-entry-removed', 'package.json', 'the round removed "canvas@3.1.0" from package.json (allowScripts), which allowed its install scripts'],
      ['note', 'install-script-entry-removed', 'package.json', 'the round removed "old-native@1.0.0" from package.json (allowScripts), which allowed its install scripts'],
    ]);
    // An approval is not a dependency: neither the list nor its count holds one.
    expect(report.dependencies).toEqual([]);
    expect(report.measured).toMatchObject({ dependencies: { changed: 0, unread: 0 }, installScripts: { changed: 6 } });
    expect(report.counts).toEqual({ error: 0, warning: 3, note: 3 });
    expect(report.ok).toBe(true);
    expect(result.code).toBe(0);
    const strict = await cli(['audit', '--strict', '--format', 'json'], r.root);
    expect(strict.code).toBe(1);
    expect(parsed<Report>(strict).ok).toBe(false);
    const text = (await cli(['audit'], r.root)).stdout;
    expect(text).toContain('\nwarning  package.json  the round allowed "sharp" to run install scripts in package.json (allowScripts)  install-script-allowed\n');
    expect(text).toContain('\n         say in the brief why its install scripts must run, or remove the entry; an install script is code no reviewer read, run on every install\n');
    expect(text.endsWith(' · dependencies: 0 changed, 0 unread · install scripts: 6 changed\n0 error(s), 3 warning(s), 3 note(s)\n')).toBe(true);
  });

  it('passes --strict on a round that denies, removes, or changes the package\'s own scripts and another tool\'s fields: none is a grant it reads', async () => {
    const r = round({
      ...POLICY,
      scripts: { preinstall: 'node setup.js', install: 'node-gyp rebuild', postinstall: 'node build.js', prepare: 'husky' },
      pnpm: { onlyBuiltDependencies: ['esbuild'] },
      trustedDependencies: ['esbuild'],
      allowScripts: { 'canvas@3.1.0': false, esbuild: false, 'core-js': false },
    });
    const result = await cli(['audit', '--strict', '--format', 'json'], r.root);
    const report = parsed<Measured>(result);
    expect(report.findings.map((f) => [f.severity, f.rule, f.message])).toEqual([
      ['note', 'install-script-denied', 'the round denied "canvas@3.1.0" its install scripts in package.json (allowScripts), which allowed them before'],
      ['note', 'install-script-denied', 'the round denied "core-js" its install scripts in package.json (allowScripts)'],
      ['note', 'install-script-entry-removed', 'the round removed "old-native@1.0.0" from package.json (allowScripts), which allowed its install scripts'],
    ]);
    expect(report.counts).toEqual({ error: 0, warning: 0, note: 3 });
    expect(report.ok).toBe(true);
    expect(result.code).toBe(0);
  });

  it('says nothing of a policy the round left as it was, and nothing on the line that says what it measured', async () => {
    const r = round({ ...POLICY, version: '1.0.1', dependencies: { ...POLICY.dependencies, canvas: '^3.1.0' } });
    const report = parsed<Measured>(await cli(['audit', '--format', 'json'], r.root));
    expect(report.installScripts).toEqual([]);
    expect(scripts(report.findings)).toEqual([]);
    expect(report.measured).toMatchObject({ dependencies: { changed: 1, unread: 0 }, installScripts: { changed: 0 } });
    expect((await cli(['audit'], r.root)).stdout).toMatch(/ · dependencies: 1 changed, 0 unread\n0 error\(s\), 0 warning\(s\), 1 note\(s\)\n$/);
  });

  it('reads the policy of each manifest the configuration names, at any depth, and of none it does not name', async () => {
    const nested = { name: 'web', allowScripts: { sharp: true } };
    const files = { 'web/package.json': manifest({ name: 'web' }) };
    const named = round(POLICY, files);
    named.write('web/package.json', manifest(nested));
    named.commit('a workspace');
    const report = parsed<Measured>(await cli(['audit', '--format', 'json'], named.root));
    expect(report.installScripts).toEqual([entry('sharp', null, 'allowed', 'web/package.json')]);
    expect(scripts(report.findings)).toEqual([
      ['warning', 'install-script-allowed', 'web/package.json', 'the round allowed "sharp" to run install scripts in web/package.json (allowScripts)'],
    ]);
    // With package.json out of the names, the audit reads neither its dependencies nor its policy.
    const unnamed = round({ ...POLICY, allowScripts: { ...POLICY.allowScripts, sharp: true } }, {}, { dependencies: { manifests: ['Cargo.toml'] } });
    const silent = parsed<Measured>(await cli(['audit', '--strict', '--format', 'json'], unnamed.root));
    expect(silent.installScripts).toEqual([]);
    expect(silent.findings).toEqual([]);
    expect(silent.ok).toBe(true);
  });

  it('reports a policy that came with a new manifest, and one that left with a deleted one', async () => {
    const r = repository({ [BRIEF_FILE]: brief({ affected: ['**'] }), 'old/package.json': manifest({ name: 'old', allowScripts: { sharp: true } }) });
    r.git('checkout', '-q', '-b', 'brief/1-x');
    r.git('rm', '-q', 'old/package.json');
    r.write('new/package.json', manifest({ name: 'new', version: '2.0.0', description: 'another package altogether', allowScripts: { 'canvas@3.1.0': true } }));
    r.commit('one for another');
    const report = parsed<Measured>(await cli(['audit', '--format', 'json'], r.root));
    expect([...report.installScripts].sort((a, b) => a.file.localeCompare(b.file))).toEqual([
      entry('canvas@3.1.0', null, 'allowed', 'new/package.json'),
      entry('sharp', 'allowed', null, 'old/package.json'),
    ]);
  });

  it('reports no entry of a manifest it cannot read, which is unread, and none when the round was not measured', async () => {
    // Under web/, since spec-guard reads its own options from the root's package.json and stops on a broken one.
    const files = { 'web/package.json': manifest({ name: 'web' }) };
    const r = round(POLICY, files);
    r.write('web/package.json', '{ "allowScripts": { "sharp": true }, "dependencies": ["sharp"] }\n');
    r.commit('a manifest no reader reads');
    const report = parsed<Measured>(await cli(['audit', '--format', 'json'], r.root));
    expect(report.findings.map((f) => [f.rule, f.file])).toEqual([['manifest-unread', 'web/package.json']]);
    expect(report.installScripts).toEqual([]);
    const unmeasured = parsed<Measured>(await cli(['audit', '--base', 'no-such-branch', '--format', 'json'], round({ ...POLICY, allowScripts: { sharp: true } }).root));
    expect(unmeasured.installScripts).toEqual([]);
    expect(scripts(unmeasured.findings)).toEqual([]);
    expect(unmeasured.measured).toMatchObject({ installScripts: { changed: 0 } });
  });

  it('places each for a forge, with a fingerprint of the entry and not of what it says', async () => {
    const r = round({ ...POLICY, allowScripts: { ...POLICY.allowScripts, sharp: true, esbuild: true } });
    const issues = JSON.parse((await cli(['audit', '--format', 'gitlab'], r.root)).stdout) as { check_name: string; severity: string; fingerprint: string; location: { path: string } }[];
    expect(issues.map((issue) => [issue.check_name, issue.severity, issue.location.path])).toEqual([
      ['install-script-allowed', 'minor', 'package.json'],
      ['install-script-allowed', 'minor', 'package.json'],
    ]);
    expect(new Set(issues.map((issue) => issue.fingerprint)).size).toBe(2);
    const sarif = JSON.parse((await cli(['audit', '--format', 'sarif'], r.root)).stdout) as { runs: { tool: { driver: { rules: { id: string; shortDescription: { text: string } }[] } } }[] };
    expect(sarif.runs[0]?.tool.driver.rules).toEqual([
      { id: 'install-script-allowed', shortDescription: { text: 'A package the round allowed to run install scripts: code no reviewer read, run on every install.' } },
    ]);
  });
});

describe('audit for a forge', () => {
  interface Issue {
    check_name: string;
    severity: string;
    fingerprint: string;
    description: string;
    location: { path: string; lines: { begin: number } };
  }

  it('prints GitLab Code Quality, every finding placed, with the exit code of the other formats', async () => {
    const result = await cli(['audit', '--format', 'gitlab'], repo.root);
    expect(result.code).toBe(1);
    const issues = JSON.parse(result.stdout) as Issue[];
    const json = parsed<Report>(await cli(['audit', '--format', 'json'], repo.root));
    expect(issues.map((issue) => issue.check_name)).toEqual(json.findings.map((f) => f.rule));
    const dependency = issues.find((issue) => issue.check_name === 'new-dependency');
    expect(dependency).toMatchObject({
      severity: 'minor',
      description: 'the round added npm dependency "left-pad" ^1.3.0 in package.json (dependencies). say in the brief why it is needed, or remove it; a new dependency is code no reviewer read',
      location: { path: 'package.json', lines: { begin: 1 } },
    });
    expect(issues.find((issue) => issue.check_name === 'premise-retired')).toMatchObject({ severity: 'info', location: { path: BRIEF_FILE, lines: { begin: 23 } } });
    expect(new Set(issues.map((issue) => issue.fingerprint)).size).toBe(issues.length);
  });

  it('prints SARIF with what it measured as a note, and GitHub annotations', async () => {
    const sarif = JSON.parse((await cli(['audit', '--format', 'sarif'], repo.root)).stdout) as {
      runs: { invocations: { toolExecutionNotifications: { message: { text: string } }[] }[]; results: { ruleId: string }[] }[];
    };
    expect(sarif.runs[0]?.invocations[0]?.toolExecutionNotifications[0]?.message.text).toBe(
      'measured: goals: 2 held, 0 failed · premises: 1 retired, 0 holding · archive: asked · rulings: none · dependencies: 4 changed, 0 unread',
    );
    expect(sarif.runs[0]?.results.map((r) => r.ruleId)).toContain('archive/open-task');
    const github = await cli(['audit', '--format', 'github'], repo.root);
    expect(github.code).toBe(1);
    expect(github.stdout).toContain(
      '::warning file=package.json,line=1,title=spec-harness new-dependency::the round added npm dependency "left-pad" ^1.3.0 in package.json (dependencies). say in the brief why it is needed, or remove it; a new dependency is code no reviewer read\n',
    );
    expect(github.stdout).toContain(`::notice file=${BRIEF_FILE},line=23,title=spec-harness premise-retired::`);
  });

  it('keeps a finding\'s fingerprint when its line moves', async () => {
    const r = repository({ [BRIEF_FILE]: brief({ affected: ['src/**'], body: BODY }), 'src/auth/a.ts': 'export const OldToken = 1; LegacyGateway();\n' });
    r.git('checkout', '-q', '-b', 'brief/001-x');
    r.write('src/auth/b.ts', 'b;\n');
    r.commit('work');
    const before = JSON.parse((await cli(['audit', '--format', 'gitlab'], r.root)).stdout) as Issue[];
    r.write(BRIEF_FILE, brief({ affected: ['src/**'], body: `A line the round added above the goals.\n\n${BODY}` }));
    r.commit('a line above');
    const after = JSON.parse((await cli(['audit', '--format', 'gitlab'], r.root)).stdout) as Issue[];
    const goals = (issues: Issue[]) => issues.filter((issue) => issue.check_name === 'goal-failed');
    expect(goals(after).map((issue) => issue.location.lines.begin)).toEqual(goals(before).map((issue) => issue.location.lines.begin + 2));
    expect(goals(after).map((issue) => issue.fingerprint)).toEqual(goals(before).map((issue) => issue.fingerprint));
  });

  it('is refused for a command whose output has no places', async () => {
    expect(await cli(['context', '--format', 'sarif'], repo.root)).toEqual({ code: 2, stdout: '', stderr: 'spec-harness: --format sarif is for audit and premises; context prints pretty or json\n' });
  });
});

describe('audit --if-round, where nothing names a brief', () => {
  const LINE = 'no brief is named by --brief, SPEC_BRIEF or the branch, so there is no round to audit, and --if-round passes the run';

  it('says there is no round in a line, exit 0, where it was exit 2, with no briefs and no spec-brief to ask', async () => {
    // No briefs/ at all, and a repository with no spec-brief installed: neither is asked anything.
    for (const plain of [repository({}), repository({}, null)]) {
      expect((await cli(['audit'], plain.root)).code).toBe(2);
      expect(await cli(['audit', '--if-round'], plain.root)).toEqual({ code: 0, stdout: `${LINE}\n`, stderr: '' });
      expect(await cli(['audit', '--if-round', '--strict', '--base', 'main'], plain.root)).toEqual({ code: 0, stdout: `${LINE}\n`, stderr: '' });
      // SPEC_BRIEF set and empty is as unset.
      expect(await cli(['audit', '--if-round'], plain.root, { env: { SPEC_BRIEF: ' ' } })).toEqual({ code: 0, stdout: `${LINE}\n`, stderr: '' });
    }
    // A branch that names no brief by any template, beside briefs spec-brief lists.
    const listed = repository({ [BRIEF_FILE]: brief({ affected: ['src/**'] }) });
    listed.git('checkout', '-q', '-b', 'fix/list-order');
    expect(await cli(['audit', '--if-round'], listed.root)).toEqual({ code: 0, stdout: `${LINE}\n`, stderr: '' });
  });

  it('prints what a run that found nothing prints in each format a script or a forge reads, with the line on stderr', async () => {
    const plain = repository({});
    const json = await cli(['audit', '--if-round', '--format', 'json'], plain.root);
    expect({ code: json.code, stderr: json.stderr }).toEqual({ code: 0, stderr: `spec-harness: ${LINE}\n` });
    expect(parsed(json)).toMatchObject({ tool: 'spec-harness', command: 'audit', ok: true, brief: null, base: null, counts: { error: 0, warning: 0, note: 0 }, measured: null, findings: [], dependencies: [], installScripts: [] });
    expect(await cli(['audit', '--if-round', '--format', 'gitlab'], plain.root)).toEqual({ code: 0, stdout: '[]\n', stderr: `spec-harness: ${LINE}\n` });
    expect(await cli(['audit', '--if-round', '--format', 'github'], plain.root)).toEqual({ code: 0, stdout: '', stderr: `spec-harness: ${LINE}\n` });
    const sarif = await cli(['audit', '--if-round', '--format', 'sarif'], plain.root);
    expect({ code: sarif.code, stderr: sarif.stderr }).toEqual({ code: 0, stderr: `spec-harness: ${LINE}\n` });
    const document = JSON.parse(sarif.stdout) as { runs: { invocations: { toolExecutionNotifications: { message: { text: string } }[] }[]; results: unknown[] }[] };
    expect(document.runs[0]?.results).toEqual([]);
    expect(document.runs[0]?.invocations[0]?.toolExecutionNotifications[0]?.message.text).toBe(LINE);
  });

  it('fails a brief that is named and cannot be read as it did, by whatever names it', async () => {
    const plain = repository({ [BRIEF_FILE]: brief({ affected: ['src/**'] }) });
    const unknown = 'spec-harness: the flag names brief 404, and spec-brief knows no such brief\n';
    expect(await cli(['audit', '--if-round', '--brief', '404'], plain.root)).toEqual({ code: 2, stdout: '', stderr: unknown });
    expect(await cli(['audit', '--if-round'], plain.root, { env: { SPEC_BRIEF: '404' } })).toEqual({ code: 2, stdout: '', stderr: 'spec-harness: the environment names brief 404, and spec-brief knows no such brief\n' });
    expect(await cli(['audit', '404', '--if-round'], plain.root)).toEqual({ code: 2, stdout: '', stderr: 'spec-harness: the argument names brief 404, and spec-brief knows no such brief\n' });
    plain.git('checkout', '-q', '-b', 'brief/999-nowhere');
    expect(await cli(['audit', '--if-round'], plain.root)).toEqual({ code: 2, stdout: '', stderr: 'spec-harness: the branch names brief 999, and spec-brief knows no such brief\n' });
    // A branch that names a brief where there are no briefs, and spec-brief that is not installed.
    for (const bare of [repository({}), repository({}, null)]) {
      bare.git('checkout', '-q', '-b', 'brief/001-x');
      const run = await cli(['audit', '--if-round'], bare.root);
      expect(run.code).toBe(2);
      expect(run).toEqual(await cli(['audit'], bare.root));
    }
  });

  it('audits a round that is named, as without it', async () => {
    const without = await cli(['audit', '--format', 'json'], repo.root);
    expect(without.code).toBe(1);
    expect(await cli(['audit', '--format', 'json', '--if-round'], repo.root)).toEqual(without);
    expect(await cli(['audit', '001', '--if-round'], repo.root)).toEqual(await cli(['audit', '001'], repo.root));
  });
});
