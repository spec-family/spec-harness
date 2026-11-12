import { describe, expect, it } from 'vitest';

import { CONFIG_FILE, ConfigError, DEFAULT_CONFIG, DEFAULT_MANIFESTS, parseConfig, SIBLINGS } from '../../src/config.js';

function refusal(raw: unknown, file?: string): string {
  try {
    if (file === undefined) parseConfig(raw);
    else parseConfig(raw, file);
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as Error).name).toBe('ConfigError');
    return (error as Error).message;
  }
  throw new Error('parseConfig accepted the configuration');
}

describe('the defaults', () => {
  it('are what an empty file or a bare schema reference means', () => {
    expect(parseConfig({})).toEqual(DEFAULT_CONFIG);
    expect(parseConfig({ $schema: './schema.json' })).toEqual(DEFAULT_CONFIG);
    expect(CONFIG_FILE).toBe('.spec-harness.json');
    expect(SIBLINGS).toEqual(['spec-brief', 'spec-graph', 'spec-guard']);
  });

  it('are the ones the reference documents (docs/reference/configuration.md)', () => {
    expect(DEFAULT_CONFIG.branches).toEqual(['brief/{id}', 'brief-{id}', '*/brief/{id}', '*/brief-{id}']);
    expect(DEFAULT_CONFIG.outOfScope).toBe('warn');
    expect(DEFAULT_CONFIG.base).toBeNull();
    expect(DEFAULT_CONFIG.rulings).toEqual({ section: 'Rulings', allowedSigners: '.github/allowed_signers' });
    expect(DEFAULT_CONFIG.context.budget).toBe(60_000);
    expect(DEFAULT_CONFIG.assertions.premises).toEqual(['The Defect, Measured', 'Premises', 'Preconditions']);
    expect(DEFAULT_CONFIG.probes).toEqual({ runs: 2, timeout: 600 });
    expect(DEFAULT_CONFIG.tools).toEqual({ 'spec-brief': null, 'spec-graph': null, 'spec-guard': null });
    // requirements-dev.txt is a requirements file too; the reference's page on audit says requirements*.txt.
    expect(DEFAULT_MANIFESTS).toEqual([
      'package.json',
      'Cargo.toml',
      'go.mod',
      'pyproject.toml',
      'requirements*.txt',
      'Directory.Packages.props',
      '*.csproj',
      '*.fsproj',
      '*.vbproj',
      'Gemfile',
    ]);
    expect(DEFAULT_CONFIG.dependencies.manifests).toBe(DEFAULT_MANIFESTS);
  });
});

describe('every key', () => {
  it('reads branches, outOfScope and base', () => {
    const config = parseConfig({ branches: ['work/{id}'], outOfScope: 'deny', base: 'origin/trunk' });
    expect(config.branches).toEqual(['work/{id}']);
    expect(config.outOfScope).toBe('deny');
    expect(config.base).toBe('origin/trunk');
    expect(parseConfig({ outOfScope: 'ask' }).outOfScope).toBe('ask');
    expect(parseConfig({ outOfScope: 'warn' }).outOfScope).toBe('warn');
    expect(parseConfig({ base: null }).base).toBeNull();
  });

  it('reads protectHarness, null where it is not set, and refuses any other value', () => {
    expect(DEFAULT_CONFIG.protectHarness).toBeNull();
    expect(parseConfig({ protectHarness: 'ask' }).protectHarness).toBe('ask');
    expect(parseConfig({ protectHarness: 'deny' }).protectHarness).toBe('deny');
    expect(parseConfig({ protectHarness: null }).protectHarness).toBeNull();
    for (const value of ['warn', true, 'Deny']) expect(refusal({ protectHarness: value }), String(value)).toBe('.spec-harness.json: "protectHarness" must be "ask", "deny" or null');
  });

  it('reads rulings, keeping the default of a key it leaves out', () => {
    expect(parseConfig({ rulings: { section: 'Decisions' } }).rulings).toEqual({ section: 'Decisions', allowedSigners: '.github/allowed_signers' });
    expect(parseConfig({ rulings: { allowedSigners: 'SIGNERS' } }).rulings).toEqual({ section: 'Rulings', allowedSigners: 'SIGNERS' });
    expect(parseConfig({ rulings: {} }).rulings).toEqual(DEFAULT_CONFIG.rulings);
  });

  it('reads dependencies, context, assertions and probes', () => {
    expect(parseConfig({ dependencies: { manifests: ['package.json'] } }).dependencies.manifests).toEqual(['package.json']);
    expect(parseConfig({ dependencies: { manifests: [] } }).dependencies.manifests).toEqual([]);
    expect(parseConfig({ dependencies: {} }).dependencies).toEqual(DEFAULT_CONFIG.dependencies);
    expect(parseConfig({ context: { budget: 1 } }).context.budget).toBe(1);
    expect(parseConfig({ context: {} }).context).toEqual(DEFAULT_CONFIG.context);
    expect(parseConfig({ assertions: { premises: ['Before'] } }).assertions.premises).toEqual(['Before']);
    expect(parseConfig({ assertions: {} }).assertions).toEqual(DEFAULT_CONFIG.assertions);
    expect(parseConfig({ probes: { runs: 5 } }).probes).toEqual({ runs: 5, timeout: 600 });
    expect(parseConfig({ probes: { timeout: 30 } }).probes).toEqual({ runs: 2, timeout: 30 });
    expect(parseConfig({ probes: { runs: 1, timeout: 1 } }).probes).toEqual({ runs: 1, timeout: 1 });
  });

  it('reads a tool command, and null as "find it"', () => {
    const config = parseConfig({ tools: { 'spec-brief': ['node', 'x.js'], 'spec-guard': null } });
    expect(config.tools).toEqual({ 'spec-brief': ['node', 'x.js'], 'spec-graph': null, 'spec-guard': null });
    expect(parseConfig({ tools: { 'spec-graph': ['spec-graph'] } }).tools['spec-graph']).toEqual(['spec-graph']);
    // The defaults are not shared with the configuration that changed them.
    expect(DEFAULT_CONFIG.tools['spec-brief']).toBeNull();
  });
});

describe('every refusal', () => {
  it('refuses what is not an object, naming the file', () => {
    expect(refusal([])).toBe('.spec-harness.json must hold a JSON object');
    expect(refusal(null)).toBe('.spec-harness.json must hold a JSON object');
    expect(refusal('x', 'custom.json')).toBe('custom.json must hold a JSON object');
  });

  it('refuses an unknown key at every level, listing the keys there are', () => {
    expect(refusal({ outofscope: 'warn' })).toBe(
      '.spec-harness.json: unknown key "outofscope"; the keys are $schema, branches, outOfScope, base, rulings, dependencies, context, assertions, probes, tools, turnReport, protectHarness',
    );
    expect(refusal({ rulings: { signers: 'x' } })).toBe('.spec-harness.json: "rulings": unknown key "signers"; the keys are section, allowedSigners');
    expect(refusal({ dependencies: { manifest: [] } })).toBe('.spec-harness.json: "dependencies": unknown key "manifest"; the keys are manifests');
    expect(refusal({ context: { limit: 5 } })).toBe('.spec-harness.json: "context": unknown key "limit"; the keys are budget');
    expect(refusal({ assertions: { goals: [] } })).toBe('.spec-harness.json: "assertions": unknown key "goals"; the keys are premises');
    expect(refusal({ probes: { retries: 1 } })).toBe('.spec-harness.json: "probes": unknown key "retries"; the keys are runs, timeout');
    expect(refusal({ tools: { 'spec-lint': ['x'] } })).toBe(
      '.spec-harness.json: "tools": unknown key "spec-lint"; the keys are spec-brief, spec-graph, spec-guard',
    );
  });

  it('refuses branches that are not a non-empty list of usable templates', () => {
    const list = '.spec-harness.json: "branches" must be a non-empty list of templates';
    expect(refusal({ branches: [] })).toBe(list);
    expect(refusal({ branches: 'brief/{id}' })).toBe(list);
    expect(refusal({ branches: [7] })).toBe(list);
    expect(refusal({ branches: ['brief/{id}', 'brief/'] })).toBe('.spec-harness.json: "branches": "brief/" must contain {id} exactly once');
    expect(refusal({ branches: ['{id}-x'] })).toContain('must end with {id}');
  });

  it('refuses an outOfScope it does not know', () => {
    expect(refusal({ outOfScope: 'block' })).toBe('.spec-harness.json: "outOfScope" must be "warn", "ask" or "deny"');
    expect(refusal({ outOfScope: null })).toBe('.spec-harness.json: "outOfScope" must be "warn", "ask" or "deny"');
  });

  it('refuses a base that is empty or not a string', () => {
    expect(refusal({ base: '' })).toBe('.spec-harness.json: "base" must be a non-empty string');
    expect(refusal({ base: '  ' })).toBe('.spec-harness.json: "base" must be a non-empty string');
    expect(refusal({ base: 3 })).toBe('.spec-harness.json: "base" must be a non-empty string');
  });

  it('refuses a section that is not an object, and each of its values', () => {
    for (const key of ['rulings', 'dependencies', 'context', 'assertions', 'probes', 'tools']) {
      expect(refusal({ [key]: [] })).toBe(`.spec-harness.json: "${key}" must be an object`);
      expect(refusal({ [key]: 'x' })).toBe(`.spec-harness.json: "${key}" must be an object`);
    }
    expect(refusal({ rulings: { section: '' } })).toBe('.spec-harness.json: "rulings.section" must be a non-empty string');
    expect(refusal({ rulings: { allowedSigners: 1 } })).toBe('.spec-harness.json: "rulings.allowedSigners" must be a non-empty string');
    expect(refusal({ dependencies: { manifests: 'package.json' } })).toBe('.spec-harness.json: "dependencies.manifests" must be a list of file names');
    expect(refusal({ dependencies: { manifests: [1] } })).toBe('.spec-harness.json: "dependencies.manifests" must be a list of file names');
    expect(refusal({ assertions: { premises: 'Premises' } })).toBe('.spec-harness.json: "assertions.premises" must be a list of section names');
  });

  it('refuses numbers that are not whole and at least 1', () => {
    expect(refusal({ context: { budget: 0 } })).toBe('.spec-harness.json: "context.budget" must be a whole number of at least 1');
    expect(refusal({ context: { budget: 1.5 } })).toBe('.spec-harness.json: "context.budget" must be a whole number of at least 1');
    expect(refusal({ context: { budget: '100' } })).toBe('.spec-harness.json: "context.budget" must be a whole number of at least 1');
    expect(refusal({ probes: { runs: -1 } })).toBe('.spec-harness.json: "probes.runs" must be a whole number of at least 1');
    expect(refusal({ probes: { timeout: null } })).toBe('.spec-harness.json: "probes.timeout" must be a whole number of at least 1');
  });

  it('refuses a tool command that is not a list with a first word, suggesting the form that runs on every host', () => {
    // node and the script: npx is a shim Windows cannot start without a shell, and siblings never run through one.
    const message =
      '.spec-harness.json: "tools.spec-brief" must be a command as a list, such as ["node", "node_modules/@spec-family/spec-brief/bin/spec-brief.js"], or null';
    expect(refusal({ tools: { 'spec-brief': [] } })).toBe(message);
    expect(refusal({ tools: { 'spec-brief': ['  ', 'x'] } })).toBe(message);
    expect(refusal({ tools: { 'spec-brief': 'node x.js' } })).toBe(message);
    expect(refusal({ tools: { 'spec-brief': [1] } })).toBe(message);
    expect(refusal({ tools: { 'spec-guard': [] } })).toBe(
      '.spec-harness.json: "tools.spec-guard" must be a command as a list, such as ["node", "node_modules/@spec-family/spec-guard/bin/spec-guard.js"], or null',
    );
  });
});

describe('the report at the end of a turn', () => {
  it('is off unless the configuration turns it on', () => {
    expect(DEFAULT_CONFIG.turnReport).toBe(false);
    expect(parseConfig({}).turnReport).toBe(false);
    expect(parseConfig({ turnReport: null }).turnReport).toBe(false);
    expect(parseConfig({ turnReport: false }).turnReport).toBe(false);
    expect(parseConfig({ turnReport: true }).turnReport).toBe(true);
  });

  it('is turned on by true alone', () => {
    for (const value of ['true', 1, 0, 'yes', {}, []]) expect(refusal({ turnReport: value }), JSON.stringify(value)).toBe('.spec-harness.json: "turnReport" must be true or false');
    expect(refusal({ turnreport: true })).toContain('the keys are $schema, branches, outOfScope, base, rulings, dependencies, context, assertions, probes, tools, turnReport, protectHarness');
  });
});
