/**
 * Secondary sidebar — pack switcher, screen list within the active job,
 * and the role switcher.
 *
 * The pack switcher changes which domain pack's data fills the screens.
 * The role switcher changes what is redacted, withheld and refused —
 * it is the ReBAC principal selector, not a theme toggle.
 */

import type { ReactNode } from 'react';
import type { Job } from './IconRail.js';

export type PackId = 'supply.chain' | 'nhs.acute' | 'aml';
export type RoleId = 'warehouse_manager' | 'logistics_manager' | 'supply_chain_admin';

export interface ScreenDef {
  id: string;
  label: string;
  count?: number;
}

export interface SidebarProps {
  activeJob: Job;
  activePack: PackId;
  onSelectPack: (pack: PackId) => void;
  activeScreen: string;
  onSelectScreen: (screenId: string) => void;
  activeRole: RoleId;
  onSelectRole: (role: RoleId) => void;
  screens: ScreenDef[];
}

const PACKS: { id: PackId; version: string }[] = [
  { id: 'supply.chain', version: '0.1.0' },
  { id: 'nhs.acute', version: '0.1.0' },
  { id: 'aml', version: '0.1.0' },
];

const ROLES: { id: RoleId; label: string }[] = [
  { id: 'warehouse_manager', label: 'Warehouse manager' },
  { id: 'logistics_manager', label: 'Logistics manager' },
  { id: 'supply_chain_admin', label: 'Supply chain admin' },
];

export function Sidebar({
  activeJob,
  activePack,
  onSelectPack,
  activeScreen,
  onSelectScreen,
  activeRole,
  onSelectRole,
  screens,
}: SidebarProps): ReactNode {
  return (
    <aside className="shell__sidebar">
      <div className="sidebar__pack">
        <span className="label" style={{ display: 'block', marginBottom: '10px' }}>PACK</span>
        <div className="sidebar__pack-switcher">
          <span className="sidebar__pack-name">{activePack}</span>
          <span className="sidebar__pack-version">
            {PACKS.find(p => p.id === activePack)?.version ?? ''} ▾
          </span>
        </div>
      </div>

      <div className="sidebar__section" style={{ paddingBottom: '12px' }}>
        <span className="label">{activeJob === 'OP' ? 'OPERATE' : activeJob === 'IN' ? 'INVESTIGATE' : activeJob === 'MO' ? 'MODEL' : 'ADMINISTER'}</span>
      </div>

      <div className="sidebar__nav-group">
        {screens.map(screen => {
          const active = screen.id === activeScreen;
          return (
            <a
              key={screen.id}
              href="#"
              className={
                'sidebar__nav-item' +
                (active ? ' sidebar__nav-item--active' : ' sidebar__nav-item--inactive')
              }
              onClick={e => {
                e.preventDefault();
                onSelectScreen(screen.id);
              }}
              aria-current={active ? 'page' : undefined}
            >
              <span className={active ? 'sidebar__nav-label sidebar__nav-label--active' : 'sidebar__nav-label'}>
                {screen.label}
              </span>
              {screen.count !== undefined && (
                <span className="sidebar__nav-count">
                  {screen.count.toLocaleString()}
                </span>
              )}
            </a>
          );
        })}
      </div>

      <div className="sidebar__spacer" />

      <div className="sidebar__role-section">
        <span className="label" style={{ display: 'block', marginBottom: '11px' }}>ACTING AS</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {ROLES.map(role => {
            const active = role.id === activeRole;
            return (
              <label key={role.id} className={active ? 'sidebar__role-option' : 'sidebar__role-option sidebar__role-option--inactive'}>
                <span className={active ? 'sidebar__role-dot' : 'sidebar__role-dot sidebar__role-dot--inactive'} />
                <input
                  type="radio"
                  name="role"
                  value={role.id}
                  checked={active}
                  onChange={() => onSelectRole(role.id)}
                  style={{ display: 'none' }}
                />
                {role.label}
              </label>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
