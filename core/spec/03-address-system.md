# 03 — Address System

[← Packet Format](02-packet-format.md) · [Next: Message Types →](04-message-types.md)

---

## Overview

WSC uses a compact, hierarchical, protocol-agnostic addressing scheme to identify cue targets and named parameters. An address describes **what** is being targeted in domain-neutral terms. Software-specific identifiers — a QLab cue number, an OSC path, a Modbus register — belong in the Transport Descriptor, not in the WSC address.

---

## Notation

Human-readable addresses use lowercase dot-separated token names. Integer elements are indices.

```
lighting.layer.2.intensity
audio.track.3.send.1.send_level
video.layer.1.clip.4.opacity
motion.axis.2.position
lighting.cue.42
env.zone.1.density
```

---

## Wire Encoding

An address is a self-terminating sequence of encoded segments, closed by the `NONE` byte (`0x00`).

| Segment type | Wire bytes | Notes |
|---|---|---|
| Named token | `[u8 token]` | Value from the token registry below |
| Index ≤ 255 | `[0x80][u8 index]` | INDEX sentinel + value |
| Index ≤ 65 535 | `[0x80][u8 hi][0x80][u8 lo]` | Two INDEX sentinels, big-endian u16 |
| Custom string | `[0xFE][u8 len][…UTF-8]` | `len` ≤ 255 bytes |
| Terminator | `[0x00]` | Required at end of every address |

When embedded in a packet payload, an address is **length-prefixed** with a `u16` byte count immediately before the segment bytes:

```
[u16 addr_len][…segment bytes … 0x00 terminator]
```

### Example — `lighting.layer.2.intensity` (6 bytes including terminator)

| Byte | Value | Meaning |
|---|---|---|
| `0x01` | `LIGHTING` | domain |
| `0x10` | `LAYER` | entity |
| `0x80` | `INDEX` | sentinel |
| `0x02` | `2` | index value |
| `0x40` | `INTENSITY` | leaf |
| `0x00` | `NONE` | terminator |

As a UTF-8 string, the same path is 26 bytes. Token encoding is **~4× more compact** for typical paths.

---

## Token Registry

### Special Tokens

| Token | Value | Role |
|---|---|---|
| `NONE` | `0x00` | Address terminator — every address ends with this byte |
| `INDEX` | `0x80` | Index sentinel — next byte(s) carry the index value |
| `CUSTOM` | `0xFE` | Escape hatch — `[u8 len][UTF-8 string]` |
| `RAW` | `0xFF` | Opaque marker — application-defined semantics |

---

### Domain Tokens — `0x01 – 0x06`

Every valid address **MUST** begin with a domain token.

| Token | Value | Domain |
|---|---|---|
| `LIGHTING` | `0x01` | Stage lighting: fixtures, universes, effects |
| `AUDIO` | `0x02` | Audio tracks, buses, sends, devices |
| `VIDEO` | `0x03` | Video layers, clips, compositing |
| `MOTION` | `0x04` | Motors, kinetics, automation axes |
| `ENV` | `0x05` | Environment: fog, HVAC, pyro, climate |
| `NETWORK` | `0x06` | Infrastructure-level targets |

Values `0x07 – 0x0F` are reserved for future domains.

---

### Structural Entity Tokens — `0x10 – 0x1F`

Entity tokens identify an addressable object class within a domain. In normal usage they are followed by an `INDEX` segment.

| Token | Value | Token | Value | Token | Value |
|---|---|---|---|---|---|
| `LAYER` | `0x10` | `UNIVERSE` | `0x15` | `SCENE` | `0x1A` |
| `TRACK` | `0x11` | `CHANNEL` | `0x16` | `DEVICE` | `0x1B` |
| `BUS` | `0x12` | `FIXTURE` | `0x17` | `EFFECT` | `0x1C` |
| `SEND` | `0x13` | `CLIP` | `0x18` | `AXIS` | `0x1D` |
| `GROUP` | `0x14` | `CUE` | `0x19` | `ZONE` | `0x1E` |
| | | | | `PARAM` | `0x1F` |

Values `0x20 – 0x3F` are reserved for future structural tokens.

---

### Leaf Parameter Tokens

Leaf tokens appear at the end of an address path and identify a specific parameter or attribute.

#### Lighting — `0x40 – 0x55`

| Token | Value | Token | Value | Token | Value |
|---|---|---|---|---|---|
| `INTENSITY` | `0x40` | `UV` | `0x49` | `GOBO` | `0x50` |
| `HUE` | `0x41` | `PAN` | `0x4A` | `PRISM` | `0x51` |
| `SATURATION` | `0x42` | `TILT` | `0x4B` | `FROST` | `0x52` |
| `COLOR_TEMP` | `0x43` | `ZOOM` | `0x4C` | `SHUTTER` | `0x53` |
| `RED` | `0x44` | `FOCUS` | `0x4D` | `DIMMER_CURVE` | `0x54` |
| `GREEN` | `0x45` | `IRIS` | `0x4E` | `FADE` | `0x55` |
| `BLUE` | `0x46` | `STROBE` | `0x4F` | | |
| `WHITE` | `0x47` | | | | |
| `AMBER` | `0x48` | | | | |

Values `0x56 – 0x6F` are reserved.

#### Video — `0x70 – 0x7D`

| Token | Value | Token | Value |
|---|---|---|---|
| `OPACITY` | `0x70` | `ROTATION` | `0x76` |
| `BLEND_MODE` | `0x71` | `CROP_X` | `0x77` |
| `SPEED` | `0x72` | `CROP_Y` | `0x78` |
| `POSITION_X` | `0x73` | `CROP_W` | `0x79` |
| `POSITION_Y` | `0x74` | `CROP_H` | `0x7A` |
| `SCALE` | `0x75` | `GAMMA` | `0x7B` |
| | | `CONTRAST` | `0x7C` |
| | | `BRIGHTNESS` | `0x7D` |

Values `0x7E – 0x7F` reserved. `0x80` is the `INDEX` sentinel.

#### Audio — `0x81 – 0x8F`

| Token | Value | Token | Value |
|---|---|---|---|
| `LEVEL` | `0x81` | `FREQ` | `0x87` |
| `GAIN` | `0x82` | `BAND_Q` | `0x88` |
| `MUTE` | `0x83` | `ATTACK` | `0x89` |
| `SOLO` | `0x84` | `RELEASE` | `0x8A` |
| `PAN_AUDIO` | `0x85` | `THRESHOLD` | `0x8B` |
| `SEND_LEVEL` | `0x86` | `RATIO` | `0x8C` |
| | | `PITCH` | `0x8D` |
| | | `TEMPO` | `0x8E` |
| | | `LOOP` | `0x8F` |

Values `0x90 – 0x9F` reserved.

#### Motion — `0xA0 – 0xA7`

| Token | Value | Token | Value |
|---|---|---|---|
| `POSITION` | `0xA0` | `HOME` | `0xA4` |
| `VELOCITY` | `0xA1` | `LIMIT_MIN` | `0xA5` |
| `ACCELERATION` | `0xA2` | `LIMIT_MAX` | `0xA6` |
| `TORQUE` | `0xA3` | `ENABLED` | `0xA7` |

Values `0xA8 – 0xBF` reserved.

#### Environment — `0xC0 – 0xC4`

| Token | Value |
|---|---|
| `DENSITY` | `0xC0` |
| `TEMPERATURE` | `0xC1` |
| `PRESSURE` | `0xC2` |
| `HUMIDITY` | `0xC3` |
| `FLOW` | `0xC4` |

Values `0xC5 – 0xCF` reserved.

#### Generic / Shared — `0xD0 – 0xD4`

| Token | Value | Description |
|---|---|---|
| `TRIGGER` | `0xD0` | Momentary trigger |
| `RESET` | `0xD1` | Reset to default state |
| `POWER` | `0xD2` | Power state |
| `MODE_LEAF` | `0xD3` | Mode at leaf position (distinct from structural use) |
| `VALUE` | `0xD4` | Generic scalar leaf when no specific token applies |

Values `0xD5 – 0xFD` reserved.

---

## Escape Hatch — CUSTOM Token

When no registered token exists for a target, use the `CUSTOM` token (`0xFE`) followed by a length-prefixed UTF-8 string. This avoids reserved-range collisions and is forward-compatible.

```
path:  lighting.custom.house_lights_on
wire:  0x01 [LIGHTING]  0xFE [0x10] [house_lights_on…]  0x00
```

If a standard token is later assigned for the concept, the custom string can be migrated without a protocol version bump.

---

## Address Construction Rules

1. Every address **MUST** begin with a domain token.
2. Entity tokens **SHOULD** be followed by an `INDEX` segment.
3. The address **MUST** terminate with `NONE` (`0x00`).
4. `CUSTOM` segments **MUST NOT** exceed 255 bytes.
5. Indices `> 65 535` are not supported in this version.

---

## Parsing Rules

When deserializing:

- Read tokens byte-by-byte until `NONE` (`0x00`) is encountered.
- On `INDEX` (`0x80`): read one byte as `hi`. If the next byte is also `0x80`, read a second `INDEX` sentinel and one more byte as `lo`; the index is `(hi << 8) | lo`. Otherwise the index is `hi`.
- On `CUSTOM` (`0xFE`): read one byte as `len`, then read `len` bytes as a UTF-8 string.
- Any unrecognised token value (not `NONE`, `INDEX`, or `CUSTOM`) is treated as a named token and stored as-is. Unknown tokens **MUST NOT** cause a parse failure.
