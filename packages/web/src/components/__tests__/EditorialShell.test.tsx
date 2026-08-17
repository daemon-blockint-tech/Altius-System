/**
 * Tests for the EditorialShell, GovernanceRail, TraceBar, and FacilitiesScreen
 * components.
 *
 * These tests verify the shell chrome renders correctly and that user
 * interactions (job selection, pack switching, role switching, filter
 * removal) fire the expected callbacks. The FacilitiesScreen is tested
 * with a mocked SDK client to verify data loading and rendering.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditorialShell } from '../EditorialShell.js';
import type { JobGroup, PackOption, RoleOption } from '../EditorialShell.js';
import { GovernanceRail } from '../GovernanceRail.js';
import { TraceBar, PIPELINE_STAGES } from '../TraceBar.js';
import type { TraceState } from '../TraceBar.js';
import { FacilitiesScreen } from '../FacilitiesScreen.js';
import type { Facility, FacilityConnection } from '@altius/sdk';
import type { Altius } from '@altius/sdk';

// The SDK opens a WebSocket on subscribe; jsdom has no implementation.
vi.stubGlobal('WebSocket', class {
  close(): void {}
  addEventListener(): void {}
  send(): void {}
  readyState = 0;
  static readonly OPEN = 1;
  static readonly CONNECTING = 0;
});

const PACKS: PackOption[] = [
  { id: 'supply-chain', name: 'supply.chain', version: '0.1.0' },
  { id: 'nhs-acute', name: 'nhs.acute', version: '0.1.0' },
];

const JOBS: JobGroup[] = [
  {
    key: 'OP',
    label: 'Operate',
    screens: [
      { id: 'facilities', label: 'Facilities', count: 41 },
      { id: 'shipments', label: 'Shipments', count: 2184 },
    ],
  },
  {
    key: 'IN',
    label: 'Investigate',
    screens: [{ id: 'audit-trail', label: 'Audit trail' }],
  },
];

const ROLES: RoleOption[] = [
  { id: 'warehouse_manager', label: 'Warehouse manager' },
  { id: 'logistics_manager', label: 'Logistics manager' },
];

const TRACE: TraceState = {
  activeStage: 'emit',
  durationMs: 41,
  auditId: '01JQ4Z…7KP',
  traceId: '4f2a…9c1',
};

// ── EditorialShell ────────────────────────────────────────────

describe('EditorialShell', () => {
  it('renders the brand mark and job codes', () => {
    render(
      <EditorialShell
        packs={PACKS}
        activePack="supply-chain"
        onPackChange={() => {}}
        jobs={JOBS}
        activeJob="OP"
        activeScreen="facilities"
        onScreenSelect={() => {}}
        roles={ROLES}
        activeRole="warehouse_manager"
        onRoleChange={() => {}}
        brand="SC"
        userInitials="JO"
        principal={{ name: 'Test', email: 't@e.com', tenant: 't1', sub: 's1', relationsSummary: 'none' }}
        hidden={[]}
        events={[]}
        feedLive={true}
        trace={TRACE}
      >
        <div>main content</div>
      </EditorialShell>,
    );

    expect(screen.getByText('SC')).toBeDefined();
    expect(screen.getByLabelText('Operate')).toBeDefined();
    expect(screen.getByLabelText('Investigate')).toBeDefined();
    expect(screen.getByText('main content')).toBeDefined();
  });

  it('calls onScreenSelect when a job is clicked', () => {
    const onSelect = vi.fn();
    render(
      <EditorialShell
        packs={PACKS}
        activePack="supply-chain"
        onPackChange={() => {}}
        jobs={JOBS}
        activeJob="OP"
        activeScreen="facilities"
        onScreenSelect={onSelect}
        roles={ROLES}
        activeRole="warehouse_manager"
        onRoleChange={() => {}}
        brand="SC"
        userInitials="JO"
        principal={{ name: 'Test', email: 't@e.com', tenant: 't1', sub: 's1', relationsSummary: 'none' }}
        hidden={[]}
        events={[]}
        feedLive={true}
        trace={TRACE}
      >
        <div>main</div>
      </EditorialShell>,
    );

    fireEvent.click(screen.getByLabelText('Investigate'));
    expect(onSelect).toHaveBeenCalledWith('IN', 'audit-trail');
  });

  it('calls onPackChange when a pack is selected', () => {
    const onPackChange = vi.fn();
    render(
      <EditorialShell
        packs={PACKS}
        activePack="supply-chain"
        onPackChange={onPackChange}
        jobs={JOBS}
        activeJob="OP"
        activeScreen="facilities"
        onScreenSelect={() => {}}
        roles={ROLES}
        activeRole="warehouse_manager"
        onRoleChange={() => {}}
        brand="SC"
        userInitials="JO"
        principal={{ name: 'Test', email: 't@e.com', tenant: 't1', sub: 's1', relationsSummary: 'none' }}
        hidden={[]}
        events={[]}
        feedLive={true}
        trace={TRACE}
      >
        <div>main</div>
      </EditorialShell>,
    );

    fireEvent.click(screen.getByText('nhs.acute'));
    expect(onPackChange).toHaveBeenCalledWith('nhs-acute');
  });

  it('calls onRoleChange when a role is selected', () => {
    const onRoleChange = vi.fn();
    render(
      <EditorialShell
        packs={PACKS}
        activePack="supply-chain"
        onPackChange={() => {}}
        jobs={JOBS}
        activeJob="OP"
        activeScreen="facilities"
        onScreenSelect={() => {}}
        roles={ROLES}
        activeRole="warehouse_manager"
        onRoleChange={onRoleChange}
        brand="SC"
        userInitials="JO"
        principal={{ name: 'Test', email: 't@e.com', tenant: 't1', sub: 's1', relationsSummary: 'none' }}
        hidden={[]}
        events={[]}
        feedLive={true}
        trace={TRACE}
      >
        <div>main</div>
      </EditorialShell>,
    );

    // The role label text is rendered in a label element.
    fireEvent.click(screen.getByText('Logistics manager'));
    expect(onRoleChange).toHaveBeenCalledWith('logistics_manager');
  });

  it('renders the active screen with an aria-current marker', () => {
    render(
      <EditorialShell
        packs={PACKS}
        activePack="supply-chain"
        onPackChange={() => {}}
        jobs={JOBS}
        activeJob="OP"
        activeScreen="facilities"
        onScreenSelect={() => {}}
        roles={ROLES}
        activeRole="warehouse_manager"
        onRoleChange={() => {}}
        brand="SC"
        userInitials="JO"
        principal={{ name: 'Test', email: 't@e.com', tenant: 't1', sub: 's1', relationsSummary: 'none' }}
        hidden={[]}
        events={[]}
        feedLive={true}
        trace={TRACE}
      >
        <div>main</div>
      </EditorialShell>,
    );

    // The active screen link should have aria-current="page".
    const facilitiesLink = screen.getByText('Facilities').closest('a');
    expect(facilitiesLink).not.toBeNull();
    expect(facilitiesLink?.getAttribute('aria-current')).toBe('page');
  });
});

// ── GovernanceRail ────────────────────────────────────────────

describe('GovernanceRail', () => {
  it('renders the principal name and tenant', () => {
    render(
      <GovernanceRail
        principal={{
          name: 'Joy Okafor',
          email: 'j.okafor@trust.example',
          tenant: 'acme-eu',
          sub: '4f2a…9c1',
          relationsSummary: 'Holds warehouse_manager',
        }}
        hidden={[]}
        events={[]}
        live={true}
      />,
    );

    expect(screen.getByText('Joy Okafor')).toBeDefined();
    expect(screen.getByText(/acme-eu/)).toBeDefined();
  });

  it('renders hidden items with titles', () => {
    render(
      <GovernanceRail
        principal={{ name: 'Test', email: 't@e.com', tenant: 't1', sub: 's1', relationsSummary: 'none' }}
        hidden={[
          { title: '3 rows, filtered', detail: 'No assigned relation' },
          { title: '2 fields, redacted', detail: 'unitCost and currency' },
        ]}
        events={[]}
        live={true}
      />,
    );

    expect(screen.getByText('3 rows, filtered')).toBeDefined();
    expect(screen.getByText('2 fields, redacted')).toBeDefined();
  });

  it('renders events with timestamps', () => {
    render(
      <GovernanceRail
        principal={{ name: 'Test', email: 't@e.com', tenant: 't1', sub: 's1', relationsSummary: 'none' }}
        hidden={[]}
        events={[
          { time: '14:22:07', text: 'Shipment delayed' },
          { time: '14:21:58', text: 'Inventory adjusted' },
        ]}
        live={true}
      />,
    );

    expect(screen.getByText('14:22:07')).toBeDefined();
    expect(screen.getByText('Shipment delayed')).toBeDefined();
  });

  it('shows live status when live is true', () => {
    render(
      <GovernanceRail
        principal={{ name: 'Test', email: 't@e.com', tenant: 't1', sub: 's1', relationsSummary: 'none' }}
        hidden={[]}
        events={[]}
        live={true}
      />,
    );

    expect(screen.getByText('live')).toBeDefined();
  });

  it('shows paused status when live is false', () => {
    render(
      <GovernanceRail
        principal={{ name: 'Test', email: 't@e.com', tenant: 't1', sub: 's1', relationsSummary: 'none' }}
        hidden={[]}
        events={[]}
        live={false}
      />,
    );

    expect(screen.getByText('paused')).toBeDefined();
  });
});

// ── TraceBar ──────────────────────────────────────────────────

describe('TraceBar', () => {
  it('renders all pipeline stages', () => {
    render(<TraceBar trace={TRACE} />);

    for (const stage of PIPELINE_STAGES) {
      expect(screen.getByText(stage)).toBeDefined();
    }
  });

  it('marks the active stage', () => {
    render(<TraceBar trace={TRACE} />);

    const activeStage = screen.getByText('emit');
    expect(activeStage.className).toContain('active');
  });

  it('renders duration and audit id', () => {
    render(<TraceBar trace={TRACE} />);

    expect(screen.getByText(/41ms/)).toBeDefined();
    expect(screen.getByText(/01JQ4Z/)).toBeDefined();
  });

  it('renders without trace data', () => {
    render(<TraceBar trace={null} />);

    // Stages should still render, just without active marker.
    expect(screen.getByText('validate')).toBeDefined();
    expect(screen.getByText('emit')).toBeDefined();
  });
});

// ── FacilitiesScreen ──────────────────────────────────────────

function makeFacility(overrides: Partial<Facility> = {}): Facility {
  return {
    id: 'fac-1',
    name: 'Felixstowe Berth 8',
    code: 'FAC-FEL-01',
    type: 'PORT',
    status: 'OPERATIONAL',
    location: { lat: 51.95, lng: 1.31 },
    address: 'Felixstowe, UK',
    country: 'GB',
    capacity: 18400,
    currentUtilization: 72,
    _redactedFields: null,
    _consentRestricted: null,
    ...overrides,
  };
}

function makeConnection(facilities: Facility[]): FacilityConnection {
  return {
    edges: facilities.map(f => ({ node: f, cursor: f.id })),
    pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: facilities[0]?.id ?? null, endCursor: facilities[facilities.length - 1]?.id ?? null },
    totalCount: facilities.length,
  };
}

function makeClient(facilities: Facility[] = [makeFacility()]): Altius {
  const conn = makeConnection(facilities);
  return {
    facility: {
      get: vi.fn(async () => facilities[0] ?? null),
      list: vi.fn(async () => conn),
      onChange: vi.fn(),
      onAnyChange: vi.fn(() => ({ unsubscribe: vi.fn() })),
    },
  } as unknown as Altius;
}

describe('FacilitiesScreen', () => {
  it('renders the header and stats strip', async () => {
    const client = makeClient();
    render(
      <FacilitiesScreen
        client={client}
        stats={{ visible: 38, total: 41, disrupted: 2, meanUtilisation: 67, cdcLagSeconds: 1.8 }}
        activeFilters={[]}
        onRemoveFilter={() => {}}
        onAddFilter={() => {}}
      />,
    );

    expect(screen.getByText('Facility')).toBeDefined();
    expect(screen.getByText('VISIBLE')).toBeDefined();
    // The visible count appears in the stats strip value.
    const visibleCell = screen.getByText('VISIBLE').closest('div');
    expect(visibleCell?.textContent).toContain('38');
  });

  it('renders facility rows from the SDK', async () => {
    const client = makeClient([
      makeFacility({ id: 'f1', name: 'Felixstowe', code: 'FAC-FEL-01', country: 'GB' }),
      makeFacility({ id: 'f2', name: 'Hamburg', code: 'FAC-HAM-02', status: 'DISRUPTED', country: 'DE' }),
    ]);
    render(
      <FacilitiesScreen
        client={client}
        stats={null}
        activeFilters={[]}
        onRemoveFilter={() => {}}
        onAddFilter={() => {}}
      />,
    );

    // Wait for the facility names to appear.
    expect(await screen.findByText('Felixstowe')).toBeDefined();
    expect(screen.getByText('Hamburg')).toBeDefined();
    expect(screen.getByText('DISRUPTED')).toBeDefined();
  });

  it('renders redacted fields distinctly from empty', async () => {
    const client = makeClient([
      makeFacility({ id: 'f1', name: 'Secret Facility', capacity: null, _redactedFields: ['capacity'] }),
    ]);
    render(
      <FacilitiesScreen
        client={client}
        stats={null}
        activeFilters={[]}
        onRemoveFilter={() => {}}
        onAddFilter={() => {}}
      />,
    );

    expect(await screen.findByText('Secret Facility')).toBeDefined();
    expect(screen.getByText('redacted')).toBeDefined();
  });

  it('renders consent withheld distinctly', async () => {
    const client = makeClient([
      makeFacility({ id: 'f1', name: 'Restricted Facility', _consentRestricted: true }),
    ]);
    render(
      <FacilitiesScreen
        client={client}
        stats={null}
        activeFilters={[]}
        onRemoveFilter={() => {}}
        onAddFilter={() => {}}
      />,
    );

    expect(await screen.findByText('Restricted Facility')).toBeDefined();
    expect(screen.getAllByText('consent withheld').length).toBeGreaterThan(0);
  });

  it('calls onRemoveFilter when a filter pill remove button is clicked', () => {
    const onRemoveFilter = vi.fn();
    const client = makeClient();
    render(
      <FacilitiesScreen
        client={client}
        stats={null}
        activeFilters={[{ field: 'country', values: ['DE', 'NL'] }]}
        onRemoveFilter={onRemoveFilter}
        onAddFilter={() => {}}
      />,
    );

    // Find the remove button for the 'DE' filter pill.
    const removeBtn = screen.getByLabelText('Remove filter country = DE');
    fireEvent.click(removeBtn);
    expect(onRemoveFilter).toHaveBeenCalledWith('country', 'DE');
  });
});
