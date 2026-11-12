/**
 * The merge that turns the shards of the full mutation sweep back into one
 * score (scripts/mutation-shards.mjs).
 *
 * The merge is the gate, so the property worth holding is that it cannot score
 * anything but exactly one sweep: a report split into shards the way Stryker
 * would write them must merge back to the same verdicts, tests and score, and
 * each way of not being one sweep must be refused rather than scored. The
 * tests are spec-core's, spec-graph's and spec-guard's, where each of 24
 * defects put into the merge one at a time made them fail. This file reads the
 * disk and spawns node, so it is not in the unit suite; the full sweep leaves
 * it out (vitest.mutation.config.ts).
 *
 * The order the sweep runs a mutant's test files in is held here too: it is
 * the sweep's, and no mutant is under it. So is which changes the sweep runs
 * for: the paths the workflow names, against what each sweep mutates, so that
 * no module of src/ is left between the two, and against the tests and the
 * vendored copy its verdicts are made of. And so is what both sweeps report,
 * as vitest resolves it from their two suites.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import { minimatch } from 'minimatch';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BaseSequencer, type TestModule, type TestModuleState, type TestSpecification, type Vitest } from 'vitest/node';

import {
  ASSIGNED,
  cacheFor,
  checkAssignment,
  formatTable,
  gate,
  mergeReports,
  mutateFor,
  reportHtml,
  SHARD_COUNT,
  ShardError,
  TOOLCHAIN,
  toolchainKey,
  type Mutant,
  type Report,
  type Thresholds,
} from '../scripts/mutation-shards.mjs';
import { PREFIX } from './temporary.js';

const ROOT = join(import.meta.dirname, '..');

const BASE = ['src/**/*.ts', '!src/**/index.ts'];
const ASSIGNMENT = [['src/b.ts', 'src/d.ts'], ['src/a.ts']];
const THRESHOLDS = { high: 80, low: 60, break: 50 };

const TESTS: Record<string, string[]> = {
  'tests/a.test.ts': ['parses', 'rejects'],
  'tests/b.test.ts': ['walks', 'skips', 'counts'],
};

const testId = (file: string, name: string) =>
  String(Object.entries(TESTS).flatMap(([f, names]) => names.map((n) => `${f}|${n}`)).indexOf(`${file}|${name}`));

function mutant(id: number, status: string, covered: [string, string][], killed: [string, string][] = []): Mutant {
  return {
    id: String(id),
    mutatorName: 'StringLiteral',
    replacement: '""',
    location: { start: { line: id + 1, column: 1 }, end: { line: id + 1, column: 3 } },
    status,
    static: id % 4 === 0,
    coveredBy: covered.map(([file, name]) => testId(file, name)),
    killedBy: killed.map(([file, name]) => testId(file, name)),
  };
}

const A: [string, string] = ['tests/a.test.ts', 'parses'];
const R: [string, string] = ['tests/a.test.ts', 'rejects'];
const W: [string, string] = ['tests/b.test.ts', 'walks'];
const S: [string, string] = ['tests/b.test.ts', 'skips'];
const C: [string, string] = ['tests/b.test.ts', 'counts'];

// The sweep as one run would report it.
function unsplit(): Report {
  let id = 0;
  const file = (mutants: Mutant[]) => ({ language: 'typescript', source: 'export {};\n', mutants });
  return {
    schemaVersion: '1.0',
    projectRoot: '/work/spec-harness',
    thresholds: THRESHOLDS,
    config: { mutate: BASE, thresholds: THRESHOLDS, timeoutMS: 5000 },
    framework: { name: 'StrykerJS' },
    files: {
      'src/a.ts': file([mutant(id++, 'Killed', [A, R], [R]), mutant(id++, 'Survived', [A]), mutant(id++, 'Timeout', [W], [])]),
      'src/b.ts': file([mutant(id++, 'Killed', [W, S], [S]), mutant(id++, 'NoCoverage', [])]),
      'src/c.ts': file([mutant(id++, 'Survived', [C]), mutant(id++, 'Killed', [C, A], [A]), mutant(id++, 'Killed', [R], [R])]),
      'src/d.ts': file([mutant(id++, 'Killed', [S], [S])]),
      'src/e/f.ts': file([mutant(id++, 'Survived', [W, C]), mutant(id++, 'Killed', [A, W, S], [W])]),
    },
    testFiles: Object.fromEntries(
      Object.entries(TESTS).map(([f, names]) => [
        f,
        { source: '', tests: names.map((name) => ({ id: testId(f, name), name })) },
      ]),
    ),
  };
}

const owner = (file: string) => {
  const index = ASSIGNMENT.findIndex((files) => files.includes(file));
  return index === -1 ? ASSIGNMENT.length + 1 : index + 1;
};

// The shards as Stryker would write them: only their own files, mutant ids and
// test ids numbered afresh, and tests listed in an order of their own - so a
// merge that trusted an id across reports would attach the wrong tests.
function split(report: Report): { shard: number; report: Report }[] {
  return Array.from({ length: ASSIGNMENT.length + 1 }, (_, index) => {
    const shard = index + 1;
    const order = Object.entries(report.testFiles!).flatMap(([file, entry]) => entry.tests.map((test) => ({ file, test })));
    if (shard % 2 === 0) order.reverse();
    const local = new Map(order.map(({ test }, position) => [test.id, String((position * 7 + shard) % 1000)]));
    const testFiles: NonNullable<Report['testFiles']> = {};
    for (const { file, test } of order) {
      (testFiles[file] ??= { source: '', tests: [] }).tests.push({ ...test, id: local.get(test.id)! });
    }
    let nextId = 0;
    const files = Object.fromEntries(
      Object.entries(report.files)
        .filter(([name]) => owner(name) === shard)
        .map(([name, file]) => [
          name,
          {
            ...file,
            mutants: file.mutants.map((m) => ({
              ...m,
              id: String(nextId++),
              coveredBy: m.coveredBy?.map((id) => local.get(id)!),
              killedBy: m.killedBy?.map((id) => local.get(id)!),
            })),
          },
        ]),
    );
    return {
      shard,
      report: {
        ...report,
        files,
        testFiles,
        thresholds: { ...THRESHOLDS, break: null },
        config: { ...report.config, mutate: mutateFor(BASE, shard, ASSIGNMENT), thresholds: { ...THRESHOLDS, break: null } },
      },
    };
  });
}

const merge = (shards: { shard: number; report: Report }[]) =>
  mergeReports(shards, { base: BASE, thresholds: THRESHOLDS, assigned: ASSIGNMENT });

// Every mutant as what it is, with its tests by name rather than by id.
function verdicts(report: Report) {
  const names = new Map(
    Object.entries(report.testFiles!).flatMap(([file, entry]) => entry.tests.map((test) => [test.id, `${file} > ${test.name}`])),
  );
  return Object.entries(report.files).flatMap(([file, entry]) =>
    entry.mutants.map(({ id: _id, coveredBy, killedBy, ...rest }) => ({
      file,
      ...rest,
      coveredBy: coveredBy?.map((id) => names.get(id)),
      killedBy: killedBy?.map((id) => names.get(id)),
    })),
  );
}

const CARRIED = " A shard started from an incremental file that holds other shards' files reports their old verdicts as its own; see cacheFor.";

const refused = (shards: { shard: number; report: Report }[]) => {
  try {
    merge(shards);
  } catch (error) {
    expect(error).toBeInstanceOf(ShardError);
    return (error as Error).message;
  }
  throw new Error('merged');
};

describe('mutateFor', () => {
  it('gives a listed shard its files, and the last shard the rest of the base patterns', () => {
    expect(mutateFor(BASE, 1, ASSIGNMENT)).toEqual(['src/b.ts', 'src/d.ts']);
    expect(mutateFor(BASE, '2', ASSIGNMENT)).toEqual(['src/a.ts']);
    expect(mutateFor(BASE, 3, ASSIGNMENT)).toEqual([...BASE, '!src/b.ts', '!src/d.ts', '!src/a.ts']);
  });

  it('refuses a shard that is unset or not one of them', () => {
    for (const shard of [undefined, '', '0', '4', '1.5', ' 1', 'one']) {
      expect(() => mutateFor(BASE, shard, ASSIGNMENT)).toThrow(`A shard is a number from 1 to 3, got "${String(shard)}".`);
    }
  });

  it('refuses a table that lists a file twice, or a file the configuration does not mutate', () => {
    expect(() => checkAssignment(BASE, [['src/a.ts'], ['src/b.ts', 'src/a.ts']])).toThrow('src/a.ts is assigned to shards 1 and 2.');
    expect(() => checkAssignment(BASE, [['src/m/index.ts']])).toThrow(
      'src/m/index.ts is assigned to shard 1, but the configuration does not mutate it (src/**/*.ts, !src/**/index.ts).',
    );
    expect(() => checkAssignment(BASE, [['lib/a.ts']])).toThrow('lib/a.ts is assigned to shard 1');
    expect(checkAssignment(['src/**/*.ts', '!src/x/**', 'src/x/keep.ts'], [['src/x/keep.ts']]).get('src/x/keep.ts')).toBe(1);
  });
});

describe('cacheFor', () => {
  it('gives each shard every test and only its own files, and nobody a file the configuration does not mutate', () => {
    const cache = unsplit();
    cache.files['lib/types.ts'] = { mutants: [] };
    cache.files['src/index.ts'] = { mutants: [] };
    const parts = [1, 2, 3].map((shard) => cacheFor(cache, mutateFor(BASE, shard, ASSIGNMENT)));

    expect(parts.map((part) => Object.keys(part.files))).toEqual([['src/b.ts', 'src/d.ts'], ['src/a.ts'], ['src/c.ts', 'src/e/f.ts']]);
    for (const part of parts) {
      expect(part.testFiles).toBe(cache.testFiles);
      expect({ ...part, files: undefined }).toEqual({ ...cache, files: undefined });
    }
    expect(Object.keys(cache.files)).toContain('src/index.ts');
  });

  it('leaves nothing to carry over: the merge takes shards started from their parts', () => {
    const original = unsplit();
    const shards = split(original).map(({ shard, report }) => ({
      shard,
      report: { ...report, files: { ...cacheFor(original, mutateFor(BASE, shard, ASSIGNMENT)).files, ...report.files } },
    }));
    expect(verdicts(merge(shards))).toEqual(verdicts(original));
  });
});

describe('toolchainKey', () => {
  const versions: Record<string, string> = {
    '@stryker-mutator/core': '10.1.1',
    '@stryker-mutator/vitest-runner': '10.1.1',
    vitest: '5.0.5',
  };
  const keyWith = (name: string, version: string | undefined) =>
    toolchainKey((asked) => (asked === name ? version : versions[asked]));

  it('names the three packages that decide what a test is to an incremental run, each at its version', () => {
    expect(TOOLCHAIN).toEqual(['@stryker-mutator/core', '@stryker-mutator/vitest-runner', 'vitest']);
    expect(toolchainKey((name) => versions[name])).toBe('core-10.1.1+vitest-runner-10.1.1+vitest-5.0.5');
  });

  it('moves with each of them, and no key followed by a dash starts another', () => {
    // restore-keys match by prefix, and the workflow ends the key with a dash
    // there, so vitest 5.0.1 must not restore what 5.0.12 published.
    const keys = [
      toolchainKey((name) => versions[name]),
      keyWith('@stryker-mutator/core', '10.0.0'),
      keyWith('@stryker-mutator/vitest-runner', '10.1.10'),
      keyWith('vitest', '5.0.1'),
      keyWith('vitest', '5.0.12'),
      keyWith('vitest', '5.1.0-beta.2'),
    ];
    expect(new Set(keys).size).toBe(keys.length);
    for (const a of keys) for (const b of keys) if (a !== b) expect(`${b}-`.startsWith(`${a}-`), `${a} / ${b}`).toBe(false);
  });

  it('refuses a package with no version, rather than key on nothing', () => {
    expect(() => keyWith('vitest', undefined)).toThrow(
      new ShardError('No version of vitest to key the incremental file on, got undefined: run npm ci first.'),
    );
    expect(() => keyWith('@stryker-mutator/core', '')).toThrow('No version of @stryker-mutator/core to key the incremental file on, got "": run npm ci first.');
    expect(() => keyWith('@stryker-mutator/vitest-runner', 'latest')).toThrow('got "latest"');
  });
});

describe('mergeReports', () => {
  it('merges the shards back into the sweep they were split from', () => {
    const original = unsplit();
    const merged = merge(split(original));

    expect(verdicts(merged)).toEqual(verdicts(original));
    expect(Object.keys(merged.files)).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts', 'src/e/f.ts']);
    const ids = Object.values(merged.files).flatMap((file) => file.mutants.map((m) => m.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(gate(merged, THRESHOLDS).metrics).toEqual(gate(original, THRESHOLDS).metrics);
    expect(merged.thresholds).toEqual(THRESHOLDS);
    expect(merged.config).toEqual({ ...original.config, mutate: BASE, thresholds: THRESHOLDS });
    expect(merged.projectRoot).toBe('/work/spec-harness');
  });

  it('merges shards in whatever order their reports arrive', () => {
    const original = unsplit();
    expect(verdicts(merge(split(original).reverse()))).toEqual(verdicts(original));
  });

  it('attaches the wrong tests if test ids are trusted across shards, which is what the fixture is built to catch', () => {
    const original = unsplit();
    const shards = split(original);
    const naive = { ...shards[0]!.report, testFiles: shards[0]!.report.testFiles, files: Object.assign({}, ...shards.map((s) => s.report.files)) };
    expect(verdicts(naive).map((v) => v.coveredBy)).not.toEqual(verdicts(original).map((v) => v.coveredBy));
  });

  it('refuses a sweep with a shard missing', () => {
    const shards = split(unsplit());
    expect(refused(shards.filter((s) => s.shard !== 2))).toBe(
      'No report from shard 2 of 3: the sweep is incomplete, and an incomplete sweep has no score.',
    );
    expect(refused([shards[0]!])).toBe('No report from shard 2 or 3 of 3: the sweep is incomplete, and an incomplete sweep has no score.');
  });

  it('refuses a shard that reported twice, or one that is not a shard', () => {
    const shards = split(unsplit());
    expect(refused([...shards, shards[1]!])).toBe('Shard 2 reported twice.');
    expect(refused([...shards, { shard: 4, report: shards[0]!.report }])).toBe('There are 3 shards, but a report came from shard 4.');
    expect(refused([{ shard: 0, report: shards[0]!.report }, ...shards])).toBe('There are 3 shards, but a report came from shard 0.');
  });

  it('refuses a shard that ran with patterns other than its own', () => {
    const shards = split(unsplit());
    shards[2]!.report.config = { ...shards[2]!.report.config, mutate: BASE };
    expect(refused(shards)).toBe(`Shard 3 ran with mutate ${JSON.stringify(BASE)}, not ${JSON.stringify(mutateFor(BASE, 3, ASSIGNMENT))}.`);
  });

  it('refuses a file mutated by two shards', () => {
    const shards = split(unsplit());
    shards[2]!.report.files['src/a.ts'] = shards[1]!.report.files['src/a.ts']!;
    expect(refused(shards)).toBe(`src/a.ts was mutated by shards 2 and 3.${CARRIED}`);
  });

  it('refuses a file reported by a shard it does not belong to', () => {
    const shards = split(unsplit());
    shards[0]!.report.files['src/c.ts'] = shards[2]!.report.files['src/c.ts']!;
    delete shards[2]!.report.files['src/c.ts'];
    expect(refused(shards)).toBe(`src/c.ts belongs to shard 3, but shard 1 reported it.${CARRIED}`);
  });

  // What the first sharded sweep of spec-guard on CI did: every shard started
  // from the whole sweep's incremental file, so Stryker reported the other
  // shards' files too, with the old verdicts it had carried over.
  it('refuses shards that carried the other shards\' verdicts over from an incremental file', () => {
    const original = unsplit();
    const shards = split(original).map(({ shard, report }) => ({
      shard,
      report: { ...report, files: { ...original.files, ...report.files } },
    }));
    expect(refused(shards)).toBe(`src/a.ts belongs to shard 2, but shard 1 reported it.${CARRIED}`);
  });

  it('refuses a listed file its shard did not mutate, as a renamed file would be', () => {
    const shards = split(unsplit());
    delete shards[0]!.report.files['src/d.ts'];
    expect(refused(shards)).toBe(
      'src/d.ts is assigned to shard 1, which reported no mutants in it. If it was renamed or removed, update ASSIGNED in scripts/mutation-shards.mjs.',
    );
  });

  it('refuses shards that ran different tests', () => {
    const shards = split(unsplit());
    const tests = shards[2]!.report.testFiles!['tests/b.test.ts']!.tests;
    tests.splice(tests.findIndex((test) => test.name === 'skips'), 1);
    expect(refused(shards)).toBe('Shards 1 and 3 ran different tests: 1 only in shard 1, 0 only in shard 3, such as "skips" in tests/b.test.ts.');

    const extra = split(unsplit());
    extra[1]!.report.testFiles!['tests/c.test.ts'] = { source: '', tests: [{ id: '999', name: 'is new' }] };
    expect(refused(extra)).toBe('Shards 1 and 2 ran different tests: 0 only in shard 1, 1 only in shard 2, such as "is new" in tests/c.test.ts.');
  });

  it('refuses tests it cannot tell apart by name', () => {
    const shards = split(unsplit());
    const tests = shards[1]!.report.testFiles!['tests/a.test.ts']!.tests;
    tests.push({ ...tests[0]!, id: '998' });
    expect(refused(shards)).toBe(
      `Shard 2 has two tests named "${tests[0]!.name}" in tests/a.test.ts, so its tests cannot be matched by name. A run started from an incremental file another Stryker or vitest wrote reports every test twice; see toolchainKey.`,
    );
  });

  it('refuses a mutant that names a test its report does not define', () => {
    const shards = split(unsplit());
    shards[1]!.report.files['src/a.ts']!.mutants[0]!.killedBy = ['12345'];
    expect(refused(shards)).toBe('Shard 2 names test 12345, which its report does not define.');
  });
});

describe('gate', () => {
  const scored = (killed: number, survived: number) => {
    const report = unsplit();
    report.files = {
      'src/a.ts': {
        mutants: [
          ...Array.from({ length: killed }, (_, i) => mutant(i, 'Killed', [A], [A])),
          ...Array.from({ length: survived }, (_, i) => mutant(killed + i, 'Survived', [A])),
        ],
      },
    };
    return report;
  };

  it('fails a score under the break threshold and passes one on it, as Stryker does', () => {
    const on = gate(scored(97, 3), { high: 98, low: 95, break: 97 });
    expect(on.metrics.mutationScore).toBe(97);
    expect(on).toMatchObject({ passed: true, message: 'Final mutation score of 97.00 is greater than or equal to break threshold 97.' });

    const under = gate(scored(9699, 301), { high: 98, low: 95, break: 97 });
    expect(under.metrics.mutationScore).toBeCloseTo(96.99, 10);
    expect(under).toMatchObject({ passed: false, message: 'Final mutation score 96.99 under breaking threshold 97.' });
  });

  it('counts a timeout as detected and an uncovered mutant as not', () => {
    const { metrics } = gate(unsplit(), THRESHOLDS);
    expect(metrics).toMatchObject({ killed: 6, timeout: 1, survived: 3, noCoverage: 1, totalMutants: 11 });
    expect(metrics.mutationScore).toBeCloseTo((7 / 11) * 100, 10);
  });

  it('passes anything when no break threshold is configured', () => {
    expect(gate(scored(0, 5), { high: 98, low: 95, break: null })).toMatchObject({
      passed: true,
      message: 'Final mutation score 0.00, with no break threshold configured.',
    });
  });
});

describe('the merged report as people read it', () => {
  it('prints a row per file under the totals', () => {
    expect(formatTable(merge(split(unsplit())))).toBe(
      [
        'File       | % score | % covered | killed | timeout | survived | no cov | errors',
        '-----------|---------|-----------|--------|---------|----------|--------|-------',
        'All files  |   63.64 |     70.00 |      6 |       1 |        3 |      1 |      0',
        'src/a.ts   |   66.67 |     66.67 |      1 |       1 |        1 |      0 |      0',
        'src/b.ts   |   50.00 |    100.00 |      1 |       0 |        0 |      1 |      0',
        'src/c.ts   |   66.67 |     66.67 |      2 |       0 |        1 |      0 |      0',
        'src/d.ts   |  100.00 |    100.00 |      1 |       0 |        0 |      0 |      0',
        'src/e/f.ts |   50.00 |     50.00 |      1 |       0 |        1 |      0 |      0',
      ].join('\n'),
    );
  });

  it('writes a page no source text can break out of', () => {
    const report = unsplit();
    report.files['src/a.ts']!.source = 'const s = "</script><script>alert(1)</script>";';
    const html = reportHtml(report, '/* elements */');
    expect(html).toContain('<script>\n/* elements */\n</script>');
    expect(html.match(/<\/script>/g)).toHaveLength(2);
    const payload = html.slice(html.indexOf('app.report = ') + 'app.report = '.length, html.indexOf(';\nfunction updateTheme'));
    expect(new Function(`return ${payload}`)()).toEqual(report);
  });
});

const load = async <T>(name: string): Promise<T> => ((await import(pathToFileURL(join(ROOT, name)).href)) as { default: T }).default;

// The configuration and the order it names, from one import, so that they are
// the same class.
const mutationSuite = async () =>
  (await import(pathToFileURL(join(ROOT, 'vitest.mutation.config.ts')).href)) as typeof import('../vitest.mutation.config.js');

/**
 * The reporters vitest gives a run of a suite on a GitHub runner, where every
 * step has GITHUB_ACTIONS set to true, resolved by vitest itself from the
 * configuration file, as Stryker's runner has it resolve them: it names none
 * of its own. Vitest 5 reads the variable once, when it is first imported, so
 * the suite is resolved in a process started with it.
 */
function onARunner(name: string): string[] {
  const resolve = [
    "import { resolveConfig } from 'vitest/node';",
    `const { test } = await resolveConfig({ root: ${JSON.stringify(ROOT)}, config: ${JSON.stringify(join(ROOT, name))} });`,
    "const names = test.reporters.map((reporter) => (Array.isArray(reporter) ? String(reporter[0]) : 'inline'));",
    // After anything vitest prints on the way.
    "process.stdout.write('@reporters@' + JSON.stringify(names));",
  ].join('\n');
  const env = { ...process.env, GITHUB_ACTIONS: 'true' };
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', resolve], { cwd: ROOT, env, encoding: 'utf8' });
  return JSON.parse(out.slice(out.lastIndexOf('@reporters@') + '@reporters@'.length)) as string[];
}

describe("the order a mutant's test files run in", () => {
  // What a worker's cache holds for each file after it last ran it, and the
  // size of each file on the disk, which vitest 5 reads where a file has no
  // time.
  type Timed = Record<string, { duration: number; failed: boolean }>;
  const TIMED: Timed = {
    'tests/integration/sandbox.test.ts': { duration: 46_000, failed: false },
    'tests/integration/cli.test.ts': { duration: 7_000, failed: false },
    'tests/unit/briefs.test.ts': { duration: 12, failed: false },
    'tests/unit/config.test.ts': { duration: 15, failed: false },
  };
  const SIZES: Record<string, number> = {
    'tests/integration/sandbox.test.ts': 60_000,
    'tests/integration/cli.test.ts': 45_000,
    'tests/integration/audit.test.ts': 44_000,
    'tests/unit/briefs.test.ts': 8_000,
    'tests/unit/config.test.ts': 10_000,
    'tests/unit/git.test.ts': 2_000,
  };
  const FOUND = Object.keys(SIZES);

  // Files of those sizes, where both sequencers look for them, in a folder
  // of each test's own: the record is the module's, and a file it has not
  // seen is one no worker has run.
  let work = '';
  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), PREFIX)).split(sep).join('/');
    for (const [file, size] of Object.entries(SIZES)) {
      mkdirSync(dirname(join(work, file)), { recursive: true });
      writeFileSync(join(work, file), 'x'.repeat(size));
    }
  });
  afterEach(() => rmSync(work, { recursive: true, force: true }));

  // The order's own record, told of a file's end as vitest tells a reporter.
  const ended = async (file: string, state: TestModuleState) => {
    const { lastRun } = await mutationSuite();
    lastRun.onTestModuleEnd({ moduleId: `${work}/${file}`, state: () => state } as unknown as TestModule);
  };
  // A run of every file the worker has timed, in which those named failed and
  // the rest passed.
  const ran = async (failed: readonly string[]) => {
    for (const file of Object.keys(TIMED)) await ended(file, failed.includes(file) ? 'failed' : 'passed');
  };

  const worker = (timed: Timed, found = FOUND) => {
    const asked: string[] = [];
    const ctx = {
      config: { root: work, shard: { index: 1, count: 2 } },
      cache: {
        getTestSpecificationResult: (file: TestSpecification) => {
          const key = file.moduleId.slice(work.length + 1);
          asked.push(key);
          return timed[key];
        },
      },
    } as unknown as Vitest;
    const files = found.map(
      (file) => ({ moduleId: `${work}/${file}`, project: { name: '', config: { isolate: true, sequence: { groupOrder: 0 } } } }) as unknown as TestSpecification,
    );
    return { ctx, files, asked };
  };
  const names = (files: TestSpecification[]) => files.map((file) => file.moduleId.slice(`${work}/tests/`.length).replace('.test.ts', ''));
  // The sweep's order, of the files as found and as found backwards: an order
  // that only kept what it was given would pass one of the two.
  const ours = async (timed: Timed, found = FOUND) => {
    const { QuickestFirst } = await mutationSuite();
    const { ctx, files, asked } = worker(timed, found);
    const order = names(await new QuickestFirst(ctx).sort(files));
    expect(names(await new QuickestFirst(ctx).sort([...files].reverse()))).toEqual(order);
    return { order, asked };
  };

  it('runs the quickest file first, and a file the worker has not timed after those it has, the smaller first', async () => {
    expect((await ours(TIMED)).order).toEqual(['unit/briefs', 'unit/config', 'integration/cli', 'integration/sandbox', 'unit/git', 'integration/audit']);
  });

  it('runs a file that failed when the worker last ran it before any that passed, however long it takes, and of two that failed the quicker', async () => {
    await ran(['tests/integration/sandbox.test.ts']);
    expect((await ours(TIMED)).order).toEqual(['integration/sandbox', 'unit/briefs', 'unit/config', 'integration/cli', 'unit/git', 'integration/audit']);
    // A run of one file, which fails; the other has not run since it failed.
    await ended('tests/unit/config.test.ts', 'failed');
    expect((await ours(TIMED)).order).toEqual(['unit/config', 'integration/sandbox', 'unit/briefs', 'integration/cli', 'unit/git', 'integration/audit']);
  });

  it("takes no failure from vitest's cache, which keeps one from a narrowed run until a run of the whole file passes", async () => {
    // Every file passed when the worker last ran it, and the cache still has
    // the longest failed.
    await ran([]);
    const kept = { ...TIMED, 'tests/integration/sandbox.test.ts': { duration: 46_000, failed: true } };
    expect((await ours(kept)).order).toEqual(['unit/briefs', 'unit/config', 'integration/cli', 'integration/sandbox', 'unit/git', 'integration/audit']);
  });

  it("keeps a file's verdict through a run that skips it or does not reach it, until a run runs it", async () => {
    await ran(['tests/unit/config.test.ts']);
    for (const state of ['skipped', 'pending', 'queued'] as const) await ended('tests/unit/config.test.ts', state);
    await ended('tests/unit/briefs.test.ts', 'passed');
    expect((await ours(TIMED)).order).toEqual(['unit/config', 'unit/briefs', 'integration/cli', 'integration/sandbox', 'unit/git', 'integration/audit']);
    await ended('tests/unit/config.test.ts', 'passed');
    expect((await ours(TIMED)).order).toEqual(['unit/briefs', 'unit/config', 'integration/cli', 'integration/sandbox', 'unit/git', 'integration/audit']);
  });

  it('differs from the order vitest would give in that alone, and asks the cache what vitest asks it', async () => {
    const failed = { ...TIMED, 'tests/unit/config.test.ts': { duration: 15, failed: true } };
    const timed = Object.keys(TIMED);
    await ran(['tests/unit/config.test.ts']);

    // Vitest's own: the failed file, then the longest, which is why a mutant
    // that only a unit test kills waited for the sandbox tests.
    const theirs = worker(failed, timed);
    expect(names(await new BaseSequencer(theirs.ctx).sort(theirs.files))).toEqual(['unit/config', 'integration/sandbox', 'integration/cli', 'unit/briefs']);
    const sweep = await ours(failed, timed);
    expect(sweep.order).toEqual(['unit/config', 'unit/briefs', 'integration/cli', 'integration/sandbox']);

    // A question vitest's cache stopped answering would find nothing, every
    // file would count as never run, and the order would quietly be by size.
    expect(new Set(sweep.asked)).toEqual(new Set(theirs.asked));
    expect(new Set(sweep.asked)).toEqual(new Set(Object.keys(TIMED)));
  });

  it('gives a shard of the suite the files vitest gives it', async () => {
    const { QuickestFirst } = await mutationSuite();
    const { ctx, files } = worker(TIMED);
    const theirs = names(await new BaseSequencer(ctx).shard(files));
    expect(theirs).toHaveLength(3);
    expect(names(await new QuickestFirst(ctx).shard(files))).toEqual(theirs);
  });

  /**
   * A sandbox of two test files, in a folder of its own and where both
   * suites look for tests: `short`, whose test takes 50 ms, and `long`, whose
   * tests take 200, none and none, the second failing.
   */
  const sandboxes: string[] = [];
  afterEach(() => {
    for (const root of sandboxes.splice(0)) rmSync(root, { recursive: true, force: true });
  });
  function sandbox(): string {
    const root = mkdtempSync(join(tmpdir(), PREFIX));
    sandboxes.push(root);
    mkdirSync(join(root, 'tests/unit'), { recursive: true });
    const pause = (ms: number) => `await new Promise((end) => setTimeout(end, ${ms}));`;
    writeFileSync(join(root, 'tests/unit/short.test.ts'), `test('short holds', async () => { ${pause(50)} });`);
    writeFileSync(join(root, 'tests/unit/long.test.ts'), `test('long holds', async () => { ${pause(200)} }); test('long breaks', () => { throw new Error('broken'); }); test('long quick', () => {});`);
    return root;
  }

  /**
   * Stryker's vitest runner as it runs one mutant after another, in a process
   * of its own run in the sandbox, as Stryker runs a worker: a vitest made
   * from a sweep's configuration with the options the runner gives it, and
   * runs of both files narrowed by a test name pattern, each after clearing
   * the files of the run before. Of each run, the order vitest ran the two
   * files in, as the sequencer it resolved gave that order inside the run,
   * and whether vitest's cache had `long` failed after it. `worker` names the
   * process as Stryker names its workers; `others` is a record another worker
   * writes to the shared file after the run of that index, by the files'
   * names.
   */
  type Run = { order: string[]; failed: boolean };
  type Others = { after: number; record: Record<string, boolean> };
  function asStrykerRuns(config: string, root: string, patterns: readonly string[], { worker, others }: { worker?: string; others?: Others } = {}): Run[] {
    const script = `
      import { writeFileSync } from 'node:fs';
      import { createVitest } from 'vitest/node';
      process.chdir(${JSON.stringify(root)});
      const ctx = await createVitest('test', {
        root: ${JSON.stringify(root)},
        config: ${JSON.stringify(join(ROOT, config))},
        globals: true, watch: false, pool: 'forks', maxWorkers: 1, maxConcurrency: 1, bail: 1, coverage: { enabled: false },
      });
      const name = (file) => file.moduleId.slice(file.moduleId.lastIndexOf('/') + 1, -'.test.ts'.length);
      const orders = [];
      const { sort } = ctx.config.sequence.sequencer.prototype;
      ctx.config.sequence.sequencer.prototype.sort = async function (files) {
        const sorted = await sort.call(this, files);
        orders.push(sorted.map(name));
        return sorted;
      };
      const id = (file) => ctx.config.root + '/tests/unit/' + file + '.test.ts';
      const files = ['short', 'long'].map(id);
      const long = ctx.getRootProject().createSpecification(files[1]);
      const others = ${JSON.stringify(others ?? null)};
      const results = [];
      for (const [index, pattern] of ${JSON.stringify(patterns)}.entries()) {
        ctx.state.filesMap.clear();
        for (const project of ctx.projects) project.config.testNamePattern = new RegExp(pattern);
        await ctx.start(files);
        results.push({ order: orders.at(-1), failed: ctx.cache.getTestSpecificationResult(long).failed });
        if (others?.after === index) {
          const record = Object.fromEntries(Object.entries(others.record).map(([file, failed]) => [id(file), failed]));
          writeFileSync(${JSON.stringify(join(root, '.vitest-order-record.json'))}, JSON.stringify(record));
        }
      }
      await ctx.close();
      process.exitCode = 0;
      process.stdout.write('@runs@' + JSON.stringify(results));
    `;
    const env = { ...process.env };
    delete env['STRYKER_MUTATOR_WORKER'];
    if (worker !== undefined) env['STRYKER_MUTATOR_WORKER'] = worker;
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: ROOT, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return JSON.parse(out.slice(out.lastIndexOf('@runs@') + '@runs@'.length)) as Run[];
  }
  const orders = (runs: Run[]) => runs.map(({ order }) => order);

  /** The record the sandbox's shared file holds, by the files' names, or none. */
  function held(root: string): Record<string, boolean> | undefined {
    const file = join(root, '.vitest-order-record.json');
    if (!existsSync(file)) return undefined;
    const record = JSON.parse(readFileSync(file, 'utf8')) as Record<string, boolean>;
    return Object.fromEntries(Object.entries(record).map(([id, failed]) => [id.slice(id.lastIndexOf('/') + 1, -'.test.ts'.length), failed]));
  }

  // Each sweep's: the core sweep's suite takes the order and its record from
  // the full sweep's, and each is resolved from its own file, as Stryker's
  // runner resolves it.
  it.each(['vitest.mutation.config.ts', 'vitest.core.config.ts'])("runs first, inside the next run, the file that failed in the run before, then the quicker whole file, in runs narrowed as Stryker narrows them, where vitest 5's cache keeps an older failure (%s)", (config) => {
    const runs = asStrykerRuns(config, sandbox(), ['holds$', 'short holds$|long breaks$', 'holds$', 'short holds$|long quick$', 'holds$']);
    // The smaller first, as neither has a time; then the quicker; then the
    // one that failed in the run before; then, as it passed there, the
    // quicker again; and after a run of its one quick test, still `short`, by
    // the cache's time, the whole file's: a record of each run's time, which
    // would run `long` first there, swept no better in spec-core (its
    // ADR-0007, 2026-11-09). A record emptied at the start of each run, as an
    // `onInit` of the reporter would empty it, runs the quicker first in the
    // third.
    expect(runs.map(({ order }) => order)).toEqual([
      ['short', 'long'],
      ['short', 'long'],
      ['long', 'short'],
      ['short', 'long'],
      ['short', 'long'],
    ]);
    // Why the order keeps a record: from the second run on vitest's cache has
    // `long` failed, and by it the fourth run would run `long` first. Where it
    // does not, vitest forgets a failure as 4 did, and spec-core's ADR-0008
    // says what a sweep must show before the record goes.
    expect(runs.map(({ failed }) => failed)).toEqual([false, true, true, true, true]);
  });

  it.each(['vitest.mutation.config.ts', 'vitest.core.config.ts'])('begins a worker Stryker starts with the record the workers before it left in the sandbox, and a process that is not one of its workers with none, writing none (%s)', (config) => {
    const root = sandbox();
    // The first worker of a sweep: the smaller first, as neither has a time,
    // then the quicker, which passes, and `long`, which fails. It leaves its
    // record in the sandbox, and vitest leaves the times in its cache.
    expect(orders(asStrykerRuns(config, root, ['holds$', 'short holds$|long breaks$'], { worker: '1' }))).toEqual([
      ['short', 'long'],
      ['short', 'long'],
    ]);
    expect(held(root)).toEqual({ short: false, long: true });

    // A process that is not a worker reads no record: the quicker first, by
    // the times vitest's cache kept, which is how a worker Stryker started
    // after a timeout began with the record in its memory alone. It leaves
    // the file as it found it.
    expect(orders(asStrykerRuns(config, root, ['holds$']))).toEqual([['short', 'long']]);
    expect(held(root)).toEqual({ short: false, long: true });

    // A worker started in its place begins with `long` failed, as the first
    // left it, and as vitest 4's cache file had it.
    expect(orders(asStrykerRuns(config, root, ['holds$'], { worker: '2' }))).toEqual([['long', 'short']]);
    expect(held(root)).toEqual({ short: false, long: false });
  });

  it("reads the sandbox's record once, when the worker starts, and from then on goes by the worker's own runs, writing its record whole after each", () => {
    const root = sandbox();
    const config = 'vitest.mutation.config.ts';
    asStrykerRuns(config, root, ['holds$', 'short holds$|long breaks$'], { worker: '1' });
    // The second worker begins with `long` failed and passes it. Another
    // worker then writes `long` failed again, and this one runs the quicker
    // first, by its own run: a record read back before each sort would be
    // vitest 5's cache again, a file failed in every worker once it failed in
    // one (spec-core's ADR-0008, amended 2026-11-12).
    const runs = asStrykerRuns(config, root, ['holds$', 'holds$'], { worker: '2', others: { after: 0, record: { short: false, long: true } } });
    expect(orders(runs)).toEqual([
      ['long', 'short'],
      ['short', 'long'],
    ]);
    // And over what the other wrote, its own record, whole.
    expect(held(root)).toEqual({ short: false, long: false });
  });
});

describe("the order's record, shared through a file", () => {
  let work = '';
  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), PREFIX));
  });
  afterEach(() => rmSync(work, { recursive: true, force: true }));

  it("is kept in the folder of one of Stryker's workers, and nowhere for any other process", async () => {
    const { recordFile, RECORD_FILE } = await mutationSuite();
    expect(recordFile({ STRYKER_MUTATOR_WORKER: '3' }, work)).toBe(join(work, RECORD_FILE));
    expect(recordFile({ STRYKER_MUTATOR_WORKER: '0' }, work)).toBe(join(work, RECORD_FILE));
    expect(recordFile({}, work)).toBeUndefined();
    expect(recordFile({ STRYKER_MUTATOR_WORKER: undefined, MUTATION_SHARD: '2' }, work)).toBeUndefined();
  });

  it('reads back what was written, and writes it whole over what was there, leaving no file of its own beside it', async () => {
    const { readRecord, writeRecord } = await mutationSuite();
    const file = join(work, 'record.json');
    writeRecord(file, new Map([['/s/tests/a.test.ts', true], ['/s/tests/b.test.ts', false]]));
    expect(readRecord(file)).toEqual(new Map([['/s/tests/a.test.ts', true], ['/s/tests/b.test.ts', false]]));
    writeRecord(file, new Map([['/s/tests/b.test.ts', true]]));
    expect(readRecord(file)).toEqual(new Map([['/s/tests/b.test.ts', true]]));
    expect(readdirSync(work)).toEqual(['record.json']);
  });

  it('reads nothing from a file that is missing, unreadable or not a record, and keeps only the verdicts that are true or false', async () => {
    const { readRecord } = await mutationSuite();
    const file = join(work, 'record.json');
    expect(readRecord(file)).toEqual(new Map());
    for (const text of ['', '{"a": tr', 'null', '[["a", true]]', '"a"', '7']) {
      writeFileSync(file, text);
      expect(readRecord(file), text).toEqual(new Map());
    }
    writeFileSync(file, JSON.stringify({ a: true, b: false, c: 'true', d: 1, e: null, f: { failed: true } }));
    expect(readRecord(file)).toEqual(new Map([['a', true], ['b', false]]));
    expect(readRecord(work)).toEqual(new Map());
  });

  it('writes nothing where it cannot, and does not stop the run for it', async () => {
    const { readRecord, writeRecord } = await mutationSuite();
    const file = join(work, 'gone', 'record.json');
    expect(() => writeRecord(file, new Map([['a', true]]))).not.toThrow();
    expect(readRecord(file)).toEqual(new Map());
    expect(readdirSync(work)).toEqual([]);
  });
});

describe('this repository', () => {
  const strykerConfig = () => load<{ mutate: string[]; thresholds: Thresholds; vitest: unknown }>('stryker.config.mjs');

  // Stryker's reading of `mutate`, written again here with minimatch, the
  // matcher Stryker uses, so the script is not checked against itself.
  const reads = (patterns: readonly string[], file: string): boolean =>
    patterns.reduce((hit, pattern) => (pattern.startsWith('!') ? hit && !minimatch(file, pattern.slice(1)) : hit || minimatch(file, pattern)), false);

  /** Every file under a directory of the repository, by its path from the root. */
  const filesUnder = (directory: string): string[] =>
    readdirSync(join(ROOT, directory), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => relative(ROOT, join(entry.parentPath, entry.name)).replaceAll('\\', '/'))
      .sort();

  const sources = () => filesUnder('src').filter((file) => file.endsWith('.ts'));

  afterEach(() => {
    delete process.env['MUTATION_SHARD'];
  });

  it('lists only files the configuration mutates, each once', async () => {
    const { mutate } = await strykerConfig();
    expect([...checkAssignment(mutate).keys()].sort()).toEqual(ASSIGNED.flat().sort());
    for (const file of ASSIGNED.flat()) expect(sources()).toContain(file);
  });

  it('mutates every file the one-process sweep mutates in exactly one shard, a file added later in the last', async () => {
    const { mutate } = await strykerConfig();
    const shards = Array.from({ length: SHARD_COUNT }, (_, index) => mutateFor(mutate, index + 1));
    const holders = (file: string) => shards.flatMap((patterns, index) => (reads(patterns, file) ? [index + 1] : []));
    const expected = (file: string) => {
      const listed = ASSIGNED.findIndex((files) => files.includes(file));
      if (!reads(mutate, file)) return [];
      return listed === -1 ? [SHARD_COUNT] : [listed + 1];
    };
    const files = [...sources(), 'src/later.ts', 'src/vendor/spec-core/later.ts'];
    for (const file of files) expect(holders(file), file).toEqual(expected(file));
    expect(holders('src/later.ts')).toEqual([SHARD_COUNT]);
    expect(holders('src/vendor/spec-core/later.ts')).toEqual([]);
    expect(sources().filter((file) => holders(file)[0] === SHARD_COUNT).length).toBeGreaterThan(1);
  });

  it('runs every test in every shard: the suite npm test runs, less the source checks and the tests of the sweep\'s own scripts', async () => {
    // With vitest's `related` on, the tests a shard runs would depend on the
    // files it holds, and the merge would refuse the sweep - or, with a test
    // that reaches a file other than through an import, score one that is not
    // the sweep a single run would have done.
    expect((await strykerConfig()).vitest).toEqual({ configFile: 'vitest.mutation.config.ts', related: false });
    type Test = { include: string[]; exclude?: string[]; environment: string; testTimeout: number; hookTimeout: number; sequence?: unknown; reporters?: unknown };
    const unit = (await load<{ test: Test }>('vitest.config.ts')).test;
    const suite = await mutationSuite();
    const { exclude, sequence, reporters, ...mutation } = (suite.default as { test: Test }).test;
    expect(mutation).toEqual({ include: unit.include, environment: unit.environment, testTimeout: unit.testTimeout, hookTimeout: unit.hookTimeout });
    expect(exclude).toEqual(['tests/source.test.ts', 'tests/mutation-shards.test.ts', 'tests/mutation-unmeasured.test.ts', 'tests/mutation-compare.test.ts', '**/node_modules/**']);
    // The order is the sweep's alone: `npm test` reports every failure, and
    // runs its files side by side.
    expect(sequence).toEqual({ sequencer: suite.QuickestFirst });
    expect(unit.sequence).toBeUndefined();
    // So are the reporters it names: vitest's default, which the next test
    // holds to what vitest makes of it, and the one that keeps the order's
    // record.
    expect(reporters).toEqual(['default', suite.lastRun]);
    expect(unit.reporters).toBeUndefined();
  });

  it("runs the core sweep's files in the full sweep's order, with its record, and nothing else of the full sweep's suite", async () => {
    // The order and the record are the full sweep's, one class and one
    // reporter: a sequencer of the core sweep's own would sort by a record
    // its reporter never fills.
    type Unit = { include: string[]; environment: string; testTimeout: number; sequence?: unknown; reporters?: unknown };
    const suite = await mutationSuite();
    const { sequence, reporters, ...unit } = (await load<{ test: Unit }>('vitest.core.config.ts')).test;
    expect(sequence).toEqual({ sequencer: suite.QuickestFirst });
    expect((sequence as { sequencer: unknown }).sequencer).toBe(suite.QuickestFirst);
    expect(reporters).toEqual(['default', suite.lastRun]);
    expect((reporters as unknown[])[1]).toBe(suite.lastRun);
    // The unit suite alone, under a limit of its own.
    expect(unit).toEqual({ include: ['tests/unit/**/*.test.ts'], environment: 'node', testTimeout: 30_000 });
  });

  it("has each sweep's run report through vitest's default reporter and the order's record alone on a runner, so that no mutant's run adds a summary to the step's", () => {
    // Where a suite names none, vitest adds its github-actions reporter on a
    // runner, and it appends a summary of every run to the step's own: the
    // core sweep's came to 1,093k on main's push of bd6a87c, where GitHub
    // uploads 1MiB a step, and its job ended on an error annotation that said
    // so (vitest.core.config.ts). The record is the reporter given inline, as
    // the tests above have it.
    expect(onARunner('vitest.core.config.ts')).toEqual(['default', 'inline']);
    expect(onARunner('vitest.mutation.config.ts')).toEqual(['default', 'inline']);
    // The suite `npm test` runs keeps the annotations and the summary vitest
    // gives a run on a runner.
    expect(onARunner('vitest.config.ts')).toContain('github-actions');
  });

  it('gives a shard its own files, its own report, and no gate', async () => {
    const { mutate, thresholds } = await strykerConfig();
    process.env['MUTATION_SHARD'] = '2';
    const shard = await load<Record<string, unknown>>('stryker.shard.config.mjs');
    expect(shard['mutate']).toEqual(mutateFor(mutate, 2));
    expect(shard['thresholds']).toEqual({ ...thresholds, break: null });
    expect(shard['jsonReporter']).toEqual({ fileName: 'reports/mutation/shard-2.json' });
    // The timeline reads the progress reporter's counts; without them a
    // sweep's minutes cannot be measured again.
    expect(shard['reporters']).toEqual(['json', 'clear-text', 'progress']);
  });

  it('refuses to load for a shard that is unset or not one of them, rather than mutate everything', () => {
    const url = pathToFileURL(join(ROOT, 'stryker.shard.config.mjs')).href;
    const run = (shard: string | undefined) => {
      const env = { ...process.env };
      delete env['MUTATION_SHARD'];
      if (shard !== undefined) env['MUTATION_SHARD'] = shard;
      try {
        execFileSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(url)});`], { cwd: ROOT, env, stdio: 'pipe' });
        return 'loaded';
      } catch (error) {
        return String((error as { stderr: Buffer }).stderr);
      }
    };
    expect(run(String(SHARD_COUNT))).toBe('loaded');
    expect(run(String(SHARD_COUNT + 1))).toContain(`A shard is a number from 1 to ${SHARD_COUNT}, got "${SHARD_COUNT + 1}".`);
    expect(run(undefined)).toContain(`A shard is a number from 1 to ${SHARD_COUNT}, got "undefined".`);
  });

  it('keys the incremental file on the Stryker and vitest the lockfile installs', () => {
    const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8')) as { packages: Record<string, { version?: string }> };
    const printed = execFileSync(process.execPath, ['scripts/mutation-shards.mjs', 'toolchain'], { cwd: ROOT, encoding: 'utf8' }).trim();
    expect(printed).toBe(toolchainKey((name) => lock.packages[`node_modules/${name}`]?.version));
  });

  describe('the two tiers', () => {
    const workflow = readFileSync(join(ROOT, '.github/workflows/mutation.yml'), 'utf8');
    /** A job of the workflow, from its key to the next job's. */
    const job = (name: string): string => `\n${(workflow.split(`\n  ${name}:\n`)[1] ?? '').split(/\n  [a-z-]+:\n/)[0] as string}`;
    const steps = (name: string): string[] => job(name).split('\n      - ');
    const step = (name: string, title: string): string => steps(name).find((each) => each.includes(`name: ${title}\n`)) ?? '';

    it('run a pull request incrementally and every other event in full, and say which in each check', () => {
      expect(job('shard')).toContain("\n      FULL: ${{ github.event_name != 'pull_request' }}\n");
      const tier = "${{ github.event_name == 'pull_request' && 'incremental' || 'full' }}";
      expect(job('shard')).toContain(`\n    name: mutation (${tier}, shard ${'${{ matrix.shard }}'} of ${'${{ strategy.job-total }}'})\n`);
      expect(job('full')).toContain(`\n    name: mutation (${tier})\n`);
      const sweep = step('shard', 'Mutation sweep, one shard');
      expect(sweep).toContain('if [ "$FULL" = "true" ]; then\n            npx --no-install stryker run stryker.shard.config.mjs\n          else\n            npx --no-install stryker run stryker.shard.config.mjs --incremental\n          fi');
    });

    it('restore the incremental file only in the incremental tier, under the toolchain that published it, and give each shard its own part', () => {
      const restore = step('shard', 'Restore the incremental file');
      expect(restore).toContain("\n        if: env.FULL != 'true'\n        uses: actions/cache/restore@");
      expect(restore).toContain('\n          key: stryker-incremental-${{ steps.toolchain.outputs.key }}-${{ github.sha }}\n');
      expect(restore).toContain('\n          restore-keys: |\n            stryker-incremental-${{ steps.toolchain.outputs.key }}-\n');
      const keep = step('shard', "Keep this shard's part of the incremental file");
      expect(keep).toContain("\n        if: env.FULL != 'true'\n        run: node scripts/mutation-shards.mjs cache \"$MUTATION_SHARD\"");
      // Each job names the toolchain before a step reads it: the restore, the
      // part, the sweep; the merge, and the publication after it.
      const order = (name: string, titles: string[]) => titles.map((title) => steps(name).findIndex((each) => each.includes(`name: ${title}\n`)));
      const shard = order('shard', ['Name the toolchain', 'Restore the incremental file', "Keep this shard's part of the incremental file", 'Mutation sweep, one shard']);
      expect(shard).toEqual([...shard].sort((a, b) => a - b));
      expect(shard[0]).toBeGreaterThan(-1);
      const full = order('full', ['Name the toolchain', 'Merge the shards and apply the gate', 'Publish the incremental file']);
      expect(full).toEqual([...full].sort((a, b) => a - b));
      expect(full[0]).toBeGreaterThan(-1);
      for (const line of workflow.split('\n').filter((each) => each.includes('stryker-incremental-'))) {
        expect(line.trim()).toMatch(/^(key: )?stryker-incremental-\$\{\{ steps\.toolchain\.outputs\.key \}\}-/);
      }
    });

    it("publish the incremental file from main's full sweep alone, where its merge passed, and from no pull request or branch", () => {
      const saves = [...workflow.matchAll(/uses: actions\/cache\/save@/g)];
      expect(saves).toHaveLength(1);
      const publish = step('full', 'Publish the incremental file');
      expect(publish).toContain("\n        if: github.event_name != 'pull_request' && github.ref == 'refs/heads/main'\n        uses: actions/cache/save@");
      expect(publish).toContain('\n          key: stryker-incremental-${{ steps.toolchain.outputs.key }}-${{ github.sha }}\n');
      // The last step, with no status function in its condition, so it is
      // skipped where the merge refused the sweep or its score failed.
      expect(steps('full').at(-1)).toBe(publish);
      expect(publish).not.toMatch(/always\(\)|failure\(\)|cancelled\(\)/);
      expect(job('shard')).not.toContain('actions/cache/save');
    });
  });

  it('runs one job per shard', () => {
    const workflow = readFileSync(join(ROOT, '.github/workflows/mutation.yml'), 'utf8');
    expect(/^\s+shard: \[([\d, ]+)\]$/m.exec(workflow)?.[1]).toBe(Array.from({ length: SHARD_COUNT }, (_, index) => index + 1).join(', '));
  });

  describe('the changes the full sweep runs for', () => {
    const workflow = readFileSync(join(ROOT, '.github/workflows/mutation.yml'), 'utf8');
    const coreConfig = () => load<{ mutate: string[] }>('stryker.core.config.mjs');

    /** The paths the workflow filters an event by, as it writes them, up to the first line that is no entry. */
    const pathsOf = (event: string): string[] => {
      const filtered = (workflow.split(`\n  ${event}:\n`)[1] ?? '').split(/\n  [a-z_]+:\n/)[0] as string;
      const entries: string[] = [];
      // The key may be the event's first line.
      for (const line of (`\n${filtered}`.split('\n    paths:\n')[1] ?? '').split('\n')) {
        const entry = /^      - (['"]?)(\S+)\1$/.exec(line);
        if (entry === null) break;
        entries.push(entry[2] as string);
      }
      return entries;
    };

    /** The entries that name one module of src/, which is how each source is written, and not a directory of it. */
    const named = (paths: readonly string[]): string[] => paths.filter((path) => path.startsWith('src/') && !path.endsWith('/**'));

    /**
     * Whether GitHub's filter matches a file by an entry: `*` is any run of
     * characters but a slash and `**` any run at all. By those words a
     * name that starts with a dot is matched with the rest, and minimatch
     * matches one only where it is told to (its `dot`).
     */
    const runsFor = (path: string, file: string): boolean => minimatch(file, path, { dot: true });

    /**
     * The sources a pull request could change with no sweep reading the
     * change: the full sweep mutates them, the core sweep does not mutate
     * them whole, and the full sweep does not run for them.
     */
    const between = (files: readonly string[], full: readonly string[], core: readonly string[], paths: readonly string[]): string[] =>
      files.filter((file) => reads(full, file) && !reads(core, file) && !paths.includes(file));

    it('are the same for a pull request and for a push to main, beside the schedule and a dispatch', () => {
      const paths = pathsOf('pull_request');
      expect(paths.length).toBeGreaterThan(10);
      expect(pathsOf('push')).toEqual(paths);
      // Main's own pushes, and no tag's: a filter of paths is not read for a tag.
      expect(workflow).toContain('\n  push:\n    branches: [main]\n    paths:\n');
      expect(workflow).toContain("\n    - cron: '0 5 * * 1'\n  workflow_dispatch:\n    inputs:\n      full:\n");
      // One filter an event: GitHub refuses `paths` beside `paths-ignore`.
      expect(workflow).not.toMatch(/^\s*paths-ignore:/m);
    });

    it('have both jobs run for every event but a dispatch that asks for no sweep, since a run that swept nothing would be green', () => {
      const conditions = [...workflow.matchAll(/^    if: (.+)$/gm)].map((match) => match[1]);
      expect(conditions).toEqual(["github.event_name != 'workflow_dispatch' || inputs.full", "${{ !cancelled() && (github.event_name != 'workflow_dispatch' || inputs.full) }}"]);
    });

    it("end a pull request's older sweep when it is pushed to again, and no sweep of another pull request, of main, of the schedule or of a dispatch", () => {
      // The ref of a pull request's run is refs/pull/<number>/merge, a group
      // of its own, and the event keeps a dispatch on a branch and the
      // schedule on main apart from a push to either.
      expect(workflow).toContain('\nconcurrency:\n  group: mutation-${{ github.ref }}-${{ github.event_name }}\n  cancel-in-progress: true\n');
    });

    it('name each source the full sweep mutates and the core sweep does not mutate whole, and no other source', async () => {
      const full = (await strykerConfig()).mutate;
      const core = (await coreConfig()).mutate;
      const paths = pathsOf('pull_request');
      const left = sources().filter((file) => reads(full, file) && !reads(core, file)).sort();
      // The edges, and the one whose pure function alone the core sweep mutates.
      expect(left).toEqual(expect.arrayContaining(['src/cli.ts', 'src/round.ts', 'src/server.ts', 'src/setup.ts', 'src/workspace.ts']));
      expect(core).toContain('src/usage.ts');
      expect(left).not.toContain('src/usage.ts');
      expect(
        named(paths),
        "A module of src/ is in the core sweep's list in stryker.core.config.mjs, whole, or among the paths of .github/workflows/mutation.yml, under pull_request and under push.",
      ).toEqual(left);
      // The one entry under src/ that is no module's name is the vendored copy, which no sweep here mutates.
      expect(paths.filter((path) => path.startsWith('src/') && !named(paths).includes(path))).toEqual(['src/vendor/**']);
      expect(between(sources(), full, core, paths)).toEqual([]);
    });

    it("are found short by a module that neither sweep's list names, and by none that a sweep reads already or that no sweep mutates", async () => {
      const full = (await strykerConfig()).mutate;
      const core = (await coreConfig()).mutate;
      const paths = pathsOf('pull_request');
      expect(between([...sources(), 'src/later.ts'], full, core, paths)).toEqual(['src/later.ts']);
      // Without the paths, what is left is the full sweep's alone, the module the core sweep has in part with it.
      expect(between(['src/cli.ts', 'src/usage.ts', 'src/workspace.ts'], full, core, [])).toEqual(['src/cli.ts', 'src/workspace.ts']);
      expect(between(['src/usage.ts', 'src/index.ts', 'src/types.ts', 'src/vendor/spec-core/later.ts'], full, core, [])).toEqual([]);
    });

    it('name each source by its own name, which GitHub reads as that file and no other', () => {
      // A filter reads `*`, `?`, `+`, brackets and a leading `!` as a pattern.
      const modules = named(pathsOf('pull_request'));
      expect(modules.length).toBeGreaterThan(10);
      for (const path of modules) expect(path).toMatch(/^src\/[a-z-]+\.ts$/);
    });

    it("are also what the sweep is made of: the Stryker configurations, its suite's, its scripts and the workflow", async () => {
      const paths = pathsOf('pull_request').filter((path) => !path.startsWith('src/') && !path.startsWith('tests/'));
      expect(paths).toEqual(['stryker.config.mjs', 'stryker.core.config.mjs', 'stryker.shard.config.mjs', 'vitest.mutation.config.ts', 'scripts/mutation-*.mjs', '.github/workflows/mutation.yml']);
      // What the workflow runs, read from it, so that a script it comes to run is one it runs for.
      const scripts = [...new Set([...workflow.matchAll(/\bnode (scripts\/[\w.-]+)/g)].map((match) => match[1] as string))].sort();
      expect(scripts).toEqual(['scripts/mutation-compare.mjs', 'scripts/mutation-shards.mjs', 'scripts/mutation-unmeasured.mjs']);
      const shard = /\bstryker run (\S+)/.exec(workflow)?.[1];
      expect(shard).toBe('stryker.shard.config.mjs');
      const suite = ((await strykerConfig()).vitest as { configFile: string }).configFile;
      // `*` is any run of characters but a slash, to GitHub's filter as to minimatch.
      for (const file of ['.github/workflows/mutation.yml', 'stryker.config.mjs', shard as string, suite, ...scripts]) {
        expect(paths.some((path) => minimatch(file, path)), file).toBe(true);
      }
    });

    it("are also what its verdicts are made of beside the sources it mutates: every file of the integration suite, and every file of the vendored spec-core", async () => {
      const paths = pathsOf('pull_request');
      // A directory and all under it, as GitHub reads `dir/**`; `dir/*` would stop at its own files.
      expect(paths.filter((path) => path.endsWith('/**'))).toEqual(['tests/integration/**', 'src/vendor/**']);
      const suite = filesUnder('tests/integration');
      const vendored = filesUnder('src/vendor');
      expect(suite.filter((file) => file.endsWith('.test.ts')).length).toBeGreaterThan(15);
      expect(suite).toEqual(expect.arrayContaining(['tests/integration/helpers.ts', 'tests/integration/registry.ts']));
      expect(vendored).toEqual(expect.arrayContaining(['src/vendor/spec-core/VENDOR.json', 'src/vendor/spec-core/pattern/glob.ts']));
      for (const file of [...suite, ...vendored, 'tests/integration/later/deep.test.ts', 'src/vendor/spec-core/later/.hidden']) {
        expect(paths.some((path) => runsFor(path, file)), file).toBe(true);
      }
      // The suite is in the sweep, and the vendored copy is in no sweep's `mutate`: its path alone runs one for it.
      const { include, exclude } = ((await mutationSuite()).default as { test: { include: string[]; exclude: string[] } }).test;
      expect(suite.filter((file) => file.endsWith('.test.ts') && !(include.some((pattern) => minimatch(file, pattern)) && !exclude.some((pattern) => minimatch(file, pattern))))).toEqual([]);
      const full = (await strykerConfig()).mutate;
      expect(vendored.filter((file) => reads(full, file))).toEqual([]);
    });

    it('have the integration suite share its helpers with nothing outside its directory, where a change would move a verdict and run no sweep', () => {
      const outside: string[] = [];
      for (const file of filesUnder('tests/integration').filter((name) => name.endsWith('.ts'))) {
        const text = readFileSync(join(ROOT, file), 'utf8');
        // What a file imports by a path of its own, statically, for its effects or when it runs.
        for (const match of text.matchAll(/(?:\bfrom\s+|\bimport\s+|\bimport\(\s*)(['"])(\.{1,2}\/[^'"]+)\1/g)) {
          const target = posix.normalize(posix.join(posix.dirname(file), match[2] as string));
          if (!target.startsWith('tests/integration/') && !target.startsWith('src/')) outside.push(`${file} imports ${target}`);
        }
      }
      // The run's temporary directory, which its own test reads: it reaches
      // no source, and the sweep runs without it (vitest.mutation.config.ts).
      expect(outside).toEqual(['tests/integration/temporary.test.ts imports tests/temporary.js']);
    });

    it('are none of what is left to the core sweep and to the schedule: a module the core sweep mutates whole, a unit test, a test of the repository itself, a dependency, a document', async () => {
      const paths = pathsOf('pull_request');
      const core = (await coreConfig()).mutate;
      const whole = sources().filter((file) => core.includes(file));
      expect(whole).toEqual(expect.arrayContaining(['src/configure.ts', 'src/usage.ts']));
      const left = [
        ...whole,
        ...filesUnder('tests/unit'),
        ...filesUnder('tests').filter((file) => !file.startsWith('tests/integration/') && !file.startsWith('tests/unit/')),
        // A file beside a directory that is named is not in it.
        'tests/integration.test.ts',
        'src/vendor.ts',
        'package.json',
        'package-lock.json',
        'README.md',
        'docs/reference/doctor.md',
        'docs/adr/0010-toolchain-and-verification.md',
        '.github/workflows/ci.yml',
        'scripts/release.ts',
      ];
      expect(left).toEqual(expect.arrayContaining(['tests/unit/git.test.ts', 'tests/source.test.ts', 'tests/temporary.ts']));
      for (const file of left) expect(paths.filter((path) => runsFor(path, file)), file).toEqual([]);
    });
  });
});
