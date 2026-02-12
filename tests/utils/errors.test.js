'use strict';

const {
  VoiceSyncError,
  SignalingError,
  RoomError,
  AudioError,
  PeerError,
} = require('../../src/utils/errors');

describe('VoiceSyncError', () => {
  test('is an instance of Error', () => {
    const err = new VoiceSyncError('oops', 'TEST_CODE');
    expect(err).toBeInstanceOf(Error);
  });

  test('sets name, message, and code', () => {
    const err = new VoiceSyncError('something went wrong', 'MY_CODE');
    expect(err.name).toBe('VoiceSyncError');
    expect(err.message).toBe('something went wrong');
    expect(err.code).toBe('MY_CODE');
  });

  test('stack trace is populated', () => {
    const err = new VoiceSyncError('bad', 'CODE');
    expect(err.stack).toBeDefined();
  });
});

describe('SignalingError', () => {
  test('extends VoiceSyncError', () => {
    const err = new SignalingError('ws failed');
    expect(err).toBeInstanceOf(VoiceSyncError);
    expect(err).toBeInstanceOf(Error);
  });

  test('sets the default code', () => {
    const err = new SignalingError('ws failed');
    expect(err.code).toBe('SIGNALING_ERROR');
    expect(err.name).toBe('SignalingError');
  });

  test('accepts a custom code', () => {
    const err = new SignalingError('timeout', 'CONNECT_FAILED');
    expect(err.code).toBe('CONNECT_FAILED');
  });
});

describe('RoomError', () => {
  test('extends VoiceSyncError', () => {
    expect(new RoomError('no room')).toBeInstanceOf(VoiceSyncError);
  });

  test('has the correct name and default code', () => {
    const err = new RoomError('not found');
    expect(err.name).toBe('RoomError');
    expect(err.code).toBe('ROOM_ERROR');
  });

  test('ROOM_NOT_FOUND is a recognised custom code', () => {
    const err = new RoomError('not found', 'ROOM_NOT_FOUND');
    expect(err.code).toBe('ROOM_NOT_FOUND');
  });
});

describe('AudioError', () => {
  test('extends VoiceSyncError', () => {
    expect(new AudioError('mic failed')).toBeInstanceOf(VoiceSyncError);
  });

  test('has the correct name and default code', () => {
    const err = new AudioError('no mic');
    expect(err.name).toBe('AudioError');
    expect(err.code).toBe('AUDIO_ERROR');
  });
});

describe('PeerError', () => {
  test('extends VoiceSyncError', () => {
    expect(new PeerError('webrtc failed')).toBeInstanceOf(VoiceSyncError);
  });

  test('has the correct name and default code', () => {
    const err = new PeerError('ice failed');
    expect(err.name).toBe('PeerError');
    expect(err.code).toBe('PEER_ERROR');
  });
});
