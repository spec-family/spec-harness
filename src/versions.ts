/**
 * The oldest release of each sibling this harness runs, and an installed
 * sibling measured against it.
 *
 * An older sibling is not run. It would answer, and the answer would lack what
 * this release relies on: spec-brief before 0.2.0 has no `waive` hook, so its
 * archive refuses a protected file a signed ruling allows. It is reported with
 * the minimum instead, as a missing sibling is reported (ADR-0002, ADR-0011).
 *
 * A sibling is looked for under `@spec-family` alone, and each minimum is its
 * first release there, from 2026-10-26 (spec-core's ADR-0005, Names): the
 * versions before it there are placeholders with no code. Each is later than
 * the release the reason beside it names, and has what that one brought.
 *
 * package.json says the same minimums to npm as `peerDependencies`; a test
 * holds the two together. So is the oldest Claude Code that runs the hooks,
 * which doctor measures the one on `PATH` against.
 */

import type { SiblingName } from './config.js';

export const MINIMUM_VERSIONS: Readonly<Record<SiblingName, string>> = {
  // The plugin `waive` hook, from 0.2.0, through which spec-brief's archive
  // accepts a protected file that a signed ruling allows.
  'spec-brief': '0.12.0',
  // An archived brief read as a record, as init configures it, from 0.9.0,
  // where an older release reads it as retired and what depends on it as a
  // stale premise.
  'spec-graph': '0.21.0',
  // Scopes read with the spec-core globs the harness reads them with, and an
  // archived brief's assertions withheld rather than run, from 0.12.0.
  'spec-guard': '0.30.0',
};

export interface Version {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: boolean;
}

/** A semver version, or `null`. Build metadata is accepted and ignored, as precedence ignores it. */
export function parseVersion(text: string): Version | null {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(text);
  if (match === null) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), prerelease: match[4] !== undefined };
}

/**
 * Whether `installed` is `minimum` or later by semver precedence. A minimum is
 * a release, never a prerelease, so a prerelease of the minimum comes before
 * it and a prerelease of anything later comes after it.
 */
export function meets(installed: Version, minimum: Version): boolean {
  const order = [installed.major - minimum.major, installed.minor - minimum.minor, installed.patch - minimum.patch].find((difference) => difference !== 0) ?? 0;
  return order > 0 || (order === 0 && !installed.prerelease);
}

export type VersionCheck =
  | { readonly ok: true; readonly version: string }
  | { readonly ok: false; readonly version: string | null; readonly reason: string };

/**
 * The `version` an installed sibling's package.json declares, against the
 * minimum. A version that cannot be read cannot be shown to meet it, and is
 * refused as an old one is.
 */
export function checkVersion(name: SiblingName, declared: unknown): VersionCheck {
  const minimum = MINIMUM_VERSIONS[name];
  const needs = `spec-harness needs ${minimum} or later: npm install --save-dev @spec-family/${name}@latest`;
  if (typeof declared !== 'string') return { ok: false, version: null, reason: `the ${name} installed here declares no version; ${needs}` };
  const parsed = parseVersion(declared);
  if (parsed === null) return { ok: false, version: declared, reason: `the ${name} installed here declares "${declared}", which is not a version; ${needs}` };
  if (meets(parsed, parseVersion(minimum) as Version)) return { ok: true, version: declared };
  return { ok: false, version: declared, reason: `${name} ${declared} is installed here; ${needs}` };
}

/**
 * The oldest Claude Code that runs the guard hooks (ADR-0012). Its changelog
 * adds hook `args` in 2.1.139. An older release runs the hook's bare
 * `command`, `node`, which reads the hook's input as a script and fails, and
 * a PreToolUse hook that fails with anything but exit 2 blocks nothing: every
 * write passes unguarded.
 */
export const CLAUDE_CODE_MINIMUM = '2.1.139';

/**
 * What `claude --version` printed; the version the package.json of the
 * Claude Code a Windows shim runs declares, which is `file`; or why neither
 * could be had.
 */
export type ClaudeCodeAnswer = { readonly output: string } | { readonly declared: string; readonly file: string } | { readonly missing: string };

export type ClaudeCodeCheck =
  /** `file` is the package.json the version was read from, when a shim was read rather than claude run. */
  | { readonly state: 'ok' | 'outdated'; readonly version: string; readonly file?: string }
  /** Never read as fine: an older release lets every write through. */
  | { readonly state: 'unknown'; readonly reason: string };

/**
 * The release `claude --version` names in its first word, `2.1.235 (Claude
 * Code)`, or the one a package.json declares, against the minimum.
 */
export function checkClaudeCode(answer: ClaudeCodeAnswer): ClaudeCodeCheck {
  if ('missing' in answer) return { state: 'unknown', reason: answer.missing };
  if ('declared' in answer) {
    const declared = parseVersion(answer.declared);
    if (declared === null) return { state: 'unknown', reason: `${answer.file} declares "${answer.declared}", which is not a version` };
    return { state: meets(declared, parseVersion(CLAUDE_CODE_MINIMUM) as Version) ? 'ok' : 'outdated', version: answer.declared, file: answer.file };
  }
  // split() gives at least one string, so the first line is always there.
  const said = answer.output.trim().split('\n')[0]!.trim();
  if (said === '') return { state: 'unknown', reason: 'claude --version printed nothing' };
  // What was said is trimmed and not empty, so its first part ends at the
  // first space, whether the pattern takes that one or the run of them: one
  // is equivalent to its mutant.
  const first = said.split(/\s+/)[0]!;
  const parsed = parseVersion(first);
  if (parsed === null) return { state: 'unknown', reason: `claude --version printed "${said}", which is not a version` };
  return { state: meets(parsed, parseVersion(CLAUDE_CODE_MINIMUM) as Version) ? 'ok' : 'outdated', version: first };
}

/**
 * The first release of spec-brief whose list says which briefs it could
 * not read whole, in each row's `problems` (spec-brief#89). An earlier one
 * lists a field it could not parse as empty, so a brief whose
 * `protectedFiles` it could not read is guarded as one that protects
 * nothing, with no word (round 29's evaluation; ADR-0005).
 */
export const PROBLEMS_SINCE = '0.15.0';

/** Whether a spec-brief of `version` says which briefs it could not read whole; a version that cannot be read is said not to. */
export function reportsUnread(version: string): boolean {
  const parsed = parseVersion(version);
  return parsed !== null && meets(parsed, parseVersion(PROBLEMS_SINCE)!);
}

/** What is said of a spec-brief that does not say which briefs it could not read whole, by its version where it is known. */
export function unreportedSaid(version: string | null): string {
  const which = version === null ? 'the spec-brief installed here' : `spec-brief ${version}`;
  return `${which} does not say which briefs it cannot read whole, so a brief whose protectedFiles it cannot read is guarded as one that protects nothing: spec-brief ${PROBLEMS_SINCE} or later says so, and the guard then holds that brief's writes`;
}
