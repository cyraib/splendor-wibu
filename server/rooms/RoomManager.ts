import { randomBytes, randomUUID } from 'node:crypto';
import type { GameState, RoomMode, RoomView } from '../../shared/types/game';
import { createGame } from '../game/engine';

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const DEFAULT_ROOM_TTL_MS = 6 * 60 * 60 * 1000;

export interface RoomMember {
  id: string;
  sessionId: string;
  name: string;
  connected: boolean;
  socketId?: string;
}

export interface Room {
  id: string;
  hostPlayerId: string;
  mode: RoomMode;
  status: 'LOBBY' | 'PLAYING' | 'FINISHED';
  players: RoomMember[];
  game?: GameState;
  createdAt: number;
  lastActivityAt: number;
}

export class RoomError extends Error {}

export function sanitizeNickname(value: string): string {
  return value.trim().replace(/[<>"'`&\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').slice(0, 24);
}

export class RoomManager {
  readonly rooms = new Map<string, Room>();

  private roomCode(): string {
    for (;;) {
      const bytes = randomBytes(6);
      const code = [...bytes].map((byte) => ROOM_ALPHABET[byte % ROOM_ALPHABET.length]).join('');
      if (!this.rooms.has(code)) return code;
    }
  }

  create(nickname: string, sessionId: string, socketId: string): { room: Room; player: RoomMember } {
    const name = sanitizeNickname(nickname);
    if (!name) throw new RoomError('Nickname không được để trống.');
    const player: RoomMember = { id: randomUUID(), sessionId, name, connected: true, socketId };
    const now = Date.now();
    const room: Room = { id: this.roomCode(), hostPlayerId: player.id, mode: 2, status: 'LOBBY', players: [player], createdAt: now, lastActivityAt: now };
    this.rooms.set(room.id, room);
    return { room, player };
  }

  join(roomIdInput: string, nickname: string, sessionId: string, socketId: string): { room: Room; player: RoomMember; reconnected: boolean } {
    const roomId = roomIdInput.trim().toUpperCase();
    const room = this.rooms.get(roomId);
    if (!room) throw new RoomError('Không tìm thấy phòng.');
    const existing = room.players.find((player) => player.sessionId === sessionId);
    if (existing) {
      existing.connected = true;
      existing.socketId = socketId;
      if (room.game) {
        const gamePlayer = room.game.players.find((player) => player.id === existing.id);
        if (gamePlayer) gamePlayer.connected = true;
      }
      room.lastActivityAt = Date.now();
      return { room, player: existing, reconnected: true };
    }
    if (room.status !== 'LOBBY') throw new RoomError('Game đã bắt đầu.');
    if (room.players.length >= 4) throw new RoomError('Phòng đã đầy.');
    const name = sanitizeNickname(nickname);
    if (!name) throw new RoomError('Nickname không được để trống.');
    const player: RoomMember = { id: randomUUID(), sessionId, name, connected: true, socketId };
    room.players.push(player);
    room.lastActivityAt = Date.now();
    return { room, player, reconnected: false };
  }

  findBySocket(socketId: string): { room: Room; player: RoomMember } | undefined {
    for (const room of this.rooms.values()) {
      const player = room.players.find((candidate) => candidate.socketId === socketId);
      if (player) return { room, player };
    }
    return undefined;
  }

  requirePlayer(roomId: string, socketId: string): { room: Room; player: RoomMember } {
    const room = this.rooms.get(roomId.toUpperCase());
    const player = room?.players.find((candidate) => candidate.socketId === socketId && candidate.connected);
    if (!room || !player) throw new RoomError('Phiên người chơi không hợp lệ.');
    room.lastActivityAt = Date.now();
    return { room, player };
  }

  setMode(room: Room, playerId: string, mode: RoomMode): void {
    if (room.status !== 'LOBBY') throw new RoomError('Không thể đổi mode khi game đang chạy.');
    if (room.hostPlayerId !== playerId) throw new RoomError('Chỉ host được đổi mode.');
    room.mode = mode;
  }

  start(room: Room, playerId: string, random = Math.random): GameState {
    if (room.hostPlayerId !== playerId) throw new RoomError('Chỉ host được bắt đầu game.');
    if (room.status !== 'LOBBY') throw new RoomError('Game đã bắt đầu.');
    if (room.players.length !== room.mode) throw new RoomError(`Cần đúng ${room.mode} người để bắt đầu.`);
    if (room.players.some((member) => !member.connected)) throw new RoomError('Tất cả người chơi phải đang kết nối.');
    room.game = createGame(room.id, room.players, room.mode, random);
    room.status = 'PLAYING';
    return room.game;
  }

  resetToLobby(room: Room, playerId: string): void {
    if (room.status !== 'FINISHED') throw new RoomError('Game chưa kết thúc.');
    if (room.hostPlayerId !== playerId) throw new RoomError('Chỉ host được chọn chơi lại.');
    room.game = undefined;
    room.status = 'LOBBY';
  }

  disconnect(socketId: string): { room: Room; player: RoomMember } | undefined {
    const found = this.findBySocket(socketId);
    if (!found) return undefined;
    const { room, player } = found;
    player.connected = false;
    player.socketId = undefined;
    if (room.game) {
      const gamePlayer = room.game.players.find((candidate) => candidate.id === player.id);
      if (gamePlayer) gamePlayer.connected = false;
    }
    if (room.hostPlayerId === player.id) {
      const nextHost = room.players.find((candidate) => candidate.connected);
      if (nextHost) room.hostPlayerId = nextHost.id;
    }
    room.lastActivityAt = Date.now();
    return found;
  }

  leave(room: Room, playerId: string): void {
    if (room.status !== 'LOBBY') throw new RoomError('Không thể rời hẳn khi game đang chạy; bạn có thể reconnect.');
    room.players = room.players.filter((player) => player.id !== playerId);
    if (!room.players.length) this.rooms.delete(room.id);
    else if (room.hostPlayerId === playerId) room.hostPlayerId = room.players[0].id;
  }

  cleanup(ttlMs = DEFAULT_ROOM_TTL_MS, now = Date.now()): number {
    let removed = 0;
    for (const [id, room] of this.rooms) {
      if (now - room.lastActivityAt > ttlMs) {
        this.rooms.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  view(room: Room): RoomView {
    return {
      id: room.id,
      hostPlayerId: room.hostPlayerId,
      mode: room.mode,
      status: room.status,
      players: room.players.map((player) => ({ id: player.id, name: player.name, connected: player.connected, isHost: player.id === room.hostPlayerId })),
      createdAt: room.createdAt
    };
  }
}
