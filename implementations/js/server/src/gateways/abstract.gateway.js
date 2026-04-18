import { WscError, WscPacket } from '@asls-org/wsc-sdk';

export default class AbstractWscGateway {
  /**
   * Constructs Abstract WSC Gateway instance
   *
   * @param {Array<number>} supportedPacketTypes
   */
  constructor(supportedPacketTypes) {
    this.supportedPacketTypes = supportedPacketTypes;
  }

  static WscGatewayError = {
    UNSUPPORTED_PACKET_TYPE: 0x0000,
    UNSUPPORTED_PROTOCOL: 0x0001,
    UNSUPPORTED_PAYLOAD: 0x0001,
  };

  _validateType(type) {
    if (!this.supportedPacketTypes.includes(type)) {
      throw new WscError(
        WscError.Type.GATEWAY,
        AbstractWscGateway.WscGatewayError.UNSUPPORTED_PACKET_TYPE,
        'Invalid packet type',
      );
    }
  }

  validatePacket(packet) {
    WscPacket.validate(packet);
    this._validateType(packet.type);
  }

  /**
   * process WscPacket
   * @param {WscPacket} packet
   * @param {any} peer
   */
  // eslint-disable-next-line no-unused-vars
  processPacket(packet, peer) {
    throw new Error('No implementation for processPacket');
  }
}
