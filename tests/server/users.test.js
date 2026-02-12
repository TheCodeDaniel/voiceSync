'use strict';

const users = require('../../src/server/users');

const fakeSocket = () => ({ readyState: 1 });

beforeEach(() => users.clearUsers());

describe('registerUser', () => {
  test('returns { ok: true } on first registration', () => {
    const result = users.registerUser('p1', 'alice', fakeSocket());
    expect(result).toEqual({ ok: true, conflict: false });
  });

  test('stores the user so findById works', () => {
    const ws = fakeSocket();
    users.registerUser('p1', 'alice', ws);
    const user = users.findById('p1');
    expect(user).toBeDefined();
    expect(user.username).toBe('alice');
    expect(user.peerId).toBe('p1');
    expect(user.roomKey).toBeNull();
  });

  test('returns { ok: false, conflict: true } when username is taken (same case)', () => {
    users.registerUser('p1', 'alice', fakeSocket());
    const result = users.registerUser('p2', 'alice', fakeSocket());
    expect(result).toEqual({ ok: false, conflict: true });
  });

  test('returns { ok: false, conflict: true } for case-insensitive duplicate', () => {
    users.registerUser('p1', 'Alice', fakeSocket());
    const result = users.registerUser('p2', 'alice', fakeSocket());
    expect(result).toEqual({ ok: false, conflict: true });
  });

  test('different usernames can coexist', () => {
    expect(users.registerUser('p1', 'alice', fakeSocket()).ok).toBe(true);
    expect(users.registerUser('p2', 'bob', fakeSocket()).ok).toBe(true);
  });
});

describe('unregisterUser', () => {
  test('removes the user from the registry', () => {
    users.registerUser('p1', 'alice', fakeSocket());
    users.unregisterUser('p1');
    expect(users.findById('p1')).toBeUndefined();
  });

  test('is a no-op for unknown peer IDs', () => {
    expect(() => users.unregisterUser('unknown')).not.toThrow();
  });
});

describe('findById', () => {
  test('returns undefined for an unknown peer ID', () => {
    expect(users.findById('no-such-peer')).toBeUndefined();
  });
});

describe('findByUsername', () => {
  test('finds a user by exact username', () => {
    users.registerUser('p1', 'alice', fakeSocket());
    expect(users.findByUsername('alice')).toBeDefined();
  });

  test('finds a user case-insensitively', () => {
    users.registerUser('p1', 'Alice', fakeSocket());
    expect(users.findByUsername('alice')).toBeDefined();
    expect(users.findByUsername('ALICE')).toBeDefined();
  });

  test('returns undefined for an unknown username', () => {
    expect(users.findByUsername('nobody')).toBeUndefined();
  });
});

describe('setUserRoom', () => {
  test('associates a user with a room', () => {
    users.registerUser('p1', 'alice', fakeSocket());
    users.setUserRoom('p1', 'AAA-BBB-CCC');
    expect(users.findById('p1').roomKey).toBe('AAA-BBB-CCC');
  });

  test('clears the room by setting null', () => {
    users.registerUser('p1', 'alice', fakeSocket());
    users.setUserRoom('p1', 'AAA-BBB-CCC');
    users.setUserRoom('p1', null);
    expect(users.findById('p1').roomKey).toBeNull();
  });

  test('is a no-op for unknown peer IDs', () => {
    expect(() => users.setUserRoom('unknown', 'KEY')).not.toThrow();
  });
});

describe('listUsers', () => {
  test('returns empty array when no users are registered', () => {
    expect(users.listUsers()).toEqual([]);
  });

  test('returns all registered users', () => {
    users.registerUser('p1', 'alice', fakeSocket());
    users.registerUser('p2', 'bob', fakeSocket());
    const list = users.listUsers();
    expect(list).toHaveLength(2);
    const names = list.map((u) => u.username);
    expect(names).toContain('alice');
    expect(names).toContain('bob');
  });
});
