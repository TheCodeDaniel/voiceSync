'use strict';

const chalk = require('chalk');

/** Numeric priorities for each log level. */
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };

const activeLevel = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

/**
 * Minimal structured logger.
 * Level is controlled via the LOG_LEVEL environment variable
 * (debug | info | warn | error | silent).  Defaults to "info".
 */
const logger = {
  debug: (msg, ...rest) => {
    if (activeLevel <= LEVELS.debug) console.log(chalk.gray(`[DBG] ${msg}`), ...rest);
  },
  info: (msg, ...rest) => {
    if (activeLevel <= LEVELS.info) console.log(chalk.blue(`[INF] ${msg}`), ...rest);
  },
  warn: (msg, ...rest) => {
    if (activeLevel <= LEVELS.warn) console.warn(chalk.yellow(`[WRN] ${msg}`), ...rest);
  },
  error: (msg, ...rest) => {
    if (activeLevel <= LEVELS.error) console.error(chalk.red(`[ERR] ${msg}`), ...rest);
  },
};

module.exports = logger;
