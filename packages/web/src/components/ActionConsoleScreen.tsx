/**
 * Action console — governed action panel for the active pack.
 *
 * Lists all actions the signed-in user is authorised to run, with the
 * JSON-Schema-driven form from ActionPanel. The action list is fetched
 * from the runtime availableTools query, so it reflects the user's
 * actual permissions — not the schema's full set.
 */

import { ActionPanel } from './ActionPanel.js';
import type { ActionSchema, ActionOutcome } from './ActionForm.js';

export interface ActionConsoleScreenProps {
  packLabel: string;
  loadActions: () => Promise<ActionSchema[]>;
  submit: (name: string, input: Record<string, unknown>) => Promise<ActionOutcome>;
}

export function ActionConsoleScreen({
  packLabel,
  loadActions,
  submit,
}: ActionConsoleScreenProps): React.ReactNode {
  return (
    <main className="ed-main">
      <header className="ed-main__header">
        <span className="ed-main__eyebrow">{packLabel.toUpperCase().replace('-', '.')} · GOVERNED ACTIONS</span>
        <h1 className="ed-main__title">Action console</h1>
        <p className="ed-main__lede">
          Actions the signed-in user is authorised to run. Each form is generated from
          the action's JSON-Schema parameter descriptor — no form is hard-coded.
        </p>
      </header>
      <div style={{ padding: '0 44px 40px', maxWidth: 1180 }}>
        <ActionPanel loadActions={loadActions} submit={submit} />
      </div>
    </main>
  );
}
