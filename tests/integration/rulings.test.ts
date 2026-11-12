import { copyFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Decision } from '../../src/guard.js';
import type { EscalationRequest } from '../../src/rulings.js';
import { tools } from '../../src/server.js';
import type { Finding } from '../../src/types.js';
import { openWorkspace, parseOptions } from '../../src/workspace.js';
import {
  brief,
  BRIEF_FILE,
  cleanup,
  cli,
  commitSigned,
  hasSshKeygen,
  installHarness,
  parsed,
  repository,
  siblings,
  signingKey,
  SPEC_BRIEF,
  temp,
  write,
  type Repository,
} from './helpers.js';

afterAll(cleanup);

const FILES = {
  'src/db/schema.ts': 'table;\n',
  'src/db/other.ts': 'other;\n',
  'src/auth/a.ts': 'a;\n',
};

function round(extra: Record<string, string> = {}): Repository {
  const repo = repository({ [BRIEF_FILE]: brief({ affected: ['src/auth/**'], protected: ['src/db/**'] }), ...FILES, ...extra });
  repo.git('checkout', '-q', '-b', 'brief/001-rotate');
  return repo;
}

function escalations(repo: Repository): string[] {
  const directory = join(repo.git('rev-parse', '--path-format=absolute', '--git-common-dir'), 'spec-harness', 'escalations');
  return existsSync(directory) ? readdirSync(directory).sort() : [];
}

async function decision(repo: Repository, path: string): Promise<Decision> {
  const result = await cli(['guard', path, '--format', 'json'], repo.root);
  return parsed<{ decisions: Decision[] }>(result).decisions[0] as Decision;
}

interface RulingsDocument {
  rows: { id: string; decision: string; line: number }[];
  verified: { id: string; paths: string[]; signer: string }[];
  unverified: { id: string; reason: string }[];
  problems: Finding[];
}

async function rulings(repo: Repository): Promise<RulingsDocument & { code: number }> {
  const result = await cli(['rulings', '--format', 'json'], repo.root);
  return { ...parsed<RulingsDocument>(result), code: result.code };
}

describe('escalate', () => {
  let repo: Repository;
  beforeAll(() => {
    repo = round();
  });

  it('needs the paths and the reason', async () => {
    const result = await cli(['escalate', '--path', 'src/db/schema.ts'], repo.root);
    expect(result).toMatchObject({ code: 2, stderr: 'spec-harness: escalate needs --path <file> (repeatable) and --reason <why>; or --list, or --show <id>\n' });
    expect(await cli(['escalate', '--reason', 'r'], repo.root)).toMatchObject({ code: 2, stderr: result.stderr });
    expect(await cli(['escalate', '--list'], repo.root)).toMatchObject({ code: 0, stdout: 'no escalation is waiting\n' });
  });

  it('records the request outside the work tree and prints the memo, exiting 1 while it waits', async () => {
    const result = await cli(
      ['escalate', '--path', 'src/db/schema.ts', '--reason', 'Rotation needs a rotated_at column.', '--option', 'Allow: one additive column', '--option', 'Refuse', '--recommend', 'Allow; it is additive.'],
      repo.root,
    );
    expect(result.code).toBe(1);
    expect(result.stdout.startsWith('# Escalation E-001-1\n\nBrief 001 (`briefs/001_rotate-tokens.md`) on `brief/001-rotate` at `')).toBe(true);
    expect(result.stdout).toContain('1. **Allow** - one additive column\n2. **Refuse**\n');
    expect(result.stdout).toContain('## The agent recommends\n\nAllow; it is additive.\n');
    expect(escalations(repo)).toEqual(['E-001-1.json']);
    // In-flight state is not the repository's: nothing for git status to show.
    expect(repo.git('status', '--porcelain')).toBe('');
  });

  // The two tests below each raise, in a round of their own, the requests
  // they then number after and list beside. They read the ones the test
  // above had raised, and a mutation sweep runs a test without the tests
  // before it wherever those do not cover the mutant: the second request was
  // then the first, the test failed for whatever the mutant was, and the
  // sweep counted a kill (ADR-0010).
  it('numbers the next request after the last, and lists, shows and prints them as JSON', async () => {
    const own = round();
    expect((await cli(['escalate', '--path', 'src/db/schema.ts', '--reason', 'Rotation needs a rotated_at column.'], own.root)).code).toBe(1);
    const second = await cli(['escalate', '--path', 'src/db/other.ts', '--path', 'src/db/schema.ts', '--reason', 'Two\nlines.', '--format', 'json'], own.root);
    expect(second.code).toBe(1);
    const document = parsed<{ command: string; request: EscalationRequest; memo: string }>(second);
    expect(document.request).toMatchObject({ id: 'E-001-2', brief: '001', briefFile: BRIEF_FILE, paths: ['src/db/other.ts', 'src/db/schema.ts'], options: [], recommendation: null, branch: 'brief/001-rotate' });
    // Each of the three documents names the command it answers, as every document the harness prints does.
    expect(document.command).toBe('escalate');
    expect(document.request.head).toBe(own.git('rev-parse', 'HEAD'));
    expect(document.memo).toContain('# Escalation E-001-2');

    const list = await cli(['escalate', '--list'], own.root);
    expect(list.stdout).toBe('E-001-1  brief 001  src/db/schema.ts  Rotation needs a rotated_at column.\nE-001-2  brief 001  src/db/other.ts, src/db/schema.ts  Two\n');
    const listed = parsed<{ command: string; waiting: EscalationRequest[] }>(await cli(['escalate', '--list', '--format', 'json'], own.root));
    expect(listed.command).toBe('escalate');
    expect(listed.waiting.map((request) => request.id)).toEqual(['E-001-1', 'E-001-2']);
    expect((await cli(['escalate', '--show', 'E-001-2'], own.root)).stdout).toBe(document.memo);
    expect(parsed(await cli(['escalate', '--show', 'E-001-1', '--format', 'json'], own.root))).toMatchObject({ command: 'escalate', request: { id: 'E-001-1' } });
    expect(await cli(['escalate', '--show', 'E-001-9'], own.root)).toMatchObject({ code: 2, stderr: 'spec-harness: no escalation "E-001-9" is waiting\n' });
  });

  it('skips a request it cannot read rather than listing nothing true', async () => {
    const own = round();
    for (const path of ['src/db/schema.ts', 'src/db/other.ts']) await cli(['escalate', '--path', path, '--reason', 'r'], own.root);
    const directory = join(own.git('rev-parse', '--path-format=absolute', '--git-common-dir'), 'spec-harness', 'escalations');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(directory, 'E-001-0.json'), '{ broken');
    writeFileSync(join(directory, 'notes.txt'), 'x');
    expect(parsed<{ waiting: EscalationRequest[] }>(await cli(['escalate', '--list', '--format', 'json'], own.root)).waiting.map((r) => r.id)).toEqual([
      'E-001-1',
      'E-001-2',
    ]);
  });

  it('reads an option as its label and what it costs, either side of the first colon, trimmed', async () => {
    const other = round();
    const result = await cli(['escalate', '--path', 'a', '--reason', 'r', '--option', ' Refuse ', '--option', 'Allow : one column: additive', '--option', 'Wait:'], other.root);
    expect(result.stdout).toContain('## Options\n\n1. **Refuse**\n2. **Allow** - one column: additive\n3. **Wait**\n');
  });

  it('is never written with a part that says nothing: a person rules on the memo, and cannot rule on a hole in it', async () => {
    // Each of these wrote a memo: a file named ``, an empty Why, a choice
    // numbered and not named, a recommendation of nothing.
    const other = round();
    const request = ['escalate', '--path', 'src/db/schema.ts', '--reason', 'why'];
    const refused = async (argv: string[], stderr: string): Promise<void> => {
      expect(await cli(argv, other.root), argv.join(' ')).toEqual({ code: 2, stdout: '', stderr: `spec-harness: ${stderr}\n` });
    };
    await refused(['escalate', '--path', '', '--reason', 'why'], '--path is "", which names no file; give it the path of a file');
    await refused(['escalate', '--path', 'src/db/schema.ts', '--path', ' ', '--reason', 'why'], '--path is " ", which names no file; give it the path of a file');
    await refused(['escalate', '--path', 'src/db/schema.ts', '--reason', ' '], '--reason is " ", which gives no reason; say why the round cannot be done without the file');
    await refused([...request, '--option', ''], '--option is "", which names no choice; give it "<label>: <cost>", or leave it out');
    await refused([...request, '--option', 'Allow: one', '--option', ': a cost alone'], '--option is ": a cost alone", which names no choice before its colon; give it "<label>: <cost>"');
    await refused([...request, '--option', ' : '], '--option is " : ", which names no choice before its colon; give it "<label>: <cost>"');
    await refused([...request, '--recommend', ''], '--recommend is "", which recommends nothing; say which option and why, or leave it out');
    // A choice that cannot be read is refused before spec-brief is asked which brief.
    expect(await cli([...request, '--option', ':', '--brief', '404'], other.root)).toMatchObject({ code: 2, stderr: expect.stringContaining('--option is ":"') });
    expect(escalations(other)).toEqual([]);
    // What says something is written as before.
    expect((await cli(request, other.root)).code).toBe(1);
    expect(escalations(other)).toEqual(['E-001-1.json']);
  });

  it('needs a brief to escalate against', async () => {
    const plain = repository({ [BRIEF_FILE]: brief() });
    const result = await cli(['escalate', '--path', 'a', '--reason', 'b'], plain.root);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('no brief is named');
  });
});

describe('rule', () => {
  it('needs an id, exactly one decision and a note', async () => {
    const repo = round();
    expect(await cli(['rule'], repo.root)).toMatchObject({ code: 2, stderr: 'spec-harness: rule needs the escalation id, such as E-012-1\n' });
    expect(await cli(['rule', 'E-001-1', '--note', 'x'], repo.root)).toMatchObject({ code: 2, stderr: 'spec-harness: rule needs exactly one of --allow or --deny\n' });
    expect((await cli(['rule', 'E-001-1', '--allow', '--deny', '--note', 'x'], repo.root)).code).toBe(2);
    expect(await cli(['rule', 'E-001-1', '--allow', '--note', ' '], repo.root)).toMatchObject({
      code: 2,
      stderr: 'spec-harness: rule needs --note: what exactly is allowed, or why not\n',
    });
    expect(await cli(['rule', 'E-001-1', '--allow'], repo.root)).toMatchObject({ code: 2, stderr: 'spec-harness: rule needs --note: what exactly is allowed, or why not\n' });
    expect(await cli(['rule', 'E-001-1', '--allow', '--note', 'x'], repo.root)).toMatchObject({
      code: 2,
      stderr: 'spec-harness: no escalation "E-001-1" is waiting; spec-harness escalate --list shows those that are\n',
    });
  });

  it('prints the row it wrote and the signed commit that makes it count', async () => {
    const repo = round();
    await cli(['escalate', '--path', 'src/db/schema.ts', '--reason', 'r'], repo.root);
    expect(await cli(['rule', 'E-001-1', '--allow', '--note', 'One column.'], repo.root)).toMatchObject({
      code: 0,
      stdout: [
        `${BRIEF_FILE} now holds ruling R-001-1:`,
        '',
        '  | R-001-1 | `src/db/schema.ts` | allow | One column. |',
        '',
        "It counts once you commit it signed, with a key the base branch's allowed signers list:",
        '',
        `  git commit -S -m "ruling R-001-1: allow" -- ${BRIEF_FILE}`,
        '',
      ].join('\n'),
    });
  });

  it('stops with exit 2 when the brief the request names is gone', async () => {
    const repo = round();
    await cli(['escalate', '--path', 'src/db/schema.ts', '--reason', 'r'], repo.root);
    repo.git('rm', '-q', BRIEF_FILE);
    expect(await cli(['rule', 'E-001-1', '--allow', '--note', 'x'], repo.root)).toEqual({ code: 2, stdout: '', stderr: `spec-harness: ${BRIEF_FILE} cannot be read\n` });
    expect(escalations(repo)).toEqual(['E-001-1.json']);
  });

  it('writes a refusal into the brief, retires the request, and a refusal verifies nothing', async () => {
    const repo = round();
    await cli(['escalate', '--path', 'src/db/schema.ts', '--reason', 'r'], repo.root);
    const result = await cli(['rule', 'e-001-1', '--deny', '--note', 'Keep the schema.', '--format', 'json'], repo.root);
    expect(result.code).toBe(0);
    expect(parsed(result)).toMatchObject({
      command: 'rule',
      ruling: 'R-001-1',
      file: BRIEF_FILE,
      row: '| R-001-1 | `src/db/schema.ts` | deny | Keep the schema. |',
      commit: `git commit -S -m "ruling R-001-1: deny" -- ${BRIEF_FILE}`,
    });
    expect(repo.read(BRIEF_FILE).endsWith('\n## Rulings\n\n| Ruling | Paths | Decision | Note |\n| --- | --- | --- | --- |\n| R-001-1 | `src/db/schema.ts` | deny | Keep the schema. |\n')).toBe(true);
    expect(escalations(repo)).toEqual([]);
    const pretty = await cli(['rulings'], repo.root);
    expect(pretty).toMatchObject({ code: 0, stdout: 'R-001-1  deny  src/db/schema.ts  refused\n' });
  });

  it('rules only on the request it names, and numbers each ruling after the brief\'s last', async () => {
    const repo = round();
    await cli(['escalate', '--path', 'src/db/schema.ts', '--reason', 'r'], repo.root);
    await cli(['escalate', '--path', 'src/db/other.ts', '--reason', 'r'], repo.root);
    expect(await cli(['rule', 'E-001-9', '--deny', '--note', 'n'], repo.root)).toMatchObject({
      code: 2,
      stderr: 'spec-harness: no escalation "E-001-9" is waiting; spec-harness escalate --list shows those that are\n',
    });
    const first = parsed(await cli(['rule', 'E-001-2', '--deny', '--note', 'n', '--format', 'json'], repo.root));
    expect(first).toMatchObject({ ruling: 'R-001-1', row: '| R-001-1 | `src/db/other.ts` | deny | n |' });
    const second = parsed(await cli(['rule', 'E-001-1', '--deny', '--note', 'n', '--format', 'json'], repo.root));
    expect(second).toMatchObject({ ruling: 'R-001-2', row: '| R-001-2 | `src/db/schema.ts` | deny | n |' });
  });

  it('rules on a request of a brief whose id has lowercase letters, by the id as it is written', async () => {
    // spec-brief reads the id from the front matter when its configuration says so.
    const text = brief({ affected: ['src/auth/**'], protected: ['src/db/**'] }).replace('---\n', '---\nid: rt-7\n');
    const repo = repository({ '.spec-brief.json': JSON.stringify({ files: '*.md', id: { source: 'frontmatter' } }), 'briefs/rotate.md': text, ...FILES });
    expect(parsed<{ request: EscalationRequest }>(await cli(['escalate', '--brief', 'rt-7', '--path', 'src/db/schema.ts', '--reason', 'r', '--format', 'json'], repo.root)).request.id).toBe('E-rt-7-1');
    const ruled = await cli(['rule', 'E-rt-7-1', '--deny', '--note', 'n', '--format', 'json'], repo.root);
    expect(ruled.code).toBe(0);
    expect(parsed(ruled)).toMatchObject({ ruling: 'R-rt-7-1', file: 'briefs/rotate.md' });
  });

  it('lists the requests in order, and nothing a write left half done beside them', async () => {
    const repo = round();
    for (const path of ['src/db/schema.ts', 'src/db/other.ts', 'src/db/third.ts']) await cli(['escalate', '--path', path, '--reason', 'r'], repo.root);
    const directory = join(repo.git('rev-parse', '--path-format=absolute', '--git-common-dir'), 'spec-harness', 'escalations');
    // What writeAtomic leaves when it is stopped between writing and renaming.
    copyFileSync(join(directory, 'E-001-2.json'), join(directory, 'E-001-2.json.4242.tmp'));
    const listed = parsed<{ waiting: EscalationRequest[] }>(await cli(['escalate', '--list', '--format', 'json'], repo.root));
    expect(listed.waiting.map((request) => request.id)).toEqual(['E-001-1', 'E-001-2', 'E-001-3']);
  });

  it('allows nothing by a row in a brief git does not track yet', async () => {
    const repo = round({ '.github/allowed_signers': 'someone@example.com namespaces="git" ssh-ed25519 AAAA\n' });
    repo.write(
      'briefs/002_next.md',
      `${brief({ title: '002 - Next', affected: ['src/auth/**'], protected: ['src/db/**'] })}\n## Rulings\n\n| Ruling | Paths | Decision | Note |\n| --- | --- | --- | --- |\n| R-002-1 | \`src/db/schema.ts\` | allow | n |\n`,
    );
    const result = await cli(['rulings', '2', '--format', 'json'], repo.root);
    expect(parsed<RulingsDocument>(result).unverified).toEqual([{ id: 'R-002-1', reason: 'its row is not committed' }]);
  });

  it('reports rows it cannot read as problems, and a brief with none', async () => {
    const empty = round();
    expect(await cli(['rulings'], empty.root)).toMatchObject({ code: 0, stdout: 'brief 001 holds no ruling\n' });
    const bad = round();
    bad.write(BRIEF_FILE, `${bad.read(BRIEF_FILE)}\n## Rulings\n\n| Ruling | Paths | Decision |\n| --- | --- | --- |\n| R-001-1 | \`a\` | perhaps |\n`);
    expect(parsed(await cli(['rulings', '--format', 'json'], bad.root))).toMatchObject({ command: 'rulings', brief: '001' });
    expect((await cli(['rulings'], bad.root)).stdout).toBe(
      `brief 001 holds no ruling\nwarning  ${BRIEF_FILE}:25  ruling R-001-1 decides "perhaps"; a decision is allow or deny  ruling-unreadable\n         a ruling row is | id | \`paths\` | allow or deny | note |\n`,
    );
    const result = await rulings(bad);
    expect(result.code).toBe(1);
    expect(result.problems).toEqual([
      { rule: 'ruling-unreadable', severity: 'warning', message: 'ruling R-001-1 decides "perhaps"; a decision is allow or deny', hint: 'a ruling row is | id | `paths` | allow or deny | note |', file: BRIEF_FILE, line: 25 },
    ]);
  });
});

describe.skipIf(!hasSshKeygen())('a ruling is a row whose commit a person signed (needs ssh-keygen on PATH)', () => {
  let repo: Repository;
  let key: string;
  let signers: string;

  beforeAll(async () => {
    const keys = temp();
    const made = signingKey(keys);
    key = made.key;
    signers = made.signers;
    repo = round({ '.github/allowed_signers': made.signers });
    await cli(['escalate', '--path', 'src/db/schema.ts', '--reason', 'Rotation needs a column.'], repo.root);
    await cli(['rule', 'E-001-1', '--allow', '--note', 'One column.'], repo.root);
  });

  it('allows nothing while the row is not committed', async () => {
    const state = await rulings(repo);
    expect(state.code).toBe(1);
    expect(state.verified).toEqual([]);
    expect(state.unverified).toEqual([{ id: 'R-001-1', reason: 'its row is not committed' }]);
    expect(await decision(repo, 'src/db/schema.ts')).toMatchObject({ verdict: 'deny', reason: 'protected' });
  });

  describe('once a person signs the commit', () => {
    // Signed here, before each of the three, and not by the first of them
    // for the two after it: a mutation sweep runs a test without the tests
    // before it, and an unsigned row allows nothing (ADR-0010).
    beforeAll(() => {
      commitSigned(repo, key, 'ruling R-001-1: allow');
    });

    it('allows the paths it names, and no others', async () => {
      const state = await rulings(repo);
      expect(state.code).toBe(0);
      expect(state.verified).toEqual([{ id: 'R-001-1', paths: ['src/db/schema.ts'], signer: 't@example.com' }]);
      expect((await cli(['rulings'], repo.root)).stdout).toBe('R-001-1  allow  src/db/schema.ts  signed by t@example.com\n');
      expect(await decision(repo, 'src/db/schema.ts')).toMatchObject({ verdict: 'allow', reason: 'ruled', because: ['R-001-1'] });
      expect(await decision(repo, 'src/db/other.ts')).toMatchObject({ verdict: 'deny', reason: 'protected' });
      expect((await cli(['context'], repo.root)).stdout).toContain('Rulings in force:\n- R-001-1, signed by t@example.com: `src/db/schema.ts`\n');
    });

    it('allows a protected path beside one in scope, deciding each', async () => {
      const result = parsed<{ decisions: Decision[] }>(await cli(['guard', 'src/db/schema.ts', 'src/auth/a.ts', 'src/db/other.ts', '--format', 'json'], repo.root));
      expect(result.decisions.map((d) => [d.path, d.verdict, d.reason])).toEqual([
        ['src/db/schema.ts', 'allow', 'ruled'],
        ['src/auth/a.ts', 'allow', 'in-scope'],
        ['src/db/other.ts', 'deny', 'protected'],
      ]);
    });

    it('does not lend a signed line\'s commit to an uncommitted row written where that line was', async () => {
      // At HEAD, the line this row now occupies is the signed ruling's. Blamed
      // at HEAD, the agent's own row would verify without anyone signing it.
      const signed = '| R-001-1 | `src/db/schema.ts` | allow | One column. |';
      const text = repo.read(BRIEF_FILE);
      repo.write(BRIEF_FILE, text.replace(signed, `| R-001-2 | \`src/db/other.ts\` | allow | The agent's own. |\n${signed}`));
      try {
        const state = await rulings(repo);
        expect(state.verified.map((r) => r.id)).toEqual(['R-001-1']);
        expect(state.unverified).toEqual([{ id: 'R-001-2', reason: 'its row is not committed' }]);
        expect(await decision(repo, 'src/db/other.ts')).toMatchObject({ verdict: 'deny', reason: 'protected' });
        expect(await decision(repo, 'src/db/schema.ts')).toMatchObject({ verdict: 'allow', reason: 'ruled' });
      } finally {
        repo.git('checkout', '--', BRIEF_FILE);
      }
    });
  });

  it('prints each ruling with its paths and whether its signature verifies', async () => {
    const other = round({ '.github/allowed_signers': signers });
    await cli(['escalate', '--path', 'src/db/schema.ts', '--path', 'src/db/other.ts', '--reason', 'r'], other.root);
    await cli(['escalate', '--path', 'src/db/other.ts', '--reason', 'r'], other.root);
    await cli(['escalate', '--path', 'src/auth/a.ts', '--reason', 'r'], other.root);
    await cli(['rule', 'E-001-1', '--allow', '--note', 'n'], other.root);
    commitSigned(other, key, 'ruling R-001-1: allow');
    await cli(['rule', 'E-001-2', '--allow', '--note', 'n'], other.root);
    const unsigned = other.commit('ruling R-001-2, unsigned');
    await cli(['rule', 'E-001-3', '--allow', '--note', 'n'], other.root);
    expect(await cli(['rulings'], other.root)).toMatchObject({
      code: 1,
      stdout: [
        'R-001-1  allow  src/db/schema.ts, src/db/other.ts  signed by t@example.com',
        `R-001-2  allow  src/db/other.ts  not verified: commit ${unsigned.slice(0, 12)} last changed its row, and it is not signed`,
        'R-001-3  allow  src/auth/a.ts  not verified: its row is not committed',
        '',
      ].join('\n'),
    });
  });

  it('points at doctor when spec-brief loads the plugin and its archive still refuses a file a signed ruling allows', async () => {
    // spec-brief as installed, but for an archive that refuses the ruled file, as one measured from another base would.
    const plan = { plan: { blocking: [{ rule: 'protected-file', severity: 'error', message: 'src/db/schema.ts is protected', hint: 'h', path: 'src/db/schema.ts' }], warnings: [] } };
    const fake = temp();
    write(
      fake,
      'spec-brief.mjs',
      [
        "import { spawnSync } from 'node:child_process';",
        'const args = process.argv.slice(2);',
        `if (args[0] === 'archive') { process.stdout.write(${JSON.stringify(JSON.stringify(plan))}); process.exit(1); }`,
        `const run = spawnSync(process.execPath, [${JSON.stringify(SPEC_BRIEF)}, ...args], { stdio: 'inherit' });`,
        'process.exit(run.status ?? 1);',
        '',
      ].join('\n'),
    );
    const other = repository(
      {
        [BRIEF_FILE]: brief({ affected: ['src/auth/**'], protected: ['src/db/**'] }),
        ...FILES,
        '.github/allowed_signers': signers,
        '.spec-brief.json': `${JSON.stringify({ plugins: ['@spec-family/spec-harness/spec-brief-plugin'] })}\n`,
      },
      { tools: { ...siblings(), 'spec-brief': ['node', join(fake, 'spec-brief.mjs')] } },
    );
    other.git('checkout', '-q', '-b', 'brief/001-rotate');
    await cli(['escalate', '--path', 'src/db/schema.ts', '--reason', 'r'], other.root);
    await cli(['rule', 'E-001-1', '--allow', '--note', 'One column.'], other.root);
    commitSigned(other, key, 'ruling R-001-1: allow');
    const findings = parsed<{ findings: Finding[] }>(await cli(['audit', '--format', 'json'], other.root)).findings;
    expect(findings.find((f) => f.rule === 'archive/protected-file')?.hint).toBe(
      'ruling R-001-1, signed by t@example.com, allows it, and the archive still refused it: check that spec-brief loads the spec-harness installed here and measures from the same base (spec-harness doctor)',
    );
  });

  it('allows nothing once anyone edits the row without signing', async () => {
    repo.write(BRIEF_FILE, repo.read(BRIEF_FILE).replace('`src/db/schema.ts` | allow', '`src/db/**` | allow'));
    const tampered = repo.commit('widen the ruling');
    const state = await rulings(repo);
    expect(state.code).toBe(1);
    expect(state.verified).toEqual([]);
    expect(state.unverified).toEqual([{ id: 'R-001-1', reason: `commit ${tampered.slice(0, 12)} last changed its row, and it is not signed` }]);
    expect(await decision(repo, 'src/db/schema.ts')).toMatchObject({ verdict: 'deny', reason: 'protected' });
    expect(await decision(repo, 'src/db/other.ts')).toMatchObject({ verdict: 'deny', reason: 'protected' });
    const audit = parsed<{ findings: Finding[] }>(await cli(['audit', '--format', 'json'], repo.root));
    expect(audit.findings.find((f) => f.rule === 'ruling-unverified')?.message).toBe(
      `ruling R-001-1 allows nothing: commit ${tampered.slice(0, 12)} last changed its row, and it is not signed`,
    );
  });

  it('counts only the signers the base branch lists, never the round\'s own', async () => {
    const keys = temp();
    const stranger = signingKey(keys, 'stranger@example.com');
    const other = round();
    // The round adds its own signer; the base branch has none.
    other.write('.github/allowed_signers', stranger.signers);
    await cli(['escalate', '--path', 'src/db/schema.ts', '--reason', 'r'], other.root);
    await cli(['rule', 'E-001-1', '--allow', '--note', 'n'], other.root);
    commitSigned(other, stranger.key, 'ruling');
    const state = await rulings(other);
    expect(state.unverified).toEqual([{ id: 'R-001-1', reason: 'main has no .github/allowed_signers, so no signature can count' }]);
    expect(await decision(other, 'src/db/schema.ts')).toMatchObject({ reason: 'protected' });
  });

  it('counts no signer of a base the work tree names, where the remote\'s default branch configures another (ADR-0006)', async () => {
    const agent = signingKey(temp(), 'agent@example.com');
    const other = round({ '.github/allowed_signers': signers });
    other.git('update-ref', 'refs/remotes/origin/main', 'main');
    other.git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
    // The agent's branch, from the base, lists the agent as a signer.
    other.git('checkout', '-q', '-b', 'evil', 'main');
    other.write('.github/allowed_signers', agent.signers);
    other.commit('the agent signs');
    other.git('checkout', '-q', 'brief/001-rotate');
    other.write('.spec-harness.json', `${JSON.stringify({ base: 'evil', tools: siblings() }, null, 2)}\n`);
    await cli(['escalate', '--path', 'src/db/schema.ts', '--reason', 'r'], other.root);
    await cli(['rule', 'E-001-1', '--allow', '--note', 'n'], other.root);
    commitSigned(other, agent.key, 'ruling, signed by the agent');
    const state = await rulings(other);
    expect(state.verified).toEqual([]);
    expect(await decision(other, 'src/db/schema.ts')).toMatchObject({ verdict: 'deny', reason: 'protected' });
    const audit = parsed<{ findings: Finding[] }>(await cli(['audit', '--format', 'json'], other.root));
    expect(audit.findings.find((f) => f.rule === 'harness-config-changed')?.message).toBe(
      "the work tree's .spec-harness.json measures the round from evil, where origin/main has main: the round is measured from main",
    );
  });

  it('counts a signer the base lists only where the merge base listed it too', async () => {
    const keys = temp();
    const first = signingKey(keys, 'first@example.com');
    const later = signingKey(temp(), 'later@example.com');
    const other = round({ '.github/allowed_signers': first.signers });
    // A signer added to the base while the round ran.
    other.git('checkout', '-q', 'main');
    other.write('.github/allowed_signers', `${first.signers}${later.signers}`);
    other.commit('a second signer');
    other.git('checkout', '-q', 'brief/001-rotate');
    await cli(['escalate', '--path', 'src/db/schema.ts', '--reason', 'r'], other.root);
    await cli(['rule', 'E-001-1', '--allow', '--note', 'n'], other.root);
    const commit = commitSigned(other, later.key, 'ruling, signed by the later signer');
    const state = await rulings(other);
    expect(state.verified).toEqual([]);
    expect(state.unverified[0]?.reason.startsWith(`commit ${commit.slice(0, 12)} last changed its row, and `)).toBe(true);
    // The one the merge base listed too counts, on the same branch.
    other.write(BRIEF_FILE, other.read(BRIEF_FILE).replace('| n |', '| n, signed by the first |'));
    commitSigned(other, first.key, 'ruling, signed by the first signer');
    expect((await rulings(other)).verified.map((r) => r.signer)).toEqual(['first@example.com']);
  });

  it('does not count a good signature by a key the base branch does not list', async () => {
    const keys = temp();
    const listed = signingKey(keys, 'person@example.com');
    const unlisted = signingKey(temp(), 'agent@example.com');
    const other = round({ '.github/allowed_signers': listed.signers });
    await cli(['escalate', '--path', 'src/db/schema.ts', '--reason', 'r'], other.root);
    await cli(['rule', 'E-001-1', '--allow', '--note', 'n'], other.root);
    const commit = commitSigned(other, unlisted.key, 'ruling');
    const state = await rulings(other);
    expect(state.verified).toEqual([]);
    expect(state.unverified[0]?.reason.startsWith(`commit ${commit.slice(0, 12)} last changed its row, and `)).toBe(true);
    expect(state.unverified[0]?.reason).not.toContain('it is not signed');
    // What git said, its first line: the key that signed, and no more.
    expect(state.unverified[0]?.reason).toMatch(/, and Good "git" signature with ED25519 key SHA256:\S+$/);
  });

  it('reads the signers from the base --base names in guard, context and the server, as rulings does', async () => {
    // No remote and no base configured: without the flag there is no base.
    const other = repository({ [BRIEF_FILE]: brief({ affected: ['src/auth/**'], protected: ['src/db/**'] }), ...FILES, '.github/allowed_signers': signers }, { base: null });
    other.git('checkout', '-q', '-b', 'brief/001-rotate');
    await cli(['escalate', '--path', 'src/db/schema.ts', '--reason', 'r'], other.root);
    await cli(['rule', 'E-001-1', '--allow', '--note', 'n'], other.root);
    commitSigned(other, key, 'ruling R-001-1: allow');
    expect(parsed<RulingsDocument>(await cli(['rulings', '--base', 'main', '--format', 'json'], other.root)).verified.map((r) => r.id)).toEqual(['R-001-1']);

    expect(await decision(other, 'src/db/schema.ts')).toMatchObject({ verdict: 'deny', reason: 'protected' });
    const guarded = await cli(['guard', 'src/db/schema.ts', '--base', 'main', '--format', 'json'], other.root);
    expect(guarded.code).toBe(0);
    expect(parsed<{ decisions: Decision[] }>(guarded).decisions[0]).toMatchObject({ verdict: 'allow', reason: 'ruled', because: ['R-001-1'] });

    expect((await cli(['context'], other.root)).stdout).toContain('Rulings in force:\n- none\n');
    const context = await cli(['context', '--base', 'main'], other.root);
    expect(context.stdout).toContain(' · measured from `main`\n');
    expect(context.stdout).toContain('Rulings in force:\n- R-001-1, signed by t@example.com: `src/db/schema.ts`\n');

    const workspace = await openWorkspace(parseOptions(['mcp']), { stdout: { write: () => true }, stderr: { write: () => true }, cwd: other.root, env: {} });
    const tool = (name: string) => tools(workspace, {}).find((candidate) => candidate.descriptor.name === name);
    expect((await tool('check_path')?.call({ paths: ['src/db/schema.ts'] }))?.text).toMatch(/^deny: /);
    expect((await tool('check_path')?.call({ paths: ['src/db/schema.ts'], base: 'main' }))?.text).toBe(
      'allow: src/db/schema.ts is protected by brief 001, and ruling R-001-1, signed by t@example.com, allows it',
    );
    expect((await tool('start_round')?.call({}))?.text).toContain('Rulings in force:\n- none\n');
    expect((await tool('start_round')?.call({ base: 'main' }))?.text).toContain('Rulings in force:\n- R-001-1, signed by t@example.com: `src/db/schema.ts`\n');
  });

  it('names a path of a signed ruling the guard cannot read, in context and start_round, as allowing nothing', async () => {
    const huge = `${'{a,b}'.repeat(8)}/${'x'.repeat(300)}`;
    const other = round({ '.github/allowed_signers': signers });
    await cli(['escalate', '--path', 'src/db/schema.ts', '--path', 'src/db/[a', '--path', huge, '--path', '{./,src}', '--reason', 'r'], other.root);
    await cli(['rule', 'E-001-1', '--allow', '--note', 'n'], other.root);
    commitSigned(other, key, 'ruling R-001-1: allow');
    const unreadable = [
      { ruling: 'R-001-1', pattern: 'src/db/[a', reason: 'a "[" is never closed' },
      { ruling: 'R-001-1', pattern: huge, reason: 'the pattern compiles to more than 65536 states' },
      { ruling: 'R-001-1', pattern: '{./,src}', reason: 'the braces expand to "./", which names no path' },
    ];
    const listed =
      'Rulings in force:\n- R-001-1, signed by t@example.com: `src/db/schema.ts`, ' +
      '`src/db/[a` (which the guard cannot read: a "[" is never closed; it allows nothing), ' +
      `\`${huge}\` (which the guard cannot read: the pattern compiles to more than 65536 states; it allows nothing), ` +
      '`{./,src}` (which the guard cannot read: the braces expand to "./", which names no path; it allows nothing)\n';

    const context = parsed<{ markdown: string; unreadableRulingPaths: unknown[] }>(await cli(['context', '--format', 'json'], other.root));
    expect(context).toMatchObject({ unreadableRulingPaths: unreadable, unreadableScope: [], unreadableProtections: [] });
    expect(context.markdown).toContain(listed);

    const workspace = await openWorkspace(parseOptions(['mcp']), { stdout: { write: () => true }, stderr: { write: () => true }, cwd: other.root, env: {} });
    const started = await tools(workspace, {}).find((candidate) => candidate.descriptor.name === 'start_round')?.call({});
    expect(started?.structured).toMatchObject({ unreadableRulingPaths: unreadable, unreadableScope: [], unreadableProtections: [] });
    expect(started?.text).toContain(listed);

    // As the guard decides: the path it reads allows, and a protected path only an unreadable one names is refused.
    expect(await decision(other, 'src/db/schema.ts')).toMatchObject({ verdict: 'allow', reason: 'ruled', because: ['R-001-1'] });
    expect(await decision(other, 'src/db/other.ts')).toMatchObject({ verdict: 'deny', reason: 'protected' });
  });

  it('says why the archive refuses a file a signed ruling allows, until spec-brief loads the plugin, which waives it', async () => {
    const other = round({ '.github/allowed_signers': signers });
    installHarness(other.root);
    await cli(['escalate', '--path', 'src/db/schema.ts', '--reason', 'r'], other.root);
    await cli(['rule', 'E-001-1', '--allow', '--note', 'One column.'], other.root);
    commitSigned(other, key, 'ruling R-001-1: allow');
    other.write('src/db/schema.ts', 'table;\ncolumn;\n');
    other.commit('round 001: a column');

    const audit = async () => parsed<{ findings: Finding[] }>(await cli(['audit', '--format', 'json'], other.root)).findings;
    const refused = (await audit()).filter((f) => f.rule === 'archive/protected-file');
    expect(refused).toHaveLength(1);
    expect(refused[0]?.hint).toContain('ruling R-001-1, signed by t@example.com, allows it, but spec-brief does not load spec-harness\'s plugin');
    expect((await cli(['doctor'], other.root)).stdout).toContain('\nplugin  spec-brief has no configuration at the root, so it loads no plugin');

    // By the name an earlier release wrote, spec-brief loads the earlier
    // package's plugin, here one that waives nothing; the name now added
    // beside it would be a second plugin of one name.
    other.write('node_modules/@descent-vtt/spec-harness/package.json', `${JSON.stringify({ name: '@descent-vtt/spec-harness', type: 'module', exports: { './spec-brief-plugin': './plugin.js' } })}\n`);
    other.write('node_modules/@descent-vtt/spec-harness/plugin.js', "export default function plugin() {\n  return { name: 'spec-harness', rules: [], waive: async () => [] };\n}\n");
    other.write('.spec-brief.json', `${JSON.stringify({ plugins: ['@descent-vtt/spec-harness/spec-brief-plugin'] })}\n`);
    other.commit('spec-brief: the plugin by the name an earlier release wrote');
    const named = (await audit()).filter((f) => f.rule === 'archive/protected-file');
    expect(named).toHaveLength(1);
    expect(named[0]?.hint).toContain(
      'ruling R-001-1, signed by t@example.com, allows it, but spec-brief\'s configuration names spec-harness\'s plugin "@descent-vtt/spec-harness/spec-brief-plugin", by the name of this package\'s releases up to 0.21.0, so its archive asks that release',
    );

    other.write('.spec-brief.json', `${JSON.stringify({ plugins: ['@spec-family/spec-harness/spec-brief-plugin'] })}\n`);
    other.commit('spec-brief: load the spec-harness plugin');
    const findings = await audit();
    expect(findings.filter((f) => f.severity === 'error')).toEqual([]);
    expect(findings.map((f) => f.rule)).toContain('archive/waived');
    expect((await cli(['doctor'], other.root)).stdout).toContain("\nplugin  spec-brief loads spec-harness's plugin (.spec-brief.json)");
  });

  it('says a ruling cannot count with no base to read the signers from', async () => {
    const result = await cli(['rulings', '--base', 'no-such-ref', '--format', 'json'], repo.root);
    expect(parsed<RulingsDocument>(result).unverified).toEqual([
      { id: 'R-001-1', reason: 'no base to read the allowed signers from: "no-such-ref" names no commit' },
    ]);
  });
});
