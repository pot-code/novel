import os from 'os';
import path from 'path';
import pino, { LevelWithSilent } from 'pino';

import { timestamp } from './common';

const dst = path.join(os.tmpdir(), `novel-diagnose-${timestamp()}.log`);

export const log = pino(
  {
    level: 'error',
    base: {
      pid: process.pid,
    },
    // prettyPrint: process.env.NODE_ENV !== 'production',
    messageKey: 'message',
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    formatters: {
      level: (label) => ({ 'log.level': label }),
    },
  },
  pino.destination(dst),
);

export function setLevel(level: LevelWithSilent) {
  log.level = level;
}

export function getLogDst(): string {
  return dst;
}
