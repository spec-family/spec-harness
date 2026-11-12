/**
 * Did the round stay inside the lines?
 *
 * One report, from three sources and one question of its own:
 *
 * - spec-brief's archive, asked with `--dry-run`: open boxes, protected files
 *   changed, files outside the scope, a tree that was not committed. The
 *   archive is spec-brief's decision, so its reasons are carried as they are
 *   - one defect, one finding - and the harness does not measure the scope a
 *   second time.
 * - spec-guard, over the brief's own assertions: the goals must hold now. A
 *   premise - an assertion in a section that states what was true before the
 *   round, such as "The Defect, Measured" - is expected to stop holding, and
 *   one that still holds says the defect may still be there.
 * - The rulings: each one whose signature does not verify is reported, since
 *   an unverified ruling allows nothing.
 * - And the one question nobody else asks: which dependencies the round
 *   added, and which packages it allowed to run install scripts. Either is
 *   code no reviewer read.
 *
 * A part that could not be measured is a finding, never a silence, and what
 * was measured is reported beside what was found: an audit that finds nothing
 * because it checked nothing must not read as one that checked and found
 * nothing (spec-core ADR-0005).
 */

import { CONFIG_FILE } from './config.js';
import { EARLIER_PLUGIN, PLUGIN } from './configure.js';
import { rooted, rulingFor, type VerifiedRuling } from './guard.js';
import type { DependencyChange, InstallScriptChange } from './manifests.js';
import { sameSection } from './reader.js';
import type { BriefRow, Finding, Severity } from './types.js';

export interface AssertionOutcome {
  readonly ok: boolean;
  readonly description: string;
  readonly message: string;
  readonly line: number;
  /** The brief section the directive sits in, or `null`. */
  readonly section: string | null;
  /** Every section it sits in, outermost first; `[section]` when not given. */
  readonly enclosing?: readonly string[] | undefined;
}

/** An assertion spec-guard could not read, as it reports it: nothing it states was run. */
export interface UnreadableAssertion {
  readonly message: string;
  readonly line: number;
  /** The directive as written. */
  readonly raw: string;
}

/** A reason spec-brief's archive gives; a `protected-file` refusal names its `path`. */
export interface ArchiveReason extends Finding {
  readonly path?: string | undefined;
}

/**
 * A key of the harness's configuration that the work tree's file sets to
 * one value and the configuration the round is measured by to another: in
 * words, each value as a person reads it, and where the second was read.
 */
export interface ConfigChange {
  readonly key: 'base' | 'rulings.allowedSigners';
  readonly workTree: string;
  readonly measured: string;
  readonly at: string;
}

export interface AuditInput {
  readonly brief: BriefRow;
  /** Why the round's changes could not be measured, when they could not. */
  readonly unmeasured: string | null;
  /** What the work tree's configuration says other than the one the round is measured by; none when not given. */
  readonly configChanges?: readonly ConfigChange[] | undefined;
  /**
   * Given where `--require-measured` is: a run that could not measure the
   * round fails. `unanchored` names where the base and the allowed signers
   * were read from where that is a place the round can change, and is
   * `null` where it is a ref the round cannot move.
   */
  readonly requireMeasured?: { readonly unanchored: string | null } | undefined;
  readonly dependencies: {
    readonly changes: readonly DependencyChange[];
    /** The entries of an install-script policy the round added, removed or turned; none when not given. */
    readonly installScripts?: readonly InstallScriptChange[] | undefined;
    readonly unread: readonly string[];
    /** Names in `dependencies.manifests` that could not be read, with spec-core's reason; none when not given. */
    readonly unreadNames?: readonly { readonly name: string; readonly reason: string }[] | undefined;
    /** Names in `dependencies.manifests` a leading `/` roots, and whether every alternative of each is rooted; none when not given. */
    readonly rootedNames?: readonly { readonly name: string; readonly whole: boolean }[] | undefined;
  };
  readonly archive: { readonly blocking: readonly ArchiveReason[]; readonly warnings: readonly ArchiveReason[] } | { readonly unavailable: string };
  readonly assertions: readonly AssertionOutcome[] | { readonly unavailable: string };
  /** The assertions in the brief spec-guard could not read; none when not given. */
  readonly unreadableAssertions?: readonly UnreadableAssertion[] | undefined;
  /** Section names whose assertions are premises. Compared without case, emphasis, a leading number or a trailing colon. */
  readonly premiseSections: readonly string[];
  readonly unverifiedRulings: readonly { readonly id: string; readonly reason: string }[];
  /** The rulings whose signatures verify, which a protected file the archive refuses may be covered by. */
  readonly verifiedRulings: readonly VerifiedRuling[];
  /** Whether spec-brief's configuration loads this package's plugin, through which its archive learns of them. */
  readonly pluginLoaded: boolean;
  /**
   * Whether, loading none by its name now, that configuration names the
   * plugin by the name of this package's releases up to 0.21.0, which
   * spec-brief loads from the earlier package; `false` when not given.
   */
  readonly pluginNamedEarlier?: boolean | undefined;
  /**
   * Whether the merge base was read in a history cut short, where git can
   * find an older one than the whole history has, and the round reads as
   * more than it changed; `false` when not given.
   */
  readonly shallow?: boolean | undefined;
}

/**
 * What the audit measured, beside what it found. A script tells "nothing
 * found" from "nothing checked" here: `assertions: "unavailable"` with no
 * goal failed is an audit that ran no goal.
 */
export interface Measured {
  /** Whether the round's changes were measured from a base; the dependencies are read from them. */
  readonly changes: 'measured' | 'unmeasured';
  /** Whether spec-brief's archive answered. */
  readonly archive: 'asked' | 'unavailable';
  /** Whether spec-guard ran the brief's assertions. */
  readonly assertions: 'run' | 'unavailable';
  readonly goals: { readonly held: number; readonly failed: number };
  readonly premises: { readonly retired: number; readonly holding: number };
  /** Assertions spec-guard could not read, so ran none of. */
  readonly unreadableAssertions: number;
  /** The rulings that allow something, by whether their signatures verify. */
  readonly rulings: { readonly verified: number; readonly unverified: number };
  /** Dependencies the round added, removed or moved, and manifests it changed that could not be read. */
  readonly dependencies: { readonly changed: number; readonly unread: number };
  /** Entries of an install-script policy the round added, removed or turned, in the manifests read for dependencies. */
  readonly installScripts: { readonly changed: number };
}

export interface AuditReport {
  readonly findings: readonly Finding[];
  readonly counts: Readonly<Record<Severity, number>>;
  readonly measured: Measured;
}

/**
 * Each rule the audit and `premises` report, as a reader of SARIF sees it
 * described. A reason spec-brief's archive gives is `archive/<its rule>`.
 */
export const RULES: Readonly<Record<string, string>> = {
  unmeasured: "The round's changes could not be measured from a base.",
  'harness-config-changed': "The work tree's .spec-harness.json changes the base or the allowed signers the round is measured by.",
  'harness-config-unanchored': 'The base and the allowed signers were read from a place the round can change, where --require-measured asks for a ref it cannot.',
  'history-shallow': 'The merge base was read in a shallow history, where git can find an older one than the whole history has.',
  'archive-unchecked': "spec-brief's archive could not be asked what it would refuse.",
  'assertions-unchecked': "The brief's assertions could not be run.",
  'assertion-unreadable': 'An assertion in the brief spec-guard cannot read, so nothing it states was run.',
  'goal-failed': 'A goal the brief asserts does not hold.',
  'premise-holds': 'A premise still holds after the round meant to change it.',
  'premise-retired': 'A premise no longer holds, as the round on the brief intends.',
  'stale-premise': "A live brief's premise no longer holds: what it was written against has changed.",
  'ruling-unverified': 'A ruling whose signature does not verify, which allows nothing.',
  'ruling-unreadable': 'A row of the rulings table that cannot be read.',
  'protection-rooted': "A protection rooted at the filesystem's root, which protects no path of the repository.",
  'ruling-path-rooted': "A signed ruling's path rooted at the filesystem's root, which allows nothing.",
  'manifest-name-unread': 'A name in dependencies.manifests that cannot be read, which names no manifest.',
  'manifest-name-rooted': "A name in dependencies.manifests rooted at the filesystem's root, where no file of the repository is.",
  'manifest-unread': 'A manifest the round changed that cannot be read for dependencies.',
  'new-dependency': 'A dependency the round added: code no reviewer read.',
  'dependency-removed': 'A dependency the round removed.',
  'dependency-changed': 'A dependency the round moved to another version.',
  'install-script-allowed': 'A package the round allowed to run install scripts: code no reviewer read, run on every install.',
  'install-script-denied': 'A package the round denied its install scripts.',
  'install-script-entry-removed': "An entry the round removed from a manifest's install-script policy.",
};

/**
 * The rules that say a part of the round was not measured, which
 * `--require-measured` fails: the round's changes, and the scope
 * spec-brief's archive could not check.
 */
const MEASURING: readonly string[] = ['unmeasured', 'archive/scope-unmeasured'];

/** The severity of what fails a run. */
const FAILS: Severity = 'error';

function finding(rule: string, severity: Severity, message: string, hint: string, file?: string, line?: number, subject?: string): Finding {
  return {
    rule,
    severity,
    message,
    hint,
    ...(file === undefined ? {} : { file }),
    ...(line === undefined ? {} : { line }),
    ...(subject === undefined ? {} : { subject }),
  };
}

/**
 * Whether an assertion's section is a premise section. Compared as the
 * rulings section is, and as spec-brief compares section names: a heading
 * written `## 3. **The Defect, Measured:**` is still the premise section, and
 * an assertion under it read as a goal would fail the round for retiring it.
 */
export function isPremise(sections: string | null | readonly string[], premises: readonly string[]): boolean {
  const list = sections === null ? [] : typeof sections === 'string' ? [sections] : sections;
  // A premise section's subsections are still premises: `### Before` under
  // `## The Defect, Measured` states what was true before the round.
  return list.some((section) => premises.some((premise) => sameSection(section, premise)));
}

/**
 * A live brief's premise that no longer holds, as `premises` reports it. On
 * the brief a round is working on - the one the flag, SPEC_BRIEF or the
 * branch names - that is what the round set out to do, and it is reported as
 * the audit reports it; on any other, what the brief was written against has
 * changed under it.
 */
export function premiseFinding(
  brief: Pick<BriefRow, 'id' | 'file'>,
  outcome: { readonly description: string; readonly message: string; readonly line: number },
  active: boolean,
): Finding {
  if (active) {
    return finding(
      'premise-retired',
      'note',
      `brief ${brief.id}'s premise no longer holds, as the round on it intends: ${outcome.description}`,
      'nothing to do: this is the round that changes it, and audit measures it',
      brief.file,
      outcome.line,
      outcome.description,
    );
  }
  return finding(
    'stale-premise',
    'error',
    `brief ${brief.id}'s premise no longer holds: ${outcome.description}: ${outcome.message}`,
    'what the brief was written against has changed; archive the brief if its work is done, or rewrite its premise before a round is run on it',
    brief.file,
    outcome.line,
    outcome.description,
  );
}

/**
 * A premise spec-guard cannot read, as `premises` reports it: nothing checks
 * whether it still holds, so a stale brief would pass for a live one. A
 * warning, as the audit's is, which fails the run under `--strict`.
 */
export function unreadablePremiseFinding(brief: Pick<BriefRow, 'id' | 'file'>, assertion: UnreadableAssertion): Finding {
  return finding(
    'assertion-unreadable',
    'warning',
    `spec-guard cannot read a premise of brief ${brief.id}, so whether it still holds is not checked: ${assertion.message}`,
    `fix the directive in ${brief.file}; until spec-guard can read it, nothing checks what it states`,
    brief.file,
    assertion.line,
    assertion.raw.trim(),
  );
}

/**
 * The next step for a reason the archive gives. A protected file a verified
 * ruling covers is refused only because the archive did not learn of the
 * ruling, and recording a departure in the brief would not fix that.
 */
function archiveHint(reason: ArchiveReason, input: AuditInput): string {
  const ruling = reason.rule === 'protected-file' && reason.path !== undefined ? rulingFor(input.verifiedRulings, reason.path) : undefined;
  if (ruling === undefined) return reason.hint;
  const allowed = `ruling ${ruling.id}, signed by ${ruling.signer}, allows it`;
  if (input.pluginLoaded) return `${allowed}, and the archive still refused it: check that spec-brief loads the spec-harness installed here and measures from the same base (spec-harness doctor)`;
  // Added beside the name an earlier release wrote, the name now would be a
  // second plugin of one name, which spec-brief refuses.
  if (input.pluginNamedEarlier === true) {
    return `${allowed}, but spec-brief's configuration names spec-harness's plugin "${EARLIER_PLUGIN}", by the name of this package's releases up to 0.21.0, so its archive asks that release and not the one installed here: run spec-harness init --write, which names "${PLUGIN}" in its place, since spec-brief refuses the two side by side`;
  }
  return `${allowed}, but spec-brief does not load spec-harness's plugin, which is how its archive learns of signed rulings: add "${PLUGIN}" to "plugins" in its configuration, or run spec-harness init --write`;
}

export function audit(input: AuditInput): AuditReport {
  const { brief } = input;
  const out: Finding[] = [];
  const goals = { held: 0, failed: 0 };
  const premises = { retired: 0, holding: 0 };

  if (input.unmeasured !== null) {
    out.push(
      finding(
        'unmeasured',
        'warning',
        `the round's changes were not measured: ${input.unmeasured}`,
        'pass --base <ref>, set "base" in .spec-harness.json, or audit on the round\'s branch before it merges',
        brief.file,
      ),
    );
  }

  for (const change of input.configChanges ?? []) {
    const said =
      change.key === 'base'
        ? `the work tree's ${CONFIG_FILE} measures the round from ${change.workTree}, where ${change.at} has ${change.measured}: the round is measured from ${change.measured}`
        : `the work tree's ${CONFIG_FILE} reads the allowed signers from ${change.workTree}, where ${change.at} has ${change.measured}: rulings are verified against ${change.measured}`;
    out.push(finding('harness-config-changed', 'warning', said, `a change to "${change.key}" counts once it is on the base: merge it there first, or take it out of the round`, CONFIG_FILE, undefined, change.key));
  }

  if (input.requireMeasured !== undefined && input.requireMeasured.unanchored !== null) {
    out.push(
      finding(
        'harness-config-unanchored',
        FAILS,
        `the round's base and allowed signers were read from ${input.requireMeasured.unanchored}, which the round can change`,
        "pass --base naming the branch rounds merge into as the forge has it, such as --base origin/main, or record the remote's default branch: git remote set-head origin --auto",
        CONFIG_FILE,
      ),
    );
  }

  if (input.shallow === true) {
    out.push(
      finding(
        'history-shallow',
        'note',
        "the history is shallow, so the merge base git found can be older than the one the whole history has, and the round's changes measured from it more than it made",
        'fetch the whole history, as fetch-depth: 0 or GIT_DEPTH: 0 does in CI',
        brief.file,
      ),
    );
  }

  if ('unavailable' in input.archive) {
    out.push(finding('archive-unchecked', 'warning', `what the archive would say is unknown: ${input.archive.unavailable}`, 'install spec-brief, or fix what stopped it', brief.file));
  } else {
    for (const reason of [...input.archive.blocking, ...input.archive.warnings]) {
      out.push(finding(`archive/${reason.rule}`, reason.severity, reason.message, archiveHint(reason, input), reason.file, reason.line, reason.path));
    }
  }

  if (!Array.isArray(input.assertions)) {
    const unavailable = (input.assertions as { unavailable: string }).unavailable;
    out.push(finding('assertions-unchecked', 'warning', `the brief's assertions were not run: ${unavailable}`, 'install spec-guard, or fix what stopped it', brief.file));
  } else {
    for (const outcome of input.assertions) {
      const premise = isPremise(outcome.enclosing ?? outcome.section, input.premiseSections);
      if (premise && outcome.ok) {
        premises.holding += 1;
        out.push(
          finding(
            'premise-holds',
            'warning',
            `a premise still holds after the round: ${outcome.description}`,
            'the round set out to change what this premise states; check that it did, or move the assertion out of the premises',
            brief.file,
            outcome.line,
            outcome.description,
          ),
        );
      } else if (premise) {
        premises.retired += 1;
        out.push(finding('premise-retired', 'note', `a premise no longer holds, as the round intended: ${outcome.description}`, 'nothing to do', brief.file, outcome.line, outcome.description));
      } else if (!outcome.ok) {
        goals.failed += 1;
        out.push(finding('goal-failed', 'error', `${outcome.description}: ${outcome.message}`, 'the round is not done until this holds', brief.file, outcome.line, outcome.description));
      } else {
        goals.held += 1;
      }
    }
  }
  // Whether a goal or a premise, an assertion spec-guard cannot read was not
  // run, and dropping it would let the audit pass on what it never checked.
  const unreadable = input.unreadableAssertions ?? [];
  for (const assertion of unreadable) {
    out.push(
      finding(
        'assertion-unreadable',
        'warning',
        `spec-guard cannot read an assertion in the brief, so nothing it states was run: ${assertion.message}`,
        `fix the directive in ${brief.file}; until spec-guard can read it, the audit measures nothing it states`,
        brief.file,
        assertion.line,
        assertion.raw.trim(),
      ),
    );
  }

  for (const ruling of input.unverifiedRulings) {
    out.push(
      finding(
        'ruling-unverified',
        'warning',
        `ruling ${ruling.id} allows nothing: ${ruling.reason}`,
        'a ruling counts when the commit that last changed its row is signed by a key in the base branch\'s allowed signers',
        brief.file,
        undefined,
        ruling.id,
      ),
    );
  }

  // A protection or a ruling's path a leading `/` roots can be read, and
  // names no path the guard or the archive decides, all repository-relative:
  // the file it was meant to protect was the round's to write, and the file
  // a ruling was meant to allow is still refused.
  for (const pattern of brief.protectedFiles) {
    const root = rooted(pattern);
    if (root === null) continue;
    const what = root === 'whole' ? 'which a leading "/" roots at the filesystem\'s root, so it protects no path' : 'an alternative of which a leading "/" roots at the filesystem\'s root, so that alternative protects no path';
    out.push(
      finding(
        'protection-rooted',
        'warning',
        `brief ${brief.id} protects "${pattern}", ${what}`,
        `write it without the leading "/" in ${brief.file}, since a protection is read from the repository's root, and check what the round changed there`,
        brief.file,
        undefined,
        pattern,
      ),
    );
  }
  for (const ruling of input.verifiedRulings) {
    for (const pattern of ruling.paths) {
      const root = rooted(pattern);
      if (root === null) continue;
      const what = root === 'whole' ? 'which a leading "/" roots at the filesystem\'s root, so it allows nothing' : 'an alternative of which a leading "/" roots at the filesystem\'s root, so that alternative allows nothing';
      out.push(
        finding(
          'ruling-path-rooted',
          'warning',
          `ruling ${ruling.id} allows "${pattern}", ${what}`,
          'a ruling\'s path is read from the repository\'s root: escalate again, and have the person rule on the path without the leading "/"',
          brief.file,
          undefined,
          `${ruling.id} ${pattern}`,
        ),
      );
    }
  }

  for (const { name, reason } of input.dependencies.unreadNames ?? []) {
    out.push(
      finding(
        'manifest-name-unread',
        'warning',
        `"dependencies.manifests" names "${name}", which cannot be read: ${reason}; no manifest it names was read`,
        `fix or remove the name in ${CONFIG_FILE}; the other names were read`,
        CONFIG_FILE,
        undefined,
        name,
      ),
    );
  }
  for (const { name, whole } of input.dependencies.rootedNames ?? []) {
    // Every path the audit reads is repository-relative, so a rooted name, or
    // a rooted alternative of one, names no manifest, as silently as a name
    // that cannot be read.
    const what = whole
      ? 'a leading "/" roots it at the filesystem\'s root, where no file of the repository is, so no manifest it names was read'
      : 'a leading "/" roots an alternative of it at the filesystem\'s root, where no file of the repository is, so that alternative names no manifest';
    out.push(
      finding(
        'manifest-name-rooted',
        'warning',
        `"dependencies.manifests" names "${name}": ${what}`,
        `write it without the leading "/" in ${CONFIG_FILE}, since a name is matched at any depth; the other names were read`,
        CONFIG_FILE,
        undefined,
        name,
      ),
    );
  }
  for (const file of input.dependencies.unread) {
    out.push(finding('manifest-unread', 'warning', `${file} changed and could not be read for dependencies`, 'check its dependencies by hand; the audit cannot', file));
  }
  for (const change of input.dependencies.changes) {
    const where = `${change.file} (${change.section})`;
    const subject = `${change.name} (${change.section})`;
    if (change.before === null) {
      out.push(
        finding(
          'new-dependency',
          'warning',
          `the round added ${change.ecosystem} dependency "${change.name}"${change.after === '' ? '' : ` ${change.after}`} in ${where}`,
          'say in the brief why it is needed, or remove it; a new dependency is code no reviewer read',
          change.file,
          undefined,
          subject,
        ),
      );
    } else if (change.after === null) {
      out.push(finding('dependency-removed', 'note', `the round removed "${change.name}" from ${where}`, 'nothing to do', change.file, undefined, subject));
    } else {
      out.push(finding('dependency-changed', 'note', `the round moved "${change.name}" from ${change.before} to ${change.after} in ${where}`, 'nothing to do, if the brief meant it', change.file, undefined, subject));
    }
  }
  // An entry is named as written, a version with it: npm pins an approval to
  // the version a person reviewed, so another version is another approval.
  // Only an approval is a grant. A denial and a removed approval stop a
  // script, and a removed denial approves nothing by itself: notes, as a
  // removed dependency is.
  const installScripts = input.dependencies.installScripts ?? [];
  for (const change of installScripts) {
    const where = `${change.file} (${change.section})`;
    const subject = `${change.name} (${change.section})`;
    if (change.after === 'allowed') {
      out.push(
        finding(
          'install-script-allowed',
          'warning',
          `the round allowed "${change.name}" to run install scripts in ${where}${change.before === 'denied' ? ', which denied it before' : ''}`,
          'say in the brief why its install scripts must run, or remove the entry; an install script is code no reviewer read, run on every install',
          change.file,
          undefined,
          subject,
        ),
      );
    } else if (change.after === 'denied') {
      const was = change.before === 'allowed' ? ', which allowed them before' : '';
      out.push(finding('install-script-denied', 'note', `the round denied "${change.name}" its install scripts in ${where}${was}`, 'nothing to do, if the brief meant it', change.file, undefined, subject));
    } else {
      const was = change.before === 'allowed' ? 'allowed' : 'denied';
      out.push(
        finding('install-script-entry-removed', 'note', `the round removed "${change.name}" from ${where}, which ${was} its install scripts`, 'nothing to do, if the brief meant it', change.file, undefined, subject),
      );
    }
  }

  // What could not be measured fails a run that requires it measured.
  const findings = input.requireMeasured === undefined ? out : out.map((found) => (MEASURING.includes(found.rule) ? { ...found, severity: FAILS } : found));
  const measured: Measured = {
    changes: input.unmeasured === null ? 'measured' : 'unmeasured',
    archive: 'unavailable' in input.archive ? 'unavailable' : 'asked',
    assertions: Array.isArray(input.assertions) ? 'run' : 'unavailable',
    goals,
    premises,
    unreadableAssertions: unreadable.length,
    rulings: { verified: input.verifiedRulings.length, unverified: input.unverifiedRulings.length },
    dependencies: { changed: input.dependencies.changes.length, unread: input.dependencies.unread.length },
    installScripts: { changed: installScripts.length },
  };
  return { findings, counts: tally(findings), measured };
}

/** How many findings of each severity. */
export function tally(findings: readonly Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { error: 0, warning: 0, note: 0 };
  for (const item of findings) counts[item.severity] += 1;
  return counts;
}

/**
 * What the audit measured, in one line a person reads above the counts. A
 * brief that declares no assertion says so, and draws no warning: a brief
 * without assertions is a brief, and the archive still measured its round.
 */
export function describeMeasured(measured: Measured): string {
  const { goals, premises, rulings, dependencies } = measured;
  const parts: string[] = [];
  if (measured.assertions === 'unavailable') {
    parts.push('assertions: not run');
  } else {
    parts.push(goals.held + goals.failed === 0 ? 'goals: none declared' : `goals: ${goals.held} held, ${goals.failed} failed`);
    parts.push(premises.retired + premises.holding === 0 ? 'premises: none declared' : `premises: ${premises.retired} retired, ${premises.holding} holding`);
  }
  if (measured.unreadableAssertions > 0) parts.push(`unreadable assertions: ${measured.unreadableAssertions}`);
  parts.push(measured.archive === 'asked' ? 'archive: asked' : 'archive: not asked');
  parts.push(rulings.verified + rulings.unverified === 0 ? 'rulings: none' : `rulings: ${rulings.verified} verified, ${rulings.unverified} unverified`);
  parts.push(measured.changes === 'unmeasured' ? 'dependencies: not measured' : `dependencies: ${dependencies.changed} changed, ${dependencies.unread} unread`);
  // Said only when a policy changed, as an assertion that cannot be read is:
  // most repositories have no such policy, and the line is a person's.
  if (measured.installScripts.changed > 0) parts.push(`install scripts: ${measured.installScripts.changed} changed`);
  return `measured: ${parts.join(' · ')}`;
}
