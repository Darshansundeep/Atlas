/**
 * Verify Atlas access tokens (issued by atlas-auth-api). Spec 003 §auth.
 *
 * v1: HS256 with the same JWT_SIGNING_SECRET as the auth backend. Same
 * issuer / audience constants.
 */

import { jwtVerify } from 'jose';

const ISSUER = 'https://api.atlas.netgroup.ai';
const AUDIENCE = 'atlas-desktop';

export interface AtlasClaims {
  sub: string;
  email: string;
  sub_tier: 'free' | 'pro' | 'team' | 'enterprise';
  device_install_id: string;
}

export async function verifyAtlasAccess(token: string, secret: string): Promise<AtlasClaims> {
  const key = new TextEncoder().encode(secret);
  const { payload } = await jwtVerify(token, key, { issuer: ISSUER, audience: AUDIENCE });
  return payload as unknown as AtlasClaims;
}
