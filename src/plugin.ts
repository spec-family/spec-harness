/**
 * The spec-brief plugin: signed rulings, read where spec-brief decides.
 *
 * spec-brief's archive refuses a round that changed a file its brief protects.
 * When a person has ruled that the round may change it, and signed the ruling
 * (ADR-0006), the refusal is lifted - but spec-brief does not read signatures,
 * and should not: the tool that defines a format ships the check for it
 * (spec-brief ADR-0007). So the check ships here, and spec-brief asks it
 * through its plugin `waive` hook, once its configuration loads the plugin,
 * as `spec-harness init` writes it:
 *
 * ```json
 * { "plugins": ["@spec-family/spec-harness/spec-brief-plugin"] }
 * ```
 *
 * It waives a `protected-file` refusal for a path a verified `allow` ruling
 * names, and a `scope-changed` warning for a pattern the round dropped from
 * `protectedFiles` or added to `affectedFiles`, where a person ruled on it
 * (below), and nothing else. A ruling that does not verify waives nothing.
 */

import { loadConfig } from './fs.js';
import { commonDirectory, currentBranch } from './git.js';
import { rulingFor } from './guard.js';
import { createReader } from './reader.js';
import { checkRulings, resolveBase } from './round.js';
import { createSiblings } from './siblings.js';
import type { Workspace } from './workspace.js';

export interface WaiveContext {
  readonly root: string;
  /** spec-brief passes a `null` id for a brief it could not name; its file still identifies it. */
  readonly brief: { readonly id: string | null; readonly file: string; readonly text: string };
  readonly findings: readonly Finding[];
  /**
   * The plan's warnings a plugin may lift, its `scope-changed` ones, from
   * the spec-brief that hands them (spec-brief#90); none from one before it.
   * Under `--strict` they are refusals, among `findings`.
   */
  readonly warnings?: readonly Finding[] | undefined;
  readonly base: string | null;
  readonly commit: string | null;
}

export interface Waiver {
  readonly rule: string;
  readonly path: string;
  readonly reason: string;
}

/** A finding as spec-brief hands it a plugin: its rule, and the path or paths it is about. */
export type Finding = { readonly rule: string; readonly path?: string | undefined; readonly paths?: readonly string[] | undefined };

/**
 * The pattern spec-brief reports where a brief's `affectedFiles` empties, a
 * scope that bounds nothing: no ruling lifts that, since no ruling can name
 * every file.
 */
const UNBOUNDED = '**';

/**
 * Paths a finding names, in either of the shapes spec-brief reports them. A
 * finding with neither names none, and a path no ruling names is waived for
 * none, so the empty list is equivalent to its mutant.
 */
function pathsOf(finding: WaiveContext['findings'][number]): string[] {
  if (finding.path !== undefined) return [finding.path];
  return [...(finding.paths ?? [])];
}

export async function waive(context: WaiveContext): Promise<Waiver[]> {
  const protectedPaths = context.findings.filter((finding) => finding.rule === 'protected-file').flatMap(pathsOf);
  const changes = [...context.findings, ...(context.warnings ?? [])].filter((finding) => finding.rule === 'scope-changed' && finding.path !== undefined && finding.path !== UNBOUNDED);
  // Asking git about nothing waives nothing: this saves the asking, and its
  // mutant is equivalent.
  if (protectedPaths.length === 0 && changes.length === 0) return [];
  const { config } = await loadConfig(context.root);
  const workspace: Workspace = {
    root: context.root,
    // spec-brief runs in a work tree, where git always names the common
    // directory; the fallback is there for the type.
    commonDir: (await commonDirectory(context.root)) ?? `${context.root}/.git`,
    config,
    siblings: createSiblings(context.root, config),
    branch: await currentBranch(context.root),
    cwd: context.root,
  };
  const base = await resolveBase(workspace, context.base ?? undefined);
  const { verified } = await checkRulings(workspace, { file: context.brief.file }, context.brief.text, createReader(), base);
  const waivers: Waiver[] = [];
  for (const path of protectedPaths) {
    const ruling = rulingFor(verified, path);
    if (ruling !== undefined) {
      waivers.push({ rule: 'protected-file', path, reason: `ruling ${ruling.id}, signed by ${ruling.signer}, allows it` });
    }
  }
  // A scope change is lifted where a person ruled on it: a verified ruling
  // that names the pattern itself, or verified rulings that allow every file
  // the change let through, where it let one through. A change that let
  // none through yet is a loosened brief that no ruling has spoken to, and
  // stays a warning (agreed with spec-brief's round 29).
  for (const change of changes) {
    const pattern = change.path!;
    if (waivers.some((waiver) => waiver.rule === 'scope-changed' && waiver.path === pattern)) continue;
    const named = verified.find((ruling) => ruling.paths.includes(pattern));
    if (named !== undefined) {
      waivers.push({ rule: 'scope-changed', path: pattern, reason: `ruling ${named.id}, signed by ${named.signer}, names ${pattern}` });
      continue;
    }
    const files = change.paths ?? [];
    const covering = files.map((file) => rulingFor(verified, file));
    if (files.length === 0 || covering.includes(undefined)) continue;
    const ids = [...new Set(covering.map((ruling) => `${ruling!.id}, signed by ${ruling!.signer}`))];
    waivers.push({ rule: 'scope-changed', path: pattern, reason: `every file it let through is allowed: ${ids.map((id) => `ruling ${id}`).join('; ')}` });
  }
  return waivers;
}

/** The plugin, as spec-brief loads it: a function of its options returning `{ name, rules, waive }`. */
export default function specHarnessPlugin(): { name: string; rules: readonly never[]; waive: typeof waive } {
  return { name: 'spec-harness', rules: [], waive };
}
