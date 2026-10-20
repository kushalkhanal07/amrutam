import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_URL } from '@/lib/api/client';
import { consultationsApi } from '@/lib/api/endpoints';
import type { ChatMessage, Role } from '@/lib/api/types';
import { useAuth } from '@/lib/auth/AuthContext';
import { tokenStore } from '@/lib/auth/tokenStore';

export type ChatConnection = 'connecting' | 'online' | 'offline';

interface PresenceEvent {
  userId: string;
  role: Role;
  online: boolean;
}

type Ack<T> = T | { error: string };

const hasError = (res: unknown): res is { error: string } => typeof res === 'object' && res !== null && 'error' in res;

/**
 * Real-time consultation chat. History comes from REST; new messages, presence
 * and typing arrive over the Socket.IO `/chat` namespace. The socket authenticates
 * with the current access token and reconnects automatically.
 */
export function useConsultationChat(consultationId: string) {
  const { user } = useAuth();
  const myId = user?.id;
  const history = useQuery({
    queryKey: ['consultations', consultationId, 'messages'],
    queryFn: () => consultationsApi.messages(consultationId),
    enabled: Boolean(consultationId),
  });
  const refetchHistory = history.refetch;

  const [live, setLive] = useState<ChatMessage[]>([]);
  const [connection, setConnection] = useState<ChatConnection>('connecting');
  const [peerOnline, setPeerOnline] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!consultationId || !myId) return;
    const socket = io(`${API_URL}/chat`, {
      // Called on every (re)connect, so a refreshed token is always used.
      auth: (cb) => cb({ token: tokenStore.getAccessToken() ?? '' }),
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    const addMessage = (m: ChatMessage) => setLive((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));

    socket.on('connect', () => {
      setError(null);
      socket.emit('chat:join', { consultationId }, (res: Ack<{ ok: true; online: PresenceEvent[] }>) => {
        if (hasError(res)) {
          setError(res.error);
          setConnection('offline');
          return;
        }
        setConnection('online');
        setPeerOnline(res.online.some((p) => p.userId !== myId));
        void refetchHistory(); // catch up on anything missed while disconnected
      });
    });
    socket.on('disconnect', () => {
      setConnection('offline');
      setPeerOnline(false);
      setPeerTyping(false);
    });
    socket.on('connect_error', (err: Error & { data?: { code?: string } }) => {
      setConnection('offline');
      if (err.data?.code === 'UNAUTHORIZED') setError(err.message); // network blips just keep retrying
    });
    socket.on('chat:message', addMessage);
    socket.on('chat:presence', (p: PresenceEvent) => {
      if (p.userId === myId) return;
      setPeerOnline(p.online);
      if (!p.online) setPeerTyping(false);
    });
    socket.on('chat:typing', (t: { userId: string; typing: boolean }) => {
      if (t.userId !== myId) setPeerTyping(t.typing);
    });
    socket.on('chat:error', (e: { message: string }) => setError(e.message));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [consultationId, myId, refetchHistory]);

  const messages = useMemo(() => {
    const byId = new Map<string, ChatMessage>();
    for (const m of [...(history.data ?? []), ...live]) byId.set(m.id, m);
    return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [history.data, live]);

  const send = useCallback(
    (text: string) =>
      new Promise<void>((resolve, reject) => {
        const socket = socketRef.current;
        if (!socket?.connected) {
          reject(new Error('You are offline. The message was not sent.'));
          return;
        }
        socket.timeout(8000).emit('chat:send', { consultationId, text }, (err: Error | null, res: Ack<ChatMessage>) => {
          if (err) reject(new Error('No reply from the server. Check your connection and try again.'));
          else if (hasError(res)) reject(new Error(res.error));
          else {
            setLive((prev) => (prev.some((x) => x.id === res.id) ? prev : [...prev, res]));
            resolve();
          }
        });
      }),
    [consultationId],
  );

  const setTyping = useCallback(
    (typing: boolean) => {
      socketRef.current?.emit('chat:typing', { consultationId, typing });
    },
    [consultationId],
  );

  return { messages, connection, peerOnline, peerTyping, error, send, setTyping, isLoading: history.isPending, myId };
}
