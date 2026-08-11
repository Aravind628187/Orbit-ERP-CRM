import type { RequestHandler } from 'express';
import { pool, withTransaction } from '../db/pool.js';
import { recordAudit } from '../repositories/auditRepository.js';
import { movementSchema, productSchema } from '../validators/productValidators.js';
import { AppError, ok, paginated, parsePagination } from '../utils/http.js';

export const listProducts: RequestHandler = async (req, res) => {
const { page, limit, offset } = parsePagination(req.query);
  const search = String(req.query.search ?? '').trim(), stock = String(req.query.stock ?? ''), category = String(req.query.category ?? ''), warehouse = String(req.query.warehouse ?? '');
  if(!['','out','low','healthy'].includes(stock))throw new AppError(422,'Invalid stock filter.','VALIDATION_ERROR');
  const allowedSorts: Record<string,string>={updated:'updated_at',name:'product_name',sku:'sku',stock:'current_stock',price:'unit_price'};
  const sort=allowedSorts[String(req.query.sort??'')]??'updated_at';
  const direction=String(req.query.direction??'').toLowerCase()==='asc'?'ASC':'DESC';
  const where = `WHERE ($1='' OR product_name ILIKE $1 OR sku ILIKE $1 OR category ILIKE $1)
    AND ($2='' OR ($2='out' AND current_stock=0) OR ($2='low' AND current_stock>0 AND current_stock<=minimum_stock) OR ($2='healthy' AND current_stock>minimum_stock))
    AND ($3='' OR category=$3) AND ($4='' OR warehouse_location=$4)`;
  const values = [`%${search}%`, stock, category, warehouse];
  const [rows, count, facets, summary] = await Promise.all([
    pool.query(`SELECT *,(current_stock<=minimum_stock) low_stock,CASE WHEN current_stock=0 THEN 'Out of Stock' WHEN current_stock<=minimum_stock THEN 'Low Stock' ELSE 'Healthy' END stock_health FROM products ${where} ORDER BY ${sort} ${direction},id LIMIT $5 OFFSET $6`, [...values,limit,offset]),
    pool.query(`SELECT COUNT(*) FROM products ${where}`, values),
    pool.query(`SELECT ARRAY_AGG(DISTINCT category ORDER BY category) categories,ARRAY_AGG(DISTINCT warehouse_location ORDER BY warehouse_location) warehouses FROM products`),
    pool.query(`SELECT COUNT(*)::int total_products,COALESCE(SUM(current_stock*unit_price),0) inventory_value,COUNT(*) FILTER(WHERE current_stock>minimum_stock)::int healthy_stock,COUNT(*) FILTER(WHERE current_stock>0 AND current_stock<=minimum_stock)::int low_stock,COUNT(*) FILTER(WHERE current_stock=0)::int out_of_stock FROM products`),
  ]);
  ok(res, { ...paginated(rows.rows,count.rows[0]?.count ?? 0,page,limit), facets: facets.rows[0], summary: summary.rows[0] });
};

export const getProduct: RequestHandler = async (req, res) => {
  const [product,challans] = await Promise.all([
    pool.query(`SELECT *,(current_stock<=minimum_stock) low_stock,CASE WHEN current_stock=0 THEN 'Out of Stock' WHEN current_stock<=minimum_stock THEN 'Low Stock' ELSE 'Healthy' END stock_health FROM products WHERE id=$1`,[req.params.id]),
    pool.query(`SELECT c.id,c.challan_number,c.status,c.created_at,ci.quantity FROM challan_items ci JOIN challans c ON c.id=ci.challan_id WHERE ci.product_id=$1 ORDER BY c.created_at DESC LIMIT 10`, [req.params.id]),
  ]);
  if (!product.rows[0]) throw new AppError(404,'Product not found.','PRODUCT_NOT_FOUND');
  ok(res, {...product.rows[0],challans:challans.rows});
};

export const createProduct: RequestHandler = async (req,res) => {
  const d=productSchema.parse(req.body), initial=d.initial_stock ?? 0;
  const product=await withTransaction(async (db) => {
    const created=(await db.query(`INSERT INTO products(product_name,sku,category,unit_price,current_stock,minimum_stock,warehouse_location,image_url,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[d.product_name,d.sku,d.category,d.unit_price,initial,d.minimum_stock,d.warehouse_location,d.image_url,req.user.id])).rows[0];
    if(initial>0) await db.query(`INSERT INTO stock_movements(product_id,quantity_changed,movement_type,reason,created_by) VALUES($1,$2,'IN','Opening stock',$3)`,[created.id,initial,req.user.id]);
    await recordAudit({ actorId:req.user.id,action:'product.created',entityType:'product',entityId:created.id,description:`${created.product_name} (${created.sku}) was created.` },db);
    return created;
  });
  ok(res,product,201);
};

export const updateProduct: RequestHandler = async(req,res) => {
  const d=productSchema.parse(req.body);
  const product=await withTransaction(async(db)=>{
    const updated=(await db.query(`UPDATE products SET product_name=$1,sku=$2,category=$3,unit_price=$4,minimum_stock=$5,warehouse_location=$6,image_url=$7,updated_at=NOW() WHERE id=$8 RETURNING *`,[d.product_name,d.sku,d.category,d.unit_price,d.minimum_stock,d.warehouse_location,d.image_url,req.params.id])).rows[0];
    if(!updated)throw new AppError(404,'Product not found.','PRODUCT_NOT_FOUND');
    await recordAudit({actorId:req.user.id,action:'product.updated',entityType:'product',entityId:updated.id,description:`${updated.product_name} was updated.`},db);return updated;
  });
  ok(res,product);
};

export const addMovement: RequestHandler = async(req,res) => {
  const d=movementSchema.parse(req.body);
  const movement=await withTransaction(async(db)=>{
    const product=(await db.query('SELECT id,product_name,current_stock FROM products WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
    if(!product)throw new AppError(404,'Product not found.','PRODUCT_NOT_FOUND');
    if(d.movement_type==='OUT'&&product.current_stock<d.quantity)throw new AppError(409,`Insufficient stock for ${product.product_name}.`,'INSUFFICIENT_STOCK',{productName:product.product_name,available:product.current_stock,requested:d.quantity});
    const delta=d.movement_type==='IN'?d.quantity:-d.quantity;
    await db.query('UPDATE products SET current_stock=current_stock+$1,updated_at=NOW() WHERE id=$2',[delta,req.params.id]);
    const created=(await db.query(`INSERT INTO stock_movements(product_id,quantity_changed,movement_type,reason,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *`,[req.params.id,d.quantity,d.movement_type,d.reason,req.user.id])).rows[0];
    await recordAudit({actorId:req.user.id,action:'stock.adjusted',entityType:'product',entityId:product.id,description:`${d.movement_type==='IN'?'+':'−'}${d.quantity} units ${product.product_name}: ${d.reason}`,metadata:{movementType:d.movement_type,quantity:d.quantity}},db);return created;
  });
  ok(res,movement,201);
};
