'use strict';

const chalk = require('chalk');
const ora = require('ora');
const { createServer } = require('../server/app');
const logger = require('../utils/logger');

/**
 * Starts the VoiceSync signaling server and keeps it running until
 * the process receives SIGINT (Ctrl+C).
 *
 * @param {Object} opts
 * @param {number} opts.port - TCP port to listen on
 * @param {string} opts.host - Hostname / IP to bind to
 */
function runServer({ port, host }) {
  const spinner = ora('Starting VoiceSync signaling server…').start();
  const { httpServer } = createServer();

  httpServer.listen(port, host, () => {
    spinner.succeed(chalk.green(`Signaling server listening on ws://${host}:${port}`));
    console.log(chalk.gray('  Health:  ') + chalk.cyan(`http://${host}:${port}/health`));
    console.log(chalk.gray('  Press Ctrl+C to stop.\n'));
  });

  httpServer.on('error', (err) => {
    spinner.fail(chalk.red(`Server error: ${err.message}`));
    process.exit(1);
  });

  process.on('SIGINT', () => {
    console.log(chalk.yellow('\nShutting down server…'));
    httpServer.close(() => {
      console.log(chalk.green('Server stopped.'));
      process.exit(0);
    });
  });
}

module.exports = { runServer };
