/**
 * Platform governance GraphQL types — scoped sessions and agent holds.
 *
 * These types are NOT generated from ODL (they are platform-level governance
 * surfaces, not ontology objects). They are appended to the generated SDL
 * and their resolvers are merged into the Query/Mutation objects.
 *
 * Authorization: role-gated (scopedSessionAdminRoles / agentHoldApproverRoles),
 * tenant-scoped from the caller's token. Fail closed: empty roles = nobody.
 */

/** SDL for scoped sessions and agent holds. */
export const GOVERNANCE_SDL = `
# Scoped session — time-boxed restriction of a caller's effective markings.
# Created by an admin for a user; the auth funnel intersects the caller's
# token-claim markings with the active session's allowedMarkings on every
# request (REST/GraphQL/CDM/FHIR/MCP).
type ScopedSession {
  id: ID!
  userId: String!
  allowedMarkings: [String!]!
  excludedMarkings: [String!]!
  label: String
  revoked: Boolean!
  createdAt: String!
  expiresAt: String!
}

# Agent hold — a high-risk agent action held for human approval.
type AgentHold {
  id: ID!
  actionName: String!
  riskLevel: String!
  status: String!
  agentId: String!
  tenantId: String
  createdAt: String!
  expiresAt: String!
  decidedAt: String
  decidedBy: String
  reason: String
}

extend type Query {
  # List the caller's own active scoped sessions (tenant-scoped).
  myScopedSessions: [ScopedSession!]!

  # List agent holds for the caller's tenant (approver-gated).
  agentHolds(status: String): [AgentHold!]!

  # Get a single agent hold by ID (approver-gated, tenant-scoped).
  agentHold(id: ID!): AgentHold
}

extend type Mutation {
  # Create a scoped session for a user (admin-gated).
  createScopedSession(
    userId: String!
    allowedMarkings: [String!]!
    excludedMarkings: [String!]
    label: String
    durationSeconds: Int!
  ): ScopedSession!

  # Revoke a scoped session (admin-gated).
  revokeScopedSession(id: ID!): ScopedSession!

  # Approve an agent hold (approver-gated, tenant-scoped).
  approveAgentHold(id: ID!): AgentHold!

  # Reject an agent hold (approver-gated, tenant-scoped).
  rejectAgentHold(id: ID!, reason: String): AgentHold!
}
`;
