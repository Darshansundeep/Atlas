/**
 * Title-bar org switcher. Spec 050 v0.2 polish.
 *
 * Compact dropdown that shows the user's active organization and lets
 * them switch between memberships in one click. Only renders when:
 *   - The user is signed in
 *   - They belong to more than one org (i.e. at least one team org;
 *     personal-only users see nothing)
 *
 * Clicking "Use" on a non-active org POSTs /v1/auth/switch-org and the
 * AuthContext's accessToken is swapped in place. The desktop's next
 * goosed spawn picks up the new org via the env-pass-through.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import {
  listMyOrgs,
  switchActiveOrg,
  type MyOrgsResponse,
} from '../../auth/api';
import { useAuth } from '../../auth';

export default function OrgSwitcher() {
  const { user, accessToken, applyAccessToken } = useAuth();
  const [data, setData] = useState<MyOrgsResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    if (!accessToken) { setData(null); return; }
    try { setData(await listMyOrgs(accessToken)); } catch { /* silent */ }
  }, [accessToken]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!user || !accessToken || !data) return null;
  // Don't clutter the chrome for users who only have a personal org.
  if (data.organizations.length < 2) return null;

  const active = data.organizations.find((o) => o.id === data.active_org_id)
    ?? data.organizations[0];

  async function pick(orgId: string) {
    if (orgId === data?.active_org_id) { setOpen(false); return; }
    if (!accessToken) return;
    setBusy(true);
    try {
      const swapped = await switchActiveOrg(accessToken, orgId);
      applyAccessToken?.(swapped.access_token);
      await refresh();
    } catch { /* silent */ }
    finally { setBusy(false); setOpen(false); }
  }

  return (
    <div
      ref={ref}
      className="no-drag"
      style={{
        position: 'fixed',
        top: 4,
        right: 12,
        zIndex: 60,
        fontSize: '0.78rem',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 8px',
          borderRadius: 6,
          border: '1px solid color-mix(in srgb, currentColor 22%, transparent)',
          background: 'color-mix(in srgb, currentColor 6%, transparent)',
          color: 'inherit',
          cursor: 'pointer',
          maxWidth: 240,
        }}
        title={`Active organization: ${active.display_name} (${active.role})`}
      >
        <span style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: 180,
        }}>
          {active.display_name}
        </span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            minWidth: 260,
            maxWidth: 320,
            borderRadius: 8,
            border: '1px solid var(--color-border-subtle)',
            background: 'var(--color-background-primary)',
            boxShadow: 'var(--shadow-md)',
            padding: 4,
          }}
        >
          {data.organizations.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => pick(o.id)}
              disabled={busy}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '6px 8px',
                borderRadius: 6,
                background: o.id === data.active_org_id
                  ? 'color-mix(in srgb, currentColor 8%, transparent)'
                  : 'transparent',
                border: 'none',
                cursor: o.id === data.active_org_id ? 'default' : 'pointer',
                textAlign: 'left',
                color: 'inherit',
              }}
              onMouseEnter={(e) => {
                if (o.id !== data.active_org_id) {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    'color-mix(in srgb, currentColor 4%, transparent)';
                }
              }}
              onMouseLeave={(e) => {
                if (o.id !== data.active_org_id) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontWeight: 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {o.display_name}
                  {o.is_personal && (
                    <span style={{
                      marginLeft: 6,
                      fontSize: '0.7em',
                      color: 'var(--color-text-secondary)',
                    }}>
                      · personal
                    </span>
                  )}
                </div>
                <div style={{
                  fontSize: '0.7rem',
                  color: 'var(--color-text-secondary)',
                }}>
                  {o.plan} · {o.role}
                </div>
              </span>
              {o.id === data.active_org_id && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
