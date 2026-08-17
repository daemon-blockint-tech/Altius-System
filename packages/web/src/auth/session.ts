/**
 * Holds the token set and exposes it as the SDK's `TokenProvider`.
 *
 * Tokens are kept in MEMORY ONLY — never localStorage or sessionStorage. This
 * app reads patient data, and a persisted token is readable by any XSS that
 * lands on the page, outliving the tab it was stolen from. The cost is that a
 * refresh of the browser page loses the session and re-runs the redirect; with
 * the IdP session cookie still valid that is a round trip, not a re-login.
 *
 * (The PKCE verifier does go in sessionStorage, because it has to survive the
 * redirect — but it is single-use, tab-scoped and worthless without the code.)
 */

import type { OidcConfig, TokenSet } from './pkce.js';
import { refreshTokens } from './pkce.js';

/** Refresh this far ahead of expiry so an in-flight request cannot straddle it. */
const REFRESH_SKEW_MS = 30_000;

export class AuthSession {
  private tokens: TokenSet | null = null;
  /** In-flight refresh, so N concurrent requests trigger one token call. */
  private refreshing: Promise<TokenSet> | null = null;

  constructor(
    private readonly config: OidcConfig,
    private readonly now: () => number = Date.now,
    /**
     * Called once when the session can no longer be renewed.
     *
     * Without it the app stays signed-in forever: every request throws, the
     * table offers a Retry that can never succeed, and nothing routes the user
     * back to login. Expiry is normal — the refresh token has its own lifetime
     * — so it needs a path, not an error message.
     */
    private readonly onExpired?: () => void,
  ) {}

  adopt(tokens: TokenSet): void {
    this.tokens = tokens;
  }

  clear(): void {
    this.tokens = null;
    this.refreshing = null;
  }

  /** Drop the session and notify once. Idempotent, so N concurrent failures
   *  produce one trip back to login rather than N. */
  private expire(): void {
    if (!this.tokens) return;
    this.tokens = null;
    this.onExpired?.();
  }

  get isAuthenticated(): boolean {
    return this.tokens !== null;
  }

  /**
   * The SDK calls this per request and when the socket opens, so returning a
   * fresh token here is the whole refresh mechanism.
   */
  getAccessToken = async (): Promise<string> => {
    const current = this.tokens;
    if (!current) throw new Error('Not authenticated.');

    if (this.now() < current.expiresAt - REFRESH_SKEW_MS) {
      return current.accessToken;
    }

    if (!current.refreshToken) {
      // Nothing to refresh with: surface it rather than sending a token the
      // gateway will reject with an unexplained 401.
      this.expire();
      throw new Error('Access token expired and no refresh token is available.');
    }

    // Collapse concurrent refreshes. Without this, a table firing several
    // queries at once would spend N refresh tokens; with rotation enabled each
    // one invalidates the last and all but one request fails.
    this.refreshing ??= refreshTokens(this.config, current.refreshToken, this.now())
      .then(next => {
        this.tokens = next;
        return next;
      })
      .catch((err: unknown) => {
        // A failed refresh ends the session: the refresh token is spent or
        // expired, and retrying only reuses it.
        this.expire();
        throw err;
      })
      .finally(() => {
        this.refreshing = null;
      });

    return (await this.refreshing).accessToken;
  };
}
