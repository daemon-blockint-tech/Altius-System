/**
 * CloudEvents 1.0 interface (Section 4.2).
 */

import type { DateTime } from './scalars.js';

/** CloudEvents 1.0 compliant event envelope. */
export interface CloudEvent<T = unknown> {
  specversion: '1.0';
  id: string;
  source: string;
  type: CloudEventType;
  subject?: string;
  time: DateTime;
  datacontenttype?: string;
  data?: T;
}

/** Known Altius event types emitted by the platform. */
export type CloudEventType =
  | 'altius.object.created'
  | 'altius.object.updated'
  | 'altius.object.deleted'
  | 'altius.link.created'
  | 'altius.link.updated'
  | 'altius.link.deleted'
  | 'altius.action.submitted'
  | 'altius.action.completed'
  | 'altius.action.failed'
  | 'altius.schema.updated'
  | (string & {}); // Allow extension event types
