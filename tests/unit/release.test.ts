import { describe, expect, it } from 'vitest';

import { changelogSection, pluginDrift, releaseOf, serverDrift } from '../../scripts/release.js';

const CHANGELOG = [
  '# Changelog',
  '',
  '## Unreleased',
  '',
  '- Something not yet released.',
  '',
  '## [0.2.0] - 2026-10-01',
  '',
  '- A feature.',
  '',
  '### Fixed',
  '',
  '- A defect.',
  '',
  '## 0.2.0-rc.1',
  '',
  '- The candidate.',
  '',
  '## 0.1.1',
  '',
  '## 0.1.0',
  '',
  'The first release.',
  '',
].join('\n');

describe('the release check', () => {
  it('accepts the tag that names the version, with the notes and the default dist-tag', () => {
    expect(releaseOf('v0.1.0', '0.1.0', CHANGELOG)).toEqual({ version: '0.1.0', distTag: 'latest', notes: 'The first release.' });
  });

  it('stages a prerelease under next, never as the default install', () => {
    expect(releaseOf('v0.2.0-rc.1', '0.2.0-rc.1', CHANGELOG)).toEqual({
      version: '0.2.0-rc.1',
      distTag: 'next',
      notes: '- The candidate.',
    });
  });

  it('refuses a tag that does not name the version, and says how to fix it', () => {
    expect(releaseOf('v0.1.1', '0.1.0', CHANGELOG)).toBe(
      "the tag v0.1.1 does not name the package's version 0.1.0: tag v0.1.0, or change the version",
    );
    expect(releaseOf('0.1.0', '0.1.0', CHANGELOG)).toContain('does not name');
  });

  it('refuses a version the changelog does not describe, or describes with nothing', () => {
    const missing = 'CHANGELOG.md has no "## 0.3.0" section with text in it; describe the release before tagging it';
    expect(releaseOf('v0.3.0', '0.3.0', CHANGELOG)).toBe(missing);
    expect(releaseOf('v0.1.1', '0.1.1', CHANGELOG)).toContain('no "## 0.1.1" section');
  });
});

describe('a changelog section', () => {
  it('runs to the next heading of its level, keeping the headings below it', () => {
    expect(changelogSection(CHANGELOG, '0.2.0')).toBe('- A feature.\n\n### Fixed\n\n- A defect.');
  });

  it('matches the version exactly, not a prerelease of it or a longer version', () => {
    expect(changelogSection('## 0.1.0-rc.1\n\nx\n', '0.1.0')).toBeNull();
    expect(changelogSection('## 0.1.00\n\nx\n', '0.1.0')).toBeNull();
    expect(changelogSection('### 0.1.0\n\nx\n', '0.1.0')).toBeNull();
    expect(changelogSection('## Unreleased\n\nx\n', 'Unreleased')).toBe('x');
  });

  it('reads CRLF, and stops at a top-level heading too', () => {
    expect(changelogSection('## 1.0.0\r\n\r\n- a\r\n# Appendix\r\ny\r\n', '1.0.0')).toBe('- a');
  });
});

describe('the plugin beside the package', () => {
  const plugin = (version: unknown): unknown => ({ name: 'spec-harness', version });
  const marketplace = (...plugins: unknown[]): unknown => ({ name: 'spec-tools', plugins });

  const drifted = (named: string, version: string): string => `.claude-plugin/plugin.json names ${named}, where package.json names ${version}: the plugin is released with the package, at its version`;
  const ownVersion =
    "the spec-harness plugin in .claude-plugin/marketplace.json names a version of its own: Claude Code reads .claude-plugin/plugin.json's before it, and claude plugin validate warns where both name one, so take it out";
  const unlisted = '.claude-plugin/marketplace.json lists no spec-harness plugin';

  it('passes when the manifest names the package version and the marketplace lists the plugin with none', () => {
    expect(pluginDrift('0.1.0', plugin('0.1.0'), marketplace({ name: 'other', version: '9.9.9' }, { name: 'spec-harness', source: './' }))).toBeNull();
  });

  it('names a manifest that says another version, and the one the package says', () => {
    expect(pluginDrift('0.2.0', plugin('0.1.0'), marketplace({ name: 'spec-harness' }))).toBe(drifted('0.1.0', '0.2.0'));
  });

  it('counts a version on the marketplace entry, whatever it is, and an entry missing, as drift beside the manifest', () => {
    expect(pluginDrift('0.2.0', plugin('0.2.0'), marketplace({ name: 'spec-harness', version: '0.2.0' }))).toBe(ownVersion);
    expect(pluginDrift('0.2.0', plugin('0.2.0'), marketplace({ name: 'spec-harness', version: null }))).toBe(ownVersion);
    expect(pluginDrift('0.2.0', plugin('0.1.0'), marketplace({ name: 'spec-harness', version: '0.1.0' }))).toBe(`${drifted('0.1.0', '0.2.0')}; ${ownVersion}`);
    expect(pluginDrift('0.1.0', plugin('0.1.0'), marketplace({ name: 'spec-brief' }))).toBe(unlisted);
    expect(pluginDrift('0.1.0', plugin('0.1.0'), { plugins: 'spec-harness' })).toBe(unlisted);
    expect(pluginDrift('0.1.0', plugin('0.1.0'), marketplace('spec-harness'))).toBe(unlisted);
  });

  it('counts a manifest without a version as drift', () => {
    expect(pluginDrift('0.1.0', { name: 'spec-harness' }, marketplace({ name: 'spec-harness' }))).toBe(drifted('no version', '0.1.0'));
    expect(pluginDrift('0.1.0', plugin(1), marketplace({ name: 'spec-harness' }))).toBe(drifted('no version', '0.1.0'));
    expect(pluginDrift('0.1.0', [], null)).toBe(`${drifted('no version', '0.1.0')}; ${unlisted}`);
  });
});

describe('server.json beside the package', () => {
  const server = (version: unknown, ...listed: unknown[]): unknown => ({ name: 'io.github.spec-family/spec-harness', version, packages: listed.map((at) => ({ registryType: 'npm', identifier: '@spec-family/spec-harness', version: at })) });
  const drifted = (named: string, where: string, version: string): string =>
    `server.json names ${named} as ${where}, where package.json names ${version}: the MCP Registry lists the package at the version server.json names`;

  it('passes when it names the package version for the server and for its package', () => {
    expect(serverDrift('0.24.2', server('0.24.2', '0.24.2'))).toBeNull();
  });

  it('names each place that says another version, and the one the package says', () => {
    expect(serverDrift('0.24.2', server('0.24.1', '0.24.2'))).toBe(drifted('0.24.1', 'version', '0.24.2'));
    expect(serverDrift('0.24.2', server('0.24.2', '0.24.1'))).toBe(drifted('0.24.1', 'packages[0].version', '0.24.2'));
    expect(serverDrift('0.24.2', server('0.24.1', '0.24.1'))).toBe(`${drifted('0.24.1', 'version', '0.24.2')}; ${drifted('0.24.1', 'packages[0].version', '0.24.2')}`);
  });

  it('reads the first package, and counts a version that is missing or not text as none', () => {
    expect(serverDrift('0.24.2', server('0.24.2', '0.24.2', '0.24.1'))).toBeNull();
    expect(serverDrift('0.24.2', server('0.24.2'))).toBe(drifted('no version', 'packages[0].version', '0.24.2'));
    expect(serverDrift('0.24.2', { version: '0.24.2', packages: { version: '0.24.2' } })).toBe(drifted('no version', 'packages[0].version', '0.24.2'));
    expect(serverDrift('1', server(1, 1))).toBe(`${drifted('no version', 'version', '1')}; ${drifted('no version', 'packages[0].version', '1')}`);
    expect(serverDrift('0.24.2', null)).toBe(`${drifted('no version', 'version', '0.24.2')}; ${drifted('no version', 'packages[0].version', '0.24.2')}`);
  });
});
