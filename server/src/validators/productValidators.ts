import { z } from 'zod';
export const productSchema = z.object({
  product_name: z.string().trim().min(2).max(180), sku: z.string().trim().min(2).max(60).transform((value) => value.toUpperCase()),
  category: z.string().trim().min(2).max(100), unit_price: z.coerce.number().min(0), minimum_stock: z.coerce.number().int().min(0),
  warehouse_location: z.string().trim().min(2).max(120), initial_stock: z.coerce.number().int().min(0).optional(),
  image_url: z.union([z.url(), z.literal('')]).optional().transform((value) => value || null),
});
export const movementSchema = z.object({ movement_type: z.enum(['IN', 'OUT']), quantity: z.coerce.number().int().positive(), reason: z.string().trim().min(3).max(255) });
