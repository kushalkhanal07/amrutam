import type { ConsultationMode } from '@/lib/api/types';

/** User-facing wording for each consultation mode, shared by the doctor, patient and room pages. */
export function sessionCopy(mode: ConsultationMode): {
  title: string;
  join: string;
  noun: string;
} {
  switch (mode) {
    case 'AUDIO':
      return {
        title: 'Audio call is live',
        join: 'Join audio call',
        noun: 'audio call',
      };
    case 'CHAT':
      return { title: 'Chat is open', join: 'Open chat', noun: 'chat' };
    default:
      return {
        title: 'Video call is live',
        join: 'Join video call',
        noun: 'video call',
      };
  }
}
