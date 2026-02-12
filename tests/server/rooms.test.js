'use strict';

const rooms = require('../../src/server/rooms');
const { RoomError } = require('../../src/utils/errors');

/** Minimal WebSocket stub — only readyState is needed by handlers. */
const fakeSocket = () => ({ readyState: 1, send: jest.fn() });

beforeEach(() => rooms.clearRooms());

describe('createRoom', () => {
  test('returns a room with a valid key', () => {
    const ws = fakeSocket();
    const room = rooms.createRoom('peer-1', 'alice', ws);
    expect(room.key).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/);
    expect(room.hostPeerId).toBe('peer-1');
  });

  test('adds the host as the first peer', () => {
    const ws = fakeSocket();
    const room = rooms.createRoom('peer-1', 'alice', ws);
    expect(room.peers.size).toBe(1);
    expect(room.peers.get('peer-1').username).toBe('alice');
  });

  test('persists the room so getRoom finds it', () => {
    const ws = fakeSocket();
    const room = rooms.createRoom('peer-1', 'alice', ws);
    expect(rooms.getRoom(room.key)).toBe(room);
  });

  test('each call generates a unique key', () => {
    const ws = fakeSocket();
    const keys = new Set(
      Array.from({ length: 50 }, () => rooms.createRoom(`p-${Math.random()}`, 'u', ws).key),
    );
    expect(keys.size).toBe(50);
  });
});

describe('joinRoom', () => {
  test('adds a peer to the room', () => {
    const ws = fakeSocket();
    const room = rooms.createRoom('host', 'alice', ws);
    rooms.joinRoom(room.key, 'peer-2', 'bob', ws);
    expect(room.peers.size).toBe(2);
    expect(room.peers.get('peer-2').username).toBe('bob');
  });

  test('returns the updated room', () => {
    const ws = fakeSocket();
    const room = rooms.createRoom('host', 'alice', ws);
    const returned = rooms.joinRoom(room.key, 'peer-2', 'bob', ws);
    expect(returned).toBe(room);
  });

  test('throws ROOM_NOT_FOUND when key does not exist', () => {
    expect(() => rooms.joinRoom('ZZZ-ZZZ-ZZZ', 'p', 'x', fakeSocket())).toThrow(RoomError);
    expect(() => rooms.joinRoom('ZZZ-ZZZ-ZZZ', 'p', 'x', fakeSocket()))
      .toThrow(expect.objectContaining({ code: 'ROOM_NOT_FOUND' }));
  });

  test('throws ALREADY_IN_ROOM when the same peerId joins twice', () => {
    const ws = fakeSocket();
    const room = rooms.createRoom('host', 'alice', ws);
    expect(() => rooms.joinRoom(room.key, 'host', 'alice', ws))
      .toThrow(expect.objectContaining({ code: 'ALREADY_IN_ROOM' }));
  });
});

describe('leaveRoom', () => {
  test('removes the peer from the room', () => {
    const ws = fakeSocket();
    const room = rooms.createRoom('host', 'alice', ws);
    rooms.joinRoom(room.key, 'guest', 'bob', ws);
    rooms.leaveRoom(room.key, 'guest');
    expect(room.peers.has('guest')).toBe(false);
  });

  test('wasEmpty is false when peers remain', () => {
    const ws = fakeSocket();
    const room = rooms.createRoom('host', 'alice', ws);
    rooms.joinRoom(room.key, 'guest', 'bob', ws);
    const { wasEmpty } = rooms.leaveRoom(room.key, 'guest');
    expect(wasEmpty).toBe(false);
  });

  test('deletes the room and wasEmpty is true when last peer leaves', () => {
    const ws = fakeSocket();
    const room = rooms.createRoom('host', 'alice', ws);
    const { wasEmpty } = rooms.leaveRoom(room.key, 'host');
    expect(wasEmpty).toBe(true);
    expect(rooms.getRoom(room.key)).toBeUndefined();
  });

  test('returns room: null when key does not exist', () => {
    const { room, wasEmpty } = rooms.leaveRoom('NO-SUCH-KEY', 'peer');
    expect(room).toBeNull();
    expect(wasEmpty).toBe(true);
  });
});

describe('listRooms', () => {
  test('returns empty array when no rooms exist', () => {
    expect(rooms.listRooms()).toEqual([]);
  });

  test('lists all created rooms', () => {
    const ws = fakeSocket();
    const r1 = rooms.createRoom('a', 'alice', ws);
    const r2 = rooms.createRoom('b', 'bob', ws);
    const keys = rooms.listRooms();
    expect(keys).toContain(r1.key);
    expect(keys).toContain(r2.key);
    expect(keys.length).toBe(2);
  });
});
