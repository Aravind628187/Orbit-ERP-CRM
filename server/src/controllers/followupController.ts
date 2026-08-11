import type { RequestHandler } from 'express';
import { pool, withTransaction } from '../db/pool.js';
import { recordAudit } from '../repositories/auditRepository.js';
import { followupActionSchema, rescheduleFollowupSchema } from '../validators/customerValidators.js';
import { AppError, ok, paginated, parsePagination } from '../utils/http.js';

const refreshCustomerFollowup = async (db: import('pg').PoolClient, customerId: string) => {
  await db.query(`UPDATE customers SET follow_up_date=(
    SELECT MIN(scheduled_at)::date FROM customer_followups
    WHERE customer_id=$1 AND status='Pending' AND scheduled_at IS NOT NULL
  ),updated_at=NOW() WHERE id=$1`, [customerId]);
};

export const listFollowups: RequestHandler = async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const search = String(req.query.search ?? '').trim();
  const status = String(req.query.status ?? '');
  const date = String(req.query.date ?? '');
  const createdBy = String(req.query.created_by ?? '');
  const dateFrom = String(req.query.date_from ?? '');
  const dateTo = String(req.query.date_to ?? '');
  const allowedStatuses = ['', 'Pending', 'Completed', 'Rescheduled', 'Overdue'];
  if (!allowedStatuses.includes(status)) throw new AppError(422, 'Invalid follow-up status.','VALIDATION_ERROR');
  const where = `WHERE ($1='' OR c.customer_name ILIKE $1 OR c.business_name ILIKE $1 OR f.note ILIKE $1)
    AND ($2='' OR ($2='Overdue' AND f.status='Pending' AND f.scheduled_at<NOW()) OR ($2<>'Overdue' AND f.status::text=$2))
    AND ($3='' OR ($3='today' AND f.status='Pending' AND f.scheduled_at::date=CURRENT_DATE) OR ($3='overdue' AND f.status='Pending' AND f.scheduled_at<NOW()) OR ($3='upcoming' AND f.status='Pending' AND f.scheduled_at>=NOW()))
    AND ($4='' OR f.created_by::text=$4) AND ($5='' OR f.scheduled_at::date >= $5::date) AND ($6='' OR f.scheduled_at::date <= $6::date)`;
  const values = [`%${search}%`, status, date, createdBy, dateFrom, dateTo];
  const select = `SELECT f.*,c.customer_name,c.business_name,c.customer_type,c.status customer_status,
    creator.name created_by_name,completer.name completed_by_name,rescheduler.name rescheduled_by_name,
    CASE WHEN f.status='Pending' AND f.scheduled_at<NOW() THEN 'Overdue' ELSE f.status::text END display_status
    FROM customer_followups f JOIN customers c ON c.id=f.customer_id
    LEFT JOIN users creator ON creator.id=f.created_by LEFT JOIN users completer ON completer.id=f.completed_by
    LEFT JOIN users rescheduler ON rescheduler.id=f.rescheduled_by`;
  const [rows, count, users] = await Promise.all([
    pool.query(`${select} ${where} ORDER BY CASE WHEN f.status='Pending' THEN 0 ELSE 1 END,f.scheduled_at ASC NULLS LAST,f.created_at DESC LIMIT $7 OFFSET $8`, [...values, limit, offset]),
    pool.query(`SELECT COUNT(*) FROM customer_followups f JOIN customers c ON c.id=f.customer_id ${where}`, values),
    pool.query("SELECT id,name FROM users WHERE role IN ('Admin','Sales') ORDER BY name"),
  ]);
  ok(res, { ...paginated(rows.rows, count.rows[0]?.count ?? 0, page, limit), users: users.rows });
};

export const completeFollowup: RequestHandler = async (req, res) => {
  const input = followupActionSchema.parse(req.body ?? {});
  const result = await withTransaction(async (db) => {
    const followup = (await db.query(`SELECT f.*,c.business_name FROM customer_followups f JOIN customers c ON c.id=f.customer_id WHERE f.id=$1 FOR UPDATE`, [req.params.id])).rows[0];
    if (!followup) throw new AppError(404, 'Follow-up not found.','FOLLOWUP_NOT_FOUND');
    if (followup.status !== 'Pending') throw new AppError(409, 'Only pending follow-ups can be completed.','FOLLOWUP_NOT_PENDING');
    const updated = (await db.query(`UPDATE customer_followups SET status='Completed',completed_at=NOW(),completed_by=$1,note=CASE WHEN $2::text IS NULL THEN note ELSE note || E'\n' || $2 END WHERE id=$3 RETURNING *`, [req.user.id,input.note ?? null,followup.id])).rows[0];
    await refreshCustomerFollowup(db, followup.customer_id);
    await recordAudit({ actorId:req.user.id,action:'followup.completed',entityType:'customer',entityId:followup.customer_id,description:`Follow-up completed for ${followup.business_name}.`,metadata:{followupId:followup.id} },db);
    return updated;
  });
  ok(res,result);
};

export const rescheduleFollowup: RequestHandler = async (req, res) => {
  const input = rescheduleFollowupSchema.parse(req.body);
  const result = await withTransaction(async (db) => {
    const followup = (await db.query(`SELECT f.*,c.business_name FROM customer_followups f JOIN customers c ON c.id=f.customer_id WHERE f.id=$1 FOR UPDATE`, [req.params.id])).rows[0];
    if (!followup) throw new AppError(404, 'Follow-up not found.','FOLLOWUP_NOT_FOUND');
    if (followup.status !== 'Pending') throw new AppError(409, 'Only pending follow-ups can be rescheduled.','FOLLOWUP_NOT_PENDING');
    const created = (await db.query(`INSERT INTO customer_followups(customer_id,note,next_follow_up_date,scheduled_at,created_by)
      VALUES($1,$2,$3::timestamptz::date,$3,$4) RETURNING *`, [followup.customer_id,input.note ?? followup.note,input.scheduled_at,req.user.id])).rows[0];
    await db.query(`UPDATE customer_followups SET status='Rescheduled',rescheduled_at=NOW(),rescheduled_by=$1,rescheduled_to=$2 WHERE id=$3`, [req.user.id,created.id,followup.id]);
    await refreshCustomerFollowup(db, followup.customer_id);
    await recordAudit({ actorId:req.user.id,action:'followup.rescheduled',entityType:'customer',entityId:followup.customer_id,description:`Follow-up rescheduled for ${followup.business_name}.`,metadata:{followupId:followup.id,newFollowupId:created.id,scheduledAt:input.scheduled_at} },db);
    return created;
  });
  ok(res,result,201);
};
