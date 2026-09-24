import { describe, expect, it } from 'vitest';
import { RoomManager } from '../server/rooms/RoomManager';

describe('RoomManager', () => {
  it.each([2, 3, 4] as const)('requires exactly %i connected players to start', (mode) => {
    const rooms = new RoomManager();
    const { room, player } = rooms.create('Host', `host-${'x'.repeat(30)}`, 'socket-0');
    rooms.setMode(room, player.id, mode);
    expect(() => rooms.start(room, player.id)).toThrow();
    for (let index = 1; index < mode; index++) rooms.join(room.id, `P${index}`, `session-${index}-${'y'.repeat(24)}`, `socket-${index}`);
    expect(() => rooms.start(room, player.id, () => 0.5)).not.toThrow();
    expect(room.game?.players).toHaveLength(mode);
  });

  it('restores the same player on reconnect', () => {
    const rooms = new RoomManager(); const { room, player } = rooms.create('Host', `host-${'x'.repeat(30)}`, 'old-socket');
    rooms.disconnect('old-socket');
    const result = rooms.join(room.id, 'Ignored Rename', player.sessionId, 'new-socket');
    expect(result.reconnected).toBe(true);
    expect(result.player.id).toBe(player.id);
    expect(result.player.socketId).toBe('new-socket');
  });

  it('rejects the fifth player', () => {
    const rooms = new RoomManager(); const { room } = rooms.create('P0', `s0-${'x'.repeat(30)}`, 's0');
    for (let index = 1; index < 4; index++) rooms.join(room.id, `P${index}`, `s${index}-${'x'.repeat(30)}`, `s${index}`);
    expect(() => rooms.join(room.id, 'P4', `s4-${'x'.repeat(30)}`, 's4')).toThrow(/đầy/);
  });
});
