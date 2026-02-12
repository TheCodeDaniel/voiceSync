'use strict';

const rooms = require('../../src/server/rooms');
const users = require('../../src/server/users');
const { handleMessage, handleDisconnect } = require('../../src/server/handlers');

// ── Helpers ────────────────────────────────────────────────────────────────

/** Creates a mock WebSocket with a jest-spy send method. */
function mockWs() {
  return { readyState: 1, send: jest.fn() };
}

/**
 * Parses all JSON payloads sent to a mock WebSocket and returns them as an
 * array.  Makes assertions more readable.
 */
function sentMessages(ws) {
  return ws.send.mock.calls.map(([raw]) => JSON.parse(raw));
}

/** Last message sent to a WebSocket. */
function lastMessage(ws) {
  const msgs = sentMessages(ws);
  return msgs[msgs.length - 1];
}

/** Dispatches a message from a given peer. */
function dispatch(ws, peerId, payload) {
  handleMessage(ws, peerId, JSON.stringify(payload));
}

beforeEach(() => {
  rooms.clearRooms();
  users.clearUsers();
});

// ── login ──────────────────────────────────────────────────────────────────

describe('login', () => {
  test('login-ok is sent with peerId on success', () => {
    const ws = mockWs();
    dispatch(ws, 'p1', { type: 'login', username: 'alice' });
    expect(lastMessage(ws)).toMatchObject({ type: 'login-ok', peerId: 'p1' });
  });

  test('login-error for empty username', () => {
    const ws = mockWs();
    dispatch(ws, 'p1', { type: 'login', username: '   ' });
    expect(lastMessage(ws)).toMatchObject({ type: 'login-error' });
  });

  test('login-error for duplicate username', () => {
    dispatch(mockWs(), 'p1', { type: 'login', username: 'alice' });
    const ws2 = mockWs();
    dispatch(ws2, 'p2', { type: 'login', username: 'alice' });
    expect(lastMessage(ws2)).toMatchObject({ type: 'login-error' });
  });

  test('username is trimmed to max 32 characters', () => {
    const ws = mockWs();
    const longName = 'a'.repeat(50);
    dispatch(ws, 'p1', { type: 'login', username: longName });
    expect(lastMessage(ws)).toMatchObject({ type: 'login-ok' });
    expect(users.findById('p1').username).toHaveLength(32);
  });
});

// ── create-room ────────────────────────────────────────────────────────────

describe('create-room', () => {
  test('room-created is sent with a room key', () => {
    const ws = mockWs();
    dispatch(ws, 'p1', { type: 'login', username: 'alice' });
    dispatch(ws, 'p1', { type: 'create-room' });
    expect(lastMessage(ws)).toMatchObject({ type: 'room-created' });
    expect(lastMessage(ws).roomKey).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/);
  });

  test('create-error when not logged in', () => {
    const ws = mockWs();
    dispatch(ws, 'p1', { type: 'create-room' });
    expect(lastMessage(ws)).toMatchObject({ type: 'create-error' });
  });

  test('create-error when already in a room', () => {
    const ws = mockWs();
    dispatch(ws, 'p1', { type: 'login', username: 'alice' });
    dispatch(ws, 'p1', { type: 'create-room' });
    dispatch(ws, 'p1', { type: 'create-room' });
    expect(lastMessage(ws)).toMatchObject({ type: 'create-error' });
  });
});

// ── join-room ──────────────────────────────────────────────────────────────

describe('join-room', () => {
  test('room-joined is sent with existing peers', () => {
    const wsHost = mockWs();
    dispatch(wsHost, 'host', { type: 'login', username: 'alice' });
    dispatch(wsHost, 'host', { type: 'create-room' });
    const roomKey = lastMessage(wsHost).roomKey;

    const wsGuest = mockWs();
    dispatch(wsGuest, 'guest', { type: 'login', username: 'bob' });
    dispatch(wsGuest, 'guest', { type: 'join-room', roomKey });

    const msg = lastMessage(wsGuest);
    expect(msg.type).toBe('room-joined');
    expect(msg.peers).toHaveLength(1);
    expect(msg.peers[0]).toMatchObject({ peerId: 'host', username: 'alice' });
  });

  test('peer-joined is broadcast to existing members', () => {
    const wsHost = mockWs();
    dispatch(wsHost, 'host', { type: 'login', username: 'alice' });
    dispatch(wsHost, 'host', { type: 'create-room' });
    const roomKey = lastMessage(wsHost).roomKey;

    const wsGuest = mockWs();
    dispatch(wsGuest, 'guest', { type: 'login', username: 'bob' });
    dispatch(wsGuest, 'guest', { type: 'join-room', roomKey });

    // wsHost should have received a peer-joined notification
    const hostMessages = sentMessages(wsHost);
    const joinedMsg = hostMessages.find((m) => m.type === 'peer-joined');
    expect(joinedMsg).toBeDefined();
    expect(joinedMsg).toMatchObject({ peerId: 'guest', username: 'bob' });
  });

  test('join-error for non-existent room', () => {
    const ws = mockWs();
    dispatch(ws, 'p1', { type: 'login', username: 'alice' });
    dispatch(ws, 'p1', { type: 'join-room', roomKey: 'ZZZ-ZZZ-ZZZ' });
    expect(lastMessage(ws)).toMatchObject({ type: 'join-error' });
  });

  test('join-error when not logged in', () => {
    const ws = mockWs();
    dispatch(ws, 'p1', { type: 'join-room', roomKey: 'ABC-DEF-GHJ' });
    expect(lastMessage(ws)).toMatchObject({ type: 'join-error' });
  });
});

// ── invite ─────────────────────────────────────────────────────────────────

describe('invite', () => {
  test('invite message is forwarded to the target user', () => {
    const wsHost = mockWs();
    dispatch(wsHost, 'host', { type: 'login', username: 'alice' });
    dispatch(wsHost, 'host', { type: 'create-room' });
    const roomKey = lastMessage(wsHost).roomKey;

    const wsTarget = mockWs();
    dispatch(wsTarget, 'target', { type: 'login', username: 'bob' });

    dispatch(wsHost, 'host', { type: 'invite', toUsername: 'bob' });

    expect(lastMessage(wsHost)).toMatchObject({ type: 'invite-sent', toUsername: 'bob' });
    const targetInvite = lastMessage(wsTarget);
    expect(targetInvite).toMatchObject({ type: 'invite', fromUsername: 'alice', roomKey });
  });

  test('invite-error when target is not online', () => {
    const ws = mockWs();
    dispatch(ws, 'host', { type: 'login', username: 'alice' });
    dispatch(ws, 'host', { type: 'create-room' });
    dispatch(ws, 'host', { type: 'invite', toUsername: 'nobody' });
    expect(lastMessage(ws)).toMatchObject({ type: 'invite-error' });
  });

  test('invite-error when inviting yourself', () => {
    const ws = mockWs();
    dispatch(ws, 'host', { type: 'login', username: 'alice' });
    dispatch(ws, 'host', { type: 'create-room' });
    dispatch(ws, 'host', { type: 'invite', toUsername: 'alice' });
    expect(lastMessage(ws)).toMatchObject({ type: 'invite-error' });
  });
});

// ── signal ─────────────────────────────────────────────────────────────────

describe('signal', () => {
  test('forwards signal data to the target peer', () => {
    const ws1 = mockWs();
    const ws2 = mockWs();
    dispatch(ws1, 'p1', { type: 'login', username: 'alice' });
    dispatch(ws2, 'p2', { type: 'login', username: 'bob' });

    const sigData = { sdp: 'offer-sdp', type: 'offer' };
    dispatch(ws1, 'p1', { type: 'signal', toPeerId: 'p2', data: sigData });

    const received = lastMessage(ws2);
    expect(received).toMatchObject({ type: 'signal', fromPeerId: 'p1', data: sigData });
  });

  test('drops signal to unknown peer silently', () => {
    const ws = mockWs();
    dispatch(ws, 'p1', { type: 'login', username: 'alice' });
    expect(() =>
      dispatch(ws, 'p1', { type: 'signal', toPeerId: 'ghost', data: {} }),
    ).not.toThrow();
  });
});

// ── leave-room / disconnect ────────────────────────────────────────────────

describe('leave-room', () => {
  test('left-room is sent to the leaver', () => {
    const ws = mockWs();
    dispatch(ws, 'host', { type: 'login', username: 'alice' });
    dispatch(ws, 'host', { type: 'create-room' });
    dispatch(ws, 'host', { type: 'leave-room' });
    expect(lastMessage(ws)).toMatchObject({ type: 'left-room' });
  });

  test('peer-left is broadcast to remaining members', () => {
    const wsHost = mockWs();
    dispatch(wsHost, 'host', { type: 'login', username: 'alice' });
    dispatch(wsHost, 'host', { type: 'create-room' });
    const roomKey = lastMessage(wsHost).roomKey;

    const wsGuest = mockWs();
    dispatch(wsGuest, 'guest', { type: 'login', username: 'bob' });
    dispatch(wsGuest, 'guest', { type: 'join-room', roomKey });

    dispatch(wsGuest, 'guest', { type: 'leave-room' });

    const hostMessages = sentMessages(wsHost);
    expect(hostMessages.some((m) => m.type === 'peer-left' && m.peerId === 'guest')).toBe(true);
  });
});

describe('handleDisconnect', () => {
  test('cleans up the user registry on disconnect', () => {
    const ws = mockWs();
    dispatch(ws, 'p1', { type: 'login', username: 'alice' });
    handleDisconnect('p1');
    expect(users.findById('p1')).toBeUndefined();
  });

  test('notifies room peers when a connected user disconnects', () => {
    const wsHost = mockWs();
    dispatch(wsHost, 'host', { type: 'login', username: 'alice' });
    dispatch(wsHost, 'host', { type: 'create-room' });
    const roomKey = lastMessage(wsHost).roomKey;

    const wsGuest = mockWs();
    dispatch(wsGuest, 'guest', { type: 'login', username: 'bob' });
    dispatch(wsGuest, 'guest', { type: 'join-room', roomKey });

    handleDisconnect('guest');

    const hostMessages = sentMessages(wsHost);
    expect(hostMessages.some((m) => m.type === 'peer-left' && m.peerId === 'guest')).toBe(true);
  });

  test('is a no-op for unknown peer IDs', () => {
    expect(() => handleDisconnect('nobody')).not.toThrow();
  });
});
