import { describe, expect, it } from 'vitest';

import type { OutOfScope } from '../../src/config.js';
import { decide, decideWritten, DOTS_MEND, heldBy, heldForDots, rooted, type GuardInput, type VerifiedRuling } from '../../src/guard.js';
import type { BriefRow } from '../../src/types.js';
import { row } from './helpers.js';

const brief = row({
  affectedFiles: ['src/auth/**', 'tests/auth/**'],
  protectedFiles: ['src/db/schema.ts', 'migrations/**'],
});

function check(path: string | null, options: { brief?: BriefRow | null; rulings?: VerifiedRuling[]; outOfScope?: OutOfScope; noBrief?: string } = {}) {
  const input: GuardInput = {
    path,
    given: path ?? '/elsewhere/x.ts',
    brief: options.brief === undefined ? brief : options.brief,
    rulings: options.rulings ?? [],
    outOfScope: options.outOfScope ?? 'warn',
    ...(options.noBrief === undefined ? {} : { noBrief: options.noBrief }),
  };
  return decide(input);
}

const ESCALATE =
  'if the round cannot be done without it, stop and ask for a ruling: spec-harness escalate --path <file> --reason <why>, or the request_escalation tool';

describe('the guard', () => {
  it('allows a path in scope, naming the patterns that put it there', () => {
    const decision = check('src/auth/login.ts');
    expect(decision).toEqual({
      path: 'src/auth/login.ts',
      verdict: 'allow',
      reason: 'in-scope',
      because: ['src/auth/**'],
      message: "src/auth/login.ts is in brief 012's scope (src/auth/**)",
      hint: 'nothing to do',
    });
  });

  it('refuses a protected path with the next step, even inside the scope', () => {
    const decision = check('src/db/schema.ts', { brief: row({ affectedFiles: ['src/**'], protectedFiles: ['src/db/schema.ts'] }) });
    expect(decision.verdict).toBe('deny');
    expect(decision.reason).toBe('protected');
    expect(decision.because).toEqual(['src/db/schema.ts']);
    expect(decision.message).toBe('brief 012 does not empower this round to change src/db/schema.ts (protectedFiles: src/db/schema.ts)');
    expect(decision.hint).toBe(ESCALATE);
  });

  it('names every protection a path meets, and every scope pattern', () => {
    const decision = check('migrations/001.sql', { brief: row({ protectedFiles: ['migrations/**', '**/*.sql', 'docs/**'] }) });
    expect(decision.because).toEqual(['migrations/**', '**/*.sql']);
    expect(decision.message).toBe('brief 012 does not empower this round to change migrations/001.sql (protectedFiles: migrations/**, **/*.sql)');
    const scoped = check('src/auth/a.ts', { brief: row({ affectedFiles: ['src/**', 'src/auth/*.ts'], protectedFiles: [] }) });
    expect(scoped.message).toBe("src/auth/a.ts is in brief 012's scope (src/**, src/auth/*.ts)");
    const unreadable = check('a.ts', { brief: row({ protectedFiles: ['[a', '{b'] }) });
    expect(unreadable.message).toMatch(/^brief 012 protects files with a pattern that cannot be read: \[a \(.+\); \{b \(.+\)$/);
  });

  it('lets a verified ruling pass the protected paths it names, and no other', () => {
    const rulings: VerifiedRuling[] = [
      { id: 'R-012-1', paths: ['docs/**'], signer: 'a@example.com' },
      { id: 'R-012-2', paths: ['src/db/schema.ts'], signer: 'p@example.com' },
    ];
    const ruled = check('src/db/schema.ts', { rulings });
    expect(ruled).toMatchObject({ verdict: 'allow', reason: 'ruled', because: ['R-012-2'], hint: 'keep the change to what the ruling allows' });
    expect(ruled.message).toBe('src/db/schema.ts is protected by brief 012, and ruling R-012-2, signed by p@example.com, allows it');
    expect(check('migrations/002.sql', { rulings })).toMatchObject({ verdict: 'deny', reason: 'protected' });
  });

  it('reads a ruling that names a glob, and ignores one whose pattern cannot be read', () => {
    expect(check('migrations/9.sql', { rulings: [{ id: 'R-1', paths: ['migrations/*.sql'], signer: 's' }] }).reason).toBe('ruled');
    expect(check('migrations/9.sql', { rulings: [{ id: 'R-1', paths: ['migrations/[9'], signer: 's' }] }).reason).toBe('protected');
  });

  it('fails closed on a protection it cannot read, whatever the path and the rulings', () => {
    const unreadable = row({ protectedFiles: ['src/[db', 'migrations/**'] });
    for (const path of ['src/auth/login.ts', 'README.md', 'migrations/1.sql']) {
      const decision = check(path, { brief: unreadable, rulings: [{ id: 'R-1', paths: ['**'], signer: 's' }] });
      expect(decision.verdict).toBe('deny');
      expect(decision.reason).toBe('unreadable-protection');
      expect(decision.because).toEqual(['src/[db (a "[" is never closed)']);
      expect(decision.message).toBe('brief 012 protects files with a pattern that cannot be read: src/[db (a "[" is never closed)');
      expect(decision.hint).toBe('fix protectedFiles in briefs/012_rotate-tokens.md (spec-brief lint names the problem)');
    }
  });

  it('answers a path outside the scope as the repository configured: warn, ask or deny', () => {
    const warned = check('README.md');
    expect(warned).toMatchObject({ verdict: 'warn', reason: 'out-of-scope', because: [] });
    expect(warned.message).toBe("README.md is outside brief 012's scope, which covers src/auth/**, tests/auth/**");
    expect(warned.hint).toBe(
      'if the round needs it, say so in briefs/012_rotate-tokens.md and add it to affectedFiles; the archive reports every file outside the scope',
    );
    expect(check('README.md', { outOfScope: 'ask' })).toMatchObject({ verdict: 'ask', reason: 'out-of-scope', hint: warned.hint });
    const denied = check('README.md', { outOfScope: 'deny' });
    expect(denied).toMatchObject({ verdict: 'deny', reason: 'out-of-scope' });
    expect(denied.hint).toBe(
      `add it to affectedFiles in briefs/012_rotate-tokens.md if the round needs it, which is a change the person who approved the brief must see; or ${ESCALATE}`,
    );
  });

  it('says a brief with no scope declares none, and names a scope pattern it could not read', () => {
    const unscoped = check('src/a.ts', { brief: row({ affectedFiles: [], protectedFiles: [] }) });
    expect(unscoped.message).toBe("src/a.ts is outside brief 012's scope, which declares no affectedFiles");
    const unreadable = check('src/a.ts', { brief: row({ affectedFiles: ['src/{a'], protectedFiles: [] }) });
    expect(unreadable).toMatchObject({ verdict: 'warn', reason: 'out-of-scope' });
    expect(unreadable.because).toHaveLength(1);
    expect(unreadable.because[0]).toMatch(/^src\/\{a \(/);
  });

  it('reads a pattern with no glob syntax as a file or the directory it names', () => {
    // protectedFiles: [src/db] protects everything in src/db, as spec-brief reads it.
    const directory = row({ affectedFiles: ['docs'], protectedFiles: ['src/db'] });
    expect(check('src/db/schema.ts', { brief: directory })).toMatchObject({ verdict: 'deny', reason: 'protected' });
    expect(check('src/db', { brief: directory })).toMatchObject({ verdict: 'deny', reason: 'protected' });
    expect(check('docs/a/b.md', { brief: directory })).toMatchObject({ verdict: 'allow', reason: 'in-scope' });
    expect(check('src/dbx.ts', { brief: directory }).reason).toBe('out-of-scope');
  });

  it('reads a trailing slash inside braces as the directory\'s contents, as it reads one written alone', () => {
    // {src/,docs/*.md} is src/ or docs/*.md: what src holds, and not a file named src.
    const scoped = row({ affectedFiles: ['{src/,docs/*.md}'], protectedFiles: [] });
    expect(check('src/deep/a.ts', { brief: scoped })).toMatchObject({ verdict: 'allow', reason: 'in-scope', because: ['{src/,docs/*.md}'] });
    expect(check('docs/a.md', { brief: scoped }).reason).toBe('in-scope');
    expect(check('src', { brief: scoped }).reason).toBe('out-of-scope');
    expect(check('lib/src', { brief: scoped }).reason).toBe('out-of-scope');
    const guarded = row({ affectedFiles: ['**'], protectedFiles: ['{src/db/,migrations/*.sql}'] });
    expect(check('src/db/deep/schema.ts', { brief: guarded })).toMatchObject({ verdict: 'deny', reason: 'protected', because: ['{src/db/,migrations/*.sql}'] });
    expect(check('migrations/1.sql', { brief: guarded }).reason).toBe('protected');
    expect(check('src/db', { brief: guarded })).toMatchObject({ verdict: 'allow', reason: 'in-scope' });
  });

  it('reads a pattern too large to compile as one it cannot read: refused as a protection, named in the scope, passed over in a ruling', () => {
    // As many alternatives as braces may give, each a long name, compile to more states than spec-core allows.
    const huge = `${'{a,b}'.repeat(8)}/${'x'.repeat(300)}`;
    const unreadable = `${huge} (the pattern compiles to more than 65536 states)`;
    const protection = check('src/auth/login.ts', { brief: row({ protectedFiles: ['migrations/**', huge] }) });
    expect(protection).toMatchObject({ verdict: 'deny', reason: 'unreadable-protection', because: [unreadable] });
    expect(protection.message).toBe(`brief 012 protects files with a pattern that cannot be read: ${unreadable}`);
    const scope = row({ affectedFiles: ['src/**', huge], protectedFiles: [] });
    expect(check('src/a.ts', { brief: scope })).toMatchObject({ verdict: 'allow', reason: 'in-scope', because: ['src/**'] });
    expect(check('README.md', { brief: scope })).toMatchObject({ verdict: 'warn', reason: 'out-of-scope', because: [unreadable] });
    expect(check('src/db/schema.ts', { rulings: [{ id: 'R-1', paths: [huge], signer: 's' }] }).reason).toBe('protected');
  });

  it('reads braces that expand to no path as a pattern it cannot read: refused as a protection, named in the scope, passed over in a ruling', () => {
    // {./,src} is ./ or src, and ./ alone names no path. Read as the contents
    // of the root, it put every path under a protection and in a scope.
    const unreadable = '{./,src} (the braces expand to "./", which names no path)';
    const guarded = row({ affectedFiles: ['**'], protectedFiles: ['{./,src}'] });
    for (const path of ['src/a.ts', 'README.md']) {
      // A ruling over every path waived that protection; it cannot waive one the guard cannot read.
      const protection = check(path, { brief: guarded, rulings: [{ id: 'R-1', paths: ['**'], signer: 's' }] });
      expect(protection).toMatchObject({ verdict: 'deny', reason: 'unreadable-protection', because: [unreadable] });
      expect(protection.message).toBe(`brief 012 protects files with a pattern that cannot be read: ${unreadable}`);
    }
    const scope = row({ affectedFiles: ['{./,src}', 'docs/**'], protectedFiles: [] });
    for (const path of ['src/a.ts', 'README.md']) expect(check(path, { brief: scope })).toMatchObject({ verdict: 'warn', reason: 'out-of-scope', because: [unreadable] });
    expect(check('docs/a.md', { brief: scope })).toMatchObject({ verdict: 'allow', reason: 'in-scope', because: ['docs/**'] });
    expect(check('src/db/schema.ts', { rulings: [{ id: 'R-1', paths: ['{./,src/db/schema.ts}'], signer: 's' }] }).reason).toBe('protected');
  });

  it('names the text the braces expand to, and refuses /./ as naming no path where it protected nothing', () => {
    const reasons = (pattern: string): readonly string[] => check('src/a.ts', { brief: row({ protectedFiles: [pattern] }) }).because;
    expect(reasons('.{/,src}')).toEqual(['.{/,src} (the braces expand to "./", which names no path)']);
    expect(reasons('{.,src}')).toEqual(['{.,src} (the braces expand to ".", which names no path)']);
    expect(reasons('{,src}')).toEqual(['{,src} (the braces expand to an empty pattern)']);
    // Rooted, it matched no path the guard is given, all repository-relative.
    expect(reasons('/./')).toEqual(['/./ (the pattern names no path)']);
  });

  it('reads braces that name a path under a directory as before: src/{./,a} is what src holds', () => {
    const scoped = row({ affectedFiles: ['src/{./,a}'], protectedFiles: [] });
    expect(check('src/deep/b.ts', { brief: scoped })).toMatchObject({ verdict: 'allow', reason: 'in-scope', because: ['src/{./,a}'] });
    expect(check('README.md', { brief: scoped })).toMatchObject({ verdict: 'warn', reason: 'out-of-scope', because: [] });
  });

  describe('reads a leading slash on a brace alternative as it reads one on the pattern: rooted, so it names no path the guard is given', () => {
    // Every path the guard decides is repository-relative, and /docs is rooted
    // at the filesystem's root. {/docs,src/**} read as docs or src/**.
    const reasons = (brief: BriefRow, paths: readonly string[]): string[] => paths.map((path) => check(path, { brief }).reason);

    it('puts nothing in the scope for it, and the other alternative as before', () => {
      const paths = ['docs/a.md', 'docs', 'src/a.ts', 'README.md'];
      const braced = row({ affectedFiles: ['{/docs,src/**}'], protectedFiles: [] });
      expect(reasons(braced, paths)).toEqual(['out-of-scope', 'out-of-scope', 'in-scope', 'out-of-scope']);
      expect(reasons(row({ affectedFiles: ['/docs', 'src/**'], protectedFiles: [] }), paths)).toEqual(reasons(braced, paths));
      // Readable, it is not named as a pattern the guard passes over.
      expect(check('docs/a.md', { brief: braced })).toMatchObject({ verdict: 'warn', because: [] });
      expect(check('docs/a.md', { brief: braced }).message).toBe("docs/a.md is outside brief 012's scope, which covers {/docs,src/**}");
      for (const pattern of ['{/docs}', '{/docs,/src/**}', '{//docs,src/**}', '{/./docs,src/**}', '{/docs/,src/**}', '{/*,src/**}']) {
        expect(check('docs/a.md', { brief: row({ affectedFiles: [pattern], protectedFiles: [] }) }).reason, pattern).toBe('out-of-scope');
      }
    });

    it('protects nothing by it, and the other alternative as before', () => {
      const paths = ['docs/a.md', 'migrations/1.sql', 'src/a.ts'];
      const braced = row({ affectedFiles: ['**'], protectedFiles: ['{/docs,migrations/**}'] });
      expect(reasons(braced, paths)).toEqual(['in-scope', 'protected', 'in-scope']);
      expect(reasons(row({ affectedFiles: ['**'], protectedFiles: ['/docs', 'migrations/**'] }), paths)).toEqual(reasons(braced, paths));
      expect(check('migrations/1.sql', { brief: braced }).because).toEqual(['{/docs,migrations/**}']);
    });

    it('allows nothing by it in a ruling, and the other alternative as before', () => {
      const rulings = (paths: string[]): VerifiedRuling[] => [{ id: 'R-1', paths, signer: 's' }];
      expect(check('src/db/schema.ts', { rulings: rulings(['{/src/db/schema.ts,migrations/1.sql}']) }).reason).toBe('protected');
      expect(check('src/db/schema.ts', { rulings: rulings(['/src/db/schema.ts']) }).reason).toBe('protected');
      expect(check('migrations/1.sql', { rulings: rulings(['{/src/db/schema.ts,migrations/1.sql}']) }).reason).toBe('ruled');
    });

    it('reads a slash after a segment, or before the braces, as before', () => {
      // a/{/b,c} is a//b or a/c, and a//b is a/b; /{docs,src} roots both.
      expect(reasons(row({ affectedFiles: ['a/{/b,c}'], protectedFiles: [] }), ['a/b', 'a/c', 'b'])).toEqual(['in-scope', 'in-scope', 'out-of-scope']);
      expect(reasons(row({ affectedFiles: ['/{docs,src}'], protectedFiles: [] }), ['docs/a.md', 'src/a.ts'])).toEqual(['out-of-scope', 'out-of-scope']);
      expect(reasons(row({ affectedFiles: ['{docs,src}'], protectedFiles: [] }), ['docs/a.md', 'src/a.ts'])).toEqual(['in-scope', 'in-scope']);
    });

    it('reads the slashes after a leading ./ as going with it, as POSIX does: .//docs is docs, inside braces too', () => {
      // .//docs was /docs, rooted, and so was the /docs of {.//docs,x} and ./{/docs,x}.
      for (const pattern of ['.//docs', '././/docs', '{.//docs,src/**}', './{/docs,src/**}']) {
        expect(check('docs/a.md', { brief: row({ affectedFiles: [pattern], protectedFiles: [] }) }).reason, pattern).toBe('in-scope');
        expect(check('docs/a.md', { brief: row({ affectedFiles: ['**'], protectedFiles: [pattern] }) }).reason, pattern).toBe('protected');
      }
      expect(check('src/db/schema.ts', { rulings: [{ id: 'R-1', paths: ['.//src/db/schema.ts'], signer: 's' }] }).reason).toBe('ruled');
    });
  });

  it('matches case as written: the caller corrects the spelling, not the guard', () => {
    expect(check('SRC/db/schema.ts').reason).toBe('out-of-scope');
  });

  it('lets the round write its own brief, even one it protects', () => {
    const selfProtecting = row({ protectedFiles: ['briefs/**'] });
    expect(check('briefs/012_rotate-tokens.md', { brief: selfProtecting })).toEqual({
      path: 'briefs/012_rotate-tokens.md',
      verdict: 'allow',
      reason: 'brief-file',
      because: [],
      message: 'briefs/012_rotate-tokens.md is brief 012 itself',
      hint: 'tick or disposition its boxes as the work lands',
    });
    expect(check('briefs/013_other.md', { brief: selfProtecting }).reason).toBe('protected');
  });

  it('allows everything, saying why, when no brief governs the round', () => {
    expect(check('src/db/schema.ts', { brief: null, noBrief: 'no brief is named' })).toEqual({
      path: 'src/db/schema.ts',
      verdict: 'allow',
      reason: 'no-brief',
      because: [],
      message: 'no brief governs src/db/schema.ts: no brief is named',
      hint: 'name the brief this work belongs to, so its scope can be checked',
    });
    expect(check('a.ts', { brief: null }).message).toBe('no brief governs a.ts: no active brief');
  });

  it('allows a path outside the repository, which no brief governs', () => {
    expect(check(null)).toEqual({
      path: '/elsewhere/x.ts',
      verdict: 'allow',
      reason: 'outside-repository',
      because: [],
      message: '/elsewhere/x.ts is outside the repository; no brief governs it',
      hint: 'nothing to do',
    });
  });
});

describe('a rooted pattern', () => {
  it('is rooted whole when a leading slash roots every alternative, and in part when it roots some', () => {
    for (const pattern of ['/docs', '/src/**', '{/docs,/src/**}', '/{docs,src}', '//docs', '/./docs']) expect(rooted(pattern), pattern).toBe('whole');
    for (const pattern of ['{/docs,src/**}', '{src/**,/docs}', '{/a,/b,c}', '{//docs,src/**}']) expect(rooted(pattern), pattern).toBe('part');
  });

  it('is not a pattern the repository roots, a slash after a segment, or a pattern the guard cannot read', () => {
    for (const pattern of ['docs', 'src/**', './docs', 'a/{/b,c}', '{docs,src}/', '**/x.ts', 'src/[a', '{./,src}']) expect(rooted(pattern), pattern).toBeNull();
    // Named as unreadable where it is listed, never as rooted too.
    for (const pattern of ['/src/[a', '{/,src}', '{/docs,src/[a}']) expect(rooted(pattern), pattern).toBeNull();
  });

  it('is not a pattern whose slashes follow a leading ./, which they go with', () => {
    for (const pattern of ['.//docs', '././/docs', './/{docs,src}', '{.//docs,src/**}', './{/docs,src/**}']) expect(rooted(pattern), pattern).toBeNull();
  });
});

describe('a path a link has the system write as another file', () => {
  const given = '/repo/deep/../schema.ts';
  const input = (path: string | null, options: { rulings?: VerifiedRuling[]; outOfScope?: OutOfScope } = {}): GuardInput => ({ path, given, brief, rulings: options.rulings ?? [], outOfScope: options.outOfScope ?? 'warn' });
  const both = (read: string | null, written: string | null, options: { rulings?: VerifiedRuling[]; outOfScope?: OutOfScope } = {}) => decideWritten(decide(input(read, options)), input(written, options));

  it('is refused where the file it is written to is protected, however it reads, and says where the link leads', () => {
    for (const read of ['notes/schema.ts', 'src/auth/login.ts', null, brief.file]) {
      const decision = both(read, 'migrations/001.sql');
      expect(decision, String(read)).toEqual({
        path: 'migrations/001.sql',
        verdict: 'deny',
        reason: 'protected',
        because: ['migrations/**'],
        message: `${given} is written to migrations/001.sql through a link: brief 012 does not empower this round to change migrations/001.sql (protectedFiles: migrations/**)`,
        hint: ESCALATE,
      });
    }
  });

  it('is asked about, or warned of, where the file it is written to is outside the scope and the path reads as in it', () => {
    expect(both('src/auth/login.ts', 'notes/x.md', { outOfScope: 'ask' })).toMatchObject({ path: 'notes/x.md', verdict: 'ask', message: `${given} is written to notes/x.md through a link: notes/x.md is outside brief 012's scope, which covers src/auth/**, tests/auth/**` });
    expect(both('src/auth/login.ts', 'notes/x.md')).toMatchObject({ path: 'notes/x.md', verdict: 'warn', reason: 'out-of-scope' });
    expect(both(null, 'notes/x.md', { outOfScope: 'deny' })).toMatchObject({ path: 'notes/x.md', verdict: 'deny', reason: 'out-of-scope' });
  });

  it('is decided as it reads where that holds the write as much or more', () => {
    // Protected as it reads, in the scope where it is written: refused as it reads, with no word of the link.
    expect(both('src/db/schema.ts', 'src/auth/login.ts')).toEqual(check('src/db/schema.ts'));
    // Two refusals, two questions, two warnings: the first stands.
    expect(both('src/db/schema.ts', 'migrations/001.sql')).toEqual(check('src/db/schema.ts'));
    expect(both('notes/a.md', 'notes/b.md', { outOfScope: 'ask' })).toEqual(check('notes/a.md', { outOfScope: 'ask' }));
    expect(both('notes/a.md', 'notes/b.md')).toEqual(check('notes/a.md'));
    // A question as it reads stands over a warning where it is written.
    expect(decideWritten(check('notes/a.md', { outOfScope: 'ask' }), input('notes/b.md'))).toEqual(check('notes/a.md', { outOfScope: 'ask' }));
    // In the scope both ways, or outside the repository where it is written.
    expect(both('src/auth/a.ts', 'src/auth/b.ts')).toEqual(check('src/auth/a.ts'));
    expect(both('src/auth/a.ts', null)).toEqual(check('src/auth/a.ts'));
  });

  it('is refused where it is written to a protected file a ruling does not cover, though one covers the file it reads as', () => {
    const ruling: VerifiedRuling = { id: 'R-012-1', paths: ['src/db/schema.ts'], signer: 'p@example.com' };
    expect(both('src/db/schema.ts', 'migrations/001.sql', { rulings: [ruling] })).toMatchObject({ verdict: 'deny', path: 'migrations/001.sql' });
    expect(both('migrations/001.sql', 'src/db/schema.ts', { rulings: [ruling] })).toMatchObject({ verdict: 'deny', path: 'migrations/001.sql' });
  });
});

describe('a path held for what names the brief', () => {
  it('is refused in the words the hook holds a write with, and its next step', () => {
    expect(heldBy('src/db/schema.ts', 'the branch names brief 999, and spec-brief knows no such brief')).toEqual({
      path: 'src/db/schema.ts',
      verdict: 'deny',
      reason: 'held',
      because: [],
      message: 'the branch names brief 999, and spec-brief knows no such brief',
      hint: 'fix the brief or the branch before writing',
    });
  });

  it('is refused in its own words where it has a .. and reads as outside every work tree, with how to write it', () => {
    expect(DOTS_MEND).toBe('write the path without its .., as it resolves');
    expect(heldForDots('/elsewhere/sub/../notes.md', 'the branch names brief 999, and spec-brief knows no such brief')).toEqual({
      path: '/elsewhere/sub/../notes.md',
      verdict: 'deny',
      reason: 'held',
      because: [],
      message:
        '/elsewhere/sub/../notes.md has a .. in it and reads as a file outside every work tree of the repository, but a link before the .. can lead back into one, so it is held as a write in the repository is while the branch names brief 999, and spec-brief knows no such brief',
      hint: DOTS_MEND,
    });
  });
});
