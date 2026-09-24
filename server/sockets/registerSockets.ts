import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/types/events';
import { TOKEN_TYPES, type SocketAck } from '../../shared/types/game';
import { buyCard, chooseNoble, GameRuleError, reserveCard, returnTokens, takeTokens } from '../game/engine';
import { buildPlayerView } from '../game/playerView';
import { RoomError, RoomManager } from '../rooms/RoomManager';

type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
const roomIdSchema = z.string().trim().min(6).max(12).transform((value) => value.toUpperCase());
const identitySchema = z.object({ nickname: z.string().min(1).max(80), sessionId: z.string().min(24).max(128) });

function message(error: unknown): string {
  if (error instanceof RoomError || error instanceof GameRuleError || error instanceof z.ZodError) return error instanceof z.ZodError ? 'Dữ liệu gửi lên không hợp lệ.' : error.message;
  console.error(error);
  return 'Đã có lỗi máy chủ.';
}

export function registerSockets(io: GameServer, rooms: RoomManager): void {
  const broadcast = (roomId: string): void => {
    const room = rooms.rooms.get(roomId);
    if (!room) return;
    io.to(room.id).emit('room:state', rooms.view(room));
    if (room.game) {
      for (const member of room.players) {
        if (member.socketId) io.to(member.socketId).emit('game:state', buildPlayerView(room.game, member.id));
      }
      if (room.game.phase === 'FINISHED' && room.status !== 'FINISHED') {
        room.status = 'FINISHED';
        io.to(room.id).emit('game:ended', room.game.winnerIds);
        io.to(room.id).emit('room:state', rooms.view(room));
      }
    }
  };

  const run = (socket: GameSocket, ack: SocketAck, action: () => void): void => {
    try {
      action();
      ack({ ok: true });
    } catch (error) {
      const text = message(error);
      socket.emit('game:error', text);
      ack({ ok: false, error: text });
    }
  };

  io.on('connection', (socket) => {
    socket.on('room:create', (raw, ack) => {
      try {
        const payload = identitySchema.parse(raw);
        const { room, player } = rooms.create(payload.nickname, payload.sessionId, socket.id);
        socket.join(room.id);
        ack({ ok: true, data: { room: rooms.view(room), playerId: player.id } });
        broadcast(room.id);
      } catch (error) {
        ack({ ok: false, error: message(error) });
      }
    });

    socket.on('room:join', (raw, ack) => {
      try {
        const payload = identitySchema.extend({ roomId: roomIdSchema }).parse(raw);
        const result = rooms.join(payload.roomId, payload.nickname, payload.sessionId, socket.id);
        socket.join(result.room.id);
        ack({ ok: true, data: { room: rooms.view(result.room), playerId: result.player.id } });
        socket.to(result.room.id).emit(result.reconnected ? 'player:reconnected' : 'player:joined', result.player.name);
        broadcast(result.room.id);
      } catch (error) {
        ack({ ok: false, error: message(error) });
      }
    });

    socket.on('room:setMode', (raw, ack) => run(socket, ack, () => {
      const payload = z.object({ roomId: roomIdSchema, mode: z.union([z.literal(2), z.literal(3), z.literal(4)]) }).parse(raw);
      const { room, player } = rooms.requirePlayer(payload.roomId, socket.id);
      rooms.setMode(room, player.id, payload.mode);
      broadcast(room.id);
    }));

    socket.on('game:start', (raw, ack) => run(socket, ack, () => {
      const payload = z.object({ roomId: roomIdSchema }).parse(raw);
      const { room, player } = rooms.requirePlayer(payload.roomId, socket.id);
      rooms.start(room, player.id);
      io.to(room.id).emit('game:started');
      broadcast(room.id);
    }));

    socket.on('game:takeTokens', (raw, ack) => run(socket, ack, () => {
      const payload = z.object({ roomId: roomIdSchema, colors: z.array(z.enum(TOKEN_TYPES)).min(2).max(3) }).parse(raw);
      const { room, player } = rooms.requirePlayer(payload.roomId, socket.id);
      if (!room.game) throw new RoomError('Game chưa bắt đầu.');
      takeTokens(room.game, player.id, payload.colors);
      broadcast(room.id);
    }));

    socket.on('game:returnTokens', (raw, ack) => run(socket, ack, () => {
      const tokenShape = Object.fromEntries(TOKEN_TYPES.map((type) => [type, z.number().int().min(0).optional()]));
      const payload = z.object({ roomId: roomIdSchema, tokens: z.object(tokenShape) }).parse(raw);
      const { room, player } = rooms.requirePlayer(payload.roomId, socket.id);
      if (!room.game) throw new RoomError('Game chưa bắt đầu.');
      returnTokens(room.game, player.id, payload.tokens);
      broadcast(room.id);
    }));

    socket.on('game:buyCard', (raw, ack) => run(socket, ack, () => {
      const payload = z.object({ roomId: roomIdSchema, cardId: z.string().max(20) }).parse(raw);
      const { room, player } = rooms.requirePlayer(payload.roomId, socket.id);
      if (!room.game) throw new RoomError('Game chưa bắt đầu.');
      buyCard(room.game, player.id, payload.cardId);
      broadcast(room.id);
    }));

    socket.on('game:reserveCard', (raw, ack) => run(socket, ack, () => {
      const payload = z.object({ roomId: roomIdSchema, cardId: z.string().max(20).optional(), tier: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional() }).parse(raw);
      const { room, player } = rooms.requirePlayer(payload.roomId, socket.id);
      if (!room.game) throw new RoomError('Game chưa bắt đầu.');
      reserveCard(room.game, player.id, payload);
      broadcast(room.id);
    }));

    socket.on('game:chooseNoble', (raw, ack) => run(socket, ack, () => {
      const payload = z.object({ roomId: roomIdSchema, nobleId: z.string().max(20) }).parse(raw);
      const { room, player } = rooms.requirePlayer(payload.roomId, socket.id);
      if (!room.game) throw new RoomError('Game chưa bắt đầu.');
      chooseNoble(room.game, player.id, payload.nobleId);
      broadcast(room.id);
    }));

    socket.on('game:playAgain', (raw, ack) => run(socket, ack, () => {
      const payload = z.object({ roomId: roomIdSchema }).parse(raw);
      const { room, player } = rooms.requirePlayer(payload.roomId, socket.id);
      rooms.resetToLobby(room, player.id);
      broadcast(room.id);
    }));

    socket.on('room:leave', (raw, ack) => run(socket, ack, () => {
      const payload = z.object({ roomId: roomIdSchema }).parse(raw);
      const { room, player } = rooms.requirePlayer(payload.roomId, socket.id);
      rooms.leave(room, player.id);
      socket.leave(room.id);
      broadcast(room.id);
    }));

    socket.on('disconnect', () => {
      const found = rooms.disconnect(socket.id);
      if (found) {
        socket.to(found.room.id).emit('player:disconnected', found.player.name);
        broadcast(found.room.id);
      }
    });
  });
}
