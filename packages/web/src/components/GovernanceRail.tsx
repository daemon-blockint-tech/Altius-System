/**
 * Governance rail — the persistent right-hand panel.
 *
 * Three blocks, all governance, all visible at once:
 *  1. Signed-in principal: who you are, what tenant, what relations you hold.
 *  2. What this view hides: filtered rows, redacted fields, consent state.
 *  3. Event feed: live CDC events, ticking at the 250ms coalesce cadence.
 *
 * The rail speaks as data on ops screens. On explainer screens it would
 * switch to prose, but this implementation covers the ops screen first.
 */

import type { ReactNode } from 'react';

export interface GovernancePrincipal {
  name: string;
  email: string;
  tenant: string;
  sub: string;
  /** Human-readable summary of relations. */
  relationsSummary: ReactNode;
}

export interface GovernanceHidden {
  title: string;
  detail: ReactNode;
}

export interface GovernanceEvent {
  time: string;
  text: ReactNode;
}

export interface GovernanceRailProps {
  principal: GovernancePrincipal;
  hidden: GovernanceHidden[];
  events: GovernanceEvent[];
  live: boolean;
}

export function GovernanceRail({ principal, hidden, events, live }: GovernanceRailProps): ReactNode {
  return (
    <aside className="ed-gov-rail" aria-label="Governance">
      {/* Signed in */}
      <div>
        <span className="ed-gov-rail__label">SIGNED IN</span>
        <p className="ed-gov-rail__user-name">{principal.name}</p>
        <p className="ed-gov-rail__user-meta">
          {principal.email}<br />
          tenant {principal.tenant} · sub {principal.sub}
        </p>
        <p className="ed-gov-rail__user-relations">{principal.relationsSummary}</p>
      </div>

      <div className="ed-gov-rail__divider" />

      {/* What this view hides */}
      <div>
        <span className="ed-gov-rail__label">WHAT THIS VIEW HIDES</span>
        <div>
          {hidden.length > 0 ? (
            hidden.map((item, i) => (
              <div key={i} className="ed-gov-hidden__item">
                <p className="ed-gov-hidden__title">{item.title}</p>
                <p className="ed-gov-hidden__detail">{item.detail}</p>
              </div>
            ))
          ) : (
            <p className="ed-muted">Per-view redaction and filtering are enforced server-side; this deployment does not surface a summary here.</p>
          )}
        </div>
      </div>

      <div className="ed-gov-rail__divider" />

      {/* Event feed */}
      <div>
        <div className="ed-gov-feed__header">
          <span className="ed-gov-rail__label" style={{ marginBottom: 0 }}>
            EVENT FEED
          </span>
          <span className="ed-gov-feed__live">{live ? 'live' : 'paused'}</span>
        </div>
        <div className="ed-gov-feed__list">
          {events.length > 0 ? (
            events.map((event, i) => (
              <div key={i} className="ed-gov-feed__event">
                <span className="ed-gov-feed__time">{event.time}</span>
                <span className="ed-gov-feed__text">{event.text}</span>
              </div>
            ))
          ) : (
            <p className="ed-muted">No recent events.</p>
          )}
        </div>
      </div>
    </aside>
  );
}
