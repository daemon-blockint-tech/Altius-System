/**
 * WebhookPipelineTrigger — receives Git webhook payloads and triggers
 * the FunctionPipeline for matching functions.
 *
 * A deployment mounts this as a REST endpoint (POST /api/v1/functions-lifecycle/webhook).
 * When a Git provider (GitHub, GitLab, Bitbucket) sends a push webhook,
 * the trigger:
 *   1. Validates the webhook signature (HMAC-SHA256 for GitHub, token for GitLab)
 *   2. Parses the payload to determine which repo/branch was pushed
 *   3. Finds pipeline configs that match the repo+branch
 *   4. Runs the FunctionPipeline for each matching function
 *   5. Returns the pipeline results
 *
 * Security: the webhook secret is configured per-deployment. The signature
 * is verified BEFORE any pipeline runs, so an unauthenticated request cannot
 * trigger code execution.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FunctionPipeline, PipelineResult, PipelineConfig } from './function-pipeline.js';

/** Configuration for the webhook trigger. */
export interface WebhookTriggerConfig {
  /** Webhook secret for HMAC signature verification. */
  secret: string;
  /** Pipeline configs indexed by repo URL + ref. */
  pipelines: WebhookPipelineMapping[];
}

/** Maps a webhook event to a pipeline config. */
export interface WebhookPipelineMapping {
  /** Git repository URL (must match the repo URL in the webhook payload). */
  repoUrl: string;
  /** Branch or tag (must match the ref in the webhook payload). Default: 'main'. */
  ref?: string;
  /** Pipeline configuration to run when this repo+ref is pushed. */
  pipeline: PipelineConfig;
}

/** Result of processing a webhook. */
export interface WebhookResult {
  verified: boolean;
  processed: number;
  results: PipelineResult[];
  error?: string;
}

/** Supported webhook payload formats. */
export type WebhookProvider = 'github' | 'gitlab' | 'generic';

/**
 * Webhook trigger for the function pipeline.
 *
 * Usage:
 *   const trigger = new WebhookPipelineTrigger(pipeline, config);
 *   const result = await trigger.handleGitHubWebhook(headers, body);
 */
export class WebhookPipelineTrigger {
  constructor(
    private readonly pipeline: FunctionPipeline,
    private readonly config: WebhookTriggerConfig,
  ) {}

  /**
   * Handle a GitHub-style webhook.
   *
   * GitHub sends:
   *   - X-Hub-Signature-256: sha256=<hex hmac>
   *   - X-GitHub-Event: push
   *   - Body: { repository: { clone_url: ... }, ref: "refs/heads/main", ... }
   */
  async handleGitHubWebhook(
    headers: Record<string, string>,
    body: string,
  ): Promise<WebhookResult> {
    // Verify signature
    const signature = headers['x-hub-signature-256'] ?? headers['X-Hub-Signature-256'];
    if (!signature) {
      return { verified: false, processed: 0, results: [], error: 'Missing X-Hub-Signature-256 header' };
    }
    if (!this._verifyGitHubSignature(body, signature)) {
      return { verified: false, processed: 0, results: [], error: 'Invalid signature' };
    }

    // Parse payload
    let payload: GitHubPushPayload;
    try {
      payload = JSON.parse(body) as GitHubPushPayload;
    } catch {
      return { verified: false, processed: 0, results: [], error: 'Invalid JSON payload' };
    }

    // Only handle push events
    const event = headers['x-github-event'] ?? headers['X-GitHub-Event'];
    if (event !== 'push') {
      return { verified: true, processed: 0, results: [] };
    }

    const repoUrl = payload.repository?.clone_url;
    if (!repoUrl) {
      return { verified: true, processed: 0, results: [], error: 'No repository.clone_url in payload' };
    }

    // Extract branch from ref (refs/heads/main → main)
    const ref = payload.ref?.replace('refs/heads/', '');

    return this._runMatchingPipelines(repoUrl, ref);
  }

  /**
   * Handle a GitLab-style webhook.
   *
   * GitLab sends:
   *   - X-Gitlab-Token: <secret token>
   *   - X-Gitlab-Event: Push Hook
   *   - Body: { project: { git_http_url: ... }, ref: "main", ... }
   */
  async handleGitLabWebhook(
    headers: Record<string, string>,
    body: string,
  ): Promise<WebhookResult> {
    // Verify token
    const token = headers['x-gitlab-token'] ?? headers['X-Gitlab-Token'];
    if (!token) {
      return { verified: false, processed: 0, results: [], error: 'Missing X-Gitlab-Token header' };
    }
    if (!this._verifyGitLabToken(token)) {
      return { verified: false, processed: 0, results: [], error: 'Invalid token' };
    }

    // Parse payload
    let payload: GitLabPushPayload;
    try {
      payload = JSON.parse(body) as GitLabPushPayload;
    } catch {
      return { verified: false, processed: 0, results: [], error: 'Invalid JSON payload' };
    }

    const event = headers['x-gitlab-event'] ?? headers['X-Gitlab-Event'];
    if (event !== 'Push Hook') {
      return { verified: true, processed: 0, results: [] };
    }

    const repoUrl = payload.project?.git_http_url;
    if (!repoUrl) {
      return { verified: true, processed: 0, results: [], error: 'No project.git_http_url in payload' };
    }

    const ref = payload.ref?.replace('refs/heads/', '');

    return this._runMatchingPipelines(repoUrl, ref);
  }

  /**
   * Handle a generic webhook with manual repo+ref specification.
   *
   * No signature verification — the caller is responsible for authentication.
   * Useful for internal triggers (cron, manual, CI completion).
   */
  async handleGenericWebhook(
    repoUrl: string,
    ref?: string,
  ): Promise<WebhookResult> {
    return this._runMatchingPipelines(repoUrl, ref);
  }

  // ── Private ──

  private async _runMatchingPipelines(
    repoUrl: string,
    ref?: string,
  ): Promise<WebhookResult> {
    const matching = this.config.pipelines.filter((m) => {
      if (m.repoUrl !== repoUrl) return false;
      if (m.ref && ref && m.ref !== ref) return false;
      return true;
    });

    if (matching.length === 0) {
      return { verified: true, processed: 0, results: [] };
    }

    const results: PipelineResult[] = [];
    for (const mapping of matching) {
      // Override the repo config with the actual repo URL from the webhook
      const pipelineConfig: PipelineConfig = {
        ...mapping.pipeline,
        repo: {
          ...mapping.pipeline.repo,
          url: repoUrl,
          ref: ref ?? mapping.pipeline.repo.ref,
        },
      };
      const result = await this.pipeline.run(pipelineConfig);
      results.push(result);
    }

    return { verified: true, processed: matching.length, results };
  }

  private _verifyGitHubSignature(body: string, signature: string): boolean {
    // signature format: "sha256=<hex>"
    const parts = signature.split('=');
    if (parts.length !== 2 || parts[0] !== 'sha256') return false;

    const expected = parts[1]!;
    const computed = createHmac('sha256', this.config.secret)
      .update(body)
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    if (expected.length !== computed.length) return false;
    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(computed));
    } catch {
      return false;
    }
  }

  private _verifyGitLabToken(token: string): boolean {
    // Constant-time comparison
    const expected = this.config.secret;
    if (token.length !== expected.length) return false;
    try {
      return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
    } catch {
      return false;
    }
  }
}

// ── Payload types ──

interface GitHubPushPayload {
  ref?: string;
  repository?: {
    clone_url?: string;
    html_url?: string;
    name?: string;
  };
}

interface GitLabPushPayload {
  ref?: string;
  project?: {
    git_http_url?: string;
    name?: string;
  };
}
