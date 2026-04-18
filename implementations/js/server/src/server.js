import { WscPacket, WscError } from '@asls/wsc-sdk';
import SignalingServer from './signaling';
import Logger from './utils/logger';
import WscStreamGateway from './gateways/stream.gateway';
import WscStateGateway from './gateways/state.gateway.js';
import AbstractWscGateway from './gateways/abstract.gateway.js';
import WscControlGateway from './gateways/control.gateway.js';
import WSCPeer from './peer.js';

// ASLS!
export const ASLS_WSC_PORT = 4515;
export const DEFAULT_WS_SIGNALING_PORT = ASLS_WSC_PORT;

const logger = new Logger('WSCServer');

let wscServerInstance;
const streamGatewayInstance = new WscStreamGateway();
const stateGatewayInstance = new WscStateGateway();
const controlGatewayInstance = new WscControlGateway();

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

export default class WSCServer {
  constructor() {
    if (!wscServerInstance) {
      this.startTime = Date.now();
      wscServerInstance = this;
    }
    // eslint-disable-next-line no-constructor-return
    return wscServerInstance;
  }

  get capabilities() {
    return {};
  }

  get uptime() {
    return this.startTime - Date.now();
  }

  get version() {
    return WscPacket.protocolVersion;
  }

  get statistics() {
    return {
      version: this.version,
      upTime: this.uptime,
      capabilities: this.capabilities,
    };
  }

  listen() {
    const signalingServer = SignalingServer.getInstance();
    WSCPeer.bindOnMessageCallback(this.onMessage.bind(this));
    try {
      if (signalingServer) {
        signalingServer.listen();
      } else {
        throw new Error('Signaling server instance doesn\'t appear to be running yet');
      }
    } catch (err) {
      logger.error(err);
    }
  }

  /**
   * Handle WSC Data Stream Packet
   * @param {WscPacket} packet
   * @param {import('./peer.js').WscPeer} peer
   */
  // eslint-disable-next-line no-unused-vars
  handleWscPacket(packet, peer) {
    try {
      const validation = WscPacket.validate(packet);
      if (validation.valid) {
        switch (packet.type) {
          case WscPacket.Type.STREAM_CHANNELS: streamGatewayInstance.processPacket(packet); break;
          case WscPacket.Type.CONTROL_PARAM:
          case WscPacket.Type.CONTROL_CUE: controlGatewayInstance.processPacket(packet); break;
          case WscPacket.Type.STATE_QUERY: stateGatewayInstance.processPacket(packet, peer); break;
          default:
            throw new WscError(
              WscError.Type.GATEWAY,
              AbstractWscGateway.WscGatewayError.UNSUPPORTED_PACKET_TYPE,
              `Unsupported packet type: ${packet.type}`,
            );
        }
      } else {
        throw new WscError(
          WscError.Type.PACKET,
          WscPacket.ErrorCode.VALIDATION_FAILED,
          'Packet validation failed',
        );
      }
    } catch (err) {
      if (err instanceof WscError) {
        const answer = WscPacket.create(
          WscPacket.Type.STATE_ERROR,
          {
            errorCode: err.errCode,
            message: err.message,
            context: err.stack,
          },
        );

        peer.sendStateErrorMessage(answer.serialize());
      }
      logger.error(err);
    }
  }

  /**
   * On DC message event
   * @param {{type: string, data: Uint8Array}} msg
   * @param {import('./peer.js').WscPeer} peer
   */
  onMessage(msg, peer) {
    const packet = WscPacket.deserialize(msg.data);
    this.handleWscPacket(packet, peer);
  }
}

wscServerInstance = new WSCServer();
