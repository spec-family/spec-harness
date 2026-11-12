import { describe, expect, it } from 'vitest';

import { audit, describeMeasured, isPremise, premiseFinding, RULES, unreadablePremiseFinding, type AssertionOutcome, type AuditInput } from '../../src/audit.js';
import { DEFAULT_CONFIG } from '../../src/config.js';
import type { DependencyChange, InstallScriptChange, InstallScriptVerdict } from '../../src/manifests.js';
import { row } from './helpers.js';

const FILE = 'briefs/012_rotate-tokens.md';

function input(overrides: Partial<AuditInput> = {}): AuditInput {
  return {
    brief: row(),
    unmeasured: null,
    dependencies: { changes: [], unread: [] },
    archive: { blocking: [], warnings: [] },
    assertions: [],
    premiseSections: DEFAULT_CONFIG.assertions.premises,
    unverifiedRulings: [],
    verifiedRulings: [],
    pluginLoaded: true,
    ...overrides,
  };
}

function outcome(ok: boolean, section: string | null, line = 20): AssertionOutcome {
  return { ok, description: `"X" in ${section ?? 'no section'}`, message: ok ? 'holds' : 'expected 0, found 2', line, section };
}

function change(before: string | null, after: string | null, name = 'left-pad'): DependencyChange {
  return { file: 'package.json', ecosystem: 'npm', section: 'dependencies', name, before, after };
}

function script(before: InstallScriptVerdict | null, after: InstallScriptVerdict | null, name = 'canvas@3.1.0'): InstallScriptChange {
  return { file: 'package.json', ecosystem: 'npm', section: 'allowScripts', name, before, after };
}

describe('a clean round', () => {
  it('finds nothing, and says what it measured to find it (spec-core ADR-0005)', () => {
    const held = audit(input({ assertions: [outcome(true, 'Invariants'), outcome(true, 'Goals'), outcome(false, 'Premises')] }));
    expect(held.findings.map((f) => f.rule)).toEqual(['premise-retired']);
    expect(held.counts).toEqual({ error: 0, warning: 0, note: 1 });
    expect(held.measured).toEqual({
      changes: 'measured',
      archive: 'asked',
      assertions: 'run',
      goals: { held: 2, failed: 0 },
      premises: { retired: 1, holding: 0 },
      unreadableAssertions: 0,
      rulings: { verified: 0, unverified: 0 },
      dependencies: { changed: 0, unread: 0 },
      installScripts: { changed: 0 },
    });
    expect(describeMeasured(held.measured)).toBe(
      'measured: goals: 2 held, 0 failed · premises: 1 retired, 0 holding · archive: asked · rulings: none · dependencies: 0 changed, 0 unread',
    );
  });

  it('says a brief with no assertion declares no goal, and warns about nothing for it', () => {
    const report = audit(input());
    expect(report.findings).toEqual([]);
    expect(report.counts).toEqual({ error: 0, warning: 0, note: 0 });
    expect(report.measured.goals).toEqual({ held: 0, failed: 0 });
    expect(describeMeasured(report.measured)).toBe(
      'measured: goals: none declared · premises: none declared · archive: asked · rulings: none · dependencies: 0 changed, 0 unread',
    );
  });
});

describe('what the audit measured', () => {
  it('counts premises and rulings that balance as counted, never as none', () => {
    const measured = {
      changes: 'measured',
      archive: 'asked',
      assertions: 'run',
      goals: { held: 1, failed: 0 },
      premises: { retired: 1, holding: 1 },
      unreadableAssertions: 0,
      rulings: { verified: 2, unverified: 2 },
      dependencies: { changed: 0, unread: 0 },
      installScripts: { changed: 0 },
    } as const;
    expect(describeMeasured(measured)).toBe(
      'measured: goals: 1 held, 0 failed · premises: 1 retired, 1 holding · archive: asked · rulings: 2 verified, 2 unverified · dependencies: 0 changed, 0 unread',
    );
  });

  it('describes each rule it and premises report, for a reader of SARIF, in a sentence of its own', () => {
    expect(Object.keys(RULES)).toEqual([
      'unmeasured',
      'harness-config-changed',
      'harness-config-unanchored',
      'archive-unchecked',
      'assertions-unchecked',
      'assertion-unreadable',
      'goal-failed',
      'premise-holds',
      'premise-retired',
      'stale-premise',
      'ruling-unverified',
      'ruling-unreadable',
      'protection-rooted',
      'ruling-path-rooted',
      'manifest-name-unread',
      'manifest-name-rooted',
      'manifest-unread',
      'new-dependency',
      'dependency-removed',
      'dependency-changed',
      'install-script-allowed',
      'install-script-denied',
      'install-script-entry-removed',
    ]);
    const sentences = Object.values(RULES);
    for (const [rule, sentence] of Object.entries(RULES)) expect(sentence, rule).toMatch(/^\S.* .*\.$/);
    expect(new Set(sentences).size).toBe(sentences.length);
  });

  it('tells an audit that ran nothing from one that found nothing', () => {
    const report = audit(input({ unmeasured: 'no base', archive: { unavailable: 'x' }, assertions: { unavailable: 'y' } }));
    expect(report.measured).toMatchObject({ changes: 'unmeasured', archive: 'unavailable', assertions: 'unavailable' });
    expect(describeMeasured(report.measured)).toBe('measured: assertions: not run · archive: not asked · rulings: none · dependencies: not measured');
  });

  it('counts goals, premises, rulings and dependencies as it judged them', () => {
    const report = audit(
      input({
        assertions: [outcome(false, 'Invariants'), outcome(true, 'Invariants'), outcome(true, 'Premises'), outcome(false, 'The Defect, Measured'), outcome(false, 'Premises')],
        verifiedRulings: [{ id: 'R-012-1', paths: ['x'], signer: 'p@example.com' }],
        unverifiedRulings: [
          { id: 'R-012-2', reason: 'r' },
          { id: 'R-012-3', reason: 'r' },
        ],
        dependencies: { changes: [change(null, '1'), change('1', null, 'b'), change('1', '2', 'c')], unread: ['go.mod'] },
      }),
    );
    expect(report.measured).toMatchObject({
      goals: { held: 1, failed: 1 },
      premises: { retired: 2, holding: 1 },
      rulings: { verified: 1, unverified: 2 },
      dependencies: { changed: 3, unread: 1 },
    });
    expect(describeMeasured(report.measured)).toBe(
      'measured: goals: 1 held, 1 failed · premises: 2 retired, 1 holding · archive: asked · rulings: 1 verified, 2 unverified · dependencies: 3 changed, 1 unread',
    );
  });

  it('declares goals, premises and rulings when any of them is counted, whichever way it went', () => {
    const failed = audit(
      input({
        assertions: [outcome(false, 'Invariants'), outcome(true, 'Premises')],
        unverifiedRulings: [{ id: 'R-012-1', reason: 'r' }],
      }),
    );
    expect(describeMeasured(failed.measured)).toBe(
      'measured: goals: 0 held, 1 failed · premises: 0 retired, 1 holding · archive: asked · rulings: 0 verified, 1 unverified · dependencies: 0 changed, 0 unread',
    );
  });

  it('names the assertions spec-guard could not read beside those it ran', () => {
    const report = audit(input({ assertions: [outcome(true, 'Invariants')], unreadableAssertions: [{ message: 'm', line: 9, raw: '<!-- @assert-absence -->' }] }));
    expect(report.measured.unreadableAssertions).toBe(1);
    expect(describeMeasured(report.measured)).toBe(
      'measured: goals: 1 held, 0 failed · premises: none declared · unreadable assertions: 1 · archive: asked · rulings: none · dependencies: 0 changed, 0 unread',
    );
  });
});

describe('an assertion spec-guard cannot read', () => {
  const unreadable = [
    { message: '@assert-absence requires a non-empty symbol="..." attribute.', line: 22, raw: '<!-- @assert-absence target="src" -->\n' },
    { message: 'Attribute "min" must be a non-negative integer, got "abc".', line: 23, raw: '<!-- @assert-count symbol="Foo" target="src" min="abc" -->' },
  ];

  it('is a warning each, never dropped, which fails the audit only under --strict', () => {
    const report = audit(input({ unreadableAssertions: unreadable }));
    expect(report.findings).toEqual([
      {
        rule: 'assertion-unreadable',
        severity: 'warning',
        message: 'spec-guard cannot read an assertion in the brief, so nothing it states was run: @assert-absence requires a non-empty symbol="..." attribute.',
        hint: `fix the directive in ${FILE}; until spec-guard can read it, the audit measures nothing it states`,
        file: FILE,
        line: 22,
        subject: '<!-- @assert-absence target="src" -->',
      },
      {
        rule: 'assertion-unreadable',
        severity: 'warning',
        message: 'spec-guard cannot read an assertion in the brief, so nothing it states was run: Attribute "min" must be a non-negative integer, got "abc".',
        hint: `fix the directive in ${FILE}; until spec-guard can read it, the audit measures nothing it states`,
        file: FILE,
        line: 23,
        subject: '<!-- @assert-count symbol="Foo" target="src" min="abc" -->',
      },
    ]);
    expect(report.counts).toEqual({ error: 0, warning: 2, note: 0 });
  });

  it('comes after the assertions spec-guard ran, and says nothing when there is none', () => {
    const report = audit(input({ assertions: [outcome(false, 'Invariants')], unreadableAssertions: unreadable.slice(0, 1), unverifiedRulings: [{ id: 'R-1', reason: 'r' }] }));
    expect(report.findings.map((f) => f.rule)).toEqual(['goal-failed', 'assertion-unreadable', 'ruling-unverified']);
    expect(audit(input({ unreadableAssertions: [] })).findings).toEqual([]);
  });
});

describe('what could not be measured is a finding, never a silence', () => {
  it('reports a round whose changes were not measured', () => {
    const { findings } = audit(input({ unmeasured: 'main and HEAD are the same commit' }));
    expect(findings).toEqual([
      {
        rule: 'unmeasured',
        severity: 'warning',
        message: "the round's changes were not measured: main and HEAD are the same commit",
        hint: 'pass --base <ref>, set "base" in .spec-harness.json, or audit on the round\'s branch before it merges',
        file: FILE,
      },
    ]);
    expect('line' in (findings[0] as object)).toBe(false);
  });

  it('reports an archive it could not ask about', () => {
    expect(audit(input({ archive: { unavailable: 'spec-brief is not installed here' } })).findings).toEqual([
      {
        rule: 'archive-unchecked',
        severity: 'warning',
        message: 'what the archive would say is unknown: spec-brief is not installed here',
        hint: 'install spec-brief, or fix what stopped it',
        file: FILE,
      },
    ]);
  });

  it('reports assertions it could not run', () => {
    expect(audit(input({ assertions: { unavailable: 'spec-guard is not installed here' } })).findings).toEqual([
      {
        rule: 'assertions-unchecked',
        severity: 'warning',
        message: "the brief's assertions were not run: spec-guard is not installed here",
        hint: 'install spec-guard, or fix what stopped it',
        file: FILE,
      },
    ]);
  });

  it('reports a manifest it could not read', () => {
    expect(audit(input({ dependencies: { changes: [], unread: ['Cargo.toml'] } })).findings).toEqual([
      {
        rule: 'manifest-unread',
        severity: 'warning',
        message: 'Cargo.toml changed and could not be read for dependencies',
        hint: 'check its dependencies by hand; the audit cannot',
        file: 'Cargo.toml',
      },
    ]);
  });

  it('reports each manifest name it could not read, with the reason, as a warning that fails nothing', () => {
    const report = audit(
      input({
        dependencies: {
          changes: [change(null, '1')],
          unread: [],
          unreadNames: [
            { name: '[x', reason: 'a "[" is never closed' },
            { name: '{a,b}{a,b}', reason: 'the pattern compiles to more than 65536 states' },
          ],
        },
      }),
    );
    expect(report.findings.slice(0, 2)).toEqual([
      {
        rule: 'manifest-name-unread',
        severity: 'warning',
        message: '"dependencies.manifests" names "[x", which cannot be read: a "[" is never closed; no manifest it names was read',
        hint: 'fix or remove the name in .spec-harness.json; the other names were read',
        file: '.spec-harness.json',
        subject: '[x',
      },
      {
        rule: 'manifest-name-unread',
        severity: 'warning',
        message: '"dependencies.manifests" names "{a,b}{a,b}", which cannot be read: the pattern compiles to more than 65536 states; no manifest it names was read',
        hint: 'fix or remove the name in .spec-harness.json; the other names were read',
        file: '.spec-harness.json',
        subject: '{a,b}{a,b}',
      },
    ]);
    // The names that could be read still measured the round.
    expect(report.findings.map((f) => f.rule)).toEqual(['manifest-name-unread', 'manifest-name-unread', 'new-dependency']);
    expect(report.counts.error).toBe(0);
  });

  it('reports a manifest name a leading "/" roots, which names no file of the repository, as a warning that fails nothing', () => {
    const report = audit(
      input({
        dependencies: {
          changes: [],
          unread: [],
          rootedNames: [
            { name: '/package.json', whole: true },
            { name: '{/Gemfile,Cargo.toml}', whole: false },
          ],
        },
      }),
    );
    expect(report.findings).toEqual([
      {
        rule: 'manifest-name-rooted',
        severity: 'warning',
        message: `"dependencies.manifests" names "/package.json": a leading "/" roots it at the filesystem's root, where no file of the repository is, so no manifest it names was read`,
        hint: 'write it without the leading "/" in .spec-harness.json, since a name is matched at any depth; the other names were read',
        file: '.spec-harness.json',
        subject: '/package.json',
      },
      {
        rule: 'manifest-name-rooted',
        severity: 'warning',
        message:
          `"dependencies.manifests" names "{/Gemfile,Cargo.toml}": a leading "/" roots an alternative of it at the filesystem's root, where no file of the repository is, so that alternative names no manifest`,
        hint: 'write it without the leading "/" in .spec-harness.json, since a name is matched at any depth; the other names were read',
        file: '.spec-harness.json',
        subject: '{/Gemfile,Cargo.toml}',
      },
    ]);
    expect(report.counts).toEqual({ error: 0, warning: 2, note: 0 });
  });

  it('reports no manifest name when every name was read, or none was said', () => {
    expect(audit(input({ dependencies: { changes: [], unread: [], unreadNames: [], rootedNames: [] } })).findings).toEqual([]);
    expect(audit(input({ dependencies: { changes: [], unread: [] } })).findings).toEqual([]);
  });
});

describe('what the round is measured by (ADR-0006)', () => {
  const at = 'origin/main';

  it('warns of each key the work tree configures otherwise, on the configuration file, by the key', () => {
    const report = audit(
      input({
        configChanges: [
          { key: 'base', workTree: 'evil', measured: 'main', at },
          { key: 'rulings.allowedSigners', workTree: 'signers', measured: '.github/allowed_signers', at },
        ],
      }),
    );
    expect(report.findings).toEqual([
      {
        rule: 'harness-config-changed',
        severity: 'warning',
        message: "the work tree's .spec-harness.json measures the round from evil, where origin/main has main: the round is measured from main",
        hint: 'a change to "base" counts once it is on the base: merge it there first, or take it out of the round',
        file: '.spec-harness.json',
        subject: 'base',
      },
      {
        rule: 'harness-config-changed',
        severity: 'warning',
        message: "the work tree's .spec-harness.json reads the allowed signers from signers, where origin/main has .github/allowed_signers: rulings are verified against .github/allowed_signers",
        hint: 'a change to "rulings.allowedSigners" counts once it is on the base: merge it there first, or take it out of the round',
        file: '.spec-harness.json',
        subject: 'rulings.allowedSigners',
      },
    ]);
    expect(report.counts).toEqual({ error: 0, warning: 2, note: 0 });
  });

  it('fails what was not measured where --require-measured asks, and nothing else', () => {
    const unmeasured = 'main and HEAD are the same commit: there is nothing to measure';
    const scope = { rule: 'scope-unmeasured', severity: 'warning' as const, message: 'affectedFiles went unchecked', hint: 'h', file: FILE, line: 3 };
    const other = { rule: 'out-of-scope', severity: 'warning' as const, message: 'm', hint: 'h', file: FILE, line: 4 };
    const given = input({ unmeasured, archive: { blocking: [], warnings: [scope, other] }, configChanges: [{ key: 'base', workTree: 'evil', measured: 'main', at }] });
    const severities = (report: ReturnType<typeof audit>): string[] => report.findings.map((f) => `${f.rule} ${f.severity}`);
    expect(severities(audit(given))).toEqual(['unmeasured warning', 'harness-config-changed warning', 'archive/scope-unmeasured warning', 'archive/out-of-scope warning']);
    const required = audit({ ...given, requireMeasured: { unanchored: null } });
    expect(severities(required)).toEqual(['unmeasured error', 'harness-config-changed warning', 'archive/scope-unmeasured error', 'archive/out-of-scope warning']);
    expect(required.counts).toEqual({ error: 2, warning: 2, note: 0 });
    expect(required.measured.changes).toBe('unmeasured');
  });

  it('fails a run measured by what the round can change, where --require-measured asks', () => {
    const where = "the work tree's .spec-harness.json and the merge base of HEAD with the base it names";
    expect(audit(input({ requireMeasured: { unanchored: where } })).findings).toEqual([
      {
        rule: 'harness-config-unanchored',
        severity: 'error',
        message: `the round's base and allowed signers were read from ${where}, which the round can change`,
        hint: "pass --base naming the branch rounds merge into as the forge has it, such as --base origin/main, or record the remote's default branch: git remote set-head origin --auto",
        file: '.spec-harness.json',
      },
    ]);
    expect(audit(input({ requireMeasured: { unanchored: null } })).findings).toEqual([]);
  });
});

describe('the archive', () => {
  it('carries each of its reasons as it gave them, blocking first', () => {
    const report = audit(
      input({
        archive: {
          blocking: [{ rule: 'open-task', severity: 'error', message: '"x" is open', hint: 'tick it', file: FILE, line: 19 }],
          warnings: [{ rule: 'out-of-scope', severity: 'warning', message: 'outside.txt', hint: 'widen', file: FILE }],
        },
      }),
    );
    expect(report.findings).toEqual([
      { rule: 'archive/open-task', severity: 'error', message: '"x" is open', hint: 'tick it', file: FILE, line: 19 },
      { rule: 'archive/out-of-scope', severity: 'warning', message: 'outside.txt', hint: 'widen', file: FILE },
    ]);
    expect(report.counts).toEqual({ error: 1, warning: 1, note: 0 });
  });

  const refused = (path: string | undefined, rule = 'protected-file') => ({
    rule,
    severity: 'error' as const,
    message: `the round changed ${path ?? 'files'}, which this brief protects`,
    hint: 'revert the change, or record the departure in the brief before archiving it',
    file: FILE,
    line: 7,
    ...(path === undefined ? {} : { path }),
  });
  const signed = [
    { id: 'R-012-1', paths: ['src/db/**'], signer: 'person@example.com' },
    { id: 'R-012-2', paths: ['src/api.ts'], signer: 'other@example.com' },
  ];

  it('says a protected file a verified ruling covers is refused because spec-brief does not load the plugin', () => {
    const { findings } = audit(input({ archive: { blocking: [refused('src/db/schema.ts'), refused('src/api.ts')], warnings: [] }, verifiedRulings: signed, pluginLoaded: false }));
    const loadIt = 'but spec-brief does not load spec-harness\'s plugin, which is how its archive learns of signed rulings: add "@spec-family/spec-harness/spec-brief-plugin" to "plugins" in its configuration, or run spec-harness init --write';
    expect(findings).toEqual([
      { rule: 'archive/protected-file', severity: 'error', message: 'the round changed src/db/schema.ts, which this brief protects', hint: `ruling R-012-1, signed by person@example.com, allows it, ${loadIt}`, file: FILE, line: 7, subject: 'src/db/schema.ts' },
      { rule: 'archive/protected-file', severity: 'error', message: 'the round changed src/api.ts, which this brief protects', hint: `ruling R-012-2, signed by other@example.com, allows it, ${loadIt}`, file: FILE, line: 7, subject: 'src/api.ts' },
    ]);
  });

  it("says to name the plugin in place of the earlier name, not beside it, where spec-brief's configuration names it so", () => {
    const named = 'but spec-brief\'s configuration names spec-harness\'s plugin "@descent-vtt/spec-harness/spec-brief-plugin", by the name of this package\'s releases up to 0.21.0, so its archive asks that release and not the one installed here: run spec-harness init --write, which names "@spec-family/spec-harness/spec-brief-plugin" in its place, since spec-brief refuses the two side by side';
    const refusedFile = { archive: { blocking: [refused('src/db/schema.ts')], warnings: [] }, verifiedRulings: signed };
    expect(audit(input({ ...refusedFile, pluginLoaded: false, pluginNamedEarlier: true })).findings[0]?.hint).toBe(`ruling R-012-1, signed by person@example.com, allows it, ${named}`);
    // Not given, or false, it is the advice to load the plugin, as before.
    for (const pluginNamedEarlier of [false, undefined]) {
      expect(audit(input({ ...refusedFile, pluginLoaded: false, pluginNamedEarlier })).findings[0]?.hint, String(pluginNamedEarlier)).toContain('but spec-brief does not load spec-harness\'s plugin');
    }
    // A plugin loaded by its name now decides over the earlier name beside it.
    expect(audit(input({ ...refusedFile, pluginLoaded: true, pluginNamedEarlier: true })).findings[0]?.hint).toContain('and the archive still refused it');
  });

  it('says where to look when spec-brief loads the plugin and refuses the file all the same', () => {
    const { findings } = audit(input({ archive: { blocking: [refused('src/db/schema.ts')], warnings: [] }, verifiedRulings: signed, pluginLoaded: true }));
    expect(findings[0]?.hint).toBe(
      'ruling R-012-1, signed by person@example.com, allows it, and the archive still refused it: check that spec-brief loads the spec-harness installed here and measures from the same base (spec-harness doctor)',
    );
  });

  it('keeps spec-brief\'s own hint where no verified ruling covers the file, or the reason is another', () => {
    const hint = 'revert the change, or record the departure in the brief before archiving it';
    const { findings } = audit(
      input({
        archive: { blocking: [refused('src/other.ts'), refused(undefined), refused('src/db/schema.ts', 'open-task')], warnings: [refused('src/db/x.ts', 'out-of-scope')] },
        verifiedRulings: signed,
        pluginLoaded: false,
      }),
    );
    expect(findings.map((f) => f.hint)).toEqual([hint, hint, hint, hint]);
    expect(audit(input({ archive: { blocking: [refused('src/db/schema.ts')], warnings: [] }, pluginLoaded: false })).findings[0]?.hint).toBe(hint);
  });
});

describe('the brief\'s assertions', () => {
  it('fails a goal that does not hold, and says nothing of one that does', () => {
    const { findings } = audit(input({ assertions: [outcome(false, 'Invariants', 30), outcome(true, 'Invariants'), outcome(false, null, 40)] }));
    expect(findings).toEqual([
      {
        rule: 'goal-failed',
        severity: 'error',
        message: '"X" in Invariants: expected 0, found 2',
        hint: 'the round is not done until this holds',
        file: FILE,
        line: 30,
        subject: '"X" in Invariants',
      },
      { rule: 'goal-failed', severity: 'error', message: '"X" in no section: expected 0, found 2', hint: 'the round is not done until this holds', file: FILE, line: 40, subject: '"X" in no section' },
    ]);
  });

  it('warns about a premise that still holds, and notes one the round retired', () => {
    const { findings, counts } = audit(input({ assertions: [outcome(true, 'The Defect, Measured', 12), outcome(false, 'Premises', 14)] }));
    expect(findings).toEqual([
      {
        rule: 'premise-holds',
        severity: 'warning',
        message: 'a premise still holds after the round: "X" in The Defect, Measured',
        hint: 'the round set out to change what this premise states; check that it did, or move the assertion out of the premises',
        file: FILE,
        line: 12,
        subject: '"X" in The Defect, Measured',
      },
      { rule: 'premise-retired', severity: 'note', message: 'a premise no longer holds, as the round intended: "X" in Premises', hint: 'nothing to do', file: FILE, line: 14, subject: '"X" in Premises' },
    ]);
    expect(counts).toEqual({ error: 0, warning: 1, note: 1 });
  });

  it('reads the premise sections the repository configured', () => {
    const { findings } = audit(input({ premiseSections: ['Before'], assertions: [outcome(false, 'before'), outcome(false, 'The Defect, Measured')] }));
    expect(findings.map((f) => f.rule)).toEqual(['premise-retired', 'goal-failed']);
  });
});

describe('premise subsections', () => {
  it('reads an assertion under a subsection of a premise section as a premise', () => {
    const nested = { ...outcome(true, 'Before'), enclosing: ['The Defect, Measured', 'Before'] };
    expect(audit(input({ assertions: [nested] })).findings.map((f) => f.rule)).toEqual(['premise-holds']);
    const goal = { ...outcome(false, 'Detail'), enclosing: ['Invariants', 'Detail'] };
    expect(audit(input({ assertions: [goal] })).findings.map((f) => f.rule)).toEqual(['goal-failed']);
  });
});

describe('premise sections', () => {
  it('are named without case, emphasis, a leading number or a trailing colon', () => {
    const premises = DEFAULT_CONFIG.assertions.premises;
    for (const heading of ['The Defect, Measured', 'the defect, measured', '2. The Defect, Measured', '**Premises**', 'Preconditions:', '  Premises  ', '3) *The Defect, Measured*']) {
      expect(isPremise(heading, premises), heading).toBe(true);
    }
  });

  it('are not a heading that only resembles one, or no heading', () => {
    const premises = DEFAULT_CONFIG.assertions.premises;
    for (const heading of ['The Defect', 'Measured', 'Premises and goals', 'Invariants', '']) {
      expect(isPremise(heading, premises), heading).toBe(false);
    }
    expect(isPremise(null, premises)).toBe(false);
    expect(isPremise('Premises', [])).toBe(false);
  });

  it('keep a numbered premise heading from failing the round that retired it', () => {
    // Read as a goal, the retired premise would be an error on a round that did its job.
    const { findings } = audit(input({ assertions: [outcome(false, '3. **The Defect, Measured:**')] }));
    expect(findings.map((f) => f.rule)).toEqual(['premise-retired']);
  });
});

describe('rulings', () => {
  it('reports each ruling that allows nothing, and why', () => {
    expect(audit(input({ unverifiedRulings: [{ id: 'R-012-1', reason: 'its row is not committed' }] })).findings).toEqual([
      {
        rule: 'ruling-unverified',
        severity: 'warning',
        message: 'ruling R-012-1 allows nothing: its row is not committed',
        hint: "a ruling counts when the commit that last changed its row is signed by a key in the base branch's allowed signers",
        file: FILE,
        subject: 'R-012-1',
      },
    ]);
  });
});

describe('a protection or a ruling\'s path a leading slash roots', () => {
  it('warns that it protects no path, or allows nothing, and fails nothing without --strict', () => {
    const report = audit(
      input({
        brief: row({ protectedFiles: ['/src/db/schema.ts', '{/docs,migrations/**}', 'src/db/**', 'src/[a'] }),
        verifiedRulings: [{ id: 'R-012-1', paths: ['/src/db/schema.ts', '{src/a.ts,/src/b.ts}', 'src/c.ts'], signer: 'p@example.com' }],
      }),
    );
    expect(report.findings).toEqual([
      {
        rule: 'protection-rooted',
        severity: 'warning',
        message: `brief 012 protects "/src/db/schema.ts", which a leading "/" roots at the filesystem's root, so it protects no path`,
        hint: `write it without the leading "/" in ${FILE}, since a protection is read from the repository's root, and check what the round changed there`,
        file: FILE,
        subject: '/src/db/schema.ts',
      },
      {
        rule: 'protection-rooted',
        severity: 'warning',
        message: `brief 012 protects "{/docs,migrations/**}", an alternative of which a leading "/" roots at the filesystem's root, so that alternative protects no path`,
        hint: `write it without the leading "/" in ${FILE}, since a protection is read from the repository's root, and check what the round changed there`,
        file: FILE,
        subject: '{/docs,migrations/**}',
      },
      {
        rule: 'ruling-path-rooted',
        severity: 'warning',
        message: `ruling R-012-1 allows "/src/db/schema.ts", which a leading "/" roots at the filesystem's root, so it allows nothing`,
        hint: `a ruling's path is read from the repository's root: escalate again, and have the person rule on the path without the leading "/"`,
        file: FILE,
        subject: 'R-012-1 /src/db/schema.ts',
      },
      {
        rule: 'ruling-path-rooted',
        severity: 'warning',
        message: `ruling R-012-1 allows "{src/a.ts,/src/b.ts}", an alternative of which a leading "/" roots at the filesystem's root, so that alternative allows nothing`,
        hint: `a ruling's path is read from the repository's root: escalate again, and have the person rule on the path without the leading "/"`,
        file: FILE,
        subject: 'R-012-1 {src/a.ts,/src/b.ts}',
      },
    ]);
    expect(report.counts).toEqual({ error: 0, warning: 4, note: 0 });
  });

  it('comes after the rulings, and says nothing of a pattern the repository roots or the guard cannot read', () => {
    const report = audit(
      input({
        brief: row({ protectedFiles: ['/x'] }),
        unverifiedRulings: [{ id: 'R-1', reason: 'r' }],
        dependencies: { changes: [], unread: [], unreadNames: [{ name: '[x', reason: 'r' }] },
      }),
    );
    expect(report.findings.map((f) => f.rule)).toEqual(['ruling-unverified', 'protection-rooted', 'manifest-name-unread']);
    expect(audit(input({ brief: row({ protectedFiles: ['src/db/**', 'src/[a', 'a/{/b,c}'] }), verifiedRulings: [{ id: 'R-1', paths: ['src/x.ts'], signer: 's' }] })).findings).toEqual([]);
  });
});

describe('dependencies', () => {
  it('warns about a dependency the round added, with its version when it has one', () => {
    const { findings } = audit(input({ dependencies: { changes: [change(null, '^1.3.0'), change(null, '', 'serde')], unread: [] } }));
    expect(findings).toEqual([
      {
        rule: 'new-dependency',
        severity: 'warning',
        message: 'the round added npm dependency "left-pad" ^1.3.0 in package.json (dependencies)',
        hint: 'say in the brief why it is needed, or remove it; a new dependency is code no reviewer read',
        file: 'package.json',
        subject: 'left-pad (dependencies)',
      },
      {
        rule: 'new-dependency',
        severity: 'warning',
        message: 'the round added npm dependency "serde" in package.json (dependencies)',
        hint: 'say in the brief why it is needed, or remove it; a new dependency is code no reviewer read',
        file: 'package.json',
        subject: 'serde (dependencies)',
      },
    ]);
  });

  it('notes a dependency removed or moved to another version', () => {
    const { findings, counts } = audit(input({ dependencies: { changes: [change('1.0.0', null), change('1.0.0', '2.0.0')], unread: [] } }));
    expect(findings).toEqual([
      { rule: 'dependency-removed', severity: 'note', message: 'the round removed "left-pad" from package.json (dependencies)', hint: 'nothing to do', file: 'package.json', subject: 'left-pad (dependencies)' },
      {
        rule: 'dependency-changed',
        severity: 'note',
        message: 'the round moved "left-pad" from 1.0.0 to 2.0.0 in package.json (dependencies)',
        hint: 'nothing to do, if the brief meant it',
        file: 'package.json',
        subject: 'left-pad (dependencies)',
      },
    ]);
    expect(counts).toEqual({ error: 0, warning: 0, note: 2 });
  });
});

describe('install scripts', () => {
  const hint = 'say in the brief why its install scripts must run, or remove the entry; an install script is code no reviewer read, run on every install';

  it('warns about each package the round allowed to run install scripts, named as the manifest names it', () => {
    const report = audit(input({ dependencies: { changes: [], installScripts: [script(null, 'allowed'), script('denied', 'allowed', 'sharp')], unread: [] } }));
    expect(report.findings).toEqual([
      {
        rule: 'install-script-allowed',
        severity: 'warning',
        message: 'the round allowed "canvas@3.1.0" to run install scripts in package.json (allowScripts)',
        hint,
        file: 'package.json',
        subject: 'canvas@3.1.0 (allowScripts)',
      },
      {
        rule: 'install-script-allowed',
        severity: 'warning',
        message: 'the round allowed "sharp" to run install scripts in package.json (allowScripts), which denied it before',
        hint,
        file: 'package.json',
        subject: 'sharp (allowScripts)',
      },
    ]);
    // Warnings, as a new dependency is: they fail the audit only under --strict.
    expect(report.counts).toEqual({ error: 0, warning: 2, note: 0 });
  });

  it('notes a package the round denied, and no more: a denial is no grant', () => {
    const report = audit(input({ dependencies: { changes: [], installScripts: [script(null, 'denied', 'core-js'), script('allowed', 'denied')], unread: [] } }));
    expect(report.findings).toEqual([
      {
        rule: 'install-script-denied',
        severity: 'note',
        message: 'the round denied "core-js" its install scripts in package.json (allowScripts)',
        hint: 'nothing to do, if the brief meant it',
        file: 'package.json',
        subject: 'core-js (allowScripts)',
      },
      {
        rule: 'install-script-denied',
        severity: 'note',
        message: 'the round denied "canvas@3.1.0" its install scripts in package.json (allowScripts), which allowed them before',
        hint: 'nothing to do, if the brief meant it',
        file: 'package.json',
        subject: 'canvas@3.1.0 (allowScripts)',
      },
    ]);
    expect(report.counts).toEqual({ error: 0, warning: 0, note: 2 });
  });

  it('notes an entry the round removed, by what it said, and no more: a grant removed is no grant', () => {
    const report = audit(input({ dependencies: { changes: [], installScripts: [script('allowed', null), script('denied', null, 'core-js')], unread: [] } }));
    expect(report.findings).toEqual([
      {
        rule: 'install-script-entry-removed',
        severity: 'note',
        message: 'the round removed "canvas@3.1.0" from package.json (allowScripts), which allowed its install scripts',
        hint: 'nothing to do, if the brief meant it',
        file: 'package.json',
        subject: 'canvas@3.1.0 (allowScripts)',
      },
      {
        rule: 'install-script-entry-removed',
        severity: 'note',
        message: 'the round removed "core-js" from package.json (allowScripts), which denied its install scripts',
        hint: 'nothing to do, if the brief meant it',
        file: 'package.json',
        subject: 'core-js (allowScripts)',
      },
    ]);
    expect(report.counts).toEqual({ error: 0, warning: 0, note: 2 });
  });

  it('counts the entries that changed apart from the dependencies, and says so on the line only when there are some', () => {
    const report = audit(
      input({ dependencies: { changes: [change(null, '1')], installScripts: [script(null, 'allowed'), script('allowed', null, 'old@1.0.0'), script(null, 'denied', 'core-js')], unread: [] } }),
    );
    expect(report.measured).toMatchObject({ dependencies: { changed: 1, unread: 0 }, installScripts: { changed: 3 } });
    expect(describeMeasured(report.measured)).toBe(
      'measured: goals: none declared · premises: none declared · archive: asked · rulings: none · dependencies: 1 changed, 0 unread · install scripts: 3 changed',
    );
    const one = audit(input({ dependencies: { changes: [], installScripts: [script(null, 'denied')], unread: [] } }));
    expect(describeMeasured(one.measured)).toMatch(/ · dependencies: 0 changed, 0 unread · install scripts: 1 changed$/);
  });

  it('reads none given, or an empty list, as no entry changed', () => {
    for (const dependencies of [{ changes: [], unread: [] }, { changes: [], installScripts: [], unread: [] }]) {
      const report = audit(input({ dependencies }));
      expect(report.findings).toEqual([]);
      expect(report.measured.installScripts).toEqual({ changed: 0 });
      expect(describeMeasured(report.measured)).toMatch(/ · dependencies: 0 changed, 0 unread$/);
    }
  });
});

describe('a premise that premises finds no longer holds', () => {
  const brief = { id: '012', file: FILE };
  const outcome = { description: '"legacyCall" in src', message: 'expected at least 1, found 0', line: 20 };

  it('is stale on a brief no round is working on, and fails the run', () => {
    expect(premiseFinding(brief, outcome, false)).toEqual({
      rule: 'stale-premise',
      severity: 'error',
      message: 'brief 012\'s premise no longer holds: "legacyCall" in src: expected at least 1, found 0',
      hint: 'what the brief was written against has changed; archive the brief if its work is done, or rewrite its premise before a round is run on it',
      file: FILE,
      line: 20,
      subject: '"legacyCall" in src',
    });
  });

  it('is retired on the brief the round is working on, as the audit reports it', () => {
    expect(premiseFinding(brief, outcome, true)).toEqual({
      rule: 'premise-retired',
      severity: 'note',
      message: 'brief 012\'s premise no longer holds, as the round on it intends: "legacyCall" in src',
      hint: 'nothing to do: this is the round that changes it, and audit measures it',
      file: FILE,
      line: 20,
      subject: '"legacyCall" in src',
    });
  });

  it('is a warning when spec-guard cannot read it, about the directive as written, as the audit reports one', () => {
    expect(unreadablePremiseFinding(brief, { message: 'Attribute "min" must be a non-negative integer, got "x".', line: 21, raw: ' <!-- @assert-count min="x" -->\n' })).toEqual({
      rule: 'assertion-unreadable',
      severity: 'warning',
      message: 'spec-guard cannot read a premise of brief 012, so whether it still holds is not checked: Attribute "min" must be a non-negative integer, got "x".',
      hint: `fix the directive in ${FILE}; until spec-guard can read it, nothing checks what it states`,
      file: FILE,
      line: 21,
      subject: '<!-- @assert-count min="x" -->',
    });
  });
});

describe('the report', () => {
  it('orders its parts and counts every severity', () => {
    const report = audit(
      input({
        unmeasured: 'no base',
        archive: { blocking: [{ rule: 'protected-file', severity: 'error', message: 'm', hint: 'h' }], warnings: [] },
        assertions: [outcome(false, 'Invariants'), outcome(false, 'Premises')],
        unreadableAssertions: [{ message: 'm', line: 3, raw: 'r' }],
        unverifiedRulings: [{ id: 'R-1', reason: 'r' }],
        dependencies: {
          changes: [change(null, '1'), change('1', null)],
          installScripts: [script(null, 'allowed'), script(null, 'denied', 'core-js'), script('allowed', null, 'old@1.0.0')],
          unread: ['go.mod'],
          unreadNames: [{ name: '[x', reason: 'r' }],
          rootedNames: [{ name: '/Gemfile', whole: true }],
        },
      }),
    );
    expect(report.findings.map((f) => f.rule)).toEqual([
      'unmeasured',
      'archive/protected-file',
      'goal-failed',
      'premise-retired',
      'assertion-unreadable',
      'ruling-unverified',
      'manifest-name-unread',
      'manifest-name-rooted',
      'manifest-unread',
      'new-dependency',
      'dependency-removed',
      'install-script-allowed',
      'install-script-denied',
      'install-script-entry-removed',
    ]);
    expect(report.counts).toEqual({ error: 2, warning: 8, note: 4 });
    // An archive reason with no file names none, and with no path is about nothing narrower than its rule.
    expect('file' in (report.findings[1] as object)).toBe(false);
    expect('subject' in (report.findings[1] as object)).toBe(false);
    // Nor has a finding about the whole round a subject: its rule and its file are its identity.
    expect('subject' in (report.findings[0] as object)).toBe(false);
  });
});
