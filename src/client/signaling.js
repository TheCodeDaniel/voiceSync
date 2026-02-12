'use strict';

const WebSocket = require('ws');
const { EventEmitter } = require('events');
const { SignalingError } = require('../utils/errors');
const logger = require('../utils/logger');

const PING_INTERVAL_MS = 25_000;
const RECONNECT_DELAY_MS = 3_000;
const MAX_RECONNECT_ATTEMPTS = 5;

/**
 * WebSocket signaling client.
 *
 * Handles connection, keep-alive pings, automatic reconnection, and
 * serialising/deserialising JSON messages.  Every valid server message
 * is emitted as an event of the same `type` so callers can use simple
 * `on('room-joined', …)` listeners.
 *
 * Additional events:
 *   'open'  — connection established
 *   'close' — connection closed (intentional or not)
 *   'error' — a SignalingError was encountered
 */
class SignalingClient extends EventEmitter {
  /**
   * @param {string}   serverUrl  - WebSocket URL, e.g. ws://localhost:3000
   * @param {Function} [wsFactory] - Optional WebSocket constructor (injected in tests)
   */
  constructor(serverUrl, wsFactory = null) {
    super();
    this._url = serverUrl;
    this._WS = wsFactory || WebSocket;  // injectable for unit testing
    this._ws = null;
    this._pingTimer = null;
    this._reconnectAttempts = 0;
    this._intentionalClose = false;
  }

  /**
   * Connects to the signaling server.
   * @returns {Promise<void>} Resolves once the socket is open.
   * @throws {SignalingError} When the initial connection cannot be established.
   */
  connect() {
    return new Promise((resolve, reject) => {
      this._intentionalClose = false;
      this._ws = new this._WS(this._url);

      // Handles errors that occur before the connection is established.
      // Registered as `once` so it fires at most once and does not conflict
      // with the ongoing error handler registered inside onOpen.
      const onConnectError = (err) => {
        reject(new SignalingError(`Cannot connect to ${this._url}: ${err.message}`, 'CONNECT_FAILED'));
      };

      this._ws.once('open', () => {
        // Connection established — remove the connect-phase error handler so
        // the ongoing handler (registered below) takes over exclusively.
        this._ws.removeListener('error', onConnectError);
        this._reconnectAttempts = 0;
        this._startPing();
        logger.info(`Signaling connected to ${this._url}`);

        // Register ongoing handlers only after a successful connection so they
        // do not interfere with connection-time errors.
        this._ws.on('message', (data) => {
          let msg;
          try {
            msg = JSON.parse(data.toString());
          } catch {
            logger.warn('Received non-JSON message from server');
            return;
          }
          this.emit(msg.type, msg);
        });

        this._ws.on('close', () => {
          this._stopPing();
          this.emit('close');
          if (!this._intentionalClose) this._scheduleReconnect();
        });

        this._ws.on('error', (err) => {
          this.emit('error', new SignalingError(err.message, 'WS_ERROR'));
        });

        resolve();
        this.emit('open');
      });

      this._ws.once('error', onConnectError);
    });
  }

  // ── Keep-alive ─────────────────────────────────────────────────────────────

  _startPing() {
    this._pingTimer = setInterval(() => {
      if (this._ws?.readyState === (this._WS.OPEN ?? WebSocket.OPEN)) this._ws.ping();
    }, PING_INTERVAL_MS);
  }

  _stopPing() {
    clearInterval(this._pingTimer);
    this._pingTimer = null;
  }

  // ── Reconnection ──────────────────────────────────────────────────────────

  _scheduleReconnect() {
    if (this._reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.emit('error', new SignalingError('Max reconnection attempts reached', 'CONN_LOST'));
      return;
    }
    this._reconnectAttempts++;
    logger.warn(`Reconnecting in ${RECONNECT_DELAY_MS}ms (attempt ${this._reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
    setTimeout(
      () => this.connect().catch((err) => this.emit('error', err)),
      RECONNECT_DELAY_MS,
    );
  }

  // ── Send helpers ──────────────────────────────────────────────────────────

  /**
   * Sends a JSON payload to the server.
   * Silently drops the message when the socket is not open.
   * @param {Object} payload
   */
  send(payload) {
    if (this._ws?.readyState !== (this._WS.OPEN ?? WebSocket.OPEN)) {
      logger.warn('send() called when socket is not open — dropping message');
      return;
    }
    this._ws.send(JSON.stringify(payload));
  }

  // Typed convenience methods so callers never construct raw objects

  /** @param {string} username */
  login(username) { this.send({ type: 'login', username }); }

  createRoom() { this.send({ type: 'create-room' }); }

  /** @param {string} roomKey */
  joinRoom(roomKey) { this.send({ type: 'join-room', roomKey }); }

  /** @param {string} toUsername */
  invite(toUsername) { this.send({ type: 'invite', toUsername }); }

  /** @param {string} roomKey */
  acceptInvite(roomKey) { this.send({ type: 'accept-invite', roomKey }); }

  /** @param {string} roomKey */
  declineInvite(roomKey) { this.send({ type: 'decline-invite', roomKey }); }

  leaveRoom() { this.send({ type: 'leave-room' }); }

  /**
   * Forwards a WebRTC signal payload to another peer via the server.
   * @param {string} toPeerId
   * @param {Object} data
   */
  signal(toPeerId, data) { this.send({ type: 'signal', toPeerId, data }); }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Closes the connection intentionally (no reconnection will be attempted). */
  disconnect() {
    this._intentionalClose = true;
    this._stopPing();
    this._ws?.close();
    this._ws = null;
  }

  /** @returns {boolean} */
  get isConnected() {
    // Use the factory's OPEN constant so injected factories work in tests
    const openState = this._WS.OPEN ?? WebSocket.OPEN;
    return this._ws?.readyState === openState;
  }
}

module.exports = { SignalingClient };
