import { describe, expect, it } from 'vitest';

import { SIBLINGS } from '../../src/config.js';
import { checkClaudeCode, checkVersion, CLAUDE_CODE_MINIMUM, meets, MINIMUM_VERSIONS, parseVersion, PROBLEMS_SINCE, reportsUnread, unreportedSaid, type Version } from '../../src/versions.js';

const version = (text: string): Version => {
  const parsed = parseVersion(text);
  if (parsed === null) throw new Error(`${text} did not parse`);
  return parsed;
};

describe('a version', () => {
  it('reads major, minor and patch, and whether it is a prerelease', () => {
    expect(parseVersion('0.12.3')).toEqual({ major: 0, minor: 12, patch: 3, prerelease: false });
    expect(parseVersion('10.0.20')).toEqual({ major: 10, minor: 0, patch: 20, prerelease: false });
    expect(parseVersion('1.2.3-rc.1')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: true });
    expect(parseVersion('1.2.3-0.beta-2.x')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: true });
  });

  it('accepts build metadata and ignores it, as precedence does', () => {
    expect(parseVersion('1.2.3+build.77')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: false });
    expect(parseVersion('1.2.3-rc.1+sha-5114f85')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: true });
  });

  it('refuses what semver refuses', () => {
    for (const text of [
      '',
      '1.2',
      '1.2.3.4',
      'v1.2.3',
      ' 1.2.3',
      '1.2.3 ',
      '01.2.3',
      '1.02.3',
      '1.2.03',
      '1.2.x',
      '1x2.3',
      '1.2x3',
      '1.2.3-',
      '1.2.3-rc..1',
      '1.2.3-rc.',
      '1.2.3-rc_1',
      '1.2.3+',
      '1.2.3+a..b',
      '1.2.3+a.',
      '1.2.3+a_b',
      '1.2.3-rc+',
      '>=1.2.3',
      '^1.2.3',
    ]) {
      expect(parseVersion(text), text).toBeNull();
    }
  });
});

describe('meeting a minimum', () => {
  // Parsed inside each test, never while the suite is collected: a mutant that
  // breaks parsing must fail a test, not the collection, which counts no test.
  const minimum = (): Version => version('0.12.0');

  it('is met by the minimum itself and by anything later, at any part', () => {
    for (const text of ['0.12.0', '0.12.1', '0.13.0', '1.0.0', '1.0.0-rc.1', '0.12.1-rc.1', '0.13.0-alpha', '2.3.4+build']) {
      expect(meets(version(text), minimum()), text).toBe(true);
    }
  });

  it('is not met by anything earlier, even with a later part below the one that differs', () => {
    for (const text of ['0.11.0', '0.11.9', '0.9.99', '0.0.12', '0.1.20']) {
      expect(meets(version(text), minimum()), text).toBe(false);
    }
    expect(meets(version('0.99.99'), version('1.0.0'))).toBe(false);
    expect(meets(version('1.0.0'), version('0.99.99'))).toBe(true);
    expect(meets(version('1.2.3'), version('1.2.4'))).toBe(false);
    expect(meets(version('1.2.5'), version('1.2.4'))).toBe(true);
  });

  it('is not met by a prerelease of the minimum, which comes before it', () => {
    expect(meets(version('0.12.0-rc.1'), minimum())).toBe(false);
    expect(meets(version('0.12.0+build'), minimum())).toBe(true);
  });
});

describe('an installed sibling', () => {
  it('runs at its minimum or later', () => {
    expect(checkVersion('spec-brief', '0.12.0')).toEqual({ ok: true, version: '0.12.0' });
    expect(checkVersion('spec-guard', '0.30.4')).toEqual({ ok: true, version: '0.30.4' });
    expect(checkVersion('spec-graph', '1.0.0')).toEqual({ ok: true, version: '1.0.0' });
  });

  it('below its minimum is refused, naming the minimum and how to reach it', () => {
    expect(checkVersion('spec-brief', '0.11.0')).toEqual({
      ok: false,
      version: '0.11.0',
      reason: 'spec-brief 0.11.0 is installed here; spec-harness needs 0.12.0 or later: npm install --save-dev @spec-family/spec-brief@latest',
    });
    expect(checkVersion('spec-guard', '0.30.0-rc.1')).toEqual({
      ok: false,
      version: '0.30.0-rc.1',
      reason: 'spec-guard 0.30.0-rc.1 is installed here; spec-harness needs 0.30.0 or later: npm install --save-dev @spec-family/spec-guard@latest',
    });
    // The placeholder that holds each name under the scope, which has no code.
    expect(checkVersion('spec-graph', '0.0.0')).toMatchObject({ ok: false, version: '0.0.0' });
  });

  it('with a version that cannot be read is refused as an old one is', () => {
    expect(checkVersion('spec-graph', undefined)).toEqual({
      ok: false,
      version: null,
      reason: 'the spec-graph installed here declares no version; spec-harness needs 0.21.0 or later: npm install --save-dev @spec-family/spec-graph@latest',
    });
    expect(checkVersion('spec-graph', 9)).toMatchObject({ ok: false, version: null });
    expect(checkVersion('spec-graph', 'latest')).toEqual({
      ok: false,
      version: 'latest',
      reason: 'the spec-graph installed here declares "latest", which is not a version; spec-harness needs 0.21.0 or later: npm install --save-dev @spec-family/spec-graph@latest',
    });
  });

  it('has a minimum for every sibling, each a release rather than a prerelease', () => {
    expect(Object.keys(MINIMUM_VERSIONS).sort()).toEqual([...SIBLINGS].sort());
    for (const name of SIBLINGS) {
      expect(parseVersion(MINIMUM_VERSIONS[name])?.prerelease, name).toBe(false);
    }
  });
});

describe('a spec-brief that says which briefs it could not read whole', () => {
  it('is 0.15.0 or later, a version that cannot be read is said not to be, and one before it is said by its version', () => {
    expect(PROBLEMS_SINCE).toBe('0.15.0');
    for (const version of ['0.15.0', '0.15.1', '0.16.0', '1.0.0']) expect(reportsUnread(version), version).toBe(true);
    for (const version of ['0.14.9', '0.13.1', '0.15.0-rc.1', 'latest', '']) expect(reportsUnread(version), version).toBe(false);
    expect(unreportedSaid('0.14.0')).toBe(
      "spec-brief 0.14.0 does not say which briefs it cannot read whole, so a brief whose protectedFiles it cannot read is guarded as one that protects nothing: spec-brief 0.15.0 or later says so, and the guard then holds that brief's writes",
    );
    expect(unreportedSaid(null)).toMatch(/^the spec-brief installed here does not say which briefs it cannot read whole, /);
  });
});

describe('the Claude Code that runs the hooks', () => {
  it('needs 2.1.139, the first release that runs a hook\'s args (ADR-0012)', () => {
    expect(CLAUDE_CODE_MINIMUM).toBe('2.1.139');
  });

  it('is read from the first word claude --version prints, and runs the hooks at the minimum or later', () => {
    expect(checkClaudeCode({ output: '2.1.139 (Claude Code)\n' })).toEqual({ state: 'ok', version: '2.1.139' });
    expect(checkClaudeCode({ output: '2.1.235 (Claude Code)\n' })).toEqual({ state: 'ok', version: '2.1.235' });
    expect(checkClaudeCode({ output: '  3.0.0\n' })).toEqual({ state: 'ok', version: '3.0.0' });
  });

  it('is too old below the minimum, a prerelease of it included', () => {
    for (const output of ['2.1.138 (Claude Code)', '2.0.999 (Claude Code)', '1.9.500', '2.1.139-beta.1 (Claude Code)']) {
      expect(checkClaudeCode({ output }).state, output).toBe('outdated');
    }
    expect(checkClaudeCode({ output: '2.1.100 (Claude Code)' })).toEqual({ state: 'outdated', version: '2.1.100' });
  });

  it('cannot be told when claude is not there, or prints no version, and is never read as fine', () => {
    expect(checkClaudeCode({ missing: 'no claude on PATH' })).toEqual({ state: 'unknown', reason: 'no claude on PATH' });
    expect(checkClaudeCode({ output: 'v24.18.1\n' })).toEqual({ state: 'unknown', reason: 'claude --version printed "v24.18.1", which is not a version' });
    expect(checkClaudeCode({ output: '' })).toEqual({ state: 'unknown', reason: 'claude --version printed nothing' });
    expect(checkClaudeCode({ output: 'Claude Code 2.1.200\nmore' })).toEqual({ state: 'unknown', reason: 'claude --version printed "Claude Code 2.1.200", which is not a version' });
  });

  it('reads the first line with text on it, and names it without the blanks around it', () => {
    expect(checkClaudeCode({ output: '\n  \n2.1.139 (Claude Code)\n' })).toEqual({ state: 'ok', version: '2.1.139' });
    expect(checkClaudeCode({ output: 'Claude Code 2.1.200 \r\nmore' })).toEqual({ state: 'unknown', reason: 'claude --version printed "Claude Code 2.1.200", which is not a version' });
  });

  it('is read as a whole from the package.json a Windows shim runs, which it names, against the same minimum', () => {
    const file = 'C:\\npm\\node_modules\\@anthropic-ai\\claude-code\\package.json';
    expect(checkClaudeCode({ declared: '2.1.139', file })).toEqual({ state: 'ok', version: '2.1.139', file });
    expect(checkClaudeCode({ declared: '2.1.285', file })).toEqual({ state: 'ok', version: '2.1.285', file });
    expect(checkClaudeCode({ declared: '2.1.138', file })).toEqual({ state: 'outdated', version: '2.1.138', file });
    expect(checkClaudeCode({ declared: '2.1.139-beta.1', file })).toEqual({ state: 'outdated', version: '2.1.139-beta.1', file });
    // A package.json holds the version alone: nothing follows it to be passed over.
    for (const declared of ['2.1.200 (Claude Code)', 'next', '']) {
      expect(checkClaudeCode({ declared, file }), declared).toEqual({ state: 'unknown', reason: `${file} declares "${declared}", which is not a version` });
    }
  });
});
