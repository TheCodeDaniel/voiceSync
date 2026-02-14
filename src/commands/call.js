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
 *   [M]       — toggle microphone mute
 *   [Q]       — leave the call and exit
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

  session.on('latency', (ms) => dashboard.updateLatency(ms));

  session.on('chat', ({ fromUsername, text }) => {
    dashboard.addChatMessage(fromUsername, text, false);
  });

  session.on('error', (err) => {
    logger.error(err.message);

    // Connection lost is fatal — exit gracefully instead of sitting in a dead UI
    if (err.code === 'CONN_LOST' || err.code === 'WS_ERROR') {
      dashboard.destroy();
      console.error(chalk.red(`\nDisconnected: ${err.message}\n`));
      process.exit(1);
    }

    dashboard.showMessage(chalk.red(`Error: ${err.message}`));
  });

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  const { screen } = dashboard;

  screen.key(['m', 'M'], () => {
    if (dashboard.isPromptActive()) return;
    const nowMuted = !session.isMuted;
    session.setMuted(nowMuted);
    dashboard.updateMuteState(nowMuted);
    dashboard.showMessage(nowMuted ? 'Microphone muted' : 'Microphone unmuted');
  });

  screen.key(['c', 'C'], () => {
    if (dashboard.isPromptActive()) return;
    dashboard.openChatInput((text) => {
      if (!text) return;
      session.sendChat(text);
      dashboard.addChatMessage(username, text, true);
    });
  });

  screen.key(['q', 'Q'], async () => {
    if (dashboard.isPromptActive()) return;
    dashboard.setStatus('Leaving call...');
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
    if (dashboard.isPromptActive()) return;
    dashboard.showMessage('[M] Mute  [C] Chat  [Q] Leave  [?] This help');
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
