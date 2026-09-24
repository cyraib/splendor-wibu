import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import type { ActionResult, PlayerGameView, RoomView } from '../../../shared/types/game';

type Handler = (...args: any[]) => void;
type ApiResponse = ActionResult & { data?: { room: RoomView; playerId: string }; room?: RoomView; game?: PlayerGameView; playerId?: string };

export class ServerlessTransport {
  connected = true;
  private handlers = new Map<string, Set<Handler>>();
  private channels = new Map<string, RealtimeChannel>();
  private syncTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private lastRoom?: RoomView;
  private lastGame?: PlayerGameView;
  private playerId?: string;
  private client = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY,
    {
    auth: { persistSession: false, autoRefreshToken: false }
    },
  );

  on(event: string, handler: Handler): this {
    const handlers = this.handlers.get(event) ?? new Set();
    handlers.add(handler);
    this.handlers.set(event, handlers);
    if (event === 'connect') queueMicrotask(() => handler());
    return this;
  }

  off(event: string, handler?: Handler): this {
    if (!handler) this.handlers.delete(event);
    else this.handlers.get(event)?.delete(handler);
    return this;
  }

  private dispatch(event: string, ...args: any[]): void {
    this.handlers.get(event)?.forEach((handler) => handler(...args));
  }

  private consume(result: ApiResponse): void {
    this.playerId = result.playerId ?? result.data?.playerId ?? this.playerId;
    if (result.room) {
      this.lastRoom = result.room;
      this.dispatch('room:state', result.room);
    }
    if (result.game) {
      this.lastGame = result.game;
      this.dispatch('game:state', result.game);
    }
  }

  private async request(event: string, payload: Record<string, unknown>): Promise<ApiResponse> {
    const response = await fetch('/api/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event, payload })
    });
    return response.json() as Promise<ApiResponse>;
  }

  private subscribe(roomId: string): void {
    if (this.channels.has(roomId)) return;
    const channel = this.client
      .channel(`room-signal:${roomId}`, { config: { presence: { key: this.playerId ?? crypto.randomUUID() } } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_signals', filter: `room_id=eq.${roomId}` }, () => {
        clearTimeout(this.syncTimers.get(roomId));
        this.syncTimers.set(roomId, setTimeout(() => void this.sync(roomId), 35));
      })
      .on('presence', { event: 'sync' }, () => {
        const online = new Set(
          Object.values(channel.presenceState()).flat().map((entry) => String((entry as { playerId?: string }).playerId ?? ''))
        );
        if (this.lastRoom) {
          this.lastRoom = { ...this.lastRoom, players: this.lastRoom.players.map((player) => ({ ...player, connected: online.has(player.id) })) };
          this.dispatch('room:state', this.lastRoom);
        }
        if (this.lastGame) {
          this.lastGame = { ...this.lastGame, players: this.lastGame.players.map((player) => ({ ...player, connected: online.has(player.id) })) };
          this.dispatch('game:state', this.lastGame);
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && this.playerId) void channel.track({ playerId: this.playerId, onlineAt: new Date().toISOString() });
      });
    this.channels.set(roomId, channel);
  }

  private async sync(roomId: string): Promise<void> {
    const sessionId = localStorage.getItem('splendor:session') ?? '';
    if (!sessionId) return;
    try {
      const result = await this.request('room:sync', { roomId, sessionId });
      if (result.ok) this.consume(result);
    } catch {
      this.dispatch('room:error', 'Không thể đồng bộ room. Đang thử kết nối lại…');
    }
  }

  emit(event: string, payload: Record<string, unknown>, ack?: (result: ApiResponse) => void): this {
    const roomId = typeof payload.roomId === 'string' ? payload.roomId.toUpperCase() : undefined;
    const enriched = { ...payload, sessionId: payload.sessionId ?? localStorage.getItem('splendor:session') ?? '' };
    void this.request(event, enriched)
      .then((result) => {
        if (result.ok) this.consume(result);
        else this.dispatch(event.startsWith('room:') ? 'room:error' : 'game:error', result.error ?? 'Action failed.');
        if (roomId && result.ok) this.subscribe(roomId);
        ack?.(result);
      })
      .catch(() => {
        const result = { ok: false, error: 'Không thể kết nối Vercel API.' } satisfies ApiResponse;
        this.dispatch('room:error', result.error);
        ack?.(result);
      });
    return this;
  }
}
