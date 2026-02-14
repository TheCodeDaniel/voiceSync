'use strict';

const blessed = require('blessed');
// waveform.js is no longer used for the main display — compact mini waveform
// is rendered inline in the status bar. Keeping the require commented out
// in case it's needed for future features.
// const { generateWaveform, silentWaveform, BAR_COUNT } = require('./waveform');
const logger = require('../utils/logger');

/**
 * @typedef {Object} Participant
 * @property {string}  peerId
 * @property {string}  username
 * @property {boolean} isSpeaking
 * @property {boolean} isMuted
 * @property {boolean} isSelf
 */

/** Compact waveform: 8 bars using block characters for the status bar. */
const MINI_BARS = [' ', '\u2581', '\u2582', '\u2583', '\u2584', '\u2585', '\u2586', '\u2587', '\u2588'];
const MINI_BAR_COUNT = 12;

function miniWaveform(audioLevel) {
  if (audioLevel <= 0) return '\u2581'.repeat(MINI_BAR_COUNT);
  const bars = [];
  for (let i = 0; i < MINI_BAR_COUNT; i++) {
    // Create a natural-looking wave shape centered on the audio level
    const dist = Math.abs(i - MINI_BAR_COUNT / 2) / (MINI_BAR_COUNT / 2);
    const amplitude = audioLevel * (1 - dist * 0.6) * (0.7 + Math.random() * 0.3);
    const clamped = Math.max(0, Math.min(1, amplitude));
    bars.push(MINI_BARS[Math.round(clamped * (MINI_BARS.length - 1))]);
  }
  return bars.join('');
}

/**
 * Creates the in-call blessed dashboard.
 *
 * Layout:
 *   ┌─ VoiceSync | Room: XXX-XXX-XXX | You: alice ──────────────────┐
 *   │                                                                 │
 *   │  ┌─ Participants ──┐  ┌─ Chat ─────────────────────────────┐   │
 *   │  │  * alice (you)  │  │  bob: hey everyone!                │   │
 *   │  │  o bob          │  │  alice: hello!                     │   │
 *   │  └─────────────────┘  └────────────────────────────────────┘   │
 *   │                                                                 │
 *   │  * MIC ON  ▁▂▃▅▆▇▅▃▂▁  Latency: 23ms  Quality: Excellent     │
 *   │                                                                 │
 *   │  [M] Mute   [C] Chat   [Q] Leave   [?] Help                    │
 *   └────────────────────────────────────────────────────────────────┘
 *
 * @param {Object} opts
 * @param {string} opts.username - Local user's display name
 * @param {string} opts.roomKey  - Active room key
 * @returns {Object} Dashboard API
 */
function createDashboard({ username, roomKey }) {
  // Clean up orphaned readline/inquirer listeners that cause double-typing
  process.stdin.removeAllListeners('data');
  process.stdin.removeAllListeners('keypress');

  // Suppress all logger output while the blessed UI is active
  logger.suppress(true);

  const screen = blessed.screen({
    smartCSR: true,
    title: 'VoiceSync',
    fullUnicode: true,
    forceUnicode: true,
    dockBorders: true,
    mouse: false,
    sendFocus: false,
  });

  // Disable mouse tracking entirely at the terminal level
  screen.program.disableMouse();
  screen._listenedMouse = true;

  // Intercept raw terminal input to discard mouse escape sequences
  if (screen.program.input) {
    const origEmit = screen.program.input.emit.bind(screen.program.input);

    screen.program.input.emit = function (event, ...args) {
      if (event !== 'data') return origEmit(event, ...args);

      const raw = args[0];
      if (typeof raw !== 'string' && !Buffer.isBuffer(raw)) return origEmit(event, ...args);

      const str = typeof raw === 'string' ? raw : raw.toString('binary');
      let filtered = '';

      for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);

        if (code === 0x1b && i + 2 < str.length && str[i + 1] === '[') {
          const third = str[i + 2];
          if (third === 'M') { i += 5; continue; }
          if (third === '<') {
            let j = i + 3;
            while (j < str.length && str[j] !== 'M' && str[j] !== 'm') j++;
            i = j;
            continue;
          }
        }

        filtered += str[i];
      }

      if (filtered.length > 0) {
        return origEmit(event, filtered);
      }
    };
  }

  // ── Title bar ──────────────────────────────────────────────────────────────
  blessed.box({
    parent: screen,
    top: 0, left: 0, right: 0, height: 1,
    content: `  VoiceSync  {gray-fg}|{/gray-fg}  Room: {bold}${roomKey}{/bold}  {gray-fg}|{/gray-fg}  You: {bold}${username}{/bold}`,
    style: { fg: 'white', bg: 'blue' },
    tags: true,
  });

  // ── Participant list ───────────────────────────────────────────────────────
  const participantBox = blessed.box({
    parent: screen,
    label: ' {bold}Participants{/bold} ',
    top: 2, left: 1, width: '30%-1', bottom: 5,
    border: { type: 'line' },
    style: { border: { fg: 'blue' }, label: { fg: 'blue' } },
    scrollable: true,
    alwaysScroll: true,
    tags: true,
    padding: { left: 1 },
  });

  // ── Chat box (replaces the old Audio waveform box) ─────────────────────────
  const chatBox = blessed.box({
    parent: screen,
    label: ' {bold}Chat{/bold} ',
    top: 2, left: '30%', right: 1, bottom: 5,
    border: { type: 'line' },
    style: { border: { fg: 'blue' }, label: { fg: 'blue' } },
    scrollable: true,
    alwaysScroll: true,
    tags: true,
    padding: { left: 1, right: 1 },
  });

  // ── Chat input (hidden by default, shown when C is pressed) ────────────────
  const chatInput = blessed.textbox({
    parent: screen,
    bottom: 5, left: '30%', right: 1, height: 3,
    border: { type: 'line' },
    style: { border: { fg: 'yellow' }, fg: 'white' },
    label: ' {bold}Type message (Enter to send, Esc to cancel){/bold} ',
    tags: true,
    keys: false,
    vi: false,
    hidden: true,
    inputOnFocus: false,
  });

  // ── Status bar (mute + waveform + latency + quality) ───────────────────────
  const statusInfoBar = blessed.box({
    parent: screen,
    bottom: 3, left: 1, right: 1, height: 1,
    content: '',
    style: { fg: 'white', bg: 'black' },
    tags: true,
  });

  // ── Message bar ─────────────────────────────────────────────────────────────
  const messageBar = blessed.box({
    parent: screen,
    bottom: 2, left: 1, right: 1, height: 1,
    content: '',
    style: { fg: 'yellow', bg: 'black' },
    tags: true,
  });

  // ── Shortcut bar ─────────────────────────────────────────────────────────
  blessed.box({
    parent: screen,
    bottom: 0, left: 0, right: 0, height: 2,
    content: '  {bold}[M]{/bold} Mute    {bold}[C]{/bold} Chat    {bold}[Q]{/bold} Leave    {bold}[?]{/bold} Help',
    style: { fg: 'white', bg: '#333333' },
    tags: true,
  });

  // ── Internal state ────────────────────────────────────────────────────────
  /** @type {Participant[]} */
  let participants = [];
  let messageTimer = null;
  let _promptActive = false;
  let _lastWaveformRender = 0;
  let _isMuted = false;
  let _latencyMs = -1;
  let _audioLevel = 0;
  const WAVEFORM_THROTTLE_MS = 80;

  /** @type {Array<{from: string, text: string, self: boolean}>} */
  const chatMessages = [];

  // ── Render helpers ────────────────────────────────────────────────────────

  function renderParticipants() {
    if (participants.length === 0) {
      participantBox.setContent('\n  {gray-fg}Waiting for others...{/gray-fg}');
      return;
    }
    const lines = participants.map((p) => {
      const icon = p.isMuted
        ? '{red-fg}x{/red-fg}'
        : p.isSpeaking
          ? '{green-fg}*{/green-fg}'
          : '{gray-fg}o{/gray-fg}';

      const name = p.isSelf
        ? `{bold}{cyan-fg}${p.username}{/cyan-fg}{/bold} {gray-fg}(you){/gray-fg}`
        : `{white-fg}${p.username}{/white-fg}`;

      const badge = p.isMuted
        ? ' {red-fg}MUTED{/red-fg}'
        : p.isSpeaking && !p.isSelf
          ? ' {green-fg}LIVE{/green-fg}'
          : '';

      return `  ${icon} ${name}${badge}`;
    });
    participantBox.setContent('\n' + lines.join('\n'));
  }

  function renderChat() {
    if (chatMessages.length === 0) {
      chatBox.setContent('\n  {gray-fg}No messages yet. Press [C] to chat.{/gray-fg}');
      return;
    }

    const lines = chatMessages.map((m) => {
      const nameColor = m.self ? 'cyan' : 'yellow';
      return `{${nameColor}-fg}{bold}${m.from}{/bold}{/${nameColor}-fg}: ${m.text}`;
    });
    chatBox.setContent(lines.join('\n'));

    // Auto-scroll to bottom
    chatBox.setScrollPerc(100);
  }

  function renderStatusBar() {
    // Mute indicator
    const muteIcon = _isMuted
      ? '{red-fg}{bold} x MIC OFF {/bold}{/red-fg}'
      : '{green-fg}{bold} * MIC ON  {/bold}{/green-fg}';

    // Compact waveform indicator
    let waveColor = 'gray';
    let waveStr = miniWaveform(0);
    if (_isMuted) {
      waveColor = 'red';
      waveStr = '\u2581'.repeat(MINI_BAR_COUNT);
    } else if (_audioLevel > 0) {
      waveColor = _audioLevel > 0.3 ? 'cyan' : _audioLevel > 0.1 ? 'green' : 'gray';
      waveStr = miniWaveform(_audioLevel * 3);
    }
    const waveIndicator = `{${waveColor}-fg}${waveStr}{/${waveColor}-fg}`;

    // Latency indicator with color coding
    let latencyStr;
    if (_latencyMs < 0) {
      latencyStr = '{gray-fg}Latency: --{/gray-fg}';
    } else if (_latencyMs < 80) {
      latencyStr = `{green-fg}${_latencyMs}ms{/green-fg}`;
    } else if (_latencyMs < 200) {
      latencyStr = `{yellow-fg}${_latencyMs}ms{/yellow-fg}`;
    } else {
      latencyStr = `{red-fg}${_latencyMs}ms{/red-fg}`;
    }

    // Audio quality based on latency
    let qualityStr;
    if (_latencyMs < 0) {
      qualityStr = '{gray-fg}--{/gray-fg}';
    } else if (_latencyMs < 80) {
      qualityStr = '{green-fg}Excellent{/green-fg}';
    } else if (_latencyMs < 150) {
      qualityStr = '{green-fg}Good{/green-fg}';
    } else if (_latencyMs < 300) {
      qualityStr = '{yellow-fg}Fair{/yellow-fg}';
    } else {
      qualityStr = '{red-fg}Poor{/red-fg}';
    }

    const peerCount = participants.length;

    statusInfoBar.setContent(
      ` ${muteIcon}  ${waveIndicator}  {gray-fg}|{/gray-fg}  Ping: ${latencyStr}  {gray-fg}|{/gray-fg}  Quality: ${qualityStr}  {gray-fg}|{/gray-fg}  {cyan-fg}${peerCount} in call{/cyan-fg}`
    );
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  function render() {
    renderParticipants();
    renderChat();
    renderStatusBar();
    screen.render();
  }

  function updateParticipants(newParticipants) {
    participants = newParticipants;
    renderParticipants();
    renderStatusBar();
    screen.render();
  }

  function updateWaveform(samples) {
    if (_promptActive) return;

    const now = Date.now();
    if (now - _lastWaveformRender < WAVEFORM_THROTTLE_MS) return;
    _lastWaveformRender = now;

    // Calculate audio level for the compact waveform in status bar
    if (samples && samples.length > 0) {
      _audioLevel = Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length);
    } else {
      _audioLevel = 0;
    }

    renderStatusBar();
    screen.render();
  }

  function updateLatency(ms) {
    _latencyMs = ms;
    renderStatusBar();
    screen.render();
  }

  function updateMuteState(muted) {
    _isMuted = muted;
    renderStatusBar();
    screen.render();
  }

  function addChatMessage(fromUsername, text, isSelf) {
    chatMessages.push({ from: fromUsername, text, self: isSelf });
    // Keep last 200 messages
    if (chatMessages.length > 200) chatMessages.shift();
    renderChat();
    screen.render();
  }

  /**
   * Opens the chat input box for typing a message.
   * @param {(text: string|null) => void} callback
   */
  function openChatInput(callback) {
    _promptActive = true;
    chatInput.show();
    chatInput.focus();
    chatInput.setValue('');
    screen.render();

    chatInput.readInput((err, value) => {
      _promptActive = false;
      chatInput.hide();
      screen.render();
      if (err || !value || !value.trim()) {
        callback(null);
      } else {
        callback(value.trim());
      }
    });
  }

  function showMessage(msg) {
    clearTimeout(messageTimer);
    messageBar.setContent(` ${msg}`);
    screen.render();
    messageTimer = setTimeout(() => {
      messageBar.setContent('');
      screen.render();
    }, 4000);
  }

  function setStatus(text) {
    clearTimeout(messageTimer);
    messageBar.setContent(` ${text}`);
    screen.render();
  }

  function isPromptActive() {
    return _promptActive;
  }

  function destroy() {
    clearTimeout(messageTimer);
    logger.suppress(false);
    screen.destroy();
  }

  // Initial render
  render();

  return {
    render,
    updateParticipants,
    updateWaveform,
    updateLatency,
    updateMuteState,
    addChatMessage,
    openChatInput,
    showMessage,
    setStatus,
    isPromptActive,
    destroy,
    screen,
  };
}

module.exports = { createDashboard };
