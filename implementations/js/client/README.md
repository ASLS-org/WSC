# WSC (Web Show Control) Client

A WebRTC-based client that connects to a [WSC-compatible gateway](https://github.com/ASLS-org/WSC/tree/main/implementations/js), and handles the creation, transmission, and parsing of WSC packets.

>**About WSC:**<br>
[WSC](https://github.com/ASLS-org/WSC) defines a unified wire format that transports DMX data, linear timecode, cue triggers, structured parameter updates, and arbitrary binary payloads. A gateway can then relay this data to downstream protocols such as Art-Net, sACN, OSC, MIDI, Modbus, and others.

## Quick Start

Install the following dependencies in your project:
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
