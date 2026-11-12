import { describe, expect, it } from 'vitest';

import { HELP } from '../../src/cli.js';
import { answerBeside, answeringHookLine, claudeHookLine, emptyValue, foldDrive, heldHookLine, isBlank, isClaudeHook, readHookLine, refusal, twoValues, unreadHookLine } from '../../src/usage.js';
import { parseOptions, UsageError } from '../../src/workspace.js';

/** Why a command line is refused, with every `--root` a directory unless the test names those that are. */
function refused(argv: readonly string[], isDirectory: (path: string) => boolean = () => true): string | null {
  return refusal(parseOptions(argv), isDirectory);
}

/** What each command reads of a command line, as the table in docs/reference/command-line.md has it. */
const TAKES: Readonly<Record<string, readonly string[]>> = {
  context: ['brief', 'base', 'root', 'format'],
  guard: ['brief', 'base', 'root', 'format', 'strict'],
  hook: ['brief', 'base', 'root'],
  escalate: ['brief', 'root', 'format', 'path', 'reason', 'option', 'recommend', 'list', 'show'],
  rule: ['root', 'format', 'allow', 'deny', 'note'],
  rulings: ['brief', 'base', 'root', 'format'],
  audit: ['brief', 'base', 'root', 'format', 'strict', 'if-round'],
  probe: ['brief', 'base', 'root', 'format', 'id', 'at'],
  premises: ['brief', 'root', 'format', 'strict'],
  init: ['root', 'format', 'write', 'git-hook', 'block-on-failure'],
  mcp: ['root'],
  doctor: ['brief', 'base', 'root', 'format', 'strict'],
};

/** Every option there is, as a person gives it. */
const GIVEN: Readonly<Record<string, readonly string[]>> = {
  brief: ['--brief', '012'],
  base: ['--base', 'main'],
  root: ['--root', 'elsewhere'],
  format: ['--format', 'json'],
  strict: ['--strict'],
  'if-round': ['--if-round'],
  write: ['--write'],
  'git-hook': ['--git-hook'],
  'block-on-failure': ['--block-on-failure'],
  path: ['--path', 'src/a.ts'],
  reason: ['--reason', 'why'],
  option: ['--option', 'Allow: one column'],
  recommend: ['--recommend', 'Allow.'],
  list: ['--list'],
  show: ['--show', 'E-012-1'],
  allow: ['--allow'],
  deny: ['--deny'],
  note: ['--note', 'n'],
  id: ['--id', 'p'],
  at: ['--at', 'base'],
};

/** A command with the argument it needs, where it needs one: `hook git`, since `hook claude` is read apart. */
const line = (command: string): string[] => (command === 'hook' ? ['hook', 'git'] : [command]);

describe('a command line that names something', () => {
  it('runs: every command with the options it reads and the arguments it takes', () => {
    for (const argv of [
      ['context'],
      ['context', '012', '--base', 'origin/main', '--root', 'elsewhere', '--format', 'json'],
      ['context', '--brief', '012'],
      ['guard', 'a.ts', 'b.ts', 'c.ts', '--brief', '1', '--base', 'main', '--strict', '--format', 'json'],
      ['hook', 'git', '--brief', '1', '--base', 'main', '--root', 'elsewhere'],
      ['escalate', '--path', 'a.ts', '--path', 'b.ts', '--reason', 'why', '--option', 'Allow: one column', '--option', 'Refuse', '--recommend', 'Allow.', '--brief', '1', '--format', 'json'],
      ['escalate', '--list'],
      ['escalate', '--show', 'E-012-1'],
      ['rule', 'E-012-1', '--allow', '--note', 'Add rotated_at only.', '--format', 'json'],
      ['rulings', '012', '--base', 'main'],
      ['audit', '--strict', '--format', 'sarif'],
      ['probe', '012', '--at', 'base', '--id', 'p'],
      ['premises', '--strict', '--brief', '1', '--format', 'gitlab'],
      ['init', '--write', '--git-hook', '--format', 'json'],
      ['mcp', '--root', 'elsewhere'],
      ['doctor', '--brief', '1', '--base', 'main', '--strict', '--format', 'json'],
    ]) {
      expect(refused(argv), argv.join(' ')).toBeNull();
    }
  });

  it('keeps a name that has space around it, which every command trims', () => {
    expect(refused(['guard', 'a.ts', '--brief', ' 12 '])).toBeNull();
    expect(refused(['escalate', '--path', 'a.ts', '--reason', ' why '])).toBeNull();
  });

  it('says nothing of no command, or of a word that is none: the command line answers those', () => {
    expect(refused([])).toBeNull();
    expect(refused(['--root', ''])).toBeNull();
    expect(refused(['archive', 'extra', '--note', 'x'])).toBeNull();
    // An object answers to more names than a map was given.
    expect(refused(['constructor', '--note', 'x'])).toBeNull();
    expect(refused(['toString', 'extra'])).toBeNull();
  });
});

describe('the help', () => {
  /** The commands the help gives an option to, read as a person reads it: a sentence is one line, wherever it wraps. */
  const said = (option: string): string[] => {
    const list = new RegExp(`--${option} .*? For ([a-z, ]+?)\\.`).exec(HELP.replace(/\s+/g, ' '))?.[1] ?? '';
    return list.split(/, | and /).sort();
  };
  const reading = (option: string): string[] => Object.keys(TAKES).filter((command) => (TAKES[command] as readonly string[]).includes(option)).sort();

  it('gives each option that not every command reads to the commands that read it', () => {
    for (const option of ['brief', 'base', 'strict', 'if-round']) expect(said(option), option).toEqual(reading(option));
    expect(reading('if-round')).toEqual(['audit']);
    expect(HELP).toContain('--root <dir>        Run from another directory, which must exist. For every command.\n');
    expect(HELP).toContain(`--block-on-failure  onFailure "block" on init's entries but the one as a turn ends. For init.\n`);
    expect(reading('block-on-failure')).toEqual(['init']);
    expect(reading('root')).toEqual(Object.keys(TAKES).sort());
    expect(HELP.replace(/\s+/g, ' ')).toContain('audit and premises also gitlab, sarif or github. For every command but hook and mcp.');
    expect(Object.keys(TAKES).filter((command) => !reading('format').includes(command))).toEqual(['hook', 'mcp']);
  });

  it('says what is refused, and the two commands that read their line another way', () => {
    expect(HELP).toContain(
      [
        'An option a command does not read, an argument it does not take, an option or an',
        'argument given an empty value, a brief given both as the argument and as --brief,',
        'and an option that takes one value given two that name two things are refused, exit 2,',
        'not read as if they were not there, and so with --help or --version on the line. The',
        'same value twice, as --root . --root ./, is read once, and on Windows a drive letter in',
        'either case. doctor says an empty --brief or --base in its report. hook claude reads its',
        'line as every release has, and says a line it cannot read, two values for one option or',
        '--help beside a --root that is not a directory among them, a --root that is not a',
        'directory, and a question it cannot read, as a warning to the person with exit 0: it',
        'refuses nothing for any of them.',
        '',
      ].join('\n'),
    );
  });

  it('says of --list and --show that neither raises a request, and what each reads beside it', () => {
    expect(HELP).toContain(
      ['                      --list shows what waits; --show <id> prints one memo. Neither', '                      raises a request: beside one, only --root and --format are read.', ''].join('\n'),
    );
    // Which the command line holds: every other option of escalate is refused beside either.
    for (const mode of [['--list'], ['--show', 'E-012-1']]) {
      for (const option of (TAKES['escalate'] as readonly string[]).filter((name) => name !== 'list' && name !== 'show')) {
        const answer = refused(['escalate', ...mode, ...(GIVEN[option] as readonly string[])]);
        if (option === 'root' || option === 'format') expect(answer, `${mode[0]} --${option}`).toBeNull();
        else expect(answer, `${mode[0]} --${option}`).toBe(`escalate ${mode[0]} does not take --${option}; beside ${mode[0]} its options are --root and --format`);
      }
    }
  });
});

describe('an option a command does not read', () => {
  it('is refused by the command, with the options it does read', () => {
    expect(refused(['doctor', '--note', 'x'])).toBe('doctor does not take --note; its options are --brief, --base, --root, --format and --strict');
    expect(refused(['init', '--base', 'main'])).toBe('init does not take --base; its options are --root, --format, --write, --git-hook and --block-on-failure');
    expect(refused(['hook', 'git', '--strict'])).toBe('hook does not take --strict; its options are --brief, --base and --root');
    expect(refused(['mcp', '--brief', '012'])).toBe('mcp does not take --brief; its only option is --root');
  });

  it('is never --no-color, which every command takes, as every tool of the family does (D8)', () => {
    for (const argv of [['doctor'], ['init'], ['mcp'], ['hook', 'git'], ['audit'], ['guard', 'a.ts'], ['escalate', '--list'], ['rule', 'E-1-1', '--allow', '--note', 'n']]) {
      expect(refused([...argv, '--no-color']), argv.join(' ')).toBeNull();
    }
    expect(refused(['mcp', '--no-color', '--brief', '012'])).toBe('mcp does not take --brief; its only option is --root');
  });

  it('is every option but those the table gives the command, and none of those', () => {
    for (const [command, takes] of Object.entries(TAKES)) {
      for (const [option, given] of Object.entries(GIVEN)) {
        const answer = refused([...line(command), ...given]);
        if (takes.includes(option)) expect(answer, `${command} --${option}`).toBeNull();
        else expect(answer, `${command} --${option}`).toMatch(new RegExp(`^${command} does not take --${option}; its (?:only option is|options are) `));
      }
    }
  });

  it('is never --help or --version, which every command answers, and is named with either on the line', () => {
    // The two are asked before the line is answered, so a line that is right is one beside either.
    for (const answer of ['--help', '-h', '--version', '-v']) {
      for (const command of Object.keys(TAKES)) expect(refused([...line(command), answer]), `${command} ${answer}`).toBeNull();
      expect(refused(['doctor', answer, '--note', 'x'])).toBe('doctor does not take --note; its options are --brief, --base, --root, --format and --strict');
      expect(refused(['escalate', '--list', answer, '--path', 'a.ts'])).toBe(`escalate --list does not take --path; beside --list its options are --root and --format`);
      expect(refused(['escalate', '--list', answer])).toBeNull();
    }
  });

  it('is named before a value it was given nothing for, and is the first of two on the line', () => {
    expect(refused(['doctor', '--id', ''])).toBe('doctor does not take --id; its options are --brief, --base, --root, --format and --strict');
    expect(refused(['mcp', '--strict', '--note', 'x'])).toBe('mcp does not take --strict; its only option is --root');
    expect(refused(['mcp', '--note', 'x', '--strict'])).toBe('mcp does not take --note; its only option is --root');
  });
});

describe('an option beside one that leaves it unread', () => {
  const beside = (mode: string): string => `; beside --${mode} its options are --root and --format`;

  it('is refused by the pair: --list reads no part of a request, no brief and no --show', () => {
    // Each printed the list, exit 0, and what stood beside --list did nothing.
    for (const [option, given] of [
      ['path', ['--path', 'src/a.ts']],
      ['reason', ['--reason', 'why']],
      ['option', ['--option', 'Allow: one column']],
      ['recommend', ['--recommend', 'Allow.']],
      ['brief', ['--brief', '012']],
      ['show', ['--show', 'E-012-1']],
    ] as const) {
      expect(refused(['escalate', '--list', ...given]), option).toBe(`escalate --list does not take --${option}${beside('list')}`);
    }
  });

  it('is refused by the pair: --show reads no part of a request and no brief', () => {
    for (const [option, given] of [
      ['path', ['--path', 'src/a.ts']],
      ['reason', ['--reason', 'why']],
      ['option', ['--option', 'Allow: one column']],
      ['recommend', ['--recommend', 'Allow.']],
      ['brief', ['--brief', '012']],
    ] as const) {
      expect(refused(['escalate', '--show', 'E-012-1', ...given]), option).toBe(`escalate --show does not take --${option}${beside('show')}`);
    }
  });

  it('is the first such option on the line, wherever --list stands, and --list decides over --show as the command does', () => {
    expect(refused(['escalate', '--path', 'a.ts', '--reason', 'why', '--list'])).toBe(`escalate --list does not take --path${beside('list')}`);
    expect(refused(['escalate', '--reason', 'why', '--list', '--path', 'a.ts'])).toBe(`escalate --list does not take --reason${beside('list')}`);
    expect(refused(['escalate', '--show', 'E-012-1', '--list'])).toBe(`escalate --list does not take --show${beside('list')}`);
    // Before a value it was given nothing for, as an option no command reads is.
    expect(refused(['escalate', '--list', '--path', ''])).toBe(`escalate --list does not take --path${beside('list')}`);
  });

  it('is neither --root nor --format, which both read, nor anything in a request that has neither', () => {
    for (const argv of [
      ['escalate', '--list'],
      ['escalate', '--list', '--format', 'json', '--root', 'elsewhere'],
      ['escalate', '--show', 'E-012-1'],
      ['escalate', '--root', 'elsewhere', '--show', 'E-012-1', '--format', 'json'],
      ['escalate', '--path', 'a.ts', '--reason', 'why', '--option', 'Allow', '--recommend', 'Allow.', '--brief', '012', '--format', 'json', '--root', 'elsewhere'],
    ]) {
      expect(refused(argv), argv.join(' ')).toBeNull();
    }
    // An empty id is still said as an empty id.
    expect(refused(['escalate', '--show', ''])).toMatch(/^--show is "", which names no escalation; /);
  });
});

describe('a brief named twice', () => {
  it('is refused, the argument beside --brief, whatever the two hold', () => {
    // The argument won with no word: `audit 012 --brief 013` audited 012.
    for (const command of ['context', 'rulings', 'audit', 'probe']) {
      expect(refused([command, '012', '--brief', '013']), command).toBe(`${command} was given the brief twice, as its argument "012" and as --brief "013"; give one of them`);
    }
    expect(refused(['context', '--brief', '012', '012'])).toBe('context was given the brief twice, as its argument "012" and as --brief "012"; give one of them');
    // Before either is asked what it names.
    expect(refused(['audit', '012', '--brief', ''])).toBe('audit was given the brief twice, as its argument "012" and as --brief ""; give one of them');
    expect(refused(['audit', '', '--brief', '012'])).toBe('audit was given the brief twice, as its argument "" and as --brief "012"; give one of them');
  });

  it('is not one named once, by either, nor a path or an escalation beside --brief', () => {
    for (const argv of [
      ['context', '012'],
      ['context', '--brief', '012'],
      ['audit', '012', '--base', 'main', '--strict'],
      ['probe', '--brief', '012', '--id', 'p'],
      // A guard's arguments are paths, and git's hook takes a word.
      ['guard', '012', '--brief', '012'],
      ['hook', 'git', '--brief', '012'],
    ]) {
      expect(refused(argv), argv.join(' ')).toBeNull();
    }
    // More arguments than the command takes is said as that.
    expect(refused(['context', '012', '013', '--brief', '014'])).toBe('context takes one argument at most, a brief\'s id, not "012", "013"');
  });
});

describe('an argument a command does not take', () => {
  it('is refused with every argument given, and what the command takes', () => {
    expect(refused(['doctor', 'extra'])).toBe('doctor takes no argument, not "extra"');
    for (const command of ['escalate', 'premises', 'init', 'mcp']) expect(refused([command, 'mydir'])).toBe(`${command} takes no argument, not "mydir"`);
    expect(refused(['context', '012', 'extra'])).toBe('context takes one argument at most, a brief\'s id, not "012", "extra"');
    for (const command of ['rulings', 'audit', 'probe']) expect(refused([command, '012', 'x', 'y'])).toBe(`${command} takes one argument at most, a brief's id, not "012", "x", "y"`);
    expect(refused(['rule', 'E-012-1', 'extra', '--allow', '--note', 'n'])).toBe('rule takes one argument, the escalation\'s id, not "E-012-1", "extra"');
    expect(refused(['hook', 'git', 'extra'])).toBe('hook takes one argument, "claude", "codex", "copilot" or "git", not "git", "extra"');
    // Shown as JSON, where an empty one can be seen.
    expect(refused(['doctor', ''])).toBe('doctor takes no argument, not ""');
  });

  it('is none of a guard\'s paths, however many', () => {
    expect(refused(['guard', 'a', 'b', 'c', 'd', 'e', 'f'])).toBeNull();
  });

  it('is not the word after hook, which hook itself reads', () => {
    expect(refused(['hook'])).toBeNull();
    expect(refused(['hook', 'bogus'])).toBeNull();
    expect(refused(['hook', ''])).toBeNull();
  });
});

describe('a value that names nothing', () => {
  it('is refused by the name of its option, shown as JSON, with what to do', () => {
    expect(refused(['guard', 'a.ts', '--brief', ''])).toBe('--brief is "", which names no brief; give it a brief\'s id, or leave it out for the one SPEC_BRIEF or the branch names');
    expect(refused(['audit', '--base', ''])).toBe('--base is "", which names no commit; give it a branch or a commit, or leave it out for the configured base');
    expect(refused(['init', '--root', ''])).toBe('--root is "", which names no directory; give it one, or leave it out to run in the current directory');
    expect(refused(['escalate', '--path', '', '--reason', 'why'])).toBe('--path is "", which names no file; give it the path of a file');
    expect(refused(['escalate', '--path', 'a.ts', '--reason', ''])).toBe('--reason is "", which gives no reason; say why the round cannot be done without the file');
    expect(refused(['escalate', '--path', 'a.ts', '--reason', 'why', '--option', ''])).toBe('--option is "", which names no choice; give it "<label>: <cost>", or leave it out');
    expect(refused(['escalate', '--path', 'a.ts', '--reason', 'why', '--recommend', ''])).toBe('--recommend is "", which recommends nothing; say which option and why, or leave it out');
    expect(refused(['escalate', '--show', ''])).toBe('--show is "", which names no escalation; give it an id, as spec-harness escalate --list prints them');
    expect(refused(['probe', '--id', ''])).toBe('--id is "", which names no probe; give it a probe\'s id, or leave it out to run every probe');
  });

  it('is one of only space, a tab or a line break, each shown as it is', () => {
    expect(refused(['guard', 'a.ts', '--brief', ' '])).toMatch(/^--brief is " ", which names no brief; /);
    expect(refused(['guard', 'a.ts', '--root', '\t'])).toMatch(/^--root is "\\t", which names no directory; /);
    expect(refused(['escalate', '--path', 'a.ts', '--reason', ' \n '])).toMatch(/^--reason is " \\n ", which gives no reason; /);
  });

  it('is any one of the values an option was given more than once', () => {
    expect(refused(['escalate', '--path', 'a.ts', '--path', ' ', '--reason', 'why'])).toMatch(/^--path is " ", which names no file; /);
    expect(refused(['escalate', '--path', 'a.ts', '--reason', 'why', '--option', 'Allow: one', '--option', ''])).toMatch(/^--option is "", which names no choice; /);
    // An option that takes one value, beside a value that would read as the same: the empty one is still the unset variable it most often is.
    expect(twoValues(parseOptions(['doctor', '--root', '', '--root', '.']), '/here')).toBeNull();
    expect(refused(['doctor', '--root', '', '--root', '.'])).toMatch(/^--root is "", which names no directory; /);
    expect(refused(['doctor', '--root', '.', '--root', ''])).toMatch(/^--root is "", which names no directory; /);
    for (const option of ['reason', 'recommend']) {
      expect(refused(['escalate', '--path', 'a.ts', '--reason', 'why', `--${option}`, ' ', `--${option}`, ' ']), option).toMatch(new RegExp(`^--${option} is " ", `));
    }
    expect(refused(['context', '--brief', ' ', '--brief', ' '])).toMatch(/^--brief is " ", which names no brief; /);
    expect(refused(['probe', '--id', '', '--id', ''])).toMatch(/^--id is "", which names no probe; /);
    expect(refused(['escalate', '--show', '', '--show', ''])).toMatch(/^--show is "", which names no escalation; /);
    expect(refused(['audit', '--base', '', '--base', ''])).toMatch(/^--base is "", which names no commit; /);
  });

  it('is held to every option the help gives a value', () => {
    // --format and --at take one of a few words, which the parser holds them
    // to, the empty one refused with any other; rule refuses its own --note.
    const elsewhere = ['format', 'at', 'note'];
    const valued = [...HELP.matchAll(/--([a-z-]+) "?</g)].map((match) => match[1] as string);
    expect([...new Set(valued)].sort()).toEqual(['at', 'base', 'brief', 'format', 'id', 'note', 'option', 'path', 'reason', 'recommend', 'root', 'show']);
    for (const option of new Set(valued)) {
      if (elsewhere.includes(option)) continue;
      const command = Object.keys(TAKES).find((name) => name !== 'doctor' && (TAKES[name] as readonly string[]).includes(option)) as string;
      for (const value of ['', '  ']) {
        const argv = [...line(command), `--${option}`, value];
        expect(refused(argv)?.startsWith(`--${option} is ${JSON.stringify(value)}, which `), argv.join(' ')).toBe(true);
      }
    }
    for (const argv of [['doctor', '--format', ''], ['probe', '--at', '']]) {
      expect(() => parseOptions(argv), argv.join(' ')).toThrow(UsageError);
    }
  });

  it('is said in a tool\'s words for its argument as in the command line\'s for its option', () => {
    expect(emptyValue('"brief"', 'brief', ' ')).toBe('"brief" is " ", which names no brief; give it a brief\'s id, or leave it out for the one SPEC_BRIEF or the branch names');
    expect(emptyValue('"paths[1]"', 'path', '')).toBe('"paths[1]" is "", which names no file; give it the path of a file');
  });

  it('is told from one that names something by what is left when the space around it is gone', () => {
    expect(['', ' ', '\t', '\n', ' \r\n '].map(isBlank)).toEqual([true, true, true, true, true]);
    expect(['a', ' a ', '0', '.'].map(isBlank)).toEqual([false, false, false, false]);
  });
});

describe('an option that takes one value, given two', () => {
  // The parser kept the last, and the earlier went unread with no word of it:
  // `doctor --root nowhere --root .` ran in `.` (spec-core ADR-0005).
  const TWO: Readonly<Record<string, readonly [string, string]>> = {
    brief: ['404', '001'],
    base: ['nowhere', 'main'],
    root: ['nowhere', '.'],
    format: ['json', 'pretty'],
    reason: ['why', 'because'],
    recommend: ['Allow.', 'Deny.'],
    show: ['E-012-1', 'E-012-2'],
    note: ['one', 'two'],
    id: ['p', 'q'],
    at: ['sideways', 'head'],
  };
  const twice = (option: string, first: string, other: string): string => `--${option} is given twice, as ${JSON.stringify(first)} and as ${JSON.stringify(other)}, and one of the two would go unread`;

  it('is said with both values as they were written, for every option that takes one, the hook\'s line among them', () => {
    for (const [option, [first, other]] of Object.entries(TWO)) {
      for (const argv of [['doctor'], ['hook', 'claude']]) {
        expect(twoValues(parseOptions([...argv, `--${option}`, first, `--${option}=${other}`]), '/here'), `${argv.join(' ')} --${option}`).toBe(twice(option, first, other));
      }
    }
    // A value the parser would refuse, read last, refused nothing where it stood first.
    expect(twoValues(parseOptions(['probe', '--at', 'sideways', '--at', 'head']), '/here')).toBe(twice('at', 'sideways', 'head'));
  });

  it('is the first option given two, with the first value it was given and the first that differs from it', () => {
    expect(twoValues(parseOptions(['doctor', '--brief', '1', '--root', 'a', '--brief', '2', '--root', 'b']), '/here')).toBe(twice('brief', '1', '2'));
    expect(twoValues(parseOptions(['doctor', '--root', 'a', '--root', 'a', '--root', 'b', '--root', 'c']), '/here')).toBe(twice('root', 'a', 'b'));
    expect(twoValues(parseOptions(['doctor', '--root', 'a', '--root', 'b', '--root', 'a']), '/here')).toBe(twice('root', 'a', 'b'));
  });

  it('is not the same value twice, however it is spelt, as the option reads it', () => {
    for (const argv of [
      ['doctor', '--root', '.', '--root', '.'],
      ['doctor', '--root', '.', '--root', './'],
      ['doctor', '--root', 'sub/..', '--root', '.'],
      ['doctor', '--root', '/here/sub', '--root', 'sub'],
      // An empty root is the directory the hook was started in.
      ['hook', 'claude', '--root', '', '--root', '/here'],
      ['doctor', '--brief', '012', '--brief', '012'],
      // A brief by its id, as spec-brief's names are matched: space around it dropped, and digits as a number.
      ['doctor', '--brief', '12', '--brief', '012'],
      ['doctor', '--brief', ' 012 ', '--brief', '012'],
      ['doctor', '--brief', '012', '--brief', ' 12 '],
      ['doctor', '--base', 'main', '--base', 'main'],
      ['doctor', '--format', 'json', '--format', 'json'],
      ['escalate', '--reason', 'why', '--reason', 'why'],
      ['probe', '--at', 'head', '--at', 'head'],
    ]) {
      expect(twoValues(parseOptions(argv), '/here'), argv.join(' ')).toBeNull();
    }
  });

  it('is two where the option reads two: a base by its name, text and ids as written, a brief that is not all digits as written', () => {
    expect(twoValues(parseOptions(['doctor', '--base', 'main', '--base', 'origin/main']), '/here')).toBe(twice('base', 'main', 'origin/main'));
    // Spelt as a path would name one directory: a base and an id are not paths.
    expect(twoValues(parseOptions(['doctor', '--base', 'main', '--base', './main']), '/here')).toBe(twice('base', 'main', './main'));
    expect(twoValues(parseOptions(['probe', '--id', 'p', '--id', './p']), '/here')).toBe(twice('id', 'p', './p'));
    expect(twoValues(parseOptions(['escalate', '--reason', 'why', '--reason', 'why ']), '/here')).toBe(twice('reason', 'why', 'why '));
    expect(twoValues(parseOptions(['doctor', '--brief', 'rt-7', '--brief', 'RT-7']), '/here')).toBe(twice('brief', 'rt-7', 'RT-7'));
    expect(twoValues(parseOptions(['doctor', '--brief', '012', '--brief', '012a']), '/here')).toBe(twice('brief', '012', '012a'));
    expect(twoValues(parseOptions(['doctor', '--brief', '', '--brief', '001']), '/here')).toBe(twice('brief', '', '001'));
    expect(twoValues(parseOptions(['doctor', '--root', '', '--root', 'sub']), '/here')).toBe(twice('root', '', 'sub'));
    // Read from where the line is read: the same two words name one directory or two.
    expect(twoValues(parseOptions(['doctor', '--root', '/here/sub', '--root', 'sub']), '/there')).toBe(twice('root', '/here/sub', 'sub'));
  });

  it('reads a drive letter in either case as one, where a path resolved on Windows starts with one, and nothing else of the path', () => {
    // Microsoft's Naming Files, Paths, and Namespaces has D:\ and d:\ name one volume; NTFS can be made to tell the rest apart by case.
    expect(foldDrive('c:\\repo')).toBe('C:\\repo');
    expect(foldDrive('C:\\repo')).toBe('C:\\repo');
    expect(foldDrive('c:\\Repo\\a')).toBe('C:\\Repo\\a');
    expect(foldDrive('c:')).toBe('C:');
    // A path resolved elsewhere starts with a slash, a UNC path with two backslashes, and neither holds a drive letter.
    for (const path of ['/c:/repo', '/repo', '\\\\server\\share', 'repo', 'cd:\\repo', '1:\\repo', '']) expect(foldDrive(path), JSON.stringify(path)).toBe(path);
  });

  it.runIf(process.platform === 'win32')('is one root on Windows for a drive letter written in either case, and two for the rest of the path written in two', () => {
    expect(twoValues(parseOptions(['doctor', '--root', 'C:\\repo', '--root', 'c:\\repo']), 'C:\\here')).toBeNull();
    expect(twoValues(parseOptions(['hook', 'claude', '--root', 'c:\\repo', '--root', 'C:\\repo\\']), 'c:\\here')).toBeNull();
    // Read from where the line is read, whose drive letter may be written in the other case.
    expect(twoValues(parseOptions(['doctor', '--root', 'c:\\here\\sub', '--root', 'sub']), 'C:\\here')).toBeNull();
    expect(twoValues(parseOptions(['doctor', '--root', 'C:\\repo', '--root', 'C:\\Repo']), 'C:\\here')).toBe(twice('root', 'C:\\repo', 'C:\\Repo'));
    expect(twoValues(parseOptions(['doctor', '--root', 'C:\\repo', '--root', 'D:\\repo']), 'C:\\here')).toBe(twice('root', 'C:\\repo', 'D:\\repo'));
  });

  it.skipIf(process.platform === 'win32')('is two roots elsewhere for C:\\repo beside c:\\repo, two names in the directory they are read from', () => {
    expect(twoValues(parseOptions(['doctor', '--root', 'C:\\repo', '--root', 'c:\\repo']), '/here')).toBe(twice('root', 'C:\\repo', 'c:\\repo'));
  });

  it('is never a list, which takes every value it is given, nor an option that takes none', () => {
    for (const argv of [
      ['escalate', '--path', 'a.ts', '--path', 'b.ts', '--reason', 'why', '--option', 'Allow: one', '--option', 'Refuse'],
      ['doctor', '--strict', '--strict'],
      ['init', '--write', '--write', '--git-hook', '--git-hook'],
      ['--help', '-h'],
      ['doctor'],
    ]) {
      expect(twoValues(parseOptions(argv), '/here'), argv.join(' ')).toBeNull();
    }
  });
});

describe('an argument that names nothing', () => {
  it('is refused with what it was given as, and what to do', () => {
    expect(refused(['guard', ''])).toBe('guard was given "" as a path, which names none; give it the paths the round would write');
    expect(refused(['guard', 'src/a.ts', ' '])).toBe('guard was given " " as a path, which names none; give it the paths the round would write');
    for (const command of ['context', 'rulings', 'audit', 'probe']) {
      expect(refused([command, ''])).toBe(`${command} was given "" as the brief, which names none; give it a brief's id, or leave it out for the one --brief, SPEC_BRIEF or the branch names`);
    }
    expect(refused(['rule', '', '--allow', '--note', 'n'])).toBe('rule was given "" as the escalation, which names none; give it an id, as spec-harness escalate --list prints them');
  });
});

describe('a --root that is no directory', () => {
  const only = (...directories: string[]) => (path: string) => directories.includes(path);

  it('is refused by name, a file or a path that is not there, for every command but Claude Code\'s hook', () => {
    const words = 'which is not a directory; give it one that exists, or leave it out to run in the current directory';
    expect(refused(['doctor', '--root', 'notes.txt'], only('adir'))).toBe(`--root is "notes.txt", ${words}`);
    for (const command of Object.keys(TAKES)) expect(refused([...line(command), '--root', 'nowhere'], only('adir')), command).toBe(`--root is "nowhere", ${words}`);
  });

  it('is not one that is there, and nothing is asked of the disk where no root is given', () => {
    expect(refused(['doctor', '--root', 'adir'], only('adir'))).toBeNull();
    const never = (): boolean => {
      throw new Error('asked');
    };
    expect(refused(['doctor'], never)).toBeNull();
    // An empty one is refused as naming nothing, before the disk is asked what it is.
    expect(refused(['doctor', '--root', ' '], never)).toMatch(/^--root is " ", which names no directory; /);
  });
});

describe('doctor', () => {
  it('is left to say an empty --brief or --base in its report, and no other empty value', () => {
    expect(refused(['doctor', '--brief', ''])).toBeNull();
    expect(refused(['doctor', '--base', ' '])).toBeNull();
    expect(refused(['doctor', '--brief', '', '--base', ''])).toBeNull();
    expect(refused(['doctor', '--root', ''])).toMatch(/^--root is "", which names no directory; /);
  });
});

describe("Claude Code's hook", () => {
  // The line is in the settings and the plugin of every release since 0.1.0,
  // and exit 2 from it holds every write of a session (ADR-0005).
  it('is read as every release has read it, whatever else is on its line', () => {
    for (const rest of [
      [],
      ['extra'],
      ['extra', 'more', ''],
      ['--strict', '--format', 'json'],
      ['--note', 'x', '--write', '--list', '--id', 'p'],
      ['--brief', ''],
      ['--base', ' '],
      ['--root', ''],
      ['--path', '', '--reason', ''],
      // What every other command refuses as a pair, or as a brief named twice.
      ['--list', '--path', 'src/a.ts'],
      ['--show', 'E-012-1', '--brief', '012'],
      ['012', '--brief', '013'],
      // And a root that is not there, which the hook says itself, with exit 1.
      ['--root', 'nowhere'],
    ]) {
      expect(refused(['hook', 'claude', ...rest], () => false), rest.join(' ')).toBeNull();
    }
  });

  it('is known by its command and the argument after it, on a line that parsed and on one that did not', () => {
    expect(isClaudeHook('hook', 'claude')).toBe(true);
    for (const [command, argument] of [['hook', 'git'], ['hook', undefined], ['hook', 'Claude'], ['guard', 'claude'], ['claude', 'hook'], [undefined, 'claude'], [undefined, undefined]] as const) {
      expect(isClaudeHook(command, argument), `${command} ${argument}`).toBe(false);
    }
  });

  it('is the one hook that is: git\'s is held to the rule', () => {
    expect(refused(['hook', 'git', 'extra'])).not.toBeNull();
    expect(refused(['hook', 'git', '--note', 'x'])).not.toBeNull();
    expect(refused(['hook', 'git', '--brief', ''])).toMatch(/^--brief is "", /);
    expect(refused(['hook', 'git', '--root', 'nowhere'], () => false)).toMatch(/^--root is "nowhere", which is not a directory; /);
    // And claude anywhere but first is an argument like any other.
    expect(refused(['hook', 'git', 'claude'])).toBe('hook takes one argument, "claude", "codex", "copilot" or "git", not "git", "claude"');
    expect(refused(['guard', 'claude', '--note', 'x'])).toMatch(/^guard does not take --note; /);
  });
});

describe("what Claude Code's hook does with its own line", () => {
  // The hook reads its line through these, and doctor reads a line it finds
  // in a settings file through the same: what doctor says is what the hook
  // does (ADR-0005).
  const only = (...directories: string[]) => (path: string) => directories.includes(path);
  const MEND_ROOT = "give the hook's line a directory that exists, or leave --root out for the project Claude Code names";
  const MEND_LINE = 'mend it in Claude Code\'s settings, where init writes "hook claude" and nothing after it';

  it('guards with no root on the line, asking the disk nothing, and in the root it is given where that is a directory', () => {
    const never = (): boolean => {
      throw new Error('asked');
    };
    expect(readHookLine(undefined, '/here', never)).toEqual({ state: 'guards', root: undefined });
    expect(readHookLine('/the/project', '/here', only('/the/project'))).toEqual({ state: 'guards', root: '/the/project' });
  });

  it('guards in the directory it was started in for an empty root, as in every release', () => {
    expect(readHookLine('', '/here', only('/here'))).toEqual({ state: 'guards', root: '/here' });
    // Space alone is not empty: it names a directory that is not there.
    expect(readHookLine(' ', '/here', only('/here'))).toEqual({ state: 'off', fault: { wrong: '--root is " ", which is not a directory', mend: MEND_ROOT } });
  });

  it('is off for a root that is a file or is not there, with what is wrong and what mends it', () => {
    expect(readHookLine('nowhere', '/here', only('/here'))).toEqual({ state: 'off', fault: { wrong: '--root is "nowhere", which is not a directory', mend: MEND_ROOT } });
    // And for an empty root where the directory the hook was started in is gone.
    expect(readHookLine('', '/gone', only('/here'))).toEqual({ state: 'off', fault: { wrong: '--root is "/gone", which is not a directory', mend: MEND_ROOT } });
  });

  it('is off for a line the parser refused, in the parser\'s words, put on one line', () => {
    expect(unreadHookLine("Unknown option '--nope'")).toEqual({ state: 'off', fault: { wrong: "the hook's line cannot be read (Unknown option '--nope')", mend: MEND_LINE } });
    expect(unreadHookLine('one\ntwo\nthree').fault.wrong).toBe("the hook's line cannot be read (one two three)");
  });

  it('reads the words it is handed with the command line\'s parser, and knows its line by its command and the argument after it', () => {
    const read = (words: readonly string[]) => claudeHookLine(words, parseOptions, '/here', only('/here', '/the/project'));
    expect(read(['hook', 'claude'])).toEqual({ state: 'guards', root: undefined });
    expect(read(['hook', 'claude', '--root', '/the/project', '--brief', '001'])).toEqual({ state: 'guards', root: '/the/project', brief: '001' });
    expect(read(['hook', 'claude', '--root', ''])).toEqual({ state: 'guards', root: '/here' });
    // What it does not read is passed over, as the hook passes over it.
    expect(read(['hook', 'claude', 'extra', '--strict', '--format', 'json', '--list'])).toEqual({ state: 'guards', root: undefined });
    // An option before the command, and between the two words.
    expect(read(['--brief', '001', 'hook', '--base', 'main', 'claude'])).toEqual({ state: 'guards', root: undefined, brief: '001' });
    expect(read(['hook', 'claude', '--root', '/nowhere'])).toEqual({ state: 'off', fault: { wrong: '--root is "/nowhere", which is not a directory', mend: MEND_ROOT } });
  });

  it('says which brief a line that guards names, as written, and none for one that is empty, which the hook passes over', () => {
    const read = (words: readonly string[]) => claudeHookLine(words, parseOptions, '/here', only('/here'));
    // Whether the name is a brief is spec-brief's to say: the line only says what it names.
    expect(read(['hook', 'claude', '--brief', '404'])).toStrictEqual({ state: 'guards', root: undefined, brief: '404' });
    expect(read(['hook', 'claude', '--brief', ' rt-7 '])).toStrictEqual({ state: 'guards', root: undefined, brief: ' rt-7 ' });
    for (const empty of ['', ' ', '\t']) expect(read(['hook', 'claude', '--brief', empty]), JSON.stringify(empty)).toStrictEqual({ state: 'guards', root: undefined });
    expect(read(['hook', 'claude'])).toStrictEqual({ state: 'guards', root: undefined });
    // A line that is off reads no brief, so it names none.
    expect(read(['hook', 'claude', '--root', '/nowhere', '--brief', '404'])).toStrictEqual({ state: 'off', fault: { wrong: '--root is "/nowhere", which is not a directory', mend: MEND_ROOT } });
  });

  it('holds every write under a name that is no brief, in the words that say what is wrong with the name', () => {
    expect(heldHookLine('the flag names brief 404, and spec-brief knows no such brief')).toEqual({ state: 'held', wrong: 'the flag names brief 404, and spec-brief knows no such brief' });
  });

  it('is off for a line the parser refuses, wherever on the line the fault stands', () => {
    const read = (words: readonly string[]) => claudeHookLine(words, parseOptions, '/here', only('/here'));
    const wrong = "the hook's line cannot be read (--format must be pretty or human, json, gitlab, sarif or github, not \"xml\")";
    expect(read(['hook', 'claude', '--format', 'xml'])).toEqual({ state: 'off', fault: { wrong, mend: MEND_LINE } });
    expect(read(['--format', 'xml', 'hook', 'claude'])).toEqual({ state: 'off', fault: { wrong, mend: MEND_LINE } });
    expect(read(['hook', 'claude', '--at', 'sideways'])).toMatchObject({ state: 'off', fault: { wrong: "the hook's line cannot be read (--at must be base, head or both, not \"sideways\")" } });
    expect(read(['hook', 'claude', '--nope'])).toMatchObject({ state: 'off', fault: { mend: MEND_LINE } });
    expect(read(['hook', 'claude', '--root'])).toMatchObject({ state: 'off' });
    // A line that cannot be read is said before its root is asked about.
    expect(read(['hook', 'claude', '--root', '/nowhere', '--format', 'xml'])).toMatchObject({ state: 'off', fault: { wrong } });
  });

  it('is off for two values given to an option that takes one, as a line the hook cannot read, and guards where the two name one thing', () => {
    const read = (words: readonly string[]) => claudeHookLine(words, parseOptions, '/here', only('/here', '/the/project'));
    const wrong = (said: string): unknown => ({ state: 'off', fault: { wrong: `the hook's line cannot be read (${said})`, mend: MEND_LINE } });
    expect(read(['hook', 'claude', '--root', '/the/project', '--root', '/here'])).toEqual(wrong('--root is given twice, as "/the/project" and as "/here", and one of the two would go unread'));
    expect(read(['hook', 'claude', '--brief', '001', '--brief', '404'])).toEqual(wrong('--brief is given twice, as "001" and as "404", and one of the two would go unread'));
    // An option the hook passes over is held to it as well: the line cannot be read either way.
    expect(read(['hook', 'claude', '--format', 'json', '--format', 'pretty'])).toEqual(wrong('--format is given twice, as "json" and as "pretty", and one of the two would go unread'));
    // Said before a root that is not there, as a line the parser refused is.
    expect(read(['hook', 'claude', '--root', '/nowhere', '--note', 'a', '--note', 'b'])).toEqual(wrong('--note is given twice, as "a" and as "b", and one of the two would go unread'));
    // Read from the root it is read in, an empty one the directory it is started in.
    expect(read(['hook', 'claude', '--root', '/the/project/', '--root', '/the/project'])).toEqual({ state: 'guards', root: '/the/project' });
    expect(read(['hook', 'claude', '--root', '', '--root', '/here'])).toEqual({ state: 'guards', root: '/here' });
    expect(read(['hook', 'claude', '--brief', '1', '--brief', '001'])).toEqual({ state: 'guards', root: undefined, brief: '001' });
  });

  it('checks no write where the line asks for the help or the version, which the hook prints, exit 0, and says nothing of', () => {
    const read = (words: readonly string[]) => claudeHookLine(words, parseOptions, '/here', only('/here', '/the/project', '/outside'));
    const asks = (asked: 'help' | 'version'): unknown => ({
      state: 'off',
      silent: true,
      fault: { wrong: `the line asks for the ${asked}, which the hook prints, exit 0, in place of checking the write`, mend: 'take that option off the line, where init writes "hook claude" and nothing after it' },
    });
    expect(answeringHookLine('help')).toStrictEqual(asks('help'));
    expect(read(['hook', 'claude', '--help'])).toStrictEqual(asks('help'));
    expect(read(['hook', 'claude', '-h'])).toStrictEqual(asks('help'));
    expect(read(['hook', 'claude', '--version'])).toStrictEqual(asks('version'));
    expect(read(['--version', 'hook', 'claude'])).toStrictEqual(asks('version'));
    // Whatever else the line holds that the hook would read as it runs: no brief is asked about, and no root opened.
    expect(read(['hook', 'claude', '--help', '--brief', '404'])).toStrictEqual(asks('help'));
    expect(read(['hook', 'claude', '-v', '--root', '/outside'])).toStrictEqual(asks('version'));
    expect(read(['hook', 'claude', '--help', '--root', ''])).toStrictEqual(asks('help'));
  });

  it('cannot read a line with the help or the version beside a root that is not a directory, which the hook would say as it runs', () => {
    const read = (words: readonly string[]) => claudeHookLine(words, parseOptions, '/here', only('/here'));
    const beside = (asked: string, root: string): string => `--${asked} is given beside a fault, --root is "${root}", which is not a directory, and the ${asked} would be printed in its place`;
    expect(read(['hook', 'claude', '--help', '--root', '/nowhere'])).toStrictEqual(unreadHookLine(beside('help', '/nowhere')));
    expect(read(['hook', 'claude', '--root', 'nowhere', '-v'])).toStrictEqual(unreadHookLine(beside('version', 'nowhere')));
    // An empty root where the directory the hook is started in is gone.
    expect(claudeHookLine(['hook', 'claude', '-h', '--root', ''], parseOptions, '/gone', only('/here'))).toStrictEqual(unreadHookLine(beside('help', '/gone')));
    expect(answerBeside(parseOptions(['hook', 'claude', '--help', '--root', 'a.ts']), '/here', only('/here'))).toBe(beside('help', 'a.ts'));
    expect(answerBeside(parseOptions(['hook', 'claude', '--version', '--root', 'a.ts']), '/here', only('/here'))).toBe(beside('version', 'a.ts'));
    // Neither asked for, or beside a root that is there or none: nothing to say before the answer.
    expect(answerBeside(parseOptions(['hook', 'claude', '--root', '/nowhere']), '/here', only('/here'))).toBeNull();
    expect(answerBeside(parseOptions(['hook', 'claude', '--help', '--root', '/here']), '/here', only('/here'))).toBeNull();
    expect(answerBeside(parseOptions(['hook', 'claude', '--version']), '/here', only('/here'))).toBeNull();
  });

  it('is nobody\'s where the words do not say hook claude, read or not', () => {
    const read = (words: readonly string[]) => claudeHookLine(words, parseOptions, '/here', only('/here'));
    for (const words of [['hook', 'git'], ['hook'], ['guard', 'claude'], ['claude', 'hook'], ['mcp', '--root', '/nowhere'], ['doctor'], [], ['hook', 'Claude']]) expect(read(words), words.join(' ')).toBeNull();
    // Refused by the parser, and not the hook's either: the word claude taken for a value, or left out.
    for (const words of [['hook', 'git', '--nope'], ['hook', '--brief', 'claude', '--nope'], ['hook', '--nope'], ['--nope']]) expect(read(words), words.join(' ')).toBeNull();
  });
});
