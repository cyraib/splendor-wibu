import type { PlayerGameView, RoomMode, RoomView, SocketAck, Tier, TokenType } from './game';

export interface ClientToServerEvents {
  'room:create': (payload: { nickname: string; sessionId: string }, ack: SocketAck<{ room: RoomView; playerId: string }>) => void;
  'room:join': (payload: { roomId: string; nickname: string; sessionId: string }, ack: SocketAck<{ room: RoomView; playerId: string }>) => void;
  'room:leave': (payload: { roomId: string }, ack: SocketAck) => void;
  'room:setMode': (payload: { roomId: string; mode: RoomMode }, ack: SocketAck) => void;
  'game:start': (payload: { roomId: string }, ack: SocketAck) => void;
  'game:takeTokens': (payload: { roomId: string; colors: TokenType[] }, ack: SocketAck) => void;
  'game:returnTokens': (payload: { roomId: string; tokens: Partial<Record<TokenType, number>> }, ack: SocketAck) => void;
  'game:buyCard': (payload: { roomId: string; cardId: string }, ack: SocketAck) => void;
  'game:reserveCard': (payload: { roomId: string; cardId?: string; tier?: Tier }, ack: SocketAck) => void;
  'game:chooseNoble': (payload: { roomId: string; nobleId: string }, ack: SocketAck) => void;
  'game:playAgain': (payload: { roomId: string }, ack: SocketAck) => void;
}

export interface ServerToClientEvents {
  'room:state': (room: RoomView) => void;
  'room:error': (message: string) => void;
  'game:state': (game: PlayerGameView) => void;
  'game:error': (message: string) => void;
  'game:started': () => void;
  'game:ended': (winnerIds: string[]) => void;
  'player:joined': (name: string) => void;
  'player:left': (name: string) => void;
  'player:disconnected': (name: string) => void;
  'player:reconnected': (name: string) => void;
}
