import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '../../../shared/types/events';
import { ServerlessTransport } from './serverlessTransport';

export const SERVER_URL = import.meta.env.VITE_SERVER_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '');
const useSupabase = Boolean(
  import.meta.env.VITE_SUPABASE_URL &&
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY),
);
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = (
  useSupabase ? new ServerlessTransport() : io(SERVER_URL, { autoConnect: true, reconnection: true })
) as unknown as Socket<ServerToClientEvents, ClientToServerEvents>;

export function getSessionId(): string {
  let value = localStorage.getItem('splendor:session');
  if (!value) {
    value = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
    localStorage.setItem('splendor:session', value);
  }
  return value;
}

export function setNickname(name: string): void {
  localStorage.setItem('splendor:nickname', name.trim());
}

export function getNickname(): string {
  return localStorage.getItem('splendor:nickname') ?? '';
}
