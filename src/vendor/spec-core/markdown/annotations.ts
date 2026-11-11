/**
 * What a comment annotates: the list item an annotation written in an HTML
 * comment is about, and the name `<!-- @spec-item id="..." -->` gives an item.
 *
 * Read here because two tools ask it of one document: spec-graph, which reads
 * an item's state and name from the directive over it, and spec-brief, which
 * names the claims a round raises by those names. Two readings of which item
 * a comment is about would be two answers. The rule was spec-graph's, and
 * moved here as it stood (ADR-0004).
 */

import type { ListItem, MarkdownScan, ScannedLine } from './types.js';

/** Where an annotation is written: its comment's offset and 1-based line. */
export interface Annotation {
  readonly start: number;
  readonly line: number;
}

/** Code, raw-text HTML and front matter hold no statement a document makes. */
function isMarkdownLine(line: ScannedLine): boolean {
  return !line.code && !line.html && !line.frontMatter;
}

/**
 * The list item each annotation is about, in the order given, or `null` for
 * one about none. The annotations come in the order they are written.
 *
 * An annotation is about the item directly below it, with nothing but blank
 * lines or other comments between, or else the one it is written on or
 * indented under. An annotation written flush under an item, above no other,
 * continues that item as any unindented line does.
 */
export function bindToItems(scan: MarkdownScan, annotations: readonly Annotation[]): (ListItem | null)[] {
  const out: (ListItem | null)[] = [];
  // Most documents carry none. Sparing them the pass over their lines changes
  // how long this takes and nothing else.
  if (annotations.length === 0) return out;

  const { lines, listItems } = scan;
  const masked = scan.masks.structure;
  // The indentation of each line holding nothing but whitespace and comments.
  // Code and raw-text HTML are masked too, so they are told apart by their flags.
  const quiet = new Map<number, number>();
  // For every other line, where the run of quiet lines directly above it began,
  // when there was one.
  const quietFrom = new Map<number, number | undefined>();
  let run: number | undefined;
  for (const line of lines) {
    if (isMarkdownLine(line) && masked.slice(line.contentStart, line.end).trim() === '') {
      quiet.set(line.line, line.indent);
      run ??= line.start;
      continue;
    }
    quietFrom.set(line.line, run);
    run = undefined;
  }

  // The items whose text the cursor is in, outermost first. Items nest, so one
  // that has ended is always on top. An item ends at the end of a line, the next
  // thing starts on a later one, and no two things start together, so `<` and
  // `<=` read alike in every comparison of offsets below.
  const open: ListItem[] = [];
  const close = (offset: number): void => {
    while (open.length > 0 && open[open.length - 1]!.end <= offset) open.pop();
  };
  let next = 0;
  for (const annotation of annotations) {
    while (next < listItems.length && listItems[next]!.start < annotation.start) {
      const item = listItems[next]!;
      close(item.start);
      open.push(item);
      next += 1;
    }
    close(annotation.start);

    // Sharing its line with text, an annotation is in whatever that text is in.
    const indent = quiet.get(annotation.line) ?? Infinity;
    // No deeper than the scanner already went to find where these items end.
    let depth = open.length - 1;
    while (depth >= 0 && open[depth]!.indent >= indent) depth -= 1;
    const holder = open[depth];

    const below = listItems[next];
    const directlyAbove = below !== undefined && (quietFrom.get(below.line) ?? Infinity) <= annotation.start;
    if (directlyAbove && (holder === undefined || below.start < holder.end)) {
      out.push(below);
      continue;
    }
    out.push(holder ?? open[open.length - 1] ?? null);
  }
  return out;
}

/** A directive opens its comment: `@` and its name. */
const HEAD = /^\s*@([a-z][a-z0-9-]*)/;

/** An attribute: a name, and a value quoted with either mark or bare, or none, which is a flag. */
const ATTRIBUTE = /([A-Za-z_][A-Za-z0-9_-]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|([^\s"'<>]+)))?/g;

/**
 * The name each list item is given by a `@spec-item` directive with an `id`,
 * as spec-graph reads one: a closed comment that opens with the directive,
 * its attributes as written, the last `id` the one it has, a flag read as
 * `true`. Where two directives are about one item, the last is its directive,
 * and an item whose directive has no `id` has no name.
 */
export function findItemIds(scan: MarkdownScan): Map<ListItem, string> {
  const directives: { annotation: Annotation; id: string | null }[] = [];
  for (const comment of scan.comments) {
    if (!comment.closed) continue;
    const head = HEAD.exec(comment.inner);
    if (head === null || head[1] !== 'spec-item') continue;
    let id: string | null = null;
    // The head reads as an attribute named `spec-item` too, which no name
    // asks for, so the whole comment is read.
    for (const match of comment.inner.matchAll(ATTRIBUTE)) {
      if (match[1]!.toLowerCase() === 'id') id = match[3] ?? match[4] ?? match[5] ?? 'true';
    }
    directives.push({ annotation: { start: comment.start, line: comment.line }, id });
  }
  const bound = bindToItems(scan, directives.map((directive) => directive.annotation));
  const named = new Map<ListItem, string | null>();
  bound.forEach((item, at) => {
    if (item !== null) named.set(item, directives[at]!.id);
  });
  const out = new Map<ListItem, string>();
  for (const [item, id] of named) if (id !== null) out.set(item, id);
  return out;
}
