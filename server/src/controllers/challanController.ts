import type { RequestHandler } from 'express';
import { pool, withTransaction } from '../db/pool.js';
import { recordAudit } from '../repositories/auditRepository.js';
import { adjustChallanStock, type StockLine } from '../services/stockService.js';
import { challanSchema, challanStatusSchema } from '../validators/challanValidators.js';
import { AppError, ok, paginated, parsePagination } from '../utils/http.js';

interface ProductRow { id:string; product_name:string; sku:string; unit_price:string; current_stock:number }

export const listChallans: RequestHandler = async(req,res)=>{
  const {page,limit,offset}=parsePagination(req.query), search=String(req.query.search??'').trim(), status=String(req.query.status??'');
  const confirmedOnly=['Warehouse','Accounts'].includes(req.user.role);
  if(confirmedOnly&&status&&status!=='Confirmed')throw new AppError(403,'Your role can access confirmed challans only.','FORBIDDEN');
  const where=`WHERE ($1='' OR c.challan_number ILIKE $1 OR c.customer_snapshot->>'customer_name' ILIKE $1 OR c.customer_snapshot->>'business_name' ILIKE $1) AND ($2='' OR c.status::text=$2) AND (NOT $3::boolean OR c.status='Confirmed')`;
  const values=[`%${search}%`,status,confirmedOnly];
  const [rows,count]=await Promise.all([pool.query(`SELECT c.*,u.name created_by_name FROM challans c LEFT JOIN users u ON u.id=c.created_by ${where} ORDER BY c.created_at DESC LIMIT $4 OFFSET $5`,[...values,limit,offset]),pool.query(`SELECT COUNT(*) FROM challans c ${where}`,values)]);
  const data=req.user.role==='Warehouse'?rows.rows.map((row)=>({id:row.id,challan_number:row.challan_number,status:row.status,total_quantity:row.total_quantity,created_at:row.created_at,updated_at:row.updated_at,created_by_name:row.created_by_name,customer_snapshot:{customer_name:row.customer_snapshot.customer_name,business_name:row.customer_snapshot.business_name,mobile:row.customer_snapshot.mobile,address:row.customer_snapshot.address}})):rows.rows;
  ok(res,paginated(data,count.rows[0]?.count??0,page,limit));
};

export const getChallan: RequestHandler = async(req,res)=>{
  const [challan,items]=await Promise.all([pool.query(`SELECT c.*,u.name created_by_name FROM challans c LEFT JOIN users u ON u.id=c.created_by WHERE c.id=$1`,[req.params.id]),pool.query('SELECT * FROM challan_items WHERE challan_id=$1 ORDER BY product_name',[req.params.id])]);
  if(!challan.rows[0])throw new AppError(404,'Challan not found.','CHALLAN_NOT_FOUND');
  if(['Warehouse','Accounts'].includes(req.user.role)&&challan.rows[0].status!=='Confirmed')throw new AppError(403,'Your role can access confirmed challans only.','FORBIDDEN');
  if(req.user.role==='Warehouse'){
    const row=challan.rows[0];
    return void ok(res,{id:row.id,challan_number:row.challan_number,status:row.status,total_quantity:row.total_quantity,created_at:row.created_at,updated_at:row.updated_at,created_by_name:row.created_by_name,customer_snapshot:{customer_name:row.customer_snapshot.customer_name,business_name:row.customer_snapshot.business_name,mobile:row.customer_snapshot.mobile,address:row.customer_snapshot.address},items:items.rows.map(item=>({id:item.id,product_id:item.product_id,product_name:item.product_name,sku:item.sku,quantity:item.quantity}))});
  }
  ok(res,{...challan.rows[0],items:items.rows});
};

export const createChallan: RequestHandler = async(req,res)=>{
  const d=challanSchema.parse(req.body);
  const created=await withTransaction(async(db)=>{
    const customer=(await db.query('SELECT * FROM customers WHERE id=$1',[d.customer_id])).rows[0];
    if(!customer)throw new AppError(404,'Customer not found.','CUSTOMER_NOT_FOUND');
    const ids=[...new Set(d.items.map((item)=>item.product_id))];
    if(ids.length!==d.items.length)throw new AppError(422,'Each product may appear only once.','DUPLICATE_CHALLAN_ITEM');
    const products=(await db.query<ProductRow>('SELECT id,product_name,sku,unit_price,current_stock FROM products WHERE id=ANY($1::uuid[])',[ids])).rows;
    const productMap=new Map(products.map((product)=>[product.id,product]));
    const lines=d.items.map((item)=>{const product=productMap.get(item.product_id);if(!product)throw new AppError(404,'One of the selected products was not found.','PRODUCT_NOT_FOUND');const unitPrice=Number(product.unit_price);return {...item,product_name:product.product_name,sku:product.sku,unit_price:unitPrice,line_total:unitPrice*item.quantity};});
    const totalQuantity=lines.reduce((sum,item)=>sum+item.quantity,0),totalAmount=lines.reduce((sum,item)=>sum+item.line_total,0);
    const sequence=(await db.query<{value:string}>("SELECT nextval('challan_number_seq') value")).rows[0]?.value;
    const number=`CH-${new Date().getFullYear()}-${String(sequence).padStart(6,'0')}`;
    const snapshot={customer_name:customer.customer_name,business_name:customer.business_name,mobile:customer.mobile,email:customer.email,address:customer.address,gst_number:customer.gst_number};
    const challan=(await db.query(`INSERT INTO challans(challan_number,customer_id,customer_snapshot,total_quantity,total_amount,status,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[number,d.customer_id,snapshot,totalQuantity,totalAmount,d.status,d.notes,req.user.id])).rows[0];
    for(const line of lines)await db.query(`INSERT INTO challan_items(challan_id,product_id,product_name,sku,unit_price,quantity,line_total) VALUES($1,$2,$3,$4,$5,$6,$7)`,[challan.id,line.product_id,line.product_name,line.sku,line.unit_price,line.quantity,line.line_total]);
    if(d.status==='Confirmed')await adjustChallanStock(db,challan.id,lines,'OUT',req.user.id);
    await recordAudit({actorId:req.user.id,action:d.status==='Confirmed'?'challan.confirmed':'challan.created',entityType:'challan',entityId:challan.id,description:`${number} was ${d.status.toLowerCase()}.`,metadata:{totalQuantity,totalAmount}},db);
    return {...challan,items:lines};
  });
  ok(res,created,201);
};

export const updateChallanStatus: RequestHandler = async(req,res)=>{
  const {status}=challanStatusSchema.parse(req.body);
  const result=await withTransaction(async(db)=>{
    const challan=(await db.query('SELECT * FROM challans WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
    if(!challan)throw new AppError(404,'Challan not found.','CHALLAN_NOT_FOUND');
    if(challan.status===status)throw new AppError(409,`Challan is already ${status.toLowerCase()}.`,'CHALLAN_STATUS_UNCHANGED');
    if(challan.status==='Cancelled')throw new AppError(409,'A cancelled challan cannot be changed.','CHALLAN_CANCELLED');
    const items=(await db.query<StockLine>('SELECT product_id,quantity FROM challan_items WHERE challan_id=$1',[req.params.id])).rows;
    let affected=0;
    if(challan.status==='Draft'&&status==='Confirmed')affected=await adjustChallanStock(db,challan.id,items,'OUT',req.user.id);
    if(challan.status==='Confirmed'&&status==='Cancelled')affected=await adjustChallanStock(db,challan.id,items,'IN',req.user.id);
    const updated=(await db.query('UPDATE challans SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING *',[status,req.params.id])).rows[0];
    await recordAudit({actorId:req.user.id,action:status==='Confirmed'?'challan.confirmed':'challan.cancelled',entityType:'challan',entityId:challan.id,description:`${challan.challan_number} was ${status.toLowerCase()}.`,metadata:{affectedUnits:affected}},db);
    return {...updated,affected_units:affected};
  });
  ok(res,result);
};
