/**
 * The commands that read a round: context, audit, escalate, rule, rulings
 * and probe. Each resolves the brief, asks `round.ts` for the facts and
 * prints them; exit codes follow the family contract.
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { describeMeasured } from './audit.js';
import { briefIdFromBranch } from './branch.js';
import { findActive } from './briefs.js';
import { formatFindings } from './formats.js';
import { isDirectory, isFile } from './fs.js';
import { readJUnit, type JUnitRead } from './junit.js';
import { classify, endOfOutput, readProbes, renderEvidence, renderUnexplained, verdictOf, type ProbeResult, type ProbeSpec } from './probe.js';
import { createReader } from './reader.js';
import {
  buildContext,
  checkRulings,
  briefText,
  listEscalations,
  raiseEscalation,
  recordRuling,
  resolveBase,
  runAudit,
} from './round.js';
import { renderMemo, type EscalationOption } from './rulings.js';
import { runCommand, withWorktree } from './sandbox.js';
import type { BriefRow, Finding } from './types.js';
import {
  describeActive,
  EXIT_ERROR,
  EXIT_FAILED,
  EXIT_OK,
  json,
  UsageError,
  version,
  type CliIO,
  type Options,
  type Workspace,
  openWorkspace,
} from './workspace.js';

const reader = createReader();

/**
 * The brief a command acts on: a positional id, else the active one. A
 * command that needs one and has none is a usage error. The command line
 * refuses the id beside `--brief` before it gets here (usage.ts).
 */
export async function targetBrief(workspace: Workspace, options: Options, io: CliIO, positional: string | undefined): Promise<{ brief: BriefRow; briefs: BriefRow[] }> {
  const briefs = await workspace.siblings.briefs();
  const fromBranch = briefIdFromBranch(workspace.config.branches, workspace.branch);
  const active = findActive(briefs, { argument: positional, flag: options.brief, environment: io.env['SPEC_BRIEF'], branch: fromBranch });
  const { brief, note, problem } = describeActive(active);
  if (problem !== null) throw new UsageError(problem);
  if (brief === null) throw new UsageError(note);
  return { brief, briefs };
}

const MARK: Record<Finding['severity'], string> = { error: 'error  ', warning: 'warning', note: 'note   ' };

function printFindings(io: CliIO, findings: readonly Finding[]): void {
  for (const finding of findings) {
    const where = finding.file === undefined ? '' : `${finding.file}${finding.line === undefined ? '' : `:${finding.line}`}  `;
    io.stdout.write(`${MARK[finding.severity]}  ${where}${finding.message}  ${finding.rule}\n         ${finding.hint}\n`);
  }
}

/* ----------------------------------------------------------------- context */

export async function contextCommand(options: Options, io: CliIO): Promise<number> {
  const workspace = await openWorkspace(options, io);
  const { brief, briefs } = await targetBrief(workspace, options, io, options.positionals[0]);
  const packet = await buildContext(workspace, brief, briefs, reader, options.base);
  if (options.format === 'json') {
    io.stdout.write(
      json('context', {
        brief: brief.id,
        markdown: packet.markdown,
        included: packet.included,
        omitted: packet.omitted,
        unresolved: packet.unresolved,
        unclosedFrontMatter: packet.unclosedFrontMatter,
        unreadableFrontMatter: packet.unreadableFrontMatter,
        unreadableScope: packet.unreadableScope,
        unreadableProtections: packet.unreadableProtections,
        unreadableRulingPaths: packet.unreadableRulingPaths,
        unmatchedSpecs: packet.unmatchedSpecs,
      }),
    );
  } else {
    io.stdout.write(packet.markdown);
  }
  return EXIT_OK;
}

/* ------------------------------------------------------------------- audit */

export async function auditCommand(options: Options, io: CliIO): Promise<number> {
  const workspace = await openWorkspace(options, io);
  const { brief } = await targetBrief(workspace, options, io, options.positionals[0]);
  const result = await runAudit(workspace, brief, reader, options.base);
  const { counts, findings, measured } = result.report;
  if (options.format === 'json') {
    io.stdout.write(
      json('audit', {
        ok: counts.error === 0 && (!options.strict || counts.warning === 0),
        brief: brief.id,
        base: result.base.kind === 'resolved' ? { ref: result.base.ref, mergeBase: result.base.mergeBase, head: result.base.head } : null,
        counts,
        measured,
        findings,
        dependencies: result.dependencies,
        installScripts: result.installScripts,
      }),
    );
  } else if (options.format === 'pretty') {
    io.stdout.write(`audit of brief ${brief.id}${result.base.kind === 'resolved' ? ` from ${result.base.ref} (${result.base.mergeBase.slice(0, 12)})` : ''}\n\n`);
    printFindings(io, findings);
    // The counts stay the last line, where a script reads them.
    io.stdout.write(`\n${describeMeasured(measured)}\n${counts.error} error(s), ${counts.warning} warning(s), ${counts.note} note(s)\n`);
  } else {
    io.stdout.write(formatFindings(options.format, findings, { file: brief.file, version: version(), summary: describeMeasured(measured) }));
  }
  return counts.error > 0 || (options.strict && counts.warning > 0) ? EXIT_FAILED : EXIT_OK;
}

/* -------------------------------------------------------------- escalation */

function parseOption(raw: string): EscalationOption {
  const colon = raw.indexOf(':');
  const option = colon < 0 ? { label: raw.trim(), consequence: '' } : { label: raw.slice(0, colon).trim(), consequence: raw.slice(colon + 1).trim() };
  // An option given nothing was refused where the command line was read, so
  // this one has a colon and nothing before it: a cost, and no choice it is
  // the cost of. The memo would number a choice with no name.
  if (option.label === '') throw new UsageError(`--option is ${JSON.stringify(raw)}, which names no choice before its colon; give it "<label>: <cost>"`);
  return option;
}

export async function escalateCommand(options: Options, io: CliIO): Promise<number> {
  const workspace = await openWorkspace(options, io);
  if (options.list) {
    const waiting = await listEscalations(workspace);
    if (options.format === 'json') io.stdout.write(json('escalate', { waiting }));
    else if (waiting.length === 0) io.stdout.write('no escalation is waiting\n');
    else for (const request of waiting) io.stdout.write(`${request.id}  brief ${request.brief}  ${request.paths.join(', ')}  ${request.reason.split('\n')[0]}\n`);
    return EXIT_OK;
  }
  if (options.show !== undefined) {
    const request = (await listEscalations(workspace)).find((candidate) => candidate.id === options.show);
    if (request === undefined) throw new UsageError(`no escalation "${options.show}" is waiting`);
    io.stdout.write(options.format === 'json' ? json('escalate', { request }) : renderMemo(request));
    return EXIT_OK;
  }
  if (options.paths.length === 0 || options.reason === undefined) {
    throw new UsageError('escalate needs --path <file> (repeatable) and --reason <why>; or --list, or --show <id>');
  }
  // Read before spec-brief is asked anything: a request that cannot be
  // written is refused for what is wrong with it, whatever the brief.
  const choices = options.options.map(parseOption);
  const { brief } = await targetBrief(workspace, options, io, undefined);
  const { request, memo } = await raiseEscalation(workspace, brief, {
    paths: options.paths,
    reason: options.reason,
    options: choices,
    recommendation: options.recommend ?? null,
  });
  io.stdout.write(options.format === 'json' ? json('escalate', { request, memo }) : memo);
  // Exit 1: the round is waiting on a person, which a caller must not read as done.
  return EXIT_FAILED;
}

export async function ruleCommand(options: Options, io: CliIO): Promise<number> {
  const id = options.positionals[0];
  if (id === undefined) throw new UsageError('rule needs the escalation id, such as E-012-1');
  if (options.allow === options.deny) throw new UsageError('rule needs exactly one of --allow or --deny');
  if (options.note === undefined || options.note.trim() === '') throw new UsageError('rule needs --note: what exactly is allowed, or why not');
  const workspace = await openWorkspace(options, io);
  const recorded = await recordRuling(workspace, id, options.allow ? 'allow' : 'deny', options.note, reader);
  const command = `git commit -S -m "ruling ${recorded.id}: ${options.allow ? 'allow' : 'deny'}" -- ${recorded.file}`;
  if (options.format === 'json') {
    io.stdout.write(json('rule', { ruling: recorded.id, file: recorded.file, row: recorded.row, commit: command }));
  } else {
    io.stdout.write(`${recorded.file} now holds ruling ${recorded.id}:\n\n  ${recorded.row}\n\nIt counts once you commit it signed, with a key the base branch's allowed signers list:\n\n  ${command}\n`);
  }
  return EXIT_OK;
}

export async function rulingsCommand(options: Options, io: CliIO): Promise<number> {
  const workspace = await openWorkspace(options, io);
  const { brief } = await targetBrief(workspace, options, io, options.positionals[0]);
  const base = await resolveBase(workspace, options.base);
  const check = await checkRulings(workspace, brief, await briefText(workspace, brief), reader, base);
  if (options.format === 'json') {
    io.stdout.write(json('rulings', { brief: brief.id, rows: check.rows, verified: check.verified, unverified: check.unverified, problems: check.problems }));
  } else {
    if (check.rows.length === 0) io.stdout.write(`brief ${brief.id} holds no ruling\n`);
    for (const row of check.rows) {
      const verified = check.verified.find((ruling) => ruling.id === row.id);
      const unverified = check.unverified.find((ruling) => ruling.id === row.id);
      // An allow row that does not verify is among the unverified, with its
      // reason, so the fallback for none is equivalent to its mutants.
      const state = row.decision === 'deny' ? 'refused' : verified !== undefined ? `signed by ${verified.signer}` : `not verified: ${unverified?.reason ?? ''}`;
      io.stdout.write(`${row.id}  ${row.decision}  ${row.paths.join(', ')}  ${state}\n`);
    }
    printFindings(io, check.problems);
  }
  return check.unverified.length > 0 || check.problems.length > 0 ? EXIT_FAILED : EXIT_OK;
}

/* ------------------------------------------------------------------- probe */

/**
 * What is said of a command answered with its output still held, three
 * seconds after its shell ended or after its timeout: of a run, in its
 * evidence, and of a `setup`, in why the probe stopped or, where the setup
 * passed, in a line of its own. What holds the output is no part of the
 * command and was not stopped with it. What the sandbox can reach of it is
 * stopped when the probe is done at that commit; the rest runs on until it
 * ends or a person ends it, and the person is the one who can find it
 * (ADR-0003).
 */
const LEFT_RUNNING = ', and something it started was left running, holding its output';

/**
 * What is read of a probe's report where a directory stands under its name,
 * as a repository can hold one: no report, said in the probe's own words
 * for one it cannot read. Taken away as a file or read as one, it ended the
 * command on Node's EISDIR and a stack.
 */
const A_DIRECTORY: JUnitRead = { ok: false, error: 'it is a directory, not a report' };

/**
 * The same where something that is neither stands there, as a named pipe the
 * probe's command made: opened, it was read without end (ADR-0002).
 */
const NOT_A_FILE: JUnitRead = { ok: false, error: 'it is neither a file nor a directory, not a report' };

async function runProbe(directory: string, probe: ProbeSpec, runs: number, timeout: number): Promise<ProbeResult['runs']> {
  const classified = [];
  for (let i = 0; i < runs; i += 1) {
    const report = probe.junit === null ? null : join(directory, probe.junit);
    // A report an earlier run left is taken away, so that what is read
    // after this run is this run's. A directory is none, and is left.
    if (report !== null && !isDirectory(report)) await rm(report, { force: true });
    const run = await runCommand(probe.run, directory, timeout);
    // existsSync answers false for null, so the null check is there for the
    // type, and its mutant is equivalent.
    const junit = report === null || !existsSync(report) ? null : isDirectory(report) ? A_DIRECTORY : !isFile(report) ? NOT_A_FILE : readJUnit(await readFile(report, 'utf8'));
    const judged = classify(probe, { exitCode: run.exitCode, output: run.output, junit });
    // After whatever `classify` says of the run: red, green or stopped, it
    // is judged by its shell, and what it left is said beside the verdict.
    classified.push(run.outputHeld ? { ...judged, detail: `${judged.detail}${LEFT_RUNNING}` } : judged);
  }
  return classified;
}

export async function probeCommand(options: Options, io: CliIO): Promise<number> {
  const workspace = await openWorkspace(options, io);
  const { brief } = await targetBrief(workspace, options, io, options.positionals[0]);
  const text = await briefText(workspace, brief);
  const set = readProbes(reader.codeBlocks(text));
  if (set.problems.length > 0) {
    for (const problem of set.problems) io.stderr.write(`spec-harness: ${brief.file}:${problem.line}: ${problem.message}\n`);
    return EXIT_ERROR;
  }
  const probes = set.probes.filter((probe) => options.id === undefined || probe.id === options.id);
  if (probes.length === 0) {
    io.stdout.write(`brief ${brief.id} declares no probe${options.id === undefined ? '' : ` named ${options.id}`}\n`);
    return options.id === undefined ? EXIT_OK : EXIT_ERROR;
  }
  const base = await resolveBase(workspace, options.base);
  if (base.kind === 'unresolved') throw new UsageError(base.reason);
  const at = options.at ?? (base.mergeBase === base.head ? 'base' : 'both');
  const results: ProbeResult[] = [];
  const measure = async (label: 'base' | 'head', commit: string, expected: 'red' | 'green'): Promise<void> => {
    await withWorktree(workspace.root, commit, async (directory) => {
      for (const file of set.files) {
        await mkdir(dirname(join(directory, file.path)), { recursive: true });
        await writeFile(join(directory, file.path), file.content.endsWith('\n') ? file.content : `${file.content}\n`);
      }
      const setups = [...new Set(probes.map((probe) => probe.setup).filter((setup): setup is string => setup !== null))];
      for (const setup of setups) {
        const timeout = workspace.config.probes.timeout;
        const run = await runCommand(setup, directory, timeout);
        // A setup stopped at its timeout has no exit code to have failed by,
        // and may have printed nothing: how long it was given is the reason.
        const how = run.exitCode === null ? `was stopped after ${timeout} ${timeout === 1 ? 'second' : 'seconds'}` : 'failed';
        if (run.exitCode !== 0) throw new UsageError(`the probe setup "${setup}" ${how} at ${label}${run.outputHeld ? LEFT_RUNNING : ''}:\n${endOfOutput(run.output)}`);
        // A setup that passed says nothing else, and the runs after it start
        // beside what it left: on the standard error, whatever the format,
        // since the document has no place for a setup.
        if (run.outputHeld) io.stderr.write(`spec-harness: the probe setup "${setup}" passed at ${label}${LEFT_RUNNING}\n`);
      }
      for (const probe of probes) {
        const runs = await runProbe(directory, probe, probe.runs ?? workspace.config.probes.runs, probe.timeout ?? workspace.config.probes.timeout);
        results.push({ probe, at: label, commit, expected, runs, verdict: verdictOf(expected, runs) });
      }
    });
  };
  if (at === 'base' || at === 'both') await measure('base', base.mergeBase, 'red');
  if (at === 'head' || at === 'both') await measure('head', base.head, 'green');
  const evidence = renderEvidence(results, set.hash, new Date().toISOString().slice(0, 10));
  const failed = results.filter((result) => result.verdict !== (result.expected === 'red' ? 'measured' : 'fixed'));
  if (options.format === 'json') {
    io.stdout.write(
      json('probe', {
        ok: failed.length === 0,
        brief: brief.id,
        hash: set.hash,
        results: results.map((result) => ({ id: result.probe.id, at: result.at, commit: result.commit, expected: result.expected, verdict: result.verdict, runs: result.runs })),
        evidence,
      }),
    );
  } else {
    io.stdout.write(`${evidence}\n`);
    // On the standard error, beside the table and never in it: the table is
    // what a brief records and a script reads. The JSON document has the
    // same as a field of each such run, and so says nothing here.
    io.stderr.write(renderUnexplained(results));
  }
  return failed.length === 0 ? EXIT_OK : EXIT_FAILED;
}
