/**
 * PythonFunctionRuntime tests.
 *
 * Uses the handler registration path so tests don't need a real Python
 * install — the source is written to a temp file and executed by python3.
 * If python3 is not available, the tests are skipped.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { PythonFunctionRuntime } from '../functions/python-runtime.js';
import type { FunctionType } from '@altius/odl';

// Check if python3 is available
let pythonAvailable = false;
beforeAll(async () => {
  try {
    const { execFileSync } = await import('node:child_process');
    execFileSync('python3', ['--version'], { stdio: 'pipe', timeout: 3000 });
    pythonAvailable = true;
  } catch {
    pythonAvailable = false;
  }
});

const fn: FunctionType = {
  kind: 'functionType',
  name: 'Doubler',
  entry: 'doubler.py',
  fields: [],
  runtime: 'python',
  requiredRoles: [],
  directives: [{ kind: 'function', runtime: 'python', entry: 'doubler.py' }],
};

describe('PythonFunctionRuntime', () => {
  it.skipIf(!pythonAvailable)('executes a Python function and returns JSON', async () => {
    const runtime = new PythonFunctionRuntime();
    runtime.register('doubler.py', `
import json, sys
inputs = json.loads(sys.stdin.read())
result = {"doubled": inputs["x"] * 2}
print(json.dumps(result))
`);
    const result = await runtime.execute({
      fn,
      inputs: { x: 21 },
      log: () => {},
    });
    expect(result).toEqual({ doubled: 42 });
  });

  it.skipIf(!pythonAvailable)('handles string inputs', async () => {
    const runtime = new PythonFunctionRuntime();
    runtime.register('greet.py', `
import json, sys
inputs = json.loads(sys.stdin.read())
print(json.dumps({"greeting": "Hello, " + inputs["name"] + "!"}))
`);
    const result = await runtime.execute({
      fn: { ...fn, name: 'Greeter', entry: 'greet.py' },
      inputs: { name: 'World' },
      log: () => {},
    });
    expect(result).toEqual({ greeting: 'Hello, World!' });
  });

  it.skipIf(!pythonAvailable)('captures stderr as log output', async () => {
    const runtime = new PythonFunctionRuntime();
    runtime.register('loggy.py', `
import json, sys, sys
print("debug message", file=sys.stderr)
inputs = json.loads(sys.stdin.read())
print(json.dumps({"ok": True}))
`);
    const logs: Array<{ level: string; message: string }> = [];
    await runtime.execute({
      fn: { ...fn, name: 'Loggy', entry: 'loggy.py' },
      inputs: {},
      log: (level, message) => logs.push({ level, message }),
    });
    expect(logs.some((l) => l.message.includes('debug message'))).toBe(true);
  });

  it.skipIf(!pythonAvailable)('rejects non-JSON output', async () => {
    const runtime = new PythonFunctionRuntime();
    runtime.register('bad.py', `
print("not json at all")
`);
    await expect(
      runtime.execute({
        fn: { ...fn, name: 'Bad', entry: 'bad.py' },
        inputs: {},
        log: () => {},
      }),
    ).rejects.toThrow(/not valid JSON/);
  });

  it.skipIf(!pythonAvailable)('rejects python errors with stderr', async () => {
    const runtime = new PythonFunctionRuntime();
    runtime.register('crash.py', `
raise ValueError("boom")
`);
    await expect(
      runtime.execute({
        fn: { ...fn, name: 'Crash', entry: 'crash.py' },
        inputs: {},
        log: () => {},
      }),
    ).rejects.toThrow(/boom/);
  });

  it('throws when no handler and no packDir', async () => {
    const runtime = new PythonFunctionRuntime();
    await expect(
      runtime.execute({
        fn,
        inputs: {},
        log: () => {},
      }),
    ).rejects.toThrow(/no handler/);
  });

  it('has the name "python"', () => {
    const runtime = new PythonFunctionRuntime();
    expect(runtime.name).toBe('python');
  });
});
