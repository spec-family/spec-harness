import { afterAll, describe, expect, it } from 'vitest';

import { HELP } from '../../src/cli.js';
import { cleanup, cli, ROOT, spawnBin, temp } from './helpers.js';

afterAll(cleanup);

/**
 * A command named as something every JavaScript object answers to. The
 * commands were kept as an object, which answered to the name: `spec-harness
 * constructor` ran `Object` as a command and ended on a stack trace with
 * exit 1, where `spec-harness archive` is an unknown command with exit 2.
 * tests/unit/object-names.test.ts holds the rest of what reads such a name.
 */

const NAMES: readonly string[] = ['constructor', 'toString', '__proto__', 'valueOf', 'hasOwnProperty'];

describe('a command named as something every object answers to', () => {
  it('is an unknown command with exit 2, as any other word is', async () => {
    for (const name of [...NAMES, 'nonesuch']) {
      expect(await cli([name], ROOT), name).toEqual({ code: 2, stdout: '', stderr: `spec-harness: unknown command "${name}"; see spec-harness --help\n` });
      // With what a command takes after it, it is still no command.
      expect(await cli([name, 'a.ts', '--format', 'json', '--strict'], ROOT), name).toEqual({
        code: 2,
        stdout: '',
        stderr: `spec-harness: unknown command "${name}"; see spec-harness --help\n`,
      });
    }
  });

  it('is looked up before the help is asked for, as a line that is wrong is refused with --help on it', async () => {
    expect(await cli(['constructor', '--help'], ROOT)).toEqual({ code: 2, stdout: '', stderr: 'spec-harness: unknown command "constructor"; see spec-harness --help\n' });
    expect(await cli(['--help'], ROOT)).toEqual({ code: 0, stdout: HELP, stderr: '' });
  });

  it('exits 2 from the built command line, where it exited 1 on a stack trace', () => {
    for (const name of ['constructor', 'toString', '__proto__']) {
      expect(spawnBin([name], ROOT), name).toEqual({ code: 2, stdout: '', stderr: `spec-harness: unknown command "${name}"; see spec-harness --help\n` });
    }
  });
});

describe('every command the help names', () => {
  it('is still found: each answers in its own words, and none is unknown', async () => {
    // Outside a work tree a command gets no further than opening the
    // repository, or than its own arguments: far enough to show it was run.
    const outside = temp();
    const noWorkTree = `spec-harness: ${outside} is not inside a git work tree; spec-harness measures rounds by their commits\n`;
    for (const command of ['context', 'audit', 'escalate', 'rulings', 'probe', 'premises', 'init', 'mcp', 'doctor']) {
      expect(await cli([command], outside), command).toEqual({ code: 2, stdout: '', stderr: noWorkTree });
    }
    expect(await cli(['guard'], outside)).toEqual({ code: 2, stdout: '', stderr: 'spec-harness: guard needs at least one path\n' });
    expect(await cli(['hook', 'nonesuch'], outside)).toEqual({ code: 2, stdout: '', stderr: 'spec-harness: hook takes "claude", "codex", "copilot" or "git"\n' });
    expect(await cli(['rule'], outside)).toEqual({ code: 2, stdout: '', stderr: 'spec-harness: rule needs the escalation id, such as E-012-1\n' });
  });
});
