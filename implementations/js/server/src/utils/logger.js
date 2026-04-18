/* eslint-disable no-console */
import dotenv from 'dotenv';
import path from 'path';
import util from 'util';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

let lastLoggedTag = null;

class Logger {
  constructor(tag = '') {
    this.levels = ['debug', 'info', 'warn', 'error'];
    this.level = (process.env.LOG_LEVEL || 'info').toLowerCase();
    this.tag = tag;

    // Static parts color (timestamp, tag, level) - always same
    this.staticColor = '\x1b[35m'; // magenta
    this.reset = '\x1b[0m';

    // Message colors per verbosity
    this.messageColors = {
      debug: '\x1b[36m', // cyan
      info: '\x1b[32m', // green
      warn: '\x1b[33m', // yellow
      error: '\x1b[31m', // red
    };
  }

  shouldLog(messageLevel) {
    const messageIndex = this.levels.indexOf(messageLevel);
    const currentIndex = this.levels.indexOf(this.level);
    return messageIndex >= currentIndex;
  }

  formatMessage(level, args) {
    const lr = lastLoggedTag !== this.tag ? '\n' : '';
    const timestamp = new Date().toISOString();
    const staticPart = `${lr}${this.staticColor}[${timestamp}]${this.tag ? ` [${this.tag}]` : ''} [${level.toUpperCase()}]:${this.reset}`;

    lastLoggedTag = this.tag;

    // Convert each argument to string
    const messageParts = args.map((arg) => {
      if (typeof arg === 'object') {
        return util.inspect(arg, { colors: true, depth: null, compact: false });
      }
      return `${this.messageColors[level] || this.reset}${arg}${this.reset}`;
    });

    return `${staticPart} ${messageParts.join(' ')}`;
  }

  debug(...args) {
    if (this.shouldLog('debug')) console.debug(this.formatMessage('debug', args));
  }

  info(...args) {
    if (this.shouldLog('info')) console.info(this.formatMessage('info', args));
  }

  warn(...args) {
    if (this.shouldLog('warn')) console.warn(this.formatMessage('warn', args));
  }

  error(...args) {
    if (this.shouldLog('error')) console.error(this.formatMessage('error', args));
  }

  setLevel(level) {
    if (this.levels.includes(level)) this.level = level;
    else throw new Error(`Invalid log level: ${level}`);
  }

  setTag(tag) {
    this.tag = tag;
  }
}

export default Logger;
