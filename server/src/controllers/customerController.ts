import type { RequestHandler } from 'express';
import { pool, withTransaction } from '../db/pool.js';
import { recordAudit } from '../repositories/auditRepository.js';
import { customerSchema, followupSchema } from '../validators/customerValidators.js';
import { AppError, ok, paginated, parsePagination } from '../utils/http.js';

const allowedSorts: Record<string, string> = { updated: 'c.updated_at', name: 'c.customer_name', business: 'c.business_name', followup: 'c.follow_up_date', status: 'c.status' };

export const listCustomers: RequestHandler = async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const search = String(req.query.search ?? '').trim();
  const status = String(req.query.status ?? '');
  const type = String(req.query.type ?? '');
  const sort = allowedSorts[String(req.query.sort ?? '')] ?? 'c.updated_at';
  const direction = String(req.query.direction).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const where = `WHERE ($1='' OR c.customer_name ILIKE $1 OR c.business_name ILIKE $1 OR c.mobile ILIKE $1 OR c.email ILIKE $1)
    AND ($2='' OR c.status::text=$2) AND ($3='' OR c.customer_type::text=$3)`;
  const values = [`%${search}%`, status, type];
  const [rows, count] = await Promise.all([
    pool.query(`SELECT c.*,u.name owner_name,(SELECT MAX(created_at) FROM customer_followups WHERE customer_id=c.id) last_activity FROM customers c LEFT JOIN users u ON u.id=c.created_by ${where} ORDER BY ${sort} ${direction} NULLS LAST LIMIT $4 OFFSET $5`, [...values, limit, offset]),
    pool.query(`SELECT COUNT(*) FROM customers c ${where}`, values),
  ]);
  ok(res, paginated(rows.rows, count.rows[0]?.count ?? 0, page, limit));
};

export const getCustomer: RequestHandler = async (req, res) => {
  const [customer, followups, challans] = await Promise.all([
    pool.query(`SELECT c.*,u.name owner_name FROM customers c LEFT JOIN users u ON u.id=c.created_by WHERE c.id=$1`, [req.params.id]),
    pool.query(`SELECT f.*,u.name created_by_name,cu.name completed_by_name,ru.name rescheduled_by_name,
      CASE WHEN f.status='Pending' AND f.scheduled_at<NOW() THEN 'Overdue' ELSE f.status::text END display_status
      FROM customer_followups f LEFT JOIN users u ON u.id=f.created_by LEFT JOIN users cu ON cu.id=f.completed_by
      LEFT JOIN users ru ON ru.id=f.rescheduled_by WHERE customer_id=$1 ORDER BY f.created_at DESC`, [req.params.id]),
    pool.query(`SELECT id,challan_number,total_quantity,total_amount,status,created_at FROM challans WHERE customer_id=$1 ORDER BY created_at DESC`, [req.params.id]),
  ]);
  const value = customer.rows[0];
  if (!value) throw new AppError(404, 'Customer not found.', 'CUSTOMER_NOT_FOUND');
  ok(res, { ...value, followups: followups.rows, challans: challans.rows });
};

export const createCustomer: RequestHandler = async (req, res) => {
  const d = customerSchema.parse(req.body);
  const result = await withTransaction(async (db) => {
    const created = (await db.query(`INSERT INTO customers(customer_name,mobile,email,business_name,gst_number,customer_type,address,status,follow_up_date,notes,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, [d.customer_name,d.mobile,d.email,d.business_name,d.gst_number,d.customer_type,d.address,d.status,d.follow_up_date,d.notes,req.user.id])).rows[0];
    await recordAudit({ actorId: req.user.id, action: 'customer.created', entityType: 'customer', entityId: created.id, description: `${created.business_name} was added to CRM.` }, db);
    return created;
  });
  ok(res, result, 201);
};

export const updateCustomer: RequestHandler = async (req, res) => {
  const d = customerSchema.parse(req.body);
  const result = await withTransaction(async (db) => {
    const updated = (await db.query(`UPDATE customers SET customer_name=$1,mobile=$2,email=$3,business_name=$4,gst_number=$5,customer_type=$6,address=$7,status=$8,follow_up_date=$9,notes=$10,updated_at=NOW() WHERE id=$11 RETURNING *`, [d.customer_name,d.mobile,d.email,d.business_name,d.gst_number,d.customer_type,d.address,d.status,d.follow_up_date,d.notes,req.params.id])).rows[0];
    if (!updated) throw new AppError(404, 'Customer not found.', 'CUSTOMER_NOT_FOUND');
    await recordAudit({ actorId: req.user.id, action: 'customer.updated', entityType: 'customer', entityId: updated.id, description: `${updated.business_name} was updated.` }, db);
    return updated;
  });
  ok(res, result);
};

export const addFollowup: RequestHandler = async (req, res) => {
  const d = followupSchema.parse(req.body);
  const result = await withTransaction(async (db) => {
    const customer = (await db.query('SELECT id,business_name FROM customers WHERE id=$1', [req.params.id])).rows[0];
    if (!customer) throw new AppError(404, 'Customer not found.', 'CUSTOMER_NOT_FOUND');
    const created = (await db.query(`INSERT INTO customer_followups(customer_id,note,next_follow_up_date,scheduled_at,created_by) VALUES($1,$2,$3,$3::date + TIME '10:00',$4) RETURNING *`, [req.params.id,d.note,d.next_follow_up_date,req.user.id])).rows[0];
    if (d.next_follow_up_date) await db.query('UPDATE customers SET follow_up_date=$1,updated_at=NOW() WHERE id=$2', [d.next_follow_up_date,req.params.id]);
    await recordAudit({ actorId: req.user.id, action: 'followup.created', entityType: 'customer', entityId: customer.id, description: `Follow-up added for ${customer.business_name}.`, metadata: { note: d.note } }, db);
    return created;
  });
  ok(res, result, 201);
};
