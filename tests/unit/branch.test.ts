import { describe, expect, it } from 'vitest';

import { briefIdFromBranch, ciBranch, idFromBranch, sameId, templateError } from '../../src/branch.js';

describe('templates', () => {
  it('accepts a template with {id} once, at its end', () => {
    expect(templateError('brief/{id}')).toBeNull();
    expect(templateError('*/brief-{id}')).toBeNull();
  });

  it('refuses a template without {id}, with it twice, or with anything after it', () => {
    expect(templateError('brief/')).toBe('"brief/" must contain {id} exactly once');
    expect(templateError('{id}/{id}')).toBe('"{id}/{id}" must contain {id} exactly once');
    expect(templateError('brief/{id}-x')).toBe('"brief/{id}-x" must end with {id}; whatever follows the id is the branch\'s own');
  });

  it('reads nothing through a template it refuses', () => {
    expect(idFromBranch('brief/{id}-x', 'brief/012-x')).toBeNull();
    expect(idFromBranch('brief/', 'brief/012')).toBeNull();
  });
});

describe('the id a branch carries', () => {
  it.each([
    ['brief/{id}', 'brief/012', '012'],
    ['brief/{id}', 'brief/012-rotate-tokens', '012'],
    ['brief/{id}', 'brief/012_rotate', '012'],
    ['brief/{id}', 'brief/012.rotate', '012'],
    ['brief/{id}', 'brief/012/rotate', '012'],
    ['brief/{id}', 'brief/012x', '012x'],
    ['brief/{id}', 'brief/AB12-x', 'AB12'],
    ['brief-{id}', 'brief-7', '7'],
    ['*/brief/{id}', 'nh/brief/012-x', '012'],
    ['*/brief-{id}', 'feature/brief-9_y', '9'],
  ])('%s reads %s as %s', (template, name, id) => {
    expect(idFromBranch(template, name)).toBe(id);
  });

  it.each([
    // A character that is neither part of an id nor a separator ends no id.
    ['brief/{id}', 'brief/012+x'],
    ['brief/{id}', 'brief/'],
    ['brief/{id}', 'brief/-x'],
    // Templates are anchored at the start of the name.
    ['brief/{id}', 'feature/brief/012'],
    ['brief/{id}', 'xbrief/012'],
    // A star never crosses a slash.
    ['*/brief-{id}', 'a/b/brief-7'],
    ['*/brief-{id}', 'brief-7'],
    ['brief-{id}', 'main'],
  ])('%s reads no id from %s', (template, name) => {
    expect(idFromBranch(template, name)).toBeNull();
  });

  it('lets a star match nothing', () => {
    expect(idFromBranch('x*y/{id}', 'xy/5')).toBe('5');
    // A star continues what came before it; it cannot start where that failed.
    expect(idFromBranch('x*/{id}', 'ab/5')).toBeNull();
    expect(idFromBranch('*/brief-{id}', '/brief-7')).toBe('7');
  });

  it('takes the leftmost reading that ends at a separator, skipping one that does not', () => {
    expect(idFromBranch('*-{id}', 'x-12-y')).toBe('12');
    expect(idFromBranch('*-{id}', 'a-b+c-d')).toBe('d');
  });

  it('stops a star at the first slash but lets it end there', () => {
    expect(idFromBranch('*/{id}', 'team/42')).toBe('42');
    expect(idFromBranch('*{id}', 'team/42')).toBe('team');
  });

  it('never goes exponential: many stars against a long name finish at once', () => {
    // A backtracking matcher tries every split of the name among the stars;
    // the table here costs stars times characters.
    const template = `${'*a'.repeat(25)}/{id}`;
    const long = 'a'.repeat(3000);
    const started = performance.now();
    expect(idFromBranch(template, long)).toBeNull();
    expect(idFromBranch(template, `${long}/42`)).toBe('42');
    expect(idFromBranch(template, `${long}b/42`)).toBeNull();
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it('asks the templates in order and answers the first that reads an id', () => {
    const templates = ['brief/{id}', '*/brief/{id}'];
    expect(briefIdFromBranch(templates, 'brief/3-x')).toBe('3');
    expect(briefIdFromBranch(templates, 'nh/brief/4-x')).toBe('4');
    expect(briefIdFromBranch(['*-{id}', 'brief-{id}'], 'brief-5')).toBe('5');
    expect(briefIdFromBranch(['brief-{id}', '*-{id}'], 'x-brief-5')).toBe('brief');
    expect(briefIdFromBranch(templates, 'main')).toBeNull();
    expect(briefIdFromBranch([], 'brief/3')).toBeNull();
    // A detached head with no CI branch: no name, so no brief, whatever the templates.
    expect(briefIdFromBranch(['{id}'], null)).toBeNull();
  });

  it('reads no id from a name that is empty, under any template, and does not stop on it', () => {
    for (const template of ['{id}', 'brief/{id}', '*/brief-{id}', '*{id}']) expect(idFromBranch(template, ''), template).toBeNull();
    expect(briefIdFromBranch(['brief/{id}', '{id}'], '')).toBeNull();
  });
});

/**
 * The reading this module had until 2026-11-08, as it was, but for its
 * comments: a table of booleans one place past the end of the name, and
 * bounds no test could tell from their mutants, of which a sweep read some
 * as timeouts and some as survivors. The reading now is held to it here.
 */
function previousIdFromBranch(template: string, name: string): string | null {
  if (templateError(template) !== null) return null;
  const prefix = template.slice(0, -'{id}'.length);
  let reach: boolean[] = new Array<boolean>(name.length + 1).fill(false);
  reach[0] = true;
  for (const token of prefix) {
    const next = new Array<boolean>(name.length + 1).fill(false);
    if (token === '*') {
      let open = false;
      for (let j = 0; j <= name.length; j += 1) {
        if (reach[j]) open = true;
        if (open) next[j] = true;
        if (name.charAt(j) === '/') open = false;
      }
    } else {
      for (let j = 0; j < name.length; j += 1) if (reach[j] && name.charAt(j) === token) next[j + 1] = true;
    }
    reach = next;
  }
  const ends: number[] = [];
  reach.forEach((ok, j) => {
    if (ok) ends.push(j);
  });
  for (const start of ends) {
    let end = start;
    while (end < name.length && /^[A-Za-z0-9]$/.test(name.charAt(end))) end += 1;
    if (end === start) continue;
    if (end < name.length && !['-', '_', '/', '.'].includes(name.charAt(end))) continue;
    return name.slice(start, end);
  }
  return null;
}

/** Every string of `alphabet` up to `longest` characters, the empty one first. */
function strings(alphabet: readonly string[], longest: number): string[] {
  const all = [''];
  let last = [''];
  for (let length = 1; length <= longest; length += 1) {
    last = last.flatMap((head) => alphabet.map((character) => head + character));
    all.push(...last);
  }
  return all;
}

describe('the reading as it was', () => {
  it('reads every short name under every short template as the table one place past the end did', () => {
    // A star, a slash, a separator and a letter in templates; in names, that
    // letter, a digit, which no template has, a slash, a separator and a
    // character that ends no id.
    const templates = strings(['*', '/', '-', 'a'], 3).map((prefix) => `${prefix}{id}`);
    const names = strings(['a', '1', '/', '-', '+'], 4);
    const differing = templates.flatMap((template) =>
      names.filter((name) => idFromBranch(template, name) !== previousIdFromBranch(template, name)).map((name) => `${template} ${name}`),
    );
    expect(differing).toEqual([]);
    // What the two are held to is not nothing: an id is read under some.
    expect(templates.filter((template) => names.some((name) => idFromBranch(template, name) !== null)).length).toBeGreaterThan(templates.length / 2);
  });
});

describe('id equality', () => {
  it('matches ids as written, or as numbers when both are all digits', () => {
    expect(sameId('012', '012')).toBe(true);
    expect(sameId('12', '012')).toBe(true);
    expect(sameId('0', '000')).toBe(true);
    expect(sameId('abc', 'abc')).toBe(true);
    // Beyond the safe integers, as numbers still.
    expect(sameId('90071992547409930', '090071992547409930')).toBe(true);
  });

  it('does not match ids that differ, or that are only numeric on one side', () => {
    expect(sameId('12', '13')).toBe(false);
    expect(sameId('12', '12a')).toBe(false);
    expect(sameId('012a', '12a')).toBe(false);
    // Digits must be the whole id on both sides, or BigInt would be asked to read "12a".
    expect(sameId('12a', '12')).toBe(false);
    expect(sameId('a12', '12')).toBe(false);
    expect(sameId('12', 'a12')).toBe(false);
    expect(sameId('abc', 'ABC')).toBe(false);
    expect(sameId('', '0')).toBe(false);
    expect(sameId('90071992547409930', '90071992547409931')).toBe(false);
  });
});

describe('the branch a CI run builds, on a detached head', () => {
  it('is a GitHub pull request\'s head branch, then the branch a GitHub push built, then a GitLab merge request\'s, then a GitLab pipeline\'s', () => {
    const all = {
      GITHUB_HEAD_REF: 'brief/1-pr',
      GITHUB_REF_TYPE: 'branch',
      GITHUB_REF_NAME: 'brief/2-push',
      CI_MERGE_REQUEST_SOURCE_BRANCH_NAME: 'brief/3-mr',
      CI_COMMIT_BRANCH: 'brief/4-pipeline',
    };
    expect(ciBranch(all)).toEqual({ branch: 'brief/1-pr', source: 'GITHUB_HEAD_REF' });
    expect(ciBranch({ ...all, GITHUB_HEAD_REF: '' })).toEqual({ branch: 'brief/2-push', source: 'GITHUB_REF_NAME' });
    expect(ciBranch({ ...all, GITHUB_HEAD_REF: undefined, GITHUB_REF_NAME: '  ' })).toEqual({ branch: 'brief/3-mr', source: 'CI_MERGE_REQUEST_SOURCE_BRANCH_NAME' });
    expect(ciBranch({ CI_MERGE_REQUEST_SOURCE_BRANCH_NAME: '', CI_COMMIT_BRANCH: ' brief/4-pipeline ' })).toEqual({ branch: 'brief/4-pipeline', source: 'CI_COMMIT_BRANCH' });
  });

  it('is never a tag GitHub built, or a name outside CI', () => {
    expect(ciBranch({ GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v1.0.0' })).toBeNull();
    expect(ciBranch({ GITHUB_REF_NAME: 'brief/2-push' })).toBeNull();
    // GitLab's CI_COMMIT_REF_NAME names a tag as well, so it is not read.
    expect(ciBranch({ CI_COMMIT_REF_NAME: 'v1.0.0', CI_COMMIT_TAG: 'v1.0.0' })).toBeNull();
    expect(ciBranch({})).toBeNull();
  });
});
