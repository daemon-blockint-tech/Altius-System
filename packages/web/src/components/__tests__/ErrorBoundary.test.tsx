/**
 * Error boundary.
 *
 * Without one, a render error unmounts the tree and leaves a blank page —
 * indistinguishable from "no patients", from a slow load, and from a
 * logged-out session. Distinguishing failure from emptiness is the whole job.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../ErrorBoundary.js';

function Boom({ message }: { message: string }): never {
  throw new Error(message);
}

// React logs caught render errors to console.error; silence it so a passing
// run is not full of expected noise.
let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  consoleError.mockRestore();
});

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>worklist</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('worklist')).toBeDefined();
  });

  it('shows the failure instead of a blank page', () => {
    render(
      <ErrorBoundary>
        <Boom message="Cannot read properties of undefined" />
      </ErrorBoundary>,
    );

    // role=alert so it is announced, not just drawn.
    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText(/Cannot read properties of undefined/)).toBeDefined();
  });

  it('says the fault is the application, not the data', () => {
    // A clinician seeing an error over a patient list needs to know the list is
    // broken rather than that the records are wrong or missing.
    render(
      <ErrorBoundary>
        <Boom message="boom" />
      </ErrorBoundary>,
    );

    expect(screen.getByText(/fault in the application, not in your data/)).toBeDefined();
  });

  it('reports the error to the handler for a deployment to collect', () => {
    const onError = vi.fn();

    render(
      <ErrorBoundary onError={onError}>
        <Boom message="boom" />
      </ErrorBoundary>,
    );

    expect(onError).toHaveBeenCalled();
    expect((onError.mock.calls[0]![0] as Error).message).toBe('boom');
  });

  it('offers reload rather than retry', () => {
    // A render error is a bug in this bundle, not a transient condition; a
    // retry re-renders the same broken state and invites repeated clicking.
    render(
      <ErrorBoundary>
        <Boom message="boom" />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('button', { name: 'Reload' })).toBeDefined();
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
  });
});
