import { z } from 'zod';
export const loginSchema = z.object({ email: z.email().transform((value) => value.toLowerCase()), password: z.string().min(6) });
