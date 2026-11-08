/**
 * Checks a release tag against the package, the changelog and the plugin's
 * manifests, before anything is built, and hands the release workflow what it
 * needs: the version, the npm dist-tag and the notes.
 *
 *   node scripts/release.ts v0.1.0 [notes-file]
 *
 * Exits 1 when the tag does not name the package's version, the changelog does
 * not describe it or the plugin names another, and 2 on bad arguments. Inside
 * GitHub Actions the outputs go to $GITHUB_OUTPUT; elsewhere they are printed.
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export interface Release {
  version: string;
  /** `latest`, or `next` for a prerelease, which must never become the default install. */
  distTag: string;
  notes: string;
}

export function releaseOf(tag: string, version: string, changelog: string): Release | string {
  if (tag !== `v${version}`) {
    return `the tag ${tag} does not name the package's version ${version}: tag v${version}, or change the version`;
  }
  const notes = changelogSection(changelog, version);
  if (notes === null) return `CHANGELOG.md has no "## ${version}" section with text in it; describe the release before tagging it`;
  return { version, distTag: version.includes('-') ? 'next' : 'latest', notes };
}

/**
 * The text under the `## <version>` heading, up to the next heading of that
 * level or above, or `null` when there is no such section or it is empty. The
 * heading may bracket the version and follow it with a date, as Keep a
 * Changelog does.
 */
export function changelogSection(changelog: string, version: string): string | null {
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((line) => headingVersion(line) === version);
  if (start === -1) return null;
  let end = start + 1;
  while (end < lines.length && !/^#{1,2} /.test(lines[end] as string)) end += 1;
  const body = lines.slice(start + 1, end).join('\n').trim();
  return body === '' ? null : body;
}

function headingVersion(line: string): string | null {
  if (!line.startsWith('## ')) return null;
  const name = line.slice(3).trim().split(/\s/)[0] as string;
  return name.startsWith('[') && name.endsWith(']') ? name.slice(1, -1) : name;
}

export const PLUGIN_MANIFEST = '.claude-plugin/plugin.json';
export const MARKETPLACE_MANIFEST = '.claude-plugin/marketplace.json';

/**
 * Where the Claude Code plugin names a version other than the package's, or
 * `null` when its manifest carries the package's and the marketplace lists
 * it with none of its own. The plugin is this package - its hooks and its
 * server run the spec-harness installed beside it - so a plugin at another
 * version would install as a release this tag is not.
 *
 * The version is written once, in the manifest. Claude Code takes the
 * manifest's `version` over the marketplace entry's, and
 * `claude plugin validate` warns where both name one (the marketplace
 * reference, Plugin entries, and the manifest reference, Metadata
 * precedence: https://code.claude.com/docs/en/plugins/marketplace-reference,
 * read 2026-11-08), so an entry's version is one nothing reads but the
 * warning.
 */
export function pluginDrift(version: string, plugin: unknown, marketplace: unknown): string | null {
  const entries = field(marketplace, 'plugins');
  const entry = Array.isArray(entries) ? (entries as unknown[]).find((candidate) => field(candidate, 'name') === 'spec-harness') : undefined;
  const named = field(plugin, 'version');
  const wrong: string[] = [];
  if (named !== version) {
    wrong.push(`${PLUGIN_MANIFEST} names ${typeof named === 'string' ? named : 'no version'}, where package.json names ${version}: the plugin is released with the package, at its version`);
  }
  if (entry === undefined) wrong.push(`${MARKETPLACE_MANIFEST} lists no spec-harness plugin`);
  else if (field(entry, 'version') !== undefined) {
    wrong.push(`the spec-harness plugin in ${MARKETPLACE_MANIFEST} names a version of its own: Claude Code reads ${PLUGIN_MANIFEST}'s before it, and claude plugin validate warns where both name one, so take it out`);
  }
  return wrong.length === 0 ? null : wrong.join('; ');
}

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>)[key] : undefined;
}

function main(argv: readonly string[]): number {
  const [tag, notesFile] = argv;
  if (tag === undefined || argv.length > 2) {
    console.error('usage: node scripts/release.ts <tag> [notes-file]');
    return 2;
  }
  const read = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'));
  const manifest = read('package.json') as { version: string };
  const release = releaseOf(tag, manifest.version, readFileSync('CHANGELOG.md', 'utf8'));
  if (typeof release === 'string') {
    console.error(release);
    return 1;
  }
  const drift = pluginDrift(release.version, read(PLUGIN_MANIFEST), read(MARKETPLACE_MANIFEST));
  if (drift !== null) {
    console.error(drift);
    return 1;
  }
  if (notesFile !== undefined) writeFileSync(notesFile, `${release.notes}\n`);
  const outputs = `version=${release.version}\ndist-tag=${release.distTag}\n`;
  const target = process.env.GITHUB_OUTPUT;
  if (target === undefined) process.stdout.write(outputs);
  else appendFileSync(target, outputs);
  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
