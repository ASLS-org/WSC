import { WscError, WscPacket, WscTransport } from '@asls/wsc-sdk';
import ArtnetForwarder from '../protocols/dmx/dmx.artnet';
import AbstractWscGateway from './abstract.gateway';

const SUPPORTED_PACKET_TYPES = [
  WscPacket.Type.STREAM_CHANNELS,
  WscPacket.Type.STREAM_TIMECODE,
];

export default class WscStreamGateway extends AbstractWscGateway {
  constructor() {
    super(SUPPORTED_PACKET_TYPES);
    this.artnetForwarder = new ArtnetForwarder();
  }

  /**
   * process WSC STREAM_CHANNELS packets
   *
   * @param {WscPacket} packet
   */
  processStreamChannels(packet) {
    switch (packet.transport.protocol) {
      case WscTransport.Protocol.ARTNET:
        this.artnetForwarder.forwardDMXData(packet);
        break;
      default: break;
    }
  }

  /**
   * process WSC STREAM_TIMECODE packets
   *
   * @param {WscPacket} packet
   */
  processStreamTimecode(packet) {
    switch (packet.transport.protocol) {
      case WscTransport.Protocol.MTC:
        // TODO: handle MTC forwarding
        break;
      default:
        throw new WscError(
          WscError.Type.GATEWAY,
          AbstractWscGateway.WscGatewayError.UNSUPPORTED_PROTOCOL,
          `Unsupported protocol: ${packet.transport.protocol} `,
        );
    }
  }

  /**
   * process WSC Stream Packets
   *
   * @param {WscPacket} packet
   */
  processPacket(packet) {
    this.validatePacket(packet);

    switch (packet.type) {
      case WscPacket.Type.STREAM_CHANNELS:
        this.processStreamChannels(packet);
        break;
      case WscPacket.Type.STREAM_TIMECODE:
        this.processStreamTimecode(packet);
        break;
      default:
        throw new WscError(
          WscError.Type.GATEWAY,
          AbstractWscGateway.WscGatewayError.UNSUPPORTED_PACKET_TYPE,
          `Unsupported packet type: ${packet.type} `,
        );
    }
  }
}
