/**
 * Catches render errors so a bug shows a message instead of a blank page.
 *
 * React unmounts the whole tree when a render throws and nothing catches it,
 * leaving white. On a clinical worklist that is the worst available outcome:
 * indistinguishable from "no patients", from a slow load, and from a logged-out
 * session, so the reader cannot tell whether they are seeing an empty list or
 * no list at all.
 *
 * Deliberately NOT a retry button. A render error is a bug in this bundle, not
 * a transient condition, and a retry that re-renders the same broken state
 * invites someone to sit clicking it. Reloading is the honest recovery, because
 * it also picks up a newer bundle if one has been deployed.
 *
 * A class component because that is the only thing React gives error boundaries
 * to — there is no hook equivalent.
 */

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Reported here rather than only to the console, so a deployment can wire it up. */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div role="alert">
        <h1>Something went wrong</h1>
        {/* The message, not the stack. A stack can carry ids and query text,
            and this renders in front of whoever is at the workstation. */}
        <p>{error.message}</p>
        <p>
          This is a fault in the application, not in your data. Reload to try
          again; if it persists, report it with what you were doing.
        </p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
