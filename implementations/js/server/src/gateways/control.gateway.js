import { WscPacket, WscTransport } from '@asls/wsc-sdk';
import OscUdpForwarder from '../protocols/osc/osc.udp';
import AbstractWscGateway from './abstract.gateway';

const SUPPORTED_PACKET_TYPES = [
  WscPacket.Type.CONTROL_CUE,
  WscPacket.Type.CONTROL_PARAM,
];

export default class WscControlGateway extends AbstractWscGateway {
  constructor() {
    super(SUPPORTED_PACKET_TYPES);
    this.oscForwarder = new OscUdpForwarder();
  }

  /**
   * process WSC Cue Packet
   *
   * @param {WscPacket} packet
   */
  processPacket(packet) {
    this.validatePacket(packet);

    switch (packet?.transport.protocol) {
      case WscTransport.Protocol.OSC:
        this.oscForwarder.forwardOSCData(packet);
        break;
      default:
        throw new Error(`Unhandled protocol ${WscTransport.Protocol.OSC}`);
    }
  }
}
