/**
 * WSC Error
 * Typed error class for WSC protocol faults.
 */

export class WscError extends Error {
  /**
   * Error type discriminants. Kept close to the class that uses them.
   * @enum {number}
   */
  static Type = {
    SIGNALING: 0x1000,
    WEBRTC: 0x2000,
    PACKET: 0x3000,
    GATEWAY: 0x4000,
  };

  /**
   * @param {number} type  - One of WscError.Type
   * @param {number} subType  - One of WscError.Type
   * @param {string} message
   * @param {ErrorOptions} [options]
   */
  constructor(type, subType, message, options) {
    super(message, options);
    this.name = 'WscError';
    this.type = type;
    this.subType = subType;
  }

  get errCode() {
    return this.type | this.subType;
  }
}
