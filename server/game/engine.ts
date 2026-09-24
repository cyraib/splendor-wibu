import { cards, cardsById, nobles, noblesById } from '../../shared/data';
import {
  NORMAL_RESOURCES,
  TOKEN_TYPES,
  type DevelopmentCard,
  type GameState,
  type Noble,
  type PlayerState,
  type ResourceSet,
  type RoomMode,
  type Tier,
  type TokenSet,
  type TokenType
} from '../../shared/types/game';
import { getGameSetupForPlayerCount, MARKET_SIZE, MAX_RESERVED_CARDS, MAX_TOKENS, WINNING_PRESTIGE } from './rules';

export class GameRuleError extends Error {}

export interface GameParticipant {
  id: string;
  sessionId: string;
  name: string;
  connected: boolean;
}

const emptyResources = (): ResourceSet => ({ quartz: 0, diamond: 0, emerald: 0, gold: 0, netherite: 0 });
const emptyTokens = (): TokenSet => ({ ...emptyResources(), joker: 0 });

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function createGame(roomId: string, participants: GameParticipant[], mode: RoomMode, random = Math.random): GameState {
  if (participants.length !== mode) throw new GameRuleError(`Cần đúng ${mode} người để bắt đầu.`);
  const ordered = shuffle(participants, random);
  const setup = getGameSetupForPlayerCount(mode);
  const decks = { 1: [] as string[], 2: [] as string[], 3: [] as string[] };
  for (const tier of [1, 2, 3] as Tier[]) decks[tier] = shuffle(cards.filter((card) => card.tier === tier).map((card) => card.id), random);
  const faceUp = { 1: [] as string[], 2: [] as string[], 3: [] as string[] };
  for (const tier of [1, 2, 3] as Tier[]) faceUp[tier] = decks[tier].splice(0, MARKET_SIZE);

  return {
    roomId,
    phase: 'PLAYING',
    playerCount: mode,
    players: ordered.map((participant, seat): PlayerState => ({
      ...participant,
      seat,
      tokens: emptyTokens(),
      bonuses: emptyResources(),
      purchasedCardIds: [],
      reservedCards: [],
      nobleIds: [],
      prestige: 0
    })),
    bank: { ...setup.tokenSupply },
    decks,
    faceUp,
    nobleIds: shuffle(nobles.map((noble) => noble.id), random).slice(0, setup.nobleCount),
    currentPlayerIndex: 0,
    startingPlayerId: ordered[0].id,
    round: 1,
    endTriggered: false,
    winnerIds: []
  };
}

export function totalTokens(tokens: TokenSet): number {
  return TOKEN_TYPES.reduce((sum, color) => sum + tokens[color], 0);
}

function currentPlayer(game: GameState): PlayerState {
  return game.players[game.currentPlayerIndex];
}

function requireTurn(game: GameState, playerId: string): PlayerState {
  if (game.phase !== 'PLAYING') throw new GameRuleError('Game đang chờ hoàn tất bước bắt buộc khác.');
  const player = currentPlayer(game);
  if (player.id !== playerId) throw new GameRuleError('Chưa đến lượt của bạn.');
  return player;
}

export function calculateCardPrice(card: DevelopmentCard, bonuses: ResourceSet): ResourceSet {
  return Object.fromEntries(NORMAL_RESOURCES.map((color) => [color, Math.max(card.cost[color] - bonuses[color], 0)])) as ResourceSet;
}

export function calculatePayment(card: DevelopmentCard, player: PlayerState): TokenSet {
  const price = calculateCardPrice(card, player.bonuses);
  const payment = emptyTokens();
  let jokerNeeded = 0;
  for (const color of NORMAL_RESOURCES) {
    payment[color] = Math.min(player.tokens[color], price[color]);
    jokerNeeded += price[color] - payment[color];
  }
  if (jokerNeeded > player.tokens.joker) throw new GameRuleError('Bạn không đủ tài nguyên để mua thẻ này.');
  payment.joker = jokerNeeded;
  return payment;
}

function eligibleNobles(game: GameState, player: PlayerState): Noble[] {
  return game.nobleIds
    .map((id) => noblesById.get(id))
    .filter((noble): noble is Noble => Boolean(noble))
    .filter((noble) => NORMAL_RESOURCES.every((color) => player.bonuses[color] >= noble.requirement[color]));
}

function awardNoble(game: GameState, player: PlayerState, nobleId: string): void {
  const noble = noblesById.get(nobleId);
  if (!noble || !game.nobleIds.includes(nobleId)) throw new GameRuleError('Quý tộc không hợp lệ.');
  game.nobleIds = game.nobleIds.filter((id) => id !== nobleId);
  player.nobleIds.push(nobleId);
  player.prestige += noble.points;
}

function triggerEndIfNeeded(game: GameState, player: PlayerState): void {
  if (!game.endTriggered && player.prestige >= WINNING_PRESTIGE) {
    game.endTriggered = true;
    game.endTriggeredBy = player.id;
    game.phase = 'ROUND_ENDING';
  }
}

function finishGame(game: GameState): void {
  game.phase = 'FINISHED';
  const ranked = [...game.players].sort((a, b) => b.prestige - a.prestige || a.purchasedCardIds.length - b.purchasedCardIds.length);
  const best = ranked[0];
  game.winnerIds = ranked
    .filter((player) => player.prestige === best.prestige && player.purchasedCardIds.length === best.purchasedCardIds.length)
    .map((player) => player.id);
}

export function endTurn(game: GameState): void {
  const wasLast = game.currentPlayerIndex === game.players.length - 1;
  if (wasLast && game.endTriggered) return finishGame(game);
  game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
  if (wasLast) game.round += 1;
  game.phase = game.endTriggered ? 'ROUND_ENDING' : 'PLAYING';
  // ROUND_ENDING still accepts ordinary actions until the round wraps.
  if (game.phase === 'ROUND_ENDING') game.phase = 'PLAYING';
}

function resolveNobleAndEndTurn(game: GameState, player: PlayerState): void {
  const eligible = eligibleNobles(game, player);
  if (eligible.length === 1) awardNoble(game, player, eligible[0].id);
  if (eligible.length > 1) {
    game.phase = 'AWAITING_NOBLE_SELECTION';
    game.pendingPlayerId = player.id;
    game.eligibleNobleIds = eligible.map((noble) => noble.id);
    return;
  }
  triggerEndIfNeeded(game, player);
  endTurn(game);
}

function settleAction(game: GameState, player: PlayerState): void {
  const excess = totalTokens(player.tokens) - MAX_TOKENS;
  if (excess > 0) {
    game.phase = 'AWAITING_TOKEN_RETURN';
    game.pendingPlayerId = player.id;
    game.pendingReturnCount = excess;
    return;
  }
  resolveNobleAndEndTurn(game, player);
}

export function takeTokens(game: GameState, playerId: string, colors: TokenType[]): void {
  const player = requireTurn(game, playerId);
  if (colors.some((color) => color === 'joker')) throw new GameRuleError('Không thể lấy Joker bằng hành động lấy đá.');
  const counts = new Map<TokenType, number>();
  colors.forEach((color) => counts.set(color, (counts.get(color) ?? 0) + 1));
  const isThreeDifferent = colors.length === 3 && counts.size === 3;
  const isTwoSame = colors.length === 2 && counts.size === 1;
  if (!isThreeDifferent && !isTwoSame) throw new GameRuleError('Chọn 3 màu khác nhau hoặc 2 token cùng màu.');
  if (isTwoSame && game.bank[colors[0]] < 4) throw new GameRuleError('Ngân hàng phải có ít nhất 4 token màu đó trước khi lấy.');
  for (const [color, count] of counts) if (game.bank[color] < count) throw new GameRuleError(`Ngân hàng không đủ ${color}.`);
  for (const color of colors) {
    game.bank[color] -= 1;
    player.tokens[color] += 1;
  }
  settleAction(game, player);
}

function refill(game: GameState, tier: Tier): void {
  const replacement = game.decks[tier].shift();
  if (replacement) game.faceUp[tier].push(replacement);
}

export function reserveCard(game: GameState, playerId: string, input: { cardId?: string; tier?: Tier }): void {
  const player = requireTurn(game, playerId);
  if (player.reservedCards.length >= MAX_RESERVED_CARDS) throw new GameRuleError('Bạn đã reserve tối đa 3 thẻ.');
  let cardId: string | undefined;
  let hidden = false;
  if (input.cardId) {
    for (const tier of [1, 2, 3] as Tier[]) {
      const index = game.faceUp[tier].indexOf(input.cardId);
      if (index >= 0) {
        cardId = game.faceUp[tier].splice(index, 1)[0];
        refill(game, tier);
        break;
      }
    }
    if (!cardId) throw new GameRuleError('Thẻ mở không tồn tại.');
  } else if (input.tier) {
    cardId = game.decks[input.tier].shift();
    hidden = true;
    if (!cardId) throw new GameRuleError('Deck này đã hết thẻ.');
  } else {
    throw new GameRuleError('Cần chọn thẻ hoặc deck để reserve.');
  }
  player.reservedCards.push({ cardId, hidden });
  if (game.bank.joker > 0) {
    game.bank.joker -= 1;
    player.tokens.joker += 1;
  }
  settleAction(game, player);
}

export function buyCard(game: GameState, playerId: string, cardId: string): void {
  const player = requireTurn(game, playerId);
  const card = cardsById.get(cardId);
  if (!card) throw new GameRuleError('Thẻ không tồn tại.');
  let source: { kind: 'market'; tier: Tier; index: number } | { kind: 'reserved'; index: number } | undefined;
  for (const tier of [1, 2, 3] as Tier[]) {
    const index = game.faceUp[tier].indexOf(cardId);
    if (index >= 0) source = { kind: 'market', tier, index };
  }
  const reservedIndex = player.reservedCards.findIndex((reserved) => reserved.cardId === cardId);
  if (reservedIndex >= 0) source = { kind: 'reserved', index: reservedIndex };
  if (!source) throw new GameRuleError('Bạn không thể mua thẻ này.');
  const payment = calculatePayment(card, player);
  for (const color of TOKEN_TYPES) {
    player.tokens[color] -= payment[color];
    game.bank[color] += payment[color];
  }
  if (source.kind === 'market') {
    game.faceUp[source.tier].splice(source.index, 1);
    refill(game, source.tier);
  } else player.reservedCards.splice(source.index, 1);
  player.purchasedCardIds.push(cardId);
  player.bonuses[card.bonus] += 1;
  player.prestige += card.points;
  settleAction(game, player);
}

export function returnTokens(game: GameState, playerId: string, returned: Partial<Record<TokenType, number>>): void {
  if (game.phase !== 'AWAITING_TOKEN_RETURN' || game.pendingPlayerId !== playerId) throw new GameRuleError('Không ở bước trả token.');
  const player = game.players.find((candidate) => candidate.id === playerId)!;
  const count = TOKEN_TYPES.reduce((sum, color) => sum + (returned[color] ?? 0), 0);
  if (count !== game.pendingReturnCount) throw new GameRuleError(`Bạn phải trả đúng ${game.pendingReturnCount} token.`);
  for (const color of TOKEN_TYPES) {
    const amount = returned[color] ?? 0;
    if (!Number.isInteger(amount) || amount < 0 || amount > player.tokens[color]) throw new GameRuleError('Số token trả không hợp lệ.');
  }
  for (const color of TOKEN_TYPES) {
    const amount = returned[color] ?? 0;
    player.tokens[color] -= amount;
    game.bank[color] += amount;
  }
  delete game.pendingPlayerId;
  delete game.pendingReturnCount;
  game.phase = 'PLAYING';
  resolveNobleAndEndTurn(game, player);
}

export function chooseNoble(game: GameState, playerId: string, nobleId: string): void {
  if (game.phase !== 'AWAITING_NOBLE_SELECTION' || game.pendingPlayerId !== playerId) throw new GameRuleError('Không ở bước chọn Quý tộc.');
  if (!game.eligibleNobleIds?.includes(nobleId)) throw new GameRuleError('Quý tộc này không hợp lệ.');
  const player = game.players.find((candidate) => candidate.id === playerId)!;
  awardNoble(game, player, nobleId);
  delete game.pendingPlayerId;
  delete game.eligibleNobleIds;
  game.phase = 'PLAYING';
  triggerEndIfNeeded(game, player);
  endTurn(game);
}

export function getValidActions(game: GameState, playerId: string): string[] {
  if (game.phase !== 'PLAYING' || currentPlayer(game).id !== playerId) return [];
  return ['takeTokens', 'buyCard', ...(currentPlayer(game).reservedCards.length < MAX_RESERVED_CARDS ? ['reserveCard'] : [])];
}
