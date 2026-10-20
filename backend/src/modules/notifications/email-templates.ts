import { NotificationJob } from '@prisma/client';

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

type Payload = Record<string, unknown>;

const str = (p: Payload, key: string): string | undefined => {
  const v = p[key];
  return typeof v === 'string' && v.trim() ? v : undefined;
};

const MODE_LABEL: Record<string, string> = { VIDEO: 'video call', AUDIO: 'audio call', CHAT: 'chat' };

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);
}

/** Wraps the message in a small branded layout. `bodyHtml` must already be escaped. */
function layout(title: string, bodyHtml: string, cta?: { label: string; url: string }): string {
  const button = cta
    ? `<p style="margin:28px 0"><a href="${escapeHtml(cta.url)}" style="background:#245c45;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;display:inline-block">${escapeHtml(cta.label)}</a></p>
       <p style="font-size:13px;color:#748078">If the button does not work, open this link:<br><a href="${escapeHtml(cta.url)}" style="color:#245c45">${escapeHtml(cta.url)}</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#faf8f2;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#24342d">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <p style="font-size:20px;font-weight:700;color:#173f32;margin:0 0 24px">Amrutam <span style="font-size:11px;letter-spacing:.18em;color:#748078">CARE</span></p>
    <div style="background:#fff;border:1px solid #e5eae4;border-radius:12px;padding:28px">
      <h1 style="font-size:22px;margin:0 0 16px">${escapeHtml(title)}</h1>
      ${bodyHtml}
      ${button}
    </div>
    <p style="font-size:12px;color:#748078;margin-top:20px">This is an automated message from Amrutam Care. Please do not reply.</p>
  </div></body></html>`;
}

function simple(title: string, text: string): EmailContent {
  const paragraphs = text
    .split('\n\n')
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
    .join('');
  return { subject: title, text, html: layout(title, paragraphs) };
}

/** Builds subject/text/html for a notification job. Payloads contain display data only. */
export function renderEmail(job: Pick<NotificationJob, 'type' | 'payload'>): EmailContent {
  const p = (job.payload ?? {}) as Payload;
  const greetingName = str(p, 'patientFirstName') ?? str(p, 'firstName');
  const hello = greetingName ? `Hi ${greetingName},` : 'Hello,';

  switch (job.type) {
    case 'consultation.started': {
      const doctor = str(p, 'doctorName') ?? 'Your doctor';
      const mode = MODE_LABEL[str(p, 'mode') ?? ''] ?? 'consultation';
      const joinUrl = str(p, 'joinUrl') ?? '';
      const title = `${doctor} is ready for your ${mode}`;
      const text = `${hello}\n\n${doctor} has started your ${mode}. Join now using this link:\n${joinUrl}\n\nThe link works while the consultation is in progress.`;
      const html = layout(
        title,
        `<p>${escapeHtml(hello)}</p><p>${escapeHtml(doctor)} has started your ${escapeHtml(mode)}. Please join now.</p>`,
        joinUrl ? { label: `Join ${mode}`, url: joinUrl } : undefined,
      );
      return { subject: title, text, html };
    }
    case 'consultation.completed':
      return simple(
        'Your consultation is complete',
        `${hello}\n\nYour consultation has ended. Any prescription will appear in your Amrutam account.`,
      );
    case 'prescription.issued':
      return simple(
        'A prescription has been issued',
        `${hello}\n\nYour doctor has issued a prescription. You can view it in your Amrutam account under Prescriptions.`,
      );
    case 'booking.confirmed':
      return simple(
        'Your appointment is booked',
        `${hello}\n\nYour appointment has been booked. Complete the payment in your Amrutam account to confirm it.`,
      );
    case 'booking.cancelled':
      return simple(
        'Your appointment was cancelled',
        `${hello}\n\nYour appointment has been cancelled. Any payment is refunded or voided automatically.`,
      );
    case 'payment.succeeded':
      return simple(
        'Payment received',
        `${hello}\n\nYour payment was successful. Your appointment is confirmed.`,
      );
    case 'payment.failed':
      return simple(
        'Payment failed',
        `${hello}\n\nYour payment could not be completed. Please try again from your Amrutam account.`,
      );
    default:
      return simple('Update from Amrutam Care', `${hello}\n\nThere is an update on your Amrutam account.`);
  }
}
