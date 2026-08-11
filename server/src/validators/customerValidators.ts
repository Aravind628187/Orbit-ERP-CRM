import { z } from 'zod';
export const optionalText = z.string().trim().optional().nullable().transform((value) => value || null);
const optionalDate = z.union([z.iso.date(), z.literal(''), z.null()]).optional().transform((value) => value || null);
const optionalGst = z.union([z.string().trim().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Enter a valid 15-character GSTIN.'), z.literal(''), z.null()]).optional().transform((value) => value || null);
export const customerSchema = z.object({
  customer_name: z.string().trim().min(2).max(150),
  mobile: z.string().trim().regex(/^[0-9+() -]{7,20}$/),
  email: z.union([z.email(), z.literal('')]).optional().transform((value) => value || null),
  business_name: z.string().trim().min(2).max(180),
  gst_number: optionalGst,
  customer_type: z.enum(['Retail', 'Wholesale', 'Distributor']),
  address: z.string().trim().min(5),
  status: z.enum(['Lead', 'Active', 'Inactive']),
  follow_up_date: optionalDate,
  notes: optionalText,
});
export const followupSchema = z.object({ note: z.string().trim().min(2).max(2000), next_follow_up_date: optionalDate });
export const followupActionSchema = z.object({ note: z.string().trim().max(2000).optional().nullable() });
export const rescheduleFollowupSchema = z.object({
  scheduled_at: z.iso.datetime({ offset: true }),
  note: z.string().trim().min(2).max(2000).optional(),
});
