'use strict';

/**
 * SignalingClient tests use a wsFactory injection pattern so no real
 * network connections are made.  The mock WebSocket simulates the open /
 * message / close lifecycle that the client expects.
 */

const { SignalingClient } = require('../../src/client/signaling');
const { SignalingError } = require('../../src/utils/errors');

// ── Mock WebSocket factory ─────────────────────────────────────────────────

const WS_OPEN = 1;
const WS_CLOSED = 3;
const WS_CONNECTING = 0;

/**
 * Creates a controllable fake WebSocket instance.
 * Tests call the `_simulate*` helpers to push events into the client.
 */
function createMockWs() {
  const listeners = {};
  // Maps original fn → wrapper fn, so removeListener(event, originalFn) works
  // even when the listener was registered via once().
  const onceWrappers = new Map();

  function addListener(event, fn) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(fn);
  }

  function removeListener(event, fn) {
    // Check both the original fn and any once-wrapper that was created for it
    const wrapper = onceWrappers.get(fn);
    if (listeners[event]) {
      listeners[event] = listeners[event].filter((f) => f !== fn && f !== wrapper);
    }
    onceWrappers.delete(fn);
  }

  function fireEvent(event, ...args) {
    // Snapshot the list so once-wrappers can safely modify listeners[] mid-loop
    (listeners[event] || []).slice().forEach((fn) => fn(...args));
  }

  const ws = {
    readyState: WS_CONNECTING,
    send: jest.fn(),
    ping: jest.fn(),
    close: jest.fn(() => { ws.readyState = WS_CLOSED; }),

    on: jest.fn((event, fn) => addListener(event, fn)),

    // once: registers a self-removing wrapper and records original→wrapper
    once: jest.fn((event, fn) => {
      const wrapper = (...args) => {
        fn(...args);
        removeListener(event, fn);
      };
      onceWrappers.set(fn, wrapper);
      addListener(event, wrapper);
    }),

    removeListener: jest.fn((event, fn) => removeListener(event, fn)),

    // ── Test helpers ────────────────────────────────────────────────────────
    _simulateOpen() {
      ws.readyState = WS_OPEN;
      fireEvent('open');
    },
    _simulateMessage(payload) {
      const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
      fireEvent('message', raw);
    },
    _simulateClose() {
      ws.readyState = WS_CLOSED;
      fireEvent('close');
    },
    _simulateError(err) {
      fireEvent('error', err);
    },
  };

  return ws;
}

// ── Test setup ─────────────────────────────────────────────────────────────

let mockWsInstance;

/**
 * Builds a SignalingClient whose WebSocket is always the current mockWsInstance.
 * Uses the wsFactory constructor parameter to inject the mock.
 */
function makeClient(url = 'ws://localhost:3000') {
  // Must be a regular function (not an arrow) so `new factory(url)` works;
  // returning an object from a constructor causes `new` to use that object.
  function WsFactory() { return mockWsInstance; }
  WsFactory.OPEN = WS_OPEN;
  return new SignalingClient(url, WsFactory);
}

beforeEach(() => {
  mockWsInstance = createMockWs();
});

afterEach(() => {
  jest.clearAllMocks();
});

// ── connect() ─────────────────────────────────────────────────────────────

describe('connect()', () => {
  test('resolves when the socket opens', async () => {
    const client = makeClient();
    const p = client.connect();
    mockWsInstance._simulateOpen();
    await expect(p).resolves.toBeUndefined();
  });

  test('rejects with SignalingError when the socket errors before opening', async () => {
    const client = makeClient();
    const p = client.connect();
    mockWsInstance._simulateError(new Error('ECONNREFUSED'));
    await expect(p).rejects.toBeInstanceOf(SignalingError);
  });

  test('emits "open" after a successful connect', async () => {
    const client = makeClient();
    const spy = jest.fn();
    client.on('open', spy);
    const p = client.connect();
    mockWsInstance._simulateOpen();
    await p;
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

// ── message dispatch ───────────────────────────────────────────────────────

describe('message handling', () => {
  async function connectedClient() {
    const client = makeClient();
    const p = client.connect();
    mockWsInstance._simulateOpen();
    await p;
    return client;
  }

  test('emits the message type as an event', async () => {
    const client = await connectedClient();
    const spy = jest.fn();
    client.on('login-ok', spy);
    mockWsInstance._simulateMessage({ type: 'login-ok', peerId: 'abc-123' });
    expect(spy).toHaveBeenCalledWith({ type: 'login-ok', peerId: 'abc-123' });
  });

  test('emits peer-joined with correct payload', async () => {
    const client = await connectedClient();
    const spy = jest.fn();
    client.on('peer-joined', spy);
    mockWsInstance._simulateMessage({ type: 'peer-joined', peerId: 'p2', username: 'bob' });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ peerId: 'p2', username: 'bob' }));
  });

  test('silently ignores non-JSON messages', async () => {
    const client = await connectedClient();
    expect(() => mockWsInstance._simulateMessage('not valid json')).not.toThrow();
  });
});

// ── send convenience methods ───────────────────────────────────────────────

describe('send convenience methods', () => {
  async function connectedClient() {
    const client = makeClient();
    const p = client.connect();
    mockWsInstance._simulateOpen();
    await p;
    return client;
  }

  function lastSent() {
    const { calls } = mockWsInstance.send.mock;
    return calls.length ? JSON.parse(calls[calls.length - 1][0]) : null;
  }

  test('login() sends { type: "login", username }', async () => {
    const c = await connectedClient();
    c.login('alice');
    expect(lastSent()).toEqual({ type: 'login', username: 'alice' });
  });

  test('createRoom() sends { type: "create-room" }', async () => {
    const c = await connectedClient();
    c.createRoom();
    expect(lastSent()).toEqual({ type: 'create-room' });
  });

  test('joinRoom() sends the correct room key', async () => {
    const c = await connectedClient();
    c.joinRoom('ABC-DEF-GHJ');
    expect(lastSent()).toEqual({ type: 'join-room', roomKey: 'ABC-DEF-GHJ' });
  });

  test('leaveRoom() sends { type: "leave-room" }', async () => {
    const c = await connectedClient();
    c.leaveRoom();
    expect(lastSent()).toEqual({ type: 'leave-room' });
  });

  test('signal() includes toPeerId and data', async () => {
    const c = await connectedClient();
    c.signal('p2', { sdp: 'offer-sdp' });
    expect(lastSent()).toMatchObject({ type: 'signal', toPeerId: 'p2', data: { sdp: 'offer-sdp' } });
  });

  test('invite() sends the correct target username', async () => {
    const c = await connectedClient();
    c.invite('charlie');
    expect(lastSent()).toEqual({ type: 'invite', toUsername: 'charlie' });
  });

  test('send() is a no-op when socket is not open', async () => {
    const c = await connectedClient();
    mockWsInstance.readyState = WS_CLOSED;
    c.login('alice');
    expect(mockWsInstance.send).not.toHaveBeenCalled();
  });
});

// ── disconnect() ──────────────────────────────────────────────────────────

describe('disconnect()', () => {
  test('closes the socket', async () => {
    const client = makeClient();
    const p = client.connect();
    mockWsInstance._simulateOpen();
    await p;

    client.disconnect();

    expect(mockWsInstance.close).toHaveBeenCalled();
  });

  test('isConnected is false after disconnect', async () => {
    const client = makeClient();
    const p = client.connect();
    mockWsInstance._simulateOpen();
    await p;

    client.disconnect();

    expect(client.isConnected).toBe(false);
  });
});

// ── isConnected ────────────────────────────────────────────────────────────

describe('isConnected', () => {
  test('is false before connecting', () => {
    expect(makeClient().isConnected).toBe(false);
  });

  test('is true after a successful connect', async () => {
    const client = makeClient();
    const p = client.connect();
    mockWsInstance._simulateOpen();
    await p;
    expect(client.isConnected).toBe(true);
  });
});
