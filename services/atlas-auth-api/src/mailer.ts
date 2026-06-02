/**
 * Tiny mailer abstraction. Spec 050 v0.2.1 — invitation emails.
 *
 * Two implementations:
 *   - console-stub  : logs to stdout. Default for dev (no SMTP needed).
 *                     Backend continues to return the invite code in the
 *                     HTTP response so paste-share fallback always works.
 *   - resend        : Resend.com HTTP API (https://resend.com/docs/api-
 *                     reference/emails/send-email). Auto-selected when
 *                     RESEND_API_KEY env is set.
 *
 * Production swap-ins (Postmark / SES / SendGrid) just add another impl
 * here — the call site doesn't change.
 */

export interface EmailMessage {
  to: string;
  from: string;
  subject: string;
  text: string;
  html?: string;
}

export interface MailerSendResult {
  ok: boolean;
  provider: string;
  provider_message_id?: string;
  error?: string;
}

export interface Mailer {
  send(msg: EmailMessage): Promise<MailerSendResult>;
}

class ConsoleStubMailer implements Mailer {
  async send(msg: EmailMessage): Promise<MailerSendResult> {
    // eslint-disable-next-line no-console
    console.log(
      `[mailer:stub] to=${msg.to} from=${msg.from} subject=${JSON.stringify(msg.subject)}\n` +
      `--- text ---\n${msg.text}\n--- end ---`
    );
    return { ok: true, provider: 'console-stub' };
  }
}

class ResendMailer implements Mailer {
  constructor(private readonly apiKey: string) {}

  async send(msg: EmailMessage): Promise<MailerSendResult> {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: msg.from,
          to: msg.to,
          subject: msg.subject,
          text: msg.text,
          ...(msg.html ? { html: msg.html } : {}),
        }),
      });
      const body = await res.text();
      if (!res.ok) {
        return { ok: false, provider: 'resend', error: `${res.status}: ${body.slice(0, 200)}` };
      }
      let provider_message_id: string | undefined;
      try {
        const parsed = JSON.parse(body) as { id?: string };
        provider_message_id = parsed.id;
      } catch { /* ignore */ }
      return { ok: true, provider: 'resend', provider_message_id };
    } catch (e) {
      return { ok: false, provider: 'resend', error: (e as Error).message };
    }
  }
}

let cached: Mailer | null = null;

export function getMailer(env: { RESEND_API_KEY?: string }): Mailer {
  if (cached) return cached;
  if (env.RESEND_API_KEY && env.RESEND_API_KEY.startsWith('re_')) {
    cached = new ResendMailer(env.RESEND_API_KEY);
  } else {
    cached = new ConsoleStubMailer();
  }
  return cached;
}

/**
 * Reset the cached mailer. Test-only — call between unit tests that
 * exercise different env shapes.
 */
export function resetMailerForTests(): void {
  cached = null;
}

// ---------------------------------------------------------------------------
// Templates

export function inviteEmail(args: {
  inviteeEmail: string;
  orgName: string;
  inviterEmail: string;
  code: string;
  expiresAt: Date;
  fromAddress: string;
}): EmailMessage {
  const expiry = args.expiresAt.toLocaleDateString();
  const text =
`${args.inviterEmail} has invited you to join ${args.orgName} on Atlas.

To accept, open Atlas and paste this code in Settings → App → Atlas Team → Accept an invitation:

  ${args.code}

This code expires on ${expiry}.

Don't have Atlas yet? Download it at https://atlas.netgroup.ai and sign in with this email address, then paste the code above.

— Atlas`;

  const html =
`<!doctype html><html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; line-height: 1.5;">
  <p><strong>${escapeHtml(args.inviterEmail)}</strong> has invited you to join <strong>${escapeHtml(args.orgName)}</strong> on Atlas.</p>
  <p>To accept, open Atlas and paste this code in <em>Settings → App → Atlas Team → Accept an invitation</em>:</p>
  <p style="font-family: ui-monospace, SFMono-Regular, monospace; font-size: 1.1em; padding: 12px 16px; background: #f4f4f5; border: 1px solid #e4e4e7; border-radius: 6px; display: inline-block;">${escapeHtml(args.code)}</p>
  <p style="color: #71717a; font-size: 0.9em;">This code expires on ${escapeHtml(expiry)}.</p>
  <p>Don't have Atlas yet? <a href="https://atlas.netgroup.ai">Download it here</a> and sign in with this email address, then paste the code above.</p>
  <hr style="border: 0; border-top: 1px solid #e4e4e7; margin: 24px 0;">
  <p style="color: #a1a1aa; font-size: 0.85em;">Atlas — NET Group</p>
</body></html>`;

  return {
    to: args.inviteeEmail,
    from: args.fromAddress,
    subject: `Join ${args.orgName} on Atlas`,
    text,
    html,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
