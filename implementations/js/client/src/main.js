/* eslint-disable max-classes-per-file */
import { WscFlags, WscPacket } from '@asls/wsc-sdk';

/**
 * WSC DMX DataChannel name
 * @constant {String} DATA_CHANNEL_NAME_PREFIX
 */
const DATA_CHANNEL_NAME_PREFIX = 'WSC!DC';
const MAX_DATACHANNEL_COUNT = 50;
const DEBUG_QUEUE_MAXLEN = 100;
export const KEEPALIVE_INTERVAL = 1000;

/**
 * WSC remoteHost states enumeration
 * @constant WSC_REMOTE_STATE
 * @enum {Number}
 */
export const WSC_REMOTE_STATE = {
  ERROR: -1,
  IDLE: 0,
  CONNECTING: 1,
  CONNECTED: 2,
};

let clientIncrement = 0;

/**
 * Debugger log types
 * @constant DEBUGGER_LOG_TYPE
 * @enum {Number}
 */
export const DEBUGGER_LOG_TYPE = {
  ERROR: -1,
  INFO: 0,
  SUCCESS: 1,
};

export class WscClient {
  /**
   * @param {string} remote
   * @param {number} port
   * @param {Function} onMessage
   * @param {Function} onClose
   * @param {Function} onError
   */
  constructor(
    remote,
    port,
    onOpen,
    onMessage,
    onClose,
    onError,
  ) {
    this.remote = remote;
    this.port = port;
    this.id = WscClient.clientId;
    this.onMessage = onMessage;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.onError = onError;
    this.state = WSC_REMOTE_STATE.IDLE;
    /** @property {WebSocket} */
    this.ws = null;
    /** @property {RTCPeerConnection} */
    this.pc = null;
    /** @property {Array<RTCDataChannel>} */
    this.dataChannels = new Map();
    this.debug = [];
    this._packetId = 0;
  }

  static get clientId() {
    return `client_${Date.now()}_${clientIncrement++}`;
  }

  get packetId() {
    this._packetId = WscPacket._normalizeId(this._packetId + 1);
    return this._packetId;
  }

  /**
   *
   * @param {string} remote
   * @param {number} port
   * @param {Function} onOpen
   * @param {Function} onMessage
   * @param {Function} onClosure
   * @returns
   */
  static create(remote, port, onOpen, onMessage, onClosure, onError) {
    return new WscClient(
      remote,
      port,
      onOpen,
      onMessage,
      onClosure,
      onError,
    );
  }

  /**
   * Push debug data to local debug array
   *
   * @param {string} data
   * @param {DEBUGGER_LOG_TYPE} type
   * @param {string} context
   */
  pushToDebug(data, type = DEBUGGER_LOG_TYPE.INFO, context = null) {
    this.debug.push({
      data,
      type,
      timestamp: new Date().toLocaleTimeString(),
      context,
    });
    if (this.debug.length > DEBUG_QUEUE_MAXLEN) this.debug.shift();
  }

  /**
   * get date channel from lable and create a new one if it doesn't exist yet
   *
   * @param {string} label
   * @returns {RTCDataChannel}
   */
  getDataChannel(label) {
    if (!this.dataChannels.get(label)) {
      if (Object.keys(this.dataChannels).length > MAX_DATACHANNEL_COUNT) {
        throw new Error(`Maximum datachannle count reached: ${MAX_DATACHANNEL_COUNT}`);
      }
      const dc = this.peerConnection.createDataChannel(label);
      dc.onopen = () => { this.handleDcOpen(dc); };
      dc.onclose = this.handleDcClosure.bind(this);
      dc.onmessage = this.handleMessage.bind(this);
      this.dataChannels.set(label, dc);
    }

    return this.dataChannels.get(label);
  }

  /**
   * Prepare WSC Data channels (1 per domain).
   */
  prepareDataChannels() {
    Object.values(WscPacket.Type).forEach((t) => {
      const typeName = WscPacket._typeName(t);
      const dataChannelLabel = `${DATA_CHANNEL_NAME_PREFIX}:${typeName}`;
      this.getDataChannel(dataChannelLabel);
    });
  }

  /**
   * WebRTC connection setup (no STUN or TURN servers)
   */
  async createPeerConnection() {
    // eslint-disable-next-line no-undef
    this.peerConnection = new RTCPeerConnection({
      iceServers: [], // No STUN or TURN servers, using only local candidates
    });

    this.prepareDataChannels();

    // Handle ICE candidates
    this.peerConnection.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this.pushToDebug('Sending ICE candidate to signaling server:');
        this.ws.send(JSON.stringify({ type: 'ice', candidate }));
      } else {
        this.pushToDebug('ICE candidate gathering complete');
      }
    };

    this.peerConnection.onconnectionstatechange = this.handleConnectionState.bind(this);
  }

  /**
   * Handle WebRTC PeerConnection connection status
   */
  handleConnectionState() {
    switch (this.peerConnection.connectionState) {
      case 'closed':
        this.state = WSC_REMOTE_STATE.IDLE;
        break;
      case 'connecting':
        this.state = WSC_REMOTE_STATE.CONNECTING;
        break;
      case 'connected':
        this.state = WSC_REMOTE_STATE.CONNECTED;
        this.onOpen();
        break;
      case 'failed':
      default:
        this.state = WSC_REMOTE_STATE.ERROR;
    }
  }

  /**
   * Try and establish WSC connection
   *
   * @public
   */
  async connect() {
    if (this.state === WSC_REMOTE_STATE.CONNECTING) {
      this.close();
    }
    this.pushToDebug('Connecting...');
    this.pushToDebug(`Signaling through ws://${this.remote}:${this.port}/ws`);
    this.state = WSC_REMOTE_STATE.CONNECTING;
    try {
      // eslint-disable-next-line no-undef
      this.ws = new WebSocket(`ws://${this.remote}:${this.port}/ws`);
      this.ws.onopen = async () => {
        this.pushToDebug('WebSocket connected to signaling server');
        await this.createPeerConnection();
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);
        this.ws.send(JSON.stringify({ type: 'offer', offer }));
      };
      this.ws.onerror = () => {
        this.pushToDebug(`Signaling error, couldn't ws://${this.remote}:${this.port}/ws`, DEBUGGER_LOG_TYPE.ERROR);
        this.close();
      };
      this.ws.onmessage = async (message) => {
        const data = JSON.parse(message.data);
        if (data.type === 'offer') {
          this.pushToDebug('Received offer from server');
          await this.createPeerConnection();
          // eslint-disable-next-line no-undef
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
          // await this.peerConnection.setRemoteDescription({ sdp: data.offer, type: 'offer' });
          const answer = await this.peerConnection.createAnswer();
          await this.peerConnection.setLocalDescription(answer);
          this.ws.send(JSON.stringify({ type: 'answer', answer }));
        } else if (data.type === 'answer') {
          this.pushToDebug('Received answer from server');
          // eslint-disable-next-line no-undef
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
          // await this.peerConnection.setRemoteDescription({ sdp: data.candidate, type: 'answer' });
        } else if (data.type === 'ice' && data.candidate) {
          this.pushToDebug('Received ICE candidate from server:', data.candidate);
          try {
            if (data.candidate) {
              // eslint-disable-next-line no-undef
              const candidate = new RTCIceCandidate(data.candidate);
              await this.peerConnection.addIceCandidate(
                candidate,
              ); // Immediately add ICE candidates
            }
          } catch (error) {
            this.pushToDebug('Error adding ICE candidate:', error);
          }
        }
      };
    } catch (err) {
      this.pushToDebug(`Unknown error: ${JSON.stringify(err)}`, DEBUGGER_LOG_TYPE.ERROR);
      this.close();
    }
  }

  /**
   * Handler for DMX DataChannel messages
   *
   * @public
   * @param {MessageEvent} e DMX DataChannel message
   */
  handleMessage(e) {
    const raw = e.data;
    const packet = WscPacket.deserialize(raw);
    this.onMessage(packet);
  }

  /**
   * Forward data over the WebRTC dataChannel
   *
   * @param {WscPacket} packet
   * @param {string} destinationId unique destination datachannel id for the packet
   */
  send(packet, destinationId = null) {
    const dataChannelLabel = `${DATA_CHANNEL_NAME_PREFIX}:${packet.typeName()}${destinationId ? `:${destinationId}` : ''}`;
    const dc = this.getDataChannel(dataChannelLabel);

    if (dc.readyState === 'open') {
      packet.id = this.packetId;
      dc.send(packet.serialize());
    }
  }

  /**
   * Forwards open communication message to parent.
   *
   * @param {RTCDataChannel} dc
   * @public
   */
  handleDcOpen(dc) {
    this.pushToDebug(`Connected to ${dc?.label}`, DEBUGGER_LOG_TYPE.SUCCESS);
  }

  /**
   * handles DataChannel closure
   *
   * @param {RTCDataChannelEvent} e
   * @public
   */
  handleDcClosure(e) {
    const dc = e.channel;
    this.pushToDebug(`Disconnected from ${dc?.label}`, DEBUGGER_LOG_TYPE.ERROR);
  }

  /**
   * Start keepalive session
   *
   * @public
   */
  startKeepAliveSession() {
    this.keepAliveTimer = setInterval(() => {
      const flags = new WscFlags();
      const packet = WscPacket.create(
        WscPacket.Type.STATE_QUERY,
        { queryType: WscPacket.StateQuery.KEEPALIVE },
        { flags },
      );
      this.send(packet);
    }, KEEPALIVE_INTERVAL);
  }

  /**
   * Stop keepalive session
   *
   * @public
   */
  stopKeepaliveSession() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  /**
   * Handles DMXdatachannel closure
   *
   * @public
   */
  close() {
    this.pushToDebug('Closing connection', DEBUGGER_LOG_TYPE.ERROR);
    this.onClose();
    if (this.ws) {
      this.ws.onclose = () => {};
      this.ws.onerror = () => {};
      this.ws.close();
      this.ws = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
    }
    this.state = WSC_REMOTE_STATE.IDLE;
  }
}

let clientManagerInstance;

export default class WscClientManager {
  constructor() {
    if (!clientManagerInstance) {
      /**
       * @property {WscPeer[]}
       */
      this.clients = new Map();
      clientManagerInstance = this;
    }

    // eslint-disable-next-line no-constructor-return
    return clientManagerInstance;
  }

  static get clients() {
    return this.clients;
  }

  /**
   *
   * @param {string} remote
   * @param {number} port
   * @param {Function} onOpen
   * @param {Function} onMessage
   * @param {Function} onError
   * @returns
   */
  createClient(remote, port, onOpen, onMessage, onError) {
    const client = WscClient.create(
      remote,
      port,
      onOpen,
      onMessage,
      onError,
    );

    this.clients.set(client.id, client);

    return client;
  }
}

clientManagerInstance = new WscClientManager();
