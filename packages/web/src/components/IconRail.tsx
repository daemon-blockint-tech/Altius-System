/**
 * Icon rail — the leftmost navigation, grouped by job.
 *
 * Four jobs: Operate (OP), Investigate (IN), Model (MO), Administer (AD).
 * The active job is marked by a heavier bar; inactive jobs are faint.
 * The rail speaks in two-letter codes, not icons — the editorial design
 * uses type as structure, not pictograms.
 */

import type { ReactNode } from 'react';

export type Job = 'OP' | 'IN' | 'MO' | 'AD';

export interface IconRailProps {
  activeJob: Job;
  onSelectJob: (job: Job) => void;
}

const JOBS: { code: Job; label: string }[] = [
  { code: 'OP', label: 'Operate' },
  { code: 'IN', label: 'Investigate' },
  { code: 'MO', label: 'Model' },
  { code: 'AD', label: 'Administer' },
];

export function IconRail({ activeJob, onSelectJob }: IconRailProps): ReactNode {
  return (
    <nav className="shell__icon-rail" aria-label="Jobs">
      <div className="icon-rail__logo">SC</div>
      <div className="icon-rail__group">
        {JOBS.map(job => {
          const active = job.code === activeJob;
          return (
            <button
              key={job.code}
              type="button"
              className="icon-rail__item"
              onClick={() => onSelectJob(job.code)}
              aria-label={job.label}
              aria-current={active ? 'page' : undefined}
            >
              <span className={active ? 'icon-rail__bar' : 'icon-rail__bar icon-rail__bar--inactive'} />
              <span className={active ? 'icon-rail__code' : 'icon-rail__code icon-rail__code--inactive'}>{job.code}</span>
            </button>
          );
        })}
      </div>
      <div className="icon-rail__spacer" />
      <span className="icon-rail__initials">JO</span>
    </nav>
  );
}
