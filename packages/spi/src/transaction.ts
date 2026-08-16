/**
 * Transaction interface (Section 3.4).
 *
 * The SPI requires ACID transactions for all write operations.
 * A single Action execution maps to a single transaction -- all effects
 * either commit together or roll back.
 */

import type { OntologyObject, OntologyLink } from './ontology.js';

export interface Transaction {
  createObject(type: string, properties: Record<string, unknown>): Promise<OntologyObject>;
  updateObject(type: string, id: string, properties: Record<string, unknown>, expectedVersion?: number): Promise<OntologyObject>;
  deleteObject(type: string, id: string, mode: 'soft' | 'hard'): Promise<void>;
  restoreObject(type: string, id: string): Promise<OntologyObject>;
  createLink(type: string, fromId: string, toId: string, properties?: Record<string, unknown>): Promise<OntologyLink>;
  updateLink(type: string, linkId: string, properties: Record<string, unknown>, expectedVersion?: number): Promise<OntologyLink>;
  deleteLink(type: string, linkId: string): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}
