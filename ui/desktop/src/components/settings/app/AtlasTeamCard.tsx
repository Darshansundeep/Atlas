/**
 * Atlas Team card — Settings → App. Spec 050 v0.2.
 *
 * Self-serve team UI:
 *   - "Create team" — turn a personal account into a team org owner
 *   - Members list (if part of a team)
 *   - "Invite teammate" — generate paste-shareable invite code
 *   - "Accept invitation" — paste a code shared by another team owner
 *   - Active-org switcher: pick which org context their next chat is
 *     billed against
 *
 * Backend endpoints used (spec 050 v0.2):
 *   GET  /v1/organizations/me
 *   POST /v1/organizations
 *   POST /v1/organizations/:id/invitations
 *   POST /v1/invitations/accept
 *   POST /v1/auth/switch-org
 */

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '../../ui/card';
import { Button } from '../../ui/button';
import {
  acceptOrgInvitation,
  createOrgInvitation,
  createTeamOrg,
  getOrgDetail,
  listMyOrgs,
  removeOrgMember,
  revokeOrgInvitation,
  switchActiveOrg,
  type MyOrgsResponse,
  type OrgDetail,
  type OrgMembership,
} from '../../../auth/api';
import { useAuth } from '../../../auth';

type Mode = 'idle' | 'creating' | 'inviting' | 'accepting' | 'switching' | 'removing' | 'revoking';

export default function AtlasTeamCard() {
  const { user, accessToken, applyAccessToken } = useAuth();
  const [data, setData] = useState<MyOrgsResponse | null>(null);
  const [details, setDetails] = useState<Record<string, OrgDetail>>({});
  const [mode, setMode] = useState<Mode>('idle');
  const [err, setErr] = useState<string | null>(null);
  const [createName, setCreateName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteTargetOrgId, setInviteTargetOrgId] = useState<string | null>(null);
  const [latestInvite, setLatestInvite] = useState<{ code: string; expires_at: string } | null>(null);
  const [acceptCode, setAcceptCode] = useState('');

  const refresh = useCallback(async () => {
    if (!accessToken) { setData(null); return; }
    try {
      const me = await listMyOrgs(accessToken);
      setData(me);
      // Fetch member + pending-invite detail for every TEAM org.
      const teamOrgs = me.organizations.filter((o) => !o.is_personal);
      const detailEntries = await Promise.all(
        teamOrgs.map(async (o) => {
          try {
            const d = await getOrgDetail(accessToken, o.id);
            return [o.id, d] as const;
          } catch { return null; }
        })
      );
      const next: Record<string, OrgDetail> = {};
      for (const e of detailEntries) {
        if (e) next[e[0]] = e[1];
      }
      setDetails(next);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [accessToken]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (!user || !accessToken) return null;

  const orgs = data?.organizations ?? [];
  const activeOrgId = data?.active_org_id ?? null;
  const teamOrgs = orgs.filter((o) => !o.is_personal);

  async function onCreate() {
    if (!accessToken || !createName.trim()) return;
    setMode('creating'); setErr(null);
    try {
      await createTeamOrg(accessToken, createName.trim());
      setCreateName('');
      await refresh();
    } catch (e) { setErr((e as Error).message); }
    finally { setMode('idle'); }
  }

  async function onInvite(orgId: string) {
    if (!accessToken || !inviteEmail.trim()) return;
    setMode('inviting'); setErr(null);
    try {
      const inv = await createOrgInvitation(accessToken, orgId, inviteEmail.trim());
      setLatestInvite({ code: inv.code, expires_at: inv.expires_at });
      setInviteEmail('');
      setInviteTargetOrgId(orgId);
    } catch (e) { setErr((e as Error).message); }
    finally { setMode('idle'); }
  }

  async function onAccept() {
    if (!accessToken || !acceptCode.trim()) return;
    setMode('accepting'); setErr(null);
    try {
      await acceptOrgInvitation(accessToken, acceptCode.trim());
      setAcceptCode('');
      await refresh();
    } catch (e) { setErr((e as Error).message); }
    finally { setMode('idle'); }
  }

  async function onRemove(orgId: string, userId: string, email: string | null) {
    if (!accessToken) return;
    if (!window.confirm(`Remove ${email ?? 'this member'} from the team?`)) return;
    setMode('removing'); setErr(null);
    try {
      await removeOrgMember(accessToken, orgId, userId);
      await refresh();
    } catch (e) { setErr((e as Error).message); }
    finally { setMode('idle'); }
  }

  async function onRevoke(orgId: string, inviteId: string) {
    if (!accessToken) return;
    setMode('revoking'); setErr(null);
    try {
      await revokeOrgInvitation(accessToken, orgId, inviteId);
      await refresh();
    } catch (e) { setErr((e as Error).message); }
    finally { setMode('idle'); }
  }

  async function onSwitch(orgId: string) {
    if (!accessToken || orgId === activeOrgId) return;
    setMode('switching'); setErr(null);
    try {
      const swapped = await switchActiveOrg(accessToken, orgId);
      applyAccessToken?.(swapped.access_token);
      await refresh();
    } catch (e) { setErr((e as Error).message); }
    finally { setMode('idle'); }
  }

  function copyCode(code: string) {
    try { void navigator.clipboard.writeText(code); } catch { /* noop */ }
  }

  return (
    <Card className="rounded-lg" style={{
      background: 'var(--color-background-primary)',
      boxShadow: 'var(--shadow-md)',
    }}>
      <CardContent className="pt-5 pb-5 px-5 space-y-4">
        <div className="flex items-baseline justify-between">
          <h3 className="text-base font-semibold">Teams</h3>
          <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
            spec 050 v0.2
          </span>
        </div>

        {err && (
          <div style={{
            fontSize: '0.85em',
            color: 'var(--color-status-error, #c0392b)',
            background: 'color-mix(in srgb, currentColor 6%, transparent)',
            padding: '0.5rem 0.75rem',
            borderRadius: 4,
          }}>{err}</div>
        )}

        {/* Active org switcher */}
        {orgs.length > 0 && (
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              Active organization
            </div>
            <div className="flex flex-col gap-1">
              {orgs.map((o) => (
                <OrgRow
                  key={o.id}
                  org={o}
                  active={o.id === activeOrgId}
                  busy={mode === 'switching'}
                  onSwitch={() => onSwitch(o.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Create team */}
        <div className="pt-2 border-t" style={{ borderColor: 'var(--color-border-subtle)' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginTop: 8, marginBottom: 6 }}>
            Create a new team
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g. NET Group Engineering"
              className="flex-1 px-3 py-1.5 rounded text-sm"
              style={{
                background: 'var(--color-background-subtle)',
                border: '1px solid var(--color-border-subtle)',
              }}
            />
            <Button
              size="sm"
              disabled={!createName.trim() || mode !== 'idle'}
              onClick={onCreate}
            >
              {mode === 'creating' ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </div>

        {/* Manage existing teams (members + pending invites + invite) */}
        {teamOrgs.map((team) => {
          const detail = details[team.id];
          const canManage = team.role === 'owner' || team.role === 'admin';
          return (
          <div key={team.id} className="pt-2 border-t" style={{ borderColor: 'var(--color-border-subtle)' }}>
            <div className="flex items-baseline justify-between">
              <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{team.display_name}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                {team.member_count} member{team.member_count === 1 ? '' : 's'} · role: {team.role}
              </div>
            </div>

            {/* Members */}
            {detail && detail.members.length > 0 && (
              <div className="mt-2">
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                  Members
                </div>
                <div className="flex flex-col gap-1">
                  {detail.members.map((m) => (
                    <div key={m.user_id} className="flex items-center gap-2 px-2 py-1 rounded"
                      style={{
                        background: 'var(--color-background-subtle)',
                        fontSize: '0.85rem',
                      }}
                    >
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.email ?? m.user_id.slice(0, 8)}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>{m.role}</span>
                      {canManage && m.user_id !== user.id && (
                        <Button size="sm" variant="outline" disabled={mode !== 'idle'}
                          onClick={() => onRemove(team.id, m.user_id, m.email)}>
                          Remove
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pending invitations */}
            {detail && detail.pending_invitations.length > 0 && (
              <div className="mt-2">
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                  Pending invitations
                </div>
                <div className="flex flex-col gap-1">
                  {detail.pending_invitations.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 px-2 py-1 rounded"
                      style={{
                        background: 'var(--color-background-subtle)',
                        fontSize: '0.85rem',
                        opacity: 0.85,
                      }}
                    >
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.email}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>
                        {p.role} · expires {new Date(p.expires_at).toLocaleDateString()}
                      </span>
                      {canManage && (
                        <Button size="sm" variant="outline" disabled={mode !== 'idle'}
                          onClick={() => onRevoke(team.id, p.id)}>
                          Cancel
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(team.role === 'owner' || team.role === 'admin') && (
              <div className="mt-2">
                <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                  Invite a teammate by email
                </div>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="teammate@company.com"
                    className="flex-1 px-3 py-1.5 rounded text-sm"
                    style={{
                      background: 'var(--color-background-subtle)',
                      border: '1px solid var(--color-border-subtle)',
                    }}
                  />
                  <Button
                    size="sm"
                    disabled={!inviteEmail.includes('@') || mode !== 'idle'}
                    onClick={() => onInvite(team.id)}
                  >
                    {mode === 'inviting' ? 'Generating…' : 'Generate code'}
                  </Button>
                </div>
                {latestInvite && inviteTargetOrgId === team.id && (
                  <div
                    className="mt-2 p-2 rounded"
                    style={{
                      background: 'var(--color-background-subtle)',
                      border: '1px dashed var(--color-border-subtle)',
                    }}
                  >
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                      Share this code with the teammate (expires {new Date(latestInvite.expires_at).toLocaleDateString()}):
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <code style={{ fontSize: '0.9rem', fontFamily: 'var(--font-mono, monospace)', flex: 1 }}>
                        {latestInvite.code}
                      </code>
                      <Button size="sm" variant="outline" onClick={() => copyCode(latestInvite.code)}>
                        Copy
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
        })}

        {/* Accept invite */}
        <div className="pt-2 border-t" style={{ borderColor: 'var(--color-border-subtle)' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginTop: 8, marginBottom: 6 }}>
            Accept an invitation
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={acceptCode}
              onChange={(e) => setAcceptCode(e.target.value)}
              placeholder="atlas-invite-XXXX-XXXX-XXXX"
              className="flex-1 px-3 py-1.5 rounded text-sm"
              style={{
                background: 'var(--color-background-subtle)',
                border: '1px solid var(--color-border-subtle)',
                fontFamily: 'var(--font-mono, monospace)',
              }}
            />
            <Button
              size="sm"
              disabled={!acceptCode.trim() || mode !== 'idle'}
              onClick={onAccept}
            >
              {mode === 'accepting' ? 'Joining…' : 'Join'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OrgRow({
  org,
  active,
  busy,
  onSwitch,
}: {
  org: OrgMembership;
  active: boolean;
  busy: boolean;
  onSwitch: () => void;
}) {
  return (
    <div
      className="flex items-center gap-3 px-2 py-1.5 rounded"
      style={{
        background: active ? 'color-mix(in srgb, currentColor 6%, transparent)' : 'transparent',
        border: active
          ? '1px solid color-mix(in srgb, currentColor 18%, transparent)'
          : '1px solid transparent',
      }}
    >
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>
          {org.display_name}
          {org.is_personal && (
            <span style={{ marginLeft: 6, fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>
              · personal
            </span>
          )}
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}>
          {org.plan} · {org.role} · {org.member_count} member{org.member_count === 1 ? '' : 's'}
        </div>
      </div>
      {active ? (
        <span
          style={{
            fontSize: '0.72rem',
            fontWeight: 600,
            color: 'var(--color-accent-amber, currentColor)',
          }}
        >
          ACTIVE
        </span>
      ) : (
        <Button size="sm" variant="outline" disabled={busy} onClick={onSwitch}>
          Use
        </Button>
      )}
    </div>
  );
}
