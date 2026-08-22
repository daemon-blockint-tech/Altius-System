/**
 * Shell navigation chrome: filtering the screen list and collapsing the nav
 * column. Both are shell-owned state — the parent still owns the selection.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditorialShell } from '../components/EditorialShell.js';
import type { JobGroup, PackOption, RoleOption } from '../components/EditorialShell.js';

const JOBS: JobGroup[] = [
  {
    key: 'OP',
    label: 'Operate',
    screens: [
      { id: 'objects', label: 'Objects' },
      { id: 'facilities', label: 'Facilities' },
      { id: 'action-console', label: 'Action console' },
    ],
  },
];

const PACKS: PackOption[] = [{ id: 'core', name: 'altius.core', version: '1.0.0' }];
const ROLES: RoleOption[] = [{ id: 'admin', label: 'admin' }];

function renderShell() {
  return render(
    <EditorialShell
      packs={PACKS}
      activePack="core"
      onPackChange={() => {}}
      jobs={JOBS}
      activeJob="OP"
      activeScreen="objects"
      onScreenSelect={() => {}}
      roles={ROLES}
      activeRole="admin"
      onRoleChange={() => {}}
      principal={{ name: 'Dev User', email: 'dev@localhost', tenant: 'default', sub: 'dev', relationsSummary: null }}
      hidden={[]}
      events={[]}
      feedLive={false}
      trace={null}
      brand="AL"
      userInitials="DU"
    >
      <main className="ed-main" />
    </EditorialShell>,
  );
}

describe('EditorialShell navigation', () => {
  it('filters the screen list by label', () => {
    renderShell();
    expect(screen.getByText('Facilities')).toBeTruthy();
    expect(screen.getByText('Action console')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Filter screens'), { target: { value: 'act' } });

    expect(screen.getByText('Action console')).toBeTruthy();
    expect(screen.queryByText('Facilities')).toBeNull();
    expect(screen.queryByText('Objects')).toBeNull();
  });

  it('says so when nothing matches rather than showing an empty column', () => {
    renderShell();
    fireEvent.change(screen.getByLabelText('Filter screens'), { target: { value: 'zzz' } });
    expect(screen.getByText(/No screens match/)).toBeTruthy();
  });

  it('collapses and restores the navigation column', () => {
    const { container } = renderShell();
    const shell = container.querySelector('.ed-shell')!;
    const nav = container.querySelector('#al-nav') as HTMLElement;

    expect(shell.classList.contains('al-nav-collapsed')).toBe(false);
    expect(nav.hidden).toBe(false);

    fireEvent.click(screen.getByLabelText('Collapse navigation'));

    expect(shell.classList.contains('al-nav-collapsed')).toBe(true);
    expect((container.querySelector('#al-nav') as HTMLElement).hidden).toBe(true);

    fireEvent.click(screen.getByLabelText('Expand navigation'));

    expect(container.querySelector('.ed-shell')!.classList.contains('al-nav-collapsed')).toBe(false);
    expect((container.querySelector('#al-nav') as HTMLElement).hidden).toBe(false);
  });
});
