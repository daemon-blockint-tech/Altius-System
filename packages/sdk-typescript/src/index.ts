/**
 * Auto-generated TypeScript SDK from ODL schema.
 * Do not edit manually — regenerate from the ODL source.
 */

/**
 * Sentinel value indicating a field has been redacted due to
 * access control or consent restrictions.
 */
export const REDACTED = Symbol.for('altius.redacted');

/** Redacted field sentinel type. */
export type Redacted = typeof REDACTED;

// ─── Shared types ───

export interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
}

export interface Connection<T> {
  edges: Edge<T>[];
  pageInfo: PageInfo;
  totalCount: number;
}

export interface Edge<T> {
  node: T;
  cursor: string;
}

export interface ActionError {
  code: string;
  message: string;
  field: string | null;
}

export interface AffectedObject {
  typeName: string;
  id: string;
  changeType: ChangeType;
}

export type ChangeType = 'CREATED' | 'UPDATED' | 'DELETED';

export interface ChangeEvent<T> {
  changeType: ChangeType;
  object: T;
  // Field-level diff ({ field: { old, new } }), not a full object.
  previousValues: Record<string, { old: unknown; new: unknown }> | null;
  causedBy: { actionType: string | null; actionId: string | null } | null;
  timestamp: string;
}

export interface ActionResult {
  success: boolean;
  actionId: string;
  errors: ActionError[] | null;
  affectedObjects: AffectedObject[] | null;
}

export interface PaginationArgs {
  first?: number;
  after?: string;
  last?: number;
  before?: string;
}

export interface Subscription {
  unsubscribe(): void;
}

export interface AltiusConfig {
  endpoint: string;
  token: string;
}

// ─── Enums ───

export type PatientStatus =
  | 'ACTIVE'
  | 'DISCHARGED'
  | 'DECEASED'
  | 'TRANSFERRED';

export type TriageCategory =
  | 'P1_IMMEDIATE'
  | 'P2_URGENT'
  | 'P3_DELAYED'
  | 'P4_EXPECTANT';

export type DischargeDestination =
  | 'HOME'
  | 'CARE_HOME'
  | 'VIRTUAL_WARD'
  | 'TRANSFER'
  | 'DECEASED';

export type BedType =
  | 'STANDARD'
  | 'ICU'
  | 'HDU'
  | 'ISOLATION'
  | 'TROLLEY';

export type BedStatus =
  | 'AVAILABLE'
  | 'OCCUPIED'
  | 'CLEANING'
  | 'OUT_OF_SERVICE';

export type CareRole =
  | 'PRIMARY'
  | 'SECONDARY'
  | 'ON_CALL';

export type StaffRole =
  | 'NURSE'
  | 'PHYSICIAN'
  | 'ALLIED_HEALTH_PROFESSIONAL'
  | 'HEALTHCARE_ASSISTANT'
  | 'ADMINISTRATIVE'
  | 'PORTER';

// ─── Object types ───

export interface Bed {
  id: string;
  number: string | null;
  type: BedType | null;
  status: BedStatus | null;
  ward: string | null;
  patient: string | null;
  _redactedFields: string[] | null;
  _consentRestricted: boolean | null;
}

export type BedConnection = Connection<Bed>;

export interface BedFilter {
  id?: unknown;
  number?: unknown;
  type?: unknown;
  status?: unknown;
  AND?: BedFilter[];
  OR?: BedFilter[];
  NOT?: BedFilter;
}

export interface Consultant {
  id: string;
  gmcNumber: string | null;
  name: string | null;
  specialty: string | null;
  patients: (string)[];
  _redactedFields: string[] | null;
  _consentRestricted: boolean | null;
}

export type ConsultantConnection = Connection<Consultant>;

export interface ConsultantFilter {
  id?: unknown;
  gmcNumber?: unknown;
  name?: unknown;
  specialty?: unknown;
  AND?: ConsultantFilter[];
  OR?: ConsultantFilter[];
  NOT?: ConsultantFilter;
}

export interface DischargeRecord {
  id: string;
  patient: Patient | null;
  ward: Ward | null;
  destination: DischargeDestination | null;
  dischargeDate: string | null;
  notes: string | null;
  _redactedFields: string[] | null;
  _consentRestricted: boolean | null;
}

export type DischargeRecordConnection = Connection<DischargeRecord>;

export interface DischargeRecordFilter {
  id?: unknown;
  destination?: unknown;
  dischargeDate?: unknown;
  notes?: unknown;
  AND?: DischargeRecordFilter[];
  OR?: DischargeRecordFilter[];
  NOT?: DischargeRecordFilter;
}

export interface Patient {
  id: string;
  nhsNumber: string | null;
  name: string | Redacted | null;
  family: string | Redacted | null;
  given: string | Redacted | null;
  dateOfBirth: string | Redacted | null;
  status: PatientStatus | null;
  triageCategory: TriageCategory | null;
  presentingComplaint: string | null;
  createdAt: string | null;
  createdBy: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  validFrom: string | null;
  validTo: string | null;
  currentWard: string | null;
  currentBed: string | null;
  admissions: (string)[];
  consultant: string | null;
  _redactedFields: string[] | null;
  _consentRestricted: boolean | null;
}

export type PatientConnection = Connection<Patient>;

export interface PatientFilter {
  id?: unknown;
  nhsNumber?: unknown;
  name?: unknown;
  family?: unknown;
  given?: unknown;
  dateOfBirth?: unknown;
  status?: unknown;
  triageCategory?: unknown;
  presentingComplaint?: unknown;
  createdAt?: unknown;
  createdBy?: unknown;
  updatedAt?: unknown;
  updatedBy?: unknown;
  validFrom?: unknown;
  validTo?: unknown;
  AND?: PatientFilter[];
  OR?: PatientFilter[];
  NOT?: PatientFilter;
}

export interface Staff {
  id: string;
  staffId: string | null;
  name: string | null;
  role: StaffRole | null;
  specialty: string | null;
  _redactedFields: string[] | null;
  _consentRestricted: boolean | null;
}

export type StaffConnection = Connection<Staff>;

export interface StaffFilter {
  id?: unknown;
  staffId?: unknown;
  name?: unknown;
  role?: unknown;
  specialty?: unknown;
  AND?: StaffFilter[];
  OR?: StaffFilter[];
  NOT?: StaffFilter;
}

export interface Transfer {
  id: string;
  patient: Patient | null;
  fromWard: Ward | null;
  toWard: Ward | null;
  transferDate: string | null;
  reason: string | null;
  _redactedFields: string[] | null;
  _consentRestricted: boolean | null;
}

export type TransferConnection = Connection<Transfer>;

export interface TransferFilter {
  id?: unknown;
  transferDate?: unknown;
  reason?: unknown;
  AND?: TransferFilter[];
  OR?: TransferFilter[];
  NOT?: TransferFilter;
}

export interface Ward {
  id: string;
  name: string | null;
  specialty: string | null;
  capacity: number | null;
  currentOccupancy: number | null;
  location: { lat: number; lng: number } | null;
  address: string | null;
  patients: (string)[];
  beds: (string)[];
  _redactedFields: string[] | null;
  _consentRestricted: boolean | null;
}

export type WardConnection = Connection<Ward>;

export interface WardFilter {
  id?: unknown;
  name?: unknown;
  specialty?: unknown;
  capacity?: unknown;
  location?: unknown;
  address?: unknown;
  AND?: WardFilter[];
  OR?: WardFilter[];
  NOT?: WardFilter;
}

// ─── Action types ───

export interface AdmitPatientInput {
  patient: string;
  ward: string;
  bed?: string | undefined;
  consultant: string;
  reason?: string | undefined;
}

export type AdmitPatientResult = ActionResult;

export interface DischargePatientInput {
  patient: string;
  destination: DischargeDestination;
  notes?: string | undefined;
}

export type DischargePatientResult = ActionResult;

export interface TransferWardInput {
  patient: string;
  toWard: string;
  toBed?: string | undefined;
  reason?: string | undefined;
}

export type TransferWardResult = ActionResult;

export interface CleanBedInput {
  bed: string;
}

export type CleanBedResult = ActionResult;

export interface RegisterPatientInput {
  name: string;
  dateOfBirth: string;
  nhsNumber?: string | undefined;
  triageCategory?: TriageCategory | undefined;
  presentingComplaint?: string | undefined;
  consent?: boolean | undefined;
}

export type RegisterPatientResult = ActionResult;

// ─── Client class ───

export class Altius {
  private readonly endpoint: string;
  private readonly token: string;
  private readonly wsSubscriptions = new Map<string, (payload: unknown) => void>();
  private wsSocket: WebSocket | null = null;
  private wsReady = false;
  private wsReadyQueue: Array<() => void> = [];

  constructor(config: AltiusConfig) {
    this.endpoint = config.endpoint;
    this.token = config.token;
  }

  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  private async query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) {
      throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
    }
    const json = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
    if (json.errors && json.errors.length > 0) {
      throw new Error(`GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`);
    }
    return (json.data ?? null) as T;
  }

  private async mutate<T>(action: string, input: unknown): Promise<T> {
    const field = action.charAt(0).toLowerCase() + action.slice(1);
    const mutation = `mutation($input: ${action}Input!) { ${field}(input: $input) {
      success actionId
      errors { code message field }
      affectedObjects { typeName id changeType }
    } }`;
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ query: mutation, variables: { input } }),
    });
    if (!response.ok) {
      throw new Error(`GraphQL mutation failed: ${response.status} ${response.statusText}`);
    }
    const json = (await response.json()) as { data?: Record<string, T>; errors?: Array<{ message: string }> };
    if (json.errors && json.errors.length > 0) {
      throw new Error(`GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`);
    }
    return (json.data?.[field] ?? null) as T;
  }

  private ensureWebSocket(): WebSocket {
    if (this.wsSocket && (this.wsSocket.readyState === WebSocket.OPEN || this.wsSocket.readyState === WebSocket.CONNECTING)) {
      return this.wsSocket;
    }
    const wsUrl = this.endpoint
      .replace(/^http:/, 'ws:')
      .replace(/^https:/, 'wss:');
    const socket = new WebSocket(wsUrl);
    this.wsSocket = socket;
    this.wsReady = false;
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ type: 'connection_init', payload: { Authorization: this.token ? `Bearer ${this.token}` : '' } }));
    });
    socket.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data as string) as { type: string; id?: string; payload?: unknown };
      if (msg.type === 'connection_ack') {
        this.wsReady = true;
        for (const fn of this.wsReadyQueue) fn();
        this.wsReadyQueue = [];
      } else if (msg.type === 'next' && msg.id) {
        const handler = this.wsSubscriptions.get(msg.id);
        if (handler) handler(msg.payload);
      } else if (msg.type === 'error' && msg.id) {
        this.wsSubscriptions.delete(msg.id);
      } else if (msg.type === 'complete' && msg.id) {
        this.wsSubscriptions.delete(msg.id);
      }
    });
    socket.addEventListener('close', () => {
      this.wsSocket = null;
      this.wsReady = false;
      this.wsSubscriptions.clear();
    });
    return socket;
  }

  private subscribe<T>(
    typeName: string,
    id: string,
    callback: (event: ChangeEvent<T>) => void,
  ): Subscription {
    const subId = `${typeName}:${id}:${Math.random().toString(36).slice(2)}`;
    const field = `${typeName.charAt(0).toLowerCase() + typeName.slice(1)}Changed`;
    const query = `subscription { ${field}(id: "${id}") {
      changeType object { id }
      previousValues causedBy timestamp
    } }`;
    const sendSubscribe = () => {
      const socket = this.ensureWebSocket();
      socket.send(JSON.stringify({ id: subId, type: 'subscribe', payload: { query } }));
      this.wsSubscriptions.set(subId, (payload) => {
        callback(payload as ChangeEvent<T>);
      });
    };
    if (this.wsReady) {
      sendSubscribe();
    } else {
      this.wsReadyQueue.push(sendSubscribe);
      this.ensureWebSocket();
    }
    return {
      unsubscribe: () => {
        this.wsSubscriptions.delete(subId);
        if (this.wsSocket && this.wsSocket.readyState === WebSocket.OPEN) {
          this.wsSocket.send(JSON.stringify({ id: subId, type: 'complete' }));
        }
      },
    };
  }

  get bed() {
    return {
      get: (id: string): Promise<Bed | null> =>
        this.query<Bed | null>(`query { bed(id: "${id}") { id number type status } }`),

      list: (filter?: BedFilter, pagination?: PaginationArgs): Promise<BedConnection> =>
        this.query<BedConnection>(`query($filter: BedFilter, $first: Int, $after: String) { beds(filter: $filter, first: $first, after: $after) { edges { node { id number type status } cursor } pageInfo { hasNextPage hasPreviousPage startCursor endCursor } totalCount } }`, { filter, first: pagination?.first, after: pagination?.after }),

      onChange: (id: string, callback: (event: ChangeEvent<Bed>) => void): Subscription =>
        this.subscribe<Bed>('Bed', id, callback),
    };
  }
  get consultant() {
    return {
      get: (id: string): Promise<Consultant | null> =>
        this.query<Consultant | null>(`query { consultant(id: "${id}") { id gmcNumber name specialty } }`),

      list: (filter?: ConsultantFilter, pagination?: PaginationArgs): Promise<ConsultantConnection> =>
        this.query<ConsultantConnection>(`query($filter: ConsultantFilter, $first: Int, $after: String) { consultants(filter: $filter, first: $first, after: $after) { edges { node { id gmcNumber name specialty } cursor } pageInfo { hasNextPage hasPreviousPage startCursor endCursor } totalCount } }`, { filter, first: pagination?.first, after: pagination?.after }),

      onChange: (id: string, callback: (event: ChangeEvent<Consultant>) => void): Subscription =>
        this.subscribe<Consultant>('Consultant', id, callback),
    };
  }
  get dischargeRecord() {
    return {
      get: (id: string): Promise<DischargeRecord | null> =>
        this.query<DischargeRecord | null>(`query { dischargeRecord(id: "${id}") { id patient ward destination dischargeDate notes } }`),

      list: (filter?: DischargeRecordFilter, pagination?: PaginationArgs): Promise<DischargeRecordConnection> =>
        this.query<DischargeRecordConnection>(`query($filter: DischargeRecordFilter, $first: Int, $after: String) { dischargeRecords(filter: $filter, first: $first, after: $after) { edges { node { id patient ward destination dischargeDate notes } cursor } pageInfo { hasNextPage hasPreviousPage startCursor endCursor } totalCount } }`, { filter, first: pagination?.first, after: pagination?.after }),

      onChange: (id: string, callback: (event: ChangeEvent<DischargeRecord>) => void): Subscription =>
        this.subscribe<DischargeRecord>('DischargeRecord', id, callback),
    };
  }
  get patient() {
    return {
      get: (id: string): Promise<Patient | null> =>
        this.query<Patient | null>(`query { patient(id: "${id}") { id nhsNumber name family given dateOfBirth status triageCategory presentingComplaint createdAt createdBy updatedAt updatedBy validFrom validTo } }`),

      list: (filter?: PatientFilter, pagination?: PaginationArgs): Promise<PatientConnection> =>
        this.query<PatientConnection>(`query($filter: PatientFilter, $first: Int, $after: String) { patients(filter: $filter, first: $first, after: $after) { edges { node { id nhsNumber name family given dateOfBirth status triageCategory presentingComplaint createdAt createdBy updatedAt updatedBy validFrom validTo } cursor } pageInfo { hasNextPage hasPreviousPage startCursor endCursor } totalCount } }`, { filter, first: pagination?.first, after: pagination?.after }),

      onChange: (id: string, callback: (event: ChangeEvent<Patient>) => void): Subscription =>
        this.subscribe<Patient>('Patient', id, callback),
    };
  }
  get staff() {
    return {
      get: (id: string): Promise<Staff | null> =>
        this.query<Staff | null>(`query { staff(id: "${id}") { id staffId name role specialty } }`),

      list: (filter?: StaffFilter, pagination?: PaginationArgs): Promise<StaffConnection> =>
        this.query<StaffConnection>(`query($filter: StaffFilter, $first: Int, $after: String) { staffs(filter: $filter, first: $first, after: $after) { edges { node { id staffId name role specialty } cursor } pageInfo { hasNextPage hasPreviousPage startCursor endCursor } totalCount } }`, { filter, first: pagination?.first, after: pagination?.after }),

      onChange: (id: string, callback: (event: ChangeEvent<Staff>) => void): Subscription =>
        this.subscribe<Staff>('Staff', id, callback),
    };
  }
  get transfer() {
    return {
      get: (id: string): Promise<Transfer | null> =>
        this.query<Transfer | null>(`query { transfer(id: "${id}") { id patient fromWard toWard transferDate reason } }`),

      list: (filter?: TransferFilter, pagination?: PaginationArgs): Promise<TransferConnection> =>
        this.query<TransferConnection>(`query($filter: TransferFilter, $first: Int, $after: String) { transfers(filter: $filter, first: $first, after: $after) { edges { node { id patient fromWard toWard transferDate reason } cursor } pageInfo { hasNextPage hasPreviousPage startCursor endCursor } totalCount } }`, { filter, first: pagination?.first, after: pagination?.after }),

      onChange: (id: string, callback: (event: ChangeEvent<Transfer>) => void): Subscription =>
        this.subscribe<Transfer>('Transfer', id, callback),
    };
  }
  get ward() {
    return {
      get: (id: string): Promise<Ward | null> =>
        this.query<Ward | null>(`query { ward(id: "${id}") { id name specialty capacity location address } }`),

      list: (filter?: WardFilter, pagination?: PaginationArgs): Promise<WardConnection> =>
        this.query<WardConnection>(`query($filter: WardFilter, $first: Int, $after: String) { wards(filter: $filter, first: $first, after: $after) { edges { node { id name specialty capacity location address } cursor } pageInfo { hasNextPage hasPreviousPage startCursor endCursor } totalCount } }`, { filter, first: pagination?.first, after: pagination?.after }),

      onChange: (id: string, callback: (event: ChangeEvent<Ward>) => void): Subscription =>
        this.subscribe<Ward>('Ward', id, callback),
    };
  }
  get actions() {
    return {
      admitPatient: (input: AdmitPatientInput): Promise<AdmitPatientResult> =>
        this.mutate<AdmitPatientResult>('AdmitPatient', input),
      dischargePatient: (input: DischargePatientInput): Promise<DischargePatientResult> =>
        this.mutate<DischargePatientResult>('DischargePatient', input),
      transferWard: (input: TransferWardInput): Promise<TransferWardResult> =>
        this.mutate<TransferWardResult>('TransferWard', input),
      cleanBed: (input: CleanBedInput): Promise<CleanBedResult> =>
        this.mutate<CleanBedResult>('CleanBed', input),
      registerPatient: (input: RegisterPatientInput): Promise<RegisterPatientResult> =>
        this.mutate<RegisterPatientResult>('RegisterPatient', input),
    };
  }
}
