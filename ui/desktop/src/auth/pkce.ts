/**
 * PKCE generation in the renderer. Spec 002-cloud-auth R-002-002.
 * Mirror of crates/atlas-auth-client/src/pkce.rs. CI lockstep TBD.
 */

const VERIFIER_LEN = 128;
const UNRESERVED =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

export interface PkcePair {
  verifier: string;
  challenge: string;
}

export async function generatePkcePair(): Promise<PkcePair> {
  const bytes = new Uint8Array(VERIFIER_LEN);
  crypto.getRandomValues(bytes);
  let verifier = '';
  for (let i = 0; i < VERIFIER_LEN; i++) {
    verifier += UNRESERVED[bytes[i] % UNRESERVED.length];
  }
  const challenge = await challengeFor(verifier);
  return { verifier, challenge };
}

export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlNoPad(new Uint8Array(digest));
}

function base64UrlNoPad(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
