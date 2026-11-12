/**
 * Real repositories for the integration suite: temporary directories, real
 * git, the real spec-brief and spec-guard from this repository's
 * devDependencies, and the CLI run in-process with its output captured.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterAll } from 'vitest';

import { run, type CliIO } from '../../src/cli.js';
import type { SiblingName } from '../../src/config.js';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const BIN = join(ROOT, 'bin', 'spec-harness.js');
export const SPEC_BRIEF = join(ROOT, 'node_modules', '@spec-family', 'spec-brief', 'bin', 'spec-brief.js');
export const SPEC_GUARD = join(ROOT, 'node_modules', '@spec-family', 'spec-guard', 'bin', 'spec-guard.js');

/** Native, which expands Windows short names (`RUNNER~1`) as git does, so paths compare. */
const TEMP = realpathSync.native(tmpdir());

// Git reads the person's own configuration too: a global autocrlf, a signing
// default or a hooks path would change what these tests measure, and on a
// Windows workstation autocrlf=true is the installer's default. The suite
// gets a configuration of its own, in the temporary directory.
const gitHome = mkdtempSync(join(TEMP, 'spec-harness-test-'));
writeFileSync(
  join(gitHome, 'gitconfig'),
  ['[user]', '  email = t@example.com', '  name = Tester', '[core]', '  autocrlf = false', '[commit]', '  gpgsign = false', '[tag]', '  gpgsign = false', '[init]', '  defaultBranch = main', ''].join('\n'),
);
process.env['GIT_CONFIG_GLOBAL'] = join(gitHome, 'gitconfig');
process.env['GIT_CONFIG_NOSYSTEM'] = '1';
// Each test file loads this module afresh, so each file removes its own copy
// when it ends. A worker is stopped without an 'exit' event, so that alone
// would leave one behind per file.
afterAll(() => rmSync(gitHome, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }));

const made: string[] = [];

/** A fresh directory under the system temporary directory, removed by {@link cleanup}. */
export function temp(): string {
  const directory = mkdtempSync(join(TEMP, 'spec-harness-test-'));
  made.push(directory);
  return directory;
}

export function cleanup(): void {
  for (const directory of made.splice(0)) {
    try {
      rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    } catch (error) {
      // A virus scanner on Windows can hold a file it is reading past every
      // retry. What is left is in the temporary directory, and the result of
      // the suite does not depend on it.
      process.stderr.write(`spec-harness tests: could not remove ${directory}: ${(error as Error).message}\n`);
    }
  }
}

export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function write(root: string, path: string, content: string): void {
  const full = join(root, ...path.split('/'));
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

export function read(root: string, path: string): string {
  return readFileSync(join(root, ...path.split('/')), 'utf8');
}

export interface BriefOptions {
  readonly status?: string;
  readonly title?: string;
  readonly affected?: readonly string[];
  readonly protected?: readonly string[];
  readonly dependsOn?: readonly string[];
  readonly tasks?: readonly string[];
  /** Markdown after the required sections. */
  readonly body?: string;
}

/** A brief spec-brief lints clean under its defaults. */
export function brief(options: BriefOptions = {}): string {
  const front = [`status: ${options.status ?? 'active'}`];
  if (options.affected !== undefined) front.push(`affectedFiles: [${options.affected.join(', ')}]`);
  if (options.protected !== undefined) front.push(`protectedFiles: [${options.protected.join(', ')}]`);
  if (options.dependsOn !== undefined) front.push(`dependsOn: [${options.dependsOn.join(', ')}]`);
  return [
    '---',
    ...front,
    '---',
    '',
    `# ${options.title ?? '001 - Rotate tokens'}`,
    '',
    '## Intent',
    '',
    'Rotate the session token on every privilege change.',
    '',
    '## Negative Scope',
    '',
    '- No change to the token format.',
    '',
    '## Invariants',
    '',
    ...(options.tasks ?? ['- [x] the tests pass']),
    '',
    ...(options.body === undefined ? [] : [options.body]),
  ].join('\n');
}

export const BRIEF_FILE = 'briefs/001_rotate-tokens.md';

export interface Repository {
  readonly root: string;
  git(...args: string[]): string;
  write(path: string, content: string): void;
  read(path: string): string;
  /** Stages everything and commits it; the new commit's sha. */
  commit(message: string): string;
}

/**
 * A repository on `main` with one commit: `.spec-harness.json` naming `main`
 * as the base and the siblings by their scripts, and the files given. A
 * `config` of `null` writes no `.spec-harness.json` at all.
 */
export function repository(files: Readonly<Record<string, string>> = {}, config: Record<string, unknown> | null = {}): Repository {
  const root = temp();
  git(root, 'init', '-q', '-b', 'main');
  const repo: Repository = {
    root,
    git: (...args) => git(root, ...args),
    write: (path, content) => write(root, path, content),
    read: (path) => read(root, path),
    commit: (message) => {
      git(root, 'add', '-A');
      git(root, 'commit', '-q', '--allow-empty', '-m', message);
      return git(root, 'rev-parse', 'HEAD');
    },
  };
  if (config !== null) {
    repo.write('.spec-harness.json', `${JSON.stringify({ base: 'main', tools: siblings(), ...config }, null, 2)}\n`);
  }
  for (const [path, content] of Object.entries(files)) repo.write(path, content);
  repo.commit('base');
  return repo;
}

/** This repository's copy of a sibling, installed into `root` where `locate()` looks for it. */
export function install(root: string, name: 'spec-brief' | 'spec-guard'): void {
  cpSync(join(ROOT, 'node_modules', '@spec-family', name), join(root, 'node_modules', '@spec-family', name), { recursive: true });
}

/**
 * This checkout, installed into `root` where a project's configurations look
 * for it: a launcher for its built command line, and its spec-brief plugin
 * under the subpath the package exports, which spec-brief imports from there.
 */
export function installHarness(root: string): void {
  if (!existsSync(join(ROOT, 'dist', 'plugin.js'))) throw new Error('dist/plugin.js is missing: run "npm run build" before the suite');
  const directory = join(root, 'node_modules', '@spec-family', 'spec-harness');
  const url = (path: string): string => JSON.stringify(pathToFileURL(join(ROOT, path)).href);
  mkdirSync(join(directory, 'bin'), { recursive: true });
  const manifest = { name: '@spec-family/spec-harness', type: 'module', exports: { './spec-brief-plugin': './plugin.js', './package.json': './package.json' } };
  writeFileSync(join(directory, 'package.json'), `${JSON.stringify(manifest)}\n`);
  writeFileSync(join(directory, 'bin', 'spec-harness.js'), `await import(${url('bin/spec-harness.js')});\n`);
  writeFileSync(join(directory, 'plugin.js'), `export { default, waive } from ${url('dist/plugin.js')};\n`);
}

/**
 * A sibling installed into `root` that is only its manifest and a script that
 * exits 0: `package.json` holds `manifest` as given, or nothing when it is
 * `null`, for measuring how an installed version is read.
 */
export function installFake(root: string, name: SiblingName, manifest: string | null): string {
  const directory = join(root, 'node_modules', '@spec-family', name);
  mkdirSync(join(directory, 'bin'), { recursive: true });
  writeFileSync(join(directory, 'bin', `${name}.js`), '');
  if (manifest !== null) writeFileSync(join(directory, 'package.json'), manifest);
  return join(directory, 'bin', `${name}.js`);
}

/**
 * A directory Claude Code keeps plugins in, filled as an install of the
 * Claude Code plugin `id` leaves it: the marketplace in the record of those
 * fetched, and a version of the plugin in the cache. Made up, in a directory
 * of the test's own: `plugins` under a CLAUDE_CONFIG_DIR, or what
 * CLAUDE_CODE_PLUGIN_CACHE_DIR names. Returns the directory.
 */
export function installPlugin(directory: string, id = 'spec-harness@spec-tools'): string {
  const [name, marketplace] = id.split('@') as [string, string];
  mkdirSync(join(directory, 'cache', marketplace, name, '0.16.0'), { recursive: true });
  const entry = { source: { source: 'github', repo: 'example/spec-harness' }, installLocation: join(directory, 'marketplaces', marketplace), lastUpdated: '2026-10-12T00:00:00.000Z' };
  writeFileSync(join(directory, 'known_marketplaces.json'), JSON.stringify({ [marketplace]: entry }));
  return directory;
}

/**
 * A `PATH` whose `claude` is of the release given, told as each platform
 * lets doctor tell it: on Windows a claude.cmd that runs Claude Code's
 * package, which doctor reads and never starts, and elsewhere a script that
 * prints the release. Made up, in a directory of the test's own: no Claude
 * Code is started by it.
 */
export function claudeOf(version: string): Record<string, string> {
  const directory = temp();
  if (process.platform === 'win32') {
    write(directory, 'claude.cmd', ['@ECHO off', 'SETLOCAL', 'SET dp0=%~dp0', '"%dp0%\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe"   %*', ''].join('\r\n'));
    write(directory, 'node_modules/@anthropic-ai/claude-code/package.json', `{ "name": "@anthropic-ai/claude-code", "version": "${version}" }\n`);
    return { PATH: directory, PATHEXT: '.COM;.EXE;.BAT;.CMD' };
  }
  const file = join(directory, 'claude');
  writeFileSync(file, `#!/bin/sh\necho '${version} (Claude Code)'\n`);
  chmodSync(file, 0o755);
  return { PATH: directory };
}

/** The `tools` entry naming this repository's copies of spec-brief and spec-guard. */
export function siblings(): Record<string, string[]> {
  return { 'spec-brief': ['node', SPEC_BRIEF], 'spec-guard': ['node', SPEC_GUARD] };
}

/**
 * spec-guard's JSON answer to `args`, asked in `root` of the copy the suite
 * runs. How a release words a rule, or a directive it cannot read, is its
 * own to choose, and the suite runs the lockfile's release and, in CI's
 * `test (minimum siblings)`, the oldest this package runs: a test of what
 * the harness does with those words reads them from here, and assumes no
 * release's.
 */
function guardAnswer(root: string, args: readonly string[]): unknown {
  const run = spawnSync(process.execPath, [SPEC_GUARD, ...args], { cwd: root, encoding: 'utf8' });
  return JSON.parse(run.stdout);
}

/** The words spec-guard gives the rule at `line` of `document`, asked about `path` as the harness asks it. */
export function guardRule(root: string, path: string, document: string, line: number): string {
  const answer = guardAnswer(root, ['query', path, '--json']) as { results: { rules: { document: string; line: number; description: string }[] }[] };
  const rule = answer.results.flatMap((result) => result.rules).find((each) => each.document === document && each.line === line);
  if (rule === undefined) throw new Error(`spec-guard names no rule at ${document}:${line} over ${path}`);
  return rule.description;
}

/**
 * What spec-guard says of the directive it cannot read at `line` of `file`,
 * run as the harness runs a brief's assertions.
 */
export function guardCannotRead(root: string, file: string, line: number): string {
  const answer = guardAnswer(root, [file, '--ignore-status', '--json']) as { errors?: { message: string; spec?: { line?: number } }[] };
  const error = (answer.errors ?? []).find((each) => each.spec?.line === line);
  if (error === undefined) throw new Error(`spec-guard reads the directive at ${file}:${line}`);
  return error.message;
}

export interface Captured {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * The CLI, in-process, with its output captured and an environment and an
 * input of the test's own. The input is empty where the test gives none:
 * left to the process's, a command that came to read it, as a mutant of the
 * command line can, would wait on the test runner's stdin until the test's
 * clock ran out, where it now fails at once.
 */
export async function cli(
  argv: readonly string[],
  cwd: string,
  options: { readonly env?: Readonly<Record<string, string | undefined>>; readonly stdin?: string; readonly platform?: NodeJS.Platform } = {},
): Promise<Captured> {
  let stdout = '';
  let stderr = '';
  const stdin = options.stdin ?? '';
  const io: CliIO = {
    stdout: { write: (text: string) => (stdout += text) },
    stderr: { write: (text: string) => (stderr += text) },
    cwd,
    env: options.env ?? {},
    stdin: async () => stdin,
    platform: options.platform,
  };
  const code = await run(argv, io);
  return { code, stdout, stderr };
}

/** The JSON document a `--format json` run printed. */
export function parsed<T = Record<string, unknown>>(captured: Captured): T {
  try {
    return JSON.parse(captured.stdout) as T;
  } catch {
    throw new Error(`not JSON (exit ${captured.code}):\n${captured.stdout}\n${captured.stderr}`);
  }
}

/** The built command line, spawned as a person runs it. */
export function spawnBin(args: readonly string[], cwd: string, input?: string): Captured {
  if (!existsSync(join(ROOT, 'dist', 'cli.js'))) throw new Error('dist/cli.js is missing: run "npm run build" before the suite');
  const result = spawnSync(process.execPath, [BIN, ...args], { cwd, input: input ?? '', encoding: 'utf8', env: { ...process.env, SPEC_BRIEF: '' } });
  return { code: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

/**
 * Runs `work` with `changes` made to this process's environment, which is
 * what a command the harness starts is handed, and puts back what was there.
 * A name is changed in every case it is spelled in: on Windows the spellings
 * are one variable, and elsewhere a test that sets one means the others gone,
 * whatever the person running the suite has set. `undefined` only takes the
 * name out.
 */
export async function withEnvironment<T>(changes: Readonly<Record<string, string | undefined>>, work: () => Promise<T>): Promise<T> {
  const spellings = (name: string): string[] => Object.keys(process.env).filter((key) => key.toLowerCase() === name.toLowerCase());
  const clear = (): [string, string | undefined][] =>
    Object.keys(changes).flatMap((name) =>
      spellings(name).map((key) => {
        const value = process.env[key];
        delete process.env[key];
        return [key, value] as [string, string | undefined];
      }),
    );
  const before = clear();
  for (const [name, value] of Object.entries(changes)) if (value !== undefined) process.env[name] = value;
  try {
    return await work();
  } finally {
    clear();
    for (const [key, value] of before) if (value !== undefined) process.env[key] = value;
  }
}

/**
 * Whether ssh-keygen is on PATH. Only "no such program" says it is not: on a
 * loaded host a spawn can fail for other reasons, and a signing test skipped
 * for one of those would pass silently. ssh-keygen exits non-zero on "-?".
 */
export function hasSshKeygen(): boolean {
  const result = spawnSync('ssh-keygen', ['-?'], { stdio: 'ignore' });
  return (result.error as NodeJS.ErrnoException | undefined)?.code !== 'ENOENT';
}

/** Whether the filesystem holding `directory` ignores case, measured rather than assumed from the platform. */
export function ignoresCase(directory: string): boolean {
  const probe = join(directory, 'case-probe.txt');
  writeFileSync(probe, '');
  try {
    return existsSync(join(directory, 'CASE-PROBE.TXT'));
  } finally {
    rmSync(probe, { force: true });
  }
}

/** A throwaway ed25519 key, and the allowed-signers line that names it. */
export function signingKey(directory: string, email = 't@example.com'): { key: string; signers: string } {
  const key = join(directory, 'key');
  execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', email, '-f', key], { stdio: 'ignore' });
  return { key, signers: `${email} namespaces="git" ${readFileSync(`${key}.pub`, 'utf8').trim()}\n` };
}

/** Commits everything, signed with `key`. */
export function commitSigned(repo: Repository, key: string, message: string): string {
  repo.git('add', '-A');
  repo.git('-c', 'gpg.format=ssh', '-c', `user.signingkey=${key}`, 'commit', '-q', '-S', '-m', message);
  return repo.git('rev-parse', 'HEAD');
}
