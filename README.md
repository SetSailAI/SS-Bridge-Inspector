# WebSocket POC

A React app for testing WebSocket connections to chatbot APIs. Connect to a Socket.IO server, send messages, and inspect raw request/response data in real time.

## Features

- **Connection** – Configure server URL, API key, path, chatbot ID, and page ID. Connect or disconnect with one click.
- **Inject param** – Configure `app_user_id`, `app_flight_ids`, and `app_has_mytag` and send them on every message.
- **Send messages** – Type and send messages while connected. Supports Enter key to send.
- **Raw data log** – View all sent and received payloads as formatted JSON with timestamps.
- **Clear & reconnect** – Clear the log and reconnect with the same config in one action.

## Quick Start

```bash
git clone <repo-url>
cd websocket-poc
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

## Configuration

| Field      | Description |
|------------|-------------|
| **Server URL** | WebSocket server host. Supports `http://`, `https://`, `ws://`, or `wss://`; the app normalizes to the correct protocol. |
| **API Key** | Authentication token sent in the connection handshake. |
| **Path** | Socket.IO path (e.g. `/engine/ws/socket.io/`). |
| **Chatbot ID** | Bot identifier used in `client-message` events. |
| **Page ID** | Page identifier used in `client-message` events. |
| **isKiosk** | When enabled, adds `platform: "kiosk"` to message parameters. |
| **Inject param: app_user_id** | AAHK app user identifier. |
| **Inject param: app_flight_ids** | JSON array of `{ id, timestamp }`; sent as JSON-stringified string in payload. |
| **Inject param: app_has_mytag** | `"true"` or `"false"` string value. |

Configuration fields are locked while connected. Disconnect to change them.

## Protocol

**On connect**, the app sends a `client-message` event with `set_lang_english`:

```json
{
  "message": {
    "sender": { "id": "<user_id>" },
    "recipient": { "id": "BOT" },
    "message": { "text": "set_lang_english" },
    "chatbot_id": "<chatbot_id>",
    "page_id": "<page_id>",
    "first_message": true,
    "inject_param": [
      { "key": "app_user_id", "value": "<app_user_id>" },
      { "key": "app_flight_ids", "value": "[{\"id\":\"CX548\",\"timestamp\":1744732800000}]" },
      { "key": "app_has_mytag", "value": "true" }
    ],
    "timestamp": <ms>
  }
}
```

**To send a message**, the app emits `client-message` and includes `inject_param` on every message:

```json
{
  "message": {
    "sender": { "id": "<user_id>" },
    "recipient": { "id": "BOT" },
    "message": { "text": "<user text>" },
    "chatbot_id": "<chatbot_id>",
    "page_id": "<page_id>",
    "inject_param": [
      { "key": "app_user_id", "value": "<app_user_id>" },
      { "key": "app_flight_ids", "value": "[{\"id\":\"CX548\",\"timestamp\":1744732800000}]" },
      { "key": "app_has_mytag", "value": "true" }
    ],
    "timestamp": <ms>
  }
}
```

`inject_param` is omitted only if invalid JSON is entered for `app_flight_ids` (the UI blocks send/connect and shows an error).

**Auth** is sent in the Socket.IO handshake as `auth: { api_key, token, user_id }`.

## Server Requirements

The server must:

- Accept Socket.IO connections on the configured path
- Authenticate via `auth: { api_key, token, user_id }`
- Handle `client-message` events
- Emit `message` and/or `bot_message` events for responses

## Tech Stack

- React 18
- Vite 5
- Socket.IO Client 4

## Build

```bash
npm run build
npm run preview
```

Build output is in `dist/`.
