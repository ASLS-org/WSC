/* eslint-disable max-classes-per-file */

import Dgram from 'dgram';
import { WscPacket, WscTransport, combineToUInt16 } from '@asls/wsc-sdk';
import Logger from '../../utils/logger.js';

/**
 * @type {import('dgram').SocketOptions}
 */
const UDP_OPT = {
  type: 'udp4',
  reuseAddr: true,
};

/**
 * List of ArtNet OPCODES
 *
 * @constant {Object} ARTNET_OPCODES
 * @global
 */
const ARTNET_OPCODES = {
  // Device Discovery Packets
  OpPoll: 0x2000,
  OpPollReply: 0x2100,
  // Device Configuration Packets
  OpAddress: 0x6000,
  OpInput: 0x7000,
  OpIpProg: 0xf800,
  OpIpProgReply: 0xf900,
  OpCOmmand: 0x2400,
  // Streaming Control Packets
  OpDmx: 0x5000,
  OpNzs: 0x5100,
  OpSync: 0x5200,
  // RDM Packets
  OpTodRequest: 0x8000,
  OpTodData: 0x8100,
  OpTodControl: 0x8200,
  OpRdm: 0x8300,
  OpRdmSub: 0x8400,
  // Time-Keeping Packets
  OpTimeCode: 0x9700,
  OpTimeSync: 0x9800,
  // Triggering Packets
  OpTrigger: 9900,
  // Diagnostics Packets
  OpDiagData: 0x2300,
};

/**
 * ArtNet protocol version
 *
 * @constant {Object} ARTNET_PROTOCOL_VERSION
 * @global
 */
const ARTNET_PROTOCOL_VERSION = {
  HI: 0,
  LO: 14,
};

/**
 * ArtDMX packet SubUni slot byte offset
 *
 * @constant {Number} ARTNET_PACKET_UNIVERSE_LOW_OFFSET
 * @global
 */
const ARTNET_PACKET_UNIVERSE_LOW_OFFSET = 14;
/**
 * ArtDMX packet Net slot byte offset
 *
 * @constant {Number} ARTNET_PACKET_UNIVERSE_HI_OFFSET
 * @global
 */
const ARTNET_PACKET_UNIVERSE_HI_OFFSET = 15;
/**
 * ArtDMX packet Data slot byte offset
 *
 * @constant {Number} ARTNET_PACKET_UNIVERSE_HI_OFFSET
 * @global
 */
const ARTNET_PACKET_DATA_OFFSET = 18;

/**
 * ArtNet packet sequence to be incremented on each packet forwarding (limit to 255).
 *
 * @var {Number} channelId
 * @global
 */
let sequence = 0;

const logger = new Logger('ArtnetForwarder');

/**
 * ArtNet Streaming packet model.
 *
 * @class ArtNetStreamingPacket
 */
export class ArtNetStreamingPacket {
  /**
   * ArtNetStreamingPacket contructructor
   *
   * @constructs ArtNetStreamingPacket
   * @param {Object} data
   * @param {Number} data.opCode ArtNet packet packet opcode
   * @param {Number} data.universe ArtNet packet universe
   * @param {Array<Number>} data.data ArtNet packet data
   */
  constructor(data) {
    this._opCodeLo = 0;
    this._opCodeHi = 0;
    this._protVerHi = ARTNET_PROTOCOL_VERSION.HI;
    this._protVerLo = ARTNET_PROTOCOL_VERSION.LO;
    this._sequence = sequence++ % 255;
    this._physical = 0;
    this._subUni = 0;
    this._net = 0;
    this._lengthHi = 0;
    this._lengthLo = 0;
    this._data = [];

    this.id = 'Art-Net';
    this.opCode = data.opCode;
    this.universe = data.universe;
    this.length = 0;
    this.data = data.data;
  }

  /**
   * ArtNet packet universe ID
   *
   * @param {Number} universe
   */
  set universe(universe) {
    this._subUni = ArtNetStreamingPacket.getLo(universe);
    this._net = ArtNetStreamingPacket.getHi(universe);
  }

  /**
   * ArtNet packet universe opCode
   *
   * @param {Number} opCode
   */
  set opCode(opCode) {
    this._opCodeLo = ArtNetStreamingPacket.getLo(opCode);
    this._opCodeHi = ArtNetStreamingPacket.getHi(opCode);
  }

  /**
   * ArtNet packet data
   *
   * @param {Number[]} data
   */
  set data(data) {
    this._data = data;
    this._lengthLo = ArtNetStreamingPacket.getLo(data.length);
    this._lengthHi = ArtNetStreamingPacket.getHi(data.length);
  }

  /**
   * ArtNet packet data
   *
   * @returns {Uint8Array} raw ArtNet packet
   */
  get final() {
    const id = new Uint8Array(
      this.id
        .split('')
        .map((c) => c.charCodeAt(0))
        .concat(0x00),
    );
    const protocol = new Uint8Array([
      this._opCodeLo,
      this._opCodeHi,
      this._protVerHi,
      this._protVerLo,
      this._sequence,
      this._physical,
      this._subUni,
      this._net,
      this._lengthHi,
      this._lengthLo,
    ]);
    return new Uint8Array([...id, ...protocol, ...new Uint8Array(this._data)]);
  }

  /**
   * ArtNet packet buffer
   *
   * @returns {Buffer} bufferized ArtNet packet
   */
  get buffer() {
    return Buffer.from(this.final);
  }

  /**
   * Returns an integer's Low byte
   *
   * @method getLo
   * @param {Number} bytes Integer to be parsed
   * @returns {Number} Value's Low byte
   */
  static getLo(bytes) {
    return bytes & 0xff;
  }

  /**
   * Returns an integer's High byte
   *
   * @method getLo
   * @param {Number} bytes Integer to be parsed
   * @returns {Number} Value's High byte
   */
  static getHi(bytes) {
    return (bytes >> 8) & 0xff;
  }
}

/**
 * ArtDMX Streaming packet model.
 *
 * @class ArtDmxPacket
 * @extends ArtNetStreamingPacket
 */
export class ArtDmxPacket extends ArtNetStreamingPacket {
  /**
   * ArtDmxPacket constructor
   *
   * @constructs ArtDmxPacket
   * @param {Number} universe
   * @param {Array<Number>} data
   */
  constructor(universe, data) {
    super({
      opCode: ARTNET_OPCODES.OpDmx,
      universe,
      data,
    });
  }
}

let forwarderInstance;

export default class ArtnetForwarder {
  constructor() {
    // eslint-disable-next-line no-use-before-define
    if (!forwarderInstance) {
      this.init();
      // eslint-disable-next-line no-use-before-define
      forwarderInstance = this;
    }
    // eslint-disable-next-line no-constructor-return, no-use-before-define
    return forwarderInstance;
  }

  init() {
    logger.info('Running ArtNet forwarder\n');
    this.artnetSocket = Dgram.createSocket(UDP_OPT);
  }

  /**
   * Forwards ArtDMX packet to artnet server
   *
   * @method forwardDMXData
   * @param {WscPacket} packet packet to be forwarded
   * @public
   */
  forwardDMXData(packet) {
    if (packet.transport instanceof WscTransport) {
      const decodedPayload = WscPacket.decode(packet);
      const artnetPacket = new ArtDmxPacket(
        decodedPayload.universe,
        decodedPayload.values,
      );
      this.artnetSocket.send(
        artnetPacket.buffer,
        0,
        artnetPacket.buffer.length,
        packet.transport.ipv4.port,
        packet.transport.ipv4.ip,
      );
    }
  }

  /**
   * Parses ArtDMX packets incoming from artnet server
   *
   * @method parseARTNetData
   * @public
   * @param {Buffer} artnetFrame ArtDMX packet
   * @return {Object} parsed DMX data
   */
  static parseARTNetData(artnetFrame) {
    const DMXData = artnetFrame.slice(ARTNET_PACKET_DATA_OFFSET);
    const lo_uni_byte = artnetFrame[ARTNET_PACKET_UNIVERSE_LOW_OFFSET];
    const hi_uni_byte = artnetFrame[ARTNET_PACKET_UNIVERSE_HI_OFFSET];
    const universe_id = combineToUInt16(hi_uni_byte, lo_uni_byte);
    return {
      universe: universe_id,
      DMX512Buffer: DMXData,
    };
  }

  /**
   * Computes broadcast address from cidr
   *
   * @method _getBroadcastFromCidr
   * @static
   * @param {String} address ip address string
   * @param {String} netmask netmask string
   * @return {String} Interface's broadcast address
   */
  static _getBroadcast(address, netmask) {
    const ip = ArtnetForwarder._IPToInt(address);
    const mask = ArtnetForwarder._IPToInt(netmask);
    const min = (ip & mask) >>> 0;
    const max = (min | ~mask) >>> 0;
    return ArtnetForwarder._intToIP(max);
  }

  /**
   * Converts ip address string to unsigned 32bit integer
   *
   * @method _IPToInt
   * @static
   * @param {String} ipStr ip address string
   * @returns {Number} ip address converted to unsigned 32bit integer
   */
  static _IPToInt(ipStr) {
    // logger.debug(ipStr)
    const chunks = ipStr.split('.');
    let ip = 0;
    chunks.forEach((chunk) => {
      ip <<= 8;
      ip += parseInt(chunk, 10);
    });
    return ip >>> 0;
  }

  /**
   * Converts unsigned 32bit integer to ip address string
   *
   * @method _intToIP
   * @static
   * @param {Number} intVal unsigned 32bit integer
   * @return {String} unsigned 32bit integer ip address converted to string
   */
  static _intToIP(intVal) {
    const ip = [];
    for (let i = 4; i > 0; i--) {
      ip.unshift((intVal & 0x000000ff) >>> 0);
      intVal >>= 8;
    }
    return ip.join('.');
  }
}

forwarderInstance = new ArtnetForwarder();
