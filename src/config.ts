/**
 * What `.spec-harness.json` may say, the defaults, and validation.
 *
 * Every key has a default, so a repository without the file works; a file
 * that says something this version does not understand stops the run with
 * exit 2, because a guard that silently ignored a misspelt key would be
 * guarding something other than what its owner wrote.
 */

import { templateError } from './branch.js';

export type OutOfScope = 'warn' | 'ask' | 'deny';

/** What a write to a file the harness's guard runs on gets, where the repository asks for more than the scope gives it. */
export type ProtectHarness = 'ask' | 'deny';

export interface HarnessConfig {
  /** Branch-name templates that carry the active brief's id (ADR-0004). */
  readonly branches: readonly string[];
  /** What a write outside the brief's `affectedFiles` gets: a warning, a question to the person, or a refusal. */
  readonly outOfScope: OutOfScope;
  /** The branch rounds merge into, which audits and rulings are measured against. `null`: the remote's default branch. */
  readonly base: string | null;
  readonly rulings: {
    /** The brief section whose table holds the rulings. */
    readonly section: string;
    /** The allowed-signers file, read from the base branch, never from the round's own tree. */
    readonly allowedSigners: string;
  };
  readonly dependencies: {
    /** Manifest file names whose added dependencies an audit reports. */
    readonly manifests: readonly string[];
  };
  readonly context: {
    /** The most a context packet may hold, in characters. Cited documents fill what the rest leaves; those that do not fit are named by path. */
    readonly budget: number;
  };
  readonly assertions: {
    /**
     * Brief sections whose assertions state what was true before the round -
     * the defect, measured - and are expected to stop holding when it ends.
     * Every other assertion in a brief is a goal.
     */
    readonly premises: readonly string[];
  };
  readonly probes: {
    /** How many times a probe runs; every run must agree. */
    readonly runs: number;
    /** Seconds one run may take. */
    readonly timeout: number;
  };
  /** The command for each sibling tool, or `null` to find it (ADR-0002). */
  readonly tools: Readonly<Record<SiblingName, readonly string[] | null>>;
  /**
   * Whether Claude Code's hook reports, at the end of each turn, the changed
   * paths the brief protects or that are outside its scope; off by default,
   * and `init` writes the entry that runs it only where it is on (ADR-0005).
   */
  readonly turnReport: boolean;
  /**
   * Whether a write to a file the guard runs on or takes its trust from
   * (guard.ts, HARNESS_FILES) is put to the person or refused; `null`, as
   * by default, decides it by the brief as any other file (ADR-0005).
   */
  readonly protectHarness: ProtectHarness | null;
}

export type SiblingName = 'spec-brief' | 'spec-graph' | 'spec-guard';
export const SIBLINGS: readonly SiblingName[] = ['spec-brief', 'spec-graph', 'spec-guard'];

export const CONFIG_FILE = '.spec-harness.json';

/** spec-brief's configuration files, in the order spec-brief looks for them in a directory. */
export const SPEC_BRIEF_CONFIGS: readonly string[] = ['.spec-brief.json', 'spec-brief.json'];

export const DEFAULT_MANIFESTS: readonly string[] = [
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
];

export const DEFAULT_CONFIG: HarnessConfig = {
  branches: ['brief/{id}', 'brief-{id}', '*/brief/{id}', '*/brief-{id}'],
  outOfScope: 'warn',
  base: null,
  rulings: { section: 'Rulings', allowedSigners: '.github/allowed_signers' },
  dependencies: { manifests: DEFAULT_MANIFESTS },
  context: { budget: 60_000 },
  assertions: { premises: ['The Defect, Measured', 'Premises', 'Preconditions'] },
  probes: { runs: 2, timeout: 600 },
  tools: { 'spec-brief': null, 'spec-graph': null, 'spec-guard': null },
  turnReport: false,
  protectHarness: null,
};

export class ConfigError extends Error {
  /**
   * The configuration file that did not load, where one stands at its path:
   * the one file a write may still reach while it does not (ADR-0005).
   * `null` for a configuration that was not read from a file.
   */
  readonly file: string | null;

  constructor(message: string, file: string | null = null) {
    super(message);
    this.name = 'ConfigError';
    this.file = file;
  }
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function checkKeys(value: Json, allowed: readonly string[], where: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new ConfigError(`${where}: unknown key "${key}"; the keys are ${allowed.join(', ')}`);
    }
  }
}

function positive(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new ConfigError(`${where} must be a whole number of at least 1`);
  }
  return value;
}

function nonEmpty(value: unknown, where: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new ConfigError(`${where} must be a non-empty string`);
  return value;
}

/** Validates a parsed configuration and fills in every default. */
export function parseConfig(raw: unknown, file = CONFIG_FILE): HarnessConfig {
  if (!isObject(raw)) throw new ConfigError(`${file} must hold a JSON object`);
  checkKeys(raw, ['$schema', 'branches', 'outOfScope', 'base', 'rulings', 'dependencies', 'context', 'assertions', 'probes', 'tools', 'turnReport', 'protectHarness'], file);

  let branches = DEFAULT_CONFIG.branches;
  if (raw['branches'] !== undefined) {
    if (!isStringList(raw['branches']) || raw['branches'].length === 0) {
      throw new ConfigError(`${file}: "branches" must be a non-empty list of templates`);
    }
    for (const template of raw['branches']) {
      const error = templateError(template);
      if (error !== null) throw new ConfigError(`${file}: "branches": ${error}`);
    }
    branches = raw['branches'];
  }

  let outOfScope = DEFAULT_CONFIG.outOfScope;
  if (raw['outOfScope'] !== undefined) {
    if (raw['outOfScope'] !== 'warn' && raw['outOfScope'] !== 'ask' && raw['outOfScope'] !== 'deny') {
      throw new ConfigError(`${file}: "outOfScope" must be "warn", "ask" or "deny"`);
    }
    outOfScope = raw['outOfScope'];
  }

  let base = DEFAULT_CONFIG.base;
  if (raw['base'] !== undefined && raw['base'] !== null) base = nonEmpty(raw['base'], `${file}: "base"`);

  let rulings = DEFAULT_CONFIG.rulings;
  if (raw['rulings'] !== undefined) {
    const value = raw['rulings'];
    if (!isObject(value)) throw new ConfigError(`${file}: "rulings" must be an object`);
    checkKeys(value, ['section', 'allowedSigners'], `${file}: "rulings"`);
    rulings = {
      section: value['section'] === undefined ? rulings.section : nonEmpty(value['section'], `${file}: "rulings.section"`),
      allowedSigners:
        value['allowedSigners'] === undefined
          ? rulings.allowedSigners
          : nonEmpty(value['allowedSigners'], `${file}: "rulings.allowedSigners"`),
    };
  }

  let dependencies = DEFAULT_CONFIG.dependencies;
  if (raw['dependencies'] !== undefined) {
    const value = raw['dependencies'];
    if (!isObject(value)) throw new ConfigError(`${file}: "dependencies" must be an object`);
    checkKeys(value, ['manifests'], `${file}: "dependencies"`);
    if (value['manifests'] !== undefined) {
      if (!isStringList(value['manifests'])) throw new ConfigError(`${file}: "dependencies.manifests" must be a list of file names`);
      dependencies = { manifests: value['manifests'] };
    }
  }

  let context = DEFAULT_CONFIG.context;
  if (raw['context'] !== undefined) {
    const value = raw['context'];
    if (!isObject(value)) throw new ConfigError(`${file}: "context" must be an object`);
    checkKeys(value, ['budget'], `${file}: "context"`);
    if (value['budget'] !== undefined) context = { budget: positive(value['budget'], `${file}: "context.budget"`) };
  }

  let assertions = DEFAULT_CONFIG.assertions;
  if (raw['assertions'] !== undefined) {
    const value = raw['assertions'];
    if (!isObject(value)) throw new ConfigError(`${file}: "assertions" must be an object`);
    checkKeys(value, ['premises'], `${file}: "assertions"`);
    if (value['premises'] !== undefined) {
      if (!isStringList(value['premises'])) throw new ConfigError(`${file}: "assertions.premises" must be a list of section names`);
      assertions = { premises: value['premises'] };
    }
  }

  let probes = DEFAULT_CONFIG.probes;
  if (raw['probes'] !== undefined) {
    const value = raw['probes'];
    if (!isObject(value)) throw new ConfigError(`${file}: "probes" must be an object`);
    checkKeys(value, ['runs', 'timeout'], `${file}: "probes"`);
    probes = {
      runs: value['runs'] === undefined ? probes.runs : positive(value['runs'], `${file}: "probes.runs"`),
      timeout: value['timeout'] === undefined ? probes.timeout : positive(value['timeout'], `${file}: "probes.timeout"`),
    };
  }

  const tools: Record<SiblingName, readonly string[] | null> = { ...DEFAULT_CONFIG.tools };
  if (raw['tools'] !== undefined) {
    const value = raw['tools'];
    if (!isObject(value)) throw new ConfigError(`${file}: "tools" must be an object`);
    checkKeys(value, SIBLINGS, `${file}: "tools"`);
    for (const name of SIBLINGS) {
      const command = value[name];
      if (command === undefined || command === null) continue;
      // A list that is not empty has a first entry: the `?.` is the
      // compiler's, and the mutant without it is equivalent.
      if (!isStringList(command) || command.length === 0 || command[0]?.trim() === '') {
        // A sibling runs without a shell, so the example is node and the
        // script: npx is a shim Windows cannot start without one.
        throw new ConfigError(`${file}: "tools.${name}" must be a command as a list, such as ["node", "node_modules/@spec-family/${name}/bin/${name}.js"], or null`);
      }
      tools[name] = command;
    }
  }

  const turnReport = raw['turnReport'] ?? DEFAULT_CONFIG.turnReport;
  if (typeof turnReport !== 'boolean') throw new ConfigError(`${file}: "turnReport" must be true or false`);

  const protectHarness = raw['protectHarness'] ?? DEFAULT_CONFIG.protectHarness;
  if (protectHarness !== null && protectHarness !== 'ask' && protectHarness !== 'deny') throw new ConfigError(`${file}: "protectHarness" must be "ask", "deny" or null`);

  return { branches, outOfScope, base, rulings, dependencies, context, assertions, probes, tools, turnReport, protectHarness };
}
