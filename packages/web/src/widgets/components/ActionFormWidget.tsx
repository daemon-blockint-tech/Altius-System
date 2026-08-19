/**
 * ActionFormWidget — renders an action form from a widget config.
 *
 * Config:
 *   actionName: string   — the ODL action type name
 *
 * The form is generated from the action's JSON-Schema parameter
 * descriptor, fetched from the SDK's actions.available() query.
 */

import { useEffect, useState } from 'react';
import { ActionForm } from '../../components/ActionForm.js';
import type { ActionSchema, ActionOutcome } from '../../components/ActionForm.js';
import type { WidgetProps } from '../types.js';

interface ActionFormConfig {
  actionName: string;
}

export function ActionFormWidget({ instance, ctx }: WidgetProps): React.ReactNode {
  const config = instance.config as unknown as ActionFormConfig;
  const { actionName } = config;

  const [action, setAction] = useState<ActionSchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = ctx.client as { actions?: { available: () => Promise<ActionSchema[]> } };
    if (!client.actions?.available) {
      setError('SDK actions.available() not found');
      setLoading(false);
      return;
    }
    client.actions.available()
      .then((actions) => {
        const found = actions.find((a) => a.name === actionName);
        if (!found) { setError(`Action "${actionName}" not found`); }
        setAction(found ?? null);
        setLoading(false);
      })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }, [actionName, ctx.client]);

  if (loading) return <div className="ed-widget ed-widget--loading">Loading action…</div>;
  if (error) return <div className="ed-widget ed-widget--error">{error}</div>;
  if (!action) return null;

  const submit = (input: Record<string, unknown>): Promise<ActionOutcome> => {
    const client = ctx.client as { actions?: { run: (name: string, input: Record<string, unknown>) => Promise<ActionOutcome> } };
    return client.actions?.run(actionName, input) ?? Promise.resolve({ success: false, errors: [{ code: 'NO_CLIENT', message: 'SDK actions.run() not found' }] });
  };

  return (
    <div className="ed-widget ed-action-form-widget" data-widget-id={instance.id}>
      <ActionForm action={action} submit={submit} />
    </div>
  );
}
