import { z } from 'zod';
export const optionalText = z.string().trim().optional().nullable().transform((value) => value || null);
export const customerSchema = z.object({
  customer_name: z.string().trim().min(2).max(150),
  mobile: z.string().trim().regex(/^[0-9+() -]{7,20}$/),
  email: z.union([z.email(), z.literal('')]).optional().transform((value) => value || null),
  business_name: z.string().trim().min(2).max(180),
  gst_number: optionalText,
  customer_type: z.enum(['Retail', 'Wholesale', 'Distributor']),
  address: z.string().trim().min(5),
  status: z.enum(['Lead', 'Active', 'Inactive']),
  follow_up_date: optionalText,
  notes: optionalText,
});
export const followupSchema = z.object({ note: z.string().trim().min(2).max(2000), next_follow_up_date: optionalText });
export const followupActionSchema = z.object({ note: z.string().trim().max(2000).optional().nullable() });
export const rescheduleFollowupSchema = z.object({
  scheduled_at: z.iso.datetime({ offset: true }),
  note: z.string().trim().min(2).max(2000).optional(),
});
