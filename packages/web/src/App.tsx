import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { ObjectTable } from './components/ObjectTable.js';
import { createClient, readConfig } from './client.js';

/**
 * Patient worklist — the first real view.
 *
 * `load` is handed straight to the generated SDK method, so the table talks to
 * the same governed GraphQL surface as every other client: FGA-filtered,
 * field-redacted and consent-gated server-side. The UI adds no data access of
 * its own, which is what keeps the permission model in one place.
 */
export function App(): ReactNode {
  const client = useMemo(() => createClient(readConfig(import.meta.env)), []);

  return (
    <main>
      <h1>Altius</h1>
      <ObjectTable
        caption="Patients"
        columns={[
          { key: 'nhsNumber', header: 'NHS number' },
          { key: 'name', header: 'Name' },
          { key: 'status', header: 'Status' },
          { key: 'triageCategory', header: 'Triage' },
        ]}
        load={({ first, after }) => client.patient.list(undefined, after === undefined ? { first } : { first, after })}
      />
    </main>
  );
}
