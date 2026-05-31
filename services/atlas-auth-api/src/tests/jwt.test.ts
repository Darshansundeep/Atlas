import { describe, expect, it } from 'vitest';
import { signAccessToken, verifyAccessToken, JWT_ISSUER, JWT_AUDIENCE } from '../jwt.js';

const SECRET = 'test-secret-must-be-at-least-32-chars-long-aaa';

describe('jwt', () => {
  it('round-trips claims', async () => {
    const token = await signAccessToken(SECRET, {
      sub: 'user-123',
      email: 'darshan@netgroup.ai',
      sub_tier: 'pro',
      device_install_id: 'device-1',
    });
    const claims = await verifyAccessToken(SECRET, token);
    expect(claims.sub).toBe('user-123');
    expect(claims.email).toBe('darshan@netgroup.ai');
    expect(claims.sub_tier).toBe('pro');
    expect(claims.device_install_id).toBe('device-1');
    expect(claims.iss).toBe(JWT_ISSUER);
    expect(claims.aud).toBe(JWT_AUDIENCE);
  });

  it('rejects tokens signed with a different secret', async () => {
    const token = await signAccessToken(SECRET, {
      sub: 'u',
      email: 'a@b',
      sub_tier: 'free',
      device_install_id: 'd',
    });
    await expect(
      verifyAccessToken('totally-different-secret-yes-32-chars-aaa', token)
    ).rejects.toThrow();
  });

  it('rejects expired tokens', async () => {
    const token = await signAccessToken(
      SECRET,
      { sub: 'u', email: 'a@b', sub_tier: 'free', device_install_id: 'd' },
      -1
    );
    await expect(verifyAccessToken(SECRET, token)).rejects.toThrow();
  });
});
