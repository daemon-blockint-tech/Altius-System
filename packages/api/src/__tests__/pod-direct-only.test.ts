import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { podDirectOnly } from '../metrics.js';

function mockReqRes(headers: Record<string, string>) {
  const req = { headers } as unknown as Request;
  const end = vi.fn();
  const res = { status: vi.fn().mockReturnValue({ end }), end } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;
  return { req, res, next, end };
}

describe('podDirectOnly (guards /metrics and /admin/packs)', () => {
  it('returns 404 for ingress traffic (X-Forwarded-For present) in production', () => {
    const { req, res, next } = mockReqRes({ 'x-forwarded-for': '203.0.113.7' });
    podDirectOnly(false)(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('passes pod-direct traffic (no X-Forwarded-For) in production', () => {
    const { req, res, next } = mockReqRes({});
    podDirectOnly(false)(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('passes ingress traffic in dev mode', () => {
    const { req, res, next } = mockReqRes({ 'x-forwarded-for': '203.0.113.7' });
    podDirectOnly(true)(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
