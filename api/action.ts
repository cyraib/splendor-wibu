import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import type { Room } from '../server/rooms/RoomManager';
import { RoomError, RoomManager } from '../server/rooms/RoomManager';
import { buyCard, chooseNoble, GameRuleError, reserveCard, returnTokens, takeTokens } from '../server/game/engine';
import { buildPlayerView } from '../server/game/playerView';
import { TOKEN_TYPES, type RoomMode, type Tier, type TokenType } from '../shared/types/game';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) console.warn('SUPABASE_URL or SUPABASE_SECRET_KEY is missing.');
const supabase = createClient(url ?? 'http://127.0.0.1:54321', serviceKey ?? 'missing', { auth: { persistSession: false } });

type StoredRoom = { id: string; state: Room; version: number; status: Room['status'] };
type ApiBody = { event?: string; payload?: Record<string, unknown> };

function fail(response: VercelResponse, status: number, error: string) {
  return response.status(status).json({ ok: false, error });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RoomError(message);
}

async function loadRoom(roomId: string): Promise<StoredRoom> {
  const { data, error } = await supabase.from('game_rooms').select('id,state,version,status').eq('id', roomId).maybeSingle();
  if (error) throw error;
  if (!data) throw new RoomError('Không tìm thấy phòng.');
  return data as StoredRoom;
}

async function saveRoom(stored: StoredRoom): Promise<boolean> {
  const { data, error } = await supabase.rpc('cas_game_room', {
    p_room_id: stored.id,
    p_expected_version: stored.version,
    p_state: stored.state,
    p_status: stored.state.status
  });
  if (error) throw error;
  return data === true;
}

function views(room: Room, sessionId: string) {
  const manager = new RoomManager();
  const player = room.players.find((candidate) => candidate.sessionId === sessionId);
  if (!player) throw new RoomError('Phiên người chơi không hợp lệ.');
  return { room: manager.view(room), game: room.game ? buildPlayerView(room.game, player.id) : undefined, playerId: player.id };
}

async function mutate(roomId: string, sessionId: string, operation: (room: Room, manager: RoomManager, playerId: string) => void) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const stored = await loadRoom(roomId);
    const manager = new RoomManager();
    manager.rooms.set(roomId, stored.state);
    const member = stored.state.players.find((candidate) => candidate.sessionId === sessionId);
    if (!member) throw new RoomError('Phiên người chơi không hợp lệ.');
    member.connected = true;
    member.socketId = sessionId;
    const gamePlayer = stored.state.game?.players.find((candidate) => candidate.id === member.id);
    if (gamePlayer) gamePlayer.connected = true;
    operation(stored.state, manager, member.id);
    if (stored.state.game?.phase === 'FINISHED') stored.state.status = 'FINISHED';
    if (await saveRoom(stored)) return views(stored.state, sessionId);
  }
  throw new RoomError('Room vừa được cập nhật bởi người khác. Hãy thử lại.');
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'POST') return fail(response, 405, 'Method not allowed.');
  if (!url || !serviceKey) return fail(response, 503, 'Supabase chưa được cấu hình.');
  const { event, payload = {} } = (request.body ?? {}) as ApiBody;
  const sessionId = String(payload.sessionId ?? '');
  if (sessionId.length < 24 || sessionId.length > 128) return fail(response, 400, 'Session không hợp lệ.');

  try {
    if (event === 'room:create') {
      const manager = new RoomManager();
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const { room } = manager.create(String(payload.nickname ?? ''), sessionId, sessionId);
        const { error } = await supabase.from('game_rooms').insert({ id: room.id, state: room, status: room.status });
        if (!error) {
          const result = views(room, sessionId);
          return response.json({ ok: true, data: { room: result.room, playerId: result.playerId }, ...result });
        }
        if (error.code !== '23505') throw error;
      }
      throw new RoomError('Không thể tạo mã phòng.');
    }

    const roomId = String(payload.roomId ?? '').trim().toUpperCase();
    if (!/^[A-Z2-9]{6}$/.test(roomId)) throw new RoomError('Room Code không hợp lệ.');

    if (event === 'room:join') {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const stored = await loadRoom(roomId);
        const manager = new RoomManager();
        manager.rooms.set(roomId, stored.state);
        manager.join(roomId, String(payload.nickname ?? ''), sessionId, sessionId);
        if (await saveRoom(stored)) {
          const result = views(stored.state, sessionId);
          return response.json({ ok: true, data: { room: result.room, playerId: result.playerId }, ...result });
        }
      }
      throw new RoomError('Room vừa thay đổi. Hãy thử lại.');
    }

    if (event === 'room:sync') {
      const stored = await loadRoom(roomId);
      return response.json({ ok: true, ...views(stored.state, sessionId) });
    }

    const result = await mutate(roomId, sessionId, (room, manager, playerId) => {
      if (event === 'room:setMode') {
        const mode = Number(payload.mode);
        assert([2, 3, 4].includes(mode), 'Game mode không hợp lệ.');
        manager.setMode(room, playerId, mode as RoomMode);
      }
      else if (event === 'game:start') manager.start(room, playerId);
      else if (event === 'game:takeTokens') {
        if (!room.game) throw new RoomError('Game chưa bắt đầu.');
        assert(Array.isArray(payload.colors) && payload.colors.length >= 2 && payload.colors.length <= 3, 'Token selection không hợp lệ.');
        assert(payload.colors.every((color) => TOKEN_TYPES.includes(color as TokenType)), 'Resource không hợp lệ.');
        takeTokens(room.game, playerId, payload.colors as TokenType[]);
      } else if (event === 'game:returnTokens') {
        if (!room.game) throw new RoomError('Game chưa bắt đầu.');
        assert(payload.tokens && typeof payload.tokens === 'object', 'Token trả lại không hợp lệ.');
        returnTokens(room.game, playerId, payload.tokens as Partial<Record<TokenType, number>>);
      } else if (event === 'game:buyCard') {
        if (!room.game) throw new RoomError('Game chưa bắt đầu.');
        buyCard(room.game, playerId, String(payload.cardId ?? ''));
      } else if (event === 'game:reserveCard') {
        if (!room.game) throw new RoomError('Game chưa bắt đầu.');
        assert(!payload.tier || [1, 2, 3].includes(Number(payload.tier)), 'Tier không hợp lệ.');
        reserveCard(room.game, playerId, { cardId: payload.cardId ? String(payload.cardId) : undefined, tier: payload.tier as Tier | undefined });
      } else if (event === 'game:chooseNoble') {
        if (!room.game) throw new RoomError('Game chưa bắt đầu.');
        chooseNoble(room.game, playerId, String(payload.nobleId ?? ''));
      } else if (event === 'game:playAgain') manager.resetToLobby(room, playerId);
      else if (event === 'room:leave') manager.leave(room, playerId);
      else throw new RoomError('Event không được hỗ trợ.');
    });
    return response.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof RoomError || error instanceof GameRuleError) return fail(response, 400, error.message);
    console.error(error);
    return fail(response, 500, 'Lỗi máy chủ.');
  }
}
