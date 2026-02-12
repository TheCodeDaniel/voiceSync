'use strict';

const chalk = require('chalk');

/**
 * Centralised colour/style helpers used throughout the CLI output.
 * Importing from one place keeps every piece of styled text consistent.
 */
module.exports = {
  /** Section titles and borders */
  title: chalk.bold.cyan,
  /** Positive confirmations */
  success: chalk.bold.green,
  /** Fatal or blocking errors */
  error: chalk.bold.red,
  /** Non-fatal warnings */
  warning: chalk.yellow,
  /** General informational text */
  info: chalk.blue,
  /** Dimmed / secondary text */
  muted: chalk.gray,
  /** Bold white — primary emphasis */
  highlight: chalk.bold.white,
  /** The sharable room key */
  roomKey: chalk.bold.magenta,
  /** A participant who is actively speaking */
  speaking: chalk.bold.green,
  /** A participant who is muted */
  mutedLabel: chalk.bold.red,
  /** A participant's display name */
  username: chalk.bold.white,
};
