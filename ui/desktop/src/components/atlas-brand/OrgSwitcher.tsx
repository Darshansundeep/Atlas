/**
 * Org switcher (spec 050 v0.2 polish, refactored 2026-06-03).
 *
 * Renders in the sidebar header below the Atlas wordmark, NOT in the
 * title bar — title-bar position collided with the top-right toast
 * container. Sidebar placement matches the workspace-switcher pattern
 * users expect from Slack / Linear / Notion.
 *
 * Only renders when:
 *   - The user is signed in
 *   - They belong to more than one org (personal-only users see nothing)
 *
 * Clicking a non-active row POSTs /v1/auth/switch-org. The AuthContext's
 * accessToken is swapped in place; the next goosed spawn inherits the
 * new org via env passthrough.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Check, Building2 } from 'lucide-react';
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
  // Don't clutter the sidebar for users who only have a personal org.
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
    <div ref={ref} style={{ position: 'relative', padding: '0 16px 8px' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          padding: '6px 8px',
          borderRadius: 6,
          border: '1px solid var(--color-border-subtle, rgba(0,0,0,0.08))',
          background: 'var(--color-background-subtle, transparent)',
          color: 'inherit',
          cursor: 'pointer',
          fontSize: '0.78rem',
          textAlign: 'left',
        }}
        title={`Active workspace: ${active.display_name} (${active.role})`}
      >
        <Building2 size={12} style={{ flexShrink: 0, opacity: 0.7 }} />
        <span style={{
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
        }}>
          {active.display_name}
        </span>
        <ChevronDown size={12} style={{ flexShrink: 0, opacity: 0.7 }} />
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 2px)',
            left: 16,
            right: 16,
            zIndex: 50,
            borderRadius: 8,
            border: '1px solid var(--color-border-subtle, rgba(0,0,0,0.1))',
            background: 'var(--color-background-primary)',
            boxShadow: 'var(--shadow-md, 0 4px 12px rgba(0,0,0,0.12))',
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
                  fontSize: '0.82rem',
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
