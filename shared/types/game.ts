export const NORMAL_RESOURCES = ['quartz', 'diamond', 'emerald', 'gold', 'netherite'] as const;
export const TOKEN_TYPES = [...NORMAL_RESOURCES, 'joker'] as const;

export type ResourceColor = (typeof NORMAL_RESOURCES)[number];
export type TokenType = (typeof TOKEN_TYPES)[number];
export type Tier = 1 | 2 | 3;
export type ResourceSet = Record<ResourceColor, number>;
export type TokenSet = Record<TokenType, number>;

export interface DevelopmentCard {
  id: string;
  type: 'development';
  tier: Tier;
  name: string;
  image: string;
  points: number;
  bonus: ResourceColor;
  cost: ResourceSet;
}

export interface Noble {
  id: string;
  type: 'noble';
  name: string;
  image: string;
  points: number;
  requirement: ResourceSet;
}

export type GamePhase =
  | 'PLAYING'
  | 'AWAITING_TOKEN_RETURN'
  | 'AWAITING_NOBLE_SELECTION'
  | 'ROUND_ENDING'
  | 'FINISHED';

export interface ReservedCard {
  cardId: string;
  hidden: boolean;
}

export interface PlayerState {
  id: string;
  sessionId: string;
  name: string;
  seat: number;
  connected: boolean;
  tokens: TokenSet;
  bonuses: ResourceSet;
  purchasedCardIds: string[];
  reservedCards: ReservedCard[];
  nobleIds: string[];
  prestige: number;
}

export interface GameState {
  roomId: string;
  phase: GamePhase;
  players: PlayerState[];
  playerCount: 2 | 3 | 4;
  bank: TokenSet;
  decks: Record<Tier, string[]>;
  faceUp: Record<Tier, string[]>;
  nobleIds: string[];
  currentPlayerIndex: number;
  startingPlayerId: string;
  round: number;
  pendingPlayerId?: string;
  pendingReturnCount?: number;
  eligibleNobleIds?: string[];
  endTriggered: boolean;
  endTriggeredBy?: string;
  winnerIds: string[];
}

export interface PublicPlayerState {
  id: string;
  name: string;
  seat: number;
  connected: boolean;
  tokens: TokenSet;
  bonuses: ResourceSet;
  purchasedCardIds: string[];
  reservedCount: number;
  nobleIds: string[];
  prestige: number;
}

export interface PrivatePlayerState extends PublicPlayerState {
  reservedCards: ReservedCard[];
}

export interface PlayerGameView {
  roomId: string;
  phase: GamePhase;
  playerCount: 2 | 3 | 4;
  bank: TokenSet;
  decksRemaining: Record<Tier, number>;
  faceUp: Record<Tier, string[]>;
  nobleIds: string[];
  players: PublicPlayerState[];
  me: PrivatePlayerState;
  currentPlayerId: string;
  startingPlayerId: string;
  round: number;
  pendingReturnCount?: number;
  eligibleNobleIds?: string[];
  endTriggered: boolean;
  winnerIds: string[];
}

export type RoomMode = 2 | 3 | 4;

export interface RoomPlayerView {
  id: string;
  name: string;
  connected: boolean;
  isHost: boolean;
}

export interface RoomView {
  id: string;
  hostPlayerId: string;
  mode: RoomMode;
  status: 'LOBBY' | 'PLAYING' | 'FINISHED';
  players: RoomPlayerView[];
  createdAt: number;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export type SocketAck<T = undefined> = (response: ActionResult & { data?: T }) => void;
