import type { RequestHandler } from 'express';
import { pool } from '../db/pool.js';
import { ok, paginated, parsePagination } from '../utils/http.js';

export const getDashboard: RequestHandler = async(req,res)=>{
  const role=req.user.role;
  const crm=role==='Admin'||role==='Sales',inventoryAccess=role!=='Accounts',sales=role!=='Warehouse',admin=role==='Admin',confirmedOnly=role==='Warehouse'||role==='Accounts';
  const [summary,revenue,customerStatus,inventory,activity,lowStock,followups,recentMovements,recentChallans]=await Promise.all([
    pool.query(`SELECT
      CASE WHEN $1::boolean THEN (SELECT COUNT(*) FROM customers) ELSE 0 END total_customers,
      CASE WHEN $1::boolean THEN (SELECT COUNT(*) FROM customers WHERE status='Active') ELSE 0 END active_customers,
      CASE WHEN $1::boolean THEN (SELECT COUNT(*) FROM customers WHERE status='Lead') ELSE 0 END leads,
      CASE WHEN $2::boolean THEN (SELECT COUNT(*) FROM products) ELSE 0 END products,
      CASE WHEN $2::boolean THEN (SELECT COUNT(*) FROM products WHERE current_stock<=minimum_stock) ELSE 0 END low_stock,
      CASE WHEN $2::boolean THEN (SELECT COUNT(*) FROM products WHERE current_stock=0) ELSE 0 END out_of_stock,
      CASE WHEN $1::boolean THEN (SELECT COUNT(*) FROM customer_followups WHERE status='Pending' AND scheduled_at::date=CURRENT_DATE) ELSE 0 END todays_followups,
      CASE WHEN $2::boolean THEN (SELECT COALESCE(SUM(current_stock*unit_price),0) FROM products) ELSE 0 END inventory_value,
      CASE WHEN $3::boolean THEN (SELECT COALESCE(SUM(total_amount),0) FROM challans WHERE status='Confirmed') ELSE 0 END revenue,
      (SELECT COUNT(*) FROM challans WHERE status='Confirmed') confirmed_challans,
      (SELECT COALESCE(SUM(total_quantity),0) FROM challans WHERE status='Confirmed') confirmed_units,
      (SELECT COALESCE(AVG(total_amount),0) FROM challans WHERE status='Confirmed') average_challan_value`,[crm,inventoryAccess,sales]),
    sales?pool.query(`SELECT TO_CHAR(d.day,'Mon DD') label,COALESCE(SUM(c.total_amount),0)::numeric value FROM generate_series(CURRENT_DATE-INTERVAL '29 days',CURRENT_DATE,INTERVAL '1 day') d(day) LEFT JOIN challans c ON c.created_at::date=d.day::date AND c.status='Confirmed' GROUP BY d.day ORDER BY d.day`):Promise.resolve({rows:[]}),
    crm?pool.query(`SELECT status,COUNT(*)::int value FROM customers GROUP BY status ORDER BY status`):Promise.resolve({rows:[]}),
    inventoryAccess?pool.query(`SELECT CASE WHEN current_stock=0 THEN 'Out of Stock' WHEN current_stock<=minimum_stock THEN 'Low Stock' ELSE 'Healthy' END status,COUNT(*)::int value FROM products GROUP BY 1 ORDER BY 1`):Promise.resolve({rows:[]}),
    admin?pool.query(`SELECT a.*,u.name actor_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 8`):Promise.resolve({rows:[]}),
    inventoryAccess?pool.query(`SELECT id,product_name,sku,current_stock,minimum_stock FROM products WHERE current_stock<=minimum_stock ORDER BY current_stock ASC LIMIT 6`):Promise.resolve({rows:[]}),
    crm?pool.query(`SELECT c.id,c.customer_name,c.business_name,c.customer_type,f.scheduled_at follow_up_date,c.status,f.note notes FROM customer_followups f JOIN customers c ON c.id=f.customer_id WHERE f.status='Pending' AND c.status!='Inactive' ORDER BY f.scheduled_at LIMIT 6`):Promise.resolve({rows:[]}),
    (admin||role==='Warehouse')?pool.query(`SELECT m.id,m.movement_type,m.quantity_changed,m.reason,m.created_at,p.id product_id,p.product_name,p.sku,u.name created_by_name FROM stock_movements m JOIN products p ON p.id=m.product_id LEFT JOIN users u ON u.id=m.created_by ORDER BY m.created_at DESC LIMIT 6`):Promise.resolve({rows:[]}),
    pool.query(`SELECT c.id,c.challan_number,c.status,c.total_amount,c.created_at,c.customer_snapshot->>'business_name' business_name,u.name created_by FROM challans c LEFT JOIN users u ON u.id=c.created_by WHERE (NOT $1::boolean OR c.status='Confirmed') ORDER BY c.created_at DESC LIMIT 6`,[confirmedOnly]),
  ]);
  ok(res,{role,summary:summary.rows[0],revenueTrend:revenue.rows,customerStatus:customerStatus.rows,inventoryHealth:inventory.rows,recentActivity:recentChallans.rows,auditActivity:activity.rows,lowStock:lowStock.rows,followups:followups.rows,recentMovements:recentMovements.rows,recentChallans:recentChallans.rows});
};

export const getAnalytics: RequestHandler = async(_req,res)=>{
  const [customerGrowth,status,inventory,moved,challans,sales]=await Promise.all([
    pool.query(`SELECT TO_CHAR(d.month,'Mon YYYY') label,COUNT(c.id)::int value FROM generate_series(date_trunc('month',CURRENT_DATE)-INTERVAL '5 months',date_trunc('month',CURRENT_DATE),INTERVAL '1 month') d(month) LEFT JOIN customers c ON date_trunc('month',c.created_at)=d.month GROUP BY d.month ORDER BY d.month`),
    pool.query(`SELECT status,COUNT(*)::int value FROM customers GROUP BY status`),
    pool.query(`SELECT CASE WHEN current_stock=0 THEN 'Out of Stock' WHEN current_stock<=minimum_stock THEN 'Low Stock' ELSE 'Healthy' END status,COUNT(*)::int value FROM products GROUP BY 1`),
    pool.query(`SELECT p.product_name,p.sku,SUM(m.quantity_changed)::int quantity FROM stock_movements m JOIN products p ON p.id=m.product_id GROUP BY p.id ORDER BY quantity DESC LIMIT 8`),
    pool.query(`SELECT status,COUNT(*)::int value FROM challans GROUP BY status`),
    pool.query(`SELECT TO_CHAR(d.month,'Mon YYYY') label,COALESCE(SUM(c.total_amount),0)::numeric value FROM generate_series(date_trunc('month',CURRENT_DATE)-INTERVAL '5 months',date_trunc('month',CURRENT_DATE),INTERVAL '1 month') d(month) LEFT JOIN challans c ON date_trunc('month',c.created_at)=d.month AND c.status='Confirmed' GROUP BY d.month ORDER BY d.month`),
  ]);
  ok(res,{customerGrowth:customerGrowth.rows,customerStatus:status.rows,inventoryHealth:inventory.rows,mostMovedProducts:moved.rows,challanStatus:challans.rows,salesTrend:sales.rows});
};

export const getAuditLogs: RequestHandler = async(req,res)=>{
  const {page,limit,offset}=parsePagination(req.query);const search=String(req.query.search??'');
  const [rows,count]=await Promise.all([pool.query(`SELECT a.*,u.name actor_name,u.role actor_role FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id WHERE ($1='' OR a.description ILIKE $1 OR a.action ILIKE $1 OR u.name ILIKE $1) ORDER BY a.created_at DESC LIMIT $2 OFFSET $3`,[`%${search}%`,limit,offset]),pool.query(`SELECT COUNT(*) FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id WHERE ($1='' OR a.description ILIKE $1 OR a.action ILIKE $1 OR u.name ILIKE $1)`,[`%${search}%`])]);
  ok(res,paginated(rows.rows,count.rows[0]?.count??0,page,limit));
};

export const globalSearch: RequestHandler = async(req,res)=>{
  const query=String(req.query.q??'').trim();if(query.length<2)return ok(res,{customers:[],products:[],challans:[]});const value=`%${query}%`;
  const crm=req.user.role==='Admin'||req.user.role==='Sales',products=req.user.role!=='Accounts',confirmedOnly=req.user.role==='Warehouse'||req.user.role==='Accounts';
  const [customers,productRows,challans]=await Promise.all([crm?pool.query(`SELECT id,customer_name,business_name,status FROM customers WHERE customer_name ILIKE $1 OR business_name ILIKE $1 OR mobile ILIKE $1 LIMIT 5`,[value]):Promise.resolve({rows:[]}),products?pool.query(`SELECT id,product_name,sku,current_stock FROM products WHERE product_name ILIKE $1 OR sku ILIKE $1 LIMIT 5`,[value]):Promise.resolve({rows:[]}),pool.query(`SELECT id,challan_number,status,customer_snapshot->>'business_name' business_name FROM challans WHERE (challan_number ILIKE $1 OR customer_snapshot->>'business_name' ILIKE $1) AND (NOT $2::boolean OR status='Confirmed') LIMIT 5`,[value,confirmedOnly])]);
  ok(res,{customers:customers.rows,products:productRows.rows,challans:challans.rows});
};

export const getNotifications: RequestHandler = async(req,res)=>{
  const inventory=req.user.role!=='Accounts',crm=req.user.role==='Admin'||req.user.role==='Sales';
  const [stock,followups,challans]=await Promise.all([inventory?pool.query(`SELECT id,product_name,current_stock,minimum_stock FROM products WHERE current_stock<=minimum_stock ORDER BY current_stock LIMIT 5`):Promise.resolve({rows:[]}),crm?pool.query(`SELECT c.id,c.customer_name,c.business_name,f.scheduled_at follow_up_date FROM customer_followups f JOIN customers c ON c.id=f.customer_id WHERE f.status='Pending' AND f.scheduled_at::date<=CURRENT_DATE AND c.status!='Inactive' ORDER BY f.scheduled_at LIMIT 5`):Promise.resolve({rows:[]}),pool.query(`SELECT id,challan_number,created_at FROM challans WHERE status='Confirmed' ORDER BY updated_at DESC LIMIT 3`)]);
  const items=[...stock.rows.map(p=>({id:`stock-${p.id}`,type:'inventory',title:p.current_stock===0?'Out of stock':'Low stock',message:`${p.product_name} has ${p.current_stock} units remaining.`,to:`/products?product=${p.id}`,created_at:null})),...followups.rows.map(f=>({id:`followup-${f.id}`,type:'followup',title:new Date(f.follow_up_date).getTime()<Date.now()?'Follow-up overdue':'Follow-up due today',message:f.business_name,to:`/customers/${f.id}`,created_at:f.follow_up_date})),...challans.rows.map(c=>({id:`challan-${c.id}`,type:'challan',title:'Challan confirmed',message:c.challan_number,to:`/challans/${c.id}`,created_at:c.created_at}))];
  ok(res,{items,unread:items.length});
};
