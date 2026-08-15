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
  /**
   * Owning tenant, as a CloudEvents extension attribute (hence the lowercase
   * name — the spec restricts extension names to lowercase alphanumerics).
   *
   * Required, not optional, and deliberately so: the bus is one topic for the
   * whole deployment, so an event that loses its tenant on the way out cannot
   * be routed safely at the other end. Making it required means a publisher
   * that forgets it is a compile error rather than an event that consumers
   * must then decide what to do with.
   */
  tenantid: string;
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
