# VoiceSync

Terminal-based real-time voice chat. Create a room, share the key, talk.

Built with WebRTC for peer-to-peer audio and WebSocket signaling.

## Requirements

- Node.js >= 16
- A working microphone and speakers (for actual voice chat)

## Install

```bash
git clone <repo-url> && cd voice_sync
npm install
```

### Global install

```bash
npm install -g .
```

This makes the `voicesync` command available everywhere.

## Quick Start

**1. Start the signaling server**

```bash
voicesync server
```

**2. Create a room**

```bash
voicesync start -u alice
```

A room key like `ACK-MNP-7TZ` is displayed. Share it with others.

**3. Join the room**

```bash
voicesync join ACK-MNP-7TZ -u bob
```

That's it. You're in a voice call.

## Testing Locally (Same PC)

You need **3 terminal windows** open side by side:

**Terminal 1 — Server**

```bash
node bin/voicesync.js server
```

**Terminal 2 — Create a room**

```bash
node bin/voicesync.js start -u alice
```

Copy the room key that appears (e.g. `ACK-MNP-7TZ`).

**Terminal 3 — Join the room**

```bash
node bin/voicesync.js join ACK-MNP-7TZ -u bob
```

Both terminals should now show the in-call dashboard with both participants listed.

## Commands

### `voicesync server`

Start the signaling server.

| Option              | Default   | Description       |
| ------------------- | --------- | ----------------- |
| `-p, --port <port>` | `3000`    | Port to listen on |
| `-H, --host <host>` | `0.0.0.0` | Host to bind to   |

```bash
voicesync server -p 4000
```

The server exposes a `/health` endpoint for monitoring.

### `voicesync start`

Create a new voice room and host it.

| Option                  | Default               | Description          |
| ----------------------- | --------------------- | -------------------- |
| `-s, --server <url>`    | `ws://localhost:3000` | Signaling server URL |
| `-u, --username <name>` | _(prompted)_          | Your display name    |

```bash
voicesync start -s ws://myserver.com:3000 -u alice
```

### `voicesync join [roomKey]`

Join an existing room.

| Option                  | Default               | Description          |
| ----------------------- | --------------------- | -------------------- |
| `-s, --server <url>`    | `ws://localhost:3000` | Signaling server URL |
| `-u, --username <name>` | _(prompted)_          | Your display name    |

```bash
voicesync join ABC-DEF-GHJ -u bob
```

If you omit the room key or username, you'll be prompted for them.

## Environment Variables

| Variable           | Description                                             |
| ------------------ | ------------------------------------------------------- |
| `VOICESYNC_SERVER` | Default signaling server URL (overridden by `--server`) |

## In-Call Controls

Once in a room, the dashboard shows participants and an audio waveform.

| Key | Action                 |
| --- | ---------------------- |
| `M` | Mute / Unmute          |
| `I` | Show invite (room key) |
| `Q` | Leave the call         |
| `?` | Help                   |

## Room Keys

Keys use the format `XXX-XXX-XXX` with an alphabet that excludes visually ambiguous characters (`0, 1, 5, 8, O, I, L, S, B`), so they're easy to read aloud and type.

## Running Tests

```bash
npm test
```

## License

MIT
