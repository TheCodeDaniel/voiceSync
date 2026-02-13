'use strict';

const { RtAudio, RtAudioFormat } = require('audify');
const logger = require('../utils/logger');

/**
 * Drop-in replacement for the native `speaker` npm package, powered by audify.
 *
 * audify ships prebuilt binaries for Windows, macOS and Linux — no native
 * compilation or external tools (like SoX) required.  It uses RtAudio under
 * the hood (CoreAudio on macOS, WASAPI/DirectSound on Windows, ALSA/PulseAudio
 * on Linux).
 *
 * API surface matches what AudioManager expects: constructor(opts), .writable,
 * .write(buffer), .end().
 */
class AudifySpeaker {
  constructor(opts = {}) {
    this._channels = opts.channels || 1;
    this._sampleRate = opts.sampleRate || 48000;
    this._frameSize = opts.frameSize || 480; // 10ms at 48kHz
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
        null, // no input — output only
        RtAudioFormat.RTAUDIO_SINT16,
        this._sampleRate,
        this._frameSize,
        'VoiceSync',
        null, // no input callback
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

module.exports = AudifySpeaker;
