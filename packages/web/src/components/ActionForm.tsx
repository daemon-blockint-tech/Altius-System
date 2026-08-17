/**
 * A form generated from an action's parameter JSON Schema.
 *
 * The schema comes from `actions.available()`, which is caller-scoped — so the
 * form reflects what this user may actually run, and adding an action to a pack
 * gives every client a form for it without a code change.
 *
 * Typing is the part that matters. The action pipeline validates params against
 * their declared ODL types, and a form that posts everything as a string makes
 * `quantity: 5` arrive as `"5"`. So the control is chosen from the schema and
 * the value is converted back on the way out.
 */

import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';

/** The subset of the SDK's ToolDescriptor this component needs. */
export interface ActionSchema {
  name: string;
  description?: string;
  parameters: {
    properties?: Record<string, ParamSchema>;
    required?: string[];
  };
}

export interface ParamSchema {
  type?: string;
  /** Present on enums — the closed set of members. */
  enum?: string[];
  /** `date` / `date-time` on temporal scalars. */
  format?: string;
  description?: string;
  items?: ParamSchema;
}

/** What the action surface returns; mirrors the SDK's ActionResult. */
export interface ActionOutcome {
  success: boolean;
  errors?: Array<{ code: string; message: string; field?: string | null }> | null;
}

export interface ActionFormProps {
  action: ActionSchema;
  submit: (input: Record<string, unknown>) => Promise<ActionOutcome>;
  /** Called after a successful apply, e.g. to close a dialog. */
  onApplied?: () => void;
}

type Status = 'editing' | 'submitting';

export function ActionForm({ action, submit, onApplied }: ActionFormProps): ReactNode {
  const properties = action.parameters.properties ?? {};
  const required = new Set(action.parameters.required ?? []);

  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status>('editing');
  const [errors, setErrors] = useState<ActionOutcome['errors']>(null);

  const fieldErrors = new Map<string, string>();
  const generalErrors: string[] = [];
  for (const err of errors ?? []) {
    if (err.field) fieldErrors.set(err.field, err.message);
    else generalErrors.push(err.message);
  }

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setStatus('submitting');
    setErrors(null);
    try {
      const outcome = await submit(buildInput(properties, values));
      if (outcome.success) {
        setValues({});
        onApplied?.();
      } else {
        // A refused action is not an exception — the pipeline reports it in
        // band, per field where it can.
        setErrors(outcome.errors ?? [{ code: 'UNKNOWN', message: 'The action was refused.' }]);
      }
    } catch (err) {
      setErrors([{ code: 'REQUEST_FAILED', message: err instanceof Error ? err.message : String(err) }]);
    } finally {
      setStatus('editing');
    }
  }

  return (
    <form onSubmit={e => void onSubmit(e)} aria-label={action.name}>
      <h2>{action.name}</h2>
      {action.description ? <p>{action.description}</p> : null}

      {generalErrors.length > 0 ? (
        <div role="alert">
          {generalErrors.map(message => (
            <p key={message}>{message}</p>
          ))}
        </div>
      ) : null}

      {Object.entries(properties).map(([name, param]) => {
        const id = `${action.name}-${name}`;
        const message = fieldErrors.get(name);
        return (
          <div key={name}>
            <label htmlFor={id}>
              {name}
              {required.has(name) ? ' *' : ''}
            </label>
            {renderControl({
              id,
              name,
              param,
              required: required.has(name),
              value: values[name] ?? '',
              invalid: message !== undefined,
              onChange: next => setValues(v => ({ ...v, [name]: next })),
            })}
            {param.description ? <small>{param.description}</small> : null}
            {/* Tied to the control by aria-describedby so a screen reader hears
                which field the server rejected, not just that something failed. */}
            {message ? (
              <small id={`${id}-error`} role="alert">
                {message}
              </small>
            ) : null}
          </div>
        );
      })}

      <button type="submit" disabled={status === 'submitting'}>
        {status === 'submitting' ? 'Applying…' : 'Apply'}
      </button>
    </form>
  );
}

function renderControl(opts: {
  id: string;
  name: string;
  param: ParamSchema;
  required: boolean;
  value: string;
  invalid: boolean;
  onChange: (next: string) => void;
}): ReactNode {
  const { id, name, param, required, value, invalid, onChange } = opts;
  const common = {
    id,
    name,
    required,
    'aria-invalid': invalid || undefined,
    'aria-describedby': invalid ? `${id}-error` : undefined,
  };

  // An enum is a closed set, and the schema now carries its members, so it is a
  // select. Free text here would let a caller submit a value the server is
  // guaranteed to reject.
  if (param.enum) {
    return (
      <select {...common} value={value} onChange={e => onChange(e.target.value)}>
        <option value="">{required ? 'Select…' : '(none)'}</option>
        {param.enum.map(member => (
          <option key={member} value={member}>
            {member}
          </option>
        ))}
      </select>
    );
  }

  if (param.type === 'boolean') {
    return (
      <input
        {...common}
        type="checkbox"
        // `required` on a checkbox means "must be ticked", which is not what a
        // required boolean param means.
        required={false}
        checked={value === 'true'}
        onChange={e => onChange(String(e.target.checked))}
      />
    );
  }

  if (param.type === 'integer' || param.type === 'number') {
    return (
      <input
        {...common}
        type="number"
        step={param.type === 'integer' ? 1 : 'any'}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    );
  }

  return (
    <input
      {...common}
      type={INPUT_TYPE_BY_FORMAT[param.format ?? ''] ?? 'text'}
      value={value}
      onChange={e => onChange(e.target.value)}
    />
  );
}

const INPUT_TYPE_BY_FORMAT: Record<string, string> = {
  date: 'date',
  'date-time': 'datetime-local',
};

/**
 * Turn the form's string state back into the JSON types the action declared.
 *
 * Two rules do the work:
 *
 *  - An untouched optional field is OMITTED, not sent as "". Empty string is a
 *    value: it fails a required check that an absent key would pass, and it
 *    overwrites a stored value with emptiness on an update.
 *  - Numbers and booleans are converted. The pipeline type-checks params
 *    against their ODL type, so posting `"5"` for an Int is a refusal — and
 *    where it is not checked it silently stores the string.
 */
export function buildInput(
  properties: Record<string, ParamSchema>,
  values: Record<string, string>,
): Record<string, unknown> {
  const input: Record<string, unknown> = {};

  for (const [name, param] of Object.entries(properties)) {
    const raw = values[name];

    if (param.type === 'boolean') {
      // A checkbox always has a state; unticked is a real `false`, not absent.
      input[name] = raw === 'true';
      continue;
    }

    if (raw === undefined || raw === '') continue;

    if (param.type === 'integer' || param.type === 'number') {
      const parsed = Number(raw);
      // Let a non-numeric string through untouched rather than sending NaN,
      // which serialises to null and reads as "field cleared".
      input[name] = Number.isNaN(parsed) ? raw : parsed;
      continue;
    }

    input[name] = raw;
  }

  return input;
}
