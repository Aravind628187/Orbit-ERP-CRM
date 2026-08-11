import type { RequestHandler } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { pool } from '../db/pool.js';
import { config } from '../config/env.js';
import type { AuthUser, UserRole } from '../types/index.js';
import { loginSchema } from '../validators/authValidators.js';
import { AppError, ok } from '../utils/http.js';
import { recordAudit } from '../repositories/auditRepository.js';

export const login: RequestHandler = async (req, res) => {
  const input = loginSchema.parse(req.body);
  const result = await pool.query<{ id: string; name: string; email: string; password_hash: string; role: UserRole }>('SELECT id,name,email,password_hash,role FROM users WHERE email=$1', [input.email]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(input.password, user.password_hash))) throw new AppError(401, 'Email or password is incorrect.', 'INVALID_CREDENTIALS');
  const payload: AuthUser = { id: user.id, name: user.name, email: user.email, role: user.role };
  const token = jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
  } as SignOptions);
  await recordAudit({ actorId: user.id, action: 'user.login', entityType: 'user', entityId: user.id, description: `${user.name} signed in.` });
  ok(res, { token, user: payload });
};

export const me: RequestHandler = (req, res) => { ok(res, { user: req.user }); };
