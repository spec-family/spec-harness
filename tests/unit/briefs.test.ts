import { describe, expect, it } from 'vitest';

import { findActive, inputsOf, parseBriefList, SiblingOutputError, SUPPORTED_SCHEMA_VERSIONS } from '../../src/briefs.js';
import { row } from './helpers.js';

function document(briefs: unknown[], overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { tool: 'spec-brief', version: '0.1.0', schemaVersion: 2, command: 'list', ok: true, briefs, ...overrides };
}

const FULL = {
  id: '012',
  file: 'briefs/012_rotate.md',
  title: '012 - Rotate',
  phase: 'live',
  status: 'active',
  type: 'defect',
  wave: 2,
  dependsOn: ['7'],
  affectedFiles: ['src/auth/**'],
  protectedFiles: ['src/db/schema.ts'],
  tasks: { total: 3, checked: 1 },
  ready: false,
  waitingOn: ['7'],
};

function refusal(value: unknown): string {
  try {
    parseBriefList(value);
  } catch (error) {
    expect(error).toBeInstanceOf(SiblingOutputError);
    expect((error as Error).name).toBe('SiblingOutputError');
    return (error as Error).message;
  }
  throw new Error('parseBriefList accepted the document');
}

describe('spec-brief list documents', () => {
  it('reads every field of a row', () => {
    expect(parseBriefList(document([FULL]))).toEqual([FULL]);
  });

  it('reads every schema version it knows: 1 from spec-brief 0.1.0, and 2 and 3', () => {
    expect(SUPPORTED_SCHEMA_VERSIONS).toEqual([1, 2, 3]);
    for (const schemaVersion of [1, 2, 3]) expect(parseBriefList(document([FULL], { schemaVersion }))).toHaveLength(1);
  });

  it('refuses a schema version it does not know, rather than half-reading it', () => {
    expect(refusal(document([FULL], { schemaVersion: 4 }))).toBe('spec-brief printed schemaVersion 4; this harness reads 1, 2, 3');
    expect(refusal(document([FULL], { schemaVersion: 0 }))).toContain('schemaVersion 0');
    expect(refusal(document([FULL], { schemaVersion: '2' }))).toContain('schemaVersion 2;');
    expect(refusal(document([FULL], { schemaVersion: undefined }))).toContain('schemaVersion undefined');
  });

  it('refuses what is not a list document from spec-brief', () => {
    const message = 'spec-brief did not print a list document';
    expect(refusal(null)).toBe(message);
    expect(refusal([FULL])).toBe(message);
    expect(refusal('text')).toBe(message);
    expect(refusal(document([FULL], { tool: 'spec-guard' }))).toBe(message);
    expect(refusal(document([FULL], { command: 'lint' }))).toBe(message);
    expect(refusal(document([FULL], { briefs: {} }))).toBe('spec-brief list has no "briefs"');
  });

  it('refuses a row of the wrong shape, naming it', () => {
    expect(refusal(document([FULL, 'x']))).toBe('briefs[1] is not an object');
    expect(refusal(document([[FULL]]))).toBe('briefs[0] is not an object');
    expect(refusal(document([{ ...FULL, id: 12 }]))).toBe('briefs[0] has no id or file');
    expect(refusal(document([{ ...FULL, file: undefined }]))).toBe('briefs[0] has no id or file');
    expect(refusal(document([{ ...FULL, phase: 'done' }]))).toBe('briefs[0].phase is "done"');
    expect(refusal(document([{ ...FULL, title: 3 }]))).toBe('briefs[0].title is not a string');
    expect(refusal(document([{ ...FULL, status: false }]))).toBe('briefs[0].status is not a string');
    expect(refusal(document([{ ...FULL, type: {} }]))).toBe('briefs[0].type is not a string');
    expect(refusal(document([{ ...FULL, dependsOn: '7' }]))).toBe('briefs[0].dependsOn is not a list of strings');
    expect(refusal(document([{ ...FULL, affectedFiles: [1] }]))).toBe('briefs[0].affectedFiles is not a list of strings');
    expect(refusal(document([{ ...FULL, protectedFiles: 'src/**' }]))).toBe('briefs[0].protectedFiles is not a list of strings');
    expect(refusal(document([{ ...FULL, waitingOn: [null] }]))).toBe('briefs[0].waitingOn is not a list of strings');
  });

  it('fills what a row leaves out with the empty reading, never a guess', () => {
    const [read] = parseBriefList(document([{ id: '1', file: 'briefs/001.md', phase: 'archived' }]));
    expect(read).toEqual({
      id: '1',
      file: 'briefs/001.md',
      title: null,
      phase: 'archived',
      status: null,
      type: null,
      wave: null,
      dependsOn: [],
      affectedFiles: [],
      protectedFiles: [],
      tasks: { total: 0, checked: 0 },
      ready: false,
      waitingOn: [],
    });
  });

  it('reads what spec-brief could not read of a brief, and nothing where it says nothing', () => {
    const problems = [
      { rule: 'field', field: 'protectedFiles', line: 6, message: '"protectedFiles" is an inline list with no closing ]' },
      { rule: 'encoding', field: null, line: 1, message: 'the brief is UTF-16' },
    ];
    expect(parseBriefList(document([{ ...FULL, problems }]))).toEqual([{ ...FULL, problems }]);
    // Read whole, and a spec-brief that cannot say, are told apart.
    expect(parseBriefList(document([{ ...FULL, problems: [] }]))).toEqual([{ ...FULL, problems: [] }]);
    expect(parseBriefList(document([FULL]))[0]).not.toHaveProperty('problems');
    expect(refusal(document([{ ...FULL, problems: {} }]))).toBe('briefs[0].problems is not a list');
    expect(refusal(document([{ ...FULL, problems: ['x'] }]))).toBe('briefs[0].problems[0] is not an object');
    const shape = 'briefs[0].problems[0] is not a rule, a field or null, a line and a message';
    for (const bad of [{ ...problems[0], rule: 1 }, { ...problems[0], field: 2 }, { ...problems[0], line: '6' }, { ...problems[0], message: null }, { rule: 'field', line: 1, message: 'm' }]) {
      expect(refusal(document([{ ...FULL, problems: [bad] }])), JSON.stringify(bad)).toBe(shape);
    }
  });

  it('reads a wave, tasks and readiness only when they have their types', () => {
    const [read] = parseBriefList(
      document([{ ...FULL, wave: '2', tasks: { total: '3', checked: 1 }, ready: 'yes', title: null }]),
    );
    expect(read?.wave).toBeNull();
    expect(read?.tasks).toEqual({ total: 0, checked: 1 });
    expect(read?.ready).toBe(false);
    expect(read?.title).toBeNull();
    const [counted] = parseBriefList(document([{ ...FULL, tasks: { total: 3, checked: '1' } }]));
    expect(counted?.tasks).toEqual({ total: 3, checked: 0 });
    const [other] = parseBriefList(document([{ ...FULL, tasks: [3, 1], ready: true }]));
    expect(other?.tasks).toEqual({ total: 0, checked: 0 });
    expect(other?.ready).toBe(true);
  });
});

describe('the active brief', () => {
  const live = row({ id: '012' });
  const other = row({ id: '013', file: 'briefs/013_x.md' });
  const archived = row({ id: '007', file: 'briefs/archive/007_x.md', phase: 'archived' });
  const briefs = [live, other, archived];

  it('is named by the flag first, then the environment, then the branch', () => {
    expect(findActive(briefs, { flag: '012', environment: '013', branch: '007' })).toEqual({ kind: 'found', brief: live, source: 'flag' });
    expect(findActive(briefs, { environment: '013', branch: '012' })).toEqual({ kind: 'found', brief: other, source: 'environment' });
    expect(findActive(briefs, { branch: '013' })).toEqual({ kind: 'found', brief: other, source: 'branch' });
  });

  it('is named by an argument before all of them, and says so, where it was said to be the flag', () => {
    // A command's own argument, `audit 012`, or a tool call's `brief`.
    expect(findActive(briefs, { argument: '012', flag: '013', environment: '013', branch: '007' })).toEqual({ kind: 'found', brief: live, source: 'argument' });
    expect(findActive(briefs, { argument: ' 13 ', branch: '012' })).toEqual({ kind: 'found', brief: other, source: 'argument' });
    expect(findActive(briefs, { argument: '99', flag: '012' })).toEqual({ kind: 'unknown', id: '99', source: 'argument' });
    expect(findActive(briefs, { argument: '7' })).toEqual({ kind: 'archived', brief: archived, source: 'argument' });
    // One that names nothing is passed over here; the command line and the server refuse it before.
    expect(findActive(briefs, { argument: ' ', flag: '013' })).toEqual({ kind: 'found', brief: other, source: 'flag' });
    expect(findActive(briefs, { argument: '', branch: '012' })).toEqual({ kind: 'found', brief: live, source: 'branch' });
    expect(findActive(briefs, { argument: undefined, environment: '013' })).toEqual({ kind: 'found', brief: other, source: 'environment' });
  });

  it('skips a flag or an environment that names nothing, and trims what they name', () => {
    expect(findActive(briefs, { flag: '  ', environment: ' 013 ' })).toEqual({ kind: 'found', brief: other, source: 'environment' });
    expect(findActive(briefs, { flag: '', environment: '', branch: '012' })).toEqual({ kind: 'found', brief: live, source: 'branch' });
    expect(findActive(briefs, { environment: '   ', branch: '013' })).toEqual({ kind: 'found', brief: other, source: 'branch' });
    expect(findActive(briefs, { flag: ' 12 ' })).toEqual({ kind: 'found', brief: live, source: 'flag' });
  });

  it('never falls back when the name it has finds nothing', () => {
    // A flag naming a brief that does not exist is a mistake to fix, not a
    // reason to guard against another brief's contract.
    expect(findActive(briefs, { flag: '99', environment: '012', branch: '012' })).toEqual({ kind: 'unknown', id: '99', source: 'flag' });
    expect(findActive(briefs, { environment: 'x', branch: '012' })).toEqual({ kind: 'unknown', id: 'x', source: 'environment' });
    expect(findActive(briefs, { branch: '98' })).toEqual({ kind: 'unknown', id: '98', source: 'branch' });
  });

  it('compares ids as numbers when both are digits', () => {
    expect(findActive(briefs, { branch: '12' })).toMatchObject({ kind: 'found', brief: live });
    expect(findActive(briefs, { branch: '7' })).toMatchObject({ kind: 'archived', brief: archived });
  });

  it('reports an archived brief as archived, and prefers the live one of two', () => {
    expect(findActive(briefs, { flag: '007' })).toEqual({ kind: 'archived', brief: archived, source: 'flag' });
    const reopened = row({ id: '7', file: 'briefs/007_x.md' });
    expect(findActive([archived, reopened], { flag: '7' })).toEqual({ kind: 'found', brief: reopened, source: 'flag' });
  });

  it('is none, with the ways to name one, when nothing names a brief', () => {
    const none = findActive(briefs, {});
    expect(none.kind).toBe('none');
    expect(none).toEqual({
      kind: 'none',
      reason: 'no brief is named: pass --brief <id>, set SPEC_BRIEF, or work on a branch named like brief/<id>-<topic>',
    });
    expect(findActive(briefs, { branch: null })).toEqual(none);
    expect(findActive([live], { flag: undefined, environment: undefined, branch: undefined }).kind).toBe('none');
  });

  it('never guesses from a single live brief', () => {
    expect(findActive([live], {}).kind).toBe('none');
  });
});

describe('what a list answer was read from', () => {
  const A = 'a'.repeat(64);
  const B = '0123456789abcdef'.repeat(4);
  const INPUTS = {
    keep: true,
    tool: '0.10.0',
    files: [
      { path: '.spec-brief.json', sha256: A },
      { path: 'spec-brief.json', sha256: null },
    ],
    directories: [{ path: 'briefs', entries: ['001_a.md', 'README.md'] }],
    git: { index: B, ignores: [{ path: '.gitignore', sha256: null }, { path: 'C:/repo/.git/info/exclude', sha256: A }] },
  };
  const of = (inputs: unknown): unknown => inputsOf(document([FULL], { inputs }));

  it('reads every input it lists, and git as not asked where it says so', () => {
    expect(of(INPUTS)).toEqual({ tool: '0.10.0', files: INPUTS.files, directories: INPUTS.directories, git: INPUTS.git });
    expect(of({ ...INPUTS, git: null })).toEqual({ tool: '0.10.0', files: INPUTS.files, directories: INPUTS.directories, git: null });
    expect(of({ ...INPUTS, git: { index: null, ignores: [] } })).toMatchObject({ git: { index: null, ignores: [] } });
    // A list of files alone, or of directories alone, names something.
    expect(of({ ...INPUTS, directories: [] })).toMatchObject({ files: INPUTS.files, directories: [] });
    expect(of({ ...INPUTS, files: [] })).toMatchObject({ files: [], directories: INPUTS.directories });
    expect(of({ ...INPUTS, directories: [{ path: 'briefs', entries: [] }], files: [] })).toMatchObject({ directories: [{ path: 'briefs', entries: [] }] });
    // As many files as directories names something too.
    expect(of({ ...INPUTS, files: [INPUTS.files[0]], directories: INPUTS.directories })).toMatchObject({ files: [INPUTS.files[0]] });
    // A directory looked for and not found is listed with no entries, and must stay so.
    expect(of({ ...INPUTS, directories: [{ path: 'briefs/archive', entries: null }] })).toMatchObject({ directories: [{ path: 'briefs/archive', entries: null }] });
  });

  it('is none where the answer may not be kept: no inputs, keep anything but true, no version', () => {
    expect(inputsOf(document([FULL]))).toBeNull();
    expect(inputsOf(null)).toBeNull();
    expect(inputsOf([INPUTS])).toBeNull();
    for (const inputs of [null, [], 'inputs', { ...INPUTS, keep: false }, { ...INPUTS, keep: 'true' }, { ...INPUTS, keep: 1 }, { ...INPUTS, keep: undefined }, { ...INPUTS, tool: undefined }, { ...INPUTS, tool: 10 }]) {
      expect(of(inputs), JSON.stringify(inputs)).toBeNull();
    }
  });

  it('is none for a list that names nothing, whether or not git was asked', () => {
    expect(of({ ...INPUTS, files: [], directories: [] })).toBeNull();
    expect(of({ ...INPUTS, files: [], directories: [], git: null })).toBeNull();
  });

  it('is none for anything on the list in a form not read here', () => {
    const wrong: unknown[] = [
      { ...INPUTS, files: undefined },
      { ...INPUTS, files: {} },
      { ...INPUTS, files: ['.spec-brief.json'] },
      { ...INPUTS, files: [{ sha256: A }] },
      { ...INPUTS, files: [{ path: '', sha256: A }] },
      { ...INPUTS, files: [{ path: 7, sha256: A }] },
      { ...INPUTS, files: [{ path: 'a' }] },
      { ...INPUTS, files: [{ path: 'a', sha256: A.toUpperCase() }] },
      { ...INPUTS, files: [{ path: 'a', sha256: A.slice(1) }] },
      { ...INPUTS, files: [{ path: 'a', sha256: `${A}0` }] },
      { ...INPUTS, files: [{ path: 'a', sha256: `${A.slice(1)}g` }] },
      { ...INPUTS, files: [{ path: 'a', sha256: `x${A}` }] },
      { ...INPUTS, files: [{ path: 'a', sha256: 0 }] },
      { ...INPUTS, files: [{ path: 'a', sha256: [A] }] },
      { ...INPUTS, directories: undefined },
      { ...INPUTS, directories: [{ entries: [] }] },
      { ...INPUTS, directories: [{ path: '', entries: [] }] },
      { ...INPUTS, directories: [{ path: 'briefs' }] },
      { ...INPUTS, directories: [{ path: 'briefs', entries: 'a.md' }] },
      { ...INPUTS, directories: [{ path: 'briefs', entries: ['a.md', 1] }] },
      { ...INPUTS, directories: [{ path: 'briefs', entries: ['a.md', 'b.md', 'a.md'] }] },
      { ...INPUTS, directories: ['briefs'] },
      { ...INPUTS, git: undefined },
      { ...INPUTS, git: [] },
      { ...INPUTS, git: 'git' },
      { ...INPUTS, git: { ignores: [] } },
      { ...INPUTS, git: { index: 'index', ignores: [] } },
      { ...INPUTS, git: { index: B } },
      { ...INPUTS, git: { index: B, ignores: [{ path: '.gitignore', sha256: 'x' }] } },
    ];
    for (const inputs of wrong) expect(of(inputs), JSON.stringify(inputs)).toBeNull();
  });
});
