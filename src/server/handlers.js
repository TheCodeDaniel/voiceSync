'use strict';

const rooms = require('./rooms');
const users = require('./users');
const logger = require('../utils/logger');

// WebSocket OPEN ready-state constant
const WS_OPEN = 1;

// ── Low-level helpers ──────────────────────────────────────────────────────

/**
 * Sends a JSON payload to a single WebSocket client.
 * Silently drops the message if the socket is not open.
 *
 * @param {import('ws').WebSocket} ws
 * @param {Object} payload
 */
function send(ws, payload) {
  if (ws.readyState === WS_OPEN) ws.send(JSON.stringify(payload));
}

/**
 * Sends a JSON payload to every peer in a room except the named sender.
 *
 * @param {import('../server/rooms').Room} room
 * @param {string}                         excludePeerId
 * @param {Object}                         payload
 */
function broadcast(room, excludePeerId, payload) {
  for (const [peerId, peer] of room.peers) {
    if (peerId !== excludePeerId) send(peer.socket, payload);
  }
}

// ── Message handlers ───────────────────────────────────────────────────────

function handleLogin(ws, peerId, { username }) {
  if (!username || typeof username !== 'string' || !username.trim()) {
    return send(ws, { type: 'login-error', message: 'Username is required.' });
  }
  const name = username.trim().slice(0, 32);
  const result = users.registerUser(peerId, name, ws);
  if (!result.ok) {
    return send(ws, { type: 'login-error', message: `Username "${name}" is already taken.` });
  }
  logger.info(`User "${name}" logged in (peerId: ${peerId})`);
  send(ws, { type: 'login-ok', peerId });
}

function handleCreateRoom(ws, peerId) {
  const user = users.findById(peerId);
  if (!user) return send(ws, { type: 'create-error', message: 'Not logged in.' });
  if (user.roomKey) return send(ws, { type: 'create-error', message: 'Already in a room.' });

  const room = rooms.createRoom(peerId, user.username, ws);
  users.setUserRoom(peerId, room.key);
  logger.info(`Room "${room.key}" created by "${user.username}"`);
  send(ws, { type: 'room-created', roomKey: room.key });
}

function handleJoinRoom(ws, peerId, { roomKey }) {
  const user = users.findById(peerId);
  if (!user) return send(ws, { type: 'join-error', message: 'Not logged in.' });
  if (user.roomKey) return send(ws, { type: 'join-error', message: 'Already in a room.' });

  let room;
  try {
    room = rooms.joinRoom(roomKey, peerId, user.username, ws);
  } catch (err) {
    return send(ws, { type: 'join-error', message: err.message });
  }

  users.setUserRoom(peerId, roomKey);

  // Tell the new joiner about everyone already in the room
  const existingPeers = Array.from(room.peers.entries())
    .filter(([id]) => id !== peerId)
    .map(([id, peer]) => ({ peerId: id, username: peer.username }));

  send(ws, { type: 'room-joined', roomKey, peers: existingPeers });

  // Tell everyone else about the new arrival
  broadcast(room, peerId, { type: 'peer-joined', peerId, username: user.username });
  logger.info(`"${user.username}" joined room "${roomKey}"`);
}

function handleInvite(ws, peerId, { toUsername }) {
  const inviter = users.findById(peerId);
  if (!inviter) return send(ws, { type: 'invite-error', message: 'Not logged in.' });
  if (!inviter.roomKey) return send(ws, { type: 'invite-error', message: 'You must be in a room to invite.' });
  if (!toUsername) return send(ws, { type: 'invite-error', message: 'Target username is required.' });

  const target = users.findByUsername(toUsername);
  if (!target) return send(ws, { type: 'invite-error', message: `User "${toUsername}" is not online.` });
  if (target.peerId === peerId) return send(ws, { type: 'invite-error', message: 'Cannot invite yourself.' });
  if (target.roomKey) return send(ws, { type: 'invite-error', message: `"${toUsername}" is already in a call.` });

  send(target.socket, { type: 'invite', fromUsername: inviter.username, roomKey: inviter.roomKey });
  send(ws, { type: 'invite-sent', toUsername });
  logger.info(`"${inviter.username}" invited "${toUsername}" to room "${inviter.roomKey}"`);
}

function handleAcceptInvite(ws, peerId, { roomKey }) {
  // Accepting an invite is identical to joining the room directly
  handleJoinRoom(ws, peerId, { roomKey });
}

function handleDeclineInvite(ws, peerId, { roomKey }) {
  const user = users.findById(peerId);
  if (!user) return;
  const room = rooms.getRoom(roomKey);
  if (!room) return;
  broadcast(room, peerId, { type: 'invite-declined', username: user.username });
  logger.info(`"${user.username}" declined invite to room "${roomKey}"`);
}

function handleSignal(ws, peerId, { toPeerId, data }) {
  const target = users.findById(toPeerId);
  if (target) send(target.socket, { type: 'signal', fromPeerId: peerId, data });
}

function handleLeaveRoom(ws, peerId) {
  const user = users.findById(peerId);
  if (!user || !user.roomKey) return;
  const roomKey = user.roomKey;
  const { room } = rooms.leaveRoom(roomKey, peerId);
  users.setUserRoom(peerId, null);
  if (room && room.peers.size > 0) {
    broadcast(room, peerId, { type: 'peer-left', peerId, username: user.username });
  }
  send(ws, { type: 'left-room' });
  logger.info(`"${user.username}" left room "${roomKey}"`);
}

// ── Dispatch ──────────────────────────────────────────────────────────────

/** Maps message type strings to their handler functions. */
const MESSAGE_HANDLERS = {
  'login':          handleLogin,
  'create-room':    handleCreateRoom,
  'join-room':      handleJoinRoom,
  'invite':         handleInvite,
  'accept-invite':  handleAcceptInvite,
  'decline-invite': handleDeclineInvite,
  'signal':         handleSignal,
  'leave-room':     handleLeaveRoom,
};

/**
 * Parses and dispatches an incoming WebSocket message.
 *
 * @param {import('ws').WebSocket} ws
 * @param {string}                 peerId
 * @param {string}                 rawMessage
 */
function handleMessage(ws, peerId, rawMessage) {
  let msg;
  try {
    msg = JSON.parse(rawMessage);
  } catch {
    logger.warn(`Non-JSON message received from ${peerId}`);
    return;
  }

  const handler = MESSAGE_HANDLERS[msg.type];
  if (handler) {
    handler(ws, peerId, msg);
  } else {
    logger.warn(`Unknown message type "${msg.type}" from ${peerId}`);
  }
}

/**
 * Cleans up a peer that disconnected without sending a leave-room message.
 *
 * @param {string} peerId
 */
function handleDisconnect(peerId) {
  const user = users.findById(peerId);
  if (user?.roomKey) {
    const { room } = rooms.leaveRoom(user.roomKey, peerId);
    if (room && room.peers.size > 0) {
      broadcast(room, peerId, { type: 'peer-left', peerId, username: user.username });
    }
  }
  users.unregisterUser(peerId);
  logger.info(`Peer ${peerId} disconnected`);
}

module.exports = { handleMessage, handleDisconnect, send, broadcast };
