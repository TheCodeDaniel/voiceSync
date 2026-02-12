'use strict';

const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { WebSocketServer } = require('ws');
const { handleMessage, handleDisconnect } = require('./handlers');
const logger = require('../utils/logger');

/**
 * Builds the Express + WebSocket signaling server.
 *
 * The HTTP layer exposes only lightweight health/ping endpoints.
 * All real-time communication goes over the WebSocket upgrade.
 *
 * @returns {{ httpServer: http.Server, wss: WebSocketServer, app: import('express').Application }}
 */
function createServer() {
  const app = express();

  // ── HTTP endpoints ────────────────────────────────────────────────────────
  app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
  app.get('/ping', (_req, res) => res.send('pong'));

  const httpServer = http.createServer(app);

  // ── WebSocket layer ───────────────────────────────────────────────────────
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws) => {
    // Assign every connection a server-side UUID as its peer ID.
    // This is sent to the client immediately so it knows its own identity.
    const peerId = crypto.randomUUID();
    logger.debug(`New WS connection: peerId=${peerId}`);

    ws.on('message', (data) => handleMessage(ws, peerId, data.toString()));
    ws.on('close', () => handleDisconnect(peerId));
    ws.on('error', (err) => logger.error(`WS error (${peerId}): ${err.message}`));

    ws.send(JSON.stringify({ type: 'connected', peerId }));
  });

  return { httpServer, wss, app };
}

module.exports = { createServer };
