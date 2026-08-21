import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { deriveBrowsableTypes, ObjectBrowserScreen } from '../components/ObjectBrowserScreen.js';

// Real introspection reports a scalar's kind as 'SCALAR' (the name is separate).
const scalar = (name: string) => ({ name: null, kind: 'NON_NULL', ofType: { name, kind: 'SCALAR', ofType: null } });

const INTROSPECTION = {
  __schema: {
    queryType: {
      fields: [
        { name: 'patients', type: { name: null, kind: 'NON_NULL', ofType: { name: 'PatientConnection', kind: 'OBJECT', ofType: null } } },
        { name: 'wards', type: { name: 'WardConnection', kind: 'OBJECT', ofType: null } },
        // Not a list query — must be ignored.
        { name: 'patient', type: { name: 'Patient', kind: 'OBJECT', ofType: null } },
      ],
    },
    types: [
      {
        name: 'Patient', kind: 'OBJECT',
        fields: [
          { name: 'nhsNumber', type: scalar('String') },
          { name: 'status', type: { name: null, kind: 'NON_NULL', ofType: { name: 'PatientStatus', kind: 'ENUM', ofType: null } } },
          { name: 'id', type: scalar('ID') },
          { name: 'ward', type: { name: 'Ward', kind: 'OBJECT', ofType: null } }, // link, skipped from columns
        ],
      },
      { name: 'Ward', kind: 'OBJECT', fields: [{ name: 'name', type: scalar('String') }] },
    ],
  },
};

describe('deriveBrowsableTypes', () => {
  it('maps <Type>Connection query fields to browsable types with scalar/enum columns', () => {
    const derived = deriveBrowsableTypes(INTROSPECTION as never);
    expect(derived.map(d => d.typeName)).toEqual(['Patient', 'Ward']); // sorted, non-list ignored
    const patient = derived.find(d => d.typeName === 'Patient')!;
    expect(patient.listField).toBe('patients');
    // Scalars/enums only; system and link fields excluded.
    expect(patient.scalarFields).toEqual(['nhsNumber', 'status', 'id']);
    expect(patient.keyField).toBe('id');
  });
});

describe('ObjectBrowserScreen', () => {
  afterEach(() => vi.restoreAllMocks());

  it('discovers types and lists the first one', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      if (String(body.query).includes('__schema')) {
        return { ok: true, json: async () => ({ data: INTROSPECTION }) } as unknown as Response;
      }
      // The dynamic list query for Patient.
      return {
        ok: true,
        json: async () => ({
          data: {
            patients: {
              totalCount: 1,
              pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: 'c', endCursor: 'c' },
              edges: [{ cursor: 'c', node: { id: 'p1', _redactedFields: null, _consentRestricted: false, nhsNumber: '999', status: 'ADMITTED' } }],
            },
          },
        }),
      } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ObjectBrowserScreen endpoint="/graphql" getToken={null} onRowClick={() => {}} />);

    // Type nav appears for every list-backed object type.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Patient' })).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Ward' })).toBeTruthy();
    // The first type's rows load into the table.
    await waitFor(() => expect(screen.getByText('999')).toBeTruthy());
    expect(screen.getByText('ADMITTED')).toBeTruthy();
  });
});
