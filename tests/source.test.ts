import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { minimumsOf } from '../scripts/minimum-siblings.js';
import { pluginDrift, releaseOf } from '../scripts/release.js';
import { ConfigError, parseConfig, SIBLINGS } from '../src/config.js';
import { GUARD_HOOK, mcpServer, mergeClaudeSettings, mergeMcp, PROJECT_DIR, PROJECT_DIR_OR_HERE, withSessionStart } from '../src/configure.js';
import { refusal } from '../src/usage.js';
import { scanMarkdown } from '../src/vendor/spec-core/markdown/index.js';
import { CLAUDE_CODE_MINIMUM, MINIMUM_VERSIONS } from '../src/versions.js';
import { parseOptions } from '../src/workspace.js';
import { PREFIX, VARIABLES } from './temporary.js';

/**
 * Claims the repository makes about itself, checked rather than trusted. This
 * suite is not the unit suite, so it may read the disk and ask git.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const text = (path: string): string => readFileSync(join(ROOT, path), 'utf8');
const json = (path: string): Record<string, unknown> => JSON.parse(text(path)) as Record<string, unknown>;

function* walk(directory: string): Generator<string> {
  for (const entry of readdirSync(join(ROOT, directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

/** The harness's own source: everything in src/ but the vendored spec-core copies. */
const sources = [...walk('src')].filter((path) => path.endsWith('.ts') && !path.startsWith('src/vendor/'));

function importsOf(path: string): string[] {
  const source = text(path);
  return [...source.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|^\s*import\s+)'([^']+)'/gm)].map((match) => match[1] as string);
}

describe('dependencies', () => {
  it('has no runtime dependency', () => {
    const pkg = json('package.json');
    expect(pkg['dependencies'] ?? {}).toEqual({});
    expect(pkg['optionalDependencies']).toBeUndefined();
    expect(pkg['bundleDependencies'] ?? pkg['bundledDependencies']).toBeUndefined();
  });

  it('asks npm for the siblings at the minimums the code holds them to, spec-brief alone required', () => {
    const pkg = json('package.json');
    expect(pkg['peerDependencies']).toEqual(Object.fromEntries(SIBLINGS.map((name) => [`@spec-family/${name}`, `>=${MINIMUM_VERSIONS[name]}`])));
    // A missing spec-graph or spec-guard is reported, never required (ADR-0002).
    expect(pkg['peerDependenciesMeta']).toEqual({ '@spec-family/spec-graph': { optional: true }, '@spec-family/spec-guard': { optional: true } });
  });

  it('has a minimum for each sibling the suite installs, for CI to run the suite at (ADR-0011)', () => {
    // spec-brief and spec-guard are run for real. spec-graph is a script that
    // stands in for it in every test, so there is none to install at either end.
    expect(minimumsOf(json('package.json')['devDependencies'] as Record<string, string>, MINIMUM_VERSIONS)).toEqual(
      (['spec-brief', 'spec-guard'] as const).map((name) => ({ name: `@spec-family/${name}`, version: MINIMUM_VERSIONS[name] })),
    );
  });

  it('has CI install those minimums, check that they are what is installed, and only then run the suite', () => {
    const job = (text('.github/workflows/ci.yml').split('\n  minimum:\n')[1] ?? '').split(/\n  [a-z-]+:\n/)[0] as string;
    const steps = ['specs="$(node scripts/minimum-siblings.ts)"', 'npm install --no-save $specs', 'node scripts/minimum-siblings.ts --installed', 'run: npm test'];
    const found = steps.map((step) => job.indexOf(`${step}\n`));
    expect(found.every((at) => at !== -1), job).toBe(true);
    expect(found).toEqual([...found].sort((a, b) => a - b));
  });

  it('imports nothing but its own modules and Node\'s', () => {
    expect(sources.length).toBeGreaterThan(20);
    const outside = sources.flatMap((path) => importsOf(path).filter((specifier) => !specifier.startsWith('./') && !specifier.startsWith('node:')).map((s) => `${path}: ${s}`));
    expect(outside).toEqual([]);
  });

  it('never imports a sibling tool, which it runs through its command line', () => {
    const everywhere = [...walk('src'), ...walk('tests')].filter((path) => /\.(?:ts|js|mjs)$/.test(path));
    const offenders = everywhere.filter((path) => importsOf(path).some((specifier) => specifier.includes('@spec-family/')));
    expect(offenders).toEqual([]);
  });

  it('reaches the vendored spec-core copies only through their index modules', () => {
    const deep = sources.flatMap((path) =>
      importsOf(path)
        .filter((specifier) => specifier.includes('vendor/spec-core/') && !/vendor\/spec-core\/[a-z]+\/index\.js$/.test(specifier))
        .map((specifier) => `${path}: ${specifier}`),
    );
    expect(deep).toEqual([]);
  });
});

/**
 * Whether a range admits a vitest 4 and nothing else, written as npm and
 * Dependabot write one: a caret, a tilde or an exact version.
 */
function onTheFourLine(range: unknown): boolean {
  return typeof range === 'string' && /^[~^]?4\.\d+\.\d+$/.test(range);
}

describe('the toolchain', () => {
  // On vitest 5, Stryker's runner (10.0.0) runs no test against a mutant a
  // test covers and scores it as survived, with every test green: the core
  // sweep of such a bump read 3.83% here and gave no reason. So the bump
  // fails here, with its reason, before any sweep is asked.
  const HELD = [
    'vitest is held on 4 until a released @stryker-mutator/vitest-runner reads vitest 5.',
    'On 5 the runner runs no test against a mutant a test covers, so every one survives and the sweep reads about 4%:',
    'https://github.com/stryker-mutator/stryker-js/issues/6210.',
    'docs/adr/0010-toolchain-and-verification.md, amended 2026-10-07, has the measurement and where the steps that lift this are',
  ].join(' ');

  it.each(['vitest', '@vitest/coverage-v8'])('holds %s to the 4 line, the newest Stryker\'s runner measures on (ADR-0010)', (name) => {
    const range = (json('package.json')['devDependencies'] as Record<string, unknown>)[name];
    expect(onTheFourLine(range), `package.json asks for ${name} "${String(range)}". ${HELD}`).toBe(true);
  });

  it('takes a range for the 4 line only when it admits no other', () => {
    // The minors and patches Dependabot still proposes must pass.
    for (const range of ['^4.1.11', '^4.1.12', '^4.2.0', '~4.1.11', '4.1.11']) expect(onTheFourLine(range), range).toBe(true);
    for (const range of ['^5.0.0', '5.0.3', '>=4.1.11', '>4', '^4.1.11 || ^5.0.0', '*', 'latest', '', undefined]) {
      expect(onTheFourLine(range), String(range)).toBe(false);
    }
  });
});

describe('no shell', () => {
  it('starts git and the siblings with an argument vector, never through a shell', () => {
    for (const path of ['src/siblings.ts', 'src/git.ts', 'src/host.ts']) {
      const source = text(path);
      expect(source, path).not.toMatch(/shell:\s*true/);
      // exec and spawn with shell: true read a line as shell syntax; RegExp#exec is not a process.
      expect(source, path).not.toMatch(/(?<![.\w])(?:exec|execSync|spawn|spawnSync)\(/);
      expect(source, path).toMatch(/\bexecFile\(/);
    }
  });
});

describe('the tree', () => {
  /**
   * Every file the repository holds or is about to: tracked, or untracked and
   * not ignored, so node_modules, dist, coverage and reports are left out by
   * the .gitignore that leaves them out of commits.
   */
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' })
    .split('\u0000')
    .filter((path) => path !== '' && existsSync(join(ROOT, path)));

  it('has LF line endings and no other control character', () => {
    for (const expected of ['README.md', 'src/cli.ts', 'tests/source.test.ts', 'bin/spec-harness.js', 'hooks/hooks.json', '.gitattributes']) {
      expect(files, expected).toContain(expected);
    }
    for (const ignored of ['node_modules/', 'dist/', 'coverage/', 'reports/']) {
      expect(files.filter((path) => path.startsWith(ignored)), ignored).toEqual([]);
    }
    const offenders = files.filter((path) => {
      const content = readFileSync(join(ROOT, path), 'utf8');
      for (let i = 0; i < content.length; i += 1) {
        const code = content.charCodeAt(i);
        if ((code < 32 && code !== 10) || code === 127) return true;
      }
      return false;
    });
    expect(offenders).toEqual([]);
  });
});

describe('the skills', () => {
  const names = readdirSync(join(ROOT, 'skills')).sort();

  it('are the four workflows, under 30,000 characters together (ADR-0009)', () => {
    expect(names).toEqual(['close-round', 'draft-brief', 'run-round', 'split-goal']);
    const total = names.reduce((sum, name) => sum + text(`skills/${name}/SKILL.md`).length, 0);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(30_000);
  });

  it('each name themselves and say when to use them in their front matter', () => {
    for (const name of names) {
      const front = /^---\n([\s\S]*?)\n---\n/.exec(text(`skills/${name}/SKILL.md`))?.[1];
      expect(front, name).toBeDefined();
      const fields = Object.fromEntries((front as string).split('\n').map((line) => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1).trim()]));
      expect(fields['name'], name).toBe(name);
      expect(fields['description']?.length ?? 0, name).toBeGreaterThan(40);
    }
  });
});

describe('the plugin', () => {
  const version = json('package.json')['version'];

  it('names itself spec-harness, at the package\'s version', () => {
    const plugin = json('.claude-plugin/plugin.json');
    expect(plugin['name']).toBe('spec-harness');
    expect(plugin['version']).toBe(version);
    const marketplace = json('.claude-plugin/marketplace.json') as { plugins: Record<string, unknown>[] };
    expect(marketplace.plugins).toHaveLength(1);
    // The version is the manifest's alone (scripts/release.ts says why).
    expect(marketplace.plugins[0]).toEqual({ name: 'spec-harness', source: './', description: 'Rounds of agent work under a brief.' });
  });

  it('names what a project installs for it as the harness finds it, at the minimum, and the family as its home', () => {
    // The hooks it brings run the project's install of this package, and spec-brief is found under the same scope alone.
    const plugin = json('.claude-plugin/plugin.json') as { description: string; author: { name: string; url: string }; homepage: string };
    expect(plugin.description).toContain(`@spec-family/spec-harness and @spec-family/spec-brief ${MINIMUM_VERSIONS['spec-brief']} or later installed in the project`);
    expect(plugin.author).toEqual({ name: 'spec-family', url: 'https://github.com/spec-family' });
    expect(plugin.homepage).toBe('https://github.com/spec-family/spec-harness');
    const marketplace = json('.claude-plugin/marketplace.json') as { name: string; owner: unknown };
    // The marketplace's name is half of the plugin's install id, spec-harness@spec-tools, which stays.
    expect(marketplace.name).toBe('spec-tools');
    expect(marketplace.owner).toEqual({ name: 'spec-family', url: 'https://github.com/spec-family' });
  });

  it('runs exactly the hooks init installs, before and after every writing tool, and as every session starts', () => {
    const hooks = json('hooks/hooks.json') as { hooks: Record<string, { matcher?: string; hooks: Record<string, unknown>[] }[]> };
    expect(hooks).toEqual(withSessionStart(mergeClaudeSettings({}) ?? {}, () => false));
    expect(Object.keys(hooks.hooks).sort()).toEqual(['PostToolUse', 'PreToolUse', 'SessionStart']);
    for (const [event, groups] of Object.entries(hooks.hooks)) {
      expect(groups, event).toHaveLength(1);
      // Left out, the matcher of SessionStart is every way a session starts.
      expect(groups[0]?.matcher, event).toBe(event === 'SessionStart' ? undefined : 'Edit|Write|MultiEdit|NotebookEdit');
      expect(groups[0]?.hooks, event).toEqual([GUARD_HOOK]);
    }
  });

  it('registers the MCP server as init does, naming the project as a plugin names it', () => {
    expect(json('.mcp.json')).toEqual({ mcpServers: { 'spec-harness': mcpServer(PROJECT_DIR) } });
    // A project's own .mcp.json needs a default where the plugin's does not; nothing else differs.
    expect(JSON.stringify(mergeMcp({})).split(PROJECT_DIR_OR_HERE).join(PROJECT_DIR)).toBe(JSON.stringify(json('.mcp.json')));
  });
});

describe('the release', () => {
  const version = json('package.json')['version'] as string;

  it('has notes in the changelog for the version package.json names, so the version cannot be tagged without them', () => {
    expect(releaseOf(`v${version}`, version, text('CHANGELOG.md'))).toMatchObject({ version });
  });

  it('names the repository npm checks a trusted publish against', () => {
    // release.yml stages each version through npm's trusted publishing, with
    // provenance, and npm refuses a package whose repository.url is not the
    // repository the workflow ran in (ADR-0011): a typo, or a name left
    // behind by a move, fails a release at its last step, after the matrix.
    const pkg = json('package.json');
    expect(pkg['repository']).toEqual({ type: 'git', url: 'git+https://github.com/spec-family/spec-harness.git' });
    expect(pkg['bugs']).toEqual({ url: 'https://github.com/spec-family/spec-harness/issues' });
    expect(pkg['homepage']).toBe('https://github.com/spec-family/spec-harness#readme');
  });

  it('carries the package version in the plugin manifest, and in no marketplace entry', () => {
    expect(pluginDrift(version, json('.claude-plugin/plugin.json'), json('.claude-plugin/marketplace.json'))).toBeNull();
  });
});

/**
 * The names the family had until it moved to the `spec-family` organization
 * and the `@spec-family` scope on 2026-10-26 (ADR-0011): the npm scope and
 * the GitHub owner. Neither installs or hosts anything of the family now.
 */
const EARLIER_NAMES = /@descent-vtt|DescentVTT\//;

/**
 * What says, in the paragraph a name stands in, that the name is of the
 * past: the last release under it, 0.21.0; the day of the move; "an earlier
 * release"; or, in code, a name that begins `EARLIER`, as the constants that
 * hold what earlier releases wrote do.
 */
const OF_THE_PAST = /\b0\.21\.0\b|\b2026-10-26\b|\ban earlier release\b|\bEARLIER[A-Z_]*\b/;

/** Each paragraph of `text`, lines with no blank line between them, that names an earlier name and says nothing of the past, by its first line. */
function presentTense(text: string, file: string): string[] {
  const lines = text.split('\n');
  const found: string[] = [];
  let start: number | null = null;
  lines.forEach((line, index) => {
    if (line.trim() === '') return;
    start ??= index;
    if (index < lines.length - 1 && lines[index + 1]!.trim() !== '') return;
    const paragraph = lines.slice(start, index + 1).join('\n');
    if (EARLIER_NAMES.test(paragraph) && !OF_THE_PAST.test(paragraph)) found.push(`${file}:${start + 1}`);
    start = null;
  });
  return found;
}

describe('the names before the move', () => {
  /**
   * What a person or an agent reads as the present: the documents, the
   * skills, the plugin, the workflows, the scripts and the sources. Left out:
   * CHANGELOG.md and the ADRs, whose every paragraph is dated, by its
   * release, its front matter or the amendment it stands in; the tests,
   * which hold what earlier releases wrote as data; the lockfile; and the
   * vendored spec-core, which is spec-core's.
   */
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' })
    .split('\u0000')
    .filter((path) => path !== '' && existsSync(join(ROOT, path)))
    .filter((path) => path !== 'CHANGELOG.md' && path !== 'package-lock.json' && !/^docs\/adr\/\d{4}-/.test(path) && !path.startsWith('tests/') && !path.startsWith('src/vendor/'));

  it('are read where they would mislead: the documents, the skills, the plugin, the workflows and the sources', () => {
    // A directory that moved would leave the check below nothing to fail on.
    expect(files).toEqual(
      expect.arrayContaining([
        'README.md',
        'CONTRIBUTING.md',
        'docs/adr/README.md',
        'docs/reference/init.md',
        'docs/reference/doctor.md',
        'skills/run-round/SKILL.md',
        '.claude-plugin/plugin.json',
        '.github/workflows/release.yml',
        'src/configure.ts',
      ]),
    );
    // And the names are there to be read, each beside what dates it: in the
    // reference, where `init` and `doctor` say what an earlier release wrote.
    expect(files.filter((path) => EARLIER_NAMES.test(text(path)))).toEqual(expect.arrayContaining(['CONTRIBUTING.md', 'docs/reference/doctor.md', 'docs/reference/init.md', 'src/configure.ts']));
  });

  it('appear only beside what says they are of the past', () => {
    expect(files.flatMap((path) => presentTense(text(path), path))).toEqual([]);
  });

  it('are found in a paragraph that names one and says nothing of the past, and not in one that dates it', () => {
    expect(presentTense('Install @descent-vtt/spec-harness.\n', 'a.md')).toEqual(['a.md:1']);
    expect(presentTense('Intro.\n\nSee https://github.com/DescentVTT/spec-harness\nfor more.\n', 'a.md')).toEqual(['a.md:3']);
    expect(presentTense('As init wrote it from 0.1.2 to 0.21.0,\nnode_modules/@descent-vtt/spec-harness.\n', 'a.md')).toEqual([]);
    expect(presentTense("const EARLIER_BIN = 'node_modules/@descent-vtt/spec-harness/bin/spec-harness.js';\n", 'a.ts')).toEqual([]);
    expect(presentTense('@descent-vtt/spec-harness, the name until 2026-10-26.\n\n@descent-vtt/spec-guard is run here.\n', 'a.md')).toEqual(['a.md:3']);
    expect(presentTense('The old name, @descent-vtt/spec-harness, as an earlier release wrote it.\n', 'a.md')).toEqual([]);
    expect(presentTense('@spec-family/spec-harness, from spec-family/spec-harness.\n', 'a.md')).toEqual([]);
  });
});

describe('the documents the package ships', () => {
  const files = json('package.json')['files'] as string[];
  // `/README.md` is the root's README: npm reads a name with no slash at any
  // depth, and `README.md` packed spec-core's vendored README beside it.
  const ships = (path: string): boolean => files.some((entry) => path === entry.replace(/^\//, '') || path.startsWith(`${entry}/`));
  const reference = [...walk('docs/reference')].filter((path) => path.endsWith('.md')).sort();
  const documents = ['README.md', 'CHANGELOG.md', ...reference, ...[...walk('skills')].filter((path) => path.endsWith('.md'))];

  it('are the README, the changelog, the reference and the skills, and nothing of the vendored copy', () => {
    expect(documents.every(ships)).toBe(true);
    expect(files).toContain('/README.md');
    expect(files).toContain('docs/reference');
    expect(ships('src/vendor/spec-core/README.md')).toBe(false);
    // The records are linked by absolute URL, and stay out of the package.
    expect(ships('docs/adr/0010-toolchain-and-verification.md')).toBe(false);
    // A page that moved, or a directory renamed, would leave the links below unread.
    expect(reference).toEqual(
      ['README', 'audit', 'command-line', 'configuration', 'context', 'doctor', 'guard', 'init', 'install', 'mcp', 'premises', 'probe', 'rounds', 'rulings'].map((page) => `docs/reference/${page}.md`),
    );
  });

  it('link only to files it ships, or by absolute URL, so that a link works in node_modules and on npmjs.com, and to headings that are there', () => {
    // The anchors GitHub gives a document's headings, as npmjs.com does too.
    const anchors = (path: string): string[] => scanMarkdown(text(path)).headings.map((heading) => heading.anchor);
    const dead: string[] = [];
    let fragments = 0;
    for (const document of documents) {
      // Read as a renderer reads it: a link written out in a code span, as the
      // changelog does to show one, is text there and never followed.
      for (const { target } of scanMarkdown(text(document)).links) {
        if (/^[a-z][a-z+.-]*:/i.test(target)) continue;
        const [file, fragment] = target.split('#') as [string, string | undefined];
        const path = file === '' ? document : posix.join(posix.dirname(document), file);
        if (!ships(path) || !existsSync(join(ROOT, path))) dead.push(`${document}: ${target}`);
        else if (fragment !== undefined && path.endsWith('.md')) {
          fragments += 1;
          if (!anchors(path).includes(fragment)) dead.push(`${document}: ${target}`);
        }
      }
    }
    expect(dead).toEqual([]);
    // The reference's pages link into each other by heading; fewer would mean this no longer reads them.
    expect(fragments).toBeGreaterThanOrEqual(15);
  });

  it("read a heading's anchor as GitHub gives it: a code span's text kept, its punctuation dropped, a second of a name numbered", () => {
    const headings = scanMarkdown('# A\n\n## `guard <path...>` and the hooks\n\n## Names\n\n## Names\n').headings.map((heading) => heading.anchor);
    expect(headings).toEqual(['a', 'guard-path-and-the-hooks', 'names', 'names-1']);
  });
});

describe('the README and the reference', () => {
  /** Where each says what to install: the README up to the round, and the reference's Requirements. */
  const installing = (): Array<[string, string]> => [
    ['README.md', text('README.md').split('## A round')[0] as string],
    ['docs/reference/install.md', /^## Requirements$([\s\S]*?)^## /m.exec(text('docs/reference/install.md'))?.[1] ?? ''],
  ];

  it('state the minimum version of each sibling where they say what to install', () => {
    for (const [document, install] of installing()) {
      for (const name of SIBLINGS) expect(install, `${document}: ${name}`).toContain(`${name} ${MINIMUM_VERSIONS[name]}`);
    }
  });

  it('state the Claude Code release the hooks need where they say what to install, as the plugin does (ADR-0012)', () => {
    // The first release whose changelog runs a hook's `args`, the exec form the guard is written in, and the one doctor checks.
    const claudeCode = `Claude Code ${CLAUDE_CODE_MINIMUM} or later`;
    for (const [document, install] of installing()) expect(install, document).toContain(claudeCode);
    expect(json('.claude-plugin/plugin.json')['description']).toContain(claudeCode);
  });

  /** The keys parseConfig accepts, read from its own refusals so that a key added there is a key checked here. */
  function keysAt(raw: (key: string) => unknown): string[] {
    try {
      parseConfig(raw('zzz-not-a-key'));
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      return ((error as Error).message.split('; the keys are ')[1] ?? '').split(', ');
    }
    throw new Error('parseConfig accepted an unknown key');
  }

  it('document every configuration key parseConfig accepts', () => {
    const table = text('docs/reference/configuration.md');
    expect(table).toContain('| Key | Default | What it says |');
    const top = keysAt((key) => ({ [key]: 1 })).filter((key) => key !== '$schema');
    expect(top).toContain('rulings');
    const documented: string[] = [];
    for (const key of top) {
      if (['rulings', 'dependencies', 'context', 'assertions', 'probes'].includes(key)) {
        for (const nested of keysAt((unknown) => ({ [key]: { [unknown]: 1 } }))) documented.push(`${key}.${nested}`);
      } else {
        documented.push(key);
      }
    }
    expect(documented.length).toBeGreaterThanOrEqual(11);
    expect(documented.filter((key) => !table.includes(`\`${key}\``))).toEqual([]);
  });

  /** A command line with one option on it, given a value where the parser asks for one. */
  function withOption(command: string, option: string): string[] {
    // Claude Code's hook is read apart, so git's stands for the command.
    const argv = [...(command === 'hook' ? ['hook', 'git'] : [command]), `--${option}`];
    try {
      parseOptions(argv);
      return argv;
    } catch {
      return [...argv, option === 'format' ? 'json' : option === 'at' ? 'base' : 'x'];
    }
  }

  it('give each command, in the table of the command line, the options the command line lets it take and no other', () => {
    const page = text('docs/reference/command-line.md');
    const section = page.slice(page.indexOf('## An input that names nothing'), page.indexOf('## Exit codes'));
    expect(section).toContain('| Command | Reads |');
    const rows = [...section.matchAll(/^ {2}\| (`[^|]+) \| (`--[^|]+) \|$/gm)].map((match) => ({
      commands: [...(match[1] as string).matchAll(/`([a-z]+)`/g)].map((found) => found[1] as string),
      options: [...(match[2] as string).matchAll(/`--([a-z-]+)`/g)].map((found) => found[1] as string),
    }));
    expect(rows.flatMap((row) => row.commands).sort()).toEqual(['audit', 'context', 'doctor', 'escalate', 'guard', 'hook', 'init', 'mcp', 'premises', 'probe', 'rule', 'rulings']);
    const every = [...new Set(rows.flatMap((row) => row.options))];
    expect(every).toHaveLength(19);
    for (const row of rows) {
      for (const command of row.commands) {
        for (const option of every) {
          const answer = refusal(parseOptions(withOption(command, option)), () => true);
          if (row.options.includes(option)) expect(answer, `${command} --${option}`).toBeNull();
          else expect(answer, `${command} --${option}`).toContain(`${command} does not take --${option}; `);
        }
      }
    }
  });

  it('write no command line the command line refuses, nor does a skill', () => {
    // A person copies these and an agent follows them to the letter: one the
    // harness refused would stop every round at that step.
    const documents = ['README.md', ...[...walk('docs/reference')].filter((path) => path.endsWith('.md')), ...[...walk('skills')].filter((path) => path.endsWith('.md'))];
    const written = documents.flatMap((document) => {
      // A command with the lines that continue it, as a shell joins them.
      const joined = text(document).replace(/ \\\n\s*/g, ' ');
      const commands = [...joined.matchAll(/npx --no-install @spec-family\/spec-harness ([^`\n]+)/g), ...joined.matchAll(/`spec-harness ([^`\n]+)`/g), ...joined.matchAll(/spec-harness\.js ([^`\n]+)`/g)];
      return commands.map((match) => ({ document, line: (match[1] as string).trim() }));
    });
    // Twenty-eight across the README, six pages of the reference and three of
    // the skills; fewer would mean this no longer reads them.
    expect(written.length).toBeGreaterThanOrEqual(25);
    expect(new Set(written.map(({ document }) => document)).size).toBeGreaterThanOrEqual(10);
    expect(written.filter(({ document }) => document === 'README.md').length).toBeGreaterThanOrEqual(8);
    for (const { document, line } of written) {
      // Its words as a shell reads them, up to a comment or a redirection.
      const words = [...line.matchAll(/"([^"]*)"|(\S+)/g)].map((match) => match[1] ?? (match[2] as string));
      const end = words.findIndex((word) => word === '#' || word === '>');
      const argv = end === -1 ? words : words.slice(0, end);
      expect(refusal(parseOptions(argv), () => true), `${document}: ${line}`).toBeNull();
    }
  });
});

describe('the suite', () => {
  it('works in a temporary directory of its own, and everything it starts is told that it is the temporary directory', () => {
    // Claimed before the first test file, as vitest.config.ts has every run
    // do (tests/temporary.ts), and removed when the run ends: what a test
    // leaves behind, the sandbox's worktrees among it, is left in there.
    const own = tmpdir();
    expect(basename(own).startsWith(PREFIX)).toBe(true);
    expect(VARIABLES.map((name) => process.env[name])).toEqual([own, own, own]);
  });
});

describe('a module that is loaded where it runs', () => {
  it('is imported at the top of a test file too, so that a sweep runs every test for what it does as it loads', () => {
    // A command loads what it runs (cli.ts, round.ts). A sweep reads what a
    // module does as it loads, its tables and its constants, as run by every
    // test only where a test file loads the module before any test: left to
    // the command line, the module loads inside the first test that needs
    // it, and a mutant of its tables is run for that test alone. So each
    // module asked for with import() has a test file that imports it at its
    // top. This file is in no sweep, and is not counted.
    const lazy = new Set(sources.flatMap((path) => [...text(path).matchAll(/(?<!typeof )\bimport\('\.\/([a-z]+)\.js'\)/g)].map((match) => `src/${match[1] as string}.ts`)));
    expect([...lazy].sort()).toEqual(['src/audit.ts', 'src/commands.ts', 'src/configure.ts', 'src/guard.ts', 'src/host.ts', 'src/premises.ts', 'src/reader.ts', 'src/round.ts', 'src/server.ts', 'src/setup.ts', 'src/signers.ts']);
    const tests = [...walk('tests')].filter((path) => path.endsWith('.test.ts') && path !== 'tests/source.test.ts');
    const loadedBy = (module: string): string[] =>
      tests.filter((path) => [...text(path).matchAll(/^import (?!type )[^;]*? from '((?:\.\.\/)+src\/[a-z]+)\.js';$/gm)].some((match) => posix.join(posix.dirname(path), `${match[1] as string}.ts`) === module));
    for (const module of lazy) expect(loadedBy(module), `${module} is imported at the top of no test file`).not.toEqual([]);
  });

  it('is run, by a test file that loads modules afresh, through a command line loaded afresh too', () => {
    // After vi.resetModules() an import() gives a module anew. A command line
    // loaded before it would run a command's module of the new ones, and
    // judge what the command throws by the classes of the old: a refusal
    // would end on a stack. So such a file loads the command line where it
    // runs it, and takes no `cli` from the helpers, which hold the one they
    // loaded as the file began.
    const tests = [...walk('tests')].filter((path) => path.endsWith('.test.ts'));
    const resetting = tests.filter((path) => text(path).includes('vi.resetModules('));
    expect(resetting).toEqual(expect.arrayContaining(['tests/integration/loads.test.ts', 'tests/integration/sandbox.test.ts']));
    expect(resetting.filter((path) => /^import \{[^}]*\bcli\b[^}]*\} from '\.\/helpers\.js';$/m.test(text(path)))).toEqual([]);
  });
});

describe('the core mutation sweep', () => {
  it('mutates exactly the pure functions of the edge modules it names', () => {
    // Read as text: the configuration is a module Stryker loads, not one this suite type-checks.
    const config = text('stryker.core.config.mjs');
    const ranges = [...config.matchAll(/'(src\/[a-z]+\.ts:\d+-\d+)': '([A-Za-z]+)'/g)].map((match) => [match[1] as string, match[2] as string] as const);
    expect(ranges.map(([, name]) => name).sort()).toEqual(['parseOptions']);
    expect(config).toContain('...Object.keys(PURE_RANGES)');
    for (const [range, name] of ranges) {
      const match = /^(src\/[a-z]+\.ts):(\d+)-(\d+)$/.exec(range);
      expect(match, range).not.toBeNull();
      const [, file, first, last] = match as RegExpExecArray;
      const lines = text(file as string).split('\n');
      expect(lines[Number(first) - 1], range).toMatch(new RegExp(`^export function ${name}\\(`));
      expect(lines[Number(last) - 1], range).toBe('}');
      expect(lines.slice(Number(first), Number(last) - 1).some((line) => line === '}'), range).toBe(false);
    }
  });

  it('mutates only modules that reach no disk, process or git', () => {
    const config = text('stryker.core.config.mjs');
    const modules = [...config.matchAll(/^\s*'(src\/[a-z]+\.ts)',$/gm)].map((match) => match[1] as string);
    expect(modules.length).toBeGreaterThanOrEqual(12);
    const edges = ['./fs.js', './git.js', './siblings.js', './sandbox.js', './round.js', './workspace.js', './commands.js', './cli.js', './server.js', './setup.js'];
    const offenders = modules.filter((path) =>
      importsOf(path).some((specifier) => /^node:(?:fs|fs\/promises|child_process|os|process)$/.test(specifier) || edges.includes(specifier)),
    );
    expect(offenders).toEqual([]);
  });

  it('holds the unit suite to its promise: no disk, no process', () => {
    const unit = [...walk('tests/unit')].filter((path) => path.endsWith('.ts'));
    expect(unit.length).toBeGreaterThan(10);
    const offenders = unit.filter((path) =>
      importsOf(path).some((specifier) => /^node:(?:fs|fs\/promises|child_process|os)$/.test(specifier) || specifier.includes('integration/')),
    );
    expect(offenders).toEqual([]);
  });
});
