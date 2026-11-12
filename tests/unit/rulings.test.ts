import { describe, expect, it } from 'vitest';

import { createReader } from '../../src/reader.js';
import { addRulingRow, nextId, pathsOf, readRulings, renderMemo, renderRow, signersAtBoth, type EscalationRequest, type TableView } from '../../src/rulings.js';

function table(headers: string[], ...rows: [number, ...string[]][]): TableView {
  return { headers, rows: rows.map(([line, ...cells]) => ({ cells, line })) };
}

const HEADERS = ['Ruling', 'Paths', 'Decision', 'Note'];

describe('the paths a ruling names', () => {
  it('reads backtick-quoted globs, ignoring the text around them', () => {
    expect(pathsOf('`src/db/schema.ts`, `migrations/*.sql` and nothing else')).toEqual(['src/db/schema.ts', 'migrations/*.sql']);
    expect(pathsOf('` spaced.ts `')).toEqual(['spaced.ts']);
    expect(pathsOf('` ` and `a`')).toEqual(['a']);
  });

  it('reads a comma-separated list when nothing is quoted', () => {
    expect(pathsOf('src/a.ts, src/b.ts ,, ')).toEqual(['src/a.ts', 'src/b.ts']);
    expect(pathsOf('')).toEqual([]);
    expect(pathsOf('  ')).toEqual([]);
  });
});

describe('reading a rulings table', () => {
  it('reads each row: id in capitals, paths, decision and note', () => {
    const { rulings, problems } = readRulings([
      table(HEADERS, [12, 'r-012-1', '`src/db/schema.ts`', 'Allow', ' Add rotated_at only. '], [13, 'R-012-2', 'src/a.ts, src/b.ts', '**deny**', '']),
    ]);
    expect(problems).toEqual([]);
    expect(rulings).toEqual([
      { id: 'R-012-1', paths: ['src/db/schema.ts'], decision: 'allow', note: 'Add rotated_at only.', line: 12 },
      { id: 'R-012-2', paths: ['src/a.ts', 'src/b.ts'], decision: 'deny', note: '', line: 13 },
    ]);
  });

  it('finds the columns by name, in any order and any case, with the names people use', () => {
    const { rulings } = readRulings([
      table(['Notes', '**DECISION**', '`Files`', 'id'], [5, 'why', 'allow', '`a.ts`', 'R-1-1']),
      table(['Reason', 'Path', 'Decision', 'Ruling'], [9, 'because', '`b.ts`', 'deny', 'R-1-2']),
    ]);
    expect(rulings).toEqual([
      { id: 'R-1-1', paths: ['a.ts'], decision: 'allow', note: 'why', line: 5 },
      { id: 'R-1-2', paths: ['b.ts'], decision: 'deny', note: 'because', line: 9 },
    ]);
  });

  it('reads a table with no note column, and a row short of cells', () => {
    const { rulings, problems } = readRulings([table(['Ruling', 'Paths', 'Decision'], [3, 'R-1', '`a`', 'allow'], [4, 'R-2', '`b`'])]);
    expect(rulings).toEqual([{ id: 'R-1', paths: ['a'], decision: 'allow', note: '', line: 3 }]);
    expect(problems).toEqual([{ line: 4, message: 'ruling R-2 decides ""; a decision is allow or deny' }]);
  });

  it('finds the paths or the decision column first in the row, and reads cells as written', () => {
    const { rulings } = readRulings([
      table(['Paths', 'Decision', 'Ruling'], [2, '`a`', ' allow ', ' R-1 ']),
      table([' Decision ', ' Ruling ', ' Paths '], [6, 'deny', 'R-2', '`b`']),
    ]);
    expect(rulings.map((r) => [r.id, r.paths, r.decision, r.line])).toEqual([
      ['R-1', ['a'], 'allow', 2],
      ['R-2', ['b'], 'deny', 6],
    ]);
  });

  it('reports a row too short to hold its id or its paths', () => {
    const { problems } = readRulings([
      table(['Decision', 'Paths', 'Ruling'], [4, 'allow', '`a`']),
      table(['Ruling', 'Decision', 'Paths'], [9, 'R-9', 'allow']),
    ]);
    expect(problems).toEqual([
      { line: 4, message: 'a ruling row has no id' },
      { line: 9, message: 'ruling R-9 names no path' },
    ]);
  });

  it('is not a rulings table without an id, paths and decision column', () => {
    expect(readRulings([table(['Ruling', 'Paths', 'Note'], [1, 'R-1', '`a`', 'x'])])).toEqual({ rulings: [], problems: [] });
    expect(readRulings([table(['Paths', 'Decision'], [1, '`a`', 'allow'])])).toEqual({ rulings: [], problems: [] });
    expect(readRulings([table(['Ruling', 'Decision'], [1, 'R-1', 'allow'])])).toEqual({ rulings: [], problems: [] });
    expect(readRulings([])).toEqual({ rulings: [], problems: [] });
  });

  it('reports a row it cannot read as a problem, never as a ruling', () => {
    const { rulings, problems } = readRulings([
      table(HEADERS, [20, '', '`a`', 'allow', ''], [21, 'R-1', '', 'allow', ''], [22, 'R-2', '`b`', 'maybe', ''], [23, 'R-3', '`c`', 'allowed', '']),
    ]);
    expect(rulings).toEqual([]);
    expect(problems).toEqual([
      { line: 20, message: 'a ruling row has no id' },
      { line: 21, message: 'ruling R-1 names no path' },
      { line: 22, message: 'ruling R-2 decides "maybe"; a decision is allow or deny' },
      { line: 23, message: 'ruling R-3 decides "allowed"; a decision is allow or deny' },
    ]);
  });

  it('keeps the first of two rows with one id, across tables, and reports the second', () => {
    const { rulings, problems } = readRulings([table(HEADERS, [1, 'R-1', '`a`', 'deny', '']), table(HEADERS, [8, 'r-1', '`b`', 'allow', ''])]);
    expect(rulings.map((r) => [r.id, r.decision])).toEqual([['R-1', 'deny']]);
    expect(problems).toEqual([{ line: 8, message: 'ruling R-1 appears twice' }]);
  });
});

describe('ids', () => {
  it('takes one more than the highest number taken for the brief', () => {
    expect(nextId('E', '012', [])).toBe('E-012-1');
    expect(nextId('E', '012', ['E-012-1', 'E-012-3', 'E-012-2'])).toBe('E-012-4');
    expect(nextId('R', '012', ['R-012-9', 'R-012-10'])).toBe('R-012-11');
  });

  it('ignores ids of other briefs, other prefixes, and ones that are not numbered', () => {
    expect(nextId('R', '012', ['R-013-5', 'E-012-7', 'R-0120-3', 'R-012-x', 'R-012-2.5', 'R-012-'])).toBe('R-012-1');
    expect(nextId('R', '1', ['R-12-4'])).toBe('R-1-1');
  });

  it('compares a brief id with letters without case, since rulings are read in capitals', () => {
    const taken = readRulings([table(HEADERS, [1, 'R-auth-1', '`a`', 'allow', ''])]).rulings.map((r) => r.id);
    expect(taken).toEqual(['R-AUTH-1']);
    expect(nextId('R', 'auth', taken)).toBe('R-auth-2');
  });
});

const REQUEST: EscalationRequest = {
  id: 'E-012-1',
  brief: '012',
  briefFile: 'briefs/012_rotate-tokens.md',
  paths: ['src/db/schema.ts', 'migrations/**'],
  reason: '  Rotation needs a rotated_at column.\n',
  options: [
    { label: 'Allow', consequence: 'one additive column' },
    { label: 'Refuse', consequence: 'rotation keeps no timestamp' },
  ],
  recommendation: ' Allow; the column is additive. ',
  created: '2026-09-26T00:00:00.000Z',
  branch: 'brief/012-rotate',
  head: '0123456789abcdef0123456789abcdef01234567',
};

describe('the memo a person rules on', () => {
  it('says what, why, the choices, the recommendation and how to rule', () => {
    expect(renderMemo(REQUEST)).toBe(
      [
        '# Escalation E-012-1',
        '',
        'Brief 012 (`briefs/012_rotate-tokens.md`) on `brief/012-rotate` at `0123456789ab`, raised 2026-09-26T00:00:00.000Z.',
        '',
        '## What the round needs to change',
        '',
        '- `src/db/schema.ts`',
        '- `migrations/**`',
        '',
        '## Why',
        '',
        'Rotation needs a rotated_at column.',
        '',
        '## Options',
        '',
        '1. **Allow** - one additive column',
        '2. **Refuse** - rotation keeps no timestamp',
        '',
        '## The agent recommends',
        '',
        'Allow; the column is additive.',
        '',
        '## To rule',
        '',
        'Allow: `spec-harness rule E-012-1 --allow --note "<what exactly is allowed>"`',
        'Refuse: `spec-harness rule E-012-1 --deny --note "<why>"`',
        '',
        "Either writes a row into the brief's rulings table. Commit it signed (`git commit -S`) with a key the base branch lists in its allowed signers; an unsigned row allows nothing.",
        '',
      ].join('\n'),
    );
  });

  it('gives a choice whose cost was not given as the choice alone, with no dash that leads nowhere', () => {
    const memo = renderMemo({ ...REQUEST, options: [{ label: 'Refuse', consequence: '' }, { label: 'Allow', consequence: 'one column' }] });
    expect(memo).toContain('## Options\n\n1. **Refuse**\n2. **Allow** - one column\n\n## The agent recommends');
  });

  it('leaves out what the request does not have', () => {
    const memo = renderMemo({ ...REQUEST, options: [], recommendation: null, branch: null, head: null });
    expect(memo).toContain('Brief 012 (`briefs/012_rotate-tokens.md`), raised 2026-09-26T00:00:00.000Z.');
    expect(memo).not.toContain('## Options');
    expect(memo).not.toContain('## The agent recommends');
    expect(memo).toContain('## To rule');
  });
});

describe('the row a ruling writes', () => {
  it('quotes each path and escapes what would break the table', () => {
    expect(renderRow('R-012-1', ['src/db/schema.ts', 'a|b.ts'], 'allow', 'Add rotated_at | only.\nNo other change. ')).toBe(
      '| R-012-1 | `src/db/schema.ts`, `a\\|b.ts` | allow | Add rotated_at \\| only. No other change. |',
    );
    expect(renderRow('R-1', ['a'], 'deny', 'x\r\ny')).toBe('| R-1 | `a` | deny | x y |');
  });

  it('writes a row the reader reads back as the same ruling', () => {
    const reader = createReader();
    const text = `# B\n\n## Rulings\n\n| Ruling | Paths | Decision | Note |\n| --- | --- | --- | --- |\n${renderRow('R-1-1', ['src/a|b.ts', 'c.ts'], 'allow', 'x | y')}\n`;
    const { rulings } = readRulings(reader.sectionTables(text, 'Rulings').tables);
    expect(rulings).toEqual([{ id: 'R-1-1', paths: ['src/a\\|b.ts', 'c.ts'], decision: 'allow', note: 'x \\| y', line: 7 }]);
  });
});

describe('adding a ruling to a brief', () => {
  const reader = createReader();
  const row = '| R-012-2 | `src/b.ts` | allow | ok |';
  const add = (text: string): string => addRulingRow(text, 'Rulings', row, reader.sectionTables(text, 'Rulings'));

  it('leaves a blank line between a new table and prose written right under the heading', () => {
    const text = ['# 012 - Rotate', '', '## Rulings', 'None yet, ask first.', ''].join('\n');
    const added = add(text);
    expect(added.split('\n')).toEqual([
      '# 012 - Rotate',
      '',
      '## Rulings',
      '',
      '| Ruling | Paths | Decision | Note |',
      '| --- | --- | --- | --- |',
      row,
      '',
      'None yet, ask first.',
      '',
    ]);
    // A table read back ends at its row: the prose is not a row of it.
    expect(reader.sectionTables(added, 'Rulings').tables[0]?.rows).toHaveLength(1);
  });

  it('adds no blank line when one already follows the heading', () => {
    const text = ['## Rulings', '', 'Prose.', ''].join('\n');
    expect(add(text).split('\n').slice(0, 6)).toEqual(['## Rulings', '', '| Ruling | Paths | Decision | Note |', '| --- | --- | --- | --- |', row, '']);
  });

  it('appends under the rulings table, leaving every other line as it was', () => {
    const text = [
      '# 012 - Rotate',
      '',
      '## Rulings',
      '',
      '| Ruling | Paths | Decision | Note |',
      '| --- | --- | --- | --- |',
      '| R-012-1 | `src/a.ts` | allow | first |',
      '',
      'Prose under the table.',
      '',
      '## Report',
      '',
    ].join('\n');
    expect(add(text)).toBe(text.replace('| first |\n', `| first |\n${row}\n`));
  });

  it('starts a table under a rulings section that has none', () => {
    const text = '# 012\n\n## Rulings\n\nNone yet.\n\n## Report\n';
    expect(add(text)).toBe(`# 012\n\n## Rulings\n\n| Ruling | Paths | Decision | Note |\n| --- | --- | --- | --- |\n${row}\n\nNone yet.\n\n## Report\n`);
  });

  it('starts the section at the end when the brief has none', () => {
    expect(add('# 012\n\n## Intent\n\nx\n')).toBe(`# 012\n\n## Intent\n\nx\n\n## Rulings\n\n| Ruling | Paths | Decision | Note |\n| --- | --- | --- | --- |\n${row}\n`);
    // A last line of spaces is blank: no second blank line after it.
    expect(add('# 012\n   ')).toBe(`# 012\n   \n## Rulings\n\n| Ruling | Paths | Decision | Note |\n| --- | --- | --- | --- |\n${row}`);
    // A brief that already ends in a blank line gets no second one.
    expect(add('# 012\n\nx\n\n')).toBe(`# 012\n\nx\n\n## Rulings\n\n| Ruling | Paths | Decision | Note |\n| --- | --- | --- | --- |\n${row}\n`);
    // An empty brief reads as one empty line, which the new section keeps as its final newline.
    expect(addRulingRow('', 'Decisions', row, { headingLine: null, tableEndLine: null })).toBe(
      `## Decisions\n\n| Ruling | Paths | Decision | Note |\n| --- | --- | --- | --- |\n${row}\n`,
    );
  });

  it('keeps CRLF line endings, and a brief without a final newline without one', () => {
    const crlf = '# 012\r\n\r\n## Rulings\r\n\r\n| Ruling | Paths | Decision | Note |\r\n| --- | --- | --- | --- |\r\n| R-012-1 | `a` | allow | x |\r\n';
    expect(add(crlf)).toBe(`${crlf}${row}\r\n`);
    const bare = '# 012\n\n## Rulings\n\n| Ruling | Paths | Decision | Note |\n| --- | --- | --- | --- |\n| R-012-1 | `a` | allow | x |';
    expect(add(bare)).toBe(`${bare}\n${row}`);
    expect(add('# 012')).toBe(`# 012\n\n## Rulings\n\n| Ruling | Paths | Decision | Note |\n| --- | --- | --- | --- |\n${row}`);
  });

  it('writes under the configured section, found as spec-brief finds sections', () => {
    const text = '# 012\n\n## 3. **Decisions:**\n\n| Ruling | Paths | Decision |\n| --- | --- | --- |\n';
    const where = reader.sectionTables(text, 'Decisions');
    expect(addRulingRow(text, 'Decisions', row, where)).toBe(`${text}${row}\n`);
  });
});

describe('the signers a ruling is verified against (ADR-0006)', () => {
  it('are the base tip\'s lines that the merge base has too, read without the space around them', () => {
    const a = 'a@example.com namespaces="git" ssh-ed25519 AAAA';
    const b = 'b@example.com namespaces="git" ssh-ed25519 BBBB';
    expect(signersAtBoth(`${a}\n${b}\n`, `${a}\n`)).toBe(`${a}\n`);
    expect(signersAtBoth(`${a}\r\n${b}\r\n`, `  ${a}\n`)).toBe(`${a}\r\n`);
    expect(signersAtBoth(`${b}\n`, `${a}\n`)).toBe('');
    expect(signersAtBoth(`${a}\n${b}`, `${b}\n${a}`)).toBe(`${a}\n${b}`);
  });
});
