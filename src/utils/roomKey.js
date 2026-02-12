'use strict';

const { customAlphabet } = require('nanoid');

/**
 * Alphabet deliberately excludes visually ambiguous characters:
 *   0 / O     — easily confused when reading aloud
 *   1 / I / L — look identical in many monospace fonts
 *   5 / S     — similar shape
 *   8 / B     — similar shape
 *
 * Remaining characters: A C D E F G H J K M N P Q R T U V W X Y Z 2 3 4 6 7 9
 */
const ALPHABET = 'ACDEFGHJKMNPQRTUVWXYZ234679';
const SEGMENT_LEN = 3;
const SEGMENT_COUNT = 3;

const generateSegment = customAlphabet(ALPHABET, SEGMENT_LEN);

/**
 * Generates a unique, human-friendly room key in the format `XXX-XXX-XXX`.
 * @returns {string}
 */
function generateRoomKey() {
  return Array.from({ length: SEGMENT_COUNT }, generateSegment).join('-');
}

/**
 * Regex matching only the characters present in ALPHABET, in groups of 3
 * separated by hyphens.  Excludes the ambiguous characters listed above.
 */
const ROOM_KEY_RE = /^[ACDEFGHJKMNPQRTUVWXYZ234679]{3}-[ACDEFGHJKMNPQRTUVWXYZ234679]{3}-[ACDEFGHJKMNPQRTUVWXYZ234679]{3}$/;

/**
 * Returns true if `key` matches the expected room key format.
 * @param {string} key
 * @returns {boolean}
 */
function isValidRoomKey(key) {
  return typeof key === 'string' && ROOM_KEY_RE.test(key.toUpperCase());
}

/**
 * Normalises a user-provided room key to uppercase.
 * @param {string} key
 * @returns {string}
 */
function normaliseRoomKey(key) {
  return key.toUpperCase().trim();
}

module.exports = { generateRoomKey, isValidRoomKey, normaliseRoomKey };
