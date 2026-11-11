/**
 * Claims: list items that open with a label from a vocabulary the caller
 * names, the way a specification marks each thing it says with how far it
 * holds - `` - `Implemented`: a refund over the captured amount is refused ``.
 *
 * Read here because two tools ask the same question of one document: the one
 * that holds a claim to its evidence, and the one that holds a checklist or a
 * ledger to the claims it cites. Two readings of which item says what, and at
 * which maturity, would be two answers (ADR-0004).
 *
 * The label is a code span, the first thing in the item's text, after a task
 * checkbox where there is one. Anything else that opens an item - prose, a
 * bold word, a span with a word the vocabulary lacks - makes no claim, since a
 * code span at the head of an item is as often code.
 */

import type { Range } from '../text/index.js';
import type { ListItem, MarkdownScan } from './types.js';

export interface Claim {
  /** The label the item opens with, one of the vocabulary. */
  readonly label: string;
  /**
   * Every label of the vocabulary written as a code span in the item's own
   * text - itself, without the items nested under it - each once, the opening
   * one first. More than one is a claim that says two things.
   */
  readonly labels: readonly string[];
  readonly item: ListItem;
}

/**
 * The text of a code span, its backtick runs and the space around them left
 * off. A span opens and closes with runs of one length, so the opening one
 * says how much to take from each end.
 */
function spanText(text: string, span: Range): string {
  let run = 0;
  while (text.charAt(span.start + run) === '`') run += 1;
  return text.slice(span.start + run, span.end - run).trim();
}

/**
 * The claims of a scanned document, in the order their items open.
 *
 * One pass over the items and the code spans together, both in document
 * order: the items open around a span are kept on a stack, innermost last, so
 * each span is given to the item it is the own text of, and nothing is read
 * twice however deep the items nest.
 */
export function findClaims(scan: MarkdownScan, vocabulary: readonly string[]): Claim[] {
  const known = new Set(vocabulary);
  const items = scan.listItems;
  const own = new Map<ListItem, string[]>();
  const opening = new Set<ListItem>();
  // An item that closed before the next one opened may lie under it here: it
  // comes to the top only once that one closes, and goes then, before a span
  // after both is read. Each item is pushed once and popped once. A stack that
  // started with anything in it would answer as this one does: whatever lay at
  // its bottom has no end and no text, so no span is its own text that a
  // claim reads, and the mutant that puts one there is equivalent.
  const stack: ListItem[] = [];
  let next = 0;
  for (const span of scan.codeSpans) {
    // An item opens where its marker line's content does, at an indent or at
    // the marker, where no span opens, and ends before a line's terminator,
    // where none opens either: `<` for either `<=` below answers alike, and
    // those mutants are equivalent.
    while (next < items.length && items[next]!.start <= span.start) {
      stack.push(items[next]!);
      next += 1;
    }
    while (stack.length > 0 && stack[stack.length - 1]!.end <= span.start) stack.pop();
    const item = stack[stack.length - 1];
    // No span opens between an item's start and its text: there are only its
    // indent, its marker and a checkbox.
    if (item === undefined) continue;
    const label = spanText(scan.text, span);
    if (!known.has(label)) continue;
    if (span.start === item.textStart) opening.add(item);
    const labels = own.get(item) ?? [];
    if (!labels.includes(label)) labels.push(label);
    own.set(item, labels);
  }
  // An item's opening span is its first, so its label leads its list.
  return items.filter((item) => opening.has(item)).map((item) => {
    const labels = own.get(item)!;
    return { label: labels[0]!, labels, item };
  });
}
