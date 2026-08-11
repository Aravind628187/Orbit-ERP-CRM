import { z } from 'zod';
export const challanSchema = z.object({ customer_id: z.uuid(), items: z.array(z.object({ product_id: z.uuid(), quantity: z.coerce.number().int().positive() })).min(1), status: z.enum(['Draft', 'Confirmed']).default('Draft'), notes: z.string().trim().max(2000).optional().nullable() });
export const challanStatusSchema = z.object({ status: z.enum(['Confirmed', 'Cancelled']) });
