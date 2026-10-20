import { Injectable, Logger } from '@nestjs/common';
import { NotificationJob } from '@prisma/client';
import { createTransport, Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { AppConfigService } from '../../config/app-config.service';
import { renderEmail } from './email-templates';

/**
 * Outbound email. Sends through SMTP when SMTP_HOST is configured; otherwise
 * delivery is simulated and the message is logged (with the link, so the flow
 * can still be exercised locally).
 */
@Injectable()
export class NotificationSender {
  private readonly logger = new Logger(NotificationSender.name);
  private readonly transporter?: Transporter<SMTPTransport.SentMessageInfo>;

  constructor(private readonly config: AppConfigService) {
    if (config.smtpConfigured) {
      const user = config.get('SMTP_USER');
      this.transporter = createTransport({
        host: config.get('SMTP_HOST'),
        port: config.get('SMTP_PORT'),
        secure: config.get('SMTP_SECURE'),
        auth: user ? { user, pass: config.get('SMTP_PASS') ?? '' } : undefined,
        connectionTimeout: 10_000,
        socketTimeout: 15_000,
      });
      this.logger.log(
        `Email delivery enabled via SMTP (${config.get('SMTP_HOST')}:${config.get('SMTP_PORT')})`,
      );
    } else if (!config.isTest) {
      this.logger.warn('SMTP_HOST is not set: emails are simulated and only logged');
    }
  }

  async send(job: NotificationJob, recipientEmail: string): Promise<void> {
    const email = renderEmail(job);
    if (!this.transporter) {
      await Promise.resolve();
      const payload = (job.payload ?? {}) as Record<string, unknown>;
      this.logger.log(
        {
          jobId: job.id,
          type: job.type,
          channel: job.channel,
          to: maskEmail(recipientEmail),
          subject: email.subject,
          ...(typeof payload.joinUrl === 'string' ? { joinUrl: payload.joinUrl } : {}),
        },
        'Notification sent (simulated)',
      );
      return;
    }
    const info = await this.transporter.sendMail({
      from: this.config.get('MAIL_FROM'),
      to: recipientEmail,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
    this.logger.log(
      { jobId: job.id, type: job.type, to: maskEmail(recipientEmail), messageId: info.messageId },
      'Email sent',
    );
  }
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 2)}***@${domain}`;
}
