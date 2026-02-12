'use strict';

const chalk = require('chalk');
const { createDashboard } = require('../ui/dashboard');
const logger = require('../utils/logger');

/**
 * Runs the interactive in-call blessed dashboard for an active Session.
 *
 * This function is shared by both `start` and `join` commands so the UI
 * behaviour is always identical regardless of how the call was initiated.
 *
 * Keyboard shortcuts handled here:
 *   [I]       — open invite prompt
 *   [M]       — toggle microphone mute
 *   [Q / Esc] — leave the call and exit
 *   [?]       — show shortcut reminder in status bar
 *   [Ctrl+C]  — emergency exit
 *
 * @param {import('../client/session').Session} session - Active, connected session
 * @param {string} roomKey
 * @param {string} username
 * @returns {Promise<void>} Resolves when the call ends
 */
async function runCallUI(session, roomKey, username) {
  const dashboard = createDashboard({ username, roomKey });

  // ── Forward session events to dashboard ───────────────────────────────────

  session.on('audio-samples', (samples) => dashboard.updateWaveform(samples));

  session.on('participant-update', (participants) => dashboard.updateParticipants(participants));

  session.on('invite', ({ fromUsername }) => {
    // User is already in a call; just surface the notification
    dashboard.showMessage(
      chalk.yellow(`Invite from ${fromUsername} (you are already in a call)`),
    );
  });

  session.on('invite-sent', ({ toUsername }) => {
    dashboard.showMessage(chalk.green(`Invite sent to ${toUsername}`));
  });

  session.on('invite-error', (message) => {
    dashboard.showMessage(chalk.red(`Invite error: ${message}`));
  });

  session.on('error', (err) => {
    logger.error(err.message);
    dashboard.showMessage(chalk.red(`Error: ${err.message}`));
  });

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  const { screen } = dashboard;

  screen.key(['i', 'I'], () => {
    dashboard.promptInvite((targetUsername) => {
      if (!targetUsername) return;
      session.inviteUser(targetUsername).catch((err) => {
        dashboard.showMessage(chalk.red(`Invite failed: ${err.message}`));
      });
    });
  });

  screen.key(['m', 'M'], () => {
    const nowMuted = !session.isMuted;
    session.setMuted(nowMuted);
    dashboard.showMessage(nowMuted ? 'Microphone muted' : 'Microphone unmuted');
  });

  screen.key(['q', 'Q', 'escape'], async () => {
    dashboard.setStatus('Leaving call…');
    await session.leave();
    dashboard.destroy();
    console.log(chalk.yellow('\nYou left the call. Goodbye!\n'));
    process.exit(0);
  });

  screen.key(['C-c'], async () => {
    await session.leave();
    dashboard.destroy();
    process.exit(0);
  });

  screen.key(['?'], () => {
    dashboard.showMessage('[I] Invite  [M] Mute/Unmute  [Q] Leave  [?] This help');
  });

  // ── Wait for the call to end ───────────────────────────────────────────────

  return new Promise((resolve) => {
    session.once('ended', () => {
      dashboard.destroy();
      resolve();
    });
  });
}

module.exports = { runCallUI };
