import { WscError, WscPacket } from '@asls/wsc-sdk';
import si from 'systeminformation';
import os from 'os';
import AbstractWscGateway from './abstract.gateway';

const SUPPORTED_PACKET_TYPES = [
  WscPacket.Type.STATE_QUERY,
];

export default class WscStateGateway extends AbstractWscGateway {
  constructor() {
    super(SUPPORTED_PACKET_TYPES);
  }

  static _cache = null;

  static _lastFetch = 0;

  static async gatherSystemInformation() {
    const now = Date.now();

    if (this._cache && now - this._lastFetch < 1000) {
      return this._cache;
    }

    const [battery, load, mem] = await Promise.all([
      si.battery(),
      si.currentLoad(),
      si.mem(),
    ]);

    this._cache = {
      uptime: Math.floor(process.uptime()),
      system: {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        cpuLoad: Math.round(load.currentLoad * 10) / 10,
        memory: {
          total: mem.total,
          used: mem.used,
          free: mem.free,
        },
        battery: battery.hasBattery
          ? {
            percent: battery.percent,
            isCharging: battery.isCharging,
            timeRemaining: battery.timeRemaining,
          }
          : null,
      },
    };

    this._lastFetch = now;
    return this._cache;
  }

  /**
   * process WSC State Packet
   *
   * @param {WscPacket} packet
   * @param {import('@asls/wsc-server').WscPeer} peer
   */
  processPacket(packet, peer) {
    this.validatePacket(packet);

    switch (packet.type) {
      case WscPacket.Type.STATE_QUERY: this.processStateQuery(packet, peer); break;
      default: break;
    }
  }

  /**
   * process WSC State Query Packet
   *
   * @param {WscPacket} packet
   * @param {import('@asls/wsc-server').WscPeer} peer
   */
  async processStateQuery(packet, peer) {
    const payload = WscPacket.decode(packet);

    switch (payload.queryType) {
      case WscPacket.StateQuery.KEEPALIVE: {
        const sysInfo = await WscStateGateway.gatherSystemInformation();
        const answer = WscPacket.create(
          WscPacket.Type.STATE_ANSWER,
          {
            queryId: payload.queryId,
            status: WscPacket.Status.SUCCESS,
            data: sysInfo,
          },
        );

        peer.sendStateAnswerMessage(answer.serialize());
        break;
      }
      default:
        throw new WscError(
          WscError.Type.GATEWAY,
          WscStateGateway.WscGatewayError.UNSUPPORTED_PAYLOAD,
          `Unsupported query type 0x${payload.queryType}`,
        );
    }
  }
}
