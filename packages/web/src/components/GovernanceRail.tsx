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

export interface GovernanceUser {
  displayName: string;
  email: string;
  tenant: string;
  subjectId: string;
  relations: ReactNode;
}

export interface HiddenItem {
  title: string;
  description: ReactNode;
}

export interface FeedEvent {
  time: string;
  text: ReactNode;
}

export interface GovernanceRailProps {
  user: GovernanceUser;
  hidden: HiddenItem[];
  feed: FeedEvent[];
  feedLive: boolean;
}

export function GovernanceRail({ user, hidden, feed, feedLive }: GovernanceRailProps): ReactNode {
  return (
    <aside className="shell__governance-rail">
      <div>
        <span className="gov-rail__heading">SIGNED IN</span>
        <p className="gov-rail__user-name">{user.displayName}</p>
        <p className="gov-rail__user-meta">
          {user.email}<br />
          tenant {user.tenant} · sub {user.subjectId}
        </p>
        <p className="gov-rail__user-relations">{user.relations}</p>
      </div>

      <div className="gov-rail__divider" />

      <div>
        <span className="gov-rail__heading">WHAT THIS VIEW HIDES</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {hidden.map((item, i) => (
            <div key={i} className="gov-rail__hidden-item">
              <p className="gov-rail__hidden-title">{item.title}</p>
              <p className="gov-rail__hidden-desc">{item.description}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="gov-rail__divider" />

      <div>
        <div className="gov-rail__feed-header">
          <span className="gov-rail__heading" style={{ margin: 0 }}>EVENT FEED</span>
          <span className="gov-rail__feed-live">{feedLive ? 'live' : 'paused'}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {feed.map((event, i) => (
            <div key={i} className="gov-rail__feed-item">
              <span className="gov-rail__feed-time">{event.time}</span>
              <span className="gov-rail__feed-text">{event.text}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
