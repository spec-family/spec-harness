/**
 * The listing in the official MCP Registry, held to the package it lists.
 *
 * The registry keeps a server.json and reads the package from npm: it lists
 * io.github.spec-family/spec-harness at a version only where npm serves the
 * package at that version with the server's name as its `mcpName`, and a
 * client starts the server by fetching that version and running it with the
 * arguments server.json gives. So the two files name one server and one
 * version, the description fits the registry's hundred characters, and the
 * arguments are the command `.mcp.json` starts, without the root only Claude
 * Code can name; tests/integration/mcp.test.ts starts the server with them.
 * `mcp-registry.yml` lists a version by hand once npm serves it (ADR-0011,
 * amended 2026-11-11), and its two gates are run here as the runner runs them.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PREFIX } from './temporary.js';

interface Argument {
  readonly type: string;
  readonly value?: string;
}

interface Server {
  readonly $schema: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly repository: { readonly url: string; readonly source: string; readonly id?: string };
  readonly packages: ReadonlyArray<{
    readonly registryType: string;
    readonly registryBaseUrl?: string;
    readonly identifier: string;
    readonly version: string;
    readonly transport: { readonly type: string };
    readonly packageArguments?: readonly Argument[];
  }>;
}

interface Manifest {
  readonly name: string;
  readonly version: string;
  readonly mcpName?: string;
  readonly repository: { readonly url: string };
}

const ROOT = join(import.meta.dirname, '..');
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');
const server = JSON.parse(read('server.json')) as Server;
const manifest = JSON.parse(read('package.json')) as Manifest;
const listed = server.packages[0]!;

describe('server.json, beside package.json', () => {
  it("names the server package.json names, in the namespace GitHub's sign-in grants the family", () => {
    // GitHub's OIDC grants io.github.<the repository's owner>/*, and the
    // package's name under the scope is the server's under the namespace.
    expect(manifest.mcpName).toBe(`io.github.spec-family/${manifest.name.replace('@spec-family/', '')}`);
    expect(server.name).toBe(manifest.mcpName);
    expect(server.$schema).toBe('https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json');
  });

  it('names the version package.json names, for the server and for its package: the release commit moves the three', () => {
    expect(server.version).toBe(manifest.version);
    expect(listed.version).toBe(manifest.version);
  });

  it('lists this package, on npm, the one npm registry the registry reads, over stdio', () => {
    expect(server.packages).toHaveLength(1);
    expect(listed).toMatchObject({ registryType: 'npm', registryBaseUrl: 'https://registry.npmjs.org', identifier: manifest.name, transport: { type: 'stdio' } });
  });

  it("describes the server in the registry's hundred characters", () => {
    expect(server.description.length).toBeGreaterThan(0);
    expect(server.description.length).toBeLessThanOrEqual(100);
  });

  it('names the repository package.json names, and its id on GitHub, which a repository made again under the name does not have', () => {
    expect(`git+${server.repository.url}.git`).toBe(manifest.repository.url);
    expect(server.repository.source).toBe('github');
    expect(server.repository.id).toMatch(/^[123456789][0123456789]*$/);
  });

  it('starts the command .mcp.json starts, as values a client passes as written, without the root only Claude Code can name', () => {
    // A named argument a client may leave empty would be refused: an empty
    // --root is exit 2 (docs/reference/command-line.md).
    const values = (listed.packageArguments ?? []).map((argument) => (argument.type === 'positional' && typeof argument.value === 'string' ? argument.value : `${JSON.stringify(argument)} is not a positional value`));
    const entry = (JSON.parse(read('.mcp.json')) as { mcpServers: Record<string, { args: string[] }> }).mcpServers['spec-harness']!;
    expect(entry.args.slice(1)).toEqual([...values, '--root', '${CLAUDE_PROJECT_DIR}']);
    expect(values).toEqual(['mcp']);
  });
});

const workflow = read('.github/workflows/mcp-registry.yml').replaceAll('\r\n', '\n');
const lines = workflow.split('\n');
const code = (line: string): string => line.replace(/(?:^|\s)#.*$/, '');

/** The keys directly under the line `heading` at `indent` spaces, up to the next key at that indent or less. */
function keysUnder(heading: string, indent: number): string[] {
  const start = lines.findIndex((line) => line === `${' '.repeat(indent)}${heading}`);
  if (start === -1) return [];
  const keys: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const text = code(line);
    if (text.trim() === '') continue;
    const depth = text.length - text.trimStart().length;
    if (depth <= indent) break;
    if (depth === indent + 2) keys.push(text.trim());
  }
  return keys;
}

/** Each script the runner hands to bash: the block under each `run: |`, or what follows `run:` on its line. */
function scripts(): string[] {
  return lines.flatMap((line, index) => {
    const run = /^(\s*)run: (.*)$/.exec(line);
    if (run === null) return [];
    if (run[2] !== '|') return [run[2]!];
    const indent = run[1]!.length;
    const block: string[] = [];
    for (const next of lines.slice(index + 1)) {
      if (next.trim() !== '' && next.length - next.trimStart().length <= indent) break;
      block.push(next.slice(indent + 2));
    }
    return [`${block.join('\n').trimEnd()}\n`];
  });
}

/** The script of the step named `name`. */
function stepScript(name: string): string {
  const after = workflow.split(`\n      - name: ${name}\n`)[1];
  if (after === undefined) throw new Error(`no step is named "${name}"`);
  const run = after.indexOf('        run: |\n');
  const block: string[] = [];
  for (const line of after.slice(run + '        run: |\n'.length).split('\n')) {
    if (line.trim() !== '' && !line.startsWith('          ')) break;
    block.push(line.slice(10));
  }
  return `${block.join('\n').trimEnd()}\n`;
}

describe('mcp-registry.yml', () => {
  it('runs when the maintainer dispatches it, and on nothing else: npm tells GitHub nothing of an approval', () => {
    expect(keysUnder('on:', 0)).toEqual(['workflow_dispatch:']);
    expect(keysUnder('inputs:', 4)).toEqual(['version:']);
  });

  it('holds the OIDC token in its one job, beside a read of the repository and nothing more', () => {
    expect(keysUnder('permissions:', 0)).toEqual(['contents: read']);
    expect(keysUnder('jobs:', 0)).toEqual(['publish:']);
    expect(keysUnder('permissions:', 4)).toEqual(['contents: read', 'id-token: write']);
    expect(workflow).toContain('\n    runs-on: ubuntu-24.04\n');
  });

  it('hands the version to a script through its environment, and writes no expression into one', () => {
    const uses = lines.filter((line) => !/^\s*#/.test(line) && line.includes('inputs.version')).map((line) => line.trim());
    expect(uses.length).toBeGreaterThanOrEqual(1);
    expect(uses.filter((line) => line !== 'VERSION: ${{ inputs.version }}')).toEqual([]);
    expect(scripts().length).toBeGreaterThanOrEqual(5);
    expect(scripts().filter((script) => script.includes('${{'))).toEqual([]);
  });

  it('pins each action to a commit, and mcp-publisher to one version and the SHA-256 of its archive', () => {
    const uses = lines.filter((line) => /^\s*(?:-\s+)?uses:/.test(line)).map((line) => line.trim());
    expect(uses.length).toBeGreaterThanOrEqual(1);
    expect(uses.filter((line) => !/^- uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/.test(line))).toEqual([]);
    const install = stepScript('mcp-publisher, at one version');
    expect(install).toMatch(/^version=v\d+\.\d+\.\d+$/m);
    expect(install).toMatch(/^sha256=[0-9a-f]{64}$/m);
    expect(install).toContain('/releases/download/$version/mcp-publisher_linux_amd64.tar.gz');
    expect(install).toContain('echo "$sha256  $archive" | sha256sum --check --strict');
    // The archive is checked before it is opened, and opened before it runs.
    expect(install.indexOf('sha256sum')).toBeLessThan(install.indexOf('tar -xzf'));
    expect(workflow.indexOf('mcp-publisher, at one version')).toBeLessThan(workflow.indexOf('run: mcp-publisher login github-oidc'));
    expect(workflow.indexOf('run: mcp-publisher login github-oidc')).toBeLessThan(workflow.indexOf('run: mcp-publisher publish'));
  });

  it('checks the version and the three that name it before it installs anything or logs in', () => {
    const order = ['The version to list, from main', 'uses: actions/checkout@', 'server.json, package.json and npm must name this version', 'mcp-publisher, at one version'].map((text) => workflow.indexOf(text));
    expect(order.every((at) => at !== -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(workflow).toContain('          ref: refs/tags/${{ steps.version.outputs.tag }}\n');
  });
});

/**
 * What `script` does, run as the runner runs a step, in bash with `-e` and
 * `pipefail`, in `cwd`, with `env` and the runner's variables a run needs:
 * its status, the lines it printed, the lines a stand-in wrote to stderr, and
 * what it wrote to GITHUB_OUTPUT.
 */
function outcomeOf(script: string, cwd: string, env: Readonly<Record<string, string>>, prelude = ''): { status: number; said: string[]; asked: string[]; output: string } {
  const output = join(cwd, 'github-output');
  rmSync(output, { force: true });
  const run = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', `${prelude}\n${script}`], {
    cwd,
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', GITHUB_OUTPUT: output, ...env },
  });
  if (run.status === null) throw new Error(`bash did not run: ${run.error}`);
  let written = '';
  try {
    written = readFileSync(output, 'utf8');
  } catch {
    written = '';
  }
  const linesOf = (text: string): string[] => text.split('\n').filter((line) => line !== '');
  return { status: run.status, said: linesOf(run.stdout), asked: linesOf(run.stderr), output: written };
}

// The scripts are run where the workflow runs them, on Linux, with its bash
// and its jq: elsewhere bash is another bash, or there is none.
const onLinux = process.platform === 'linux';
const made: string[] = [];
const directory = (): string => {
  const path = mkdtempSync(join(tmpdir(), PREFIX));
  made.push(path);
  return path;
};

afterAll(() => {
  for (const path of made.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('the gate on the version the maintainer names', () => {
  const script = stepScript('The version to list, from main');
  let cwd: string;

  beforeAll(() => {
    cwd = directory();
  });

  it.runIf(onLinux)("names the version's tag, from main", () => {
    expect(outcomeOf(script, cwd, { GITHUB_REF: 'refs/heads/main', VERSION: '0.24.2' })).toEqual({ status: 0, said: [], asked: [], output: 'tag=v0.24.2\n' });
  });

  it.runIf(onLinux)('lists nothing from another ref, where that ref has its own copy of the workflow', () => {
    for (const ref of ['refs/heads/r28-mcp', 'refs/tags/v0.24.2', 'refs/pull/1/merge']) {
      expect(outcomeOf(script, cwd, { GITHUB_REF: ref, VERSION: '0.24.2' })).toEqual({
        status: 1,
        said: [`::error::a listing is dispatched from main, and this run is from ${ref}; nothing was listed`],
        asked: [],
        output: '',
      });
    }
  });

  it.runIf(onLinux)('lists nothing for a version that is not one exact version: no range, tag, path or second line', () => {
    const refused = ['', '0.24', '0.24.2.1', 'v0.24.2', '^0.24.2', '0.24.x', 'latest', '0.24.2-pre.1', '00.24.2', '0.24.2 ', ' 0.24.2', '0.24.2\n0.24.3', '0.24.2/../x', '$(id)', '0.24.2; id', `${String.fromCharCode(0x0660)}.24.2`];
    const stopped = { status: 1, said: ['::error::version must be one exact version, such as 0.24.2; nothing was listed'], asked: [], output: '' };
    expect(refused.filter((VERSION) => JSON.stringify(outcomeOf(script, cwd, { GITHUB_REF: 'refs/heads/main', VERSION })) !== JSON.stringify(stopped))).toEqual([]);
  });
});

describe('the gate on server.json, package.json and npm', () => {
  const script = stepScript('server.json, package.json and npm must name this version');
  const VERSION = '0.24.2';
  const name = 'io.github.spec-family/spec-harness';
  const agreed = {
    server: { name, version: VERSION, packages: [{ registryType: 'npm', identifier: '@spec-family/spec-harness', version: VERSION }] },
    package: { name: '@spec-family/spec-harness', version: VERSION, mcpName: name },
  };
  /** npm, as a stand-in: says what it was asked for, writes the body it is handed where it is told to, and answers with the status. */
  const npm = [
    'curl() {',
    "  local out='' url=''",
    '  while [ $# -gt 0 ]; do',
    '    case "$1" in',
    '      --output) out="$2"; shift 2 ;;',
    '      --write-out) shift 2 ;;',
    '      -*) shift ;;',
    '      *) url="$1"; shift ;;',
    '    esac',
    '  done',
    '  echo "asked: $url" >&2',
    '  printf %s "$NPM_BODY" > "$out"',
    '  printf %s "$NPM_STATUS"',
    '}',
  ].join('\n');
  const request = `asked: https://registry.npmjs.org/@spec-family%2Fspec-harness/${VERSION}`;

  function gate(serverJson: object, packageJson: object, status: string, body: object | string): { status: number; said: string[]; asked: string[] } {
    const cwd = directory();
    writeFileSync(join(cwd, 'server.json'), JSON.stringify(serverJson));
    writeFileSync(join(cwd, 'package.json'), JSON.stringify(packageJson));
    const { status: exit, said, asked } = outcomeOf(script, cwd, { VERSION, NPM_STATUS: status, NPM_BODY: typeof body === 'string' ? body : JSON.stringify(body) }, npm);
    return { status: exit, said, asked };
  }

  it.runIf(onLinux)('passes where the three name the version and npm serves it with the server as its mcpName', () => {
    expect(gate(agreed.server, agreed.package, '200', { name: '@spec-family/spec-harness', version: VERSION, mcpName: name })).toEqual({
      status: 0,
      said: [`${name} ${VERSION}: server.json, package.json and npm agree.`],
      asked: [request],
    });
  });

  it.runIf(onLinux)('lists nothing where a file at the tag names another version, or lists another package', () => {
    const stop = (reason: string) => ({ status: 1, said: [`::error::${reason}; nothing was listed`], asked: [] });
    const served = { mcpName: name };
    expect(gate({ ...agreed.server, version: '0.24.1' }, agreed.package, '200', served)).toEqual(stop(`server.json names 0.24.1 in .version at v${VERSION}`));
    expect(gate({ ...agreed.server, packages: [{ ...agreed.server.packages[0], version: '0.24.1' }] }, agreed.package, '200', served)).toEqual(stop(`server.json names 0.24.1 in .packages[0].version at v${VERSION}`));
    expect(gate(agreed.server, { ...agreed.package, version: '0.24.1' }, '200', served)).toEqual(stop(`package.json names 0.24.1 at v${VERSION}`));
    expect(gate({ ...agreed.server, packages: [{ ...agreed.server.packages[0], identifier: '@spec-family/spec-brief' }] }, agreed.package, '200', served)).toEqual(
      stop('server.json lists npm @spec-family/spec-brief, where it lists npm @spec-family/spec-harness alone'),
    );
    expect(gate({ ...agreed.server, packages: [...agreed.server.packages, { registryType: 'oci', identifier: 'x', version: VERSION }] }, agreed.package, '200', served)).toEqual(
      stop('server.json lists npm @spec-family/spec-harness, oci x, where it lists npm @spec-family/spec-harness alone'),
    );
    expect(gate(agreed.server, { name: '@spec-family/spec-harness', version: VERSION }, '200', served)).toEqual(stop(`package.json names no mcpName, where server.json is ${name}`));
  });

  it.runIf(onLinux)('lists nothing npm does not serve: a staged version waits for its approval', () => {
    expect(gate(agreed.server, agreed.package, '404', '"version not found: 0.24.2"')).toEqual({
      status: 1,
      said: [`::error::npm does not serve @spec-family/spec-harness@${VERSION}: a staged version waits for its approval (npm stage list @spec-family/spec-harness); nothing was listed`],
      asked: [request],
    });
    expect(gate(agreed.server, agreed.package, '503', 'busy')).toEqual({
      status: 1,
      said: [`::error::npm answered https://registry.npmjs.org/@spec-family%2Fspec-harness/${VERSION} with HTTP 503; nothing was listed`],
      asked: [request],
    });
  });

  it.runIf(onLinux)('lists nothing where the version npm serves carries no mcpName, or another', () => {
    expect(gate(agreed.server, agreed.package, '200', { name: '@spec-family/spec-harness', version: VERSION })).toEqual({
      status: 1,
      said: [`::error::npm serves @spec-family/spec-harness@${VERSION} with no mcpName, where server.json is ${name}; nothing was listed`],
      asked: [request],
    });
    expect(gate(agreed.server, agreed.package, '200', { mcpName: 'io.github.someone/spec-harness' })).toEqual({
      status: 1,
      said: [`::error::npm serves @spec-family/spec-harness@${VERSION} with io.github.someone/spec-harness, where server.json is ${name}; nothing was listed`],
      asked: [request],
    });
  });
});
