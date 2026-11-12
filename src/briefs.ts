/**
 * The briefs, as spec-brief reports them, and which one a round is working on.
 *
 * spec-brief owns the brief format and its configuration (its ADR-0003), so
 * the harness reads briefs the way spec-brief does by asking it:
 * `spec-brief list --archived --format json`. This module reads that
 * document and nothing else; a shape it does not recognise is an error, never
 * a best-effort reading of half the fields (ADR-0002).
 */

import { sameId } from './branch.js';
import type { BriefProblem, BriefRow } from './types.js';

/**
 * The spec-brief JSON document versions this harness reads. Version 1 is the
 * one spec-brief 0.1.0 prints; version 2 changed only `matrix`, which the
 * harness never reads, so the `list` and `archive` documents are the same.
 */
export const SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [1, 2, 3];

export class SiblingOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SiblingOutputError';
  }
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function strings(value: unknown, where: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new SiblingOutputError(`${where} is not a list of strings`);
  }
  return value;
}

function nullableString(value: unknown, where: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new SiblingOutputError(`${where} is not a string`);
  return value;
}

/**
 * What a row says spec-brief could not read of the brief, its `problems`,
 * none where it read the whole; `undefined` where the row has no such
 * field, as a spec-brief before the field prints none, which cannot say
 * and is not read as saying none; and a refusal for one in a shape not
 * read here, since a guard that passed over it would guard what
 * spec-brief did not read.
 */
function problemsOf(value: unknown, where: string): BriefProblem[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new SiblingOutputError(`${where}.problems is not a list`);
  return value.map((item, index) => {
    const at = `${where}.problems[${index}]`;
    if (!isObject(item)) throw new SiblingOutputError(`${at} is not an object`);
    const { rule, field, line, message } = item;
    if (typeof rule !== 'string' || typeof message !== 'string' || typeof line !== 'number' || (field !== null && typeof field !== 'string')) {
      throw new SiblingOutputError(`${at} is not a rule, a field or null, a line and a message`);
    }
    return { rule, field, line, message };
  });
}

/** Reads the document `spec-brief list --format json` prints. */
export function parseBriefList(document: unknown): BriefRow[] {
  if (!isObject(document) || document['tool'] !== 'spec-brief' || document['command'] !== 'list') {
    throw new SiblingOutputError('spec-brief did not print a list document');
  }
  const version = document['schemaVersion'];
  // The list holds numbers alone, so `includes` refuses whatever is not one:
  // the `typeof` is the compiler's, and the mutant without it is equivalent.
  if (typeof version !== 'number' || !SUPPORTED_SCHEMA_VERSIONS.includes(version)) {
    throw new SiblingOutputError(
      `spec-brief printed schemaVersion ${String(version)}; this harness reads ${SUPPORTED_SCHEMA_VERSIONS.join(', ')}`,
    );
  }
  const briefs = document['briefs'];
  if (!Array.isArray(briefs)) throw new SiblingOutputError('spec-brief list has no "briefs"');
  return briefs.map((row, index) => {
    const where = `briefs[${index}]`;
    if (!isObject(row)) throw new SiblingOutputError(`${where} is not an object`);
    const id = row['id'];
    const file = row['file'];
    if (typeof id !== 'string' || typeof file !== 'string') throw new SiblingOutputError(`${where} has no id or file`);
    const phase = row['phase'];
    if (phase !== 'live' && phase !== 'archived') throw new SiblingOutputError(`${where}.phase is "${String(phase)}"`);
    const tasks = row['tasks'];
    const wave = row['wave'];
    const problems = problemsOf(row['problems'], where);
    return {
      id,
      file,
      title: nullableString(row['title'], `${where}.title`),
      phase,
      status: nullableString(row['status'], `${where}.status`),
      type: nullableString(row['type'], `${where}.type`),
      wave: typeof wave === 'number' ? wave : null,
      dependsOn: strings(row['dependsOn'] ?? [], `${where}.dependsOn`),
      affectedFiles: strings(row['affectedFiles'] ?? [], `${where}.affectedFiles`),
      protectedFiles: strings(row['protectedFiles'] ?? [], `${where}.protectedFiles`),
      tasks: {
        total: isObject(tasks) && typeof tasks['total'] === 'number' ? tasks['total'] : 0,
        checked: isObject(tasks) && typeof tasks['checked'] === 'number' ? tasks['checked'] : 0,
      },
      ready: row['ready'] === true,
      waitingOn: strings(row['waitingOn'] ?? [], `${where}.waitingOn`),
      ...(problems === undefined ? {} : { problems }),
    };
  });
}

/**
 * A file a `list` answer was read from, by the SHA-256 of its bytes in hex;
 * or `null` where spec-brief looked for it and found none, which is then to
 * be found none again.
 */
export interface InputFile {
  readonly path: string;
  readonly sha256: string | null;
}

/**
 * A directory whose files a `list` answer was read from, by their names:
 * entries that are files, as spec-brief lists them; or `null` where
 * spec-brief looked for the directory and found none, which is then to be
 * found none again.
 */
export interface InputDirectory {
  readonly path: string;
  readonly entries: readonly string[] | null;
}

/**
 * Everything a `list` answer was read from, as spec-brief lists it: its
 * version, the files and directories it read, and what git read for it, the
 * index and the ignore files, or `null` where it asked git nothing. A path
 * is relative to the work tree and POSIX, or absolute where git names a
 * file outside it (spec-core ADR-0005, amended 2026-10-19).
 */
export interface BriefInputs {
  readonly tool: string;
  readonly files: readonly InputFile[];
  readonly directories: readonly InputDirectory[];
  readonly git: { readonly index: string | null; readonly ignores: readonly InputFile[] } | null;
}

const DIGEST = /^[0-9a-f]{64}$/;

function inputPath(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function digestOf(value: unknown): string | null | undefined {
  return value === null || (typeof value === 'string' && DIGEST.test(value)) ? value : undefined;
}

function inputFiles(value: unknown): InputFile[] | null {
  if (!Array.isArray(value)) return null;
  const files: InputFile[] = [];
  for (const item of value) {
    if (!isObject(item) || !inputPath(item['path'])) return null;
    const sha256 = digestOf(item['sha256']);
    if (sha256 === undefined) return null;
    files.push({ path: item['path'], sha256 });
  }
  return files;
}

function inputDirectories(value: unknown): InputDirectory[] | null {
  if (!Array.isArray(value)) return null;
  const directories: InputDirectory[] = [];
  for (const item of value) {
    if (!isObject(item) || !inputPath(item['path'])) return null;
    const entries = item['entries'];
    // A name listed twice is a list that is not of one directory's files.
    if (entries !== null && (!Array.isArray(entries) || !entries.every((entry) => typeof entry === 'string') || new Set(entries).size !== entries.length)) return null;
    directories.push({ path: item['path'], entries });
  }
  return directories;
}

/**
 * What a `list` document says its answer was read from, where it may be
 * given again; `null` where it lists nothing, where `keep` is anything but
 * `true`, where it names nothing, and where anything on it is in a form not
 * read here. Each is a doubt, and a doubt starts spec-brief as before
 * (ADR-0002). The rows are `parseBriefList`'s to read, whatever this
 * answers: a list this cannot read keeps an answer from being given again,
 * and changes nothing of it.
 */
export function inputsOf(document: unknown): BriefInputs | null {
  if (!isObject(document)) return null;
  const inputs = document['inputs'];
  if (!isObject(inputs) || inputs['keep'] !== true || typeof inputs['tool'] !== 'string') return null;
  const files = inputFiles(inputs['files']);
  const directories = inputDirectories(inputs['directories']);
  const git = inputs['git'];
  let asked: BriefInputs['git'];
  if (git === null) {
    asked = null;
  } else {
    if (!isObject(git)) return null;
    const index = digestOf(git['index']);
    const ignores = inputFiles(git['ignores']);
    if (index === undefined || ignores === null) return null;
    asked = { index, ignores };
  }
  // A list that names nothing is an answer that cannot be told from one that
  // was read from nowhere.
  if (files === null || directories === null || files.length + directories.length === 0) return null;
  return { tool: inputs['tool'], files, directories, git: asked };
}

/**
 * How the active brief was named, for messages. An argument is the id a
 * command takes after its name, or a tool call's `brief`: said to be the
 * flag's, it sent a person looking for a `--brief` nobody had typed.
 */
export type ActiveSource = 'argument' | 'flag' | 'environment' | 'branch';

export type ActiveBrief =
  | { readonly kind: 'found'; readonly brief: BriefRow; readonly source: ActiveSource }
  | { readonly kind: 'none'; readonly reason: string }
  | { readonly kind: 'unknown'; readonly id: string; readonly source: ActiveSource }
  | { readonly kind: 'archived'; readonly brief: BriefRow; readonly source: ActiveSource };

/**
 * The brief a round is working on: named by an argument, by a flag, by
 * `SPEC_BRIEF`, or by the branch - never guessed from which brief happens to
 * be the only active one (ADR-0004).
 */
export function findActive(
  briefs: readonly BriefRow[],
  named: {
    readonly argument?: string | undefined;
    readonly flag?: string | undefined;
    readonly environment?: string | undefined;
    readonly branch?: string | null | undefined;
  },
): ActiveBrief {
  const pick = (id: string, source: ActiveSource): ActiveBrief => {
    const matches = briefs.filter((brief) => sameId(brief.id, id));
    const live = matches.find((brief) => brief.phase === 'live');
    if (live !== undefined) return { kind: 'found', brief: live, source };
    const archived = matches[0];
    if (archived !== undefined) return { kind: 'archived', brief: archived, source };
    return { kind: 'unknown', id, source };
  };
  if (named.argument !== undefined && named.argument.trim() !== '') return pick(named.argument.trim(), 'argument');
  if (named.flag !== undefined && named.flag.trim() !== '') return pick(named.flag.trim(), 'flag');
  if (named.environment !== undefined && named.environment.trim() !== '') return pick(named.environment.trim(), 'environment');
  if (named.branch !== undefined && named.branch !== null) return pick(named.branch, 'branch');
  return {
    kind: 'none',
    reason: 'no brief is named: pass --brief <id>, set SPEC_BRIEF, or work on a branch named like brief/<id>-<topic>',
  };
}
