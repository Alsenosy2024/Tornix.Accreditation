import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware.js';

export function sendEmailRouter(_ctx: object) {
  const r = Router();

  // POST /api/send-email  -> { id } on success (admin only)
  r.post('/api/send-email', requireAuth, requireAdmin, async (req, res) => {
    const { to, subject, html, from } = req.body ?? {};

    if (!to || !subject || !html) {
      return res.status(400).json({ error: 'to, subject, html required' });
    }

    const key = process.env.RESEND_API_KEY;
    if (!key) {
      return res.status(400).json({ error: 'RESEND_API_KEY not configured' });
    }

    const { Resend } = await import('resend');
    const resend = new Resend(key);
    const fromAddress = from ?? process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';

    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    });

    if (error) {
      return res.status(502).json({ error: (error as { message?: string }).message ?? 'Resend error' });
    }

    res.json({ id: (data as { id?: string })?.id });
  });

  return r;
}
