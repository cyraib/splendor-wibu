import type { GameState, PlayerGameView, PublicPlayerState } from '../../shared/types/game';

export function buildPlayerView(game: GameState, playerId: string): PlayerGameView {
  const self = game.players.find((player) => player.id === playerId);
  if (!self) throw new Error('Player does not belong to this game.');
  const players: PublicPlayerState[] = game.players.map((player) => ({
    id: player.id,
    name: player.name,
    seat: player.seat,
    connected: player.connected,
    tokens: { ...player.tokens },
    bonuses: { ...player.bonuses },
    purchasedCardIds: [...player.purchasedCardIds],
    reservedCount: player.reservedCards.length,
    nobleIds: [...player.nobleIds],
    prestige: player.prestige
  }));
  const publicSelf = players.find((player) => player.id === playerId)!;
  return {
    roomId: game.roomId,
    phase: game.phase,
    playerCount: game.playerCount,
    bank: { ...game.bank },
    decksRemaining: { 1: game.decks[1].length, 2: game.decks[2].length, 3: game.decks[3].length },
    faceUp: { 1: [...game.faceUp[1]], 2: [...game.faceUp[2]], 3: [...game.faceUp[3]] },
    nobleIds: [...game.nobleIds],
    players,
    me: { ...publicSelf, reservedCards: self.reservedCards.map((card) => ({ ...card })) },
    currentPlayerId: game.players[game.currentPlayerIndex].id,
    startingPlayerId: game.startingPlayerId,
    round: game.round,
    pendingReturnCount: game.pendingPlayerId === playerId ? game.pendingReturnCount : undefined,
    eligibleNobleIds: game.pendingPlayerId === playerId ? game.eligibleNobleIds : undefined,
    endTriggered: game.endTriggered,
    winnerIds: [...game.winnerIds]
  };
}
