/**
 * Prebuilt enterprise source-connector catalog.
 *
 * Provides:
 *   1. Vendor-specific connector definitions (Dynamics 365, Salesforce, Workday, Snowflake, SAP, Azure SQL)
 *   2. AzureAD / OAuth2 auth schemes beyond basic client-credentials
 *   3. Managed egress policies (allowlists, proxy rules, on-prem agent proxy)
 *   4. Connector catalog service (browse, configure, validate, instantiate)
 */

/** Connector configuration (mirrors sync ConnectorConfig for catalog templates). */
export interface ConnectorConfig {
  /** JDBC-style connection URL or equivalent. */
  url: string;
  /** Source table to connect to. */
  table: string;
  /** Additional connector-specific properties. */
  properties?: Record<string, unknown>;
}

// ===========================================================================
// Auth schemes
// ===========================================================================

/** AzureAD OAuth2 client-credentials auth scheme. */
export interface AzureAdAuth {
  type: 'azuread';
  /** Azure AD tenant ID. */
  tenantId: string;
  /** Application (client) ID. */
  clientId: string;
  /** Application client secret. */
  clientSecret: string;
  /** Resource/scope being requested (e.g. https://graph.microsoft.com/.default). */
  scope?: string;
  /** Azure AD endpoint version. */
  endpointVersion?: 'v1.0' | 'v2.0';
}

/** OAuth2 authorization-code auth scheme (for interactive grants). */
export interface OAuth2AuthCodeAuth {
  type: 'oauth2-authcode';
  /** Authorization endpoint. */
  authUrl: string;
  /** Token endpoint. */
  tokenUrl: string;
  /** Client ID. */
  clientId: string;
  /** Client secret. */
  clientSecret: string;
  /** Redirect URI. */
  redirectUri: string;
  /** Scopes. */
  scopes?: string[];
  /** Refresh token (if pre-obtained). */
  refreshToken?: string;
}

/** API-key auth scheme. */
export interface ApiKeyAuth {
  type: 'api-key';
  /** Header name for the API key (default: X-API-Key). */
  headerName?: string;
  /** API key value. */
  apiKey: string;
}

/** Managed-identity auth (Azure system-assigned or user-assigned). */
export interface ManagedIdentityAuth {
  type: 'managed-identity';
  /** Azure resource endpoint for token acquisition. */
  resource: string;
  /** User-assigned identity client ID (if user-assigned). */
  clientId?: string;
}

/** Union of all supported auth schemes. */
export type EnterpriseAuthScheme =
  | AzureAdAuth
  | OAuth2AuthCodeAuth
  | ApiKeyAuth
  | ManagedIdentityAuth
  | { type: 'basic'; username: string; password: string }
  | { type: 'bearer'; token: string }
  | { type: 'none' };

// ===========================================================================
// Managed egress policies
// ===========================================================================

/** A managed egress policy — controls where connectors can send/receive data. */
export interface EgressPolicy {
  id: string;
  tenantId: string;
  /** Policy name. */
  name: string;
  description: string;
  /** Allowed egress host patterns (glob, e.g. *.dynamics.com, *.salesforce.com). */
  allowedHosts: string[];
  /** Denied egress host patterns. */
  deniedHosts: string[];
  /** Whether on-prem agent proxy is required. */
  requireOnPremProxy: boolean;
  /** On-prem agent proxy configuration. */
  onPremProxy?: {
    /** Proxy endpoint URL. */
    proxyUrl: string;
    /** Proxy auth token. */
    proxyToken?: string;
    /** Network zone the proxy serves. */
    networkZone?: string;
  };
  /** Max egress throughput in MB/s. */
  maxThroughputMbps?: number;
  /** Whether HTTPS is required. */
  requireTls: boolean;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** Who created the policy. */
  createdBy: string;
  /** Whether the policy is enabled. */
  enabled: boolean;
}

/** Input for creating an egress policy. */
export interface CreateEgressPolicyInput {
  name: string;
  description?: string;
  allowedHosts: string[];
  deniedHosts?: string[];
  requireOnPremProxy?: boolean;
  onPremProxy?: EgressPolicy['onPremProxy'];
  maxThroughputMbps?: number;
  requireTls?: boolean;
}

/** Result of validating a connector config against egress policies. */
export interface EgressValidationResult {
  allowed: boolean;
  /** The matched policy (if any). */
  matchedPolicy?: EgressPolicy;
  /** Reasons for denial (if not allowed). */
  denialReasons: string[];
  /** Whether on-prem proxy is required but not configured. */
  proxyRequired: boolean;
}

// ===========================================================================
// Vendor connector catalog entries
// ===========================================================================

/** A prebuilt vendor connector definition. */
export interface VendorConnectorEntry {
  /** Unique connector ID (e.g. 'dynamics-365-bc'). */
  id: string;
  /** Display name. */
  name: string;
  /** Vendor (e.g. Microsoft, Salesforce, Workday). */
  vendor: string;
  /** Product name (e.g. Dynamics 365 Business Central). */
  product: string;
  /** Short description. */
  description: string;
  /** Supported auth schemes. */
  supportedAuthSchemes: Array<EnterpriseAuthScheme['type']>;
  /** Default auth scheme. */
  defaultAuthScheme: EnterpriseAuthScheme['type'];
  /** Connector kind (rest, jdbc, custom). */
  connectorKind: 'rest' | 'jdbc' | 'custom';
  /** Default connector config template. */
  configTemplate: Partial<ConnectorConfig>;
  /** Default egress host pattern. */
  defaultEgressHost: string;
  /** Whether on-prem agent proxy is supported. */
  supportsOnPremProxy: boolean;
  /** Connector version. */
  version: string;
  /** Whether the connector is generally available. */
  generallyAvailable: boolean;
  /** Documentation URL (optional). */
  documentationUrl?: string;
}

// ===========================================================================
// Connector catalog service
// ===========================================================================

/** A configured connector instance (saved configuration). */
export interface ConfiguredConnector {
  id: string;
  tenantId: string;
  /** Vendor connector ID from the catalog. */
  vendorConnectorId: string;
  /** Instance name (unique within tenant). */
  instanceName: string;
  /** Resolved connector config (with secrets env-indirected). */
  config: ConnectorConfig;
  /** Auth scheme. */
  auth: EnterpriseAuthScheme;
  /** Egress policy ID. */
  egressPolicyId?: string;
  /** Whether the connector is enabled. */
  enabled: boolean;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last update timestamp. */
  updatedAt: string;
  /** Who created the connector. */
  createdBy: string;
  /** Last validation result. */
  lastValidation?: EgressValidationResult;
}

/** Input for configuring a connector. */
export interface ConfigureConnectorInput {
  vendorConnectorId: string;
  instanceName: string;
  config: ConnectorConfig;
  auth: EnterpriseAuthScheme;
  egressPolicyId?: string;
  enabled?: boolean;
}

/**
 * Enterprise connector catalog service — browse prebuilt vendor connectors,
 * configure instances, validate against egress policies, and manage auth.
 */
export interface ConnectorCatalogService {
  // ── Catalog browsing ──
  listCatalog(ctx: RequestContext, vendor?: string): Promise<VendorConnectorEntry[]>;
  getCatalogEntry(ctx: RequestContext, id: string): Promise<VendorConnectorEntry | null>;
  listVendors(ctx: RequestContext): Promise<string[]>;

  // ── Connector configuration ──
  configure(ctx: RequestContext, input: ConfigureConnectorInput): Promise<ConfiguredConnector>;
  getConfigured(ctx: RequestContext, instanceName: string): Promise<ConfiguredConnector | null>;
  listConfigured(ctx: RequestContext): Promise<ConfiguredConnector[]>;
  updateConfigured(ctx: RequestContext, instanceName: string, updates: Partial<ConfigureConnectorInput>): Promise<ConfiguredConnector>;
  deleteConfigured(ctx: RequestContext, instanceName: string): Promise<void>;
  validateConfigured(ctx: RequestContext, instanceName: string): Promise<EgressValidationResult>;

  // ── Egress policies ──
  createEgressPolicy(ctx: RequestContext, input: CreateEgressPolicyInput): Promise<EgressPolicy>;
  getEgressPolicy(ctx: RequestContext, id: string): Promise<EgressPolicy | null>;
  listEgressPolicies(ctx: RequestContext): Promise<EgressPolicy[]>;
  updateEgressPolicy(ctx: RequestContext, id: string, updates: Partial<CreateEgressPolicyInput>): Promise<EgressPolicy>;
  deleteEgressPolicy(ctx: RequestContext, id: string): Promise<void>;
  validateEgress(ctx: RequestContext, host: string, policyId?: string): Promise<EgressValidationResult>;
}

// Re-export RequestContext for convenience
import type { RequestContext } from './ontology.js';
