'use strict';

const { EventEmitter } = require('events');
const { SignalingClient } = require('./signaling');
const { PeerManager } = require('./peers');
const { AudioManager } = require('./audio');
const logger = require('../utils/logger');

/**
 * @typedef {Object} Participant
 * @property {string}  peerId
 * @property {string}  username
 * @property {boolean} isSpeaking
 * @property {boolean} isMuted
 * @property {boolean} isSelf
 */

/** RMS threshold above which a participant is considered "speaking". */
const SPEAKING_THRESHOLD = 0.01;

/**
 * Top-level coordinator for a single voice call session.
 *
 * Wires together the SignalingClient, PeerManager, and AudioManager and
 * exposes a clean async API so CLI commands only interact with this class.
 *
 * Events emitted:
 *   'participant-update' (Participant[]) — any change to the participant list
 *   'audio-samples'      (Float32Array)  — local mic PCM for waveform display
 *   'invite'             ({ fromUsername, roomKey }) — incoming call invite
 *   'invite-sent'        ({ toUsername })            — invite was delivered
 *   'invite-error'       (string)                   — invite send failed
 *   'error'              (Error)                    — unrecoverable error
 *   'ended'                                         — call ended or kicked
 */
class Session extends EventEmitter {
  /**
   * @param {string} serverUrl - WebSocket signaling server URL
   * @param {string} username  - Display name for this user
   */
  constructor(serverUrl, username) {
    super();
    this._serverUrl = serverUrl;
    this._username = username;
    this._peerId = null;
    this._roomKey = null;

    /** @type {Map<string, Participant>} peerId → participant */
    this._participants = new Map();

    this._signaling = new SignalingClient(serverUrl);
    this._peers = new PeerManager();
    this._audio = new AudioManager();

    // Safety net: prevent Node.js from crashing on unhandled 'error' events
    // (e.g. when errors fire before the dashboard registers its own listener).
    this.on('error', (err) => {
      logger.error(`Session error: ${err.message}`);
    });

    this._bindSignalingEvents();
    this._bindPeerEvents();
    this._bindAudioEvents();
  }

  // ── Event wiring ───────────────────────────────────────────────────────────

  /** @private */
  _bindSignalingEvents() {
    const sig = this._signaling;

    sig.on('login-ok', ({ peerId }) => {
      this._peerId = peerId;
      logger.debug(`Logged in as "${this._username}" (peerId: ${peerId})`);
    });

    // login-error is handled by _waitFor in connect()

    sig.on('room-created', ({ roomKey }) => {
      this._roomKey = roomKey;
      this._upsertParticipant(this._peerId, this._username, true);
    });

    // create-error is handled by _waitFor in createRoom()

    sig.on('room-joined', ({ roomKey, peers }) => {
      this._roomKey = roomKey;
      this._upsertParticipant(this._peerId, this._username, true);

      // Existing peers: we are the initiator for each P2P connection
      for (const { peerId, username } of peers) {
        this._upsertParticipant(peerId, username, false);
        this._peers.createPeer(peerId, true, this._audio.getLocalTrack());
      }
    });

    // join-error is handled by _waitFor in joinRoom()

    sig.on('peer-joined', ({ peerId, username }) => {
      this._upsertParticipant(peerId, username, false);
      // New peer will initiate towards us; we respond (initiator: false)
      this._peers.createPeer(peerId, false, this._audio.getLocalTrack());
    });

    sig.on('peer-left', ({ peerId }) => {
      this._removeParticipant(peerId);
      this._peers.destroyPeer(peerId);
      this._audio.removePeerAudio(peerId);
    });

    sig.on('signal', ({ fromPeerId, data }) => {
      this._peers.signal(fromPeerId, data);
    });

    sig.on('invite', ({ fromUsername, roomKey }) => {
      this.emit('invite', { fromUsername, roomKey });
    });

    sig.on('invite-sent', ({ toUsername }) => {
      this.emit('invite-sent', { toUsername });
    });

    sig.on('invite-error', ({ message }) => {
      this.emit('invite-error', message);
    });

    sig.on('left-room', () => {
      this._cleanupCall();
      this.emit('ended');
    });

    sig.on('error', (err) => this.emit('error', err));

    sig.on('close', () => {
      if (this._roomKey) {
        const err = new Error('Signaling connection lost');
        err.code = 'CONN_LOST';
        this.emit('error', err);
      }
    });
  }

  /** @private */
  _bindPeerEvents() {
    this._peers.on('signal', (peerId, data) => {
      this._signaling.signal(peerId, data);
    });

    this._peers.on('track', (peerId, track) => {
      this._audio.addPeerAudio(peerId, track);
    });

    this._peers.on('disconnected', (peerId) => {
      logger.debug(`P2P disconnected from ${peerId}`);
    });

    this._peers.on('error', (peerId, err) => {
      logger.warn(`Peer error (${peerId}): ${err.message}`);
    });
  }

  /** @private */
  _bindAudioEvents() {
    this._audio.on('samples', (samples) => {
      // Detect whether the local user is speaking
      const rms = Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length);
      const isSpeaking = rms > SPEAKING_THRESHOLD;

      const self = this._peerId && this._participants.get(this._peerId);
      if (self && self.isSpeaking !== isSpeaking) {
        self.isSpeaking = isSpeaking;
        this._emitParticipantUpdate();
      }

      this.emit('audio-samples', samples);
    });

    this._audio.on('error', (err) => {
      logger.warn(`Audio error: ${err.message}`);
    });
  }

  // ── Participant helpers ────────────────────────────────────────────────────

  /** @private */
  _upsertParticipant(peerId, username, isSelf = false) {
    this._participants.set(peerId, {
      peerId,
      username,
      isSpeaking: false,
      isMuted: false,
      isSelf,
    });
    this._emitParticipantUpdate();
  }

  /** @private */
  _removeParticipant(peerId) {
    this._participants.delete(peerId);
    this._emitParticipantUpdate();
  }

  /** @private */
  _emitParticipantUpdate() {
    this.emit('participant-update', Array.from(this._participants.values()));
  }

  /** @private */
  _cleanupCall() {
    this._peers.destroyAll();
    this._audio.destroy();
    this._roomKey = null;
    this._participants.clear();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Connects to the signaling server and logs in with the configured username.
   * Starts microphone capture on success.
   *
   * @returns {Promise<void>}
   */
  async connect() {
    await this._signaling.connect();
    await this._waitFor(
      'login-ok',
      'login-error',
      () => this._signaling.login(this._username),
    );
    this._audio.startCapture();
  }

  /**
   * Creates a new room and returns its key.
   * @returns {Promise<string>}
   */
  createRoom() {
    return this._waitFor('room-created', 'create-error', () => this._signaling.createRoom())
      .then(({ roomKey }) => roomKey);
  }

  /**
   * Joins an existing room by key.
   * @param {string} roomKey
   * @returns {Promise<void>}
   */
  joinRoom(roomKey) {
    return this._waitFor('room-joined', 'join-error', () => this._signaling.joinRoom(roomKey));
  }

  /**
   * Sends an invite to an online user.
   * @param {string} toUsername
   * @returns {Promise<void>}
   */
  inviteUser(toUsername) {
    return this._waitFor('invite-sent', 'invite-error', () => this._signaling.invite(toUsername));
  }

  /**
   * Mutes or unmutes the local microphone.
   * @param {boolean} muted
   */
  setMuted(muted) {
    muted ? this._audio.mute() : this._audio.unmute();
    const self = this._participants.get(this._peerId);
    if (self) {
      self.isMuted = muted;
      this._emitParticipantUpdate();
    }
  }

  /** @returns {boolean} */
  get isMuted() { return this._audio.isMuted; }

  /**
   * Leaves the current room and disconnects from the signaling server.
   * @returns {Promise<void>}
   */
  async leave() {
    try {
      if (this._roomKey) this._signaling.leaveRoom();
      // Allow the leave-room message to be processed before closing the socket
      await new Promise((r) => setTimeout(r, 250));
      this._signaling.disconnect();
    } catch (err) {
      logger.warn(`Error during leave: ${err.message}`);
    }
    this._cleanupCall();
  }

  /** @returns {string|null} */
  get roomKey() { return this._roomKey; }

  /** @returns {string|null} */
  get peerId() { return this._peerId; }

  /** @returns {string} */
  get username() { return this._username; }

  // ── Utility ───────────────────────────────────────────────────────────────

  /**
   * Returns a promise that resolves on `successEvent` or rejects on `errorEvent`.
   * Calls `action()` to trigger the operation being awaited.
   *
   * @param {string}   successEvent
   * @param {string}   errorEvent
   * @param {Function} action
   * @returns {Promise<Object>}
   * @private
   */
  _waitFor(successEvent, errorEvent, action, timeoutMs = 10_000) {
    return new Promise((resolve, reject) => {
      let timer;

      const cleanup = () => {
        clearTimeout(timer);
        this._signaling.removeListener(successEvent, onSuccess);
        this._signaling.removeListener(errorEvent, onError);
      };

      const onSuccess = (msg) => {
        cleanup();
        resolve(msg);
      };
      const onError = (msg) => {
        cleanup();
        reject(new Error(typeof msg === 'string' ? msg : msg.message));
      };

      timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Server did not respond in time (waiting for ${successEvent})`));
      }, timeoutMs);

      this._signaling.once(successEvent, onSuccess);
      this._signaling.once(errorEvent, onError);
      action();
    });
  }
}

module.exports = { Session };
