import { SerialPort } from 'serialport';
import { WscPacket, WscTransport } from '@asls/wsc-sdk';
import Logger from '../../utils/logger.js';

/**
 * ENTTEC DMX USB PRO 开放协议的帧格式——市面上便宜的 USB-DMX 转接器
 * (国内某宝几十块钱那种)基本都靠 FTDI 虚拟串口驱动兼容这一套，不需要
 * 按厂商各写一份。协议只有这几个字节：
 *   0x7E <label> <lenLSB> <lenMSB> <数据...> 0xE7
 * "Output Only Send DMX Packet" 对应 label = 6，数据第一个字节固定是
 * DMX start code（0x00），后面跟最多 512 个通道值。
 */
const ENTTEC = {
  START: 0x7E,
  END: 0xE7,
  LABEL_SEND_DMX: 6,
};

/**
 * @param {Uint8Array} channelValues 不含 start code 的通道数据（最多 512 个）
 * @returns {Buffer} 可以直接写入串口的完整帧
 */
function buildEnttecFrame(channelValues) {
  const payload = Buffer.concat([Buffer.from([0x00]), Buffer.from(channelValues)]);
  const len = payload.length;
  const header = Buffer.from([ENTTEC.START, ENTTEC.LABEL_SEND_DMX, len & 0xFF, (len >> 8) & 0xFF]);
  return Buffer.concat([header, payload, Buffer.from([ENTTEC.END])]);
}

const logger = new Logger('SerialDmxForwarder');
let forwarderInstance;

export default class SerialDmxForwarder {
  constructor() {
    if (!forwarderInstance) {
      this.init();
      forwarderInstance = this;
    }
    // eslint-disable-next-line no-constructor-return
    return forwarderInstance;
  }

  init() {
    logger.info('Running Serial DMX (ENTTEC USB PRO 兼容) forwarder\n');
    /** @type {Map<number, import('serialport').SerialPort>} portIndex -> 打开的串口 */
    this.ports = new Map();
  }

  /**
   * WSC 的 transport descriptor 里，串口地址是一个数字索引(0、1、2...)，
   * 不是像 "COM3" 这样的操作系统路径——具体第几个对应哪台物理设备，
   * 取决于这台机器当前实际接了什么，不是写死的，每次按需现查现开。
   *
   * @param {number} portIndex
   * @param {number} [baud] 缺省用 DMX512 标准波特率 250000（8N2）
   * @returns {Promise<import('serialport').SerialPort|null>}
   */
  async _getPort(portIndex, baud) {
    if (this.ports.has(portIndex)) return this.ports.get(portIndex);
    let list;
    try {
      list = await SerialPort.list();
    } catch (e) {
      logger.error(`枚举串口失败: ${e.message}`);
      return null;
    }
    const target = list[portIndex];
    if (!target) {
      logger.error(`串口索引 ${portIndex} 不存在（当前系统只枚举到 ${list.length} 个串口）`);
      return null;
    }
    try {
      const port = new SerialPort({
        path: target.path,
        baudRate: baud || 250000,
        dataBits: 8,
        stopBits: 2,
        parity: 'none',
      });
      port.on('error', (e) => logger.error(`串口 ${target.path} 出错: ${e.message}`));
      this.ports.set(portIndex, port);
      return port;
    } catch (e) {
      logger.error(`打开串口 ${target.path} 失败: ${e.message}`);
      return null;
    }
  }

  /**
   * 转发一帧 DMX512 数据到 USB-DMX 适配器。
   *
   * @method forwardDMXData
   * @param {WscPacket} packet packet to be forwarded
   * @public
   */
  async forwardDMXData(packet) {
    if (!(packet.transport instanceof WscTransport)) return;
    const serialInfo = packet.transport.serial;
    if (!serialInfo) return; // iface 不是 SERIAL，不归这个 forwarder 管
    const decodedPayload = WscPacket.decode(packet);
    const port = await this._getPort(serialInfo.port, serialInfo.baud);
    if (!port) return;
    const frame = buildEnttecFrame(decodedPayload.values);
    port.write(frame, (err) => {
      if (err) logger.error(`写串口失败: ${err.message}`);
    });
  }
}

forwarderInstance = new SerialDmxForwarder();
