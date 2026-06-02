/**
 * HTTP wrapper around the Atlas auth backend. Spec 002-cloud-auth.
 *
 * The base URL is the env-var ATLAS_AUTH_BACKEND_URL (defaults to the
 * production API). For local dev we point at http://127.0.0.1:8787 by
 * the same env var.
 *
 * R-API-005 — every request carries an X-Atlas-Request-Id so support can
 * correlate. We mint one client-side and respect any server-returned one.
 */

import type {
  SubscriptionState,
  TokenGrantResponse,
} from './types';

const DEFAULT_BACKEND_URL = 'https://api.atlas.netgroup.ai';

let cachedBackendUrl: string | null = null;

export function setBackendUrl(url: string): void {
  cachedBackendUrl = (url || DEFAULT_BACKEND_URL).replace(/\/+$/, '');
}

export function authBackendUrl(): string {
  if (cachedBackendUrl) return cachedBackendUrl;
  if (typeof window !== 'undefined') {
    const fromWindow = (window as { ATLAS_AUTH_BACKEND_URL?: string }).ATLAS_AUTH_BACKEND_URL;
    if (fromWindow) return fromWindow.replace(/\/+$/, '');
  }
  if (typeof process !== 'undefined' && process.env?.ATLAS_AUTH_BACKEND_URL) {
    return process.env.ATLAS_AUTH_BACKEND_URL.replace(/\/+$/, '');
  }
  return DEFAULT_BACKEND_URL;
}

function newReqId(): string {
  return (crypto.randomUUID?.() ?? `r-${Math.random().toString(36).slice(2)}`);
}

export interface AuthApiError {
  status: number;
  code: string;       // backend "error" field
  detail?: string;
}

export class AuthApiException extends Error {
  status: number;
  code: string;
  detail?: string;
  constructor(err: AuthApiError) {
    super(`${err.code} (${err.status})${err.detail ? `: ${err.detail}` : ''}`);
    this.status = err.status;
    this.code = err.code;
    this.detail = err.detail;
  }
}

async function readError(res: Response): Promise<AuthApiException> {
  let body: { error?: string; detail?: string } | null = null;
  try {
    body = (await res.json()) as { error?: string; detail?: string };
  } catch {
    /* ignore */
  }
  return new AuthApiException({
    status: res.status,
    code: body?.error ?? `http_${res.status}`,
    detail: body?.detail,
  });
}

export async function exchangeCode(args: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<TokenGrantResponse> {
  const res = await fetch(`${authBackendUrl()}/v1/auth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-atlas-request-id': newReqId() },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code: args.code,
      code_verifier: args.codeVerifier,
      redirect_uri: args.redirectUri,
    }),
  });
  if (!res.ok) throw await readError(res);
  return (await res.json()) as TokenGrantResponse;
}

export async function exchangeRefresh(refreshToken: string): Promise<TokenGrantResponse> {
  const res = await fetch(`${authBackendUrl()}/v1/auth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-atlas-request-id': newReqId() },
    body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  if (!res.ok) throw await readError(res);
  return (await res.json()) as TokenGrantResponse;
}

export async function revoke(refreshToken: string): Promise<void> {
  await fetch(`${authBackendUrl()}/v1/auth/revoke`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-atlas-request-id': newReqId() },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

export async function getMe(accessToken: string): Promise<{
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  sub_tier: SubscriptionState['tier'];
  entitlements: string[];
  device_install_id: string;
}> {
  const res = await fetch(`${authBackendUrl()}/v1/me`, {
    headers: { authorization: `Bearer ${accessToken}`, 'x-atlas-request-id': newReqId() },
  });
  if (!res.ok) throw await readError(res);
  return (await res.json()) as never;
}

export async function getSubscription(accessToken: string): Promise<SubscriptionState> {
  const res = await fetch(`${authBackendUrl()}/v1/subscription`, {
    headers: { authorization: `Bearer ${accessToken}`, 'x-atlas-request-id': newReqId() },
  });
  if (!res.ok) throw await readError(res);
  return (await res.json()) as SubscriptionState;
}

// ---------------------------------------------------------------------------
// Spec 050 v0.2 — self-serve teams + invitations

export type OrgRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface OrgMembership {
  id: string;
  slug: string;
  display_name: string;
  plan: string;
  role: OrgRole;
  is_personal: boolean;
  member_count: number;
}

export interface MyOrgsResponse {
  active_org_id: string | null;
  organizations: OrgMembership[];
}

export async function listMyOrgs(accessToken: string): Promise<MyOrgsResponse> {
  const res = await fetch(`${authBackendUrl()}/v1/organizations/me`, {
    headers: { authorization: `Bearer ${accessToken}`, 'x-atlas-request-id': newReqId() },
  });
  if (!res.ok) throw await readError(res);
  return (await res.json()) as MyOrgsResponse;
}

export async function createTeamOrg(
  accessToken: string,
  displayName: string
): Promise<{ id: string; slug: string; role: OrgRole }> {
  const res = await fetch(`${authBackendUrl()}/v1/organizations`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      'x-atlas-request-id': newReqId(),
    },
    body: JSON.stringify({ display_name: displayName }),
  });
  if (!res.ok) throw await readError(res);
  return (await res.json()) as never;
}

export async function createOrgInvitation(
  accessToken: string,
  orgId: string,
  email: string,
  role: 'admin' | 'member' | 'viewer' = 'member'
): Promise<{ id: string; code: string; expires_at: string }> {
  const res = await fetch(`${authBackendUrl()}/v1/organizations/${orgId}/invitations`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      'x-atlas-request-id': newReqId(),
    },
    body: JSON.stringify({ email, role }),
  });
  if (!res.ok) throw await readError(res);
  return (await res.json()) as never;
}

export async function acceptOrgInvitation(
  accessToken: string,
  code: string
): Promise<{ ok: true; organization_id: string; role: OrgRole }> {
  const res = await fetch(`${authBackendUrl()}/v1/invitations/accept`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      'x-atlas-request-id': newReqId(),
    },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw await readError(res);
  return (await res.json()) as never;
}

export async function switchActiveOrg(
  accessToken: string,
  organizationId: string
): Promise<{ access_token: string; expires_in: number; org: { id: string; role: OrgRole } }> {
  const res = await fetch(`${authBackendUrl()}/v1/auth/switch-org`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      'x-atlas-request-id': newReqId(),
    },
    body: JSON.stringify({ organization_id: organizationId }),
  });
  if (!res.ok) throw await readError(res);
  return (await res.json()) as never;
}
