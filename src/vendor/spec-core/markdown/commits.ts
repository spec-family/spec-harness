/**
 * Commit references: where a document names the commit that did a thing, as
 * a register row that is done says what changed it - `done: the refund rules
 * (commit "Refuse a refund over its capture")` - or a ticked checklist item
 * names its evidence.
 *
 * Read here because more than one tool holds a document to the commits it
 * names, and two readings of which words name a commit would be two answers
 * (ADR-0004). Whether the commit exists is the caller's to ask of git.
 *
 * Marked, never guessed: the word `commit`, then, on the same line, a subject
 * between quotes or a hash of 7 to 40 hexadecimal digits, bare or as a code
 * span. Prose that says "commit" any other way names nothing, and neither
 * does a word in code, a comment or front matter.
 */

import type { Range } from '../text/index.js';
import type { MarkdownScan } from './types.js';

export interface CommitReference {
  /** `subject` names a commit by its subject line, `hash` by a prefix of its id. */
  readonly kind: 'subject' | 'hash';
  /** The subject as written between the quotes, or the hash in lower case. */
  readonly value: string;
  /** From the word `commit` to the end of the hash or past the closing quote. */
  readonly start: number;
  readonly end: number;
}

/**
 * The word, in any case. The space after it is read in the text, since in the
 * mask a code span after it is blanked to spaces too.
 */
const KEYWORD = /\bcommit\b/gi;

const HASH = /^[0-9a-f]{7,40}$/i;

/** A character of a word: `commit abcdef12x` names no commit. */
const WORD = /[0-9A-Za-z_]/;

/** The quote that closes each opening one. */
const CLOSING = new Map([
  ['"', '"'],
  ['“', '”'],
]);

/**
 * The commit references of a scanned document, in the order they are written.
 *
 * The word is looked for in the structure mask, where code, comments and front
 * matter are blanked, and what follows it in the text, so a subject keeps what
 * it holds. A reference read is stepped past, so a subject naming a commit is
 * one reference and the word inside it none. Each closing quote is looked for
 * forward from the last place it was found, so no stretch of the text is
 * searched for it twice however many quotes open and never close.
 */
export function findCommitReferences(scan: MarkdownScan): CommitReference[] {
  const { text } = scan;
  const spans = new Map(scan.codeSpans.map((span) => [span.start, span]));
  const next = new Map<string, number>();
  const closingAt = (quote: string, from: number): number => {
    const known = next.get(quote);
    // Searched again, a quote found at or past `from` is found where it was,
    // so `>` for the `>=` answers alike and costs one search. `undefined` is
    // neither -1 nor at or past anything, so the first test is for the type,
    // and the mutant that drops it is equivalent.
    if (known !== undefined && (known === -1 || known >= from)) return known;
    const found = text.indexOf(quote, from);
    next.set(quote, found);
    return found;
  };

  const out: CommitReference[] = [];
  let read = 0;
  for (const match of scan.masks.structure.matchAll(KEYWORD)) {
    const start = match.index;
    if (start < read) continue;
    const word = start + match[0].length;
    let at = word;
    while (text.charAt(at) === ' ' || text.charAt(at) === '\t') at += 1;
    if (at === word) continue;
    const lineEnd = scan.index.lineEnd(scan.index.positionAt(start).line);
    const reference = subjectAt(text, at, lineEnd, closingAt) ?? hashAt(text, at, spans);
    if (reference === null) continue;
    out.push({ ...reference, start });
    read = reference.end;
  }
  return out;
}

type Read = Omit<CommitReference, 'start'>;

/** A subject between quotes that open at `at` and close before the line ends. */
function subjectAt(text: string, at: number, lineEnd: number, closingAt: (quote: string, from: number) => number): Read | null {
  const quote = CLOSING.get(text.charAt(at));
  if (quote === undefined) return null;
  const close = closingAt(quote, at + 1);
  // A line ends at its terminator or at the end of the text, where no quote
  // stands, so `>=` for the `>` answers alike.
  if (close === -1 || close > lineEnd) return null;
  const value = text.slice(at + 1, close).trim();
  return value.length === 0 ? null : { kind: 'subject', value, end: close + 1 };
}

/** A hash at `at`, bare or as the whole of a code span. */
function hashAt(text: string, at: number, spans: ReadonlyMap<number, Range>): Read | null {
  const span = spans.get(at);
  if (span !== undefined) {
    const inside = text.slice(at, span.end).replace(/^`+|`+$/g, '').trim();
    return HASH.test(inside) ? { kind: 'hash', value: inside.toLowerCase(), end: span.end } : null;
  }
  // The whole word is read, so one that runs on past its digits is no hash. No
  // word holds the keyword, so no stretch is read for two of them.
  let end = at;
  while (WORD.test(text.charAt(end))) end += 1;
  const run = text.slice(at, end);
  return HASH.test(run) ? { kind: 'hash', value: run.toLowerCase(), end } : null;
}
