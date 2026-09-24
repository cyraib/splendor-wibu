import type { RoomMode, TokenSet } from '../../shared/types/game';

export const MARKET_SIZE = 4;
export const MAX_TOKENS = 10;
export const MAX_RESERVED_CARDS = 3;
export const WINNING_PRESTIGE = 15;

export function getGameSetupForPlayerCount(playerCount: RoomMode): {
  playerCount: RoomMode;
  tokenSupply: TokenSet;
  nobleCount: number;
  otherSettings: { marketSize: number; maxTokens: number; maxReservedCards: number };
} {
  const normalSupply = playerCount === 2 ? 4 : playerCount === 3 ? 5 : 7;
  return {
    playerCount,
    tokenSupply: {
      quartz: normalSupply,
      diamond: normalSupply,
      emerald: normalSupply,
      gold: normalSupply,
      netherite: normalSupply,
      joker: 5
    },
    nobleCount: playerCount + 1,
    otherSettings: { marketSize: MARKET_SIZE, maxTokens: MAX_TOKENS, maxReservedCards: MAX_RESERVED_CARDS }
  };
}
