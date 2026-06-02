/**
 * JWT issuance + verification. Spec 002-cloud-auth, contract `token-shapes.md`.
 *
 * v1: HS256 with a single shared secret. The desktop client does NOT verify
 * locally — it calls `/v1/me` instead — so a single env-var secret is fine
 * for v1. v1.5 will switch to RS256 + JWKS endpoint (deferred, T032).
 */

import { SignJWT, jwtVerify } from 'jose';

export const JWT_ISSUER = 'https://api.atlas.netgroup.ai';
export const JWT_AUDIENCE = 'atlas-desktop';
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 min

export interface AccessTokenClaims {
  sub: string;                 // user id (uuid)
  email: string;
  sub_tier: 'free' | 'pro' | 'team' | 'enterprise';
  device_install_id: string;
  // Spec 050 v0.1: active org context. Populated by the token issuer from
  // the user's personal org (or a chosen team org). Consumers (LLM proxy,
  // tool proxy) enforce quota at BOTH org AND user grain.
  org?: { id: string; role: 'owner' | 'admin' | 'member' | 'viewer' };
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

export async function signAccessToken(
  secret: string,
  claims: Omit<AccessTokenClaims, 'iat' | 'exp' | 'iss' | 'aud'>,
  ttlSeconds: number = ACCESS_TOKEN_TTL_SECONDS
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(key);
}

export async function verifyAccessToken(
  secret: string,
  token: string
): Promise<AccessTokenClaims> {
  const key = new TextEncoder().encode(secret);
  const { payload } = await jwtVerify(token, key, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
  return payload as unknown as AccessTokenClaims;
}
