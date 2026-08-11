import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/http.js';

type Attempt = { count: number; resetAt: number };
const attempts = new Map<string, Attempt>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export function loginRateLimit(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const current = attempts.get(key);
  const attempt = !current || current.resetAt <= now ? { count: 0, resetAt: now + WINDOW_MS } : current;
  attempt.count += 1;
  attempts.set(key, attempt);
  res.setHeader('RateLimit-Limit', MAX_ATTEMPTS);
  res.setHeader('RateLimit-Remaining', Math.max(0, MAX_ATTEMPTS - attempt.count));
  res.setHeader('RateLimit-Reset', Math.ceil(attempt.resetAt / 1000));
  if (attempt.count > MAX_ATTEMPTS) {
    res.setHeader('Retry-After', Math.ceil((attempt.resetAt - now) / 1000));
    return next(new AppError(429, 'Too many sign-in attempts. Please try again later.', 'RATE_LIMITED'));
  }
  res.on('finish', () => { if (res.statusCode < 400) attempts.delete(key); });
  next();
}
