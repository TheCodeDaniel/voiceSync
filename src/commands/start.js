'use strict';

const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const { Session } = require('../client/session');
const { runCallUI } = require('./call');
const theme = require('../ui/theme');

const DEFAULT_SERVER = process.env.VOICESYNC_SERVER || 'ws://localhost:3000';

/**
 * `voicesync start` command handler.
 *
 * Prompts for any missing options, connects to the signaling server,
 * creates a new room, displays the sharable room key, and then launches
 * the interactive in-call dashboard.
 *
 * @param {Object} opts
 * @param {string} [opts.server]   - Signaling server URL
 * @param {string} [opts.username] - Display name
 */
async function runStart(opts) {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'server',
      message: 'Signaling server URL:',
      default: DEFAULT_SERVER,
      when: !opts.server,
    },
    {
      type: 'input',
      name: 'username',
      message: 'Your display name:',
      when: !opts.username,
      validate: (v) => v.trim().length > 0 || 'Username cannot be empty.',
    },
  ]);

  const serverUrl = opts.server || answers.server || DEFAULT_SERVER;
  const username = (opts.username || answers.username).trim();

  const session = new Session(serverUrl, username);
  const spinner = ora('Connecting to signaling server…').start();

  try {
    await session.connect();
    spinner.text = 'Creating room…';
    const roomKey = await session.createRoom();
    spinner.succeed(chalk.green('Room created!'));

    printRoomBanner(roomKey);
    await runCallUI(session, roomKey, username);
  } catch (err) {
    spinner.fail(chalk.red(err.message));
    process.exit(1);
  }
}

/**
 * Prints the styled room key banner to stdout before entering the dashboard.
 * @param {string} roomKey
 */
function printRoomBanner(roomKey) {
  const divider = theme.title('═'.repeat(42));
  console.log('\n' + divider);
  console.log(theme.title('  VoiceSync — Room Ready'));
  console.log(divider);
  console.log(`  Room Key : ${theme.roomKey(roomKey)}`);
  console.log(theme.muted('  Share this key so others can join with:'));
  console.log(theme.muted(`    voicesync join ${roomKey}`));
  console.log(divider + '\n');
}

module.exports = { runStart };
