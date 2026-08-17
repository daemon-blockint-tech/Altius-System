/**
 * Consent & permissions screen — view and manage consent records and
 * relationship grants.
 *
 * Uses the GraphQL mutations `recordConsent` and `grantRelationship`/
 * `revokeRelationship` to manage consent and care-team relationships.
 * Also lists existing consent records via a direct GraphQL query.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface ConsentRecord {
  subject: string;
  purpose: string | null;
  decision: string;
  recordedAt: string;
  recordedBy: string;
}

export interface ConsentPermissionsScreenProps {
  endpoint: string;
  getToken: (() => Promise<string>) | null;
}

export function ConsentPermissionsScreen({ endpoint, getToken }: ConsentPermissionsScreenProps): ReactNode {
  const [records, setRecords] = useState<ConsentRecord[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [grantSubject, setGrantSubject] = useState('');
  const [grantRelation, setGrantRelation] = useState('viewer');
  const [grantTarget, setGrantTarget] = useState('');
  const [grantResult, setGrantResult] = useState<string | null>(null);
  const ticket = useRef(0);

  const fetchRecords = useCallback(async () => {
    const mine = ++ticket.current;
    setStatus('loading');
    try {
      const token = getToken ? await getToken() : '';
      // Query consent records via GraphQL — the audit trail includes consent decisions
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          query: `query { auditRecords(filter: { operationType: "CONSENT" }, limit: 50, offset: 0) { records { id timestamp traceId actor { id roles } operation { type objectId } detail { consentDecision } } totalCount hasMore } }`,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = (await response.json()) as { data?: { auditRecords?: { records: unknown[] } }; errors?: unknown[] };
      if (json.errors) throw new Error(JSON.stringify(json.errors));
      const recs = (json.data?.auditRecords?.records ?? []).map((r: unknown) => {
        const record = r as Record<string, unknown>;
        const actor = record['actor'] as Record<string, unknown>;
        const op = record['operation'] as Record<string, unknown>;
        const detail = record['detail'] as Record<string, unknown> | null;
        return {
          subject: String(op['objectId'] ?? '—'),
          purpose: null,
          decision: String(detail?.['consentDecision'] ?? '—'),
          recordedAt: String(record['timestamp'] ?? ''),
          recordedBy: String(actor['id'] ?? '—'),
        } satisfies ConsentRecord;
      });
      if (mine !== ticket.current) return;
      setRecords(recs);
      setStatus('ready');
    } catch (err) {
      if (mine !== ticket.current) return;
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, [endpoint, getToken]);

  useEffect(() => { void fetchRecords(); }, [fetchRecords]);

  const handleGrant = async () => {
    setGrantResult(null);
    try {
      const token = getToken ? await getToken() : '';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          query: `mutation($input: RelationshipInput!) { grantRelationship(input: $input) { success errors { code message } } }`,
          variables: { input: { subject: grantSubject, relation: grantRelation, target: grantTarget } },
        }),
      });
      const json = (await response.json()) as { data?: { grantRelationship?: { success: boolean; errors?: Array<{ message: string }> } }; errors?: unknown[] };
      if (json.errors) throw new Error(JSON.stringify(json.errors));
      const result = json.data?.grantRelationship;
      if (result?.success) {
        setGrantResult('Grant recorded successfully.');
        setGrantSubject(''); setGrantTarget('');
      } else {
        setGrantResult(`Failed: ${result?.errors?.map(e => e.message).join(', ') ?? 'unknown error'}`);
      }
    } catch (err) {
      setGrantResult(err instanceof Error ? err.message : String(err));
    }
  };

  if (status === 'error') {
    return (
      <main className="ed-main">
        <header className="ed-main__header">
          <span className="ed-main__eyebrow">GOVERNANCE · CONSENT</span>
          <h1 className="ed-main__title">Consent & permissions</h1>
        </header>
        <div role="alert"><p>{error}</p><button type="button" onClick={() => void fetchRecords()}>Retry</button></div>
      </main>
    );
  }

  return (
    <main className="ed-main">
      <header className="ed-main__header">
        <span className="ed-main__eyebrow">GOVERNANCE · CONSENT</span>
        <h1 className="ed-main__title">Consent & permissions</h1>
        <p className="ed-main__lede">
          View consent decisions and manage relationship grants. Grants are FGA-enforced —
          a grant here is what makes an object visible to the grantee.
        </p>
      </header>

      <div style={{ padding: '0 44px 40px' }}>
        <h2 style={{ fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
          Grant relationship
        </h2>
        <div className="ed-filter-bar" style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap', marginBottom: 16 }}>
          <label>
            Subject (user ID)
            <input type="text" value={grantSubject} onChange={(e) => setGrantSubject(e.target.value)} placeholder="user:alice" />
          </label>
          <label>
            Relation
            <input type="text" value={grantRelation} onChange={(e) => setGrantRelation(e.target.value)} placeholder="viewer" />
          </label>
          <label>
            Target (object)
            <input type="text" value={grantTarget} onChange={(e) => setGrantTarget(e.target.value)} placeholder="Patient:123" />
          </label>
          <button type="button" onClick={() => void handleGrant()}>Grant</button>
        </div>
        {grantResult && <p aria-live="polite">{grantResult}</p>}

        <h2 style={{ fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '24px 0 12px' }}>
          Consent decisions ({records.length})
        </h2>
        {status === 'loading' && <p aria-live="polite">Loading…</p>}
        {records.length > 0 && (
          <table>
            <thead>
              <tr>
                <th scope="col">Subject</th>
                <th scope="col">Decision</th>
                <th scope="col">Recorded by</th>
                <th scope="col">Time</th>
              </tr>
            </thead>
            <tbody>
              {records.map((rec, i) => (
                <tr key={i}>
                  <td><code>{rec.subject}</code></td>
                  <td><span className="ed-status-badge" data-tone={rec.decision === 'DENY' ? 'lost' : 'delivered'}>{rec.decision}</span></td>
                  <td>{rec.recordedBy}</td>
                  <td>{rec.recordedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {status === 'ready' && records.length === 0 && <p style={{ opacity: 0.5 }}>No consent records found.</p>}
      </div>
    </main>
  );
}
