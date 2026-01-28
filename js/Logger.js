/**
 * Debug logging system with toggleable output
 *
 * Usage:
 *   import { Logger } from './Logger.js';
 *   const log = Logger.create('ModuleName');
 *   log.debug('message');  // Only shows when debug is enabled
 *   log.info('message');   // Shows when info level or lower
 *   log.warn('message');   // Shows when warn level or lower
 *   log.error('message');  // Always shows
 *
 * Configure via:
 *   Logger.setLevel('debug');  // Show all messages
 *   Logger.setLevel('info');   // Hide debug messages
 *   Logger.setLevel('warn');   // Hide debug and info
 *   Logger.setLevel('error');  // Only errors
 *   Logger.setLevel('none');   // Silence all
 *
 *   Logger.enableModule('JobManager');  // Enable specific module
 *   Logger.disableModule('JobManager'); // Disable specific module
 */

const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    none: 4
};

// Global logging state
let currentLevel = LOG_LEVELS.info; // Default: show info and above
const enabledModules = new Set();   // If empty, all modules enabled
const disabledModules = new Set();  // Explicitly disabled modules

// Performance tracking
const performanceMarks = new Map();

export class Logger {
    constructor(moduleName) {
        this.moduleName = moduleName;
        this.prefix = `[${moduleName}]`;
    }

    /**
     * Create a logger instance for a module
     * @param {string} moduleName - Name of the module for log prefixing
     * @returns {Logger} Logger instance
     */
    static create(moduleName) {
        return new Logger(moduleName);
    }

    /**
     * Set the global log level
     * @param {string} level - 'debug', 'info', 'warn', 'error', or 'none'
     */
    static setLevel(level) {
        if (LOG_LEVELS.hasOwnProperty(level)) {
            currentLevel = LOG_LEVELS[level];
            console.log(`[Logger] Log level set to: ${level}`);
        } else {
            console.warn(`[Logger] Invalid log level: ${level}`);
        }
    }

    /**
     * Get the current log level name
     * @returns {string} Current log level
     */
    static getLevel() {
        for (const [name, value] of Object.entries(LOG_LEVELS)) {
            if (value === currentLevel) return name;
        }
        return 'unknown';
    }

    /**
     * Enable logging for a specific module only
     * @param {string} moduleName - Module to enable
     */
    static enableModule(moduleName) {
        enabledModules.add(moduleName);
        disabledModules.delete(moduleName);
    }

    /**
     * Disable logging for a specific module
     * @param {string} moduleName - Module to disable
     */
    static disableModule(moduleName) {
        disabledModules.add(moduleName);
        enabledModules.delete(moduleName);
    }

    /**
     * Clear all module filters (enable all modules)
     */
    static clearModuleFilters() {
        enabledModules.clear();
        disabledModules.clear();
    }

    /**
     * Check if a module's logging is enabled
     */
    _isModuleEnabled() {
        // If module is explicitly disabled, return false
        if (disabledModules.has(this.moduleName)) return false;
        // If specific modules are enabled, check if this one is
        if (enabledModules.size > 0) return enabledModules.has(this.moduleName);
        // Otherwise, all modules are enabled
        return true;
    }

    /**
     * Check if a log level should be output
     */
    _shouldLog(level) {
        return LOG_LEVELS[level] >= currentLevel && this._isModuleEnabled();
    }

    /**
     * Debug level logging (most verbose)
     */
    debug(...args) {
        if (this._shouldLog('debug')) {
            console.log(this.prefix, ...args);
        }
    }

    /**
     * Info level logging
     */
    info(...args) {
        if (this._shouldLog('info')) {
            console.info(this.prefix, ...args);
        }
    }

    /**
     * Warning level logging
     */
    warn(...args) {
        if (this._shouldLog('warn')) {
            console.warn(this.prefix, ...args);
        }
    }

    /**
     * Error level logging (always shown unless level is 'none')
     */
    error(...args) {
        if (this._shouldLog('error')) {
            console.error(this.prefix, ...args);
        }
    }

    /**
     * Log a group of related messages (collapsible in console)
     */
    group(label) {
        if (this._shouldLog('debug')) {
            console.group(`${this.prefix} ${label}`);
        }
    }

    groupEnd() {
        if (this._shouldLog('debug')) {
            console.groupEnd();
        }
    }

    /**
     * Start a performance measurement
     * @param {string} label - Unique label for this measurement
     */
    timeStart(label) {
        if (this._shouldLog('debug')) {
            const key = `${this.moduleName}:${label}`;
            performanceMarks.set(key, performance.now());
        }
    }

    /**
     * End a performance measurement and log the result
     * @param {string} label - Label used in timeStart
     */
    timeEnd(label) {
        if (this._shouldLog('debug')) {
            const key = `${this.moduleName}:${label}`;
            const startTime = performanceMarks.get(key);
            if (startTime) {
                const duration = performance.now() - startTime;
                console.log(`${this.prefix} ${label}: ${duration.toFixed(2)}ms`);
                performanceMarks.delete(key);
            }
        }
    }

    /**
     * Log with a table format (for arrays/objects)
     */
    table(data) {
        if (this._shouldLog('debug')) {
            console.log(this.prefix);
            console.table(data);
        }
    }

    /**
     * Assert a condition and log error if false
     */
    assert(condition, ...args) {
        if (!condition && this._shouldLog('error')) {
            console.error(this.prefix, 'Assertion failed:', ...args);
        }
    }
}

// Export a default logger for quick use
export const log = Logger.create('Game');

// Production mode helper - call this to silence most logs
export function setProductionMode() {
    Logger.setLevel('warn');
}

// Development mode helper - call this for verbose logging
export function setDevelopmentMode() {
    Logger.setLevel('debug');
}
