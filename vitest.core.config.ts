import { defineConfig } from 'vitest/config';

import { lastRun, QuickestFirst } from './vitest.mutation.config.js';

/**
 * The unit suite: every test that reads no disk and spawns no process, which
 * is what the core mutation sweep holds the pure modules to. Under per-test
 * coverage an integration test that spawns git would run for every mutant it
 * reaches.
 *
 * A mutant's test files run in the full sweep's order, with its record of the
 * file that failed when the worker last ran it, both from
 * `vitest.mutation.config.ts`. The reason for the order is the full sweep's:
 * Stryker stops a mutant's run at its first failing test, so what a mutant
 * costs is the files that run before the one that kills it, and vitest's own
 * order, the longest first, suits a run that reports every failure. Vitest 5
 * also took that order's memory of the last failure: its cache keeps a
 * failure from a narrowed run until a run of the whole file passes, and on it
 * the core sweep, still in vitest's order, had a killed mutant run 15.47 tests
 * before its kill, where its sweeps on vitest 4 read 9.20 to 9.81 (ADR-0010,
 * amended 2026-11-09). A test holds this suite to both.
 */
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    sequence: { sequencer: QuickestFirst },
    // Named, so that vitest adds none of its own. A suite that names none
    // gets vitest's github-actions reporter beside the default one on a
    // runner, and it appends a summary of each run to the step's: one a
    // mutant, which came to 1,093k over this sweep's 6,279 runs on main's
    // push of bd6a87c. GitHub uploads 1MiB of a step's summary, and the job
    // ended on an error annotation that the upload was aborted. The default
    // reporter writes to the worker's output, as it did, which Stryker shows
    // only for a worker that exits unexpectedly. The other keeps the order's
    // record and writes nothing.
    reporters: ['default', lastRun],
  },
});
