/**
 * Audit events. Spec 002-cloud-auth, FR-014: tokens MUST NEVER appear here.
 */

import { randomUUID, createHash } from 'node:crypto';
import type pg from 'pg';

export type AuditEventType =
  | 'sign_in_success'
  | 'sign_in_failure'
  | 'token_refresh'
  | 'token_theft_suspected'
  | 'sign_out'
  | 'revoke_all';

export interface AuditEvent {
  userId: string | null;
  type: AuditEventType;
  errorCode?: string;
  deviceOs?: string;
  ip?: string;
}

export async function emit(
  pool: pg.Pool,
  ev: AuditEvent
): Promise<void> {
  const ipHash = ev.ip
    ? createHash('sha256').update(ev.ip).digest('hex').slice(0, 24)
    : null;
  await pool.query(
    `INSERT INTO audit_events (id, user_id, event_type, error_code, device_os, ip_hash)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      randomUUID(),
      ev.userId,
      ev.type,
      ev.errorCode ?? null,
      ev.deviceOs ?? null,
      ipHash,
    ]
  );
}
