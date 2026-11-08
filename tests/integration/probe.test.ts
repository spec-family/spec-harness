import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Classified } from '../../src/probe.js';
import { brief, BRIEF_FILE, cleanup, cli, parsed, repository, temp, withEnvironment, type Repository } from './helpers.js';
import { serve, type Registry } from './registry.js';

afterAll(cleanup);

interface ProbeReport {
  ok: boolean;
  brief: string;
  hash: string;
  results: { id: string; at: string; commit: string; expected: string; verdict: string; runs: Classified[] }[];
  evidence: string;
}

/** A script that fails with the defect's signature until src/value.txt says "fixed". */
const PROBE_JS = [
  "const { readFileSync } = require('node:fs');",
  "const value = readFileSync('src/value.txt', 'utf8').trim();",
  "if (value !== 'fixed') {",
  "  console.log('expected fixed, got ' + value);",
  '  process.exit(1);',
  '}',
  "console.log('ok');",
].join('\n');

function probeBlock(fields: string, files: Record<string, string> = { 'probe.js': PROBE_JS }): string {
  const blocks = ['## Probes', '', '```probe', fields, '```', ''];
  for (const [path, content] of Object.entries(files)) blocks.push(`\`\`\`probe-file ${path}`, content, '```', '');
  return blocks.join('\n');
}

/** A brief whose probe measures src/value.txt, on a branch that fixes it; `tracked` is what else the base commit holds. */
function defect(
  fields: string,
  options: { fix?: string; files?: Record<string, string>; config?: Record<string, unknown>; tracked?: Record<string, string> } = {},
): Repository {
  const repo = repository(
    { [BRIEF_FILE]: brief({ affected: ['src/**'], body: probeBlock(fields, options.files) }), 'src/value.txt': 'broken\n', ...options.tracked },
    { probes: { runs: 1 }, ...options.config },
  );
  repo.git('checkout', '-q', '-b', 'brief/001-fix');
  if (options.fix !== undefined) {
    repo.write('src/value.txt', `${options.fix}\n`);
    repo.commit('the fix');
  }
  return repo;
}

function worktrees(repo: Repository): string[] {
  return repo
    .git('worktree', 'list', '--porcelain')
    .split('\n')
    .filter((line) => line.startsWith('worktree '));
}

describe('probe', () => {
  it('measures the defect at the base and finds it fixed at the head, then removes its worktrees', async () => {
    const repo = defect('id: value-fixed\nrun: node probe.js\nsignature: expected fixed, got broken\nruns: 2', { fix: 'fixed' });
    const result = await cli(['probe', '--format', 'json'], repo.root);
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    const report = parsed<ProbeReport>(result);
    expect(report.ok).toBe(true);
    expect(report.hash).toMatch(/^sha256-[0-9a-f]{64}$/);
    expect(report.results.map((r) => [r.id, r.at, r.expected, r.verdict, r.runs.length])).toEqual([
      ['value-fixed', 'base', 'red', 'measured', 2],
      ['value-fixed', 'head', 'green', 'fixed', 2],
    ]);
    expect(report.results[0]?.runs[0]).toEqual({ outcome: 'red', detail: 'expected fixed, got broken' });
    expect(report.results[0]?.commit).toBe(repo.git('rev-parse', 'main'));
    expect(report.results[1]?.commit).toBe(repo.git('rev-parse', 'HEAD'));
    expect(report.evidence).toContain('| value-fixed | base `');
    expect(report.evidence).toContain(`by spec-harness with probes \`${report.hash}\`.`);
    expect(report.evidence).toMatch(/\nMeasured \d{4}-\d{2}-\d{2} by spec-harness/);
    expect(parsed<{ command: string }>(result).command).toBe('probe');
    // The worktrees were temporary; the person's checkout was never touched.
    expect(worktrees(repo)).toHaveLength(1);
    expect(repo.git('status', '--porcelain')).toBe('');
    expect(repo.read('src/value.txt')).toBe('fixed\n');
  });

  it('prints the evidence table as text', async () => {
    const repo = defect('id: v\nrun: node probe.js\nsignature: expected fixed', { fix: 'fixed' });
    const result = await cli(['probe'], repo.root);
    expect(result.code).toBe(0);
    expect(result.stdout.startsWith('| Probe | At | Runs | Verdict | Evidence |\n| --- | --- | ---: | --- | --- |\n| v | base `')).toBe(true);
    expect(result.stdout).toMatch(/\| v \| head `[0-9a-f]{12}` \| 1\/1 \| fixed \| the command passed \|/);
    // Measured and fixed: the table is all there is to say.
    expect(result.stderr).toBe('');
  });

  it('calls a probe vacuous when the base is already green: there is no defect to fix', async () => {
    const repo = defect('id: v\nrun: node -e "process.exit(0)"\nsignature: expected fixed');
    const report = parsed<ProbeReport>(await cli(['probe', '--at', 'base', '--format', 'json'], repo.root));
    expect(report.ok).toBe(false);
    expect(report.results.map((r) => r.verdict)).toEqual(['vacuous']);
    // The command ran as it was written, so there is nothing of its output to show.
    expect(await cli(['probe', '--at', 'base'], repo.root)).toMatchObject({ code: 1, stderr: '' });
  });

  it('calls a probe invalid when it fails for a reason it did not declare', async () => {
    const repo = defect('id: v\nrun: node probe.js\nsignature: expected 401');
    const report = parsed<ProbeReport>(await cli(['probe', '--format', 'json'], repo.root));
    // Base and head are one commit here, so only the base is measured.
    expect(report.results.map((r) => [r.at, r.verdict])).toEqual([['base', 'invalid']]);
    expect(report.results[0]?.runs[0]).toEqual({
      outcome: 'wrong-failure',
      detail: 'the command exited 1 and its output does not contain "expected 401"',
      output: 'expected fixed, got broken',
    });
  });

  it('shows the end of what an invalid probe printed: beside the table on the standard error, and in the document as a field of each such run', async () => {
    const repo = defect('id: v\nrun: node probe.js\nsignature: expected 401\nruns: 2');
    const pretty = await cli(['probe'], repo.root);
    expect(pretty.code).toBe(1);
    // The standard output is the table and nothing else, as it is for a probe that measured.
    expect(pretty.stdout).toMatch(
      /^\| Probe \| At \| Runs \| Verdict \| Evidence \|\n\| --- \| --- \| ---: \| --- \| --- \|\n\| v \| base `[0-9a-f]{12}` \| 2\/2 \| invalid \| the command exited 1 and its output does not contain "expected 401" \|\n\nMeasured \d{4}-\d{2}-\d{2} by spec-harness with probes `sha256-[0-9a-f]{64}`\.\n$/,
    );
    expect(pretty.stderr).toBe(
      'spec-harness: probe v is invalid at base: run 1 of 2: the command exited 1 and its output does not contain "expected 401"; its output ended:\nexpected fixed, got broken\n',
    );
    const json = await cli(['probe', '--format', 'json'], repo.root);
    expect(json.code).toBe(1);
    // A script reads the document: what the command printed is in it, and nowhere beside it.
    expect(json.stderr).toBe('');
    const run = { outcome: 'wrong-failure', detail: 'the command exited 1 and its output does not contain "expected 401"', output: 'expected fixed, got broken' };
    expect(parsed<ProbeReport>(json).results[0]?.runs).toEqual([run, run]);
  });

  it('shows no more than the end of it, with nothing in it for a terminal to obey', async () => {
    // A colour, a line cleared, and more than the 2,000 characters shown.
    const loud = ["console.log('a'.repeat(3000));", "console.log('\\u001b[31mnpm error\\u001b[39m \\u001b[2Kcanceled');", 'process.exit(1);'].join('\n');
    const repo = defect('id: v\nrun: node loud.js\nsignature: expected 401', { files: { 'loud.js': loud } });
    const shown = `${'a'.repeat(1972)}\nnpm error \\u001b[2Kcanceled`;
    expect(shown).toHaveLength(2000);
    expect((await cli(['probe'], repo.root)).stderr).toBe(
      `spec-harness: probe v is invalid at base: run 1 of 1: the command exited 1 and its output does not contain "expected 401"; its output ended:\n${shown}\n`,
    );
    expect(parsed<ProbeReport>(await cli(['probe', '--format', 'json'], repo.root)).results[0]?.runs[0]?.output).toBe(shown);
  });

  it('calls a probe still failing when the head did not fix it', async () => {
    const repo = defect('id: v\nrun: node probe.js\nsignature: expected fixed', { fix: 'still broken' });
    const report = parsed<ProbeReport>(await cli(['probe', '--at', 'head', '--format', 'json'], repo.root));
    expect(report.results.map((r) => [r.at, r.verdict])).toEqual([['head', 'still-failing']]);
    // Red for the reason the probe declares: the line that says so is the evidence, and no run carries its output.
    expect(report.results[0]?.runs).toEqual([{ outcome: 'red', detail: 'expected fixed, got still broken' }]);
    expect((await cli(['probe', '--at', 'head'], repo.root)).stderr).toBe('');
  });

  it('calls runs that disagree flaky', async () => {
    // Red the first time, green after: it leaves a file behind in the worktree.
    const script = "const fs = require('node:fs'); if (!fs.existsSync('seen')) { fs.writeFileSync('seen', ''); console.log('expected fixed'); process.exit(1); }";
    const repo = defect('id: v\nrun: node flaky.js\nsignature: expected fixed\nruns: 2', { files: { 'flaky.js': script } });
    const report = parsed<ProbeReport>(await cli(['probe', '--format', 'json'], repo.root));
    expect(report.results.map((r) => r.verdict)).toEqual(['flaky']);
    expect(report.results[0]?.runs.map((r) => r.outcome)).toEqual(['red', 'green']);
  });

  it('stops a run at its timeout and calls it invalid', async () => {
    const repo = defect('id: v\nrun: node -e "setTimeout(() => {}, 60000)"\nsignature: expected fixed\ntimeout: 1');
    const report = parsed<ProbeReport>(await cli(['probe', '--format', 'json'], repo.root));
    expect(report.results[0]?.runs).toEqual([{ outcome: 'timeout', detail: 'stopped after 1 second', output: '' }]);
    expect(report.results[0]?.verdict).toBe('invalid');
    expect(worktrees(repo)).toHaveLength(1);
  });

  it('shows what a run had printed by the time it was stopped, and says so when that is nothing', async () => {
    // A question nobody is there to answer, as a command asks one where it has no terminal.
    const asking = "process.stdout.write('Ok to proceed? (y) '); setTimeout(() => {}, 60000);";
    const repo = defect('id: v\nrun: node asking.js\nsignature: expected fixed\ntimeout: 2', { files: { 'asking.js': asking } });
    expect((await cli(['probe'], repo.root)).stderr).toBe('spec-harness: probe v is invalid at base: run 1 of 1: stopped after 2 seconds; its output ended:\nOk to proceed? (y)\n');
    const silent = defect('id: v\nrun: node -e "setTimeout(() => {}, 60000)"\nsignature: expected fixed\ntimeout: 1');
    expect((await cli(['probe'], silent.root)).stderr).toBe('spec-harness: probe v is invalid at base: run 1 of 1: stopped after 1 second; it printed nothing\n');
  });

  it('reads the declared test out of a JUnit report', async () => {
    const junit = [
      "const { readFileSync, mkdirSync, writeFileSync } = require('node:fs');",
      "const fixed = readFileSync('src/value.txt', 'utf8').trim() === 'fixed';",
      "const failure = fixed ? '' : '<failure message=\"expected fixed\">got broken</failure>';",
      "mkdirSync('reports', { recursive: true });",
      "writeFileSync('reports/junit.xml', '<testsuites><testsuite name=\"s\"><testcase classname=\"value\" name=\"is fixed\">' + failure + '</testcase></testsuite></testsuites>');",
      'process.exit(fixed ? 0 : 1);',
    ].join('\n');
    const repo = defect('id: v\nrun: node junit.js\ntest: value is fixed\njunit: reports/junit.xml', { fix: 'fixed', files: { 'junit.js': junit } });
    const report = parsed<ProbeReport>(await cli(['probe', '--format', 'json'], repo.root));
    expect(report.results.map((r) => [r.at, r.verdict])).toEqual([
      ['base', 'measured'],
      ['head', 'fixed'],
    ]);
    expect(report.results[0]?.runs[0]).toEqual({ outcome: 'red', detail: 'is fixed failed' });
    expect(report.results[1]?.runs[0]).toEqual({ outcome: 'green', detail: 'every test passed' });
  });

  it('judges a run that writes no JUnit report by its exit, and never by the report an earlier run left', async () => {
    // Red the first time, with a report; the second time it passes and writes none.
    const script = [
      "const fs = require('node:fs');",
      "if (!fs.existsSync('seen')) {",
      "  fs.writeFileSync('seen', '');",
      "  fs.mkdirSync('reports', { recursive: true });",
      "  fs.writeFileSync('reports/junit.xml', '<testsuites><testsuite name=\"s\"><testcase classname=\"value\" name=\"is fixed\"><failure message=\"expected fixed\">got broken</failure></testcase></testsuite></testsuites>');",
      '  process.exit(1);',
      '}',
    ].join('\n');
    const repo = defect('id: v\nrun: node once.js\ntest: value is fixed\njunit: reports/junit.xml\nruns: 2', { files: { 'once.js': script } });
    const report = parsed<ProbeReport>(await cli(['probe', '--format', 'json'], repo.root));
    expect(report.results[0]?.runs).toEqual([
      { outcome: 'red', detail: 'is fixed failed' },
      { outcome: 'no-report', detail: 'the command passed and wrote no reports/junit.xml', output: '' },
    ]);
    // Runs that disagree: the one that proves nothing is the one a person is told of.
    expect(report.results[0]?.verdict).toBe('flaky');
    expect((await cli(['probe'], repo.root)).stderr).toBe('spec-harness: probe v is flaky at base: run 2 of 2: the command passed and wrote no reports/junit.xml; it printed nothing\n');
    const silent = defect('id: v\nrun: node -e "process.exit(1)"\ntest: value is fixed\njunit: reports/junit.xml');
    expect(parsed<ProbeReport>(await cli(['probe', '--format', 'json'], silent.root)).results[0]?.runs).toEqual([
      { outcome: 'wrong-failure', detail: 'the command failed before writing reports/junit.xml', output: '' },
    ]);
  });

  it('says of a report that is a directory, which a repository can hold, that it cannot be read, and judges the run as one with no report', async () => {
    const repo = defect('id: v\nrun: node -e "process.exit(1)"\ntest: value is fixed\njunit: reports', { tracked: { 'reports/keep': 'x\n' } });
    const result = await cli(['probe', '--format', 'json'], repo.root);
    // A verdict, and no error of Node's: the probe is invalid, which is exit 1.
    expect({ code: result.code, stderr: result.stderr }).toEqual({ code: 1, stderr: '' });
    expect(parsed<ProbeReport>(result).results[0]?.runs).toEqual([{ outcome: 'no-report', detail: 'reports cannot be read: it is a directory, not a report', output: '' }]);
  });

  it.skipIf(process.platform === 'win32')('says of a report that is a named pipe the command made that it cannot be read, and comes back (ADR-0002)', async () => {
    // Opened, a pipe nothing writes to was read without end.
    const repo = defect('id: v\nrun: mkfifo reports.xml; exit 1\ntest: value is fixed\njunit: reports.xml');
    const result = await cli(['probe', '--format', 'json', '--at', 'base'], repo.root);
    expect({ code: result.code, stderr: result.stderr }).toEqual({ code: 1, stderr: '' });
    expect(parsed<ProbeReport>(result).results[0]?.runs).toEqual([{ outcome: 'no-report', detail: 'reports.xml cannot be read: it is neither a file nor a directory, not a report', output: '' }]);
  });

  it('writes each probe file with a final newline, and runs the setup before the probe', async () => {
    const check = "const text = require('node:fs').readFileSync('data.txt', 'utf8'); console.log(text === 'x\\n' ? 'expected fixed' : JSON.stringify(text)); process.exit(1);";
    const repo = defect('id: v\nsetup: node -e "process.exit(0)"\nrun: node check.js\nsignature: expected fixed', { files: { 'check.js': check, 'data.txt': 'x' } });
    const result = await cli(['probe', '--format', 'json'], repo.root);
    expect(parsed<ProbeReport>(result).results.map((r) => [r.at, r.verdict])).toEqual([['base', 'measured']]);
    // A setup that passed and left nothing running has nothing said of it.
    expect(result.stderr).toBe('');
  });

  it('runs one probe by --id, and says when there is none', async () => {
    const repo = defect('id: v\nrun: node probe.js\nsignature: expected fixed');
    expect(parsed<ProbeReport>(await cli(['probe', '--id', 'v', '--format', 'json'], repo.root)).results).toHaveLength(1);
    expect(await cli(['probe', '--id', 'w'], repo.root)).toMatchObject({ code: 2, stdout: 'brief 001 declares no probe named w\n' });
    const none = repository({ [BRIEF_FILE]: brief() });
    expect(await cli(['probe', '1'], none.root)).toMatchObject({ code: 0, stdout: 'brief 001 declares no probe\n' });
  });

  it('refuses a brief whose probes cannot be read', async () => {
    const repo = defect('id: v\nrun: node probe.js');
    const result = await cli(['probe'], repo.root);
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/^spec-harness: briefs\/001_rotate-tokens\.md:\d+: probe v does not say how it fails/);
  });

  it('stops when the setup fails, and when there is no base', async () => {
    const repo = defect('id: v\nsetup: node -e "console.log(\'no network\'); process.exit(3)"\nrun: node probe.js\nsignature: expected fixed');
    const result = await cli(['probe'], repo.root);
    expect(result.code).toBe(2);
    expect(result.stderr).toBe('spec-harness: the probe setup "node -e "console.log(\'no network\'); process.exit(3)"" failed at base:\nno network\n');
    const loud = defect('id: v\nsetup: node -e "process.stdout.write(\'a\'.repeat(1000) + \'b\'.repeat(2000)); process.exit(3)"\nrun: node probe.js\nsignature: expected fixed');
    // The last 2,000 characters of what it said, where a failure says why.
    expect((await cli(['probe'], loud.root)).stderr).toMatch(/failed at base:\nb{2000}\n$/);
    // Shown as an invalid probe's output is: a colour dropped, and nothing left for a terminal to obey.
    const coloured = "console.log('\\u001b[31mnpm error\\u001b[39m code E404\\u0007'); process.exit(1);";
    const failing = defect('id: v\nsetup: node setup.js\nrun: node probe.js\nsignature: expected fixed', { files: { 'probe.js': PROBE_JS, 'setup.js': coloured } });
    expect((await cli(['probe'], failing.root)).stderr).toBe('spec-harness: the probe setup "node setup.js" failed at base:\nnpm error code E404\\u0007\n');
    expect(worktrees(repo)).toHaveLength(1);
    const unbased = defect('id: v\nrun: node probe.js\nsignature: x');
    expect(await cli(['probe', '--base', 'nowhere'], unbased.root)).toMatchObject({ code: 2, stderr: 'spec-harness: "nowhere" names no commit\n' });
  });

  it('says of a setup stopped at its timeout that it was stopped and after how long, where it may have printed nothing to say why', async () => {
    const repo = defect('id: v\nsetup: node -e "setTimeout(() => {}, 20000)"\nrun: node probe.js\nsignature: expected fixed', { config: { probes: { runs: 1, timeout: 1 } } });
    const result = await cli(['probe'], repo.root);
    expect(result.code).toBe(2);
    // Stopped whole, so nothing is said to have been left running.
    expect(result.stderr).toBe('spec-harness: the probe setup "node -e "setTimeout(() => {}, 20000)"" was stopped after 1 second at base:\n\n');
    expect(worktrees(repo)).toHaveLength(1);
  });
});

/**
 * A probe's command runs where nothing is installed until its `setup`
 * installs it, with no terminal: there `npx <name>` fetched the registry's
 * package of that name and ran it, unasked (ADR-0007). These tests run the
 * npm that is on the PATH, as a probe does, against a registry of their own
 * on the loopback address and a cache of their own, so CI measures every
 * platform and npm it runs.
 *
 * The package is made up. Its name is under the family's own scope, where
 * nobody else can register one: were npm ever to ask the real registry for
 * it, the answer is that there is no such package.
 */
describe('a probe whose command starts a tool through npx, by a name the project has not installed', () => {
  const NAME = '@spec-family/no-such-probe-tool';
  const FETCHED = 'SPEC_HARNESS_TEST_FETCHED';
  // The package's command says that it ran, in a file and in what it prints, and fails as a probe's command does.
  const SCRIPT = `require('node:fs').writeFileSync(process.env.${FETCHED}, 'ran'); console.log('FETCHED AND RAN'); process.exit(1);`;
  let registry: Registry;

  beforeAll(async () => {
    registry = await serve(NAME, '9.9.9', 'no-such-probe-tool', SCRIPT);
  });
  afterAll(() => registry.close());

  /**
   * `probe` over a brief whose probe runs `line`, in a project with a
   * manifest and nothing installed, with npm pointed at the registry above
   * and `environment` said beside it. What the probe found, what the
   * registry was asked, and whether the package ran.
   */
  async function probing(line: string, environment: Record<string, string | undefined> = {}): Promise<{ report: ProbeReport; asked: string[]; downloaded: string[]; ran: boolean }> {
    const repo = defect(`id: fetch\nrun: ${line}\nsignature: FETCHED AND RAN`, { files: {}, tracked: { 'package.json': '{ "name": "probed", "version": "1.0.0", "private": true }\n' } });
    const marker = join(temp(), 'fetched');
    const settings = {
      npm_config_registry: registry.url,
      // A cache apiece: a copy an earlier fetch left in one would run without a download.
      npm_config_cache: join(temp(), 'npm-cache'),
      npm_config_update_notifier: 'false',
      [FETCHED]: marker,
      // Whatever the person running the suite has said of it.
      npm_config_yes: undefined,
    };
    registry.requests.length = 0;
    const result = await withEnvironment({ ...settings, ...environment }, () => cli(['probe', '--format', 'json'], repo.root));
    return { report: parsed<ProbeReport>(result), asked: [...registry.requests], downloaded: registry.downloads(), ran: existsSync(marker) };
  }

  it('fetches nothing: npm stops and names the package, and the probe is invalid with what npm said', async () => {
    const { report, asked, downloaded, ran } = await probing(`npx ${NAME} --version`);
    expect(downloaded).toEqual([]);
    expect(ran).toBe(false);
    expect(report.results.map((r) => [r.at, r.verdict])).toEqual([['base', 'invalid']]);
    const run = report.results[0]?.runs[0];
    expect(run).toMatchObject({ outcome: 'wrong-failure', detail: 'the command exited 1 and its output does not contain "FETCHED AND RAN"' });
    // npm reached the registry, was told of the package, and stopped there: its reason is what the person is shown.
    expect(asked).toContain(`GET /${NAME}`);
    expect(run?.output).toMatch(/npx canceled due to missing packages.*@spec-family\/no-such-probe-tool@9\.9\.9/);
  });

  it('fetches where the line itself says `--yes`: the line is the person\'s, approved with the brief', async () => {
    const { report, downloaded, ran } = await probing(`npx --yes ${NAME} --version`);
    expect(downloaded).toEqual([`GET /${NAME}/-/no-such-probe-tool-9.9.9.tgz`]);
    expect(ran).toBe(true);
    expect(report.results.map((r) => [r.at, r.verdict])).toEqual([['base', 'measured']]);
  });

  it("fetches where the person's environment says npm may, in either case of the name", async () => {
    for (const name of ['npm_config_yes', 'NPM_CONFIG_YES']) {
      const { report, downloaded, ran } = await probing(`npx ${NAME} --version`, { [name]: 'true' });
      expect(downloaded, name).toEqual([`GET /${NAME}/-/no-such-probe-tool-9.9.9.tgz`]);
      expect(ran, name).toBe(true);
      expect(report.results.map((r) => [r.at, r.verdict]), name).toEqual([['base', 'measured']]);
    }
  });
});
