'use strict';

const { generateRoomKey } = require('../utils/roomKey');
const { RoomError } = require('../utils/errors');

/**
 * @typedef {Object} RoomPeer
 * @property {string} username
 * @property {import('ws').WebSocket} socket
 */

/**
 * @typedef {Object} Room
 * @property {string}                   key
 * @property {string}                   hostPeerId
 * @property {Map<string, RoomPeer>}    peers       - peerId → { username, socket }
 * @property {Date}                     createdAt
 */

/** @type {Map<string, Room>} */
const _rooms = new Map();

/**
 * Creates a new room, adds the host as its first peer, and persists it.
 *
 * @param {string}                 hostPeerId
 * @param {string}                 hostUsername
 * @param {import('ws').WebSocket} socket
 * @returns {Room}
 */
function createRoom(hostPeerId, hostUsername, socket) {
  const key = generateRoomKey();
  const room = {
    key,
    hostPeerId,
    peers: new Map([[hostPeerId, { username: hostUsername, socket }]]),
    createdAt: new Date(),
  };
  _rooms.set(key, room);
  return room;
}

/**
 * Adds a peer to an existing room.
 *
 * @param {string}                 key
 * @param {string}                 peerId
 * @param {string}                 username
 * @param {import('ws').WebSocket} socket
 * @returns {Room}
 * @throws {RoomError} ROOM_NOT_FOUND if the key does not exist
 * @throws {RoomError} ALREADY_IN_ROOM if peerId is already present
 */
function joinRoom(key, peerId, username, socket) {
  const room = _rooms.get(key);
  if (!room) throw new RoomError(`Room "${key}" does not exist.`, 'ROOM_NOT_FOUND');
  if (room.peers.has(peerId)) throw new RoomError('Already in this room.', 'ALREADY_IN_ROOM');
  room.peers.set(peerId, { username, socket });
  return room;
}

/**
 * Removes a peer from their room.  Deletes the room when it becomes empty.
 *
 * @param {string} key
 * @param {string} peerId
 * @returns {{ room: Room|null, wasEmpty: boolean }}
 */
function leaveRoom(key, peerId) {
  const room = _rooms.get(key);
  if (!room) return { room: null, wasEmpty: true };
  room.peers.delete(peerId);
  const wasEmpty = room.peers.size === 0;
  if (wasEmpty) _rooms.delete(key);
  return { room, wasEmpty };
}

/**
 * Looks up a room by key.
 * @param {string} key
 * @returns {Room|undefined}
 */
function getRoom(key) {
  return _rooms.get(key);
}

/**
 * Returns all active room keys.
 * @returns {string[]}
 */
function listRooms() {
  return Array.from(_rooms.keys());
}

/**
 * Removes all rooms — used only by the test suite.
 */
function clearRooms() {
  _rooms.clear();
}

module.exports = { createRoom, joinRoom, leaveRoom, getRoom, listRooms, clearRooms };
