/**
 * Adapter from pino to the `SideEffectLogger` shape the actions package needs.
 *
 * The two disagree on argument order — pino is `(data, msg)`, SideEffectLogger
 * is `(msg, data)` — so passing the pino instance directly would log the
 * message as the structured payload and the payload as the message. Getting
 * that backwards is silent: the lines still appear, just unreadable and
 * unsearchable by the fields an operator would filter on.
 */

import type { SideEffectLogger } from '@altius/actions';
import type { logger as PinoLogger } from './logger.js';

export function pinoSideEffectLogger(pino: typeof PinoLogger): SideEffectLogger {
  return {
    error: (msg, data) => pino.error(data ?? {}, msg),
    warn: (msg, data) => pino.warn(data ?? {}, msg),
    info: (msg, data) => pino.info(data ?? {}, msg),
  };
}
