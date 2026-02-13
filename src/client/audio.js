'use strict';

const { EventEmitter } = require('events');
const { AudioError } = require('../utils/errors');
const logger = require('../utils/logger');

const SAMPLE_RATE = 48000;
const CHANNELS = 1;
const BIT_DEPTH = 16;
const FRAMES_PER_10MS = (SAMPLE_RATE / 100) * CHANNELS; // 480

/**
 * Manages microphone capture and remote peer audio playback.
 *
 * Native modules (`wrtc`, `mic`, `speaker`) are loaded lazily so that the
 * rest of the application stays functional even when they are unavailable
 * (e.g. in CI or environments where native bindings cannot be compiled).
 *
 * Events emitted:
 *   'samples' (Float32Array) — normalised PCM chunks from the local mic,
 *                              suitable for waveform visualisation.
 *   'error'   (AudioError)   — a non-fatal audio problem was encountered.
 */
class AudioManager extends EventEmitter {
  constructor() {
    super();

    this._mic = null;
    this._micStream = null;
    this._audioSource = null;  // wrtc RTCAudioSource
    this._localTrack = null;   // MediaStreamTrack to add to peer connections

    /** @type {Map<string, object>} peerId → RTCAudioSink */
    this._sinks = new Map();
    /** @type {Map<string, object>} peerId → Speaker */
    this._speakers = new Map();

    this._isMuted = false;
    this._isCapturing = false;
    this._pcmBuffer = Buffer.alloc(0);

    // Optional native module references
    this._wrtc = null;
    this._Mic = null;
    this._Speaker = null;

    this._loadNativeModules();
  }

  /**
   * Attempts to require optional native modules.
   * Emits warnings rather than throwing so the app degrades gracefully.
   * @private
   */
  _loadNativeModules() {
    try {
      this._wrtc = require('@roamhq/wrtc');
    } catch {
      logger.warn('wrtc not available — WebRTC audio disabled. Run: npm install @roamhq/wrtc');
    }
    try {
      this._Mic = require('mic');
    } catch {
      logger.warn('mic not available — microphone capture disabled. Run: npm install mic');
    }
    try {
      this._Speaker = require('speaker');
    } catch {
      logger.warn('speaker not available — audio playback disabled. Run: npm install speaker');
    }
  }

  /** @returns {boolean} true when both wrtc and mic are available */
  get isCaptureAvailable() {
    return Boolean(this._wrtc && this._Mic);
  }

  /**
   * Opens the microphone, creates an RTCAudioSource, and starts streaming
   * PCM data into it.  Also emits 'samples' for waveform visualisation.
   *
   * Safe to call multiple times — subsequent calls are no-ops.
   *
   * @throws {AudioError} when the microphone cannot be opened
   */
  startCapture() {
    if (this._isCapturing) return;
    if (!this._wrtc || !this._Mic) {
      logger.warn('Audio capture unavailable — running in silent mode');
      return;
    }

    const { nonstandard: { RTCAudioSource } } = this._wrtc;
    this._audioSource = new RTCAudioSource();
    this._localTrack = this._audioSource.createTrack();

    try {
      this._mic = this._Mic({
        rate: String(SAMPLE_RATE),
        channels: String(CHANNELS),
        bitwidth: String(BIT_DEPTH),
        encoding: 'signed-integer',
        endian: 'little',
      });
    } catch (err) {
      throw new AudioError(`Failed to open microphone: ${err.message}`, 'MIC_OPEN_FAILED');
    }

    this._micStream = this._mic.getAudioStream();

    this._micStream.on('data', (chunk) => this._onMicData(chunk));
    this._micStream.on('error', (err) => {
      const audioErr = new AudioError(err.message, 'MIC_STREAM_ERROR');
      logger.error(`Mic stream error: ${err.message}`);
      this.emit('error', audioErr);
    });

    this._mic.start();
    this._isCapturing = true;
    logger.info('Microphone capture started');
  }

  /**
   * Processes a raw PCM buffer from the mic:
   *   1. Feeds it to the RTCAudioSource (unless muted).
   *   2. Normalises it to Float32 and emits 'samples'.
   *
   * @param {Buffer} chunk
   * @private
   */
  _onMicData(chunk) {
    if (!this._audioSource) return;

    // RTCAudioSource.onData() requires exactly 480 frames (10ms at 48kHz).
    // The mic sends larger chunks, so we buffer and drain in 480-frame slices.
    this._pcmBuffer = Buffer.concat([this._pcmBuffer, chunk]);

    const bytesPerFrame = (BIT_DEPTH / 8) * CHANNELS; // 2
    const bytesNeeded = FRAMES_PER_10MS * bytesPerFrame; // 960

    while (this._pcmBuffer.length >= bytesNeeded) {
      const slice = this._pcmBuffer.subarray(0, bytesNeeded);
      this._pcmBuffer = this._pcmBuffer.subarray(bytesNeeded);

      // RTCAudioSource validates the underlying ArrayBuffer byteLength, so we
      // must copy into a standalone buffer (subarray shares the original).
      const samples = new Int16Array(FRAMES_PER_10MS);
      samples.set(new Int16Array(slice.buffer, slice.byteOffset, FRAMES_PER_10MS));

      if (!this._isMuted) {
        this._audioSource.onData({
          samples,
          sampleRate: SAMPLE_RATE,
          bitsPerSample: BIT_DEPTH,
          channelCount: CHANNELS,
          numberOfFrames: FRAMES_PER_10MS,
        });
      }

      // Float32 normalisation for waveform — always, even when muted
      const float32 = Float32Array.from(samples, (s) => s / 32768.0);
      this.emit('samples', float32);
    }
  }

  /**
   * Stops microphone capture and releases related resources.
   * Safe to call even when not capturing.
   */
  stopCapture() {
    if (!this._isCapturing) return;
    this._mic?.stop();
    this._micStream?.destroy();
    this._localTrack?.stop();
    this._mic = null;
    this._micStream = null;
    this._localTrack = null;
    this._audioSource = null;
    this._pcmBuffer = Buffer.alloc(0);
    this._isCapturing = false;
    logger.info('Microphone capture stopped');
  }

  /**
   * Returns the local audio track to add to a WebRTC peer connection.
   * Returns null when audio capture is unavailable.
   *
   * @returns {MediaStreamTrack|null}
   */
  getLocalTrack() {
    return this._localTrack;
  }

  /**
   * Wires up an RTCAudioSink + Speaker for incoming audio from a remote peer.
   *
   * @param {string}           peerId
   * @param {MediaStreamTrack} track - The remote audio track
   */
  addPeerAudio(peerId, track) {
    if (!this._wrtc || !this._Speaker) {
      logger.warn(`Cannot play audio for peer ${peerId} — speaker unavailable`);
      return;
    }

    const { nonstandard: { RTCAudioSink } } = this._wrtc;
    const sink = new RTCAudioSink(track);

    // Create the Speaker lazily on first audio data to avoid Core Audio
    // buffer underflow warnings while waiting for WebRTC packets.
    let speaker = null;
    const SpeakerCtor = this._Speaker;

    sink.addEventListener('data', ({ samples }) => {
      if (!speaker) {
        speaker = new SpeakerCtor({
          channels: CHANNELS,
          bitDepth: BIT_DEPTH,
          sampleRate: SAMPLE_RATE,
        });
        this._speakers.set(peerId, speaker);
      }
      if (speaker.writable) {
        speaker.write(Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength));
      }
    });

    sink.addEventListener('close', () => speaker?.end());

    this._sinks.set(peerId, sink);
    logger.debug(`Audio playback started for peer ${peerId}`);
  }

  /**
   * Stops and removes the audio sink/speaker for a specific peer.
   * @param {string} peerId
   */
  removePeerAudio(peerId) {
    this._sinks.get(peerId)?.stop();
    this._sinks.delete(peerId);
    this._speakers.get(peerId)?.end();
    this._speakers.delete(peerId);
  }

  /** Mutes the microphone (data is still captured but not transmitted). */
  mute() {
    this._isMuted = true;
    logger.info('Microphone muted');
  }

  /** Unmutes the microphone. */
  unmute() {
    this._isMuted = false;
    logger.info('Microphone unmuted');
  }

  /** @returns {boolean} */
  get isMuted() {
    return this._isMuted;
  }

  /** Stops capture and removes all peer audio sinks. */
  destroy() {
    this.stopCapture();
    for (const peerId of [...this._sinks.keys()]) this.removePeerAudio(peerId);
    this.removeAllListeners();
  }
}

module.exports = { AudioManager, SAMPLE_RATE, CHANNELS, BIT_DEPTH };
