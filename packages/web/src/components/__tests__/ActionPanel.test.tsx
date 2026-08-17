/**
 * The action panel.
 *
 * `availableTools` is caller-scoped, so an empty list is a real answer — this
 * caller may run nothing — and must read differently from a failed load. An
 * empty panel that looks like a spinner that gave up is the failure mode.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ActionPanel } from '../ActionPanel.js';
import type { ActionSchema } from '../ActionForm.js';

const TRIAGE: ActionSchema = {
  name: 'TriagePatient',
  parameters: {
    properties: { category: { type: 'string', enum: ['IMMEDIATE', 'URGENT'] } },
    required: ['category'],
  },
};

const DISCHARGE: ActionSchema = {
  name: 'DischargePatient',
  parameters: { properties: { destination: { type: 'string' } } },
};

describe('ActionPanel', () => {
  it('lists the actions the caller may run', async () => {
    render(
      <ActionPanel loadActions={async () => [TRIAGE, DISCHARGE]} submit={vi.fn()} />,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'TriagePatient' })).toBeDefined());
    expect(screen.getByRole('button', { name: 'DischargePatient' })).toBeDefined();
  });

  it('says so when the caller may run nothing, rather than showing an empty panel', async () => {
    render(<ActionPanel loadActions={async () => []} submit={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(/No actions available to you/)).toBeDefined());
  });

  it('distinguishes a failed load from an empty list', async () => {
    render(
      <ActionPanel
        loadActions={async () => {
          throw new Error('Access denied');
        }}
        submit={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
    expect(screen.getByText(/Access denied/)).toBeDefined();
    expect(screen.queryByText(/No actions available/)).toBeNull();
  });

  it('opens the form for the chosen action and submits under its name', async () => {
    const submit = vi.fn(async () => ({ success: true }));
    render(<ActionPanel loadActions={async () => [TRIAGE, DISCHARGE]} submit={submit} />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'TriagePatient' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'TriagePatient' }));

    const select = await screen.findByLabelText('category *');
    fireEvent.change(select, { target: { value: 'URGENT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(submit).toHaveBeenCalledWith('TriagePatient', { category: 'URGENT' }));
  });

  it('closes the form and notifies the parent after a successful apply', async () => {
    const onApplied = vi.fn();
    render(
      <ActionPanel
        loadActions={async () => [TRIAGE]}
        submit={async () => ({ success: true })}
        onApplied={onApplied}
      />,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'TriagePatient' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'TriagePatient' }));
    fireEvent.change(await screen.findByLabelText('category *'), { target: { value: 'URGENT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    // The table re-reads through this, so a write is reflected without a manual
    // refresh even where the change stream does not reach.
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByLabelText('category *')).toBeNull());
  });
});
