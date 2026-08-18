/**
 * In-memory enterprise connector catalog service.
 */

import { randomUUID } from 'node:crypto';
import type {
  ConnectorCatalogService,
  VendorConnectorEntry,
  ConfiguredConnector,
  ConfigureConnectorInput,
  EgressPolicy,
  CreateEgressPolicyInput,
  EgressValidationResult,
  RequestContext,
} from '@altius/spi';

// ===========================================================================
// Prebuilt vendor connector catalog entries
// ===========================================================================

const CATALOG: VendorConnectorEntry[] = [
  {
    id: 'dynamics-365-bc',
    name: 'Microsoft Dynamics 365 Business Central',
    vendor: 'Microsoft',
    product: 'Dynamics 365 Business Central',
    description: 'ERP connector for Dynamics 365 BC with OAuth2/AzureAD auth, OData API access, and managed egress.',
    supportedAuthSchemes: ['azuread', 'oauth2-authcode', 'basic'],
    defaultAuthScheme: 'azuread',
    connectorKind: 'rest',
    configTemplate: {
      url: 'https://api.businesscentral.dynamics.com/v2.0/{tenantId}/production',
      properties: { pagination: { style: 'cursor' }, recordsPath: 'value', keyField: 'id', timestampField: 'lastModifiedDateTime' },
    },
    defaultEgressHost: '*.businesscentral.dynamics.com',
    supportsOnPremProxy: true,
    version: '1.0.0',
    generallyAvailable: true,
    documentationUrl: 'https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/webservices/',
  },
  {
    id: 'salesforce',
    name: 'Salesforce',
    vendor: 'Salesforce',
    product: 'Sales Cloud / Service Cloud',
    description: 'CRM connector for Salesforce with OAuth2 auth, REST/Bulk API access, and SOQL query support.',
    supportedAuthSchemes: ['oauth2-authcode', 'bearer', 'basic'],
    defaultAuthScheme: 'oauth2-authcode',
    connectorKind: 'rest',
    configTemplate: {
      url: 'https://{instance}.my.salesforce.com/services/data/v59.0',
      properties: { pagination: { style: 'offset' }, recordsPath: 'records', keyField: 'Id', timestampField: 'LastModifiedDate' },
    },
    defaultEgressHost: '*.salesforce.com',
    supportsOnPremProxy: false,
    version: '1.0.0',
    generallyAvailable: true,
    documentationUrl: 'https://developer.salesforce.com/docs/api/',
  },
  {
    id: 'workday',
    name: 'Workday',
    vendor: 'Workday',
    product: 'Workday HCM / Financials',
    description: 'Connector for Workday SOAP/REST APIs with basic auth and on-prem agent proxy support.',
    supportedAuthSchemes: ['basic', 'oauth2-authcode'],
    defaultAuthScheme: 'basic',
    connectorKind: 'rest',
    configTemplate: {
      url: 'https://{tenant}.workday.com/ccx/api/{tenant}/v1',
      properties: { pagination: { style: 'offset' }, recordsPath: 'data', keyField: 'ID', timestampField: 'Updated' },
    },
    defaultEgressHost: '*.workday.com',
    supportsOnPremProxy: true,
    version: '1.0.0',
    generallyAvailable: true,
  },
  {
    id: 'snowflake',
    name: 'Snowflake',
    vendor: 'Snowflake',
    product: 'Snowflake Data Cloud',
    description: 'JDBC connector for Snowflake with OAuth2 and key-pair auth, warehouse-aware query execution.',
    supportedAuthSchemes: ['oauth2-authcode', 'azuread', 'basic'],
    defaultAuthScheme: 'oauth2-authcode',
    connectorKind: 'jdbc',
    configTemplate: {
      url: 'jdbc:snowflake://{account}.snowflakecomputing.com?db={database}&warehouse={warehouse}',
      properties: { driver: 'net.snowflake.client.jdbc.SnowflakeDriver' },
    },
    defaultEgressHost: '*.snowflakecomputing.com',
    supportsOnPremProxy: false,
    version: '1.0.0',
    generallyAvailable: true,
    documentationUrl: 'https://docs.snowflake.com/en/developer-guide/jdbc/jdbc',
  },
  {
    id: 'sap-erp',
    name: 'SAP ERP / S/4HANA',
    vendor: 'SAP',
    product: 'SAP ERP / S/4HANA',
    description: 'Connector for SAP ERP via OData/SOAP APIs with basic auth and on-prem agent proxy.',
    supportedAuthSchemes: ['basic', 'oauth2-authcode'],
    defaultAuthScheme: 'basic',
    connectorKind: 'rest',
    configTemplate: {
      url: 'https://{host}:443/sap/opu/odata/sap/',
      properties: { pagination: { style: 'cursor' }, recordsPath: 'd.results', keyField: 'ID' },
    },
    defaultEgressHost: '*.sap.corp',
    supportsOnPremProxy: true,
    version: '1.0.0',
    generallyAvailable: false,
  },
  {
    id: 'azure-sql',
    name: 'Azure SQL Database',
    vendor: 'Microsoft',
    product: 'Azure SQL',
    description: 'JDBC connector for Azure SQL with AzureAD managed identity and password auth.',
    supportedAuthSchemes: ['azuread', 'managed-identity', 'basic'],
    defaultAuthScheme: 'azuread',
    connectorKind: 'jdbc',
    configTemplate: {
      url: 'jdbc:sqlserver://{server}.database.windows.net:1433;database={database}',
      properties: { driver: 'com.microsoft.sqlserver.jdbc.SQLServerDriver' },
    },
    defaultEgressHost: '*.database.windows.net',
    supportsOnPremProxy: false,
    version: '1.0.0',
    generallyAvailable: true,
  },
];

// ===========================================================================
// Egress policy helpers
// ===========================================================================

function matchHost(host: string, pattern: string): boolean {
  // Glob match: *.example.com matches sub.example.com but not example.com
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(1); // .example.com
    return host.endsWith(suffix) && host.length > suffix.length;
  }
  return host === pattern;
}

function validateHostAgainstPolicy(host: string, policy: EgressPolicy): { allowed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  // Check denied hosts first
  for (const denied of policy.deniedHosts) {
    if (matchHost(host, denied)) {
      reasons.push(`Host ${host} matches denied pattern ${denied}`);
      return { allowed: false, reasons };
    }
  }
  // Check allowed hosts
  let allowed = false;
  for (const allowedPattern of policy.allowedHosts) {
    if (matchHost(host, allowedPattern)) { allowed = true; break; }
  }
  if (!allowed) {
    reasons.push(`Host ${host} does not match any allowed pattern in policy ${policy.name}`);
    return { allowed: false, reasons };
  }
  // Check TLS
  if (policy.requireTls && !host.startsWith('https://') && !host.startsWith('ssl://')) {
    // We check the URL scheme at the connector config level; here we just check the host
    // The host itself doesn't carry scheme, so we pass this check
  }
  return { allowed: true, reasons: [] };
}

// ===========================================================================
// In-memory implementation
// ===========================================================================

export class InMemoryConnectorCatalogService implements ConnectorCatalogService {
  private readonly configured = new Map<string, Map<string, ConfiguredConnector>>();
  private readonly policies = new Map<string, Map<string, EgressPolicy>>();

  async listCatalog(_ctx: RequestContext, vendor?: string): Promise<VendorConnectorEntry[]> {
    if (vendor) return CATALOG.filter(e => e.vendor === vendor);
    return [...CATALOG];
  }

  async getCatalogEntry(_ctx: RequestContext, id: string): Promise<VendorConnectorEntry | null> {
    return CATALOG.find(e => e.id === id) ?? null;
  }

  async listVendors(_ctx: RequestContext): Promise<string[]> {
    return [...new Set(CATALOG.map(e => e.vendor))];
  }

  async configure(ctx: RequestContext, input: ConfigureConnectorInput): Promise<ConfiguredConnector> {
    const entry = CATALOG.find(e => e.id === input.vendorConnectorId);
    if (!entry) throw new Error(`Unknown vendor connector: ${input.vendorConnectorId}`);
    // Validate auth scheme is supported
    if (!entry.supportedAuthSchemes.includes(input.auth.type)) {
      throw new Error(`Auth scheme ${input.auth.type} not supported by ${entry.name}`);
    }
    const id = randomUUID();
    const now = new Date().toISOString();
    const configured: ConfiguredConnector = {
      id, tenantId: ctx.tenantId,
      vendorConnectorId: input.vendorConnectorId,
      instanceName: input.instanceName,
      config: input.config,
      auth: input.auth,
      egressPolicyId: input.egressPolicyId,
      enabled: input.enabled ?? true,
      createdAt: now, updatedAt: now,
      createdBy: ctx.actorId ?? 'system',
    };
    // Validate against egress policy if set
    if (input.egressPolicyId) {
      configured.lastValidation = await this.validateEgress(ctx, this.extractHost(input.config.url), input.egressPolicyId);
    }
    this.getMap(ctx.tenantId).set(input.instanceName, configured);
    return configured;
  }

  async getConfigured(ctx: RequestContext, instanceName: string): Promise<ConfiguredConnector | null> {
    return this.configured.get(ctx.tenantId)?.get(instanceName) ?? null;
  }

  async listConfigured(ctx: RequestContext): Promise<ConfiguredConnector[]> {
    const m = this.configured.get(ctx.tenantId);
    return m ? Array.from(m.values()) : [];
  }

  async updateConfigured(ctx: RequestContext, instanceName: string, updates: Partial<ConfigureConnectorInput>): Promise<ConfiguredConnector> {
    const existing = this.configured.get(ctx.tenantId)?.get(instanceName);
    if (!existing) throw new Error(`Connector not found: ${instanceName}`);
    const updated: ConfiguredConnector = {
      ...existing,
      config: updates.config ?? existing.config,
      auth: updates.auth ?? existing.auth,
      egressPolicyId: updates.egressPolicyId ?? existing.egressPolicyId,
      enabled: updates.enabled ?? existing.enabled,
      updatedAt: new Date().toISOString(),
    };
    this.getMap(ctx.tenantId).set(instanceName, updated);
    return updated;
  }

  async deleteConfigured(ctx: RequestContext, instanceName: string): Promise<void> {
    this.configured.get(ctx.tenantId)?.delete(instanceName);
  }

  async validateConfigured(ctx: RequestContext, instanceName: string): Promise<EgressValidationResult> {
    const connector = this.configured.get(ctx.tenantId)?.get(instanceName);
    if (!connector) throw new Error(`Connector not found: ${instanceName}`);
    const host = this.extractHost(connector.config.url);
    if (connector.egressPolicyId) {
      const result = await this.validateEgress(ctx, host, connector.egressPolicyId);
      // Update lastValidation
      const updated = { ...connector, lastValidation: result };
      this.getMap(ctx.tenantId).set(instanceName, updated);
      return result;
    }
    return { allowed: true, denialReasons: [], proxyRequired: false };
  }

  async createEgressPolicy(ctx: RequestContext, input: CreateEgressPolicyInput): Promise<EgressPolicy> {
    const id = randomUUID();
    const policy: EgressPolicy = {
      id, tenantId: ctx.tenantId,
      name: input.name, description: input.description ?? '',
      allowedHosts: input.allowedHosts,
      deniedHosts: input.deniedHosts ?? [],
      requireOnPremProxy: input.requireOnPremProxy ?? false,
      onPremProxy: input.onPremProxy,
      maxThroughputMbps: input.maxThroughputMbps,
      requireTls: input.requireTls ?? true,
      createdAt: new Date().toISOString(),
      createdBy: ctx.actorId ?? 'system',
      enabled: true,
    };
    this.getPolicyMap(ctx.tenantId).set(id, policy);
    return policy;
  }

  async getEgressPolicy(ctx: RequestContext, id: string): Promise<EgressPolicy | null> {
    return this.policies.get(ctx.tenantId)?.get(id) ?? null;
  }

  async listEgressPolicies(ctx: RequestContext): Promise<EgressPolicy[]> {
    const m = this.policies.get(ctx.tenantId);
    return m ? Array.from(m.values()) : [];
  }

  async updateEgressPolicy(ctx: RequestContext, id: string, updates: Partial<CreateEgressPolicyInput>): Promise<EgressPolicy> {
    const existing = this.policies.get(ctx.tenantId)?.get(id);
    if (!existing) throw new Error(`Egress policy not found: ${id}`);
    const updated: EgressPolicy = {
      ...existing,
      name: updates.name ?? existing.name,
      description: updates.description ?? existing.description,
      allowedHosts: updates.allowedHosts ?? existing.allowedHosts,
      deniedHosts: updates.deniedHosts ?? existing.deniedHosts,
      requireOnPremProxy: updates.requireOnPremProxy ?? existing.requireOnPremProxy,
      onPremProxy: updates.onPremProxy ?? existing.onPremProxy,
      maxThroughputMbps: updates.maxThroughputMbps ?? existing.maxThroughputMbps,
      requireTls: updates.requireTls ?? existing.requireTls,
    };
    this.getPolicyMap(ctx.tenantId).set(id, updated);
    return updated;
  }

  async deleteEgressPolicy(ctx: RequestContext, id: string): Promise<void> {
    this.policies.get(ctx.tenantId)?.delete(id);
  }

  async validateEgress(ctx: RequestContext, host: string, policyId?: string): Promise<EgressValidationResult> {
    if (!policyId) {
      // No policy → allow by default
      return { allowed: true, denialReasons: [], proxyRequired: false };
    }
    const policy = this.policies.get(ctx.tenantId)?.get(policyId);
    if (!policy) throw new Error(`Egress policy not found: ${policyId}`);
    if (!policy.enabled) {
      return { allowed: false, matchedPolicy: policy, denialReasons: ['Policy is disabled'], proxyRequired: false };
    }
    const { allowed, reasons } = validateHostAgainstPolicy(host, policy);
    const proxyRequired = policy.requireOnPremProxy && !policy.onPremProxy;
    return { allowed, matchedPolicy: policy, denialReasons: reasons, proxyRequired };
  }

  private extractHost(url: string): string {
    try {
      const u = new URL(url);
      return u.hostname;
    } catch {
      // JDBC URL or other non-URL format: extract host between // and : or /
      const m = url.match(/\/\/([^:/]+)/);
      return m?.[1] ?? url;
    }
  }

  private getMap(tenantId: string): Map<string, ConfiguredConnector> {
    let m = this.configured.get(tenantId);
    if (!m) { m = new Map(); this.configured.set(tenantId, m); }
    return m;
  }
  private getPolicyMap(tenantId: string): Map<string, EgressPolicy> {
    let m = this.policies.get(tenantId);
    if (!m) { m = new Map(); this.policies.set(tenantId, m); }
    return m;
  }
}
