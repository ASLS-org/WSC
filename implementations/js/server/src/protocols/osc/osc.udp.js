/* eslint-disable max-classes-per-file */
import Dgram from 'dgram';
import {
  BinaryWriter,
  WscError,
  WscPacket,
  WscTransport,
} from '@asls-org/wsc-sdk';
import { TextEncoder } from 'util';
import Logger from '../../utils/logger.js';
import AbstractWscGateway from '../../gateways/abstract.gateway.js';

const OSC_TCP_PORT = 8000;
const OSC_TCP_DEFAULT_HOST = 'localhost';

const logger = new Logger('OscUdpForwarder');

let forwarderInstance;

/**
 * @type {import('dgram').SocketOptions}
 */
const UDP_OPT = {
  type: 'udp4',
  reuseAddr: true,
};

export default class OscUdpForwarder {
  constructor() {
    if (!forwarderInstance) {
      this.init();
      forwarderInstance = this;
    }
    // eslint-disable-next-line no-constructor-return, no-use-before-define
    return forwarderInstance;
  }

  static TypeTag = {
    I32: 'i',
    F32: 'f',
    STR: 's',
    BLOB: 'b',
  };

  init() {
    logger.info('Running OSC UDP forwarder\n');
    this.udpSocket = Dgram.createSocket(UDP_OPT);
  }

  /**
   * maps raw valueType to String
   * @param {number} valueType
   */
  static mapValueTypeToOscTypeTag(valueType) {
    switch (valueType) {
      case WscPacket.ValueType.U8:
      case WscPacket.ValueType.U16:
      case WscPacket.ValueType.U32:
      case WscPacket.ValueType.U64:
        return OscUdpForwarder.TypeTag.I32;
      case WscPacket.ValueType.F32:
      case WscPacket.ValueType.F64:
        return OscUdpForwarder.TypeTag.F32;
      default:
        throw new Error(`Unsupported valueType: ${valueType}`);
    }
  }

  /**
   *
   * @param {BinaryWriter} writer
   * @param {string} str
   */
  static writeOscString(writer, str) {
    const bytes = new TextEncoder().encode(str);

    writer.writeBytes(bytes);
    writer.writeUInt8(0); // null terminator

    const pad = (4 - ((bytes.length + 1) % 4)) % 4;
    for (let i = 0; i < pad; i++) {
      writer.writeUInt8(0);
    }
  }

  /**
   * Prepares OSC Cue from WscPacket
   *
   * @method forwardOSCData
   * @param {WscPacket} packet packet to be forwarded
   * @public
   */
  static prepareCuePayloadFromWscPacket(packet) {
    const payload = WscPacket.decode(packet);
    const addressString = payload.address?.toString()?.replaceAll('.', '/');
    const writer = new BinaryWriter();
    const action = payload?.action;
    const actionString = Object.entries(WscPacket.CueAction).find(([, v]) => v === action)[0];

    OscUdpForwarder.writeOscString(writer, `/${addressString}/${actionString}`);

    return writer.toUint8Array();
  }

  /**
   * Prepares OSC control from WscPacket
   *
   * @method forwardOSCData
   * @param {WscPacket} packet packet to be forwarded
   * @public
   */
  static prepareControlPayloadFromWscPacket(packet) {
    const payload = WscPacket.decode(packet);
    const addressString = payload.address?.toString()?.replaceAll('.', '/');
    const writer = new BinaryWriter();
    const { value, valueType } = payload;
    const oscTypeTag = OscUdpForwarder.mapValueTypeToOscTypeTag(valueType);

    OscUdpForwarder.writeOscString(writer, `/${addressString}`);
    OscUdpForwarder.writeOscString(writer, `,${oscTypeTag}`);

    switch (oscTypeTag) {
      case OscUdpForwarder.TypeTag.F32:
        writer.writeFloat32(value, false);
        break;
      case OscUdpForwarder.TypeTag.I32:
        writer.writeInt32(value, false);
        break;
      case OscUdpForwarder.TypeTag.STR:
        writer.writeBytes(value);
        break;
        // TODO: implement Blob
      default:
        throw new WscError(
          WscError.Type.PACKET,
          WscPacket.ErrorCode.MALFORMED_PACKET,
          `Unsupported OSC typetag: ${oscTypeTag}`,
        );
    }

    return writer.toUint8Array();
  }

  /**
   * Prepares OSC from WscPacket
   *
   * @method forwardOSCData
   * @param {WscPacket} packet packet to be forwarded
   * @public
   */
  static preparePayloadFromWscPacket(packet) {
    switch (packet.type) {
      case WscPacket.Type.CONTROL_CUE:
        return OscUdpForwarder.prepareCuePayloadFromWscPacket(packet);
      case WscPacket.Type.CONTROL_PARAM:
        return OscUdpForwarder.prepareControlPayloadFromWscPacket(packet);
      default:
        throw new WscError(
          WscError.Type.GATEWAY,
          AbstractWscGateway.WscGatewayError.UNSUPPORTED_PACKET_TYPE,
          `Unsupported packet type ${packet.type}`,
        );
    }
  }

  /**
   * Forwards OSC packet to OSC server over TCP
   *
   * @method forwardOSCData
   * @param {WscPacket} packet packet to be forwarded
   * @public
   */
  forwardOSCData(packet) {
    if (packet.transport instanceof WscTransport) {
      const port = packet.transport?.ipv4?.port ?? OSC_TCP_PORT;
      const host = OSC_TCP_DEFAULT_HOST;

      const payload = OscUdpForwarder.preparePayloadFromWscPacket(packet);

      logger.debug(payload);

      this.udpSocket.send(
        payload,
        0,
        payload.length,
        port,
        host,
      );
    }
  }
}

forwarderInstance = new OscUdpForwarder();
