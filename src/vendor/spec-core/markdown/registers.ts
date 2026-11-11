/**
 * Registers kept as tables: a row per decision, named by its key, with the
 * status it stands at.
 *
 * Read here because two tools ask it of one document: spec-graph, which holds
 * a register's rows to a status vocabulary, and spec-brief, which holds a
 * round to the rows it waits on. The reading was spec-graph's (its ADR-0009)
 * and moved here as it stood (ADR-0004).
 */

import type { MarkdownScan, Table, TableCell, TableRow } from './types.js';

/** A register's row: its key and its status, both read flat. */
export interface RegisterRow {
  /** The key cell's text, flat: `refund-limit` of `` `refund-limit` ``. */
  readonly key: string;
  /** The status cell's text, flat, or `null` where it says nothing. */
  readonly status: string | null;
  readonly row: TableRow;
  readonly keyCell: TableCell;
  readonly statusCell: TableCell | null;
  readonly table: Table;
}

/** Column headers that name the row's key. */
const KEY_COLUMNS = /^(?:id|ids|ref|reference|key|no|number|#|adr|rfc|kep|oi|decision|spec|specification)$/;

/** Column headers that name the row's status. */
const STATUS_COLUMNS = /^(?:status|state|stage|lifecycle|phase)$/;

/**
 * Cell values that mean "nothing here", read flat, where a run of underscores
 * is already gone with the emphasis it might have been.
 */
const EMPTY_CELL = /^(?:-+|—|–|n\/?a|none|nil|tbd|\.)$/i;

/** A key names something only where it holds a letter or a digit. */
const NAMES = /[\p{L}\p{N}]/u;

/** A Markdown link or image, its label and its destination. */
const LINK = /!?\[([^\]]*)\]\(([^)]*)\)/g;

/** A wiki link, its label after a `|` where it has one. */
const WIKI = /\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g;

/** A cell's text: link labels rather than link syntax, no emphasis or code marks, one line. */
export function flatCell(text: string): string {
  return text
    .replace(LINK, '$1')
    .replace(WIKI, '$1')
    .replace(/[`*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A header as a column is named: flat, in lower case, letters, digits and
 * `/#-` alone. Every name asked of it is one word, so the space left where a
 * mark was taken out needs folding only at its ends.
 */
function headerName(text: string): string {
  return flatCell(text)
    .toLowerCase()
    .replace(/[^a-z0-9/#\s-]/g, '')
    .trim();
}

/**
 * The rows of each table with a key column and a status column, the first of
 * each its header names, in the order they are written. A row whose key cell
 * names nothing - empty, a placeholder, or punctuation alone - is no row of
 * the register.
 */
export function findRegisterRows(scan: MarkdownScan): RegisterRow[] {
  const out: RegisterRow[] = [];
  for (const table of scan.tables) {
    let key = -1;
    let status = -1;
    table.headers.forEach((header, column) => {
      const name = headerName(header.text);
      if (key === -1 && KEY_COLUMNS.test(name)) key = column;
      else if (status === -1 && STATUS_COLUMNS.test(name)) status = column;
    });
    if (status === -1) continue;
    for (const row of table.rows) {
      // No key column is -1, and no row has a cell there; a row written short
      // has none under it either.
      const keyCell = row.cells[key];
      if (keyCell === undefined) continue;
      const name = flatCell(keyCell.text);
      if (!NAMES.test(name) || EMPTY_CELL.test(name)) continue;
      const statusCell = row.cells[status] ?? null;
      const said = statusCell === null ? '' : flatCell(statusCell.text);
      out.push({ key: name, status: said.length === 0 || EMPTY_CELL.test(said) ? null : said, row, keyCell, statusCell, table });
    }
  }
  return out;
}
