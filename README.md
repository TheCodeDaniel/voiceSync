<div align="center">

# 🎙️ VoiceSync

**Crystal Clear Voice Chat. Straight from your Terminal.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)](https://nodejs.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

[Features](#-features) •
[Installation](#-installation) •
[Quick Start](#-quick-start) •
[Commands](#-commands) •
[Contributing](#-contributing)

---

<!-- 
  🎥 DEMO VIDEO PLACEHOLDER 
  Replace this comment with your demo video or GIF! 
  Example: ![Demo](https://your-url.com/demo.gif)
-->
<p align="center">
  <b>YOUR DEMO VIDEO HERE</b><br>
  <i>(Show off that beautiful TUI!)</i>
</p>

---

</div>

## 🚀 Introduction

**VoiceSync** is a lightweight, terminal-based voice chat application built for developers who live in the command line. No bloat, no heavy electron apps—just you, your friends, and low-latency audio.

Powered by **WebRTC** for peer-to-peer audio streaming and **WebSockets** for lightning-fast signaling.

## ✨ Features

- **P2P Audio**: Direct connection for minimal latency.
- **Terminal UI**: A beautiful, responsive TUI built with `blessed`.
- **Zero Config**: Works out of the box with a public signaling server (or host your own!).
- **Secure Rooms**: Generate unique, readable room keys to keep your conversations private.
- **Cross-Platform**: Runs on macOS, Linux, and Windows.

## 📦 Installation

### Global Install (Recommended for Users)

Install `voicesync` globally to access the CLI from anywhere.

```bash
npm install -g voicesync
```

### Local Install (Recommended for Developers)

Clone the repo and install dependencies to hack on the code.

```bash
git clone https://github.com/yourusername/voice_sync.git
cd voice_sync
npm install
```

## ⚡ Quick Start

### 1. Start the Signaling Server
**(Optional)** You can skip this if you have a remote server URL. For local testing, spin one up:

```bash
voicesync server
# Server listening on port 3000...
```

### 2. Host a Room
Create a new room and become the host.

```bash
voicesync start -u Alice
```
You'll get a **Room Key** (e.g., `ACK-MNP-7TZ`). send this to your friend!

### 3. Join a Room
Your friend joins using the key you shared.

```bash
voicesync join ACK-MNP-7TZ -u Bob
```

*Boom! You're talking.* 🗣️

## 🌐 Connecting Across Devices

### 🏠 Local Network (LAN)

Chat between two devices on the same Wi-Fi network (e.g., your Mac and a Windows laptop at home).

**Step 1 — Find your local IP (on the machine that will run the server):**

```bash
# macOS
ipconfig getifaddr en0

# Windows (look for "IPv4 Address" under your Wi-Fi adapter)
ipconfig

# Linux
hostname -I
```

You'll get something like `192.168.0.227`.

**Step 2 — Start the server on that machine:**

```bash
voicesync server -p 3000
```

The server binds to `0.0.0.0` by default, so it's accessible from other devices on the network.

**Step 3 — Host a room (on the same machine, or a different one):**

If hosting from the **same machine** as the server:
```bash
voicesync start -u Alice -s ws://localhost:3000
```

If hosting from a **different machine** on the LAN:
```bash
voicesync start -u Alice -s ws://192.168.0.227:3000
```

You'll get a **Room Key** (e.g., `ACK-MNP-7TZ`). Share this with your friend.

**Step 4 — Friend joins from their machine:**

```bash
voicesync join ACK-MNP-7TZ -u Bob -s ws://192.168.0.227:3000
```

> **Troubleshooting:** If the connection fails, check that port 3000 isn't blocked by your firewall.
> - **macOS:** System Settings → Network → Firewall → allow Node.js
> - **Windows:** Windows Defender Firewall → allow Node.js through

---

### 🌍 Internet (ngrok)

Chat with friends anywhere in the world without deploying a server. [ngrok](https://ngrok.com/) creates a public tunnel to your local server.

**Step 1 — Install ngrok** (one-time setup):

```bash
# macOS (Homebrew)
brew install ngrok

# Windows (Chocolatey)
choco install ngrok

# Or download from https://ngrok.com/download
```

Sign up at [ngrok.com](https://ngrok.com/) and authenticate:
```bash
ngrok config add-authtoken YOUR_AUTH_TOKEN
```

**Step 2 — Start the VoiceSync server:**

```bash
voicesync server -p 3000
```

**Step 3 — Expose it via ngrok:**

```bash
ngrok http 3000
```

ngrok will show a forwarding URL like:
```
Forwarding  https://abc-123-def.ngrok-free.app -> http://localhost:3000
```

**Step 4 — Host a room (you, on the server machine):**

```bash
voicesync start -u Alice -s ws://localhost:3000
```

Share the **Room Key** AND the **ngrok URL** with your friend.

**Step 5 — Friend joins from anywhere:**

Replace `https://` with `wss://` in the ngrok URL:

```bash
voicesync join ACK-MNP-7TZ -u Bob -s wss://abc-123-def.ngrok-free.app
```

> **Important:** Use `wss://` (not `ws://` or `https://`). WebSocket Secure (`wss`) is required because ngrok tunnels use HTTPS.

> **Note:** The free ngrok plan gives you a new URL each time you restart ngrok. Paid plans offer fixed subdomains.

---

## 🎮 In-Call Controls

Once you're in a call, you have full control via keyboard shortcuts:

| Key | Action | Description |
| :---: | :--- | :--- |
| **`M`** | **Mute/Unmute** | Toggle your microphone on/off. |
| **`C`** | **Chat** | Open the chat input to send a message. |
| **`Q`** | **Leave** | Leave the call and exit. |
| **`?`** | **Help** | Show shortcut reminder. |
| **`Ctrl+C`** | **Force Quit** | Emergency exit. |

### 💬 In-Call Chat

Press **`C`** to open the chat input. Type your message and press **Enter** to send, or **Esc** to cancel.

Messages appear in the chat panel on the right side of the dashboard. When the terminal is in the background, you'll receive **OS push notifications** for incoming messages (macOS, Windows, and Linux).

### 📊 Status Bar

The bottom status bar shows real-time information:

- **MIC ON / MIC OFF** — your microphone state (green/red)
- **Audio waveform** — compact visualization of your mic activity
- **Ping** — round-trip latency to the server (green < 80ms, yellow < 200ms, red > 200ms)
- **Quality** — call quality rating based on latency (Excellent / Good / Fair / Poor)

## 🛠️ Commands

### `voicesync server`
Starts the WebSocket signaling server.
- `-p, --port <number>`: Set port (default: `3000`)
- `-H, --host <string>`: Set host (default: `0.0.0.0`)

### `voicesync start`
Creates a new voice room.
- `-s, --server <url>`: Signaling server URL (default: `ws://localhost:3000`)
- `-u, --username <name>`: Your display name

### `voicesync join <key>`
Joins an existing room.
- `-s, --server <url>`: Signaling server URL (default: `ws://localhost:3000`)
- `-u, --username <name>`: Your display name

## 🧪 Development

Run the test suite to ensure everything is working correctly.

```bash
npm test
```

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/yourusername/voice_sync/issues).

## 📄 License

This project is [MIT](https://opensource.org/licenses/MIT) licensed.

---

<div align="center">
  Made with ❤️ by <a href="https://github.com/TheCodeDaniel">Daniel</a>
</div>
