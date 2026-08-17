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

  describe('actions.available (runtime metadata)', () => {
    it('returns the descriptors a form generator needs', async () => {
      // The typed action methods are generated at build time; this is the only
      // runtime view, and the only way to learn a parameter's enum members.
      const descriptors = [
        {
          name: 'TriagePatient',
          kind: 'action',
          description: 'Set triage category',
          parameters: {
            type: 'object',
            properties: {
              category: { type: 'string', enum: ['IMMEDIATE', 'URGENT'] },
              assessedAt: { type: 'string', format: 'date-time' },
            },
            required: ['category'],
          },
          returnType: {},
          requiredPermissions: [],
          dryRunSupported: false,
          reversible: false,
          tags: [],
        },
      ];
      const fetchMock = createFetchMock({ data: { availableTools: descriptors } });
      globalThis.fetch = fetchMock;

      const client = new Altius({ endpoint: 'http://localhost:3000/graphql', token: 't' });
      const tools = await client.actions.available();

      expect(tools).toHaveLength(1);
      const params = tools[0]!.parameters as { properties: Record<string, { enum?: string[]; format?: string }> };
      expect(params.properties['category']!.enum).toEqual(['IMMEDIATE', 'URGENT']);
      expect(params.properties['assessedAt']!.format).toBe('date-time');
    });

    it('forwards a filter', async () => {
      const fetchMock = createFetchMock({ data: { availableTools: [] } });
      globalThis.fetch = fetchMock;

      const client = new Altius({ endpoint: 'http://localhost:3000/graphql', token: 't' });
      await client.actions.available({ kind: 'action' });

      const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
      expect(body.variables.filter).toEqual({ kind: 'action' });
    });
  });

  describe('subscription close signalling', () => {
    it('tells the subscriber when the socket dies', async () => {
      // The client clears its subscriptions on close and does not reconnect, so
      // without this the caller keeps a stream that has silently stopped — a
      // live view that looks current and is not.
      const onClose = vi.fn();
      const client = new Altius({ endpoint: 'http://localhost:3000/graphql', token: 't' });

      client.patient.onAnyChange(() => {}, undefined, onClose);
      await new Promise(r => setTimeout(r, 10));
      const ws = MockWebSocket.instances[0]!;
      // The subscribe is queued until connection_ack, and the close handler is
      // registered with it.
      ws._receive(JSON.stringify({ type: 'connection_ack' }));

      ws.close();

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not call the handler after an explicit unsubscribe', async () => {
      const onClose = vi.fn();
      const client = new Altius({ endpoint: 'http://localhost:3000/graphql', token: 't' });

      const sub = client.patient.onAnyChange(() => {}, undefined, onClose);
      await new Promise(r => setTimeout(r, 10));
      const ws = MockWebSocket.instances[0]!;
      ws._receive(JSON.stringify({ type: 'connection_ack' }));
      sub.unsubscribe();

      ws.close();

      // Closing after the caller has already let go is not a lost stream.
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('subscription reconnection', () => {
    it('re-establishes a dropped subscription and announces the resume', async () => {
      // Visibility alone leaves the stream dead. Recovery has to actually
      // resubscribe, and the caller has to be told so it can RE-READ: events
      // during the gap are gone, so resuming without re-reading is the same
      // silent-staleness bug with a nicer message.
      vi.useFakeTimers();
      const onClose = vi.fn();
      const onResume = vi.fn();
      const client = new Altius({ endpoint: 'http://localhost:3000/graphql', token: 't' });

      client.patient.onAnyChange(() => {}, undefined, onClose, onResume);
      await vi.advanceTimersByTimeAsync(10);
      MockWebSocket.instances[0]!._receive(JSON.stringify({ type: 'connection_ack' }));

      MockWebSocket.instances[0]!.close();
      expect(onClose).toHaveBeenCalledTimes(1);

      // Backoff, then a fresh socket carrying the replayed subscription.
      await vi.advanceTimersByTimeAsync(1500);
      expect(MockWebSocket.instances.length).toBe(2);
      MockWebSocket.instances[1]!._receive(JSON.stringify({ type: 'connection_ack' }));

      expect(onResume).toHaveBeenCalledTimes(1);
      // The subscribe was actually re-sent, not just the socket reopened.
      expect(MockWebSocket.instances[1]!.sent.some(m => m.includes('"subscribe"'))).toBe(true);
      vi.useRealTimers();
    });

    it('sends one subscribe per subscription even after repeated failed retries', async () => {
      // wsReadyQueue is flushed only on connection_ack. If a retry socket dies
      // before acking, its queued replay is still sitting there when the next
      // retry queues another — so the eventual ack sends the same subscribe
      // several times under one id, which is a protocol violation the server
      // is entitled to close the connection over.
      vi.useFakeTimers();
      const client = new Altius({ endpoint: 'http://localhost:3000/graphql', token: 't' });

      client.patient.onAnyChange(() => {});
      await vi.advanceTimersByTimeAsync(10);
      MockWebSocket.instances[0]!._receive(JSON.stringify({ type: 'connection_ack' }));
      MockWebSocket.instances[0]!.close();

      // First retry opens a socket that dies before acking.
      await vi.advanceTimersByTimeAsync(1500);
      MockWebSocket.instances[1]!.close();

      // Second retry finally succeeds.
      await vi.advanceTimersByTimeAsync(3000);
      const last = MockWebSocket.instances[MockWebSocket.instances.length - 1]!;
      last._receive(JSON.stringify({ type: 'connection_ack' }));

      const subscribes = last.sent.filter(m => m.includes('"subscribe"'));
      expect(subscribes).toHaveLength(1);
      vi.useRealTimers();
    });

    it('does not double-subscribe when a new stream is opened while disconnected', async () => {
      // subscribe() queues its own sendSubscribe AND records it as a
      // resubscriber. A retry timer already pending then queues every
      // resubscriber on top, so the newcomer is in the queue twice and the ack
      // sends its subscribe twice under one id — the same protocol violation
      // 4ba0250 fixed on the retry-after-retry path, reached another way.
      vi.useFakeTimers();
      const client = new Altius({ endpoint: 'http://localhost:3000/graphql', token: 't' });

      client.patient.onAnyChange(() => {});
      await vi.advanceTimersByTimeAsync(10);
      MockWebSocket.instances[0]!._receive(JSON.stringify({ type: 'connection_ack' }));
      MockWebSocket.instances[0]!.close();

      // A second stream opens during the backoff window, before any retry.
      client.ward.onAnyChange(() => {});
      await vi.advanceTimersByTimeAsync(2000);

      const last = MockWebSocket.instances[MockWebSocket.instances.length - 1]!;
      last._receive(JSON.stringify({ type: 'connection_ack' }));

      const subscribes = last.sent.filter(m => m.includes('"subscribe"'));
      // One per subscription, not three.
      expect(subscribes).toHaveLength(2);
      vi.useRealTimers();
    });

    it('does not resurrect a subscription cancelled mid-reconnect', async () => {
      // The retry snapshots the replay list, opens a socket, and only flushes on
      // ack. Unsubscribing inside that window cannot send `complete` (the socket
      // is not OPEN yet), so nothing tells the server to stop — and if the
      // snapshot is still flushed, the subscribe goes out for a stream the
      // caller has let go, re-registering its callback. The caller then receives
      // events after unsubscribing, which for a React table means setState on an
      // unmounted component.
      vi.useFakeTimers();
      const received = vi.fn();
      const client = new Altius({ endpoint: 'http://localhost:3000/graphql', token: 't' });

      const sub = client.patient.onAnyChange(received);
      await vi.advanceTimersByTimeAsync(10);
      MockWebSocket.instances[0]!._receive(JSON.stringify({ type: 'connection_ack' }));
      MockWebSocket.instances[0]!.close();

      // Retry fires and opens a socket, still awaiting ack.
      await vi.advanceTimersByTimeAsync(1500);
      const retry = MockWebSocket.instances[1]!;

      sub.unsubscribe();
      retry._receive(JSON.stringify({ type: 'connection_ack' }));

      expect(retry.sent.filter(m => m.includes('"subscribe"'))).toHaveLength(0);
      vi.useRealTimers();
    });

    it('reports a server-terminated stream and stops replaying it', async () => {
      // The server ends a subscription with `error` or `complete` — auth
      // expiry, revoked permission, a filter it will not accept. Only
      // wsSubscriptions was cleaned, so the caller was never told (a dead
      // stream looking alive, the exact failure this feature exists to end)
      // and the next reconnect re-sent the subscribe, resurrecting a stream
      // the server had deliberately refused.
      vi.useFakeTimers();
      const onClose = vi.fn();
      const client = new Altius({ endpoint: 'http://localhost:3000/graphql', token: 't' });

      client.patient.onAnyChange(() => {}, undefined, onClose);
      await vi.advanceTimersByTimeAsync(10);
      const ws = MockWebSocket.instances[0]!;
      ws._receive(JSON.stringify({ type: 'connection_ack' }));
      const subId = JSON.parse(ws.sent.find(m => m.includes('"subscribe"'))!).id as string;

      ws._receive(JSON.stringify({ type: 'error', id: subId, payload: [{ message: 'forbidden' }] }));

      expect(onClose).toHaveBeenCalledTimes(1);

      // And it must not come back: with nothing left to replay, a subsequent
      // close should not even open a socket.
      ws.close();
      await vi.advanceTimersByTimeAsync(5000);
      expect(MockWebSocket.instances).toHaveLength(1);
      vi.useRealTimers();
    });

    it('ignores a close from a socket that has already been superseded', async () => {
      // ensureWebSocket only reuses a socket in OPEN or CONNECTING, so one in
      // CLOSING is replaced. The old socket's close listener then fires and
      // unconditionally sets wsSocket = null / wsReady = false / clears the
      // subscriptions — clobbering the bookkeeping of the socket that replaced
      // it. The client believes it has no connection while holding a live one,
      // and opens yet another on the next subscribe.
      vi.useFakeTimers();
      const client = new Altius({ endpoint: 'http://localhost:3000/graphql', token: 't' });

      client.patient.onAnyChange(() => {});
      await vi.advanceTimersByTimeAsync(10);
      const a = MockWebSocket.instances[0]!;
      a._receive(JSON.stringify({ type: 'connection_ack' }));

      // A is CLOSING, so the next subscribe must open B.
      a.readyState = MockWebSocket.CLOSING;
      client.ward.onAnyChange(() => {});
      await vi.advanceTimersByTimeAsync(10);
      expect(MockWebSocket.instances).toHaveLength(2);

      // A's close arrives late. It must not touch B.
      a.close();
      client.bed.onAnyChange(() => {});
      await vi.advanceTimersByTimeAsync(10);

      expect(MockWebSocket.instances).toHaveLength(2);
      vi.useRealTimers();
    });


    it('reports an unauthenticable socket once and does not retry it', async () => {
      // AuthSession throws once a session cannot be renewed. Retrying re-resolves
      // the same failing token forever, so this must be reported and stopped —
      // not treated as a dropped transport.
      vi.useFakeTimers();
      const onClose = vi.fn();
      const client = new Altius({
        endpoint: 'http://localhost:3000/graphql',
        token: () => Promise.reject(new Error('session expired')),
      });

      client.patient.onAnyChange(() => {}, undefined, onClose);
      await vi.advanceTimersByTimeAsync(50);

      expect(onClose).toHaveBeenCalledTimes(1);

      // No retry storm: the backoff window passes without another socket.
      await vi.advanceTimersByTimeAsync(10_000);
      expect(MockWebSocket.instances).toHaveLength(1);
      vi.useRealTimers();
    });

    it('ignores messages from a socket that has been superseded', async () => {
      // a9822f8 guarded the close listener but not the message listener. A late
      // connection_ack from a replaced socket sets wsReady and flushes the
      // queue, so subscribes go out on the CURRENT socket before it has
      // completed its own handshake — which graphql-transport-ws treats as a
      // protocol violation and the server may close over.
      vi.useFakeTimers();
      const client = new Altius({ endpoint: 'http://localhost:3000/graphql', token: 't' });

      client.patient.onAnyChange(() => {});
      await vi.advanceTimersByTimeAsync(10);
      const a = MockWebSocket.instances[0]!;

      // A is superseded before it ever acks.
      a.readyState = MockWebSocket.CLOSING;
      client.ward.onAnyChange(() => {});
      await vi.advanceTimersByTimeAsync(10);
      const b = MockWebSocket.instances[1]!;

      // A's ack arrives late. It must not make B look ready.
      a._receive(JSON.stringify({ type: 'connection_ack' }));

      expect(b.sent.filter(m => m.includes('"subscribe"'))).toHaveLength(0);
      vi.useRealTimers();
    });


    it('does not announce a resume to a subscription that never dropped', async () => {
      // wsReconnectAttempt is only reset inside the ack handler. If a retry is
      // scheduled and then every subscription is dropped, the timer returns
      // early and the counter stays raised — so the NEXT fresh subscribe acks
      // with attempt > 0 and is told it "resumed". ObjectTable answers a resume
      // by re-reading, so a brand-new table immediately refetches the page it
      // has just loaded.
      vi.useFakeTimers();
      const onResume = vi.fn();
      const client = new Altius({ endpoint: 'http://localhost:3000/graphql', token: 't' });

      const first = client.patient.onAnyChange(() => {});
      await vi.advanceTimersByTimeAsync(10);
      MockWebSocket.instances[0]!._receive(JSON.stringify({ type: 'connection_ack' }));

      // Drop happens, then the caller lets go before the retry fires.
      MockWebSocket.instances[0]!.close();
      first.unsubscribe();
      await vi.advanceTimersByTimeAsync(3000);

      // A completely new subscription, on a connection that never dropped.
      client.ward.onAnyChange(() => {}, undefined, undefined, onResume);
      await vi.advanceTimersByTimeAsync(10);
      const fresh = MockWebSocket.instances[MockWebSocket.instances.length - 1]!;
      fresh._receive(JSON.stringify({ type: 'connection_ack' }));

      expect(onResume).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('does not reconnect after the caller unsubscribes', async () => {
      // Letting go of a stream is not losing one; reconnecting here would
      // resurrect a subscription the caller has already abandoned.
      vi.useFakeTimers();
      const client = new Altius({ endpoint: 'http://localhost:3000/graphql', token: 't' });

      const sub = client.patient.onAnyChange(() => {});
      await vi.advanceTimersByTimeAsync(10);
      MockWebSocket.instances[0]!._receive(JSON.stringify({ type: 'connection_ack' }));
      sub.unsubscribe();

      MockWebSocket.instances[0]!.close();
      await vi.advanceTimersByTimeAsync(5000);

      expect(MockWebSocket.instances.length).toBe(1);
      vi.useRealTimers();
    });
  });

  describe('token provider (refresh seam)', () => {
    it('consults the provider on every request instead of freezing it', async () => {
      // Access tokens expire. A client that captured the string at construction
      // is dead after the first expiry, so the provider must be re-read.
      let current = 'first';
      const fetchMock = createFetchMock({ data: { patient: null } });
      globalThis.fetch = fetchMock;

      const client = new Altius({
        endpoint: 'http://localhost:3000/graphql',
        token: () => current,
      });

      await client.patient.get('p-1');
      const firstHeaders = (fetchMock.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
      expect(firstHeaders['Authorization']).toBe('Bearer first');

      current = 'refreshed';
      await client.patient.get('p-1');
      const secondHeaders = (fetchMock.mock.calls[1]![1] as RequestInit).headers as Record<string, string>;
      expect(secondHeaders['Authorization']).toBe('Bearer refreshed');
    });

    it('accepts an async provider and a plain string alike', async () => {
      const fetchMock = createFetchMock({ data: { patient: null } });
      globalThis.fetch = fetchMock;

      const asyncClient = new Altius({
        endpoint: 'http://localhost:3000/graphql',
        token: async () => 'from-promise',
      });
      await asyncClient.patient.get('p-1');
      const h = (fetchMock.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
      expect(h['Authorization']).toBe('Bearer from-promise');
    });

    it('resolves the token when the socket opens, not when the client is built', async () => {
      // A reconnect after a refresh must present the new token; capturing it at
      // construction would re-authenticate with an already-expired credential.
      let current = 'stale';
      const client = new Altius({
        endpoint: 'http://localhost:3000/graphql',
        token: () => current,
      });
      current = 'fresh';

      client.patient.onChange('p-1', () => {});
      await new Promise(resolve => setTimeout(resolve, 10));

      const ws = MockWebSocket.instances[0]!;
      const initMsg = JSON.parse(ws.sent[0]!);
      expect(initMsg.payload.Authorization).toBe('Bearer fresh');
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
