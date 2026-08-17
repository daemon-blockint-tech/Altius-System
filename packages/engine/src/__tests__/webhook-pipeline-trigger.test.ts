/**
 * WebhookPipelineTrigger tests.
 *
 * Uses a stubbed FunctionPipeline so tests don't need real Git or Python.
 */
import { describe, it, expect, vi } from 'vitest';
import { WebhookPipelineTrigger } from '../functions/webhook-pipeline-trigger.js';
import type { FunctionPipeline, PipelineResult } from '../functions/function-pipeline.js';
import { createHmac } from 'node:crypto';

function makePipeline(): FunctionPipeline {
  return {
    run: vi.fn().mockResolvedValue({
      functionName: 'TestFn',
      stage: 'done',
      success: true,
      revisionId: 'rev-1',
      commit: 'abc123',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 100,
    } as PipelineResult),
  } as unknown as FunctionPipeline;
}

const SECRET = 'test-secret';

describe('WebhookPipelineTrigger', () => {
  describe('GitHub webhook', () => {
    it('verifies a valid signature and runs the pipeline', async () => {
      const pipeline = makePipeline();
      const trigger = new WebhookPipelineTrigger(pipeline, {
        secret: SECRET,
        pipelines: [{
          repoUrl: 'https://github.com/org/repo.git',
          ref: 'main',
          pipeline: {
            functionName: 'TestFn',
            runtime: 'cel',
            entry: '1 + 1',
            repo: { url: 'https://github.com/org/repo.git' },
          },
        }],
      });

      const body = JSON.stringify({
        ref: 'refs/heads/main',
        repository: { clone_url: 'https://github.com/org/repo.git' },
      });
      const sig = 'sha256=' + createHmac('sha256', SECRET).update(body).digest('hex');

      const result = await trigger.handleGitHubWebhook(
        { 'x-hub-signature-256': sig, 'x-github-event': 'push' },
        body,
      );

      expect(result.verified).toBe(true);
      expect(result.processed).toBe(1);
      expect(result.results).toHaveLength(1);
      expect(pipeline.run).toHaveBeenCalledOnce();
    });

    it('rejects an invalid signature', async () => {
      const pipeline = makePipeline();
      const trigger = new WebhookPipelineTrigger(pipeline, {
        secret: SECRET,
        pipelines: [],
      });

      const result = await trigger.handleGitHubWebhook(
        { 'x-hub-signature-256': 'sha256=invalid', 'x-github-event': 'push' },
        '{}',
      );

      expect(result.verified).toBe(false);
      expect(result.error).toBe('Invalid signature');
      expect(pipeline.run).not.toHaveBeenCalled();
    });

    it('rejects a missing signature header', async () => {
      const pipeline = makePipeline();
      const trigger = new WebhookPipelineTrigger(pipeline, {
        secret: SECRET,
        pipelines: [],
      });

      const result = await trigger.handleGitHubWebhook({}, '{}');

      expect(result.verified).toBe(false);
      expect(result.error).toBe('Missing X-Hub-Signature-256 header');
    });

    it('ignores non-push events', async () => {
      const pipeline = makePipeline();
      const trigger = new WebhookPipelineTrigger(pipeline, {
        secret: SECRET,
        pipelines: [{
          repoUrl: 'https://github.com/org/repo.git',
          pipeline: {
            functionName: 'TestFn',
            runtime: 'cel',
            entry: '1 + 1',
            repo: { url: 'https://github.com/org/repo.git' },
          },
        }],
      });

      const body = '{}';
      const sig = 'sha256=' + createHmac('sha256', SECRET).update(body).digest('hex');

      const result = await trigger.handleGitHubWebhook(
        { 'x-hub-signature-256': sig, 'x-github-event': 'ping' },
        body,
      );

      expect(result.verified).toBe(true);
      expect(result.processed).toBe(0);
      expect(pipeline.run).not.toHaveBeenCalled();
    });

    it('does not run pipelines for non-matching repos', async () => {
      const pipeline = makePipeline();
      const trigger = new WebhookPipelineTrigger(pipeline, {
        secret: SECRET,
        pipelines: [{
          repoUrl: 'https://github.com/org/repo.git',
          pipeline: {
            functionName: 'TestFn',
            runtime: 'cel',
            entry: '1 + 1',
            repo: { url: 'https://github.com/org/repo.git' },
          },
        }],
      });

      const body = JSON.stringify({
        ref: 'refs/heads/main',
        repository: { clone_url: 'https://github.com/other/repo.git' },
      });
      const sig = 'sha256=' + createHmac('sha256', SECRET).update(body).digest('hex');

      const result = await trigger.handleGitHubWebhook(
        { 'x-hub-signature-256': sig, 'x-github-event': 'push' },
        body,
      );

      expect(result.verified).toBe(true);
      expect(result.processed).toBe(0);
      expect(pipeline.run).not.toHaveBeenCalled();
    });

    it('filters by branch when ref is specified', async () => {
      const pipeline = makePipeline();
      const trigger = new WebhookPipelineTrigger(pipeline, {
        secret: SECRET,
        pipelines: [{
          repoUrl: 'https://github.com/org/repo.git',
          ref: 'main',
          pipeline: {
            functionName: 'TestFn',
            runtime: 'cel',
            entry: '1 + 1',
            repo: { url: 'https://github.com/org/repo.git' },
          },
        }],
      });

      const body = JSON.stringify({
        ref: 'refs/heads/develop',
        repository: { clone_url: 'https://github.com/org/repo.git' },
      });
      const sig = 'sha256=' + createHmac('sha256', SECRET).update(body).digest('hex');

      const result = await trigger.handleGitHubWebhook(
        { 'x-hub-signature-256': sig, 'x-github-event': 'push' },
        body,
      );

      expect(result.processed).toBe(0);
    });
  });

  describe('GitLab webhook', () => {
    it('verifies a valid token and runs the pipeline', async () => {
      const pipeline = makePipeline();
      const trigger = new WebhookPipelineTrigger(pipeline, {
        secret: SECRET,
        pipelines: [{
          repoUrl: 'https://gitlab.com/org/repo.git',
          ref: 'main',
          pipeline: {
            functionName: 'TestFn',
            runtime: 'cel',
            entry: '1 + 1',
            repo: { url: 'https://gitlab.com/org/repo.git' },
          },
        }],
      });

      const body = JSON.stringify({
        ref: 'refs/heads/main',
        project: { git_http_url: 'https://gitlab.com/org/repo.git' },
      });

      const result = await trigger.handleGitLabWebhook(
        { 'x-gitlab-token': SECRET, 'x-gitlab-event': 'Push Hook' },
        body,
      );

      expect(result.verified).toBe(true);
      expect(result.processed).toBe(1);
      expect(pipeline.run).toHaveBeenCalledOnce();
    });

    it('rejects an invalid token', async () => {
      const pipeline = makePipeline();
      const trigger = new WebhookPipelineTrigger(pipeline, {
        secret: SECRET,
        pipelines: [],
      });

      const result = await trigger.handleGitLabWebhook(
        { 'x-gitlab-token': 'wrong', 'x-gitlab-event': 'Push Hook' },
        '{}',
      );

      expect(result.verified).toBe(false);
      expect(result.error).toBe('Invalid token');
    });
  });

  describe('generic webhook', () => {
    it('runs matching pipelines without signature verification', async () => {
      const pipeline = makePipeline();
      const trigger = new WebhookPipelineTrigger(pipeline, {
        secret: SECRET,
        pipelines: [{
          repoUrl: 'https://github.com/org/repo.git',
          pipeline: {
            functionName: 'TestFn',
            runtime: 'cel',
            entry: '1 + 1',
            repo: { url: 'https://github.com/org/repo.git' },
          },
        }],
      });

      const result = await trigger.handleGenericWebhook(
        'https://github.com/org/repo.git',
        'main',
      );

      expect(result.verified).toBe(true);
      expect(result.processed).toBe(1);
      expect(pipeline.run).toHaveBeenCalledOnce();
    });
  });

  describe('timing-safe comparison', () => {
    it('rejects signatures of different length without error', async () => {
      const pipeline = makePipeline();
      const trigger = new WebhookPipelineTrigger(pipeline, {
        secret: SECRET,
        pipelines: [],
      });

      const result = await trigger.handleGitHubWebhook(
        { 'x-hub-signature-256': 'sha256=short', 'x-github-event': 'push' },
        '{}',
      );

      expect(result.verified).toBe(false);
    });
  });
});
