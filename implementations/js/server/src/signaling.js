/* eslint-disable max-classes-per-file */
import { WebSocketServer } from 'ws';
import Logger from './utils/logger.js';
// eslint-disable-next-line import/no-cycle
import WscPeerManager from './peer.js';

export const DEFAULT_WS_SIGNALING_PORT = 4515;
export const SIGNALING_MSG_TYPE = {
  OFFER: 'offer',
  ANSWER: 'answer',
  ICE: 'ice',
};

const logger = new Logger('SignalingServer');

let signalingInstance = null;
let counter = 0;

export class SignalingClient {
  /**
   *
   * @param {import('ws').WebSocket} ws
   * @param {string} id
   */
  constructor(ws, id) {
    this.id = id;
    this.ws = ws;
  }

  /**
   *
   * @param {object} data
   */
  send(data) {
    this.ws.send(JSON.stringify(data));
  }

  close() {
    this.ws.close();
    this.ws = null;
  }
}

export default class SignalingServer {
  constructor() {
    if (!signalingInstance) {
      this.port = DEFAULT_WS_SIGNALING_PORT;
      this.wss = new WebSocketServer({ port: this.port });
      this.clients = new Map();
      signalingInstance = this;
    }

    // eslint-disable-next-line no-constructor-return
    return signalingInstance;
  }

  /**
   *
   * @returns {SignalingServer} signaling server instance
   */
  static getInstance() {
    if (!signalingInstance) signalingInstance = new SignalingServer();
    return signalingInstance;
  }

  static genClientId() {
    return `peer_${Date.now()}_${counter++}`;
  }

  listen() {
    const peerManager = WscPeerManager.getInstance();

    if (this.wss) {
      this.wss.on('connection', (ws) => {
        const peer = peerManager.createPeerConnection(ws);

        ws.onmessage = peer.handleSignaling.bind(peer);
        ws.onclose = () => this.handleClosure(peer.client.id);
        ws.onerror = this.handleError.bind(this);

        this.clients.set(peer.client.id, peer.client);

        logger.debug(`Client connected from to server: ${peer.client.id}`);
      });
      logger.info(`Signaling server listening on port ${this.port}`);
    } else {
      throw new Error('No web socket server instance');
    }
  }

  /**
   * handle connection closure
   *
   * @param {string} clientId
   */
  handleClosure(clientId) {
    logger.debug(`Client disconnected from signaling server: ${clientId}`);
  }

  handleError(err) {
    logger.debug('Signaling server error:', err);
  }
}
