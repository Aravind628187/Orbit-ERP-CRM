import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import type { AuthUser, UserRole } from '../types/index.js';
import { AppError } from '../utils/http.js';
import { z } from 'zod';

const authUserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(['Admin', 'Sales', 'Warehouse', 'Accounts']),
});

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return next(new AppError(401, 'Authentication required.', 'AUTH_REQUIRED'));
  try {
    const payload = jwt.verify(token, config.jwtSecret, {
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
    });
    req.user = authUserSchema.parse(payload) as AuthUser;
    next();
  } catch {
    next(new AppError(401, 'Your session is invalid or has expired.', 'SESSION_INVALID'));
  }
}

export const allowRoles = (...roles: UserRole[]) => (req: Request, _res: Response, next: NextFunction): void => {
  if (!roles.includes(req.user.role)) return next(new AppError(403, 'You do not have permission to perform this action.', 'FORBIDDEN'));
  next();
};
