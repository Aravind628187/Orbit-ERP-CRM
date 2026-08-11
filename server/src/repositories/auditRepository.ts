import type { PoolClient, Pool } from 'pg';
import { pool } from '../db/pool.js';

interface AuditInput {
  actorId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  description: string;
  metadata?: Record<string, unknown>;
}

export async function recordAudit(input: AuditInput, db: Pool | PoolClient = pool): Promise<void> {
  await db.query(
    `INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,description,metadata)
     VALUES($1,$2,$3,$4,$5,$6)`,
    [input.actorId ?? null, input.action, input.entityType, input.entityId ?? null, input.description, input.metadata ?? {}],
  );
}
