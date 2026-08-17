/**
 * The actions this caller may run, each as a generated form.
 *
 * The list comes from `availableTools`, which is caller-scoped — so an action
 * the caller holds no relation for is simply absent, rather than offered and
 * then refused. That is also why it is fetched rather than derived from the
 * build: a bundle cannot know who is looking at it.
 */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ActionForm } from './ActionForm.js';
import type { ActionOutcome, ActionSchema } from './ActionForm.js';

export interface ActionPanelProps {
  loadActions: () => Promise<ActionSchema[]>;
  submit: (actionName: string, input: Record<string, unknown>) => Promise<ActionOutcome>;
  /** Called after any action applies, so a sibling view can re-read. */
  onApplied?: () => void;
}

type Status = 'loading' | 'ready' | 'error';

export function ActionPanel({ loadActions, submit, onApplied }: ActionPanelProps): ReactNode {
  const [status, setStatus] = useState<Status>('loading');
  const [actions, setActions] = useState<ActionSchema[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openAction, setOpenAction] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadActions()
      .then(next => {
        if (!live) return;
        setActions(next);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (!live) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      });
    return () => {
      live = false;
    };
  }, [loadActions]);

  if (status === 'loading') return <p>Loading actions…</p>;

  if (status === 'error') {
    return (
      <div role="alert">
        <p>Could not load actions.</p>
        <p>{error}</p>
      </div>
    );
  }

  // An empty list is a real answer — this caller may run nothing here — and
  // saying so beats an empty panel that looks like a failed load.
  if (actions.length === 0) {
    return <p>No actions available to you.</p>;
  }

  const open = actions.find(a => a.name === openAction);

  return (
    <section aria-label="Actions">
      <h2>Actions</h2>
      <ul>
        {actions.map(action => (
          <li key={action.name}>
            <button
              type="button"
              aria-expanded={action.name === openAction}
              onClick={() => setOpenAction(current => (current === action.name ? null : action.name))}
            >
              {action.name}
            </button>
          </li>
        ))}
      </ul>

      {open ? (
        <ActionForm
          action={open}
          submit={input => submit(open.name, input)}
          onApplied={() => {
            setOpenAction(null);
            onApplied?.();
          }}
        />
      ) : null}
    </section>
  );
}
