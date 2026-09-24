import { describe, expect, it } from 'vitest';
import { cardsById, noblesById } from '../shared/data';
import { NORMAL_RESOURCES, TOKEN_TYPES, type GameState, type RoomMode, type Tier, type TokenType } from '../shared/types/game';
import { buyCard, calculatePayment, chooseNoble, createGame, reserveCard, returnTokens, takeTokens } from '../server/game/engine';
import { getGameSetupForPlayerCount } from '../server/game/rules';

function randomForSeed(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function participants(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    sessionId: `session-${index}-${'x'.repeat(24)}`,
    name: `Bot ${index}`,
    connected: true
  }));
}

function assertInvariants(game: GameState): void {
  const setup = getGameSetupForPlayerCount(game.playerCount);
  for (const token of TOKEN_TYPES) {
    const total = game.bank[token] + game.players.reduce((sum, player) => sum + player.tokens[token], 0);
    expect(total, `${token} conservation`).toBe(setup.tokenSupply[token]);
    expect(game.bank[token]).toBeGreaterThanOrEqual(0);
    game.players.forEach((player) => expect(player.tokens[token]).toBeGreaterThanOrEqual(0));
  }

  const cardLocations = [
    ...([1, 2, 3] as Tier[]).flatMap((tier) => [...game.decks[tier], ...game.faceUp[tier]]),
    ...game.players.flatMap((player) => [...player.purchasedCardIds, ...player.reservedCards.map((card) => card.cardId)])
  ];
  expect(cardLocations).toHaveLength(90);
  expect(new Set(cardLocations).size).toBe(90);

  const nobleLocations = [...game.nobleIds, ...game.players.flatMap((player) => player.nobleIds)];
  expect(nobleLocations).toHaveLength(game.playerCount + 1);
  expect(new Set(nobleLocations).size).toBe(nobleLocations.length);

  for (const player of game.players) {
    const expectedBonuses = Object.fromEntries(NORMAL_RESOURCES.map((color) => [color, 0])) as Record<(typeof NORMAL_RESOURCES)[number], number>;
    let expectedPrestige = 0;
    for (const cardId of player.purchasedCardIds) {
      const card = cardsById.get(cardId)!;
      expectedBonuses[card.bonus] += 1;
      expectedPrestige += card.points;
    }
    for (const nobleId of player.nobleIds) expectedPrestige += noblesById.get(nobleId)!.points;
    expect(player.bonuses).toEqual(expectedBonuses);
    expect(player.prestige).toBe(expectedPrestige);
    expect(player.reservedCards.length).toBeLessThanOrEqual(3);
    if (game.phase !== 'AWAITING_TOKEN_RETURN' || game.pendingPlayerId !== player.id) {
      expect(TOKEN_TYPES.reduce((sum, token) => sum + player.tokens[token], 0)).toBeLessThanOrEqual(10);
    }
  }
}

function affordableCards(game: GameState) {
  const player = game.players[game.currentPlayerIndex];
  const ids = [...([1, 2, 3] as Tier[]).flatMap((tier) => game.faceUp[tier]), ...player.reservedCards.map((card) => card.cardId)];
  return ids.filter((id) => {
    try { calculatePayment(cardsById.get(id)!, player); return true; } catch { return false; }
  });
}

function returnExcess(game: GameState): void {
  const player = game.players.find((candidate) => candidate.id === game.pendingPlayerId)!;
  let remaining = game.pendingReturnCount!;
  const returned: Partial<Record<TokenType, number>> = {};
  for (const token of TOKEN_TYPES) {
    const amount = Math.min(player.tokens[token], remaining);
    returned[token] = amount;
    remaining -= amount;
    if (!remaining) break;
  }
  returnTokens(game, player.id, returned);
}

function playAction(game: GameState, random: () => number): void {
  if (game.phase === 'AWAITING_TOKEN_RETURN') return returnExcess(game);
  if (game.phase === 'AWAITING_NOBLE_SELECTION') return chooseNoble(game, game.pendingPlayerId!, game.eligibleNobleIds![0]);
  const player = game.players[game.currentPlayerIndex];
  const affordable = affordableCards(game);
  if (affordable.length) return buyCard(game, player.id, affordable[Math.floor(random() * affordable.length)]);

  if (player.reservedCards.length < 3 && random() < 0.18) {
    const tiers = ([1, 2, 3] as Tier[]).filter((tier) => game.decks[tier].length > 0);
    if (tiers.length) return reserveCard(game, player.id, { tier: tiers[Math.floor(random() * tiers.length)] });
  }

  const doubleColors = NORMAL_RESOURCES.filter((color) => game.bank[color] >= 4);
  if (doubleColors.length && random() < 0.35) {
    const color = doubleColors[Math.floor(random() * doubleColors.length)];
    return takeTokens(game, player.id, [color, color]);
  }
  const available = NORMAL_RESOURCES.filter((color) => game.bank[color] > 0).sort(() => random() - 0.5);
  if (available.length >= 3) return takeTokens(game, player.id, available.slice(0, 3));

  if (player.reservedCards.length < 3) {
    const open = ([1, 2, 3] as Tier[]).flatMap((tier) => game.faceUp[tier]);
    if (open.length) return reserveCard(game, player.id, { cardId: open[Math.floor(random() * open.length)] });
  }
  if (doubleColors.length) return takeTokens(game, player.id, [doubleColors[0], doubleColors[0]]);
  throw new Error(`Simulation deadlock in round ${game.round}`);
}

function simulate(mode: RoomMode, seed: number): { turns: number; rounds: number; winners: number } {
  const random = randomForSeed(seed);
  const game = createGame(`SIM${seed}`, participants(mode), mode, random);
  let turns = 0;
  while (game.phase !== 'FINISHED' && turns < 800) {
    playAction(game, random);
    assertInvariants(game);
    turns += 1;
  }
  expect(game.phase, `mode=${mode}, seed=${seed}`).toBe('FINISHED');
  expect(game.winnerIds.length).toBeGreaterThan(0);
  expect(game.players.some((player) => player.prestige >= 15)).toBe(true);
  return { turns, rounds: game.round, winners: game.winnerIds.length };
}

describe('full-game randomized simulation', () => {
  for (const mode of [2, 3, 4] as RoomMode[]) {
    it(`finishes 12 complete ${mode}-player games without invariant violations`, () => {
      const results = Array.from({ length: 12 }, (_, index) => simulate(mode, mode * 1000 + index));
      expect(Math.max(...results.map((result) => result.turns))).toBeLessThan(800);
    });
  }
});
