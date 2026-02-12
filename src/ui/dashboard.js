'use strict';

const blessed = require('blessed');
const { generateWaveform, silentWaveform } = require('./waveform');

/**
 * @typedef {Object} Participant
 * @property {string}  peerId
 * @property {string}  username
 * @property {boolean} isSpeaking
 * @property {boolean} isMuted
 * @property {boolean} isSelf
 */

/**
 * @typedef {Object} Dashboard
 * @property {Function} render               - Force a full re-render
 * @property {Function} updateParticipants   - (Participant[]) => void
 * @property {Function} updateWaveform       - (Float32Array) => void
 * @property {Function} showMessage          - (string) => void  — transient status bar message
 * @property {Function} setStatus            - (string) => void  — persistent status bar text
 * @property {Function} promptInvite         - (callback: (username: string|null) => void) => void
 * @property {Function} destroy              - Tear down the blessed screen
 * @property {blessed.Widgets.Screen} screen
 */

/**
 * Creates the in-call blessed dashboard.
 *
 * Layout:
 *   ┌─ title ──────────────────────────────────────────────────────┐
 *   │ Participants          │ Audio Waveform                       │
 *   │                       │                                      │
 *   ├───────────────────────┴──────────────────────────────────────┤
 *   │ status message                                               │
 *   │ shortcut bar                                                 │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * @param {Object} opts
 * @param {string} opts.username - Local user's display name
 * @param {string} opts.roomKey  - Active room key
 * @returns {Dashboard}
 */
function createDashboard({ username, roomKey }) {
  const screen = blessed.screen({
    smartCSR: true,
    title: 'VoiceSync',
    fullUnicode: true,
    forceUnicode: true,
    dockBorders: true,
  });

  // ── Title bar ──────────────────────────────────────────────────────────────
  blessed.box({
    parent: screen,
    top: 0, left: 0, right: 0, height: 1,
    content: ` VoiceSync  │  Room: ${roomKey}  │  You: ${username}`,
    style: { fg: 'cyan', bold: true, bg: 'black' },
  });

  // ── Participant list ───────────────────────────────────────────────────────
  const participantBox = blessed.box({
    parent: screen,
    label: ' Participants ',
    top: 1, left: 0, width: '40%', bottom: 3,
    border: { type: 'line' },
    style: { border: { fg: 'cyan' }, label: { fg: 'cyan', bold: true } },
    scrollable: true,
    alwaysScroll: true,
    tags: true,
    padding: { left: 1 },
  });

  // ── Waveform box ──────────────────────────────────────────────────────────
  const waveformBox = blessed.box({
    parent: screen,
    label: ' Your Audio ',
    top: 1, left: '40%', right: 0, bottom: 3,
    border: { type: 'line' },
    style: { border: { fg: 'magenta' }, label: { fg: 'magenta', bold: true } },
    tags: true,
    padding: { left: 1, top: 1 },
  });

  // ── Invite input overlay (hidden by default) ───────────────────────────────
  const invitePrompt = blessed.prompt({
    parent: screen,
    border: 'line',
    height: 'shrink',
    width: '50%',
    top: 'center',
    left: 'center',
    label: ' {bold}Invite User{/bold} ',
    tags: true,
    keys: true,
    vi: true,
    style: { border: { fg: 'yellow' }, label: { fg: 'yellow' } },
  });

  // ── Status / transient message bar ────────────────────────────────────────
  const statusBar = blessed.box({
    parent: screen,
    bottom: 1, left: 0, right: 0, height: 1,
    content: '',
    style: { fg: 'yellow', bg: 'black' },
    tags: true,
  });

  // ── Shortcut bar ─────────────────────────────────────────────────────────
  blessed.box({
    parent: screen,
    bottom: 0, left: 0, right: 0, height: 1,
    content: ' [I] Invite  [M] Mute/Unmute  [Q] Leave  [?] Help',
    style: { fg: 'black', bg: 'cyan', bold: true },
  });

  // ── Internal state ────────────────────────────────────────────────────────
  /** @type {Participant[]} */
  let participants = [];
  let currentWaveform = silentWaveform();
  let statusTimer = null;

  // ── Render helpers ────────────────────────────────────────────────────────

  function renderParticipants() {
    if (participants.length === 0) {
      participantBox.setContent('{gray-fg}  Waiting for others to join…{/gray-fg}');
      return;
    }
    const lines = participants.map((p) => {
      const dot = p.isSpeaking ? '{green-fg}●{/green-fg}' : '{gray-fg}○{/gray-fg}';
      const name = p.isSelf ? `{bold}${p.username}{/bold} {cyan-fg}(you){/cyan-fg}` : p.username;
      const muteBadge = p.isMuted ? ' {red-fg}[muted]{/red-fg}' : '';
      const speakBadge = p.isSpeaking && !p.isSelf ? ' {green-fg}[speaking]{/green-fg}' : '';
      return ` ${dot} ${name}${muteBadge}${speakBadge}`;
    });
    participantBox.setContent(lines.join('\n'));
  }

  function renderWaveform() {
    // Fill the available inner height with the same waveform row for visual impact
    const innerHeight = Math.max(1, (waveformBox.height || 6) - 4);
    const rows = Array(innerHeight).fill(`{magenta-fg}${currentWaveform}{/magenta-fg}`);
    waveformBox.setContent(rows.join('\n'));
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  function render() {
    renderParticipants();
    renderWaveform();
    screen.render();
  }

  function updateParticipants(newParticipants) {
    participants = newParticipants;
    renderParticipants();
    screen.render();
  }

  function updateWaveform(samples) {
    currentWaveform = generateWaveform(samples);
    renderWaveform();
    screen.render();
  }

  function showMessage(msg) {
    clearTimeout(statusTimer);
    statusBar.setContent(` ${msg}`);
    screen.render();
    statusTimer = setTimeout(() => {
      statusBar.setContent('');
      screen.render();
    }, 4000);
  }

  function setStatus(text) {
    clearTimeout(statusTimer);
    statusBar.setContent(` ${text}`);
    screen.render();
  }

  /**
   * Opens the invite prompt overlay.
   * @param {(username: string|null) => void} callback
   */
  function promptInvite(callback) {
    invitePrompt.input('Enter username to invite:', '', (err, value) => {
      screen.render();
      callback(err || !value ? null : value.trim());
    });
  }

  function destroy() {
    clearTimeout(statusTimer);
    screen.destroy();
  }

  // Initial render
  render();

  return { render, updateParticipants, updateWaveform, showMessage, setStatus, promptInvite, destroy, screen };
}

module.exports = { createDashboard };
