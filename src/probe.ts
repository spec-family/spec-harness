/**
 * Probes: a defect, measured before anyone is sent to fix it.
 *
 * A brief that claims a defect proves it with a probe - a test that fails at
 * the base commit, for the reason the brief states, every time it runs - and
 * the round is done when the same probe passes at the head. The probe lives
 * in the brief, as fenced blocks, so the evidence and the claim are one
 * record:
 *
 * ````markdown
 * ```probe
 * id: old-token-still-accepted
 * run: npm test -- tests/probes/rotate.test.ts
 * signature: expected 401, got 200
 * ```
 *
 * ```probe-file tests/probes/rotate.test.ts
 * ...the test...
 * ```
 * ````
 *
 * What "for the reason the brief states" means is declared, never inferred
 * from prose: a `signature` the failing output must contain, or a `test` name
 * the JUnit report must show failing (ADR-0007). Without one, a probe could be
 * red because it did not compile, and a red that proves nothing is refused.
 */

import { createHash } from 'node:crypto';

import type { JUnitRead } from './junit.js';

export interface ProbeSpec {
  readonly id: string;
  /** The command, as a line a shell would run. */
  readonly run: string;
  /** A command to prepare a fresh checkout, such as `npm ci`. */
  readonly setup: string | null;
  /** Text the failing output, or the failing test's message, must contain. */
  readonly signature: string | null;
  /** A JUnit report the command writes, relative to the checkout. */
  readonly junit: string | null;
  /** The failing test's name, or part of it, in the JUnit report. */
  readonly test: string | null;
  readonly runs: number | null;
  readonly timeout: number | null;
  /** 1-based line of the probe block in the brief. */
  readonly line: number;
}

export interface ProbeFile {
  readonly path: string;
  readonly content: string;
  readonly line: number;
}

/** A fenced block as the scanner found it. */
export interface CodeBlock {
  readonly info: string;
  readonly content: string;
  /** 1-based line of the opening fence. */
  readonly line: number;
}

export interface ProbeSet {
  readonly probes: readonly ProbeSpec[];
  readonly files: readonly ProbeFile[];
  readonly problems: readonly { readonly line: number; readonly message: string }[];
  /** SHA-256 over every probe block and probe file, in order: what the evidence was measured with. */
  readonly hash: string;
}

const KEYS = ['id', 'run', 'setup', 'signature', 'junit', 'test', 'runs', 'timeout'];

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && (trimmed.startsWith('"') || trimmed.startsWith("'")) && trimmed.endsWith(trimmed.charAt(0))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * A probe line without its trailing `# comment`. A `#` counts only after
 * whitespace and outside quotes, so `run: npm test -- -t "issue #12"` keeps
 * its argument; a quote counts only where a word starts, so the apostrophe in
 * `it's` opens nothing.
 */
function withoutComment(raw: string): string {
  let quote: string | null = null;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw.charAt(i);
    const after = i === 0 ? ' ' : raw.charAt(i - 1);
    if (quote !== null) {
      if (ch === quote) quote = null;
    } else if ((ch === '"' || ch === "'") && /[\s:=]/.test(after)) {
      quote = ch;
    } else if (ch === '#' && /\s/.test(after)) {
      return raw.slice(0, i);
    }
  }
  return raw;
}

/** Reads the probes and probe files among a brief's fenced blocks. */
export function readProbes(blocks: readonly CodeBlock[]): ProbeSet {
  const probes: ProbeSpec[] = [];
  const files: ProbeFile[] = [];
  const problems: { line: number; message: string }[] = [];
  const hash = createHash('sha256');
  for (const block of blocks) {
    const [word, ...rest] = block.info.trim().split(/\s+/);
    if (word === 'probe-file') {
      const path = rest.join(' ').trim();
      // A backslash is a separator where the probe is written to disk on Windows.
      if (path === '' || /^[\\/]/.test(path) || path.split(/[\\/]/).includes('..') || /^[A-Za-z]:/.test(path)) {
        problems.push({ line: block.line, message: `a probe-file names "${path}"; it must be a path inside the repository` });
        continue;
      }
      files.push({ path, content: block.content, line: block.line });
      hash.update(`probe-file ${path}\n${block.content}\n`);
      continue;
    }
    if (word !== 'probe') continue;
    hash.update(`probe\n${block.content}\n`);
    const fields = new Map<string, string>();
    let bad = false;
    for (const raw of block.content.split(/\r?\n/)) {
      const line = withoutComment(raw).trim();
      if (line === '' || line.startsWith('#')) continue;
      const colon = line.indexOf(':');
      const key = colon < 0 ? '' : line.slice(0, colon).trim();
      if (!KEYS.includes(key)) {
        problems.push({ line: block.line, message: `a probe says "${line}"; its keys are ${KEYS.join(', ')}` });
        bad = true;
        continue;
      }
      fields.set(key, unquote(line.slice(colon + 1)));
    }
    if (bad) continue;
    const id = fields.get('id') ?? '';
    const run = fields.get('run') ?? '';
    if (id === '' || run === '') {
      problems.push({ line: block.line, message: 'a probe needs an id and a run command' });
      continue;
    }
    const signature = fields.get('signature') || null;
    const test = fields.get('test') || null;
    const junit = fields.get('junit') || null;
    if (signature === null && test === null) {
      problems.push({
        line: block.line,
        message: `probe ${id} does not say how it fails; give a signature, or a JUnit test name, so that a failure to compile is not taken for the defect`,
      });
      continue;
    }
    if (test !== null && junit === null) {
      problems.push({ line: block.line, message: `probe ${id} names a test but no junit report to find it in` });
      continue;
    }
    const count = (key: string): number | null | string => {
      const value = fields.get(key);
      if (value === undefined) return null;
      const n = Number(value);
      return Number.isInteger(n) && n >= 1 ? n : `probe ${id}: "${key}" must be a whole number of at least 1`;
    };
    const runs = count('runs');
    const timeout = count('timeout');
    if (typeof runs === 'string' || typeof timeout === 'string') {
      problems.push({ line: block.line, message: typeof runs === 'string' ? runs : (timeout as string) });
      continue;
    }
    if (probes.some((probe) => probe.id === id)) {
      problems.push({ line: block.line, message: `probe ${id} is declared twice` });
      continue;
    }
    probes.push({ id, run, setup: fields.get('setup') || null, signature, junit, test, runs, timeout, line: block.line });
  }
  return { probes, files, problems, hash: `sha256-${hash.digest('hex')}` };
}

/** What one run of a probe did. `exitCode` is `null` when it was stopped at its timeout. */
export interface ProbeRun {
  readonly exitCode: number | null;
  readonly output: string;
  /** The report when the probe names one: read, unreadable, or `null` when the file was not written. */
  readonly junit: JUnitRead | null;
}

export type RunOutcome = 'red' | 'green' | 'wrong-failure' | 'timeout' | 'no-report';

export interface Classified {
  readonly outcome: RunOutcome;
  /** The evidence: the line or the message that matched, or what was missing. */
  readonly detail: string;
  /**
   * The end of what the command printed, as {@link endOfOutput} gives it, on
   * a run that proves nothing: it failed for another reason, was stopped at
   * its timeout, or left no report that can be read. `detail` says only that
   * the reason was not the probe's; the reason itself is the command's to
   * give, and this is where it gave it. A red or a green run has none.
   */
  readonly output?: string;
}

/**
 * npm's `yes` setting as an environment spells it. npm reads the name in any
 * case: `NPM_CONFIG_YES` and `Npm_Config_Yes` did what `npm_config_yes` does
 * under npm 10.9.9, 11.16.0, 11.20.0 and 12.2.0 (ADR-0007).
 */
const NPM_YES = /^npm_config_yes$/i;

/**
 * The environment a probe's commands run in: the person's own, with `CI` set
 * as a pipeline sets it, and with npm told to fetch nothing for a command
 * unless the person's environment already says what npm may fetch.
 *
 * A probe's command runs where nothing is installed until its `setup`
 * installs it, with no terminal to be asked on. There `npx <name>` fetches
 * the registry's package of that name and runs it, unasked, and with
 * `npm_config_yes=false` it stops and names the package instead (ADR-0007).
 * A person who set the variable, in any case, has said what they want, and
 * it is left as they set it. Set and empty says nothing: npm fetched with it
 * as with no variable, so the setting is made. The empty one is taken out
 * first and not left beside it: on Windows a name is one variable whatever
 * its case, and of two spellings a command is handed one, the upper case
 * before the lower, which would be the empty one.
 */
export function probeEnvironment(own: Readonly<Record<string, string | undefined>>): Record<string, string | undefined> {
  const spelled = Object.keys(own).filter((name) => NPM_YES.test(name));
  if (spelled.some((name) => Boolean(own[name]))) return { ...own, CI: '1' };
  const rest = Object.fromEntries(Object.entries(own).filter(([name]) => !spelled.includes(name)));
  return { ...rest, CI: '1', npm_config_yes: 'false' };
}

/** How many characters of the end of a command's output a person is shown. */
const SHOWN = 2000;

/**
 * The end of what a command printed, as a person is shown it: the last 2,000
 * characters, less what is there for a terminal to obey rather than for a
 * person to read. Written out as it came, an escape sequence in it moves the
 * cursor, clears lines already written or renames the window.
 *
 * - A carriage return ends a line as a line feed does, alone or in front of
 *   one: alone it would have the next line written over the last.
 * - A colour is dropped. A command told to colour what it prints, as
 *   `npm_config_color=always` tells npm, does so with nobody at a terminal
 *   to see it, and a colour says nothing in a report.
 * - Every other control character but the line feed and the tab is written
 *   as its escape, as JSON writes it, so that it shows and does nothing.
 *
 * Space at the end is dropped before the 2,000 are counted, so that blank
 * lines do not take the place of the reason above them. Blank lines at the
 * start of what is left are dropped after: `npm run` opens with one.
 */
export function endOfOutput(output: string): string {
  return output
    .replace(/\r\n?/g, '\n')
    .replace(/\u001b\[[\d;]*m/g, '')
    .replace(/[^\P{Cc}\n\t]/gu, (control) => `\\u${control.charCodeAt(0).toString(16).padStart(4, '0')}`)
    .trimEnd()
    .slice(-SHOWN)
    .replace(/^\n+/, '');
}

function firstLineWith(text: string, needle: string): string {
  const line = text.split(/\r?\n/).find((candidate) => candidate.includes(needle));
  return (line ?? needle).trim().slice(0, 200);
}

/**
 * What one run showed, against what the probe declares, with the end of the
 * command's output on a run that is neither red nor green.
 */
export function classify(spec: ProbeSpec, run: ProbeRun): Classified {
  const judged = judge(spec, run);
  return judged.outcome === 'red' || judged.outcome === 'green' ? judged : { ...judged, output: endOfOutput(run.output) };
}

function judge(spec: ProbeSpec, run: ProbeRun): Classified {
  if (run.exitCode === null) {
    const given = spec.timeout ?? 'the configured';
    return { outcome: 'timeout', detail: `stopped after ${given} ${given === 1 ? 'second' : 'seconds'}` };
  }
  if (spec.junit !== null) {
    if (run.junit === null) {
      return run.exitCode === 0
        ? { outcome: 'no-report', detail: `the command passed and wrote no ${spec.junit}` }
        : { outcome: 'wrong-failure', detail: `the command failed before writing ${spec.junit}` };
    }
    if (!run.junit.ok) return { outcome: 'no-report', detail: `${spec.junit} cannot be read: ${run.junit.error}` };
    const failing = run.junit.cases.filter((c) => c.outcome === 'failed' || c.outcome === 'errored');
    const matching = failing.filter(
      (c) =>
        (spec.test === null || `${c.classname} ${c.name}`.includes(spec.test)) &&
        (spec.signature === null || c.message.includes(spec.signature) || c.name.includes(spec.signature)),
    );
    const first = matching[0];
    if (first !== undefined) {
      return { outcome: 'red', detail: `${first.name} failed${spec.signature === null ? '' : `: ${firstLineWith(first.message, spec.signature)}`}` };
    }
    if (failing.length === 0 && run.exitCode === 0) return { outcome: 'green', detail: 'every test passed' };
    const other = failing[0];
    return {
      outcome: 'wrong-failure',
      detail: other === undefined ? `the command exited ${run.exitCode} with no failing test` : `${other.name} failed, which is not what the probe declares`,
    };
  }
  if (run.exitCode === 0) return { outcome: 'green', detail: 'the command passed' };
  const signature = spec.signature as string;
  return run.output.includes(signature)
    ? { outcome: 'red', detail: firstLineWith(run.output, signature) }
    : { outcome: 'wrong-failure', detail: `the command exited ${run.exitCode} and its output does not contain "${signature}"` };
}

export type Verdict =
  /** Red at every run where red was expected: the defect is measured. */
  | 'measured'
  /** Green at every run where green was expected: the defect is gone. */
  | 'fixed'
  /** Green where red was expected: the probe finds no defect. */
  | 'vacuous'
  /** Red where green was expected: the round did not fix it. */
  | 'still-failing'
  /** Runs disagreed with each other. */
  | 'flaky'
  /** It failed for another reason, timed out, or wrote no report: it proves nothing. */
  | 'invalid';

/** The verdict over every run of one probe, at the base (`red` expected) or the head (`green`). */
export function verdictOf(expected: 'red' | 'green', runs: readonly Classified[]): Verdict {
  const outcomes = new Set(runs.map((run) => run.outcome));
  if (outcomes.size > 1) return 'flaky';
  const only = runs[0]?.outcome;
  if (only === 'red') return expected === 'red' ? 'measured' : 'still-failing';
  if (only === 'green') return expected === 'green' ? 'fixed' : 'vacuous';
  return 'invalid';
}

export interface ProbeResult {
  readonly probe: ProbeSpec;
  readonly at: string;
  readonly commit: string;
  readonly expected: 'red' | 'green';
  readonly runs: readonly Classified[];
  readonly verdict: Verdict;
}

function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

/** The evidence a brief records: a table a reader can check, and what it was measured with. */
export function renderEvidence(results: readonly ProbeResult[], hash: string, date: string): string {
  const lines = ['| Probe | At | Runs | Verdict | Evidence |', '| --- | --- | ---: | --- | --- |'];
  for (const result of results) {
    const agreeing = result.runs.filter((run) => run.outcome === result.runs[0]?.outcome).length;
    lines.push(
      `| ${cell(result.probe.id)} | ${result.at} \`${result.commit.slice(0, 12)}\` | ${agreeing}/${result.runs.length} | ${result.verdict} | ${cell(result.runs[0]?.detail ?? '')} |`,
    );
  }
  lines.push('', `Measured ${date} by spec-harness with probes \`${hash}\`.`);
  return lines.join('\n');
}

/**
 * What a person is told, beside the table, of each result with a run that
 * proves nothing: which run, what it showed, and the end of what its command
 * printed, where the reason is. The first such run of a result speaks for the
 * rest, as the first run's evidence fills the table's cell. A result whose
 * runs are all red or green has nothing to add to its verdict.
 *
 * It is for the standard error: the table is what a brief records and what a
 * script reads, and a command's output is no part of either.
 */
export function renderUnexplained(results: readonly ProbeResult[]): string {
  return results
    .map((result) => {
      const at = result.runs.findIndex((run) => run.output !== undefined);
      const run = result.runs[at];
      if (run?.output === undefined) return '';
      const printed = run.output === '' ? 'it printed nothing' : `its output ended:\n${run.output}`;
      return `spec-harness: probe ${result.probe.id} is ${result.verdict} at ${result.at}: run ${at + 1} of ${result.runs.length}: ${run.detail}; ${printed}\n`;
    })
    .join('');
}
