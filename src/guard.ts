/**
 * May this round write this file?
 *
 * The answer is read from the brief the round runs under: `protectedFiles`
 * are refused unless a person has ruled otherwise, `affectedFiles` are the
 * round's to write, and anything else is outside the scope the person
 * approved. A guard is a guardrail, not a boundary - an agent that writes
 * through a shell passes it - so the audit and spec-brief's archive are the
 * gates, and this is what keeps an honest agent from needing them (ADR-0005).
 */

import { globAlternatives, parseGlob, type Glob, type GlobAlternative } from './vendor/spec-core/pattern/index.js';
import type { OutOfScope } from './config.js';
import type { BriefRow } from './types.js';

export type Verdict = 'allow' | 'warn' | 'ask' | 'deny';

export type Reason =
  | 'outside-repository'
  | 'no-brief'
  | 'brief-file'
  | 'protected'
  | 'ruled'
  | 'unreadable-protection'
  | 'in-scope'
  | 'out-of-scope'
  | 'held';

export interface Decision {
  /** Repository-relative, or the path as given when it lies outside. */
  readonly path: string;
  readonly verdict: Verdict;
  readonly reason: Reason;
  /** The patterns or ruling that decided it. */
  readonly because: readonly string[];
  readonly message: string;
  readonly hint: string;
}

/** A ruling whose signature has been verified: a person allowed these paths. */
export interface VerifiedRuling {
  readonly id: string;
  readonly paths: readonly string[];
  readonly signer: string;
}

export interface GuardInput {
  /** Repository-relative POSIX path, or `null` for a path outside the repository. */
  readonly path: string | null;
  /** The path as the caller gave it, for messages. */
  readonly given: string;
  readonly brief: BriefRow | null;
  /** Why there is no brief, when there is none. */
  readonly noBrief?: string | undefined;
  readonly rulings: readonly VerifiedRuling[];
  readonly outOfScope: OutOfScope;
}

function compile(pattern: string): Glob | string {
  const parsed = parseGlob(pattern, { dialect: 'path', caseSensitive: true, literal: 'either' });
  return parsed.ok ? parsed.glob : parsed.error;
}

/**
 * Why the guard cannot read a pattern, in spec-core's words; `null` when it
 * can. The guard matches no path by a pattern it cannot read.
 */
export function whyUnreadable(pattern: string): string | null {
  const glob = compile(pattern);
  return typeof glob === 'string' ? glob : null;
}

/**
 * Whether a leading `/` roots a pattern the guard can read at the
 * filesystem's root: `whole` when every alternative is rooted, `part` when
 * some brace alternative is, `null` when none is or the pattern cannot be
 * read. The guard decides repository-relative paths, so a rooted
 * alternative matches none of them.
 */
export function rooted(pattern: string): 'whole' | 'part' | null {
  if (typeof compile(pattern) === 'string') return null;
  // spec-core refuses here only what its compile refuses, so a pattern the
  // guard reads always has its alternatives read.
  const { alternatives } = globAlternatives(pattern) as { readonly alternatives: readonly GlobAlternative[] };
  const roots = alternatives.filter((alternative) => alternative.rooted).length;
  if (roots === 0) return null;
  return roots === alternatives.length ? 'whole' : 'part';
}

function matching(patterns: readonly string[], path: string): { matched: string[]; unreadable: string[] } {
  const matched: string[] = [];
  const unreadable: string[] = [];
  for (const pattern of patterns) {
    const glob = compile(pattern);
    if (typeof glob === 'string') unreadable.push(`${pattern} (${glob})`);
    else if (glob.match(path)) matched.push(pattern);
  }
  return { matched, unreadable };
}

/** The first verified ruling whose paths cover `path`, read as the guard reads a scope. */
export function rulingFor(rulings: readonly VerifiedRuling[], path: string): VerifiedRuling | undefined {
  return rulings.find((candidate) => matching(candidate.paths, path).matched.length > 0);
}

const ESCALATE =
  'if the round cannot be done without it, stop and ask for a ruling: spec-harness escalate --path <file> --reason <why>, or the request_escalation tool';

/** Decides one path. Pure: the caller resolved the path, the brief and the rulings. */
export function decide(input: GuardInput): Decision {
  const { path, given, brief } = input;
  if (path === null) {
    return {
      path: given,
      verdict: 'allow',
      reason: 'outside-repository',
      because: [],
      message: `${given} is outside the repository; no brief governs it`,
      hint: 'nothing to do',
    };
  }
  if (brief === null) {
    return {
      path,
      verdict: 'allow',
      reason: 'no-brief',
      because: [],
      message: `no brief governs ${path}: ${input.noBrief ?? 'no active brief'}`,
      hint: 'name the brief this work belongs to, so its scope can be checked',
    };
  }
  if (path === brief.file) {
    return {
      path,
      verdict: 'allow',
      reason: 'brief-file',
      because: [],
      message: `${path} is brief ${brief.id} itself`,
      hint: 'tick or disposition its boxes as the work lands',
    };
  }

  const protectedHits = matching(brief.protectedFiles, path);
  if (protectedHits.unreadable.length > 0) {
    // A protection that cannot be read cannot be honoured, and cannot be
    // assumed not to apply: refuse until the brief is fixed.
    return {
      path,
      verdict: 'deny',
      reason: 'unreadable-protection',
      because: protectedHits.unreadable,
      message: `brief ${brief.id} protects files with a pattern that cannot be read: ${protectedHits.unreadable.join('; ')}`,
      hint: `fix protectedFiles in ${brief.file} (spec-brief lint names the problem)`,
    };
  }
  if (protectedHits.matched.length > 0) {
    const ruling = rulingFor(input.rulings, path);
    if (ruling !== undefined) {
      return {
        path,
        verdict: 'allow',
        reason: 'ruled',
        because: [ruling.id],
        message: `${path} is protected by brief ${brief.id}, and ruling ${ruling.id}, signed by ${ruling.signer}, allows it`,
        hint: 'keep the change to what the ruling allows',
      };
    }
    return {
      path,
      verdict: 'deny',
      reason: 'protected',
      because: protectedHits.matched,
      message: `brief ${brief.id} does not empower this round to change ${path} (protectedFiles: ${protectedHits.matched.join(', ')})`,
      hint: ESCALATE,
    };
  }

  const affectedHits = matching(brief.affectedFiles, path);
  if (affectedHits.matched.length > 0) {
    return {
      path,
      verdict: 'allow',
      reason: 'in-scope',
      because: affectedHits.matched,
      message: `${path} is in brief ${brief.id}'s scope (${affectedHits.matched.join(', ')})`,
      hint: 'nothing to do',
    };
  }

  const verdict: Verdict = input.outOfScope;
  const scope = brief.affectedFiles.length === 0 ? 'declares no affectedFiles' : `covers ${brief.affectedFiles.join(', ')}`;
  return {
    path,
    verdict,
    reason: 'out-of-scope',
    because: affectedHits.unreadable,
    message: `${path} is outside brief ${brief.id}'s scope, which ${scope}`,
    hint:
      verdict === 'deny'
        ? `add it to affectedFiles in ${brief.file} if the round needs it, which is a change the person who approved the brief must see; or ${ESCALATE}`
        : `if the round needs it, say so in ${brief.file} and add it to affectedFiles; the archive reports every file outside the scope`,
  };
}

/**
 * The verdicts that hold a write, from the least to the most. `allow` holds
 * nothing, and is read below each: `indexOf` has it at -1.
 */
const STRICTNESS: readonly Verdict[] = ['warn', 'ask', 'deny'];

/**
 * A path decided as it reads and as the system writes it, where a link has
 * the two name two files (ADR-0005): `read` is the decision of the first,
 * and `written` the input of the second. Which of the two Claude Code's
 * tools write is not on its pages, so the stricter stands and no link makes
 * a protected file read as another; where neither is stricter, the path is
 * decided as it reads, as it was. The written decision is said with the
 * path as it was given, which reads as another file.
 */
export function decideWritten(read: Decision, written: GuardInput): Decision {
  const other = decide(written);
  if (STRICTNESS.indexOf(other.verdict) <= STRICTNESS.indexOf(read.verdict)) return read;
  return { ...other, message: `${written.given} is written to ${other.path} through a link: ${other.message}` };
}

/**
 * A path whose write the hook holds whatever the path is, but where it lies
 * outside every work tree of the repository: what names the brief names
 * none a round can work under, one spec-brief does not list or has
 * archived (ADR-0004). Refused, in the words the hook holds the write with
 * and its next step, so that the server's `check_path` answers the path as
 * the hook decides a write of it (ADR-0008).
 */
export function heldBy(path: string, problem: string): Decision {
  return { path, verdict: 'deny', reason: 'held', because: [], message: problem, hint: 'fix the brief or the branch before writing' };
}

/** What the hook says next of a path with a `..` that it holds as one that may be in a work tree. */
export const DOTS_MEND = 'write the path without its .., as it resolves';

/**
 * A path with a `..` in it that reads as a file outside every work tree of
 * the repository, held where the hook holds every write in one: a link
 * before the `..` can lead back into a work tree, so the hook does not take
 * the path for one outside (fs.ts, dotsOutside). Refused in its own words,
 * where it was refused in the words of `problem`, which decides no file
 * outside the repository.
 */
export function heldForDots(path: string, problem: string): Decision {
  return {
    path,
    verdict: 'deny',
    reason: 'held',
    because: [],
    message: `${path} has a .. in it and reads as a file outside every work tree of the repository, but a link before the .. can lead back into one, so it is held as a write in the repository is while ${problem}`,
    hint: DOTS_MEND,
  };
}
