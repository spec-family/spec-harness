import { statSync } from 'node:fs';

import { defineConfig } from 'vitest/config';
import { BaseSequencer, type Reporter, type TestModule, type TestSpecification } from 'vitest/node';

/**
 * Whether each test file failed when this process last ran it, as vitest 4's
 * cache had it and vitest 5's does not.
 *
 * Stryker narrows each mutant's run to the tests that cover it, by a test name
 * pattern, and stops a run at its first failure. Vitest 5 counts either run as
 * partial, and from a partial run its cache takes a failure and keeps it until
 * a run of the whole file passes; it also reads back what the other workers
 * write to the same cache file. So in a sweep a file that killed one mutant,
 * in any worker, stayed failed for every mutant after it, and the order lost
 * the file that killed the last mutant (spec-core's ADR-0008, amended
 * 2026-11-08). So the order keeps its own record, by vitest 4's rule: a file
 * that passed or failed in a run has that verdict until a run runs it again,
 * and a file the run skipped or did not reach keeps the one it had. Vitest
 * calls the sequencer and the reporters in the one process that drives the
 * worker, so the record lives in that process's memory, with no file to name
 * or clean up, and dies with it.
 *
 * The times stay the cache's, on vitest 5 the dry run's, of each whole file,
 * where vitest 4 took each run's, narrowed or stopped. A record of each run's
 * time as well, swept in spec-core, read no better (its ADR-0007,
 * 2026-11-09).
 */
const failedLast = new Map<string, boolean>();

/** The reporter that keeps the record above, named in the suite below. */
export const lastRun = {
  // No `onInit`: vitest 5 calls it at the start of every run, which would
  // empty the record before each sort (spec-core's ADR-0007, 2026-11-09).
  onTestModuleEnd(module: TestModule): void {
    const state = module.state();
    if (state === 'passed' || state === 'failed') failedLast.set(module.moduleId, state === 'failed');
  },
} satisfies Reporter;

/**
 * The order a mutant's test files run in: a file that failed when this process
 * last ran it first, as vitest 4 had it, then the quickest first, where
 * vitest runs the longest first.
 *
 * Stryker runs a mutant's files one after another in one worker and stops at
 * the first test that fails. A static mutant runs every file, so what it
 * costs is the files that run before the one that kills it. Vitest's order
 * suits a run that reports every failure and wants the long files started
 * early; here it puts `tests/integration/sandbox.test.ts`, over 40 seconds,
 * most of them spent waiting out bounds, ahead of the unit file that kills
 * the mutant in milliseconds. In the four full sweeps before this order one
 * static mutant in seven was killed only after other files had run, 280
 * tests of them on average (ADR-0010, amended 2026-10-09).
 *
 * No test leaves the run and none is added: a mutant survives when every
 * file has passed, in any order. The first sweep in this order read the
 * score of the one before it, 97.47% over 8,024 mutants with the same 172
 * survivors, and its files took 95 minutes where they had taken 183.
 *
 * A file the worker has not run yet has no time to go by. It runs after
 * those that have, the smaller first, and has a time from then on. Vitest 5
 * asks its cache by a file's specification and keeps no sizes, reading them
 * from the disk where a file has no time; so does this.
 */
export class QuickestFirst extends BaseSequencer {
  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const { cache } = this.ctx;
    const rank = (file: TestSpecification): [number, number] => {
      // What vitest's own sequencer asks its cache; a test holds the two
      // together. Its `failed` is not read: that is the record's.
      const last = cache.getTestSpecificationResult(file);
      if (last === undefined) return [2, statSync(file.moduleId, { throwIfNoEntry: false })?.size ?? 0];
      return [failedLast.get(file.moduleId) === true ? 0 : 1, last.duration];
    };
    const ranked = files.map((file) => ({ file, rank: rank(file) }));
    return ranked.sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1]).map(({ file }) => file);
  }
}

/**
 * The full mutation sweep's suite: every test but four files, run in
 * Stryker's sandbox, a copy of the repository under `.stryker-tmp/`.
 *
 * `tests/source.test.ts` reads the repository as it is on disk, which the
 * sandbox is not: its sources are Stryker's instrumented copies, whose lines
 * are not the ones the core sweep's ranges name, and git lists no file under
 * a directory `.gitignore` leaves out. A test that fails in the initial run
 * stops the sweep before its first mutant. CI runs the file on every change,
 * and what it asks of the code, the unit suite asks as well.
 *
 * `tests/mutation-shards.test.ts` tests the script that splits the sweep and
 * merges it back, and the order above. It reaches nothing under `src/`, so it
 * cannot kill a mutant, and every static mutant would run it.
 *
 * `tests/mutation-unmeasured.test.ts` tests the script that counts what the
 * sweep does not mutate, and holds the sources on disk to its count. It is
 * left out for both reasons: the sandbox's sources are not the ones it
 * counts, and no mutant is under it.
 *
 * `tests/mutation-compare.test.ts` tests the script that names the
 * undetected mutants a sweep has and main's did not. No mutant is under it
 * either.
 *
 * The rest is `vitest.config.ts`'s, for the same processes, less its v8
 * coverage, which Stryker replaces with its own per test, with the order
 * above and with its reporters named; a test holds the two files together.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/source.test.ts', 'tests/mutation-shards.test.ts', 'tests/mutation-unmeasured.test.ts', 'tests/mutation-compare.test.ts', '**/node_modules/**'],
    environment: 'node',
    testTimeout: 300_000,
    hookTimeout: 300_000,
    sequence: { sequencer: QuickestFirst },
    // Named, for the reason `vitest.core.config.ts` gives. Each shard is a
    // step of its own, and none came to GitHub's 1MiB, but each added a
    // summary a mutant all the same. The other keeps the order's record and
    // writes nothing.
    reporters: ['default', lastRun],
  },
});
