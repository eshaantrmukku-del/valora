/**
 * Transactional email via Resend (https://resend.com/docs/api-reference/emails/send-email).
 * When RESEND_API_KEY / EMAIL_FROM are not set, email is reported as not configured — never as sent.
 */
import { config } from '../config';
import { fetchJson } from '../lib/http';

export function isEmailConfigured(): boolean {
  const c = config();
  return Boolean(c.RESEND_API_KEY && c.EMAIL_FROM);
}

export async function sendEmail(msg: { to: string; subject: string; text: string }): Promise<{ id: string }> {
  const c = config();
  if (!c.RESEND_API_KEY || !c.EMAIL_FROM) throw new Error('Email delivery is not configured');
  const res = await fetchJson<{ id?: string }>('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: { from: c.EMAIL_FROM, to: [msg.to], subject: msg.subject, text: msg.text },
    retries: 1,
    timeoutMs: 10_000,
  });
  if (!res.id) throw new Error('Email provider returned no message id');
  return { id: res.id };
}
