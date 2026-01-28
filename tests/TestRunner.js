/**
 * Simple browser-based test runner for FarmGame
 *
 * Usage:
 *   import { TestRunner, describe, it, expect, beforeEach, afterEach } from './TestRunner.js';
 *
 *   describe('MyClass', () => {
 *     beforeEach(() => { ... });
 *
 *     it('should do something', () => {
 *       expect(value).toBe(expected);
 *       expect(value).toEqual(expected);
 *       expect(value).toBeTruthy();
 *       expect(value).toBeFalsy();
 *       expect(value).toBeGreaterThan(n);
 *       expect(value).toBeLessThan(n);
 *       expect(value).toContain(item);
 *       expect(fn).toThrow();
 *     });
 *   });
 *
 *   TestRunner.run();
 */

// Test suite storage
const suites = [];
let currentSuite = null;

// Results
const results = {
    passed: 0,
    failed: 0,
    errors: [],
    startTime: 0,
    endTime: 0
};

/**
 * Define a test suite
 */
export function describe(name, fn) {
    const suite = {
        name,
        tests: [],
        beforeEach: null,
        afterEach: null,
        beforeAll: null,
        afterAll: null
    };

    const previousSuite = currentSuite;
    currentSuite = suite;

    try {
        fn();
    } finally {
        currentSuite = previousSuite;
    }

    suites.push(suite);
}

/**
 * Define a test case
 */
export function it(name, fn) {
    if (!currentSuite) {
        throw new Error('it() must be called inside describe()');
    }
    currentSuite.tests.push({ name, fn });
}

// Aliases
export const test = it;

/**
 * Setup before each test in the suite
 */
export function beforeEach(fn) {
    if (!currentSuite) {
        throw new Error('beforeEach() must be called inside describe()');
    }
    currentSuite.beforeEach = fn;
}

/**
 * Cleanup after each test in the suite
 */
export function afterEach(fn) {
    if (!currentSuite) {
        throw new Error('afterEach() must be called inside describe()');
    }
    currentSuite.afterEach = fn;
}

/**
 * Setup before all tests in the suite
 */
export function beforeAll(fn) {
    if (!currentSuite) {
        throw new Error('beforeAll() must be called inside describe()');
    }
    currentSuite.beforeAll = fn;
}

/**
 * Cleanup after all tests in the suite
 */
export function afterAll(fn) {
    if (!currentSuite) {
        throw new Error('afterAll() must be called inside describe()');
    }
    currentSuite.afterAll = fn;
}

/**
 * Create an expectation for assertions
 */
export function expect(actual) {
    return {
        toBe(expected) {
            if (actual !== expected) {
                throw new AssertionError(`Expected ${JSON.stringify(actual)} to be ${JSON.stringify(expected)}`);
            }
        },

        toEqual(expected) {
            if (!deepEqual(actual, expected)) {
                throw new AssertionError(`Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`);
            }
        },

        toBeTruthy() {
            if (!actual) {
                throw new AssertionError(`Expected ${JSON.stringify(actual)} to be truthy`);
            }
        },

        toBeFalsy() {
            if (actual) {
                throw new AssertionError(`Expected ${JSON.stringify(actual)} to be falsy`);
            }
        },

        toBeNull() {
            if (actual !== null) {
                throw new AssertionError(`Expected ${JSON.stringify(actual)} to be null`);
            }
        },

        toBeUndefined() {
            if (actual !== undefined) {
                throw new AssertionError(`Expected ${JSON.stringify(actual)} to be undefined`);
            }
        },

        toBeDefined() {
            if (actual === undefined) {
                throw new AssertionError(`Expected value to be defined`);
            }
        },

        toBeGreaterThan(expected) {
            if (!(actual > expected)) {
                throw new AssertionError(`Expected ${actual} to be greater than ${expected}`);
            }
        },

        toBeGreaterThanOrEqual(expected) {
            if (!(actual >= expected)) {
                throw new AssertionError(`Expected ${actual} to be greater than or equal to ${expected}`);
            }
        },

        toBeLessThan(expected) {
            if (!(actual < expected)) {
                throw new AssertionError(`Expected ${actual} to be less than ${expected}`);
            }
        },

        toBeLessThanOrEqual(expected) {
            if (!(actual <= expected)) {
                throw new AssertionError(`Expected ${actual} to be less than or equal to ${expected}`);
            }
        },

        toContain(item) {
            if (Array.isArray(actual)) {
                if (!actual.includes(item)) {
                    throw new AssertionError(`Expected array to contain ${JSON.stringify(item)}`);
                }
            } else if (typeof actual === 'string') {
                if (!actual.includes(item)) {
                    throw new AssertionError(`Expected string to contain "${item}"`);
                }
            } else {
                throw new AssertionError(`toContain() requires an array or string`);
            }
        },

        toHaveLength(expected) {
            if (actual.length !== expected) {
                throw new AssertionError(`Expected length ${actual.length} to be ${expected}`);
            }
        },

        toThrow(expectedError) {
            if (typeof actual !== 'function') {
                throw new AssertionError('toThrow() requires a function');
            }
            let threw = false;
            let error = null;
            try {
                actual();
            } catch (e) {
                threw = true;
                error = e;
            }
            if (!threw) {
                throw new AssertionError('Expected function to throw an error');
            }
            if (expectedError && !error.message.includes(expectedError)) {
                throw new AssertionError(`Expected error message to contain "${expectedError}"`);
            }
        },

        toBeInstanceOf(expected) {
            if (!(actual instanceof expected)) {
                throw new AssertionError(`Expected value to be instance of ${expected.name}`);
            }
        },

        not: {
            toBe(expected) {
                if (actual === expected) {
                    throw new AssertionError(`Expected ${JSON.stringify(actual)} not to be ${JSON.stringify(expected)}`);
                }
            },

            toEqual(expected) {
                if (deepEqual(actual, expected)) {
                    throw new AssertionError(`Expected ${JSON.stringify(actual)} not to equal ${JSON.stringify(expected)}`);
                }
            },

            toBeTruthy() {
                if (actual) {
                    throw new AssertionError(`Expected ${JSON.stringify(actual)} not to be truthy`);
                }
            },

            toBeFalsy() {
                if (!actual) {
                    throw new AssertionError(`Expected ${JSON.stringify(actual)} not to be falsy`);
                }
            },

            toBeNull() {
                if (actual === null) {
                    throw new AssertionError(`Expected value not to be null`);
                }
            },

            toContain(item) {
                if (Array.isArray(actual) && actual.includes(item)) {
                    throw new AssertionError(`Expected array not to contain ${JSON.stringify(item)}`);
                }
                if (typeof actual === 'string' && actual.includes(item)) {
                    throw new AssertionError(`Expected string not to contain "${item}"`);
                }
            }
        }
    };
}

/**
 * Custom assertion error
 */
class AssertionError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AssertionError';
    }
}

/**
 * Deep equality check
 */
function deepEqual(a, b) {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (typeof a !== typeof b) return false;

    if (typeof a === 'object') {
        if (Array.isArray(a) !== Array.isArray(b)) return false;

        const keysA = Object.keys(a);
        const keysB = Object.keys(b);

        if (keysA.length !== keysB.length) return false;

        for (const key of keysA) {
            if (!keysB.includes(key)) return false;
            if (!deepEqual(a[key], b[key])) return false;
        }

        return true;
    }

    return false;
}

/**
 * Test Runner - executes all registered tests
 */
export class TestRunner {
    /**
     * Run all registered test suites
     */
    static async run() {
        results.passed = 0;
        results.failed = 0;
        results.errors = [];
        results.startTime = performance.now();

        console.log('%c========================================', 'color: #4a90d9');
        console.log('%c         FarmGame Test Runner          ', 'color: #4a90d9; font-weight: bold');
        console.log('%c========================================', 'color: #4a90d9');
        console.log('');

        for (const suite of suites) {
            await this.runSuite(suite);
        }

        results.endTime = performance.now();
        this.printSummary();

        return results;
    }

    /**
     * Run a single test suite
     */
    static async runSuite(suite) {
        console.log(`%c▶ ${suite.name}`, 'color: #888; font-weight: bold');

        // Run beforeAll
        if (suite.beforeAll) {
            try {
                await suite.beforeAll();
            } catch (error) {
                console.log(`%c  ✗ beforeAll failed: ${error.message}`, 'color: #e74c3c');
                results.failed += suite.tests.length;
                return;
            }
        }

        for (const test of suite.tests) {
            await this.runTest(suite, test);
        }

        // Run afterAll
        if (suite.afterAll) {
            try {
                await suite.afterAll();
            } catch (error) {
                console.log(`%c  ✗ afterAll failed: ${error.message}`, 'color: #e74c3c');
            }
        }

        console.log('');
    }

    /**
     * Run a single test
     */
    static async runTest(suite, test) {
        // Run beforeEach
        if (suite.beforeEach) {
            try {
                await suite.beforeEach();
            } catch (error) {
                console.log(`%c  ✗ ${test.name}`, 'color: #e74c3c');
                console.log(`%c    beforeEach failed: ${error.message}`, 'color: #e74c3c');
                results.failed++;
                results.errors.push({ suite: suite.name, test: test.name, error });
                return;
            }
        }

        // Run test
        try {
            await test.fn();
            console.log(`%c  ✓ ${test.name}`, 'color: #27ae60');
            results.passed++;
        } catch (error) {
            console.log(`%c  ✗ ${test.name}`, 'color: #e74c3c');
            console.log(`%c    ${error.message}`, 'color: #e74c3c');
            results.failed++;
            results.errors.push({ suite: suite.name, test: test.name, error });
        }

        // Run afterEach
        if (suite.afterEach) {
            try {
                await suite.afterEach();
            } catch (error) {
                console.log(`%c    afterEach failed: ${error.message}`, 'color: #f39c12');
            }
        }
    }

    /**
     * Print test summary
     */
    static printSummary() {
        const duration = (results.endTime - results.startTime).toFixed(2);
        const total = results.passed + results.failed;

        console.log('%c========================================', 'color: #4a90d9');
        console.log('%c               Summary                 ', 'color: #4a90d9; font-weight: bold');
        console.log('%c========================================', 'color: #4a90d9');

        if (results.failed === 0) {
            console.log(`%c✓ All ${total} tests passed in ${duration}ms`, 'color: #27ae60; font-weight: bold');
        } else {
            console.log(`%c✗ ${results.failed} of ${total} tests failed in ${duration}ms`, 'color: #e74c3c; font-weight: bold');
            console.log('');
            console.log('%cFailed tests:', 'color: #e74c3c');
            for (const { suite, test, error } of results.errors) {
                console.log(`%c  • ${suite} > ${test}`, 'color: #e74c3c');
                console.log(`%c    ${error.message}`, 'color: #888');
            }
        }

        console.log('%c========================================', 'color: #4a90d9');
    }

    /**
     * Clear all registered suites (useful for re-running)
     */
    static clear() {
        suites.length = 0;
    }
}
