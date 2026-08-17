/**
 * Editorial shell — Shell C from the design brief.
 *
 * Layout: icon rail (OP/IN/MO/AD) · sidebar (pack switcher, screen list, role
 * switcher) · main content · governance rail · footer trace bar.
 *
 * The shell is a controlled component: the parent owns pack, role, and active
 * screen state so that navigation and role-switching drive what the main
 * content renders. The shell itself only renders the chrome — including the
 * governance rail and trace bar, which are always present on ops screens.
 */

import type { ReactNode } from 'react';
import { GovernanceRail } from './GovernanceRail.js';
import type { GovernancePrincipal, GovernanceHidden, GovernanceEvent } from './GovernanceRail.js';
import { TraceBar } from './TraceBar.js';
import type { TraceState } from './TraceBar.js';

export type JobKey = 'OP' | 'IN' | 'MO' | 'AD';

export interface ScreenEntry {
  id: string;
  label: string;
  count?: number;
}

export interface JobGroup {
  key: JobKey;
  label: string;
  screens: ScreenEntry[];
}

export interface PackOption {
  id: string;
  name: string;
  version: string;
}

export interface RoleOption {
  id: string;
  label: string;
}

export interface EditorialShellProps {
  packs: PackOption[];
  activePack: string;
  onPackChange: (packId: string) => void;

  jobs: JobGroup[];
  activeJob: JobKey;
  activeScreen: string;
  onScreenSelect: (job: JobKey, screenId: string) => void;

  roles: RoleOption[];
  activeRole: string;
  onRoleChange: (roleId: string) => void;

  /** The main content — one of the eleven screens. */
  children: ReactNode;

  /** Governance rail data. */
  principal: GovernancePrincipal;
  hidden: GovernanceHidden[];
  events: GovernanceEvent[];
  feedLive: boolean;

  /** Trace bar data. */
  trace: TraceState | null;
  traceLabel?: string;

  /** Brand mark in the icon rail, e.g. "SC" for supply chain. */
  brand: string;
  /** User initials in the icon rail footer. */
  userInitials: string;
}

export function EditorialShell({
  packs,
  activePack,
  onPackChange,
  jobs,
  activeJob,
  activeScreen,
  onScreenSelect,
  roles,
  activeRole,
  onRoleChange,
  children,
  principal,
  hidden,
  events,
  feedLive,
  trace,
  traceLabel = 'LAST READ',
  brand,
  userInitials,
}: EditorialShellProps): ReactNode {
  // The active job's screen list. Falls back to the first job if the active
  // job is not found — a defensive guard rather than a real branch, since the
  // parent controls activeJob and it should always match one of jobs.
  const activeJobGroup = jobs.find(j => j.key === activeJob) ?? jobs[0];
  if (!activeJobGroup) return null;

  return (
    <div className="ed-shell">
      {/* Icon rail */}
      <nav className="ed-icon-rail" aria-label="Jobs">
        <div className="ed-icon-rail__brand">{brand}</div>
        <div className="ed-icon-rail__group">
          {jobs.map(job => {
            const active = job.key === activeJob;
            return (
              <button
                key={job.key}
                type="button"
                className="ed-icon-rail__item"
                onClick={() => onScreenSelect(job.key, job.screens[0]?.id ?? '')}
                aria-label={job.label}
                aria-current={active ? 'page' : undefined}
              >
                <span className={`ed-icon-rail__bar${active ? '' : ' ed-icon-rail__bar--inactive'}`} />
                <span className={`ed-icon-rail__label${active ? '' : ' ed-icon-rail__label--inactive'}`}>
                  {job.key}
                </span>
              </button>
            );
          })}
        </div>
        <div className="ed-icon-rail__spacer" />
        <span className="ed-icon-rail__user">{userInitials}</span>
      </nav>

      {/* Sidebar */}
      <aside className="ed-sidebar" aria-label="Navigation">
        {/* Pack switcher */}
        <div className="ed-sidebar__pack">
          <span className="ed-sidebar__section-label">PACK</span>
          <div className="ed-sidebar__pack-switcher">
            <span className="ed-sidebar__pack-name">
              {packs.find(p => p.id === activePack)?.name ?? activePack}
            </span>
            <span className="ed-sidebar__pack-version">
              {packs.find(p => p.id === activePack)?.version ?? ''} ▾
            </span>
          </div>
          {/* Pack dropdown — simple list, not a select, so it stays in style */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 4 }}>
            {packs.map(pack => (
              <button
                key={pack.id}
                type="button"
                onClick={() => onPackChange(pack.id)}
                style={{
                  textAlign: 'left',
                  padding: '6px 0',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  font: `400 12px var(--ed-sans)`,
                  color: pack.id === activePack ? 'var(--ed-fg)' : 'var(--ed-muted)',
                  borderBottom: pack.id === activePack ? '1px solid var(--ed-rule-strong)' : 'none',
                }}
              >
                {pack.name}
              </button>
            ))}
          </div>
        </div>

        {/* Screen list for active job */}
        <div className="ed-sidebar__group-label">
          <span className="ed-sidebar__section-label">{activeJobGroup.label.toUpperCase()}</span>
        </div>
        <div className="ed-sidebar__nav">
          {activeJobGroup.screens.map(screen => {
            const active = screen.id === activeScreen;
            return (
              <a
                key={screen.id}
                href="#"
                className={`ed-sidebar__nav-item${active ? ' ed-sidebar__nav-item--active' : ''}`}
                onClick={e => {
                  e.preventDefault();
                  onScreenSelect(activeJob, screen.id);
                }}
                aria-current={active ? 'page' : undefined}
              >
                <span className="ed-sidebar__nav-label">{screen.label}</span>
                {screen.count != null && (
                  <span className="ed-sidebar__nav-count">
                    {screen.count.toLocaleString()}
                  </span>
                )}
              </a>
            );
          })}
        </div>

        <div className="ed-sidebar__spacer" />

        {/* Role switcher */}
        <div className="ed-sidebar__role">
          <span className="ed-sidebar__section-label">ACTING AS</span>
          <div className="ed-sidebar__role-list">
            {roles.map(role => {
              const active = role.id === activeRole;
              return (
                <button
                  key={role.id}
                  type="button"
                  className="ed-sidebar__role-option"
                  onClick={() => onRoleChange(role.id)}
                >
                  <span className={`ed-sidebar__role-dot${active ? '' : ' ed-sidebar__role-dot--inactive'}`} />
                  <span className={`ed-sidebar__role-label${active ? '' : ' ed-sidebar__role-label--inactive'}`}>
                    {role.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      {/* Main content — one of the eleven screens */}
      {children}

      {/* Governance rail */}
      <GovernanceRail
        principal={principal}
        hidden={hidden}
        events={events}
        live={feedLive}
      />

      {/* Footer trace bar */}
      <TraceBar trace={trace} label={traceLabel} />
    </div>
  );
}
