/**
 * A round, measured: the operations the command line and the MCP server
 * share. Each gathers what a pure module needs - from git, the disk and the
 * siblings - and hands it over; the decisions are made in `context.ts`,
 * `audit.ts`, `guard.ts` and `rulings.ts`.
 *
 * The hook loads this module before every write it decides, so what only
 * an audit, a verified ruling or `doctor` runs is imported where it runs:
 * the audit's judgement, which brings the Markdown scanner with it, the
 * hash a copy of the signers is named by, and what asks Claude Code its
 * release.
 */

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { readdir, readFile, rm } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readArchivePlan, readGuardRun } from './answers.js';
import type { ArchiveReason, AssertionOutcome, AuditInput, AuditReport, ConfigChange, UnreadableAssertion } from './audit.js';
import { SiblingOutputError } from './briefs.js';
import { CONFIG_FILE, configFromText, DEFAULT_CONFIG, type HarnessConfig } from './config.js';
import { sameId } from './branch.js';
import {
  arrayMatcher,
  enabledPlugin,
  exportedFile,
  handedLines,
  hooksDisabled,
  HOSTED_REGISTRY,
  isStarted,
  loadsEarlierPlugin,
  loadsPlugin,
  MARKETPLACE_REGISTRY,
  matchingUnder,
  patternReader,
  pluginMarketplace,
  onCiRunner,
  PLUGIN_SCRIPT,
  PROJECT_DIR,
  pluginPresence,
  projectScripts,
  type PluginScript,
  PROJECT_SETTINGS,
  readsOnFailure,
  registersServer,
  reportHooks,
  reportsTurns,
  SPEC_BRIEF_CONFIGS,
  startsSessions,
  wiringState,
  type BaseSource,
  type ClaudeCodeWiring,
  type ClaudeSettings,
  type PatternReader,
  type PluginsRoot,
  type PluginState,
} from './configure.js';
import { readRules, renderContext, type CitedDocument, type ContextPacket, type Rules } from './context.js';
import type { DocumentReader } from './document.js';
import { isDirectory, isFile, localSpelling, reachedBy, readJsonObject, readText, repositoryPath, stateDirectory, writeAtomic } from './fs.js';
import { blameLine, changes, commonDirectory, holdsPath, isShallow, isUncommitted, mergeBase, remoteDefault, revision, show, verifyCommit, workTreeRoot } from './git.js';
import { decide, decideWritten, heldForShare, type Decision, type VerifiedRuling } from './guard.js';
import { diffManifest, ecosystemOf, readManifestNames, type DependencyChange, type InstallScriptChange } from './manifests.js';
import {
  addRulingRow,
  nextId,
  readRulings,
  signersAtBoth,
  renderMemo,
  renderRow,
  type EscalationOption,
  type EscalationRequest,
  type RulingRow,
} from './rulings.js';
import type { BriefRow, Finding } from './types.js';
import { compileGlob, type LiteralReading } from './vendor/spec-core/pattern/index.js';
import { dirname, isRelativeReference, resolveInside, splitReference } from './vendor/spec-core/path/index.js';
import { SiblingError } from './siblings.js';
import { claudeHookLine, elsewhereHookLine, emptyValue, heldHookLine, holderHookLine, isBlank, outsideHookLine, type HookLine } from './usage.js';
import { checkClaudeCode, type ClaudeCodeCheck } from './versions.js';
import { activeBrief, describeActive, namedId, openWorkspace, parseOptions, UsageError, type CliIO, type Options, type Workspace } from './workspace.js';

/* -------------------------------------------------------------------- base */

/**
 * Where the harness's own configuration, the base and the allowed-signers
 * file it names, was read for a round: from the commit `--base` names,
 * from the remote's default branch, or, with neither, from the merge base
 * of HEAD and the base the work tree names. The first two are refs the
 * round cannot move from its own branch; the third is a commit before the
 * round's own where the round's history begins at the base, and the
 * round's own commit where it began the base itself (ADR-0006).
 */
export type Anchor = 'flag' | 'remote' | 'merge-base';

export type Base =
  | {
      readonly kind: 'resolved';
      readonly ref: string;
      readonly source: BaseSource;
      readonly sha: string;
      readonly mergeBase: string;
      readonly head: string;
      readonly anchor: Anchor;
      /** The allowed-signers file, as the configuration the round is measured by names it. */
      readonly signers: string;
      /** What the work tree's configuration says other than that one. */
      readonly changes: readonly ConfigChange[];
    }
  // A base that is not resolved has no anchor and no changes, said in the
  // type so that they are read without a test of the kind first: such a
  // test reads the same either way, and its mutants with it.
  | { readonly kind: 'unresolved'; readonly reason: string; readonly anchor?: never; readonly changes?: never };

/** A commit a ref names, as typed; or a branch a configuration names, as the remote's where it names no commit here. */
async function commitOf(ref: string, configured: boolean, root: string): Promise<{ readonly ref: string; readonly sha: string } | { readonly reason: string }> {
  const named = await revision(ref, root);
  if (named !== null) return { ref, sha: named };
  // A configured base is a branch's name, and a CI checkout fetches the
  // branch as the remote's alone, origin/main with no main: where the name
  // reads as no commit here, the remote's branch of that name is the base,
  // spelled as git reads it whatever a branch or a tag is called (git.ts,
  // remoteDefault). A base given on the command line is read as typed.
  if (!configured) return { reason: `"${ref}" names no commit` };
  const remote = `remotes/origin/${ref}`;
  const sha = await revision(remote, root);
  return sha === null ? { reason: `"${ref}" names no commit, and neither does ${remote}` } : { ref: remote, sha };
}

/**
 * The harness's configuration as a commit holds it: the defaults where it
 * holds no `.spec-harness.json`, and a refusal in words where what it holds
 * does not load.
 */
async function configAt(sha: string, root: string): Promise<HarnessConfig | { readonly reason: string }> {
  const text = await show(sha, CONFIG_FILE, root);
  if (text === null) return DEFAULT_CONFIG;
  try {
    return configFromText(text);
  } catch (error) {
    // configFromText throws nothing but its own refusal.
    return { reason: (error as Error).message };
  }
}

/**
 * What the round is measured from, and the configuration it is measured
 * by. The work tree's `.spec-harness.json` is the round's to edit, so it
 * does not choose the base or the allowed signers that vouch for the
 * round (ADR-0006): those are read from the configuration on the commit
 * `--base` names, on the remote's default branch, or at the merge base of
 * HEAD with the base the work tree names; and where the work tree says
 * otherwise, that is a change the audit reports.
 */
export async function resolveBase(workspace: Workspace, flag: string | undefined): Promise<Base> {
  const { root } = workspace;
  const unresolved = (reason: string): Base => ({ kind: 'unresolved', reason });
  const named = flag ?? workspace.config.base;
  // None of the three waits on another, so git is asked for them at once,
  // and what fails is said in the order it was before: a base that names
  // no commit before a HEAD that names none.
  const [remote, head, first] = await Promise.all([
    flag === undefined ? remoteDefault(root) : null,
    revision('HEAD', root),
    named === null ? null : commitOf(named, flag === undefined, root),
  ]);
  const noHead = 'HEAD names no commit: nothing is committed on this branch yet';
  let anchor: Anchor;
  let at: string;
  let found: { readonly ref: string; readonly sha: string } | { readonly reason: string };
  let source: BaseSource;
  let measured: HarnessConfig | { readonly reason: string };
  /** The merge base found on the way, where it is the base's. */
  let common: string | null = null;
  /** The commit the work tree's base names, as it would have been read: `null` where it names none. */
  let own: string | null;
  if (flag !== undefined || remote !== null) {
    anchor = flag === undefined ? 'remote' : 'flag';
    const anchored = flag === undefined ? await commitOf(remote!, false, root) : first!;
    if ('reason' in anchored) return unresolved(anchored.reason);
    if (head === null) return unresolved(noHead);
    at = flag ?? remote!;
    measured = await configAt(anchored.sha, root);
    if ('reason' in measured) return unresolved(`${CONFIG_FILE} on ${at} does not load, and the round is measured by it: ${measured.reason}`);
    // The commit --base names is the base; on the remote's default branch,
    // the base is what the configuration there names, or that branch.
    const configured = flag === undefined ? measured.base : null;
    source = flag !== undefined ? 'flag' : configured !== null ? 'config' : 'remote';
    found = configured === null ? anchored : await commitOf(configured, true, root);
    // Without --base the first wave read the work tree's base, where it
    // names one.
    own = workspace.config.base === null ? anchored.sha : 'sha' in first! ? first!.sha : null;
  } else {
    if (first === null) return unresolved('no base is named and the remote has no default branch; pass --base <ref> or set "base"');
    if ('reason' in first) return unresolved(first.reason);
    if (head === null) return unresolved(noHead);
    anchor = 'merge-base';
    source = 'config';
    const before = await mergeBase(first.sha, head, root);
    if (before === null) return unresolved(`"${first.ref}" and HEAD share no history`);
    at = `the merge base with ${first.ref}, ${before.slice(0, 12)}`;
    measured = await configAt(before, root);
    if ('reason' in measured) return unresolved(`${CONFIG_FILE} at ${at} does not load, and the round is measured by it: ${measured.reason}`);
    // A merge base with no base configured, as before the harness was set
    // up, says nothing of one, and the work tree's stands.
    const stands = measured.base === null || measured.base === named;
    found = stands ? first : await commitOf(measured.base!, true, root);
    if (stands) common = before;
    own = first.sha;
  }
  if ('reason' in found) return unresolved(found.reason);
  common ??= await mergeBase(found.sha, head, root);
  if (common === null) return unresolved(`"${found.ref}" and HEAD share no history`);
  const changes: ConfigChange[] = [];
  // The work tree's base is a change where it names another commit than the
  // base, or none: "main" beside a remote whose default branch is
  // origin/main names what the base is, in other words. Under --base it is
  // not read, and `own` is the commit --base names, so it changes nothing.
  if (own !== found.sha) {
    changes.push({ key: 'base', workTree: workspace.config.base ?? "the remote's default branch", measured: found.ref, at });
  }
  const signers = measured.rulings.allowedSigners;
  if (workspace.config.rulings.allowedSigners !== signers) changes.push({ key: 'rulings.allowedSigners', workTree: workspace.config.rulings.allowedSigners, measured: signers, at });
  return { kind: 'resolved', ref: found.ref, source, sha: found.sha, mergeBase: common, head, anchor, signers, changes };
}

/* ----------------------------------------------------------------- rulings */

export interface RulingCheck {
  readonly rows: readonly RulingRow[];
  readonly verified: readonly VerifiedRuling[];
  readonly unverified: readonly { readonly id: string; readonly reason: string }[];
  readonly problems: readonly Finding[];
}

/**
 * The brief's rulings, each checked against its signature: the commit that
 * last changed its row must be signed by a principal the base branch's
 * allowed-signers file lists (ADR-0006).
 */
export async function checkRulings(workspace: Workspace, brief: Pick<BriefRow, 'file'>, text: string, reader: DocumentReader, base: Base): Promise<RulingCheck> {
  const { rulings: rows, problems } = readRulings(reader.sectionTables(text, workspace.config.rulings.section).tables);
  const findings: Finding[] = problems.map((problem) => ({
    rule: 'ruling-unreadable',
    severity: 'warning',
    message: problem.message,
    hint: 'a ruling row is | id | `paths` | allow or deny | note |',
    file: brief.file,
    line: problem.line,
  }));
  const allows = rows.filter((row) => row.decision === 'allow');
  // Nothing below verifies a row that allows nothing, so this saves a git
  // show and is equivalent to its mutants.
  if (allows.length === 0) return { rows, verified: [], unverified: [], problems: findings };
  if (base.kind === 'unresolved') {
    return { rows, verified: [], unverified: allows.map((row) => ({ id: row.id, reason: `no base to read the allowed signers from: ${base.reason}` })), problems: findings };
  }
  // A signer counts where it is on the base and was there as the round
  // began: one the base's tip has and the merge base had not was added
  // while the round ran, and where the round chose its base, the tip is
  // the round's own (ADR-0006).
  // Where the round began at the base's tip the two are one file, read once.
  const tip = show(base.sha, base.signers, workspace.root);
  const [atTip, atStart] = await Promise.all([tip, base.mergeBase === base.sha ? tip : show(base.mergeBase, base.signers, workspace.root)]);
  if (atTip === null || atStart === null) {
    const missing = atTip === null ? base.ref : `the merge base with ${base.ref}, ${base.mergeBase.slice(0, 12)},`;
    const reason = `${missing} has no ${base.signers}, so no signature can count`;
    return { rows, verified: [], unverified: allows.map((row) => ({ id: row.id, reason })), problems: findings };
  }
  const signers = signersAtBoth(atTip, atStart);
  // Only verify-commit below reads this copy, so where it is kept is
  // equivalent to its mutants. It is named by the whole digest, read as hex
  // from its bytes: a digest asked for in no encoding, which a mutant of
  // `digest('hex')` asked for, named the file by bytes a path refuses when
  // one of them is NUL, so a sweep counted that mutant killed in some runs
  // and survived in others, by the bytes of the run's temporary paths. A
  // buffer refuses to be read in no encoding, every time, and the whole
  // digest has no cut that a mutant can leave out unseen.
  const directory = await stateDirectory(workspace.commonDir, 'signers');
  const { createHash } = await import('node:crypto');
  const file = join(directory, createHash('sha256').update(signers).digest().toString('hex'));
  await writeAtomic(file, signers);
  const verified: VerifiedRuling[] = [];
  const unverified: { id: string; reason: string }[] = [];
  for (const row of allows) {
    // The row's line is a line of the text on disk, so it is blamed there: at
    // HEAD the same number can be another line, one a signed commit wrote,
    // and an uncommitted row would borrow that commit's signature.
    const commit = await blameLine(null, brief.file, row.line, workspace.root);
    if (commit === null || isUncommitted(commit)) {
      unverified.push({ id: row.id, reason: 'its row is not committed' });
      continue;
    }
    const signature = await verifyCommit(commit, file, workspace.root);
    if (signature.good) verified.push({ id: row.id, paths: row.paths, signer: signature.principal });
    else unverified.push({ id: row.id, reason: `commit ${commit.slice(0, 12)} last changed its row, and ${signature.detail || 'it is not signed'}` });
  }
  return { rows, verified, unverified, problems: findings };
}

/* ------------------------------------------------------------------- guard */

export async function briefText(workspace: Workspace, brief: BriefRow): Promise<string> {
  const text = await readText(join(workspace.root, brief.file));
  if (text === null) throw new UsageError(`${brief.file} cannot be read`);
  return text;
}

/**
 * Decides paths against the brief, with the rulings verified against the
 * base `baseFlag` names, or the configured one. The reader may be given as
 * what makes one: it is asked for where a ruling is read, and a caller that
 * decides every write need not load a scanner for those that read none.
 */
export async function checkPaths(
  workspace: Workspace,
  brief: BriefRow | null,
  noBrief: string | undefined,
  given: readonly string[],
  cwd: string,
  reader: DocumentReader | (() => Promise<DocumentReader>),
  baseFlag: string | undefined,
): Promise<Decision[]> {
  // Each path as it reads and as the system writes it, which a link can make
  // two files: the last a path reaches is the one it is written to, or the
  // one it reads as where that is all it reaches (ADR-0005).
  // A share on this machine is read as the drive it names, and one that
  // names no drive is held: it can be the repository by another name.
  const resolved = given.map((path) => {
    const local = localSpelling(path, workspace.platform);
    const read = local === null ? null : { path: repositoryPath(local, workspace.root, cwd), written: repositoryPath(reachedBy(local, cwd).at(-1)!, workspace.root, cwd) };
    return { given: path, read };
  });
  const decideAll = (rulings: readonly VerifiedRuling[]): Decision[] =>
    resolved.map(({ given: g, read }) => {
      if (read === null) return heldForShare(g);
      const input = { path: read.path, given: g, brief, noBrief, rulings, outOfScope: workspace.config.outOfScope, protectHarness: workspace.config.protectHarness, signers: workspace.config.rulings.allowedSigners };
      return decideWritten(decide(input), { ...input, path: read.written });
    });
  const first = decideAll([]);
  // Rulings cost the reader of a brief, and a blame and a signature check
  // each, so they are read only when a write reaches a protected file. Read
  // anyway, they decide the same, since a ruling allows only a protected
  // path: what a mutant that always reads them changes is what is loaded
  // for a write no brief protects (loads.test.ts). With no brief nothing is
  // protected, so the null check is there for the type.
  if (brief === null || !first.some((decision) => decision.reason === 'protected')) return first;
  const text = await briefText(workspace, brief);
  const documents = typeof reader === 'function' ? await reader() : reader;
  // The base is where the allowed signers are read, and only a row that
  // allows something is checked against them: where none does, git is asked
  // nothing of the base, three processes of a refusal, and what was decided
  // without a ruling stands.
  const { rulings } = readRulings(documents.sectionTables(text, workspace.config.rulings.section).tables);
  if (!rulings.some((row) => row.decision === 'allow')) return first;
  const base = await resolveBase(workspace, baseFlag);
  return decideAll((await checkRulings(workspace, brief, text, documents, base)).verified);
}

/* ----------------------------------------------------------------- context */

/**
 * The paths spec-guard is asked about for a scope: where its patterns can
 * match. A name with no glob syntax that exists is asked about as itself,
 * since spec-guard reads from the disk whether a path is a file or a
 * directory. One the round has yet to create may become either, and
 * spec-guard would read it as a file, leaving out the rules over a
 * directory of that name; it is asked about through the directory that will
 * hold it, the root for a name at the top, which covers both.
 */
function scopeBases(root: string, patterns: readonly string[]): string[] {
  // Read as a directory, a name's base is the name itself; read any other
  // way, it is the directory holding it, so which other reading a missing
  // name gets changes nothing. The glob is compiled for its bases and never
  // matched: a file read as a directory narrows the question and nothing
  // else.
  const literal = (path: string): LiteralReading => (existsSync(join(root, path)) ? 'directory' : 'either');
  const bases = new Set<string>();
  for (const pattern of patterns) {
    try {
      // Case is read only in matching, which this compile never does: its
      // bases are the same either way, so `caseSensitive: false` is equivalent.
      for (const base of compileGlob(pattern, { dialect: 'path', caseSensitive: true, literal }).bases) {
        // A rooted alternative's base, `/docs` or `/`, is outside the
        // repository: it puts no path in the scope, and spec-guard refuses
        // the whole question for it, with the rules for every other base.
        // The packet names the pattern.
        if (base.startsWith('/')) continue;
        bases.add(base === '' ? '.' : base);
      }
    } catch {
      // The packet names a pattern the guard cannot read, with spec-core's
      // reason, and says so when it is every pattern; the rules for the rest
      // still count.
    }
  }
  return [...bases].sort();
}

async function rulesFor(workspace: Workspace, brief: BriefRow): Promise<Rules> {
  const paths = scopeBases(workspace.root, brief.affectedFiles);
  if (paths.length === 0) return [];
  try {
    const answer = await workspace.siblings.json('spec-guard', ['query', ...paths, '--json']);
    return 'absent' in answer ? { unavailable: answer.absent } : readRules(answer);
  } catch (error) {
    // spec-guard printed no JSON, or a document of another shape: what it
    // said instead, or what was wrong, is the reason, and the rest of the
    // packet stands without the rules.
    if (error instanceof SiblingError || error instanceof SiblingOutputError) return { unavailable: error.message };
    throw error;
  }
}

async function citedDocuments(workspace: Workspace, brief: BriefRow, text: string, reader: DocumentReader): Promise<CitedDocument[]> {
  const seen = new Set<string>();
  const out: CitedDocument[] = [];
  for (const citation of reader.citations(text)) {
    if (!isRelativeReference(citation.target)) continue;
    let target = splitReference(citation.target).path;
    try {
      target = decodeURIComponent(target);
    } catch {
      // A destination that is not valid percent-encoding is read as written.
    }
    const path = resolveInside(dirname(brief.file), target);
    if (path === null || path === brief.file || seen.has(path)) continue;
    seen.add(path);
    const document = /\.(?:md|markdown|mdx|txt)$/i.test(path);
    // A link to code or a directory that exists is not a document to include,
    // and must not be reported as a link that resolves to nothing.
    if (!document && existsSync(join(workspace.root, path))) continue;
    const content = document ? await readText(join(workspace.root, path)) : null;
    // A document that cannot be read is listed by its path alone, so its
    // title and status are never read, and an empty object is equivalent.
    const meta = content === null ? { title: null, status: null } : reader.titleAndStatus(content);
    out.push({ path, ...meta, text: content });
  }
  return out;
}

export async function buildContext(
  workspace: Workspace,
  brief: BriefRow,
  briefs: readonly BriefRow[],
  reader: DocumentReader,
  baseFlag: string | undefined,
): Promise<ContextPacket> {
  const text = await briefText(workspace, brief);
  const base = await resolveBase(workspace, baseFlag);
  const [rules, cited, rulings] = await Promise.all([
    rulesFor(workspace, brief),
    citedDocuments(workspace, brief, text, reader),
    checkRulings(workspace, brief, text, reader, base),
  ]);
  return renderContext({
    brief,
    briefText: text,
    dependencies: brief.dependsOn.map(
      (id) =>
        // spec-brief reports a dependency as its front matter spells it, `7` for brief 007.
        // The context reads a dependency's id, title, status and phase, and
        // the brief copied here is live.
        briefs.find((candidate) => sameId(candidate.id, id)) ?? { ...brief, id, title: '(no such brief)', status: 'unknown' },
    ),
    cited,
    rules,
    rulings: rulings.verified,
    unverified: rulings.unverified,
    branch: workspace.branch,
    base: base.kind === 'resolved' ? base.ref : null,
    budget: workspace.config.context.budget,
  });
}

/* ------------------------------------------------------------------- audit */

async function dependencyChanges(workspace: Workspace, base: Base): Promise<AuditInput['dependencies'] & { readonly installScripts: readonly InstallScriptChange[] }> {
  // A name that cannot be read is reported with or without a base: it would
  // leave its manifests out of every audit measured from one.
  const names = readManifestNames(workspace.config.dependencies.manifests);
  if (base.kind === 'unresolved') return { changes: [], installScripts: [], unread: [], unreadNames: names.unread, rootedNames: names.rooted };
  const isManifest = names.match;
  const out: DependencyChange[] = [];
  const installScripts: InstallScriptChange[] = [];
  const unread: string[] = [];
  for (const change of await changes(base.mergeBase, base.head, workspace.root)) {
    if (!isManifest(change.path) && !(change.from !== undefined && isManifest(change.from))) continue;
    const ecosystem = ecosystemOf(change.path);
    if (ecosystem === null) {
      unread.push(change.path);
      continue;
    }
    // git shows nothing where a file is not: an added manifest has no before,
    // and a deleted one no after.
    const before = await show(base.mergeBase, change.from ?? change.path, workspace.root);
    const after = await show(base.head, change.path, workspace.root);
    const diff = diffManifest(change.path, ecosystem, before, after);
    if ('error' in diff) {
      unread.push(change.path);
      continue;
    }
    out.push(...diff.changes);
    installScripts.push(...diff.installScripts);
  }
  return { changes: out, installScripts, unread, unreadNames: names.unread, rootedNames: names.rooted };
}

/** A file's real path, links and the filesystem's case resolved, or `null` when there is no such file. */
function realFile(path: string): string | null {
  try {
    return realpathSync.native(path);
  } catch {
    return null;
  }
}

/**
 * Whether a path spec-brief's `plugins` names, read from the root, is this
 * package's plugin: the file its `./spec-brief-plugin` export names, as the
 * project installed the package, or as this copy of it ships. spec-brief
 * loads a plugin by a path as well as by its name, and a path to the plugin
 * read as another plugin would say the archive cannot accept a ruling it can.
 */
export function pluginFile(root: string): (path: string) => boolean {
  const installed = join(root, 'node_modules', '@spec-family', 'spec-harness');
  const candidates: string[] = [fileURLToPath(new URL('../dist/plugin.js', import.meta.url))];
  try {
    // A manifest with no exports, or none for the plugin, throws in `join`
    // or on the missing key inside this block, which the catch reads as no
    // installed copy: `exports?.` and `target !== null` are equivalent to
    // their mutants here. So is the encoding: a Buffer parses as its text.
    // Only a file is read: what stands there and is none is no installed
    // copy, as a manifest with no exports is (ADR-0002).
    const file = join(installed, 'package.json');
    const manifest: { exports?: Record<string, unknown> } = isFile(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
    const target = exportedFile(manifest.exports?.['./spec-brief-plugin']);
    if (target !== null) candidates.push(join(installed, target));
  } catch {
    // Not installed at the root, or its manifest cannot be read: this copy's file is the one to compare.
  }
  // A candidate that names no file is `null` here, and so is a path that
  // names none, which is never the plugin.
  const files = new Set(candidates.map(realFile));
  return (path) => {
    const file = realFile(resolve(root, path));
    return file !== null && files.has(file);
  };
}

/** Whether spec-brief loads this package's plugin, as its configuration at the root says. */
export async function specBriefPlugin(root: string): Promise<PluginState> {
  const file = SPEC_BRIEF_CONFIGS.find((name) => existsSync(join(root, name)));
  if (file === undefined) return { kind: 'unconfigured' };
  const config = await readJsonObject(join(root, file));
  // The file was found a moment ago, so null is one removed in between, and
  // reads as the unreadable one it has become.
  if (config === null || config === 'unreadable') return { kind: 'unreadable', file };
  // One that names the plugin by its name now loads it, whatever else it
  // names; one that names it by an earlier release's name alone is said so.
  return { kind: loadsPlugin(config, pluginFile(root)) ? 'loaded' : loadsEarlierPlugin(config) ? 'earlier' : 'not-loaded', file };
}

/** Claude Code's configuration directory, where it is known: `CLAUDE_CONFIG_DIR`, otherwise `.claude` under the home directory it uses. */
function claudeConfigDirectory(env: CliIO['env'], platform: NodeJS.Platform): string | undefined {
  const home = (platform === 'win32' ? env['USERPROFILE'] : env['HOME']) || undefined;
  return env['CLAUDE_CONFIG_DIR'] || (home === undefined ? undefined : join(home, '.claude'));
}

/**
 * The directories Claude Code keeps plugins in, by its documentation
 * (https://code.claude.com/docs/en/env-vars, read 2026-10-12): the plugins
 * root, which is `CLAUDE_CODE_PLUGIN_CACHE_DIR` when that is set and
 * `plugins` in the configuration directory otherwise, and after it each
 * seed directory `CLAUDE_CODE_PLUGIN_SEED_DIR` names, separated by `;` on
 * Windows and `:` elsewhere. A seed has the layout of the root, by its page
 * on plugins for an organization
 * (https://code.claude.com/docs/en/plugins/org, Seed containers and CI,
 * read the same day). Read from the environment this runs in, as the
 * settings files are.
 */
export function pluginDirectories(env: CliIO['env'], platform: NodeJS.Platform = process.platform): string[] {
  const configDir = claudeConfigDirectory(env, platform);
  const plugins = env['CLAUDE_CODE_PLUGIN_CACHE_DIR'] || (configDir === undefined ? undefined : join(configDir, 'plugins'));
  const seeds = (env['CLAUDE_CODE_PLUGIN_SEED_DIR'] ?? '').split(platform === 'win32' ? ';' : ':').filter((seed) => seed !== '');
  return [...(plugins === undefined ? [] : [plugins]), ...seeds];
}

/**
 * What one of those directories holds of this package's plugin as
 * `marketplace` lists it: whether its cache has a version of it, one
 * directory each under the marketplace's and the plugin's names, that no
 * `.orphaned_at` marks as left behind by an update or an uninstall; the
 * record of marketplaces fetched; and whether a record of marketplaces
 * hosted on claude.ai stands beside it (the plugin loading reference, Find
 * plugins on disk, ADR-0012). Nothing else there is read.
 */
async function pluginsRoot(directory: string, marketplace: string): Promise<PluginsRoot & { readonly versions: readonly string[] }> {
  const versions = await cachedVersions(join(directory, 'cache', marketplace, 'spec-harness'));
  return { directory, cached: versions.length > 0, versions, registry: await readJsonObject(join(directory, MARKETPLACE_REGISTRY)), hosted: existsSync(join(directory, HOSTED_REGISTRY)) };
}

/** The directories of a cache's versions of the plugin, under `plugin`, that no `.orphaned_at` marks as left behind. */
async function cachedVersions(plugin: string): Promise<string[]> {
  try {
    const entries = await readdir(plugin, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory() && !existsSync(join(plugin, entry.name, '.orphaned_at'))).map((entry) => join(plugin, entry.name));
  } catch {
    // No directory for the plugin in this cache: it holds no version of it.
    return [];
  }
}

/**
 * What the plugin's hooks and server run from the project, read from each
 * version a cache holds, `hooks/hooks.json` and `.mcp.json`, the files
 * Claude Code loads them from; each is there where it is a file in one of
 * `places`, where `${CLAUDE_PROJECT_DIR}` can point. Where no version is
 * there to read, or none names a script, the plugin is the one a
 * relative path loads, or cannot be told to be here, and the script is the
 * one every release under `@spec-family` runs.
 */
async function pluginScripts(versions: readonly string[], places: readonly string[]): Promise<PluginScript[]> {
  const there = (script: string): boolean => places.some((place) => isFile(script.split(PROJECT_DIR).join(place)));
  const read: PluginScript[] = [];
  for (const version of versions) {
    for (const file of [join(version, 'hooks', 'hooks.json'), join(version, '.mcp.json')]) {
      for (const script of projectScripts(await readJsonObject(file))) read.push({ script, file, there: there(script) });
    }
  }
  return read.length > 0 ? read : [{ script: PLUGIN_SCRIPT, file: null, there: there(PLUGIN_SCRIPT) }];
}

/**
 * Claude Code's settings files that can turn a plugin on or hold a hook,
 * lowest precedence first: the user's, the project's, and the person's own
 * for the project. The user's is in `CLAUDE_CONFIG_DIR` when that is set,
 * otherwise in `.claude` under the home directory Claude Code uses,
 * `USERPROFILE` on Windows and `HOME` elsewhere; with neither it is not read.
 * Managed settings and `--settings` are not files a project can see.
 */
export function claudeSettingsFiles(root: string, env: CliIO['env'], platform: NodeJS.Platform = process.platform): { file: string; path: string }[] {
  const configDir = claudeConfigDirectory(env, platform);
  const user = configDir === undefined ? null : join(configDir, 'settings.json');
  return [
    ...(user === null ? [] : [{ file: user, path: user }]),
    { file: PROJECT_SETTINGS, path: join(root, '.claude', 'settings.json') },
    { file: '.claude/settings.local.json', path: join(root, '.claude', 'settings.local.json') },
  ];
}

/** The settings files Claude Code reads here, as read; one that is missing or cannot be read as JSON holds nothing. */
export async function claudeSettings(root: string, env: CliIO['env']): Promise<ClaudeSettings[]> {
  return Promise.all(claudeSettingsFiles(root, env).map(async ({ file, path }) => ({ file, settings: await readJsonObject(path) })));
}

/**
 * Whether the plugin, init's entries, both or neither wire Claude Code to the
 * harness here, and what the hook does with each line the settings hold for
 * it.
 *
 * A line is the hook's by the hook's own reading of it, whatever else stands
 * on it, and read as a session started at `root` hands it over: the project
 * is `root`, an empty `--root` is the directory the hook is started in, and
 * a relative one is read from there. A brief on it is asked of spec-brief, as
 * the hook asks. The plugin's own hooks are not read: they are files of a
 * release, in a directory Claude Code keeps, and every release wrote the
 * hook alone on their line, under the matcher init writes (ADR-0012). What
 * is read of that directory is whether the plugin is in it at all.
 *
 * `init` reads the wiring through this too, so that it and `doctor` say
 * the same of every tree, and hands it the reader it reads the matchers of
 * the same files with, so that the two read each pattern once between them.
 *
 * A matcher that lists names with a comma is read as the Claude Code on
 * `PATH` reads it, which turns on its release (configure.ts). `doctor`
 * reports the release, and asks it wherever something wires the guard,
 * since one too old for the hooks lets every write through: the lines are
 * first read as a release that cannot be told reads them, under which a
 * line that may be started counts as wiring. `init` has no other use for
 * the release, so it says that it does not report it, and it is asked only
 * where a line turns on it: where what is read of the lines differs between
 * a release that cannot be told and the newest.
 *
 * `doctor` also looks for the script each line runs in `places`, each
 * directory `${CLAUDE_PROJECT_DIR}` can name as a session starts, and says
 * a line whose script is in none as a guard that is off (reportHooks).
 * `init` gives none: it writes the line that names the project's install,
 * which may come after it.
 */
export async function claudeCodeWiring(root: string, io: CliIO, pattern: PatternReader = patternReader(), reported = true, places: readonly string[] | null = null): Promise<ClaudeCodeWiring> {
  const sources = await claudeSettings(root, io.env);
  // Each line is read once, before any is reported: what the brief on one
  // names is spec-brief's to say, and the report itself asks nothing.
  const read = new Map<string, HookLine | null>();
  for (const words of handedLines(sources, root)) read.set(JSON.stringify(words), await hookLineHere(words, root, io));
  const plugin = enabledPlugin(sources);
  // An id that names no marketplace has no directory to look in, and is said
  // as one that cannot be told whatever is on disk: pluginPresence answers
  // for it before it reads a directory, so what stands here for none is
  // equivalent to its mutant.
  const marketplace = plugin === null ? null : pluginMarketplace(plugin.id);
  const roots = marketplace === null ? [] : await Promise.all(pluginDirectories(io.env).map((directory) => pluginsRoot(directory, marketplace)));
  const presence = plugin === null ? null : pluginPresence(plugin, sources, roots, onCiRunner(io.env));
  const versions = roots.flatMap((root) => root.versions);
  // A plugin that is not on this machine, or on a runner where no session
  // runs, starts nothing: what it would run is read only where it may.
  const scripts = places === null || presence === null || presence.state === 'absent' || presence.state === 'unchecked' ? null : await pluginScripts(versions, places);
  const server = registersServer(await readJsonObject(join(root, '.mcp.json')));
  // A line under SessionStart is the hook's by the hook's own reading of it, as any line is.
  // A root on it that is no directory is a line of the hook that is off, and
  // one all the same, so the mutant of the test for a directory is
  // equivalent.
  const isHook = (words: readonly string[]): boolean => claudeHookLine(words, parseOptions, root, (path) => isDirectory(resolve(root, path))) !== null;
  const sessionStart = sources.some(({ settings }) => startsSessions(settings, isHook));
  const turnEnd = sources.some(({ settings }) => reportsTurns(settings, isHook));
  // init writes its hooks into the project's file alone, and none where an array unloads it.
  const unloaded = arrayMatcher(sources.find(({ file }) => file === PROJECT_SETTINGS)!.settings);
  const under = (release: ClaudeCodeCheck | null): ClaudeCodeWiring => {
    const lines = reportHooks(sources, root, (words) => read.get(JSON.stringify(words))!, pattern, matchingUnder(release), readsOnFailure(release), places === null ? null : { projects: places, isFile });
    // A line Claude Code starts for no write, before one or after, is in no
    // one's way: it is said, and the file is not counted for it.
    const hooks = sources.map(({ file }) => file).filter((file) => lines.some((line) => line.file === file && (isStarted(line.before) || isStarted(line.after))));
    // In the order a document has them, which a script may compare by the byte.
    return { plugin, presence, pluginVersions: versions.map((version) => basename(version)), pluginScripts: scripts, hooksOff: hooksDisabled(sources), hooks, lines, server, sessionStart, turnEnd, release, unloaded };
  };
  const untold = under(null);
  const asked = reported ? wiringState(untold) !== 'none' : JSON.stringify(untold.lines) !== JSON.stringify(reportHooks(sources, root, (words) => read.get(JSON.stringify(words))!, pattern));
  // Read again under the release, where it was asked: what is read without
  // one is what is read under one that cannot be told. What asks it is
  // loaded here, where it is asked: the hook loads these operations for
  // every write, and asks no release.
  return under(asked ? checkClaudeCode(await (await import('./host.js')).claudeVersion(io.env)) : null);
}

/**
 * What the hook does with the words a session started at `root` hands it:
 * its own reading of the line (usage.ts), and what follows from where its
 * root is, where the line guards. The hook opens the work tree its root is
 * in. Where the root is a directory in none, it reads a session outside a
 * work tree, checks no write and says nothing (ADR-0005): git is asked here
 * as the hook asks it, and the line is one under which the guard is off.
 * Where the root is in another work tree than the project's, the hook
 * decides by that work tree's briefs, and a file outside it is none of its
 * repository's: so a work tree that does not hold the project leaves every
 * write to a file of the project unchecked, and one that holds it checks
 * them, by its own briefs. Where the line names a brief, the hook asks
 * spec-brief in the work tree it opened which brief the name is, and holds
 * every write under a name that is none (ADR-0004). So this asks the same,
 * of the same work tree, and a line that holds every write is said as that
 * wherever its root is.
 */
async function hookLineHere(words: readonly string[], root: string, io: CliIO): Promise<HookLine | null> {
  const line = claudeHookLine(words, parseOptions, root, (path) => isDirectory(resolve(root, path)));
  // Only a line that guards gives a root to open or names a brief, so the
  // check of its state is the compiler's, and its mutant is equivalent.
  if (line === null || line.state !== 'guards') return line;
  let told: HookLine = line;
  // With no root on its line the hook opens the project, which is the work
  // tree this runs in: git is asked only about a root the line gives.
  if (line.root !== undefined) {
    const top = await workTreeRoot(resolve(root, line.root));
    if (top === null) return outsideHookLine(line.root);
    // The project's top as the root's work tree names it: nothing where the
    // two are one work tree, which is every root in the project, and
    // `null` where the project is not in it.
    const path = repositoryPath(root, top, root);
    if (path !== '') {
      // One repository's work trees share a git directory, and no two
      // repositories do.
      const [theirs, ours] = await Promise.all([commonDirectory(top), commonDirectory(root)]);
      const tree = { top, ours: theirs === ours };
      told = path === null ? elsewhereHookLine(line.root, tree) : holderHookLine(line, tree, path);
    }
  }
  if (line.brief === undefined) return told;
  const workspace = await openWorkspace({ root: line.root === undefined ? root : resolve(root, line.root) }, io);
  const { id, problem } = await diagnoseBrief(workspace, { brief: line.brief }, io.env);
  if (problem !== null) return heldHookLine(problem);
  // A spec-brief that cannot be run is no problem of a name given as a
  // flag, and the hook holds every write all the same: it asks spec-brief
  // about the brief its line names before each one.
  const sibling = workspace.siblings.locate('spec-brief');
  return sibling.kind === 'found' ? told : heldHookLine(couldNotSay(id, sibling.reason));
}

/**
 * The brief a round works on, as doctor reports it: its id, and what is
 * wrong with the name when no round can work under it. Every other command
 * stops there. A diagnosis says it, being what a person runs when the guard
 * holds a write they expected it to pass.
 *
 * `branch` is whether the name no round can work under is the branch's: a
 * brief it names that spec-brief does not know, or has archived. The hook
 * reads the same branch and holds every write under such a name, which is a
 * setup that holds every write, as a hook's line naming such a brief is
 * (ADR-0004). A name the flag gives is the question doctor was asked, and
 * holds no write of anyone's.
 *
 * `holds` is whether the branch names a brief and spec-brief cannot answer
 * for it: not installed, too old, or failing as it is asked. The hook asks
 * spec-brief before every write under the name, and holds each write it
 * cannot ask about, so that too is a setup that holds every write.
 *
 * `archived` is the brief the branch names where spec-brief has archived
 * it, which doctor reads further in git: the branch that archived it waits
 * to merge, and fails nothing (ADR-0004). It reads nothing else, and the
 * problem is the one every write is held with, as before.
 */
export async function diagnoseBrief(
  workspace: Workspace,
  options: Pick<Options, 'brief'>,
  env: CliIO['env'],
): Promise<{ readonly id: string | null; readonly problem: string | null; readonly branch: boolean; readonly holds: boolean; readonly archived: BriefRow | null }> {
  // doctor fails a --brief given nothing whatever this says of the branch
  // and of what is held, and reads nothing else of them for it, so the
  // mutants of the two are equivalent.
  if (options.brief !== undefined && isBlank(options.brief)) return { id: null, problem: emptyValue('--brief', 'brief', options.brief), branch: false, holds: false, archived: null };
  const id = namedId(workspace, options, env);
  // Neither the flag nor SPEC_BRIEF names it, so the name is the branch's,
  // where something names one. A flag given only blanks was answered above.
  const byBranch = id !== null && options.brief === undefined && isBlank(env['SPEC_BRIEF'] ?? '');
  const sibling = workspace.siblings.locate('spec-brief');
  if (sibling.kind !== 'found') {
    // Under the flag or SPEC_BRIEF, a spec-brief that cannot be run is a row
    // of the report, with the reason. Under the branch it is the reason
    // the hook holds every write, and said as one it could not ask. There
    // `holds` fails doctor whatever `branch` says, and nothing else reads
    // `branch`, so its `false` is equivalent to its mutant.
    return byBranch ? { id, problem: couldNotSay(id, sibling.reason), branch: false, holds: true, archived: null } : { id, problem: null, branch: false, holds: false, archived: null };
  }
  try {
    // Where nothing names a brief, spec-brief is not asked (ADR-0004), and
    // there is no problem to state.
    const active = await activeBrief(workspace, options, env);
    const branch = (active.kind === 'unknown' || active.kind === 'archived') && active.source === 'branch';
    const archived = active.kind === 'archived' && active.source === 'branch' ? active.brief : null;
    return { id, problem: describeActive(active).problem, branch, holds: false, archived };
  } catch (error) {
    // Asking spec-brief throws nothing but this, so the check is equivalent
    // to its mutant; it keeps any other error the stack it needs.
    if (!(error instanceof SiblingError)) throw error;
    return { id, problem: couldNotSay(id, error.message), branch: false, holds: byBranch, archived: null };
  }
}

/**
 * What a branch that names a brief spec-brief has archived is, as git tells
 * it: the branch that archived the brief, whose round waits to merge, where
 * the brief's archived file is in HEAD and not at the merge base of the base
 * and HEAD; a branch whose brief was archived before it, where the file is
 * at the merge base already; and cannot tell wherever git does not say,
 * which fails doctor as such a branch did (ADR-0004).
 */
export type ClosedRound =
  | { readonly state: 'waiting-to-merge' | 'archived-before'; readonly brief: BriefRow; readonly ref: string; readonly mergeBase: string }
  | { readonly state: 'unknown'; readonly brief: BriefRow; readonly reason: string };

export async function closedRound(workspace: Workspace, base: Base, brief: BriefRow): Promise<ClosedRound> {
  if (base.kind === 'unresolved') {
    return { state: 'unknown', brief, reason: `the base cannot be resolved (${base.reason}): fetch it under that name, with its history, as git fetch origin main:main fetches main` };
  }
  const [shallow, atBase, atHead] = await Promise.all([isShallow(workspace.root), holdsPath(base.mergeBase, brief.file, workspace.root), holdsPath(base.head, brief.file, workspace.root)]);
  // A merge base read in a history cut short can be older than the one the
  // whole history has, and a file absent from it present at the true one.
  if (shallow !== false) {
    return { state: 'unknown', brief, reason: 'the history is shallow, or git cannot say that it is not, and a merge base found in it may be older than the one the whole history has: fetch the whole history' };
  }
  if (atBase === null || atHead === null) return { state: 'unknown', brief, reason: `git could not list ${brief.file} at the merge base with ${base.ref}, or at HEAD` };
  if (atBase) return { state: 'archived-before', brief, ref: base.ref, mergeBase: base.mergeBase };
  // Absent from HEAD as well, the archive is not committed, or the file is
  // not the one git names: neither is the archive this branch committed.
  if (!atHead) return { state: 'unknown', brief, reason: `${brief.file} is not committed at HEAD; commit the archive` };
  return { state: 'waiting-to-merge', brief, ref: base.ref, mergeBase: base.mergeBase };
}

/** The note on doctor's `brief` line for a branch that names a brief spec-brief has archived. */
export function describeClosedRound(closed: ClosedRound): string {
  const { id, file } = closed.brief;
  switch (closed.state) {
    case 'waiting-to-merge':
      return `brief ${id} was archived on this branch, which waits to merge: ${file} is in HEAD and not at the merge base with ${closed.ref}, ${closed.mergeBase.slice(0, 12)}, so this fails nothing; the hook holds every write on the branch all the same`;
    case 'archived-before':
      return `brief ${id} was archived before this branch: ${file} is at the merge base with ${closed.ref}, ${closed.mergeBase.slice(0, 12)}, so the branch is a closed round's, used again, and every write on it is held`;
    case 'unknown':
      return `whether brief ${id} was archived on this branch, which waits to merge, cannot be told: ${closed.reason}`;
  }
}

/** What is said of a brief spec-brief could not be asked about, and why. */
function couldNotSay(id: string | null, why: string): string {
  return `spec-brief could not say whether it knows brief ${id}: ${why}`;
}

async function archiveReasons(workspace: Workspace, brief: BriefRow, base: Base): Promise<{ blocking: ArchiveReason[]; warnings: ArchiveReason[] } | { unavailable: string }> {
  const args = ['archive', brief.id, '--dry-run', '--format', 'json', '--no-color'];
  if (base.kind === 'resolved') args.push('--base', base.ref);
  const answer = await workspace.siblings.json('spec-brief', args);
  // The audit listed the briefs through spec-brief before it asks this, so
  // an absent one stopped it there; the check is for the type.
  if ('absent' in answer) return { unavailable: answer.absent };
  if (answer.code === 2) return { unavailable: 'spec-brief could not plan the archive' };
  return readArchivePlan(answer.document);
}

/** The brief's assertions as spec-guard ran them, and those it could not read, which it lists apart as `errors`. */
async function briefAssertions(
  workspace: Workspace,
  brief: BriefRow,
  text: string,
  reader: DocumentReader,
): Promise<{ outcomes: AssertionOutcome[]; unreadable: UnreadableAssertion[] } | { unavailable: string }> {
  const answer = await workspace.siblings.json('spec-guard', [brief.file, '--ignore-status', '--json']);
  if ('absent' in answer) return { unavailable: answer.absent };
  if (answer.code === 2) return { unavailable: 'spec-guard could not run the brief\'s assertions' };
  const report = readGuardRun(answer.document);
  const own = (spec: { readonly file: string } | undefined): boolean => spec === undefined || spec.file.replace(/\\/g, '/') === brief.file;
  const outcomes = report.results
    .filter((result) => own(result.spec))
    .map((result) => {
      const line = result.spec?.line ?? 0;
      return { ok: result.ok, description: result.description, message: result.message, line, section: reader.sectionAt(text, line), enclosing: reader.sectionsAt(text, line) };
    });
  const unreadable = report.errors.filter((error) => own(error.spec)).map((error) => ({ message: error.message, line: error.spec?.line ?? 0, raw: error.raw }));
  return { outcomes, unreadable };
}

/**
 * Where a base read at the merge base was read from, said where
 * `--require-measured` fails the run for it: the round can make that
 * commit its own by beginning the base it names.
 */
const UNANCHORED = "the work tree's .spec-harness.json and the merge base of HEAD with the base it names";

export interface AuditResult {
  readonly brief: BriefRow;
  readonly base: Base;
  readonly report: AuditReport;
  readonly dependencies: readonly DependencyChange[];
  /** The entries of an install-script policy the round added, removed or turned. */
  readonly installScripts: readonly InstallScriptChange[];
}

export async function runAudit(workspace: Workspace, brief: BriefRow, reader: DocumentReader, baseFlag: string | undefined, requireMeasured = false): Promise<AuditResult> {
  const { audit, tally } = await import('./audit.js');
  const base = await resolveBase(workspace, baseFlag);
  const text = await briefText(workspace, brief);
  const [dependencies, archive, assertions, rulings, plugin, shallow] = await Promise.all([
    dependencyChanges(workspace, base),
    archiveReasons(workspace, brief, base),
    briefAssertions(workspace, brief, text, reader),
    checkRulings(workspace, brief, text, reader, base),
    specBriefPlugin(workspace.root),
    isShallow(workspace.root),
  ]);
  const unmeasured =
    base.kind === 'unresolved' ? base.reason : base.mergeBase === base.head ? `${base.ref} and HEAD are the same commit: there is nothing to measure` : null;
  const report = audit({
    brief,
    unmeasured,
    configChanges: base.changes,
    requireMeasured: requireMeasured ? { unanchored: base.anchor === 'merge-base' ? UNANCHORED : null } : undefined,
    dependencies,
    archive,
    assertions: 'unavailable' in assertions ? assertions : assertions.outcomes,
    // The audit reads no list as an empty one, and a run spec-guard could not
    // make has none, so a mutant of this test reads the same.
    unreadableAssertions: 'unavailable' in assertions ? [] : assertions.unreadable,
    premiseSections: workspace.config.assertions.premises,
    unverifiedRulings: rulings.unverified,
    verifiedRulings: rulings.verified,
    pluginLoaded: plugin.kind === 'loaded',
    pluginNamedEarlier: plugin.kind === 'earlier',
    // Only a merge base is read from the history, and a base not resolved has none.
    shallow: base.kind === 'resolved' && shallow === true,
  });
  const findings = [...rulings.problems, ...report.findings];
  return {
    brief,
    base,
    dependencies: dependencies.changes,
    installScripts: dependencies.installScripts,
    report: { findings, counts: tally(findings), measured: report.measured },
  };
}

/* -------------------------------------------------------------- escalation */

async function escalationDirectory(workspace: Workspace): Promise<string> {
  return stateDirectory(workspace.commonDir, 'escalations');
}

export async function listEscalations(workspace: Workspace): Promise<EscalationRequest[]> {
  const directory = await escalationDirectory(workspace);
  const out: EscalationRequest[] = [];
  for (const name of (await readdir(directory)).filter((n) => n.endsWith('.json')).sort()) {
    // What is no file is no request, and is passed over as one that cannot be read is.
    if (!isFile(join(directory, name))) continue;
    try {
      // A Buffer parses as its text, so the encoding is equivalent to its mutant.
      const request: EscalationRequest = JSON.parse(await readFile(join(directory, name), 'utf8'));
      out.push(request);
    } catch {
      // A request that cannot be read is skipped; listing it would list nothing true.
    }
  }
  return out;
}

export async function raiseEscalation(
  workspace: Workspace,
  brief: BriefRow,
  request: { paths: readonly string[]; reason: string; options: readonly EscalationOption[]; recommendation: string | null },
): Promise<{ request: EscalationRequest; memo: string }> {
  const existing = await listEscalations(workspace);
  const id = nextId('E', brief.id, existing.map((e) => e.id));
  const full: EscalationRequest = {
    id,
    brief: brief.id,
    briefFile: brief.file,
    paths: request.paths,
    reason: request.reason,
    options: request.options,
    recommendation: request.recommendation,
    created: new Date().toISOString(),
    branch: workspace.branch,
    head: await revision('HEAD', workspace.root),
  };
  await writeAtomic(join(await escalationDirectory(workspace), `${id}.json`), `${JSON.stringify(full, null, 2)}\n`);
  return { request: full, memo: renderMemo(full) };
}

/** Writes a person's ruling into the brief and retires the request. Never commits: the signature is the person's. */
export async function recordRuling(
  workspace: Workspace,
  escalationId: string,
  decision: 'allow' | 'deny',
  note: string,
  reader: DocumentReader,
): Promise<{ id: string; file: string; row: string }> {
  const request = (await listEscalations(workspace)).find((candidate) => candidate.id === escalationId.toUpperCase() || candidate.id === escalationId);
  if (request === undefined) throw new UsageError(`no escalation "${escalationId}" is waiting; spec-harness escalate --list shows those that are`);
  const path = join(workspace.root, request.briefFile);
  const text = await readText(path);
  if (text === null) throw new UsageError(`${request.briefFile} cannot be read`);
  const where = reader.sectionTables(text, workspace.config.rulings.section);
  const taken = readRulings(where.tables).rulings.map((row) => row.id);
  const id = nextId('R', request.brief, taken);
  const row = renderRow(id, request.paths, decision, note);
  await writeAtomic(path, addRulingRow(text, workspace.config.rulings.section, row, where));
  // Listed a moment ago; forced, a request another process retired in
  // between is not an error, so the option is equivalent to its mutants.
  await rm(join(await escalationDirectory(workspace), `${request.id}.json`), { force: true });
  return { id, file: request.briefFile, row };
}
