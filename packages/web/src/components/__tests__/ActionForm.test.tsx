/**
 * Generated action forms.
 *
 * The typing rules carry the weight. The action pipeline checks params against
 * their declared ODL type, and the backlog already records a bug where effects
 * coerced every value to a string and `quantity: 5` was stored as `"5"`. A form
 * that posts its own state verbatim recreates that from the client side.
 *
 * The other rule is that an untouched optional field must be OMITTED rather than
 * sent as "". An empty string is a value: it fails a required check an absent
 * key would pass, and on an update it overwrites a stored value with emptiness.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ActionForm, buildInput } from '../ActionForm.js';
import type { ActionSchema } from '../ActionForm.js';

const ACTION: ActionSchema = {
  name: 'TriagePatient',
  description: 'Set triage category',
  parameters: {
    properties: {
      patient: { type: 'string', description: 'ID reference to Patient' },
      category: { type: 'string', enum: ['IMMEDIATE', 'URGENT', 'STANDARD'] },
      assessedAt: { type: 'string', format: 'date-time' },
      reviewDate: { type: 'string', format: 'date' },
      priority: { type: 'integer' },
      confirmed: { type: 'boolean' },
      note: { type: 'string' },
    },
    required: ['patient', 'category'],
  },
};

const ok = () => Promise.resolve({ success: true });

/**
 * Fill the required params.
 *
 * These tests exercise SERVER refusal, which the browser never lets you reach
 * while a required control is empty — native constraint validation blocks the
 * submit first, exactly as it would for a real user.
 */
function fillRequired(): void {
  fireEvent.change(screen.getByLabelText('patient *'), { target: { value: 'p-1' } });
  fireEvent.change(screen.getByLabelText('category *'), { target: { value: 'URGENT' } });
}

describe('ActionForm controls', () => {
  it('renders an enum as a select over its members, not free text', () => {
    render(<ActionForm action={ACTION} submit={vi.fn(ok)} />);

    const select = screen.getByLabelText('category *') as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect([...select.options].map(o => o.value)).toEqual(['', 'IMMEDIATE', 'URGENT', 'STANDARD']);
  });

  it('picks the control from the declared format and type', () => {
    render(<ActionForm action={ACTION} submit={vi.fn(ok)} />);

    expect((screen.getByLabelText('assessedAt') as HTMLInputElement).type).toBe('datetime-local');
    expect((screen.getByLabelText('reviewDate') as HTMLInputElement).type).toBe('date');
    expect((screen.getByLabelText('priority') as HTMLInputElement).type).toBe('number');
    expect((screen.getByLabelText('confirmed') as HTMLInputElement).type).toBe('checkbox');
    expect((screen.getByLabelText('note') as HTMLInputElement).type).toBe('text');
  });

  it('marks required params required, and optional ones not', () => {
    render(<ActionForm action={ACTION} submit={vi.fn(ok)} />);

    expect((screen.getByLabelText('patient *') as HTMLInputElement).required).toBe(true);
    expect((screen.getByLabelText('note') as HTMLInputElement).required).toBe(false);
  });
});

describe('buildInput', () => {
  const properties = ACTION.parameters.properties!;

  it('omits untouched optional fields instead of sending empty strings', () => {
    const input = buildInput(properties, { patient: 'p-1', category: 'URGENT' });

    expect(input).toEqual({ patient: 'p-1', category: 'URGENT', confirmed: false });
    // Explicitly: not present at all, rather than present-and-empty.
    expect('note' in input).toBe(false);
    expect('reviewDate' in input).toBe(false);
  });

  it('sends numbers as numbers', () => {
    const input = buildInput(properties, { priority: '3' });

    expect(input['priority']).toBe(3);
    expect(typeof input['priority']).toBe('number');
  });

  it('sends an unticked checkbox as false rather than omitting it', () => {
    // A boolean always has a state; omitting it would read as "unset" and could
    // leave a stored `true` in place on an update.
    expect(buildInput(properties, {})['confirmed']).toBe(false);
    expect(buildInput(properties, { confirmed: 'true' })['confirmed']).toBe(true);
  });

  it('passes a non-numeric string through rather than sending NaN', () => {
    // NaN serialises to null, which reads as "clear this field".
    expect(buildInput(properties, { priority: 'abc' })['priority']).toBe('abc');
  });
});

describe('submitting', () => {
  it('submits typed values and clears on success', async () => {
    const submit = vi.fn(ok);
    render(<ActionForm action={ACTION} submit={submit} />);

    fireEvent.change(screen.getByLabelText('patient *'), { target: { value: 'p-1' } });
    fireEvent.change(screen.getByLabelText('category *'), { target: { value: 'IMMEDIATE' } });
    fireEvent.change(screen.getByLabelText('priority'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(submit).toHaveBeenCalledWith({
      patient: 'p-1',
      category: 'IMMEDIATE',
      priority: 2,
      confirmed: false,
    });
  });

  it('shows a refusal against the field the server named', async () => {
    const submit = vi.fn(async () => ({
      success: false,
      errors: [{ code: 'VALIDATION_ERROR', message: "Required field 'category' is missing", field: 'category' }],
    }));
    render(<ActionForm action={ACTION} submit={submit} />);
    fillRequired();

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(screen.getByText(/Required field 'category' is missing/)).toBeDefined());
    // The control is marked invalid and points at the message, so the failure is
    // attached to the field rather than floating above the form.
    const select = screen.getByLabelText('category *');
    expect(select.getAttribute('aria-invalid')).toBe('true');
    expect(select.getAttribute('aria-describedby')).toBe('TriagePatient-category-error');
  });

  it('reports a field-less refusal as a form-level alert', async () => {
    const submit = vi.fn(async () => ({
      success: false,
      errors: [{ code: 'FORBIDDEN', message: 'Access denied' }],
    }));
    render(<ActionForm action={ACTION} submit={submit} />);
    fillRequired();

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Access denied'));
  });

  it('surfaces a thrown request error instead of looking like success', async () => {
    const submit = vi.fn(async () => {
      throw new Error('GraphQL errors: socket closed');
    });
    render(<ActionForm action={ACTION} submit={submit} />);
    fillRequired();

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(screen.getByText(/socket closed/)).toBeDefined());
  });

  it('disables the button while in flight so a double click cannot double apply', async () => {
    let release: (() => void) | undefined;
    const submit = vi.fn(
      () => new Promise<{ success: boolean }>(resolve => { release = () => resolve({ success: true }); }),
    );
    render(<ActionForm action={ACTION} submit={submit} />);
    fillRequired();

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Applying…' })).toBeDefined());
    expect((screen.getByRole('button', { name: 'Applying…' }) as HTMLButtonElement).disabled).toBe(true);

    release?.();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Apply' })).toBeDefined());
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('calls onApplied only after a successful apply', async () => {
    const onApplied = vi.fn();
    const submit = vi.fn(async () => ({ success: false, errors: [{ code: 'X', message: 'nope' }] }));
    const { rerender } = render(<ActionForm action={ACTION} submit={submit} onApplied={onApplied} />);
    fillRequired();

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(screen.getByText('nope')).toBeDefined());
    expect(onApplied).not.toHaveBeenCalled();

    rerender(<ActionForm action={ACTION} submit={vi.fn(ok)} onApplied={onApplied} />);
    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
  });
});
