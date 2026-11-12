/**
 * Escalations an agent raises and the rulings a person signs.
 *
 * A brief says what a round may not touch. When the round cannot be done
 * without touching it, the agent stops and asks; a person decides; and the
 * decision becomes a row in the brief's rulings table:
 *
 * ```markdown
 * ## Rulings
 *
 * | Ruling | Paths | Decision | Note |
 * | --- | --- | --- | --- |
 * | R-012-1 | `src/db/schema.ts` | allow | Add rotated_at; no other schema change. |
 * ```
 *
 * A row is text, and an agent can write text. What makes a row a ruling is
 * the commit that last changed it: signed, with a key listed in the allowed
 * signers file as the base branch has it (ADR-0006). The row states the
 * decision; the signature says a person made it; the base branch says whose
 * signatures count. A hash of the row, which the agent could compute as well
 * as anyone, would say none of that.
 *
 * The request itself lives outside the work tree while it waits
 * (`<git-common-dir>/spec-harness/escalations/`): it is in-flight state, and
 * only its outcome belongs in the record (spec-core ADR-0005).
 */

export interface EscalationOption {
  readonly label: string;
  readonly consequence: string;
}

export interface EscalationRequest {
  readonly id: string;
  readonly brief: string;
  readonly briefFile: string;
  readonly paths: readonly string[];
  readonly reason: string;
  readonly options: readonly EscalationOption[];
  readonly recommendation: string | null;
  readonly created: string;
  readonly branch: string | null;
  readonly head: string | null;
}

export interface RulingRow {
  readonly id: string;
  readonly paths: readonly string[];
  readonly decision: 'allow' | 'deny';
  readonly note: string;
  /** 1-based line of the row in the brief. */
  readonly line: number;
}

/** A table as the Markdown scanner reads it: header cells, and rows with their lines. */
export interface TableView {
  readonly headers: readonly string[];
  readonly rows: readonly { readonly cells: readonly string[]; readonly line: number }[];
}

export type RulingProblem = { readonly line: number; readonly message: string };

function normal(text: string): string {
  return text.replace(/[*_`]/g, '').trim().toLowerCase();
}

/** The globs a paths cell names: backtick-quoted, or comma-separated. */
export function pathsOf(cell: string): string[] {
  const quoted = [...cell.matchAll(/`([^`]+)`/g)].map((match) => (match[1] as string).trim());
  if (quoted.length > 0) return quoted.filter((path) => path !== '');
  return cell
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

/**
 * The rulings in a brief's rulings section, from its tables. A table whose
 * header does not name the columns is not a rulings table; a row that cannot
 * be read is a problem to report, never a ruling.
 */
export function readRulings(tables: readonly TableView[]): { rulings: RulingRow[]; problems: RulingProblem[] } {
  const rulings: RulingRow[] = [];
  const problems: RulingProblem[] = [];
  for (const table of tables) {
    const headers = table.headers.map(normal);
    const at = (...names: string[]): number => headers.findIndex((header) => names.includes(header));
    const idColumn = at('ruling', 'id');
    const pathsColumn = at('paths', 'path', 'files');
    const decisionColumn = at('decision');
    const noteColumn = at('note', 'notes', 'reason');
    if (idColumn < 0 || pathsColumn < 0 || decisionColumn < 0) continue;
    for (const row of table.rows) {
      const id = normal(row.cells[idColumn] ?? '').toUpperCase();
      const paths = pathsOf(row.cells[pathsColumn] ?? '');
      const decision = normal(row.cells[decisionColumn] ?? '');
      if (id === '') {
        problems.push({ line: row.line, message: 'a ruling row has no id' });
        continue;
      }
      if (paths.length === 0) {
        problems.push({ line: row.line, message: `ruling ${id} names no path` });
        continue;
      }
      if (decision !== 'allow' && decision !== 'deny') {
        problems.push({ line: row.line, message: `ruling ${id} decides "${decision}"; a decision is allow or deny` });
        continue;
      }
      if (rulings.some((ruling) => ruling.id === id)) {
        problems.push({ line: row.line, message: `ruling ${id} appears twice` });
        continue;
      }
      rulings.push({ id, paths, decision, note: (row.cells[noteColumn] ?? '').trim(), line: row.line });
    }
  }
  return { rulings, problems };
}

/**
 * The next free escalation id for a brief, given the ids already taken. The
 * stem compares without case: `readRulings` reads ids in capitals, so a brief
 * named `auth` has `R-AUTH-1` taken when this writes `R-auth-2`.
 */
export function nextId(prefix: 'E' | 'R', brief: string, taken: readonly string[]): string {
  let highest = 0;
  const stem = `${prefix}-${brief}-`;
  for (const id of taken) {
    if (!id.toUpperCase().startsWith(stem.toUpperCase())) continue;
    const n = Number(id.slice(stem.length));
    // A number equal to the highest is the highest already, so `>=` for `>`
    // is equivalent.
    if (Number.isInteger(n) && n > highest) highest = n;
  }
  return `${stem}${highest + 1}`;
}

/** The memo a person reads to rule: what, why, the choices, and what each costs. */
export function renderMemo(request: EscalationRequest): string {
  const lines = [
    `# Escalation ${request.id}`,
    '',
    `Brief ${request.brief} (\`${request.briefFile}\`)${request.branch === null ? '' : ` on \`${request.branch}\``}${request.head === null ? '' : ` at \`${request.head.slice(0, 12)}\``}, raised ${request.created}.`,
    '',
    '## What the round needs to change',
    '',
    ...request.paths.map((path) => `- \`${path}\``),
    '',
    '## Why',
    '',
    request.reason.trim(),
    '',
  ];
  if (request.options.length > 0) {
    lines.push('## Options', '');
    // A choice whose cost was not given is written as the choice alone,
    // with no dash that leads nowhere.
    request.options.forEach((option, index) => lines.push(`${index + 1}. **${option.label}**${option.consequence === '' ? '' : ` - ${option.consequence}`}`));
    lines.push('');
  }
  if (request.recommendation !== null) lines.push('## The agent recommends', '', request.recommendation.trim(), '');
  lines.push(
    '## To rule',
    '',
    `Allow: \`spec-harness rule ${request.id} --allow --note "<what exactly is allowed>"\``,
    `Refuse: \`spec-harness rule ${request.id} --deny --note "<why>"\``,
    '',
    'Either writes a row into the brief\'s rulings table. Commit it signed (`git commit -S`) with a key the base branch lists in its allowed signers; an unsigned row allows nothing.',
    '',
  );
  return lines.join('\n');
}

function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

/** The table row a ruling writes. */
export function renderRow(id: string, paths: readonly string[], decision: 'allow' | 'deny', note: string): string {
  return `| ${id} | ${paths.map((path) => `\`${cell(path)}\``).join(', ')} | ${decision} | ${cell(note)} |`;
}

/**
 * The brief with a ruling row added: under the rulings section's table when
 * there is one, or in a new section at the end. Every other line is left as
 * it was; line endings are the brief's own.
 */
export function addRulingRow(
  text: string,
  section: string,
  row: string,
  where: { readonly headingLine: number | null; readonly tableEndLine: number | null },
): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  // A text splits into one line at least, so the first check here is the
  // compiler's, and its mutants are equivalent.
  const trailing = lines.length > 0 && lines[lines.length - 1] === '' ? lines.pop() : undefined;
  const header = ['| Ruling | Paths | Decision | Note |', '| --- | --- | --- | --- |'];
  if (where.tableEndLine !== null) {
    lines.splice(where.tableEndLine, 0, row);
  } else if (where.headingLine !== null) {
    // A line of prose right under the table would read as one more row.
    const next = lines[where.headingLine];
    const gap = next !== undefined && next.trim() !== '' ? [''] : [];
    lines.splice(where.headingLine, 0, '', ...header, row, ...gap);
  } else {
    // The last line is read only where there is one, so the `?.` is the
    // compiler's, and the mutant without it is equivalent.
    if (lines.length > 0 && lines[lines.length - 1]?.trim() !== '') lines.push('');
    lines.push(`## ${section}`, '', ...header, row);
  }
  if (trailing !== undefined) lines.push(trailing);
  return lines.join(eol);
}

/**
 * The allowed-signers text that lists the signers two texts both list: the
 * base tip's lines, each kept where the merge base had it too, read without
 * the space around it, as a CRLF checkout or an editor leaves it. A signer
 * added to the base while the round ran is not yet one (ADR-0006).
 */
export function signersAtBoth(tip: string, start: string): string {
  const before = new Set(start.split('\n').map((line) => line.trim()));
  return tip
    .split('\n')
    .filter((line) => before.has(line.trim()))
    .join('\n');
}
