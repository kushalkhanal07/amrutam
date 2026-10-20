import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Mic, MicOff, PhoneOff, Send, Video, VideoOff, WifiOff } from 'lucide-react';
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { doctorDisplayName } from '@/components/doctors/DoctorCard';
import { Avatar } from '@/components/ui/Avatar';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { ErrorState, Spinner } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { isHttpError } from '@/lib/api/client';
import { consultationsApi } from '@/lib/api/endpoints';
import type { Consultation, ConsultationMode } from '@/lib/api/types';
import { useAuth } from '@/lib/auth/AuthContext';
import { useConsultationChat } from '@/lib/chat/useConsultationChat';
import { cn } from '@/lib/utils/cn';
import { formatTime, fullName } from '@/lib/utils/format';
import { sessionCopy } from './sessionCopy';

/**
 * The live consultation room. This is the page the join link opens.
 * Chat is real time (Socket.IO). Video and audio are simulated: the local
 * camera/microphone preview is real, the other participant is a placeholder.
 */
export function ConsultationSessionPage() {
  const { id = '' } = useParams();
  const { role } = useAuth();
  const navigate = useNavigate();

  const consultation = useQuery({ queryKey: ['consultations', id], queryFn: () => consultationsApi.get(id), enabled: Boolean(id) });
  const session = useQuery({
    queryKey: ['consultations', id, 'session'],
    queryFn: () => consultationsApi.session(id),
    enabled: Boolean(id),
    retry: false,
    refetchInterval: 15_000, // notices when the doctor completes the consultation
  });

  const backHref = role === 'DOCTOR' ? `/doctor/consultations/${id}` : `/app/appointments/${id}`;

  if (consultation.isError) {
    return (
      <Shell backHref={backHref}>
        <ErrorState error={consultation.error} onRetry={() => consultation.refetch()} />
      </Shell>
    );
  }
  if (consultation.isPending || (session.isPending && !session.isError)) {
    return (
      <Shell backHref={backHref}>
        <Spinner className="min-h-[60vh]" label="Joining session" />
      </Shell>
    );
  }

  const c = consultation.data;
  const ended = c.status !== 'IN_PROGRESS' || isHttpError(session.error, 409);
  if (ended) {
    return (
      <Shell backHref={backHref}>
        <div className="mx-auto max-w-md py-20 text-center">
          <p className="eyebrow">Session</p>
          <h1 className="font-display mt-2 text-3xl">{c.status === 'SCHEDULED' ? 'This session has not started yet' : 'This session has ended'}</h1>
          <p className="mt-2 text-muted">
            {c.status === 'SCHEDULED' ? 'The link works once the doctor starts the consultation.' : 'Thank you. Notes and any prescription are on the consultation page.'}
          </p>
          <ButtonLink to={backHref} className="mt-6" leftIcon={<ArrowLeft className="size-4" />}>
            Back to consultation
          </ButtonLink>
        </div>
      </Shell>
    );
  }
  if (session.isError) {
    return (
      <Shell backHref={backHref}>
        <ErrorState error={session.error} onRetry={() => session.refetch()} />
      </Shell>
    );
  }

  const other = role === 'DOCTOR' ? fullName(c.patient.profile) : doctorDisplayName(c.doctor);
  const startedAt = session.data.startedAt ?? c.startedAt ?? c.scheduledStartsAt;

  return (
    <Shell backHref={backHref} title={`${sessionCopy(c.mode).title} · with ${other}`} startedAt={startedAt}>
      {c.mode === 'CHAT' ? (
        <ChatRoom consultationId={id} other={other} onLeave={() => navigate(backHref)} />
      ) : (
        <CallRoom mode={c.mode} other={other} consultation={c} onLeave={() => navigate(backHref)} />
      )}
    </Shell>
  );
}

function Shell({ children, backHref, title, startedAt }: { children: ReactNode; backHref: string; title?: string; startedAt?: string }) {
  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <header className="flex h-16 items-center justify-between gap-3 border-b border-line bg-white px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <Logo />
          {title && <p className="hidden truncate text-sm font-medium text-ink sm:block">{title}</p>}
        </div>
        <div className="flex items-center gap-4">
          {startedAt && <Elapsed since={startedAt} />}
          <Link to={backHref} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-forest">
            <ArrowLeft className="size-4" aria-hidden /> Consultation
          </Link>
        </div>
      </header>
      <main className="flex flex-1 flex-col px-4 py-5 sm:px-6">{children}</main>
    </div>
  );
}

function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const total = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-mint px-3 py-1 text-xs font-semibold text-forest" aria-label="Session duration">
      <span className="size-2 animate-pulse rounded-full bg-error" aria-hidden />
      {mm}:{ss}
    </span>
  );
}

// ---- Video / audio (simulated) ---------------------------------------------------

/** Opens the camera and/or microphone and releases them when the page unmounts. */
function useLocalMedia(mode: ConsultationMode) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(mode === 'VIDEO');

  useEffect(() => {
    let active = true;
    let current: MediaStream | null = null;
    const media = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!media?.getUserMedia) {
      setError('This browser does not allow camera or microphone access. You can still continue in the room.');
      return;
    }
    media
      .getUserMedia({ audio: true, video: mode === 'VIDEO' })
      .then((s) => {
        if (!active) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        current = s;
        setStream(s);
      })
      .catch(() => {
        if (active)
          setError(
            mode === 'VIDEO' ? 'Camera or microphone access was blocked. Allow it in the browser and reload to share video.' : 'Microphone access was blocked. Allow it in the browser and reload.',
          );
      });
    return () => {
      active = false;
      current?.getTracks().forEach((t) => t.stop());
    };
  }, [mode]);

  const toggleMic = () => {
    const next = !micOn;
    stream?.getAudioTracks().forEach((t) => (t.enabled = next));
    setMicOn(next);
  };
  const toggleCam = () => {
    const next = !camOn;
    stream?.getVideoTracks().forEach((t) => (t.enabled = next));
    setCamOn(next);
  };
  const stop = () => stream?.getTracks().forEach((t) => t.stop());

  return { stream, error, micOn, camOn, toggleMic, toggleCam, stop };
}

function CallRoom({ mode, other, consultation, onLeave }: { mode: ConsultationMode; other: string; consultation: Consultation; onLeave: () => void }) {
  const media = useLocalMedia(mode);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = media.stream;
  }, [media.stream, media.camOn]);

  const leave = () => {
    media.stop();
    onLeave();
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4">
      <div className="grid flex-1 gap-4 md:grid-cols-[1fr_280px]">
        {/* Remote participant (simulated) */}
        <div className="relative flex min-h-[320px] flex-col items-center justify-center rounded-2xl bg-forest-deep text-white md:min-h-[480px]">
          <Avatar name={other} size="xl" />
          <p className="font-display mt-4 text-2xl">{other}</p>
          <p className="mt-1 text-sm text-sage/80">{mode === 'VIDEO' ? 'Waiting for their video…' : 'Audio call in progress'}</p>
          <span className="absolute left-4 top-4 rounded-full bg-white/10 px-3 py-1 text-xs font-medium">Simulated room · no media is transmitted</span>
          {mode === 'AUDIO' && <Waveform className="absolute bottom-6" />}
        </div>

        {/* Local preview */}
        <div className="flex flex-col gap-3">
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-ink">
            {mode === 'VIDEO' && media.stream && media.camOn ? (
              <video ref={videoRef} autoPlay muted playsInline className="size-full object-cover [transform:scaleX(-1)]" aria-label="Your camera" />
            ) : (
              <div className="flex size-full flex-col items-center justify-center text-white/80">
                <Avatar name="You" size="lg" />
                <p className="mt-2 text-sm">{mode === 'VIDEO' && !media.camOn ? 'Camera off' : 'You'}</p>
              </div>
            )}
            <span className="absolute bottom-2 left-2 rounded bg-black/50 px-2 py-0.5 text-xs text-white">You {media.micOn ? '' : '· muted'}</span>
          </div>
          <div className="surface p-4 text-sm">
            <p className="font-semibold">{consultation.reasonForVisit ? 'Reason for visit' : 'Consultation'}</p>
            <p className="mt-1 whitespace-pre-line text-muted">
              {consultation.reasonForVisit ?? `Scheduled ${formatTime(consultation.scheduledStartsAt)} – ${formatTime(consultation.scheduledEndsAt)}`}
            </p>
          </div>
          {media.error && <p className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">{media.error}</p>}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-center gap-3 rounded-2xl bg-white p-3 shadow-[var(--shadow-lift)]">
        <ControlButton label={media.micOn ? 'Mute microphone' : 'Unmute microphone'} active={media.micOn} onClick={media.toggleMic} disabled={!media.stream}>
          {media.micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
        </ControlButton>
        {mode === 'VIDEO' && (
          <ControlButton label={media.camOn ? 'Turn camera off' : 'Turn camera on'} active={media.camOn} onClick={media.toggleCam} disabled={!media.stream}>
            {media.camOn ? <Video className="size-5" /> : <VideoOff className="size-5" />}
          </ControlButton>
        )}
        <Button variant="danger" onClick={leave} leftIcon={<PhoneOff className="size-4" />}>
          Leave
        </Button>
      </div>
    </div>
  );
}

function ControlButton({ label, active, children, ...rest }: { label: string; active: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        'inline-flex size-11 items-center justify-center rounded-full transition-colors focus-visible:shadow-[var(--shadow-ring)] focus-visible:outline-none disabled:opacity-50',
        active ? 'bg-mint text-forest hover:bg-sage' : 'bg-error-soft text-error hover:bg-error/20',
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

function Waveform({ className }: { className?: string }) {
  return (
    <div className={cn('flex h-8 items-end gap-1', className)} aria-hidden>
      {[3, 6, 8, 5, 7, 4, 6, 3].map((h, i) => (
        <span key={i} className="w-1 animate-pulse rounded-full bg-sage" style={{ height: `${h * 4}px`, animationDelay: `${i * 120}ms` }} />
      ))}
    </div>
  );
}

// ---- Chat (real time) ------------------------------------------------------------

const TYPING_IDLE_MS = 2000;

function ChatRoom({ consultationId, other, onLeave }: { consultationId: string; other: string; onLeave: () => void }) {
  const chat = useConsultationChat(consultationId);
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingSent = useRef(false);
  const setTyping = chat.setTyping;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [chat.messages.length, chat.peerTyping]);

  const stopTyping = () => {
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = null;
    if (typingSent.current) {
      typingSent.current = false;
      setTyping(false);
    }
  };

  const onDraftChange = (value: string) => {
    setDraft(value);
    if (!value.trim()) {
      stopTyping();
      return;
    }
    if (!typingSent.current) {
      typingSent.current = true;
      setTyping(true);
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(stopTyping, TYPING_IDLE_MS);
  };

  // Clear the typing indicator for the other side when leaving the page.
  useEffect(
    () => () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (typingSent.current) setTyping(false);
    },
    [setTyping],
  );

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    stopTyping();
    try {
      await chat.send(text);
      setDraft('');
    } catch (err) {
      toast.error('Message not sent', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  const status = chat.connection === 'online' ? (chat.peerOnline ? `${other} is online` : `Waiting for ${other} to join…`) : chat.connection === 'connecting' ? 'Connecting…' : 'Reconnecting…';

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
      <div className="surface flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Avatar name={other} size="sm" />
              <span className={cn('absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-white', chat.peerOnline ? 'bg-success' : 'bg-line')} aria-hidden />
            </div>
            <div>
              <p className="text-sm font-semibold">{other}</p>
              <p className="flex items-center gap-1.5 text-xs text-muted">
                {chat.connection === 'offline' && <WifiOff className="size-3.5" aria-hidden />}
                {status}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onLeave} leftIcon={<PhoneOff className="size-4" />}>
            Leave
          </Button>
        </div>

        {chat.error && <p className="border-b border-error/20 bg-error-soft px-5 py-2 text-sm text-error">{chat.error}</p>}

        <div ref={listRef} className="flex min-h-[360px] flex-1 flex-col gap-2 overflow-y-auto bg-cream/60 px-5 py-4" role="log" aria-live="polite">
          {chat.isLoading && <Spinner label="Loading messages" />}
          {!chat.isLoading && chat.messages.length === 0 && <p className="m-auto text-sm text-muted">No messages yet. Say hello to {other}.</p>}
          {chat.messages.map((m) => {
            const mine = m.senderId === chat.myId;
            return (
              <div key={m.id} className={cn('max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm', mine ? 'self-end bg-forest text-white' : 'self-start bg-white text-ink')}>
                {!mine && <p className="mb-0.5 text-xs font-semibold text-forest">{m.senderName}</p>}
                <p className="whitespace-pre-line break-words">{m.text}</p>
                <p className={cn('mt-1 text-[11px]', mine ? 'text-white/70' : 'text-muted')}>{formatTime(m.createdAt)}</p>
              </div>
            );
          })}
          {chat.peerTyping && (
            <p className="self-start rounded-2xl bg-white px-4 py-2 text-sm italic text-muted shadow-sm" aria-label={`${other} is typing`}>
              {other} is typing…
            </p>
          )}
        </div>

        <form onSubmit={(e) => void send(e)} className="flex items-end gap-2 border-t border-line bg-white p-3">
          <textarea
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder="Type a message… (Enter to send, Shift+Enter for a new line)"
            aria-label="Message"
            className="max-h-32 min-h-11 flex-1 resize-y rounded-md border border-line px-3 py-2.5 text-sm focus-visible:shadow-[var(--shadow-ring)] focus-visible:outline-none"
          />
          <Button type="submit" disabled={!draft.trim() || chat.connection !== 'online'} loading={sending} leftIcon={<Send className="size-4" />}>
            Send
          </Button>
        </form>
      </div>
    </div>
  );
}
