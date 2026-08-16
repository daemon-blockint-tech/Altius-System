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

export type CustomerType =
  | 'INDIVIDUAL'
  | 'ORGANIZATION';

export type RiskLevel =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'VERY_HIGH'
  | 'PROHIBITED';

export type KycStatus =
  | 'PENDING'
  | 'VERIFIED'
  | 'EXPIRED'
  | 'REJECTED';

export type AccountStatus =
  | 'ACTIVE'
  | 'FROZEN'
  | 'CLOSED'
  | 'DORMANT';

export type AccountType =
  | 'CHECKING'
  | 'SAVINGS'
  | 'INVESTMENT'
  | 'CORRESPONDENT';

export type TransactionStatus =
  | 'PENDING'
  | 'CLEARED'
  | 'FLAGGED'
  | 'BLOCKED'
  | 'REVERSED';

export type TransactionType =
  | 'WIRE'
  | 'ACH'
  | 'CASH_DEPOSIT'
  | 'CASH_WITHDRAWAL'
  | 'INTERNAL_TRANSFER'
  | 'FOREIGN_EXCHANGE';

export type AlertSeverity =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'CRITICAL';

export type AlertStatus =
  | 'OPEN'
  | 'INVESTIGATING'
  | 'ESCALATED'
  | 'DISMISSED'
  | 'CONFIRMED';

export type CaseStatus =
  | 'OPEN'
  | 'UNDER_REVIEW'
  | 'ESCALATED'
  | 'CLOSED_NO_ACTION'
  | 'CLOSED_SAR_FILED';

export type SarStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'ACKNOWLEDGED'
  | 'REJECTED';

export type FacilityType =
  | 'FACTORY'
  | 'WAREHOUSE'
  | 'DISTRIBUTION_CENTER'
  | 'PORT';

export type FacilityStatus =
  | 'OPERATIONAL'
  | 'MAINTENANCE'
  | 'DISRUPTED'
  | 'CLOSED';

export type SupplierTier =
  | 'STRATEGIC'
  | 'PREFERRED'
  | 'APPROVED'
  | 'PROBATION';

export type OrderStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'CONFIRMED'
  | 'IN_PRODUCTION'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED';

export type ShipmentStatus =
  | 'PENDING'
  | 'IN_TRANSIT'
  | 'DELAYED'
  | 'CUSTOMS_HOLD'
  | 'DELIVERED'
  | 'LOST';

export type TransportMode =
  | 'SEA'
  | 'AIR'
  | 'ROAD'
  | 'RAIL'
  | 'MULTIMODAL';

export type StockLevel =
  | 'OVERSTOCKED'
  | 'ADEQUATE'
  | 'LOW'
  | 'CRITICAL'
  | 'STOCKOUT';

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

export interface Account {
  id: string;
  accountNumber: string | Redacted | null;
  type: AccountType | null;
  status: AccountStatus | null;
  currency: string | null;
  customer: string | null;
  openDate: string | null;
  lastActivityDate: string | null;
  _redactedFields: string[] | null;
  _consentRestricted: boolean | null;
}

export type AccountConnection = Connection<Account>;

export interface AccountFilter {
  id?: unknown;
  accountNumber?: unknown;
  type?: unknown;
  status?: unknown;
  currency?: unknown;
  customer?: unknown;
  openDate?: unknown;
  lastActivityDate?: unknown;
  AND?: AccountFilter[];
  OR?: AccountFilter[];
  NOT?: AccountFilter;
}

export interface Alert {
  id: string;
  alertNumber: string | null;
  severity: AlertSeverity | null;
  status: AlertStatus | null;
  ruleName: string | null;
  score: number | null;
  narrative: string | null;
  transaction: string | null;
  customer: string | null;
  assignedTo: string | null;
  createdDate: string | null;
  _redactedFields: string[] | null;
  _consentRestricted: boolean | null;
}

export type AlertConnection = Connection<Alert>;

export interface AlertFilter {
  id?: unknown;
  alertNumber?: unknown;
  severity?: unknown;
  status?: unknown;
  ruleName?: unknown;
  score?: unknown;
  narrative?: unknown;
  transaction?: unknown;
  customer?: unknown;
  assignedTo?: unknown;
  createdDate?: unknown;
  AND?: AlertFilter[];
  OR?: AlertFilter[];
  NOT?: AlertFilter;
}

export interface Case {
  id: string;
  caseNumber: string | null;
  status: CaseStatus | null;
  priority: AlertSeverity | null;
  assignedAnalyst: string | null;
  summary: string | null;
  openDate: string | null;
  closeDate: string | null;
  alertCount: number | null;
  alerts: (string)[];
  _redactedFields: string[] | null;
  _consentRestricted: boolean | null;
}

export type CaseConnection = Connection<Case>;

export interface CaseFilter {
  id?: unknown;
  caseNumber?: unknown;
  status?: unknown;
  priority?: unknown;
  assignedAnalyst?: unknown;
  summary?: unknown;
  openDate?: unknown;
  closeDate?: unknown;
  AND?: CaseFilter[];
  OR?: CaseFilter[];
  NOT?: CaseFilter;
}

export interface Customer {
  id: string;
  externalId: string | null;
  name: string | Redacted | null;
  type: CustomerType | null;
  riskLevel: RiskLevel | null;
  kycStatus: KycStatus | null;
  kycExpiryDate: string | null;
  country: string | null;
  dateOfBirth: string | Redacted | null;
  taxId: string | Redacted | null;
  _redactedFields: string[] | null;
  _consentRestricted: boolean | null;
}

export type CustomerConnection = Connection<Customer>;

export interface CustomerFilter {
  id?: unknown;
  externalId?: unknown;
  name?: unknown;
  type?: unknown;
  riskLevel?: unknown;
  kycStatus?: unknown;
  kycExpiryDate?: unknown;
  country?: unknown;
  dateOfBirth?: unknown;
  taxId?: unknown;
  AND?: CustomerFilter[];
  OR?: CustomerFilter[];
  NOT?: CustomerFilter;
}

export interface SuspiciousActivityReport {
  id: string;
  sarNumber: string | null;
  status: SarStatus | null;
  filingDate: string | null;
  narrative: string | null;
  amount: number | null;
  reportingEntity: string | null;
  caseRef: string | null;
  _redactedFields: string[] | null;
  _consentRestricted: boolean | null;
}

export type SuspiciousActivityReportConnection = Connection<SuspiciousActivityReport>;

export interface SuspiciousActivityReportFilter {
  id?: unknown;
  sarNumber?: unknown;
  status?: unknown;
  filingDate?: unknown;
  narrative?: unknown;
  amount?: unknown;
  reportingEntity?: unknown;
  caseRef?: unknown;
  AND?: SuspiciousActivityReportFilter[];
  OR?: SuspiciousActivityReportFilter[];
  NOT?: SuspiciousActivityReportFilter;
}

export interface Transaction {
  id: string;
  referenceId: string | null;
  type: TransactionType | null;
  status: TransactionStatus | null;
  amount: number | null;
  currency: string | null;
  sourceAccount: string | null;
  destinationAccount: string | null;
  transactionDate: string | null;
  description: string | null;
  country: string | null;
  _redactedFields: string[] | null;
  _consentRestricted: boolean | null;
}

export type TransactionConnection = Connection<Transaction>;

export interface TransactionFilter {
  id?: unknown;
  referenceId?: unknown;
  type?: unknown;
  status?: unknown;
  amount?: unknown;
  currency?: unknown;
  sourceAccount?: unknown;
  destinationAccount?: unknown;
  transactionDate?: unknown;
  description?: unknown;
  country?: unknown;
  AND?: TransactionFilter[];
  OR?: TransactionFilter[];
  NOT?: TransactionFilter;
}

export interface Facility {
  id: string;
  name: string | null;
  code: string | null;
  type: FacilityType | null;
  status: FacilityStatus | null;
  location: { lat: number; lng: number } | null;
  address: string | null;
  country: string | null;
  capacity: number | null;
  currentUtilization: number | null;
  _redactedFields: string[] | null;
  _consentRestricted: boolean | null;
}

export type FacilityConnection = Connection<Facility>;

export interface FacilityFilter {
  id?: unknown;
  name?: unknown;
  code?: unknown;
  type?: unknown;
  status?: unknown;
  location?: unknown;
  address?: unknown;
  country?: unknown;
  capacity?: unknown;
  AND?: FacilityFilter[];
  OR?: FacilityFilter[];
  NOT?: FacilityFilter;
}

export interface InventoryRecord {
  id: string;
  quantity: number | null;
  reservedQuantity: number | null;
  stockLevel: StockLevel | null;
  lastCountDate: string | null;
  product: Product | null;
  facility: Facility | null;
  _redactedFields: string[] | null;
  _consentRestricted: boolean | null;
}

export type InventoryRecordConnection = Connection<InventoryRecord>;

export interface InventoryRecordFilter {
  id?: unknown;
  quantity?: unknown;
  reservedQuantity?: unknown;
  stockLevel?: unknown;
  lastCountDate?: unknown;
  AND?: InventoryRecordFilter[];
  OR?: InventoryRecordFilter[];
  NOT?: InventoryRecordFilter;
}

export interface Product {
  id: string;
  sku: string | null;
  name: string | null;
  category: string | null;
  unitOfMeasure: string | null;
  reorderPoint: number | null;
  reorderQuantity: number | null;
  suppliers: (string)[];
  _redactedFields: string[] | null;
  _consentRestricted: boolean | null;
}

export type ProductConnection = Connection<Product>;

export interface ProductFilter {
  id?: unknown;
  sku?: unknown;
  name?: unknown;
  category?: unknown;
  unitOfMeasure?: unknown;
  reorderPoint?: unknown;
  reorderQuantity?: unknown;
  AND?: ProductFilter[];
  OR?: ProductFilter[];
  NOT?: ProductFilter;
}

export interface PurchaseOrder {
  id: string;
  orderNumber: string | null;
  status: OrderStatus | null;
  supplier: Supplier | null;
  product: Product | null;
  quantity: number | null;
  unitCost: number | null;
  currency: string | null;
  requestedDeliveryDate: string | null;
  notes: string | null;
  _redactedFields: string[] | null;
  _consentRestricted: boolean | null;
}

export type PurchaseOrderConnection = Connection<PurchaseOrder>;

export interface PurchaseOrderFilter {
  id?: unknown;
  orderNumber?: unknown;
  status?: unknown;
  quantity?: unknown;
  unitCost?: unknown;
  currency?: unknown;
  requestedDeliveryDate?: unknown;
  notes?: unknown;
  AND?: PurchaseOrderFilter[];
  OR?: PurchaseOrderFilter[];
  NOT?: PurchaseOrderFilter;
}

export interface Shipment {
  id: string;
  trackingNumber: string | null;
  status: ShipmentStatus | null;
  transportMode: TransportMode | null;
  quantity: number | null;
  departureDate: string | null;
  estimatedArrival: string | null;
  actualArrival: string | null;
  order: PurchaseOrder | null;
  origin: Facility | null;
  destination: Facility | null;
  _redactedFields: string[] | null;
  _consentRestricted: boolean | null;
}

export type ShipmentConnection = Connection<Shipment>;

export interface ShipmentFilter {
  id?: unknown;
  trackingNumber?: unknown;
  status?: unknown;
  transportMode?: unknown;
  quantity?: unknown;
  departureDate?: unknown;
  estimatedArrival?: unknown;
  actualArrival?: unknown;
  AND?: ShipmentFilter[];
  OR?: ShipmentFilter[];
  NOT?: ShipmentFilter;
}

export interface Supplier {
  id: string;
  name: string | null;
  code: string | null;
  system: string | null;
  display: string | null;
  tier: SupplierTier | null;
  contactName: string | null;
  contactEmail: string | Redacted | null;
  country: string | null;
  leadTimeDays: number | null;
  onTimeDeliveryRate: number | null;
  products: (string)[];
  _redactedFields: string[] | null;
  _consentRestricted: boolean | null;
}

export type SupplierConnection = Connection<Supplier>;

export interface SupplierFilter {
  id?: unknown;
  name?: unknown;
  code?: unknown;
  system?: unknown;
  display?: unknown;
  tier?: unknown;
  contactName?: unknown;
  contactEmail?: unknown;
  country?: unknown;
  leadTimeDays?: unknown;
  onTimeDeliveryRate?: unknown;
  AND?: SupplierFilter[];
  OR?: SupplierFilter[];
  NOT?: SupplierFilter;
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

export interface FlagTransactionInput {
  transaction: string;
  customer: string;
  alertNumber: string;
  severity: AlertSeverity;
  ruleName: string;
  score?: number | undefined;
  narrative?: string | undefined;
}

export type FlagTransactionResult = ActionResult;

export interface OpenCaseInput {
  caseNumber: string;
  priority: AlertSeverity;
  assignedAnalyst: string;
  summary?: string | undefined;
}

export type OpenCaseResult = ActionResult;

export interface AssignAlertToCaseInput {
  alert: string;
  investigationCase: string;
}

export type AssignAlertToCaseResult = ActionResult;

export interface FreezeAccountInput {
  account: string;
  reason: string;
}

export type FreezeAccountResult = ActionResult;

export interface FileReportInput {
  investigationCase: string;
  sarNumber: string;
  narrative: string;
  amount: number;
  reportingEntity: string;
}

export type FileReportResult = ActionResult;

export interface SubmitReportInput {
  sar: string;
  investigationCase: string;
}

export type SubmitReportResult = ActionResult;

export interface CreateOrderInput {
  supplier: string;
  product: string;
  orderNumber: string;
  quantity: number;
  unitCost: number;
  currency: string;
  requestedDeliveryDate: string;
  notes?: string | undefined;
}

export type CreateOrderResult = ActionResult;

export interface ShipOrderInput {
  order: string;
  origin: string;
  destination: string;
  trackingNumber?: string | undefined;
  transportMode: TransportMode;
  estimatedArrival: string;
}

export type ShipOrderResult = ActionResult;

export interface ReceiveShipmentInput {
  shipment: string;
  order: string;
  destination: string;
  product?: string | undefined;
  inventoryRecord?: string | undefined;
  receivedQuantity: number;
  stockLevel: StockLevel;
}

export type ReceiveShipmentResult = ActionResult;

export interface CancelOrderInput {
  order: string;
  reason?: string | undefined;
}

export type CancelOrderResult = ActionResult;

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
    // graphql-ws requires the subprotocol on the handshake. Without it the
    // server closes the socket with 4406 'Subprotocol not acceptable' before
    // any message is exchanged, so every subscription silently never starts.
    const socket = new WebSocket(wsUrl, 'graphql-transport-ws');
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

  /**
   * Subscribe to one object by id, or to the whole type when `id` is null.
   *
   * The type-level form passes the filter the server evaluates per
   * subscriber against the hydrated, redacted object — so a live table needs
   * ONE subscription, not one per visible row.
   */
  private subscribe<T>(
    typeName: string,
    id: string | null,
    fields: string,
    callback: (event: ChangeEvent<T>) => void,
    filter?: Record<string, unknown>,
  ): Subscription {
    const subId = `${typeName}:${id ?? "*"}:${Math.random().toString(36).slice(2)}`;
    const lower = typeName.charAt(0).toLowerCase() + typeName.slice(1);
    const field = id === null ? `${lower}sChanged` : `${lower}Changed`;
    // `causedBy` is a composite (ActionReference); selecting it bare is a
    // GraphQL validation error, which the server reports as an `error`
    // message that this client drops — the subscription then looks alive and
    // delivers nothing. It needs an explicit subselection.
    const args = id === null
      ? (filter ? `(filter: $filter)` : "")
      : `(id: "${id}")`;
    const varDecl = id === null && filter ? "($filter: JSON)" : "";
    const query = `subscription${varDecl} { ${field}${args} {
      changeType object { ${fields} }
      previousValues causedBy { actionType actionId } timestamp
    } }`;
    const sendSubscribe = () => {
      const socket = this.ensureWebSocket();
      const payload = filter && id === null ? { query, variables: { filter } } : { query };
      socket.send(JSON.stringify({ id: subId, type: 'subscribe', payload }));
      this.wsSubscriptions.set(subId, (raw) => {
        // graphql-ws `next` carries an ExecutionResult envelope, not the
        // event itself. Handing the envelope to the callback would satisfy
        // no declared type and break every consumer.
        const data = (raw as { data?: Record<string, unknown> } | undefined)?.data;
        const event = data?.[field];
        if (event !== undefined && event !== null) {
          callback(event as ChangeEvent<T>);
        }
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
        this.subscribe<Bed>('Bed', id, 'id number type status', callback),

      onAnyChange: (callback: (event: ChangeEvent<Bed>) => void, filter?: BedFilter): Subscription =>
        this.subscribe<Bed>('Bed', null, 'id number type status', callback, filter as Record<string, unknown> | undefined),
    };
  }
  get consultant() {
    return {
      get: (id: string): Promise<Consultant | null> =>
        this.query<Consultant | null>(`query { consultant(id: "${id}") { id gmcNumber name specialty } }`),

      list: (filter?: ConsultantFilter, pagination?: PaginationArgs): Promise<ConsultantConnection> =>
        this.query<ConsultantConnection>(`query($filter: ConsultantFilter, $first: Int, $after: String) { consultants(filter: $filter, first: $first, after: $after) { edges { node { id gmcNumber name specialty } cursor } pageInfo { hasNextPage hasPreviousPage startCursor endCursor } totalCount } }`, { filter, first: pagination?.first, after: pagination?.after }),

      onChange: (id: string, callback: (event: ChangeEvent<Consultant>) => void): Subscription =>
        this.subscribe<Consultant>('Consultant', id, 'id gmcNumber name specialty', callback),

      onAnyChange: (callback: (event: ChangeEvent<Consultant>) => void, filter?: ConsultantFilter): Subscription =>
        this.subscribe<Consultant>('Consultant', null, 'id gmcNumber name specialty', callback, filter as Record<string, unknown> | undefined),
    };
  }
  get dischargeRecord() {
    return {
      get: (id: string): Promise<DischargeRecord | null> =>
        this.query<DischargeRecord | null>(`query { dischargeRecord(id: "${id}") { id patient ward destination dischargeDate notes } }`),

      list: (filter?: DischargeRecordFilter, pagination?: PaginationArgs): Promise<DischargeRecordConnection> =>
        this.query<DischargeRecordConnection>(`query($filter: DischargeRecordFilter, $first: Int, $after: String) { dischargeRecords(filter: $filter, first: $first, after: $after) { edges { node { id patient ward destination dischargeDate notes } cursor } pageInfo { hasNextPage hasPreviousPage startCursor endCursor } totalCount } }`, { filter, first: pagination?.first, after: pagination?.after }),

      onChange: (id: string, callback: (event: ChangeEvent<DischargeRecord>) => void): Subscription =>
        this.subscribe<DischargeRecord>('DischargeRecord', id, 'id patient ward destination dischargeDate notes', callback),

      onAnyChange: (callback: (event: ChangeEvent<DischargeRecord>) => void, filter?: DischargeRecordFilter): Subscription =>
        this.subscribe<DischargeRecord>('DischargeRecord', null, 'id patient ward destination dischargeDate notes', callback, filter as Record<string, unknown> | undefined),
    };
  }
  get patient() {
    return {
      get: (id: string): Promise<Patient | null> =>
        this.query<Patient | null>(`query { patient(id: "${id}") { id nhsNumber name family given dateOfBirth status triageCategory presentingComplaint createdAt createdBy updatedAt updatedBy validFrom validTo } }`),

      list: (filter?: PatientFilter, pagination?: PaginationArgs): Promise<PatientConnection> =>
        this.query<PatientConnection>(`query($filter: PatientFilter, $first: Int, $after: String) { patients(filter: $filter, first: $first, after: $after) { edges { node { id nhsNumber name family given dateOfBirth status triageCategory presentingComplaint createdAt createdBy updatedAt updatedBy validFrom validTo } cursor } pageInfo { hasNextPage hasPreviousPage startCursor endCursor } totalCount } }`, { filter, first: pagination?.first, after: pagination?.after }),

      onChange: (id: string, callback: (event: ChangeEvent<Patient>) => void): Subscription =>
        this.subscribe<Patient>('Patient', id, 'id nhsNumber name family given dateOfBirth status triageCategory presentingComplaint createdAt createdBy updatedAt updatedBy validFrom validTo', callback),

      onAnyChange: (callback: (event: ChangeEvent<Patient>) => void, filter?: PatientFilter): Subscription =>
        this.subscribe<Patient>('Patient', null, 'id nhsNumber name family given dateOfBirth status triageCategory presentingComplaint createdAt createdBy updatedAt updatedBy validFrom validTo', callback, filter as Record<string, unknown> | undefined),
    };
  }
  get staff() {
    return {
      get: (id: string): Promise<Staff | null> =>
        this.query<Staff | null>(`query { staff(id: "${id}") { id staffId name role specialty } }`),

      list: (filter?: StaffFilter, pagination?: PaginationArgs): Promise<StaffConnection> =>
        this.query<StaffConnection>(`query($filter: StaffFilter, $first: Int, $after: String) { staffs(filter: $filter, first: $first, after: $after) { edges { node { id staffId name role specialty } cursor } pageInfo { hasNextPage hasPreviousPage startCursor endCursor } totalCount } }`, { filter, first: pagination?.first, after: pagination?.after }),

      onChange: (id: string, callback: (event: ChangeEvent<Staff>) => void): Subscription =>
        this.subscribe<Staff>('Staff', id, 'id staffId name role specialty', callback),

      onAnyChange: (callback: (event: ChangeEvent<Staff>) => void, filter?: StaffFilter): Subscription =>
        this.subscribe<Staff>('Staff', null, 'id staffId name role specialty', callback, filter as Record<string, unknown> | undefined),
    };
  }
  get transfer() {
    return {
      get: (id: string): Promise<Transfer | null> =>
        this.query<Transfer | null>(`query { transfer(id: "${id}") { id patient fromWard toWard transferDate reason } }`),

      list: (filter?: TransferFilter, pagination?: PaginationArgs): Promise<TransferConnection> =>
        this.query<TransferConnection>(`query($filter: TransferFilter, $first: Int, $after: String) { transfers(filter: $filter, first: $first, after: $after) { edges { node { id patient fromWard toWard transferDate reason } cursor } pageInfo { hasNextPage hasPreviousPage startCursor endCursor } totalCount } }`, { filter, first: pagination?.first, after: pagination?.after }),

      onChange: (id: string, callback: (event: ChangeEvent<Transfer>) => void): Subscription =>
        this.subscribe<Transfer>('Transfer', id, 'id patient fromWard toWard transferDate reason', callback),

      onAnyChange: (callback: (event: ChangeEvent<Transfer>) => void, filter?: TransferFilter): Subscription =>
        this.subscribe<Transfer>('Transfer', null, 'id patient fromWard toWard transferDate reason', callback, filter as Record<string, unknown> | undefined),
    };
  }
  get ward() {
    return {
      get: (id: string): Promise<Ward | null> =>
        this.query<Ward | null>(`query { ward(id: "${id}") { id name specialty capacity location address } }`),

      list: (filter?: WardFilter, pagination?: PaginationArgs): Promise<WardConnection> =>
        this.query<WardConnection>(`query($filter: WardFilter, $first: Int, $after: String) { wards(filter: $filter, first: $first, after: $after) { edges { node { id name specialty capacity location address } cursor } pageInfo { hasNextPage hasPreviousPage startCursor endCursor } totalCount } }`, { filter, first: pagination?.first, after: pagination?.after }),

      onChange: (id: string, callback: (event: ChangeEvent<Ward>) => void): Subscription =>
        this.subscribe<Ward>('Ward', id, 'id name specialty capacity location address', callback),

      onAnyChange: (callback: (event: ChangeEvent<Ward>) => void, filter?: WardFilter): Subscription =>
        this.subscribe<Ward>('Ward', null, 'id name specialty capacity location address', callback, filter as Record<string, unknown> | undefined),
    };
  }
  get account() {
    return {
      get: (id: string): Promise<Account | null> =>
        this.query<Account | null>(`query { account(id: "${id}") { id accountNumber type status currency customer openDate lastActivityDate } }`),

      list: (filter?: AccountFilter, pagination?: PaginationArgs): Promise<AccountConnection> =>
        this.query<AccountConnection>(`query($filter: AccountFilter, $first: Int, $after: String) { accounts(filter: $filter, first: $first, after: $after) { edges { node { id accountNumber type status currency customer openDate lastActivityDate } cursor } pageInfo { hasNextPage hasPreviousPage startCursor endCursor } totalCount } }`, { filter, first: pagination?.first, after: pagination?.after }),

      onChange: (id: string, callback: (event: ChangeEvent<Account>) => void): Subscription =>
        this.subscribe<Account>('Account', id, 'id accountNumber type status currency customer openDate lastActivityDate', callback),

      onAnyChange: (callback: (event: ChangeEvent<Account>) => void, filter?: AccountFilter): Subscription =>
        this.subscribe<Account>('Account', null, 'id accountNumber type status currency customer openDate lastActivityDate', callback, filter as Record<string, unknown> | undefined),
    };
  }
  get alert() {
    return {
      get: (id: string): Promise<Alert | null> =>
        this.query<Alert | null>(`query { alert(id: "${id}") { id alertNumber severity status ruleName score narrative transaction customer assignedTo createdDate } }`),

      list: (filter?: AlertFilter, pagination?: PaginationArgs): Promise<AlertConnection> =>
        this.query<AlertConnection>(`query($filter: AlertFilter, $first: Int, $after: String) { alerts(filter: $filter, first: $first, after: $after) { edges { node { id alertNumber severity status ruleName score narrative transaction customer assignedTo createdDate } cursor } pageInfo { hasNextPage hasPreviousPage startCursor endCursor } totalCount } }`, { filter, first: pagination?.first, after: pagination?.after }),

      onChange: (id: string, callback: (event: ChangeEvent<Alert>) => void): Subscription =>
        this.subscribe<Alert>('Alert', id, 'id alertNumber severity status ruleName score narrative transaction customer assignedTo createdDate', callback),

      onAnyChange: (callback: (event: ChangeEvent<Alert>) => void, filter?: AlertFilter): Subscription =>
        this.subscribe<Alert>('Alert', null, 'id alertNumber severity status ruleName score narrative transaction customer assignedTo createdDate', callback, filter as Record<string, unknown> | undefined),
    };
  }
  get case() {
    return {
      get: (id: string): Promise<Case | null> =>
        this.query<Case | null>(`query { case(id: "${id}") { id caseNumber status priority assignedAnalyst summary openDate closeDate } }`),

      list: (filter?: CaseFilter, pagination?: PaginationArgs): Promise<CaseConnection> =>
        this.query<CaseConnection>(`query($filter: CaseFilter, $first: Int, $after: String) { cases(filter: $filter, first: $first, after: $after) { edges { node { id caseNumber status priority assignedAnalyst summary openDate closeDate } cursor } pageInfo { hasNextPage hasPreviousPage startCursor endCursor } totalCount } }`, { filter, first: pagination?.first, after: pagination?.after }),

      onChange: (id: string, callback: (event: ChangeEvent<Case>) => void): Subscription =>
        this.subscribe<Case>('Case', id, 'id caseNumber status priority assignedAnalyst summary openDate closeDate', callback),

      onAnyChange: (callback: (event: ChangeEvent<Case>) => void, filter?: CaseFilter): Subscription =>
        this.subscribe<Case>('Case', null, 'id caseNumber status priority assignedAnalyst summary openDate closeDate', callback, filter as Record<string, unknown> | undefined),
    };
  }
  get customer() {
    return {
      get: (id: string): Promise<Customer | null> =>
        this.query<Customer | null>(`query { customer(id: "${id}") { id externalId name type riskLevel kycStatus kycExpiryDate country dateOfBirth taxId } }`),

      list: (filter?: CustomerFilter, pagination?: PaginationArgs): Promise<CustomerConnection> =>
        this.query<CustomerConnection>(`query($filter: CustomerFilter, $first: Int, $after: String) { customers(filter: $filter, first: $first, after: $after) { edges { node { id externalId name type riskLevel kycStatus kycExpiryDate country dateOfBirth taxId } cursor } pageInfo { hasNextPage hasPreviousPage startCursor endCursor } totalCount } }`, { filter, first: pagination?.first, after: pagination?.after }),

      onChange: (id: string, callback: (event: ChangeEvent<Customer>) => void): Subscription =>
        this.subscribe<Customer>('Customer', id, 'id externalId name type riskLevel kycStatus kycExpiryDate country dateOfBirth taxId', callback),

      onAnyChange: (callback: (event: ChangeEvent<Customer>) => void, filter?: CustomerFilter): Subscription =>
        this.subscribe<Customer>('Customer', null, 'id externalId name type riskLevel kycStatus kycExpiryDate country dateOfBirth taxId', callback, filter as Record<string, unknown> | undefined),
    };
  }
  get suspiciousActivityReport() {
    return {
      get: (id: string): Promise<SuspiciousActivityReport | null> =>
        this.query<SuspiciousActivityReport | null>(`query { suspiciousActivityReport(id: "${id}") { id sarNumber status filingDate narrative amount reportingEntity caseRef } }`),

      list: (filter?: SuspiciousActivityReportFilter, pagination?: PaginationArgs): Promise<SuspiciousActivityReportConnection> =>
        this.query<SuspiciousActivityReportConnection>(`query($filter: SuspiciousActivityReportFilter, $first: Int, $after: String) { suspiciousActivityReports(filter: $filter, first: $first, after: $after) { edges { node { id sarNumber status filingDate narrative amount reportingEntity caseRef } cursor } pageInfo { hasNextPage hasPreviousPage startCursor endCursor } totalCount } }`, { filter, first: pagination?.first, after: pagination?.after }),

      onChange: (id: string, callback: (event: ChangeEvent<SuspiciousActivityReport>) => void): Subscription =>
        this.subscribe<SuspiciousActivityReport>('SuspiciousActivityReport', id, 'id sarNumber status filingDate narrative amount reportingEntity caseRef', callback),

      onAnyChange: (callback: (event: ChangeEvent<SuspiciousActivityReport>) => void, filter?: SuspiciousActivityReportFilter): Subscription =>
        this.subscribe<SuspiciousActivityReport>('SuspiciousActivityReport', null, 'id sarNumber status filingDate narrative amount reportingEntity caseRef', callback, filter as Record<string, unknown> | undefined),
    };
  }
  get transaction() {
    return {
      get: (id: string): Promise<Transaction | null> =>
        this.query<Transaction | null>(`query { transaction(id: "${id}") { id referenceId type status amount currency sourceAccount destinationAccount transactionDate description country } }`),

      list: (filter?: TransactionFilter, pagination?: PaginationArgs): Promise<TransactionConnection> =>
        this.query<TransactionConnection>(`query($filter: TransactionFilter, $first: Int, $after: String) { transactions(filter: $filter, first: $first, after: $after) { edges { node { id referenceId type status amount currency sourceAccount destinationAccount transactionDate description country } cursor } pageInfo { hasNextPage hasPreviousPage startCursor endCursor } totalCount } }`, { filter, first: pagination?.first, after: pagination?.after }),

      onChange: (id: string, callback: (event: ChangeEvent<Transaction>) => void): Subscription =>
        this.subscribe<Transaction>('Transaction', id, 'id referenceId type status amount currency sourceAccount destinationAccount transactionDate description country', callback),

      onAnyChange: (callback: (event: ChangeEvent<Transaction>) => void, filter?: TransactionFilter): Subscription =>
        this.subscribe<Transaction>('Transaction', null, 'id referenceId type status amount currency sourceAccount destinationAccount transactionDate description country', callback, filter as Record<string, unknown> | undefined),
    };
  }
  get facility() {
    return {
      get: (id: string): Promise<Facility | null> =>
        this.query<Facility | null>(`query { facility(id: "${id}") { id name code type status location address country capacity } }`),

      list: (filter?: FacilityFilter, pagination?: PaginationArgs): Promise<FacilityConnection> =>
        this.query<FacilityConnection>(`query($filter: FacilityFilter, $first: Int, $after: String) { facilitys(filter: $filter, first: $first, after: $after) { edges { node { id name code type status location address country capacity } cursor } pageInfo { hasNextPage hasPreviousPage startCursor endCursor } totalCount } }`, { filter, first: pagination?.first, after: pagination?.after }),

      onChange: (id: string, callback: (event: ChangeEvent<Facility>) => void): Subscription =>
        this.subscribe<Facility>('Facility', id, 'id name code type status location address country capacity', callback),

      onAnyChange: (callback: (event: ChangeEvent<Facility>) => void, filter?: FacilityFilter): Subscription =>
        this.subscribe<Facility>('Facility', null, 'id name code type status location address country capacity', callback, filter as Record<string, unknown> | undefined),
    };
  }
  get inventoryRecord() {
    return {
      get: (id: string): Promise<InventoryRecord | null> =>
        this.query<InventoryRecord | null>(`query { inventoryRecord(id: "${id}") { id quantity reservedQuantity stockLevel lastCountDate product facility } }`),

      list: (filter?: InventoryRecordFilter, pagination?: PaginationArgs): Promise<InventoryRecordConnection> =>
        this.query<InventoryRecordConnection>(`query($filter: InventoryRecordFilter, $first: Int, $after: String) { inventoryRecords(filter: $filter, first: $first, after: $after) { edges { node { id quantity reservedQuantity stockLevel lastCountDate product facility } cursor } pageInfo { hasNextPage hasPreviousPage startCursor endCursor } totalCount } }`, { filter, first: pagination?.first, after: pagination?.after }),

      onChange: (id: string, callback: (event: ChangeEvent<InventoryRecord>) => void): Subscription =>
        this.subscribe<InventoryRecord>('InventoryRecord', id, 'id quantity reservedQuantity stockLevel lastCountDate product facility', callback),

      onAnyChange: (callback: (event: ChangeEvent<InventoryRecord>) => void, filter?: InventoryRecordFilter): Subscription =>
        this.subscribe<InventoryRecord>('InventoryRecord', null, 'id quantity reservedQuantity stockLevel lastCountDate product facility', callback, filter as Record<string, unknown> | undefined),
    };
  }
  get product() {
    return {
      get: (id: string): Promise<Product | null> =>
        this.query<Product | null>(`query { product(id: "${id}") { id sku name category unitOfMeasure reorderPoint reorderQuantity } }`),

      list: (filter?: ProductFilter, pagination?: PaginationArgs): Promise<ProductConnection> =>
        this.query<ProductConnection>(`query($filter: ProductFilter, $first: Int, $after: String) { products(filter: $filter, first: $first, after: $after) { edges { node { id sku name category unitOfMeasure reorderPoint reorderQuantity } cursor } pageInfo { hasNextPage hasPreviousPage startCursor endCursor } totalCount } }`, { filter, first: pagination?.first, after: pagination?.after }),

      onChange: (id: string, callback: (event: ChangeEvent<Product>) => void): Subscription =>
        this.subscribe<Product>('Product', id, 'id sku name category unitOfMeasure reorderPoint reorderQuantity', callback),

      onAnyChange: (callback: (event: ChangeEvent<Product>) => void, filter?: ProductFilter): Subscription =>
        this.subscribe<Product>('Product', null, 'id sku name category unitOfMeasure reorderPoint reorderQuantity', callback, filter as Record<string, unknown> | undefined),
    };
  }
  get purchaseOrder() {
    return {
      get: (id: string): Promise<PurchaseOrder | null> =>
        this.query<PurchaseOrder | null>(`query { purchaseOrder(id: "${id}") { id orderNumber status supplier product quantity unitCost currency requestedDeliveryDate notes } }`),

      list: (filter?: PurchaseOrderFilter, pagination?: PaginationArgs): Promise<PurchaseOrderConnection> =>
        this.query<PurchaseOrderConnection>(`query($filter: PurchaseOrderFilter, $first: Int, $after: String) { purchaseOrders(filter: $filter, first: $first, after: $after) { edges { node { id orderNumber status supplier product quantity unitCost currency requestedDeliveryDate notes } cursor } pageInfo { hasNextPage hasPreviousPage startCursor endCursor } totalCount } }`, { filter, first: pagination?.first, after: pagination?.after }),

      onChange: (id: string, callback: (event: ChangeEvent<PurchaseOrder>) => void): Subscription =>
        this.subscribe<PurchaseOrder>('PurchaseOrder', id, 'id orderNumber status supplier product quantity unitCost currency requestedDeliveryDate notes', callback),

      onAnyChange: (callback: (event: ChangeEvent<PurchaseOrder>) => void, filter?: PurchaseOrderFilter): Subscription =>
        this.subscribe<PurchaseOrder>('PurchaseOrder', null, 'id orderNumber status supplier product quantity unitCost currency requestedDeliveryDate notes', callback, filter as Record<string, unknown> | undefined),
    };
  }
  get shipment() {
    return {
      get: (id: string): Promise<Shipment | null> =>
        this.query<Shipment | null>(`query { shipment(id: "${id}") { id trackingNumber status transportMode quantity departureDate estimatedArrival actualArrival order origin destination } }`),

      list: (filter?: ShipmentFilter, pagination?: PaginationArgs): Promise<ShipmentConnection> =>
        this.query<ShipmentConnection>(`query($filter: ShipmentFilter, $first: Int, $after: String) { shipments(filter: $filter, first: $first, after: $after) { edges { node { id trackingNumber status transportMode quantity departureDate estimatedArrival actualArrival order origin destination } cursor } pageInfo { hasNextPage hasPreviousPage startCursor endCursor } totalCount } }`, { filter, first: pagination?.first, after: pagination?.after }),

      onChange: (id: string, callback: (event: ChangeEvent<Shipment>) => void): Subscription =>
        this.subscribe<Shipment>('Shipment', id, 'id trackingNumber status transportMode quantity departureDate estimatedArrival actualArrival order origin destination', callback),

      onAnyChange: (callback: (event: ChangeEvent<Shipment>) => void, filter?: ShipmentFilter): Subscription =>
        this.subscribe<Shipment>('Shipment', null, 'id trackingNumber status transportMode quantity departureDate estimatedArrival actualArrival order origin destination', callback, filter as Record<string, unknown> | undefined),
    };
  }
  get supplier() {
    return {
      get: (id: string): Promise<Supplier | null> =>
        this.query<Supplier | null>(`query { supplier(id: "${id}") { id name code system display tier contactName contactEmail country leadTimeDays onTimeDeliveryRate } }`),

      list: (filter?: SupplierFilter, pagination?: PaginationArgs): Promise<SupplierConnection> =>
        this.query<SupplierConnection>(`query($filter: SupplierFilter, $first: Int, $after: String) { suppliers(filter: $filter, first: $first, after: $after) { edges { node { id name code system display tier contactName contactEmail country leadTimeDays onTimeDeliveryRate } cursor } pageInfo { hasNextPage hasPreviousPage startCursor endCursor } totalCount } }`, { filter, first: pagination?.first, after: pagination?.after }),

      onChange: (id: string, callback: (event: ChangeEvent<Supplier>) => void): Subscription =>
        this.subscribe<Supplier>('Supplier', id, 'id name code system display tier contactName contactEmail country leadTimeDays onTimeDeliveryRate', callback),

      onAnyChange: (callback: (event: ChangeEvent<Supplier>) => void, filter?: SupplierFilter): Subscription =>
        this.subscribe<Supplier>('Supplier', null, 'id name code system display tier contactName contactEmail country leadTimeDays onTimeDeliveryRate', callback, filter as Record<string, unknown> | undefined),
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
      flagTransaction: (input: FlagTransactionInput): Promise<FlagTransactionResult> =>
        this.mutate<FlagTransactionResult>('FlagTransaction', input),
      openCase: (input: OpenCaseInput): Promise<OpenCaseResult> =>
        this.mutate<OpenCaseResult>('OpenCase', input),
      assignAlertToCase: (input: AssignAlertToCaseInput): Promise<AssignAlertToCaseResult> =>
        this.mutate<AssignAlertToCaseResult>('AssignAlertToCase', input),
      freezeAccount: (input: FreezeAccountInput): Promise<FreezeAccountResult> =>
        this.mutate<FreezeAccountResult>('FreezeAccount', input),
      fileReport: (input: FileReportInput): Promise<FileReportResult> =>
        this.mutate<FileReportResult>('FileReport', input),
      submitReport: (input: SubmitReportInput): Promise<SubmitReportResult> =>
        this.mutate<SubmitReportResult>('SubmitReport', input),
      createOrder: (input: CreateOrderInput): Promise<CreateOrderResult> =>
        this.mutate<CreateOrderResult>('CreateOrder', input),
      shipOrder: (input: ShipOrderInput): Promise<ShipOrderResult> =>
        this.mutate<ShipOrderResult>('ShipOrder', input),
      receiveShipment: (input: ReceiveShipmentInput): Promise<ReceiveShipmentResult> =>
        this.mutate<ReceiveShipmentResult>('ReceiveShipment', input),
      cancelOrder: (input: CancelOrderInput): Promise<CancelOrderResult> =>
        this.mutate<CancelOrderResult>('CancelOrder', input),
    };
  }
}
