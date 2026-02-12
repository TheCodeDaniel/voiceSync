'use strict';

/**
 * @typedef {Object} OnlineUser
 * @property {string}                   peerId
 * @property {string}                   username
 * @property {import('ws').WebSocket}   socket
 * @property {string|null}              roomKey  - null when not in any room
 */

/** @type {Map<string, OnlineUser>} peerId → user */
const _users = new Map();

/**
 * Registers a new user in the online registry.
 *
 * @param {string}                 peerId
 * @param {string}                 username
 * @param {import('ws').WebSocket} socket
 * @returns {{ ok: boolean, conflict: boolean }}
 */
function registerUser(peerId, username, socket) {
  if (findByUsername(username)) return { ok: false, conflict: true };
  _users.set(peerId, { peerId, username, socket, roomKey: null });
  return { ok: true, conflict: false };
}

/**
 * Removes a user from the registry.
 * @param {string} peerId
 */
function unregisterUser(peerId) {
  _users.delete(peerId);
}

/**
 * Looks up a user by their server-assigned peer ID.
 * @param {string} peerId
 * @returns {OnlineUser|undefined}
 */
function findById(peerId) {
  return _users.get(peerId);
}

/**
 * Looks up a user by display name (case-insensitive).
 * @param {string} username
 * @returns {OnlineUser|undefined}
 */
function findByUsername(username) {
  const lower = username.toLowerCase();
  for (const user of _users.values()) {
    if (user.username.toLowerCase() === lower) return user;
  }
  return undefined;
}

/**
 * Associates (or dissociates) a user with a room.
 * @param {string}      peerId
 * @param {string|null} roomKey
 */
function setUserRoom(peerId, roomKey) {
  const user = _users.get(peerId);
  if (user) user.roomKey = roomKey;
}

/**
 * Returns every currently online user.
 * @returns {OnlineUser[]}
 */
function listUsers() {
  return Array.from(_users.values());
}

/**
 * Removes all users — used only by the test suite.
 */
function clearUsers() {
  _users.clear();
}

module.exports = {
  registerUser,
  unregisterUser,
  findById,
  findByUsername,
  setUserRoom,
  listUsers,
  clearUsers,
};
