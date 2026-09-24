import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { createAppServer } from '../server/src/app';

type AnySocket = Socket<Record<string, (...args: any[]) => void>, Record<string, (...args: any[]) => void>>;
const openSockets: AnySocket[] = [];
const servers: ReturnType<typeof createAppServer>[] = [];

function once<T>(socket: AnySocket, event: string, predicate: (value: T) => boolean = () => true): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(event, handler); reject(new Error(`Timed out waiting for ${event}`)); }, 4000);
    const handler = (value: T) => {
      if (!predicate(value)) return;
      clearTimeout(timer); socket.off(event, handler); resolve(value);
    };
    socket.on(event, handler);
  });
}

function ack(socket: AnySocket, event: string, payload: object): Promise<any> {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

async function client(url: string): Promise<AnySocket> {
  const socket = connect(url, { transports: ['websocket'], forceNew: true }) as AnySocket;
  openSockets.push(socket);
  if (!socket.connected) await once(socket, 'connect');
  return socket;
}

afterEach(async () => {
  openSockets.splice(0).forEach((socket) => socket.close());
  await Promise.all(servers.splice(0).map(({ httpServer }) => new Promise<void>((resolve) => httpServer.close(() => resolve()))));
});

describe('realtime multiplayer', () => {
  it('creates a 3-player game, broadcasts action, reconnects, and protects hidden reserve', async () => {
    const server = createAppServer(); servers.push(server);
    await new Promise<void>((resolve) => server.httpServer.listen(0, '127.0.0.1', resolve));
    const port = (server.httpServer.address() as AddressInfo).port;
    const url = `http://127.0.0.1:${port}`;
    const [a, b, c] = await Promise.all([client(url), client(url), client(url)]);
    const sessions = ['a'.repeat(30), 'b'.repeat(30), 'c'.repeat(30)];
    const created = await ack(a, 'room:create', { nickname: 'A', sessionId: sessions[0] });
    expect(created.ok).toBe(true);
    const roomId = created.data.room.id;
    const ids: Record<string, string> = { A: created.data.playerId };
    expect((await ack(a, 'room:setMode', { roomId, mode: 3 })).ok).toBe(true);
    ids.B = (await ack(b, 'room:join', { roomId, nickname: 'B', sessionId: sessions[1] })).data.playerId;
    ids.C = (await ack(c, 'room:join', { roomId, nickname: 'C', sessionId: sessions[2] })).data.playerId;

    const startedStates = [once<any>(a, 'game:state'), once<any>(b, 'game:state'), once<any>(c, 'game:state')];
    expect((await ack(a, 'game:start', { roomId })).ok).toBe(true);
    const states = await Promise.all(startedStates);
    expect(states.every((state) => state.players.length === 3)).toBe(true);
    const currentId = states[0].currentPlayerId;
    const currentName = Object.entries(ids).find(([, id]) => id === currentId)![0];
    const sockets: Record<string, AnySocket> = { A: a, B: b, C: c };
    const actor = sockets[currentName];
    const observers = Object.entries(sockets).filter(([name]) => name !== currentName).map(([, socket]) => socket);

    const actorUpdate = once<any>(actor, 'game:state', (state) => state.me.reservedCount === 1);
    const observerUpdates = observers.map((socket) => once<any>(socket, 'game:state', (state) => state.players.find((p: any) => p.id === currentId)?.reservedCount === 1));
    expect((await ack(actor, 'game:reserveCard', { roomId, tier: 1 })).ok).toBe(true);
    const ownerState = await actorUpdate;
    const hiddenId = ownerState.me.reservedCards[0].cardId;
    const publicStates = await Promise.all(observerUpdates);
    expect(hiddenId).toMatch(/^T1-/);
    for (const state of publicStates) expect(JSON.stringify(state.players)).not.toContain(hiddenId);

    a.close();
    const refreshed = await client(url);
    const reconnect = await ack(refreshed, 'room:join', { roomId, nickname: 'A', sessionId: sessions[0] });
    expect(reconnect.ok).toBe(true);
    expect(reconnect.data.playerId).toBe(ids.A);
    const room = server.rooms.rooms.get(roomId)!;
    expect(room.players).toHaveLength(3);
    expect(room.players.find((player) => player.id === ids.A)?.connected).toBe(true);
  }, 12_000);
});
