'use strict';

const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const { Session } = require('../client/session');
const { runCallUI } = require('./call');
const { isValidRoomKey, normaliseRoomKey } = require('../utils/roomKey');
const theme = require('../ui/theme');

const DEFAULT_SERVER = process.env.VOICESYNC_SERVER || 'ws://localhost:3000';

/**
 * `voicesync join [roomKey]` command handler.
 *
 * Prompts for any missing information (room key, username, server URL),
 * connects to the signaling server, joins the specified room, and launches
 * the interactive in-call dashboard.
 *
 * @param {Object}      opts
 * @param {string}      [opts.server]   - Signaling server URL
 * @param {string}      [opts.username] - Display name
 * @param {string|undefined} roomKeyArg - Room key passed as CLI argument
 */
async function runJoin(opts, roomKeyArg) {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'roomKey',
      message: 'Room key to join:',
      when: !roomKeyArg,
      validate: (v) => isValidRoomKey(v) || 'Invalid room key format (e.g. ABC-DEF-GHJ).',
    },
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

  const rawKey = roomKeyArg || answers.roomKey;
  const roomKey = normaliseRoomKey(rawKey);

  if (!isValidRoomKey(roomKey)) {
    console.error(theme.error(`Invalid room key: "${roomKey}"`));
    process.exit(1);
  }

  const serverUrl = opts.server || answers.server || DEFAULT_SERVER;
  const username = (opts.username || answers.username).trim();

  const session = new Session(serverUrl, username);
  const spinner = ora('Connecting to signaling server…').start();

  try {
    await session.connect();
    spinner.text = `Joining room ${theme.roomKey(roomKey)}…`;
    await session.joinRoom(roomKey);
    spinner.succeed(chalk.green(`Joined room ${roomKey}!`));

    console.log(`\n  ${theme.muted('Room:')} ${theme.roomKey(roomKey)}\n`);
    await runCallUI(session, roomKey, username);
  } catch (err) {
    spinner.fail(chalk.red(err.message));
    process.exit(1);
  }
}

module.exports = { runJoin };
