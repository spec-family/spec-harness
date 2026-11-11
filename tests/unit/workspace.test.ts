import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../../src/config.js';
import { describeActive, EXIT_ERROR, EXIT_FAILED, EXIT_OK, namedId, namesNoBrief, parseOptions, UnreadableLine, UsageError, type Workspace } from '../../src/workspace.js';
import { row } from './helpers.js';

function usage(argv: string[]): string {
  try {
    parseOptions(argv);
  } catch (error) {
    expect(error).toBeInstanceOf(UsageError);
    expect((error as Error).name).toBe('UsageError');
    return (error as Error).message;
  }
  throw new Error('parseOptions accepted the arguments');
}

/** The command and the arguments a refusal says were on the line. */
function words(argv: string[]): readonly string[] {
  try {
    parseOptions(argv);
  } catch (error) {
    expect(error).toBeInstanceOf(UnreadableLine);
    return (error as UnreadableLine).words;
  }
  throw new Error('parseOptions accepted the arguments');
}

describe('the exit codes', () => {
  it('are the family\'s', () => {
    expect([EXIT_OK, EXIT_FAILED, EXIT_ERROR]).toEqual([0, 1, 2]);
  });
});

describe('options', () => {
  it('reads the command and its positionals, and defaults every flag', () => {
    expect(parseOptions(['guard', 'a.ts', 'b.ts'])).toEqual({
      command: 'guard',
      positionals: ['a.ts', 'b.ts'],
      given: [],
      written: {},
      brief: undefined,
      base: undefined,
      root: undefined,
      format: 'pretty',
      strict: false,
      ifRound: false,
      help: false,
      version: false,
      write: false,
      gitHook: false,
      blockOnFailure: false,
      paths: [],
      reason: undefined,
      options: [],
      recommend: undefined,
      list: false,
      show: undefined,
      allow: false,
      deny: false,
      note: undefined,
      id: undefined,
      at: undefined,
    });
    expect(parseOptions([]).command).toBeUndefined();
  });

  it('reads every flag', () => {
    const options = parseOptions([
      'escalate',
      '--brief', '012',
      '--base', 'origin/main',
      '--root', '/repo',
      '--format', 'json',
      '--strict',
      '--if-round',
      '--write',
      '--git-hook',
      '--block-on-failure',
      '--path', 'a.ts',
      '--path', 'b.ts',
      '--reason', 'why',
      '--option', 'Allow: cost',
      '--option', 'Refuse',
      '--recommend', 'Allow',
      '--list',
      '--show', 'E-1',
      '--allow',
      '--deny',
      '--note', 'n',
      '--id', 'p',
      '--at', 'head',
    ]);
    expect(options).toEqual({
      command: 'escalate',
      positionals: [],
      // Each once, in the order given, by its long name.
      given: ['brief', 'base', 'root', 'format', 'strict', 'if-round', 'write', 'git-hook', 'block-on-failure', 'path', 'reason', 'option', 'recommend', 'list', 'show', 'allow', 'deny', 'note', 'id', 'at'],
      // Every value of each option that takes one; a list has its own, and an option that takes none has no value.
      written: { brief: ['012'], base: ['origin/main'], root: ['/repo'], format: ['json'], reason: ['why'], recommend: ['Allow'], show: ['E-1'], note: ['n'], id: ['p'], at: ['head'] },
      brief: '012',
      base: 'origin/main',
      root: '/repo',
      format: 'json',
      strict: true,
      ifRound: true,
      help: false,
      version: false,
      write: true,
      gitHook: true,
      blockOnFailure: true,
      paths: ['a.ts', 'b.ts'],
      reason: 'why',
      options: ['Allow: cost', 'Refuse'],
      recommend: 'Allow',
      list: true,
      show: 'E-1',
      allow: true,
      deny: true,
      note: 'n',
      id: 'p',
      at: 'head',
    });
  });

  it('lists the options given by their long names, each once and in the order given', () => {
    expect(parseOptions(['guard', 'a.ts', '--strict', '--brief', '1']).given).toEqual(['strict', 'brief']);
    expect(parseOptions(['escalate', '--path', 'a', '--reason', 'r', '--path', 'b']).given).toEqual(['path', 'reason']);
    expect(parseOptions(['-h', '--strict', '-h']).given).toEqual(['help', 'strict']);
  });

  it('keeps every value of an option that takes one, in the order given, where the field holds the last', () => {
    const options = parseOptions(['doctor', '--root', 'a', '--brief', '1', '--root=b', '--root', 'a', '--strict', '--path', 'x', '--path', 'y']);
    expect(options.written).toEqual({ root: ['a', 'b', 'a'], brief: ['1'] });
    expect(options.root).toBe('a');
    expect(options.paths).toEqual(['x', 'y']);
    // An empty value is a value.
    expect(parseOptions(['doctor', '--root', '', '--root', '.']).written).toEqual({ root: ['', '.'] });
  });

  it('reads the short forms of help and version', () => {
    expect(parseOptions(['-h'])).toMatchObject({ help: true, version: false });
    expect(parseOptions(['-v'])).toMatchObject({ help: false, version: true });
    expect(parseOptions(['-h', '--help'])).toMatchObject({ help: true, version: false });
    expect(parseOptions(['--version', '-v'])).toMatchObject({ help: false, version: true });
  });

  it('refuses help beside version, in either order, naming both as they were written (spec-core ADR-0005)', () => {
    // The version was printed, and the help asked for went unread.
    const both = (first: string, other: string): string => `${first} is given beside ${other}, and one of the two answers would go unread; give one of them`;
    expect(usage(['--help', '--version'])).toBe(both('--help', '--version'));
    expect(usage(['--version', '--help'])).toBe(both('--version', '--help'));
    expect(usage(['-h', '-v'])).toBe(both('-h', '-v'));
    expect(usage(['doctor', '-v', '--root', '.', '--help'])).toBe(both('-v', '--help'));
    expect(usage(['-h', '-h', 'doctor', '--version'])).toBe(both('-h', '--version'));
    // Whose line it was is kept, as for every line the parser refuses.
    expect(words(['hook', 'claude', '--help', '--version'])).toEqual(['hook', 'claude']);
  });

  it('reads every probe position, and pretty as a format', () => {
    for (const at of ['base', 'head', 'both'] as const) expect(parseOptions(['probe', '--at', at]).at).toBe(at);
    expect(parseOptions(['audit', '--format', 'pretty']).format).toBe('pretty');
  });

  it('refuses a format or a probe position it does not know', () => {
    expect(usage(['audit', '--format', 'xml'])).toBe('--format must be pretty, json, gitlab, sarif or github, not "xml"');
    expect(usage(['audit', '--format', 'SARIF'])).toBe('--format must be pretty, json, gitlab, sarif or github, not "SARIF"');
    expect(usage(['probe', '--at', 'tip'])).toBe('--at must be base, head or both, not "tip"');
  });

  it('reads the formats that place findings for audit and premises, and for no other command (spec-core ADR-0005)', () => {
    for (const format of ['gitlab', 'sarif', 'github'] as const) {
      expect(parseOptions(['audit', '--format', format]).format).toBe(format);
      expect(parseOptions(['premises', '--format', format]).format).toBe(format);
      expect(usage(['doctor', '--format', format])).toBe(`--format ${format} is for audit and premises; doctor prints pretty or json`);
      expect(usage(['context', '--format', format])).toBe(`--format ${format} is for audit and premises; context prints pretty or json`);
    }
    // Every command reads pretty and json; with no command, help is printed and the format is never used.
    for (const command of ['doctor', 'guard', 'init', 'rulings']) expect(parseOptions([command, '--format', 'json']).format).toBe('json');
    expect(parseOptions(['--format', 'sarif', '--help'])).toMatchObject({ help: true, format: 'sarif' });
  });

  it('refuses an unknown flag, and a flag missing its value', () => {
    expect(usage(['guard', '--force'])).toContain("Unknown option '--force'");
    expect(usage(['guard', '--brief'])).toContain('--brief');
    expect(usage(['guard', '--strict=yes'])).toContain('--strict');
  });

  it('says with each refusal whose line it was: the command and its arguments, read with nothing refused', () => {
    // What tells Claude Code's hook, which holds no write for its own line, from every command that stops.
    expect(words(['hook', 'claude', '--nope'])).toEqual(['hook', 'claude']);
    expect(words(['hook', 'claude', '-x', '--nope=value'])).toEqual(['hook', 'claude']);
    expect(words(['guard', 'a.ts', '--force', 'b.ts'])).toEqual(['guard', 'a.ts', 'b.ts']);
    expect(words(['--nope'])).toEqual([]);
    // An option left without its value takes none, at the end of the line or before another option.
    expect(words(['hook', 'claude', '--root'])).toEqual(['hook', 'claude']);
    expect(words(['hook', 'claude', '--root', '--brief', '001'])).toEqual(['hook', 'claude', '001']);
    expect(words(['hook', 'claude', '--strict=yes'])).toEqual(['hook', 'claude']);
    // A value is not taken for the command it stands before, nor the command for a value.
    expect(words(['--root', 'elsewhere', 'hook', 'claude', '--nope'])).toEqual(['hook', 'claude']);
    expect(words(['hook', '--brief', 'claude', '--nope'])).toEqual(['hook']);
    expect(words(['escalate', '--path', 'a.ts', '--path', 'b.ts', '--nope'])).toEqual(['escalate']);
    // A format or a probe position that is none is refused on a line that parsed, whose words are known.
    expect(words(['hook', 'claude', '--format', 'xml'])).toEqual(['hook', 'claude']);
    expect(words(['hook', 'claude', '--format', 'sarif', 'extra'])).toEqual(['hook', 'claude', 'extra']);
    expect(words(['probe', '012', '--at', 'tip'])).toEqual(['probe', '012']);
  });
});

function workspace(branch: string | null, branches = DEFAULT_CONFIG.branches): Workspace {
  const siblings: Workspace['siblings'] = {
    root: '/repo',
    locate: () => ({ kind: 'absent', reason: 'not in a unit test' }),
    briefs: async () => [],
    json: async () => ({ absent: 'not in a unit test' }),
    keeping: () => siblings,
  };
  return {
    root: '/repo',
    commonDir: '/repo/.git',
    config: { ...DEFAULT_CONFIG, branches },
    siblings,
    branch,
    cwd: '/repo',
  };
}

describe('the named id', () => {
  it('is the flag, then SPEC_BRIEF, then the branch, trimmed', () => {
    expect(namedId(workspace('brief/3-x'), parseOptions(['guard', '--brief', ' 1 ']), { SPEC_BRIEF: '2' })).toBe('1');
    expect(namedId(workspace('brief/3-x'), parseOptions(['guard', '--brief', ' ']), { SPEC_BRIEF: ' 2 ' })).toBe('2');
    expect(namedId(workspace('brief/3-x'), parseOptions(['guard']), { SPEC_BRIEF: '' })).toBe('3');
    expect(namedId(workspace('nh/brief-4'), parseOptions(['guard']), {})).toBe('4');
  });

  it('is none on a detached head or a branch no template reads', () => {
    expect(namedId(workspace(null), parseOptions(['guard']), {})).toBeNull();
    expect(namedId(workspace('main'), parseOptions(['guard']), {})).toBeNull();
    expect(namedId(workspace('brief/3', ['work/{id}']), parseOptions(['guard']), {})).toBeNull();
  });
});

describe('describing the active brief', () => {
  it('gives the brief it found', () => {
    const brief = row();
    expect(describeActive({ kind: 'found', brief, source: 'branch' })).toEqual({ brief, note: undefined, problem: null });
  });

  it('gives the reason there is none as a note, not a problem', () => {
    expect(describeActive({ kind: 'none', reason: 'no brief is named' })).toEqual({ brief: null, note: 'no brief is named', problem: null });
  });

  it('makes a named brief spec-brief does not know, or an archived one, a problem', () => {
    expect(describeActive({ kind: 'unknown', id: '99', source: 'flag' })).toEqual({
      brief: null,
      note: undefined,
      problem: 'the flag names brief 99, and spec-brief knows no such brief',
    });
    expect(describeActive({ kind: 'archived', brief: row({ id: '007' }), source: 'environment' })).toEqual({
      brief: null,
      note: undefined,
      problem: 'the environment names brief 007, which is archived; a closed round writes nothing',
    });
    expect(describeActive({ kind: 'unknown', id: '98', source: 'branch' }).problem).toBe('the branch names brief 98, and spec-brief knows no such brief');
  });

  it('says what named the brief: an argument is the argument, and a tool call\'s is its "brief", never the flag', () => {
    // `context 99` and start_round {"brief": "99"} were both told the flag
    // named it, and neither had one.
    expect(describeActive({ kind: 'unknown', id: '99', source: 'argument' }).problem).toBe('the argument names brief 99, and spec-brief knows no such brief');
    expect(describeActive({ kind: 'archived', brief: row({ id: '007' }), source: 'argument' }).problem).toBe(
      'the argument names brief 007, which is archived; a closed round writes nothing',
    );
    expect(describeActive({ kind: 'unknown', id: '99', source: 'argument' }, '"brief"').problem).toBe('"brief" names brief 99, and spec-brief knows no such brief');
    expect(describeActive({ kind: 'archived', brief: row({ id: '007' }), source: 'argument' }, '"brief"').problem).toBe(
      '"brief" names brief 007, which is archived; a closed round writes nothing',
    );
    // Only an argument is the caller's to name: the flag, the environment and the branch are what they are.
    expect(describeActive({ kind: 'unknown', id: '99', source: 'flag' }, '"brief"').problem).toBe('the flag names brief 99, and spec-brief knows no such brief');
    expect(describeActive({ kind: 'archived', brief: row({ id: '007' }), source: 'branch' }, '"brief"').problem).toBe(
      'the branch names brief 007, which is archived; a closed round writes nothing',
    );
    // The same line where a command says it without a brief to describe, as premises does.
    expect(namesNoBrief({ kind: 'unknown', id: '99', source: 'environment' })).toBe('the environment names brief 99, and spec-brief knows no such brief');
    expect(namesNoBrief({ kind: 'unknown', id: '99', source: 'argument' })).toBe('the argument names brief 99, and spec-brief knows no such brief');
  });
});
