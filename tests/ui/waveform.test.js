'use strict';

const { generateWaveform, silentWaveform, amplitudeToBar, BAR_COUNT } = require('../../src/ui/waveform');

describe('amplitudeToBar', () => {
  test('returns a space for amplitude 0 (silence)', () => {
    expect(amplitudeToBar(0)).toBe(' ');
  });

  test('returns the full block for amplitude 1 (max)', () => {
    expect(amplitudeToBar(1)).toBe('█');
  });

  test('clamps values below 0', () => {
    expect(amplitudeToBar(-5)).toBe(' ');
  });

  test('clamps values above 1', () => {
    expect(amplitudeToBar(10)).toBe('█');
  });

  test('returns an intermediate block for 0.5', () => {
    const bar = amplitudeToBar(0.5);
    expect(bar).not.toBe(' ');
    expect(bar).not.toBe('█');
  });
});

describe('silentWaveform', () => {
  test(`returns a string of length ${BAR_COUNT}`, () => {
    expect(silentWaveform()).toHaveLength(BAR_COUNT);
  });

  test('contains only spaces', () => {
    expect(silentWaveform().trim()).toBe('');
  });
});

describe('generateWaveform', () => {
  test(`always returns a string of length ${BAR_COUNT}`, () => {
    const samples = new Float32Array(1024).fill(0.5);
    expect(generateWaveform(samples)).toHaveLength(BAR_COUNT);
  });

  test('returns silentWaveform for empty input', () => {
    expect(generateWaveform([])).toBe(silentWaveform());
    expect(generateWaveform(null)).toBe(silentWaveform());
  });

  test('returns all spaces for a zero-amplitude signal', () => {
    const samples = new Float32Array(512).fill(0);
    expect(generateWaveform(samples).trim()).toBe('');
  });

  test('returns all full blocks for a max-amplitude signal', () => {
    const samples = new Float32Array(512).fill(1);
    expect(generateWaveform(samples)).toBe('█'.repeat(BAR_COUNT));
  });

  test('is louder than silence for a non-zero signal', () => {
    const silent = silentWaveform();
    const loud = generateWaveform(new Float32Array(512).fill(0.8));
    expect(loud).not.toBe(silent);
  });

  test('handles a Float32Array with fewer samples than BAR_COUNT', () => {
    const samples = new Float32Array(4).fill(0.5);
    const result = generateWaveform(samples);
    expect(result).toHaveLength(BAR_COUNT);
  });
});
