import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1).default('postgresql://orbit:orbit_local_password@localhost:5432/orbit_erp'),
  DATABASE_SSL: z.enum(['true', 'false']).default('false'),
  JWT_SECRET: z.string().min(16).default('local-development-secret-change-me'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  JWT_ISSUER: z.string().default('orbit-erp-api'),
  JWT_AUDIENCE: z.string().default('orbit-erp-web'),
  CLIENT_URL: z.string().default('http://localhost:5173'),
});

const parsed = schema.parse(process.env);
if (parsed.NODE_ENV === 'production' && parsed.JWT_SECRET === 'local-development-secret-change-me') {
  throw new Error('JWT_SECRET must be configured securely in production.');
}

export const config = {
  nodeEnv: parsed.NODE_ENV,
  port: parsed.PORT,
  databaseUrl: parsed.DATABASE_URL,
  databaseSsl: parsed.DATABASE_SSL === 'true',
  jwtSecret: parsed.JWT_SECRET,
  jwtExpiresIn: parsed.JWT_EXPIRES_IN,
  jwtIssuer: parsed.JWT_ISSUER,
  jwtAudience: parsed.JWT_AUDIENCE,
  clientOrigins: parsed.CLIENT_URL.split(',').map((origin) => origin.trim()),
};
