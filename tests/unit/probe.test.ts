import { describe, expect, it } from 'vitest';

import type { JUnitRead } from '../../src/junit.js';
import {
  classify,
  endOfOutput,
  probeEnvironment,
  readProbes,
  renderEvidence,
  renderUnexplained,
  verdictOf,
  type Classified,
  type CodeBlock,
  type ProbeResult,
  type ProbeSpec,
} from '../../src/probe.js';

function probe(content: string, line = 10): CodeBlock {
  return { info: 'probe', content, line };
}

function file(path: string, content: string, line = 20): CodeBlock {
  return { info: `probe-file ${path}`, content, line };
}

function problems(...blocks: CodeBlock[]): string[] {
  return readProbes(blocks).problems.map((p) => p.message);
}

const KEYS = 'id, run, setup, signature, junit, test, runs, timeout';

describe('reading probes', () => {
  it('reads every key of a probe, and its files', () => {
    const set = readProbes([
      probe('id: old-token\nsetup: npm ci\nrun: npm test -- tests/probes/rotate.test.ts\nsignature: expected 401, got 200\njunit: reports/junit.xml\ntest: rotation\nruns: 3\ntimeout: 60', 4),
      file('tests/probes/rotate.test.ts', 'test("x", () => {});', 12),
    ]);
    expect(set.problems).toEqual([]);
    expect(set.probes).toEqual([
      {
        id: 'old-token',
        run: 'npm test -- tests/probes/rotate.test.ts',
        setup: 'npm ci',
        signature: 'expected 401, got 200',
        junit: 'reports/junit.xml',
        test: 'rotation',
        runs: 3,
        timeout: 60,
        line: 4,
      },
    ]);
    expect(set.files).toEqual([{ path: 'tests/probes/rotate.test.ts', content: 'test("x", () => {});', line: 12 }]);
  });

  it('leaves what a probe does not say as null', () => {
    expect(readProbes([probe('id: a\nrun: make probe\nsignature: boom')]).probes[0]).toEqual({
      id: 'a',
      run: 'make probe',
      setup: null,
      signature: 'boom',
      junit: null,
      test: null,
      runs: null,
      timeout: null,
      line: 10,
    });
  });

  it('reads quoted values, comments and blank lines the way a person writes them', () => {
    const set = readProbes([
      probe(
        [
          '# the defect in the brief',
          '',
          '  id:   "quoted-id"  ',
          "run: 'npm test' # the whole suite",
          'signature: expected: 401',
          '   # indented comment',
        ].join('\n'),
      ),
    ]);
    expect(set.problems).toEqual([]);
    expect(set.probes[0]).toMatchObject({ id: 'quoted-id', run: 'npm test', signature: 'expected: 401' });
  });

  it('keeps a # that is not a comment: inside quotes, or not after a space', () => {
    // A run line or a signature can hold a "#"; cutting it would change the
    // command, or the reason the probe fails for.
    const set = readProbes([probe('id: a\nrun: npm test -- -t "issue #12" # the probe\nsignature: "expected #1"\nsetup: echo a#b')]);
    expect(set.probes[0]).toMatchObject({ run: 'npm test -- -t "issue #12"', signature: 'expected #1', setup: 'echo a#b' });
  });

  it('reads an apostrophe as a letter, not a quote that hides a comment', () => {
    const set = readProbes([probe("id: a\nrun: grep it's x # search\nsignature: it's broken # why")]);
    expect(set.probes[0]).toMatchObject({ run: "grep it's x", signature: "it's broken" });
  });

  it('takes quotes off only a value that opens and closes with the same one', () => {
    const set = readProbes([probe(`id: abca\nrun: "\nsignature: "unterminated\nsetup: ""\njunit: 'r.xml'\ntest: "t'`)]);
    expect(set.probes[0]).toMatchObject({ id: 'abca', run: '"', signature: '"unterminated', setup: null, junit: 'r.xml', test: `"t'` });
  });

  it('reads a key written with space before its colon, and refuses a key with no colon', () => {
    expect(readProbes([probe('id : a\nrun :x\nsignature: y')]).probes[0]).toMatchObject({ id: 'a', run: 'x' });
    // "runs" without a colon is not "run" with a value of "runs".
    expect(problems(probe('id: a\nrun: x\nsignature: y\nruns'))).toEqual([`a probe says "runs"; its keys are ${KEYS}`]);
  });

  it('keeps a # at the end of a value, and one inside single quotes', () => {
    expect(readProbes([probe("id: a\nrun: x\nsignature: expected#")]).probes[0]?.signature).toBe('expected#');
    expect(readProbes([probe("id: a\nrun: x\nsignature: 'expected #1' # why")]).probes[0]?.signature).toBe('expected #1');
  });

  it('reads two probes with different ids as two', () => {
    const set = readProbes([probe('id: a\nrun: x\nsignature: y'), probe('id: b\nrun: x\nsignature: y')]);
    expect(set.probes.map((p) => p.id)).toEqual(['a', 'b']);
    expect(set.problems).toEqual([]);
  });

  it('reads CRLF blocks', () => {
    expect(readProbes([probe('id: a\r\nrun: x\r\nsignature: y\r\n')]).probes[0]).toMatchObject({ id: 'a', run: 'x', signature: 'y' });
  });

  it('ignores fenced blocks that are not probes', () => {
    const set = readProbes([
      { info: 'ts', content: 'id: x', line: 1 },
      { info: 'probes', content: 'id: x', line: 2 },
      { info: 'probe-files a.ts', content: 'x', line: 3 },
      { info: '', content: 'probe', line: 4 },
    ]);
    expect(set).toMatchObject({ probes: [], files: [], problems: [] });
  });

  it('reads a probe whose info string says more after the word', () => {
    expect(readProbes([{ info: '  probe  the-old-token ', content: 'id: a\nrun: x\nsignature: y', line: 1 }]).probes).toHaveLength(1);
  });

  it('refuses a line that is not one of its keys, and the probe with it', () => {
    expect(problems(probe('id: a\nrun: x\nsignature: y\ncommand: z'))).toEqual([`a probe says "command: z"; its keys are ${KEYS}`]);
    expect(problems(probe('id: a\nrun: x\nsignature: y\nno colon here'))).toEqual([`a probe says "no colon here"; its keys are ${KEYS}`]);
    expect(problems(probe('id: a\nrun: x\nsignature: y\n: z'))).toEqual([`a probe says ": z"; its keys are ${KEYS}`]);
    expect(readProbes([probe('id: a\nrun: x\nsignature: y\nextra: 1')]).probes).toEqual([]);
  });

  it('refuses a probe with no id or no run', () => {
    expect(problems(probe('run: x\nsignature: y'))).toEqual(['a probe needs an id and a run command']);
    expect(problems(probe('id: a\nsignature: y'))).toEqual(['a probe needs an id and a run command']);
    expect(problems(probe('id: ""\nrun: x\nsignature: y'))).toEqual(['a probe needs an id and a run command']);
  });

  it('refuses a probe that does not say how it fails', () => {
    // A red that may be a compile error proves nothing.
    expect(problems(probe('id: a\nrun: x'))).toEqual([
      'probe a does not say how it fails; give a signature, or a JUnit test name, so that a failure to compile is not taken for the defect',
    ]);
    expect(problems(probe('id: a\nrun: x\nsignature:\njunit: r.xml'))).toHaveLength(1);
  });

  it('accepts a JUnit test name instead of a signature, and refuses one with no report to find it in', () => {
    expect(readProbes([probe('id: a\nrun: x\ntest: rotation\njunit: r.xml')]).probes[0]).toMatchObject({ signature: null, test: 'rotation', junit: 'r.xml' });
    expect(problems(probe('id: a\nrun: x\ntest: rotation'))).toEqual(['probe a names a test but no junit report to find it in']);
  });

  it('refuses runs and a timeout that are not whole numbers of at least 1', () => {
    for (const value of ['0', '-1', '1.5', 'two', '']) {
      expect(problems(probe(`id: a\nrun: x\nsignature: y\nruns: ${value}`))).toEqual(['probe a: "runs" must be a whole number of at least 1']);
      expect(problems(probe(`id: a\nrun: x\nsignature: y\ntimeout: ${value}`))).toEqual(['probe a: "timeout" must be a whole number of at least 1']);
    }
    expect(readProbes([probe('id: a\nrun: x\nsignature: y\nruns: 1\ntimeout: 1')]).probes[0]).toMatchObject({ runs: 1, timeout: 1 });
  });

  it('refuses a second probe with an id already taken, keeping the first', () => {
    const set = readProbes([probe('id: a\nrun: first\nsignature: y', 1), probe('id: a\nrun: second\nsignature: y', 9)]);
    expect(set.probes.map((p) => p.run)).toEqual(['first']);
    expect(set.problems).toEqual([{ line: 9, message: 'probe a is declared twice' }]);
  });

  it('refuses a probe file outside the repository, on either separator', () => {
    for (const path of ['', '/etc/passwd', '../x.ts', 'tests/../../x.ts', 'C:/x.ts', 'c:x.ts', '..\\..\\evil.ts', 'tests\\..\\..\\x', '\\\\server\\x']) {
      const set = readProbes([file(path, 'x')]);
      expect(set.files, path).toEqual([]);
      expect(set.problems, path).toEqual([{ line: 20, message: `a probe-file names "${path}"; it must be a path inside the repository` }]);
    }
  });

  it('accepts a probe file anywhere inside the repository, a name with dots included', () => {
    for (const path of ['a.ts', 'tests/probes/x.test.ts', '..hidden/x', 'x..y/z', 'tests/probe dir/a b.ts', 'dir/a:b.txt']) {
      expect(readProbes([file(path, 'x')]).files.map((f) => f.path), path).toEqual([path]);
    }
    // Words of the info string are joined by one space, however many separated them.
    expect(readProbes([{ info: 'probe-file   tests/a  b.ts ', content: 'x', line: 1 }]).files.map((f) => f.path)).toEqual(['tests/a b.ts']);
  });
});

describe('the hash of what was measured', () => {
  // Computed in each test, never while the file is collected: a mutant that
  // throws there fails the collection, which a mutation run reads as no
  // test failing.
  const blocks = (): CodeBlock[] => [probe('id: a\nrun: x\nsignature: y'), file('t/a.ts', 'one')];

  it('is a SHA-256 that the same probes always give', () => {
    const hash = readProbes(blocks()).hash;
    expect(hash).toMatch(/^sha256-[0-9a-f]{64}$/);
    // The digest of the two blocks as the brief records them, so a change to what is hashed shows.
    expect(hash).toBe('sha256-194db5d327b8b3639e20d3104dde34253fd3fa63e7a48f2adc9d874697a63547');
    expect(readProbes(blocks()).hash).toBe(hash);
    expect(readProbes([...blocks(), { info: 'ts', content: 'other code', line: 1 }]).hash).toBe(hash);
  });

  it('changes when a probe, a probe file, its path or their order changes', () => {
    const hashes = [
      readProbes(blocks()).hash,
      readProbes([probe('id: a\nrun: x2\nsignature: y'), file('t/a.ts', 'one')]).hash,
      readProbes([probe('id: a\nrun: x\nsignature: y'), file('t/a.ts', 'two')]).hash,
      readProbes([probe('id: a\nrun: x\nsignature: y'), file('t/b.ts', 'one')]).hash,
      readProbes([file('t/a.ts', 'one'), probe('id: a\nrun: x\nsignature: y')]).hash,
      readProbes([probe('id: a\nrun: x\nsignature: y')]).hash,
      readProbes([]).hash,
    ];
    expect(new Set(hashes).size).toBe(hashes.length);
  });
});

const SPEC: ProbeSpec = { id: 'p', run: 'x', setup: null, signature: 'expected 401', junit: null, test: null, runs: null, timeout: 30, line: 1 };
const JUNIT: ProbeSpec = { ...SPEC, junit: 'r.xml', test: 'rotation', signature: null };

function report(...cases: [string, 'passed' | 'failed' | 'errored' | 'skipped', string][]): JUnitRead {
  return { ok: true, cases: cases.map(([name, outcome, message]) => ({ name, classname: 'suite', outcome, message })) };
}

describe('one run, against what the probe declares', () => {
  it('is red when the output shows the signature, naming the line that shows it', () => {
    expect(classify(SPEC, { exitCode: 1, output: 'setup\n  AssertionError: expected 401, got 200  \nmore', junit: null })).toEqual({
      outcome: 'red',
      detail: 'AssertionError: expected 401, got 200',
    });
  });

  it('keeps no more than 200 characters of the line', () => {
    const detail = classify(SPEC, { exitCode: 1, output: `expected 401${'x'.repeat(300)}`, junit: null }).detail;
    expect(detail).toHaveLength(200);
  });

  it('is a wrong failure when the output does not show the signature', () => {
    // A red for another reason - a compile error, a missing module - proves nothing.
    expect(classify(SPEC, { exitCode: 2, output: 'SyntaxError', junit: null })).toEqual({
      outcome: 'wrong-failure',
      detail: 'the command exited 2 and its output does not contain "expected 401"',
      output: 'SyntaxError',
    });
  });

  it('is green when the command passes, whatever it printed', () => {
    expect(classify(SPEC, { exitCode: 0, output: 'expected 401', junit: null })).toEqual({ outcome: 'green', detail: 'the command passed' });
  });

  it('is a timeout when the command was stopped', () => {
    expect(classify(SPEC, { exitCode: null, output: 'expected 401', junit: null })).toEqual({ outcome: 'timeout', detail: 'stopped after 30 seconds', output: 'expected 401' });
    expect(classify({ ...SPEC, timeout: null }, { exitCode: null, output: '', junit: null }).detail).toBe('stopped after the configured seconds');
    // One second is said as a sentence says it.
    expect(classify({ ...SPEC, timeout: 1 }, { exitCode: null, output: '', junit: null }).detail).toBe('stopped after 1 second');
  });

  it('is red when the report shows the declared test failing', () => {
    const run = { exitCode: 1, output: '', junit: report(['issues a token', 'passed', ''], ['rotation rejects the old token', 'failed', 'got 200']) };
    expect(classify(JUNIT, run)).toEqual({ outcome: 'red', detail: 'rotation rejects the old token failed' });
  });

  it('counts an errored test as failing, and finds the test by its class name too', () => {
    const run = { exitCode: 1, output: '', junit: { ok: true as const, cases: [{ name: 'rejects', classname: 'rotation', outcome: 'errored' as const, message: '' }] } };
    expect(classify(JUNIT, run).outcome).toBe('red');
  });

  it('with a signature too, is red only when the failing test says it', () => {
    const both = { ...JUNIT, signature: 'expected 401' };
    const saying = report(['rotation a', 'failed', 'Error\nexpected 401, got 200\nstack']);
    expect(classify(both, { exitCode: 1, output: '', junit: saying })).toEqual({ outcome: 'red', detail: 'rotation a failed: expected 401, got 200' });
    const naming = report(['rotation expected 401', 'failed', 'other']);
    expect(classify(both, { exitCode: 1, output: '', junit: naming }).outcome).toBe('red');
    const silent = report(['rotation a', 'failed', 'TypeError: x is undefined']);
    expect(classify(both, { exitCode: 1, output: 'expected 401', junit: silent })).toEqual({
      outcome: 'wrong-failure',
      detail: 'rotation a failed, which is not what the probe declares',
      output: 'expected 401',
    });
  });

  it('reads a signature-only probe with a report by the failing tests\' messages', () => {
    const signatureOnly = { ...SPEC, junit: 'r.xml' };
    expect(classify(signatureOnly, { exitCode: 1, output: '', junit: report(['any', 'failed', 'expected 401']) }).outcome).toBe('red');
  });

  it('is a wrong failure when another test fails, or the command fails with none failing', () => {
    expect(classify(JUNIT, { exitCode: 1, output: '', junit: report(['login', 'failed', 'x'], ['rotation', 'skipped', '']) })).toEqual({
      outcome: 'wrong-failure',
      detail: 'login failed, which is not what the probe declares',
      output: '',
    });
    expect(classify(JUNIT, { exitCode: 3, output: '', junit: report(['rotation', 'passed', '']) })).toEqual({
      outcome: 'wrong-failure',
      detail: 'the command exited 3 with no failing test',
      output: '',
    });
  });

  it('is a wrong failure when another test fails, even if the command passed', () => {
    expect(classify(JUNIT, { exitCode: 0, output: '', junit: report(['login', 'failed', 'x']) })).toEqual({
      outcome: 'wrong-failure',
      detail: 'login failed, which is not what the probe declares',
      output: '',
    });
  });

  it('is green when the report shows no failure and the command passed', () => {
    expect(classify(JUNIT, { exitCode: 0, output: '', junit: report(['rotation', 'passed', ''], ['other', 'skipped', '']) })).toEqual({
      outcome: 'green',
      detail: 'every test passed',
    });
  });

  it('proves nothing without a readable report', () => {
    expect(classify(JUNIT, { exitCode: 0, output: '', junit: null })).toEqual({ outcome: 'no-report', detail: 'the command passed and wrote no r.xml', output: '' });
    expect(classify(JUNIT, { exitCode: 1, output: '', junit: null })).toEqual({ outcome: 'wrong-failure', detail: 'the command failed before writing r.xml', output: '' });
    expect(classify(JUNIT, { exitCode: 1, output: '', junit: { ok: false, error: 'a tag is never closed' } })).toEqual({
      outcome: 'no-report',
      detail: 'r.xml cannot be read: a tag is never closed',
      output: '',
    });
  });

  it('carries the end of what the command printed when it proves nothing, where the reason is', () => {
    // A red for another reason: the reason is the command's to give.
    const npm = 'npm error npx canceled due to missing packages and no YES option: ["vitest@5.0.3"]\n';
    expect(classify(SPEC, { exitCode: 1, output: npm, junit: null }).output).toBe('npm error npx canceled due to missing packages and no YES option: ["vitest@5.0.3"]');
    // Stopped, with a question nobody was there to answer.
    expect(classify(SPEC, { exitCode: null, output: 'Ok to proceed? (y) ', junit: null }).output).toBe('Ok to proceed? (y)');
    expect(classify(JUNIT, { exitCode: 0, output: 'no reporter named junit\n', junit: null }).output).toBe('no reporter named junit');
    // Shown as a person is shown it: the end, and nothing for a terminal to obey.
    expect(classify(SPEC, { exitCode: 1, output: `${'a'.repeat(3000)}\u001b[2Kz`, junit: null }).output).toBe(`${'a'.repeat(1990)}\\u001b[2Kz`);
  });

  it('carries no output when the run is red or green: the evidence is the line that matched, or the pass', () => {
    expect(classify(SPEC, { exitCode: 1, output: 'noise\nexpected 401, got 200\nnoise', junit: null })).toEqual({ outcome: 'red', detail: 'expected 401, got 200' });
    expect(classify(SPEC, { exitCode: 0, output: 'noise', junit: null })).toEqual({ outcome: 'green', detail: 'the command passed' });
    expect(Object.keys(classify(JUNIT, { exitCode: 1, output: 'noise', junit: report(['rotation', 'failed', 'x']) }))).toEqual(['outcome', 'detail']);
    expect(Object.keys(classify(JUNIT, { exitCode: 0, output: 'noise', junit: report(['rotation', 'passed', '']) }))).toEqual(['outcome', 'detail']);
  });
});

describe('the end of what a command printed, as a person is shown it', () => {
  it('is all of it when it is short, with the space at its end dropped and the space at its start kept', () => {
    expect(endOfOutput('')).toBe('');
    expect(endOfOutput('one\n  two\n')).toBe('one\n  two');
    // The first line's indentation is part of what was printed.
    expect(endOfOutput('  at probe.js:3\n\n \n')).toBe('  at probe.js:3');
    expect(endOfOutput(' \n\n')).toBe('');
  });

  it('begins at the first line that is not blank, as `npm run` opens with one, and keeps the blank lines inside it', () => {
    expect(endOfOutput('\n> project@1.0.0 test\n> vitest run x\n\nsh: 1: vitest: not found\n')).toBe('> project@1.0.0 test\n> vitest run x\n\nsh: 1: vitest: not found');
    expect(endOfOutput('\n\n\none\n\ntwo')).toBe('one\n\ntwo');
  });

  it('is its last 2,000 characters, counted once the space at its end is dropped', () => {
    expect(endOfOutput('a'.repeat(2000))).toBe('a'.repeat(2000));
    expect(endOfOutput(`a${'b'.repeat(2000)}`)).toBe('b'.repeat(2000));
    // Blank lines at the end do not take the place of the reason above them.
    expect(endOfOutput(`${'a'.repeat(1000)}${'b'.repeat(2000)}\n\n\n`)).toBe('b'.repeat(2000));
    // Where the 2,000 begin on blank lines, what is shown begins after them.
    expect(endOfOutput(`${'a'.repeat(1000)}\n\n${'b'.repeat(1998)}`)).toBe('b'.repeat(1998));
  });

  it('ends a line at a carriage return, alone or in front of a line feed', () => {
    expect(endOfOutput('one\r\ntwo\r\n')).toBe('one\ntwo');
    // Alone, it would have a terminal write the next line over the last.
    expect(endOfOutput('10%\r20%\rdone')).toBe('10%\n20%\ndone');
    expect(endOfOutput('one\r\r\ntwo')).toBe('one\n\ntwo');
  });

  it('drops a colour, which says nothing in a report', () => {
    expect(endOfOutput('\u001b[31mnpm error\u001b[39m code E404')).toBe('npm error code E404');
    expect(endOfOutput('\u001b[1;31mFAIL\u001b[0m \u001b[mtests/a.test.ts')).toBe('FAIL tests/a.test.ts');
  });

  it('writes every other control character as its escape, so that it shows and does nothing', () => {
    // Clear the line, move up, ring the bell, rename the window: none of it reaches the terminal.
    expect(endOfOutput('a\u001b[2K\u001b[1Ab')).toBe('a\\u001b[2K\\u001b[1Ab');
    expect(endOfOutput('\u0007\u001b]0;title\u0007')).toBe('\\u0007\\u001b]0;title\\u0007');
    expect(endOfOutput('a\u0000b\u0008c\u007fd')).toBe('a\\u0000b\\u0008c\\u007fd');
    // The controls above the ASCII ones, which a terminal reads as it reads an escape.
    expect(endOfOutput('a\u009b31mb\u0085c')).toBe('a\\u009b31mb\\u0085c');
  });

  it('keeps the line feed, the tab and everything a person reads', () => {
    expect(endOfOutput('a\tb\nc')).toBe('a\tb\nc');
    // What a colour is made of is text, without the escape in front of it.
    expect(endOfOutput('café ✓ [31m 1;2m')).toBe('café ✓ [31m 1;2m');
  });
});

describe('the verdict over every run', () => {
  const red: Classified = { outcome: 'red', detail: '' };
  const green: Classified = { outcome: 'green', detail: '' };

  it('is measured when every run is red at the base, and fixed when every run is green at the head', () => {
    expect(verdictOf('red', [red, red])).toBe('measured');
    expect(verdictOf('green', [green, green, green])).toBe('fixed');
  });

  it('is vacuous when the base is green: the defect is not there', () => {
    expect(verdictOf('red', [green, green])).toBe('vacuous');
  });

  it('is still failing when the head is red: the round did not fix it', () => {
    expect(verdictOf('green', [red])).toBe('still-failing');
  });

  it('is flaky when the runs disagree, whatever was expected', () => {
    expect(verdictOf('red', [red, green])).toBe('flaky');
    expect(verdictOf('green', [green, { outcome: 'timeout', detail: '' }])).toBe('flaky');
  });

  it('is invalid when every run failed for another reason, or there were none', () => {
    for (const outcome of ['wrong-failure', 'timeout', 'no-report'] as const) {
      expect(verdictOf('red', [{ outcome, detail: '' }])).toBe('invalid');
      expect(verdictOf('green', [{ outcome, detail: '' }, { outcome, detail: '' }])).toBe('invalid');
    }
    expect(verdictOf('red', [])).toBe('invalid');
  });
});

describe('the evidence a brief records', () => {
  it('is a table a reader can check, with the hash it was measured with', () => {
    const measured: ProbeResult = {
      probe: { ...SPEC, id: 'old|token' },
      at: 'base',
      commit: '0123456789abcdef0123',
      expected: 'red',
      runs: [
        { outcome: 'red', detail: 'expected 401 | got 200' },
        { outcome: 'red', detail: 'other line' },
        { outcome: 'green', detail: '' },
      ],
      verdict: 'flaky',
    };
    const fixed: ProbeResult = { ...measured, probe: SPEC, at: 'head', commit: 'fedcba9876543210', runs: [{ outcome: 'green', detail: 'the command\npassed' }], verdict: 'fixed' };
    expect(renderEvidence([measured, fixed], 'sha256-abc', '2026-09-26')).toBe(
      [
        '| Probe | At | Runs | Verdict | Evidence |',
        '| --- | --- | ---: | --- | --- |',
        '| old\\|token | base `0123456789ab` | 2/3 | flaky | expected 401 \\| got 200 |',
        '| p | head `fedcba987654` | 1/1 | fixed | the command passed |',
        '',
        'Measured 2026-09-26 by spec-harness with probes `sha256-abc`.',
      ].join('\n'),
    );
  });

  it('trims what it writes into a cell', () => {
    const padded: ProbeResult = { probe: { ...SPEC, id: ' p ' }, at: 'base', commit: 'abc', expected: 'red', runs: [{ outcome: 'red', detail: '  spaced  ' }], verdict: 'measured' };
    expect(renderEvidence([padded], 'h', 'd').split('\n')[2]).toBe('| p | base `abc` | 1/1 | measured | spaced |');
  });

  it('writes a result with no runs as none agreeing', () => {
    const empty: ProbeResult = { probe: SPEC, at: 'base', commit: 'abc', expected: 'red', runs: [], verdict: 'invalid' };
    expect(renderEvidence([empty], 'h', 'd').split('\n')[2]).toBe('| p | base `abc` | 0/0 | invalid |  |');
  });
});

describe('what a person is told of a run that proves nothing', () => {
  const result = (verdict: ProbeResult['verdict'], runs: Classified[], more: Partial<ProbeResult> = {}): ProbeResult => ({ probe: SPEC, at: 'base', commit: 'abc', expected: 'red', runs, verdict, ...more });
  const red: Classified = { outcome: 'red', detail: 'expected 401, got 200' };
  const green: Classified = { outcome: 'green', detail: 'the command passed' };
  const refused: Classified = {
    outcome: 'wrong-failure',
    detail: 'the command exited 1 and its output does not contain "expected 401"',
    output: 'npm error npx canceled due to missing packages and no YES option: ["vitest@5.0.3"]',
  };

  it('is the probe, the commit it ran at, its verdict, the run and the end of what its command printed', () => {
    expect(renderUnexplained([result('invalid', [refused, refused])])).toBe(
      [
        'spec-harness: probe p is invalid at base: run 1 of 2: the command exited 1 and its output does not contain "expected 401"; its output ended:',
        'npm error npx canceled due to missing packages and no YES option: ["vitest@5.0.3"]',
        '',
      ].join('\n'),
    );
  });

  it('says so when the command printed nothing', () => {
    const silent: Classified = { outcome: 'timeout', detail: 'stopped after 30 seconds', output: '' };
    expect(renderUnexplained([result('invalid', [silent], { at: 'head', expected: 'green' })])).toBe('spec-harness: probe p is invalid at head: run 1 of 1: stopped after 30 seconds; it printed nothing\n');
  });

  it('is the first such run of a result, wherever it comes among the runs', () => {
    const later: Classified = { ...refused, output: 'another reason' };
    expect(renderUnexplained([result('flaky', [red, refused, later])])).toBe(
      'spec-harness: probe p is flaky at base: run 2 of 3: the command exited 1 and its output does not contain "expected 401"; its output ended:\nnpm error npx canceled due to missing packages and no YES option: ["vitest@5.0.3"]\n',
    );
  });

  it('is nothing for a result whose runs are all red or green: its verdict is the whole of it', () => {
    // Measured, fixed, vacuous, still failing, and flaky between red and green.
    const whole = [result('measured', [red, red]), result('fixed', [green], { expected: 'green' }), result('vacuous', [green]), result('still-failing', [red], { expected: 'green' }), result('flaky', [red, green])];
    expect(renderUnexplained(whole)).toBe('');
    expect(renderUnexplained([result('invalid', [])])).toBe('');
    expect(renderUnexplained([])).toBe('');
  });

  it('is one block for each such result, in their order, with nothing between them or for the others', () => {
    const other: ProbeResult = result('invalid', [{ outcome: 'no-report', detail: 'the command passed and wrote no r.xml', output: 'done' }], { probe: { ...SPEC, id: 'q' }, at: 'head', expected: 'green' });
    expect(renderUnexplained([result('invalid', [refused]), result('measured', [red]), other])).toBe(
      [
        'spec-harness: probe p is invalid at base: run 1 of 1: the command exited 1 and its output does not contain "expected 401"; its output ended:',
        'npm error npx canceled due to missing packages and no YES option: ["vitest@5.0.3"]',
        'spec-harness: probe q is invalid at head: run 1 of 1: the command passed and wrote no r.xml; its output ended:',
        'done',
        '',
      ].join('\n'),
    );
  });
});

describe("the environment a probe's commands run in", () => {
  /** What the environment says of npm's `yes` setting, in whatever case: each name and its value. */
  const said = (environment: Record<string, string | undefined>): [string, string | undefined][] =>
    Object.entries(environment).filter(([name]) => name.toLowerCase() === 'npm_config_yes');

  it('has npm fetch nothing for a command, where the person said nothing of it', () => {
    expect(probeEnvironment({ PATH: '/bin', HOME: '/home/a' })).toEqual({ PATH: '/bin', HOME: '/home/a', CI: '1', npm_config_yes: 'false' });
    expect(probeEnvironment({})).toEqual({ CI: '1', npm_config_yes: 'false' });
  });

  it('is left as the person set it, whatever they set and in whatever case npm reads it', () => {
    for (const name of ['npm_config_yes', 'NPM_CONFIG_YES', 'Npm_Config_Yes']) {
      for (const value of ['true', 'false', '1', '0']) {
        expect(said(probeEnvironment({ PATH: '/bin', [name]: value })), `${name}=${value}`).toEqual([[name, value]]);
      }
    }
    expect(probeEnvironment({ PATH: '/bin', NPM_CONFIG_YES: 'true' })).toEqual({ PATH: '/bin', NPM_CONFIG_YES: 'true', CI: '1' });
  });

  it('is left as it is when two spellings are set, and when one of two is empty', () => {
    expect(said(probeEnvironment({ npm_config_yes: 'true', NPM_CONFIG_YES: 'false' }))).toEqual([
      ['npm_config_yes', 'true'],
      ['NPM_CONFIG_YES', 'false'],
    ]);
    expect(said(probeEnvironment({ npm_config_yes: '', NPM_CONFIG_YES: 'true' }))).toEqual([
      ['npm_config_yes', ''],
      ['NPM_CONFIG_YES', 'true'],
    ]);
    expect(said(probeEnvironment({ NPM_CONFIG_YES: 'true', npm_config_yes: '' }))).toEqual([
      ['NPM_CONFIG_YES', 'true'],
      ['npm_config_yes', ''],
    ]);
  });

  it('takes a setting that is empty for none, as npm does, and leaves one spelling of it', () => {
    // On Windows two spellings are one variable, and the empty one could be the one a command is handed.
    expect(probeEnvironment({ PATH: '/bin', NPM_CONFIG_YES: '' })).toEqual({ PATH: '/bin', CI: '1', npm_config_yes: 'false' });
    expect(probeEnvironment({ npm_config_yes: '', Npm_Config_Yes: '', NPM_CONFIG_YES: undefined })).toEqual({ CI: '1', npm_config_yes: 'false' });
  });

  it('reads no other setting of npm for that one, nor a name that only contains it', () => {
    const others = { npm_config_yes_please: 'true', my_npm_config_yes: 'true', npm_config_yess: 'true', npm_config_ye: 'true', npm_config_registry: 'http://127.0.0.1:1/' };
    expect(probeEnvironment(others)).toEqual({ ...others, CI: '1', npm_config_yes: 'false' });
  });

  it('sets CI as a pipeline does, over whatever the person had there, and passes the rest on', () => {
    expect(probeEnvironment({ CI: 'false', SPEC_BRIEF: '012', npm_config_yes: 'true' })).toEqual({ CI: '1', SPEC_BRIEF: '012', npm_config_yes: 'true' });
    expect(probeEnvironment({ CI: '', npm_config_cache: '/tmp/c' })).toEqual({ CI: '1', npm_config_cache: '/tmp/c', npm_config_yes: 'false' });
  });

  it("leaves the person's own environment as it was", () => {
    const own = { PATH: '/bin', NPM_CONFIG_YES: '' };
    probeEnvironment(own);
    expect(own).toEqual({ PATH: '/bin', NPM_CONFIG_YES: '' });
  });
});
