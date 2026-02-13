'use strict';

const { RtAudio, RtAudioFormat } = require('audify');
const { EventEmitter } = require('events');
const logger = require('../utils/logger');

const SAMPLE_RATE = 48000;
const CHANNELS = 1;
const FRAME_SIZE = 480; // 10ms at 48kHz

/**
 * Unified audio I/O powered by audify (RtAudio).
 *
 * Ships prebuilt binaries for Windows, macOS and Linux — no native compilation,
 * no SoX, no external tools.  Uses CoreAudio (macOS), WASAPI (Windows),
 * ALSA/PulseAudio (Linux) under the hood.
 *
 * AudifyMic  — microphone capture, emits 'data' with raw PCM Buffer chunks.
 * AudifySpeaker — audio output, accepts .write(buffer).
 */

// ── Microphone ──────────────────────────────────────────────────────────────

class AudifyMic extends EventEmitter {
  constructor(opts = {}) {
    super();
    this._channels = opts.channels || CHANNELS;
    this._sampleRate = opts.sampleRate || SAMPLE_RATE;
    this._frameSize = opts.frameSize || FRAME_SIZE;
    this._rtAudio = null;
    this._started = false;
  }

  start() {
    if (this._started) return;

    this._rtAudio = new RtAudio();
    this._rtAudio.openStream(
      null, // no output
      {
        deviceId: this._rtAudio.getDefaultInputDevice(),
        nChannels: this._channels,
        firstChannel: 0,
      },
      RtAudioFormat.RTAUDIO_SINT16,
      this._sampleRate,
      this._frameSize,
      'VoiceSync-Mic',
      (pcm) => {
        // pcm is a Buffer of signed 16-bit PCM samples
        this.emit('data', Buffer.from(pcm));
      },
    );
    this._rtAudio.start();
    this._started = true;
    logger.info('AudifyMic: capture started');
  }

  stop() {
    if (!this._started) return;
    this._started = false;
    if (this._rtAudio) {
      try {
        this._rtAudio.stop();
        this._rtAudio.closeStream();
      } catch {
        // already closed
      }
      this._rtAudio = null;
    }
    logger.info('AudifyMic: capture stopped');
  }
}

// ── Speaker ─────────────────────────────────────────────────────────────────

class AudifySpeaker {
  constructor(opts = {}) {
    this._channels = opts.channels || CHANNELS;
    this._sampleRate = opts.sampleRate || SAMPLE_RATE;
    this._frameSize = opts.frameSize || FRAME_SIZE;
    this._writable = false;
    this._rtAudio = null;

    try {
      this._rtAudio = new RtAudio();
      this._rtAudio.openStream(
        {
          deviceId: this._rtAudio.getDefaultOutputDevice(),
          nChannels: this._channels,
          firstChannel: 0,
        },
        null, // no input
        RtAudioFormat.RTAUDIO_SINT16,
        this._sampleRate,
        this._frameSize,
        'VoiceSync-Speaker',
        null,
      );
      this._rtAudio.start();
      this._writable = true;
    } catch (err) {
      logger.warn(`AudifySpeaker: failed to open audio output — ${err.message}`);
      this._writable = false;
    }
  }

  get writable() {
    return this._writable;
  }

  write(buffer) {
    if (!this._writable || !this._rtAudio) return false;
    try {
      this._rtAudio.write(buffer);
      return true;
    } catch {
      return false;
    }
  }

  end() {
    this._writable = false;
    if (this._rtAudio) {
      try {
        this._rtAudio.stop();
        this._rtAudio.closeStream();
      } catch {
        // already closed
      }
      this._rtAudio = null;
    }
  }
}

module.exports = { AudifyMic, AudifySpeaker };
