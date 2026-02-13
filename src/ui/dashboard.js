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
 * Creates the in-call blessed dashboard.
 *
 * Layout:
 *   ┌─ VoiceSync | Room: XXX-XXX-XXX | You: alice ──────────────────┐
 *   │                                                                 │
 *   │  ┌─ Participants ──┐  ┌─ Audio ──────────────────────────────┐ │
 *   │  │  ● alice (you)  │  │  ▁▂▃▅▆▇█▇▆▅▃▂▁▁▂▃▅▆▇█▇▆▅▃▂▁       │ │
 *   │  │  ○ bob          │  │                                      │ │
 *   │  └─────────────────┘  └──────────────────────────────────────┘ │
 *   │                                                                 │
 *   │  ● MIC ON       Latency: 23ms ●     Quality: Excellent ●       │
 *   │                                                                 │
 *   │  [M] Mute/Unmute    [Q] Leave Call    [?] Help                  │
 *   └────────────────────────────────────────────────────────────────┘
 *
 * @param {Object} opts
 * @param {string} opts.username - Local user's display name
 * @param {string} opts.roomKey  - Active room key
 * @returns {Object} Dashboard API
 */
function createDashboard({ username, roomKey }) {
  // Clean up orphaned readline/inquirer listeners that cause double-typing
  // in blessed inputs. Inquirer attaches 'data' and 'keypress' listeners to
  // process.stdin that persist even after inquirer finishes, causing blessed
  // to process every keypress twice.
  process.stdin.removeAllListeners('data');
  process.stdin.removeAllListeners('keypress');

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

  // Intercept raw terminal input to discard mouse escape sequences before
  // blessed's key parser sees them
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
    top: 2, left: 1, width: '35%-1', bottom: 5,
    border: { type: 'line' },
    style: { border: { fg: 'blue' }, label: { fg: 'blue' } },
    scrollable: true,
    alwaysScroll: true,
    tags: true,
    padding: { left: 1 },
  });

  // ── Waveform box ──────────────────────────────────────────────────────────
  const waveformBox = blessed.box({
    parent: screen,
    label: ' {bold}Audio{/bold} ',
    top: 2, left: '35%', right: 1, bottom: 5,
    border: { type: 'line' },
    style: { border: { fg: 'blue' }, label: { fg: 'blue' } },
    tags: true,
    padding: { left: 1, right: 1 },
  });

  // ── Status bar (mute + latency + quality) ──────────────────────────────────
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
    content: '  {bold}[M]{/bold} Mute/Unmute    {bold}[Q]{/bold} Leave Call    {bold}[?]{/bold} Help',
    style: { fg: 'white', bg: '#333333' },
    tags: true,
  });

  // ── Internal state ────────────────────────────────────────────────────────
  /** @type {Participant[]} */
  let participants = [];
  let currentWaveform = silentWaveform();
  let messageTimer = null;
  let _promptActive = false;
  let _lastWaveformRender = 0;
  let _isMuted = false;
  let _latencyMs = -1;
  let _audioLevel = 0;
  const WAVEFORM_THROTTLE_MS = 80;

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

  function renderWaveform() {
    const innerHeight = Math.max(1, (waveformBox.height || 6) - 2);

    // Color the waveform based on mute state and audio level
    let color = 'green';
    if (_isMuted) color = 'red';
    else if (_audioLevel > 0.3) color = 'cyan';
    else if (_audioLevel > 0.1) color = 'green';
    else color = 'gray';

    const rows = [];
    const topPad = Math.max(0, Math.floor((innerHeight - 3) / 2));
    for (let i = 0; i < topPad; i++) rows.push('');

    if (_isMuted) {
      rows.push('');
      rows.push(`  {red-fg}{bold}  MICROPHONE MUTED{/bold}{/red-fg}`);
      rows.push('');
      rows.push(`  {gray-fg}Press [M] to unmute{/gray-fg}`);
    } else {
      const waveStr = currentWaveform;
      const row = `{${color}-fg}${waveStr}{/${color}-fg}`;
      rows.push(row);
      rows.push(row);
      rows.push(row);
    }

    waveformBox.setContent(rows.join('\n'));
  }

  function renderStatusBar() {
    // Mute indicator
    const muteIcon = _isMuted
      ? '{red-fg}{bold} x MIC OFF {/bold}{/red-fg}'
      : '{green-fg}{bold} * MIC ON  {/bold}{/green-fg}';

    // Latency indicator with color coding
    let latencyStr;
    if (_latencyMs < 0) {
      latencyStr = '{gray-fg}Latency: --{/gray-fg}';
    } else if (_latencyMs < 80) {
      latencyStr = `{green-fg}Latency: ${_latencyMs}ms *{/green-fg}`;
    } else if (_latencyMs < 200) {
      latencyStr = `{yellow-fg}Latency: ${_latencyMs}ms *{/yellow-fg}`;
    } else {
      latencyStr = `{red-fg}Latency: ${_latencyMs}ms *{/red-fg}`;
    }

    // Audio quality based on latency
    let qualityStr;
    if (_latencyMs < 0) {
      qualityStr = '{gray-fg}Quality: --{/gray-fg}';
    } else if (_latencyMs < 80) {
      qualityStr = '{green-fg}Quality: Excellent *{/green-fg}';
    } else if (_latencyMs < 150) {
      qualityStr = '{green-fg}Quality: Good *{/green-fg}';
    } else if (_latencyMs < 300) {
      qualityStr = '{yellow-fg}Quality: Fair *{/yellow-fg}';
    } else {
      qualityStr = '{red-fg}Quality: Poor *{/red-fg}';
    }

    const peerCount = participants.length;
    const peersStr = `{cyan-fg}${peerCount} in call{/cyan-fg}`;

    statusInfoBar.setContent(` ${muteIcon}     ${latencyStr}     ${qualityStr}     ${peersStr}`);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  function render() {
    renderParticipants();
    renderWaveform();
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

    // Calculate audio level for waveform coloring
    if (samples && samples.length > 0) {
      _audioLevel = Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length);
    }

    currentWaveform = generateWaveform(samples);
    renderWaveform();
    screen.render();
  }

  function updateLatency(ms) {
    _latencyMs = ms;
    renderStatusBar();
    screen.render();
  }

  function updateMuteState(muted) {
    _isMuted = muted;
    renderWaveform();
    renderStatusBar();
    screen.render();
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
    showMessage,
    setStatus,
    isPromptActive,
    destroy,
    screen,
  };
}

module.exports = { createDashboard };
