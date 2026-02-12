'use strict';

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js'],
  coverageDirectory: 'coverage',
  // Silence chalk color codes in test output
  setupFiles: ['<rootDir>/tests/setup.js'],
  // Forcibly exit after the suite so open handles (e.g. ping intervals)
  // do not hang the CI process.
  forceExit: true,
};
