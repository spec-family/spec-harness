import { describe, expect, it } from 'vitest';

import { RULES } from '../../src/audit.js';
import { ConfigError, parseConfig } from '../../src/config.js';
import { formatSarif, type FormatOptions } from '../../src/formats.js';
import { parseClaudeHook } from '../../src/hooks.js';
import { decodeEntities, readJUnit } from '../../src/junit.js';
import type { Finding } from '../../src/types.js';

/**
 * Names every JavaScript object answers to - `constructor`, `toString`,
 * `__proto__` - written where a word is read from outside: an entity in a
 * JUnit report, the rule of a finding a caller formats, a key of the
 * configuration, the tool a hook names.
 *
 * Each is an unknown word there, and is read as any other unknown word is.
 * A table kept as an object answered to them: `&constructor;` in a test's
 * name was decoded to the source of a function, and a finding of the rule
 * `constructor` had no description in SARIF. The last two describes hold what
 * was read safely already. Each test reads the name beside a word nothing
 * answers to, and expects the two to be read alike.
 */

const NAMES: readonly string[] = ['constructor', 'toString', '__proto__'];

/** A word of the same shape that nothing answers to. */
const PLAIN = 'nonesuch';

describe('an entity in a JUnit report', () => {
  it('stays as written when its name is one every object answers to, as any unknown entity does', () => {
    for (const name of [...NAMES, 'valueOf', 'hasOwnProperty', PLAIN]) {
      expect(decodeEntities(`a &${name}; b`), name).toBe(`a &${name}; b`);
    }
    expect(decodeEntities('&constructor;&toString;&amp;&valueOf;')).toBe('&constructor;&toString;&&valueOf;');
  });

  it('is still each of the five XML names', () => {
    expect(decodeEntities('&amp; &lt; &gt; &quot; &apos;')).toBe('& < > " \'');
  });

  it('is left in a test case as the report wrote it, in its name, its class, its message and its body', () => {
    for (const name of [...NAMES, PLAIN]) {
      const read = readJUnit(
        [
          '<testsuite name="s">',
          `  <testcase classname="suite &${name}; one" name="reads &${name}; &amp; more">`,
          `    <failure message="expected &${name};">body &${name}; &lt;here&gt;</failure>`,
          '  </testcase>',
          '</testsuite>',
        ].join('\n'),
      );
      expect(read, name).toEqual({
        ok: true,
        cases: [
          {
            name: `reads &${name}; & more`,
            classname: `suite &${name}; one`,
            outcome: 'failed',
            message: `expected &${name};\nbody &${name}; <here>`,
          },
        ],
      });
    }
  });

  it('changes nothing of a case whose attributes are so named', () => {
    for (const name of [...NAMES, PLAIN]) {
      const read = readJUnit(`<testsuite><testcase ${name}="x" name="n" classname="c"/><testcase ${name}="y"/></testsuite>`);
      expect(read, name).toEqual({
        ok: true,
        cases: [
          { name: 'n', classname: 'c', outcome: 'passed', message: '' },
          { name: '', classname: '', outcome: 'passed', message: '' },
        ],
      });
    }
  });
});

describe('the rule of a finding, described for SARIF', () => {
  const OPTIONS: FormatOptions = { file: 'briefs/001_a.md', version: '9.9.9' };
  const described = (rule: string): unknown => {
    const finding: Finding = { rule, severity: 'error', message: 'm', hint: 'h' };
    const document = JSON.parse(formatSarif([finding], OPTIONS)) as { runs: [{ tool: { driver: { rules: unknown } } }] };
    return document.runs[0].tool.driver.rules;
  };

  it('is its own name when it is one every object answers to, as any rule the audit does not have, where it had no text', () => {
    for (const rule of [...NAMES, 'valueOf', PLAIN]) {
      expect(described(rule), rule).toEqual([{ id: rule, shortDescription: { text: rule } }]);
    }
  });

  it('is still the audit\'s sentence for a rule of the audit, and the archive\'s rule for one of spec-brief\'s', () => {
    expect(described('goal-failed')).toEqual([{ id: 'goal-failed', shortDescription: { text: RULES['goal-failed'] } }]);
    expect(described('archive/constructor')).toEqual([
      { id: 'archive/constructor', shortDescription: { text: "A reason spec-brief's archive gives: constructor." } },
    ]);
  });
});

describe('a key of the configuration', () => {
  const refusal = (text: string): string => {
    try {
      // Read as text: `__proto__` in an object literal would set what the object inherits from, and name no key.
      parseConfig(JSON.parse(text));
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      return (error as Error).message;
    }
    throw new Error('the configuration was accepted');
  };

  it('is an unknown key when it is one every object answers to, at the top and in every section', () => {
    for (const key of [...NAMES, PLAIN]) {
      expect(refusal(`{ "${key}": true }`), key).toBe(
        `.spec-harness.json: unknown key "${key}"; the keys are $schema, branches, outOfScope, base, rulings, dependencies, context, assertions, probes, tools, turnReport, protectHarness`,
      );
      expect(refusal(`{ "tools": { "${key}": ["node", "x.js"] } }`), key).toBe(
        `.spec-harness.json: "tools": unknown key "${key}"; the keys are spec-brief, spec-graph, spec-guard`,
      );
      expect(refusal(`{ "probes": { "${key}": 1 } }`), key).toBe(`.spec-harness.json: "probes": unknown key "${key}"; the keys are runs, timeout`);
      expect(refusal(`{ "rulings": { "${key}": "x" } }`), key).toBe(
        `.spec-harness.json: "rulings": unknown key "${key}"; the keys are section, allowedSigners`,
      );
    }
  });

  it('is not a value either: outOfScope takes its three words and no other', () => {
    for (const word of [...NAMES, PLAIN]) {
      expect(refusal(`{ "outOfScope": "${word}" }`), word).toBe('.spec-harness.json: "outOfScope" must be "warn", "ask" or "deny"');
    }
  });
});

describe('the tool a Claude Code hook names', () => {
  it('writes no file when it is a name every object answers to, as any tool that is not a writing one', () => {
    for (const tool of [...NAMES, PLAIN]) {
      const request = parseClaudeHook(JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: tool, cwd: '/repo', tool_input: { file_path: '/repo/a.ts' } }));
      expect(request, tool).toEqual({ event: 'PreToolUse', tool, cwd: '/repo', paths: [], session: null, call: null });
    }
  });

  it('reads no path from a field so named, and still reads the three it knows', () => {
    for (const field of [...NAMES, PLAIN]) {
      const input = `{ "hook_event_name": "PreToolUse", "tool_name": "Write", "cwd": "/repo", "tool_input": { "${field}": "/repo/secret.ts", "file_path": "/repo/a.ts" } }`;
      expect(parseClaudeHook(input), field).toEqual({ event: 'PreToolUse', tool: 'Write', cwd: '/repo', paths: ['/repo/a.ts'], session: null, call: null });
      const only = `{ "hook_event_name": "PreToolUse", "tool_name": "Write", "cwd": "/repo", "tool_input": { "${field}": { "file_path": "/repo/secret.ts" } } }`;
      expect(parseClaudeHook(only), field).toEqual({ event: 'PreToolUse', tool: 'Write', cwd: '/repo', paths: [], session: null, call: null });
    }
  });
});
