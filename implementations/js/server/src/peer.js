/* eslint-disable max-classes-per-file */
// @ts-ignore
import wrtc from '@roamhq/wrtc';
import Logger from './utils/logger';
// eslint-disable-next-line import/no-cycle
import { SIGNALING_MSG_TYPE, SignalingClient } from './signaling';

const logger = new Logger('WSCPeer');

export const DATA_CHANNEL_NAME_PREFIX = 'WSC!DC';
export const DATA_CHANNEL_LABEL_DELIMITOR = ':';
export const SUPPORTED_OUTBOUND_DATA_CHANNELS = {
  STATE_ANSWER: `${DATA_CHANNEL_NAME_PREFIX}${DATA_CHANNEL_LABEL_DELIMITOR}STATE_QUERY`,
  STATE_ERROR: `${DATA_CHANNEL_NAME_PREFIX}${DATA_CHANNEL_LABEL_DELIMITOR}STATE_ERROR`,
};

let peerManagerInstance = null;
const peerIdIncrement = 0;

export class WscPeer {
  /**
   *
   * @param {SignalingClient} client
   * @param {RTCPeerConnection} pc
   * @param {string} id
   */
  constructor(client, pc, id) {
    this.client = client;
    this.pc = pc;
    this.id = id;
    this.messageId = 0;
    /** @property {RTCDataChannel[]} */
    this.dataChannels = new Map();
  }

  /**
   * Generate unique peer id
   *
   * @returns {string} the newly generate peer id
   */
  static genPeerId() {
    return `peer_${Date.now()}_${peerIdIncrement}`;
  }

  /**
   * Creates a new WscPeer instance
   *
   * @param {import('ws').WebSocket} ws signaling client instance
   * @param {Function} onMessage
   * @param {Function} onClose
   * @returns
   */
  static create(ws, onMessage, onClose) {
    const id = WscPeer.genPeerId();
    // No STUN/TURN servers, using only local candidates
    const pc = new wrtc.RTCPeerConnection({ iceServers: [] });
    const client = new SignalingClient(ws, id);
    const peer = new WscPeer(client, pc, id);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        logger.debug('Sending ICE candidate to signaling server:', event.candidate);
        peer.client.send({ type: 'ice', candidate: event.candidate });
      }
    };

    pc.oniceconnectionstatechange = () => {
      logger.debug('ICE connection state change:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected') {
        logger.debug('ICE connection established.');
      } else {
        logger.debug('ICE state:', pc.iceConnectionState);
      }
    };

    pc.ondatachannel = (dc) => {
      dc.channel.onclose = onClose.bind(this);
      dc.channel.onmessage = (msg) => onMessage(peer, msg);
      peer.dataChannels.set(dc.channel.label, dc.channel);
    };

    return peer;
  }

  async handleOffer(offer) {
    try {
      // Set the remote description (Offer)
      await this.pc.setRemoteDescription(new wrtc.RTCSessionDescription(offer));

      // Create and send the answer
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);

      this.client.send({ type: 'answer', answer });
    } catch (error) {
      logger.error('Error handling offer:', error);
    }
  }

  async handleAnswer(answer) {
    try {
      await this.pc.setRemoteDescription(new wrtc.RTCSessionDescription(answer));
    } catch (error) {
      logger.error('Error handling answer:', error);
    }
  }

  async handleIceCandidate(candidate) {
    try {
      if (candidate.candidate) {
        const iceCandidate = new wrtc.RTCIceCandidate(candidate);
        await this.pc.addIceCandidate(iceCandidate);
      }
    } catch (error) {
      logger.error('Error adding ICE candidate:', error);
    }
  }

  async handleSignaling(msg) {
    const data = JSON.parse(msg.data);
    try {
      if (data.type === SIGNALING_MSG_TYPE.OFFER) {
        // Handle Offer (Offer received from browser)
        logger.debug('Received offer from client');
        await this.handleOffer(data.offer);
      } else if (data.type === SIGNALING_MSG_TYPE.ANSWER) {
        // Handle Answer (Answer from browser)
        logger.debug('Received answer from client');
        await this.handleAnswer(data.answer);
      } else if (data.type === SIGNALING_MSG_TYPE.ICE) {
        // Handle ICE candidate
        logger.debug('Received ICE candidate from client');
        await this.handleIceCandidate(data.candidate);
      } else {
        logger.debug('Unknown signaling message type:', data.type);
      }
    } catch (error) {
      logger.error('Error handling message:', error);
    }
  }

  /**
   *
   * @param {string} type
   * @returns {RTCDataChannel}
   */
  getDataChannelByType(type) {
    return this.dataChannels.get(`${DATA_CHANNEL_NAME_PREFIX}${DATA_CHANNEL_LABEL_DELIMITOR}${type}`);
  }

  /**
   *
   * @param msg
   */
  sendStateAnswerMessage(msg) {
    const dc = this.getDataChannelByType('STATE_ANSWER');
    if (dc) dc.send(msg);
  }

  /**
   *
   * @param msg
   */
  sendStateErrorMessage(msg) {
    const dc = this.getDataChannelByType('STATE_ERROR');
    if (dc) dc.send(msg);
  }
}

export default class WscPeerManager {
  constructor() {
    if (!peerManagerInstance) {
      /**
       * @property {WscPeer[]}
       */
      this.peers = new Map();
      this.onMessage = null;
      peerManagerInstance = this;
    }

    // eslint-disable-next-line no-constructor-return
    return peerManagerInstance;
  }

  /**
   * Get WscPeerManager instance
   *
   * @return {WscPeerManager} WscPeer instance
   */
  static getInstance() {
    if (!peerManagerInstance) return new WscPeerManager();
    return peerManagerInstance;
  }

  static bindOnMessageCallback(callback) {
    const instance = this.getInstance();
    instance.onMessage = callback;
  }

  /**
   *
   * @param {WscPeer} peer
   */
  async handleClosure(peer) {
    if (peer) {
      peer.pc.close();
      peer.pc = null;
      peer.client.close();
      peer.client = null;
      this.peers.delete(peer.id);
    }
  }

  async handleError(err) {
    logger.error(err);
  }

  /**
   *
   *
   * @param {WscPeer} peer
   * @param {string} msg
   */
  async handleMessage(peer, msg) {
    this.onMessage(msg, peer);
  }

  /**
   *
   * @param {import('ws').WebSocket} ws signaling websocket instance
   * @returns
   */
  static createPeerConnection(ws) {
    const instance = WscPeerManager.getInstance();
    return instance.createPeerConnection(ws);
  }

  /**
   *
   * @param {import('ws').WebSocket} ws signaling websocket instance
   * @returns
   */
  createPeerConnection(ws) {
    logger.debug('Creating new WebRTC peer connection');

    const peer = WscPeer.create(
      ws,
      this.handleMessage.bind(this),
      this.handleClosure.bind(this),
    );

    this.peers.set(peer.id, peer);

    return peer;
  }
}

peerManagerInstance = new WscPeerManager();
