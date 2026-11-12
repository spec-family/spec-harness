/**
 * The full mutation sweep, split across parallel CI jobs and put back together
 * as one report with one score.
 *
 * The full sweep mutates every module against the whole suite, git and the
 * sibling tools included, and one runner took 69 to 130 minutes for it
 * (ADR-0010). The amendment of 2026-10-01 to ADR-0010 has the measurements
 * behind the split, and the second of 2026-11-12 the ones behind the table
 * below, in nine shards. The core sweep, in ci.yml, is not split.
 *
 * Each shard runs Stryker with stryker.shard.config.mjs, which takes `mutate`
 * from mutateFor() and switches the break threshold off, because a shard is not
 * a score. The merge refuses anything that is not exactly one sweep: a missing
 * shard, a file mutated twice or by the wrong shard, a shard that ran with other
 * patterns, shards that ran different tests. It then scores the merged report
 * with the library Stryker's own gate uses, and compares it the way that gate
 * does.
 *
 * Adapted from spec-core (its ADR-0007), which took it from
 * @spec-family/spec-graph (its ADR-0019) and @spec-family/spec-guard (its
 * ADR-0003); the same merge scores all their sweeps. A pull request's sweep
 * runs incrementally, from the file main's last full sweep published, as
 * spec-guard's and spec-graph's do: cacheFor() gives each shard its part of
 * that file, and toolchainKey() names the Stryker and vitest it is good for
 * (ADR-0010, amended 2026-11-13).
 *
 *   node scripts/mutation-shards.mjs toolchain
 *   node scripts/mutation-shards.mjs cache <shard>
 *   node scripts/mutation-shards.mjs merge <directory holding the shard reports>
 */

import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Stryker's own dependencies, not direct ones of this package, and deliberately
// so: the merged score must be computed by the same code as the gate it
// replaces, and `mutate` read by the same matcher Stryker reads it with. A
// separately pinned copy of either could drift from the one Stryker runs.
import { minimatch } from 'minimatch';
import { calculateMutationTestMetrics } from 'mutation-testing-metrics';

// Minutes each file took in six full sweeps on 2026-11-12, the lowest and
// the highest, read off the shards' logs with scripts/mutation-timeline.mjs:
// three sources, each swept by main and by the pull request that shared the
// order's record between a sweep's workers. fd53349 (runs 43227686328 and
// 43235294813), bbaa54c (43241750900 and 43250316312) and 5888d9f
// (43259163147 and 43264919098):
//
//   round 22.5-28.5    siblings 21.8-26.3 git 20.4-25.9      cli 15.0-22.6
//   commands 13.4-21.1 fs 15.2-18.8       sandbox 14.1-15.6  workspace 9.9-14.0
//   configure 5.2-9.9  reader 6.1-8.4     usage 7.0-8.0      rulings 5.6-8.0
//   setup 4.3-7.3      server 4.8-7.2     probe 3.4-4.9      versions 3.0-3.8
//   host 1.7-2.7       premises 1.4-1.8   manifests 1.1-1.7  config 0.8-1.4
//   signers 0.7-1.1    context 0.7-1.0    hooks 0.6-1.0      audit 0.4-1.0
//   junit 0.5-0.9      formats 0.4-0.8    guard 0.5-0.7      briefs 0.4-0.7
//   branch 0.2-0.3     plugin 0.1-0.3     answers 0.0-0.2    literal 0.0-0.1
//
// 209 to 227 minutes a sweep, where the table before this one was made on
// 104 to 111 (ADR-0010, amended 2026-10-14): cli.ts took 2.4 to 4.5 minutes
// then and 15.0 to 22.6 now, and siblings.ts, git.ts, commands.ts and fs.ts
// twice and more what they took. The shard of cli.ts, workspace.ts and four
// smaller files took 34.6 to 50.9 minutes for its files and up to 56.6 as a
// job, against the job's 60. Between two sweeps of one source a large file
// took up to a third more in one than in the other, and a small one up to
// nine tenths more, with the runner.
//
// Stryker instruments only a shard's own files, but here that saves nothing:
// the suite spends its time in git and the sibling tools rather than in the
// harness's own code. A job takes about five minutes more than its files,
// its start and its initial run of the suite. More than half of the minutes,
// 57% and 58% in the six sweeps, are static mutants, each of which runs
// every test file until a test fails, and the whole suite when none does or
// one hangs. So a file's minutes follow the suite's seconds and the file's
// own static survivors and timeouts.
//
// A file's minutes did not simply add up where it went on vitest 4. Those of
// its mutants that are not static do: each runs the tests that cover it.
// Those of the static mutants beside it did not. A worker runs a static
// mutant's files the quickest first by what it last timed each at
// (vitest.mutation.config.ts), and vitest 4 kept for a file the time of its
// last run, whatever part of it ran (`updateResults` in its
// `dist/chunks/cli-api.*.js`, 4.1.11). So every test file a shard's sources
// were covered by stood among the quickest when the static mutants started.
// With setup.ts beside commands.ts, the 59 static mutants of commands.ts ran
// 13,848 tests before they were decided where they had run about 1,500, and
// the shard took 17.2 minutes for its files where adding them up gave 13.6
// (run 38456021914). The sweep of this table reads whether that holds on
// vitest 5.
//
// The timeline reads a file's minutes off the count of mutants tested, and
// the count runs on into the next file while one worker is still on a
// survivor, so a file is charged for the survivors of the file before it in
// its shard. A shard's own minutes are the measure.
//
// A file cannot be split, so no shard takes less time than round.ts, 22.5 to
// 28.5 minutes, or siblings.ts, git.ts, cli.ts or commands.ts, up to 26, and
// nine shards come level with them: eight listed, each built round one of
// those five or sandbox.ts, fs.ts or workspace.ts, and the last. Eight shards
// levelled take 31 to 34 minutes at the longest, the last about 30. round.ts
// keeps a shard to itself, as the integration suite grows round it. The last
// shard mutates everything else the base configuration mutates, so a file
// added later is still mutated without anyone remembering to list it here; it
// holds the small files, server.ts, configure.ts and setup.ts, and is kept no
// longer than the others, since that is where the sources grow unasked. A
// file listed here must have mutants: the merge refuses a listed file its
// shard did not report, and document.ts, which holds only types, has none, so
// it stays in the last shard. When a shard keeps passing the others by more
// than the sweeps differ, re-measure and move files or add a shard, and add
// it to the workflow's matrix, which a test checks. Beside each shard, the
// least and the most its files took in the six sweeps, by the minutes above.
export const ASSIGNED = [
  ['src/round.ts'], // 22.5 to 28.5
  ['src/siblings.ts', 'src/signers.ts'], // 22.8 to 27.3
  ['src/sandbox.ts', 'src/usage.ts', 'src/host.ts'], // 24.3 to 25.5
  ['src/git.ts', 'src/briefs.ts', 'src/hooks.ts', 'src/guard.ts'], // 22.0 to 28.2
  ['src/workspace.ts', 'src/reader.ts', 'src/probe.ts', 'src/branch.ts'], // 20.3 to 26.4
  ['src/commands.ts', 'src/premises.ts', 'src/manifests.ts', 'src/context.ts', 'src/junit.ts'], // 17.5 to 26.1
  ['src/cli.ts', 'src/versions.ts', 'src/config.ts'], // 18.8 to 27.7
  ['src/fs.ts', 'src/rulings.ts'], // 21.9 to 26.2
]; // and the rest: 18.2 to 26.1

export const SHARD_COUNT = ASSIGNED.length + 1;

export class ShardError extends Error {
  name = 'ShardError';
}

// Stryker's reading of `mutate`: patterns in order, a `!` pattern taking back
// what an earlier one matched.
export function mutates(patterns, file) {
  let included = false;
  for (const pattern of patterns) {
    if (pattern.startsWith('!')) {
      if (minimatch(file, pattern.slice(1))) included = false;
    } else if (minimatch(file, pattern)) {
      included = true;
    }
  }
  return included;
}

export function checkAssignment(base, assigned = ASSIGNED) {
  const owners = new Map();
  assigned.forEach((files, index) => {
    const shard = index + 1;
    for (const file of files) {
      if (owners.has(file)) {
        throw new ShardError(`${file} is assigned to shards ${owners.get(file)} and ${shard}.`);
      }
      if (!mutates(base, file)) {
        throw new ShardError(
          `${file} is assigned to shard ${shard}, but the configuration does not mutate it (${base.join(', ')}).`,
        );
      }
      owners.set(file, shard);
    }
  });
  return owners;
}

function shardNumber(value, count) {
  const text = String(value);
  const shard = /^\d+$/.test(text) ? Number(text) : Number.NaN;
  if (!(shard >= 1 && shard <= count)) {
    throw new ShardError(`A shard is a number from 1 to ${count}, got "${text}".`);
  }
  return shard;
}

// Stryker keeps the verdicts an incremental file holds for files a run does
// not mutate, so that a partial run does not forget them. A shard started from
// the whole sweep's file would report every other shard's files too, with
// verdicts from the last sweep rather than this one, and the merge would
// refuse it. Each shard starts from its own part: every test, and only the
// files it mutates (spec-guard's ADR-0003, amended 2026-10-01).
export function cacheFor(report, patterns) {
  return {
    ...report,
    files: Object.fromEntries(Object.entries(report.files).filter(([file]) => mutates(patterns, file))),
  };
}

export function mutateFor(base, shard, assigned = ASSIGNED) {
  const number = shardNumber(shard, assigned.length + 1);
  checkAssignment(base, assigned);
  return number <= assigned.length
    ? [...assigned[number - 1]]
    : [...base, ...assigned.flat().map((file) => `!${file}`)];
}

// To an incremental run a test is its file, its name and where it starts, and
// three packages decide those: Stryker's core matches the last sweep's tests
// to this run's, its vitest runner names each test and, since 10.1, says where
// it starts, and vitest gives the runner both. A test of the last sweep that
// the match misses is carried into the report as one that did not run this
// time, beside the test it was: spec-guard's sweep on Stryker 10.1.1, started
// from the file 10.0.0 wrote, held the suite twice (its ADR-0003, amended
// 2026-11-08). So the incremental file is keyed on these three versions, and
// a run of any others restores none and tests every mutant.
export const TOOLCHAIN = ['@stryker-mutator/core', '@stryker-mutator/vitest-runner', 'vitest'];

export function toolchainKey(versionOf) {
  return TOOLCHAIN.map((name) => {
    const version = versionOf(name);
    if (typeof version !== 'string' || !/^\d+\.\d+\.\d+\S*$/.test(version)) {
      throw new ShardError(`No version of ${name} to key the incremental file on, got ${JSON.stringify(version)}: run npm ci first.`);
    }
    return `${name.replace('@stryker-mutator/', '')}-${version}`;
  }).join('+');
}

const installedVersion = (name) => {
  try {
    return JSON.parse(readFileSync(path.join('node_modules', name, 'package.json'), 'utf8')).version;
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
};

// A test is its file and its name; ids are numbered afresh in every run.
const testKey = (file, name) => JSON.stringify([file, name]);

function testsOf(shard, report) {
  const tests = new Map();
  for (const [file, entry] of Object.entries(report.testFiles ?? {})) {
    for (const test of entry.tests) {
      const key = testKey(file, test.name);
      if (tests.has(key)) {
        throw new ShardError(
          `Shard ${shard} has two tests named "${test.name}" in ${file}, so its tests cannot be matched by name. A run started from an incremental file another Stryker or vitest wrote reports every test twice; see toolchainKey.`,
        );
      }
      tests.set(key, test);
    }
  }
  return tests;
}

const describeTest = (key) => {
  const [file, name] = JSON.parse(key);
  return `"${name}" in ${file}`;
};

const CARRIED =
  " A shard started from an incremental file that holds other shards' files reports their old verdicts as its own; see cacheFor.";

export function mergeReports(shards, { base, thresholds, assigned = ASSIGNED }) {
  const count = assigned.length + 1;
  const reports = new Map();
  for (const { shard, report } of shards) {
    if (!(Number.isInteger(shard) && shard >= 1 && shard <= count)) {
      throw new ShardError(`There are ${count} shards, but a report came from shard ${shard}.`);
    }
    if (reports.has(shard)) throw new ShardError(`Shard ${shard} reported twice.`);
    reports.set(shard, report);
  }
  const numbers = Array.from({ length: count }, (_, index) => index + 1);
  const missing = numbers.filter((shard) => !reports.has(shard));
  if (missing.length > 0) {
    throw new ShardError(
      `No report from shard ${missing.join(' or ')} of ${count}: the sweep is incomplete, and an incomplete sweep has no score.`,
    );
  }

  const owners = checkAssignment(base, assigned);
  const mutatedBy = new Map();
  for (const shard of numbers) {
    const report = reports.get(shard);
    const expected = mutateFor(base, shard, assigned);
    if (JSON.stringify(report.config?.mutate) !== JSON.stringify(expected)) {
      throw new ShardError(
        `Shard ${shard} ran with mutate ${JSON.stringify(report.config?.mutate)}, not ${JSON.stringify(expected)}.`,
      );
    }
    for (const file of Object.keys(report.files)) {
      if (mutatedBy.has(file)) {
        throw new ShardError(`${file} was mutated by shards ${mutatedBy.get(file)} and ${shard}.${CARRIED}`);
      }
      mutatedBy.set(file, shard);
      const owner = owners.get(file) ?? count;
      if (owner !== shard) throw new ShardError(`${file} belongs to shard ${owner}, but shard ${shard} reported it.${CARRIED}`);
    }
  }
  for (const [file, shard] of owners) {
    if (mutatedBy.get(file) !== shard) {
      throw new ShardError(
        `${file} is assigned to shard ${shard}, which reported no mutants in it. If it was renamed or removed, update ASSIGNED in scripts/mutation-shards.mjs.`,
      );
    }
  }

  // Stryker numbers tests afresh in every run, so an id means nothing outside
  // its own report. A test is its file and its name, and every shard must have
  // run the same ones, or the merge would be several sweeps rather than one.
  const reference = testsOf(1, reports.get(1));
  for (const shard of numbers.slice(1)) {
    const tests = testsOf(shard, reports.get(shard));
    const onlyFirst = [...reference.keys()].filter((key) => !tests.has(key));
    const onlyThis = [...tests.keys()].filter((key) => !reference.has(key));
    if (onlyFirst.length > 0 || onlyThis.length > 0) {
      throw new ShardError(
        `Shards 1 and ${shard} ran different tests: ${onlyFirst.length} only in shard 1, ${onlyThis.length} only in shard ${shard}, such as ${describeTest(onlyFirst[0] ?? onlyThis[0])}.`,
      );
    }
  }

  const ids = new Map();
  const testFiles = {};
  for (const [file, entry] of Object.entries(reports.get(1).testFiles ?? {})) {
    testFiles[file] = {
      ...entry,
      tests: entry.tests.map((test) => {
        const id = String(ids.size);
        ids.set(testKey(file, test.name), id);
        return { ...test, id };
      }),
    };
  }

  const files = {};
  let nextMutant = 0;
  for (const shard of numbers) {
    const report = reports.get(shard);
    const local = new Map();
    for (const [file, entry] of Object.entries(report.testFiles ?? {})) {
      for (const test of entry.tests) local.set(test.id, ids.get(testKey(file, test.name)));
    }
    const remap = (list) =>
      list.map((id) => {
        const unified = local.get(id);
        if (unified === undefined) throw new ShardError(`Shard ${shard} names test ${id}, which its report does not define.`);
        return unified;
      });
    for (const [name, file] of Object.entries(report.files)) {
      files[name] = {
        ...file,
        mutants: file.mutants.map((mutant) => ({
          ...mutant,
          id: String(nextMutant++),
          ...(mutant.coveredBy && { coveredBy: remap(mutant.coveredBy) }),
          ...(mutant.killedBy && { killedBy: remap(mutant.killedBy) }),
        })),
      };
    }
  }

  const first = reports.get(1);
  return {
    ...first,
    files: Object.fromEntries(Object.keys(files).sort().map((name) => [name, files[name]])),
    testFiles,
    thresholds,
    config: { ...first.config, mutate: base, thresholds },
  };
}

// The comparison MutationTestReportHelper.determineExitCode makes, on the
// unrounded score.
export function gate(report, thresholds) {
  const { metrics } = calculateMutationTestMetrics(report).systemUnderTestMetrics;
  const score = metrics.mutationScore;
  const formatted = score.toFixed(2);
  if (typeof thresholds.break !== 'number') {
    return { metrics, passed: true, message: `Final mutation score ${formatted}, with no break threshold configured.` };
  }
  return score < thresholds.break
    ? { metrics, passed: false, message: `Final mutation score ${formatted} under breaking threshold ${thresholds.break}.` }
    : { metrics, passed: true, message: `Final mutation score of ${formatted} is greater than or equal to break threshold ${thresholds.break}.` };
}

const COLUMNS = [
  ['% score', (m) => (Number.isNaN(m.mutationScore) ? 'n/a' : m.mutationScore.toFixed(2))],
  ['% covered', (m) => (Number.isNaN(m.mutationScoreBasedOnCoveredCode) ? 'n/a' : m.mutationScoreBasedOnCoveredCode.toFixed(2))],
  ['killed', (m) => String(m.killed)],
  ['timeout', (m) => String(m.timeout)],
  ['survived', (m) => String(m.survived)],
  ['no cov', (m) => String(m.noCoverage)],
  ['errors', (m) => String(m.runtimeErrors + m.compileErrors)],
];

// Full paths, sorted, because that is how the shards are assigned; the metrics
// tree drops the directory every file shares.
export function formatTable(report) {
  const metricsOf = (files) => calculateMutationTestMetrics({ ...report, files }).systemUnderTestMetrics.metrics;
  const rows = [
    ['All files', metricsOf(report.files)],
    ...Object.keys(report.files)
      .sort()
      .map((name) => [name, metricsOf({ [name]: report.files[name] })]),
  ];
  const cells = rows.map(([name, metrics]) => [name, ...COLUMNS.map(([, read]) => read(metrics))]);
  const header = ['File', ...COLUMNS.map(([title]) => title)];
  const widths = header.map((title, column) => Math.max(title.length, ...cells.map((row) => row[column].length)));
  const line = (row) => row.map((cell, column) => (column === 0 ? cell.padEnd(widths[0]) : cell.padStart(widths[column]))).join(' | ');
  return [line(header), widths.map((width) => '-'.repeat(width)).join('-|-'), ...cells.map(line)].join('\n');
}

// The page Stryker's HTML reporter writes, less its logo. The report is a
// script expression, so every `<` is split out of its string as Stryker does,
// and no source text can close the <script> tag.
export function reportHtml(report, elementsScript) {
  const json = JSON.stringify(report).replace(/</g, '<"+"');
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<script>
${elementsScript}
</script>
</head>
<body>
<mutation-test-report-app titlePostfix="Stryker"></mutation-test-report-app>
<script>
const app = document.querySelector('mutation-test-report-app');
app.report = ${json};
function updateTheme() {
  document.body.style.backgroundColor = app.themeBackgroundColor;
}
app.addEventListener('theme-changed', updateTheme);
updateTheme();
</script>
</body>
</html>
`;
}

const minutes = (seconds) => `${Math.floor(seconds / 60)}m${String(Math.round(seconds % 60)).padStart(2, '0')}s`;

async function main(argv) {
  const [command, argument] = argv;
  if (command === 'toolchain' && argument === undefined) {
    try {
      console.log(toolchainKey(installedVersion));
      return 0;
    } catch (error) {
      if (!(error instanceof ShardError)) throw error;
      console.error(`${process.env.GITHUB_ACTIONS === 'true' ? '::error::' : ''}${error.message}`);
      return 1;
    }
  }
  if (!['cache', 'merge'].includes(command) || argument === undefined) {
    console.error('usage: node scripts/mutation-shards.mjs toolchain | cache <shard> | merge <directory holding the shard reports>');
    return 2;
  }
  const { default: config } = await import(pathToFileURL(path.resolve('stryker.config.mjs')).href);
  const incrementalFile = config.incrementalFile ?? 'reports/stryker-incremental.json';

  if (command === 'cache') {
    const patterns = mutateFor(config.mutate, argument);
    let report;
    try {
      report = JSON.parse(readFileSync(incrementalFile, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      console.log(`No incremental file at ${incrementalFile}: shard ${argument} tests every mutant.`);
      return 0;
    }
    const kept = cacheFor(report, patterns);
    writeFileSync(incrementalFile, JSON.stringify(kept));
    console.log(`Shard ${argument} starts from ${Object.keys(kept.files).length} of the ${Object.keys(report.files).length} files in ${incrementalFile}.`);
    return 0;
  }

  const directory = argument;

  const shards = [];
  const seconds = new Map();
  for (const entry of readdirSync(directory, { recursive: true })) {
    const file = path.join(directory, String(entry));
    const name = path.basename(file);
    const report = /^shard-(\d+)\.json$/.exec(name);
    const timing = /^shard-(\d+)\.timing\.json$/.exec(name);
    if (report) shards.push({ shard: Number(report[1]), report: JSON.parse(readFileSync(file, 'utf8')) });
    if (timing) seconds.set(Number(timing[1]), JSON.parse(readFileSync(file, 'utf8')).seconds);
  }

  let merged;
  try {
    merged = mergeReports(shards, { base: config.mutate, thresholds: config.thresholds });
  } catch (error) {
    if (!(error instanceof ShardError)) throw error;
    console.error(`${process.env.GITHUB_ACTIONS === 'true' ? '::error::' : ''}${error.message}`);
    return 1;
  }

  const lines = shards
    .sort((a, b) => a.shard - b.shard)
    .map(({ shard, report }) => {
      const mutants = Object.values(report.files).reduce((sum, file) => sum + file.mutants.length, 0);
      const took = seconds.has(shard) ? `, ${minutes(seconds.get(shard))}` : '';
      return `shard ${shard}: ${Object.keys(report.files).length} files, ${mutants} mutants${took}`;
    });
  const verdict = gate(merged, config.thresholds);
  console.log(`${lines.join('\n')}\n\n${formatTable(merged)}\n\n${verdict.message}`);

  const elements = readFileSync(fileURLToPath(import.meta.resolve('mutation-testing-elements/dist/mutation-test-elements.js')), 'utf8');
  const outputs = [
    [config.jsonReporter?.fileName ?? 'reports/mutation/mutation.json', JSON.stringify(merged)],
    [config.htmlReporter?.fileName ?? 'reports/mutation/index.html', reportHtml(merged, elements)],
    // What a pull request's shards start from, where main's full sweep
    // publishes it: the merged report is the whole sweep's file.
    [incrementalFile, JSON.stringify(merged)],
  ];
  for (const [file, content] of outputs) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Mutation score: ${verdict.metrics.mutationScore.toFixed(2)}%\n\n${verdict.message}\n\n${lines.map((line) => `- ${line}`).join('\n')}\n\n`,
    );
  }
  return verdict.passed ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
