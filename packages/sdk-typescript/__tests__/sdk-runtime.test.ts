/**
 * Runtime tests for the generated TypeScript SDK.
 *
 * The SDK is auto-generated from the NHS Acute domain pack by `odl generate sdk`.
 * These tests verify that the generated code is functional at runtime — not
 * just that it type-checks — by mocking `fetch` and `WebSocket` and asserting
 * the SDK sends the expected GraphQL operations.
 *
 * This closes blocker S1: the SDK package previously had `"test": "echo \"no
 * tests yet\""` and no test files, so a regression in the generator could
 * ship a broken SDK without any signal.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Altius } from '../src/index.js';
import type {
  Patient,
  PatientConnection,
  ActionResult,
  AdmitPatientInput,
} from '../src/index.js';

// ─── Mocks ───

/**
 * Minimal fetch mock. Captures the request so tests can assert on it,
 * and returns a canned GraphQL response.
 */
function createFetchMock(response: { data?: unknown; errors?: Array<{ message: string }> }) {
  return vi.fn(async (_url: string, init: RequestInit) => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => response,
  })) as unknown as typeof fetch;
}

/**
 * Minimal WebSocket mock. Records sent messages and allows tests to
 * simulate server-to-client messages.
 */
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  private listeners: Map<string, ((event: { data?: string }) => void)[]> = new Map();

  // on* properties (some code paths use these)
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  // The subprotocol argument was dropped here, which is why a client that
  // never sent one looked correct to this suite for as long as it existed.
  constructor(public url: string, public protocol?: string) {
    MockWebSocket.instances.push(this);
    // Simulate async connection open
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
      this.dispatchEvent('open', {});
    }, 0);
  }

  addEventListener(type: string, listener: (event: { data?: string }) => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type)!.push(listener);
  }

  removeEventListener(type: string, listener: (event: { data?: string }) => void): void {
    const arr = this.listeners.get(type);
    if (arr) {
      const idx = arr.indexOf(listener);
      if (idx >= 0) arr.splice(idx, 1);
    }
  }

  private dispatchEvent(type: string, event: { data?: string }): void {
    const arr = this.listeners.get(type);
    if (arr) for (const fn of arr) fn(event);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
    this.dispatchEvent('close', {});
  }

  /** Test helper: simulate a server-to-client message. */
  _receive(data: string): void {
    const event = { data };
    this.onmessage?.(event as { data: string });
    this.dispatchEvent('message', event);
  }
}

// ─── Setup / teardown ───

const originalFetch = globalThis.fetch;
const OriginalWebSocket = globalThis.WebSocket;

beforeEach(() => {
  MockWebSocket.instances = [];
  globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.WebSocket = OriginalWebSocket;
  vi.restoreAllMocks();
});

// ════════════════════════════════════════════════════════════════════

describe('Generated SDK runtime', () => {
  describe('Altius client construction', () => {
    it('constructs with endpoint and token', () => {
      const client = new Altius({ endpoint: 'http://localhost:3000/graphql', token: 'test-token' });
      expect(client).toBeInstanceOf(Altius);
    });

    it('constructs without a token (anonymous)', () => {
      const client = new Altius({ endpoint: 'http://localhost:3000/graphql', token: '' });
      expect(client).toBeInstanceOf(Altius);
    });
  });

  describe('patient.get', () => {
    it('sends a GraphQL query for a single patient by ID', async () => {
      const mockPatient: Patient = {
        id: 'p-1',
        nhsNumber: '1234567890',
        name: 'Jane Doe',
        family: 'Doe',
        given: 'Jane',
        dateOfBirth: '1990-01-01',
        status: 'ACTIVE',
        triageCategory: null,
        presentingComplaint: null,
        createdAt: null,
        createdBy: null,
        updatedAt: null,
        updatedBy: null,
        validFrom: null,
        validTo: null,
        _redactedFields: null,
        _consentRestricted: null,
      };
      const fetchMock = createFetchMock({ data: { patient: mockPatient } });
      globalThis.fetch = fetchMock;

      const client = new Altius({ endpoint: 'http://localhost:3000/graphql', token: 'tok' });
      const result = await client.patient.get('p-1') as unknown as { patient: Patient };

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, init] = fetchMock.mock.calls[0]!;
      const body = JSON.parse(init!.body as string);
      expect(body.query).toContain('patient(id:');
      expect(body.query).toContain('id');
      // Authorization header must carry the token
      const headers = init!.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer tok');
      // The SDK returns the GraphQL data envelope; the caller extracts the field
      expect(result.patient).not.toBeNull();
      expect(result.patient.id).toBe('p-1');
    });

    it('returns null data when the server returns null', async () => {
      const fetchMock = createFetchMock({ data: { patient: null } });
      globalThis.fetch = fetchMock;

      const client = new Altius({ endpoint: 'http://localhost:3000/graphql', token: 'tok' });
      const result = await client.patient.get('nonexistent') as unknown as { patient: Patient | null };
      expect(result.patient).toBeNull();
    });
  });

  describe('patient.list', () => {
    it('sends a GraphQL query with filter and pagination variables', async () => {
      const mockConnection: PatientConnection = {
        edges: [],
        pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null },
        totalCount: 0,
      };
      const fetchMock = createFetchMock({ data: { patients: mockConnection } });
      globalThis.fetch = fetchMock;

      const client = new Altius({ endpoint: 'http://localhost:3000/graphql', token: 'tok' });
      await client.patient.list(
        { status: { eq: 'ACTIVE' } },
        { first: 10, after: 'Y3Vyc29yOjA=' },
      );

      const [, init] = fetchMock.mock.calls[0]!;
      const body = JSON.parse(init!.body as string);
      expect(body.query).toContain('patients(filter:');
      expect(body.variables.filter).toEqual({ status: { eq: 'ACTIVE' } });
      expect(body.variables.first).toBe(10);
      expect(body.variables.after).toBe('Y3Vyc29yOjA=');
    });
  });

  describe('actions.admitPatient', () => {
    it('sends a GraphQL mutation with the action input', async () => {
      const mockResult: ActionResult = {
        success: true,
        actionId: 'act-1',
        errors: null,
        affectedObjects: [{ typeName: 'Patient', id: 'p-1', changeType: 'CREATED' }],
      };
      const fetchMock = createFetchMock({ data: { admitPatient: mockResult } });
      globalThis.fetch = fetchMock;

      const client = new Altius({ endpoint: 'http://localhost:3000/graphql', token: 'tok' });
      const input: AdmitPatientInput = {
        patient: 'p-1',
        ward: 'w-1',
        consultant: 'c-1',
      };
      const result = await client.actions.admitPatient(input);

      const [, init] = fetchMock.mock.calls[0]!;
      const body = JSON.parse(init!.body as string);
      expect(body.query).toContain('mutation');
      expect(body.query).toContain('admitPatient');
      expect(body.variables.input).toEqual(input);
      expect(result.success).toBe(true);
      expect(result.actionId).toBe('act-1');
    });
  });

  describe('error handling', () => {
    it('throws on a non-OK HTTP response', async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({}),
      })) as unknown as typeof fetch;

      const client = new Altius({ endpoint: 'http://localhost:3000/graphql', token: 'bad' });
      await expect(client.patient.get('p-1')).rejects.toThrow(/401/);
    });

    it('throws on GraphQL errors in the response', async () => {
      globalThis.fetch = createFetchMock({
        errors: [{ message: 'Field foo does not exist' }],
      });

      const client = new Altius({ endpoint: 'http://localhost:3000/graphql', token: 'tok' });
      await expect(client.patient.get('p-1')).rejects.toThrow(/Field foo does not exist/);
    });
  });

  describe('patient.onChange (subscription)', () => {
    it('opens a WebSocket and sends connection_init + subscribe', async () => {
      const client = new Altius({
        endpoint: 'http://localhost:3000/graphql',
        token: 'tok',
      });

      let receivedEvent: unknown = null;
      const sub = client.patient.onChange('p-1', (event) => {
        receivedEvent = event;
      });

      // Wait for the WebSocket to connect (setTimeout(0) in the mock)
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(MockWebSocket.instances).toHaveLength(1);
      const ws = MockWebSocket.instances[0]!;
      // URL should be ws:// or wss:// version of the endpoint
      expect(ws.url).toMatch(/^wss?:\/\//);
      // Without the subprotocol graphql-ws closes with 4406 before the
      // handshake completes, so no subscription ever starts.
      expect(ws.protocol).toBe('graphql-transport-ws');

      // connection_init must be sent with the auth token
      const initMsg = JSON.parse(ws.sent[0]!);
      expect(initMsg.type).toBe('connection_init');
      expect(initMsg.payload.Authorization).toBe('Bearer tok');

      // The SDK queues the subscribe until connection_ack is received.
      // Send connection_ack to flush the queue.
      ws._receive(JSON.stringify({ type: 'connection_ack' }));

      // Now the subscribe message should have been sent
      const subMsg = JSON.parse(ws.sent[1]!);
      expect(subMsg.type).toBe('subscribe');
      expect(subMsg.payload.query).toContain('patientChanged');

      // `causedBy` is a composite (ActionReference). Selecting it bare is a
      // GraphQL validation error the server reports as an `error` message,
      // which this client drops — the subscription then looks alive and
      // delivers nothing. The document must subselect it.
      expect(subMsg.payload.query).toMatch(/causedBy\s*\{[^}]*actionType/);
      // A bare `object { id }` would make every live view property-blind, even
      // though the server hydrates the full object per subscriber.
      expect(subMsg.payload.query).toMatch(/object\s*\{[^}]*nhsNumber/);

      // graphql-ws delivers an ExecutionResult envelope on `next`. The callback
      // is typed as receiving ChangeEvent<T>, so the client must unwrap it —
      // handing over the envelope would satisfy no declared type.
      const changeEvent = {
        changeType: 'UPDATED',
        object: { id: 'p-1', name: 'Jane' },
        previousValues: null,
        causedBy: null,
        timestamp: '2026-01-01T00:00:00Z',
      };
      ws._receive(
        JSON.stringify({ type: 'next', id: subMsg.id, payload: { data: { patientChanged: changeEvent } } }),
      );
      expect(receivedEvent).toEqual(changeEvent);

      // Unsubscribe sends a complete message
      sub.unsubscribe();
      const completeMsg = JSON.parse(ws.sent[ws.sent.length - 1]!);
      expect(completeMsg.type).toBe('complete');
    });
  });
});
