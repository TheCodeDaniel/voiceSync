'use strict';

/**
 * Block characters ordered from lowest (silent) to highest (loudest) amplitude.
 * The first character is a space so silence renders as empty.
 */
const BARS = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

/** Number of columns in the rendered waveform. */
const BAR_COUNT = 32;

/**
 * Maps a normalised amplitude value [0, 1] to one of the block characters.
 * @param {number} amplitude
 * @returns {string}
 */
function amplitudeToBar(amplitude) {
  const clamped = Math.max(0, Math.min(1, amplitude));
  return BARS[Math.round(clamped * (BARS.length - 1))];
}

/**
 * Converts a Float32Array of PCM samples into a single-line waveform string.
 *
 * The samples are divided into BAR_COUNT equal buckets.  For each bucket the
 * RMS (root-mean-square) is calculated and mapped to a block character.
 *
 * @param {Float32Array | number[]} samples - Normalised PCM in [-1, 1]
 * @returns {string} A string of BAR_COUNT block characters
 */
function generateWaveform(samples) {
  if (!samples || samples.length === 0) return silentWaveform();

  const bucketSize = Math.ceil(samples.length / BAR_COUNT);
  let result = '';

  for (let i = 0; i < BAR_COUNT; i++) {
    const start = i * bucketSize;

    // Once we have consumed all samples, fill remaining bars with silence
    if (start >= samples.length) {
      result += BARS[0];
      continue;
    }

    const end = Math.min(start + bucketSize, samples.length);
    let sumOfSquares = 0;

    for (let j = start; j < end; j++) {
      sumOfSquares += samples[j] * samples[j];
    }

    const rms = Math.sqrt(sumOfSquares / (end - start));
    result += amplitudeToBar(rms);
  }

  return result;
}

/**
 * Returns a blank waveform string (all spaces) representing silence.
 * @returns {string}
 */
function silentWaveform() {
  return ' '.repeat(BAR_COUNT);
}

module.exports = { generateWaveform, silentWaveform, amplitudeToBar, BAR_COUNT };
