import type { RequestHandler } from 'express';
import { pool } from '../db/pool.js';
import { AppError, ok, paginated, parsePagination } from '../utils/http.js';

const movementWhere = `WHERE ($1='' OR p.product_name ILIKE $1 OR p.sku ILIKE $1)
  AND ($2='' OR m.movement_type::text=$2) AND ($3='' OR m.reason ILIKE $3)
  AND ($4='' OR m.created_by::text=$4) AND ($5='' OR p.warehouse_location=$5)
  AND ($6='' OR m.created_at >= $6::date) AND ($7='' OR m.created_at < $7::date + INTERVAL '1 day')`;

export const listStockMovements: RequestHandler = async (req,res) => {
  const {page,limit,offset}=parsePagination(req.query);
  const search=String(req.query.search??'').trim(),type=String(req.query.type??''),reason=String(req.query.reason??'').trim();
  const createdBy=String(req.query.created_by??''),warehouse=String(req.query.warehouse??'');
  const dateFrom=String(req.query.date_from??''),dateTo=String(req.query.date_to??'');
  if(!['','IN','OUT'].includes(type))throw new AppError(422,'Invalid movement type.','VALIDATION_ERROR');
  const isoDate=/^\d{4}-\d{2}-\d{2}$/;
  if((dateFrom&&!isoDate.test(dateFrom))||(dateTo&&!isoDate.test(dateTo)))throw new AppError(422,'Dates must use YYYY-MM-DD format.','VALIDATION_ERROR');
  if(dateFrom&&dateTo&&dateFrom>dateTo)throw new AppError(422,'From date must be before to date.','VALIDATION_ERROR');
  const values=[`%${search}%`,type,`%${reason}%`,createdBy,warehouse,dateFrom,dateTo];
  const [rows,count,facets,users,summary]=await Promise.all([
    pool.query(`SELECT m.*,p.product_name,p.sku,p.warehouse_location,u.name created_by_name,c.challan_number
      FROM stock_movements m JOIN products p ON p.id=m.product_id LEFT JOIN users u ON u.id=m.created_by
      LEFT JOIN challans c ON c.id=m.challan_id ${movementWhere} ORDER BY m.created_at DESC LIMIT $8 OFFSET $9`,[...values,limit,offset]),
    pool.query(`SELECT COUNT(*) FROM stock_movements m JOIN products p ON p.id=m.product_id ${movementWhere}`,values),
    pool.query(`SELECT ARRAY_AGG(DISTINCT warehouse_location ORDER BY warehouse_location) warehouses FROM products`),
    pool.query(`SELECT DISTINCT u.id,u.name FROM stock_movements m JOIN users u ON u.id=m.created_by ORDER BY u.name`),
    pool.query(`SELECT COALESCE(SUM(m.quantity_changed) FILTER(WHERE m.movement_type='IN'),0)::int total_in,COALESCE(SUM(m.quantity_changed) FILTER(WHERE m.movement_type='OUT'),0)::int total_out,COALESCE(SUM(CASE WHEN m.movement_type='IN' THEN m.quantity_changed ELSE -m.quantity_changed END),0)::int net_change FROM stock_movements m JOIN products p ON p.id=m.product_id ${movementWhere}`,values),
  ]);
  ok(res,{...paginated(rows.rows,count.rows[0]?.count??0,page,limit),facets:{...facets.rows[0],users:users.rows},summary:summary.rows[0]});
};

export const listProductMovements: RequestHandler = async(req,res)=>{
  const {page,limit,offset}=parsePagination(req.query);
  const product=(await pool.query('SELECT id FROM products WHERE id=$1',[req.params.id])).rows[0];
  if(!product)throw new AppError(404,'Product not found.','PRODUCT_NOT_FOUND');
  const [rows,count]=await Promise.all([
    pool.query(`SELECT m.*,u.name created_by_name,c.challan_number FROM stock_movements m LEFT JOIN users u ON u.id=m.created_by LEFT JOIN challans c ON c.id=m.challan_id WHERE m.product_id=$1 ORDER BY m.created_at DESC LIMIT $2 OFFSET $3`,[req.params.id,limit,offset]),
    pool.query('SELECT COUNT(*) FROM stock_movements WHERE product_id=$1',[req.params.id]),
  ]);
  ok(res,paginated(rows.rows,count.rows[0]?.count??0,page,limit));
};
