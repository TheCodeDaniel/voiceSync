'use strict';

const { Command } = require('commander');
const chalk = require('chalk');
const { version } = require('../../package.json');

const { runServer } = require('../commands/server');
const { runStart } = require('../commands/start');
const { runJoin } = require('../commands/join');

/**
 * Builds and returns the root Commander program.
 *
 * Commands:
 *   voicesync server  — start the signaling server
 *   voicesync start   — create and host a new voice room
 *   voicesync join    — join an existing room by key
 *
 * @returns {import('commander').Command}
 */
function buildProgram() {
  const program = new Command();

  program
    .name('voicesync')
    .description('Terminal-based real-time voice communication')
    .version(version, '-v, --version')
    .addHelpText('after', `
Examples:
  $ voicesync server                  Start the signaling server on port 3000
  $ voicesync server -p 4000          Start on a custom port
  $ voicesync start -u alice          Create a room as "alice"
  $ voicesync join ABC-DEF-GHJ        Join room ABC-DEF-GHJ (prompts for name)
`);

  // ── server ──────────────────────────────────────────────────────────────────
  program
    .command('server')
    .description('Start the VoiceSync signaling server')
    .option('-p, --port <port>', 'Port to listen on', parsePort, 3000)
    .option('-H, --host <host>', 'Host to bind to', '0.0.0.0')
    .action((opts) => runServer(opts));

  // ── start ───────────────────────────────────────────────────────────────────
  program
    .command('start')
    .description('Create a new voice room and share the key with others')
    .option('-s, --server <url>', 'Signaling server URL (overrides VOICESYNC_SERVER env var)')
    .option('-u, --username <name>', 'Your display name')
    .action((opts) => runStart(opts).catch(fatalError));

  // ── join ────────────────────────────────────────────────────────────────────
  program
    .command('join [roomKey]')
    .description('Join an existing voice room by its key')
    .option('-s, --server <url>', 'Signaling server URL (overrides VOICESYNC_SERVER env var)')
    .option('-u, --username <name>', 'Your display name')
    .action((roomKey, opts) => runJoin(opts, roomKey).catch(fatalError));

  return program;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Commander option parser for integer ports with range validation.
 * @param {string} value
 * @returns {number}
 */
function parsePort(value) {
  const n = parseInt(value, 10);
  if (isNaN(n) || n < 1 || n > 65535) {
    console.error(chalk.red(`Invalid port: "${value}" — must be 1–65535`));
    process.exit(1);
  }
  return n;
}

/**
 * Prints a fatal error and exits with code 1.
 * @param {Error} err
 */
function fatalError(err) {
  console.error(chalk.red(`\nFatal: ${err.message}`));
  process.exit(1);
}

module.exports = { buildProgram };
