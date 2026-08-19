/**
 * BuilderToolbar — top toolbar with mode toggle, app name, and actions.
 *
 * Actions:
 *   - Toggle edit/preview mode
 *   - Export app definition as JSON
 *   - Save app definition (calls onSave callback)
 *   - New app (calls onNewApp)
 */

export interface BuilderToolbarProps {
  appName: string;
  mode: 'edit' | 'preview';
  onToggleMode: () => void;
  onExport: () => void;
  onSave: () => void;
  onNewApp: () => void;
  /** Whether there are unsaved changes. */
  dirty?: boolean;
}

export function BuilderToolbar({
  appName,
  mode,
  onToggleMode,
  onExport,
  onSave,
  onNewApp,
  dirty,
}: BuilderToolbarProps): React.ReactNode {
  return (
    <header className="ed-builder__toolbar">
      <div className="ed-builder__toolbar-left">
        <h1 className="ed-builder__toolbar-title">
          {appName}
          {dirty && <span className="ed-builder__toolbar-dirty">●</span>}
        </h1>
      </div>
      <div className="ed-builder__toolbar-right">
        <button
          className={`ed-builder__toolbar-btn${mode === 'edit' ? ' ed-builder__toolbar-btn--active' : ''}`}
          onClick={onToggleMode}
          disabled={mode === 'edit'}
        >
          Edit
        </button>
        <button
          className={`ed-builder__toolbar-btn${mode === 'preview' ? ' ed-builder__toolbar-btn--active' : ''}`}
          onClick={onToggleMode}
          disabled={mode === 'preview'}
        >
          Preview
        </button>
        <span className="ed-builder__toolbar-divider" />
        <button className="ed-builder__toolbar-btn" onClick={onNewApp}>New</button>
        <button className="ed-builder__toolbar-btn" onClick={onExport}>Export</button>
        <button className="ed-builder__toolbar-btn ed-builder__toolbar-btn--primary" onClick={onSave}>Save</button>
      </div>
    </header>
  );
}
