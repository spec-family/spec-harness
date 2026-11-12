/** Types shared across modules. Type-only: compiles to nothing. */

export type Severity = 'error' | 'warning' | 'note';

/** One thing a command found, where to fix it, and what to do next (spec-core ADR-0005). */
export interface Finding {
  readonly rule: string;
  readonly severity: Severity;
  readonly message: string;
  readonly hint: string;
  readonly file?: string | undefined;
  readonly line?: number | undefined;
  /**
   * What the finding is about - an assertion, a ruling, a dependency, a name -
   * in words that stay the same while it stays the same finding. With the rule
   * and the file it is the finding's identity, which a GitLab fingerprint is
   * made of; the message, the hint and the line never are.
   */
  readonly subject?: string | undefined;
}

/** A brief as `spec-brief list --format json` reports it. */
export interface BriefRow {
  readonly id: string;
  /** Repository-relative POSIX path. */
  readonly file: string;
  readonly title: string | null;
  readonly phase: 'live' | 'archived';
  readonly status: string | null;
  readonly type: string | null;
  readonly wave: number | null;
  readonly dependsOn: readonly string[];
  readonly affectedFiles: readonly string[];
  readonly protectedFiles: readonly string[];
  readonly tasks: { readonly total: number; readonly checked: number };
  readonly ready: boolean;
  readonly waitingOn: readonly string[];
  /**
   * What spec-brief could not read of the brief, as its list says: empty
   * where it read the whole, and absent from a spec-brief that does not say,
   * before 0.15.0 (versions.ts, PROBLEMS_SINCE).
   */
  readonly problems?: readonly BriefProblem[] | undefined;
}

/**
 * Something of a brief spec-brief could not read, as `list --format json`
 * reports it: its rule (`encoding`, `front-matter`, `field` or `glob`), the
 * front-matter key, or `null` for the text or the block as a whole, the
 * line, 1-based, and lint's words.
 */
export interface BriefProblem {
  readonly rule: string;
  readonly field: string | null;
  readonly line: number;
  readonly message: string;
}

/** A local branch: its name, and the short name git reads as it and nothing else, as a base is written. */
export interface LocalBranch {
  readonly name: string;
  readonly ref: string;
}

/** A file a range of commits changed, as `git diff --name-status` reports it. */
export interface FileChange {
  readonly status: 'A' | 'M' | 'D' | 'R' | 'C' | 'T';
  readonly path: string;
  /** The path it came from, for a rename or a copy. */
  readonly from?: string | undefined;
}
