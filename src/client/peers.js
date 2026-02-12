'use strict';

const { EventEmitter } = require('events');
const { PeerError } = require('../utils/errors');
const logger = require('../utils/logger');

/** Public STUN servers used for ICE negotiation. */
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

/**
 * Manages a set of WebRTC peer connections using simple-peer + wrtc.
 *
 * Events emitted:
 *   'signal'       (peerId, data)   — ICE/SDP data to forward via signaling
 *   'track'        (peerId, track)  — remote audio track received
 *   'connected'    (peerId)         — data channel open; audio flowing
 *   'disconnected' (peerId)         — connection closed or failed
 *   'error'        (peerId, err)    — non-fatal connection error
 */
class PeerManager extends EventEmitter {
  constructor() {
    super();

    /** @type {Map<string, import('simple-peer').Instance>} */
    this._peers = new Map();

    this._SimplePeer = null;
    this._wrtc = null;
    this._loadModules();
  }

  /** @private */
  _loadModules() {
    try {
      this._SimplePeer = require('simple-peer');
      this._wrtc = require('@roamhq/wrtc');
    } catch (err) {
      logger.warn(`WebRTC modules unavailable: ${err.message}`);
    }
  }

  /** @returns {boolean} */
  get isAvailable() {
    return Boolean(this._SimplePeer && this._wrtc);
  }

  /**
   * Creates a new WebRTC peer connection.
   *
   * @param {string}                peerId     - Remote peer's server-assigned ID
   * @param {boolean}               initiator  - True when we initiate the offer
   * @param {MediaStreamTrack|null} localTrack - Local audio track (may be null)
   * @returns {import('simple-peer').Instance|null}
   */
  createPeer(peerId, initiator, localTrack = null) {
    if (!this.isAvailable) {
      logger.warn(`Cannot create peer connection to ${peerId} — WebRTC unavailable`);
      return null;
    }

    // Clean up any existing connection to this peer
    if (this._peers.has(peerId)) {
      logger.warn(`Replacing existing peer connection for ${peerId}`);
      this.destroyPeer(peerId);
    }

    const streams = localTrack
      ? [new this._wrtc.MediaStream([localTrack])]
      : [];

    const peer = new this._SimplePeer({
      initiator,
      wrtc: this._wrtc,
      streams,
      config: { iceServers: ICE_SERVERS },
      trickle: true,
    });

    peer.on('signal', (data) => this.emit('signal', peerId, data));

    peer.on('stream', (stream) => {
      const [track] = stream.getAudioTracks();
      if (track) this.emit('track', peerId, track);
    });

    peer.on('connect', () => {
      logger.info(`WebRTC connected → ${peerId}`);
      this.emit('connected', peerId);
    });

    peer.on('close', () => {
      logger.info(`WebRTC closed ← ${peerId}`);
      this._peers.delete(peerId);
      this.emit('disconnected', peerId);
    });

    peer.on('error', (err) => {
      logger.error(`WebRTC error (${peerId}): ${err.message}`);
      this.emit('error', peerId, new PeerError(err.message, 'WEBRTC_ERROR'));
    });

    this._peers.set(peerId, peer);
    return peer;
  }

  /**
   * Delivers a signaling message (SDP/ICE) to the named peer.
   *
   * @param {string} peerId
   * @param {Object} data
   */
  signal(peerId, data) {
    const peer = this._peers.get(peerId);
    if (!peer) {
      logger.warn(`Signal for unknown peer ${peerId} — ignoring`);
      return;
    }
    try {
      peer.signal(data);
    } catch (err) {
      logger.error(`signal() failed for ${peerId}: ${err.message}`);
    }
  }

  /**
   * Closes and removes a specific peer connection.
   * @param {string} peerId
   */
  destroyPeer(peerId) {
    const peer = this._peers.get(peerId);
    if (peer) {
      peer.destroy();
      this._peers.delete(peerId);
    }
  }

  /** Closes all active peer connections. */
  destroyAll() {
    for (const peerId of [...this._peers.keys()]) this.destroyPeer(peerId);
  }

  /** @returns {string[]} */
  getPeerIds() {
    return Array.from(this._peers.keys());
  }

  /** @returns {number} */
  get peerCount() {
    return this._peers.size;
  }
}

module.exports = { PeerManager };
