/**
 * Refresh-token issuance, rotation, and revocation. Spec 002-cloud-auth.
 *
 * Token wire format: 43-char base64url (32 random bytes). At rest we store
 * bcrypt(token); the raw token is shown to the desktop exactly once.
 *
 * Rotation rule (R-RT-004 / contracts/token-shapes.md): when the desktop
 * presents a refresh token that has already been rotated, treat it as a
 * stolen replay — revoke ALL active refresh tokens for that user and emit
 * a `token_theft_suspected` audit event.
 */

import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'node:crypto';
import type pg from 'pg';

const REFRESH_TOKEN_BYTES = 32;
const REFRESH_TOKEN_TTL_DAYS = 30;
const BCRYPT_ROUNDS = 10;

export interface RefreshIssueResult {
  raw: string;             // 43-char base64url; shown to client ONCE
  id: string;              // db row id
}

export interface RefreshRow {
  id: string;
  token_hash: string;
  user_id: string;
  device_install_id: string;
  expires_at: Date;
  revoked_at: Date | null;
  rotated_to_id: string | null;
}

export async function issueRefreshToken(
  pool: pg.Pool,
  userId: string,
  deviceInstallId: string
): Promise<RefreshIssueResult> {
  const raw = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
  const id = randomUUID();
  const hash = await bcrypt.hash(raw, BCRYPT_ROUNDS);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 86_400_000);

  await pool.query(
    `INSERT INTO refresh_tokens (id, token_hash, user_id, device_install_id, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, hash, userId, deviceInstallId, expiresAt]
  );

  return { raw, id };
}

/**
 * Find the refresh-token row whose hash matches the presented raw token.
 *
 * Linear scan over active rows per user is wasteful at scale; in v1 we
 * tolerate it because (a) the bcrypt cost dominates, (b) Atlas users have
 * O(1-10) active sessions each. v1.5 will switch to a deterministic
 * lookup key (HMAC-SHA256 prefix index).
 */
export async function findRefreshTokenRow(
  pool: pg.Pool,
  raw: string
): Promise<RefreshRow | null> {
  // Scan all not-yet-expired rows. Acceptable while user count is small.
  const { rows } = await pool.query<RefreshRow>(
    `SELECT id, token_hash, user_id, device_install_id, expires_at, revoked_at, rotated_to_id
       FROM refresh_tokens
      WHERE expires_at > NOW()`
  );
  for (const row of rows) {
    // eslint-disable-next-line no-await-in-loop
    if (await bcrypt.compare(raw, row.token_hash)) return row;
  }
  return null;
}

/** Mark a single token revoked. Idempotent. */
export async function revokeOne(pool: pg.Pool, id: string): Promise<void> {
  await pool.query(
    `UPDATE refresh_tokens
        SET revoked_at = NOW()
      WHERE id = $1 AND revoked_at IS NULL`,
    [id]
  );
}

/** Revoke every active refresh token for a user. */
export async function revokeAllForUser(pool: pg.Pool, userId: string): Promise<void> {
  await pool.query(
    `UPDATE refresh_tokens
        SET revoked_at = NOW()
      WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
}

/**
 * Rotate: revoke `oldId`, issue a new refresh token, link the two via
 * `rotated_to_id`. Returns the new raw token + id.
 */
export async function rotate(
  pool: pg.Pool,
  oldRow: RefreshRow
): Promise<RefreshIssueResult> {
  const issued = await issueRefreshToken(pool, oldRow.user_id, oldRow.device_install_id);
  await pool.query(
    `UPDATE refresh_tokens
        SET revoked_at = NOW(), rotated_to_id = $2
      WHERE id = $1`,
    [oldRow.id, issued.id]
  );
  return issued;
}
