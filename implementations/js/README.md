# WSC — JavaScript Implementation

Getting-started guide for the JavaScript client and gateway.

**Binding:** [`bindings/js/sdk/`](../../bindings/js/sdk/) (`@asls/wsc-sdk`)  
**Protocol version:** 1.1.0  
**Runtime:** Node.js ≥ 20 (gateway) · Any modern browser or Node.js ≥ 20 (client)

---

## Repository layout

```
implementations/js/
├── README.md           ← you are here
├── client/             ← browser / Node.js WebRTC client
│   ├── src/
│   │   └── main.js     ← WscClient class
│   └── example/        ← full interactive protocol explorer (Vite dev server)
└── server/             ← gateway (Node.js, @roamhq/wrtc)
    └── src/
        ├── main.js           ← entry point
        ├── server.js         ← WSCServer singleton
        ├── signaling.js      ← WebSocket signaling server
        ├── peer.js           ← WscPeer + WscPeerManager
        ├── gateways/
        │   ├── abstract.gateway.js
        │   ├── stream.gateway.js   ← STREAM_CHANNELS, STREAM_TIMECODE
        │   ├── control.gateway.js  ← CONTROL_CUE, CONTROL_PARAM
        │   └── state.gateway.js    ← STATE_QUERY
        └── protocols/
            ├── dmx/
            │   └── dmx.artnet.js   ← Art-Net UDP forwarder
            └── osc/
                └── osc.udp.js      ← OSC UDP forwarder
```

---

## Running the gateway (server)

The gateway accepts WebRTC DataChannel connections from clients and forwards WSC packets to downstream protocols.

### Install dependencies

```sh
# In the repository root
npm install
```

### Start

```sh
# In the repository root
# Development (auto-restart on file change, requires tsx)
npm run dev:server # Start the WSC Server
```

The gateway listens on port **4515** by default. This port is used for both the WebSocket signaling server and is referenced as `ASLS_WSC_PORT`.

### What the gateway does

On startup, the gateway:

1. Starts the WebSocket signaling server on port 4515.
2. Waits for clients to connect via WebRTC offer/answer exchange.
3. Opens a DataChannel per message type for each connected peer.
4. For each received packet, validates it and routes to the appropriate gateway module:

| Gateway module | Handled types | Forwarding |
|---|---|---|
| `WscStreamGateway` | `STREAM_CHANNELS`, `STREAM_TIMECODE` | Art-Net (UDP) |
| `WscControlGateway` | `CONTROL_CUE`, `CONTROL_PARAM` | OSC (UDP) |
| `WscStateGateway` | `STATE_QUERY` | Responds with system info via `STATE_ANSWER` |

---

## Running the client example

The example is a full interactive protocol explorer that exercises every message type. It runs in the browser via Vite.

### Install dependencies

```sh
# In the repository root
npm install
```

### Start the dev server

```sh
# In the repository root
npm run dev:client
```

Open `http://localhost:5173` in a browser. Enter the gateway host and port (default: `localhost:4515`) and click **Connect**.

The example page provides UI panels for:
- DMX channel streaming (Art-Net)
- Linear timecode streaming
- Cue control (`CONTROL_CUE`)
- Parameter writes (`CONTROL_PARAM`)
- Raw tunnel (`TUNNEL_RAW`)
- State query / keepalive

---

## Client — Quick Start

Install the dependencies in your project:
```bash
npm install -S @asls/wsc-sdk
npm install -S @asls/wsc-client
```

Import the client and the SDK binding:

```js
import { WscClient, WSC_REMOTE_STATE, KEEPALIVE_INTERVAL } from '@asls/wsc-client';
import { WscPacket, WscTransport, WscFlags, WscAddress } from '@asls/wsc-sdk';
```

### 1. Connect to a gateway

```js
const client = new WscClient(
  '192.168.1.50',   // gateway host or IP
  4515,             // signaling WebSocket port
  onOpen,
  onMessage,
  onClose,
  onError,
);

client.connect();

function onOpen() {
  console.log('Connected — WSC ready');
  client.startKeepAliveSession();
}

function onMessage(packet) {
  const decoded = WscPacket.decode(packet);
  console.log(`← ${packet.typeName()}`, decoded);
}

function onClose() {
  console.log('Disconnected');
}

function onError(err) {
  console.error('Error:', err);
}
```

### 2. Stream DMX channels via Art-Net

```js
const values = new Uint8Array(512).fill(0);
values[0] = 255;   // channel 1 full
values[1] = 128;   // channel 2 half

const packet = WscPacket.create(
  WscPacket.Type.STREAM_CHANNELS,
  { universe: 0, startChannel: 1, values },
  {
    flags:     new WscFlags(true, true),   // TR + GW
    transport: WscTransport.udp(
      WscTransport.Protocol.ARTNET,
      '127.0.0.1',
      6454,
    ),
  },
);

client.send(packet);
```

### 3. Fire a cue via OSC

```js
const packet = WscPacket.create(
  WscPacket.Type.CONTROL_CUE,
  {
    address: WscAddress.parse('lighting.cue.42'),
    action:  WscPacket.CueAction.START,
  },
  {
    flags:     new WscFlags(true, true),   // TR + GW
    transport: WscTransport.udp(
      WscTransport.Protocol.OSC,
      '127.0.0.1',
      8000,
    ),
  },
);

client.send(packet);
```

### 4. Set a named parameter via OSC

```js
const packet = WscPacket.create(
  WscPacket.Type.CONTROL_PARAM,
  {
    address:   WscAddress.parse('lighting.layer.2.intensity'),
    valueType: WscPacket.ValueType.F32,
    value:     0.75,
  },
  {
    flags:     new WscFlags(true, true),
    transport: WscTransport.udp(
      WscTransport.Protocol.OSC,
      '127.0.0.1',
      8000,
    ),
  },
);

client.send(packet);
```

### 5. Stream linear timecode

```js
const packet = WscPacket.create(
  WscPacket.Type.STREAM_TIMECODE,
  { hours: 1, minutes: 0, seconds: 30, frames: 0, rate: 30 },
);

client.send(packet);
```

### 6. Tunnel raw bytes

```js
const raw = new Uint8Array([0xF0, 0x42, 0x40, 0x7F, 0xF7]);

const packet = WscPacket.create(
  WscPacket.Type.TUNNEL_RAW,
  { raw },
  {
    flags:     new WscFlags(true, true),
    transport: WscTransport.raw(),
  },
);

client.send(packet);
```

---

## Client — API Reference

### `new WscClient(host, port, onOpen, onMessage, onClose, onError)`

| Parameter | Type | Description |
|---|---|---|
| `host` | `string` | Gateway hostname or IP address |
| `port` | `number` | Signaling WebSocket port |
| `onOpen` | `() => void` | Called when the first DataChannel is open |
| `onMessage` | `(packet: WscPacket) => void` | Called for each received packet |
| `onClose` | `() => void` | Called on disconnection |
| `onError` | `(err: any) => void` | Called on transport or signaling error |

### Methods

| Method | Description |
|---|---|
| `connect()` | Initiate WebSocket signaling and establish the DataChannel |
| `send(packet)` | Serialize and write a `WscPacket` to the appropriate DataChannel; silently drops if the channel is not open |
| `close()` | Disconnect cleanly and transition to `IDLE` |
| `startKeepAliveSession()` | Begin sending `STATE_QUERY(KEEPALIVE)` every 1 000 ms |
| `stopKeepaliveSession()` | Stop the keepalive timer |

### Properties

| Property | Type | Description |
|---|---|---|
| `state` | `WSC_REMOTE_STATE` | Current connection state |
| `debug` | `DebugEntry[]` | Rolling debug log, last 100 entries |

### `WSC_REMOTE_STATE`

| Value | Meaning |
|---|---|
| `IDLE` (`0`) | Not connected |
| `CONNECTING` (`1`) | Signaling in progress |
| `CONNECTED` (`2`) | DataChannel open |
| `ERROR` (`-1`) | Unrecoverable transport error |

---

## DataChannel naming

The client creates one DataChannel per message type, named:

```
WSC!DC:<TYPE_NAME>
```

For example: `WSC!DC:STREAM_CHANNELS`, `WSC!DC:CONTROL_CUE`.

The gateway identifies WSC channels by the `WSC!DC` prefix. Response channels used by the server:

| Channel | Purpose |
|---|---|
| `WSC!DC:STATE_QUERY` | Carries `STATE_ANSWER` responses |
| `WSC!DC:STATE_ERROR` | Carries `STATE_ERROR` responses |

---

## Validation

Always validate packets in development to catch flag and compatibility errors early:

```js
const { valid, errors, warnings } = WscPacket.validate(packet);

if (!valid) {
  console.error('Invalid packet:', errors);
  return;
}
if (warnings.length) {
  console.warn('Packet warnings:', warnings);
}

client.send(packet);
```

---

## Connection lifecycle example

```js
let client = null;

function connect(host, port) {
  client = new WscClient(host, port,
    () => {
      client.startKeepAliveSession();
    },
    (packet) => {
      // handle incoming STATE_ANSWER, STATE_ERROR, etc.
    },
    () => {
      client = null;
      setTimeout(() => connect(host, port), 2000);
    },
    (err) => console.error(err),
  );
  client.connect();
}
```

---

## Further reading

| Document | Contents |
|---|---|
| [Architecture](../../core/spec/01-architecture.md) | System overview and gateway module model |
| [Message Types](../../core/spec/04-message-types.md) | Full payload schemas for all 8 message types |
| [Address System](../../core/spec/03-address-system.md) | Token registry and address construction rules |
| [Transport Descriptor](../../core/spec/05-transport-descriptor.md) | Downstream protocols and compatibility matrices |
| [Session](../../core/spec/06-session.md) | Connection lifecycle and keepalive specification |
| [Error Handling](../../core/spec/07-error-handling.md) | Error codes and receiver obligations |
