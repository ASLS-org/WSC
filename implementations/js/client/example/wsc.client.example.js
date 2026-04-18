// @ts-nocheck
/* eslint-disable no-loop-func */
/* eslint-disable no-nested-ternary */
/* eslint-disable no-use-before-define */
/* eslint-disable no-undef */
/**
 * WSC SDK v5 — Full Protocol Explorer
 * Covers every WscPacket.Type with a dedicated UI handler.
 */

import {
  WscPacket,
  WscTransport,
  WscFlags,
  WscAddress,
} from '@asls/wsc-sdk';
import {
  WscClient, WSC_REMOTE_STATE, DEBUGGER_LOG_TYPE, KEEPALIVE_INTERVAL,
} from '../src/main.js';

const KEEPALIVE_INTERVAL_TIMEOUT_COUNT = 2;
const KEEPALIVE_CONNECTION_TIMEOUT = KEEPALIVE_INTERVAL * KEEPALIVE_INTERVAL_TIMEOUT_COUNT;

// ─── DOM helper ───────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

// ─── App state ────────────────────────────────────────────────────────────────

let client = null;
let debugInterval = null;
const dmxData = new Uint8Array(512).fill(0);
let dmxChannelCount = 16;
let dmxAutoTimer = null;
let dmxAutoRunning = false;
let kaInterval = null;
let tcRunning = false;
let tcTimer = null;
let chaseFrame = null;
let tcH = 0; let tcM = 0; let tcS = 0; let
  tcF = 0;

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(msg, type = 'info') {
  const logEl = $('log');
  if (!logEl) return;
  const ts = new Date().toLocaleTimeString('en', { hour12: false });
  const div = document.createElement('div');
  div.className = `log-line log-${type}`;
  div.innerHTML = `<span class="log-ts">${ts}</span><span class="log-msg">${escHtml(msg)}</span>`;
  logEl.appendChild(div);
  while (logEl.children.length > 300) logEl.firstChild.remove();
  logEl.scrollTop = logEl.scrollHeight;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function updateDebug() {
  if (!client?.debug) return;
  const el = $('debug-log');
  if (!el) return;
  el.innerHTML = '';
  client.debug.forEach((item) => {
    const cls = item.type === DEBUGGER_LOG_TYPE.ERROR ? 'error'
      : item.type === DEBUGGER_LOG_TYPE.SUCCESS ? 'success'
        : 'info';
    const div = document.createElement('div');
    div.className = `log-line log-${cls}`;
    div.innerHTML = `<span class="log-ts">${item.timestamp}</span><span class="log-msg">${escHtml(item.data)}</span>`;
    el.appendChild(div);
  });
  el.scrollTop = el.scrollHeight;
}

// ─── Status ───────────────────────────────────────────────────────────────────

let statusTimer = null;

function setStatus(state) {
  const map = {
    [WSC_REMOTE_STATE.IDLE]: { text: 'OFFLINE', cls: 'idle' },
    [WSC_REMOTE_STATE.CONNECTING]: { text: 'CONNECTING', cls: 'connecting' },
    [WSC_REMOTE_STATE.CONNECTED]: { text: 'ONLINE', cls: 'connected' },
    [WSC_REMOTE_STATE.ERROR]: { text: 'ERROR', cls: 'error' },
  };
  const { text, cls } = map[state] ?? map[WSC_REMOTE_STATE.IDLE];
  $('status-dot').className = `dot dot-${cls}`;
  $('status-label').textContent = text;

  const connected = state === WSC_REMOTE_STATE.CONNECTED;
  $('connect-btn').disabled = connected || state === WSC_REMOTE_STATE.CONNECTING;
  $('disconnect-btn').disabled = !connected && state !== WSC_REMOTE_STATE.CONNECTING;
  document.querySelectorAll('.send-btn').forEach((b) => { b.disabled = !connected; });

  if (statusTimer) {
    clearTimeout(statusTimer);
    statusTimer = null;
  }

  if (connected) {
    statusTimer = setTimeout(() => {
      setStatus(WSC_REMOTE_STATE.IDLE);
      client.close();
    }, KEEPALIVE_CONNECTION_TIMEOUT);
  }
}

// ─── Transport builder ────────────────────────────────────────────────────────

function getTransport() {
  const protoKey = $('tr-protocol').value;
  const address = $('tr-address').value.trim();
  const port = parseInt($('tr-port').value, 10);
  return WscTransport.udp(WscTransport.Protocol[protoKey], address, port);
}

function makePacket(type, data, withTransport = false, extra = {}) {
  const flags = new WscFlags(withTransport, withTransport, extra.ack ?? false, extra.mc ?? false);
  const transport = withTransport ? getTransport() : null;
  return WscPacket.create(type, data, { flags, transport });
}

function sendPacket(packet, label) {
  if (!client || client.state !== WSC_REMOTE_STATE.CONNECTED) return;
  try {
    const { valid, errors, warnings } = WscPacket.validate(packet);
    if (!valid) { log(`✗ [${label}] ${errors.join('; ')}`, 'error'); return; }
    if (warnings.length) log(`⚠ [${label}]: ${warnings.join('; ')}`, 'warn');
    client.send(packet);
    log(`↑ ${label} — ${packet.typeName()} (${packet.size}B) [${packet.flags}]`, 'success');
  } catch (err) {
    log(`✗ [${label}] ${err.message}`, 'error');
  }
}

// ─── Connection ───────────────────────────────────────────────────────────────

$('connect-btn').addEventListener('click', () => {
  const remote = $('remote').value.trim();
  const port = parseInt($('port').value, 10);
  log(`Connecting → ws://${remote}:${port}/ws …`, 'info');
  setStatus(WSC_REMOTE_STATE.CONNECTING);

  client = new WscClient(
    remote,
    port,
    () => {
      log('WSC Connection Ready', 'success');
      setStatus(WSC_REMOTE_STATE.CONNECTED);
      client.startKeepAliveSession();
    },
    (packet) => handleIncoming(packet),
    () => {
      log('Connection closed', 'error');
      setStatus(WSC_REMOTE_STATE.IDLE);
      stopDmxAuto();
      if (debugInterval) { clearInterval(debugInterval); debugInterval = null; }
    },
    (err) => { log(`Error: ${err}`, 'error'); setStatus(WSC_REMOTE_STATE.ERROR); },
  );

  client.connect();
  debugInterval = setInterval(updateDebug, 400);
});

$('disconnect-btn').addEventListener('click', () => {
  client?.close();
  client = null;
  stopDmxAuto();
  if (kaInterval) { clearInterval(kaInterval); kaInterval = null; }
  if (tcRunning) { tcRunning = false; clearInterval(tcTimer); $('btn-tc-run').textContent = '▶ Run TC'; }
});

// ─── Incoming packets ─────────────────────────────────────────────────────────

function handleIncoming(packet) {
  const typeName = WscPacket._typeName(packet.type);
  const decoded = WscPacket.decode(packet);
  switch (packet.type) {
    case WscPacket.Type.STATE_ANSWER: {
      const sk = Object.keys(WscPacket.Status).find((k) => WscPacket.Status[k] === decoded?.status) ?? '?';
      log(`↓ STATE_ANSWER status=${sk} data=${JSON.stringify(decoded?.data ?? {})}`, 'info');
      setStatus(WSC_REMOTE_STATE.CONNECTED);
      break;
    }
    case WscPacket.Type.STATE_ERROR:
      log(`↓ STATE_ERROR code=0x${(decoded?.errorCode ?? 0).toString(16).padStart(4, '0')} "${decoded?.message}"`, 'error');
      break;
    case WscPacket.Type.STREAM_CHANNELS:
      log(`↓ STREAM_CHANNELS universe=${decoded?.universe} startCh=${decoded?.startChannel} count=${decoded?.count}`, 'info');
      break;
    default:
      log(`↓ ${typeName} ${JSON.stringify(decoded ?? {})}`, 'info');
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// STREAMING
// ═════════════════════════════════════════════════════════════════════════════

// ── STREAM_CHANNELS ──────────────────────────────────────────────────────────

const channelGrid = $('channel-grid');

function initDmxChannels(count) {
  dmxChannelCount = count;
  channelGrid.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const wrap = document.createElement('div');
    wrap.className = 'ch-wrap';
    wrap.innerHTML = `<div class="ch-num">CH ${String(i + 1).padStart(3, '0')}</div>`
      + `<div class="ch-track-wrap" id="chtrack-${i}">`
        + `<div class="ch-fill" id="chfill-${i}" style="height:0%"></div>`
      + '</div>'
      + `<div class="ch-val" id="chval-${i}">000</div>`;
    channelGrid.appendChild(wrap);

    let dragging = false;
    const track = wrap.querySelector(`#chtrack-${i}`);
    const applyY = (clientY) => {
      const rect = track.getBoundingClientRect();
      const rel = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      const v = Math.round(rel * 255);
      dmxData[i] = v;
      updateChannelUI(i, v);
      if (dmxAutoRunning) sendDmxFrame();
    };
    track.addEventListener('mousedown', (e) => { dragging = true; applyY(e.clientY); });
    window.addEventListener('mousemove', (e) => { if (dragging) applyY(e.clientY); });
    window.addEventListener('mouseup', () => { dragging = false; });
  }
}

function updateChannelUI(i, v) {
  const fill = $(`chfill-${i}`);
  const val = $(`chval-${i}`);
  if (fill) fill.style.height = `${(v / 255) * 100}%`;
  if (val) val.textContent = String(v).padStart(3, '0');
}

function sendDmxFrame() {
  const pkt = makePacket(WscPacket.Type.STREAM_CHANNELS, {
    universe: parseInt($('dmx-universe').value, 10) || 0,
    startChannel: parseInt($('dmx-start-ch').value, 10) || 1,
    values: dmxData.slice(0, dmxChannelCount),
  }, true);
  sendPacket(pkt, 'STREAM_CHANNELS');
}

function stopDmxAuto() {
  dmxAutoRunning = false;
  if (dmxAutoTimer) { clearTimeout(dmxAutoTimer); dmxAutoTimer = null; }
  const btn = $('dmx-auto-btn');
  if (btn) btn.textContent = 'Start Auto-Send';
}

function toggleDmxAuto() {
  dmxAutoRunning = !dmxAutoRunning;
  $('dmx-auto-btn').textContent = dmxAutoRunning ? 'Stop Auto-Send' : 'Start Auto-Send';
  if (dmxAutoRunning) {
    (function loop() {
      if (!dmxAutoRunning) return;
      sendDmxFrame();
      dmxAutoTimer = setTimeout(loop, 44);
    }());
  }
}

function applyDmxPreset(fn) {
  for (let i = 0; i < dmxChannelCount; i++) {
    const v = fn(i);
    dmxData[i] = v; updateChannelUI(i, v);
  }
}

$('dmx-blackout').addEventListener('click', () => applyDmxPreset(() => 0));
$('dmx-full').addEventListener('click', () => applyDmxPreset(() => 255));
$('dmx-half').addEventListener('click', () => applyDmxPreset(() => 128));
$('dmx-random').addEventListener('click', () => applyDmxPreset(() => Math.floor(Math.random() * 256)));
$('dmx-16ch').addEventListener('click', () => initDmxChannels(16));
$('dmx-32ch').addEventListener('click', () => initDmxChannels(32));
$('dmx-send-frame').addEventListener('click', sendDmxFrame);
$('dmx-auto-btn').addEventListener('click', toggleDmxAuto);
$('dmx-chase').addEventListener('click', () => {
  if (chaseFrame) {
    clearInterval(chaseFrame); chaseFrame = null;
    $('dmx-chase').textContent = 'Chase ▶'; return;
  }
  $('dmx-chase').textContent = 'Chase ■';
  let step = 0;
  chaseFrame = setInterval(() => {
    applyDmxPreset(() => 0);
    dmxData[step % dmxChannelCount] = 255;
    updateChannelUI(step % dmxChannelCount, 255);
    step++;
  }, 80);
});

initDmxChannels(16);

// ── STREAM_TIMECODE ──────────────────────────────────────────────────────────

$('btn-timecode').addEventListener('click', () => {
  sendPacket(makePacket(WscPacket.Type.STREAM_TIMECODE, {
    hours: parseInt($('tc-h').value, 10) || 0,
    minutes: parseInt($('tc-m').value, 10) || 0,
    seconds: parseInt($('tc-s').value, 10) || 0,
    frames: parseInt($('tc-f').value, 10) || 0,
    rate: parseInt($('tc-rate').value, 10) || 30,
  }), 'STREAM_TIMECODE');
});

$('btn-tc-run').addEventListener('click', () => {
  tcRunning = !tcRunning;
  $('btn-tc-run').textContent = tcRunning ? '⏹ Stop TC' : '▶ Run TC';
  if (tcRunning) {
    const rate = parseInt($('tc-rate').value, 10) || 30;
    tcTimer = setInterval(() => {
      tcF++;
      if (tcF >= rate) { tcF = 0; tcS++; }
      if (tcS >= 60) { tcS = 0; tcM++; }
      if (tcM >= 60) { tcM = 0; tcH++; }
      ['h', 'm', 's', 'f'].forEach((x) => {
        const v = {
          h: tcH, m: tcM, s: tcS, f: tcF,
        }[x];
        const inp = $(`tc-${x}`); if (inp) inp.value = v;
        const disp = $(`tc-disp-${x}`); if (disp) disp.textContent = String(v).padStart(2, '0');
      });
      sendPacket(makePacket(
        WscPacket.Type.STREAM_TIMECODE,
        {
          hours: tcH, minutes: tcM, seconds: tcS, frames: tcF, rate,
        },
      ), 'TC');
    }, Math.round(1000 / rate));
  } else {
    clearInterval(tcTimer);
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// CONTROLS
// ═════════════════════════════════════════════════════════════════════════════

$('btn-cue').addEventListener('click', () => {
  sendPacket(makePacket(WscPacket.Type.CONTROL_CUE, {
    address: WscAddress.parse($('cue-address').value || 'lighting.cue.1'),
    action: parseInt($('cue-action').value, 10),
  }, true), 'CMD_CUE');
});

$('btn-param-set').addEventListener('click', () => {
  const vTypeKey = $('ps-vtype').value;
  const vTypeId = WscPacket.ValueType[vTypeKey];
  const raw = $('ps-value').value;
  let value;
  if (vTypeKey === 'BOOL') value = raw === 'true' || raw === '1';
  else if (vTypeKey === 'STRING') value = raw;
  else if (['F32', 'F64'].includes(vTypeKey)) value = parseFloat(raw);
  else value = parseInt(raw, 10);
  sendPacket(makePacket(WscPacket.Type.CONTROL_PARAM, {
    address: WscAddress.parse($('ps-address').value || 'lighting.layer.1.intensity'),
    valueType: vTypeId,
    value,
  }, true), 'PARAM_SET');
});

// ═════════════════════════════════════════════════════════════════════════════
// TUNNEL
// ═════════════════════════════════════════════════════════════════════════════

$('btn-tunnel').addEventListener('click', () => {
  const raw = $('tunnel-data').value;
  const isHex = $('tunnel-fmt').value === 'hex';
  const bytes = isHex
    ? new Uint8Array((raw.replace(/\s+/g, '').match(/.{1,2}/g) ?? []).map((b) => parseInt(b, 16)))
    : new TextEncoder().encode(raw);
  sendPacket(WscPacket.create(WscPacket.Type.TUNNEL_RAW, { raw: bytes }, {
    flags: new WscFlags(true, true), transport: WscTransport.raw(),
  }), 'TUNNEL_RAW');
});

// ═════════════════════════════════════════════════════════════════════════════
// STATE
// ═════════════════════════════════════════════════════════════════════════════

$('btn-query').addEventListener('click', () => {
  sendPacket(makePacket(WscPacket.Type.STATE_QUERY, {
    queryType: WscPacket.StateQuery.KEEPALIVE, targetId: $('query-target').value || '',
  }), 'STATE_QUERY');
});

$('btn-ka-toggle').addEventListener('click', () => {
  if (kaInterval) {
    clearInterval(kaInterval); kaInterval = null;
    $('btn-ka-toggle').textContent = 'Start Keepalive';
    log('Keepalive stopped', 'info');
  } else {
    const ms = parseInt($('ka-interval').value, 10) || 1000;
    kaInterval = setInterval(() => {
      sendPacket(makePacket(
        WscPacket.Type.STATE_QUERY,
        { queryType: WscPacket.StateQuery.KEEPALIVE, targetId: '' },
      ), 'KEEPALIVE');
    }, ms);
    $('btn-ka-toggle').textContent = 'Stop Keepalive';
    log(`Keepalive every ${ms}ms`, 'info');
  }
});

// ─── Tab navigation ───────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${target}`)?.classList.add('active');
  });
});

// ─── Address preview ─────────────────────────────────────────────────────────

document.querySelectorAll('.addr-preview').forEach((el) => {
  const input = document.getElementById(el.dataset.for);
  if (!input) return;
  const update = () => {
    try {
      const addr = WscAddress.parse(input.value);
      el.textContent = `→ ${addr.toString()}  (${addr.size}B wire)`;
      el.classList.remove('addr-err');
    } catch {
      el.textContent = '→ invalid address';
      el.classList.add('addr-err');
    }
  };
  input.addEventListener('input', update);
  update();
});

// ─── Debug drawer ─────────────────────────────────────────────────────────────

$('debug-toggle').addEventListener('click', () => {
  const panel = $('debug-panel');
  panel.classList.toggle('open');
  $('debug-toggle').querySelector('span').textContent = panel.classList.contains('open') ? '▲ Debug' : '▼ Debug';
});

$('debug-toggle').click();

// ─── Boot log ─────────────────────────────────────────────────────────────────

log('WSC SDK v5 Explorer ready — configure connection and click Connect', 'info');
log('All 20 packet types available via the sidebar', 'info');
