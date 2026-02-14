'use strict';

const chalk = require('chalk');

/** Numeric priorities for each log level. */
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };

const activeLevel = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

let _suppressed = false;

/**
 * Minimal structured logger.
 * Level is controlled via the LOG_LEVEL environment variable
 * (debug | info | warn | error | silent).  Defaults to "info".
 *
 * Call logger.suppress(true) to silence all output while blessed UI is active.
 */
const logger = {
  suppress: (on) => { _suppressed = on; },
  debug: (msg, ...rest) => {
    if (_suppressed || activeLevel > LEVELS.debug) return;
    console.log(chalk.gray(`[DBG] ${msg}`), ...rest);
  },
  info: (msg, ...rest) => {
    if (_suppressed || activeLevel > LEVELS.info) return;
    console.log(chalk.blue(`[INF] ${msg}`), ...rest);
  },
  warn: (msg, ...rest) => {
    if (_suppressed || activeLevel > LEVELS.warn) return;
    console.warn(chalk.yellow(`[WRN] ${msg}`), ...rest);
  },
  error: (msg, ...rest) => {
    if (_suppressed || activeLevel > LEVELS.error) return;
    console.error(chalk.red(`[ERR] ${msg}`), ...rest);
  },
};

module.exports = logger;
