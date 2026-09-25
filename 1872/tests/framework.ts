/**
 * RSR AI Version 5 - Production QA Test Framework
 * Lightweight, high-reliability test assertion and runner engine
 */

export interface TestResult {
  suite: string;
  name: string;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  error?: string;
}

export interface SuiteSummary {
  name: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  tests: TestResult[];
}

class TestContext {
  public currentSuite = "Default Suite";
  public suites: Map<string, TestResult[]> = new Map();
  public suiteQueue: Array<{ name: string; fn: () => Promise<void> | void }> = [];

  public setSuite(name: string) {
    this.currentSuite = name;
    if (!this.suites.has(name)) {
      this.suites.set(name, []);
    }
  }

  public addResult(result: TestResult) {
    const list = this.suites.get(result.suite) || [];
    list.push(result);
    this.suites.set(result.suite, list);
  }
}

export const context = new TestContext();

export async function describe(suiteName: string, fn: () => Promise<void> | void) {
  context.setSuite(suiteName);
  context.suiteQueue = [];
  
  // Register all `it` calls inside the suite
  await fn();

  // Execute all queued tests sequentially
  const queue = [...context.suiteQueue];
  context.suiteQueue = [];

  for (const item of queue) {
    const start = Date.now();
    try {
      await item.fn();
      context.addResult({
        suite: suiteName,
        name: item.name,
        status: "passed",
        durationMs: Date.now() - start,
      });
    } catch (err: any) {
      context.addResult({
        suite: suiteName,
        name: item.name,
        status: "failed",
        durationMs: Date.now() - start,
        error: err?.message || String(err),
      });
    }
  }
}

export function it(name: string, fn: () => Promise<void> | void) {
  context.suiteQueue.push({ name, fn });
}

export function expect(actual: any) {
  return {
    toBe(expected: any) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
      }
    },
    toEqual(expected: any) {
      const a = JSON.stringify(actual);
      const b = JSON.stringify(expected);
      if (a !== b) {
        throw new Error(`Expected deep equality:\nExpected: ${b}\nReceived: ${a}`);
      }
    },
    toBeDefined() {
      if (actual === undefined) {
        throw new Error(`Expected value to be defined, but got undefined`);
      }
    },
    toBeUndefined() {
      if (actual !== undefined) {
        throw new Error(`Expected undefined, but got ${JSON.stringify(actual)}`);
      }
    },
    toBeNull() {
      if (actual !== null) {
        throw new Error(`Expected null, but got ${JSON.stringify(actual)}`);
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error(`Expected truthy value, but got ${JSON.stringify(actual)}`);
      }
    },
    toBeFalsy() {
      if (actual) {
        throw new Error(`Expected falsy value, but got ${JSON.stringify(actual)}`);
      }
    },
    toBeGreaterThan(expected: number) {
      if (typeof actual !== "number" || actual <= expected) {
        throw new Error(`Expected ${actual} > ${expected}`);
      }
    },
    toBeLessThan(expected: number) {
      if (typeof actual !== "number" || actual >= expected) {
        throw new Error(`Expected ${actual} < ${expected}`);
      }
    },
    toBeGreaterThanOrEqual(expected: number) {
      if (typeof actual !== "number" || actual < expected) {
        throw new Error(`Expected ${actual} >= ${expected}`);
      }
    },
    toBeLessThanOrEqual(expected: number) {
      if (typeof actual !== "number" || actual > expected) {
        throw new Error(`Expected ${actual} <= ${expected}`);
      }
    },
    toContain(sub: string | any) {
      if (typeof actual === "string") {
        if (!actual.includes(sub)) {
          throw new Error(`Expected "${actual}" to contain "${sub}"`);
        }
      } else if (Array.isArray(actual)) {
        if (!actual.includes(sub)) {
          throw new Error(`Expected array to contain ${JSON.stringify(sub)}`);
        }
      } else {
        throw new Error(`toContain called on non-collection type: ${typeof actual}`);
      }
    },
    toMatch(regex: RegExp) {
      if (typeof actual !== "string" || !regex.test(actual)) {
        throw new Error(`Expected "${actual}" to match pattern ${regex}`);
      }
    },
    toThrow(expectedMessage?: string) {
      if (typeof actual !== "function") {
        throw new Error(`toThrow called on non-function`);
      }
      let threw = false;
      let caughtError: any = null;
      try {
        actual();
      } catch (err: any) {
        threw = true;
        caughtError = err;
      }
      if (!threw) {
        throw new Error(`Expected function to throw an error, but it did not`);
      }
      if (expectedMessage && !String(caughtError?.message || caughtError).includes(expectedMessage)) {
        throw new Error(`Expected thrown error to contain "${expectedMessage}", got "${caughtError?.message || caughtError}"`);
      }
    },
    not: {
      toBe(expected: any) {
        if (actual === expected) {
          throw new Error(`Expected ${JSON.stringify(actual)} NOT to be ${JSON.stringify(expected)}`);
        }
      },
      toEqual(expected: any) {
        if (JSON.stringify(actual) === JSON.stringify(expected)) {
          throw new Error(`Expected ${JSON.stringify(actual)} NOT to equal ${JSON.stringify(expected)}`);
        }
      },
      toContain(sub: string | any) {
        if (typeof actual === "string" && actual.includes(sub)) {
          throw new Error(`Expected "${actual}" NOT to contain "${sub}"`);
        }
        if (Array.isArray(actual) && actual.includes(sub)) {
          throw new Error(`Expected array NOT to contain ${JSON.stringify(sub)}`);
        }
      },
      toBeNull() {
        if (actual === null) {
          throw new Error(`Expected value NOT to be null`);
        }
      },
      toBeUndefined() {
        if (actual === undefined) {
          throw new Error(`Expected value NOT to be undefined`);
        }
      },
    },
  };
}

export function getSummaries(): SuiteSummary[] {
  const summaries: SuiteSummary[] = [];

  for (const [suiteName, tests] of context.suites.entries()) {
    const total = tests.length;
    const passed = tests.filter((t) => t.status === "passed").length;
    const failed = tests.filter((t) => t.status === "failed").length;
    const skipped = tests.filter((t) => t.status === "skipped").length;
    const durationMs = tests.reduce((acc, t) => acc + t.durationMs, 0);

    summaries.push({
      name: suiteName,
      total,
      passed,
      failed,
      skipped,
      durationMs,
      tests,
    });
  }

  return summaries;
}
