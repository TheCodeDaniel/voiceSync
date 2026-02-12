'use strict';

/**
 * Base error for all VoiceSync-specific failures.
 * Carries a machine-readable `code` alongside the human message.
 */
class VoiceSyncError extends Error {
  /** @param {string} message @param {string} code */
  constructor(message, code) {
    super(message);
    this.name = 'VoiceSyncError';
    this.code = code;
    // Maintain proper prototype chain in transpiled environments
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when WebSocket signaling fails (connect, send, protocol). */
class SignalingError extends VoiceSyncError {
  constructor(message, code = 'SIGNALING_ERROR') {
    super(message, code);
    this.name = 'SignalingError';
  }
}

/** Thrown for room lifecycle violations (not found, already joined, etc.). */
class RoomError extends VoiceSyncError {
  constructor(message, code = 'ROOM_ERROR') {
    super(message, code);
    this.name = 'RoomError';
  }
}

/** Thrown when audio capture or playback encounters a fatal problem. */
class AudioError extends VoiceSyncError {
  constructor(message, code = 'AUDIO_ERROR') {
    super(message, code);
    this.name = 'AudioError';
  }
}

/** Thrown when a WebRTC peer connection fails. */
class PeerError extends VoiceSyncError {
  constructor(message, code = 'PEER_ERROR') {
    super(message, code);
    this.name = 'PeerError';
  }
}

module.exports = { VoiceSyncError, SignalingError, RoomError, AudioError, PeerError };
