/**
 * git's pre-commit hook as releases of init wrote it, from their tags, for the
 * tests that hold init to writing its own hook again: a literal, not built
 * from the source's, so that a change to the hook init writes now leaves what
 * the releases wrote where it was.
 */

/**
 * The hook 0.19.0 to 0.22.0 wrote, with the script at `bin`: 0.22.0's runs
 * this scope's script, and 0.19.0 to 0.21.0's the earlier scope's.
 */
export function releasedHook(bin: string): string {
  return [
    '#!/bin/sh',
    '# spec-harness: refuse a commit that changes what the active brief protects.',
    "# git runs this at the top of the work tree it commits in, a linked worktree's",
    "# own, wherever the hook is kept: the project's install is read from there,",
    "# or, where a linked worktree has none, from the repository's main work tree.",
    `bin=${bin}`,
    'if [ ! -f "$bin" ]; then',
    '  common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)',
    '  if [ "${common##*/}" = .git ] && [ -f "${common%/.git}/$bin" ]; then',
    '    bin=${common%/.git}/$bin',
    '  else',
    `    printf '%s\\n' "spec-harness: $bin is not in $PWD, the work tree git commits in, nor in its repository's main work tree: install the project's dependencies there, as with npm ci, and commit again" >&2`,
    '    exit 2',
    '  fi',
    'fi',
    'exec node "$bin" hook git',
    '',
  ].join('\n');
}
