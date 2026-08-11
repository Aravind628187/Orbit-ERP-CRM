import type { PoolClient } from 'pg';
import { AppError } from '../utils/http.js';

export interface StockLine { product_id: string; quantity: number }

export async function adjustChallanStock(db: PoolClient, challanId: string, items: StockLine[], direction: 'IN' | 'OUT', userId: string): Promise<number> {
  let affected = 0;
  // Always acquire row locks in a stable order so concurrent challans cannot deadlock.
  const orderedItems = [...items].sort((a,b) => a.product_id.localeCompare(b.product_id));
  for (const item of orderedItems) {
    const found = await db.query<{ current_stock: number; product_name: string }>(
      'SELECT current_stock,product_name FROM products WHERE id=$1 FOR UPDATE', [item.product_id],
    );
    const product = found.rows[0];
    if (!product) throw new AppError(404, `Product ${item.product_id} no longer exists.`, 'PRODUCT_NOT_FOUND');
    if (direction === 'OUT' && product.current_stock < item.quantity) {
      throw new AppError(409, `Insufficient stock for ${product.product_name}.`, 'INSUFFICIENT_STOCK', {
        productId: item.product_id, productName: product.product_name, available: product.current_stock, requested: item.quantity,
      });
    }
    const delta = direction === 'OUT' ? -item.quantity : item.quantity;
    await db.query('UPDATE products SET current_stock=current_stock+$1,updated_at=NOW() WHERE id=$2', [delta, item.product_id]);
    await db.query(
      `INSERT INTO stock_movements(product_id,quantity_changed,movement_type,reason,challan_id,created_by)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [item.product_id, item.quantity, direction, `${direction === 'OUT' ? 'Issued through' : 'Returned from'} challan`, challanId, userId],
    );
    affected += item.quantity;
  }
  return affected;
}
